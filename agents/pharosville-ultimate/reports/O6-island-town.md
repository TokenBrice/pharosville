# O6 — Island, town, the Pharos and the landscape

Lane O6 (`island-town`), Opus. Pillar focus: prettier and enchanting. Baseline v1.4.1 (`29e0b2a3`). The structured
version is `O6-island-town.json`.

**Frames.** I used the shared frames (base-*, hour-*, view-*, season-*, aspect-*) and took 12 new real-GPU captures, all
under `shots/`:

- Pharos: `O6-pharos-day` (t 10.5, pitch 16) and `O6-pharos-night`; `O6-lantern-dusk` (t 17.4, 140 m);
  `O6-pharos-visitor` (t 14.5, at the visitor's fixed 26° pitch).
- Civic quarter: `O6-civic-day` and `O6-civic-night`.
- The rest of the island: `O6-west-day` (Shipyard, Wreck Cove, terraces); `O6-burn-day` (headland, Chart Room,
  Keeper's Log, Burn); `O6-cove-day` (Arbitrum and Base coves); `O6-scale-close` (95 m, the closest zoom);
  `O6-town-night`; `O6-summer-heart` (July, default view).

Crops are `O6-crop-*`; the evidence sheet is `O6-contact.png`. The low-pitch frames show sky shards that visitors
never see, because the rig's pitch is fixed. Luminance figures are display L measured on the PNGs.

## 1. Verdict

The island already reads as a crafted Ptolemaic harbour.

- **Civic quarter.** The richest thing in the frame (`O6-civic-day`): the Ionic Customs House, the Registry, the Mint,
  polychrome friezes and velaria.
- **Town.** Lived in. It has meander bands, shutters, chimney smoke and roof-terrace laundry.
- **Night.** Warm and composed. The lamp wave, window occupancy and reflections all work (`O6-civic-night`).
- **Scale.** At the closest zoom, people, doors and stairs agree (`O6-scale-close`).
- **Prior review.** REVIEW #9 is fixed (the sanctuary sits on its knoll). REVIEW #4 is mostly fixed.

What holds it back sits mostly in my lane, and most of it is cheap to fix:

1. **The house flags are the loudest objects in the town.** Ethereum's above all.
2. **The hero is the least-crafted landmark per pixel.** It reads as an office tower at the visitor's zoom.
3. **The ground keeps a temperate calendar.** It also has a facet-normal bug that paints triangles on every slope.
4. **The skyline pines are parasols on sticks.**
5. **Cool-grey retaining walls read as concrete.**

## 2. Current state

- **Hero.** The Pharos dominates by value and silhouette at every hour, and its fire, glint and banked states are
  data-true (`lighthouse-system.ts:173-240`). The model is plain for its role: `lighthouse.glb` is 8,179 triangles,
  the Mint's budget (8,112), against 296,436 for the island.
- **Hinterland.** Wave 6 shipped: terraces, vineyard, threshing floor, sanctuary and hearths.
- **Vegetation.** The species are right and they sway (08-T3), but the pine is one squashed 20-face icosahedron on a
  3-sided pole (`nl_kit.py:964-982`), repeated about 330 times.
- **Night.** 189 layout lights: 90 lamps, 58 window lights, 28 pierheads, 9 hearths and 4 harbour lights.
- **Cost.** `island.glb` is 4.78 MB (2.63 MB gz), one draw per material. `lighthouse.glb` is 46 KB gz; the civic GLBs
  total 447 KB gz. Baked AO exists only in the island (`hb_export.py:330-396`).

## 3. Findings (ranked)

**F1 (high). The house flags out-scale the civic quarter and glow like billboards at night.**

Ethereum's flag:

- **Size.** It flies 17.6 × 11.7 m close in and 21 × 14 m at heart (fly 11 m × 1.65 × farScale 1.21; topmast 9 m ×
  1.65).
- **Height.** Its top is about 30 m above its quay. That is level with the pediments of the Customs House and Registry
  on their terraces, and far above R3's 18 m building line.
- **Placement.** It hangs across the Registry front.
- **At night.** The crest roundel measures L 0.58, 80 % of its daytime value, against 0.23 for the Pharos shaft and
  0.26 for the lit Customs facade (`O6-crop-ethflag-daynight`). In the town, only the lamps are brighter.

At overview all eight flags grow 45 % and skip the distance air, so they are the most saturated patches on the island.
The fix is O6-I1.

**F2 (medium). Slope dryness paints a triangle mosaic.** `hbGrassTerrain` derives steepness and aspect from
`cross(dFdx(W), dFdy(W))` (`materials.ts:405`). That value is constant across each terrain triangle, so neighbouring
triangles flip between straw and green: the crumpled-paper hills of `O6-crop-civic-crest-pines` and
`O6-crop-summer-east`. Fix: O6-I2.

**F3 (medium). A temperate year on an Egyptian shore.** Spring and summer push the meadow to saturated lime
(`materials.ts:496`, `509-510`). In July the largest land mass in the default view reads as an English lawn
(`O6-summer-heart`). The evergreens also sit on a ground of similar hue, which flattens the planting. Fix: O6-I3, which
needs an operator decision.

**F4 (medium). The hero and civic buildings have no baked AO.** The medium's contract is "AO baked into vertex colour"
(classical-town PLAN §2.2), but only the island export bakes it. The runtime `hbAO` samples the island's height field
only (`materials.ts:308-325`). So cornices, the lantern, the tritons and the colonnades get nothing beyond cast sun
shadow. Fix: O6-I5.

**F5 (medium). The hero reads as an office tower or grain silo.** At the visitor's pitch (`O6-pharos-visitor`):

- **Shaft.** Six full-height strips per face make five 46 m flutes (`pharos_geo.py:180-186`), over brick-scale ashlar
  and flush 0.06 m slits (`:189-208`).
- **Upper tiers.** The octagon and especially the 6.2 m drum are stubby, so the stack reads "box with a small top"
  (`:41-51`).
- **Details.** The Helios cloak quad reads as a chest shield (`:439-443`). The mirror is a 3.6 m disc in a 10.6 m
  lantern (`:522`). The 64 m pavement is empty.
- **Tritons.** They are the signature, but read as green lumps at heart.

Fix: O6-I4.

**F6 (medium). Parasol pines draw the skyline.** The crest band behind the civic quarter is a row of near-identical
thin lenses on poles, and they silhouette as tables at night (`O6-crop-civic-crest-pines`, `O6-civic-night`). Fix:
O6-I6.

**F7 (medium). Concrete walls and plastic rocks.**

- **Walls.** The terrace and civic-pad walls use `granite` #9C9C97, the retired Northern "tower stone"
  (`nl_common.py:76`). They are plain vertical beams up to about 15 m tall (`hb_land.py:1006-1077`). Behind the Mint and
  around the Burn they read as a dam or a prison yard (`O6-crop-civic-walls`).
- **Rocks.** The `rock_light` outcrops catch the sun as near-white polyhedra.

Fix: O6-I7.

**F8 (low).** Mole lamps run on a 24 m metronome, and the overview night strings pearls. Fix: O6-I8.

**F9 (low).** The terraces and vineyard read as pale planks on a lawn (the REVIEW #4 residual). Fix: O6-I9.

**F10 (low, life lane).** At close zoom, autumn leaves become orange coins across third-floor facades
(`drift.ts:77-78`: a 2.4 px minimum, falling from 7-13 m).

## 4. Ideas

### O6-I1 House flags at the town's scale, lit as cloth (S, prettier, impact 4)

- **Scale.** `FLAG_SCALE.ethereum` 1.65 → 1.2; overview growth +45 % → +25 %; topmast 9 → 6 m (Ethereum 7 m). The fly
  then tops out at about 22-24 m.
- **Night.** Glow 0.16 → 0.035, with the kit's night dimming, so the crest falls with the facades.
- **Distance.** A half-strength aerial tint at overview.
- **Test.** Pin the flag top and the night gain.

Ethereum still flies largest. The heraldry (D17) is unchanged, and no data reads `FLAG_SCALE`. Result: about −55 % flag
area at heart, and the roundel drops below the facades at night. Cost: 0 draws, about 8 ALU on a few thousand pixels.

### O6-I2 Grass that follows the land (S, prettier, impact 3)

1. **Mosaic fix.** Take the slope normal from central differences of the four ±7 m height taps the shader already
   fetches. This is free, and the facet mosaic vanishes.
2. **Turf grain.** Add one 2.5 m "tussock" 2D value-noise term at ±6 % value with a slight green-gold shift, faded by
   `hbFine` so it lives at 4-12 px at heart.

Cost: about 0.03-0.1 ms on an Apple-class iGPU, on grass only. The Low tier keeps today's path.

### O6-I3 A Mediterranean year for the ground (S, prettier, impact 4, decision)

Re-time the grass branch of `hbFoliage` to the Alexandrian year:

- **Through spring.** Green from the first rains in late October. Spring is less acid: `(1.05,1.12,0.62)` instead of
  `(1.12,1.2,0.42)`.
- **June to October.** Straw-gold, with olive kept in the hollows (`hbLush`) and gardens. Ridges dry paler through
  O6-I2.

Trees keep their current cycle and snow is unchanged; pin four calendar phases in a test. In summer the default view
becomes gold and dark green, and the trees finally separate from the ground. Cost: 0.

### O6-I4 Pharos v2: a monument, not an office tower (M, prettier, impact 5)

An Opus-authored pass on `pharos_geo.py` within today's envelope. `FIRE_Z` 88.2, the dome and the statue top stay put,
so the beam origin, `PHAROS_HEIGHT` and the node contract hold.

1. **Proportions.** Re-proportion the stack: tier 1 → 2.6-42 m, octagon about 48.5-71 m, drum 6.2 → about 9.5 m.
2. **Shaft.** Replace the inner pilasters with drafted corner quoins, two string courses and one recessed window bay per
   face. Set the windows in deep 0.4 m reveals.
3. **Cornice.** An Egyptian cavetto with dentils and a deep corona shadow.
4. **Figures.** Tritons at 2.3× with tails coiled over the lip. Helios without the chest quad, and with a larger
   radiate crown.
5. **Mirror.** R 2.5 m with a gilt rim, so the day glint carries at heart. Its timing is unchanged.
6. **Ramp and pavement.** The signature long ramp on 6-8 arches up to an entrance about 10 m high. Dress the pavement
   with oil amphorae, a woodpile, a windlass and a keepers' lodge.
7. **Value ladder.** Vertex colour runs from a warm, darker foot to a pale marble crown, plus baked AO (I5).

Cost: 8.2k → ~22k triangles, still one merged draw plus one shadow draw, fragment cost unchanged, about +65 KB gz.

### O6-I5 Bake AO into the Pharos and civic GLBs (S, prettier, impact 4)

Call the island's existing Cycles `bake_ao` from `pharos/export.py` and `civic/export.py`, then titans and wrecks.
Exclude the emissive, window, crest, cover, mirror and fire materials. Cost: 0 at runtime and about +25-50 KB gz.
Column bases, cornices, reveals and the lantern read as sculpted.

### O6-I6 Stone pines and cypresses (M, prettier, impact 4)

- **Pine.** A 5-sided trunk at 0.04·h with a 3-4 limb fork, under 4-6 overlapping pads at z-scale about 0.5 instead of
  one lens at 0.3. A domed top, a dark flat underside and sky gaps between pads; heights 7-15 m.
- **Cypress.** Stacked flame lobes.
- **Crest.** Recompose it as 3-4 groups with cypress accents, because it is the heart frame's right skyline.

Cost: +35-50k triangles, 0 draws, about +0.1-0.25 ms on an iGPU (main + shadow + predepth), +100-150 KB gz.

### O6-I7 Warm, built retaining walls and rocks (M, prettier, impact 3)

- **Stone.** Warm Alexandrian limestone ashlar (#BDAE8C, coping #D8CCB0) on a sandstone foot; warm the outcrops too.
- **Form.** A 6° batter, buttresses every ~7 m on walls over 4 m, two set-back courses above 8 m (the P8 logic), and
  caper or ivy spilling from the coping.

Cost: +3-6k triangles, 0 draws.

### O6-I8 Night lamps with a rhythm (S, prettier, impact 3)

- **Moles.** Light places instead of a 24 m pitch: pairs at the exedra and the berth-group paving bands, stairs and
  pierheads, with dark stretches between. About −30 % lamps on the moles.
- **Overview.** Close REVIEW #15: start the far-sprite shrink at about 420 m and halve the far halo.

Cost: slightly cheaper than today.

### O6-I9 A cultivated hinterland at heart (S, prettier, impact 3)

Make the cultivation tonal rather than drawn in lines:

- **Terraces.** Tint each bench tread worked earth, or give it pid 15 so it follows the farm year; darken each riser
  bank.
- **Vineyard.** Lay ploughed soil strips under the rows.
- **Lips.** Lower the pale lips and break them into dry-stone runs.

The terraced west lobe reads as olive terraces and vines. Cost: 0.

### O6-I10 The keeper's evening round (S, enchanting, impact 2)

Before the lamp wave reaches the tower, a single warm light climbs the slit windows bottom-up: the keeper carrying the
night's oil. Then the top-down wave takes over.

- **Mechanism.** One uniform in the window shader, limited to windows within 16 m of the Pharos axis.
- **When it is skipped.** Under reduced motion, and while the fire is banked.

It is decorative (time of day only). Cost: about 5 ALU on window fragments.

### O6-I11 Asset review stations and an R3 lint (S, professional, impact 2)

- **Review stations.** An `asset-review.mjs` captures these 12 stations × hours through `shot.mjs` into a dated contact
  sheet. Run it before and after every Blender export (D4).
- **Lint.** The exporters fail on anything other than the Pharos, cranes, masts or flag poles above 18 m. Add a vitest
  for the flag top.

### O6-I12 Egypt in the planting: a few date palms (S, prettier, impact 3, decision)

About 20-30 date palms: ringed curved trunks with star crowns of drooping fronds that sway. Place them flanking the
Customs stair and the causeway abutment, as a grove on the Burn headland, and at the Shipyard gate, but never in the
coves. Greek stone with Egyptian accents (the pharaoh colossi already strike that note) reads as Alexandria rather than
Tuscany. Cost: about 4k triangles, 0 draws.

## 5. Top picks (impact ÷ cost)

1. **O6-I1 Flags.** S and free. It fixes the loudest defect by day and by night, and restores the Pharos-first value
   hierarchy.
2. **O6-I5 AO bake.** S, with zero runtime cost. The hero and the civic buildings gain the depth the medium promises.
3. **O6-I2 Grass from the slope.** S, a free fix for the mosaic, plus turf grain visible at heart.
4. **O6-I4 Pharos v2.** M. The namesake gains proportion, craft and a value ladder up to the fire, for one draw and
   +14k triangles.
5. **O6-I3 Mediterranean ground.** S. One shader block turns the summer default view into the postcard.

Runner-up: O6-I6, the pines. Batch I6-I9 and I12 into **one** `island.glb` rebuild, as Wave 6 did.

## 6. Decisions for the operator

- **I3.** Adopt a Mediterranean grass calendar? It reverses v1.1.0's "deep lush summer". Trees and snow keep their
  cycle.
- **I1.** Cut Ethereum's flag dominance from 1.65× to about 1.2×, overview growth to +25 %, and keep flag tops at or
  below about 24 m above their quay? Today it flies about 30 m up.
- **I4.** Approve a re-proportioned Pharos within the same envelope, without the pilaster grid? Gate it on before/after
  frames at heart, overview, golden hour and night.
- **I12.** Admit date palms, which sit outside the classical-town species list (PLAN §4.6)?

## 7. Cross-lane hooks

- **O1.** Approve the stone family, the calendar and the flag hierarchy against the grade.
- **O2.** Flag and far-halo bloom; check AO against the grade's shadows.
- **O3.** Coast cliffs and the islet rock (`hb_cliffs.py`) must follow the warm palette.
- **O4.** Snow on a green winter. The sky shards below 20° pitch matter only for posters.
- **O5.** Keep flag scale consistent with burgees and titan flags (D17).
- **Life lane.** Leaf drift (F10), platform keepers (I4), night routes (I8), palm sway (I12).
- **Perf/bytes.** Measure I4, I6, I7 and I12 together on the iGPU (about +45-75k triangles, +250-400 KB gz).
- **QA.** Use the review stations (I11) as the GLB gate.
