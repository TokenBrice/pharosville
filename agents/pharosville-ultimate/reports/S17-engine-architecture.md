# S17

## Executive summary

At 29e0b2a3, keep the single renderer, ordered systems, shared uniform references and existing preparation service. The main blockers are fragile shader replacements, unchecked service contracts and incomplete shader-variant publication. Code inspection found unprepared Low/full transitions, missing life-material invalidation, incomplete seasonal invalidation and negative hover lighting. Establish checked shader seams and complete variant identities first; then introduce typed registries, local GLSL includes and mechanical file splits. Reuse HarbourMaterials and ProgramPreparation rather than replacing them. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:17; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:637.

## Current state

- One Engine owns renderer, scene, camera, composer and lifetime; 17 registered systems update in explicit order. This is a strong, understandable foundation. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:87; /home/ahirice/Documents/git/pharosville/src/harbour/systems.ts:24.
- Static census excluding tests: 198 Harbour TS/TSX files, 42,300 lines. The 11 historical hot files total 7,261 lines. Largest relevant owners: fleet-system 1,595 lines/91.3 KB, sim 1,411/77.0 KB, world/materials 1,176/64.7 KB, ocean-material 539/32.6 KB. Evidence: /home/ahirice/Documents/git/pharosville/agents/claudeville-prettier/EXEC-RULES.md:45; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:1595; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:1176.
- Across production Harbour source: 13 authored onBeforeCompile hooks and 11 explicit authored cache-key functions, plus two hook/key forwarding sites. Kit/fleet alone contain seven hooks and 48 replace expressions; 42 replacements address 15 distinct Three include names. Lights additionally mutates one global ShaderChunk. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:721; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:445; /home/ahirice/Documents/git/pharosville/src/harbour/lights/lights-system.ts:23.
- Uniform typing already exists: WorldUniforms has 27 fields, BeamUniforms nine, FleetUniforms eight and SkyShared eight. Source-only assembly with beam bindings produced 50 kit and 60 fleet uniform dictionary entries; assembled ocean GLSL declares 56 unique uniform names. These are source counts, not active GPU uniform counts. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/uniforms.ts:8; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:697; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:44.
- Service census: 180 get calls, including 177 literal calls across 34 names; 178 gets have direct type assertions. There are 40 set calls, including 37 literal calls across 35 names. Additional constant keys hold beam uniforms and FX textures; SDF promises use a URL-derived namespace. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/types.ts:20; /home/ahirice/Documents/git/pharosville/src/harbour/beam/uniforms.ts:33; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/textures.ts:49; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/sdf-image.ts:15.
- Seven feature blocks hold 18 mutable module-global uniforms: cloud shadows, lamp wave, aerial tint, run-up, dew, sway and sun shadows. The single-engine assumption is documented, but these blocks bypass engine lifetime and fixture isolation. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/sky/cloud-shadow.ts:3; /home/ahirice/Documents/git/pharosville/src/harbour/lights/lamp-wave.ts:45; /home/ahirice/Documents/git/pharosville/src/harbour/world/sun-shadow.ts:23.
- Useful shader modules and factories already exist: shared beam lighting, fleet motion, cloud shadows, HarbourMaterials and chainedKitMaterial. Ocean already imports several feature chunks. The missing layer is checked composition and explicit contracts, not shader modularity from scratch. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/beam/beam-light-glsl.ts:18; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-motion-glsl.ts:12; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:1; /home/ahirice/Documents/git/pharosville/src/harbour/life/figure-kit.ts:107.
- ProgramPreparation already preserves uniform identity, prepares owned material copies, restores renderer targets, supports cancellation and retains programs through publication. Its timeout deliberately preserves scenery. These safeguards should remain the preparation boundary. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:17; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:150; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:183; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:259.
- Version-sensitive integration is scattered across a global Three lighting patch, renderer program-property reflection, DFG texture lookup and private bloom mip arrays. Existing bloom ownership tests are valuable. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/lights/lights-system.ts:23; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:249; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:433; /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:175; /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.test.ts:53.
- Shader unit tests inspect strings, references and cache keys; preparation tests mock compilation. Source-only probes confirmed life version invalidation differs from fleet and quantified the negative hover coefficient. No browser, GPU compilation, visual assessment or performance measurement was performed. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.test.ts:10; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.test.ts:16; /home/ahirice/Documents/git/pharosville/tests/visual/harbour-dom.spec.ts:3.

