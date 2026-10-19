# SP-HITCH — shader first-use / runtime transition verification

## 1. Verdict and scope

**The 4.47-second symptom is reproducible, but disabling shader diagnostics is not its fix.** In three production-build iGPU runs, Medium→Low created **23 programs** and the median longest synchronous engine frame was **4,405.7 ms**. The correct-target + diagnostics-off prototype still created 23 programs and stalled **6,085.1 ms**: the wait moved from info-log queries to program reflection. This is a negative optimization result, not a 6-second improvement.

**Keep GPUINIT-01, but expand its implementation contract.** Correct composer-target compilation removed **36 resident programs after deferred readiness: 134→98** in this data-bearing, winter, Medium-start scene. It did not reduce the first-frame program count (77), because boot also compiles with the wrong **point-light count**: all 16 pool lights are visible until the first LightsSystem update hides the excess to 8. The phase-1 no-data/High result 97→63 remains valid for that different scene; it is not the count expected here.

**New avoidable churn:** changing bloom mip levels disposes its shader materials, not only render targets. A return to an already-seen Medium tier still recreated DownsamplingMaterial and UpsamplingMaterial and cost a median **152.3 ms** with checks on. Fix this ownership bug before prewarming those programs, or the next tier publication destroys the warm programs.

Read the mandatory brief, AGENTS, p1 frame/gpuinit/boot/pipeline, Engine/PostChain/governor/quality, SunRig, LightsSystem, weather/season/materials, deferred/selection/cove/fog paths, installed three r186 renderer/program/shader-cache/shadow-map code, and installed postprocessing internals. A read-only scout independently audited the runtime triggers. No tracked main-checkout file was edited.

## 2. Method, artifacts and validity

Prototype creation and build:

```sh
npm run worktree:new -- nfs-sp-hitch --branch nfs/sp-hitch
ln -s /home/ahirice/Documents/git/pharosville/node_modules .worktrees/nfs-sp-hitch/node_modules
# Isolated dev origin was started on the assigned port:
npx vite --host 127.0.0.1 --port 5194 --strictPort
# In the worktree; NEVER npm run build and NEVER shared dist/:
npx vite build --outDir /home/ahirice/Documents/git/pharosville/outputs/need-for-speed/sp-hitch/dist
# Root, copied production-faithful server with its port changed to 5195:
NFS_DIST=outputs/need-for-speed/sp-hitch/dist node outputs/need-for-speed/sp-hitch/server.mjs
```

Capture shape, all through the mandated runner:

```sh
npm run preview -- --url 'http://127.0.0.1:5195/?view=overview&t=12.5&season=winter&dews=DANGER&weather=DANGER&quality=medium&dpr=1&intro=0&hitch=base' \
  --igpu --uncapped --seconds 3 --wait 100 --ready-timeout 120 \
  --init-script '<init.js>' --eval '<scenarios.js>' \
  --out outputs/need-for-speed/sp-hitch/base-1.png \
  --json outputs/need-for-speed/sp-hitch/base-1.json
```

