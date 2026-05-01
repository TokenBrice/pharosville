# PharosVille - Need For Speed 3 (NFS3) Review

Date: 2026-05-01
Author: Codex swarm synthesis
Scope: standalone PharosVille app at `/home/ahirice/Documents/git/pharosville` only.

## Goal

NFS3 is a review backlog, not an implementation patch. It prioritizes the next
speed, runtime performance, documentation, test, and maintainability work after
the current NFS and NFS2 tracks. The list keeps the existing PharosVille
contracts intact:

- The browser calls same-origin `/api/*` only.
- `PHAROS_API_KEY` stays server-side in the Pages Function.
- Narrow/short viewports must not mount the world runtime, fetch world data,
  fetch the manifest, decode sprites, or start canvas work.
- Reduced motion remains deterministic and does not run a RAF loop.
- Canvas visual meaning keeps DOM/detail/accessibility parity.

## Baseline Observations

Observed from `npm run build` on 2026-05-01:

- Entry chunk: `dist/assets/index-*.js` = 222.28 KB raw / 69.30 KB gzip.
- Desktop lazy chunk: `dist/assets/pharosville-desktop-data-*.js` = 883.37 KB
  raw / 242.00 KB gzip.
- CSS: 13.17 KB raw / 3.11 KB gzip.
- Total `dist`: about 8.6 MB, dominated by copied logos and chain assets.
- Runtime PharosVille assets: about 756 KB in `dist/pharosville/assets`.
- Asset manifest: 34 assets, 24 critical/first-render, 10 deferred, manifest
  size about 31 KB.
- The desktop chunk contains Zod and a large shared schema/cron/freshness graph.

Implementation status, 2026-05-01:

- Asset/docs/test guard subset landed: first-render asset budgets, image
  byte/decoded-pixel ceilings, display-scale waste warnings, bundle-size
  checker, `agents/**` markdown path checking, and docs alignment for the
  current 8-chain-harbor cap plus DOM-only short fallback coverage.

The current code already includes important NFS wins: lazy desktop mount,
structural world caching, staged asset loading, static canvas layer caching,
hit-target cell hashing, one route-owned RAF loop, and deterministic
reduced-motion frames. NFS3 focuses on the remaining bottlenecks and the tests
needed to keep them fixed.

## Top Priority List

Effort: S = under a day, M = 1-3 days, L = 3+ days.
Impact: S = useful, M = noticeable, L = major or correctness-critical.

| # | Task | Area | Effort | Impact | Priority |
|---:|---|---|:---:|:---:|:---:|
| 1 | Remove production Zod/shared schema graph from the client bundle | Bundle/API | M | L | P1 |
| 2 | Fix world-cache invalidation so changed payloads cannot be hidden | Data correctness/perf | S | L | P1 |
| 3 | Add Cloudflare edge caching for allowlisted read proxy responses | API/network | M | L | P1 |
| 4 | Enforce first-render asset budgets and split critical phases | Assets/load | M | L | P1 |
| 5 | Stop React Query rest destructuring from broadening rerenders | React/data | S | M | P1 |
| 6 | Avoid cold-start cascade world rebuilds from staggered query arrivals | React/data | M | M | P1 |
| 7 | Cut RAF hot-path allocations in motion samples and hit hashes | Runtime/canvas | M | M | P1 |
| 8 | Preserve motion clock across asset-load RAF effect rebinds | Runtime correctness | S | M | P1 |
| 9 | Replace closure-heavy drawable creation with descriptors/scratch arrays | Renderer | M | M | P2 |
| 10 | Split static terrain base from dynamic water overlays | Renderer | M | M | P2 |
| 11 | Cache shoreline candidate tiles and viewport-cull dynamic shoreline | Renderer | S | M | P2 |
| 12 | Add real perf, bundle, and asset budgets to tests/docs | Testing/docs | M | L | P2 |
| 13 | Add image byte/display-size budgets and allow optimized formats | Assets/tooling | M | M | P2 |
| 14 | Add deliberate Vite chunk strategy and bundle reporting | Build/tooling | S | M | P2 |
| 15 | Modulepreload the desktop chunk only for desktop viewports | Load path | M | M | P2 |
| 16 | Add equality guards and RAF batching for camera/resize state | React/runtime | S/M | M | P2 |
| 17 | Improve hit-test indexing and cache canvas rects | Interaction | S/M | S/M | P3 |
| 18 | Binary-search or pre-index water path sampling | Motion | S | S/M | P3 |
| 19 | Correct docs drift around dock cap and short fallback snapshots | Docs/tests | S | M | P3 |
| 20 | Extend markdown drift checks to cover `agents/**` references | Docs/tooling | S | S | P3 |

