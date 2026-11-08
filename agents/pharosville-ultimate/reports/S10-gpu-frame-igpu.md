# S10

## Executive summary

Low tier is not low enough for the recorded Raphael workload: 68–76 ms needs roughly 75–78% reduction to reach 16.7 ms. RTX captures rank static-world shading, shadows, civic, fleet, then ocean above individual post effects. The strongest candidates are procedural-material LOD, cheaper water, and smaller shadow budgets. Two concrete quality regressions need fixing: world shader variants bypass tier preparation, and derived life materials miss quality invalidation. Existing depth reuse, opaque sails, baked cloud impostors, and merged post effects are valuable foundations. Savings below are hypotheses, not measured iGPU results.

## Current state

- RTX captures contain 220/212/221 complete samples at high tier, 1600×1000, DPR 1. Submission-time totals are day p50/p95 2.37/4.31 ms, night 2.84/4.60 ms, storm 2.45/4.32 ms. All report zero skipped, disjoint, invalid, or pending queries. These instrumented draw-query sums are not presentation times or weak-GPU predictions. Evidence: agents/pharosville-ultimate/shots/perf-rtx-day.json:1792; perf-rtx-night.json:1726; perf-rtx-storm.json:1798; src/harbour/engine/gpu-passes.ts:184.
- Day ranking, p50 ms: scene/Scene 0.357, shadows 0.345, civic 0.310, fleet 0.301, ocean 0.202, life 0.097, lighthouse 0.082, static predepth 0.065, sky 0.038. Static-world and civic costs combine substantial geometry with shared procedural/PBR shading; ocean combines broad coverage, texture fetches, and wave ALU. Individual medians must not be summed into a frame percentile. Evidence: agents/pharosville-ultimate/shots/gpu-passes-summary.txt:1; src/harbour/world/materials.ts:718; src/harbour/ocean/ocean-material.ts:131.
- Night ranking changes to scene/Scene 0.445, fleet 0.365, civic 0.363, shadows 0.330, ocean 0.210 ms. Beam plus shimmer rises from 0.016 to 0.048 ms. Storm remains geometry/shadow dominated; precipitation fall is only 0.018 ms on RTX. Night activates point-light shading, pools, and six water-reflection taps. Evidence: agents/pharosville-ultimate/shots/gpu-passes-summary.txt:24; gpu-passes-summary.txt:47; src/harbour/lights/lights-system.ts:365; src/harbour/ocean/ocean-material.ts:306.
- Engine tiers: high/medium/low use 4096/2048/2048 shadow maps, nominal every-frame/30/15 Hz refresh, 16/8/4 promoted point lights, 8/7/6 bloom levels, and high/medium/low SMAA. Medium and low require two frames between interval-driven shadow refreshes; camera/light-fit changes override that cadence. Automatic DPR bottoms at 1 and tops at 2. Evidence: src/harbour/engine/quality.ts:27; quality.ts:36; src/harbour/world/sun.ts:89.
- Scene tiers do reduce work: fleet full-detail thresholds are 40/58/90 px, with shorter rope/flag ranges, earlier shadow cutoff, no low-tier stationary contact stamps or fenders. Rain/splash budgets are 22000/2600, 14000/1600, 8000/900. Life shares are 1/0.75/0.45; low hides alternate civic workers. HB_LITE removes several decorative shader features. Evidence: src/harbour/fleet/fleet-system.ts:78; src/harbour/weather/precip.ts:19; src/harbour/life/life-system.ts:28; src/harbour/civic/civic-system.ts:321; src/harbour/world/materials.ts:385.
- Kit shading remains expensive at low: procedural Voronoi, multi-octave hash noise, eight height-field AO samples, PBR lighting, and shadow reception remain. Water retains a 256² grid, repeated five-wave normal/crest evaluations, four ripple reads, extensive foam shading, and six night pool samples. These are stronger weak-GPU suspects than LUT grading. Evidence: src/harbour/world/materials.ts:160; materials.ts:218; materials.ts:258; materials.ts:313; src/harbour/ocean/ocean-system.ts:48; src/harbour/ocean/ocean-material.ts:175; ocean-material.ts:315; ocean-material.ts:345.
- There is one shadow-casting directional key; fill and promoted point lights do not cast shadows. Opaque kit broadly casts, with existing exclusions for backdrop hills and small moving civic parts. Low retains the same five hardware-PCF receiver samples as high; the separate sea-mask resolve uses four/one/one samples. Exact runtime caster draw/triangle counts are not recorded. Evidence: src/harbour/world/sun.ts:43; src/harbour/lights/lights-system.ts:246; src/harbour/world/materials.ts:1063; src/harbour/civic/civic-system.ts:199; node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js:162.
- Post uses half-float composer buffers. Scrub, merged color composite, bloom luminance extraction, and SMAA operate at canvas resolution; SMAA has edge, weight, and final blend stages. Bloom mip blur starts at half dimensions: high has 8 down/7 up draws; low 6 down/5 up. Tilt-shift uses half resolution and skips blur when faded out. AgX, the 32³ LUT, vignette, and dither already share one composite. Evidence: src/harbour/engine/engine.ts:100; src/harbour/engine/post.ts:236; post.ts:249; node_modules/postprocessing/build/index.js:4019; index.js:4359.
- Sails are opaque, double-sided, depth-writing surfaces; cloth glow does not make them transparent. Clouds are baked atlas impostors composited inside one opaque sky card, not layered transparent volume draws. Actual blended-overdraw sources include precipitation, smoke, light sprites/pillars, glass, and lettering. Beam is a full-resolution, depth-aware effect with 18 march steps and geometric early-outs; stale fog is a separate conditional analytic effect. Evidence: src/harbour/fleet/fleet-material.ts:443; src/harbour/sky/sky-system.ts:220; src/harbour/sky/clouds.ts:121; src/harbour/beam/beam-system.ts:109; src/harbour/readings/fog.ts:25.
- Existing optimizations deserve preservation: static depth is reused by the color pass; sky and ocean draw after opaque land for early depth rejection; sky reflection inputs are cached; wake decay already runs every other frame. Decorative aerial haze is vertex-computed, not another volume pass. World-wide static merging reduces submission cost but limits spatial culling. Evidence: src/harbour/world/depth-prepass.ts:93; src/harbour/sky/sky-system.ts:226; src/harbour/ocean/ocean-system.ts:209; src/harbour/sky/sky-system.ts:410; src/harbour/ocean/wake.ts:219; src/harbour/world/aerial.ts:31; src/harbour/civic/civic-system.ts:202.

