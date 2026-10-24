# Final integrated real-GPU acceptance — 2026-10-19

**Disposition: requested collection is complete, but the integrated performance/visual release gate is NOT an unconditional PASS.** All requested still/motion pairs screen within the documented noise floor, with repeatable real fleet-detail pixel differences requiring operator approval. All 18 requested transitions reached their targets, and quality transitions created zero new branch programs; nevertheless multi-second iGPU intervals remain, and these instrumented iGPU runs do not establish the frame-time goal. Standard-profile median pacing is essentially unchanged, with lower completed median GPU cost at DPR2. No claim of pixel identity, hitch elimination, or typical-laptop/native-Mac performance is justified.

## Scope and controls

- Branch: `perf/need-for-speed` **06d58b5ae27fbe744d089c8294c02bbac25f9742**; main: **b71dd28287bfb14e83b2efdc13cec1f93707005a**, in `.worktrees/nfs-base`.
- Own Vite dev origins: branch `http://localhost:5185/`, main `http://localhost:5186/`. Development origins are intentional: the storm lane needs the real DEV `dews` override. These are **not production-build/CDN load measurements**.
- All real-GPU browser work used `npm run preview` / `scripts/harbour/shot.mjs` and its global capture lock. No separate browser launcher. `CI=false`. This agent was the only capture user; captures were serial under the lock. Host load observations accompany each frame/transition run; no laptop/battery/thermal-plateau claim.
- Every arm used the same seven-response frozen API snapshot: `outputs/need-for-speed/integration/visual-frame/api-snapshot.json`, SHA-256 **1abae3345df16f2001a583a859bdde803cb11bba03cbf23bac6c9f6f60a81a27**. Golden epoch **1792426109167**, seed **20261019**, decorative elapsed **120 s**.
- CSS viewport **1600×1000**, pinned **high** quality for stills/steady windows; DPR1 unless explicitly DPR2. Stills use reduced motion, pinned Date/RNG/boot rAF, converged private clocks/weather/eased state, canonical wake history, zero-delta manual renders and forced shadow refresh. Filmstrips use **normal motion**, eight frames at **250 ms** simulation intervals, subdivided into ≤1/60 s steps.
- Hardware: standard profile reports RTX 5070 Ti; NVIDIA driver **610.57.04**, initial observed **41°C / 112.01 W / P0**. iGPU is AMD Ryzen 7 7800X3D / Raphael (the 2-CU stress-floor stand-in, not a representative laptop). Browser/ANGLE identity and effective canvas dimensions are retained per frame report.
- Artifact root below: **`outputs/need-for-speed/integration/final/`**. Raw JSON, logs and PNGs are retained there. No runtime source was edited.

### Harness compatibility, without weakening branch checks

`scripts/perf/golden.mjs` now branches explicitly on absence of the readiness service for legacy main: direct identity system instead of deferred `.system`, combined emblem canvas instead of split textures, and reconstructed legacy director input. The existing branch prepared-model, decoded-logo, flags and effective-weather assertions remain intact. Main's `logos === "done"` can mean failure, so the legacy path additionally decodes the source emblem image and checks a complete copied logo tile in the actual combined atlas against that decode. It records `legacyLogoVerified: true`; a repeated main filmstrip exercised this stronger check successfully. Slot count uses the metadata slot range, not the number of aliased IDs. These are capture-only adaptations, not runtime changes.

The output-only steady collector imports the branch's exact completed-query pass profiler into main and disables main governor timer ownership first; branch uses native **`?prof=gpu`**. Both arms therefore use the same instrumentation without overlapping TIME_ELAPSED queries. Profiler overhead is **not calibrated**, so the frame results below describe these instrumented runs, not an uninstrumented presentation benchmark.

## 1. Still and normal-motion equivalence

**All 14 requested still pairs and all eight filmstrip frames passed the numerical screen**: SSIM ≥0.9995 and raw RGB MAE ≤0.06. No missing filenames or incompatible capture metadata. **None is pixel-identical.** A numerical screen does not authorize a scenery change or substitute for operator approval.

SSIM is the harness's non-overlapping 8×8 luminance SSIM, not Gaussian-window SSIM. MAE below is **raw RGB channel error on 0–255**, not `/255`. Changed channels means `abs(before-after) > 3`, as a percentage of all RGB channels. (`compare.mjs` help incorrectly describes its MAE argument as normalized; the actual comparator and this report use raw units.)

### Every still pair

