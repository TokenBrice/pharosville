# S13

## Executive summary

Normal operation has useful bounds: the Day book, simulation path cache, GPU samples, feed state, and audio resources have explicit limits or cleanup. Recovery is weaker. WebGL restoration does not rebuild application-owned GPU bakes; installed fleets never recover from worker failure; silent workers can strand arrival; overlay failures escape the shell boundary. The existing soak harness is valuable but repeatedly remounts, omits fault scenarios, and exits successfully when growth is detected. Prioritize explicit recovery states, bounded worker deadlines, overlay containment, and an extended continuous-session soak. No code changed; conclusions come from static inspection.

## Current state

- Day book storage is capped at 200 entries; staging holds one queued moment and at most six starts per rolling hour. src/harbour/model/event-hub.ts:36; src/harbour/model/event-hub.ts:82; src/harbour/model/moments.ts:59.
- Simulation paths plateau around 1,501 cached entries; structural replans clear transient paths and prefetch state. No unlimited path-cache growth found. src/harbour/sim/sim.ts:373; src/harbour/sim/sim.ts:441.
- Asset caches belong to each engine, release resources on disposal, and reject late resolutions. GPU-baked FX textures use reference counting. src/harbour/engine/assets.ts:170; src/harbour/ocean/textures.ts:47.
- Feed failures retain original payload timestamps, retry from 30 seconds to ten minutes, and abort on stop. Freshness is rechecked without successful requests. src/harbour/data/fetch.ts:138; src/harbour/data/fetch.ts:159; src/harbour/sim/system.ts:263.
- Hidden tabs stop rendering; resumed rendering resets the frame timestamp and caps delta at 100 ms. Simulation still uses wall time rather than replaying every missed frame. src/harbour/engine/engine.ts:84; src/harbour/engine/engine.ts:245; src/harbour/sim/system.ts:230.
- The governor uses four query slots and 256-sample rings. Audio pauses timers and idle synthesis while hidden, serializes context transitions, and removes listeners on disposal. src/harbour/engine/governor.ts:4; src/harbour/audio/controller.ts:82; src/harbour/audio/controller.ts:220.
- Worker ownership is persistent, replies correlate by request ID, errors reject pending work, and disposal terminates the worker. DataSystem serializes preparation and rejects obsolete installs. src/harbour/sim/warm-legs.ts:23; src/harbour/sim/system.ts:194.
- The viewport gate remains intact: rejected sizes never reference the lazy Harbour component. The overlay is a separate React root, so the outer shell boundary cannot contain its failures. src/client.tsx:65; src/harbour/ui/mount.tsx:12; src/App.tsx:8.
- An existing real-GPU soak measures refresh/remount resource trends, including optional audio. It supplies a strong foundation, but does not establish 24-hour continuous-session resilience. scripts/perf/soak.mjs:22; scripts/perf/soak.mjs:105.

## Findings

### S13-F1 [high] Context restoration omits application-owned GPU recovery

- Evidence: src/harbour/engine/engine.ts:121; src/harbour/engine/engine.ts:283; src/harbour/ocean/textures.ts:51; src/harbour/ocean/gpu-bake.ts:56; node_modules/three/src/renderers/WebGLRenderer.js:1113
- Detail: Three handles context loss and recreates renderer internals, but application code has no context listeners. Noise and ripple textures are rendered once into GPU-only targets, with their bake passes then disposed. Restoration cannot reconstruct those pixels automatically. The engine also retains governor query handles and continues publishing completed-frame state during loss. A kiosk can lose its picture or procedural content without recovery messaging.
- Fix: Add context lifecycle ownership, pause frame publication during loss, rebuild GPU-only resources and governor state on restoration, and reveal only after a verified restored frame.

### S13-F2 [high] Worker failure permanently stops installed readings from updating

- Evidence: src/harbour/sim/system.ts:146; src/harbour/sim/system.ts:170; src/harbour/sim/system.ts:184; src/harbour/sim/system.test.ts:182
- Detail: Restart is restricted to worker failure before any payload installation. After installation, every preparation uses installedPayloads forever, even when the network delivers fresh readings. Those snapshots correctly age into stale, but the session cannot recover without remounting. simulation-status.unavailable remains false after installed-fleet failure, so the visitor receives no explicit worker-failure explanation.
- Fix: Keep the coherent installed fleet while restarting the worker with bounded backoff; install fresh snapshots atomically when ready and expose a distinct recovery status.

### S13-F3 [high] Silent worker hangs have no deadline

