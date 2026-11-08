# S05

## Executive summary

The accessibility foundation is substantial, but WCAG 2.2 AA confidence is premature. Highest priorities are configurable character shortcuts, keyboard-readable chart values, preserving readable content through browser zoom, and correct modal focus containment. Reduced motion reaches most systems but misses several shader clocks and running animations; its CSS also breaks spatial positioning. Ledger fleet coverage is complete. Paper text contrast is strong. Findings below distinguish code-proven behavior from compatibility risks requiring later browser or assistive-technology checks.

## Current state

- Native buttons, named controls, panel headings and a polite announcement region already exist: /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:126; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:51.
- Ledger tabs implement roving focus and arrow navigation; tables provide captions, column headers and aria-sort: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:28; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:157.
- Fleet coverage passes source inspection: Coins receives every model.boats row without visual culling. Chains, pre-launch records and wrecks have separate tables: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:192.
- Search includes boats, chains, pre-launch coins, wrecks and analytical landmarks, with combobox/listbox semantics and Enter activation: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:29.
- Calculated sRGB contrast against #f4ecda: ink 13.81:1, secondary ink 8.41:1, muted ink 5.39:1, brass ink 5.39:1, focus blue 5.04:1. Decorative brass is 3.03:1; brass-soft is approximately 1.75:1. Tokens: /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:8. Ratios exclude texture compositing.
- Reduced motion holds simulation time, cuts new camera flights, freezes many decorative systems and disables new staged moments: /home/ahirice/Documents/git/pharosville/src/harbour/sim/system.ts:106; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:370; /home/ahirice/Documents/git/pharosville/src/harbour/model/moments.ts:65.
- Default focus outlines and extensive coarse-pointer 44px rules exist. The sound menu provides arrow navigation, Escape and return focus: /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:42; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:424; /home/ahirice/Documents/git/pharosville/src/harbour/audio/SoundToggle.tsx:41.
- English language, an h1 and useful static fallback links exist; no main landmark or skip link was found. The world itself is hidden from assistive technology: /home/ahirice/Documents/git/pharosville/index.html:2; /home/ahirice/Documents/git/pharosville/src/App.tsx:6; /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:148.
- No deviceorientation/devicemotion interaction was found. Canvas selection normally activates on release and cancels touch taps after movement; search differs. Intro copy dismisses after seven seconds, with equivalent orientation information retained in the ledger: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:226; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:42.
- Existing DOM tests cover arrival, admission and fallback behavior, not complete keyboard journeys or accessibility modes: /home/ahirice/Documents/git/pharosville/tests/visual/harbour-dom.spec.ts:9; /home/ahirice/Documents/git/pharosville/src/harbour/ui/details-loading.test.tsx:26.

## Findings

### S05-F1 [high] Global character shortcuts cannot be disabled or scoped

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:51; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:70
- Detail: Letters and punctuation trigger ledger, camera, watch and postcard actions anywhere outside editable fields. There is no disable/remap preference or focused-component restriction. This fails the character-shortcut requirements of WCAG 2.1.4 and can conflict with speech input and assistive-technology navigation.
- Fix: Add a discoverable character-shortcut switch, or restrict these shortcuts to a named, focused harbour interaction region. Preserve native control activation and Escape.

### S05-F2 [high] Chart point values require a mouse

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/bits.tsx:59; /home/ahirice/Documents/git/pharosville/src/harbour/ui/bits.tsx:98; /home/ahirice/Documents/git/pharosville/src/harbour/ui/bits.tsx:134
- Detail: PSI history points and hourly net/mint/burn values are exposed through mouse movement or mouse-enter handlers. SVG image labels provide only summaries; no keyboard interaction or complete DOM series exists. Keyboard and screen-reader users cannot inspect the same dated values, violating 2.1.1 and leaving incomplete non-text alternatives under 1.1.1.
- Fix: Add an on-demand native data table beneath each chart, containing the identical dated series, units and null/partial states. Optionally add one keyboard-operable chart cursor.

### S05-F3 [high] Browser zoom removes the readings being enlarged

