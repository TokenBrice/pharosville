# D — Experience: implementation workstream

Verified 2026-11-08. **26 merged features retained; 43 original proposals excluded from D** (10 assigned to A; 33 deferred/transferred below). This is specification evidence, not release evidence. Read-only onboarding completed; no browsers, builds, API calls or application tests ran. The supplied portrait PNG was inspected.

Paths are repository-relative: `UI/` = `src/harbour/ui/`; `H/` = `src/harbour/`. Evidence anchors were reopened. Source IDs merge corresponding findings. S04-I13, S05-I14, S06-I14, S07-I13 and S23-I12 become cross-cutting tests.

Preserve D11: teaching/reports/settings on demand, no numeral HUD or automatic tour. Fog remains stale-only; unavailable stays unknown; stale observations stay dated. Sound stays opt-in. Keep bounded WebGL2 and both sorted 720×600 tests, never orientation gating. Unless stated, no API/threshold changes, world draws or requests.

**A-truth = [A-trust-repair.md](A-trust-repair.md):** reuse its shared copy contract. Verified defects remain at `UI/Panel.tsx:177,312,373,600,768,879`, `UI/Ledger.tsx:71,99`, `functions/api/_project.ts:37,46,65,74,87` and `UI/yard.ts:171`. Assign S02-I1/I2/I3/I4/I9, S03-I1/I2, S04-I1/I2/I10 to A. S02-I11/I12 are split: A owns truth rules; D owns navigation/layout. **Single owners:** A01 projection; A07 source sentences; A10 date axes/tables; A13 yard narrative; A14 journal pagination/copy; A15 Watch eligibility; A17 presentation status; A19 postcard receipt. D references those deliveries below and implements only the additional interaction. Do not create competing formatters or duplicate PRs. Stress row-method suppression is not implemented in the current detector; A01 correctly restores endpoint methodology only.

## Verified features and fix contracts

### D01 — Correct overlay geometry

Sources: S23-I1/I8/I10, S05-I5, S02-I13, S03-I9. **S; medium risk; no dependency** for positioning, A-truth for shortened facts.

`UI/harbour-ui.css:60,62` transitions tracked transforms and removes them under reduction; `UI/HoverTag.tsx:40,58` needs those transforms. Tags are unbounded at CSS:124; `UI/ChartLabels.tsx:59` culls labels only against each other.

Make tracked anchors opacity-only; retain structural centering/projection transforms. Disable decorative transitions, including corner expansion, under reduction. Bound tags to viewport minus 24px, wrap qualifications, use cached height for above/below placement. Feed cached visible overlay rectangles into the existing culler; retain its priority. Never truncate uncertainty. Tests: extend `UI/measurements.test.ts`, `UI/ui.test.ts`; DOM geometry at 600×720, 720×600 and 1100×640, normal/reduced, long facts; GPU capture G below.

### D02 — Search that can be cancelled

Sources: S03-I6, S05-I6, S07-I2, S23-F8. **M; medium risk; D04 focus conventions.**

`UI/Search.tsx:87,98,107` permits -1 active index, activates on mousedown and lacks Close; CSS:269,279 has no visible-height cap.

Add **“Close search”**; select on click/Enter, never down. Clamp active index whenever results change; omit active-descendant when empty. Announce **“No matches.”** or **“{N} matches.”** only when changed. While open, observe visualViewport offsets/size, keep header/Close reachable and results independently scrollable; do not alter admission inputs. Retain a tappable input if lazy focus cannot summon Safari’s keyboard. New `UI/search.test.tsx`: empty arrows, replaced results, cancelled press, Close/Escape, opener return, viewport bounds; physical iPad keyboard check and G.

### D03 — Optional shortcuts and keyboard ownership

Sources: S05-I1, S23-I5. **S; low risk; none.**

`UI/App.tsx:51` ignores defaultPrevented; `H/audio/SoundToggle.tsx:42` consumes arrows without stopping propagation. Global character shortcuts lack an off switch.

Return on consumed events before world actions. Add **“Character shortcuts”** checkbox in controls; default on, persist a versioned boolean with storage-failure fallback. Off disables letters, punctuation and +/- shortcuts, including `?`; named Help remains available. Keep Escape/native activation. Scope arrows/Home away from editable fields and composite widgets; always process keyup/blur cleanup. New `UI/keyboard.test.tsx`: sound menu, speech-like character events, disabled/reloaded preference, modal blocking and held-arrow focus changes.

### D04 — Focus, modality and reachable controls

