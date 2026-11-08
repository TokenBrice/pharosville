# S22

## Executive summary

The WebGL2 foundation already includes meshopt, quantized GLBs, BatchedMesh ships, merged scenery, HDR half-float postprocessing, SMAA, cached shadows, and compileAsync. Prioritize two concrete fixes: prepare Low shader variants before quality transitions and stop generating unused Low-tier sea shadows. Next, address synchronous ground readback, expanded runtime geometry, and the large uncompressed emblem canvas. KTX2 belongs on immutable identity atlases, not exact sea data. Instancing and spatial batches offer broader device benefits than additional screen effects. Treat SSAO, MRT, PCSS, temporal AA, and render workers as measured experiments.

## Current state

- Pinned dependencies are three 0.186.0, postprocessing 6.39.5, n8ao 2.0.1, and meshoptimizer 1.2.0. No n8ao import exists in application source; installed does not mean rendered. Evidence: package.json:81, package.json:102, src/harbour/engine/post.ts:2.
- Every one of 91 public GLBs declares EXT_meshopt_compression and KHR_mesh_quantization; a read-only header scan found zero embedded images. Runtime meshopt decoding is already configured. Evidence: src/harbour/engine/assets.ts:15; scripts/harbour/blender/hulls/export.py:117.
- Ships already share a BatchedMesh with per-object frustum culling and screen-size LOD hysteresis. Offscreen non-casters skip matrix uploads while interaction and simulation history remain current. Evidence: src/harbour/fleet/fleet-system.ts:357, src/harbour/fleet/fleet-system.ts:1007, src/harbour/fleet/fleet-system.ts:1060.
- Island and civic scenery already merge by material. These broad batches minimize submissions but limit spatial culling. Evidence: src/harbour/world/island-system.ts:50; src/harbour/civic/assemble.ts:110.
- The renderer already uses half-float composer buffers, AgX, graded bloom, SMAA, and an opaque static depth prepass. MSAA is not configured. Evidence: src/harbour/engine/engine.ts:88, src/harbour/engine/engine.ts:100; src/harbour/engine/post.ts:234.
- One texel-snapped directional shadow map is refreshed every frame on High and periodically on Medium/Low. Sea shadows already use blurred mip levels that dissolve thin casters; the historical hard-water-shadow criticism is addressed in code. Evidence: src/harbour/world/sun.ts:57; src/harbour/world/sun-shadow.ts:48.
- AO already combines Blender AO multiplied into island vertex RGB with eight runtime height-field samples per shaded fragment. Adding baked AO again would duplicate existing work. Evidence: scripts/harbour/blender/island/hb_export.py:330; src/harbour/world/materials.ts:313.
- Shader preparation already stages textures and uses compileAsync when KHR_parallel_shader_compile exists, with synchronous compilation otherwise. Its quality-transition coverage currently excludes changing world programs. Evidence: src/harbour/engine/prepare.ts:102, src/harbour/engine/prepare.ts:223; src/harbour/engine/engine.ts:332.
- Production already supplies immutable assets, Brotli GLB packs, and byte-exact sea transport. Transport compression does not compress GPU texture storage. Evidence: scripts/harbour/build-asset-registry.mjs:29, scripts/harbour/build-asset-registry.mjs:41, scripts/harbour/build-asset-registry.mjs:67.
- Existing RTX pass timings emphasize scenery, fleet, and shadows over individual post effects. They do not establish Apple Silicon or Safari costs. Evidence: agents/pharosville-ultimate/shots/gpu-passes-summary.txt:1; agents/claudeville-prettier/exec/INTEGRATION-NOTES.md:39.

## Findings

### S22-F1 [medium] Low-tier world shaders bypass transition preparation

- Evidence: src/harbour/engine/engine.ts:332; src/harbour/world/materials.ts:656; src/harbour/world/materials.ts:1171; src/harbour/ocean/ocean-system.ts:198; src/harbour/engine/engine.test.ts:73
- Detail: prepareQuality warms only postprocessing presets. Committing Low changes kit, derived fleet, static-depth, and ocean shader variants through HB_LITE and needsUpdate. Their first unseen variants can therefore compile during visible rendering, precisely when an overloaded device changes tier. The existing test explicitly checks only post presets.
- Fix: Prepare affected world variants under scoped target-tier state before publication; retain their programs and cover Low↔Medium transitions, late additions, and season invalidation.