## P1 Tasks

### NFS3-01 - Remove production Zod/shared schema graph from the client bundle

Anchors:
- `src/hooks/api-hooks.ts`
- `src/hooks/use-stablecoins.ts`
- `src/hooks/use-chains.ts`
- `src/lib/api.ts`
- `shared/lib/pharosville-api-contract.ts`

Problem:
Production client code imports `PHAROSVILLE_API_CONTRACT`, which imports Zod
schemas and shared freshness/cron constants. The desktop lazy chunk is about
883 KB raw / 242 KB gzip and includes the Zod runtime plus shared schema graph.

Implementation:
- Split the shared contract into:
  - a lightweight runtime client module with endpoint path, query key,
    `metaMaxAgeSec`, and producer cadence primitives only;
  - a validation/test module with the Zod schemas.
- In production client hooks, pass no schema or dynamically import schema
  validators only in dev/test.
- Keep strict schema validation in tests and local development.
- Add a bundle budget script that runs after `vite build` and asserts gzip
  limits for the entry and desktop chunks.

Tests:
- `npm run typecheck`
- `npm test -- src/hooks/api-hooks.test.ts src/lib/api.test.ts`
- `npm run build`
- New: `npm run check:bundle-size`

Acceptance:
- Desktop lazy chunk gzip materially drops from the current 242 KB baseline.
- Production still handles API drift intentionally, either by dev-only
  validation, warn-mode telemetry, or server-side validation.
- No client-side secrets or cross-origin browser API calls are introduced.

### NFS3-02 - Fix world-cache invalidation

Anchors:
- `src/pharosville-desktop-data.tsx`

Problem:
`worldHash` keys on route mode, `_meta.updatedAt`, `_meta.status`, and data
presence. If a payload changes with unchanged or absent meta, the cached world
can stay stale. This is a correctness risk created by a performance cache.

Implementation:
- Replace the current `metaToken` with cheap endpoint-specific semantic tokens.
- Include payload-level `updatedAt` where present.
- Include counts and stable ID/key summaries for arrays/maps that affect world
  build output:
  - stablecoin IDs/counts and chain-circulating dimensions;
  - chain IDs/counts/top supply dimensions;
  - stress signal keys and score bands;
  - peg summary coin IDs and status dimensions;
  - report-card IDs and grade/risk dimensions.
- Alternatively key the cache by React Query data identities after ensuring
  structural sharing is stable enough.

Tests:
- Add a test that returns two different payloads with identical `_meta` and
  asserts the ledger/detail/world output updates.
- `npm test -- src/hooks src/systems/pharosville-world.test.ts`
- Visual sanity: `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"`

Acceptance:
- Identical payloads still skip rebuilds.
- Changed payloads with unchanged meta rebuild the world.

### NFS3-03 - Add Cloudflare edge caching for allowlisted API reads

Anchors:
- `functions/api/[[path]].ts`
- `functions/api/proxy.test.ts`

Problem:
Every desktop session starts six parallel `/api/*` requests. The Pages Function
always fetches upstream and only forwards cache headers; it does not cache or
deduplicate at the edge.