Sources: S05-I2/I8/I11/I15, S23-I4/I5, S20-I6, S07-I12. **M; medium risk; none.**

`UI/App.tsx:31` shares one opener slot; corner buttons bypass it. `UI/Postcard.tsx:52` lacks modality containment; `src/App.tsx:6` lacks main. Arrival disappears at `H/app/harbour-app.tsx:79`; sound caret is 14px at `H/audio/sound-toggle.css:15`.

Use per-layer opener refs and identical button/key actions. Hide/inert covered controls, provide **“Back to harbour controls”**, restore connected openers or wordmark. Add main landmark and **“Skip to harbour readings”** link opening/focusing ledger. Use native modal postcard dialog; block background shortcuts and duplicate captures. Progress: **“Creating postcard…”**; failures: **“The postcard could not be created.”**, **“Try again”**, **“Close”**. Revoke URLs on replacement/unmount; ignore late results. Handoff arrival focus before removal. Make hover tags pointer-hoverable; Escape suppresses until trigger exit. Targets: ≥24px without overlap, ≥44px with any coarse pointer. Use system-color focus/selection outlines. New `UI/focus.test.tsx`, `UI/postcard-dialog.test.tsx`; keyboard/forced-colors DOM journeys and G.

### D05 — One help and controls sheet

Sources: S03-I13, S04-I5, S05-I12, S06-I10, S07-I8, S20-I7 (launcher), S26-I5. **M; low risk; D03/D04.**

`UI/KeyList.tsx:5` is text; `UI/CornerMark.tsx:63` exposes only search/ledger/chart/home. W/P remain keyboard-only at `UI/App.tsx:81`.

Add **“Help and controls”** in the revealed strip and `?` when enabled. Reuse one KeyList action inventory. Essentials: **“Search”**, **“Ledger and legend”**, **“Home”**, **“How to read the harbour”**. Disclosure **“Explore further”**: **“Start watch”**, **“Postcard”**, **“Previous ship”**, **“Next ship”**, contextual **“Follow ship”**, **“View controls”**. View controls provide **“Pan up/down/left/right”**, **“Zoom in/out”**, Home via existing actions; taps pan 80 CSS px. Copy: **“Explore at your pace.”** No timed guide. New `UI/help.test.tsx`: each button/key invokes the same action, touch-only access and focus return; G.

### D06 — Optional harbour reading

Sources: S04-I3/I4/I6, S26-I1/I2. **M; low risk; A-truth, D04/D05.**

`UI/CornerMark.tsx:34,41` starts a seven-second caption from hasFleet and marks it seen before acknowledgement. `UI/Ledger.tsx:124` buries instruction after the legend.

Replace caption with replayable **“How to read the harbour”**, five manual stops: **“The Pharos: market-wide stability”**, **“Boats and piers: supply by chain”**, **“The Shoals: off-peg coins”**, **“Weather: early warning”**, **“The Keeper’s Log: freshness”**. Bodies reuse A-approved legend copy. Buttons **“Back”**, **“Next”**, **“Inspect reading”**, **“Close guide”**; panel **“How to read this”** links open the relevant stop. No camera move until Inspect. First openable hover may say **“Click to inspect.”** / **“Tap to inspect.”** once per visit. DECISION-NEEDED: recommend demand-only invitation; automatic invitation requires a D11 exception. New `UI/guide.test.tsx`: replay, unavailable targets, no unsolicited text/flight, storage denial; five-second human reading test after G.

### D07 — Dated charts with tables

Sources: S02-I10, S05-I3, S25-I3, S26-I4. **M; medium risk; A10 owns dates/tables.**

`UI/bits.tsx:65,84` spaces observations by index and invents a month; point values are mouse-only at :77,107,140. Callers: `UI/Panel.tsx:252,339,667,832`.

Consume A10’s timestamp axes, gaps, **“View values”** tables and exact captions. D adds **“Previous observation”** / **“Next observation”**, selecting a dated PSI value without changing the world; keep controls beside the existing chart/table. Use A10’s normalized series, including single points, rather than a second calculation pipeline. Extend its chart DOM tests: keyboard/touch selection, irregular/stale/duplicate dates, zero/null, single point and incompatible methodology; projected-payload parity remains A10’s gate. G.

### D08 — Shared gesture commitment and cancellation

Sources: S06-I3, S07-I3/I4/I7/I9. **M; medium risk; none.**

`H/engine/input.ts:39,68,97` flings on cancel and pans before the store’s 10px tap threshold (`UI/store.ts:46`). Touch leaves old cursor hover active at :269.