### S22-F2 [medium] Low generates a sea-shadow mask its shader never reads

- Evidence: src/harbour/world/sun.ts:99; src/harbour/world/sun-shadow.ts:54; src/harbour/world/sun-shadow.ts:102
- Detail: HB_LITE returns fully lit before sampling sea shadows, yet SunRig still resolves the shadow depth into a 1024×1024 R8 mask and generates its mip chain after Low shadow refreshes. Grep found no other active mask consumer. This is avoidable offscreen work on the cheapest tier.
- Fix: Skip sea-mask allocation and resolution while Low disables its consumer; invalidate and resolve before publishing a sampling tier.

### S22-F3 [medium] Emblem transport savings conceal a large GPU allocation

- Evidence: public/harbour/emblems.json:1; src/harbour/fleet/emblems.ts:41; src/harbour/fleet/emblems.ts:95; src/harbour/fleet/emblems.ts:162
- Detail: The 4096-wide CanvasTexture combines immutable logos with mutable monograms. Logo loading requires at least 21 rows of 128 pixels: approximately 56 MiB including RGBA8 mipmaps, before canvas backing storage. Maximum growth reaches approximately 85 MiB. Changing a monogram invalidates the combined texture; growth explicitly reallocates it. Upload time was not measured.
- Fix: Separate immutable logos from demand-sized monograms; evaluate KTX2 for logos and bounded updates for the mutable texture, preserving identity pixels through review.

### S22-F4 [medium] Runtime baking expands compressed geometry into wide float buffers

- Evidence: src/harbour/fleet/hull-kit.ts:262; src/harbour/civic/assemble.ts:130; src/harbour/engine/static-merge.ts:201; src/harbour/world/materials.ts:1024
- Detail: Meshopt and quantization reduce asset bytes, but fleet baking emits eleven Float32 attributes totaling 128 bytes per vertex before indices. Civic merging similarly emits Float32 colors and normals. The current transport optimization therefore leaves substantial allocation, upload, and vertex-fetch costs.
- Fix: Pack safe attributes after baking and move deterministic fleet preparation into the build pipeline. Preserve position precision, pattern IDs, morph deltas, and material contracts.

### S22-F5 [medium] Ground initialization synchronously reads 16 MiB from the GPU

- Evidence: src/harbour/world/island-system.ts:60; src/harbour/world/ground.ts:43; src/harbour/world/ground.ts:77; node_modules/three/src/renderers/WebGLRenderer.js:3216
- Detail: Initialization renders a 1024² RGBA32F target and immediately calls synchronous readRenderTargetPixels, then copies only its red channel into the CPU height field. This forces GPU completion on the serial startup path. The exact stall duration is unmeasured.
- Fix: Await three's existing asynchronous readback, restoring renderer and scene state before waiting and preserving teardown/error handling. Consider an exact offline height-field asset afterward.

### S22-F6 [medium] The fleet's single-draw claim depends on an optional extension

- Evidence: src/harbour/fleet/fleet-system.ts:37; src/harbour/fleet/fleet-system.ts:357; node_modules/three/src/renderers/WebGLRenderer.js:1315
- Detail: Without WEBGL_multi_draw, three r186 loops over visible BatchedMesh entries and issues individual draws with a draw-ID uniform. Correctness survives, but fleet submission can scale with visible boats instead of remaining one call. Extension availability on the target Safari/Firefox devices was not tested.
- Fix: Record extension availability and actual fleet draw counts. If unsupported-device measurements justify it, use variant-grouped InstancedMesh draws within the same WebGL2 engine.

## Ideas

### S22-I1 Prepare all shaders changed by quality transitions

*all-devices · infra · effort M · impact 5 · confidence 5*

- What: Extend existing scoped preparation to kit, fleet, ocean, and static-depth Low variants before the governor commits a tier. Keep compileAsync and its current non-extension path.
- Visitor benefit: Quality reductions are less likely to introduce a visible compilation hitch.
- Data/DOM: n/a; rendering programs change, analytical values and DOM readings remain identical.
- Where: src/harbour/engine/engine.ts:332; src/harbour/engine/prepare.ts:183; src/harbour/world/materials.ts:656; src/harbour/ocean/ocean-system.ts:198
- Perf: Zero additional steady-state draws; additional resident program variants and idle preparation. Hitch reduction needs measurement.
- Risks: WebGL2-compatible across target browsers; KHR_parallel_shader_compile remains optional. Scope restoration, season changes, and cancellation must preserve live materials.
- Depends on: —

