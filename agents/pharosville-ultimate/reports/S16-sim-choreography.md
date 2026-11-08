# S16

## Executive summary

The foundation is strong: deterministic UTC schedules, berth reservations, clearance-aware routes, and extensive simulation tests. Four priorities emerged: preserve active tows across unrelated refreshes; make simulation footprints match rendered hulls; enforce D10 against effective dock time; and preserve velocity when rerouting. Read-only probes reproduced a 752 m tow teleport, a 5.50→0 m/s transition, and approximately 4.8 percentage points of dock-share distortion. Residual underway overlaps also remain. Fleet work already costs 1.13 ms/frame, with data/simulation adding 0.55 ms; improve choreography within that budget.

## Current state

- Normal traffic uses a six-hour UTC cycle, id-hashed phases, and deterministic allocation. History and worker-parity tests already exist: src/harbour/sim/plan.ts:15, src/harbour/sim/plan.ts:392, src/harbour/sim/sim.test.ts:30, src/harbour/sim/seeds.test.ts:43.
- Berth allocation accounts for neighboring slot conflicts and arrival/departure reservations. Gate congestion is penalized rather than absolutely forbidden: src/harbour/sim/plan.ts:254, src/harbour/sim/plan.ts:397.
- Routes already include astern departure arcs, hull-scaled turning, shoreline repair, slow approaches, and acceleration profiles. These should be refined rather than replaced: src/harbour/sim/routes.ts:30, src/harbour/sim/path.ts:270, src/harbour/sim/path.ts:366.
- Mooring choreography is unusually complete: buoy swing, tide-dependent heading, fender rebound, sequential lines, and yielding to passing hulls: src/harbour/sim/sim.ts:858, src/harbour/sim/sim.ts:872, src/harbour/sim/sim.ts:1287.
- Points-of-sail speed shaping already preserves path effort, while cloth, heel, gusts, galley brailing, and oars supply visual life: src/harbour/sim/path.ts:445, src/harbour/fleet/fleet-system.ts:1235.
- Wakes already scale with speed and hull length, suppress sideways docking trails, and retain curved history. Adding generic speed-aware wakes would duplicate shipped work: src/harbour/fleet/fleet-system.ts:1150, src/harbour/ocean/wake.ts:76.
- The real-geometry tests cover shoreline clearance and tolerate limited underway overlap; empirical D10 tests instead use the synthetic ring harbour: src/harbour/sim/hull-clearance.test.ts:168, src/harbour/sim/harbour-layout.test.ts:153, src/harbour/sim/sim.test.ts:151.
- Supplied profiling records fleet 1.13 ms/frame, data 0.55 ms/frame, and fleet maximum 27.8 ms. These are existing measurements, not measurements from this pass: agents/pharosville-ultimate/BRIEF.md:83.

## Findings

### S16-F1 [high] An unrelated refresh can teleport an active tow to shore

- Evidence: src/harbour/sim/sim.ts:471; src/harbour/sim/sim.ts:505; src/harbour/sim/sim.ts:619
- Detail: Installation initially preserves an authored-slot voyage, then the wrecked-state branch calls placeStatic when the previous model already marked that coin wrecked. An unrelated boat entering the Shoals bypasses the identical-refresh shortcut and triggers this branch. An 80-coin in-memory probe interrupted a ten-second-old tow, moved its hull 751.57 m to Wreck Cove, and left its tug active.
- Fix: Keep a valid ongoing tow before applying static wreck placement. Test unrelated depeg, membership, freshness, and structural refreshes during the tow, including tug completion.

### S16-F2 [high] Simulation clearance underestimates several rendered hulls

- Evidence: src/harbour/sim/sim.ts:474; src/harbour/sim/sim.ts:481; src/harbour/fleet/fleet-system.ts:539; public/harbour/kit/manifest.json:3784
- Detail: Simulation length and beam come exclusively from supply class. Rendering uses each variant's scaled beam and keeps titans at authored length. USDT therefore renders at 32×8.64 m while a flagship simulation footprint is 26×6.6 m. Ordinary variants also exceed class beams. Current clearance tests reuse simulation dimensions, so they cannot detect these discrepancies.
- Fix: Share runtime-neutral rendered footprint metadata with planning, routing, separation, and tests. Include footprint identity in route caches and generated seeds; retain supply class as the analytical size category.