- Evidence: /home/ahirice/Documents/git/pharosville/src/main.tsx:27; /home/ahirice/Documents/git/pharosville/src/main.tsx:39; /home/ahirice/Documents/git/pharosville/src/systems/viewport-gate.ts:18; /home/ahirice/Documents/git/pharosville/index.html:91
- Detail: Admission uses innerWidth/innerHeight. A 1280×960 CSS viewport enlarged to 200% becomes approximately 640×480 and fails admission. The application unmounts and replaces current panels/ledger with generic external links. Text enlargement therefore loses information and functionality, creating a 1.4.4/1.4.10 concern beyond the spatial-world exception.
- Fix: Keep the runtime gate intact while retaining already-loaded readings in a responsive DOM reader outside the engine lifecycle. Do not mount the world or initiate world-data requests below the gate.

### S05-F4 [high] Postcard claims modality without containing focus

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Postcard.tsx:40; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Postcard.tsx:51; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:51
- Detail: The postcard sets aria-modal=true and initially focuses Save, but provides neither a focus loop nor inert background content. Tab can leave the dialog, and global harbour shortcuts remain active. Escape only closes the postcard while focus remains inside its section. This undermines dialog semantics and predictable focus operation.
- Fix: Use a native modal dialog or implement equivalent containment, background inertness and opener restoration. Suspend harbour shortcuts while the modal is open.

### S05-F5 [medium] Nonmodal layers can conceal keyboard focus and lose return destinations

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:30; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:63; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:65; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:319
- Detail: The ledger occupies the corner toolbar's position while those earlier controls remain tabbable underneath it. Search/ledger button openings bypass remember(), and all layers share one returnTo slot. Closing or toggling layers can restore to the generic wordmark rather than the actual opener. The overlap creates a source-level 2.4.11 risk; return behavior also weakens focus order.
- Fix: Keep nonmodal controls visibly reachable, provide explicit region switching, and store opener focus separately for each layer. Route button and shortcut openings/closings through the same actions.

### S05-F6 [medium] Reduced motion leaves several visual clocks running

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/beam/beam-system.ts:332; /home/ahirice/Documents/git/pharosville/src/harbour/beam/beam-system.ts:374; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:1399; /home/ahirice/Documents/git/pharosville/src/harbour/readings/readings-system.ts:117; /home/ahirice/Documents/git/pharosville/src/harbour/lights/lights-system.ts:197; /home/ahirice/Documents/git/pharosville/src/harbour/sky/sky-system.ts:215
- Detail: The held beam still swells and animates shaft noise/heat shimmer. Selection-ring pulses, stale-fog drift, lamp-water shimmer and sky rain curtains consume advancing elapsed/global time. These bypass the existing MotionClock pattern and violate the brief's still-world contract. This is not automatically an AA violation for every effect, but it is a concrete preference failure.
- Fix: Use motion-aware clocks for each decorative effect; keep reduced-mode beam intensity constant and disable heat distortion. Preserve data-driven state changes and expose beam rhythm in text.

### S05-F7 [medium] Reduced-motion CSS erases essential positioning

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:62; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:269; /home/ahirice/Documents/git/pharosville/src/harbour/ui/HoverTag.tsx:58
- Detail: The blanket transform:none !important rule applies to every fading element. It removes search's translateX(-50%) centering and overrides the hover tag's inline world-position transform. At 744px width, reduced-mode search extends to 812px, overflowing by 68px; tags lose their anchor entirely.
- Fix: Remove the blanket transform reset. Disable transition timing globally, then reset only decorative entrance offsets while retaining search centering and projected tag positioning.

### S05-F8 [medium] Search chooses results on pointer down

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:97
- Detail: onMouseDown immediately selects a result, closes search and moves the camera. Moving away before release cannot abort that action. This fails the normal pointer-cancellation expectation in WCAG 2.5.2; down-event activation is unnecessary here.
- Fix: Keep pointer-down prevention only if needed to retain input focus; perform selection through click or a verified pointer-up action. Preserve Enter activation.

### S05-F9 [medium] Loaded search has no touch-accessible close action

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:70; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:90; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:63
- Detail: Search closes through Escape or selecting a result. The loaded component has no close button or outside-dismiss handler, and its toolbar button only sets searchOpen=true. A touchscreen visitor cannot simply cancel an empty or unsuccessful search without a keyboard or unrelated world selection.
- Fix: Add a named close button with an adequate target and focus restoration. Keep Escape; outside dismissal can be optional.