## Findings

### S17-F1 [high] Low/full shader changes bypass the preparation barrier

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:332; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:656; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-system.ts:195; /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:144.
- Detail: prepareQuality prepares post presets only. After the governor commits, material listeners change HB_LITE/HB_BEAM_VERT and invalidate kit, fleet, predepth and ocean programs. First entry into an unseen variant therefore leaves compilation for live rendering. The comment claiming tier-invariant world lighting is contradicted by current material code. Hitch duration requires hardware measurement.
- Fix: Prepare target world variants on owned copies before committing the tier. Retain their programs and publish defines/version changes together. Cache preparation by complete world feature signature, while preserving the existing resolution-only fast path.

### S17-F2 [medium] Life materials miss Low/full invalidation

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/life/figure-kit.ts:107; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:654; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:492; /home/ahirice/Documents/git/pharosville/node_modules/three/src/renderers/WebGLRenderer.js:2426.
- Detail: chainedKitMaterial inherits the kit hook and dynamic cache key but never calls mats.track. A source-only probe showed setLite changed its key while leaving material.version unchanged; the equivalent fleet material incremented its version. Three does not re-evaluate a custom key on every unchanged-material draw. Folk, gulls, flags, dolphins and herds can retain the previous tier's program.
- Fix: Register every derived kit material through one factory path, with disposal removing that registration. Add a small test asserting Low/full invalidation reaches life and fleet materials.

### S17-F3 [medium] Seasonal publication ignores crop shader classifications

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/season/season-system.ts:125; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:358; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:371; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:822.
- Detail: SeasonSystem prepares and invalidates programs only when bare-crown classification changes. Kit programs also specialize on HB_STOOKS and five HB_CROP_* flags. A long visit crossing one of those classification boundaries can update calendar uniforms and the computed cache key without publishing a matching material version, leaving old compiled crop branches active.
- Fix: Compare a complete calendar feature signature before publication. Prepare and invalidate when any compiled calendar flag changes. Test adjacent dates around crop/stook boundaries, including a boundary where bare-crown classification stays unchanged.

### S17-F4 [medium] Hover sheen becomes negative after dusk

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:432; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:485; /home/ahirice/Documents/git/pharosville/src/harbour/engine/time-of-day.ts:68; /home/ahirice/Documents/git/pharosville/src/harbour/engine/uniforms.ts:26.
- Detail: hbHoverSheen multiplies by 1-uLamp, although uLamp is emission strength rather than a normalized fade. The scalar coefficient is +0.084 at lamp=0.4, -0.42 at 4 and -6.3 at 46, before base colour, sun colour and highlight. Hovering a sail therefore subtracts light after dusk. This also demonstrates why number typing alone is insufficient.
- Fix: Use a bounded daylight/window-glow factor for the sheen. Add a numeric boundary test ensuring the contribution stays nonnegative and reaches zero at night; label uniform units in the registry.

### S17-F5 [medium] Shader composition silently depends on exact emitted text

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:725; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:732; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:454; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:457; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:460.
- Detail: The 48 kit/fleet replacement expressions include patches against application-emitted whitespace, another module's local declaration and Three's internal normal expression. A harmless refactor can make a replacement do nothing without throwing. Some failures still produce valid GLSL, so driver compilation alone cannot prove that beam positioning, fleet colour or aerial exemptions survived.
- Fix: Require exact anchor cardinality in development/tests, identify each patch by name and expose explicit application hook markers. Replace cross-module text surgery with named composition points.

