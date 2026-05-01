# PharosVille Seawall Precision Wrap Plan

Date: 2026-05-01
Status: Draft, awaiting user approval
Scope: Re-author `GENERATED_SEAWALL_ASSETS` in `src/renderer/layers/harbor-district.ts` only
Reference: `docs/pharosville/refs/seawall-precision-target.png` (the red-line diagram you sketched on top of the current rendering)

## Objective

Make the harbor-ring seawall trace the exact red-line silhouette in the reference diagram. The wall should run continuously around the central civic district, visibly framing the lighthouse mountain on the west, the civic gate on the north-center, and the Ethereum/L2 cluster on the south-east — with one cleanly open gateway at every chain harbor where ships dock. The current 16-entry placement covers the right zones but the path doesn't match the diagram's curve and several segments need to be added or moved one or two tiles to read as a continuous masonry ring rather than a sparse stamp pattern.

## Constraints

- One file changes: `src/renderer/layers/harbor-district.ts` (`GENERATED_SEAWALL_ASSETS` only). Do not edit `lighthouse.ts`, `terrain.ts`, `world-layout.ts`, `chain-docks.ts`, the manifest, or validators.
- No new asset IDs. Only the existing `overlay.seawall-straight` and `overlay.seawall-corner` PNGs.
- No `rotation: 90` or `270` — depth shading reads wrong when rotated. Use `flipX` only.
- Do not place a wall on or directly adjacent to a dock tile (within ~0.6 tiles in the dock's outward direction). Each dock must remain a clean opening.
- Do not place a wall over the lighthouse plinth footprint (anchor `LIGHTHOUSE_TILE = (18, 28)`, headland sprite covers roughly `x: 15..21, y: 26..32`).
- Keep total placement count between 18 and 28 entries — enough density for a continuous read at full opacity, not so many that the alpha jitter can't break stamp rhythm.

## Reference Anchors

| Anchor | Tile | Notes |
| --- | --- | --- |
| Lighthouse | (18, 28) | Headland sprite covers ~(15..21, 26..32). Wall passes east of x=20 to keep clear of plinth. |
| Civic core | (31, 31) | Civic gate visible north-center; wall wraps its north face along y≈23. |
| Ethereum hub | (43, 31) | Wraps east face of harbor; openings preserved at the L2 ring. |
| Cemetery islet | (8, 50) | Outside the loop; not part of this wall. |

### Dock tiles (openings)

The wall must skip over every tile in this list. From `src/systems/world-layout.ts`:

- N edge: `(25, 23)`, `(28, 22)`, `(34, 22)`, `(40, 22)`
- NE shelf: `(41, 27)`
- E coast: `(43, 31)`, `(43, 33)`, `(42, 34)`
- SE / Ethereum: `(37, 39)`
- S coast: `(33, 41)`, `(32, 41)`, `(27, 40)`
- SW shelf: `(26, 39)`, `(25, 38)`, `(23, 37)`, `(20, 35)`

16 openings total. Each opening is ~1 tile wide; the wall resumes ~0.5 tile away from each dock on either side.

## Wall Path — Clockwise Waypoints

Starting from the SW corner where the cemetery channel meets the main island and proceeding clockwise. Each entry below is a *waypoint* (a tile position the wall passes through). Wall pieces fill the segments between adjacent waypoints, except where a segment crosses a dock opening (those segments are intentionally left open).

| # | Tile | Role | Notes |
| --- | --- | --- | --- |
| 1 | (17.6, 38.4) | SW corner | Outside cemetery channel, west of `(20, 35)` dock |
| 2 | (17.6, 35.0) | W edge | Between `(20, 35)` dock opening and lighthouse headland |
| 3 | (17.8, 32.0) | W edge | Below lighthouse mountain |
| 4 | (18.4, 28.6) | NW around lighthouse | Wraps west side of lighthouse mountain; corner piece |
| 5 | (20.4, 25.6) | N around lighthouse | Wraps north face of lighthouse mountain |
| 6 | (23.6, 24.0) | N edge approach | Pre-`(25, 23)` opening |
| 7 | (26.4, 22.8) | N edge — east of (25,23) opening | Corner piece, transitioning to N straight |
| 8 | (29.6, 22.0) | N edge — east of (28,22) opening | Straight |
| 9 | (32.0, 22.0) | N edge — west of (34,22) opening | Straight |
| 10 | (35.6, 22.0) | N edge — east of (34,22) opening | Straight |
| 11 | (38.4, 22.0) | N edge — west of (40,22) opening | Straight |
| 12 | (41.4, 24.0) | NE corner | East of `(40, 22)` and `(41, 27)` openings; corner piece |
| 13 | (42.6, 28.4) | E edge — between (41,27) and (43,31) openings | Corner piece |
| 14 | (43.0, 32.0) | E edge — between (43,31) and (43,33) openings | Corner piece (very short segment) |
| 15 | (43.0, 33.6) | E edge — between (43,33) and (42,34) openings | Corner piece |
| 16 | (42.4, 35.6) | E edge — south of (42,34) opening | Corner piece |
| 17 | (41.6, 38.0) | SE corner | South of east dock cluster, east of `(37, 39)` opening |
| 18 | (38.6, 39.6) | S edge — east of (37,39) opening | Corner piece |
| 19 | (35.0, 40.4) | S edge — between (37,39) and (33,41) openings | Straight |
| 20 | (30.6, 41.6) | S edge — between (32,41) and (33,41) and (27,40) openings | Straight (skips both south-cluster docks) |
| 21 | (28.4, 40.4) | S edge — between (27,40) and (26,39) | Straight |
| 22 | (24.6, 39.4) | SW edge — between (25,38) and (26,39) and (23,37) openings | Corner piece (covers SW shelf turn) |
| 23 | (21.6, 38.0) | SW edge — between (23,37) and (20,35) openings | Corner piece |
| 24 | (17.6, 38.4) | Close to waypoint 1 | Closes the loop |

24 waypoints → up to 24 wall segments minus the 16 dock-opening gaps. Effective wall pieces: roughly 16–20.

## Per-Segment Placement Spec

For each segment between consecutive waypoints, the wall sits at the **mid-point** of the segment (or slightly biased toward the wider half if the dock opening is on one side). Asset choice rules:

- **Straight segments** along the same iso-diagonal (e.g. waypoints 8→9→10→11 all on the N edge): use `overlay.seawall-straight`. `flipX = false` for N edge (wall runs east, screen down-right). `flipX = true` for S edge (wall runs west, screen down-left).
- **Corner-turn segments** where the direction changes between two waypoints (e.g. NW around lighthouse, NE corner, SE corner, SW corner): use `overlay.seawall-corner`. `flipX = false` for corners that turn to the right (W→N transition, S→W transition); `flipX = true` for corners that turn to the left (N→E transition, E→S transition).
- **E and W edge segments** are perpendicular to the natural diagonal of `seawall-straight`. Use `overlay.seawall-corner` instead of straight along these edges; the L-shape's two arms read as wall continuation more cleanly than a rotated straight piece would. Place corner pieces at every 1.5–2 tiles along the E/W edges.

### Suggested placements (one row per segment, in clockwise order)

| Segment | Wall mid-tile | Asset | flipX | scale | yOffset | alphaJitter | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1→2 | (17.6, 36.6) | corner | false | 0.85 | 1 | -0.02 | W edge approach |
| 2→3 | (17.6, 33.4) | corner | false | 0.85 | 1 | 0.03 | W edge |
| 3→4 | (18.0, 30.2) | corner | false | 0.9 | 2 | -0.03 | NW wrap of lighthouse |
| 4→5 | (19.4, 27.0) | corner | false | 0.9 | 2 | 0.04 | N wrap of lighthouse |
| 5→6 | (22.0, 24.6) | straight | false | 0.85 | 1 | -0.02 | N edge approach |
| 6→7 | (25.0, 23.4) | — | — | — | — | — | OPENING for `(25, 23)` dock |
| 7→8 | (28.0, 22.4) | — | — | — | — | — | OPENING for `(28, 22)` dock |
| 8→9 | (30.8, 22.0) | straight | false | 0.85 | 1 | 0.02 | N edge bridge |
| 9→10 | (33.8, 22.0) | — | — | — | — | — | OPENING for `(34, 22)` dock |
| 10→11 | (37.0, 22.0) | straight | false | 0.85 | 1 | -0.03 | N edge bridge |
| 11→12 | (39.9, 23.0) | — | — | — | — | — | OPENING for `(40, 22)` dock |
| 12→13 | (42.0, 26.2) | corner | true | 0.9 | 2 | 0.03 | NE corner; opens for `(41, 27)` |
| 13→14 | (42.8, 30.2) | — | — | — | — | — | OPENING for `(43, 31)` dock |
| 14→15 | (43.0, 32.8) | — | — | — | — | — | OPENING for `(43, 33)` dock |
| 15→16 | (42.7, 34.6) | — | — | — | — | — | OPENING for `(42, 34)` dock |
| 16→17 | (42.0, 36.8) | corner | true | 0.85 | 1 | -0.02 | E coast continuation |
| 17→18 | (40.1, 38.8) | corner | true | 0.85 | 1 | 0.04 | SE corner |
| 18→19 | (36.8, 40.0) | — | — | — | — | — | OPENING for `(37, 39)` dock |
| 19→20 | (32.8, 41.0) | straight | true | 0.85 | 1 | -0.02 | S edge bridge (covers between south-cluster openings) |
| 20→21 | (29.5, 41.0) | — | — | — | — | — | OPENING spans `(32, 41)`, `(33, 41)` and `(27, 40)` |
| 21→22 | (26.5, 39.9) | straight | true | 0.85 | 1 | 0.03 | SW shelf bridge |
| 22→23 | (23.1, 38.7) | corner | false | 0.85 | 2 | -0.03 | SW shelf turn (skips `(25, 38)`, `(23, 37)`) |
| 23→24 | (19.6, 38.2) | corner | false | 0.85 | 2 | 0.02 | SW close (skips `(20, 35)`) |

Approximate count: 13 walls with 16 openings. If visual review shows gaps, add 2–4 in-fill straights along the longest bridges (segments 5→6, 10→11, 19→20). If overflow with docks, remove the closest piece to the offending dock.

## Implementation Steps

1. **Branch state.** Confirm `git status --short` is clean except for `agents/pharosville-zone-theming-base-plan.md` and the parallel terrain.ts theming refactor (don't touch those). Work on `main` per repo convention.
2. **Open the live dev server** (user maintains http://localhost:5173/).
3. **Replace `GENERATED_SEAWALL_ASSETS`** in `src/renderer/layers/harbor-district.ts` with the placements from the per-segment table above. Keep the surrounding header comment listing dock tiles up to date.
4. **Reload http://localhost:5173/pharosville/**, take a screenshot, lay it next to `docs/pharosville/refs/seawall-precision-target.png`, and compare against the red line.
5. **Iterate up to 6 cycles**: if a wall lands too close to a dock, nudge `tile.x` / `tile.y` by 0.3–0.5 tiles. If a coast section reads sparse, add an extra straight or corner placement at the segment midpoint with `alphaJitter` ~±0.03.
6. **Stop when the rendered wall path traces the diagram within ~1 tile of every red-line waypoint** and every dock has a visible opening.

## Validation

After the placements settle:

```bash
npx tsc --noEmit
npm test -- src/renderer src/systems/asset-manifest.test.ts
npm run check:pharosville-assets
npm run check:pharosville-colors
```

Then re-bake visual baselines (the seawall change shifts every shell shot):

```bash
npx playwright test tests/visual --update-snapshots
```

Manually inspect each updated snapshot before committing.

## Done Criteria

- The rendered wall traces the red line in `docs/pharosville/refs/seawall-precision-target.png` within ~1 tile of every waypoint.
- Every chain dock has a visible 1-tile-wide opening; no wall piece sits on or directly adjacent to a dock tile.
- The wall reads as a continuous masonry ring around the central civic district, with the lighthouse mountain visibly enclosed and the Ethereum/L2 cluster framed.
- All focused tests pass.
- Visual snapshots re-baked after manual diff approval.
- Single small commit on `main` touching only `harbor-district.ts` (and optionally the snapshot files in a separate commit).

## Out Of Scope

- Generating new seawall PNGs (rotated, perpendicular-diagonal, or longer pieces).
- Touching the lighthouse headland sprite.
- Touching the limestone tile pack.
- Changing dock positions or chain-docks logic.
- The concurrent zone-theming refactor in `terrain.ts`.

## Risk Notes

- **`scale: 1.0` was tried earlier and walls overflowed onto docks.** The plan keeps scales at 0.85–0.9.
- **Sub-tile coords matter.** A placement at exactly a dock tile overlaps; the `0.x` offsets in the table above sit walls in the gap between docks.
- **Iso projection direction.** N edge and S edge are opposite iso diagonals; `flipX` differs between them. Don't blanket-set one value.
