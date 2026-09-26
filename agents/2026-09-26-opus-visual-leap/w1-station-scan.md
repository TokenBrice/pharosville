# W1.2a — Station feasibility scan (O1)

**Answer: (b).** No legal destination exists for `watch-south-reed` (Polygon, 110,131) or `calm-engawa-south` (BSC, 60,130). This holds for each station alone and for both moved together. Recommendation: **turn the rest camera to seat C at yaw 31°** (the plan's 32° also passes), with pitch 2.6°, eye at 15.23 u and vFOV 32°. Per-gate numbers are in §3. At that yaw neither station enters the tower column or the sight inlet at any of the four gates. Both stations stay where they are, so sea-body area, risk capacity and slot tests change by 0.

Seat B at yaw 45° cannot be saved. Solved for K1, its eye lands at (137.6,165.2), almost exactly seat A's (136,166). The eye→tower line then crosses the south rim at x ≈ 110, which is Polygon's mouth: its footprint lies 0.0 tiles from the line at all four gates.

## 1. Method

The scripts live in `outputs/opus-review/scan/`. Run each with `npx tsx`, read-only on `src/`.

| Script | Does |
| --- | --- |
| `pose.ts` | Free-pose projector: eye, yaw and pitch are free; vFOV 32°. Same basis and matrix as `projection.ts`. Its self-check against `worldToScreen` on the fixed rig gave a max error of **2.2e-16**. Also contains the K1 solver. |
| `w1-scan.ts` | Enumerates slots per station and joint pairs, runs the relaxation ladder, writes the seat B/C station report and risk capacity. Output: `w1-scan.out.json`. |
| `w1-yaw.ts` | Yaw sweep 30–35° and 45°, plus the K1 (pitch, eye) family. Output: `w1-yaw.out.txt`. With `PITCH=2.6 YAWS=30,32,45` or `YAWS=31`: `w1-final-poses*.out.txt`. |
| `w1-plate.ts` | Share of the bottom 25 % of the frame whose ground ray lands off the plate. |
| `w1-capacity.ts` | Exact replica of `isRiskPlacementWaterTile` with the keep-outs rebuilt from the moved slots. Its baseline equals the `src` counts (`matches src: true`). |
| `w1-nearmiss.ts` | Where the closest near-miss pair lands in the K1 frames. |

**Tower points.** The foot is `camera.ts`'s `base` at world (94.82, 2.55, 109.05) = tile (67.05, 77.12). The crown is at y 40.55. "Span" is foot-to-crown. Measured to the waterline instead, the span is 0.448; both values fall inside K1's 0.36–0.47.

### Rules applied to every candidate mouth tile

Candidates are all tiles on the 140² map:

1. **Water of its declared body.** Tested as `terrainKindAt` = `SEA_BODY_TERRAIN[body]`, where Polygon is `open`→`water` and BSC is `calm`. Other bodies are recorded as a body change.
2. **Shore distance.** `rimShoreDistance` ∈ (0, 2].
3. **Outside both openings.** `rimDepthAt` > 0.
4. **Rim land behind the mouth.** Rim land within 14 tiles landward on a cardinal seaward bearing, with the water 2 tiles seaward kept clear.
5. **Reachable.** The tile is navigable water reachable from the island (flood fill, as in `chain-docks.test.ts`).
6. **Moved ≥ 30 tiles** from the current slot.
7. **Ring rules**, evaluated jointly:
   - no trio of stations within 30 tiles (all 9 stations, TON (124,125) included);
   - the southern arc (y ≥ 112) keeps exactly 3 of the 8 mouths;
   - all four arcs stay inhabited;
   - cove spacing ≥ 6;
   - fill-line slots have x > 30 (`chain-docks.test.ts:251`);
   - largest closed-rim arc ≤ 49.5° (`chain-docks.test.ts:265-274`). Today's ring measures **47.1°** with this exact function, not the 48.954° in the test comment.
8. **Reserved sites.** The full `STATION_LOCAL_BOUNDS` envelope, rotated to the mouth's bearing, may not overlap:
   - the `wreck-shoal-east` precinct or any other precinct;
   - the wreck inlet or the wreck-graves obstacle;
   - the pigeonnier (+2.25), the three islets, or a headland (r 4.5);
   - the engawa deck (x 75–94, y 133.4–139), the engawa pine pocket (r 11 at 86,134) or the tōrō;
   - any `GARDEN_SEA_EDGE_SITES` footprint or any of the 7 sea-sign stele footprints.
9. **Outside `GARDEN_EMPTY_INLET`.** The station envelope must stay more than 21 tiles from the polyline.
10. **Outside the seat corridors.** Screen-space tests on the station's massing box (secondLevelTop) plus the `camera.ts:70-79` flag envelope (tip 26 u, reach ±6):
    - The **tower column** is x ∈ [min(foot, crown) − 0.12, max + 0.12] below the crown.
    - The **sight inlet** is the ground triangle from the frame-bottom ground hits at foot x ± 0.12 to the tower foot.
    - Both are tested against seat A (`cam=1136,-326.9,0.7`), today's seat B (`cam=1404.8,-695.2,0.9`), and the K1-solved seat B at all four gates.

## 2. Results

713 tiles map-wide pass rules 1–5 (with any body). None survives the full set.

**Polygon (`watch-south-reed`).** There are 227 south-arc tiles at least 30 tiles away, and every one fails a per-slot rule. Each tile is counted once, under its first blocker:
- 122 fall in the wreck graves, wreck inlet or headland zone (x 2–34).
- 43 hit the wreck sea sign (49,123) or a wreck/calm reed bank (x 38–55).
- 36 are blocked only by `GARDEN_EMPTY_INLET` (x 56–72).
- 16 hit the engawa deck or pine pocket (x 73–80).
- 10 overlap the `wreck-shoal-east` precinct (x 33–37).
- Moving east is impossible. The farthest south-arc water east of the slot is (131,112), which is 28.3 tiles away; beyond it lie the pigeonnier and TON.

**BSC (`calm-engawa-south`).** There are 242 south-arc tiles at least 30 tiles away, counted the same way:
- 116 fall in the wreck graves, inlet or headland zone to the west (x 2–30). They also break the fill line (x > 30).
- 87 lie on the south rim at x 90–131, inside the seat corridors. The ones at x ≥ 119 also hit the pigeonnier or TON.
- 31 on the east rim (x 130–132, y 116–130) hit the pigeonnier, TON or the watch sea sign.
- Only **(130–131, 112–115)** survives the per-slot rules. That is the east shoulder, in `watch` water facing west (bearing π), so it needs a body change from calm to watch. It then fails the trio rule with Polygon and TON, and the closed-rim gap reaches 68°.
- No calm water within the rules lies ≥ 30 tiles away anywhere on the south arc.

### Relaxation ladder (joint pairs)

Each tier keeps every rule not named. Any legal pair must also keep the per-slot rules.

| Relaxation | Legal pairs | What the survivors are |
| --- | --- | --- |
| None (all rules) | **0** | — |
| Body may change | 0 | — |
| + ignore closed-gap test pin | 0 | — |
| + ignore closed-gap and fill-line pins | 0 | — |
| Body may change + ignore seat corridors (± gap pin) | 0 | — |
| Body may change + south ≥ 2 (test floor, not the doc's "3 of 8") | 0 | — |
| Body may change + south ≥ 2 + ignore gap pin | 224 | Polygon goes to the **north arc** in `alert` water (96–104, 12–14), the body that is mouthless by design. That breaks the body-set pin at `garden-rim.test.ts:253`. The south-centre gap becomes 87.8°. |
| Body may change + `GARDEN_EMPTY_INLET` ignored | 0 | — |
| Body may change + inlet ignored + gap pin ignored | 288 | The closest pair is **Polygon → (72,130) `open` + BSC → (130,115) `watch`**, with a gap of 50.7° against a 49.5° limit. |

**The closest near-miss is not usable.** Polygon at (72,130) sits inside `GARDEN_EMPTY_INLET`, which is a stated rule. Its envelope comes within 0.7 tiles of the engawa deck. In the K1 seat-B frame it lands at [−0.04..0.25 × 0.23..0.73], on top of the veranda at [0.06..0.32 × 0.66..0.75]. That swaps BSC's left-corner intrusion for Polygon's. BSC at (130,115) falls off-frame at seat B at every gate. The pair also needs BSC to change body from calm to watch and the gap pin to be re-pinned to about 51°.

### Sea-body area and risk capacity (step 3)

**Sea-body area.** No move touches the `SEA_BODIES` seeds, so every candidate gives **0.00 %** for every body. The calm lobe at `sea-bodies.ts:172-175` may stay as it is; retracting it is optional and would need `calibrate:sea-bodies`. Baseline tile counts:

| calm | open | watch | ledger | alert | wreck | danger | warning |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4837 | 3879 | 1945 | 1614 | 1296 | 961 | 810 | 649 |

**Risk-placement capacity.** Baseline tiles: safe-harbor 4401, breakwater-edge 1723, harbor-mouth-watch 1101, outer-rough-water 447, storm-shelf 716, ledger-mooring 1575. Every probe stays within ±5 %, and the other four placements do not move:

| Move | safe-harbor | breakwater-edge |
| --- | --- | --- |
| Closest pair: Polygon (72,130) + BSC (130,115) | +0.98 % | −2.15 % |
| Polygon (47,125) + BSC (131,113); blocked by the wreck sea sign | +1.02 % | −1.68 % |
| BSC → (130,113) alone | +1.11 % | −3.25 % |
| Polygon → (72,130) alone | −0.14 % | +1.16 % |
| **Seat C (no move)** | **0** | **0** |

The alert-water pairs cost harbor-mouth-watch −2.63 %.

## 3. Seat poses (K1 targets, free pitch and eye height)

The vertical screen position does not depend on aspect, so crown y and span fix one family of forward distances and heights. The forward distance is 158.7 u for every pitch:

| Pitch | Eye height |
| --- | --- |
| 2.5° | 14.95 u |
| 2.6° | 15.24 u |
| 2.7° | 15.51 u |
| 2.8° | 15.80 u |
| 2.9° | 16.08 u, above the 16 u limit |

A breath-centred alternative is pitch 3.0° with the eye at 16.0 u. It gives crown y 0.136 and span 0.420, still inside K1. The poses below use **pitch 2.6°, eye 15.23 u, vFOV 32°**. Foot x is 0.62 on landscape gates and 0.59 at 720×900 (the tall-window rule); crown y is 0.140 and span 0.420 at every gate. "Off-plate" is the share of the bottom 25 % of the frame whose ground ray lands beyond the plate (tile > 147).

| Seat | Gate | Eye tile | Eye world (x,y,z) | Horizontal distance to foot | Off-plate |
| --- | --- | --- | --- | --- | --- |
| **B** yaw 45° | 1600×1000 | 137.6,165.2 | 194.65, 15.23, 233.66 | 159.7 u | 10 % |
| | 1200×640 | 136.1,166.7 | 192.52, 15.23, 235.79 | 160.0 u | 20 % |
| | 900×720 | 139.6,163.3 | 197.36, 15.23, 230.95 | 159.3 u | 1 % |
| | 720×900 | 143.1,159.8 | 202.40, 15.23, 225.92 | 158.8 u | 0 % |
| **C** yaw 32° | 1600×1000 | 116.0,178.8 | 164.06, 15.23, 252.93 | 159.7 u | 33 % |
| | 1200×640 | 114.2,180.0 | 161.51, 15.23, 254.52 | 160.0 u | 40 % |
| | 900×720 | 118.3,177.4 | 167.31, 15.23, 250.90 | 159.3 u | 25 % |
| | 720×900 | 122.6,174.7 | 173.35, 15.23, 247.13 | 158.8 u | 9 % |
| **C** yaw 31° (recommended) | 1600×1000 | 114.2,179.7 | 161.54, 15.23, 254.11 | 159.7 u | ≈35 % |
| | 1200×640 | 112.4,180.8 | 158.96, 15.23, 255.67 | 160.0 u | ≈42 % |
| | 900×720 | 116.6,178.3 | 164.83, 15.23, 252.14 | 159.3 u | ≈27 % |
| | 720×900 | 120.9,175.7 | 170.93, 15.23, 248.47 | 158.8 u | ≈12 % |

The yaw-31° off-plate shares are interpolated between the measured 30° and 32° runs.

**One eye across the landscape gates.** Carrying the 1600×1000 eye unchanged to the other gates gives foot x 0.620 / 0.602 / 0.654 at 1600 / 1200 / 900. All three sit inside K1's 0.58–0.68, so resizing between landscape gates needs no seat change; the per-gate eyes above differ from it by only 2–3 tiles. The same eye at 720×900 gives foot x 0.74, so the tall gate needs its own eye, about 8 tiles along the orbit.

**Today's seats, for comparison:**
- Seat A: eye (136,166) at 28.25 u, pitch 7.56°, foot x 0.636, span 0.423.
- Seat B: eye (122.4,164.4) at 22.45 u, pitch 4°, foot x 0.742, span 0.466.

### Stations and flags in each frame

- **Seat B (yaw 45°), all four gates:**
  - Polygon's massing and flag lie in the **tower column, the sight inlet, the projected `GARDEN_EMPTY_INLET` and the lower 35 %**. At 1600 its box is [0.33..0.73 × 0.11..0.98], 87 % of the frame's height.
  - BSC is lower-left, [−0.12..0.18 × 0.25..0.69], outside the column. At 1200×640 it also enters the projected inlet.
  - TON is at the right edge, [0.92..1.59 × 0.05..1.13].
  - `wreck-shoal-east` is at the left edge.
  - The Mole is in the far field: [0.07..0.34 × 0.32..0.58], with its bottom on the waterline.
- **Seat C (yaw 32°):**
  - Polygon is outside the column and the sight inlet at every gate. It sits at the right edge, in the lower 35 %:
    - 1600: [0.87..1.10]
    - 1200: [0.87..1.06]
    - 900: [0.86..1.18]
    - 720×900: [0.75..1.32]; the column edge is 0.71, so the margin is only 0.04.
  - Polygon's flag tip reaches y 0.11, above the crown.
  - BSC is lower-left and inside the projected `GARDEN_EMPTY_INLET` strips:
    - 1600: [−0.04..0.26 × 0.23..0.74]
    - 1200: [0.07..0.32]
    - 900: [−0.26..0.15]
    - 720×900: off-frame.
  - `wreck-shoal-east` is at the left edge, [−0.21..0.05 × 0.27..0.66].
- **Yaw sweep:**
  - At 33–34°, Polygon enters the column and sight inlet at 720×900.
  - At 35°, it also enters them at 1600 and 900.
  - At 30°, Polygon is almost off-frame (x ≥ 0.92–0.97), but more of the bottom lands off-plate.
  - The recommended 31° keeps the tall-gate margin at 0.13, which holds through K16's ±0.8° yaw breath.
- **Engawa:**
  - Seat B: deck (0.22, 0.70), 14 u pine crown (0.23, 0.45).
  - Seat C at 32°: deck (0.44, 0.72), pine crown (0.47, 0.46). The existing pine then stands just left of the tower foot, over the approach water, so W1.5's rooted threshold pine must be placed against seat C.
- **Plate edge.** At C (32°, 1600) the bottom-left ray hits ground at (86,160) and the bottom-centre ray at (99,152), both beyond the plate edge at 147. The K2 threshold, meaning the pine, the bank and the lower-left corner, must cover this, or the camera-side skirt must reach about y 162.

## 4. Test files that pin the current slots

**Pinned directly:**
- **`src/systems/world-layout.test.ts:336-345`**: the list of cove ids.
- **`src/systems/chain-docks.test.ts`**:
  - `:153-154`: station type per chain;
  - `:173-176` and `:224-226`: trio rule;
  - `:231-236`: north ≤ 2, south ≥ 2;
  - `:240-244`: arcs;
  - `:251`: fill line x > 30;
  - `:265-274`: closed-rim gap ≤ 49.5°;
  - `:488-490`: aptos inherits `watch-south-reed`.
- **`src/systems/risk-water-placement.test.ts:84-92`**: (60,130) is not safe-harbor water.
- **`src/systems/pharosville-world/stages/world-scaffold.test.ts:398-402`**: the council's `:333-337` is stale.
- **`src/systems/garden-rim.test.ts`**:
  - `:227-263`: body, shore, reachability, spacing ≥ 6, and the body set;
  - `:211`: the wreck sign at (49,123).
- **`src/systems/garden-water-exclusion.test.ts:199-211`**: the reed-boathouse bearing probe, measured against TON.

**Slot-derived** (they re-derive from the slots but assert on the result):
- `garden-rim-mesh.test.ts:172-256` and `:323-348`;
- `garden-sea-edge-sites.test.ts:150-153`;
- `camera.test.ts:95-96`;
- `garden-fleet-placement.test.ts:169-216`, the projected inlet at `defaultCamera`;
- `garden-attract.test.ts:12-27`, together with its source `garden-attract.ts:27`, where the Garden Shore postcard's subject is `calm-engawa-south`.

Seat C changes none of these slot pins. The camera-side tests that K1 already lists remain.

## 5. Caveats

- The flag envelope is today's 26 u tip. K28's nobori (tip ≤ 13.7 u) shrinks the flag boxes, but the massing results above do not change.
- If pharos-2 lands (root 8.55, height 32), the crown stays at 40.55 but the foot rises, so the span shrinks. Re-run `w1-yaw.ts` with the new `GARDEN_LIGHTHOUSE_*` values.
- `GARDEN_EMPTY_INLET` was authored for today's rest. W1.6 must re-project it for seat C, because BSC sits inside its current projected strips there.
