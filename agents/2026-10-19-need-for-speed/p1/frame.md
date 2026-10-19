# FRAME — steady-state baseline and visual reference research

## 1. Scope, completion status and method

**Phase-1 report, partial matrix, explicitly not a quiet-machine performance gate.** The orchestrator accepted deferring the extended matrix and complete golden set to phase 2 after the explicit wrap-up instruction. No tracked runtime, asset, docs, config or production build files were changed. No build/lint/test suite ran. A throwaway `nfs-frame` worktree changed capture trace categories only; its diff is `outputs/need-for-speed/frame/spike.patch`, and the worktree and branch were removed.

Read `00-BRIEF.md`, root `AGENTS.md`, architecture/runtime facts/testing docs, capture scripts, engine/governor/quality/time-of-day, weather director/system/lightning, season system and motion service. All rendering was through `npm run preview` / `scripts/harbour/shot.mjs`, at `http://localhost:5173/`, real RTX 5070 Ti or AMD Raphael iGPU. Warm cache, uncapped, 5-second requested frame windows; **all timings contended**. API boats are present, unlike the no-API :4173 preview. Inspected the saved PNGs through `matrix-contact-1.png`, `diagnostics-contact-1.png`, both `golden-contact-*.png`, and full-size overview/noise references: coloured sails/hulls are visible in daylight, boat silhouettes/lights at night, and boats remain present in rain/snow. No optimization variant's visual fidelity is claimed by these baseline pictures.

Baseline command shape:

```sh
npm run preview -- --url 'http://localhost:5173/?view=overview&t=12.5' \
  --uncapped --igpu --seconds 5 --json outputs/need-for-speed/frame/example.json \
  --out outputs/need-for-speed/frame/example.png
```

The actual batch commands are in the scratch runners listed in §7. Settled captures use `--eval` to await `engine.ready.size === engine.systems.length`, then another 3.5 seconds, and collect governor transitions at 250ms intervals. This removes deferred-init overlap but **does not guarantee shader/governor convergence**: several runs still recompiled or changed quality inside the timing window. `?prof=1` instruments every system via `window.__harbourProf`; `boot['u:*']` is only first-frame timing, not steady timing (`engine.ts:19–23,182–225,228–263`). CPU/heap/trace profiles are 1 run per scenario; frame repeats are listed individually below.

### Measurement validity

- Uncapped iGPU rAF can burst ahead and then block on GL submission: p50 of 2–4ms coexists with p95 of 70–116ms and multi-second maximum stalls. **Do not turn p50 into FPS or claim these are 400-FPS frames.** `shot.mjs:279` divides frame count by requested seconds, not measured elapsed span. Profile durations below are actual profiler spans and can exceed five seconds.
- `gpuMs` is the **last** timer-query sample, not a median, and may include driver back-pressure. The governor uses the 10th percentile internally (`governor.ts:27–30,139–177`). These values support qualitative boundness, not a precise GPU-pass budget.
- In `?prof=1`, stats programs/textures are stale from first frame (`engine.ts:254–261`); diagnostic tables use actual `ctx.renderer.info` sampled by the eval hook instead. Draw calls/triangles are the final observed frame and alternate with shadow refresh, so they are not per-window medians.
- Concurrent profiles, deferred compiles, API updates and machine contention mean these results are **investigative evidence**, not a release regression threshold.

## 2. Measurements

All frame times and gpuMs are milliseconds; viewport is 1600×1000 CSS px, device DPR1, unless stated. `n=1` per table row. Every row is contended. Short names correspond exactly to JSON/PNG basenames under `outputs/need-for-speed/frame/{matrix,diagnostics}/`.

