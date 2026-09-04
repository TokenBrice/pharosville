# Lane A - Harbor Inventory: what a PharosVille harbor is, structure by structure

Lane A (Inventory) - 2026-09-04 - audit only, no proposals. Input for the epic-harbor-plan synthesis.
Non-goals honored: no new architecture (Lanes C/D), no rim geometry (Lane B), no budgets/gates (Lane F).

## 0. Method and measurement environment

Two evidence sources:

1. Complete static read of `src/three/garden-docks.ts` (1842 lines), `src/three/garden-harbor-batch.ts` (442), `src/three/garden-harbor-life.ts` (765), `src/systems/chain-docks.ts`, `src/three/garden-docks.test.ts`, plus the adjacent consumers `src/three/garden-cargo-tide.ts`, `src/systems/dock-health.ts`, `src/systems/world-layout.ts`, `src/three/garden-water-contract.ts`.
2. A focused read-only measurement harness (allowed by this lane): all 11 archetypes authored through the production `authorDock` under tsx on Node 24 with the repo fixture (`src/three/__fixtures__/harbor.ts:14`): chain size 7, totalUsd $7B, healthBand "healthy", no healthFactors - so `quayMasonryHealth` falls back to 0.58 (`garden-docks.ts:293` with `src/systems/dock-health.ts:8-11`). Every "measured" number below is that harness output. A composed 9-station set (ethereum, base, arbitrum, polygon, solana, hyperliquid, tron, bsc + ton pigeonnier at their authored cove tiles) was run through `createGardenHarborBatch` to count the real draw setup. Raw output is in section 5.

No linters, no gates, no src edits. At the fixture inputs, amountScale = 1.295 (`harborAmountScale`, `garden-docks.ts:1705-1708`) and supply = 0.7 (`garden-docks.ts:289`).

## 1. The 11 station archetypes - reference table

Preferred chains come from `PREFERRED_DOCK_STATIONS` (`src/systems/world-layout.ts:126-146`); "fill-only" archetypes are reachable only when a top-eight chain has no preferred berth (`src/systems/chain-docks.ts:188-200`). Dimensions are measured (world units; primary mass = wall + roof union bounding box from `stationFeatures`, `garden-docks.ts:1472-1487` and `measureFeature` :1490-1503). Second-level height is the measured top elevation above the dock root. Parts are `HarborBucketPart`s (each row is one merged mesh-worth of geometry per bucket per station).

