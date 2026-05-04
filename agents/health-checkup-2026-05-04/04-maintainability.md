# Maintainability Audit

## Summary

PharosVille's codebase demonstrates solid foundation practices (strict TypeScript, good error handling, clean systems/renderer separation) but shows signs of complexity concentration and inconsistent patterns. The largest modules (ships.ts at 1988 lines, terrain.ts at 1201) mix data initialization, rendering logic, animation, and caching concerns. Type safety is strong (few `as unknown` casts limited to tests) and ESLint is absent, leaving stylistic consistency to convention. The renderer layers have inconsistent export counts and structure, suggesting organic growth without architectural patterns. Test coverage is reasonable (57 test files) but skewed—test utilities are minimal (single 48-line file) and some widely-used modules lack tests.

## Findings

### F1: God files lacking natural seams — ships.ts mixes LOD, animation, livery rendering, and caching
- **Where:** `src/renderer/layers/ships.ts:1-1988`, particularly:
  - Lines 279-356: LOD planning constants and budgets
  - Lines 521-568: Ship state computation 
  - Lines 819-873: Body rendering
  - Lines 1003-1103: Overlay rendering
  - Lines 1140-1242: Sail logo sprite caching/building
  - Lines 1365-1498: Emblem silhouette rendering
  - Lines 1797-1875: Sail tint canvas caching
  - Lines 1883-1986: Wake drawing and styling
- **Impact:** Every ship visual feature addition (new sail emblem style, hull detail, animation) requires modifying one 1988-line file. Future refactors become risky (many untested edge cases in ship-pose, livery logic). Onboarding is slow—developers need full file context.
- **Effort:** high
- **Reward:** high
- **Fix sketch:** Extract sail logo/emblem sprite management into a new ship-visual-assets module under `src/renderer/`, move wake styling into a separate ship-wake layer module, consolidate tint caching into a shared canvas-caches module. Leave body rendering and LOD planning in main file.

### F2: Missing return type annotations on exported void-returning functions
- **Where:** `src/renderer/layers/ships.ts:603, 819, 873, 1003` — `drawShipWake`, `drawShipBody`, `drawSquadIdentityAccent`, `drawShipOverlay`
  - Similar in: `src/renderer/layers/terrain.ts:103, 110, 150`, `ambient.ts:254, 284, 374`, `lighthouse.ts`
- **Impact:** Implicit `void` return type reduces code clarity. Refactors that accidentally return values slip through without type error. Inconsistent with strict tsconfig.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Add `: void` return type annotation to all exported draw functions (regex search for `^export function draw\w+` and append return type).

### F3: Inconsistent layer module exports — 15 exports in ships.ts vs. 3 in terrain.ts
- **Where:** `src/renderer/layers/ships.ts` exports 15 items (5 config objects, 10 functions); `terrain.ts` exports 3 (main draw functions only)
  - Config exports: SHIP_SAIL_EMBLEM_OVERRIDES, SHIP_SAIL_MARKS, SHIP_TRIM_MARKS, TITAN_SPRITE_IDS
  - Function exports: planShipRenderLod, resetPlanCache, drawShipWake, drawShipBody, drawSquadIdentityAccent, shipMastTopScreenPoint, drawShipOverlay
- **Impact:** Inconsistent API surface makes it unclear which exports are stable contracts vs. implementation details. Public configs (SHIP_SAIL_MARKS) can be accidentally modified by consumers. Makes multi-module refactors harder.
- **Effort:** mid
- **Reward:** mid
- **Fix sketch:** Create `src/renderer/ship-visual-config.ts` for all SHIP_* constants, export only from there. In ships.ts, re-export or import as internal. Mark stable API boundaries with JSDoc `@internal` tags.

### F4: No ESLint or consistent linting enforcement
- **Where:** No `.eslintrc*`, `eslint.config.ts`, or linting scripts in `package.json`
  - TypeScript is strict but linting rules (unused variables, consistent naming, import sorting) are enforced by convention only
- **Impact:** Style inconsistency accumulates (e.g., some render functions use `ctx` parameter, others destructure). Dead code harder to spot. Larger team would suffer more (inconsistent variable naming across 20+ layer files).
- **Effort:** mid
- **Reward:** mid
- **Fix sketch:** Add ESLint with `@typescript-eslint` preset. Add `npm run lint` and `npm run lint:fix` scripts. Include in pre-commit hook. Start with warnings, upgrade to errors in next sprint.

