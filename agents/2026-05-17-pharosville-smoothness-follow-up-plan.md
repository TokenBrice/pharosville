# PharosVille Smoothness Follow-Up Implementation Plan

Date: 2026-05-17

Scope: planning artifact only. This plan follows
`agents/2026-05-17-pharosville-smoothness-council/01-implementation-report.md`
and covers only the items that report marked as partial or deferred.

Research inputs:

- Local inspection of the current renderer, camera, motion loop, cache, ship, and perf-test code.
- Read-only subagent research on:
  - world-owned single RAF for camera + world
  - dynamic water split, static scenery audit, and render-budget scheduling
  - ship sprite/tint/trim precomposition
  - allocation-light telemetry and perf validation

## Current Baseline

Do not reimplement the work already landed in the May 17 smoothness pass. Treat the following as the baseline:

- Camera input already routes through a hook-local camera intent RAF in `src/hooks/use-canvas-resize-and-camera.ts`.
- Normal world motion is still owned by `src/hooks/use-world-render-loop.ts`.
- Dynamic water overlay caching is pan-friendly, exact-zoom keyed, pixel-budgeted, and currently phase-bucketed at 15 Hz.
- Renderer cache backing pixels are already exposed in render metrics.
- Ship display smoothing, route/path keys, velocity, heading/wake continuity, selection-ring alignment, and perf gates have already landed.

Known stale doc note: `docs/pharosville/ARCHITECTURE.md` still describes cache count caps and 10 Hz dynamic water. Update it when the next renderer-cache change lands.

## Invariants

- Desktop gate remains unchanged: below `720x360`, do not mount world runtime, fetch world data, fetch the manifest, or set up canvas.
- Browser code continues to call same-origin `/api/*` only. No client-side `PHAROS_API_KEY`.
- Reduced motion must not keep a continuous RAF alive and must remain deterministic.
- Hit targets, selection rings, follow-selected, debug samples, detail panel, and accessibility ledger must use the same displayed motion model.
- Do not add manifest assets for performance work unless explicitly justified; prefer runtime cache and draw-path improvements.
- Any retained runtime canvas cache must count against `MAX_TOTAL_BACKING_PIXELS`.

## Recommended Sequence

### Phase 1 - Move Camera Stepping Into The World RAF

Priority: P0

Why first: the render-budget scheduler and camera-follow behavior both need one authoritative frame phase. The current state still has the world RAF plus a hook-local camera RAF during active camera animation.

Files:

- `src/pharosville-world.tsx`
- `src/hooks/use-canvas-resize-and-camera.ts`
- `src/hooks/use-canvas-resize-and-camera.test.ts`
- `src/hooks/use-world-render-loop.ts`
- `src/hooks/use-world-render-loop.test.tsx`
- `tests/visual/pharosville.spec.ts`

Implementation steps:

1. Add a stable world-frame requester that the canvas hook can call when camera intent changes.
2. Refactor `useCanvasResizeAndCamera` from RAF owner into a camera intent controller. Keep event handling, target camera refs, follow state, reduced-motion immediates, and React camera state for UI labels.
3. Expose a `stepCamera(now, shipMotionSamples)` style callback from the canvas hook.
4. In `useWorldRenderLoop`, collect semantic + smoothed ship samples first, step camera with the same RAF timestamp, then read the updated `cameraRef` for hit targets and drawing.
5. Move camera-only hit-target reprojection into the world loop. If camera changed this frame, reproject all snapshot records before drawing; otherwise keep the existing moving-ship incremental refresh.
6. Remove the parent `canvas.camera` camera-only reprojection effect after the loop owns it.
7. Add debug proof fields such as `activeCameraLoopCount: 0` and `cameraFrameSource: "world-render-loop"`.

Acceptance:

- Normal motion has one world-owned RAF for analytical motion and camera stepping.
- Follow-selected samples the same display ship position as the frame being drawn.
- Drag, wheel, pinch, keyboard, toolbar, reset, and follow-selected stay bounded and monotonic.
- Reduced motion still reports no continuous motion loop; camera commands remain one-shot.
- Tests prove the previous hook-local camera RAF no longer exists as an active motion loop.

