# 08 — Town, buildings & landscape

Specialist: vertical 08. Baseline `main` @ v1.2.1. Read-only survey of `src/harbour/{civic,world,identity,life}`,
`scripts/harbour/blender/{island,civic}`, `agents/2026-10-15-classical-town/PLAN.md`, plus five real-GPU captures:
`shots/08-overview.png` (t=11 overview), `08-west.png` (shipyard and west beach), `08-carpet.png` (west lobe
interior, `cam=-130,10,130,260,40`), `08-civic.png` (civic quarter, t=16), `08-southridge.png` (moles, t=17).

## 1. Current state

- **The civic quarter is the strongest part of the frame** (`08-civic.png`). Stoas, temple fronts, stepped granite
  pads (`hb_land.py` P6 retaining walls), chain-coloured awnings and the crest panel (`identity/offices.ts`), stalls,
  bunting, smoke. It reads as a real, dense, lived-in harbour town.
- **The west lobe is the weak part** (`08-carpet.png`, `08-overview.png` left). It is the largest land area on screen
  in both presets, but it reads as a flat lawn with even confetti on it. The cause is
  `scatter(1680, uniform over the island bbox, place_meadow, 3.2 m)` in `hb_dress.py`: shrubs, tufts, flowers and
  boulders all at one density, with no zoning by slope, height or use. Its umbrella pines are many copies of one
  crown at one height band (`nl_kit.umbrella_pine`, octahedral crowns).
- **Farmland exists but doesn't show.** `terrain._meadows()` makes nine walled fields, vine-row "hedges" and sheep.
  But the 0.6 m dry-stone walls (`field_walls`) and the low field tint barely separate from the turf at
  heart/overview distance. The west lobe has no terraces. The only terraces are the town "amphitheatre"
  (`terrain.town_step`) and the battery's planted ledges (P8).
- **Roads are bare ribbons.** `ROADS pharos/west/south/east`, cove paths and three footpaths (`hb_dress.road`) are
  gravel or earth strips. Cypresses line some of them. Nothing moves on them, and nothing at their ends calls you
  there: no well, shrine, farm gate or milestone.
- **Moles and long quays are plain** (`08-southridge.png`). The flagstone promenade has lamps, benches and small
  trees (`hb_land.py` v5 moles), and the hulls give rhythm on one side. The deck itself is a long grey strip with
  nothing at mid-length.
- **No vegetation moves.** The kit shader (`world/materials.ts`) has rich season, snow, wetness and leaf-fall logic
  (`hbFoliage`, `hbWeather`), but no vertex animation. Wind already exists as data: `life.wind` follows the DEWS
  wind through the sky (`life/life-system.ts`), and the flags (`life/flags.ts`) already use it.
- **Ground tone is noise-only.** Grass seasons (`hbFoliage` grass branch) use `hbNoise(W*0.06)` patches. Slope,
  height and aspect play no part, so ridges and hollows are tinted alike, and the dry-gold summer appears at random.
- **Data-bound buildings:** the Mint, Burn, Yard, Storm Station and Harbourmaster each carry a reading (`civic/*`).
  The eight harbour offices carry identity only (crest, awning, flag). They have no state. `/api/chains` already
  feeds `change7dPct`/`change30dPct`, and the chain panel shows both (`ui/Panel.tsx:513-514`).
- **Constraints from history:** R3 says only the Pharos is a tower, and nothing else rises above about 18 m except
  cranes and masts. D3 says "a working Ptolemaic harbour, not a tour of Alexandria" (no Library, Serapeum or
  Colossus). Everything goes through `scripts/harbour/blender/island` into `island.glb` (4.6 MB, 2.56 MB gz). The
  island is merged by material (`mergeStaticMeshes`, so the four chunks become one draw per material). New island
  geometry therefore costs tris and bytes, and almost never draws.

## 2. Ideas

