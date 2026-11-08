# O1 — Art direction & the whole frame

Lane O1 · `main` @ `29e0b2a3` (v1.4.1) · 2026-11-08 · 9 real-GPU captures and derived studies in `shots/O1-*`. L is display luminance (0–1) measured on the PNGs. "Heart" is the landing framing.

## Summary

The night is already postcard-grade. The fire and beam hold the top value, the lamps carry the colour, and a storm at night (`O1-storm-night.png`) is the best frame in the set. Daylight falls short for three reasons:

1. **The hero is not the top value by day.** The painted sky band and the far sea (L 0.74) out-value the tower (0.62–0.65). In a notan, the Pharos merges into the horizon.
2. **The water is "map-pin confetti".** Three things stack. Since v1.4.1 the sail roundels stay paper-white at every range. The burgees float on masts that recede to nothing. And 469 mooring buoys are always shown. Together they give the Roads and the basin 55–64 bright specks per 10k px, against 8.7 in the open sea.
3. **The colour script is weak.** There is a 7-hour noon plateau, a magenta-violet dusk, and a pool-cyan basin that ignores the hour's light.

There is also a real defect. The 3D mainland mesh leaks in front of the camera-attached sky card whenever the camera stands back:
- zoomed out past about 700 m on any desktop;
- every landing on a screen squarer than about 1.2;
- tablet portrait.

Best value for cost, in order:
1. Retire that mesh.
2. A day value lock.
3. Tonal roundels and quieter buoys.
4. A night fog that reads.
5. A "last light on the Pharos" dusk moment.

## 1. Current state

- **Night is the benchmark.** The lantern sits at L 0.70 against a sky of 0.22–0.41 (`O1-notan-day-golden-night`, bottom row). `psi=none` reads clearly, and DEWS DANGER reads as weather by day and is superb at night.
- **The 16:10 composition is sound.** The Pharos sits on the left third, the civic quarter balances it, and the basin and mole lead the eye. Ultrawide and small-laptop frames hold up. The Roads, top right, are the densest clutter in every frame.
- **The day value structure is inverted.** The brightest mass is the sky and far-sea band, although `sea-tone.ts:6-7` says the Pharos should hold the top value.
- **The skies are the best day asset.** Dawn, 7:45 (`O1-t0745`) and golden are distinct and painterly. The basin stays cyan or teal under all of them, because the sea body is unlit (`ocean-material.ts:200-279`); the hour reaches it only through `hbSeaGolden` on sunlit water at a low sun.
- **The water is busy.** Speckle density (blobs ΔL > 0.10 above a 9 px median, base-day) is 64/10k px in the Roads, 55 in the basin, 8.7 in the open sea (`O1-noise-crops`).
- **Data cues in a 5-second read:**
  - DEWS storm: strong.
  - Stale fog: strong by day (basin chroma −68 %), nearly invisible at night (gap 5).
  - PSI: at night only; by day a glint, rarely in a still.
  - Off-peg sea: subtle.
  - Shoals: clear.
  - Wreck Cove: only at the overview, in the soft zone.
- **The horizon is a camera-attached painted card** (`sky-system.ts:19-23,75`). It is elegant at 16:10, but its placement rule lets the 3D mainland through (gap 1).

## 2. Top 10 whole-frame gaps (ranked)