- Evidence: src/harbour/sim/warm-legs.ts:22; src/harbour/sim/warm-legs.ts:52; src/harbour/sim/warm-legs.worker.ts:21; src/harbour/sim/system.ts:179; src/harbour/app/harbour-app.tsx:110
- Detail: Worker startup and prepare promises settle only on replies, explicit errors, or stop. Seed fetching also has no timeout. A live worker that never replies leaves preparation pending indefinitely. When stablecoins already arrived, the pending-data reveal condition no longer applies, so initial arrival can retain the poster indefinitely. Later preparation hangs block all subsequent model and freshness publication.
- Fix: Add separate warmup and preparation watchdogs that terminate the worker, settle waiters, publish honest status, and enter bounded recovery.

### S13-F4 [high] A detail failure can remove the entire overlay

- Evidence: src/harbour/ui/mount.tsx:12; src/harbour/ui/App.tsx:10; src/harbour/ui/App.tsx:116; src/components/section-error-boundary.tsx:14; src/App.tsx:8
- Detail: The overlay creates its own React root without an error boundary. Its Suspense boundary handles loading, not rejected imports or render exceptions. A failed detail chunk or panel render can therefore unmount the overlay, including search, ledger, controls, and accessible analytical content. The shell's SectionErrorBoundary belongs to another root and cannot catch it.
- Fix: Add a boundary around detail content and a final overlay-root boundary, each with a local recovery action and error reporting.

### S13-F5 [medium] Error deduplication grows after reporting stops

- Evidence: src/error-reporter.ts:30; src/error-reporter.ts:103; src/error-reporter.ts:107; src/error-reporter.ts:166
- Detail: send adds each new dedupe key before checking the five-report session budget. Every later unique error message remains in reportedKeys even though no report or history entry is recorded. Errors containing changing values can grow this module-level Set throughout a long faulting session.
- Fix: Check the reporting budget before inserting keys, or use an explicitly bounded deduplication collection.

### S13-F6 [medium] Reconnect recovery waits for old timers

- Evidence: src/harbour/data/fetch.ts:24; src/harbour/data/fetch.ts:174; src/harbour/engine/engine.ts:84; src/harbour/audio/controller.ts:82
- Detail: The feed has no online or visibility-resume handler. Returning connectivity can leave an already-visible harbour waiting up to the ten-minute error backoff before retrying. Returning to a hidden tab also waits for its scheduled recheck rather than promptly refreshing overdue endpoints. Renderer and audio resume independently of data recovery.
- Fix: On online or visible transitions, refresh overdue or failed endpoints once, preserving single-flight ownership and normal producer cadence.

### S13-F7 [medium] Stalled asset loads retain unfinished mounts

- Evidence: src/harbour/engine/assets.ts:36; src/harbour/engine/assets.ts:92; src/harbour/engine/assets.ts:159; src/harbour/engine/engine.ts:154; src/harbour/app/harbour-app.tsx:139
- Detail: Asset requests have neither lifecycle cancellation nor application deadlines. Unmount aborts the engine but deliberately delays disposal until boot settles. If an awaited asset request stalls, the removed mount can retain renderer resources and listeners while later viewport admissions create new engines. AssetStore disposal guards late results but cannot make the pending boot settle.
- Fix: Give asset transports cancellation and deadlines, ensure abort settles boot, and preserve safe cleanup for loaders that resolve after cancellation.

### S13-F8 [medium] Shader link failure can count as successful readiness

- Evidence: src/harbour/engine/prepare.ts:223; src/harbour/engine/prepare.ts:250; src/harbour/engine/engine.ts:283; node_modules/three/src/renderers/webgl/WebGLProgram.js:879
- Detail: Preparation waits for completion and reflects uniforms, but does not check runnable diagnostics or install onShaderError. Three's default link-failure path logs rather than throwing. Consequently a failed shader need not reject preparation or composer.render, while the engine can publish readiness and dismiss the poster. Boot's catch path only covers thrown failures.
- Fix: Capture shader-link failures during preparation and rendering, report a bounded diagnostic, and prevent failed required programs from authorizing reveal.

### S13-F9 [medium] Unavailable readings also trigger stale fog

- Evidence: src/harbour/readings/bind.ts:217; src/harbour/readings/bind.test.ts:102; src/harbour/model/truth.ts:13; agents/pharosville-ultimate/BRIEF.md:24
- Detail: deriveTargets deliberately enables fog after an attempted stablecoins request returns no data. Tests assert this behavior. The brief reserves fog for stale data only, while endpointTruth correctly distinguishes unavailable from stale. A first-load outage therefore gives the stale-data visual without any retained reading to age.
- Fix: Restrict fog to stale retained readings; represent first-load unavailability through neutral world states and explicit DOM messaging. Update the existing contrary test.

