# Lane review — shore, rim, vegetation

Base `4edd97c`. Counts are **measured** by importing the real builders under `tsx`.

## 1. Verdict

The land reads as a **green plate edge with lollipop trees**. The rim is a
constant-width lime ribbon of near-constant height (`rimHeight` spans 0.6–3.1
units over a 3205-tile ring, `garden-rim-mesh.ts:386`), edged by one ochre band,
planted with 106 trees whose silhouettes all resolve to the same rounded blob
because both "species" build crowns from scaled `SphereGeometry` (`:612`,
`:886`). `noon-wholemap.png @ rim` is a knife-cut slab: green top, tan side,
cream void. The 2026-09-07 T2.2 work **did land** in code (490 domes, 41 momiji,
57 pines, 4 islet pines — verified below) but buys little at rest: domes are
2–6 px tall, and the rest camera sees ~10–12 of the 106 trees because planting
is spread evenly around a ring it cannot see. One and a half of the eight
stations are in the rest frame, both cut by frame edges (`noon.png @ 0-120,
700-800` and `@ 1500-1600,620-820`), so they are unjudgeable as places at rest
and read as generic sheds at whole map. Nothing in any frame says *garden*: no
gravel, revetment, terrace, bridge, moss/rock transition or beach.

## 2. Vegetation census (source-measured)

Rim, summer/autumn: **9 draws, 85,920 tris** (winter 81,492).

| Species / element | Count | Draws | Tris | Source |
| --- | --- | --- | --- | --- |
| Pine (rim ring + skirt + engawa hero) | 57 | 1 | 14,022 (246/tree) | `garden-rim-mesh.ts:638`, `:715` |
| Pine (foreground mass, merged static) | 4 | 1 | 984 | `:1164`, `:1209` |
| Pine (islets, same geometry) | 4 | 1 | 984 | `garden-islets.ts:218` |
| Momiji broadleaf | 41 | 1 | 4,756 (116/tree) | `:925`, `:950` |
| Understory dome (icosahedron) | 490 | 1 | 9,800 (20 each) | `:788`, `:822` |
| Rim stones (15 headland + 3 stepping + 5 skirt) | 23 | 1 | 828 | `:1023`, `:1047` |
| Islet stones | 11 | 2 | ~1,148 | `garden-islets.ts:133`,`:146` |
| Reed/lily clumps | **5** | 1 | ~1.2k | `garden-sea-edges.ts:346`; sites `garden-sea-edge-sites.ts:136-145` |
| Timber piles + buoys | 6 | 1 | — | `garden-sea-edges.ts:377` |
| Spring petals (spring only) | 48 | 1 | — | `garden-seasonal-dressing.ts:23` |
| Land top + tide-rock face + path | — | 3 | 55,350 | `:502`, `:1356` |

**Four plant species in the world.** 106 trees over 3205 land tiles = one tree
per 30 tiles; one pine per 56, one momiji per 78, one dome per 6.5. Vegetation is
**7 draws of ~213** and ~31k of ~355k tris: ~2% of the draw budget on the element
the brief names first.

## 3. Findings

**DEFECT — whole-map LOD sheds the massing species and keeps the balls.**
`OVERVIEW_LOD_DETAIL_NAMES` comments at `garden-overview-lod.ts:76-77` state "the
pines and broadleaves are landscape MASSING and stay", then line 80 lists
`garden-rim-pines` and line 119 repeats it in `OVERVIEW_LOD_WHOLE_RING_NAMES`.
`overviewLodTargetDetail(0.42)=0`, so at the whole-map hash every pine is
invisible and the 41 autumn momiji are the only rim planting left — visible in
`noon-wholemap.png @ rim, 150-900 x 400-620` as ~40 evenly spaced pale-orange
popcorn balls. The code contradicts its own stated intent and inverts the
silhouette.

**DEFECT — the two named foreground masses do not read.** At 1600×1000 the
19-unit hero pine group merges with the station roof behind it
(`noon.png @ 0-180,680-820`) and the kuro torii + fence reads as three thin dark
sticks and a diagonal beam, not a gate (`/tmp/noon-torii.png`, orig
`noon.png @ 100-200,790-880`). A vision pass on the frame reports "no torii
visible". The invariant at `VISUAL_INVARIANTS.md:133-136` claims they "frame the
plate's near edge"; they don't — they are two small dark clumps inside it.

