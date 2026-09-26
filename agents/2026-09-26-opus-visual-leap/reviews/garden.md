# The garden itself: vegetation, rim, islets, stone, seasons — garden

## Verdict
There is no garden in the resting frame. Everything authored as "the viewer's garden" sits outside the frustum at every gate viewport: bough, engawa, tōrō, stepping stones, heron perch, koi, petals and waterfall. They were placed for the retired iso rest. What the frame does show is a toy set. Pines are stacked lampshades on poles, because the pad is an upside-down cone. The far-west ridge is a black lump topped with palm-like lollipops. Karikomi are lime gumdrops, and autumn maples are orange mushrooms dyed from the reserved vermillion. See `noon.png`, `wholemap-noon.png`, `garden/crop-island-morning.png` and `garden/crop-1440-lefthill.png`.

The leap:
1. Put one dark cloud-pruned bough into the lower-left of the rest frame, solved in screen space.
2. Build real niwaki: flat-bottomed cloud pads, dark undersides, sashi-eda limbs.
3. Evergreens carry the market's 30-day record; deciduous trees keep a slow, uneven calendar.

## What I looked at
- **Baseline frames:** `noon.png`, `morning.png`, `golden.png`, `night.png`, `wholemap-noon.png`, `noon-1440p.png`. Metrics from `morning.txt`: 283 scene draws, 380k tris, 50 textures, tier `full`.
- **Captures and crops** (`outputs/opus-review/garden/`):
  - `crop-1440-lefthill.png`, `crop-1440-headland.png`: crops of `noon-1440p.png`.
  - `island-morning.png` + `crop-island-morning.png`: `#t=8.5&cam=944,-1300,1.5`. First attempt timed out; the retry ran at tier `constrained`. Used for geometry and silhouette only, not light.
  - `engawa-morning.png`: `#t=8.5&cam=1856,-1295,1.1`, tier `full`. The authored near garden, seen from a camera aimed at it.
  - `wind-sheet.png`: motion sheet, `#t=12`, clip `150,400,700,340`, 9×600 ms. First run tier `recovery`, retry tier `interaction`, so motion only.
  - `crop-noon-crane.png`: crop of `noon.png`.
- **Projection proofs:** throwaway `tsx` scripts run against the real `defaultCamera`/`cameraPoseFromIso`/`worldToScreen` and then deleted. They produced:
  - Rest-frame screen positions of every near-garden element at 1600×1000, 1200×640, 900×720 and 2560×1440.
  - Inverse projection of in-frame corner targets to world/tile.
  - The land mask around the rest corner.
- **Code:**
  - `src/three/garden-flora.ts`: `SPECIES` :10-17, `createFloraPadGeometry` :62-64, `createSpeciesGeometry` :66-127, wind patch :158-214.
  - `garden-rim-mesh.ts`: colours :80-124; `rimHeight` :295-345 (far ridge :326-344); `rimColor` :347-366; coast forms :439-486; `pineTiles` :629-709 (stride pick :705-708); `plantingTiles` :721-733; stones :778-863; foreground bough :912-986; engawa and tōrō :1064-1104; assembly :1113-1179.
  - `garden-islets.ts` :107-239.
  - `garden-island.ts`: stones :938-984, karikomi :992-1082, niwaki :1217-1404.
  - `garden-month-record.ts`.
  - `garden-canopy-impostors.ts`.
  - `garden-seasonal-dressing.ts`.
  - `garden-almanac-dressing.ts` :27-31.
  - `garden-waterfall.ts` :28-45.
  - `systems/season.ts`.
  - `systems/camera.ts` :52-221; `systems/projection.ts` :1-141.
  - Breath amplitudes: `use-world-render-loop.ts:778-784`.
  - `palette.ts` :31-32, 53-89.
- **History:**
  - Prior lane review `agents/pharosville-reborn/reviews/shore-rim-vegetation.md`.
  - Decision ledger.
  - Reborn plan W1.9, W1.13, W3.8, W4.17.

## Spell-breakers (defects)

1. **The near garden threshold is authored off-screen at every gate.**
   - **Where:** `noon.png` bottom-left (0–420, 700–1000) holds a cut hull, a floating "T" sail and open water, with no bough or garden. `noon.png` bottom-left reads ~45–55 grey against the bible's 15 for "clipped pine" (`VISUAL_INVARIANTS.md:28`).
   - **Measured rest-frame screen positions** (1600×1000, frame is 0–1600 × 0–1000):

     | Element | Screen (x, y) |
     | --- | --- |
     | Foreground bough | (−1691, 1627) |
     | Engawa tōrō | (−876, 1123) |
     | Waterfall pool | (−624, 884) |
     | Dusk heron perch | (−371, 1098) |
     | Koi / spring-petal drift | (−550, 894) |

     All are also off-frame at 1200×640, 900×720 and 2560×1440.
   - **Cause:** the bough is solved as "8 u forward, 12 u left, 6 u below the eye" (`garden-rim-mesh.ts:919-923`). That point is 56° off-axis against a 24.6° horizontal half-FOV, and ~33° below the view axis against a 16° half-FOV.
   - **Why it matters:** the bible's first foreground sentence is simply absent. Every seasonal and almanac garden event plays to nobody.
   - **Fix:** idea garden-1. **Cost:** M.