- **12 attempts, 10 successful captures:** base×3, target-only×2, logs-off-only×2, both×3. Attempt 10 (`logs-off-3.log`) was refused with GPU identity `none`; attempt 11 (`target-3.log`) timed out readiness and then failed explicitly with `Missing engine`. Those are not measured samples. The final permitted attempt supplied base-3. No further capture was made. Target-only / logs-off-only are exploratory n=2, **not three-run medians**.
- All successful captures report **AMD Raphael / ANGLE OpenGL ES 3.2** and **KHR_parallel_shader_compile=true**. This differs from p1's RTX capture where KHR was unavailable. The production origin serves the built app and real same-origin Pages API proxy, not the no-API :4173 scene.
- **All timings contended.** Warm persistent browser/driver profile; no driver-cache clearing claim. Run order interleaved variants, with the last baseline separated by two failed attempts. Network/API model-install races and cache state still confound total startup time.
- `init.js` wraps `renderer.render/compile`, inventories complete `renderer.info.programs` keys/IDs after each call, and records the count and synchronous duration of **every engine frame**. GL link and info-log/query/reflection call wall times are logged. New-ID detection catches eviction/recreation even when resident count does not increase. Creation events carry their enclosing renderer call's start/duration; link calls have their own timestamps. These are CPU/GL submission + synchronization times, **not GPU execution times**.
- `scenarios.js` waits for all systems ready, stops the automatic loop, then drives three normal `Engine.frame` calls per transition with 100-ms simulation deltas. Governor `.set()` follows the real publication path. The phase maximum is the maximum **synchronous engine frame** of those three, not a rAF interval distribution. Tier/light/shadow cadence still runs. DPR setup is measured separately because resizing happens before the first driven frame.
- The capture tool's final `fps/p50/p95/max` are **invalid for this experiment**: its rAF-only sampling happens after the engine is intentionally stopped. Use `evalResult.frames/phases`, not the top-level frame statistics. No steady FPS gain is claimed.
- Important control correction: `dews/weather/strike/stale` readings overrides are **DEV-only** (`readings-system.ts:76–77`, `weather-system.ts:95`). Their presence in the production URL does not guarantee winter DANGER. The production probes retain real API weather, then force the three hidden weather objects visible to test first-use programs. This is a shader-coverage probe, **not a faithful DANGER/lightning visual scene**. The winter calendar override is active. The original winter-DANGER p1 profile is corroborating evidence, not silently relabelled as these captures.
- `season-leafy-to-bare` is a historical script label: it rewrites already-winter uniforms and is only a no-invalidation control, **not a measured live seasonal boundary**. Cove was `done` in every aggregate run, but the extra cove phase is a settled no-change control; first cove focus/wreath activation was not captured.

Artifacts under `outputs/need-for-speed/sp-hitch/`: `spike.patch`, built `dist/`, `init.js`, `scenarios.js`, `run.mjs`, repeat runners/logs, individual JSON/PNG files, `analyze.mjs`, `summary.json`, `derived.json`, and the isolated-origin server. Both owned servers were stopped; the worktree and branch were removed after saving the diff. The patch was generated against HEAD **b71dd282**. One isolated Vite production build succeeded (upstream annotation/chunk warnings); no lint/formatter/full suite ran.

## 3. Measurements

### 3.1 Boot and program census

Milliseconds; n=3 **contended medians** unless individual values shown. “Both” = correct composer target for boot/deferred compilation + `checkShaderErrors=false`; it is not next-tier prewarming.

|Metric|Baseline|Both|Interpretation|
|---|---:|---:|---|
|Navigation→first observed frame|3,899|2,591|Not an isolated loading win; model-install race differs|
|Engine construction→first frame|2,751|2,208|Same confound|
|Boot compile|138|102|All three main world compiles already use compileAsync on this iGPU|
|First composer `u:render`|416|375|41 ms lower in this noisy comparison; not the p1 203-ms promise|
|First complete engine frame `boot.firstRender`|1,715|455|Mostly confounded by `u:data`, not shader improvement|
|First data update, individual runs|1,233 / 8 / 1,288|2 / 3 / 253|Why total first-frame delta cannot be attributed to this patch|
|First ocean update|1|1|The p1 multi-second first-wake stall did not reproduce here|
|Resident programs at first frame|77|77|Wrong initial light count remains|
|Resident programs after all systems ready|134|98|**36 fewer in every run**, reliable count effect|
|Resident programs after all probes|181|132|Includes different activation/tier histories; not a boot-only count|
|Info-log wall calls inside first engine frame|366.7|0|Checks off removes these calls, not all synchronization|
|Program-parameter wall calls inside first engine frame|2.3|328.7|Wait moves to reflection/status access|
|Worst driven transition frame|4,405.7|6,085.1|**Hitch not fixed**; both is worse in this comparison|

