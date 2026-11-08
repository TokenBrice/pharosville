# S11

## Executive summary

The governor has useful hysteresis, bounded GPU queries, prepared SMAA presets, and strong reduced-motion support. Two synthetic checks against the actual source exposed control defects: 17 ms GPU work presented every 33.3 ms never downgrades, and timerless 48 fps is treated as clean enough to upgrade. Recovery is also slow, automatic resolution stops at DPR 1, display DPR changes are ignored, and the ocean’s low-quality shader variant bypasses preparation. Prioritize correcting those mechanisms, then add refresh-aware pacing, explicit visitor preferences, and sustained laptop validation. No browser or hardware measurements were taken.

## Current state

- High/medium/low use 4096/2048/2048 shadow maps, every-frame/30 Hz/15 Hz interval refresh, 16/8/4 active point lights, 8/7/6 bloom levels, and matching SMAA presets. Sixteen point-light shader slots remain resident across tiers (src/harbour/engine/quality.ts:27; src/harbour/lights/lights-system.ts:246).
- Tiers also change fleet LOD thresholds, line/flag/fender ranges and shadow distance; life shares are 1/0.75/0.45; precipitation budgets are 22000/14000/8000 falling particles and 2600/1600/900 splashes. Low removes ocean mirror-cloud and seagrass shading (src/harbour/fleet/fleet-system.ts:78; src/harbour/life/life-system.ts:28; src/harbour/weather/precip.ts:19; src/harbour/ocean/sea-tone.ts:42).
- GPU strings select the starting rung: software renderers start lowest; recognized discrete GPUs start highest; Apple Max/Ultra starts high@1.5; integrated, unknown, mobile and coarse-pointer devices generally start medium@1.5. These are startup guesses, followed by measurement (src/harbour/engine/quality.ts:71; src/harbour/engine/governor.ts:76).
- The automatic ladder spans low@1 through high@2 and caps against the initial device DPR. Renderer/composer backing resolution scales independently of CSS size. React UI occupies a separate DOM root, so reducing world resolution preserves DOM text sharpness (src/harbour/engine/quality.ts:36; src/harbour/engine/engine.ts:404; src/harbour/app/harbour-app.css:3; src/harbour/ui/mount.tsx:9).
- Decisions begin after a three-second cooldown, then a window ending at 90 frames or 1.5 seconds. Slow means over 6% of frames exceed 21.5 ms, or GPU p10 exceeds 13 ms. Downgrades are adjacent; upgrades require headroom or timerless clean-frame probes with exponential failure backoff (src/harbour/engine/governor.ts:57; src/harbour/engine/governor.ts:212).
- GPU measurement is bounded and state-tagged: four reusable query handles, 256 completed samples, disjoint rejection, and separate p10/p50 telemetry. Quality changes await prepared SMAA programs; shader preparation yields in bounded idle batches and retains submitted programs on timeout (src/harbour/engine/governor.ts:26; src/harbour/engine/post.ts:287; src/harbour/engine/prepare.ts:79; src/harbour/engine/prepare.ts:259).
- Both render paths clamp animation delta to 100 ms. Camera easing, inertia, fleet effects and MotionClock use delta-based integration, including exponential easing; inspected animation paths do not accelerate with 120/144 Hz refresh (src/harbour/engine/engine.ts:263; src/harbour/engine/engine.ts:307; src/harbour/engine/camera-rig.ts:176; src/harbour/engine/input.ts:126; src/harbour/ui/services.ts:102).
- Visibility normally cancels rAF and resets its timestamp on resume, avoiding accumulated animation delta. Fleet simulation and daylight instead sample current wall time, so boats/daylight can jump to their current state without replaying every hidden frame. Scheduled feed refreshes defer while hidden; audio pauses (src/harbour/engine/engine.ts:84; src/harbour/engine/engine.ts:245; src/harbour/sim/system.ts:230; src/harbour/data/fetch.ts:181; src/harbour/audio/controller.ts:82).
- Reduced motion already follows a live media query, holds fleet simulation, eases decorative clocks to stillness, and suppresses camera wake. It does not stop the render loop. Source searches found no battery, saveData or reduced-data policy and no visitor quality/motion controls; rendering requests high-performance power preference (src/harbour/ui/services.ts:65; src/harbour/sim/system.ts:106; src/harbour/app/wake.ts:27; src/harbour/engine/engine.ts:88; src/harbour/ui/CornerMark.tsx:62).
- Existing tests cover tier selection, timerless probes, CPU/GPU distinction, bounded queries and prepared publication. Six in-memory scenarios using transpiled actual source confirmed recovery timings and the two control defects. Existing test suites were inspected, not executed; their timing cases primarily exercise 16.7/33.4 ms inputs (src/harbour/engine/governor.test.ts:35; src/harbour/engine/governor.test.ts:72; src/harbour/engine/quality.test.ts:6).