| # | archetype | preferred chains | second-level silhouette (measured top) | primary roof footprint (top) | named signature element | roof token | parts by bucket (tris) | fine detail | flag (scale / top) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | boathouse-precinct | ethereum (EVM slot 0) | bell-tower, 12.35 | 22.24 x 10.25 (7.40) | moon-viewing-deck: empty timber deck beyond the hall (:698-700) + podium stair (:712-719) | #a95f43 | timber 1 (284), stone 1 (120), wall 1 (24), roof 2 (396), window 1 (84) = 6 parts / 908 tris | none (no metal, no accent bucket) | 1.949 / 7.36, swallowtail |
| 2 | annex-pavilion | base, arbitrum, polygon (EVM slots 1-3) | open-belvedere, 8.75 | 13.40 x 7.00 (5.50) | open-pavilion: 4-post deck + latticed screen wall under the belvedere rail (:741-748) | #c58b55 | timber 1 (276), stone 1 (48), roof 2 (172), window 1 (24) = 4 parts / 520 tris (NO wall bucket) | none | 1.421 / 6.16, notched |
| 3 | reed-boathouse | solana (OUTER slot 0) | thatched-dome, 10.00 | 13.00 x 7.15 (6.21) | reed-clump prop + boat-bay mouth cut into the seaward gable (:924-930) | #c7ae72 | timber 1 (108), stone 1 (48), metal:fine 1 (12), wall 1 (56), roof 2 (262), window 1 (24) = 6 parts / 510 tris | metal only (bay mouth) | 1.421 / 6.16, tapered |
| 4 | fishing-pier | hyperliquid (OUTER 1) | net-drying-rack, 7.20 | 13.00 x 7.29 (6.02) | net-racks: 5.35-high forked rack + 3 hung nets + instanced netRack web (:845-857) | #9c694c | timber 1 (240), stone 1 (48), metal:fine 1 (64, winch), roof 2 (92), window 1 (24) = 5 parts / 468 tris | metal only | 1.421 / 6.16, forked |
| 5 | salvage-slip | aptos AND avalanche (both prefer OUTER 2) | hauled-hull-frame, 8.99 | 13.00 x 6.93 (5.71) | hauled hull: keel + 12 ribs on 3 cradles + winch drum + 2 chain coils (:1001-1024) | #824e3c | timber 1 (276), stone 1 (48), metal:fine 1 (352), roof 2 (116), window 1 (24) = 5 parts / 816 tris | metal only | 1.421 / 6.16, dovetail |
| 6 | stepped-inlet | tron (OUTER 3) | lantern-crown, 8.06 | 13.40 x 7.00 (5.60) | three crown lanterns on posts above the canopy (:893-899); stone steps replace pilings (:876-881) | #747a7c | timber 1 (120), stone 1 (120), metal:fine 1 (240, mooring rings), roof 2 (122), window 1 (48) = 5 parts / 650 tris | metal only | 1.421 / 6.16, stepped |
| 7 | tea-house-quay | bsc (OUTER 4) | moon-window-loft, 8.60 | 13.00 x 7.00 (6.35) | engawa: railed water shelf (:782-790) + torus moon window with mullions (:769-776) | #40515b | timber 1 (384), stone 1 (48), wall 1 (24), roof 2 (172), window 1 (72) = 5 parts / 700 tris | none | 1.421 / 6.16, chamfered |
| 8 | gate-landing | none (fill-only, OUTER 5) | torii-gate, 9.27 | 13.00 x 7.00 (5.50) | gate-frame: doubled-lintel torii + 7 shide streamers + paired stone lanterns (:769-790) | #8a4d3c | timber 1 (60), stone 1 (192), wall 1 (12), roof 2 (98), window 1 (48), accent 1 (144) = 6 parts / 554 tris | none | 1.421 / 6.16, pennant |
| 9 | signal-jetty | none (fill-only, OUTER 6) | signal-mast, 10.95 | 13.00 x 6.81 (5.62) | 9.4-unit mast + yard + 2 hoisted pennants + 7-rung lookout ladder (:1050-1066) | #b87845 | timber 1 (204), stone 1 (48), metal:fine 1 (108, ladder), roof 2 (196), window 1 (24), accent 1 (16) = 6 parts / 596 tris | metal only | 1.421 / 6.76, long-pennant |
| 10 | storm-mole | none (fill-only, OUTER 7) | lantern-tower, 9.60 | 13.00 x 7.00 (6.20) | 8-block crenellated mole arc (merlons on every block :946-962) + gallery-railed lantern tower (:968-981) | #354750 | timber 1 (168), stone 1 (348), wall 1 (24), roof 2 (358), window 1 (36) = 5 parts / 934 tris | none | 1.421 / 6.16, storm-split |
| 11 | pigeonnier-islet | ton (own 9th track, PIGEONNIER_STATION_SLOT :196) | pigeonnier-cote, 8.55 | 13.00 x 7.00 (6.55) | cote: drum + 2 dark entry holes + perch ledges + finial (:1085-1098) | #bc7455 | timber 1 (96), stone 1 (48), metal:fine 1 (24, holes), wall 1 (44), roof 2 (352), window 1 (60) = 6 parts / 624 tris | metal only | 1.421 / 5.76, square |

Table notes:
- Every station also gets a SECOND roof part (same bucket) = the field hex x 0.66 for ridge/fascia/gable trim (`roofTrimColor`, `garden-docks.ts:465-467`; push at :338). That is the roof "2 parts" above.
- Measured quay platform (identical recipe for all 11, `authorStoneQuay` :1105-1127): length = quayLength + 0.4 overhang (8.75 precinct / 6.75 others), height 1.55 (`QUAY_TOP_Y` :218), litEdge true for every station (:1121-1124; test-pinned `garden-docks.test.ts:146-147`).
- warmWindowCount in the table of section 2 counts lit wall/seam boxes only; the quay ember edge is a separate window-bucket feature (`quayLitEdge`) and is NOT counted in `features.warmWindowCount` (feature routing :537-565). Measured warm windows: precinct 6 (3 hall + 3 belfry), annex 1, reed 1, fishing 1, salvage 1, stepped 3, tea 2 (incl. moon glass), gate 3 (incl. 2 stone lanterns), signal 1, storm 2, pigeonnier 4 (1 + 3 cote).
- The four roofline families: irimoya hip (precinct, annex, gate, tea, storm), A-frame gable (reed, salvage), lean-to/butterfly (fishing, signal), pyramid/cone caps (precinct tower, storm tower, pigeonnier). Eight of eleven primary masses measure within 12.99-13.40 x 6.81-7.29.
- Identity quadruples (roofline / secondLevel / signature / flagShape) are one-to-one and test-pinned distinct: `garden-docks.test.ts:41-47`; table source `STATION_IDENTITY` `garden-docks.ts:128-139`.
## 2. The exact composition pipeline

