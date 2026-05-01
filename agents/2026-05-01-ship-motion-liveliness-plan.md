# Ship Motion + Pathing — Top 15 Liveliness & Performance Plan

Date: 2026-05-01
Scope: stablecoin-ship movement, pathing, and squad cohesion across `src/systems/motion-*`, `src/systems/seawall.ts`, `src/renderer/layers/ship-pose.ts`, the RAF loop in `src/pharosville-world.tsx`.
Companion to: `agents/2026-05-01-need-for-speed-implementation-plan.md` (broader perf audit).

Each item is implementation-ready: anchor, problem, fix, success check, expected impact, effort. Items intentionally exclude things already shipped on this branch (A\* heap + reused buffers in `motion-water.ts`, `motionPlanSignature` introduction, `useMemo` plan gating, `flagshipById` plumbed in `ShipRenderFrame`, seawall distance mask).

Liveliness items focus on perceived motion smoothness and squad presence. Perf items are scoped to the ship motion + pathing surface only — not general renderer hot path.

---

## Tier A — Highest impact (do first)

### 1. Memoize `motionPlanSignature` on a `WeakMap<world, string>` `[size: S, impact: HIGH]` `Q`
- **Anchor:** `src/pharosville-world.tsx:93` (`const baseMotionPlanSignature = motionPlanSignature(world);`); `src/systems/motion-planning.ts:21-50`.
- **Problem:** `motionPlanSignature` runs on every render of `PharosVilleWorldInner` *before* `useMemo` gates anything — unconditionally. It does `[...world.ships].sort(...)`, per-ship `[...ship.dockVisits].sort(...)`, builds N+M+1 string arrays, and `.join`s them. With ~150 ships × ~5 dock visits each, that's ~1000 sort comparisons + ~1000 transient strings every render (incl. hover, selection, paint-tick). The function exists specifically to cheapen plan invalidation, but it is itself uncached.
- **Fix:**
  1. Add `const signatureByWorld = new WeakMap<PharosVilleWorld, string>();` inside `motion-planning.ts`.
  2. `motionPlanSignature(world)` returns the cached value if present; else compute and store. World identity is stable across re-renders for the same TanStack payload, so the WeakMap will hit on every paint-tick / hover / selection.
- **Verify:** Existing `motionPlanSignature` tests still pass; add one that calls it twice on the same world reference and asserts `===` on the cached return.
- **Impact:** Removes ~ms-scale string-sort work from the React render path entirely; `useMemo` short-circuits cleanly.
- **Effort:** ~10 lines.

