# S04

## Executive summary

Arrival already has a useful guide, restrained animation, rendered-fleet readiness checks, and rich inspection panels. The largest problems are semantic: unavailable readings can be described as calm, and the storm legend contradicts the rendered signal. First-visit teaching can expire before reveal; degraded rendering loses its explanation; advanced actions remain difficult to discover. Prioritize truthful empty states, corrected signal copy, recoverable detail loading, and an optional five-stop guide built from existing camera and panel mechanisms. All timing below is code-derived, not measured navigation performance.

## Current state

- 0 s, once HTML/CSS arrive: a decorative poster, wordmark, three guide rows, analytics links, and “Raising the harbour.” The guide explains boats, PSI, off-peg water, stress, and stale fog. Evidence: index.html:37, index.html:45, src/components/arrival-shell.tsx:5.
- Admission precedes React and world discovery. Both physical screen and viewport must satisfy sorted 720×600 dimensions. Denied visitors receive an illustrated guide and useful analytics links. Evidence: src/main.tsx:14, src/main.tsx:27, src/client.tsx:65.
- At navigation +2 s there is no guaranteed scene. Engine initialization and preparation must finish first. The pending-data deadline starts at the first completed render, then waits another 2 s. Evidence: src/harbour/engine/engine.ts:145, src/harbour/app/harbour-app.tsx:59, src/harbour/app/harbour-app.tsx:84.
- Successful reveal requires the prepared revision and rendered boat count to match. Failed data reveals a boatless scene; incomplete prepared fleets reveal after more than 3 s. Evidence: src/harbour/app/harbour-app.tsx:89, src/harbour/app/harbour-app.tsx:96, src/harbour/app/harbour-app.tsx:110.
- From reveal: arrival text fades over 700 ms; poster fades over 1100 ms; shell unmounts at 1200 ms. Details preload immediately. Reduced-motion CSS collapses the fades. Evidence: public/arrival-shell.css:30, public/arrival-shell.css:39, public/arrival-shell.css:90, src/harbour/app/harbour-app.tsx:77.
- Normal-motion arrival pulls back 12%, then drifts inward for 6.5 s. Beacon kindling reaches full strength at 2.9 s. Pointerdown, wheel, or keydown interrupts it; reduced motion skips it. Evidence: src/harbour/app/wake.ts:14, src/harbour/app/wake.ts:24, src/harbour/app/wake.ts:39.
- First-visit caption starts 1.4 s after model.hasFleet, lasts 7 s, and immediately records harbour.intro.seen. It teaches hover, L, and /; touch copy teaches tap, hold, and pinch. Evidence: src/harbour/ui/CornerMark.tsx:30, src/harbour/ui/CornerMark.tsx:34, src/harbour/ui/CornerMark.tsx:72.
- First hover requires at least 6 px of genuine pointer travel. Openable targets receive a pointer cursor; the tag supplies a name and fact. Clickability exists, but the desktop caption never names clicking. Evidence: src/harbour/ui/store.ts:196, src/harbour/ui/store.ts:203, src/harbour/ui/HoverTag.tsx:105.
- First click selects, reveals a route for boats, and flies to framing clear of the panel. Panels focus their heading and explain why the vessel is there, supply, circuit, peg, and provenance. Evidence: src/harbour/ui/store.ts:322, src/harbour/ui/store.ts:331, src/harbour/ui/Panel.tsx:48, src/harbour/ui/Panel.tsx:133.
- Within 60 s, correct interpretation depends on voluntary inspection. The ledger contains detailed semantics and decorative exceptions, but its keyboard list follows twelve legend entries. W never starts automatically; idle breath begins only after 180 s. Evidence: src/harbour/ui/Ledger.tsx:63, src/harbour/ui/Ledger.tsx:124, src/harbour/ui/watch.ts:8, src/harbour/ui/watch.ts:47.

## Findings

### S04-F1 [high] Missing readings can be presented as a healthy market

- Evidence: src/harbour/ui/facts.ts:172; src/harbour/ui/Panel.tsx:306; src/harbour/ui/Panel.tsx:375; src/harbour/model/build.ts:68
- Detail: An awaiting model has no boats or shoals. The Shoals hover calls this “clear water · nobody off peg,” its panel says “No coin is off its peg,” and an empty stress list says “Calm.” These paths also occur when relevant endpoints are unavailable. A freshness footer does not undo the affirmative health claim.
- Fix: Gate healthy empty-state wording on fleet availability and the relevant reading’s availability and coverage. Use “Peg readings unavailable” or “Stress readings unavailable” otherwise; label retained stale observations explicitly. Cover null, pending, failed, empty, and partially covered models.

