# SP-FRAG — fragment-cost decomposition and capture-exclusive load remeasurement

## 1. Scope and method

Research against HEAD b71dd282. Read AGENTS, the brief, SP-IGPU/SP-ISLAND/LOAD reports and runners, kit/ocean shaders, lighting and Three shader chunks. Three read-only scouts audited lighting, ocean features and reveal-marker semantics. All app edits were confined to throwaway nfs-sp-frag, with linked root node_modules; inherited SP-IGPU profiler/reductions were applied first. No tracked main-checkout source/assets, shared dist, build, lint, formatter or test gate was modified/run. The saved patch includes inherited diagnostics plus fragment-experiments.ts, depth-experiment.ts and wave-experiment.ts.

Hardware rendering used **npm run preview only**, AMD Raphael ANGLE/OpenGL ES3.2, heart, 1600×1000@1, Low tier, summer/CALM, pinned noon12.5 or night22, reduced motion. Ingredient cells are **n=3 independent drained timing windows in one navigation**, not three cold boots. Each window measures submission intervals with the inherited hashed, non-overlapping timer-query profiler. All successful windows have **0 pending, 0 disjoint polls, 0 skipped queries**. Ingredient windows have3–41 complete sampled frames; final reduction windows have16–40 and use5s production windows. Units are mean-per-completed-sampled-frame, then median across3windows; parentheses show their min–max. They are GPU submission sums, not presentation time/FPS, and query overhead is not independently calibrated.

Five successful iGPU capture navigations: noon, night, noon-extra, noon-final, night-final. A sixth attempted fully frozen timing matrix, noon-frozen, failed with “undrained window” and is **not evidence**; night-frozen never ran. Initial ingredient timings run normal reduced-motion updates, so water/beam state evolves between switches. Only the visual A/B pairs are same-page, pinned elapsed120/weather120, zero-delta manual renders with forced shadow refresh. Night ocean is demonstrably state-sensitive (13ms initial versus15–16ms in the later final navigation): its ablation deltas are diagnostic, not exact additive instruction costs. This limitation is retained rather than mislabeling the failed frozen attempt successful.

Commands/artifacts under OUT = outputs/need-for-speed/sp-frag:

- npm run worktree:new -- nfs-sp-frag --branch nfs/sp-frag; linked node_modules; applied outputs/need-for-speed/sp-igpu/spike.patch.
- npm run dev -- --host 127.0.0.1 --port 5199 --strictPort.
- node OUT/capture.mjs noon; node OUT/capture.mjs night; node OUT/capture.mjs noon-extra base patternLocalOff patternWorldOff aoOff poolDaySkip oceanExact depthPrepass.
- node OUT/capture.mjs noon-final base depthPrepass oceanExact poolDaySkip; equivalent night-final. OUT/capture.mjs preserves the failed frozen-mode reproducer as well.
- URL flags: ?gpuPasses=1&quality=low&dpr=1&frag=patternOff; runtime window.__frag.set(['depthPrepass']). Flags default OFF; cache keys include the active set. URL installation is automatic before core compilation, and the capture runner installs again once deferred systems are ready.
- node OUT/analyze.mjs noon night noon-extra noon-final night-final; existing frame/compare.mjs supplies 8×8 non-overlap luminance SSIM/RGB diagnostics. OUT/summary.json contains every raw per-window mean and frame count.

**Machine load, not a thermally isolated laptop benchmark:** before noon uptime load averages4.95/4.00/7.27; each batch saved uptime and top -bn1. No concurrent build/test was launched. Existing Chrome/desktop processes remained active. The load experiment below is capture-exclusive and markedly less variable than the original18-agent phase, but residual contention/I/O means “quiet” must not mean fully idle.

## 2. Why the main scene is expensive

### Correct two premise errors before optimizing

