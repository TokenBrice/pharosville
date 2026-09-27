# The Pharos, its headland, precinct, beacon and beam — pharos

## Verdict
The Pharos is a fine model placed like a trophy: dead centre (50% x, `noon.png`), filling about 70% of the frame height with the Zeus 7% from the top. It stands on about 4 u of flat rock and a square plinth box, so it reads as a skyscraper on a coaster, not a lighthouse on a headland.

At night the lantern is an opaque drum sharing `lighthouse-window-glow` with 36 windows. The lantern peaks at L\*93, the window rows at 82, the air beside it at 2, and the flame is hidden inside (`night.png`). The beam is a hard golden tube or, end-on, a grey disc.

The leap:
- one fire, seen through glass;
- a soft beam that flashes as it passes you;
- a dark weathered shaft with a few stair lights;
- six units of keep traded for a real asymmetric headland.

## What I looked at
**Baseline frames:** `noon.png`, `golden.png`, `blue.png`, `night.png`, `deep-night.png`, `dawn.png`, `selected-lighthouse.png`, `wholemap-noon.png`. Metrics come from `night.txt` (GPU p50 12.6 ms, p95 17.3 ms, 287 calls, 380k tris).

**L\* measurements** (sRGB→CIELAB, region means and p95, in 1600-px coordinates):

| Frame | Region | L\* |
| --- | --- | --- |
| `night.png` | lantern | p95 86, max 93 |
| `night.png` | keep window row (y≈370) | p95 82 |
| `night.png` | 40 px of air beside the lantern | 2 |
| `night.png` | tower body | 17 |
| `night.png` | sky | 3 |
| `night.png` | moon streak on water | 19 |
| `noon.png` | upper tower | 58 |
| `noon.png` | sky beside the tower | 86 |
| `golden.png` | tower | 30 |
| `golden.png` | sky | 75 |

At noon and golden hour the tower's value against the sky is fine. At night the beacon does not lead.

**My captures** (all under `outputs/opus-review/pharos/`):
- **`noon-2x.png` (3200×2000, scheduler tier `interaction`):** crops `noon-base-crop.png` and `noon-tower-crop.png`.
- **Night beam sheet, `night-beam-sweep-frames/00–02.png` (tier `balanced`):** the first run timed out on screenshot. The retry also timed out after 3 of 9 frames because of GPU contention. Tiled as `night-beam-partial.png`, with crops `night-beam-f0-crop.png` (end-on), `-f1-` (oblique) and `-f2-` (side-on, with the water road).
- **`golden-1_5x.png`:** tier `recovery` on both tries, so I used it for geometry and form only (`golden-base-crop.png`, `golden-crown-crop.png`). `golden-2x.png` was also `recovery` and is discarded.

That is 5 captures in total.

**Code:**
- `garden-lighthouse.ts`:
  - materials `:76-90`;
  - `prepareLighthouseModelMaterials` `:186-233`;
  - rim light `:245-334`;
  - beacon/halo/light `:767-806`;
  - `createBeamCone` `:965-1095`;
  - dust `:1098-1154`.
- `garden-beacon-fire.ts`: `:52-78`, `:114-209`, flame/smoke depth flags `:230-301`, `:493-528`.
- `garden-beam-dwell.ts` (whole file).
- `garden-day-cycle.ts:338-466`.
- `world-renderer.ts:4379-4445`, which covers scatter, sweep and dwell.
- `garden-island.ts`:
  - `ISLAND_TIERS` `:171-175`;
  - `islandTerrainHeight` `:184-202`;
  - tiers and shelves build `:576-627`;
  - `createRockTerraceGeometry` `:811-934`;
  - `GARDEN_NIWAKI_SPECS` `:1217-1231`.
- `garden-precinct.ts` (whole file).
- `garden-models.ts:198-286`.
- `generate-garden-lighthouse.mjs`:
  - stone ramp `:43-53`;
  - materials `:161-228`;
  - windows `:441-446`;
  - lantern `:920-975`;
  - AO and `paintStone` `:1226-1278`.
- `garden-water.ts:1270-1294` (beam road).
- `garden-post.ts:44` (bloom knee 2.4).
- `garden-observatory-slice.ts:40-46`.
- Keeper ritual: `garden-lanterns.ts:14-78` and `garden-almanac-dressing.ts:123-135`.
- Docs and history: `ASSET_PIPELINE.md`, the prior `island-lighthouse.md` review, `decision-ledger.md`, and `01-implementation-plan.md` (W1.2, W1.10, W2.9, §6).

## Spell-breakers (defects)
1. **The beacon is not the brightest light in its own tower.**
   - **Where:** `night.png` / `deep-night.png` crown, and `night-beam-f0-crop.png`. The lantern reads as flat amber panels between columns, with no flame shape and no glow in the air (L\*2 beside it). Its peak of 93 is about equal to the window rows (82).
   - **Cause:**
     - The generator authors the lantern's glow as an opaque inner drum on the **window** material: `add("window", CylinderGeometry(1.3,1.3,2.75,…,true))` (`generate-garden-lighthouse.mjs:942-944`). The day cycle therefore drives it with `towerWindowGlow` (0.18 day / 1.53 night, `garden-day-cycle.ts:405-408`).
     - With `#ffbe6e` (luminance ≈0.59) that gives ≈0.9 linear, well under the 2.4 bloom knee (`garden-post.ts:44`). The lantern never blooms.
     - `[INFERENCE from geometry + crop]` The living flame sits inside that drum. It is 2.4 wide, offset only 0.42/0.42 toward the camera (`garden-beacon-fire.ts:77-78,125-126`), and depth-tested (`depthWrite:false` only, `:230-231`). Its HDR core (`GARDEN_BEACON_FLAME_CORE_LUMINANCE`) is therefore hidden behind the drum's front wall, apart from a sliver above the drum.
     - The halo sphere (r 1.15 × night scale 1.8, `garden-lighthouse.ts:785-797`, `garden-day-cycle.ts:370-371`) barely clears the lantern's 1.9 radius.
   - **Why it breaks the calm:** the bible's single rule for night ("one dominant light, the beacon") is violated by the tower itself.
   - **Fix:** pharos-1. **Cost:** S–M.
