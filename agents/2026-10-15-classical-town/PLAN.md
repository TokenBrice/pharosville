# PharosVille "Classical Town" restyle plan

Date: 2026-10-15. Status: **decisions settled (§2), ready for implementation.** It is the basis for a later large
implementation run.
Evidence: the concept boards in this folder (`compare-golden.jpg`, `A-alexandria/`, `B-portus/`, `C-vernacular/`,
`BRIEF.md`). Code map: three read-only surveys of the island, civic and fleet lanes (2026-10-15), cited by `file:line`
below. Line numbers drift, so re-check them before you edit.

## 1. Verdict

**The Pharos is Hellenistic. The town around it is 19th-century Northern Europe.**

| Part | Today |
|---|---|
| Houses | Clapboard and slate, with dormers |
| Offices | A gambrel barn, Dutch step gables, Tudor half-timbering |
| Mint | A Victorian brick-chimney works |
| Shipyard | Red steel gantries |
| Forests | Spruce and birch |
| Fleet | Schooners and brigs |

The hero and the stage belong to two eras, so the town reads as "contemporain".

**Restyle everything except the Pharos into one pre-industrial Mediterranean harbour town. Change no data meaning.**

- **Civic buildings, harbour offices, Mint, Burn, Shipyard** take the A "Ptolemaic Alexandria" language: stoas, temple
  fronts, terracotta, painted polychromy and bronze.
- **The residential quarter blends A and C.** A's courtyard houses and painted bands carry the period. The C
  "Mediterranean vernacular" wash colours, shutters, outside stairs, pergolas and roof terraces add charm and stop
  the quarter looking cloned.
- **The other Northern elements** follow: vegetation, the Shipyard's cranes, slate civic roofs, harbour furniture and
  the fleet.

Nearly all the work is in **Blender authoring**. Three things make the runtime side small:

- the runtime addresses buildings by a handful of node names;
- the island is merged by material;
- the fleet's logo fitting is shape-agnostic.

The real risks are the implicit contracts listed in §6. The first engineering step (P0) makes them explicit.

## 2. Decisions

### 2.1 Locked by the operator (2026-10-15)

| # | Decision |
|---|---|
| R1 | **A + C.** Civic and harbour architecture follow concept A (Ptolemaic Alexandria). The residential quarter blends A's courtyard houses with C's vernacular angles. B (Roman Portus) is dropped: its brick with white trim reads as 19th-century Italianate. |
| R2 | **Also in scope:** vegetation (pine and spruce become cypress, olive and umbrella pine), slate roofs on the Customs House, Registry and other civic buildings, the Shipyard's steel gantries (they become timber treadwheel cranes), and the fleet (schooners become ancient Mediterranean ships). |
| R3 | **The Pharos stays the only monument and the only tower.** Nothing else rises above about 18 m, except the Shipyard cranes and ships' masts. In particular, the Burn becomes a fire altar, not a tower. |

### 2.2 Amendments to the reboot plan (`agents/2026-10-13-pharosville-reboot/PLAN.md`)

- **"Style C Northern Light" is retired as the town style.** The crafted-miniature *medium* stays: flat-ish shading,
  vertex colour plus pattern ids, AO baked into vertex colour, warm lit openings at night.
- **D3 keeps its spirit: one metaphor, no wonder catalogue.** The town is a working Ptolemaic harbour. It is not a
  tour of Alexandria: no Library, no Serapeum, no Colossus, no extra wonders.
- **D9 is reinterpreted.** One ship family per peg currency stays, now as ancient hull types (§4.7).

### 2.3 Settled decisions (operator, 2026-10-15)

| # | Question | Decision |
|---|---|---|
| Q1 | How strict is the era? | **"Hellenistic with vernacular licence."** The civic buildings, Mint, Burn, Shipyard and fleet are period-plausible (Hellenistic or Roman). Houses may use timeless Mediterranean touches (board shutters, outside stairs, pergolas). Lit openings stay glazed-looking at night, because night readability is a core feature. |
| Q2 | Seasons in a Mediterranean town | **Keep all four seasons at v1.1.0 intensity.** The evergreens (olive, cypress, umbrella pine, carob) form the mass, and a deciduous minority (almond, fig, plane, vine rows, pomegranate) carries spring blossom and autumn colour. **Winter keeps today's full snow cover and icicles**, decorative as today. |
| Q3 | The windmill on the meadow knoll | **A Cycladic round stone windmill** with a conical thatch cap and triangular cloth sails. |
| Q4 | Ship families (§4.7) | **The §4.7 mapping is accepted**, including galleys for the gold family and *Syracusia*-class Titans. |
| Q5 | Storm Station cones | **Wicker cones.** Keep the cone silhouettes (the count is the stress reading), woven in wicker on a timber signal mast with a stone base. |
| Q6 | Port and starboard pier-head lights | **Red and green fire-bowls on stone beacon columns.** The red-and-white striped iron lighthouses go. The Shoals reef keeps red-and-white bands as a stone daymark. |
| Q7 | Pilot first? | **Yes: one district end to end** (§5, P2), gated by the operator's verdict before any fan-out. |
| Q8 | Summer cicadas | **Yes.** Cicadas on summer afternoons in the opt-in ambience, replacing some birdsong (§4.8). |