## Findings

### S10-F1 [high] Automatic quality reaches an inadequate floor

- Evidence: agents/claudeville-prettier/exec/INTEGRATION-NOTES.md:37; src/harbour/engine/quality.ts:30; quality.ts:36; src/harbour/world/materials.ts:313.
- Detail: The historical Raphael result is already 68–76 ms at low tier and DPR 1. The governor cannot descend further, while low retains 2048² shadows, eight-tap AO, substantial procedural shading, and full-resolution post surfaces. This does not establish an Apple Silicon failure, but it establishes that current low is inadequate for the recorded weak-GPU workload.
- Fix: Build a substantially cheaper low shader/shadow path, then measure on named integrated GPUs. Treat optional sub-native resolution as an additional tool, not a sufficient fix.

### S10-F2 [high] Tier preparation no longer covers changing world programs

- Evidence: src/harbour/engine/engine.ts:332; src/harbour/engine/post.ts:298; src/harbour/world/materials.ts:656; src/harbour/ocean/ocean-system.ts:195; src/harbour/engine/post.test.ts:100.
- Detail: prepareQuality prepares only SMAA materials, reflecting the older tier-invariant-world assumption. Crossing low now changes kit, fleet, predepth, and ocean shader variants after publication. Their first ordinary render can therefore perform unprepared program work. Existing tests explicitly preserve the obsolete two-material-only assumption.
- Fix: Prepare and retain the target HB_LITE world variants before publishing the tier. Reuse ProgramPreparation and add a low↔medium transition check covering kit, fleet, ocean, and predepth.

### S10-F3 [medium] Derived life materials miss low-tier invalidation

- Evidence: src/harbour/life/figure-kit.ts:107; src/harbour/world/materials.ts:648; materials.ts:656; src/harbour/fleet/fleet-material.ts:490; node_modules/three/src/renderers/WebGLRenderer.js:2426.
- Detail: chainedKitMaterial includes the base kit's changing program key but never registers the derived material with mats.track. setLite marks cached kit and registered derivatives dirty, so already-rendered life and civic-worker materials can retain the previous shader until another renderer invalidation occurs. Fleet correctly registers itself.
- Fix: Register derivatives in chainedKitMaterial and verify material-version invalidation in both directions. Include these derivatives in target-tier preparation.

