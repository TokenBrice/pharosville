# Lane G — Systems consequences of redistributing the harbor ring

2026-09-04 · branch `main` (clean) · three.js 0.185.1
Scope: everything DOWNSTREAM of a harbor move — voyages/motion, placement exclusion,
camera framing, DOM reading parity, breakage risks. Rim tile math is Lane B's,
architecture is Lane C/D's, budgets are Lane F's; each is referenced only where a
system here consumes it.

**Method.** All numeric claims were computed by a throwaway script
(`/tmp/lane-g-harbor-math.mjs`) whose formulas are transcribed verbatim from the
cited `path:line` (map-scale, risk-water anchors, cadence bands, calm mask,
camera). The camera transcription reproduces the pinned assertions in
`src/systems/camera.test.ts:69-81` (ethereum station x = 15.1% width in the wanted
8–20% band; tower 48.2% w / 56.8% h in the wanted 43–52% / 45–58% bands at
1600×1000), so the framing table below is grounded, not estimated. No src files
were touched; no gates, formatters, or suites were run.

Vocabulary (shared contract): *mouth* = authored `RimCove` water tile;
*station* = rendered structure at a mouth; *berth* = assignable slot; arcs
N (y≤30), E (x≥110), S (y≥112), W (x≤30), INTERIOR-SHORE otherwise.
Lane B's spread goal mouths used throughout: **W (14,74), E (131,59),
N (118,10), S (122,132), INTERIOR-SHORE/S (55,129)**.

---

## 1. Voyages

### 1.1 How a ship is bound to harbors (the binding chain)

1. `buildShipChainPresence` (`src/systems/pharosville-world/stages/ship-placement.ts:111-124`)
   keeps only chain deployments whose chain has a **rendered** dock
   (`hasRenderedDock`). A ship gets one `dockVisit` per such chain — a ship with
   wide presence (USDT/USDC-class) visits *every* rendered harbor, wherever it is.
2. `assignDockVisits` (`src/systems/pharosville-world/stages/dock-assignment.ts:185-260`)
   walks ships in market-cap order and allocates each (ship, dock) pair a
   **mooring tile** via `dockMooringTile` (`:96-150`): a fan outward from the
   dock tile — depth `2 + floor(index/7) + sizeTierBonus` (titan +3,
   `:33-46`), searched to `baseDepth+8`, lanes ±5 (`:104-128`). So a busy
   harbor's berths occupy a wedge **2–13 tiles seaward of the mouth** along the
   station's cardinal seaward vector (`dockSeawardVector`,
   `src/systems/dock-layout.ts:6-10`). Berths are validated by `isBerthTile`
   (`:77-94`) against occupancy, seawall barriers, navigable water, hull margins.
3. **Sticky berths are keyed on the dock's TILE, not just its id**
   (`berthKey`, `dock-assignment.ts:181-183`; rationale `:152-173`). This is the
   move-safety valve: when a harbor changes tile, every hold for it retires
   automatically and ships re-berth at the new location on that one refresh.
   Cost of a redistribution = one refresh of berth churn, not corruption.
   Consorts never dock (`:216-224`) — they inherit the flagship route.
4. `buildShipMotionRoute` (`src/systems/motion-planning.ts:270-426`) turns each
   visit into a route leg pair **riskTile ↔ mooringTile** (`:367-382`), with A*
   water paths from the shared per-map cache, plus schedule weights
   (`weightedDockStopSchedule`, `:794-813`) that bias which dock a ship sails to
   most often (top-6 rotation by supply share).

### 1.2 How leg durations are planned (the cadence engine)

`cadenceLegDurationForGeometry` (`src/systems/motion-planning.ts:715-750`)
measures the *direct* path to each endpoint and sets
`voyageDuration = max(identityLeg, longestDirect / 0.8)`; the voyage splits into
legs of ≤180 s (`MOTION_LEG_MAX_SECONDS`, `src/systems/motion-config.ts:37`),
each ≥90 s (`:36`), with a throw if a split goes short (`motion-planning.ts:746-748`).
Rests are 240–480 s (`motion-config.ts:38-39`), the cycle is capped at 1320 s
(`:40`) by folding voyage overhang into the dock rest
(`motion-planning.ts:318-327`). `buildCadenceWaterRoute` (`:862-941`) then
*lengthens* short paths with out-and-back excursions or detour waypoints so every
leg's length sits inside `[0.45·T, 0.8·T]` tiles — i.e. **apparent underway speed
is held inside 0.45–0.8 tiles/s by construction**, and it refuses (throws) rather
than exceed it. Note dock legs do **not** allow endpoint truncation — only patrol
legs do (`:841` vs `:370-379`).