1. **16 PointLight objects is not16 active fragment BRDFs at Low.** lights-system.ts:331–337 changes visibility to the quality cap; quality.ts:28–30 defines High16/Medium8/Low4. The prior Low@1 frame therefore compiles4point lights, not16. Its source already patches Three's point loop to skip zero uniform colors and out-of-range RE_Direct (lights-system.ts:12–30). Daytime intensity is zero (:311–312). point4 and an additional pointGuard are useful no-op controls, not new shipping optimizations.
2. The kit is not roughness1/no-specular. materials.ts:525 sets roughness0.78/metalness0, then hbPattern supplies per-pattern roughness (:183,228,238), and weather changes it (:561). Dielectric F0≈0.04 remains nonzero even at roughness1. There is no scene.environment/envMap setup here: the custom hbEnvSpec (:255–268,585–592) is the environment approximation. No built-in scene fog is installed; fogOff is accordingly a no-op. Actual stale-data fog is a separate post effect (readings/fog.ts:82–105), not a repeated kit-fragment fog loop in these healthy scenes.

### Island/civic ingredient knockouts

|Flag|Island noon ms|Island night ms|Civic noon ms|Civic night ms|
|---|---:|---:|---:|---:|
|base|10.271 (10.259–10.276)|11.070 (11.061–11.074)|3.441 (3.440–3.444)|3.767 (3.760–3.770)|
|point0|10.051 (10.034–10.069)|10.003 (9.996–10.018)|3.307 (3.301–3.307)|3.298 (3.297–3.298)|
|point4|10.408 (10.385–10.415)|10.792 (10.769–10.966)|3.461 (3.453–3.464)|3.626 (3.620–3.693)|
|shadowsOff|10.097 (10.074–10.111)|10.890 (10.866–10.908)|3.263 (3.262–3.266)|3.601 (3.591–3.608)|
|shadowBasic|10.117 (10.101–10.119)|11.026 (11.018–11.048)|3.344 (3.326–3.347)|3.693 (3.693–3.703)|
|patternOff|4.892 (4.876–4.921)|5.754 (5.492–5.818)|1.739 (1.729–1.741)|1.966 (1.909–1.972)|
|poolOff|9.974 (9.974–9.976)|10.728 (10.728–10.773)|3.308 (3.304–3.309)|3.625 (3.625–3.639)|
|diffuseOnly|10.087 (10.048–10.093)|10.951 (10.868–10.959)|3.213 (3.211–3.221)|3.601 (3.592–3.625)|
|hemiOff|10.224 (10.216–10.231)|11.230 (11.195–11.238)|3.420 (3.417–3.424)|3.773 (3.771–3.810)|
|envOff|10.082 (10.079–10.090)|10.992 (10.813–11.008)|3.348 (3.340–3.351)|3.679 (3.634–3.690)|
|fogOff|10.278 (10.271–10.288)|11.076 (11.067–11.091)|3.453 (3.446–3.455)|3.751 (3.747–3.756)|
|frontSide|9.692 (9.689–9.696)|10.461 (10.433–10.479)|2.569 (2.561–2.577)|2.754 (2.738–2.767)|
|pointGuard|10.374 (10.350–10.379)|11.182 (11.180–11.184)|3.493 (3.487–3.495)|3.793 (3.784–3.802)|

Flags are destructive diagnostics, not accepted quality settings. patternOff removes the hbPattern multiplier and uses roughness0.78 but retains seasonal foliage/weather/AO. poolOff removes kit pool accumulation only; envOff removes the two custom kit environment terms. diffuseOnly substitutes **Lambert-like direct diffuse at0.96 energy** for the kit direct physical BRDF; it is not an assertion that MeshLambertMaterial is equivalent, and retains the indirect/custom paths. shadowsOff disables all shadow production/receiving; shadowBasic keeps the same map size with basic sampling instead of PCF. The main-row differences isolate receiver-side consequences better than total-frame differences.

### Pattern versus world breakup and height-field AO

Noon cells below use the dedicated noon-extra navigation and its own baseline; night uses the night navigation.

|Flag|Island noon ms|Island night ms|Civic noon ms|Civic night ms|
|---|---:|---:|---:|---:|
|base|10.277 (10.277–10.279)|11.070 (11.061–11.074)|3.419 (3.417–3.420)|3.767 (3.760–3.770)|
|patternLocalOff|7.522 (7.502–7.561)|8.280 (8.243–8.351)|2.821 (2.803–2.831)|3.124 (3.117–3.155)|
|patternWorldOff|7.616 (7.603–7.634)|8.504 (8.496–8.514)|2.282 (2.279–2.284)|2.566 (2.561–2.568)|
|aoOff|9.849 (9.829–9.856)|10.574 (10.567–10.584)|3.205 (3.205–3.217)|3.534 (3.525–3.541)|

