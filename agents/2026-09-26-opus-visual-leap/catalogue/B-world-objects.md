# Catalogue B: world objects (pharos, garden, garden-master, harbour, fleet-craft, fleet-motion)

This indexes six reviews in `agents/2026-09-26-opus-visual-leap/reviews/`. Numbers, costs, perf figures and file:line refs are copied as the reports give them. `—` means the report doesn't state the field. Defect numbers are per lane (`D1`…); ideas keep their report IDs. `RM` = reduced motion.

---

## pharos

Verdict: The hero sits dead centre (50% x) and fills about 70% of the frame height, with the statue 7% from the top, on about 4 u of flat rock plus a plinth box. At night the lantern (L\*93) barely beats the window rows (82), and the air beside it is L\*2. The beam is a hard tube, or a grey disc when seen end-on.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pharos-1 | ★ | The lantern is the only fire | Delete the opaque window-material drum. Add a fresnel glass skin: open cyl r1.78, alpha `0.05+0.4·pow(1−\|N·V\|,3)`. Flame core ≈4 linear. The halo sphere becomes a 6 u additive corona sprite (opacity 0/0.12/0.38). | stunning 5 / poetic 4 / relaxing 3 | H | S–M | +1 draw (GLB 7→8 of 8) / −250 tris / <0.05 ms / 0 tex | `generate-garden-lighthouse.mjs:942-944`; `garden-lighthouse.ts:186,785-797`; `garden-beacon-fire.ts`; shell drum `:704-722` | Lantern drum and orange day read; halo sphere; 32/36 window lights (via pharos-4); global bloom generosity | PSI flame brightness/flicker unchanged; DOM PSI row kept. RM: flame frozen at t=0, corona static | pharos-4 (separate window curve). GLB hash/manifest/`check:garden-models` re-pin. `LIGHTHOUSE_WINDOW_MATERIAL_NAME` still used by gatehouse. Glass renderOrder after flame. Post lane can lower bloom |
| pharos-2 | ★ | Trade keep for crag: the asymmetric headland | One `headlandHeight`: crown Gaussian +8.5 at (−7,−1.25), σ9/13; sheer seaward cliff; lee benches 2.4/1.3/0.5; 0.2 u pebble shelf. Polar heightfield 128×48 with strata only where slope>35° (±0.12 u). Delete cliff box, COURT_Y 11.05. Keep SQUARE_TOP 20.5→14.5, drop middle register, courses 34→23, ROOT_OFFSET.y 2.55→8.55, BEACON_Y 30.2→24.2, HEIGHT 38→32. World crown/beacon unchanged. Quay stair rise ~8.5 u with 2 landings | stunning 5 / poetic 5 / relaxing 4 | M | L | −1 draw / ≈−2k tris (rock +6k net, GLB −8k) / ~0 ms / 0 tex | `garden-island.ts:171-175,184,847-866,894-920,1877-1886`; `garden-precinct.ts:70`; `garden-observatory-slice.ts:40-46`; generator | 3 concentric tiers, 3 shelves, plinth box, fourth-face court walls, 1 window register (12 windows) | No meaning; supply-tide waterline colour kept; static | Many pins: C3 constants, L1 silhouette `garden-lighthouse.ts:40-45`, `garden-island.test.ts` (drawable 49, precinct 4), GLB y38→32, pick proxy, W1.15 reflection. Longer inlet shadow (blur-audit). Headland L\* 20–30 noon. pharos-6 is the cheap fallback. Overlaps gm-6 (box cliff) |
| pharos-3 | ★ | The beam as breath, and the look-at-you flash | Single BackSide 48-seg cone with an analytic ray–cone chord. Density `exp(−(r/(x·tanθ))²·3)·pow(1−x/L,1.6)`. Delete core cone, `aBeamCore`, `bands` sine; keep `beamNoise` mist. Flash `pow(uScatter,8)` drives corona ×(1+flash·5), cap 2.5 HDR (~0.6 s per ~31 s rev). Throat alpha night ≈0.18, dusk 0.06. Delete dust | stunning 5 / poetic 5 / relaxing 3 | H | M | −1 draw / −1.3k tris / +≈0.05 ms / 0 tex | `garden-lighthouse.ts:973-991,1037-1054,1098-1154`; `world-renderer.ts:4379-4397`; `garden-day-cycle.ts:451` | Core cone, bands, dust Points, halo-as-flash; end-on smudge | Sweep rate (PSI) and dwell untouched. RM: parked bearing, mist frozen, **no flash**. Flash is 1 per ~31 s | Needs pharos-1 corona. Clamp x≥0.5 u. Low-tier `createBeamPlane` keeps old look. Remove `garden-lighthouse.test.ts:46-58` core-ratio pin. Same defect as gm-D6 |
| pharos-4 | | The keeper climbs: four stair lights and a kindling | `onBeforeCompile` window mask `windowId=floor(worldY/5)*4+face`. Only 4 spiral windows lit (reg1 S, reg2 E, drum NE, gallery door); others emissive 0, `iron_dark`. `climb=remap(keeperRitual.progress,0.82,0.96)`. Lantern kindles 0.96→1.0 (flame 0.15→1). Phase fallback. Stair emissive ≈0.6 linear (L\*55–60) | poetic 5 / relaxing 4 / stunning 3 | M–H | S–M | 0 / 0 / ~0 ms / 0 | `garden-lighthouse.ts:164`; `garden-lanterns.ts:66-72`; `garden-day-cycle.ts:405`; `visual-cue-registry.ts:11` | 32 of 36 night window lights and their 32 reflection worms | Decorative (register it). Beacon PSI never gated after the ritual. RM: final lit state, no climb | Keeper ritual (Life). Exclude gatehouse window by world position. Helps water-2 worm fix. Director dusk-event contention with harbour-3 and gm-3 |
| pharos-5 | | Weathered limestone, not putty | `paintStone` bake: (a) 3 stone lots ±6% value / ±4° hue, ramp `#b9ae98→#e4dfd2`; (b) sill streaks `0.22·exp(−below/2.8)·streak(u)`; (c) verdigris `#7fa596` under Tritons/gallery/cornice; (d) salt +8% seaward y<8, biofilm `#2c3a33` y 0.2–1.4; (e) window day emissive 0.18→0 (ramp from dusk>0.35), colour `#2a2116→#15181b` | stunning 4 / poetic 4 / relaxing 3 | H | M | 0 / 0 / 0 ms / 0 | `generate-garden-lighthouse.mjs:221,394,1252-1278`; `garden-day-cycle.ts:405` | Smooth cream ramp; orange daytime windows | None (material) | Streaks ≤0.22. GLB re-pin. Noon tower L\*58–62. Near-duplicate of gm-5 (runtime shader vs generator bake) |
| pharos-6 | | Wave-cut foot and tide-wet skirt (fallback if pharos-2 deferred) | Radial notch `0.35·bell(y)` for y∈[WL−0.2, WL+0.55] on lowest tier; `STONE_WET×0.55` + roughness drop; 0.12 u barnacle band `foam_white×0.7` at WL+0.6 | stunning 3 / relaxing 4 | M–H | S–M | 0 draws / +0 tris / 0 ms / — | `garden-island.ts:853-873` (`TIDE_DATUM_IRON :68`) | Laminated grey lip | Supply-tide datum notch stays iron, distinct from salt | Water shore-foam band. Logic carries into pharos-2 |
| pharos-7 | | Bronze that reads as bronze | `statueGleam = 0.06 + dusk·0.18 + night·0.05`; gilt roughness 0.3→0.22, colour −20%; rim light separates; finials `oxidized-bronze #5c7268` | stunning 3 / poetic 3 | H | S | 0 | `garden-day-cycle.ts:376`; `garden-lighthouse.ts:245-253` | Self-lit statue at dusk | None | Noon statue vs sky ΔL\*≥15. Near-duplicate of gm-5 statue part (gm: verdigris Zeus, emissive 0 by day, dusk ≤0.4). Conflict: bronze vs verdigris statue |
| pharos-8 | | The beacon lights its own mist | Shared fog chunk gets `uBeaconWorld/uBeaconFog`. `fogColor += lantern_warm·uBeaconFog·exp(−d/18)·fogFactor`, with `uBeaconFog = night·0.12+dusk·0.04` × flicker × (1+0.5·beamAlign). Clamp ≤L\*15 at waterline | poetic 4 / stunning 3 | M | S | 0 / 0 / <0.05 ms / 0 | `gardenHeightFogGlsl`; ref point light `garden-lighthouse.ts:799-806` | Flat indigo fog around the tower foot at night (must not add a light source) | Illumination, not density, so it doesn't counterfeit W4.12 staleness fog. RM: static at parked bearing | Fog owner (Sky/post). Night floor must stay dark; keep within 1.5 tower-heights |

Acceptance gates:
- **pharos-1** (`#t=22`):
  - lantern p95 L\*≥92;
  - 2–4-radius ring ≥L\*10;
  - flame visible in a 2× crop;
  - next-brightest harbour light ≤L\*70.
  - At `#t=12.25`: glass L\*≤45 and hue within ±15° of sky.
- **pharos-2:**
  - at `#t=12.25`, rock ≥18% of tower height, rising lower-right→upper-left;
  - foot hidden by rock/court, not a box;
  - blur-audit inlet still empty;
  - at `#t=17.6`, ≥3 lit ledges.
- **pharos-3** (12-frame sheet):
  - no disc or ring;
  - lateral falloff ≥50% over ≥6 px;
  - no end-cap;
  - one crown flash per revolution (L\*≥60);
  - `--reduced`: steady beam, no flash.
- **pharos-4:**
  - at `#t=22`, ≤4 lit apertures, window p95 ≤L\*60;
  - 30-min dusk log shows climb after keeper walk;
  - crown motion sheet at `#t=18.3`.
- **pharos-5:**
  - noon-2x shows streaks under sills and green under finials;
  - windows L\*≤25, hue-neutral;
  - tower mean L\* 55–64.
- **pharos-6:** `#t=12.25` 2× crop shows a continuous notch plus a pale high-water line.
- **pharos-7:** `#t=17.6` statue mean L\*≤55, specular visible, arm and sceptre readable.
- **pharos-8:** `#t=22` fog within 30 u is ΔL\*+4–8 vs fog at 80 u; top-left sky ≤L\*5.

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Beacon not the brightest light in its own tower; flame hidden | `night.png`/`deep-night.png` crown, `night-beam-f0-crop.png`; lantern peak 93 vs windows 82, air L\*2 | `generate-garden-lighthouse.mjs:942-944`; `garden-day-cycle.ts:405-408` (0.18/1.53); `garden-post.ts:44` (knee 2.4); `garden-beacon-fire.ts:77-78,125-126,230-231`; halo `garden-lighthouse.ts:785-797`, `garden-day-cycle.ts:370-371` | pharos-1 | S–M |
| D2 | Beam is a solid golden tube; end-on grey disc ("fixed" smudge persists) | `night-beam-f1-crop.png`, `-f0-crop.png`; `night.png` ~700-760,210-290; `deep-night.png` ~820-890,200-290 | `garden-lighthouse.ts:1039-1040` (rim), `:973-991` (core), `:1037-1038` (fade), `:1041` (bands), comment `:1044-1047` | pharos-3 | M |
| D3 | Tower at night reads as a lit hotel (3×6 equal grid); reflections are the 2nd-brightest water mark (L\*82) | `night.png` | `generate-garden-lighthouse.mjs:441-446`; `garden-day-cycle.ts:405` | pharos-4 | S–M |
| D4 | Noon windows and lantern painted orange | `noon-tower-crop.png` | `generate-garden-lighthouse.mjs:220-228`; `garden-day-cycle.ts:405` | pharos-5(c) as written (the day-voids step is (e)) | S |
| D5 | "Headland" is a pancake under a plinth (~4 u relief under 38 u) | `noon-base-crop.png`, `golden-base-crop.png` | `garden-island.ts:171-175,576-598,853-866`; `garden-precinct.ts:70` | pharos-2 (fallback pharos-6) | L (S–M fallback) |
| D6 | Blue-violet smoke feather on statue at dawn/dusk; invisible at noon | `golden.png` ~800,120; `dawn.png` ~800,120; `blue.png` | `garden-day-cycle.ts:361` (0.16 at dusk); `garden-beacon-fire.ts:61-62` [INFERENCE] | Subtract smoke | S |
| D7 | Zeus glows cream at dusk, not bronze | `golden-crown-crop.png` | `garden-day-cycle.ts:376` | pharos-7 | S |
| D8 | Black "cable": niwaki #0 trunk straight at ~50° across tower foot | `noon.png` 540-700,525-640 | `garden-island.ts:1218-1223` (lean −6.2,7.4; h 8.5) | Lean ≈(−3.2,3.8), S-curve with 2 bends, bark +1 stop (garden lane) | S |
| D9 | Beam's sea road is a 1-px dashed ruled line | `night-beam-f2-crop.png` y≈590, x40-340 | `garden-water.ts:1275,1282-1283` | Water lane: 3–4 u broken glitter path gated by normal/half-vector | S |
| D10 | Hero dead centre, no crown air (50% x, statue 7% from top) | All rest frames | — (camera) | Camera lane: axis 58–62% x, crown 14–18% from top; pharos-2 helps | — |

