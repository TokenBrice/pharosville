# Light score, materials & post — light

## Verdict
From the rest camera, the key light sits **behind the Pharos all day**. The camera yaw is π/4, so the eye is at +x+z. The noon sun is at `(-35,48,-30)`, 176° from the eye (`garden-sun.ts:33`). Both visible tower faces measure the same colour: #838072 / #848172 in `noon.png` and #673d15 / #693f16 in `golden.png`. What we see is lit only by fill: hemisphere light, ambient light and the environment map baked from the sky dome (IBL). That fill is shapeless, so everything reads as plastic.

The 5:1 and 8:1 key:fill ratios were tuned on faces the camera never sees. Golden hour then turns the dome, the fog, the fill bounce and the grade the same orange, so it becomes a filter. Night runs upside down: the value correlation with the bible is r = −0.19, and the moon sits behind the viewer.

The leap needs no new pass. Turn the sun so it models the tower, give warm light a cool complement, and put the moon in front of the viewer. Keep the Neutral tone mapper; the curve is not what's wrong, the light colour is.

## What I looked at
- Baseline frames: `noon`, `golden`, `night`, `deep-night`, `dawn`, `morning`, `blue`, `wholemap-dusk`, `selected-lighthouse` (`outputs/opus-review/`).
- My captures (all at tier `full`):
  - `outputs/opus-review/light/golden-close.png` (`#t=17.6&cam=953.6,-1420,1.6`)
  - `outputs/opus-review/light/noon-island.png` (`#t=12.25&cam=910.4,-880,1.15`)
  - `outputs/opus-review/light/morning-close.png` (`#t=9&cam=0,0,1.8`): a mis-aimed open-sea shot, but it shows the fog whiteout.
- Measurement script: `outputs/opus-review/light/ninths.mjs`. It computes CIE L* from sRGB→linear→Y, samples every other pixel on a 2-px grid, and masks the HUD boxes.
- Code read:
  - `garden-day-cycle.ts:113-208, 302-467`, `day-cycle-beats.ts`
  - `garden-post.ts:43-330, 384-505, 1466-1795`
  - `garden-environment.ts:20-137`, `garden-sun.ts` (whole file), `garden-height-fog.ts:128-188`
  - `garden-sky.ts:345-383`, `garden-lighthouse.ts:245-334, 799-806`, `garden-water.ts:1173-1228`
  - `world-renderer.ts:877-891, 1982-2003, 3994-4111`, `palette.ts:42-91`, `projection.ts:1-42, 93-99`
  - `generate-garden-luts.mjs:73-97`, plus the prior reviews and the decision ledger.

### Value plan, measured (mean L*, ninths; bible value in brackets)

| noon | Left | Centre | Right |
|---|---|---|---|
| Top | 76.0 (60) | 73.7 (72) | 73.1 (68) |
| Mid | 63.2 (27) | 67.8 (45) | 76.7 (42) |
| Bot | 31.9 (15) | 28.8 (38) | 30.2 (23) |

| golden | Left | Centre | Right |
|---|---|---|---|
| Top | 63.4 (35) | 61.5 (52) | 62.7 (43) |
| Mid | 50.0 (20) | 50.9 (32) | 62.1 (26) |
| Bot | 24.3 (10) | 19.8 (25) | 23.6 (15) |

| night | Left | Centre | Right |
|---|---|---|---|
| Top | 2.4 (9) | 4.9 (14; beacon 92) | 2.1 (11) |
| Mid | 3.4 (5) | 8.4 (12) | 3.9 (8) |
| Bot | 7.0 (3) | 5.2 (7) | 7.3 (4) |

| Beat | Frame mean vs bible | Correlation r | MAE | Notes |
|---|---|---|---|---|
| Noon | 58 vs 43 | 0.73 | 16.6 | 25.6 % of pixels have L* > 85 |
| Golden | 47 vs 29 | 0.73 | 19.0 | Tower mid mean 34, sky 64 (bible: tower 57 > surroundings) |
| Night | 5.0 vs 8.1 | **−0.19** | 4.8 | Beacon max 93 ✓ |

