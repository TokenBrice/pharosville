# S06

## Executive summary

The camera has strong foundations: exponential damping, interruptible minimum-jerk glides, cursor zoom, touch gestures, keyboard navigation, and panel-aware focus. The largest defects are inaccurate zoom anchoring, incomplete motion cancellation, non-accumulating keyboard zoom, and picking through terrain. In-memory reproductions confirmed these behaviors without browsers. Wheel units, responsive selection framing, watch freshness, and camera URL validation also need attention. Prioritize correcting these mechanics before adding motion polish. Existing hover-light fades already address the historical review complaint.

## Current state

- The rig uses fixed-angle pan and distance zoom, exponential damping at 6/s, and 0.9–2.4 s minimum-jerk glides with logarithmic zoom. /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.ts:12,96,176.
- Wheel input always prevents default and applies exp(deltaY × 0.0012); ctrlKey, deltaMode, and deltaX do not affect interpretation. /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:41.
- Touch supports midpoint pan, pinch zoom, and release inertia; selection supports tap, 480 ms long press, and double-tap Home on unassigned water. /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:63; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:269.
- Arrows pan; +/− zoom; brackets step visible ships; F follows; W starts the watch. Single-click already selects and focuses; boat double-click has no distinct focus action. /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:74; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:234,244,322.
- Picking first tests fleet spheres by depth, then analytic hull-to-mast capsules with a minimum 7 CSS-pixel radius. This already helps distant boats. /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:1425; /home/ahirice/Documents/git/pharosville/src/harbour/ui/picking.ts:143,471.
- Moving pointers repick every frame; stationary pointers repick after 120 ms. Tags track world projections each frame, with overlay reads preceding writes. /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:154,169; /home/ahirice/Documents/git/pharosville/src/harbour/ui/HoverTag.tsx:33.
- Chart labels have deterministic priority and collision culling, but no temporal hysteresis. Tags constrain horizontal placement but do not reserve panel space. /home/ahirice/Documents/git/pharosville/src/harbour/ui/ChartLabels.tsx:19,59; /home/ahirice/Documents/git/pharosville/src/harbour/ui/cull.ts:7; /home/ahirice/Documents/git/pharosville/src/harbour/ui/HoverTag.tsx:40.
- Selection framing accounts for a 392 px side-panel footprint or a half-height bottom sheet. Home adapts to aspect changes; inspected selections do not receive equivalent resize handling. /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:349; /home/ahirice/Documents/git/pharosville/src/harbour/layout/layout-system.ts:92.
- Historical hover-fade criticism is partly resolved: boat lanterns fade over 180/240 ms, and landmark presence eases exponentially. Building-to-building changes still relocate the glow immediately. /home/ahirice/Documents/git/pharosville/src/harbour/fleet/hover-lantern.ts:9; /home/ahirice/Documents/git/pharosville/src/harbour/world/landmark-hover.ts:25.
- Read-only review included in-memory Node/Three.js reproductions; repository status remained unchanged. Existing camera tests cover glide shape and damping, while the follow test exercises only 60 Hz. /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.test.ts:7,96; /home/ahirice/Documents/git/pharosville/src/harbour/ui/camera-moves.test.ts:5.

## Findings

### S06-F1 [medium] Cursor-centered zoom drifts in perspective

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.ts:144,150,162,167.
- Detail: zoomAt uses a linear screen-to-ground approximation at the target distance rather than intersecting the pointer ray with the ground. An in-memory Three.js reproduction at 300 m, pitch 26°, 1600×1000 produced approximately 97 px of anchor drift when zooming 2× at a point 300 px below center. It also mixes goal-distance ratios with rendered-distance scaling during damped input.
- Fix: Compute ground-ray intersections before and after the proposed zoom using a consistent pose, then translate the target by their difference. Test vertical offsets, repeated events before a frame, and zoom limits.

### S06-F2 [medium] Wheel distance ignores event units

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:41.
- Detail: Raw deltaY feeds the zoom exponent without deltaMode normalization. Three line units and three pixel units therefore produce identical motion, although they represent different distances. An in-memory event replay confirmed identical settled distances. Horizontal precision-touchpad movement is discarded entirely.
- Fix: Normalize pixel, line, and page units before applying sensitivity. Define ctrlKey pinch and ordinary scroll behavior explicitly; cover each event mode with input tests.

