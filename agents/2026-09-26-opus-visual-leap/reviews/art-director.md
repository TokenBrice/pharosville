# Holistic art direction — art-director

## Verdict
If `noon.png` ran as a key visual next to Kawase, Yoshida, Journey, Alto or Porco Rosso, an art director would say this is a well-lit asset review, not a picture. There is no single hand. A filigreed Italianate tower sits dead centre and fills 65 % of the frame height. It is surrounded by flat-shaded low-poly props, pastel rectangle sails and brand-hex crypto flags. The upper two-thirds is one light slab (L* 64–77 across all six cells, where the bible wants 27–72), so nothing reads as shade, threshold or distance. Night is the only frame that obeys its own value plan (`night.png`, `deep-night.png`). The leap is not a new effect. It is one style decision: **shin-hanga hour-prints**. That means Hiroshi Yoshida's *Sailboats* principle, one composition printed at each hour, carried out as authored value planes, hour-keyed air colour, kasumi mist bands and a real repoussoir. `blue-rethird.png` shows that about 70 % of this is already latent in the scene.

## What I looked at
- **Baseline frames (all 15):** `outputs/opus-review/{dawn,morning,noon,golden,blue,night,deep-night,wholemap-noon,wholemap-dusk,selected-ship,selected-lighthouse,reduced-noon,sea-sign-hover,noon-1440p,compact-1200x640}.png`. I used `night.txt` for the serial GPU split.
- **My captures:** `outputs/opus-review/art-director/`, run on the real Chrome GPU.
  - `golden-rethird.png` (`#t=17.6&cam=1128,-614,0.85`) and `blue-rethird.png` (`#t=18.8&cam=1184,-811,1.0`). Both are right-third composition tests. Both printed tier `recovery` after a retry because the GPU was shared, so use them for composition and value only, not finish.
  - `night-beacon.png`: a motion sheet of the crown, `#t=22`, 6 frames at 700 ms, tier `interaction`.
  - `crop-crown-{morning,noon}.png`: crops of the baseline frames.
- **Measurements, not captures:**
  - Perceptual L* 3×3 means of the PNGs (sRGB → Y → L*, 400×250 downsample): noon `[[72,74,73],[64,68,77],[31,29,30]]`, golden `[[60,61,63],[50,51,62],[24,20,24]]`, night `[[3,5,2],[3,8,4],[7,5,7]]`, `golden-rethird` `[[62,65,65],[43,44,54],[19,18,21]]`.
  - Saturated-pixel share (HSV s·v > 0.35): golden 38 %, all red or orange; noon 8 %.
  - High-frequency energy, |img − gauss6|: noon foreground water 7.5 against sky 0.8.
  - Rest camera from `defaultCamera` at 1600×1000: `{offsetX:984, offsetY:-1008, zoom:1.15}`, which is the ceiling.
  - Projected pine bough position: x ≈ −1420…−2000 px at 1600×1000; also off-screen at 900×720, 1200×640 and 2560×1440.
- **Code read:**
  - `src/systems/camera.ts:37-39,128-188`
  - `src/systems/projection.ts:4-27`
  - `src/three/garden-rim-mesh.ts:893-985`
  - `src/three/garden-post.ts:43-142` (grade presets)
  - `src/three/garden-day-cycle.ts:77-208`
  - `src/three/garden-sun.ts:33-65`
  - `src/three/garden-chain-flag.ts:170-212`
  - `src/three/garden-water.ts:400-429,630-745,1150-1162,1274-1290`
  - `src/three/garden-lighthouse.ts:933-1070`
  - `src/three/garden-beacon-fire.ts:31-35,133-150`
  - `src/three/garden-flora.ts:18,66-69`
  - `src/components/harbor-label-chips.tsx:39-64`
- **History:** `agents/pharosville-reborn/reviews/astra-game-art-director.md`, `decision-ledger.md`, and `01-implementation-plan.md` §0–2 and §6.

**What the style is today:**
- Low-poly asset-pack props (blob broadleaves, faceted rocks, cylinder towers with cone caps).
- One over-detailed hero in Hellenistic-Italianate dress.
- Brand-hex flags.
- A PBR stack (N8AO, bloom, SMAA, LUT) over near-neutral grades (`DAY_GRADE` shadowTint `[1,1,1]`, `garden-post.ts:127-131`).

That is four finish levels and no hand. **What it should be:** shin-hanga hour-prints (see ideas 1–3). The rejected "toon/ink/paper-grain filter" (`01-implementation-plan.md:336`) stays rejected. Shin-hanga here means value and colour discipline authored in light, air and composition, not a post filter.

