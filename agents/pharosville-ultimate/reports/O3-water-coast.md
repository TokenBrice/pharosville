# O3 — Water & coast

Lane O3 (Opus), 2026-11-08, baseline `main` @ `29e0b2a3` (v1.4.1). Read-only. 12 real-GPU captures
(`shots/O3-*.png`) and derived sheets (`O3-basin-hours`, `O3-wake-dashes`, `O3-shoals-glitter`,
`O3-night-pills`). Costs are estimated from `shots/perf-rtx-*.json` pass timings.

## 1. Verdict

The water is the most finished system in the picture: coast foam, run-up, mirror clouds, night reflections
and storm water all hold up in close-ups. What breaks or still reads as shader rather than harbour:

0. **A rising storm front turns the sea into fog-like cream banks** (F13, critical, found with O4). It is a
   normalisation bug in the mirror clouds that breaks "fog = stale only". It is the cheapest fix in this
   report.
1. **Nothing in the world is reflected by day.** The Pharos, the town and the white hulls float on a uniform
   teal (`O3-basin-day.png`).
2. **The inner basin ignores the hour.** At golden hour it is within 3/255 of noon. At sunset and blue hour
   it turns pool-cyan under a lilac sky (`O3-basin-hours.png`).
3. **Graphic marks.** Dotted Kelvin arms, Shoals "saucers", and HDR glint salt that blooms into lamp-like dots
   at the overview.
4. **Hidden cost.** The sea-shadow mask and the wake field add about 70 % on top of the 0.20 ms ocean pass.

## 2. Current state

- **One mature shader.** `ocean-material.ts` (539 lines) runs on a 256² grid with a far ring
  (`ocean-system.ts:48-79`). It has an unlit depth tint over a 2048² SDF, a Fresnel mirror of the painted sky
  (`:281-300`) and about 30 taps per water pixel by day. Prettier items O2–O6 and O11 shipped.
- **Strong: the coast.** Arriving crest lines, swash, lace and eddies (`:417-460`), plus the run-up on stone
  (`world/runup.ts:17-29`), make the quays look crafted at the heart view (`O3-basin-day.png`).
- **Strong: night water.** The Pharos fire's reflection (`:410-414`) lands exactly where the lantern's mirror
  image projects: screen (523, 656), the cream patch in `base-night.png`. Lamps throw pillars, and the pool
  read draws windows into the water (`:306-329`).
- **Strong: storm water.** It is grey-green with wind lanes, caps and splash rings (`O3-storm-close.png`). Sea
  state comes from `uSea` (off-peg share) and wind from DEWS (`:155-161, 467-487`). The rising-front case
  breaks this (F13).
- **Weak: no world reflection by day.** Pre-reboot builds had it (CHANGELOG lines 148 and 196). 03-O1 was
  deferred until O2 + A4 had shipped (`claudeville-prettier/PLAN.md` §8–9). They did, and the basin is still
  one blue.
- **Weak:** the basin is one colour all day (F1); marks read as UI or noise (F2–F4).
- **Cost.** RTX per frame: ocean 0.20 ms, wake ≈ 0.07 ms, sea-shadow mask + mips 0.067 ms
  (`perf-rtx-day.json`). Low tier compiles `HB_LITE` (`ocean-system.ts:195-206`).
- **REVIEW status.**
  - #1 shadow slabs: fixed (`sea-golden.ts:10-13`).
  - #2 heliograph haze: fixed (`sea-helio.ts`).
  - #11 basin too dark: fixed by day, but the lift now applies at every hour (F1).
  - **#12 is not fixed.** Under a real front the mirror clouds blow out (F13). `state-front.png` is plain
    WARNING (`front=1` is not a band), so earlier checks against it proved nothing.

## 3. Findings (ranked)

**F13 — critical. A rising front blows the mirror into cream fog banks.**
Repro: `O4-front-rising.png` (`?t=11&dews=CALM&front=WARNING&frontAt=0.4`). The mirror-cloud weight is:

```
cc = (1 - hbCloudShadow(q)) / uCloudShadow.w        // sea-tone.ts:64
```

During a front, `uCloudShadow.w` holds the *old* cover's strength (≈ 0.01 at CALM, `sky-system.ts:642`),
while `hbCloudShadow` uses the *new* strength (0.36–0.62) behind the line (`cloud-shadow.ts:34`). So
`cc` ≈ 35–60. `ocean-material.ts:299-300` apply it unclamped, so `mix()` extrapolates.