### S10-F4 [medium] Subpixel fading often preserves the expensive calculation

- Evidence: src/harbour/world/materials.ts:160; materials.ts:218; materials.ts:224; materials.ts:258; src/harbour/ocean/ocean-material.ts:179; ocean-material.ts:432.
- Detail: Cobbles evaluate the 9-cell plus 25-cell Voronoi search before mixing to a constant when detail is subpixel. Several noise and water-detail calculations similarly execute before distance fading. HB_LITE leaves these paths intact. The source contains avoidable work even when its visible contribution has reached zero; exact driver elimination and savings remain unmeasured.
- Fix: Use footprint-aware early paths and dedicated low variants. Compute derivatives before branching, and use explicit texture gradients or LOD where branches make implicit derivatives unsafe.

### S10-F5 [low] Low tier resolves an unused sea-shadow texture

- Evidence: src/harbour/world/sun-shadow.ts:54; sun-shadow.ts:102; src/harbour/world/sun.ts:99; src/harbour/ocean/ocean-system.ts:198.
- Detail: HB_LITE makes hbSeaSunShadow return fully lit before sampling. SunRig nevertheless resolves and mipmaps the sea shadow after shadow refreshes without checking the tier. With a 2048² low shadow map, this produces an unused 1024² mask.
- Fix: Skip mask allocation/resolve while low has no consumer. Mark it dirty and resolve against a valid shadow map before restoring a richer ocean shader.

### S10-F6 [medium] Whole-world static batches limit GPU culling

- Evidence: src/harbour/world/island-system.ts:50; src/harbour/civic/civic-system.ts:202; src/harbour/civic/assemble.ts:110; assemble.ts:158; src/harbour/world/depth-prepass.ts:70.
- Detail: Island chunks and still civic buildings merge across large regions by material. This saves draws, but a visible portion keeps the entire batch eligible for color, static predepth, and shadow processing. There is no spatial or screen-size LOD in these merge paths. The trade-off becomes less favorable in close or partial-island views.
- Fix: Benchmark a small number of spatial batches with independent bounds and matching depth proxies. Add simplified distant decorative geometry only where it beats the extra draw cost.

### S10-F7 [medium] Inactive chimney puffs still rasterize

- Evidence: src/harbour/life/smoke.ts:26; smoke.ts:41; smoke.ts:52; smoke.ts:92; smoke.ts:108.
- Detail: The chimney activity test only multiplies alpha. Inactive emitters still submit every puff quad, execute fragment work, and blend with zero alpha; instanceCount remains fixed and frustum culling is disabled. Quality reduces apparent smoke activity without removing the corresponding raster work.
- Fix: Clip exactly inactive puffs in the vertex shader before constructing their cards. Consider emitter compaction only if profiling shows vertex cost remains material.

## Ideas

### S10-I1 Make material detail stop costing pixels once it disappears

*all-devices · infra · effort M · impact 5 · confidence 4*

- What: Add footprint-based constant paths for cobbles and fine rock/grass noise; give HB_LITE a cheaper world-breakup function. Start with the exact-zero cobble fade, then compare simplified noise against the existing mean appearance.
- Visitor benefit: Smoother movement with the same distant color, material identity, and silhouettes.
- Data/DOM: n/a; decorative material detail only. Preserve seasonal colors, wetness, analytical markings, and selection.
- Where: src/harbour/world/materials.ts:160; materials.ts:218; materials.ts:258; shared fleet/life material callers.
- Perf: Hypothesis: 10–30% less affected kit fragment cost; no added draws. Savings are scene-dependent and overlap AO/shadow changes.
- Risks: Keep derivatives outside divergent branches; preserve mean brightness and avoid visible distance thresholds.
- Depends on: S10-I6, S10-I13

### S10-I2 Give low water a genuinely cheaper shader

*all-devices · infra · effort M · impact 5 · confidence 4*

