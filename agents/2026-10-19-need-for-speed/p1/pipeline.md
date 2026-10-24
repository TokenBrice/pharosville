# GPU pipeline — research report

## Scope and method

Baseline: main b71dd282. Read mandatory brief/AGENTS, architecture/testing docs, engine/post/governor/quality/uniforms/camera-rig, ocean GPU bakes/wakes, sky, lights, sun, ground, fog and beam; inspected installed `postprocessing/build/index.js` and three's `WebGLShadowMap.js`, rather than assuming library pass counts. Searched all `src` for WebGLRenderTarget, PMREMGenerator, CubeCamera and readRenderTargetPixels.

**Scope correction:** there is no `src/harbour/lighthouse/` directory, static tower reflection render target, planar mirror, PMREMGenerator or CubeCamera in this version. Lighthouse is a world system; sea reflections are analytical shading plus a small painted-sky band and cached light-pool texture. Do not budget another full scene render or propose throttling a nonexistent mirror.

Research spike only: `npm run worktree:new -- nfs-pipeline --branch nfs/pipeline`; symlink root node_modules; `npx vite --host 127.0.0.1 --port 5192 --strictPort`. Spike wraps BloomEffect.setSize to halve both dimensions when `?pipe=half`; baseline unchanged. All captures use `npm run preview -- --url 'http://127.0.0.1:5192/?t=12|22&view=overview&quality=high&dpr=1&pipe=base|half' --igpu --uncapped --seconds 4 --out … --json …`. Scratch is `outputs/need-for-speed/pipeline/`. No build/test/lint/formatter run. These are contended dev-server measurements, not production-load benchmarks. `t` is clock hour; season remaps light hour (noon capture reports 11.66).

## Pass inventory and cost model

Let P = viewport width × height × effective renderer DPR². All offscreen samples=0, stencil=false; default framebuffer antialias=false. H=RGBA16F (8 B/pixel), U=RGBA8 (4 B/pixel), D32=4 B/pixel. Formats below are actual target formats, not shader precision. Counts omit mesh draw multiplicity and GPU-generated mip levels unless specified. Depth on composer is **three full-resolution floating depth textures**, not merely one renderbuffer.

| Pass / operation, source | Resolution / format / depth | Frequency and clears | Work estimate | Measured isolation |
|---|---|---|---|---|
| Sun/moon shadow scene, world/sun.ts:59-91; three WebGLShadowMap.js:253-265 | High4096²; Medium/Low2048²; U + native unsigned-int depth | High every frame; medium ≤30Hz, low ≤15Hz and ≥2 frames; camera/light/quality invalidation forces; clears shadow target | 16.78/4.19M depth pixels budget before overdraw, geometry resubmission; target color also allocated | Not isolated |
| Sky sea-band, sky-system.ts:184-186,417-418 |512×128 H, no depth, mipmapped | Every update; FullscreenPass auto-clear true; generates mips |65,536 shaded pixels +21,845 mip pixels |Not isolated |
| Wake decay, wake.ts:169-175 |Up to2048² R16F ping-pong, no depth |Every ocean update, clears then full-screen decay/spread |4.19M pixels max, multiple previous-neighbor samples |Not isolated |
| Wake historical stamps + live stamps, wake.ts:185-196 |Same history target R16F; live2048² U, no depth |0–2 instanced draws when stamps; live clear every update |Local overdraw; live clear16MiB, history color8MiB at max res |Not isolated |
| Light-pool bake, lights-system.ts:295-323 |2048² H, no depth |On light store version/yaw invalidation, **not every frame**; clear color only |4.19M target pixels/32MiB color; sparse additive footprints |Not isolated |
| Main RenderPass, engine/post.ts:145 |P H + D32 |Every frame; RenderPass clear color/depth |At least12P output bytes; actual cost geometry/material/overdraw dependent |Not isolated |
| Composer stable-depth blit, library:1071-1130,1313-1316 |P D32 copied to third target, which also allocates U color |Every RenderPass even when fog disabled; no color draw |8P bytes logical depth read+write |Not isolated |
| Stale fog, readings/fog.ts:80-94 |P H, samples stable depth, no depth writes |Only amount>0.001; full overwrite, no clear |1P fragments; ≥16P color read/write + depth/noise |Not isolated; must preserve stale-data meaning |
| Beam+shimmer merged EffectPass, beam-system.ts:243,334 |P H, stable depth |Night beam or close visible shimmer; full overwrite |1P fragments; ≥16P color + depth/noise |Not isolated |
| NaN scrub, post.ts:98-123,173-176 |P H, no depth use/write |Every frame, immediately before bloom group; full overwrite |1P fragments,16P bytes |Not isolated; safety guard cannot simply be removed |
| Tilt-shift Kawase MEDIUM + copy, post.ts:147,160-162; library:3067-3073,3401-3421 |4 blur draws +1 copy, each P/4 H; three targets, no depth |Overview only when opacity>0.002; no clear |1.25P fragments; ≥20P logical bytes, ~44P accounting4 blur taps and copy |Not isolated |
| Bloom luminance threshold, library:4335-4365 |**P H**, no depth |Every frame; no clear |1P fragments,16P bytes |Half-resolution group A/B below |
| Bloom down/up chain, library:3979-4060 |8 down levels P/4…P/65536;7 up P/4…P/16384; H no depth |15 draws/frame high;13 medium;11 low; no clear |~0.66664P fragments; ≥10.666P one-read/write floor; actual multi-tap substantially higher |Half-resolution group A/B below |
| Main merged effect composition, post.ts:163 |P H; tilt+bloom+AgX+3D LUT+vignette in **one** draw |Every frame; full overwrite, no clear |1P fragments; ≥16P input/output; extra bloom/tilt/LUT reads |Already merged, not five passes |
| SMAA edge detection, library:11016-11027,11218-11233 |P U, no depth attachment |Every frame; **color clear first** (edge discard) |1P fragments; ≥12P bytes input+output |Not isolated |
| SMAA weights |P U, no depth |Every frame; no clear |1P fragments; ≥8P bytes; HIGH search loop cost edge-dependent |Not isolated |
| SMAA neighborhood blend / final output |P default framebuffer U |Every frame; last EffectPass renders directly to screen |1P fragments; ≥16P bytes HDR+weights read/output |No separate final copy/blit draw |

