# PharosVille No-Cluster Ships And Performance Plan

Date: 2026-04-30
Status: Implemented and validated
Scope: Standalone `pharosville` repository only
Canonical app: https://pharosville.pharos.watch/

## Objective

Remove stablecoin ship clustering from PharosVille and make every active
tracked stablecoin exist in the world model, route samples, details, and DOM
parity as an individual ship.

Performance work must support that product contract directly. It may reduce
animation, effects, wake detail, route complexity, debug payloads, logo decode
pressure, or offscreen draw work, but it must not replace active stablecoins
with aggregate cluster markers.

## Product Contract

Target contract:

- Every active, non-frozen tracked stablecoin becomes one `ShipNode`.
- `world.ships` is exhaustive for active stablecoin ships.
- Stablecoin cluster nodes are not part of the world contract.
- Renderer debug samples expose every active stablecoin ship. Map-visible
  `kind: "ship"` targets rotate in normal motion because non-titan ships are
  hidden while moored; reduced motion exposes all ship targets.
- Renderer debug targets expose zero `kind: "ship-cluster"` targets.
- `detailIndex` includes `ship.<asset.id>` details for every active ship.
- Accessibility ledger lists all active ships as ships, not cluster members.
- Frozen and dead assets remain cemetery/lifecycle assets unless the product
  contract is separately changed.
- Pre-launch assets remain excluded from active ships unless the product
  contract is separately changed.
- Chain docks remain capped by `MAX_CHAIN_HARBORS`; unrendered chain docks must
  not block individual ship existence.

Allowed performance caps:

- Limit wakes, relationship overlays, route animation, full water-route plans,
  selected path detail, debug sample export, logo priority, and offscreen draw
  work.
- Keep top-supply/recent/selected ships visually richer.
- Keep low-priority ships static, dock-hidden, or cheaper when necessary.

Disallowed performance caps:

- Do not cap `world.ships`.
- Do not move active ships into cluster-only aggregate nodes.
- Do not drop ship details, motion samples, or accessibility rows for active
  ships. It is allowed to drop normal-motion hit targets while non-titan ships
  are hidden in their moored phase.
- Do not weaken the desktop gate or reduced-motion contract.

## Current Diagnosis

The clusters in the screenshot are intentional old behavior, not a renderer
collision artifact.

Relevant path:

- `src/systems/pharosville-world.ts`
  - `buildShips()` creates individual `ShipNode`s for active assets.
  - `assignDockVisits()` adds rendered-dock visits.
  - `buildPharosVilleWorld()` then calls `clusterLongTailShips(dockedShips)`.
  - The returned `visibleShips` become `world.ships`.
  - The returned `clusters` become `world.shipClusters`.
- Historical clustering module (retired)
  - `DEFAULT_INDIVIDUAL_SHIP_BUDGET = 128`.
  - Ships are sorted by `marketCapUsd`.
  - Top 128 remain individual.
  - Long tail is grouped by `riskPlacement`.
  - Groups are chunked to `MAX_SHIPS_PER_CLUSTER = 36`.
- `src/renderer/world-canvas.ts`
  - `drawEntityPass()` draws ships and clusters as separate entity families.
  - `drawClusterBody()` and `drawClusterOverlay()` draw the count marker.
- `src/renderer/hit-testing.ts`
  - `collectHitTargets()` includes `world.shipClusters`.
- `src/components/accessibility-ledger.tsx`
  - Renders a separate "Ship clusters" section.
- `src/systems/visual-cue-registry.ts`
  - Includes `cue.ship-cluster`.

Local registry counts observed during research:

- 217 tracked stablecoin metadata entries.
- 205 active entries.
- 11 pre-launch entries.
- 1 frozen entry.

Dense fixture state:

- `src/__fixtures__/pharosville-world.ts` currently defines
  `DENSE_FIXTURE_ASSET_COUNT = 132`.
- The dense visual test expects 128 ship targets plus one or more clusters.

## Implementation Strategy

Do this in two tracks:

1. Contract migration: remove stablecoin aggregation from the world and tests.
2. Performance hardening: make 200+ individual ships practical without using
   aggregation as the pressure valve.

Contract migration should land with enough focused performance work to keep the
app usable. Deeper renderer/cache work can follow in later phases, but the
first no-cluster change must include tests proving clusters are gone.

## Phase 0: Baseline And Guardrails

Status: Completed on 2026-04-30

Tasks:

- [x] Run `git status --short` before editing.
- [x] Review current files touched by existing work, if any, before modifying
  overlapping files.
