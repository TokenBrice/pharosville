# PharosVille — Need For Speed 2 (NFS2) Plan

Date: 2026-05-01
Author: claude (opus 4.7) — synthesized from four parallel opus subagent audits, post-`4fd9edd` (the original NFS merge).
Scope: standalone PharosVille app at `/home/ahirice/Documents/git/pharosville` only.

## Goal

The first NFS pass (commits `a0485a2..71a4fc3`) executed almost the entire NFS1 plan and merged it into `harbor layout` at `4fd9edd`. NFS2 closes the gap: ship the wins NFS1 promised but missed (e.g. lucide slim), fix correctness regressions introduced or uncovered by the NFS1 changes (e.g. static-cache thrash on pan, API warn-mode silently skipping schema parses), and harden the system with the test coverage that the new caches and refs deserve.

The same three filters apply:
1. concrete code anchor (file:line)
2. measurable user-visible win on a 1280×800+ desktop, OR a real correctness bug
3. compatible with `docs/pharosville/MOTION_POLICY.md` and `VISUAL_INVARIANTS.md`

## What NFS1 actually shipped — the receipts

Commits between `a0485a2..71a4fc3` show every NFS1 phase 1–4 item landed **except**:

- **NFS1 #2 (slim `lucide-react`).** Never applied. Both barrel imports remain (`pharosville-world.tsx:4`, `world-toolbar.tsx:3`) and the lazy chunk is still **875 KB** (target was under 600 KB).
- **NFS1 #4 (float camera offsets).** Done (`89d9a26`), but `world-canvas.ts:60-67` then re-quantizes the offset to integer pixels for the static-cache key, which silently regresses the static cache to a near-100% miss rate on any pan (see Item 1).

A dt-clamp plus visibility-pause clock landed (`1643aa0`, `71a4fc3`) — the NFS1 simple delta clamp was replaced by a more nuanced visibility-pause-only design. That change is mostly correct but has test-exposure issues (Item 7).

## Top 20 — at a glance

Effort: S = under a day, M = 1–3 days, L = 3+ days.
Impact: S = nice, M = noticeable, L = transformative or correctness-critical.