- What: Reuse wave phase work between normal and crest calculations; reduce low-tier ripple layers and night reflection taps from six to two or three. Skip distant caustic/lace work after computing safe footprints. Retain displacement, sea-state foam, Shoals coloring, and beam reach.
- Visitor benefit: A moving, readable sea on weak GPUs without losing market conditions.
- Data/DOM: Existing off-peg sea state and DEWS weather mappings remain unchanged; no new field, threshold, or DOM copy.
- Where: src/harbour/ocean/ocean-material.ts:175; ocean-material.ts:315; ocean-material.ts:345; ocean-material.ts:432; src/harbour/ocean/waves.ts:29.
- Perf: Hypothesis: 20–40% less ocean shading cost. RTX ocean currently costs 0.202–0.214 ms; iGPU milliseconds require measurement.
- Risks: Simplifying displacement independently would detach hulls from water. Preserve CPU/GPU height agreement and rough-versus-calm ordering.
- Depends on: S10-I6, S10-I13

### S10-I3 Move static height-field AO out of every fragment

*all-devices · infra · effort L · impact 4 · confidence 4*

- What: Bake the current height-field AO onto static vertices during asset preparation or loading. Keep dynamic actors on a four-tap low-tier path, retaining eight taps for richer tiers or close inspection.
- Visitor benefit: Buildings and figures stay grounded while reducing repeated texture work.
- Data/DOM: n/a; decorative occlusion only.
- Where: src/harbour/world/materials.ts:308; materials.ts:779; src/harbour/world/ground.ts:23; src/harbour/civic/assemble.ts:127.
- Perf: Removes eight AO reads per static shaded fragment; adds a compact vertex attribute. Hypothesis: 5–20% less affected shading cost.
- Risks: Vertex interpolation can soften contact corners. Bake with final world transforms; moving ships and actors must retain live occlusion.
- Depends on: S10-I13

### S10-I4 Budget shadow generation and reception separately

*all-devices · infra · effort M · impact 5 · confidence 4*

- What: Trial a 1024² low map, one hardware-PCF receiver sample at low, and screen-size thresholds for decorative caster proxies. Preserve the Pharos, buildings, meaningful ship silhouettes, and near contact shadows. Keep existing camera-fit invalidation.
- Visitor benefit: Lower GPU cost while important structures remain grounded.
- Data/DOM: n/a; shadows carry no independent analytical meaning. Do not remove boats or signal geometry.
- Where: src/harbour/engine/quality.ts:30; src/harbour/world/sun.ts:63; src/harbour/world/materials.ts:1063; src/harbour/life/folk.ts:379; node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js:162.
- Perf: Map pixels fall 75%; receiver comparisons fall from five to one. Hypothesis: 30–60% lower shadow-generation cost plus separate receiver savings.
- Risks: Low-sun stair steps, acne, detached contacts, and caster popping. Prefer stable thresholds and test pan/zoom, not only still views.
- Depends on: S10-I6, S10-I13

### S10-I5 Stop producing low tier's unused sea shadow

*all-devices · infra · effort S · impact 3 · confidence 5*

- What: Gate SeaShadowMask.resolve on an active ocean consumer; defer allocation at low and refresh before a richer tier resumes sampling.
- Visitor benefit: A free low-tier saving with no intended picture change.
- Data/DOM: n/a; low already omits this decorative shadow.
- Where: src/harbour/world/sun.ts:99; src/harbour/world/sun-shadow.ts:54; sun-shadow.ts:102.
- Perf: Eliminates a 1024² low-tier resolve and mip generation per shadow refresh; saves about 1.33 MiB if its mipmapped R8 allocation is avoided.
- Risks: A low→medium transition must not sample an old matrix or stale mask. Add a focused transition test.
- Depends on: —

### S10-I6 Prepare the complete tier before publishing it

*all-devices · infra · effort M · impact 5 · confidence 5*

- What: Register life-derived materials with mats.track, then extend existing preparation to target kit, fleet, life, predepth, and ocean variants. Retain prepared variants and commit the tier atomically.
- Visitor benefit: Automatic quality changes become dependable and avoid first-use shader hitches.
- Data/DOM: n/a; retain all current scenery and readings during preparation.
- Where: src/harbour/engine/engine.ts:333; src/harbour/engine/prepare.ts:150; src/harbour/world/materials.ts:656; src/harbour/life/figure-kit.ts:107; src/harbour/ocean/ocean-system.ts:195.
- Perf: No promised steady-frame reduction; removes avoidable transition compilation. Some additional resident programs and preparation work.
- Risks: Handle cancellation, seasons, deferred additions, and browsers without parallel compilation. Verify live material versions and observed transition maxima.
- Depends on: —

### S10-I7 DECISION-NEEDED: add sub-native emergency resolution

*all-devices · infra · effort S · impact 5 · confidence 4*

