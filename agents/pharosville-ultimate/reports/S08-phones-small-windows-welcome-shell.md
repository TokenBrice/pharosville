# S08

## Executive summary

Recommend improving the existing static phone welcome while retaining both sorted 720×600 gate checks. The illustrated guide, analytics links, touch targets and React-free admission are already strong. Fix permanent loading copy without JavaScript, scroll-inaccessible arrival content, and incomplete entry-boundary validation. Resize teardown stops rendering and API polling, but asset transfers lack cancellation. Daily readings require an explicit data-boundary decision; a phone runtime requires substantial optimization and real Android/iPhone validation. A video offers atmosphere with less engineering, but less analytical value.

## Current state

- Both physical screen and current window must independently satisfy long side ≥720 and short side ≥600 CSS pixels. Rotation alone cannot admit a phone; portrait tablets pass. Evidence: src/main.tsx:28, src/systems/viewport-gate.ts:18, src/systems/viewport-gate.ts:29.
- Blocked visitors receive an existing responsive harbour illustration, explicit non-live caption, three explanations and five analytics links. The page uses normal document flow, 44px link targets and visible keyboard focus. Evidence: index.html:62, index.html:74, public/arrival-shell.css:95, public/arrival-shell.css:112.
- Initially blocked visitors import neither React nor the world. They still load the entry, error reporter and, when configured, delayed Google Analytics. Evidence: src/main.tsx:1, src/main.tsx:24, src/main.tsx:48, src/google-analytics.ts:13.
- Without JavaScript, visitors retain identity, the poster, guide and two useful links. However, the richer welcome remains inside an inert template and the status permanently says 'Raising the harbour.' Evidence: index.html:44, index.html:54, index.html:62.
- Shrinking below admission unmounts React immediately, invalidates pending admission and shows the welcome. Readmission restores the poster and creates a fresh world. API requests and polling abort during teardown. Evidence: src/main.tsx:37, src/main.tsx:49, src/harbour/app/harbour-app.tsx:132, src/harbour/engine/engine.ts:192, src/harbour/data/fetch.ts:138.
- The poster has reserved dimensions, responsive AVIF/WebP sources and high loading priority. Welcome replacement changes the initial composition; font swaps can change metrics. These are LCP/CLS risks, not measured regressions. Evidence: index.html:14, index.html:37, index.html:74, src/main.tsx:16, public/arrival-shell.css:3.
- Two unconditional font preloads total 49,168 bytes; the italic face adds 25,388 bytes when used. Poster AVIFs are 47,368 and 104,998 bytes. Welcome body text already uses system fonts. Evidence: index.html:14, public/arrival-shell.css:3, public/arrival-shell.css:101; sizes verified directly from public/fonts and public/harbour.
- Tablet groundwork already exists: touch gestures, aspect-aware framing and bottom-sheet panel sizing. Current quality tiers retain the same geometry and materials; low still uses 2048px shadows and six bloom levels. Evidence: src/harbour/engine/input.ts:49, src/harbour/layout/framing.ts:6, src/harbour/ui/store.ts:53, src/harbour/engine/quality.ts:2.
- The manifest deliberately uses browser display and supplies one wide screenshot; it supplies neither offline behavior nor a phone-specific experience. Phone runtime support remains deferred. Evidence: public/manifest.webmanifest:7, public/manifest.webmanifest:18, ROADMAP.md:22, agents/2026-10-13-pharosville-reboot/PLAN.md:36.
- Read-only verification completed: onboarding, viewport guard, source assertions and asset-size arithmetic. The guard passed. Existing admission tests cover threshold crossing and poster restoration; browser tests were inspected, not executed. Evidence: src/harbour/app/admission.test.ts:38, src/harbour/app/admission.test.ts:53, tests/visual/harbour-dom.spec.ts:22.

## Findings

### S08-F1 [medium] No-JS visitors receive a loading promise that never resolves

- Evidence: index.html:54; index.html:62; index.html:97; src/client.test.tsx:124
- Detail: The initial status promises that the harbour is being raised, but only the module can advance it. Disabled JavaScript or a failed entry download leaves that promise indefinitely. The useful five-link welcome and explicit illustration caption are unavailable inside the template. Existing tests assert the misleading status.
- Fix: Make initial HTML a completed static welcome with an explicit illustration caption and useful links. Set 'Raising the harbour' only after JavaScript admits the viewport and begins importing the app.

### S08-F2 [medium] Persistent arrival content can become unreachable in short windows

