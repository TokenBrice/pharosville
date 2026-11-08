# S07

## Executive summary

Touch support is substantial: pan, inertia, midpoint pinch, tap selection, long-press tags, home gestures, tablet framing, and a bottom sheet already exist. The size gate correctly reevaluates admission without orientation gating. Priorities are keyboard-safe search, gesture cancellation, selection reframing after resize, and portrait composition. An in-memory check reproduced inertia after pointercancel. Another confirmed that portrait fitting increases camera distance from 650 m to 1,089 m without changing pitch or FOV, exposing the mainland mesh as a broad band. Tablet performance starts sensibly at Medium/DPR 1.5, but sustained Safari/iPad performance remains unmeasured.

## Current state

- One finger pans with inertia; two fingers pan and pinch toward their midpoint. Rotation is intentionally absent, consistent with the fixed camera: src/harbour/engine/input.ts:63; src/harbour/engine/camera-rig.ts:49.
- Tap selects, a 480 ms hold shows a tag, and double-tap on empty water returns home. Multitouch suppresses selection: src/harbour/ui/store.ts:43; src/harbour/ui/store.ts:269.
- Hoverless devices retain visible search, ledger, chart, and home buttons; coarse pointers receive many 44 px targets and touch-specific introduction copy: src/harbour/ui/harbour-ui.css:419; src/harbour/ui/CornerMark.tsx:75.
- Below 900 px width, details become a bottom sheet capped at 50dvh. Its body scrolls independently; bottom safe-area padding exists. There are no drag handlers or snap states: src/harbour/ui/Panel.tsx:41; src/harbour/ui/harbour-ui.css:439.
- Search focuses its input after mounting, supports keyboard navigation, and displays seven matches. Positioning uses 14vh without visualViewport handling: src/harbour/ui/Search.tsx:63; src/harbour/ui/harbour-ui.css:269.
- Admission checks both screen and window against sorted 720×600 dimensions. Resize and orientation events cancel obsolete imports, unmount denied sessions, and restore the poster on readmission: src/main.tsx:27; src/main.tsx:58.
- Engine resize updates render targets and projection. Home composition refits only while the camera remains at its previous home framing: src/harbour/engine/engine.ts:404; src/harbour/layout/layout-system.ts:92.
- Mobile GPU names or coarse primary pointers start at Medium/DPR 1.5; automatic quality can climb to High/DPR 2. Timerless probing is implemented: src/harbour/engine/quality.ts:61; src/harbour/engine/governor.ts:250.
- Audio creation/resume runs synchronously inside a user gesture, includes webkitAudioContext support, and remembered sound waits for interaction: src/harbour/audio/controller.ts:148; src/harbour/audio/controller.ts:158.
- The supplied portrait shot was inspected without launching a browser. In-memory source checks reproduced cancellation inertia and calculated portrait framing; existing admission tests cover denial/readmission: src/harbour/engine/input.ts:39; src/harbour/app/admission.test.ts:53.

## Findings

### S07-F1 [medium] Portrait fitting exposes a broad mainland wall

- Evidence: src/harbour/layout/framing.ts:24; src/harbour/layout/framing.ts:59; scripts/harbour/blender/island/hb_dress.py:1590; src/harbour/sky/sky-system.ts:379; agents/pharosville-ultimate/shots/base-tablet-portrait.png
- Detail: At 834×1112, the actual fitter changes distance from 650 m to 1,089 m while retaining 25° FOV and 26° pitch. Only hero landmarks constrain the fit. The exported shakkei mesh is a deep, rising mainland surface; it becomes conspicuous behind the harbour. CPU ray checks confirmed that mesh occupies the offending screen region. Exact lighting contributions to its brown appearance were not isolated.
- Fix: Include mainland and horizon composition in portrait acceptance. Adjust bounded portrait framing and mainland silhouette/material treatment together; preserve landmark visibility and avoid using stale-data fog to conceal the defect.

### S07-F2 [medium] Search has no keyboard-safe bounds or visible dismissal

