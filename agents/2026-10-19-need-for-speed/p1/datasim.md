# DATASIM — data → model → simulation CPU

## 1. Scope and method

Research only. No tracked implementation files, shared `dist/`, shared servers, or world mappings were changed. Read the brief and `AGENTS.md`, architecture/runtime/testing docs, feed/model/truth/readings, simulation/worker/path/route/layout/obstacle sources, and registry/classification/prelaunch consumers. The read-only scout failed at provider capacity; investigation was completed directly.

Artifacts and runnable measurement scripts: `outputs/need-for-speed/datasim/`:

- `fetch.mjs` saves seven successful live dev `/api/*` responses (no credentials) and `payload-summary.json`.
- `bench.ts`, bundled `bench-run.mjs`, and `bench-results.json`: exact current source functions, real layout, decoded real sea SDF, live 623-boat payload; synthetic 625-boat model comparison.
- `seed-verify.mjs` / `seed-verify-run.mjs`, compact seed JSON, and `seed-verify-results.json`: compare seeded and ordinary plans, including typed arrays, dwell maps, and statistics.
- `supplement.mjs` / `supplement-results.json`: projected payload parse times using EDGE's semantic-preserving projection artifacts; seed serialization tradeoffs.
- `profiles.mjs` / `profile-summary.json`: CPU profile aggregation by self and inclusive samples. Inclusive rows overlap; never add parent and child times.
- Captures and CPU profiles use only `npm run preview` / `shot.mjs`. No independent browser launches, source spikes, builds, lint, or test gates.

Commands (from repo root):

```sh
node outputs/need-for-speed/datasim/fetch.mjs
npx esbuild outputs/need-for-speed/datasim/bench.ts --bundle --platform=node --format=esm --packages=external '--define:import.meta.env={"PROD":true,"DEV":false,"MODE":"production"}' --outfile=outputs/need-for-speed/datasim/bench-run.mjs
node outputs/need-for-speed/datasim/bench-run.mjs
npx esbuild outputs/need-for-speed/datasim/seed-verify.mjs --bundle --platform=node --format=esm --packages=external '--define:import.meta.env={"PROD":true,"DEV":false,"MODE":"production"}' --outfile=outputs/need-for-speed/datasim/seed-verify-run.mjs
node outputs/need-for-speed/datasim/seed-verify-run.mjs
node outputs/need-for-speed/datasim/supplement.mjs
node outputs/need-for-speed/datasim/profiles.mjs
npm run preview -- --url http://localhost:5173/ --out outputs/need-for-speed/datasim/profile-1.png --seconds 3 --wait 1000 --profile outputs/need-for-speed/datasim/startup-1.cpuprofile --steady-profile outputs/need-for-speed/datasim/steady-1.cpuprofile --heap-sample outputs/need-for-speed/datasim/heap-1.json --waterfall --json outputs/need-for-speed/datasim/profile-1.json
```

Capture 2 repeats dev without heap sampling; capture 3 targets the existing production-faithful local origin `http://127.0.0.1:4180/` (same dist and real API function, **not CDN latency/cache behavior**). Capture 4 expired after 240 s in the saturated shared capture queue. Worker-event instrumented capture **5 completed**, giving three successful dev repetitions (1/2/5) plus one production-faithful capture, four successful short captures total. It had been queued before the orchestrator prohibited further non-owner capture requests; none were requested after that instruction.

Initial direct `tsx` execution could not handle package CJS/top-level-await and Vite `import.meta.env`; the successful esbuild command above resolves both without changing application source. All CPU and browser timings are **contended**, not hardware acceptance thresholds. No picture-quality claim is made from uninspected captures.

## 2. Measurements

### Payload and parse benchmark

Saved payloads total **2,382,998 B raw JSON**. Node v24; seven repeated batches of 50 parses each, median per individual parse. Projected payload results use seven batches of 100, independently timed under contention; this is not a paired A/B.

| Payload | Raw bytes | JSON.parse median ms | n × batch | Projected bytes (EDGE artifact) | Projected parse median ms |
|---|---:|---:|---:|---:|---:|
| stablecoins | 874,800 | 3.320 | 7 × 50 | 287,820 | 2.748 |
| chains | 163,770 | 0.552 | 7 × 50 | 20,598 | 0.198 |
| stability `detail=true` | 503,256 | 2.085 | 7 × 50 | 1,138 | 0.008 |
| pegSummary | 422,936 | 1.326 | 7 × 50 | 54,733 | 0.422 |
| stress | 229,892 | 1.020 | 7 × 50 | 11,023 | 0.133 |
| safetyGrades | 17,861 | 0.053 | 7 × 50 | 6,381 | 0.041 |
| mintBurn | 170,483 | 0.507 | 7 × 50 | 25,173 | 0.228 |
| Sum of endpoint medians (not joint measurement) | 2,382,998 | 8.862 | — | 406,866 | 3.778 |