First composer individual values: base **416/370/1,318**, both **354/390/375**. Target-only n=2: **440/363**, all-ready programs **98/98**. Logs-off-only n=2: **399/417**, all-ready programs **134/134**. Do not fabricate a third repeat or turn either two-sample set into a median gain.

Full-key cross-check saved in `space-pairs.json`: baseline boot/readiness IDs (excluding four disposed one-off bake programs) contain134 keys that normalize to98 when only sRGB↔linear output-space tokens are normalized: **36 pairs**. Target-only and both each contain98 keys and0 such pairs. This independently attributes the resident-count reduction to output-space duplication, rather than relying only on count arithmetic.

### 3.2 Trigger table — counts and stalls

Counts are newly observed **program IDs**, not net resident growth. Times are median of each run's maximum of three driven engine frames, n=3, contended. Timings include any back-pressure and other work in that frame. Source-only/unexercised rows are marked explicitly.

|Trigger|New programs: baseline → both|Measured frame stall baseline → both, ms|Cause / interpretation|
|---|---:|---:|---|
|Medium→Low|23→23 in all repeats|**4,405.7→6,085.1**|16 lit world variants + 3 classic depth variants + 2 SMAA variants + 2 evicted/recreated bloom shaders. Main culprit is point-light-count variant activation, not shadow type or DPR. The 16 lit families include kit/window/fleet/life/civic/identity/tide materials.|
|Low→High|22→13|1,325.6→155.4|Correct-target boot has already prepared some 16-light variants; deferred life/identity still require High variants. Also includes 3 depth + SMAA + bloom changes. Composite timing is not an isolated diagnostics win.|
|High→already-seen Medium|2→2|152.3→201.3|Only DownsamplingMaterial and UpsamplingMaterial are new: bloom destroys the otherwise-reusable programs. Net resident count is unchanged.|
|DPR-only, 1→1.25|0→0|4.7→4.8 driven frame; **setup 37.2→113.1**|Target reallocation/resize costs happen in setup; no new keys. Final tier still Medium. Do not attribute resize stalls to shader compilation.|
|Forced first weather-object draws|4→1|416.7→39.9|Baseline adds bolt/ground/rainbow + one incidental depth variant; corrected-target mode adds only that depth variant. Rain/snow amount is uniform-driven, not a new weather define. Fall was already drawn before this probe.|
|First boat selection|1→0|274.9→5.0|Ring exists at boot; baseline warmed its default-framebuffer variant, not actual offscreen variant. Correct target removes new ring link; checks-on target-only still spent 275/352 ms in first-use logs despite **zero new program IDs**. New links are not the only first-use synchronization hazard.|
|Winter uniform rewrite control|0→0|4.7→3.4|Not a true cross-season boundary; no material invalidation requested. See HB_BARE source finding below.|
|First enabled stale-fog effect|1→1|537.9→21.6|Disabled composer pass is outside scene compile. Still creates EffectMaterial in both; diagnostics strongly affect this warmed first use, but cold tier case disproves a blanket cure.|
|Cove settled control|0→0|4.8→3.5|Cove load was already complete. Does **not** establish no cold wreath/first-focus cost.|
|Deferred life/identity and office panel|Observed in startup event stream; not isolated repeats|[unmeasured isolated gain]|Example both-1: first frame77 programs; life compile89; identity compile94; late `identity_crest_panel` draw95; subsequent depth variants98. Async new office attachment escapes the identity compile.|
|First winter classic shadow-depth material|New `hb_kit_depth` and other depth variants in first world draw|[unmeasured separately]|Compile only traverses ordinary object materials; `SeasonSystem.update` assigns kitDepth after boot compile. New depth keys also appear at each previously unseen tier.|
|Actual seasonal HB_BARE boundary|[not exercised]|[unmeasured]|Dynamic key but no seasonal `needsUpdate`; a uniform change alone does not trigger selection. An unrelated later light/material refresh can discover the new key.|
|Late cove wreath / first cove view|[not exercised]|[unmeasured]|Wreck geometry reuses fleet material; wreath is a late MeshStandardMaterial and can be cold depending whether deferred compile saw it.|
|Shadow-map type change|Not an application trigger|Not applicable|Engine keeps PCFShadowMap throughout. Size4096↔2048 changes allocations, not the type define.|

