# O4 — Sky, weather & atmosphere

Lane O4 (`sky-weather`), 2026-11-08, baseline `29e0b2a3` (v1.4.1). Read-only pass.
Inputs: the shared frames in `shots/` (all `hour-*`, `base-*`, `state-*`, `season-*`, `aspect-*`, `view-*-night`)
and 10 new real-GPU captures, named `shots/O4-*.png`. Derived evidence: `O4-crop-*`, `O4-*-sheet.png`,
`O4-notan-truth-grammar.png`, `O4-front-vs-fog-notan.png` and `O4-pair-night-vs-stale.png`.

## 1. Verdict

The sky and weather are honest, calm and cheap: the painted card costs 0.038–0.044 ms on the RTX
(`gpu-passes-summary.txt`). The best frames are genuinely lovely:
- the sunrise disc rising out of the haze with its glitter path (`O4-sunrise-sweep-*`);
- the pink-lavender dusk with the lamps coming on (`O4-sunset-sweep-*`);
- the starry crescent night (`view-heart-night.png`);
- the recovery rainbow sorted behind the Pharos (`O4-rainbow.png`);
- the structured ALERT overcast (`O4-alert-squall.png`).

Three things need attention before anything new ships.

1. **Critical truth bug.** A rising weather front from Calm, which the Ledger defines as "the reading rising",
   turns the harbour water into opaque cream-white blotches. In notan they are *brighter than the stale fog
   itself* (`O4-front-rising.png`, `O4-front-vs-fog-notan.png`).
2. **The 3D mainland breaks through the sky card.** This happens on tablet portrait, when the landing view is
   scrolled out, and on pans north. It shows as a flat-shaded wall with pale triangle facets
   (`O4-mainland-zoomout.png`, `base-tablet-portrait.png`).
3. **Two shipped "real sky" features are effectively invisible.** The Milky Way adds only +8–10/255 even at full
   strength, and about 70 % of meteors spawn above the visible band.

## 2. Current state

- **One camera-attached painted card** draws the whole sky in one shader: gradient, glow, stars, Milky Way,
  meteors, discs, cirrus, mackerel, eight cumulus impostors, storm deck, front lip, lightning, shafts, squall,
  three ridges and haze (`sky/sky-glsl.ts:126-415`). The horizon is pinned 20 % below the frame top
  (`sky-system.ts:75,379`), so **the visible sky is a fixed 5.0° strip at every zoom**: nothing above e = 5° is
  ever seen. A 512×128 half-float band render target feeds the sea's reflection (`sky-system.ts:231-247`).
- **The weather is data-honest.** DEWS level → tables (`weather/director.ts:62-78`), fronts with DOM trend
  lines (`ui/Panel.tsx:374`), recovery rainbow and moonbow. Reduced motion stills everything.
- **Clouds are 2D impostors, not billboards.** Eight baked atlas cells (`sky/clouds.ts`) are drawn inside the
  card with per-bank parallax and lit every frame from the real sun or moon azimuth (`sky-glsl.ts:64-112`):
  wrap light on a blurred normal, rims, a darker base. Their weaknesses:
  - no self-shadow;
  - one lobe recipe with a ruler-straight base, at a fixed ~4:1 aspect (`sky-system.ts:341`);
  - near banks cropped at the frame top, which gives the "cotton-ball cut-outs";
  - horizontal strips in portrait;
  - stippled night rims (`O4-crop-night-clouds.png`).
- **The truth grammar is strong by day and weak at night.**
  - By day, stale fog collapses the notan into one mid-grey: inner-basin saturation 0.15 against 0.61 clear.
  - At night it has no value signature (L 0.209 against 0.177, and bluer than the clear night).
  - In the far field, morning haze (L 0.70, sat 0.06) sits close to stale fog (0.73, 0.02), because the fog
    colour is the hour's haze, desaturated (`readings/fog.ts:105-110`).
- **Storms have drama but no sky structure.** Lightning, decks, rain rings and gloom work. The DANGER sky,
  however, is the flattest region of any frame (luminance SD 0.012 against 0.027–0.032 clear), and the rain at
  a night flash reads as a scratch overlay (`O4-storm-night-strike*.png`).