Validation:

```bash
npm test -- src/hooks/use-canvas-resize-and-camera.test.ts src/hooks/use-world-render-loop.test.tsx src/systems/camera.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|normal motion|reduced motion"
npm run test:perf
```

### Phase 2 - Make Telemetry Allocation-Light Before Tightening Budgets

Priority: P0

Why second: the app already measures frame pacing, route cache health, longtasks, heading continuity, and position continuity, but some telemetry paths still allocate and sort in hot frame paths. Tightening thresholds before this can measure the instrumentation itself.

Files:

- `src/hooks/use-world-render-loop.ts`
- `src/hooks/use-world-render-loop.test.tsx`
- `src/systems/canvas-budget.ts`
- `src/systems/canvas-budget.test.ts`
- `src/renderer/hit-testing.ts`
- `tests/perf/sustained-motion.spec.ts`
- `docs/pharosville/TESTING.md`
- `docs/pharosville/SCENARIO_CATALOG.md`

Implementation steps:

1. Split runtime metrics into allocation-light counters used every frame and debug snapshots projected at a controlled cadence.
2. Replace frame interval, draw duration, heading delta, position delta, and longtask `push`/`shift`/copy/sort windows with fixed-size rings plus reusable scratch buffers or histograms.
3. Reuse last-position objects instead of allocating `{ x, y }` per ship per frame.
4. Stop compacting all `shipMotionSamples` into debug arrays every RAF. Publish them every 250 ms, on selection/hover changes, or behind an explicit debug snapshot refresh path while preserving the current test shape.
5. Add timing diagnostics: `sampleDurationMs`, `hitTargetDurationMs`, `drawDurationMs`, `debugPublishDurationMs`, `telemetryOverheadMs`, `hitTargetChangedShipCount`, and `snapshotRebuildCount`.
6. Add a dense camera-stress perf scenario for scripted pan + wheel zoom, separate from the existing idle sustained-motion lane.

Acceptance:

- Existing perf fields remain available to Playwright.
- Telemetry does not create longtasks or avoidable GC pressure.
- Dense sustained-motion and camera-stress lanes distinguish CI guard thresholds from local smooth targets.
- Reduced-motion telemetry does not accumulate frame-pacing samples from a continuous RAF.

Initial thresholds:

- Keep current CI thresholds until this phase lands and has stable history.
- After at least three stable CI runs, consider draw median `<= 100ms`, p95 `<= 140ms`, route hit ratio `>= 0.45`, route eviction `<= 0.02`, longtasks `0`.
- Add camera-stress guard initially around `effectiveFps >= 12`, `p90Ms <= 120ms`, and longest dropped burst `<= 25%` of the sampled window.
- Keep local smooth target at `1440x960`: `effectiveFps >= 50`, `p90Ms <= 24ms`, longest dropped burst `<= 1`, longtasks `0`.

Validation:

```bash
npm test -- src/hooks/use-world-render-loop.test.tsx src/systems/canvas-budget.test.ts src/renderer/hit-testing.test.ts
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|normal motion|reduced motion|ultrawide"
```

### Phase 3 - Split Dynamic Water Into Static Texture And Continuous Accents

Priority: P1