### 2. Reuse the flagship's sample for consorts within a frame `[size: S, impact: HIGH]`
- **Anchor:** `src/systems/motion-sampling.ts:102-122`; `src/pharosville-world.tsx:988-1006` (`collectShipMotionSamples`).
- **Problem:** Every consort runs `sampleRouteCycle(flagshipRoute, timeSeconds)` from scratch inside `resolveShipMotionSample`. Sky has 2 consorts + 1 flagship, Maker has 1 consort + 1 flagship — so the Sky flagship route is sampled 3× per frame, Maker 2×. Each `sampleRouteCycle` does the full phase math, water-path binary search, and lane/mooring blending — all redundant. The flagship's *result* is also already in the in-frame `samples` Map (the caller iterates `world.ships` which lists flagships first by squad-build order, but the Map is filled as the loop runs).
- **Fix:**
  1. Iterate `STABLECOIN_SQUADS` flagships first inside `collectShipMotionSamples` and write their samples to the Map.
  2. In a second pass over `world.ships`, when the ship is a `consort` whose flagship's sample is already in the Map, derive the consort sample by translating the flagship's `tile` by the precomputed formation offset (see #13) — skip `sampleRouteCycle` altogether.
  3. Update `resolveShipMotionSample`'s consort branch to accept an optional `flagshipSample` shortcut, falling back to the existing path for tests/standalone callers.
- **Verify:** `motion.test.ts` consort tests assert identical positions vs. baseline; new test asserts `sampleRouteCycle` is called once per squad (spy via vitest).
- **Impact:** ~3× fewer route-cycle samplings per frame for squads (small N but each is non-trivial); also tightens cohesion (no float drift between two independent computations of the same flagship cycle).
- **Effort:** ~30 lines + test.

### 3. Mutate `ShipMotionSample` in place — stable per-ship sample objects `[size: M, impact: HIGH]`
- **Anchor:** `src/systems/motion-sampling.ts:76-526`; `src/pharosville-world.tsx:988-1006`.
- **Problem:** `resolveShipMotionSample` returns a fresh top-level object literal on every code path; helpers (`transitSample`, `mooredSample`, `riskDriftSample`, `openWaterPatrolSample`, `applyMooringBlend`, `transitLanePoint`, `clampMotionTile`, `sampleShipWaterPath`) each allocate inner `tile` and `heading` `{x,y}` literals. With ~150 ships × 60 fps that's ~30k+ transient objects per second from this layer alone (ship sample + tile + heading + intermediate). GC churn shows up as occasional jank during heavy data refreshes.
- **Fix:**
  1. Promote sample storage to a `WeakMap<ShipNode, MutableShipMotionSample>` (or reuse `currentShipMotionSamplesRef.current`'s entries). Each ship gets a stable object whose `tile.x`, `tile.y`, `heading.x`, `heading.y`, `state`, `wakeIntensity`, etc. are reassigned in place.
  2. Convert internal helpers to "out-parameter" form: `transitSample(out, …)`, `mooredSample(out, …)` writing into the passed sample. Replace `return { … }` with field assignment.
  3. Have `sampleShipWaterPath` write into a passed scratch `{point, heading}` instead of returning a new object. Promote two module-level scratch objects in `motion-water.ts` for `point` / `heading`.
  4. `clampMotionTile` becomes `clampMotionTileInto(sample, x, y)` so it writes into `sample.tile`.
- **Verify:** `motion.test.ts` still green; add a test that asserts the same Map entry reference is reused across two consecutive `collectShipMotionSamples` calls.
- **Impact:** Eliminates the bulk of frame allocations from the systems layer; pairs well with task #6 of the broader plan (ship render hot path) so the entire data path becomes alloc-free per frame.
- **Effort:** ~120 lines, mostly mechanical.
- **Dependency:** Land #2 first to avoid two waves of API churn through `resolveShipMotionSample`.

### 4. Per-ship heading low-pass filter — kill segment-boundary "twitch" `[size: M, impact: HIGH]` `LIVELINESS`
- **Anchor:** `src/systems/motion-water.ts:97-115` (`sampleShipWaterPath`); `src/systems/motion-sampling.ts:264-275, 319-385` (consumer sites that bake heading into the sample).
- **Problem:** `sampleShipWaterPath` returns the *current path segment's* tangent. At every internal waypoint vertex the heading instantly snaps — visibly noticeable when a ship rounds a coast bend or crosses a detour waypoint, especially since A\* paths are 4-connected and zig-zag. The renderer feeds heading into `headingBasis`, banking, and wake direction, so the snap propagates everywhere.
- **Fix:**
  1. Add `previousHeading: { x: number; y: number }` to the in-place sample object (see #3).
  2. After computing the raw segment heading, low-pass filter against the previous frame's value: `h = lerp(prev, raw, 1 - exp(-dt / TAU))` with `TAU ≈ 0.18s` for transit, `0.06s` for arriving (sharper turn-in to mooring) — pick from a small map keyed by `state`.
  3. Re-normalize after lerp; clamp `dt` to `[0, 0.1]` to avoid post-tab-resume snap (visibility handler already drops resume dt, but defense-in-depth is cheap).
  4. Fall back to the raw heading on the first frame (no `previousHeading`) and on `reducedMotion` (deterministic snapshot path).
- **Verify:** Visual baseline diff under tolerance for one transit frame; new unit test feeds a path with a 90° vertex and asserts heading change between two adjacent frames is bounded.
- **Impact:** The single most visible liveliness improvement: ships sweep through corners instead of snapping. Costs ~3 multiplies + 1 sqrt per ship per frame (after #3 lands).
- **Effort:** ~40 lines + test.

### 5. Speed-aware wake intensity — wake fades at transit endpoints `[size: S, impact: HIGH]` `LIVELINESS` `Q`
- **Anchor:** `src/systems/motion-sampling.ts:264-275` (`transitSample` returns `wakeIntensity: transitWakeIntensityForZone(zone)`).
- **Problem:** Transit progress is already a `smoothstep` (slow at start, fast in the middle, slow at end), so ships visibly accelerate and decelerate — but the wake stays at full zone-determined intensity for the entire transit, including the slow tail-in to a dock and the slow tail-out from one. Visually wrong (full wake at zero speed) and wastes the renderer's wake budget on stationary boats.
- **Fix:** Multiply the per-zone constant by a parabolic envelope of progress: `wakeIntensity = base * 4 * progress * (1 - progress)`. Apply only to `state === "departing" | "arriving"`; keep `"sailing"` (open-water patrol) at full intensity since those are mid-leg by construction. Optionally for arriving, weight the parabola toward earlier progress (`progress^0.6 * (1 - progress)`) so the bow wake is still visible as the ship approaches.
- **Verify:** Visual snapshot of a docking sequence at progress 0.05 / 0.5 / 0.95 shows attenuated → full → attenuated wake.
- **Impact:** High; addresses the "ghost wake" on parked-but-still-rendered ships and frees wake-budget slots for actually-moving titans.
- **Effort:** ~5 lines.

### 6. Lane-curve aware heading (forward-difference) `[size: S, impact: MED]` `LIVELINESS`
- **Anchor:** `src/systems/motion-sampling.ts:304-317` (`transitLanePoint`); `:252-275` (`transitSample`).
- **Problem:** `transitLanePoint` shifts the position perpendicular to the path tangent by `sin(progress*PI)*laneMagnitude`, producing an S-curved lane offset. But `heading` is still the *path* tangent — so ships visibly "crab" sideways during the lane-bulge, like a car drifting without steering. The lane curve is mild but the visual mismatch is noticeable on longer transits.
- **Fix:** In `transitSample`, compute heading from a forward-difference of two lane-displaced samples: call `transitLanePoint` at `progress` and `progress + 1/path.totalLength * 0.5`, then heading = `normalize(p2 - p1)`. Cache the second sample call's result if profiling shows the cost mattering (it's two binary searches).
- **Verify:** Visual snapshot during a long transit shows ship's bow pointing along the lane curve, not the straight path.
- **Impact:** Modest but visible on coastal transits where the lane swings widest. Pairs with #4 — the smoothing already softens the heading, but lane-curve heading gives the *correct* vector to smooth toward.
- **Effort:** ~15 lines.

### 7. Bank/roll into turns — wire heading delta into `rollRadians` `[size: S, impact: MED]` `LIVELINESS`
- **Anchor:** `src/renderer/layers/ship-pose.ts:81-91` (titan transit branch); `src/systems/motion-sampling.ts` (sample shape).
- **Problem:** Only titans get `headingLean = (heading.x - heading.y) * 0.32` baked into `rollRadians` — and that's a static lean from the heading direction, not from *change* in heading. Real boats heel into the turn. Currently a ship sweeping around a coastal bend stays visually flat.
- **Fix:**
  1. Extend the in-place sample (task #3) with `headingDelta: number` — angular velocity in rad/sec, computed alongside the heading low-pass (#4).
  2. In `resolveShipPose`'s titan transit branch add `+ clamp(headingDelta * BANK_GAIN, -BANK_MAX, BANK_MAX)` to `rollRadians`. Tune `BANK_GAIN ≈ 0.18`, `BANK_MAX ≈ 0.06 rad`.
  3. Optionally extend to non-titan ships at a smaller gain — cheap and adds presence.
- **Verify:** Visual snapshot mid-turn shows visible roll into the turn; straight-line transit shows no extra roll.
- **Impact:** A hallmark of AAA-style boat animation. With #4 + #6 in place, this completes the turning-feels-alive triplet.
- **Effort:** ~15 lines.

### 8. Squad ambient phase offsets — break formation rigidity `[size: S, impact: MED]` `LIVELINESS` `Q`
- **Anchor:** `src/systems/motion-sampling.ts:106-122` (consort sample derived from flagship tile + integer offset); `src/renderer/layers/ship-pose.ts:75-79` (per-ship `seedPhase`).
- **Problem:** Consorts shadow the flagship's sample with an *integer* offset (no sub-tile drift), and `ship-pose.ts` already uses a `stableUnit(shipId)`-derived phase for sea/swell — so per-ship bob already differs. But the *formation tile* is rigid: consorts visually look glued to the flagship across all motion phases, including transit lane-curve, where the flagship is sin-modulated and consorts merely translate.
- **Fix:** When deriving the consort sample (task #2), add a per-consort sub-tile breathing perturbation: `dx += sin(t * 0.31 + phase) * 0.18`, `dy += cos(t * 0.27 + phase * 1.1) * 0.14` where `phase = stableUnit(shipId * "formation-breath") * TWO_PI`. Apply only when the flagship state is not `"moored"` (avoid jiggling docked formations).
- **Verify:** Visual baseline shows squads with subtle relative motion during transit; moored formations remain pin-still.
- **Impact:** Squads look like a fleet, not a sprite-sheet rosette. Cheap + dramatic.
- **Effort:** ~20 lines.

### 9. Moored heading anchored to dock tangent `[size: M, impact: MED]` `LIVELINESS`
- **Anchor:** `src/systems/motion-sampling.ts:388-411` (`mooredSample`), `:477-500` (`mooredRouteStopSample`).
- **Problem:** Moored ships' heading is `normalizeHeading({-sin(angle), cos(angle*0.9)})` — a Lissajous curve. Result: docked ships visually rotate through every direction over ~4 minutes, including pointing *into the dock*. Real boats moor with bow into dominant current, perturbed by sea state. The current heading is convincing only because the rotation is slow.
- **Fix:**
  1. At route build time, compute and cache `dockTangent` per `dockStop`: the unit vector from `mooringTile` toward the *dock tile* (or the seawall barrier direction if dockTile not nearby) — this is the natural mooring orientation.
  2. In `mooredSample` / `mooredRouteStopSample`, set `heading = normalize(dockTangent + perturbation)` where `perturbation = (sin(angle)*0.08, cos(angle*0.9)*0.08)`. The unnormalized sum yields a small sway around the dock-aligned axis.
  3. Use `route.dockStops[i].dockTangent` for typed lookup; fall back to current Lissajous when dockTangent is null.
- **Verify:** Visual snapshot of moored ships at a dock shows all bows sweeping in a narrow arc around the dock-perpendicular instead of pointing into the wall.
- **Impact:** Dock visits stop looking like the boat lost its captain. Especially noticeable around the harbor cluster where many boats moor side-by-side.
- **Effort:** ~40 lines (route-build computation + helper to derive tangent).

### 10. A\* with diagonal neighbors (8-connected) + admissible heuristic `[size: M, impact: HIGH]` `PATH QUALITY`
- **Anchor:** `src/systems/motion-water.ts:208-209` (`NEIGHBOR_DX`/`NEIGHBOR_DY`), `:266-312` (`findWaterPath`), `:282, 307` (heuristic).
- **Problem (two-fer):**
  1. **Visual:** A\* is 4-connected, so paths are always L-shaped staircases through diagonal water. Renderer's `transitLanePoint` partly hides this, but on long open-water legs the zigzag is visible — and `detourWaterWaypoints` exists *specifically* to mask it by injecting bends. With diagonals the path itself becomes naturalistic and the detour layer can shrink.
  2. **Algorithmic:** The heuristic is `manhattan(x, y)` but `waterPathCost` returns `Math.max(0.72, ...)` — minimum step cost is 0.72, not 1. So the heuristic *can overestimate* and A\* may return suboptimal paths through warning/storm tiles when the optimal route goes through ledger water.
- **Fix:**
  1. Switch neighbor arrays to 8-connected: add the four diagonals, with cost multiplier `Math.SQRT2`. Reject diagonals where either of the two cardinal "corner" tiles is non-water/seawall (prevents cutting through coast corners).
  2. Switch heuristic to **octile distance scaled by minimum step cost**:
     `h = MIN_STEP_COST * (max(dx, dy) + (Math.SQRT2 - 1) * min(dx, dy))` with `MIN_STEP_COST = 0.72`.
  3. Update `reconstructPath` (no change needed — `previous[]` already records arbitrary parent indices).
  4. Bump heap buffer size guard from `mapSize * 4` → `mapSize * 8` (8-neighbor relaxations).
- **Verify:**
  - Existing pathfinding tests: paths still found, lengths within tolerance.
  - New test: A\* through a diagonal-only obstacle yields a strictly shorter route than 4-connected baseline.
  - Visual: open-water transit traces look like ship lanes, not pixel staircases.
- **Impact:** Prettier paths *and* the algorithm becomes admissibly correct. May also let us drop or weaken `detourWaterWaypoints` in a follow-up.
- **Effort:** ~50 lines + new test.

### 11. Numeric path keys — drop `pathKey()` string allocations `[size: S, impact: MED]` `Q`
- **Anchor:** `src/systems/motion-utils.ts:1-3` (`pathKey`); `src/systems/motion-water.ts:27, 87-88`; `src/systems/motion-planning.ts:185-189`; `src/systems/motion-sampling.ts:54-56` (used by `routeSamplingRuntime`).
- **Problem:** `pathKey` builds a string `"x.y->x.y"` for every cache lookup and every `LazyShipWaterPathMap` builder install. On a 56×56 map with ~30 ships × ~5 stops × 2 directions = ~300 keys built every plan rebuild, plus internal lookups. Each key is ~15 chars × allocation. The cache map (string→path) also pays string-hash on every `.get()`.
- **Fix:** Replace with packed numeric keys: `(fromX * 56 + fromY) * 56 * 56 + (toX * 56 + toY)`. Use `Map<number, ShipWaterPath>` instead of `Map<string, …>`. Define a constant `MAP_DIM` and a `packPathKey(fromX, fromY, toX, toY)` helper. Update `LazyShipWaterPathMap` to extend `Map<number, …>`.
- **Verify:** All existing tests pass; add a key-collision test that distinct path endpoints yield distinct numeric keys across the whole map.
- **Impact:** Removes ~hundreds of string allocations per plan rebuild; tiny but consistent per-render savings even on cached lookups.
- **Effort:** ~25 lines.

### 12. Zero-alloc seawall check in A\* (`isSeawallBarrierTileXY`) `[size: S, impact: MED]` `Q`
- **Anchor:** `src/systems/seawall.ts:69-71` (`isSeawallBarrierTile({x,y})`); `src/systems/motion-water.ts:301` (called per A\* neighbor).
- **Problem:** `findWaterPath` allocates `{x: nx, y: ny}` for every neighbor relax (~4 per expansion × thousands of expansions × ~150 ships during a cold plan = millions of allocations on cold build). The seawall check itself is already O(1) (Set lookup), but the wrapper signature forces an object literal at every callsite.
- **Fix:** Add `export function isSeawallBarrierTileXY(x: number, y: number): boolean` that does the existing `BARRIER_TILE_KEYS.has(\`${Math.round(x)}.${Math.round(y)}\`)` directly. Switch A\*'s inner loop to call it. Keep the object-form for non-hot callers (`nearestMapWaterTile`, `fallbackWaterWaypoint`, etc.) for back-compat.
- **Verify:** Existing seawall tests pass; new test asserts both signatures return identical results across a sample grid.
- **Impact:** Eliminates millions of `{x,y}` object literals during plan rebuilds — meaningful for first paint and partial-data refreshes that cascade through `buildBaseMotionPlan`.
- **Effort:** ~15 lines.

---

## Tier B — Strong polish

### 13. Cache squad formation offsets per consort at route-build time `[size: S, impact: MED]` `Q`
- **Anchor:** `src/systems/motion-sampling.ts:107-108` (`squadFormationOffsetForPlacement(...)` called per consort per frame); `src/systems/motion-planning.ts:208-258` (`buildConsortMotionRoute`).
- **Problem:** Per-consort-per-frame the sampler calls `squadForMember(id)` (Map lookup) + `squadFormationOffsetForPlacement(id, squad, riskPlacement)` (object lookup + `TIGHT_PLACEMENT_IDS.has(...)`). The result is deterministic for the (id, squad, placement) triple — yet recomputed every frame.
- **Fix:** During `buildBaseMotionPlan` / `buildConsortMotionRoute`, attach `formationOffset: { dx, dy } | null` to the consort's `ShipMotionRoute` (extend the type). In `resolveShipMotionSample` consort branch, read `route.formationOffset` directly. Falls back to live computation when route is unset (defensive only).
- **Verify:** `motion.test.ts` consort tests assert position parity vs. baseline.
- **Impact:** Removes 3 extra map lookups + 1 set lookup per consort per frame (~5 consorts × 60 fps = small but consistent).
- **Effort:** ~15 lines.

### 14. Typed-array path geometry (`Float32Array` cumulativeLengths + packed points) `[size: M, impact: MED]`
- **Anchor:** `src/systems/motion-utils.ts:21-27` (`ShipWaterPath`); `src/systems/motion-water.ts:97-129` (`sampleShipWaterPath`, `waterPathSegmentIndex`); `:399-415` (`waterPathFromPoints`).
- **Problem:** `ShipWaterPath.points` is `Array<{x, y}>` and `cumulativeLengths` is `number[]`. Each point is a heap object; cumulativeLengths boxes its numbers. Per sample call: a binary search reads boxed numbers (cache-unfriendly), then 4 boxed-number reads + 4 multiplies. Across all transiting ships per frame this dominates `motion-water` cost.
- **Fix:**
  1. Replace `points: Array<{x, y}>` with `coords: Float32Array` of length `2 * pointCount` (xy interleaved).
  2. Replace `cumulativeLengths: number[]` with `Float32Array`.
  3. Update `sampleShipWaterPath` to read `coords[i*2], coords[i*2+1]` and write into a passed scratch (composes with #3).
  4. `reverseWaterPath` now allocates one `Float32Array` and fills in reverse order — no `[...].reverse()` spread.
  5. Keep a thin `points` getter returning a `{ x, y }`-array view only for tests/debug if needed (lazy, cached).
- **Verify:** Existing path-sampling tests pass with bit-identical output (Float32 may differ from Float64 by ~1e-7 — adjust tolerance once and commit baselines).
- **Impact:** Tighter cache locality for the per-frame binary search + sample read; pairs with #3.
- **Effort:** ~80 lines + baseline refresh.

### 15. Cross-plan path cache via `WeakMap<PharosVilleMap, Map<key, ShipWaterPath>>` `[size: S, impact: MED]`
- **Anchor:** `src/systems/motion-planning.ts:63, 156` (`waterRouteCache` is built fresh per `buildBaseMotionPlan` call); `src/systems/motion-water.ts:19-34` (`buildCachedShipWaterRoute`).
- **Problem:** Even with `motionPlanSignature` gating, when the signature *does* change (new ship arrives, marketCap shifts ship around, dock tile moves) the *entire* `waterRouteCache` is thrown away — including paths whose endpoints didn't change. On a real data refresh that adds one ship, all ~300 paths get rebuilt via A\* even though the map is the same.
- **Fix:** Promote the cache to module scope keyed by the map identity:
  ```ts
  const pathCacheByMap = new WeakMap<PharosVilleMap, Map<number, ShipWaterPath>>();
  function getMapPathCache(map) { ... return cached or new Map; }
  ```
  Pass `getMapPathCache(world.map)` into `buildCachedShipWaterRoute`. Map identity is stable across `buildPharosVilleWorld` rebuilds when the *content* of the map didn't change (stage outputs are memoized — verify with the existing structuralFingerprint code in `use-pharosville-world-data.ts`). Use numeric keys (#11) to compose cleanly.
- **Verify:** New test rebuilds the plan twice with two distinct world identities sharing the same map; asserts the second build does zero A\* calls (spy on `findWaterPath`).
- **Impact:** Plan rebuilds during data refreshes drop from ~300 A\* runs → 0 in the steady state. Major contributor to perceived "live data freshness without lag."
- **Effort:** ~25 lines + test.

---

## Sequencing

1. **Foundation pass** (lands the in-place data shape that later items use):
   - **#1** (signature memo) — independent quick win.
   - **#3** (mutable samples) — strict prerequisite for #4, #6, #7.
2. **Squad cohesion + path cleanup**:
   - **#2** (flagship sample reuse).
   - **#13** (cached formation offsets).
   - **#11** (numeric keys), **#15** (cross-plan path cache).
3. **Liveliness wave** (these are the user-visible delta):
   - **#4** (heading smoothing) → **#6** (lane-curve heading) → **#7** (bank/roll). Land in order; each builds on the previous.
   - **#5** (speed-aware wake), **#8** (formation breathing), **#9** (moored dock-tangent heading) — independent of each other.
4. **Pathing algorithm work**:
   - **#10** (8-connected A\* + octile heuristic) — biggest pathing change; isolate from liveliness items so any visual baseline drift is reviewed cleanly.
   - **#12** (seawall xy overload), **#14** (typed-array geometry).

## Validation gate (run after each item)

```bash
npm run typecheck
npm test -- src/systems/motion
npm run test:visual -- ships motion squad
```

Liveliness items (#4–#9) **will** drift visual baselines. Refresh baselines only after manual review of the recorded delta — the goal is "looks alive" not "looks the same as before."

## Out of scope for this plan (intentionally deferred)

- Renderer hot-path allocations (covered by item #6 of `2026-05-01-need-for-speed-implementation-plan.md`).
- A\* path simplification post-build (Ramer–Douglas–Peucker on the point list to reduce binary-search work) — useful but only after #14.
- Full-screen-space ship trail / wake history — high visual impact, but a renderer feature, not a motion-systems change.
- Crowd avoidance between ships — out of scope; current motion is decorative-deterministic by design.