### S17-F6 [medium] Service consumers can invent incompatible contracts

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/types.ts:19; /home/ahirice/Documents/git/pharosville/src/harbour/beam/beam-system.ts:40; /home/ahirice/Documents/git/pharosville/src/harbour/world/lighthouse-system.ts:22; /home/ahirice/Documents/git/pharosville/src/harbour/sky/sky-system.ts:66.
- Detail: Map<string, unknown> plus 178 asserted reads provides no compiler relationship between publishers and consumers. Existing exported contracts coexist with locally invented partial interfaces. Renames, wrong registrations and required-versus-late availability changes can therefore pass typechecking. This is an architectural regression risk, not evidence that every current cast is incorrect.
- Fix: Type the existing map with publisher-owned contracts and keyed get/set methods. Preserve intentional optional reads; assert required services only at their actual lifecycle boundary. Move URL-indexed caches out of the service namespace.

### S17-F7 [medium] Existing shader tests cannot catch driver compile failures

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.test.ts:10; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.test.ts:16; /home/ahirice/Documents/git/pharosville/tests/visual/harbour-dom.spec.ts:44; /home/ahirice/Documents/git/pharosville/scripts/harbour/shot.mjs:137.
- Detail: Source assertions and mocked compiler ownership tests are useful, but do not compile GLSL or verify linkage. DOM admission tests also allow an honest startup failure. Capture tooling records console messages, but there is no dedicated shader variant/link matrix. A syntax, varying, sampler or feature-combination error can escape the current focused tests.
- Fix: Keep source tests and add a real-GPU compile/link harness that fails on shader diagnostics. Cover reachable feature signatures, geometry modes and colour/depth twins using the existing shared browser connection.

### S17-F8 [medium] Private render passes do not always restore state on failure

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ocean/gpu-bake.ts:32; /home/ahirice/Documents/git/pharosville/src/harbour/lights/lights-system.ts:377; /home/ahirice/Documents/git/pharosville/src/harbour/world/depth-prepass.ts:106; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:249.
- Detail: FullscreenPass and renderPools restore renderer state only after render returns successfully. If rendering or a material hook throws, target/autoClear or clear settings remain altered; viewport/scissor changes can remain too. The next RAF is already scheduled. StaticDepthPass and ProgramPreparation already demonstrate the safer try/finally convention.
- Fix: Use try/finally around private renderer mutations and restore the exact previous state. Add one throwing-render test to each shared pass helper; carry this requirement into system lifecycle conventions.

## Ideas

### S17-I1 Make shader patch failures explicit

*professional · infra · effort S · impact 5 · confidence 5*

- What: Introduce a small checked replacement helper requiring the expected anchor count and a named patch identifier. Apply it to existing kit/fleet hooks before restructuring them. Test missing and duplicate anchors, plus expected application hooks. Reuse the guarded lighting-patch approach already present.
- Visitor benefit: Visual changes stop silently removing existing effects or breaking fleet lighting.
- Data/DOM: n/a; preserves existing analytical mappings and presentation.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:618; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:445; /home/ahirice/Documents/git/pharosville/src/harbour/lights/lights-system.ts:23.
- Perf: 0 draws, triangles or shader ALU. Checks run during composition, never per frame; estimated helper size below 1 KB gzip.
- Risks: Low regression risk. Existing intentionally repeated markers need explicit cardinality; avoid broad formatting changes.
- Depends on: —

### S17-I2 Prepare world variants before quality publication

*professional · infra · effort L · impact 5 · confidence 5*

- What: Extend existing preparation to enumerate materials affected by Low/full switches, compile target recipes on owned copies, retain their programs and commit atomically with the governor. Include ocean, kit-derived materials and predepth. Preserve DPR-only transitions without shader preparation.
- Visitor benefit: Automatic quality changes avoid introducing first-use shader stalls into an already slow frame.
- Data/DOM: n/a; quality continues changing decorative cost without changing data readings.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:333; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:183; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-system.ts:195.
- Perf: 0 additional steady-state draws/tris. Adds resident alternate programs and idle compilation; memory and transition latency require hardware measurement.
- Risks: Medium-high regression risk around cancellation, season changes and late materials. Never mutate live defines while awaiting compilation or discard scenery on timeout.
- Depends on: S17-I7, S17-I8

### S17-I3 Type the existing service map

*professional · infra · effort M · impact 5 · confidence 5*