Implementation:
- Cache allowlisted `GET` responses only.
- Cache only successful JSON responses, likely status `200`.
- Key by same-origin URL path/search only. Do not include `PHAROS_API_KEY`.
- Use `caches.default` or Cloudflare `fetch` cache options.
- Preserve forwarded freshness headers: `cache-control`, `etag`, `warning`,
  `x-data-age`, `retry-after`, `content-type`.
- Do not cache proxy configuration errors, upstream failures, non-GET methods,
  or not-found responses.

Tests:
- Extend `functions/api/proxy.test.ts`:
  - cache miss calls upstream and stores response;
  - cache hit returns cached body without upstream fetch;
  - non-200 is not cached;
  - `PHAROS_API_KEY` is never exposed in response headers/body or cache key;
  - allowlist behavior remains exact.
- `npm test -- functions/api/proxy.test.ts`
- `npm run smoke:live -- --url https://pharosville.pharos.watch` after deploy.

Acceptance:
- Fresh desktop sessions can reuse edge-cached endpoint bodies.
- The server-side secret remains server-side.

### NFS3-04 - Enforce first-render asset budgets and split critical phases

Anchors:
- `public/pharosville/assets/manifest.json`
- `src/renderer/asset-manager.ts`
- `scripts/pharosville/validate-assets.mjs`

Problem:
The manifest currently has 24 critical/first-render assets out of 34 total.
Most PNG payload bytes are loaded before first coherent readiness. The validator
caps total manifest entries but not critical count, decoded pixels, critical
bytes, duplicate `requiredForFirstRender`, or first-paint decode concurrency.

Implementation:
- Add manifest phases, for example:
  - `shellCritical`: canvas can paint coherent terrain, lighthouse, core island;
  - `visibleCritical`: high-priority visible sprites near default camera;
  - `animationDeferred`: sprite sheets and visual-only enhancements.
- Load static titan stills before frame sheets.
- Add critical decode concurrency, not `assets.length` concurrency.
- Add validator budgets:
  - max total assets;
  - max first-render asset count;
  - max first-render bytes;
  - max first-render decoded pixels;
  - max total decoded pixels;
  - duplicate/missing `requiredForFirstRender` detection.

Tests:
- `npm run check:pharosville-assets`
- `npm test -- src/renderer/asset-manager.test.ts src/systems/asset-manifest.test.ts`
- `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell|dense visual fixture"`

Acceptance:
- First paint does not wait on animation sheets or off-screen/lower-priority
  harbor sprites.
- Visual first frame remains coherent, with intentional fallbacks only.

### NFS3-05 - Stop React Query result rest destructuring rerenders

Anchors:
- `src/hooks/use-api-query.ts`

Problem:
`const { data, ...rest } = useQuery(...)` can subscribe the hook to every query
result field. Background refetch state changes can rerender
`PharosVilleDesktopData` even when the world-relevant fields are unchanged.

Implementation:
- Return an explicit narrow result shape instead of object rest.
- Or configure `notifyOnChangeProps` for only the fields the route consumes:
  `data`, `error`, `isLoading`, `refetch`.
- Keep `meta` extracted without broad query-result tracking.

Tests:
- Add a hook render-count test that simulates an `isFetching`-only transition
  and asserts the world build is not triggered.
- `npm test -- src/hooks/api-hooks.test.ts`

Acceptance:
- Background refetch bookkeeping does not recreate query result objects that
  matter to `PharosVilleDesktopData`.

### NFS3-06 - Avoid cold-start cascade world rebuilds

Anchors:
- `src/pharosville-desktop-data.tsx`

Problem:
The six queries start in parallel, which is correct, but the route switches to
`world` as soon as any endpoint has data. Later endpoint arrivals can rebuild
the whole world repeatedly and rebind canvas, motion, and logo effects.

Implementation:
- Keep network parallel.
- During first desktop load, wait for the initial query wave to settle before
  mounting/swapping the canvas world, or render a stable loading world until the
  required data quorum arrives.
- Preserve the last complete world during background refetches and swap
  atomically after the relevant endpoints settle.
- Consider `useQueries` to combine status and reduce repeated hook plumbing.

