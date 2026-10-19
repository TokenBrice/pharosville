# Integrated visual/frame verification — partial evidence, NOT acceptance

## Disposition

**The integrated visual/frame gate is NOT established.** Collection was stopped at the user's final wrap-up instruction. The completed evidence is preserved below; missing repetitions and scenarios are not passes. No tracked source/runtime files were edited, no build wrote `dist/`, and the main dev server started for this work on `:5181` was stopped. All remaining capture batch jobs were cancelled. The pre-existing branch server on `:5173` was left alone.

| Requested lane | Completed evidence | Disposition |
|---|---|---|
| DPR1 iGPU still matrix | Two matched heart/noon pairs: summer and winter; additional unmatched branch captures | Both matched pairs below the documented noise floor; matrix incomplete |
| Storm, two standard-profile DPR2 pairs | No completed matched pairs | Not verified |
| Six-frame normal-motion filmstrip pair | No completed matched pair | Not verified |
| Steady matrix, ≥3 repetitions | Three RTX DPR1 scenarios, one run per arm | Insufficient n; no iGPU/DPR2 steady result |
| Transition matrix, ≥3 repetitions | One quality attempt per arm; one main weather activation | Insufficient n; branch quality target not reached within the observation window |
| Ten alternating cold branch readiness loads | Five iGPU + five standard | **10/10 reached first fleet frame, reveal, life ready, identity ready** |

Artifacts use the root `outputs/need-for-speed/integration/visual-frame/` throughout this report. Detailed generated median/min–max tables are in `tables.md`; raw sample distributions and pass labels remain in the JSON reports.

## Measurement controls and limitations

- Main dev: `.worktrees/nfs-base`, `npx vite --port 5181 --strictPort`; branch dev: existing `http://localhost:5173/`.
- Immutable seven-response API snapshot: `api-snapshot.json`, SHA-256 **`1abae3345df16f2001a583a859bdde803cb11bba03cbf23bac6c9f6f60a81a27`**. Both arms used exactly this snapshot, including freshness payloads. Golden epoch `1792426109167`, seed `20261019`, decorative elapsed `120` seconds.
- Real GPU through `shot.mjs`/`npm run preview` and the global shared capture lock; no independent browser launcher. `CI=false`. Captures were serial, but **the machine was contended**, including substantial CPU activity and long lock-sharing batches. These are not quiet-machine speedup measurements.
- CSS viewport 1600×1000; pinned high tier/DPR1 for completed stills and steady windows. Normal-motion steady windows were uncapped, five seconds each. Steady A/B order was interleaved.
- Browser: Chrome **149.0.7827.155**, V8 **14.9.207.29**. Standard profile used RTX 5070 Ti; NVIDIA driver **610.57.04**, observed at the start at **40°C**, **104.34 W**, P0. iGPU identity: `ANGLE (AMD, AMD Ryzen 7 7800X3D 8-Core Processor (radeonsi raphael_mendocino ACO), OpenGL ES 3.2)`.
- Desktop; no battery or sustained thermal-plateau evidence. No M5/Safari result. See `hardware.json`.
- GPU profiling overhead was not calibrated. On the branch `?prof=gpu` supplied the native pass profiler. Main lacks that profiler and completed governor-sample API; the output-only steady runner disabled main governor timer ownership (`governor.ext=null`) and installed the same branch profiler by dynamic import. Thus both steady arms used the same per-draw query instrumentation, without overlapping TIME_ELAPSED queries. No shipping source was changed.

## 1. Still comparison and image inspection

Completed matched pairs are from `golden-main-igpu/` versus `golden-branch-igpu/`. The tracked golden harness's legacy readiness path alone was insufficient for main: main has a direct identity system rather than a deferred `.system`, a combined `atlas.texture` rather than split `logoTexture/logoCount`, and a local weather `DirectorInput` rather than `weather.input`. Initial attempts failed explicitly at these contracts. `golden-compat.mjs` is an **output-only adapter copied from `scripts/perf/golden.mjs`**, accounting for those field/API differences. Its reconstructed legacy weather input follows main `weather-system.ts` lines 176–179. All normal freeze controls were retained.

Both manifests match on snapshot hash, quality, profile, epoch, seed, elapsed and capture mode. `compare-golden/summary.json` reports no incompatible metadata.

Every completed non-identical pair:

| Pair, iGPU DPR1 | SSIM | RGB MAE, 0–255 | Changed channels >3 | Max channel error | Screening |
|---|---:|---:|---:|---:|---|
| `heart-t12-summer-calm-d1.png` | 0.99994187 | 0.00333500 | 0.016375% | 190 | Within SSIM ≥0.9995 / MAE ≤0.06 |
| `heart-t12-winter-calm-d1.png` | 0.99991635 | 0.00421938 | 0.019896% | 165 | Within SSIM ≥0.9995 / MAE ≤0.06 |

