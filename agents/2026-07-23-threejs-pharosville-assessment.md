# PharosVille x Three.js Decision Assessment

Date: 2026-07-23

Status: Decision memo

Scope: Three.js technical research, current PharosVille architecture review,
product and visual assessment, performance feasibility, target architecture,
migration plan, and go/no-go criteria.

## Executive Decision

**GO for a bounded, production-quality Three.js vertical slice.**

**NO-GO for authorizing a full PharosVille rewrite today.**

Three.js can materially improve PharosVille's depth, water, lighting, weather,
camera staging, animation, and sense of place. It is capable of supporting the
desired "Japanese garden meets video game meets data analytics" experience with
good desktop performance.

The right proposal is not a new application. It is a new rendering substrate
under the existing PharosVille application:

1. Keep the API, data contracts, pure world model, authored geography, motion
   semantics, DOM detail surfaces, selection state, accessibility ledger, and
   desktop gate.
2. Replace the Canvas 2D drawing implementation with an orthographic Three.js
   renderer in an isolated experiment.
3. Begin as a hybrid 2.5D world, then introduce true 3D assets selectively.
4. Start production work with `WebGLRenderer`, not a WebGPU-only design.
5. Preserve the current Canvas renderer until the Three.js candidate passes
   visual, comprehension, accessibility, bundle, and performance gates.

The key strategic conclusion is:

> Three.js is a credible way to make PharosVille more poetic and spatial. It is
> not, by itself, the thing that will make PharosVille calm, understandable, or
> beautiful.

The current experience's main limitation is information density and narrative
pacing. A direct one-for-one conversion of every tile, ship, label, effect, and
piece of chrome into 3D would produce a more expensive version of the same
crowding. The renderer experiment must therefore test a product concept, not
just technical parity.

## The Short Answer

| Question | Assessment |
| --- | --- |
| Can Three.js make PharosVille more beautiful? | Yes, especially through real depth, coherent light, layered water, weather, materials, and camera framing. |
| Can it make the world more dynamic? | Yes. It offers a scene graph, animated transforms and models, shader-driven effects, GPU particles, raycasting, and spatial transitions. |
| Can it perform well? | Yes on the current desktop target, if the scene is batched, instanced, capped by quality tiers, and kept out of narrow/portrait devices. It is not automatically faster. |
| Will it make the product calmer? | Only if default density, camera pacing, visual hierarchy, and onboarding are redesigned. |
| Should all of PharosVille be rewritten? | No. Most of the current application is already renderer-neutral and should remain intact. |
| Should WebGPU be the production baseline? | No. Use WebGL 2 first and keep WebGPU as a measured lab lane. |
| Should React Three Fiber be mandatory? | No. Vanilla Three.js is the lower-risk first fit for the current imperative runtime. R3F v9 is a credible alternative to compare in a small skeleton. |
| Is image-to-3D enough for production assets? | No. It can accelerate concepting, but production assets still need technical-art cleanup, budgets, compression, anchors, LODs, and licensing review. |

## What Three.js Is

