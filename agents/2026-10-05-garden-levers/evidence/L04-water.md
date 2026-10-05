# L04 — Water, reflection, wakes

## Verdict
The water already has sophisticated machinery, but its dominant readable contrast is **blank blue mirror versus repeating bright chop**, not a composed garden inlet with understandable risk. The biggest lever is to separate a pond-quality optical surface from the risk codebook, rather than purchasing calmness by making every band look identical.

## Evidence
1. **Confirm hypotheses 1/3 in this lens:** noon water is blue-grey, with checker-like bright facets on the right; golden, dawn and blue amplify the same pattern. The inlet below the tower is quieter but its reflection reads as a diffuse vertical smear, not a recognizable inverted landmark (`day.png`, centre/right water; `golden.png`, `dawn.png`, `blue.png`, same regions, all under `outputs/holistic/`). This is not missing Fresnel: Schlick F0=0.02, PMREM sky, roughness and planar hero sampling already exist (`src/three/garden-water.ts:1042-1114`). The hero pass already renders island/tower layer 7 into a mipmapped HalfFloat target at half CSS resolution, with a reduced-motion cache (`src/three/garden-hero-reflection-pass.ts:22-26,85-95,137-154`).
2. **The checker is not primarily wakes:** it remains visible in `outputs/holistic/reduced.png` (right basin), where moving wakes are disabled (`src/three/renderer-ship-frame.ts:368-371`). The normal asset visibly consists of crossed diagonal ridges; its generator sums 16 integer-frequency sine components (`scripts/pharosville/generate-water-normals.mjs:39-88`). Water resamples that same asset at three scales, then adds Gerstner gain and directional risk slopes (`garden-water.ts:782-807,835-898`). [INFERENCE] Interference and specular amplification, not insufficient mesh tessellation, produce the dominant visual repetition. Temporal unpleasantness is **not proven** by stills.
3. **Confirm hypothesis 4 for risk decoding, not absence of encoding:** calm/right-side surface differences are obvious, but five ordinal bands cannot be named from the rest frame. The intended ladder is glass→ripple→streak→chop→leaden (`src/systems/garden-sea-regions.ts:224-232,286-325`); engraving deliberately disappears below a five-pixel period (`garden-water.ts:899-909`). Names are inspection-only (`docs/pharosville/CONTRACTS.md:243-247`). Overview makes seams visible, but they read as irregular drawn contours rather than an explained risk ladder (`outputs/holistic/overview.png`, basin).
4. **Shore contact exists but is generic:** nearest-land distance drives depth, a single seabed colour, a wet band and universal breathing lap line (`garden-water.ts:939-991,1122-1145`). No actual submerged bottom detail/refraction or caustics appears in these terms; caustics are explicitly excluded at line 990. Sea-edge rocks/reeds are six batched decorative draws, with authoritative obstacle footprints (`src/three/garden-sea-edges.ts:33-43`). The island's bright shoreline reads as an outlined model base (`day.png`, tower foot), not a shallow pond margin.
5. **Confirm hypothesis 3 at night:** `outputs/holistic/night.png` has almost-black inlet water and no readily recognizable tower reflection or risk subdivision. Do not conclude the moon road is broken: it is contingent on the true moon and uses view-dependent slats (`garden-water.ts:1281-1309`). Sun glitter likewise already follows the true light/eye half-vector, with a narrow exponent-400 lobe (`garden-water.ts:1255-1278`); these stills do not prove a sun-road fault. Raising every lamp would violate the explicit beacon/road/ember hierarchy (`CONTRACTS.md:361-382`).
6. **Wake architecture is worth keeping:** two 512² HalfFloat targets separate foam, slick and hull contact; MAX blending and bounded decay prevent accumulation (`src/three/garden-wakes.ts:26-70`). The wake stamps are hull-scaled Kelvin arms and a soft slick, not a fluid simulation (`garden-wakes.ts:370-394`). Their intensity already carries risk and change (`renderer-ship-frame.ts:529-558`); therefore “make wakes physical” must not silently change their meaning. Existing measured headroom is real, not permission: day has 179 calls, GPU p50 2.47 ms, 374,708 triangles and 50 textures (`outputs/holistic/day.json:30,52-56,1699-1700`).

## Ranked levers

### 1. Pond-first optical surface
**Change:** replace the conspicuous crossed normal vocabulary in `garden-water.ts` and the locally generated normal asset with a band-limited, irregular, predominantly unidirectional slope field. Separate low-amplitude geometry breathing from optical detail; use full-normal screen-footprint filtering and consistent roughness for reflection/glints. Reduce right-basin checker area substantially, not by a tiny amplitude tweak. Keep localized sparse disturbances rather than globally animated texture.

**Impact 5/5:** changes the largest material impression from ocean-demo chop to quiet inlet. **Effort M. Risk:** erasing risk differences. **Touched:** `VISUAL_INVARIANTS.md:38-45,97-112`; bounded vocabulary/tier budgets `CONTRACTS.md:372-395`. **Dependencies:** risk ladder below; hull-swell synchronization. **Verify:** matched day/dusk burst crops, 16-pixel notan, reference-GPU p95/owner deltas; focused `garden-water.test.ts` and regional-character tests. No new runtime library or renderer.

### 2. A recognizable broken reflection
**Change:** retune the existing hero planar reflection as a coherent optical image: crisp contact and recognizable inverted tower in calm water, gradually broken lower down. Replace unconditional below-shore mip blur/vertical taps (`garden-water.ts:1096-1113`) with footprint- and surface-roughness-dependent filtering. Keep one clipped hero pass; coordinate its colour/air with the real sky probe. Replace the smear, do not add another reflection effect.