- Evidence: src/harbour/ui/Search.tsx:64; src/harbour/ui/Search.tsx:70; src/harbour/ui/Search.tsx:90; src/harbour/ui/harbour-ui.css:269; src/harbour/ui/harbour-ui.css:279
- Detail: Search uses layout-viewport positioning, has no maximum visible height or scrolling results container, and does not observe visualViewport. Seven coarse-pointer rows alone require at least 308 px. A software keyboard can cover matches, particularly in landscape. The loaded search also lacks the visible Close action provided by its loading fallback. Actual Safari keyboard behavior was not exercised.
- Fix: Constrain search to the visual viewport, scroll its results independently, and add a persistent Close button. Keep keyboard-only viewport changes separate from world admission policy.

### S07-F3 [medium] Pointer cancellation can launch a fling

- Evidence: src/harbour/engine/input.ts:38; src/harbour/engine/input.ts:39; src/harbour/engine/input.ts:84; src/harbour/engine/input.ts:97
- Detail: pointercancel calls the ordinary release handler, which starts inertia when recent touch velocity exceeds the threshold. An in-memory reproduction moved 20 px, cancelled, then observed another 6.67 px pan on the next 1/60-second update. Browser or operating-system gesture takeover therefore can produce camera movement after cancellation.
- Fix: Give cancellation an explicit reset path that clears velocity and active gesture state without flinging. Handle unexpected lostpointercapture consistently and test cancellation during pan and pinch.

### S07-F4 [medium] A previous mouse hover can overwrite touch tags

- Evidence: src/harbour/ui/store.ts:155; src/harbour/ui/store.ts:203; src/harbour/ui/store.ts:269; src/harbour/ui/store.ts:277
- Detail: Mouse or hovering-pen movement sets pointer.inside. Touch movement bypasses that state, and touchDown does not clear it. The frame loop can continue repicking the old mouse coordinates while touching the canvas, including after a long press requests a different tag. This affects mixed touch/trackpad or touch/stylus sessions.
- Fix: Suspend cursor-hover repicking when touch becomes active. Resume it only after fresh movement from a hover-capable pointer, and retain the requested touch tag until a deliberate dismissal.

### S07-F5 [medium] Selected objects are not reframed when panel placement changes

- Evidence: src/harbour/ui/store.ts:348; src/harbour/ui/store.ts:140; src/harbour/layout/layout-system.ts:92; src/harbour/ui/harbour-ui.css:439
- Detail: Selection framing chooses side-panel or bottom-sheet clearance when flyTo runs. The UI system has no resize callback, while layout resize only adjusts the home pose. Rotation or Stage Manager resizing across 900 px therefore changes the overlay footprint without recomputing selection clearance. A subject framed beside a panel can fall behind the newly introduced bottom sheet.
- Fix: Observe the actual overlay footprint and reframe the current selection when placement changes, unless the visitor has explicitly taken control of the camera.

### S07-F6 [low] Watch and postcard lack touch entry points

- Evidence: src/harbour/ui/App.tsx:81; src/harbour/ui/App.tsx:82; src/harbour/ui/CornerMark.tsx:62; src/harbour/ui/KeyList.tsx:14
- Detail: Watch and postcard are triggered only through keyboard shortcuts. The persistent touch controls expose search, ledger, chart, and home; the keyboard list describes these additional features without providing actions. Tablet visitors without a hardware keyboard cannot start them.
- Fix: Expose existing watch and postcard actions through a compact on-demand menu or ledger controls, with a visible Stop action while watching.

### S07-F7 [low] Tap tolerance and camera movement disagree

- Evidence: src/harbour/engine/input.ts:68; src/harbour/ui/store.ts:46; src/harbour/ui/store.ts:284; src/harbour/engine/camera-rig.ts:127
- Detail: The camera pans on the first nonzero touch movement, while selection still accepts movement up to 10 px as a tap. Finger jitter can therefore move the camera, cancel a glide, increment inputEpoch, and still select on release. Long-press picking also uses the original contact coordinates after this movement.
- Fix: Share a gesture activation threshold between input and selection. Accumulate sub-threshold movement without changing the rig, then begin panning once the gesture commits.

