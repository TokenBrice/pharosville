# GPU initialization / first-render stall — GPUINIT

## 1. Scope and method

Research only. No tracked runtime files, assets, shared servers, or `dist/` were changed. Read `00-BRIEF.md`, `AGENTS.md`, architecture/testing/runtime facts, Engine/PostChain, all shader-hook locations, GPU bakes, ground/picking/governor, sky, emblem/SDF/image-loading paths, and installed three r186/postprocessing implementations. Scratch evidence is under `outputs/need-for-speed/gpuinit/`.

Six short real-GPU captures used the mandated runner: three original baseline (`run1–3`) and three runtime-only correct-target experiments (`correct1–3`), default RTX profile, existing dist origin `http://127.0.0.1:4173/`,1600×1000@1,500ms wait,3seconds steady sampling. The second batch ran only after the load/frame owners released priority. This is the no-API scene, **not** production data loading. All CPU/GL submission timings are **contended**; these runs reuse the persistent browser/driver shader caches. Instrumentation adds overhead, so these are attribution measurements, not new uncontended product baselines.

Command shape (the JS arguments are the contents of the named scratch files):

```text
npm run preview -- --url http://127.0.0.1:4173/ --seconds 3 --wait 500
  --out outputs/need-for-speed/gpuinit/runN.png
  --json outputs/need-for-speed/gpuinit/runN.json
  --init-script <init.js> --eval <census.js>
# run1 additionally:
  --profile outputs/need-for-speed/gpuinit/run1.cpuprofile
```

`init.js` hooks WebGL2 calls before navigation and wraps Engine's renderer/composer via the existing `window.__harbour` publication. It records call wall time (submission + any blocking wait, **not GPU execution time**) until the first composer render finishes. `census.js` inventories `renderer.info.programs`, complete cache keys, scene material→program references and texture dimensions. Baseline aggregation is saved in `summary.json`. The hook was then expanded to time shader info logs; `correct1–3` use this expanded hook plus `window.__GPUINIT_CORRECT_TARGET=true`, which binds `composer.inputBuffer` around every scene compile and restores the previous target. This is a runtime-only experiment, not a source/worktree patch. The first three captures did not wrap info logs; the later three directly measure them. The standard `--trace` starts only in steady state, so a navigation CPU profile plus pre-navigation hooks was used instead. Baseline `run1.png` and corrected `correct2.png` were inspected: both show the expected awaiting-data/fog scene. Time/weather are unpinned, so no pixel-equality assertion is made.

## 2. Measurements and causal breakdown

### Three repeat startup captures (ms, contended)

| Measurement | Run 1 | Run 2 | Run 3 | Median |
|---|---:|---:|---:|---:|
| Navigation → first observed live frame | 1713 | 4773 | 4367 | 4367 |
| Engine construction → first frame | 1214 | 3741 | 3642 | 3642 |
| Existing scene precompile (`boot.compile`) | 31 | 140 | 134 | 134 |
| First composer render (`u:render`, higher resolution hook) | 159.6 | 669.0 | 556.8 | **556.8** |
| Main world renderer.render, including shadow render | 141.5 | 572.5 | 460.8 | **460.8** |
| Sum of subsequent post renderer.render calls | 16.0 | 92.2 | 82.7 | **82.7** |
| Texture upload calls inside first composer | 48.3 | 218.2 | 160.7 | **160.7** |
| Program status queries inside first composer, excluding info logs | 6.1 | 6.4 | 8.5 | **6.4** |
| `bufferData` inside first composer (206 calls) | 1.7 | 28.1 | 6.1 | **6.1** |
| `generateMipmap` submission inside first composer (3 calls) | 0.0 | 0.1 | 0.0 | **0.0** |
| App `readPixels` inside first composer | **0** | **0** | **0** | **0** |
| Earlier island height-field `readPixels` | 20.0 | 56.3 | 47.9 | **47.9** |
| Resident programs / textures / draw calls after deferred init | 97 / 51 / 97 | 97 / 51 / 97 | 97 / 51 / 97 | same |
| `KHR_parallel_shader_compile` availability | false | false | false | false |

