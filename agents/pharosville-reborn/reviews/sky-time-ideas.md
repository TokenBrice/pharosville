# Sky, light and time-of-day

## Verdict

The machinery is sophisticated—one solar arc, phase-blended rigs, PMREM, an authored LUT, and shadow-map-driven shafts—but the resulting picture changes colour more than it changes light. At `17:30`, dusk is fully asserted yet then overwritten 64.8% back toward day; its computed key:analytic-fill ratio is ~4.98:1 versus noon's 5.32:1, so the frame is structurally noon-like. Night reverses the intended hierarchy: a 1.0 moon key sits over 0.64 ambient+hemisphere fill (~1.56:1), while a positive global lift preserves blue midtones. The measured full-tier frame is already 242 recurring draws, 392,474 triangles, 51 textures and p95 16.7 ms, leaving 458 draws, ~108k triangles, and 21 textures but only ~3.3 ms to the hard frame ceiling (`outputs/reborn/census/light-cycle.json:8-17`). Spend that margin on authored temporal drama, not more global tint.

## Findings

1. **DEFECT — phase weights fight each other.** `dayCyclePhase` lets daylight and dusk coexist (`src/three/garden-day-cycle.ts:210-222`), then every light is blended night→dusk→day, so day overwrites dusk (`src/three/garden-day-cycle.ts:303-321`). At 17.5 the weights are daylight=.648, dusk=1, night=0: 64.8% of the final rig is day. `dusk.png @ whole world` consequently has blue water, short/soft object shadows, open shade and cream haze: noon under amber, not a low ember key. Dawn has the same collision: at 07:00 daylight=.648 and dusk=.926; `morning.png @ island and fleet` reads late morning.

2. **GAP — geometric cues are too similar.** Noon elevation is 0.806 rad/46.2° (`src/three/garden-sun.ts:33-35,104-115`); 17.5 is 0.338 rad/19.4°, yet `dusk.png @ island/water` shows mostly compact contact darkness rather than a lighthouse shadow or glitter axis. The shared moving arc is correct in principle (`src/three/garden-sun.ts:17-23`), but receivers, fill and post do not let it dominate the picture.

3. **DEFECT — night has more fill relative to key than day.** Day is key 3.3 over ambient+.hemi .62 (5.32:1); dusk 2.8/.64 (4.38:1); night 1.0/.64 (1.56:1), from `src/three/garden-day-cycle.ts:112-149`. `night.png @ water/fleet` therefore keeps nearly every hull and sail chromatic under an even cobalt wash, with weak silhouettes and no apparent lunar direction. Positive lift and near-unity gamma further raise everything (`src/three/garden-post.ts:211-228`).

4. **GAP — post has three looks, not a time narrative.** The dusk grade is explicitly warmer/more saturated than day (`src/three/garden-post.ts:229-255`), but it cannot invent direction. The LUT packs only night/dusk/day and blends with the same colliding weights (`src/three/garden-post.ts:551-618,1851-1859`). This authoring loop is technically sound but visually under-specified.

5. **GAP — costly rays are temporally indiscriminate.** The half-res 28-step march runs through most daylight because its gate is elevation-only until night (`src/three/garden-post.ts:974-1018,1158-1163`). Lowering noon to .62 would raise the gate from ~.012 to ~.259, making “golden-hour” shafts a permanent daytime veil.

6. **GAP — practical bloom is not practical-source bloom.** At night lantern cores are only ~.72–.77 linear luminance, below the 1.55 threshold; the current glow is painted geometry, while the moon road reaches the bloom shoulder (`src/three/garden-post.ts:71-110`). `night.png @ lighthouse and boats` shows a soft base disk and pin lights rather than a breathing beacon hierarchy.

7. **GAP — no celestial proof of night.** A moon pose exists at elevation .91 rad (`src/three/garden-sun.ts:67-76,126-129`), but `night.png @ entire visible field` has no visible moon or stars, no moon rim, and no convincing silver road. The viewer sees a blue palette, not a world under a moon.

## Ranked ideas