`R` = repeatable real thin-detail rendering difference; `R+L` = the same real difference plus an independently observed intra-main capture-lifecycle residual. The element column identifies the visually localized differences, not an exclusive proven shader cause.

| Profile / DPR | View / hour / season / weather | SSIM | RGB MAE | Changed channels % | Classification / element |
|---|---|---:|---:|---:|---|
| iGPU / 1 | heart / 12 / summer / calm | 0.99994187 | 0.00333500 | 0.016375 | R — fleet rigging/mooring edges and tiny boat/house-flag details |
| iGPU / 1 | heart / 12 / winter / calm | 0.99993735 | 0.00327083 | 0.016729 | R — same fleet details; no broad snow/foliage difference |
| iGPU / 1 | heart / 18.5 / summer / calm | 0.99983583 | 0.00568083 | 0.021438 | R+L — fleet rigging/flag details; additional sparse main lifecycle points |
| iGPU / 1 | heart / 18.5 / winter / calm | 0.99994554 | 0.00177042 | 0.009417 | R — fleet rigging/flag details under night lighting |
| iGPU / 1 | heart / 22 / summer / calm | 0.99995289 | 0.00152104 | 0.008771 | R — fleet rigging/flag details |
| iGPU / 1 | heart / 22 / winter / calm | 0.99994465 | 0.00187729 | 0.009458 | R — fleet rigging/flag details |
| iGPU / 1 | overview / 12 / summer / calm | 0.99992988 | 0.00306896 | 0.016375 | R+L — moored fleet rigging; additional sparse main lifecycle points |
| iGPU / 1 | overview / 12 / winter / calm | 0.99999257 | 0.00062625 | 0.003958 | R — moored fleet rigging/flag edges |
| iGPU / 1 | overview / 18.5 / summer / calm | 0.99989654 | 0.00324938 | 0.017396 | R+L — moored fleet rigging; additional sparse main lifecycle points |
| iGPU / 1 | overview / 18.5 / winter / calm | 0.99999682 | 0.00026104 | 0.001750 | R — moored fleet rigging/flag edges |
| iGPU / 1 | overview / 22 / summer / calm | 0.99999689 | 0.00029396 | 0.001979 | R — moored fleet rigging/flag edges |
| iGPU / 1 | overview / 22 / winter / calm | 0.99999739 | 0.00024292 | 0.001688 | R — moored fleet rigging/flag edges |
| iGPU / 1 | heart / 12 / summer / DANGER (`?dews=DANGER`) | 0.99986670 | 0.00216188 | 0.010375 | R — fleet rigging and small boat details, not broad rain/sea/sky |
| standard / 2 | heart / 12 / summer / calm | 0.99988029 | 0.00739104 | 0.024708 | R+L — fleet details plus tiny civic crest-pennant pixels; negligible main repeat residual |

### Normal-motion filmstrip, iGPU DPR1, heart/noon/summer/calm

Chronological initial frame is the unsuffixed PNG; the following seven are `-00` through `-06`. Every frame is classified **R**, localized to fleet rigging/mooring and tiny boat/flag detail. Matching motion, hull displacement and wake progression are visible; no broad temporal divergence or missing arrival element was observed in this short settled-world lane. This does not cover all semantic/arrival paths in PLAN §5.2.

| Frame / simulation offset | PNG suffix | SSIM | RGB MAE | Changed channels % |
|---|---|---:|---:|---:|
| 0 / 0 ms | none | 0.99994187 | 0.00332896 | 0.016313 |
| 1 / 250 ms | -00 | 0.99994223 | 0.00337271 | 0.018708 |
| 2 / 500 ms | -01 | 0.99994910 | 0.00302083 | 0.015979 |
| 3 / 750 ms | -02 | 0.99996233 | 0.00311708 | 0.016042 |
| 4 / 1000 ms | -03 | 0.99993878 | 0.00359104 | 0.017083 |
| 5 / 1250 ms | -04 | 0.99994039 | 0.00321229 | 0.016250 |
| 6 / 1500 ms | -05 | 0.99995354 | 0.00301604 | 0.015375 |
| 7 / 1750 ms | -06 | 0.99995851 | 0.00304667 | 0.015563 |

### Inspection and lifecycle discrimination

