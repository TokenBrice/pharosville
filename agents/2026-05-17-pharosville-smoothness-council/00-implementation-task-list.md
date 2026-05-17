# PharosVille Smoothness Council - Implementation Task List

Date: 2026-05-17

Scope: planning artifact only. This file consolidates a 5-agent read-only council audit of PharosVille smoothness, performance, ship motion, camera motion, zoom, renderer caches, assets, and validation. It assumes the existing dirty smoothening pass in the working tree may land first and should not be overwritten.

Relevant current dirty context observed during the audit:

- `src/hooks/use-world-render-loop.ts`
- `src/hooks/use-world-render-loop.test.tsx`
- `src/renderer/canvas-primitives.ts`
- `src/renderer/canvas-primitives.test.ts`
- `src/renderer/layers/ship-pose.ts`
- `src/renderer/layers/ships.ts`
- `src/systems/motion-planning.ts`
- `src/systems/motion.test.ts`
- `src/systems/visual-motion.ts`
- `src/systems/visual-motion.test.ts`

Hard invariants:

- Keep the desktop gate: below `720x360`, do not mount the world, fetch world data, fetch the manifest, or set up canvas runtime.
- Keep one route-owned analytical motion clock. Reduced motion must render deterministic static frames with `activeMotionLoopCount === 0`.
- Keep browser code same-origin `/api/*` only. Do not expose `PHAROS_API_KEY`.
- Keep canvas, hit testing, selected rings, follow-selected, detail panel, debug state, and accessibility ledger aligned with the same displayed motion model.
- Do not add manifest assets for performance unless absolutely necessary. The current manifest is at the validator cap.

## Council Inputs

Five read-only subagents audited distinct layers:

- Renderer/frame pacing: frame loop, caches, dynamic passes, hot allocations.
- Ship motion: route sampling, visual interpolation, heading/wake, transitions.
- Camera/zoom: pan, wheel, pinch, follow-selected, hit targets, resize.
- Asset/layer cost: manifest, water, labels, docks, ship compositing.
- Benchmarking/architecture: perf gates, telemetry, acceptance metrics.

## Debate And Vote

The council converged on five dominant findings:

1. Camera movement is still split across multiple paths. Drag is RAF-coalesced, wheel/pinch/toolbar/key update React camera state directly, and follow-selected owns a separate RAF in `src/hooks/use-canvas-resize-and-camera.ts`. This can feel stepped even if ships are subpixel.
2. Ship sampling is mostly continuous, but the new display smoothing snaps on any state change in `src/systems/visual-motion.ts`. Docking, departing, sailing, arriving, and risk-drift transitions can still pop.
3. Hit targets and selection rings can lag behind smooth visual samples because moving ship hit updates are gated by floored tile-cell changes in `src/hooks/use-world-render-loop.ts`.
4. Renderer caching can visibly quantize motion. Dynamic water overlays update at 10 Hz in `src/renderer/world-canvas.ts`, static caches bucket camera offsets, and dynamic water cache keys use full camera offsets.
5. Performance is under-measured for the UX problem. Existing perf tests mostly guard draw duration. The app now exposes frame pacing telemetry, but `npm run test:perf` does not yet assert actual frame intervals, dropped bursts, total backing pixels, or camera stress smoothness.

Vote synthesis method:

- Items named by at least two council seats were promoted unless high risk made them dependent on prerequisite telemetry.
- Weight favored visible smoothness, implementation tractability in this repo, reduced-motion safety, and validation clarity.
- Pure micro-optimizations were kept behind measurement tasks unless they remove an obvious hot-path allocation.

## Top 25 Tasks

### 1. Land Or Reconcile The Current Smoothening Pass

Priority: P0
Impact: high
Effort: medium
Risk: medium
Council votes: Boole 25, local audit prerequisite

Files:

- `src/hooks/use-world-render-loop.ts`
- `src/hooks/use-world-render-loop.test.tsx`
- `src/renderer/canvas-primitives.ts`
- `src/renderer/canvas-primitives.test.ts`
- `src/renderer/layers/ship-pose.ts`
- `src/renderer/layers/ships.ts`
- `src/systems/motion-planning.ts`
- `src/systems/motion.test.ts`
- `src/systems/visual-motion.ts`
- `src/systems/visual-motion.test.ts`

Implementation notes:

- Treat the existing dirty pass as the baseline smoothness patch. Review it rather than rewriting it.
- Confirm subpixel sprite drawing is limited to moving ships or cases where subpixel sampling matters.
- Confirm visual sample smoothing does not alter semantic samples used for detail/accessibility semantics.
- Confirm frame pacing telemetry is debug-only or allocation-light enough for production.
- Confirm reduced motion still bypasses visual smoothing and does not create a continuous loop.

