# S14

## Executive summary

The strongest compatibility fixes are defined shader math, render-target capability checks, context-loss recovery, and shader failures that prevent a false successful reveal. Reversed smoothstep edges and negative-base pow calls are concrete portability defects. Float-target support, compilation latency, and missing multi-draw acceleration are hardware-dependent risks, not demonstrated Safari or Firefox failures. DPR changes are currently missed after engine construction. Existing strengths include size-based admission, SMAA without MSAA, explicit sRGB output, parallel shader preparation, and a timer-unavailable governor path. The device matrix below is proposed validation; no browsers or GPU tests were run.

## Current state

- Admission checks both screen and window dimensions before importing React/world code; orientation events trigger size reevaluation without becoming orientation gates. Renderer construction failure retains useful arrival content. Evidence: /home/ahirice/Documents/git/pharosville/src/main.tsx:27, /home/ahirice/Documents/git/pharosville/src/main.tsx:48, /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:124.
- One WebGL renderer uses antialias:false, sRGB output, and post-owned tone mapping. Composer multisampling defaults to zero; SMAA handles antialiasing. The inspected path therefore avoids float-MSAA resolve compatibility problems. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:88, /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:256, /home/ahirice/Documents/git/pharosville/node_modules/postprocessing/build/index.js:948.
- HDR composition, sky reflections, lamp pools, and wake history request half-float targets. Ground baking additionally requires RGBA32F rendering and float readback. No application framebuffer-completeness checks were found. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:100, /home/ahirice/Documents/git/pharosville/src/harbour/sky/sky-system.ts:231, /home/ahirice/Documents/git/pharosville/src/harbour/lights/lights-system.ts:113, /home/ahirice/Documents/git/pharosville/src/harbour/ocean/wake.ts:167, /home/ahirice/Documents/git/pharosville/src/harbour/world/ground.ts:43.
- Do not confuse float sampling with float filtering: fleet RGBA32F data uses texelFetch; ground RGBA32F uses nearest filtering; AO and LUT linear filtering use half-float textures. Missing OES_texture_float_linear alone is not an established blocker for these paths. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:92, /home/ahirice/Documents/git/pharosville/src/harbour/world/ground.ts:43, /home/ahirice/Documents/git/pharosville/src/harbour/world/ground.ts:32, /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:242.
- Three defaults to highp and checks vertex/fragment precision support. Fleet samplers explicitly use highp. No RawShaderMaterial or application precision downgrade was found. Inspected loops have bounded maxima, including 18 beam steps, eight cloud banks, and 64 bake lobes; indexing alone is not evidence of a WebGL2 defect. Evidence: /home/ahirice/Documents/git/pharosville/node_modules/three/src/renderers/webgl/WebGLCapabilities.js:55, /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:80, /home/ahirice/Documents/git/pharosville/src/harbour/beam/beam-system.ts:124, /home/ahirice/Documents/git/pharosville/src/harbour/sky/clouds.ts:88.
- KHR_parallel_shader_compile is already used, with cancellation, idle slices, reflection, and a 30-second deadline. Without KHR, compilation/reflection can block; timeout retains partial preparation. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:79, /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:223, /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:248, /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:259.
- The governor detects timer-query availability and falls back to frame cadence with upward probes. Missing timing extensions do not prevent rendering, and GPU profiling reports unavailable rather than inventing measurements. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:82, /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:250, /home/ahirice/Documents/git/pharosville/src/harbour/engine/gpu-passes.ts:45.
- Audio correctly creates/resumes its context synchronously inside a gesture, supports webkitAudioContext, and serializes visibility transitions. Native interruption and rejected-resume recovery remain gaps. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/audio/controller.ts:97, /home/ahirice/Documents/git/pharosville/src/harbour/audio/controller.ts:158.
- CSS uses dvh with a vh fallback, svh without a vh fallback on welcome containers, and :has for keyboard expansion/layout enhancement. No container-query or backdrop-filter usage was found in application CSS. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:91, /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:442, /home/ahirice/Documents/git/pharosville/public/arrival-shell.css:95, /home/ahirice/Documents/git/pharosville/public/arrival-shell.css:126.
- sRGB is intentional and internally coordinated: Three sets drawingBufferColorSpace through outputColorSpace; grading and dither explicitly expect sRGB. Adding display-p3 only at the context would be incorrect. CI currently validates Chromium/Firefox DOM fallback, not real GPU portability. Evidence: /home/ahirice/Documents/git/pharosville/node_modules/three/src/renderers/WebGLRenderer.js:3670, /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:171, /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:247, /home/ahirice/Documents/git/pharosville/.github/workflows/deploy-cloudflare.yml:48.

