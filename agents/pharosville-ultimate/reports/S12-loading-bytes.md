# S12

## Executive summary

The loading architecture is already disciplined: admission precedes React, production assets use immutable URLs and native Brotli, and reveal requires a completed fleet frame. Prioritize a confirmed stuck-poster failure path, cancellation of obsolete downloads, and incomplete startup accounting. The existing build passes byte gates, but its ledger counts 4.55 MB before APIs and omits worker/seed dependencies. The 2.45 MB compressed island is the largest optimization target. Smaller emblem textures could substantially reduce GPU memory, subject to art approval. All timing savings below are estimates; no browsers were used.

## Current state

- First paint is independent of React: responsive AVIF/WebP poster, guide, links and status arrive in HTML. The 1600px AVIF is 104,998 B. Two WOFF2 faces preload; italic follows CSS discovery. All three fonts total 74,556 B and use font-display:swap. Evidence: index.html:14, index.html:37, public/arrival-shell.css:3, public/arrival-shell.css:56.
- The gate activates inert hints only after screen AND viewport admission, then imports React. Existing dist measurements: entry 2.7 KiB gzip, Harbour 305.9 KiB, renderer 242.3 KiB, total JS 774.4 KiB. Renderer combines three.js and postprocessing; static ES-module usage permits tree shaking. There is no demonstrated saving from merely replacing namespace imports. Evidence: src/main.tsx:27, src/main.tsx:45, vite.config.ts:218, vite.config.ts:274.
- Critical path: HTML → admission → React/Harbour dependencies → sequential system initialization → layout → API/coast/worker preparation → ocean/island/civic/fleet setup → shader preparation → completed composer frame → readiness-matched reveal. Downloads overlap initialization; civic/kit prefetch intentionally follows island bytes. Evidence: src/client.tsx:10, src/harbour/engine/engine.ts:145, src/harbour/sim/system.ts:114, src/harbour/engine/prefetch.ts:15.
- Compression already includes EXT_meshopt_compression and KHR_mesh_quantization in inspected GLBs, followed by HTTP Brotli in production. The eager 49-model kit and 17-model civic sets become two validated packs: 342,068 B and 318,317 B in existing dist. Production avoids JavaScript Brotli inflation. Evidence: scripts/harbour/blender/island/hb_export.py:461, scripts/harbour/build-asset-registry.mjs:37, src/harbour/engine/assets.ts:112, public/_headers:30.
- Existing dist stores island.glb.br at 2,452,264 B and exact sea transport at 602,013 B. The counted frontier is 4,549,981 B with Brotli text estimates: approximately 4.04 seconds at 9 Mbps or 22.75 seconds at an assumed 1.6 Mbps, before latency, omitted dependencies, APIs and processing. These are bandwidth calculations, not measured navigation times. Evidence: scripts/harbour/build-asset-registry.mjs:64, scripts/perf/first-frame-bytes.mjs:117.
- Reveal is honest: matching prepared/rendered revision and boat count, explicit empty/unavailable states, and a pending-only two-second hold measured from first completed render. Poster fade lasts 1100 ms. Detail modules warm at reveal; life/identity start after the first base frame; sound modules load on demand. Evidence: src/harbour/app/harbour-app.tsx:69, src/harbour/app/harbour-app.tsx:84, src/harbour/engine/engine.ts:290, src/harbour/audio/controller.ts:167.
- Emblems use AVIF with WebP fallback, then a mutable CanvasTexture; no KTX2/Basis loader is configured. The source atlas is 4096×2560. Initial populated canvas backing is at least 4096×2688: approximately 42 MiB CPU pixels and 56 MiB GPU RGBA+mips, excluding decoded-image copies. Smaller wire formats do not reduce that allocation. Evidence: scripts/harbour/build-emblems.mjs:23, src/harbour/fleet/emblems.ts:41, src/harbour/fleet/emblems.ts:86, src/harbour/engine/assets.ts:15.
- Shader preparation already batches submissions, uses parallel compilation when supported, stages textures and has a 30-second deadline. Without parallel compilation, reflection can block; deadline fallback may finish compilation during drawing. Current slow-GPU startup duration is unverified. Evidence: src/harbour/engine/prepare.ts:94, src/harbour/engine/prepare.ts:196, src/harbour/engine/prepare.ts:223, src/harbour/engine/prepare.ts:248.
- Repeat visits benefit from one-year immutable JS/media caching and content-addressed fonts/poster/CSS. Media retention carries one prior generation. No service-worker registration was found in the inspected runtime/configuration; offline shell availability is therefore not guaranteed. Existing HTTP caching should remain the default unless offline welcome becomes a product requirement. Evidence: public/_headers:13, public/_headers:27, scripts/harbour/retain-assets.mjs:26, src/main.tsx:1.
- Read-only checks passed: check-bundle-size and first-frame-bytes against existing dist; no fresh build was produced. Existing load baselines predate v1.4 and explicitly record contention. An in-memory Paeth sea predictor increased compressed bytes from 602,013 to 671,125; retain the current codec. Evidence: scripts/perf/baselines/branch-load.json:4, scripts/perf/baselines/branch-load.json:53, scripts/perf/baselines/branch-load.json:80, scripts/harbour/build-asset-registry.mjs:70.

