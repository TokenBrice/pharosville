# S09

## Executive summary

The supplied 3.1 ms desktop average extrapolates to approximately 12.4 ms on a 4× slower CPU, leaving 4.3 ms before browser work outside the frame timer. Fleet posing, simulation playback and render submission dominate. Initial planning already uses a worker; freshness checks and React notifications are already throttled. Remaining hitch risks include frame-owned fleet reconciliation, synchronous route-cache misses, civic geometry rebuilds, late batch resizing and texture uploads. The 28–93 ms maxima cannot prove GC or shader compilation without correlated traces. Prioritize staged installation, earlier conservative visibility rejection and ongoing worker path generation. Savings below are engineering estimates, not measurements. Evidence: agents/pharosville-ultimate/BRIEF.md:82; src/harbour/engine/engine.ts:301.

## Current state

- Supplied averages extrapolate at 4× to fleet 4.52 ms, render submission 4.08 ms, simulation/data 2.20 ms and everything else approximately 1.60 ms: 12.40 ms total. Driver waits need not scale linearly, and this is not a p95 prediction. Evidence: agents/pharosville-ultimate/BRIEF.md:82.
- The engine reuses frame state and stops animation while hidden. Its profiler retains sums and independent maxima, without frame-level correlations or percentiles; tasks and React commits outside frame() are excluded. Evidence: src/harbour/engine/engine.ts:63, src/harbour/engine/engine.ts:84, src/harbour/engine/engine.ts:301.
- The 0.55 ms data system mainly runs sim.poseAt() every frame. Freshness checks already run every 30 seconds; network polling follows producer cadence with a minimum one-minute refresh. Throttling fetching would not recover this frame cost. Evidence: src/harbour/sim/system.ts:258; src/harbour/data/fetch.ts:94.
- A persistent worker already prepares allocation and initially required paths, transferring typed buffers. Runtime playback, separation, later cache misses and one-off voyages remain on the main thread. Evidence: src/harbour/sim/warm-legs.worker.ts:40; src/harbour/sim/sim.ts:630; src/harbour/sim/sim.ts:1364.
- Fleet code already reuses vectors, matrices, swell buffers and motion results; reconciles unchanged boats by ID; uploads dirty data rows; and skips some invisible matrix writes. These optimizations should be retained. Evidence: src/harbour/fleet/fleet-system.ts:253, src/harbour/fleet/fleet-system.ts:422, src/harbour/fleet/fleet-system.ts:525.
- Collision avoidance already uses a spatial grid, not unconditional all-pairs comparisons. Two separation passes and moored-yield checks still perform 25 station-pair tests per nearby pair, with expensive shoreline checks afterward. Evidence: src/harbour/sim/sim.ts:1124; src/harbour/sim/sim.ts:1266.
- React does not subscribe to animation snapshots every frame. Frame hooks update positions imperatively; immutable store notifications occur on changes plus a 1 Hz tick. Overlay measurements are cached and reads precede writes. Evidence: src/harbour/ui/hooks.ts:24; src/harbour/ui/store.ts:149; src/harbour/ui/measurements.ts:10.
- Shader preparation already covers real render targets, shadow variants, cancellation and parallel compilation. Its four-millisecond allowance is per preparation operation, not a shared scheduling budget; texture uploads remain indivisible operations. Evidence: src/harbour/engine/prepare.ts:79, src/harbour/engine/prepare.ts:102, src/harbour/engine/prepare.ts:209.
- The governor intentionally holds quality during measured CPU bottlenecks. Its main controls affect resolution, shadows and effects, so CPU-heavy simulation and fleet mathematics need direct optimization. Evidence: src/harbour/engine/governor.ts:225; src/harbour/engine/quality.ts:27.
- The fixed t=11 profile does not characterize live-clock LUT regeneration, active chart labels or selected-route preparation. CPU improvements also cannot resolve the separately reported 68–76 ms integrated-GPU cost. Evidence: src/harbour/engine/post.ts:347; src/harbour/fleet/route-line.ts:125; agents/pharosville-ultimate/BRIEF.md:87.

