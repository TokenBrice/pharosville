# D — Conflicts, dependencies, reversals, budgets

Sources: all 19 `reviews/<lane>.md` (Reversals, Cross-lane dependencies, and any idea whose How/Risks names another lane), `docs/pharosville/VISUAL_INVARIANTS.md` (the bible), `agents/pharosville-reborn/reviews/decision-ledger.md` (the ledger).

Notation:
- Idea IDs are exact (`water-2`, `garden-master-1`).
- `<lane> D<n>` = spell-breaker (defect) n. `<lane> sub` = Subtractions. `<lane> R<n>` = Reversal n. `<lane> xl` = Cross-lane dependencies.
- Numbers are copied from the reports. Anything I add is marked **[CAT]** (catalogue observation, not a lane position).

---

## Consensus

Findings or ideas that at least three lanes reached independently. Parameter disagreements are listed so the plan can pick one value.

| # | Theme | Lanes and IDs | Shared claim | Parameter disagreements |
|---|---|---|---|---|
| C1 | Rest shot: off-centre hero, crown air, no zoom-maximiser | pharos D10/xl; `garden-master-1` (+ garden-master R1); `camera-1` (+ camera D2, R3); `art-director-1` (+ art-director D2, R2); harbour xl ("rest seat may move") | `camera.ts:177` maximises zoom. The rest pins at 1.15 with the tower centred at x≈0.50 and 58 % of frame height (art-director verdict measures 65 %). Composition must drive the solve; zoom should not. | **Tower x:** pharos 58–62 %; camera foot 0.58–0.66 (aim 0.62); art-director foot 0.58–0.66 (aim 0.62); garden-master foot 0.62–0.70 (aim 0.66). **Crown y from top:** pharos 14–18 %; camera 0.12–0.18 (aim 0.15); art-director aim 0.12; garden-master 0.18–0.24 (aim 0.21). **Tower span:** camera 0.40–0.47 (aim 0.44); art-director aim 0.48 (≈48 %); garden-master ≤0.38 H. **Zoom term:** camera 0; garden-master +0.1·zoom (zoom 0.88–0.92); art-director +0.5·zoom (rest 0.95–1.0). **Eye height:** camera 14–16 u; garden-master 14–18 u (≥14). **Pitch:** camera 2.5–3.5° at the seat. **Seat:** camera eye ≈ tile (136,164) at yaw 45°, or yaw 30–35° from ≈(118,172); garden-master target tile (62–64,102–104) with the engawa (86,134) raised 6–8 u. **Station guard:** art-director keeps `nearFlagBand`; garden-master raises station exclusion 14→24 tiles and rejects massing in the lower 45 %; camera adds an `inletCorridor` rect. |
| C2 | The bible's threshold bough never renders | garden D1 / `garden-1`; garden-master D1 / `garden-master-1`; camera D4; art-director D1 / `art-director-1` | The bough is authored eye-relative (`garden-rim-mesh.ts:912-937`), about 56° off-axis. It projects off-frame at every gate. | The remedy is contested; see K2. |
| C3 | Delete `ship-wake-detail` hairlines (84 of 279 draws) | headroom D2 + sub; water xl; `fleet-motion-3` + fleet-motion D3/sub; garden-master sub; art-director sub; critic D9 / `critic-2` / sub; fleet-craft xl | 1-px white `GL_LINES` read as scratches. Deleting them saves 84 draws and ~0.9 ms CPU [INFERENCE]. | **Scope:** delete all (headroom, fleet-motion, critic, art-director, water); fleet-craft limits them to the hero band (>60 draws freed); garden-master keeps "a soft wake only on a moving hull". `ambient-journey-8` still assumes they exist (alpha × (1 − 0.4·idleDepth)). |
| C4 | Delete the world-fixed, two-sided moon band now | water D3 / sub / `water-4`; light D3 / `light-3`; printmaker D3 / sub 1 / `printmaker-6`; critic D2 / `critic-1` / R; garden-master D6; pharos xl (moon streak L\*19) | `garden-water.ts:1171-1184` draws an island-anchored gaussian band that ignores the eye. It is brighter than the tower. Delete it before any replacement lands. | **Attribution:** art-director D9 attributes the night bands to the beam road/pool [INFERENCE]; critic D2 says explicitly "not the beam". **Replacement technique:** see K4. |
| C5 | Put a visible moon in frame | `sky-5`; `light-3` + light-6; `water-4` (depends); `printmaker-6` (depends); water R, sky R, light R2 | The moon at azimuth 0.62π, elevation 0.29π (`garden-sun.ts:75-76`) is behind the camera, so the bible's second night light has no source. | **Elevation:** `sky-5` uses `asin(uSkyVisibleHeight)·(0.12+0.62·sin πq)` inside the ~0–12° rest sky window; `light-3` uses 1.4°–8.9° (≈8° at 21:00, 18° left); `water-4` assumes ~15–25° **[CAT: above the 0–12° visible band sky measures]**. **Azimuth:** sky-5 and light-3 both use ±23°. **Brightness cap:** sky-5 disc peak ≤0.8 of beacon after bloom; light-3 disc ≤L\*80. |
| C6 | Lift the night sky so silhouettes read | `sky-6`; `printmaker-5`; `light-3`; `critic-1` step 5; light D3 (r = −0.19) | Night sky L\* 2–3.4 against the bible's 9/14/11. Land must sit darker than the sky. | **Targets:** sky-6 zenith L\*≈7.5, horizon ≈15, ridges 9–11; printmaker seam 11–15, top 5–8; light top row 8–14; critic 9–14. **Dissent:** art-director's verdict says night is the only frame on plan ("Night must not regress", `art-director-2` risks); `pharos-8` wants top-left sky ≤L\*5. |
| C7 | The beacon must be the one dominant night light (floodlight, statue, windows) | pharos D1/D3 / `pharos-1` / `pharos-4` / `pharos-7`; `light-3` + light sub; critic D7 / `critic-1`; garden-master D7 / `garden-master-5`; `water-2` (windows as embers) | The lantern (L\*93) ties the windows (82). The PointLight floods the tower. The statue self-glows. | **PointLight:** light `night·8.2 → ≈night·3.0`; critic `0.95 + dusk·1.2 + night·2.4`, distance 46→30. **statueGleam:** pharos-7 `0.06 + dusk·0.18 + night·0.05`; critic-1 `0.22·daylight + dusk·0.5`, night 0, metalness 0.85→0.6; garden-master-5 day 0, dusk ≤0.4, gilt → verdigris. **Flame:** pharos-1 core ≈4 linear, the only element >3. |
| C8 | Beam end-on smudge / hard tube | pharos D2 / `pharos-3` / R4; headroom D3 / `headroom-2` / R4; printmaker D5; garden-master D6; art-director D5 / `art-director-5`; critic D7 / `critic-1`; sky xl; ambient-journey xl (daylight beam near 0 until blue hour) | The additive cone shades its surface. End-on it becomes a grey-brown disc (`night.png` ~690–760, 210–290). | Remedies conflict; see K9. |
| C9 | Artefact at the crown by day | pharos D6; life D3; art-director D6; critic D6; garden-master D5; sky sub; ambient-journey D6 | A blue-grey feather or puffs sit on the statue in noon/morning/golden frames. | **Attribution differs:** beacon daymark smoke (pharos [INFERENCE], life, art-director); autumn-geese billboards mis-anchored by ortho math (critic, `garden-sky-billboards.ts:115-123`); a bird flock (garden-master, ambient-journey reduced-motion); sky sub names the static geese at ~(900,300). Needs one `--draw-census` before fixing. |
| C10 | Golden hour is a single orange wash with no cool complement | sky D1 / `sky-1`; light D2 / `light-2`; printmaker D1 / `printmaker-1` / `printmaker-4` / sub 3; art-director D3 / `art-director-2`; garden-master xl | Key, ground bounce (`timber_mid`), fog = horizon colour, orange IBL and grade all stack warm. | **hemiGround:** light-2 `stone_mid.lerp(deep_sea_1,.3)`; printmaker sub 3 / pre-test night value `deep_sea_2.lerp(timber_dark,0.46)`. **Golden key:** light-2 `sun_day_warm.lerp(lantern_warm,.45)` @3.0. **Golden hemiSky:** light-2 `fog_blue.lerp(sky_day_zenith,.45)` @.5; art-director-2 `fog_blue`. **Grade:** light sub highlightTint `[1,1,1]`, split .35; printmaker-1 split → 1.0 (retire); art-director-2 golden shadowTint `[0.93,0.95,1.08]`, highlight blue 0.94, split 0.5, day shadowTint `[0.95,0.985,1.05]`. **LUT:** light removes golden/night orange boosts; printmaker-8 `LUT_STRENGTH` 0.9→0.5. |
| C11 | Noon "white wall": the middle band is 20–50 L\* too light | light D4 (+ ninths); critic D1 / `critic-4`; art-director D4 / `art-director-2`; `sky-2` (far band std 1.2); printmaker D7; data-poetry D2 / `data-poetry-1`; fleet-craft D2 (far band 68 vs 42) | Linear fog + height fog + day mist + haze erase recession. Right-middle ninth L\* 77–91 vs 42. | **Mechanism:** critic `fog.near = islandDistance+70`, `FOG_FAR_BEYOND_EDGE` 1.35→1.7, height fog ×0.5 by day; sky-2 aerial function with T = 0.55 at island far rim and haze 0.42→0.12; art-director day fog density −25 %, horizon −12 L\*; data-poetry-1 haze `0.42 − 0.14·max(signed,0) + 0.3·max(−signed,0)` (≈0.28 at BEDROCK) and fog start +~20 %; light noon haze cap ≈L\*80 and exposure day 0.96. **Target right-middle:** ≤55 (critic, fleet-craft-3); 50–55 (art-director); light middle row ≤55/55/50. |
| C12 | Borrowed hills are ghosts | sky D4 / `sky-3`; `data-poetry-1`; `garden-master-1` step 5 (align cone); `camera-1` (shakkei scale); printmaker D7; `art-director-3` (band B at hill foot) | Ridges at alpha 0.34–0.41 on 11-point cones never close the distance. | Opacity semantics conflict; see K39. |
| C13 | Hero reflection: squiggles, lily pads, too bright | water D2/D8 / `water-2`; critic D8 / `critic-7`; art-director D9 / `art-director-5`; `pharos-1` / `pharos-4` (fewer sources) | Isotropic `surfaceNormal.xy·0.008` (`garden-water.ts:1157`), no blur, weight up to 0.85. | **Anisotropy (conflicting axes):** water-2 displaces reflected-v only, horizontal ≤0.15×; critic-7 `x 0.004 / y 0.018` plus horizontal gaps; art-director-5 `x 0.012 / y 0.003` with 4 vertical taps. **Weight:** water-2 ≈0.7 peak; critic-7 clamp 0.85→0.6. **Darken:** water-2 ×0.8; critic-7 `mix(0.72, deep·1.4, .25)`; art-director-5 ×0.85 and −15 % saturation. water-2 alone adds mips/LOD. |
| C14 | Calm water is a flat dyed plate | water D4 / `water-3`; critic D2 / `critic-2` / R (calm mirrors); reduced-noon mint noted by both | Calm tint 0.62, depth 1.22, flattened normals, glitter zeroed. | **Calm depth 1.22→0.95:** water-3 and critic-2 agree. **Glints:** critic keeps 35 % glitter inside `mirrorZone`; water-3 uses probe roughness 0.06 instead. |
| C15 | Near and inlet water is too busy | water D5 / `water-5` / `water-2` (h); printmaker D4 / `printmaker-3` / sub 4; art-director D8 / `art-director-6`; ambient-journey (water = dominant noise) / `ambient-journey-8` | The foreground chop is the highest-frequency texture in the frame. | **Gerstner normal gain 18:** water-5 → ~8 near camera; printmaker → 11 ×uDaylight (2nd octave ×0.6). **Inlet:** water-2 `harborCalm` ×0.5; art-director-6 `mix(1.0, 0.18, calm)` plus tiling ×0.6. **Idle:** ambient-journey-8 ×(1−0.25·idleDepth). |
| C16 | Risk should read from surface texture, not only dye | `water-3`; `printmaker-3`; `art-director-6` (partial); `fleet-motion-2` (danger hull echo); data-poetry table (risk half-legible) | Adds a non-colour carrier for the DEWS band. | Carrier hierarchy conflicts; see K7. |
| C17 | Chain flags too big and too chromatic | harbour D1/D2/D4 / `harbour-2` / R1 / R2; art-director D7 / `art-director-4` / R1; critic D3 / `critic-3` / R | Raw brand hex out-chromas vermillion (Tron C 0.256). The ×4.2 scale puts the ETH flag at 29 u beside a 30.2 u beacon. | Design conflicts; see K28. |
| C18 | Pines read as palms and parasols | garden D2 / `garden-2` / R2; garden-master D3 / `garden-master-4`; art-director D12 / `art-director-7`; harbour xl | The pad is an inverted cone `CylinderGeometry(0.36,1,…)`. | **Pad shape:** garden-2 uses 3–5 `IcosahedronGeometry` lobes, y ≥ −0.18, y×0.42, underside ×0.40; garden-master-4 uses ellipsoid clusters with sy/sx≈0.25, underside ×0.55, aspect ≥1.3; art-director-7 uses flattened ellipsoids at 2.2:1 over 3–5 tiers, value lerp 0.7 → `timber_dark`. **Tris:** garden +35k; garden-master −20k to −40k (after count cuts); art-director +5–15k. |
| C19 | Flora is a nursery: cut and cluster | `garden-4` / `garden-8` / garden sub; `garden-master-4`; `art-director-7` | Too many evenly spaced specimens, a bamboo "palm" read, and vermillion momiji. | Counts conflict; see K35. |
| C20 | Vermillion is diluted | garden D3 / `garden-3`; `garden-master-7`; harbour D1; art-director D7; critic D3 / D10; `fleet-craft-2` (ceilings below 0.18) | Flags, maples, torii, strakes and spar all compete with the anchor. | The allowed exceptions conflict; see K26 and K27. |
| C21 | Reeds (and props) stand in open water | garden-master D2 / `garden-master-2` / sub; garden D7; critic D4 / `critic-2` / R (scale ×1.5→1.0); art-director sub | Three reed tufts at tiles (75, 97–107) sit inside the inlet ma. | Other lanes reuse the reed sites; see K23. |
| C22 | Red spar/pole competes with the tower | `garden-master-7`; harbour xl; art-director sub | A ~140 px vermillion stick sits left of the island. | Remedy: keep only where it marks alert water (garden-master-7), or shorten to ≤1/3 as a low float (art-director). |
| C23 | Stuck or illegible arrival nameplate | garden-master D4; data-poetry D6; ambient-journey sub; chrome D3 / `chrome-5`; critic D16; art-director D11 | "OpenDollar USDO · Calm" is permanent (the 10 s window is refreshed every second), about 2:1 contrast, and pops in and out. | See K19. |
| C24 | Selection hides the selected ship | camera D1/D7 / `camera-2` / `camera-3`; ambient-journey D7 / `ambient-journey-4`; critic D14 / `critic-8`; art-director D10; headroom D5 | Tilt-shift band at ~290 u vs the ship at ~91 u, a rim occluder, and an exponential lurch. | **Anchor:** camera (0.36,0.62) ships / (0.40,0.55) docks; ambient-journey (0.42 W, 0.58 H); critic lower third. **Duration:** camera `T = clamp(1.1 + 0.45·log2(1+d/240), 1.4, 2.4)` s, return ×1.25; ambient-journey `clamp(1.1 + 0.4·log2(…), 1.3, 2.6)`. **Occlusion:** camera yaw ±20°; critic ±6° steps to ±24° then pitch +2°; ambient-journey falls back to zoom 1.05. **DOF:** camera deletes it; critic clamps the focus band. |
| C25 | Cold load: wrong-hour still, then a 320 ms cut | chrome D1 / `chrome-1` / R1; ambient-journey D2/D3 / `ambient-journey-1` / R2; `camera-6` | `garden-noon.jpg` carries v0.16 chrome and a noon light at every hour. | See K17. |
| C26 | Camera breath snaps on input | camera D3; ambient-journey D1 / `ambient-journey-2` / R; `garden-1` (depends on breath) | Binary suppression causes a ~28–29 px jolt per touch (ambient-journey measured). | See K16. |
| C27 | Too much simultaneous motion; transit crosses the ma | `fleet-motion-1` / `fleet-motion-4` / R1; `garden-master-2`; ambient-journey (19 % of pixels move); life D7 | Lissajous pirouettes, a 29 % underway share, and no inlet cost in routing. | Compatible; gm-2's crossing token and fm-4's tide windows should be one scheduler **[CAT]**. |
| C28 | Kindling lamps as the dusk event | `pharos-4`; `harbour-3`; `life-4` (+ `life-1` kindling ritual); `ambient-journey-5`; `garden-master-3`; `sound-4` (tocks) | The bible names "kindling lamps" as the model event, but today lamps light by phase and the keeper walks off-frame. | See K20. |
| C29 | A visible heron | `life-2`; `garden-1` step 7; `data-poetry-3`; life D5 | Today there are two herons and neither is visible. | See K22. |
| C30 | Seasons: beyond four UTC quarters, and no vermillion autumn | `garden-3` / R3 / R4; `garden-master-3` / R3; `life-5` / R4 | 40 momiji turn vermillion on 1 September. | See K24. |
| C31 | The director starves the named rituals | life D1 / `life-1` / R2; ambient-journey D4; `garden-7`; `fleet-motion-1` / `fleet-motion-5` (register beats) | Attract re-claims the single environment slot each frame, and the first-minute caption is a minor arrival. | See K21. |
| C32 | Far fleet reads as planks and cards | fleet-craft D2 / `fleet-craft-3` / R4; critic D5 / `critic-5`; art-director xl; fleet-motion xl | Extruded 0.72-deep slabs with pale decks and a 45 % mark. | Sail tone conflicts; see K32. |
| C33 | Sun-coloured transmission through cloth and leaves | `light-4`; `fleet-craft-4`; `garden-2` step 8; art-director R3 ("sails glowing through") | The backlight is dye-coloured with no view term. | See K33 (formula and ownership). |
| C34 | Whole-map reads as a slab on the sea | water D7 / `water-6`; critic D11/D12; camera D6 / `camera-5`; garden-master R4; `art-director-3` (band B); `sky-2` risk | Hard plate edge, annulus seam, and a sky step at y≈80–92. | See K13. |
| C35 | Headland and precinct box | pharos D5 / `pharos-2` / `pharos-6`; `garden-master-6`; `garden-5`; `data-poetry-2` (site a) | About 4 u of relief under a 38 u tower; a 19.2 × 4.4 × 19.2 box cliff (`garden-precinct.ts:70`). | See K30. |
| C36 | Tower too new: weathering | `pharos-5`; `garden-master-5`; `light-5` (block hash) | Uniform putty stone; orange day windows. | See K31. |
| C37 | Low-sun penumbra | `light-7`; `headroom-8` | Fixed radius-4 PCF. | Only two lanes, but the same goal at a different cost: light-7 radius `lerp(3,7,lowSun)` ≈0 ms; headroom-8 PCSS-lite 16+16 taps, +0.2–0.4 ms, full tier, sun <25°. |
| C38 | Tilt-shift harms the picture | `camera-2` / R2; critic D13/D14; art-director sub; headroom D5; light D7 | The band maths is ortho-era, and it blurs subjects. | Delete vs fix; see K14. |
| C39 | Sail belly and trim | `headroom-5`; `fleet-craft-1`; `fleet-motion-6` | Sails read as flat cards or luff symmetrically. | Technique conflicts; see K34. |
| C40 | Stations as towers intruding on the hero | harbour D3 / `harbour-1`; `garden-master-1` step 3; `camera-1`; art-director xl (Polygon flag, yellow dome) | Station massing and flags sit on the sight line and compete with the Pharos. | Lower all stations (harbour-1) vs move two slots ≥30 tiles (garden-master-1, camera). Compatible **[CAT]**. |
| C41 | Reduced-motion tableau defects | `ambient-journey-7`; critic D15; garden-master D5 / sub; `life-3` (all perched) | Frozen bird smears, a hull heap at Ledger Mooring, and hulls under the chrome. | ambient-journey uses a corner keepout of 180×120 px bottom-right; critic routes through the berth allocator with `MIN_HULL_GAP`. |
| C42 | Birds are hairlines; fewer, readable birds | life D4 / `life-3`; garden-master D5 (60 px crown exclusion); `headroom-5` ("fewer gull flaps"); sound-5 (life by ear instead of count) | Flat XZ triangle fans collapse to 1 px. | life-3: 6 gulls, 0.7 airborne on average, delete ship and quay gulls. |
| C43 | Stale-fog meaning must stay attributable | `data-poetry-1`; `art-director-3` (self-flags treaty risk); `camera-6`; `printmaker-4`; `pharos-8`; headroom xl (D15); `sound-6` | Only stale sources own bounded low fog. | Several lanes still add clock mist; see K6. |