### 1.3 What `GARDEN_STATION_LEG_TILES = 96` actually is

`src/systems/garden-observatory-slice.ts:36-41` — despite the name and comment
("longest authored island-to-station reach"), it is **not consulted by planning at
all**. Its only consumer is `GARDEN_MAX_MOTION_TILES`, the *display* motion cap in
`resolveGardenShipDisplayTile` (`:289-291`): for a representative ship, the
composed display tile is `ship.tile + motion · min(1, 96/|motion|)`. And
"representative" is the whole fleet — `selectRepresentativeShips` returns every
ship while the fleet (≈205) stays under the 320 cap
(`garden-observatory-slice.ts:576-577`).

The cap's stated intent (`:281-299`) is to stop *patrol wander* from invading a
neighbour's water; the same comment also says "a moored hull must sit AT the
mooring". Those two intents collide for any leg longer than 96 tiles.

### 1.4 The numbers (script output)

Ships' risk tiles are spread around their placement's anchors
(`AUTHORED_RISK_WATER_AREAS`, `src/systems/risk-water-areas.ts:68-233`, scaled by
`zoneWorldTile`, `src/systems/map-scale.ts:47-53`, then snapped into their body
`:260-270`). Scaled anchor fields (pre-snap; `snapToSeaBody` shifts individual
anchors a few tiles `[INFERENCE]`, never across the map):

| placement | world-tile anchor field (spread) |
|---|---|
| calm (SW/W edge) | (0,38) (0,68) (0,83) (8,91) (15,51) (20,81) (40,101) (33,104) (48,114) |
| watch (S/E shelf) | (96,131)…(139,88) south block; (126,56)…(139,88) east block |
| alert (E corner) | (139,30) (139,35) (139,43) (119,35) (114,30) (101,0) (109,0) |
| warning (E corner) | (139,20) (139,28) (126,20) (119,0) (114,0) (129,23) (134,23) |
| danger (E corner) | (139,0) (139,8) (139,13) (136,3) (134,5) (136,10) (131,0) |
| ledger (N shelf) | (0,0) (13,0) (25,0) (38,0) (51,0) (8,10) (25,13) (45,13) (63,13) (13,20) (38,20) (56,20) |

Euclidean anchor→mouth distances (A* paths are ≥ these; the island obstacle
`GARDEN_ISLAND_OBSTACLE` rx 13.9 / ry 10.5 tiles, `src/systems/garden-water-exclusion.ts:52-59`,
adds roughly 10–20% on W↔N legs that must round the NW shoulder `[INFERENCE]`):

| mouth | nearest anchor | farthest anchor | far-end cap shortfall (D−96) |
|---|---|---|---|
| **W (14,74)** ethereum | 9.2 calm(20,81) | **145.3** danger(139,0) | up to +49 |
| **E (131,59)** | 5.0 watch(134,63) | **143.7** ledger(0,0) | up to +48 |
| **N (118,10)** | 10.0 warning(119,0) | **138.8** calm(0,83) | up to +43 |
| **S (122,132)** | 9.2 watch(116,139) | **179.7** ledger(0,0) | up to +84 |
| **S-int (55,129)** | 16.6 calm(48,114) | **153.9** danger(139,0) | up to +58 |

Worst leg including the ≤13-tile berth fan: **≈193 tiles** (ledger ship at (0,0)
mooring ~13 tiles off (122,132)).

**Does 96 cover it? No — and it does not cover the *current* ring either.** The
current authored mouths already include (122,132), (132,80), (118,10): e.g.
ledger(0,0)→watch-south-reed (122,132) is 179.7 tiles today; danger(139,0)→the W
cluster is 144–167 tiles. The reason the west-mass defect is what the operator
sees (and ghost moorings are not) is frequency: today 4 of 8 slots sit at
x=12–14 beside the calm anchors, so the biggest, most-watched ships (calm/ledger
placements) enjoy 6–60-tile legs. A full-rim ring makes long legs the *norm* —
every arc's stations are 100+ tiles from the opposite corner's anchor fields,
and multi-chain ships visit all of them.