## Findings

### S12-F1 [high] A failed hull kit can strand the arrival poster

- Evidence: src/harbour/fleet/fleet-system.ts:303; src/harbour/fleet/fleet-system.ts:873; src/harbour/fleet/fleet-system.ts:1223; src/harbour/app/harbour-app.tsx:90
- Detail: Kit failure sets failed and returns successfully from initialization. Subsequent updates return before publishing fleet-frame. When successful fleet data is already prepared, rendered revision remains zero: complete and incomplete checks both fail, while boatless pending/unavailable checks also fail. The poster can remain on 'Raising the harbour' indefinitely.
- Fix: Propagate initial kit failure through Engine initialization to the existing arrival failure surface. Add a regression covering successful prepared data plus rejected kit transport.

### S12-F2 [medium] Withdrawal of admission does not cancel asset downloads

- Evidence: src/harbour/engine/engine.ts:192; src/harbour/engine/assets.ts:36; src/harbour/engine/assets.ts:92; src/harbour/engine/prefetch.ts:19; src/harbour/app/harbour-app.tsx:139
- Detail: Engine abort cancels its lifetime signal, but asset/layout/SDF fetches do not consume it. Disposal waits for initialization to settle. During that interval, island completion can trigger further pack prefetches after the viewport has become denied. A stalled asset can also retain the obsolete engine until its request settles.
- Fix: Pass the engine signal to owned fetches and check cancellation before dependent prefetches. Treat admission cancellation as teardown, with no user-facing failure.

### S12-F3 [medium] Startup byte gate omits fleet-critical dependencies

- Evidence: scripts/perf/first-frame-bytes.mjs:48; scripts/perf/first-frame-bytes.mjs:98; src/harbour/sim/warm-legs.ts:34; src/harbour/sim/warm-legs.worker.ts:21; src/harbour/sim/system.ts:158
- Detail: The ledger follows HTML hints and manifests but omits the planning worker and seed JSON. Existing dist adds 23,088 B and 49,179 B respectively under deterministic Brotli estimates. It also omits dynamically associated Harbour CSS and the used italic font. Worker/seed growth can therefore escape the claimed first-fleet byte budget despite aggregate JS checks.
- Fix: Include emitted worker, seed, dynamic CSS and used font dependencies explicitly, with tests showing growth changes the ledger. Keep deferred decoration separate.

### S12-F4 [low] Civic prefetch downloads kinds outside the eager plots