### Subtractions
- Beacon day smoke `lighthouse-smoke` (`garden-beacon-fire.ts:133-150`; `garden-day-cycle.ts:359-361`): −1 instanced draw and 16 quads of overdraw. The mirror glint stays as the day sign.
- Beam dust `Points` (`garden-lighthouse.ts:1098-1154`): −1 draw (pharos-3).
- Beam core cone and `bands` rings (`garden-lighthouse.ts:973-991`, `:1041`): pharos-3.
- Halo sphere (`garden-lighthouse.ts:785-797`): replaced by the corona sprite (pharos-1).
- Lantern opaque glow drum (`generate-garden-lighthouse.mjs:942-944`): pharos-1.
- 32 of 36 night windows and all daytime window emissive (pharos-4, pharos-5e; `garden-day-cycle.ts:405`).
- One window register (12 windows) and 6 u of keep (pharos-2; generator `SQUARE_TOP_Y`).
- Precinct square cliff box and 3 of 4 dry-stone wall runs, which read as merlons (`garden-precinct.ts:70`, `:76-90`).
- Half the lean of niwaki #0 (`garden-island.ts:1218-1223`).

### Reversals
- Epic Pharos D1 "three rows of lit arched windows… 38 u to sceptre tip" (`pharosville-changelog.ts:91`; `garden-observatory-slice.ts:41-46`).
  - Evidence: night grid ≈ beacon (L\*82 vs 93); by day an office block on a coaster.
  - Change: keep crown/beacon world heights, spend 6 u of shaft on rock (this is not "raising the tower").
  - Risk: C3/model-contract re-pin, hero reflection.
- "Tower window rows wake with the sky" (changelog `:43`; `garden-day-cycle.ts:401-408`).
  - Evidence: D3.
  - Change: 4 keeper-kindled stair lights.
  - Risk: operators liked the lit tower; the phase fallback covers it.
- D3 smoke daymark (`garden-day-cycle.ts:352-361`).
  - Evidence: absent at noon, wrong colour at dusk; three generations of tuning.
  - Change: the mirror glint (`:362-367`) becomes the day sign.
  - Risk: the day crown loses a theoretical life cue.
- Comment claim that the end-on smudge is fixed (`garden-lighthouse.ts:1044-1047`).
  - Evidence: `night-beam-f0-crop.png`.
  - Change: needs a shading-model change, not another scalar.
  - Risk: —.

Other cross-lane flags:
- Water: pharos-1 and pharos-4 leave only lantern + 4 stair lights in the hero reflection. Shore-foam must follow the pharos-2/6 waterline.
- Garden: re-seat niwaki in clefts on the new benches; irregular suhama pond on the lee bench.
- Sky/post: lower global bloom once the lantern is the only >3 linear source. The moon streak (L\*19) is brighter than the beacon's throw on water.
- Headroom: pharos-1…3 net −1 draw / ≈−3.5k tris, no textures. ms figures are analytic [INFERENCE] at 1× (≈×4 at DPR2).

---

## garden

Verdict: No authored near-garden element is in the rest frame. Bough (−1691,1627), tōrō (−876,1123), waterfall (−624,884), heron (−371,1098) and koi (−550,894) are all off-frame at every gate viewport. What does show reads as a toy set: lampshade/palm pines, a black ridge lump, gumdrop karikomi, vermillion mushroom maples.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| garden-1 | ★ | The threshold in frame: one kuromatsu limb solved in screen space | `solveGardenThresholdPose(viewport)` inverse-projects pads at (0.07w,0.88h) depth 14 u and trunk exit (0.16w,1.04h) depth 9 u. Root ~tile (117,134.5), 19 u trunk leaning ~7 u NW, 9–10 u sashi-eda, pads 2.8/2.2/1.6. Re-solve on resize. Breath rig `solved+(breathedEye−restEye)×0.85` (~55 px drift/118 s). 600 ms fade off rest (\|Δzoom\|>0.08 or >6 tiles). No shadow cast; underside ×0.34, crown ×0.62; night ≤3. Heron moves to the crane-islet stone (1200,636) | stunning 4 / poetic 5 / relaxing 4 | H | M | 0 draws net / +1.5–2.5k tris / ≈0 ms / 0 tex; 1 Matrix4 write/frame, no allocation | `garden-rim-mesh.ts:912-937`; `world-renderer.ts:5064-5071`; `use-world-render-loop.ts:783`; `garden-almanac-dressing.ts:27-31` | Off-frame bough; eye-relative solver; off-frame heron perch; the cut hull in the corner must move | Decorative (`visual-cue-registry.ts:5`); hit-testing is projection-driven. RM: rest pose | Needs garden-2 limb generator. Fleet must keep corner rect [0,0.24]×[0.70,1.0] hull-free. Replace `garden-rim-mesh.test.ts:71-74` with a projected-bbox test. Optional near-field softening (Light/Printmaker). Joins camera safe-rect. **Conflicts with gm-1** (rest moves to engawa, bough deleted) |
| garden-2 | ★ | Real niwaki: cloud-pad kuromatsu, shared by rim, islets, island and threshold | `createCloudPadGeometry`: 3–5 `Icosahedron(1,1)` lobes ±0.45, clamp y≥−0.18, y×0.42, displace 0.06. Vertex colour underside ×0.40 + `fog_blue` 0.08, rim band +8% `sun_day_warm`. Catmull-Rom S trunk r0.34→0.07 with root flare, bark `stone_dark`/`timber_dark` 0.35. Visible 2-segment branches r0.11→0.06. Pads 1.0/0.85/0.7/0.55/0.4, sashi-eda 1.6×. chokkan + fukinagashi variants. Crane-islet pine 0.5→1.1. `patchGardenFoliageLight` golden rim `pow(·,6)·rim·0.3·uGolden`. Rigid pad bob pine 0.02 / momiji 0.06 / bamboo 0.12 | stunning 5 / poetic 4 / relaxing 3 | H | M | +1 draw / ≈+35k tris (pine 214→~480 ×124; island pads 36→~120 ×~24) / <0.1 ms [INFERENCE] / 0 tex | `garden-flora.ts:62-64,68,91,93-98`; `garden-island.ts:1329-1404,1354`; `garden-islets.ts:224-230`; `garden-sun.ts` | Cone pad, flat single-colour foliage, invisible struts, 2 u islet sprouts | Garden-record channel kept: `island-niwaki-pads` scale/instanceColor (`garden-month-record.ts:41-53`) multiplied by the gradient | Pins: `garden-islets.test.ts:32-35`, `garden-rim-mesh.test.ts:75`, census. Light lane checks tower pop. Prerequisite for garden-1 and gm-1. **Near-duplicate of gm-4** pad fix |
| garden-3 | ★ | Evergreens remember the market; deciduous trees keep the calendar (microseasons) | `seasonPhase(date)`: blossom bell DOY 95 ±9; flush DOY 100–135; per-maple `turnDay=298+stableUnit×28`, 10-day green→amber→persimmon, leaf fall at turnDay+14…26; snow weeks in DOY 350–59 at p0.2, lying 2–4 days. Derived `momiji_amber/persimmon/deep` (OKLCH C<0.14). Remove flora vermillion. `patchGardenSnow` `smoothstep(0.55,0.9,normal.y)`. Delete evergreen winter desaturation | poetic 5 / relaxing 4 / stunning 3 | M | M | 0 draws / — / snow ~5 ALU / 0 tex; instance writes once per UTC day | `systems/season.ts:7-15`; `garden-flora.ts:70-71`; `garden-island.ts:1040-1043,1387-1390` | Four-state switch; vermillion crowns; always-on spring drift | Makes pines = 30-day PSI only. Caption season phrase (Chrome). RM: same static per-day state | Needs a `?season=`/date-override seam. Sky: snow cools fog? Replace `garden-rim-mesh.test.ts:553-557` pins. Needs garden-2 per-instance colour. **Near-duplicate/conflict with gm-3** (continuous DOY vs small phenology table; gm-3 higanbana *is* vermillion) |
| garden-4 | | The far-west ridge becomes the grove | Far-pair tiles h>4: slope→rock rule replaced by `FOREST_FLOOR` (`PINE_NEEDLE×0.62` lerp `stone_dark` 0.25), rock only where outcrop>0.7. Permanent canopy blanket (~40 domes r3–5 u, reuse impostors). Grove selection `fbm(x·0.07)>0.52` in odd clumps 3/5/7; ~50 of 120 ring pines move to ridges at scale 1.6–2.6. Strip bamboo/karikomi/momiji where rim h>3 | stunning 4 / relaxing 4 / poetic 3 | M | M | +1 draw / ≈+8k tris / — / 0 tex | `garden-rim-mesh.ts:303-306,335,337-344,355,705-708,725`; `garden-canopy-impostors.ts:64-91` | Black rock hill face; crest toys; ~50 evenly spaced S/E ring pines | Decorative (`visual-cue-registry.ts:8`); static | Sky haze must carry recession. Station envelopes stay level (`:335`). Count conflict with gm-4 (45 pines total) |
| garden-5 | | Set stones and one raked court | `createSetStoneGeometry(seed,form)` in the 5 Sakuteiki forms: Box 3³ spherified 40%, top cut 6–14°, bedding ±0.03, moss where normal.y>0.55, 35% buried. Used for island, islets and rim. Coast stones regrouped 3/5. `patchGardenRakedGravel`: 6 rings at 0.32 u then lines, value ±5%, normal ±0.22, fwidth fade | poetic 4 / stunning 3 / relaxing 4 | M | M | 0 draws / +4k tris / gravel ~10 ALU on court only / 0 tex | `garden-island.ts:953-984`; `garden-islets.ts:43-45,152-179`; `garden-rim-mesh.ts:778-863` | Egg stones; dodecahedron chips; blank terrace slab | Decorative; static | Pins `garden-islets.test.ts:25-31`. Court is island/precinct owner (Pharos, Harbour). Hulls ≥~4 u from crane islet (fleet). **Near-duplicate of gm-6** (triad, stones) |
| garden-6 | | Moss, not khaki: a living land surface | Moss blend 0.62→0.85 inland. `MOSS`→sugi-goke (`aurora_green` lerp `stone_mid` 0.18, lerp `PINE_NEEDLE` 0.2). 2-octave hashed noise: hue ±, luma ±7%, hummock normal ±0.15. Sand only on beach coast forms | stunning 3 / relaxing 3 | M | S–M | 0 draws / — / ~8 ALU per land fragment / 0 tex | `garden-rim-mesh.ts:87-90,114,358-364` | Khaki average; sine patching | Decorative; static | Fleet whole-map value plane; harbour flag/roof work sits on it |
| garden-7 | | One tree lets go: a rare leaf/petal fall | Generalise spring petals into `garden-seasonal-drift`. Director beat ≤1 per 20–40 min, only when gust>0.6. Source: island maple or lee cherry. Vertex-shader helix (1.2–1.8 s period, r0.15 u), 5–8 s fall, then 60–90 s drift and fade | poetic 5 / relaxing 4 | M | S–M | 0 draws idle, +1 transparent ≤90 s/event / 12–20 instances / shader-driven / — | `garden-seasonal-dressing.ts:42-101` | Always-on 48-petal spring drift | Decorative. RM: 5–7 leaves fixed on the water | Colours from garden-3. Director slot vs Life beats. N8AO transparency blind spot |
| garden-8 | | O-karikomi and one bamboo grove | Karikomi become 3-lobe merged half-icospheres, h/w 0.5, clipped at 0.85, `aurora_green` lerp `timber_dark` 0.45, in chains of 3–7 along the path. Bamboo 35→6 in one clump at one station, culms `timber_warm` lerp `aurora_green` 0.5, one feathery lobe | stunning 3 / relaxing 3 | H | S | 0 draws / ~−2k tris / — / — | `garden-flora.ts:107-116`; `garden-island.ts:992-1082` | Gumdrops; bead rows; 29 bamboo clumps | Decorative; static | Delete `garden-rim-mesh.test.ts:70` bamboo=35 pin; `KARIKOMI_DOME_CAP`. **Near-duplicate of gm-4** (bamboo 35→3 groves; karikomi 80→40) |