The Medium→Low baseline info-log calls total **4,439.7 / 4,488.9 / 4,887.8 ms** across three driven frames. With both changes, info-log total is zero but blocking `getProgramParameter` calls >5 ms total **5,917.2 / 5,895.7 / 6,144.9 ms**. In both-1, two such calls alone last **4,239.5 + 1,574.1 ms**. Thus removing the sampled info-log hotspot does not remove the underlying completion dependency.

## 4. Root causes with implementation anchors

### 4.1 Two independent boot-state mismatches

1. **Framebuffer/output space:** Engine `engine.ts:139–142,164` compiles with the default framebuffer; world draws to the composer HalfFloat buffer. Three derives outputColorSpace from the current target (`WebGLRenderer.js:2378`, `WebGLPrograms.js:213,445`) and switches programs when it differs (`WebGLRenderer.js:2432–2434`). Tone mapping is NoToneMapping throughout; do not change the renderer's global sRGB output to conceal the mismatch. Invisible-object compilation (`:1460–1492`) makes wrong-space weather/ring programs appear prepared until first activation.
2. **Light count:** `LightsSystem.init` creates 16 visible points (`lights-system.ts:220–225`); `pointCount=MAX_POINT` and pickTimer=0 (`:72,78`). `pickPoints` only hides excess points during update (`:309–310,331–337`). Boot compile therefore sees 16 even when the governor is already Medium/Low. Three keys point-light count (`WebGLPrograms.js:342,478`). This explains why framebuffer correction alone leaves first-frame program count77 and hundreds of milliseconds of first-render work in this Medium-start scene.

### 4.2 Runtime tier publication invalidates a whole pipeline synchronously

Governor `governor.ts:90–98` changes rung and immediately publishes. Engine `engine.ts:87–90` resizes/post-updates; lights adopt 16/8/4 visible slots on their next 0.2s pick (`lights-system.ts:309–336`). Previously unseen light counts recompile many lit materials; classic depth materials acquire additional keys while reused across geometry/instancing/batching flags. Existing cooldown only hides these frames from the governor's next decision, **not from the user**.

Shadow type is fixed PCF (`engine.ts:76`), map size is changed/disposed in SunRig (`sun.ts:63–71`), map size does not enter the program key. DPR and post dimensions are uniforms/resource sizes, not shader defines. Fog is an application EffectPass, not `scene.fog` toggling every world material. Rain/snow, cloud/wetness and light intensity are uniform changes. No evidence supports a new generic per-instance uniform-texture abstraction.

### 4.3 Bloom level changes destroy materials

`post.ts:181` assigns `bloom.mipmapBlurPass.levels`. Installed postprocessing `index.js:3979–3982` calls `this.dispose()` before rebuilding levels. MipmapBlurPass.dispose (`:4089–4093`) calls Pass.dispose (`:248–257`), which disposes Material fields and fullscreenMaterial. The down/up materials survive as JS references but have lost renderer programs; next use relinks them. Three's material removal also removes unreferenced shader-source cache entries (`WebGLShaderCache.js:34–46`), so even raw source-ID tokens can change. This is **eviction/relink churn**, not a meaningful shader-code/define variant. The two named new IDs on High→Medium independently corroborate the source path.

### 4.4 Diagnostics: real synchronization point, not a sufficient remedy

Three defaults `renderer.debug.checkShaderErrors=true` (`WebGLRenderer.js:164–182`). On first `getUniforms/getAttributes`, WebGLProgram.onFirstUse queries program and two shader logs before LINK_STATUS (`WebGLProgram.js:863–879`), then constructs uniform/attribute reflection (`:953–954`). With checks off, that reflection still queries program parameters and can block until the program is usable. Main scene compile does **not** call onFirstUse: getProgram returns at `WebGLRenderer.js:2306`; reflection is requested later (`:2314,2561`).