## Findings

### S14-F1 [high] Reversed smoothstep edges produce undefined GLSL results

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:427; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:509; /home/ahirice/Documents/git/pharosville/src/harbour/sky/sky-glsl.ts:311; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:297; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/wake.ts:82.
- Detail: GLSL smoothstep is undefined when edge0 >= edge1. The sea, storm-front lip, lamp-height mask, and wake sides rely on descending edges. Different shader compilers may preserve the intended inverse ramp or optimize it differently. This is a source-level defect; no particular browser failure was reproduced.
- Fix: Replace descending ramps with 1.0 - smoothstep(lower, upper, value). Audit expression-valued edges too; do not apply GLSL replacements to THREE.MathUtils.smoothstep calls blindly.

### S14-F2 [high] Gaussian shader terms pass negative bases to pow

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ocean/wake.ts:81; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/wake.ts:106; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:107; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:298; /home/ahirice/Documents/git/pharosville/src/harbour/weather/rainbow.ts:45.
- Detail: GLSL pow has undefined results for negative bases, even when the exponent is 2.0. Signed offsets in wake lobes, rain rings, lamp bands, and rainbow lobes reach this case. A driver can produce NaNs or missing lobes. The downstream scrub can replace invalid scene pixels, but cannot reconstruct damaged wake-history values.
- Fix: Compute signed squares with x*x. Keep pow for proven nonnegative bases and noninteger shaping; verify representative negative, zero, and positive inputs.

### S14-F3 [high] WebGL2 admission does not verify required float targets

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:100; /home/ahirice/Documents/git/pharosville/src/harbour/world/ground.ts:43; /home/ahirice/Documents/git/pharosville/src/harbour/world/ground.ts:78; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/wake.ts:167.
- Detail: A successfully created WebGL2 context is insufficient proof that the requested RGBA16F, R16F, and RGBA32F attachments work. RGBA32F ground rendering particularly depends on float color-buffer support. Missing support or an incomplete framebuffer may generate GL errors rather than reject boot. The initialized readback array can then publish zero heights as real ground.
- Fix: Probe actual target formats and float readback before system initialization. Require EXT_color_buffer_float for the current ground implementation; route unsupported configurations to the existing poster with a specific reason.

### S14-F4 [high] Context restoration loses application-owned baked content

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ocean/textures.ts:48; /home/ahirice/Documents/git/pharosville/src/harbour/sky/clouds.ts:122; /home/ahirice/Documents/git/pharosville/src/harbour/world/island-system.ts:60; /home/ahirice/Documents/git/pharosville/node_modules/three/src/renderers/WebGLRenderer.js:1123; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:283.
- Detail: Three restores its internal GL state, but PharosVille has no context-loss/restoration lifecycle. Noise, ripple, cloud atlas, and ground targets are populated once; their GPU contents disappear while service caches remain. Rendering and rendered callbacks can continue during loss. Query handles and preparation caches also retain assumptions about the old context.
- Fix: Stop rendering and invalidate preparation on loss. Recover through a fresh Engine mount behind the poster, rebuilding all baked resources and query ownership before accepting completed frames.

### S14-F5 [high] Shader link failures can still satisfy the reveal contract

