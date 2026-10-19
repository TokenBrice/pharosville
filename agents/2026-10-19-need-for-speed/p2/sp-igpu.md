# SP-IGPU — GPU-pass verification spike

## 1. Scope and method

Research against HEAD b71dd282. Read the mandatory brief/AGENTS, p1 frame/pipeline/shaders/scene/actors and engine.ts, post.ts, governor.ts, quality.ts, sun.ts, lights-system.ts, wake.ts, sky-system.ts plus supporting shaders/library sources. All implementation was confined to throwaway nfs-sp-igpu, port5196, symlinked dependencies. No main-checkout tracked source edits, builds, dist writes, lint, format or test gates.

**13 approved preview capture attempts, 12 successes, one preserved readiness failure** (overview-noon-r2.log: No engine). All hardware captures were npm run preview, uncapped1600×1000 CSS px, Low tier and DPR1 pinned. Primary baseline: final-compact.json (noon/night) and storm-final-compact.json (full storm), **3 independent time windows per configuration in one navigation**, not three cold boots. RTX comparison: rtx-final-compact.json, one window per configuration. Earlier named-igpu{,-r2,-r3} provide three navigations/nine windows but are exploratory only. All numbers **contended diagnostic measurements**, not release/FPS gates.

EXT_disjoint_timer_query_webgl2 is available on AMD Raphael and RTX5070Ti. The tooling samples non-overlapping GL submissions (core + WEBGL_multi_draw, clears, depth blits, mip generation), pools queries, waits at least3 engine frames, and reads QUERY_RESULT only after availability. It labels main scene objects, shadow draws, each actual offscreen material and merged composer draw. Effects sharing a composition draw are not assigned fictitious individual timings. Cloud atlas is captured during boot, not counted as recurring work.

The final profiler hashes the sampling phase to avoid shadow cadence aliasing; invalidates entire frames on disjoint/allocation/cap failure; excludes partial reset frames; distinguishes disjoint polls from old-generation discarded queries. Timed windows pause query production, keep normal rendering alive and **asynchronously drain current-generation queries before snapshot**. No finish(), blocking result read, or readPixels is used for timing. PNG export happens after measurement. Target-identity clear labels can remain RT-number labels on a target's first use; that clear is included in the total, not silently attributed to another draw.

**Calibration limits:** per-submission query overhead is not independently calibrated. GPU totals are sums of measured submission intervals, not completed presentation intervals or CPU frame times. CPU/driver contention remains; medians are not proof of an achieved FPS. Earlier reduction windows have only3–6 completed sampled frames and ~1400–2000 pending queries: completion censoring and modulo4 cadence aliasing make their absolute/whole-frame deltas exploratory. Those limitations are fixed in the saved profiler and primary baseline, not retroactively erased from old evidence.

Reproduction:

```sh
npm run worktree:new -- nfs-sp-igpu --branch nfs/sp-igpu
# Link root node_modules, apply outputs/need-for-speed/sp-igpu/spike.patch in that worktree.
npm run dev -- --host 127.0.0.1 --port 5196 --strictPort
# From main checkout; each runner invokes only `npm run preview` (shot.mjs)
node outputs/need-for-speed/sp-igpu/focused.mjs final
node outputs/need-for-speed/sp-igpu/focused.mjs storm-final
node outputs/need-for-speed/sp-igpu/focused.mjs rtx-final
# URL tooling: ?gpuPasses=1&quality=low&dpr=1
# --eval: window.__gpuPasses.snapshot()
# Flag examples: &gpuReduce=bloomHalf,skyBounds ; window.__gpuReductions.set(['skyBounds'])
```

## 2. Measurements

### Drained iGPU windows

GPU sums in ms; quantiles below are medians of each window's corresponding quantile.

|Scenario|Complete sampled frames/window|p10 / p50 / p95 ms|Pending current queries|Disjoint polls|Skipped queries|
|---|---|---|---|---|---|
|overview-noon|32, 29, 29|49.71 / 50.94 / 52.53|0, 0, 0|0, 0, 0|0, 0, 0|
|heart-noon|38, 37, 34|44.77 / 45.19 / 47.45|0, 0, 0|0, 0, 0|0, 0, 0|
|heart-night|49, 28, 27|53.18 / 54.29 / 55.88|0, 0, 0|0, 0, 0|0, 0, 0|
|storm|53, 50, 28|52.41 / 52.95 / 54.68|0, 0, 0|0, 0, 0|0, 0, 0|