### S07-F8 [medium] Touch inertia ignores reduced motion

- Evidence: src/harbour/engine/input.ts:97; src/harbour/engine/input.ts:125; src/harbour/engine/engine.ts:270; src/harbour/ui/store.ts:370
- Detail: Programmatic camera moves cut under reduced motion, but touch release still starts exponential inertia. Both engine frame paths update CameraInput with ordinary delta, and CameraInput has no motion preference input. The camera can continue moving after the visitor releases it despite the otherwise careful reduced-motion behavior.
- Fix: Disable post-release inertia when reduced motion is active and clear an existing fling when that preference changes. Preserve direct finger-controlled pan and pinch.

### S07-F9 [low] Some touch controls miss the interface's 44 px convention

- Evidence: src/harbour/ui/harbour-ui.css:415; src/harbour/ui/harbour-ui.css:169; src/harbour/audio/sound-toggle.css:20; src/harbour/audio/sound-toggle.css:40
- Detail: The touch section promises 44 px controls, but the sound-options caret is only 28 px wide, sound-menu rows have no 44 px minimum, and the Follow button is excluded from the enlargement rules. These are harder targets than neighboring touch controls. This is a consistency issue, not a claim that every target violates WCAG.
- Fix: Apply the existing coarse-pointer target convention to the caret, sound-menu items, Follow, and newly exposed touch actions.

## Ideas

### S07-I1 Compose portrait framing with the mainland

*all-devices · decorative · effort M · impact 5 · confidence 4*

- What: Extend framing evaluation beyond hero-point containment to include mainland silhouette and horizon placement. Tune the existing bounded portrait fit and simplify or soften the mainland asset where necessary. Add projection assertions and review existing portrait/day/night frames.
- Visitor benefit: Portrait tablets retain a composed harbour view without the broad brown wall competing with the lighthouse.
- Data/DOM: Calendar and composition only; analytical encodings and stale-data fog remain unchanged.
- Where: src/harbour/layout/framing.ts:59; scripts/harbour/blender/island/hb_dress.py:1590; src/harbour/sky/sky-system.ts:362
- Perf: Target zero additional draws or triangles; asset simplification may reduce geometry. Frame-time effect unmeasured.
- Risks: Preserve the bounded three-quarter camera, landmark visibility, and desktop composition. Do not solve the band with stronger data fog.
- Depends on: —

### S07-I2 Keep search above the software keyboard

*all-devices · ux · effort M · impact 5 · confidence 5*

- What: Observe visualViewport resize/scroll while search is open, publish visible bounds to CSS, cap and scroll matches, and add Close. Preserve synchronous focus opportunities for touch activation; use a visible input tap when lazy mounting prevents keyboard activation.
- Visitor benefit: Search remains usable with docked keyboards in portrait and landscape and has an obvious escape route.
- Data/DOM: Existing search records and combobox semantics; no new data source or analytical cue.
- Where: src/harbour/ui/Search.tsx:24; src/harbour/ui/harbour-ui.css:269; src/harbour/ui/DetailFallback.tsx:40
- Perf: Zero WebGL cost; event-driven DOM updates only while open; estimated under 2 KB added JS.
- Risks: Do not feed visualViewport keyboard shrinkage directly into admission. Safari keyboard activation and viewport offsets require device verification.
- Depends on: —

### S07-I3 Make gesture commitment and cancellation consistent

*all-devices · ux · effort M · impact 5 · confidence 5*

- What: Use one movement threshold for tap versus pan, distinguish release from cancellation, and reset unexpected capture loss. Cover one-to-two-to-one fingers, third-finger interruption, cancellation, and long-press jitter with deterministic input tests.
- Visitor benefit: Taps remain still, pinches hand off predictably, and interrupted gestures stop cleanly.
- Data/DOM: n/a; changes gesture recognition only.
- Where: src/harbour/engine/input.ts:53; src/harbour/engine/input.ts:84; src/harbour/ui/store.ts:269
- Perf: Zero draws; a few scalar comparisons per pointer event; no new dependency.
- Risks: Avoid introducing pan latency or a jump when crossing the threshold. Preserve anchored midpoint pinch and multitouch selection suppression.
- Depends on: —