## Findings

### S11-F1 [high] GPU bottleneck detection can lock an overloaded device at high quality

- Evidence: src/harbour/engine/governor.ts:227; src/harbour/engine/governor.test.ts:77
- Detail: The governor requires GPU time to exceed 60% of the observed presentation interval before lowering quality. Synthetic actual-source execution with 17 ms GPU samples and 33.3 ms frames held high@2 for 30 seconds: 17 ms exceeds the 13 ms budget but falls below 20 ms, so it is classified as CPU-bound. This input represents a plausible missed-vsync boundary.
- Fix: Compare GPU work against the target frame budget rather than a fraction of the already-slow presentation interval. Preserve the existing genuinely CPU-bound case: 1 ms GPU work with 33.3 ms frames.

### S11-F2 [high] High-refresh misses and uneven pacing can be classified as healthy

- Evidence: src/harbour/engine/governor.ts:218; src/harbour/engine/governor.ts:251; src/harbour/engine/engine.ts:249
- Detail: There is no refresh estimate or render pacing target. Every frame at or below 21.5 ms counts as clean. Synthetic timerless 20.83 ms frames, equivalent to 48 fps, upgraded medium@1.5 to high@1.75 within 30 seconds. A 120 Hz display delivering every second refresh is likewise indistinguishable from clean 60 Hz. Fast frames therefore do not establish consistent presentation.
- Fix: Choose an explicit presentation target, measure misses relative to it, and pace rendering at suitable display divisors. Test 60/120/144 Hz and alternating intervals rather than only average frame duration.

### S11-F3 [high] The cheapest automatic rung cannot reduce native-resolution pixel load

- Evidence: src/harbour/engine/quality.ts:36; src/harbour/engine/quality.ts:50; src/harbour/engine/engine.ts:412; agents/claudeville-prettier/exec/INTEGRATION-NOTES.md:39
- Detail: Automatic resolution bottoms out at DPR 1 regardless of canvas area. A 3840×2160 CSS canvas therefore still shades 8.29 million pixels per full-resolution pass at minimum quality. Historical evidence records 68–76 ms GPU frames even at low@1 on Raphael; that measurement was not repeated here. The controller has no further resolution response once this floor is reached.
- Fix: Add pixel-budget-aware subnative rescue rungs while preserving CSS dimensions, DOM UI, analytical cues and the existing viewport gate. Validate whether the residual cost requires shader optimization as well.

### S11-F4 [medium] The low-quality ocean shader bypasses quality preparation

- Evidence: src/harbour/ocean/ocean-system.ts:198; src/harbour/engine/engine.ts:333; src/harbour/engine/post.ts:287
- Detail: Entering or leaving low changes the ocean material’s HB_LITE define and marks it for recompilation. prepareQuality prepares only postprocessing entries, whose tier-specific branch covers SMAA materials. Thus the first ocean draw in the new variant can perform first-use shader work during an already-stressed transition. Preparation guarantees currently exclude a real tier-dependent world shader.
- Fix: Prepare and retain both ocean variants through the existing preparation service before publishing the relevant tier. Add coverage proving the live material is unchanged until readiness and the prepared variant survives later world adoption.

### S11-F5 [medium] Severe startup overload takes several seconds per downgrade

- Evidence: src/harbour/engine/governor.ts:57; src/harbour/engine/governor.ts:155; src/harbour/engine/governor.ts:219; src/harbour/engine/engine.ts:263
- Detail: With sustained 33.4 ms synthetic frames and immediate transitions, medium@1.5 first drops after about 4.4 seconds and reaches low@1 after 12.9 seconds; high@2 takes 24.8 seconds to reach low@1. Async preparation can add delay. Governor timing also receives animation delta capped at 100 ms, understating wall-clock overload when frames are slower still.
- Fix: Separate raw timing from animation delta, shorten startup calibration, and provide an emergency resolution reduction that can bypass adjacent-step cooldowns under sustained severe overload.

