# Mobile & Accessibility Audit

## Summary
PharosVille's explicit desktop gate (720×360 minimum) successfully prevents mobile mounting and fallback experience is semantically sound with proper ARIA landmarks. Touch/pinch and reduced-motion are well-implemented; however, the detail panel uses `aria-live="polite"` which risks announcement race conditions on rapid selection, and the preload media query is asymmetric with the runtime gate. Focus management for the detail panel close button and focus restoration after selection are missing, and color contrast—particularly muted text on dark panels—falls below WCAG AA.

## Findings

### F1: Detail panel aria-live announcement race on rapid selection
- **Where:** `src/components/detail-panel.tsx:117` (`aria-live="polite"` on aside), `src/pharosville-world.tsx:328` (announcement state setter)
- **Impact:** Screen reader users selecting ships rapidly get overlapping or skipped announcements because both the detail panel and the main announcement state update asynchronously. The `aria-live="polite"` region in the aside waits for idle, while the main one may fire first or not at all if selections overlap.
- **Effort:** mid
- **Reward:** mid
- **Fix sketch:** Remove `aria-live="polite"` from the detail panel; consolidate all announcements to the main page-level one at `pharosville-world.tsx:328`. Ensure the detail panel heading (`h2 id={headingId}`) reads naturally (it already does), and rely on the single announcement to say "Selected ${title}."

### F2: Missing focus trap/management on detail panel
- **Where:** `src/components/detail-panel.tsx` (entire panel), `src/pharosville-world.tsx:301` (detail panel insertion)
- **Impact:** Keyboard users selecting a detail open the detail panel but focus does not move to the panel—it stays on the canvas or toolbar. Closing the panel does not restore focus. Users must tab back to find the close button.
- **Effort:** mid
- **Reward:** high
- **Fix sketch:** Add `useEffect` in detail panel to focus the close button (or the heading) on mount; restore focus to the last active element before opening on close. Use `useRef` to capture pre-open focus, or fall back to the canvas ref.

### F3: Asymmetric preload media query vs. runtime gate
- **Where:** `index.html:30` (preload media query), `src/client.tsx:8-9` (runtime MIN_LONG_SIDE_PX=720, MIN_SHORT_SIDE_PX=360)
- **Impact:** The preload uses `(min-device-width: 720px) and (min-device-height: 360px), (min-device-width: 360px) and (min-device-height: 720px)` which requires both conditions to match landscape OR portrait. The runtime reads `Math.max(w, h) >= 720 && Math.min(w, h) >= 360`, which is the same. However, if the gate is ever changed (e.g., to 1000×640 as discussed in widescreen-gate-plan.md), the preload will not auto-update and assets will fail to load.
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Extract the gate thresholds into a shared constant `const MIN_GATE = { long: 720, short: 360 };` in a new `src/systems/viewport-gate.ts` (or similar), and reference it in both `client.tsx` and `index.html` via a build-time constant or a static data file. Alternatively, add a build-time check to `npm run validate` that scans both files for matching dimensions.

### F4: Color contrast violations in detail panel text
- **Where:** `src/pharosville.css:399-410` (detail panel colors), `src/components/detail-panel.tsx` (content rendering)
- **Impact:** The detail panel's body text uses `--pv-muted: rgba(216, 208, 183, 0.72)` on a dark background `--pv-panel: rgba(10, 29, 38, 0.92)`, yielding approximately 3.5:1 contrast. Secondary descriptive text in facts (e.g., "cycle tempo", "risk water zone") may drop below 3:1. WCAG AA requires 4.5:1 for body text and 3:1 for large text. Small text on the fallback links passes (brass on parchment).
- **Effort:** low
- **Reward:** high
- **Fix sketch:** Run `npm run check:pharosville-colors` and add a WCAG AA contrast check to the color guard. Increase `--pv-muted` to `rgba(216, 208, 183, 1.0)` or adjust the background alpha. The existing test baseline `test:visual:accessibility` should visually confirm no text blur or readability loss.

### F5: Canvas is not keyboard-accessible for selection
- **Where:** `src/hooks/use-canvas-resize-and-camera.ts:436-472` (keyboard handler), `src/pharosville-world.tsx:264-270` (canvas instructions)
- **Impact:** The canvas accepts arrow keys for panning and +/- for zoom, which is good. However, there is no keyboard mechanism to cycle through selectable entities or select by name. Screen reader users must either rely on fallback links or use the accessibility ledger (which is not interactive). The `aria-hidden="true"` canvas (line 275) is correct, but the fallback story for keyboard selection is incomplete.
- **Effort:** high
- **Reward:** mid
- **Fix sketch:** Add Tab / Shift+Tab cycling through hit targets (ships, docks, areas) when focus is on the canvas or a toolbar button; pressing Enter selects. Render a small modal or tooltip showing the current cycling entity. For now, document that the accessibility ledger is the read-only parallel for blind/screen-reader users and will gain interactivity in a follow-up.