### S13-F10 [low] Day book silently drops the beginning of long visits

- Evidence: src/harbour/model/event-hub.ts:82; src/harbour/ui/Panel.tsx:543; src/harbour/ui/Panel.tsx:546; src/harbour/ui/Panel.tsx:557
- Detail: The memory cap is correct, but the heading promises records since arrival even after older entries have been discarded. The panel renders only 40 entries and counts earlier retained entries without explaining the 200-entry retention limit. Multi-day kiosks also show only clock times, obscuring which day an event belongs to.
- Fix: Expose retention metadata, label the record as recent confirmed changes after truncation, and show dates across day boundaries.

### S13-F11 [medium] Soak growth does not fail the command

- Evidence: scripts/perf/soak.mjs:28; scripts/perf/soak.mjs:56; scripts/perf/soak.mjs:59; scripts/perf/soak.mjs:61
- Detail: The harness calculates a growth verdict and writes it to summary.json, but never sets a failing exit code for that verdict. Scripts relying on command success can accept a run whose own resource analysis found growth.
- Fix: Return a nonzero exit code for growth and distinguish insufficient measurements from an observed plateau.

### S13-F12 [medium] Persistent frame errors repeat without visitor recovery

- Evidence: src/harbour/engine/engine.ts:249; src/harbour/engine/engine.ts:274; src/harbour/engine/engine.ts:278; src/harbour/engine/engine.test.ts:149
- Detail: Scheduling the next rAF before frame execution usefully survives a single thrown frame. However, persistent system or composer exceptions repeat indefinitely, skip later systems and publication, and leave the last image or arrival poster without an explanation. An exception after governor.begin also bypasses governor.end. Global reporting observes errors but does not recover the runtime.
- Fix: Add a bounded consecutive-frame failure policy, balance governor query ownership in finally, and enter an accessible recovery state after repeated failures.

## Ideas

### S13-I1 Recover the complete WebGL world

*all-devices · infra · effort L · impact 5 · confidence 5*

- What: Handle context loss/restoration in Engine. Suspend rendering and readiness publication; rebuild GPU-only bakes, preparation state, and governor queries before accepting a restored frame. Test loss before arrival and after fleet installation.
- Visitor benefit: A transient GPU reset recovers with an honest status instead of leaving a blank or partially reconstructed harbour.
- Data/DOM: Graphics lifecycle only. DOM status: “Graphics paused; restoring the harbour.” Keep data freshness independent; never use fog for graphics failure.
- Where: src/harbour/engine/engine.ts:84; src/harbour/ocean/textures.ts:48; src/harbour/engine/governor.ts:165
- Perf: Zero added steady-state draws; restoration incurs resource uploads and bake draws. No measured recovery duration.
- Risks: Inventory all GPU-only targets. Preserve camera, selection, reduced motion, and opt-in audio; do not introduce another renderer.
- Depends on: —

### S13-I2 Restart failed planning workers

*professional · infra · effort M · impact 5 · confidence 5*

- What: Extend the existing restartWarm path to installed fleets using capped backoff. Retain the last coherent model during recovery, then atomically install current payloads. Test crash, repeated failure, successful restart, and obsolete replies.
- Visitor benefit: A temporary worker failure no longer requires reloading a long-running display.
- Data/DOM: Expose planning recovery separately from endpoint freshness. DOM: “Fleet updates paused; retrying.” Retained snapshots retain their original ages.
- Where: src/harbour/sim/system.ts:122; src/harbour/sim/system.ts:146; src/harbour/sim/system.test.ts:182
- Perf: One replacement worker during recovery; temporary seed loading and planning cost. No additional frame work.
- Risks: One worker owner at a time; no main-thread planning fallback or replayed market ceremonies.
- Depends on: S13-I3

### S13-I3 Bound worker waiting time

*professional · infra · effort S · impact 5 · confidence 5*

- What: Add warmup and per-job watchdogs to WarmLegs, clear them on every settlement, and terminate hung workers through the existing fail path. Add fake-timer tests for silence, late replies, cancellation, and slow successful preparation.
- Visitor benefit: Arrival and fresh readings cannot remain pending forever because a worker stopped responding.
- Data/DOM: Timeout is a simulation failure, not stale API evidence. Reuse unavailable/recovering DOM status without fabricating boats.
- Where: src/harbour/sim/warm-legs.ts:22; src/harbour/sim/warm-legs.ts:56; src/harbour/app/harbour-app.tsx:110
- Perf: At most a startup timer and one active-job timer under current serialized preparation.
- Risks: Allow slow-device startup headroom; avoid a timeout/restart loop on constrained tablets.
- Depends on: —