`compileAsync` calls compile synchronously, then polls KHR completion (`WebGLRenderer.js:1515–1567`). It is already used for the main scene, and KHR is available on these iGPU captures. Cold runtime tier/post/deferred-shadow programs are not covered by that initial await. Without KHR, WebGLProgram.isReady returns true immediately (`WebGLProgram.js:992–1005`), so compileAsync is not a portable completion guarantee. **Do not ship diagnostics-off as FRAME-01's fix.** It can reduce certain warmed first-use log synchronizations, but loses error reporting and demonstrably leaves the worst stall intact.

### 4.5 Seasonal and late-material coverage

- `materials.ts:532,601` sets HB_BARE and custom key from leafFallAt. `season-system.ts:105–132,135–163` updates uniforms/attaches customDepthMaterial, but does not bump kit material version. A changing customProgramCacheKey input is not itself an invalidation notification (`WebGLRenderer.js:2426–2535`). Avoid describing every season uniform update as key churn; test and explicitly handle the actual threshold boundary.
- Life/identity are already deferred (`engine.ts:17,151–165`), but each compiles the **entire world** synchronously against the wrong target. `compile(group,camera,targetScene)` exists precisely to prepare newly added objects with final scene lighting. Identity office panels attach later (`identity-system.ts:149–156`, `offices.ts:52–54,75–125`).
- Weather objects and ring exist before boot (`weather-system.ts:90–97`, `fleet-system.ts:263–264,947–981`); invisible traversal means a correctly prepared current-light/current-target variant can cover them. Do not defer them twice blindly.
- Wreck kit geometry is added to existing BatchedMesh (`fleet-system.ts:487–510`); wreath creation is separate (`:591–613`, `wreck-cove.ts:484–515`). Fog's disabled post pass (`fog.ts:80–94`) and sky/wake/light-pool private scenes have explicit owners but are not traversed by world compile.

## 5. Implementation-ready design and order

### A. First change: eliminate invalid preparation and eviction, not diagnostics

1. **Engine.compileWorld target scope:** bind `composer.inputBuffer` only around the synchronous compile issuance; restore previous target, cube face and mip in `finally`, before awaiting the returned compileAsync promise. Keeping a global render target bound over an await is unsafe while normal frames continue. Apply the same target rule to deferred additions. Prototype implements this independent of diagnostics with `?hitch=target`, and together with the diagnostics experiment under `?hitch=both`.
2. **LightsSystem.init + quality notification:** initialize pointCount/visibility from the governor settings before the first compile. Keep existing 16/8/4 visual semantics, zero-intensity handling and nearest-light selection. On tier commit, update the visibility count synchronously, not an arbitrary 0–200 ms later, so preparation and first draw see the same state. This is a small source fix not included in the measured patch; its program/time gain remains to be measured.
3. **PostChain.setQuality / MipmapBlurPass ownership:** make mip-count resizing release/rebuild only mip targets, preserving down/up material ownership and source IDs. Prefer an upstream postprocessing fix with the pinned dependency update; if that cannot land promptly, a narrow app-owned MipmapBlurPass subclass/adapter must implement the same level-target construction with RT-only disposal and retain the original materials. Do not monkey-patch Material.dispose or suppress disposal notifications. Keep bloom levels8/7/6, kernel/radius and final target dimensions unchanged. Add a targeted lifecycle test that material dispose events and program link counters stay zero during repeated8→6→8→7→8 transitions after all variants are warm.

### B. Prepare complete first-visible coverage with explicit ownership

Add a small preparation contract beside WorldSystem in `engine/types.ts`, orchestrated by Engine, rather than scanning arbitrary nested library objects each frame. Preparation entries identify **object/scene + camera + actual target + final light state** and own their lifetime.