Acceptance gates:
- **garden-1:**
  - `#t=12.25`/`17.6`/`22` at 3 viewports: pads cover 35–60% of the corner rect;
  - pads never touch tower, crown or inlet;
  - noon luma under pads ≤20;
  - drift ≤70 px over 9×12 s;
  - heron at crane islet in dusk capture.
- **garden-2:**
  - 16 px blur shows stacked dark horizontals;
  - vision pass says "pine/bonsai";
  - golden-hour warm sun-side rims.
- **garden-3:**
  - captures at DOY 95/200/310/330 plus a snow day;
  - maples differ at 310;
  - pines identical in all five.
- **garden-4:**
  - noon region 150–420×400–580 reads as one mass, luma ≈27 noon / 20 dusk;
  - rim pine nearest-neighbour spacing CV ≥0.6.
- **garden-5:**
  - stones read as set;
  - rake visible at golden, calm at noon;
  - no shimmer over 9 frames.
- **garden-6:** two moss greens, no khaki band.
- **garden-7:**
  - forced sheet (`#t=15`, 12×700 ms) shows one release and landing;
  - 30-min log ≤2 events.
- **garden-8:**
  - no spheres;
  - one continuous low wave;
  - bamboo appears once and not on the ridge.

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Near-garden threshold authored off-screen at every gate (bough 56° off-axis) | `noon.png` 0–420,700–1000 (cut hull, "T" sail), grey ~45–55 vs 15; positions listed in Verdict | `garden-rim-mesh.ts:919-923` | garden-1 | M |
| D2 | Pines read as lampshades (island) and palms (rim, ridge) | `crop-island-morning.png` 520–680×180–600, 0–500×30–440; `crop-1440-lefthill.png` 280–660×40–170; `wholemap-noon.png` rim | `garden-flora.ts:63` (`Cylinder(0.36,1,1,9)`), `:91`, `:94-98` | garden-2 | M |
| D3 | Autumn spends reserved vermillion on decoration | `crop-1440-lefthill.png` 450–620×160–200; `crop-island-morning.png` 480–680×180–340 | `garden-flora.ts:70,71`; `garden-island.ts:1386-1387`; `palette.ts:31-32` | garden-3 | S |
| D4 | Winter desaturates evergreen pads that carry the 30-day PSI record | — (code) | `garden-island.ts:1388-1390`; `garden-month-record.ts:41-53` | garden-3 | S |
| D5 | Far-west ridge is a black lump with toys on it | `crop-1440-lefthill.png`; `noon.png` 160–400×410–570 | `garden-rim-mesh.ts:337-344,355` | garden-4 | M |
| D6 | Ring planting evenly spaced by construction | `wholemap-noon.png` 480–1100×560–650 | `garden-rim-mesh.ts:708` | garden-4 | S |
| D7 | Reeds grow out of open sea | `noon.png` 255–485×740–850 | `garden-sea-edges.ts` (`garden-sea-edges-reeds`) | Root on a sand bar/stone lip, or delete at rest | S |
| D8 | Stones are eggs and chocolate chips; crane islet is flotsam | `crop-island-morning.png` 700–790×390–500, 1070–1150×490–600; `engawa-morning.png` 600–860×800–870; `crop-noon-crane.png` | `garden-rim-mesh.ts:787-788`; `garden-islets.ts:207-215` | garden-5 | M |
| D9 | Karikomi are gumdrops | `crop-island-morning.png` 840–1290×480–610 | `garden-flora.ts:115-116` | garden-8 | S |
| D10 | Engawa tōrō is a gold trophy by day | `engawa-morning.png` 925–945×700–730 | `garden-rim-mesh.ts:1102` | Dark hollow by day, `lantern_warm` only when lit | S |

### Subtractions
- Bamboo 35→6 clumps, off ridge and ring (garden-8; `garden-flora.ts:107-113`).
- Momiji on the ridge crest deleted; rim momiji halved 40→~16, grouped in 3s near water (`garden-rim-mesh.ts:1123-1128` counts).
- Always-on spring petal drift (`garden-seasonal-dressing.ts:42-101`), replaced by garden-7.
- Winter greying of evergreens (`garden-island.ts:1388-1390`, `:1040-1043`).
- Vermillion in flora (`garden-flora.ts:70-71`, `garden-island.ts:1387`).
- Engawa tōrō's always-lit gold fire box goes dark by day (`garden-rim-mesh.ts:1102`).
- 90 flat moss/gravel ground-decal quads (`garden-rim-mesh.ts:586-597`), superseded by garden-6.
- Waterfall: keep where it is and do **not** promote it into the rest frame (`garden-attract.ts:27`; `garden-waterfall.ts:28-45`).
- Open-water reeds (`noon.png` 255–485×740–850): root on a bar or delete at rest.

### Reversals
- W1.9 "foreground repoussoir" as implemented (`garden-rim-mesh.ts:912-986`; plan `01-implementation-plan.md:135`).
  - Evidence: projects to (−1691,1627); absent from `noon.png`.
  - Change: solve from screen targets per viewport and rig against breathing (garden-1).
  - Risk: fleet corner clearance.
- `createFloraPadGeometry` "tapered cone keeps negative space" (`garden-flora.ts:61-64`, W3.8).
  - Evidence: island parasols; palm read in 3 frames.
  - Change: the cone is upside down; niwaki are flat below.
  - Risk: tri/census re-pins.
- T2.2d "autumn momiji = vermillion" (`garden-flora.ts:71`, `garden-rim-mesh.ts:1108-1111`).
  - Evidence: `palette.ts:31-32` reserves vermillion.
  - Change: derived rust tones.
  - Risk: a less loud autumn (intended).
- Four-state meteorological season (`season.ts`), with W4.17 microseasons left as Ext.
  - Evidence: continuous per-tree calendar is the free poetic channel and untangles the season from the PSI pines.
  - Change: microseasons (garden-3).
  - Risk: test churn; needs a date seam.
- Slope→exposed rock everywhere (`garden-rim-mesh.ts:355`), made whole-hill by W1.8's 8–18 u ridge.
  - Evidence: `crop-1440-lefthill.png`.
  - Change: keep the hills, clothe them.
  - Risk: —.

Other cross-lane flags:
- Light: night vegetation ≤5 (green niwaki still visible in `night.png`).
- Water: ripple-ring/rake rhyme; reeds on bars.
- DataPoetry: don't tint pines elsewhere.
- Headroom: net ≈+3 draws, ≈+45k tris (≈425k of 500k), 0 textures.

---

## garden-master

Verdict: A harbour diorama seen from a drone. The eye hovers 20.6 u up, the tower is centred (x 0.50) and fills 58% of the frame height, and the bottom row is bright water with hulls. The authored engawa garden sits ~27 tiles out of frustum. `threshold-blue.png` (tower x≈0.75) is the calmest frame of the whole set.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| garden-master-1 | ★ | The engawa seat: the rest shot becomes the view from the veranda | Score `−(\|tx−0.66\|+\|ty_crown−0.21\|)+0.1·zoom`. Tower ≤0.38H, crown y∈[0.18,0.24], deck edge y∈[0.86,1.0], hero-pine crown x∈[0.08,0.35]. Target ≈(62–64,102–104) at zoom 0.88–0.92. Tsukiyama pocket r~10 tiles at (86,134) rising 6–8 u (eye 14–18 u). Move Polygon (110,131) and BSC (60,130) ≥30 tiles. Station exclusion 14→24 tiles; reject massing in the lower 45%. Delete invisible bough. Borrowed cone in sky gap | stunning 5 / poetic 5 / relaxing 5 | H framing; M flanks | L | −60 to −80 draws / −25k to −30k tris (observed 202 vs 283; 352k vs 380k) / ≈−0.8 ms CPU [INFERENCE] / 0 tex | `camera.ts:39,113,128,138-158,177-188`; `garden-rim-mesh.ts` ~377, `898-986`; `garden-rim.ts:137-138`; `garden-fleet-placement.ts:113-118`; `garden-horizon.ts` | Hovering rest; invisible bough; ~80 draws; two south-rim station positions | No analytic encoding. Re-verify W1.16 top-3 harbours in frame. Picking easier at 0.9. RM: identical static pose | Needs gm-4 pad geometry (hero pine is the near plane). Pins: `camera.test.ts`, `garden-rim-mesh.test.ts:433-487`, `garden-fleet-placement.test.ts:174-199`, dock-layout/chain-docks, attract postcards. Eye ≥14 u. Near rim must be crafted. **Conflicts with garden-1** (garden-1 keeps current rest). Harbour camera flag-tip re-key; fc-3 hero band assumes current camera |
| garden-master-2 | ★ | Ma that survives motion: the approach is untouched water | A\* inlet cost ×8 within halfWidth; impassable within halfWidth−6 except the crossing-token holder. ≤1 hull in the projected inlet, arrival/departure only, ≥6 min apart. Endpoints inside exit by shortest path. Delete or move the 3 reed banks | relaxing 5 / stunning 4 | H diagnosis; M routing | M | 0 / 0 / 0 / 0; static cost field baked at graph build | `motion-planning.ts` ~`950-990`; `garden-fleet-placement.ts:279,553,591`; `garden-sea-edge-sites.ts:136-138` | Transit through the approach; 3 reed tufts; share of concurrent motion | Berths, risk, counts unchanged (transit is animation). RM already berth-static | Hulls may queue into a wall at the inlet border. Route/motion test churn. South-rim harbours need an exit. Pairs with fm-4 (fewer movers) |
| garden-master-3 | ★ | The threshold keeps the hour and the season | Engawa boards receive pine and eave-post shadow. Tōrō fades in over 20 s at sun elevation −2°. Flora phenology table: momiji smoothstep 5–25 Nov on 3–5 specimens; cherry 28 Mar–10 Apr; higanbana ≤12 stems (vermillion) 18–30 Sep; susuki/hagi Sep–Oct; winter bare | poetic 5 / relaxing 4 | M | M | +1 draw (≤12 inst × ≤60 tris) / — / shadow unchanged if engawa is in the shadow frustum / 0 tex | `season.ts:7-15`; `garden-rim-mesh.ts:1094-1104,1126`; `garden-flora.ts:71`; `garden-seasonal-dressing.ts` | Vermillion on ~40 crowns; seasonal petal dressing (keep one or the other); grade as the only clock | Decorative, wall-clock only. Caption season word. RM: kindling is a state switch | Needs gm-1 (engawa in frame). `garden-flora.test.ts:35-40`. Tōrō stays an ember below the beacon. **Conflicts:** higanbana vermillion vs garden-3/gm-7; phenology table vs garden-3 continuous model. Dusk-event contention with pharos-4 and harbour-3 |
| garden-master-4 | | Plant like a gardener: fewer, placed, cloud-pruned | Pads become flattened domed ellipsoid clusters, 3–5 per branch, sy/sx≈0.25, underside ×0.55, aspect ≥1.3. Bamboo becomes a merged grove mass, 35→3 groves. Counts: pine 120→45 (odd 3/5/7 + 3 hero), karikomi 80→40 ō-karikomi, momiji 40→5, cherry 20→3. Specimens at viewpoints via `plantingTiles` | stunning 4 / poetic 4 | H | M | ±0 draws / −20k to −40k tris / — / 0 tex | `garden-flora.ts:62-64,107-113`; `garden-rim-mesh.ts:1123-1128` | ~180 specimens; palm read; coral-mushroom read | None. RM: sway off | Pins `garden-rim-mesh.test.ts:70-76`, `garden-flora.test.ts:18-30`, overview LOD lists. Prerequisite for gm-1. **Near-duplicate of garden-2** (pads), **garden-8** (bamboo/karikomi), **garden-4** (grouping). Count conflicts: bamboo 3 groves vs 6 clumps; momiji 5 vs ~16 |
| garden-master-5 | | Sabi: let the hero be old | Runtime `onBeforeCompile` streaks in `applyLighthouseRimLight`: −0–18% albedo, column hash `floor(worldXZ·3)` × exp falloff under cornices. Base <3 u lerps `stone_dark` + moss. `GILT` (`garden-lighthouse.ts:85`) → verdigris; emissive 0 by day, dusk ≤0.4 | stunning 3 / poetic 4 | M | S–M | 0 draws / — / ~+0.05 ms [INFERENCE] (×4 DPR2) / 0 tex | `garden-lighthouse.ts:85` (rim-light chain); `garden-day-cycle.ts:376` | Gilt glow by day; pristine albedo | Weathering constant, never keyed to PSI; lamp/PSI untouched | Statue-gleam tests; GLB and shell must match. **Near-duplicate of pharos-5** (generator bake, 0 ms) **and pharos-7** (bronze, not verdigris) |
| garden-master-6 | | Stone, water and plant on the headland: Sakuteiki, not a planter | Suhama pebble strip on the lee half + 3 bank stones on the weather half. Sanzon triad at court SW, 1:0.6:0.4, leaning 8–12° toward tower. Delete egg stone. Break the box cliff into 3–5 offset slabs with moss cap | stunning 3 / poetic 4 | M | M | +0–1 draw / +3k to +6k tris / — / — | `garden-precinct.ts:70,73` | Ring pads; egg stone; box edge | None | `garden-island.test.ts` pins. **Near-duplicate of garden-5** (triads) **and pharos-2** (pharos deletes the box outright, gm breaks it) |
| garden-master-7 | | Costume audit: no torii, one red | Landing torii → 2 rough standing stones + kutsunugi step. Delete islet torii. Identify red spar; if `warning-buoy`, keep only at alert water | poetic 4 / relaxing 3 | H | S | −2 draws / ~−600 tris / — / — | `garden-island.ts:1703-1738`; `garden-torii.ts`; `garden-islets.ts:250`; `garden-sea-edges.ts:427`; `garden-harbor-life.ts:241` | 2 monuments; most of the red | Danger-water vermillion and semantic buoys stay | Re-home gull perch. Tests `garden-torii.test.ts`, `garden-island.test.ts:430-439`, `world-renderer.test.ts:1151-1180`. **Conflicts with harbour-2**, whose acceptance uses the torii as the red reference |
| garden-master-8 | | The sound of water (opt-in, muted by default) | Near-water bed tied to the seat: lapping, 1 timber creak/min, far rigging. No music, no shishi-odoshi. ≤3 voices, ≤5 MB, suspended on hidden tabs | relaxing 4 | M | L | 0 GPU / ≤5 MB | — (no AudioContext in `src`) | Nothing visual | No meaning; explicit opt-in; motion pref ≠ audio consent | D11 Ext; 3–5 days tuning; overlaps the sound lane |