### F6: Touch target size on detail panel close button
- **Where:** `src/components/detail-panel.tsx:178` (close button), `src/pharosville.css` (button styling not explicitly sized)
- **Impact:** The close button uses an icon (`<X size={14}>`), with no explicit `min-height`/`min-width` in the CSS. Computed button height depends on parent padding and line-height. If computed touch target is <44×44 px (WCAG) or <48×48 px (iOS recommendation), users on touch devices will struggle to target it.
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Add explicit `min-height: 44px; min-width: 44px;` to `.pharosville-detail-panel__close` or wrap the button in a container with guaranteed touch-safe dimensions. Verify with `npm run test:visual` and manual 1× zoom inspection.

### F7: `prefers-color-scheme` not handled; forced dark theme
- **Where:** `src/pharosville.css:18` (body background `#050d13`), CSS tokens throughout
- **Impact:** PharosVille uses a fixed dark color scheme with no `@media (prefers-color-scheme: light)` query. Users with light-mode preference in their OS settings (accessibility option for some low-vision users) will see the dark theme and cannot opt into light. The brass tokens on dark are intentional theming, but no fallback exists.
- **Effort:** high
- **Reward:** low
- **Fix sketch:** This is a design intent rather than a bug (maritime diorama is dark-first). If supporting light mode is desired, create a parallel palette in CSS with `@media (prefers-color-scheme: light) { :root { --pv-brass: ... } }` and test with Playwright at both preferences. For now, document that dark theme is mandatory and low-vision users should use browser zoom + high-contrast extensions if needed.

### F8: Pinch zoom gesture not tested in accessibility suite
- **Where:** `tests/visual/pharosville.spec.ts` (pinch interaction tests), `src/hooks/use-canvas-resize-and-camera.ts:220-270` (pinch implementation)
- **Impact:** The pinch-to-zoom gesture is implemented and works but `npm run test:visual:accessibility` does not include a two-pointer touch test. The chromium/firefox accessibility suite will not catch pinch-related focus loss or AT announcement anomalies. Touch device users may trigger pinch unintentionally during panning.
- **Effort:** mid
- **Reward:** mid
- **Fix sketch:** Add a Playwright test case in the accessibility suite that dispatches two PointerEvent streams (pinch), verifies camera zoom changes, and confirms no spurious selection or focus shift occurs. Add a comment in the interaction test lane documenting pinch as a touch-only gesture (not trackpad-simulated in browser tests).

### F9: Accessibility ledger not toggleable from toolbar
- **Where:** `src/components/world-toolbar.tsx:97-108` (ledger button never rendered), `src/pharosville-world.tsx:285-294` (toolbar props)
- **Impact:** The toolbar button to show/hide the accessibility ledger is defined in `world-toolbar.tsx` but never wired up in `pharosville-world.tsx`. The ledger is always rendered as screen-reader-only (line 329), so toggling is moot, but the UI promise is unfulfilled. Blind users must scroll to the bottom of the page to access the ledger and cannot hide it if they use a summary tool to extract the ledger.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Remove the ledger toggle button code from the toolbar (it's dead code) or implement a state toggle and conditional render. For now, document that the ledger is screen-reader-only and always available (not a UI toggle).

### F10: Reduced-motion state not cached; re-reads on every interaction
- **Where:** `src/pharosville-world.tsx:241` (useEffect with observeReducedMotion), `src/hooks/use-canvas-resize-and-camera.ts:57-74` (reduced motion passed as prop)
- **Impact:** The reduced-motion preference is observed once on mount via `observeReducedMotion`, but if a user changes their OS preference mid-session, the page does not react until the next re-render. This is acceptable but not ideal for accessibility. The hook also passes `reducedMotion` as a prop to the canvas hook, so if the preference flips, all dependent state must propagate correctly.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** No action needed unless user reports; the current implementation is sound. If edge-case testing reveals a stale state, add a console warning in dev-mode when the preference changes without a re-render, or add a test case for dynamic preference changes.

## Validation Coverage

- **test:visual:accessibility** runs on chromium and firefox; checks a11y basics.
- **test:visual:cross-browser** uses the same accessibility spec.
- **check:pharosville-colors** only checks banned colors (purple, checkerboard), not WCAG contrast.
- No explicit **keyboard navigation test** for entity cycling or canvas focus management.
- No **touch target size audit** in the test suite.

Recommendation: Extend the color-guard script to include a contrast validator (e.g., via axe-core or a lightweight palette checker), add keyboard navigation coverage, and bundle touch target measurement into the visual test.
