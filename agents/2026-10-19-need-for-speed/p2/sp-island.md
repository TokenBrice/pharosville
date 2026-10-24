# SP-ISLAND — combined first-frame byte plan

## Scope and method

Research/planning verification spike against HEAD `b71dd282`; no tracked main-checkout source/assets changed. Read the brief, AGENTS, p1 LOAD/GLB/MEDIA/EDGE (02/04/10)/EXTERNAL (02/03)/SCENE (01)/FRAME, Vite preload plugin, AssetStore/prefetch, SDF decoder, camera rig/layout, compression script and island exporter. A read-only scout mapped exporter and runtime contracts. Prototype changes are confined to `.worktrees/nfs-sp-island`; generated files and evidence live in `outputs/need-for-speed/sp-island/` (abbreviated **OUT** below).

Commands: documented `npm run worktree:new -- nfs-sp-island --branch nfs/sp-island`, symlink root node_modules; `node OUT/generate.mjs`; `npx vite build --outDir /home/ahirice/Documents/git/pharosville/outputs/need-for-speed/sp-island/dist` from the worktree; `node OUT/check.mjs`, `node OUT/contracts.mjs`, `node OUT/options.mjs`; approved `npm run preview` through `OUT/capture.mjs`. No `npm run build`, shared dist writes, lint, formatter or full suite. The Vite variant build succeeded (311 modules); existing zod annotation/prelaunch static+dynamic import warnings remain.

Port5195 was already occupied; the orchestrator assigned **5197** instead. `OUT/server.mjs` is the 4180 production-faithful static origin + real Pages API proxy adapted to5197 and explicit Brotli HTTP responses. It is HTTP/1.1, not a Cloudflare H2/H3/CDN emulator. No other service was stopped. All stopwatch observations are **contended**; deterministic file sizes/checksums are not.

## Root cause and decisive constraints

1. The normal fast4g LOAD run's island ends4265ms; the island-gated civic/kit fan-out ends5289/5425ms, and first live frame is5944ms (`p1/load.md:77–90`). This is real byte/dependency work, unlike an assumed 2s shader-only first draw. Current engine prefetch already exists (`prefetch.ts:21–33`); proposing it again adds nothing.
2. Island is already high meshopt with OCT8 normals. Its dominant coded streams are positions2,183,137B, colors1,401,526B, normals696,430B; it has no textures, tangents or UV2 (`p1/glb.md:37–50`). There is **no additional high/OCT8 island windfall**. The high/OCT8 win is in the eager kit/civic assets, which were medium. Preserve existing island position/normal precision.
3. RGB is baked AO and seasonal/classification input; COLOR alpha is pattern ID/16. The safe pass changes **only opaque non-foliage RGB**, retaining patterns8/14 and window/emissive colors and all alpha. P1 exact decoded comparison measured max RGB change2/255, zero position/normal/pattern changes. This spike uses that real `rgb6-safe.glb`, not a global quantization approximation.
4. Live `.glb.gz` is `application/gzip` **without Content-Encoding**, per S8's GET+HEAD audit (`p1/edge.md:36–57`). `assets.ts:55–61` checks magic1f8b then inflates with `DecompressionStream("gzip")`; correctly HTTP-decoded GLB bypasses that branch. This is not browser automatic gzip today.
5. Switching to raw `.glb` and trusting Cloudflare default compression is ruled out: S8 measured identity4,613,120B for raw model/gltf-binary even with br/gzip/zstd-only offers, versus current gzip2,556,686B. Cloudflare needs an explicit tested Compression Rule or deliberately encoded static representation.
6. Sea-SDF is **three exact8-bit data channels**, shared with simulation coast clearance. Lossy image encoding/global downsampling is not a scenery-neutral media optimization. Emblems AVIF1,482,977B is already fetched **after** first frame; none of it is subtracted from this plan's initial bytes.

## Deterministic file measurements