- `ocean/gpu-bake.ts:FullscreenPass`: expose prepare(renderer,target) for the already-owned private scene/camera; reuse in SkySystem.bandPass and WakeField.decay. Wake's stamp scene/camera and LightsSystem.poolScene/poolCam need explicit entries too. Compile only does programs, not texture/RT upload or history initialization.
- `engine/post.ts:PostChain`: prepare scrub, active compound EffectPasses, bloom luminance + **both down/up materials** (the shared pass swaps fullscreenMaterial), SMAA edge/weights and final neighborhood blend. Installed surfaces: postprocessing `:3959–3960,4024–4040,4335–4345,11024–11027,11218–11221`. The final screen EffectPass must use **null target**; intermediate HDR passes use their actual targets. Build compound materials after seal/depth configuration and quality selection, not against placeholder defines.
- Classic shadow preparation must include customDepthMaterial, instancing/batching, alpha/deformation variants and the final light count. Main-scene compile does not prepare these (`WebGLRenderer.js:1452–1454` only pre-renders shadows for the node-material handler). Prefer one real zero-delta hidden coverage render after final light/pose setup while the poster is still present over copying three's private getDepthMaterial implementation. Keep wake history/elapsed clocks unchanged; do not advance simulation to warm it.
- Deferred life/identity should return/identify new attached groups, compile only those with `targetScene=ctx.scene`, and cover later office/wreath attachment explicitly. Pending async groups must remain hidden/unpublished until ready: merely awaiting compileAsync after adding visible objects does not prevent an intervening normal render from drawing them.
- Measure both first-visible `u:render` and **total poster→live time**. Moving 6 seconds into a serial warm-up stage is not a loading-time win. Reuse independent network/CPU waits; do not compile every possible tier serially on the hard startup gate.

### C. Runtime next-tier preparation, without premature publication

Prepare only the likely adjacent rung and deduplicate by full target/light/material-state signature. Resolve it **before** `QualityGovernor.go` commits its tier; retain ordinary DPR-only transitions as resource changes, not shader warm-ups. Keep existing hysteresis. With KHR, issue preparations in bounded idle tasks and poll asynchronously; an idle callback is not permission to block for seconds. With no KHR, early compile submission can give the driver lead time but cannot promise nonblocking readiness; eliminate avoidable variants first and verify extension-less behavior separately.

A concrete ownership constraint matters: three's compileAsync polling reads each material's **currentProgram**, not a captured immutable program handle (`WebGLRenderer.js:1526–1534`). Temporarily compiling live materials for the next tier and then rendering the current tier can change currentProgram back and make the polling await observe the wrong program. Therefore do **not** implement next-tier prewarm by `go(next); await compileAsync(liveScene); go(old)`.

For retained 16/8/4 semantics, use preparation-only material instances keyed by original material + relevant geometry/instancing/batching state. Copy ShaderMaterial source/defines, and explicitly preserve custom `onBeforeCompile` and `customProgramCacheKey` hooks (ordinary Material.clone is insufficient for those callbacks). During one synchronous compile-issuance section, temporarily select the next light visibility and assign those preparation materials to the actual objects, invoke compileAsync with the real composer target, then restore every material/visibility/target immediately in finally. The async poll now follows materials that normal frames cannot overwrite. Retain their references until actual live materials have acquired the ready cached programs at commit, then dispose preparation references; disposing earlier can evict the just-warmed programs. Bound this cache to one adjacent tier and dispose on engine teardown. Account for the separate shadow/pass entries above. This is an implementation design, **not a measured prewarm win** in this spike.

An alternative experiment is keeping all 16 point slots visible and setting unused ones to zero intensity. The app already patches the point loop to skip zero-colour/out-of-range lights (`lights-system.ts:13–26`), so this would remove the count variants without changing light output. **Do not ship it on inference:** more unrolled light branches may slow the Low-tier GPU workload. Compare stable-tier GPU time and output before choosing it over the retained-semantics preparation cache.