Why after telemetry: replacing the 15 Hz whole-water overlay can improve perceived smoothness, but it may increase per-frame tile work. Ship it behind measured pass metrics.

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/render-types.ts`
- `src/renderer/layers/terrain.ts`
- `src/renderer/layers/shoreline.ts`
- `src/systems/palette.ts`
- `tests/perf/sustained-motion.spec.ts`
- `tests/visual/pharosville.spec.ts`

Implementation steps:

1. Split water drawing responsibilities:
   - static: base diamond, local asset texture, non-time zone styling, static shoal/ledger/reef identity marks
   - continuous: wave strokes, shimmer alpha, lighthouse caustics, seawall ripples, surf-adjacent marks
2. Keep static water inside the existing terrain static cache. Avoid adding another full-screen retained cache unless pixel metrics prove it is affordable.
3. Replace `drawDynamicPassCached(... "water-overlays" ...)` with a direct continuous accent pass or a much thinner retained texture cache plus direct accent pass.
4. Keep reduced-motion water deterministic by pinning accent phase.
5. Add water pass metrics: `waterAccentTileCount`, `waterAccentDrawMs`, `waterAccentMode`, and cache hits/misses by water scope.

Acceptance:

- Warning/Danger water, beam caustics, seawall ripples, and salient wave accents read continuously instead of as a low-frequency whole-layer repaint.
- Semantic water colors and risk-zone themes are unchanged.
- Water labels still draw above entities.
- Total backing pixels remain within `MAX_TOTAL_BACKING_PIXELS`.

Validation:

```bash
npm test -- src/systems/palette.test.ts
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual|normal motion|reduced motion|ultrawide"
```

### Phase 4 - Add A Render-Budget Scheduler For Low-Priority Effects

Priority: P1

Why after Phase 1: the scheduler should be part of the single world frame lifecycle, not a parallel throttle.

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/render-types.ts`
- planned new renderer scheduler module
- planned new renderer scheduler unit test
- `src/renderer/layers/ambient.ts`
- `src/renderer/layers/cinematic-atmosphere.ts`
- `src/renderer/layers/night-tint.ts`
- `src/renderer/layers/weather.ts`
- `src/renderer/layers/lighthouse.ts`
- `src/hooks/use-world-render-loop.ts`

Implementation steps:

1. Add a small scheduler state derived from frame pacing, draw duration, active camera interaction, and recent recovery frames.
2. Define tiers: `full`, `interaction`, `constrained`, and `recovery`.
3. Always draw analytical and interaction-critical layers: terrain, continuous water accents, entities, docks, ships, lighthouse body, water labels, selected/focused cues, selection, and hit-target parity.
4. Degrade only low-priority effects first: film grain, cloud shadows, birds, sparkles, moon reflection, sea mist, decorative lights, and god rays.
5. Do not skip `drawWeather()` until lightning planning is separated from visual painting; weather flashes currently affect visual state and should not silently desync.
6. Expose scheduler metrics: `renderBudgetTargetMs`, `schedulerTier`, `schedulerSkippedPasses`, `schedulerDegradedPasses`, and `staleFrameCountByPass`.

Acceptance:

- Camera interaction and dense scenes shed decorative work before they shed analytical content.
- Reduced motion remains deterministic.
- Scheduler activity is visible in debug metrics and covered by unit tests.
- Snapshot drift is reviewed before any baseline update.

Validation:

```bash
npm test -- [new renderer scheduler unit test]
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|dense visual|reduced motion"
```

### Phase 5 - Generalize Runtime Cache Budgeting, Then Precompose Ship Bodies

Priority: P2