- What: Add a ServiceMap using publisher-owned interfaces and typed get/set signatures over the existing Map. Migrate the 180 reads mechanically. Keep optional return values for late services and explicit required-service checks where already needed. Put SDF promise caching with asset ownership rather than accepting arbitrary registry keys.
- Visitor benefit: Future visual features integrate with fewer runtime omissions and less accidental coupling.
- Data/DOM: n/a; registry typing preserves service values, freshness rules and update order.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/types.ts:20; /home/ahirice/Documents/git/pharosville/src/harbour/ui/services.ts:110; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/sdf-image.ts:15.
- Perf: Same Map operations; 0 GPU cost. Types erase; a minimal runtime facade should add less than 1 KB gzip.
- Risks: Low-medium risk if kept mechanical. Do not turn intentionally absent services into startup failures or introduce a dependency-injection framework.
- Depends on: —

### S17-I4 Register uniform blocks with types and units

*professional · infra · effort L · impact 4 · confidence 5*

- What: Preserve WorldUniforms, BeamUniforms and FleetUniforms, then compose typed feature blocks with GLSL names, units, ranges and writer ownership. Replace broad Record returns with inferred block types. Fix hover's radiance/fade confusion first. Move mutable feature blocks into engine scope incrementally, retaining identical IUniform references.
- Visitor benefit: Lighting changes remain coherent and avoid unit mistakes, stale bindings or state leaking between fixtures and mounts.
- Data/DOM: n/a; no new analytical cue. Keep radiance separate from normalized fades and preserve reduced-motion clocks.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/uniforms.ts:8; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:697; /home/ahirice/Documents/git/pharosville/src/harbour/beam/beam-light-glsl.ts:127; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:436.
- Perf: 0 new draws/ALU. Allocate blocks once per engine; assertions remain development-only. Estimated registry overhead below 2 KB gzip.
- Risks: Medium risk: replacing uniform objects breaks shared-reference propagation. Migrate one block per change and assert reference identity through preparation copies.
- Depends on: S17-I3

### S17-I5 Resolve named GLSL includes locally

*professional · infra · effort M · impact 5 · confidence 4*

- What: Add a small local resolver for named application includes such as hb/beam-light and hb/fleet-motion. Resolve dependencies deterministically, reject missing/cyclic includes and deduplicate shared declarations. Preserve Three includes for Three itself. Publish explicit pose, world-position, surface and outgoing-light hooks instead of matching another module's emitted statements.
- Visitor benefit: Artists can improve one effect without accidentally removing another effect sharing the material.
- Data/DOM: n/a; composition changes only, with existing signal uniforms and equations preserved.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:745; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:454; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:78.
- Perf: 0 steady-state GPU cost; composition runs at recipe construction. Estimated resolver overhead below 2 KB gzip; no new dependency.
- Risks: Medium risk from declaration order and duplicate functions. Preserve shader text during initial migration; retain intentionally different noise functions and depth behaviour.
- Depends on: S17-I1, S17-I7, S17-I10

### S17-I6 Extend the existing material factory

*professional · infra · effort M · impact 4 · confidence 5*

- What: Unify fleet and life derivation through HarbourMaterials using explicit recipe hooks. The factory binds typed uniform blocks, registers derived materials, composes cache identity and records depth/predepth companions. Automatically unregister disposed derivatives. Keep ShaderMaterial effects supported without forcing them into MeshStandardMaterial.
- Visitor benefit: New visual effects consistently inherit lighting, season changes, preparation and cleanup.
- Data/DOM: n/a; reuse existing material semantics and colour/depth relationships.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:637; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:440; /home/ahirice/Documents/git/pharosville/src/harbour/life/figure-kit.ts:107.
- Perf: Target identical materials, programs and draws. Construction-only bookkeeping; estimated helper overhead below 1 KB gzip.
- Risks: Medium risk. Preserve opposite fleet/life pose-composition order, Three built-in cache parameters and intentional static foliage shadows.
- Depends on: S17-I5, S17-I8

### S17-I7 Add a real shader compile matrix

*professional · infra · effort L · impact 5 · confidence 5*

