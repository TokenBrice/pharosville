# O10 — Visual direction: the look target, proven live

Lane O10 (Opus, round 2) · baseline v1.4.1 `29e0b2a3` · 2026-11-08 · inputs: O1–O9 reports and shots.

14 of 18 real-GPU captures, all through `shot.mjs`. Before and after sit in one burst, so only the move differs; `?motion=reduce` holds the fleet and beam still. Spikes are in memory only (wrapped `onBeforeCompile`, `fragmentShader` swaps, per-frame uniform hooks, injected CSS); no repo file was edited. Replay with `mockups/O10-spike-harness.js`. Evidence: 22 pairs `shots/O10-*-before/after.png` and **`shots/O10-contact.jpg`**. L figures are display L\* / 100.

## 1. The look target

**Postcard-grade PharosVille is a lit miniature with one hero, one air and one hour.** Seven rules, each measurable on a real-GPU frame:

1. **One hero.** The Pharos holds the top value plane at every hour.
   - By day: at most ~25 % of the sky and sea band behind it is as bright as its lit face. Today it is **85 %**.
   - By night: the fire and lantern own the brightest pixels. Today the corner mark owns **90 %** of the brightest 0.7 % of pixels, and the fire **1 %**.
2. **One air.** One far land (the card's painted ridges) and one haze. Every hull, sail, burgee and crest beyond the harbour sits in it.
3. **Print, not pins.** A mark's contrast follows its size on screen. A big coin, or one the visitor has asked for, prints crisp. A small far one is a soft patch of her colours in the cloth.
4. **The hour colours the water.** The basin takes the hour's light and shadow. It is never a lit pool under a lilac sky.
5. **Water speaks water.** No dashes, saucers, salt specks or bloomed glints. Lettering is a hairline print.
6. **Truth owns its grammar.** Pale and milky means stale data, and only that, at every hour. Storms darken the sea, and a front arrives as a slate line. Decoration never borrows these signs.
7. **Rituals, not effects.** Two daily beats: on arrival the fire kindles and the harbour answers; at dusk the lamps catch in the blue hour. Nothing pops.

## 2. The ten moves, ranked by visible impact ÷ cost

| # | Move | Problem (frame) | Lanes | Code anchor | Cost | Risk (calm / truth) | Spike |
|---|---|---|---|---|---|---|---|
| 1 | **Hero value lock, day and night** | Day: the band out-values the tower (`base-day`). Night: chrome, the ETH crest and the grey discs compete with the fire (`base-night`) | O1-I1/I8, O2-I5, O6-I1, O8-I1, O2-I12, O1-I14 | `sky-glsl.ts:131-133`, `time-of-day.ts:94-112`, `ocean-material.ts:521`, `crest-flags.ts:33-42`, `identity-system.ts:32,167-174`, `harbour-ui.css:8-25,50` | S world; M UI | Calm improves. A deeper noon sea (art call). The UI palette reinterprets D12 | **yes** |
| 2 | **The water's truth grammar** | A rising front turns the basin cream, brighter than stale fog (`O4-front-rising`). At night, stale fog wears the hour's navy | O4-I1/I7/I8, O3-I13, O1-I7 | `sea-tone.ts:64`, `ocean-material.ts:293-300`, `fog.ts:105-110` | S | Truth improves. Night fog must stay below the lamps | **yes** |
| 3 | **Coins as print, not pins** | Paper discs and loose burgees turn the Roads into confetti (`O1-noise-crops` A/B) | O5-I1/I2/I3/I5/I6, O5-F1, O1-I2/I4/I9 | `fleet-material.ts:359-368,396,413-421`, `house-flags.ts:89-111`, `fleet-system.ts:859-868,1189-1194`, `lettering.ts:102,196` | S–M | Amends v1.4.1's "crisp at every range" (DECISION). White-ink logos need a minimum contrast | **yes** |
| 4 | **One far land; framing that holds at every zoom and aspect** | A faceted mainland wall (`O1-zoomout-1100`, `base-tablet-portrait`). A blurred harbour at the overview (`O1-noise-crops` D) | O1-I3/I10/I12, O4-I2, O2-I13, O3-I11, S07 | `island-system.ts:57`, `sky-system.ts:379-392`, `post.ts:333-345`, `framing.ts:59-92` | S | None. Saves 3,966 tris and 1–2 draws | **yes** |
| 5 | **The hour colours the water** | The basin stays turquoise from noon to dusk (`O3-basin-hours`) | O3-I2, O1-I5/I6, O4-I3 | `ocean-material.ts:275-279,296`, `sea-tone.ts:37`, `time-of-day.ts` keys | S tint; M keys | Noon unchanged by construction. Trades off REVIEW #11's lift | **yes (v2)** |
| 6 | **Seamless arrival and the dusk ritual** | A golden inset over a night world (`O7-arrival-night-01`). Lamps fade in during golden light (`O7-lampwave-sheet`) | O7-I1/I2/I3, O6-I10, O9-I9 | `poster.ts:30-33`, `arrival-shell.css:27-33`, `lamp-wave.ts:36-43` | S feather and kindle; M night art | Reduced motion. The PSI beam ends on live data | **half** |
| 7 | **Water that reads as water** | Dashed wakes, reef saucers, glint "lamps" (`O3-wake-dashes`, `O3-shoals-day`, `O3-overview-glint`) | O3-I3/I4/I5/I6, O1-I11 | `wake.ts:101`, `ocean-material.ts:363,491-496`, `lights-service.ts:51` | S each; reef M | Aground rings must stay legible | glint only |
| 8 | **Temporal calm: nothing pops** | Ship shadows flip 8.2 % of the frame (`O7-shadowpop-compare`). Rigging crawls (`O7-crawl-rigging`) | O7-I9, O2-I1/I4 | `fleet-system.ts:79-81,901`, `hull-kit.ts:85`, `mooring-lines.ts:28-36` | M | None | look check |
| 9 | **The crafted monument and its ground** | Office-tower Pharos (`O6-pharos-visitor`), parasol pines, triangle-mosaic grass, concrete walls | O6-I2/I3/I4/I5/I6/I7, O2-I6/I7 | `pharos_geo.py`, `hb_export.py:330-396`, `materials.ts:405,496,509-510`, `nl_kit.py:964-982` | L | Hero silhouette. +45–75k tris and +250–400 KB gz | no (assets) |
| 10 | **The harbour mirror** | Nothing reflects by day (`O3-basin-day`) | O3-I1 | new `ocean/mirror-pass.ts`, `ocean-material.ts:538`, `beam-system.ts:286,393` | L | +0.2–0.4 ms on iGPU; a visible tier difference | no (new pass) |

## 3. The spikes and what they measured

**M1, day.** Pairs: `O10-hero-day-*` (O1-I1 as specified) and `O10-hero-day-strong-*`; notan in `O10-notan-day.png`.
- As specified (band `e/4.5`, horizon and haze about 8 % darker, far-sea haze from 0.72 R): the share of the band at or above the lit face drops **85 % → 63 %**. The sky beside the lantern goes 0.786 → 0.749, the lit face stays at 0.743, and the open sea goes 0.72 → 0.64.
  - The tower joins the top value class but still shares it with the sky. **The specification is half the needed strength.**
- About twice the strength (`e/3.5`, horizon and haze ×0.72 linear, far haze from 0.75 R) plus **+6 % Pharos limewash**: the share drops to **23 %**. The lit face is 0.758 against 0.718 for the sky beside it.
  - Noon still reads bright and Mediterranean (`O10-look-day-after.png`).
- Flags at the town's scale (ETH 1.65 → 1.2, topmast 6 m, overview growth +25 %): the banner no longer covers the Registry front.

**M1, night.** Pairs: `O10-flags-night-*`, `O10-ui-night-*`, `O10-look-night-*`.
- Crest flags lit as cloth (glow 0.16 → 0.035, light × (1 − 0.82 n)): the flag's 90th percentile drops **0.59 → 0.45**. The fire is at 0.73 and the shaft at 0.32.
  - O2's target (flag at or below 0.7 × the shaft) needs about twice this dimming.
- Night bridge UI, using only the existing tokens plus the sheen literal at `harbour-ui.css:50`: the corner mark's share of the brightest 0.7 % of pixels drops **90 % → 3 %**, and the lantern and fire rise **1 % → 28 %**.
  - This is the single largest night gain, and it costs no GPU time.

**M2.** Pairs: `O10-front-sea-*`, `O10-stale-night-*`.
- Mirror clouds normalised by the *local* deck strength, `mix(uCloudShadow.w, uCloudShadowG.y, behind)`, clamped to [0, 1], with slate behind the line:
  - the inner basin under a rising front goes from **L 0.62, S 0.36** (stale fog is 0.56 and 0.20) to **0.35 and 0.60**, which is the clear sea (0.37, 0.58) in passing shadow.
  - **The critical bug is a two-line fix, and the spike proves the mechanism.**
- Stale fog at night: when fully stale it already lifts the basin +0.08 L, but it stays blue (S 0.52), so it reads as more night, not as fog.
  - A neutral sea-smoke hue at the same luminance gives S 0.35 (`O10-stale-night-hue-only.png`).
  - Adding a night lift (×1.9, bloom ×1.5 while stale) gives +0.16 L and S 0.24, the same grammar as by day (pale and desaturated). Recommend about ×1.4. The amount, which is the data, was untouched.

**M3.** Pairs: `O10-coins-day-*`, `O10-coins-night-*`, `O10-quiet-marks-*`.
- The size law, injected at `fleet-material.ts:420` and `:367`:
  - `k = max(smoothstep(12, 30, 0.98/era), highlight)`;
  - the paper ground becomes cloth +15 %;
  - the ink keeps its hue at half contrast.
- Paper discs become dyed patches, and titans and near hulls stay crisp. At night Roads speckle falls **−10 %** and the basin **−12 %**.
- By day the speckle count does *not* fall (109 → 110 per 10k px). The darker sea from M1 had already raised the contrast of every cream sail (87 → 109).
  - **M1 and M3 must ship together, and M3 needs a far-sail value law:** canvas −10–15 % below about 20 px.
- Moorings ×0.55 beyond 300 m (dropped beyond 900 m) and hairline lettering (density 0.86 → 0.55, halo 0.12 → 0.04): speckle 110 → 98.
- Burgees get the aerial tint at 0.6 × the cap and chroma ×0.7 when far.

**M4.** Pairs: `O10-mainland-*`, `O10-overview-band-*`.
- Hiding `shakkei` reveals the card's painted ridges: a calm, correct horizon on tablet portrait. **This is the clearest win per line of code in the set.**
- Overview sharp band set midway between the Pharos foot and the overview target, with focusArea 0.75, feather 0.3, the soft-zone cap 0.35 and the bloom threshold +0.3. Mean |Laplacian|:
  - moles **12.1 → 20.2**;
  - south harbours 9.7 → 12.8;
  - Pharos unchanged at 17.3.
- Re-centring without widening the band (focusArea kept at 0.58) cost the Pharos 22 %. The `[0.06, 0.5]` clamp at `post.ts:344` makes the harbour unreachable today.

**M5.** Pairs: `O10-basin-dusk-*`, `O10-basin-golden-*`, `O10-basin-dusk-v1-*`.
- v1 is O3-I2 alone (irradiance tint against noon, the lift gated on the sun, a 0.12 Fresnel floor). It takes the cyan out at dusk (G 59 → 47) but *raises* saturation (0.81 → 0.85).
- v2 adds a twilight chroma cut of 25 % and a 0.2 floor:
  - dusk: hue 209 → 222, S 0.81 → **0.67**;
  - golden: hue 203 → 217, S 0.61 → **0.50**.
- The water now belongs to the peach and lilac skies (`O10-look-golden-after.png`). It cools rather than turning O1's "jade": physically lit water and art-directed keys are different moves (§5).

**M6.** Pair: `O10-poster-*`.
- The live poster held at its mid-fade state (scale 0.893, opacity 0.6) reproduces O7-F1 exactly.
- A feathered mask removes the picture-in-picture edge.
- A CSS dip toward night (brightness, saturation and a multiplied navy) **reads as a dirty veil**: CSS cannot relight golden art. Ship the feather. The hour match needs night key art.

**M8, look check.** Pair: `O10-fleet-shadow-*`. Turning fleet shadows on at the 650 m landing seats the hulls only slightly (basin L −0.003). The defect is the pop at 640 m, not the absence of shadows: fix it with O7-I9's fade band.

**M7, glint part.** O3-I4's footprint glint, which widens the lobe and fades by pixel footprint, is folded into the overview look frame (`O10-look-overview-after.png`). The noon "lamps" go.

## 4. What the runtime could not approximate, and the real cost of each

| Move | Why not | Real cost |
|---|---|---|
| M9 Pharos v2, pines, walls, AO bake | D4 Blender assets | L: one rebuild plus Pharos and civic exports |
| M10 harbour mirror | New composer pass | L |
| M6 kindle, lamplighter | Temporal | S: ~1 day + ½ day |
| M6 hour-matched poster | New art | M: Blender night render, +60–120 KB, hour pick in `index.html` |
| M5 keys, twilight wedge, last light | Feasible, not attempted | M + S each |
| M7 wakes, reef, amber reflections | Not attempted | S, M, S |
| M8 rigging hairlines, fade band | Vertex and shadow paths | M |

Real cost of the moves that were spiked:
- **M1:** S for the world, about 1 day with retuning at five key hours plus winter. The UI is M (2–3 days), bounded by O8-I2's tokenisation of about 50 literals.
- **M2:** S each (½ day for the front, ½–1 day for the fog), plus O4-I8's M gate.
- **M3:** S–M, 1.5–2 days. That covers the shader law, burgees, the column-0 fix, the buoys, lettering, a legend line and golden re-baselines.
- **M4:** S, ½ day each, plus O1-I12 (1 day).
- **M5:** S for the tint, M for the keys.

Every one of these adds 0 draws and about 10 ALU at most.

## 5. Couplings the spikes exposed

- **M1 needs M3.** The value lock darkens the far sea, which makes every pin and cream sail pop harder. Ship them in the same wave.
- **M5 has two authorities.** O3-I2 lights the water physically, so shadowed water at golden goes cool. O1-I5 art-directs it through per-key `seaTint` and `seaChroma`, so golden water is jade. Recommendation: **the keys own the colour; the irradiance term only modulates sun and shade.** Use v2 as the default where no key speaks.
- **M2 needs its gate.** Without O4-I8 (front basin below stale; night fog lift ≥ 0.08 L; fog saturation ≤ 0.3), F1 and F3 will regress. The metrics above are ready to become those assertions.
- **M4's overview fix must lower the clamp and widen the band together.** Either alone fails.
- **Gates.** O1-I14 and O2-I12 can reuse three metrics from this report:
  - the share of the band at or above the lit face;
  - who owns the brightest 0.7 % of pixels;
  - basin L and S per state.

## 6. Decisions for the operator

1. **Day value lock at about twice O1-I1 plus +6 % limewash.** This gives a deeper noon sea and a bluer band. Accept it, or the as-specified half step?
2. **Night bridge UI palette (O8-I1), DECISION-NEEDED.** It reinterprets D12's chart paper at night. It is the largest night gain measured.
3. **Coins print law (O5-I2), DECISION-NEEDED.** Prints soften below about 30 px; hover, search and select restore them. Add a far-sail value law?
4. **Retire the runtime mainland.** Recommended: yes.
5. **Stale fog at night as neutral sea-smoke**, about 0.1 L brighter than a clear night by design.
6. **Water colour authority:** art-directed keys (jade at golden) or physically lit (cool)?
7. **Arrival:** feather now; an hour-matched night and dusk poster (more bytes) or the golden one kept? The CSS dip is rejected.
8. **Overview:** the sharp band moves onto the harbour; the miniature softness stays only at the frame edges.
9. **Fleet shadows at landing:** stay off, with a fade band (recommended).

## 7. Cross-lane hooks

- **R2-E:** every GLSL string in `mockups/O10-spike-harness.js` compiled and rendered on the real GPU; use them as sketches.
- **O1:** final value numbers, per-key `seaTint`/`seaChroma`, gate metrics.
- **O5:** far-sail law, white-ink contrast, and the column-0 fix first (spiked without it, so slots 0, 32 … stay noisy).
- **O8:** tokenise literals first (the spike needed `!important`).
- **O3/O4:** O4-I1 as spiked; the O4-I8 gate. **O2:** overview band, clamp, threshold; shadow fade band.
- **O7:** feather now; night art via `hb_render.py` (D4). **QA:** gates on real-GPU frames only.