Share 10px touch commitment; sub-threshold motion changes neither camera nor inputEpoch. On crossing, consume accumulated delta once. Keep 480ms hold; multitouch suppresses taps until all contacts lift. Cancel/lost capture/blur/wheel clear momentum; only successful touch release may fling. Accept primary mouse/pen buttons. Fresh touch suspends cursor repicking until new hover-capable movement. Home/Stop cancel watch/follow/glide; Escape closes the top layer first, then hover, then automation. Reduced mode forbids fling and cancels automation. New `H/engine/input.test.ts`: jitter, 1→2→1, third contact, capture loss, hybrid input and preference changes.

### D09 — Anchored, consistent zoom and momentum

Sources: S06-I1/I2/I4/I7/I12, S07-I9. **M; medium risk; D08.**

`H/engine/camera-rig.ts:144` approximates ground anchoring; `H/engine/input.ts:44,128` ignores wheel units and integrates velocity by Euler; `UI/store.ts:547,556` loses repeated zoom steps.

Use before/after y=0 ray-plane intersections from consistent goal poses; skip non-intersecting rays. Require <1 CSS px settled drift except clamps. Normalize wheel units: 16px/line, canvas height/page; retain scroll-to-zoom/ctrl-pinch, sensitivity .0012, ratio clamp [.8,1.25]. DECISION-NEEDED: recommend unchanged gesture policy. Accumulate 1.25× key steps on pending distance, 150ms response; diagonal pan 520px/s. Integrate fling `v*(1-exp(-3.5*dt))/3.5`, retaining caps. Ignore cam in production; DEV accepts exactly 4/5 finite values, positive bounded distance, pitch 5–85°, clamped pan. Extend camera-rig/camera-moves/input tests across 15/30/60/120/144Hz; trackpads and G.

### D10 — Select visible subjects

Sources: S06-I5, S07-I14. **M; medium risk; D08.**

Both picker paths skip terrain rejection (`UI/picking.ts:135,475`; `H/fleet/fleet-system.ts:1425`), despite existing hidden tests at picking.ts:339.

Reject occluded candidates inside each candidate search, continuing to the next; filtering only the winning hit is insufficient. Preserve visible mast access. Keep 7px fine-pointer minimum; coarse taps use 12px. Direct visible hits outrank expanded targets; otherwise proximity then depth then ID. When expanded touch targets overlap, show ≤5 named buttons under **“Choose a ship”**, plus **“Cancel”**, rather than silently choosing. New `UI/picking.test.ts`: hidden nearer boat, visible farther boat, mast-only visibility, overlapping touch/pen targets; CPU shortlist cost check and G.

### D11 — Selection framing follows usable space

Sources: S06-I8, S07-I5. **M; medium risk; D16 pane policy.**

`UI/store.ts:349` assumes 392px sidebar/half-height sheet; `H/layout/layout-system.ts:92` resizes Home only.

Measure visible panel/sheet via ResizeObserver and reuse measurement batching. Fit subject bounds, including Pharos top, inside remaining viewport with 24px padding. Reframe on layout change only while the selection still owns camera intent; manual pan/zoom revokes ownership. Follow uses the same rectangle; reduced mode cuts. Extend framing/camera-moves tests: selection across 900px, rotation, manual-pan protection, tall landmark; DOM bounds and G.

### D12 — Portrait mainland composition

Sources: S07-I1. **M; high visual risk; coordinate world/art owner.**

Verified supplied `shots/base-tablet-portrait.png`: broad mainland band. `H/layout/framing.ts:24,59` fits hero points only; `scripts/harbour/blender/island/hb_dress.py:1590` raises a deep mainland mesh. Sky placement also depends on camera height (`H/sky/sky-system.ts:379`). Brown lighting cause remains unisolated.

Add mainland/horizon composition constraints alongside hero bounds; first trial keeps fixed yaw, 25° FOV/26° pitch and adjusts target/distance. If insufficient, art owner lowers/simplifies mainland profile; no added fog, passes or geometry. DECISION-NEEDED: operator selects the composed variant; do not invent final material values. Projection tests retain hero margins/continuity at aspect 1.4; G at 834×1112, 744×1133, 1194×834, desktop day/night. Acceptance requires band no longer competing with Pharos.

### D13 — Complete stillness

Sources: S05-I4/I13, S26-I13. **M; medium risk; D08.**

