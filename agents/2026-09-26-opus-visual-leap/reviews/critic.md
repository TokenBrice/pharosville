# Ruthless defect hunt — critic

## Verdict
The picture is no longer a diagram; since v0.17 it is a real perspective harbour, and its spell is broken less by missing features than by roughly fifteen cheap, fixable lies. By day the far half of the frame turns into a white wall. The noon right-middle ninth measures L\* 91 against the bible's 42 (`noon.png`). The calm inner water is a flat painted plate. Brand-neon flags as big as halls shout from the rim. Reeds, ice-floe "shoals" and obelisk piles float in open sea. The far fleet turns into tan planks. At night a world-fixed moon band lies across the water at L\* 30, brighter than the tower it should serve (L\* 17, `night.png`). Geese read as a blue feather stuck to the statue (`morning.png`). Fine detail crawls: nearest-sampled gravel, screen-door sails, 1 px wake whiskers. The leap is subtraction and correction before addition. Three small bundles (night, water, dye) remove most of the ugliness in about three days and free about 84 draws.

## What I looked at
- **Baseline frames, all 15**, cropped at 2–3× nearest-neighbour (scratch crops in `outputs/opus-review/critic/crops/`). I measured the value plan as the median CIE L\* per frame ninth: `noon`, `golden`, `night`. I scanned sky rows for luminance steps: `wholemap-*`, `noon`, `golden`, `blue`.
- **Captures (4 runs):**
  - `outputs/opus-review/critic/noon-shimmer.png` + `-frames/`: 6 frames at 500 ms, clip 540,480,1060,420, tier `full`. I diffed frames 01 and 02.
  - `outputs/opus-review/critic/island-close.png`: `#t=12.25&cam=0,0,2.2`, tier `full`. Offsets are iso screen pixels, so this clamps to the map's north corner and exposes the plate edge.
  - `outputs/opus-review/critic/night-motion.png` + `-frames/`: `#t=22`, 6 frames at 900 ms, clip 0,150,1600,700. Captured twice and both runs reported tier `interaction`, so I used it only for which things move and which stay static, never for look.
- **Code read:**
  - water and region fields: `garden-water.ts` (region boundary 1091–1124, mirror/reflect 708–713 and 962–980, hero reflection 1150–1161, moon road 1171–1200, beam pool 1270–1312); `garden-sea-regions.ts:265-344`; `garden-sea-edge-sites.ts:79,132-180`; `garden-sea-edges.ts:64-81,268-305`
  - sky: `garden-sky.ts:74-103,130-141,337-352,631-635,694-698`; `garden-sky-billboards.ts:57-123,257-270`
  - lighthouse and island: `garden-lighthouse.ts:400-434,785-806,930-1096`; `garden-island.ts:87-129,570,1689`
  - fleet and ships: `garden-ships.ts:648-651,1973-2035,2838-2861`; `garden-fleet-batch.ts:225-265,291-292,770-778,994-1016,1191-1234,1385-1459`
  - flags and harbour: `garden-chain-flag.ts:190-207`; `dock-layout.ts:234-263`
  - day cycle: `garden-day-cycle.ts:370-379,451`
  - DOM: `harbor-label-chips.tsx:40-88`; `garden-arrival-beats.ts:9-12,128-136`
- **Other sources:**
  - three read-only scout sweeps (`LaneCritic.DefectSourcesA/B/C`). B's full payload is at `agent://LaneCritic.DefectSourcesB`.
  - peer reports cross-checked: `water.md` (moon road, plate seam) and `camera.md` (tilt-shift on selection)
  - LaneHeadroom's draw census: 84 of 279 draws are `ship-wake-detail` GL_LINES
  - `decision-ledger.md`
  - `01-implementation-plan.md` §6–7

**Value plan, measured.** Each cell is median L\*, with the bible target in brackets.

| frame | top L/C/R | middle L/C/R | bottom L/C/R |
| --- | --- | --- | --- |
| noon | 76(60) 74(72) 76(68) | **63(27) 70(45) 91(42)** | 28(15) 25(38) 27(23) |
| golden | 64(35) 64(52) 65(43) | **48(20) 55(32) 73(26)** | 20(10) 19(25) 20(15) |
| night | 2(9) 2(14) 2(11) | 3(5) 4(12) 3(8) | 3(3) 3(7) 4(4) |

The middle band, where the fleet and inlet live, is 20–50 L\* too light by day. The night sky is about 7 L\* too black to hold the tower silhouette.

## Spell-breakers (defects)

Ranked by damage to calm and beauty. Coordinates are 1600×1000 source pixels.

1. **A white wall where the harbour should recede.** In `noon.png` (x 880–1600, y 440–560) and `golden.png` (same region), the fleet beyond the island dissolves into ghost-grey cards against a flat cream-white band. The right-middle ninth measures L\* 91 at noon, the lightest cell in the frame, lighter than the sky above it. The fog starts at the island: `fog.near = (islandDistance + FOG_ISLAND_MARGIN 12)` (`garden-sky.ts:98`), and `fog.far = farEdge × 1.35` (`:103`). It is stacked with height fog and day mist, as the prior `sky-seam-defects.md` Defect C describes. The bible wants aerial perspective, not a curtain. Recession becomes erasure, and the eye has nowhere to rest because nothing has depth.
   - **Fix:** raise `fog.near` to about `islandDistance + 70`, which keeps the whole mid-fleet unfogged. Lower the day fog colour's luminance 15–20 % and shift it toward sky-horizon blue. Cap noon height-fog density on sea-level materials. Target right-middle L\* ≤ 55.
   - **Cost:** M (sky/light lanes own it; see critic-4).