The model is cheap compared with planning. Projection primarily wins bandwidth/object retention, not seconds of JSON parsing. EDGE owns contract/projection details and wire measurements; do not double-count that opportunity.

### Model / sim / refresh benchmark

Live fixture: **623 boats** (470 moored-state, 130 circuit-state, 23 shoals, zero wrecked), **868 authored slots**, **87 lane nodes after detours**, 2048² coast channel (**4,194,304 B**). Time is pinned to saved metadata/reference time; no fabricated stale-data state. Layout pier list supplied as in the real `DataSystem`. Results below are the final bench run, medians; earlier independent run had cold constructor 1,099 ms and warm plan 451 ms, showing machine contention.

| Operation | Median ms | n / payload | Important qualification |
|---|---:|---|---|
| sanitize stablecoins **plus structuredClone** | 7.580 | 7 × 10 / live | Includes the benchmark's input clone; **not** sanitizer-only cost |
| buildHarbourModel | 6.376 | 21 × 5 / live 623 | Full model, readings, truth, plan key |
| buildHarbourModel synthetic | 2.814 | 7 × 10 / fixture 625 | Generator in `sim/test-fixtures.ts` |
| buildSimLayout with real coast | 87.021 | 3 / live layout | Includes fields, deck structures, slots, graph |
| HarbourSim cold constructor | 1,347.480 | 3 / live 623 | Includes layout + cold plan, not first full pose paths |
| all representative leg times on fresh layout | 587.967 | 3 / live layout | **Includes buildSimLayout** each repetition |
| outingSeed on fresh layout | 234.832 | 3 / live layout | **Includes buildSimLayout** each repetition |
| buildPlan with leg/outing caches warm | 491.694 | 7 / live 623 | Slot tail reset before each plan; real dynamic allocation remains |
| build all initial `now + soon` paths | 830.834 | 3 / 313 unique requests | 295 now + 18 soon at pinned UTC |
| poseAt after required paths seeded | 2.382 | 3 / live fleet | Short initial call/JIT costs; subsequent steady row is representative |
| poseAt full fleet, warm | **0.439 / frame** | 9 × 60 frames / live | Raw row is 26.350 ms **per 60 poses**, divided by 60 here; sequential 60 Hz timestamps |
| structuredClone layout + coast, one worker request | 3.839 | 7 × 5 | Proxy for serialization/copy, **not measured browser postMessage latency** |
| structuredClone layout only | 2.324 | 7 × 5 | Same qualification |
| structuredClone initial path results, copy mode | 3.825 | 7 × 5 / 5,421,048 typed B | Actual worker **transfers** path buffers, so this is a copy-mode counterfactual |
| identical refresh: build model | 4.043 | 7 / live clone | Same plan key |
| identical refresh: setModel + next pose | 26.357 | 3 / fresh seeded sim | Includes advancing 60 s: newly needed legs may build; not a pure zero-time no-op |
| +0.1% supply refresh: build model | 3.005 | 7 / same coins | See real threshold crossing below |
| +0.1% refresh: setModel + next pose | **1,400.364** | 3 / fresh seeded sim | One hull crosses a real supply-class boundary → full legitimate replan |
| churn refresh: build model | 5.730 | 7 / live-derived | Remove one ID/add one ID; shift top-ten multi-chain balances 30% between first two chains |
| churn refresh: setModel + next pose | **1,616.808** | 3 / fresh seeded sim | Same count 623; distinct plan, launch/rejoin paths |

`refresh-diff-typical.json` proves the +0.1% change preserves every boat's order and circuit: only **alusd-alchemix changes hull class**. This is a legitimate replan trigger, not a bad hash to suppress. It demonstrates that even a small market move can produce a second-scale synchronous refresh. This single synthetic perturbation is **not** evidence of real-world frequency. Quantized 5% dock shares already suppress ordinary circuit drift (`model/build.ts:13–14`).

### Exact layout seed tradeoff

`seed-verify-results.json`: compact baked seeds reproduce every plan boat's arrays/dwell map and plan statistics for this live fleet, **3/3** comparisons. This verifies this fixture only, not every potential plan or path.