### S05-F10 [medium] Sound-options target misses the 24px minimum

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/audio/sound-toggle.css:14
- Detail: The fine-pointer caret target is 14px wide with a negative 2px margin beside the sound button. Its undersized-target spacing exception is not satisfied because a centered 24px target circle intersects the adjacent control. Coarse-pointer styling enlarges it, but WCAG 2.5.8 also applies to mouse users.
- Fix: Make the caret at least 24px wide and remove overlapping margins; retain the larger coarse-pointer target.

### S05-F11 [medium] Sound-menu navigation also controls the camera

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/audio/SoundToggle.tsx:42; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:53; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:74
- Detail: Menu arrow/Home handlers prevent default but allow propagation. The window handler ignores defaultPrevented and excludes only panel/ledger targets from arrow panning. ArrowUp/Down therefore navigate sound choices and pan the world; Home navigates the menu and flies the camera home.
- Fix: Return immediately from the global handler when defaultPrevented is true. Scope remaining world-navigation keys away from menus and other composite widgets.

### S05-F12 [medium] Event changes have no assistive announcement path

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:535; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:126; /home/ahirice/Documents/git/pharosville/src/harbour/model/event-hub.ts:93
- Detail: DayBook subscribes and prepends entries, but its list has no log/live semantics. The global polite region announces keyboard actions rather than confirmed events or staged moments. A screen-reader visitor receives no equivalent notice when a visible ceremony occurs, and an open Day book changes silently.
- Fix: Announce a concise, deduplicated new-entry count while the Day book is open; optionally announce budgeted staged moments. Never mark the entire rerendering list live or announce each age/tick.

### S05-F13 [medium] Earlier Day book entries cannot be read

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:546; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:557; /home/ahirice/Documents/git/pharosville/src/harbour/model/event-hub.ts:36
- Detail: The event hub retains 200 entries, but the DOM renders only 40 and replaces the rest with an 'earlier' count. There is no expansion or pagination control. Recorded event information becomes unavailable through the application's textual parity path.
- Fix: Add a native Show earlier entries button that reveals the retained book in batches without moving existing focus. State the 200-entry retention limit honestly.

### S05-F14 [medium] Changing motion preference does not stop running animations

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:115; /home/ahirice/Documents/git/pharosville/src/harbour/app/wake.ts:65; /home/ahirice/Documents/git/pharosville/src/harbour/model/moments.ts:60; /home/ahirice/Documents/git/pharosville/src/harbour/life/moments-stage.ts:77
- Detail: The preference subscription clears follow but does not cancel an existing camera glide or wake. stepMoments retains its current moment when reduced becomes true, and MomentsStage continues a flare until its stored deadline. Startup guards therefore do not ensure that an in-session preference change stills the world.
- Fix: Cancel active camera/wake animation on preference changes, clear active staged moments under reduced mode, and defensively suppress existing stage effects. Test transitions from full to reduced during each animation.

### S05-F15 [medium] Touch camera navigation lacks single-pointer alternatives

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/input.ts:63; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:62; /home/ahirice/Documents/git/pharosville/src/harbour/ui/KeyList.tsx:10
- Detail: Arbitrary panning requires dragging, and touch zoom requires a two-finger pinch. Keyboard equivalents exist, but no tappable directional or zoom controls provide the single-pointer alternatives required by 2.5.7 and 2.5.1. Selecting a subject or going Home does not reproduce general camera positioning.
- Fix: Expose a compact, on-demand view-control group with pan directions, zoom in/out and Home, reusing existing camera actions.

### S05-F16 [low] Forced-color selection states rely on removable paint

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:239; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:328; /home/ahirice/Documents/git/pharosville/src/harbour/audio/sound-toggle.css:45
- Detail: Selected tabs, chips and sound choices depend heavily on background fills or box shadows. Neither forced-colors nor prefers-contrast rules exist in the four stylesheets. Forced-color substitution can erase these visual distinctions. This is a compatibility risk, not a browser-verified conformance failure.
- Fix: Use system-color borders/outlines and a persistent check or underline for selected states under forced-colors. Strengthen essential boundaries under prefers-contrast:more.

### S05-F17 [medium] Arrival removal can discard the focused link