- Evidence: /home/ahirice/Documents/git/pharosville/node_modules/three/src/renderers/webgl/WebGLProgram.js:879; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:253; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:283; /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:90; /home/ahirice/Documents/git/pharosville/src/error-reporter.ts:166.
- Detail: Three's default shader-error path logs rather than throws. PharosVille installs no onShaderError callback and does not reject preparation based on program diagnostics. A returned composer call plus submitted fleet counts can therefore reveal a blank or incomplete world as live. Window error/rejection listeners do not capture ordinary console shader errors.
- Fix: Capture shader failures through renderer.debug.onShaderError, invalidate rendering readiness, report one bounded diagnostic, and retain or restore the existing failure shell.

### S14-F6 [medium] Startup bakes bypass the parallel preparation path

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ocean/gpu-bake.ts:57; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/textures.ts:27; /home/ahirice/Documents/git/pharosville/src/harbour/sky/clouds.ts:88; /home/ahirice/Documents/git/pharosville/src/harbour/sky/clouds.ts:138; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:170.
- Detail: Procedural noise/ripple and the cloud atlas immediately render during system initialization, before prepareWorld. Their first-use compilation can stall even when KHR exists. The ripple has 56 iterations; the cloud field evaluates up to 64 lobes repeatedly per pixel. Without KHR, later compile/reflection calls can also exceed the nominal four-millisecond submission slice.
- Fix: Prepare bake programs against their actual targets before first render, then yield between atlas cells. Measure cold compilation on ANGLE/D3D11, WebKit, and Mesa; do not describe the timer deadline as a hard blocking-work limit.

### S14-F7 [medium] Missing multi-draw acceleration creates a fleet CPU cliff

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:357; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:214; /home/ahirice/Documents/git/pharosville/node_modules/three/src/renderers/WebGLRenderer.js:1315; /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:225.
- Detail: Fleet rendering depends on BatchedMesh. Three correctly emulates absent WEBGL_multi_draw by setting a draw-ID uniform and issuing each draw separately, so this is a performance risk rather than an unsupported-shader bug. Fleet parts multiply submission work across color and shadow passes. DPR reduction cannot remove this CPU work; timed CPU-bound frames intentionally retain their rung.
- Fix: Record multi-draw availability and compare submission cost with it disabled. If the matrix fails, instance repeated geometry within the same WebGL renderer instead of relying on per-part emulated draws.

### S14-F8 [medium] DPR calibration is frozen at engine construction

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:74; /home/ahirice/Documents/git/pharosville/src/harbour/engine/quality.ts:50; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:404.
- Detail: The governor builds its device-DPR ladder once. Resize reads renderer.getPixelRatio rather than current devicePixelRatio. Moving a window between standard and Retina displays or changing browser zoom leaves the old cap in effect: rendering can stay blurry or spend pixels above the new display's useful ratio.
- Fix: Rebuild the ladder when devicePixelRatio changes, preserve explicit overrides, and publish the recalibrated ratio through the existing resize path.

### S14-F9 [medium] Resolution policy has no attachment-size or pixel-budget ceiling

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/quality.ts:50; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:412; /home/ahirice/Documents/git/pharosville/node_modules/postprocessing/build/index.js:1167; /home/ahirice/Documents/git/pharosville/node_modules/three/src/renderers/WebGLRenderer.js:683.
- Detail: DPR is capped at two, but width×DPR and height×DPR are not capped against attachment limits or total pixel cost. Large external displays can allocate very large half-float ping-pong buffers before the governor reacts. The main pair alone costs approximately 16 MB per million pixels, excluding depth and post targets.
- Fix: Clamp effective DPR against texture/renderbuffer limits and a measured physical-pixel budget before allocating the canvas/composer targets. Keep logical viewport dimensions and admission unchanged.

### S14-F10 [medium] Audio can remain selected and reported playing while suspended

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/audio/controller.ts:81; /home/ahirice/Documents/git/pharosville/src/harbour/audio/controller.ts:102; /home/ahirice/Documents/git/pharosville/src/harbour/audio/controller.ts:111; /home/ahirice/Documents/git/pharosville/src/harbour/audio/controller.ts:164.
- Detail: playing means an Ambience object exists, not that AudioContext.state is running. Resume failures are swallowed, no statechange listener handles native interruptions, and the first-gesture listener is disarmed before success is known. A Safari interruption or denied resume can leave sound silent until the visitor toggles off and on.
- Fix: Track native running/interrupted/suspended state, expose pending playback separately from remembered choice, and rearm a gesture-based resume when needed. Preserve opt-in behavior.