| Seed data | Entries | Raw JSON B | gzip B | Brotli B |
|---|---:|---:|---:|---:|
| representative times alone | 72 | 6,024 | 1,137 | 1,036 |
| gate loops + footprints/open parts | 44 gates | 300,885 | 35,097 | 24,670 |
| scenic metres | 360 | 10,035 | 1,453 | 954 |
| outing metres | 4,286 | 145,611 | 33,549 | 22,117 |
| compact combined seed, **no lane-distance grid** | — | **462,618** | **72,099** | **48,934** |
| naive entire seed, grid serialized with numeric object keys | — | 2,116,363 | 702,690 | 487,131 |

The coarse lane grid is 253×250×4 = **253,000 typed bytes**; naive JSON magnifies it. It is used to **generate offshore loops**, not ordinary `homeFrom` path checks (`outings.ts:90–108,306–334`, far=false); existing generated loops and metre answers are enough for the tested plan. Bake only compact answers, versioned with exact layout/SDF/algorithm hash. Do not ship 2 MB of numeric-key JSON or pre-bake every slot-to-slot path. Adoption + buildPlan measured 1,078 ms median (n=3) in a later heavier-contended process; it is not a paired speedup versus the 492 ms warmed row, and does **not** establish a speed regression. The plan allocator remains expensive after seeding.

### Real browser profile evidence

RTX 5070 Ti real ANGLE/Vulkan, 1600×1000@1, 3 s steady windows, 200 µs sampling. Capture 1 additionally heap-samples. V8 sample times include scheduling/sampling error and should not be treated as exact instrumentation. Production function names are minified; source-path aggregation cannot attribute that capture by original function.

| Capture | Origin | First frame nav ms | data init wall ms | first update data wall ms | first render wall ms | Steady frames / p50 ms |
|---|---|---:|---:|---:|---:|---|
| 1 | dev | 13,260 | 1,299 | **5,663** | 589 | 62 / 50.0 |
| 2 | dev | 3,871 | 292 | **2,104** | 155 | 182 / 16.7 |
| 3 | production-faithful local | 10,497 | 629 | **5,081** | 348 | 107 / 33.3 |
| 5 | dev, Worker-message instrumentation | 12,617 | 957 | **6,727** | 480 | 89 / 33.3 |
| **Median dev 1/2/5, n=3, contended** | dev | **12,617** | **957** | **5,663** | **480** | p50 **33.3** |

These mixed-regime, strongly contended captures are evidence of **which work occurs**, not a fair FPS or load-time A/B. The repeated microbench tables above, not a pooled cross-origin mean, supply numerical expectations.

Dev capture 2 sampled inclusive startup: `DataSystem.update` **2,158 ms**, `rebuild` 1,345 ms, `HarbourSim.install` 1,328 ms, `buildPlan` **1,187 ms**, `poseAt` 812 ms, `buildPlanLegPath` **712 ms**, representative leg path subtree ~512 ms. Capture 1 exhibits the same call chain at higher contention (`update` 5,720 ms; plan 3,066 ms; first pose 2,112 ms). Top data self functions include `buildPlan` (263/678 ms in captures 2/1), `install` (139/481 ms), `buildPath` (104/286 ms), and `hard` (82/188 ms).

Capture 2 steady: `poseAt` inclusive **188.1 ms / 182 frames = 1.03 ms/frame**; `evalBoat` 112.1 ms, `separate` 70.3 ms, `restPose` 33.0 ms, `evalLeg` 28.4 ms, `samplePath` **8.84 ms / 182 = 0.049 ms/frame**. Capture 1's 358.8 ms / 62 ≈5.79 ms/frame is substantially more contended and includes ~31 ms of late path building. Do not promise multi-millisecond wins from replacing path interpolation alone.

Capture 5 startup sampling again finds `update` 6,859 ms, `buildPlan` 3,454 ms, `poseAt` 3,043 ms. Its steady pose subtree is326.7ms/89 ≈3.67ms/frame; the three dev per-frame ratios have median **3.67ms/frame**, range1.03–5.79, under very different contention. This is not an optimization A/B or a quiet-frame baseline.

Heap sampling (`heap-summary.json`, capture1) reports **49.41MB total sampled allocation**, **7.12MB under a sim ancestor** over the ~3s window. Simulation entries include `buildPath`1.73MB, route `blocked`1.38MB, `restPose`1.20MB, `keepOffHard`0.67MB, `evalLeg`0.62MB across two stacks. The first two confirm late path construction is not just CPU work. Playback writes preallocated outputs but the heap evidence means **do not claim zero actual V8 allocation**: numeric boxing in non-optimized calls is a possible explanation **[INFERENCE]**, not proved. This capture is early/contended, includes path builds and profiler overhead, and is not a retained-heap or steady-production leak measurement. Removing accidental late path work is the actionable allocation win; numeric-boxing refactors need a warmed production allocation profile first.