| #  | Title                                                          | Anchor                                                | Effort | Impact | Phase |
|---:|----------------------------------------------------------------|-------------------------------------------------------|:------:|:------:|:-----:|
| 1  | Coarse-bucket static-cache key + grow pool (kills pan thrash)  | `renderer/world-canvas.ts:37,59-67`                   | S      | L      | 1 |
| 2  | API warn-mode: log-and-pass instead of skip-and-pass           | `lib/api.ts:84-91`                                    | S      | L      | 1 |
| 3  | Slim `lucide-react` (NFS1 #2 redo)                             | `pharosville-world.tsx:4`, `world-toolbar.tsx:3`      | S      | L      | 1 |
| 4  | Warm open-water patrol routes alongside dockStops              | `systems/motion-water.ts:83-90`                       | S      | M      | 1 |
| 5  | LRU-bound the `shipSailTintCache`                              | `renderer/layers/ships.ts:105,777-797`                | S      | M      | 1 |
| 6  | Cache `world.docks.map` set in `drawEthereumHarborSigns`       | `renderer/layers/water-labels.ts:60`                  | S      | S      | 1 |
| 7  | Numeric `tieBreaker` instead of `localeCompare` in two sorts   | `renderer/drawable-pass.ts:33,46-47`                  | S      | M      | 1 |
| 8  | Cache lamp + sun/moon radial gradients across frames           | `renderer/layers/scenery.ts:126`, `sky.ts:246,278`    | S      | M      | 1 |
| 9  | Hit-target rebuild also on ship-visibility transitions         | `pharosville-world.tsx` (cell-hash trigger)           | S      | M      | 1 |
| 10 | Reduced-motion paint tick on selection/camera state changes    | `pharosville-world.tsx:477-480`                       | S      | M      | 1 |
| 11 | `vite.config.ts`: `target: "es2022"` + `manualChunks`          | `vite.config.ts`                                      | S      | M      | 2 |
| 12 | Promise.all sprite `image.decode()` in critical batch          | `renderer/asset-manager.ts` (loadCritical path)       | M      | L      | 2 |
| 13 | Migrate bespoke `Math.sin(time*k)` to shared motion-config     | `renderer/layers/{lighthouse,sky,scenery,…}.ts`       | M      | M      | 2 |
| 14 | Inline `flatMap` in `drawEntityLayer`                          | `renderer/layers/entity-pass.ts:34-54`                | S      | M      | 2 |
| 15 | `React.memo` warn-comparator + `refetchOnWindowFocus: "stale"` | `pharosville-world.tsx:669`, `main.tsx:6-12`          | S      | M      | 2 |
| 16 | Static-cache test suite (eviction, key, invalidation)          | new `renderer/world-canvas-cache.test.ts`             | M      | M      | 4 |
| 17 | Motion-invariant tests (smoothstep, post-pause, no-wake)       | new cases in `motion.test.ts`                         | M      | M      | 4 |
| 18 | Decompose `pharosville-world.tsx` into 3-4 hooks               | `pharosville-world.tsx` (893L)                        | L      | L      | 3 |
| 19 | Split `ships.ts` into sprite / sail-tint / effects             | `renderer/layers/ships.ts` (869L)                     | L      | M      | 3 |
| 20 | Enable `noUnusedLocals` / `noUnusedParameters` in tsconfig     | `tsconfig.json`                                       | S      | M      | 4 |

Sum of phase 1 (#1–#10): ten focused fixes, each one a half-day or less. Together they finish the NFS1 mandate (slim lucide), fix the regressions NFS1 introduced (static-cache thrash, warn-mode silent-pass), and clear out the per-frame allocations the explorers found. Phases 2–4 layer on cold-load improvements, decomposition, and the test scaffolding the new caches need.

---

## Phase 1 — quick wins and regressions (S effort, M+ impact)

### 1. Coarse-bucket the static-cache key, grow the pool — fix pan thrash

**Anchor:** `src/renderer/world-canvas.ts:37,59-67`.

**Symptom:** The static-layer cache (NFS1 #17, the headline win) is **near-useless on pan**. The key includes `offsetX | 0` and `offsetY | 0`, and the pool is `STATIC_CACHE_MAX = 2`. On any continuous pan, the camera offset advances by a sub-pixel each frame; the `| 0` truncation produces a fresh key roughly every other frame, the 2-entry pool can hold at most two consecutive pan frames, and the third frame onward is a hard miss → full static repaint each frame. The net effect: NFS1 paid the implementation cost of the cache but recovers ~0% of the savings during the most common interaction (panning).

**Change:** Two parts.

1. **Bucket the camera offset** to a coarser grid so an offset shift inside the bucket reuses the cache:
   ```ts
   const STATIC_OFFSET_BUCKET = 16; // pixels; ~½ tile width
   const offsetX = Math.floor(input.camera.offsetX / STATIC_OFFSET_BUCKET);
   const offsetY = Math.floor(input.camera.offsetY / STATIC_OFFSET_BUCKET);
   ```
   On blit, translate by the residual sub-bucket pixels so the static layer is positioned at the actual camera offset:
   ```ts
   const dx = input.camera.offsetX - offsetX * STATIC_OFFSET_BUCKET;
   const dy = input.camera.offsetY - offsetY * STATIC_OFFSET_BUCKET;
   ctx.drawImage(canvas, dx * dpr, dy * dpr, …);
   ```
   The cached canvas must be painted at offset `(offsetX * BUCKET, offsetY * BUCKET)` (the bucket-aligned offset, not the actual camera offset) and made `BUCKET` pixels wider/taller in each direction so the residual blit doesn't expose unpainted edges.

2. **Grow the pool** from 2 to **6** entries. Memory cost: at 1920×1080 dpr=2 each entry is ~16 MB; six is ~100 MB peak — acceptable on a desktop gate, and the eviction is LRU. Six entries cover the typical pan-and-back pattern plus one zoom transition.

**Risk:** Tile edges may seam if the bucket-aligned padding is wrong. The 16-pixel residual is ½ a tile width — well within terrain margin. Validate against zoom corner cases (zoom=0.85 vs 1.0 vs 1.7).

**Validation:** DevTools → Performance → record a 5-second smooth pan. Look for the static-pass painting cadence in the flame chart. Target: 1 paint per pan, not 60. `npm run test:visual` baseline pass: terrain edges crisp at default zoom + 25% zoom in.

---

### 2. API warn-mode: log-and-pass, don't skip-and-pass

**Anchor:** `src/lib/api.ts:84-91`.

**Symptom:** `validateApiPayload` short-circuits when `contractMode === "warn"`:
```ts
if (contractMode === "warn") return data as T;
```
The NFS1 promise (#13) was to avoid the deep zod parse cost on the cache hot path. The implementation went further and **skipped the parse entirely**. In production, an API drift (renamed field, type change, new required arrayed shape) silently lands in app state, then crashes downstream (motion-sampling indexing into `undefined.tile`, renderer reading `null` texture URLs), and there's no `console.warn` to point at the schema mismatch.

**Change:** Run `safeParse`, swallow the result on success, log a single warning with throttled identity on failure, and pass the unvalidated data through:
```ts
if (contractMode === "warn") {
  if (schema) {
    const result = schema.safeParse(data);
    if (!result.success) {
      logSchemaDriftOnce(path, formatIssues(result.error.issues));
    }
  }
  return data as T;
}
```
`logSchemaDriftOnce` keeps a `Set<string>` of `path` values that have already warned so a six-endpoint drift doesn't spam every 15-minute refetch.

**Risk:** A small CPU bump on the cache hot path — but zod parses only run on the *initial* successful fetch (react-query caches the parsed result), and `safeParse` on a valid payload is microseconds. The whole rationale for "warn mode = skip parse" was a misread of where the cost lived.

**Validation:** Add a dev-only test that mutates a fixture payload, hits the prod-mode code path with `contractMode: "warn"`, and asserts `console.warn` was called once.

---

### 3. Slim `lucide-react` (NFS1 #2, redone properly)

**Anchor:** `src/pharosville-world.tsx:4`, `src/components/world-toolbar.tsx:3`, `package.json:31`.

**Symptom:** The lazy chunk `pharosville-desktop-data-*.js` is still **875 KB**. NFS1 #2 promised under 600 KB. The two barrel imports together pull twelve icons and the entire ESM bookkeeping for the lucide library.

**Change:** Two viable options.

A. **Per-icon imports.** The pinned version is `lucide-react: "^1.8.0"` and the installed `1.14.0` exposes per-icon ESM paths. Rewrite both files:
```ts
// pharosville-world.tsx:4
import Home from "lucide-react/dist/esm/icons/home";
import Maximize2 from "lucide-react/dist/esm/icons/maximize-2";
import Minimize2 from "lucide-react/dist/esm/icons/minimize-2";

// components/world-toolbar.tsx:3
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down";
// …9 total
```
Pin lucide to **exact** `1.14.0` in `package.json` (not `^1.8.0`) since per-icon paths can break on majors. Pin to a single point release until you're ready to bump.

B. **Inline twelve SVGs as a 3 KB local module.** The cleanest, smallest, and version-proof option. Twelve glyphs at ~250 bytes minified each is ~3 KB. Drop `lucide-react` from `dependencies`.

Recommend B unless there's a strong reason to keep the lucide upgrade path open. The icon set is stable (the toolbar hasn't grown in months); inlining beats a dependency.

**Risk:** Visual diff of the toolbar at exact pixel level (lucide stroke widths and join styles are subtle). Snapshot the toolbar in the visual suite first, then update.

**Validation:** `npm run build`; expect the lazy chunk to drop to **under 600 KB** (250+ KB savings). `npm run test:visual` toolbar snapshot — review diff carefully if any.

---

### 4. Warm open-water patrol routes alongside dockStops

**Anchor:** `src/systems/motion-water.ts:83-90`.

**Symptom:** `warmAllWaterPaths` (NFS1 #12) only iterates `route.dockStops`:
```ts
for (const stop of route.dockStops) { … }
```
Ships with `dockStops.length === 0` (the ~12 pure open-water patrols) hit the lazy A* search on their **first** transition into a transit state. With visibility-pause + idle-defer, that first transition lands one or two RAF ticks after critical-frame paint, and the synchronous A* spike is exactly when the user is most likely to perceive it (right after hitting "Reduce motion: off").

**Change:** Extend the warmup loop to cover patrol routes as well:
```ts
export function warmAllWaterPaths(plan: PharosVilleMotionPlan | PharosVilleBaseMotionPlan): void {
  for (const route of plan.shipRoutes.values()) {
    for (const stop of route.dockStops) {
      route.waterPaths?.get(`${stop.fromZone}|${stop.toZone}`);
    }
    if (route.openWaterPatrol) {
      route.waterPaths?.get(route.openWaterPatrol.outboundKey);
      route.waterPaths?.get(route.openWaterPatrol.inboundKey);
    }
  }
}
```
(Adjust to the actual `openWaterPatrol` shape in `motion-types.ts`.)

**Risk:** Lengthens the idle deferred tail by a few hundred milliseconds on first load. Acceptable since it's after critical paint.

**Validation:** Manual: in DevTools, throttle to "Slow 4G", hit reload, wait for first paint, toggle reduced-motion off. Profiler should show no path-search activity in the next 30 s. Add a unit test that asserts `waterPaths` for a known patrol key is non-null after `warmAllWaterPaths`.

---

### 5. LRU-bound the `shipSailTintCache`

**Anchor:** `src/renderer/layers/ships.ts:105,777-797`.

**Symptom:** `shipSailTintCache: Map<string, HTMLCanvasElement | null>` has no eviction. Each unique ship-livery × sail-color combination adds an offscreen canvas (~50–200 KB depending on size). With 150 ships × ~3 livery variants × occasional palette tweaks across long sessions, the cache grows unbounded. There's no immediate symptom on a 5-minute session but a memory profile after 30+ minutes shows it accumulating.

**Change:** Replace the bare `Map` with a small LRU (32 entries is plenty — 150 ships rarely use 150 unique sail tints because chains share liveries):
```ts
const SHIP_SAIL_TINT_CACHE_MAX = 32;
const shipSailTintCache = new Map<string, HTMLCanvasElement | null>();
function rememberSailTint(key: string, canvas: HTMLCanvasElement | null) {
  if (shipSailTintCache.has(key)) shipSailTintCache.delete(key); // re-insert at end
  shipSailTintCache.set(key, canvas);
  while (shipSailTintCache.size > SHIP_SAIL_TINT_CACHE_MAX) {
    const oldest = shipSailTintCache.keys().next().value;
    if (oldest === undefined) break;
    shipSailTintCache.delete(oldest);
  }
}
```
Also flagged in the NFS1 plan's "non-issues" section as a small follow-up — bringing it forward now since the explorer confirmed it's already growing.

Stretch: store the cache on a `WeakMap<ShipLivery, …>` if `ShipLivery` is a stable object reference. Saves the per-frame string-key construction at the call site (`ships.ts:776`).

**Risk:** None. Map insertion order = LRU order in JS engines.

**Validation:** Add a unit test that fills the cache to 33 entries and asserts the oldest is evicted.

---

### 6. Cache `world.docks` chain-id set in `drawEthereumHarborSigns`

**Anchor:** `src/renderer/layers/water-labels.ts:60`.

**Symptom:** `const renderedChainIds = new Set(world.docks.map((dock) => dock.chainId));` — fresh `Set` allocation every frame.

**Change:** Cache on a `WeakMap<PharosVilleWorld, Set<string>>`:
```ts
const dockChainIdSetCache = new WeakMap<PharosVilleWorld, Set<string>>();
function dockChainIdSetFor(world: PharosVilleWorld): Set<string> {
  let set = dockChainIdSetCache.get(world);
  if (!set) {
    set = new Set(world.docks.map((dock) => dock.chainId));
    dockChainIdSetCache.set(world, set);
  }
  return set;
}
```

**Risk:** None — `world` reference is stable across frames within a render loop, and `WeakMap` cleans up automatically on world swap.

**Validation:** Profiler: per-frame `Set` allocations in `drawEthereumHarborSigns` drop to zero.

---

### 7. Numeric tieBreaker in `sortByIsoDepth` and `sortWorldDrawables`

**Anchor:** `src/renderer/drawable-pass.ts:33,46-47`.

**Symptom:** Two sort functions both use `localeCompare` on tie-break strings. `sortWorldDrawables` is called once per frame with **all** drawables (~150-300 items), and `localeCompare` is 5-10× slower than numeric comparison or even raw `<` on ASCII.

The hit-testing path already removed its `localeCompare` in NFS1 (see the comment at `hit-testing.ts:79`); the drawable-pass sort was not updated.

**Change:** Two equivalent options, in order of preference:

A. **Add a stable numeric `sortIndex` to `WorldDrawable`** at world-build time (mirroring what hit-testing did with entity index), and use it in the comparator:
```ts
return …
  || a.sortIndex - b.sortIndex; // stable numeric tiebreak
```
This requires plumbing the index through the entity-pass builders.

B. **Cheap raw `<` comparison** for ASCII-safe strings:
```ts
const aTie = a.tieBreaker, bTie = b.tieBreaker;
return …
  || (aTie < bTie ? -1 : aTie > bTie ? 1 : 0);
```
Same correctness as `localeCompare` for ASCII (entity IDs are ASCII), 5-10× faster.

Recommend B. Apply to both `sortByIsoDepth` (line 33) and `sortWorldDrawables` (lines 46-47).

**Risk:** None for ASCII-only IDs. If any IDs ever contain non-ASCII (locale-collation-sensitive), the order could differ from before — but entity IDs are codepoint-stable in this app.

**Validation:** Frame-time in flame chart: `sortWorldDrawables` median drops from ~2-3 ms to ~0.5 ms with 200 drawables. Snapshot tests that inspect entity draw order should still pass.

---

### 8. Cache lamp + sun/moon radial gradients across frames

**Anchor:** `src/renderer/layers/scenery.ts:126` (lamp light cone), `sky.ts:246,278` (sun and moon glow).

**Symptom:** `ctx.createRadialGradient` is called every frame for ~8 lamps and the sun/moon glows. Lamp positions are static; sun/moon positions advance very slowly (sky `progress` quantizes per minute). Recreating the gradient every frame is pure waste.

**Change:** Cache gradients on a per-context `WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>` keyed by `lamp:${propId}_z${zoomBucket}` for lamps and `${kind}:${quantizedPhase}_z${zoomBucket}` for sun/moon glows:
```ts
const gradientCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
function getGradient(ctx: CanvasRenderingContext2D, key: string, build: () => CanvasGradient): CanvasGradient {
  let perContext = gradientCache.get(ctx);
  if (!perContext) { perContext = new Map(); gradientCache.set(ctx, perContext); }
  let gradient = perContext.get(key);
  if (!gradient) { gradient = build(); perContext.set(key, gradient); }
  return gradient;
}
```
For the lamp cone (which adds color stops based on `breath` from `time * 0.9 + prop.tile.y`), keep the gradient itself static and modulate `globalAlpha` instead of recreating. The sky glow gradients vary even less and bucket by quantized phase (e.g. minute granularity).

**Risk:** Gradient instances are bound to a single context. The `WeakMap<ctx, …>` solves that. Make sure to invalidate on canvas swap (which already happens because the WeakMap key drops with the ctx).

**Validation:** Profiler: per-frame `createRadialGradient` calls drop from ~10 to 0 in steady state (initial load excluded).

---

### 9. Hit-target rebuild on ship-visibility transitions, not just cell-hash

**Anchor:** `src/pharosville-world.tsx` (the hit-target rebuild trigger introduced in commit `135f519`).

**Symptom:** After NFS1 #6, the hit-target snapshot rebuilds when `shipCellHash` changes. But `isShipMapVisible` returns true for non-titan ships only when `state !== "moored"` (or `currentDockId == null`). A non-titan ship leaving its dock changes `state` from `"moored"` to `"departing"` while its sample tile is still the mooring tile for the first 0.15 of progress (the smoothstep blend, NFS1 #11). Result: the ship becomes hit-testable on screen, but the hit-target snapshot doesn't rebuild for one or two frames — a brief stale-hover window where the ship isn't selectable.

**Change:** Either widen the rebuild trigger to include a per-ship visibility hash, or rebuild on any state-transition event:
```ts
// alongside cellHash:
const visibilityHash = computeShipVisibilityHash(world, shipMotionSamples);
if (visibilityHash !== prevVisibilityHash.current) {
  recomputeHitTargets();
  prevVisibilityHash.current = visibilityHash;
}
```
Where `computeShipVisibilityHash` is a cheap rolling FNV-style hash of `(shipId, sample.state)` per visible ship — the only inputs that flip visibility for non-titans. Cost: ~150 hash ops per frame, fits in budget.

**Risk:** None — strictly widens the rebuild trigger, never narrows it.

**Validation:** Add a unit test: ship in moored state at progress=0; transition to `"departing"` at progress=0.01 (before the cell would change); assert `hitTargets` includes the ship.

---

### 10. Reduced-motion: paint tick on selection/camera state changes

**Anchor:** `src/pharosville-world.tsx:477-480` (the recomputeHitTargets effect).

**Symptom:** In reduced-motion mode, the RAF loop runs once per bind. The effect at line 477 calls `recomputeHitTargets()` on selection/camera/canvasSize/hover changes, but the only paint trigger in reduced-motion is `setPaintRequestTick`. If that setter isn't called, the visual feedback (e.g., selection outline) is delayed until the user does something else that triggers a re-bind.

The intent of commit `f8ea887` ("Repaint canvas on state changes in reduced motion") was exactly this. Verify the effect at line 477 also calls `setPaintRequestTick` whenever it recomputes.

**Change:** If the effect only fires `recomputeHitTargets` without bumping the paint tick:
```ts
useEffect(() => {
  recomputeHitTargets();
  if (reducedMotion) setPaintRequestTick((tick) => tick + 1);
}, [camera, canvasSize.x, canvasSize.y, recomputeHitTargets, reducedMotion, selectedDetailId]);
```
Note: drop `hoveredDetailId` from the deps — hit-target geometry doesn't depend on hover state (hover only affects priority boost in `hit-testing.ts:25-30`). Keeping it in the deps causes the effect to fire on every pointermove, which is harmless but wasteful.

**Risk:** Pull-the-rug paint loops if dependency arrays are over-included. Test: reduced-motion + click-select-deselect + drag-pan, observe one paint per discrete event.

**Validation:** Cypress / Playwright: enable reduced motion, click a ship, immediately observe the selection outline (no extra event needed).

---

## Phase 2 — cold load and per-frame churn (S–M effort)

### 11. `vite.config.ts`: explicit ES2022 target + manual chunks

**Anchor:** `vite.config.ts`.

**Symptom:** No explicit `build.target`; defaults to Vite's modern baseline (which on Vite 7 is roughly ES2020). The desktop gate already excludes legacy browsers; the lazy chunk includes more polyfill scaffolding than necessary. Also no `manualChunks`, so React, react-query, and zod are all baked into the lazy chunk (875 KB, see Item 3).

**Change:**
```ts
// vite.config.ts
export default defineConfig({
  // …
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "zod-vendor": ["zod"],
        },
      },
    },
  },
});
```

**Risk:** Splitting into three vendor chunks adds HTTP overhead. On HTTP/2+ this is a wash. Validate with a real network waterfall: target lower **total** transfer, not lower file count.

**Validation:** `npm run build`; compare total `dist/assets/*.js` bytes before and after. Then `npm run test:visual:dist` to ensure the prod build still renders correctly.

---

### 12. Parallel `image.decode()` for critical sprite batch

**Anchor:** `src/renderer/asset-manager.ts` (the `loadCritical` / `loadAssetGroup` path; line numbers vary).

**Symptom:** Critical-sprite cold-load: fetches happen in parallel, but if `image.decode()` is awaited sequentially in a loop, the second sprite's decode is blocked on the first's. Decode is ~10–30 ms per sprite on a fast laptop and ~50–150 ms on a low-end machine; serial decoding stalls first paint by hundreds of milliseconds for ~6 critical sprites.

**Change:** Whenever you await all-images-loaded, gather decode promises and `Promise.all`:
```ts
const decodes = images.map((img) => img.decode().catch(() => undefined));
await Promise.all(decodes);
```
Verify the asset-manager's existing decode pattern (NFS1 confirmed `image.decode()` runs before first RAF tick at `asset-manager.ts:342-353`) — if the loop is sequential, batch it.

**Risk:** Browser image decoders have a global concurrency limit (~6 in Chrome). Forcing 24 parallel decodes won't deadlock but won't help past the limit. Critical batch is small (~6 sprites) — well within limit.

**Validation:** Throttle CPU 4× in DevTools, hit reload, measure `criticalFramePainted` time. Target ≥30% reduction.

---

### 13. Migrate bespoke `Math.sin(time*k)` to shared motion-config

**Anchor:** `src/renderer/layers/{lighthouse,sky,scenery,ambient,harbor-district}.ts`.

**Symptom:** NFS1 #16 introduced shared `WIND_HZ`/`SEA_HZ`/`BEACON_HZ` constants in `motion-config.ts` and migrated cloud drift, mist, surf, and shoreline. **Six bespoke phases remained inline:**

| File | Line | Expression |
|---|---|---|
| `lighthouse.ts` | 61 | `Math.sin(time * 1.4 + surf.phase)` |
| `lighthouse.ts` | 328 | `Math.sin(time * 0.7)` |
| `sky.ts` | 328 | `Math.sin(time * 0.9 + index * 1.7)` (star twinkle) |
| `ambient.ts` | 56 | `Math.sin(time * 5.2 + bird.phase)` (bird wing) |
| `scenery.ts` | 168 | `Math.sin(time * 0.9 + prop.tile.x)` (float bob) |
| `harbor-district.ts` | 167 | `Math.sin(time * 0.64)` (causeway pulse) |

**Change:** Add `BEACON_HZ`, `STAR_HZ`, `BIRD_WING_HZ`, `FLOAT_HZ` (or whatever taxonomy the team prefers) to `motion-config.ts` alongside `WIND_HZ`/`SEA_HZ`. Migrate each call site to consume the shared constant + per-instance phase offset:
```ts
const beat = wind(time, BEACON_HZ); // helper in motion-config
const pulse = 0.11 + beat * 0.025;
```
Bird-wing flap is genuinely fast (5.2 Hz) and may stay bespoke unless the team wants a shared `WING_HZ`. Document the canonical taxonomy in a comment in `motion-config.ts`.

**Risk:** Visual snapshot diffs if the migrated frequency happens to land at a different point in the sin cycle on the snapshot frame. Re-baseline only after careful inspection.

**Validation:** Side-by-side recording: causeway pulse, lighthouse pulse, harbor-district pulse should now share a visible tempo. Reduced-motion frame still pins all to baseline.

---

### 14. Inline `flatMap` in `drawEntityLayer`

**Anchor:** `src/renderer/layers/entity-pass.ts:34-54`.

**Symptom:** Three `flatMap` calls (docks, ships, graves) build intermediate arrays that are immediately spread into the final drawables array. With ~50-100 entities, that's three ephemeral arrays per frame plus an `entityDrawable()` call per entity, each of which calls `cache.geometryForEntity()` even for entities that will be culled by viewport.

**Change:** Replace with a single tagged loop that produces drawables directly:
```ts
const drawables: WorldDrawable[] = [];
for (const dock of input.world.docks) {
  if (!isDockVisible(dock, input)) continue;
  drawables.push(...buildDockDrawables(dock));
}
for (const ship of frame.visibleShips) { … }
for (const grave of input.world.graves) { … }
```
Defer `cache.geometryForEntity(entity)` until **after** viewport-visibility is established.

**Risk:** Geometry cache may be needed for the visibility check itself. Audit `isShipMapVisible` etc. — if they don't need full screen geometry, the deferral is safe.

**Validation:** Profiler: temporary array allocations drop to zero in `drawEntityLayer`. Drawable count and sort order unchanged.

---

### 15. `React.memo` warn-comparator + `refetchOnWindowFocus: "stale"`

**Anchor:** `src/pharosville-world.tsx:669`, `src/main.tsx:6-12`.

**Symptom (memo):** NFS1 #15 wrapped `PharosVilleWorld` with `React.memo` and added a structural-hash cache in `pharosville-desktop-data.tsx`. The memo uses default shallow equality, which depends on the structural-hash cache returning the *same world reference* on byte-identical refetch payloads. If the cache ever fails (object-graph changes despite identical content), the memo silently re-renders without surfacing the regression.

**Symptom (refetch):** `refetchOnWindowFocus: false` was set in `main.tsx` to suppress refetch jitter. But it also means a user who switches away for an hour returns to **stale stablecoin data** with no automatic refresh. The detail panel shows a `stale` badge, but most users won't notice.

**Change (memo):** Add a custom equality that warns in dev when the structural-hash contract appears broken:
```ts
const sameWorld = (prev: { world: PharosVilleWorld }, next: { world: PharosVilleWorld }): boolean => {
  if (prev.world === next.world) return true;
  if (import.meta.env.DEV) {
    console.warn("PharosVilleWorld memo re-render despite different world identity; structural-hash cache may have drifted.");
  }
  return false;
};
export const PharosVilleWorld = memo(PharosVilleWorldInner, sameWorld);
```

**Change (refetch):** Replace `refetchOnWindowFocus: false` with `"stale"` and set `staleTime` to a reasonable window:
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: "stale",
      staleTime: 60_000, // 1 minute
      gcTime: 10 * 60_000,
    },
  },
});
```
Now: focus within 60 s of last fetch → no refetch (no jitter); focus after 60 s → one refetch (data refreshes). Combined with NFS1 #15, the byte-identical-payload case still skips re-render via memo.

**Risk:** Both changes are ergonomic, not load-bearing. Memo warning is dev-only.

**Validation:** Open DevTools Network tab, switch tabs, return after 30 s → no refetch. Return after 90 s → one refetch.

---

## Phase 3 — decomposition (L effort)

### 16. (Phase 4 item — see below)

### 17. (Phase 4 item — see below)

### 18. Decompose `pharosville-world.tsx` into 3-4 hooks

**Anchor:** `src/pharosville-world.tsx` (893 lines).

**Symptom:** Single monolithic component owning RAF loop, asset manager lifecycle, manifest fetch, deferred sprite loading, idle-deferred water-path warmup, reduced-motion observer, visibility tracking, canvas resize, hit-target recomputation, selection/hover/anchor state, fullscreen mode, debug telemetry, and 15+ event handlers. 12 `useState`, 15 `useRef`, 13 `useEffect`. Future motion-policy or selection-flow changes touch this 893-line file.

**Change:** Extract into composable hooks:

1. **`useAssetManager(world)`** — manifest fetch, critical/deferred load lifecycle, asset-load tick, reduced-motion observer. Returns `{ assetManager, criticalAssetsLoaded, criticalFramePainted, assetLoadTick, errors }`.
2. **`useMotionLoop({ world, assetManager, canvasRef, canvasSize, reducedMotion, … })`** — RAF binding, motion plan, visibility-pause clock, paint tick. Returns `{ motionPlanRef, frameMetricsRef, paintRequestTick }`.
3. **`useCanvasResize(canvasRef)`** — ResizeObserver, dpr, canvas budget. Returns `{ canvasSize }`.
4. **`useHitTargeting({ world, camera, canvasSize, motionSamples, … })`** — snapshot, recompute on triggers, pointermove handler. Returns `{ hitTargetsRef, updateHover }`.

`PharosVilleWorldInner` becomes a ~250-line orchestrator that wires the hooks together.

**Risk:** Closure capture across hooks. The current code passes refs around to keep RAF effect deps minimal — preserve that pattern. Add an integration test that mounts the full component and asserts `__pharosVilleDebug.activeMotionLoopCount === 1` after every state transition.

**Validation:** All existing tests pass. `npm run test:visual` passes. Chrome DevTools React profiler shows no extra re-renders compared to baseline.

---

### 19. Split `ships.ts` into sprite / sail-tint / effects

**Anchor:** `src/renderer/layers/ships.ts` (869 lines).

**Symptom:** Single file owns ship-color constants, sail-tint cache + image-data recoloring, ship-body draw, wake/contact-shadow/mooring-glow draw, deck-trim glow, sprite asset resolution. A maintainer fixing "mooring glow looks wrong" reads through 869 lines.

**Change:** Three target files:
- planned ship-sprite module (~250 LOC): asset resolution, body sprite, position/rotation/scale.
- planned ship-sail-tint module (~50 LOC): absorb the cache and recoloring helpers from `ships.ts:105-138`.
- planned ship-effects module (~400 LOC): wake, mooring-glow, deck-trim glow, contact shadow.
- `src/renderer/layers/ships.ts` (~150 LOC): re-exports the three draw functions and orchestrates.

**Risk:** Import churn across `world-canvas.ts` and tests. Use search-replace for the public-API moves; keep the function names stable so `world-canvas.ts:8` import doesn't change.

**Validation:** All ship-related tests pass. `npm run test:visual` passes. Bundle size unchanged (or slightly smaller due to better tree-shaking).

---

## Phase 4 — test coverage and hygiene (M effort)

### 16. Static-cache test suite

**Anchor:** planned world-canvas-cache test module.

**Symptom:** The static-layer cache (`world-canvas.ts:31-147`, ~115 LOC of cache logic with eviction, key construction, DPR bucketing, `assetLoadTick` invalidation) has **zero direct tests**. Item 1 changes the key strategy and pool size; without tests, regressions slip in.

**Change:** Add cases:
- `evicts oldest entry when pool exceeds STATIC_CACHE_MAX`
- `invalidates entries when assetLoadTick advances`
- `reuses cached canvas across two consecutive frames with same key`
- `paints fresh on cache miss, blits on cache hit` (mock `drawTerrain` etc., assert call counts)
- `key includes worldId / zoom / dpr / viewport size / asset tick / coarse-bucketed offset` (one assertion per field varied)

Use a JSDOM canvas mock (already used elsewhere in the suite).

**Risk:** Mocking `getContext("2d")` is fiddly; reuse the existing pattern from `frame-cache.test.ts`.

**Validation:** New test file passes; mutation testing (or just deleting eviction branches) makes tests fail.

---

### 17. Motion-invariant tests

**Anchor:** new cases in `src/systems/motion.test.ts`.

**Symptom:** NFS1 #1, #10, #11 introduced critical invariants that have no explicit regression tests:
- **Smoothstep mooring blend continuity**: position is C0-continuous across moored→departing and arriving→moored transitions.
- **No wake while moored** (NFS1 #10): wake intensity is zero when `sample.state === "moored"`, regardless of `effectShipIds` membership.
- **Post-pause clock**: `timeSeconds` does not jump after a `visibilitychange` → hidden → visible cycle.
- **Wake intensity floor** for transit ships matches the new `(state, moverShipIds)` matrix (no leftover `0.18` floor).

**Change:** Four discrete tests, each ~30-50 LOC. Use the existing `motion.test.ts` fixtures.

**Risk:** Tests must control time progression deterministically. Use the existing `mockMotionTime` helper if present, or add one.

**Validation:** New tests pass. Try mutating the `applyMooringBlend` smoothstep to a step function — arrival-continuity test should fail.

---

### 20. Enable `noUnusedLocals` / `noUnusedParameters` in tsconfig

**Anchor:** `tsconfig.json`.

**Symptom:** `strict: true` is set but the granular flags `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` are unset. Unused exports and parameters from earlier refactors slip in unnoticed.

**Change:** Add to `compilerOptions`:
```jsonc
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true,
"noImplicitOverride": true
```

**Risk:** Will surface 5-15 violations across the codebase (ranging from genuine dead code to test mocks with unused params). Prefix unused params with `_` to silence; delete genuine dead code.

**Validation:** `npm run typecheck` passes after fixes. Future refactors leave less leftover scaffolding.

---

## Sequencing rationale

**Phase 1 first** because three of the items (#1 static-cache thrash, #2 warn-mode silent-pass, #3 lucide slim) are *regressions* relative to NFS1's intent — every day they sit in main is a day the NFS1 wins are partially undelivered. Items 4-10 are quick correctness/perf cleanups that compose freely; do them in any order.

**Phase 2** delivers cold-load + per-frame churn improvements that need a stable Phase 1 to baseline against. #11 (vite config) is independent; #12 (decode parallelism) requires #3 to have shrunk the JS chunk first so decode is the next-largest cold-load cost. #13 (shared phases) is a coherence win that comes after the renderer is otherwise lean. #14 (entity-pass flatMap) is independent. #15 (memo + refetch) is a defensive net for the NFS1 #15 work.

**Phase 3** decompositions (#18 `pharosville-world.tsx`, #19 `ships.ts`) are large, risky refactors. Do them only after Phase 1+2 stabilize so visual regressions are easier to attribute. They unlock future work (the next NFS pass, new scenery families) without paying off immediately.

**Phase 4** tests harden the work in Phases 1+2. Land #16 (static-cache tests) right after Item 1 so the new key strategy has coverage. Land #17 (motion invariants) before any further motion changes.

---

## Validation matrix

Each task should run, at minimum:
- `npm run typecheck`
- `npm test` (unit suites — motion, hit testing, asset manager, world model, drawable-pass, frame-cache)
- relevant scenario in `npm run test:visual` (review diffs before updating baselines)

Before broad completion claims:
- `npm run check:pharosville-assets`
- `npm run check:pharosville-colors`
- `npm run check:committed-secrets`
- `npm run check:doc-paths-and-scripts`
- `npm run build`
- `npm run test:visual`
- live smoke once deployed: `npm run smoke:live -- --url https://pharosville.pharos.watch`

