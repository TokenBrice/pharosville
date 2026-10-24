# Final-fix combined confirmation — 2026-10-19

**Result: the requested confirmation is complete.** Sampled visual residuals are marginal after discriminating a main-only night capture-lifecycle difference; closest/noon is pixel-identical. Completed median iGPU GPU totals improve in both requested steady scenarios. Medium→low creates **22→0** new programs, but a **1.54 s** branch maximum interval remains. This is not a blanket smooth-frame/no-hitch release PASS.

## Controls

- Branch **b295b830a96a9c1763605f6f24606cec4d61c6cb**; main **b71dd28287bfb14e83b2efdc13cec1f93707005a** in `.worktrees/nfs-base`.
- Started the requested Vite dev origins on **5221 branch / 5222 main**, using `npx vite --port PORT --strictPort`. Both owned services were **stopped after the last capture**; pre-existing services were untouched. These are dev, not production/CDN measurements.
- Sole capture user; every capture used `scripts/perf/golden.mjs` or the integration `runShot` collector → `npm run preview` / shared real-GPU Chrome lock. No separate browser launcher. `CI=false`.
- **1600×1000, iGPU, DPR1**; high quality pinned for goldens/steady. Real WebGL renderer: `ANGLE (AMD, AMD Ryzen 7 7800X3D 8-Core Processor (radeonsi raphael_mendocino ACO), OpenGL ES 3.2)`. Browser **HeadlessChrome/149.0.0.0**. Raphael is the small integrated stress-floor GPU, not a representative laptop.
- Same seven-response snapshot: `outputs/need-for-speed/integration/visual-frame/api-snapshot.json`, SHA-256 **1abae3345df16f2001a583a859bdde803cbf23bac6c9f6f60a81a27**. Golden epoch **1792426109167**, seed **20261019**, decorative elapsed **120 s**. CALM weather; summer except the requested winter overview.
- Steady/transition windows keep normal motion and real `performance.now()`/rAF, but hold **Date at the snapshot epoch** in both arms. This prevents the aged fixture entering StaleFogEffect in later repetitions, a qualification in the prior iGPU-fix report. No stale-fog submissions occurred in these 12 steady windows. This freshness-controlled protocol is not a real-Date rerun of those earlier windows.
- Host 1-minute load observations around steady/transitions: **1.46–2.07**. NVIDIA driver **610.57.04**; auxiliary RTX observed **38°C / 28.81 W / P8** initially and **36°C / 28.37 W / P8** afterward. Those are not AMD temperature or sustained thermal measurements. Battery/AMD thermal state was not measured; no native-laptop claim.

Artifact root for everything below: **`outputs/need-for-speed/integration/confirm/`**.

## 1. Main → branch goldens

All four original pairs pass the requested comparator screen (**SSIM ≥0.9995, raw RGB MAE ≤0.06**, changed-channel bound 1%). SSIM is non-overlapping 8×8 luminance SSIM; MAE/max use raw **0–255** channel units. “Changed” means absolute RGB-channel error **>3**, not every nonzero difference.

| iGPU / DPR1 / high scene | SSIM | RGB MAE | Max channel error | Changed channels >3 | Inspection / interpretation |
|---|---:|---:|---:|---:|---|
| Heart / noon / summer | 0.999999997579 | 0.0000020833 | 1 | 0 (0%) | 10 one-level channels: sky and two quay/boat-edge pixels; marginal |
| Heart / night / summer — original | 0.999929971840 | 0.0182343750 | 129 | 2,407 (0.05014583%) | Localized near a beacon/lamp glow and sparse points; independent repeat identifies a main-only lifecycle residual |
| Heart / night / summer — independently repeated pair | 0.999999992858 | 0.0000027083 | 1 | 0 (0%) | 13 one-level channels; marginal; original pair retained above, not discarded |
| Overview / noon / winter | 0.999999988110 | 0.0000022917 | 1 | 0 (0%) | 11 one-level channels, mostly sky plus one pier pixel; snow/foliage unchanged in inspected view |
| Closest / noon / summer | 1 | 0 | 0 | 0 (0%) | Decoded RGB exactly identical, including fleet emblem/rigging details |

**Night discrimination:** initial→repeat main changes by MAE **0.0182316667**, max **129**, changed **0.05014583%**; initial→repeat branch is **exactly identical** (SSIM 1, MAE/max 0). Repeated main→branch falls to max1/13 channels. Thus the large original night residual reproduces within unchanged main, not within branch; no repeatable fleet-detail regression is established by it. The underlying main lifecycle mechanism was not causally isolated. Matching metadata alone does not guarantee identical main capture history.

**Actually opened/inspected:** all four original before/after/×4-diff contact sheets; native heart/noon and heart/night diffs; ×128 nearest-neighbor crop sheets for all three nonzero original pairs; all three night-repeat contact sheets and the repeated A/B native diff. Composition, coast/buildings, boats/rigging/logos, snow and lighting read as unchanged apart from the documented initial night glow residual. Numerical screening is not operator aesthetic approval, and max1 residuals are not bit identity.