- `morning.png` matches `noon.png` within 1 L* in every ninth.
- `deep-night.png` matches `night.png` to 0.1 L*.
- `blue.png` (44/43/44, 28/32/39, 12/9/14) is the closest of any frame to the bible's dusk column.

## Spell-breakers (defects)
1. **The key light is behind the hero from dawn to dusk.**
   - **Where:** `garden-sun.ts:33` (NOON_BEARING), `:47`, `:104-115`, with the camera at `projection.ts:20, 96-98`.
   - **Angles:** noon 176° from the eye; dawn sun 57° left of forward; golden sun 38° right of forward at 14°. All sit in the front hemisphere, behind the tower.
   - **Evidence:**
     - Left and right tower faces are equal at noon and at golden.
     - Only the top surfaces of ledges are lit (`noon-island.png`: cornices bright, shafts flat).
     - Every cast shadow falls toward the camera, behind its caster, so the island shows no visible shadow at all (`noon-island.png`, terrace and pines).
   - **Why it breaks the calm:** no form, no hour legible from shadows, plastic Lambert everywhere. This is the root of the "midday flatness" complaint the ledger records twice (`decision-ledger.md:51`).
   - **Fix:** see light-1. **Cost:** M.
2. **Golden hour is four warm sources stacked with no cool complement.**
   - **Key:** `lantern_warm` at 3.84, brighter than noon's 3.3 (`garden-day-cycle.ts:137-138`).
   - **Ground bounce:** hemisphere ground is `timber_mid` #7b4713 (`:139`). Because the faces the camera sees get only fill, this orange bounce is what paints them.
   - **Fog and horizon:** 50 % day cream `fog_day` #e2d2b3, because `dayCyclePhase` maps the golden peak to daylight 0.5 + dusk 0.5 (`:216-219`, `garden-height-fog.ts:158-163`).
   - **Dome and IBL:** the dome's ember band is pinned to camera-forward, `garden-sky.ts:378` (owned by LaneSky). The environment map baked from that orange dome adds orange fill at 0.45 (`garden-environment.ts:135`).
   - **Grade:** `GOLDEN_GRADE` highlightTint `[1.12,1.035,.9]`, split .65 (`garden-post.ts:136-139`), and the LUT boosts the orange hue band (`generate-garden-luts.mjs:85-86`).
   - **Result:** sky #ac727b, haze #e9aa5f, tower #673d15 and island #462609 all sit at hue 30–40°. The tower is *darker* than the sky (34 vs 64); the bible wants it bright (57).
   - `golden-close.png` shows the orange veil even on the near island.
   - **Cost:** S (rigs and grade), M including the dome work.