**Same-fix pairs (one implementation each):**
- `water-4` = `printmaker-6` = `light-3` (road part) = `critic-1` step 1.
- `water-6` = critic D11.
- `water-2` ≈ `critic-7` ≈ `art-director-5` (reflection part).
- `water-3` pairs with `critic-2` (calm).
- `light-4` ≈ `fleet-craft-4` (FleetCraft owns the sail retune; light supplies the uniform).
- `light-7` ≈ `headroom-8`.
- `pharos-5` ≈ `garden-master-5` ≈ `light-5` (tower part).
- `garden-2` ≈ `garden-master-4` ≈ `art-director-7` (pad geometry).
- `harbour-2` ≈ `art-director-4` ≈ `critic-3` (flags).
- `fleet-craft-3` ≈ `critic-5`.
- `fleet-craft-5` ≈ `critic-6` (weave).
- The fleet-craft strake subtraction ≈ `critic-3` step 3. Params differ: `GUNWALE_TINT` 1.25→1.0 plus the dye ladder, vs OKLCH C ≤0.08 ×0.8.
- `camera-3` ≈ `ambient-journey-4` ≈ `critic-8`.
- `pharos-1` + `pharos-3` vs `headroom-2` (beam).
- `sky-2` vs `headroom-2` vs `printmaker-4` (air).

---

## Direct conflicts

### K1. Rest seat: change the yaw, or move two south-rim stations?
- **Option A: authored rest yaw.** Proposed by `camera-1` and camera R1.
  - Tiles: yaw ≈30–35° from ≈(118,172), or tile (136,164) at 45° only if stations move.
  - Evidence: `station-scan.ts` finds no 45° eye with crown x 0.58–0.66 at span ≤47 % that clears `watch-south-reed` (110,131). `alt-a`/`alt-c` put the Polygon flag across the frame.
- **Option B: keep yaw 45°, move Polygon `watch-south-reed` (110,131) and BSC `calm-engawa-south` (60,130) ≥30 tiles along the rim.** Proposed by `garden-master-1` step 3 and by camera as the fallback.
  - Evidence: `threshold-noon.png` and `threshold-blue.png`.
  - Also raises station exclusion 14→24 tiles (`camera.ts:113`).
- **Option C: shrink the obstacles instead.** `harbour-1` + `harbour-2` shrink the flag envelope (tip y 26→≈14, reach ±6→±1.5; `camera.ts:70-79`) and cap stations at 8.5–11.5 u (ETH 13.5).
  - `art-director-1` insists the solver keeps `nearFlagBand` and station clearance, because manual cameras drag flags and domes in.
- **Tradeoff:**
  - A: touches every NW-authored relation: the sun/backlight (light D1 says a yaw change "can help"), moon road, flag facing, label offsets, pan maths, and the pins listed in camera-1.
  - B: churns station slots, `dock-layout`/`chain-docks` tests and the W1.16 top-3 re-verification.
  - C: may be enough to make B unnecessary **[CAT]**.
- **Coupled:** light xl and camera xl ask that yaw be chosen together with any `NOON_BEARING` rotation (K10).

### K2. The bough: delete it, or re-seat it (and where)?
- **Delete.**
  - `garden-master-1` step 4 + sub: the engawa pine becomes the near plane (needs `garden-master-4` pads).
  - camera D4 + sub: delete, and root the threshold pine in rim land at the new seat.
- **Re-seat in screen space, lower-left.** `garden-1`:
  - pad cluster at (0.07w, 0.88h), depth 14 u; trunk exit at (0.16w, 1.04h), depth 9 u;
  - root at ~tile (117,134.5), 19 u trunk leaning ~7 u NW;
  - a one-limb kuromatsu that follows the breath by 0.85 and fades over 600 ms off-rest;
  - castShadow off.
- **Re-seat, top-left and bottom-left corners.** `art-director-1`:
  - forward ≈6 u, left ≈3–4 u, pad centroid at screen (0.06, 0.18), value ≤15;
  - kept **soft** by excluding it from the tilt-shift sharp band.
- **Tradeoff and evidence.**
  - garden-1 has projection proofs and keeps the bough at the current rest. It needs the fleet to keep the corner rect [0,0.24]×[0.70,1.0] free of hulls.
  - garden-master-1 and camera-1 argue the threshold must come from moving the eye, not the bough ("the eye must retreat", camera-1).
  - art-director-1's softness depends on tilt-shift, which camera-2 deletes (K14).
  - If the rest seat changes (K1), garden-1 re-solves automatically, but its corner rect must join camera's safe-rect contract (garden xl).

### K3. Moon position and elevation
- **Options:**
  - `sky-5`: displayed pose within ±23° azimuth, rising from the left ridges; elevation `asin(uSkyVisibleHeight)·(0.12+0.62 sin πq)`; real phase from `sky-almanac.ts`, nominal 35° N.
  - `light-3`: ±23°, 1.4°–8.9° elevation, "az −2.67 rad (18° left) at el ≈8°" at 21:00; absent when the real moon is down.
  - `water-4`: "moon into frame at ~15–25° elevation".
  - `light-6`: "22:00 low left → 02:30 climbed and moved right".
- **Evidence:** sky measures the visible rest sky at ~0–12° elevation, ±24.6° azimuth.
- **Tradeoff:** 15–25° cannot appear at rest **[CAT]**; sky-5 and light-3 are consistent with each other.
- **Linked:** the road must land in the inlet at night (camera xl). The night key and tower rim must read `gardenMoonPose` (light-3, light D6). light warns of a backlit, frontal night key.

### K4. Moon-road implementation (one owner)
- **Options:**
  - `water-4`: Blinn half-vector with the real view vector, `pow(dot(n,H), 60–120)`, gated by fine-normal sparkle. Replaces the sine lattices. Re-derive `moonRoadOccupancy` (0.03–0.05 at gain ≈0.2) to hold the 0.016 mean.
  - `printmaker-6`: broken horizontal slats. Pitch `1.6 + 0.02·roadAlong`, `aaStep(0.62, …)`, about 40 % duty, peaks 1.6× the old peak.
  - `light-3`: reuse the `halfMoon` glitter (`:1186-1199`), width ≈6 u.
  - `critic-1`: keep the existing view-dependent glitter, un-gated from `moonBand`.
  - `art-director-5`: "column of scattered silver dashes".
- **Agreement:** all lanes say one owner (water xl, printmaker-6 risks).