**Dominant material result:** removing the pattern+world layer cuts island≈5.38ms noon/5.32ms night and civic≈1.70/1.80ms. Local-pattern-only and world-noise-only removals each save≈2.6–2.8ms on island. This is an ALU/texture/register/occupancy sensitivity experiment, not an additive CPU-accounting breakdown. Eight-tap height-field AO (materials.ts:288–305) is measurable but much smaller:≈0.43/0.50ms island. Pool/env/direct-BRDF/shadow-filter knockouts are comparatively small in these views. The onBeforeCompile JavaScript hook itself runs at compilation, not per fragment.

### Ocean feature knockouts

|Flag|Ocean noon ms|Ocean night ms|Noon delta from base ms|Night delta from base ms|
|---|---:|---:|---:|---:|
|base|11.797 (11.750–11.850)|13.042 (12.822–13.051)|0.000|0.000|
|sdfOff|11.224 (11.127–11.262)|11.974 (11.772–13.023)|0.573|1.068|
|zonesOff|11.320 (11.312–11.455)|12.843 (12.335–13.474)|0.476|0.199|
|wakeOff|9.185 (9.152–9.293)|11.743 (11.296–11.829)|2.612|1.299|
|noiseOff|10.086 (10.034–10.240)|10.342 (10.300–10.377)|1.711|2.700|
|skyOff|10.804 (10.770–10.865)|11.833 (11.784–11.958)|0.993|1.209|
|beamOff|10.951 (10.950–11.079)|11.789 (11.767–11.885)|0.846|1.253|

Definitions matter: sdfOff replaces only the **fragment** SDF sample with vec4(1); vertex coast damping stays intact. zonesOff uses zero zone values. wakeOff replaces history/live reads with0 but leaves wake producers running. noiseOff replaces uNoise samples with0.5, not the separate uRipple texture. skyOff replaces the shared band lookup with zenith, affecting reflection and distant haze consumers. beamOff compiles away the beam body; it is not the separate post beam/shimmer pass. Removing a feature can also enable compiler dead-code elimination of its consumers. These values cannot be summed into a no-look ocean optimization.

Noon strongest tested ocean sensitivity is wake reads/consumers≈2.61ms, then noise≈1.71ms; night noise≈2.70ms, with wave/beam/reflection state limiting cross-switch attribution. Wakes, zone colors, shore depth and glints convey the world and are not candidates for deletion. Shader source: ocean-material.ts:121–183 fields/normals; :258–300 sky/town reflection; :314–380 glints/beam; :382–474 foam/cloud composite. The generated5-wave normal is evaluated twice plus a crest path (waves.ts:29–45), motivating the exact reuse prototype below.

## 3. Reduction prototypes: GPU + SSIM + LOOK

These are the corrected, longer, drained final windows. Static totals explicitly include the depth-prepass draws; they are not hidden outside the GPU budget.

|View / flag|Island+civic incl predepth ms|Ocean ms|Whole GPU sum ms|SSIM / RGB MAE|
|---|---:|---:|---:|---|
|noon-final / base|13.696 (13.687–13.709)|11.064 (10.927–11.095)|44.328 (44.044–44.463)|1.000000000 / 0.000000|
|noon-final / depthPrepass|8.265 (8.263–8.298)|10.968 (10.967–10.985)|38.767 (38.678–38.794)|1.000000000 / 0.000000|
|noon-final / oceanExact|13.702 (13.689–13.705)|10.892 (10.835–10.953)|44.203 (43.995–44.340)|1.000000000 / 0.000000|
|noon-final / poolDaySkip|13.431 (13.423–13.432)|10.913 (10.900–11.062)|44.097 (43.842–44.601)|1.000000000 / 0.000000|
|night-final / base|14.963 (14.960–14.971)|15.377 (15.357–15.598)|52.795 (52.728–53.027)|1.000000000 / 0.000000|
|night-final / depthPrepass|9.060 (9.036–9.066)|15.427 (15.419–15.493)|46.922 (46.800–46.932)|1.000000000 / 0.000000|
|night-final / oceanExact|14.973 (14.967–14.979)|15.963 (15.927–16.025)|53.563 (53.447–53.622)|1.000000000 / 0.000000|
|night-final / poolDaySkip|15.023 (15.018–15.028)|15.997 (15.940–16.047)|53.888 (53.701–53.938)|1.000000000 / 0.000000|