### S04-F2 [high] Storm teaching contradicts the rendered mast

- Evidence: src/harbour/ui/Ledger.tsx:99; src/harbour/ui/Panel.tsx:371; src/harbour/ui/facts.ts:181; src/harbour/readings/bind.ts:151; src/harbour/readings/storm-cones.ts:5
- Detail: Legend, hover, and panel describe one cone per Alert-or-worse coin, capped at five. The renderer instead shows the supply-weighted weather band: one cone at Watch, two at Alert, cones plus drums at Warning/Danger. Following the teaching produces an incorrect market reading even with valid data.
- Fix: Preserve the rendered mapping. Explain the station’s aggregate band using readings.stormBand and readings.cones; label the separate affected-coin list as a count. Keep individual vessel masthead signals distinct. Add a parity test where aggregate band and alert count differ.

### S04-F3 [medium] First-visit teaching can be consumed before it is visible

- Evidence: src/harbour/ui/CornerMark.tsx:30; src/harbour/ui/CornerMark.tsx:34; src/harbour/app/harbour-app.tsx:96; public/arrival-shell.css:28
- Detail: The caption starts from model.hasFleet, independently of poster reveal. A prepared but incompletely rendered fleet can leave the poster covering the caption while its seven-second lifetime runs. The seen flag is written immediately; background tabs also consume the timer. There is no dismiss or replay control.
- Fix: Coordinate caption eligibility with visible reveal and document visibility. Record acknowledgement after explicit dismissal or guide activation, retain a replay entry, and preserve in-session behavior when storage is unavailable.

### S04-F4 [medium] Incomplete rendering loses its warning and can still read as live

- Evidence: src/harbour/app/harbour-app.tsx:28; src/harbour/app/harbour-app.tsx:69; src/harbour/app/harbour-app.tsx:79; src/harbour/ui/bits.tsx:7; public/arrival-shell.css:41
- Detail: The partial-fleet warning exists only in the arrival shell, which begins fading immediately and unmounts after 1.2 s. CornerMark derives live status solely from model freshness, without rendered-fleet coverage. Fresh data with missing displayed boats can therefore receive a green live dot after its only explanation disappears.
- Fix: Carry presentation readiness into UI status independently of endpoint freshness. Expose incomplete display counts through wordmark focus/hover and the Keeper’s Log until repaired; never describe model freshness as proof of complete presentation.

### S04-F5 [high] A failed first detail import can remove the entire overlay

- Evidence: src/harbour/ui/App.tsx:10; src/harbour/ui/App.tsx:116; src/harbour/ui/details.ts:5; src/harbour/ui/mount.tsx:12; src/App.tsx:8
- Detail: The independently mounted UI root has Suspense but no error boundary. A rejected lazy DetailPanels import can unmount the overlay, including wordmark, search, ledger, and keyboard listeners, while the world continues. The outer application boundary belongs to another React root and cannot contain this failure.
- Fix: Add a local detail error boundary with an immediately closable failure surface and reload action. Preserve the rest of HarbourUI. If offering an import retry, recreate the rejected lazy component identity as well as resetting the preload promise.

### S04-F6 [medium] Arrival kindling temporarily suppresses a valid analytical beacon

- Evidence: src/harbour/app/wake.ts:17; src/harbour/app/wake.ts:41; src/harbour/beam/beam-system.ts:347; src/harbour/beam/beam-system.ts:406; public/arrival-shell.css:30
- Detail: The poster finishes fading at 1.1 s, but beacon kindling continues until 2.9 s. During that exposed interval, introScale attenuates the beacon, halo, and shared illumination independently of PSI. Hover alone does not interrupt kindling. The first visual reading can therefore disagree with the already available PSI explanation.
- Fix: Keep analytical beacon output at its true target throughout exposed live frames. Retain the decorative camera drift; confine any fire kindling to the opaque-poster period without extending loading.

### S04-F7 [medium] Several advanced actions have no pointer or touch entry