Tests:
- Add a Playwright route test with six endpoints delayed at different times.
- Assert the canvas world appears once after the chosen first-settle condition.
- Instrument or spy on `buildPharosVilleWorld` in a component test to cap initial
  build count.
- `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"`

Acceptance:
- Cold start avoids repeated world identity churn while still showing useful
  loading/error states.

### NFS3-07 - Cut RAF hot-path allocations

Anchors:
- `src/pharosville-world.tsx`
- `src/systems/motion.ts`
- `src/renderer/hit-testing.ts`

Problem:
Normal motion still allocates a new `Map` of motion samples every RAF frame.
`shipCellHash` rebuilds `shipsById`, creates sorted string parts, and debug
helpers allocate arrays. This creates avoidable GC pressure in the hottest path.

Implementation:
- Memoize `shipsById` and stable ship order per `world`.
- Make `shipCellHash` iterate `world.ships` in stable order and avoid sorting.
- Consider a reusable mutable motion sample map/array internally, with immutable
  snapshots only for debug/tests.
- Avoid building debug arrays unless visual debug is enabled.

Tests:
- `npm test -- src/systems/motion.test.ts src/renderer/hit-testing.test.ts`
- `npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|dense visual fixture"`
- Add a dense-motion budget assertion for draw duration and frame debug counts.

Acceptance:
- Existing motion semantics and hit targets stay aligned.
- Dense normal-motion GC pressure is lower in browser profiling.

### NFS3-08 - Preserve motion clock across asset-load rebinds

Anchors:
- `src/pharosville-world.tsx`

Problem:
The RAF effect depends on `assetLoadTick`. When deferred assets or logos load,
the effect can rebind and clear `lastWallRef`/`accSecondsRef`, causing motion
time to jump or reset.

Implementation:
- Preserve accumulated time across asset-load-only effect rebinds.
- Reset only on world replacement or explicit reduced-motion transition.
- Track a world identity token separately from asset load ticks.

Tests:
- Add a browser assertion that `timeSeconds` is monotonic across deferred asset
  settlement in normal motion.
- `npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|live reduced-motion"`

Acceptance:
- Deferred sprite/logo settlement does not visually restart or teleport ships.

## P2 Tasks

### NFS3-09 - Replace closure-heavy drawables with descriptors

Anchors:
- `src/renderer/world-canvas.ts`
- `src/renderer/layers/entity-pass.ts`
- `src/renderer/drawable-pass.ts`

Problem:
Entity rendering builds arrays of draw closures and sorts them every frame.
This is flexible but allocation-heavy.

Implementation:
- Replace closure drawables with lightweight descriptors:
  `{ kind, pass, entityIndex, depth, bounds }`.
- Use a switch/dispatcher to draw descriptors.
- Use reusable scratch arrays for the frame.
- Count passes while drawing instead of reducing a new array afterward.

Tests:
- `npm test -- src/renderer/drawable-pass.test.ts src/renderer/frame-cache.test.ts`
- Visual: `npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture|normal motion"`

Acceptance:
- Draw order remains unchanged.
- Per-frame allocations fall in browser profiling.

### NFS3-10 - Split static terrain base from dynamic water overlays

Anchors:
- `src/renderer/world-canvas.ts`
- `src/renderer/layers/terrain.ts`

Problem:
The static layer cache includes water drawing that depends on motion/time. Since
the cache key excludes time, that water animation is effectively frozen. Adding
time to the key would destroy the static cache.

Implementation:
- Split terrain drawing into:
  - static base: tiles, headland, ground, background docks;
  - dynamic overlay: foam, current streaks, storm chop, and other time-based
    water cues.
- Keep reduced motion deterministic with static overlay positions.

Tests:
- `npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|reduced motion|dense visual fixture"`
- Add a targeted visual/debug assertion that dynamic water cues advance in
  normal motion but not in reduced motion.

Acceptance:
- Static cache remains useful.
- Water animation is not frozen in normal motion.

### NFS3-11 - Cache shoreline candidates and viewport-cull dynamic shoreline