### S22-I2 Stop unused Low-tier sea-shadow rendering

*all-devices · infra · effort S · impact 4 · confidence 5*

- What: Gate SeaShadowMask resolution on an active sampling consumer. Refresh its contents before leaving Low; optionally release its target after sustained Low operation.
- Visitor benefit: Weak devices spend less work on an invisible effect.
- Data/DOM: n/a; Low already displays no sea-shadow contribution.
- Where: src/harbour/world/sun.ts:99; src/harbour/world/sun-shadow.ts:54; src/harbour/world/sun-shadow.ts:102
- Perf: Removes one mask draw plus mip generation per shadow refresh; approximately 1.33 MiB target storage if released. Millisecond gain unmeasured.
- Risks: Uses existing WebGL2 APIs on all target browsers. Prevent stale masks or a one-frame flash when restoring Medium/High.
- Depends on: —

### S22-I3 Compress immutable identity atlases with KTX2

*all-devices · infra · effort L · impact 5 · confidence 4*

- What: Split static emblem logos from mutable monograms, then evaluate UASTC KTX2 with authored mipmaps for logos and crests. Use KTX2Loader.detectSupport; retain the existing image path when compression is unavailable. Keep sea data and lettering SDF lossless.
- Visitor benefit: Lower GPU memory pressure and smaller texture uploads, especially on tablets.
- Data/DOM: n/a; preserve coin/chain identity, alpha edges, color space, and existing DOM names.
- Where: src/harbour/fleet/emblems.ts:53; src/harbour/identity/identity-system.ts:93; scripts/harbour/build-asset-registry.mjs:60; node_modules/three/examples/jsm/loaders/KTX2Loader.js:246
- Perf: An 8-bpp GPU format would reduce static emblem mip storage from approximately 53 to 13 MiB. Adds approximately 571 KiB raw lazy transcoder assets and unmeasured transcode time.
- Risks: Formats depend on browser/GPU extensions, including Safari. Tiny logos require review. Loader creates blob workers; public/_headers:10 needs an explicit compatible worker policy or a same-origin worker adaptation.
- Depends on: —

### S22-I4 Keep prepared geometry compact on the GPU

*all-devices · infra · effort L · impact 5 · confidence 4*

- What: Prebuild deterministic fleet attribute layouts and pack normals, colors, axes, and categorical metadata into suitable normalized/integer buffers. Start with attributes that need no custom position reconstruction; retain meshopt transport.
- Visitor benefit: Less startup allocation, geometry upload, and vertex bandwidth.
- Data/DOM: n/a; preserve hull family, supply class, emblem placement, and motion contracts.
- Where: src/harbour/fleet/hull-kit.ts:96; src/harbour/fleet/hull-kit.ts:262; src/harbour/civic/assemble.ts:130; scripts/harbour/blender/hulls/export.py:117
- Perf: Estimated 25–50% reduction in prepared attribute bytes, depending on precision choices; zero new draws. Startup and frame gains require measurement.
- Risks: Normalized attributes work in WebGL2 across targets. Quantization must preserve pattern IDs and furl/rig geometry. BatchedMesh members must share attribute layouts; update geometry-contract tests.
- Depends on: —

### S22-I5 Partition existing static merges into spatial cells

*all-devices · infra · effort L · impact 4 · confidence 3*

- What: Compare current world-wide material merges against a small grid of material batches with conservative bounds. Cull cells outside the camera and shadow frusta; later test conservative terrain occlusion. Prefer ordinary merged meshes before another BatchedMesh dependency.
- Visitor benefit: Close views avoid processing distant town geometry.
- Data/DOM: n/a; selected landmarks and existing picking anchors retain their identities.
- Where: src/harbour/world/island-system.ts:50; src/harbour/civic/assemble.ts:110; src/harbour/world/depth-prepass.ts:15; src/harbour/identity/labels.ts:340
- Perf: Estimated 4–16 spatial cells; more submissions at overview, fewer processed triangles when zoomed. Gains depend on view; keep only measured wins.
- Risks: Ordinary bounds culling works across WebGL2 browsers. Occlusion must never hide visible geometry or offscreen shadow casters. StaticDepthRegistry currently excludes BatchedMesh.
- Depends on: —

