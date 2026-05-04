# Performance Audit

## Summary

PharosVille achieves solid runtime performance with thoughtful per-frame budgeting and spatial caching. The codebase demonstrates strong fundamentals: adaptive DPR scaling, ship LOD culling, hit-target incremental updates, and frame-cache WeakMap patterns avoid unnecessary allocations. However, six optimization opportunities remain in hot paths: unnecessary vector normalizations in water sampling, unshared Path2D objects in terrain rendering, per-frame string allocations in water texture dispatch, redundant geometry re-projections on camera-only updates, allocation thrash in hit-target snapshot creation, and a missing memoization boundary in the React component tree.

## Findings

### F1: Repeated vector normalizations in water path interpolation
- **Where:** `src/systems/motion-water.ts:111-143` (`sampleShipWaterPathInto`)
- **Impact:** Every water path sample (per-ship per-frame) normalizes heading vectors via `normalizeHeadingInto()`. With ~100 ships, this is ~100 sqrt/normalize calls per frame that could be cached or omitted when only position is needed.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Profile `sampleWaterPath` call sites to identify whether all normalize. Add a `headingOnly?: boolean` parameter to skip normalization when sampled heading will be overwritten or not used.

### F2: Per-tile Path2D allocations in terrain water-overlay rendering
- **Where:** `src/renderer/layers/terrain.ts:275-309` (`drawWaterTileOverlay`), specifically lines 297-307 where `ctx.beginPath()` / `ctx.moveTo()` / `ctx.lineTo()` / `ctx.stroke()` is called per visible water tile without Path2D caching
- **Impact:** Each visible water tile (easily 200+ per frame) rebuilds two path objects (wave line, accent line). Path2D reuse or pre-computed diamond geometry reduces allocations.
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Cache diagonal/accent wave paths as module-scope Path2D objects (keyed by zoom bucket), or inline the beginPath/moveTo/lineTo calls into a shared geometry helper that avoids re-creating primitives.

### F3: Per-tile string allocations in water texture renderer dispatch
- **Where:** `src/renderer/layers/terrain.ts:437-449` (`drawWaterTerrainTexture`), line 447: `WATER_TEXTURE_RENDERERS[theme.texture]` is a Partial record lookup that allocates theme.texture as a key on each tile
- **Impact:** ~200 visible water tiles per frame each trigger a texture-kind lookup; the theme object is created per-tile inside terrain rendering. String table lookups are cheap but the theme object creation is not.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Cache the theme per tile-kind once at the scene level, or pass it directly from `zoneThemeForTerrain()` result rather than re-deriving.

### F4: Redundant per-entity geometry re-projections on camera-only hit-target updates
- **Where:** `src/renderer/hit-testing.ts:198-239` (`recomputeHitTargetsForCameraOnly`), lines 210-216: every entity record rebuilds `resolveEntityGeometry()` even though only the screen rect projection changed
- **Impact:** Hit-target updates during pan/zoom (every pointer move) re-project all non-ship entities (docks, lighthouse, areas) that haven't moved. With ~30 static entities, this is ~30 redundant geometry calculations per camera update.
- **Effort:** mid
- **Reward:** mid
- **Fix sketch:** Add a `recomputeHitTargetsForCameraOnly_Fast()` variant that skips `resolveEntityGeometry()` when the entity hasn't moved. Cache the targetRect projection separately from the full geometry so only screen-space rect updates are needed.

### F5: Hit-target snapshot mutation thrash in `updateHitTargetSnapshotShips`
- **Where:** `src/renderer/hit-testing.ts:241-362`, lines 264-276: Map cloning and record re-insertion on every ship change triggers multiple `new Map()` allocations and member re-insertion
- **Impact:** When many ships change position each frame (typical motion), the snapshot mutation codepath allocates a clone of recordsById (potentially 500+ entries), then re-inserts changed records. In dense fixture (100+ ships), this is significant per-frame churn.
- **Effort:** mid
- **Reward:** mid
- **Fix sketch:** Defer Map cloning until first write (`copy-on-write` pattern already partially used). Use an immutable-style `recordsById.set()` chain instead of cloning once, or batch the changed ships before cloning and reinserting to minimize allocations.

### F6: PharosVilleDesktopData is not memoized, triggering full re-renders on refetch
- **Where:** `src/pharosville-desktop-data.tsx:7-20` (entire component)
- **Impact:** When TanStack Query refetches data and returns the same world object (structural cache), the unmemorized `PharosVilleDesktopData` component re-renders, passing the (unchanged) `world` prop to `PharosVilleWorld`. Although `PharosVilleWorld` is memoized, the intermediate render crossing the boundary wastes a React render pass.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Wrap `PharosVilleDesktopData` in `memo()` with a structural comparison of `{ world, error, hasRenderableData }`, or use `useMemo()` to stabilize the return JSX.