|Artifact|Frames|p50|p95|max|Draws|Triangles|Programs|Textures|GPU ms last|Tier/DPR|Boundness verdict|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
|matrix/igpu-default-t12.5-1600x1000-d1-r1|187|2.5|68.7|2098.3|107|1212667|153|47|51.97|low@1|GPU/driver submission + transition stalls|
|matrix/igpu-default-t7-1600x1000-d1-r1|171|4.4|96.4|2169|90|747528|154|47|61.18|low@1|GPU/driver submission + transition stalls|
|matrix/igpu-overview-t12.5-1600x1000-d1-r1|155|16.3|80|1385.3|95|880334|156|50|55.44|low@1|GPU/driver submission + transition stalls|
|matrix/igpu-overview-t12.5-1600x1000-d1-r3|171|2.3|100.3|1508.5|95|881389|156|50|56.22|low@1|GPU/driver submission + transition stalls|
|matrix/igpu-overview-t22-1600x1000-d1-r1|132|2.6|107.8|1933.2|112|1343779|157|50|68.98|low@1|GPU/driver submission + transition stalls|
|matrix/igpu-overview-t22-1600x1000-d1-r2|155|2.2|113.3|1770.4|94|878900|157|50|64.83|low@1|GPU/driver submission + transition stalls|
|matrix/rtx-heart-t12.5-1600x1000-d1-r1|314|12.5|41.1|98.3|111|1267452|101|51|1.15|high@1|CPU/host pacing; GPU ample headroom [inference]|
|matrix/rtx-overview-t12.5-1600x1000-d1-r1|370|11.2|29.5|36.7|117|1367181|103|54|1.22|high@1|CPU/host pacing; GPU ample headroom [inference]|
|matrix/rtx-overview-t22-1600x1000-d1-r1|249|20.7|33|44.4|116|1371345|104|54|1.93|high@1|CPU/host pacing; GPU ample headroom [inference]|
|diagnostics/igpu-noon-r1|134|19|92|1551.2|113|1346928|156|50|64.36|low@1|GPU/driver submission + transition stalls|
|diagnostics/igpu-noon-r2|164|4.3|105.6|1576.9|113|1347126|156|50|58.19|low@1|GPU/driver submission + transition stalls|
|diagnostics/igpu-noon-r3|54|6.8|24.2|2571.2|107|1347263|153|50|63.88|low@1|GPU/driver submission + transition stalls|
|diagnostics/igpu-storm-r1|156|17.6|76.7|1313.4|96|895977|158|50|63.22|low@1|GPU/driver submission + transition stalls|
|diagnostics/igpu-storm-r2|157|2.6|73.6|4134.8|115|1361092|155|50|54.31|low@1|GPU/driver submission + transition stalls|
|diagnostics/igpu-storm-r3|144|2.3|108.2|1563.6|115|1360507|158|50|58.5|low@1|GPU/driver submission + transition stalls|
|diagnostics/igpu-winter-calm|148|2.6|106.6|2074.6|92|874630|155|50|71.18|low@1|GPU/driver submission + transition stalls|
|diagnostics/igpu-winter-storm-r1|84|2.3|4.7|4469.3|96|892162|140|50|75.26|low@1|GPU/driver submission + transition stalls|
|diagnostics/igpu-winter-storm-r3|129|2.8|116.6|1829.3|115|1357847|160|50|70.96|low@1|GPU/driver submission + transition stalls|

### Repeats and medians

Medians below are **medians of run summaries**, not pooled-frame percentiles. Profiled and unprofiled scenarios are kept separate. Diagnostic r1 carries CPU/heap/trace overhead; r2/r3 do not. Small sample counts are stated rather than silently filled.

|Scenario|Successful runs|Median p50 ms|Median p95 ms|Median max ms|Interpretation|
|---|---:|---:|---:|---:|---|
|iGPU overview noon matrix|2|9.30|90.15|1446.90|Contended; auto quality can move|
|iGPU overview night matrix|2|2.40|110.55|1851.80|Contended; auto quality can move|
|iGPU overview noon diagnostics|3|6.80|92.00|1576.90|Contended; auto quality can move|
|iGPU summer DANGER diagnostics|3|2.60|76.70|1563.60|Contended; auto quality can move|
|iGPU winter DANGER diagnostics|2|2.55|60.65|3149.30|Contended; auto quality can move|

### Weather, season and governor