- **The real-sky layer.** The moon phase is real, but the moon sits at a fixed station every night
  (`sky-system.ts:458,475-479`). The setting sun is never in frame: it sets behind-right at a relative azimuth
  of 117–150°, which `COMP` 0.34 maps to th 40–51°. The dawn sun is in frame at th ≈ −11…−14°.
- **REVIEW issues.**
  - #3 (bright night banks): fixed (`sky-glsl.ts:107-108`).
  - #6 (lavender dawn): fixed (`engine/time-of-day.ts:76-93`).
  - #5 (beam over clouds): partly fixed (`beam/beam-system.ts:154-156`).
  - #12 (front camouflage on the water): open and worse; see F1.

## 3. Findings (ranked)

**F1 — critical. A rising front turns the sea into a fog-like cream veil.**
`ocean/sea-tone.ts:64` normalises the mirror-cloud weight by the global `uCloudShadow.w`. During a front,
`sky-system.ts:642-644` sets that value from the *old* cover (≈0.0098 at Calm), while `hbCloudShadow` uses the
*new* strength behind the line (0.36–0.62, `cloud-shadow.ts:34`). The ratio `cc` reaches about 35–60 (applied weight about 20–35), and
`ocean-material.ts:299-300` applies it unclamped, so it extrapolates. The inner basin goes to L 0.68 (clear
0.33, stale fog 0.55). Every rising front from Calm does this on the high and medium tiers. It is
front-specific: O3's breaks and squall captures show no blowout. O3 confirmed it independently (O3-F13). So the "stress
rising" cue renders as the reserved stale-data grammar.
*Fix:* O4-I1.

**F2 — high. The 3D mainland (`shakkei`, 3,966 tris) intrudes in front of the sky card.**
The card distance R grows with camera height (`sky-system.ts:379-391`), and the mainland is not among the land
points.

| View | R | Mainland coast | Result |
|---|---|---|---|
| Landing (heart, 16:10) | 911 m | 996–1076 m | hidden |
| Heart scrolled out to 1,150 | 1,566 m | 1,446–1,526 m | visible: a wall over 13 % of the frame |
| Tablet-portrait refit (1,089, `framing.ts:59-95`) | 1,486 m | 1,391–1,471 m | visible |

Pans north reveal it too; the pan clamp allows about 490 m. Its haze is only the 0.28 aerial cap: the
"strong fog" in `hb_export.py:328` does not exist at runtime, and `fill_mask.py:16` assumes it is "never part of
the frame". The pale facets are its steep rock faces.
*Fix:* O4-I2.

**F3 — high. The stale fog has no night signature.**
At night the fog colour is lerped 70 % toward the navy horizon (`fog.ts:108`). The notan of `O4-stale-night.png`
equals a clear night's; the DOM chip says "stale" and the world does not.

**F4 — medium. The storm sky is a flat slab.**
Four steps applied after the W02 cells (`sky-glsl.ts:282-294`) crush them: the overcast desaturation
(151-152), the visibility slate (394-398), the storm grey, and the grade (saturation ×0.58, contrast ×0.65;
`sky-system.ts:577-587`).

**F5 — medium. The Milky Way is invisible.**
It is a band parallel to the horizon with gain 0.06 (`sky-glsl.ts:177-189`). At full gate strength
(nightSky.x = 1) it adds about 8–10/255 and reads as haze. Tonight (new moon, Calm) the gate is open and
nothing shows.

**F6 — medium. Calm and Watch skies are nearly identical by day.**
`bankReveal` = clamp(5 + 8·cover − slot) shows 6.2 of 8 banks at Calm and 8 of 8 at Watch
(`season-sky.ts:33-35`). The code comment says "2-3 banks" at calm (`sky-system.ts:548`), and the Ledger
promises that cloud follows the early-warning level (`ui/Ledger.tsx:99`).

**F7 — medium (perf). The sky band re-renders every frame.**
Its dirty key includes `uWeather.y` (`sky-system.ts:420`), the gust-modulated wind, which the shader never
reads; the pass is active on 220 of 220 frames at a pinned hour. Separately, that first timed pass shows
1.1–1.7 ms on 16–20 % of frames (p50 0.010 ms) and drives GPU p95. This is likely an upload or sync captured
by the first timer; it needs checking.

