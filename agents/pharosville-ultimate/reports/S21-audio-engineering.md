# S21

## Executive summary

The procedural engine already has one-click activation, lightweight stereo spatialization, hidden-tab suspension, and a final safety shaper. Five failures were reproduced with in-memory assertions: stale Mint stamping, dropped cold-start thunder, mismatched rain thresholds, lost music initialization during rapid toggles, and incorrect playing status for an interrupted context. Memory checks measured 7.80 MB eager PCM and 27.88 MB with every kind requested, excluding shared noise buffers. Prioritize truthful silence and startup/recovery fixes, then memory lifetime and bounded synthesis. No files changed; native browser behavior, listening quality, and device CPU remain unverified.

## Current state

- Audio is entirely procedural: 32 clip kinds, native-node beds, and synthesized music. No audio assets matched the public/ inventory; no audio fetch or decodeAudioData path exists. There is no compressed-sample decoding cost. Evidence: src/harbour/audio/dsp.ts:1304, src/harbour/audio/bank.ts:98, src/harbour/audio/music.ts:214.
- Sound defaults off and remembers ambience/music independently. AudioContext creation and resume happen synchronously before lazy imports, preserving the gesture boundary. This is sound architecture, although native unlock success is unverified. Evidence: src/harbour/audio/controller.ts:47, src/harbour/audio/controller.ts:158.
- The two-click activation complaint is resolved: the speaker calls toggle directly; the caret opens options. Keyboard menu navigation and focus restoration exist. Evidence: src/harbour/audio/SoundToggle.tsx:41, src/harbour/audio/SoundToggle.tsx:59, agents/claudeville-prettier/exec/audio2.md:5.
- The final graph is out → settle → snow shelf → compressor → safety WaveShaper → destination. Music and echo also enter this chain. Thunder ducks weather beds. A final clipping safeguard already exists; missing-limiter claims would be incorrect. Evidence: src/harbour/audio/ambience.ts:389, src/harbour/audio/ambience.ts:402, src/harbour/audio/ambience.ts:1155.
- Ordinary clips allocate a source and gain, sharing five equal-power StereoPanner lanes per destination. An aulos pipe allocates eight nodes, including three scheduled sources. Four unconditional noise sources run; optional beds use LazyLoop. No HRTF PannerNode exists. Device CPU was not measured. Evidence: src/harbour/audio/ambience.ts:429, src/harbour/audio/ambience.ts:451, src/harbour/audio/ambience.ts:634, src/harbour/audio/music.ts:251.
- Seed-12345 bank checks measured 7,802,128 eager bytes and 27,876,448 bytes after requesting every kind. Two shared stereo noise buffers add 6,912,000 bytes at 48 kHz; maximum music PCM adds approximately 1,171,200 bytes. These exclude synthesis temporaries and native graph overhead. Evidence: src/harbour/audio/bank.ts:15, src/harbour/audio/bank.ts:123, src/harbour/audio/ambience.ts:416, src/harbour/audio/music.ts:173.
- Hidden tabs cancel controller polling, ambience scheduling, music scheduling, and synthesis callbacks; serialized native transitions prevent late suspend from defeating resume. Engine disposal owns controller teardown. Existing lifecycle coverage is strong for successful transitions. Evidence: src/harbour/audio/controller.ts:82, src/harbour/audio/ambience.ts:577, src/harbour/audio/lifecycle.test.ts:220, src/harbour/engine/engine.ts:451.
- Schedulers use AudioContext.currentTime: ambience ticks every 120 ms with 300 ms lookahead; music ticks every 250 ms with 400 ms lookahead. Late phrases rebase instead of replaying accumulated intervals. No cumulative timer-drift defect was identified; prolonged stalls can still delay phrases. Evidence: src/harbour/audio/ambience.ts:123, src/harbour/audio/ambience.ts:675, src/harbour/audio/music.ts:201, src/harbour/audio/music.ts:230.
- Reduced motion softens thunder and suppresses passing-hull sounds; idle attention lowers and thins the mix. Hour bells avoid deep night. User volume and configurable quiet hours are absent from the controller/menu. Evidence: src/harbour/audio/ambience.ts:150, src/harbour/audio/ambience.ts:177, src/harbour/audio/ambience.ts:1053, src/harbour/audio/ambience.ts:1135, src/harbour/audio/SoundToggle.tsx:6.
- Existing tests cover DSP finiteness, pitch, relative levels, eager-bank memory, mappings, and lifecycle behavior. Music tests exercise composition rather than the live scheduler; lifecycle stubs always resolve resume/suspend successfully. Evidence: src/harbour/audio/dsp.test.ts:87, src/harbour/audio/bank.test.ts:19, src/harbour/audio/music.test.ts:8, src/harbour/audio/lifecycle.test.ts:44.