### T1 Contour terraces, olive groves and a vineyard on the west lobe
**What:** Rework the west-lobe farmland in `terrain.py`/`hb_dress.py` as Mediterranean agriculture that follows the
land:
- 2–3 olive-terrace hillsides. Use `terrain.height` iso-lines at about 2.5 m steps. Each has a low dry-stone
  retaining lip (reuse `hb_land` coping and `nl_kit.beam`), and olives in quincunx rows along each bench (`placer(('olive',1))`
  on a lattice, not a scatter).
- One trellised vineyard block. Real rows of short vine posts and canopy, oriented down the fall line, to replace
  the `field_vines` blobs.
- A circular paved threshing floor (*aloni*) beside the windmill.
- The existing hay, pasture and plough fields, with stronger tonal contrast.

Carve the terraces into the heightfield the same way `town_step` carves the amphitheatre, so `ground` heights,
AO and snow stay correct for free.
**Why magical:** The lawn becomes a cultivated hinterland. The striped olive terraces give the eye a rhythm that
answers the town's curved terraces across the bay, and the miniature reads as cared-for.
**Data/meaning:** Decorative (seasons keep driving blossom, snow and colour).
**Where:** `scripts/harbour/blender/island/terrain.py` (`_meadows` spec plus a terrace carve),
`hb_dress.py` (fields loop, vegetation block), and the `island.glb` rebuild.
**Cost:** M. About +60–90k tris (olives about 300 tris each × ~200, walls, vines) against a matching cut in
meadow blobs (T2), so close to net zero. 0 new draws (the existing materials merge). About +150–250 KB gz.
**Risk:** Low. It must not become a patchwork quilt, so leave negative space (one grove, one vineyard, the fields
already there). Re-check the folk walkways and the occupancy raster.

### T2 Ecological scatter and terrain-aware ground tone
**What:**
- Replace the uniform 1,680-point meadow scatter with a density mask: maquis thickets on steep slopes and around the
  outcrops, open turf near fields and roads, garrigue on ridges, nothing on the threshing floor or terraces. Cut the
  count by about 40 % and cluster what is left (`scatter` with `sampler` driven by `terrain.fbm` × slope × distance
  to roads).
- Give the umbrella pines 2–3 crown silhouettes (flat-tiered, wind-sheared leaning toward `layout.wind`, young or
  low), with heights tied to exposure.
- In `hbFoliage`'s grass branch, mix a slope/height term into `patchN`: drier gold on ridges and steep south faces,
  lusher in hollows. The data is free: world normal and `vHbWorld.y`.

**Why magical:** The land reads as shaped by sun and water, not sprinkled. The confetti is the single biggest "cheap
game" tell in the frame today.
**Data/meaning:** Decorative.
**Where:** `hb_dress.py` (`place_meadow`, the scatter calls, `nl_kit.umbrella_pine` variants) and
`world/materials.ts` (`hbFoliage` grass, a few ALU).
**Cost:** S–M. Tris −20 to −40k (fewer blobs). Shader +4 ALU on grass fragments only. 0 draws.
**Risk:** Very low. Snow and `SNOW_SLOPE` already read slope, so keep the tones consistent with them.

### T3 Crowns and vines that breathe with the wind
**What:** Add vertex sway in the kit material for the leaf patterns (8, 14) only. Bake a per-vertex sway weight in
Blender (normalized height above the trunk base, 0 at trunk, 1 at the crown top) into a spare attribute. A small
`_SWAY` UNSIGNED_BYTE normalized attribute works, or the free `.b` of an existing channel if one exists for the
leaf families. The shader adds `weight × A(wind) × sin(uTime·f + hash(world xz))` along `life.windTo`, plus a slow
gust envelope. Cypress spires get a low-frequency nod, olives a shimmer, and pines barely move. Do the same for
vine canopies and pergola leaf. Use `ctx.uniforms` wind, the same value the flags read.
**Why magical:** The single change that most turns a model into a place. Calm by construction: a few cm at
0.2–0.5 Hz.
**Data/meaning:** **Re-uses an existing signal; it does not add one.** The amplitude follows the wind the life layer
already shows (DEWS-driven weather), so storms make the trees stir as they make the flags snap. The DOM equivalent
is the existing weather and stress line. Say this in the legend copy ("wind follows the stress band") rather than
adding a new mapping.
**Where:** `world/materials.ts` (kit `begin_vertex` hook, guarded on leaf pid; `kitDepth` keeps static shadows,
which is acceptable at this amplitude), `scripts/harbour/blender/island/nl_kit.py`/`hb_export.py` (sway attribute),
and `ui/services` motion (reduced motion → amplitude 0).
**Cost:** S–M. +1 B/vertex on leaf meshes (about +100 KB raw, less gz). About 8 vertex ALU on leaf vertices only.
0 draws. The shader cache key is unchanged except for one define.
**Risk:** Perf on iGPU is negligible. Reduced motion must zero it. Avoid synchronized waving: per-tree phase from
world xz.