Performance-specific sanity checks (manual):
- DevTools Performance: median frame time at 1280×800 with motion on, **scrubbing/panning** (not just idle), hovering across ships, switching tabs and returning. Target after Phase 1 is complete: median ≤14 ms during pan, p95 ≤22 ms, no GC spike on tab return.
- Cold load TTI: Network throttled to "Fast 4G" — first canvas frame target under 1.6 s after lazy-chunk download starts (down from baseline measured at 875 KB).
- Bundle size: `dist/assets/pharosville-desktop-data-*.js` target under 600 KB (down from 875 KB).

---

## Out of scope / not chosen

The audits surfaced the following but they were intentionally **not** in the top 20:

**Renderer micro-opts (S/S, tiny payoff):**
- `ctx.save()/restore()` redundancy in per-entity draws (R8). Audit estimated ~1 µs per pair; with 100 entities, ~100 µs/frame. Skip until profiler shows it as the next hotspot.
- `countVisibleTiles` duplicates terrain projection (`world-canvas.ts:227-244`). Pure code-clarity refactor; <1 ms savings.
- Mooring blend ultra-short-transit edge case (M3). Triggers only when `cycleSeconds < 30` — none of the current routes hit this.
- `warmAllWaterPaths` empty-plan guard (M7). Negligible cleanliness.
- `measureText` cache key conflated with font (R5). Cache hit rate is already good at default zoom; only matters if zoom changes mid-pan.