2. **Calm water is a painted plate by day, and a world-fixed moon band glows across it at night.**
   - **What it looks like by day.** In `noon.png` (x 0–560, y 560–860), the Calm body is a flat opaque teal with no glints. It meets the rippled blue with a soft diagonal edge, which the Morse dashes of defect 9 mark.
   - **What it looks like by night.** In `night.png` and `deep-night.png` (x 100–600, y 740–800 and x 1100–1568, y 640–700), a pale grey-white band lies across the water at median L\* 30. That is brighter than the floodlit tower (L\* 17) and second only to the lantern (L\* 83). The band is identical at 22:00 and 02:30 and stays static across all 6 frames of `critic/night-motion.png`, so it is not the beam.
   - **Why the day plate.** Calm is tint 0.62, depth lift 1.22, normalDetail 0.05, crossedNormal 0.01 (`garden-sea-regions.ts:279-285`). `mirrorZone` (`garden-water.ts:711-713`) zeroes crest foam (`:1025`) and sun glitter (`:1243`). The result is a mirror with nothing to mirror: a uniform flat dye. LaneWater independently traces the same plate (water.md #4: flattened normals `:762`, probe roughness 0.21).
   - **Why the night band.** It is the moon road (`garden-water.ts:1171-1184`): a Gaussian stripe 6 u wide, anchored on the **island centre** along `uMoonDir` (`roadAlong`, `roadAcross`) and reaching ±26–140 u on **both** sides (`abs(roadAlong)`, `:1178`). It is fixed in the world and ignores the view direction, so it lies through the island as a searchlight smear. The moon it claims to reflect is never on screen (LaneWater #3). It breaks the bible's one hard night rule: nothing competes with the tower.
   - **Fix.**
     - **Day:** give Calm a real image to hold (LaneWater water-3) and keep 35 % of the glitter inside `mirrorZone` instead of zero. Drop Calm `depth` 1.22 → 0.95.
     - **Night:** delete the world-fixed band (`:1177-1184`) and keep only the view-dependent moon glitter (`:1186-1199`), un-gated from `moonBand`, so a moon road appears only where the specular geometry puts it.
   - **Cost:** S.
3. **Crypto-brand flags at architectural scale.** In `noon.png`, the Ethereum flag (x 95–185, y 290–360) is twice the width of the pagoda roof beneath it. In `selected-ship.png`, the TON flag (x 1195–1300, y 400–480) and the Polygon flag (x 600–700, y 365–430) are larger than the halls. In `wholemap-*`, the Tron flag (x 1185–1215, y 380–395) is the reddest object on the plate.
   - **Source.** The raw brand hex values are `#627eea`, `#0098ea`, `#8247e5` and `#ff060a` (`garden-chain-flag.ts:190-202`). The cloth scale is ×4.2 (`HARBOR_FLAG_SCALE_MULTIPLIER`, `dock-layout.ts:234`, applied at `:243-263`), giving about 8 × 5.4 u of cloth. The Tron red out-chromas `vermillion`, violating the anchor rule, and the set is exactly the "crypto-dashboard neon" anti-reference. This is the loudest thing in every day frame.
   - **Fix:** see critic-3.
   - **Cost:** S.
4. **Shore geography stranded in open water.**
   - **Reeds.** In `noon.png` (x 250–490, y 740–855), three yellow-green reed clumps stand in deep water with no bank, each about as tall as the nearby boats. They are the Calm reed banks, authored "target: open" in open water at tiles (75, 97–107) (`garden-sea-edge-sites.ts:136-138`) and scaled ×1.5 (`:79`).
   - **Ice floes.** At x 1320–1600, y 815–840, three pale low-poly slabs read as ice floes or styrofoam. They are the Warning shoal bars (`:153-155`), painted `foam_white`→`sun_day_warm` (`garden-sea-edges.ts:69-72`) and flat-shaded.
   - **Obelisks.** At x 1430–1470, y 540–590, dark obelisks stand among the far fleet. They are the Ledger timber piles, 2.7 × 1.5 ≈ 4 u tall (`:169-172`).
   - **Why it breaks the calm.** Garden scenery with no ground reads as debug placement, and the reeds' scale contradicts the boats.
   - **Fix.** Delete all seven reed-lily sites from open water, or re-seat them within 1 tile of a real shoreline. Darken the shoal bars to wet stone (`stone_mid` lerped 40 % toward `deep_sea_1`) and sink them to 0.15 above water, so they read as awash rocks. Halve the pile height.
   - **Cost:** S.
5. **Far fleet as tan planks.** In `noon.png` (x 1290–1520, y 580–612, and x 1050–1250, y 570–600), ships beyond 150 u become flat tan extruded slabs with one faint quad. They read as rafts or dock timbers (`wholemap-*` same). Past the LOD distance (`FLEET_HULL_LOD_DISTANCE 150`, `garden-fleet-batch.ts:291`), `createFarFleetGeometry` extrudes a 0.72-deep hull and one sail plane (`garden-ships.ts:1973-2035`). The far material dyes the whole slab `hullColor` (`garden-fleet-batch.ts:1191-1234`), and the sail mark fades to 45 % (`:283`). The bible's "the many beyond recede into silhouette" becomes "the many beyond become lumber".
   - **Fix:** see critic-5.
   - **Cost:** M.
6. **Geese stuck to the statue like a blue feather.** In `morning.png` (x 795–835, y 100–140), `sea-sign-hover.png`, `noon-1440p.png` (x 1290–1340, y 220–260 source) and `compact` (x 605–625, y 55–70), 3–4 blurred blue-grey strokes sit against the statue's head. In `reduced-noon.png` (x 820–880, y 75–125) they are frozen as a smudge. In `noon.png` they hover at x 840–890, y 55–105.
   - **Source.** These are the autumn geese billboards (`garden-sky-billboards.ts:115-123`, opacity 0.42, colour fog × 0.52 per `garden-sky.ts:562,694-698`). Their anchors were authored with orthographic iso math, per the comment at `garden-sky-billboards.ts:57-90` ("a point's frame-top coordinate is −0.3536(x+z)+0.866y"). Under the perspective camera the line lands on the tower crown. The soft-stroke V shader (`:257-270`, smoothstep 0.07–0.16 stroke) at a few pixels wide renders each goose as a blurred blob.
   - **Fix.** Re-anchor for perspective so the flock sits in open sky 15–25° left of the tower, or drop the 7 geese to 3 with crisp strokes. In reduced motion, hide them rather than freezing them against the crown.
   - **Cost:** S.
7. **The night lighthouse is floodlit, self-lit and smudged.**
   - **Tower and statue.** In `night.png` and `deep-night.png`, the whole tower is a warm orange-brown wall (L\* 17) and the statue is L\* 54. A `PointLight` of intensity 9.15 at night (0.95 + 8.2·night, `garden-day-cycle.ts:372`; `garden-lighthouse.ts:799-806`) floodlights 46 u of masonry. The statue has `statueGleam` 0.34 at night and 1.16 at dusk (`garden-day-cycle.ts:373-379`), emissive `lantern_glow` 0.08 and metalness 0.85 (`garden-lighthouse.ts:426-434`).
   - **Beam.** Pointed near the view axis, the beam is a short grey-brown wedge ending in a round soft disk (`night.png` x 690–760, y 215–295; `deep-night.png` x 820–900, y 205–295). The cone's outer 38 % is faded (`garden-lighthouse.ts:1037-1038`), and the halo sphere is scaled ×1.8 at opacity 0.46 (`garden-day-cycle.ts:370-371`). The code comment at `garden-lighthouse.ts:1044-1047` already names the "brown smudge", and it survives. Apart from the beam bearing, `deep-night.png` is visually identical to `night.png` 4.5 h later: the moon band is world-fixed, and nothing else in the night changes.
   - **Fix:** see critic-1.
   - **Cost:** S.
8. **The hero reflection is louder than the object.**
   - **Day.** In `noon.png` (x 560–760, y 790–930), the pines' reflection is a string of saturated green discs, more chromatic than the dark pines themselves, and reads as floating lily pads.
   - **Night.** In `night.png` (x 700–870, y 850–970), every lit window reflects as an identical S-shaped worm.
   - **Source.** The mix reaches 0.85 opacity (`garden-water.ts:1161`) because `heroMask` multiplies Calm's reflectivity of 1.62 (`:1150-1153`). The distortion is isotropic: `heroUv += surfaceNormal.xy × 0.008` (`:1157`).
   - **Fix:** see critic-7.
   - **Cost:** S.
9. **Aliasing and diagram marks that crawl.**
   - **Gravel moiré.** The island terraces show horizontal moiré that changes between frames 01 and 02 of `critic/noon-shimmer` (`noon.png` x 560–1120, y 680–780). The raked-gravel normal map is a 64² `DataTexture` with three's defaults, **Nearest/no mipmaps**, repeated 4× with 8 ridges per tile (`garden-island.ts:87-107,120-129`, used `:1689`). The moss roughness map is the same (`:109-118,570`).
   - **Sail screen-door.** Near sails show a crosshatch screen-door (`noon.png` x 1070–1130, y 790–850; `golden.png` label area). The weave gate `1 − smoothstep(0.02, 0.085, threadPitch)` still admits threads near 12 px pitch at rest (`garden-fleet-batch.ts:1006-1011`).
   - **Wake whiskers.** White hairline whiskers trail every stern (`noon.png` x 960–1010, y 785–800 and x 1185–1215, y 768–776; `night.png` x 940–980, y 790–800). These are 1 px `Line`s, two per ship (`garden-ships.ts:2847-2858`), costing **84 draws**.
   - **Morse boundary.** The Warning boundary cadence uses `floor(bodyAlong × 0.11)` (`garden-water.ts:1105-1107`), which quantises foam into dashes. In `noon.png` (x 150–460, y 770–825) they read as a dotted diagram line across the water.
   - **Fix:** see critic-6 (gravel and weave) and critic-2 (whiskers and Morse).
   - **Cost:** S.
10. **Violet neon gunwales.** In `noon.png` (x 1030–1080, y 785–800 and x 1150–1180, y 765–775) and `golden.png`, violet-branded hulls wear a glowing purple ring. `batchedTrimColor` paints `livery.primary` verbatim (`garden-ships.ts:648-651`) onto the whole gunwale ring, which stays the brightest band on the hull (`garden-fleet-batch.ts:770-778`). It blooms at dusk.
    - **Fix:** clamp strake chroma (critic-3).
    - **Cost:** S.
11. **The world is a slab.**
    - **Whole map.** In `wholemap-noon.png` and `wholemap-dusk.png`, the map is a raised square plate with a dark block-dashed coping and a vertical skirt standing in an infinite ocean, ringed by a pale halo. The rear map edge is a straight diagonal where periwinkle map water meets the darker ocean (x 700–1350, y 380–480).
    - **Close-up.** `critic/island-close.png` shows the same edge at zoom 2.2. The map-plate water is flat, unrippled periwinkle blue (x 0–820, y 780–980), cut by a ruler-straight diagonal against the rippled outer ocean, with ships sitting on the flat part.
    - **Why it matters.** The "infinite sea" exists but the map water does not continue into it: different colour, different normals, hard edge.
    - **Source (LaneWater, water.md #7).** The annulus forces `shoreField = 1.0` (`garden-water.ts:840`), so it has no coast. The in-plate/annulus seam is a normal and colour discontinuity across only an 8 u crossfade (`:1413-1417`).
    - **Fix.** Adopt LaneWater's water-6: give the annulus a shore from `gardenPlateEdgeDistance`, share the "open" shading across the seam, and widen the crossfade to 20–40 u.
    - **Cost:** M.
12. **Hard sky step on whole-map views.** In `wholemap-dusk.png` (full width, y ≈ 88–92) and `wholemap-noon.png` (y ≈ 80), there is a horizontal discontinuity. The sky ladder is normalised by `uSkyVisibleHeight = sin(FOV/2 − pitch)` (`garden-sky.ts:632`) and clamped (`:347`). At the steep whole-map pitch the whole bokashi ladder (`:130-141`) is compressed into about 90 rows, and the clamp at 1.0 cuts it.
    - **Fix.** Floor `uSkyVisibleHeight` at `sin(6°)`, and use `smoothstep`, not `clamp`, at the top.
    - **Cost:** S.
13. **Near-water seam and mottling at the compact size.** In `compact-1200x640.png` (x 850–1200, y 500–512), a ruler-straight horizontal seam separates fine ripples above from a coarse blotchy pattern with stair-stepped contour lines below. The same mottling appears in `noon.png` (x 1300–1600, y 860–1000). Source not pinned. [INFERENCE] The screen-horizontal edge plus the half-resolution stair-steps fit the tilt-shift blur (`garden-post.ts:589-638`: half-res, spread 2), which switches on whenever the framing zoom is ≥ 1.2 (`:1740-1743`). That fit is plausible if the compact rest zoom crosses 1.2, which I did not verify. Verify with a single A/B that disables only the tilt-shift at `#t=10`, 1200×640.
    - **Cost:** S–M.
14. **Selection hides the selected ship.** In `selected-ship.png`, `#sel=ship.usdc-circle` flies the camera to the south rim. The foreground is a blurred green lump-tree (x 580–760, y 450–850) and flat rim grass. The USDC hull is only a ghostly sail behind bamboo (x 760–850, y 625–670), with nothing in the world saying "this one". This is the one moment a visitor is paying full attention, and the frame is dominated by a defocused low-poly blob.
    - **Source:** selection pushes the framing zoom to ≥ 1.2, which switches the tilt-shift blur on (`DOF_POSTCARD_MIN_ZOOM = 1.2`, `garden-post.ts:638,1740-1743`). The blur's sharp band sits about 290 u away, while the ship is about 91 u away (per LaneCamera, `reviews/camera.md`). So the one object the visitor asked for is placed in the defocus field, behind rim planting.
    - **Fix:** see critic-8, and delete the tilt-shift as LaneCamera proposes (camera-2).
    - **Cost:** M.
15. **Reduced motion piles the fleet into a heap.** In `reduced-noon.png` (x 1040–1270, y 490–615), about 15 NAV ships pinned to Ledger Mooring interpenetrate: sails through sails, a Tether cargo sail through a hall. `motion.test.ts:862` pins reduced-motion NAV ships to static Ledger water, but there is no berth spacing in that static pose. This is the frame a reduced-motion user lives with.
    - **Fix.** Allocate the static Ledger idle positions through the same anchorage/berth allocator (`garden-fleet-placement.ts:423-627`) with `MIN_HULL_GAP`.
    - **Cost:** S–M.
16. **A nameplate that never leaves.** In `dawn`, `golden`, `blue`, `night`, `deep-night`, `morning`, `compact` and `sea-sign-hover`, the chip "OpenDollar USDO · Calm" floats mid-air over the left fleet (x 430–580, y 568–584). It has no leader line, and "Calm" is set in 62 % muted grey at 0.68 opacity (`pharosville.css:1391-1451`). The 10 s arrival window (`garden-arrival-beats.ts:9-12,128-136`), refreshed every second (`pharosville-world.tsx:546-556`), keeps some ship almost always inside it, so the "brief" nameplate is permanent.
    - **Fix.** Add a quiet gap of at least 90 s between nameplates, and fade the chip in and out over 400 ms.
    - **Cost:** S.
17. **Crumpled pale sheet at the island's south-east corner.** In `selected-lighthouse.png` (x 1060–1125, y 700–775) and `noon.png` (x 1065–1115, y 715–765), a folded white-grey faceted surface reads as a tarp or broken geometry on the rock. I did not pin the source; it needs one `--draw-census` pass.
    - **Cost:** S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### critic-1 ★ Night belongs to the beacon
- **Picture:** At 22:00 the tower is a dark, weathered column with warm windows like embers. The lantern is the one white-gold light, and a long, thin, soft beam crosses the sky; pointed at you, it fades instead of becoming a brown dish. The water is ink with the lantern's broken road in it. There is no grey slab, no gilded statue and no floodlit masonry. The frame finally obeys the bible.
- **Why:** In `night.png`, water L\* 30 > tower L\* 17, statue L\* 54, and the beam end-on reads as a smudge. The sources are defect 2 (water), `garden-day-cycle.ts:372-379` (floodlight and statue gleam), and `garden-lighthouse.ts:1037-1049` with `garden-day-cycle.ts:370-371` (beam and halo).
- **Impact:** 5 relaxing, 4 poetic. **Confidence:** H.
- **Cost:** S. **Perf:** 0 draws, 0 tris, 0 textures, about 0 ms.
- **How:**
  1. Water: delete the world-fixed moon band (defect 2, `garden-water.ts:1177-1184`).
  2. Tower light: `lighthouseLight.intensity = 0.95 + dusk·1.2 + night·2.4`, with the distance cut 46 → 30 so it grazes only the lantern storey. Stone emissive 0.05 → 0.015 (`garden-lighthouse.ts:400-415`).
  3. Statue: `statueGleam = 0.22·daylight + dusk·0.5`, with the night term set to 0; metalness 0.85 → 0.6.
  4. Beam: replace the `forwardCore` gain (`:1048`) with a view-axis fade, `alpha *= smoothstep(0.92, 0.6, uScatter)`, so an end-on beam dissolves into the halo. Shrink the halo night scale 1.8 → 1.25 and its opacity 0.46 → 0.3. Extend the visible length by fading `0.78 → 1.0` instead of `0.62 → 1.0`.
  5. Night sky: lift the night zenith from L\* 2 toward the bible's 9–14, so the tower silhouettes against the sky instead of against black.
- **Displaces:** the floodlight, the statue glow and the moon-band smear. Net light is removed.
- **Truth & a11y:** The lamp's PSI status modulation (`garden-lighthouse.ts:347-354`) stays on the lamp and halo. No DOM change. Reduced motion is unchanged: static beam bearing.
- **Risks:** the tower may read too dark at blue hour. Keep the dusk term at 1.2 and check `blue.png` at `#t=18.8`. `garden-day-cycle` tests pin these curves and must be re-pinned.
- **Acceptance:** `#t=22` and `#t=2.5` at 1600×1000. Lantern > everything; tower L\* ≤ 14; water band L\* ≤ 10; statue ≤ tower + 5; no beam disk in 6-frame `motion-sheet --interval 900`.

### critic-2 ★ Clean water: remove the lies on the sea
- **Picture:** The inlet reads as water, not a map. Calm is still and dark-glassed with a few sparks. The boundary between bodies is a change of texture with no dotted line. There are no whiskers at the sterns. Rocks look awash, not frozen, and reeds grow only where there is shore.
- **Why:** Defects 2, 4 and 9 (whiskers, Morse). Together these are about 60 % of the "debug diagram" feeling in `noon.png`'s lower half.
- **Impact:** 4 relaxing, 3 stunning. **Confidence:** H.
- **Cost:** S (about 1 day). **Perf:** **−84 draws** (whiskers), −1 draw if the reed instanced mesh is removed entirely, 0 textures, a small ALU saving.
- **How:**
  1. Calm by day as in defect 2: glitter kept at 35 %, depth 1.22 → 0.95. This pairs with LaneWater's water-3, which gives the mirror something to reflect.
  2. Warning cadence: replace `floor(bodyAlong*0.11)` with continuous `bodyAlong*0.11` (`garden-water.ts:1105-1107`). Lower `boundaryFoam` by 40 % for Warning and Danger (`garden-sea-regions.ts:308,316`).
  3. Delete `createWake`'s two `Line`s (`garden-ships.ts:2847-2858`). The `GardenWakeBatch` foam quads already carry the wake.
  4. Sea-edge sites as in defect 4. Drop the `GARDEN_SEA_EDGE_SCALE_FACTOR` to 1.0 for reeds and piles (`garden-sea-edge-sites.ts:79`); re-seat the reed guides onto real rim or islet shore.
- **Displaces:** 84 hairline draws, 7 reed clumps in open water, and dash marks.
- **Truth & a11y:** Region identity is still carried by texture, flow and colour, plus the DOM named-areas ledger. The reeds and shoals are decorative "edge geography", and their shed-list (`garden-sea-edge-sites.ts:106-114`) still holds. Reduced motion has no dependency.
- **Risks:**
  - `garden-sea-edge-sites.test.ts:52-73` pins the 7 reed banks and the ×1.5 scale.
  - `garden-harbor`/`world-renderer.test.ts:1091` counts wake-detail groups.
  - The draw census changes.
  - All of these re-pin to behaviour.
- **Acceptance:** `#t=12.25` rest at 1600×1000 and 1200×640. No white dashes and no whiskers at 3× crop; Calm shows glints in `critic`-style crops; the reeds sit on shore. The `--draw-census` total drops by about 84.

### critic-3 ★ Dye the brands into the palette
- **Picture:** The rim flags become cloth: sized like flags on a hall, dyed indigo-blue, dusk-violet or madder, with the chain mark still crisp in white. The rim reads as a harbour town, not a sponsor wall. Hull rails show a thin line of issuer colour instead of a neon ring. The geese become a faint, distant skein in open sky.
- **Why:** Defects 3, 6 and 10. The bible gives `vermillion` chroma primacy, and the anti-references name "neon". The flag enlargement to ×4.2 was the 2026-09-05 ledger decision, made for the orthographic whole-plate era.
- **Impact:** 4 stunning, 4 relaxing. **Confidence:** H.
- **Cost:** S. **Perf:** 0 draws, 0 tris, 0 textures.
- **How:**
  1. In `chainFlagField` (`garden-chain-flag.ts:204-207`), convert the brand hex to OKLCH. Clamp chroma to ≤ 0.09 and lightness to 0.38–0.62, then mix 20 % toward `HARBOR_PALETTE.fog_blue` so the flags sit in the atmosphere. Keep hue, so identity survives. The logo and initials ink stay full contrast.
  2. `HARBOR_FLAG_SCALE_MULTIPLIER` 4.2 → 2.4 (`dock-layout.ts:234`). At 2.4 the Ethereum flag is about 4.6 × 3.1 u, still bigger than a ship sail and smaller than the hall.
  3. `batchedTrimColor` (`garden-ships.ts:648-651`): apply the same OKLCH clamp, chroma ≤ 0.08, and multiply by 0.8 so the strake stops being the brightest band.
  4. Geese: re-anchor as in defect 6.
- **Displaces:** screen area and chroma on 11 flags; the violet ring.
- **Truth & a11y:** Flag identity stays carried by the chain logo and initials, not colour (the invariants already say colour is never the only carrier), plus the dock detail and ledger rows. No reduced-motion impact.
- **Risks:** `dock-layout.test.ts` and `harbor-label-chips.test.tsx` pin flag scale; dark brands such as Aptos `#1a1a1a` need the lightness floor. This touches the 2026-09-05 decision, so it is also listed under Reversals.
- **Acceptance:** `noon.png` and `selected-ship.png` poses. No flag exceeds its hall's roof width; the highest-chroma object on the rim is a vermillion torii or buoy; the Tron flag is no redder than the torii at 3× crop.

### critic-4 Put the horizon back: recession, not erasure
- **Picture:** Behind the tower the fleet thins into blue-grey silhouettes that stay boats. The sea runs on, visibly, to a soft horizon line with the borrowed hills standing on it. The white wall becomes air.
- **Why:** Defect 1 and the value-plan table: middle row +20–50 L\*.
- **Impact:** 5 stunning, 4 relaxing. **Confidence:** M (it interacts with the sky, light and water lanes).
- **Cost:** M. **Perf:** 0 draws; ALU unchanged.
- **How:**
  1. `fog.near = islandDistance + 70` (`garden-sky.ts:98`) and `FOG_FAR_BEYOND_EDGE` 1.35 → 1.7 (`:82`).
  2. Noon fog colour L\* about 70, hue shifted toward the sky-horizon blue, not cream.
  3. Height fog on sea-level materials × 0.5 at daylight (`garden-height-fog.ts` presets).
  4. The noon mist billboards stay only on the far shelf (`garden-sky-billboards.ts:91-104`, near shelf removed at day).
- **Displaces:** fog density and the near mist shelf.
- **Truth & a11y:** Stale-source fog banks (bounded, in their own water) must remain distinguishable. They then carry more meaning, because global haze no longer masks them. No reduced-motion impact.
- **Risks:** the slab edge (defect 11) may reappear at mid zooms; this needs critic-5-style continuity from the water lane. `garden-sky.test.ts` pins the fog floor.
- **Acceptance:** `#t=12.25` and `#t=17.6`, where the value table's middle row should be within ±12 L\* of the bible, and `wholemap-noon` with no cream band.

### critic-5 Far fleet silhouettes that are still boats
- **Picture:** Beyond 150 u you see little dark hulls, each under one or two pale sail shapes, stepping down in value with distance: a Hiroshige fleet, not a lumber yard.
- **Why:** Defect 5.
- **Impact:** 4 stunning. **Confidence:** M.
- **Cost:** M. **Perf:** +0 draws (the far batch is already one draw per silhouette), about +2–4 tris per far ship (roughly +0.6k tris total), 0 textures.
- **How:**
  1. In `createFarFleetGeometry` (`garden-ships.ts:1973-2035`), taper the hull plan 0.72 → a 0.5-deep V-section and darken its vertex colour to 0.55× `hullColor`.
  2. Add a second, family-shaped sail plane: lug or junk shapes from the near rig's outline, as 3–5-vertex polygons.
  3. In the far material, give the sail quad a floor of `max(markPresence, 0.45)` on **cloth luminance**, not just on the mark, so sails stay pale against the dark hull (`garden-fleet-batch.ts:1191-1234`).
- **Displaces:** the flat tan slab.
- **Truth & a11y:** Cloth hue still carries issuer identity; exact values stay in the DOM. No reduced-motion impact.
- **Risks:** the 16-attribute cap on the sail program (LaneHeadroom); this uses position and uv only. `garden-fleet-batch.test.ts` pins far geometry.
- **Acceptance:** `noon.png` pose, crop x 950–1560, y 490–620 at 3×. Every far ship reads as hull plus sail, and none reads as a plank.

### critic-6 Antialias the fine detail (gravel, weave, tower courses)
- **Picture:** The raked gravel reads as a still combed pattern that does not boil when the camera breathes. Sails read as cloth, not screen-door mesh.
- **Why:** Defect 9 (gravel, weave). The 01→02 diff of `critic/noon-shimmer` shows the terrace pattern changing under a 1–3 px drift.
- **Impact:** 3 relaxing. **Confidence:** H.
- **Cost:** S (half a day). **Perf:** 0 draws. The gravel and moss textures gain mipmaps (about +33 % of 16 KB, negligible). They occupy existing texture slots, so the texture count is unchanged.
- **How:**
  1. In `gardenSurfaceTexture` (`garden-island.ts:102-106`): `texture.generateMipmaps = true`, `minFilter = LinearMipmapLinearFilter`, `magFilter = LinearFilter`, `anisotropy = GARDEN_IDENTITY_ANISOTROPY`.
  2. Also fade `normalScale` by `fwidth(uv)` if moiré persists.
  3. Sail weave: tighten the gate to `1 − smoothstep(0.008, 0.03, threadPitch)` (`garden-fleet-batch.ts:1007`) so the weave appears only when a thread is at least about 30 px.
- **Displaces:** nothing.
- **Truth & a11y:** none.
- **Risks:** a softer gravel read at rest. Accept it: it is truer.
- **Acceptance:** a motion sheet at `#t=12.25`, clip 540,480,1060,420. The frame-diff heat on the terrace interior should drop to the level of the edges only.

### critic-7 Reflections that behave like water
- **Picture:** Under the Pharos a long, dark, vertically smeared reflection breaks into horizontal slices. Windows at night become short vertical gold dashes, Hiroshige's broken road, not identical worms. The pines darken into the water instead of turning into lily pads.
- **Why:** Defect 8.
- **Impact:** 4 poetic. **Confidence:** H.
- **Cost:** S. **Perf:** 0 draws; the ALU cost is a few instructions.
- **How:** in `garden-water.ts:1150-1161`:
  1. `heroMask` uses `min(seaReflectivity, 1.1)`, and the clamp drops 0.85 → 0.6.
  2. Apply `hero.rgb *= mix(vec3(0.72), uDeepColor*1.4, 0.25)` to darken and cool the reflection.
  3. Make the distortion anisotropic: `heroUv.x += n.x*0.004; heroUv.y += n.y*0.018 + (ripple crest)*0.01`.
  4. Break the reflection with `step(0.35, fract(worldZ*0.9 + n.y*2.0))` × 0.5 for horizontal gaps.
- **Displaces:** the 0.85 mirror.
- **Truth & a11y:** none. Reduced motion is static at its time-zero pose, which is fine.
- **Risks:** `garden-hero-reflection-pass.test.ts` alignment; too dark a mix loses the "reflection lies in the inlet" read. Tune on `#t=12.25` and `#t=22`.
- **Acceptance:** 3× crops of `noon.png` (x 540–900, y 760–1000) and `night.png` (x 640–900, y 820–1000). The reflection is darker than its object, with no repeated S-shape.

### critic-8 Selection that shows the ship
- **Picture:** Choosing USDC swings the camera just enough that the hull sits on the lower-third line in clear water, lit, crisp and unoccluded. The foreground stays soft but never blocks it.
- **Why:** Defect 14.
- **Impact:** 3 stunning, 4 trust. **Confidence:** M.
- **Cost:** M. **Perf:** CPU only, one occlusion ray cast at selection time (hit-test snapshot).
- **How:**
  1. In the selection framing path (`camera.ts:295-319` and the follow in `world-renderer.ts`), cast a ray from the candidate eye to the ship masthead against the hit snapshot, the rim mesh and the canopy bounds.
  2. If it is occluded, rotate the yaw in ±6° steps up to ±24°, then raise the pitch by 2° steps. Pick the first clear pose.
  3. Clamp the focus band so the selected hull is inside the DOF focus range, which is shared with the post lane.
- **Displaces:** the current "fit then accept" framing.
- **Truth & a11y:** The DOM detail panel is unchanged and focus management is untouched. In reduced motion the camera cuts to the clear pose.
- **Risks:** camera URL and moment tests, and the attract-mode interplay.
- **Acceptance:** `#t=14&sel=ship.usdc-circle` and 5 other `sel=` ids at 1600×1000 and 1200×640. The selected hull is ≥ 80 % unoccluded and inside the sharp band.

## Subtractions
- **Ship wake detail lines:** delete (`garden-ships.ts:2847-2858`). −84 draws, and the ugliest aliasing in the frame.
- **Open-water reeds:** delete (`garden-sea-edge-sites.ts:136-138,167-168,178-179`), or re-seat them on shore. Enough reeds already live at the reed-boathouse station (`garden-docks.ts:1279`).
- **Floor-quantised Warning cadence** (`garden-water.ts:1105-1107`): make it continuous.
- **Night statue gleam** (`garden-day-cycle.ts:376`): set the night term to 0.
- **Halo sphere scale-up at night** (`garden-day-cycle.ts:371`): cap at 1.25.
- **Autumn geese near the crown:** hide them at rest until re-anchored (`garden-sky.ts:694-698`).
- **Permanent arrival nameplate:** require a ≥ 90 s quiet gap (`garden-arrival-beats.ts`).
- **Cream near-shelf mist at noon** (`garden-sky-billboards.ts:93-95`): day off.

## Reversals
- **2026-09-05 "Enlarge station … flags", ledger row 22, `HARBOR_FLAG_SCALE_MULTIPLIER 4.2`.** It was made to read flags at the old orthographic whole-plate zoom. Under the 32° perspective rest, near-rim flags are now the largest chromatic surfaces in `noon.png` and `selected-ship.png`, bigger than the halls, and the Tron red outranks `vermillion`. Argument: identity survives through the logo at ×2.4, as the 2.6 u sail marks already prove, and chroma belongs to the bible's anchors. Risk: whole-map flag legibility drops, but the whole map is an inspection view with DOM search.
- **"Calm and ledger are intentional mirrors" with glitter and foam zeroed** (`garden-water.ts:710-713,1025,1243`; `garden-sea-regions.ts:276-285`, depth 1.22). The concept of "the most mirror-like water" was authored for the ortho sky band. In perspective it produces a flat dyed plate (defect 2; LaneWater #4). Argument: stillness should read as fewer, larger, slower glints on dark glass, not as a lifted dye with every spark removed. Risk: Calm loses separation from Watch; compensate with a surface-state ladder (LaneWater water-3), not with lift.
- **The world-fixed night moon road** (`garden-water.ts:1171-1184`). It was a cheap stand-in for a moon reflection under the ortho camera. In perspective it is a two-sided searchlight stripe through the island, brighter than the tower (defect 2). Delete it in favour of the view-dependent glitter that already exists below it.
- **Sea-edge geography ×1.5 enlargement** (`GARDEN_SEA_EDGE_SCALE_FACTOR = 1.5`, pinned by `garden-sea-edge-sites.test.ts:64`). It was enlarged to survive the ortho blur test; under perspective the foreground reeds are boat-sized. Revert it to 1.0.

## Cross-lane dependencies
- **Water lane:** owns defects 2, 8, 9 (Morse) and 11, and critic-2/critic-7. The following ideas are the same fixes and must have one implementation:
  - critic-2's Calm glitter pairs with water-3.
  - The moon-band deletion (critic-1) is water-4.
  - Defect 11 is water-6.
  - critic-7 overlaps water-2 (streaked reflections, and the reflection pass has shadows off per `garden-hero-reflection-pass.ts:125`).
- **Post and water lanes:** defect 13 needs the tilt-shift A/B.
- **Sky and light lanes:** critic-1 (night sky lift, light curves), critic-4 (fog) and defect 12. The fog re-key must land with the night-sky lift, or the value plan is fixed in one phase and broken in another.
- **Fleet craft lane:** critic-5 (far LOD) and the strake half of critic-3. The sail program is at the 16-attribute cap, so no new attributes.
- **Harbour lane:** flag scale and dye (critic-3), which conflicts with anyone proposing larger rim identity.
- **Camera and post lanes:** critic-8 (occlusion-aware selection framing, DOF focus band) and the geese re-anchor, which needs the rest pose.
- **Chrome and DataPoetry lanes:** the nameplate cadence (defect 16) and the reduced-motion Ledger heap (defect 15).
- **Headroom lane:** the 84-draw saving from the whisker deletion is the largest single draw win available and can fund other lanes' additions.
