# Water surface, reflection & shoreline contact — water

## Verdict
The sea is **a painted floor that ignores its sky**. In `golden.png` the sky is amber (L\*72, rgb 231/163/102) and the water under it is slate blue (L\*21, rgb 38/51/62). In `blue.png` the sky is mauve and the sea is a saturated royal navy (L\*10, rgb 14/25/57). The shader builds colour from a band ramp plus a region dye and lets the sky in as a minority mix. Four things keep the sky out:
- the probe is scaled by the scene's IBL intensity (0.45 at golden);
- the Fresnel mix is capped at 0.55;
- the gains were tuned for the old orthographic rig;
- the near field is multiplied by 0.55 after the sky mix.

The camera is now a 4–12° perspective, so the water sits at grazing angles and should read mostly as mirrored sky. The best water in the whole evidence set is `water/golden-inlet-motion-frames/07.png`: a glassy moment with a clean tower reflection and vertical window streaks. The leap is to make that the default: sky-dosed Fresnel, reflections that streak rather than squiggle, and risk carried by the **state of the surface** (glass → leaden chop) rather than by mint and khaki dye.

## What I looked at
- **Baseline frames:** `noon.png`, `golden.png`, `blue.png`, `night.png`, `deep-night.png`, `dawn.png`, `reduced-noon.png`, `noon-1440p.png`, `wholemap-noon.png`, `wholemap-dusk.png`, and `golden.txt` (metrics).
- **My captures and crops** (`outputs/opus-review/water/`):
  - `golden-inlet-motion.png` plus 9 frames. This is the full-tier retry; the first run came back `constrained` and was discarded.
  - `noon-close.png` (`#t=12.25&cam=0,-10,1.6`). It landed on the far plate edge and shows the straight plate/annulus seam.
  - Crops of the baseline frames: `crop-{noon,golden,night}-inlet.png`, `crop-noon-right.png`, `crop-golden-left.png`, `crop-blue-pier.png`, `crop-night-band.png`.
  - `_accidental/` is one mistaken default run of the motion-sheet tool; ignore it.
- **Luminance** (mean L\*, measured with a PIL script on the baseline PNGs):

  | Region | Measured L\* | Bible target |
  | --- | --- | --- |
  | Noon bottom-centre approach | 26 | 38 |
  | Noon calm body, left-mid | 39 | 27 (grove cell) |
  | Reduced-motion calm body | 52 | 27 (grove cell) |
  | Night band vs. water beside it | 16.5 vs 4.9 | — |

- **`src/three/garden-water.ts`:**
  - fragment shader `:543-1461`, in particular probe `:665-683`, normals `:724-770`, depth/Beer `:839-896`, Fresnel `:932-980`, shore `:982-1017`, region block `:1045-1146`, hero composite `:1147-1163`, moon/sun roads `:1171-1229`, sun glitter `:1231-1247`, beacon/caustics/foam rings/lanes `:1270-1401`, value gain/alpha/fog `:1404-1444`;
  - phase uniforms `:2011-2151`.
- **Reflection:** `garden-hero-reflection-pass.ts` (whole file) and the reflection-layer membership at `world-renderer.ts:3298-3308`.
- **Supporting code:**
  - `garden-water-contract.ts:56-116`
  - `garden-sea-regions.ts:265-344` (character table)
  - `garden-environment.ts:134-136` (IBL intensity)
  - `garden-sun.ts:67-76` (moon pose)
  - `projection.ts:4-27` (32° FOV, 4–12° pitch)
  - `garden-wakes.ts` (512² RGBA wake field)
  - `garden-zones.ts:52-108`
  - headers of `garden-tide-line.ts`, `garden-tide-stain.ts` and `garden-sea-edges.ts`
  - the 256² normal texture `public/pharosville/textures/water-normals.png`
- **History:** `agents/pharosville-reborn/reviews/water.md`, the decision ledger, and the Reborn plan D3/D5/W1.15/W2.7–2.9/§6.