2. **Pines read as lampshade stacks (island) and as palms (rim, ridge).**
   - **Cause:** the pad is `CylinderGeometry(0.36, 1, 1, 9)` (`garden-flora.ts:63`), wide at the bottom and narrow on top. That is the inverse of a niwaki cloud, which is flat below and domed above. In side view the flare reads as a drooping frond or a parasol.
   - **Also:**
     - Every pad is one flat vertex colour (`:91`).
     - The pads alternate symmetrically up a straight three-segment pole (`:94-98`).
     - The branch struts are 0.08 u, invisible, so the pads float.
   - **Where:**
     - `crop-island-morning.png`: vertical pines at 520–680 × 180–600 are seven lime parasols on a stick; the leaning pine at 0–500 × 30–440 is a snapped pole wearing plates.
     - `crop-1440-lefthill.png` (280–660 × 40–170): tall black trunks with two tiny flared pads read as palms.
     - `wholemap-noon.png` rim ring: palms. The harbour lane independently reached the same verdict.
   - **Fix:** idea garden-2. **Cost:** M.
3. **Autumn spends the reserved vermillion on decoration.**
   - **Code:**
     - Momiji autumn crown = `vermillion` lerp 0.18 `sun_day_warm` (`garden-flora.ts:71`), on 40 rim instances.
     - The island maple lerps 0.42 toward vermillion (`garden-island.ts:1386-1387`) and lands on olive mud (`crop-island-morning.png` 480–680 × 180–340).
     - Spring cherry takes a 10% vermillion lerp (`:70`).
   - **Contract broken:** `palette.ts:31-32` reserves vermillion for the beacon flame and the DEWS DANGER band.
   - **Where:** `crop-1440-lefthill.png` 450–620 × 160–200 shows orange mushroom umbrellas.
   - **Why it matters:** it dilutes chroma primacy and puts the danger hue in the scenery.
   - **Fix:** idea garden-3. **Cost:** S.
4. **Winter greys the evergreen pads that carry the 30-day PSI record.**
   - **Channel:** `applyGardenMonthRecord` (`garden-month-record.ts:41-53`) encodes the trailing PSI record as island-pine fullness and green-versus-straw. The DOM clause is `gardenMonthRecordLedgerClause`.
   - **Conflict:** the season path separately desaturates those same pads by 18% in winter (`garden-island.ts:1388-1390`), so the calendar counterfeits a "drier, stressed" record.
   - **Fix:** idea garden-3 (seasons never touch evergreens). **Cost:** S.
5. **The far-west ridge is a black lump with toys on it.**
   - **Cause:** `rimHeight` raises the far pair to 8–18 u (`:337-344`). `rimColor` then paints every tile with slope > 0.6 as `EXPOSED_ROCK` (`:355`), so the whole hill face turns dark rock.
   - **Planting:** the crest carries evenly spaced "palms", green bamboo chopsticks, lime gumdrops and orange umbrellas (`crop-1440-lefthill.png`, `noon.png` 160–400 × 410–570).
   - **Why it matters:** this is the value plan's middle-left "grove, 27". It should read as one dark pine mass and instead reads as a lava rock with a toy shelf.
   - **Fix:** idea garden-4. **Cost:** M.
6. **Ring planting is evenly spaced by construction.**
   - **Cause:** `pineTiles` keeps `count` of `ordinary` by uniform stride (`garden-rim-mesh.ts:708`).
   - **Where:** fence-post rhythm along the south and east rims of `wholemap-noon.png` (480–1100 × 560–650). The bible bans evenly spaced rings (`VISUAL_INVARIANTS.md:36-37`).
   - **Fix:** idea garden-4 (grove selection). **Cost:** S.
7. **Reeds grow out of open sea.**
   - **Where:** `noon.png` 255–485 × 740–850. Three yellow tufts stand in deep open water with no bar, stone or bank, so they read as grass sprouting from the sea (`garden-sea-edges.ts`, `garden-sea-edges-reeds`).
   - **Fix:** root each clump on a visible low sand bar or stone lip (existing sea-edge stone vocabulary), or delete the three at rest. **Cost:** S.
8. **Stones are eggs and chocolate chips; nothing is set.**
   - **Island:** triad dominants read as grey faceted eggs (`crop-island-morning.png` 700–790 × 390–500 and 1070–1150 × 490–600).
   - **Rim:** waterline boulders are a single-colour `DodecahedronGeometry(0.72, 0)` (`garden-rim-mesh.ts:787-788`). They read as a dotted line of brown chips in the water (`engawa-morning.png` 600–860 × 800–870).
   - **Crane islet:** a tan lump with a 2 u sprout (`crop-noon-crane.png`). Hulls moor against it, so the "leaning pine on a rock in still water" reference shot (`garden-islets.ts:207-215`) reads as flotsam.
   - **Fix:** idea garden-5. **Cost:** M.
9. **Karikomi are gumdrops.**
   - **Code:** the rim karikomi is a hemisphere scaled 1 × 1.5 × 0.85, taller than wide (`garden-flora.ts:115-116`). The island's are 8×5 spheres in bright lime.
   - **Where:** `crop-island-morning.png` 840–1290 × 480–610 shows a ring of jelly sweets around the pond.
   - **Fix:** idea garden-8. **Cost:** S.