**DEFECT — the skirt's outer edge terminates against the void inside the rest
frame.** `rimHeight`'s let-down (`:391-400`) lowers the apron so it "recedes into
haze", but the haze is a flat cream plate-shadow: `noon.png @ 60-420,860-960`
shows lime land meeting a pale grey-cream field along a hard diagonal, with no
coast, no water, no rock. Bottom-left of the modal frame reads as a render bug.

**DEFECT — the engawa reads as a pier and a hole.** `ENGAWA_TIMBER` is
`timber_dark × 0.54` (`:107`); at rest the 19×5.2-tile deck is a near-black
diagonal band with a black gap on its landward side
(`noon.png @ 200-420,780-860`). It is a boardwalk laid *along* the shore, not a
veranda facing water, and there is no floor, no post-and-lintel, no roof edge —
so nothing says "the viewer's place".

**GAP — one tree silhouette, two names.** `createPineGeometry` builds four
`SphereGeometry(1,8,4)` pads scaled ~1.1×0.4 (`:605-617`); `createBroadleafGeometry`
builds three of the same (`:880-890`). Both render as rounded blobs on a bare
trunk (`/tmp/noon-bl.png`: dark blobs left, one pumpkin-orange blob centre). No
horizontal-plate pine layering, no trunk taper visible at rest, no karikomi, no
bamboo, no vertical accent anywhere in the planting.

**GAP — the understory is invisible as planting.** World-y projects at
`TILE_HEIGHT·(√3/2)·zoom` = 10 px/unit at rest zoom 0.72; domes are 0.24–0.58
units tall (`:810`) → **2.4–5.8 px**. In frame they are flat lime cabbages near
trunks (`noon.png @ 1330-1420,860-900`): litter, not ground cover. 9,800 tris
and a draw for a texture effect.

**GAP — no shoreline vocabulary.** `addShoreCourses` (`:469`) gives every coast
the same three quads (top→tide-stain→wet-rock plus a 0.34–0.64 shelf) — one
recipe for 3205 tiles. No sand, boulder toe or revetment, and the world's
**five** reed clumps all sit at Calm/Watch in the north
(`garden-sea-edge-sites.ts:136-145`), never on the camera-side shore.

**GAP — ground is two colours, badly keyed.** `rimColor` (`:403`) blends
wet-rock→earth→moss by inland distance only; slope, curvature and height do
nothing. At noon: acid lime plateau plus muddy ochre rim
(`noon.png @ 250-900,830-990`), and no rock colour on the outcrop shelves
`rimHeight:377` already builds.

**GAP — night keeps the vegetation green.** `night.png` bottom-left shows
readable green foliage and lit brown pilings; "one dominant light" wants that
mass black. The foreground masses are correctly non-emissive (`:116-123`), but
ambient/hemi keeps everything else lit.

**GAP — stations are off-frame, and legible only as sheds.** `garden-docks.ts`
authors nine archetypes with real roof articulation (`:1403` irimoya, `:1532`
gable, `:1627` pyramid, `:1667` cone) — the work exists. But the rest frame shows
1.5 of them, and whole map shows a hall, a pier and a steamer with no garden
relationship: no water approach, no gate, no lantern line, no stone landing.
Each cove does get one spur (`coveSpurs = 8`, `:1374-1406`), but it is a flat
0.56-wide pale quad, invisible at rest.

## 4. Ideas, ranked

Costs are deltas against the current 213–233 draws / 355k tris / 44 tex.

**1. STEP CHANGE — Species library with real silhouettes (`garden-rim-mesh.ts`,
new `garden-flora.ts`).** Replace the two blob builders with six instanced
species, each a *distinct* silhouette: (a) black pine — 3–5 flattened horizontal
plate pads on an S-curved trunk (cone sections, not spheres); (b) momiji —
umbrella crown of lobed discs with a visible fork; (c) cherry — wider, flatter,
paler; (d) bamboo — 5–9 vertical culms per clump, the world's only vertical
accent; (e) karikomi — *large* clipped domes, 1.2–2.2 units (5× today's, so they
read at 12–22 px); (f) moss/gravel patches as flat vertex-coloured decals merged
into the land-top draw (no extra draw). Sketch: one `SPECIES` table (geometry
builder, height range, sway flex, seasonal policy), one lattice pass emitting
per-species spec arrays, one `createSpeciesBatch` reused six times, keeping
`patchGardenInstancedWindSway` with per-species flex so bamboo whips and pines
barely move. Redistribute rather than inflate: drop the 490 micro-domes, spend
on ~90 karikomi, ~40 bamboo, ~140 pines, ~70 momiji/cherry. **Cost:** +4 draws,
~+35k tris (~65k rim total), 0 tex, ≪1 ms; **L**. **Risk:** silhouette
law at whole map — see idea 7. **Displaces:** the icosahedron understory batch and
the shared `createPineGeometry`. **Re-pins:** `garden-rim-mesh.test.ts:70,85-90`
(draw count 9, pine/understory/broadleaf windows), the tri window at `:101`,
`garden-islets.ts:236` (islet pines must adopt the new pine),
`garden-draw-census.test.ts`. **Deps:** RenderArchitecturePerf (draw budget),
IslandLighthouse (island niwaki should share the library, not fork it).