## Spell-breakers (defects)
1. **Golden hour and blue hour water refuses the sky.**
   - **Where:** `golden.png` right water and `blue.png` right water (hue ~215–225° under a sky at ~30° / ~10°); `wholemap-dusk.png`, where a petrol-blue annulus meets an orange horizon.
   - **Causes:**
     - The probe is multiplied by `renderScene.environmentIntensity`: 0.6 day, 0.45 golden, 0.3 blue (`garden-water.ts:677`, `garden-environment.ts:134-136`).
     - The Fresnel mix is `F·refl·(0.40+0.45·daylight)` capped at 0.55 (`:967-974`). The comment still cites "this fixed ortho rig… 35.3 degree view" (`:932-943`), which D3 made false.
     - Near water is then multiplied by 0.55 (`dayValueGain`, `:1407-1409`), which darkens the reflection itself.
   - **Why it breaks the calm:** the golden hour stops at the shoreline, so the sea reads as a separate blue object.
   - **Fix:** water-1. **Cost:** S–M.
2. **Tower-window reflections are squiggle glyphs.**
   - **Where:** `night.png` / `deep-night.png` lower centre shows a 3×5 grid of bright orange "S/~" worms; also `golden-inlet-motion-frames/02.png`.
   - **Cause:** the reflection UV is displaced isotropically by `surfaceNormal.xy * 0.008` (`:1157`). The render target has no blur and no mips (`garden-hero-reflection-pass.ts:72-77`), and the emissive windows go in at up to 85% (`:1161`).
   - **Why it breaks the calm:** it reads as calligraphy or fireflies, not as light on water, and it is the second-brightest thing in the night frame.
   - **Fix:** water-2. **Cost:** S.
3. **The night "moon road" is a milky searchlight smear through the island.**
   - **Where:** `night.png` band left (y≈740–790) and right (y≈640–700); `crop-night-band.png`; also at blue hour around the pier.
   - **Cause:** `roadReach = 1 - smoothstep(26,140,abs(roadAlong))` (`:1178`) makes a world-fixed, **two-sided** gaussian band through the island centre along the moon azimuth. The moon itself sits ~113° off the view axis at 52° up (`garden-sun.ts:75-76`) and is never on screen.
   - **Why it breaks the calm:** a physically impossible light, 3.4× brighter than the water beside it.
   - **Fix:** delete it; see water-4. **Cost:** S.
4. **The calm body is a swimming pool / linoleum plate.**
   - **Where:** `reduced-noon.png` left-mid (mint, L\*52, hard diagonal edge); `noon.png` left; `crop-golden-left.png` (flat khaki 81/71/56, and not one ship or mast reflected).
   - **Cause:** calm uses `tintStrength 0.62`, `depth 1.22` and `normalDetail 0.05` (`garden-sea-regions.ts:279-285`). On top of that the shader flattens normals by 0.9 (`:762`) and samples the probe at roughness 0.21 (`garden-water-contract.ts:63`). The result is a mirror with nothing in it: a uniform flat colour.
   - **Why it breaks the calm:** the region that should be the garden's still pond is the least water-like surface in the frame.
   - **Fix:** water-3. **Cost:** S.
5. **Brush-stroke normal tiling.**
   - **Where:** `noon.png` / `noon-1440p.png` foreground (repeating dark elongated blobs, each larger than a ship); `wholemap-noon.png` annulus (fabric-like repeating flecks).
   - **Cause:** one 256² texture made of 3–4 diagonal streaks per tile, sampled at 18 u / 9 u open (`:726,730`) and 31×13 u stretched in the regions (`:738`). The Gerstner normal is added ×18 (`:769`).
   - **Fix:** water-5. **Cost:** S–M.
6. **Contour-line foam rings and a cyan shore halo after dark.**
   - **Where:** `blue.png` / `night.png` around the right pier; `crop-blue-pier.png` shows crisp white offset contour lines hugging the coast.
   - **Cause:** `foamRings = aaStep(0.86, sin(shoreWorld*3.2 - t*0.5))` (`:1314-1324`), which is hard-edged and has only a 0.6 day floor. The `lapFoam` sine bands `sin(shoreField*440…)` (`:988-996`) draw a topographic map.
   - **Why it breaks the calm:** the night should be all embers; these are neon outlines.
   - **Fix:** water-8 / Subtractions. **Cost:** S.