All bytes decimal, compression is gzip9 or Brotli quality11. HEAD column uses committed gzip (normally stronger Zopfli), not recompressed gzip9. Pack sizes include the real directory and header, unlike p1 concatenation lower bounds. Whole first-frame asset set here means **island + lighthouse +49 eager kit +17 initial civic GLBs +sea**, excluding common JS/API/poster/manifests, optional early yard/decorative traffic and HTTP headers.

| Option (alternatives unless combined explicitly) | Island B | Lighthouse B | Eager kit B | Initial civic B | Sea B | Total selected first-frame body B | Saved vs HEAD B |
|---|---:|---:|---:|---:|---:|---:|---:|
| HEAD committed gzip + exact WebP |2,556,686|45,909|509,725|396,269|823,078|**4,331,667**|—|
| Transport only: individual Brotli |2,386,501|44,285|486,164|380,052|823,078|4,120,080|211,587|
| SafeRGB6 island only, gzip9 |2,426,299|45,909|509,725|396,269|823,078|4,201,280|130,387|
| High/OCT8 kit+civic only, individual gzip9 |2,556,686|45,909|450,827|370,569|823,078|4,247,069|84,598|
| Two HEAD packs, Brotli |2,556,686|45,909|336,362|318,568|823,078|4,080,603|251,064|
| Exact sea planar-delta Brotli only |2,556,686|45,909|509,725|396,269|602,013|4,110,602|221,065|
| Current named-detail split, core gzip9 |2,604,502|45,909|509,725|396,269|823,078|4,379,483|**−47,816**|
| SafeRGB6 +high, individual gzip9 |2,426,299|45,909|450,827|370,569|823,078|4,116,682|214,985|
| SafeRGB6 +high packs, gzip9 |2,426,299|45,909|382,164|365,535|823,078|4,042,985|288,682|
| SafeRGB6 +high packs, Brotli; retain WebP |2,183,639|44,285|274,036|279,983|823,078|**3,605,021**|**726,646 (16.8%)**|
| **Combined prototype: safeRGB6 +high packs +exact sea, HTTP Brotli** |**2,183,639**|**44,285**|**274,036**|**279,983**|**602,013**|**3,383,956**|**947,711 (21.9%)**|

`OUT/options.json` is the machine-readable table. The simple split row is deliberately compared against actual shipped Zopfli; relative to a same-encoder q14 baseline it saves only13,884B, but still loses against shipped first-frame gzip. A split is not worth shipping from current flattened assets.

### Real container layout and combined encoding evidence

| Container | Entries | Decoded B including directory | Directory/header B | gzip9 B | br11 B |
|---|---:|---:|---:|---:|---:|
| HEAD eager kit |49|1,110,133|2,689|496,261|336,362|
| High eager kit |49|986,675|2,679|382,164|274,036|
| HEAD initial civic |17|1,182,206|886|430,129|318,568|
| High initial civic |17|996,719|883|365,535|279,983|

Format: `NFP1` magic +little-endian u32 UTF-8 directory length; JSON maps original runtime GLB URL to `[payload-relative offset,length]`; concatenate intact GLBs. The generated runtime mapping contains absolute pack offsets. This preserves individual GLTFLoader/node/material contracts and removes **66 model responses →2**, not66 sequential RTTs. HTTP2/3 multiplexing means request-count arithmetic is not a time prediction. Independent hull-stages and20 lazy cove pieces stay outside both containers.

`OUT/checks.json`: HTTP200 +`Content-Encoding: br` on all five replacement resources; Node fetch's native HTTP decoder produces exact SHA256-identical raw files. All66 extracted models match their high-encoded source byte-for-byte and parse with the **actual vendored Three meshopt decoder** (294 meshes;177,025 vertices). `OUT/contracts.json`: all66 preserve node names, mesh names, attribute semantic sets and per-primitive vertex/index counts; island preserves its28nodes/15meshes and those contracts too. This is not a claim that new OCT8 normals are numerically identical to old i16 normals.