### S07-I4 Support switching between touch, pen, and trackpad

*all-devices · ux · effort S · impact 4 · confidence 5*

- What: Track the active pointer modality for hover ownership, clear stale cursor state on touch, and resume hover after fresh mouse or pen movement. Use any-pointer capability where appropriate to retain generous touch targets when a trackpad is attached.
- Visitor benefit: Connecting accessories does not corrupt long-press tags or make touch controls unexpectedly difficult.
- Data/DOM: Existing tags and controls; no new analytical content.
- Where: src/harbour/ui/store.ts:203; src/harbour/ui/hooks.ts:67; src/harbour/ui/harbour-ui.css:419; src/harbour/audio/sound-toggle.css:20
- Perf: Zero GPU cost; modality changes update state only when input type changes.
- Risks: Do not infer device identity from user-agent strings or permanently disable hover after the first touch.
- Depends on: —

### S07-I5 Frame selections against measured overlay space

*all-devices · ux · effort M · impact 5 · confidence 5*

- What: Measure panel bounds with ResizeObserver and compute the unobscured viewport used by selection and follow framing. Recompute after breakpoint or orientation changes while respecting subsequent manual camera movement.
- Visitor benefit: The selected boat or landmark stays visible through rotation, split view, and panel layout changes.
- Data/DOM: Existing selection IDs and panels; no new data mapping.
- Where: src/harbour/ui/store.ts:348; src/harbour/ui/store.ts:644; src/harbour/ui/Panel.tsx:41; src/harbour/layout/layout-system.ts:92
- Perf: Zero additional draws; geometry reads on overlay resize, not per frame.
- Risks: Avoid feedback loops between framing and layout, and avoid overriding an intentional pan. Reduced motion should apply the adjusted pose immediately.
- Depends on: —

### S07-I6 Give the bottom sheet deliberate reading heights

*all-devices · ux · effort M · impact 4 · confidence 4*

- What: Add compact, half-height, and expanded reading states with explicit accessible controls. Restrict optional dragging to the header; leave body gestures for scrolling. Report the actual sheet footprint to selection framing.
- Visitor benefit: Visitors can inspect long facts comfortably or reveal more harbour without closing their selection.
- Data/DOM: Existing panel content and semantics; snap controls expose their expanded state.
- Where: src/harbour/ui/Panel.tsx:41; src/harbour/ui/harbour-ui.css:439; src/harbour/ui/store.ts:53
- Perf: Zero WebGL additions; estimated 2–4 KB JS/CSS. Animate transforms only during transitions.
- Risks: Header drag must not steal body scrolling or canvas pinch. Keep button alternatives and instant reduced-motion transitions.
- Depends on: S07-I5

### S07-I7 Respect reduced motion during touch release

*all-devices · ux · effort S · impact 4 · confidence 5*

- What: Pass the existing motion preference into camera input, suppress fling creation when reduced, and stop active inertia when the preference changes. Keep direct manipulation responsive.
- Visitor benefit: The view stops with the visitor's fingers instead of continuing an unwanted camera animation.
- Data/DOM: n/a; reuse the existing prefers-reduced-motion service.
- Where: src/harbour/engine/input.ts:97; src/harbour/engine/engine.ts:270; src/harbour/ui/services.ts:67
- Perf: Zero additional draws; negligible preference check and potentially less camera-driven work.
- Risks: Do not disable direct pan or pinch. Test live preference changes during an active fling.
- Depends on: —

### S07-I8 Expose existing experiences through touch actions

*all-devices · ux · effort S · impact 4 · confidence 5*