Rows overlap: the texture/query/buffer rows are contained within renderer calls; medians are not additive decompositions. GL timer resolution occasionally reports 0.0 for nonzero work. No program shader execution timing was obtained.

**Where does the reported 1942 ms go?** The supplied initial run is ground truth, but that exact stall did not recur in these warmed-driver captures. It cannot honestly be retroactively split into exact cold link/upload milliseconds without its startup trace/profile. The new evidence establishes:

1. It is not a 1.9-second per-frame cost: the new first composers are 160–669 ms under shared-machine contention, while steady stats are ~0.9 ms GPU on this no-data scene. Driver cache state and contention matter greatly.
2. The main world/shadow render dominates (median 460.8/556.8 ms), not just the post chain.
3. Large uploads are real and directly measured (median 160.7 ms); no synchronous application readPixels occurs in this measured render interval.
4. Shader first-use synchronization remains real despite a `compile` boot entry. Installed three `WebGLProgram.js:863-879` queries **getProgramInfoLog/getShaderInfoLog before LINK_STATUS**, then reflects uniforms/attributes (`953-984`). The original hook did not time those log calls. In `run1.cpuprofile`, the matching minified function `M` at vendor column 475716 resolves exactly to `onFirstUse`'s diagnostic queries. A ~160 ms sample window beginning at the first composer stack contains approximately **54.2 ms self time in this function**, versus 48.3 ms explicitly timed texture uploads and 6.1 ms status-query submission. This is sampled attribution, not an exact duration or cold-driver measurement; it must not be combined as independent CPU/GPU execution times.
5. The existing precompile selects the **wrong framebuffer/output-colour variant**. This is the concrete root-cause improvement; it explains 34 redundant resident program variants, including the late systems.

### Correct-target experiment: measured reduction and complete GL-call attribution

Three runtime-only experiments changed only scene-compile framebuffer selection (same renderer colour output, world/post settings and draw pipeline). KHR remained unavailable. These are sequential **contended A/B batches**, not randomized quiet timings; the stable program/link-count changes are stronger causal evidence than the absolute time difference.

| Measurement | Correct1 | Correct2 | Correct3 | Median |
|---|---:|---:|---:|---:|
| First composer render ms |426.2|353.4|333.6|**353.4**|
| Boot compile ms |130|143|92|130|
| Resident programs |63|63|63|**63**|
| New links inside first composer |13|13|13|**13**|
| Info-log query ms (`getProgramInfoLog` + `getShaderInfoLog`) |114.0|106.6|132.1|**114.0**|
| Texture allocation/upload call ms |219.7|138.0|91.2|138.0|
| Geometry `bufferData` ms |3.5|7.0|6.8|6.8|
| All instrumented GL calls ms |346.9|266.2|247.1|266.2|
| Engine → first frame ms |2811|2812|2980|2812|

Measured resident count falls **97→63 in all three runs**; first-composer link count falls **36→13**. First-composer median falls556.8→353.4ms (**203.4ms /36.5%**); Engine first-frame median3642→2812ms. Neither timing delta is an isolated product speedup claim: contention and upload timings changed between batches. The cause/count effect is nevertheless deterministic.

The expanded instrumentation yields an additive wall-call decomposition for `correct2`'s353.4ms composer: **106.6ms shader info-log waits +138.0ms texture calls +7.0ms bufferData +14.6ms other instrumented GL calls +87.2ms remaining JS/reflection/bookkeeping/instrumentation**. No PMREM and no app readPixels occur in this interval. `getProgramInfoLog`90.1/75.7/103.2ms and `getShaderInfoLog`23.9/30.9/28.9ms establish the actual first-use synchronization point; near-zero compileShader/linkProgram submission does **not** mean compilation itself is free. This is a measured first-render breakdown, not a retroactive decomposition of the original1942ms.

### Why compile does not prepare the first draw