Live clocks bypass reduction in beam:332,374,392, fleet:1399, readings:117, lights:197 and sky:420 (all under H/). `H/model/moments.ts:60` retains active moments; `H/life/moments-stage.ts:82` continues flares.

Use existing MotionClock for decorative consumers, constant held-beam intensity and no heat distortion. Cancel wake/glide/inertia/active ceremonies on reduction; retain records and analytical updates. Add **“Still world”** checkbox; effective reduction = OS preference OR visitor choice, no persistence overriding OS. Copy: **“Motion is still. Readings continue to update.”** Extend services/moments/beam tests; assert unchanged decorative clocks after settling, continued source ages and new data; G temporal captures in normal→reduced→normal.

### D14 — Current, visitor-paced Watch

Sources: S04-I12, S06-I13, S26-I12. **M; medium risk; A-truth, D05/D08/D13.**

`UI/store.ts:448,467` snapshots reasons forever; :488 advances before reduced check. `UI/watch.ts:41` independently infers newcomers; model.maiden already guards producer gaps (`H/model/readings.ts:182`).

Consume A15’s guarded maiden, coherent installed-model ranking, eligibility and exact waiting copy. Keep $1M floor and 20s normal dwell. D exposes **“Previous”**, **“Next”**, **“Inspect”**, **“Stop watch”**; reduced mode only advances manually. Home/Stop end travel. Extend watch.test.ts and store tests: recovered depeg, stale source, missing history, 60s reduced immobility and button/key parity. Do not read newer feed rows against an older installed model.

### D15 — Panel IA and copy discipline

Sources: S02-I5/I6/I8/I11, S23-I3 (limited tokens). **M; low risk; A-truth, D06.**

`UI/Panel.tsx:135` puts route prose before supply/peg; :774 is clamped by CSS:393; mixed-feed sections expose only one footer (:183,620).

Order: identity → current reading/caveat → comparisons → breakdown → **“How this appears in the harbour”** disclosure → **“Sources”**. Off-peg boats lead with qualified deviation, ordinary boats with **“Supply (USD)”**; retain strong PSI/flow openings. Reuse A13’s **“More about this record”** expansion; directory link **“All upcoming coins on Pharos”**. A07 owns contributing-feed state/time sentences. Style guide: analytical noun before metaphor; expand “Pharos Stability Index” first; units %, bps, PSI points; “Not rated”, “Not covered”, “Unavailable”, “Stale” remain distinct. Reuse inks/fonts. Panel DOM tests prove order, full caveats and sources; G.

### D16 — Ledger research context

Sources: S03-I8/I11, S23-I2, S07-I10, S02-I12 (wreck entry). **M; medium risk; D04.**

`UI/Ledger.tsx:24,136` loses tab/query/sort on unmount; rows call fly-select at :183 while `UI/store.ts:327` leaves ledger open. Wreck names are static (:232).

Store per-tab query/sort/filter, scroll offset and originating row ID above presentation lifetime. **“Read record”** selects with fly:false; **“Locate”** hides ledger before flying. **“Return to ledger”** restores context/focus. Reading hides/inerts ledger when panes cannot fit with 14px margins and 14px gap (minimum 1106px); wide panes coexist. Use existing wreck identity resolver for live-payload wrecks. Readmission restores identifiers/intent after fresh readiness, never runtime below gate. New ledger/store DOM tests: all entity types, back-to-row, missing IDs, compact/wide panes and denied/readmitted cycles.

### D17 — Filtered, sourced ledger

Sources: S03-I3/I4, S05-I10, S26-I3/I14. **M; low risk; A-truth, D16.**

`UI/Ledger.tsx:153,180` has text-only filtering and no source statuses. Chain panel stops at ten holders (`UI/Panel.tsx:615`). Keeper’s Log already lists independent sources (:849).

Add **“Off peg”** (activeDepeg), **“Early warning”** (ALERT/WARNING/DANGER), **“Missing peg reading”** (nullPeg), peg/chain selectors, **“Clear filters”**. Chain membership requires chainShares.usd>0, independent of berth. **“All coins on this chain”** opens **“Coins with supply on {CHAIN}”**. Reuse A07’s column disclosures/Log link. Legend starts with non-live **“Harbour now”**, using A’s qualified readings, no new score. Ledger tests: combined predicates, complete model-ID parity, mixed freshness, NR/null and chain membership.

### D18 — Durable subject links and history

Sources: S20-I1/I2/I4/I10/I14, S06-I11/I12, S26-I6. **M; medium risk; D04, D09 validation.**