- Evidence: public/arrival-shell.css:36; public/arrival-shell.css:57; public/arrival-shell.css:86; src/components/arrival-shell.tsx:36
- Detail: The arrival surface is fixed to the viewport and its card is absolutely positioned from the bottom, without a height limit or scrolling container. Whenever card content exceeds available height, its top extends above the viewport. This affects no-JS visits, entry failures and renderer failures; narrow layouts increase card height.
- Fix: Give the persistent arrival surface a scrollable layout that keeps its start reachable, or reuse the existing normal-flow welcome for terminal states. Verify short landscape windows and enlarged text.

### S08-F3 [medium] Shrinking during boot does not cancel world asset transfers

- Evidence: src/harbour/app/harbour-app.tsx:134; src/harbour/app/harbour-app.tsx:139; src/harbour/engine/assets.ts:36; src/harbour/engine/assets.ts:92; src/harbour/engine/prefetch.ts:19
- Detail: Rendering and the API feed abort promptly, but asset fetches have no AbortSignal. Disposal waits for boot to settle. The island completion callback can consequently continue discovering civic and hull assets after admission is withdrawn. This wastes bandwidth and can overlap a fresh engine after rapid readmission; initial phone admission remains protected.
- Fix: Connect asset transport and prefetch continuations to the engine lifetime signal. Check cancellation before discovering dependent assets, and test shrinking while the island response is pending.

### S08-F4 [medium] The viewport guard does not inspect the admission owner

- Evidence: scripts/check-viewport-gate.mjs:14; scripts/check-viewport-gate.mjs:29; src/main.tsx:45; tests/visual/harbour-dom.spec.ts:7
- Detail: The structural checker reads client.tsx, although main.tsx now controls pre-React imports and preload activation. A new eager import in main can evade it. Browser request matching also omits general vendor chunks, packed assets and textures, while the browser suite has no resize-with-pending-import scenario.
- Fix: Check main.tsx and the emitted admission boundary. Extend DOM request assertions to registry transports and React/Three chunks, then cover denied screen, small desktop window and pending-import resize races.

### S08-F5 [low] The welcome gives PSI two different names

- Evidence: src/fallback-links.ts:2; index.html:81; index.html:85; src/components/arrival-shell.tsx:7
- Detail: The guide calls the lighthouse reading the Pharos Stability Index, while its adjacent destination says 'Peg Stability Index'. This introduces an unnecessary apparent distinction at the moment visitors are learning the vocabulary.
- Fix: Use 'Pharos Stability Index — market-wide stability' consistently in the template, fallback links and parity assertions.

### S08-F6 [low] The reason the live harbour is unavailable appears last

- Evidence: index.html:70; index.html:78; index.html:84; index.html:91; src/desktop-only-fallback.tsx:31
- Detail: The size explanation follows the illustration, complete guide and five links. Phone visitors must read or scroll through the page before learning why it differs from the advertised living harbour. A too-small desktop window likewise postpones its directly actionable resize instruction.
- Fix: Move a short, branch-specific explanation and primary analytics action directly below the promise. Keep detailed dimensions and supporting links further down.

## Ideas

### S08-I1 DECISION-NEEDED: make the existing welcome a complete phone destination

*all-devices · ux · effort M · impact 5 · confidence 5*

- What: Keep both 720×600 predicates unchanged. Move 'The live harbour needs a larger screen. Explore the same readings on Pharos now.' above the existing illustration, followed by 'Open Pharos analytics'. For capable screens say 'Give this window at least 720×600 CSS pixels, either way round. The harbour opens automatically.' Retain the guide and specialist links.
- Visitor benefit: Phones receive an intentional explanation and immediate useful action; desktop visitors know exactly how to enter.
- Data/DOM: No live data. Preserve 'Illustration, not live readings'. Keep the existing guide and source links.
- Where: index.html:68; src/main.tsx:20; src/desktop-only-fallback.tsx:25; public/arrival-shell.css:99; ROADMAP.md:22.
- Perf: Approximately zero additional transfer or rendering cost; reuse existing art and CSS.
- Risks: Avoid suggesting rotation will admit phones. Keep HTML and React copy identical. This improves an existing shipped welcome.
- Depends on: —

### S08-I2 Add a small larger-screen handoff

*professional · ux · effort M · impact 4 · confidence 5*