### T4 A hill sanctuary on the west spine
**What:** One small *temenos* on the highest knoll of `terrain.WEST_SPINE`:
- a low prostyle shrine or tholos (≤ 9 m, so R3 is safe), with a ring of cypresses, an altar and two stelae;
- a zig-zag processional stair-path up from the west road, with low terrace walls;
- one lamp at dusk.

It is the west lobe's only landmark and the counterweight to the civic quarter's temple fronts across the water.
Generic and votive (the harbour's own sanctuary, fit for Isis Pharia), not a named wonder.
**Why magical:** It gives the eye somewhere to rest and something to discover at zoom, plus a pale accent on the
green skyline at heart framing (currently a row of identical pines). At night it is the one warm point in the dark
hinterland.
**Data/meaning:** Decorative. **Not** data-bound. Do not make it a beam or PSI proxy: the beam owns that.
**Where:** `scripts/harbour/blender/civic/cv_civic.py` kit pieces (temple front already exists) placed by
`hb_dress.py`/`compose.py` landmark, `layout.lights` (one lamp), and `walkways.json` (folk climb it).
**Cost:** M. About 6–10k tris, 0 new draws (merged into the island materials), +1 light-pool entry.
**Risk:** D3 kitsch. Keep it modest, half-hidden in cypress, with no statue colossus and no label. Keep it below
the 18 m line.

### T5 Life on the roads: carts, mules and a shepherd
**What:** A small instanced actor set: an ox-cart, a laden mule and a shepherd with flock. They move slowly along
the `ROADS` polylines and cove paths, out from the town in the morning and back at dusk, and are off the roads at
night. They reuse the Townsfolk machinery (`life/folk.ts`, `figure-kit.ts`) with the road polylines exported into
`walkways.json`.
**Why magical:** The roads stop being drawings and become routes. It is a slow, meditative motion that rewards a
ten-minute watch.
**Data/meaning:** Decorative (time of day only). Do **not** scale carts with mint volume, because the Mint already
owns that reading.
**Where:** `life/folk.ts`, `life/walkways.ts`, `scripts/harbour/blender/island` (export road polylines),
`TIER_SHARE` (fewer on low).
**Cost:** S–M. 1–2 instanced draws, about 400 tris per actor × ~12. Negligible CPU.
**Risk:** Reduced motion freezes them in place. Keep them few.

### T6 Chain offices under works when a chain grows (data-bound)
**What:** When a pier chain's **30-day** supply change passes a threshold (for example ≥ +8 %, with hysteresis at
+6 %), its harbour office gets timber scaffolding on one flank, a small treadwheel hoist, stacked ashlar blocks and
a half-built extension bay. The kit is one small GLB with about 1.5k tris and anchor nodes. When the change is ≤
−8 %, the office's chain-coloured awnings are furled (the `awning` node scales to about 30 % depth, a rolled cover)
and a shutter closes. Between the two, the office is as it is today.
**Why magical:** The town grows where the money flows. A returning visitor notices "Base is building again" without
reading a number.
**Data/meaning:** **New analytical cue.**
- Source: `/api/chains` → `ChainRow.change30dPct` (already in `model/types.ts`).
- DOM equivalent: the chain panel already prints 30 d (`ui/Panel.tsx:514`). Add one line, "Office under
  works: supply +12 % over 30 d" or "Awnings furled: −9 % over 30 d", and a legend entry.