There is no SSAO/SSR/PMREM/environment-cube render pipeline. The height-field AO is a sampled baked texture within materials. AgX is ALU in the merged draw, not an extra tone-map framebuffer. SMAA is three draws, not one, despite one EffectPass. Bloom is sixteen internal draws (threshold+15 blur), not one.

### Initialization-only GPU work

- Ocean noise256² U + ripple512² U, mipmapped: two fullscreen draws (`ocean/textures.ts:51-52`), retained/shared among sea/sky/beam.
- Cloud atlas2048×1024 U mipmapped: eight viewport/scissor cell draws; `clouds.ts:121-139` explicitly regenerates the **whole atlas mip chain after every cell**. Seven of those mip generations are redundant before any consumer samples it.
- Ground1024² RGBA32F+depth: one top-down geometry render and synchronous **16MiB readRenderTargetPixels** (`ground.ts:39-96`, `island-system.ts:55`). The target is not explicitly disposed: `GroundService` returns its texture, not its owner. AO is separately constructed from the CPU height array at512² R16F. Treat original target storage as retained until proven otherwise; do not call it a transient allocation.
- LUT32³ RGBA16F =256KiB, generated on CPU and uploaded initially/when grade changes (≤4Hz while clock moves). It is not a framebuffer or per-frame bake (`post.ts:194-201`).

### Fill and logical bandwidth estimates

These are **[estimate] resource accounting**, not measured memory-controller traffic or milliseconds. Healthy overview, no beam/fog, high bloom: scene + scrub + tilt + bloom + merged main + SMAA = **8.91664P fragment invocations floor**, plus geometry overdraw; depth blit adds no fragments. Color/depth read/write floor ~**134.667P bytes/frame**, excluding clears, texture multi-taps, geometry, shadows, wake, sky and compression/cache behavior. Real bandwidth can be lower through caches/compression or higher through samples/overdraw. Never divide these bytes by advertised GPU bandwidth to promise a frame-time gain.

|Viewport/effective DPR|P megapixels|Screen-chain fragment floor M/frame|Logical floor MB/frame|At60fps GB/s|
|---|---:|---:|---:|---:|
|1600×1000@1|1.600|14.267|215.47|12.93|
|2560×1440@1|3.6864|32.870|496.44|29.79|
|1600×1000@2|6.400|57.066|861.87|51.71|
|2560×1440@2|14.7456|131.481|1985.75|119.14|