**Architectural debt (M-L effort, deferred):**
- `DrawPharosVilleInput` 27-field kitchen sink (B2). Real ergonomic improvement but moderate change-cost across 36+ call sites; defer to a dedicated cleanup sprint.
- Layer `RenderState` type pattern duplication across ships/docks/graves/lighthouse (B1). Generic `EntityRenderState<T>` is correct but increases type machinery; benefit only realized when adding a 5th entity layer.
- `motion-sampling.ts` ↔ `motion-water.ts` boundary (B5). Boundary is presently passable; revisit if a third path mode (e.g. detour avoidance) lands.
- Frame-cache invalidation tests (B8). Cache is per-frame today; tests matter only if it's extended to multi-frame.
- Static-cache `reducedMotion` flag in key (R9). Speculative — verify whether reduced-motion is mutable mid-session before adding.

**dt-clamp test exposure (M1).** The original NFS1 dt clamp at `1/30 s` was replaced by a visibility-pause-only clock. Tests that use `page.clock.fastForward()` without setting `visibilityState = "hidden"` first can accumulate unbounded `dt`. Add a guard in test setup, but it doesn't warrant a top-20 slot.

**`hoveredDetailId` in hit-target effect deps (RC5).** Folded into Item 10 — drop it from the deps when adding the paint-tick.