Attribute pruning: high variants prune unused accessors/material data but preserve attributes and leaf nodes (`prune({keepAttributes:true,keepLeaves:true})`). Island POSITION/NORMAL/COLOR are all consumed; tiny emissive-normal stripping saved only284gzipB in p1 and is rejected. Hull `_PAINT`, `_BRAND`, sail UV0/UV1 and civic-office UVs remain. Do **not** apply generic glTF scene pruning or delete named mast/gauge/pivot nodes.

### Sea alternatives and exact binary prototype

The real exact sea file is `OUT/sea-sdf.bin.br`: header `NSD1` +u32 width/height, then three planar channels of horizontal byte delta (reset predictor each row). Raw12,582,924B; gzip813,107B; br602,013B. Decoder reconstructs directly into the existing flipped16MiB RGBA output and4MiB coast array; no bitmap/canvas/getImageData intermediates. `checks.json` verifies **zero RGB mismatches across2048² texels**, same opaque alpha and exact coast, with output SHA256 values recorded. GPU format, filtering and dimensions stay unchanged: this is a network/CPU-data-path optimization, not a VRAM downsize.

| Sea alternative | Body B | Verdict |
|---|---:|---|
| Current2048 exact WebP |823,078|Lowest-change recommended fallback design; already correct shared data|
| RGB PNG |2,876,415|Reject: +2.05MB despite faster native decode proxy|
| Planar delta gzip +header |813,107|Only9,971B saved; not worth new decoder for gzip alone|
| **Exact planar delta HTTP Brotli +header** |**602,013**|Measured−221,065B; exact data; browser/main-thread reconstruction and memory gate required|
| Whole1024 WebP |308,862|Reject as drop-in: changes coast sign at6,185 sampled texels, max~1m coast error|
| Exact2048 coast-only WebP |183,618|Not a replacement: lacks depth/structure. A full-coast +lowres visual split has extra sample/request complexity and unapproved appearance|
| KTX2/Basis |not measured here|Not appropriate for exact CPU data; also adds decoder/transcoder and cannot remove sim coast|

## Core/detail island and offline ground decisions

The current exporter (`hb_export.py:141–212`) flattens terrain/buildings/foliage into four spatial opaque chunks. They contain97.9% of island triangles. Existing named windows/lamps/detail defer only2,071 triangles/14,610gzip9B; splitting totals grows726B against equal encoder and risks missing mast/gauge services and night pop-in. **Do not implement a current-asset core/detail split.** A meaningful future split must occur before flattening, classify geometry by semantic feature, keep terrain/coast/shadow occluders and required nodes in core, and preserve baked AO. No large safe deferred layer has been demonstrated; that is a generator/art project, not this byte plan.

SCENE-01 ground/AO bake is separate: `ground.ts:39–96` currently renders exact topmost static surfaces into1024²float height, reads16MiB RGBA, extracts4MiB heights, and builds512²half-float max-pooled AO (`:21–34`). A precomputed field could avoid the render/readback, but adds up to4.5MiB raw exact sidecars before compression and must match GPU rasterization/row/bilinear/FLOOR−8 semantics. Do not add unmeasured sidecar bytes to the first-frame winner or promise a1:1 CPU gain. This spike leaves ground production unchanged; it still includes full-island ground/shadows, so a visible core-only layer would not automatically avoid needing the detail for equivalent ground.

## Implementation-ready production pipeline