## Spell-breakers (defects)
1. **The authored repoussoir never renders.**
   - *What:* The bible's "dark clipped pine bough crosses the near corner" exists as `GARDEN_RIM_FOREGROUND_BOUGH_NAME`, but it sits 12 u left and 8 u forward of the rest eye (`garden-rim-mesh.ts:919-920`). That is about 56° off-axis, against a half-hFOV of about 24.6° at 16:10. It projects to x ≈ −1690 px at 1600×1000 and is off-frame at every gate size.
   - *Evidence:* Bottom-left L* is 31 where the bible asks for 15 (`noon.png`). `compact-1200x640.png` also has no framing dark.
   - *Why it breaks the calm:* There is no shaded threshold, so the viewer floats over open water.
   - *Fix:* Re-seat the bough to about 3 u left and 6 u forward, with pads crossing the top-left and bottom-left corner zones (see idea 1).
   - *Cost:* S.
2. **The rest camera maximises zoom and treats composition as a tiebreak.**
   - *What:* `camera.ts:177` scores `zoom + …`, and the aim toward tower x = 0.62 (`:179`) only breaks ties. The solver lands on the zoom ceiling of 1.15 (`:39`), with the tower on the 0.50 boundary of its 0.50–0.72 interval (`:128`).
   - *Evidence:* In `noon.png` the tower is centred and spans y 70→700, and the frame reads as a monument portrait. `golden-rethird.png` and `blue-rethird.png` put the tower at about 0.61 and it immediately breathes.
   - *Fix:* Make aim primary and zoom secondary.
   - *Cost:* S–M, plus re-pinning the camera tests.
3. **Golden hour is one-hue soup.**
   - *What:* 38 % of golden pixels are saturated red or orange. The tower (L* about 50) sits on sky and haze at L* about 60, so the hero loses its silhouette at the hour meant to be most beautiful. The upper two-thirds are 25 L* brighter than the bible's dusk plan.
   - *Where:* `golden.png`, whole upper frame; `wholemap-dusk.png`. Sources: `garden-day-cycle.ts:94-98,134-142` (dusk horizon ember, hemi from sky_horizon) and `GOLDEN_GRADE` highlightTint `[1.12,1.035,0.9]` with split 0.65 (`garden-post.ts:136-139`).
   - *Why it breaks the calm:* Warm light only reads against a cool complement, and there is none.
   - *Fix:* Idea 2.
   - *Cost:* M.
4. **Noon has no value structure.** Rows read 72/74/73 over 64/68/77. The tower is cream (about 80) against white haze (about 85), light on light (`noon.png` centre and middle-right). The "receding fleet" cell is 77 against a plan value of 42. Fix: idea 2 (air luminance and zenith). Cost: S–M.
5. **Beacon end-on flash reads as a brown-grey smudge, and the beam is a hard-edged cone.**
   - *Where:* The smudge is at `night.png` 690–750,210–290, `deep-night.png` 820–890,205–290, and `night-beacon.png` frame 1. The other five frames show a crisp-edged solid wedge.
   - *Source:* `garden-lighthouse.ts:1042-1050` (uScatter end-on gain), with the nested cones at `:965-996`.
   - *Why:* It is the focal point of the best frame, and it looks like a rendering error.
   - *Fix:* Replace the end-on disc with a lantern-glass flare: brighten the lantern emissive and add a small screen-space star. Feather the cone's cross-section with `pow(1 − |across|, 3)` and fade along 60 % of its length.
   - *Cost:* S.
6. **The daytime beacon smoke reads as a blue feather or bruises at the crown.**
   - *Where:* `crop-crown-morning.png` shows a blue-grey feather stuck to the statue. `crop-crown-noon.png` shows four detached blurred slate puffs. Also in `golden.png` and `noon-1440p.png`.
   - *Source:* The "grey-blue daymark column" (`garden-beacon-fire.ts:31-35,133-148`).
   - *Why:* The most-looked-at 2 % of the frame carries an artefact.
   - *Fix:* By day, one continuous thin warm-grey ribbon at opacity ≤0.25 that bends with the wind, or no smoke at all. Keep the night wisp.
   - *Cost:* S.
7. **Brand-hex flags are the most chromatic and highest objects in the frame.**
   - *Where:* In `noon.png`, Ethereum (95–180,290–355) and Base (445–475,365–395). `selected-ship.png` shows a five-logo parade (Arbitrum, BNB yellow, Polygon, TON). `wholemap-noon.png` shows the Tron flag at `#ff060a`.
   - *Source:* The raw hexes in `garden-chain-flag.ts:190-202` bypass the palette and challenge vermillion primacy (bible §Immutable anchors).
   - *Why:* This is the crypto-badge anti-reference, placed at the top-left power point.
   - *Fix:* Idea 4.
   - *Cost:* S.