### F5: Data configuration (SHIP_SAIL_MARKS, terrain tile colors) embedded in source without config structure
- **Where:** `src/renderer/layers/ships.ts:42-70` (SHIP_SAIL_MARKS — 71 ship configs, 250+ lines of coordinate tuples)
  - `src/renderer/layers/terrain.ts:44-52` (TILE_COLORS, TERRAIN_TEXTURE config)
  - Similar: `src/renderer/layers/graves.ts:27-35` (WRECK_LOGO_OFFSET)
- **Impact:** Visual tuning (sail emblem offsets, colors) requires source code edits. No centralized configuration dashboard. Versioning config changes is harder. Difficult to test config variations.
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Create a dedicated visual-config module under `src/renderer/` (TS or JSON), or export a config object that consumers import. Load at runtime or build time. Unblocks future art-driven updates without code deploys.

### F6: Test utilities under-invested (single 48-line file in `__test-utils__`)
- **Where:** `src/renderer/__test-utils__/draw-input.ts` — single file with `createCanvasContextStub` and `createDrawInput`
  - Growing test files (ships.test.ts 23KB, entity-pass.test.ts 8890 bytes) duplicate canvas stub creation inline
- **Impact:** New render tests require copy-pasting canvas mock logic. Test maintainability suffers as canvas API changes. Porting tests between modules requires hunting for subtle stub differences.
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Expand `__test-utils__/` with: `canvas-context-builder.ts` (fluent canvas mock builder), `render-context-factory.ts` (world/camera builders), `snapshot-assertions.ts` (canvas pixel comparison). Document in README.

### F7: Tight coupling between motion-sampling.ts and shipmotion types — 1034 lines with heavy WeakMap caching
- **Where:** `src/systems/motion-sampling.ts` lines 1-87 and below (RouteSamplingRuntime cache, complex shape computation)
  - Cache hit detection: `routeSamplingRuntimeCache.get(route)` at line 30
  - Runtime rebuilding: 57 lines of route-to-cache-entry construction (lines 29-87)