- Evidence: src/harbour/engine/prefetch.ts:20; scripts/harbour/build-asset-registry.mjs:39; src/harbour/civic/civic-system.ts:145; src/harbour/civic/office-works.ts:79
- Detail: Registry packing correctly selects layout-used civic files, but runtime prefetch walks every manifest kind. Existing dist consequently starts hull-stages and office-works transports, totaling 48,812 B, outside the 17-model pack. Office works already has its own later loader.
- Fix: Derive civic prefetch membership from layout-used plots, preserving the existing island-first frontier and later owners.

### S12-F5 [low] Download failures are reported as browser WebGL2 failures

- Evidence: src/harbour/engine/engine.ts:154; src/harbour/layout/layout-system.ts:35; src/harbour/world/island-system.ts:41; src/harbour/app/harbour-app.tsx:124; src/harbour/app/harbour-app.tsx:151
- Detail: Layout, island, parsing and other initialization failures reach the same failed stage, whose visible reason always says the browser could not start WebGL2. A transient network failure therefore incorrectly implies browser incompatibility.
- Fix: Use neutral boot-failure copy, or distinguish renderer construction from asset/network failures while retaining useful links and reload guidance.

### S12-F6 [medium] Emblem upload has a large device-independent memory floor

- Evidence: scripts/harbour/build-emblems.mjs:23; src/harbour/fleet/emblems.ts:47; src/harbour/fleet/emblems.ts:56; src/harbour/fleet/emblems.ts:86; src/harbour/engine/quality.ts:27
- Detail: A populated logo canvas starts at approximately 42 MiB and its RGBA mip chain at approximately 56 MiB. Decoding the source adds roughly 40 MiB temporarily. Quality tiers reduce effects but retain this atlas footprint. This is a concrete memory/upload risk for supported tablets and integrated GPUs, not a measured crash.
- Fix: Evaluate a smaller authored atlas variant using the same combined-canvas path, with close-zoom logo readability and arrival acceptance before adoption.

### S12-F7 [medium] Startup performs a synchronous 16 MiB GPU readback

- Evidence: src/harbour/world/island-system.ts:60; src/harbour/world/ground.ts:43; src/harbour/world/ground.ts:77; src/harbour/world/ground.ts:86
- Detail: Ground preparation renders a 1024² RGBA float target and synchronously reads all four channels into a 16 MiB array, then copies only red into heights. This forces GPU completion on the main thread before later systems initialize. Its device-specific delay is unmeasured.
- Fix: Use the installed renderer's asynchronous readback, restore render state before awaiting, and preserve target ownership through completion and cancellation.

## Ideas

### S12-I1 Make initial asset failures terminate arrival honestly

*professional · ux · effort S · impact 5 · confidence 5*

- What: Reject initial hull-kit failure through Engine's existing error path; replace universal WebGL2 blame with accurate boot-failure copy. Add the missing prepared-data/failed-kit regression.
- Visitor benefit: A failed download yields useful recovery guidance instead of an endless loading poster.
- Data/DOM: No analytical mapping changes. Failure text describes asset/startup availability, never market conditions.
- Where: src/harbour/fleet/fleet-system.ts:303; src/harbour/app/harbour-app.tsx:124; src/harbour/app/reveal.test.ts:143
- Perf: Approximately 0 KB and 0 ms on successful loads; failed arrival becomes bounded by the actual rejection.
- Risks: Preserve the poster, guide and links. Avoid revealing a boatless world as a successful live fleet.
- Depends on: —

### S12-I2 Cancel obsolete loading work at the admission boundary

*all-devices · infra · effort M · impact 4 · confidence 5*