- Distinct horizon from the Harbourmaster's 24 h movers hoist (`civic/yard.ts topMovers`). Say so in the legend.
- Stale `/api/chains` → neutral state (the scaffolding comes down), so it never lies.

**Where:** `identity/offices.ts` (`OfficeDresser`, anchors beside `crest_panel`/`awning`),
`scripts/harbour/blender/civic/cv_works.py` (scaffold kit), `civic/yard.ts` (pure threshold function plus a test in
`civic.test.ts`), and `ui/Panel.tsx`.
**Cost:** M. +1 instanced or merged draw for scaffolding (≤ 8 instances), about 12k tris worst case, about 40 KB gz.
**Risk:** Truth: thresholds must be stated and tested. Calm: static props, no animation beyond the treadwheel
(reduced motion stills it).

### T7 Mole promenades with a rhythm
**What:** Break the long grey mole decks:
- a paving pattern change every berth-group (a darker opus band, `PT['cobble']` variant);
- amphora stacks, coiled hawsers and a capstan at each berth pair;
- a mid-length stone exedra with a statue plinth (an anonymous bronze navigator, not a colossus);
- planted pots replacing a few bare benches.

Keep the boat-side edge clear.
**Why magical:** The eye walks the mole instead of sliding along it. It is the warm, inhabited detail that the
civic quay already has.
**Data/meaning:** Decorative. Do not key cargo to docked hulls: docking already encodes supply share, and cargo
would double-encode it.
**Where:** `hb_land.py` (v5 moles section) and `hb_dress.py` (quay life: `crates`, `coils`, `amphora` from `cv_lib`).
**Cost:** S. About +25k tris, 0 draws (merged into existing prop materials), about +60 KB gz.
**Risk:** Clutter at overview. Keep the props under 1 m tall so the moles stay pale lines.

### T8 Laundry, awnings and roof life in the residential quarter
**What:** Lines of laundry strung between facing houses and from roof terraces (`nl_kit.catenary` plus cloth quads in
the undyed palette, with a few madder and saffron), drying nets on the cove roofs, rolled reed blinds on pergolas,
and roof pots. The cloth flutters with the same wind uniform as T3 (vertex pid flag). Not chain-coloured: chain
colour belongs to the offices and piers (D17), and diluting it would hurt identity.
**Why magical:** The town looks inhabited at heart zoom, and the cloth catching the dusk light is lovely.
**Data/meaning:** Decorative. The flutter amplitude re-uses wind, as in T3.
**Where:** `scripts/harbour/blender/island/hb_town.py` (`classical_house`, `courtyard_house`, `island_house`) and
`world/materials.ts` (cloth sway shares the T3 hook).
**Cost:** S. About +15k tris, 0 draws.
**Risk:** Low. Keep laundry off the civic buildings.

### T9 Hinterland lamps at night
**What:** At dusk, a handful of warm points on the west and south lobes: farmstead doors, the windmill, the T4
shrine, a wayside lantern at road forks, and a shepherd's fire. Add them as `layout.lights` entries of a dim
"hearth" kind (existing light-pool path), and lit `hb_window` panes on the villa rustica, barn press and boat sheds
(they already get windows through `hb_town`).
**Why magical:** Today the west half of the night frame goes almost black (`shots/night.png`). Scattered hearths make
the land feel inhabited and frame the Pharos beam without competing with it.
**Data/meaning:** Decorative (time of day).
**Where:** `scripts/harbour/blender/island/hb_dress.py` (`LAMP_LIGHTS`), `lights/` and `layout.json`.
**Cost:** S. Light-pool entries only (pools are already batched). Check the pool budget on iGPU.
**Risk:** Must stay dimmer than the town and far dimmer than the beam.

### T10 Weathering where water and time act
**What:** In the kit fragment shader, add three height- and normal-driven terms:
- a damp dark band at the foot of quay and mole walls, varied with tide (`ocean` tide uniform);
- soot and rain streaks under cornices and sills, keyed on world-y distance below an overhang. A cheap proxy is the
  height-field AO gradient (`uAOTex`) combined with a vertical normal;