Capture 2 waterfall: layout request starts 468 ms; all API requests start 549–550 ms; stablecoins complete 611 ms; SDF starts 550, completes 633 ms; four worker main script requests start **551–554 ms**, priority **VeryLow**. Worker response/end times are absent from page-target waterfall because worker targets own subsequent network events. Therefore it does **not** prove download completion or exact `warm.done` readiness. It does prove the workers are already launched alongside fetch/SDF, not after fleet assets.

**Capture5 worker-message evidence:** four workers constructed at1,258.9–1,259.1ms; `warm` messages posted1,804.5–1,817.2ms, each with4,194,304 coast bytes. Actual main-thread `postMessage` call durations were4.8/3.7/4.2/3.0ms (**15.7ms total**, n=4 workers in one contended run; not a repeated independent median). Three24-entry leg responses and one outing response with253,000 typed grid bytes were delivered12,581.9–12,612.2ms. All four workers were terminated13,555.8–13,555.9ms. **No `paths` message was ever posted.** This directly confirms the early-install path-warming phase lost the race to frame-driven synchronous installation. Message delivery timestamps can be delayed by main-thread blockage; they are not exact timestamps when worker computation finished.

## 3. Worker lifecycle, refresh cadence, and algorithms

### What warm-legs actually does

- `sim/system.ts:87–107` starts all seven feed fetches, begins SDF decode, **immediately constructs workers**, then awaits coast and creates an empty-model sim.
- `warm-legs.ts:33–56`: 1–4 workers (`min(4, hardwareConcurrency−1)`, at least one). Each receives a structured-cloned whole layout and coast, no transfer list: **4 MB coast + 285 KB compact layout JSON-equivalent per worker**, up to **16 MB coast copies**. JSON size is not the exact in-memory object size.
- Every worker independently calls `buildSimLayout`; worker zero computes/publishes outings. Other workers divide the 72 representative harbour-to-harbour leg times and also compute outings for their own path phase (`warm-legs.worker.ts:27–37`). This repeats layout and outing generation across realms, even though they are immutable.
- The first early install is scheduled only after **all seven endpoints settle AND all workers report** (`system.ts:105–107`). Meanwhile `update()` sees `dirty` and synchronously rebuilds/poses without that barrier (`148–164`). If it wins, `installEarly` later sees no dirty data and stops workers (`115–120`). This defeats the shipped off-thread warm strategy in the measured boot call stacks. It is a scheduling/adoption race, not proof that workers should be removed.
- After the plan exists, `paths()` distributes initial `now`/`soon` requests round-robin with appended raft slots (`warm-legs.ts:58–67`). `now` is needed before the first full fleet pose; `soon` is background lookahead. Actual 313 path answers here contain 5.42 MB typed arrays.
- Returned path sample arrays **already transfer their ArrayBuffers** (`warm-legs.worker.ts:23–25,42–49`). Do not re-propose transferring them. Outing grid response is cloned without a transfer list; worker zero still needs its own grid if retained for other generation work.
- Workers terminate after their `soon` result. Refreshes and later uncached one-off voyages use the main thread. A look-ahead cap of **one path per frame** already exists (`sim.ts:1193–1199`), but one path is not a time budget and cold required paths are not capped.

### Refresh cadence and scheduling

`shared/lib/cron-intervals-client.ts:15–28` and registry: stablecoins/chains/pegSummary/safetyGrades **900 s**; PSI/stress/mintBurn **1,800 s** producer intervals. `nextRefreshDelayMs` uses producer phase +45 s grace, clamps to [60 s, interval], or interval/2 without metadata (`fetch.ts:93–99`). Saved responses yielded initial delays: stablecoins184 s, chains183 s, PSI900 s, peg450 s, stress900 s, grades450 s, mint430 s. These are response-specific, not fixed polling settings.

Refreshes while hidden are already postponed/rechecked every minute. Failure backoff is already 30/60/120/300/600 s; last good data are retained. Every success **or failure** notifies subscribers; `DataSystem` discards the endpoint key and marks the entire model dirty (`fetch.ts:166`, `system.ts:89`). Next rAF rebuilds and installs; seven startup responses may coalesce only if they land before the same frame. A 30 s cheap `allTruth` recheck triggers a full rebuild only when truth-state signature changes (`system.ts:152–162`).

Keep freshness evaluation on real wall time. Idle scheduling must not leave a ready new data state indefinitely pending; use a bounded background job and an atomic versioned swap at frame boundary, preserving the old coherent model/plan until the new one is ready. First fleet readiness and missing-data semantics must remain honest. Merely putting a 1.4 s synchronous function into `requestIdleCallback` still creates a 1.4 s task.

### Algorithm map / complexity