- Evidence: src/harbour/ui/CornerMark.tsx:63; src/harbour/ui/KeyList.tsx:12; src/harbour/ui/KeyList.tsx:24; src/harbour/ui/App.tsx:78; src/harbour/ui/Panel.tsx:195
- Detail: W watch, P postcard, and bracket stepping are implemented as global keys and described in a noninteractive list below the legend. The corner exposes only search, ledger, chart, and home. F already has a panel button. Visitors on admitted tablets without keyboards cannot invoke several shipped features.
- Fix: Provide named buttons in an on-demand controls sheet, with keyboard equivalents beside them. Keep existing corner restraint and progressive disclosure; reuse store actions rather than creating parallel behavior.

## Ideas

### S04-I1 Make unknown readings unmistakable

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Repair Shoals and Storm empty states before adding teaching. Draft: “Peg readings have not arrived. An empty Shoals is not an all-clear.” Stress: “Stress readings unavailable; the weather cannot be interpreted yet.” Preserve dated observations when stale.
- Visitor benefit: The first inspection cannot turn missing information into reassurance.
- Data/DOM: Use model.hasFleet, truth.pegSummary/stress, seaState.offPegShare, weather.coverage, and per-coin coverage. Healthy absence requires usable observations; unavailable means unknown. Test pending, failed, stale, valid zero, and partial coverage with matching hover/panel copy.
- Where: src/harbour/ui/facts.ts:172; src/harbour/ui/Panel.tsx:306; src/harbour/ui/Panel.tsx:359; src/harbour/ui/ui.test.ts:77
- Perf: Estimated: zero draws/tris; negligible conditional DOM work; under 1 KB gzip.
- Risks: Endpoint presence alone does not prove complete coin coverage; avoid replacing one false all-clear with another.
- Depends on: —

### S04-I2 Teach the storm signal that actually exists

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Replace coin-count mast explanations. Draft: “The station repeats the bay’s supply-weighted stress band: one cone Watch; two Alert; add one drum Warning; two drums and a red pennant Danger. Individual ship signals identify selected Alert-or-worse coins.” Label the alert list separately.
- Visitor benefit: Visitors can decode the mast, weather, and individual flags consistently.
- Data/DOM: Use readings.stormBand/cones and weather coverage; mapping CALM=0, WATCH=1, ALERT=2, WARNING=3, DANGER=4. Individual stormFlags retain existing top-five ranking. Unknown stays unknown. Assert hover, panel, legend, and renderer mapping parity.
- Where: src/harbour/readings/storm-cones.ts:5; src/harbour/readings/readings-system.ts:47; src/harbour/ui/Ledger.tsx:99; src/harbour/ui/Panel.tsx:371; src/harbour/ui/facts.ts:181
- Perf: Estimated: zero GPU cost; under 2 KB gzip; existing service subscription.
- Risks: Correct copy without silently changing the established renderer or conflating station shapes with vessel shapes.
- Depends on: —

### S04-I3 An optional five-stop harbour reading

*informative · ux · effort L · impact 5 · confidence 4*

- What: Open “How to read the harbour” from the wordmark/ledger. Five dismissible steps: Pharos—“Read the market’s stability here”; boat and pier—“One coin; longer docking means more supply”; Shoals—“Coins currently off peg”; station—“Early warning, not a depeg”; Keeper’s Log—“Check freshness; night and seasons follow your clock.”
- Visitor benefit: A short, spatial lesson leads directly to a defensible first market reading.
- Data/DOM: On demand only. Reuse existing facts and corrected legend wording; introduce no analytical mapping. Steps have Back/Next/Close, keyboard focus, live announcements, and links to exact panels. Missing targets/readings receive explicit alternatives.
- Where: src/harbour/ui/Ledger.tsx:115; src/harbour/ui/store.ts:322; src/harbour/ui/store.ts:331; src/harbour/ui/HoverTag.tsx:33; src/harbour/ui/Panel.tsx:849
- Perf: Estimated: zero added draws/tris; 2–5 KB gzip lazy UI; one existing-style anchor projection while open.
- Risks: Use a thin DOM outline/leader, without scene dimming or shader spotlights. No automatic camera tour; reduced motion cuts between requested stops.
- Depends on: S04-I1, S04-I2

### S04-I4 DECISION-NEEDED: Repair the first-visit invitation

*professional · ux · effort M · impact 4 · confidence 5*