## Findings

### S21-F1 [high] The Mint keeps stamping when flow data is banked

- Evidence: src/harbour/audio/feed.ts:294; src/harbour/audio/ambience.ts:715; src/harbour/audio/ambience.ts:965; src/harbour/civic/flows.ts:75; src/harbour/civic/mint.ts:124
- Detail: Stale/unavailable flows set mintRate to zero and stop the visual presses, but audio schedules presses whenever the listener is near. Its tempo denominator retains a 0.6 baseline, and bus gain ignores banked state. Missing civic service even substitutes activity 0.5. An in-memory assertion reproduced press scheduling at mintRate zero. Visitors hear work while the corresponding visual signal is banked.
- Fix: Pass explicit Mint availability/banked state, gate its bus and press scheduling when banked or unavailable, and remove the fabricated missing-service activity. Preserve the existing fresh-data idle rhythm. Test fresh, stale, unavailable, and missing-service cases.

### S21-F2 [medium] Interrupted or failed audio can remain displayed as playing

- Evidence: src/harbour/audio/controller.ts:101; src/harbour/audio/controller.ts:111; src/harbour/audio/controller.ts:119; src/harbour/audio/controller.ts:164; src/harbour/audio/SoundToggle.tsx:18
- Detail: playing means an Ambience object exists, regardless of AudioContext.state. Resume errors are swallowed, there is no statechange listener, and reselecting the current mode returns immediately. An interrupted-context stub still reported playing and received no resume attempt. Native Safari/iPad interruption incidence is unverified, but the missing recovery path is concrete.
- Fix: Track actual context state and startup errors, publish a stable status snapshot, and provide a gesture-bound retry for suspended/interrupted audio. Keep the remembered sound preference separate from actual playback.

### S21-F3 [medium] Rapid off/on toggles can permanently omit music

- Evidence: src/harbour/audio/controller.ts:136; src/harbour/audio/controller.ts:138; src/harbour/audio/controller.ts:140; src/harbour/audio/controller.ts:209
- Detail: musicLoading spans ambience instances. If music import is pending during off → music, the new ambience cannot tune because musicLoading is true. The old import then clears that flag and rejects its captured ambience, without tuning the current one. A deferred-import assertion reproduced mode music with active ambience and zero Music instances.
- Fix: After module resolution, reconcile against the current ambience/context instead of abandoning initialization after an old-instance mismatch. Add a deferred-import regression test covering off/on and disposal.

### S21-F4 [medium] Cold thunder is dropped while occupying its concurrency slot

- Evidence: src/harbour/audio/ambience.ts:635; src/harbour/audio/ambience.ts:1060; src/harbour/audio/ambience.ts:1068; src/harbour/audio/feed.ts:400
- Detail: thunder() requests lazy synthesis and immediately calls play(). If no variant exists, play returns false; thunder ignores that result, schedules ducking, and reserves a roll slot anyway. No retry follows. The first front roll can hit this path because preparation and emission occur in the same feed call. An in-memory assertion confirmed no thunder source appeared after synthesis completed.
- Fix: Retain a bounded pending thunder event with its original audio deadline. Start it when ready within an explicit lateness allowance; reserve audible concurrency and apply ducking only when playback is scheduled.

### S21-F5 [low] Rain preparation and playback disagree at intermediate intensity