Season boundary handling should detect only a change of the bare/leaf classification, schedule that real variant, then explicitly invalidate the relevant live material at commit. Preserve bare-crown colour/depth agreement. Snow amount/wetness stay uniforms; do not create defines for them.

## 6. Prototype, visual evidence, risks and acceptance

**Patch:** `outputs/need-for-speed/sp-hitch/spike.patch`, Engine-only research switches, clean base b71dd282. It independently supports base / target / logs-off / both. This is a measurement prototype, not a claim that FRAME-01 is fixed. No full next-tier/private-pass warm-up implementation is included or benchmarked. Permanent implementation should remove the URL research switches and instrumentation and update the normal renderer lifecycle docs/changelog.

**Visual evidence:** opened and inspected `base-2.png` and `both-2.png`. Both show the same contaminated forced-weather/fog probe state: a largely black upper frame and fog-obscured harbour at the bottom. These are **not acceptable golden scenery references**, and their similarity is not evidence that night, precipitation or normal sky remains correct. Forced visibility without a valid artistic weather state makes this probe unsuitable for visual approval. No pixel-equivalence or “marginal scenery” claim is made from these PNGs. Target scoping and diagnostics alone change no draw-time colour/tone/geometry inputs by construction, but the eventual implementation still requires ordinary frozen-state golden comparisons. This limitation is explicit, not hidden behind an SSIM number.

Primary risks:

- Additional preparations can increase time-to-live and resident program memory; one-next-state bounds and total-load accounting are required.
- Bloom material disposal defeats prewarm unless fixed first; dependency internals must remain pinned/tested.
- Shared live material currentProgram, lighting state, callback hooks and render-target state make naïve async prewarm incorrect.
- Early ready publication/visible attachment can race pending deferred preparation.
- KHR support differs between tested profiles; diagnostics-off loses real errors and does not solve unavailable/completion-dependent variants.
- Actual seasonal boundary, cove wreath/first focus, production DANGER/lightning, clean visual A/B, and full next-tier warm-up timing were not established within the 12-attempt capture cap. These are acceptance gaps for implementation/re-measurement, not claimed wins.

Eventual implementation acceptance:

1. **Program invariants:** instrument exact program keys + IDs and GL links. Initial compile and first draw use the same output space and intended16/8/4 count. In this fixture, remove the36 wrong-space duplicates and separately verify the initial-light mismatch is gone; do not hardcode the p1 count63 for a different scene.
2. **Known-state transitions:** after next-state readiness, Medium→Low / Low→High / High→Medium create no unprepared live programs, including depth and SMAA. Repeated bloom level changes do not dispose/relink materials. DPR-only still has0 new keys; measure its resize cost separately.
3. **First-use coverage:** activate actual summer rain, winter snow, lightning, rainbow, boat selection, stale fog, night beam, all deferred layers, late identity office panels, cove focus/wreath and leaf↔bare threshold. Verify both material creation and first-use logs/reflection, not only net program count. Main compile traversing invisible objects is not sufficient proof.
4. **Async correctness:** while preparing a next tier, current-tier output and renderer target remain correct every frame. Abort/dispose, resize/DPR change, season change and a superseding quality decision restore all temporary state and release preparation references. KHR polling must follow preparation-owned programs, not a live material switched back to the old state.
5. **Performance:** at least3 quiet iGPU repeats per baseline/final variant, production-faithful API snapshot, pinned viewport/DPR/initial tier; report first composer, total first live frame, poster→live, maximum transition frame, raw program/link/first-use waits and resident program memory. Require removal of the multi-second cold-tier stall rather than disappearance of info-log samples. Repeat with KHR unavailable; keep nonblocking claims conditional until measured.
6. **Visual equivalence:** use the p1 fixed-date/seed/API-snapshot freeze protocol in clean normal weather, not this forced-visibility probe. Compare heart/overview noon/night, summer/winter CALM/DANGER, DPR1/2, selection/cove, fog/beam, and tier transitions. Require identical target/light/shadow semantics and use same-configuration noise pairs before SSIM/MAE screening. Inspect PNGs and motion, especially leaf/depth agreement and bloom halos. No quality downgrade, light omission or altered DEWS meaning is acceptable.