### S06-F3 [medium] Rapid keyboard zoom loses requested steps

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:547,556; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:76.
- Detail: keyZoom reads the rendered distance, then restarts a 700 ms minimum-jerk glide. Repeated presses before the camera advances replace the same target rather than accumulating. Two immediate '+' calls from 300 m settled at 240 m instead of 192 m. Key repeat repeatedly restarts the near-zero-velocity portion of the easing curve.
- Fix: Accumulate keyboard zoom against the pending distance goal, using a short chase or smoothly retargeted transition. Verify rapid presses and held-key behavior.

### S06-F4 [medium] Cancelled touches can fling and wheel input cannot stop inertia

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:39,41,84,97.
- Detail: pointercancel invokes the normal release handler, which can start a fling from recent velocity. Wheel input does not clear the input object's gliding flag, so zoom can continue alongside old touch inertia. Both behaviors reproduced through the actual handlers in memory. There is also no lostpointercapture cleanup.
- Fix: Separate cancellation from successful release. Cancellation, lost capture, blur, and a new wheel gesture should clear pointer bookkeeping and inertia without creating momentum.

### S06-F5 [medium] Hidden boats remain pickable through terrain

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:1001,1425; /home/ahirice/Documents/git/pharosville/src/harbour/ui/picking.ts:135,339,471.
- Detail: Fleet visibility means frustum intersection, not terrain visibility. Its sphere picker returns boats before considering scenery. The analytic fallback also accepts boat capsules without calling its existing occlusion check. A synthetic height-field fixture returned hidden(id)=true while pick(center) still selected that boat.
- Fix: Apply terrain visibility to candidate acceptance in both paths. Test candidate depth against the visible scene surface, and continue searching when a nearer candidate is hidden.

### S06-F6 [medium] Watch stop and Home do not consistently stop camera ownership

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:385,457,482; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:57; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:66.
- Detail: stopWatch clears watch state but leaves its active camera glide running; an in-memory reproduction confirmed this. The Home button calls goHome directly, which does not stop the watch. Consequently Home can complete and then be superseded by watch tracking. Keyboard H stops the watch through a separate handler, creating inconsistent button/key behavior.
- Fix: Make explicit stop and Home actions cancel watch-owned motion at the current pose. Put ownership cleanup in store actions so buttons and shortcuts behave identically.

### S06-F7 [medium] Enabling reduced motion leaves existing camera motion active

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:115,370,490; /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:126.
- Detail: The motion subscription stops follow but does not cancel an existing glide or touch fling. moveTo only applies reduced-motion behavior when a new move starts. An active watch also continues scheduling timed camera cuts, although its continuous tracking stops.
- Fix: On transition to reduced motion, stop inertia and current automated camera movement. End an active watch with an announcement or require explicit continuation through static stops.

### S06-F8 [medium] Selection framing becomes stale across panel layout changes

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:349; /home/ahirice/Documents/git/pharosville/src/harbour/layout/layout-system.ts:92; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:439.
- Detail: Selection focus chooses its clearance once from viewport width. Resizing across 900 px changes the panel from side panel to bottom sheet, but LayoutSystem only reframes a camera still at Home. A selected boat retains its previous lateral offset and lacks the new upward clearance unless follow is active or the visitor selects again.
- Fix: Recompute selection clearance on viewport/panel layout changes while the visitor has not manually moved away from that selection.

### S06-F9 [medium] Camera URL accepts poses that break camera math

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/layout/layout-system.ts:48,53; /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.ts:81,172,210.
- Detail: The cam parameter is described as development framing but is parsed without a development guard. Validation checks finiteness only, accepting zero/negative distance, zero pitch, and out-of-bounds targets. cam=0,0,0,0,0 reaches the rig; an in-memory reproduction then produced NaN pan deltas.
- Fix: Restrict development overrides to development builds and validate positive distance, permitted angles, and bounds. Production share state should restore only validated bounded pan/zoom.