### S11-F6 [medium] Display DPR is captured once and never reconciled

- Evidence: src/harbour/engine/governor.ts:74; src/harbour/engine/engine.ts:404; src/harbour/engine/quality.ts:47
- Detail: The ladder is constructed from devicePixelRatio only at engine creation. resize reads the renderer’s existing ratio rather than the current display ratio. Moving a window between 1× and 2× displays, or changing browser zoom, can leave rendering above the new display cap or permanently prevent a sharper rung. This contradicts the ladder’s stated display-cap policy.
- Fix: Reconcile current device DPR on resize and resolution-media changes, rebuild the available ladder, and preserve the nearest valid quality state. Test DPR changes with unchanged CSS dimensions.

### S11-F7 [medium] Visibility changes can start rendering before boot completes

- Evidence: src/harbour/engine/engine.ts:84; src/harbour/engine/engine.ts:122; src/harbour/engine/engine.ts:245; src/harbour/app/harbour-app.tsx:59; src/harbour/app/harbour-app.tsx:120
- Detail: The constructor installs a visibility listener immediately. Returning to a tab during async initialization calls start(), which checks running/disposed/aborted but not booted. It can therefore render and initialize deferred systems before normal boot completion. Conversely, HarbourApp calls start unconditionally after init even if initialization completed while hidden.
- Fix: Require completed boot and visible state before scheduling frames. Keep a clear requested-running lifecycle so visibility restoration cannot restart an intentionally stopped engine. Cover hide/show during initialization.

### S11-F8 [low] Tier changes publish abrupt lighting and population changes

- Evidence: src/harbour/lights/lights-system.ts:264; src/harbour/life/life-system.ts:192; src/harbour/fleet/fleet-system.ts:1060; src/harbour/engine/post.ts:280
- Detail: Hysteresis limits transition frequency but does not blend effects. Removed point-light slots become dark immediately; life density and fleet LOD thresholds change on the next update; bloom/SMAA switch directly. These mechanisms can produce visible changes during automatic adaptation. Their perceptual prominence was not assessed because this lane used no browser.
- Fix: Ease inexpensive light and actor visibility over roughly 500 ms while applying urgent resolution savings immediately. Preserve selected/hovered ship legibility and existing per-boat LOD hysteresis.

## Ideas

### S11-I1 Correct the GPU budget decision

*all-devices · infra · effort S · impact 5 · confidence 5*

- What: Use an explicit frame budget B. Treat GPU p10 above 0.8B as actionable pressure regardless of its share of an already-missed presentation interval. Keep genuinely low-GPU, high-CPU frames on their current graphics rung and expose their cause separately.
- Visitor benefit: Devices near a vsync boundary can recover instead of remaining stuck at half-rate presentation.
- Data/DOM: n/a; changes rendering cost decisions without changing readings.
- Where: src/harbour/engine/governor.ts:225; src/harbour/engine/governor.test.ts:77
- Perf: No added draws or triangles; negligible decision arithmetic.
- Risks: GPU p10 is deliberately resistant to timer backpressure. Preserve that calibration and verify thresholds on real hardware.
- Depends on: —

### S11-I2 Define refresh-aware smoothness and pace presentation

*all-devices · infra · effort M · impact 5 · confidence 4*

- What: DECISION-NEEDED: default to 60 fps on 60/120 Hz and 72 fps on 144 Hz, with native-refresh rendering optional. Infer cadence from clean short rAF intervals, retaining a conservative fallback. Use target budget B, downgrade after over 5% missed target slots in two one-second windows, and upgrade only after 15 seconds below 0.5% misses with predicted GPU cost below 0.65B.
- Visitor benefit: Consistent movement and lower unnecessary GPU work on fast-refresh displays.
- Data/DOM: n/a; paced frames must retain real-time simulation and accumulated animation delta.
- Where: src/harbour/engine/engine.ts:245; src/harbour/engine/governor.ts:218; src/harbour/engine/camera-rig.ts:176
- Perf: No added rendering passes; approximately halves frame submissions at 120/144 Hz under the proposed default.
- Risks: An overloaded stream cannot reliably reveal native refresh. Uniform 60 fps does not divide 144 Hz; test the proposed 72 fps choice and variable-refresh behavior.
- Depends on: S11-I1