8. **Foreground water is a uniform chevron carpet.**
   - *What:* High-frequency energy is 7.5 across the whole approach (`noon.png` y > 760). The bible's "continuous empty inlet" and "broken reflection" drown in same-size dashes. Pine reflections become floating green blobs (`noon.png` 560–760,760–900).
   - *Source:* Tiling 0.055 and 0.11 everywhere (`garden-water.ts:726-745`).
   - *Fix:* Idea 6.
   - *Cost:* M.
9. **Night reflections squiggle, and pale horizontal bands smear the water.**
   - *What:* Window reflections are "C"-shaped worms rather than vertical pillars (`night.png` 700–860,860–960), because distortion is isotropic (`heroUv += surfaceNormal.xy * 0.008`, `garden-water.ts:1157`). Milky horizontal bands cross the water at `night.png` 0–560,740–790 and 1100–1568,640–700. [INFERENCE] The bands are probably the beam road and landing pool (`garden-water.ts:1274-1290`) seen at grazing angle.
   - *Fix:* Idea 5.
   - *Cost:* S–M.
10. **Selection framing shoots through a blurred blob tree.**
    - *What:* In `selected-ship.png`, a low-poly broadleaf (600–760,450–840) and a yellow-capped cylinder occupy frame centre under tilt-shift. The selected USDC hull cannot be found without the panel.
    - *Fix:* The selection pose must clear the pick ray, or cap near-occluder alpha along it.
    - *Cost:* M.
11. **The arrival nameplate outshines every ember at night.** The DOM chip "OpenDollar USDO Calm" sits at full UI contrast (`night.png` 430–575,568–583; `deep-night.png`). Source: `harbor-label-chips.tsx:39-64`. Fix: at night-mix > 0.5, render the chip in ember ink with 60 % opacity. Cost: S.
12. **Pine pads read as palms at distance.** `wholemap-noon.png` shows a rim lined with palms. `noon.png` shows the islet at 165–340,410–470 as tree-ferns. The pads are thin, bright and radially drooping (`garden-flora.ts:66-69`, leaf = aurora_green lerped only 0.45 toward trunk). This is fantasy-tropical costume in a Japanese garden. Fix: idea 7. Cost: M.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### art-director-1 ★ Compose the print: aim-first rest camera and a repoussoir that exists
- **Picture:** The Pharos stands on the right third with sky above its crown. A dark clipped pine bough (value 10–15) crosses the upper-left and lower-left corners in soft focus, so you are standing in the garden's shade and looking out. The inlet opens left of the tower and your eye walks from dark bough, to bright water, to tower, to far hills. This is Hiroshige's *Plum Garden at Kameido* device, Kawase's framing pine, and Yoshida's fixed station point.
- **Why:** `camera.ts:177-179` optimises closeness, not composition, and rests at the 1.15 ceiling with tx = 0.50. The bough is off-screen (defect 1). The composition tests prove the latent picture: `golden-rethird.png` values `[[62,65,65],[43,44,54],[19,18,21]]` sit much closer to the bible's diagonal plan than baseline golden, and `blue-rethird.png` at about 0.61 is the first frame I would share. Those tests also expose the problem: a manual camera drags station roofs, the Polygon flag and blob trees into the foreground, so the solver's flag constraints must stay.
- **Impact:** 5, stunning and relaxing. **Confidence:** H.
- **Cost:** S for the bough, M for the solver and tests. **Perf:** Δdraws 0 (the bough already submits); Δtris 0; ΔGPU ≈0; Δtextures 0. Rest zoom falls from about 1.15 to 0.95–1.0, so slightly more fleet is on screen. That is counted, not timed.
- **How:**
  1. Scoring (`camera.ts:177-188`): `score = −4·|tx−0.62| − 3·|crownY−0.12| − 2·|towerSpan−0.48| + 0.5·zoom + 0.02·visible − 2·corridorSubjects`, where `towerSpan = by−ty`. Keep every existing violation term, including `nearFlagBand`.
  2. Lower `GARDEN_REST_ZOOM_FLOOR` only if the scan needs it.
  3. Bough (`garden-rim-mesh.ts:919-936`): set `FOREGROUND_BOUGH_FORWARD_WORLD` to about 6 and `…LEFT_WORLD` to about 3–4, anchored by *projected screen target* rather than world offsets. Solve so the pad centroid lands at screen (0.06, 0.18) and the trunk base below the frame; add a test that the projected pad bbox intersects the frame at all four gate sizes.
  4. The bough material uses value ≤15 at noon (needle colour lerped 0.8 toward `timber_dark`) and is excluded from the tilt-shift sharp band so it stays soft.
- **Displaces:** Tower dominance (65 % → about 48 % of frame height). The cut-off hull and sail in the bottom-left corner (`noon.png` 0–100,700–900) is pushed out of frame.
- **Truth & a11y:** No analytical meaning. The bough must never cover a ship's pick proxy: exclude it from hit-testing and keep it inside the corner zones only. Reduced motion is the same static bough with no sway.
- **Risks:**
  - `camera.test.ts`, `garden-attract.test.ts` and `garden-rim-mesh.test.ts:468-472` ("stays below the rest view axis") must be re-pinned.
  - A dark corner can read as a dirty lens if it is sharp and mid-grey. It must be near-black and soft.