**Per-frame clouds/birds allocation review.** The relevant layers are short enough to inspect ad-hoc; nothing surfaced in the audits.

---

## Confirmed non-issues (post-NFS1)

The NFS1 plan landed correctly for these items; no further work needed:

- RAF time-delta visibility-pause logic (`pharosville-world.tsx`, commits `1643aa0` → `71a4fc3`) — clock advances monotonically and pauses on hidden tab.
- Camera offsets are floats again (commit `89d9a26`). Sub-pixel ship motion is no longer rounded by the camera (the `| 0` in static-cache key is independent — see Item 1).
- Static-layer cache *exists* and is correct in invalidation logic — just thrashes (Item 1).
- Hit-testing already replaced its `localeCompare` with a numeric tiebreaker (`hit-testing.ts:79`). Drawable-pass sort still uses `localeCompare` (Item 7).
- Coast neighbors and area-label layouts cached on world-build path (commit `3afeb0f`).
- Sky background gradient cached (commit `a1efd2b`); sun/moon glows still rebuild (Item 8).
- Wake intensity floor removed for non-transit ships (commit `a0485a2`).
- Terrain viewport tile-rect culling in place (commit `5ac5829`).
- Per-frame singletons (`lighthouseRender`, `visibleShips`) hoisted onto `WorldCanvasFrame`.
- Smoothstep mooring blend lands (commit `2754740`); needs an explicit regression test (Item 17), implementation is sound.
- Eager water-path warmup fires during deferred idle load (commits `a54ac8b`, `6c47ff1`); only `dockStops` covered, patrols missing (Item 4).
- World reference + `React.memo` (commit `de9a372`) — sound, but warn-comparator recommended (Item 15).
- Visibility-gated manifest preload (commit `60b9369`) — desktop-only, correct.