### S16-F3 [high] Effective docking time drifts from D10 supply shares

- Evidence: src/harbour/sim/plan.ts:382; src/harbour/sim/sim.ts:1096; src/harbour/sim/path.ts:581; src/harbour/sim/sim.test.ts:151
- Detail: Planner dock windows are proportional, but runtime borrowing removes unequal amounts from neighboring windows, while spare leg time adds unequal berth holds. A six-hour replay of 625 synthetic coins on real geometry found a flagship's Tron occupancy near 25.1% against its scheduled 30%. Reconstructing effective intervals from exact leg timings gave 25.197%, confirming this exceeds sampling error.
- Fix: Allocate using effective arrival, departure, and hold times after exact path timing. Normalize actual dock occupancy to circuit shares, and add full-cycle D10 checks on real geometry across all circuit hulls.

### S16-F4 [medium] Rerouting preserves position but discards momentum

- Evidence: src/harbour/sim/sim.ts:557; src/harbour/sim/sim.ts:645; src/harbour/sim/path.ts:560; src/harbour/sim/path.ts:667
- Detail: Snapshots retain position and heading but no velocity. Every new voyage receives a rest-to-rest timing profile, even when path.underway is true. A depeg probe changed a sailing flagship from 5.503 m/s to zero at the same timestamp. Underway only changes sail/phase treatment; it does not preserve initial speed.
- Fix: Carry signed velocity into voyage timing and match the first tangent. Test position, heading, and velocity continuity during depeg, recovery, stale diversion, and portfolio replanning.

### S16-F5 [medium] Soft avoidance still permits substantial underway overlaps

- Evidence: src/harbour/sim/sim.ts:1174; src/harbour/sim/sim.ts:1231; src/harbour/sim/harbour-layout.test.ts:181
- Detail: Avoidance sums lateral shoves, caps displacement, and reduces it near obstacles; it cannot reserve crossing space or slow an approaching hull. Replaying the existing half-hour overlap test with current geometry produced 583 overlapping pair-samples against 42,328 underway hull-samples, or 1.38%. Its proxy's worst penetration was 4.63 m. This is numerical proxy evidence, not a rendered-mesh measurement.
- Fix: Prevent predictable fairway conflicts during planning, then retain separation for small residual corrections. Add encounter-level tests for sustained overlap, crossing, overtaking, and narrow exits.

### S16-F6 [medium] Ordinary and event routes lack terminal clearance rejection

- Evidence: src/harbour/sim/plan-paths.ts:45; src/harbour/sim/plan-paths.ts:51; src/harbour/sim/routes.ts:351; src/harbour/sim/sim.ts:652
- Detail: Outings are rejected when unsafe and scenic routes can fall back, but the final ordinary route is not passed through pathClear. repairBlocked also retains the original endpoint when both detours fail. Event voyages bypass this validator entirely. This is a failure-path risk; this pass did not establish a current ordinary route crossing land.
- Fix: Validate every completed path and swept maneuver. Return an explicit failure when repair cannot succeed, then retain a validated safe pose or select another reachable slot.

### S16-F7 [medium] Rendered surge and yaw bypass simulation clearance

- Evidence: src/harbour/sim/sim.ts:1266; src/harbour/fleet/fleet-system.ts:1017; src/harbour/fleet/fleet-system.ts:1027; src/harbour/sim/hull-clearance.test.ts:132
- Detail: Simulation clearance checks the nominal hull pose. Fleet rendering subsequently adds gust displacement, give-way yaw, and storm displacement/yaw without another clearance check. Storm surge alone reaches roughly one metre for a flagship. Thus the existing footprint audit does not establish safety for the pose actually drawn beside a quay or neighboring hull.
- Fix: Reserve a conservative visual-motion envelope or attenuate decorative horizontal displacement and yaw near hard geometry. Audit the same final transforms used by rendering.