- **Depth prepass — strongest result.** Render the identical static opaque island+civic geometry depth-only/DoubleSide, then the unchanged art scene with existing depth retained. Prepass costs≈0.57ms noon/0.61ms night. Static combined cost falls≈5.43/5.90ms net; whole submission sums fall **44.328→38.767ms (−5.561ms)** and **52.795→46.922ms (−5.872ms)**. This is not a60fps claim. Final before/after canvases are byte-identical: SSIM1/MAE0/no changed channels. LOOK inspected native full noon/night frames, retained canopy shape, roofs, boats, pool reflections and moon beam; no noticed loss in these tested summer views.
- **Fused ocean wave phases/trig — exact pixels, not a reliable win.** wave-experiment.ts keeps the original rounded constants, per-wave arithmetic order and amplitude paths, sharing phase/sin/cos between both normals and crest. SSIM1/MAE0 in both final pairs. Ocean11.064→10.892ms noon but15.377→15.963ms night; do not ship from these data. [INFERENCE] increased live values/register pressure or existing driver CSE can erase/reverse source-level savings; dynamic-water drift also remains. LOOK inspected full ocean/night reflection picture, with no visible change.
- **Uniform daytime pool early-out — small exact candidate.** Return0 before pool texture/height/exp work whenever uWindowGlow≤0.02, exactly where the existing smoothstep multiplier is0 (materials.ts:284). Noon island10.261→10.088ms, civic3.436→3.338ms, roughly0.27ms local combined. Night adds≈0.03–0.04ms local rather than saving; do not attribute unrelated ocean drift to it. Both pairs SSIM1/MAE0. This is a smaller candidate, not a replacement for the prepass.

**Prototype correction retained in evidence:** the first prepass collected renderables before later-added identity billboards existed. They leaked into the depth-only override pass, creating black sea patches and invalid “savings”; initial noon-extra/night depthPrepass results and SSIM≈0.964/0.971 are rejected. The corrected collector discovers all renderables before hiding non-targets; final images remove those artifacts and match byte-for-byte. Only final rows above support the prepass conclusion. The prototype is deliberately summer-static: production must preserve custom bare-crown depth discard in autumn/winter (materials.ts:610–638), and correctly include late additions/disposal, composer clear order and scene layers. Do not ship the diagnostic scene-visibility traversal unchanged.

**Rejected visual shortcuts:** FrontSide removes visible tree-canopy undersides (LOOK at paired noon frames); SSIM0.974985/MAE1.184 noon,0.989517/0.648 night. Direct-Lambert SSIM0.997311 but MAE1.682 noon,0.980096/2.146 night, so it fails the proposed MAE≤0.5 and changed-channel screen despite tiny timing gain. These are visual-risk, not marginal wins. Basic shadows were not visually certified here.

## 4. Quiet/capture-exclusive load A/B

After part1 captures ended, stopped the dev origin. Started **two owned identical Node static/API origins**, HEAD dist at5200 and saved SP-ISLAND dist at5199. OUT/server.mjs is SP-ISLAND's production-faithful origin adapted to NFS_PORT: HEAD uses existing shared dist, variant uses existing outputs/need-for-speed/sp-island/dist, with explicit HTTP Brotli for .br resources and real Pages API proxy. No build/new asset generation. API credentials stay server-side. This is HTTP1.1 localhost, not Cloudflare H2/H3/CDN negotiation evidence.

OUT/load.mjs runs **A,B,A,B… five cold fast4g captures per arm**, then three cold unthrottled per arm, all successful. 1600×1000@1, RTX, high pinned, same heart/noon URL, summer/reduced motion/intro0. Cold clears HTTP cache and origin storage, not driver shader caches. Unlike SP-ISLAND's old visual harness this run does not substitute an API snapshot: both arms use the real upstream. intro0 suppresses only CornerMark's delayed orientation caption, not reveal logic. Reveal probes copy LOAD: first completed observed engine frame; first fleet.stats.visible>0 after render; data-pv-live mutation; pv-poster removal. Precision is roughly one frame, not GPU presentation time.