`functions/index.ts:128` recognizes legacy ship links; `UI/store.ts:111` always starts unselected. No client URL/history writer exists. Edge comments :142 incorrectly claim an existing Copy link/hash parser.

Shared runtime-neutral codec: `sel=ship.<id>|chain.<key>|yard.<id>|wreck.<id>|place.<id>`, ≤128 chars; allowlisted kinds, checked lowercase IDs/chain keys, no guessed slugs. Read legacy `#sel` only without query sel; emit query plus optional `chart=1`. Accept lighthouse→pharos; obsolete pigeonnier gets **“This place is no longer in the harbour.”** Resolve after model/layout/details readiness. Unknown IDs: **“This subject is unavailable in the current harbour.”** Push deliberate selections/close; replace initial normalization; popstate restores without writes. Exclude hover/follow/Watch ticks. **“Copy link”** emits canonical origin plus subject/chart only; **“Link copied. Opens latest readings.”**, selectable fallback **“Copy this link:”**. Preserve intent through admission. Edge welcome/metadata uses validated static identity, generic fallback for live-only IDs; retain illustration OG/homepage canonical. Analytics links require verified mappings, otherwise directories. New codec/history tests, functions/index.test.ts edge→client round trips; DOM Back/Forward/delayed readiness.

### D19 — Postcard reading receipt

Sources: S20-I5, S25-I10, S26-I7. **M; medium risk; A-truth, D04.**

`UI/Postcard.tsx:31` passes lighting hour; `H/engine/time-of-day.ts:216,254` distinguishes clockHour. `UI/postcard.ts:30,32` attributes stale PSI to supply age and turns unknown age into now.

**A19 is the implementation owner:** its immutable frame/receipt contract, clockHour, all seven source states, PSI qualification, completeness and exact printed/DOM caption apply here unchanged. D18 supplies the canonical subject link; never imply historical replay. D04 owns dialog/error/resource lifecycle. Extend postcard.test.ts with the combined journey: seasonal remap, mixed ages/nulls, qualified PSI, feed change during capture, Copy caption fallback and subject URL sanitization. G must inspect the exported low-resolution PNG. No second receipt implementation or D-owned provenance PR.

### D20 — Finished static welcome, protected gate

Sources: S08-I1/I2/I3/I4/I6/I8, S26-I8. **M; low risk; D18 for sanitized handoff.**

`index.html:54` promises permanent loading without JS; useful welcome is inert at :62; size reason is last (:91). Arrival CSS:36,58 can put card start offscreen. Guard checks client only (`scripts/check-viewport-gate.mjs:15`).

Make useful welcome first-byte HTML; JS admission alone installs **“Raising the harbour.”** Put reason/action before illustration: **“The live harbour needs a larger screen. Explore the same readings on Pharos.”**, **“Open Pharos analytics”**. Capable-screen branch: **“Give this window at least 720×600 CSS pixels, either way round. The harbour opens automatically.”** Keep **“Illustration, not live readings”** and **“Pharos Stability Index — market-wide stability”** across HTML/React/link fixtures. Static details **“Sea and weather”** and **“Unavailable readings”** reuse A-approved teaching. Keep terminal content scrollable from its start. **“Copy harbour link”** uses D18 allowlist, selectable fallback. Extend admission/client/guard tests and DOM request matcher for entry/vendor/packed media: denied physical screen, small window, pending-import resize, readmission, no-JS and 320px reflow. No native Share initially.

### D21 — Inspectable loading failures and display integrity

Sources: S04-I8/I9. **M; medium risk; none.**

`UI/App.tsx:116` has Suspense without a local boundary in its separate root. `H/app/harbour-app.tsx:79` removes partial warning; :71 can stop observation before recovery. Freshness dot knows no presentation counts (`UI/bits.tsx:7`).

D contains lazy-detail failure, preserving controls: **“These details could not load. The harbour is still available.”**, **“Close”**, **“Reload page”**. A17 owns event-driven presentation status, recovery observation and exact wordmark/Log/postcard sentences. Help must remain usable during these states; no loader fog or “live” assurance from freshness alone. Extend details-loading/reveal tests with rejected imports, incomplete→complete and late success; G arrival sequence. Use reload rather than retrying React.lazy’s rejected identity.

### D22 — Complete session book and decorative almanac

Sources: S02-I14, S05-I9, S25-I7/I8. **M; low risk; A-truth.**