- [x] Confirm current docs before implementation:
  - `README.md`
  - `docs/pharosville/CURRENT.md`
  - `docs/pharosville/CHANGE_CHECKLIST.md`
  - `docs/pharosville/TESTING.md`
  - `docs/pharosville-page.md`
- [x] Capture current dense visual/debug facts:
  - ship target count
  - cluster target count
  - ship motion sample count
  - draw duration p95
  - visible tile count
  - asset load stats
- [x] Decide whether to keep `ShipClusterNode` type temporarily with an empty
  array, or remove all cluster types/render paths in one larger cut.

Decision:

- Remove cluster types, drawing, detail, cue, tests, and docs in the first
  implementation. The stronger world contract is simpler to enforce than an
  empty compatibility array.

Acceptance:

- Existing dirty work is identified and preserved.
- Baseline numbers are recorded in this file or in the PR notes.
- No generated `dist/`, `test-results/`, or environment files are committed.

Focused checks:

```bash
npm test -- src/systems/pharosville-world.test.ts src/renderer/hit-testing.test.ts src/systems/motion.test.ts
npm run check:pharosville-assets
```

## Phase 1: No-Cluster World Contract

Status: Completed on 2026-04-30

Goal: Make all active stablecoins appear as individual ships in the world
model.

Tasks:

- [x] In `src/systems/pharosville-world.ts`, stop calling
  `clusterLongTailShips(dockedShips)`.
- [x] Set `ships: dockedShips`.
- [x] Remove `shipClusters` from the world type.
- [x] Keep `detailIndex` ship detail generation exhaustive.
- [x] Verify `buildShips()` still filters only active, tracked, non-frozen
  stablecoins through `activeAssets()`.
- [x] Add a world-model assertion that every active fixture asset has a
  matching `ship.<id>` detail.
- [x] Add a world-model assertion that dense fixture ships are exhaustive.
- [x] Add a world-model assertion that dense fixture `world.ships.length`
  equals dense active asset count.

Important nuance:

- If a fixture uses duplicate IDs, the assertion should either switch to a
  unique dense fixture or explicitly count unique active asset IDs. The product
  contract should be one ship per active stablecoin ID.

Acceptance:

- No `cluster.*` details are required for stablecoin representation.
- Every active stablecoin in the dense fixture is present in `world.ships`.
- Docks remain capped at 10 and keep their existing semantic meaning.
- Reduced-motion static positions still come from ship risk tiles.

Focused checks:

```bash
npm test -- src/systems/pharosville-world.test.ts src/systems/motion.test.ts
```

## Phase 2: Placement And Selectability

Status: Completed on 2026-04-30

Goal: Ensure 200+ individual ships remain deterministic, water-safe,
selectable, and inspectable.

Current risk:

- `spreadShipRiskAnchorsAcrossWater()` tries to reserve risk-placement water,
  then falls back to nearest available water.
- The fallback must be audited for dense active sets so ships do not collapse
  into the same tile or create unselectable piles.

Tasks:

- [x] Audit `spreadShipRiskAnchorsAcrossWater()` for dense active ships.
- [x] Guarantee unique or intentionally offset ship positions in water.
- [x] Add tests that dense ships are on water tiles.
- [x] Add tests that dense ship IDs produce distinct detail IDs.
- [x] Add hit-target tests for more than 128 ships.
- [ ] Consider deterministic sub-tile offsets for ships sharing a semantic
  risk area, while keeping `riskTile` water-safe.
- [x] Preserve printed water label hit priority over overlapping ships where
  current route invariants require it.
- [x] Preserve Ethereum harbor hub background behavior so ships remain
  selectable over the large dock.

Possible implementation options:

- Expand risk placement search radius before generic fallback.
- Use deterministic lane/ring offsets around authored `SHIP_WATER_ANCHORS`.
- Keep `riskTile` semantic and add a separate draw offset only if hit testing,
  follow-selected, and DOM detail remain aligned.
- Add a simple priority rule where selected/hovered ship targets outrank nearby
  ships without overriding area label priority.

Acceptance:

- Dense fixtures have no cluster targets.
- Dense fixtures have one ship target per active ship.
- Ship targets follow motion samples.
- Ship selection and follow-selected still point at the sampled ship position.

Focused checks:

```bash
npm test -- src/renderer/hit-testing.test.ts src/systems/pharosville-world.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "canvas"
```

## Phase 3: Remove Cluster UI, Detail, And Cue Surface

Status: Completed on 2026-04-30

