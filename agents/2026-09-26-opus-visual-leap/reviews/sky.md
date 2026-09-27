# Sky, sun, moon, stars, clouds, horizon, borrowed hills, fog & weather — sky

## Verdict
The sky has no direction. At rest the visible sky covers only ~0–12° of elevation and ±24.6° of azimuth, while every celestial object is authored outside that window: the moon at 113° off-axis and 52° up, the sun at ≥14° or off to the side. What is left is a single vertical gradient that pours into one fog colour. Across `noon.png`, `golden.png` and `stress-noon.png`, the far-sea band (y 340–520) measures L* 91.6 / 73.7 / 91.6 with a standard deviation of only 1.2, so it is a wall rather than distance. `golden.png` is an orange wash: sky L* 64–74 against the bible's dusk 35/52/43. The hills are ghosts at 34–41% alpha. `night.png` is a void at L* 2.5 from top to horizon, with no moon, although tonight (26 Sep 2026) is the harvest full moon. The leap is to give light a side, rebuild true aerial perspective with a real horizon line, paint borrowed ridges, and put the real moon in the window.

## What I looked at
- Baseline: `dawn`, `morning`, `noon`, `golden`, `blue`, `night`, `deep-night`, `wholemap-dusk`, `wholemap-noon`, `noon-1440p` (plus `.txt` metrics).
- Own captures (both at tier `full`):
  - `outputs/opus-review/sky/stress-noon.png` (`--fixture stress #t=12.25`)
  - `outputs/opus-review/sky/night-stars-motion.png` (6 frames × 750 ms, clip 900,40,700,300)
  - Crops: `sky/_horizon-right-strip.png`, `sky/_horizon-left-strip.png`, `sky/_stress-clouds-crop.png`
