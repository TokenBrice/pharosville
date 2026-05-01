# Need For Speed — PharosVille Top-20 Optimization & Maintainability Plan

Date: 2026-05-01
Scope: standalone PharosVille repo (`src/`, `shared/`, `functions/`, build/test config).
Source audits: render hot-path, React layer, `src/systems/` algorithms, build/bundle/maintainability.

Each task is implementation-ready: anchored file, problem, concrete change, success check, expected impact, and effort estimate. Items are globally ranked. Quick-wins called out with `Q`.

---

## Tier 1 — Critical impact, do first

### 1. Prune dead `shared/` modules and stop running their tests `[size: M, impact: HIGH]`
- **Files:** `vitest.config.ts:18-22`; `shared/lib/__tests__/*`, `shared/lib/classification.ts`, `shared/lib/chains.ts`, `shared/lib/{mint-burn-flow,liquidity-score,blacklist-tracker,depeg-dews}-version.ts`, `shared/lib/api-endpoints/*`, `shared/lib/redemption-backstop-configs/*`.
- **Problem:** Production code reaches ~58 of the ~164 shared `.ts` files. The other ~106 (~940 KiB source, ~8000 LOC of tests) come from the upstream host repo and run on every `npm test`. `vitest.config.ts` `include` glob `shared/**/*.test.ts` directly contradicts `shared/AGENTS.md` ("not part of the default PharosVille gate").
- **Fix:**
  1. Remove `shared/**/*.test.ts` from the `include` array (and drop the `public-docs.test.ts` exclude band-aid).
  2. Run `npm test` and `npm run build` — confirm green.
  3. Build a reachability list: start from `src/` + `functions/` imports of `@shared/*` and walk transitively. Delete unreachable files.
  4. Keep one regression test that imports each `@shared/*` boundary so accidental deletion fails CI.
- **Impact:** ~50% drop in vitest cold import (currently ~23 s import / 4 s execute → ~10–15 s total saved per `npm test`); fewer files to maintain.
- **Verify:** `npm run typecheck && npm test && npm run build` green; `find shared -name "*.ts" | wc -l` decreases substantially.

### 2. Delete unused `public/logos/` static assets `[size: S, impact: HIGH]` `Q`
- **Files:** `public/logos/*` (everything except `public/logos/cemetery/`).
- **Problem:** Code references only `/logos/cemetery/<file>` (`src/systems/world-layout.ts:472`). 248 PNG/JPG/SVG files (~4.0 MB) are deployed for no reason.
- **Fix:** `grep -rn "/logos/" src shared functions index.html` — confirm only cemetery paths. Then delete non-cemetery files.
- **Impact:** ~4.0 MB removed from `dist/` and every Cloudflare Pages deploy.
- **Verify:** `npm run build && du -sh dist/logos/`; visual tests pass.

### 3. Decompose `pharosville-world.tsx` into focused hooks `[size: L, impact: HIGH]`
- **File:** `src/pharosville-world.tsx` (1113 lines: 18 refs, 13 useStates, 11 useEffects, 13 useCallbacks in one closure).
- **Problem:** God-component mixes asset loading, RAF scheduling, adaptive DPR, hit-testing, camera math, debug telemetry, and React glue. Tests are hard, refactors risky.
- **Fix:** Extract three custom hooks under `src/hooks/`:
  - `useCanvasResizeAndCamera` (lines ~282-327, 705-735)
  - `useAssetLoadingPipeline` (lines ~147-250, 537-577)
  - `useWorldRenderLoop` (lines ~339-535) — owns the RAF, refs, and frame composition
  Keep `pharosville-world.tsx` as a thin shell composing them. Co-locate per-hook tests.
- **Impact:** ~600 LOC moved out of the shell, isolates RAF lifetime, unblocks task #4.
- **Verify:** `npm run typecheck && npm test`; visual snapshots unchanged; Playwright interaction suite passes.

### 4. Stop RAF teardown/rebind on every hover under reduced motion `[size: M, impact: HIGH]`
- **File:** `src/pharosville-world.tsx:535, 612-618` (RAF effect deps include `paintRequestTick`).
- **Problem:** In reduced-motion mode, every hover bumps `paintRequestTick`, which cancels and recreates the entire `requestAnimationFrame` loop. This is the most cost-sensitive user (low-end / accessibility mode) hit hardest.
- **Fix:** Keep the RAF loop bound permanently. Replace tick-as-dep with an imperative `requestPaint()` that writes to a ref and queues a one-shot RAF or sets a "draw next frame" flag the existing loop checks. Effect rebind reserved for plumbing changes (size, dpr, world identity).
- **Impact:** Eliminates per-hover loop teardown; smoother accessibility-mode UX.
- **Verify:** Add a test that asserts the RAF effect runs once across many hover events.