## 7. Updated findings / prioritization

Gains overlap; do not add maxima. Quantified timing gains not isolated by this experiment remain estimates.

|ID|Opportunity / evidence|Proposed change|Gain|Visual|Effort|Risk|Dependencies/conflicts|Confidence|
|---|---|---|---|---|---|---|---|---|
|SP-HITCH-01 / GPUINIT-01|Wrong composer target;134→98 all-ready programs in every current run; p1 97→63|Correct target scope for boot and deferred compile, final output remains sRGB|**36 fewer resident programs measured** here; first composer416→375 ms composite noisy comparison, not a guaranteed41-ms saving|None by construction; clean golden A/B outstanding|S|Low/Medium target restoration and async interleaving|Coordinate Engine warm-up/boot owners|H mechanism/count; M timing|
|SP-HITCH-02 / GPUINIT-08 / FRAME-01|Initial16-light compile vs8-light first draw; runtime23 new programs,4.406s median stall|Initialize light visibility before compile; prepare real adjacent-tier state before publication or benchmark stable16-slot shader alternative|[estimate] avoid the **4.4–6.1s observed transition exposure** when readiness is correct; **no hitch saving measured by this patch**|None with preserved16/8/4 output; stable-slot alternative needs GPU test|M|Medium/High async material ownership; moving work into boot|Do after bloom ownership; include classic depths and SMAA|H cause; M gain/design|
|SP-HITCH-03|Bloom levels dispose live materials; exactly2 relinks returning to known Medium,152.3ms median frame|RT-only mip-chain resize; preserve shader material lifetime|**2 avoidable relinks per tier change**; [estimate] remove part of measured130–207ms return-tier exposure, not all resize/GPU wait|None if same mip sizes/radius/levels|S/M|Medium pinned library integration|Must precede prewarming bloom; do not double-count FRAME-01|H|
|SP-HITCH-04 / GPUINIT-03 / BOOT-07|Fog1 late EffectMaterial; private scenes/depth outside compile; office panel late|Explicit owner preparation entries, deferred new-group compile, zero-delta hidden coverage check|[estimate] remove tens–hundreds of ms of first-use exposure; fog median538ms baseline includes log synchronization, not pure compile work|None with identical history/clock/output; clean visuals outstanding|M|Medium coverage, poster critical path and state ownership|Post/sky/ocean/lights/identity owners|H coverage; M gain|
|SP-HITCH-05|Diagnostics-off removes logs but4.4s→6.1s worst stall, reflection queries take5.917s median|**Do not prioritize as hitch fix**; keep development/error coverage; production toggle only after real preparation and controlled evidence|**0 proven worst-hitch gain**; smaller warmed first-use waits observed but not generalizable|No intended output change; diagnostic failure risk|S mechanically|High false confidence / lost shader failures|Not a substitute for01–04|H negative result|

## 8. Ruled out / decisions

- Ruled out: shadow-type churn from the governor (type never changes), DPR-as-define churn (0 new keys), precipitation amount as a shader define, interpreting equal draws/programs as per-object shader duplication, “switch to compileAsync” as new work, and disabling log queries as proof of compiler parallelism or resolved hitches.
- Do not interpret the synthetic PNGs or stopped-loop rAF statistics as normal harbour appearance/FPS. Do not attribute the first-data-update race to shader preparation.
- No operator design choice is required to implement the correct-target/initial-light/bloom-ownership fixes. The retained16/8/4 prewarm cache versus stable16-slot alternative should be chosen by the specified quiet GPU measurement, not preference.
- The research closes the root-cause/negative-diagnostics question and supplies a reproducible prototype. It does **not** close the eventual quiet-machine prewarm speedup or clean visual-equivalence gates; those are explicitly enumerated acceptance evidence, not silently assumed complete.