### S11-I3 Recover quickly from startup and severe overload

*all-devices · infra · effort M · impact 5 · confidence 4*

- What: Start integrated/unknown/coarse-pointer devices at medium@1, then measure. Replace the initial three-second blind period with 500 ms warmup plus 500 ms calibration. If at least half the intervals exceed 2B for 500 ms, permit a larger resolution reduction. Feed raw visible wall time to the governor while keeping the existing 100 ms animation clamp.
- Visitor benefit: Weak devices spend less of their first visit struggling before adaptation helps.
- Data/DOM: n/a; no data or geometry omission.
- Where: src/harbour/engine/quality.ts:71; src/harbour/engine/governor.ts:57; src/harbour/engine/engine.ts:263
- Perf: Lower initial pixel work; no steady-state added draws.
- Risks: Initial shader/upload hitches must not permanently suppress quality. Emergency reductions should use already-ready paths and retain slow upward recovery.
- Depends on: S11-I1, S11-I4

### S11-I4 Budget backing pixels and add subnative rescue resolution

*all-devices · infra · effort M · impact 5 · confidence 4*

- What: DECISION-NEEDED: trial a four-million-pixel automatic ceiling and additional DPR rungs 0.8, 0.67 and 0.5. Derive the maximum ratio from sqrt(pixelBudget / CSSArea), also respecting device DPR and the existing 2× ceiling. Allow low@0.5 under severe pressure; a 4K CSS canvas then renders about 2.07 million pixels.
- Visitor benefit: Retina and 4K visitors get an attainable rendering budget while DOM text remains sharp.
- Data/DOM: n/a; preserve CSS size, picking coordinates, DOM labels and all analytical objects.
- Where: src/harbour/engine/quality.ts:36; src/harbour/engine/engine.ts:404; src/harbour/ui/mount.tsx:9
- Perf: DPR 0.5 shades 75% fewer pixels than DPR 1 in resolution-scaled passes; actual frame savings require measurement.
- Risks: Thin rigs, emblems and beam edges may soften. Pixel savings cannot fix every geometry or CPU bottleneck; art and hardware review remain necessary.
- Depends on: —

### S11-I5 Reconcile quality when display density changes

*all-devices · infra · effort S · impact 3 · confidence 5*

- What: Observe resolution-media changes and reconcile DPR during resize. Rebuild the ladder only when device DPR changes, retain the closest affordable rung, and reset measurement windows after the backing resolution changes. Preserve deliberate capture overrides.
- Visitor benefit: Dragging the harbour between monitors avoids unnecessary oversampling and persistent blur.
- Data/DOM: n/a; CSS layout and pointer coordinates remain authoritative.
- Where: src/harbour/engine/governor.ts:74; src/harbour/engine/quality.ts:50; src/harbour/engine/engine.ts:404
- Perf: Event-driven work only; one necessary render-target resize per actual density change.
- Risks: Browser zoom can emit repeated events. Deduplicate density changes and clean up media-query listeners.
- Depends on: S11-I4

### S11-I6 Prepare the complete tier-dependent shader set

*all-devices · infra · effort M · impact 4 · confidence 5*

- What: Register the ocean’s HB_LITE and full variants with the existing ProgramPreparation service and retain them alongside SMAA presets. Publish a tier only after its complete shader set is ready. Separately measure the bloom and shadow-target reallocations that still occur at commit.
- Visitor benefit: Automatic quality changes are less likely to introduce a compilation hitch.
- Data/DOM: n/a; existing ocean appearance and meanings remain unchanged.
- Where: src/harbour/ocean/ocean-system.ts:198; src/harbour/engine/engine.ts:333; src/harbour/engine/post.ts:180; src/harbour/world/sun.ts:69
- Perf: One additional resident ocean program variant; driver memory is unmeasured. No added steady-state draws.
- Risks: Preparation must avoid mutating live defines and preserve cancellation, season variants and program lifetime.
- Depends on: —

### S11-I7 Make automatic effect transitions quieter

*all-devices · decorative · effort M · impact 3 · confidence 4*