### 2.1 Upstream: chains to dock nodes (`src/systems/chain-docks.ts`)

- `buildChainDocks` (:65-76): 8 standard slots + a separate ton pigeonnier track (excluded from the eight, :19-24). optimism is suppressed entirely (:17).
- `selectChainHarbors` (:158-179): the four `ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS` = [ethereum, base, arbitrum, polygon] (`src/systems/world-layout.ts:64-67`) are hard-reserved first, then the rest fill by totalUsd down to `MAX_CHAIN_HARBORS = 8` (:14, :172).
- `dockSize` (:25-41): size 1-10 = max(share of global, absolute USD tier ladder).
- `stationSlotForChain` (:188-200): preferred berth first, else the pool matching EVM membership (`EVM_BAY_STATION_SLOTS` world-layout :82-88 vs `OUTER_HARBOR_STATION_SLOTS` :107-123), else null - precinct forms are semantic, never overflow.
- `attachRenderedHarborContext` (:78-92) stamps harborCount / harborRank / shareOfGlobal for DOM parity.
- EVM bay mouths: ethereum-precinct (14,74), base-annex (14,81), arbitrum-annex (12,68), optimism-annex (13,89) - the 21-tile west-shore stretch (world-layout :81-88).

### 2.2 `authorDock` (`src/three/garden-docks.ts:275-414`) step by step

1. Root: placed at the display tile at `GARDEN_DOCK_ROOT_Y` = -1.25 (water -1.45 + 0.2, `src/systems/garden-observatory-slice.ts:42-43`); `rotation.y = -shoreBearing` so local +X points seaward (:275-285).
2. Scalars (:287-298): `identity` (:287), amountScale from totalUsd (:288, log-decade map 0.82-1.95 at :1705-1708), supply = size/10 (:289). Then length = 7.6 x amountScale x (precinct 1.5 : 1.06) (:291), width = (1.62 + 0.36 x amountScale) x (precinct 1.42 : 1.08) (:292), quayHealth (:293), accent (:294), stone tint = #665f55 -> #a39d8c lerp on quayHealth (:295), quayLength = (3.6 + 3.5 x supply) x (precinct 1.38 : 1.05) (:296), quayWidth (:297), quayX = -0.27/0.30 x length (:298).
3. Buffers (:300-327): eight geometry arrays (timber/stone/metal/walls/roofs/roofTrim/windows/accents), props, an all-zero RoofArticulationProfile counter, and featureGeometry bookkeeping (primaryMass / secondLevel / quayPlatform / quayLitEdge / warmWindows).
4. `authorStoneQuay` (:329, defined :1105-1127): two stone slabs + two skirt courses + one warm ember edge strip into the window bucket; depth 2.4 (2.15 for fishing-pier/pigeonnier :1109). Identical for all 11 archetypes.
5. Archetype dispatch (:330): `STATION_AUTHORS[station.type]` (:503-515).
6. Bucket parts (:332-340): each non-empty array is merged (`mergeBucket` :1753-1758, index normalization) into ONE `HarborBucketPart` with a fixed color: timber = HARBOR_PALETTE.timber_mid (:333), stone = health tint (:334), metal #3d3327 with fineDetail=TRUE and castShadow=false (:335), wall #a99a79 (:336), roof field = STATION_ROOF_COLOR (:337), roof trim = field x 0.66 (:338), window = lantern_glow, no shadow (:339), accent #ad3f2f (:340).
7. Health cracks (:341-349): quayHealth < 0.5 adds a third, non-fine stone part (3 tilted boxes, iron_dark).
8. Props: planks (:352-358) max(5, round(5 + 6 x supply)) = 5-11 with seeded +/-0.04 rad yaw jitter, fineDetail=true; bollards (:360-366) max(2, round(2 + 4 x supply)) = 2-6, the first leans (1 - quayHealth) x 16 deg; lamp posts + flagstaff (:368-380) from `stationLampLocals` (:1646-1661: 1 lamp pigeonnier, 2 standard, 3 precinct, 2 stepped-inlet).
9. Flag (:382-388 -> `authorChainFlag` :1734-1750): atlas cell from `assignGardenChainFlagCell`, sag 0.07-0.13 and wave phase seeded per chain, yaw = CAMERA_FACING_YAW (pi/4, :216) minus root yaw so the cloth faces the fixed isometric camera.
10. Telemetry (:389 -> :470-490): articulation counters ride merged-geometry userData (roofField / roofTrim / roofStructure) so the roof-profile contract is testable without per-station meshes.
11. Return (:391-414): rootMatrix, anchor transform, cargoTideLanes (:395 -> :1694-1702; 6 slots aboard the pier deck + 6 ashore the quay edge), tideFace, features (:398), footprint = (length, max(quayWidth, width x STATION_SPAN_SCALE)) (:399, scale table :1664-1675), lampWorldPositions (:401), quayHealth, accentColor.