Full storm is validated from recorded weather state: level=4, band=DANGER, rain=1, cloud=1. Earlier runtime-switch storm windows were only a transition, not full DANGER, and were replaced. Readings URL overrides are DEV-only; these are dev-origin measurements, not production-weather assertions.

### Per-pass iGPU budget

Cells are **median of three window means in ms (share of median whole GPU mean budget)**, amortizing shadow/dirty passes across sampled frames. Indented main-scene details are subsets, not extra passes to add. Medians across rows need not add exactly; remaining small target clears/mip uploads are in total.

|Pass|Overview noon|Heart noon|Heart night|Full DANGER storm|
|---|---:|---:|---:|---:|
|Main scene (all)|39.844 (78.3%)|35.425 (77.4%)|41.326 (76.3%)|44.059 (83.1%)|
|   island opaque|12.185 (23.9%)|10.303 (22.5%)|11.127 (20.5%)|13.840 (26.1%)|
|   ocean|14.364 (28.2%)|11.891 (26.0%)|15.830 (29.2%)|12.586 (23.7%)|
|   fleet|4.988 (9.8%)|2.892 (6.3%)|3.287 (6.1%)|3.926 (7.4%)|
|   civic opaque|2.585 (5.1%)|3.439 (7.5%)|3.798 (7.0%)|4.825 (9.1%)|
|   sky backdrop|2.333 (4.6%)|2.155 (4.7%)|2.195 (4.1%)|2.533 (4.8%)|
|Shadows incl clear|0.507 (1.0%)|0.495 (1.1%)|0.167 (0.3%)|0.144 (0.3%)|
|Sky-band RT + mips|0.265 (0.5%)|0.264 (0.6%)|0.263 (0.5%)|0.324 (0.6%)|
|Wake decay|1.743 (3.4%)|1.726 (3.8%)|1.659 (3.1%)|1.610 (3.0%)|
|Wake trail stamps|0.018 (0.0%)|0.018 (0.0%)|0.019 (0.0%)|0.016 (0.0%)|
|Wake live stamps|0.440 (0.9%)|0.440 (1.0%)|0.404 (0.7%)|0.356 (0.7%)|
|Light-pool RT|0.000 (0.0%)|0.000 (0.0%)|0.000 (0.0%)|0.000 (0.0%)|
|Bloom threshold|0.305 (0.6%)|0.304 (0.7%)|0.388 (0.7%)|0.259 (0.5%)|
|Bloom downsample|0.609 (1.2%)|0.632 (1.4%)|0.651 (1.2%)|0.613 (1.2%)|
|Bloom upsample|0.415 (0.8%)|0.429 (0.9%)|0.429 (0.8%)|0.433 (0.8%)|
|Tilt blur + copy|0.742 (1.5%)|0.000 (0.0%)|0.000 (0.0%)|0.000 (0.0%)|
|Merged tilt/bloom/AgX/LUT/vignette|2.016 (4.0%)|2.018 (4.4%)|1.922 (3.5%)|2.043 (3.9%)|
|SMAA edge|0.610 (1.2%)|0.624 (1.4%)|0.626 (1.2%)|0.535 (1.0%)|
|SMAA weights|1.464 (2.9%)|1.435 (3.1%)|1.043 (1.9%)|0.738 (1.4%)|
|SMAA final blend|0.677 (1.3%)|0.684 (1.5%)|0.721 (1.3%)|0.594 (1.1%)|
|Beam/shimmer merged|0.564 (1.1%)|0.556 (1.2%)|3.788 (7.0%)|0.645 (1.2%)|
|Stale fog|0.000 (0.0%)|0.000 (0.0%)|0.000 (0.0%)|0.000 (0.0%)|
|NaN scrub|0.366 (0.7%)|0.366 (0.8%)|0.418 (0.8%)|0.301 (0.6%)|
|Stable-depth copy|0.367 (0.7%)|0.367 (0.8%)|0.367 (0.7%)|0.420 (0.8%)|

### Same Low@1 RTX comparison, one window/configuration