- What: Fade removed/promoted point-light contributions and decorative actor visibility over 500 ms. Keep resolution reductions immediate, avoid full-frame crossfades, and defer upward tier changes while the visitor is dragging or pinching. Retain selected and hovered ship detail.
- Visitor benefit: Adaptation feels less like lights and inhabitants suddenly changing.
- Data/DOM: n/a; blend decorative quality contributions without altering data-bound signal thresholds.
- Where: src/harbour/lights/lights-system.ts:264; src/harbour/life/life-system.ts:192; src/harbour/fleet/fleet-system.ts:1060
- Perf: No new passes; a few scalar updates and possibly brief overlap in existing instance batches.
- Risks: Fading must not delay emergency savings or fade analytical storm flags, coin identity or freshness cues.
- Depends on: S11-I6

### S11-I8 Offer compact quality and motion preferences

*all-devices · ux · effort M · impact 4 · confidence 5*

- What: Add an on-demand preferences panel beside the existing corner controls: quality Automatic/Economy/High and motion System/Reduced. Persist explicit choices with guarded storage access. Show applied quality inside the panel. Reuse QualityService and MotionService, making override precedence and returning to Automatic explicit.
- Visitor benefit: Visitors can choose quiet laptop operation or stillness without editing URL parameters or operating-system settings.
- Data/DOM: DOM controls use native labeled inputs, keyboard access and explicit selected states; no persistent performance badge.
- Where: src/harbour/ui/CornerMark.tsx:62; src/harbour/ui/services.ts:65; src/harbour/engine/governor.ts:109
- Perf: Small on-demand DOM surface; estimated under 3 KB gzip without dependencies.
- Risks: The current auto setter does not clear pinned DPR. Define capture-override precedence and avoid silently overriding system reduced motion.
- Depends on: S11-I2, S11-I9

### S11-I9 Provide an explicit economy policy with optional device hints

*all-devices · ux · effort M · impact 4 · confidence 3*

- What: Economy caps presentation at 30 fps on 60/120 Hz or 36 fps on 144 Hz and limits effects/resolution. Trial 15 Hz idle rendering under reduced motion, restoring responsiveness on interaction. Feature-detect saveData/reduced-data as suggestions; never require Chromium-only getBattery. Any battery hint remains optional and subordinate to explicit visitor preference.
- Visitor benefit: Long ambient sessions have a deliberate lower-power option across browsers.
- Data/DOM: Do not reduce analytical feed freshness or hide required readings. Explain Economy’s frame-rate tradeoff in the preferences panel.
- Where: src/harbour/engine/engine.ts:88; src/harbour/engine/engine.ts:249; src/harbour/ui/services.ts:65; src/harbour/data/fetch.ts:174
- Perf: Roughly halves submissions versus a 60/72 fps target; energy savings require device measurement.
- Risks: Reduced data is not equivalent to reduced motion or low battery. Static rendering still needs updates for fresh readings, lighting and interaction.
- Depends on: S11-I2

### S11-I10 Make visibility a boot-safe lifecycle boundary

*all-devices · infra · effort S · impact 4 · confidence 5*

- What: Schedule frames only when booted, requested-running and visible. On resume, reset raw timing and governor decision history, reject pre-pause decision samples, and apply a short 500 ms settling period. Preserve wall-clock freshness and current fleet poses without replaying hidden animation frames.
- Visitor benefit: Switching tabs during loading or a long session resumes predictably.
- Data/DOM: Keep model freshness tied to Date.now; hidden time must never make stale readings appear fresh.
- Where: src/harbour/engine/engine.ts:84; src/harbour/engine/engine.ts:245; src/harbour/app/harbour-app.tsx:120; src/harbour/sim/system.ts:258
- Perf: Event-driven state resets; no added steady-state rendering.
- Risks: Do not restart an intentionally stopped engine or discard installed fleet readiness. Cover hidden boot completion and teardown races.
- Depends on: —

### S11-I11 Extend existing performance tools with a paced thermal session

*all-devices · infra · effort M · impact 5 · confidence 5*