- What: Thread the engine lifetime signal through asset/layout/SDF fetches and dependent prefetch callbacks. Add cancellation coverage for shrinking during island/SDF transfer.
- Visitor benefit: Resizing to the welcome page stops avoidable downloads and releases obsolete startup work sooner.
- Data/DOM: n/a; preserves the existing sorted-size gate.
- Where: src/harbour/engine/assets.ts:81; src/harbour/engine/prefetch.ts:19; src/harbour/engine/engine.ts:192; src/harbour/ocean/sdf-image.ts:23
- Perf: 0 KB saved on normal loads; interrupted visits can avoid up to 660 KB of subsequent pack traffic plus unfinished transfers. Normal startup timing unchanged.
- Risks: Already dispatched HTML hints may complete. Cancellation must not trigger fallback downloads or erase resources belonging to a newer mount.
- Depends on: —

### S12-I3 Budget the complete first-fleet dependency set

*professional · infra · effort S · impact 4 · confidence 5*

- What: Extend the static ledger to emitted worker/seed assets, dynamic-entry CSS and used italic font. Add dependency-discovery regressions and distinguish base-frame, fleet-ready and decorative bytes.
- Visitor benefit: Future changes cannot quietly make first arrival heavier while passing an incomplete budget.
- Data/DOM: n/a; build-time accounting only.
- Where: scripts/perf/first-frame-bytes.mjs:48; scripts/perf/budgets.json:6; src/harbour/sim/warm-legs.worker.ts:3; public/arrival-shell.css:4
- Perf: 0 runtime KB/ms. Exposes at least 72.3 KB of omitted Brotli-estimated worker/seed bodies, plus CSS and 25.4 KB italic font.
- Risks: Do not inflate ceilings automatically. Keep conservative dependency totals distinct from completed-response waterfall bytes.
- Depends on: —

### S12-I4 Restrict civic prefetch to actual eager plots

*all-devices · infra · effort S · impact 3 · confidence 5*

- What: Use layout civic membership for prefetch, matching the registry pack selection. Leave hull-stage and office-works loading to their existing owners.
- Visitor benefit: Less competing traffic during arrival, especially on slower connections.
- Data/DOM: n/a; no scenery is removed, and analytical office works still load through their owner.
- Where: src/harbour/engine/prefetch.ts:20; scripts/harbour/build-asset-registry.mjs:39; src/harbour/civic/office-works.ts:41
- Perf: Removes 48,812 B from eager requests: approximately 43 ms of bandwidth at 9 Mbps or 244 ms at assumed 1.6 Mbps; navigation savings may be smaller.
- Risks: Confirm Shipyard's existing stage loader remains correct and update the conservative byte frontier accordingly.
- Depends on: S12-I3

### S12-I5 Reduce the island's geometry before changing codecs

*all-devices · infra · effort L · impact 5 · confidence 3*

- What: Set a 20–30% compressed-size reduction target for the dominant opaque island chunks. Simplify repeated distant geometry and redundant vertices in Blender, preserving silhouettes, vertex colors, normals and sway. Existing hidden-face culling and meshopt stay.
- Visitor benefit: The largest download, decode and geometry-preparation cost becomes smaller on every supported device.
- Data/DOM: n/a; decorative geometry changes only. Preserve piers, landmarks, coast and picking contracts.
- Where: scripts/harbour/blender/island/hb_export.py:399; scripts/harbour/blender/island/hb_export.py:435; src/harbour/world/island-system.ts:38; public/harbour/island.glb
- Perf: Target 490–736 KB fewer Brotli bytes: 436–654 ms bandwidth at 9 Mbps or 2.45–3.68 s at assumed 1.6 Mbps. CPU/GPU savings require measurement.
- Risks: Savings are targets, not measured results. Check every supported camera, shadows, ground heights, seasons and close inspection on real hardware.
- Depends on: S12-I3

### S12-I6 Start seed fetching when the planning worker starts

*all-devices · infra · effort S · impact 3 · confidence 4*