- Evidence: /home/ahirice/Documents/git/pharosville/src/components/arrival-shell.tsx:26; /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:79; /home/ahirice/Documents/git/pharosville/public/arrival-shell.css:41
- Detail: The arrival contains focusable links. Reveal fades it to zero opacity, then removes it after 1200ms regardless of focus. A keyboard visitor using those links can experience invisible focus followed by focus falling to the body. No replacement control receives focus.
- Fix: When the arrival contains focus, transfer focus to the corresponding persistent destination or retain the shell until focus leaves. Disable hidden arrival links during an intentional focus handoff.

### S05-F18 [medium] Hover tags cannot be hovered or explicitly dismissed

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/HoverTag.tsx:106; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:28; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:154; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:61
- Detail: Custom hover tags inherit pointer-events:none and disappear as picking moves away from their world target. Escape handles panels/search/ledger/chart, not hover-only content. This does not provide the hoverable and dismissible behavior expected by 1.4.13 when a tag obscures other content.
- Fix: Allow the pointer to enter and remain over the tag, and let Escape suppress the current hover tag until its trigger is exited. Keep equivalent analytical text in panels.

## Ideas

### S05-I1 Make character shortcuts optional

*professional · ux · effort S · impact 5 · confidence 5*

- What: Add a keyboard-shortcut preference and scope camera keys away from handled composite-widget events.
- Visitor benefit: Speech input and assistive navigation stop triggering unintended actions.
- Data/DOM: No market mapping changes; expose the preference as a named checkbox or pressed button.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:51; /home/ahirice/Documents/git/pharosville/src/harbour/ui/KeyList.tsx:19
- Perf: 0 draws; estimated under 1KB JS.
- Risks: Keep Escape and native activation available when shortcuts are disabled.
- Depends on: —

### S05-I2 Give each layer a reliable focus lifecycle

*professional · ux · effort M · impact 5 · confidence 5*

- What: Use real postcard modality, separate opener references, shared open/close actions and visible region switching for nonmodal panels.
- Visitor benefit: Focus stays visible and returns to the control that opened each layer.
- Data/DOM: Preserve nonmodal ledger/panel behavior; only the postcard needs modal containment.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:30; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Postcard.tsx:51; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:63
- Perf: 0 draws; small DOM/event changes.
- Risks: Nested search-to-panel journeys and retained ledger rows require regression coverage.
- Depends on: —

### S05-I3 Expose the existing chart series as tables

*informative · data-bound · effort S · impact 5 · confidence 5*

- What: Add native disclosure sections containing dated PSI and hourly flow tables from the exact arrays already rendered.
- Visitor benefit: Every chart value becomes readable without hovering, sight or precise pointing.
- Data/DOM: Use stability.history date/score and readings.flows.hourly hourTs/netUsd/mintUsd/burnUsd. No new threshold. Label units and partial/null values explicitly; test series parity.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/bits.tsx:59; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:339; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:832
- Perf: 0 draws; at most 30 rows per expanded series.
- Risks: Preserve gaps and timestamps; do not convert partial valuation into zero.
- Depends on: —

### S05-I4 Complete the still-world contract

*professional · infra · effort M · impact 5 · confidence 5*

- What: Replace remaining live decorative clocks with MotionClock and cancel active glides, wake and ceremonies when reduction is enabled.
- Visitor benefit: The motion preference consistently produces a still, inspectable harbour.
- Data/DOM: Keep analytical state updates; retain sweep duration and PSI band as text instead of a reduced-mode brightness pulse.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/beam/beam-system.ts:332; /home/ahirice/Documents/git/pharosville/src/harbour/ui/services.ts:98; /home/ahirice/Documents/git/pharosville/src/harbour/model/moments.ts:58
- Perf: No new draws; a few scalar updates; potentially less visual churn.
- Risks: Audit shared shader uniforms so freezing decoration does not freeze incoming readings or freshness ages.
- Depends on: —

### S05-I5 Preserve positioning while reducing CSS motion

*professional · ux · effort S · impact 4 · confidence 5*

- What: Remove the blanket transform reset and target entrance offsets specifically; include the corner-strip expansion and chart-label transitions.
- Visitor benefit: Reduced mode retains centered search and correctly anchored tags.
- Data/DOM: n/a; layout transforms remain intact while decorative interpolation is removed.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:62; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:88; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:298
- Perf: 0 draws; negligible CSS change.
- Risks: Check both desktop panels and the bottom-sheet breakpoint.
- Depends on: —

### S05-I6 Make search cancellable with every input method