Goal: Remove or neutralize visible cluster product surface once the no-cluster
world contract is active.

Tasks:

- [x] Remove the "Ship clusters" section from
  `src/components/accessibility-ledger.tsx`, or keep it hidden behind an empty
  conditional only during transition.
- [x] Remove `cue.ship-cluster` from `src/systems/visual-cue-registry.ts`.
- [x] Update `src/systems/visual-cue-registry.test.ts`.
- [x] Remove cluster detail assumptions from `src/systems/detail-model.test.ts`
  if cluster detail is retired.
- [x] Remove cluster rendering from `src/renderer/world-canvas.ts` if the type
  is retired.
- [x] Remove cluster hit-target handling from `src/renderer/hit-testing.ts` if
  the type is retired.
- [x] Remove cluster geometry fallback from `src/renderer/geometry.ts` if the
  type is retired.
- [x] Remove the clustering module and its tests
  if no other feature uses them.
- [x] Update `src/components/world-toolbar.tsx` count math if it includes
  clusters.

Acceptance:

- No visible "SHIP-CLUSTER" detail panel appears in normal use.
- No count-pennant cluster markers render.
- No accessibility ledger rows describe active stablecoin clusters.
- Visual cue registry still covers all meaningful canvas signals.

Focused checks:

```bash
npm test -- src/systems/detail-model.test.ts src/systems/visual-cue-registry.test.ts src/renderer/hit-testing.test.ts
```

## Phase 4: Visual And Browser Test Migration

Status: Completed on 2026-04-30

Goal: Make browser coverage prove the new contract and prevent regression.

Tasks:

- [x] Update dense visual test in `tests/visual/pharosville.spec.ts`:
  - expect `dock` targets to remain 10
  - expect `ship` targets to equal dense active ship count
  - expect `ship-cluster` targets to equal 0
  - expect `debug.shipMotionSamples.length` to equal ship target count
- [x] Rename or update `pharosville-dense-ship-flotillas` terminology.
- [x] Rebaseline dense ship snapshot only after inspecting the visual diff.
- [x] Add a reduced-motion dense assertion:
  - no RAF loop
  - `timeSeconds === 0`
  - `movingShipCount === 0`
  - ship samples stable over time
  - sample count equals all dense ships
- [ ] Add a dense hit-target audit if practical:
  - every dense ship target has at least one point that selects that ship, or
    explicitly document allowed occlusion cases.
- [x] Keep existing narrow/short/resize desktop gate tests unchanged.
- [x] Ensure no dense data mocking causes API, manifest, canvas, or sprite work
  below the desktop gate.

Acceptance:

- Browser tests encode the no-cluster contract.
- Reduced-motion behavior remains deterministic.
- Desktop gate still prevents world runtime below `1280 x 760`.
- Snapshot changes are intentional and reviewed.