### 1. **STEP CHANGE — replace three overlapping weights with a five-beat light score**
**What:** In `dayCyclePhase`, author normalized, partition-of-unity beats: dawn (04:45–07:15), day, golden hour (16:15–18:15), blue hour (18:15–20:00), night. Give golden hour a short peak rather than a 17.5–19 plateau; crossfade adjacent beats only. Preserve wall clock. **Why:** Direction, contrast, fog, practicals and grade finally agree; each reference hour becomes unmistakable. **Cost:** 0 draws/tris/tex, negligible CPU; **L**. **Risk:** broad visual re-baseline. **Re-pins:** `garden-day-cycle.test.ts` phase samples/partition and every three-phase table; extend `garden-post.test.ts` LUT weights. **Displaces:** the overloaded `dusk` scalar and “night = remainder” law. **Deps:** sky/water/data-story lanes consume the new weights.

### 2. **STEP CHANGE — author real night, not blue day**
**What:** Reduce night ambient/hemi from .28/.36 toward ~.06/.10, moon key ~.55–.75, then tune exposure/grade to protect only silhouettes and navigation. Remove most global lift; add a procedural sparse star field and visible moon disk to the sky dome, a consistent cool rim and a narrow silver water road from `gardenMoonPose`. **Why:** darkness becomes negative space; beacon remains dominant, moon road secondary, all else ember. **Cost:** 0–1 draw, 0 tris if dome shader, 0–1 tex, ~0.1–0.25 ms; **L**. **Risk:** accessibility/data colours and near rim may disappear. **Re-pins:** `garden-day-cycle.test.ts` light ordering; `garden-post.test.ts` night lift/LUT hashes. **Displaces:** cobalt global visibility and broad painted reflection glow. **Deps:** sky/water/fleet lanes; ledger parity for any market cue affected.

### 3. **Unpark T3.1: lower noon elevation 0.806 → ~0.62 rad**
**What:** Make 0.62 rad/35.5° the arc apex while preserving noon bearing. A vertical form's shadow grows from ~0.96× to ~1.40× its height (+46%). **Why:** isometric forms gain readable side planes and an all-day shadow composition; noon stops feeling overhead-flat without falsifying wall time. **Position:** **do it**—this is a high-leverage geometric correction, not a grade tweak. **Cost:** 0 draws/tris/tex/ms; **S**. **Risk:** long tower shadow crowding boats; current god-ray gate jumps to ~.259 at noon. **Re-pins:** `garden-day-cycle.test.ts` sun samples; `garden-post.test.ts` ray gates. **Displaces:** the “preserve fixed rig exactly” pin (`src/three/garden-sun.ts:26-35`). **Deps:** idea 5 must ship with it.

### 4. **Phase-author key/fill ratios and absolute exposure**
**What:** Targets: dawn 3:1 soft/low; noon 5–6:1; golden 7–9:1 with violet fill; blue hour 2.5–3.5:1 at low absolute energy; night 4–5:1 but very dim. Make environment intensity phase-aware rather than fixed .6 (`src/three/garden-environment.ts:133-164`). **Why:** golden hour gains silhouettes/rims; blue hour remains gentle; night direction returns. **Cost:** 0 GPU work; **M**. **Risk:** PMREM diffuse can double-fill unless the differential probe algebra is updated. **Re-pins:** `garden-day-cycle.test.ts` ratio/floor and environment ordering. **Displaces:** universal `.6` environment and night “read everything” fill. **Deps:** LUT re-authoring.

### 5. **Confine volumetric shafts to dawn/golden hour**
**What:** Gate `GardenGodRaysEffect` by explicit dawn/golden weights as well as elevation; close it completely during day/blue hour/night. Spend the saved modal-hour GPU on 36–40 steps or slightly stronger .025 intensity only during those windows. **Why:** rays become an event, not haze; mandatory with the lower apex. **Cost:** typically saves one half-res offscreen draw by day; golden hour ~+0.1–0.3 ms versus current; **S–M**. **Risk:** transition popping; ease over 20–30 real minutes. **Re-pins:** `garden-post.test.ts` hour/gate cases. **Displaces:** elevation-only 0.16–0.85 gate and all-day march. **Deps:** idea 1.