Effect on luminance:

| region | normal day | rising front |
|---|---|---|
| west basin, p90 | 0.54 | 0.79 |
| outer sea, median | 0.67 | 0.83 |

Fresh, rising stress data thus produces the stale-fog look. At WATCH with sunbreaks or a squall there is no
blowout (`O3-watch-breaks.png`, `O3-watch-squall.png`), so the bug is front-specific. It happens whenever DEWS
rises, on High and Medium tiers.

**F1 — high. The basin ignores the hour.** Median basin RGB (`O3-basin-hours.png`): 40,88,115 at noon,
37,85,113 at golden hour (sky 203,171,159), 24,62,103 at sunset, 18,48,79 at blue hour (saturation 0.63).
- The body is unlit; it takes the ambient hue only at night (`ocean-material.ts:277-279`).
- The basin lift holds until `uNight` (`sea-tone.ts:35-39`).
- Golden warmth is gated by `sunSh` (`sea-golden.ts:18`). At 16.4 h the east basin lies in the west lobe's
  shadow (`O3-golden-sunsh.png`), so it keeps noon turquoise.

The result is a lit swimming pool under a dusk sky (`O3-bluehour-close.png`).

**F2 — medium. Kelvin arms read as a dotted route line.** The echelon is a pure sine (`wake.ts:101-102`).
Every boat trails two straight lines of identical, evenly spaced white dashes (`O3-wake-dashes.png`). That is
the selected ship's route-line grammar (brass dashes, `route-line.ts:6,20`).

**F3 — medium. Glint salt and HDR fireflies.**
- The facet `pow(N·H,1400)·0.7·uSunColor` (`:362-365`) reaches about 2.7 linear luminance at noon, above the
  2.0 bloom threshold (`time-of-day.ts:105`).
- It fades only with camera distance, never with pixel footprint. Stills show 1–2 px white salt; motion
  shimmers.
- At the overview the specks bloom and are tilt-blurred into warm "lamps" at noon. The glint-only debug frame
  `O3-overview-glint.png` confirms they are glints.

**F4 — medium. The Shoals read as a milky disc, not a reef.**
- The surf is a noise-masked swell sine everywhere inside `zm.r` (`:491-496`). It gives soft cotton patches,
  close to the stale-fog grammar.
- Aground stamps saturate (`fleet-system.ts:1159-1161`, strength 1.4–2.0; `wake.ts:88-89`). Each hull sits
  on a crisp white saucer (`O3-shoals-day.png`).

**F5 — medium. The overview's bright, blurred bottom band.**
- At the overview the tilt-shift's sharp band is pinned to the Pharos (`post.ts:333-345`), so the nearest
  harbours sit in the blur.
- Their shallows, swash, hull lips and contact rings have a fixed world width. They become 2–4 px white
  outlines (`wake.ts:117`, `:466`), and with the F3 specks they smear into halos (`O3-overview-debug5.png`).
- The band itself is fixed by O2-F13/I13; O3-I11 removes the water's share.

**F6 — medium. Night reflections turn pink and break into "pills".**
- Warm pool light is added onto navy (`:328`), so dim reflections read salmon.
- The six strided taps (`:315-321`) step down the water as separate blobs (`O3-night-pills.png`).
- Riding lights have no pool (`lights-service.ts:51`).

**F7 — medium (perf). Hidden full-field passes.** Together about 0.14 ms on the RTX, mostly bandwidth on an
iGPU:
- On High the sea-shadow mask resolves at 2048² with 4 PCF taps every frame (`sun-shadow.ts:103`,
  `sun.ts:101-104`). The sea reads it only at mip ≥ ~3.5 (`sun-shadow.ts:63-64`).
- The wake field is 32 MB (2 × 2048² R16F + 2048² RGBA8). It is cleared or decayed full-field every one or
  two frames (`wake.ts:161-168, 224-262`).

**F8 — low (perf).** Taps run where their result is zero: caustics (`:244-250`), Posidonia, lace
(`:432-433`), scum (`:454`). The same five Gerstner phases are evaluated three times (`:175-176, 345`).

**F9 — low (cross-lane, sky).** The sky band re-bakes in 20 % of frames: p95 1.46 ms, max 1.85 ms on the RTX
(`perf-rtx-day.json`). Owned by O4-F7/I10; the first timed pass may absorb upload work, so attribute it first.