**What the 90–180 s leg / 240–480 s rest budget implies for speed — nothing needs
to change.** The cadence engine absorbs any plate-corner reach:

| leg L (tiles) | minVoyage L/0.8 | legs | leg dur | rest | cycle | display shortfall |
|---|---|---|---|---|---|---|
| 96 | 120 s | 1 | 165 s | 330 s | 990 s | 0 |
| 122 | 153 s | 1 | 165 s | 330 s | 990 s | 26 |
| 145 | 181 s | 2 | 90.6 s | 346 s | 1039 s | 49 |
| 160 | 200 s | 2 | 100 s | 365 s | 1095 s | 64 |
| 180 | 225 s | 2 | 112.5 s | 384 s | 1151 s | 84 |
| 190 | 237 s | 2 | 118.8 s | 403 s | 1208 s | 94 |

Even the theoretical worst (L≈193) stays 2×~121 s legs, cycle ≈1215 s < 1320 s;
`riskRest = 2·rest − 2·voyage` only goes negative if voyage > 440 s (L > 352 —
unreachable on a 140×140 plate). Apparent speed: a 122-tile leg inside an
identity 165 s leg reads 0.74 tiles/s — inside the 0.45–0.8 band; the engine
slows ships down (lengthened scenic paths) rather than ever speeding them up.

**What must change if the reach grows (ranked):**

1. **Exempt destination-bound motion from the 96 cap** — the same states already
   exempt themselves from dock-apron exclusion: `includeDocks` is false for
   `moored/arriving/departing` (`garden-observatory-slice.ts:315-317`); the
   motion cap should follow suit, because `sample.tile` for those states *is* the
   validated mooring (`src/systems/motion-sampling/mooring.ts:84-87`),
   not a wander. Without this, every >96 leg produces a **ghost mooring**: the
   state machine, detail panel, and fender-clamp all say "moored at the quay"
   while the hull renders up to 84 tiles short (`display = ship.tile +
   (mooring−ship)·96/D`), and the arrival fender clamp
   (`src/systems/motion-sampling/transit.ts:203-205`) fights the compression.
   The existing cap test (`src/systems/garden-observatory-slice.test.ts:223-243`)
   pins the cap for *patrol-scale* offsets and should keep doing so.
2. If instead the constant is raised: `GARDEN_STATION_LEG_TILES` → ~200
   (plate-corner + berth fan). Cheaper semantics, but it weakens the
   "never wanders into a neighbour's water" guarantee for patrol drift, so (1)
   is the better trade.
3. `GARDEN_HOME_DRIFT_TILES = 6` and `gardenHomeOffsetWeight` (`:258-264`) use
   each ship's *own* nearest-mooring reach, not the cap — no change needed.

### 1.5 Mouth-to-mouth distances (context for other lanes)

W↔E 118.0 · W↔N 122.1 · W↔S 122.6 · W↔S-int 68.6 · E↔N 50.7 · E↔S 73.6 ·
E↔S-int 103.3 · N↔S 122.1 · N↔S-int 134.6 · S↔S-int 67.1. The
`authorPrecinctBridge` reach limit is 20.5 tiles
(`src/three/garden-docks.ts:1513-1516`) — under any spread the Ethereum↔annex
bridge geometry silently returns `[]` (no error, the bridge just stops existing;
see risk R7).

---

## 2. Placement interaction

### 2.1 Dock exclusion circles vs enlarged stations

The data-side dock exclusion is **one circle of radius 2.2 tiles per dock mouth
tile** plus the pigeonnier (`GARDEN_DOCK_OBSTACLES`,
`src/systems/garden-water-exclusion.ts:111-115`), consulted with
`DOCK_MARGIN_SHARE = 0.5` (`:115`, applied at `:278-281` and `:368`) — i.e. a
*transiting* ship must clear the circle by only half its hull margin, and
moored/arriving/departing ships are exempt entirely
(`src/systems/garden-observatory-slice.ts:315-317`).