- What: Add on-demand Watch and Postcard buttons to the ledger or a compact actions menu. Provide a visible Stop button during Watch and apply the existing 44 px convention to these and the undersized sound/Follow controls.
- Visitor benefit: Tablet visitors can use shipped features without discovering keyboard shortcuts or attaching a keyboard.
- Data/DOM: Invoke existing store actions; retain current watch explanations, postcard freshness text, and reduced-motion behavior.
- Where: src/harbour/ui/KeyList.tsx:14; src/harbour/ui/App.tsx:120; src/harbour/ui/store.ts:444; src/harbour/audio/sound-toggle.css:20
- Perf: A few DOM controls; no recurring WebGL cost beyond the existing explicitly requested features.
- Risks: Keep actions on demand to preserve minimal chrome. Watch remains opt-in and postcard capture retains its existing resource cleanup.
- Depends on: —

### S07-I9 Normalize wheel input and pen buttons

*all-devices · ux · effort S · impact 3 · confidence 4*

- What: Normalize wheel deltaMode before applying exponential zoom, document the existing trackpad scroll-to-zoom behavior, and restrict pen/mouse camera drags to intended buttons. Test Ctrl-wheel pinch events and pen cancellation without adding camera rotation.
- Visitor benefit: Zoom speed and stylus behavior become more predictable across tablet accessories and browsers.
- Data/DOM: n/a; input behavior only.
- Where: src/harbour/engine/input.ts:41; src/harbour/engine/input.ts:53; src/harbour/ui/store.ts:224
- Perf: Zero GPU cost; constant-time wheel normalization and button checks.
- Risks: Avoid unreliable trackpad detection heuristics. Preserve established mouse-wheel zoom and browser shortcuts outside the canvas.
- Depends on: S07-I3

### S07-I10 Restore reading context after readmission

*all-devices · ux · effort M · impact 3 · confidence 4*

- What: Retain a small in-memory shell record of selected ID, ledger tab, and camera intent before size-gate teardown. After readmission and fresh model readiness, restore valid IDs and fit camera intent to the new aspect.
- Visitor benefit: Folding a device or briefly narrowing a Stage Manager window does not lose the visitor's place.
- Data/DOM: Store identifiers and UI intent only; never retain a live runtime below the gate or present saved readings as current.
- Where: src/main.tsx:39; src/harbour/app/harbour-app.tsx:132; src/harbour/ui/store.ts:111
- Perf: A small shell record; world teardown and reload costs remain unchanged.
- Risks: Restore only after model readiness, discard missing IDs, and keep denied viewports free of world fetching or runtime mounting.
- Depends on: S07-I5

### S07-I11 Offer a measured tablet energy budget

*all-devices · infra · effort M · impact 4 · confidence 3*

- What: Measure sustained pan, storm, and night sessions on actual tablets, then expose a modest energy-saving ceiling through the existing quality service. Evaluate Medium/DPR 1.25 or 1.5 caps without weakening the normal automatic governor.
- Visitor benefit: Long ambient viewing can favor stable performance and battery use over maximum sharpness.
- Data/DOM: No market mapping changes. Any setting describes rendering quality and applies only by explicit visitor choice.
- Where: src/harbour/engine/quality.ts:36; src/harbour/engine/governor.ts:74; src/harbour/engine/governor.ts:250
- Perf: DPR 1.5 uses approximately 44% fewer pixels than DPR 2. Actual GPU, thermal, and battery savings require hardware measurement.
- Risks: Current Medium/DPR 1.5 startup is already sensible. Do not lower defaults based on desktop emulation or assume all Apple GPUs share one budget.
- Depends on: —

### S07-I12 Finish viewport edges and gesture boundaries

*all-devices · ux · effort S · impact 3 · confidence 4*