10. **The engawa tōrō is a gold trophy by day.**
    - **Cause:** the fire box is a solid `lantern_warm` box that is always on (`garden-rim-mesh.ts:1102`).
    - **Where:** `engawa-morning.png` 925–945 × 700–730.
    - **Fix:** a dark hollow by day; `lantern_warm` only when lit. **Cost:** S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### garden-1 ★ The threshold in frame: one kuromatsu limb solved in screen space
- **Picture:** From the lower-left edge a dark, plated black-pine trunk rises out of frame. It bends once, and one long sashi-eda limb reaches toward the harbour, carrying three flat cloud pads. The pads are nearly black beneath, with a thin dull-green lit crown on top. They cover the extreme corner and let the sea show through two gaps. Over two minutes the limb drifts a few dozen pixels against the far fleet, and you feel you are standing under a tree at the garden's edge, looking out.
- **Why:**
  - Spell-breaker 1. The bible's foreground is absent from every rest frame.
  - With the eye at (175.7, 20.6, 189.9), pitch 4° and 32° vFOV, nothing within ~56 u of the eye at water level can enter the frame. A threshold must therefore be tall and near: canopy, not ground.
  - `bough.ts` shows the lower-left targets. At 1600×1000, screen (0.06, 0.90) at depth 14 = world (162.0, 16.4, 184.1), tile (114.6, 130.2), which is over water.
  - `land.ts` shows solid land from tile row y ≥ 133. So root the tree at ~tile (117, 134.5), height ~1.6, with a 19 u trunk leaning ~7 u north-west. That is the classic seaside pine leaning over the water.
- **Impact:** stunning 4, poetic 5, relaxing 4. **Confidence:** H (geometry is proven; taste needs a real-GPU pass).
- **Cost:** M.
- **Perf:** 0 draws net (replaces `garden-rim-foreground-pine-bough`), +1.5–2.5k tris, 0 textures, ≈0 ms GPU. CPU: one `Matrix4` write per frame while breathing, no allocation.
- **How:**
  1. **Delete the eye-relative constants.** Remove `FOREGROUND_BOUGH_*` (`garden-rim-mesh.ts:912-937`). Add `solveGardenThresholdPose(viewport)`. It takes `defaultCamera(viewport)`, builds the same `PerspectiveCamera` as `world-renderer.ts:5064-5071`, and inverse-projects two anchors: the pad cluster centre at screen (0.07w, 0.88h), depth 14 u; and the trunk exit at (0.16w, 1.04h), depth 9 u.
  2. **Build the mesh.** Use a dedicated `createThresholdPineGeometry()` from the garden-2 generator (limb variant: one 9–10 u sashi-eda, 3 pads of 2.8/2.2/1.6 u).
  3. **Placement.** Re-solve on resize, not only at 1600×1000.
  4. **Breath rig.** Breathing orbits the eye ±3.3 u (yaw ±2°, `use-world-render-loop.ts:783`). A raw 14 u object would swing ~375 px. Set `position = solved + (breathedEye − restEye) × 0.85` each frame. Residual parallax is ~55 px over the 118 s period: a slow depth cue, not a swing.
  5. **Fade.** Fade out over 600 ms (motion token) when the live camera leaves the rest neighbourhood: |zoom − restZoom| > 0.08 or target > 6 tiles. It already hides at whole-map through `OVERVIEW_LOD_DETAIL_NAMES`.
  6. **Material.** `castShadow = false` (off-frame caster, shadow-frustum inflation). Needle `PINE_NEEDLE × 0.34` beneath, ×0.62 crown. Bark `stone_dark` lerp `timber_dark` 0.3. Night value → ≤ 3.
  7. **Heron.** Move `GARDEN_HERON_PERCH_WORLD` (`garden-almanac-dressing.ts:27-31`) onto the crane islet's dominant stone, which projects to (1200, 636) at rest. A pale heron on a dark stone, against dusk water, in frame.
  8. **Petals.** Re-site the spring drift from the engawa koi to the island lee (see garden-7).
- **Displaces:** the off-frame bough, the eye-relative solver and the off-frame heron perch. The cut hull in the lower-left corner must move (see Risks).
- **Truth & a11y:** decorative, no meaning (`visual-cue-registry.ts:5`). Hit-testing is projection-driven, so nothing under the limb becomes unpickable. Reduced motion: breathing is off, so the limb holds its solved rest pose.
- **Risks:**
  - It must never cover an eligible hull at rest. The fleet lane must keep the projected corner rect [0, 0.24]×[0.70, 1.0] free of hulls; today a "T" hull sits there. Covering it would violate "never by hiding eligible ships".
  - Tests pin `foregroundMassCount` and the mass tile (`garden-rim-mesh.test.ts:71-74`); replace them with a projected-bbox behaviour test.
  - A too-sharp near silhouette could read as a sticker. A near-field-only softening (garden-post tilt-shift band, near side only, at rest) is an optional follow-on for the Light/Printmaker lanes.