- Engine `engine.ts:139-143` compiles the world scene with the default framebuffer bound. Renderer canvas output is sRGB (`71-77`). PostChain renders the world to its half-float composer buffer (`engine.ts:83-84`, `post.ts:145`).
- Three derives program output color space from current render target (`WebGLRenderer.js:2377-2378`), and changes program when it differs (`2432-2434`). Installed compile delegates to material preparation in the same current framebuffer state (`1396-1492`).
- Measured `hb_kit` programs10/42 have cache keys identical **except token4 = `srgb` versus `srgb-linear`** (zero-based index). Sky/ocean shaders differ at token3 instead; basic/define-bearing shaders place it elsewhere. Comparing every complete key finds **97→63** unique keys: **34/97 (35.1%) are framebuffer-space pairs**. Every one of the34 pairs differs in exactly one token whose values are `srgb` and `srgb-linear`; per-pair proof is in `program-pairs.json`. The runtime experiment independently confirms **63 actual resident programs in all three corrected captures**, not merely a normalized-key prediction.
- The final compile traverses **all objects, including invisible ones** (`WebGLRenderer.js:1460-1492`), so inactive weather/selection shaders inflate resident count without corresponding draws. Therefore 97 draws = 97 programs is coincidental, not one independent material per draw.
- `compileAsync` is already used **when the extension exists**, only for the main world scene (`engine.ts:141`). This GPU capture lacks KHR, so actual calls are `compile`, not compileAsync. Merely recommending “use compileAsync” would re-propose shipped code and would not solve this machine's stall.
- Deferred life/identity use plain `compile` with the same wrong default target (`engine.ts:150-165`). Main-scene precompile does not traverse composer scenes, sky-band/wake/light-pool private scenes or classic shadow-depth materials. Three's compile path only invokes shadowMap.render for the node-material handler (`1452-1454`), not this classic material stack. The first composer creates **36 additional linkProgram calls**.

### Reused iGPU evidence: shader first-use waits can escape boot

The frame-measurement owner supplied `outputs/need-for-speed/frame/diagnostics/igpu-winter-storm-r1.{json,cpuprofile}`; these artifacts were read/aggregated, not recaptured. This is **one contended diagnostic**, not a three-run median, at1600×1000@1 on AMD Raphael ANGLE/GL, winter DANGER overview. The JSON reports first composer951ms, precompile986ms, a later measured max frame4469.3ms, quality transitions at~14.76s and28.66s, and140 actual resident programs in its research renderer snapshot (the ordinary stats snapshot still reports78). Over the6.924s steady CPU profile, sampled self time is **4044.76ms getProgramInfoLog +428.65ms getShaderInfoLog**, plus2004.53ms uniformMatrix4fv. This independently proves that shader/driver synchronization, not solely texture upload, can dominate a multi-second **post-boot** stall on the iGPU path. The exact trigger (tier change, weather/season state, or material/late attribute transition) is not established by the sampled profile alone. Do not assign every wait to the governor without a before/after program-key log.

`PostChain.setQuality` changes bloom/SMAA settings (`post.ts:180-182`); quality tiers also change real point-light counts16/8/4 (`quality.ts:28-30`), which can change world shader defines. Governor explicitly anticipates tier-change recompiles (`governor.ts:90-95`). This makes targeted next-tier/next-state preparation a runtime counterpart to first-frame warm-up, not a reason to turn off diagnostics.

### Program census: complete 97-program accounting

IDs below are renderer program IDs from `run1.json`; all three captures agree on 97 total. “Space pair” means equal complete keys after changing only output sRGB↔linear token. Program names reflect the first material using a shared program and do not necessarily identify its only user.