These are **not pixel- or byte-identical**. The before/after contact sheet and **both native amplified diff images were actually opened and inspected**:

- `compare-golden/contact-001.png`
- `compare-golden/diff/heart-t12-summer-calm-d1.png`
- `compare-golden/diff/heart-t12-winter-calm-d1.png`

The differences are extremely sparse points/short edges around small fleet details, rather than broad island, sky, water, snow or building regions. No gross scenery/season-layout change is visible in these two matched pairs. **Classification: [INFERENCE] capture-lifecycle/temporal/AA residual candidate, not demonstrated real scenery change.** Source attribution was not established by an intra-arm repeat or motion pair; this classification is not proof of pixel equivalence and does not authorize the uncollected matrix. Large max-channel errors at a few pixels must not be hidden by the very low whole-image MAE.

The comparison command exited **1** because the directory matrix was incomplete: nine branch filenames had no main counterpart in the comparison inventory, even though both available pairs individually screened true. In addition, the final overview/night/winter branch case was not completed. Storm, standard DPR2 and filmstrip comparisons were not completed, so motion parity is unproven.

Legacy emblem caveat: main's `logos === "done"` can also occur after image failure and its combined canvas does not retain a decoded-image success flag. The adapter's atlas checks are not independent network/decode-success proof; the inspected settled views show emblem imagery, but this should not be represented as a stronger transport assertion.

## 2. Steady frame evidence

Raw reports: `frames/{arm}-standard-d1-{view}-t{hour}-r1.json`; consolidated observations: `frames-summary.json`.

**n=1 per arm/scenario, not the requested ≥3.** Every row's per-run median/minimum/maximum is consequently the displayed singleton. All six completed windows had **zero new renderer programs**, stable high tier/DPR1, all 16 systems ready, and zero pending/disjoint profiler queries after draining. Main night pacing was particularly contended; do not infer a branch speedup from it.

| View/time | Arm | Frame p50 / p95 ms | GPU p10 / p50 / p95 ms | Draw calls | Programs | Completed GPU frame samples |
|---|---|---:|---:|---:|---:|---:|
| heart noon | main | 7.00 / 8.30 | 1.56 / 2.60 / 4.38 | 108 | 98 | 177 |
| heart noon | branch | 7.30 / 9.10 | 1.56 / 2.35 / 3.98 | 116 | 66 | 170 |
| heart night | main | 16.20 / 47.90 | 1.76 / 2.59 / 7.90 | 107 | 99 | 61 |
| heart night | branch | 7.80 / 9.70 | 1.87 / 2.78 / 4.60 | 118 | 66 | 158 |
| overview noon | main | 7.60 / 9.40 | 1.62 / 2.53 / 3.97 | 114 | 100 | 163 |
| overview noon | branch | 7.40 / 9.00 | 1.69 / 2.52 / 4.31 | 136 | 68 | 168 |

Pass figures below are p50 of completed per-frame pass sums within that one run. “Main scene” sums `scene/*`, including ocean. “Post” sums `composer/*` **excluding `composer/StaticDepthPass`**. GPU totals also include shadow and update-time offscreen work, so the columns do not sum to total frame timing.

| View/time | Arm | Main scene ms | Island ms | Ocean ms | Post ms |
|---|---|---:|---|---:|---:|
| heart noon | main | 1.75 | Unresolved label | 0.16 | 0.19 |
| heart noon | branch | 1.34 | Unresolved label | 0.15 | 0.18 |
| heart night | main | 1.28 | Unresolved label | 0.17 | 0.29 |
| heart night | branch | 1.84 | Unresolved label | 0.17 | 0.23 |
| overview noon | main | 1.40 | Unresolved label | 0.17 | 0.21 |
| overview noon | branch | 1.53 | Unresolved label | 0.17 | 0.21 |

There is no distinct `scene/harbour-island` label in these reports; `scene/Scene` exists, but it was not independently mapped to island ownership during this run. **Island timing is unavailable, not zero.** Raw labels/samples are retained for a correct later attribution. No completed overview/night, steady iGPU, or steady DPR2 run is claimed.

## 3. Transition observations and unresolved finding

Raw reports are under `transitions/`; `transitions-summary.json` includes the individual rAF deltas, pre/post state and program counters. Each fresh page waited for all systems, then settled four seconds. Instrumentation recorded a one-second prelude and an eight-second post-action window. New-program counts are actual `gl.createProgram()` calls, **including preparation-owned programs**, not just final renderer-program inventory growth. They are not automatically “unprepared activation” counts.