**F8 — medium. The autumn mackerel reads as polka dots** (`O4-crop-day-mackerel.png`,
`sky-glsl.ts:244-260`). It is in season now.

**F9 — low. Meteors spawn at e0 = 3.5–8.5°** (`sky-system.ts:312`), against a band top of 5.0°, so about
70 % start out of view. Staged in band, the streak looks right (`O4-crop-meteor.png`).

**F10 — low. The moon ignores the real moon's hours.** A 0.3 % crescent hangs at 22:00 (`base-night.png`).

**F11 — low. Lightning can appear to strike the Pharos** (`lightning.ts:181`, `O4-crop-strike-tower.png`).

**F12 — low (process). `state-front.png` is not a front.** `front=1` is ignored (`weather-system.ts:200`); use
`?dews=CALM&front=WARNING&frontAt=0.4`.

**F13 — low. The sun path is mirrored against the world's compass.** It rises WNW and sets ENE, so the dawn sun
climbs to the left (`O4-sunrise-sweep-*`).

## 4. Ideas (ranked by impact ÷ cost)

| ID | Idea | Pillar | Effort | Est. iGPU | Impact |
|---|---|---|---|---|---|
| I1 | Fix the rising-front sea: local-strength, clamped, slate mirror clouds | informative | S | ≈0 | 5 |
| I2 | One far-land layer: retire the 3D mainland | all-devices | S | −4k tris, −1–2 draws | 4 |
| I7 | Stale fog with its own colour, legible at night | informative | S | 0 | 4 |
| I3 | Twilight wedge: Earth's shadow + Belt of Venus at dusk, rays at dawn | enchanting | S | ≈0.01 ms | 4 |
| I4 | Night sky that shows: Milky Way as a rising river, meteors in view | enchanting | S | ≈0.01 ms | 3 |
| I6 | Storm sky with structure; lightning never touches the hero | prettier | S | ≈0.005 ms | 3 |
| I9 | Weather you can count: Calm ~3 banks, Watch ~5, Alert full | informative | S | ≤0 | 3 |
| I10 | A sky-band cache that caches (TBDR win) | all-devices | S | −0.1–0.25 ms | 2 |
| I8 | Truth-grammar gate: perceptual fog/haze/storm/front separation | professional | M | 0 runtime | 3 |
| I5 | Lit cumulus v2: height channel, 2.5D self-shadow, varied recipes | prettier | M | +0.03–0.06 ms | 3 |
| I11 | Rain and snow with depth: graded hatching, gust sheets, soft near flakes | prettier | M | ≈ −0.05 ms at DANGER | 3 |
| I12 | The moon keeps the real moon's hours | enchanting | S | 0 | 2 |
| I13 | Skies composed for portrait and ultrawide | all-devices | S | 0 to +2 % band | 2 |

- **I1.** `hbCloudShadow` also exposes its coverage term `s = smoothstep(k, k+soft, n)`, with
  `k = mix(K.x, G.x, bh)`, and the sea uses `cc = s`: no division, no floor, identical at Calm. Clamp `mCloud.a`
  (`ocean-material.ts:299-300`), let storm-side mirror clouds take the deck slate, and add a TS-twin test plus a
  gate frame. One PR with O3-I13: O4 does `cloud-shadow.ts`, O3 does the sea side. Side effect: the sunbreak and
  squall terms stay shadow-only and stop brightening the mirror, which is correct.
- **I2.** Set `o.visible = false` for `shakkei` (`world/island-system.ts:57`) now, and drop it from
  `hb_export.py:324-328` at the next rebuild. Keep the mainland polygon in the sea SDF. The painted ridges are
  then the only far land at every aspect, zoom and pan.
- **I7.** Give the fog a fixed sea-smoke hue (pale, near-neutral, a whisper of the stale dot's amber), lit by the
  hour's luminance but not hued by its haze. At night it becomes a pale moonlit bank (at least +0.08 L over the
  clear night) with lamp halos. The decorative haze keeps a saturation floor.