- What: Extend the current shared-browser tooling with a 15-minute, visible, automatic-quality session using normal pacing and both timer/timerless paths. Record per-minute frame p95/p99, missed slots, tier/DPR changes, CPU update cost and GPU distributions. Exercise day/night/storm, interaction and tab resume; record AC/battery state manually.
- Visitor benefit: Laptop smoothness is validated after heat buildup, beyond a short desktop capture.
- Data/DOM: n/a; developer diagnostics only, with no hardware identifiers sent remotely.
- Where: scripts/perf/frame.mjs:35; scripts/perf/frame.mjs:73; scripts/perf/soak.mjs:8; docs/pharosville/TESTING.md:145
- Perf: Bounded per-second diagnostic aggregation; measure observer overhead. Existing uncapped profiling remains a separate diagnostic mode.
- Risks: Current frame runs are uncapped and default to pinned high quality; resource soak remounts repeatedly. Neither establishes sustained automatic-governor behavior.
- Depends on: S11-I1, S11-I2, S11-I10

### S11-I12 Turn timing edge cases into deterministic regression traces

*all-devices · infra · effort M · impact 4 · confidence 5*

- What: Extend governor tests with 17 ms GPU/33.3 ms presentation, genuine CPU overload, 60/120/144 Hz cadences, alternating misses, unavailable/disjoint queries, severe overload, a 15-minute slowdown/recovery trace and DPR migration. Assert bounded downgrade latency, conservative upgrade rate and no changes while hidden. Test animation equivalence over equal elapsed time at different refresh rates.
- Visitor benefit: Smoothness fixes remain reliable across future effects and quality changes.
- Data/DOM: n/a; pure timing tests and existing mocked engine harnesses.
- Where: src/harbour/engine/governor.test.ts:15; src/harbour/engine/quality.test.ts:6; src/harbour/engine/engine.test.ts:39
- Perf: Zero production rendering cost; synthetic long sessions execute without real-time waits.
- Risks: Mocks verify controller logic, not GPU calibration. Keep real-device acceptance separate and avoid asserting arbitrary implementation details.
- Depends on: S11-I1, S11-I2, S11-I3, S11-I5, S11-I10

## Top picks

1. S11-I1 — Small correction removes a demonstrated failure to downgrade at a common presentation boundary.
2. S11-I4 — Adds the missing pixel-cost escape for large canvases and already-overloaded low-tier devices.
3. S11-I2 — Defines smoothness across refresh rates and avoids spending every available refresh on ambient rendering.
4. S11-I6 — Closes a concrete shader-preparation gap during quality transitions.
5. S11-I10 — Small lifecycle fix prevents rendering before boot and makes tab restoration predictable.

## Operator decisions

- DECISION-NEEDED: Should Automatic target 60 fps on 60/120 Hz and 72 fps on 144 Hz, with native-refresh rendering optional?
- DECISION-NEEDED: Is automatic subnative world resolution down to DPR 0.5 acceptable under severe load, subject to ship-identity and signal-legibility review?
- Should the visitor preferences expose Automatic/Economy/High quality and System/Reduced motion in the existing on-demand corner controls?
- Which laptop models and power states supplement the locked Apple Silicon Safari/Chrome gate for sustained 15-minute acceptance?

## Cross-lane hooks

- Renderer/ocean work must prepare HB_LITE variants and measure bloom/shadow reallocation separately from shader compilation (src/harbour/ocean/ocean-system.ts:198; src/harbour/engine/post.ts:180; src/harbour/world/sun.ts:69).
- Fleet and visual lanes must review emblems, thin rigs, storm flags and selected-ship visibility at proposed subnative rungs; retain CSS-based picking and LOD sizing (src/harbour/fleet/fleet-system.ts:887).
- UI/accessibility work should reuse the corner’s on-demand pattern and MotionService; preserve keyboard access, system reduced motion and the sorted 720×600 admission gate (src/harbour/ui/CornerMark.tsx:19; src/harbour/ui/services.ts:65).
- CPU-performance work remains necessary when GPU cost is genuinely low: graphics adaptation alone cannot guarantee smoothness, and existing profiling already separates system updates (src/harbour/engine/engine.ts:300).
- Validation work should extend existing shared real-GPU tools, retain the Apple Silicon Safari/Chrome p95 ≤16.7 ms gate, and distinguish paced presentation from uncapped GPU diagnostics (docs/pharosville/TESTING.md:145; scripts/perf/frame.mjs:51).
- Skipped: repository changes, browsers and full test-suite execution. Risk: proposed thresholds, visual transitions, battery savings and thermal behavior still require real-device validation.