- What: Replace the fragile timed summary with “New to the harbour? Read it in five stops.” Offer “Show me” and “Dismiss”; always retain replay in help. Start eligibility after visible reveal, pause while hidden, and persist acknowledgement rather than mere timer activation.
- Visitor benefit: First-time help remains available until the visitor can actually notice and choose it.
- Data/DOM: Use reveal completion, document.visibilityState, and a versioned acknowledgement key. Strict D11 option: show invitation on first wordmark hover/focus only. Automatic invitation requires an explicit exception. Test hidden tabs, delayed reveal, unavailable storage, dismissal, and replay.
- Where: src/harbour/ui/CornerMark.tsx:12; src/harbour/ui/CornerMark.tsx:34; src/harbour/app/harbour-app.tsx:69; src/harbour/ui/harbour-ui.css:105
- Perf: Estimated: zero GPU cost; under 2 KB gzip; event-driven timers only.
- Risks: Automatic text conflicts with strict D11. Preserve a demand-only implementation unless the operator accepts the exception.
- Depends on: S04-I3

### S04-I5 A question-mark sheet with usable controls

*professional · ux · effort M · impact 5 · confidence 5*

- What: Add ? and a named Help action inside the revealed corner strip. Show essentials first: inspect, search, ledger, home. Expand “Explore further” for W, P, F, brackets, arrows, and zoom. Render actions as buttons beside their key labels.
- Visitor benefit: Keyboard users discover shortcuts immediately; tablet users can invoke the same features.
- Data/DOM: Reuse one exported KeyList description set and existing store actions. Respect typing and modifier guards. Draft: “Explore at your pace. Esc closes this sheet.” Add aria-keyshortcuts where applicable and test focus restoration.
- Where: src/harbour/ui/KeyList.tsx:5; src/harbour/ui/App.tsx:51; src/harbour/ui/CornerMark.tsx:63; src/harbour/ui/store.ts:444; src/harbour/ui/store.ts:501
- Perf: Estimated: zero GPU cost; 1–3 KB gzip; mounted only on demand.
- Risks: Do not intercept ? inside fields or duplicate a second shortcut dispatcher. Keep touch targets at the existing 44 px convention.
- Depends on: —

### S04-I6 Make the first hover explain the next action

*informative · ux · effort S · impact 4 · confidence 5*

- What: Append a temporary affordance to the first openable hover: “Click to inspect the reading.” Touch equivalent: “Tap to inspect; hold for a name.” Remove after the first successful panel open; decorative hover-only objects receive no inspection instruction.
- Visitor benefit: Visitors move from watching scenery to checking evidence without guessing.
- Data/DOM: Use store.isOpenable and first successful selection. Trigger only through requested hover/hold, satisfying D11. Keep analytical fact text unchanged and use a separate instruction line.
- Where: src/harbour/ui/HoverTag.tsx:105; src/harbour/ui/store.ts:196; src/harbour/ui/store.ts:318; src/harbour/ui/CornerMark.tsx:77
- Perf: Estimated: zero GPU cost; under 1 KB gzip; one transient DOM line.
- Risks: Long tags already require viewport clamping. Keep the hint short, avoid repeated announcements, and do not imply every decorative landmark opens.
- Depends on: —

### S04-I7 Report real loading phases without invented percentages

*professional · infra · effort M · impact 4 · confidence 4*

- What: Replace the single prolonged loading sentence with actual milestones: “Preparing the harbour view,” “Preparing the fleet’s routes,” and “Waiting for live readings.” Once genuinely prepared, optionally say “Preparing 624 boats.” Draft for delay: “This is taking longer. Pharos analytics remains available below.”
- Visitor benefit: A slow visit explains what is pending and offers a useful next step.
- Data/DOM: Publish coarse transitions from system initialization, simulation preparation, and rendered readiness. Counts come only from readiness.boats. Do not infer percentages from request count or start the two-second deadline at navigation. Test delayed initialization and preparation.
- Where: src/harbour/engine/engine.ts:145; src/harbour/sim/system.ts:79; src/harbour/app/harbour-app.tsx:23; src/components/arrival-shell.tsx:25
- Perf: Estimated: zero GPU cost; 1–2 KB gzip; a few state changes per boot.
- Risks: Milestones must remain truthful when work overlaps or revisions supersede. Never expose internal exception strings or add frame-by-frame progress updates.
- Depends on: —

### S04-I8 Keep loading and display integrity available after reveal

*professional · ux · effort M · impact 5 · confidence 5*