|Pass|Overview noon|Heart noon|Heart night|Full DANGER storm|
|---|---:|---:|---:|---:|
|Main scene (all)|1.267|1.012|1.044|1.069|
|   island opaque|0.180|0.153|0.162|0.180|
|   ocean|0.167|0.154|0.171|0.166|
|   fleet|0.165|0.085|0.091|0.098|
|   civic opaque|0.046|0.089|0.096|0.084|
|   sky backdrop|0.041|0.042|0.044|0.046|
|Shadows incl clear|0.035|0.021|0.014|0.023|
|Sky-band RT + mips|0.140|0.185|0.194|0.150|
|Wake decay|0.056|0.059|0.058|0.055|
|Wake trail stamps|0.017|0.024|0.021|0.018|
|Wake live stamps|0.040|0.011|0.012|0.016|
|Light-pool RT|0.000|0.000|0.000|0.000|
|Bloom threshold|0.014|0.014|0.017|0.021|
|Bloom downsample|0.029|0.032|0.061|0.049|
|Bloom upsample|0.022|0.022|0.023|0.025|
|Tilt blur + copy|0.029|0.000|0.000|0.000|
|Merged tilt/bloom/AgX/LUT/vignette|0.022|0.023|0.025|0.023|
|SMAA edge|0.011|0.032|0.011|0.011|
|SMAA weights|0.020|0.040|0.021|0.018|
|SMAA final blend|0.013|0.059|0.013|0.013|
|Beam/shimmer merged|0.016|0.017|0.086|0.026|
|Stale fog|0.000|0.000|0.000|0.000|
|NaN scrub|0.015|0.016|0.060|0.040|
|Stable-depth copy|0.010|0.010|0.010|0.014|

RTX uses NVIDIA ANGLE/Vulkan; Raphael uses AMD ANGLE/OpenGL ES3.2. Driver/query overhead differs, so ratios are diagnostic, not an architectural throughput benchmark.

RTX summed GPU p10/p50/p95: overview **1.34/1.56/2.57ms**, heart noon **1.12/1.56/2.40ms**, heart night **1.22/1.46/2.53ms**, full storm **1.23/1.44/2.42ms**. Each has295–301 complete sampled frames and zero current pending/disjoint events.

### Initialization-only atlas

Cloud atlas draw + generated mips is recorded under bootPasses, with no recurring atlas draw. Three independent exploratory boots measured atlas draw **68.018,67.089,67.042ms (median67.089ms)**; mip generation **1.301,1.237,1.351ms (median1.301ms)**. These are initialization-only submission intervals, not steady ms/frame or complete boot wall time. The atlas still performs eight per-cell mip generations; this slice does not claim a tested atlas reduction. Light-pool draws are dirty-driven and absent from most stable windows, not a missing every-frame render.

## 3. Reduction experiments and visual evidence

All reductions default OFF. Source flags: bloomHalf, depthSkip, shadows1024 (Low only), skyBounds, ocean192. DPR0.75 uses the existing dpr override; DOM UI remains full-resolution. Baseline/variant PNGs are same-page, same view and pinned clock (12.5 or22), reduced motion, engine elapsed120, weather elapsed120, zero-delta manual renders, forced shadow refresh. The comparison is **3D canvas only**; scaled canvas is exported at1600×1000 with browser2D resampling, not a claim that DOM text was downscaled. Same-page no-op pairs are byte-identical: SSIM1 / MAE0, versus p1 cross-navigation noise≈0.9995.

SSIM uses existing frame/compare.mjs:8×8 non-overlap luminance, not canonical Gaussian-window SSIM. Timing: medians of3 exploratory blocks, not drained re-verification. Before/after is the relevant pass except DPR/combined, which are whole submission budgets.