- **Acceptance:**
  - Real GPU `#t=12.25`, `#t=17.6` and `#t=22` at 1600×1000, 1200×640 and 900×720. Pads cover 35–60% of the corner rect and never touch the tower column, the crown rect or the open-inlet corridor.
  - Noon mean luma under the pads ≤ 20.
  - A 9×12 s motion sheet shows ≤ 70 px limb drift.
  - The heron is visible at the crane islet in a dusk-beat capture.

### garden-2 ★ Real niwaki: cloud-pad kuromatsu, shared by rim, islets, island and threshold
- **Picture:** The island's five pines become black pines a gardener has shaped for forty years. The trunk is grey-black and plated, with a root flare and one decisive S-bend. Each branch is a visible arm that runs out level and turns up under its pad. Each pad is a low, lumpy cloud, flat and shadowed beneath, domed and lit on top, and larger at the bottom than at the apex. One long low limb reaches over the water. At golden hour the pad rims glow faintly amber against the sun; at noon the dark undersides stack into the layered read that makes niwaki legible from a hundred metres.
- **Why:**
  - Spell-breaker 2.
  - The pad profile is inverted (`garden-flora.ts:62-64`). The file's own docstring claims "flattened tapered cone sections keep negative space", but the taper points the wrong way.
  - Lighting is one flat colour per species (`:68`, `:91`).
  - Island niwaki reuse the same pad (`garden-island.ts:1354`). The islets reuse the same pine at 0.26–0.5 scale (`garden-islets.ts:224-230`), so the "reference shot" is a 2 u sprout.
- **Impact:** stunning 5, poetic 4, relaxing 3. **Confidence:** H.
- **Cost:** M.
- **Perf:** +1 draw (a second rim-pine variant), ≈ +35k tris (pine 214 → ~480 tris × 124; island pads 36 → ~120 tris × ~24), 0 textures, < 0.1 ms [INFERENCE].
- **How:**
  1. **Pad.** `createCloudPadGeometry(seed)`: 3–5 `IcosahedronGeometry(1, 1)` lobes offset ±0.45 in x/z, merged. Clamp y ≥ −0.18, then scale y × 0.42 (flat base, soft dome). Displace 0.06 by `stableUnit`.
  2. **Pad vertex colour:** `t = (y + 0.18) / 0.6`; base ×0.40 lerp `fog_blue` 0.08 (cool shadow); crown ×1.0; outer rim band (radial > 0.85, t > 0.5) +8% toward `sun_day_warm`.
  3. **Trunk.** Catmull-Rom S through 5 nodes. Radius 0.34 → 0.07. Root flare: 4 short splayed cylinders. Bark `stone_dark` lerp `timber_dark` 0.35. Black-pine bark is grey-black, not brown timber.
  4. **Branches.** Each pad gets a 2-segment arm: horizontal out, then up. Radius 0.11 → 0.06, visible.
  5. **Composition.** Pads sized 1.0 / 0.85 / 0.7 / 0.55 / 0.4 bottom to top, one sashi-eda at 1.6× crown width to one side, apex small, pad gaps ≥ 0.35× pad height. Two variants: upright `chokkan` and windswept `fukinagashi` for seaside rims.
  6. **One generator, four users.** Replace the `pine` branch of `createSpeciesGeometry` (`:93-98`). Keep `SPECIES`/`createSpeciesBatch`, and reuse the generator in `createNiwakiGrove` (`garden-island.ts:1329-1404`), `createIsletPines`, and the threshold limb.
  7. **Islets.** Crane islet pine scale 0.5 → 1.1, lean 0.35 seaward, as the one bonsai-grade silhouette on water.
  8. **Light.** Add `patchGardenFoliageLight(material)` next to `patchGardenFloraNight`: `emissive += albedo × uSunColor × pow(max(0, dot(-V, L)), 6) × rim × 0.3 × uGolden`, where `rim = 1 − |N·V|`. The sun uniform comes from `garden-sun.ts`. Clamp so pads never out-glow the tower.
  9. **Wind.** Rigid per-pad bob replaces the vertex bend: pines 0.02, momiji 0.06, bamboo top 0.12.
- **Displaces:** the cone pad, the flat single-colour foliage, the invisible struts and the 2 u islet sprouts.
- **Truth & a11y:** keep the garden-record channel intact. `island-niwaki-pads` keeps its instance scale and `instanceColor` (`garden-month-record.ts:41-53`), and the new underside gradient multiplies it, so fuller or straw-browned pads still read. Ledger clause unchanged. Static geometry, so reduced motion is identical apart from wind already zeroed.
- **Risks:**
  - Tests pin tri windows and pine counts (`garden-islets.test.ts:32-35` "214 triangles each", `garden-rim-mesh.test.ts:75`, draw census). Re-pin them as behaviour (pad underside darker than crown), not numbers.
  - Headroom: the island pines are already dark against the tower base. The Light lane should check the tower still pops.
- **Acceptance:**
  - Real GPU `#t=8.5&cam=944,-1300,1.5` and `#t=17.6`. In a 16 px blur, pines read as stacked dark horizontals, not parasols.
  - A vision pass on the crop names them "pine" or "bonsai", not "umbrella" or "palm".
  - At golden, pad rims show warm edges on the sun side.