Acceptance gates:
- **gm-1** (`#t=12.25`/`18.8`/`22`, 3 viewports):
  - bottom band grey ≤20 at noon;
  - tower foot x∈[0.62,0.70], height ≤0.38H;
  - no station mass in the lower 45%;
  - blur-audit approach is one calm region.
- **gm-2:** 9×4 s sheet with ≤1 hull inside the inlet in every frame.
- **gm-3:**
  - `#t=15` vs `#t=17.6`: shadow displaced on the boards;
  - `#t=18.8`: tōrō lit, with reflection;
  - 26 Sep fixture: only higanbana is red.
- **gm-4:**
  - no tuft-on-stick silhouettes;
  - rim reads as 3–5 masses in blur-audit.
- **gm-5:**
  - streaks read at 1440p;
  - statue not the brightest warm pixel at noon.
- **gm-6:**
  - no pond ring;
  - triad legible;
  - path hidden, then revealed.
- **gm-7:**
  - no gate;
  - ≤2 vermillion regions outside danger water.
- **gm-8:**
  - 30-min listen with no loop seam;
  - silent in hidden tabs.

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | No threshold: viewer hovers, tower is a centred billboard; bough invisible | `noon.png` tower y 0.07–0.65 (58%) at x 0.50; bottom row grey ~45 vs plan 15/38/23; engawa at x≈−0.55; bough absent in `noon`, `noon-1440p`, `compact-1200x640` [INFERENCE] | `camera.ts:39,128,177,179`; `garden-rim-mesh.ts:126-143,673,919-937,1076-1104` | gm-1 | L |
| D2 | The ma fills whenever anything moves; reeds sit in the ma | `noon.png` barge 960–1180×815–890, six hulls 760–1280×700–800; `rest-noon-motion.png` ≥5 hulls lower-centre; reeds 255–490×740–850 | `garden-fleet-placement.ts:279,553,591` (motion-planning has no consumer); `garden-sea-edge-sites.ts:136-138` | gm-2 | M |
| D3 | Shore reads as a tropical atoll (bamboo palms, parasol pines, mushroom maples) | `noon.png` 160–380×405–470; `threshold-noon.png` 190–470×580–890; `island-golden.png` 440–640×610–830; `selected-ship.png` 1060–1560×640–780 | `garden-flora.ts:62-64,71,93-98,107-113` | gm-4 | M |
| D4 | "Transient" OpenDollar USDO nameplate never leaves | ≈430–575,575 in dawn/morning/golden/blue/night/deep-night/sea-sign-hover; `threshold-blue.png` 750–890,560 | `harbor-label-chips.tsx:31,50` [INFERENCE; not traced] | Audit arrival-beat lifecycle; hard timeout ≤20 s | S |
| D5 | Birds parked on the hero's crown; frozen smudges under RM | `noon.png` 835–885,55–105; `morning.png`/`sea-sign-hover.png` 795–830,105–135; `reduced-noon.png` 820–870,75–120 | — | ≥60 px screen exclusion disc around crown; perch under RM | S |
| D6 | Night beam smudge; two floodlit water stripes | `night.png` 690–745,215–290; `deep-night.png` 820–895,205–290; stripes `night.png` 70–560×740–800, 1090–1568×640–700 | — | Fade beam toward camera (atmosphere/water lanes) | S–M |
| D7 | Gilt god glows at noon and floats lit at night | `noon.png` 775–795×70–110; `night.png` | `garden-day-cycle.ts:376` (`0.22+dusk·0.94+night·0.12`) | gm-5 | S |
| D8 | Two white hot-spots at island foot, brighter than lantern windows | `threshold-blue.png` 1245–1345,650–668 (own capture; owner unconfirmed) | — | Clamp to ember level | S |

### Subtractions
- Three calm reed banks in the inlet (`garden-sea-edge-sites.ts:136-138`).
- `ship-wake-detail` 1-px GL_LINES hairlines, 84 of 279 draws: nothing at rest, soft wake only on moving hulls; ~0.9 ms CPU [INFERENCE] (no file:line given; see fm-3 `garden-ships.ts:2847-2858`).
- Invisible foreground bough mesh (`garden-rim-mesh.ts:898-986`).
- Both torii (gm-7; `garden-island.ts:1709-1738`, `garden-torii.ts`).
- Egg stone and ring of pond pads (gm-6).
- Gilt statue daytime emissive (`garden-day-cycle.ts:376`).
- Birds over the crown, and birds frozen mid-air under RM.
- Stuck USDO chip (`harbor-label-chips.tsx:31,50`).
- 180 of 295 rim specimens; 32 of 35 bamboo clumps (gm-4; `garden-rim-mesh.ts:1123-1128`).
- 40 vermillion momiji in September (gm-3; `garden-flora.ts:71`).

### Reversals
- "Rest at harbour view" (ledger 2026-09-06) as implemented by a zoom-maximising search (`camera.ts:177`).
  - Evidence: tower 58% at x 0.50 in every beat; `threshold-blue.png` shows the alternative.
  - Change: an authored engawa seat (gm-1), per W1.2.
  - Risk: camera/rim/placement tests, postcards, station slots.
- Landing torii (W1.12) and garden torii (W5.5).
  - Evidence: `island-golden.png`, `threshold-blue.png`; PRODUCT.md costume anti-reference; plan §6 rejects "more torii".
  - Change: stones do the same threshold work.
  - Risk: gull perch, tests.
- Meteorological flora seasons (`season.ts:7-15`) and W4.17 deferral.
  - Evidence: 40 red maples on 1 Sep.
  - Change: a small phenology table for threshold flora only (gm-3).
  - Risk: season tests.
- Whole-map zoom-out to 0.28 (operator decision).
  - Evidence: `wholemap-noon/dusk` show a square plate in open ocean with a palm ring.
  - Change: floor zoom ≈0.5 and leave overview to the DOM ledger. Lower confidence; operator decides.
  - Risk: remote-harbour discovery; 0.28 draw-budget tests.

Other cross-lane flags:
- Golden hour is a single orange wash; it needs raking value structure (gm-3 shadow helps).
- Shadow-camera near-caster margin for the engawa.
- Headroom: gm-1 plus the wake subtraction free ~150 draws.

---

## harbour