**F10 — low.** The reef turquoise is applied after the storm grading (`:214-219` vs `:260-264`), so it glows
cyan under a slate WARNING or DANGER deck (`state-front.png`, `state-storm-danger.png`).

**F11 — low.** Shader rain rings (about 0.16 m wide) are sub-pixel at 0.3–0.65 m per pixel
(`:95-112, 191-197`). The splash sprites already carry rain on the water.

**F12 — low (cross-lane, civic).** The Burn plume (`civic/burn.ts:17-35`) lies over the water as a soft
milky patch at the heart view.

## 4. Ideas

**I13 Mirror clouds that cannot blow out.**
- O4 has `hbCloudShadow` also return its coverage term `s = smoothstep(k, k + soft, n)`, with
  `k = mix(K.x, G.x, bh)`.
- Use `cc = s` directly. It is identical to today at CALM and correct behind the line, with no division and no
  floor. A 0.02 floor would halve the CALM mirror clouds (base strength ≈ 0.0098). Also clamp `mCloud.a` at
  `:299-300`.
- Under a storm deck, tint the mirrored cloud slate instead of `max(sky·1.25, l·1.55)`.
- Add a TS-twin unit test asserting the weight stays ≤ 1 for any `coverFrom`/`coverTo`.
- S, about 0 cost.

**I1 Harbour mirror: a screen-space reflection on water pixels (High and Medium).** The camera pitch is fixed
(D1), so an object always stands *above* its reflection on screen. That is the textbook case for screen-space
reflection (SSR).
- The ocean marks water pixels in alpha (`:538`).
- A new `ocean/mirror-pass.ts` runs at composer index 1, after the RenderPass and before fog. It marches up the
  screen at half resolution (14 + 4 steps, edge fades) using frame N's colour and depth.
- **Temporal composite:** in frame N+1 the ocean shader samples that RT reprojected through the previous
  view-projection, then mixes by w = calm-harbour Fresnel (art-directed to 0.25–0.35) × (1 − foam) × ripple
  `dk` × (1 − rain), with a sea-clock wobble for vertical strokes.
- Fog, beam, tilt-shift and bloom then layer on top naturally. There is no full-screen composite and no
  dependency on the beam pass, which O2-F1's fix turns off by day. Lit windows reflect at night.
- Low tier off (`HB_LITE` precedent). Size the RT from CSS pixels, not the drawing buffer, so DPR and O2-I3's
  supersampling do not multiply the march. About 0.03 ms RTX, 0.25–0.4 ms M-class iGPU, 1.6–3.3 MB. Effort L.

**I2 A basin that follows the hour.**
- Tint the body by the hour's irradiance hue and level, normalised to noon so noon does not change:
  `E = uAmbient + uSunColor·max(sunDir.y,0)·sunSh·0.3`, applied at about 45 % hue and 60 % level, by day.
- Gate `hbBasinLift` on sun elevation instead of `uNight`.
- Add a low-sun harbour Fresnel floor of about 0.12.
- About 8 ALU, no taps. Effort S.

**I3 Feathered Kelvin wakes.**
- Add a per-stamp seed (`sB.w` is unused) and jitter the echelon period ±20 % with phase noise.
- Fall off faster (`wl·0.35`) and keep only two or three white crests (raise the `fKel` threshold); the rest
  is lighter water.
- Free. Effort S.

**I4 Glint anti-aliasing.**
- Measure the footprint as `fp = length(fwidth(xz))` and widen the lobe to n/(1 + k·n·fp²), scaling the peak
  to match.
- Cap glints below the bloom threshold, and fade facets by footprint instead of `far01`.
- About 5 ALU. Effort S.

**I5 A reef that reads as a reef.**
- A 256² signed distance to the Shoals polygon (`zone-mask.ts`).
- Surf breaks only on the swell-facing rim, on one swell clock (I7). The lagoon is calm and clear, with coral
  heads.
- Aground rings break toward the swell and become lace in the lee. Aground stays legible.
- One tap, in the Shoals' bounding box only. Effort M.

**I6 Amber night reflections and riding-light streaks.**
- Composite as `col·(1−m) + acc` with m ≤ 0.7.
- Use narrower, denser near taps.
- Give riding lights `pool 1.6 / poolK 0.06`, so anchored ships lay small coloured streaks.
- No new taps. Effort S.