## 3. Design language: the "Ptolemaic harbour" kit

### 3.1 Palette

The palette is defined in code as a new block in `cv_lib.HEX` (`cv_lib.py:21-36`) and mirrored in `nl_common.PAL`
(`nl_common.py:26-118`).

| Role | Values |
|---|---|
| Stone | Warm limestone (keep `stone`, `stone_light`), marble for orders and trim, a sandstone ashlar base course |
| Wall washes (C) | Whitewash, cream, ochre, sienna, faded rose, pale blue limewash (one per few lots, never adjacent twins) |
| Roof | Terracotta in 3 tints (`tile_a/b/c`), desaturated. The concept agents found that the golden-hour grade pushes tile orange (C's note). No slate, tar, turf or lead anywhere. |
| Accents | Greek polychromy: red ochre `#9E3B2C`, Egyptian blue `#2E5A8A`, ochre yellow, black. Used in thin bands (meander, triglyph frieze, tympanum ground), never as whole walls. |
| Metal | Bronze (lamps, braziers, the Burn bowl, acroteria) and gilt (coins, the Mint pediment disc). No iron black except tools. |
| Timber | Dark oiled oak for doors, shutters, pergolas, cranes and ships. Weathered grey for sheds. |
| Cloth | Undyed linen and canvas, plus the chain colour on velaria (`hb_cover` stays the chain-tint carrier). |

### 3.2 Architectural vocabulary

These are new or extended primitives in `cv_lib.py`, reused by the island scripts:

- **Roofs**
  - Low-pitch (18–24°) terracotta gable or hip roofs, with ridge caps and **antefixes** along the eaves.
  - Pediment ends on civic gables.
  - Flat roof terraces with parapets on houses.
  - Lean-to stoa roofs.
  - Forbidden: dormers, steep pitches (over 30°), gambrels, mansards, step gables.
- **Orders**
  - Doric for working civic buildings and Ionic for the senior ones.
  - Each built as a column with entablature: architrave, a painted triglyph or meander band, and cornice.
  - `colonnade()` and `pediment()` exist; add a `frieze()` band helper and an `antefix_row()`.
- **Openings**
  - Small, high, deep-set windows with reveals in the wall colour.
  - Board shutters (C) on houses, arched doors in stone surrounds, arcades for workshops.
  - No white Georgian sash trim and no cross mullions (see §6.2 for the shader).
- **Velarium**
  - A cloth canopy on free-standing poles out on the quay, with a sagging centre and scalloped edge, tinted by
    `hb_cover`.
  - It replaces every shop-front awning.
  - Lesson from the concept boards: at the runtime's 34° pitch, cloth or roofs in front bury the facade. Keep velaria
    off the facade, split them in two around the central bay, and keep stoa roofs shallow.
- **Painted band**
  - One meander or key-pattern band under the eaves of houses and civic buildings.
  - It is the single strongest "period" cue at overview scale, so it must survive LOD and AO.
- **Ground**
  - Flagstone squares and quays (the existing cobble pattern, recoloured warmer).
  - Low dry-stone walls replace hedges.
  - Pergolas carry vines or bougainvillea.

### 3.3 Scale and hierarchy

- Houses stay **7–11 m** (D15).
- Civic buildings stay **9–16 m**, measured to the pediment apex.
- Nothing competes with the Pharos (R3).
- The roof share of the elevation stays high: roofs read first at overview.
- Triangle budgets as today: Mint ≤12k, Shipyard ≤20k, every other civic building ≤6k (`civic/export.py:26`).
  Concept A came in under them (Mint 3.7k, office 2.5k, Burn 1.6k).

## 4. Scope by subject

### 4.1 Civic buildings (`scripts/harbour/blender/civic/`)

| Building | Today | Target (A) | Contract to keep |
|---|---|---|---|
| **Mint** (`cv_works.py`) | Stone arcade hall, slate hip roof, four brick chimneys, copper-domed treasury | **Temple-treasury of Moneta**: hexastyle front with a gilt coin in a blue tympanum, two arched workshop wings with the presses in the arch mouths, three domed clay kilns whose short flues carry the smoke, an undershot wheel on a raised stone leat. Concept: `A-alexandria/frames.py`. | `chimney_0..N` (smoke origins, `mint.ts:51`), `press_0..2` (turn about glTF Y ±0.7 rad, drop 0.3 m, `mint.ts:19,120`), `furnace_glow`, `wheel` (`rotation.z`, `mint.ts:130`), `worker_path`. **The press glint is hard-coded at plot z = 20.5** (`mint.ts:73`): derive it from the press node instead, or keep the arcade front at that depth. |
| **Burn** (`cv_works.py`) | Bottle kiln, fire bowl, loading tower | **Fire altar**: a three-step platform on the islet, an Ionic altar, a great bronze bowl on a tripod with flames about 9 m tall, four bronze torch-stands. | `fire_core` (scaled on Y, `burn.ts:125`), `fire_emitter`, `smoke_emitter`, `grate_glow`, `coin_chute`, `coin_chute_end` (`burn.ts:71-95`). The coin chute becomes a bronze ramp up the altar steps. |
| **Customs House** (`cv_civic.py:30-101`) | Slate hip roof, six-column portico, clock tower with copper dome | Ionic hall with a terracotta roof and pediment, gilt anchor relief kept. **The clock tower becomes a small "Tower of the Winds"**: an octagonal horologion with sundial faces and a bronze Triton vane, period-correct and still a time cue. | `flag_pole_top`. It already has the least headroom (4,968 of 6,000 tris), so simplify the old clock first. |
| **Registry** (`:105-204`) | Six-column portico, blue pediment, lead roof, bell frame | Same temple-front massing. The lead roof becomes terracotta. The bell becomes a bronze *tintinnabulum* on a timber frame. | `bell`, `frieze`, `grade_board`, `register_flag` (painted boards, `civic-system.ts:329-375`). **Never add `crest_panel`, `awning` or `flag_pole_top` here** (see §6.1). |
| **Chart Room** (`:208`) | Lead observatory dome, red-tile wing, armillary | **The Museum's star terrace**: an open exedra (semicircular colonnade) on a podium with the armillary sphere at its centre, and a small tiled study wing. No dome. | `telescope_tip` is unused, so drop it or move it to the armillary. |
| **Storm Station** (`:290`) | Red-tile office, iron signal mast | Small tiled guard-house plus a timber signal mast on a stone base, with wicker cones (Q5). | `weather_board`, `signal` (slots, foot, masthead, `readings-system.ts:149`). |
| **Harbourmaster** (`:362`) | Ochre office, tower with a copper pyramid roof | Two-storey stuccoed house with a low **square watch-loggia** under a tiled pyramid roof, kept under about 16 m. | `mover_up`, `mover_down`. |
| **Keeper's Log** (`:443`) | Octagonal slate house | **Small tholos**: a ring of columns, a cone of terracotta tiles and a bronze vane. | `vane`. |

### 4.2 Harbour offices (`cv_civic.py:490-692`, one builder plus the `OFFICE` table)

- **Common base:** a small **stoa** on the quay, the Ethereum concept in `A-alexandria/`.
  - A Doric colonnade along the front.
  - A low tiled gable with pedimented ends.
  - The crest on a red-framed attic panel under a small pediment.
  - Two velaria on their own poles, in the chain colour.
  - A flag mast on a bronze-shod base.
- **Per-chain variety** comes from order, material and one signature element, never from era. Starting proposal
  (from the A agent, refine at the gate):

| Chain | Variant |
|---|---|
| ethereum | Marble Doric stoa (the concept) |
| tron | Red-ochre stucco Doric, porphyry-red velaria; keeps its own outer harbour |
| bsc | Ochre stucco, gilt shield in the pediment, gilt acroteria |
| solana | Black basalt **Egyptian pylon** gate front (Ptolemaic Egypt fits Alexandria) |
| hyperliquid-l1 | Two-storey Ionic in white marble with a teal-glazed fountain-house niche |
| base | Corinthian portico on a podium, Cycladic whitewash with blue doors |
| arbitrum | Round **tholos** kiosk with a ring velarium |
| polygon | Square-pier warehouse loggia in rose stucco, *opus reticulatum* panels |

- **Contract:**
  - `crest_panel` (`hb_crest`), `awning` (`hb_cover`), `flag_pole_top`.
  - The identity layer scans the **whole scene** for those names and binds each to the nearest office plot within
    30 m (`identity/offices.ts:20,64-68`).
  - The crest scale tweaks are pinned to the current facades (1.4×, Tron 1.95× with a drop, `offices.ts:27-28`;
    Ethereum flag 1.65×, `identity-system.ts:28`). Re-tune them at the gate.

### 4.3 Shipyard (`cv_yard.py`, `civic/shipyard.ts`)

- **Sheds**
  - The open timber truss sheds become **neosoikoi** (ship sheds): rows of stone piers with long tiled roofs.
  - At 34° a full roof hides the hulls, which are the data (pre-launch stages). Roof only the **berth rows'** back
    half, or use open timber pergola-style trusses with a partial tile course. Leave the **slips** open to the sky.
  - The slate mould loft becomes a tiled timber hall.
- **Cranes**
  - The red-girder gantries `crane_0..2` become **timber treadwheel cranes** (*polyspastos*: an A-frame jib with a
    treadwheel).
  - The runtime slides them on `position.z` ±12 m over a ~95 s cycle (`shipyard.ts:400-404`). Mount each crane on a
    timber sledge or rail so the slide still makes sense.
  - Optional: spin the treadwheel with the slide. That means a new child node, `crane_N_wheel`, and a small runtime
    addition.
- **Hull stages** (`hull-stages.glb`: `keel_only`, `ribs`, `planked`, `painted`)
  - Rebuild them on the new ancient hull form so launches match the fleet (§4.7).
  - **Keep the stage semantics.** Historically ancient hulls were built shell-first, but keel → ribs → planks reads
    better and is the data contract.
  - Slips and berths stay `slip_0..5` and `berth_0..36` (`cv_yard.py:155,184`). Hull scales are 1.75 and 0.8
    (`shipyard.ts:31,215-217`).
- **Layout coupling:** `compose.py:1206` reads the `slip_*` origins from the manifest for the launch path. Re-run
  compose after export (§5.1).

### 4.4 Residential quarter (`island/hb_town.py`, `island/nl_kit.py`)

There are 57 lots (`compose.py:1567-1678`):

| Lot style | Count |
|---|---|
| terrace | 17 |
| cottage | 11 |
| hamlet | 11 |
| warehouse | 6 |
| loft | 6 |
| farmhouse | 3 |
| barn | 2 |
| boathouse | 1 |

Each style is a parameter set (`hb_town.py:63-105`) over `nl_kit.build_house` (`nl_kit.py:120-297`), plus dormers,
porch hoods, gutters, finials, shop signs and striped awnings (`hb_town.py:128-199`).

**Restyle the parameter sets and the builder. Keep the lots.** Lot geometry, occupancy and walkways stay put, so the
layout, the walkway test and the window lights carry over.

| Lot style (today) | Becomes | A / C angle |
|---|---|---|
| terrace (17) | **Town house**: 2–3 storeys of stucco, low tiled hip or gable, painted band, shutters. About 1 in 4 has a roof terrace with a pergola. Front-row shops get open arched *tabernae* with a counter and a velarium, not striped awnings. | A massing, C washes, shutters and terraces |
| cottage (11) | **Courtyard house**: a single-storey L or U around a court with a well and an olive tree, inward-looking, small high windows | A |
| hamlet (11) | **Cubic island house**: whitewashed, flat roof with parapet, outside stair, blue or green door. The per-chain wall tint stays (`HAMLET_WALL`, `hb_town.py:224`). | C |
| warehouse (6) | **Horreum**: a long stone or stucco store with an arched loading door per bay, small slit windows and a tiled gable | A |
| loft (6) | **Net and sail store**: a timber-framed stone ground floor with an open upper loft under tile | A/C |
| farmhouse (3) + barn (2) | **Villa rustica**: a farmhouse with a portico, plus a tiled barn and an olive-press shed | A |
| boathouse (1) | Stone boat shed with a tiled roof and an open water arch | A |

- **Must keep**
  - `chimney_top` on houses: it feeds 76 chimney smoke plumes and gull perches through `walkways.json`, and
    `walkways.test.ts:41-60` needs more than 10. In the new style a chimney is a short **smoke-hole cowl** or kitchen
    flue on the roof, not a brick stack.
  - `hb_window` pieces: one connected piece is one window (`materials.ts:746`).
  - The window-light count, which comes from `window_lights.json` (§6.3).
- **Remove:** dormers, gutters, finials, porch hoods, clapboard (`boards` pattern on walls), slate, tar and turf
  roofs.

### 4.5 Harbour furniture, quays and the coast (`island/hb_dress.py`, `compose.py`)

| Item | Today | Target |
|---|---|---|
| Quay lamps (`lamp()`, `hb_dress.py:382`) | Cast-iron lamp posts | **Bronze lamp stands** (a tall tripod with an oil-lamp bowl) and, on squares, stone lamp pillars. Keep the `lamps` light contract. |
| Pier-head lights (`compose.py:816`) | Red/green iron lights, a red-and-white mini lighthouse | Stone **beacon columns** with red or green fire-bowls (Q6) |
| Shoals reef beacon | Red-and-white striped tower | A stone daymark with **red and white painted bands** and a brazier. The hazard colours are D18 semantics; keep them. |
| Hand cranes (`hb_dress.py:538-560`, `hull_red`) | Red iron cranes | Timber A-frame derricks |
| Bunting (`hb_dress.py:433-461`) | Little flag strings | Strings of **pennants and garlands**, in the same positions |
| Benches (`:525-535`) | Timber park benches | Stone exedra benches and blocks |
| Hedges | Green hedges | Dry-stone walls and vine rows |
| Marina moles (`compose.py:630-735`) | Stone moles | Keep (they are already period-plausible); add bollards as stone posts |
| Timber piers (`nl_kit.build_pier`) | Plank piers on piles | Keep; reduce the modern lamp fittings |
| Windmill (`hb_town.py:375-406`) | Dutch tower mill with a slate cap | Q3: Cycladic stone windmill |

### 4.6 Vegetation (`hb_dress.py:179-373`, `nl_kit.spruce/birch`, `materials.ts:263-341`)

Today there are about 487 spruce, 116 round deciduous and 130 birch. Each species is one merged mesh (`trees_spruce`,
`trees_round`, `trees_birch`, `_trunk`) with `family=tree_*`. Nothing is instanced, and trees don't sway.

| Today | Target | Where | Seasonal role |
|---|---|---|---|
| Spruce (487), crest and spines | **Umbrella pine** (*Pinus pinea*: a flat crown on a bare, leaning trunk) on the crest and spines, mixed with **Italian cypress** columns along roads, the Pharos road and the town edge | Same samplers | Evergreen |
| Round deciduous (116), gardens and coves | **Olive** (a grey-green, broken crown with gnarled trunk) in gardens, groves and terraces; **fig** and **pomegranate** in courtyards | Same | Olive: evergreen. Fig and pomegranate: deciduous (blossom, autumn colour, bare in winter). |
| Birch (130) | **Plane** trees on squares, **almond** on the south slopes | Same | Deciduous: almond carries the spring blossom, plane the autumn gold |
| Meadow props (~1,700) | Maquis: lavender, rosemary, broom, oleander, agave and acanthus clumps; some tufts stay | Same | Mostly evergreen; broom flowers yellow in spring |
| Hedges | Dry-stone walls and vine rows (vines are deciduous: the autumn colour band) | Same | Vines: deciduous |

- **Seasonal shader risk (blocking):**
  - `hbConifer` (`materials.ts:263-265`) decides "evergreen" by leaf colour: linear green < ~0.075 or blue/green
    > ~0.3. Everything else blossoms in spring, turns red or gold in autumn and **dithers away to bare twigs in
    winter**, shadows included (`:316-338`, `:571`).
  - Olive, cypress, pine and the maquis must not lose their leaves.
  - **Fix:** add an explicit evergreen flag in the vertex colour alpha or a pattern id (for example a new
    `leaf_evergreen` pattern next to `leaf=8`). Stop inferring it from colour.
  - Pin it with a unit test on the classifier, not on colours.
- Overall ratio: about 70% evergreen by crown area, with deciduous accents carrying blossom and autumn colour. Winter
  keeps v1.1.0's full snow cover and icicles (Q2), so the evergreen crowns must take snow well: snow on the flat
  umbrella-pine tops and olive crowns, not only on conifer tiers.

### 4.7 Fleet (`scripts/harbour/blender/hulls/`, `titans/`, `wrecks/`, `src/harbour/fleet/`)

Today there are 18 kit hulls (`hb_hulls.py:194-227`), mapped by peg family (`model/classify.ts:31-38`) and size class
by supply decade (`:21-28`). Titans override per coin (`titans.ts:11-16`).

| Family (peg) | Today | Target ancient type | Rig |
|---|---|---|---|
| usd | cat skiff → sloop → cutter → schooner → full-rigged ship | **Fishing boat** (skiff) → **small coaster** (boat, small) → **corbita** with an artemon (medium) → **large merchantman** with a topsail (*siparum*, large) → **Alexandrian grain ship** (flagship: main, topsails, artemon, swan-neck sternpost) | Square main on a yard; artemon (a small square bow sail) from medium up |
| eur | Dutch botter (tanbark sails) | **Greek merchantman** with painted eyes (*ophthalmoi*) on the bow, tanbark sails kept | Single square sail |
| gold | Brig | **Galley**: bireme (medium) and trireme (large), a gilded sternpost (*aphlaston*), a bronze ram, oars raked static when docked and fixed "mid-stroke" under way | Square main, brailed |
| fiat | Lugger (ochre sails) | **Phoenician *hippos***: a horse-head prow and a rounded hull | Square sail, ochre cloth |
| other | Work skiff | **Nile-style papyrus or plank work boat** with a spritsail (the sprit is period-attested) | Sprit |
| Titans (USDT, USDC, USDe, USDS) | Bespoke big ships (`tt_titans.py`) | ***Syracusia*-class** giants: a three-masted grain-ship form with towered deck houses. Each titan gets one distinct deck feature. | Square courses, centred emblem (`tt_titans.py:111-142`) |
| Wrecks (`wk_wrecks.py`) | Schooner and brig ribs | The same causes of death on ancient hull forms. Amphora spills are period-perfect. | — |

**Contract and breakage (from the fleet survey, `hull-kit.ts`, `sail-plan.ts`, `fleet-material.ts`):**

1. **Keep the node contract** (`hb_hulls.py:1-25`).
   - Root extras `{family, class, rig, loa_m, beam_m}`.
   - The meshes `hull`, `deck`, `mast`, `yards`, `rigging`, `flag`.
   - `sail_main` with emblem UVs in [0,1]: without it the logo and LOD dye disappear.
   - The empties `bow_cleat`, `stern_cleat`, `masthead_light`, `wake_origin`, plus the `furl` shape key.
2. **The roundel works on any convex sail** (`sail-plan.ts:193`), so a square main is fine.
3. **The second roundel** goes on the biggest other *lower* sail and is projected onto `sail_main`'s plane
   (`sail-plan.ts:89-103`). On ancient rigs that is the artemon: small, forward and steeply raked. Either restrict
   the second roundel to sails above an area threshold and near-parallel to the main, or give it its own plane.
   Small change, unit-tested.
4. **Sail covers carry the docked roundel** but hang from booms, and square rigs have no boom. Ancient ships brailed
   the sail up to the yard. Author a **brailed-sail bundle** mesh on the yard, named `sail_cover`, and move the
   cover-roundel projection to work without a boom (`hull-kit.ts:142-169`). Otherwise a docked ancient ship shows
   only its burgee.
5. **Yard bracing:**
   - Yards are fixed at a 30° brace and only mirrored on port tack (`hb_hulls.py:454`, `MIRROR_RIGID`).
   - Any new rigid names (`yard_artemon`, `steering_oar`, `oars`) must be added to `MIRROR_RIGID`, or their camber
     is wrong on port tack.
   - Lateen is **not** proposed, because the boom group only rotates about vertical Y (`hull-kit.ts:105`).
6. **Dye edge band:** the brand edge band sits on one side edge of the sail (`fleet-material.ts:331`). On square
   sails, move it to the **foot** or **head**. Small shader change.
7. **Every rig needs a `build_lod` branch** (`hb_hulls.py:898-934`, LOD ≤150 tris). Picking and label heights come
   from `layout.json` `mastAboveDeck` (`ui/picking.ts:90`), so re-run compose if mast heights change.
8. **Hard-coded ids:** the wreck ids in `wreck-cove.ts:64-120`, the poster `kit_id` table and
   `island/hb_boats.py:47-55`.
   - Either **keep the variant ids** (`usd_schooner_large` becomes an ancient hull under its old id), or rename
     everything and update all three places plus `variants.test.ts` and `wreck-cove.test.ts`.
   - Recommendation: rename (ids that lie are a trap), in one commit.
9. **`ENSIGN`** (`hb_hulls.py:229`) paints a US-style stripes flag and similar ensigns. Replace them with family
   pennants: a red-and-blue swallowtail for usd, an owl-grey for eur, and so on. The **burgee and titan house flag**
   (coin logo, brand colour) are data and stay.
10. **Export order:** run `hulls/export.py` (it rewrites the whole manifest, `export.py:172-181`), then
    `titans/export.py`, then `wrecks/export.py`, then `npm run harbour:compress`.

### 4.8 Text, sound, poster and docs that describe the old town

- **Data strings:** `COVE_CHARACTER` in `compose.py:836-841` writes Nordic descriptions into `layout.json`, and the
  hamlets copy in `audio/controller.ts:91`.
- **Manifest:** the style string "C Northern Light" (`civic/export.py:100`, and the island and hull equivalents).
- **Sound (Q8, approved):** cicadas on summer afternoons in the opt-in ambience, replacing some of the seasonal
  birdsong (`src/harbour/audio/`). Keep it off by default like all sound, and keep the bank lazily loaded.
- **Poster and first paint:** `public/harbour/poster-*.{avif,webp}` are Blender key art. Re-render them after the
  island bake. Social card and media: `docs/pharosville/GITHUB_MEDIA.md`.
- **Dev stand-in:** `world/standin.ts:148-151` instances the old style-C kit pieces when `island.glb` fails in dev.
  Swap it to the new kit or drop the dead pieces.
- **Docs:** `docs/pharosville/ARCHITECTURE.md`, `CONTRACTS.md` and `RUNTIME_FACTS.md` (style mentions, budgets),
  `PRODUCT.md`, plus the CHANGELOG entry at release.

## 5. Phases and gates

### Process rules (unchanged from the reboot plan §7)

- **The operator's verdict on real-GPU frames is the only taste gate.** Each gate is **one screen**: candidates side
  by side, and a pick · keep · kill verdict recorded in `agents/2026-10-15-classical-town/verdicts.md`.
  At most 2 fix loops per gate. Silence is not acceptance.
- **Captures:** Blender lookdev (`civic/lineup.py`, `hulls/lineup.py`, `island/preview.py`) for authoring, and
  `node scripts/harbour/shot.mjs` for the runtime. Shots use **one persistent headless real-GPU Chrome. Never launch
  a browser and never pop a window** (operator rule). Every subagent prompt repeats this.
- **Model routing:** Opus authors and critiques art (Blender, shaders). Sonnet does wiring, tests, renames and
  manifest plumbing. Haiku does inventories. Every subagent prompt states a report cap.
- **Tests pin semantics, never art.** Data truth, node contracts, determinism, budgets. No pixel or recipe
  assertions.
- **Branch:** `restyle/classical`, from `origin/main` at v1.1.0. Small commits per phase.

### Phases

| Phase | Content | Exit gate |
|---|---|---|
| **P0 · Contracts** (Sonnet, small) | (a) A **civic GLB contract check** (`scripts/harbour/check-civic-contract.mjs`, wired into `validate:changed`): parse `public/harbour/civic/*.glb` and `manifest.json` and assert the required node names per kind (table in §6.1). Today nothing checks them, and a dropped name silently kills a feature. (b) The same for hulls: `sail_main` with emblem UVs, the cleats, `masthead_light`, `furl`. (c) Derive the Mint glint position from the press nodes (`mint.ts:73`). | Checks pass on the **current** assets, so the baseline is green |
| **P1 · Kit, palette, shaders** (Opus + Sonnet) | (a) The `cv_lib` and `nl_common` palette and primitives of §3 (`frieze`, `antefix_row`, `velarium`, `shutters`, `roof_terrace`, `exedra`, `tholos`). (b) A **window shader option** for lit openings without the drawn frame and cross mullion (`materials.ts:613-623`), selected by a window kind in vertex colour (§6.2). (c) **An explicit evergreen flag** in the seasonal shader (§4.6). (d) Snow on flat roofs (§6.4). | Blender sheet: the primitive gallery plus one house and one stoa in the kit. Unit tests for (b)–(d). |
| **P2 · Pilot district** (Opus) | End to end on **one** district: the civic quarter (Customs House, Registry, Ethereum office, the Mint) plus the terrace row in front of it. Export, compose, island bake, runtime shots: heart, overview, night, golden. | **G1: the operator approves the language in the real runtime.** This is the expensive gate; don't fan out before it. |
| **P3 · Civic and offices** (Opus, can fan out per building) | The remaining civic buildings (Burn, Chart Room, Storm Station, Harbourmaster, Keeper's Log) and the 7 other offices. Identity re-tune (crest scale, flag scale). | G2: civic sheet (golden and night) plus runtime close-ups of each office |
| **P4 · Town and harbour furniture** (Opus) | All 57 lots (§4.4), quay lamps, pier-head beacons, reef daymark, cranes, bunting, benches, walls, the windmill (Q3). Island rebuild. | G3: heart, overview and night in the runtime; a "cloned houses" check at 16px blur |
| **P5 · Vegetation and seasons** (Opus) | Species swap (§4.6) and the seasonal tuning across the four seasons. | G4: a four-season sheet (like `p10/sheet-*.jpg`) |
| **P6 · Shipyard** (Opus + Sonnet) | Ship sheds, treadwheel cranes and the slide contract (§4.3). Hull stages on the new hull form (it depends on P7's hull form, so author the form first in P7a). | G5: shipyard close-up, the launch voyage still plays |
| **P7 · Fleet** (Opus, the biggest phase) | P7a: hull forms and one rig per family, lineup sheet. P7b: all 18 variants plus LODs, titans and wrecks. P7c: runtime changes (second roundel, brailed cover, dye band, mirror list, id rename). | G6a: lineup sheet of the families. G6b: runtime fleet at heart and docked, logos legible at the same zoom as today. |
| **P8 · Finish** (Sonnet) | Poster re-render, text strings, stand-in, docs, CHANGELOG, budgets refresh, `validate:release`, then the release flow (`docs/pharosville/RELEASES.md`; never tag by hand). | G7: release candidate frames, then a deploy and `npm run smoke:live` |

**P3, P4 and P5 can run in parallel after G1.** They touch different scripts, but all three feed one island bake.
Serialise the bakes, not the authoring. The fleet track (P7) is independent of the town and can start after P1.
Rough order: P0 → P1 → P2/G1 → {P3, P4, P5, P7a} → P6 → P7b/c → P8.

### 5.1 Rebuild commands (reference)

- **Civic:**
  1. `blender -b --factory-startup -P scripts/harbour/blender/civic/export.py [-- --only mint,burn]` (raw output
     goes to `outputs/harbour/civic/raw/`; meshopt GLBs and the manifest to `public/harbour/civic/`)
  2. `npm run harbour:compress`
- **Island:**
  1. `python3 scripts/harbour/blender/island/compose.py`
  2. `blender -b --factory-startup -P scripts/harbour/blender/island/build_island.py -- --export`
  3. `python3 scripts/harbour/blender/island/compose.py --layout` (window lights go into
     `src/harbour/data/layout.json`)
  4. `blender -b --factory-startup -P src/harbour/life/tools/export_walkways.py -- --stages land,town,dress`
  5. `npm run harbour:compress`
  - Watch out: hard-coded paths at `build_island.py:14` (site-packages) and `:36,57` (the emblem atlas under
    `agents/`).
- **Fleet:** `hulls/export.py`, then `titans/export.py`, then `wrecks/export.py`, then `npm run harbour:compress`.
- **Lookdev:** `blender -b --factory-startup -P scripts/harbour/blender/civic/lineup.py -- --state both --mode sheet`.
  The concept scripts in this folder (`*/frames.py`) show the pattern for the Pharos at true scale: import
  `outputs/harbour/pharos/lighthouse.raw.glb`, because Blender cannot read the meshopt-compressed public GLB.

## 6. Implicit contracts and risks

### 6.1 Node names the runtime finds by name (none of them are checked today, so P0 adds the check)

| Kind | Required nodes |
|---|---|
| mint | `chimney_N` (≥1), `press_0..2`, `furnace_glow`, `wheel`, `worker_path` |
| burn | `fire_core`, `fire_emitter`, `smoke_emitter`, `grate_glow`, `coin_chute`, `coin_chute_end` |
| shipyard | `slip_0..5`, `berth_0..36`, `crane_0..2` |
| hull-stages | `keel_only`, `ribs`, `planked`, `painted` |
| customs | `flag_pole_top` |
| registry | `bell`, `frieze`, `grade_board`, `register_flag`; **must not** contain `crest_panel`, `awning` or `flag_pole_top` (it is ~28 m from the Ethereum office and would be dressed as Ethereum's) |
| storm station | `weather_board`, `signal` |
| harbourmaster | `mover_up`, `mover_down` |
| harbour-office:* | `crest_panel`, `awning`, `flag_pole_top` |
| island houses | `chimney_top` (into `walkways.json`), `hb_window` pieces |

Also check `assemble.ts:27-29`: the moving set is `press_N|wheel|crane_N|fire_core`, re-pivoted on their manifest
origin, and the "keep apart" set is `crest_panel|furnace_glow|grate_glow|awning`. Any new animated node (a
treadwheel) must join the moving set.

### 6.2 Windows

- The shader draws a frame and cross mullion on every `hb_window` piece (`materials.ts:613-623`), on top of the
  geometry's mullions (`nl_kit.py:78-80`). On arched or shuttered openings that prints a modern four-pane cross.
- Add a window-kind channel: the window shader reads only `hb_window` COLOR_0 `r` (lit) and `g` (warmth) today
  (`materials.ts:~611`), so `b` looks free; confirm that no writer in `nl_kit` or `cv_lib` sets it. The plain kind gets a
  warm, slightly recessed glow with no drawn frame or mullion.
- Lit selection stays the hashed `uWindowOcc`, so night behaviour is unchanged.

### 6.3 Window lights and the light budget

- `window_lights.json` places one light per building (59 today), and the total cap is 400 (`compose.py:2261`).
- Courtyard houses have fewer street windows. Keep at least one `hb_window` piece per lot facing the camera, or the
  night town goes dark.

### 6.4 Snow

- Snow and icicles assume pitched eaves over walls with pattern 0, 1 or 10 (`materials.ts:371-384`).
- Flat roof terraces would hold snow across the whole top. Accept that: Q2 keeps today's full snow cover.
- Icicles stay at v1.1.0 intensity on pitched eaves. Extend the eave rule to tiled stoa and pediment eaves, and to
  terrace parapets, so the restyled town gets as much winter as today.
- Re-check the winter sheet at G4.

### 6.5 Performance and size

- The island is 287k triangles, 15 meshes, 4.55 MB GLB (2.55 MB gzipped).
- Budgets: ≤400k triangles on screen, ≤120 draw calls, first view ≤6 MB transferred.
- Civic GLBs are not budgeted, but `prefetch.ts:24-27` fetches all of them at startup.
- **Rule:** each phase must land at or under today's triangle count and GLB bytes for what it replaces. The A
  concept is lighter (low-pitch roofs, fewer trims).
- Umbrella pines have bigger crowns than spruce. Watch overdraw and shadow-map cost in the forest chunks, and measure
  with `shot.mjs --uncapped` (and `--igpu`) before and after P5 and P7.

### 6.6 Readability risks

| Risk | Mitigation |
|---|---|
| Temple caricature (every building a temple) | The order hierarchy in §3.2. Houses never get columns. Only the Mint, Customs House, Registry and offices get orders. |
| Monotony of terracotta (an orange carpet at overview) | Three tile tints, wash colours, roof terraces breaking the tile field, greenery in courts |
| Chain identity loss | Chain colour on velaria, flags, pier marks and lettering is unchanged. The office variants are distinct in silhouette, not only colour. |
| Logo legibility on square sails | G6b checks logos at today's zoom. A square sail is larger and flatter than a gaff, so likely better. |
| Burn reads as a temple, not a furnace | Flames about 9 m tall and the coin chute stay; the Burn's fire and smoke scale with burn volume exactly as today |

## 7. Out of scope

- The Pharos model, beam, fire and statue.
- Water, sky, weather and the day cycle.
- The UI chrome and the data model.
- Any new landmark type or data mapping.
- Sound beyond the cicadas (Q8).
- Any change to what a building or ship *means*.

## 8. Reference renders

- `compare-golden.jpg` — A, B and C side by side (lineup plus sheet each).
- `A-alexandria/{lineup,sheet}-{golden,night}.jpg`: the civic language to implement.
- `C-vernacular/{lineup,sheet}-{golden,night}.jpg`: the house angles to borrow (whitewash cube with pergola and
  outside stair, ochre house with shutters, three-arch loggia).
- Baseline: `../2026-10-13-pharosville-reboot/p6/civic/civic-sheet-golden.jpg` and
  `../2026-10-13-pharosville-reboot/p10/sheet-*.jpg`.