### 2.3 `harborIdentity` and station resolution

- `harborIdentity(dock)` (:1594-1596) = `STATION_IDENTITY` (:128-139) for the resolved type: the named quadruple roofline / secondLevel / signature / flagShape plus stationType. `harborPlan` (:1598-1600) is the type alone.
- `resolveDockStation` (:1602-1620): trusts dock.station (coveId, type, shoreBearing) when valid; otherwise LEGACY_STATION_BY_CHAIN (:142-155, keeps the old chain->archetype map working standalone), otherwise a stableUnit hash over five generic types (:1622-1626).

### 2.4 The shared articulation kit (why all roofs feel related)

- `articulateIrimoya` (:1144-1250): triangle-shell field (irimoyaShell), timber ridge beam + trim ridge cap, 4 eave fascias, prism gable plate, 4-bracket eave row, optional slope courses and pent skirt with its own fascia/gable/brackets.
- `articulateGableRoof` (:1253-1298): two slab slopes, ridge beam + cap, optional thatch ridge ties, fascia ring, gable plate, brackets, courses.
- `articulateLeanToRoof` (:1301-1345): one slab + high-side ridge + fascia + gablet + brackets + course (fishing-pier shelter; x2 for the signal butterfly).
- `articulatePyramidRoof` (:1348-1385): 4-sided cone field, fascia, waist band, 4 giboshi corner knobs + apex spike (precinct campanile, storm-mole tower).
- `articulateConeRoof` (:1388-1425): round cone, base ring torus, waist course, landward gablet dormer with its own ridge, finials, 4 radial brackets (pigeonnier).
- The authoring kit below :516-661 (pushBox/pushBoxes/featureBox/secondBox/warmBox/trimBox/trimCourse/ridgeBeam/ridgeCap/eaveBracketRow) exists because of the bundle-size gate; flat stride-6 box tables drive most massing.
- Contract: every primary roof must show >=1 field shell >=6 field triangles, >=1 ridge cap, >=4 fascias, >=1 gable plate, >=4 brackets, >=1 surface break, trim darker than field, ridge beams/brackets in timber userData (`garden-docks.test.ts:86-106`).

### 2.5 `authorPrecinctBridge` (:1513-1560) - the covered Ethereum corridor

- Only precinct -> annex, tile distance 1..20.5 (:1514-1516), else empty. Quadratic bow control point = midpoint + seaward normal x min(2.2, 0.1 x distance) (:1517-1530).
- segments = clamp(ceil(distance / 2.2), 4, 12) (:1531); per segment: deck box (1.18 wide, 0.26 thick), 2 posts (1.62 high), 2 rails at 0.86, and 2 sloped roof slabs (:1532-1554).
- Returns exactly 2 HarborBucketParts (timber merged, roof in the precinct hex) with postPairs/profile in userData - pinned by `garden-docks.test.ts:216-240` (determinism, deck width 1.18 / rail 0.86, and [] for reversed or >20.5 pairs).
- Attachment happens in the BATCH, not in authorDock: `recipesWithPrecinctBridges` (`garden-harbor-batch.ts:149-157`) appends bridge parts to a copy of the precinct recipe; the merged harbor-timber / harbor-roof meshes contain them, while batch.docks keeps the un-bridged part list (verified in the measurement: precinctPartBuckets stayed [timber, stone, wall, roof, roof, window]).

### 2.6 `gardenHarborCalmMask` (:1819-1841) and its clamps

- ONE ellipse over ALL stations: center = mean of dock roots; radiusX = clamp(halfExtentX + 5.5, 9, 18); radiusZ = clamp(halfExtentZ + 4.5, 7, 13); strength 0.75 (constants :1811-1817). Contract type `GardenHarborCalmMask` (`src/three/garden-water-contract.ts:130-139`): inside, water suppresses scroll/swell and boosts sky tint - the mirror-basin read.
- MEASURED on the composed 9-station rim-wide set: center (107.0, 113.0) with BOTH radii pinned at their maxima (18 / 13). The current spread already saturates the mask and drags its center to the southeast quadrant, away from the west EVM bay it is meant to mirror.
- Redistribution consequence: a single-ellipse contract cannot express several basins. Either the contract grows to N masks (Lane G/F decision) or spread stations live with one clamp-pinned mean ellipse.

### 2.7 How supply / concentration drive geometry