- **Acceptance:** `npm run preview -- --hash "#t=12.25"` at 1600×1000, 1200×640 and 900×720. The tower foot x/W sits in 0.58–0.66. Bottom-left L* ≤ 18 and middle-left ≤ 40 on the 3×3 grid. The bough is visible in a corner at all three sizes, and the empty inlet survives `--blur-audit`.

### art-director-2 ★ The hour colour script: air carries the temperature, shadows take the complement
- **Picture:**
  - **Noon:** Kawase's summer. A deep cerulean zenith, a white tower that pops against *middle-value* blue air, and cool blue-green shadows. It is crisp, not milky.
  - **Golden hour:** warm light on the stone and sails against cool violet-blue air and water. The warm band is confined to the lowest 15 % of sky.
  - **Blue hour:** mauve over indigo, as in `blue.png`, which already works.

  The eye finally feels time passing because each hour is a different print, not the same print tinted.
- **Why:**
  - Noon's top two rows are 64–77 against a plan of 27–72, and the tower sits light-on-light (defect 4).
  - Golden is 38 % saturated orange with the tower at L* 50 on a sky at 60 (defect 3).
  - Grades are near-neutral, with `DAY_GRADE` shadowTint `[1,1,1]` (`garden-post.ts:127-131`), so shadows are grey rather than coloured. Every reference (Kawase, Yoshida, Ghibli harbours, Sable's skies) gets its calm from temperature contrast between lit planes and shadow or air.
- **Impact:** 5, stunning and poetic. **Confidence:** H for golden, M for noon (the palette tests constrain it).
- **Cost:** M. **Perf:** 0 draws, 0 tris, ΔGPU ≈0 (uniform changes only), 0 textures.
- **How:** Use authored per-beat targets, verified with the L* grid script, not coefficient nudges.
  1. `DAY_CYCLE_SKY_PRESETS.day` (`garden-day-cycle.ts:88-93`): drop the fog and horizon luminance about 12 L* and push hue 10° toward the zenith cerulean. Lower day fog density about 25 % so middle-right falls from 77 to about 50–55.
  2. `DAY_GRADE.shadowTint` → `[0.95,0.985,1.05]`; `GOLDEN_GRADE.shadowTint` → `[0.93,0.95,1.08]`. Cut golden `highlightTint` blue to 0.94 and `split` to 0.5.
  3. `DAY_CYCLE_SKY_PRESETS.dusk.horizon`: keep ember only in a thin band, by making the sky shader's horizon exponent steeper (`garden-sky.ts` gradient ladder). Raise `dusk.fog` lerp toward `fog_blue` from 0.85 to 0.95. Set golden `hemiSky` to `fog_blue` so shadow-side fill is cool (`garden-day-cycle.ts:141`).
  4. Budgets as acceptance: golden saturated-orange share ≤15 %, hero cell (tower) ≥8 L* away from its surrounding air, and the noon grid within ±8 of the bible table in at least 7 of 9 cells.
- **Displaces:** The warm-rescue multipliers and the golden orange haze wall. It quiets `GOLDEN_GRADE`'s split-tone.
- **Truth & a11y:** The wall clock still owns illumination and nothing is data-driven. PSI clarity aloft (D15) keeps its channel: these are the *neutral-clarity* targets. The anchors `lantern_warm`, `vermillion`, `sail_teal` and `sail_red` are untouched. The reduced-motion tableau inherits it unchanged.
- **Risks:** `palette.test.ts` and the sky and day-cycle tests re-pin. Night must not regress (it is already on-plan). Sail identity hues shift slightly under cool fill, so check the pirate-contrast floor.
- **Acceptance:** Capture `#t=12.25` and `#t=17.6` at rest, then run the L* grid and saturated-share script. Golden: tower silhouette separable at 16 px blur, orange share ≤15 %. Noon: tower brighter than its air by ≥8 L*.

### art-director-3 ★ Kasumi: distance bands of mist that make lost edges and float the far fleet
- **Picture:** Two soft horizontal bands of pale air lie across the harbour. One sits at the waterline of the far anchorages, one at the foot of the borrowed hills. The distant fleet becomes sail-tops floating on mist, the hills become cut-paper silhouettes, and the plate's hard edge dissolves. This is the oldest Japanese device for separating planes (Yamato-e kasumi, Kawase's morning prints). It is where the carpet of ~180 hulls turns into an atmosphere.
- **Why:**
  - Everything in `noon.png` beyond the island is hard-edged. The only painterly region is the pale far fleet at 950–1500,500–600, which is exactly where mist already acts. The picture needs that effect *banded*, not uniform.
  - It solves three recurring complaints from `decision-ledger.md` §Recurring at once: value planes, fleet density with D1's whole fleet kept, and the plate-edge diorama in `wholemap-*.png`. It does this without hiding any hull or touching its colour.