### 5. Memoize world build + cut redundant structural fingerprinting `[size: M, impact: HIGH]`
- **File:** `src/hooks/use-pharosville-world-data.ts:183-227`.
- **Problem:** `buildPharosVilleWorld` is called in render gated only by a manual ref-cache keyed on `structuralFingerprint`, which hashes 6 full payloads on **every render of every consumer**. `refetchAll` lists six query objects as deps, so it's recreated every render and breaks downstream `React.memo`.
- **Fix:**
  1. Wrap fingerprint+build in `useMemo` keyed on the six query `data` references plus statuses. TanStack returns stable references on no-change refetches, so the memo will hit.
  2. Replace `refetchAll` deps with `queryClient.refetchQueries({ predicate: ... })` from a stable callback (no per-query deps).
- **Impact:** Removes the second-hottest path (after the RAF loop) — full payload hashing per render. Stabilizes downstream memo boundaries.
- **Verify:** `useMemo` cache-hit assertion in a unit test; visual + interaction suites pass.

### 6. Eliminate per-frame allocations in the ship render hot path `[size: M, impact: HIGH]`
- **Files:** `src/renderer/layers/ships.ts:372-398, 1497-1509`; `src/renderer/world-canvas.ts:309-310, 340-355, 382-384`.
- **Problem:** Hot path allocates per frame: `shipRenderStates: new Map()` is rebuilt; `wakeDrawnShipIds: Set` recreated; `headingBasis()` allocates 2 vec objects per call (×3+ per Titan ship); `Math.hypot` is ~3× slower than the explicit form; `frame.visibleShips.find()` inside a per-ship loop is O(N²) for synchronized squad wakes; `movingShipCount` allocates a full Array+iterator each frame; `visibleShips.filter` allocates a new array each frame; per-squad `anchors` array allocated each frame.
- **Fix (apply together):**
  - Promote `shipRenderStates` to a module-level WeakMap keyed by ship; refill in place. Reuse `wakeDrawnShipIds` (`.clear()`).
  - `zeroShipPose()` returns a frozen module constant.
  - Pass scratch `forward`/`cross`/`wakeDirection` numbers (4 locals) instead of `{x,y}` objects; replace `Math.hypot(x,y)` with `Math.sqrt(x*x+y*y)`.
  - Build `flagshipById = new Map<squadId, ship>` once per frame; replace `visibleShips.find(...)` lookups.
  - Replace `movingShipCount = filter().length` with a single counting loop.
  - Replace `visibleShips.filter` with a module-level scratch array (`length=0` + push) — pattern already used in `entity-pass.ts:54-64` for `entityDescriptorPool`.
- **Impact:** Removes thousands of small allocations/sec. Frees ~1–2 ms/frame on ship-heavy scenes; eliminates one O(N²) on dense squad frames.
- **Verify:** `--prof` in Node-based bench harness; visual tests unchanged.

### 7. Lower dynamic-water cadence and lift static shoreline detail out of it `[size: M, impact: HIGH]`
- **Files:** `src/renderer/world-canvas.ts:101-109`; `src/renderer/layers/terrain.ts:121-150, 212-227`; `src/renderer/layers/shoreline.ts:160`.
- **Problem:** `dynamicWaterPhaseBucket = floor(timeSeconds * 24)` repaints the offscreen water cache 24× per second. The cached pass also includes shoreline coastal-edge wash whose color/alpha/jitter derive only from tile coords (not time), so it's wastefully invalidated. `setLineDash([...])` allocates fresh Arrays per coast tile.
- **Fix:**
  1. Drop dynamic-water cadence to 8–12 Hz (visually imperceptible).
  2. Split the cache: time-independent shoreline detail moves into the **static** scene cache; only the sin-modulated overlay stays dynamic.
  3. Precompute scaled dash arrays once per zoom bucket; reuse a 4-slot scratch dash array.
- **Impact:** Halves dynamic cache repaint cost; removes ~8000 `Math.sin` calls/sec; ~hundreds of small Array allocs/frame eliminated.
- **Verify:** Visual baseline diff < tolerance; FPS profiler shows reduced terrain layer cost.