Acceptance:

- Unit tests added by the pass are green.
- Existing normal-motion and reduced-motion Playwright tests stay green.
- No unrelated dirty changes are reverted.
- Screenshots are reviewed before any baseline update.

Validation:

```bash
npm test -- src/hooks/use-world-render-loop.test.tsx src/systems/motion.test.ts src/systems/visual-motion.test.ts src/renderer/canvas-primitives.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|reduced motion"
```

### 2. Add Real Frame-Pacing Gates To `npm run test:perf`

Priority: P0
Impact: high
Effort: low
Risk: low
Council votes: Boole 30, Meitner benchmark must-have

Files:

- `tests/perf/sustained-motion.spec.ts`
- `src/hooks/use-world-render-loop.ts` if debug shape needs small extension
- `docs/pharosville/TESTING.md`
- `docs/pharosville/SCENARIO_CATALOG.md`

Implementation notes:

- Extend the perf test to read `debug.renderMetrics.framePacing`.
- Keep the existing `drawDurationMs` distribution initially, but add actual user-facing smoothness thresholds.
- Split thresholds into two tiers:
  - CI guard tier: conservative, avoids noise while catching regressions.
  - Local smooth tier: the target UX standard used during manual optimization.
- Track `effectiveFps`, `p90Ms`, `droppedFrameCount`, `longestDroppedBurst`, and `longtask.count`.

Initial acceptance metrics:

- Normal motion reports `activeMotionLoopCount === 1`.
- Reduced motion reports `activeMotionLoopCount === 0` in existing reduced-motion tests.
- Local smooth tier at `1440x960`: `effectiveFps >= 50`, `framePacing.p90Ms <= 24`, `longestDroppedBurst <= 1`, `longtask.count === 0`.
- CI guard tier can start looser, then tighten after stable run history.

Validation:

```bash
npm run test:perf
```

### 3. Track And Enforce Total Main Plus Offscreen Canvas Pixels

Priority: P0
Impact: high
Effort: medium
Risk: low-medium
Council votes: Boole 18, Meitner 14, Locke 15

Files:

- `src/systems/canvas-budget.ts`
- `src/renderer/world-canvas.ts`
- `src/hooks/use-world-render-loop.ts`
- `tests/visual/pharosville.spec.ts`
- `tests/perf/sustained-motion.spec.ts`

Implementation notes:

- Add telemetry for main canvas pixels plus static and dynamic cache backing pixels.
- Replace count-only cache limits (`STATIC_CACHE_MAX`, `DYNAMIC_CACHE_MAX`) with pixel-budget-aware eviction.
- Enforce `MAX_TOTAL_BACKING_PIXELS` across the main canvas and retained offscreen canvases.
- Purge caches cleanly on DPR changes, resize, manifest cache version changes, and world changes.
- Expose total cache pixels in `window.__pharosVilleDebug.renderMetrics` or a nearby debug field.

Acceptance:

- Main canvas remains `<= MAX_MAIN_CANVAS_PIXELS`.
- Main plus offscreen cache pixels remains `<= MAX_TOTAL_BACKING_PIXELS`.
- Ultrawide/high-DPR tests verify the total budget, not only the main canvas.
- Cache eviction does not thrash during steady idle or small pans.