**Impact 5/5:** makes the quiet interval actively beautiful and ties the hero to its setting. **Effort M. Risk:** competing mirror-monument or aliasing. **Touched:** `VISUAL_INVARIANTS.md:5-11,69-77`; hero-only half-resolution budget `CONTRACTS.md:374-377`. **Dependencies:** normals, tower/headland art, sky. **Verify:** reflection-on/off paired captures; recognizable silhouette at both gate sizes, no detached contact; reflection ≤1.2 ms and declared owner limits; hero-reflection/water tests.

### 3. A taught static risk codebook
**Change:** retain canonical field IDs, but replace “more noisy water = worse” with sparse, scale-aware static signatures: long quiet ribbons for Watch, interrupted channel strokes for Alert, short broken marks for Warning, dark closely grouped marks for Danger. Preserve separate Ledger/Wreck semantics and Danger's reserved accent. Show matching **surface exemplars plus names** in the existing DOM legend; coordinate naming with L09. Keep signatures readable at rest/night without requiring choppy normals or motion.

**Impact 5/5:** permits a relaxing scene without sacrificing the visualization. **Effort M. Risk:** map-like hatching or artificial illumination. **Touched:** `VISUAL_INVARIANTS.md:59-67,114-122`; field authority `CONTRACTS.md:216-247`. **Dependencies:** legend/ledger, region visibility and selected-water interaction. **Verify:** blinded five-band matching at day/night/gate sizes and reduced motion; region/hit/ledger parity tests. No new classifier, count-driven territory or fake night glow.

### 4. Authored shallow margins
**Change:** use the existing shore field for a coherent dry/damp/submerged transition shared with terrain; reveal a locally authored stone/silt bottom through shallow absorption, with modest distortion confined to clear water. Replace the universal foam/lap outline with exposed-shore contact only; sheltered pond edges should be predominantly dark and still. Reuse batched sea-edge sites and their exclusion footprints.

**Impact 4/5:** supplies depth and garden-water intimacy without decorating the whole basin. **Effort L. Risk:** new textures, seabed clutter or decorative shapes mistaken for risk. **Touched:** `CONTRACTS.md:240-242,372-395`; no renderer-only coastline. **Dependencies:** L06 terrain/material work and authoritative obstacles. **Verify:** shore crops and whole-frame gains, no valid-water intersections, texture/triangle deltas; exclusion/sea-edge/water tests. Caustics are not a prerequisite.

### 5. Wake hierarchy, not wake simulation
**Change:** preserve the ping-pong field and decay laws; separate always-present static hull contact from readable local mover trails. Make foam/contact/slick composition survive scale changes without becoming bright roads; compare focused/hero versus distant movers. Retain existing analytical intensity mapping and update its DOM explanation if presentation changes. Demote standing decorative ring trains before adding ripples.

**Impact 3/5:** credible little events make the quiet surface feel alive. **Effort S. Risk:** hiding a cue or changing wake meaning. **Touched:** `VISUAL_INVARIANTS.md:97-112`; semantic tier preservation `CONTRACTS.md:393-395`. **Dependencies:** fleet choreography and risk teaching. **Verify:** 60-second mover burst, pan/reduced-motion parity, no slick residue; `garden-wakes.test.ts`, wake-batch and renderer-ship coverage.

## Do-not-do / traps
- No full-scene SSR, real-time FFT ocean, fluid solver, or mirrored 184-ship fleet: wrong visual target and unnecessary cost.
- No turquoise water/extra bloom/global exposure repair; preserve noon and immutable colours. Do not fake moonlight on moonless nights.
- Do not smooth categorical IDs, warp only the rendered coastline, or let decorative bathymetry classify ships.
- Do not repeat rejected micro-craft: A2/B1/P1 lacked whole-frame gains; W1 temporal tuning was unwarranted (`agents/2026-10-02-visual-upgrade/02-execution-record.md:17-20`). Water spatial structure is the proposal, not another bottom-third motion reduction.

## Invariants worth challenging
The implementation protects Watch→Danger from inlet quieting and wind slicks (`garden-water.ts:744-749,826-827`), although the product demands calmness. Challenge that mechanism **only after** a static non-colour risk codebook works. `CONTRACTS.md:372-377` permits replacements, not accumulating effects; its hero-only reflection boundary is worth retaining. Retain the night emissive ceiling; improve sky-reflected separation before requesting a new budget. No need to challenge API, desktop gate, reduced motion, classification or DOM truth contracts.

## Captures wanted
Run serially on real GPU; paths are relative to preview's `outputs/`. Existing instruments are documented at `TESTING.md:455-469`. Repeat baseline/candidate with identical fixture/date. Review regional crops, not only the bottom-third temporal aggregate.

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1600 --height 1000 --hash '#t=12.25' --still-camera --seconds 20 --clean --metrics --burst 12 --interval 500 --burst-sheet --draw-census --json l04/day.json --out l04/day.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --width 1600 --height 1000 --hash '#t=18.5' --still-camera --seconds 20 --clean --metrics --burst 12 --interval 500 --burst-sheet --json l04/risk-golden.json --out l04/risk-golden.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --clock 2026-10-05 --hash '#t=22' --seconds 20 --clean --metrics --night-water --json l04/night.json --out l04/night.png
```
```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-09-26 --hash '#t=22' --seconds 20 --clean --night-water --json l04/moon.json --out l04/moon.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --width 1200 --height 640 --hash '#t=12.25' --reduced --metrics --json l04/static-gate.json --out l04/static-gate.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --width 900 --height 720 --hash '#t=12.25' --metrics --json l04/risk-gate.json --out l04/risk-gate.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --hash '#t=12.25' --knockout-compare reflection --seconds 20 --clean --json l04/reflection.json --out l04/reflection.png
```

No new captures, tests or gates were run for this read-only review.
