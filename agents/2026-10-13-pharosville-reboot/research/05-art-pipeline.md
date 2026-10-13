# 05 — Art pipeline assessment and look-test

Author: Opus agent, 2026-10-13. Scope: pick ONE art pipeline for a stylized, real-time 3D, desktop-first,
isometric 3/4 maritime harbour-town diorama (operator decisions relayed mid-task), and test it with a scripted
Blender diorama.

## Recommendation

**Pipeline (1): Blender-scripted stylized low/mid-poly GLB, lit in real time in three.js.** Take one idea
from (4): bake *only* ambient occlusion into vertex colour, and keep sun, moon, lamps and shadows dynamic so
the day/night cycle stays correct. Do not use (2) or (3).

## A. What made the Opus Blender work better

Evidence I looked at:
- Opus: `assets/pharosville/blender/pharos-tower.blend` (commit `d1bd2b0`), rendered in
  `agents/pharosville-revamp/blender/pharos-tower-eevee.png` and `composite-cycles.png`.
- GPT/Sol: `agents/pharosville-revamp/beauty/{inlet,karesansui,pond}/hero-*.png`.

- **The Opus tower stays inside one vocabulary.** It uses one limestone material set (basecolor, normal and
  ORM) and repeats coursed blocks, arches and cornices at a single, consistent detail frequency. It is hard
  surface, architectural and modular. The clean silhouette and the restrained palette do most of the work.
- **The GPT plates try naturalistic, organic detail and lose.** Their own verdict says so: "pine masses are
  wiry, the moss is closer to a lawn … distant hills/clouds are visibly simple planes … look procedurally
  authored" (`beauty/inlet/NOTES.md`). Their composition is photographic: horizon views, a foreground deck and
  a bough frame. A data world needs a readable, game-like stage, and that framing does not give one.
- **Lesson.** An agent authoring geometry in Python does well with stylized forms: low-frequency shapes, flat
  palette colour, bevels, and good light. It fails at simulated organic realism such as foliage, moss and
  terrain micro-detail. [INFERENCE] Choosing the style matters at least as much as choosing the model: the
  Opus asset was an easy target and the GPT plates were hard ones. This look-test held that discipline, and
  in about an hour it produced a coherent scene, not a "procedural" one.

## B. Pipeline comparison