## Findings

### S09-F1 [high] Fleet installation still runs inside the animation frame

- Evidence: src/harbour/fleet/fleet-system.ts:881; src/harbour/fleet/fleet-system.ts:466; src/harbour/fleet/fleet-system.ts:489
- Detail: Every new model identity enters synchronous reconciliation during update(), allocating collections and potentially painting emblems, rebuilding wreck placements and forcing a complete fleet pose. DataSystem's off-frame preparation does not cover this rendering installation. This is a credible contributor to the supplied 27.8 ms fleet maximum; the profile cannot establish which installation coincided with it.
- Fix: Prepare expensive render deltas before model publication, retain existing ID reuse, and commit a revision-tagged result with the coherent model/sim/readiness state.

### S09-F2 [high] Worker preparation does not eliminate runtime route construction

- Evidence: src/harbour/sim/sim.ts:630; src/harbour/sim/sim.ts:1402; src/harbour/sim/sim.ts:324; src/harbour/fleet/route-line.ts:125
- Detail: Playback cache misses synchronously call buildPlanLegPath(), and lookahead permits one entire path construction per frame without a time bound. Selecting a circuit boat reads its complete itinerary every two seconds; missing paths are built without caching and all leg arrays are copied before RouteLine's signature guard. This can repeatedly perform expensive construction inside UI frames.
- Fix: Extend the persistent worker to service ongoing path and itinerary requests. Cache results by plan revision and leg identity; check itinerary identity before copying or rebuilding.

### S09-F3 [high] Deferred Wreck Cove replaces the live fleet geometry allocation

- Evidence: src/harbour/fleet/fleet-system.ts:718; src/harbour/fleet/fleet-system.ts:726; node_modules/three/src/objects/BatchedMesh.js:1352
- Detail: When the deferred wreck kit arrives, setGeometrySize() recreates the batch geometry and copies existing attributes. The next render must populate replacement GPU buffers. This creates a concrete allocation and upload burst after sailing has begun, even though the new scenery is outside the default views. Its asynchronous task cost can also escape per-system frame accounting.
- Fix: Reserve the eventual geometry capacity before reveal using generated kit counts, then populate deferred ranges without resizing the live batch.

### S09-F4 [medium] Small atlas changes trigger large texture uploads

- Evidence: src/harbour/civic/boards.ts:45; src/harbour/civic/boards.ts:89; src/harbour/fleet/emblems.ts:104; src/harbour/fleet/emblems.ts:163
- Detail: Civic board paint or an individual yard logo marks the entire 2048² canvas texture dirty: 16 MiB of base RGBA pixels, excluding mipmaps. Emblem completion similarly invalidates a combined canvas; growth disposes its previous GL allocation. These operations can move work into render submission. They are plausible contributors to render hitches, not proof of the measured 48.9 ms maximum.
- Fix: Coalesce paints and image completions, stage uploads explicitly, and avoid redundant growth while preserving the existing combined atlas and filtering.

### S09-F5 [medium] Civic changes rebuild geometry during update

- Evidence: src/harbour/civic/civic-system.ts:294; src/harbour/civic/shipyard.ts:389; src/harbour/civic/shipyard.ts:299; src/harbour/civic/boards.ts:125
- Detail: A changed launch set synchronously disposes and merges the yard mesh. Board placement changes rebuild every board and flag using fresh JavaScript arrays, typed buffers and geometry. Wind changes can trigger that shared rebuild even when wall boards are unchanged. These are credible civic spike sources; the 12.3 ms maximum could also contain GC or scheduling pauses.
- Fix: Prepare launch geometry outside update(), and retain board geometry buffers with separate placement and topology dirty flags.

### S09-F6 [medium] Visibility rejection occurs after expensive fleet mathematics