| # | Gap | Evidence | Cause in code | Fix | Sev |
|---|---|---|---|---|---|
| 1 | **Mainland wall at the horizon.** A faceted brown or green band with pale triangle facets fills the top 25 % | `O1-zoomout-1100`, `base-tablet-portrait`, `O1-portrait-overview` | Card distance `R = camY/tan(pitch−0.3·vfov)` (`sky-system.ts:379-392`) grows with camera height. The `shakkei` node (~520 m NW, `compose.py:1182-1192`, `hb_dress.py:1575-1637`) then sits nearer than the card. It only loses `castShadow` (`island-system.ts:57`) and gets the 0.28-capped aerial tint (`aerial.ts:16`), not the "strong fog" its export note asks for (`hb_export.py:324-328`). Modelled: the default heart hides it by **22 m** (R 911 m vs coast 933 m). It is visible at any zoom ≥ ~700 m (max 1150 m), and at landing for aspect ≤ ~1.2 (heart 808–1089 m; tablet-portrait overview 1547 m) | I3 | high |
| 2 | **Hero value inverted by day** | tower top/shaft 0.65/0.62 vs sky beside the lantern 0.74 and far sea 0.74 (base-day); winter 0.66 vs 0.78–0.80; golden 0.68 vs 0.70 | The visible band is only ~5°, so the gradient (`sky-glsl.ts:130-132`, `e/6.5`) is barely 40 % zenith at lantern height. The horizon/haze keys are near-white (`time-of-day.ts:97,104,110`). The far-sea haze ramps from 0.62 R (`ocean-material.ts:521`) | I1 | high |
| 3 | **Map-pin confetti** | `O1-noise-crops` A, B; speckle counts above | Paper-white roundel `t.rgb*0.92` at any range (`fleet-material.ts:420`, v1.4.1 `f4781348`). Burgees are exempt from the aerial tint (`aerial.ts:10`) and float above masts that recede far away (`fleet-material.ts:45-51`). 469 decorative buoys are always drawn (`fleet-system.ts:859-868`) | I2, I4 | high |
| 4 | **Colour script: noon plateau, monochrome dusk, unlit basin** | `O1-colour-script-current`. At 9:00 vs 11:00, sky, far sea, basin and Roads all differ by ≤ 0.02 L. Sunset sky `#C98C90` over a basin of `#1B3D64` (S 0.75); blue-hour sky `#966B84`. 3:00 ≈ 22:00. At 7:45 the basin is pool-cyan under a pink sky | The 8.5/12/16 keys are near-identical (`time-of-day.ts:94-112`). Coral → indigo interpolation passes through mauve (`:132-141`) | I5 | medium |
| 5 | **Stale fog vanishes at night** (the only in-world stale cue) | `O1-stale-night` vs `view-heart-night` (both t=21): far sea +0.08 L, basin +0.03, lamps and sky unchanged. By day the basin is +0.23 L | The night bank is lifted toward the horizon colour (`readings/fog.ts:108`). Extinction is weak against a dark scene, and nothing scatters the lights | I7 | medium |
| 6 | **ETH banner and crest flags look like stickers** | `O1-close-civic`, `O1-noise-crops` F. At night the ETH flag is L 0.34 against a 0.13 basin, the brightest non-lamp mass | Unshaded `t.rgb*(uLight*vShade+uGlow)` (`crest-flags.ts:41`). Scale 1.65 (`identity-system.ts:32`) × farScale up to 1.45 (`:173`). Uniform night glow 0.16 (`:174`) | I8 | medium |
| 7 | **Water lettering reads as embossed stone** ("THE ROADS" sits on the densest fleet) | `O1-noise-crops` A | Caps 14–19 m × stretch 1.85 (`labels.ts:34,49`), so letters are 26–35 m tall. Ink density 0.86 (`lettering.ts:102`) plus a pale halo (`:95,196`) | I9 | medium |
| 8 | **Overview foreground mush** | `base-overview` bottom (`O1-noise-crops` D) | The tilt band is centred on the Pharos at the frame top (`post.ts:337-345`, `layout-system.ts:62-65`). Opacity reaches 0.55 (`post.ts:335`), so the harbour, the overview's subject, sits in the soft zone. Day specks bloom | I10 | medium |
| 9 | **Wakes read as dashed UI lines** | `O1-noise-crops` C | The "echelon" is a fixed-period sine (`wake.ts:101-102`) | I11 | medium |
| 10 | **Squarer screens waste the frame** | `O1-portrait-overview` (27–40 % empty, blurred sea) vs `O1-portrait-overview-alt` | The fit backs off for the hero width only (`framing.ts:59-92`) | I12 | medium |

Also (low):
- A storm by day drowns the hero: 0.39 against 0.58 (`state-storm-danger`, I13).
- A photographic logo prints as speckle on a big sail (`O1-cues-heart`).
- Foreground square sails read as billboards, because the roundel replaces the weave (`fleet-material.ts:420`).

## 3. Status of `claudeville-prettier/REVIEW.md` issues 1–15