7. **The world edge is a cardboard slab.**
   - **Where:** `wholemap-noon.png` / `wholemap-dusk.png`: the outer sea runs straight into vertical plate sides with no shelf, foam or wet band. `noon-close.png`: a straight ruled seam between the flat in-plate body and the textured annulus.
   - **Cause:** the annulus forces `shoreField = 1.0` (`:840`), so it has no coast.
   - **Fix:** water-6. **Cost:** S–M.
8. **The tower reflection is not the tower's colour.** It is rendered with the shadow map disabled (`garden-hero-reflection-pass.ts:125`), so the reflected stone and pines come out brighter and greener than the lit originals (`crop-noon-inlet.png`: pine pads read as bright green lily-pads). **Fix:** part of water-2.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### ★ water-1 Let the sky into the water: Fresnel dosed for the real camera
- **Picture:**
  - At golden hour the far plate turns to molten amber and apricot, deepening to cold teal-umber at your feet.
  - At blue hour the whole inlet is a violet-mauve mirror with the tower standing in it.
  - At noon, silver-blue sheets near the horizon give way to deep green-blue near.
  - The sea finally belongs to the same hour as the sky.
- **Why:** Spell-breaker 1. The rest rig looks 4–12° down (`projection.ts:14-27`). At viewing distances of 60–200 u from an eye ~20 u up, Schlick gives F≈0.17–0.64, so physically the water *is* mostly sky. The shader keeps ≤55% of a sky that has already been dimmed to 45%.
- **Impact:** stunning 5, poetic 5, relaxing 4. **Confidence:** H.
- **Cost:** S–M. **Perf:** 0 draws, 0 tris, ~0 ms, 0 textures.
- **How** (all in `garden-water.ts`):
  - (a) Stop scaling the probe by the IBL intensity. `gardenEnvironmentReflection` multiplies by a new `uSkyRadiance` (≈1.0 day and golden, 0.85 blue, 0.5 night) instead of `uEnvironmentIntensity` (`:677`).
  - (b) Fresnel becomes `mix(body, sky, clamp(F·seaReflectivity, 0, 0.92))` with F0 0.02. Delete the `(0.40+0.45·daylight)` gain and the 0.55 cap (`:969-974`), keeping the glint filter on the normal (`:962-966`). Delete the second `envMask·uEnvStrength` sheen mix (`:976-980`), which it supersedes.
  - (c) Delete `dayValueGain` (`:1407-1409`). The value plan's darker bottom-centre now comes from lower Fresnel at steeper angles plus a darker **transmitted** body. The band ramp becomes a low-chroma absorption colour per phase (`DAY_DEEP`/`DUSK_*`/`NIGHT_*` `:400-422`, lowered to L\*≈18 day / 12 dusk / 3 night and chroma ≤0.04).
  - (d) Probe roughness grows with distance and normal variance: `roughness = mix(0.12, 0.35, glintFilter)`. It stays one `textureCubeUV` call.
  - (e) The 5-beat light score should reach the water: feed `uSkyRadiance` from the beats rather than the 3-phase `dayCyclePhase` (`:2014`).
- **Displaces:** the band-ramp colour as the main voice, the env-sheen second mix, and `dayValueGain`. Re-pin the Fresnel gain tests in `garden-water.test.ts`.
- **Truth & a11y:** no semantic change. Risk separation moves to water-3 so that hue is no longer depended on. The reduced-motion still keeps the same static reflection.
- **Risks:**
  - The noon plate could go milky if the probe horizon is pale; the Sky lane's darker sea-horizon (see Cross-lane) is the guard.
  - Bloom knee: the midday sky mirror must stay below the knee (cap sky L at ≈0.85 before tonemapping).
  - The night budget is unchanged because this is a mix, not an add, but `uSkyRadiance` at night must stay ≤0.5.
- **Acceptance:** `#t=17.6` at 1600×1000. The water right-mid hue must lie within 35° of the sky-horizon hue, with L\* 30±5 mid and 25±5 bottom-centre. `#t=18.8`: the water reads violet, not royal blue. `#t=12.25` bottom-centre: L\* 38±5.