- `buildLaneGraph`: obstacle detours use an existing binary-heap A* on a local 4 m grid (`layout-graph.ts:73–151`); all-pairs routes use repeated dense-selection Dijkstra, **O(V³ + VE)**, O(V²) matrices (`155–239`). V=87 here, not thousands; routes are **already precomputed** and `routeNodes` follows table entries, not per-boat A* each frame.
- `buildObstacleField`: scan/rasterize/chamfer transform is O(grid cells + stamped geometry); static for a layout/SDF (`obstacles.ts:101–131`). Deck-distance `hard()` already has a spatial deck grid and squared-distance reject (`layout-graph.ts:388–403`), not an all-decks brute force.
- Plan allocation tests 72 phase candidates for circuits and up to 48 outing offsets over four period attempts. Timeline scans and conflicts can amplify slot tests (`plan.ts:124–146,238–257,379+`). Five-stop cap means at most **4! =24** circuit-order permutations (largest stop fixed), not an unbounded travelling-salesman problem (`model/build.ts:9–14`, `plan.ts:339–350`). Keep choices/order exact when optimizing candidate data access.
- `buildPath` resamples ~1 m, smooths/relaxes, checks whole hull outlines against coast/decks, potentially 40 relaxation iterations (`path.ts:186–245,268–355`). Cold CPU is geometry generation/clearance, not playback sampling. Reusing departure/arrival manoeuvre control geometry by immutable slot+class can avoid repeatedly evaluating the same near-berth clearance search (`routes.ts:38–56,90–139,152+`); it must include all actual destination/via dependencies.
- Playback `samplePath` and effort-coordinate interpolation are **already O(1)** with reusable float scratch (`path.ts:439–449,600–611`). Cursor lookahead avoids repeated segment binary searches (`sim.ts:850–856`). Typed output and separation arrays are preallocated. Dynamic path prefetch, transition/rejoin objects, and refresh installs allocate; steady cached arithmetic is not an object-per-boat-per-frame loop.
- Separation **already uses a 36×36 spatial hash**, neighboring cells, squared broadphase, two passes, and only 25 station pairs after broadphase (`sim.ts:936–1068`). Precomputing each hull's heading sine/cosine and five station offsets once per pose (shared across the two passes and moored-yield checks) preserves positions/order and removes repeated per-neighbor trig/station setup; measure before accepting extra typed scratch.
- `model/readings.ts:98–101` rebuilds/sorts immutable dead-coin readings on every model build, and `build.ts:73–74` remakes dead IDs. `obituary.ts:110–112` already caches richer dead records. Prelaunch is a slim JSON book and `runtime-slim.json`, not a reason to fetch/validate the whole canonical registry (`ui/yard.ts:10–12`). Full dead-list schema validation is explicitly test/sync-only (`shared/lib/dead-stablecoins.ts:6–7`). **S5's emitted Rollup/source-map inventory confirms no zod/classification/registry/schema/coins.generated runtime module**: the heavyweight `classification.ts` → ACTIVE_STABLECOINS source edge is not a present production problem. The static `ui/yard.ts` import does defeat civic's dynamic prelaunch import; S5 owns its26.8KB-gzip book deferral finding.

## 4. Findings / opportunities

Gains are **not additive**: DATASIM-01/02/03 target overlapping cold planning/path work. `[estimate]` marks unimplemented expected gains; measured operations are the ceiling/evidence, not measured patch speedups.

