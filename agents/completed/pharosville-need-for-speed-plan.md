# PharosVille — Need For Speed Plan

Date: 2026-05-01
Author: claude (opus 4.7) — synthesized from four parallel opus subagent audits
Scope: standalone PharosVille app at `/home/ahirice/Documents/git/pharosville` only.

## Goal

Make PharosVille feel **fast** (cold load + steady state), **smooth** (no jitter, no pop, no teleport), and **alive** (more ambient maritime atmosphere) — all without violating the motion policy, the visual-cue registry parity rule, or the desktop gate.

Ranked picks below pass three filters:
1. concrete code anchor (file:line)
2. measurable user-visible win on a 1280×800+ desktop
3. compatible with `docs/pharosville/MOTION_POLICY.md` and `VISUAL_INVARIANTS.md`

## Top 20 — at a glance

Effort: S = under a day, M = 1–3 days, L = 3+ days.
Impact: S = nice, M = noticeable, L = transformative.

| #  | Title                                                       | Anchor                                            | Effort | Impact | Phase |
|---:|-------------------------------------------------------------|---------------------------------------------------|:------:|:------:|:-----:|
| 1  | Time-delta clamp on RAF (no teleport after tab pause)       | `pharosville-world.tsx:247`                       | S      | L      | 1 |
| 2  | Slim `lucide-react` imports + tree-shakeable icons          | `pharosville-world.tsx:4`, `world-toolbar.tsx:3`  | S      | L      | 1 |
| 3  | Preload manifest + hot sprites in `index.html`              | `index.html`, `pharosville-world.tsx:97-130`      | S      | L      | 1 |
| 4  | Float camera offsets — kill the 1-px ship crawl             | `systems/camera.ts:79-81`                         | S      | M      | 1 |
| 5  | Hoist per-frame singletons onto frame state                 | `renderer/world-canvas.ts:430-562`                | S      | M      | 1 |
| 6  | Move `collectHitTargets` off the RAF loop                   | `pharosville-world.tsx:255-263`, `hit-testing.ts` | S      | M      | 1 |
| 7  | Viewport tile-rect culling (skip 1.7k tiles per frame)      | `renderer/world-canvas.ts:582-602`                | S      | M      | 1 |
| 8  | Cache coast neighbors + area-label layout per world         | `layers/shoreline.ts:22-43`, `world-canvas.ts:2358-2374` | S | M | 1 |
| 9  | Cache sky gradient as offscreen canvas                      | `renderer/layers/sky.ts:83-118`                   | S      | M      | 1 |
| 10 | Drop the `0.18` wake-intensity floor (phantom-wake bug)     | `renderer/world-canvas.ts:3105`                   | S      | M      | 1 |
| 11 | Smoothstep mooring → transit position blend                 | `systems/motion-sampling.ts:51-64`                | S      | M      | 2 |
| 12 | Eager-build water-route paths during idle deferred load     | `systems/motion-water.ts:55-81`                   | S      | M      | 2 |
| 13 | Schema validation `warn` mode in prod (zod off cache path)  | `lib/api.ts:84-93`                                | S      | M      | 2 |
| 14 | Refs for hover/select/motionPlan in RAF effect              | `pharosville-world.tsx:233-323`                   | M      | M      | 2 |
| 15 | Memoize world reference + `React.memo` on PharosVilleWorld  | `pharosville-desktop-data.tsx:57-87`              | M      | M      | 2 |
| 16 | Shared wind/sea phase across ambient cues                   | `motion-config.ts`, multiple `world-canvas.ts`    | M      | M      | 2 |
| 17 | Static-layer offscreen canvas (terrain/headland/scenery)    | `renderer/world-canvas.ts:582-2722`               | L      | L      | 3 |
| 18 | Lamp light-cone on adjacent water (aliveness)               | `world-canvas.ts:2259-2288` (extend `drawLamp`)   | S      | M      | 4 |
| 19 | Lighthouse hearth ember flicker (aliveness, no smoke)       | `world-canvas.ts:2050-2071` (firePoint)           | S      | M      | 4 |
| 20 | Beam-on-sail rim light (aliveness, signature touch)         | `world-canvas.ts:2200-2230`, ship draw            | M      | L      | 4 |