### ★ water-2 One broken reflection: streaks, not squiggles
- **Picture:**
  - The tower hangs inverted in the inlet: sharp at the waterline, then softening and stretching downward into vertical strokes, as in a Hiroshige night print.
  - At night each lit window becomes a long amber drip, 3–5 window-heights tall, trembling slowly.
  - The rock foot meets its own inverted foot, so the island stands *in* the water.
- **Why:**
  - Spell-breakers 2 and 8.
  - `golden-inlet-motion-frames/07.png` proves the target: the glassy moment already reads beautifully (vertical windows, masonry, dark water). The broken frames (`02.png`) turn into glyphs because the displacement is isotropic and there is no blur.
  - [INFERENCE] frames 07–08 are probably a transient load-tier `uDetail` dip; either way, lower inlet normal strength is visibly better.
- **Impact:** stunning 5, poetic 5, relaxing 4. **Confidence:** H.
- **Cost:** S–M. **Perf:** 0–1 draws (rock plinth onto layer 7), +1–4k tris, ~0.05–0.1 ms for mip generation on the half-res render target, 0 textures.
- **How:**
  - (a) In `garden-hero-reflection-pass.ts:72-77`, set `generateMipmaps: true` with `LinearMipmapLinearFilter`.
  - (b) In `garden-water.ts:1155-1162`:
    - compute `below` = reflected distance from the contact line;
    - displace along reflected screen-v only: `heroUv.y += (n.x*0.5+n.y)*0.006*(0.4+below)`, with horizontal ≤0.15× of that;
    - sample with LOD `mix(0, 3.5, smoothstep(0, 18u, below))` plus a 3-tap vertical kernel spaced `0.003·(1+2·below)`.
  - (c) Weight = `F·seaReflectivity·(1-roughness)`, peaking ≈0.7 at contact, instead of `clamp(heroMask·a, 0, 0.85)`.
  - (d) Soft-knee the reflected radiance (`hero/(1+maxc(hero)·0.8)`) so windows become embers.
  - (e) Multiply the reflected colour by 0.8 to compensate for rendering without shadows.
  - (f) Add the island cliff/plinth to `GARDEN_HERO_REFLECTION_LAYER` (`world-renderer.ts:3298-3308`).
  - (g) Fade the mask by reflected-UV edge distance so no rectangle ever shows.
  - (h) In the inlet (`harborCalm`), lower the normal amplitude ×0.5 (`:769`) so the glassy look of frame 07 is the norm, not a glitch.
- **Displaces:** squiggle glyphs and the saturated pine "lily-pads". The beacon-column vocabulary is already gone.
- **Truth & a11y:** decorative. Reduced motion keeps its single rendered frame (`:100`), now blurred rather than rippled.
- **Risks:** mip bleed of the transparent clear (alpha 0) at the silhouette edges; premultiply before mipping. Reflection-alignment acceptance (W6.5) must be re-run at 3 poses.
- **Acceptance:** motion sheet `#t=22 --clip 520,640,720,360`, 9 frames. No closed curls; every window reflection is a vertical stroke at least 3× its source height; the tower base meets the inverted base at the waterline. `#t=17.6` at rest: the reflection is darker than the tower face (ΔL\* ≥ 8).

### ★ water-3 Risk is the weather on the water, not the dye in it
- **Picture:**
  - Calm water is glass: sky and tower reflected cleanly, a few slow rings.
  - Watch water carries long cat's-paw ripples. Alert water is streaked with current. Warning is short broken chop.
  - Danger is leaden, matte and rain-pocked, and reflects nothing.
  - You read the market the way a sailor reads a bay: from the texture of the surface. It is beautiful in every band because none of them is paint.
- **Why:**
  - Spell-breaker 4.
  - Dye at `tintStrength` 0.62–0.70 (`garden-sea-regions.ts:279-325`), luma-matched then multiplied by `depth` (`garden-water.ts:1051-1056`), makes pool mint (calm), khaki (alert) and sand (warning) plates with hard diagonal edges.
  - Surface roughness and reflection clarity are the most legible non-colour carrier water has, and the character table already authors swell, chop and reflectivity. They are simply overpowered by dye.