- What: Carry awaiting, unavailable, incomplete, and complete presentation states into existing wordmark disclosure and Keeper’s Log. Draft: “Live readings are still arriving; the fleet is not shown yet.” Partial: “611 of 624 boats displayed. This view is incomplete.” Link to analytics.
- Visitor benefit: The empty or incomplete harbour keeps an explanation after the arrival card disappears.
- Data/DOM: Use snapshot presence/error, simulation-status, readiness revision/count, and last rendered revision/count. Separate presentation completeness from model.truth freshness. Expose text on focus/hover/click, with a polite transition announcement. Test late success and incomplete recovery.
- Where: src/harbour/app/harbour-app.tsx:84; src/harbour/ui/store.ts:21; src/harbour/ui/bits.tsx:7; src/harbour/ui/CornerMark.tsx:52; src/harbour/ui/Panel.tsx:849
- Perf: Estimated: zero GPU cost; 1–3 KB gzip; notify only on state/count changes.
- Risks: Do not call pending data stale or use fog as a loader. Render watchdog completion must not suppress later recovery status.
- Depends on: —

### S04-I9 Contain first-action loading failures

*professional · infra · effort S · impact 5 · confidence 5*

- What: Wrap lazy details in a local error boundary. Draft: “These details could not load. The harbour is still available.” Provide Close and Reload page while preserving corner controls and keyboard handling. Keep existing matching loading chrome.
- Visitor benefit: A failed first inspection does not strand the visitor in an uninspectable world.
- Data/DOM: No market data changes. Exercise rejected imports for search, ledger, and selection; assert the overlay survives and focus returns. Prefer a reliable reload action over a misleading retry that reuses React.lazy’s rejected identity.
- Where: src/harbour/ui/App.tsx:116; src/harbour/ui/DetailFallback.tsx:10; src/harbour/ui/details.ts:5; src/harbour/ui/mount.tsx:12; src/harbour/ui/details-loading.test.tsx:26
- Perf: Estimated: zero GPU cost; under 2 KB gzip; no steady-state work.
- Risks: A retry requires both a new lazy identity and a genuinely retryable chunk request; reload is the smallest dependable recovery.
- Depends on: —

### S04-I10 Let the arrival camera enchant while the beacon stays truthful

*enchanting · ux · effort S · impact 3 · confidence 4*

- What: Retain the interruptible 6.5-second drift and poster alignment. Remove exposed-live-frame attenuation of the analytical beacon. Add on-demand guide copy: “The camera’s arrival is decorative; the beacon already shows the current reading.”
- Visitor benefit: The opening remains calm and cinematic while the first beacon observation is interpretable.
- Data/DOM: Keep PSI lit/band/score/reach untouched; introScale must equal 1 whenever live beacon output is exposed. No new analytical cue or threshold. Assert valid and unavailable PSI behavior through arrival and interruption.
- Where: src/harbour/app/wake.ts:32; src/harbour/beam/beam-system.ts:347; src/harbour/beam/beam-system.ts:406; src/harbour/app/poster.ts:20
- Perf: Estimated: zero additional draws/tris/KB; removes intro animation work.
- Risks: Changes an intentionally shipped arrival treatment. Requires later real-GPU temporal review; do not extend the poster hold to preserve choreography.
- Depends on: —

### S04-I11 A modest returning-visitor comparison

*informative · data-bound · effort M · impact 3 · confidence 4*

- What: Inside the opened guide or Pharos panel, show “Your last fresh reading: PSI 92.1 on 8 Nov; now 90.8.” Store only the previous fresh PSI observation and source time locally. Provide “Forget this reading.” Avoid claiming to reconstruct events while the visitor was away.
- Visitor benefit: Returning visitors gain immediate context without another persistent dashboard.
- Data/DOM: Use readings.psi.score/band with truth.stability=current and endpoint source timestamp. Compare only valid finite observations; stale/unavailable current data shows no delta. Version storage and test malformed, missing, future-dated, and unavailable storage cases.
- Where: src/harbour/ui/CornerMark.tsx:6; src/harbour/ui/Panel.tsx:232; src/harbour/model/readings.ts:19; src/harbour/data/fetch.ts:77
- Perf: Estimated: zero GPU cost; under 2 KB gzip; under 1 KB localStorage, no polling.
- Risks: A local observation is not market history or a complete change summary. Avoid writing on every model refresh or comparing incompatible methodology versions.
- Depends on: S04-I3

### S04-I12 Make the existing watch a discoverable next step