**Actually opened and inspected:** all seven initial before/after/diff contact sheets (`compare-igpu/contact-001…003.png`, storm and DPR2 `contact-001.png`, filmstrip `contact-001…002.png`), and the native-source nearest-neighbor enlarged **diff crop sheet for every one of the 22 pairs** in `compare-*/crops/`. Up to six highest-error 128-pixel tiles per pair include before/after/amplified difference. Also inspected all four nonzero intra-main repeat crop sheets and the four corresponding repeated A/B crop sheets. Repeat pairs whose inputs are decoded-pixel identical have identical diff evidence to the already-inspected initial pair.

A complete second independent capture matrix (`repeat/`) distinguishes real differences from capture lifecycle:

- **Branch: 22/22 repeated frames exactly equal** (SSIM 1, MAE 0, maximum channel error 0).
- **Main: 18/22 exactly equal.** Nonzero repeat errors: heart/18.5/summer MAE 0.00189021; overview/12/summer 0.00217188; overview/18.5/summer 0.00239896; standard DPR2 heart/noon 0.00003396. Those are capture-lifecycle/nondeterministic residuals because the source arm did not change. Their sparse point locations are documented in `repeat-noise-*/crops/`; they do not explain away the invariant fleet-detail differences.
- All eight motion frames in **both arms** reproduce exactly across the second capture, but retain nonzero A/B differences. Thus the filmstrip residuals are **real rendering-path differences**, not a normal-motion alignment accident. No pair is classified lifecycle-only.
- **[INFERENCE — source attribution]** The strongest rope candidate is `MooringLines`: legacy computes the eight curve samples in JavaScript before Float32 upload; branch uploads Float32 endpoints/coefficients and evaluates the same intended equations in GLSL. Different rounding order can change thin-edge coverage. The separate immutable-logo atlas and explicit-gradient sampling are candidates for emblem/flag pixels. The named visible elements are established by crop inspection; an exclusive causal knockout was not performed.

The full-frame composition, island, coastline, major buildings, sky/water, seasonal snow and weather read as unchanged in these views. **Do not describe this as pixel-identical or dismiss all deviations as capture noise.** Max single-channel errors reach 208 on sparse high-contrast details despite tiny whole-image MAE. The real thin-detail changes remain an operator visual-acceptance decision.

Raw comparison metrics: `compare-{igpu,storm,dpr2,filmstrip}/summary.json`; repeat discrimination: `repeat-noise.json`; crop coordinates: `diff-inventory.json` and `noise-diff-inventory.json`.

## 2. Steady frame matrix — n=3 per arm and scenario

**30/30 requested runs completed**, interleaving A/B and reversing arm order each round. Each used `--uncapped --seconds 5`, normal motion, summer/calm, pinned high tier and requested DPR. All 16 systems were ready. Effective buffers were **1600×1000 at DPR1** and **3200×2000 at DPR2**, with no quality/resolution downshift. The still PNGs are the harness's 1600×1000 screenshot output; DPR2 refers to actual renderer sampling/buffer resolution, not a claim that the exported PNG is 3200×2000.

Values are **medians of the three run summaries**, not pooled frames. Frame intervals use `performance.now()` rAF observation. GPU columns are p50 of **completed per-frame submission-interval sums**, not stale latest-query values. Main scene sums `scene/*` (including island/ocean); island uses the observed uniquely owned `IslandSystem.root` label **`scene/Scene`**, rather than assuming that ambiguous name. Ocean is `scene/ocean`. Post sums `composer/*` **excluding StaticDepthPass**. Island timing is its color/main-scene cost, not island shadow/prepass/CPU ownership. Independent medians and subsets do not add up to total.

| Profile / DPR / view / time | Arm | n | Frame p50 / p95 ms | GPU total ms | Main scene ms | Island ms | Ocean ms | Post ms | Draws | Programs |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| iGPU / 1 / heart / noon | main | 3 | 14.70 / 75.50 | 52.81 | 37.76 | 13.82 | 9.98 | 8.49 | 108 | 98 |
| iGPU / 1 / heart / noon | branch | 3 | 2.00 / 123.50 | 61.35 | 33.48 | 10.23 | 12.99 | 9.19 | 116 | 69 |
| iGPU / 1 / heart / night | main | 3 | 11.20 / 112.50 | 70.17 | 50.03 | 17.62 | 15.46 | 11.40 | 107 | 99 |
| iGPU / 1 / heart / night | branch | 3 | 2.00 / 143.30 | 72.77 | 43.17 | 13.00 | 17.35 | 12.00 | 118 | 69 |
| iGPU / 1 / overview / noon | main | 3 | 24.30 / 92.20 | 55.91 | 40.78 | 15.89 | 11.44 | 9.87 | 114 | 100 |
| iGPU / 1 / overview / noon | branch | 3 | 2.40 / 112.90 | 56.30 | 34.43 | 11.10 | 12.92 | 7.57 | 136 | 71 |
| standard / 1 / heart / noon | main | 3 | 4.90 / 5.90 | 1.56 | 1.05 | 0.23 | 0.15 | 0.19 | 108 | 98 |
| standard / 1 / heart / noon | branch | 3 | 4.90 / 5.70 | 1.52 | 0.91 | 0.18 | 0.15 | 0.18 | 116 | 69 |
| standard / 2 / heart / noon | main | 3 | 16.90 / 18.00 | 3.66 | 2.21 | 0.59 | 0.51 | 0.68 | 108 | 98 |
| standard / 2 / heart / noon | branch | 3 | 16.70 / 18.20 | 3.10 | 1.86 | 0.44 | 0.50 | 0.69 | 116 | 69 |