- **Impact:** stunning 4, poetic 5, relaxing 5. **Confidence:** M-H.
- **Cost:** S–M. **Perf:** 0 draws, ~0 ms (same probe fetch at a region-dependent roughness), 0 textures.
- **How:**
  - Add `probeRoughness` to `SeaRegionCharacter`: calm 0.06, ledger 0.08, watch 0.16, alert 0.26, warning 0.34, danger 0.55, wreck 0.30. Pack it into the unused lanes of `uRegionFlow`/`uRegionBoundary` rather than adding a uniform array.
  - Feed it to `gardenEnvironmentReflection` and to the hero-reflection LOD from water-2.
  - Cut `tintStrength` to 0.15–0.25 for every band.
  - Calm `depth` 1.22 → 0.95; danger keeps 0.44 so the value ladder survives.
  - Calm keeps its `normalDetail` 0.05 but now has an image to hold.
  - Replace straight region seams with 6–10 u noise-warped "slick edges": a thin line of fine glint where glass meets ripple (boundary block `:1091-1126`, driven by the existing `boundaryBand`).
  - Danger's screen-space rain (`:1068-1083`) becomes world-space pocks (see Subtractions).
- **Displaces:** hue as the primary risk carrier, `SEA_GAMUT_ANCHOR` dye pull (`garden-zones.ts:108`), and hard seam foam.
- **Truth & a11y:**
  - Same coarse reading of seven bodies. DOM parity is unchanged: the sea-sign inspection plus the ledger's named waters and exact bands.
  - Colour becomes a *secondary* carrier, which improves the "colour is never the only carrier" rule.
  - Reduced motion: roughness and reflection clarity survive in the static frame. Glass vs matte needs no motion.
- **Risks:** without the dye, bands may separate less at whole-map zoom. Measure the ΔL\* between calm and danger at `cam=0,0,0.28` (target ≥12). This pairs with LanePrintmaker's engraved crest lines as the texture carrier on watch→danger.
- **Acceptance:** `--reduced #t=12.25`. There is no mint plate; calm shows the reflected masts and sky gradient; danger reads dark and matte. Blind-sort test: the seven bodies can be ordered in a greyscale version of `wholemap-noon`.

### water-4 View-dependent roads: the moon (and low sun) leads to you
- **Picture:** A low moon in the upper-left sky lays a trembling path of broken silver slats down the empty inlet straight to the viewer. On the beacon's side the only other light is the sweep, so the night has exactly the bible's two lights.
- **Why:**
  - Spell-breaker 3.
  - The sun road is island-anchored too (`:1203-1213`).
  - Sun glitter uses the orthographic half-vector `normalize(sunDir + vec3(0,0,1))` (`:1232-1233`), so no glint path ever aligns with the viewer.
  - The bible's "secondary light: the moon road" cannot exist while the moon is behind the camera (`garden-sun.ts:75-76`).
- **Impact:** poetic 5, stunning 4. **Confidence:** M (needs the Sky lane).
- **Cost:** S (water side). **Perf:** 0 draws, ~0 ms.
- **How:**
  - Delete `:1171-1184` and `:1202-1213`.
  - Compute `H = normalize(L + V)` with the real per-fragment view vector (`viewDirection`, as the Fresnel term already does) for both moon and sun.
  - Lobe: `pow(dot(glintNormal,H), 60–120)` gated by a high-frequency sparkle from the smallest normal scale of water-5. This replaces the sine lattice `:1191-1194` / `:1235-1238`, which draws a regular grid.
  - The road forms automatically as a vertical column under the luminary and vanishes when it is out of view.
  - Re-derive `moonRoadOccupancy` in `garden-water-contract.ts:96-109` (a column of ~0.03–0.05 of open water at gain ≈0.2) so the 0.016 mean holds.
- **Displaces:** the two-sided moon band, the world-fixed sun band and the lattice glitter.
- **Truth & a11y:** decorative; wall clock and pose only. Reduced motion gives a static road.
- **Risks:** it depends on LaneSky moving the moon into frame at ~15–25° elevation. Otherwise night loses its second light entirely, which is still more truthful than the current smear.
- **Acceptance:** `#t=22` and `#t=2.5`. One vertical silver path under a visible moon, with no band crossing behind the island. Open-night budget test green.