All completed attempts used iGPU, DPR1, uncapped heart/noon, summer and KHR_parallel_shader_compile **present**. n=1 means median=min=max for each entry; no KHR-absent lane was completed.

| Attempt | n | Maximum transition interval ms | Prelude maximum ms | New program handles | Final observed state |
|---|---:|---:|---:|---:|---|
| Main medium→low | 1 | 4295.00 | 236.70 | 22 | low reached |
| Branch medium→low | 1 | 3244.10 | 594.30 | 51 | **still medium after eight seconds** |
| Main CALM→DANGER | 1 | 2952.60 | 903.70 | 3 | DANGER reached |

### Finding: branch quality request did not complete inside the measured window

Reproduction used the branch dev URL `/?view=heart&t=12&season=summer&weather=CALM&quality=medium&dpr=1&intro=0`, all systems ready, then `window.__harbour.ctx.services.get("quality").set("low")`. Evidence: `transitions/branch-quality-r1.json` and the exact eval in its `.log` / `run-transitions.mjs`.

The sample observed a **3.244-second frame interval**, **51 new program handles**, and a final quality service state still reporting **medium**, whereas main reached low. This is an **unresolved transition/completion observation**, not a passed optimization. The machine was heavily contended even during the prelude; this single sample neither establishes shader-only causality nor proves the request would never finish after the eight-second window. It nevertheless provides no support for the no-hitch/covered-state acceptance target. No defect was fixed.

Weather activation used the same DEV readings ingestion path on main/branch: start with `?weather=CALM`, then mutate the readings system's retained query to `DANGER` and call `retarget(ctx, model)`; ordinary weather updates rebuild the director input. The main attempt completed; a branch comparison was not completed. The output runner also contains a season `override.season="winter"; resolve(ctx,new Date())` lane, but **no completed season result exists**. For a future season capture, asynchronous `pendingSeason` must clear and the rendered foliage uniform must reflect the target before calling it complete.

## 4. Cold branch readiness reliability — complete

`run-readiness.mjs` performed ten HTTP-cold loads, alternating iGPU and standard, with the same frozen API bodies and `--cold` clearing HTTP cache and origin storage. This does **not** clear the driver shader cache. `readiness-summary.json` and `readiness/run-{1..10}-{profile}.json` preserve every observation.

Each of the **10/10** runs had a non-null `pv:first-fleet-frame`, positive rendered boat count/revision, `data-pv-live`, and the actual life and identity system objects present in the engine's ready set. All 16 systems were ready. The probe did not confuse service existence or reveal alone with a rendered fleet. Five iGPU reports contained only the secondary WebGPU warning `No available adapters`; the accepted WebGL renderer was the AMD iGPU. Standard reports had no console warnings/errors.

Values are **median [minimum–maximum]**, ms:

| Profile | n / successes | First fleet, navigation clock | First fleet, engine clock | All requested readiness observed, navigation clock |
|---|---:|---:|---:|---:|
| iGPU | 5 / 5 | 3074.10 [2948.50–7714.10] | 2579.00 [2483.00–6591.00] | 4834.40 [4591.20–11867.10] |
| Standard | 5 / 5 | 2772.90 [2660.90–8838.40] | 2309.00 [2177.00–7532.00] | 2791.90 [2691.20–9555.90] |

**Failures: zero.** This is readiness reliability evidence under contention, not a cold-load speedup claim. Poster removal was already observed on all five iGPU probes; the standard probes generally stopped while the intentional fade remained active. The acceptance request was reveal, not poster-removal completion, and no shorter fade is implied.

## Reproduction artifacts and remaining acceptance gap

- `api-snapshot.json`: immutable input for both arms.
- `golden-compat.mjs`, `run-main-goldens.mjs`: complete output-only legacy adapter and main matrix invocation.
- `run-goldens.mjs`: branch matrix and additional capture/compare invocations; its unadapted main calls retain the initial compatibility failure and should not be used as proof of a completed main capture.
- `run-frames.mjs`, `frame-init.js`: interleaved same-snapshot steady collection with main profiler injection.
- `run-transitions.mjs`: quality/weather/season instrumentation. Its current eight-second quality observation is **not a wait-until-target contract**; see the unresolved result above.
- `run-readiness.mjs`: ten alternating cold-load assertions, completed.
- `summarize.mjs`, `tables.md`, `aggregate.json`: summaries of the **available partial** observations, explicitly exposing unavailable island attribution and missing comparisons.

The scripts rerun their matrices rather than skip completed samples. No persisted timing baseline was written from this contended, incomplete dataset. Full still/motion coverage, the requested steady n≥3 including iGPU/DPR2, transition n≥3 with confirmed target completion and season/weather comparisons, and attributable island GPU timing remain **unverified**. The visual/frame integration must not be signed off on this report.