### 6. **Selective practical-light bloom**
**What:** Render beacon, batched lantern/window emissives and ship-lantern instances into a quarter-res bloom mask/layer; exclude sky, sun glitter, moon road and painted pool discs. Give beacon a wide two-scale halo, lanterns a tight one. **Why:** the warm practical hierarchy becomes optical rather than painted; dusk-to-night ignition is emotionally legible. **Cost:** ~5–15 source draws + 1–2 offscreen composites, 2 RT textures, ~0.25–0.6 ms; **L**. **Risk:** layer maintenance and small-source flicker. **Re-pins:** `garden-post.test.ts` manifest/pass count/source inclusion. **Displaces:** generic full-frame luminance bloom and broad halo discs. **Deps:** fleet/island batching owners.

### 7. **Shadow art direction: resolution, penumbra, contact**
**What:** Keep one fitted directional map but A/B 4096² for the hero rig; phase-tune normal bias and PCF/PCSS penumbra—crisper noon, widening low-sun softness—while N8AO/contact blobs own only sub-object grounding. Current rays report a 2048² map and ~.043-unit texel (`src/three/garden-post.ts:952-997`). **Why:** long dusk shadows must read as designed brush strokes, not soft dirt; contact and cast shadow stop merging. **Cost:** 0 draws/tris, same texture count but ~+48 MB depth at 4096², ~0.2–0.8 ms; **M**. **Risk:** mobile memory/acne; tier 2048/4096. **Re-pins:** `garden-day-cycle.test.ts` pose; `garden-post.test.ts` shared shadow matrix/god-ray bias. **Displaces:** uniform softness and oversized ship contact blobs. **Deps:** environment/render-budget lane.

### 8. **Moving cloud shadows across the sea**
**What:** Project a very-low-frequency, two-octave cloud transmittance field in water/terrain shaders, advected slowly along sun azimuth; freeze deterministically under reduced motion. Do not add cloud geometry. **Why:** vast water breathes, time passes while the garden remains calm, and sunlight gains spatial structure. **Cost:** 0 draws/tris, 1 small tile texture (or procedural), ~0.1–0.3 ms; **M**. **Risk:** reads as dirty water or competes with risk bands. **Re-pins:** no post tests; `garden-day-cycle.test.ts` may pin deterministic phase strength. **Displaces:** some paper-grain visibility and broad water modulation. **Deps:** water/data-field lanes must reserve frequencies.

### 9. **Professional LUT authoring loop with five look-dev anchors**
**What:** Export linear, ungraded morning/noon/golden/blue/night reference plates plus neutral ramps; grade in Resolve/OCIO, export `.cube`, bake a five-band strip, and generate side-by-side contact sheets and gamut/clipping stats. Keep parametric grade for exposure/lightning only. **Why:** LUTs become authored from pictures, not RGB tuples; transitions preserve skin-of-world colours without turning dusk into a filter. **Cost:** same 1 texture (strip ~82 KB), four extra cached fetches/pixel, estimated <0.1 ms; **M**. **Risk:** double grading and out-of-gamut issuer colours. **Re-pins:** `garden-post.test.ts` band count, dimensions, hashes, interpolation and manifest. **Displaces:** hand-tuned phase tint duplication between parametric grade and LUT. **Deps:** ideas 1–4 must settle first.

## Rejected

- Full physical 180° sun sweep: rejected; the locked camera would silhouette/flatten the hero, and the prior narrower arc decision is compositionally sound.
- Cascaded shadow maps: rejected; fixed orthographic framing and one compact hero region do not justify extra shadow renders.
- Generic auto-exposure/eye adaptation: rejected; it would erase authored phase contrast and can make unattended wall-clock transitions pulse.
- Dense Milky Way/HDRI sky: rejected; spectacle would compete with the beacon and violate the quiet one-dominant-light night.

## Cross-lane notes

Sky/water must share sun/moon directions, cloud transmittance, horizon hue and reflection road; otherwise the current “three opinions” failure returns. Fleet/island should remove painted halos only when selective bloom lands. Render-budget should measure the 4096 shadow A/B and practical mask separately against the census's 3.3 ms headroom. Data-story/accessibility owners must verify that darker night preserves every analytical cue in the ledger/detail panel even when it intentionally reduces world visibility.