- What: Move seed fetch initiation from the coast-dependent warm-message handler to worker startup. Continue parsing, matching and applying seeds inside the worker after its layout/coast inputs arrive.
- Visitor benefit: Fleet preparation loses an avoidable request waterfall after coast loading.
- Data/DOM: n/a; retain SIM_SEED_VERSION and exact matching/fallback behavior.
- Where: src/harbour/sim/warm-legs.ts:34; src/harbour/sim/warm-legs.ts:45; src/harbour/sim/warm-legs.worker.ts:21
- Perf: 0 total KB saved; overlaps a 49.2 KB Brotli-estimated seed response. Estimated opportunity: 40–100 ms fast4g or 250–650 ms at assumed 1.6 Mbps/400 ms RTT.
- Risks: Shared bandwidth can move coast completion. Verify first-fleet improvement; retain admission ownership and worker cancellation.
- Depends on: S12-I3

### S12-I7 Protect first-fleet loading from decorative downloads

*all-devices · infra · effort M · impact 4 · confidence 3*

- What: Give late emblems, Wreck Cove and deferred scenery lower network priority; test delaying nonessential starts until first-fleet completion, with a bounded escape for unavailable data.
- Visitor benefit: Required readings and planning assets compete with fewer late downloads on constrained networks.
- Data/DOM: Keep existing brand-color roundels while logos wait. Never delay analytical readiness publication or fabricate boats.
- Where: src/harbour/fleet/fleet-system.ts:875; src/harbour/engine/engine.ts:290; src/harbour/fleet/emblems.ts:108; src/harbour/app/harbour-app.tsx:78
- Perf: 0 total KB saved; shifts the 1,483 KB AVIF and other late assets away from fleet-critical work. Target 100–500 ms fast4g improvement; contention-dependent and unmeasured.
- Risks: Logos and scenery appear later. Requires arrival-filmstrip acceptance and a bounded unavailable-data path; avoid blanket deferral of useful details.
- Depends on: S12-I6

### S12-I8 Expose truthful loading phases and shader waits

*professional · ux · effort M · impact 4 · confidence 5*

- What: Publish coarse asset, scene-preparation and fleet-preparation stages to the existing status element. Record phase duration, parallel-compile support and preparation timeout separately; show slow-loading guidance without invented percentages.
- Visitor benefit: A long wait remains understandable, and support can distinguish networking from GPU preparation.
- Data/DOM: Use factual stages such as 'Loading the harbour' and 'Preparing the view'. Market freshness and unavailable states remain separate.
- Where: src/harbour/app/harbour-app.tsx:23; src/components/arrival-shell.tsx:16; src/harbour/engine/engine.ts:158; src/harbour/engine/prepare.ts:196
- Perf: Estimated +1–2 KB gzip, negligible infrequent DOM updates, no draws. No direct load-time saving claimed.
- Risks: Do not announce every asset to assistive technology. Shader compilation cannot honestly provide a byte-style percentage or guaranteed remaining time.
- Depends on: S12-I1

### S12-I9 DECISION-NEEDED: smaller emblem atlas for constrained devices

*all-devices · infra · effort M · impact 4 · confidence 3*

- What: Prototype 64px logo slots alongside the current 128px atlas, retaining the combined canvas and monogram path. Select an approved profile at startup; compare selected flags and closest zoom before adopting it.
- Visitor benefit: Much lower texture memory and upload cost on supported tablets and weak integrated GPUs.
- Data/DOM: Identity remains the same issuer artwork. Panel/search logos retain their existing sources. No analytical meaning changes.
- Where: scripts/harbour/build-emblems.mjs:23; src/harbour/fleet/emblems.ts:41; src/harbour/fleet/emblems.ts:104; src/harbour/engine/quality.ts:1
- Perf: Halved dimensions reduce baseline canvas approximately 42→10.5 MiB and GPU+mips 56→14 MiB. Estimated wire target: save 500–1000 KB; 0–1 draws added, upload milliseconds unmeasured.
- Risks: Changes the same-art quality policy and tiny-logo pixels. Requires operator approval, sharpness review and profile-upgrade behavior. KTX2 is not a drop-in replacement for the mutable canvas.
- Depends on: —

### S12-I10 Make ground-height readback asynchronous