Verdict: A toy set, not a town. Nine archetypes each carry a 13.3–21.5 u tower beside the 38 u Pharos. Brand flags are 6–8 u wide; Ethereum's top sits at ~29 u, level with the 30.2 u beacon. Five brand fields (Tron C0.256, Base 0.263, Solana 0.256, Polygon 0.225, Avalanche 0.204) exceed vermillion's C0.177.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| harbour-1 | ★ | One harbour vernacular: low, roof-dominant, charred timber, plaster and kawara | `secondLevelTop` 8.5–11.5 u (Ethereum 13.5). Hatago: 2-storey irimoya, eave 1.2 u. Storm-mole: no tower/merlons, ishigaki batter 0.25, low kura. Tea-house: moon window to ground gable, no loft. Reed boathouse: no drum/dome. Pigeonnier: no cote. Ethereum: open hinomi-yagura (4×0.3 u posts, top 13.5), hall ridge 9.2→10.4, eave +0.8. One plaster (tint 0.22→0) with a 38% charred-timber lower band. Roofs: kawara / storm slate / ETH copper only. Gangi quay-nose helper | stunning 4 / relaxing 5 / poetic 3 | H | M (2–3 days) | 0 / −4k to −8k / ≈0 / 0 | `dock-layout.ts:16-33`; `garden-docks.ts:459-469,498-502,936-958,1016-1033,1126-1139,1201-1204,1264-1275,1294-1300,1311-1325,1341-1363`; `garden-docks.test.ts` ~200-206 | 5 towers (campanile, storm tower, tea loft, cote, thatch dome), crenellations, 6 roof hues, per-station wall tint | Footprint still follows supply; height was already data-independent; DOM unchanged; static | Rest solver `camera.ts:70-79` flag tip y=26 must be re-keyed (may move rest seat). Whole-map findability relies on harbour-2 + berths. Hatago must not become a 2nd pavilion |
| harbour-2 | ★ | Undyed nobori with a muted mon, breathing in the shared wind | `PlaneGeometry(1,3.2,4,14)` portrait + L-pole. Scale `(0.95+0.25·supply)`, no 4.2× (~1.0–1.2 × 3.0–3.8), tip ≤13.7 u; Ethereum gets a *pair*. Shader: `uTime`/`uWindYaw` + per-frame `aGust`; `w=uv.x^1.4·(0.35+0.65·(1−uv.y))`, `z+=w·(0.05+0.11·gust)·sin(…)`, 2nd octave ×2.3/0.3, analytic normal. Delete 9-shape discard/`aFlagShape`. Kinari field; ink L0.40–0.50, C≤0.10; 14 px chichi band. Flags use the sail night-value path | stunning 4 / poetic 4 / relaxing 5 | H | S–M (1–2 days) | 0 / +~450 / ≈0 [INFERENCE] / 0 (repainted 512² atlas); ΔCPU slightly negative | `garden-harbor-batch.ts:340-379,343-352,424-434`; `dock-layout.ts:234,243-270`; `garden-chain-flag.ts:190-202,220-278`; `world-renderer.ts:4489-4505` | 4.2× multiplier, 9 cuts, brand-saturated fields, rigid board; cloth area −75% | Identity via mark silhouette, hue family, DOM ledger; initials fallback. RM: uTime 0, gust 0.35 pose | Camera flag envelopes tip 26→≈14, reach ±6→±1.5. Delete `garden-docks.test.ts:203-204` pins; add test "ink C < vermillion C". Derived `flag_kinari`. Fleet sail night factor / `MARK_MIN_PRESENCE`. **Conflict with gm-7:** acceptance compares Tron to the torii, which gm-7 deletes |
| harbour-3 | ★ | Kindling the harbour: one stone lantern per station, lit in the keeper's walk | One lantern per station on the quay nose at `QUAY_TOP_Y`, camera side, seaward 0.5–1.1, tangent 1.2–2.6 jitter. Skip ~3 of 10 in the dark terrace arc. Merged kasuga ≈1.8 u (base r0.38, shaft r0.14 h0.7, fire-box r0.22 h0.34 emissive, kasa r0.46, hōju) with moss top. Keeper fixture lighting on window + lampHead. Retire station lampHead pairs (keep Mole portal). Remove `quayLitEdge`. Moon window → kumiko, glass 0.84→0.62. One 0.9×1.1 shoji per station | poetic 5 / relaxing 4 / stunning 3 | M–H | M (2 days) | 0 / ≈+300 net / ≈0 / 0; water light lanes −50% | `garden-docks.ts:211-260,372-386,901,1136-1138,1384,1427-1431,1922-1936`; `garden-lanterns.ts:23-83`; `world-renderer.ts:3535-3536` | ~13 of 20 water lanterns, ~18 post lamp heads, LED edges, amber disc | Decorative. RM: phase end-state (`gardenKeeperFixtureFactor`) | Keeper path must reach/order the harbour ring (Life). Dark arc from rim lane. Re-pin `garden-docks.test.ts:546-549` lanes 2→1. One lit shoji always. Dusk contention with pharos-4 and gm-3 |
| harbour-4 | | The anniversary lantern: one tōrō drifts from its wreck at dusk | Nightly: one grave whose death month = current month, rotated by `stableUnit(gridDate)`. Launch at dusk 0.35; drift 18–28 u on wind over 150 s, ±0.6 u meander at 0.07 Hz. Emissive 1.15, fading over the last 40 s; 0.28 u paper cube on a 0.4 board. Wreck algae band on bottom 25%, `#2f443c` | poetic 5 / relaxing 4 / stunning 2 | M | S–M (1 day) | 0–1 / <50 / ≈0 / —; light lanes 0 (existing cemetery lane follows it) | `garden-landmarks.ts:78-107,870,882-902`; `world-renderer.ts:3166-3170`; `shared/data/dead-stablecoins.json` | Static cemetery light-lane position; per-hull mourning pennant | Encodes "died this month". DOM line "Remembered this evening: …" + live-region announcement. RM: lit beside wreck, no drift | Director beat slot (Life). June's 21 deaths still launch only one |
| harbour-5 | | Clear the graveyard cove | Storm mole lowered and banner shrunk (harbour-1/2). Remove per-hull 0.82 u marker stone; cause stain becomes a 0.12 u band at C≤0.05 on the bow stem. One cluster of 5–7 moss-capped stones 0.3–0.9 u at the shoal heart | poetic 3 / relaxing 3 | M | S | 0 / −1k / — / — | `garden-landmarks.ts:705-707` (`wreckFormGeometry`) | ~18 upright gravestones → one cluster | Cause stain kept per grave; DOM unchanged; static | Re-pin `garden-landmarks.test.ts:190-232` (wreckRole-4). Needs harbour-1 and harbour-2 |
| harbour-6 | | Station smoke and noren join the same wind | Noren move into the flag instanced mesh as 0.6×1.4 top-pinned strips (harbour-2 shader). `weather.wind` drives smoke drift direction | relaxing 2 / poetic 2 | M | S | 0 / — / ≈0 / — | `garden-docks.ts:1047-1058`; `garden-station-smoke.ts:34-35`; `world-renderer.ts:4503` | Frozen noren ripple; second wind direction | None. RM: pinned pose | Needs harbour-2. One authoritative wind (weather) |

Acceptance gates:
- **harbour-1:**
  - `#t=12.25`: nothing above the treeline in the left third; sky 0–500×280–500 clear;
  - `sel=dock.ethereum`: one family, roofs only {grey, slate, copper}, no shaft taller than its roof;
  - wholemap: Pharos is the only vertical.
- **harbour-2:**
  - no flag pixel above the lower-gallery line;
  - Tron chroma < torii;
  - 9×500 ms sheet shows travelling folds with shared phase;
  - `#t=22`: banners dimmer than the nearest sail.
- **harbour-3:**
  - `#t=22`: ≤1 lantern + ≤1 shoji per station, no emissive line, no light >12 px, western arc dark;
  - `#t=18.3` 12×5 s sheet: sequential kindling;
  - blur-audit: no necklace.
- **harbour-4:**
  - `#t=18.2`, 10×15 s sheet: one lantern leaves and fades, DOM line present;
  - 0-death month: nothing happens.
- **harbour-5:** `#t=17.9` full tier shows hulls + one cluster.
- **harbour-6:** noren, banner and smoke lean together.

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Chain flags out-shout vermillion (5 brands C>0.177; Tron H28° C0.256; ETH/ARB/BSC ~0.165) | `wholemap-noon.png` Tron (1195,388); `eth-noon.png` BSC yellow (880,390) | `garden-chain-flag.ts:190-202` | harbour-2 | S |
| D2 | Flags are monuments: 6–8 u wide; ETH ~8.1×5.4 u, top ≈29 u vs beacon 30.2 u; rest solver routes around them | `noon.png` ETH flag 95–180,290–355 larger than near sails (1080,800) | `dock-layout.ts:249-250`; `garden-observatory-slice.ts:45`; `camera.ts:70-79,133-158` | harbour-2 | S |
| D3 | Every station is a tower, each a lid on a shaft (roof 5–14% of elevation) | `eth-noon.png` 4 towers + 4 flags picket; `noon.png` Base hatago silo (445,380-540) | `garden-docks.ts:1311-1325,1016-1033,1126-1139,1342-1360,938-956` | harbour-1 | M |
| D4 | Flags are the most legible harbour object at night | `night.png`/`deep-night.png` ETH flag 100–180,290–355; `eth-night.png` BSC 850–910,370–410 | — | harbour-2 night value clamp | S |
| D5 | Night harbour: dark blocks, an amber clock-face disc, LED strips, symmetric lamp necklace in the water | `eth-night.png` disc (858,495), strip 760–1000,515–520 | `garden-docks.ts:1136-1138,1384,901,211-259` | harbour-3 | M |
| D6 | Graveyard barely exists in the picture | `cemetery-dusk.png` (recovery tier, composition only) storm tower dominates, one lantern hull (≈670,720); `wholemap-noon.png` ≈250,500 | `garden-landmarks.ts:882-902` | harbour-4 + harbour-1 storm-mole lowering (harbour-5) | S–M |

### Subtractions
- Storm-mole crenellated merlons (`garden-docks.ts:1294-1300`).
- Reed-boathouse drum and thatch dome (`garden-docks.ts:1264-1275`).
- TON station cote (`garden-docks.ts:1341-1363`).
- `quayLitEdge` emissive strips (`garden-docks.ts:901`, `:1384`).
- Symmetric water-standing lantern pairs (`garden-docks.ts:211-259`) and per-station `lampHead` pairs (`:372-386`).
- Nine flag-shape discards and `aFlagShape` (`garden-harbor-batch.ts:381-393,424-434`).
- `WALL_ROOF_TINT` (`garden-docks.ts:498`).
- Straw thatch `#e2ae43` and cote clay `#d47636` as station roofs (`garden-docks.ts:459-469`).
- Per-hull cemetery mourning pennant (`garden-landmarks.ts:870`, slot 1).

### Reversals
- 2026-09-05 "Enlarge station vertical silhouettes and flags, not footprints" (ledger row 22; `dock-layout.ts:11-33`; `HARBOR_FLAG_SCALE_MULTIPLIER` 4.2).
  - Evidence: built for the retired ortho rest; 29 u flag vs 30.2 u beacon; picket of towers; solver bent around flags.
  - Change: one hero, "no other monument".
  - Risk: whole-map findability (ledger and berths mitigate).
- 2026-09-07 "Identity lives on rooftop flags" (ledger row 25).
  - Evidence: chroma above vermillion for 5 chains; flags loudest at night.
  - Change: keep identity-on-cloth, but as a muted mon on small nobori.
  - Risk: weaker glance ID (DOM canonical).
- Clone-separation contract (`dock-layout.ts:16-22`, `garden-docks.test.ts`).
  - Evidence: it legislates difference, the opposite of a vernacular.
  - Change: delete, don't re-pin (it pins incidental implementation).
  - Risk: —.

Other cross-lane flags:
- **Camera:** `sel=grave.ust-terrausd-2022-05` never moved the camera (`cemetery-golden.png`), so a grave selected from the ledger is never shown (`garden-observatory-slice.ts:371`).
- **Water/sea-edges:** a 140 px vermillion warning-buoy pole in `noon.png` (≈235,600-740). This is the same object as gm-7's "red spar".
- **Flora:** rim "palms".
- **Palette:** add `flag_kinari`, `timber_charred`, and the muted-ink clamp.

---

## fleet-craft

