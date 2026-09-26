# Stylised rendering language (shin-hanga / ukiyo-e / ink-wash) — printmaker

## Verdict
PharosVille renders as a lit 3D diorama with a thin Japanese grade on top. It is not a print. A print is built from **plates**: a key block that draws the silhouettes, a warm light plate, a cool shade plate, and bokashi only where two planes meet. Today every plate carries the same ink. In `golden.png` the far fog (RGB 232,171,99) *is* the sky (237,170,96), and the tower body (103,62,20) is the same amber, darker, so the frame reads as sepia. In `night.png` and `deep-night.png`, sky, grove and station all sit inside L\* 1–3.5, so the silhouettes vanish. The prior rejection was right about uniform filters. The leap is a **selective plate system**: a complementary shade ink in lit materials, a keyline cut only where geometry meets sky, and water engraved only where there is risk. Sails, logos, practicals and the DOM are left alone. Per frame, golden gains the most. Weighted by how long each hour is on screen, night gains the most (≈9 of 24 wall-clock hours).

## What I looked at
- **Baseline frames:** `noon`, `morning`, `dawn`, `golden`, `blue`, `night`, `deep-night`, `wholemap-dusk`, `selected-ship`, `selected-lighthouse` (`outputs/opus-review/*.png`). I read the metrics only from the serial `.txt` files.
- **My captures and derived evidence** (`outputs/opus-review/printmaker/`):
  - `golden-close.png` (`#t=17.6&cam=0,0,1.7`, tier full). It landed on open water and shows the upper 70 % of the frame as one flat amber wall.
  - `stress-noon.png`: first attempt tier `recovery`, the retry timed out on the shared GPU. No usable stress frame.
  - 2×/3× crops of the baseline (no GPU): `crop-noon-water.png`, `crop-golden-tower.png`, `crop-golden-fleet.png`, `crop-night-water.png`, `crop-night-bands.png`, `crop-night-beam.png`.
  - Offline **mocks** built on baseline PNGs. These are image maths, not renders, and are labelled as such:
    - `mock-golden-aizuri.png`: luma-keyed indigo shade plate over `golden.png`.
    - `mock-night-beroai.png`: lifted Prussian sky and a sky-contact keyline over `night.png`. The sky mask comes from `noon.png`, so the tower's right edge and the far fleet carry mask artefacts.
- **L\* measurements** (mean CIE L\* of sRGB patches, 1600×1000 coordinates):

  | Frame | Patch | L\* | RGB |
  | --- | --- | --- | --- |
  | golden | sky beside tower | 74.6 | 237,170,96 |
  | golden | far fog | 74.2 | 232,171,99 |
  | golden | tower body | 30.2 | 103,62,20 |
  | night | upper sky | 2.0 | 0,7,27 |
  | night | sky near horizon | 3.4 | 1,10,40 |
  | night | left grove | 1.1 | 0,4,15 |
  | night | left station | 3.5 | 2,13,26 |
  | night | open water | 3.9 | 5,10,37 |
  | night | pale band lower-left | 15.5 | 20,41,52 |
  | night | pale band right | 20.4 | 29,51,74 |
  | noon | sky | 86.1 | — |
  | noon | far haze | 92.3 | — |
  | noon | near water | 27.8 | — |

- **Code read:**
  - `src/three/garden-post.ts`: grade presets :122-142, grade shader :255-289, LUT/dither/grain :410-488 (grain :342, :475-483), tilt-shift depth usage :640-771, fused pass order :1594-1633.
  - `src/systems/palette.ts`: :42-91, zone themes :182-192.
  - `src/three/garden-sky.ts`: beats :46-52, bokashi :106-192, dome shader :293-393, fog :84-104 and :546-561.
  - `src/three/garden-water.ts`: normal stack :719-770, risk signatures :772-798 and :1062, colour ramp :866-885, fresnel :962-980, hero reflection :1150-1163, moon road :1171-1200.
  - `src/three/garden-day-cycle.ts`: light rigs :113-161, rig blend :302-335.
  - `src/three/garden-fleet-batch.ts`: sail patch :887-1053, strake :777.
  - `src/three/garden-lighthouse.ts`: rim chain :236-312.
  - `src/three/garden-height-fog.ts`: injector :276-281.
  - `scripts/pharosville/generate-garden-luts.mjs` header.
  - History: plan §6 `agents/pharosville-reborn/01-implementation-plan.md:336` and the decision ledger.