- **Impact:** 5, poetic and relaxing. **Confidence:** M.
- **Cost:** M. **Perf:** 0 draws, 0 tris, 0 textures. ΔGPU is [INFERENCE] about +0.05–0.15 ms at 1600×1000@1x, roughly 4× that at the operator's DPR 2. It is a few ALU in the shared fog function per fogged fragment, with no per-object JS.
- **How:**
  1. Extend `gardenHeightFogGlsl` (`garden-height-fog.ts`, consumed by water, fleet, rim and sky) with `kasumi(d, h)`: a sum of two lobes, each `smoothstep(d0−w, d0, d)·(1−smoothstep(d0, d0+w, d))·exp(−max(h−h0,0)/hs)`.
     - Band A: d0 ≈ 110 u, w ≈ 35, h0 = 0, hs ≈ 1.8.
     - Band B: d0 ≈ 210 u, w ≈ 50, h0 = 0, hs ≈ 6.
  2. Colour is the hour's *horizon* colour lifted by 6 L*. Amplitude is clock-keyed: dawn 0.55, morning 0.35, noon 0.12, golden 0.3, blue 0.4, night 0.15.
  3. Distance is measured from the camera, so the bands are aerial perspective, not places.
- **Displaces:** The uniform distance haze at those depths (lower base density to compensate). Quiets the far-fleet chroma.
- **Truth & a11y:** This is a treaty risk, because stale sources own "bounded low fog in their own water" (bible §Atmosphere). Kasumi must stay camera-distance-keyed, clock-owned and identical everywhere at a given depth, so it can never look like a local stale patch. Stale fog should keep a distinct cue: its local, bounded, slowly curling shape. No hull is removed and all are still pickable (the mist is fog, not occlusion). The ledger is unaffected. Reduced motion uses static bands.
- **Risks:** Counterfeiting stale fog if tuned too patchy; the data-truth lane must sign off. Near-hull sails in band A lose some identity at rest, which is acceptable only for hulls beyond d0 and never for hero ships.
- **Acceptance:** `#t=5.6` and `#t=12.25` at rest. Far anchorage waterlines dissolve while sail tops stay readable. The `--blur-audit` frame shows three distinct horizontal value planes. `wholemap-noon` (`cam=0,0,0.28`) shows the plate edge lost in band B.

### art-director-4 Dye the chain flags: nobori cloth in the palette, not brand billboards
- **Picture:** Each harbour flies a tall narrow nobori or fukinagashi in indigo, persimmon, rust or undyed hemp, with the chain's mark printed in the brand hue at about 45 % of the cloth. They read like shop banners in a Hiroshige street, not sponsor logos, and the sky belongs to the tower again.
- **Why:** Defect 7, plus the bible's own rule: "Derive supporting colours from the shared palette." The raw hexes (`garden-chain-flag.ts:190-202`) include Tron `#ff060a`, which out-reds vermillion. The 2026-09-05 enlargement (`decision-ledger.md:22`) made them the highest and most saturated shapes in `noon.png` and `selected-ship.png`.
- **Impact:** 4, relaxing. **Confidence:** H.
- **Cost:** S. **Perf:** 0 on every axis (same atlas).
- **How:**
  1. Map each chain to a palette field by nearest-hue from a 6-dye set derived from `HARBOR_PALETTE` (indigo, deep teal, persimmon, ochre, hemp, charcoal), with chroma ≤0.10.
  2. Paint the full logo mark in brand colour on that field, keeping the existing mark pipeline.
  3. Scale flag cloth to 0.6× and lower the hoist so the tip stays under the tower's third-tier line at rest.
  4. Portrait (nobori) aspect, 1:2.4.
- **Displaces:** The largest saturated planes in the upper frame.
- **Truth & a11y:** Identity is carried by the mark's shape and brand ink, with harbour name and chain in the DOM ledger. Colour was never the only carrier. The health reading stays on warehouse roofs (`garden-chain-flag.ts:174-179`).
- **Risks:** `dock-layout.test.ts` flag-size pins. Tiny marks on the far flags need a minimum 18 px mark at rest.
- **Acceptance:** `#t=12.25` at rest. No flag pixel exceeds the chroma of the vermillion torii. `#t=14&sel=ship.usdc-circle`: no flag larger than the selected hull's sail on screen.