| signal | geometry channel | cite |
|---|---|---|
| totalUsd | dockSize 1-10 (share + absolute ladder) | chain-docks.ts:25-41 |
| totalUsd | amountScale 0.82-1.95: length, width, all pier spans | garden-docks.ts:288, :1705-1708 |
| size (supply) | planks 5-11, bollards 2-6, quay length +0-3.5, flag height +0-1.25, flag scale +0-0.384, lamp/flagstaff heights per type | :352, :360, :296, :1628-1643 |
| healthBand | accent hue base (robust #78b689 -> dead #c9675c) + per-chain +/-0.05 hue jitter, flag + accent bucket | :1710-1730 |
| healthFactors | quayMasonryHealth = mean(1-concentration, quality, peg, backing, environment): stone tint lerp, 3 cracks <0.5, leaning bollard | :293, :341-349, :363; src/systems/dock-health.ts:8-20 |
| concentration | NO direct geometry channel - enters only inside the quayHealth average and via healthBand color | dock-health.ts:8-11 |
| change24hPct | gull tempo (life layer, section 3) | garden-harbor-life.ts:189, :294-298 |
| cargoTide | crate run 1-6, direction = lane (section 3) | garden-cargo-tide.ts:106-115 |

### 2.8 `garden-harbor-batch.ts` - what actually reaches the GPU

- 7 buckets (:32-40), 7 prop kinds (:41), one emissive shared material constant for windows: HARBOR_WINDOW_EMBER_INTENSITY 1.6 (:48).
- Bucket meshes (:177-231): for each bucket x {coarse, fine}, collect that bucket/tier from EVERY station, clone, apply each station rootMatrix, bake per-vertex color (wall carries RGBA with per-part opacity), merge (`mergeCompatible` :233-238 normalizes indexed/non-indexed mixes) into ONE Mesh. So: one draw per bucket per tier for the whole world. Names harbor-<bucket> / harbor-fine-<bucket>; the coarse window mesh is named station-lit-screens (test-pinned `garden-harbor-batch.test.ts:139-140`).
- Materials (:241-251): 7 shared vertex-color MeshStandardMaterials; flatShading on stone/roof/accent/wall; wall transparent; window emissive lantern_warm 1.6, toneMapped false.
- Props (:253-281): per kind x tier ONE InstancedMesh; world matrix = station rootMatrix x local (:266-269). Geometries :283-304: post (6-seg cylinder, unit height so posts scale by matrix), lampHead (0.21 sphere), plank, bollard, piling (2.6 tall), netRack (merged 7-part rack :307-324), reedClump (9 merged blades :326-334).
- Flags (:338-376): ONE InstancedMesh over a 1.5 x 1 plane (8x3 segments, mean sag/phase baked); per-instance aFlagCell + aFlagShape attributes; the 11 shapes are alpha-cut DISCARDS in the fragment shader (`patchFlagAtlasMaterial` :415-441, shape index :379-395, cache key garden-station-flag-v4). castShadow false, frustumCulled false.
- Accent retarget: per-chain vertex-color ranges let setDockAccent recolor a station without rebuilds (:124-136). setFineDetailVisible toggles every fine mesh (:137-139); the fine tier ships hidden (batch test :128-130).
- Shadows: coarse bucket meshes cast if any part casts; fine tier never; lampHeads never. Every mesh frustumCulled=false (merged world extents). Height fog applied at root (epistemicHaze quay).
- MEASURED composed set (9 stations): 14 meshes total = 5 coarse bucket meshes (harbor-timber, harbor-stone, harbor-wall, station-lit-screens, harbor-roof; no harbor-accent because the fill contained no gate-landing/signal-jetty) + 1 fine bucket (harbor-fine-metal) + 7 instanced prop meshes (dock-posts 27, dock-lamp-heads 18, harbor-piling 90, harbor-netRack 1, harbor-reedClump 1, harbor-fine-plank 81, harbor-fine-bollard 45) + dock-chain-flag (9 instances). The all-11 batch must stay <=20 drawables (`garden-harbor-batch.test.ts:68-69`).
- Consequence for redistribution: station count does NOT scale draw calls (merge + instancing absorbs it); a monumental rework can add arbitrary geometry inside the existing buckets at zero draw cost, and each NEW bucket would cost exactly 2 draws (coarse + fine).
## 3. Harbor-adjacent life and dressing (`garden-harbor-life.ts` + neighbors)

| element | count | scaling / gating | cite |
|---|---|---|---|
| approach lanterns | 2 per station (bodies + warm heads), 2 instanced draws total | fixed offset 1.25 seaward, +/-1.8 tangent of the anchor; emissive 0.25 | garden-docks.ts:222-235, :238-272 |
| quay ember edge | 1 per station (inside the shared window bucket) | length = quayLength + 0.5; no new water lane | garden-docks.ts:1121-1124; garden-harbor-batch.ts:48, :249 |
| warm windows | 1-6 per station (table, section 1) | emissive 1.6 lantern_warm, toneMapped false - the brightest architecture pixels | garden-harbor-batch.ts:249 |
| precinct causeways | per L2 route (base/arbitrum/polygon): 6 uneven stone blocks with navigable gaps + exactly 2 lantern posts on seeded segments; 2 instanced meshes total + 1 warm route lane per route | stone/width/height jitter seeded per segment; lane registered for the lantern system | garden-harbor-life.ts:299-300, :308-350, :533-673 |
| gulls | ONE instanced mesh: 9 island perch birds + 2 per quay working the pier decks | tempo = clamp(change24hPct / 3, -1, 1): period 58s / (1 + 0.45 x tempo x scatter), wheel radius 2.4 +/- 0.6 x tempo, height 4.2 +/- 0.5 x tempo, perch distance 1.5 +/- 0.8 x tempo; roost at night > 0.72; storm scatter above 0.55; reduced motion = perched still | :36-38, :87, :189, :201-206, :226-229, :276-287, :294-298, :372-530 |
| fireflies | 14 motes around island path lanterns (island dressing, not harbor-bound) | night > 0.25, full tier only, one instanced additive draw | :87, :117-177 |
| cargo tide | up to 6 crates per harbor (CARGO_TIDE_SLOTS, garden-docks.ts:191); count = clamp(round(|pressureScore|/100 x 6), 1, 6), only for tracked minting/burning; >=1 when supply moved | direction is POSITION: minting = pier-deck lane (aboard), burning = quay-edge lane (ashore); ONE InstancedMesh world-wide (0.62 x 0.46 crate + canvas lid in vertex color); zero motion by design; shed by overview LOD (root name dock-cargo-tide) | garden-cargo-tide.ts:17-46, :81-115, :120-146, :160-179, :213-215; lanes garden-docks.ts:1694-1702 |
| moored hulls | NOT a harbor system. Live fleet ships whose motion sample reads "moored" furl all upper sails ("idle" deliberately NOT berthed); moored/idle ships register karesansui ripple rings inside the shared 12-ring budget. Ships anchor across open water - nothing moors a hull AT a quay. The nearest harbor-side analogues are the cargo crates and the pier decks themselves | furl + rings are pure functions of sample state | src/three/garden-ships.ts:589-597, :1658-1690 |
| precinct bridges | up to 3 covered corridors (ethereum -> each rendered annex) | distance gate 1..20.5 tiles | garden-docks.ts:1513-1516 |

Scale references for size judgement: live fleet silhouettes run ~2.6-3.6 units of hull length (kobaya 3.6, src/three/garden-ships.ts:366) and the dead-shoal wrecks are authored 2.1-2.8 units with instance caps at 2.0 (hero 2.6) (src/three/garden-landmarks.ts:131-153, :179-183, test :321). The Pharos is a 34-unit generated hero (src/three/garden-lighthouse.ts:775-776).

## 4. Critique - why the current buildings read WEAK (all cited)

W1. One pavilion, eleven hats. Six archetypes call `articulateIrimoya` (garden-docks.ts:1144) on a mass sited at quayX - 3.2 over a ~13 x 7 plate: annex (:726-728), gate (:757-760), tea (:798-801), reed (:912-914), storm house (11 x 5.8, :977-979), pigeonnier house (10.6 x 5.5, :1079-1081). Measured, eight of eleven primary masses land in 12.99-13.40 x 6.81-7.29. The roofline NAMES differ (deep-hip, pavilion-hip, tea-hip, lintel-cap, slipway-shed...) but the kit emits the same ridge + fascia + 4 brackets + course recipe at slightly different scales, so real silhouette difference is about one eave unit. The variety test (garden-docks.test.ts:86-106) demands the same articulation counters from everyone - it pins sameness as much as difference.

W2. Slab massing. Every wall is a single BoxGeometry: gate 13 x 0.84 x 2.9 x 7 x 0.82 (:761-762), tea (:799-801), storm 11 x 3.0 x 5.8 (:978), pigeonnier 10.6 x 3.0 x 5.5 (:1080), precinct a 5.6-tall band (:672-673). Measured wall bucket content: 12-56 triangles per station. No reveals, no corner breaks, no bay rhythm; plans are rectangles except storm-mole arc (:946-962) and stepped-inlet steps (:876-881).

W3. Volume-to-detail starvation. Measured whole-station budgets: 468-934 triangles. Against the 335,105-triangle default framing (docs/pharosville/VISUAL_INVARIANTS.md, Media and rendering - orchestrator-verified), each station is 0.14-0.28 percent of the scene; a 22-unit primary mass rendered with ~900 tris is lower-density than one dead 2.6-unit wreck hull (up to 7 instanced ribs apiece, garden-landmarks.ts:139-153). The composed 9-station layer totals ~5,420 tris in 14 draws - roughly 1.6 percent of scene triangles. Headroom under the 500k ceiling is enormous.

W4. The detail that exists is switched off. The ENTIRE metal bucket is authored fineDetail=true (:335) - winches, chain coils, mooring rings, ladder rungs, boat-bay mouth, pigeon holes - and planks/bollards are fine props (:352-366). The batch renders the fine tier into meshes that ship hidden (setFineDetailVisible, garden-harbor-batch.ts:137-139; asserted hidden :128-130). At cruise the visible harbor is therefore exactly the un-detailed remainder: zero visible ironwork, and the round-3 greebling investment is invisible in the case framing.

W5. Height-band crowding. Measured primary tops: 5.50-7.40 with nine of eleven inside 5.5-6.55. Measured second-level tops: 8.06, 8.55, 8.60, 8.75, 8.99, 9.27, 9.60 - seven of eleven inside one 1.5-unit shelf; only reed (10.0), signal (10.95) and precinct (12.35) escape. The v0.9 ladder test (garden-docks.test.ts:108-116) requires a >=5 spread across min..max but nothing about distribution, so the skyline reads as two shelves plus one needle.

W6. Windows are stickers. Every warm window is a flat box patch on the wall plane (precinct x3 :683-685; gate :766; storm :984; pigeonnier :1085-1088; stepped x3 :893-899...), the tea torus (:769-776) being the single composed exception. Measured window bucket: 24-84 tris per station INCLUDING the lit quay edge, yet emissive 1.6 toneMapped:false makes windows the brightest architectural pixels (garden-harbor-batch.ts:249) - the eye is sent to the least-modeled surfaces.

W7. Palette flatness. One roof hex per station (:450-463) with ALL trim derived as the same hex x 0.66 (:465-467) - no second roof tone exists. Walls: one shared #a99a79 for all eleven (:336). Accent: one shared #ad3f2f (:340). Timber: one shared timber_mid (:333). Stone: a two-stop health lerp (:295). The chroma range of a whole harbor is eleven adjacent earth tones plus one tan plus one ember; per-chain hue jitter is only +/-0.05 and reaches just the flag and accent bucket (:1713-1721).

W8. No ground-plane negotiation. `authorStoneQuay` (:1105-1127) is identical for all stations and all rim arcs - same two slabs, same skirt, same ember strip, depth 2.4/2.15. The same apron faces the north notch and the south shallows. Only stepped-inlet reshapes the ground (six stone steps :876-881) and only the precinct has a stair (:712-719). The fukinsei rule is honored in station placement counts but not in the ground plane the stations share.

W9. The Ethereum landmark is bigger, not monumental. Precinct vs one annex: 908 vs 520 tris (1.75x), primary 22.24 vs 13.40 length (1.66x), second level 12.35 vs 8.75 (1.41x). The lighthouse it must stand beside is 34 units (garden-lighthouse.ts:775-776) - the bell tower tops out at 36 percent of it. The reading "its own landmark" fails on magnitude, not on naming: the campanile with visible bell exists (:688-704) but is scaled as a subordinate pavilion.

W10. Negative space is in the hidden bucket. The two true architectural voids - the reed boathouse boat-bay mouth (:924-930) and the pigeonnier entry holes (:1091-1097) - are pushed into ctx.metal, i.e. fineDetail=true (:335). At cruise a boathouse with a boat bay renders a solid gable (see W4): the one place massing could carve reads as mass.

W11. Cloned satellites. base, arbitrum and polygon run the SAME authorAnnexPavilion with identical constants (:723-750); only the flag atlas cell and the +/-0.05 hue differ. The 21-tile precinct is therefore three copies of one 13.4 x 7.0 pavilion spaced 7-15 tiles apart - the west-shore cluster the operator reported is aggravated by clone geometry. aptos and avalanche likewise share salvage-slip as their preferred berth (world-layout.ts:126-146, OUTER[2]).

W12. Flags carry identity alone. All ten non-precinct stations share one flag scale at equal supply, (0.72 + 0.24 x supply) x 1.6 (:1637-1638), and the eleven shapes are alpha discards on ONE 1.5 x 1 plane (patchFlagAtlasMaterial :415-441, flagShapeIndex :379-395). The only strongly differentiated element per station is thus the least architectural one - a billboard - while the architecture underneath converges (W1, W2).

## 5. Measured raw output (verbatim, abridged to key fields)

Fixture: size 7, $7B, quayHealth 0.58 fallback. Composed set = the real dense fill (ethereum, base, arbitrum, polygon + first four outer + tron, bsc, ton).
```
boathouse-precinct  footprint 14.76x10.66  primary 22.24x10.25 h7.40  second bell-tower 12.35  windows 6  tris 908  flag 1.949/7.36
annex-pavilion      footprint 10.43x4.84  primary 13.40x7.00  h5.50   second open-belvedere 8.75  windows 1  tris 520  flag 1.421/6.16
reed-boathouse      footprint 10.43x4.84  primary 13.00x7.15  h6.21   second thatched-dome 10.00  windows 1  tris 510
fishing-pier        footprint 10.43x4.84  primary 13.00x7.29  h6.02   second net-drying-rack 7.20 windows 1  tris 468
salvage-slip        footprint 10.43x4.84  primary 13.00x6.93  h5.71   second hauled-hull-frame 8.99 windows 1 tris 816
stepped-inlet       footprint 10.43x4.84  primary 13.40x7.00  h5.60   second lantern-crown 8.06  windows 3  tris 650
tea-house-quay      footprint 10.43x4.84  primary 13.00x7.00  h6.35   second moon-window-loft 8.60 windows 2  tris 700
gate-landing        footprint 10.43x4.84  primary 13.00x7.00  h5.50   second torii-gate 9.27    windows 3  tris 554
signal-jetty        footprint 10.43x4.84  primary 13.00x6.81  h5.62   second signal-mast 10.95  windows 1  tris 596  flag 1.421/6.76
storm-mole          footprint 10.43x7.21  primary 13.00x7.00  h6.20   second lantern-tower 9.60 windows 2  tris 934
pigeonnier-islet    footprint 10.43x4.84  primary 13.00x7.00  h6.55   second pigeonnier-cote 8.55 windows 4  tris 624  flag 1.421/5.76
COMPOSED 14 meshes: harbor-timber, harbor-stone, harbor-wall, station-lit-screens, harbor-roof, harbor-fine-metal,
  dock-posts 27, dock-lamp-heads 18, harbor-piling 90, harbor-netRack 1, harbor-reedClump 1, harbor-fine-plank 81,
  harbor-fine-bollard 45, dock-chain-flag 9; calmMask center (107.01, 112.98) radiusX 18 (at max) radiusZ 13 (at max) strength 0.75
```

## 6. Handoff notes that constrain the epic-harbor-plan

1. Draw-cost invariant: merging + instancing means station count never scales draws (14 meshes at 9 stations; <=20 ceiling for all 11, garden-harbor-batch.test.ts:68-69). A monumental Ethereum Mole can grow inside existing buckets for free; a NEW bucket costs exactly 2 draws (coarse + fine).
2. Cheapest fidelity win in the file: un-hide the metal bucket (fineDetail=false at garden-docks.ts:335). Zero new draws (same single mesh, other tier), and W4/W10 (invisible greebling and voids) resolve at cruise. Must be re-tested against the fine-detail LOD contract (garden-harbor-batch.test.ts:128-130).
3. Calm mask: single-ellipse contract (garden-water-contract.ts:130-139) with clamps 9-18 / 7-13 (garden-docks.ts:1811-1817). Already saturated and southeast-shifted under the CURRENT fill (measured, 2.6). Rim-wide redistribution requires either an N-basin contract amendment or accepting one mean ellipse.
4. Precinct bridges silently vanish outside 1-20.5 tile distances (garden-docks.ts:1515-1516) - relocation of the precinct or annexes must respect that or amend it.
5. Redundant raw material for redistribution: three annex clones (W11) and three archetypes no chain prefers (gate-landing, signal-jetty, storm-mole - fill-only, world-layout.ts:107-123, :126-146). The preferred map is the single lever that changes which archetype renders where.
6. Test-pinned contracts any plan must amend explicitly (name the sentence, per the standing rules): identity quadruple distinctness (garden-docks.test.ts:41-47), roof articulation minimums (:86-106), Ethereum-largest (:119-127), spread contract in chain-docks.test.ts (orchestrator-verified), batch drawable ceiling (garden-harbor-batch.test.ts:68-69), bridge profile (:216-240), calm-mask clamp range (:300-315).
7. The size ladder already encodes supply honestly (2.7) and the palette rules force HARBOR_PALETTE discipline - any monumental work should claim height and negative space (W5, W10), not new hues (W7 is about range within the palette, not license for new colors).

- Lane A, complete. Evidence: static reads cited inline; measurements from the focused harness described in section 0 (raw output section 5).