### garden-3 ★ Evergreens remember the market; deciduous trees keep the calendar (microseasons)
- **Picture:** In late October, one maple by the island stair has begun to turn: rust at the crown, still green below. The next week three more have gone, each a different amber, persimmon or crimson-brown, and one already stands half bare. Mid-December the maples are fine grey branch drawings. On a rare January morning the pines hold thin snow on the top of every cloud pad, while the dark undersides stay dark. In the first week of April one cherry near the lee is white for nine days. Through all of it the pines never change with the season, only with the market.
- **Why:**
  - Today the season is four hard states by UTC month (`season.ts:7-15`). Autumn equals "vermillion umbrellas" (spell-breaker 3), and winter greys the market-record pines (spell-breaker 4).
  - Spring's only moving layer is off-frame (spell-breaker 1). No snow, no turning, no shedding.
  - The prior plan's W4.17 microseasons never landed (it was Ext). It lands now because the garden-2 generator gives every tree a per-instance colour, and the rest frame finally holds trees (garden-1, garden-4) where the change is visible.
- **Impact:** poetic 5, relaxing 4, stunning 3. **Confidence:** M (the palette needs a golden-hour check).
- **Cost:** M.
- **Perf:** 0 draws, 0 textures. `instanceColor`/scale writes once per UTC day. Snow is ~5 ALU per foliage/land fragment.
- **How:**
  1. **Phase function.** `seasonPhase(date)` in `systems/season.ts` (keep `seasonFromDate` for the label) returns continuous values from UTC day-of-year:
     - `blossom`: bell centred DOY 95, ±9 days.
     - `flush`: DOY 100–135, pale shinryoku on maples.
     - Per-instance maple `turnDay = 298 + stableUnit(id) × 28`. Colour ramps over 10 days green → amber → persimmon; fall runs `turnDay + 14…26`, pad scale → 0, branches remain.
     - `snow`: in DOY 350–59, a week is a snow week if `stableUnit("snow." + isoWeek) < 0.2`. Snow lies 2–4 days, easing over the first wall-clock hour and melting across day 3.
  2. **Palette without vermillion.** Derive the three autumn tones and add them to the colour checker's derived table:
     - `momiji_amber = timber_warm lerp roof_thatch 0.45`
     - `momiji_persimmon = roof_cote_clay lerp timber_mid 0.35`
     - `momiji_deep = roof_cote_clay lerp stone_dark 0.35`

     All have OKLCH C < 0.14, below vermillion's 0.177. Remove every `vermillion` reference from flora (`garden-flora.ts:70-71`, `garden-island.ts:1387`).
  3. **Snow.** Shared `patchGardenSnow(material)` on flora, rim land and stones: `mix(albedo, foam_white × 0.93, smoothstep(0.55, 0.9, worldNormal.y) × uSnow × coverNoise)`. Only top faces whiten, so pads keep their dark bellies.
  4. **Evergreens.** Delete the winter desaturation of pine/karikomi (`garden-island.ts:1388-1390`, `:1040-1043`).
- **Displaces:** the four-state switch, vermillion crowns and the always-on spring drift (see garden-7). Displacement rule: a turning maple is a colour change, not an addition.
- **Truth & a11y:**
  - Seasons are decorative. The caption can carry "late autumn · maples turning" from `GARDEN_SEASON_LABEL` for text parity (Chrome lane).
  - This makes the one data channel in the garden legible: pines = 30-day PSI record, and nothing else touches them.
  - Reduced motion shows the same static per-day state. No animation is involved; changes happen at day boundaries while the tab is hidden or at load.
- **Risks:**
  - Snow must not counterfeit the time of day or the market. It is purely calendar-derived, and the Sky lane should decide whether snow weeks also cool the fog.
  - Season tests pin four states (`garden-rim-mesh.test.ts:553-557`). Replace them with phase behaviour tests: a maple at `turnDay + 20` has pad scale < 1; no flora colour equals vermillion hue within ΔE 10.
- **Acceptance:** real GPU captures with a `?season=`/date override seam (needed; today the season only follows the wall clock) at DOY 95, 200, 310, 330 and a snow day. Maples differ from one another in the 310 frame, and pines are identical across all five.

### garden-4 The far-west ridge becomes the grove
- **Picture:** The hill left of the tower stops being a black lava lump with a toy shelf. It becomes a deep, massed pine grove: overlapping dark crowns stepping up the slope, a few pale rock strata showing through, and the ridge line broken by three or four windswept pines against the haze. It is the value plan's "grove, 27", a dark quiet counterweight to the lit tower, and it recedes blue into the air.
- **Why:**
  - Spell-breaker 5 (slope-to-rock rule, `garden-rim-mesh.ts:355`, on the 8–18 u ridge at `:337-344`).
  - Spell-breaker 6: stride-uniform selection (`:705-708`).
  - Only the far-pair ridge and the island reach the rest frame at all. Planting spent on the south and east ring is spent where the camera never looks.