### 8. Sprite-cache peg pennants and sail logos `[size: M, impact: HIGH]`
- **File:** `src/renderer/layers/ships.ts:1164-1273` (`drawShipPegPennant`), and the `drawSailLogo` matte/clip path stack.
- **Problem:** Each non-Titan ship redraws pennants (2 strokes, 1 clip, 4–8 path ops) and a sail logo (heavy fill+clip+stroke) every frame. Combinations of `(pennant, shape, pattern, size_bucket)` are finite (<100).
- **Fix:** On first encounter, render each unique pennant + each unique sail-logo composition into an offscreen sprite atlas (or per-key `OffscreenCanvas`). Per-ship draw becomes a single `drawImage`. Apply same pattern as `frame-cache.ts`.
- **Impact:** Per-ship overlay cost roughly halves; flame-graph dominant on busy ship scenes.
- **Verify:** Visual baseline diff < tolerance; ship-pose test suite green.

### 9. Cache lighthouse night gradients `[size: S, impact: HIGH]` `Q`
- **File:** `src/renderer/layers/lighthouse.ts:612-739` (`drawLighthouseNightHighlights`), `:580` (`drawLighthouseBeamRim`).
- **Problem:** 4 RadialGradient + 2 LinearGradient objects allocated every frame at night. Diffuse/core/pool gradients depend only on `firePoint` + `nightFactor` (which only change on camera move). Beam rim allocates fresh `rgba(...)` strings per ship.
- **Fix:**
  1. Cache diffuse/core/pool gradients keyed by `(firePointX|0, firePointY|0, zoom*100|0, nightFactor*20|0)`.
  2. Replace per-ship `rgba(...)` strings in `drawLighthouseBeamRim` with a precomputed small color table.
- **Impact:** Drops 3 of 5 gradient allocations/frame (~180/sec saved).
- **Verify:** Lighthouse-night visual tests pass.

### 10. Replace A* `open.includes/splice` with a heap + reusable buffers `[size: M, impact: HIGH]`
- **File:** `src/systems/motion-water.ts:202-242` (`findWaterPath`).
- **Problem:** Open set is an array; `splice(bestIdx, 1)` and `open.includes(neighborIndex)` make each pop/insert O(N) → worst-case O(N²) on a 56×56 map (~3136 tiles). Two fresh 3136-length arrays (`distances`, `previous`) allocated per call. World build for 100+ ships re-pays this for every route.
- **Fix:**
  1. Replace `open` with a binary min-heap; track membership with a `Uint8Array(mapSize)`.
  2. Reuse pre-allocated `Int32Array` `distances`/`previous` buffers across calls (one per `LazyShipWaterPathMap`).
- **Impact:** O(N²) → O(N log N) per pathfind; world build noticeably faster, makes route recomputation viable on topology changes.
- **Verify:** A* unit tests for shortest-path equivalence; benchmark route build over 100 synthetic ships.

### 11. Precompute seawall distance mask `[size: S, impact: HIGH]` `Q`
- **Files:** `src/systems/seawall.ts:73-79` (`seawallBarrierDistance`); `src/systems/pharosville-world/stages/dock-assignment.ts:67-123`.
- **Problem:** `seawallBarrierDistance` is O(48) hypots per query. Dock assignment fallback iterates all 3136 tiles, calling it for each — per ship. With 100+ ships × ~3 docks = ~30k inner iterations × 48 hypots = ~1.5M hypots per build.
- **Fix:** Build a `Float32Array(mapSize)` `seawallDistanceMask` once at module load (chamfer transform from the barrier set). Replace `seawallBarrierDistance(tile)` with an O(1) lookup. Optionally precompute `barrierClearanceMask[clearance]` for the ~5 distinct clearance values used.
- **Impact:** Order-of-magnitude faster dock assignment; meaningful for SSR / first paint.
- **Verify:** Existing dock-assignment unit tests pass with identical placements.

### 12. Mutate motion samples in place; remove per-frame allocations `[size: M, impact: HIGH]`
- **Files:** `src/systems/motion-sampling.ts:76-526`, callers `src/pharosville-world.tsx:998-1021`.
- **Problem:** `resolveShipMotionSample` returns a fresh object literal on every code path; inner allocations (`clampMotionTile`, `normalizeHeading`, `transitLanePoint`, `applyMooringBlend`, `sampleShipWaterPath`) each allocate. ~150 ships × 60 fps = ~9k samples/sec → tens of thousands of transient objects/sec → GC pressure.
- **Fix:** Pass the existing `samples` Map entry as an out-parameter and mutate fields in place. Internal helpers take paired scratch buffers (or numeric out-tuples) instead of returning new objects. `sampleShipWaterPath` writes into a passed `{point, heading}` scratch.
- **Impact:** Eliminates the bulk of frame allocations from the systems layer.
- **Verify:** Motion sampling unit tests; visual interaction suite.