1. **Exporter:** retain island current high/OCT8 and position precision. Apply semantics-masked RGB6 after AO has been baked (`hb_export.py:266–321`) and before final meshopt encoding (`:385–393`), preferably once from raw authoring GLB rather than repeatedly quantizing shipped geometry. Mask using material role and exact pattern alpha; preserve patterns8/14, all alpha and all window/emissive fields. Pin encoder versions/flags; the current island exporter invokes CLI4.1.1, while this research's reencoder uses glTF-Transform4.5.1. Change medium kit/civic exporters to explicitly high/OCT8 only after the same contract/looks gates. Keep node/extras and custom attribute semantics. Do not strip all UVs because the island happens not to need them.
2. **Asset packing/compression:** extend `scripts/harbour/compress-assets.mjs` after export, before fingerprinting, to build the49/17 indexed containers from manifests +layout, encode Brotli and gzip alternatives deterministically, and emit the single runtime asset mapping. Add exact SDF planar-delta generation/roundtrip verification if its runtime gate passes. Keep authoring sources outside deployed public output. Existing valid gzip siblings are currently preserved; do not compare a fresh gzip9 result against claimed Zopfli gains without labeling it.
3. **Transport:** prefer explicit static fingerprinted `.glb.br`/`.pack.br`/`.bin.br` objects with **actual HTTP `Content-Encoding: br`**, correct MIME and immutable policy only after content hashing. Browser HTTP decoding, not `DecompressionStream("br")`, handles Brotli; no extra JS decoder. Contemporary supported WebGL2 browsers support HTTP Brotli even when JS DecompressionStream lacks it. If choosing negotiated raw `.glb` instead, first prove a Cloudflare rule on a preview deployment, vary/cache validators by representation and retain gzip negotiation. `_headers` does not perform negotiation or discover siblings by itself. The prototype's explicit five header rules are not a deployed negotiation proof.
4. **Loader:** `AssetStore` keeps the public original URL →GLTF promise contract; mapping selects decoded pack/single-file bytes, one fetch promise per container, slices exact entries and calls current `parseAsync` with the original GLB base path. Productionize pack header/version/bounds/directory validation and release consumed byte buffers; this spike retains pack buffers for engine lifetime. Do not couple native HTTP-br selection to JS DecompressionStream support as the old gzip helper does. No second GLTF scene convention or fleet/civic caller migration is needed.
5. **Prefetch/manifests:** migrate Vite preloads and runtime mapping atomically. Preserve desktop media gate, credentials and low-priority island. The measured spike deliberately retains the shipped island→small-file release boundary; it only coalesces small-file transport. A later measured scheduler could start two low-priority packs earlier, but changing bandwidth fairness is **not** included in its byte gain. Generate one initial-civic subset from layout, not all18kinds; keep hull-stages/cove separate. EDGE-10's per-engine typed JSON promises should remove duplicate prefetch/consumer manifest fetches; do not introduce module-global cross-engine state. Do not count the raw94KB kit manifest as94KB saved wire.
6. **Deployment:** fingerprint object paths first, rewrite dependent manifests then hash those, generate both preload and loader references from the same map, retain previous assets for existing tabs/rollback, apply immutable only to versioned paths. Never blanket-cache current stable `/harbour/*` names immutable. The prototype uses stable names intentionally for an isolated asset experiment, not a production caching recommendation.

## Risks and eventual implementation acceptance

- **Visual gates:** preserve same immutable API snapshot, time/season/weather, random/date seeds, viewport/DPR/GPU/quality. Compare heart/overview/closest90m day/night; add winter/snow/storm and DPR2 before release. Inspect native-resolution foliage/AO, roofs, civic facades, tiny normal facets, lamps, shore foam and boat identity. Screening thresholds from FRAME are SSIM≥.995, MAE≤.5/255, ≤1% channels differing>3, **not** aesthetic approval; calibrate local same-config repeats (~.9995 earlier noise floor). No missing boats/named scene nodes or pattern changes.
- **Exact tests:** gzip/br decompression checksums; directory bounds/magic/version, duplicate/missing entry and truncated container failures; every high asset parses with shipped decoder; node/mesh/custom-attribute contracts; exactly equal SDF RGBA/coast bytes including row orientation/alpha. Same simulation routes/clearance and ground heightAt/AO masks must remain unchanged.
- **Browser/transport gates:** Chrome/Firefox/Safari supported versions; HTTP-br decode without JS-br support; native gzip/identity path where required; no doubled decode; correct MIME/nosniff, Content-Length/Encoding/Vary/validators, supported error behavior and content hash invalidation. A Pages preview/live check is required; local Node origin is not proof of CDN negotiation.
- **Network gates:** rejected viewport fetches no world/API; admitted cold load fetches only two eager containers, no66GLB response fan-out, and hull-stages/cove remain lazy. Gated preloads match loader URL/credentials. No full emblem image enters pre-first-frame. Repeat visit across deploy uses coherent versioned assets without stable-name immutability.
- **Performance gates:** quiet-machine alternating≥3 cold fast4g same-view captures; report first live/data frame, crossfade and completed wire bytes separately. Browser reconstruction must not turn221KB saved sea transfer into an equal/larger main-thread critical long task. Compare peak memory and CPU-throttled/iGPU boot; pack retained decoded bytes/copies and cache invalidation granularity are real tradeoffs. Do not require a first-frame win from mere request-count reduction.