- Evidence: src/harbour/audio/ambience.ts:769; src/harbour/audio/ambience.ts:854
- Detail: Preparation requests drizzle below 0.35, but playback selects rain from 0.30 upward. At rain 0.32 on a fresh bank, drizzle is ready while every scheduled rain clip is unavailable. The continuous hiss remains, but roof/quay patter disappears. An in-memory assertion reproduced this exact state.
- Fix: Use one rain-kind selector for preparation and playback. Test immediately below, at, and above its shared boundary.

### S21-F6 [medium] Synthesis slice budgets cannot bound several large work blocks

- Evidence: src/harbour/audio/ambience.ts:194; src/harbour/audio/ambience.ts:416; src/harbour/audio/ambience.ts:617; src/harbour/audio/bank.ts:93; src/harbour/audio/dsp.ts:778; src/harbour/audio/dsp.ts:1104
- Detail: The bank checks elapsed time only between generator.next calls. Bird synthesis completes all note loops before yielding; tolling can process an entire 64,000-sample partial before yielding. Noise buffers are built synchronously outside the bank pump. Consequently the advertised 2–6 ms idle budget is advisory, particularly on weaker tablets. No device stall duration was measured.
- Fix: Add bounded sample-count yields inside long DSP loops and incrementally prepare noise buffers. Include conversion/copy work in the budgeting strategy rather than moving directly to a new worker architecture.

### S21-F7 [low] Inactive lazy kinds retain memory and keep consuming refresh work

- Evidence: src/harbour/audio/bank.ts:63; src/harbour/audio/bank.ts:85; src/harbour/audio/bank.ts:133; src/harbour/audio/bank.test.ts:19
- Detail: Once requested, a kind stays wanted until complete teardown, and refresh includes every previously wanted kind even after its weather or season ends. Growth is bounded by PLAN, but the existing 8 MB test covers only the eager bank. The measured all-kind bank was 27.88 MB before shared noise, music, active old variants, and synthesis temporaries.
- Fix: Track recent demand, stop refreshing inactive kinds, and release their cached variants after a conservative inactivity window. Add representative warmed-scene and transition memory budgets.

### S21-F8 [low] Sound options has an unusually narrow pointer target

- Evidence: src/harbour/audio/sound-toggle.css:15; src/harbour/audio/sound-toggle.css:20; src/harbour/ui/harbour-ui.css:417
- Detail: The options caret is 14 px wide on fine pointers, with a negative margin beside the sound toggle. Its coarse-pointer width is only 28 px despite the UI's stated 44 px touch-target convention. This makes selecting options unnecessarily precise and increases accidental sound toggles.
- Fix: Expand the hit area while retaining the small drawn caret; use the existing 44 px touch convention and remove target overlap.

## Ideas

### S21-I1 Make banked Mint audio truthful

*professional · data-bound · effort S · impact 5 · confidence 5*

- What: Gate Mint bus gain and new press scheduling using explicit civic banked/availability state; preserve fresh-data idle behavior. Add stale/missing-service regressions. Anchors: src/harbour/audio/feed.ts:294 and src/harbour/audio/ambience.ts:965.
- Visitor benefit: The Mint sounds consistent with its stopped presses and unavailable-data explanation.
- Data/DOM: Use existing civic.banked and civic.mintRate from flows availability/staleness. Banked or unavailable means no press activity. Preserve FlowPanel's banked/no-reading explanation at src/harbour/ui/Panel.tsx:660; test the same conditions.
- Where: src/harbour/audio/feed.ts:291; src/harbour/audio/ambience.ts:715; src/harbour/audio/controller.test.ts:76
- Perf: Zero GPU cost; removes unnecessary press sources while banked.
- Risks: Do not interpret every fresh mintRate zero as unavailable; fresh idle rhythm is a separate existing behavior.
- Depends on: —

### S21-I2 Expose playback state and recover from interruptions

*all-devices · ux · effort M · impact 5 · confidence 5*