As of this assessment, the current npm release is
[`three@0.185.1`](https://www.npmjs.com/package/three), following the
[r185 release](https://github.com/mrdoob/three.js/releases/tag/r185).

Three.js is a JavaScript 3D rendering and scene toolkit. It is not a complete
game engine. It does not provide PharosVille's data ingestion, analytical model,
product state, narrative design, accessibility, or business rules.

The core runtime is:

- **Scene:** the root of a hierarchical scene graph.
- **Object3D / Group:** transformable nodes in that graph.
- **Geometry:** vertices and faces that define a shape.
- **Material:** how a surface is shaded.
- **Mesh:** geometry plus material plus transform.
- **Camera:** the projection and visible frustum.
- **Renderer:** draws the scene through a camera into a canvas.
- **Animation loop:** samples time, updates scene state, and renders a frame.

This model is covered in the official
[Three.js fundamentals guide](https://threejs.org/manual/en/fundamentals.html).
Three.js adds the difficult graphics primitives that PharosVille currently
implements directly in Canvas 2D: scene transforms, depth, camera projection,
lighting, materials, shadows, model loading, animation, GPU buffers, frustum
culling, raycasting, post-processing, and renderer telemetry.

A future PharosVille data flow should remain:

```text
same-origin /api data
        |
        v
existing query and completeness layer
        |
        v
existing immutable PharosVilleWorld
        |
        +------------------------------+
        |                              |
        v                              v
existing DOM truth              renderer adapter
details / ledger / search       world -> Three scene state
                                       |
                                       v
                              motion sample + camera
                                       |
                                       v
                                Three.js canvas
```

Three objects must not become the canonical analytical state. The renderer must
remain a projection of `PharosVilleWorld`.

## What Three.js Enables

### Depth And Camera

- Real height and depth rather than manually ordered sprites.
- Orthographic or perspective projection.
- Camera transitions, parallax, framed viewpoints, and controlled inspection.
- Frustum culling for objects outside the view.
- Natural screen projection for DOM labels and detail anchors.

An [`OrthographicCamera`](https://threejs.org/docs/pages/OrthographicCamera.html)
keeps apparent object size independent of distance. This is particularly useful
for PharosVille because market comparisons must not change with camera depth.

### Materials And Light

- Directional, hemisphere, ambient, point, and spot lighting.
- PBR metallic/roughness surfaces through
  [`MeshStandardMaterial`](https://threejs.org/docs/pages/MeshStandardMaterial.html).
- Environment lighting and coherent reflections.
- Baked lightmaps and ambient occlusion.
- Restrained real-time shadows.
- Tone mapping and color-space control.

This can make limestone, wood, bronze, sailcloth, water, fog, and the lighthouse
feel like one physical place rather than separately composited layers.

Lighting has a cost. Each shadow-casting light renders additional scene passes;
a point light may require six shadow renders. The official
[shadow guide](https://threejs.org/manual/en/shadows.html) supports the
recommended policy: one bounded directional shadow source, baked or fake
contact shadows for the rest.

### Water, Weather, And Atmosphere

- A single shader-driven sea surface rather than hundreds of live tile draws.
- Time, wind, threat, depth, foam, and zone uniforms.
- Fog, rain, lightning, mist, particles, and cloud layers.
- Selective bloom, color grading, and subtle vignette.
- More natural day, dusk, and night transitions.

These effects are valuable only when risk-zone colors and labels remain stable.
Lighting may add atmosphere, but it must not change analytical meaning.

### Models And Animation

- glTF/GLB models with meshes, materials, skeletal animation, morph targets,
  cameras, and lights.
- Shared animation clips and `AnimationMixer`.
- Procedural transform animation for bobbing, sails, lanterns, birds, and wakes.
- LOD variants for overview, inspect, and selected states.

Three recommends glTF for runtime delivery. Its
[`GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html) supports Draco,
Meshopt, KTX2/Basis textures, GPU instancing, modern PBR extensions, and
animation.

### Scale And Performance Tools

- [`InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html) renders
  many objects with one geometry and material in far fewer draw calls.
- [`BatchedMesh`](https://threejs.org/docs/pages/BatchedMesh.html) combines
  different geometries that share a material.
- [`LOD`](https://threejs.org/docs/pages/LOD.html) selects detail by distance.
- Frustum culling skips objects outside the camera.
- `renderer.info` reports draw calls, triangles, points, geometries, textures,
  and shader programs.
- On-demand rendering can stop work when the scene is static. The official
  [render-on-demand guide](https://threejs.org/manual/en/rendering-on-demand.html)
  explicitly calls out map and data-visualization use cases.

### Interaction

[`Raycaster`](https://threejs.org/docs/pages/Raycaster.html) maps a pointer ray
into scene intersections. It can return `instanceId` for instanced objects.
This is a good fit for ships, graves, props, and water areas, provided every
rendered object or instance maps back to a stable domain detail ID.

## What Three.js Does Not Solve

Three.js does not supply:

- A coherent art direction.
- Good 3D models.
- Data semantics or analytical accuracy.
- Narrative pacing or a guided observation experience.
- DOM accessibility.
- Asset budgets, compression policy, or licensing checks.
- Automatic performance.
- Cross-browser visual consistency.
- Product decisions about density and progressive disclosure.

The image-to-3D workflow in the motivating screenshot addresses only content
creation. It does not remove the need for:

- Clean topology.
- UVs and consistent materials.
- Correct origins, scale, axes, and anchors.
- Pick proxies and selection anchors.
- Polygon and texture budgets.
- Overview and inspect LODs.
- Mesh and texture compression.
- Animation review.
- Licensing and provenance.
- Cross-model stylistic consistency.

AI-generated 3D can be useful source material. It should enter the same technical
art pipeline as any other source, not bypass it.

## Current PharosVille Assessment

### The Existing App Is Already Engine-Like

PharosVille is not a typical React dashboard with a canvas added at the end. It
already contains the major layers of a small game/data engine:

- The browser calls same-origin `/api/*`, while the Pages Function protects the
  upstream secret and allowlist
  ([architecture](../docs/pharosville/ARCHITECTURE.md#L11-L45)).
- API responses are converted into a pure, frame-stable world before drawing
  ([architecture](../docs/pharosville/ARCHITECTURE.md#L47-L80)).
- `src/systems` is explicitly pure and deterministic, with no DOM, canvas,
  timer, or network dependency
  ([systems boundary](../src/systems/README.md#L1-L24)).
- The renderer owns layers, geometry, caching, hit testing, and assets
  ([renderer guide](../src/renderer/README.md#L1-L51)).
- One world-owned clock synchronizes motion, camera, drawing, picking, selection,
  and debug state.
- Adaptive DPR and the render scheduler shed decorative passes before
  analytical ones
  ([architecture](../docs/pharosville/ARCHITECTURE.md#L118-L139)).
- The canvas is a representation, while detail panels and the accessibility
  ledger preserve analytical truth
  ([visual invariants](../docs/pharosville/VISUAL_INVARIANTS.md#L15-L20)).

This separation is why a renderer transplant is realistic.

### Current Scale

Repository measurements made for this assessment:

- Approximately 67,700 TypeScript/TSX/CSS lines under `src`.
- Approximately 21,300 production lines in `src/renderer`.
- Approximately 9,600 renderer-test lines.
- Approximately 11,000 production lines and 10,200 test lines in `src/systems`.
- 3,136 authored map tiles.
- 2,693 water tiles and 443 land/shore tiles in the current world.
- 73 manifest assets, including 33 first-render and 40 deferred assets.
- 72 optional WebP twins and 13 animation sources.
- 8 standard harbor slots, plus the special TON dispatch rule.
- 12 titan ships and 6 heritage hulls.
- 187 live ships in the inspected production-data session.

The generated runtime facts document records the current asset and bundle
budgets
([runtime facts](../docs/pharosville/RUNTIME_FACTS.md#L30-L54)).

### Current Product Strengths

- The maritime metaphor is coherent:
  - Lighthouse = fleet PSI.
  - Harbors = chain supply.
  - Ships = active stablecoins.
  - Risk water = current peg/DEWS evidence.
  - Cemetery = dead or frozen lifecycle assets.
- The world is distinctive and richly authored.
- Day/night, weather, routes, wakes, search, selection, details, and keyboard
  controls already create a living observatory.
- Exact facts, caveats, and provenance are available without reading pixels.
- Reduced motion already produces a deterministic static representation.
- The desktop gate avoids data and rendering work on unsupported viewports
  ([visual invariants](../docs/pharosville/VISUAL_INVARIANTS.md#L7-L13)).

### Current Product Constraints

- The day composition is vivid but crowded. Ships, logos, flags, buildings,
  labels, waves, weather, and ornate controls compete at the same time.
- Night is more poetic but loses analytical scanning contrast.
- The first-visit legend teaches comprehensively, but it interrupts the world
  with a large reading task.
- The world moves continuously, but it does not yet teach through a paced
  sequence of observations.
- The current renderer already sheds atmospheric passes when frame pacing
  degrades. A 3D renderer would be asked to add exactly the effects that are
  first removed today.

### Measured Current Performance

The local production build passed the canonical bundle check:

| Chunk | Raw | Gzip |
| --- | ---: | ---: |
| Entry | 7.9 KiB | 3.0 KiB |
| Desktop data | 632.5 KiB | 173.5 KiB |
| World | 396.2 KiB | 126.0 KiB |
| Total JavaScript | 1,285.6 KiB | 382.4 KiB |
| Current total budget | 1,330 KiB | 400 KiB |

Only about 44.4 KiB raw and 17.6 KiB gzip remain in the current total budget.

The official minified Three.js distribution measured:

| Build | Raw | Gzip |
| --- | ---: | ---: |
| `three.module.min.js` | 365.6 KB | approximately 86.6 KB |
| `three.webgpu.min.js` | 667.9 KB | approximately 184.6 KB |
| `GLTFLoader.js` | 115.0 KB | approximately 25.1 KB |

Tree shaking changes the actual Vite result, but the conclusion is stable:
Three.js cannot simply be added to the current production bundle. It must
replace enough Canvas renderer code, use an intentionally separate experimental
chunk, or change the bundle contract with explicit approval. A permanent dual
renderer should not ship to every visitor.

The maintained perf lane also passed:

- Two sustained-motion tests passed.
- Cold first coherent frame was approximately 1.76 seconds in that run.
- Cold entity-pass average was approximately 4.07 ms.
- Steady entity-pass average was approximately 2.28 ms.

A separate live inspection at 1440 x 1000 showed:

- 187 animated ships, 149 currently visible.
- 103 moving ships and 272 drawables.
- Effective FPS around 58.6.
- Frame-pacing p90 around 25.1 ms.
- Scheduler in `recovery`, with seven ambient effects skipped.
- Approximately 6.0 million total canvas/cache backing pixels.
- First coherent frame around 1.95 seconds.

The local smooth target remains at least 50 FPS with frame-pacing p90 no more
than 24 ms and no long tasks
([testing guide](../docs/pharosville/TESTING.md#L98-L128)).

## Keep, Adapt, Replace

| Disposition | Current components |
| --- | --- |
| **Keep** | Pages Function and API allowlist; TanStack Query hooks; freshness and completeness handling; `PharosVilleWorld`; world types and builders; geography; risk placement; sea state; motion planning; detail models; visual-cue registry; search; selection; URL state; toolbar; time controls; legend; changelog; detail panel; announcements; accessibility ledger; desktop gate |
| **Adapt** | Camera and projection; render loop ownership; visibility pause; adaptive DPR; render quality scheduler; asset manifest; phased loading; first-coherent-frame state; hit-target publication; selection anchors; debug metrics; bundle and GPU budgets; visual tests |
| **Replace** | `drawPharosVille`; Canvas 2D layer and primitive code; static offscreen caches; ship-body raster cache; 2D depth sorting; rectangle-only pointer picking; canvas backing-pixel accounting |

Most analytical and motion tests should survive. Much of the renderer's 38 test
files and all visual baselines would need replacement or intentional adaptation.

## Recommended Product Direction

### Garden Observatory

The recommended concept is **PharosVille: Garden Observatory**.

The Japanese-garden reference should inform composition, not themed decoration:

- Negative space rather than filling every visible area.
- Asymmetry rather than a centered game-board composition.
- Framed views rather than free camera spectacle.
- Gradual reveal rather than simultaneous explanation.
- Seasonal and atmospheric change rather than constant effect activity.
- Moments of stillness between motion.

Do not add literal garden props merely to signal "Japan." Torii, pagodas,
raked-sand motifs, or decorative lore would weaken the maritime observatory
unless they have a real role in the existing world.

The sea-first map is an advantage. Its current 85.9% water can become purposeful
negative space instead of empty space between entities.

### Three Modes

#### Observe

The default mode for the requested sit-and-watch experience.

- Fixed-yaw, fixed-pitch orthographic camera.
- Slow, authored sequence of meaningful viewpoints.
- One observation and one concise factual caption at a time.
- Long holds, short transitions, and visible stillness.
- User input immediately pauses the sequence.
- No game objectives, rewards, auto-orbit, bounce, or camera sway.

A five-minute cycle could visit:

1. Lighthouse and fleet PSI.
2. The most important current risk-water change.
3. One growing or shrinking stablecoin.
4. One chain-concentration story.
5. One quiet cemetery history.

Each beat follows:

```text
framed visual focus -> one factual sentence -> optional inspect action
```

#### Explore

The familiar direct-manipulation mode:

- Pan.
- Zoom.
- Search.
- Select.
- Follow selected.
- Time controls.
- Fullscreen.

#### Analyze

The existing DOM truth:

- Exact values.
- Evidence and freshness.
- Source fields.
- Caveats.
- Links.
- Full fleet and cemetery information.
- Accessibility ledger.

### Semantic Zoom

A calmer default overview should not attempt to show the complete fleet at equal
visual strength.

Recommended levels:

- **Overview:** lighthouse, sea zones, harbor massing, titans/heritage hulls,
  current risk movers, and aggregate textual counts.
- **Explore:** more standard ships, dock details, zone labels, and route cues.
- **Inspect:** individual hull detail, logo/emblem, report-card marks, rigging,
  selection relations, and exact DOM panel.

Showing only 12-24 representative ships at overview is a deliberate change to
the current "dense individual ship field" invariant. If adopted, it requires
explicit product approval plus updates to
[`VISUAL_INVARIANTS.md`](../docs/pharosville/VISUAL_INVARIANTS.md#L43-L54),
tests, legend text, and accessibility wording. Every ship can still exist,
remain searchable, and appear when relevant without demanding equal overview
salience.

## Target Technical Architecture

### Recommended Stack

Initial production candidate:

```text
three@0.185.x pinned exactly
@types/three matching the pinned version
vanilla Three.js inside the existing React world host
WebGLRenderer
OrthographicCamera
GLTFLoader for selected 3D assets
MapControls or a small constrained camera controller
existing Vitest + Playwright infrastructure
```

Do not add physics. PharosVille already has deterministic water-safe routes, and
physics would add cost while weakening analytical repeatability.

### Renderer Interface

Create a small route-local interface that does not expose Three objects to the
world model:

```ts
interface WorldRenderer {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  setWorld(world: PharosVilleWorld): void;
  setViewport(viewport: ScreenPoint, requestedDpr: number): void;
  setCamera(camera: CameraState): void;
  renderFrame(frame: WorldFrame): WorldRenderMetrics;
  pick(point: ScreenPoint): HitTarget | null;
  project(detailId: string): ScreenPoint | null;
  dispose(): void;
}
```

The current Canvas implementation can temporarily implement the same interface,
which permits a controlled A/B comparison without duplicating the data layer.
The abstraction should be removed or simplified once the permanent renderer is
chosen.

### Frame Ownership

Use one loop only:

```ts
renderer.setAnimationLoop((timeMs) => {
  const frame = sampleWorldFrame(world, timeMs / 1000, camera);
  sceneAdapter.apply(frame);
  renderer.render(scene, camera3d);
  publishMetrics(renderer.info, frame);
});
```

Under reduced motion:

```ts
renderer.setAnimationLoop(null);
sceneAdapter.apply(sampleStaticWorldFrame(world, camera));
renderer.render(scene, camera3d);
```

Render one new frame on data, selection, camera, asset, or resize change.
Visibility pause, time normalization, debug state, and same-frame selection
sampling must remain aligned.

### Camera

Start with an `OrthographicCamera`:

- Fixed yaw and pitch.
- Pan and zoom only.
- Small, authored parallax during Observe transitions.
- Optional temporary inspect tilt, bounded and immediately reversible.
- No free orbit.
- No metric encoded through camera distance or perspective scale.

This preserves the current isometric mental map, URL camera state, stable label
placement, and size comparisons.

### Scene Composition

```text
Scene
|-- environment
|   |-- sky/fog
|   `-- light rig
|-- water
|   |-- base sea mesh
|   |-- semantic zone data texture / vertex data
|   `-- foam, wake, rain, reflection layers
|-- terrain
|   |-- merged island/coast geometry
|   `-- instanced material props
|-- districts
|   |-- lighthouse
|   |-- docks
|   |-- civic core
|   `-- cemetery
|-- ships
|   |-- standard instanced hull families
|   |-- heritage hulls
|   `-- titans
|-- ambient
|   |-- birds
|   |-- particles
|   `-- weather
|-- pick proxies
`-- selection / focus helpers
```

### Object Mapping

| PharosVille element | Three.js representation |
| --- | --- |
| 56 x 56 route/geography map | Keep as the canonical logical grid; generate merged render geometry from it |
| Sea | One or a few low-subdivision meshes; zone kind stored in vertex data or a compact data texture |
| Land, shore, cliffs | Merged geometry by material, or authored low-poly GLB while logical movement remains tile-based |
| Repeated rocks, trees, lamps, buoys, graves | `InstancedMesh` grouped by geometry and material |
| Mixed props sharing one material | `BatchedMesh` |
| Standard ships | 3-4 instanced low-poly hull families with per-instance transform/color and atlas/decal identity |
| Titans and heritage ships | Separate optimized GLB models with selected LODs |
| Docks | Unique low-poly meshes are acceptable at the current cap of 8, plus TON when present |
| Lighthouse | Unique mesh with a bounded emissive lantern, beam plane/cone, and one selection proxy |
| Risk labels | DOM overlay or crisp billboard/SDF text, always camera-facing and never occluded |
| Wakes | Instanced ribbons/planes or shader marks, capped by current motion priority |
| Rain, mist, birds | Small instanced or point sets, scheduler-controlled |
| Selection and focus | Simple geometry or DOM overlay driven by the selected domain ID |

Do not create one `Mesh` per tile. Do not create unique materials for every
ship. Those approaches would destroy batching and draw-call discipline.

### Picking And DOM Anchors

Raycasting is only part of the migration:

- Keep a stable object/instance to `detailId` map.
- Raycast only an interactive layer.
- Use enlarged invisible pick proxies for small ships and alpha assets.
- Preserve explicit priority for printed area labels.
- Project selected positions back to screen space for the DOM detail panel.
- Continue publishing keyboard targets and predictable focus order.
- Recompute instanced bounding spheres after transform changes when needed.

The Three canvas remains `aria-hidden`.

## Renderer Choice

### WebGLRenderer: Recommended Baseline

Three's current `WebGLRenderer` uses WebGL 2; WebGL 1 has not been supported
since r163
([official API](https://threejs.org/docs/pages/WebGLRenderer.html)).

Advantages:

- Mature implementation and examples.
- Broad WebGL 2 availability.
- Established material and post-processing ecosystem.
- Lower bundle cost than the WebGPU build.
- Predictable integration with the current browser test matrix.
- `compileAsync()` can reduce first-use shader stalls.

Use this for the decision slice and first production candidate.

### WebGPURenderer: Strategic Lab Lane

The
[official WebGPU renderer guide](https://threejs.org/manual/en/webgpurenderer)
states:

- WebGPU is preferred where available.
- A WebGL 2 backend is available as fallback.
- TSL provides backend-neutral shader authoring.
- A new node-based post-processing stack is available.
- The renderer is still experimental.
- Some applications can encounter missing features or better performance under
  `WebGLRenderer`.
- Existing `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, and
  `EffectComposer` work require migration.

MDN still marks
[WebGPU as non-Baseline](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).

The WebGPU build is also larger than the entire current PharosVille world gzip
budget before PharosVille code or assets.

Recommendation:

- Do not ship WebGPU-only.
- Do not make WebGPU a vertical-slice dependency.
- Keep materials and effects centralized so a future TSL port is possible.
- After WebGL parity, test the same slice through `WebGPURenderer` and its forced
  WebGL backend.

### Vanilla Three.js Versus React Three Fiber

Stable
[React Three Fiber v9 pairs with React 19](https://r3f.docs.pmnd.rs/getting-started/introduction),
which matches the current app.

R3F strengths:

- Declarative scene components.
- React lifecycle integration.
- Suspense and loader caching.
- Pointer events.
- Useful Drei ecosystem.
- On-demand frame modes and adaptive performance helpers.

Vanilla Three strengths for this repository:

- Direct fit with the existing imperative world loop.
- Smaller framework surface.
- Easier preservation of the custom scheduler and debug contract.
- Clear isolation between React DOM updates and per-frame mutation.
- A more direct future `OffscreenCanvas` path.

Recommendation:

- Use vanilla Three.js for the primary vertical slice.
- Spend no more than 1-2 days building the same lighthouse/water skeleton in R3F
  if maintainability is uncertain.
- Select R3F only if it clearly reduces ownership and lifecycle complexity
  without moving per-frame state into React renders.
- Do not adopt the experimental R3F v10 alpha.

## Asset Pipeline

### Runtime Format

Use GLB as the canonical 3D runtime format.

Pipeline:

```text
Blender / procedural source / AI-assisted source
        |
        v
technical-art cleanup
scale, origin, axes, topology, UV, materials, anchors
        |
        v
glTF validation
        |
        v
deduplicate + prune + LOD + Meshopt/Draco
        |
        v
resize textures + KTX2/Basis where justified
        |
        v
budget validation
        |
        v
local versioned GLB/KTX2 assets
```

[KTX2/Basis](https://www.khronos.org/ktx/) can reduce texture transfer and GPU
memory across devices. It adds transcoder/WASM/worker complexity, so it should
be introduced after the slice proves that texture memory is a real limit.

Texture dimensions matter more to GPU memory than compressed file size. The
Three.js [texture guide](https://threejs.org/manual/en/textures.html) gives the
useful approximation:

```text
GPU bytes ~= width * height * 4 * 1.33
```

### Asset Manifest Evolution

Preserve the useful current manifest concepts:

- Stable semantic ID.
- Critical or deferred phase.
- Source dimensions.
- Anchor and footprint.
- Pick/hit proxy.
- Cache version.
- Style anchor.
- Prompt and provenance.

Add:

- GLB path.
- Geometry counts.
- Material and draw-call expectations.
- Texture memory estimate.
- LOD paths and thresholds.
- Animation clip names.
- Pick-proxy node.
- Screen-label anchor node.
- Compression mode.
- Required renderer capabilities.

### Art Direction

Recommended visual lane:

- Stylized low-poly maritime miniature.
- Orthographic, slightly elevated view.
- Pale limestone, dark timber, oxidized bronze, restrained roofs and sails.
- Soft directional light and cool water bounce.
- Simple geometry with strong silhouette.
- Baked material richness rather than noisy textures.
- Clean water and large calm spaces.

Avoid:

- Photorealism.
- Generic glossy game assets.
- Excessive bloom.
- Per-object dynamic shadows.
- Literal Japanese theme props.
- Every ship as a bespoke high-poly model.
- Text baked into geometry or textures.

## Performance Plan

### Preserve The Current Quality Ladder

| Tier | Policy |
| --- | --- |
| Full | Capped high DPR, one bounded shadow source, restrained reflection/bloom, vegetation motion, localized weather |
| Balanced, default | Adaptive DPR, instanced scene, baked AO, simplified water, no per-ship shadows, tightly capped particles |
| Recovery | No reflections or post-processing, static vegetation, simpler water, aggressive LOD, all analytical cues retained |
| Constrained | Optional 30 FPS cap or render-on-change, no shadows/fog/particles, static water, priority/selected ships |
| Reduced motion | Deterministic static frame, no camera tour, no continuous RAF, render on data/camera/selection/resize only |

### Starting Budgets For The Slice

These are decision budgets, not permanent universal constants:

- Reference viewport: 1440 x 1000.
- Reference hardware: agreed midrange integrated-GPU laptop plus one stronger
  Apple Silicon or discrete-GPU device.
- Balanced steady state: frame-pacing p90 `<= 20 ms`.
- No sustained period below 45 FPS; target at least 50 FPS.
- No recurring long task above 50 ms during camera or selection interaction.
- Cold first coherent scene `<= 2.5 s` in the same local/CI methodology.
- Reduced motion: zero continuous RAF.
- Default overview: aim for `<= 150` draw calls, then tighten from measurement.
- One shadow-casting directional light.
- Adaptive DPR before semantic content is shed.
- No default post-processing pass that is required for data legibility.
- Context loss must recover or produce a useful fallback.

The suggested 6 MB compressed initial 3D payload is a prototype ceiling, not a
target. The first slice should aim substantially below it. Any permanent
increase to current JavaScript or first-render asset budgets requires a measured
quality benefit and explicit approval.

### Required Telemetry

Publish alongside the current debug contract:

- `renderer.info.render.calls`.
- Triangles, lines, and points.
- Active geometries and textures.
- Shader program count.
- Estimated texture GPU bytes.
- Model and texture load/decode duration.
- Shader compilation duration.
- First coherent frame.
- CPU frame-time and pacing percentiles.
- Quality tier and skipped effects.
- Long tasks.
- Context/device loss count.
- Disposal counts across world replacement.

### OffscreenCanvas

Three.js supports
[OffscreenCanvas](https://threejs.org/manual/en/offscreencanvas.html), but a
worker has no DOM, keyboard, or direct pointer access. Inputs, sizes, controls,
and accessibility events need proxy messages.

Do not start there. First use workers for asset decoding and data preparation.
Move the renderer off the main thread only if profiling proves main-thread
contention and the interaction cost is justified.

## Accessibility And Inclusion

The Three renderer must preserve the current contract:

- Canvas remains `aria-hidden`.
- DOM detail panel remains the exact analytical surface.
- Accessibility ledger remains complete.
- Keyboard target cycling and focus restoration remain predictable.
- Live announcements remain DOM-based.
- Color is not the only risk encoding.
- Night mode preserves zone, label, selection, and text contrast.
- Sound is optional and never required.
- A GPU or shader failure produces Canvas 2D fallback or a useful DOM/static
  overview, never a blank scene.
- The desktop gate runs before fetching world data or loading Three/GLB assets.

Reduced motion means:

- No Observe tour.
- No camera drift.
- Frozen water and weather.
- Deterministic ship placement.
- Static status encodings.
- Zero continuous animation loop.
- Full detail and ledger parity.

## Migration Plan

### Phase 0: Foundations, About 1 Week

- Pin the Three version.
- Add a separately lazy-loaded experimental renderer behind a local/query/build
  flag.
- Define `WorldRenderer`.
- Reuse the existing dense fixture.
- Implement orthographic camera, resize, quality metrics, context failure, and
  one static island plane.
- Confirm the desktop gate does not download or initialize Three.js on blocked
  viewports.

Exit: nonblank scene, clean lazy boundary, measured bundle cost, reduced-motion
one-shot proof, and no API or DOM regression.

### Phase 1: Decision Vertical Slice, About 3-5 Weeks

Build only:

- Central island.
- Lighthouse.
- Two docks.
- Two risk-water zones.
- 20 representative ships using 3-4 hull families.
- Day, dusk, and night.
- Selection, search, and detail anchors.
- One Observe sequence.
- Reduced motion.
- Balanced/recovery/constrained quality tiers.
- A/B switch against Canvas 2D using the same fixture and URL state.

This requires one experienced graphics/front-end engineer and a technical artist
working together. Art consistency is likely the critical path.

### Phase 2: Bakeoff, About 1-2 Weeks

- Run comprehension testing.
- Run performance tests on the agreed hardware.
- Test Chromium, Firefox, and Safari where available.
- Test WebGL failure and context loss.
- Test reduced motion and keyboard-only use.
- Compare bundle, first frame, memory, draw calls, and long-running stability.
- Review day/night screenshots and semantic parity.

Exit: explicit production go/no-go.

### Phase 3: Production Conversion, Only After A Pass

Order-of-magnitude estimate: an additional 3-6 months for a small team.

Work includes:

- Complete geography and districts.
- Full fleet strategy and semantic zoom.
- Titan/heritage model pipeline.
- All effects and visual cues.
- New asset validator.
- Complete telemetry.
- Renderer-test replacement.
- Visual baseline re-approval.
- Cross-browser and GPU hardening.
- Documentation and operational updates.
- Canvas renderer removal before final bundle enforcement.

This range is not a delivery commitment. The vertical slice exists partly to
replace it with a measured estimate.

## Go/No-Go Gates

Proceed from the vertical slice to full production only if every critical gate
passes.

### Product And Comprehension

- The atmosphere is clearly stronger than Canvas 2D, not merely novel.
- Default Observe mode is reported calmer and easier to watch.
- At least 80% of a small representative test group correctly identifies the
  meaning of lighthouse, water, docks, and ships after one minute without
  opening the full legend.
- Night mode remains analytically readable.
- User interruption of Observe is immediate and predictable.

### Data And Semantics

- The same fixture produces the same PSI, risk placement, dock, ship, cemetery,
  detail, and caveat meanings.
- Every analytical cue keeps its source fields, DOM equivalent, failure state,
  and reduced-motion equivalent.
- Routes still mean chain presence and risk patrol, never transfers.
- Camera depth, shadow, lighting, and perspective never encode importance.

### Accessibility

- Canvas remains supplementary to DOM truth.
- Keyboard, search, selection, focus restoration, and detail anchoring work.
- Reduced motion runs no continuous RAF.
- Color, texture, label, and DOM text remain redundant.
- GPU failure has a meaningful fallback.

### Performance

- Balanced p90 frame pacing `<= 20 ms` at 1440 x 1000 on the agreed reference
  machine.
- No sustained period below 45 FPS.
- No recurring interaction long tasks above 50 ms.
- Cold first coherent scene `<= 2.5 s` under the agreed method.
- Quality downshifts preserve labels, selection, zone meaning, and DOM facts.
- No unbounded GPU memory growth during a soak test.

### Engineering

- The world model remains renderer-neutral.
- The desktop gate prevents Three and 3D asset initialization on blocked
  viewports.
- The final production bundle has one renderer, not a permanent default dual
  runtime.
- Asset creation and optimization are reproducible.
- Resource disposal and context loss are tested.
- The team can maintain the result without depending on opaque generated code.

If a critical performance, comprehension, reduced-motion, or semantic gate
fails, stop the renderer rewrite. Apply the successful product ideas to Canvas
2D instead.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Full 3D art pipeline exceeds engineering effort | High | High | Use a hybrid 2.5D slice, one technical artist, explicit asset budgets, selective GLB conversion |
| Bundle exceeds current 400 KiB gzip budget | High | High | Separate experiment chunk, measure replacement savings, remove Canvas before production |
| Atmospheric effects degrade frame pacing | High | High | Balanced default, one shadow source, adaptive DPR, strict effect scheduler |
| 3D makes density and occlusion worse | Medium-high | High | Orthographic camera, semantic zoom, framed views, DOM labels, calm overview |
| Lighting corrupts semantic colors | Medium | High | Test day/night palette, preserve base zone colors, add texture/label redundancy |
| Accessibility regresses | Medium | High | Keep canvas hidden, reuse DOM truth, keyboard target publication, reduced-motion one-shot |
| WebGPU churn causes rework | Medium | Medium-high | WebGL production baseline, WebGPU lab lane, centralize custom materials |
| GPU resources leak across refreshes | Medium | High | Ownership registry, explicit `dispose()`, renderer telemetry, soak tests |
| Cross-GPU screenshots vary | High | Medium | Semantic assertions plus tolerances; fewer exact-pixel-only gates |
| Dual renderer becomes permanent | Medium | High | Time-box experiment; choose and remove one after bakeoff |
| Generated 3D assets are inconsistent or unlicensed | Medium-high | High | Provenance, technical-art review, licensing records, no direct runtime promotion |
| Free camera harms comprehension or comfort | Medium | High | Fixed orthographic camera, no free orbit, reduced-motion static behavior |

Three.js requires explicit GPU resource disposal; removing an object from a scene
does not free its geometry, material, textures, or render targets
([official disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html)).

## Decision Scorecard

| Dimension | Score | Notes |
| --- | ---: | --- |
| Strategic fit with the desired experience | 5/5 | Depth, light, water, weather, and camera staging directly support the vision |
| Reuse of current application | 4.5/5 | Pure world and DOM boundaries are unusually favorable |
| Visual upside | 5/5 | High, if art direction and pacing are strong |
| Analytical clarity | 3/5 | Can improve through semantic zoom, but 3D occlusion creates real risk |
| Desktop performance feasibility | 4/5 | Technically feasible with batching and tiers; must be proven on reference hardware |
| WebGL production maturity | 4.5/5 | Mature and broadly available |
| WebGPU production maturity | 2.5/5 | Promising, fallback-capable, but officially experimental and larger |
| Bundle fit | 2/5 | Current headroom is insufficient for additive adoption |
| Engineering cost | 2.5/5 | Renderer replacement is substantial but bounded by good architecture |
| Art-production cost | 2/5 | Likely the largest unknown and critical path |
| Accessibility fit | 4/5 | Strong if existing DOM architecture is preserved; poor if canvas-only |

Overall: **conditional GO for the vertical slice; current NO-GO for full
conversion.**

## Final Recommendation

Authorize a decision-grade vertical slice, not "PharosVille Three.js" as a
committed rewrite.

The slice should prove one thing:

> Can a restrained orthographic 3D Garden Observatory make PharosVille calmer,
> clearer, more beautiful, and more watchable while matching the current
> analytical, accessibility, and performance contracts?

If yes, proceed incrementally by replacing the rendering substrate and
introducing 3D assets selectively. If no, retain Canvas 2D and still adopt the
product improvements discovered here:

- Observe mode.
- Progressive education.
- Calmer overview density.
- Framed viewpoints.
- More stillness.
- Better night contrast.
- Stronger semantic zoom.

Those improvements are engine-independent and may deliver a large part of the
desired experience even without Three.js.

## Primary Sources

### Three.js

- [Three.js homepage](https://threejs.org/)
- [Current npm package](https://www.npmjs.com/package/three)
- [r185 release](https://github.com/mrdoob/three.js/releases/tag/r185)
- [Fundamentals](https://threejs.org/manual/en/fundamentals.html)
- [Installation and addons](https://threejs.org/manual/en/installation.html)
- [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [WebGPURenderer guide](https://threejs.org/manual/en/webgpurenderer)
- [WebGPURenderer API](https://threejs.org/docs/pages/WebGPURenderer.html)
- [Rendering on demand](https://threejs.org/manual/en/rendering-on-demand.html)
- [Responsive rendering and pixel ratio](https://threejs.org/manual/en/responsive.html)
- [glTF loading](https://threejs.org/manual/en/loading-3d-models.html)
- [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
- [BatchedMesh](https://threejs.org/docs/pages/BatchedMesh.html)
- [LOD](https://threejs.org/docs/pages/LOD.html)
- [Raycaster](https://threejs.org/docs/pages/Raycaster.html)
- [Texture memory](https://threejs.org/manual/en/textures.html)
- [Resource disposal](https://threejs.org/manual/en/how-to-dispose-of-objects.html)
- [OffscreenCanvas](https://threejs.org/manual/en/offscreencanvas.html)
- [Migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)

### Platform And Assets

- [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [Khronos glTF](https://www.khronos.org/gltf/)
- [Khronos KTX](https://www.khronos.org/ktx/)
- [React Three Fiber introduction](https://r3f.docs.pmnd.rs/getting-started/introduction)
- [R3F performance scaling](https://r3f.docs.pmnd.rs/advanced/scaling-performance)

### PharosVille

- [Product context](../PRODUCT.md)
- [Architecture](../docs/pharosville/ARCHITECTURE.md)
- [Visual invariants](../docs/pharosville/VISUAL_INVARIANTS.md)
- [Systems boundary](../src/systems/README.md)
- [Renderer boundary](../src/renderer/README.md)
- [Runtime facts](../docs/pharosville/RUNTIME_FACTS.md)
- [Testing and budgets](../docs/pharosville/TESTING.md)
- [Motion policy](../docs/pharosville/MOTION_POLICY.md)
- [Asset pipeline](../docs/pharosville/ASSET_PIPELINE.md)
- [Visual review atlas](../docs/pharosville/VISUAL_REVIEW_ATLAS.md)