### K5. Who owns the air: aerial perspective, fog, haze, mist?
- **Material side, one fog function.** `sky-2`: `gardenAerial` in the fog_fragment injector. It replaces linear `Fog` and the global height-fog mix, keeps only the epistemic shelf, removes the `garden-sky.ts:381-382` seam rule, and drops haze 0.42→0.12.
- **Post side.** `headroom-2`: `GardenAirEffect` in the fused grade pass (HG sun in-scatter, closed-form height fog, beacon beam). It reduces material `Fog` "by the same amount to avoid double haze".
- **Height-fog injection, stepped.** `printmaker-4`: two inks with 3 steps; "at f→1 exactly the horizon colour, so the seam contract holds".
- **Kasumi lobes in `gardenHeightFogGlsl`.** `art-director-3`.
- **Retune existing linear fog.** `critic-4`: `fog.near`, `FOG_FAR`, height ×0.5.
- **PSI-driven clarity.** `data-poetry-1`: haze, mist and `fogRangeAtViewHeight`. "It must be the only writer of daytime mist" (data-poetry xl).
- **Additional writers:**
  - `pharos-8`: beacon in-scatter in the shared fog chunk.
  - `ambient-journey-1`: `arrivalMist` density ×(1+3m).
  - `camera-5`: plate-distance haze.
  - `camera-6`: air veil 1.8→1.0.
  - `sky-8`: storm gain 1.2→0.3.
  - `art-director-2`: day fog density −25 %.
  - `light-6`: fog density 0.9×→1.15× across the day.
- **Tradeoff:**
  - headroom flags the double-fog risk.
  - water xl calls the annulus fog / `horizonFade` a joint seam.
  - art-director xl: ideas 2, 3 and 8 need one owner.
  - critic xl: the fog re-key must land with the night-sky lift.
  - Material fog (sky-2) vs post air (headroom-2) are architecturally exclusive as the primary carrier **[CAT]**.

### K6. Kasumi and clock mist vs stale-fog semantics
- **Clock or aesthetic mist proposals:**
  - `sky-3`: 3 feathered kasumi quads 2–5 u above the horizon, alpha 0.55. Deletes all 9 far `MIST_BANKS` and keeps only `localMist` epistemic banks.
  - `art-director-3`: camera-distance lobes at d0 110/210 u, clock-keyed amplitude (dawn .55, morning .35, noon .12, golden .3, blue .4, night .15).
  - `camera-5`: plate-edge kasumi at whole-map.
  - `ambient-journey-1`: sea-level arrival mist through height-fog density.
  - `critic-4`: keeps the far-shelf mist billboards and removes only the near shelf by day. This conflicts with sky sub, which deletes all far mist banks.
- **Truth guard proposals:**
  - `data-poetry-1` / sub: delete the aesthetic daylight mist so that "when you see mist, it means something".
  - `camera-6`: the veil is air-only and never sea-level fog, "because low fog means stale sources"; drop the veil if Sky cannot separate them.
  - The bible: "stale sources own bounded low fog".
- **Evidence and tradeoff:**
  - art-director-3 itself calls kasumi a treaty risk. It requires camera-distance keying and identical depth everywhere, so it can never look local, and asks the data-truth lane to sign off.
  - ambient-journey-1's arrival mist is sea-level and time-limited (6 s), so it directly contests camera-6's rule.

### K7. Water risk carrier: hue, roughness, or engraving?
- **Options:**
  - `water-3`: surface state carries risk (probe roughness calm 0.06 … danger 0.55). `tintStrength` 0.62–0.70 → 0.15–0.25, making colour a secondary carrier; removes the `SEA_GAMUT_ANCHOR` pull. Its own reversal: water R "Water as a dyed risk map".
  - `printmaker-3`: engraved crest lines per band (watch 0.08 … danger 0.12 width). Keeps zone colours (`palette.ts:182-192`) unchanged, and relies on water's tint cut to become the main within-band carrier. Calm, open and ledger stay blank.
  - `art-director-6`: "Water tint remains the risk-band reading"; the calm mask modulates roughness only, inside Calm or the inlet. Keep danger/warning roughness semantics.
  - `critic-2`: region identity carried by "texture, flow and colour"; lower `boundaryFoam` 40 % for Warning/Danger.
  - `water-5`: slicks masked out of watch→danger.
- **Tradeoff:**
  - water needs whole-map ΔL\* calm→danger ≥12 re-measured.
  - printmaker needs moiré guards and ledger sentences per band.
  - art-director keeps hue primary, which contradicts water's premise.
- **Adjacent vocabularies that must stay distinguishable:**
  - life-6 rings ("must not be confused with wakes or risk-water foam"; bounded to pond and inlet);
  - fleet-motion-3 slicks;
  - water-3 "slick edges" at region seams.

### K8. Wake-field G channel is claimed twice
- **Options:**
  - `water-7`: hull-footprint contact darkness in G, cleared every frame (no decay). Keeps the field awake (~0.1 ms).
  - `fleet-motion-3`: the slick in G, decaying at `exp(−0.035·dt)` (≈30 s) with 0.25 diffusion.
- **Both claim 0 new textures by using G of the same 512² RGBA target (`garden-wakes.ts`).**
- **Tradeoff:** mutually exclusive on G. B/A are unassigned **[CAT]**. headroom-6 separately asks the plan to "assign the channels".

### K9. Beacon beam: fade or flash; mesh or post; halo fate
- **Fade end-on:**
  - `critic-1`: `alpha *= smoothstep(0.92, 0.6, uScatter)`; halo night scale 1.8→1.25, opacity 0.46→0.3; along-fade 0.78→1.0.
  - garden-master D6: fade toward camera.
  - printmaker D5: `1 − |dot(beamDir, viewDir)|`, or a flat pale wedge with one hard edge.
- **Flash end-on:**
  - `pharos-3`: corona × (1 + 5·pow(uScatter, 8)), peak 2.5 HDR, ~0.6 s per ~31 s revolution, no flash under reduced motion.
  - `art-director-5`: route `uScatter` into lantern-glass emissive plus a 4-point star sprite.
- **Where the beam lives:**
  - Mesh with analytic shading: `pharos-3` (one BackSide cone, ray–cone chord density, delete core, bands and dust).
  - Mesh with a tweaked profile: `art-director-5` (`pow(1−across, 2.5)`, along-fade `1 − smoothstep(0.35, 1.0)`); `critic-1`.
  - Post: `headroom-2` / R4 deletes the cone, dust and halo and integrates the beam in `GardenAirEffect`.
- **Halo:**
  - `pharos-1`: replace the sphere with a 6 u camera-facing corona.
  - `critic-1`: shrink it.
  - `headroom-2`: delete it.
  - `art-director-5`: add a star sprite to the existing halo.
- **Also:**
  - ambient-journey xl: daylight beam visibility near zero until blue hour.
  - `pharos-8`: separate beacon fog in-scatter.
- **Tradeoff:** flash is "the image everyone remembers" (pharos-3) vs photosensitivity and restraint. The post version gains occlusion by hulls and tower but moves beam ownership into post (headroom-2).