*professional · ux · effort S · impact 4 · confidence 5*

- What: Activate matches on click, add an explicit close control, restore opener focus and announce unsuccessful searches quietly.
- Visitor benefit: Touch and motor-impaired visitors can cancel an action or leave search without selecting anything.
- Data/DOM: Retain existing combobox/listbox semantics and Enter selection; use a short polite no-results status.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:70
- Perf: 0 draws; one button and one small status node.
- Risks: Prevent duplicate selection from combined pointer and click handlers.
- Depends on: S05-I2

### S05-I7 DECISION-NEEDED: retain a reader through zoom

*professional · ux · effort L · impact 5 · confidence 4*

- What: Keep a cached DOM reading view outside engine ownership when resizing or zooming unmounts the world.
- Visitor benefit: Visitors can enlarge and reflow the readings they were inspecting.
- Data/DOM: Reuse the last admitted model and chart arrays, with capture time and aging freshness. Below the gate, mount no world runtime and start no world-data requests.
- Where: /home/ahirice/Documents/git/pharosville/src/main.tsx:39; /home/ahirice/Documents/git/pharosville/src/client.tsx:67; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:180
- Perf: 0 WebGL draws below gate; retained model memory and DOM-only rendering.
- Risks: Needs operator agreement on cached-reader scope; preserve viewport admission rules and honest staleness.
- Depends on: —

### S05-I8 Fix the sound caret target

*professional · ux · effort S · impact 3 · confidence 5*

- What: Set a 24px minimum caret width without overlapping margins; preserve the existing coarse-pointer enlargement.
- Visitor benefit: Sound options are easier to acquire with a mouse or alternative pointer.
- Data/DOM: n/a; existing accessible name and expanded state remain.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/audio/sound-toggle.css:14
- Perf: 0 draws; approximately 12px additional toolbar width.
- Risks: Recheck toolbar fit on the smallest admitted tablet.
- Depends on: —

### S05-I9 Make the Day book complete and quietly observable

*informative · data-bound · effort S · impact 4 · confidence 5*

- What: Add Show earlier entries and one deduplicated new-entry status; optionally announce only budgeted staged moments.
- Visitor benefit: Visitors can read retained history and notice changes without continuous announcements.
- Data/DOM: Reuse EventsService.book/current and dayBookLine; keep existing confirmation thresholds. Announce counts or one staged event, exclude synthetic events by default, and test deduplication.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:535; /home/ahirice/Documents/git/pharosville/src/harbour/model/event-hub.ts:23
- Perf: 0 draws; batches of 40 rows, maximum 200 retained.
- Risks: Do not announce staging-end updates, replay old entries on mount or replace focused rows.
- Depends on: —

### S05-I10 Offer one on-demand world summary

*informative · data-bound · effort S · impact 5 · confidence 5*

- What: Add a Harbour now section at the start of the ledger and a main landmark around the application.
- Visitor benefit: Screen-reader visitors can understand current market conditions without discovering several separately named landmarks.
- Data/DOM: Read existing psi, seaState, weather, shoals and truth fields. Reuse established bands/thresholds and panel wording; include unavailable/stale states. Keep the summary non-live and test text/model parity.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:115; /home/ahirice/Documents/git/pharosville/src/harbour/model/types.ts:212; /home/ahirice/Documents/git/pharosville/src/App.tsx:6
- Perf: 0 draws; a small DOM section rendered on demand.
- Risks: Respect D11: no persistent numeric dashboard and no invented aggregate score.
- Depends on: —

### S05-I11 Support system contrast without changing the palette

*professional · ux · effort S · impact 3 · confidence 4*

- What: Add forced-color system borders/checkmarks, stronger essential boundaries for prefers-contrast and a conventional search focus outline.
- Visitor benefit: Focus and selected states remain identifiable in high-contrast environments.
- Data/DOM: n/a; preserve existing text labels and ARIA states. Main paper text already exceeds 4.5:1.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:277; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:328; /home/ahirice/Documents/git/pharosville/src/harbour/audio/sound-toggle.css:45
- Perf: 0 draws; estimated under 1KB CSS.
- Risks: Validate actual forced-color rendering; avoid disabling the user's system-color substitutions.
- Depends on: —

### S05-I12 Expose tappable camera controls on demand

*professional · ux · effort S · impact 4 · confidence 5*