Add each enabled fog/beam pass: P fragments and at least16P color bytes, plus depth/noise. Add fixed wake up to4.19M decay fragments,65.5k band fragments and shadows independent of display DPR. Thus DPR reduction cannot erase fixed wake/shadow costs. Sky mip generation adds ~1/3 its base pixels. Half-sizing active bloom saves75% of its1.66664P fragments =1.24998P/frame, but expands the effective pixel-space halo unless radius/levels are recalibrated.

### Render-target VRAM estimates

MiB means2²⁰ bytes. Logical allocation estimates exclude driver alignment, framebuffer metadata, compression, canvas/swapchain, meshes, regular assets, SMAA lookup images, LUT and AO. Unrendered library fallback target objects (unused Kawase bloom/AgX adaptive luminance) do not imply allocated GL storage and are excluded. Depth assumed4B. Rounding mip dimensions adds tiny deviations.

|Allocated group|Formula / fixed MiB|1600×1000@1|2560×1440@1|1600×1000@2|2560×1440@2|
|---|---|---:|---:|---:|---:|
|Composer ping-pong color+depth|24P bytes|36.62|84.38|146.48|337.50|
|Stable depth target incl. unused RGBA8 color|8P bytes|12.21|28.13|48.83|112.50|
|SMAA edge+weight|8P bytes|12.21|28.13|48.83|112.50|
|Bloom luminance+pyramids|~13.333P bytes|20.35|46.87|81.38|187.50|
|Tilt-shift two scratch+result|6P bytes|9.16|21.09|36.62|84.38|
|Screen-dependent subtotal|59.333P bytes|90.54|208.59|362.14|834.37|
|Sun high shadow4096² U+depth|128|128|128|128|128|
|Wake at2048²:2R16F +1RGBA8|32|32|32|32|32|
|Light pool2048² H|32|32|32|32|32|
|Ground1024² RGBA32F+depth retained|20|20|20|20|20|
|Cloud atlas incl.mips|10.667|10.667|10.667|10.667|10.667|
|Noise+ripple incl.mips|1.667|1.667|1.667|1.667|1.667|
|Sky band incl.mips|0.667|0.667|0.667|0.667|0.667|
|**High total target storage**| |**315.54**|**433.59**|**587.14**|**1059.37**|

Medium/low shadow is32MiB: subtract96MiB from fixed total; bloom tail-level storage difference is negligible. Wake dimensions derive from world bounds, capped2048 (`ocean-system.ts:143-144`), so32MiB is upper/current-world planning value, not a queried VRAM reading. Half bloom saves15.26 /35.16 /61.04 /140.63MiB at the four viewports.

## Governor analysis

`engine.ts:197-208` brackets system updates AND composer rendering with GPU timer query. `governor.ts:57,103-128` uses EXT_disjoint_timer_query_webgl2, asynchronously polls availability, rejects disjoint/wrong-rung samples, and exposes the latest sample as stats.gpuMs. **That stats value is not a median or the governor's decision statistic.** Decisions use10th-percentile low-tail of up to256 samples (vsync back-pressure mitigation). The code calls createQuery/deleteQuery each frame and allocates a queued object despite its “allocation-free per frame” comment; this is a small CPU opportunity, not the GPU bottleneck.

Window:90 frames OR1.5seconds; initial cooldown3s; down2s/up2.5s, plus1.5s on tier change. Slow means>6% frames exceed21.5ms OR low-tail GPU>13ms. Downgrade only if GPU≥60% average frame interval; CPU-bound frames retain quality. Upgrade requires<1% slow frames and projected next GPU cost<6ms, with DPR² growth and1.2 multiplier for tier changes. Timerless path probes after8s clean, failed probes cap rung and exponentially back off to240s. This is sensible hysteresis, not a missing GPU-aware governor.

Ladder low1→low1.25→medium1.25→medium1.5→high1.5→high1.75→high2, clamped/deduped to physical DPR. **On a1× display there is no dynamic-resolution headroom below1:** only low/medium/high@1. On2×, a2→1.75 step removes23.44% screen pixels;1.75→1.5 removes26.53%. Smoother0.05 DPR steps can avoid large visual jumps, but every renderer/composer resize reallocates all P-sized targets and calls every system.resize. Never change ratio each frame. A slow, quantized scale controller with cooldown/pinned-capture support is preferable to continuous resizing; any <1 option is visual-risk and requires operator approval. Existing uResolution tracks physical drawing dimensions (`engine.ts:273`); shared uniform object references already avoid per-material copies. CameraRig recomputes projection every frame even when settled (`camera-rig.ts:78-92`), but that is CPU-only and does not justify a separate GPU optimization.