| | Coherence risk | Agent authoring | Iteration | Quality ceiling | Runtime cost |
|---|---|---|---|---|---|
| **(1) Scripted GLB, real-time** | Low. One palette material and one light rig make coherence structural. The real risk is looking generic or "asset-store" | High. Proven below: 1.2k-line script, 10 s build | Fast. Edit, build and render in ~15 s; hot-reload GLB in the browser | Medium-high (Townscaper/Bad North class). The top tier depends on custom shaders (water, AO, soft shadow, grade) | Low. ~17k tris for the whole diorama; instancing for boats |
| **(2) Pre-rendered sprites + normal/depth relight** | Low within a bake set; high when mixed with real-time sea/boats | Medium. Pass/atlas/depth-sort plumbing; camera locked to one angle | Slow. Every change re-bakes the atlas | High for static Cycles stills, poor for motion and zoom | Medium. Large atlases, overdraw, depth compositing |
| **(3) PixelLab pixel art + shader water (HD-2D)** | High. Generative variance needs a strict contract plus manual curation (ClaudeVille's `building-style-contract.md` runs 212 lines for that reason). Mixing pixel art with smooth shader water and sky clashes in style | Low-medium. Paid credits; agents cannot steer fine geometry | Medium. Each regeneration rolls the dice | About ClaudeVille level. It would read as derivative, and pixel art is not "state of the art browser 2026" | Low |
| **(4) Hybrid: real-time sea/sky + GLB with baked lighting** | Medium. Baked directional light is wrong at night and at other hours | High (same tooling as 1) | Medium (bake step) | High for a fixed hour | Low |

Why (2) and (3) fail the operator's new constraint: **stablecoin boats must visibly move**. A boat that
turns, heels, tacks and furls its sail needs 8–16 headings × sail states × heel. Sprites multiply into the
thousands. Real-time hulls do it with a handful of instance attributes. (4)'s fully baked lighting breaks the
golden/night states this look-test shows, so only AO (direction-independent) is safe to bake.

**Evidence that the real-time port carries little risk:** the EEVEE render and the Cycles path-traced render
of the same scene are nearly identical (`art/lookdev-iso-golden.png` vs `art/lookdev-iso-golden-cycles.png`).
The look comes from palette, form, the water shader and grading, not from global illumination, so three.js
can reproduce it. [INFERENCE: browser parity not yet measured; verify via `npm run preview`, never Playwright.]

## C. Look-test results

Script: `art/build_lookdev.py` (reproducible:
`blender -b --factory-startup -P build_lookdev.py -- --states golden,night --cams iso,hero --save`).

Renders (1600×1000):
- `art/lookdev-iso-golden.png` and `art/lookdev-iso-night.png`: ortho 30° dimetric, ClaudeVille framing
- `art/lookdev-hero-golden.png` and `art/lookdev-hero-night.png`: 50 mm perspective variant
- `art/lookdev-iso-golden-cycles.png`: Cycles beauty reference
- Source files: `art/lookdev.blend`, `art/sea-sdf.png`, `art/lookdev-stats.json`

**Budget (`lookdev-stats.json`):**
- **16,856 triangles** in total, over 136 mesh objects. The largest contributors: lighthouse 3,844; clouds 2,240;
  island + knoll 2,608; 3 boats 1,698; piers 1,288; cottage 974. Sea and sky are 2 triangles each.
- **8 materials:** palette (vertex colour, used by every opaque prop), lamp glass, window, sail, water, sky,
  beam, cloud.
- Build takes 10 s. EEVEE takes 1.3–2.4 s per frame at 64 samples; Cycles takes 13 s at 128 samples.

**Contents:**
- Faceted rocky islet with a turf cap, a lighthouse headland and surf boulders.
- Classic tapered red/white tower: plinth, corbel, iron gallery and railing, glazed lantern with mullions,
  domed cap, finial, door and spiral windows.
- Keeper's cottage with a slate gable roof, chimney and lean-to; picket fence, vegetable plot, flowers, flag,
  trees.
- Open harbour: a stone quay with bollards, a main pier on piles, and two finger piers. Two boats are moored
  in berths, sail furled under a cover in their brand colour, with fenders and bow/stern lines. One cutter is
  under way with a brand emblem on its sail and a Kelvin wake.

**Runtime-shaped choices:**
- The sea is one plane with a baked distance texture: R = coast/hull/pile distance, G = wake. The shader
  derives the depth tint, the contact foam band, a broken second foam ring and the wakes, then hazes into the
  horizon. That is exactly what a three.js shader would sample.
- The sky is a gradient card plus stratus clouds and stars.
- Sail emblem colour is per-object colour, which stands in for a per-instance attribute.

**Self-critique (honest): golden 6/10, night 6/10.** ClaudeVille is about 8.5 on coherence and density.

- **Works:**
  - Strong lighthouse silhouette against the sky.
  - Coherent restrained palette.
  - Warm windows, lamp and beams read well at night.
  - Shoreline foam and the shallow-water tint ground the island.
  - The berths read clearly from the 3/4 camera.
  - The palette-material approach makes coherence nearly automatic.
- **Weak:**
  - The lawn is large and under-dressed: big empty green.
  - The look sits close to generic "low-poly asset" territory. It lacks a signature: no outline/ink pass, no
    painterly grade, no texture breakup.
  - The far sea is a flat peach haze band with a visible gradient wall.
  - The clouds read as stacked pancakes.
  - The quay reads as a pale slab.
  - Windows have no frames.
  - Moored boats are dark and tiny at night: no deck or riding lights.
  - Boats are only about 70–90 px long at this zoom, which is marginal for logos.
  - The beams are additive cones, not volumetric.
- None of these weaknesses is a pipeline limit. Each is an iteration item: density pass, outline shader,
  bespoke cloud shader, horizon fog curve, window frames, riding lights.

## D. Boats as animated real-time assets

- **Hull families.** Author 4 GLB classes in the same script style as the look-test's `hull_mesh()`
  (sections lofted from a beam/sheer/draft profile, so a new family is a parameter set, not modelling work):
  - dinghy/catboat ~1.4 LOA
  - sloop ~1.8
  - cutter/ketch ~2.3
  - schooner/ship ~3.5+ (for the largest market caps)

  Budget is ≤600 tris for mid LOD and ≤120 tris for the far impostor hull. The look-test hulls with rig
  average ~570.
- **Node contract.** `hull`, `deck`, `mast`, `boom` (pivot at the gooseneck), `sail_main`, `sail_jib`,
  `sail_cover`, plus empties `bow_cleat`, `stern_cleat`, `masthead_light`, `wake_origin`.
  - Sails carry morph targets: furled→set, plus belly per tack.
  - The boom rotates by tack; heel and pitch are applied at the root.
- **Sail atlas.** Each sail UV maps to a fixed square emblem region, as in the look-test's `M_sail` disc/ring.
  - The runtime samples a 2048² logo atlas (64×256² slots) by a per-instance `emblemIndex`, with a fallback to
    brand colour.
  - The sail cover uses the brand colour, so docked boats keep their identity.
- **Instancing.** One `InstancedMesh` per class per material group.
  - Per-instance attributes: matrix, `heel`, `tack`, `sailState` (0 furled → 1 set), `emblemIndex`,
    `hullColor`.
  - Bobbing, heel and the sail morph run in the vertex shader from a shared wave function, so the CPU only
    advances path positions.
  - [INFERENCE] Hundreds of boats should fit in under 10 draw calls.
- **Wake.** No wake geometry.
  - Each frame, stamp boat position and velocity into a small ping-pong wake texture (512² over the
    harbour, decaying) that the sea shader reads like the G channel here.
  - Hull contact foam comes from the same distance field.

## E. Berth design for docking animation

- **Open structures only.** Use finger piers or pontoons on piles. The camera must see water between the
  berths, so no sheds or boathouses.
- **Orientation.** Fingers point toward the camera side of the main pier, so berths open into view and hulls
  are never hidden behind a deck. The look-test does exactly this: fingers on the −lateral side, and both
  moored hulls fully visible.
- **Spacing per class.**
  - Finger pitch = beam + finger width + 2 × 0.1 LOA clearance per single berth.
  - Finger length ≥ 0.75 LOA.
  - Concretely: catboat pitch 1.6, sloop 2.0, cutter 2.5. Schooners and ships moor alongside the T-head or
    quay wall. The look-test used 2.3 for a 0.6-beam sloop, which is roomy and still reads well.
- **Approach path (authored per berth as empties).**
  1. `approach_gate` sits off the pier head.
  2. `turn_in` sits 1.5 LOA out on the berth axis.
  3. `stop` sits with the bow 0.1 off the main pier.
  4. Speed eases into the final straight. `sailState` animates 1→0 over the last ~3 LOA, so lowering the sail
     is the readable "docking" cue.
  5. Departure plays the path in reverse.
  6. Arrange approaches so the turn-in happens on the camera side.
- **Mooring points.** Each berth gets named bollard empties: `berth_NN.bow_bollard` (main pier) and
  `berth_NN.spring_bollard` (finger end). Once a boat stops, draw 2–3 segment catenary lines from the hull
  cleats; fenders are static on the finger.
- **Readability.**
  - Hull length at least ~60 px at the default zoom.
  - Mast and sail cover must stay distinct from the deck planks; the cover colour does this.
  - Empty berths stay legible as slots (bollard pair + painted number).
  - Use one berth size class per finger row, so size encodes the class at a glance.