- What: Add 'Copy harbour link' and feature-detected native Share controls to the React-free welcome. Preserve the current URL, announce success, and offer a selectable link when copying fails. Offer QR only through an explicit reveal if demand warrants its encoding cost.
- Visitor benefit: Visitors can save or send the harbour to a tablet or computer without manually reconstructing its address.
- Data/DOM: No API calls or accounts. Use the canonical origin; validate any preserved state. Expose success and failure through a polite status.
- Where: src/main.tsx:14; index.html:84; public/_headers:7; functions/_shared.ts:15; scripts/pharosville/check-security-headers.mjs:1.
- Perf: Target <2 KiB additional entry gzip for copy/share; QR encoding requires a separately reviewed budget.
- Risks: web-share=() currently denies native sharing. Change both policies and their tests to web-share=(self). Clipboard denial needs a usable fallback.
- Depends on: S08-I1

### S08-I3 Make completed static content the first-byte default

*professional · ux · effort M · impact 5 · confidence 5*

- What: Render the useful welcome directly in initial HTML. Admission replaces it with the loading shell only when importing the app. Prefer one reusable static subtree over adding another independently maintained no-JS copy.
- Visitor benefit: Disabled JavaScript, blocked modules and slow connections all receive an honest, finished page.
- Data/DOM: No live readings. Include the illustration disclaimer, headings, guide and analytics navigation in ordinary HTML.
- Where: index.html:44; index.html:62; src/main.tsx:9; src/main.tsx:43; src/client.test.tsx:124.
- Perf: Comparable HTML size; potentially removes the phone's fixed-overlay-to-document replacement.
- Risks: Retain the desktop loading poster and admission generation checks. Update tests that currently require permanent loading copy.
- Depends on: —

### S08-I4 Keep arrival and failure content reachable at every height

*all-devices · ux · effort S · impact 4 · confidence 5*

- What: Use a scrollable arrival container with a reachable start when the card exceeds the viewport. Keep existing desktop placement where it fits; apply the same behavior to renderer and module failures.
- Visitor benefit: Short windows and enlarged text retain the whole explanation and working exit links.
- Data/DOM: No data changes. Preserve semantic headings, navigation, status and keyboard focus.
- Where: public/arrival-shell.css:36; public/arrival-shell.css:57; src/components/arrival-shell.tsx:16; src/components/arrival-shell.tsx:36.
- Perf: A few CSS rules; zero world draws or media bytes.
- Risks: Check 320px width, very short windows and enlarged text. Avoid introducing an unnecessary nested scroll area.
- Depends on: —

### S08-I5 Reduce welcome media and font competition

*all-devices · infra · effort M · impact 3 · confidence 4*

- What: Match image sizes to the actual padded figure, add smaller derivatives of the existing poster, and align initial and welcome image selection. After first-byte restructuring, preload only fonts used immediately; add a metric-adjusted serif fallback if measured shifts justify it.
- Visitor benefit: The illustrated phone welcome appears sooner with less avoidable transfer and text movement.
- Data/DOM: Existing decorative illustration only; keep dimensions, responsive formats and the explicit non-live caption.
- Where: index.html:14; index.html:16; index.html:72; public/arrival-shell.css:3; scripts/harbour/build-asset-registry.mjs:58.
- Perf: Current AVIF choices: 47.4/105.0 KB. Removing an unnecessary regular-font preload could save 23.8 KB; actual savings depend on selection.
- Risks: Do not sacrifice high-DPR clarity blindly. LCP and CLS gains require later measurement; font-display: swap is already present.
- Depends on: S08-I3

### S08-I6 Guard the actual pre-React boundary and resize races

*professional · infra · effort M · impact 5 · confidence 5*

- What: Extend the source guard to main.tsx and add focused admission cases for shrinking during a pending import, rapid readmission and screen denial despite a large viewport. Later extend browser DOM checks to emitted chunks and asset-registry transports.
- Visitor benefit: Phone battery and bandwidth remain protected as the welcome grows.
- Data/DOM: Assert zero initial world/API discovery on denied visits. Test stale imports cannot mount and readmission restores one poster and one runtime.
- Where: scripts/check-viewport-gate.mjs:29; scripts/check-guards.test.mjs:308; src/harbour/app/admission.test.ts:53; tests/visual/harbour-dom.spec.ts:7.
- Perf: Zero production cost; a small increase in test work.
- Risks: Keep correctness assertions separate from visual or performance judgments. Existing bundled-browser frames remain unsuitable for performance claims.
- Depends on: —

### S08-I7 Cancel asset discovery when admission is withdrawn

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Pass the engine lifetime signal into asset transports and check it before dependent prefetch loops. Treat cancellation as expected teardown, preserving existing failure handling for genuine transfer errors.
- Visitor benefit: Shrinking or folding during loading stops unnecessary downloads and reduces overlapping boot work.
- Data/DOM: No analytical change. The existing API-feed abort remains intact; this extends cancellation to static world resources.
- Where: src/harbour/engine/engine.ts:194; src/harbour/engine/assets.ts:36; src/harbour/engine/assets.ts:92; src/harbour/engine/prefetch.ts:19.
- Perf: Negligible steady-state overhead; avoids outstanding model transfers and dependent discovery after cancellation.
- Risks: Cover production packed transport and development GLB loaders. Abort must settle initialization promptly without reporting a renderer failure.
- Depends on: S08-I6