### F7: Beam caustic gradient allocation on every frame (minor)
- **Where:** `src/renderer/layers/terrain.ts:358-408` (`drawBeamCaustic`), lines 393-396: `ctx.createRadialGradient()` is called per visible tile even though gradient color stops are cached
- **Impact:** Gradient object allocation is not free; with ~200 visible water tiles and a cached stop lookup, ~200 gradient objects are created per frame. The color stops are LRU cached (lines 378-392) but the gradient itself is not.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Cache the full gradient in the same LRU as the stops, keyed by `(stopKey, x, y, radius)`. Reuse gradient objects when possible (e.g., when rendering multiple tiles with the same zoom/alpha bucket).

### F8: Absence of Path2D caching for repeated geometric primitives in ship rendering
- **Where:** `src/renderer/layers/ships.ts:680-730` (contact shadow, titan hull foam, mooring details), lines 684-785: each ship draws ellipses, paths, and curves via direct ctx calls without Path2D
- **Impact:** When many ships are visible (~50+), repeated ellipse and quadratic-curve path construction per ship accumulates. Ship shadows and titan details are drawn per-ship per-frame.
- **Effort:** mid
- **Reward:** low
- **Fix sketch:** Pre-compute common ship geometric patterns (shadow ellipse, foam arcs, mooring rope curves) as Path2D templates keyed by (scale, pose). Reuse via `ctx.stroke(path)` instead of rebuilding.

### F9: Motion sampling `routeSamplingRuntimeCache` is WeakMap but routes are stable, allowing missed cache reuse
- **Where:** `src/systems/motion-sampling.ts:27-87`, line 27: `routeSamplingRuntimeCache` is keyed by route object, but routes are stable across frames and the cache is never evicted
- **Impact:** Low impact (routes are stable and rarely change), but the WeakMap introduces a lookup indirection. Since routes are tied to the motion plan lifetime (which is stable per motion bucket), a direct Map keyed by `shipId` or a `route.id` would be faster.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Replace WeakMap with a plain Map keyed by `route.shipId`, or attach a cached `runtime` field directly to the route object (if route is mutable).

### F10: Water path binary search in `waterPathSegmentIndex` runs per sample
- **Where:** `src/systems/motion-water.ts:104-143` (per-ship per-frame), specifically line 134: `waterPathSegmentIndex(path.cumulativeLengths, distance)` performs a binary search for every ship sample
- **Impact:** With ~100 ships and typical path lengths of 20-50 segments, this is ~100 binary searches per frame. The search is O(log N) but can be further optimized by caching the last-searched index per ship when progress is monotonically increasing (typical during animation).
- **Effort:** mid
- **Reward:** low
- **Fix sketch:** Cache `(shipId, lastProgressIndex)` in `headingMemoryByShipId` (which already tracks per-ship state). If the next frame's progress is near the last progress, start the binary search from the cached index instead of 0.

### F11: useLatestRef hook pattern avoids rebinding but creates multiple useEffect cycles
- **Where:** `src/pharosville-world.tsx:56-58` (useLatestRef for hoveredDetailIdRef, selectedDetailIdRef, motionPlanRef)
- **Impact:** Each `useLatestRef` call is a separate effect that synchronously updates the ref. With 3+ refs, this adds 3+ effect cleanup/setup cycles per render. Not a major perf issue but adds to React overhead.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Batch useLatestRef updates into a single effect that updates all refs together, or use a single `useCallback` wrapper that reads the latest state from closure.

## Notes from Prior Work

The 2026-05-02 performance pass (`agents/2026-05-02-performance-pass.md`) optimized asset manager `getLoadStats()` from `0.003022 ms/call` to `0.000123 ms/call` (24× speedup) by caching stats computation in `asset-manager.ts` and `world-canvas.ts`. This audit did not identify regressions in that work; the cache invalidation strategy remains sound and the build output stayed within budget.

## Recommended Priority

1. **F1 + F2** (terrain rendering): Low effort, mid reward. Consolidate water-tile path/gradient allocations.
2. **F4** (hit-target camera-only updates): Mid effort, mid reward. Speeds up interactive pan/zoom significantly.
3. **F5** (hit-target snapshot mutation): Mid effort, mid reward. Reduces per-frame allocation churn in ship motion.
4. **F6** (React component memoization): Low effort, low reward but improves component-tree hygiene.
5. **F3, F7-F11**: Nice-to-have micro-optimizations; defer unless sustained profiling indicates they are in the hot path.