*all-devices · infra · effort M · impact 3 · confidence 4*

- What: Use the installed Three renderer's asynchronous readback for ground heights. Restore render state before awaiting, preserve disposal ownership, and retain identical sampling/AO output.
- Visitor benefit: The loading page can stay responsive while the GPU finishes ground preparation.
- Data/DOM: n/a; computed ground heights must remain equivalent for placement, masking and lighting.
- Where: src/harbour/world/ground.ts:41; src/harbour/world/ground.ts:78; src/harbour/world/island-system.ts:60; node_modules/three/src/renderers/WebGLRenderer.js:3216
- Perf: 0 wire KB saved; moves a 16 MiB synchronous read behind an asynchronous fence. Estimated 10–100 ms responsiveness opportunity on slow GPUs; total startup reduction is unproven.
- Risks: Handle resize, cancellation and readback errors. GPU completion and buffer copying still cost time; compare exact height samples and resource disposal.
- Depends on: S12-I2

### S12-I11 Add a current slow-network and repeat-visit acceptance matrix

*professional · infra · effort M · impact 4 · confidence 5*

- What: Extend the existing harness with an explicitly defined 3G profile and phase metrics. Later collect current-release fast4g/3G, CPU-slow, cold, expired-repeat and cross-deploy results through the authorized shared real-GPU capture path.
- Visitor benefit: Performance decisions reflect supported devices and realistic waiting conditions instead of warm desktop startup.
- Data/DOM: n/a; retain first-fleet readiness assertions and honest unavailable/empty cases.
- Where: scripts/perf/load.mjs:33; scripts/harbour/shot.mjs:93; scripts/perf/README.md:15; scripts/perf/baselines/branch-load.json:80
- Perf: 0 shipped KB/ms. Measurement establishes savings; it does not itself accelerate loading. Include worker traffic and distinguish cache hits from genuine 304s.
- Risks: No captures during this read-only lane. Local HTTP/1.1, driver shader caches and contended historical results cannot establish CDN or slow-GPU timing.
- Depends on: S12-I3, S12-I8

## Top picks

1. S12-I1 — Small change fixes a confirmed path where a single failed kit download can prevent arrival indefinitely.
2. S12-I3 — Cheap prerequisite: makes subsequent first-fleet byte claims complete and enforceable.
3. S12-I4 — Removes 48.8 KB of unnecessary eager traffic using membership logic the registry already owns.
4. S12-I2 — Closes cancellation gaps and prevents obsolete startup work from continuing after admission withdrawal.
5. S12-I5 — Largest plausible byte win: reducing the 2.45 MB island can save seconds on constrained connections.

## Operator decisions

- May constrained-device profiles use a 64px emblem atlas after close-zoom review, accepting different tiny-logo pixels and amending the same-art quality policy?
- Is offline access to the static welcome a product requirement? If not, retain immutable HTTP caching and avoid adding a service worker.
- What first-fleet waiting budget should the explicitly defined 3G profile meet, and how much later may decorative logos/scenery appear?

## Cross-lane hooks

- Island/art lane: coordinate S12-I5 with Blender exports, silhouettes, ground-height consumers and real-GPU visual acceptance; existing meshopt, quantization and hidden-face culling already ship.
- GPU lane: measure startup shader preparation, texture uploads and ground readback separately on the Apple Silicon gate and a weak integrated GPU; preparation readiness is not a latency guarantee.
- Shell/accessibility lane: keep phase announcements sparse, preserve recovery links and test denied→admitted→denied transitions during stalled requests.
- Deployment lane: verify live Brotli Content-Encoding, immutable cache behavior and previous-generation retention using existing contracts before claiming repeat-visit savings.
- Skipped: browsers, fresh builds, live CDN inspection and new hardware timings; repository files were unchanged.
- Risk: existing-dist byte measurements are artifact evidence; proposed KB targets and millisecond savings require controlled validation.