- **Impact:** stunning 4, relaxing 4, poetic 3. **Confidence:** M.
- **Cost:** M.
- **Perf:** +1 draw (ridge canopy blanket), ≈ +8k tris, 0 textures.
- **How:**
  1. **Ridge colour.** In `rimColor`, on far-pair tiles with height > 4, replace `slope > 0.6 → EXPOSED_ROCK` with `FOREST_FLOOR = PINE_NEEDLE × 0.62 lerp stone_dark 0.25`. Keep rock only where the existing `outcrop` term (`:303-306`) > 0.7, which gives horizontal strata.
  2. **Canopy blanket.** Reuse `createGardenCanopyImpostors` (`garden-canopy-impostors.ts:64-91`), today far-only, as a permanent ridge layer: ~40 flattened domes, `#183f2c` → derived `PINE_NEEDLE × 0.5`, radius 3–5 u, jittered in height. Give it the garden-2 underside gradient via vertex colour.
  3. **Grove selection.** Replace the stride pick with low-frequency noise: keep where `fbm(x × 0.07, y × 0.07) > 0.52`, capped to odd clump sizes (3/5/7). Move ~50 of the 120 ring pines onto the two ridges at scale 1.6–2.6.
  4. **Crest filter.** Strip bamboo, karikomi and momiji from tiles with rim height > 3 (`plantingTiles` filter, `:725`).
- **Displaces:** the black rock hill face, the crest toys, and ~50 evenly spaced south/east ring pines. Those are invisible at rest; whole-map gains grove clumps instead of fence posts.
- **Truth & a11y:** decorative (`visual-cue-registry.ts:8`). Static.
- **Risks:** the Sky lane's haze must carry the ridge's recession; a black grove without aerial perspective is a hole. Station envelopes on the far arc stay level (`:335`).
- **Acceptance:**
  - `noon.png` region 150–420 × 400–580 reads as one dark mass in a 16 px blur, luma ≈ 27 noon / 20 dusk.
  - Whole-map nearest-neighbour spacing of rim pines has a coefficient of variation ≥ 0.6.

### garden-5 Set stones and one raked court: ishi with intent, gravel that echoes the sea
- **Picture:** The island's triads become real set stones: broad-based, a third buried, flat or tilted tops, faint horizontal bedding, moss on the upper faces, a dark wet line at the foot. Between the pines and the pond lies a small court of pale gravel raked in rings around one triad, flowing into straight lines. At golden hour the rake ridges catch the low light as fine gold lines, and you notice they repeat the ripple rings the islets make in the sea.
- **Why:**
  - Spell-breaker 8.
  - The bible asks for a "dry-stone garden" (`VISUAL_INVARIANTS.md:15-16`), but the island terrace in `crop-island-morning.png` is a blank grey slab.
  - The islets already emit karesansui ripple rings in water (`garden-islets.ts:43-45`). The rhyme is sitting unused.
- **Impact:** poetic 4, stunning 3, relaxing 4. **Confidence:** M.
- **Cost:** M.
- **Perf:** 0 draws, +4k tris, 0 textures, gravel shader ~10 ALU on the court's pixels only.
- **How:**
  1. **Stone generator.** `createSetStoneGeometry(seed, form)`, where form is one of the Sakuteiki five: tall vertical, low vertical, flat, reclining, arching.
     - Start from `BoxGeometry(1, 1, 1, 3, 3, 3)`, spherify 40%, displace 0.1.
     - Plane-cut the top at 6–14° tilt.
     - Bedding: radial ±0.03 on a quantized y.
     - Vertex colour: normal.y > 0.55 gets moss (MOSS × 0.8, noise coverage 60%); sides stone_mid → stone_pale; base 0.4× wet.
     - Seat 35% below ground.
  2. **Users.** Island `GARDEN_ISLAND_STONE_GROUPINGS` (`garden-island.ts:953-984`), islet crag/reef (`garden-islets.ts:152-179`), and rim `createStones` (`garden-rim-mesh.ts:778-863`, material → `vertexColors`).
  3. **Waterline stones.** Regroup rim coast stones from a dotted line into triads at 3/5 counts.
  4. **Crane islet.** Hulls must not moor within ~4 u of it (fleet lane; `crop-noon-crane.png`).
  5. **Court.** A `patchGardenRakedGravel` fragment on the island court surface (precinct owner). World xz gives `d = min distance to triad centres`; rings at 0.32 u spacing for 6 rings, then lines parallel to the terrace edge. Value ±5%, normal tilt ±0.22 along ∇d, colour `stone_pale` lerp `fog_day` 0.55.
- **Displaces:** egg stones, dodecahedron chips and the blank terrace slab.
- **Truth & a11y:** decorative. Static, so reduced motion is identical.
- **Risks:** stone tests index children and counts (`garden-islets.test.ts:25-31`). The court overlaps the island/precinct owner; coordinate with the Pharos and Harbour lanes. Rake lines at ~18 px/u rest density are 5–6 px apart; below that they alias, so fade the ring amplitude with a `fwidth(d)` check.
- **Acceptance:** real GPU island crop at `#t=8.5` and `#t=17.6`. Stones read as set (flat tops, burial); rake rings are visible at golden and invisible-to-calm at noon; no shimmer in a 9-frame motion sheet.