### S14-F11 [medium] Release automation cannot establish cross-driver GPU compatibility

- Evidence: /home/ahirice/Documents/git/pharosville/.github/workflows/deploy-cloudflare.yml:48; /home/ahirice/Documents/git/pharosville/tests/helpers/playwright-config.ts:60; /home/ahirice/Documents/git/pharosville/package.json:32; /home/ahirice/Documents/git/pharosville/tests/helpers/playwright-config.ts:63.
- Detail: Hosted checks intentionally prove DOM fallback. The named cross-browser script selects Chromium and Firefox, while hardware Chromium configuration selects Vulkan outside macOS. Those checks do not establish Safari/Metal, Windows default ANGLE/D3D11, ChromeOS, or Firefox hardware shader correctness. WebKit is configurable but not selected by the shown release scripts.
- Fix: Retain the fallback CI lane and add recorded physical-device GPU acceptance covering the matrix below. Require actual backend/capability evidence rather than treating a browser project name as coverage.

## Ideas

### S14-I1 Make shader math defined across drivers

*all-devices · infra · effort S · impact 5 · confidence 5*

- What: Replace descending smoothstep ramps with complemented ascending ramps and signed pow(x,2.0) terms with x*x. Add focused negative/zero/positive self-checks and a source guard for constant reversed edges.
- Visitor benefit: Consistent surf, wakes, storm fronts, lamp pools, and rainbows across GPU compilers.
- Data/DOM: Preserves existing data mappings and thresholds; only fixes their mathematical implementation.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:427; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/wake.ts:81; /home/ahirice/Documents/git/pharosville/src/harbour/world/materials.ts:297; /home/ahirice/Documents/git/pharosville/src/harbour/sky/sky-glsl.ts:311; /home/ahirice/Documents/git/pharosville/src/harbour/weather/rainbow.ts:45.
- Perf: Zero additional draws or textures; multiplication may reduce ALU cost.
- Risks: Corrected output may differ from driver-dependent reference captures; review without retuning analytical thresholds.
- Depends on: —

### S14-I2 Verify required framebuffer capabilities before boot

*all-devices · infra · effort S · impact 5 · confidence 5*

- What: On the existing renderer context, check EXT_color_buffer_float and probe tiny RGBA16F, R16F, and RGBA32F attachments plus float readback. Reject unsupported configurations through the existing arrival failure path.
- Visitor benefit: An honest explanation replaces a black or corrupted harbour.
- Data/DOM: No market mapping changes. Failure DOM names unavailable graphics support and retains existing links.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:88; /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:124; /home/ahirice/Documents/git/pharosville/src/harbour/world/ground.ts:43.
- Perf: A few tiny allocations/draws and one small startup readback; release immediately. No recurring cost.
- Risks: Probe exact required formats; do not reject merely because unrelated float-linear or timer extensions are absent.
- Depends on: —

### S14-I3 Validate the ground readback before publishing it

*all-devices · infra · effort S · impact 4 · confidence 5*

- What: Verify framebuffer/readback success and finite, plausible height samples before constructing GroundService. Use try/finally to restore target, clear state, root ownership, and temporary resources on failure.
- Visitor benefit: Prevents lamps, ground masks, and labels from silently using an invalid zero-height island.
- Data/DOM: n/a; this validates geometric data, not market readings.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/world/ground.ts:70; /home/ahirice/Documents/git/pharosville/src/harbour/world/ground.ts:85; /home/ahirice/Documents/git/pharosville/src/harbour/world/island-system.ts:60.
- Perf: No additional GPU readback; bounded checks over the existing CPU buffer.
- Risks: Use documented island bounds and sea-floor expectations; valid flat samples must not be mistaken for total failure.
- Depends on: S14-I2

### S14-I4 Recover context loss with a fresh engine mount

*all-devices · ux · effort M · impact 5 · confidence 5*