## Spell-breakers (defects)
1. **Golden hour is one amber ink** (`golden.png` whole frame; `golden-close.png`; `wholemap-dusk.png` land mass).
   - **What:** far fog equals the sky to within 5 RGB, so the far harbour, hills and quays fuse into the sky. The tower's shade faces are orange-brown, and nothing in the frame is cool except the water.
   - **Causes:**
     - Golden `hemiGround` is `timber_mid` #7b4713, an orange bounce (`garden-day-cycle.ts:139`).
     - The key is 3.84 `lantern_warm` (:137).
     - The fog colour is the horizon colour (`garden-sky.ts:550,561`).
     - The grade cannot fix it: `GOLDEN_GRADE.shadowTint` [0.98,0.97,1.035] × split 0.65 (`garden-post.ts:136-139`) is a ~2 % nudge.
   - **Why it breaks the calm:** Hasui and Yoshida get sunset calm from *complementary* shade, with gold air and violet forms. A single-hue frame reads as a sepia filter, the exact "grade repairing composition" the bible forbids.
   - **Fix:** ideas 1 and 4. **Cost:** S–M.
2. **Night has no silhouettes** (`night.png`, `deep-night.png`, left third).
   - **What:** sky L\* 2.0–3.4 against grove 1.1 and station 3.5. The bible's own night value plan asks for sky 9–14 over a grove at 5 (`VISUAL_INVARIANTS.md:26-28`). The pagoda, grove and far fleet dissolve into a single black-navy plane.
   - **Why it breaks the calm:** in every shin-hanga night (Hasui's *Moon over Magome*, *Shinagawa*), land is darker than a luminous Prussian sky. That is how a night print stays readable.
   - **Fix:** idea 5 (numbers owned by LaneSky). **Cost:** S.
3. **The moon road is a horizontal airbrush smear** (`night.png` lower-left x 0–600 y 740–790 at L\* 15.5, and right x 1300–1500 y 650–690 at L\* 20.4, over water at L\* 3.9; see `crop-night-bands.png`).
   - **What:** `garden-water.ts:1173-1184` draws a world-fixed gaussian (`roadHalfWidth 6.0`) through the island centre along `uMoonDir`. Because it ignores the eye, it crosses the frame sideways.
   - **Why it breaks the calm:** it is the brightest thing on the water after the beacon, and it reads as fog or a searchlight, not moonlight.
   - **Fix:** idea 6. **Cost:** S–M.
4. **Near-water chop is photoreal and busy** (`noon.png` bottom-centre; `crop-noon-water.png`).
   - **What:** streaked light/dark dashes and a hero reflection shredded into wavy smears. The busiest texture in the frame sits in the bible's calm "open approach" cell.
   - **Causes:** two normal-map octaves (`garden-water.ts:729-732`, `:742-748`) plus Gerstner normal gain 18.0 (`:769`), all at full near-field weight.
   - **Fix:** idea 3 (calmer chop plus drawn lines). **Cost:** S.
5. **Night beacon beam reads as lens dirt** (`night.png` x 690–750 y 200–290; `deep-night.png` x 820–890 y 200–290; `crop-night-beam.png`).
   - **What:** a translucent grey-brown truncated cone, soft on every side. It is the only non-print shape in the night frame.
   - **Fix sketch:** when the beam is foreshortened toward the camera, fade it by `1 - |dot(beamDir, viewDir)|`, or draw it as a flat pale wedge with one hard edge. Owned by LanePharos. **Cost:** S.
6. **The "paper grain" is blue noise** (`garden-post.ts:342`, `:475-483`).
   - **What:** a 64-px digital dither tile reused as paper at 1.7× scale. It is not a fibre, so at 0.035 it is neither felt as paper nor invisible.
   - **Fix:** idea 7. **Cost:** S.
7. **The noon haze is a white slab** (`noon.png` y 330–520 at L\* 92, sky at 86, against a bible target of 68–72 at `VISUAL_INVARIANTS.md:26`).
   - **What:** the slab erases the borrowed hills, which survive only as a ghost at the right. Bokashi needs a tinted pale seam, not paper-white.
   - Owned by LaneSky. **Cost:** S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

**Stylisation ladder.** Pick a rung. Each rung includes the ones below it. Nothing on any rung touches sail cloth or mon, flags, pennants, practical emissives (lanterns, beacon, windows), cue markers, sea signs, DEWS zone colours or the DOM.

| Rung | Name | Adds | What a visitor notices | Cost |
| --- | --- | --- | --- | --- |
| 0 | today | parametric grade, LUT, blue-noise grain | "nice 3D diorama, warm filter" | — |
| 1 | Subtle — *the shade plate* | 1 at 60 % amounts, 7, subtraction 2 | golden stops being sepia; nothing looks filtered | S–M |
| 2 | Composed — *the night print* | 5, 6, 3-lite (calm the chop only), 2 at golden/blue/night (noon 0) | silhouettes at night; the tower crown is drawn at dusk | M |
| 3 | Printed — *the harbour as hanga* | 1 at 100 %, 2 at every beat (noon 0.25), 3 in full, 4 with steps N=3 | layered planes; engraved risk water; calm water left blank | M–L |
| 4 | Identity — *shin-hanga* | 8 (per-material ink ramps) | a limited, authored palette per hour; unmistakably a print | L |

I recommend **rung 3**. Rung 4 is the operator's taste call.

### printmaker-1 ★ Ai-zuri shade plate: complementary ink in the indirect light only
- **Picture:** at 17:30 the tower stands as a dusk-violet mass against a gold sky. Its sunward arrises catch honey light, and its windows glow as lamps rather than as orange-on-orange. Shadows under the pines and hulls go ai-blue while sunlit faces stay warm, so the frame has two inks instead of one. In `mock-golden-aizuri.png` (image maths, not a render) the same frame stops reading as a filter and starts reading as Hasui.
- **Why:**
  - Defect 1. In a print, the key-light plate and the shade plate are different blocks with different pigments. Here the shade is filled by the orange ground bounce (`garden-day-cycle.ts:139`) plus a PMREM probe of an amber sky (`garden-environment.ts:687-690`).
  - Doing it in the material, not in post, means the shader knows direct from indirect light. It can also exempt identity surfaces by construction, which a screen filter cannot.
- **Impact:** stunning 5 / poetic 4 / relaxing 3. **Confidence:** H (mock plus mechanism).
- **Cost:** M. **Perf:** 0 draws / 0 tris / ≈+0.03–0.06 ms at 1600×1000@1x, roughly 4× that at DPR 2 [INFERENCE] (4 ALU per lit fragment) / 0 textures. There is a one-time program recompile.
- **How:**
  - **Shader chunk:** after `#include <lights_fragment_end>`:
    ```glsl
    float aiL = dot(reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
    reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, aiL * uAiInk, uAiAmount * uAiMask);
    ```
    `uAiInk` is luma-normalised (`ink / luma(ink)`), so fill energy is unchanged. That preserves the key:fill calibration and the environment "no extra energy" contract (`garden-environment.test.ts:288`).
  - **Inks per beat:**

    | Beat | Ink | Amount |
    | --- | --- | --- |
    | dawn | `fog_pale` #767b9c | 0.35 |
    | day | `sky_day_zenith` lerped 0.5 toward `shallow_teal` | 0.15 |
    | golden | `fog_blue` #52537e | 0.6 |
    | blue | `sky_horizon` #2d2554 | 0.5 |
    | night | `deep_sea_1` #0c2d57 | 0.45 |

    Blend them with the same beat weights `updateDayCycle` uses (`garden-day-cycle.ts:316-335`).
  - **Install:** a traversal patterned on the cloud-shadow hook (`garden-island.ts:702-741`), chaining the previous `onBeforeCompile` and extending `customProgramCacheKey` the way the lighthouse rim does (`garden-lighthouse.ts:286-312`). New module `src/three/garden-print-inks.ts`.
  - **Exclusions:**
    - Materials with `userData.gardenSailAtlas` (`garden-ships.ts:1240`).
    - The fleet sail and far-identity materials (`garden-fleet-batch.ts:887`, `:1193`).
    - Flag atlases (`garden-harbor-batch.ts:416`) and chain flags.
    - Any material whose emissive is a practical.
    - Cue markers.
    - Hull strakes: `uAiMask = 1 - step(0.5, aStrakeMask)` (`garden-fleet-batch.ts:777`), so issuer trim is not recoloured.
  - **Zero-code pre-test:** set golden `hemiGround` to `deep_sea_2.lerp(timber_dark, 0.46)` (the night value). If that alone moves the frame, the plate is confirmed.
- **Displaces:** the orange ground bounce as the shade colour. The golden and blue grade `shadowTint` split can then go to 1.0, retiring a grade knob.
- **Truth & a11y:** no analytical meaning. Sails, trim and zone colours are exempt. Reduced motion: static; it is lighting, not motion.
- **Risks:**
  - Hull timber may go too violet at golden; cap hull amount at 0.5×.
  - Shader pins in `garden-island`, `garden-lighthouse` and `garden-fleet-batch` tests that assert chunk text need updating.
  - The PMREM specular still carries amber, which is correct (it is a reflection).
- **Acceptance:** real GPU, `#t=17.6` rest.
  - Tower shade faces at OKLCH H 270–300, C ≥ 0.04.
  - Sunlit west arrises at H 55–85.
  - Hue gap between the sky beside the tower and the tower body ≥ 120°.
  - Sail cells ΔE00 < 2 vs `golden.png`.
  - `#t=12.25`: tower ΔE00 < 3 vs `noon.png` (day stays neutral).

### printmaker-2 ★ Sky-contact keyline: the key block cut only where form meets sky
- **Picture:** the tower crown, balustrade, statue, pine tips, masts and yards are finished with a hair-thin sumi edge exactly where they cut the sky, and nowhere else. The crown in `golden.png` stops melting into the gold, and rigging reads as drawn line. Faces, sails and logos have no outlines, so the drawing sits only on the silhouette, the way Hasui cuts his key block.
- **Why:** the §6 rejection ("equalise edges, tax logos") is correct for a Sobel or normal outline, which draws every crease at the same weight. A depth test against the cleared sky ranks edges instead: it only ever finds the silhouette tier.
  - The dome writes no depth (`garden-sky.ts:300-301`), so sky pixels keep depth 1.0.
  - Borrowed hills and mist also write no depth (`garden-horizon.ts:118`, `garden-sky-billboards.ts:301`). Distant hills therefore get no line and keep pure bokashi, which is exactly Hiroshige's rule.
  - Depth is already bound in the fused grade pass through tilt-shift's `EffectAttribute.DEPTH` (`garden-post.ts:699`, `:1611-1618`).
- **Impact:** stunning 4 / poetic 4 / relaxing 3. **Confidence:** M–H.
- **Cost:** S–M. **Perf:** 0 draws / 0 tris / ≈+0.1–0.2 ms @1x, ≈0.4–0.8 ms at DPR 2 [INFERENCE] (4 full-res depth fetches, fused into the existing pass). This is the costliest idea per pixel; if DPR 2 bites, sample depth at half resolution / 0 textures.
- **How:**
  - **Effect:** new `GardenKeylineEffect` (`EffectAttribute.DEPTH`, `BlendFunction.SRC`), inserted **first** in `gradePass` (`garden-post.ts:1611`). It then runs keyline → tilt-shift → god rays → grade → tone map → LUT, so the ink is graded, softened in postcards, and antialiased by the SMAA pass that follows.
  - **Shader** (`uKeylineInk` is a scalar, e.g. 0.5):
    ```glsl
    float geo = step(depth, 0.99999);
    vec2 o = texelSize * uKeylineWidthPx;
    float sky = max(max(step(0.99999, readDepth(uv + vec2(o.x, 0.0))), step(0.99999, readDepth(uv - vec2(o.x, 0.0)))),
                    max(step(0.99999, readDepth(uv + vec2(0.0, o.y))), step(0.99999, readDepth(uv - vec2(0.0, o.y)))));
    float nearW = 1.0 - smoothstep(uKeylineFadeStart, uKeylineFadeEnd, -getViewZ(depth));
    outputColor = vec4(inputColor.rgb * (1.0 - geo * sky * nearW * uKeylineInk), inputColor.a);
    ```
  - **Width:** `uKeylineWidthPx = max(1, drawingBufferHeight / 1000)`, so the line keeps its proportion at 2560×1440.
  - **Fade:** start at `fog.near + 0.15·(far − near)`, end at `fog.near + 0.5·(far − near)`, fed from `fogRangeAtViewHeight` (`garden-sky.ts:84-104`). The sea horizon and far fleet therefore get no line, so the annulus dissolve at `garden-sky.ts:381-382` survives.
  - **Ink per beat:** dawn 0.35, day 0.25 (0 on rung 2), golden 0.5, blue 0.5, night 0.45 (needs idea 5, or there is no lighter sky to cut against).
  - **Tiers:** tier-invariant, like hue.
- **Displaces:** nothing drawn. It quiets the need for more rim light: the tower rim (`garden-lighthouse.ts:236-312`) becomes the light edge inside the dark keyline, and its gain can drop about 20 %.
- **Truth & a11y:** no meaning. It improves silhouette legibility for low-vision viewers. Logos are interior to cloth and never touched. Reduced motion: static.
- **Risks:**
  - Mist billboards over geometry could show a line through the mist; the fog fade handles most of it.
  - Birds become ink ticks, which I think is a feature.
  - Resolved-MSAA depth is point-sampled, so verify rigging at 2560×1440 does not regress the W0.2 finding (`garden-post.ts:1519-1522`).
- **Acceptance:** real GPU, `#t=17.6`, `#t=18.8` and `#t=22` rest, plus `--width 2560 --height 1440 #t=17.6`.
  - Continuous 1–2 px dark edge on the crown, balustrade, pines and masts where they meet the sky.
  - **No** line along the sea horizon or the borrowed hills.
  - Sail interiors ΔE00 < 1 vs baseline.

### printmaker-3 ★ Engraved water: risk drawn as carved lines, calm left blank
- **Picture:** calm harbour water is left as one quiet sheet of colour (*ma*). Each riskier body is worked by the carver's knife:
  - watch: long, slowly bending lines;
  - alert: broken currents;
  - warning: short dashes;
  - danger: dense, steady parallels.

  Near water loses the streaky photoreal chop and reads as flat colour with a few drawn crests, which is how Hiroshige and Yoshida draw a harbour. Risk becomes something you can *see in greyscale*.
- **Why:**
  - Defect 4.
  - The shader already computes a distinct rhythm per band (`garden-water.ts:772-798`) but spends it as a ±3.5 % tone (`:1062`), so it is invisible. The rhythms are there; they need drawing.
  - The line language already exists in the frame: shore lapping bands (`:987-996`), foam rings (`:1316`) and broken lane strokes (`:1385-1393`).
- **Impact:** stunning 4 / poetic 5 / relaxing 4. **Confidence:** M (no stress frame captured).
- **Cost:** M. **Perf:** 0 / 0 / < 0.1 ms @1x [INFERENCE] / 0.
- **How:**
  - **Lines:** replace `:1062` with `crest = aaStep(1.0 - uLineWidth[band], 0.5 + 0.5 * sin(phase))`, reusing each band's existing `phase` and gates. Widths: watch 0.08, alert 0.07, warning 0.10, danger 0.12.
  - **Ink:**
    - day: `mix(waterColor, uHighlightColor, 0.35)`;
    - dusk: the dusk highlight at α 0.2;
    - night: `moonlight` at α 0.12, inside the night emissive budget.
  - **Moiré guard:** `periodPx = (6.2832 / k) / max(fwidth(bodyAcross), 1e-4)`, then `α *= smoothstep(5.0, 12.0, periodPx)`. This keeps `wholemap-*` clean.
  - **Blank bodies:** open, harbour and ledger get no lines.
  - **Calm the chop by day:** Gerstner normal gain 18.0 → 11.0 (`:769`) and second normal octave weight 1 → 0.6 (`:732`, `:745`), both scaled by `uDaylight`. Night stays as-is.
- **Displaces:** the photoreal near-field chop and the invisible tone modulation.
- **Truth & a11y:**
  - This adds a **non-colour carrier** for the DEWS band, a direct PRODUCT.md a11y win.
  - The ledger needs one sentence per band naming its line rhythm (ledger/DataPoetry lane).
  - Reduced motion: `uTime` is already frozen, so the lines are static and still distinct.
  - Zone colours (`palette.ts:182-192`) are unchanged.
- **Risks:**
  - Lines fighting boats in dense anchorages; fade under hull contact shadows.
  - Pins in `garden-water.test.ts` on signature constants.
  - Pairs with LaneWater's roughness-as-risk; they agree line density follows region roughness.
- **Acceptance:** real GPU, `--fixture stress #t=12.25` and `#t=22`.
  - Each band identifiable in a greyscale copy.
  - Calm water has no lines.
  - `#t=12.25&cam=0,0,0.28` shows no moiré.
  - The bottom-centre cell of `noon` measures lower high-frequency energy (Laplacian variance −30 %) than `noon.png`.

### printmaker-4 Two-ink, stepped aerial perspective (Yoshida's planes)
- **Picture:** at golden hour the far fleet and quays settle into a violet-grey band under a gold sky, instead of dissolving into it. The harbour reads as three printed planes (near, mid, far), each almost flat and each paler and cooler than the one before, like Yoshida's *Sailboats* series.
- **Why:** measured `golden.png` far fog = sky. Linear fog toward the horizon colour (`garden-sky.ts:550,561`) makes aerial perspective and sky one ink. Yoshida separates *air* (cool, between viewer and object) from *sky* (warm, behind).
- **Impact:** stunning 4 / poetic 4 / relaxing 4. **Confidence:** M.
- **Cost:** S–M. **Perf:** 0 / 0 / < 0.05 ms @1x [INFERENCE] / 0.
- **How:**
  - **Two inks:** in the fog injection (`garden-height-fog.ts:276-281`, `injectGardenHeightFog`), replace the fog colour with `mix(uAirInk, fogColor, smoothstep(0.55, 1.0, f))`. At `f → 1` it is exactly the horizon colour, so the plate/dome seam contract holds.
  - **`uAirInk` per beat:**
    - golden: `fog_blue` lerped 0.35 toward the horizon;
    - dawn: `fog_pale`;
    - day, blue and night: equal to the fog colour (no change).
  - **Steps (rung 3):** `s = f * 3.0; f = (floor(s) + smoothstep(0.3, 0.7, fract(s))) / 3.0`. Apply to object materials only, never to the water plate or dome, which would band.
- **Displaces:** the amber wall. It also reduces the need for the golden LUT's warm bend.
- **Truth & a11y:** none. Fog is illumination, and stale-source haze (`garden-height-fog.ts:34`) stays independent. Reduced motion: static.
- **Risks:** steps visible as contour lines on long quays; widen the risers if so. The horizon seam must be checked at `cam=…,0.28`.
- **Acceptance:** `#t=17.6` and `#t=17.8&cam=0,0,0.28`.
  - Far quays and fleet at OKLCH H 275–300 under a sky at H 55–80.
  - A σ = 8 px blurred copy shows three value plateaus from near to far.
  - No hue step at the annulus/dome join.

### printmaker-5 Night silhouette law: bero-ai sky over darker land (with LaneSky)
- **Picture:** a luminous Prussian-blue seam above the sea fading to a deep top band. The grove, pagoda roofs, stations and far masts stand *in front of it* as flat dark shapes. The beacon and the windows become the story. `mock-night-beroai.png` shows the principle; its mask artefacts are mine, not the idea's.
- **Why:** defect 2. The rule every shin-hanga night obeys: **sky L\* ≥ 2× land L\***. Today it is inverted or equal.
- **Impact:** stunning 5 / poetic 5 / relaxing 4. **Confidence:** H.
- **Cost:** S. **Perf:** 0 / 0 / 0 / 0.
- **How:**
  - LaneSky owns the numbers. Their rendered targets are zenith L\* ≈ 7 (#0e1530), sea-horizon glow L\* ≈ 15 (#1b2440), ridges L\* 9–11. My authored proposal is compatible: `GARDEN_SKY_BEATS.night` (`garden-sky.ts:51`) horizon #11182c → #26456e and zenith #050918 → #0e1a3c. The rendered sky is ≈ 40 % of authored after bokashi, grade and vignette.
  - Keep `deepGain 0.24` (`:138`); Hiroshige's dark top band is correct.
  - Keep hue in bero territory (H 255–265), not violet 287, and chroma ≤ 0.07.
  - Hold the night hemisphere/ambient (`garden-day-cycle.ts:152-160`) where it is so land stays dark.
  - The water picks up the lighter seam through `NIGHT_ENV_HORIZON` (`garden-water.ts:440`), which gives an automatic pale ichimonji strip on the water.
- **Displaces:** the black void. Keylines (idea 2) need this before they can work at night.
- **Truth & a11y:** none. It raises contrast for silhouettes. Reduced motion: static.
- **Risks:**
  - Reading as day-for-night; keep chroma low and the beacon the brightest thing (bible: beacon 92).
  - The night emissive contract covers water only, so it is unaffected.
- **Acceptance:** `#t=22` and `#t=2.5` rest.
  - Seam band L\* 11–15, top band 5–8.
  - Grove patch (170–330, 440–520) ≥ 5 L\* darker than the sky behind it.
  - Stars still visible; beacon maximum luminance unchanged.

### printmaker-6 Printed moonlight: a column of broken horizontal strokes toward the viewer
- **Picture:** under the moon, the water holds a vertical ladder of short horizontal strokes, longer near the viewer and shorter toward the horizon. These are Hasui's moon reflections, and they rhyme with the broken window reflections already under the tower (`crop-night-water.png`, the most print-like thing in the product today).
- **Why:** defect 3. The road is world-fixed (`garden-water.ts:1173-1178`), so it lies across the frame as a smear. A reflection path always runs toward the eye.
- **Impact:** stunning 4 / poetic 5 / relaxing 4. **Confidence:** M.
- **Cost:** S–M. **Perf:** 0 / 0 / ≈0 [INFERENCE] / 0.
- **How:**
  - **Axis:** `roadAcross = dot(vWorldPosition.xz - cameraPosition.xz, perp(moonDirXZ))`. It runs from the eye toward the moon's azimuth, and LaneSky should put the moon in frame.
  - **Slats:**
    - pitch `p = 1.6 + 0.02·roadAlong`;
    - `row = floor(roadAlong / p)`;
    - half-length `halfWidth·(0.35 + 0.65·hash(row))·profile`;
    - stroke `aaStep(0.62, sin(6.2832·roadAlong / p))`.
  - **Energy:** keep the `moonRoadGain` budget. At a duty of about 40 % the mean is inside `GARDEN_WATER_NIGHT_EMISSIVE_BUDGET`; peaks may rise to 1.6× the old peak, still below the bloom knee (2.4).
  - Keep the glitter term (`:1190-1199`), masked to the slats.
- **Displaces:** the gaussian band fill (`:1180-1184`).
- **Truth & a11y:** none. Reduced motion: slat positions are static (no `uTime`).
- **Risks:** it duplicates LaneWater's proposal (they agree); one owner should land it.
- **Acceptance:** `#t=22`: no horizontal pale band over the whole harbour; a stroke column that points toward the camera; night contract test passes.

### printmaker-7 Washi and goma-zuri in flat fields only (replaces the blue-noise "grain")
- **Picture:** in large flat fields (the day sky, calm water, the Prussian night) there is a faint, non-repeating pigment unevenness, like ink pressed into fibre by a baren. You feel it as warmth; you cannot point at it.
- **Why:**
  - Defect 6.
  - Paper texture in a real print shows in flats, not across edges or on fine detail. A `fwidth(luma)` gate gives exactly that and automatically spares logos, rigging and text-like detail, which are high-frequency.
- **Impact:** poetic 3 / relaxing 2. **Confidence:** M.
- **Cost:** S. **Perf:** 0 / 0 / ≈+0.05 ms @1x [INFERENCE] / **0 net textures**. The whole-map census is already at 72/72 (`TESTING.md:383`), so the washi must pack into the G channel of the existing blue-noise texture: 64² → 256² RGBA, R = the current dither tile repeated, G = washi. That is one slot, one fetch per channel.
- **How:**
  - **Texture:** generate a seeded 256² washi (long fibres plus low-frequency mottle) in `generate-garden-luts.mjs`, hash-pinned like the LUT (`garden-post.ts:329-330`).
  - **Shader:** in the LUT effect, replace `:475-483` with
    ```glsl
    tooth = texture2D(washi, gl_FragCoord.xy / 256.0).r;
    w = (1.0 - smoothstep(0.003, 0.015, fwidth(luma))) * sqrt(1.0 - abs(2.0 * luma - 1.0));
    display *= 1.0 + (tooth - 0.5) * 0.02 * w;
    ```
    It is screen-anchored, because the paper does not move, and static.
- **Displaces:** the blue-noise tooth. The 1/255 dither stays.
- **Truth & a11y:** none. Logos are excluded by the gate. Reduced motion: static.
- **Risks:** screen-anchored texture during a pan can read as a dirty lens at > 3 %; hold it at ≤ 2 %.
- **Acceptance:** a 200 % crop of the `noon` and `#t=22` sky shows fibre that does not repeat at 1600 or 2560. Logo cells ΔE00 < 1. In a blind A/B at 100 % the viewer cannot name what changed.

### printmaker-8 Per-material ink ramps: the limited, layered palette (top rung)
- **Picture:** each material family is printed from three authored inks per hour:
  - stone: sumi-grey shade, `stone_pale` mid, cream light;
  - foliage: ai-green shade, moss mid, yellow-green light;
  - timber: kogecha shade, `timber_mid`, honey light;
  - roofs.

  The whole harbour then shares one dye lot, the way a shin-hanga edition does, and the frame becomes unmistakable.
- **Why:** the limited palette is what makes a print a print. The LUT tries to "bend toward dentō-shoku" globally (`generate-garden-luts.mjs` header), which cannot exempt sails and so must stay timid (`LUT_STRENGTH 0.9` of a mild transform).
- **Impact:** stunning 5 / poetic 5 / relaxing 3. **Confidence:** L–M (large authoring surface).
- **Cost:** L. **Perf:** 0 / 0 / ≈+0.1 ms @1x [INFERENCE] / **0 net textures**. The 5 beats × 4 families ramp rows are appended to the existing LUT strip (1024×160 → 1024×180, ramps in columns 0–255), because the texture census has no free slot.
- **How:**
  - **Ramps:** generated from `HARBOR_PALETTE` in the LUT script, hash-pinned.
  - **Chunk** (the same install as idea 1, which it subsumes):
    ```glsl
    l = luma(o) / (luma(o) + 1.0);
    ink = texture2D(ramp, vec2(l, row)).rgb;
    o = mix(o, ink * luma(o) / max(luma(ink), 1e-3), uInk * 0.6);
    ```
    It is luminance-preserving, so the value plan does not move.
  - The family is set per material in `userData.printFamily`. The same exemptions as idea 1 apply.
- **Displaces:** most LUT hue-band work (`LUT_STRENGTH` 0.9 → 0.5) and the golden/blue split tones.
- **Truth & a11y:** none. Identity surfaces are exempt. Reduced motion: static.
- **Risks:**
  - It can slide into "grade repairing composition" (bible, colour anchors). Keep it material authoring, reviewed per beat on contact sheets.
  - Pins in `palette.test.ts` are unaffected, but shader-text tests are affected.
- **Acceptance:** a five-beat contact sheet at rest. Per family, the pixel hue histogram has three clear modes. Sail cells ΔE00 < 1. The bible value plan cells stay within ±3 L\*.

## Subtractions
1. **The gaussian moon road fill** (`garden-water.ts:1180-1184`): remove it even before idea 6 lands. The night is quieter with no road than with a smear.
2. **The blue-noise paper tooth** (`garden-post.ts:342`, `:475-483`): set `PAPER_GRAIN_STRENGTH` to 0 now. It is a digital pattern posing as paper.
3. **The golden orange ground bounce** (`garden-day-cycle.ts:139`, `hemiGround: timber_mid`): replace it with the night ground value. This is the single cheapest cut to the sepia wash.
4. **Near-field chop by day** (`garden-water.ts:769`, gain 18 → 11; second octave 0.6×): calm before you draw.
5. **Do not add** woodblock misregistration, a channel-offset "kento" effect, chromatic aberration, a monochrome ink filter or animated grain. Misregistration is chromatic aberration by another name: it smears mon on cloth and makes the frame look faulty rather than printed. I uphold that part of §6.

## Reversals
- **Plan §6 "Full toon/outline shader … paper grain … equalise edges, tax logos, fight calm"** (`agents/pharosville-reborn/01-implementation-plan.md:336`). I reopen two of the listed items, **selectively**, and uphold the rest.
  - **Outline → sky-contact keyline (idea 2).**
    - *Evidence:* `crop-golden-tower.png`, where the crown and balustrade melt into same-hue sky, and `night.png`, where silhouettes are lost.
    - *Argument:* the rejection's three reasons do not apply to this technique:
      - It does not equalise edges: it selects only the silhouette-against-sky tier, and hills, mist and horizon are excluded by depth and fog.
      - It does not tax logos: sail interiors are never adjacent to sky depth.
      - It does not fight calm: it is static and tier-invariant.
    - *Risk:* thin rigging thickening. That is gated by the 2560×1440 acceptance check.
  - **Paper grain.** This was already half-reversed in code (0.035 since 2026-09-07), but as blue noise. The argument is to replace it with flat-field washi (idea 7), gated by `fwidth` so it cannot reach edges, logos or text.
- **Implementation reading of "Night is dark"** (`VISUAL_INVARIANTS.md:54-56`). This is not a reversal of the bible. The bible's own value table asks for a night sky of 9–14 over land of 3–5, but the code rendered "dark" as a black sky (L\* 2–3). Idea 5 brings the code back to the bible.

## Cross-lane dependencies
- **LaneSky:**
  - Owns the night sky numbers for idea 5; targets agreed by message.
  - An in-frame moon for idea 6.
  - The noon white slab (defect 7).
  - Keyline night strength (idea 2) is only meaningful after the sky lift.
- **LaneWater:**
  - Idea 3 pairs with their roughness-as-risk proposal: calm/ledger stay blank glass and line density follows region roughness. Both of us propose idea 6; one owner should land it.
  - Their `tintStrength` cut makes the lines the main within-band carrier.
- **LaneLight:** idea 1 changes what the shade *is*. Any key:fill or PMREM retune should land after it or together with it. Subtraction 3 is on their rig table.
- **LanePharos:** the beam smudge (defect 5). The tower rim gain drops about 20 % once the keyline lands.
- **LaneDataPoetry and the ledger:** one sentence per DEWS band describing its drawn rhythm (idea 3), to keep DOM parity.
- **LaneFleetCraft:** every idea exempts the sail atlas, far identity quads, pennants and hull strake. Any new identity material must carry `userData.gardenSailAtlas` (or a new `printExempt` flag) so it stays exempt.
- **LaneHeadroom:** every idea adds 0 draws, 0 tris and 0 net textures; ideas 7 and 8 pack into the existing blue-noise and LUT slots, respecting the 72/72 census. GPU cost for rung 3 is ≈ +0.3–0.4 ms at 1600×1000@1x, ≈ 1.2–1.6 ms at DPR 2 [INFERENCE, analytic, not measured]. The keyline dominates that figure, and half-res depth is its fallback. There is no per-object JS work; everything runs in shaders and uniforms, so no CPU submit cost.
- **LaneArtDirector:** picks the rung. Ideas 1 and 4 together are the golden-hour fix. Ideas 5 and 2 together are the night fix.