- Evidence: src/harbour/fleet/fleet-system.ts:943; src/harbour/fleet/fleet-system.ts:968; src/harbour/fleet/fleet-system.ts:980; src/harbour/fleet/fleet-system.ts:1007
- Detail: Every boat receives motion easing, gust sampling and five-point swell evaluation before poseHull decides whether its matrix needs updating. Existing culling therefore saves composition and uploads but not much preceding mathematics. Moving hulls use the uncached 25-sine swell branch. This is a strong steady-state optimization target within the 1.13 ms fleet average.
- Fix: Add a cheap conservative view/shadow envelope first, maintain necessary history cheaply, and evaluate detailed swell and decorative motion only for required hulls.

### S09-F7 [low] Immutable signal inputs create garbage every frame

- Evidence: src/harbour/fleet/bunting.ts:81; src/harbour/fleet/storm-cones-mast.ts:87; src/harbour/fleet/fleet-system.ts:1249; src/harbour/civic/burn.ts:28
- Detail: Bunting rebuilds a wanted Set every frame; mast signals map and join unchanged readings; moored boats concatenate and hash their fixed sheer seed repeatedly. Civic smoke parameters and plumeWind create short-lived objects and arrays. These are real allocation sources, but their individual sizes do not establish a 28–93 ms GC pause.
- Fix: Reconcile membership on input changes, cache fixed per-boat hash results, and reuse small parameter objects where allocation traces justify it.

### S09-F8 [medium] Collision cost grows with local density

- Evidence: src/harbour/sim/sim.ts:1160; src/harbour/sim/sim.ts:1183; src/harbour/sim/sim.ts:1287; src/harbour/sim/obstacles.ts:152
- Detail: The grid limits typical comparisons, but clustered occupancy retains quadratic local behavior. Neighbor heading trigonometry and station offsets repeat across pairs and passes. Shoreline correction can evaluate a hull outline several times, with sample count proportional to hull length. This explains substantial simulation work without implying an unbounded global all-pairs loop.
- Fix: Precompute heading/station data once per pose, instrument pair counts and clearance calls, and retain exact collision rules before considering worker playback.

### S09-F9 [medium] Preparation jobs lack a shared main-thread allowance

- Evidence: src/harbour/engine/engine.ts:290; src/harbour/engine/engine.ts:356; src/harbour/engine/prepare.ts:79; src/harbour/engine/prepare.ts:223
- Detail: First rendering starts deferred initialization and idle preparation; first fleet rendering warms all quality presets. Independent jobs each receive an idle allowance, while texture jobs also schedule independently. Several callbacks can consume more than four milliseconds collectively. Non-KHR compilation and individual uploads may exceed any checked deadline.
- Fix: Use one preparation queue with a shared allowance, prioritize current visible content, and record overruns from indivisible driver calls.

### S09-F10 [medium] Live colour grading performs synchronous bulk CPU work

- Evidence: src/harbour/engine/post.ts:25; src/harbour/engine/post.ts:78; src/harbour/engine/post.ts:347; src/harbour/engine/time-of-day.ts:245
- Detail: A changed grade regenerates 32³ pixels inside post.update(), including at least 98,304 exponentiations, then uploads a 256 KiB LUT. Rebuilds are limited to four per second but remain indivisible frame work. Normal clock and weather changes exercise this path; a settled fixed-hour capture can omit it.
- Fix: Bake changed grades in a worker or bounded background slices, retain the previous complete LUT, and publish only the newest completed result.

### S09-F11 [low] Inspection features repeat bounded but avoidable work

- Evidence: src/harbour/ui/Panel.tsx:83; src/harbour/ui/Panel.tsx:366; src/harbour/ui/picking.ts:162; src/harbour/civic/civic-system.ts:260; src/harbour/ui/ChartLabels.tsx:59
- Detail: Whole-store panel subscriptions rerun immutable filtering and sorting on the 1 Hz tick and hover changes. Yard picking loops all yard coins and performs a linear hull lookup for each, producing O(Y²) work. Chart mode allocates culling arrays and height-field marches for visible boat labels every frame. Its greedy label overlap test is O(L²), but L is deliberately small.
- Fix: Use existing slice subscriptions, memoize model-derived lists, index yard positions by ID, and reuse chart culling buffers before introducing more complex indexing.

## Ideas

### S09-I1 Correlate hitches with the work that caused them