### S08-I8 Use one stability-index name across welcome surfaces

*professional · ux · effort S · impact 2 · confidence 5*

- What: Replace 'Peg Stability Index' with 'Pharos Stability Index — market-wide stability'. Extend existing copy parity checks to the static welcome template and fallback link labels.
- Visitor benefit: The lighthouse explanation and linked evidence use the same vocabulary.
- Data/DOM: No new analytical cue or threshold. Preserve the current stability-index destination.
- Where: src/fallback-links.ts:2; index.html:85; src/client.test.tsx:150; src/components/arrival-shell.tsx:7.
- Perf: Effectively zero.
- Risks: Update every duplicated welcome copy; do not describe PSI as a guarantee of safety.
- Depends on: —

### S08-I9 DECISION-NEEDED: a dated text harbour digest

*informative · data-bound · effort L · impact 4 · confidence 4*

- What: If phones should receive market readings, inject a cached, dated PSI snapshot through the existing root Function. Fetch server-side with the existing secret boundary; never start HarbourFeed. Begin with one source and its provenance rather than rebuilding a dashboard.
- Visitor benefit: A phone visit answers a current analytical question without WebGL or polling.
- Data/DOM: Use current.score, band, computedAt and inputDegradation from shared/types/stability.ts:27. DOM: 'Snapshot as of … UTC', score/band, degradation and unavailable text. Reuse source freshness rules; test null, stale and degraded inputs.
- Where: functions/index.ts:219; functions/api/[[path]].ts:246; shared/types/stability.ts:27; shared/lib/pharosville-endpoint-registry.ts:40; docs/pharosville/CONTRACTS.md:17.
- Perf: Target <5 KB added HTML. Root already executes a Function; add cache reads and one source fetch per cache miss, with no extra browser API calls.
- Risks: This is world-derived data despite server rendering, requiring an explicit contract exception. Cache API misses vary by edge location; no global once-daily-fetch guarantee or verified dollar estimate.
- Depends on: S08-I1

### S08-I10 DECISION-NEEDED: a daily postcard image

*enchanting · data-bound · effort L · impact 3 · confidence 3*

- What: Compose a cached SVG postcard at the edge using the approved still plus dated digest text, with an equivalent HTML caption. Embed the still in the SVG; never run the Three engine per request. A genuinely rendered fleet snapshot instead needs a separate scheduled capture-and-publish pipeline.
- Visitor benefit: A shareable daily keepsake offers a small reason to return.
- Data/DOM: Reuse S08-I9 fields and tests. Clearly separate the decorative harbour illustration from the dated reading; state 'Illustration; readings captured … UTC'. Expose the same figures and provenance in HTML.
- Where: src/harbour/ui/postcard.ts:16; src/harbour/ui/postcard.ts:54; functions/index.ts:219; public/harbour/poster-960.avif; index.html:74.
- Perf: Embedded 960px AVIF starts near 63 KB after base64, plus SVG/text. Adds an image request/Function invocation unless published as a static artifact; generation occurs on cache misses.
- Risks: Existing composePostcard requires browser canvas and cannot run unchanged in Functions. Full 3D daily imagery is XL with new operations ownership. Clearly distinguish snapshot age from source freshness.
- Depends on: S08-I9

### S08-I11 DECISION-NEEDED: an opt-in phone runtime experiment

*all-devices · ux · effort XL · impact 5 · confidence 2*

- What: Estimate 4–8 weeks plus hardware validation. Keep one engine; introduce explicit phone admission instead of globally lowering 720×600. Start DPR 1, cheaper shadows/effects, a proposed 30fps target, portrait hero framing and existing touch controls. Keep full analytical records; any capped visible fleet must disclose omissions and revise readiness counts.
- Visitor benefit: Phones could inspect a genuinely interactive harbour rather than leave for another site.
- Data/DOM: Retain existing field mappings, freshness and ledger truth. If fleet drawing is capped, show 'Displaying X of N boats'; selected ships remain inspectable. This changes D2 and potentially D5, not just CSS.
- Where: src/main.tsx:28; src/client.tsx:60; src/harbour/engine/quality.ts:27; src/harbour/layout/framing.ts:59; src/harbour/fleet/fleet-system.ts:910; src/harbour/app/harbour-app.tsx:90.
- Perf: At 390×844, two RGBA16F buffers alone require approximately 5/11/20 MiB at DPR 1/1.5/2; 2048px depth shadows add approximately 16 MiB. Assets, depth, bloom and browser memory add substantially.
- Risks: Feasible experimentally, unproven on mid-range Android or iPhone Safari. No universal safe memory ceiling: propose ≤128 MiB GPU allocations and ≤256 MiB tracked page allocations as goals, then validate thermal soak, context loss and foreground recovery. Existing low tier retains geometry.
- Depends on: S08-I6, S08-I7