### garden-6 Moss, not khaki: a living land surface
- **Picture:** The rim stops being a khaki causeway. It becomes moss in two greens: yellow-green where the sun sits, cool blue-green in the lee. It has soft hummocks, sand only in the coves, and pale gravel only at station forecourts. At whole-map the ring reads as a garden shore rather than a tile edge.
- **Why:**
  - `engawa-morning.png` shows a flat olive-khaki strip, 8–10 tiles wide, with a tan band and water on both sides.
  - `rimColor` blends `EARTH` (stone_pale + thatch) into `MOSS` with `GARDEN_RIM_MOSS_BLEND_MAX = 0.62` (`garden-rim-mesh.ts:87-90`, `114`, `358-363`), which averages to mud.
  - The macro variation is a single sine (`:362-364`).
- **Impact:** stunning 3, relaxing 3. **Confidence:** M.
- **Cost:** S–M.
- **Perf:** 0 draws, 0 textures, ~8 ALU per land fragment.
- **How:**
  1. **Moss colour.** Raise moss blend to 0.85 inland. Retune `MOSS` toward sugi-goke: `aurora_green` lerp `stone_mid` 0.18, lerp `PINE_NEEDLE` 0.2.
  2. **Macro-variation patch** on `garden-rim-land`, in the style of `patchGardenFloraNight`: two-octave hashed value noise on world xz (no texture) drives hue sun/shade ±, luma ±7% and hummock normal tilt ±0.15.
  3. **Sand.** Only for `coastFormAt === "beach"`.
- **Displaces:** the khaki average and the sine patching.
- **Truth & a11y:** decorative. Static.
- **Risks:** the fleet reads against this value plane at whole-map (prior lane idea 7). Check the harbour-lane flag and roof work lands on it.
- **Acceptance:** `wholemap-noon` and `engawa-morning` recaptures show two moss greens and no khaki band.

### garden-7 One tree lets go: a rare leaf/petal fall
- **Picture:** Twenty minutes of stillness. Then a gust you can also see in the sails reaches the island maple, and a dozen rust leaves come loose. They flutter down in slow spirals for six or seven seconds, settle on the water at the island's foot, and drift with the current for a minute before fading. In April the same thing happens with cherry petals from the lee tree. It happens once, and then the garden is quiet again.
- **Why:**
  - The bible: "let an arrival… or a heron become an event, then leave the garden quiet" (`VISUAL_INVARIANTS.md:62-68`).
  - Today, spring runs a constant 48-petal drift off-frame (`garden-seasonal-dressing.ts:42-101`) and other seasons have nothing.
- **Impact:** poetic 5, relaxing 4. **Confidence:** M.
- **Cost:** S–M.
- **Perf:** 0 draws when idle (`visible = false`), +1 transparent draw for ≤ 90 s per event; 12–20 instances; shader-driven fall (Headroom: shader motion ≈ free, per-object JS is not).
- **How:**
  1. **Mesh.** Generalize `garden-spring-water-petals` into `garden-seasonal-drift`, created in every season.
  2. **Trigger.** `requestGardenBeat` (garden-director) at most once per 20–40 min, and only when `weather.wind.gust > 0.6`, so the event has a visible cause.
  3. **Source.** The in-frame island maple (autumn, DOY in the turn window) or the lee cherry (blossom > 0.5).
  4. **Motion.** A vertex shader drives each leaf from a per-instance seed and the beat start time: helical flutter (period 1.2–1.8 s, radius 0.15 u) + wind advection, a 5–8 s fall to `GARDEN_WATER_Y + 0.065`, then 60–90 s surface drift and fade.
  5. **Colour** from the garden-3 derived tones.
- **Displaces:** the always-on spring petal drift.
- **Truth & a11y:** decorative. Reduced motion: no fall. A fixed 5–7 leaves rest on the water beneath the source tree for the weeks the season allows, in one deterministic pose.
- **Risks:** the transparent layer shares N8AO's blind spot; keep leaves on or near the water and small. Director slot contention with Life lane beats.
- **Acceptance:** a real-GPU motion sheet (`#t=15`, 12×700 ms) forced through the director seam shows one release and landing. A 30-minute log shows ≤ 2 events.

### garden-8 O-karikomi and one bamboo grove
- **Picture:** The lime gumdrops around the pond become low, clipped, overlapping mounds of dark boxwood green. They flow like a slow wave along the path and down the terrace step, the Daichi-ji gesture in miniature. Bamboo leaves the ridge and the ring and gathers into one tall, fine grove behind a single station, the only vertical texture in the garden.
- **Why:**
  - Spell-breaker 9.
  - 35 bamboo clumps of seven 0.055 u culms in leaf green (`garden-flora.ts:107-113`) read as green chopsticks scattered on a jungle crest (`crop-1440-lefthill.png` 390–520 × 40–150).
- **Impact:** stunning 3, relaxing 3. **Confidence:** H.
- **Cost:** S.
- **Perf:** 0 draws, ~−2k tris (fewer bamboo).
- **How:**
  1. **Karikomi geometry.** Three-lobe merged half-icospheres, height/width 0.5, flattened top at 0.85 of the height (clipped), colour `aurora_green` lerp `timber_dark` 0.45, with the garden-2 underside gradient. Place lobes as chains of 3–7 overlapping along the path curve (`garden-island.ts:992-1082`) instead of alternating beads.
  2. **Bamboo.** Count 35 → 6 in one clump group at one station's back slope. Culms `timber_warm` lerp `aurora_green` 0.5 (bamboo culms are olive-gold, not leaf-green). Crown mass as one feathery lobe per clump.