| # | Status | Evidence |
|---|---|---|
| 1 Shadow slabs on water | **Fixed** | `sea-golden.ts:9-14`; clean 9 h and dawn (`O1-review-crops`) |
| 2 Milky heliograph | **Fixed** | winter basin clean; `HELIO_GAIN` 0.2 |
| 3 Bright night clouds | **Partly open** | banks still lit cotton, below the fire |
| 4 Terrace slabs | **Fixed** | olive terraces |
| 5 Blotchy beam | **Fixed** | smooth shaft (`hour-bluehour`) |
| 6 Lavender dawn | **Partly open** | peach sky; land L 0.14, cold basin |
| 7 Cues illegible | **Partly fixed** | ~10 px black cone (`storm-cones-mast.ts:27`, `O1-cues-heart`); office works invisible at heart |
| 8 Lamp wave | **Weak in stills** | spread 0.4 (`lamp-wave.ts:36`) |
| 9 Sanctuary vs yard | **Fixed** | separated up-slope |
| 10 Fireflies | **Unverified** | summer only |
| 11 Heavy day water | **Fixed, changed** | `sea-tone.ts:35-39`; basin now the most saturated mass (S 0.63) |
| 12 Front camouflage | **Fixed** | `sea-tone.ts:57-61` |
| 13 THE/ROADS | **Fixed** | `labels.ts:84-97` |
| 14 Hover pop | **Fixed** | `hover-lantern.ts:9-11` |
| 15 Night pearls | **Partly open** | `lights-system.ts:166-170`; `O1-review-crops-2` |

## 4. Colour-script proposal (reference-day key hours; `seasonalKeyHour` maps them to real sunrise and sunset)

| Key | Intent | Sky (zenith → horizon) | Sea body | Hero target (ΔL vs band behind) | Code |
|---|---|---|---|---|---|
| **3.0 (new)** | The quiet watch: deepest, coolest, sparsest | `#03061A` → `#121A2E` | navy, chroma −15 % | fire ≥ +0.40 | new key: `windowOcc` 0.1, `lamp` 40, `exposure` 0.40 |
| 5.5 first light | rose band under clear blue | keep | slate-lilac | lantern lit, tower dark | `seaTint` |
| 6.4 dawn | contre-jour with a gold rim | keep | cool slate, chroma −20 %, warm sun path only | silhouette ≤ −0.2, rim lit | `blueSat` 0.9 → 0.8, `seaTint` |
| **7.5 (new)** | Silver morning: crisp, slightly cool | `#4E7FC0` → `#E2E9EE` | clear cyan-teal, not pool | ≥ +0.05 | new key |
| 12 noon | Hero lock | `#4F86C6` → `#D8E5EC`; haze `#AEC5D3` | teal | ≥ +0.06 | values −8 % (I1) |
| **14.5 (new)** | Warm afternoon: roofs and land carry the colour | `#5482C0` → `#EDE6DA` | teal-green | ≥ +0.06 | new key, `warmSat` 1.1 |
| 16–19.2 golden | Amber key, jade water | keep | lit body warmed (exists), shade cool | peach ≥ +0.08 | I6 starts |
| 19.7 dusk | Warm/cool split, not magenta | horizon coral `#F09A78`; haze `#6E7890` (was `#857288`); hemiSky `#4E66A0` | deep teal-blue, chroma −20 % | lantern ≥ +0.15 | retune haze and hemi |
| 20.7 blue hour | The postcard hour: indigo plus warm lamps | `#0A1336` → `#2E3C68` | indigo, lamp pillars | fire ≥ +0.30 | cooler horizon |
| 22 night | Benchmark | keep | keep | keep | — |

`seaTint` and `seaChroma` would be new optional `TimeKeyframe` fields multiplied into the body before the sky mirror (`ocean-material.ts:275-279`). Each key is accepted when its notan and its strip match `O1-colour-script-current` regenerated with the change.

## 5. Ideas (full fields in the JSON)