### art-director-5 Reflections as pillars; a lighthouse that flashes
- **Picture:** At night each lit window lays a vertical, gently broken pillar down the black water under the tower, and the moon road is a column of scattered silver dashes. When the beam turns toward you, the lantern glass flares to one soft star for a heartbeat, then the beam is a feathered shaft again. This is the Kawase night lighthouse.
- **Why:** Defects 5 and 9. The hero reflection uses a single tap with isotropic distortion (`garden-water.ts:1155-1161`). Painted water reflections are vertically stretched and horizontally broken, and the current look is the reverse. The beam cone has a razor edge (`night-beacon.png`, frames 2–6).
- **Impact:** 4, stunning. **Confidence:** H.
- **Cost:** S–M. **Perf:** 0 draws, 0 textures. ΔGPU is [INFERENCE] about +0.1–0.2 ms @1x (4 taps, inside `heroMask` only), roughly 4× at DPR 2. The hero target is reused.
- **How:**
  1. Replace the offset with `heroUv.x += n.x*0.012; heroUv.y += n.y*0.003`, then average 4 taps at `heroUv + vec2(0, k·0.006·(1+rough))` for k = 0..3, weighted toward the source.
  2. Darken the reflection by 0.85 and desaturate it 15 %, except for emissive pixels (hero.a-weighted luminance > 1.5 keeps full strength).
  3. Beam (`garden-lighthouse.ts:1040-1060`): cross-profile alpha `pow(1−across,2.5)` and along-fade `1−smoothstep(0.35,1.0,vAlong)`.
  4. End-on: route `uScatter` into the lantern-glass emissive plus one screen-aligned 4-point star sprite on the existing beacon halo, instead of the cone disc.
- **Displaces:** The squiggle reflection look and the smudge disc.
- **Truth & a11y:** The beacon is the PSI channel and keeps its modulation (`garden-lighthouse.ts:361-366`). Under reduced motion the parked bearing (`BEAM_PARKED_BEARING`) shows no flash.
- **Risks:** `garden-lighthouse.test.ts:52-58` beam-envelope pins. Keep total night emissive within the ember budget.
- **Acceptance:** `#t=22`, rest view plus `night-beacon` motion sheet. No frame shows a grey disc, and reflections are vertical streaks at least 3× taller than wide.

### art-director-6 Water written in strokes: a mirror inlet and textured open sea
- **Picture:** The approach from the viewer to the tower is almost still. It holds a long, softly broken reflection and one or two slow horizontal glints. Texture gathers only where water moves (open reaches, around wakes, at shore edges), as Kawase draws water: large calm fields crossed by sparse horizontal marks.
- **Why:** Defect 8. The bible demands a continuous empty inlet that "must survive a blurred view", but the normal field is uniform (`garden-water.ts:726-745`) and the foreground is the busiest texture in the frame (HF 7.5, about 10× the sky).
- **Impact:** 4, relaxing. **Confidence:** M.
- **Cost:** M. **Perf:** 0 draws, 0 tris, **0 textures**. The texture census is at its 72/72 ceiling, so the inlet mask must be analytic (an ellipse) or live in a spare channel of the existing sea-region field (`garden-water.ts:97-135`), never a new texture. ΔGPU ≈0 [INFERENCE].
- **How:**
  1. Compute `calm = inletMask·(1−windGust)`. The inlet mask is an authored ellipse between the rest eye and the island, or a channel of the region field.
  2. Scale the normal amplitude by `mix(1.0, 0.18, calm)` and the tiling by `mix(1.0, 0.6, calm)`, and bias the second normal layer toward horizontal elongation (`vec2(0.06, 0.16)`).
  3. Raise hero reflection strength in calm areas by 1.4×.
- **Displaces:** The chevron carpet in the foreground.
- **Truth & a11y:** Water tint remains the risk-band reading. The calm mask modulates only surface roughness, never band colour, and the inlet is not a named analytical region (check `garden-sea-sign-siting.ts`). Reduced motion keeps the same static mirror.
- **Risks:** Calm water can make a risk band look calm. Keep roughness semantics for Danger Strait and warning waters (lead water, per the changelog), and apply the mask only inside Calm Anchorage or the inlet.
- **Acceptance:** `#t=12.25` at rest. Foreground-water HF energy ≤3.5 (currently 7.5), with the tower reflection legible as a vertical form.