- What: Add idle/loading/running/needs-gesture/error status, listen to context state changes, and let a click resume the existing context synchronously. Handle construction and resume failures visibly. Anchor: src/harbour/audio/controller.ts:158.
- Visitor benefit: A silent speaker state becomes understandable and recoverable after interruptions or startup failure.
- Data/DOM: No market mapping. Keep aria-pressed tied to preference; provide concise playback status and a keyboard-accessible retry in the existing sound UI.
- Where: src/harbour/audio/controller.ts:111; src/harbour/audio/SoundToggle.tsx:18; src/harbour/audio/lifecycle.test.ts:44
- Perf: One context-state listener and event-driven UI updates; no audio DSP or GPU additions.
- Risks: Retry must remain inside a trusted gesture. Test macOS Safari, iPadOS Safari, and Chrome; do not automatically override user preference.
- Depends on: —

### S21-I3 Reconcile music loading with the current sound session

*professional · infra · effort S · impact 4 · confidence 5*

- What: On lazy module completion, initialize music against the current live ambience/context and selected mode. Cover off/on while the import is pending. Anchor: src/harbour/audio/controller.ts:138.
- Visitor benefit: Selecting music reliably produces music even on slow connections or rapid toggles.
- Data/DOM: n/a; retain the existing opt-in mode and remembered music choice.
- Where: src/harbour/audio/controller.ts:129; src/harbour/audio/lifecycle.test.ts:207
- Perf: No new nodes or assets; one deferred-import regression.
- Risks: Late completion must never resurrect disposed audio or create duplicate Music instances.
- Depends on: —

### S21-I4 Keep thunder pending until its clip is ready

*enchanting · infra · effort S · impact 4 · confidence 5*

- What: Queue at most three thunder requests with original deadlines and bounded expiry; retry readiness from step(), then schedule ducking alongside successful playback. Anchor: src/harbour/audio/ambience.ts:1048.
- Visitor benefit: The first lightning flash and approaching front receive their intended audible response.
- Data/DOM: Preserve existing weather lightning/front bindings, distance delay, three-roll budget, and reduced-motion softening. No new analytical signal or DOM copy.
- Where: src/harbour/audio/ambience.ts:1048; src/harbour/audio/feed.ts:396; src/harbour/audio/lifecycle.test.ts:104
- Perf: At most three small queue records and readiness checks per ambience tick.
- Risks: Expire late thunder rather than disconnecting sound from its flash; do not duck beds for a dropped request.
- Depends on: —

### S21-I5 Unify the rain clip boundary

*professional · infra · effort S · impact 3 · confidence 5*

- What: Compute drizzle-versus-rain once and reuse it for need() and play(). Add boundary assertions. Anchors: src/harbour/audio/ambience.ts:769 and src/harbour/audio/ambience.ts:854.
- Visitor benefit: Roof and quay patter remains continuous as rain intensity changes.
- Data/DOM: Preserve weather.precip.rain and the existing weather meaning; this only aligns internal clip selection.
- Where: src/harbour/audio/ambience.ts:769; src/harbour/audio/controller.test.ts:19
- Perf: Effectively zero; avoids synthesizing the wrong kind.
- Risks: Keep the selected threshold consistent with the intended listening balance.
- Depends on: —

### S21-I6 Budget the warmed bank and retire inactive kinds

*all-devices · infra · effort M · impact 4 · confidence 5*

- What: Track per-kind recent demand, skip inactive refreshes, and evict inactive cached variants after a generous grace period. Measure complete retained PCM, including shared noise and music. Anchor: src/harbour/audio/bank.ts:85.
- Visitor benefit: Long-running tabs retain less memory and avoid synthesizing weather that has passed.
- Data/DOM: n/a; demand follows existing audible layers, without changing market or seasonal mappings.
- Where: src/harbour/audio/bank.ts:63; src/harbour/audio/bank.ts:123; src/harbour/audio/bank.test.ts:19; src/harbour/audio/ambience.ts:768
- Perf: O(32) bookkeeping at low frequency; potential savings of several MB and inactive refresh jobs. Exact scene savings need measurement.
- Risks: Avoid evict/rebuild churn during showers; active sources must retain buffers until playback ends. Prewarming must coexist with eviction.
- Depends on: S21-I4