Verdict: The fleet reads as signage. `rectangle` sails (~half the fleet) are built from the mast outward with head and foot spars, so they read as banners. The dye pipeline shifts blues +13° (39% chroma kept), leaves 34% grey, forces 13% black, and squeezes L into 0.54–0.73. The far LOD beyond 150 u is pale planks, making a far band of L\*68 against a 42 target.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fleet-craft-1 | ★ | Re-hang the square sails: cloth on a yard, not a flag on a pole | `rectangle` spans x∈[−w/2,+w/2], centred on the mast. Delete foot spar; head yard 1.08·w. Concave foot `y+=0.12·h·sin(πu)` (row above 0.05). Belly depth 0.24·w, fullest at u≈0.38 (`sin(π·u^0.8)`), v≈0.55. Head sag 0.03·h; 8% trough shading baked. Brace ±(30°–40°) via `stableUnit(id.brace)` when moored (30° on heroes). Keep `aSailHead`. Identity oversize 1.2→1.1 | stunning 5 / poetic 4 / relaxing 4 | H | S–M | 0 / −1 per near ship / ≈0 / 0 | `garden-ships.ts:1948-1963,1957,2594-2698` (2608-2612, 2638, 2654, 2670-2686); `GARDEN_SHIP_RIGS` | Flag read; foot boom; half the 1.2 identity oversize | Same atlas mark cell. RM: static hashed brace | fm-6 drives brace from apparent wind when under way. Mark foreshortens cos35°≈0.82. Castle pin `:2084-2088`. `deformFleetSailVertex` CPU twin |
| fleet-craft-2 | ★ | One dye book: hue-locked OKLCH ladder for all cloth | Keep H exactly. `L′=clamp(0.30+(L−0.20)/0.60·0.56,0.30,0.86)`. `C′=min(0.8·C,ceiling(H))`, ceilings: red 0.13, orange 0.12, ochre 0.10, green 0.085, teal 0.08, indigo 0.11, violet 0.09. Neutrals (C<0.035) → kinari (H≈80, C0.012) if L′≥0.55, else sumi (C0.008). Delete lift/floor/restraint/pirate branch. Apply to strake + pennant. Simulated: median C 0.043→0.085; L p10–p90 → 0.37–0.82; grey 88→38 | stunning 4 / poetic 4 / relaxing 4 | H diagnosis; M constants | S | 0 / 0 / 0 / 0 (build-time CPU) | `garden-sail-texture.ts:39-58,90-117,263-270`; `batchedTrimColor` | Lavender cast; grey third; forced-black eighth | Hue better preserved; mon + DOM carry identity | Re-prove two-issuer separation gate (~0.30). Needs fc-3 to quiet the far fleet. **Tension with harbour-2** (flags ink C≤0.10; some cloth ceilings are 0.11–0.13). Shared "derived dye table" rule |
| fleet-craft-3 | ★ | Far fleet as ink silhouette; a hero-few ladder | Far extrude 0.72→0.35 with keel-tint top. Family outline sails (braced trapezoid with concave foot / triangle / 5-pt fan). Far `markVisibility=0`. `sailCloth=mix(fogColor·0.55,dyed,0.22)`, `hull=fogColor·0.42`, easing to fog by aerial. Hero band = nearest 16 + attention, 0.35 s hysteresis, packed in `aSailAttention.y` (`presence+2·hero`). `MARK_MIN_PRESENCE` 0.45→0.3. Hover promotes. 0.3 s tone cross-fade | stunning 4 / poetic 5 / relaxing 5 | M-H | M | 0 / ≈+1k (≈−30k if ~35 ships move near→far) / slightly negative / 0; sort ≤184 floats ~0.01 ms [INFERENCE] | `garden-ships.ts:1973-2035`; `garden-fleet-batch.ts:283,291,990-991,1070-1073,1195-1222,1526-1535` | Plank field; far mark blots; far dye clutter | Size still carried by silhouette scale; ledger/search list every ship; RM same LOD | fc-4 sun colour; Light fog-colour uniform; fm-2 heave on far instances; no far wakes. Hero band assumes current rest camera (**gm-1 changes it**). Prerequisite for fc-7, fc-8 |
| fleet-craft-4 | | Backlight as shoji: sun-coloured transmission, blocked by ink | Replace wrap with `transmit=sailCloth·uSunColor·(facing·(0.35+0.65·through))·uBacklight·0.55·(1−markCover·0.85)`, `through=pow(dot(eye,−sun),2)`. Keep `FLEET_CLOTH_RADIANCE_CEILING` | stunning 5 / poetic 5 / relaxing 3 | M | S | 0 / 0 / ≈0.01 ms (×4 DPR2) [INFERENCE] / 0 | `garden-fleet-batch.ts:168-172,1044-1047,1221` | Self-coloured wrap term | Decorative; mark gains contrast; hour-driven | Light publishes `uSunColor`. If `NOON_BEARING` rotates ~−45°, accept at `#t=6/17.6/18.8`. Backlight test pins |
| fleet-craft-5 | | Cloth that reads at rest: panel strips replace the gingham weave | Weave fade zooms → 1.5/2.1. Fragment panel seam 0.09, alternate 0.03, `fwidth` fade `smoothstep(0.15,0.3)`. Panel count in vertex-colour b (bezaisen 9, takasebune 6, others 0); `diffuseColor.rgb*=vColor.r`; every sail writes b. Remove 3-panel vertex seam | stunning 3 / poetic 4 / relaxing 4 | H | S | 0 / 0 / ≈0 / 0 | `garden-fleet-batch.ts:241-243,1001-1013`; `garden-ships.ts:2729-2735`; `mergeAtlasSails` | Gingham; vertex seam | Decorative; seams recede under mark | 16-attribute cap. `GARDEN_SAIL_SEGMENTS_*` pins. Moiré (fwidth fade mandatory) |
| fleet-craft-6 | | Toy → craft: bezaisen proportion and a low yagura | Half-beam 2.0→1.3 (L/B≈2.7); stem 3.45→3.9; `sheerBow` 0.18→0.42. Castle {h2.4,w2.2,z2.75}→{h1.05,w3.1,z2.2} at x−2.1, with 0.08 dark eave. Stern rudder 0.12×1.6×1.1. Update far geometry and `GARDEN_HULL_MAX_X_REACH_WORLD` | stunning 4 / poetic 3 / relaxing 3 | M-H | M | 0 / ±0.5k / 0 / 0 | `garden-ships.ts:292-297,2437-2440` | Cube cabin; bathtub plan | Family meaning unchanged; hull-form channels still multiply | Weaker peg-grade beam read. Castle centerY pin; berth footprint tests |
| fleet-craft-7 | | Lanterns that hang: no daylight discs, one stern lamp on a post per family | Zero-scale non-hero cores when emissive <0.25; hero core `#000→#d9c9a8`. Per-silhouette stern position (stern x +0.15, rail +0.55). Stern pole drawn in fc-8 LineSegments. No `MID_LANTERN` on titans at rest | relaxing 3 / poetic 3 | H | S | 0 / −2.5k / 0 / 0 | `garden-ships.ts:377,1482-1664,1527-1532`; `garden-day-cycle.ts:423` | 244 floating discs; mid lantern | Decorative; attention warmth unchanged; RM static | Needs fc-3 hero set and fc-8. Lantern count tests. Light owns ember budget |
| fleet-craft-8 | | Standing rigging for the hero band only | One `LineSegments` rewritten per frame from `riggingPoints(silhouette)` × hero root/hullForm for the top 16. Mast tint ×0.8, fog-affected. Skip the rewrite if no pose changed | stunning 3 / poetic 3 | M | M | +1 draw (~11 µs) / ~0 (~450 verts) / JS ≈0.02–0.04 ms/frame [INFERENCE] / 0 | `garden-ships.ts:2763` | Pennant on non-hero ships | Decorative; RM frozen pose | Needs fc-3. MSAA stays on. The only per-frame JS item in the report; funded by the wake subtraction |

Acceptance gates:
- **fc-1:**
  - no card with parallel rails;
  - yard, curved foot and belly visible;
  - mon legible on the 3 nearest hulls.
- **fc-2:**
  - median C ≥0.07;
  - blue hue drift ≤3°;
  - L p10–p90 span ≥0.4;
  - no lilac at `#t=12.25`.
- **fc-3:**
  - no pale plank;
  - right-middle ninth ≤55 L\* at noon;
  - blur-audit shows one dark band;
  - 3 nearest hulls keep their mon.
- **fc-4:**
  - `#t=17.6`: warm cast with a darker mark;
  - `#t=12.25` unchanged.
- **fc-5:**
  - no checker;
  - strips on the 3 nearest square sails.
- **fc-6:**
  - no box-on-tub at 2560;
  - hulls read long, with a raised stern.
- **fc-7:**
  - no dark dots at `#t=12.25`;
  - `#t=22`: lanterns sit on sterns.
- **fc-8:**
  - rigging visible on the nearest 3–5 hulls;
  - none beyond the inlet.

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Square sails are flags or hanging scrolls (one-sided leech + head/foot spars; identity 1.2×) | `crop-noon-left.png` ("X", "S", ¥ cards; "X" ~260,640 in `noon.png`); `crop-noon-near.png`; `g3200-left.png` | `garden-ships.ts:2608-2612,2638,2670-2686,1957` | fc-1 | S–M |
| D2 | Far fleet is floating planks with cards; far band L\*68 vs 42 | `crop-1440-right.png`, `g3200-right.png` | `garden-ships.ts:1988,2014-2017`; `garden-fleet-batch.ts:283,990-991` | fc-3 | M |
| D3 | Dye pipeline makes lavender and grey noise (median C 0.043 vs 0.117; 88 grey, 33 black; blue +13°) | `noon.png` right-middle; `crop-golden-left.png` | `garden-sail-texture.ts:95,103,104-115` | fc-2 | S |
| D4 | Gingham weave always on at rest (full at zoom ≥1.12; rest zoom 1.15) | `g3200-left.png` ~700,165–270 and ~515,405–485; `crop-golden-left.png` ~700,60 | `garden-fleet-batch.ts:241-243`; `camera.ts:39` | fc-5 | S |
| D5 | Golden hour: sails glow in their own cold dye (no sun colour, no view term; also on far cards) | `golden.png`, `g3200-right.png` | `garden-fleet-batch.ts:1044-1045,1221` | fc-4 | S |
| D6 | Black discs float off every stern by day (244 cores; shared `STERN_LANTERN` x=−3.05) | `crop-noon-left.png` ~568,103 / ~752,108 / ~1147,143; `crop-noon-near.png` ~683,283; `g3200-left.png` ~435,385 | `garden-ships.ts:377,1527-1532`; `garden-day-cycle.ts:423` | fc-7 | S |
| D7 | Bezaisen (~25% of fleet) is a box on a bathtub (L/B 1.73; 2.2×2.4×2.75 cube castle) | `g3200-left.png` ~310–450,420–510 and ~1000–1090,420–500; `crop-noon-left.png` | `garden-ships.ts:2437-2440,297` | fc-6 | M |
| D8 | Neon strake (brand ×1.25) and purple hero hulls (30% brand lerp) | `crop-noon-near.png` ~240–390,140–240 and ~570–700,190–240 | `garden-fleet-batch.ts:60,775-778`; `garden-ships.ts:648-651,1132-1135,576` | See Subtractions | S |

### Subtractions
- Foot spar on `rectangle` sails (`garden-ships.ts:2670-2686`, `spar === 1`). The boom stays for fore-aft rigs.
- Far-LOD mark: `markVisibility`→0 in the far material (`garden-fleet-batch.ts:990-991`).
- `GUNWALE_TINT` 1.25→1.0 on the strake, strake through the fc-2 ladder (`garden-fleet-batch.ts:60`).
- Hero hull brand lerp 0.30→0.12 (`garden-ships.ts:1132-1135`; matches `:576`).
- Masthead pennants beyond the hero band (`batchedPennantColor` `:697-706`). Needs DataPoetry sign-off.
- Thread weave at rest: fade zooms to 1.5/2.1 (fc-5; `garden-fleet-batch.ts:241-243`).
- Daytime lantern cores on non-hero ships (fc-7; `garden-ships.ts:1527-1532`).
- `MID_LANTERN` on titans at rest (`garden-ships.ts` lantern table `:377-416`).

### Reversals
- Pirate rule, black canvas for pale brands (`PIRATE_CONTRAST_FLOOR`/`SAIL_DARK_CANVAS_ISSUERS`, `garden-sail-texture.ts:63-115`; H1/D5; ledger "pirate-contrast floor").
  - Evidence: its premise ("marks are white") died when the mon ink started being chosen by contrast (`:263-273`); 33/256 issuers fly unrelated black.
  - Change: fc-2 ladder.
  - Risk: sail-texture tests; the no-flash property still holds (pure function).
- Linear cream lift + chroma restraint (F1 `CLOTH_CANVAS_LIFT` 0.17; 2026-09-07 `CLOTH_CHROMA_RESTRAINT` 0.3).
  - Evidence: dye census.
  - Change: the OKLCH ladder raises median chroma and keeps hue exact.
  - Risk: re-prove the separation gate.
- W3.1 "yard + boom on rectangle rigs".
  - Evidence: D1 (the boom makes the scroll).
  - Change: Japanese square sails are sheeted from the clews; booms only on fore-aft rigs.
  - Risk: test pins only.
- W3.6 far variant, "single quad, marks at `MARK_MIN_PRESENCE`, chroma −25%".
  - Evidence: planks; L\*68 band.
  - Change: a desaturated card is not a silhouette; use the fc-3 outline with no mark.
  - Risk: far identity depends on hover.

Other cross-lane flags:
- Wakes: headroom's 84/279 `ship-wake-detail` hairlines. Limiting them to the hero band frees >60 draws (see fm-3 and the gm subtraction).
- Light owns lantern/ember intensity and agreed not to retune `uBacklight`.
- ArtDirector/Critic: palette sign-off on the dye ceilings.

---

## fleet-motion