### S16-F8 [medium] Tab return mixes UTC relocation with paused visual history

- Evidence: src/harbour/engine/engine.ts:84; src/harbour/engine/engine.ts:248; src/harbour/sim/system.ts:230; src/harbour/fleet/fleet-system.ts:957; src/harbour/ocean/wake.ts:224
- Detail: Hidden tabs stop engine updates, while route playback resumes at current wall time. Wake decay, rig smoothing, and fleet velocity history advance only by the small resumed frame delta. Large displacements are discarded for wake velocity, but existing trails are not aged or cleared. Old wakes can survive beside ships that have already relocated to their current UTC positions.
- Fix: Introduce an explicit resume boundary: reconcile current poses, reset velocity/drift histories, and clear or analytically age wake history before revealing resumed traffic.

### S16-F9 [medium] Reduced motion can hold a new data voyage indefinitely

- Evidence: src/harbour/sim/system.ts:107; src/harbour/sim/system.ts:201; src/harbour/sim/system.ts:231; src/harbour/sim/sim.ts:994; src/harbour/sim/system.test.ts:31
- Detail: Reduced motion holds simulation time, but subsequent data changes still create time-dependent voyages. A newly depegged hull can remain at its departure position indefinitely, and a launch can remain on the ways, until motion is enabled. The model and DOM already describe the new state. DataSystem tests hard-code reduced=false, leaving this interaction uncovered.
- Fix: On data changes under reduced motion, install meaningful static destinations directly. Do not replay skipped travel when motion resumes; preserve real-clock freshness.

### S16-F10 [medium] Path misses still perform expensive geometry work in frames

- Evidence: src/harbour/sim/sim.ts:630; src/harbour/sim/sim.ts:1402; src/harbour/sim/path.ts:344; src/harbour/sim/path.ts:210; src/harbour/sim/warm-legs.worker.ts:46
- Detail: The worker prepares current and near-future paths, but cache misses and lookahead still call buildPlanLegPath synchronously. One path can invoke hundreds of curvature passes and repeated whole-hull clearance relaxation. Limiting lookahead to one path per frame does not bound its duration, and a tab return can miss multiple paths. The supplied fleet spikes do not establish this as their cause.
- Fix: Add revision-owned path refill jobs to the persistent worker, including resume preparation. Instrument path misses separately and preserve exact worker/main parity.

### S16-F11 [low] Flags and sail trim use different wind directions

- Evidence: src/harbour/weather/weather-system.ts:221; src/harbour/fleet/fleet-system.ts:911; src/harbour/fleet/fleet-system.ts:964; src/harbour/sim/sim.ts:140
- Detail: Weather flags and gust travel include decorative wind veer, but sail swing, luffing, and moving-hull heel use the un-veered layout direction. The difference can approach thirteen degrees. Existing polar timing deliberately uses fixed layout wind, so changing route durations is unnecessary to correct the visible disagreement.
- Fix: Expose one display-wind direction for flags, cloth, and decorative heel. Keep schedule geometry and effort normalization stable.

### S16-F12 [medium] Transit copy describes the destination as already reached

- Evidence: src/harbour/sim/sim.ts:954; src/harbour/ui/facts.ts:24; src/harbour/ui/facts.ts:92; src/harbour/ui/facts.ts:95
- Detail: Moving poses store their destination slot. whereabouts checks wreck/Shoals slot kind before movement phase, and explanatory copy describes wrecked boats as beached or depegged boats as anchored. Consequently an active tow or Shoals-bound voyage can receive arrival wording while still crossing the harbour.
- Fix: Resolve transit from pose.event and moving phase before destination-slot classification. Test identical transit wording in hover and panel, retaining the underlying depeg/death facts.

## Ideas

### S16-I1 Keep exceptional voyages intact through refreshes

*enchanting · data-bound · effort S · impact 5 · confidence 5*