*all-devices · infra · effort S · impact 5 · confidence 5*

- What: Extend the existing profiler with a fixed frame ring, p50/p95/p99, rAF gaps and tags for revisions, route misses, geometry changes, texture versions and preparation jobs. Time asynchronous installation tasks separately. Request one permitted real-GPU trace afterward to distinguish GC, driver waits and compilation.
- Visitor benefit: Makes optimization target actual pauses and guards against improving averages while leaving visible hitches.
- Data/DOM: n/a; diagnostic-only, disabled during ordinary visits.
- Where: src/harbour/engine/engine.ts:68; src/harbour/engine/engine.ts:301; src/harbour/engine/prepare.ts:183
- Perf: No direct saving. Target diagnostic overhead below 0.05 ms/frame using preallocated records; measure overhead separately.
- Risks: Profiling can perturb timings. Independent system maxima must never be summed or treated as coincident events.
- Depends on: —

### S09-I2 Prepare fleet render changes before publication

*all-devices · infra · effort L · impact 5 · confidence 4*

- What: Extend the existing revision preparation barrier to stage reconciliation metadata, emblem painting and wreck placement before publishing the new model. Keep unchanged BoatRec identities. Commit the prepared render delta once, preserving complete first-pose and readiness checks; reject superseded preparations.
- Visitor benefit: Fresh readings arrive without a large reconciliation hitch or an incoherent fleet.
- Data/DOM: n/a; preserve current model, pose and DOM revision coherence and all existing analytical mappings.
- Where: src/harbour/sim/system.ts:167; src/harbour/fleet/fleet-system.ts:466; src/harbour/fleet/fleet-system.ts:881
- Perf: Estimated 0–0.05 ms steady saving; target removing 5–20 ms desktop work from heavy install frames, approximately 20–80 ms at 4× CPU cost. Final pose/upload work remains.
- Risks: Moving work into a timer alone does not prevent blocking. Preserve cancellation, atomic readiness and missing-hull behavior; extend reconciliation and arrival tests.
- Depends on: S09-I1

### S09-I3 Reject unnecessary detailed hull work earlier

*all-devices · infra · effort M · impact 5 · confidence 4*

- What: Before five-point swell and decorative calculations, test a conservative envelope against both view and shadow coverage. Maintain velocity and essential history for every boat; retain full evaluation for interaction, debug and revision installation. Restore detailed state before a hull becomes visible or pickable.
- Visitor benefit: Panning and inspecting a small part of the harbour leaves more CPU for smooth motion.
- Data/DOM: n/a; every coin remains simulated and inspectable; visibility changes only rendering work.
- Where: src/harbour/fleet/fleet-system.ts:943; src/harbour/fleet/fleet-system.ts:980; src/harbour/fleet/fleet-system.ts:1007; src/harbour/fleet/visibility.test.ts
- Perf: Estimated 0.15–0.40 ms/frame desktop, 0.6–1.6 ms at 4×, when many boats lie outside both required frusta; little gain at full overview.
- Risks: Incorrect bounds can remove shadows or cause re-entry jumps. Preserve exact interaction behavior and test storm, selected hulls and offscreen casters.
- Depends on: S09-I1

### S09-I4 Keep later route construction in the existing worker

*all-devices · infra · effort L · impact 5 · confidence 4*

- What: Add revision-tagged path-request messages to the persistent worker for upcoming legs and selected itineraries. Cache itinerary results by plan and segment. Remove repeated uncached construction from itineraryOf(); compare revision identity before copying route arrays. Request paths early enough to preserve existing departure timing.
- Visitor benefit: Boats starting new legs and visitors selecting routes avoid expensive synchronous path building.
- Data/DOM: n/a; retain exact path algorithms, supply-share dwell times, stale holds and existing route caption.
- Where: src/harbour/sim/warm-legs.ts:8; src/harbour/sim/warm-legs.worker.ts:40; src/harbour/sim/sim.ts:324; src/harbour/sim/sim.ts:1402
- Perf: Near-zero steady gain when caches hit. Target eliminating 2–15 ms desktop construction bursts, 8–60 ms at 4×; path complexity determines actual savings.
- Risks: Worker latency, evictions and replans must not change analytical timing. Preserve last coherent output and test long sessions, selection and worker failure.
- Depends on: S09-I1