- **Displaces:** gumdrops, bead rows and 29 bamboo clumps.
- **Truth & a11y:** decorative. Static.
- **Risks:** `garden-rim-mesh.test.ts:70` pins bamboo = 35 (delete that pin); karikomi cap pins (`KARIKOMI_DOME_CAP`).
- **Acceptance:** island crop at `#t=8.5`: no spheres; a continuous low green wave; bamboo appears once, not on the ridge.

## Subtractions
- **Bamboo:** 35 → 6 clumps, off the ridge and ring (garden-8).
- **Momiji on the ridge crest:** delete. Halve rim momiji 40 → ~16, grouped in 3s near water where the reflection doubles them.
- **Always-on spring petal drift:** delete. It is off-frame and contradicts "long rests" (garden-7 replaces it).
- **Winter greying of evergreens:** delete (`garden-island.ts:1388-1390`, `:1040-1043`).
- **Vermillion in flora:** delete (`garden-flora.ts:70-71`, `garden-island.ts:1387`).
- **Engawa tōrō's always-lit gold fire box:** dark by day.
- **The 90 flat moss/gravel ground-decal quads** (`garden-rim-mesh.ts:586-597`): superseded by the garden-6 shader; delete.
- **The waterfall:** keep it where it is. It only serves the "Garden Shore" postcard (`garden-attract.ts:27`). Do not promote it into the rest frame; the rest frame's motion budget is spent.
- **Open-water reeds** (`noon.png` 255–485 × 740–850): root on a bar or delete at rest.

## Reversals
1. **W1.9 "foreground repoussoir" as implemented** (`garden-rim-mesh.ts:912-986`; plan `01-implementation-plan.md:135`).
   - **Evidence:** projections put it at (−1691, 1627); `noon.png` has no bough.
   - **Argument:** a world anchor derived as "8 forward, 12 left" of an eye is geometry that cannot enter a 32° frustum. It must be solved from screen targets per viewport and rigged against breathing (garden-1).
   - **Risk:** fleet corner clearance.
2. **`createFloraPadGeometry` "tapered cone keeps negative space"** (`garden-flora.ts:61-64`, from W3.8).
   - **Evidence:** island crop parasols; palm read in three frames.
   - **Argument:** the cone is upside down; niwaki clouds are flat below.
   - **Risk:** tri and census re-pins.
3. **T2.2d "autumn momiji = vermillion"** (`garden-flora.ts:71`, `garden-rim-mesh.ts:1108-1111`).
   - **Evidence:** `palette.ts:31-32` reserves vermillion.
   - **Argument:** the anchor rule outranks a seasonal accent; derived rust tones say autumn better.
   - **Risk:** a less "loud" autumn, which is the point.
4. **Four-state meteorological season** (`season.ts`), with W4.17 microseasons left as Ext.
   - **Argument:** the garden's calendar is its most poetic free channel, and it only works continuously and per tree. It also untangles the calendar from the 30-day PSI record now carried by the pines.
   - **Risk:** test churn; needs a date-override seam for evidence.
5. **Slope → exposed rock everywhere** (`garden-rim-mesh.ts:355`), which W1.8's 8–18 u ridge turned into a whole-hill rule.
   - **Evidence:** `crop-1440-lefthill.png`.
   - **Argument:** keep the hills, clothe them.

## Cross-lane dependencies
- **LaneCamera:** garden-1 depends on the rest pose (`camera.ts:52-221`) and breathing (`use-world-render-loop.ts:778-784`). If rest changes, the solver re-solves, but the corner rect must join the camera's safe-rectangle contract.
- **LaneFleetMotion / LaneFleetCraft:** keep hulls out of the projected lower-left corner rect at rest, and out of ~4 u around the crane islet (the heron perch).
- **LaneLight:** foliage rim transmission at golden (garden-2); night vegetation to value ≤ 5 (`night.png` still shows green niwaki around the tower base); an optional near-field softening of the threshold limb.
- **LaneSky:** aerial perspective on the clothed ridge (garden-4); whether snow weeks (garden-3) cool the fog.
- **LaneLife / LaneAmbientJourney:** director-slot sharing for the leaf-fall beat (garden-7) and the heron relocation (garden-1).
- **LanePharos / LaneHarbour:** the raked court and stone triads sit in the island precinct (garden-5). The niwaki generator (garden-2) should be the single tree vocabulary for island, rim, islets and stations. The harbour lane flagged the tropical rim "palms" too.
- **LaneWater:** reeds rooted on bars; leaves and petals drifting on the surface; the ripple-ring and rake rhyme.
- **LaneDataPoetry:** the rule "evergreens = 30-day PSI record, deciduous = calendar" (garden-3) makes the existing garden-record channel legible. Their idea set should not also tint pines.
- **LaneChrome:** season phrase in the caption for text parity.
- **LaneHeadroom:**
  - Net budget for this lane is about +3 draws (rim-pine variant, ridge canopy, transient drift) and ≈ +45k tris. Karikomi and bamboo cuts return ~2k, which leaves ≈ 425k tris against the 500k ceiling.
  - Zero new textures: everything is procedural or vertex colour.