### S21-I7 Make synthesis genuinely incremental

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Add sample-count yields to long note/partial loops, slice noise-buffer generation, and avoid large final conversion blocks. Preserve seeded output exactly. Anchors: src/harbour/audio/dsp.ts:778 and src/harbour/audio/ambience.ts:194.
- Visitor benefit: Turning sound on and warming a new weather layer is less likely to interrupt interaction on weaker devices.
- Data/DOM: n/a; identical seeded PCM and existing mappings.
- Where: src/harbour/audio/dsp.ts:1104; src/harbour/audio/bank.ts:100; src/harbour/audio/ambience.ts:599
- Perf: No added PCM; small generator bookkeeping cost. Target smaller main-thread bursts; browser milliseconds remain unmeasured.
- Risks: Slicing must preserve RNG order and sample continuity. Ensure the first audible bed arrives promptly.
- Depends on: —

### S21-I8 Add one remembered volume control

*professional · ux · effort M · impact 4 · confidence 5*

- What: Place a native labeled volume range in sound options, persist its normalized value, and apply a short gain ramp through the existing output path. Anchor: src/harbour/audio/SoundToggle.tsx:80.
- Visitor benefit: Visitors can balance the harbour against calls, music players, and sensitive listening environments.
- Data/DOM: No market mapping. Label the slider Sound volume and expose its percentage; keep off/on and selected mode independent.
- Where: src/harbour/audio/controller.ts:23; src/harbour/audio/ambience.ts:391; src/harbour/audio/SoundToggle.tsx:80
- Perf: Reuse an existing gain where practical; negligible automation and localStorage cost, zero GPU cost.
- Risks: Clamp persisted input, preserve default loudness, and never raise gain above the existing maximum. Prevent slider keys from panning the world.
- Depends on: —

### S21-I9 Offer an explicit quiet listening profile

*enchanting · ux · effort M · impact 3 · confidence 4*

- What: Add an optional quiet profile that lowers transient layers and uses the existing softer thunder treatment. Only add user-configured quiet hours after an operator decision. Anchors: src/harbour/audio/ambience.ts:1053 and src/harbour/audio/ambience.ts:177.
- Visitor benefit: The harbour remains comfortable for sound-sensitive visitors and late-night ambient watching.
- Data/DOM: No new data encoding. Explain suppressed layers in sound options; existing panels and ledger retain all analytical information.
- Where: src/harbour/audio/SoundToggle.tsx:6; src/harbour/audio/controller.ts:57; src/harbour/audio/ambience.ts:1048
- Perf: Negligible gain controls; suppressing optional sources can reduce audio work.
- Risks: Do not infer sound sensitivity from reduced-motion preference or silently replace the visitor's chosen mode. Scheduled quiet hours need explicit consent.
- Depends on: S21-I8

### S21-I10 Verify the existing safety chain with complete mixes

*professional · infra · effort M · impact 4 · confidence 5*

- What: Add deterministic OfflineAudioContext cases for coincident thunder, bells, music, surf, and echo. Measure output peak, DC, short-window loudness, and compressor reduction; calibrate per-kind levels before changing dynamics. Anchors: src/harbour/audio/ambience.ts:389 and src/harbour/audio/dsp.test.ts:87.
- Visitor benefit: Busy moments remain comfortable while quiet details retain their intended hierarchy.
- Data/DOM: n/a; retain existing data meanings and final safety shaper. Loudness measurements are engineering diagnostics.
- Where: src/harbour/audio/ambience.ts:219; src/harbour/audio/ambience.ts:530; src/harbour/audio/dsp.ts:578; src/harbour/audio/music.test.ts:49
- Perf: Offline test cost only; runtime diagnostics should be opt-in. No additional limiter is initially required.
- Risks: Peak-bounded samples do not establish perceived loudness or reconstructed true peak. Listening approval remains necessary; excessive compression would flatten the calm mix.
- Depends on: —

### S21-I11 Add a clock-driven scheduler soak

*professional · infra · effort S · impact 3 · confidence 5*