### S06-F10 [low] Secondary mouse buttons also start camera drags

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:53,63; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:224.
- Detail: CameraInput captures every pointerdown without checking mouse button. The UI store only tracks primary-button drags, so right-button movement pans without matching drag-state handling. An in-memory right-button replay incremented the rig's pan epoch.
- Fix: Accept only the documented mouse button, while retaining touch and intended pen input. Share the gesture eligibility rule with selection handling.

### S06-F11 [medium] Watch captions can outlive the readings they describe

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:431,447,464,482; /home/ahirice/Documents/git/pharosville/src/harbour/ui/watch.ts:38.
- Detail: The watch snapshots ranked subjects and their explanatory strings at startup, then loops those stops indefinitely. It neither reranks on model changes nor checks endpoint freshness. A recovered coin can retain the caption 'worst depeg now'; a visit can start or continue from stale retained readings.
- Fix: Revalidate freshness and recompute reasons at stop boundaries and relevant model updates. Stop or show an explicit unavailable state when current ranking cannot be supported.

### S06-F12 [low] Fling travel varies with frame rate

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:126; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:66; /home/ahirice/Documents/git/pharosville/src/harbour/ui/camera-moves.test.ts:7.
- Detail: Fling velocity decays exponentially, but displacement uses velocity × delta before decay. Replaying the formula from 1000 px/s for one second gives 310.7 px at 15 Hz, 285.2 px at 60 Hz, and 280.5 px at 144 Hz. Follow also uses numerical spring integration; its existing test covers only 60 Hz.
- Fix: Integrate fling displacement as v × (1−exp(−decay×dt))/decay. Compare follow trajectories across supported frame rates and use an analytic spring step if differences exceed the acceptance tolerance.

## Ideas

### S06-I1 Keep the ground exactly under the zoom pointer

*all-devices · ux · effort M · impact 5 · confidence 5*

- What: Replace approximate zoom anchoring with before/after ground-ray intersections. Apply target compensation using one consistent pose. Require under 1 CSS-pixel settled drift away from clamped boundaries.
- Visitor benefit: Pinching and wheel zoom feel attached to the subject instead of sliding across the harbour.
- Data/DOM: n/a; camera mechanics do not change analytical meaning.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.ts:144; /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.test.ts:41.
- Perf: Estimate: two ray-plane intersections per zoom update; zero draws, triangles, or dependencies.
- Risks: Ground anchoring needs a defined plane after focusing the elevated Pharos; bounds may legitimately prevent perfect anchoring.
- Depends on: —

### S06-I2 Normalize wheel input and define trackpad behavior

*all-devices · ux · effort M · impact 5 · confidence 4*

- What: Normalize deltaMode, distinguish ctrlKey pinch, and consume both scroll axes where panning is supported. Start calibration at 0.0012 per normalized zoom pixel and cap a single event to a 0.8–1.25 distance ratio. Prefer an explicit trackpad preference over brittle device heuristics.
- Visitor benefit: Mouse wheels, macOS trackpads, and Windows precision touchpads receive predictable controls.
- Data/DOM: n/a; update the existing keyboard/control explanation to match the chosen gesture policy.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:41; /home/ahirice/Documents/git/pharosville/src/harbour/ui/KeyList.tsx:11.
- Perf: Estimate: constant arithmetic per event; under 2 KB source growth; zero GPU cost.
- Risks: Scroll-to-pan changes an established zoom gesture. Sensitivity and inertia tails require real macOS and Windows validation.
- Depends on: —

### S06-I3 Make every stop action stop the camera

*professional · ux · effort M · impact 5 · confidence 5*

- What: Add a small explicit motion-cancellation path across input and store. Cancel inertia on wheel, pointer cancellation, lost capture, and blur. Home ends watch/follow before moving. Escape ends automated motion at its current pose. Reduced-motion changes cancel ongoing automation.
- Visitor benefit: The camera yields immediately and consistently when the visitor takes control.
- Data/DOM: n/a; retain concise live announcements such as 'Watch ended' and 'Stopped following'.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:36; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:115,385,457; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:61.
- Perf: Estimate: a few state resets per cancellation; zero recurring rendering cost.
- Risks: Keep Escape's layer-closing order explicit; cancelling a watch must not unexpectedly clear an unrelated selection.
- Depends on: —