### S09-I5 Reconcile unchanged inputs once and retain dirty state

*all-devices · infra · effort M · impact 3 · confidence 4*

- What: Separate bunting and mast-signal membership reconciliation from animation stepping. Cache each boat's fixed sheer sign at installation. Reuse civic weather/smoke parameter records. Follow existing civic worker dirty-write patterns for settled reduced-motion folk and gull attributes.
- Visitor benefit: Less garbage and redundant upload work during long ambient visits, especially with motion reduced.
- Data/DOM: n/a; preserve signal membership, expiry, launch events and immediate updates when readings change.
- Where: src/harbour/fleet/bunting.ts:81; src/harbour/fleet/storm-cones-mast.ts:87; src/harbour/fleet/fleet-system.ts:1249; src/harbour/life/folk.ts:475; src/harbour/life/gulls.ts:336
- Perf: Estimated 0.02–0.08 ms/frame desktop, 0.08–0.32 ms at 4×; additional held-frame upload savings. GC spike reduction cannot be quantified without allocation traces.
- Risks: Identity guards must include launch expiry and motion changes. Do not freeze incoming data when decorative animation stops.
- Depends on: —

### S09-I6 Reuse collision mathematics across nearby pairs

*all-devices · infra · effort M · impact 4 · confidence 3*

- What: Precompute each hull's heading sine/cosine and station offsets once per pose, then reuse them through both separation passes and moored checks. Iterate a reusable mover-index buffer. Add counters for neighbor pairs and hard-clearance calls; keep current grid and exact response rules.
- Visitor benefit: Dense harbour traffic costs less CPU without reducing the fleet or allowing collisions.
- Data/DOM: n/a; routes, priorities, berth timing and shoreline validation remain unchanged.
- Where: src/harbour/sim/sim.ts:1124; src/harbour/sim/sim.ts:1183; src/harbour/sim/sim.ts:1287; src/harbour/sim/hull-clearance.test.ts
- Perf: Estimated 0.05–0.18 ms/frame desktop, 0.2–0.72 ms at 4×. Approximately 0.1 KiB reusable scratch per hull; gains depend on local density.
- Risks: Do not cache offsets across changing headings or reuse stale spatial data. Verify deterministic pose and clearance parity.
- Depends on: S09-I1

### S09-I7 Keep civic geometry buffers stable

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Give CivicBoards retained attribute buffers and separate topology, visibility and placement dirty flags. Update only affected flag vertices when wind turns. Prepare yard launch meshes outside update(), then swap completed geometry once; keep the existing cached shipwright stations.
- Visitor benefit: Weather changes and launches avoid rebuilding otherwise unchanged civic scenery.
- Data/DOM: n/a; existing launch status, board text and weather mappings remain identical.
- Where: src/harbour/civic/boards.ts:108; src/harbour/civic/boards.ts:125; src/harbour/civic/shipyard.ts:299; src/harbour/civic/shipyard.ts:445
- Perf: Under 0.03 ms/frame average saving expected. Target 1–6 ms desktop reduction on affected rebuild frames, approximately 4–24 ms at 4×, plus less allocation.
- Risks: Retain board UVs, visibility and draw ranges. Old geometry must remain valid until replacement is complete and then be disposed.
- Depends on: S09-I1

### S09-I8 Coalesce and explicitly stage canvas uploads

*all-devices · infra · effort M · impact 4 · confidence 3*