Focused checks:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual"
npx playwright test tests/visual/pharosville.spec.ts --grep "reduced motion"
npx playwright test tests/visual/pharosville.spec.ts --grep "fallback"
```

## Phase 5: Renderer Hot-Path Performance

Status: First pass completed on 2026-04-30

Goal: Reduce per-frame work so individual ships scale without aggregation.

Observed hot paths:

- `drawPharosVille()` calls `drawTerrain()` every RAF.
- `drawTerrain()` scans all `56 * 56 = 3136` map tiles twice.
- `drawCoastalWaterDetails()` rebuilds a tile map and scans broadly.
- `drawEntityPass()` builds all drawables, closures, geometry, and sorts every
  frame.
- `entityDrawable()` resolves geometry, then ship/dock/grave render helpers
  resolve geometry again.
- `collectHitTargets()` rebuilds and sorts all selectable targets every frame.
- Local/test debug compacts all ship samples and targets every frame.

Tasks:

- [ ] Precompute water tile and land tile arrays in the world model or renderer
  setup.
- [ ] Precompute coastal edge/shoreline data once per world map.
- [x] Use `WorldDrawable.screenBounds` to cull offscreen drawables before
  sorting.
- [ ] Share per-frame entity geometry between drawables and draw helpers.
- [ ] Avoid recomputing `shipRenderState()` separately for wake/body/overlay.
- [ ] Derive hit targets from the same frame geometry cache when possible.
- [ ] Avoid rebuilding hit targets on pointer-up if the frame cache is current.
- [ ] Consider a simple spatial grid for hit testing if target count becomes
  expensive.
- [ ] Throttle local debug updates or make full target/sample export opt-in.

Candidate static-layer cache:

- Cache static terrain/coast/ground/island/cemetery base by camera zoom bucket
  or chunks.
- Draw animated water accents, dynamic entities, labels, lights, birds, and
  selection above the cached static base.
- Keep cache invalidation tied to map, assets, canvas size, and zoom bucket.

Acceptance:

- Dense all-ship p95 draw duration stays within the current visual budget or a
  deliberately updated documented budget.
- Draw order remains correct.
- Printed water labels remain above entities.
- Hit testing, selected rings, follow-selected, and debug frame positions stay
  aligned.

Focused checks:

```bash
npm test -- src/renderer src/systems/pharosville-world.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual"
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion"
```

## Phase 6: Motion Route Scaling

Status: First pass completed on 2026-04-30

Goal: Avoid expensive route construction and per-frame route sampling becoming
the new pressure valve.

Observed findings:

- `buildBaseMotionPlan()` builds route plans for every `world.ships` entry.
- `buildShipMotionRoute()` precomputes water paths for every rendered dock
  visit, even though a route cycle visits at most three stops.
- `findWaterPath()` allocates full-map arrays per call, scans the open set
  linearly, uses `open.includes()`, and allocates neighbor arrays.
- Reduced-motion users still pay full route-build cost before sampling
  short-circuits to static positions.
- Measured research sample:
  - 128 ships route build: about 48ms median
  - 205 ships route build: about 68ms median
  - 512 ships route build: about 175ms median
  - 60-frame sampling: about 5.5ms, 6.1ms, and 17.3ms respectively

Tasks:

- [ ] Build full routes only for selected, top-supply, recent-mover, or
  viewport-near ships.
- [ ] Keep non-routed ships individually rendered at deterministic risk-water
  positions.
- [ ] Build route paths only for relevant stops:
  - home dock
  - bounded weighted schedule stops
  - selected detail expansion
- [x] Cache path results by `pathKey(from, to)` during a plan build.
- [x] Store reverse paths from the same computed route where possible.
- [ ] Precompute route schedule data:
  - `dockStopById`
  - `homeStop`
  - non-home stop IDs
  - bounded stop schedule
- [ ] Replace per-frame `filter/map/find/some` scheduling work with precomputed
  route fields.
- [ ] Make `sampleShipWaterPath()` use binary search on `cumulativeLengths`, or
  pre-sample route points for O(1) interpolation.
- [ ] Consider a reusable water graph:
  - precomputed water adjacency
  - binary heap/open priority queue
  - typed distance/previous arrays
  - visit stamps instead of per-call full resets
  - no per-node neighbor array allocation
- [ ] Avoid full route building in reduced motion unless route overlay detail
  is needed.

Acceptance:

- All ships exist individually whether or not they have full animated routes.
- Selected ships can still get full route detail.
- Reduced-motion still draws deterministic static positions and does not run a
  RAF loop.
- Motion tests still prove moving ship targets remain selectable.

Focused checks:

```bash
npm test -- src/systems/motion.test.ts src/renderer/hit-testing.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion"
npx playwright test tests/visual/pharosville.spec.ts --grep "reduced motion"
```

## Phase 7: Asset And Logo Loading

Status: First pass completed on 2026-04-30

Goal: Prevent asset/logo decode pressure from scaling badly as ship count rises.

Current asset facts:

- `public/pharosville/assets/manifest.json` currently contains 32 PNG runtime
  assets.
- Decoded manifest sprite memory is small, about 2.89 MB in the research pass.
- The bigger risk is logo loading:
  - `loadLogos()` starts all unique local logos concurrently.
  - The local logo folder has hundreds of files.
  - Some logos are large and decode far beyond their tiny canvas draw size.

Tasks:

- [x] Add bounded logo loading concurrency, likely 6 or lower.
- [ ] Prioritize logos:
  - selected/hovered entity
  - rendered docks
  - top-supply ships
  - visible/nearby ships
  - graves and low-priority ships later
- [ ] Consider map-specific logo thumbnails, 48px or 64px, for canvas marks.
- [ ] Keep full-size logos only where a non-canvas UI actually needs them.
- [x] Await `image.decode()` after load when supported, with fallback.
- [ ] Consider `createImageBitmap()` only if memory does not double by keeping
  both image and bitmap.
- [ ] Make critical sprite loading world-aware:
  - required terrain
  - lighthouse
  - central island
  - dock asset IDs actually used by `world.docks`
  - fallback dock
  - ship hull IDs actually used by `world.ships`
  - cemetery prop IDs actually used
- [ ] Consider a ship atlas only if image-switch/request overhead is measured as
  meaningful.
- [ ] Add per-asset `cacheKey` or content-hashed filenames before asset count
  grows materially; the current global cache version invalidates every sprite
  for one changed PNG.

Acceptance:

- No large burst of logo requests on dense first render.
- Critical frame remains visually complete enough for first paint.
- Deferred logo/sprite arrival does not shift layout or break hit testing.
- Asset validator passes.

Focused checks:

```bash
npm test -- src/renderer/asset-manager.test.ts src/systems/asset-manifest.test.ts
npm run check:pharosville-assets
npm run build
```

## Phase 8: Documentation Migration

Status: Completed on 2026-04-30

Goal: Remove stale cluster language from live docs and preserve the new
execution contract for future agents.

Files to update:

- `docs/pharosville-page.md`
- `docs/pharosville/CURRENT.md`
- `docs/pharosville/VISUAL_INVARIANTS.md`
- `docs/pharosville/SCENARIO_CATALOG.md`
- `docs/pharosville/VISUAL_REVIEW_ATLAS.md`
- `docs/pharosville/scenery-brief.md`
- `docs/pharosville/MOTION_POLICY.md`
- `src/renderer/README.md`
- `src/systems/README.md`
- this tracker, as phases complete

Cluster language to remove or rewrite:

- "long-tail stablecoins"
- "ship clusters"
- "flotilla clusters"
- "count-capped grouped active stablecoins"
- "128 visible ships plus clusters"
- "SHIP-CLUSTER"

Replacement language:

- "Every active stablecoin is represented by an individual ship."
- "Performance budgets may cap animation/effects, not ship existence."
- "Dense fixtures validate all active ships as individual targets."
- "Reduced motion freezes individual ships at deterministic risk-water
  positions."

Acceptance:

- Live docs match implementation.
- Historical docs may keep cluster references only when clearly marked as
  historical context.
- Future agents see no instruction to reintroduce ship clustering.

Docs-only check:

```bash
rg -n "cluster|flotilla|128 visible|SHIP-CLUSTER|long-tail" README.md docs/pharosville docs/pharosville-page.md src tests agents
```

## Phase 9: Release Validation

Status: Completed on 2026-04-30

Run focused checks while developing, then broaden before claiming completion.

Minimum for implementation changes:

```bash
npm test -- src
npm run check:pharosville-assets
npm run check:pharosville-colors
```

For renderer, canvas, hit testing, motion, visual, or snapshot changes:

```bash
npm run build
npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"
```

Before claiming broad completion:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

For deployed changes:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

## Execution Checklist

Keep this list updated as work lands.

- [x] Phase 0: Baseline and guardrails complete.
- [x] Phase 1: No-cluster world contract implemented.
- [x] Phase 2: Placement and selectability proven.
- [x] Phase 3: Cluster UI/detail/cue surface removed or neutralized.
- [x] Phase 4: Browser tests migrated and snapshots reviewed.
- [x] Phase 5: Renderer hot-path performance improved.
- [x] Phase 6: Motion route scaling improved.
- [x] Phase 7: Asset/logo loading improved.
- [x] Phase 8: Documentation migrated.
- [x] Phase 9: Release validation complete.

## Open Decisions

- [x] Remove `ShipClusterNode` entirely in the first implementation pass.
- [ ] What is the target dense stress count after current active registry size:
  205, 256, or 512?
- [ ] Should all ships animate, or should route animation be budgeted while all
  ships remain individually rendered and selectable?
- [ ] Should map-logo thumbnails be generated as a required asset pipeline step?
- [ ] Should visual snapshots be renamed from "ship-flotillas" to "ships" in
  the same change that removes clusters?

## Notes From Research Swarm

- Clustering is a hard world-model cap, not renderer collision handling.
- All active assets are built as ships before the cap.
- The previous cap was `DEFAULT_INDIVIDUAL_SHIP_BUDGET = 128`; the
  implementation removed the cap and the clustering module.
- The current dense fixture was designed to prove clusters exist.
- Runtime sprite memory is not currently the main bottleneck.
- Logo loading and full-scene per-frame work are larger scaling risks.
- Terrain/coast redraw and entity sorting should be optimized before chasing
  sprite atlas work.
- Route construction cost is significant but manageable at the current active
  registry size; it becomes more important at 512+ ships.
- Reduced-motion currently still pays route-build cost and should be optimized.
- Performance caps should move to animation/effects/routes/debug, not entity
  existence.