## Findings

All unmeasured gains explicitly **[estimate]**. Effort S/M/L; confidence covers mechanism, not unmeasured speed.

|ID|Opportunity|Evidence|Proposed change|Expected gain and estimation method|Visual impact / verification|Effort|Risk|Dependencies/conflicts|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|PIPE-01|Actually downscale mipmap bloom|post.ts:148; library4359-4365|Scale luminance AND mipmap input sizes, not deprecated resolutionScale; recalibrate halo radius|[estimate]75% bloom fragments;1.25P/frame;15.26MiB at1600×1000@1,140.63MiB at2560×1440@2; A/B below|visual-risk until lamp/lens/night halo radii pass side-by-side; possible marginal after recalibration|M|Halo radius and thin highlight loss|Quality presets; installed library API|H mechanism, pending visual acceptance|
|PIPE-02|Release unused ground render target after readback|ground.ts:39-96; island-system.ts:55-57|Audit all GroundService.texture readers; remove unused texture contract and dispose RT, keep CPU heights+AO|[estimate]20MiB retained VRAM removed; no steady fill change; synchronous readback remains unless offline bake|none if no texture consumer; compare ground queries and AO|S|Hidden service reader or disposal ownership|Coordinate boot/assets slice; no change to grounding semantics|H allocation/M migration|
|PIPE-03|Avoid redundant atlas mip builds|clouds.ts:121-139|Disable automatic mip generation for first7 cell renders, generate once after last cell|[estimate]7/8 mip generation eliminated;~4.89M redundant mip texels at boot;0 steady-state gain|none: final atlas/mip pixels identical; compare full atlas and sky PNG|S|Final generation must occur before sampling|Sky/shader boot slice|H|
|PIPE-04|Remove redundant stable-depth copy/storage with explicit ownership|library1071-1130; fog.ts:80-82|Keep scene depth stable while color ping-pongs; depthless post outputs; audit fog+beam+SMAA consumers; custom composer integration not blind flags|[estimate]8P bytes/frame blit saved and up to12P bytes storage (stable color/depth+unused output depth),18.31MiB at1600×1000@1,168.75MiB at2560×1440@2|none mathematically; verify depth edges, fog, shimmer, resize, disabled/enabled passes|L|Library internals and framebuffer feedback; previous runtime depth reconfiguration black-frame warning|Pinned postprocessing version; cannot just depthBuffer:false|M|
|PIPE-05|Fuse scrub into preceding scene-linear pass where that pass runs|post.ts:173-176; beam-system.ts:243; fog.ts:86|Scrub final output of last active fog/beam pass, otherwise retain standalone scrub|[estimate]1 full-screen draw+16P bytes saved on applicable frames (25.6MB/frame at1600×1000@1)|none if same range checks/order; deliberately inject NaN/Inf into scene before bloom to verify containment|M|Must clean all inputs before any bloom/tilt neighborhood sample|Do not merely merge scrub with final main EffectPass (too late)|M|
|PIPE-06|Reduce high-tier shadow refresh while stationary|sun.ts:54-91; quality.ts:28|Trial30Hz interval at high while preserving4096 size and all invalidations|[estimate]up to50% shadow renders saved at60fps;0 map-memory reduction|visual-risk: moving fleet/flags shadow cadence; verify boat close-up/pan/night|S|Motion stepping; effect cost independent of DPR|Already shipped at medium/low; only extend high|M|
|PIPE-07|SMAA→FXAA or no AA at high DPR|post.ts:165-166; library11218|Trial final FXAA pass; retain SMAA as default unless detailed motion comparison passes|[estimate]FXAA2 fewer full-screen draws and8P target bytes removed (12.21MiB at1600×1000@1); no-AA3 fewer draws if previous main writes screen|visual-risk: thin rigging, flags, roof edges and specular shimmer; DPR≥1.5 alone not proof; test motion and DPR1/1.5/2|M|FXAA softening/no-AA shimmer|Output color space/AgX ordering; no automatic downgrade proposed|M mechanism/L acceptability|
|PIPE-08|Throttle small sky-band reflection update|sky-system.ts:417-418|Cache unchanged inputs or update30Hz with immediate camera/lightning invalidation|[estimate]at60fps save30 draws/s +~2.62M base+mip texels/s; tiny compared with wake/shadow|marginal candidate; verify dawn, lightning and fast camera motion|M|Reflection lag/cross-fade requirements|Sky inputs animate; cannot classify fully static|M|
|PIPE-09|Wake resolution/cadence experiment|wake.ts:169-196; ocean-system.ts:143|Trial1024 history/live or decouple history to30Hz with dt-correct decay/stamp accumulation|[estimate]2048→1024 saves24MiB and75% decay pixels (3.15M/frame);30Hz saves half decay draws at60fps|visual-risk: wakes are prominent; verify close hull/crossing wake detail and no lost stamps|M|Decay/spread time semantics and input stamp loss|Ocean owner; not a scenery-neutral default|M|
|PIPE-10|Finer, infrequent dynamic-resolution steps|quality.ts:36-57; governor.ts:90-98|Separate effect tier from0.05-DPR steps; hold hysteresis; resize only at decisions|[estimate]2→1.95 saves4.94% P-based work instead of23.44% jump to1.75; no promised net ms|marginal at high DPR; <1 visual-risk; compare fine sail lines and resize hitches|M|Transient reallocations and governor oscillation|Existing governor already works; benchmark need before replacement|M|
|PIPE-11|Remove unused color attachment of depth-only targets|three WebGLShadowMap.js:253; composer1093|Library-supported depth-only framebuffer path, if available; otherwise small maintained integration|[estimate]64MiB high shadow color +4P stable-depth color (6.10MiB@1600×1000@1)|none if shaders/depth sampling identical; verify WebGL framebuffer completeness across drivers|M/L|Backend/library compatibility; attachment is currently real allocated storage|Overlap PIPE-04; do not double-count|M|