- lichen and moss on north-facing (−z) stone at the ashlar pattern.

The render pattern already has faint streaks (`materials.ts` pid 10). This extends the idea to stone (ashlar,
cobble) and the quay walls.
**Why magical:** The town ages gracefully, and the stone looks touched by sea and weather rather than CG-clean.
**Data/meaning:** Decorative.
**Where:** `world/materials.ts` (`hb_kit` pattern branches) and `uniforms` (tide).
**Cost:** S–M. About 10 fragment ALU on stone pids. 0 bytes and 0 draws. Profile on the iGPU gate.
**Risk:** Photorealism creep. Keep it to flat tonal bands in the crafted-miniature medium, not dirt maps.

### T11 Seasonal fields
**What:** Give the hay, plough and vineyard fields their own pattern id or colour key so `hbFoliage` cycles them:
- winter: brown furrows;
- spring: green shoots;
- early summer: gold hay;
- after the July harvest: pale stubble with stooks (stooks are geometry, shown by seasonal alpha-discard like the
  leaf fall);
- autumn: vines turn red and gold.

**Why magical:** The returning visitor sees the farm year turn, which is a quiet calendar.
**Data/meaning:** Decorative (season is declared decorative).
**Where:** `world/materials.ts` (`hbFoliage` plus a field pid) and `hb_dress.py` (field faces).
**Cost:** S. A few ALU, 0 bytes.
**Risk:** Low.

### T12 A small aqueduct and fountain (optional, lower priority)
**What:** A low arcade (about 6 m, 10–14 arches) bringing water from the west spine down to a nymphaeum fountain at
the Customs square. It gives the west lobe a strong structuring line toward town.
**Why magical:** It ties hinterland to town, and the fountain's glint gives the square a centre.
**Data/meaning:** Decorative.
**Cost:** M. About 8k tris, 0 draws.
**Risk:** It is more Roman than Ptolemaic, which is borderline on D3. Do T4 first, and only add this if the lobe still
lacks structure. A cistern-head and a stone channel are the calmer variant.

## 3. Top picks (impact ÷ cost)

1. **T2 Ecological scatter and terrain-aware tone.** Cheapest fix for the biggest flaw: the confetti lawn becomes
   land, with fewer tris.
2. **T1 Contour terraces, olive groves and a vineyard.** It gives the empty west lobe structure, purpose and a rhythm
   that rhymes with the town amphitheatre, at about net-zero cost with T2.
3. **T3 Crowns that breathe with the wind.** The most "magical" per byte. It re-uses the existing wind (DEWS) signal,
   and reduced motion stills it.
4. **T6 Chain offices under works.** The one new data story in this vertical. The source and the DOM line already
   exist, and the cue is gentle and legible.
5. **T4 Hill sanctuary on the west spine.** A single calm landmark and destination for the lobe, plus a night hearth,
   inside R3 and D3.

Runners-up: T9 (night hinterland, very cheap) and T7 (mole rhythm).

## 4. Cross-vertical hooks

- **T3/T8 sway ↔ weather/wind and life:** one shared wind and gust uniform, so the flags, cloth, trees and sails stay
  in phase. Reduced motion is owned by the motion service.
- **T5 carts and T4 shrine paths ↔ life/folk:** walkway export from Blender, and tier shares.
- **T9 hearths ↔ lights and night/sky:** the pool budget, and keeping them subordinate to the beam.
- **T11 fields ↔ season:** the harvest date on the season calendar (`season/calendar`).
- **T1 olive groves ↔ audio:** cicadas (Q8) could localize to the groves on summer afternoons, inside the opt-in
  ambience.
- **T6 office works ↔ identity/UI/legend:** Panel and legend copy, and threshold tests. The Harbourmaster 24 h hoist
  must be explained as a separate horizon.
- **T10 damp band ↔ ocean:** the tide uniform.
- **Blender rebuild (T1, T2, T4, T7, T8):** one `island.glb` regeneration pass, so batch them in a single island
  release and re-bake `sea-sdf`/walkways together.