`UI/Panel.tsx:546,557` exposes 40 of 200 retained entries without navigation; empty text overclaims at :556. Existing calendar is decorative (`H/season/calendar.ts:2,140,171`).

Reuse A14’s pagination, retained/discarded counts and observation/confirmation copy. D adds source/from/to/staged disclosures and **“{N} new entries.”** announcement only while book open; no mount replay/dev entries, no whole-list live region. Preserve focused rows. Keeper’s Log **“Decorative calendar”** shows existing season/day length/moon/painted meteor period; copy **“Solar timing uses a nominal latitude of 35°. This is decoration, not local astronomy or market data.”** New book/almanac tests: midnight, 200 entries, announcement deduplication, partial dates and hemispheres.

### D23 — Local return digest

Sources: S04-I11, S25-I1. **M; medium risk; A-truth.**

`UI/CornerMark.tsx:6` stores intro only; event hub is session-only (`H/model/event-hub.ts:36`). No saved market baseline exists.

Store one validated v1 browser observation: savedAt, source times, methodology identities, PSI, covered off-peg IDs, per-ID USD supply; ≤64KiB, reject oversize/malformed/future records. Freeze prior baseline for visit; save once after current, comparable admitted readings arrive. Harbourmaster **“Since your last reading”**: **“Compared with this browser’s reading at {UTC}.”** Compare compatible methods/coverage only; ≤3 matched-ID supply differences with absolute delta≥$1M, deterministic ID ties. Separate coverage changes; never infer events while absent. **“Comparison unavailable.”**, **“Forget saved reading”**. New digest.test.ts: first visit, corrupt/denied storage, method/coverage changes, null/zero and frozen baseline. No new endpoint or ceremony.

### D24 — Daily/weekly harbour report

Sources: S25-I2. **M; medium risk; A-truth, D07.**

Existing previous-day/week buckets survive projection (`shared/types/pharosville.ts:23`); they are comparison anchors, not history. Flows have independent scope (:47).

On-demand Harbourmaster **“Harbour report”**, **“24-hour comparison”** / **“Seven-day comparison”**. Pure templates: **“Reported USD supply value changed by {DELTA} across {N} comparable coins.”**, **“{SYMBOL}: {DELTA} reported USD supply value.”**, **“{OMITTED} coins lack a comparable reading.”** Sum only matched finite, complete current/previous buckets; rank ≤3 absolute movers≥$1M, ties by ID. Percent only with positive baseline. PSI cites actual two compatible observation dates; unavailable interval yields **“PSI comparison unavailable.”** Flow sentence names reported scope/window and A’s completeness qualifier; never equate supply valuation with issuance. Every sentence expands underlying values/source times. New report.test.ts plus projected-payload fixtures: zeros, nulls, missing buckets, partial flows, sparse PSI and methodology changes.

### D25 — Reflow reader (DECISION-NEEDED)

Sources: S05-I7. **L; high lifecycle risk; D07/D16/D20, operator approval.**

`src/main.tsx:29,39` tears down readings when zoom reduces CSS viewport; generic links replace them. Existing content is engine-owned.

Recommend approving a memory-only reader for previously admitted visits. Before teardown capture a versioned plain DTO: model rows, seven already-projected detail payloads, source evidence and selection/ledger intent; no engine/services. Separate lazy DOM reader outside engine ownership reuses tables/formatting, no requests/polling/world assets. Initially denied visits retain static welcome. Copy **“Saved reading from {UTC}. Live updates are paused while this window is small.”**, **“Forget saved reading”**. Age retained evidence honestly. New reader/admission tests: 200% text/zoom, 320 CSS px reflow, source aging, zero new world requests, readmission and focus handoff. Without approval this accessibility gap remains open.

### D26 — Cohesive typography and controls budget

Sources: S23-I3/I9/I11. **S; low risk; D01/D04.**

Font files have duplicate family declarations (`public/arrival-shell.css:3`, UI CSS:3); postcard uses Harbour Garamond (`UI/postcard.ts:77`). Existing runtime cap is 34KiB raw/8.5KiB gzip (`scripts/bundle-budgets.mjs:57`), not rounded 9KiB.

Share existing EB Garamond family and repeated close/action/keycap rules; retain categorical inks. Add only type/spacing roles actually reused by delivered features; no palette redesign or mechanical token sweep. Keep optical offsets literal. Check fresh runtime/arrival CSS and total JS+CSS budgets; do not promise savings from tokens or claim duplicate downloads/CLS without measurement. Delayed-font DOM geometry test plus G; metric overrides only after measured need.