Verified controls: `?weather=DANGER&season=summer&strike=1` requests driving rain, storm clouds/spray and frequent lightning; `?weather=DANGER&season=winter&strike=1` requests snow; `?weather=CALM&season=winter` isolates winter art. Readings overrides snap immediately, not after a 60-second weather ease (`weather-system.ts:30–31,95,167–184`; `director.ts:57–74,162–175`). The winter golden JSON confirms DANGER=4, cloud=1, rain=0, snow=1, snowCover=.78. Summer storm JSON confirms rain=1, snow=0. `strike=1` is DEV-only. One lightning event was observed in winter-storm r1 after instrumentation started; some 5-second storm runs contained none. Thus these are storm/rain/snow measurements, **not a guaranteed peak lightning-cost distribution**.

Observed at DPR1: iGPU starts Medium and falls to Low; multiple logged transitions occurred after settling. RTX captured runs held High. Examples: overview noon r1 Medium at 18.820s→Low at 23.596s; winter-storm r1 Medium at 14.760s→Low at 28.665s. Time offsets are navigation `performance.now()`, not CPU-profile-relative. No upward iGPU recovery was established. **DPR2 and long-duration governor settling were not measured.** Source prediction only: iGPU initial Medium@1.5 at device DPR2; RTX starts High@2; exact downshift outcome requires phase2.

Visual cost from source (`quality.ts:27–43`): High→Low reduces shadow maps4096→2048, refresh every frame→15Hz with at least2 frames separation, point lights16→4, bloom mips8→6, SMAA high→low. At DPR1 pixel resolution is unchanged. Geometry/material palette is preserved, but shadows, local light pools, antialiasing and halo breadth can visibly change. **Do not classify the whole downgrade as marginal without side-by-side comparison.** Automatic quality changes also affect fleet LOD and therefore per-frame triangle totals; comparison variants must pin both `quality` and `dpr`.

## 3. CPU profiles, allocation and GC

Raw `.cpuprofile`, `.heap.json`, `.trace.json` files are under `diagnostics/`; aggregation code is `analyze-profiles.mjs`, output `profile-summary.json`. V8 self-time is sampled duration, not inclusive time; native GL entrypoints include waits and must not be interpreted as pure JS computation. Function source lines in profile tables are **served/transformed module locations**, not necessarily identical to TypeScript file line numbers.

The initial stock `--trace` run failed at `shot.mjs:263` with `RangeError: Invalid string length` while stringifying the full trace. The isolated capture-tool spike limited categories to `devtools.timeline`, `v8`, `disabled-by-default-v8.gc`; successful traces below use that reduced category set. They contain CPU/GC timelines, not a complete GPU-pass timeline.

|Scenario|Profiler span ms|Timed rAF frames|Sampled allocated MB|Approx MB/s|Approx KB/timed frame|In-window MinorGC count / total / max ms|In-window MajorGC|
|---|---:|---:|---:|---:|---:|---|---|
|igpu-noon-r1|5739.887|134|71.120|12.391|530.7|2 / 11.581 / 9.520|0|
|igpu-storm-r1|5986.898|156|87.901|14.682|563.5|3 / 12.568 / 7.469|0|
|igpu-winter-storm-r1|6923.603|84|66.660|9.628|793.6|2 / 1.456 / 0.764|0|

Sampling interval16KiB, collected objects included. Allocation estimates include sampler/window boundary overhead and are not retained heap growth. **Do not mistake one post-window MajorGC in each trace for steady GC**: noon60.458ms, storm65.121ms and winter7.451ms begin after CPU-profiler end (respectively ~162ms,158ms,26ms later). `shot.mjs` stops CPU profiling, then heap sampling, then tracing; these collections are consistent with heap-profiler teardown. No in-window major collection was observed.

Largest noon allocation attributions: Sky.update27.097MB (38.1%), Fleet.update21.012MB (29.5%), Math.hypot2.278MB, hullHeights2.016MB. Attribution is **not proof of explicit object creation**: scalar boxing/JIT behaviour and destructuring may account for significant sampled allocations. Fleet already reuses scratch vectors/matrices; do not add a second scratch abstraction blindly.

### Per-system update/render means