Draws/programs are the end-of-window renderer inventory/counters (consistent across each scenario's repetitions), not an invented mean draw count. Branch's static-depth pass adds draws; its completed p50 cost was 0.47 ms heart/noon, 0.47 ms heart/night and 0.57 ms overview/noon on iGPU; 0.037 ms standard DPR1 and 0.085 ms standard DPR2. Total also includes shadow and update-time offscreen submissions.

### Completed GPU distributions and honest elapsed pacing

The uncapped iGPU rAF stream is **bursty**: many ~2 ms CPU submissions followed by long waits. The 2 ms p50 is **not** 500 presented FPS or proof of a 2 ms GPU frame. Whole-window elapsed pacing and upper-tail intervals must accompany it:

| Scenario | Arm | GPU total p10 / p50 / p95 ms | Completed samples per run | Mean elapsed interval ms, median of runs | Observed callbacks/s, median of runs |
|---|---|---:|---|---:|---:|
| iGPU heart noon DPR1 | main | 51.54 / 52.81 / 53.72 | 38, 38, 38 | 32.81 | 30.48 |
| iGPU heart noon DPR1 | branch | 61.24 / 61.35 / 61.73 | 40, 34, 31 | 40.85 | 24.48 |
| iGPU heart night DPR1 | main | 69.20 / 70.17 / 82.17 | 22, 32, 27 | 44.95 | 22.25 |
| iGPU heart night DPR1 | branch | 72.23 / 72.77 / 80.19 | 21, 28, 32 | 45.31 | 22.07 |
| iGPU overview noon DPR1 | main | 55.16 / 55.91 / 56.69 | 33, 33, 33 | 38.40 | 26.04 |
| iGPU overview noon DPR1 | branch | 56.08 / 56.30 / 57.37 | 34, 34, 34 | 36.86 | 27.13 |
| standard heart noon DPR1 | main | 1.51 / 1.56 / 2.62 | 247, 248, 248 | 5.06 | 197.58 |
| standard heart noon DPR1 | branch | 1.50 / 1.52 / 2.60 | 250, 249, 248 | 5.03 | 198.82 |
| standard heart noon DPR2 | main | 3.22 / 3.66 / 4.84 | 74, 75, 75 | 16.86 | 59.31 |
| standard heart noon DPR2 | branch | 3.05 / 3.10 / 5.09 | 75, 73, 74 | 16.78 | 59.59 |

Across all 30 windows: **2,518 completed GPU frame samples; zero new steady renderer programs, zero pending current-generation queries after draining, zero disjoint polls, zero skipped profiler queries; high tier and DPR stayed fixed**. iGPU reports only the secondary WebGPU `No available adapters` warning; their accepted WebGL renderer is AMD, not software. Standard reports contain no console warnings/errors.

These runs show reduced island/main-scene submission cost, **but no integrated total-GPU iGPU win**: median total heart/noon is 52.81→61.35 ms; night 70.17→72.77 ms; overview 55.91→56.30 ms. No selective pass saving may be presented as the total-frame result. The branch iGPU heart/noon mean observed interval is 40.85 ms, and p95 is 123.50 ms. The low p50 submission interval does not establish the intended smooth ≤33 ms experience. The iGPU steady windows themselves contain long intervals (branch per-run maxima 0.90–2.14 s across scenarios), despite zero new program creation.

On RTX, median DPR1 pacing is essentially unchanged; DPR2 remains near 60 observed callbacks/s without downshift and its completed median GPU total falls 3.66→3.10 ms. Tail bounds do not uniformly improve: DPR2 frame p95 18.00→18.20 ms and completed GPU p95 4.84→5.09 ms. This is desktop Chrome evidence, **not** M5 Max/Safari or native laptop thermal acceptance.

Host 1-minute load over the steady before/after observations ranged **1.18–4.01** (all 1/5/15-minute observations 1.18–5.00). Sole capture ownership is established; this is not a claim of zero host activity or calibrated profiler overhead. Raw per-run ranges, GPU labels, samples, state, canvas, browser user agent and load observations are preserved in `frames/`, `frames-summary.json` and `aggregate.json`.

## 3. iGPU transitions — n=3 per arm and action

**18/18 requested targets published.** Every trial is a fresh normal-motion, uncapped iGPU DPR1 heart/noon/summer page. It waits for all systems/coherent branch model, settles four seconds, records a one-second prelude, performs the action, and observes through publication **plus five seconds** (120-second publication deadline). These runs use normal governor timers, **not** the per-draw GPU profiler.

- Medium→low and low→medium use the actual **quality service `set()`**. The publication timestamp comes from a listener installed before the action and filtered to the target tier. It means settings applied/published, **not the first rendered/presented frame**. Hence sub-ms service publication can coexist with a later multi-second interval.
- First storm activation starts **`?dews=CALM`** on dev, then changes the readings system's retained `q.dews` to `DANGER` and calls its ordinary `retarget(ctx, model)` after boot. This enables the existing DEV latch and respects dews precedence; no boot-with-storm fallback was necessary. Final readings are level 4/DANGER and weather service band is DANGER in every run.
- Weather has no publication subscription, so its “time-to-publish” below is the **first rAF observation of the target weather band**: an upper-bound/observed publication latency including the first target frame's blocking work, not an exact assignment timestamp or convergence of cloud/rain/wetness. The service band is authoritative for the requested state.
- New programs are actual **`gl.createProgram()` calls after the action**, including preparation-owned work, not net renderer-inventory growth and not an automatic count of unprepared activation. KHR_parallel_shader_compile was **present in all 18**; no KHR-absent result is claimed.

Values: median **[minimum–maximum]** of three trials; ms unless program count.

| Action | Arm | n / published | Maximum transition interval ms | New programs | Observed time-to-publish ms | Prelude maximum ms |
|---|---|---|---:|---:|---:|---:|
| medium→low | main | 3 / 3 | 2785.60 [2716.00–2912.30] | 22 [22–22] | 0.70 [0.70–0.90] | 1207.60 [1097.50–1396.80] |
| medium→low | branch | 3 / 3 | 1483.50 [1434.80–1744.60] | 0 [0–0] | 0.60 [0.60–0.70] | 625.10 [555.30–817.40] |
| low→medium | main | 3 / 3 | 3216.50 [2766.20–3236.20] | 22 [22–22] | 0.80 [0.70–0.80] | 78.60 [75.20–1227.30] |
| low→medium | branch | 3 / 3 | 1673.20 [1541.30–1745.30] | 0 [0–0] | 0.60 [0.50–0.70] | 738.20 [644.70–755.30] |
| first calm→DANGER | main | 3 / 3 | 3237.10 [2786.50–3420.60] | 3 [3–3] | ≤3237.10 [≤2786.50–≤3420.60] | 65.40 [52.20–1242.50] |
| first calm→DANGER | branch | 3 / 3 | 3168.80 [2874.40–4213.20] | 1 [1–1] | ≤3168.80 [≤2874.40–≤4213.20] | 1018.70 [457.70–1352.60] |

Quality switching now completes in these trials, unlike the earlier partial report's eight-second cutoff observation, and does so with **22→0 new program handles**. That is a concrete win. **It is not hitch elimination:** branch quality actions still contain ~1.5–1.7-second maximum intervals. First storm still creates one program and has a ~3.17-second median maximum interval, with a worst trial **4.21 s**. Preludes also contain long iGPU waits, so these intervals do not establish shader-only causality or a transition-attributable JS task duration. They provide **no pass** for the no-visible->50 ms transition objective.

Raw evidence: `transitions/*.json` retains individual rAF deltas, program counts and final states; `transitions-summary.json` and `aggregate.json` contain summaries. Host 1-minute load after each transition was **1.44–2.31**. The collector's host `before` field is overwritten by the scene-before-state object, so no pre-transition host-load claim is made. Likewise `before.weatherInput` in branch raw output is a retained mutable input reference, not an immutable before snapshot; use the separately captured `before.weather`, `before.readings`, tier and final state for the actual transition assertions.

## 4. Release-note-ready before→after summary

All timings below are local dev, same frozen API, same hardware/profile, high quality and instrumented as described above. Each timing/count scenario has **n=3 per arm** unless marked as visual pairs. These are measured outcomes, not modeled forecasts.

| Metric / lane | Before → after | n / arm | Safe interpretation |
|---|---|---:|---|
| Standard DPR1 heart/noon frame p50 / p95 | 4.90 / 5.90 → 4.90 / 5.70 ms | 3 | Median pacing unchanged |
| Standard DPR2 heart/noon frame p50 / p95 | 16.90 / 18.00 → 16.70 / 18.20 ms | 3 | Near-60 callback pacing, no downshift; tail not improved |
| Standard DPR2 completed median GPU total | 3.66 → 3.10 ms | 3 | Lower completed median GPU submission cost |
| iGPU heart/noon completed median island / total GPU | 13.82 / 52.81 → 10.23 / 61.35 ms | 3 | Island cheaper; integrated total regressed in these instrumented runs |
| iGPU heart/night completed median island / total GPU | 17.62 / 70.17 → 13.00 / 72.77 ms | 3 | Island cheaper; no total-GPU improvement established |
| iGPU overview/noon completed median island / total GPU | 15.89 / 55.91 → 11.10 / 56.30 ms | 3 | Island cheaper; total essentially unchanged |
| Steady heart/noon renderer programs | 98 → 69 | 3 | Smaller resident program inventory; zero new programs during every measured window |
| Medium→low new programs / maximum interval | 22 / 2785.60 → 0 / 1483.50 ms | 3 | Avoids new quality programs, but long intervals remain |
| Low→medium new programs / maximum interval | 22 / 3216.50 → 0 / 1673.20 ms | 3 | Same qualification |
| First storm new programs / maximum interval | 3 / 3237.10 → 1 / 3168.80 ms | 3 | Residual program creation and multi-second wait; no no-hitch claim |
| Still + normal-motion numerical visual screen | 14 still pairs + 8 filmstrip frames within SSIM≥0.9995 / raw MAE≤0.06 | 22 pairs, independently repeated | Composition retained in inspected views; real sparse fleet-detail differences, not pixel identity |

**Suggested qualified release wording:** “Reduced resident shader programs and removed new program creation from the measured medium/low quality switches. Desktop DPR2 median GPU submission cost improved while median pacing stayed similar. The inspected still and motion scenes remain within the documented image-difference screen, with small repeatable fleet-detail differences. Integrated iGPU pacing and first-storm hitches remain unresolved.”

## 5. Reproduction, cleanup and gate boundary

Reproduction scripts and outputs are intentionally retained as evidence, not runtime scaffolding:

```sh
CI=false node outputs/need-for-speed/integration/final/run-goldens.mjs
CI=false node outputs/need-for-speed/integration/final/run-goldens.mjs outputs/need-for-speed/integration/final/repeat
CI=false node outputs/need-for-speed/integration/final/run-frames.mjs
CI=false node outputs/need-for-speed/integration/final/run-transitions.mjs
node outputs/need-for-speed/integration/final/compare-repeats.mjs
node outputs/need-for-speed/integration/final/summarize.mjs
```

Start the matching Vite origins on 5185/5186 first, as assigned. `run-goldens.mjs` invokes the tracked golden/comparator; steady/transition runners invoke the same shared `runShot`. `crop-diffs.mjs` emits the inspected native-source crop sheets. `aggregate.json` and `tables.md` preserve machine-readable and compact derived results, with every required repetition and no failed capture rows.

**Both owned Vite services were stopped** after capture (`final-branch-vite`, `final-main-vite`); pre-existing servers were not touched. Final observed NVIDIA state was **37°C / 28.31 W / P8**; no sustained thermal measurement is implied. No build, formatter, linter, full unit suite, runtime edit or baseline redefinition was performed in this assignment.

The requested collection is complete. **This is not blanket PLAN §5 acceptance:** it does not add closest zoom, live seasonal transitions, all arrival/reentry/data/failure semantics, timer-unavailable/governor lanes, KHR-absent transitions, production-CDN transport, or native M5/Safari thermal evidence that the narrower assignment did not request. Within the requested lanes, real visual residuals need operator approval, and the iGPU/no-hitch performance objectives remain unestablished. No persisted timing tripwire was rebaselined from this result.