### S13-I4 Contain overlay and lazy-panel failures

*professional · ux · effort M · impact 5 · confidence 5*

- What: Wrap detail content with a recoverable boundary and protect the overlay root separately. Retry rejected detail imports through a fresh lazy component instance. Test chunk rejection and a throwing panel while verifying search controls and analytical access survive.
- Visitor benefit: One broken panel does not remove every control or the accessible data interface.
- Data/DOM: DOM-only failure copy with Retry and Close actions; restore focus and announce failure once.
- Where: src/harbour/ui/mount.tsx:13; src/harbour/ui/App.tsx:116; src/harbour/ui/details.ts:5; src/components/section-error-boundary.tsx:14
- Perf: Small React boundary components; zero GPU draws.
- Risks: React.lazy caches rejection; resetting only preloadDetails is insufficient. Avoid duplicate fallback heading IDs.
- Depends on: —

### S13-I5 Refresh overdue readings on return

*all-devices · infra · effort M · impact 4 · confidence 5*

- What: Track endpoint due times and trigger one deduplicated refresh for failed or overdue endpoints on online/visibility return. Preserve normal producer cadence. Test hidden intervals, reconnect during backoff, rapid transitions, and stop cleanup.
- Visitor benefit: The harbour catches up promptly after sleep or a restored connection.
- Data/DOM: Connectivity events schedule requests only; successful payload evidence determines current/stale/unavailable. Preserve last-good ages and fog semantics.
- Where: src/harbour/data/fetch.ts:145; src/harbour/data/fetch.ts:174; src/harbour/data/fetch.test.ts:27
- Perf: Up to seven overdue requests per return, deduplicated; no recurring frame cost.
- Risks: online is only a hint. Prevent overlapping requests and reconnect storms.
- Depends on: —

### S13-I6 Make asset loading cancellable and finite

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Use engine-owned abort signals and bounded transport deadlines for assets. Evict rejected GLTF/texture promises when retry is supported. Test never-resolving transport, teardown during loading, late resource resolution, and successful retry.
- Visitor benefit: A bad connection cannot indefinitely retain a removed world or strand the arrival screen.
- Data/DOM: Asset failures use the existing arrival guide and links with a retry action; they do not change market readings.
- Where: src/harbour/engine/assets.ts:31; src/harbour/engine/assets.ts:52; src/harbour/engine/assets.ts:154; src/harbour/app/harbour-app.tsx:139
- Perf: One deadline per active transport; cancellation reduces wasted downloads and retained resources.
- Risks: Three loaders need explicit cancellation strategy. Preserve shared-request deduplication and late-resolution disposal.
- Depends on: —

### S13-I7 Treat shader failure as a failed frame

*all-devices · infra · effort M · impact 4 · confidence 5*

- What: Install renderer.debug.onShaderError, record the affected preparation/frame generation, and block readiness for failed required programs. Test link failure through the real callback contract rather than only mocked compile exceptions.
- Visitor benefit: Unsupported shaders produce an understandable recovery screen instead of an apparently ready broken scene.
- Data/DOM: Graphics failure status remains separate from market availability. Retain guide links and a retry action.
- Where: src/harbour/engine/engine.ts:88; src/harbour/engine/prepare.ts:223; src/harbour/engine/engine.ts:366
- Perf: No additional draws; bounded error metadata only on failure.
- Risks: Do not confuse the existing preparation timeout with a shader-link failure. Avoid repeated uploads of full shader sources.
- Depends on: S13-I12

### S13-I8 Keep error reporting bounded during failure storms

*professional · infra · effort S · impact 3 · confidence 5*

- What: Move the report-budget check before dedupe insertion. Add a test emitting thousands of unique errors after exhaustion and assert bounded retained keys, history, and pending requests.
- Visitor benefit: Diagnostics cannot steadily consume memory while an unattended display is already failing.
- Data/DOM: n/a; internal reporter accounting only.
- Where: src/error-reporter.ts:103; src/error-reporter.test.ts:79
- Perf: Reduces memory retention and error-path Set operations; no rendering cost.
- Risks: Preserve cross-category deduplication before budget exhaustion and the existing five-report ceiling.
- Depends on: —

### S13-I9 Separate unavailable readings from stale fog

*professional · data-bound · effort S · impact 4 · confidence 5*