### 13. Memoize `buildBaseMotionPlan` by content `[size: S, impact: HIGH]` `Q`
- **Files:** `src/pharosville-world.tsx:89-90`; `src/systems/motion-planning.ts:15-70`.
- **Problem:** Memo only checks `world` identity. With live data, every poll potentially invalidates the plan (and triggers all the A* warmups), even when only `freshness` changed.
- **Fix:** Memoize on a derived signature (sorted ship ids + dock ids + their riskTile/marketCap/squad fields). Or split: routes depend only on `(ships, docks, map)`; phases/effects depend on the rest.
- **Impact:** Keeps pathfinding off the hot path during normal data refreshes.
- **Verify:** Add a test that polls with a no-op data update and asserts plan identity is preserved.

---

## Tier 2 — High value, smaller scope

### 14. Add `world.entityById` map for O(1) entity lookup `[size: S, impact: MED]` `Q`
- **Files:** `src/pharosville-world.tsx:91, 886-895`; `src/systems/pharosville-world/stages/detail-index.ts`.
- **Problem:** `findWorldEntity(world, id)` builds `[lighthouse, ...docks, ...ships, ...areas, ...graves]` and `.find()`s on every selection.
- **Fix:** During `buildPharosVilleWorld`, build `entityById: Record<string, WorldEntity>` alongside `detailIndex`. Use it for hover, selection, and detail panel lookups.
- **Impact:** O(N) → O(1); removes spread allocation per selection.
- **Verify:** Selection tests pass; new unit test asserts coverage of all entity types.

### 15. Fix RAF input plumbing — replace ref-mirror sync effect `[size: M, impact: MED]`
- **File:** `src/pharosville-world.tsx:101-114, 535`.
- **Problem:** Six refs are mirrored from state via a "sync" effect to keep RAF deps small. Symptom of mixed concerns; can desync under StrictMode double-invoke.
- **Fix:** After task #3, drive the loop with `useSyncExternalStore` over a small frame-state store, OR consolidate per-frame inputs into one `useLatestRef`-style hook so the loop reads the snapshot. Reserve effect rebind for plumbing-level changes only.
- **Impact:** Removes a fragile sync pattern; clarifies what triggers RAF rebind.
- **Verify:** RAF loop binds exactly once across pan/zoom/select/hover sequences (test).

### 16. Cache flagship sample for consorts `[size: S, impact: MED]` `Q`
- **File:** `src/systems/motion-sampling.ts:107-120` (consort offset path).
- **Problem:** Each consort runs a full `sampleRouteCycle` even though only the offset, `shipId`, and `zone` differ from the flagship.
- **Fix:** In `collectShipMotionSamples`, walk flagships first; consorts read the flagship sample from the `samples` Map and apply only the offset+heading deltas.
- **Impact:** Saves N consort-count full-cycle samples per frame.
- **Verify:** Squad motion test asserts identical positions vs. baseline.

### 17. Memoize/throttle `planShipRenderLod` `[size: S, impact: MED]` `Q`
- **File:** `src/renderer/layers/ships.ts:253-338`.
- **Problem:** Allocates `overlayCandidates`, `wakeCandidates`, two `Set`s, and a `.sort()` closure every frame. Pick is typically stable across consecutive frames.
- **Fix:** Memoize plan by `(camera-zoom-bucket, mover-id-set hash, viewport size)`. Recompute on threshold-cross or every Kth frame. Hoist sort comparator to a module-level named function.
- **Impact:** Sort + 4 array allocs per frame removed; meaningful on ship-heavy scenes.

### 18. Pause RAF when canvas is offscreen or tab hidden `[size: S, impact: MED]` `Q`
- **File:** `src/pharosville-world.tsx:509-513`.
- **Problem:** RAF runs unconditionally. If the canvas is scrolled out of view in a visible tab, full work continues.
- **Fix:** Add `IntersectionObserver` on the canvas element; pause RAF when `intersectionRatio < 0.05`. Add `visibilitychange` handler for redundant safety.
- **Impact:** Saves ~all CPU when canvas is offscreen on long pages.
- **Verify:** Manual scroll test; CPU profile shows zero work when offscreen.