- What: Collect pending civic logo paints and emblem changes into one atlas update per scheduled task. Expose an awaitable texture-stage operation through ProgramPreparation and upload before publishing newly prepared content. Preserve the combined atlas, dimensions, mip chain and filtering.
- Visitor benefit: Late logos and refreshed boards cause fewer rendering pauses while retaining their present appearance.
- Data/DOM: n/a; logo identity and analytical board content remain unchanged.
- Where: src/harbour/civic/boards.ts:89; src/harbour/civic/shipyard.ts:375; src/harbour/fleet/emblems.ts:104; src/harbour/engine/prepare.ts:102
- Perf: Near-zero steady gain. Target 2–10 ms less affected render-submit work through fewer uploads; driver-dependent and not safely multiplied by four. Civic base upload is 16 MiB.
- Risks: One full upload can still block. Scheduling moves work but does not erase it; measure frame gaps and avoid delaying required board content.
- Depends on: S09-I1, S09-I9

### S09-I9 Share one allowance across preparation jobs

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Serialize preparation submissions and texture staging through one queue owned by ProgramPreparation. Start with a shared two-millisecond submission allowance, prioritize current visible materials over unused quality presets, and yield between indivisible operations. Keep existing cancellation and non-KHR behavior.
- Visitor benefit: Post-arrival decoration and quality warming compete less aggressively with sailing frames.
- Data/DOM: n/a; preparation scheduling changes no readings or visual mappings.
- Where: src/harbour/engine/engine.ts:290; src/harbour/engine/engine.ts:356; src/harbour/engine/prepare.ts:79; src/harbour/engine/prepare.ts:209
- Perf: Zero steady-state saving after preparation. Target preventing several independent four-millisecond slices from accumulating around one frame; individual compile/upload calls can exceed the allowance.
- Risks: Overly strict scheduling may starve preparation or hit its 30-second deadline. Track queue age and retain honest timeout behavior.
- Depends on: S09-I1

### S09-I10 Cache inspection data by the revision that changes it

*all-devices · ux · effort M · impact 3 · confidence 4*

- What: Use existing useUISlice() for static panel model content, leaving 1 Hz subscriptions in live subcomponents. Memoize alert/history lists by model. Publish a stable yard-position map and reuse chart culling output buffers. Cache label occlusion briefly while camera and boat displacement remain negligible.
- Visitor benefit: Open panels, chart mode and yard inspection add less CPU work while preserving responsive tags.
- Data/DOM: n/a; retain 1 Hz whereabouts/freshness text, keyboard behavior and all accessible tables.
- Where: src/harbour/ui/Panel.tsx:83; src/harbour/ui/Panel.tsx:366; src/harbour/ui/picking.ts:162; src/harbour/ui/ChartLabels.tsx:39; src/harbour/civic/civic-system.ts:254
- Perf: Almost zero closed-state saving. Estimated 0.03–0.12 ms/frame desktop with chart inspection active, 0.12–0.48 ms at 4×, plus smaller periodic panel bursts.
- Risks: Invalidate caches on camera, model, yard and layout changes. Preserve fresh accessibility text and avoid delayed occlusion after large camera moves.
- Depends on: —

### S09-I11 Bake live colour LUTs away from the render callback

*all-devices · infra · effort M · impact 4 · confidence 3*

- What: Run the existing pure fillGradeLUT() calculation in a small worker using transferable buffers. Keep the previous complete LUT until the newest revision finishes, coalesce superseded grades, and stage the upload. Preserve the existing grade equations and change threshold.
- Visitor benefit: Sunrise, sunset and weather transitions retain smooth frame pacing without changing their colour treatment.
- Data/DOM: n/a; decorative grading only; no change to fog or market cues.
- Where: src/harbour/engine/post.ts:51; src/harbour/engine/post.ts:78; src/harbour/engine/post.ts:347; src/harbour/engine/post.test.ts
- Perf: Target removing 1–5 ms desktop CPU work per actual bake, approximately 4–20 ms at 4×; unmeasured. Each LUT is 256 KiB; double buffering adds roughly 256 KiB.
- Risks: A delayed result must never overwrite a newer grade. Upload work remains; assess whether slight grade latency is visible during forced fast-clock transitions.
- Depends on: S09-I1

### S09-I12 Move playback to the worker only if simpler fixes fall short

*all-devices · infra · effort L · impact 4 · confidence 3*