Validation:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "ultrawide"
npm run test:perf
```

### 4. Build A Single RAF-Owned Camera Intent Controller

Priority: P0
Impact: very high
Effort: medium-high
Risk: medium
Council votes: Meitner 30, Lorentz 30

Files:

- `src/hooks/use-canvas-resize-and-camera.ts`
- `src/hooks/use-canvas-resize-and-camera.test.ts`
- `src/hooks/use-world-render-loop.ts`
- `src/systems/camera.ts`
- `src/pharosville-world.tsx`

Implementation notes:

- Replace direct per-event camera state updates with camera intent refs:
  - `targetCamera`
  - `displayCamera`
  - active interaction mode: idle, drag, wheel, pinch, keyboard, toolbar, follow-selected, resize
  - optional velocity or last intent timestamp
- The main world RAF should sample and damp `displayCamera` toward `targetCamera`.
- Commit React camera state less often, for labels/debug and DOM consumers, not as the per-frame source of truth.
- Fold follow-selected into the same controller instead of owning a separate follow RAF.
- Manual drag, wheel, pinch, keyboard, toolbar zoom, and reset must cancel follow-selected cleanly.
- Reduced-motion camera commands may still animate only if this is treated as interaction motion rather than analytical motion; if uncertain, use one-shot camera changes under reduced motion and preserve `activeMotionLoopCount === 0`.

Acceptance:

- Exactly one analytical/world RAF loop in normal motion.
- No follow-selected auxiliary RAF that can race the world render loop.
- Camera debug reports target/display delta and active mode.
- Pan, zoom, and follow movement are monotonic and do not overshoot map clamps.
- Existing toolbar labels remain correct.

Validation:

```bash
npm test -- src/hooks/use-canvas-resize-and-camera.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|normal motion|reduced motion"
```

### 5. Normalize Wheel And Pinch Zoom Into Continuous Exponential Zoom

Priority: P0
Impact: high
Effort: low-medium
Risk: low
Council votes: Lorentz 16 plus camera consensus

Files:

- `src/hooks/use-canvas-resize-and-camera.ts`
- `src/hooks/use-canvas-resize-and-camera.test.ts`
- `tests/visual/pharosville.spec.ts`

Implementation notes:

- Replace fixed `1.12` wheel steps with delta-normalized zoom:
  - Normalize `WheelEvent.deltaMode` to pixels.
  - Use a small exponential scale, for example `scale = Math.exp(-normalizedDelta * k)`.
  - Clamp total zoom through existing camera bounds.
  - Preserve the pointer focal world point via `zoomCameraAt`.
- Pinch should use the same target-camera path and not bypass the camera integrator.
- Mouse-wheel steps can still feel decisive, but trackpads must be smooth.

Acceptance:

- Wheel zoom is monotonic for both mouse-wheel-sized and trackpad-sized deltas.
- The tile under the pointer stays within a small pixel tolerance during zoom.
- No selection is fired by a pinch gesture.

Validation:

```bash
npm test -- src/hooks/use-canvas-resize-and-camera.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "pinch|interactions"
```

### 6. Fix Active-Zoom Cache Quantization

Priority: P0
Impact: high
Effort: medium
Risk: medium
Council votes: Lorentz 22

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/viewport.ts`
- `tests/perf/sustained-motion.spec.ts`
- `tests/visual/pharosville.spec.ts`

Implementation notes:

- Static and dynamic caches currently quantize zoom into percent buckets. During smooth zoom this can make terrain/water/scene jump in 1 percent steps while entities use the current zoom.
- Add an `isCameraInteracting` or `cacheMode` signal from the camera controller.
- During active zoom, either:
  - key static/dynamic caches at exact zoom, with bounded eviction, or
  - bypass cached blits for layers where bucket mismatch is visible, or
  - keep a short-lived exact active-zoom cache and revert to bucketed idle caches after settling.
- Keep asset-load tick and manifest cache version invalidation intact.

Acceptance:

- Smooth zoom does not produce visible terrain/water stepping.
- Cache churn remains within total backing-pixel budget.
- Idle performance remains close to current cached behavior.

Validation:

```bash
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|dense visual|ultrawide"
```

### 7. Make Dynamic Water Cache Pan-Friendly

Priority: P1
Impact: high
Effort: medium
Risk: medium
Council votes: Meitner 16, renderer consensus

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/layers/terrain.ts`
- `tests/perf/sustained-motion.spec.ts`

Implementation notes:

- Static terrain/scene caches use `STATIC_CAMERA_OFFSET_BUCKET` and residual blitting.
- Dynamic water currently uses full camera offset in `cameraCacheKeySegment`, so pan can repaint water overlays every pixel.
- Introduce a dynamic camera cache path with offset bucketing and residual blitting.
- Keep phase bucket invalidation separate from camera bucket invalidation.
- Combine with total pixel-budget eviction from Task 3.

Acceptance:

- Small pans reuse dynamic water cache within the bucket.
- Residual blitting does not shift water overlays relative to terrain.
- Water labels remain above entities and are not accidentally cached below ships.

Validation:

```bash
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|dense visual"
```

### 8. Replace 10 Hz Whole-Layer Water Stepping With Continuous Low-Cost Accents

Priority: P1
Impact: high
Effort: high
Risk: medium-high
Council votes: Locke 24, Boole 12, Meitner water cache vote

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/layers/terrain.ts`
- `src/systems/palette.ts`
- `tests/perf/sustained-motion.spec.ts`
- `tests/visual/pharosville.spec.ts`

Implementation notes:

- The current dynamic water overlay cache updates at 10 Hz. This saves CPU but can look like a slideshow.
- Split water into:
  - static semantic texture and zone feathering that can cache for longer
  - low-cost continuous accents that draw at RAF cadence
- Keep high-salience motion (storm ripples, beam caustics, whitecaps) continuous or at a higher cadence.
- Low-salience texture can remain bucketed or reduce alpha during camera movement.
- Preserve zone theme semantics and reduced-motion static fallback.

Acceptance:

- Normal motion water reads continuously, especially around Warning/Danger/beam areas.
- `test:perf` stays within CI guard budget.
- Reduced motion produces deterministic static water.
- No zone color/theme semantics are changed.

Validation:

```bash
npm test -- src/systems/palette.test.ts
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual|reduced motion|normal motion"
```

### 9. Add A Render-Budget Scheduler For Low-Priority Effects

Priority: P1
Impact: high
Effort: medium
Risk: low-medium
Council votes: Meitner 14, renderer consensus

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/render-types.ts`
- `src/renderer/layers/cinematic-atmosphere.ts`
- `src/renderer/layers/ambient.ts`
- `src/renderer/layers/weather.ts`
- `src/hooks/use-world-render-loop.ts`

Implementation notes:

- Use frame pacing and draw-duration windows to derive a render quality tier:
  - full
  - interaction
  - constrained
  - recovery
- During camera interaction or poor p90 frame times, reduce or skip only low-priority ambience and post effects.
- Never skip analytical cues, selected/focused cues, risk critical cues, hit targets, or detail/accessibility parity.
- Candidate effects to reduce first: film grain, cloud shadow drift, sea mist, sparkles, decorative lights, heavy vignette variants.
- Add debug counts so tests can verify the scheduler is active only when intended.

Acceptance:

- Smoothness improves under camera motion and dense scenes.
- Analytical rendering remains intact.
- Reduced-motion behavior remains deterministic.
- Scheduler never hides selection, water labels, ships, docks, lighthouse, or risk-water semantics.

Validation:

```bash
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|dense visual|reduced motion"
```

### 10. Smooth Compatible Ship State Boundaries

Priority: P0
Impact: high
Effort: medium
Risk: medium
Council votes: Lovelace 22, Meitner 22

Files:

- `src/systems/visual-motion.ts`
- `src/systems/visual-motion.test.ts`
- `src/systems/motion-sampling.ts`
- `src/systems/motion.test.ts`

Implementation notes:

- `visual-motion` should not snap on every state change.
- Define compatible transitions:
  - moored -> departing
  - departing -> risk-drift or sailing
  - risk-drift or sailing -> arriving
  - arriving -> moored
  - ledger orbit -> sailing if the sampled route is continuous
- Keep hard snaps for:
  - ship identity changes
  - large true teleports above explicit threshold
  - route/zone/metadata discontinuities where blending would misrepresent the state
  - reduced motion and static mode
- Maintain separate semantic samples and display samples.

Acceptance:

- Full-cycle display samples have no visible pop at normal state transitions.
- True discontinuities still snap rather than smear across the map.
- Reduced motion returns exact deterministic semantic samples.

Validation:

```bash
npm test -- src/systems/visual-motion.test.ts src/systems/motion.test.ts
npm run test:perf
```

### 11. Add Velocity And Speed To Ship Motion Samples

Priority: P1
Impact: high
Effort: medium
Risk: medium
Council votes: Lovelace 20

Files:

- `src/systems/motion-types.ts`
- `src/systems/motion-sampling.ts`
- `src/systems/visual-motion.ts`
- `src/renderer/layers/ship-pose.ts`
- `src/renderer/layers/ships.ts`
- `src/hooks/use-canvas-resize-and-camera.ts`

Implementation notes:

- Extend `ShipMotionSample` with display or semantic velocity:
  - `velocity: { x: number; y: number }`
  - `speedTilesPerSecond`
  - optional `displayVelocity` if keeping semantic/display separation explicit
- Derive velocity from consecutive displayed samples in visual smoothing, or from route arc-length sampling for semantic samples.
- Use velocity to drive:
  - heading
  - wake intensity
  - follow-selected lead
  - roll/bank/sail flutter
  - debug continuity metrics
- Keep reduced motion velocity zero.

Acceptance:

- Follow-selected no longer estimates velocity from stale tile refs alone.
- Wake and pose scale with actual displayed speed, not only motion state.
- Debug exposes max speed or max display lag for perf tests.

Validation:

```bash
npm test -- src/systems/motion.test.ts src/systems/visual-motion.test.ts src/hooks/use-canvas-resize-and-camera.test.ts
```

### 12. Reproject Selected, Hovered, And Moving Ship Hit Targets From Display Samples

Priority: P0
Impact: high
Effort: medium
Risk: low-medium
Council votes: Lovelace 25, Lorentz 18

Files:

- `src/hooks/use-world-render-loop.ts`
- `src/renderer/hit-testing.ts`
- `src/renderer/layers/selection.ts`
- `src/renderer/geometry.ts`
- `src/renderer/hit-testing.test.ts`
- `tests/visual/pharosville.spec.ts`

Implementation notes:

- Stop using floored tile-cell transitions as the only moving-ship hit-update trigger.
- Recompute at least selected and hovered target rects every frame from the active display sample and active camera.
- Consider updating all map-visible moving ship rects on a screen-pixel delta threshold instead of integer tile threshold.
- Draw selection rings from current-frame geometry, not stale snapshot rectangles.
- Keep relationship overlays, selected rings, follow-selected, and debug `targets` coherent.

Acceptance:

- A selected moving ship's ring stays visually attached within a small pixel tolerance.
- Moving ship click targets follow sub-tile motion.
- No large per-frame rebuild regression in dense fixtures.

Validation:

```bash
npm test -- src/renderer/hit-testing.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|interactions"
```

### 13. Fix Camera-Only Hit Target Re-Entry

Priority: P1
Impact: high
Effort: medium
Risk: medium
Council votes: Lorentz 16

Files:

- `src/renderer/hit-testing.ts`
- `src/pharosville-world.tsx`
- `src/hooks/use-canvas-resize-and-camera.ts`
- `src/renderer/hit-testing.test.ts`

Implementation notes:

- `recomputeHitTargetsForCameraOnly()` iterates the previous snapshot. If previous snapshots cull offscreen entities, panning can fail to re-add entering entities until a full rebuild.
- Keep a base uncullable record list for static entities, or separate:
  - world records
  - viewport-cull/spatial-index target projection
- Moving ships still need display-sample updates from Task 12.
- Preserve selection/hover priority boosts.

Acceptance:

- Panning a previously offscreen dock/area/grave/ship into view makes it selectable without requiring a full world rebuild.
- Camera-only path remains faster than full hit-target rebuild.

Validation:

```bash
npm test -- src/renderer/hit-testing.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "interactions"
```

### 14. Add A Route Epoch And Defer Or Morph Bucket Route Swaps

Priority: P1
Impact: high
Effort: medium-high
Risk: medium
Council votes: Lovelace 18

Files:

- `src/systems/motion-planning.ts`
- `src/systems/motion-sampling.ts`
- `src/systems/motion-types.ts`
- `src/systems/motion.test.ts`
- `src/hooks/use-world-render-loop.ts`

Implementation notes:

- Routes can change on the 10-minute motion bucket. If geometry changes while a ship is in transit, a ship can jump to a new path.
- Add an explicit route epoch/path key to route plans and samples.
- Either:
  - defer path swaps until dwell/moored windows, or
  - morph old display path to new semantic path over a bounded window, or
  - snap only when distance is below an explicit threshold.
- Clear or re-key heading/wake/path segment hints on epoch changes.

Acceptance:

- Bucket flips do not cause visible ship jumps during transit.
- Tests cover dense ships, dockless patrols, squads, ledger routes, titans, unique hulls, and standard ships.
- Route cache hit/eviction telemetry remains healthy after bucket flips.

Validation:

```bash
npm test -- src/systems/motion.test.ts
npm run test:perf
```

### 15. Key Heading And Wake Memory By Route/Path Epoch

Priority: P1
Impact: medium-high
Effort: low
Risk: low
Council votes: Lovelace 10 equivalent, local audit

Files:

- `src/systems/motion-sampling.ts`
- `src/systems/motion-water.ts`
- `src/systems/motion.test.ts`

Implementation notes:

- Current heading and wake memories are keyed by ship id.
- Add path or route epoch into the memory key, or clear memory on epoch/path changes.
- Pair with existing `clearShipWaterSegmentHint(shipId)` behavior so stale segment hints do not survive path swaps.

Acceptance:

- Heading and wake smoothing do not inherit stale direction/intensity across route changes.
- Existing heading smoothness remains intact in normal continuous motion.

Validation:

```bash
npm test -- src/systems/motion.test.ts src/systems/motion-water.test.ts
```

### 16. Add Deterministic Trailing Wakes From Prior Route Samples

Priority: P2
Impact: medium-high
Effort: medium
Risk: low-medium
Council votes: Lovelace 15

Files:

- `src/renderer/layers/ships.ts`
- `src/systems/motion-sampling.ts`
- `src/systems/motion-types.ts`
- `src/renderer/layers/ships.test.ts`

Implementation notes:

- Current wakes are attached accents. A fading trail makes movement read as continuous even at modest speed.
- Avoid mutable history where possible: sample the same deterministic route at `timeSeconds - offset` for effect ships.
- Cap trails to selected/top/recent/effect ships per `MOTION_POLICY.md`.
- Tie alpha/length to `speedTilesPerSecond` and zone roughness.
- Reduced motion should draw static wake equivalent or none, deterministically.

Acceptance:

- Moving selected/top ships show a short fading water trail.
- Wake trails do not exceed effect caps.
- No analytical meaning is introduced beyond existing wake intensity cues.

Validation:

```bash
npm test -- src/renderer/layers/ships.test.ts src/systems/motion.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|reduced motion"
```

### 17. De-Emphasize Discrete Frame-Sheet Animation And Expand Continuous Pose

Priority: P1
Impact: high
Effort: medium
Risk: medium
Council votes: Locke 25

Files:

- `src/renderer/layers/ship-pose.ts`
- `src/renderer/layers/ships.ts`
- `src/renderer/ship-visual-config.ts`
- `src/renderer/layers/ships.test.ts`

Implementation notes:

- Four-frame titan animation can read as flipbook motion even with healthy RAF.
- Keep hull sprites mostly static when needed and use continuous transforms for motion:
  - bob
  - roll
  - yaw/skew
  - sail flutter
  - heading-aware bank
  - wake/spray
- Add small heading-aware roll/flutter for standard hulls, not only titans.
- Keep reduced-motion zeroing.
- Preserve painted-emblem constraints for titan/unique sprites.

Acceptance:

- Ship movement reads continuous without relying on sprite-sheet frame changes.
- Standard hulls gain subtle motion without visual noise.
- Reduced-motion screenshots remain stable.

Validation:

```bash
npm test -- src/renderer/layers/ships.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|reduced motion|dense visual"
```

### 18. Replace Binary Moored Visibility With Bounded Visibility Fades

Priority: P2
Impact: medium
Effort: medium
Risk: medium
Council votes: Lovelace 8 equivalent

Files:

- `src/systems/motion-types.ts`
- `src/systems/motion-sampling.ts`
- `src/systems/motion.ts`
- `src/renderer/layers/ships.ts`
- `src/renderer/hit-testing.ts`
- `src/systems/motion.test.ts`

Implementation notes:

- Non-titan, non-unique ships are hidden while moored to rotate map-visible ship load.
- Add `mapVisibilityAlpha` or a similar display-only value so ships fade during cast-off/berth arrival rather than appearing/disappearing instantly.
- Hit testing should still obey semantic visibility:
  - below an alpha threshold, not targetable
  - selected/focused ship may stay visible enough for continuity if policy allows
- Keep dense map load bounded.

Acceptance:

- Non-titan mooring transitions do not pop.
- Dense fixture still rotates visible load and does not expose hidden moored ships as active hit targets.
- Reduced motion remains deterministic and all ships visible where current policy requires.

Validation:

```bash
npm test -- src/systems/motion.test.ts src/renderer/hit-testing.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual|normal motion|reduced motion"
```

### 19. Pre-Render Water Labels Into Retained Bitmaps

Priority: P1
Impact: medium-high
Effort: medium
Risk: low-medium
Council votes: Meitner 18, Locke 16

Files:

- `src/renderer/layers/water-labels.ts`
- `src/renderer/world-canvas.ts`
- `src/systems/area-labels.ts`
- `src/renderer/hit-testing.ts`
- `tests/visual/pharosville.spec.ts`

Implementation notes:

- Water labels redraw every frame with plaque paths and text.
- Cache each label as an offscreen bitmap keyed by:
  - area id
  - label text
  - terrain label theme
  - chrome style
  - zoom bucket
  - reduced-motion does not need a separate bitmap unless style changes
- Draw cached label bitmaps above entities as now.
- Keep hit targets independent and aligned with label placement.

Acceptance:

- Label visual output is unchanged in snapshots.
- Label draw cost is removed from steady per-frame CPU work.
- Labels still render above ships and their hit targets win inside label rectangles.

Validation:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "named risk water|dense visual"
npm run test:perf
```