### S06-I4 Accumulate keyboard zoom without restarting its easing

*professional · ux · effort S · impact 4 · confidence 5*

- What: Apply every 1.25× step to the pending zoom goal. Use a 120–180 ms response for repeated input instead of restarting a 700 ms minimum-jerk flight. Normalize diagonal arrow vectors to retain the documented 520 px/s speed.
- Visitor benefit: Quick presses and held keys respond evenly, including on high-refresh displays.
- Data/DOM: n/a; existing shortcut text remains accurate.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:534,547; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:75.
- Perf: Estimate: constant arithmetic; zero additional GPU or network work.
- Risks: Preserve follow/watch cancellation and reduced-motion cuts; avoid keyboard-repeat-dependent zoom speed.
- Depends on: —

### S06-I5 Pick visible subjects with consistent overlap priority

*all-devices · ux · effort M · impact 5 · confidence 5*

- What: Keep the existing forgiving capsules, reject terrain-occluded candidates in both picking paths, and compare candidates by pointer proximity with depth as a tie-breaker. Give direct visible hits priority over expanded hit regions. Use at least 12 px radius for coarse-pointer taps versus the existing 7 px mouse minimum.
- Visitor benefit: Small boats are easier to select without clicking ships behind the island or losing foreground targets.
- Data/DOM: n/a; selection continues opening the existing exact-value panel and ledger parity path.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/picking.ts:124,339,471; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:1418.
- Perf: Estimate: bounded height-field checks for shortlisted candidates; zero draws. Measure CPU cost before checking every boat.
- Risks: Enlarged touch targets increase overlap; preserve deterministic tie-breaking and test partially visible masts.
- Depends on: —

### S06-I6 Stabilize hover without delaying first feedback

*professional · ux · effort M · impact 4 · confidence 4*

- What: Show the first hover immediately; retain its candidate within an extra 3 px release margin, requiring roughly 60 ms of a clearly better candidate before switching. Repick stationary hovered boats every 50 ms. Keep clicks immediate. Add 2 px hysteresis to tag above/below placement and label collision transitions.
- Visitor benefit: Names stop chattering between neighboring moving boats while tags remain responsive.
- Data/DOM: n/a; reuse current tag facts and existing light fades rather than adding new signals.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:154,196; /home/ahirice/Documents/git/pharosville/src/harbour/ui/HoverTag.tsx:40; /home/ahirice/Documents/git/pharosville/src/harbour/ui/cull.ts:7.
- Perf: Estimate: stationary hover picking rises from about 8 to 20 checks/s; moving-pointer frequency stays unchanged.
- Risks: Excessive stickiness can misidentify a passing boat. Clear immediately on drag, canvas exit, or loss of visibility.
- Depends on: S06-I5

### S06-I7 Match momentum across slow and high-refresh screens

*all-devices · ux · effort S · impact 3 · confidence 5*

- What: Integrate exponential fling displacement analytically using the existing 3.5/s decay. Compare complete camera trajectories at 15, 30, 60, 120, and 144 Hz; use an analytic critically damped follow step if necessary. Target under 1 px endpoint variation for equal elapsed input.
- Visitor benefit: A flick travels the same distance on a weak tablet and a 144 Hz laptop.
- Data/DOM: n/a; preserve current velocity limits and follow semantics.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:126; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:66; /home/ahirice/Documents/git/pharosville/src/harbour/ui/camera-moves.test.ts:5.
- Perf: Estimate: reuse the existing exponential evaluation; negligible CPU change and zero GPU cost.
- Risks: The rig's additional damping also affects final travel; test the complete input-to-camera chain, not only velocity.
- Depends on: —

### S06-I8 Frame selections against the actual available viewport

*all-devices · ux · effort M · impact 4 · confidence 5*

- What: Measure the visible panel or sheet and derive a usable screen rectangle with 24 px padding. Reframe an untouched selection after resize or panel-layout changes. Project subject bounds, including the Pharos top, rather than relying only on a ground point and fixed clearance.
- Visitor benefit: Selected subjects remain visible when tablets rotate or laptop windows resize.
- Data/DOM: n/a; use existing DOM measurement batching and selection identity.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:332,349; /home/ahirice/Documents/git/pharosville/src/harbour/ui/measurements.ts; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:51.
- Perf: Estimate: a few projections on selection or resize; reuse cached measurements; zero new draw calls.
- Risks: Never pull the camera back after manual panning. Preserve the sorted viewport gate and reduced-motion behavior.
- Depends on: —