- What: Preserve active authored-slot tows before static-state placement. Keep tug ownership until release and return. Add refresh-interleaving tests for another depeg, stale/fresh changes, and membership changes; assert continuous pose and exactly one tow event. Correct destination-first transit wording alongside the lifecycle fix.
- Visitor benefit: A solemn tow completes coherently instead of vanishing to shore during an unrelated market update.
- Data/DOM: Existing Boat.state='wrecked', pose.event=EV_TOW, and moving phase determine transit. Use 'under tow to Wreck Cove' during travel and existing beached wording after arrival. Sources: src/harbour/sim/sim.ts:505, src/harbour/ui/facts.ts:92. No new market threshold.
- Where: src/harbour/sim/sim.ts:471; src/harbour/sim/motion.test.ts:40; src/harbour/ui/facts.ts:24
- Perf: Negligible CPU; zero added draws, triangles, or runtime assets.
- Risks: D10 unchanged: this repairs an existing exceptional voyage. Guard stale handling and avoid restarting completed tows.
- Depends on: —

### S16-I2 Give planning the hull footprint visitors actually see

*prettier · infra · effort L · impact 5 · confidence 5*

- What: Derive shared length/beam metadata from kit variants and titan overrides. Apply it to berth fit, path turning, clearance, and separation. Extend path keys and seed inputs accordingly. Test every family/class fallback and each titan against the rendered scale.
- Visitor benefit: Large ships receive convincing sea room; prominent bows and broad hulls stop defeating otherwise careful clearance logic.
- Data/DOM: No new analytical encoding. Supply class retains its current meaning; the physical footprint follows existing rendered geometry: src/harbour/fleet/fleet-system.ts:539.
- Where: src/harbour/fleet/variants.ts:24; src/harbour/fleet/titans.ts:12; src/harbour/sim/layout-graph.ts:350; src/harbour/sim/plan-paths.ts:11
- Perf: Estimated a few KB of compact metadata; slightly more clearance work for larger hulls; zero draws or triangles.
- Risks: D10 requires retiming after longer routes. Cache identity, worker parity, seed regeneration, and crowded berth capacity must change together.
- Depends on: —

### S16-I3 Make effective dock time satisfy D10

*informative · data-bound · effort L · impact 5 · confidence 5*

- What: Include exact approach duration, borrowed time, and departure/arrival holds in worker allocation. Allocate remaining actual dock seconds by circuit.share. Extend empirical checks to every circuit hull on real geometry for a complete six-hour cycle; separately retain raw-share quantization tolerance.
- Visitor benefit: Watching a coin's visits teaches the supply distribution the panel promises.
- Data/DOM: Existing chainCirculating.current → CircuitStop.share drives occupancy; rawShare remains the panel percentage. No new thresholds or copy. Preserve 'staying at each in proportion to its supply': src/harbour/model/build.ts:43, src/harbour/ui/facts.ts:110.
- Where: src/harbour/sim/plan.ts:382; src/harbour/sim/sim.ts:1089; src/harbour/sim/path.ts:581; src/harbour/sim/sim.test.ts:151
- Perf: More worker-side timing/allocation; target zero additional per-frame work and zero rendering cost.
- Risks: D10 is the acceptance condition. Longer periods may be necessary; never repair timing by silently changing supply shares or allowing occupied-berth holds.
- Depends on: S16-I2

### S16-I4 Carry momentum into reroutes

*enchanting · decorative · effort M · impact 4 · confidence 5*

- What: Snapshot signed velocity and initialize underway voyages with that velocity and tangent. Ease toward their new pace under bounded acceleration instead of starting from rest. Test position/velocity continuity and heading change for depeg, recovery, stale diversion, and replanning.
- Visitor benefit: Ships bear away naturally when their destination changes, without an invisible brake followed by another departure.
- Data/DOM: Existing event destinations and data meaning remain unchanged. Motion interpolation carries no additional market signal: src/harbour/sim/sim.ts:645.
- Where: src/harbour/sim/sim.ts:557; src/harbour/sim/sim.ts:645; src/harbour/sim/path.ts:560; src/harbour/sim/motion.test.ts:77
- Perf: A few additional scalar values per active voyage; zero draws and negligible steady-state CPU.
- Risks: D10: planned rejoin windows must remain feasible. Handle astern velocity, low-speed turns, and already-occupied destinations explicitly.
- Depends on: —