### S22-I6 Extend fleet LOD and handle missing multi-draw

*all-devices · infra · effort L · impact 4 · confidence 3*

- What: Add a third low-poly hull/rig level below a measured projected-size threshold. Retain existing BatchedMesh where efficient; evaluate variant-grouped InstancedMesh when WEBGL_multi_draw is absent. Prefer geometry over ship impostors until identity and furl states survive review.
- Visitor benefit: Dense fleets remain smooth without losing coin recognition.
- Data/DOM: n/a; preserve one boat per coin, live circuit poses, brand identity, and full detail for selected/hovered boats.
- Where: src/harbour/fleet/fleet-system.ts:78; src/harbour/fleet/fleet-system.ts:1058; src/harbour/fleet/fleet-far.ts:5; node_modules/three/src/renderers/WebGLRenderer.js:1317
- Perf: Target 50–80% fewer triangles for qualifying distant boats. Instancing trades per-boat fallback draws for per-variant/LOD draws; adds geometry and index-mapping maintenance.
- Risks: Instancing is WebGL2 baseline; multi-draw is optional. Require hysteresis and signal-preserving silhouettes. Impostors risk wrong orientation, shadows, and analytical legibility.
- Depends on: S22-I4

### S22-I7 Export foliage as reusable clumps with LOD

*all-devices · decorative · effort L · impact 3 · confidence 3*

- What: Have Blender export reusable tree/clump geometry plus transforms instead of only baking vegetation into broad island chunks. Use spatial InstancedMesh groups with a coarse distant clump; consider impostors only after low-poly geometry is insufficient.
- Visitor benefit: The hinterland keeps its shape with fewer distant vertices.
- Data/DOM: n/a; retain calendar-driven foliage and reduced-motion stillness.
- Where: scripts/harbour/blender/island/hb_export.py:393; src/harbour/world/island-system.ts:50; src/harbour/world/sway.ts:65
- Perf: Additional species/cell draws; potentially substantial duplicated-geometry savings. Seasonal impostors would add atlas storage and alpha overdraw.
- Risks: InstancedMesh works across WebGL2 targets. Preserve per-instance world-space sway, baked shading, seasonal leaf loss, and conservative shadow bounds. Billboard appearance needs operator review.
- Depends on: S22-I5

### S22-I8 Separate static shadow work from moving casters

*all-devices · infra · effort L · impact 3 · confidence 2*

- What: Prototype a cached static depth target copied into the working shadow target before drawing moving casters. Rebuild static depth only when the snapped light fit, sun direction, season, or static geometry changes.
- Visitor benefit: Moving ships retain shadows while static town casters cost less.
- Data/DOM: n/a; illumination changes only.
- Where: src/harbour/world/sun.ts:57; src/harbour/world/sun.ts:105; src/harbour/world/sway.ts:11; agents/pharosville-ultimate/shots/gpu-passes-summary.txt:3
- Perf: Adds one shadow-sized depth allocation and depth copy per refresh; removes repeated static caster draws. RTX shadow baseline is approximately 0.35 ms, so benefit may be small there.
- Risks: WebGL2 supports depth transfers, but formats and framebuffer completeness require target-browser checks. Seasonal discard and moving civic parts complicate invalidation; the copy can outweigh saved work.
- Depends on: —

### S22-I9 Test contact-dependent penumbrae before cascaded shadows

*prettier · decorative · effort L · impact 3 · confidence 2*

- What: Compare existing elevation-scaled PCF against a bounded blocker-search PCSS-lite variant on High. Keep one fitted map unless close-view evidence demonstrates inadequate resolution; cascades multiply caster work and are poorly justified by this bounded camera.
- Visitor benefit: Contact shadows can stay crisp while tall structures soften naturally.
- Data/DOM: n/a; no new analytical cue.
- Where: src/harbour/engine/engine.ts:93; src/harbour/world/sun.ts:85; src/harbour/world/sun-shadow.ts:48; src/harbour/engine/camera-rig.ts:48
- Perf: Approximately 8–16 additional shadow reads per affected fragment for a prototype; milliseconds unknown. Cascades would add maps and repeated caster submissions.
- Risks: WebGL2 implementation is feasible across targets, but custom three shader hooks are version-sensitive. Thin-caster leaks and noise are risks. Keep current sea treatment and cheaper tiers.
- Depends on: —