| Material / pass family | Programs (IDs) | Count | Reason / normalization |
|---|---|---:|---|
| Weather fall, ground, lightning, rainbow | 4–7 | 4 | Four genuinely different shaders; compiled while inactive; only default-target variant resident in this scene. |
| Sky backdrop | 8,53 | 2 | One space pair. Sky reflection band is separate below. |
| Ocean material | 9,54 | 2 | One space pair, not separate shaders per boat/sea zone. |
| `hb_kit`, `hb_window`, `hb_emissive` | 10,42; 12,43; 11,41,77 | 7 | Kit and windows one space pair each; emissive one pair plus a real different attribute/layout variant. Normalize to four. Many island/civic meshes already share these. |
| Pharos mirror + tide brass; tide water | 14,45; 55,76 | 4 | Two space pairs. Brass and mirror already share exactly the same program. |
| Pharos fire core / flames / embers / glow / plume | 13,44; 15,61; 16,58; 17,63; 18,56 | 10 | Five distinct effects × two colour spaces. |
| Civic glow / crest / smoke / glints / flames / embers / coins / workers / boards | 19,47; 20,46; 21; 22,64; 23,62; 24,59; 25,48; 26,49; 27,50,78 | 18 | Eight space pairs + two other variants. Smoke shared across mint/burn. Embers/sawdust shared. Coin/fenders/crest-topmasts share programs. Boards have a real attribute/layout variant in addition to colour-space pair. |
| Fleet / mooring lines / riding lights / house flags / selection ring | 28,51; 29,52; 30;31;32 | 7 | Fleet+mooring each a pair; three inactive/different auxiliary shaders. Fleet is one shared material, not per-coin shaders. |
| Light sprites / light pillars / beam halo | 33,60;34,57;35,65 | 6 | Three space pairs. |
| Private sky-band / wake-decay / light-pool renders | 36–38 | 3 | Three real offscene shaders, first used in system updates before composer; mapping follows source render/update order. |
| Shadow depth variants | 39,40,84,94,95 | 5 | Necessary geometry/deformation/alpha variants; no observed colour-space pair. Deferred life/identity introduce later variants. |
| Post passes | 66–75 | 10 | Four EffectMaterial variants + scrub + luminance + bloom downsample + upsample + SMAA edge + weights. Not ten full world draws; private fullscreen scenes are not covered by scene compile. |
| Life folk / gull / smoke / drift / flags | 79,85;80,86;81,89;82,87;83,88 | 10 | Five space pairs, created after first frame. |
| Identity lettering halo/body / crest flags / pier marks / office crest | 90,99;91,100;92,97;93,98;96 | 9 | Four space pairs + one unique textured office material. Lettering's HALO_PASS define is intentional. |
| **Total** | **4–100 inclusive** | **97** | **63 after eliminating only observed colour-space duplication**. |

Shader-hook source audit: world `materials.ts:519-603,610-639,650-754`, fleet `fleet-material.ts:388-438`, life `figure-kit.ts:96-121`, civic `boards.ts:56-68` and `fx.ts:379-386` already assign explicit stable customProgramCacheKeys. Kit caches material by side/pattern and stores pattern ID in vertex colour alpha, not per-object defines. Its leaf/bare key is intentional season-dependent shader code. Fleet stores per-boat values in textures. No evidence supports replacing these with a new generic per-instance uniform-texture layer simply to cure the 97 count. Pure ShaderMaterials using default onBeforeCompile identity are keyed by shader source by three; this is not in itself a duplication bug.

### Texture upload census

There are 51 renderer textures **including render-target attachments**; not 51 large downloaded bitmap images. First composer has 12 texSubImage2D uploads, 22 texImage2D allocation calls, 16 texStorage2D calls, one LUT 3D upload, and three mip-generation submissions.

| Resource | Dimensions / decoded storage | First upload ms run1 / run2 / run3 (median) | Path / flags |
|---|---|---|---|
| Fleet emblems CanvasTexture | 4096×2688 RGBA8, **42 MiB** base / ~56 MiB with mips | 25.0 / 137.2 / 105.2 (**105.2**) | `fleet/emblems.ts:39-57`; canvas, sRGB, flipY true, premultiplied, mipmapped. This is the initial placeholder/roundel canvas, **before logo image decode**. |
| Civic board CanvasTexture | 2048² RGBA8, **16 MiB** base / ~21.3 MiB with mips | 16.0 / 45.7 / 39.7 (**39.7**) | `civic/boards.ts:45-55`; default GPU-backed 2D canvas, sRGB, mipmapped, used as both map/emissiveMap. |
| Sea SDF DataTexture | 2048² RGBA8, **16 MiB** base / ~21.3 MiB with mips | 6.0 / 31.6 / 13.6 (**13.6**) | `ocean-system.ts:79-83,137-141`; no colour space, no premultiply, flipY false, mipmapped. Raw data/CPU coast samples must stay exact. |
| Height AO | 512² R16F = 0.5 MiB | 0.1 / 0.0 / 0.1 (**0.1**) | `world/ground.ts:20-34`; linear, no mips. |
| Zones | 512² RGBA8 = 1 MiB | 0.0 / 0.2 / 0.2 (**0.2**) | `ocean/zone-mask.ts`; linear/no mips. |
| Small fleet data / batching / lookup textures | 16² RG16F; 80² RGBA32F;39² integer;256×12 and256×30 RGBA32F | individual medians ≤0.1 | Different typed data resources, not photographic atlas work. |
| SMAA search/area images | 64×16;160×560 | area 1.1 /2.9 /1.1 (**1.1**); search ~0 | Postprocessing-owned lookup images. |
| Grade LUT | 32³ RGBA16F = 0.25 MiB | submission rounds to0 in these captures | `post.ts:150-157`; 3D texture, no mip pyramid. |