### water-5 Anti-tile surface: three scales, wind slicks, no brush strokes
- **Picture:** Near water carries fine, crisp ripples smaller than a hull. Mid water shows long soft swells. Across the bay, glassy wind-slick bands drift slowly between rippled patches, which is the calm, breathing Japanese-pond look. There is no pattern the eye can find twice.
- **Why:** Spell-breaker 5. The streak texture's scale (9–31 u) is larger than the ships (2–5 u), so the foreground reads as a tiled plate.
- **Impact:** stunning 4, relaxing 5. **Confidence:** H.
- **Cost:** S–M. **Perf:** +1 texture fetch (3 vs 2), ~0.05 ms at 1600×1000@1x, roughly 4× that on the operator's DPR-2 display [INFERENCE]; 0 draws. Optionally replace the texture with a 512² isotropic tileable normal (+0.75 MB) as a same-slot swap only: the whole-map census is at 72/72 textures (LaneHeadroom), so no net-new texture is allowed.
- **How:**
  - Sample the normal map at λ ≈ 5 u, 14 u and 41 u with rotations 0 / 2.3 / −1.1 rad and non-commensurate scroll vectors (`:724-752`).
  - Weight each octave by `1 - smoothstep(k·λ·8, k·λ·30, camDistance)` so no octave outlives its pixel footprint.
  - Macro "slick" mask: `smoothstep(0.55, 0.75, gardenFbm(pos/90 + wind·t·0.004))` flattens normals ×0.15 on ~30% of the open plate and drifts at ~1 u/min.
  - Cut the Gerstner normal gain `18.0` (`:769`) to ~8 near the camera.
- **Displaces:** the brush-stroke read and the uniform all-over chop.
- **Truth & a11y:** slicks are masked out of watch→danger (their character must stay truthful) and allowed on calm, open and ledger. Reduced motion freezes the slicks in place.
- **Risks:** the Schlick banding reported 2026-09-07 is guarded by the existing glint filter; keep it.
- **Acceptance:** `#t=12.25` foreground crop: no repeat within 400 px. `wholemap-noon`: no grid visible in the annulus.

### water-6 The coast of the world: the annulus gets a shore; the plate seam disappears
- **Picture:** From the whole-map view the harbour sits in the sea like an island, with a pale shelf, a darker wet foot and a slow lace of foam around its outer cliffs. It no longer reads as a board game on a tablecloth. The inner and outer waters meet invisibly.
- **Why:** Spell-breaker 7. `shoreField` is forced to 1.0 in the annulus (`:840`), yet `gardenPlateEdgeDistance` (`SEA_EDGE_GLSL :304-320`) already gives an exact SDF. The in-plate/annulus seam in `noon-close.png` is a normal and colour discontinuity across the 8 u crossfade (`:1413-1417`).
- **Impact:** stunning 3, relaxing 3 (whole-map / attract framings). **Confidence:** H.
- **Cost:** S. **Perf:** 0 draws, ~0 ms.
- **How:**
  - In the annulus, `shoreField = max(0, -gardenPlateEdgeDistance)/SHORE_SCALE` feeds the same shelf, wet-band and lap-foam path (`:982-1017`).
  - The annulus uses the identical normal stack and Fresnel as the plate edge within 30 u.
  - Widen `SEA_EDGE_CROSSFADE` from 8 to 20.
- **Displaces:** the bare vertical slab edge.
- **Truth & a11y:** none.
- **Risks:** the plate rectangle is not the coast where the harbour mouth opens. Mask by the terrain field at the mouth so no foam line crosses open water.
- **Acceptance:** `#t=12.25&cam=0,0,0.28`. A continuous shelf and foam at the outer coast; no straight seam at the far mouth.