- What: Extend the existing sim worker to own pose evaluation, separation and transitions at a fixed cadence. Transfer reusable pose buffers with revision and timestamp tags; interpolate continuous rendering values while publishing phase changes and events once. Keep DOM model freshness on wall time.
- Visitor benefit: Weak CPUs retain headroom for input and rendering as fleet size grows.
- Data/DOM: n/a; preserve exact supply-share schedules, stale completion/hold rules, reduced-motion holds and event semantics.
- Where: src/harbour/sim/system.ts:271; src/harbour/sim/sim.ts:1364; src/harbour/sim/warm-legs.worker.ts:40; src/harbour/engine/governor.ts:225
- Perf: Estimated net main-thread saving 0.25–0.45 ms/frame desktop, 1.0–1.8 ms at 4×, after transfer/interpolation. Overlaps S09-I6 and is capped by the supplied 0.55 ms data cost.
- Risks: Highest complexity candidate: worker latency, interpolation through collisions, events, picking and failure recovery need parity tests. Requires no SharedArrayBuffer or isolation-header change.
- Depends on: S09-I1, S09-I4, S09-I6

### S09-I13 Reserve deferred wreck geometry before the fleet is live

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Generate exact wreck-kit vertex/index totals beside the existing asset metadata and include that capacity in the initial fleet batch allocation. Retain deferred download and parsing, but add wreck geometry without setGeometrySize(). Stage changed buffer ranges through the shared preparation queue.
- Visitor benefit: Wreck Cove can arrive without reallocating the entire sailing fleet's buffers.
- Data/DOM: n/a; retain every wreck, epitaph and existing placement rule.
- Where: src/harbour/fleet/fleet-system.ts:350; src/harbour/fleet/fleet-system.ts:718; node_modules/three/src/objects/BatchedMesh.js:1352; scripts/harbour/build-asset-registry.mjs
- Perf: No steady-state saving. Target eliminating one complete live-batch copy/reallocation burst; potentially several milliseconds desktop. Exact byte counts and driver savings require instrumentation.
- Risks: Allocates eventual capacity earlier and may increase first-upload cost. Compare arrival time and peak memory before choosing reservation over a separate static cove batch.
- Depends on: S09-I1, S09-I9

## Top picks

1. S09-I1 — First prerequisite: current aggregates cannot distinguish installation, GC and driver stalls, so correlated evidence prevents costly misdiagnosis.
2. S09-I3 — Best direct steady-state opportunity: reduce work inside the largest measured system while reusing existing visibility infrastructure.
3. S09-I4 — Closes a concrete worker boundary gap and removes repeated selected-route construction without changing route algorithms.
4. S09-I2 — Targets the 27.8 ms fleet hitch category while preserving the existing coherent-revision arrival contract.
5. S09-I9 — A shared allowance improves several post-arrival preparation paths with one scheduling change, particularly near the 4× CPU budget.

## Operator decisions


## Cross-lane hooks

- GPU and loading lanes should correlate render hitches with texture versions, buffer replacement and program counts. The render timer includes composer rendering and recordRendered(), not GPU execution alone: src/harbour/engine/engine.ts:323.
- Fleet, data and arrival owners must preserve revision coherence, full first-pose readiness and stable instance identity when implementing S09-I2: src/harbour/sim/system.ts:201; src/harbour/fleet/fleet-system.ts:1220.
- Simulation work needs deterministic clearance, route timing, stale holds and worker-failure parity checks. Retain the existing spatial grid and test coverage instead of proposing collision avoidance anew: src/harbour/sim/hull-clearance.test.ts; src/harbour/sim/system.test.ts.
- Use supplied measurements as the baseline. Savings are workload-dependent, overlap and must not be summed blindly. A useful follow-up target is below 10 ms main-thread p95 on the 4× CPU case, alongside the real integrated-GPU gate.
- Skipped browsers, captures, edits and runtime tests as requested. Startup checks and static caller tracing completed; final git status remained unchanged.
- Risk: spike causes remain hypotheses until correlated real-GPU traces exist; CPU improvements alone cannot fix the reported integrated-GPU bottleneck.