2. **The beam is a solid golden tube, and end-on it is a grey disc.**
   - **What I see:**
     - `night-beam-f1-crop.png`: hard parallel edges, a nested two-tone core, and a bright elliptical rim at the far end, like a torch beam.
     - `night-beam-f0-crop.png`, `night.png` (~700-760, 210-290) and `deep-night.png` (~820-890, 200-290): a smoky grey disc with a darker ring beside the lantern. The comment at `garden-lighthouse.ts:1044-1047` says this "brown smudge" was fixed. It is still there.
   - **Cause:**
     - Surface shading of an open, double-sided additive cone: rim term `shaft = 0.78 − 0.48·rim` (`:1039-1040`).
     - A second nested core cone (`:973-991`).
     - A fade that still leaves the open base visible (`:1037-1038`: `1 − smoothstep(0.62, 1.0)`, while the cap ring is the brightest overlap).
     - `sin(vAlong*30)` bands (`:1041`).
     - End-on, the soft cone and the core project to concentric discs.
   - **Why it breaks the calm:** tech-demo "light-sabre" hardness. The one motion beat reads as geometry, not light.
   - **Fix:** pharos-3. **Cost:** M.
3. **At night the tower reads as a lit hotel.**
   - **Where:** `night.png` shows 18 keep windows plus the drum windows, all at the same brightness in a 3×6 grid. Their reflections are the second-brightest mark in the water (max L\*82; the water lane's spell-breaker 2).
   - **Cause:** `squareWindows` is 4 faces × 3 registers × 3 (`generate-garden-lighthouse.mjs:441-446`), all on one material with one curve (`garden-day-cycle.ts:405`).
   - **Why it breaks the calm:** a lighthouse shaft is dark at night; a grid of equal lights is an office block. It also dilutes spell-breaker 1.
   - **Fix:** pharos-4. **Cost:** S–M.
4. **At noon the windows and the lantern look painted orange.**
   - **Where:** `noon-tower-crop.png`. Every arched window is a saturated amber panel, and the lantern is an orange can between white columns.
   - **Cause:** the same material is `toneMapped:false` with emissive 0.18 on `#ffbe6e` over `#2a2116` (`generate-garden-lighthouse.mjs:220-228`; `garden-day-cycle.ts:405`).
   - **Why it breaks the calm:** at noon a window should be the darkest thing on a stone face. Orange panels flatten the keep into a toy and kill its daytime value rhythm.
   - **Fix:** pharos-5(c). **Cost:** S.
5. **The "headland" is a pancake under a plinth.**
   - **Where:** `noon-base-crop.png` and `golden-base-crop.png`. Grey laminated plates with flat tops sit under a pale square box wall, and the whole mass is about 4 u of relief under a 38 u tower (≈10%).
   - **Cause:**
     - Three concentric ellipse tiers 1.45–1.72 u tall with flat `CylinderGeometry` caps (`garden-island.ts:171-175,576-598`).
     - A 19.2 × 4.4 × 19.2 square "cliff" box (`garden-precinct.ts:70`) seats the court.
     - Strata are colour bands plus ±3% radial steps (`:853-866`), which from the camera read as lamination, not bedding.
   - **Why it breaks the calm:** the bible's "asymmetric moss-and-stone headland" does not exist. The monument has no ground to rise from, so the scale and poetry of a lighthouse on rock are lost.
   - **Fix:** pharos-2, or pharos-6 as the cheap fallback. **Cost:** L (S–M for the fallback).
6. **A blue-violet feather is glued to the statue at dawn and dusk.**
   - **Where:** `golden.png` (~800,120), `dawn.png` (~800,120), smaller in `blue.png`.
   - **Cause** `[INFERENCE: position, downwind drift and hue match the beacon smoke]`: smoke opacity is still 0.16 at dusk (`garden-day-cycle.ts:361`) and tinted `fog_blue×0.5` (`garden-beacon-fire.ts:61-62`). The same plume is invisible at noon in `noon.png` and `noon-2x.png`, so the "day signal" earns nothing where it is meant to.
   - **Fix:** subtract (see Subtractions). **Cost:** S.
7. **At dusk the Zeus glows as a cream figurine, not bronze.**
   - **Where:** `golden-crown-crop.png` shows a flat, self-lit, formless silhouette. The bronze reads as plastic.
   - **Cause:** `statueGleam = 0.22 + dusk·0.94` (`garden-day-cycle.ts:376`) on the gilt, which carries a `lantern_glow` emissive.
   - **Fix:** pharos-7. **Cost:** S.
8. **A black "cable" crosses the tower's foot.**
   - **Where:** `noon.png` (540-700, 525-640). The leaning niwaki's trunk is a straight black stick at about 50°.
   - **Cause:** `GARDEN_NIWAKI_SPECS[0]` has lean (−6.2, 7.4) over height 8.5 (`garden-island.ts:1218-1223`).
   - **Why it breaks the calm:** it is the darkest, hardest line next to the hero and points away from it.
   - **Fix:** reduce the lean to ≈(−3.2, 3.8), give it an S-curve (two control bends) and lift the bark value one stop. This is the garden lane's file; it is flagged here. **Cost:** S.
9. **The beam's sea road is a ruled dashed line.**
   - **Where:** `night-beam-f2-crop.png` (y≈590, x 40-340). It is a 1-px golden dashed rule across the water, like a lane marking.
   - **Cause:** ribbon width 0.35 → 0.92 u (`garden-water.ts:1275`) and the `aaStep` crest dash (`:1282-1283`).
   - **Fix:** water lane (see cross-lane). **Cost:** S.
10. **The hero is dead centre with no crown air.**
    - **Where:** all rest frames. The axis is at 50% x, and the statue is 7% from the top edge.
    - **Why:** the bible says "slightly right of centre… tower crown air". Reborn W1.2 authored "~62% x".
    - **Fix:** camera lane (see cross-lane). pharos-2 helps by moving mass down.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### ★ pharos-1 The lantern is the only fire
- **Picture:**
  - At night you see a real flame: a gold-white tongue breathing behind eight dark columns and a thin skin of glass.
  - Around it the air itself glows: a warm, soft corona two to three lantern-widths across that fades into the indigo.
  - Below it the shaft is a dark stone silhouette with a moon rim.
  - Nothing else in the harbour is that bright, and your eye goes there first, and back there after every wander.
- **Why:**
  - Spell-breaker 1. Numerically, the lantern peaks at L\*93 against windows at 82 and air at 2.
  - The bible's value plan asks for "beacon 92 at night" and "nothing competes with the tower by glowing harder". Today the tower's own apertures compete.
- **Impact:** stunning 5 / poetic 4 / relaxing 3. **Confidence:** H.
- **Cost:** S–M. **Perf:** +1 draw (a new GLB material; budget `maxDrawCalls: 8`, currently 7) / −250 tris (drum −64, glass +128, halo sphere −320 → sprite +2) / <0.05 ms (additive sprite ≈190 px square) / 0 tex.
- **How:**
  1. **Delete the opaque drum.** In `generate-garden-lighthouse.mjs:942-944`, remove `add("window", Cylinder(1.3…))`. The flame and embers in `garden-beacon-fire.ts` then read through the columns.
  2. **Add a glass skin.** Add a material `lighthouse-lantern-glass`: an open `CylinderGeometry(1.78, 1.78, 2.45, 32, 1, true)` at y 30.8.
     - At runtime (`prepareLighthouseModelMaterials`, `garden-lighthouse.ts:186`) swap it for a small `ShaderMaterial`: transparent, `depthWrite:false`, normal blending.
     - Alpha = `0.05 + 0.4·pow(1−|N·V|, 3)` (fresnel skin).
     - Colour = sky env sample by day, with a dark-glass base `iron_dark`. At night it takes warm inner reflection, `lantern_glow × 0.35 × night`.
     - By day this reads as dark glass with a sky glint, which answers spell-breaker 4 for the lantern.
  3. **Flame luminance.** Keep `GARDEN_BEACON_FLAME_CORE_LUMINANCE` (2.42 linear) as the floor. Raise the night `uIntensity` multiplier so the core reaches about 4 linear. It is the only element in the scene above 3.
  4. **Air corona.** Replace the halo sphere (`garden-lighthouse.ts:785-797`) with a camera-facing quad (reuse the ship-lantern billboard trick):
     - radius 6 u, profile `pow(1/(1+(r/0.9)²), 1.4)`;
     - additive `lantern_glow`, `toneMapped:false`;
     - opacity day 0 / dusk 0.12 / night 0.38, keeping the existing flicker modulation (`world-renderer`).
  5. **Keep the curves separate.** The lantern no longer shares `towerWindowGlow`; see pharos-4 for the windows.
  6. **Keep the procedural shell in parity:** shell drum `:704-722` → brazier plus glass.
- **Displaces:**
  - the lantern drum and its orange day read;
  - the halo sphere;
  - 32 of 36 window lights (pharos-4);
  - bloom generosity elsewhere (the post lane can lower global bloom because one source now carries it).
- **Truth & a11y:**
  - The flame's brightness and flicker still carry PSI stress (`garden-day-cycle.ts:343-355`, `beacon-fire:190`), unchanged, and the DOM detail keeps the PSI row.
  - Reduced motion: the flame is frozen at its t=0 pose (existing), and the corona is static.
- **Risks:**
  - Glass transparency sorting against the flame (render the glass `renderOrder` after the flame; both use `depthWrite:false`).
  - The GLB hash, manifest bytes and `check:garden-models` must be re-pinned.
  - The window-material name contract (`LIGHTHOUSE_WINDOW_MATERIAL_NAME`) is still used by the precinct gatehouse.
- **Acceptance (`#t=22`, 1600×1000):**
  - lantern p95 L\* ≥ 92;
  - a ring at 2–4 lantern radii ≥ L\*10 (today 2);
  - flame shape visible between columns in a 2× crop;
  - the next-brightest harbour light ≤ L\*70.
  - `#t=12.25`: lantern glass L\* ≤ 45 and not orange (hue within ±15° of the neighbouring sky reflection).

### ★ pharos-2 Trade keep for crag: the asymmetric headland
- **Picture:**
  - The tower now stands on rock. A dark, stratified crag rises 7–9 u from the sea on the far and seaward side, cut sheer to the danger water on the right.
  - It steps down toward you in three unequal mossy benches to a low tide-shelf and a pale pebble beach where the pond and pavilion rest.
  - A stone path climbs the flank from the quay to the court on the crown. Pines grip clefts.
  - The keep is one register shorter, so the silhouette is a lighthouse on a headland, not a skyscraper on a coaster, and the crown ends at exactly the same height as today.
- **Why:**
  - Spell-breaker 5. Relief is about 4 u against 38 u (`garden-island.ts:171-175`, `garden-precinct.ts:70`).
  - Lighthouses are beautiful because of the rock, and the bible's hero is "the Pharos **and its headland**".
  - The 2026-09 plan (W1.10 "Tsukiyama rock: 2–3 hill lobes") was never built; the fort was demilitarised but the pancake stayed.
  - Keeping world crown and beacon heights constant avoids the §6 "raising the tower" rejection.
- **Impact:** stunning 5 / poetic 5 / relaxing 4. **Confidence:** M (the form is right; the authoring effort is large).
- **Cost:** L.
- **Perf:**
  - Rock: one radial heightfield mesh of 128 angular × 48 radial ≈ 12k tris. It replaces the 3 tiers, 3 shelves and precinct cliff box (≈6k), so net ≈ +6k.
  - GLB: 34 → 23 courses on the square tier gives ≈ −8k.
  - Overall ≈ −2k tris, −1 draw (the precinct cliff bucket), 0 textures, ~0 ms.
- **How:**
  1. **Height function.** Replace `ISLAND_TIERS` with one `headlandHeight(x,z)` in root-local space, built as the sum of:
     - an off-centre crown Gaussian at the tower seat (−7, −1.25), peak **+8.5**, σ 9 across and 13 along the NW–SE ridge;
     - a sheer seaward term on the +x/−z face: `smoothstep` cliff over 2 u toward the danger rock face `:1803-1845`;
     - quantised benches on the camera lee (+x/+z): height snapped to 3 unequal terraces (2.4 / 1.3 / 0.5) with a ±0.35 noise-warped riser;
     - a 0.2 u pebble shelf feathering into water within the existing obstacle ellipse. The footprint does not grow, so fleet placement and `garden-water-exclusion` stay valid.
     - `islandTerrainHeight` (`:184`) becomes a sampler of this function, so stair, lanterns, stones, path and koi reseat automatically. That is the reason it exists.
  2. **Mesh.** Build a radial grid (polar, so the waterline ring is exact) and displace it through `createRockTerraceGeometry`'s bedding code (`:847-866`). Apply strata **only where slope > 35°**, and deepen the bed step to ±0.12 u so raking light draws ledges.
     - Vertex colour by slope and height: steep = limestone ramp with a dark bed line; slope < 25° = moss (`TERRACE_MOSS`, keeping the bare-patch logic `:894-920`); within 0.8 u of the waterline = wet stone (pharos-6).
  3. **Precinct.**
     - Delete the cliff box (`garden-precinct.ts:70`) and set `COURT_Y` = crown (8.5 + 2.55 = **11.05** world).
     - Keep the gravel court, and the dry-stone courses **on the seaward side only**, which also ends their merlon read in `noon-base-crop.png`.
     - Move the engawa to the lee bench, facing the water.
     - `precinctTerrainHeight` merges into `headlandHeight`.
  4. **Tower.** In the generator set `SQUARE_TOP_Y` 20.5 → **14.5**, drop the middle window register (`[6.5, 11.5, 16.5]` → `[6.5, 11.5]`) and `courses` 34 → 23. Shift the gallery, drum, lantern and statue down 6.
     - `GARDEN_LIGHTHOUSE_ROOT_OFFSET.y` 2.55 → **8.55**, `BEACON_Y` 30.2 → 24.2, `HEIGHT` 38 → 32 (`garden-observatory-slice.ts:40-46`).
     - World beacon (32.75) and crown (40.55) are unchanged, so the beam, water road, label, camera fit and shadow frustum are unchanged.
  5. **Quay stair.** `garden-island.ts:1877-1886`: the stair lengthens from a 2.6 u rise to about 8.5 u, becoming a stepped path with two landings following the flank. It is the "stepped path" the brief asks for.
- **Displaces:** the 3 concentric tiers, 3 planted shelves, the square plinth box, the fourth-face court walls and one window register (12 windows). No new monument.
- **Truth & a11y:**
  - No analytical meaning.
  - Tower = PSI remains on the beacon and the detail panel. The supply tide still colours the waterline (`stoneRampColor(…, tide)` is retained).
  - Reduced motion: static geometry.
- **Risks:**
  - Many pins: the C3 constants, the L1 silhouette contract (`garden-lighthouse.ts:40-45`), `garden-island.test.ts` (drawable 49, precinct 4 draws), GLB manifest dimensions y 38 → 32 and pick proxy, `check:garden-models`, and the hero reflection alignment (W1.15).
  - Taller rock casts a longer shadow on the inlet, which needs checking in `blur-audit`.
  - Keep the headland's value dark (L\* 20–30 noon) so the tower stays the brightest mass.
- **Acceptance:**
  - `#t=12.25` rest: the rock silhouette rises from the waterline to ≥18% of tower height, with a visible diagonal from lower-right (low) to upper-left (high).
  - The tower foot is hidden by rock and court, not by a box edge.
  - `--blur-audit` at 16 px still shows the empty inlet.
  - `#t=17.6` 2× crop: at least 3 distinct lit ledges on the camera face.

### ★ pharos-3 The beam as breath, and the look-at-you flash
- **Picture:**
  - The beam is a soft, warm pressure of light in the night haze, densest at the lantern's throat and dissolving to nothing over its last third, with a faint drift of mist inside it.
  - It has no edges and no end.
  - Once a revolution it swings through your eye-line and the lantern **flashes**: a half-second bloom of white-gold that fills the crown and fades. It is the image everyone remembers of a lighthouse, and here it is the one event the night keeps repeating.
- **Why:**
  - Spell-breaker 2.
  - The mesh is shaded on its *surface*, so its silhouette is hard and the open base glows. End-on it is concentric discs.
  - The `uScatter` "flash" (`garden-lighthouse.ts:1044-1048`, `world-renderer.ts:4379-4397`) multiplies alpha on a disc, which is exactly the smudge.
- **Impact:** stunning 5 / poetic 5 / relaxing 3. **Confidence:** H.
- **Cost:** M. **Perf:** −1 draw (dust deleted) / −1.3k tris (single 48-segment cone) / +≈0.05 ms (about 40 ALU per fragment over ≤8% of screen) / 0 tex.
- **How:**
  1. **Geometry.** One cone, `side: BackSide` only (so each pixel is shaded once). Delete the nested core geometry (`:973-991`) and the `aBeamCore` attribute.
  2. **Fragment: analytic ray–cone intersection** in beam-local space. Pass the camera position in local space as a uniform, and solve the quadratic for the view ray against the cone `y²+z² = (x·tanθ)²`, x ∈ [0, L].
     - `chord` = segment length inside.
     - Density along the chord: approximate the midpoint's radial falloff `exp(−(r/(x·tanθ))²·3)` times `pow(1 − x/L, 1.6)` times `smoothstep(0, 0.05·L, x)`.
     - Alpha = `uOpacity · chord/(2·R(x_mid)) · density · mist`.
     - Silhouettes go to 0 naturally (chord → 0); end-on, the chord is long and the result is one soft bright core, not rings.
     - Keep the world-locked `beamNoise` mist (`:1051-1054`). Delete the `bands` sine (`:1041`).
  3. **Flash.** Drive the pharos-1 corona sprite by `flash = pow(uScatter, 8)` (`uScatter` is already cos² of the beam–view alignment). Corona opacity is multiplied by `1 + flash·5`, capped at a peak of 2.5 HDR.
     - At 0.2 rad/s the flash lasts about 0.6 s per ~31 s revolution. That is 0.03 Hz, slow, far under the 0.5 Hz ambient ceiling.
  4. **Opacity curve.** `coneOpacity` (`garden-day-cycle.ts:451`) stays phase-driven. Night peak integrated alpha ≈0.18 at the throat, dusk 0.06.
  5. **Dust.** Delete `createBeamDust` (`:1098-1154`, 2.5-px points that are not visible in any frame). The mist noise carries the motes.
- **Displaces:** the core cone, the bands, the dust `Points` draw and the halo-as-flash; the smudge disappears.
- **Truth & a11y:**
  - The sweep rate (PSI stress) and dwell on the largest PSI contributor (`garden-beam-dwell.ts`) are untouched. The detail's "Beam bearing" row is unchanged.
  - Reduced motion: parked bearing (`beamStaticBearing`), mist frozen, **no flash**. Flashing is a photosensitivity concern, and the static tableau should not strobe.
  - The flash is well under 3 per second (one per ~31 s).
- **Risks:**
  - Precision of the quadratic near the apex (clamp x ≥ 0.5 u).
  - The low-tier plane fallback (`createBeamPlane`) keeps the old look; accept that.
  - The `garden-lighthouse.test.ts:46-58` core-ratio pin is removed (it tests an implementation detail).
- **Acceptance:** motion sheet `#t=22 --frames 12 --interval 2600 --clip 250,0,1100,700`.
  - No frame shows a disc or ring beside the lantern.
  - Side-on frames show no hard edge: the beam's lateral profile falls ≥50% over ≥6 px.
  - No bright end-cap.
  - Exactly one frame per revolution shows the crown flash (crown ring L\* ≥ 60).
  - `--reduced #t=22`: steady parked beam, no flash.

### pharos-4 The keeper climbs: four stair lights and a kindling
- **Picture:**
  - At the end of the evening keeper's walk along the rim, a small light appears low in the tower, then another higher and to the side, then another: he is climbing.
  - The lantern then catches and swells to full over eight seconds, and the beam begins to breathe.
  - All night the shaft shows only those four stair lights, like embers on a dark stone flank.
  - At dawn they go out top to bottom.
- **Why:**
  - Spell-breaker 3.
  - The bible names "kindling lamps" as the model event. The keeper ritual already exists and lights fixtures in path order (`garden-lanterns.ts:14-78`, `garden-almanac-dressing.ts:123-135`), but the tower, the hero, is not part of it: its windows fade up on a phase curve (`garden-day-cycle.ts:405`).
- **Impact:** poetic 5 / relaxing 4 / stunning 3. **Confidence:** M–H.
- **Cost:** S–M. **Perf:** 0 draws / 0 tris / ~0 ms (a mask on a tiny material area) / 0 tex.
- **How:**
  1. **Window mask.** In `collectLighthouseGlowMaterials`' clones (`garden-lighthouse.ts:164`), patch `onBeforeCompile` on the tower window material, following the keeper-factor pattern in `garden-lanterns.ts:66-72`.
     - `windowId = floor(worldY/5.0)*4 + faceIndex` (face from `atan2` of the local normal).
     - `lit = step(0.5, stairMask[windowId])`, a uniform bitmask of 4 authored windows forming a rising spiral: register 1 face S, register 2 face E, drum face NE, gallery door.
     - Unlit windows get emissive 0 and colour `iron_dark` (dark voids).
  2. **Timing.** Order = the window's height rank. `lit ·= smoothstep(order, order+0.05, climb)`, where `climb = remap(keeperRitual.progress, 0.82, 0.96)`. The lantern kindles over `0.96 → 1.0` by scaling the flame `uStatusIntensity` from 0.15 to 1. Outside a ritual, the state follows phase (night = the 4 lit windows, day = 0). This way the event is an *enhancement* and a missed beat never leaves the beacon dark after dusk.
  3. **Curve.** Stair-light night emissive ≈0.6 linear (L\* ≈55–60), far below the lantern.
- **Displaces:** 32 of 36 window lights at night, and their 32 reflection worms. No new beat: it extends the existing keeper beat.
- **Truth & a11y:**
  - Decorative, so add it to `visual-cue-registry.ts:11` (the keeper's walk already says "carry no meaning").
  - The beacon's PSI encoding is never gated by the ritual after it completes.
  - Reduced motion: the final lit state, no climb.
- **Risks:**
  - The beacon must not look "off" at dusk if the director refuses the beat (hence the phase fallback).
  - The precinct gatehouse window shares the material name and should stay lit as an ember (exclude it by world position).
- **Acceptance:**
  - `#t=22`: ≤4 lit apertures on the tower, window p95 ≤ L\*60.
  - A 30-minute watch log across dusk shows the climb happening after the keeper walk, with the lantern swell observed in a motion sheet (`#t=18.3`, 12 frames × 4 s, crown clip).

### pharos-5 Weathered limestone, not putty (generator bake + day voids)
- **Picture:**
  - The stone looks a thousand years old:
    - rain has drawn faint grey streaks down from every sill and string course;
    - verdigris has bled pale green-blue from the bronze Tritons and the gallery rail;
    - the seaward lower courses are salt-bleached;
    - a dark green-black biofilm band sits just above the wet foot;
    - blocks vary subtly in stone lot.
  - At noon the windows are deep shadowed voids, so the keep has rhythm and weight instead of orange paint.
- **Why:**
  - `noon-tower-crop.png`: uniform putty coursing, with the only variation being ±4% hash jitter.
  - `paintStone` (`generate-garden-lighthouse.mjs:1252-1278`) is a single vertical ramp `#c4b494 → #f7edca` plus AO. The crown's `#f7edca` is a yellow cream, not limestone.
  - Spell-breaker 4 (orange windows).
- **Impact:** stunning 4 / poetic 4 / relaxing 3. **Confidence:** H.
- **Cost:** M. **Perf:** 0 draws / 0 tris / 0 ms / 0 tex. Vertex colours already exist (UBYTE); the GLB bytes are about unchanged.
- **How** (`paintStone` plus the AO registry that already exists):
  - **(a) Per-block tone.** Use `hashUnit(course, face, block)` (`:394`) to pick one of three stone lots (Δ value ±6%, Δ hue ±4° toward warm grey and cool grey). The ramp retunes to `#b9ae98 → #e4dfd2`, neutral limestone.
  - **(b) Streaks.** For each registered `OVERHANGS` entry, darken toward `STONE_OCCLUDED` by `0.22 · exp(−below/2.8) · streak(u)`, where `streak(u) = smoothstep(0.55, 0.9, hash(floor(u·9)))`. That gives thin vertical runs 1–4 u long under sills and string courses.
  - **(c) Verdigris.** Below the 4 Triton finials, the gallery and the drum cornice, apply `mix(base, #7fa596, 0.35·exp(−below/2)·streak)`.
  - **(d) Salt and biofilm.** Salt-bleach +8% value on the seaward faces (+x/−z) for y < 8. Biofilm `#2c3a33` at 0.4 for y ∈ [0.2, 1.4] above the wet band.
  - **(e) Day voids.** Set the window material's day emissive to **0** (`garden-day-cycle.ts:405`: `0.18` → `0`, with the ramp starting at `dusk > 0.35`) and change its colour from `#2a2116` to `#15181b` (`:221`).
- **Displaces:** the smooth cream ramp and the orange daytime windows.
- **Truth & a11y:** none (material). Reduced motion: n/a.
- **Risks:**
  - Streaks at the rest scale (a block is 2–3 px) must stay subtle (≤0.22) or they become tiger stripes.
  - GLB hash and manifest re-pin.
  - The noon tower must stay near L\*58–62 against the sky's 86 (the value plan's "tower 62").
- **Acceptance:**
  - `noon-2x` crop of the keep: visible dark vertical runs under every sill register and green-tinted runs under the finials.
  - Windows L\* ≤ 25 and hue-neutral at `#t=12.25`.
  - Tower mean L\* stays within 55–64.

### pharos-6 Wave-cut foot and tide-wet skirt (cheap fallback if pharos-2 is deferred)
- **Picture:**
  - Where rock meets sea there is a dark undercut notch, shadowed and wet.
  - A glossy black-green band runs one hand high, with a thin pale line of salt and barnacle at the high-water mark above it.
  - The island sits *in* the water instead of on a coaster.
- **Why:** `noon-base-crop.png` and `golden-base-crop.png`. The tier bottoms are uniform grey laminations that meet the water edge-on. The strata code has wet tint but no geometry notch (`garden-island.ts:853-873`).
- **Impact:** stunning 3 / relaxing 4. **Confidence:** M–H.
- **Cost:** S–M. **Perf:** 0 draws / +0 tris (existing rows) / 0 ms.
- **How:**
  - In `createRockTerraceGeometry`, for vertices with world y ∈ [WATERLINE−0.2, WATERLINE+0.55] on the lowest tier, pull the radial scale in by `0.35·bell(y)` (the notch).
  - Colour `STONE_WET × 0.55` with a roughness drop via the moss roughness texture channel. Wet reads darker and glossier.
  - Add a 0.12-u band at WATERLINE+0.6 lerped to `foam_white × 0.7` (the barnacle line).
  - The same logic carries into pharos-2's heightfield.
- **Displaces:** the laminated grey lip.
- **Truth & a11y:** the supply-tide datum notch (`TIDE_DATUM_IRON`, `:68`) must stay distinct: iron, not salt.
- **Risks:** interplay with the water shore-foam band (water lane).
- **Acceptance:** `#t=12.25` 2× crop: a continuous dark notch line and a pale high-water line all along the visible island base.

### pharos-7 Bronze that reads as bronze
- **Picture:**
  - At golden hour the Zeus is a dark bronze figure with one hot specular line along the sun side of the robe and the outstretched arm, not a glowing cream doll.
  - The Triton finials are verdigris green-bronze.
- **Why:**
  - Spell-breaker 7 (`golden-crown-crop.png`).
  - Emissive gleam (`garden-day-cycle.ts:376`) replaces the reflection that metal needs.
- **Impact:** stunning 3 / poetic 3. **Confidence:** H.
- **Cost:** S. **Perf:** 0.
- **How:**
  - `statueGleam = 0.06 + dusk·0.18 + night·0.05`.
  - Gilt roughness 0.3 → 0.22, colour darkened 20% so the specular carries the read.
  - Let the rim light (`LIGHTHOUSE_RIM_UNIFORMS`, `garden-lighthouse.ts:245-253`) do the separation.
  - Finials take the `oxidized-bronze` `#5c7268` material in the generator if they are not already on it.
- **Displaces:** the self-lit statue at dusk.
- **Truth & a11y:** none. Reduced motion n/a.
- **Risks:** at noon the statue may drop into the sky's value. Keep the day floor at 0.06, and check that L\* at `#t=12.25` differs from the sky by ≥15.
- **Acceptance:** `#t=17.6` crown crop: statue mean L\* ≤ 55, a specular highlight visible, form (arm/sceptre) readable.

### pharos-8 The beacon lights its own mist
- **Picture:**
  - On a hazy night the air near the tower is faintly warmer: a broad, low glow in the height-fog around the crown that dies away within a tower-height.
  - When the beam passes through, the fog it crosses brightens for a moment.
  - You feel the light in the air, not just at the lamp.
- **Why:**
  - The brief asks for "beacon light-cone lighting the fog".
  - Fog is currently lit only by the sky. The beacon has a 46-u point light (`garden-lighthouse.ts:799-806`) that affects surfaces but not the medium.
- **Impact:** poetic 4 / stunning 3. **Confidence:** M.
- **Cost:** S. **Perf:** 0 draws / 0 tris / <0.05 ms (one exp in the existing fog chunk) / 0 tex.
- **How:**
  - In `gardenHeightFogGlsl` (the shared fog chunk used by water and land), add uniforms `uBeaconWorld` and `uBeaconFog`.
  - `fogColor += lantern_warm · uBeaconFog · exp(−distance(worldPos, uBeaconWorld)/18) · fogFactor`.
  - `uBeaconFog = night·0.12 + dusk·0.04`, multiplied by the existing flicker and by `1 + 0.5·beamAlign`, where beamAlign is the cos² of the fragment's bearing against beam yaw. That gives a cheap lit-fog sweep.
  - Clamp so the in-scatter never exceeds L\*15 at the waterline.
- **Displaces:** the flat indigo fog around the tower foot at night. It must not add another light source.
- **Truth & a11y:**
  - Stale-source fog banks (W4.12) own bounded low fog. This term is illumination, not fog density, so it does not counterfeit staleness.
  - Reduced motion: static term at the parked bearing.
- **Risks:** lifting the night floor, which the bible wants dark. Keep the effect inside 1.5 tower-heights.
- **Acceptance:** `#t=22`: the fog within 30 u of the tower is ΔL\* +4–8 warmer than the same fog 80 u away, and the sky at the top-left stays ≤ L\*5.

## Subtractions
- **Beacon day smoke (`lighthouse-smoke`, `garden-beacon-fire.ts:133-150`; `garden-day-cycle.ts:359-361`).** It is invisible at noon and a blue feather at dawn and dusk (spell-breaker 6). Delete it (−1 instanced draw, 16 quads of overdraw at the crown). The mirror glint remains the day sign. The station-smoke uniqueness contract then belongs to the station plume alone.
- **Beam dust `Points`** (`garden-lighthouse.ts:1098-1154`): not visible in any frame; −1 draw (pharos-3).
- **Beam core cone and `bands` rings** (`:973-991`, `:1041`): pharos-3.
- **Halo sphere** (`:785-797`): replaced by the corona sprite (pharos-1).
- **The lantern's opaque glow drum** (`generate-garden-lighthouse.mjs:942-944`): pharos-1.
- **32 of the 36 night windows, and all window emissive by day** (pharos-4 and pharos-5e).
- **One window register (12 windows) and 6 u of keep** (pharos-2).
- **The precinct's square cliff box and three of the four dry-stone wall runs** (`garden-precinct.ts:70`, `:76-90`). The alternating 0.28–0.34 blocks read as merlons from the camera (`noon-base-crop.png`, right).
- **Half the lean of niwaki #0** (spell-breaker 8).

## Reversals
1. **"Three rows of lit arched windows… 38 units to the sceptre tip" (Epic Pharos D1; changelog `pharosville-changelog.ts:91`; `garden-observatory-slice.ts:41-46`).**
   - **Evidence:** at night the window grid equals the beacon (L\*82 vs 93). By day the keep is 60% of the frame's vertical and reads as an office block on a coaster (`noon.png`, `noon-base-crop.png`).
   - **Argument:** keep the world crown and beacon heights (the composition and beam contracts hold), but spend 6 u of shaft on rock. This is not "raising the tower" (§6 rejection). It lowers the monument's share and adds the missing headland.
   - **Risk:** re-pinning the C3 constants and the model contract; hero reflection re-alignment.
2. **"The tower's window rows… wake with the sky" (changelog `:43`; `garden-day-cycle.ts:401-408`).**
   - **Evidence:** spell-breaker 3.
   - **Argument:** the beacon only dominates if the shaft is dark. Four stair lights, kindled by the existing keeper beat, keep the "lived-in" warmth at a fraction of the salience.
   - **Risk:** operators who liked the lit tower. The phase fallback keeps it from ever looking dead.
3. **D3 smoke daymark ("the smoke column is the day signal", `garden-day-cycle.ts:352-361`).**
   - **Evidence:** it is absent at noon in every capture and wrong-coloured at dusk.
   - **Argument:** it has cost a draw and a failure mode for three generations of tuning. The mirror glint (`:362-367`) is the better day sign.
   - **Risk:** the day crown loses a (theoretical) life cue; accept that.
4. **The comment-level claim that the end-on smudge is fixed (`garden-lighthouse.ts:1044-1047`).** It is not (`night-beam-f0-crop.png`). The fix must be a shading-model change, not another scalar.

## Cross-lane dependencies
- **Camera:**
  - Place the tower axis at 58–62% x (reborn W1.2's "~62%" was never realised), with the crown at 14–18% from the top edge.
  - With pharos-2 the world crown height is unchanged, so this is a framing move only.
  - The safe rectangle must include the new headland diagonal.
- **Water:**
  - Replace the dashed ruled beam road (`garden-water.ts:1275-1283`) with a 3–4 u broken glitter path gated by a normal/half-vector term (spell-breaker 9).
  - After pharos-1 and pharos-4, only the lantern and 4 stair lights feed the hero reflection. This helps water-2's worm fix.
  - pharos-6 and pharos-2 need the shore-foam band to follow the new waterline (shore field).
- **Garden / vegetation:**
  - Re-seat the niwaki into rock clefts on the new benches (root flare over stone), and fix niwaki #0's lean.
  - The pond is a round disc ringed by bead karikomi (`noon-base-crop.png`: "moat and peas"). An irregular pond with a suhama pebble edge belongs to that lane and fits the lee bench of pharos-2.
- **Sky / post:**
  - Once the lantern is the only source above 3 linear, the global bloom strength can drop.
  - pharos-8 lives in the shared fog chunk, so coordinate with the fog owner.
  - Night field darkness (the moon streak at L\*19 is currently brighter than anything the beacon throws on water) stays their call.
- **Life / director:** pharos-4 extends the keeper ritual's last 18%. No new beat kind; the director's cadence is untouched.
- **Data:** no new meanings. The PSI encodings on flame, flicker and sweep, and the dwell on the largest contributor, are preserved. pharos-4 is registered as decorative.
- **Perf / headroom:**
  - Net across pharos-1 to pharos-3 is −1 draw / about −3.5k tris. pharos-2 needs a GLB regen plus the island rebuild. Everything stays inside the 8-draw / 45k-tri model budget.
  - **No idea in this lane adds a texture.** This matters because the whole-map census is at 72/72, per LaneHeadroom.
  - All ms figures above are analytic `[INFERENCE]` at 1600×1000@1x. Scale them about ×4 for the operator's DPR-2 display. Every GPU-side addition here is shader-only, and pharos-1 to pharos-3 remove ≈11 µs/draw of CPU submit net.