### S08-I12 DECISION-NEEDED: an optional prerecorded harbour loop

*enchanting · decorative · effort L · impact 3 · confidence 4*

- What: Produce one approved 10–15 second loop from the existing authored world. Show the current poster first and load video only after 'Play harbour preview'. Provide pause controls, an explicit prerecorded label and a static reduced-motion experience.
- Visitor benefit: Phones can experience the harbour's atmosphere without loading its renderer or data model.
- Data/DOM: No live readings or browser API calls. Label 'Prerecorded harbour preview — illustration, not current market conditions'. Avoid numerical overlays.
- Where: index.html:70; public/arrival-shell.css:96; public/_headers:7; scripts/harbour/build-asset-registry.mjs:58; src/harbour/app/harbour-app.tsx:148.
- Perf: Estimate 1–3 MB for a short 720p encode, plus decoder buffers and ongoing battery use while playing; zero world draws.
- Risks: Lower analytical value than the static guide. Avoid autoplay and motion for reduced-motion visitors. Requires approved capture/encoding work, format checks and calm looping without visible jumps.
- Depends on: S08-I1

## Top picks

1. S08-I1 — Best strategic value: reuse the shipped welcome, preserve the protective gate and make the next action obvious.
2. S08-I3 — Makes no-JS and failed-entry visits honest while reducing duplicated welcome behavior.
3. S08-I4 — Small CSS change restores access to content in short or enlarged-text windows.
4. S08-I6 — Protects the real pre-React admission boundary before adding welcome interactions or data.
5. S08-I2 — Provides a practical return path to the full harbour without a runtime, account or backend.

## Operator decisions

- DECISION-NEEDED: approve the recommended static-welcome and handoff path, retaining both sorted 720×600 checks and the no-world-data rule?
- DECISION-NEEDED: may blocked visitors receive a dated, server-rendered market digest, explicitly amending the current world-data boundary?
- DECISION-NEEDED: if a daily postcard is desired, should it be approved illustration plus dated readings, or a genuine rendered fleet snapshot with a scheduled publishing owner?
- DECISION-NEEDED: fund a 4–8 week phone-runtime experiment, define target Android/iPhone hardware, and accept a separate mobile frame-rate target and any explicitly disclosed fleet reduction?
- DECISION-NEEDED: is a user-played prerecorded preview valuable enough to justify media production, transfer and battery cost?
- DECISION-NEEDED: should optional QR handoff ship initially, or should copy/share usage establish demand first?

## Cross-lane hooks

- Shell/loading lane: coordinate first-byte welcome restructuring with poster restoration, immutable asset rewriting and module-failure behavior. Evidence: src/main.tsx:42; src/harbour/app/poster.ts:53; scripts/harbour/build-asset-registry.mjs:102.
- Performance lane: establish decoded asset residency and real Android/iPhone thermal behavior before phone admission. Current tiers retain geometry; prior AMD iGPU results cannot predict phone performance. Evidence: src/harbour/engine/quality.ts:2; agents/claudeville-prettier/exec/INTEGRATION-NOTES.md:37.
- Data/API lane: own digest source validation, freshness, degradation and cache accounting. Keep secrets server-side and resolve the blocked-viewport contract explicitly. Evidence: shared/types/stability.ts:27; functions/api/[[path]].ts:240.
- Accessibility/QA lane: verify short-window scrolling, enlarged text, no-JS completion, handoff announcements and resize focus. Extend HTML/template/React parity coverage. Evidence: public/arrival-shell.css:36; src/client.test.tsx:150.
- Sharing/security lane: align canonical URL handling and both Permissions-Policy sources before native sharing. Evidence: functions/index.ts:52; public/_headers:7; functions/_shared.ts:15.
- Not checked: browsers, rendered appearance, measured LCP/CLS, physical phones or current Cloudflare pricing; no files changed.
- Risk: performance, memory and hosting figures are code-based estimates, not device measurements or a billing quote.
