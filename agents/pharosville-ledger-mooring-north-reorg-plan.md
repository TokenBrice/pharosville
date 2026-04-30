# PharosVille Ledger Mooring North Reorg Plan

Date: 2026-04-30
Status: Reviewed implementation plan
Scope: Standalone `pharosville` repository only

## Objective

Reorganize the named sea-zone map so Ledger Mooring moves from the current
south/right basin to the opposite north-side angle between Calm Anchorage and
Watch Breakwater.

User-visible target:

- Move Ledger Mooring to the north/northeast side indicated in the red markup.
- Increase Ledger Mooring terrain footprint by roughly 33%.
- Place it in the angled transition between Watch Breakwater and Calm Anchorage.
- Give the freed south/right basin back to Calm Anchorage.

## Current Diagnosis

The current map has Ledger Mooring hard-coded as a south/right corner ellipse:

- `src/systems/world-layout.ts`
  - `isLedgerMooring(x, y)` returns `ellipseValue(x, y, 55, 55, 14, 14) < 1`.
  - `terrainKindAt()` evaluates Watch before Ledger and Ledger before Calm.
  - `isCalmAnchorage()` includes `southBay = x >= 16 && x <= 43 && y >= 45`,
    but Ledger overrides part of the bottom/right basin before Calm can claim it.
- `src/systems/risk-water-areas.ts`
  - Ledger region/label are `{ x: 47, y: 52 }`.
  - Ledger anchors are concentrated on the bottom and right edges.
  - Scatter radius is `{ x: 8, y: 5 }`.
- Tests intentionally lock the old layout:
  - `risk-water-areas.test.ts` expects bottom sea exception behavior and a
    bottom/right edge anchor.
  - `world-layout.test.ts` expects `terrainKindAt(REGION_TILES["ledger-mooring"])`
    to be ledger water and `terrainKindAt(0,55)` to remain calm.
  - Motion tests expect ledger patrol anchors to be `ledger-water`.
- Docs currently describe Ledger Mooring as bottom/below/south-edge water.

## Reviewer Findings Integrated

Three specialized reviewers audited this plan against terrain semantics,
ship-motion behavior, and visual/snapshot coverage.

Key corrections:

- Effective terrain count must be measured with `terrainKindAt()`, not raw mask
  math. Watch precedence and island-periphery gates can erase large parts of a
  candidate Ledger mask.
- The first north-angle sketch can fail the 33% growth goal after gates. Treat
  any coordinates below as a starting sketch, not a commit-ready mask.
- Avoid `y = 10` unless Watch clipping is intended; Watch still owns parts of
  that row through `topBasin`.
- Avoid `x = 15` if the left-edge Calm boundary must remain untouched.
- Several visually plausible anchors near `y = 18..19` can resolve to generic
  `water` because island periphery suppresses named terrain first.
- NAV route-stop behavior is structurally safe only if every NAV `riskTile`
  remains `ledger-water`. Fallback to generic water must be treated as a test
  failure.
- Current Calm logic reclaims only part of the old Ledger basin. Full
  "give freed space to Calm" requires extending Calm into the old
  south/right Ledger footprint.
- The north location introduces new visual collision risks with north scenery,
  Solana/Aptos/top docks, Watch ships, and the Watch/Calm labels.

## Proposed Geometry

Use a north-side compound mask that reads as a diagonal wedge rather than a
simple corner disk.

Starting sketch only:

```ts
function isLedgerMooring(x: number, y: number): boolean {
  const northAngle = ellipseValue(x, y, 25.0, 16.0, 11.0, 7.0) < 1.0;
  return northAngle && y >= 11 && y <= 23 && x >= 16 && x <= 39;
}
```

Rationale:

- `y >= 11` avoids the most obvious Watch Breakwater clipping at `y = 10`.
- `x >= 16` avoids stealing the left-edge Calm boundary column.
- The wedge occupies the visual angle between the top Watch band and left Calm
  basin.