The rendered stations are far larger than 2.2 tiles: quay length is
`7.6 · amountScale · (precinct ? 1.5 : 1.06)` world units
(`src/three/garden-docks.ts:291`) with `amountScale` 0.82–1.95 (`:1705-1708`),
and `STATION_SPAN_SCALE` runs 3.6 (boathouse-precinct) / 3.2 (storm-mole) /
1.65–1.85 (ordinary) (`:1664-1676`). A max-supply boathouse-precinct is
≈7.6·1.95·1.5 ≈ 22 world units ≈ **15.7 tiles** long — versus a 2.2-tile
exclusion circle. Today that mismatch is mostly invisible (stations sit against
the rim; transits thread the fan). **A monumental Ethereum Mole makes it a
visible bug**: a transiting hull can legally cut across the rendered structure.
Enlarged stations therefore need the authored radius to grow with the archetype —
cheapest guard is to derive `r` from the same span the recipe uses (one table
both `garden-water-exclusion.ts` and `garden-docks.ts` read), rather than
hand-tuning 2.2 → N.

The berth search itself is move-safe: `isBerthTile` (`dock-assignment.ts:77-94`)
re-validates every candidate against obstacles, navigable water and hull margin,
with a whole-map fallback (`:132-146`) and a throw only if no rim-safe water
exists at all (`:149`) — a relocation alone cannot trigger it.

### 2.2 Which anchorages a redistributed ring collides with

Every Lane B spread mouth sits **inside** a risk-water anchor field (nearest
anchor distances from the script): E (131,59)↔watch(134,63) **5.0 tiles**;
S (122,132)↔watch(116,139) **9.2**; N (118,10)↔warning(119,0) **10.0**;
W (14,74)↔calm(20,81) **9.2**; S-int (55,129)↔calm(48,114) **16.6**. Three
consequences:

1. **Risk-tile placement ignores dock circles entirely.**
   `nearestRiskPlacementWaterTile` excludes only *solid* obstacles
   (`src/systems/risk-water-placement.ts:2,17` — `isGardenObstacleTile`, which
   covers island/cemetery/islets/pigeonnier/edge stones but **not**
   `GARDEN_DOCK_OBSTACLES`). Today an at-anchor ship can already sit within 2.2
   tiles of a quay; with a 15-tile mole in the east watch shelf, an anchored
   hull can sit *inside* the structure. Guard: include dock circles (at their
   enlarged radius) in the placement-stage candidate filter, or add an authored
   anchor stand-off per cove.
2. **Berth-vs-anchorage stacking.** The `occupied` set in `assignDockVisits`
   (`dock-assignment.ts:187,239`) tracks *moorings only* — anchorage risk tiles
   are not in it, so a mooring fan tile and an anchorage can coincide. With
   mouths embedded in anchor fields this becomes routine rather than rare.
   Guard: seed `occupied` with the placement stage's risk tiles (cross-stage
   hand-off), or assert a minimum berth↔risk-tile distance in
   `src/systems/chain-docks.test.ts`.
3. **DEWS-band semantics.** N (118,10) sits in the scaled warning-water region
   (regionTile (126,20)); the E mouth is amid alert/warning/danger corner
   water. VISUAL_INVARIANTS.md:53-54 requires harbors "sited in their body's
   named rim coves" — the cove authoring must keep stations on the rim, not in
   the corner cores (Lane B's tile math; flagged here because motion/placement
   consume the painted bands).

### 2.3 `gardenHarborCalmMask` — exact behavior under a full-plate spread

`gardenHarborCalmMask` (`src/three/garden-docks.ts:1819-1842`) computes **one
bounding ellipse over all dock root positions** (root = tile·√2,
`src/three/garden-util.ts:13,37-43`): `radiusX = (maxX−minX)/2 + 5.5`,
`radiusZ = (maxZ−minZ)/2 + 4.5`, then **clamped to [9,18] × [7,13] world units**
(`:1811-1816`), centered at the *centroid* of all docks, strength 0.75.

With docks spread to opposite corners this is precisely the predicted bug, with
numbers:

- **Lane B spread (5 mouths):** roots span 165.5 × 172.6 world units → raw
  radii **88.2 × 90.8** → clamped to **18 × 13** world units (12.7 × 9.2 tiles),
  centered at tile **(88.0, 80.8)** — open water southeast of the island.
  **0 of 5 docks** fall inside the ellipse. The mask becalms a mid-sea patch no
  harbor touches, at 0.75 strength, while every quay keeps full waves.
- **Current plausible rendered 8** (W cluster + N + E + S + pigeonnier): raw
  89.6 × 90.8 → clamped 18 × 13 at tile (68.6, 82.3); **0 of 8** covered.
- Even the W cluster *alone* (y 68→110) spans 42 tiles → 59.4 world units → the
  z-radius still clamps. Any two docks >~2·13−9 world units apart defeat the
  function.