**I7 One swell clock.** Drive the coast trains (`:425`), swash (`:438`), reef surf (`:492`) and run-up
(`runup.ts:23`) from the main Gerstner phase the hulls ride. Each arriving crest then becomes a run-up in
step; today three clocks beat about 3 minutes apart. Free. Effort S.

**I8 Water perf diet.** Each item is invisible on its own:
- Sea mask at 512² with an 8-tap box (skip on Low).
- One Gerstner evaluation.
- Coherent culls of caustics, Posidonia, lace and scum.
- A far-water path.
- A view-fitted 1024² live wake layer, with a 1024² history on Medium and Low.
- Drop the rain rings.

Estimated saving: −0.08 ms RTX, about −1 ms on an M-class iGPU, −1.5 to −2.5 ms on the Raphael. Effort M.

**I9 Satin wake scars.** A 1024² R8 field with a ~40 s half-life smooths the ripple behind hulls on calm days.
1 MB plus one tap. Effort M.

**I10 Storm-honest reef.** Storm-grade the reef turquoise, keeping it one step lighter. About 3 ALU. Effort S.

**I11 Overview water hygiene.** Footprint-fade the rings, lips and quay lift; with O2, re-centre the sharp
band. Effort S.

**I12 Water budget and review frames.** A `water` total in `?prof=gpu` and fixed `shot.mjs` water frames,
including a rising front. Effort S.

## 5. Top picks (impact ÷ cost)

1. **I13:** S, 0 ms; removes a critical data-truth break (fog look from fresh data).
2. **I2:** S, ~0 ms; fixes the pool look at five of seven sampled hours.
3. **I1:** the biggest "this is water" gain; the camera suits SSR; < 0.4 ms on an iGPU.
4. **I8:** an invisible ~1 ms iGPU saving that pays for I1 twice over.
5. **I4:** S; kills the salt and the noon "lamps". I3 (dotted wakes) is next.

## 6. Estimated cost on an integrated GPU

Assumed: an M-class iGPU ≈ RTX ×12–15 at a similar pixel count; the Raphael ×25–30 (`INTEGRATION-NOTES.md`).

| Item | RTX now | M-class est. | Note |
|---|---|---|---|
| Ocean pass | 0.20 ms | 2.5–3 ms @ medium 1.25 | normals ≈ 40 %, foam 15 %, body 12 %, glints 10 % |
| Wake trail + decay + live | ~0.07 | 0.6–1.0 | bandwidth, 32 MB field |
| Sea-shadow mask + mips | 0.067 | 0.7–1.0 (High) | read only at mip ≥ 3.5 |
| Night pool read | +0.01 | +0.15 | 6 taps, night only |
| I1 mirror | +0.03 | +0.25–0.4 | half-res march + 2 ocean taps; no full-screen composite |
| I8 diet | −0.08 | −0.8–1.2 | — |

## 7. Decisions for the operator

- **Mirror tier policy.** I1 on High and Medium, off on Low (as `HB_LITE` already drops the mirror clouds).
  Is that acceptable under "same art every tier"?
- **Mirror strength.** Physics gives 6–8 % at the hero pitch; the painterly target is 25–35 % in the calm
  harbour. Approve on A/B frames?
- **Quay band.** With I1's dark wall reflections, should REVIEW #11's quay-side lift move to natural shores?
- **Aground surf (I5) and quieter wakes (I3):** approve the softer graphics?

## 8. Cross-lane hooks

- **O4 sky:** agreed for F13/I13, one PR. O4 exposes the coverage term `s` from `cloud-shadow.ts`; O3 does the
  weight, clamp, slate tint and test; `sky-system.ts` is unchanged. Sky-band spikes (F9).
- **O2 light/post:** the tilt band is O2-F13/I13 (F5); O2-I8's overview bloom scaling stacks with I4. I1 no
  longer uses the beam `EffectPass` (O2-F1 turns it off by day); its pass sits at index 1, ahead of fog.
- **Fleet:** a stamp seed (I3, I5); a riding-light pool (I6). **Lights:** the pool RT is 2048² RGBA16F
  (32 MB, `lights-system.ts:13,113`); 1024² suffices.
- **Civic:** the Burn plume (F12). **Perf/QA:** I12, and an Apple-Silicon pass for I1/I8.