## Ordered PR bundles

Estimates include tests, exclude generated assets. Split above 600 changed lines. PRs ship after prerequisites without needing later PRs. S≤1 day, M≤3 days, L≤2 weeks; feature estimates cover all its bundles. A17/A19 are external prerequisites, not duplicate D PRs.

| Order | Bundle / feature | Lines | Depends | One-line acceptance |
|---|---|---:|---|---|
| 1 | Positioning correction / D01 | 120 | — | Reduced tags anchor and search centers. |
| 2 | Search recovery / D02 | 380 | D04 opener convention | Touch/keyboard can cancel and select visible matches. |
| 3 | Detail failure boundary / D21 | 180 | — | Rejected lazy import leaves controls usable. |
| 4 | Keyboard ownership / D03 | 240 | — | Consumed/disabled shortcuts never move the world. |
| 5 | Focus and target repairs / D04 | 500 | — | Open/close journeys retain visible focus. |
| 6 | Postcard lifecycle / D04 | 400 | 5 | Modal contains focus and releases resources. |
| 7 | Gesture cancellation / D08 | 500 | — | Cancelled/jittering touches cannot fling or select. |
| 8 | Controls sheet / D05 | 450 | 4,5 | Every shipped action has touch access. |
| 9 | PSI inspection controls / D07 | 250 | A10 | Manual observation selection preserves chart/table parity. |
| 10 | Ledger context/panes / D16 | 500 | 5 | Read/Locate/Return preserves the originating row. |
| 11 | Measured selection framing / D11 | 440 | 10 | Rotation keeps untouched selection uncovered. |
| 12 | Wheel/keyboard/fling / D09 | 380 | 7 | Equal input produces consistent bounded movement. |
| 13 | Ground-anchor zoom / D09 | 350 | 12 | Unclamped settled anchor drift is <1px. |
| 14 | Visible picking / D10 | 500 | 7 | Hidden nearer boats cannot steal visible hits. |
| 15 | Still-world consumers / D13 | 550 | 7 | Reduction stops decoration but preserves readings. |
| 16 | Watch/manual progression / D14 | 450 | 8,15,A | Reasons stay current; reduced mode never auto-advances. |
| 17 | Tag bounds/overlay culling / D01 | 380 | 5 | Long facts fit; chart names avoid open tools. |
| 18 | Subject codec + restoration / D18 | 550 | D09 validation | Legacy/current subject URLs resolve after readiness. |
| 19 | Copy/history/welcome identity / D18 | 550 | 18 | Back/Forward and Copy preserve latest-reading intent. |
| 20 | Static welcome/boundary guards / D20 | 550 | 19 | No-JS is finished; denied visits request no world data. |
| 21 | Panel order/copy links / D15 | 500 | A,8 | Current facts/caveats precede scenery explanations. |
| 22 | Ledger filters/provenance / D17 | 500 | 10,A | Filtered rows and source states reconcile. |
| 23 | Optional five-stop guide / D06 | 450 | A,8,21 | Guide replays and never starts automatically. |
| 24 | Day book interaction / D22 | 250 | A14 | Expanded evidence and announcements preserve focus. |
| 25 | Calendar + typography / D22,D26 | 350 | 5 | Calendar is labelled decorative; CSS caps hold. |
| 26 | Return digest / D23 | 500 | A | One prior browser observation yields qualified differences. |
| 27 | Daily/weekly report / D24 | 550 | A08,A10,9 | Every sentence expands to comparable dated inputs. |
| 28 | Reader DTO / D25 | 400 | approval | DTO retains readings without engine references. |
| 29 | DOM reader / D25 | 550 | 28,A10 | Saved rows reflow without network requests. |
| 30 | Gate handoff / D25 | 450 | 29,20 | Zoom preserves focus/readings and readmission intent. |
| 31 | Portrait composition / D12 | ≤400 + generated GLB | art owner | Operator approves portrait and desktop GPU comparisons. |

Bundle 2 includes its opener helper before 5 generalizes focus. Order favors reachable inspection and deterministic repairs before narratives/art.

## Exclusions, corrections and decisions

Partial adoption does not authorize omitted subfeatures.