Why not earlier: ship precomposition is useful, but unsafe until all retained canvases share one pixel budget. Hidden module-level sprite caches would bypass the current static/dynamic cache accounting.

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/render-types.ts`
- planned new ship body cache module
- `src/renderer/layers/ships.ts`
- `src/renderer/layers/ships.test.ts`
- `src/renderer/asset-manager.ts`
- `src/systems/canvas-budget.ts`
- `src/systems/canvas-budget.test.ts`

Implementation steps:

1. Generalize cache accounting from static/dynamic totals into named retained-cache buckets. Include `spriteCachePixels` and `spriteCacheEntryCount`, or a generic per-scope breakdown.
2. Move cache reservation/eviction into a shared renderer cache budget service, or pass a `reserveRetainedCanvas(...)` capability through `WorldCanvasFrame` / `ShipRenderFrame`.
3. Count every retained precomposed ship canvas as backing pixels and evict it with the same LRU/protection rules as static/dynamic layer caches.
4. Add a ship body cache module behind `drawShipBody`. Fallback to the existing inline draw path when budget reservation, `document`, or `getContext()` is unavailable.
5. Precompose only base body + sail tint + trim first. Keep pose transform, wake, selection, hover rings, signal overlays, lanterns, logos, squad pennants, and data-state overlays live.
6. Migrate by tier:
   - standard sprite hulls first
   - unique static hulls next
   - titans last, keyed by asset id + ship id/livery + frame index + manifest cache version
7. Prefer logical/source-size precomposition over zoom/DPR-keyed precomposition to avoid cache explosion during camera motion.

Acceptance:

- Standard dense fleet removes repeated tint/trim work without changing hit rects or selection geometry.
- Sprite cache memory is included in `renderMetrics.backing`.
- Visual output is equivalent at common zooms.
- Cache pressure falls back gracefully to the existing draw path.

Validation:

```bash
npm test -- src/renderer/layers/ships.test.ts src/systems/canvas-budget.test.ts src/renderer/asset-manager.test.ts
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture|normal motion|interactions|ultrawide"
npm run check:pharosville-assets
npm run build
```

### Phase 6 - Audit Static Scenery And Update Renderer Docs

Priority: P2

Why last: much of the scenery lives in the z-sorted entity pass for depth reasons. Promote only proven static, non-overlapping work.

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/layers/scenery.ts`
- `src/renderer/layers/docks.ts`
- `src/renderer/layers/ambient.ts`
- `src/renderer/layers/cinematic-atmosphere.ts`
- `docs/pharosville/ARCHITECTURE.md`
- `docs/pharosville/TESTING.md`
- `docs/pharosville/SCENARIO_CATALOG.md`

Implementation steps:

1. Add or document a `sceneryMotionClassForProp()` style classification.
2. Identify props that are truly static and safe to cache without breaking depth order.
3. Keep props that bob, sway, wobble, light-flicker, or can overlap ships in the dynamic/z-sorted entity pass unless their time dependence is intentionally removed.
4. Candidate props requiring review before static promotion: `crate-stack`, `barrel`, `net-rack`, `rope-coil`, `cargo-stack`, `moored-dinghy-*`, and `harbor-bell`.
5. Update `docs/pharosville/ARCHITECTURE.md` to describe pixel-budget cache eviction, exact-zoom cache mode, 15 Hz current water cadence if still present, and any new scheduler/cache scopes.

Acceptance:

- Static scenery no longer redraws every frame where depth order allows.
- Animated props keep their intended cadence.
- Layer order remains correct: backgrounded docks behind ships, water labels above entities, selection last.
- Docs match the implemented cache and scheduler model.

Validation:

```bash
npm test -- src/renderer/layers/scenery.test.ts
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell|dense visual|normal motion"
npm run validate:docs
```

## Parallelization Guidance

Use worktree-per-agent for implementation swarms. Safe parallel slices:

- Phase 1 should be single-owner because it crosses camera, world loop, hit-target timing, and Playwright interaction tests.
- Phase 2 can run in parallel with Phase 1 only if it avoids camera-loop ownership files, but merging will be delicate because both touch `use-world-render-loop.ts`.
- Phase 3 water split can run separately from Phase 5 ship precomposition after Phase 2 metrics fields are agreed.
- Phase 4 scheduler should wait for Phase 1 and should own scheduler + renderer pass ordering files.
- Phase 5 can be split into cache-budget service and ship-body-cache worker only if write scopes are explicit.
- Phase 6 docs/scenery audit can run after Phase 3/4 decisions are final.

## Program Definition Of Done

Do not claim the broader smoothness follow-up complete until all are true:

- Normal motion uses one world-owned RAF for both analytical motion and camera stepping.
- Reduced motion has deterministic static samples and no continuous RAF.
- `npm run test:perf` covers sustained dense motion and camera-stress frame pacing.
- Telemetry is allocation-light enough that it is not a meaningful source of frame jitter.
- Dynamic water no longer presents as a whole-layer 15 Hz step in salient regions.
- Scheduler degrades decorative work before analytical work under camera interaction or frame pressure.
- Runtime ship precomposition, if retained, is included in total backing-pixel accounting.
- Static scenery docs and architecture docs match the current renderer.
- Local smooth target at `1440x960` reaches `effectiveFps >= 50`, `p90Ms <= 24ms`, `longestDroppedBurst <= 1`, and `longtask.count === 0` after warmup.