Additional relevant resident RTs: pool2048²RGBA16F, cloud atlas2048×1024RGBA8+mips, noise256²RGBA8+mips, ripple512²RGBA8+mips, sky band512×128RGBA16F+mips, ground1024²RGBA32F+depth, wake2048²R16F history plus2048²RGBA8 live. GPU bakes stay GPU-side (`gpu-bake.ts:52-68`) and do not readPixels. No PMREM/cube environment generation exists in this source path: sky is a painted card plus a512×128 reflection band, not a cubemap.

`createImageBitmap` is already used for the logo decode (`emblems.ts:78`), but the result is drawn into a large canvas and then closed (`84-91`): this does **not** eliminate the canvas's later WebGL upload/readback. `AssetStore.texture` still uses TextureLoader/HTMLImageElement (`assets.ts:68-75`). Any ImageBitmap migration must bake flipY and alpha premultiplication at bitmap creation, since changing THREE.Texture flags does not retroactively transform ImageBitmap pixels. The SDF bitmap path already requests no colour conversion/premultiplication and uses CPU `willReadFrequently` canvas (`sdf-image.ts:22-31`); do not replace it with an image-only compressed GPU texture without preserving the exact CPU coast channel.

### ReadPixels inventory and warning interpretation

| Location | When / data | Sync on frame path? | Appropriate alternative |
|---|---|---|---|
| `world/ground.ts:75-76` via `island-system.ts:55` | One1024²RGBA Float32 read, **16 MiB**, then retain R-only4 MiB CPU field. Measured20/56.3/47.9ms before first frame. | Synchronous **boot**, not composer/steady frame. | Bake exact matching height data offline; or use existing `renderer.readRenderTargetPixelsAsync`, overlap independent CPU init. Async implementation already uses PIXEL_PACK_BUFFER/fenceSync/flush/poll/getBufferSubData (`WebGLRenderer.js:3261-3284`); do not hand-roll it. |
| `ocean/gpu-bake.ts` | One-off shader draws into RTs | **No readback** | Keep GPU resident. |
| `ui/picking.ts:1-5,93-118,180-186` | Analytic projected hull/building segments + CPU ground height field | **No GPU readback** | Already avoids GPU ID picking/raycast scene walks. PBO picking would add work, not remove the warning. |
| `engine/governor.ts:103-127` | Disjoint GPU query availability/result | **No readPixels**; checks availability before result | Keep asynchronous query polling. |
| `ocean/sdf-image.ts:24-31` | getImageData on explicitly CPU-backed 2D canvas | Not a WebGL readPixels call | Preserve exact CPU data; unrelated to GPU bake warning. |
| Browser/capture internals and GPU-backed canvas→WebGL upload | Possible implementation-internal reads | Not source-level app readPixels | Console wording is not a callsite inventory. Original repeated warnings cannot all be attributed to the one explicit boot readback; the new captures emitted no ReadPixels warning at all. |

The ground GPU texture is genuinely used by light pillars (`lights-system.ts:172,200-202`), so deleting it after CPU extraction would break land masking. The RT handle is not retained/disposed by GroundService (`ground.ts:95-96`, `island-system.ts:77-81`), an ownership/memory opportunity, not evidence that the texture is unused.

## 3. Findings / prioritized opportunities

Expected gains below are `[estimate]` unless explicitly described as a measured call cost or exact census reduction. They are not additive: dedupe, warm-up, compressed atlases and staged uploads overlap.