### S16-I5 Reserve fairways before hulls need to shove

*enchanting · decorative · effort L · impact 5 · confidence 4*

- What: Extend worker scheduling from gate penalties to occupancy intervals for narrow exits and crossing nodes. Resolve conflicts deterministically by vessel identity and existing priority rules. Spend slack in validated offshore holding arcs; otherwise stretch the circuit and recompute proportional dwell. Test head-on, crossing, overtaking, and saturated exits.
- Visitor benefit: Busy piers develop readable departures and patient approaches instead of overlapping hulls and lateral sidesteps.
- Data/DOM: Traffic ordering is declared decorative, never a risk or liquidity ranking. Existing supply destinations remain authoritative: src/harbour/sim/plan.ts:397, src/harbour/sim/sim.ts:1210.
- Where: src/harbour/sim/plan.ts:304; src/harbour/sim/plan.ts:397; src/harbour/sim/sim.ts:1115; src/harbour/sim/harbour-layout.test.ts:153
- Perf: Additional worker scheduling and interval memory; zero added draws. Potentially fewer expensive close-pair corrections.
- Risks: D10: unbudgeted waiting at a pier is forbidden. Preserve deterministic UTC playback, bounded queues, reduced-motion stillness, and calm traffic density.
- Depends on: S16-I2, S16-I3, S16-I6

### S16-I6 Reject unsafe routes consistently

*professional · infra · effort M · impact 4 · confidence 5*

- What: Apply final swept-hull validation to ordinary, scenic, outing, and event paths. Return explicit routing failure after unsuccessful repair. Try a validated alternate slot or retain the last safe pose. Make stale diversions respect hull size and neighboring-slot conflicts. Test disconnected lanes, blocked slips, and exhausted suitable berths.
- Visitor benefit: A ship waits safely when geometry is impossible instead of crossing a pier or taking an undersized berth.
- Data/DOM: No new market signal. A held route must expose an honest local route-unavailable status rather than imply successful arrival. Relevant fallback: src/harbour/sim/sim.ts:782.
- Where: src/harbour/sim/plan-paths.ts:25; src/harbour/sim/routes.ts:341; src/harbour/sim/sim.ts:645; src/harbour/sim/sim.ts:782
- Perf: One validation sweep per built route, preferably in the worker; zero steady rendering cost.
- Risks: D10: failed routes cannot count as successful dock occupancy. Avoid indefinite silent holds and preserve the last validated pose during recovery.
- Depends on: S16-I2

### S16-I7 Keep decorative motion inside safe sea room

*prettier · decorative · effort M · impact 4 · confidence 4*

- What: Reserve or clamp a horizontal surge/yaw envelope around the final rendered footprint. Attenuate storm and gust motion beside quays while retaining vertical bob and cloth life. Use the final pose consistently for attachments and wake origins. Test extreme gust, storm, and give-way yaw beside hard geometry.
- Visitor benefit: Moored hulls feel tethered and substantial without their bows or sides passing through stone.
- Data/DOM: Existing DEWS storm strength is unchanged. The mechanism limits decorative displacement for physical clearance; it introduces no new data cue: src/harbour/fleet/fleet-system.ts:1021.
- Where: src/harbour/fleet/fleet-system.ts:1017; src/harbour/fleet/fleet-system.ts:1048; src/harbour/sim/hull-clearance.test.ts:121
- Perf: Estimated 0.05–0.2 ms near obstacles if runtime checks are needed; conservative precomputed envelopes may be cheaper. Zero draws.
- Risks: D10 unchanged. Avoid visible amplitude popping, duplicate clearance work, and disagreement between picking, ropes, wakes, and rendered hulls.
- Depends on: S16-I2

### S16-I8 DECISION-NEEDED: Conceal UTC catch-up on tab return

*professional · ux · effort M · impact 3 · confidence 4*