### water-7 Hulls that touch the water: contact darkness and inverted keels from the wake field
- **Picture:** Every near boat sits in a small dark pool of its own reflection: an inverted keel shadow stretching a few units toward you, trembling slightly. The fleet stops floating above the sea like stickers (`noon.png`, `golden.png` foreground: no hull has any reflection).
- **Why:** The reflection pass is limited to the island (`world-renderer.ts:3298-3308`), and duplicating the fleet there costs 13–19 draws and ~100k triangles. The 512² RGBA wake field (`garden-wakes.ts:59, 229-233`) uses only R.
- **Impact:** stunning 3, relaxing 3. **Confidence:** M.
- **Cost:** M. **Perf:** 0 new draws (reuses the one instanced stamp draw) and 0 textures (G channel of the existing RGBA target). The field stays awake instead of sleeping: two 512² passes, ~0.1 ms [INFERENCE], plus stamp buffer writes for ~184 ships each frame. The CPU at ~11 µs/draw is the binding cost at 120 Hz, but this adds no draws; the pose loop already exists.
- **How:**
  - Every visible ship in the wake window (≤184 < `WAKE_MAX_STAMPS` 320) stamps a hull-footprint ellipse into **G**.
  - The feedback pass clears G each frame (no decay).
  - The water shader takes 3 taps of G along the view-reflection direction (offsets 0, 1.2, 2.4 u, scaled by hull length and 1/tan of the local elevation). It darkens and de-reflects: `water *= 1 - 0.35·occ`, and sky reflection ×(1-occ).
  - The fleet lane passes hull length and underway/moored status, which are already in the stamp params.
- **Displaces:** the need for per-ship reflection geometry and the white hull-collar rings seen at night (fleet lane; see Cross-lane).
- **Truth & a11y:** decorative. Reduced motion takes one stamp pass, then freezes.
- **Risks:** the wake window (72–220 u half-size) does not cover the far fleet; that is acceptable, since far hulls are silhouettes. Keeping the field awake removes the current idle sleep saving.
- **Acceptance:** `#t=12.25` foreground crop. Each near hull has a dark reflection under it, darker than the surrounding water by ΔL\* ≥ 6.

### water-8 Shore that breathes once: one lap line, a real wet foot, shallow transmission
- **Picture:** Where the island rock meets the sea there is a dark wet foot, a band of clear green-gold shallows over the shelf, and one soft line of foam that slides up and back every ~10 s. It is the only motion at the coast, and after dark it fades to almost nothing.
- **Why:**
  - `crop-noon-inlet.png` shows a pale dry rock foot meeting the water.
  - The wet band is only ×0.76 over 0.006–0.035 field units (`:984-985`).
  - `lapFoam` and `foamRings` draw multi-line contours (Spell-breaker 6).
  - The seabed tint mix is 0.28·transmittance (`:890-896`).
- **Impact:** relaxing 4, poetic 3. **Confidence:** H.
- **Cost:** S. **Perf:** 0 draws, slightly cheaper (two sines removed).
- **How:**
  - Delete `lapFoam` (`:987-996`) and `foamRings` (`:1314-1324`).
  - Keep one `shoreEdge` line with breath period 9–12 s (the `GARDEN_WATER_SHORE_FOAM.breathAmplitude` 0.003 → 0.008 path) and daylight gating ×(0.05 + 0.95·daylight).
  - Wet band ×0.55 over ~1.2 u.
  - Shallow transmission: `mix(body, seabed(sand·0.6 + moss·0.4), exp(-depth·6)·0.45·daylight)`.
  - Caustics stay at the shore-field gate (`:1296-1311`), full tier only.
- **Displaces:** contour rings, lap-sine bands and the cyan night halo.
- **Truth & a11y:** the tide line/stain (`garden-tide-line.ts`, `garden-tide-stain.ts`) is masonry and untouched. The wet-band darkening must stay visually distinct from the tide-line strandline on the quay walls, so apply it on the water side only.
- **Risks:** negligible.
- **Acceptance:** `#t=22` pier crop (`crop-blue-pier.png` region): no white contour lines. `#t=12.25` island foot: dark wet foot and green shallows visible.

## Subtractions
- **Two-sided moon band** `garden-water.ts:1173-1184`. Delete now, even before water-4; the night is better with no road than with this one.
- **`foamRings` contours** `:1314-1324` and **`lapFoam` sine bands** `:987-996`.
- **`dayValueGain`** `:1407-1409`. A value fix applied after the reflection is a grade in disguise; the bible says atmosphere before grade.
- **Env-sheen double mix** `:976-980` and the region `regionReflect` sheen `:1085-1089`. Both are redundant once Fresnel is honest.
- **Sparkle sine lattices** `:1191-1194`, `:1235-1238`. Regular grids of glints; replace them with a noise-gated fine normal.
- **Danger's screen-space rain** `:1068-1083` (`gl_FragCoord`). It is fixed to the glass and slides against the world when the camera breathes. [INFERENCE: not visible in the baseline frames because danger is off the rest frame.]
- **`tonalCurrent` world sine stripe** `:882-885`. It adds a regular band for no reading.