|Scenario / flag|GPU ms before → after|SSIM|RGB MAE /255|Visual verdict / validity|
|---|---:|---:|---:|---|
|overview-noon / bloomHalf|1.27 → 0.46|0.999998844|0.000|No noticeable daylight loss|
|overview-noon / depthSkip|0.40 → 0.40|1.000000000|0.000|Identical pixels; no skipped copy in these views|
|overview-noon / shadows1024|Not isolated: refresh alias / zero sampled refresh windows|0.993861567|0.519|Changed contact/tree shadows; visual-risk|
|overview-noon / skyBounds|2.43 → 1.69|1.000000000|0.000|Identical pixels; exact-bound candidate|
|overview-noon / ocean192|13.85 → 13.58|0.999849770|0.017|No noticeable still loss; motion/close sea-state risk remains|
|overview-noon / dpr075|49.53 → 28.63|0.936610027|3.285|Visible softening of buildings, rigging and sails; visual-risk|
|overview-noon / combined|49.53 → 41.44|0.999998857|0.000|Combined inherits night bloom risk; whole-frame delta confounded|
|heart-night / bloomHalf|1.03 → 0.41|0.995934605|0.976|Halo differences; fails MAE/channel screening, visual-risk|
|heart-night / depthSkip|0.36 → 0.36|1.000000000|0.000|Identical pixels; no skipped copy in these views|
|heart-night / shadows1024|Not isolated: refresh alias / zero sampled refresh windows|0.992334242|0.398|Changed contact/tree shadows; visual-risk|
|heart-night / skyBounds|2.32 → 1.53|1.000000000|0.000|Identical pixels; exact-bound candidate|
|heart-night / ocean192|11.53 → 11.55|0.999799781|0.020|No noticeable still loss; motion/close sea-state risk remains|
|heart-night / dpr075|45.66 → 33.00|0.924423597|3.373|Visible softening of buildings, rigging and sails; visual-risk|
|heart-night / combined|45.66 → 44.68|0.995934605|0.976|Combined inherits night bloom risk; whole-frame delta confounded|

**LOOK performed:** both contact sheets (all16 pairs), plus native-resolution night-bloom, noon-shadow, night-ocean and noon-DPR ROI pairs. Noon sky-bound/depth/no-op remain identical. Ocean192 retains the observed shore/boat picture in these stills. Bloom half-resolution changes night lamp/glow spread; despite SSIM≈0.996 it exceeds p1's proposed MAE≤0.5 and≤1% changed-channel screen (night MAE≈0.976,3.91% channels>3). Shadow1024 alters visible shadow structure, and DPR0.75 visibly softens roofs, railings, sail edges and rigging. Neither is certified marginal. Contact order: base,bloomHalf / depthSkip,shadows1024 / skyBounds,ocean192 / dpr075,combined; each source pair is baseline left, variant right.

Per-pass sky work decreases by about0.7–0.8ms and bloom work by about0.6–0.8ms in these exploratory windows. These are useful source-local directions, **not additive guaranteed frame wins**. Conditional depth-copy removal correctly saves nothing while the beam/shimmer depth consumer remains enabled, including these daytime views. Shadow aliasing means zero sampled shadow time cannot be presented as a free optimization. Ocean192 has no convincing measured gain. Combined whole-frame delta changes unrelated ocean/SMAA timing and must not be attributed wholly to its flags.

## 4. Findings and governor recommendation

|ID|Opportunity|Evidence|Proposed change|Expected gain|Visual impact|Effort|Risk|Dependencies/conflicts|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|SP-IGPU-01|Keep reusable pass diagnostics|gpu-passes.ts; drained primary tables|Retain opt-in profiler as tooling; benchmark overhead separately before release gating|0 runtime gain; fixes attribution and stale-last-sample interpretation|none|M|Timer support/driver overhead|Governor query ownership is exclusive; captures pin tier/DPR|H mechanism|
|SP-IGPU-02|Exact sky hill bound|sky-glsl.ts hmax rejection; frozen SSIM1 both views|Ship conservative bound after wider weather/camera validation|Exploratory≈0.7–0.8ms combined visible/band, not guaranteed release delta|none for valid finite inputs|S|Low|SHADER-01; not additive with future hill LUT|H source / M timing|
|SP-IGPU-03|Real half-resolution bloom|post.ts setSize intervention; night SSIM/MAE|Calibrate halo radius/highlight retention before tier use|Exploratory≈0.6–0.8ms bloom subpasses|visual-risk at night; daylight candidate|M|Changed halo spread|PIPE-01; preserve HDR/NaN order|M|
|SP-IGPU-04|Avoid unneeded stable-depth copy|post.ts consumer-aware needsDepthBlit; copy stays≈0.36–0.40ms in explored views|Keep conservative gate, do not skip while beam/fog/shimmer consumes depth|0 demonstrated here; at most copy cost when truly unused [estimate]|none if all consumers audited|S/M|Stale-depth/feedback regression|PIPE-04; current beam/shimmer can remain enabled at noon|H no-gain observation|
|SP-IGPU-05|Do not treat smaller shadows/ocean grid as headline fix|Main scene dominates; shadow1024 visual loss; ocean192 tiny/noncausal delta|Keep current shadow tier default; ocean192 only a still-safe candidate pending motion/close validation|No established frame win|shadow visual-risk; ocean still marginal candidate, motion unverified|S trial/M validation|Cadence/shore displacement|SCENE-03 and shadow scheduling; no actor/data removal|M|
|SP-IGPU-06|Separate 3D resolution from art tier|DPR0.75 exploratory49.53→28.63ms noon,45.66→33.00ms night; visible blur|Add opt-in/approved slow-device resolution scale with full-res DOM UI, quantized infrequent decisions|Exploratory≈21/13ms GPU budget reduction; not60fps or no-look|visual-risk; SSIM≈0.925–0.937|M|Resize hitch, blur, controller oscillation|Existing governor already GPU-aware; do not replace hysteresis|H pixel sensitivity / L default acceptability|