| ID | Opportunity | Evidence | Proposed change | Expected gain (quantified; method) | Visual impact / verification | Effort | Risk | Dependencies / conflicts | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| **GPUINIT-01** | **Compile the variant actually rendered** | `engine.ts:139-143,164`;34 output-colour pairs; runtime3×baseline97 vs3×corrected63, first-composer links36→13 | Bind composer input target around main-scene compile/compileAsync, restore in finally. Apply to deferred compile too. Do not change renderer's sRGB output globally. | **Measured34 fewer programs /35.1%**. Contended first-composer medians556.8→353.4ms (**203.4ms lower**, not isolated speedup); `[estimate]` **30–130ms less total warm startup CPU** from eliminating wrong-variant work, based on baseline precompile31/140/134ms. Driver-cold gains unmeasured. | **None**, compile state only. Correct2 image inspected; require same-hour pixel comparison, later life/identity/weather and last screen-pass check. | S | Low–medium; target state must restore; final screen pass remains sRGB | Engine boot; coordinate BOOT/load plan. No per-object material rewrite. | **H** cause/count; M time |
| **GPUINIT-02** | **Stop making the initial emblem roundel layer a42MiB upload** | emblems39-57; initial canvas upload median105.2ms **before** deferred logo image; 4096×2688 | Compact live slots / smaller measured-resolution tiles; or immutable logo atlas plus compact dynamic monogram/placeholder atlas and indirection. Evaluate GPU-native compressed static atlas with precomputed mip chain for immutable logos only. Preserve stable slot mapping semantics/UVs. | `[estimate]` **50–100ms first-render submission saved** if50–90% of measured105.2ms canvas upload is removed; ~28–50MiB GPU saving at same ratio. Geometry/UV compatibility is required, not assumed. | **Marginal** for reduced dimensions / lossy compression: inspect sails/brand marks at maximum zoom, fogless noon/night, mip boundaries; none if only removes unused texels at equal tile resolution. | M–L | Medium: logo arrivals/monograms, alpha edges, colour space, KTX2 transcode/device support | Shared with IMAGES/atlas slice; don't combine both estimates as separate wins | H bytes/cost; M gain |
| **GPUINIT-03** | **Prepare all first-use pipeline work, not just scene programs** | First composer36 new links;82.7ms median post draws; sky/wake/pool private scenes; five shadow-depth variants | After seal and final light/layout setup, expose explicit warm-up entries for post/private scenes and shadow materials with real framebuffer states; use compileAsync only with real KHR support. Stage actual render-target allocation/texture initialization behind existing poster, starting independent work during network waits. Keep a complete hidden warm-up render as coverage check, not an extra serial mandatory frame that merely renames u:render. | `[estimate]` **30–100ms first-visible-frame stall reduction** on warmed capture (bounded by82.7ms measured post draws plus private/depth first-use); **0ms total-load improvement if simply moved serially**. Additional total wall savings bounded by actual independent network wait available, not claimed1.9s. | **None** for same pipeline state; verify no simulation-clock advance, no poster reveal before current gate, same quality/exposure/state and screen colour output. | M | Medium: warm-up itself may block without KHR; internal effect materials mutate; final SMAA is screen-space variant | GPUINIT-01 first. BOOT owns scheduling; shader/POST owners expose coverage. | H missing coverage; M gain |
| **GPUINIT-04** | **Pre-initialize/stage bulky uploads, remove GPU-backed-canvas round trips where useful** | Measured first uploads160.7ms median; civic board39.7ms, emblem105.2ms, SDF13.6ms; no initTexture use found | Call renderer.initTexture on ready final-version textures in an explicit boot queue; stage after assets complete while other work/network continues. Compare civic board CPU-backed canvas or properly flipped/premultiplied ImageBitmap snapshot; no blanket ImageBitmap rewrite. Avoid uploading a canvas immediately before resizing/updating it again. | `[estimate]` **40–150ms moved out of first composer** for these textures; **0–100ms total wall saved**, only when overlapped or canvas conversion avoided. Serial initTexture alone cannot make GPU transfer disappear. Civic upload measured upper target39.7ms median. | **None** for same pixels; bitmap premultiply/flip changes require sail/board alpha and colour comparison. | M | Medium: synchronous driver upload can still monopolize a frame; stale versions could cause double uploads | GPUINIT-02 / IMAGES overlap; BOOT queue must not compete with critical downloads | H cost; M scheduling gain |
| **GPUINIT-05** | **Remove the one synchronous boot height-field readback** | renderGround75-85;16MiB readback median47.9ms plus scene/CPU reduction | Prefer offline bake for static island using identical mesh/transform/bounds/camera conventions and exact float data; runtime still exposes same GroundService. Alternatively split render and consume phases and use existing three async readback while independent civic/fleet CPU init runs. Retain correct GPU mask/texture ownership. | `[estimate]` **20–55ms main-thread blocking removed**, based on measured20–56.3ms. Offline variant also removes height renderer draw/alloc (~26ms run1 complete ground draw); async variant may save **0ms total** if immediately awaited. Offline payload/decoding may trade bandwidth. | **None** only with equal field; compare height samples/bounds/roof max pooling and light-pillar land mask; half-float precision changes are **visual-risk** until verified | M | Medium: field drives picking/placements/light masking; exact transform contract essential | GLB/layout preprocessing; coordinate pipeline/world slice. Offline data must version with island. | H sync inventory; M net gain |
| **GPUINIT-06** | **Give the ground RT an owner and lean retained representation** | ground41,95-96 loses RT handle; lights really uses texture172 | Keep/dispose RT explicitly. After CPU extraction, consider retained R32F/R16F height texture and dispose RGBA32F+depth target; do not destroy the live texture without replacement. | Exact current base allocation ~**20MiB** (16MiB colour + ~4MiB depth); `[estimate]` **16–18MiB retained GPU memory reduction** using4/2MiB R texture; extra upload may cost1–10ms once, so this is primarily memory/lifecycle, not a first-frame speed claim. | **None** for R32F equivalent; **visual-risk** for R16F near shoreline threshold0.15m—compare pillar masks/heights | M | Medium: float read/render/filterability; dispose timing; potential extra upload | Pipeline/world lifecycle slice; GPUINIT-05 may supersede | H allocation/ownership; M representation |
| **GPUINIT-07** | **Keep inactive future-state shaders off the hard startup compilation batch** | Weather4, fleet auxiliaries3, smoke and transient board/attribute variants appear resident without current draws; three compile traverses invisible | After correct-target warm-up, compile first-visible material set first; warm inactive weather/selection variants in bounded idle work before weather/user activation. Preserve geometry/deformation/season-specific real variants. | `[estimate]` **2–20ms startup CPU** by moving ~4–8 small inactive program preparations at~0.5–2.5ms/program; not guaranteed a net total-work saving. No removal of actual scenery/data effects. | **None**, provided future state activation cannot hitch; verify storm/snow/select after immediate interaction and slow CPU | M | Medium: late compile hitches if scheduled too late; prewarm future state must use real lights/attributes | GPUINIT-01/03; should not duplicate a generic idle/boot scheduler | M |
| **GPUINIT-08** | **Prewarm actual next-tier / next-state variants before runtime activation** | Reused winter-storm iGPU diagnostic has4473.41ms sampled shader info-log self time over6.924s;4469.3ms max frame; governor tier changes; post/point-light shader settings vary | Log before/after program keys to identify trigger; prepare the impending tier/weather/late-material variant with real target/light/attribute state before committing it. Reuse one bounded warm-up path; do not compile every possible state serially during boot or suppress diagnostics. | `[estimate]` **0.1–4.5s activation-hitch avoidance** on affected iGPU/driver-cold transitions, bounded by the observed single4.47s shader-wait diagnostic; no steady-frame or total-work reduction promised. Needs repeatable trigger A/B. | **None**, same eventual tier/art/state; verify immediate weather/season activation and governor downshift keep correct analytical effects. | M | Medium–high: extension-less compile may itself block; preparing cloned state must not disturb live scene | GPUINIT-01/03/07; FRAME/governor slice; key-event instrumentation required before implementation | H waits observed; L trigger/gain |