### art-director-7 Niwaki shape grammar: one hand for pines, rocks and rim
- **Picture:** Black pines with dense, dark, horizontal cloud-pads on a bent trunk, in the silhouette you know from a hundred gardens. Rocks sit low, wet-dark at the waterline and moss-topped. No palm reads anywhere. The land speaks in horizontals (pads, eaves, stone courses), answered by one vertical, the tower.
- **Why:** Defect 12. Blob broadleaves and cylinder stations (`selected-ship.png` foreground) and pale faceted floating rocks (`noon.png` 1320–1568,820–840 and 1000–1060,940–960) are asset-pack shape languages, and they fight the Italianate hero. Studio Ghibli and Dorfromantik stay coherent because one shape grammar runs through everything.
- **Impact:** 4, stunning. **Confidence:** M.
- **Cost:** L. **Perf:** 0 draws (instanced); +5–15k tris for thicker pads; 0 textures.
- **How:**
  1. In `garden-flora.ts:66-69`, give pine pads flattened ellipsoids at 3–5 tiers with a horizontal aspect of 2.2:1 and pad value lerped 0.7 toward `timber_dark` (value about 20–25 at noon). Use an S-curved trunk made of 3 segments.
  2. Retire momiji and broadleaf blobs from the camera-side rim.
  3. Rocks: sink 30 %, add a waterline darkening band and a moss cap via vertex colour.
- **Displaces:** Blob trees and the palm-reading pads.
- **Truth & a11y:** None analytical; seasons (momiji and cherry) keep their clock role on the far rim.
- **Risks:** Triangle budget is shared with the fleet (D1). `garden-flora.test.ts` dimensions re-pin.
- **Acceptance:** `#t=12.25&cam=0,0,0.28` shows no palm silhouette on the rim. At rest, the island pines read as dark masses at 16 px blur.

### art-director-8 First light, last light: the crown catches the sun
- **Picture:** At dawn the tower's crown and the tips of the borrowed peaks glow rose-gold while the harbour below still lies in blue shadow. The warm line climbs the tower as the minutes pass, like watching light find a mountain from a ryokan window. At sunset it runs the other way.
- **Why:** The dawn (`dawn.png`) and blue (`blue.png`) frames light the tower evenly top to bottom. Height-gated warmth is the cheapest and most legible "time passing" cue in the reference set (Journey's sunrise, Kawase's dawn prints), and it gives the hero moment its narrative.
- **Impact:** 4, poetic. **Confidence:** M.
- **Cost:** S. **Perf:** 0 draws, 0 textures. ΔGPU is [INFERENCE] about +0.02 ms @1x (one smoothstep per lit fragment). It is uniform-driven, with no per-object JS.
- **How:**
  1. In the shared lighting patch, `keyWarm = smoothstep(hLine−4, hLine+4, worldY)`, with `hLine` driven by the clock. Dawn: 40 → 0 u over 05:00–06:15. Golden: 0 → 40 u over 18:30–19:30.
  2. Direct light gets `mix(coolKey, warmKey, keyWarm)`, and the horizon hills receive the same factor through their own height.
- **Displaces:** The uniform warm key at dawn and golden (subsumes part of `DAWN_GRADE.highlightTint`).
- **Truth & a11y:** Clock-owned illumination only. Reduced motion shows the same frame at the given hour.
- **Risks:** Height fog and kasumi (idea 3) must agree in colour. Station roofs above `hLine` could pop warm, so apply only above 18 u.
- **Acceptance:** `#t=5.6` shows the crown warm (hue 20–40°) and the base cool (hue 200–240°) in one frame, and the difference is visible in a two-frame sheet at 05:30 and 06:00.

### Hero moments (the shareable frames)
1. **"Evening glow at the Pharos"** (18:45). This is `blue-rethird.png` today, minus the Polygon flag and yellow dome in the foreground. It needs ideas 1, 4 and 5, plus kasumi band A to seat the fleet.
2. **"Moon road"** (22:00–02:30). Near-black water with one silver road, a beacon pillar reflection, and the lantern flash. It needs idea 5, the removal of the pale horizontal bands (defect 9) and the ember-inked chip (defect 11).
3. **"Morning kasumi"** (05:30–06:30). Mast tips and the tower crown above a mist band, with the crown lit rose. It needs ideas 3 and 8.
4. **"The arrival"** (any hour). One hull crosses the mirror inlet and leaves a long V-wake. It is the "event" the bible promises. It needs idea 6 plus the existing arrival beat and `garden-wakes.ts`.
5. **"Noon clarity"**. Deep cerulean sky, white tower, cloud shadows sliding across the water, Kawase's summer. It needs idea 2 (noon air) and idea 1.

## Subtractions
- **Daytime beacon smoke puffs** (defect 6). Delete them by day, or turn them into one ribbon.
- **The red pole marker's tall vertical** (`noon.png` 225–245,600–740), a second vermillion vertical echoing the tower. Shorten it to a low float of at most 1/3 its height.
- **Golden stick reeds standing in open water** (`noon.png` 255–485,740–850). They read as grass tufts floating at sea. Move them to shore edges or remove them.
- **Pale faceted floating rocks** (`noon.png` lower right). Sink and darken them, or remove them.
- **White foam puddles on open water** (`blue-rethird.png` 380–560,830–920).
- **Tilt-shift on selection postcards** (`selected-ship.png`). Use a clear sightline instead of blur.
- **`ship-wake-detail` 1 px hairlines**: the white scratches beside hulls (`noon.png` 940–960,795 and 1180–1215,770). According to LaneHeadroom they are 84 of 279 draws. They read as rendering scratches, not wakes. Delete them and keep the broad wake field, which frees about 84 draws and CPU submit time for 120 Hz.
- **The golden split-tone** (`garden-post.ts:136-139`) once the air colour carries temperature.