`__harbourProf` accumulates from the eval reset through sampled intervals, including the1.2-second capture-tool post-eval pause; its frame count is not identical to timed rAF frames. The numbers are useful for ranking, not direct addition to percentile tables.

|Scenario|Profiled engine frames|render ms/frame|fleet|data|sky|ocean|weather|
|---|---:|---:|---:|---:|---:|---:|---:|
|igpu-noon-r1|170|22.410|6.442|3.741|1.510|0.922|0.282|
|igpu-storm-r1|252|19.264|4.871|3.108|1.069|0.336|0.157|
|igpu-winter-storm-r1|189|70.688|0.799|0.523|1.198|0.448|0.024|

### Top20 self-time: igpu-noon-r1

|Rank|Function|Served source/location|Self ms|Profiler wall %|
|---|---|---|---:|---:|
|1|viewport|native / V8:0|1507.586|26.27|
|2|(program)|native / V8:0|680.296|11.85|
|3|uniformMatrix4fv|native / V8:0|326.660|5.69|
|4|update|src/harbour/fleet/fleet-system.ts:627|293.785|5.12|
|5|bindVertexArray|native / V8:0|140.739|2.45|
|6|hullHeights|src/harbour/ocean/ocean-system.ts:189|122.347|2.13|
|7|drawElements|native / V8:0|110.988|1.93|
|8|hullSwell|src/harbour/ocean/waves.ts:46|110.694|1.93|
|9|separate|src/harbour/sim/sim.ts:935|97.026|1.69|
|10|evalBoat|src/harbour/sim/sim.ts:762|94.092|1.64|
|11|uniform4f|native / V8:0|84.572|1.47|
|12|update|src/harbour/sky/sky-system.ts:202|84.233|1.47|
|13|setProgram|node_modules/.vite/deps/chunk-V5QOT6IW.js?v=7de68d03:11057|70.902|1.24|
|14|onBeforeRender|node_modules/.vite/deps/chunk-LPHVXLYV.js?v=7de68d03:15763|68.243|1.19|
|15|uniform1f|native / V8:0|66.305|1.16|
|16|drawElementsInstanced|native / V8:0|64.912|1.13|
|17|restPose|src/harbour/sim/sim.ts:678|63.986|1.11|
|18|depthMask|native / V8:0|60.606|1.06|
|19|bindFramebuffer|native / V8:0|55.113|0.96|
|20|updateMatrixWorld|node_modules/.vite/deps/chunk-LPHVXLYV.js?v=7de68d03:7345|54.709|0.95|

### Top20 self-time: igpu-storm-r1

|Rank|Function|Served source/location|Self ms|Profiler wall %|
|---|---|---|---:|---:|
|1|activeTexture|native / V8:0|1391.031|23.23|
|2|(program)|native / V8:0|733.413|12.25|
|3|update|src/harbour/fleet/fleet-system.ts:627|365.275|6.10|
|4|uniformMatrix4fv|native / V8:0|236.889|3.96|
|5|bindFramebuffer|native / V8:0|143.080|2.39|
|6|evalBoat|src/harbour/sim/sim.ts:762|132.552|2.21|
|7|hullSwell|src/harbour/ocean/waves.ts:46|120.328|2.01|
|8|update|src/harbour/sky/sky-system.ts:202|112.855|1.89|
|9|getProgramInfoLog|native / V8:0|108.396|1.81|
|10|hullHeights|src/harbour/ocean/ocean-system.ts:189|108.073|1.81|
|11|restPose|src/harbour/sim/sim.ts:678|104.127|1.74|
|12|separate|src/harbour/sim/sim.ts:935|89.586|1.50|
|13|bufferSubData|native / V8:0|78.746|1.32|
|14|updateMatrixWorld|node_modules/.vite/deps/chunk-LPHVXLYV.js?v=7de68d03:7345|74.919|1.25|
|15|depthMask|native / V8:0|67.657|1.13|
|16|bindTexture|native / V8:0|66.022|1.10|
|17|multiDrawElementsWEBGL|native / V8:0|65.296|1.09|
|18|scissor|native / V8:0|61.772|1.03|
|19|uniformMatrix3fv|native / V8:0|58.587|0.98|
|20|setValue|node_modules/.vite/deps/chunk-V5QOT6IW.js?v=7de68d03:3922|55.860|0.93|