- What: Exercise Music and Ambience across simulated hours, delayed ticks, repeated visibility changes, and disposal during scheduled phrases. Assert absolute event order, no catch-up burst, and bounded outstanding work. Anchor: src/harbour/audio/music.ts:221.
- Visitor benefit: Long watches and returning tabs retain coherent timing without delayed clusters of sounds.
- Data/DOM: n/a; preserve the existing audio-clock scheduling and decorative composition.
- Where: src/harbour/audio/music.test.ts:8; src/harbour/audio/lifecycle.test.ts:181; src/harbour/audio/music.ts:230
- Perf: Test-only clock simulation; zero runtime cost.
- Risks: Test the real scheduler through a small timer/context boundary. Native audio rendering and operating-system interruptions still require device checks.
- Depends on: S21-I2, S21-I3

### S21-I12 Give sound options a comfortable hit area

*all-devices · ux · effort S · impact 3 · confidence 5*

- What: Expand the options button without enlarging its drawn caret, remove the negative target margin, and use the existing 44 px touch convention. Keep the one-click speaker behavior. Anchor: src/harbour/audio/sound-toggle.css:15.
- Visitor benefit: Sound settings are easier to select with a trackpad, touch, or limited pointer precision.
- Data/DOM: n/a; retain Sound options labeling, menu radio semantics, arrow navigation, and focus restoration.
- Where: src/harbour/audio/sound-toggle.css:14; src/harbour/audio/SoundToggle.tsx:71; src/harbour/ui/harbour-ui.css:424
- Perf: A few CSS declarations; zero DSP or GPU cost.
- Risks: Check the expanded corner mark at the smallest admitted viewport and with larger text.
- Depends on: —

### S21-I13 Allocate pan lanes only when used

*all-devices · infra · effort S · impact 2 · confidence 4*

- What: Retain five quantized stereo positions but create individual lanes on first use instead of allocating five for every destination. Also avoid repeating unchanged music gain targets, following ambience's existing aim pattern. Anchors: src/harbour/audio/ambience.ts:656 and src/harbour/audio/music.ts:225.
- Visitor benefit: The same spatial sound uses fewer idle graph nodes and redundant parameter events.
- Data/DOM: n/a; preserve equal-power stereo and current front/back filtering. No HRTF upgrade is needed.
- Where: src/harbour/audio/ambience.ts:653; src/harbour/audio/ambience.ts:663; src/harbour/audio/music.ts:225
- Perf: Saves up to four panners for a destination using one position; exact native CPU benefit needs profiling.
- Risks: Most spatial buses may eventually use all five lanes, limiting savings. Verify identical pan selection and teardown.
- Depends on: —

## Top picks

1. S21-I1 — Small fix for an audible contradiction of the product's stale-data truth rule.
2. S21-I3 — Reproduced loading race; a focused controller change restores a selected feature.
3. S21-I4 — Preserves the first thunder response using the existing lazy-bank architecture.
4. S21-I2 — Makes interrupted or failed audio diagnosable and recoverable across supported devices.
5. S21-I5 — A shared threshold removes a reproduced patter gap at negligible cost.

## Operator decisions

- Should a quiet listening profile soften transient cues only, or also suppress bells, conches, and the stale-data foghorn?
- Should quiet hours be offered as an explicit user-configured schedule, or should volume and a manual quiet profile cover this need?

## Cross-lane hooks

- Civic/data lane: provide explicit Mint banked/availability state and preserve the existing fresh-data idle behavior; align with src/harbour/civic/civic-system.ts:122.
- Weather lane: preserve lightning deadlines and front ownership while audio queues cold clips; coordinate src/harbour/audio/feed.ts:396 with weather event delivery.
- UI/accessibility lane: accommodate playback status, volume, and a larger caret hit area while preserving one-click activation and existing menu keyboard behavior.
- Performance lane: measure full/lean audio separately on supported Apple Silicon and iPad hardware; count active sources, retained PCM, and synthesis bursts without attributing GPU governor timings to audio CPU.
- Verification performed: read-only source review and in-memory assertions for five failures, plus seeded PCM accounting. Git status remained unchanged.
- Not checked: browsers, listening quality, native interruptions, full Vitest, or release gates. Risk: Safari/iPad recovery and device CPU estimates require hardware validation.