**Lower-risk first step for PIPE-04:** retain all existing attachments and toggle RenderPass.needsDepthBlit only when fog or beam/shimmer actually consumes depth that frame. Installed SMAA defaults COLOR edge detection and DISABLED predication (`index.js:10991-11000`), so its declared DEPTH attribute alone does not imply sampled depth in the configured shader. This saves the8P-byte blit on healthy daytime overview without reallocations; verify the generated SMAA shader and refresh depth before enabling fog/beam. It does not save VRAM. Prefer this conditional-copy experiment before rewriting composer ownership.

## Ruled out / not worth it

- “Merge bloom, AgX, LUT and vignette into one EffectPass”: already done. Merging SMAA into that pass would run its edge/weight update against **pre-tone-map** input, not the desired final graded image; merely sharing a draw is not equivalent.
- “Set bloom resolutionScale=0.5”: already the default but does not affect active mipmap luminance/pyramid sizes in installed library. Requires actual setSize intervention.
- Bloom8→6 removes4 tiny draws, but only~0.0572% of blur-pyramid pixels (L down +L−1 up). Existing governor already8/7/6. Useful submission overhead reduction at most, not25% fill reduction; wider halo loses the largest scale.
- Remove AgX: marginal ALU saving inside an already-required draw, major look change. Keep.
- Replace HDR composer with unsigned-byte throughout: clips bright lighthouse/lamp energy before bloom and AgX, violates look. A post-tone-map LDR boundary can be researched, but still needs HDR main/scene targets and has conversion/order complexity.
- Renderer `antialias:true` antialiases default framebuffer, not the main offscreen scene. Composer MSAA needs its own samples and resolves;4× incurs large HDR/depth multisample storage (roughly48P extra bytes for one4× H+D scene attachment) and does not fix shader aliasing. Not a free SMAA replacement.
- Renderer settings already sensible: high-performance powerPreference, antialias:false, stencil:false, depth:true; omitted alpha defaults false, preserveDrawingBuffer defaults false, precision defaults highp. Changing powerPreference is device policy, not guaranteed speed; lowering precision risks ocean/world calculations and non-finite artifacts. Default-canvas depth:false is possible only after all canvas users audited; small compared with offscreen depth.
- `invalidateFramebuffer` is not magic bandwidth reclamation. Fullscreen post targets already need no depth, have full overwrites and generally no clears; invalidate only attachments known dead after last sample. Never invalidate stable depth before fog/beam or scene color before bloom/SMAA. Prefer renderer-supported discard/attachment ownership over raw GL state calls; benefit is driver/tile-GPU-specific and unmeasured here.
- Whole-scene render-on-demand is incompatible with continuously animated sea, weather, boats, clouds and beacon; cache only subproducts with explicit dependencies. Light pools already do this; no planar reflection pass exists to throttle.

## Measurement results and capture pairs