### K10. Sun direction: side light vs late contre-jour vs real solar geometry
- **Options:**
  - `light-1` / R1: rotate `NOON_BEARING` to −45° (the camera's right vector). Keep ARC_SWEEP 1.0 and NOON_ELEVATION 0.62. Golden sun behind the viewer's right shoulder; the tower's shadow runs away toward the fleet; god rays dawn-only (skip the golden march).
  - art-director R3: swing the key toward contre-jour in the last 30–40 min before sunset. Rim-lit tower silhouette, shadow toward the viewer, sails glowing through. Confidence M, operator decides.
  - `sky-7`: key the beats to solar elevation from date and latitude; `gardenSunPose` elevation from real `e`, scaled so the apex = `NOON_ELEVATION`.
  - `camera-1`: a yaw change moves key/fill (K1).
- **Evidence:** light measures tower faces equal at noon (#838072 / #848172) and at golden, and the sun 176° from the eye at noon.
- **Tradeoff:** light-1 and art-director R3 want opposite golden-hour geometry.
- **Downstream retunes:**
  - `fleet-craft-4` must be tuned on the rotated arc (acceptance at `#t=6`, 17.6, 18.8).
  - `sky-1` follows `uSunDir` automatically.
  - water sun glitter moves to dawn only (light xl).
  - light xl: "land light-1 first and have the others retune against it."

### K11. Golden and noon colour: light rigs, material inks, or grade?
- **Light rigs, no grade.** `light-2`: per-beat rig presets plus authored exposure (dawn 1.0, day 0.96, golden 0.84, blue 1.0, night 1.15). Remove the golden and dawn warm split and the LUT orange boosts. Keep Neutral tone mapping.
- **Material shade plate.** `printmaker-1`: an ai-zuri ink plate in indirect light (golden `fog_blue` at 0.6, etc.). Grade split can go to 1.0.
- **Per-material ink ramps.** `printmaker-8`: `LUT_STRENGTH` 0.9→0.5.
- **Cool grade.** `art-director-2`: *adds* cool grade shadowTints to DAY `[0.95,0.985,1.05]` and GOLDEN `[0.93,0.95,1.08]`, plus sky-preset and fog changes.
- **Tradeoff:** light and printmaker cite the bible's "atmosphere before grade" to retire grade knobs; art-director uses grade as one of three levers. printmaker xl: any key:fill or PMREM retune should land after or with printmaker-1.

### K12. Night fill and sky floor
- **Options:**
  - `light-3`: lift the night hemisphere sky to `sky_horizon.lerp(fog_blue,.4)` at .16 so sky, hills and far fleet reach 8–14.
  - `printmaker-5`: "Hold the night hemisphere/ambient where it is so land stays dark."
  - `pharos-8` acceptance: top-left sky ≤L\*5.
  - `sky-6`: top-third L\* 7–9.
  - `art-director-2`: night must not regress; already on plan.
- **Tradeoff:** the fill lift reveals the far fleet; holding the fill keeps land darker than sky (printmaker's "sky ≥ 2× land" rule).

### K13. Whole-map: floor the zoom, or re-pitch into a chart?
- **Options:**
  - garden-master R4: floor zoom at ~0.5; overview goes to the DOM ledger/Explore (lower confidence).
  - `camera-5`: keep min zoom, ease pitch 3°→38° between `edgeHiddenZoom` and min; plate-distance haze.
  - `water-6`: annulus shore and a 20 u crossfade.
  - `art-director-3`: band B hides the plate edge at 0.28.
  - critic D12: floor `uSkyVisibleHeight` at sin 6°.
  - `sky-2`: fog must fully cover the annulus by 480 u.
  - `harbour-1` acceptance: at whole-map "the Pharos is the only vertical".
- **Tradeoff:** a floor loses remote-harbour discovery and the 0.28 budget tests. The chart re-fits shadow and fog frustums. The whole-map arm is where textures sit at 72/72.

### K14. Tilt-shift: delete, fix, or reuse?
- **Delete:** `camera-2` / R2 (−2 draws, −2 half-float targets). critic D14 endorses; art-director sub (on selection).
- **Fix:**
  - headroom D5: CoC-weighted gather, +~0.1 ms.
  - light D7: bias the band by `targetHeight`.
  - `critic-8`: clamp the focus band to include the selected hull.
- **Reuse:**
  - `art-director-1`: keep the bough soft by excluding it from the sharp band.
  - `garden-1`: optional near-field softening.
  - `printmaker-2`: inherits `EffectAttribute.DEPTH` that tilt-shift currently forces. camera-2 keeps DEPTH only if the keyline adopts it.
- **Evidence:** `selected-ship.png`; `postcard-garden-shore-golden.png`; critic D13 (compact seam, suspected tilt-shift, unverified).

### K15. SMAA off at DPR ≥1.75 vs keyline antialiasing
- `headroom-1` / R1: disable SMAA at DPR ≥1.75 (−3 passes, −4 textures); re-run the RMSE A/B at `--dpr 2` first. The ledger row 13 keeps both.
- `printmaker-2`: the keyline effect runs first in the grade pass "so the ink is … antialiased by the SMAA pass that follows".
- `fleet-craft-8`: hero rigging relies on MSAA staying on (ledger note).
- **Tradeoff:** at DPR 2 the keyline loses its SMAA pass **[CAT]**.

### K16. Camera breath: keep and ease, or idle-only?
- **Options:**
  - camera D3: eased `breathWeight` (out τ 0.5 s, in τ 5 s), phase keeps integrating, weight 0.5 during postcard holds, breathed pose passed to hit-testing. Amplitudes unchanged (yaw ±2°, pitch ±1°, dolly ±1.5 %).
  - `ambient-journey-2` / R (W1.3): breath only after 45 s idle. w = 0 while hovering or selected and while a tour holds. Amplitudes ±0.8° yaw, ±0.6° pitch, ±1.2 % dolly.
  - `camera-4`: breath 0.5 during postcard holds.
  - `garden-1`: the bough rig assumes ±3.3 u / ±2° yaw breathing (≤70 px limb drift).
- **Breath period:**
  - `ambient-journey-8`: `GARDEN_BREATH_SECONDS` 9→10, plus `idleDepth` slow-down.
  - `sound-1` / `sound-3`: bind audio to the 9 s breath ("≈0.1 Hz HRV"; sound xl: audio follows automatically, but "no lane may add a second wave clock").
- **Tradeoff:** perpetual life vs tripod stillness. The postcard-hold breath is 0.5 vs 0.

### K17. Arrival and loading: stills, mist, or rise?
- **Options:**
  - `chrome-1` / R1: five chrome-free, hour-matched stills (AVIF), captured at the *current* arrival start pose (offset −72/+48, zoom ×0.82). 1.4 s dissolve; dolly starts at 60 %.
  - `ambient-journey-1` / R2: no picture. Inline hour gradient, then sea-mist through height fog (density ×(1+3m)), a 900 ms veil fade, arrival pose offsetY −28 and zoom ×0.95, 7 s quintic. Drops `garden-noon.jpg` in-app.
  - `camera-6`: eye rises 3 u, pitch −1°→rest over 10 s; an air-only veil 1.8→1.0 over 6 s; no lateral slide.
- **Tradeoff:**
  - chrome-1's registration depends on the arrival pose that ambient-journey-1 and camera-6 change. It also needs regeneration whenever the rest camera changes (chrome xl).
  - The mist mechanism conflicts with camera-6's no-sea-fog rule (K6).
  - Durations differ: 9 s (chrome's "nine-second settle"), 7 s (ambient-journey), 10 s (camera-6).
  - The loading-line move into the caption slot is shared by chrome-1 and ambient-journey-1.

### K18. Caption and label fade timings
- `chrome-2`: 800 ms out + 1000 ms in.
- ambient-journey D5: 400 ms out + 600 ms in.
- `chrome-5` nameplate: 600 ms in / 900 ms out.
- critic D16: 400 ms fade.

### K19. Arrival nameplate: restyle, gate, or drop?
- `chrome-5`: boxless Garamond ink label with a leader.
- data-poetry D6: drop the chip for arrivals; the caption carries it.
- critic D16: ≥90 s quiet gap.
- ambient-journey sub: at most one chip (the admitted subject).
- art-director D11: ember ink at 60 % when night >0.5.
- `fleet-motion-5`: fix the caption truth (issuance clause only when minting or redeeming; the actual berth).

### K20. Kindling: who, where, what order, how long?
- **Options:**
  - `pharos-4`: after the keeper's rim walk, 4 stair windows light upward, then the lantern kindles over ritual progress 0.96→1.0.
  - `ambient-journey-5`: **no figure** ("avoids fantasy-village lore"). The beacon catches first in three breaths (0–9 s), then mole lamps kindle outward at 0.8 s steps. `keeper` beat priority 50, 60 s. Displaces the almanac lantern-round spheres.
  - `life-4`: a 1.7 u keeper figure walks the island quay stair and S-path, lighting island lamps behind him. A 150 s foreground ritual; "the beacon takes over the night" after the last lamp. Displaces the perimeter-rim walk.
  - `harbour-3`: the keeper walk lights one kasuga per station plus one shoji, in walk order around the harbour. `keeperPath` must reach the harbour ring; the western arc stays dark.
  - `garden-master-3`: the engawa tōrō fades in over 20 s at sun −2° as "the day's event". garden-master xl: "no second dusk event competes".
- **Also:** `sound-4` keeper tocks need a lamp-lit count.
- **Conflicts:**
  - Beacon first (ambient-journey-5) vs beacon last (pharos-4, life-4).
  - Keeper path on the perimeter rim (current; pharos-4) vs island (life-4) vs harbour ring (harbour-3).
  - Figure vs none.
  - Which lamps.
  - Duration: 60 s, 150 s, or the existing 180 s beat (sound-4 cites 180 s).

### K21. Director beat budget and dusk crowding
- **life-1 score:**
  - ritual priority 30 pre-empts arrivals;
  - silence after a ritual 8–14 min;
  - ≤5–6 foreground gifts per 24 h, never two within 8 min;
  - arrivals keep a 6–12 min rhythm;
  - attract is not a director client and backs off 90 s after a ritual.
- **Competing requests:**
  - `ambient-journey-5`: keeper priority 50, 60 s.
  - ambient-journey D4 / `ambient-journey-1`: 90 s initial silence.
  - `fleet-motion-1`: tide swing every 300 s registered as an environment beat, with a ±30 s slack hush **[CAT: that is a beat every 5 min, against the 8–14 min silence]**.
  - `fleet-motion-4`: departures on the ebb and arrivals on the flood windows.
  - `fleet-motion-5`: ceremony only in-frame; relies on the 2–4 min director interval.
  - `garden-7`: leaf fall at most every 20–40 min, via `requestGardenBeat`.
  - `harbour-4`: anniversary lantern at dusk phase 0.35, 150 s drift.
  - `life-2`: heron departs golden 0.6 → blue 0.2; kindling window blue 0.05–0.6.
  - `life-8`: skein 70 s at dawn.
  - sky sub: skein "at dusk in about 90 s".
  - `pharos-3`: flash every ~31 s ("the one event the night keeps repeating").
  - `camera-4`: postcard holds of 180–360 s.
  - `ambient-journey-3`: Stay caption surfaces on the hour.
  - `sound-3`: music windows of 4–7 min, never during a foreground beat.
- **Tradeoff:** the dusk window carries up to 7 claimants (kindling ×5 variants, heron departure, anniversary lantern, skein per sky, moonrise per life-1/sky-5, Belt of Venus) under a bible that asks for "an event, then quiet" **[CAT]**.

### K22. Heron location and timing
- **Options:**
  - `garden-1` step 7: move `GARDEN_HERON_PERCH_WORLD` to the crane islet's dominant stone, projecting to (1200,636) at rest, "against dusk water".
  - `life-2`: `GARDEN_HERON_STATION` at the reed-lily site nearest the camera (`noon.png` 250–490, 740–850). Arrives 08:30–10:30, stands all day, strikes ≤2/h, departs at golden.
  - `data-poetry-3`: the heron "prefers the exposed flat" west of the island.
- **Tradeoff:** three sites. life-2's site is the reed cluster others delete (K23). garden xl asks hulls to stay ~4 u from the crane islet for the heron.

### K23. Reeds: delete or keep as anchors?
- **Delete or re-seat:**
  - `garden-master-2` / sub: delete the three calm reed banks, or move them ≥ `halfWidth` from the spine.
  - garden D7: root them on a bar, or delete at rest.
  - critic D4 / `critic-2` / R: delete all seven reed-lily sites from open water and revert scale ×1.5 → 1.0.
  - art-director sub.
- **Use as anchors:**
  - `life-2`: heron station.
  - `life-7`: fireflies anchored to the reed-lily sites (`garden-sea-edges.ts:377`).
  - `data-poetry-3`: tidal flat "among the reeds in the pale shallows west of the island".
- **Tradeoff:** the ma vs anchoring life to a visible shallows **[CAT: life-2 cites the same screen region the deleters cite]**.

### K24. Seasons: continuous per-tree, a phenology table, or 72 kō?
- **Options:**
  - `garden-3`:
    - continuous `seasonPhase(date)`: blossom bell at DOY 95 ±9; flush DOY 100–135;
    - per-maple `turnDay = 298 + stableUnit·28` with a 10-day ramp and bare by +14…26;
    - snow weeks (DOY 350–59, 20 % chance);
    - three derived autumn tones with C <0.14; evergreens never change.
  - `garden-master-3`: a date table for threshold specimens only (momiji 5–25 Nov on 3–5 specimens; cherry 28 Mar–10 Apr; **higanbana ≤12 stems, vermillion**, 18–30 Sep; susuki/hagi Sep–Oct). Explicitly "not a 72-kō system".
  - `life-5`: 72 kō from solar longitude as the *event* calendar and DOM caption. Keep `seasonFromDate` for tree crowns. Gates fireflies (kō 24–28), geese (48–65, 13–16) and leaf fall (51–56).
  - `art-director-7`: seasons (momiji, cherry) keep their clock role on the **far** rim; retire momiji from the camera-side rim.
- **Conflicts:**
  - Momiji timing: garden-3 turn DOY ≈298–326 vs garden-master-3 5–25 Nov.
  - Cherry: garden-3 DOY 95 ±9 vs garden-master-3 28 Mar–10 Apr.
  - Location: camera-side threshold (garden-master-3), in-frame island maple (`garden-7`), or far rim (art-director-7).
  - Vermillion (K27).
- **Also:** garden-3 and garden-master-3 both need a date-override seam for evidence.

### K25. Leaf and petal events
- `garden-7`: generalise the petal drift into `garden-seasonal-drift`; one release per 20–40 min when gust >0.6 from the in-frame maple or lee cherry.
- `garden-master-3`: keep either the petal dressing or the phenology notes ("one or the other").
- `life-5`: leaf fall in kō 51–56 "reusing the petal budget".
- `data-poetry-5` explicitly rejects petals accumulating by days away.

### K26. Torii: delete or keep?
- **Delete:** `garden-master-7` / R2 deletes both torii (landing and islet) as costume. The gull perch is re-homed on a stone.
- **Keep, implicitly:**
  - `harbour-2`: "the torii is once more the only red that sings".
  - `art-director-4` and `critic-3` acceptance: no flag exceeds the chroma of the vermillion torii.
  - `light-5`: lacquer torii material (roughness 0.35, envMapIntensity 1.2).
  - `life-3`: gulls stand on "the sea wall and the torii".
  - data-poetry D1: the hoist "outshouts the torii".
- **Evidence:** PRODUCT's costume anti-reference; plan §6 rejects "more torii" (garden-master).

### K27. Where vermillion may appear
- `palette.ts:31-32` (garden D3) reserves vermillion for the beacon flame and DEWS DANGER.
- `garden-3`: no vermillion in flora.
- `garden-master-3`: vermillion higanbana ≤12 stems as the seasonal note.
- `garden-master-7`: ≤2 red regions in the rest frame (seasonal note + danger water).
- `life-6`: one "vermilion-and-white" koi. garden-master-7 counts koi as dilution.
- art-director sub: shorten the red pole.
- critic-3: "the highest-chroma object on the rim is a vermillion torii or buoy".

### K28. Flag design (three variants)
- **`harbour-2`:**
  - Field: undyed kinari (L≈0.86, C≈0.03).
  - Mark ink clamped to OKLCH L 0.40–0.50, C ≤0.10.
  - Scale `(0.95 + 0.25·supply)` with no ×4.2 (≈1.0–1.2 × 3.0–3.8 u); pole tip ≤13.7 u; ETH gets a *pair*.
  - Motion: shader cloth with `aGust`. Night: ≤ sail luminance. Delete 9 cut shapes.
- **`art-director-4`:**
  - Field: palette-dyed from a 6-dye set, C ≤0.10.
  - Mark in **brand colour** at ~45 %.
  - Cloth 0.6×, 1:2.4 portrait; hoist tip below the tower's third tier.
- **`critic-3`:**
  - Field: brand hue kept, OKLCH C ≤0.09, L 0.38–0.62, 20 % toward `fog_blue`.
  - Logo ink full contrast (white).
  - Multiplier 4.2 → **2.4** (ETH ≈4.6 × 3.1 u); strake C ≤0.08 ×0.8.
- **Tradeoff:** undyed vs dyed field; brand-hue mark vs muted ink; portrait nobori vs a smaller landscape flag. All three reverse ledger rows 22 and 25.

### K29. Graveyard: stones on land, or wrecks in the cove?
- **Options:**
  - `data-poetry-2` / R3 / R4: replace the wreck batches with 88 stones in raked gravel on land (the precinct court or the engawa shade). Retire Wreck Shoal as a named water. Remove cause-colour stains. Show all 88 (drop `WRECK_QUIET_CEILING`).
  - `harbour-4`: an anniversary paper lantern drifts from a **wreck** at dusk. Adds an algae band to the wreck hulls.
  - `harbour-5`: keep the wrecks, remove the ~18 per-hull marker stones, one gathered stone cluster, cause stain moved to the bow stem.
- **Evidence:** ledger row 29 "graveyard holds"; `wreck-shoal-close.png` (18 of 88, at water luminance).

### K30. Island court and precinct
- **Options:**
  - `pharos-2`: delete the cliff box; `headlandHeight` crag peak +8.5; `COURT_Y` 11.05; keep the gravel court; dry-stone on the seaward side only; engawa to the lee bench; keep crown and beacon world heights.
  - `garden-master-6`: break the box into 3–5 offset slabs with a moss cap; suhama pond edge; sanzon triad (1 : 0.6 : 0.4) at the court's SW corner leaning 8–12° to the tower; delete the egg stone.
  - `garden-5`: Sakuteiki five-form set stones and a raked court with 6 rings at 0.32 u around a triad.
  - `data-poetry-2` site (a): the stone garden of the fallen on the court, displacing the Sakuteiki stones.
- **Tradeoff:** delete the box vs break it; one court with three claimants. pharos xl assigns the irregular suhama pond to the garden lane, which agrees with garden-master-6.

### K31. Tower weathering and statue material
- **Weathering technique:**
  - `pharos-5`: bake into the GLB vertex colours (`paintStone`): per-block lots, streaks under `OVERHANGS`, verdigris, salt and biofilm, day window emissive 0.
  - `garden-master-5`: a world-space streak term in the runtime `onBeforeCompile`.
  - `light-5`: a block hash of ±6 % albedo and ±0.08 roughness in the rim hook.
- **Statue:**
  - `pharos-7`: dark bronze, one specular line, gilt roughness 0.3→0.22, finials verdigris.
  - `garden-master-5`: the statue moves to verdigris.
- **Tradeoff:** bake vs shader vs hash, and bronze vs verdigris. All three edit the same tower.

### K32. Far fleet tone
- `fleet-craft-3`:
  - `markVisibility = 0`;
  - sail `mix(fogColor·0.55, dyedCloth, 0.22)`; hull `fogColor·0.42`;
  - a hero band of the nearest 16 packed into `aSailAttention.y`;
  - `MARK_MIN_PRESENCE` 0.45→0.3.
- `critic-5`: dark hull at 0.55× and **pale** sails, with a floor of `max(markPresence, 0.45)` on cloth luminance; "cloth hue still carries issuer identity"; an added family-shaped second sail.
- art-director xl: a distance chroma falloff consistent with kasumi; hero ships exempt.
- fleet-motion xl: far slabs slide unless the swell pitch and heave apply to far instances.

### K33. Transmission formula and uniform
- **Formulas:**
  - `light-4`: `dye × uKeyColor × pow(max(dot(V,−L),0),2) × wrap × (1−ink)`; sail emissive day 0.06→0.03.
  - `fleet-craft-4`: `sailCloth × uSunColor × facing × (0.35 + 0.65·through) × uBacklight × 0.55 × (1 − markCover·0.85)`.
- **Uniform:** `uKeyColor` (light-4) vs `uSunColor` (fleet-craft-4, garden-2).
- **Ownership (agreed):** FleetCraft owns the sail retune; Light publishes the uniform.
- **Foliage:**
  - `light-4`: 0.25 transmission tinted `aurora_green` (`garden-flora.ts:30-40`).
  - `garden-2`: `patchGardenFoliageLight` at `pow(max(0,dot(−V,L)),6) × rim × 0.3 × uGolden`.

### K34. Sail belly
- `headroom-5`: a vertex belly `sin(π·u)·sin(π·(1−v))·(0.12 + 0.05·gust)` along the normal, phase from the instance hash, optional 4× tessellation (+20–40k tris).
- `fleet-craft-1`: a baked belly of 0.24·w (fullest at u≈0.38), concave foot, sail centred on the mast, brace ±30–40°.
- `fleet-motion-6`: flip the baked belly by leeward sign, ripple 0.2×, luff only at |AWA| <35°; drives fleet-craft-1's brace.
- fleet-craft and fleet-motion agreed via IRC. headroom-5's separate vertex belly is not reconciled **[CAT]**.

### K35. Flora counts and triangle direction
- `garden-4` / `garden-8` / garden sub:
  - move ~50 of 120 ring pines onto the ridges;
  - bamboo 35→6 in one clump group at one station's back slope;
  - momiji 40→~16;
  - +1 draw ridge canopy (+8k tris).
- `garden-master-4`:
  - pines 120→45 (odd groups) plus 3 heroes;
  - karikomi 80→40; momiji 40→5; cherry 20→3;
  - bamboo "one dark grove behind the Mole" (table: 3 groves);
  - −20k to −40k tris.
- `art-director-7`: retire momiji and broadleaf from the camera-side rim; +5–15k tris.

### K36. Sound: music, market data, and budgets
- **Music:**
  - `sound-3`: breath-paced anhemitonic pentatonic, tonic D. {D E F♯ A B} "quiet" ↔ {D E G A B} "watchful" (PSI <50); ≤45 % of each hour; tacet 00:00–04:45; Music checkbox on by default when Sound is on.
  - `garden-master-8`: "There is no music and no shishi-odoshi."
- **Market data in sound:**
  - garden-master-8: "Market data never makes a sound."
  - sound-3: F♯/G swap on PSI.
  - `sound-6`: stale-feed foghorn.
  - `sound-1`: sea loudness from `seaState` (DEWS + PSI) and storm; thunder rumble at CRISIS+ (sound R5).
  - sound sub: "No sound for market events" (it treats the above as state, not events).
- **Hidden tabs:** garden-master-8 suspends; sound R2 offers an opt-in "keep listening", fading after 30 min.
- **Budgets:**
  - garden-master-8: ≤5 MB, ≤3 voices.
  - sound: bed 0 bytes, samples ≤400 KB, decoded ≤12 MB (R1); ≤6 event voices, ~12 bed nodes, ≤4 music voices.
- **Tuning gate:** garden-master-8 cites the ledger's 3–5 days; sound R4 reframes it as evidence renders (±2 dB stems, −6 dBTP, a 30-min log).
- **Costume review:** sound asks art-director and garden-master to review timbres and species. Both lanes exclude shishi-odoshi and temple bell.

### K37. Lightning and thunder coupling
- `sky-8`: delete the key-light ×3.2 flash; intra-cloud glow ≤+12 % at most once per 90 s.
- `sound-1` / R5: rumble 2.5–4 s after a "lightning slot", ≤20/h at CRISIS+, "when lightning is already visible".
- **Tradeoff:** the rates and triggers must be one schedule **[CAT]**.

### K38. Geese
- sky sub: delete the static autumn geese, or make one skein cross the sky band at **dusk** in ~90 s.
- `life-8`: an 8-bird skein at **first light** in kō 48–65 (SW) and 13–16 (NE), 1.9× scale, 55–70 u altitude, 20° crown exclusion.
- critic D6: re-anchor 15–25° left of the tower, or drop 7→3; hide under reduced motion.

### K39. PSI "clarity aloft": clouds or ridge visibility? Opaque or keyed ridges?
- **Options:**
  - `sky-4`: cloud cover per PSI band (BEDROCK .05, STEADY .15, TREMOR .30, FRACTURE .50, CRISIS .72, MELTDOWN .88); DOM cover words Clear/Fair/Veiled/Broken/Low cloud/Overcast.
  - `data-poetry-1`: signed clarity drives ridge visibility (thresholds far .6 / mid .1 / near −.9, alpha `mix(0.10, 0.62, vis)`), haze, mist and fog range; DOM "Far shore: three ranges visible".
  - `sky-3`: ridges opaque (alpha 1 except the bottom 25 %), with a fixed value ladder k .88/.82/.68/.62/.40.
  - `sky-8`: a storm ladder of veil, slots and rain.
  - headroom xl: σ aloft may follow PSI.
- **Tradeoff:** two PSI carriers aloft with different DOM words. sky-3's always-opaque ridges vs data-poetry-1's PSI-hidden ridges both target `garden-horizon.ts`.

### K40. The sea-horizon seam rule (`garden-sky.ts:381-382`)
- `sky-2` / sky R1: remove the rule; the lower hemisphere becomes airlight × `seaDim`, plus an ichimonji line.
- `printmaker-2`: the keyline fade is set "so the annulus dissolve at `garden-sky.ts:381-382` survives".
- `printmaker-4`: "the plate/dome seam contract holds".
- water xl: water-1 relies on sky's darker sea-horizon (the reversal).

### K41. Texture channel and slot collisions
- **Wake G:** `water-7` vs `fleet-motion-3` (K8).
- **Blue-noise dither:**
  - `printmaker-7`: re-pack the dither as 256² RGBA (R dither, G washi).
  - `headroom-6`: fold the dither into R of a new 256² "garden noise" pack (G fbm, B Worley, A curl).
- **Cloud noise:** `sky-4` reuses `createCloudNoiseTexture` (`garden-water.ts:2218`); headroom xl says clouds draw from headroom-6's pack.
- **LUT strip:** `printmaker-8` appends ramps (1024×160→180).

### K42. Tide line: retire or keep?
- `data-poetry-3`: retire the quay-wall tide-line plates, the island-rock strandline (`garden-island.ts:586-590`) and the PSI salt courses in favour of a tidal flat.
- Keep:
  - `light-5`: tide band material (roughness 0.3, albedo ×0.75).
  - `water-8`: "tide line/stain … is masonry and untouched".
  - `pharos-2`: "supply tide still colours the waterline (`stoneRampColor(…, tide)` retained)".
  - `pharos-6`: `TIDE_DATUM_IRON` notch must stay distinct.

### K43. Month-record pines vs darker pads
- `garden-3`: pines = 30-day PSI record only.
- data-poetry D4: re-voice lime (`aurora_green`, up to 0.55/0.75 lerp) toward moss depth (L −0.08, C ≤0.09, H≈150).
- `garden-2`: keep `instanceColor` and multiply it by the underside gradient.
- `art-director-7`: pad value lerp 0.7 toward `timber_dark` (value ~20–25).
- **Tradeoff:** darkening may crush the fuller-vs-straw record **[CAT]**. garden xl: data-poetry "should not also tint pines".

---

## Shared-file hotspots

Files that ≥3 ideas edit. IDs include defect fixes (D) and subtractions (sub) where they carry edits. "Suggested owner" is **[CAT]**: the lane with the most edits there.

| File | Ideas / fixes editing it | Suggested owner |
|---|---|---|
| `src/three/garden-water.ts` | `water-1`…`water-8`; `printmaker-3`, `printmaker-6`; `light-3` (road), light-1 xl (tower-shadow tune); `fleet-motion-3` (`:810-822,1160-1170`); `life-6` (ring uniforms); `art-director-5`, `art-director-6`; `critic-1`, `critic-2` (`:1105-1107`), `critic-7`; `sky-2` (annulus fog), `sky-4` (cloud-shadow strength); pharos D9 (beam road `:1275-1283`); `ambient-journey-8` (scroll/glitter); `data-poetry-3` (exclude flat from shallow shelf) | water |
| `src/three/garden-post.ts` | `headroom-1` (DPR sizing, SMAA), `headroom-2` (GardenAirEffect), headroom D5, `headroom-6` (dither fold); `camera-2` (delete tilt-shift); `printmaker-1` (split), `printmaker-2` (keyline first in gradePass), `printmaker-7` (washi in LUT effect); light sub (grade), `light-1` (god rays dawn-only), `light-7` (AO 3→3.5), light D7; `art-director-1` (bough out of sharp band), `art-director-2` (shadowTints); `pharos-1` xl (lower bloom); `critic-8` (focus band) | post/headroom |
| `src/systems/camera.ts` (+ `projection.ts`) | `camera-1` (ShotSpec, yaw plumbing), `camera-3`, `camera-5` (pitch curve); `garden-master-1` (score, exclusion 14→24); `art-director-1` (score); `harbour-1`/`harbour-2` (flag envelope `:70-79`); `critic-8` (`:295-319`); `garden-1` (reads `defaultCamera`) | camera |
| `src/three/garden-day-cycle.ts` | `light-2` (presets, exposure), `light-3` (moon key, beacon `:372`), `light-4` (uKeyColor, sail emissive), `light-6`; `printmaker-1` (ink blend weights), `printmaker-5` (hold hemisphere), printmaker sub 3 (`:139`); `pharos-1`/`pharos-4`/`pharos-5`(e) (window curve `:405`), `pharos-7` (`:376`), pharos sub (smoke `:359-361`); `garden-master-5` (`:376`); `critic-1` (`:370-379`); `art-director-2` (sky presets, hemiSky `:141`); `fleet-craft-7` (lantern core `:423`) | light |
| `src/three/garden-sky.ts` | `sky-1`, `sky-2`, `sky-4`, `sky-5`, `sky-6`, `sky-8`; `data-poetry-1` (haze, mist `:663-666`, fog range); `critic-4` (`:82,98`), critic D12 (`:632,347`); `art-director-2` (horizon exponent); `printmaker-5` (night beats `:51`); `camera-5`, `camera-6` (haze and veil uniforms) | sky |
| `src/three/garden-height-fog.ts` | `sky-2` (becomes the aerial injector), `sky-8` (storm gain `:65`); `printmaker-4` (`:276-281`); `pharos-8` (beacon uniforms); `art-director-3` (kasumi lobes); `ambient-journey-1` (`arrivalMist`); `critic-4` (day ×0.5); `headroom-2` (shared σ); `camera-6` (veil) | sky |
| `src/three/garden-horizon.ts` | `sky-3` (RIDGES, kasumi quads); `data-poetry-1` (`uClarity` alpha); `garden-master-1` step 5 (cone alignment); `camera-1` (hill scale); `art-director-8` (hills receive `keyWarm`) | sky |
| `src/three/garden-sun.ts` | `light-1` (`NOON_BEARING`), light D6; `sky-5` (`gardenMoonPose`), `sky-7` (elevation from almanac); `light-3`, `light-6`; art-director R3 (contre-jour arc); `garden-2` (sun uniform) | light (sun) / sky (moon) |
| `src/three/garden-rim-mesh.ts` | `garden-1` (bough solver), `garden-4` (`rimColor`, `pineTiles`, `plantingTiles`), `garden-5` (`createStones`), `garden-6` (moss), garden sub (decals), garden D10 (tōrō); `garden-master-1` (tsukiyama in `rimHeight`, delete bough), `garden-master-3` (tōrō kindling), `garden-master-4` (counts `:1123-1128`); `art-director-1` (bough constants); camera sub (delete bough); `headroom-7` (`buildLandGeometry` decimation) | garden |
| `src/three/garden-flora.ts` | `garden-2`, `garden-3` (vermillion `:70-71`), `garden-8`; `garden-master-4`; `art-director-7`; `light-4` (flora transmission `:30-40`); `headroom-5` (wind) | garden |
| `src/three/garden-island.ts` | `garden-2` (niwaki `:1329-1404`), `garden-3` (`:1387-1390`), `garden-5` (stones/court), `garden-8` (karikomi `:992-1082`); `pharos-2` (`ISLAND_TIERS`, stair), `pharos-6` (notch), pharos D8 (niwaki #0); `garden-master-6`, `garden-master-7` (landing torii `:1709-1738`); `life-6` (koi skin); `critic-6` (gravel mipmaps `:102-106`); `light-5` (torii `:1735`); `data-poetry-3` (strandline `:586-590`) | pharos (landform) / garden (planting) |
| `src/three/garden-precinct.ts` | `pharos-2`; `garden-master-6`; `garden-5` (court); `data-poetry-2` (site a) | pharos |
| `src/three/garden-lighthouse.ts` (+ `generate-garden-lighthouse.mjs`) | `pharos-1`, `pharos-3`, `pharos-4`, `pharos-5`, `pharos-7`, pharos sub; `light-1`/light D6 (rim dir), `light-5` (stone hash); `garden-master-5` (streaks); `headroom-2` (delete beam meshes), `headroom-7` (reflection proxy); `critic-1` (beam, halo, stone emissive `:400-415`); `art-director-5` (beam profile, star); `printmaker-2` (rim gain −20 %) | pharos |
| `src/three/garden-fleet-batch.ts` | `fleet-craft-3`, `fleet-craft-4`, `fleet-craft-5`, fleet-craft sub (`GUNWALE_TINT`); `light-4`; `fleet-motion-6`; `headroom-5` (belly), headroom D4 (`castShadow`); `critic-5` (far material), `critic-6` (weave gate `:1007`); `sky-2` (aerial restraint `:996-999`); `data-poetry-6` (pitch) | fleet-craft |
| `src/three/garden-ships.ts` | `fleet-craft-1`, `fleet-craft-3`, `fleet-craft-6`, `fleet-craft-7`, fleet-craft sub; `createWake` lines: headroom D2 / `fleet-motion-3` / `critic-2`; `critic-3` (`batchedTrimColor`), `critic-5` (`createFarFleetGeometry`) | fleet-craft |
| `src/three/garden-chain-flag.ts` / `garden-harbor-batch.ts` / `src/systems/dock-layout.ts` | `harbour-2`, `harbour-6` (noren in flag mesh); `art-director-4`; `critic-3`; `light-5` (kawara roughness in harbor-batch) | harbour |
| `src/three/garden-docks.ts` | `harbour-1`, `harbour-3`, `harbour-6`, harbour sub | harbour |
| `src/three/garden-wakes.ts` | `water-7` (G), `fleet-motion-3` (G, decay), `ambient-journey-8` (idle scaling) | fleet-motion (with water) |
| `src/three/garden-harbor-life.ts` | `life-3`, `life-7`; `ambient-journey-7` (perched pose); garden-master D5 (crown exclusion); `headroom-5` (particles); `garden-master-7` (perch re-home) | life |
| `src/three/garden-almanac-dressing.ts` | `life-2`, `life-4`; `garden-1` (heron perch `:27-31`); `ambient-journey-5` (lantern-round spheres); `harbour-3` (`keeperPath`); `pharos-4` (ritual progress) | life |
| `src/three/garden-lanterns.ts` | `pharos-4`; `harbour-3`; `life-4` (`gardenKeeperFixtureFactor`); `ambient-journey-5` | life |
| `src/systems/garden-director.ts` (+ `use-garden-director.ts`, `use-canvas-resize-and-camera.ts` attract) | `life-1`; ambient-journey D4 / `ambient-journey-1`, `ambient-journey-5`; `garden-7`; `fleet-motion-1`, `fleet-motion-5`; `camera-4` (attract ShotSpecs); `ambient-journey-3` (Stay idle); sound-3/sound-4 (read-only consumers) | life |
| `src/hooks/use-world-render-loop.ts` | `headroom-3` (60 Hz gate); `ambient-journey-2` (breath weight), camera D3 (breath weight); `garden-1` (breath rig); `ambient-journey-8` (`idleDepth`); `sound-1` (`AudioSceneSnapshot`) | camera |
| `src/systems/season.ts` (+ `garden-seasonal-dressing.ts`) | `garden-3`, `garden-7`; `garden-master-3`; `life-5`; `sound-5` (insects by season) | garden |
| `src/systems/garden-sea-edge-sites.ts` / `garden-sea-edges.ts` | `garden-master-2`; `critic-2` (+ R scale); garden D7; `life-2`, `life-7` (anchors); `data-poetry-3` | water (sea-edges) |
| Motion samplers (`risk-drift.ts`, `open-water.ts`, `motion-planning.ts`, `visual-motion.ts`, `consort.ts`, `transit.ts`) | `fleet-motion-1`, `fleet-motion-2`, `fleet-motion-4`, `fleet-motion-5`, `fleet-motion-6`, `fleet-motion-7`; `garden-master-2` (A\* inlet cost) | fleet-motion |
| `src/three/world-renderer.ts` | fleet-motion D2 / `fleet-motion-2` (`:4124-4131, 4701-4704`); `water-2` (reflection layer `:3298-3308`); `headroom-2`, headroom D2; `sky-8` (lightning `:4197-4199`); `harbour-2` (flag pose), `harbour-3` (keeper lighting `:3535`), `harbour-4` (cemetery lane); `light-7` (`:4090`); `life-3` (ship gulls); `fleet-motion-5` (`:4580,4607`); `critic-1`; `camera-2` (`:1468`) | integration (multi-owner) |
| `src/three/garden-beacon-fire.ts` | `pharos-1` (flame intensity), pharos sub (smoke); life D3; art-director D6; `pharos-4` (`uStatusIntensity`); `ambient-journey-5` (beacon kindling curve) | pharos |
| `src/three/garden-sky-billboards.ts` | sky sub (clouds, mist banks, geese); `sky-3`, `sky-4`; critic D6 (geese), `critic-4` (near-shelf mist) | sky |
| `src/pharosville.css` | `chrome-1`…`chrome-8`; `ambient-journey-1` (veil), ambient-journey D5 (caption fade), `ambient-journey-3` (Stay); critic D16 (chip fade) | chrome |
| `src/pharosville-world.tsx` | `chrome-1`, `chrome-6`; `ambient-journey-1`, `ambient-journey-3`, `ambient-journey-6`; `fleet-motion-5` (caption copy `:570-577`) | chrome |
| `src/systems/detail-model.ts` | `chrome-2`, `chrome-3`; `data-poetry-1`, `data-poetry-3`, `data-poetry-4`; `ambient-journey-6` | data-poetry (copy) / chrome (render) |
| `src/systems/visual-cue-registry.ts` | `life-3` (retire quay-gull cue), `pharos-4` (decorative entry), `sound-3` (sound channel), data-poetry sub (registry freeze), `data-poetry-6` | data-poetry |
| `src/systems/garden-arrival.ts` / `camera-intent.ts` | `chrome-1` (crossfade), `ambient-journey-1`, `camera-6`; `camera-3`, `ambient-journey-4`, `critic-8` | camera |
| `src/components/harbor-label-chips.tsx` | `chrome-5`; art-director D11; critic D16; garden-master D4; data-poetry D6 | chrome |
| `src/three/garden-hero-reflection-pass.ts` | `water-2` (mips); `headroom-1` (target size), `headroom-7` (proxy); `critic-7` (alignment risk) | water |
| `src/three/garden-landmarks.ts` | `harbour-4`, `harbour-5`; `data-poetry-2` | (K29 decides) |
| `src/three/garden-tide-line.ts` / `garden-tide-stain.ts` | `data-poetry-3` (retire), data-poetry sub; `light-5` (material); `water-8` (keep distinct) | (K42 decides) |
| `src/systems/palette.ts` (derived tables) | `garden-3` (momiji tones), `harbour-2` (kinari, charred timber, ink clamp), `fleet-craft-2` (dye book), `chrome-6` (CSS anchors), `art-director-4` (6-dye set) | palette owner (harbour xl asks for one) |

---

## Reversal register

"Kept by" lists lanes that argue for, or rely on, the current decision.

| # | Decision (source) | Proposed by | Evidence | Risk | Kept by / not reversed |
|---|---|---|---|---|---|
| R1 | Rest at harbour view; the zoom-maximising rest (ledger row 24; `camera.ts:177`) | garden-master R1; camera R3; art-director R2 | Tower centred, 58–65 % tall, zoom ceiling 1.15 at every gate; `threshold-blue.png`, `alt-b-golden.png`, `golden-rethird.png` | Fleet readability (~10 % smaller hulls, art-director); camera/rim/placement/attract pins | art-director keeps a soft zoom term (+0.5·zoom) and `nearFlagBand`; fleet-craft-3's hero band "assumes the current rest camera" |
| R2 | Fixed 45° yaw (plan D3 "yaw as today"; `projection.ts:20,30`; `observe-tour.ts:34`) | camera R1 | `station-scan.ts`: no 45° pose clears `watch-south-reed`; postcards look at the rim's back | Sun/moon/flag/label relations; pan maths | `garden-master-1` keeps 45° by moving stations; camera accepts that path |
| R3 | Enlarge station silhouettes and flags ×4.2 (ledger row 22) | harbour R1; art-director R1; critic R | ETH flag at 29 u beside a 30.2 u beacon; Tron C 0.256 > vermillion 0.177; the solver bends around flag tips | Station findability at whole-map | none |
| R4 | Identity lives on rooftop flags (ledger row 25) | harbour R2 (keep principle, change implementation); art-director R1 | Flags are the most legible harbour element at night; brand-neon | Slower glance identification | harbour keeps "identity on cloth, not captions" |
| R5 | Clone-separation contract (`dock-layout.ts:16-22`) | harbour R3 | Legislates difference; toy-set read | Test deletion | none |
| R6 | "Noon must not move"; backlit arc; "Do not widen ARC_SWEEP"; "Park lowering sun" (ledger rows 26–27; `garden-sun.ts:26-45`) | light R1 (rotate `NOON_BEARING`, do not widen) | Sun 176° from the eye at noon; tower faces equal at noon and golden; no visible cast shadow | Grade/AO/IBL re-key; sun, shadow and sky pins; the sun disc and god rays leave golden | light itself upholds "do not widen ARC_SWEEP" and keeps `NOON_ELEVATION` 0.62 |
| R7 | No-backlight sun arc (`garden-sun.ts:37-47`, "LOCKED isometric camera") | art-director R3 (late-golden contre-jour) | No frame shows the tower as a silhouette against lit sky | Sails darken ~30 min a day; shadow fit | Opposed in direction by light-1 (K10) |
| R8 | Moon pose fixed upper-left, behind the camera (`garden-sun.ts:67-76`) | water R; sky R; light R2 | Never in any frame; no phase; the road runs sideways | Moon competes with the beacon; backlit night key | none |
| R9 | Beats at fixed clock hours (`day-cycle-beats.ts`) | sky R ("strengthens the premise") | Blue hour with the sun at +5.8° | Broad re-baseline; nominal latitude | none |
| R10 | Sea horizon and lower hemisphere share the live fog (`garden-sky.ts:381-382`) | sky R1 | 180-px band, std L\* 1.2 | Annulus edge at whole-map must fog out by 480 u | `printmaker-2` and `printmaker-4` rely on it (K40) |
| R11 | Dense Milky Way / HDRI sky rejected (`sky-time-ideas.md:57`) | sky R (partial: ≤3 % band on clear moonless nights) | Night is an L\* 2.5 void | Spectacle | — |
| R12 | Billboard cumulus off / raymarch rejected (ledger rows 18–19) | **Not reversed** by sky; `sky-4` claims to meet the re-entry condition | Pills in `stress-noon.png` (code re-enables them at clarity <0.65) | — | sky; headroom rejects froxel volumes |
| R13 | Fresnel 0.40 base, 0.55 cap (T1.2; `garden-water.ts:932-943`) | water R | The premise "fixed ortho 35.3°" was reversed by D3; golden water L\*21 under an L\*72 sky | Noon milkiness; bloom knee | none |
| R14 | Water as a dyed risk map (R5; `SEA_GAMUT_ANCHOR`; tintStrength 0.62–0.70) | water R | `reduced-noon.png` mint L\*52; khaki linoleum | Whole-map separation | art-director-6 ("water tint remains the risk-band reading"); printmaker-3 keeps zone colours |
| R15 | Calm and ledger as intentional mirrors with glitter/foam zeroed (`garden-water.ts:710-713`) | critic R | Flat dyed plate in perspective | Calm loses separation from Watch | — |
| R16 | World-fixed night moon road (`garden-water.ts:1171-1184`) | critic R; water sub; printmaker sub | Two-sided searchlight stripe brighter than the tower | None stated | none |
| R17 | Sea-edge ×1.5 scale (`GARDEN_SEA_EDGE_SCALE_FACTOR`) | critic R | Boat-sized reeds in perspective | Test pin | life-2/life-7 and data-poetry-3 use the reed sites (K23) |
| R18 | Reflection layer = tower + precinct only (D5/W1.15; ledger row 21) | **Not reversed** by water (`water-7` uses the wake field at 0 draws) | — | — | water; headroom lists fleet-far proxies (+6 draws) as optional |
| R19 | W2.5 key:fill ratios as the contract (`01-implementation-plan.md:152`) | light R3 → an on-screen face-ratio contract (noon ≥1.6, golden ≥2.0, dawn ≤1.3) | Nominal 5:1/8:1 met, on-screen ratio 1.0 | Tests must read frames | — |
| R20 | Plan §6 "toon/outline/paper grain" rejection (`01-implementation-plan.md:336`) | printmaker R (sky-contact keyline + flat-field washi only); chrome R3 (DOM-only grain) | `crop-golden-tower.png`; night silhouettes lost | Thin rigging thickening | art-director explicitly does **not** reverse it; printmaker upholds the bans on misregistration, CA, monochrome ink and animated grain |
| R21 | "Night is dark" implementation reading (bible `:54-56`) | printmaker (restores the bible's own 9–14 table); also sky-6, light-3, critic-1 | Night sky L\* 2–3 | Day-for-night | art-director: night already on plan |
| R22 | W0.2 keep both MSAA and SMAA (ledger row 13) | headroom R1 (SMAA only below DPR 1.75, after a `--dpr 2` RMSE A/B) | The A/B ran only @1x; SMAA costs 3 passes at 4× pixels and 4 texture slots | Night lantern hoop | printmaker-2 relies on SMAA after the keyline (K15) |
| R23 | Per-pass GPU-ms readout as the budget instrument (`render-perf-budget.md` §3) | headroom R2 | Non-additive: ~45 ms summed vs a 13.9 ms frame | None | — |
| R24 | @1x/60 Hz captures as the only perf truth | headroom R3 | Operator runs DPR 2 (~6 MP) at 120 Hz | — | — |
| R25 | Beam as an additive mesh cone ("analytic cone over screen-space", `garden-lighthouse.ts:952-955`) | headroom R4 (move analytic into post) | Ortho-era cone; the grade pass now has depth | — | `pharos-3` keeps a mesh cone with analytic shading; art-director-5 and critic-1 tweak the mesh |
| R26 | WebGPU (ledger row 7); TAA | **Not reversed** (headroom) | three 0.185.1 unchanged; 16-attribute cap | — | headroom |
| R27 | "Three rows of lit windows … 38 u to the sceptre" (Epic Pharos D1) | pharos R1 (trade 6 u of keep for crag; world crown/beacon unchanged) | Window grid = beacon at night; office block on a coaster | C3 constants, model contract, reflection re-align | — |
| R28 | "Window rows wake with the sky" (changelog; `garden-day-cycle.ts:401-408`) | pharos R2 | Hotel read at night | Operators who liked the lit tower | — |
| R29 | D3 smoke daymark (`garden-day-cycle.ts:352-361`) | pharos R3 (delete); life D3 (merge or retire); art-director D6 (one ribbon ≤0.25 opacity or none) | Absent at noon, blue feather at dusk | Loses a day life cue | art-director and life allow a single-column variant |
| R30 | Code claim that the end-on smudge is fixed (`garden-lighthouse.ts:1044-1047`) | pharos R4 | `night-beam-f0-crop.png` | — | — |
| R31 | W1.9 foreground repoussoir as implemented (`garden-rim-mesh.ts:912-986`) | garden R1 (re-solve); garden-master sub / camera sub (delete); art-director D1 (re-seat) | Projects to (−1691, 1627) | Fleet corner clearance | All agree the current form fails; the remedy is contested (K2) |
| R32 | Tapered-cone pad "keeps negative space" (W3.8; `garden-flora.ts:61-64`) | garden R2 | Parasols and palms in three frames | Tri/census pins | none |
| R33 | T2.2d autumn momiji = vermillion | garden R3; garden-master R3 (in part) | `palette.ts:31-32` reservation; 40 red maples on 1 September | A quieter autumn | garden-master-3 re-admits vermillion for higanbana (K27) |
| R34 | Four-state meteorological seasons; W4.17 microseasons deferred | garden R4; garden-master R3; life R4 | Maples turn on 1 September; evergreens greyed | Test churn; needs a date seam | life keeps `seasonFromDate` for crowns; garden-master keeps the season model |
| R35 | Slope → exposed rock on the 8–18 u ridge (`garden-rim-mesh.ts:355`) | garden R5 | Lava-rock hill in `crop-1440-lefthill.png` | — | — |
| R36 | Landing torii (W1.12) and garden torii (W5.5) | garden-master R2 | Costume anti-reference; plan §6 "more torii" | Gull perch; tests | harbour-2, art-director-4, critic-3, life-3, light-5 (K26) |
| R37 | Whole-map zoom-out to 0.28 (operator decision) | garden-master R4 (floor ~0.5; lower confidence) | Square plate floating in ocean with a palm ring | Discovery; 0.28 budget tests | camera-5, water-6, art-director-3 keep 0.28 and fix it |
| R38 | Pirate rule: black canvas for pale brands (H1/D5; ledger "pirate-contrast floor") | fleet-craft R1 | 33 of 256 issuers fly near-black cloth; the mon ink is now contrast-chosen | Sail-texture tests; no-flash property | sky-2 and art-director-2 assume the pirate-contrast floor stays invariant |
| R39 | Linear cream lift + chroma restraint (F1 `CLOTH_CANVAS_LIFT` 0.17; 2026-09-07 restraint 0.3) | fleet-craft R2 | Lavender rotation +13°; 34 % grey cloths | Two-issuer separation gate | fleet-craft claims ledger row 15 compliance |
| R40 | W3.1 yard + boom on rectangle rigs | fleet-craft R3 | The boom frames the cloth into a scroll | Test pins | — |
| R41 | W3.6 far variant (single quad, marks at 45 %, chroma −25 %) | fleet-craft R4 | Planks; far band 68 L\* | Identity at far zoom depends on hover | critic-5 keeps the 0.45 floor on cloth (K32) |
| R42 | Motion cadence 90–180 s legs / 240–480 s rests, evenly spread (prior "Rejected: shorten every rest") | fleet-motion R1 (lengthen rests, window departures) | `harbour-tempo-5s`; ~29 % underway [INFERENCE] | A dead-looking harbour | — |
| R43 | "Rests read as rests" (Wave 4b) | fleet-motion R2 | The orbit encoding causes spinning | — | Keeps the DOM promise "more restless in risk order" |
| R44 | Risk restlessness as displacement (`REST_RADIUS_DANGER` 0.6) | fleet-motion R3 | Collisions in `danger-basin-2s` | — | — |
| R45 | Implicit "set and fluttering at berth" | fleet-motion R4 (slack, unfluttered) | Moored boats look under way | — | Keeps "sails never held furled" (D8) |
| R46 | Quay-gull tempo cue (`visual-cue-registry.ts:487-493`) | life R1 | Hairlines; tempo imperceptible | A lost affordance at high zoom | Needs an operator nod |
| R47 | Keeper, heron and almanac as background beats | life R2 | They lose to attract almost always | A skipped arrival caption | ambient-journey-5 uses priority 50 (differs from life's 30) |
| R48 | "More birds … banned" (plan §6) | life R3 (reopens one 8-bird skein only) | Standing count falls ~30→~6 | Attention | Life keeps the ban in spirit |
| R49 | W1.3 perpetual camera breathing | ambient-journey R | 28–29 px jolt per touch | Diagrammatic stills | camera D3 keeps breath with an eased weight; garden-1 depends on it |
| R50 | Arrival as a camera fly-in (`garden-arrival.ts:44-67`) | ambient-journey R2 | Unfinished rim at 583k tris; front-loaded easeOutQuint | Test re-pins | chrome-1 keeps a dolly; camera-6 keeps a rise |
| R51 | W5.6 loading = held still + 320 ms crossfade | chrome R1 | Wrong-hour still with v0.16 UI | Stills must be regenerated each release | ambient-journey-1 drops the still in-app (K17) |
| R52 | Legend closed on first visit; W5.3 onboarding deferred | chrome R2 | Nothing teaches that a sail is a stablecoin | Repeat-visit annoyance | — |
| R53 | Binary `data-phase` token swap | chrome R4 | Night links at 1.23:1 | Palette-mirror tests | — |
| R54 | W2.12 tilt-shift confined to close postcards | camera R2 | `selected-ship.png`; band at ~290 u | Close views need other depth cues | headroom D5, light D7, critic-8, art-director-1 (K14) |
| R55 | Bible value table: tower in the middle-left cell | camera R4 | Prose says "slightly right of centre" | — | — |
| R56 | Bible "three readings" | data-poetry R1 (three live + one slow + one memory, cap 5) | Registry ships 36 cues, mostly invisible | Scope creep | — |
| R57 | D15/W4.14: supply tide gauge demoted, exclusive with moon record | data-poetry R2 (ship the tidal flat, drop the moon record) | Sky reading flat in every healthy band | — | — |
| R58 | Cemetery as Wreck Shoal in water (ledger row 29 "graveyard holds") | data-poetry R3 | 18 of 88, occluded, at water luminance | Reopens macro-composition and the 7-name sea-sign set | harbour-4 and harbour-5 keep wrecks in water (K29) |
| R59 | `WRECK_QUIET_CEILING` curation | data-poetry R4 | Truth is the census | — | — |
| R60 | W4.20 three loops, ≤5 MB / 24 MB | sound R1 | Loops cannot follow the breath and gust clocks; the 08-13 prototype was cut for that | Synthesis quality | garden-master-8 keeps a ≤5 MB budget |
| R61 | "Suspended on hidden tabs" (W4.20) | sound R2 (opt-in keep listening) | Ambient sound is used while working | Up to 30 min of audio-only calm drift | garden-master-8 keeps suspension |
| R62 | 08-13 diegetic ship's-bell toggle | sound R3 (speaker glyph) | A bell reads as a notification | — | — |
| R63 | Ledger row 12: ship sound only with 3–5 tuning days | sound R4 (evidence gate) | Days without artefacts cannot be reviewed | — | garden-master-8 cites the ledger gate as is |
| R64 | No thunder (a reading of "no market alarms") | sound R5 (distant rumble, CRISIS+, ≤20/h) | Lightning already visible | Startle | Operator may veto |
| R65 | Enlarged brand-hex chain flags (ledger rows 22, 25) | art-director R1 | Duplicate of R3/R4 | — | — |

**Not reversed, explicitly upheld:**
- Keep Neutral tone mapping and the 2.4 bloom knee (light sub).
- Keep the reflection scope (water).
- WebGPU and TAA stay rejected (headroom).
- Printmaker upholds the §6 misregistration/CA bans.
- Billboard cumulus stays off (sky).
- Data-poetry rejects a data-driven moon (W4.15), red/flashing depegs, tickers and fireworks.

---

## Hard budget constraints raised

| # | Constraint (who raised it) | Figures | Ideas at risk / how they comply |
|---|---|---|---|
| B1 | **Texture census at 72/72 on whole-map** (headroom table; `TESTING.md:382-388` "do not raise") | Default 67 (5 free); whole-map 72 (0 free); `renderer.info` 50–52/72 | At risk: `water-5` (optional 512² normal, same slot only); `sky-4` (reuses the cloud-noise tile, else +1); `printmaker-7` (repack blue noise to 256² RGBA); `printmaker-8` (LUT strip 1024×160→180); `headroom-6` (+1 pack, dither folded in, stated "net −1"); `art-director-6` (inlet mask must be analytic or a region-field channel); `data-poetry-2` (procedural rake "mandatory"). Frees: `headroom-1` −4 at DPR ≥1.75 (SMAA); `camera-2` −2 half-float targets [INFERENCE]. Uses existing slots: `water-7`/`fleet-motion-3` (wake G, K8), `critic-6` (mipmaps). Rejected on texture grounds (headroom): VSM/ESM, cascades, SSR, TAA, FFT ocean, octahedral impostors. `chrome-3` grain is DOM, not a WebGL texture. |
| B2 | **16 vertex-attribute cap on the fleet sail program** (headroom; `garden-fleet-batch.ts:1070-1073`) | 16 of 16 used | `fleet-craft-3` packs the hero flag into `aSailAttention.y` (`presence + 2·hero`). `fleet-craft-5` packs the panel count into `vColor.b` and replaces `<color_fragment>`. `fleet-motion-6` uses `instanceMatrix`/`uWindDir` only. `headroom-5` adds no attributes. `light-4` and `fleet-craft-4` add 0. `critic-5` uses position/uv only. `ambient-journey-5` should keep lamp onsets off the fleet program. `data-poetry-6` uses the existing pitch pose. TAA is rejected because velocity needs attributes. **[CAT]** fleet-craft-3 and fleet-craft-5 both repurpose existing channels; verify no other writer uses them. The flag program is separate: harbour-2 +2/−1. |
| B3 | **CPU-bound at 120 Hz** (headroom table, `headroom-3`) | CPU per frame 4.3–6.0 ms vs 8.3 ms at 120 Hz (~2.5–4 free); ~11 µs per draw; +100 draws ≈ +1.1 ms | Adds per-frame JS: `fleet-craft-8` (the only JS-per-frame item in its lane, 0.02–0.04 ms + 1 draw); `fleet-motion-2` (~1.3k sin/cos, 0.03–0.06 ms); `fleet-motion-7` (≤0.1 ms); `fleet-motion-1` (≤0.05 ms); `water-7` (stamp writes for ~184 ships; field no longer sleeps); `garden-1` (one matrix per frame); `ambient-journey-8` (phase accumulators); `sound-1` (≈0.003 ms/frame + 1–2 % audio-thread P-core); `chrome-6` (no CSS transition on `:root`, a per-minute write). Savings: whiskers −84 draws (~0.9 ms); `garden-master-1` −60–80 draws; `camera-1` 210 vs 287 draws; `headroom-3` 60 Hz ambient cadence halves work; `harbour-2` replaces 10 matrix writes with one `aGust` upload; `life-3` removes ~25 CPU gull matrices and 2–3 draws; `data-poetry-2` about −6 draws; pharos-1…3 net −1 draw. |
| B4 | **Per-pass GPU ms is not additive on ANGLE Metal** (headroom D1, `headroom-4`; echoed by water, sky, life, art-director, printmaker, pharos, fleet-craft) | Per-pass values sum to ~45 ms against a 13.9 ms frame; frame p50 17.2 ms with 0 drops; every ms is [INFERENCE]; ×~4 at DPR 2; the frame budget halves at 120 Hz | Schedule `headroom-4` (knockout harness) plus a serial DPR-2 baseline first. Largest per-pixel spenders to verify: `printmaker-2` keyline +0.1–0.2 ms @1x (0.4–0.8 at DPR 2), printmaker rung 3 total +0.3–0.4 @1x (1.2–1.6 at DPR 2); `headroom-8` PCSS +0.2–0.4; `headroom-2` +0.10–0.20; `sky-4` +0.1–0.2 (funded by drawing the dome last); `art-director-5` +0.1–0.2; `art-director-3` +0.05–0.15 (art-director 3+5+8 ≈0.2–0.4 total); `water-2` mips 0.05–0.1; `water-5` +1 fetch ≈0.05 (×4 at DPR 2); `water-7` ~0.1; `headroom-1` supersampling +1–2 ms on DPR-1 monitors; existing god rays +0.3–0.6 (light-1 skips golden). |
| B5 | **Triangle ceiling 500k** (brief; headroom ~118k free at ~380k) | Rim + flora 117k, fleet 93k, lighthouse 73k, reflection repeats ~48k | Adds: `garden-2` +35k (garden lane net ≈+45k → ≈425k); `headroom-5` tessellation +20–40k (funded by `headroom-7` −26k and −15–20k); `art-director-7` +5–15k; `data-poetry-2` ~7k (net +3k); `garden-5` +4k; `garden-master-6` +3–6k; `data-poetry-3` ~2k; `sky-3` +600. Removes: `garden-master-4` −20–40k; `camera-1` −30–40k; `garden-master-1` −25–30k; `harbour-1` −4–8k; `fleet-craft-3` ~−30k if the band shifts; pharos net −2k/−3.5k. Already violated: ambient-journey D3 measured **583k tris** at the arrival start pose. Lighthouse model budget `maxDrawCalls` 8 (currently 7) and 45k tris: `pharos-1` +1 draw puts it at the cap. |
| B6 | **Draw ceiling 700** (brief) | ~410 free | Not binding; B3 prices each draw in CPU. |
| B7 | **Open-night water emissive budget** (`GARDEN_WATER_NIGHT_EMISSIVE_BUDGET`, 0.016 mean; `01-implementation-plan.md:144`) | 0.016 mean | `water-4` re-derives `moonRoadOccupancy`; `light-3` must re-measure; `printmaker-6` (~40 % duty, peaks 1.6×); `printmaker-3` night lines at α 0.12; `life-7` firefly reflections. |
| B8 | **Light/ember lane cap 16** (life-7) | 16 lanes | `life-7` takes one lane in season; `harbour-3` halves harbour-mouth lanes; `harbour-4` moves the cemetery lane; `data-poetry-2` reuses the cemetery lane. |
| B9 | **Bloom knee 2.4 linear** (light "Keep"; pharos) | — | `pharos-1` flame ≈4 linear, the only element >3; `pharos-3` corona flash peak 2.5 HDR; `light-2` exposure scales lantern HDR (re-check the knee at night); `water-1` caps sky-mirror L≈0.85 before tonemapping; `sky-5`/`light-3` moon halo below the knee; `fleet-craft-4` keeps `FLEET_CLOTH_RADIANCE_CEILING`; `printmaker-6` peaks below 2.4. |
| B10 | **Bundle and asset budgets** (sound, chrome) | Aggregate 886 KiB gzip; audio chunk ≤48 KB raw / 16 KB gzip; `public/audio` ≤400 KB | `sound-2`/`sound-5`; `chrome-1` (~400 KB of stills in the repo, 60–90 KB AVIF per visit); `chrome-8` (+24 KB preload, −23 KB). W4.20 5 MB/24 MB is superseded by sound R1 but kept by garden-master-8. |
| B11 | **Surface cap 8 MP / DPR governor** (headroom; `render-surface-budget.ts`) | 1440p clamps to ~1.47 DPR | `headroom-1` supersampling; the governor never upshifts while capped unless it is fed draw p90 (`headroom-3`). |
| B12 | **Photosensitivity and frame-wide luminance** | sky-8: no frame-wide jump >3 L\* | `pharos-3` flash (one per ~31 s; none under reduced motion); `sky-8` removes the ×3.2 lightning; `ambient-journey-1` load luma ≤1.3× the settled mean. |
| B13 | **Static shadow map re-steer cost** (headroom D4) | Re-steer re-renders 93k fleet tris | headroom D4 turns off hull casters; `light-6` moon re-steer is throttled by `SHADOW_RESTEER_RADIANS`; `garden-1` castShadow off; `garden-master-3` near-caster margin for the engawa; `pharos-2` has a longer rock shadow. |
| B14 | **Single director environment slot** (life D1) | One slot; 6–10 min closure | Every beat in K21. |
| B15 | **Wake field 512² / `WAKE_MAX_STAMPS` 320** (water-7, fleet-motion-3) | ~0.86 u/texel at the far end | `water-7` (≤184 stamps); `fleet-motion-3` (slicks ≥2 texels on beam ≥1.7 u); K8. |

---

## Bible contradictions found

**Inside the bible (`VISUAL_INVARIANTS.md`):**
1. **Hero column.** The prose says "slightly right of centre" (`:6`). The value table puts "tower 62/57/24" in the middle-**left** cell with the grove (`:27`). (camera D8 / R4.) The solver band, art-director and garden-master all follow the prose.
2. **Night value.**
   - "Night is dark … every other lamp … is an ember" (`:54-56`) vs the table's night sky 9/14/11 over land 3–5 (`:26-28`).
   - printmaker R: the code read "dark" as a black sky (L\* 2–3). Also sky-6, light D3 (r = −0.19), critic.
   - art-director reads night as already on plan (disagreement about the measurement, not the bible).
3. **"Use long-lens perspective"** (`:14`). camera-1: a truly long lens is impossible on this plate; 28° would need the eye ~176 u from the tower, beyond the plate. Get telephoto layering from aerial perspective and hill scale instead.
4. **"A dark clipped pine bough crosses the near corner"** (`:13`) cannot hold at the current eye and pitch. At a 4° pitch and 32° vFOV nothing within ~56 u of the eye at water level enters the frame (garden D1, camera-1, garden-master D1, art-director D1).
5. **"One secondary, the moon road"** (`:54-55`) is geometrically impossible while the moon sits behind the camera and the rest sky spans ~0–12° (water, sky, light, printmaker).
6. **"Wall clock … owns illumination"** (`:58`) is only half-honoured:
   - fixed-hour beats with no date (sky-7);
   - blue hour lit by a sun at +5.8° (sky D3);
   - 07:15–16:15 and 20:00–04:45 are flat plateaus: "about 18 of 24 hours show two pictures" (light D5).
7. **"Market stability owns clarity aloft; stale sources own bounded low fog"** (`:59-60`) is contradicted in code by:
   - aesthetic daylight mist that makes stale fog unattributable (data-poetry D2 / `data-poetry-1`);
   - a one-sided clarity ladder with cover = 0 for BEDROCK, STEADY and TREMOR (data-poetry D2);
   - storm making the world paler via fog ×2.2 (sky D8).
8. **"The world offers three readings"** (`:41`) vs 36 registry cues, including supply tide, month record, memory and quay-gull tempo (data-poetry R1; life R1).
9. **"Vermillion retains chroma primacy"** (`:73`) vs:
   - `palette.ts:31-32`, which reserves vermillion for the beacon flame and DEWS danger (garden D3);
   - scenery uses it anyway: torii, 40 maples, koi, buoys, spar (garden-master-7);
   - flags out-chroma it (harbour D1, art-director D7, critic D3).
   - **[CAT]** Numeric inconsistency: ledger row 23 raises the palette chroma ceiling to 0.14, while data-poetry D4 calls `aurora_green` "C 0.150, the palette's chroma ceiling".
10. **"Sail identity is a complete mon on cloth, not an identity plate"** (`:42-43`). Harbour-2 extends this to flags (brand fields are identity plates). fleet-craft D1: square sails read as placards and kakejiku.
11. **"Leave a broad dark terrace arc bare; neither lamps nor boats form an evenly spaced ring"** (`:36-37`) vs:
    - symmetric lantern pairs at every station mouth (harbour D5);
    - stride-uniform ring planting (garden D6);
    - an evenly spaced pond ring (garden-master-6).
12. **"Motion has long rests"** (`:64`) vs:
    - perpetual camera breathing (ambient-journey R, citing W1.3's own exit clause);
    - ~29 % underway share (fleet-motion R1);
    - continuous gulls and fireflies (life D7).
13. **"Shoin court … not a fort"** (`:15-16`) vs storm-mole merlons (harbour D3) and a precinct box that reads as merlons (pharos sub). **"Do not add another monument"** (`:17`) vs station towers and the ETH flag at beacon height (harbour D2/D3); the sky-3 peak is flagged as a risk.
14. **"Sea-sign boards are inspection-only: no board is drawn at rest"** (`:43-44`) vs a permanently stuck arrival chip, the only text in the world at rest (garden-master D4, data-poetry D6, critic D16).
15. **Tension: "Keep the whole tracked fleet … never by hiding eligible ships at rest"** (`:8, :35-36`) vs composition moves:
    - `camera-1`: "~25 % of hulls leave the rest frame's near field";
    - `garden-1`: must not cover a hull;
    - `art-director-3`: kasumi hides no hull;
    - `fleet-craft-3`: hero-few ladder.

**Obsolete premises in the ledger, plan or code comments that lanes found:**
- **Ledger row 16** "Keep the camera orthographic … the dome can never enter the locked orthographic frame". The rig is a 4–12° perspective (D3; `projection.ts:4-27`). Cited by water, sky R1, light, art-director R3, headroom D3.
- **Ledger row 26** "Park lowering sun elevation 0.806→~0.62". **[CAT: `garden-sun.ts:35` already reads `NOON_ELEVATION = 0.62`]**; light-1 treats 0.62 as current.
- **Ledger row 18** "Keep billboard cumulus off". Code re-enables it when clarity <0.65 (`garden-sky.ts:692-693`; sky D8).
- **Ledger row 22** flag ×4.2: made for the ortho "warm village" whole plate (harbour R1, critic R).
- **Ortho-era code comments and constants:**
  - Fresnel "fixed ortho rig … 35.3°" (`garden-water.ts:932-943`; water R);
  - tilt-shift band maths "ortho 30° rake at 179.6 u" (`garden-post.ts:561-576`; camera-2);
  - beam scattering "under the fixed ortho view" (`garden-lighthouse.ts:945-963`; headroom D3);
  - geese anchors from iso maths (`garden-sky-billboards.ts:57-90`; critic D6);
  - sea-edge ×1.5 for the ortho blur test (critic R);
  - calm mirrors authored for the ortho sky band (critic R);
  - ARC_SWEEP rationale "LOCKED isometric camera" (art-director R3). light: the "consistent quarter" it keeps is the back quarter.
- **Code comments contradicted by frames:**
  - smudge "fixed" (`garden-lighthouse.ts:1044-1047`; pharos R4);
  - flora docstring "tapered cone keeps negative space" (garden R2);
  - koi "island-local" comment (`garden-koi.ts:203`; life D2);
  - "Rests read as rests" (`risk-water.ts:5-10`; fleet-motion R2).
- **Plan items never realised:**
  - W1.2 "authored rest, tower ~62 % x" (pharos D10, garden-master-1, camera);
  - W1.10 "Tsukiyama rock: 2–3 hill lobes" (pharos-2);
  - W4.17 microseasons (garden-3).
- **W1.3's own acceptance clause** ("if the 30-minute watch reads as drift, it becomes idle-only") is met (ambient-journey R).
- **Tooling:** the preview `--legend` flag is stale because the legend no longer auto-opens (chrome).

---

## Ordering dependencies (from Cross-lane sections)

- **Measure first.** `headroom-4` (knockout harness) plus a serial DPR-2 baseline, then `headroom-3`, then `headroom-1`, before spending ms (headroom xl).
- **Light first.** Land `light-1` first; god rays, the water sun road, sky Mie, `fleet-craft-4` and `camera-1`'s yaw retune against it (light xl, fleet-craft xl).
- **Moon.** The `sky-5` moon pose comes before `water-4`, `printmaker-6`, `light-3`, `light-6` and the life-1 moonrise.
- **Night sky.** Lift the night sky (`sky-6` / `printmaker-5`) before the night keyline (`printmaker-2`). critic xl: the fog re-key must land with the night-sky lift.
- **Rest seat, then everything framed by it.** The seat (K1) comes before:
  - `garden-1`/`art-director-1` bough solve;
  - `chrome-1` stills (registration);
  - the `fleet-craft-3` hero band;
  - `garden-fleet-placement` inlet re-projection (camera xl);
  - W1.16 top-3 harbour re-verification.
- **Flags before the solver.** `harbour-1`/`harbour-2` flag and station reduction before re-keying the camera solver envelopes.
- **Pads before threshold.** `garden-master-4`/`garden-2` pad geometry is a prerequisite for `garden-master-1`'s near pine (garden-master xl) and `garden-1`'s limb.
- **Yaw plumbing.** `camera-1` yaw plumbing comes before `camera-4` postcards and `camera-3` yaw deviation.
- **Fleet.**
  - `fleet-craft-3` hero set before `fleet-craft-7` and `fleet-craft-8`.
  - `fleet-motion-6` drives the `fleet-craft-1` brace.
  - `fleet-motion-1` rode kinematics before `fleet-motion-7` rest rafts.
  - Deleting the whiskers (C3) funds `fleet-craft-8`'s +1 draw.
  - `headroom-7` reclaim funds `headroom-5` tessellation.
- **Uniforms.** `light-4` publishes `uKeyColor`/`uSunColor` before `fleet-craft-4` and `garden-2`'s foliage patch.
- **Life chain.**
  - `life-3` bird mesh before `life-8`.
  - `life-5` kō before `life-7`/`life-8`.
  - `life-1` director repair before every ritual (`life-2`, `life-4`, `garden-7`, `ambient-journey-5`, `harbour-4`, `pharos-4`).
- **Data poetry.** `data-poetry-3` before `data-poetry-5`.
- **Sound.** `sound-2` harness and consent before `sound-1`…`sound-7`. Sound needs renderer metrics (`beamAngle`, lamp-lit count) from pharos and life (sound xl).
- **Water pairs.** `water-3` with `printmaker-3` (line density follows roughness). `water-1` with sky's darker sea-horizon (joint seam owner, water xl).
- **Printmaker order.** `printmaker-1` before any key:fill or PMREM retune (printmaker xl).
- **Chrome and copy.**
  - data-poetry owns the copy for `chrome-2`, `chrome-4` and `ambient-journey-6`.
  - Chrome's `.pv-drawer` comes before the `sound-2` control.
  - `chrome-6` needs sky and light per-beat anchors.
- **Sign-offs requested.**
  - Operator: every row in the Reversal register; the thunder rumble (sound R5); the quay-gull cue retirement (life R1); the late-golden contre-jour (art-director R3).
  - data-poetry / data-truth: kasumi (art-director-3); flag identity (art-director-4); the pennant subtraction and dye ladder (fleet-craft); the F♯/G swap and foghorn (sound); the life-1 dawn skiff (a non-coin hull).
  - art-director / garden-master: costume review of the sound-3 and sound-5 timbres and species.