The initial attempt exposed a **capture-harness assumption**, not a runtime failure: golden still expected the removed split logo atlas on branch. With Main's approval, `scripts/perf/golden.mjs` now detects/requires the actual combined canvas and verifies a freshly decoded source logo tile in **both** arms. It retains the branch's prepared-model, all-system, flags and effective-weather assertions. All eight final requested captures plus both independent night repeats passed the stronger tile check (`combinedAtlas: true`, `logoVerified: true`, 640 slots, eight crest flags). No runtime source was edited.

Evidence: `compare-*/summary.json`, `compare-*/contact-001.png`, `compare-*/crops.png`, `repeat-noise-heart-night-{main,branch}/summary.json`, `repeat-compare-heart-night/summary.json`; raw PNG/JSON/logs and state manifests in `golden-*` / `repeat-heart-night-*`.

## 2. Steady iGPU — pinned high, n=3 per arm, interleaved

Five-second uncapped windows; per round heart/noon then heart/night, alternating main/branch and reversing arm order in round 2. Branch uses native **`?prof=gpu`**. Main reuses the integration injection collector: disable legacy governor query ownership, import the exact branch `installGpuPassProfiler`, then collect completed per-frame submission-interval sums. Profiler overhead is uncalibrated. Numbers are **medians of the three run summaries**, not pooled frames or stale latest queries.

| Heart / summer / CALM | Arm | n | Completed GPU total p50 ms | Frame interval p50 / p95 ms | Programs | Completed GPU samples r1/r2/r3 | Mean elapsed interval ms¹ |
|---|---|---:|---:|---:|---:|---|---:|
| Noon | main | 3 | 53.06 | 14.30 / 56.70 | 98 | 38 / 36 / 34 | 34.67 |
| Noon | branch | 3 | 44.93 | 1.60 / 88.20 | 69 | 35 / 45 / 45 | 28.69 |
| Night | main | 3 | 66.39 | 11.40 / 117.80 | 99 | 28 / 29 / 27 | 44.61 |
| Night | branch | 3 | 52.99 | 1.60 / 106.70 | 69 | 41 / 40 / 42 | 31.51 |

¹ Median of per-run elapsed/window-callback-count; not presentation time.

Completed GPU total improves **15.32% noon / 20.19% night**. All **12/12** windows completed, **440** completed GPU samples; every sampled state is high/DPR1/1600×1000, all **16/16** systems ready, zero steady program inventory growth, zero current pending queries after drain, zero skipped/invalid/disjoint samples. Only the known secondary WebGPU `No available adapters` warning occurred; accepted WebGL is real AMD, not software.

**Pacing qualification:** uncapped callbacks remain bursty. Branch's **1.6 ms p50 is not presented FPS or a 1.6 ms GPU frame**; noon p95 worsens despite cheaper GPU total. Per-run branch maxima are **1068.50 / 1047.20 / 978.20 ms** at noon and **1126.00 / 1210.40 / 1042.30 ms** at night. Main maxima: noon **902.80 / 877.90 / 1005.40 ms**, night **1103.00 / 1205.40 / 1282.40 ms**. These results confirm the narrow total-GPU fix, not hitch elimination or sustained smooth ≥30 presented FPS.

Evidence: `frames-summary.json`, `frames/*.json` and `aggregate.json` retain run order, distributions, raw rAF intervals, completed query samples/state and host loads.

## 3. One medium→low transition per arm

Fresh heart/noon/summer/CALM iGPU DPR1 pages, native governor timers **without per-pass profiler**. Wait for readiness, settle four seconds, record one-second prelude, call the real quality service `set('low')`, observe publication plus five seconds. New programs count actual `gl.createProgram()` calls after the action, not net inventory growth. KHR_parallel_shader_compile was present in both trials.

| Arm | n / target published | Max transition frame interval ms | New programs | Service publish time ms | Prelude max interval ms |
|---|---:|---:|---:|---:|---:|
| main | 1 / yes | 2932.70 | 22 | 0.70 | 1303.30 |
| branch | 1 / yes | 1536.10 | 0 | 0.60 | 865.30 |

Both end at low/DPR1/CALM. Publish time is the target-tier service callback timestamp, **not first rendered/presented low-tier frame**. The branch avoids new quality programs but still has a multi-second-scale interval; n=1 is confirmation, not a transition distribution or no->50 ms-hitch proof. Long preludes also preclude shader-only causal attribution.

Evidence: `transitions-summary.json`, `transitions/{main,branch}-medium-low.json`.

## Reproduction / boundary

With the two assigned dev origins running, execute sequentially:

```sh
CI=false node outputs/need-for-speed/integration/confirm/run-confirm.mjs
CI=false node outputs/need-for-speed/integration/confirm/repeat-night.mjs
node outputs/need-for-speed/integration/confirm/summarize.mjs
```

The output-only runners retain the prior integration collector and call the tracked golden/comparator. `aggregate.json` includes every original visual result, the independent night discriminator, all steady medians and both transitions. No runtime edits, build, formatter, linter, unit suite, baseline redefinition, production-load run, KHR-absent lane or native-laptop benchmark was performed. Requested evidence and cleanup are complete; broader release objectives remain governed by the prior integration report and the qualifications above.