- What: Handle canvas context loss by stopping frames, cancelling preparation, and restoring the poster. After restoration, remount Engine once so baked targets, services, queries, and readiness are reconstructed together.
- Visitor benefit: The harbour recovers after GPU resets, memory pressure, or sleep instead of returning with missing scenery.
- Data/DOM: Show graphics-recovery status; retain sound preference. Reveal only through the existing prepared/rendered revision contract.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:245; /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:44; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/textures.ts:48; /home/ahirice/Documents/git/pharosville/src/harbour/sky/clouds.ts:122.
- Perf: No steady-state draw cost; recovery repeats initialization and asset preparation.
- Risks: Bound retries to avoid reset loops. Test disposal during loss and prevent duplicate audio/feed ownership.
- Depends on: S14-I5

### S14-I5 Make shader failure block successful reveal

*all-devices · infra · effort M · impact 5 · confidence 5*

- What: Install onShaderError before system initialization. Record failure state, reject preparation or stop the active frame through a controlled error boundary, and report one concise material/program diagnostic.
- Visitor benefit: Broken GPU programs produce useful recovery content instead of a misleading live state.
- Data/DOM: Graphics readiness becomes independent of submitted boat count; existing analytical DOM remains truthful.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:88; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:253; /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:90; /home/ahirice/Documents/git/pharosville/src/error-reporter.ts:126.
- Perf: No added draws; error-only diagnostics. Avoid per-frame synchronous shader-status queries.
- Risks: Cover both boot compilation and later seasonal/tier variants; keep detailed shader source out of routine reports.
- Depends on: —

### S14-I6 Prepare expensive bake programs before their first draw

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Extend existing preparation ownership to procedural texture and cloud-atlas programs, compiling against their actual targets before execution. Yield between cloud cells and retain the explicit no-KHR synchronous limitation.
- Visitor benefit: More responsive cold arrival on drivers with expensive shader translation.
- Data/DOM: n/a; deterministic decorative bakes retain their current values.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ocean/gpu-bake.ts:57; /home/ahirice/Documents/git/pharosville/src/harbour/ocean/textures.ts:48; /home/ahirice/Documents/git/pharosville/src/harbour/sky/clouds.ts:122; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:183.
- Perf: Same final textures/draws; additional scheduling. Startup elapsed time may increase while maximum blocking time falls.
- Risks: Async initialization must preserve cancellation and target restoration. KHR cannot guarantee a driver never blocks.
- Depends on: S14-I11

### S14-I7 Remove the measured no-multi-draw submission cliff

*all-devices · infra · effort L · impact 4 · confidence 3*

- What: First measure WEBGL_multi_draw-disabled fleet submission. If acceptance fails, group identical fleet geometry into InstancedMesh buckets with an explicit fleet-data index, sharing deformation and depth logic within the existing renderer.
- Visitor benefit: Keeps all boats responsive on browsers lacking multi-draw acceleration.
- Data/DOM: Preserve one boat per coin, selection identity, all livery, and identical pose/depth transforms.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:350; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-material.ts:92; /home/ahirice/Documents/git/pharosville/node_modules/three/src/renderers/WebGLRenderer.js:1317.
- Perf: Potentially replaces per-part draws with per-geometry instanced draws; extra instance-index storage. Millisecond gain requires measurement.
- Risks: Substantial fleet ownership/culling change; implement only after the extension-disabled benchmark demonstrates need.
- Depends on: S14-I11, S14-I12

### S14-I8 Recalibrate resolution when display DPR changes

*all-devices · ux · effort M · impact 4 · confidence 5*

- What: Detect devicePixelRatio changes during resize and through a renewed resolution media listener. Rebuild the governor ladder, preserve explicit pins, and publish one coherent resize.
- Visitor benefit: Sharp output after moving between monitors without unnecessary rendering on lower-density screens.
- Data/DOM: n/a; logical size-based admission remains unchanged.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:74; /home/ahirice/Documents/git/pharosville/src/harbour/engine/quality.ts:50; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:404.
- Perf: Event-driven only; one target resize when DPR actually changes.
- Risks: Avoid repeated allocations during zoom. Test preparation cancellation and explicit quality/DPR override semantics.
- Depends on: —