### S06-I9 Soften arrival at bounds while keeping the diorama bounded

*professional · ux · effort M · impact 3 · confidence 4*

- What: Retain hard camera limits, but attenuate outward inertial velocity over the final roughly 40 screen pixels and clear the blocked velocity component at contact. Leave direct inward movement unattenuated. Avoid elastic overshoot outside the world.
- Visitor benefit: The camera settles against harbour limits without a prolonged invisible fling or sticky reversal.
- Data/DOM: n/a; modifies navigation feedback only.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.ts:127,134; /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:125.
- Perf: Estimate: constant bound-distance arithmetic during momentum; zero GPU cost.
- Risks: Do not attenuate deliberate direct dragging twice through both input and rig damping. Validate corners and zoom-dependent scaling.
- Depends on: S06-I7

### S06-I10 Expose camera affordances through existing controls

*all-devices · ux · effort S · impact 3 · confidence 5*

- What: Use grab over empty navigable water, grabbing during an accepted drag, and pointer over openable subjects. Add accessible +/− controls to the existing expandable corner strip, with 44 px coarse-pointer targets. Reject secondary-button drags.
- Visitor benefit: Visitors can discover navigation without a wheel, pinch gesture, or keyboard shortcut.
- Data/DOM: n/a; label controls 'Zoom in' and 'Zoom out'; preserve the existing sparse corner UI.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:196,203; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:62; /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:53.
- Perf: Estimate: two DOM buttons and state-dependent cursor writes; zero scene cost.
- Risks: Avoid covering the harbour with persistent controls. Cursor state must reset after cancellation and disposal.
- Depends on: S06-I4

### S06-I11 Share and restore a bounded inspection state

*professional · ux · effort M · impact 4 · confidence 5*

- What: Add a copy-link action encoding selected kind/id and bounded target/distance with fixed camera angles. Resolve selection after model readiness. Push history for deliberate selections, replace camera state after roughly 300 ms idle, and restore on popstate without replaying writes. Current code only reads initial view/cam parameters.
- Visitor benefit: A shared link and browser Back return to the intended coin and viewpoint.
- Data/DOM: Selection IDs and camera coordinates only; no readings, timestamps presented as snapshots, or API credentials.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/layout/layout-system.ts:48; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:322; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:62.
- Perf: Estimate: a small URL codec and debounced history updates; no new API requests or GPU work.
- Risks: Handle removed coins, malformed links, viewport readmission, and live boat movement. Avoid adding a history entry per frame.
- Depends on: S06-I12

### S06-I12 Validate every external camera pose

*professional · infra · effort S · impact 4 · confidence 5*

- What: Reject nonpositive distances and unsupported angles before applying URL poses. Clamp shared pan/zoom to permitted ranges; keep arbitrary pitch overrides development-only. Add boundary cases for zero, negative, enormous, missing, and nonfinite values.
- Visitor benefit: Opening a malformed or old camera link cannot corrupt navigation.
- Data/DOM: n/a; invalid state falls back to the normal aspect-fitted Home view.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/layout/layout-system.ts:53; /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.ts:81.
- Perf: Estimate: validation only on pose entry; zero recurring frame cost.
- Risks: Preserve legitimate development captures and aspect-fitted presets; distinguish trusted authored presets from external URL input.
- Depends on: —

### S06-I13 Keep the watch's explanations current and verifiable

*professional · data-bound · effort M · impact 4 · confidence 5*

- What: Rebuild watch stops at boundaries and revalidate the active reason on model updates. Require current stablecoin readings. Preserve the existing $1M mover floor, worst active depeg ranking, and zero-week-history newcomer rule; stop unsupported reasons instead of looping old captions.
- Visitor benefit: The guided camera visit explains what the live readings currently support.
- Data/DOM: Sources: supply, circulatingPrevDay/Week, activeDepeg, pegDeviationBps, and truth.stablecoins.state. Reuse rankWatch captions in the watch and live announcement. When stale: 'Watch paused: readings are stale.' Add freshness and recovered-depeg tests.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/watch.ts:19; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:431,464; /home/ahirice/Documents/git/pharosville/src/harbour/ui/watch.test.ts:6.
- Perf: Estimate: O(number of boats) on relevant model updates or stop boundaries, not per frame; no GPU cost.
- Risks: Avoid frequent reranking that interrupts contemplation. Refresh captions immediately but defer subject changes until a safe stop boundary.
- Depends on: S06-I3