- The old south/right ellipse disappears entirely, then a Calm reclamation mask
  must explicitly claim that freed basin.
- The sketch may read too oval. If so, tune into an asymmetric compound wedge
  while preserving the effective terrain-count target.

The exact coordinates should be tuned with terrain-count diagnostics and
Playwright crops. The target is visual agreement with the screenshot and
effective terrain counts, not blind commitment to these numbers.

Effective count target:

- Baseline old Ledger count observed by reviewers: about `160`
  `terrainKindAt() === "ledger-water"` tiles.
- Target new Ledger count: `200..232` effective `ledger-water` tiles
  (`1.25x..1.45x`, with `~213` preferred).
- Count after all real gates: land, island periphery, lighthouse clearance,
  DEWS precedence, Watch precedence, Ledger, Calm, then deep-water fallback.

If the count cannot be reached without crowding north docks, prefer a broader
but shallower west/north wedge over extending southeast into the island
periphery, because southeast candidates are often suppressed to generic water.

## Target Area Definition Updates

Update `RISK_WATER_AREAS["ledger-mooring"]`:

- `regionTile`: candidate `{ x: 25, y: 15 }`.
- `labelTile`: candidate `{ x: 24, y: 15 }` or `{ x: 25, y: 16 }` after visual
  label inspection.
- `waterStyle`: from `"south-corner NAV ledger mooring"` to
  `"north-angle NAV ledger mooring"`.
- `shipAnchors`: replace bottom/right anchors with north-angle anchors. Initial
  safe candidates from reviewer diagnostics:
  - `{ x: 18, y: 12 }`
  - `{ x: 22, y: 11 }`
  - `{ x: 26, y: 12 }`
  - `{ x: 30, y: 14 }`
  - `{ x: 34, y: 16 }`
  - `{ x: 21, y: 17 }`
- `scatterRadius`: increase from `{ x: 8, y: 5 }` to about
  `{ x: 9, y: 5 }` or `{ x: 10, y: 6 }`, then tune only after generated NAV
  risk tiles are proven to stay in `ledger-water`.

The anchor count and scatter radius should reflect the requested roughly 33%
larger footprint, but all authored anchors must pass `terrainKindAt(anchor) ===
"ledger-water"`. Do not use `{ x: 26, y: 18 }`, `{ x: 31, y: 19 }`, or
`{ x: 36, y: 18 }` unless the final terrain mask makes them valid; reviewers
found those resolve to generic `water` under the first candidate.

## Implementation Tasklist

### 1. Baseline Terrain Diagnostics

- [ ] Add a permanent test helper or focused diagnostic that counts effective
  terrain via `terrainKindAt()`, not raw mask membership.
- [ ] Record baseline counts for `ledger-water`, `calm-water`, `watch-water`,
  and generic `water`.
- [ ] Assert final `ledger-water` count is within `1.25x..1.45x` of baseline,
  with `~1.33x` preferred.
- [ ] Assert old south/right Ledger count becomes `0` for `ledger-water`.

### 2. Move Ledger Terrain Mask

- [ ] Replace `isLedgerMooring()` in `src/systems/world-layout.ts` with a
  north-angle mask tuned by effective terrain count.
- [ ] Preserve evaluation order in `terrainKindAt()` unless visual tuning proves
  a change is needed:
  - Danger
  - Warning
  - Alert
  - Watch
  - Ledger
  - Calm
- [ ] Make the precondition explicit: this order only applies after land,
  island-periphery, and lighthouse-clearance gates.
- [ ] Confirm Watch still owns the top band and Ledger begins below it.
- [ ] Confirm Ledger does not leak into the island periphery halo or lighthouse
  clearance lane.
- [ ] Confirm the final mask reads as an angled transition, not a centered oval.
- [ ] Confirm no committed Ledger tile is only raw-mask-valid while resolving to
  generic `water`.

### 3. Expand Calm Into The Freed Basin

- [ ] Remove the old south/right Ledger mask completely.
- [ ] Extend `isCalmAnchorage()` with a south/right reclamation mask covering
  the old Ledger basin, while keeping Alert/Warning/Danger precedence intact.