### S14-I9 Budget physical pixels before allocating post targets

*all-devices · infra · effort M · impact 4 · confidence 4*

- What: Limit effective DPR by attachment dimensions and a measured physical-pixel ceiling before renderer/composer resize. Publish the actual ratio so uniforms and telemetry match allocated buffers.
- Visitor benefit: Large displays avoid allocation failures and severe memory spikes.
- Data/DOM: n/a; retains camera framing, CSS viewport dimensions, and admission thresholds.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:404; /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:122; /home/ahirice/Documents/git/pharosville/src/harbour/engine/quality.ts:50.
- Perf: Reduces target memory and fill cost; main HDR pair saves approximately 16 MB per million avoided pixels.
- Risks: A universal arbitrary cap could unnecessarily soften discrete-GPU output; calibrate the budget using the matrix.
- Depends on: S14-I2, S14-I8

### S14-I10 Recover interrupted Web Audio honestly

*all-devices · ux · effort M · impact 3 · confidence 5*

- What: Observe AudioContext state changes, make playing require native running state, and rearm a gesture resume after interruption or rejected resume. Expose a concise pending/unavailable state through SoundToggle.
- Visitor benefit: Sound resumes predictably after lock, backgrounding, or audio-route interruption.
- Data/DOM: Preserve remembered opt-in choice; status describes playback availability, never market condition.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/audio/controller.ts:81; /home/ahirice/Documents/git/pharosville/src/harbour/audio/controller.ts:111; /home/ahirice/Documents/git/pharosville/src/harbour/audio/SoundToggle.tsx:57; /home/ahirice/Documents/git/pharosville/src/harbour/audio/lifecycle.test.ts:37.
- Perf: Event-driven state handling; no additional synthesis or recurring GPU work.
- Risks: Do not restart sources twice or replay missed events. Extend tests with rejected and interrupted native states.
- Depends on: —

### S14-I11 Expose a compact local compatibility snapshot

*all-devices · infra · effort S · impact 4 · confidence 5*

- What: Extend existing diagnostics with actual backend, precision, required-target probe results, KHR/multi-draw/timer availability, drawing-buffer dimensions/color space, preparation timeout, and shader/context failure counts.
- Visitor benefit: Support can identify why a particular device fails without guessing from its browser name.
- Data/DOM: n/a; diagnostic-only. Keep detailed GPU identity local and send only bounded capability/error fields when needed.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/types.ts:87; /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:380; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:264.
- Perf: One-time capability reads and reused counters; negligible steady-state allocation.
- Risks: Do not add gl.getError or capability queries to every frame. Distinguish unavailable GPU timing from zero cost.
- Depends on: S14-I2

### S14-I12 Establish the physical-device compatibility matrix

*all-devices · infra · effort L · impact 5 · confidence 5*

- What: Execute the device/browser rows and URL suites listed in cross_lane_hooks. Record exact OS/browser/driver, backend/extensions, cold arrival, frame p95/max, shader errors, recovery, audio, and gate requests.
- Visitor benefit: Compatibility claims reflect supported real devices and their actual graphics paths.
- Data/DOM: Use dev-only overrides for synthetic readings; verify their matching DOM and never interpret production ignored overrides as coverage.
- Where: /home/ahirice/Documents/git/pharosville/docs/pharosville/TESTING.md:93; /home/ahirice/Documents/git/pharosville/tests/helpers/playwright-config.ts:60; /home/ahirice/Documents/git/pharosville/src/harbour/readings/readings-system.ts:90.
- Perf: No shipping runtime cost; several device sessions and ten-minute thermal runs.
- Risks: Hardware access is required. CI fallback and emulated viewports cannot substitute for Safari/Metal or Windows D3D11 evidence.
- Depends on: S14-I11

### S14-I13 Lock the existing sRGB output contract

*all-devices · infra · effort S · impact 3 · confidence 5*