Sum of phase 1 (#1–#10): roughly one focused week, eliminates the worst jitter, shaves the heaviest cold-load and per-frame waste, and ships one bug fix. Phases 2–4 layer on smoothness, the big render-cache win, and aliveness polish.

---

## Phase 1 — quick wins (S effort, mostly M+ impact)

### 1. Time-delta clamp on RAF — prevent post-pause teleport

**Anchor:** `src/pharosville-world.tsx:247-248` and any `time * k` math in `motion-sampling.ts`, `world-canvas.ts`, `layers/sky.ts`.

**Symptom:** `timeSeconds = (time - motionStartTime) / 1000` is an unbounded absolute clock. After a backgrounded tab or laptop sleep, the next RAF callback can advance it by minutes; `positiveModulo(cyclePosition, route.cycleSeconds)` wraps to a new cycle phase mid-route and **every ship snaps to a new tile**. Birds, beam, sky `progress`, and every `Math.sin(time * …)` cue jolt at the same instant.

**Change:**
```ts
// add at module scope or inside the RAF effect
const lastWallRef = useRef<number | null>(null);
const accSecondsRef = useRef(0);
// inside drawFrame(time):
const last = lastWallRef.current ?? time;
const dt = Math.min(Math.max((time - last) / 1000, 0), 1 / 30); // clamp to 33 ms
accSecondsRef.current += dt;
lastWallRef.current = time;
const timeSeconds = accSecondsRef.current;
```
Reduced motion still pins `timeSeconds = 0` via the existing static branch — determinism preserved.

**Risk:** The accumulated clock is no longer wall-clock-aligned with ship cycle starts, but cycles are pure functions of `timeSeconds % cycleSeconds`, so visual continuity is the only contract. Snapshot tests on motion debug counters should still pass.

**Validation:** Cold load → switch tab → wait 5 minutes → return; ships and birds resume from where they were, not teleport. Watch `__pharosVilleDebug.motionFrameCount` increment monotonically.

---

### 2. Slim `lucide-react` imports

**Anchor:** `src/pharosville-world.tsx:4`, `src/components/world-toolbar.tsx:3` (12 icons via barrel). Audit found the production lazy chunk (`pharosville-desktop-data-*.js`) is **840 KB**.

**Symptom:** `lucide-react` is 39 MB on disk; the barrel imports keep ESM bookkeeping that bloats the chunk for 12 glyphs.

**Change:** rewrite imports as
```ts
import Home from "lucide-react/dist/esm/icons/home";
// or, simpler: inline the 12 SVGs as a tiny local module
```
Pin lucide minor version in `package.json` since per-icon paths can break on majors. Verify with `npm run build` and a `dist/` size diff.

**Risk:** lucide's per-icon path stability across major bumps. Mitigate with tests that render the toolbar.

**Validation:** `npm run build`; expect lazy chunk to drop **noticeably** (target: under 600 KB). `npm run test:visual` toolbar snapshot unchanged.

---

### 3. Preload manifest + hottest sprites in `index.html`

**Anchor:** `index.html` has no preload tags; load chain in `src/pharosville-world.tsx:97-130` is HTML → React mount → lazy chunk → first effect → `fetch(manifest.json)` → 24 sprite fetches.

**Change:** in `index.html` `<head>`, before module scripts:
```html
<link rel="preconnect" href="/api/" />
<link rel="preload" as="fetch" href="/pharosville/assets/manifest.json" crossorigin />
<link rel="preload" as="image" href="/pharosville/assets/landmarks/lighthouse-alexandria.png" />
<link rel="preload" as="image" href="/pharosville/assets/overlays/central-island.png" />
<link rel="preload" as="image" href="/pharosville/assets/docks/harbor-ring-quay.png" />
```
Also `<link rel="modulepreload">` for the prod-hashed `pharosville-desktop-data` chunk via a small `transformIndexHtml` Vite plugin.

**Risk:** if the manifest cache version changes mid-session (rare), the preload is wasted; the existing `style.cacheVersion` URL params already invalidate browser cache correctly.

**Validation:** Chrome DevTools → Network → Cold load → manifest and lighthouse PNG should start in the *same* RTT as the JS chunk, not after.

---

### 4. Float camera offsets — fix 1-px ship crawl

**Anchor:** `src/systems/camera.ts:79-81` (`offsetX: Math.round(offsetX), offsetY: Math.round(offsetY)`).

**Symptom:** Camera is integer-snapped while ship `tile` is float (drift, transit, mooring wobble). With `imageSmoothingEnabled = false` in `world-canvas.ts:429`, sub-pixel ship positions resolve to alternating integer pixels each frame → reads as a 1-px crawl.

**Change:** drop `Math.round` from `clampCameraToMap`. Keep camera as a float; the DPR transform (`ctx.setTransform(dpr, …)`) maps to device pixels cleanly. Round only at *user-driven* end-states (`panCamera` end, `zoomIn`/`zoomOut` end) if a tile-grid pop is feared.

**Risk:** `camera.test.ts` may pin integer offsets — update assertions. Visual diff: terrain edges may shift by ≤1 px at zoom snaps; keep `imageSmoothingEnabled = false` so edges remain crisp.

**Validation:** Side-by-side pan recording. `npm run test:visual` may need a baseline refresh on terrain tile boundaries — inspect diffs.

---

### 5. Hoist per-frame singletons onto frame state

**Anchor:** `src/renderer/world-canvas.ts:430-562`. Audit found `lighthouseRenderState` resolved 5+ times, `skyState` 2×, `visibleShipsForFrame` 2× per frame.

**Change:** at the top of `drawPharosVille`, compute once and stash on the existing `WorldCanvasFrame` (`world-canvas.ts:396-401`):
```ts
frame.lighthouse ??= lighthouseRenderState(frame);
frame.sky ??= computeSkyState(frame);
frame.visibleShips ??= visibleShipsForFrame(frame);
```
Replace downstream callers with the cached field.

**Risk:** None — pure refactor; the inputs don't change within a frame.

**Validation:** existing test suite passes. Profile: per-frame `tileToScreen` allocations drop.

---

### 6. Move `collectHitTargets` off the RAF loop

**Anchor:** `src/pharosville-world.tsx:255-263` calls it inside `drawFrame`; `src/renderer/hit-testing.ts:41-101` allocates entity arrays + sorts via `localeCompare` per call.

**Change:** maintain a hit-target snapshot in a ref. Recompute only when:
- pointer moves (already `pointermove` listener),
- selection/hover state changes,
- camera changes (after the float-camera change in #4, this is a discrete event from `panCamera`/`zoomIn`/`zoomOut`/`followTile`),
- ship motion-sample tile-cell changes by ≥1 (compute a stable cell hash and compare).

Replace `localeCompare` tiebreaker with a numeric entity index assigned at world-build time.

**Risk:** stale hover targets if a moving ship slides under a stationary cursor. Mitigate by checking on each ship-tile transition (cheap once shipMotionSamples is in a ref).

**Validation:** selection/hover browser suites pass; flame chart shows `collectHitTargets` ≤ 60×/min instead of 60/s.

---

### 7. Viewport tile-rect culling

**Anchor:** `src/renderer/world-canvas.ts:582-602` walks all 3136 tiles twice per frame, calling `tileToScreen` + `isTileInViewport` per tile.

**Change:** at the top of `drawTerrain`, project the four canvas corners to tile coordinates via `screenToTile`, take min/max with a 2-tile margin, and iterate only `tile.x ∈ [xMin..xMax], tile.y ∈ [yMin..yMax]`. Replace per-tile object allocation with two locals:
```ts
const px = tile.x * (TILE_W/2) + tile.y * (TILE_W/2) + camera.offsetX;
const py = tile.y * (TILE_H/2) - tile.x * (TILE_H/2) + camera.offsetY;
```

**Risk:** edge pop-in at fast pan; the 2-tile margin handles it.

**Validation:** With camera zoomed in, only ~400-800 tiles iterate vs 3136. Visual snapshot unchanged at default zoom.

---

### 8. Cache coast neighbors + area-label layout per world

**Anchor:** `src/renderer/layers/shoreline.ts:22-43` rebuilds `Map(world.map.tiles.map(...))` every frame; `src/renderer/world-canvas.ts:2358-2374` runs `areaLabelPlacementForArea` + `measureText` per area per frame.

**Change:** add to the world-build path (or memoize on a `WeakMap<World, …>`):
- `coastalEdgesByTile: Map<string, Edges>` — pre-computed once per world load.
- `areaLabelLayoutByZoom: Map<zoomBucket, AreaLayout[]>` — text width comes from a one-time `measureText` per zoom bucket.

In the renderer, look up rather than recompute.

**Risk:** None — both inputs are world-static.

**Validation:** Profile shows no per-frame `Map` allocations for coast lookups; first-frame layout is unchanged.

---

### 9. Cache sky gradient as offscreen canvas

**Anchor:** `src/renderer/layers/sky.ts:83-118` allocates 2 gradients + a full-canvas fill every frame.

**Change:** keep an offscreen canvas keyed by `(width, height, mood, firePoint.x|0, firePoint.y|0)`. Re-render only when those change; composite with one `drawImage`. Sun/moon/stars/clouds remain a separate per-frame pass.

**Risk:** None — gradient inputs already only change discretely.

**Validation:** Profile: per-frame fill drops; visual unchanged. Combine well with #16 (mood interpolation) so cache invalidates per smooth bin.

---

### 10. Drop the `0.18` wake-intensity floor (phantom-wake bug)

**Anchor:** `src/renderer/world-canvas.ts:3105`:
```ts
const intensity = Math.max(sampleIntensity, motion.plan.moverShipIds.has(ship.id) ? changeIntensity : 0.18);
```

**Symptom:** Any ship in `effectShipIds` (top 48 by mcap) draws a wake of at least 0.18 even when state is `moored` (sample.wakeIntensity = 0.05) or `risk-drift` (0.08). Docked titans show a wake while sitting still.

**Change:**
```ts
const isTransit = sample.state === "departing" || sample.state === "sailing" || sample.state === "arriving";
const intensity = isTransit
  ? Math.max(sampleIntensity, motion.plan.moverShipIds.has(ship.id) ? changeIntensity : 0)
  : 0; // moored / risk-drift: no wake
```

**Risk:** top-mcap ships lose a faint cosmetic glow at dock — that's the desired outcome (matches motion policy: wake only when actually moving). No registry change needed.

**Validation:** Reduced-motion ships show no wake (already correct); titan ships in motion still show prominent wakes; docked titans no longer trail water.

---

## Phase 2 — smoothness and cohesion (S–M effort)

### 11. Smoothstep mooring → transit position blend

**Anchor:** `src/systems/motion-sampling.ts:51-64`.

**Symptom:** Ship visibly snaps when departing/arriving — moored sample is `mooringTile + cos(angle)*radius`; transit sample at `progress=0` is the raw path start.

**Change:** extract `mooredOffset(route, stop, time)` helper. In the first/last 0.15 of `transitSample` progress, blend the wobble in/out using `smoothstep`. Pure math change, deterministic.

**Validation:** Slow-pan recording around a busy harbor — no visible snap on departure/arrival. Reduced-motion frame unchanged.

---

### 12. Eager-build water-route paths during idle deferred load

**Anchor:** `src/systems/motion-water.ts:55-81` (lazy `O(n²)` open-set scan); `src/systems/motion-sampling.ts:60` calls `route.waterPaths.get(...)` in the per-frame sample loop.

**Symptom:** First time a ship enters a transit state with a fresh path key, a synchronous A*-style search runs. With ~150 ships transitioning together right after the first reduced-motion → motion toggle, frame time spikes.

**Change:** during the idle deferred-load pass (`pharosville-world.tsx:138-178`), iterate every dock stop and warm `waterPaths.get(...)` for each. Reuses the existing dedup cache in `motion-planning.ts:20`.

**Validation:** Profiler: no path-search activity during the first 30 s of motion. Idle-load tail extends slightly — acceptable since it's after first paint.

---

### 13. Schema validation `warn` mode in prod

**Anchor:** `src/lib/api.ts:84-93` (`schema.safeParse`). Six endpoints validate every refetch.

**Change:** in prod, set `contractMode: "warn"` so deep zod parses don't run on the cache hot path. Beef up CI contract tests so dev catches drift.

**Risk:** loses runtime guarantee about API drift. Compensate with stronger contract tests; keep `strict` in dev.

**Validation:** Cold load shows no `safeParse` cost in flame chart; CI contract suite catches deliberate schema drift.

---

### 14. Refs for hover/select/motionPlan in RAF effect

**Anchor:** `src/pharosville-world.tsx:233-323` — effect deps include `hoveredDetailId`, `selectedDetailId`, `motionPlan`, `assetLoadTick`. Two audits independently flagged this.

**Symptom:** Every hover transition cancels and restarts the RAF loop, adding a one-frame stall and reallocating closure state.

**Change:** keep `hoveredDetailId`, `selectedDetailId`, `motionPlan`, and `camera` in refs synced from a separate light effect. The RAF effect binds once per `world`/`canvasSize`/`reducedMotion`.

**Risk:** subtle closure capture; preserve the `criticalFramePainted` setter logic and `__pharosVilleDebug.activeMotionLoopCount === 1` invariant.

**Validation:** Profiler: no `cancelAnimationFrame` on hover. Existing motion-policy tests pass.

---

### 15. Memoize world reference + `React.memo` on PharosVilleWorld

**Anchor:** `src/pharosville-desktop-data.tsx:57-87` rebuilds the world from 12 deps; `apiFetchWithMeta` returns new object identities even on byte-identical JSON.

**Symptom:** every 15-min refetch tears down the RAF loop and rebuilds derived state. Visible jitter at the refetch boundary.

**Change:**
- `useRef<World>` cache; structural-compare against a hash of `meta.updatedAt`/payload counts; reuse prior reference if equal.
- Wrap `<PharosVilleWorld>` with `React.memo(equalityFn)` keyed off the structural hash.

**Risk:** stale closure if `worldRef` not synced with selection-clearing logic. Add a test for selection clearing on world swap.

**Validation:** Synthetic "force refetch" — observe no RAF teardown, no ship snap.

---

### 16. Shared wind/sea phase across ambient cues

**Anchor:** ambient effects each pick their own arbitrary frequency. Beam pulse `t*0.7`, sea-glow `t*0.8`, clouds `t*0.035`, mist `t*0.38`, rollup `t*0.72`, causeway `t*0.85`.

**Symptom:** independently swimming ambient effects → visual chaos rather than a coherent maritime tempo.

**Change:** in `src/systems/motion-config.ts`, declare canonical phases:
```ts
export const WIND_HZ = 0.04;  // very slow
export const SEA_HZ = 0.7;    // ambient swell
export const BEACON_HZ = 0.7; // shared lighthouse pulse
```
Compute `wind = sin(time * WIND_HZ * 2π)` and `sea = sin(time * SEA_HZ * 2π)` once per frame in `drawPharosVille`, expose on `PharosVilleCanvasMotion`. Ambient uses (cloud drift, mist drift, surf wash, shoreline drift, causeway shimmer) consume those plus per-instance offsets. Beam and lamps keep their own (different speed class per motion policy).

**Risk:** test diffs in `pharosville-world.test.ts` if any pin ambient values; otherwise additive. Registry: ambient atmosphere is exempt — no new cue.

**Validation:** Side-by-side recording — clouds, mist, surf now share visible tempo. Reduced-motion frame still pins all to 0.

---

## Phase 3 — the big render-cache win (L)

### 17. Static-layer offscreen canvas (terrain / headland / cemetery / scenery)

**Anchor:** `src/renderer/world-canvas.ts:582-2722` — terrain, district pads, seawalls, cemetery ground, headland, dock quays, scenery props all redrawn every RAF tick despite depending only on `(camera.zoom, camera.offsetX, camera.offsetY)`.

**Change:** introduce a `StaticLayerCache` keyed by quantized `(zoom, offsetX|0, offsetY|0)`:
- on cache miss, paint terrain + district pads + seawalls + cemetery ground + headland + dock body underlays + scenery props onto an offscreen canvas sized to the viewport;
- on hit, single `drawImage` to the main canvas as the first opaque pass;
- pool of 2 (`current`, `prev`) for smooth panning;
- invalidate on `assetLoadTick` and on world swap.

Animated overlays — water shimmer (only ~350 of 1500 visible water tiles draw waves), wakes, ships, birds, lamps, beam, shoals, foam — continue to draw per frame on top.

Extends `src/renderer/frame-cache.ts:5-41` from per-call to renderer-scoped.

**Risk:** staircasing on zoom transitions — mitigate with cache invalidation on every camera mutation and the 2-canvas pool. `npm run test:visual` will need baseline review on first/last frame across pan; only update snapshots after careful inspection.

**Validation:** Frame budget: target a 30-50% reduction in steady-state CPU per frame on a 1280×800 desktop. `__pharosVilleDebug.motionFrameCount` cadence remains stable when scrubbing.

---

## Phase 4 — aliveness polish (S–M, all bounded by motion policy)

All three pieces below extend existing scenery behavior. None introduce new analytical semantics; none require new visual-cue registry entries (they ride existing ambient families). Each has a static reduced-motion equivalent.

### 18. Lamp light-cone on adjacent water

**Anchor:** every existing `harbor-lamp` SCENERY_PROP (west, east, civic, cemetery, lighthouse) — `src/renderer/world-canvas.ts:175-222`, `:2259` (`drawLamp`).

**Visual:** soft amber elliptical wash on the water tile immediately seaward of each lamp, breathing at the same `time * 0.9 + prop.tile.y` phase already used by `drawLamp`. Static cone, alpha breath only.

**Cue family:** ambient extension of harbor-lamp — no new registry entry. Reduced-motion: solid (non-breathing) cone at midpoint alpha.

**Effort/Impact:** S/M. **Risk:** low — lamp-on-water reads as ambient, not analytical. Tie cone position strictly to lamp positions, never to dock activity.

---

### 19. Lighthouse hearth ember flicker (no smoke)

**Anchor:** `firePoint` from `lighthouseRenderState` (`src/renderer/world-canvas.ts:2050-2071`).

**Visual:** 2-3px warm dither immediately around the existing fire glow, alpha modulated at the existing `motion.plan.lighthouseFireFlickerPerSecond`. Sub-pixel ember motes that fade within ~30 px. **No smoke plume** — smoke would imply real combustion process.

**Cue family:** extends `cue.lighthouse.psi` glow channel — already animated. Reduced-motion: static warm dot cluster at mean alpha.

**Effort/Impact:** S/M. **Risk:** must not become a smoke plume; hearth color must stay PSI-driven to preserve the invariant.

---

### 20. Beam-on-sail rim light (signature touch)

**Anchor:** lighthouse beam wedge crossing ship sprites in calm/watch water — `src/renderer/world-canvas.ts:2200-2230` (beam math) plus ship-body draw.

**Visual:** when the rotating beam's screen-space wedge contains a ship's sail bbox, brighten 2 sail edge pixels with a warm tint for the duration of intersection.

**Cue family:** extends `cue.lighthouse.psi` (beam) and `cue.ship.pennant` (sail) — beam-on-sail interaction. **No new registry entry needed** — both already document themselves in DOM/ledger; this is the existing PSI beam light incidentally touching the ship sail. Reduced-motion: no rim light (beam and sail are already static).

**Effort/Impact:** M/L. **Risk:** keep rim-light intensity *constant*. Do **not** modulate by ship importance/risk — that would smuggle analytical meaning into the rim. Computationally cheap if the wedge bbox vs. ship bbox check uses the cached `frame.visibleShips` from #5.

---

## Sequencing rationale

Phase 1 lands ten quick wins on top of the current architecture without touching the renderer's structure. Wins #5, #6, #8 also unblock #17 (static-layer cache) by isolating the per-frame singletons and decoupling hit-testing.

Phase 2 layers smoothness and cohesion on top of the now-stable RAF clock from #1. #14 + #15 together eliminate refetch-time RAF teardown, which is a prerequisite for #17 (you don't want to invalidate the static-layer cache on every refetch).

Phase 3 is the big one. Land it after #14/#15 stabilize the world identity, and after #5/#7/#8 clean up per-frame allocations.

Phase 4 is best done last so aliveness sits on a fast, smooth base — otherwise more atmosphere on a janky frame loop just amplifies the jank.

---

## Validation matrix

Each task should run, at minimum:
- `npm run typecheck`
- `npm test` (unit suites — motion, hit testing, asset manager, world model)
- relevant scenario in `npm run test:visual` (review diffs before updating baselines)

Before broad completion claims:
- `npm run check:pharosville-assets`
- `npm run check:pharosville-colors`
- `npm run build`
- full `npm run test:visual`
- live smoke once deployed: `npm run smoke:live -- --url https://pharosville.pharos.watch`

Performance-specific sanity checks (manual):
- DevTools Performance: median frame time at 1280×800 with motion on, scrubbing, hovering across ships, switching tabs and returning. Target: median ≤16 ms, p95 ≤25 ms, no GC spike on tab return.
- Cold load TTI: Network throttled to "Fast 4G" — first canvas frame target under 2.0 s after lazy-chunk download starts (down from baseline; measure baseline first as the audit's reference number is `dist` chunk size, not TTI).

---

## Out of scope / not chosen

The following came up in the audits and were intentionally **not** in the top 20:

**Renderer micro-opts that ride along with #17 anyway:**
- Tile-loop `save/restore` cleanup. Important, but #17 absorbs most of the cost by skipping the loop on cache hit.
- `drawSeawallRun` / cemetery ground walks all 3136 tiles. Folded into the static-layer cache.
- Lamp `createRadialGradient` per frame. Folded into the static-layer cache (lamp position is static; only flicker animates).
- Bake area labels / dock flag crests / sail logos into offscreen canvases. Real win, but only after #17 lands and the per-frame text cost is the next-largest item.

**Aliveness ideas saved for a follow-up sprint** (in the aliveness audit but lower priority than #18-#20):
- Reed/grass sway, headland accent breathing, lamp moth flutters, buoy reflection breathing, cemetery cypress wobble — each is S effort and would land naturally as a "polish wave" once #17 makes the frame budget generous.
- Wave-swell vertical bob by zone (L impact / M effort) — touches `cue.ship.motion`; requires a registry-doc tweak and careful regression testing on hit boxes.
- Wind banner on plaque masts — needs a uniformity check so banner colors never collide with peg-pennant palette.
- Distant perimeter sail traffic (L impact / M effort) — high payoff but high risk: must be ungrabbable, untyped, distinctly different silhouette so viewers never confuse them with stablecoin ships. Add only after the rest is stable.

**Asset and bundling follow-ups:**
- `manualChunks` split. Audit suggested it for finer chunking; in practice #2 (lucide slim) and #3 (preload) deliver the bulk of the cold-load win. Revisit if `dist` chunk audit still shows a bottleneck after #2.
- AVIF/WebP sprite negotiation. Run `oxipng -o4 --strip safe` first (lossless, ~30-50% smaller, no code change). Format negotiation only worth doing if PNGs still look heavy.
- `build.target` raised to `es2022`. Worth doing eventually; small TTI win, low priority next to #1-#3.

**Ideas explicitly rejected from the aliveness audit:**
- Lighthouse smoke plume — implies real combustion process; ember flicker (#19) is the disciplined alternative.
- Shore-bird startle on wind events — there is no wind state in the data model. The cemetery quiet flock variant has no analytical hook and is the safer reframing.
- Harbor smoke / chimney smoke — implies dock activity (transfers/transactions), which `VISUAL_INVARIANTS.md:48-49` forbids docks from implying.
- Floating storm-strait debris — reads as wreckage / peg-failure analytical hint.
- Lights coming on in civic windows when 24h supply rises — faux-liveness mapping a real signal; would need a new cue with DOM parity and is feature work, not atmosphere.

---

## Confirmed non-issues (no work needed)

The audits explicitly verified these are already correct:

- Critical sprites pre-decode via `image.decode()` before first RAF tick — `src/renderer/asset-manager.ts:342-353`.
- Tinted ship sails are cached at module scope (`shipSailTintCache` at `src/renderer/world-canvas.ts:324`). Only opportunity: store on a `WeakMap<ShipLivery, …>` to skip per-frame string-key construction at `:4239` — small enough to land alongside other touches.
- `refetchOnWindowFocus` already disabled globally in `src/main.tsx:6-12`.
- Deferred sprite loading correctly waits for `criticalFramePainted` AND uses `requestIdleCallback` — `src/pharosville-world.tsx:132-178`.
- RAF cleanup on unmount/HMR is correct — no leaks.
- Reduced-motion is genuinely deterministic across reloads.
- `motion-water.ts` correctly memoizes per `(zone, pathKey)`.
- `frame-cache.ts` correctly dedupes geometry/asset lookups within a single frame.
- No lodash / heavy date libraries in `package.json`.

---

## File-by-file summary of touched code

| File | Items touching it |
|---|---|
| `src/pharosville-world.tsx` | #1, #3, #6, #14, #15 |
| `src/systems/camera.ts` | #4 |
| `src/systems/motion-config.ts` | #16 |
| `src/systems/motion-sampling.ts` | #11 |
| `src/systems/motion-water.ts` | #12 |
| `src/lib/api.ts` | #13 |
| `src/renderer/world-canvas.ts` | #5, #7, #8, #10, #16, #17, #18, #19, #20 |
| `src/renderer/layers/sky.ts` | #9, #16 |
| `src/renderer/layers/shoreline.ts` | #8 |
| `src/renderer/hit-testing.ts` | #6 |
| `src/renderer/frame-cache.ts` | #17 |
| `src/components/world-toolbar.tsx` | #2 |
| `index.html` | #3 |
| `src/main.tsx` | #15 (prefetch warmup) |
| `vite.config.ts` | #2 (manualChunks helper, optional) |
| `src/pharosville-desktop-data.tsx` | #15 |

No changes proposed to `docs/pharosville/MOTION_POLICY.md`, `VISUAL_INVARIANTS.md`, or `visual-cue-registry.ts` — every aliveness item rides an existing ambient family. If a future phase pulls in #14 (cemetery flock) or zone-bob (wave swell), the policy/registry deltas get added at that time.