| ID | Opportunity | Evidence | Proposed change | Expected gain / method | Visual impact | Effort | Risk | Dependencies/conflicts | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| DATASIM-01 | Make worker warm/first-plan adoption win before a full fleet pose | `system.ts:105–128,148–164`; first update data2.104–5.663 s dev; same chain in prod5.081 s | Separate fleet preparation from frame update; stage dirty payloads, build exact plan and `now` paths as a coherent job, adopt once ready; do not await unrelated endpoint completion to start essential fleet work. Keep an honest empty/old model until ready. | **[estimate] remove 0.7–2 s first-frame main-thread path work**, bounded by cold seed/path microbenches and ≥2.1 s observed update; wall first-fleet benefit depends on overlap. Warmed allocator still ~0.49 s unless DATASIM-03. | none when exact result/UTC/readiness preserved; verify initial/failure/mixed endpoint arrival ordering + fixed UTC pose equality | M | Medium: double installs, partial snapshots, dispose races | Boot slice readiness/crossfade; DATASIM-02/03 reduce same work, not extra seconds | H for problem, M for gain |
| DATASIM-02 | Bake compact exact layout-only timing/outing seeds | 72 times1.0KB br; combined48.9KB br; plan equality3/3; fresh leg587.97ms + outings234.83ms each include87.02ms layout | Generate versioned seed at asset-generation/build time, adopt before any plan, omit generation-only lane grid; preserve fallback for genuinely different authored layouts in dev, no duplicated production generation path after valid seed | **[estimate] ~0.5–0.65 s cold layout-answer CPU on a realm doing both jobs** (subtract separately measured layout from each fresh timing); workers also avoid repeated outing generation, but path workers still need their layouts. 1KB-br leg-only option has best immediate ROI; compact full seed +49KB br. | none: generated identical inputs, plan fixture equivalence already measured; expand golden layout/plan/path equivalence | M | Low–medium: stale seed/hash drift | Asset generation/versioning; warm worker startup; bake alone does not remove dynamic allocator, layout construction, or required paths | H |
| DATASIM-03 | Keep planning/refresh generation off the animation frame, including genuine replan | Warm plan491.7ms; small real class-crossing refresh1,400ms, churn1,617ms; `sim.ts:353–447`; worker stops after boot | A versioned persistent planning/path worker or deterministic sliced plan builder prepares model→plan and required transition paths, then atomic install; keep per-frame pose evaluation main-thread. Transfer typed plan/path arrays; reconstruct table methods rather than trying to clone closures. | **[estimate] shift ~0.5 s warm allocator and 1.4–1.6 s measured replan task off frame-critical main thread**; total CPU may rise slightly from serialization. Do not promise equivalent wall-time reduction. | none if same plan ordering, coherent snapshot, exact UTC; verify replan/stale/depeg/launch/tow continuity and disposal | L | Medium–high: plan contains Maps/closures and events depend on current pose | DATASIM-01 contract; no naive worker+main duplicate jobs; S5 chunk architecture | H for need, M for design/gain |
| DATASIM-04 | Preserve boat runtime for nonstructural/identical refreshes and target changed endpoint | All endpoint keys discarded; every same-key install still snapshots pose/recreates623 runtimes/hash constants/leg timings (`system.ts:89`, `sim.ts:358–403`); identical refresh26ms +model4ms | Retain dirty endpoint mask; update readings/truth/weather without full runtime replacement when plan key, IDs, hull/event state unchanged. For same-plan boat deltas patch cached runtime fields; still execute real shoals/stale transitions. Cache immutable dead-ID/wreck readings by supplied dead list identity. | **[estimate] save 5–25 ms per identical/enricher refresh**, ceiling26ms includes 60 s path advancement so actual removable share may be smaller; save most of4–6ms full model for unrelated PSI/flows/grades updates | none; verify fresh/stale metadata, DEWS wind, shoals transitions and every UI observer | M | Medium: plan key intentionally excludes shoals, cannot use key alone | Model/readings identity subscribers must still observe real changes; do not suppress legitimate hull-class replans | H |
| DATASIM-05 | Content-address reusable paths across replans; asynchronous future-path generation | Every replan clears all pathCache (`sim.ts:367–373`);313 boot paths830.8ms; one main-thread prefetch/frame1193–1199 | Retain paths with immutable authored slot endpoints+class+loop+layout/SDF hash; plain paths can survive, raft-index paths cannot. Scenic choice must also account for raft-clearance set. Use persistent worker for uncached lookahead instead of one unbounded main-thread build/frame. | **[estimate] save 0.1–0.8 s repeated path CPU/replan**, based on initial830.8ms and unknown overlap; eliminate individual late-build spikes seen (~31ms in capture1 steady subtree). Measure hit ratio under real updates. | none if exact cache dependencies; fixed UTC path/clearance equality, overflow rafts/scenic cases mandatory | M | Medium: raft indices reused and scenicClearOf is plan-dependent | DATASIM-03 lifetime; no unqualified reuse of current `from>to>class` keys | M |
| DATASIM-06 | Project endpoint JSON without dropping on-demand readings | Saved2.383MB→EDGE406,866B; sum parse medians8.862→3.778ms independently timed | Adopt EDGE's complete UI+model field projection, keeping `_meta`, history structural arrays, warning headers and current mappings; avoid accidentally truncating panel histories beyond their actual display needs | **[estimate] ~3–6 ms parse CPU + ~2MB less raw JSON/object retention per refresh**, plus EDGE's measured wire reduction; parsing savings much smaller than planning | none with all panel/model contracts preserved | M | Medium: raw Panel consumers | EDGE owns implementation/byte evidence; don't count twice | H |
| DATASIM-07 | Cache repeated near-slot manoeuvre geometry / plan invariants | `routes.ts:38–56,90–139`; path-heavy startup; representative slot sorting and approach stats layout-only `plan.ts:173–191,554–561` | Memoize immutable departure/arrival geometry by actual dependencies and representative slot/approach statistics per SimLayout; retain exact candidate order and numeric values | **[estimate] 5–15% of cold path generation (~40–125ms over831ms batch)** as a profiling hypothesis, not a measured patch; plan invariant hoist likely single-digit ms | none if exact cache keys; compare all sampled paths/clearances including one-off starts | M | Medium: destination/via/start-heading dependency errors | Lower priority than precompute/async; measure profile call counts before implementation | L–M |
| DATASIM-08 | Hoist repeated neighbor trig/station math in separation | capture2 separate70.3ms/182 =0.386ms/frame; repeated neighbor setup `sim.ts:983–999,1103–1119` | Precompute per-pose hull sin/cos and station offsets into reusable typed scratch; both two separation passes and moored-yield read it, preserving summation order | **[estimate] 10–25% separation CPU =0.04–0.10ms/frame** in capture2; <0.4ms whole routine ceiling | none if equivalent arithmetic; exact/tolerance pose and collision comparisons | S–M | Low–medium: extra scratch/memory access may offset win | Runtime perf slice; not a substitute for fleet transform optimization | M |
| DATASIM-09 | Reduce worker input copies only after big cold work is fixed | warm request clone3.84ms, layout-only2.32ms;4MB coast copied up to4×; path outputs already transferred | Prefer compact seed/shared immutable numeric representation or one worker-owned layout; if multiple workers remain, transfer dedicated coast copies rather than detaching main sim's live buffer. Skip SAB unless cross-origin-isolation product decision is already made. | **[estimate] 3–10ms main serialization saving and up to~12MB fewer coast copies** by reducing4 workers→1; trade off parallel path latency. Not a seconds-level fix. | none; same coast bytes/semantics | S–M | Low for worker count, medium for transfer ownership | Main coast is also used by sim; cannot transfer sole original; path transfer already shipped | H for copy count, M for net gain |
| DATASIM-10 | Optional distant-boat lower-rate simulation with interpolation | warm pose0.439ms/frame Node,1.03ms/frame browser capture2; O(1) sampler only0.049ms/frame | Only if low-power CPU budget still requires it after cold fixes: coherent20–30Hz pose buffers, interpolate rendered poses, keep near/selected/transitioning boats exact and ensure collision neighbors use consistent tick data | **[estimate] net0.1–0.3ms/frame** before interpolation overhead; at most the measured full pose cost. A20Hz sample at5m/s travels0.25m/tick, so plain holding without interpolation is unsuitable. | **visual-risk**, not an established marginal-impact optimization: side-by-side close/far camera, selection, tight turns, dock lines, neighbor separation and reduced-motion checks required | L | High relative to small gain | Fleet/readings interactions; exclude from first implementation tranche | L |
| DATASIM-11 | Reuse complete poses when reduced motion holds the exact sim timestamp | `system.ts:79–86,135–137,164`: `heldAt` fixes sailing clock, but `poseAt` still evaluates every boat and separation each rAF | Return cached PoseBuffer for identical sim time and unchanged model/wind/path-generation version; invalidate on installs/stale transitions/seeds. Keep background path-generation scheduling separate so cache hits do not accidentally starve required jobs. | **[estimate] save ~0.4–1.0ms/frame under reduced motion**, based on warm Node/capture2 full-pose costs; contended observed ceiling is higher. No default-motion benefit. | none: exact same timestamp/input result; verify hold/unhold motionLag, dirty feed and stale/depeg transitions | S–M | Low–medium: invalidation and arrival-stat double counting | FrameLoopIdle slice; model freshness must continue in real time; renderer need not stop for this win | H for redundant work, M for gain |
| DATASIM-12 | Optional bake/hydrate immutable sim graph, fitted authored slots and obstacle fields | buildSimLayout87.0ms main plus repeated worker copies; `layout-graph.ts:155–239,440–484`, `obstacles.ts:101–131` | Extend asset generation to bake deterministic detoured graph/routing tables and berth fitting, hydrate maps/methods at runtime; only consider full binary obstacle grids after measuring compressed-byte/hydration cost | **[estimate] remove50–85ms main boot CPU and~0.2–0.4s aggregate four-worker layout CPU before download/hydration overhead**; measured87ms constructor is ceiling. Derived table size87²×20≈151KB raw; two float obstacle grids at current bounds add~2.02MB raw, compression unmeasured. | none with exact generated values; verify layout/SDF/version hashes and node/slot/path equality | M–L | Medium: extra transfer may cost more than saved CPU, closure/map hydration | Lower priority than compact seeds; coordinate layout/asset generation and worker count; no steady-frame benefit because layout already persists across refresh | M |