Anchors:
- `src/renderer/layers/shoreline.ts`
- `src/renderer/world-canvas.ts`

Problem:
The shoreline pass can scan all 3136 map tiles every RAF frame. Only coastal
water tiles and visible viewport bounds matter.

Implementation:
- Cache coastal water tile candidates in a `WeakMap` keyed by map/world.
- Reuse terrain's projected viewport tile bounds before drawing.
- Keep a small tile margin to avoid pop-in during pan/zoom.

Tests:
- `npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion|desktop canvas shell"`
- Unit test for candidate caching if extracted.

Acceptance:
- Shoreline visual output is unchanged.
- The per-frame shoreline loop is bounded by visible candidates.

### NFS3-12 - Add executable performance, bundle, and asset budgets

Anchors:
- `tests/visual/pharosville.spec.ts`
- `docs/pharosville/TESTING.md`
- `scripts/pharosville/validate-assets.mjs`
- new `scripts/check-bundle-size.mjs`

Problem:
Current visual tests catch catastrophic stalls, but thresholds like 90 ms draw
duration are too loose for performance regression work. Bundle and asset first
paint budgets are not encoded.

Implementation:
- Document current budgets in `docs/pharosville/TESTING.md`:
  - desktop lazy chunk gzip target;
  - entry chunk gzip target;
  - first-render asset count/bytes/decoded pixels;
  - dense fixture draw p95 target;
  - drawable count and visible tile budget;
  - canvas backing pixel caps.
- Add executable checks where stable:
  - bundle gzip budget after build;
  - asset manifest budgets in validator;
  - visual p95 budgets in Playwright with CI-safe thresholds.

Tests:
- `npm run check:bundle-size`
- `npm run check:pharosville-assets`
- `npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture|normal motion|ultrawide"`

Acceptance:
- Future changes fail fast when they regress load or draw budgets.

### NFS3-13 - Add image byte/display-size budgets and optimized formats

Anchors:
- `public/pharosville/assets/manifest.json`
- `scripts/pharosville/validate-assets.mjs`
- `docs/pharosville/ASSET_PIPELINE.md`

Problem:
The image pipeline validates PNG dimensions and references but not byte size,
alpha trimming, decoded pixels, or displayed-size waste. Several sprites are
larger than their display scale needs.

Implementation:
- Add per-category max byte and decoded-pixel budgets.
- Warn or fail when large sprites use `displayScale < 0.8` without a reason.
- Allow optimized lossless WebP or PNG8 only if browser support and visual diffs
  pass.
- Update `ASSET_PIPELINE.md` with optimization commands and acceptance rules.

Tests:
- `npm run check:pharosville-assets`
- Validator fixture tests for oversized files and unsupported formats.
- Visual diffs for every converted or resized asset.

Acceptance:
- Asset byte reductions do not change visual semantics or hitbox geometry.

### NFS3-14 - Add deliberate Vite chunk strategy and bundle reporting

Anchors:
- `vite.config.ts`
- `package.json`

Problem:
The desktop route is lazy-loaded, but vendor/runtime/schema code is not
intentionally chunked or budgeted. Long-term cache reuse and regression
visibility are weak.

Implementation:
- After removing production schemas, add `manualChunks` for stable vendor
  groups such as React/ReactDOM/React Query.
- Set `build.target` intentionally to match `tsconfig`/browser support.
- Add a build report or gzip-size script that prints chunk names and fails
  budgets in CI.
- Keep chunk count modest; avoid over-fragmenting the desktop route.

Tests:
- `npm run build`
- `npm run check:bundle-size`
- `npm run test:visual:dist`

Acceptance:
- Bundle output is predictable and budgeted.

### NFS3-15 - Desktop-gated modulepreload for the desktop chunk

Anchors:
- `index.html`
- `vite.config.ts`
- `src/client.tsx`

Problem:
`index.html` preloads the asset manifest but the lazy desktop JS chunk is only
discovered after the entry bundle runs and the viewport gate passes. The
same-origin `/api/` preconnect is unlikely to help.