- What: Extend the existing governor with low@0.85 and low@0.75 rungs while keeping DOM overlays at native CSS resolution. Retain hysteresis and the existing sorted viewport admission gate.
- Visitor benefit: Weak laptops gain another automatic recovery step instead of remaining at the quality floor.
- Data/DOM: DOM readings, picking coordinates, and accessibility remain complete. No analytical object is removed.
- Where: src/harbour/engine/quality.ts:36; quality.ts:50; src/harbour/engine/governor.ts:225; src/harbour/engine/engine.ts:104.
- Perf: 0.85/0.75 render 28%/44% fewer pixels. This does not reduce geometry or fixed-size offscreen work; even ideal 0.75 pixel scaling leaves historical 68–76 ms at roughly 38–43 ms.
- Risks: Thin rigging and emblems soften. Requires operator acceptance; cannot substitute for shader and geometry reductions.
- Depends on: S10-I13

### S10-I8 Recover spatial culling without undoing batching

*all-devices · infra · effort L · impact 4 · confidence 3*

- What: Merge static scenery into a small set of bounded districts instead of island-wide material batches. Add authored distant simplifications for decorative trees and roof detail; consider atlas impostors only for far vegetation. Keep matching static-depth and shadow proxies.
- Visitor benefit: Close inspection becomes cheaper while the full harbour retains its composition.
- Data/DOM: Every stablecoin retains its existing boat representation. Preserve chain identity, signal shapes, and selectable landmarks.
- Where: src/harbour/world/island-system.ts:50; src/harbour/civic/assemble.ts:110; src/harbour/engine/static-merge.ts:50; scripts/harbour/blender/island/hb_dress.py.
- Perf: Hypothesis: 20–50% fewer submitted static triangles in partial views, with perhaps 4–12 additional visible draws. Overview savings may be small.
- Risks: Extra submission cost can erase GPU savings. Preserve seasonal silhouettes, sway, pattern coordinates, and conservative bounds.
- Depends on: S10-I13

### S10-I9 Cull zero-contribution decorative particles

*all-devices · infra · effort M · impact 3 · confidence 5*

- What: Vertex-clip inactive chimney puffs before card construction. Apply conservative screen/frustum bounds to decorative emitter groups; compact visible actor instances only where measured vertex cost justifies it. Keep precipitation's existing instance-count budgets.
- Visitor benefit: Life remains visible where it matters, with less invisible work and transparent overdraw.
- Data/DOM: n/a for decorative smoke and actors. Exempt analytical signals and preserve existing DEWS precipitation intensity.
- Where: src/harbour/life/smoke.ts:26; smoke.ts:92; src/harbour/life/folk.ts:403; src/harbour/life/drift.ts:43; src/harbour/weather/precip.ts:408.
- Perf: Exact inactive-puff clipping removes their raster/blend cost. Hypothesis: 20–60% less smoke fragment work; total-frame gain is likely modest.
- Risks: Clip only exact-zero contributions initially. Bounds must include wind drift and full particle lifetime; avoid changes in apparent population density.
- Depends on: —

### S10-I10 Render the night beam at half dimensions

*all-devices · infra · effort L · impact 3 · confidence 3*

- What: Separate shaft integration into a half-resolution target with depth-aware upsampling; retain shimmer at full resolution. Begin without temporal history. Consider reprojection only after measurement, with rejection on camera, depth, beam, and reading changes.
- Visitor benefit: Preserves the Pharos's defining light while limiting night fragment cost.
- Data/DOM: Preserve existing PSI reach, color, period, qualification, and unavailable state. No new analytical encoding or delayed reading.
- Where: src/harbour/beam/beam-system.ts:109; beam-system.ts:139; beam-system.ts:280; src/harbour/world/depth-prepass.ts:93.
- Perf: Quarter as many integration pixels, plus an upsample/composite draw. Hypothesis: 30–60% lower beam-stage cost; current RTX night stage is only 0.048 ms.
- Risks: Thin shafts can disappear or bleed across geometry. Temporal history risks trails and stale PSI appearance; reduced motion must remain still.
- Depends on: S10-I13

### S10-I11 Reduce bloom's source resolution, not just its tiny mips

*all-devices · infra · effort M · impact 3 · confidence 4*