**Where the iGPU frame goes:** prioritize the main scene, especially island material/raster work and ocean, then the fleet/civic contributions, not tiny bloom tail mips or a nonexistent reflection scene. A per-draw timer does not separate vertex throughput from fragment shading; do not infer that decimating the island removes its entire measured cost. Pixel-sensitivity evidence supports substantial fragment/fill work.

**Policy:** current Low@1 has no sub1× rung. Lower bloom-level counts remove tiny mip levels and cannot repair a tens-of-ms main scene. Keep conservative tier hysteresis and avoid extra shader-key transitions. Recommend researching a separate, slow/quantized 3D scale (e.g.0.05 steps and multi-second hold), keeping DOM UI native; no resize-per-frame controller. **Do not silently make0.75 the default:** measured stills fail the no/marginal visual criterion and night is still≈33ms in the exploratory experiment. Test a narrower0.9/0.85 floor with operator acceptance and motion before changing the ladder. Main-scene exact ALU/visibility/material work remains necessary if high-quality laptop60Hz is required.

## 5. Ruled out / acceptance boundaries

- Not a60fps claim, quiet thermal run, DPR2 evaluation, or laptop-wide hardware certification. Raphael is a low-end proxy, not all integrated GPUs.
- No disabled scenery, data mapping changes, WebGPU/renderer switch, broad pass removal, or shader-warning suppression.
- Light-pool resolution is not a steady-state priority when the dirty target does not render. Cloud atlas is boot-only.
- NaN scrub fusion and beam sea-foot ALU removal were not prototyped: this measured scrub is small, fusion must precede every neighbourhood filter and preserve safety, and other spikes own shader-key work. The patch contains implemented reductions, not fake versions of those alternatives.
- **Remaining empirical limitation:** reduction timings are exploratory/censored; only primary baseline/RTX are remeasured with the final drained/hashed profiler. No no-cost60fps solution or visually accepted automatic DRS policy is established. This is explicitly retained under the wrap-up instruction, not presented as a completed quiet optimization gate.

## 6. Open operator decisions and artifacts

Operator decision: whether any subnative3D scale or reduced night halo passes the supported-viewport/motion threshold. No source design decision blocks exact sky-bound/tooling work.

Report: agents/2026-10-19-need-for-speed/p2/sp-igpu.md. Patch: outputs/need-for-speed/sp-igpu/spike.patch, intended to apply to HEAD b71dd282. Raw JSON/PNG/logs, focused.mjs, analyze-focused.mjs, compare-pairs.mjs, ssim-summary.json and contact/ROI pairs are under outputs/need-for-speed/sp-igpu/. Worktree/server cleanup and patch applicability are recorded by the closing handoff. No build/lint/test verification is claimed.


**Closing evidence:** `git apply --check outputs/need-for-speed/sp-igpu/spike.patch` exited0 against the unchanged main checkout at b71dd282. The port5196 server was stopped; `.worktrees/nfs-sp-igpu` and branch `nfs/sp-igpu` were removed after saving the patch. The final profiler was exercised by the drained iGPU and RTX captures; no build/lint/test gates ran.