## Real-GPU visuals: exercised, not blanket-approved

Exactly **12 captures**, all through the approved preview/serialized real-GPU lane: HEAD and combined variant ×heart/overview/closest ×noon12/night22. RTX5070Ti,1600×1000@1, high pinned, summer/CALM/reduced motion, intro0; closest uses `?cam=<heart target>,90,26`. The immutable p1 seven-API snapshot, fixed Date/random seed, all-systems-ready wait and golden freeze hook were reused. The init wrapper still awaited real API fetches before substituting the same snapshot bodies, preserving their network occupancy. No snapshot payload was fetched over the page network: it was injected through an isolated capture-tool `--init-script-file` addition after the initial inline-argv attempt failed E2BIG **before launching a capture**. The separate `capture-harness.patch` records this tooling-only change.

`OUT/visual-summary.json` and `diff-*.json` use FRAME's same8×8 luminance SSIM/RGB diagnostics. Pair images have HEAD left, variant right; amplified differences are8× absolute RGB. All six pairs and the detailed noon stone/roof/foliage crops were actually inspected (not inferred from metrics).

| View/time | SSIM | RGB MAE /255 | Channels differing>3 | Pair /difference PNGs under OUT |
|---|---:|---:|---:|---|
| Heart noon |.882059|6.4696|22.9518%|`pair-heart-t12.png`, `diff-heart-t12-x8.png`|
| Overview noon |.895462|6.8317|29.6779%|`pair-overview-t12.png`, `diff-overview-t12-x8.png`|
| Closest noon |.923659|6.9884|34.2812%|`pair-closest-t12.png`, `diff-closest-t12-x8.png`|
| Heart night |.994920|.50995|2.4211%|`pair-heart-t22.png`, `diff-heart-t22-x8.png`|
| Overview night |.998990|.13586|.4811%|`pair-overview-t22.png`, `diff-overview-t22-x8.png`|
| Closest night |.999323|.11531|.1833%|`pair-closest-t22.png`, `diff-closest-t22-x8.png`|

**Interpretation:** night overview/closest screen as marginal against the earlier~.9995 clean noise floor; night heart narrowly fails the proposed aggregate screening. Day full-frame comparisons clearly **fail**, and cannot approve visual equivalence. Inspected noon pictures have conspicuously different boat positions and water/foam state while static geography, building silhouettes and foliage remain recognizably matched. The amplified closest diff is dominated by water/foam and changed vessels, not wholesale removed static geometry. `[INFERENCE]` asynchronous sim adoption/random-consumption and non-reset eased system state contribute: setting `engine.clock.elapsed=120` does not reset Ocean's private `MotionClock` or `seaU.lerp` state (`ocean-system.ts:274–276`), and FRAME already warned of boot-order/worker/LOD determinism limits. This does **not** establish that every difference is harness noise, nor absolve the changed SDF/normal/color pipeline.

Existing captures were additionally cropped without new GPU captures:

| Closest static ROI | Noon SSIM /MAE | Night SSIM /MAE |
|---|---:|---:|
| Foliage180×145 |.995743 /.55042|.999811 /.03045|
| Stone145×120 |.999745 /.18341|.999684 /.08615|
| Roof160×110 |.997215 /.71114|.999069 /.17574|