### 20. Precompose Ship Sprite, Sail Tint, Livery Trim, And Static Accents

Priority: P2
Impact: medium-high
Effort: medium-high
Risk: medium
Council votes: Locke 10 equivalent

Files:

- `src/renderer/layers/ships.ts`
- `src/renderer/ship-sail-tint.ts`
- `src/renderer/canvas-primitives.ts`
- `src/renderer/layers/ships.test.ts`

Implementation notes:

- Sprite ships currently draw base image, tint, trim, and identity accents in the body pass.
- For non-selected and non-hovered ships, cache a precomposed image by:
  - asset id
  - livery/tint key
  - trim key
  - scale/zoom bucket if rasterized at display size
- Keep dynamic pose transforms outside the precomposition so bob/roll/yaw stay continuous.
- Do not precompose elements that must change with selection, hover, night, wake, or data state.

Acceptance:

- Sprite output is visually identical at common zooms.
- Cache memory is counted in total offscreen pixel budget.
- Sail tint tests continue to pass.

Validation:

```bash
npm test -- src/renderer/layers/ships.test.ts src/renderer/ship-sail-tint.test.ts
npm run test:perf
```

### 21. Move Truly Static Scenery Into Static Caches And Isolate Animated Props

Priority: P2
Impact: high
Effort: medium-high
Risk: medium
Council votes: Meitner 18 equivalent