- [ ] Require representative old Ledger samples to become Calm:
  - `{ x: 43, y: 54 }`
  - `{ x: 45, y: 55 }`
  - `{ x: 47, y: 52 }`
  - `{ x: 50, y: 55 }`
- [ ] Decide whether the exact far corner `{ x: 55, y: 55 }` should become
  `calm-water` or remain `deep-water` as a border strip. If left deep, document
  that exception explicitly.
- [ ] Confirm island periphery and lighthouse visual clearance remain generic
  `water`.

### 4. Move Ledger Metadata And Ship Anchors

- [ ] Update `src/systems/risk-water-areas.ts` for north-angle `regionTile`,
  `labelTile`, `shipAnchors`, `scatterRadius`, and `waterStyle`.
- [ ] Verify every `regionTile`, `labelTile`, and `shipAnchor` resolves to
  `ledger-water` through `terrainKindAt()`.
- [ ] Ensure all NAV risk tiles resolve to `ledger-water`; any fallback to
  generic/calm/deep water is a failure.
- [ ] Ensure `SHIP_WATER_ANCHORS["ledger-mooring"]` feeds motion patrols in the
  new basin.
- [ ] Check route paths from Ethereum/L2 docks to Ledger Mooring remain
  water-only and visually cross sensible sea lanes.
- [ ] Materialize NAV dock-to-ledger paths and inspect terrain mix. Calm,
  generic, and Watch transit water are acceptable; land or non-water is not.
- [ ] Confirm `riskStop.kind === "ledger"`, `dockStopSchedule` stays dock-only,
  `currentDockId === null` during ledger mooring, and non-titan NAV ships remain
  visible while ledger-moored.

### 5. North Visual Decluttering

- [ ] Inspect the north scenery cluster:
  - `north-buoy`
  - `north-signal`
  - `north-net-rack`
  - `north-rope`
  - `north-timber`
  - `north-grass`
- [ ] Keep scenery if it reads as intentional mooring clutter; otherwise move
  props out of the Ledger label/ship lane.
- [ ] Check collision/crowding against top docks near `{ x: 25..40, y: 21..23 }`.
- [ ] Tune label placement in `src/systems/area-labels.ts` if Ledger overlaps
  dense ships, north docks, or Watch/Calm labels.

### 6. Update Tests

- [ ] `src/systems/risk-water-areas.test.ts`
  - Replace "bottom sea exception" expectations with "north-angle transition"
    expectations.
  - Assert Ledger is between Calm and Watch in tile/iso terms.
  - Remove Ledger from edge-snapped placement expectations.
  - Assert Ledger has at least one anchor in the north-angle basin and all
    anchors are `ledger-water`.
  - Assert old south Ledger basin is Calm as intended, with any explicit
    far-corner exception documented.
  - Add an effective `ledger-water` footprint-count assertion.
- [ ] `src/systems/world-layout.test.ts`
  - Update `REGION_TILES["ledger-mooring"]` expectations.
  - Add representative north-angle `ledger-water` samples.
  - Add old south/right `calm-water` samples.
  - Add negative samples proving no `ledger-water` inside island periphery or
    lighthouse clearance.
  - Keep top Watch and left Calm samples.
- [ ] `src/systems/risk-water-placement.ts` coverage
  - Assert nearest/fallback placement for Ledger never silently returns
    generic/calm/deep water when valid Ledger tiles exist.
- [ ] `src/systems/motion.test.ts`
  - Update ledger waypoint expectations; remove assumptions like `waypoint.y >=
    46`.
  - Add assertion that ledger patrols stay in north-angle `ledger-water`.
  - Extend routed sample water checks to include docked NAV/Ledger routes.
  - Materialize NAV dock-to-ledger paths and assert every path point is in
    bounds and water.
- [ ] `src/systems/pharosville-world.test.ts`
  - Keep NAV placement assertions; update terrain coordinate expectations if
    any are anchored to the old south basin.
  - Add dense NAV coverage asserting every NAV `ship.riskTile` is
    `ledger-water`.