- What: Add a development-only neutral-ramp/reference-color check through AgX, LUT, dither, and final output. Compare Safari/Chrome on the same wide-gamut Mac and Firefox on sRGB hardware; keep sRGB unless a complete wide-gamut pipeline is separately approved.
- Visitor benefit: Predictable sea, signal, and brand colors across displays.
- Data/DOM: n/a; preserves palette and analytical color mappings.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/engine/engine.ts:90; /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:46; /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:171; /home/ahirice/Documents/git/pharosville/src/harbour/engine/post.ts:247.
- Perf: Development-only fixture; zero production draws or textures.
- Risks: Setting drawingBufferColorSpace to display-p3 alone would mislabel output. Compare managed output under recorded display settings.
- Depends on: S14-I12

### S14-I14 Keep CSS enhancements optional on older engines

*all-devices · ux · effort S · impact 2 · confidence 4*

- What: Precede welcome-page 100svh with 100vh. Provide a :focus-within expansion fallback when :has is unsupported, retaining current :focus-visible behavior on modern engines.
- Visitor benefit: Welcome layout and keyboard controls stay usable on older supported browsers.
- Data/DOM: n/a; no analytical or admission behavior changes.
- Where: /home/ahirice/Documents/git/pharosville/public/arrival-shell.css:95; /home/ahirice/Documents/git/pharosville/public/arrival-shell.css:100; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:91.
- Perf: A few CSS declarations; no runtime JavaScript or GPU cost.
- Risks: Value depends on the minimum supported browser policy. No current Safari/Firefox failure is claimed.
- Depends on: —

## Top picks

1. S14-I1 — Small shader edits remove two concrete classes of undefined behavior across multiple visible systems.
2. S14-I2 — Cheap startup checks turn unsupported float configurations into an honest existing failure path.
3. S14-I5 — Prevents GPU compilation failure from being labeled a live, successfully rendered harbour.
4. S14-I4 — A fresh mount reuses existing ownership boundaries to recover all lost baked resources.
5. S14-I12 — Real-device evidence closes the largest remaining uncertainty; current CI explicitly cannot establish it.

## Operator decisions

- DECISION-NEEDED: What are the oldest supported Safari/iPadOS, Firefox, Chromium, and ChromeOS versions? This determines whether S14-I14 is required compatibility work.
- DECISION-NEEDED: Which physical devices below can be reserved for release acceptance, especially the locked Apple Silicon Safari 26 gate and a Windows default ANGLE/D3D11 machine?

## Cross-lane hooks