**Correction to the premise, and why this matters for the plan:** the shipping
renderer does **not** call `gardenHarborCalmMask`. `registerHarborWater`
(`src/three/world-renderer.ts:2985-3017`) instead seats **one** mask just
seaward (5 world units along the shore bearing) of the **largest** station by
`totalUsd` — i.e. always Ethereum today — radius 13 × 9, strength 0.7, plus a
per-dock pylon ripple ring (r 4.5, strength 0.18, `:2991-3000`). The comment at
`:3001-3003` states the reason: "One shader mask cannot cover distant shore
stations without flattening the entire lake between them."
`gardenHarborCalmMask` remains exported and unit-tested
(`src/three/garden-docks.test.ts:257-263`) but unreferenced by the render path —
a trap for exactly the refactor this epic invites.

So under Lane B: the shipping path does not regress (the calm patch follows the
largest dock — the Ethereum Mole), but **no redistributed harbor ever gets calm
water**, and anyone who "fixes" that by wiring the existing all-docks function
gets the clamped 18×13 centroid patch described above. The water contract has a
single calm-mask slot (`setHarborCalmMask`, `src/three/garden-water.ts:1415-1416`),
so per-harbor calm requires a contract widening — which must NAME WHAT IT
DISPLACES: the single-mask rationale at `world-renderer.ts:3001-3003`. The cheap
alternative that keeps the one-mask invariant: strengthen the already-per-dock
pylon ripple rings into a subtle per-dock calm disc (they are per-dock today at
r 4.5 / 0.18).

---

## 3. Camera and framing

**Default landing frame.** `defaultCamera` (`src/systems/camera.ts:36-86`):
zoom = max(`minZoomForViewport`, fitted·tighten) → **0.612** at both 1600×1000
and 1920×1080 (authored floor 0.6, `src/systems/projection.ts:132`, tightened
1.02, `camera.ts:23-25`). Interactive range: derived floor ≈0.28 for desktop
viewports (absolute 0.28, `projection.ts:142`), max 2.4 (`:143`); semantic view
flips to "explore" at zoom ≥ 1.05 (`garden-observatory-slice.ts:516-522`).
Note `camera.ts:70-75`: the +6%-width offset nudge is commented "Bring the deep
lower-left Ethereum precinct into the picture" — **hard-coded to the W
precinct**; and `camera.test.ts:69-81` pins the ethereum station at 8–20% of
width and the tower at 43–52%. If the Ethereum Mole leaves the west shore, both
must be re-authored together or the landing frame shows empty sea where the
capital was.

**Per-framing harbor visibility (spread mouths; 1600×1000, script-validated
against the pinned test):**

| harbor | landing frame (zoom 0.612) | P1 tower/engawa (79,90 · 0.76) | P2 anchorage ma (85,62 · 0.68) | P3 rim & cove (46,81 · 0.74) | P4 dusk beam (69,77 · 0.84) |
|---|---|---|---|---|---|
| ethereum W (14,74) | **ON** (15% w, 26% h) | ON (13%, 1%) | off | ON (31%, 27%) | ON (6%, 11%) |
| east E (131,59) | **ON** (96% w, 76% h — at the 128 px right gutter) | off | **ON** (83%, 73%) | off | off |
| north N (118,10) | **OFF** (118% w) | off | off | off | off |
| south S (122,132) | **OFF** (108% h — one station-height below the bottom edge) | marginal (51%, 102% h) | off | off | off |
| S-int (55,129) | **ON** (7% w, 73% h) | ON (2%, 59%) | off | ON (21%, 84%) | off |
| lighthouse (60,70) | ON (46%, 47%) | ON | ON | ON | ON |

(Postcard framing assumes the tour centers each keyframe's iso point at its
zoom — the keyframe contract of `garden-attract.ts:10-25` `[INFERENCE]`.)
Same classification at 1920×1080.

**Consequences.** A full-rim ring means the **N-arc station is never seen** at
the landing frame nor in any of the four attract postcards — it exists only for
users who pan/zoom. The S rim station is likewise outside both (it grazes P1's
bottom edge). Attract postcards are fixed, data-blind framings
(`garden-attract.ts:9`), so this is authoring, not drift.

**Recommendations.**

1. Keep the landing frame contract (ethereum W + tower, camera.test.ts:69-81) if
   the Mole stays west — that is Lane C's composition call; if it moves, patch
   `camera.ts:75` and the test in the same commit (they are one contract).