### Top20 self-time: igpu-winter-storm-r1

|Rank|Function|Served source/location|Self ms|Profiler wall %|
|---|---|---|---:|---:|
|1|getProgramInfoLog|native / V8:0|4044.760|58.42|
|2|uniformMatrix4fv|native / V8:0|2004.526|28.95|
|3|getShaderInfoLog|native / V8:0|428.651|6.19|
|4|(program)|native / V8:0|195.863|2.83|
|5|uniform1f|native / V8:0|45.148|0.65|
|6|update|src/harbour/fleet/fleet-system.ts:627|29.984|0.43|
|7|hullSwell|src/harbour/ocean/waves.ts:46|13.841|0.20|
|8|separate|src/harbour/sim/sim.ts:935|11.456|0.17|
|9|hullHeights|src/harbour/ocean/ocean-system.ts:189|7.459|0.11|
|10|restPose|src/harbour/sim/sim.ts:678|7.127|0.10|
|11|profiledFrame|src/harbour/engine/engine.ts:243|6.087|0.09|
|12|onBeforeRender|node_modules/.vite/deps/chunk-LPHVXLYV.js?v=7de68d03:15763|5.754|0.08|
|13|setFromEuler|node_modules/.vite/deps/chunk-LPHVXLYV.js?v=7de68d03:1630|5.163|0.07|
|14|update|src/harbour/sky/sky-system.ts:202|5.105|0.07|
|15|setProgram|node_modules/.vite/deps/chunk-V5QOT6IW.js?v=7de68d03:11057|4.833|0.07|
|16|waveHeight|src/harbour/ocean/waves.ts:39|4.317|0.06|
|17|mooredYield|src/harbour/sim/sim.ts:1103|4.067|0.06|
|18|evalBoat|src/harbour/sim/sim.ts:762|3.939|0.06|
|19|setValue|node_modules/.vite/deps/chunk-V5QOT6IW.js?v=7de68d03:3922|3.848|0.06|
|20|projectObject|node_modules/.vite/deps/chunk-V5QOT6IW.js?v=7de68d03:10777|3.412|0.05|

**Boundness conclusion:** RTX noon GPU1.22ms versus rAF p50~11–13ms supports CPU/host pacing dominance, not a GPU-throughput bottleneck. iGPU last GPU samples~52–80ms, back-pressure in GL entrypoints, and Low-tier convergence support GPU/driver-bound baseline with CPU sim/fleet work as a meaningful secondary cost. Winter storm r1 is specifically **shader-compilation/synchronization dominated**, not representative steady snowfall: getProgramInfoLog4044.760ms +getShaderInfoLog428.651ms (~64.6% of profiler span), with uniformMatrix4fv2004.526ms. The max4.469s stall is far larger than all measured in-window GC pauses. GPU-pass attribution and uncontended stable-tier throughput remain open.

## 4. Findings / prioritized opportunities

Expected gains below are conditional estimates, not measured optimization wins. IDs are this slice's evidence anchors; coordinate implementation with GPUINIT/SHADER/ACTORS/SCENE/RENDER owners to avoid duplicate work.