- **I3.** Sunsets here happen behind the camera, so the visible sky is the anti-solar sky. While the sun is
  between +3° and −9°, paint a blue-grey Earth's-shadow band under a 0.8–1.2° pink belt, strongest toward the
  anti-solar azimuth (in frame on the left in winter), fading through the blue hour. The sea mirrors it for
  free. At dawn, extend the W03 rays (`sky-glsl.ts:325-334`) to clear mornings near the in-frame sun.
- **I4.** A tilted Milky Way that enters at the horizon and leaves the frame top: 35–60°, turning with the
  clock, a dark rift, 2.5–3× gain, denser faint stars inside it. Meteors spawn with `e0 ∈ [1.2, visTop − 0.6]`,
  aimed so that 60 % or more of the streak stays in view.
- **I6.** Move the W02 modulation after the desaturation, and raise it to about ±25 % at ALERT and above.
  Add a low scud band, keep a sliver of the horizon strip until cover 0.99, and multiply the lightning glow by
  the deck cells. Keep strikes out of ±4° around the Pharos, and cut the flash lift on drops (`precip.ts:54`).
- **I9.** Retune `bankReveal` so the visible banks step by band, with a strictly increasing per-band unit test
  and season invariance kept. Announce it in the CHANGELOG, because it re-tunes an existing cue.
- **I10.** Remove `uWeather.y` from the band key, re-render on changes greater than 1/1024 or at most at 1 Hz
  outside rain, fronts and flashes, then fix the first-timer attribution.
- **I8.** A frame-statistics check after the `npm run preview` gate captures. Any of these fails the gate:
  - the stale inner basin is not desaturated against the same hour;
  - a front sea is brighter than stale fog;
  - the night fog adds no lift;
  - the storm sky's luminance SD is below 0.02.

  It would have caught F1 and F3.
- **I5.** Store the bake's lobe height (`field().x`, already computed) in B and derive the rim from alpha mips.
  March four taps toward the light for self-shadowed crowns, with thickness translucency for backlit edges. Use
  power-law lobes, rougher bases, blurrier night rims, and no crop strips. Fix or retire the mackerel.
- **I11.** Depth-faded, shorter far streaks, with forward scatter only where the drops are backlit, and density
  modulated by the shared gust field (`weather/gust.ts`) so rain comes in sheets. Snow gets soft near flakes.
  Intensity stays `budget × precip` (`precip.ts:408`).
- **I12.** Derive moonrise and moonset from the moon's age, gate the disc, glitter and `nightLift` on `moonUp`,
  and show the young crescent with earthshine at dusk.
- **I13.** Size the bank spec to the horizontal FOV, with the cloud fraction per degree kept aspect-invariant.

## 5. Top picks

1. **I1.** Critical truth fix, a few lines, no cost.
2. **I2.** Removes the largest artefact on tablets and on zoom-out, with a net perf gain.
3. **I7.** Makes fog = stale legible at every hour, with one identity.
4. **I3.** Gives the dusk sky its missing real structure, at almost no cost.
5. **I4.** Two shipped features finally become visible on nights like tonight.

## 6. Decisions for the operator

1. Retire the 3D mainland (recommended), or push the card beyond it? The second option closes the landing
   view's open-sea horizon.
2. A sparser Calm sky (I9): accept fewer clouds on calm days, for legibility?
3. Fog hue (I7): amber-leaning (the stale dot) or neutral grey?
4. Sunsets have no visible sun. Pull the setting disc to the right edge for its last 20 minutes, or rely on the
   twilight wedge (I3)?
5. The mirrored sun path (F13): accept as art direction, or relight the whole day?
6. Real moon hours (I12): accept moonless nights?

## 7. Cross-lane hooks

- **O3 water:** owns `sea-tone.ts` and `ocean-material.ts` for I1, plus the far-haze saturation floor (I7).
  Already messaged.
- **O2 post:** the storm grade (I6). The twilight belt must stay sub-bloom.
- **O1 art direction:** the fog hue, twilight palette, cloud recipes and mackerel.
- **Perf/QA:** the I8 gate, and the attribution of the F7 spike.
- **UI:** CHANGELOG and legend copy for I9 and I12.
- **Orchestrator:** replace `state-front.png` with `O4-front-rising.png`.