Before fast4g batch: uptime4.65/4.48/4.92, top reports Chrome109%+85% plus desktop and I/O wait33%. Before unthrottled:4.66/4.56/4.89, one MainThread≈109%, I/O wait41%. These are snapshots, not continuously sampled attribution. No other research build/test/capture was launched by this agent. The tight fast4g range demonstrates useful repeatability despite residual desktop load; unthrottled remains noisier. Both arm3 screenshots were actually inspected and visibly contain a live fleet/civic scene. All16captures report only the four existing Permissions-Policy warnings, no missing-asset/page errors; visible boat counts range234–257.

All durations ms; parentheses min–max. **Wire is CDP waterfall completed-response wire**, including headers, excluding chrome-extension/data URLs. It is not the request log's body-size estimate, and excludes partially received bodies at the frame boundary.

|Network / arm|n|First live frame ms|Boats visible ms|Crossfade starts ms|Poster removed ms|Completed site wire B|Completed site wire at live frame B|
|---|---:|---:|---:|---:|---:|---:|---:|
|fast4g / head|5|5798.5 (5760.8–5818.3)|5798.5 (5760.8–5818.4)|5880.4 (5837.9–5901.7)|7010.7 (6947.9–7023.1)|7845898 (7845898–7845898)|6026335 (6026335–6026335)|
|fast4g / variant|5|4736.5 (4729.2–4747.0)|4736.5 (4729.2–4747.0)|4817.6 (4809.8–4835.7)|5937.0 (5923.7–5944.0)|6806037 (6806037–6806037)|4745613 (4745613–4909815)|
|none / head|3|2947.2 (2447.6–2993.2)|2947.3 (2447.6–2993.3)|3085.1 (2683.0–3224.6)|4209.4 (3804.7–4344.7)|7845899 (7845898–7845899)|6038841 (6038840–6038841)|
|none / variant|3|2806.7 (2767.0–2829.4)|2806.7 (2767.0–2829.4)|2979.2 (2945.1–3003.1)|4105.7 (4065.1–4117.2)|6806038 (6806037–6806038)|4745614 (4745613–4745614)|

**Headline remeasurement:** fast4g median first-live/data frame **5798.5→4736.5ms, −1062.0ms (18.3%)**; poster removal **7010.7→5937.0ms, −1073.7ms**. Interleaved first-frame paired savings are1078.7,1081.8,1058.1,1040.7,1031.6ms: all5pairs favor the variant. This confirms the earlier≈1.09s local combined-variant claim in the same order of magnitude without a wide contended tail. It does not approve the lossy geometry's scenery equivalence or establish a live-CDN gain.

Unthrottled median first frame2947.2→2806.7ms (−140.5ms); HEAD's2447.6ms minimum beats every variant sample, so **do not promise a universal unthrottled win**. The full selected body saving remains SP-ISLAND's947,711B; observed completed site wire falls by≈1,039,861B including fewer response headers/changed bundle transport. Larger differences in completed bytes at an earlier first frame are not extra permanent asset savings. Stock load.wireBytes includes the13,160Bextension; OUT/load-summary.json keeps both counters.

## 5. Findings / implementation ranking