- **Impact:** Cache invalidation strategy is implicit (WeakMap auto-cleans if route is GC'd). Hard to debug cache misses. Coupling to ShipMotionRoute shape makes refactors risky.
- **Effort:** mid
- **Reward:** low
- **Fix sketch:** Document cache invalidation strategy in JSDoc. Consider explicit cache size metrics/telemetry. Extract RouteSamplingRuntime type into dedicated module if it grows.

### F8: Inconsistent memoization patterns across hooks
- **Where:** `src/hooks/use-pharosville-world-data.ts:134` uses `useMemo` for world object
  - `src/hooks/use-canvas-resize-and-camera.ts` extensively uses `useCallback` (26+ callbacks defined)
  - `src/hooks/use-world-render-loop.ts:119` only 1 `useCallback` despite 800+ lines
- **Impact:** Render loop hook may recompute expensive operations on every parent render. Inconsistent callback identity across hooks complicates optimization and debugging. Unclear which patterns are intentional vs. oversight.
- **Effort:** mid
- **Reward:** mid
- **Fix sketch:** Document memoization rules (when to useMemo/useCallback) in CLAUDE.md. Audit `use-world-render-loop.ts` for unnecessary recomputes. Consider extracting camera/gesture logic into separate hook with explicit memoization.

### F9: Minimal error reporting — only MAX_REPORTS_PER_SESSION=5 and no categorization
- **Where:** `src/error-reporter.ts:1-57`
  - Swallows all errors in fetch handler (line 26)
  - Logs only message, filename, lineno, colno (no beacon-style telemetry)
- **Impact:** Production errors silently fail (intentional but hard to debug). No way to correlate errors to specific user interactions or feature areas. Stack truncation at 2000 chars may lose context. No distinction between data validation errors vs. runtime bugs.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Add error category field (render, data-load, interaction, etc.). Implement exponential backoff for fetch failures. Store last 10 error summaries in localStorage for debugging.

### F10: Shared boundary clean but undocumented in code — relies on AGENTS.md
- **Where:** `shared/AGENTS.md` enforces import boundaries; no runtime or type-level enforcement
  - `shared/lib/` modules have no checks to prevent importing from src/**
  - `shared/types/` files can silently import unshared dependencies
- **Impact:** Accidental coupling sneaks in (runtime-specific globals used in shared code). Cross-project refactors break silently if shared snapshot is stale.
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Add `no-restricted-imports` ESLint rule to forbid `src/**` imports from `shared/**`. Document in CLAUDE.md which globals (window, fetch, etc.) are safe to use in shared modules.

### F11: Large gap between worlds — test fixtures (pharosville-world.ts 602 lines) manually constructed
- **Where:** `src/__fixtures__/pharosville-world.ts` handcrafted PharosVilleWorld for tests
  - Ships, graves, docks, terrain all manually populated with coordinate tuples
  - No factory builders, no DSL
- **Impact:** Tests for motion-sampling or motion-planning that need specific world layouts must copy-paste and edit fixture. Fixture maintenance is fragile (coordinates must match terrain bounds manually). Hard to generate parameterized test cases.
- **Effort:** mid
- **Reward:** low
- **Fix sketch:** Create a world-builder module under `src/__fixtures__/` with fluent API (e.g., `new WorldBuilder().addShip(id).atTile(5, 10).inZone('calm').build()`). Use for all new tests.

### F12: Synchronous asset loading in renderer without explicit error recovery
- **Where:** `src/renderer/asset-manager.ts:489` and getAsset/get methods
  - Loading pipeline in `src/hooks/use-asset-loading-pipeline.ts` is async but renderer consumes nullable `PharosVilleAssetManager`
  - No explicit fallback when asset is missing (e.g., drawAsset checks `assets?.get()` but downstream code assumes safe)
- **Impact:** Visual glitches if asset loads slowly or fails (blank canvas instead of graceful degradation). No metrics on miss rate. Hard to diagnose which assets are slow to load.
- **Effort:** mid
- **Reward:** low
- **Fix sketch:** Add asset miss counter to PharosVilleRenderMetrics. Implement placeholder or cached fallback for critical assets. Log slow asset loads to error reporter.

### F13: Constants and magic numbers scattered across layer files — no centralized scale/offset config
- **Where:** `src/renderer/layers/ships.ts:279-291` (ship LOD budgets, lantern radius bucket)
  - `src/renderer/layers/lighthouse.ts` (multiple sites: LIGHTHOUSE_DRAW_OFFSET, LIGHTHOUSE_DRAW_SCALE imported from geometry.ts)
  - `src/renderer/geometry.ts` stores offsets but not all visual constants
- **Impact:** Tweaking visual scale (e.g., "make all ships 10% larger") requires grep-and-edit across 5 files. Scale constants are inconsistently named and typed.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Create `src/renderer/visual-scales.ts` with constants: SHIP_BODY_SCALE, LIGHTHOUSE_BEACON_RADIUS, GRAVE_WRECK_SCALE, etc. Import and use consistently.

### F14: No code-to-docs synchronization — architecture diagram outdated or missing
- **Where:** No ARCHITECTURE.md or similar; AGENTS.md covers only shared boundary
  - Renderer layer dependencies not documented (which layer runs before which, why)
  - Motion system flow (sampling → planning → animation) not diagrammed
- **Impact:** New contributors don't understand execution order or dataflow. Refactors risk violating implicit invariants (e.g., terrain must render before ships for depth).
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Create `ARCHITECTURE.md` with: (1) rendering pass order with ASCII diagram, (2) motion system lifecycle, (3) asset loading flow, (4) test strategy by module. Include in onboarding checklist.

## Recommendations by Priority

**High-value, quick wins:**
1. F2 — Add `: void` return types (~30 min, prevents accidental bugs)
2. F10 — Add no-restricted-imports ESLint rule (~1 hr, hardens boundary)
3. F5 — Extract visual configs into JSON/config module (~2 hrs, unblocks future non-code changes)

**High-reward architectural fixes:**
1. F1 — Split ships.ts into 3 modules (livery, wake, LOD) (~8-12 hrs, improves every future ship feature)
2. F4 — Wire ESLint (2 hrs initial, ongoing style consistency)
3. F8 — Audit and document hook memoization strategy (~3 hrs, prevents perf regressions)

**Deferred (lower impact for effort):**
- F3 — Layer export consistency (bundled with F1)
- F6 — Expand test utilities (organic investment as tests grow)
- F7, F9, F11, F12, F13, F14 — Improvements but not blockers