Ten real-GPU captures completed (brief's non-owner cap), all1600×1000@1, high pinned, overview, AMD Raphael via ANGLE/OpenGL ES3.2. Capture queue was paused for load/frame-owner priority and resumed after release. **Contended throughout**. `gpuMs` below is the final delayed governor sample, not a4-second median.

|Clock time / variant|n|p50 per run ms|Final gpuMs per run|Median p50 / median final GPU sample ms|
|---|---:|---|---|---|
|Noon baseline|3|6.3,3.0,19.5|57.14,67.03,55.85|6.30 /57.14|
|Noon half bloom|3|24.3,18.7,14.8|71.81,59.61,63.39|18.70 /63.39|
|Night baseline|2|18.7,19.8|70.26,74.26|No reliable3-run aggregate|
|Night half bloom|2|26.0,2.1|68.84,75.89|No reliable3-run aggregate|

Noon median deltas (variant−baseline) are **+12.40ms p50,+6.25ms final gpuMs**, i.e. this experiment does **not** establish a frame-time improvement. Night pair deltas are+7.3/−17.7ms p50 and−1.42/+1.63ms final gpuMs: inconsistent. Across captures p95=63.2–112.7ms and maxima reach1355.9ms; baseline draw calls vary107–117 as live systems evolve. Whole-frame low rAF p50 coexists with30-ish measured fps and long GPU samples: do not equate that p50 with completed GPU-frame latency. This is evidence of an unsuitable timing environment, not proof that reducing bloom pixels makes rendering slower. Resource savings are independently supported by the executed node target-size probe below. Night repetitions are exploratory visual evidence only (n=2).

**Capture pairs, paths relative to `outputs/need-for-speed/pipeline/`:**

- Noon: `noon-base-2.png` versus `noon-half-1.png` — both opened and inspected. Static shoreline/building composition is preserved; lighthouse glint and boats differ in phase, preventing pixel-equivalence claims.
- Night: `night-base-1.png` versus `night-half-1.png` — both opened and inspected. Lamps, roofs, shoreline and overall night palette remain recognizable; lighthouse beam angle and moving fleet differ substantially. Halo equivalence is not established; keep visual-risk classification until fixed-animation phase comparison.
- Timing-repeat pairs also saved: `noon-base-1.png`/`noon-half-2.png`, `noon-base-3.png`/`noon-half-3.png`, `night-base-2.png`/`night-half-2.png`. These are not used for additional aesthetic claims.
- Every PNG has same-stem JSON containing GPU identity, p50/p95/max, stats and boot details. `spike.patch` preserves the4-line experiment.

**Measurement coverage limitation:** only actual half-sized bloom was isolated. Per-effect removal, AA alternatives and per-pass GPU timer deltas were not captured within the10-capture non-owner cap; they remain unmeasured, not implied by the tables. No independent per-pass GPU timing claim is made. This leaves that portion of the requested empirical matrix unresolved; the pass inventory, cost model and candidate ranking are source-backed.

**Executed node allocation-size probe (no GPU/browser):** instantiated installed BloomEffect({mipmapBlur:true,levels:8}), called setSize at each viewport, and summed luminance/down/up target width×height. Actual results:1600×1000→2,666,836 pixels/20.3463MiB;2560×1440→6,143,980/46.8748MiB;3200×2000→10,666,704/81.3805MiB;5120×2880→24,575,680/187.4976MiB (RGBA16F assumption). At1600×1000 the threshold target is1600×1000, and down levels are800×500,400×250,200×125,100×63,50×32,25×16,13×8,7×4. This directly confirms full-resolution threshold and rounding, without inventing GPU timings.

Cleanup completed: isolated5192 server stopped; throwaway worktree and `nfs/pipeline` branch removed after saving `outputs/need-for-speed/pipeline/spike.patch`. Main tracked source was not modified.

## Open questions / remaining verification

1. Operator acceptance of half-resolution bloom halo differences, FXAA/no-AA and high-tier shadow cadence is required before shipping visual-risk alternatives.
2. Frame-time numbers are contended dev-server samples with moving fleet and seasonal light; repeat production-faithful controlled simulation snapshots on quiet iGPU/dGPU before prioritizing by milliseconds.
3. Full per-effect A/B, DPR1.5/2 AA comparisons and isolated GPU timer scopes are not available from the limited capture allocation. The findings quantify pixels/storage rather than invent missing deltas. The current GPU stat is a single delayed sample, not per-pass timing.
4. Confirm live driver allocation/attachment storage through a render-target census; tables are source-derived logical budgets, not measured resident VRAM.