### 19. Static-vs-dynamic split in world pipeline + cemetery scatter cleanup `[size: M, impact: MED]`
- **Files:** `src/systems/pharosville-world.ts:13-43`; `src/systems/world-layout.ts:480-521` (`cemeteryScatterTile`); `src/systems/pharosville-world/stages/world-scaffold.ts`.
- **Problem:** `buildPharosVilleMap()` (3136 tile objects) runs every build. Cemetery scatter does ~80 attempts × 3 string allocations × `stableHash` per grave plus an O(n²) `placed.reduce` distance check per attempt.
- **Fix:**
  1. Module-level memo for `buildPharosVilleMap()` (it's a pure constant of layout).
  2. Memoize `graveNodesFromEntries` on entries identity.
  3. Replace cemetery scatter with `mulberry32` seeded from `stableHash(entry.id)` once per entry; use a 4×4 spatial grid for distance checks.
  4. Sort cemetery entries by id before scattering (determinism).
- **Impact:** Saves ~3000 tile allocations + the scatter loop on every refresh.
- **Verify:** Snapshot tests for cemetery layout; world build determinism test.

### 20. Reorder `validate`, merge guard scripts, drop dev consoles in prod `[size: S, impact: MED]` `Q`
- **Files:** `package.json:39-40`; `scripts/check-doc-paths-and-scripts.mjs`, `check-agent-onboarding-docs.mjs`; `vite.config.ts`.
- **Problem:** `validate` runs full tsc → vitest → guards → build → bundle-size sequentially; cheap doc/secret/asset/color guards fail only after expensive stages. Three guard scripts overlap and re-walk markdown. Vite leaves `console.warn`/`console.debug` in prod (`src/lib/api.ts:178`, `src/components/detail-panel.tsx:64`).
- **Fix:**
  1. Reorder `validate`: cheap guards first (`check:committed-secrets`, `check:doc-paths-and-scripts`, `check:pharosville-assets`, `check:pharosville-colors`) → typecheck → test → build → bundle-size.
  2. Run `typecheck` and `test` in parallel via `npm-run-all -p`.
  3. Merge `check-agent-onboarding-docs.mjs` into `check-doc-paths-and-scripts.mjs` (single markdown walk).
  4. In `vite.config.ts`, set `esbuild: { drop: ["debugger"], pure: ["console.warn", "console.debug"] }` (keep `console.error` for the boundary).
- **Impact:** ~10–15 s saved on failed `validate` runs (cheap guards fail fast); -1 guard file; cleaner prod console.
- **Verify:** `npm run validate` green; intentional doc-path break fails within ~2 s.

---

## Sequencing & dependencies

- Tasks 1, 2, 9, 11, 13, 14, 16, 17, 18, 20 are **independent quick wins** — land first.
- Task 3 (decompose `pharosville-world.tsx`) **unblocks** 4 and 15.
- Task 6 (ship hot-path allocations) and 7 (water cadence) are independent of each other and of 3.
- Task 10 (A* heap) is a prerequisite to making task 13's "memoize plan by content" actually fast on cold misses.
- Task 12 (in-place motion samples) should land **after** 6 to avoid two waves of API churn in the hot path.
- Task 19 should land before 13 so the world build is cheap enough that the memo's miss path is acceptable.

## Suggested rollout (5 phases)

1. **Cleanup** (1–2 hrs): #1, #2, #20.
2. **Quick perf wins** (2–3 hrs): #9, #11, #13, #14, #16, #17, #18.
3. **Render hot-path overhaul** (4–6 hrs): #6, #7, #8.
4. **Component restructure** (4–6 hrs): #3 → #4 → #15.
5. **Systems reshape** (4–6 hrs): #10, #12, #19, #5.

## Items intentionally deferred (lower ROI, noted for completeness)

- Module consolidation in `src/systems/motion-*` (collapse 7 files → 3): churn high, perf nil.
- `nearestTileMatching` generic helper (dedupes 3 risk-water "expanding diamond" scans): style/maintainability win, low risk.
- `WorldToolbar` `React.memo` wrap and arrow-key `deltas` const hoist: literally seconds, but cumulative impact is negligible vs. items above.
- Verifying `lucide-react ^1.8.0` resolution: cosmetic dep audit.
- Splitting `src/__fixtures__` out of `src/`: hygiene; no perf change.
- Hidden sourcemaps for production debugging: only if the team adds error reporting.

## Validation gate (run after each phase)

```bash
npm run typecheck && npm test && npm run build && npm run check:bundle-size
npm run test:visual
```

For phases touching the renderer (3, 4, 5), also run the full Playwright dist suite:

```bash
npm run test:visual:dist
```

Update visual baselines only when drift is intentional and reviewed.