- **I1 Hero value lock by day** (S, 0 ms): sky gradient `e/4.5`, horizon lift below 1° only, day horizon and haze about 8 % darker, far-sea haze from 0.72 R, limewash +5 %. The value study (`O1-study-hero-value`, a PIL mock, not a render) moves the sky behind the lantern from 0.74 to 0.61.
- **I2 Coins as print, not pins** (S–M): below ~16 px the paper-white disc fades toward the cloth tone; logo shape and brand ring stay, and hover, select and search keep the full roundel. Re-weave near prints with seams and mottle; give burgees the far −20 % value and half the aerial tint; posterise photographic logos. **DECISION-NEEDED.**
- **I3 Retire the 3D mainland** (S, −1–2 draws, −3,966 tris): `visible=false` at `island-system.ts:57`, or drop the node in `hb_export.py`. The painted ridges (`sky-glsl.ts:348-371`) already carry the backdrop. Add a framing test: aspect 0.75–2.4 × zoom to `maxDistance`, nothing in front of the card.
- **I4 Quiet moorings:** weathered low-value buoys, smaller beyond 300 m, dropped below 2.5 px.
- **I5 Colour script v2:** the table above.
- **I6 Last light on the Pharos** (enchanting): an Earth-shadow line climbs the world in the last ~25 min before sunset (key light × `smoothstep(h−6, h+6, worldY)`, h from −10 to 130 m) and falls at dawn. 2 ALU.
- **I7 Night fog that reads:** same field, threshold and DOM. With `out.fog` at night (`bind.ts:299`), bloom radius and intensity rise, halos ×2, far riding lights fade by the fog's optical depth, and the beam sheath broadens with reach unchanged.
- **I8 Seat the crest flags:** hemisphere light and aerial tint; ETH 1.65 → 1.25; farScale from 650 m; truck-lamp falloff at night; chroma ×0.9.
- **I9 Hairline water lettering:** density 0.86 → 0.55, ink `#24343C`, day halo 0.04, caps −15 %, "THE ROADS" off the densest anchorage.
- **I10 Overview focus on the harbour:** tilt band between the Pharos foot and the basin centroid, opacity cap 0.35, bloom threshold +0.3 at overview distance.
- **I11 Wakes that read as water:** jittered echelon period, floor 0.5, arms fading with distance.
- **I12 Squarer screens frame the height:** below aspect 1.0, fit the island's vertical span (tablet-portrait overview 1547 → ~1200 m).
- **I13 The storm keeps a hearth:** the lit PSI fire's glow, not its reach, follows `max(nightK, 0.6·gloom)` (`beam-system.ts:342`).
- **I14 Art-direction regression gate:** tower-vs-band ΔL per hour, Roads speckle ≤ 35/10k px, horizon intrusion and a colour strip, measured on real-GPU frames.

## 6. What separates it from best-in-class, in this scene

- **Monument Valley and Alto:** 3–4 value planes, with the sky a step below the hero. Here the horizon is the brightest plane (I1).
- **Townscaper:** about a dozen hues at matched value. Here brand hues, buoys, bunting and a royal-blue banner all compete. Brand colour is identity, so print it through one pigment law (I2, I8) rather than remove it.
- **Tiny Glade:** the light tints everything, water included. Here the basin ignores the illuminant (I5).
- **Islanders:** an empty, calm sea. Here buoys, pins and dashed wakes fill it (I2, I4, I11), and the dashes, halo lettering and sticker flags borrow interface marks.

## 7. Top picks

1. **I3:** one line and a test fix a defect every zoom-out sees.
2. **I1:** the biggest day gain at zero cost.
3. **I2:** removes the dominant noise, keeps identity.
4. **I7:** restores the only stale cue at night.
5. **I6:** a daily handover from the sun to the fire.

## 8. Decisions for the operator

1. A tonal far roundel below ~16 px (logo and ring kept, full on hover, select or search)? This nuances v1.4.1.
2. Retire the runtime mainland (only ever seen broken), or keep it with real fog?
3. May the squarer-screen overview crop the lobes to frame the island's height?
4. Three new keys (3.0, 7.5, 14.5) and a per-hour `seaTint`?
5. Dim, shrink and hide decorative buoys below 2.5 px?
6. Let the lit PSI fire glow through DEWS gloom by day (mapping unchanged)?

## 9. Cross-lane hooks

- **Sky and ocean:** I1 must move the card and the sea haze together.
- **Fleet:** I2, I4, I11.
- **Data truth:** I7, I13, and whether `stale=1` should leave the PSI beam at full reach (`O1-stale-night`).
- **Devices:** the I3 and I12 tests.
- **Identity:** I8, I9.
- **QA:** I14 runs on `shot.mjs` or `preview` frames only.