- What: Apply safe-area spacing consistently to fixed overlays, use dynamic-height bounds for sidebar and postcard surfaces, and contain overscroll on live-world and scrolling UI surfaces. Preserve scrolling on the denied welcome page and leave operating-system navigation edges usable.
- Visitor benefit: Controls avoid device edges and panels behave consistently with browser chrome, rotation, and embedded presentation.
- Data/DOM: n/a; CSS geometry and gesture containment only.
- Where: src/harbour/ui/harbour-ui.css:66; src/harbour/ui/harbour-ui.css:141; src/harbour/ui/Postcard.tsx:7; src/harbour/app/harbour-app.css:2
- Perf: Zero draws; CSS-only changes unless visual viewport bounds from S07-I2 are reused.
- Risks: Canvas touch-action already blocks page pan/pinch locally. Do not add blanket gesturestart prevention or globally disable accessible page zoom; OS swipe-back behavior requires device checks.
- Depends on: —

### S07-I13 Add focused touch and posture regression coverage

*all-devices · infra · effort M · impact 4 · confidence 5*

- What: Add deterministic tests for cancellation, gesture thresholds, hybrid hover, reduced-motion inertia, and selected-panel resize. Extend admission cases around 720×600. Maintain a real-device checklist for Safari keyboard, split view, accessory input, audio unlock, and sustained quality.
- Visitor benefit: Tablet-specific regressions are caught before desktop-only validation declares success.
- Data/DOM: Tests use existing synthetic models; denied-state assertions verify zero world/API startup.
- Where: src/harbour/app/admission.test.ts:38; src/harbour/layout/framing.test.ts:21; tests/visual/harbour-dom.spec.ts:40; src/harbour/engine/input.ts:17
- Perf: No production runtime cost; additional test execution and operator device time.
- Risks: Emulated dimensions establish correctness only. Visual quality and frame-time conclusions still require the approved real-GPU path or actual target hardware.
- Depends on: —

### S07-I14 Make dense fleet picking finger-friendly

*all-devices · ux · effort M · impact 4 · confidence 4*

- What: Give touch picking a larger contact allowance than the existing 7 px minimum and return nearby candidates when ambiguous. Offer a short on-demand candidate list with names rather than silently choosing a different boat; retain precise pen/mouse picking.
- Visitor benefit: Visitors can select small, crowded boats accurately without repeated zoom-and-tap attempts.
- Data/DOM: Reuse existing boat IDs, names, and selection panels. Candidate order reflects geometric proximity, not a new market ranking.
- Where: src/harbour/ui/picking.ts:130; src/harbour/ui/picking.ts:143; src/harbour/ui/store.ts:290
- Perf: Reuse the existing projection pass; retain only a few nearest candidates. No additional WebGL draws or GPU readback.
- Risks: A larger radius alone increases wrong selections. Keep ambiguity explicit, preserve landmark access, and make the candidate list dismissible.
- Depends on: S07-I3

## Top picks

1. S07-I2 — Search is essential on touch; visible dismissal and keyboard-safe bounds solve a concentrated usability risk.
2. S07-I3 — Fixes reproduced cancellation movement and inconsistent tap recognition in the shared input path.
3. S07-I1 — Addresses the supplied portrait defect with a code-supported composition cause and no required rendering expansion.
4. S07-I5 — Makes rotation and window resizing preserve the inspected subject and enables improved sheet behavior.
5. S07-I7 — A small change closes a clear reduced-motion gap in an otherwise careful implementation.

## Operator decisions

- Should the tablet sheet gain compact and expanded reading states, or retain its fixed half-height design?
- Should tablet visitors receive an explicit energy-saving quality ceiling after real-device measurements?

## Cross-lane hooks

- Sky/island/framing owners should jointly resolve the portrait mainland band; preserve the distinction between decorative distance treatment and stale-data fog.
- Accessibility/UI owners should coordinate search dismissal, touch feature entry points, target sizing, and accessible sheet controls.
- Performance owners should supply sustained Safari/iPad measurements before changing tablet defaults; the existing governor already has mobile startup and timerless adaptation.
- Validation handoff: no browsers, full test suite, or physical tablet checks were run; verification used source inspection, supplied imagery, and in-memory checks.
- Residual risk: Safari keyboard behavior, OS edge gestures, accessory switching, and thermal performance remain unverified on target devices.