| Sources | Disposition and verified reason |
|---|---|
| S02-I7 | Defer formatting overhaul. Boundary defects are real (`UI/format.ts:12,23`); A10 fixes PSI points only. Cached Intl/locale and exact-value redesign is separate scope. |
| S03-I5/I7/I10/I12 | Defer aliases/typos, previews/recents, paging/columns and comparison. `UI/search.ts:25` already ranks exact/prefix/subsequence; Ledger:169 mounts all rows, but no measured latency warrants paging. Finish cancellation, provenance and retained state first. |
| S04-I7; S08-I7 | Transfer telemetry/cancellation to runtime: boot states exist (`H/app/harbour-app.tsx:23`); fetches lack signal (`H/engine/assets.ts:36,93`). [C01](C-resilience-qa.md) owns cancellation. D20 adds the main.ts structural guard; C13 owns emitted-request classification. |
| S06-I6/I9/I15; S07-I6 | Defer hysteresis, soft bounds, click changes and sheet snaps. Fades/glides/fixed sheet exist (`H/fleet/hover-lantern.ts:9`, camera-rig:96, UI CSS:442); tuning needs demonstrated benefit. |
| S07-I11; S26-I9 | Transfer energy/quality choices to performance owner. Medium/DPR1.5 startup exists (`H/engine/quality.ts:61`); sustained tablet evidence absent. DECISION-NEEDED: recommend Auto unchanged until measured. |
| S08-I5; S23-I6/I7 | Transfer media/font loading and render-hot-path optimization to performance owner; literal code opportunities exist, no measured bottleneck established. D26 shares declarations without claiming load wins. |
| S20-I3 | Defer optional camera/time snapshot links; subject/chart links solve core sharing. Public cam currently bypasses bounds (`H/layout/layout-system.ts:53`), repaired by D09. Live URL never promises historical reconstruction. |
| S08-I9/I10/I11/I12 | DECISION-NEEDED, recommend defer phone digest, daily image, runtime and video. `src/main.tsx:29` forbids world work below gate; existing postcard needs canvas. Each needs a separate data/media/device contract. Static welcome improvements require no gate exception. |
| S20-I8/I9 | DECISION-NEEDED, recommend generic OG initially. Build-time identity cards require narrowing `docs/pharosville/GITHUB_MEDIA.md:49`; dynamic rasterization adds unmeasured operations. Current image metadata already exists (`index.html:25`). |
| S20-I11/I12/I13 | Defer install/offline/embed. Manifest already uses browser display; framing is explicitly denied (`public/_headers:10`). DECISION-NEEDED before install scope, cache lifecycle or framing policy changes. |
| S25-I4/I5/I6/I9/I11 | Defer replay, monthly remembrance, life records, journal persistence and year comparisons. Existing anniversaries are not missing (`UI/Panel.tsx:416`); replay/year data is outside allowlist (`shared/lib/pharosville-endpoint-registry.ts:21`). Date coverage/provenance and archive operations need separate work. |
| S26-I10/I11 | Transfer silhouette/palette experiments to art workstream; they are experiments, not verified visual defects. D12 alone carries the inspected portrait defect. |

DECISION-NEEDED: native Share (S20-I7/S08-I2 remainder) needs both `web-share=()` policies changed (`public/_headers:7`, `functions/_shared.ts:15`); recommend Copy/Save first. Host reciprocal links require separate authorization. Recommend manual reduced Watch, demand-only help and latest-reading links. No public camera rotation, phone admission or new API routes.

Drop already-shipped claims: one-click sound (`H/audio/SoundToggle.tsx:56`), keyboard tables/full fleet rows (`UI/Ledger.tsx:157,192`), hover fades, portrait admission (`src/systems/viewport-gate.ts:29`). Correct S26: caption starts from hasFleet, **not** rendered readiness (`UI/CornerMark.tsx:30`). Stale edge comments claiming Copy/hash parsing are false. None is a new feature.

## Proof required at implementation

Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/): keyboard, focus, pointer cancellation, gesture/drag alternatives, targets, chart alternatives, reflow and status messages. Stillness is also a product requirement. D25 blocks broad conformance claims. Check NVDA/Firefox, VoiceOver/Safari, forced colors, 200% zoom/text and 320px reflow.

**G — later real-GPU proof:** `npm run preview -- --url <scenario> --width <W> --height <H> --out outputs/<name>.png`, shared headless Chrome only. Inspect normal/reduced temporal captures, day/night, missing PSI/stale/storm at 600×720, 720×600, 834×1112, 1194×834, 1100×640 and desktop. DOM tests cannot prove looks/speed; physical Safari keyboard/trackpad/pen checks remain necessary. Preserve Apple Silicon Safari 26/Chrome p95≤16.7ms. Run named tests, validate:changed, fresh build/bundle checks. No new dependencies.