- Shader owners: coordinate S14-I1 across ocean, wake, sky, world materials, and rainbow. Preserve existing data thresholds and compare corrected shapes before any art retuning. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ocean/ocean-material.ts:423.
- Engine/app owners: land target validation, shader-failure readiness, and recovery together; the app currently trusts rendered revision/count after composer return. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/app/harbour-app.tsx:84.
- Performance/fleet owners: measure KHR-absent cold compilation and multi-draw-disabled submission separately. Report frame p95/max and cold arrival, not only governor GPU p10. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:91; /home/ahirice/Documents/git/pharosville/src/harbour/engine/prepare.ts:248.
- Matrix URL setup: use https://pharosville.pharos.watch/ for deployed arrival/audio/gate checks. Development URLs below assume port forwarding to http://localhost:5173/ on each device; substitute its reachable same-origin dev origin. Readings overrides are DEV-gated: /home/ahirice/Documents/git/pharosville/src/harbour/readings/readings-system.ts:90.
- Matrix suite A: http://localhost:5173/?t=11&view=heart&quality=high&dpr=2&prof=1 and http://localhost:5173/?t=22&view=overview&quality=low&dpr=1&prof=1. Then remove quality/dpr pins for ten-minute automatic-quality runs. Record first fleet, frame p95/max, draw calls, and actual capabilities. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/governor.ts:70.
- Matrix suite B: http://localhost:5173/?t=11&dews=DANGER&offpeg=0.08&strike=1; http://localhost:5173/?t=22&stale=1; http://localhost:5173/?t=22&psi=none; http://localhost:5173/?t=11&season=winter; http://localhost:5173/?t=11&rainbow=1. Verify shaders, depth-aware beam/fog, wakes, and matching DOM readings. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/readings/bind.ts:262; /home/ahirice/Documents/git/pharosville/src/harbour/weather/weather-system.ts:207.
- Matrix front case: http://localhost:5173/?t=11&dews=CALM&front=WARNING&frontAt=0.5. Use a named band: front=1 does not activate the implemented override. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/weather/weather-system.ts:200.
- Matrix row 1 — MacBook Air M1, 8 GB, Safari 26 and Chrome, internal wide-gamut display, approximately 1440×900 CSS/DPR2: suites A/B, cold/repeat loads, reduced motion, sound gesture/background/wake, context loss/restoration, and external 1× monitor transfer. This is the D14 gate; record p95 against 16.7 ms. Evidence: /home/ahirice/Documents/git/pharosville/agents/2026-10-13-pharosville-reboot/PLAN.md:47.
- Matrix row 2 — iPad Air 5 M1, Safari 26, portrait 820×1180 and landscape 1180×820 CSS: suites A/B, touch selection, panel scrolling, keyboard opening, Split View denial/readmission, device lock/unlock, and audio-route interruption. Verify screen/window admission independently. Evidence: /home/ahirice/Documents/git/pharosville/src/systems/viewport-gate.ts:29.
- Matrix row 3 — ThinkPad T480, Intel UHD 620, Windows 11, Chrome and Edge using their actual default ANGLE backend: suites A/B, cold shader compilation, quality transitions, 125%/150% display scaling, and monitor transfer. Record whether D3D11 is actually selected; do not force Vulkan and call it Windows-default coverage. Evidence: /home/ahirice/Documents/git/pharosville/tests/helpers/playwright-config.ts:63.
- Matrix row 4 — Windows 11 desktop with GeForce RTX 3060, Firefox and Chrome: suites A/B, cold/repeat compilation, multi-draw availability, context recovery, and 4K output. Compare browsers on identical hardware to separate compiler/backend effects from GPU class. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:357.
- Matrix row 5 — Ryzen 5 7600/Raphael integrated GPU, Ubuntu with recorded Mesa version, Firefox and Chrome: suites A/B at DPR1 plus automatic quality; record GL/backend identity, extension availability, shader errors, and ten-minute thermal/frame behavior. Existing history reports poor iGPU performance, but this pass did not remeasure it. Evidence: /home/ahirice/Documents/git/pharosville/agents/claudeville-prettier/exec/INTEGRATION-NOTES.md:53.
- Matrix row 6 — Lenovo Flex 5i Chromebook, Intel integrated graphics, stable ChromeOS: suites A/B at native window size, resize across 720×600 boundaries, low-power operation, suspend/resume, and audio opt-in. Confirm actual GPU rendering and framebuffer probes. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/quality.ts:71.
- Matrix row 7 — Galaxy Tab S8, Adreno 730, Chrome; Galaxy Z Fold6, Chrome on inner and outer displays: suites A/B on admitted sizes, ten-minute thermal run, touch interaction, and folding/readmission. Outer display must keep welcome without world/API requests. Evidence: /home/ahirice/Documents/git/pharosville/src/main.tsx:27.
- Matrix row 8 — iPhone 14 Safari plus admitted desktop windows resized to 719×600, 720×599, 720×600, and 600×720 CSS: deployed welcome/request checks, rotation, and denial/readmission. Phones remain gated; passing dimensions must work in either orientation. Evidence: /home/ahirice/Documents/git/pharosville/src/systems/viewport-gate.ts:18; /home/ahirice/Documents/git/pharosville/src/main.tsx:39.
- Matrix acceptance: no shader/GL errors, complete fleet or honest failure, no world requests while denied, correct stale/unknown semantics, successful recovery, and opt-in audio recovery. Exercise KHR/multi-draw absence through test-only masking; keep timer-unavailable measurements explicitly unavailable. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/engine/gpu-passes.ts:48.
- Skipped: browser launches, captures, runtime tests, package installation, and repository edits; this was a read-only source pass.
- Risk: device-specific symptoms, performance estimates, and recovery behavior remain unverified until the physical-device matrix is executed.