3. **Night value structure is inverted and the moon road is a sideways stripe.**
   - Sky L* is about 2, against 9–14 in the bible. The bottom row (7/5/7) is brighter than the top (2/5/2).
   - `GARDEN_MOON_AZIMUTH = π·0.62` (`garden-sun.ts:75-76`) puts the moon 66° behind the viewer's left shoulder, so it is never in frame.
   - The authored road is a band along `uMoonDir` through the island centre (`garden-water.ts:1173-1178`). On screen it runs left to right across the frame: the pale strips at y≈680–770 in `night.png` and `deep-night.png`. It reads as a searchlight or fog shelf, not a road to a moon.
   - The tower facade reads olive (#302e1c). It is lit by the warm beacon PointLight at 9.15 (`garden-day-cycle.ts:372`, `garden-lighthouse.ts:799-804`) plus the cyan moon key from the front (`:152-160`). Warm plus cyan makes green-grey mud.
   - **Cost:** M.
4. **The noon "milk" is the brightest element in the frame.**
   - In the middle row, p90 is 92–93 L*. The haze behind the tower (#e5e9ee, L* ≈ 92) outshines the tower itself (mean 52).
   - The middle-row ninths are +36, +23 and +35 over the bible.
   - Exposure is a fixed 1.12 (`world-renderer.ts:878`) on top of an already pale haze.
   - `morning-close.png` shows the same fog as a featureless white wall covering 65 % of the frame at a close pose.
   - **Cost:** S (exposure) plus LaneSky's fog work.
5. **The clock owns illumination, but illumination does not move.**
   - Day is a flat 1.0 from 07:15 to 16:15 (`day-cycle-beats.ts:29-30`), and night is identical from 20:00 to 04:45 (`:21-22`).
   - The sun's azimuth does move, but it is behind the tower, so nothing visible changes. `morning.png` = `noon.png`, and `night.png` = `deep-night.png`.
   - About 18 of 24 hours show two pictures.
   - **Fix:** once light-1 lands, the shadows keep time; add the drift in light-6. **Cost:** S.
6. **The tower rim light uses a frozen sun.**
   - `LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimSunDir = (-35,45,-30)` (`garden-lighthouse.ts:252`) never follows `gardenKeyLightPose`.
   - At night the rim still masks toward the old noon sun, not the moon.
   - **Fix:** write `pose.direction` into it each frame in `updateLighthouseRimLight`. **Cost:** S.
7. **Close postcards blur the hero.**
   - In `golden-close.png` (zoom 1.6) the lantern and upper shaft are visibly soft.
   - The tilt-shift band (`garden-post.ts:589-638`) centres on the target plane at sea level, so the tower's crown falls in the far falloff.
   - **Fix:** bias the band by `targetHeight`, or exempt depth closer than the tower silhouette. **Cost:** S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### light-1 ★ Turn the sun: the noon key at the viewer's right hand
- **Picture:**
  - At noon the tower's right face is clean warm-white stone and its left face a cool blue-grey. The courses, windows and cornices read like an engraving.
  - The pines and the pavilion throw short diagonal shadows across the raked terrace, and the tower's shadow lies on the inlet. Each hour moves it visibly.
  - At golden hour the low sun comes from behind the viewer's right shoulder. The Pharos glows gold against a *cool* violet eastern sky, and its long shadow reaches away across the water toward the fleet.
  - Dawn stays soft contre-jour: sun front-right, tower in silhouette, mist.
- **Why:**
  - Spell-breaker 1. The bible wants the tower brighter than its surroundings at noon (62) and at dusk (57). With a backlit key, it measures 52 against 76 haze and 34 against 64 sky.
  - The ARC_SWEEP comment claims the arc keeps the monument "modelled from a consistent quarter" (`garden-sun.ts:40-45`). The quarter it keeps is the back quarter.
- **Impact:** 5 stunning, 4 poetic (shadows keep time), 3 relaxing. **Confidence:** H on the geometry, M on the final bearing.
- **Cost:** M, mostly retuning and test re-pins. **Perf:** 0 draws, 0 tris, 0 textures. The shadow map already re-fits on re-steer (`world-renderer.ts:4006-4046`).
- **How:**
  - **Bearing:** set `NOON_BEARING` to `Math.atan2(-1, 1)`, which is −45°, the camera's right vector (`garden-sun.ts:33`). Keep ARC_SWEEP 1.0 and NOON_ELEVATION 0.62. That gives:
    - dawn at −102°: front-right, 33° off forward, just outside the frame edge;
    - noon at −45°: 90°, pure side light;
    - 17:36 at −3°: 132° from forward, behind-right;
    - sunset at +12°: 147°.
    - Tune within −30° to −60°.
  - **Rim:** drive `uLighthouseRimSunDir` from the pose (fixes spell-breaker 6).
  - **Tower shadow on water:** the analytic tower shadow (`garden-water.ts:1215-1228`) already reads `uSunDir`, so it follows for free and becomes visible.
  - **God rays:** keep them gated to dawn; the dawn sun is still in front. At golden the sun is behind, so skip the march (−1 half-res draw).
  - **Re-key:** `DAY_GRADE`/LUT day contrast (`generate-garden-luts.mjs:78`) against the new contrast.
- **Displaces:** the backlit calibration, the golden god-ray march, and the orange hemisphere-ground fill as the main face light.
- **Truth & a11y:** pure illumination; no data meaning. Reduced motion is unaffected: the sun is clock-driven, not animated.
- **Risks:**
  - `garden-sun.test.ts` and shadow-rig pins, and the "Noon must not move" comment (Reversal 1).
  - The fleet's hull-sides now get front-side light at golden, so the far fleet may brighten. Check the right-middle ninth stays ≤ 30 at golden.
  - Longer visible shadows could cross flags; that is acceptable.
- **Acceptance:**
  - `#t=12.25` at rest: tower right-face L* / left-face L* ≥ 1.6 (currently 1.0), and a cast shadow visible on the terrace in `noon-island` framing.
  - `#t=17.6`: tower mid-band mean L* ≥ 50 and at least 10 above the sky behind it (currently 34 vs 64).
  - `#t=9` vs `#t=15`: the terrace shadow direction differs visibly.

### light-2 ★ Warm key, cool shadow: complementary rigs and authored per-beat exposure
- **Picture:**
  - Golden light looks like light, not paint: gold on the lit planes, violet-blue in every shadow and in the sky opposite the sun.
  - Noon is neutral-white with blue-green shade and the milk gone.
  - Each beat sits at its own brightness: golden and blue hour genuinely dimmer than noon, night a deep readable blue rather than a void.
- **Why:**
  - Spell-breakers 2 and 4. Golden is +18 L* over the bible and noon +15.
  - Every warm term stacks and nothing is cool.
  - Exposure is one constant for all beats (`world-renderer.ts:878`).
- **Impact:** 5 stunning, 4 relaxing. **Confidence:** H.
- **Cost:** S (preset values plus one uniform). **Perf:** 0.
- **How** (all colours derived from `HARBOR_PALETTE`), in `DAY_CYCLE_LIGHT_PRESETS` (`garden-day-cycle.ts:115-161`):
  - **Golden key:** `sun_day_warm.lerp(lantern_warm, .45)` at intensity 3.0. This cuts saturation; `lantern_warm` itself stays unmodified as a token.
  - **Golden fill:**
    - hemiSky = `fog_blue.lerp(sky_day_zenith, .45)` at .5;
    - hemiGround = `stone_mid.lerp(deep_sea_1, .3)`, a neutral-cool bounce off the sea;
    - ambient .08.
  - **Dawn:** hemiGround `stone_mid` instead of `timber_mid`.
  - **Day:** unchanged key; hemiSky `foam_white.lerp(sky_day_zenith, .25)` so noon shade reads blue-green.
  - **Exposure:** add `DAY_CYCLE_EXPOSURE = {dawn: 1.0, day: 0.96, golden: 0.84, blue: 1.0, night: 1.15}`, blended by `dayCycleBeats`, written to `renderer.toneMappingExposure` in the day-cycle update.
    - This is authored eye adaptation, not auto-exposure: the plan rejected auto-exposure (`01-implementation-plan.md:344`), and this is deterministic per clock.
    - Night 1.15 is paired with light-3's lower practicals, so the beacon stays at about 92.
  - **Grade:** remove the golden and dawn warm split (see Subtractions).
  - **LaneSky dependency:** its sun-anchored ember band and cool zenith (`garden-sky.ts:378`) change the baked environment map automatically. The fill then turns cool *because the sky is*: `garden-environment.ts` bakes from the same dome.
- **Displaces:** the orange ground bounce, the golden highlight tint, the LUT orange boost, and the constant exposure of 1.12.
- **Truth & a11y:** anchors untouched. Exposure and colour carry no data. Tier-invariant.
- **Risks:**
  - `garden-day-cycle.test.ts` light-ordering pins.
  - Exposure also scales lantern HDR, so re-check the 2.4 bloom knee (`garden-post.ts:44`) at night.
- **Acceptance:**
  - `#t=17.6` golden: frame mean L* 30 ± 5; left and right top ninths differ ≥ 15° in hue (warm side vs cool side); shadow-side pixels on the tower have b > r.
  - `#t=12.25`: pixels with L* > 85 ≤ 8 % (currently 25.6 %); middle row ≤ 55/55/50.

### light-3 ★ Night is one lamp and one moon: move the moon into the frame
- **Picture:**
  - A small pale moon hangs in the upper-left sky, above the borrowed hills. A broken silver road runs *down* the water toward the viewer, left of the inlet.
  - The Pharos stands as a dark blue silhouette with a thin silver edge on the moon side, a stair of ember windows, and one golden fire at its head.
  - The sky is a deep, visible indigo (L* ~10), not a black void.
- **Why:**
  - Spell-breaker 3: r = −0.19; the moon is behind the camera; the "moon road" crosses the frame sideways; the facade is olive.
  - The bible asks for "one dominant light, the beacon; one secondary, the moon road." A specular road can only exist between viewer and moon.
- **Impact:** 5 poetic, 5 relaxing, 4 stunning. **Confidence:** M-H.
- **Cost:** M (sun module, rigs, water road with LaneWater). **Perf:** 0 draws. The moon disc is already authored in the dome shader (`garden-sky.ts:367-369` path).
- **How:**
  - **Moon pose (owned by LaneSky):** the displayed moon follows a compressed real-phase arc, ±23° of azimuth around forward at 1.4°–8.9° elevation, and is absent when the real moon is down. The night key and the tower rim MUST read `gardenMoonPose(hour)` every frame and never keep a separate constant; today's constant `GARDEN_MOON_AZIMUTH = π·0.62` (`garden-sun.ts:75-76`) sits behind the viewer's left shoulder. As a reference point, az −2.67 rad (18° left of forward) at el ≈8° is about where the full moon sits at 21:00. On moonless nights the key drops to the hemisphere sky fill alone at about .25× the moon value, so the beacon is the only direct light.
  - **Moon key** (`garden-day-cycle.ts:152-160`): `moonlight.lerp(fog_blue, .5)` at .4, now a back-rim. Hemisphere sky lifted to `sky_horizon.lerp(fog_blue,.4)` at .16 so the sky, hills and far fleet reach the bible's 8–14.
  - **Beacon light:** lower the PointLight's night term from `night*8.2` to about `night*3.0` (`:372`), so the facade stops being floodlit and the windows (`:405`) carry the stair.
  - **Moon road (LaneWater):** replace the island-centred band (`garden-water.ts:1173-1178`) with a view-dependent road, using the existing `halfMoon` specular glitter (`:1186-1199`) as the carrier. Width about 6 u, broken by the swell normals.
- **Displaces:** the sideways road stripe, the floodlit olive facade, and the cyan front key.
- **Truth & a11y:** no data. Reduced motion: the road glitter freezes with the water's time.
- **Risks:**
  - The moon competing with the beacon: keep the disc ≤ L* 80 and its halo tight, below the 2.4 knee.
  - The bible's 0.016 open-night emissive budget (`01-implementation-plan.md:144`) must be re-measured.
  - Moon-road contract tests in `garden-water.test.ts` and the sky moon-alignment tests.
- **Acceptance:**
  - `#t=22` and `#t=2.5`: ninths correlation with the bible ≥ 0.6; top row 8–14; beacon max ≥ 90; moon disc visible in frame whenever the real moon is up.
  - The road's long axis is within 25° of screen-vertical.
  - Tower facade mean hue is blue (b > g > r) outside the windows.

### light-4 Sun-coloured transmission for cloth and needles: sails glow like shoji when backlit
- **Picture:**
  - At dawn, and on every ship whose sail lies between the viewer and the sun, the cloth lights from behind in the *sun's* colour times its dye. Issuer colours glow like paper screens, and the mon reads as a darker figure within.
  - Pine clouds on the headland get a luminous yellow-green edge where the sun shines through.
- **Why:**
  - The fleet already has a sail backlight (`garden-fleet-batch.ts:1043-1045`: `wrap * diffuseColor.rgb * uBacklight`), but it carries no sun colour and no view term. At golden the sails glow in their own cool dye (lilac/periwinkle cards in `golden.png`, right-middle), with no link to the light that should be passing through them.
  - Flora has no transmission at all.
  - Even after light-1, dawn and the far fleet stay backlit, so this term is what makes cloth and leaves read as cloth and leaves.
- **Impact:** 4 stunning, 4 poetic. **Confidence:** M.
- **Cost:** S-M. **Perf:** 0 draws, 0 textures, 0 new vertex attributes (the sail program is at the 16-attribute cap). About +6 ALU in two programs [INFERENCE: <0.05 ms at 1×, about 4× that at DPR 2].
- **How:**
  - **Light side (mine):** publish one shared uniform `uKeyColor`, the normalised `directionalLight.color × intensity` from `updateDayCycle` (`garden-day-cycle.ts:329-334`), next to the existing `uSunDir`.
  - **Sails (LaneFleetCraft owns the retune; I will not touch `uBacklight`):** transmission = dye × `uKeyColor` × `pow(max(dot(V, −L), 0), 2)` × wrap × (1 − ink).
  - **Flora:** the same term in `garden-flora.ts:30-40` at 0.25, tinted by `aurora_green`.
  - Night: the moon key is dim, so no lamp field appears.
- **Displaces:** the colourless `uBacklight` add, and part of `GARDEN_SAIL_EMISSIVE.day` (`garden-day-cycle.ts:168-172`): 0.06 → 0.03, so total sail brightness holds.
- **Truth & a11y:** the hue is the cloth's own albedo times the key colour, so issuer identity holds; the tokens are unchanged. Brightness varies with angle, which is illumination, not identity. Tier-invariant.
- **Risks:** sails outshining the tower at dawn: keep the existing `FLEET_CLOTH_RADIANCE_CEILING` clamp (`:1046-1047`) and require sail L* ≤ tower L*. Fleet guard tests on sail contrast.
- **Acceptance:**
  - `#t=5.6` dawn: backlit near sails ≥ 12 L* above the same sails at `#t=12.25`, hue within 10° of their day hue.
  - `#t=17.6`: no sail brighter in its own dye than the lit tower face.

### light-5 A material ladder: wet stone, lacquer, glazed tile, timber, moss
- **Picture:**
  - Once the key light reaches the faces, surfaces start to differ:
    - a dark wet band at the tide line with a sky sheen;
    - a vermillion torii with a soft lacquer highlight;
    - kawara roofs that glint in lines;
    - dry timber decks, matte velvet moss;
    - tower ashlar with faint block-to-block variation, so it reads as dressed stone rather than cake icing (`noon-island.png` tower).
- **Why:**
  - Roughness is 0.82–1.0 on about 80 of 105 authored materials; metalness is nearly absent.
  - The only normal maps are the gravel and water.
  - With the environment map at 0.6 by day (`garden-environment.ts:135`), there is a specular source going unused.
- **Impact:** 4 stunning. **Confidence:** M.
- **Cost:** M. **Perf:** 0 draws, 0 textures (procedural in the existing hooks), <0.1 ms.
- **How:**
  - **Tide band:** `garden-tide-line.ts`/`garden-tide-stain.ts` materials to roughness 0.3, albedo ×0.75.
  - **Torii:** `garden-torii.ts`/`garden-island.ts:1735` gate roughness 0.35, envMapIntensity 1.2. Vermillion stays the token.
  - **Roofs:** kawara slate rungs (`palette.ts:72-74` users in `garden-harbor-batch.ts`) to roughness 0.45.
  - **Timber:** decks to 0.75.
  - **Tower stone:** in the tower's existing rim hook (`garden-lighthouse.ts:263-277`), add ±6 % albedo and ±0.08 roughness keyed on a world-space block hash of the course height, 0.9 u high by 1.6 u wide.
- **Displaces:** the uniform "plastic" roughness of 0.9–1.
- **Truth & a11y:** no data. Tier-invariant.
- **Risks:** specular pinpricks shimmering on waves of hull trim. Keep the ladder away from ships (fleet lane) and `garden-shader-hygiene` tests.
- **Acceptance:** `noon-island` framing: the torii shows a highlight gradient, the tide band is darker than the stone above it, and the tower courses are separable in a 200 % crop.

### light-6 Time you can see inside a beat: morning air, afternoon air, a moon that crosses the night
- **Picture:**
  - 09:00 is crisper and cooler than 15:00; the afternoon key warms a few percent and the haze thickens slightly.
  - At 22:00 the moon sits low left; by 02:30 it has climbed and moved right, and the road with it.
  - A visitor returning at another hour sees another picture.
- **Why:** spell-breaker 5. Nine hours of identical day and nine of identical night contradict "wall clock owns illumination".
- **Impact:** 3 poetic, 3 relaxing. **Confidence:** M.
- **Cost:** S. **Perf:** 0.
- **How:**
  - **Day:** scalar `airT = smoothstep(7.25, 16.25, hour)` applied only inside the day beat. The key colour lerps from white (1,1,1) toward `sun_day_warm` by 0.12·airT, and fog density goes 0.9×→1.15×. Fog is LaneSky's parameter.
  - **Night:** LaneSky's moon arc already provides the motion (see light-3). My side is only that the key, rim and moon road follow `gardenMoonPose(hour)`, so 22:00 and 02:30 light the tower from different sides.
- **Displaces:** the static plateaus.
- **Truth & a11y:** clock only. Reduced motion shows the deterministic clock pose.
- **Risks:** moon re-steer triggers shadow-map re-renders; they are cheap and throttled by `SHADOW_RESTEER_RADIANS`.
- **Acceptance:** ninths L* differ ≥ 3 in at least three cells between `#t=9` and `#t=15`, and between `#t=22` and `#t=2.5`.

### light-7 Soft low-sun shadows: a per-beat penumbra
- **Picture:** crisp noon shadows that stay put; long golden and dawn shadows whose ends blur into the terrace like brush ink.
- **Why:**
  - The PCF radius is a fixed 4 texels (`world-renderer.ts:2003`), so light-1's long low-sun shadows would end in hard aliased tips.
  - Cheaper and more reliable than PCSS.
- **Impact:** 3 stunning. **Confidence:** M.
- **Cost:** S. **Perf:** 0 draws. The Vogel-disk tap count is unchanged; only the radius varies.
- **How:**
  - `shadow.radius = lerp(3, 7, lowSun)` with `lowSun = 1 - smoothstep(0.12, 0.5, pose.elevation)`, in `updateShadows` (`world-renderer.ts:4090`).
  - N8AO `aoIntensity` day 3 → 3.5 so contact reads on the new shade side (`garden-post.ts:152`).
- **Displaces:** uniform softness.
- **Truth & a11y:** none.
- **Risks:** bias acne at low sun: re-check `normalBias .35`.
- **Acceptance:** `#t=17.6` tower shadow tip gradient ≥ 6 px wide; `#t=12.25` bollard contact still touches.

## Subtractions
- **`GOLDEN_GRADE`/`DAWN_GRADE` warm split** (`garden-post.ts:132-139`): set highlightTint to `[1,1,1]` and split to .35. Warmth belongs in the key light (bible: "atmosphere before grade").
- **LUT golden and night orange boosts** (`generate-garden-luts.mjs:85-86, 94-95`, hue 38 at saturation 1.04): remove.
- **Orange hemisphere-ground bounce** (`timber_mid`) in dawn and golden (`garden-day-cycle.ts:121, 139`).
- **Beacon PointLight night surplus:** `night*8.2` → about `night*3.0` (`garden-day-cycle.ts:372`). The fire and windows carry the tower.
- **The golden-hour god-ray march** once light-1 puts the sun behind the viewer (`garden-post.ts:1774`, `phaseRayWeight` = dawn only).
- **Keep:** Neutral tone mapping (do not flip to AgX; it would mute the mid-chroma anchors, and the curve is not the fault), the 2.4 bloom knee (only the lantern exceeds L* 85 at night: max 93), MSAA+SMAA, paper tooth at 0.035 (invisible and harmless).

## Reversals
1. **"Noon must not move" and the backlit arc** (`garden-sun.ts:26-33, 40-45`; ledger rows "Do not widen ARC_SWEEP" and "Park lowering sun").
   - **Evidence:** the sun is 176° from the eye at noon. Tower faces are equal at both beats (#838072 vs #848172, #673d15 vs #693f16). No cast shadow is visible anywhere at rest. Midday flatness is recorded twice in the ledger.
   - **Argument:** the calibration that "noon must not move" protects was done on a light the viewer never sees. Rotating the arc (not widening it) is what makes every other light knob matter.
   - **Risk:** grade, AO and IBL re-keying, and sun/shadow/sky test re-pins. The sun disc and god rays leave the golden frame.
2. **Moon behind the camera** (`garden-sun.ts:75-76`).
   - **Evidence:** it never appears in any frame, and the road runs sideways.
   - **Argument:** the bible's secondary light needs the moon in front. LaneSky carries the displayed-moon arc; this lane asks only that the night key and the rim derive from it.
   - **Risk:** it can compete with the beacon; cap its luminance.
3. **The W2.5 key:fill ratios as the contract** (`01-implementation-plan.md:152`).
   - **Evidence:** the nominal 5:1 and 8:1 are met, yet the on-screen face ratio is 1.0.
   - **Replace with:** a measured on-screen contract (tower lit face / shade face L* ratio per beat: noon ≥ 1.6, golden ≥ 2.0, dawn ≤ 1.3).
   - **Risk:** tests must read frames or sample the analytic normals.

## Cross-lane dependencies
- **LaneSky** (already coordinated):
  - dome ember band follows `uSunDir` (`garden-sky.ts:378`);
  - after light-1, golden shows the *anti-solar* sky ahead: a dusty-rose band a few degrees above the horizon (the visible sky at rest spans only 0–12°) over a blue-grey earth-shadow band, which is what cools the environment map;
  - fog extinction and aerial perspective, and beats keyed to sun elevation, all consume the rotated `gardenSunPose`;
  - noon haze luminance cap ≈ L* 80.
- **LaneWater:**
  - a view-dependent moon road (light-3);
  - the tower shadow on the inlet becomes visible (`garden-water.ts:1215-1228`); tune its strength;
  - sun glitter moves to dawn only.
- **LanePharos:** tower stone variation (light-5), window stair vs PointLight balance (light-3), rim following the pose.
- **LaneFleetCraft:** owns the sail-transmission retune of `uBacklight` (`garden-fleet-batch.ts:1043-1045`). This lane supplies `uKeyColor` and the sail-emissive trade (light-4).
- **LaneHeadroom:** every idea here is 0 draws, 0 textures and 0 vertex attributes. Per-pixel ALU estimates are [INFERENCE] at 1×; scale them by about 4× for the operator's DPR 2 display.
- **LaneGardenMaster:** material ladder on island, torii and tide band (light-5); flora translucency.
- **LaneArtDirector / LaneCritic:** adopt the ninths L* gate from `outputs/opus-review/light/ninths.mjs` (bible correlation, MAE, % > 85) as the value-plan acceptance for every beat.
- **Conflict to flag:** any lane that assumes the sun sits behind the tower (dawn and golden god rays, the water sun road, sky Mie position) is affected by light-1. The orchestrator should land light-1 first and have the others retune against it.