Files:

- `src/renderer/world-canvas.ts`
- `src/renderer/layers/scenery.ts`
- `src/renderer/layers/docks.ts`
- `src/renderer/layers/ambient.ts`
- `src/renderer/layers/cinematic-atmosphere.ts`

Implementation notes:

- Audit draw passes for scenery and decorative elements that do not depend on `motion.timeSeconds`, selected/hovered state, nightFactor, or camera interaction.
- Move static candidates into `paintStaticScenePass`.
- Keep animated lamps, flags, wake, selected chrome, weather, and risk cues in dynamic passes.
- Consider a later two-canvas static/dynamic split only after telemetry proves full-layer blits are the bottleneck.

Acceptance:

- Static scenery does not redraw every frame.
- Animated props still animate at intended cadence.
- Layer ordering remains correct: ships over backgrounded docks, water labels above entities, selection last.

Validation:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell|dense visual|normal motion"
npm run test:perf
```

### 22. Cache Expensive Fullscreen And Post-Effect Patterns

Priority: P2
Impact: medium
Effort: low-medium
Risk: low
Council votes: Meitner 8 equivalent

Files:

- `src/renderer/layers/cinematic-atmosphere.ts`
- `src/renderer/layers/night-tint.ts`
- `src/renderer/layers/ambient.ts`
- `src/renderer/world-canvas.ts`

Implementation notes:

- Audit film grain, scanlines, cloud shadows, atmospheric fade, moon reflection, and vignette for repeated gradient/pattern work.
- Cache reusable patterns/gradients/tiles by DPR, size bucket, night factor bucket, and palette key.
- During camera interaction or constrained render tier, prefer lower-frequency or lower-alpha post effects.
- Keep reduced motion stable and deterministic.

Acceptance:

- Fullscreen/post effects no longer dominate draw duration at high DPR.
- Visual snapshots remain within reviewed tolerance.
- Cache memory is included in total offscreen budget.

Validation:

```bash
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "dawn|dusk|night|dense visual"
```

### 23. Make Debug And Metric Windows Allocation-Light

Priority: P2
Impact: medium
Effort: low
Risk: low
Council votes: Meitner 6 equivalent

Files:

- `src/hooks/use-world-render-loop.ts`
- `src/systems/canvas-budget.ts`
- `src/hooks/use-world-render-loop.test.tsx`

Implementation notes:

- Current rolling stats sort/copy arrays to compute percentiles.
- Keep a bounded ring buffer, but avoid per-frame array allocation in production paths.
- Options:
  - compute sorted percentiles only every N frames
  - maintain a small histogram
  - compute debug-only expensive stats only when visual debug is enabled
- Do not remove metrics needed by `test:perf`.

Acceptance:

- Frame pacing and DPR telemetry remain available.
- No long-task or GC pressure from telemetry itself.
- Tests still assert frame pacing fields.

Validation:

```bash
npm test -- src/hooks/use-world-render-loop.test.tsx src/systems/canvas-budget.test.ts
npm run test:perf
```

### 24. Slice Deferred Asset Loading And Path Warming Across Idle Chunks

Priority: P2
Impact: medium
Effort: low-medium
Risk: low
Council votes: Locke 8 equivalent

Files:

- `src/hooks/use-asset-loading-pipeline.ts`
- `src/renderer/asset-manager.ts`
- `src/systems/motion-water.ts`
- `src/systems/motion.test.ts`

Implementation notes:

- Current deferred path can warm all water paths and load deferred assets after first critical paint.
- Chunk path warming and deferred asset starts through `requestIdleCallback` or a small scheduler with a timeout fallback.
- Keep critical assets first and preserve first-frame coherence.
- Preserve route-cache statistics and do not starve deferred sprites indefinitely.

Acceptance:

- First interactive frames do not suffer from deferred warming/loading spikes.
- Deferred assets still settle quickly under normal conditions.
- Asset load stats and errors remain visible in debug.

Validation:

```bash
npm test -- src/systems/motion.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell|dense visual"
```

### 25. Add Camera And Temporal Smoothness Playwright Scenarios

Priority: P0
Impact: high
Effort: medium
Risk: low
Council votes: Boole 15, Meitner benchmark must-have, Lorentz validation

Files:

- `tests/perf/sustained-motion.spec.ts`
- `tests/visual/pharosville.spec.ts`
- `docs/pharosville/TESTING.md`
- `docs/pharosville/SCENARIO_CATALOG.md`

Implementation notes:

- Add browser tests for temporal behavior, not only snapshots:
  - 10 to 30 seconds idle normal motion
  - drag pan
  - wheel zoom
  - pinch-equivalent pointer zoom
  - follow-selected for a moving ship
  - resize while selected or following
- Assertions should read debug fields and sampled target/camera positions.
- Suggested assertions:
  - frame interval p90 and dropped bursts within tier budget
  - camera target/display delta converges
  - zoom is monotonic
  - pointer focal tile remains stable during zoom
  - selection ring remains attached to selected moving ship
  - no world runtime fetch below desktop gate
- Keep visual snapshot updates separate and reviewed.

Acceptance:

- Smoothness regressions fail tests before users see a slideshow effect.
- Tests distinguish CI-safe guardrail from local-smooth target.
- Docs list the new commands and scenario expectations.

Validation:

```bash
npm run test:perf
npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|normal motion|reduced motion|ultrawide"
npm run validate:docs
```

## Recommended Sequencing

Wave A - make the current baseline measurable:

1. Task 1: land/reconcile current smoothening pass.
2. Task 2: frame-pacing perf gates.
3. Task 3: total canvas/offscreen pixel telemetry.
4. Task 25: camera and temporal Playwright scenarios.

Wave B - fix the biggest visible motion seams:

1. Task 4: single camera controller.
2. Task 5: continuous wheel/pinch zoom.
3. Task 10: compatible ship state-boundary smoothing.
4. Task 12: per-frame selected/hovered/moving hit-target projection.
5. Task 13: camera-only hit target re-entry.

Wave C - remove renderer quantization:

1. Task 6: active-zoom cache policy.
2. Task 7: pan-friendly dynamic water cache.
3. Task 8: continuous water accents.
4. Task 9: render-budget scheduler.

Wave D - improve natural motion and polish:

1. Task 11: velocity/speed samples.
2. Task 14: route epoch and bucket swap contract.
3. Task 15: route-keyed heading/wake memory.
4. Task 16: deterministic trailing wakes.
5. Task 17: continuous pose instead of frame-sheet reliance.
6. Task 18: berth visibility fades.

Wave E - reduce steady-state draw cost:

1. Task 19: pre-render water labels.
2. Task 20: precompose ship sprite/tint/trim.
3. Task 21: move static scenery into static caches.
4. Task 22: cache fullscreen/post effects.
5. Task 23: allocation-light metrics.
6. Task 24: idle-chunk deferred loading and path warming.

## Definition Of Done For The Smoothness Program

Do not claim the broad smoothness goal is done until all are true:

- Normal motion uses one route-owned RAF and no independent analytical RAF loops.
- Reduced motion reports `activeMotionLoopCount === 0` and has deterministic static samples.
- `npm run test:perf` gates frame pacing, draw duration, long tasks, and route/cache health.
- Local smooth tier at `1440x960` reaches `effectiveFps >= 50`, `framePacing.p90Ms <= 24`, and `longestDroppedBurst <= 1` after warmup.
- Camera drag, wheel zoom, pinch zoom, follow-selected, and resize are covered by Playwright temporal tests.
- Selected/hovered ship hit targets and rings track display samples at sub-tile precision.
- Main plus offscreen backing pixels stay within `MAX_TOTAL_BACKING_PIXELS`.
- Dynamic water no longer visibly updates as a 10 Hz slideshow in salient areas.
- All visual changes pass screenshot review before baseline updates.