- What: Expose recipe fixtures for source assembly, then compile/link and minimally draw them through the existing shared real-GPU connection. Fail on shader diagnostics and retain complete logs. Cover reachable calendar signatures, Low/full, static/instanced/batched geometry and colour/depth/predepth twins. Keep fast source assertions in ordinary unit tests.
- Visitor benefit: Broken shader combinations are caught before visitors encounter missing boats, black surfaces or startup failures.
- Data/DOM: n/a; fixtures must exercise current, stale and unavailable bindings without inventing analytical states.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.test.ts:10; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.test.ts:16; /home/ahirice/Documents/git/pharosville/scripts/harbour/shared-browser.mjs:118.
- Perf: 0 production KB/draws/ALU. Test cost scales with reachable program signatures; avoid a Cartesian product of impossible calendar combinations.
- Risks: Low production risk. Requires real GPU availability; one driver cannot establish Safari/Apple compatibility. These tests provide correctness evidence, not aesthetic or performance approval.
- Depends on: S17-I1

### S17-I8 Use one complete shader feature signature

*professional · infra · effort M · impact 5 · confidence 5*

- What: Compute one immutable feature descriptor for pattern, bare crowns, stooks, crop flags and lite mode. Use it for defines, application cache keys, invalidation and preparation identity. Derive child identities from parent recipes. Compare signatures during calendar updates and register every derivative. Keep animated uniform values outside cache identity.
- Visitor benefit: Calendar and quality changes display the intended world consistently without stale programs or unnecessary recompilation.
- Data/DOM: n/a; calendar remains decorative and existing analytical mappings stay intact.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:371; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:740; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:822; /home/ahirice/Documents/git/pharosville/src/harbour/season/season-system.ts:125.
- Perf: 0 shader ALU/draws. Compute classification when inputs change; avoids repeatedly performing cropStagesAt's 325 sample evaluations for defines and keys.
- Risks: Medium risk: a missing feature causes cache aliasing; excessive features multiply programs. Test all reachable signatures and retain Three's own geometry/light cache parameters.
- Depends on: S17-I1

### S17-I9 Specify system lifecycle and private-pass cleanup

*professional · infra · effort M · impact 4 · confidence 5*

- What: Document required versus deferred services, abort checks after awaits, publish-after-prepare, partial-init-safe idempotent disposal and unregister ownership. Require try/finally for renderer state changes. Apply conventions to sky/ocean/lights first, with failure-injection tests. Keep the existing ordered loop and preparation service.
- Visitor benefit: Failed loading, resizing and teardown recover cleanly instead of leaving partial rendering state.
- Data/DOM: n/a; retain honest unavailable states, neutral readings and current reduced-motion behaviour.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/types.ts:39; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:149; /home/ahirice/Documents/git/pharosville/src/harbour/sky/sky-system.ts:236; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/gpu-bake.ts:32.
- Perf: 0 new draws/tris; cleanup bookkeeping occurs at initialization/disposal. Renderer restoration adds no shader work.
- Risks: Low-medium risk. Avoid a new scheduler or universal resource base class. Do not require optional future services during eager initialization.
- Depends on: S17-I3

### S17-I10 Extract shader code before parallel visual work

*professional · infra · effort M · impact 5 · confidence 5*

- What: Mechanically separate world patterns/season GLSL, window geometry preparation and material construction; split fleet pose/livery/lighting, ocean surface/reflection/foam and beam effects into owned files. Extract post grading/effect sources and sky band-cache/camera calculations. Preserve exports and assembled shader text before introducing named includes.
- Visitor benefit: Parallel visual improvements ship with fewer integration regressions and shorter review cycles.
- Data/DOM: n/a; mechanical moves preserve equations, thresholds, clocks and DOM semantics.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:123; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:1081; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:70; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:44; /home/ahirice/Documents/git/pharosville/src/harbour/beam/beam-system.ts:62; /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:25.
- Perf: Target 0 draw/tri/ALU change and essentially unchanged bundle size. Compare assembled shader sources and cache keys before/after.
- Risks: Low-medium risk if moves are isolated. Import side effects and dependency cycles remain possible; never combine extraction with visual retuning.
- Depends on: S17-I1, S17-I7

### S17-I11 Split fleet, simulation and panel ownership

*professional · infra · effort L · impact 4 · confidence 4*