### S22-I10 Separate baked AO from albedo and reduce runtime AO taps

*prettier · decorative · effort L · impact 4 · confidence 3*

- What: Export baked AO as a dedicated normalized byte attribute rather than multiplying it into RGB. Apply it to indirect lighting; compare vertex-evaluated or reduced-tap height-field AO for static scenery against the current eight fragment samples.
- Visitor benefit: Cleaner sunlit colors and potentially cheaper contact depth.
- Data/DOM: n/a; preserve existing material pattern IDs in COLOR_0 alpha.
- Where: scripts/harbour/blender/island/hb_export.py:383; src/harbour/world/materials.ts:23; src/harbour/world/materials.ts:313; src/harbour/world/materials.ts:779
- Perf: Approximately one byte per vertex plus varying bandwidth; potentially removes up to eight fragment texture samples on qualifying surfaces. Actual gain depends on tessellation.
- Risks: WebGL2-compatible across targets. Coarse vertices can lose contact detail. Separating AO changes the established lighting balance and requires day/night review.
- Depends on: S22-I4

### S22-I11 REOPEN: half-resolution AO as a gated comparison

*prettier · decorative · effort M · impact 2 · confidence 2*

- What: Only after cheaper fixes, compare installed N8AOPostPass halfRes against current AO at close views on High. The new argument is replacing overlapping AO work, not stacking another effect. Retain the rejection if image improvement or hardware budget fails.
- Visitor benefit: Potentially stronger boat/building contact depth in close views.
- Data/DOM: n/a; exclude analytical overlays and preserve readable sails and signals.
- Where: agents/claudeville-prettier/PLAN.md:271; package.json:81; node_modules/n8ao/src/N8AOPostPass.js:91; src/harbour/engine/post.ts:234
- Perf: Quarter-resolution pixel population for halfRes AO, but additional depth, AO, filtering, and composite work. Budget approximately 1–3 ms experimentally on an iGPU; this is not a prediction.
- Risks: WebGL2 shader compatibility needs Safari/Firefox/Chrome validation. Custom fleet deformation, halos, transparency, and existing baked AO complicate integration. Keep disabled on Low/Medium; remove unused n8ao if rejected.
- Depends on: S22-I10

### S22-I12 Improve thin geometry coverage before temporal AA

*prettier · decorative · effort M · impact 4 · confidence 3*

- What: Add analytic edge coverage to mooring-line quads, whose fragment shader currently outputs solid color. Separately compare 2× MSAA plus existing SMAA for mast silhouettes on capable High devices. Alpha-to-coverage requires a multisampled target; enabling it alone cannot help.
- Visitor benefit: Calmer ropes and masts during camera movement.
- Data/DOM: n/a; preserve signal flags and selected-boat visibility.
- Where: src/harbour/fleet/mooring-lines.ts:28; src/harbour/fleet/mooring-lines.ts:34; src/harbour/engine/engine.ts:100; src/harbour/engine/post.ts:256
- Perf: Analytic coverage adds small shader work and blend/coverage considerations. MSAA adds multisample attachments and resolves; memory and GPU cost must be measured at Retina resolutions.
- Risks: WebGL2 MSAA sample counts vary by format/device. Safari needs framebuffer tests. TAA-lite is deferred: no motion-vector pipeline covers custom ships, sails, water, and disocclusion, so ghosting risk is substantial.
- Depends on: —

### S22-I13 Share normal/depth buffers only when multiple effects need them

*all-devices · infra · effort L · impact 2 · confidence 2*

- What: If approved effects require normals, compare an MRT normal attachment during the opaque pass against a separate NormalPass. Preserve the existing half-float HDR color pipeline; do not add a G-buffer solely because WebGL2 supports it.
- Visitor benefit: Future contact effects could share geometry work rather than redraw the town.
- Data/DOM: n/a; buffer production carries no new meaning.
- Where: src/harbour/engine/post.ts:234; src/harbour/world/depth-prepass.ts:94; src/harbour/world/materials.ts:721; src/harbour/fleet/fleet-material.ts:494
- Perf: One full-resolution RGBA8 normal attachment adds approximately 6.4 MB at 1600×1000, plus write bandwidth. MRT can avoid another geometry pass but is not free.
- Risks: MRT is WebGL2 baseline; attachment formats, HDR extensions, composer compatibility, and Safari completeness need checks. Every deformed shader must output matching normals. Prefer depth reconstruction if adequate.
- Depends on: S22-I11