### Recommended warm-up ordering

1. Finish final light counts/material geometry state before compiling its variants. Early layouts/materials may be prepared while bytes are pending, but do not compile against incomplete light definitions and create a second cache variant.
2. Set the intended composer RT; prepare main visible world variants. Use compileAsync with KHR where available. On extension-less driver, do not assume a resolved Promise proves GPU completion (three's isReady returns true immediately without KHR: WebGLProgram992-1005).
3. Initialize final ready textures incrementally during real independent waits. RT allocations and geometry upload need real preparation/render work; compile by itself uploads neither all geometry nor all sampled images.
4. Cover shadow depth + offscene systems + composer internal effect draws, including last-to-screen SMAA's default-target variant. PMREM is absent; do not add a fictitious environment stage.
5. Existing poster remains until existing first-frame/data gate. Use same warm-up rules for deferred life/identity, not `compile` on the default framebuffer after each init. Do not advance world clocks merely to warm shaders.
6. Record first-visible draw *and total time to live scene*. A lower u:render with an equally longer `warmup` boot entry is smoother perceived loading, not a proven loading-time win.

## 4. Ruled out / not worth it

- **“Switch to compileAsync.”** Already shipped conditionally; KHR is unavailable on this capture. Missing scene coverage and wrong target are the problems.
- **“97 draws imply97 per-object materials; add per-instance uniform textures everywhere.”** False. Program cache-key evidence finds34 colour-space pairs; sharing is already extensive. Programs survive after materials change, and invisible precompiles count without draws.
- **“Picking's readPixels is causing runtime stalls.”** Picking is already analytic/CPU and never calls readPixels. A GPU ID pass or full mesh raycaster is a regression for this problem.
- **“GPU bake reads back all procedural textures / PMREM stalls.”** GPU bakes stay in RTs, and there is no runtime PMREM/cubemap environment generation in the examined source.
- **Disable diagnostics to hide the shader stall.** Info-log queries expose completion waits, but uniform/attribute reflection and first draw still need linked programs. Removing shader errors is symptom suppression, not a real optimization.
- **Remove mipmaps globally.** Only≤0.1ms submission measured here, not GPU mip-generation duration; this does not prove mips are free. Removing them risks shimmer on sails/boards/sea and worsens minification. Precomputed mips on immutable compressed artwork are preferable; dynamic/analytic/data textures need separate treatment.
- **KTX2 for every texture / SDF lossy compression.** Most51 textures are RTs or live data, not compressible static pictures. The SDF's CPU coast data is semantic; lossy channel changes can affect boat routes/land masks. Compressed immutable art only, with separate dynamic roundels, is a viable atlas project.
- **Delete the ground GPU texture.** It is consumed by pillars; keep a live equivalent and proper lifecycle ownership.
- **Blind createImageBitmap migration.** Emblems already decode through it; the expensive first upload is a generated canvas before logos arrive. A bitmap wrapper alone does not remove a42MiB transfer, and flipY/premultiplication are easy to break.
- **Just call initTexture synchronously before render.** It moves a stopwatch category, not total work. Gains require overlap/staging, less decoded data, or elimination of a conversion/duplicate upload.

## 5. Open questions / remaining evidence

- The exact original **1942ms** first-render split is unavailable: the original sample exists at `outputs/need-for-speed/smoke.json:70`, but no matching navigation profile was found among the saved research CPU profiles. Its startup trace/profile is needed, or a dedicated reproducible driver-cold capture. HTTP `--cold` does not clear the persistent GPU shader/translation cache. Do not claim the measured warm medians decompose that original figure.
- Correct-target runtime experiment is complete (three runs,97→63 actual programs,36→13 first-composer links). Quiet randomized total-load timing and same-hour visual equivalence remain unmeasured; the observed203.4ms median first-composer reduction must not be used as a guaranteed product speedup.
- Need iGPU/other browser KHR availability and startup costs before promising parallel-compile gains across devices. Different profile, renderer and cache states must not be pooled into one median.
- Atlas operator choice: preserving equal tile resolution with compact slots is none-impact; smaller tiles/compression require maximum-zoom sail/board inspection. Initial-placeholder and final-logo uploads need separate measurements.
- Offline height map must be regenerated with island/layout revisions. Decide only after comparing transfer/decode cost against the~48ms measured synchronization and ownership simplification.

No build, lint, formatter, test suite, server restart or tracked-code spike was run. The deliverable is the report plus measured scratch artifacts; no implementation is claimed.