|ID|Opportunity|Evidence|Proposed change|Expected gain and estimation method|Visual impact / verification|Effort|Risk|Dependencies/conflicts|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|FRAME-01|Avoid automatic-tier shader hitches after apparent readiness|Winter storm max4469.3ms; infoLog native self4473.4ms; governor transitions in live windows; engine.ts151–164, governor.ts90–99|Deduplicate program variants at source and prepare likely lower-tier programs before publishing a quality change; keep checks correct, do not suppress diagnostics as a substitute|[estimate] Remove1.3–4.5s transition stalls where these profiles show compilation/sync; not an equivalent continuous-frame saving|none if shader output unchanged; frozen golden comparison plus live transition video|M|Medium: prewarming must not worsen first frame or memory|GPUINIT program-key work; shader/governor owners|H hotspot, M gain|
|FRAME-02|Cache stationary-camera sky projection geometry|sky-system.ts235–270 rescans static land points every frame; Sky.update self84.2–112.9ms per profile, allocation27.1MB noon|Invalidate camera/card/parallax geometry only when camera transform, FOV/aspect, rig target or land geometry changes; keep weather/light/palette live|[estimate] ~0.3–0.7ms/frame, bounded by measured whole Sky.update self0.63–0.72ms/timed frame; up to4.7MB/s allocation attribution is an upper bound, not guaranteed eliminable|none, exact input-keyed reuse; compare frozen references and pan/zoom transitions|S/M|Low/Medium: complete invalidation key|SHADER-15; idle-frame work|H source, M gain|
|FRAME-03|Cull offscreen visual hull/wave work before expensive helpers|Fleet.update self293.8–365.3ms, hullHeights108.1–122.3ms, hullSwell110.7–120.3ms per profile; fleet-system.ts update/LOD path|Keep authoritative sim unchanged; skip only unobservable pose/wave/rope calculations with conservative visibility and shadow bounds, refresh on reentry|[estimate] ~0.7–2ms/frame assuming half the eligible visual work is offscreen; helper self~1.5–1.7ms/frame alone, plus part of Fleet.update|none if conservative bounds include shadows/reflections and selection; verify camera sweeps, reentry and offscreen analytical state|M|Medium: shadows and visibility bookkeeping|ACTORS/SCENE, no data mapping changes|M|
|FRAME-04|Reduce iGPU full-frame effect bandwidth, not scenery geometry|Low@1 still gpuMs~52–80ms with GL submission waits; post chain owns multiple full-frame effects|Evaluate half-resolution bloom/intermediate effect targets while keeping final resolution, ocean/sky/materials and analytical meaning unchanged|[estimate] If20% of GPU frame is pixel-bound eligible effects and quarter-pixel work preserves25% cost, save15% overall ≈8–12ms at these sampled GPU costs; requires actual pass timing/A/B before commitment|marginal candidate, NOT established; SSIM/crops for lamps, beam, water glints plus operator side-by-side at all supported viewports|M|Medium: bloom aesthetics and HDR edges|RENDER pass-resolution experiment; do not double count its gain|L until pass measurements|
|FRAME-05|Stop redundant static scene matrix propagation|updateMatrixWorld self54.7ms noon /74.9ms storm; engine creates normal Scene and renders every frame|Mark genuinely static world subtrees matrixAutoUpdate/world-update policies appropriately; moving fleet/life/lights retain updates|[estimate] ~0.2–0.4ms/frame if50–80% of measured0.41–0.48ms/timed frame is static; source census must establish eligible nodes|none, frozen transform equivalence; camera/season/shadow capture regression|S/M|Medium if moving descendants incorrectly frozen|SCENE owner static-subtree census|M|
|FRAME-06|Make performance evidence resistant to false positives|shot.mjs188 catches readiness failure then evaluates;263 giant JSON trace crash;279 nominal FPS; engine.ts profiled stats stale|Fail missing engine readiness; preserve actual span/raw deltas, pin/configure stable quality for comparisons, stream trace, refresh all counters, separate teardown GC|Runtime gain0ms; avoids invalid frame/FPS/GC conclusions and lost >500MB-string-limit traces|none; harness-only|S/M|Low|GATES-14/15, phase2 capture lane|H|

## 5. Golden protocol and measured noise floor

Reference root: `outputs/need-for-speed/frame/golden/`. **The saved set is partial, not the complete requested cross-product.** `commands.sh` contains the corrected full protocol for default/overview/heart ×7/12.5/18.5/22 ×spring/summer/autumn/winter ×CALM/DANGER, plus three forced-lightning winter-night references and two clean noise repeats. `resume-golden.mjs` skips already successful JSONs and retries missing configurations. Existing PNG coverage is default and a subset of overview, summer/winter; no completed explicit heart/spring/autumn matrix or supplemental forced-lightning set is claimed.

Determinism controls:

1. Immutable seven-endpoint API snapshot in `data-snapshot.json` (epoch1792407603055); init script intercepts same-origin API fetches and returns those bodies. Snapshot intentionally retains original upstream freshness metadata and meanings. **Do not rerun snapshot-data.mjs between baseline and variant.** Dev Vite can serve this JSON at `/outputs/need-for-speed/frame/golden/data-snapshot.json` (verified200 application/json).
2. Pin `?t=`, `?view=`, `?season=`, `?weather=`, `?quality=high&dpr=1&motion=reduce&intro=0`; viewport1600×1000@1, same real GPU. Date constructor/Date.now pinned, Math.random seeded20261019 before app code. TimeOfDay.hour is season-remapped light hour, not necessarily the pinned clock hour (`time-of-day.ts145–170`): do not misclassify a winter18.5 capture's darkness as a failure.
3. Await all systems ready, wait1.5s, call `engine.stop()`, set engine elapsed120s, weather elapsed120, reset fresh snow/base snow cover, render twice at delta0, force shadow refresh. Suppress CSS transitions/animations. This deliberately freezes the art for comparison; it is not a runtime-performance test.
4. Lightning supplement keeps reduced motion globally but sets the weather motion clock live1 at delta0 and calls `lightning.strikeNow()` before manual render. This hook is in the command list, **not yet captured/tested**. Normal reduced-motion references suppress lightning by design (`lightning.ts217–235`).

### Comparison method

`compare.mjs` uses already-installed sharp and an explicit **8×8 non-overlapping luminance SSIM** implementation (K1=.01,K2=.03,L255), plus RGB MAE/RMSE and channel-change share. It is reproducible, requires no npx dependency installation, and is not claimed to be canonical Gaussian-window SSIM/FLIP. Run:

```sh
node outputs/need-for-speed/frame/compare.mjs \
  outputs/need-for-speed/frame/golden/noise-b.png \
  outputs/need-for-speed/frame/golden/overview-t12.5-summer-calm.png \
  outputs/need-for-speed/frame/golden/noise-floor-clean.json
```

Same config, separate captures, clean UI: **SSIM0.9994732531; MAE0.060066875/255; RMSE0.6469407173/255;0.1439583% of channels differ by>3**. Inspected full-size references: near-identical scenery, not byte-identical. Initial noise-a/noise-b had SSIM0.980867/MAE1.89684 because the first-time orientation card appeared only in one; this is why corrected commands explicitly pin `intro=0` and its localStorage key. A bottom800px crop of that contaminated pair had SSIM0.997953, still affected by the card shadow and small scene differences; it is not the preferred noise floor.

Proposed **screening**, not aesthetic approval: with the same device/GPU/data snapshot, require full-frame SSIM≥0.995, MAE≤0.5/255 and ≤1% channels differing by>3 for a 'marginal candidate'; compare ROI crops of sails/emblems, shore foam, foliage, lamps, beam and snow independently, then inspect randomized side-by-side at native resolution. A change must also preserve object counts/data mappings and not erase small analytical cues. Use two same-config repeats per scenario to derive local noise floors before gates. These thresholds are [estimate] proposed tolerances ~5–8× above the observed clean full-frame noise, not validated universal human-perception limits. Maximum channel error alone is unsuitable: noise repeats reach122 on isolated pixels.

Remaining determinism limits: boot-order/random-consumption dependence, asset decode/GPU/driver variation, fleet LOD hysteresis from pre-freeze frames, async API model installation, time-based system internals not all explicitly reset, fonts/UI preference storage, and reduced-motion art differing from full-motion art. Global seeds and fixed elapsed do not magically reset every internal state. Golden captures at DPR2/1440 and iGPU quality tiers still need phase2; static High@1 does not prove marginality of governor downshifts.

## 6. Failures, ruled out and operator questions

### What failed, and prevention