**2. STEP CHANGE — Terraced garden shore: slope material + revetment
(`garden-rim-mesh.ts` `rimColor`/`rimHeight`/`addShoreCourses`).** Make the land
material a function of slope and height, not distance: gravel/sand on the flats
near water, moss on gentle inland, exposed rock on the outcrop shelves that
already exist in `rimHeight:377`, plus a raked-gravel band inside station
precincts. Then give the coast three authored *forms* instead of one: sand beach
(shore shelf widened to 2–3 tiles, pale), stone revetment (an instanced
0.8-unit dressed-block course along the coast polyline, 1 draw, ~2k tris), and
boulder toe (reuse the dodecahedron stone batch, raise 23 → ~120 instances along
the whole coast, +0 draws). Sketch: `buildLandGeometry` already walks coast
cells (`:544-556`); emit a per-cell `form` from a low-frequency hash + station
proximity, and push revetment/boulder anchors into two instance lists in the same
walk. **Cost:** +2 draws, ~+6k tris, 0 tex; **L**. **Risk:** the water lane owns
the waterline — a beach needs the wet band to agree. **Displaces:** the single
`addShoreCourses` recipe and the uniform ochre band. **Re-pins:**
`garden-rim-mesh.test.ts` stone count 23 (`:94`), the tri window, any tide-stain
colour assertion. **Deps:** Water (wet band/foam at the new beach), SkyAtmospherePost.

**3. Far rim becomes hills that meet the sky.** `rimHeight` caps at 3.1 units
(`:386`). Raise the **north/west** rim (the far pair, which grows no skirt) to
8–18 units with a ridge profile keyed off `rimDepthAt`, so the top of the frame is
a hill silhouette instead of a haze seam, and the whole-map slab gains a horizon.
Cost: 0 draws, ~+8k tris (same sheet, more relief), **M**. Risk: station
envelopes at the far arc must stay level (clamp inside `RIM_STATION_CLEARANCES`);
`rimDepthAt` is 6–14 tiles, so a 15-unit ridge is a ~45° face — steep but
isometrically legible. Displaces: the flat haze-seam framing.
Re-pins: `VISUAL_INVARIANTS.md:123-126` (rim depth wording stays; height is
unpinned), any shadow-frustum bound. Deps: SkyAtmospherePost (ridge must occlude
the seam, not hover in it), CameraComposition.

**4. Fix the whole-map LOD inversion.** Remove `garden-rim-pines` from both lists
in `garden-overview-lod.ts:80,119`, keep the understory/karikomi shed, and add a
single low-poly **canopy-mass** impostor batch (one flattened dome per ~4 trees,
~120 instances, 1 draw) that fades *in* below zoom 0.62 as the trees fade out —
so pulling back gives forested hills instead of popcorn. Cost: net +1 draw at
overview, −57 instanced draws' worth of vertex work; **M**. Risk: crossfade
double-draw in the band (both at ≤50% alpha is not available — use hard swap at
0.53, mid-band, since both are solid). Re-pins:
`garden-overview-lod.test.ts` name lists. Deps: RenderArchitecturePerf.

**5. Foreground repoussoir that actually frames.** Replace the two clumps with one
**near-camera pine bough** — a merged static mesh hanging into the top-left or
bottom-left corner, 1–2 units from the camera plane in world terms, dark-valued,
occupying ~12% of frame edge — plus keep the corner trunk. This is the single
cheapest "amazing" lever in the lane: it creates depth in every rest frame.
Cost: 1 draw, ~1.5k tris, **S**. Risk: orthographic camera + shadow map — the
bough must not cast a shadow across the fleet (`castShadow=false`) and must be
excluded from N8AO's near range if it bruises. Displaces: `GARDEN_RIM_FOREGROUND_MASSES`
as authored. Re-pins: `garden-rim-mesh.test.ts:82,487` (mass count 2),
`VISUAL_INVARIANTS.md:133-140`. Deps: CameraComposition (owns the rest framing),
AstraGardenDirector.