### S22-I14 Make ground readback asynchronous

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Use readRenderTargetPixelsAsync inside async island initialization. Restore renderer state immediately after issuing work, await completion, then publish the existing GroundService. Preserve exact heights and abort-safe resource cleanup.
- Visitor benefit: Arrival can remain responsive while GPU height data completes.
- Data/DOM: n/a; ground, collision, placement, and identity calculations receive the same height samples.
- Where: src/harbour/world/ground.ts:77; src/harbour/world/island-system.ts:60; src/harbour/world/ground.test.ts:26; node_modules/three/src/renderers/WebGLRenderer.js:3261
- Perf: No extra steady-state draws. Async readback uses an additional approximately 16 MiB pixel-pack buffer temporarily; final CPU transfer and height extraction still cost time.
- Risks: Uses WebGL2 pixel-pack buffers and fences through three's existing API. Validate RGBA32F readability on target browsers. Async completion must not publish after engine disposal.
- Depends on: —

### S22-I15 DECISION-NEEDED: render-worker feasibility study

*all-devices · infra · effort XL · impact 2 · confidence 2*

- What: Consider transferring the existing WebGL2 canvas to an OffscreenCanvas worker only if CPU hitches remain after smaller fixes. Bridge camera/input/resize/visibility and data messages; keep DOM UI on the main thread. This requires a substantial engine-boundary redesign.
- Visitor benefit: Potentially more responsive DOM interaction during rendering work.
- Data/DOM: n/a; preserve viewport admission before worker creation, same-origin API rules, DOM readings, and reduced motion.
- Where: src/harbour/engine/engine.ts:87; src/harbour/engine/input.ts:30; src/harbour/fleet/emblems.ts:46; src/harbour/sim/warm-legs.ts:34
- Perf: Moves CPU work rather than reducing GPU cost; adds messaging, synchronization, and transferred-buffer management. Existing 2D OffscreenCanvas use proves nothing about worker WebGL2.
- Risks: Safari 26 worker-WebGL2 behavior is unverified here. Probe transferred-canvas getContext('webgl2') and asset decode capabilities; keep main-thread execution of the same renderer where unsupported. Picking and lifecycle regressions are significant.
- Depends on: S22-I1, S22-I4, S22-I14

## Top picks

1. S22-I1 — Fixes a concrete preparation gap at the moment overloaded devices need a smooth transition.
2. S22-I2 — Small, portable removal of GPU work with no intended image change.
3. S22-I14 — Reuses an installed three API to remove a synchronous startup dependency from the main thread.
4. S22-I4 — Extends existing meshopt work to the runtime allocations and vertex bandwidth it currently leaves untouched.
5. S22-I3 — Targets a demonstrably large GPU texture allocation; offers clearer memory savings than adding screen effects.

## Operator decisions

- May identity atlases accept reviewed compression differences and separate logo/monogram filtering, despite the pixel-preservation intent documented at src/harbour/fleet/emblems.ts:5?
- Should previously rejected screen-space AO receive a bounded High-only replacement experiment, or should the unused n8ao dependency be removed?
- Is a render-worker feasibility study worth XL effort after smaller CPU fixes, given that it cannot solve the historical iGPU GPU bottleneck?
- Would a future WebGPU investigation justify reopening the locked single-WebGL2-renderer decision? No renderer migration is recommended by this lane.

## Cross-lane hooks

- Rendering/performance owners should validate savings on Apple Silicon Safari 26 and Chrome, including Retina and tablet views; existing RTX measurements cannot establish those results.
- Asset owners must coordinate packed attributes, tree LOD, AO exports, manifests, immutable registry entries, and contract checks. Blender remains the art-authoring source.
- Identity and hosting owners must review KTX2 alpha/color fidelity, lazy transcoder bytes, worker CSP, and asset retention. Exact sea/SDF data must remain lossless.
- Fleet owners should record WEBGL_multi_draw availability and verify silhouettes, selection, shadows, and signals through LOD transitions before adopting instancing or impostors.
- Skipped: no edits, browsers, installs, renders, or test execution; startup checks and source/asset inspection only.
- Risk: performance estimates and browser capability proposals remain unmeasured on target hardware; this report does not establish release confidence.