Implementation:
- Remove low-value same-origin API preconnect if measurement confirms no win.
- Add a Vite `transformIndexHtml` or manifest-based post-build step that adds
  a media-gated `modulepreload` for the desktop chunk.
- Preserve narrow fallback: below the desktop gate, no world data/assets should
  be requested.

Tests:
- `npm run build`
- Inspect `dist/index.html`.
- `npx playwright test tests/visual/pharosville.spec.ts --grep "narrow fallback|short desktop fallback|desktop gate"`

Acceptance:
- Desktop chunk discovery starts earlier on eligible viewports.
- Narrow/short viewports still make zero gated requests.

### NFS3-16 - Equality guards and RAF batching for camera/resize state

Anchors:
- `src/pharosville-world.tsx`

Problem:
Resize writes fresh `{ x, y }` objects and clamps camera even when dimensions
are unchanged. Drag writes React camera state on every pointer move, which can
recompute hit targets and repaint reduced-motion frames.

Implementation:
- Add equality guards to `setCanvasSize` and camera setters.
- Cache the canvas bounding rect from resize and update it when layout changes.
- Consider RAF-batching drag camera updates with refs, committing React state at
  frame cadence.

Tests:
- Existing canvas interaction and reduced-motion tests.
- New component/browser test that repeated same-size resize does not advance
  paint/debug state.

Acceptance:
- Drag and resize stay responsive with fewer React state commits.

## P3 Tasks

### NFS3-17 - Improve hit-test indexing

Anchors:
- `src/renderer/hit-testing.ts`
- `src/pharosville-world.tsx`

Problem:
Hit testing is linear over targets on pointer move. Target count is currently
modest, but dense scenes and moving ships can make this path noisier than
needed.

Implementation:
- Keep targets priority-sorted descending and return the first hit.
- Or build a simple screen-grid index when collecting targets.
- Use cached canvas rects rather than reading `getBoundingClientRect` per
  pointer event.

Tests:
- `npm test -- src/renderer/hit-testing.test.ts`
- `npx playwright test tests/visual/pharosville.spec.ts --grep "canvas interactions|normal motion"`

Acceptance:
- Selection priority remains identical.
- Pointer move cost is bounded and predictable.

### NFS3-18 - Binary-search or pre-index water path sampling

Anchors:
- `src/systems/motion-water.ts`

Problem:
Water path sampling walks cumulative lengths from the beginning for every
sampled transit. This is acceptable today but scales poorly with route count and
path length.

Implementation:
- Binary-search cumulative lengths.
- Or store segment lookup metadata when building `ShipWaterPath`.

Tests:
- `npm test -- src/systems/motion.test.ts`
- Add direct tests for segment lookup at start, middle, end, and exact segment
  boundaries.

Acceptance:
- Motion sample output is unchanged.
- Sampling cost scales logarithmically or O(1) with pre-indexing.

### NFS3-19 - Correct docs drift around dock cap and fallback snapshots

Anchors:
- `src/systems/chain-docks.ts`
- `docs/pharosville/CURRENT.md`
- `docs/pharosville/SCENARIO_CATALOG.md`
- `docs/pharosville/VISUAL_REVIEW_ATLAS.md`
- `tests/visual/pharosville.spec.ts`

Problem:
Some docs say the dense harbor cap is 10 while code/tests enforce 8. The visual
atlas also references short-height fallback coverage, but the short fallback
test has no screenshot baseline.

Implementation:
- Decide whether the product wants 8 or 10 chain harbors.
- If 8 is current truth, update docs to "top eight chain harbors".
- If 10 is desired, update `MAX_CHAIN_HARBORS`, placement tests, renderer
  budgets, and visual baselines.
- Add `pharosville-short-fallback.png` screenshot baseline or update the atlas
  to state the short fallback is DOM-only.

Tests:
- `npm test -- src/systems/chain-docks.test.ts src/systems/pharosville-world.test.ts`
- `npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture|short desktop|narrow fallback"`