- What: Change deriveTargets so only stale retained stablecoins enable fog. Cover pending, first-request failure, fresh data, aging last-good data, and successful recovery in binding and arrival tests.
- Visitor benefit: Visitors can distinguish missing readings from old readings without learning conflicting visual meanings.
- Data/DOM: Source: model.truth.stablecoins.state. Fog iff state === “stale”. “unavailable” uses neutral cues and DOM “Live readings unavailable”; pending uses “Waiting for the fleet’s readings.”
- Where: src/harbour/readings/bind.ts:217; src/harbour/readings/bind.test.ts:102; src/harbour/app/harbour-app.tsx:23
- Perf: Zero added draws; avoids the stale-fog effect during first-load unavailability.
- Risks: Existing tests intentionally encode the contrary behavior; update copy and tests together.
- Depends on: —

### S13-I10 Extend the existing soak into a recovery gate

*professional · infra · effort L · impact 5 · confidence 5*

- What: Add continuous-mount duration mode to scripts/perf/soak.mjs, plus deterministic outage, worker silence/crash, context loss, sleep/wake, and midnight scenarios. Sample bounded resource trends and recovery latency. Fail on growth or unrecovered faults; test verdict logic with synthetic samples.
- Visitor benefit: A 24-hour ambient session gains evidence that it stays usable and recovers without supervision.
- Data/DOM: Faults must preserve accurate freshness, unavailable messaging, neutral states, and reduced motion. Keep samples bounded or stream them to disk.
- Where: scripts/perf/soak.mjs:37; scripts/perf/soak.mjs:59; scripts/perf/soak.mjs:105; scripts/perf/README.md:42
- Perf: Manual test runtime up to 24 hours; diagnostic sampling overhead only. No production bundle cost.
- Risks: Use the existing shared real-GPU capture path. Logical renderer counters are not resident VRAM; record GC policy and hardware.
- Depends on: —

### S13-I11 Make Day book retention explicit

*professional · ux · effort S · impact 2 · confidence 5*

- What: Expose dropped-entry count or earliest retained time and adjust the heading after truncation. Include dates when entries cross midnight. Test 201-plus entries and a multi-day visit while preserving the existing cap.
- Visitor benefit: Long-session visitors understand exactly which confirmed events remain available.
- Data/DOM: Use event.atMs and retention metadata only. DOM: “Latest 200 confirmed changes” after truncation; no new analytical threshold.
- Where: src/harbour/model/event-hub.ts:82; src/harbour/ui/Panel.tsx:543
- Perf: A small counter and date formatting for at most 40 displayed rows; no GPU cost.
- Risks: Do not remove the memory cap or imply discarded events can be retrieved.
- Depends on: —

### S13-I12 Escalate repeated frame failures safely

*professional · infra · effort M · impact 4 · confidence 5*

- What: Count consecutive frame failures, tolerate isolated exceptions, and stop the loop after a small bounded failure run. Balance governor queries in finally, report the failing stage, and show a recoverable DOM state. Test isolated recovery and persistent failure.
- Visitor benefit: A faulting display explains what happened instead of silently freezing or throwing every frame.
- Data/DOM: DOM: “The harbour paused after a graphics error.” Keep last-reading timestamps visible on demand; never claim new completed frames.
- Where: src/harbour/engine/engine.ts:249; src/harbour/engine/engine.ts:274; src/harbour/engine/engine.test.ts:149; src/harbour/app/harbour-app.tsx:150
- Perf: One counter and exception boundary per frame; zero added draws. Measure overhead during implementation.
- Risks: Do not suppress programming errors or discard a session after one transient exception. Recovery must dispose the previous engine fully.
- Depends on: —

## Top picks

1. S13-I3 — Small change closes indefinite worker waits that can strand both arrival and freshness publication.
2. S13-I4 — Contains ordinary chunk or panel failures before they remove all controls and accessible analytical content.
3. S13-I2 — Reuses existing worker restart machinery to recover sessions that currently remain stale forever.
4. S13-I1 — Addresses GPU resets across the complete application resource lifecycle, beyond Three's renderer restoration.
5. S13-I10 — Builds on an existing harness and makes long-session recovery claims measurable and enforceable.

## Operator decisions


## Cross-lane hooks

- Engine and graphics owners must inventory GPU-only bakes and render-target history for S13-I1; src/harbour/ocean/textures.ts:51 is a confirmed starting point.
- Data-truth and UI owners should align stale/unavailable fog behavior and recovery copy together; src/harbour/readings/bind.ts:217 currently contradicts the brief.
- Accessibility and overlay owners should preserve keyboard focus, local Retry/Close actions, and DOM analytical access when implementing boundaries at src/harbour/ui/App.tsx:116.
- Validation handoff: extend scripts/perf/soak.mjs:105 through the shared real-GPU runner. No browsers, tests, or 24-hour measurements were run here; runtime recovery and resident-memory behavior remain unverified.