Coordinates and complete metrics: `OUT/crop-summary.json`; inspect `crop-{head,variant}-{foliage,stone,roof}-t{12,22}.png`. The stone detail is near-identical; the roof and foliage remain very similar on inspection, but noon ROI diagnostics are not uniformly below screening thresholds. **RGB6/high encoding stays visual-risk / conditional, not approved scenery-safe.** All requested views were captured; capture cap is exhausted, so the plan requires a corrected deterministic same-state follow-through rather than fabricating a passing golden.

## Cold fast4g estimate and measured local spike

Byte-only bandwidth estimate at the supplied~1,100B/ms: `947711/1100` = **862ms aggregate link occupancy** saved by the full combined selected assets; retain-WebP option saves661ms. This is not additive to scheduling/CPU gains. Applied to LOAD's5944ms normal fast4g first frame, a simple bandwidth-limited projection is about**5082ms**; defensible planning range is **0–0.86s** before separate request/scheduling effects. Island transfer alone loses373,047B (~339ms), eager packs lose351,975B (~320ms), exact sea loses221,065B (~201ms), lighthouse1,624B (~1ms). Their interaction/overlap prevents summing those as independently observed critical-path times.

There are **three alternating cold fast4g captures per arm**, one each heart/overview/closest at noon; not three repetitions of one camera. All other scene/data/GPU controls match. Each capture clears HTTP cache and origin storage; driver shader cache is not cold. Numbers are **contended**, HTTP1.1 local proxy, and not a Cloudflare H2/H3 release benchmark.

| Arm | First frame heart /overview /closest ms | Median first frame ms | Median completed wire at first frame B | Median full capture wire B |
|---|---|---:|---:|---:|
| HEAD @4180 |5848 /5816 /5803|**5816**|6,037,308|7,856,871|
| Combined @5197 |4801 /4723 /4728|**4728**|4,744,081|6,817,010|
| Observed delta |1047 /1093 /1075|**1088ms (18.7%)**|−1,293,227|−1,039,861|

The full-capture wire reduction is close to the947,711 deterministic body saving plus eliminated response headers (64 fewer responses net), minus changed JS/mapping overhead. The larger first-frame completed-wire delta also includes resources that finish only after the earlier variant frame; **do not claim1.293MB of permanent asset savings**. The snapshot substitutes returned data bodies but awaits actual API responses; this is representative network occupancy with fixed world data, not untouched live-production initialization.

| Median request milestone, ms after navigation | HEAD | Combined |
|---|---:|---:|
| Sea completed |2628|2209|
| Island completed |4279|3749|
| Variant civic pack completed |—|4342|
| Variant kit pack completed |—|4337|

Variant pack requests begin3760–3774ms, only after island bytes; the intentional boundary remains. Captures record79 individual civic/kit GLB responses in HEAD versus13 remaining independent ones +2packs in the variant. Thus66 initial models are packed; **not all89world models are made compulsory**, and the remaining13 observed responses include independently loaded yard/cove work. The actual shared machine's phase medians are not exclusive CPU: ocean280→54ms, civic350→526ms, fleet564→73ms, firstRender406→198ms, composer111→121ms. Mixed timing effects and changed scheduling mean the1088ms measured result is not purely a codec speedup; notably civic's awaited interval becomes longer. No isolated browser SDF reconstruction microbenchmark or peak-memory capture was taken.

Raw capture evidence: `OUT/{head,variant}-{heart,overview,closest}-t{12,22}.json/.png/.log`; `OUT/load-summary.json`. No page errors/missing-asset errors were observed; console warnings in the checked variant capture concern existing unsupported Permissions-Policy feature names.

## Recommendation and updated findings

**Implement the exact transport/packing cutover first; keep lossy precision changes gated.** A lossless geometry baseline is already available: HEAD island Brotli +HEAD49/17packs +current WebP totals**3,908,794B**, saving**422,873B (9.8%,~384ms link occupancy)** without changing any decoded GLB/image. Add exact-sea only after the browser-state/reconstruction gate: **3,687,729B**, saving**643,938B (14.9%,~585ms)**. SafeRGB6/high then increases the demonstrated byte ceiling to947,711B; it is not required to capture most of the lossless benefit. Do not silently ship all precision changes because the combined timing improved.