### S06-I14 Add a small interaction regression matrix

*professional · infra · effort M · impact 4 · confidence 5*

- What: Exercise actual input handlers with mocked elements and a real Three.js camera: wheel units, ctrl-pinch policy, pointercancel, lost capture, rapid key zoom, bounds, occlusion, and motion-setting changes. Compare deterministic trajectories at 30/60/120/144 Hz and include portrait-to-landscape selection framing.
- Visitor benefit: Interaction fixes remain reliable as camera choreography and device support evolve.
- Data/DOM: n/a; synthetic poses and DOM events only, without world feeds or browser rendering.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/camera-rig.test.ts:41; /home/ahirice/Documents/git/pharosville/src/harbour/ui/camera-moves.test.ts:5; /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:17.
- Perf: Estimate: test-only additions; no production bundle or frame cost.
- Risks: Synthetic events establish correctness, not physical gesture feel. Retain later real-device acceptance checks.
- Depends on: —

### S06-I15 Avoid unnecessary flights when inspecting nearby subjects

*professional · ux · effort M · impact 3 · confidence 4*

- What: Keep single-click selection, but skip automatic travel when the subject already fits the usable viewport and has adequate projected size. Make double-click on a subject explicitly request close focus. Do not restart a glide for an unchanged selection; retain current double-click Home behavior on unassigned water.
- Visitor benefit: Reading several nearby boats feels direct while deliberate focus remains available.
- Data/DOM: n/a; selection still opens the same detail panel. Explain the focus gesture in existing control help.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:234,244,322,332; /home/ahirice/Documents/git/pharosville/src/harbour/ui/KeyList.tsx:5.
- Perf: Estimate: a few projections per selection; fewer camera transitions; zero new scene draws.
- Risks: Changes established single-click choreography. Determine the projected-size threshold through operator review; start around 40 px subject height.
- Depends on: S06-I8

## Top picks

1. S06-I1 — Fixes reproduced anchor drift shared by wheel and pinch, making the primary navigation gesture feel substantially more precise.
2. S06-I3 — One focused cancellation pass resolves several surprising behaviors across Escape, Home, touch cancellation, and reduced motion.
3. S06-I5 — Prevents selection through scenery while improving small-target access using the existing analytic picker.
4. S06-I4 — A small change fixes demonstrably lost keyboard zoom steps and improves held-key response.
5. S06-I2 — Normalizing wheel units is inexpensive; an explicit gesture policy prevents device-specific behavior from emerging accidentally.

## Operator decisions

- Should ordinary two-finger trackpad scrolling pan, with ctrlKey pinch zooming, or should the current scroll-to-zoom behavior remain the default? Approve any explicit trackpad preference before S06-I2 changes established gestures.
- Should single-click always trigger the current cinematic focus, or may S06-I15 keep an already legible subject stationary and reserve deliberate close focus for double-click?
- Under reduced motion, should W be unavailable or become an explicitly advanced sequence of static subjects? Automatic timed cuts should require a deliberate product choice.

## Cross-lane hooks

- Coordinate responsive UI work with S06-I8: expose measured panel/sheet bounds through the existing read-before-write measurement flow.
- Coordinate fleet/terrain work with S06-I5: share candidate visibility and rendered bounds without adding GPU readback or per-boat terrain marches on every frame.
- Coordinate data-truth work with S06-I13: preserve freshness provenance and refresh watch explanations when their supporting readings change.
- Skipped: no browsers, captures, package installation, repository edits, or full test-suite execution; validation used source review and in-memory reproductions.
- Risk: gesture sensitivities, hover thresholds, and subjective damping still need real macOS/Windows touchpads, touch tablets, and 120/144 Hz hardware acceptance.