## 5. Ruled out / not worth it

1. **Moving all per-frame poses to a worker or vertex shader now.** Cached playback already reuses typed outputs and has O(1) path lookup; the dominant boot/refresh periods are **generation**. Actual VM allocation is not zero in the sampled capture (see heap caveat). GPU path evaluation would still leave CPU exact poses for picking/UI, events, mooring lines, neighbor give-way and land clearance, or duplicate the sim. Likely extra synchronization/upload and a second implementation to replace~0.44ms Node warm pose /1.03ms in the least-contended browser capture (not a quiet baseline). WebGL2 shader-only decorative bob can remain fleet work, but a new canonical GPU sim is not justified here.
2. **Replacing A* with a heap / adding a spatial hash / constant-time sampling.** Already shipped: A* heap, graph route matrices, deck spatial grid, boat spatial hash, uniform path sampling, typed scratch, cursor fast path, and one-path/frame lookahead. Larger all-pairs graph rewrites are not justified for87 nodes; bake immutable output first.
3. **Ignoring plan changes caused by small supply drift.** Five-percent circuit shares are already quantized. The measured0.1% perturbation genuinely changes alUSD hull class. Ignoring it would change data meaning, not optimize the same world. Ignoring supply order/rank would also change deterministic allocation priority (`plan.ts:262–263`).
4. **Naively retaining all cache entries after a replan.** Slot indices beyond authored868 can name different rafts; scenic-vs-plain selection depends on raft clearances. Cache explicit content dependencies, not just old numeric keys.
5. **Shipping full precomputed slot-to-slot paths.**868 slots × six classes × loops × pairs is a huge mostly unused product, while first need here is313 paths/5.42MB typed data. Bake small immutable timing/loop seeds and generate actual live-plan paths as needed.
6. **Dropping boats, cutting stops, lowering collision precision, reducing outing share, or skipping coast checks.** Those change scenery or data meaning and are unnecessary for the high-confidence wins.
7. **General model-loop micro-optimization as the main load fix.** Full model6.4ms versus warm plan492ms/cold paths831ms. Cache immutable dead readings as cheap cleanup, but don't spend a major pass on sorting/array syntax before fixing generation ownership.
8. **Removing schema checks already not in runtime.** Dead registry is a direct typed JSON import validated by tests/sync; prelaunch already uses slim data. Do not re-propose the already-shipped slimming.
9. **Worker download preload alone.** Workers already start alongside API/SDF.20KB-gzip chunk preload cannot remove hundreds of milliseconds of replicated layout/outing/plan/path CPU or the adoption race. Consider only if owner load traces show worker download on the actual critical path.
10. **requestIdleCallback around an unchanged monolithic plan.** It moves when a long task happens, not its duration. Use staged versioned jobs/slices/off-thread work, deadline and atomic installation; keep freshness semantics.

