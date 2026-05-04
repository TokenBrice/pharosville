# Pinch To Zoom Touch

Date: 2026-05-04

## Goal

- Investigate the current PharosVille camera/input stack and establish a clear
  implementation plan for pinch-to-zoom on touch-capable devices.
- Pinch-to-zoom means a two-contact gesture on the PharosVille canvas magnifies
  or reduces the map around the gesture center without breaking the existing
  one-pointer drag pan, click selection, wheel zoom, keyboard pan/zoom, toolbar
  controls, fullscreen mode, viewport gate, or reduced-motion contract.

## Scope

- In scope:
  - Eligible landscape devices that already pass the PharosVille runtime gate in
    `src/client.tsx` (`screen` long side >= 720 px and short side >= 360 px).
  - Canvas pointer handling in `src/hooks/use-canvas-resize-and-camera.ts`.
  - Camera math in `src/systems/camera.ts` / `src/systems/projection.ts`, if a
    small helper makes the gesture easier to test.
  - Focused unit and browser coverage for the new gesture.
- Out of scope:
  - Broad mobile/tablet redesign. `docs/pharosville-page.md` still says mobile
    and tablet compatibility are out of scope, and narrow/portrait users should
    continue to see the fallback or rotate prompt.
  - API, data-model, asset, visual-encoding, or Pages Function allowlist changes.
  - New toolbar UI. Existing wheel/keyboard/reset/follow controls remain enough.

## Constraints

- Keep changes route-local unless explicitly requested otherwise.
- Preserve `/api/*` allowlist and server-side secret handling.
- Preserve the desktop gate: below the screen capability floor, do not mount
  world data, the canvas, the asset manifest loader, or sprite decoding.
- Preserve reduced-motion behavior. Camera changes from direct user gestures are
  allowed, but reduced-motion must not start the normal world RAF loop.
- Keep hit targets aligned after camera updates by relying on the existing
  camera-only hit-target re-projection path in `src/pharosville-world.tsx`.
- Keep one route-owned world clock; pinch input should not add its own animation
  loop.

## Investigation Notes

- `src/pharosville.css` already sets `.pharosville-canvas { touch-action: none; }`,
  so the browser should not consume canvas touches for page scrolling/zooming.
- `src/hooks/use-canvas-resize-and-camera.ts` owns the canvas ref, resize
  observer, pointer handlers, wheel handler, keyboard handler, camera state, and
  existing drag pan scheduling.
- Current pointer state is single-pointer only:
  `dragRef` stores one `pointerId`, last point, and `moved`.
- Current wheel zoom already preserves the point under the cursor:
  `handleWheel` calls `zoomCameraAt(camera, canvasPoint(event), camera.zoom * direction)`
  and then `clampCameraToMap(...)`.
- `src/systems/projection.ts` exposes `zoomCameraAt(...)` with zoom bounds
  `0.48..2.4`.
- `src/systems/camera.ts` exposes `clampCameraToMap(...)`, `zoomIn(...)`, and
  `zoomOut(...)`; the implementation should reuse this clamp behavior.
- `src/pharosville-world.tsx` recomputes hit targets on camera changes through
  `recomputeHitTargetsForCameraOnly(...)`, so a camera-state update from pinch
  should flow through existing selection/hover alignment.
- `tests/visual/pharosville.spec.ts` already has an interaction test covering
  click selection, blank-map clearing, wheel zoom, fullscreen, drag pan, resize,
  and reduced-motion no-RAF behavior. Add pinch coverage near that lane or as a
  neighboring focused interaction test.
- `src/client.tsx` gates the runtime by physical screen capability and portrait
  orientation. Pinch support should not relax that gate.

## Plan

1. Add explicit multi-pointer gesture state in
   `src/hooks/use-canvas-resize-and-camera.ts`.
   - Replace or supplement `dragRef` with a small active-pointer registry keyed
     by `pointerId`, storing current canvas-space points.
   - Keep the existing one-pointer path as drag pan, including the RAF-batched
     `scheduleDragPan(...)`.
   - When a second active pointer appears, enter a pinch gesture and suppress
     click selection for the involved pointer sequence.