- What: Extract existing fleet texture writers, picking/debug and cove presentation blocks; move simulation contracts and collision helpers without changing PoseBuffer or worker payloads. Let UI owners extract individual panels and matching fact helpers. Keep systems.ts and WorldUniforms as small integration-owned contracts; new work belongs in feature files.
- Visitor benefit: Motion, information and rendering improvements can progress independently while preserving fleet readiness and behaviour.
- Data/DOM: n/a; retain route timing, pose buffer layout, source fields and existing panel wording.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:407; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:1405; /home/ahirice/Documents/git/pharosville/src/harbour/sim/sim.ts:30; /home/ahirice/Documents/git/pharosville/src/harbour/sim/sim.ts:1124; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:116; /home/ahirice/Documents/git/pharosville/src/harbour/ui/facts.ts:70.
- Perf: Target identical allocations, uploads, worker messages and draw counts. Avoid introducing per-boat objects or virtual dispatch.
- Risks: Medium-high risk for simulation extraction. Sequence by owner and retain reconciliation, route and readiness tests; defer unrelated blocks until actual lane contention warrants moving them.
- Depends on: S17-I3

### S17-I12 Contain dependency internals in tested adapters

*professional · infra · effort M · impact 4 · confidence 5*

- What: Extract narrowly scoped adapters for Three's point-light chunk, owned-program reflection/DFG access and postprocessing bloom mip ownership. Retain pinned dependencies and existing tests; add shape/anchor checks that fail clearly during upgrades. Keep these exceptions out of feature shader and system code.
- Visitor benefit: Library upgrades become less likely to cause widespread lighting, loading or memory regressions.
- Data/DOM: n/a; preserves existing rendering and resource ownership.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/lights/lights-system.ts:23; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:249; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:433; /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:175.
- Perf: 0 new GPU work; extraction should preserve current code paths. Compatibility assertions run during tests/startup, not per frame.
- Risks: Low-medium risk. Adapters expose dependency coupling rather than removing it; do not expand them into a general renderer abstraction.
- Depends on: S17-I1, S17-I7

## Top picks

1. S17-I1 — Highest enabling value per day: catches silent shader surgery failures before any larger refactor; low regression risk.
2. S17-I8 — One complete feature signature fixes seasonal publication and provides the foundation for safe quality preparation.
3. S17-I3 — Removes unchecked contracts across 180 service reads with mostly mechanical edits and no GPU cost.
4. S17-I7 — Costs more initially, but gives every subsequent shader lane a shared correctness gate across variants and depth twins.
5. S17-I10 — Mechanical extraction creates independent ownership before parallel work; unlocks named includes without mixing structural and visual changes.

## Operator decisions


## Cross-lane hooks

- Sequence 1: land S17-I1 and S17-I8, plus focused fixes for S17-F2 and S17-F4. Add small regression tests before moving shader source. These corrections should not wait for the broader architecture work.
- Sequence 2: establish S17-I7, then implement S17-I2. Verify first transitions into both Low and full variants, calendar supersession, cancellation and late materials; require zero unexpected first-use world programs after publication.
- Sequence 3: land S17-I3 as a mechanical contract migration. Perform S17-I10 as separate source-preserving moves, then S17-I5 and S17-I6. Migrate S17-I4 one uniform block at a time.
- Sequence 4: apply S17-I9 and S17-I12 with focused failure tests. Let fleet/simulation/UI owners schedule S17-I11 around real contention; preserve buffer formats and public exports throughout.
- Parallel visual lanes should own feature shader files after extraction. Assign one integrator to systems.ts, shared service contracts, uniform signatures and material recipe composition. Preserve pose ordering, depth parity, reduced motion and all existing analytical meanings.
- Performance/device lanes must measure alternate-program residency, startup cost and quality-transition stalls on the Apple Silicon Safari/Chrome gate. Source counts and desktop capture facts cannot establish integrated-GPU performance.
- Skipped: browsers, GPU compilation, visual/performance checks and the full test suite. Repository files were unchanged; checks were read-only census and source-only assembly probes.
- Risk: the identified publication and lighting defects are code-supported; their visible severity and stall duration remain unmeasured.