Verdict: Anchored hulls pirouette because their heading comes from a Lissajous tangent: calm 0.55 turns/min, danger 3.6, peaks 995–5 215 °/s. Heel and pitch come only from a 10-min tide sine (≤0.6°), so hulls sit rigid on a moving sea. Wakes are 1-px whiskers costing 84 draws.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fleet-motion-1 | ★ | Ride to the anchor; swing at the turn of the tide | `S=w·windDir+c(t)·currentDir`, `c=cos(berthTidePhase)` (600 s), w 0.45, amp 0.8. `ψ=atan2(−S)` through a critically damped filter, ω 0.12 rad/s, cap 4 °/s. Rode r=0.35·hullLength. Sheer A/T: calm 2°/70 s, watch 4°/55, alert 7°/40, warning 11°/30, danger 16°/22; surge ±0.04·A/16 tiles. 12 s entry blend. Slack hush: no voyage boundaries within ±30 s of a turn (6 of 60 slots) | relaxing 5 / poetic 5 / stunning 3 | H | M | 0 / 0 / CPU ≤0.05 ms [INFERENCE] / 0 | `risk-drift.ts:76-157`; `open-water.ts:104-131`; `motion-planning.ts:29-37,758-789`; `mooring.ts:91,109`; `motion-config.ts:50-52`; `resolve.ts:19-24,39` | Lissajous pirouette and heel flicks; 0.07–0.6-tile rest orbits; ±2° dock yaw sine | Risk band stays ordinal via sheer (update copy). Tide is scenery (say so in the reading guide). RM: bow-to-wind, rode, zero sheer | Register as a director environmental beat (Life). Per-berth lag 0–24 → up to 0–45 s. Clamp rode by anchorage separation. `motion.test.ts` pins. Base for fm-7 rest raft |
| fleet-motion-2 | ★ | Let the swell pass through; heel to the wind | Move `sampleGardenGerstner`/`GARDEN_WATER_GERSTNER` to `src/systems/sea-swell.ts`. Sample per ship at shader phase `uTime·(0.72+uTempo·0.38)`. Pitch/roll from ∇h: at swell 0.5, ±1.2° pitch / ±2.0° roll. Length filter `clamp(1−L/60,0.35,1)`. Calm ×0.2, danger ×1.5. Heave `0.6·h·amp`. Wind heel under way `6°·\|sin AWA\|·windSpeed·(0.6+0.4·gust)·sailSet`, τ 2.5 s. Turn-heel clamp 0.16→0.05 | stunning 4 / relaxing 4 / poetic 4 | H | M | 0 / 0 / ~1.3k sin/cos, 0.03–0.06 ms CPU [INFERENCE] / 0 | `resolve.ts:32-36`; `world-renderer.ts:4130,4701-4704`; `garden-water.ts:228,507,2148-2151`; `garden-fleet-batch.ts:686-697,1496`; `motion-types.ts:161` | Tide heave/roll proxy; most of the turn-heel range | Hull echo of danger chop (already in DOM). RM: level hulls | One source for water `uTime`/tempo (Water). Waterline collar. Keep heel cap small because of PSI "wind calm" (D15). Apply to far instances too (fc-3) |
| fleet-motion-3 | ★ | The wake as a glassy slick, not whiskers | Delete whisker lines/`wakeMaterial`. `uDecay`: R foam `exp(−0.35·dt)` (~3 s), G slick `exp(−0.035·dt)` (~30 s), G diffusion weight 0.25. Stamp R: bow cushion 0.35·L, stern churn s<0.6L, Kelvin arms 19.5° s<1.2L. Stamp G: centre wash `1.1·beam·(0.6+0.4·speedRatio)`. Water: detail normal ×(1−0.75·slick), env +0.3·slick, foam cap 0.26→0.40 (R only). Hide batch quads at `balanced`+ | stunning 4 / poetic 5 / relaxing 4 | M–H | S–M | −84 −2 draws / 0 / ≤0.05 ms GPU (×4 DPR2) [INFERENCE] / 0 (reuses RT G channel) | `garden-ships.ts:2847-2858`; `garden-wakes.ts:67,160-183,208-225`; `garden-water.ts:810-822,1160-1170`; `world-renderer.ts:3620-3632,4741-4755` | Whisker lines (84 draws); ghost trail/bow quads; ~8 s foam smear | Keeps the risk / \|24h\|≥2% wake mapping via G stamp intensity. RM: field empty | Needs fm-4 to avoid striping. Cap env boost in `mirrorZone` below tower reflection (Water). Texel 0.86 u. **Same subtraction as gm wake-hairlines and fc cross-lane note (count −84 once)** |
| fleet-motion-4 | | Long rests, tide windows: fewer hulls moving at once | Rests 240/480 → 600/1500 s; legs stay 90–180 s. `MOTION_CYCLE_MAX_SECONDS` 3600, cycle quantised to 600 s. Slots weighted 3:1: departures in tide [0,150), arrivals in [300,450). Keep ±30 s hush. Underway ~29%→~11% (~20 hulls, peaks ~30) [INFERENCE] | relaxing 5 / poetic 3 | M | M | 0 / 0 / 0 (slightly less work) | `motion-config.ts:36-40,48`; `motion-planning.ts:713-719,770-788` | ~60% of simultaneous motion; constant background shuffle | Routes carry no meaning; update the cadence copy ("leave on the ebb…"). RM unchanged | `motion.test.ts` duty/cadence/pair pins. Too-dead risk is carried by fm-5 + fm-1. Complements gm-2 |
| fleet-motion-5 | | The approach is the ceremony | Trigger at arrival progress ≥0.66 when the berth is inside the rest frustum +10% margin (`projection.ts`). Director subject gates `beatSailScale`. Transit end 0.85→0.70, decel end 0.96→0.94, profile `1−smoothstep³`. τ 0.06→0.3 s. Fender: one damped yaw 0.03 rad, ζ0.4, 6 s. Subject only: uppers furl over 0.70–0.85, course 0.6 over 0.85–0.94, back to set-slack after 20 s. Copy: issuance clause only if minting/redeeming; name `currentDockId` | poetic 5 / relaxing 3 / stunning 3 | M | M | 0 / 0 / 0 | `garden-arrival-beats.ts:121-133`; `pharosville-world.tsx:570-586`; `world-renderer.ts:4580,4607-4608`; `motion-config.ts:54-55`; `transit.ts:107-114,340`; `memory.ts:131` | Fleet-wide sail dips (~3 concurrent); post-berth nameplate burst; fender jiggle; snap-turn | Fixes a false "supply increased" claim; DOM parity via caption + `setAnnouncement`. RM: no ceremony | Director 2–4 min interval + fm-4 windows. `garden-arrival-beats.test.ts`. Chrome/DataPoetry caption grammar. Related to gm-D4 stuck chip |
| fleet-motion-6 | | Sailing, not sliding: trim, belly, luff, leeway | Shader AWA from `instanceMatrix[0].xz` vs `uWindDir`. Camber `sign(side)·bakedBelly·(0.7+0.3·set)`; ripple 0.2×. Luff only if \|AWA\|<35° or moored (belly 0.2, flutter 0.3). Brace `clamp(AWA/2,±40°)`. Leeway −4°·sin(AWA), visual only. Pace k(AWA) 0.75/1.0/0.9, normalised, stored with `ShipWaterPath` | stunning 3 / poetic 3 | M | M | 0 / 0 / ~10 ALU per sail vertex / 0; no new attributes | `garden-fleet-batch.ts:137-138,703-709`; `transit.ts:322-331`; `motion-planning.ts` path cache | Symmetric flutter everywhere; constant speed on every heading | None. RM: `uWindTime` 0, static camber/brace | Drives fc-1 brace and flips its +z belly. Belly ≤ baked max for mon legibility |
| fleet-motion-7 | | Follow in the wake: consorts as time-delayed path followers | Under way, sample the flagship route at `t−i·Δ`, `Δ=spacing/speed`, spacing `1.4·max(L_i,L_{i−1})` (~4–7 s). Delete world offset and breathing. At rest, rotate the offset into flagship heading + fm-1 rode with shared ψ | poetic 4 / relaxing 3 | H | S–M | 0 / 0 / ≤0.1 ms (1 route sample per consort) [INFERENCE] | `consort.ts:65-207` (135-169) | Formation gain swings 1.4→0.55; world-axis crabbing; land-collapse teleport; ±0.18-tile breathing | Squad membership in DOM (maker-squad). RM: rest raft | Dwell absorbs ≤~20 s delay. `motion.test.ts` consort pins. Uses fm-1 |

Acceptance gates:
- **fm-1:**
  - sheet across a tide turn (wall time mod 600 ≈150/450): bows rotate together over ~60 s;
  - 500 ms sheet: ≤4 °/s;
  - scratch run: 0 heading changes >20 °/s over 30 min.
- **fm-2:**
  - `open-water-800ms`: phase differences, sequential nodding;
  - calm inlet barely moves;
  - `--reduced` identical to today.
- **fm-3:**
  - slick ≥3 hull-lengths, fading in ~40 s;
  - draws −84;
  - no hairlines.
- **fm-4:**
  - 30-min scratch: moving hulls median ≤22, max ≤34;
  - ≤3 moving in the rest frame outside windows.
- **fm-5:**
  - 12×4 s Ethereum quay sheet: one hull decelerating ≥40 s with staged sails, no other dips;
  - caption appears before the stop;
  - flat fixture: no "increased".
- **fm-6:**
  - under-way sails bellied, moored sails slack;
  - no sail passes through flat except head-to-wind.
- **fm-7:**
  - single file, no overlap;
  - 0 off-water consort tiles over 30 min.

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Anchored hulls pirouette: calm 0.55, alert 1.3, danger 3.6 turns/min; peaks 995 / 5 215 °/s; danger spends 27 s per 10 min above 57 °/s | `anchorage-noon-500ms` frames 03→04 (~50° in 0.5 s); `crop-danger-strip.png` (~8 s edge-on→broadside) | `risk-drift.ts:111-136`; `risk-water.ts:22`; `open-water.ts:121`; `resolve.ts:39` | fm-1 | M |
| D2 | Hard heading snaps at every rest↔voyage boundary, plus a 9° heel flick (~0.6 snaps/s [INFERENCE]) | — (code) | `visual-motion.ts:189-208,230-255`; `route-cycle.ts:85-87,115-117`; `memory.ts:161-174`; `world-renderer.ts:4124-4131` | Add sailing↔risk-drift compatible pairs; yaw-rate limiter ≤20 °/s under way, ≤4 °/s at rest; heel from limited rate, clamp 0.16→0.05 | S |
| D3 | Whisker wakes: two 1-px lines per hull, opacity 0.38; 84 of 279 draws | `crop-whiskers.png`; `noon.png` 1195–1215,770; `golden.png` 1185–1215,770 and 940–975,795 | `garden-ships.ts:2847-2858`; `world-renderer.ts:3627-3632` | Delete (−84 draws, ~0.9 ms CPU) | S |
| D4 | Hulls rigid on a moving sea (≤0.57° roll at 600 s period) | `open-water-800ms` (9.6 s with no heave/pitch/roll) | `resolve.ts:34-36`; `world-renderer.ts:4701-4704` | fm-2 | M |
| D5 | Wake field invisible by day (~3% foam mix at noon; quads opacity 0.08) | `crop-green.png`; only `golden.png` 1090–1150,680–700 shows a faint arc | `garden-water.ts:1168`; `world-renderer.ts:3620-3626` | fm-3 | S–M |
| D6 | Arrival caption untruthful and late: flat/missing → "increased"; fires after berthing; off-frame ships announced; names home dock [INFERENCE] | `selected-ship.png`, `wholemap-noon.png` | `pharosville-world.tsx:570,577`; `world-types.ts:588`; `garden-arrival-beats.ts:130-133` | fm-5 (truth part S) | S |
| D7 | Sails dip across the whole fleet at every arrival and departure (~3 at any moment [INFERENCE]) | — | `world-renderer.ts:4607-4608`; `garden-arrival-beats.ts:121-128` | Subject-only dip (fm-5) | S |
| D8 | Consorts use world-axis offsets (crab on turns), teleport onto the flagship tile on land, and breathe ±0.18 tiles | `danger-basin-2s` frames 07–11 (hull in contact; consort status uncertain [INFERENCE]) | `consort.ts:141-144,150-155,159-169` | fm-7 | S–M |
| D9 | Docking twitch: fender yaw `sin(t·2.7)·0.04`; arrival τ 0.06 s snap | — | `transit.ts:340`; `memory.ts:131` | One damped settle 0.03 rad over 6 s; τ ≥0.25 s | S |
| D10 | Data-change arrivals scale up from 0 (departures shrink) over 16% of the transition | — | `world-renderer.ts:681,4665-4668` | Keep full scale; fade via `mist`/`mapVisibilityAlpha` at the fog edge | S |

### Subtractions
- Whisker wake lines, `createWake` detail and `wakeMaterial` (`garden-ships.ts:2847-2858`, `world-renderer.ts:3627-3632`): −84 draws.
- Ghost wake trail/bow quads at `balanced`+ (`garden-wake-batch.ts`, opacity 0.08): −2 draws.
- Lissajous rest orbit/heading (`risk-drift.ts:109-136`) and the `REST_RADIUS_*` table.
- Fleet-wide sail dip, kept only for the ceremony subject (`world-renderer.ts:4607-4608`).
- Fender yaw sine (`transit.ts:333-348`) and 0.06 s arrival τ (`memory.ts:131`).
- Consort breathing sine (`consort.ts:150-155`) and formation gain modulation (`consort.ts:135-142`).
- Tide-driven roll/pitch proxy (`world-renderer.ts:4703-4704`), replaced by fm-2.
- Scale-from-zero data arrivals (`world-renderer.ts:681,4665-4668`); fade at the mist edge instead.