2. Implement pinch camera math with existing projection utilities.
   - Track previous two-pointer distance and midpoint.
   - On each two-pointer move, compute:
     - `scale = currentDistance / previousDistance`
     - `midpointDelta = currentMidpoint - previousMidpoint`
   - First apply screen-space pan from `midpointDelta`, then zoom at the current
     midpoint with `zoomCameraAt(nextCamera, currentMidpoint, nextCamera.zoom * scale)`.
   - Clamp the result with `clampCameraToMap(..., { map: world.map, viewport })`.
   - Ignore tiny distance noise with a threshold, for example distance changes
     under 1-2 px.

3. Define pointer lifecycle behavior.
   - On `pointerdown`, add pointer to the registry and call
     `setPointerCapture(...)`.
   - On `pointermove`, update that pointer's point.
   - If exactly one active pointer and no active pinch, preserve existing drag
     behavior.
   - If at least two active pointers, use the first two stable pointer IDs for
     pinch state and mark the interaction as moved.
   - On `pointerup` / `pointercancel` / lost capture, remove the pointer and end
     pinch state.
   - After a pinch ends with one pointer still down, do not immediately select
     or jump-pan from stale coordinates; reset that remaining pointer's drag
     baseline.

4. Add tests for pure math and browser behavior.
   - Unit test any extracted helper, or extend camera/projection tests if the
     implementation adds a helper such as `pinchCameraAt(...)`.
   - Add a Playwright interaction assertion that dispatches two touch-like
     pointer streams on the canvas and verifies `__pharosVilleDebug.camera.zoom`
     changes while `cameraWithinBounds` remains true.
   - In the same or adjacent assertion, verify no detail panel selection is
     triggered by the pinch gesture.
   - Keep existing wheel and drag assertions to guard regressions.

5. Update docs only if the product contract changes.
   - If the final decision is "pinch works only on already-eligible landscape
     touch devices," no broad mobile support docs should be added.
   - If the contract wording changes from desktop-only to touch-capable
     landscape inspection, update `docs/pharosville-page.md`,
     `docs/pharosville/CURRENT.md`, and testing docs in the same patch.

## Validation

- [x] `npm test -- src/systems/camera.test.ts src/systems/projection.test.ts`
  passed on 2026-05-04.
- [x] `npx playwright test tests/visual/pharosville.spec.ts --grep "interactions"`
  passed on 2026-05-04.
- [x] `npm run validate:changed` passed on 2026-05-04.
- [x] `npm run onboard:agent` completed on 2026-05-04 with warnings for local
  Node major 25 vs expected 24, dirty worktree, and legacy `output/` content.
- [x] `npm run smoke:api-local` passed on 2026-05-04.
- [x] `npm run smoke:dev-proxy` passed on 2026-05-04.
- [x] `npm run validate:release` passed on 2026-05-04, including built-dist
  Playwright and cross-browser accessibility lanes.

## Handoff

- Files changed:
  - `agents/2026-05-04-pinch-to-zoom-touch.md`
  - `src/hooks/use-canvas-resize-and-camera.ts`
  - `src/pharosville-world.tsx`
  - `tests/visual/pharosville.spec.ts`
- Risks/notes:
  - Implemented multi-pointer canvas gesture state in the existing camera hook.
    Two active pointers update the camera by panning to the gesture midpoint and
    zooming around that midpoint with `zoomCameraAt(...)`, then clamping through
    `clampCameraToMap(...)`.
  - One-pointer drag pan, wheel zoom, keyboard controls, toolbar controls,
    fullscreen, reduced-motion rendering, and viewport gating remain on the
    existing paths.
  - `pointercancel` now resets gesture state. Pointer capture calls are guarded
    because synthetic tests and interrupted platform gestures can lack a
    capturable active pointer even though the canvas still receives events.
  - The highest-risk product ambiguity is the existing desktop-only contract.
    Implementation should be framed as improving touch-capable eligible
    landscape devices, not as a mobile-responsive PharosVille launch.
  - Browser coverage uses DOM-dispatched `PointerEvent`s with
    `pointerType: "touch"` against the canvas, then asserts debug camera zoom,
    bounds, and no accidental detail selection.
  - Trackpad pinch may arrive as browser-specific wheel events rather than two
    pointer contacts. Existing wheel zoom already covers wheel-style zoom input;
    do not conflate this with touchscreen two-finger pinch unless additional
    platform testing proves a gap.
- Follow-ups:
  - None currently.