- `default-t7-winter-calm.log` reports **Execution context was destroyed, most likely because of a navigation** during eval. `igpu-winter-storm-r2.log` reports **Cannot read properties of undefined (reading ready)**. The latter is possible because shot's first-frame wait catches timeout to null and proceeds (`shot.mjs188–205`), so it does not require a live `window.__harbour` before eval. The former proves a navigation/context replacement, but **the trigger was not logged**. Shared Vite/HMR/worktree activity is [inference], not a verified root cause; do not assert a GPU problem or app crash from these logs alone.
- Phase2: use a quiet isolated dev origin with no concurrent worktree/file activity, log `framenavigated`, page errors, ready timeout and WebGL context loss, make a null first-frame/engine an explicit failed run, and wait for the reloaded engine only in a fresh capture. Prefer the production-faithful :4180 origin for timing if compatible fixture serving is added for goldens. Keep old failures; retry a whole run rather than silently mixing frames from different navigations. The stock successful JSON lacks navigation history, so retrospective exact-cause attribution is impossible.
- Default4000ms post-first-frame wait was not sufficient initially (deferred identity reached10s on contended iGPU); all-ready gating was added. A fixed extra3.5s still did not exclude quality-triggered compiles. Phase2 should capture transition runs separately, then pin converged quality/DPR for steady comparisons and repeat≥3.
- Broad trace serialization failed as described above; category-reduced successful traces were obtained with no runtime code change. Use streamed trace output in a permanent harness fix.

Ruled out: WebGPU/renderer switch, software rasterizer comparisons, empty-data dist as fleet baseline, treating minimum/median rAF delta as GPU time, inferring GC from heap-size drops alone, attributing teardown MajorGC to app steadiness, claiming all sampled Fleet.update bytes are trivially removable allocations, downgrading geometry/data meaning to make the chart cheaper, and assuming lower quality is automatically visually marginal.

Open questions: exact quiet-machine stable-tier throughput; actual iGPU DPR2 convergence and sustained thermal behaviour; which post passes dominate GPU time; transient navigation trigger; full golden cross-product and lightning supplement noise; per-scenario human-validated marginal thresholds. No source design decision is needed to resume; these are measurements deferred by orchestrator agreement.

## 7. Phase2 resumption and artifacts

```sh
# Finish the core first (successful settled JSONs are skipped):
NFS_CORE=1 node outputs/need-for-speed/frame/run-matrix.mjs
# Full matrix: 3views ×4clock hours ×3viewport/DPR profiles ×2GPUs;
# plus three runs for iGPU overview/heart noon/night at1600x1000@1:
node outputs/need-for-speed/frame/run-matrix.mjs
# Dedicated30s DPR2 governor histories (not executed in phase1):
node outputs/need-for-speed/frame/run-governor.mjs
# Complete corrected golden protocol, retrying missing JSONs:
node outputs/need-for-speed/frame/resume-golden.mjs
# Or replay the exact full golden command list (does not skip):
bash outputs/need-for-speed/frame/golden/commands.sh
```

`run-core-diagnostics.mjs` resumes noon/storm/winter diagnostics and skips successful outputs. To produce NEW profiled traces with that runner, recreate `nfs-frame`, symlink node_modules, and apply `spike.patch` there first; it intentionally invokes the patched preview only for profiled cases. Existing raw traces remain usable without the worktree. The older `run-diagnostics.mjs` is the original generator and is **not the recommended resume entrypoint**, because its stock broad --trace path can hit the known serialization failure.

Other scratch: `measurements.json`, `profile-summary.json`, `analyze-profiles.mjs`, `contact-sheets.mjs`, contact PNGs, `compare.mjs`, API `snapshot-data.mjs`, `golden/init.js`, `golden/freeze.js`, original and corrected golden runners, all individual JSON/PNG/log artifacts. Golden command generation includes optional fleet emblem census for newly captured frames; no counts from that new hook were obtained in phase1.

**Acceptance gaps explicitly deferred:** full view/time/DPR/GPU matrix; ≥3 heart and night key-config repeats; completed DPR2 governor histories; complete seasonal/view golden references; captured forced-lightning supplement; stable-tier uncontended baselines; quiet per-pass GPU timing. Phase1 does provide three scenario CPU/heap/GC traces, top20 tables, observed quality downshifts, live boat visual evidence, reproducible partial references, tested clean repeat SSIM noise floor, and quantified hotspot candidates. Do not mark the original full measurement acceptance complete.