- What: Trial half-resolution luminance extraction and a correspondingly smaller mip chain at low. Preserve full-resolution grade, dither, and SMAA initially. Keep the NaN scrub before every blur consumer and retain current tilt-shift skipping.
- Visitor benefit: Keeps warm lamp halos and grading while lowering post bandwidth.
- Data/DOM: n/a; decorative postprocessing only.
- Where: src/harbour/engine/post.ts:236; post.ts:280; node_modules/postprocessing/build/index.js:4335; index.js:4359.
- Perf: Half dimensions cut affected target pixels 75%. Current 8→6 levels save four tiny draws, barely changing blur pixel count. Hypothesis: 30–60% cheaper bloom subsystem.
- Risks: Setting BloomEffect.resolution.scale alone does not resize its mipmap path in the installed implementation. Small lamps can lose energy; preserve finite-value handling.
- Depends on: S10-I13

### S10-I12 Scale world-space effect targets with quality

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Give low tier 1024² wake history/live targets and a 1024² light-pool target where projected footprints permit. Preserve accumulated wake history on changes and keep the existing every-other-frame decay.
- Visitor benefit: Reduces shared-memory pressure and power use without changing the number of boats or lamps.
- Data/DOM: n/a; wake and lighting detail remain decorative. Preserve analytical stern-light state.
- Where: src/harbour/ocean/ocean-system.ts:149; src/harbour/ocean/wake.ts:161; wake.ts:224; src/harbour/lights/lights-system.ts:13; lights-system.ts:113.
- Perf: Where all targets are 2048², reducing two R16F wake histories, RGBA8 live wake, and RGBA16F pools to 1024² saves approximately 48 MiB. Affected update pixels fall 75%.
- Risks: Narrow wakes and pool edges may blur. Actual bandwidth gains depend on driver allocation and cache behavior; avoid clearing history visibly on tier changes.
- Depends on: S10-I13

### S10-I13 Measure the low tier by material and caster workload

*professional · infra · effort M · impact 5 · confidence 5*

- What: Extend existing profiler labels with material identity, submitted triangles, shadow refreshes, and caster counts. Record pinned low/medium/high runs and single-feature ablations, then verify winners with profiling disabled on named integrated GPUs.
- Visitor benefit: Performance improvements are selected by actual weak-device benefit while preserving the picture.
- Data/DOM: n/a; development diagnostics only.
- Where: src/harbour/engine/gpu-passes.ts:85; gpu-passes.ts:114; gpu-passes.ts:184; scripts/harbour/shot.mjs:329; docs/pharosville/TESTING.md:145.
- Perf: No shipped-frame cost when disabled. Diagnostic queries add overhead; compare against ordinary end-to-end frame p95 and transition maxima.
- Risks: RTX rankings need not transfer to UMA hardware. Include Safari's timer-unavailable path, thermal state, close/overview, storm, stale fog, winter, and HiDPI.
- Depends on: —

## Top picks

1. S10-I6 — Fixes two concrete quality regressions and establishes safe preparation for further shader reductions.
2. S10-I5 — Small, exact removal of work that low tier cannot display.
3. S10-I1 — Targets the dominant shared shader with minimal geometry or compositional risk.
4. S10-I2 — Water covers much of the frame and retains substantial redundant work at low.
5. S10-I4 — Addresses both shadow-map generation and per-pixel reception; current low mainly reduces refresh cadence.

## Operator decisions

- DECISION-NEEDED, S10-I7: Is automatic world rendering below DPR 1 acceptable at 0.85 and 0.75 while DOM text stays native-resolution?
- Which named weak integrated GPU must meet the 16.7 ms target alongside the existing Apple Silicon Safari/Chrome gate, and who can provide those hardware runs?

## Cross-lane hooks

- Engine/frame-pacing work should own S10-I6 and coordinate all new shader variants, retained programs, cancellation, and low↔medium transition measurements.
- Ocean and fleet owners must preserve shared displacement, hull contact, Shoals coloring, sea-state ordering, and v1.4.1 far-emblem legibility during simplification.
- Art/assets work should supply distant decorative geometry and shadow proxies through existing Blender scripts; preserve landmark silhouettes and analytical markings.
- Sky work should retain baked cloud impostors and opaque compositing. Cloud temporal reprojection is lower priority than kit/water shading and must never delay DEWS fronts.
- Validation should preserve the existing depth prepass and early-depth ordering unless an uninstrumented hardware comparison proves a replacement better.
- Skipped: edits, browsers, test execution, and fresh iGPU/Safari captures. Risk: estimated savings overlap and do not establish 60 fps.