---

## File-by-file summary of touched code

| File | Items touching it |
|---|---|
| `src/renderer/world-canvas.ts` | #1 |
| `src/renderer/drawable-pass.ts` | #7 |
| `src/renderer/asset-manager.ts` | #12 |
| `src/renderer/layers/ships.ts` | #5, #19 |
| `src/renderer/layers/water-labels.ts` | #6 |
| `src/renderer/layers/scenery.ts` | #8, #13 |
| `src/renderer/layers/sky.ts` | #8, #13 |
| `src/renderer/layers/lighthouse.ts` | #13 |
| `src/renderer/layers/ambient.ts` | #13 (optional) |
| `src/renderer/layers/harbor-district.ts` | #13 |
| `src/renderer/layers/entity-pass.ts` | #14 |
| `src/systems/motion-water.ts` | #4 |
| `src/systems/motion-config.ts` | #13 |
| `src/lib/api.ts` | #2 |
| `src/main.tsx` | #15 |
| `src/pharosville-world.tsx` | #3, #9, #10, #15, #18 |
| `src/components/world-toolbar.tsx` | #3 |
| `vite.config.ts` | #11 |
| `tsconfig.json` | #20 |
| `package.json` | #3 |
| planned world-canvas-cache test module | #16 |
| `src/systems/motion.test.ts` | #17 |

No changes proposed to `docs/pharosville/MOTION_POLICY.md`, `VISUAL_INVARIANTS.md`, or `visual-cue-registry.ts`. The decomposition items (#18, #19) preserve module exports; downstream consumers only need import-path updates if a function physically moves.