**6. Stations as garden architecture, garden-side.** Keep `garden-docks.ts`
massing; add the *approach* each station lacks: a stone-stepped landing at the
cove mouth, a two-lantern-per-side tōrō line along the existing cove spur
(instance the engawa lantern, ~32 instances, 1 draw), one arched timber bridge
where a spur crosses the wet band, and a raked-gravel forecourt (idea 2's
material). Widen the spur to 1.4 units and dye it gravel-pale so it reads at
rest. Cost: +2 draws, ~+4k tris, **M**. Risk: the eight envelopes are measured and
guarded (`RIM_STATION_CLEARANCES`, `:58`) — everything must sit outside them or
inside the authored rect. Re-pins: `coveSpurCount` 8 (`:100`), path segment
window (`:97`), lantern budget (garden-lanterns owns water lanes). Deps: DataInformativeness
(the approach is where a station's numbers could live), UiHud.

**7. Re-key the ground.** `MOSS` is `aurora_green × 0.92` (`:88`) and reads as acid
lime at noon; `GARDEN_RIM_MOSS_BLEND_MAX = 0.62` (`:105`) puts it over most of
the ring. Desaturate ~25%, push toward yellow-green in sun and blue-green in
shade, and let the earth band be sand rather than mud. Cost: 0 draws, **S**.
Risk: it is the value plane the fleet reads against. Re-pins:
`GARDEN_RIM_COLOR_HEX` consumers, any palette contract test. Deps: SkyAtmospherePost
(grade LUT), AstraGameArtDirector.

**8. Shore reed and rock distribution.** Promote reeds from a 5-instance
sea-edge accessory to a rim-owned batch on the coast lattice (~120 clumps,
1 draw, wind-swayed), concentrated in coves and shallow bays, absent on
revetments and beaches. Cost: +1 draw, ~+3k tris, **S/M**. Risk: they must not
enter `GARDEN_EDGE_STONE_OBSTACLES` (no navigation change — keep them land-side
of the waterline). Re-pins: `garden-sea-edges.test.ts` reed count if the
sea-edge batch is left untouched (recommended: leave it, add the rim batch).
Deps: Water, FleetMotionDensity (clearance).

**9. Seasonal ground, not just crowns.** Season reaches only the momiji crown
(`:903`) and 48 spring petals. Extend it to ground tint (spring green, autumn
ochre, winter pale with snow-capped karikomi). 0 draws, **S**.

**10. Night as silhouette.** Hook a `nightValue` factor from the day cycle into
the vegetation batches' albedo so the shore mass goes black and harbour embers
are the only warmth. 0 draws, **S**. Deps: AmbientLifeLight.

## 5. Rejected

- **Alpha-tested foliage cards** — N8AO runs transparency-unaware at half res;
  each card bruises and holes the water (documented `:746-760`).
- **Re-siting a cove to pull a station into the rest frame** — siting is pinned
  by arc/extreme invariants (`VISUAL_INVARIANTS.md:78-92`); fix by camera or by
  making the near shore worth looking at.
- **Per-tree `Object3D` LOD swaps** — scene-graph churn for what one impostor
  batch (idea 4) does in a draw.
- **Grass shell / fur shader on the land top** — 42,560-tri sheet already, and
  the isometric camera never sees blade parallax.
- **Raising ambient-life counts** — brief line 99 forbids; redistribution only.
- **Cliffs on the camera-side skirt** — would wall off the near corner and hide
  the fleet; the far rim (idea 3) is where height is free.

## 6. Cross-lane

**Need:** CameraComposition — the rest framing gates ideas 5 and 3.
SkyAtmospherePost — a far ridge only helps if the backdrop seam behind it is
solved; the plate-void edge at `noon.png @ 60-420,860-960` is jointly ours.
Water — beach, wet band and reed line all need the shoreline shader to meet new
geometry. RenderArchitecturePerf — confirm +8…+11 draws and ~+50k tris.

**Hand over:** IslandLighthouse — take the species library (idea 1) rather than
forking niwaki; island grove and rim should be one vocabulary, as
`createPineGeometry`'s export already intends. DataInformativeness — the station
approach (idea 6) is unused surface for per-chain reads. AmbientLifeLight — night
value on vegetation (idea 10) is a shared uniform, not a rim-local hack.
FleetVisuals — once the shore has real form, the hull carpet's uniform weight is
the next thing that breaks the frame.