- L* measurements, from PIL over the top third and the far-haze band:

  | Frame | Top L* | Far-haze L* (mean ± std) |
  | --- | --- | --- |
  | dawn | 52 | 64 ± 1.3 |
  | noon | 77–80 | 91.6 ± 1.2 |
  | golden | 64–67 | 73.7 ± 1.2 |
  | blue | 45–48 | 48.6 ± 1.6 |
  | night / deep-night | 2.4–2.5 | 3.4 ± 0.2 (the two frames' sampled sky columns are identical) |

- Code read:
  - `garden-sky.ts`: dome shader :345-383, stars :396-460, moon :462-489, `applyPhase` :543-593, `update` :617-699
  - `garden-sun.ts`: arc :50-51, :104-116; moon pose :75-76
  - `garden-horizon.ts`: `RIDGES` :50-72, frag :144-162
  - `garden-sky-billboards.ts`: `MIST_BANKS` :95-106, `CLOUDS` :108-114, cloud frag :214-243
  - `garden-height-fog.ts` :52-188
  - `day-cycle-beats.ts` :18-44
  - `garden-day-cycle.ts` :88-104, :174-208
  - `weather.ts` :125-158, `psi-sky.ts`, `epistemic-haze.ts`
  - `projection.ts` :4-26
  - `garden-water.ts`: cloud-shadow source :2087-2088, :2158-2235
  - `world-renderer.ts`: lightning :4197-4199
  - `detail-model.ts` :742-747
- Geometry derived from `projection.ts`:
  - The camera looks along (−0.707, −0.707) with FOV 32° and pitch 4° at rest, so the top edge sits at about +12° elevation.
  - Moon: azimuth 0.62π gives a forward component of −0.40, i.e. behind the camera.
  - Sun at 17.6 h: 42° right of the view axis, 14.4° up.
  - Sunset azimuth: 53° right.
  - Result: no sun or moon disc can ever enter the rest frame.
- History read: decision ledger, `sky-time-ideas.md`, `tuning-sky.md`, `sky-seam-defects.md`.

## Spell-breakers (defects)

1. **Golden hour is an orange fog wash.**
   - **Where:** `golden.png` everywhere above y 560; `wholemap-dusk.png` top 55% is flat `#e5a75b`.
   - **Why it happens:** the sky horizon, the lower hemisphere and `THREE.Fog` all take one colour, `GARDEN_SKY_BEATS.golden.horizon` `#dca76c` (`garden-sky.ts:48`, `:550`, `:561`, `:382`). Linear fog drives everything distant to it, and the far band ends up L* 73.7 ± 1.2 with the same hue as the sky.
   - **Why it breaks the calm:** nothing rakes. The tower, stone and sea all turn to one caramel, and the bible's "golden hour rakes" and dusk values of 35/52/43 are lost.
   - **Fix:** spell-breakers 2 and 4 plus ideas sky-1 and sky-2. **Cost:** M.

2. **The ember band is pinned to the camera axis, not the sun.**
   - **Where:** `garden-sky.ts:378` computes `west` as a dot product with (−0.707, 0, −0.707), which is camera-forward (`projection.ts:20`). The sun at 17.6 h is 42° to the right.
   - **Blue-hour effect:** at blue hour the band adds `0.22 × ember` (`:564`). The authored blue horizon `#595773` renders as salmon `#a97870` at y 280 in `blue.png` (hue ≈ 10°), so "the blue hour" is pink-brown.
   - **Fix:** anchor the glow to `uSunDir`'s azimuth; zero the ember at blue hour and give that moment to the anti-solar belt (sky-1). **Cost:** S.

3. **Blue hour is lit by a sun that is still up.**
   - **Where:** `SUNSET_HOUR = 19.5` (`garden-sun.ts:51`) against the blue beat of 18.25–19 (`day-cycle-beats.ts:36-38`). At 18:45 `gardenSunPose` gives +5.8°; the golden beat ends while the sun is still +9.5°.
   - **Why it breaks the calm:** dome scattering and sun colour are still daylight inside a frame captioned "the blue hour". Clock and light disagree.
   - **Fix:** key the beats to solar elevation (sky-7). **Cost:** S–M.

4. **The borrowed hills are translucent ghosts.**
   - **Where:** alpha is `0.34 + layer × 0.035` (`garden-horizon.ts:156`) on 11-point profiles. In `noon.png` the right peak sits at L* 83–92 against sky at 92, i.e. invisible. In `night.png` the hills are L* 2.8–3.7, i.e. gone. Only `blue.png` shows a readable cone (1440, 290).
   - **Why it breaks the calm:** the bible's "borrowed headlands close the distance" never happens. The top-right cell (68 / 43 / 11) has no form at all.
   - **Fix:** sky-3. **Cost:** M.

5. **The moon is never in frame.**
   - **Where:** the fixed pose `GARDEN_MOON_AZIMUTH = 0.62π`, `GARDEN_MOON_ELEVATION = 0.29π` (`garden-sun.ts:75-76`) puts the moon 113° from the view axis, behind-left and 52° up. There is no phase.
   - **Consequences:** `night.png` and `deep-night.png` contain no moon, and every consumer of the moon's bearing (the moon road, the night key) points at an object nobody can see. The bible's "one secondary, the moon road" has no source.
   - **Fix:** sky-5. **Cost:** M.

6. **The night sky is a flat void, and the stars blink.**
   - **Values:** zenith-to-horizon L* 2.4–3.4 (`#010b24`) against the bible's night 9 / 14 / 11. At 22:00 and 02:30 the skies are identical.
   - **Wasted budget:** stars are scattered over v ∈ [0.06, 0.88] of the hemisphere (`garden-sky.ts:408`), so only ~16 of 720 fall in frame.
   - **Blinking:** `vTwinkle = 0.55 + 0.45·sin(1.4t + φ)` gives a 10× brightness swing at one shared 4.5 s period (`:438-449`). `sky/night-stars-motion.png` shows a different star subset lit in each 750 ms frame.
   - **Fix:** sky-6. **Cost:** S.

7. **Mist-bank billboards read as bright scratches.**
   - **Where:** `blue.png` at (500–640, 478) and (880–1010, 465); `dawn.png` far left at y ≈ 470; `sky/_horizon-left-strip.png`.
   - **Why:** the `MIST_BANKS` are 30–62 u wide by 4–9 u tall (`garden-sky-billboards.ts:95-106`), additive, with the radial squashed ×2.1 in y (`:198`). At distance that gives 1–3 px horizontal lines.
   - **Fix:** delete them (Subtractions); the kasumi bands in sky-3 replace them. **Cost:** S.

8. **"Market stress" makes the world paler, not heavier, and summons the rejected pills.**
   - **Where:** in `sky/stress-noon.png` the far band stays at L* 91.6. Four blue-grey lozenges float at (370, 300), (1045, 375), (1110, 335) and (900, 355). They are *darker than the sky around them* at noon, because `CLOUD_SHADE_DAY` is the zenith colour (`garden-sky.ts:225-226`).
   - **Why:** the billboard cumulus is re-enabled whenever clarity < 0.65 (`:692-693`), and storm scales the height-fog density ×2.2 (`garden-height-fog.ts:65`).
   - **Why it breaks the calm:** a crisis reads as "a hazy summer day with stickers". The analytical channel is illegible and ugly at once.
   - **Fix:** sky-4 and sky-8. **Cost:** M.

9. **Cloud shadows fall from an empty sky.**
   - **Where:** the water carries daytime cloud shadow at 0.34 (`garden-water.ts:2087-2088`) while cumulus is off (`garden-sky.ts:201`). The mottling in `noon.png` has no cause in the sky.
   - **Fix:** one cloud field and one cover value for both (sky-4). **Cost:** S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### ★ sky-1 Light has a side: a sun-anchored sky with Earth's shadow and the Belt of Venus
- **Picture:**
  - At golden hour the right third of the sky burns molten gold, low over the right-hand ridges. It cools through lemon to a violet zenith. The left third stays lavender-grey, with the far sea there a cool slate.
  - After sunset, a dusty-rose band (the Belt of Venus) lies along the left-hand horizon over a deep blue-grey band (Earth's shadow). The west keeps a thin orange rim for ten minutes.
  - At dawn the same picture is mirrored.
  - One glance tells you where the sun is, even though it is off-frame.
- **Why:**
  - The dome's horizon colour is azimuth-independent (`garden-sky.ts:348-352`).
  - The Mie lobe `pow(mu, 12)` (`:365`) is ≈ 0.027 at the sun's 42° off-axis angle, i.e. invisible.
  - The ember band points at the camera, not the sun (`:378-380`).
  - So `golden.png` and `blue.png` are single-colour washes.
- **Impact:** stunning 5, poetic 5, relaxing 4. **Confidence:** H.
- **Cost:** M. **Perf:** 0 draws / 0 tris / ≈ +0.02 ms ALU / 0 textures.
- **How:**
  - In the dome fragment, compute the horizontal sun alignment `a = dot(normalize(dir.xz), normalize(uSunDir.xz))`, with `sunSide = pow(smoothstep(-0.3, 1.0, a), 1.5)`.
  - Horizon colour = `mix(uAntiHorizon, uSolarHorizon, sunSide)`. Add a broad glow `pow(max(a, 0), 3) × (1 − smoothstep(0, 0.25, dir.y)) × uGlow`, gated by `smoothstep(-0.12, 0.05, sunElev)`.
  - Anti-solar belt:
    - Rose band: `uBelt × smoothstep(0.01, 0.04, dir.y) × (1 − smoothstep(0.06, 0.14, dir.y)) × smoothstep(0.0, -0.8, a)`.
    - Earth's-shadow slate band: below 0.03 on the same side.
    - Weight: `smoothstep(0.04, -0.02, sunElev) × smoothstep(-0.16, -0.06, sunElev)`, i.e. only between sunset and nautical dusk.
  - Colours per beat, as rendered-frame targets:

    | Beat | Solar horizon | Anti-solar horizon | Belt | Earth's shadow |
    | --- | --- | --- | --- | --- |
    | Golden | `#f0b070` (L* ≈ 77) | `#9c93b3` (L* ≈ 63) | | |
    | Blue | `#b98a6e` thin | `#58648a` | `#9a7486` | `#3e4666` |
    | Day | `#eef1f4` | `#c6d4e6` | | |

  - Delete `uEmberStrength` and the `west` term.
  - Extend `GARDEN_SKY_BEATS` (`garden-sky.ts:47-53`) to `{ zenith, solar, anti }`.
  - `blendGardenSkyColor` then feeds sky-2's airlight. The same function is evaluated at elevation 0 for the fog, so sea and sky agree.
- **Displaces:** the ember band, the uniform horizon colour, and the Mie term at the current exponent.
- **Truth & a11y:** illumination only, owned by the wall clock; no data meaning. Reduced motion: identical, since this is not animation.
- **Risks:**
  - The PMREM probe bakes from this material, so directional reflections on metal shift. That is correct but needs a re-look.
  - `garden-sky.test.ts` pins on the horizon colour need re-pinning.
  - If LaneLight rotates `NOON_BEARING`, everything follows `uSunDir` automatically.
- **Acceptance:**
  - `#t=17.6` at rest: right-third sky L* ≥ 12 above left-third sky; far-band hue differs ≥ 25° left vs right.
  - `#t=19.2`: a visible rose band over a slate band along the left horizon.
  - `blue.png` region (1000–1600, 60–330) reads hue 220–260°, not 10°.

### ★ sky-2 True aerial perspective and a horizon line
- **Picture:**
  - The far harbour recedes in steps rather than dissolving. Near hulls hold their colour. Mid flotillas cool and soften. The farthest sails become pale blue-grey cut-outs, and each plane reads against the next.
  - Beyond them, a quiet horizon line, ~ΔL* 5 darker than the sky, cuts across the frame at 38% height. The borrowed ridges stand on it.
  - At golden hour the far sea under the sun carries a gold road; on the other side it stays slate.
- **Why:**
  - `THREE.Fog` is a linear mix to one colour (`garden-sky.ts:512`, `:83-105`). Height fog then mixes to a second colour (`garden-height-fog.ts:144-164`), and the dome's lower hemisphere is deliberately forced to that same colour (`garden-sky.ts:381-382`).
  - Result: no extinction, no hue shift and no horizon, just a 180-px band with std L* 1.2 in `noon`, `golden` and `stress-noon`.
  - Real aerial perspective darkens and cools dark objects toward a *view-direction* airlight and desaturates them.
- **Impact:** stunning 5, poetic 4, relaxing 5. **Confidence:** H.
- **Cost:** M. **Perf:** 0 draws / 0 tris / ≈ 0 ms net (one fog chunk replaces the linear fog plus the height-fog double mix) / 0 textures.
- **How:**
  - One GLSL function `gardenAerial(scene, worldPos, dist, viewDir)`, injected where `fog_fragment` runs today (the `garden-height-fog.ts` injector pattern, :216-263), including the water annulus.
  - Extinction: `T = exp(-σ · d · exp(-(y − sea) · falloff))` with `σ = density × vec3(0.78, 0.9, 1.18)`, so blue extinguishes first and far darks go blue.
  - Airlight: `sky-1(viewDir.xz, elev = 0) × seaDim`, with `seaDim` 0.90 by day, 0.86 at golden and 1.10 at night. At night the sea sits *above* the glow line, so silhouettes read.
  - Output: `mix(luma, c, mix(0.5, 1.0, avg(T)))`, then `c·T + air·(1 − T)`.
  - Dome lower hemisphere = the same airlight × `seaDim`.
  - Ichimonji: a 2–3 px darkening at `dir.y ∈ [0, 0.004]`, gain 0.06.
  - Densities: keep `fogRangeAtViewHeight` distances, but set density so T = 0.55 at the island's far rim and T ≈ 0.05 at the annulus edge (480 u, `garden-water.ts:138`).
  - Clear-noon `uHazeStrength` drops from 0.42 to 0.12 (`garden-sky.ts:588-591`).
- **Displaces:** the linear `Fog` colour law, the global height-fog mix (it survives only as the local epistemic shelf, `:166-188`), and the `:381-382` seam rule.
- **Truth & a11y:** no data meaning. The fleet's own aerial restraint (`garden-fleet-batch.ts:996-999`) is chroma-only, so the pirate contrast floor stays invariant. Verify with the existing fleet tests. Reduced motion: static.
- **Risks:**
  - Whole-map zoom must fully fog the annulus by 480 u, or the ring edge shows (`sky-seam-defects.md` A).
  - Fleet readability at the far third: LaneFleetCraft must sanity-check.
  - Fog-factor tests need re-pinning.
- **Acceptance:**
  - `noon.png` band (1000–1600, 340–520): std L* ≥ 5, horizon-line ΔL* 3–7 over ≤ 4 px.
  - `golden.png`: far-band mean L* ≤ 62.
  - `wholemap-noon`: no annulus edge.

### ★ sky-3 Shakkei: five painted ridges with kasumi bands
- **Picture:**
  - Behind the harbour, a borrowed landscape opens like a folding screen:
    - A single noble asymmetric peak stands far right, smooth and pale.
    - A long low range lies far left.
    - Two middle ridges, a step darker, overlap its feet.
    - At the right edge, a near dark headland carries a crest of tiny pines.
  - Feathered mist bands cut across the ridge feet, so the peaks float.
  - At golden hour the sun-facing slopes carry a hair-thin gold edge. At night the ridges are ink-dark shapes against a faintly luminous horizon.
- **Why:**
  - Today there are 3 ridges × 11 points at 34–41% alpha (`garden-horizon.ts:50-72`, `:156`). They are identical smooth cones and read as smears (`sky/_horizon-*-strip.png`).
  - The bible's top-right cell needs 68 / 43 / 11 and currently gets sky.
  - Aerial perspective also lives in *detail* (Sesshū, Hiroshige): far ridges are smooth, near ridges are textured.
- **Impact:** stunning 5, poetic 5, relaxing 4. **Confidence:** H.
- **Cost:** M. **Perf:** 0 Δdraws (same single mesh), +~600 tris (≈ 60 → 660), 0 textures, < 0.02 ms.
- **How:**
  - Replace `RIDGES` with 5 entries `{depth, height, offset, width, knots[], roughness}`:

    | Ridge | depth | height | offset | width | roughness |
    | --- | --- | --- | --- | --- | --- |
    | Peak | 500 | 34 | +120 | 260 | 0.005 |
    | Far range | 470 | 16 | −150 | 240 | 0.01 |
    | Middle right | 380 | 20 | +190 | 150 | 0.02 |
    | Middle left | 360 | 24 | −200 | 160 | 0.025 |
    | Near headland | 260 | 12 | +235 | 120 | 0.05 + pine crest |

    - The peak's flanks follow `(1 − |x|)^1.6` with a left shoulder.
    - The near headland's pine crest is a sawtooth of 0.6–1.4 u every 2–3 u.
  - Build 64 Catmull-Rom points per ridge plus 2-octave 1-D noise × roughness.
  - Keep the centre (offset −90 to +90) low so the open sky behind the tower (ma) survives.
  - Shading:
    - Opaque `alpha = 1`, except the bottom 25% fades into airlight.
    - Value = `mix(ridgeInk, airlight, k)` with `k` = 0.88 / 0.82 / 0.68 / 0.62 / 0.40 from far to near.
    - Top 6% slightly darker than the foot.
    - Sun rim: `max(0, dot(slopeNormal2D, sunScreenDir)) × (1 − smoothstep(0.05, 0.3, sunElev)) × 0.12` in sun colour.
  - Night: ridges at L* 9–11 against a sky-6 horizon at L* 14–15.
  - Kasumi: 3 feathered horizontal quads in the same buffer (`aKind = 1`), about 2–5 u above the horizon, alpha 0.55, `airlight × 1.06`, with noise-broken ends.
  - `GARDEN_HORIZON_VALUE_SCALES` becomes the `k` ladder.
- **Displaces:** the 3 ghost cones and the 9 far mist-bank billboards (−1 draw).
- **Truth & a11y:** scenery only. Hidden on the `constrained` tier as today.
- **Risks:**
  - The peak must not become a second monument: keep it below 4° and pale (k 0.88).
  - Avoid a literal Fuji: the peak is asymmetric with a shoulder.
  - Re-pin `garden-horizon.test.ts` silhouette count and triangle budget.
- **Acceptance:**
  - `#t=12.25` right third: at least three distinct ridge values (ΔL* ≥ 4 between planes).
  - `#t=22`: ridge silhouettes readable at ΔL* ≥ 3 against the horizon.
  - Blurred view: the central sky gap behind the tower stays open.

### sky-4 Painted cloud layers on the dome, with cover owned by market stability
- **Picture:**
  - Clear markets: two or three long brushstrokes of high cloud and a crisp horizon.
  - Steadier-than-tremor markets: a row of small flat-bottomed cumulus compressed toward the horizon, like clouds on a byōbu screen.
  - Their sun sides glow and their undersides go coral at sunset. After the low sky turns blue, the high streaks hold pink for another ten minutes: the afterglow.
  - On the water, the shadows are cast by the same field you see.
- **Why:**
  - The billboard pills (`sky/stress-noon.png`) fail because they are camera-facing cards with a zenith-coloured body.
  - The volumetric raymarch was rejected for variance.
  - A 2-D cloud plane projected by ray/plane intersection gets horizon foreshortening, depth fade and directional light for a few texture taps. That meets the ledger's re-entry condition ("directionally lit … depth fade", decision-ledger:18).
  - The shared field also cures spell-breaker 9.
- **Impact:** stunning 4, poetic 5, relaxing 4. **Confidence:** M.
- **Cost:** M. **Perf:**
  - 0 draws (in the dome); 0 new textures (reuses the tileable `createCloudNoiseTexture` tile, `garden-water.ts:2218`). This matters because the texture ceiling is the tightest one (the whole-map census is at 72/72 per LaneHeadroom).
  - [INFERENCE] ≈ +0.1–0.2 ms at 1600×1000@1x, roughly ×4 at the operator's DPR 2. The dome currently shades the full screen (`depthTest: false`, `renderOrder -2`, `garden-sky.ts:300`, :390).
  - Fund it by drawing the dome *last* with a depth test at the far plane, so only sky pixels (~35% at rest) shade. Net ≈ 0.
  - All ms figures in this report are analytic estimates [INFERENCE]; the per-pass `gpu` line is not additive on ANGLE Metal.
  - −1 draw when the billboard cumulus is deleted.
- **How:**
  - Cloud layers:
    - Low layer at `H1 = 45`: `t = H1 / dir.y`, `uv = (dir.xz × t + uCloudOffset) × 0.004`, `n = tex(uCloudShadow, uv)`, `dens = smoothstep(1 − cover, 1 − cover + 0.2, n)`.
    - Light and body: two taps along `uSunDir.xz` give a lit/shade value, `lit = clamp((dens − dens(uv + sunXZ × 0.015)) × 3 + 0.5)`. Colour = `mix(shade, solarLit, lit)`. Posterize to 3 tones blended 40% (woodblock).
    - High layer at `H2 = 160`: `uv.x × 0.15` anisotropic along the wind, alpha ≤ 0.35, lit until `sunElev > −0.07`.
    - Horizon fade: `smoothstep(0.004, 0.03, dir.y)`.
  - Drift: the CPU integrates `uCloudOffset` from the same wind offset as the cloud-shadow source (`:2182-2213`).
  - Cover follows the PSI band: BEDROCK 0.05, STEADY 0.15, TREMOR 0.30, FRACTURE 0.50, CRISIS 0.72, MELTDOWN 0.88. Ease over 120 s on top of `psiSkyClarity`'s 60 s hysteresis.
  - Water: `uCloudShadowStrength = daylight × (0.08 + 0.5 × cover)`.
  - Colours: shade = anti-solar horizon × 0.82, lit = solar horizon × 1.08. At night, clouds are darker than the horizon glow, with moonlit rims within 12° of sky-5's moon.
- **Displaces:** the billboard cumulus (`CLOUDS`, `CLOUD_FRAGMENT_SHADER`, the summer/low-clarity bypass at `garden-sky.ts:692-693`) and the phase-only cloud-shadow strength.
- **Truth & a11y:**
  - Cover encodes the PSI band ("clarity aloft"). The DOM already states the correlation (`detail-model.ts:742-747`).
  - Add a cover word per band to the lighthouse facts: Clear / Fair / Veiled / Broken / Low cloud / Overcast. Form carries meaning, not colour.
  - Reduced motion: offset pinned at 0; the static tableau shows the band's cover.
- **Risks:**
  - Clouds must not sit behind the beacon at night: keep their night value below the beam.
  - Tile repetition: two scales plus rotation of the second tap.
  - The PMREM bake sees clouds; bake at the eased cover, never per frame.
- **Acceptance:**
  - `--fixture stress #t=12.25`: no lozenges; a lowered broken deck reads as heavier weather, and the upper-third mean L* drops ≥ 10 versus calm.
  - `#t=17.6`: cloud sun sides warmer than shade sides by ≥ 15° hue.
  - Motion sheet 9 × 600 ms: drift invisible frame-to-frame.

### sky-5 The real moon, in the window
- **Picture:**
  - Tonight a full harvest moon rises out of the left-hand ridges at dusk, amber and large, and climbs slowly across the upper frame. Its silver road crosses the inlet toward you.
  - On a crescent night a thin bow hangs low in the west after sunset, with earthshine on its dark limb.
  - On new-moon nights there is no moon, the stars thicken, and the sky is at its deepest.
- **Why:**
  - The moon is fixed behind-left, out of frame at every hour (`garden-sun.ts:75-76`), and has no phase.
  - By today's wall clock (moon age 15.06 d, 99.9% lit) the frame should hold the brightest object of the night.
  - The bible names the moon road the secondary light. It needs a visible source.
- **Impact:** stunning 5, poetic 5, relaxing 5. **Confidence:** H.
- **Cost:** M. **Perf:** ≈ 0 Δdraws. The two moon spheres go, but they are off-frame and presumably frustum-culled today [INFERENCE]. 0 tris, [INFERENCE] +0.02 ms, 0 textures.
- **How:**
  - New pure `src/systems/sky-almanac.ts`:
    - Phase: `age = (JD − 2451550.1) mod 29.530589`; `illum = (1 − cos 2πage/P)/2`.
    - Timing: `transit ≈ (12 + age × 0.8127) mod 24`; rise/set = transit ∓ 6.2 h.
  - Displayed pose (a *painterly compression*, like `ARC_SWEEP` already is for the sun):
    - Progress `q` over the above-horizon span.
    - Azimuth = view axis + (q − 0.5) × 0.80 rad, i.e. ±23°, rising left and setting right.
    - Elevation = `asin(uSkyVisibleHeight) × (0.12 + 0.62 sin πq)`.
    - It stays in frame at every zoom and rises among the left ridges.
  - `gardenMoonPose` returns this pose, so water (the moon-road column, LaneWater) and the night key (LaneLight) read the same answer.
  - Draw it in the dome shader:
    - Disc 1.1° (≈ 34 px at 1000 px height).
    - Sphere normal `n = (p, √(1 − r²))`; terminator `smoothstep(−0.04, 0.04, dot(n, L_phase))`; earthshine 0.05; three soft maria at −8%.
    - Low-moon warmth: `lerp(MOON_COLOR, lantern_warm, 0.35 × (1 − smoothstep(0.5°, 6°, el)))`.
    - Two-scale halo: `exp(−θ/0.6°) × 0.25 + exp(−θ/5°) × 0.06`, both × illum.
  - Star opacity × `(1 − 0.55 × illum × moonUp)`.
- **Displaces:** the moon spheres and the fixed moon constants. It dims the stars on bright nights.
- **Truth & a11y:**
  - No analytics; the moon is wall-clock truth.
  - Offer LaneChrome a caption suffix ("· a full moon") as the text equivalent.
  - Reduced motion: the pose is a function of the clock minute, not animation, so it is identical.
- **Risks:**
  - The backlit night key changes the tower's modelling: LaneLight and LanePharos must judge.
  - The moon must never outshine the beacon: keep disc peak ≤ 0.8 of beacon luminance after bloom.
  - No latitude is known: use a nominal 35° N.
- **Acceptance:** `#t=19` (today's date): moon disc just above the left ridges. `#t=22`: disc in the upper-left third, road aligned to it within 2° on the water. The beacon stays the brightest pixel cluster.

### sky-6 A night sky with depth: horizon glow, graded stars, slow scintillation, turning heavens
- **Picture:**
  - The night is no longer black paper. It deepens from a luminous indigo horizon, against which ridges, masts and the tower read as ink, up to a dark zenith.
  - A few stars are clearly brighter than the many faint ones. Near the horizon they shimmer gently, never blinking.
  - By 02:30 the field has turned. On moonless nights a faint Milky Way leans across the right third.
- **Why:**
  - Sky L* is 2.4–3.4 everywhere (bible 9 / 14 / 11).
  - ~2% of the stars are ever in frame.
  - The twinkle has a 10× amplitude on one shared period (`garden-sky.ts:438-449`), as `sky/night-stars-motion.png` shows.
  - The two night hours are identical.
- **Impact:** stunning 4, poetic 5, relaxing 5. **Confidence:** H.
- **Cost:** S. **Perf:** 0 draws, stars 720 → 1,200 points (negligible), +0.01 ms, 0 textures.
- **How:**
  - Night beat, rendered targets: frame-top zenith `#0e1530` (L* ≈ 7.5), horizon `#1b2440` (L* ≈ 15), sea below via sky-2's `seaDim`. Author `GARDEN_SKY_BEATS.night` (`garden-sky.ts:52`) to land there after grade; coordinate with LanePrintmaker's bero-ai mock.
  - Stars:
    - Placement: elevation 0.5°–25° only (`v ∈ [0.01, 0.42]`).
    - Magnitude via `aMag`: 80% 1 px α 0.3, 18% 1.5 px α 0.6, 2% 2.2 px α 1.0.
    - Extinction `smoothstep(0.005, 0.05, y)`.
    - Scintillation: ±12% at 6–11 s per star (`aRate`), scaled by `1 − smoothstep(0.05, 0.25, y)`.
  - Rotate `stars.points` about a polar axis tilted 35° at 15°/h of wall clock.
  - Milky Way: a 3-octave band ≤ +3% luminance in the dome, weight `night × (1 − illum_moon) × (1 − cover)`.
- **Displaces:** the flat night gradient and the blinking twinkle.
- **Truth & a11y:**
  - None analytic. PSI cover still veils the stars (`garden-sky.ts:639`).
  - Reduced motion: scintillation off, rotation still wall-clock static.
  - Brighter night silhouettes help legibility.
- **Risks:**
  - The beacon must stay the single dominant light: horizon glow stays at L* ≤ 15.
  - Star aliasing under TAA/SMAA: keep points ≥ 1 px.
- **Acceptance:** `#t=22`: top-third L* 7–9, horizon strip L* 13–16, ridges visible. `#t=22` vs `#t=2.5`: the star fields differ. A 9 × 750 ms motion sheet shows no star vanishing.

### sky-7 One sky clock: beats keyed to solar elevation, sun keyed to the date
- **Picture:**
  - In December the harbour darkens at five and lamps kindle early. In June the evening stays gold until nine.
  - Golden hour ends at sunset, and the blue hour happens *after* the sun is gone.
- **Why:**
  - The beats are fixed clock hours all year (`day-cycle-beats.ts:21-42`), and the sun sets at 19.5 inside the blue→night crossfade (spell-breaker 3).
  - "Wall clock owns illumination" is only half-honoured without the date.
- **Impact:** poetic 4, relaxing 3, stunning 2. **Confidence:** M.
- **Cost:** M. **Perf:** CPU only.
- **How:**
  - In `sky-almanac.ts`:
    - Declination `δ = 23.44° sin(2π(284 + N)/365)`, `cos H0 = −tan 35° tan δ`.
    - Solar noon = 12:00 + DST hour (detect with January vs July `getTimezoneOffset`).
  - Beats from solar elevation `e`:
    - night `e < −10°`
    - blue −10°…−1°
    - golden −1°…+8°
    - day `> 12°`
    - dawn: the mirrored morning span
  - `gardenSunPose` keeps its compressed azimuth, but its elevation comes from `e`, scaled so the apex = `NOON_ELEVATION`.
  - The DOM time sentence already consumes `dayCycleBeats`, so it follows.
- **Displaces:** the fixed `SUNRISE_HOUR` / `SUNSET_HOUR` and the hour-edge constants.
- **Truth & a11y:** strengthens the clock premise. Reduced motion: unaffected.
- **Risks:** a broad re-baseline (every beat test, reference frames at fixed `#t`). The nominal latitude is an authored assumption, stated in the DOM "about" copy.
- **Acceptance:** `#t=18.8` on 26 Sep: sun elevation < 0 while the blue beat ≥ 0.8. A mid-December date at 17:00 reads blue/night.

### sky-8 Weather as calm poetry: a descending ladder instead of flashes and milk
- **Picture:**
  - As the market frays, the sky changes character rather than whitening:
    - The high veil dims the sun glow.
    - Then a broken deck lets ladders of light slant through gaps near the horizon.
    - Then soft grey rain veils hang from distant cloud bases over the far sea, drifting slowly. In winter they fall as slow snow curtains.
  - At the peak, the inside of the far cloud bank glows silently for two seconds, once in a long while. There is never a flash over the garden.
- **Why:**
  - Stress currently raises fog density ×2.2 (`garden-height-fog.ts:65`), turning the scene paler (`stress-noon.png` far band L* 91.6).
  - Lightning multiplies the key light by 3.2 across the whole scene (`world-renderer.ts:4197-4199`), which is urgency and an anti-reference.
  - A rainbow is rejected on truth grounds: with the sun ahead of the south-facing view, the anti-solar point lies behind the camera, so a bow can never truthfully enter this frame.
- **Impact:** poetic 4, relaxing 4, stunning 3. **Confidence:** M.
- **Cost:** M. **Perf:** 0 draws (dome), +0.03 ms, 0 textures.
- **How:**
  - All from sky-4's cover and `stormLevel`, drawn in the dome.
  - Crepuscular slots:
    - Weight `(1 − dens along the sun azimuth) × smoothstep(0.3, 0.6, cover) × smoothstep(0.35, 0.05, sunElev)`, ≤ +6%.
    - Replaces the shadow-map god rays only when cover > 0.4; LaneLight keeps the rest.
  - Rain veils:
    - Only for cover > 0.65, below the cloud base (`dir.y < base`).
    - Vertical streak noise `n(uv.x × 40, dir.y × 2 + t × 0.02)`, α ≤ 0.25, 2–3 veils drifting with the wind.
    - In winter: dotted, slower, whiter.
  - Height-fog storm gain drops from 1.2 to 0.3. The heaviness comes from value (deck shade), not milk.
  - Lightning becomes an intra-cloud glow of ≤ +12% within the horizon bank, at most once per 90 s. Delete the key-light multiplier.
- **Displaces:** the lightning flash, the storm fog gain, and the billboard pills.
- **Truth & a11y:**
  - Storm still maps to PSI stress with the same DOM text.
  - Precipitation form (rain or snow) is kigo, not data.
  - Reduced motion: static veils, no glow.
  - Photosensitivity improves: no whole-frame flashes.
- **Risks:** veils reading as dirt, so keep them below the horizon band, far only. LaneWater's storm chop must agree.
- **Acceptance:** `--fixture stress #t=12.25`: a darker broken deck, far veils, far-band L* ≤ 75. A 20-frame × 500 ms motion sheet: no frame-wide luminance jump > 3 L*.

## Subtractions
- **Billboard cumulus:** `CLOUDS` and `CLOUD_FRAGMENT_SHADER` (`garden-sky-billboards.ts:108-114`, :214-243) and the bypass at `garden-sky.ts:692-693`. It is the pill layer in `stress-noon.png`.
- **Far mist banks:** all 9 `MIST_BANKS` (`garden-sky-billboards.ts:95-106`), which render as scratches. The kasumi bands in sky-3 replace them. Keep only the `localMist` epistemic banks.
- **Moon spheres:** `createMoon` (`garden-sky.ts:462-489`), two meshes that never enter the frame. Replaced by the dome moon in sky-5.
- **View-axis ember band:** `garden-sky.ts:378-380`, `:564`.
- **Clear-noon haze floor:** `uHazeStrength` 0.42 → 0.12 (`garden-sky.ts:588-591`).
- **Lightning key-light multiplier:** `world-renderer.ts:4197-4199`.
- **Static autumn geese:** pinned at one spot for the whole season (`AUTUMN_GEESE`, `driftSpeed 0`, `STATIC_VERTEX_SHADER`; the tiny mark at ~(900, 300) in every day frame). Either delete them, or make them an event: one skein crosses the sky band at dusk in about 90 s, and then the sky is empty (coordinate with LaneLife).
- **Double fog:** the linear-fog plus height-fog pair collapses into one aerial function (sky-2).

## Reversals
- **"The sea horizon and lower hemisphere share the live fog exactly"** (`garden-sky.ts:381-382`; seam-hiding lineage from `sky-seam-defects.md` A).
  - Evidence: a 180-px band with std L* 1.2 in `noon`, `golden` and `stress-noon`. The bible asks for "a real sky band".
  - Argument: the seam it hid (the finite backdrop sheet) is gone. There is now a camera-following sea annulus (`garden-water.ts:1729-1754`) and a perspective camera, so a horizon line costs nothing.
  - Risk: the annulus edge at whole-map zoom must fog out fully by 480 u.
- **Fixed moon "upper-left"** (`garden-sun.ts:67-76`).
  - Evidence: 113° off the view axis, never in any frame, and no phase.
  - Argument: put the displayed moon in the window on a compressed real-phase arc. This is the same compromise `ARC_SWEEP` already makes for the sun.
  - Risk: the night key becomes frontal/backlit (LaneLight to judge).
- **"Dense Milky Way/HDRI sky rejected"** (`sky-time-ideas.md:57`), partially.
  - Evidence: the night sky is an L* 2.5 void.
  - Argument: a ≤ 3% band shown only on moonless, clear nights sits far below the beacon and makes darkness spacious rather than empty. The prior rejection targeted spectacle, not depth.
- **Beats as fixed clock hours** (`day-cycle-beats.ts`).
  - Evidence: blue hour with the sun at +5.8°.
  - Argument: key the beats to solar elevation and the date. This strengthens the wall-clock premise rather than reversing it.
- **Billboard cumulus off / raymarch rejected** (ledger :18-19). Not reversed: sky-4 is a third route that meets the ledger's stated re-entry condition (directionally lit, depth-faded, no variance).

## Cross-lane dependencies
- **LaneWater:**
  - The moon-road column reads sky-5's displayed moon pose (agreed via IRC).
  - The annulus must not overwrite its reflection with the fog colour (`garden-water.ts:1429-1436`), so the far sea sits ~ΔL* 5 below the sky horizon (a joint seam item).
  - Cloud-shadow strength follows sky-4's cover.
  - At golden hour the far-sea glitter should sit on the sun side.
- **LaneLight:** owns key/fill, exposure and grade/LUT; agreed that sky owns the ember band, beats and fog. The night key should derive from the displayed moon. The LUT must not re-pink blue hour (hue check on `blue.png`). A `NOON_BEARING` rotation is compatible, since everything reads `uSunDir`.
- **LanePrintmaker:** the bero-ai night values need to land on sky-6's rendered targets (L* 7 / 15 / 9–11).
- **LaneHeadroom:** draw the dome last with a far-plane depth test to fund sky-4; confirm the PMREM bake cadence when cover changes.
- **LaneFleetCraft / LaneHarbour:** readability of the far flotilla under sky-2's extinction.
- **LaneChrome:** optional moon-phase suffix in the time sentence.
- **LaneDataPoetry:** the PSI cover vocabulary (Clear … Overcast) in the lighthouse facts.
- **LaneGardenMaster / LaneArtDirector:** ridge silhouettes and value ladder (sky-3), and keeping the peak subordinate to the Pharos.
- **LanePharos:** the beam cone reads as a stubby smudge against the night sky (`night.png` 690–760, 210–290; `deep-night.png` 820–890, 210–290); it will read worse against a brighter horizon glow.
- **LaneLife:** geese as a dusk event.
