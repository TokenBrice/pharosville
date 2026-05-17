# PharosVille Smoothness Implementation Report

Date: 2026-05-17

Scope: implementation follow-up to `00-implementation-task-list.md`.

## Landed

- Camera intent controller in `use-canvas-resize-and-camera`: drag, wheel, pinch, keyboard, toolbar, reset, and follow-selected now route through one hook-local camera RAF with reduced-motion one-shot behavior.
- Continuous exponential wheel zoom and pinch routing through the camera integrator.
- Display motion smoothing now keeps compatible ship state transitions continuous, adds route/path keys, velocity, and speed telemetry, and copies `mapVisibilityAlpha`.
- Route/path keyed heading, wake, and water-segment memory.
- Selected/hovered and rotating moving ship hit targets reproject from display samples; selection rings use current display geometry; camera-only re-entry is fixed.
- Renderer cache telemetry for backing pixels/cache stats, exact-zoom cache keys, total backing-pixel eviction, and pan-friendly dynamic water cache.
- Dynamic water whole-layer cadence raised from 10 Hz to 15 Hz.
- Ship rendering de-emphasizes discrete sheet stepping and adds continuous pose, flutter, speed-aware wake, and bounded moored visibility fades.
- Water labels use retained plaque bitmaps but draw text directly on the main canvas to preserve zoomed-out legibility.
- Post/fullscreen effect gradient and pattern caches for atmosphere, night tint, ambient moon reflection, and weather lightning.
- Deferred asset loading and water-path warmup are paced across idle chunks after the first critical paint.
- Sustained-motion perf now asserts frame pacing, draw distribution, longtasks, route cache health, heading continuity, and position continuity.
- Browser coverage now includes monotonic zoom and follow-selected attachment.

## Partially Landed Or Deferred

- A true world-owned single RAF for both camera and world remains a larger architecture follow-up. The current state has one analytical world RAF plus one hook-local camera RAF during active camera animation.
- Dynamic water is smoother and cache-friendly, but the full split into static water texture plus continuous accent-only overlays remains deferred.
- The render-budget scheduler for low-priority ambience/post effects remains deferred; several expensive effects were cached instead.
- Full ship sprite/tint/trim precomposition remains deferred because it needs cache pixel accounting across sprite caches.
- Static scenery pass auditing remains deferred; existing static caches were preserved and strengthened.
- Metrics were validated and bounded, but the broader allocation-light telemetry refactor remains deferred.

## Validation

- `npm test`
- `npm run typecheck`
- `npm run validate:docs`
- `npm run check:pharosville-assets`
- `npm run check:pharosville-colors`
- `npm run build`
- `npm run test:perf`
- `npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|normal motion|ultrawide"`