- What: Add a compact View disclosure containing directional pan, zoom in/out and Home buttons using existing store actions.
- Visitor benefit: Camera navigation works without dragging, pinching or a physical keyboard.
- Data/DOM: n/a; named native buttons, logical order and at least 24px targets.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:62; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:530; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:547
- Perf: 0 additional draws; seven controls while expanded.
- Risks: Keep the default chrome quiet and preserve bounded camera behavior.
- Depends on: —

### S05-I13 Add a discoverable Still world control

*professional · ux · effort M · impact 4 · confidence 5*

- What: Expose an in-app motion switch backed by the existing motion service, initially respecting the operating-system preference.
- Visitor benefit: Visitors can stop ambient motion without finding an operating-system setting or URL parameter.
- Data/DOM: Show an explicit pressed state and distinguish paused presentation from stale data. Keep readings and freshness updating.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/services.ts:65; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:62
- Perf: 0 new draws; one control and a small preference state.
- Risks: Never label still presentation as stale or use decorative fog to indicate it.
- Depends on: S05-I4, S05-I5

### S05-I14 Turn accessibility journeys into regression gates

*professional · infra · effort M · impact 5 · confidence 5*

- What: Extend DOM tests for shortcuts, nested focus restoration, postcard containment, chart tables, search cancellation and dynamic reduced-motion changes.
- Visitor benefit: Accessibility behavior survives future UI and visual changes.
- Data/DOM: Use existing fixture models and assert complete ledger/model ID parity, dated series parity and bounded live announcements.
- Where: /home/ahirice/Documents/git/pharosville/tests/visual/harbour-dom.spec.ts:9; /home/ahirice/Documents/git/pharosville/src/harbour/ui/details-loading.test.tsx:26
- Perf: No production cost; several focused test journeys.
- Risks: DOM assertions do not establish visual contrast, screen-reader speech or GPU animation quality; reserve those for approved later verification.
- Depends on: S05-I1, S05-I2, S05-I3, S05-I4, S05-I5, S05-I6

### S05-I15 Make transient information safe to inspect

*professional · ux · effort M · impact 4 · confidence 4*

- What: Hand off arrival focus before removal; let hover tags retain pointer presence and dismiss with Escape until their trigger is exited.
- Visitor benefit: Loading completion and hover movement no longer remove information or focus unexpectedly.
- Data/DOM: Reuse existing arrival links and tag facts; retain persistent guide equivalents rather than extending mandatory timers.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:79; /home/ahirice/Documents/git/pharosville/src/harbour/ui/HoverTag.tsx:106; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:61
- Perf: 0 new draws; a few pointer/focus state checks.
- Risks: Interactive tag hit areas must not interfere with canvas picking or drag cancellation.
- Depends on: S05-I2

## Top picks

1. S05-I1 — Small change closes a clear WCAG A shortcut failure and fixes menu/camera event conflicts.
2. S05-I3 — Existing arrays can provide complete keyboard and screen-reader access with minimal implementation.
3. S05-I2 — Corrects modal behavior and the shared focus problems affecting several everyday journeys.
4. S05-I5 — A tightly scoped CSS correction fixes deterministic reduced-mode positioning defects.
5. S05-I4 — Completes the explicit still-world requirement using patterns already present throughout the engine.

## Operator decisions

- Should a zoomed or resized visitor retain an explicitly dated, cached DOM reader after the world unmounts, while preserving the prohibition on below-gate world mounting and world-data requests?
- Should staged-event announcements be available by opt-in, or limited to visitors who currently have the Day book open?

## Cross-lane hooks

- Engine, beam, weather and lighting owners should inventory every elapsed/global-time consumer and separate decorative clocks from analytical updates for S05-I4.
- Shell/device owners should coordinate S05-I7 so cached reading access preserves the sorted 720×600 admission gate and introduces no below-gate world fetch.
- Information-design owners should reuse existing panel vocabulary and freshness semantics for chart tables, event announcements and the on-demand summary.
- UI owners should coordinate toolbar width, overlapping nonmodal surfaces and on-demand view/motion controls rather than adding permanent dashboard chrome.
- Skipped browsers, captures, assistive-technology sessions and test-suite execution; repository files were unchanged. Risk: rendered focus, texture-composited contrast, forced colors and actual zoom behavior still require approved verification.