- [ ] `src/renderer/hit-testing.test.ts`
  - Verify Ledger area target remains clickable/selectable at its new location.
  - Add no-occlusion checks against Watch, Calm, lighthouse, and north dock
    labels/targets.
- [ ] `tests/visual/pharosville.spec.ts`
  - Add a dedicated `pharosville-dense-ledger-north-angle.png` crop keyed to
    `area.risk-water.ledger-mooring`.
  - Add a selected-Ledger screenshot or assertion in the named risk-water flow.
  - Keep or update the Watch-centered flotilla crop if new Ledger ships change
    its bounds.
  - Inspect screenshots before updating snapshots.

### 7. Update Docs

- [ ] `docs/pharosville-page.md`
  - Replace bottom/below/south Ledger wording with north-angle wording.
- [ ] `docs/pharosville/MOTION_POLICY.md`
  - Update ledger zone description.
- [ ] `docs/pharosville/CURRENT.md`
  - Update current implementation boundaries.
- [ ] `docs/pharosville/VISUAL_REVIEW_ATLAS.md`
  - Update review guidance for dense risk-water and named risk-water crops.
- [ ] `docs/pharosville/VISUAL_INVARIANTS.md`
  - Preserve the invariant that Ledger is the only non-DEWS risk-water area,
    but update its geographic expectation.

### 8. Visual Review

- [ ] Run focused Playwright dense fixture.
- [ ] Inspect at least:
  - full desktop shell
  - dense lighthouse/civic crop
  - dense ship flotilla crop near Watch/Calm/Ledger
  - dedicated north Ledger crop
  - named risk-water selection flow
- [ ] Confirm the north-angle Ledger label is readable and does not collide with
  lighthouse, Watch Breakwater label, Calm Anchorage label, Solana/top dock, or
  dense NAV ships.
- [ ] Confirm Ledger ship and label rects have minimum visual clearance from
  Solana/Aptos/top docks and north scenery.
- [ ] Confirm the south basin now visually reads as Calm water, not stale ledger
  water.
- [ ] Confirm reduced-motion NAV ships no longer appear in the old south Ledger
  basin.
- [ ] Update snapshots only after visual inspection confirms intentional drift.

## Acceptance Criteria

- Ledger Mooring appears on the north-side angle between Watch Breakwater and
  Calm Anchorage.
- Effective `terrainKindAt() === "ledger-water"` footprint is about 33% larger
  than the old footprint, target `1.25x..1.45x`.
- Ledger region tile, label tile, and every Ledger ship anchor are
  `ledger-water`.
- Old south/right Ledger basin no longer contains `ledger-water`.
- Freed old basin is assigned to Calm Anchorage, except for any explicitly
  documented exact edge/deep-water border strip.
- NAV ships still place to `ledger-mooring`, dwell at Ledger Mooring, and freeze
  there in reduced motion.
- Dense NAV risk tiles never fall back to generic/calm/deep water.
- All ship route samples remain deterministic and water-only.
- Named risk-water details, labels, hit targets, and accessibility ledger rows
  remain correct.
- Visual snapshots show the requested map organization without label collisions.

## Validation Commands

Focused during implementation:

```bash
npm test -- src/systems/risk-water-areas.test.ts src/systems/world-layout.test.ts src/systems/motion.test.ts src/systems/pharosville-world.test.ts src/renderer/hit-testing.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture|named risk water"
```

Before final handoff:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Open Review Questions

- Can the north-angle footprint reach `200..232` effective tiles without moving
  north docks or reducing the island periphery halo?
- Should the exact far corner `{ x: 55, y: 55 }` become Calm, or remain a
  deep-water border exception?
- Do NAV ships in the new location create too much visual crowding near
  top-edge Watch ships?
- Does the final mask read as an angled transition strongly enough, or does it
  need a compound/asymmetric wedge instead of an ellipse?