## Reversals
1. **Enlarged, brand-hex chain flags.**
   - *Source:* `decision-ledger.md:22` (2026-09-05, "enlarge … flags") and `:25` ("identity lives on rooftop flags"), implemented in `garden-chain-flag.ts:190-202`.
   - *Evidence:* `noon.png` top-left; the five-logo parade in `selected-ship.png`; Tron `#ff060a` against the vermillion primacy anchor.
   - *Argument:* Identity is the mark's shape. The field colour is decoration that breaks the bible's own palette rule and hits the crypto-badge anti-reference.
   - *Risk:* Harbours become slightly slower to identify from far away. The DOM ledger and the mark still identify them.
2. **"Closer rest is better".**
   - *Source:* The 2026-09-06 rest decision (`decision-ledger.md:24`), encoded as `score = zoom + …` in `camera.ts:177`.
   - *Evidence:* The ceiling rest (1.15) and centred tower in `noon.png` and `compact-1200x640.png`, against the right-third tests.
   - *Argument:* The 2026-09-06 fix cured "too small", but the optimiser now overshoots into a monument portrait. Composition must be the objective, with zoom as a soft preference.
   - *Risk:* Fleet readability at rest drops slightly (about 10 % smaller hulls). It is recoverable by selection.
3. **The no-backlight sun arc.**
   - *Source:* `garden-sun.ts:37-47`.
   - *Evidence:* Its rationale cites "a LOCKED isometric camera", but the camera is now a 32° perspective rig (`projection.ts:4-27`, D3). No frame in the set shows the tower as a silhouette against a lit sky, which is the single most iconic "lighthouse at sunset" image in every reference.
   - *Argument:* Swing the key toward contre-jour only in the last 30–40 minutes before sunset. Rim-light the tower and let its shadow run toward the viewer, with sails glowing through (cloth transmission). This is the "golden rakes" beat taken to its conclusion.
   - *Risk:* Identity sails darken for about 30 minutes a day (mitigated by translucency and the DOM). The shadow-camera fit must be re-checked. Confidence M; the operator decides.

The §6 rejection of toon, ink and paper-grain filters is **not** reversed. The shin-hanga direction is explicitly authored light, air and composition, not a post filter.

## Cross-lane dependencies
- **Camera and composition:** owns idea 1 and the solver tests. It must keep the nearFlagBand and station clearance, because my manual test cameras show what happens without them. **LaneGardenMaster** proposes the engawa seat as the rest shot (`outputs/opus-review/garden-master/threshold-blue.png`, `cam=1404.8,-695.2,0.9`). That is compatible with idea 1 and I endorse it as the pose the aim-first score should land on: tower on the right third, garden foreground, a pine crossing near-left. Their frame shows the same two leftovers mine do: the Polygon flag and the yellow dome cylinder at the right edge, and the saturated rooftop flags upper-left. Idea 4 and a station-clearance term are what make that seat shippable.
- **Sky, atmosphere and post:** ideas 2, 3 and 8 share the height-fog function and grade presets, so one owner should land them together. Otherwise kasumi, colour script and alpenglow will fight over horizon colour.
- **Data truth / DOM:** must rule on the kasumi-versus-stale-fog treaty (idea 3) and sign off on flag identity (idea 4).
- **Water:** ideas 5 and 6. The calm mask must not flatten risk-band roughness semantics. Reconcile with any lane proposing new reflection or refraction passes, since idea 5 reuses the existing hero target.
- **Lighthouse and beacon:** defects 5 and 6.
- **Garden, flora and rim:** ideas 1 (the bough) and 7. The triangle budget is shared with the fleet.
- **Fleet:** needs a distance chroma falloff on sails that is consistent with kasumi. Hero ships are exempt.
- **UI/HUD:** night ember ink for the arrival chip (defect 11). Keep the serif caption; "12:15 — a quiet noon · readings current" is the most poetic element on screen today.
- **Rendering headroom:** per LaneHeadroom, every ms figure here is an analytic [INFERENCE] at 1600×1000@1x and roughly 4× at the operator's DPR 2 / 120 Hz. The per-pass `gpu` line is not additive, so I cite none. The ALU total for ideas 3, 5 and 8 is roughly 0.2–0.4 ms @1x. No idea adds a texture (the census is at 72/72) or a fleet vertex attribute (at the 16 cap), and idea 7's pads are instanced geometry only.