- What: Add a resume transaction that obtains current poses, resets velocity and avoidance history, and clears or ages wakes. Optionally use a fleet-only fade of at most 250 ms while reconciling. Never interpolate positions across intervening land. Test short/long hidden intervals and reduced motion.
- Visitor benefit: Returning to the harbour feels settled, with current ships and no orphaned trails.
- Data/DOM: UTC routes and real-clock freshness remain authoritative. The optional fade is decorative; reduced motion receives an immediate reconciled static pose.
- Where: src/harbour/engine/engine.ts:84; src/harbour/sim/system.ts:230; src/harbour/fleet/fleet-system.ts:955; src/harbour/ocean/wake.ts:224
- Perf: Event-only history reset and render-target clears; optional existing-material opacity control. No persistent draws or assets.
- Risks: D10 unchanged because canonical simulation time continues. A fade briefly dims ships; immediate reconciliation reveals relocation but avoids that visual treatment.
- Depends on: S16-I10

### S16-I9 Give reduced motion truthful static updates

*all-devices · data-bound · effort M · impact 4 · confidence 5*

- What: When data changes while motion is reduced, place affected boats directly in validated static states instead of creating voyages on a held clock. Keep ordinary held poses stable. Test depeg, recovery, launch, death, stale data, and re-enabling motion with real DataSystem/HarbourSim integration.
- Visitor benefit: Motion-sensitive visitors still see current market states without frozen launch or transit scenes.
- Data/DOM: Use existing Boat.state, circuit shares, and truth.stablecoins.state; no new thresholds. Static Shoals/Wreck placement must agree with existing hover/panel descriptions: src/harbour/ui/facts.ts:92.
- Where: src/harbour/sim/system.ts:107; src/harbour/sim/system.ts:201; src/harbour/sim/sim.ts:490; src/harbour/sim/system.test.ts:31
- Perf: Event-only pose installation; likely less work than retaining paused exceptional voyages. Zero rendering additions.
- Risks: D10 remains the schedule contract; reduced motion uses declared static representation. Do not replay skipped ceremonies or substitute favorable poses for unavailable readings.
- Depends on: S16-I6

### S16-I10 Finish moving path construction out of animation frames

*all-devices · infra · effort L · impact 5 · confidence 4*

- What: Add revision-tagged route-refill requests to the existing persistent worker. Request future and resume paths before consumption, including transition routes from current pose. Keep stale results discardable and caches bounded. Add tests that ordinary playback and resumed playback perform no synchronous buildPath calls.
- Visitor benefit: Departures and tab returns stay smooth while the harbour retains rich, clearance-aware routes.
- Data/DOM: No new data, DOM, or semantics. Preserve exact route answers and installed-revision ownership: src/harbour/sim/warm-legs.worker.ts:42.
- Where: src/harbour/sim/warm-legs.ts; src/harbour/sim/warm-legs.worker.ts:40; src/harbour/sim/sim.ts:630; src/harbour/sim/sim.ts:1402
- Perf: Removes unbounded route-building CPU from frames; adds occasional worker messages and transferred path buffers. Savings require measurement; no draw/triangle cost.
- Risks: D10 and determinism require identical path/timing results. Prevent worker queue starvation, stale-plan adoption, and unsafe substitution when a requested path is late.
- Depends on: —

### S16-I11 Make cloth and flags agree on display wind

*enchanting · decorative · effort S · impact 3 · confidence 5*

- What: Feed veered display wind into sail trim, luffing, and decorative heel, while retaining fixed planning wind and effort-preserving polar timing. Test both veer extremes, tack-side continuity, and agreement with flag direction.
- Visitor benefit: Flags, canvas, and leaning hulls breathe with one believable breeze.
- Data/DOM: DEWS wind strength and all analytical mappings remain unchanged. Decorative direction already exists in weather: src/harbour/weather/weather-system.ts:221.
- Where: src/harbour/fleet/fleet-system.ts:911; src/harbour/fleet/fleet-system.ts:1235; src/harbour/sim/path.ts:445
- Perf: Negligible scalar work; zero draws, triangles, textures, or new route construction.
- Risks: D10 unchanged. Prevent decorative wind from rebuilding schedules, and preserve stable trim under reduced motion.
- Depends on: —

### S16-I12 Soften the existing acceleration profile