| ID | Opportunity | Evidence | Proposed change | Expected gain | Visual impact | Effort | Risk | Dependencies/conflicts | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| SP-ISLAND-01 | Combined scoped packing +correct HTTP Brotli | Real indexed HEAD49/17packs; HTTP decode hashes; raw GLB identity regression in S8 | Fingerprint and serve explicit encoded static objects; preserve existing parsers, gate and lazy pieces | **422,873B** exact selected-body saving with current geometry/WebP;66→2model responses;~384ms link occupancy estimate | **None in decoded bytes**; deployment/scene equivalence still gate | M | Medium delivery/cache/pack contract | EDGE-02/04/10; one generated registry for loader/preload/manifests | H bytes/contracts, M deployed latency |
| SP-ISLAND-02 | Add semantics-safe RGB6 +high/OCT8 eager geometry | Real combined files; all66 naming/semantic/count contracts; six paired GPU views | Apply once from authoring source; retain foliage/alpha/emissive/UV/pivots; approve deterministic day/night/winter close looks before cutover | Combined geometry+WebP saving726,646B; **incremental303,773B** over exact HEAD-geometry transport/pack option | **Visual-risk pending**; night overview/closest near noise floor; day comparisons contaminated/fail | M | Medium normal/AO/season threshold risk | Not additive with standalone p1 encode/transport rows | H bytes, M/L visual acceptance |
| SP-ISLAND-03 | Exact full-res planar-delta sea over HTTP Brotli |602,013B including header; zero RGB/coast mismatches; native HTTP decode checks | Replace image/canvas decode only, preserve2048RGBA/CPU coast/texture semantics | **221,065B** extra saving;~201ms link occupancy estimate; total combined byte ceiling947,711B | Exact reconstructed data, but **whole-scene equivalence not approved** from contaminated day captures | M | Medium reconstruction long task/memory/browser byte policy | HTTP-br delivery; compare actual baseline browser-decoded bytes and reset sea state | H file equality, M runtime benefit |
| SP-ISLAND-04 | Do not split flattened island yet |97.9% opaque triangles; only13.9KB equal-encoder core saving; shipped-Zopfli regression | Retain current full island; any useful future split must originate before flatten/AO with full core service/shadow budget | Current safe-ready opportunity effectively0; no large deferred layer proved | Avoids transient scenery loss | L for meaningful future generator redesign | High pop-in/ground/AO/service coupling | SCENE-01 ground bake not a free bandwidth add-on | H rejection of current split |

No operator decision is required to adopt the research ranking. Production delivery/visual/quiet-timing gates above are explicit prerequisites to shipping, not hidden unfinished spike work. Prototype artifacts are complete: **`OUT/spike.patch`**, `packed-assets.json`, `island.glb(.br)`, `lighthouse.glb(.br)`, `kit-{head,high}.pack(.br)`, `civic-{head,high}.pack(.br)`, `sea-sdf.bin(.br)`, full variant dist, generation/check/comparison runners and all captures. The patch changes only loader/SDF/preload/header integration plus generated mapping; the separate capture-harness patch is not part of the app.

### Handoff and cleanup evidence

`git apply --check OUT/spike.patch` and the separate capture-harness patch both succeeded against the untouched main-checkout tracked HEAD. The isolated5197origin was stopped; `git worktree remove --force .worktrees/nfs-sp-island` and `git branch -D nfs/sp-island` completed. No main tracked source/assets or shared dist were edited. `OUT/island-head.glb.br` additionally preserves the exact-geometry lossless transport baseline.

Re-measure by recreating the documented worktree, linking node_modules, applying `spike.patch` and (for the captured fixed-data protocol) `capture-harness.patch`, then running `generate.mjs`, the documented isolated Vite build, `server.mjs` with `NFS_DIST=outputs/need-for-speed/sp-island/dist`, and `capture.mjs`. The saved dist/assets/JSON/PNGs remain independently available after worktree removal. Correct golden-state reset is required before interpreting new day SSIM as an encoding quality gate.