2. Re-author **one** postcard toward the N/E arc (P2 "anchorage ma" or P3 "rim
   and cove" are the natural carriers) so every inhabited arc gets one
   36-second appearance per attract cycle (`garden-attract.ts:6`). This does not
   touch the lighthouse-primary invariant — the tower stays in P1/P4.
3. LOD: at 0.612 landing zoom a far-rim station is small; fine-detail buckets
   (`pushMergedPart` fineDetail, `garden-docks.ts:1761-1771`) and lantern lanes
   are the levers — quantified budgeting is Lane F's document. Nothing in the
   systems layer needs to change for LOD.
4. Un-seen-at-rest harbors are compatible with the ma/fukinsei invariant
   (VISUAL_INVARIANTS.md:26-30, 235-238) as long as the ledger/quick-find
   channel (§4) keeps them reachable — it does, untouched.

---

## 4. Reading parity — where harbor identity/rank/share/concentration reach the DOM

| channel | site | what it prints | move-sensitive? |
|---|---|---|---|
| Detail panel summary | `src/systems/detail-model.ts:873-899` (built `:859-913`) | "`<StationType>` at `<coveId>`, part of the `<harborGroup>`…" | **yes** — coveId + group wording |
| Station type label | `detail-model.ts:203-205` | auto title-case of archetype id | auto-follows new archetypes (reads as raw words, e.g. "Storm Mole") |
| Harbor group label | `detail-model.ts:196-201` | "Ethereum shore-station precinct" / "Ethereum precinct annex" / "Detached pigeonnier station" / "Rim-cove shore station" | **yes — becomes false when annexes disperse** |
| Facts rows | `detail-model.ts:880-899` | supply, **Harbor rank** (`:800-813`, "#N of M rendered harbors"), **supply share** (`:815-818`), **concentration HHI** (`:842-847`), health, quay condition, 24h/momentum (`:829-840`), net flow, Station type, **Rim cove**, Harbor group | rank/share/concentration computed from feed at `src/systems/chain-docks.ts:80-93` — **geometry-independent, survive any move unchanged**; Rim cove row follows new cove ids |
| Accessibility ledger line | `src/components/accessibility-ledger.tsx:375-405` (list `:261-270`) | "`<label>`: `<station.type>` station at `<coveId>` cove, …" + every fact row, same wording | **yes** — same two strings; cove ids are *spoken*, so they must stay human-readable |
| Harbor log | `src/hooks/use-harbor-log.ts:17-19,36-60` | "SYM left `<fromLabel>` for `<toLabel>`" — **risk-band transitions only**, never dock movements | no change needed (note: despite the name it logs risk-water moves) |
| Quick find | `src/systems/quick-find-match.ts:14-21,30-38,78-84` | kindLabel "Harbor", label = chain name, weight = `totalUsd` | **no change needed** — no positional strings |
| Almanac | `src/systems/garden-almanac.ts:31-47` | generic harbor flavor text | none |

**New strings a redistribution + new archetypes require (so no redundant channel
is lost):**

1. **New cove ids** authored in `RIM_COVES` (`src/systems/garden-rim.ts:115-146`)
   — they flow automatically into the summary sentence, the "Rim cove" fact row,
   and the spoken ledger line. Constraint: screen-reader legible (hyphenated
   ids are spoken verbatim).
2. **`dockHarborGroupLabel` rewording** (`detail-model.ts:196-201`): "Ethereum
   precinct annex" asserts adjacency. Once annexes sit on other arcs the
   sentence is false; the EVM-relationship channel it carries (which annexes
   belong to the Ethereum bay) must be re-expressed — e.g. keyed on the authored
   arc or a renamed group ("Ethereum L2 annex" without the precinct claim) —
   not deleted. Mirror the wording in `detail-model.test.ts:1729-1760`-area dock
   fixtures.
3. **New archetype ids** auto-label via `stationTypeLabel`, but the parity rule
   (VISUAL_INVARIANTS; the mast-signal precedent at `detail-model.ts:1028-1035`)
   requires any *new distinguishing visual feature* of the Ethereum Mole (Lane
   C/D's design) to gain a label function + ledger clause naming what the eye
   sees — the same pattern as `signalMastLabel`/`mastSignalLabel`.
4. `ETHEREUM_L2_DOCK_CHAIN_ID_SET` reuse at `detail-model.ts:168` is
   chain-id-keyed only — safe under any geometry.

---

## 5. Risk register (ranked: severity × likelihood)

| # | risk | file(s) that would fail / misbehave | cheapest guard |
|---|---|---|---|
| R1 | **Ghost moorings**: any >96-tile leg renders the "moored" hull up to ~84 tiles short of its quay (mechanism certain; frequency grows with spread) | `src/systems/garden-observatory-slice.ts:289-291,40-41` (display cap); visible against `mooring.ts:84-87` | exempt `moored/arriving/departing` from `motionScale`, mirroring the `includeDocks` exemption at `:315-317`; regression: build-world test asserting `display == mooringTile` when state is moored |
| R2 | **Hard-coded W-precinct landing frame** — moving the Ethereum Mole breaks composition + pinned test | `src/systems/camera.ts:70-81`; `src/systems/camera.test.ts:69-81` | re-author nudge + test in one commit, or derive the nudge from the ethereum dock tile |
| R3 | **False "Ethereum precinct annex" group claim** once annexes disperse (DOM says stations are part of a precinct they left) | `src/systems/detail-model.ts:196-201`; spoken via `accessibility-ledger.tsx:393` | reword keyed on authored arc; extend dock detail test to assert group sentence matches arc |
| R4 | **Berth↔anchorage stacking** inside spread mouths (`occupied` tracks moorings only) | `src/systems/pharosville-world/stages/dock-assignment.ts:187,239` | seed `occupied` with placement risk tiles; assert min berth↔risk-tile distance in `chain-docks.test.ts` |
| R5 | **Exclusion radius 2.2 vs monumental footprint** — transiting hulls cross the Mole | `src/systems/garden-water-exclusion.ts:111-115` (vs spans `garden-docks.ts:291,1664-1676`); placement ignores docks entirely `risk-water-placement.ts:17` | derive `r` from station span in one shared table; focused `garden-water-exclusion` test |
| R6 | **Calm-mask trap**: wiring `gardenHarborCalmMask` for spread docks clamps to 18×13 at the centroid — 0 harbors calmed, mid-sea becalmed patch | `src/three/garden-docks.ts:1811-1842` (currently dormant; shipping path is `world-renderer.ts:2985-3017`) | per-dock calm discs via the existing ripple-ring slots, or widen the single-slot contract naming the displaced rationale (`world-renderer.ts:3001-3003`); test: every rendered dock inside some calm disc |
| R7 | **Precinct bridge silently vanishes** (reach 20.5 tiles) — no error, geometry just gone | `src/three/garden-docks.ts:1513-1516` | decide with the dispersal: either keep one annex within 20.5 of the Mole or delete the bridge author + its test expectations deliberately |
| R8 | **Route-pulse open-water endpoint off the finite plate** for E-arc stations (+30 world units ≈ 21 tiles seaward of x≈131 → tile ≈152 > plate max 147) | `src/three/world-renderer.ts:3028-3038,3151-3167`; plate bound `projection.ts:34-42` | clamp the endpoint to `gardenWaterPlateContainsTile` inside `gardenStationRouteEndpoints` |
| R9 | **One-refresh berth churn** when harbors move (sticky holds retire) | `src/systems/pharosville-world/stages/dock-assignment.ts:152-183` | none needed — the tile-keyed hold is the designed mitigation; document that the moving refresh re-berths everything once |
| R10 | DOM/ledger/quick-find regressions | §4 table | none — rank/share/concentration are feed-computed; only cove ids + group wording + mole-feature labels are authoring duties |

**Explicitly safe (verified, not assumed):** cadence engine (any plate-corner leg
stays in the 90–180/240–480 contract, §1.4); `harborRank`/`shareOfGlobal`/
`concentration` computation (`chain-docks.ts:80-93`); quick-find; harbor log;
sticky-berth invalidation on move; berth search fallbacks
(`dock-assignment.ts:132-149`).

---

### Appendix — reproducibility

`node /tmp/lane-g-harbor-math.mjs` (throwaway; not committed) prints every table
in §1.4, §2.3, §3 from formulas transcribed from the cited lines, including the
`camera.test.ts:69-81` cross-check. Snap-adjusted anchor positions
(`snapToSeaBody`) and A*-versus-Euclidean overhead are the only estimated
inputs and are marked `[INFERENCE]` where they matter.