## Reversals
- **Fresnel "conservative 0.40 base, 0.55 cap"** (T1.2, comment `:932-943`, pinned in `garden-water.test.ts`).
  - Evidence: the comment's own premise, "fixed ortho rig… 35.3°", was reversed by Reborn D3 (perspective at 4–12° pitch).
  - Measured: `golden.png` water L\*21 and hue ~215° under an L\*72 amber sky.
  - Argument: at grazing angles the physically correct answer *is* the sky. The cap was tuned for a camera that no longer exists.
  - Risk: noon milkiness; guarded by LaneSky's darker sea-horizon and the bloom-knee cap.
- **Water as a dyed risk map** (R5 / `SEA_GAMUT_ANCHOR` in `garden-zones.ts:96-108`; `tintStrength` 0.62–0.70).
  - Evidence: `reduced-noon.png` mint pool (L\*52 in the bible's L\*27 cell); `crop-golden-left.png` khaki linoleum.
  - Argument: the bible's reading ("water is risk band") stays; the carrier moves from hue to surface state, which is also stronger on "colour never the only carrier".
  - Risk: separation at whole-map zoom must be re-measured.
- **Moon pose** `garden-sun.ts:75-76` (azimuth 0.62π, elevation 52°).
  - Evidence: no moon on screen in `night.png` / `deep-night.png`, so the bible's secondary light is geometrically impossible.
  - Owner: LaneSky, who proposes moving it into frame. The water follows.
- **Reflection layer = tower + precinct only** (D5 / W1.15 scope). Not reversed. Instead I extend the effect to hulls through the wake field (water-7) at 0 draws, which respects the "no full-scene planar" rejection.

## Cross-lane dependencies
- **LaneSky:**
  - water-4 needs the moon (and low sun) inside the view window, with the moon direction read from `garden-sun`.
  - water-1 relies on their darker sea-horizon (`garden-sky.ts:381-382` reversal). The annulus fog / `horizonFade` (`garden-water.ts:1429-1436`) must not overwrite the reflection with fog colour. This is a joint seam; Main should assign one owner.
- **LanePrintmaker:**
  - Engraved crest lines on `signatureTone` (`:772-798`) pair with water-3 as the texture carrier for watch→danger. Calm and ledger stay blank glass.
  - Their view-dependent moon slats = water-4. It is the same fix; there must be one implementation.
- **LaneLight / Headroom:**
  - `uSkyRadiance` per beat (water-1e) should come from the five-beat score.
  - Headroom should sanity-check the always-awake wake field (water-7, ~0.1 ms) and render-target mips (water-2).
  - Baseline for context, from `golden.txt`: 287 draws, 380k tris, 51 textures. Per LaneHeadroom, the per-pass `gpu` ms line is not additive on ANGLE Metal, so budget from draws/tris/textures. Also, 84 of the ~279 draws are `ship-wake-detail` 1 px GL_LINES, the white hairline scratches beside hulls (`noon.png` near hulls; `crop-night-band.png`). They read as scratches on the water. Recommend the fleet/wake owner retire them in favour of the existing wake field's foam, which is −84 draws and the single largest draw saving available.
- **Fleet lane:**
  - water-7 needs hull length and moored/underway status on the stamp call (already in `stamp()` params).
  - The white glowing hull-waterline collars at night (`crop-night-band.png`: bright ring around the near hull bases) break the ember rule. water-7's contact darkness replaces them visually.
- **LanePharos / Island:** water-2 adds the cliff plinth to `GARDEN_HERO_REFLECTION_LAYER`. The rock-foot wet band (water-8) must meet their mesh at the waterline.
- **LaneDataPoetry / UI:** water-3 changes the risk carrier. The ledger and the sea-sign copy should describe water "state" (glass, ripple, chop, leaden) alongside the band name, so the new visual vocabulary has DOM words.