Acceptance:
- Docs, code, tests, and visual review expectations agree.

### NFS3-20 - Extend markdown drift checks to cover `agents/**`

Anchors:
- `scripts/check-doc-paths-and-scripts.mjs`
- `scripts/check-guards.test.mjs`

Problem:
The markdown drift checker recognizes the singular agent namespace but not
`agents/**`, even though current docs reference `agents/...` plan files.

Implementation:
- Add `agents` to markdown path regexes.
- Add a self-test containing an `agents/completed/NFS3.md`-style reference.
- Keep historical plan references allowed only when the referenced file exists.

Tests:
- `node scripts/check-guards.test.mjs`
- `npm run check:doc-paths-and-scripts`

Acceptance:
- Broken `agents/**` references fail the docs check.

## Maintainer Quality Tasks

These are lower priority than the P1/P2 speed work but worth scheduling while
touching the relevant modules.

### MQ-01 - Decompose `src/pharosville-world.tsx`

Reason:
The component owns asset loading, reduced-motion observation, RAF scheduling,
debug state, camera input, selection, fullscreen, and render shell. This makes
performance changes risky.

Suggested split:
- `usePharosVilleAssets`
- `usePharosVilleRaf`
- `usePharosVilleCamera`
- `usePharosVilleSelection`
- Keep JSX shell in `pharosville-world.tsx`.

Tests:
- Existing visual suite.
- Focused hook tests where extracted hooks have deterministic behavior.

### MQ-02 - Make renderer cache boundaries explicit

Reason:
Static cache, frame cache, asset cache, sail tint cache, and future water caches
are separate concepts. They need clearer ownership and invalidation docs.

Suggested work:
- Add a renderer cache section to `src/renderer/README.md`.
- Add tests for static cache key invalidation, eviction, and asset load tick
  invalidation.

Tests:
- New renderer cache unit tests.
- `npm test -- src/renderer`

### MQ-03 - Keep performance decisions in docs, not only plans

Reason:
Agent plans are useful history, but live expectations belong in
`docs/pharosville/TESTING.md`, `CURRENT.md`, and `ASSET_PIPELINE.md`.

Suggested work:
- Move accepted NFS3 budgets into `TESTING.md`.
- Move asset budget rules into `ASSET_PIPELINE.md`.
- Keep `CURRENT.md` limited to current invariants and entry points.

Tests:
- `npm run check:doc-paths-and-scripts`

## Suggested Execution Order

1. Fix correctness risks first: NFS3-02 and NFS3-08.
2. Reduce shipped code and network cost: NFS3-01 and NFS3-03.
3. Reduce first-paint bytes/decode: NFS3-04.
4. Reduce React churn: NFS3-05 and NFS3-06.
5. Reduce RAF/draw hot-path churn: NFS3-07, NFS3-09, NFS3-10, NFS3-11.
6. Lock in budgets: NFS3-12, NFS3-13, NFS3-14.
7. Clean docs/test drift: NFS3-19 and NFS3-20.
8. Do maintainability refactors after budgets are executable.

## Validation Matrix

Use focused checks while implementing individual tasks. Before claiming a broad
NFS3 release, run:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Additional NFS3 checks to add:

```bash
npm run check:bundle-size
npm run check:doc-paths-and-scripts
npm run test:visual:dist
```

For deployed API/cache changes:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

## Swarm Coverage

This document synthesizes four review tracks:

- Runtime/canvas: RAF allocation, drawable sort cost, static-vs-dynamic water,
  shoreline scans, hit testing, motion-clock continuity.
- React/data/gating: query subscriptions, cold-start world rebuilds, world hash
  correctness, resize/camera state churn, desktop gate preservation.
- Asset/bundle/API: production schema bundle cost, edge caching, first-render
  asset bytes, image budgets, chunk strategy, desktop modulepreload.
- Tests/docs/maintainability: missing executable budgets, dock-cap docs drift,
  short fallback screenshot coverage, `agents/**` doc-path checking.