### Reversals
- Motion cadence of 90–180 s legs / 240–480 s rests with evenly spread pair slots (`motion-config.ts:36-51`; prior "Rejected: shorten every rest").
  - Evidence: `harbour-tempo-5s` shows constant multi-hull motion, ~29% underway [INFERENCE].
  - Change: lengthen rests and window departures (the opposite of the rejected shortening).
  - Risk: re-pins; a quieter harbour needs fm-5 and fm-1.
- "Rests read as rests" (Wave 4b, `risk-water.ts:5-10`).
  - Evidence: its implementation encodes risk as orbit radius and rate, which spins.
  - Change: carry "more restless in risk order" via sheer, snub and pitch.
  - Risk: —.
- Risk-water restlessness as displacement (`REST_RADIUS_DANGER = 0.6` tiles).
  - Evidence: `danger-basin-2s` visual collisions.
  - Change: angular sheer, legible without eating space; no new DOM text.
  - Risk: —.
- "Sails never held furled at berth" (`garden-arrival-beats.ts:105`).
  - Evidence: set-and-fluttering at berth looks under way.
  - Change: keep for identity (D8), but reverse the implicit flutter to slack, unfluttered cloth.
  - Risk: —.

Other cross-lane flags:
- Camera: every sheet drifted, so motion acceptance needs a camera-still capture mode.
- Weather: one authoritative wind/gust field.
- Headroom: −86 draws from subtractions; sanity-check fm-2/fm-7 JS at 120 Hz.

---

## Cross-slice clusters

### 1. Rest composition and threshold (the near plane)
IDs: garden-1, garden-master-1, garden-master-3, pharos-2 (moves mass down), harbour-1 (clears the left-third sky), harbour-2 (removes flag envelopes from the camera solver), pharos-D10, garden-D1, garden-master-D1.
- **Near-duplicate / CONFLICT (bough):** three items concern the same invisible foreground bough (`garden-rim-mesh.ts:898-986` / `912-937`):
  - garden-1 (keep the current rest pose; re-solve the bough in screen space as a kuromatsu limb);
  - gm-1 step 4 plus gm subtraction "invisible bough" (delete it; move the rest to the engawa seat, where the engawa hero pine is the near plane);
  - garden reversal 1 (W1.9 repoussoir).
  
  The plan must choose. garden-1's solver says it re-solves if the rest changes, but gm-1 deletes the object outright. Both require the garden-2 / gm-4 pad geometry.
- **Tower framing** (all ask for ~62% x instead of 0.50):
  - pharos-D10: axis 58–62% x, crown 14–18% from top;
  - gm-1: foot x∈[0.62,0.70], tower ≤0.38H, crown y 0.18–0.24.
  
  The height targets differ: pharos-2 keeps world crown height, while gm-1 shrinks the tower's frame share via zoom 0.9.
- **Corner and flank clearance:**
  - garden-1 needs corner rect [0,0.24]×[0.70,1.0] hull-free;
  - gm-1 moves the Polygon/BSC stations;
  - garden-5 wants hulls ≥4 u from the crane islet.
  - Heron re-perch: garden-1 (crane islet).
- **fc-3's hero band** ("nearest 16 by eye distance") assumes the current rest camera, which gm-1 changes.

### 2. Tree vocabulary (niwaki / planting)
IDs: garden-2, garden-master-4, garden-8, garden-4, garden-master-6 (pond ring), garden-D2, garden-D5, garden-D6, garden-D9, garden-master-D3, pharos-D8 (niwaki #0 lean). The harbour cross-lane note flags rim "palms".
- **Near-duplicate:** garden-2 and gm-4 are the same pad fix, done differently:
  - garden-2: icosa lobes with y×0.42, underside ×0.40, S-trunk;
  - gm-4: ellipsoids with sy/sx≈0.25, underside ×0.55, aspect ≥1.3.
  
  Merge them into one generator. Both are prerequisites for the threshold (garden-1 / gm-1).
- **Near-duplicate:** garden-8 and gm-4 overlap on bamboo and karikomi, with count conflicts:

  | | garden | gm-4 |
  |---|---|---|
  | Bamboo | 35→6 clumps | 35→3 groves (gm subtraction says "32 of 35") |
  | Karikomi | chains (count unspecified) | 80→40 |
  | Momiji | 40→~16 | 40→5 |
  | Cherry | — | 20→3 |
  | Pines | ~50 of 120 move to the ridge (garden-4) | 45 total, odd groups |

### 3. Palette: vermillion primacy and chroma budget
IDs: garden-3, garden-master-7, garden-master-3, harbour-2, fleet-craft-2, garden-D3, harbour-D1, fleet-craft-D3, fleet-craft-D8, plus fc subtractions (strake, hero hull, pennants), garden subtraction (flora vermillion) and gm subtraction (40 September maples).
- **CONFLICTS:**
  - gm-3's higanbana (vermillion, ≤12 stems) vs garden-3's "remove every vermillion from flora" (ΔE10 test) and gm-7's "≤2 red regions".
  - harbour-2's acceptance ("Tron chroma < torii"; "torii once more the only red") vs gm-7 deleting both torii.
- **Same object:** the red spar / warning-buoy pole (`noon.png` ≈225–245×595–740) is flagged by both gm-7 and the harbour cross-lane note (`garden-sea-edges.ts:427`).
- **Shared rule:** every derived dye stays below vermillion's C0.177:
  - harbour-2 ink C≤0.10;
  - fc-2 ceilings 0.08–0.13;
  - garden-3 momiji C<0.14.
  
  Consolidate into one derived-palette table the colour checker can see: `flag_kinari`, `timber_charred`, `momiji_*`, the sail ladder.

### 4. Seasons and calendar
IDs: garden-3, garden-master-3, garden-7.
- **Near-duplicate reversals:** garden reversals 3 (T2.2d) and 4 (four-state season) vs gm reversal 3 (meteorological flora seasons / W4.17).
- **CONFLICT:** garden-3's continuous per-tree DOY model (maple turn DOY 298–326 ≈ late Oct–Nov, snow weeks, blossom DOY 95) vs gm-3's small phenology table (momiji 5–25 Nov on 3–5 specimens, cherry 28 Mar–10 Apr, higanbana, susuki).
- **Near-duplicate subtraction:** the always-on spring petal drift is removed by both garden-7 and gm-3 ("keep one or the other").
- **Shared seam:** both need a date-override seam for evidence.

### 5. Night light and beacon dominance
IDs: pharos-1, pharos-3, pharos-4, pharos-8, harbour-3, harbour-4, fleet-craft-7, garden-master-3 (tōrō), pharos-D1, pharos-D3, harbour-D4, harbour-D5, garden-D10, garden-master-D6, garden-master-D8.
- **Near-duplicate:** the beam smudge appears as pharos-D2/pharos-3/pharos reversal 4 and as gm-D6. The water stripes in gm-D6 and pharos-D9 (dashed beam road) both go to the Water lane.
- **Dusk-event contention:** pharos-4 (tower stair climb + lantern kindling), harbour-3 (station embers in walk order) and gm-3 (tōrō kindling as *the* dusk event, "so no second dusk event competes"). All three extend the keeper ritual; decide the order or merge them into one walk.
- **Statue glow:** gm-D7 ≈ pharos-D7, with fixes pharos-7 / gm-5 (see cluster 6).

### 6. Hero weathering and statue
IDs: pharos-5, pharos-7, garden-master-5, pharos-D4, pharos-D7, garden-master-D7, plus gm subtraction (statue day emissive).
- **Near-duplicate:** pharos-5 and gm-5 both add streaks and a dark base band.
  - pharos-5: generator vertex-colour bake, 0 ms.
  - gm-5: runtime `onBeforeCompile`, ~+0.05 ms.
- **Statue CONFLICT:**
  - pharos-7: dark bronze, gleam `0.06+dusk·0.18+night·0.05`, finials verdigris.
  - gm-5: verdigris Zeus, emissive 0 by day, dusk ≤0.4.
  - Both kill the noon/dusk self-glow from `garden-day-cycle.ts:376`.

### 7. Headland, island stone and precinct
IDs: pharos-2, pharos-6, garden-master-6, garden-5, pharos-D5, garden-D8.
- **Near-duplicate / CONFLICT on the precinct box cliff** (`garden-precinct.ts:70`): pharos-2 plus its subtraction delete it; gm-6 breaks it into 3–5 slabs.
- **Near-duplicate:** stone triads (garden-5 Sakuteiki generator vs gm-6 sanzon 1:0.6:0.4) and the pond edge (gm-6 suhama vs the pharos cross-lane note on an irregular suhama pond).
- **Precinct ownership:** garden-5's raked court sits in the precinct owned by pharos-2.

### 8. Harbour architecture and identity
IDs: harbour-1, harbour-2, harbour-5, harbour-6, garden-master-7 (torii), harbour-D2, harbour-D3, harbour-D6.
- Camera-solver coupling: harbour-1/2 shrink flag envelopes (tip 26→≈14), which may move the rest seat. This interacts with gm-1.
- The harbour-D6 fix spans harbour-4, harbour-1 and harbour-5.

### 9. Fleet silhouette and cloth
IDs: fleet-craft-1 through fleet-craft-8, fleet-motion-6, fleet-craft-D1 through D8.
- Shared contract: fc-1's centred braced sail with baked +z belly; fm-6 drives the brace `clamp(AWA/2,±40°)` and flips the belly by leeward sign. No new attributes.
- The hero band (fc-3) gates fc-7 and fc-8.

### 10. Calm water and fleet motion
IDs: fleet-motion-1, fleet-motion-2, fleet-motion-4, fleet-motion-7, garden-master-2, fleet-motion-D1, D2, D4, D8, D9, D10, garden-master-D2.
- **Near-duplicate aim:** gm-2 (inlet A\* cost plus crossing token) and fm-4 (long rests, tide windows) both cut concurrent motion. Both add a scheduled "one event": the gm-2 single crossing, and the fm-1 tide swing / fm-5 ceremony.
- **Wind unification:** harbour-6, harbour-2 (`aGust`), fm-2 and fm-6 all need one authoritative wind and gust field.

### 11. Wakes
IDs: fleet-motion-3, fleet-motion-D3, fleet-motion-D5.
- **Near-duplicate subtraction (count −84 draws once):** the `ship-wake-detail` 1-px lines appear in fm-3/fm subtractions, the gm subtraction "wake hairlines" and the fc cross-lane note (hero band only).
- Several lanes spend this saving: gm (~150 freed with gm-1), fc-8 (+1 draw) and headroom.

### 12. Reeds in the ma
The same three reed tufts (`garden-sea-edge-sites.ts:136-138`; `noon.png` 255–490×740–850) appear in garden-D7 and garden subtraction ("root on a bar or delete") and in gm-D2, gm-2 and gm subtraction ("delete, or move ≥halfWidth from spine"). Merge them into one item.

### 13. Arrival text and ceremonies
IDs: fleet-motion-5, fleet-motion-D6, fleet-motion-D7, garden-master-D4 (stuck USDO chip, a probable arrival-beat lifecycle bug). Fix them together in `harbor-label-chips.tsx` / `garden-arrival-beats.ts` / `pharosville-world.tsx`.

### 14. Life and events
IDs: harbour-4 (anniversary lantern), garden-7 (leaf fall), fleet-motion-1 (tide swing as director beat), pharos-4, harbour-3, gm-3 (kindling), garden-1 (heron re-perch), garden-master-D5 (birds off the crown).
- All compete for director slots and should be scheduled through one garden director.

### Draw/tri ledger for this slice (as reported)
| Change | Draws | Tris |
|---|---|---|
| gm-1 | −60 to −80 | −25k to −30k |
| fm-3 (wake subtraction, shared) | −84, −2 | — |
| pharos-1…3 net | −1 | ≈−3.5k |
| pharos-2 | −1 | ≈−2k |
| garden lane net | ≈+3 | ≈+45k |
| gm-3 | +1 | — |
| gm-7 | −2 | ~−600 |
| gm-4 | — | −20k to −40k (conflicts with garden-2's +35k if both land) |
| fc-8 | +1 | — |
| fc-3 | — | ≈+1k (or ≈−30k) |
| harbour-1 | — | −4k to −8k |
| harbour-5 | — | −1k |

No idea in the six reports adds a texture.