*enchanting · data-bound · effort M · impact 4 · confidence 5*

- What: Finish the optional guide with “Watch today’s notable ships” and “Explore freely.” Invoke existing W behavior through a button, with an equally visible Stop action. When inputs are unavailable, say “The watch is waiting for fresh readings.”
- Visitor benefit: Visitors can continue learning through real examples without needing to discover W.
- Data/DOM: Reuse rankWatch: absolute 24-hour supply change ≥$1M; worst active depeg by absolute bps; positive supply with prevWeek=0. Require current relevant endpoints for each reason. Preserve existing roughly 20-second dwell and test missing/stale inputs.
- Where: src/harbour/ui/watch.ts:12; src/harbour/ui/watch.ts:19; src/harbour/ui/store.ts:431; src/harbour/ui/store.ts:447; src/harbour/ui/App.tsx:120
- Perf: Estimated: zero new draws/tris; under 2 KB gzip; existing ranking and camera path.
- Risks: Never start automatically. Preserve reduced-motion cuts and interruption. Describe “new to the register” precisely rather than asserting a confirmed launch.
- Depends on: S04-I3, S04-I5

### S04-I13 Verify the first minute as a sequence

*professional · infra · effort M · impact 4 · confidence 5*

- What: Extend existing deterministic tests across reveal, caption eligibility, first hover/click, first panel, and help replay. Include delayed data, missing optional endpoints, partial fleet, rejected detail imports, hidden tabs, reduced motion, and touch actions. Separately ask fresh visitors to identify stability, stress, stale data, and decorative night.
- Visitor benefit: Onboarding improvements demonstrate both reliable delivery and correct interpretation.
- Data/DOM: Test real state transitions and explicit copy contracts. Human reading checks use operator-approved real-GPU sessions later; automated DOM assertions cannot prove understanding or visual quality.
- Where: src/harbour/app/reveal.test.ts:63; src/harbour/ui/details-loading.test.tsx:26; src/harbour/ui/ui.test.ts:62; src/harbour/ui/CornerMark.tsx:34
- Perf: Zero production bundle or GPU cost; additional test and participant-review time.
- Risks: Avoid brittle elapsed-time assumptions from navigation and tests that merely mirror implementation. Hardware timing remains a separate validation lane.
- Depends on: S04-I1, S04-I2, S04-I3, S04-I8, S04-I9

## Top picks

1. S04-I1 — Prevents the most consequential first-reading error: mistaking unavailable information for a healthy market.
2. S04-I2 — Repairs a direct contradiction between existing teaching and the renderer without changing the visual language.
3. S04-I9 — A small containment change preserves every inspection route when the first detail request fails.
4. S04-I5 — Makes shipped features discoverable and usable on tablets with little new UI.
5. S04-I3 — Turns existing accurate detail surfaces into a coherent, optional first-minute lesson.

## Operator decisions

- DECISION-NEEDED: Should S04-I4 retain an automatic first-visit invitation as an explicit D11 exception, or appear only after wordmark hover/focus/click? Existing automatic caption: src/harbour/ui/CornerMark.tsx:72; D11: agents/2026-10-13-pharosville-reboot/PLAN.md:45.

## Cross-lane hooks

- Data-truth owners: resolve S04-F1/F2 before onboarding copy is finalized. The guide must teach renderer semantics, including coverage and unknown states. Anchors: src/harbour/readings/bind.ts:182; src/harbour/ui/Ledger.tsx:63.
- Engine/loading owners: expose reveal and presentation-integrity transitions for S04-I4/I7/I8 without adding per-frame React updates or weakening readiness checks. Anchor: src/harbour/app/harbour-app.tsx:84.
- Interaction/accessibility owners: reuse selection framing, focus restoration, touch targets, and reduced-motion cuts for guide and help controls. Anchors: src/harbour/ui/store.ts:331; src/harbour/ui/App.tsx:36; src/harbour/ui/harbour-ui.css:424.
- Visual/performance owners: later review the guide anchors and revised beacon arrival on real GPU across compact windows, tablets, night, missing readings, and reduced motion. This code-only pass establishes no visual or timing acceptance.
- Skipped: browsers, captures, edits, installations, and test execution. Read-only source and existing test review completed; working-tree status remains unchanged.
- Risk: effort, bytes, and frame costs are estimates. First-minute comprehension and arrival appearance still require fresh-visitor and real-hardware validation.