## 6. Open questions / operator decisions

- No product decision blocks the recommended first tranche (DATASIM-01/02/04). Implementation must decide whether exact dynamic planning runs in a persistent worker or a deterministic sliced main-thread job; worker-owned serialized plan requires an explicit cloneable representation for closure-backed `legSeconds/laneMetres`.
- Confirm acceptable additional49KB Brotli immutable seed asset (or land the1KB representative-only seed first). Version/hash must include SDF, hull dimensions, layout, and algorithm constants. Expanding deterministic fixture equivalence is a required implementation check, not completed release validation here.
- Real refresh frequency/hit ratios remain unknown: this research simulates identical, uniform small change, and explicit churn, not a day-long live trace. Instrument refresh plan keys and path-cache misses in a targeted measurement build before choosing cache budget/pool count; no permanent telemetry is requested.
- Capture5 establishes late main-thread seed delivery and no path-phase use; exact worker CPU-ready times remain unknown because completion callbacks can queue behind main-thread long tasks. The page waterfall also omits worker-target completion events. This is a measurement limitation, not a blocker to fixing observed synchronous generation.
- Lower-rate far simulation is a visual-risk candidate, not cleared for the “no/marginal scenery impact” implementation plan. Keep it out unless the operator explicitly authorizes and its visual verification succeeds.

## Recommended order

1. Correct first fleet preparation/adoption ownership and avoid fallback generation in the first animation frame (DATASIM-01).
2. Bake exact small layout seeds (DATASIM-02), initially representative times if minimizing byte risk.
3. Stage real refresh/replan work off-frame and preserve nonstructural runtimes (DATASIM-03/04).
4. Retain only content-valid paths and move late lookahead generation off the frame (DATASIM-05).
5. Merge EDGE's projection; only then profile small arithmetic/cache opportunities. Keep canonical pose playback CPU-side.