|ID|Opportunity|Evidence|Proposed change|Expected gain|Visual impact|Effort|Risk|Dependencies/conflicts|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|SP-FRAG-01|Static opaque early-z prepass|Final three-window sums, SSIM1 both times; depth-experiment.ts|Productionize a targeted depth-only pass with exact seasonal/custom depth contracts; retain art shaders|Measured≈5.6/5.9ms whole GPU sum here; no60fps guarantee|None in tested summer heart pairs; winter/storm/cameras must preserve discard|M|Medium composer/depth/lifecycle correctness and extra CPU traversal|SP-IGPU; static merge; customDepthMaterial; not additive with reducing the same overdraw|H measured view / M broader|
|SP-FRAG-02|Pattern/world shading dominates kit|Island pattern knockout saves≈5.3ms; local/world halves≈2.6–2.8ms each|Evaluate exact pattern-ID-specialized static batches/materials; preserve alpha, normals, season inputs and world breakup|[estimate] ceiling is knockout cost, not expected guaranteed saving; draw-call tradeoff unmeasured|None if specialization is algebraically identical; baking/interpolation is visual-risk|M/L|More draws/programs; pipeline complexity|Static merge/exporter; preserve baked AO and per-face pattern semantics|H bottleneck / L gain forecast|
|SP-FRAG-03|Skip mathematically dark pool shading|SSIM1 day/night;≈0.27ms static noon saving|Uniform early return when uWindowGlow≤0.02; no time-of-day recompile|Measured≈0.27ms local noon, small night overhead|None for finite existing inputs|S|Low|Pool texture remains for night/ocean|H exactness / M performance|
|SP-FRAG-04|Do not blindly replace PBR/PCF/sidedness|Small BRDF/shadow deltas; sidedness/Lambert fail golden screens|Keep double-sided foliage and dielectric highlights; only specialize proven closed geometry|No accepted default gain|Avoids visible canopy/highlight loss|S trial / M safe classification|Medium look regression|Authoring material roles and weather|H rejection in tested view|
|SP-FRAG-05|Per-region lights / bake static lamp irradiance|Low already4+zero/range guards; point0 removes≈1.07ms island+0.47ms civic at night|If needed, custom per-region uniform remapping/counts; evaluate moving static spill into existing pool with directional/height fidelity|[estimate] cannot exceed current point0 local delta without other changes; daytime≈0 benefit from BRDF removal|Pool replacement visual-risk on walls/normals/moving lights|M/L|Shader binding, camera/light movement and double-counting|Three layers filter against camera, not mesh; no built-in per-material light cap|H architecture / L accepted gain|
|SP-FRAG-06|Combined first-frame byte plan holds up|5interleaved fast4g pairs;3unthrottled pairs|Use SP-ISLAND transport/packing ranking; keep lossy RGB/high geometry gated|Measured−1.062s fast4g local first-live,−1.074s poster removal|Load timing not scenery approval; exact transport first|M|CDN negotiation/cache/container/memory and prior visual gates|SP-ISLAND, EDGE; not additive with same asset byte savings|H local timing / M deployed|
|SP-FRAG-07|Ocean phase/trig reuse not a shipping winner|SSIM1, noon−0.17ms but night+0.59ms|Keep exact prototype as evidence; reject assumed source-ALU win|No reliable positive gain established|None in tested pairs|S|Occupancy/driver differences|Other ocean optimizations must preserve wakes/zones/foam|H no uniform win|

**Culling detail:** Three WebGLRenderer collects lights matching the camera layers (WebGLRenderer.js:1409–1430,1860–1866); it does not build a light list for each mesh's layers. NUM_POINT_LIGHTS belongs to scene/render-state program parameters (WebGLPrograms.js:336–358). A per-object cap needs custom shader uniforms/remapping or separate coherent render scenes/passes, not simply material.layers. Static lamps already have a projected pool representation, but it uses top-down irradiance and height bands (materials.ts:276–284), not full normal-dependent point attenuation/specular. Replacing, not double-counting, point contributions requires explicit noon/night wall/roof/ground goldens. The current low-point budget does not justify implementing that complexity before the much larger prepass/pattern work.

## 6. Ruled out, boundaries and handoff

- No graphical fallback/WebGPU/data-mapping changes, missing actors, warning suppression, or omitted producer cost presented as a subsystem win.
- No default DPR/quality downgrade; no claim that ocean feature removal is invisible. Fog/zero-light skips already shipped are not new work.
- Failed frozen timing is preserved, not silently replaced with fabricated numbers. Ingredient table is a dynamic reduced-motion diagnostic with stated cross-switch drift, while final still pairs are exact-state. The large, stable static prepass gain is independently visible in local pass costs and includes its added draws.
- Fully isolated thermal/mobile/iGPU-wide certification, winter/storm/DPR2/other-view prepass validation, CPU-overhead measurement, live-CDN deployment and SP-ISLAND lossy geometry visual approval were not exercised. These are production acceptance boundaries, not hidden successful checks.
- No operator decision blocks the research ranking. Operator approval is required before accepting any visibly changed fallback, shadow sampling or geometry precision policy.

**Artifacts and cleanup:** report agents/2026-10-19-need-for-speed/p2/sp-frag.md; patch OUT/spike.patch (34,008B). git apply --check succeeded against unchanged HEAD b71dd282. The dev server and both owned load origins were stopped; git worktree remove --force .worktrees/nfs-sp-frag and git branch -D nfs/sp-frag completed. Raw JSON/PNG/logs, timing/load runners, load summary and all comparison metrics remain in OUT. No build/lint/test gate was run or claimed.