*enchanting · decorative · effort M · impact 3 · confidence 4*

- What: Replace sharp acceleration/cruise joins in effort-space timing with short smooth ramps whose integrated distance and total duration remain fixed. Retain existing bend and approach speed limits. Test endpoint speed, bounded acceleration/jerk, monotonic distance, and unchanged arrival time.
- Visitor benefit: Large hulls gather way and settle with weight, especially during close inspection of departures and docking.
- Data/DOM: Speed remains declared decorative. Existing destinations, shares, and arrival windows remain unchanged: src/harbour/sim/path.ts:519.
- Where: src/harbour/sim/path.ts:560; src/harbour/sim/path.ts:665; src/harbour/sim/sim.test.ts:349
- Perf: A few extra arithmetic operations per underway hull; target under 0.05 ms/frame. Zero graphical additions.
- Risks: D10 requires identical effective occupancy. Avoid increased top speed, longer approach occupation, or a spring-like motion style.
- Depends on: S16-I3, S16-I4

### S16-I13 Budget the fleet loop with stage-level evidence

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Extend opt-in profiling around reconciliation, swell, rig motion, transforms, attachments, and uploads. Cache immutable per-coin choices such as the sheer sign currently hashed each frame. Preserve existing offscreen picking/history guarantees. Optimize only measured hotspots and verify pose/upload parity.
- Visitor benefit: More consistent frame pacing leaves room for improved choreography on slower CPUs.
- Data/DOM: No signal or DOM changes. Existing conservative culling and selective uploads remain intact: src/harbour/fleet/visibility.test.ts:116, src/harbour/fleet/uploads.test.ts:15.
- Where: src/harbour/fleet/fleet-system.ts:878; src/harbour/fleet/fleet-system.ts:980; src/harbour/fleet/fleet-system.ts:1249; src/harbour/engine/engine.ts:300
- Perf: Profiling overhead only when enabled. A 0.1–0.3 ms fleet reduction is a target, not an established saving; no added draws or assets.
- Risks: D10 unchanged. Do not reduce simulation accuracy, skip offscreen history, or claim the 27.8 ms fleet maximum is explained before substage measurement.
- Depends on: —

## Top picks

1. S16-I1 — Small, well-supported fix removes a reproduced 752 m teleport and preserves an existing signature moment.
2. S16-I4 — A modest timing change removes the reproduced stop-at-reroute defect across several event types.
3. S16-I2 — Correct physical footprints are foundational: prominent ships currently exceed the dimensions used to protect them.
4. S16-I3 — Repairs a measured violation of the harbour's core supply-share promise before richer queues or timing changes compound it.
5. S16-I10 — Removes unbounded geometry work from playback frames and protects the CPU budget needed by better choreography.

## Operator decisions

- For S16-I8, approve a fleet-only fade of at most 250 ms on tab return, or retain immediate UTC catch-up with wake and rig histories reset? Both preserve D10; the fade briefly dims ships.

## Cross-lane hooks

- Fleet asset owners: publish rendered variant/titan footprints as runtime-neutral metadata; update worker/cache/seed identities together. Relevant contracts: src/harbour/fleet/fleet-system.ts:539, src/harbour/sim/seeds.ts:6.
- Ocean and engine owners: provide a visibility-resume boundary and wake-history reset/aging mechanism. Keep canonical UTC route playback separate from decorative elapsed clocks.
- UI owners: resolve moving EV_TOW/EV_TO_SHOALS before destination-slot wording, and use identical transit language in hover and panel: src/harbour/ui/facts.ts:24.
- Performance owners: retain the supplied 1.13 ms fleet and 0.55 ms data baselines, then measure substage p95 and resume spikes on the Apple Silicon gate before approving added CPU work.
- Validation owners: extend real-geometry checks to effective D10 occupancy, rendered footprints, refresh interleavings, and reduced-motion data changes; retain worker parity and existing clearance coverage.
- Skipped browsers, edits, and the full test suite; read-only in-memory probes used synthetic payloads. Rendered appearance, live-fleet incidence, and Apple Silicon timing remain unverified.
