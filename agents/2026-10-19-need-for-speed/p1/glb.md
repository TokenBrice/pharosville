# GLB assets — initial bytes, decode and preprocessing

## 1. Scope and method

Research only; no tracked source/assets changed, no application build, no server restart, no browser launched. All generated GLBs and measurement scripts are under `outputs/need-for-speed/glb/`. No real-GPU captures were queued, following the orchestrator's load/frame measurement-owner priority; numerical visual classes below are **not a claim of side-by-side visual equivalence**.

Read: mandatory brief/AGENTS, architecture, AssetStore, prefetch, island system, static merge/material port, hull kit/fleet LOD, civic assembly/system, camera/layout, Blender exporters and compression script. Read `git show --stat 77a03538` and `3a015980`: former concerns retired garden models, not an unshipped harbour opportunity; latter already shipped meshopt/gzip/prefetch/static merge. Do not propose adding those again.

Tools/commands executed:
- Isolated scratch install: `npm install --prefix outputs/need-for-speed/glb/tools --no-package-lock --no-audit --no-fund @gltf-transform/cli @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions` (v4.5.1).
- `.../tools/node_modules/.bin/gltf-transform inspect public/harbour/island.glb` and representative `kit/titan_usdt.glb`; full 89-file binary census via `node outputs/need-for-speed/glb/inventory.mjs`.
- `node .../variants.mjs`, `node .../filters.mjs`, `env SAFE_ONLY=1 node .../filters.mjs`, `node .../manifest.mjs`, `node .../kit-encode.mjs`, `node .../premerge.mjs`, `node .../error-bounds.mjs`, `node .../premerge-error.mjs`, `node .../patterns.mjs`.
- `npx tsx .../preprocess.mts`, `npx tsx .../bake-kit.mts`; gzip-pair/manifest-size probes in Node. All 89 committed .gz files inflate exactly to their .glb siblings.

**Timing protocol:** meshopt decode seven runs, median; GLTFLoader parse five runs, median; source preprocessing and fleet baking seven runs, median. Exact runtime decoder imported from three's vendored module, **not** the newer dev-only encoder package. Target allocations are included. Node24 on this heavily shared workstation; **all CPU timings contended**. Parse includes meshopt decode, so do not add decode+parse. No texture decoding, GPU upload, shader compilation, ground render or AO in Node. Cold WASM initialization is excluded. Byte counts deterministic, decimal B; gzip9 is Node zlib level9, Brotli11 is quality11. Existing .gz is generally smaller Zopfli output, not equivalent to gzip9.

Early scratch failures were corrected before the reported final runs: unused accessors caused oversized unpruned re-encodes; glTF-Transform rejects color quantization below8bits (custom RGB-only pass used instead); exponential variants initially lacked POSITION min/max and fallback-buffer relayout; TS probe initially needed .mts, and its dual CJS/ESM Object3D prototype needed normalization so the real merge actually ran. Raw measurements retained in final JSONs, not those failed attempts. Source preprocessing probe emits a Node require(three) deprecation warning; it is not a browser warning.

## 2. Measurements

### 2.1 Whole-runtime inventory

89 GLBs: **7,526,964 raw B / 3,813,226 committed gzip B**, 872,834 unique POSITION-accessor vertices, 406,808 source triangles. Every file uses/requires **EXT_meshopt_compression + KHR_mesh_quantization**. Every file has **zero embedded/external textures and zero glTF animations**: texture format/resolution/bytes are N/A/0 throughout; no KHR_texture_basisu. No file uses EXT_mesh_gpu_instancing. Geometry has no tangent attributes. Morph/rig logic is runtime/custom-node driven, not glTF animation clips. Material counts and attributes are in the exhaustive appendix.

| Group | Files | Raw B | Existing gz B | Vertices | Triangles |
|---|---:|---:|---:|---:|---:|
| Island | 1 | 4613120 | 2556686 | 648377 | 290834 |
| Lighthouse | 1 | 124216 | 45909 | 16033 | 8179 |
| Kit full hulls | 22 | 872408 | 382965 | 36416 | 19990 |
| Kit LOD hulls | 22 | 164848 | 79674 | 6370 | 3262 |
| Kit eager props | 5 | 70188 | 47086 | 5288 | 2710 |
| Kit lazy wreck/cove pieces | 20 | 413076 | 261424 | 27321 | 13256 |
| Civic, including hull stages | 18 | 1269108 | 439482 | 133029 | 68577 |

Full census: `inventory.json`; each accessor's component type/normalization, index type, materials, nodes, extensions and decode medians are recorded there. `manifest.json` groups attribute signatures. Existing island/lighthouse already use OCTAHEDRAL normals; other87 assets currently use unfiltered i16 normalized normals (Blender civic/hulls/titans/wrecks exporters explicitly select meshopt medium).

### 2.2 Where island.glb's 4.61 MB goes

| Payload | Meshopt-coded B | % whole GLB | Logical decoded attribute B (without stride padding) |
|---|---:|---:|---:|
| POSITION i16 normalized vec3 | 2183137 | 47.32% | 3890262 |
| COLOR_0 u8 normalized vec4 | 1401526 | 30.38% | 2593508 |
| NORMAL i8 normalized vec3, OCTAHEDRAL | 696430 | 15.10% | 1945131 |
| Indices | 306371 | 6.64% | 3453786 |
| JSON | 25560 | 0.55% | — |
| Texture payload | 0 | 0% | 0 |

47 meshopt buffer views total4,587,464 coded B →13,827,818 stride-padded decoded B. JSON+container/alignment accounts for the remainder. Indices:854,391 u32 and18,111 u16. Four opaque chunk meshes alone:632,450vertices /284,797triangles (**97.9% triangles**). en38,819; es102,566; wn48,158; ws95,254 triangles. Shakkei3,966; all remaining windows/lamps/mast/gauge2,071. There are15meshes/primitives,28nodes,3materials. Trees/houses are already flattened; there is no hidden texture to KTX2-convert.

Vertex color is **not disposable decoration**: RGB includes baked AO; alpha is material-pattern ID/16 (`materials.ts:12-29,39-53`). Source exporter bakes per-corner AO before culling/meshopt (`hb_export.py:266-321`). Pattern8/14 foliage comprises45,024triangles (15.5% of island); this does not mean45k triangles can be removed. RGB also feeds evergreen inference for pattern8, so indiscriminate color quantization can alter seasonal appearance.

### 2.3 Island prototype results

| Variant | Raw B | gzip-9 B | Brotli-11 B | Decode ms (7 median) | Parse ms (5 median) | Vertices / triangles | Max positional error, world m | Visual class |
|---|---:|---:|---:|---:|---:|---|---|---|
| head | 4613120 | 2621041 | 2386501 | 34.37 | 49.87 | 648377 / 290834 | 0.000000 | none |
| q14-filter | 4613296 | 2618386 | 2383888 | 17.73 | 19.56 | 648377 / 290834 | 0.000038 | marginal candidate; no looks assertion |
| q13-filter | 4574896 | 2488727 | 2258864 | 10.94 | 30.93 | 648377 / 290834 | 0.197261 | visual-risk |
| q12-filter | 4468512 | 2380540 | 2155661 | 15.08 | 17.44 | 648377 / 290834 | 0.394494 | visual-risk |
| q14-quantize | 4896440 | 2755857 | 2510352 | 10.49 | 18.52 | 648377 / 290834 | 0.000038 | marginal candidate; larger |
| dedup-instance | 4613296 | 2618386 | 2383888 | 12.30 | 35.82 | 648377 / 290834 | 0.000000 | none topology; same re-encode caveat |
| simplify-opaque | 4533800 | 2644945 | 2410968 | 17.16 | 41.97 | 633759 / 284578 | not certified; estimator 0.007849 | visual-risk |
| core-opaque | 4575564 | 2604502 | 2374013 | 32.84 | 27.91 | 644348 / 288763 | N/A: geometry omitted | visual-risk until detail present |
| detail-deferred | 43136 | 14610 | 12579 | 0.10 | 2.67 | 4029 / 2071 | N/A: geometry omitted | visual-risk while absent |
| strip-emissive-normal | 4609512 | 2618102 | 2383586 | 15.45 | 35.05 | 648377 / 290834 | 0.000038 | visual-risk / tiny gain |
| exp18 | 5209824 | 2887402 | 2602202 | 18.09 | 21.15 | 648377 / 290834 | 0.008060 | visual-risk: material coordinate contract |
| exp14 | 4486792 | 2733071 | 2497386 | 19.46 | 22.09 | 648377 / 290834 | 0.154315 | visual-risk: material coordinate contract |
| oct6 | 4573824 | 2555901 | 2337398 | 9.65 | 12.54 | 648377 / 290834 | 0.000000 | visual-risk: normal angle |
| rgb6-alpha8 | 4614800 | 2356688 | 2116805 | 7.36 | 9.55 | 648377 / 290834 | 0.000000 | visual-risk: foliage classification |
| rgb6-safe | 4609280 | 2426299 | 2183639 | 26.22 | 45.77 | 648377 / 290834 | 0.000000 | visual-risk pending looks; marginal candidate |

**Interpretation, not stopwatch rankings:** latest same-script HEAD median34.37ms decode/49.87ms parse; initial independent inventory median20.36ms decode, range17.23–40.72ms; earlier HEAD run14.12ms decode/19.30ms parse. Workstation contention overwhelms codec-level timing differences. No claim that RGB quantization makes decode4× faster. Reliable result is byte size and unchanged/reduced element counts.

- q14 is effectively the current positional precision. The q16 trial before cleanup did not recover lost source precision; originals were unavailable. All re-encode gains are **relative to shipped quantized assets**, not unquantized Blender originals. Use originals for a final production encode, not repeated lossy passes.
- QUANTIZE (medium / gltfpack -c analogue) is larger than FILTER (high / -cc analogue) **after** gzip or Brotli for island. Existing high/OCTAHEDRAL is already correct here. QUATERNION filter has no applicable rotation-animation streams; static node JSON quaternions are not compressed buffer animation data. EXPONENTIAL positions18/14 were explicitly measured and both lose on wire bytes. They also leave POSITION float32 with a node quantization transform; `dequantizeForPatterns:872-891` currently early-returns for float positions, so simply swapping them breaks metre-space procedural patterns. Not a drop-in optimization.
- oct6 changes normals by up to**4.0677°**, for only785B smaller than committed island gzip (though49,103B better Brotli). A normal-angle change can alter facet jitter/snow/lighting without moving any geometry. Reject under a no/marginal requirement unless strong visual evidence reverses it.
- RGB6/alpha8 changes RGB by at most**2/255 =0.007843**, positions/normals/alpha unchanged; measured pattern ID changes0. Global pass saves199,998B vs committed gzip and269,696B vs current Brotli. Safer pass preserves **all window/emissive RGB and foliage patterns8/14**: saves130,387B vs committed gzip and202,862B vs current Brotli. The safe output's metadata predates the inconsequential fallback relayout of the exponential trial; its encoded bytes and element data are valid. Neither has been looked at on GPU; treat as a marginal candidate awaiting visual verification, not automatically admissible.
- Generic dedup+instance produces no instances and the same15meshes. Flattened sources cannot be rediscovered as repeated trees by ordinary glTF dedup. Unique baked AO/color further inhibits sharing.
- Conservative simplifier: weld, per-opaque target75%, relative error1e-5, LockBorder. It only removes**6,256triangles (2.15%) /14,618vertices**, and **increases** gzip23,904B against comparable q14. Meshoptimizer's returned world-scaled error estimator0.007849m is **not a certified maximum Hausdorff error**, and AO/pattern/normal seams are not verified. Do not call it max error or scene-safe.
- Core split keeps four opaque chunks+shakkei (5meshes). Deferred windows/lamps/named detail is2,071triangles/4,029vertices,14,610gzip9B. Relative to same-encoder q14, first-frame savings only13,884B; total split gzip grows726B. Most detail remains embedded in opaque chunks; an actually useful terrain/core/detail split requires a generator change and would risk visible pop-in/shadow/ground differences. Named storm/tide services must remain available.
- Removing emissive normals saves only284gzip9B versus comparable q14. The raw buffer savings are3,784B. The material port is custom; keep normals absent proven unused across weather/depth paths. No UV2/tangent bloat exists on island to strip.

### 2.4 Geometric error and supported pixel size

`camera-rig.ts:14,63-65` and `layout-system.ts:43-45` set the real minimumdistance90m; `src/harbour/data/layout.json` FOV25°, heart650m, overview1000m. At target depth, pixel size =2*d*tan(12.5°)/viewportHeight.

| Camera/depth | 600px high | 1000px high | 2160px high |
|---|---:|---:|---:|
| Minimum90m | 0.06651m/px | 0.03990m/px | 0.01848m/px |
| Heart650m | 0.48034 | 0.28821 | 0.13343 |
| Overview1000m | 0.73898 | 0.44339 | 0.20527 |

Thus q13's0.19726m global max is4.94px at90m/1000px; q12's0.39449m is9.89px; exp18's0.00806m is0.20px but costs bytes and violates current local-coordinate handling. q14 re-encode0.0000378m is0.00095px. These are **target-depth estimates**, not global screen-space guarantees: foreground surfaces can be closer than the rig target and shakkei cannot be panned under the camera. Arbitrary high-resolution viewports also increase pixel sensitivity. Numeric subpixel position error says nothing about normal/color/snow equivalence. Geometry-changing candidates need closest zoom and both default views, day/night + winter/storm comparisons with identical data/time/config through approved real-GPU captures.

### 2.5 Kit/civic encoding and loading

| Re-encode all medium assets to meshopt high | Files | HEAD raw / gz B | New raw / gz9 / br11 B | Sum per-file decode medians ms |
|---|---:|---|---|---:|
| Kit | 69 | 1520520 /771149 | 1327616 /674170 /608188 | 3.756 |
| Civic | 18 | 1269108 /439482 | 1067916 /408072 /361907 | 2.929 |

**128,389B (10.6%) less gzip** than committed kit+civic, despite comparing ordinary gzip9 with usually stronger existing Zopfli. Brotli comparison against S8's current same-file Brotli totals:1,160,170 →970,095B =**190,075B (16.4%) saved**. Source triangles unchanged; benefits include i16→i8 OCTAHEDRAL normals, not fewer draws/triangles. Conservative **full-grid** positional quantization bounds using quantization-node world scale and signed14-bit grid: kit≤0.006648m, civic≤0.015892m (largest titan LOD/shipyard). These are conservative bounds, **not measured exact correspondence maxima after vertex reorder**. Bounds are≤0.17/0.40px at90m/1000px target depth,≤0.36/0.86px at2160px. Newly coarser normal shading remains the visual check; names/custom attributes/morph contracts must be retained. The test uses high with current defaults, not blanket prune(), which could strip custom sail/livery data.

Loading facts:
- `prefetch.ts:21-33`: island+lighthouse and both manifests begin immediately; island bytes settle before all civic kinds and kit full+LOD+props prefetch. This is **already shipped**.
- `hull-kit.ts:326-355`: eagerly awaits22full+22LOD+5props =**49GLBs**,509,725 committed gzipB; full+LOD per hull load concurrently, all hull tasks concurrently. It bakes each to custom fleet attributes before returning.
- `civic-system.ts:134-146`:17layout plots await17GLBs,396,269gzipB. The18th kind, hull-stages43,213gzipB, is still prefetched even though async buildYard does not block civic init (211-225). Its async work may overlap first render; comment “behind first frame” is not a strict after-first-frame scheduling guard.
- Static compulsory first-frame geometry count is **68GLBs** (island+lighthouse+49kit+17civic),3,508,589committed gzipB. Prefetch launches **69** because it includes hull-stages. Up to20additional wreck/cove files261,424gzipB are lazy/nonblocking, selected through `loadWreckKit(ids)` at `hull-kit.ts:369-384`, called by `fleet-system.ts:486-491`; their requests can start during early updates. Do not label all89files mandatory before first frame or assume exactly89network requests at a particular instant.
- Per-boat LOD already exists: full22variant triangle range434–1,662, LOD107–218. Hysteresis high34px out/40px in; medium50/58; low78/90 (`fleet-system.ts:62-66,755-759`); selected boats force full. Both geometries already live in one BatchedMesh. Removing LODs saves79,674gzipB but raises steady-state cost; not recommended. Blanket low-detail first frame visibly substitutes geometry; not recommended. Demand-based load needs exact visible+selected geometry planning and enough batch capacity, not assuming every boat can initially use LOD.
- Kit `_PAINT`, `_BRAND`, sail TEXCOORD_0/1 are consumed (`hull-kit.ts:115-122,195-225`); UV1/UV2 is not generic unused lightmap bloat. Normals drive lighting/patterns. Civic-office UV0 is separate crest/panel identity territory; do not strip generically.

### 2.6 Lossless packing, metadata and transport

Container probes concatenate intact GLBs for a **compression lower-bound design**, not a production container implementation. A real pack needs a tiny offset/length directory, versioning and range/error/cache policy; directory bytes excluded. Packing keeps each GLB parser/node contract intact. HTTP2/3 multiplexing means69requests are **not69serial RTTs**; do not invent a request-count→seconds conversion.

| Group | Requests before pack | Current individual gz B | Single gzip9 B | Single br11 B |
|---|---:|---:|---:|---:|
| Eager kit (full+LOD+props) |49|509725|495357|335362|
| LODs alone |22|79674|50767|41739|
| Civic all kinds |18|439482|475423|358175|
| Civic initial17plots |17|396269|429684|318432|

Kit packing alone saves only14,368B with gzip, but kit Brotli pack saves174,363B versus today's gzip. Civic gzip packing **regresses**35,941B across all18kinds; use Brotli or do not pack. Prefer **49eager-kit +17initial-civic** entries in two packs, leaving hull-stages and20cove files independently deferred. This turns66GLB requests into2;335,362+318,432=653,794BrotliB versus905,994currentgzipB saves**252,200B**. Exact eager-group extraction from S8's per-file Brotli results:486,164B kit +380,052B initialcivic =866,216B; packing saves**212,422B (24.5%)** versus individual current Brotli. Directory overhead excluded. Do not add this to codec-high gains: filter/packing/transport changes interact.

Manifest:94,393rawB kit JSON →57,332minified →34,507with nodes reduced to runtime name/origin/stay_axis. gzip9:8,879→8,073→6,463B; Brotli:6,722→6,381→5,281B. Small over compressed transport (**2,416gzipB** max measured reduction); do not prioritize “94KB manifest saving” as if all94KB are wire bytes. Node parent/material/empty metadata has no consumer in the investigated runtime hull bake, but full caller+contract checks are required before generator contract cleanup. Original/full authoring manifest can remain a separate tooling artifact, not duplicate runtime aliases. Reuse parsed manifest between prefetch+loadKit+shipyard to avoid repeat response/JSON work; bytes may already be cache reused.

S8EdgeDelivery's independent `outputs/need-for-speed/edge/compression.json`: current island Brotli2,386,501B saves170,185B (**6.66%**) vs committed gzip; all89GLBs Brotli saves222,270B (**5.83%**). **Correction to brief:** S8 observed live .glb.gz has no Content-Encoding, and `public/_headers` indeed has no encoding rule. Current manual gzip branch is therefore active, not necessarily browser HTTP decoding. Do not deploy .br and call DecompressionStream('br'); runtime only handles gzip magic. Correct Content-Encoding negotiation/mapping must be owned with the edge-delivery plan. Proper gzip Content-Encoding can offload manual Blob/stream/Response inflation; no isolated inflation timing was measured here. Long-lived content-addressed caching likewise belongs to S8, not an additional independently additive GLB win.

### 2.7 Runtime preprocessing versus pure decode

The brief's117ms island timer is **not meshopt parse**: `island-system.ts:35-58` also material-ports, merges, renders1024²ground heightfield and generates512²AO. `materials.ts:872-891` decodes/bakes position+normal (and UV), resets quantization transforms, computes bounds; **already preserves normalized COLOR_0 bytes**. `static-merge.ts:90-115,130-177` already supports normalized attribute decode+transform and typed-array preservation.

Source-based Node bench,7contended runs, excluding shader/window-port/ground work:

| Asset | Parse median ms | dequant/bounds median ms | Merge median ms | Result |
|---|---:|---:|---:|---|
| HEAD |45.03|133.32|31.98|12island chunks→3meshes |
| Offline premerged |42.60|114.92|0.085|already3island meshes; no merge |

Not production latency predictions: timings badly exceed the117ms browser total because of contention/Node/GC. HEAD merge range13.00–46.26ms; it genuinely created3meshes each run. Offline premerge keeps shakkei/mast/gauge separate:6meshes total, same648,377vertices/290,834triangles. Raw4,507,780/gzip9 2,574,727/Brotli2,335,231B. Corresponding concatenated opaque vertices shift by at most0.058124m; windows0.030130; lamps0.048273 from requantizing a larger joined volume. That is1.46px worst opaque at90m/1000px; do not call the prototype pixel-identical. Prefer **fused runtime opaque dequant+merge** using existing decodeInto/mergeInto arithmetic: skip temporary per-chunk float POSITION/NORMAL arrays, decode directly to final merged storage, then apply procedural material contract in metre-space. Four opaque chunks alone avoid15,178,800B of transient float pos+normal allocations/copies. Preserve final rounding, normal normalization, bounds, names, material/shadow flags and window-connected-component preparation. [estimate]10–30ms desktop CPU saving, based on eliminating redundant copies/bounds work, not adding all table phase differences.

Generic exact pre-baked **full fleet attributes** was also measured, not assumed a free win:49files/48,074vertices/25,962triangles,6,309,244decodedB; lossless meshopt plus metadata1,453,010B →922,829gzip9 /751,335BrotliB. Current eager kit509,725committed gzipB. Bake CPU median36.50ms (26.42–76.01,7contended). This naive pre-bake trades +413,104gzipB for ~36ms CPU; reject as cold-load optimization. A future more compact typed attribute format would need its own real measurement, not assume this failed container is competitive.

## 3. Findings table

Expected transfer-time examples use [estimate]1.6Mbit/s effective link, ignoring parallel bottlenecks, RTT and CDN effects (200,000B/s). None are guaranteed end-to-end first-frame gains; rendering/shader critical path may dominate.

| ID | Opportunity | Evidence | Proposed change | Expected gain, method | Visual impact + verification | Effort | Risk | Dependencies/conflicts | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| GLB-01 | Lossless Brotli transport | exact current-asset compression; S8 live header result | Precompress+serve correctly encoded negotiated assets; retain correct MIME/cache/versioning | 170185B island;222270B allGLBs, [estimate]0.85/1.11s link transfer | none, byte-exact decompression; header/live-browser check | M | medium deployment/browser cache | S8 delivery owner; do not add independently to pack/codec gains | H bytes, M load gain |
| GLB-02 | High meshopt for kit+civic |87re-encodes, exporters use medium | Switch final authoring encode to high/OCT8, preserve custom semantics and names, Zopfli/Brotli afterward |128389gzipB /190075BrotliB versus respective individual baselines; [estimate]0.64s transfer, less normal memory | marginal candidate; visual-risk until day/night/winter closezoom compares, node contracts | S/M | normal/pattern shading; re-encode originals | interacts with packing; island/lighthouse already high | H bytes, M looks |
| GLB-03 | Eager-kit/civic scoped packs, not whole world | lossless concatenation table;49+17initial files | Two indexed containers, keep hull-stages+20cove files deferred; intactGLB entries, reuse existingloader |66→2GLBrequests;653794B br vs905994currentgz,252200B /[estimate]1.26s link;212422B versus samefiles individualbr; request scheduling gain unmeasured | none, byte-exact entries; validate node lookup and equivalent scene | M | cache granularity, parse scheduling, all-or-nothing fetch | depends Brotli delivery; do not gzip-pack civic; don't doublecount GLB-01/02; compatible GLB-07 | H bytes, M latency |
| GLB-04 | Fused opaque dequant+merge | materials872-891 then island49-50; staticmerge decoder; Node realmerge13–46ms | Decode normalized chunk attributes directly into final typed geometry, preserve port/shadows/bounds |15178800B transient avoided; [estimate]10–30msCPU from redundant copies/passes | none if exact arithmetic/attributes; compare geometry buffers plus GPU closezoom/winter | M | bounds/normal/material preparation contract | overlaps S12 scene merging only; not another drawcount reduction | M |
| GLB-05 | Semantics-aware RGB precision |safeRGB6 measured exactalpha+normal+position preservation | Quantize opaque nonfoliageRGB only to6bits; preserve alpha, foliage8/14, window/lamp fields |130387B vs committedgzip /202862B vs currentbr; [estimate]0.65–1.01s link; no triangle reduction | visual-risk pending side-by-side; marginal candidate maxRGB2/255 | S/M | bakedAO/darkcolor threshold visibility | originalauthoring pass preferred; combines with codec/transport nonadditively | H bytes, M/L looks |
| GLB-06 | Slim runtime kit manifest |94393→34507raw; inspected node fieldreads | Generate minified runtime schema, retain separate authoring contract if needed; share parsedmanifest |2416gzipB /1441brB measured; [estimate]12mslink; parse gain unmeasured | none if field consumers/contract preserved | S | missed caller/contractmetadata | coordinate generator/schema checks; no wholemanifest duplicated in preload consumers | H bytes, M safe schema |
| GLB-07 | Stop eagerly prefetching deferred hullstages |prefetch all18kinds; civic17plots+nonblockingyard | Prefetch only initial plotfiles; stagebytes when actualyardphase allowed |43213gzipB moved off competing firstview [estimate]216mslink, not totalsavings | none only if fetched by firstvisible yardstage; otherwise visual-risk/pop-in | S | concurrency vs yard readiness | boot/civic owners; existing defer does not strictly guard assetprefetch | H requestfact, M impact |
| GLB-08 | Source preserve repeated prop prototypes | currentdedup creates0instances; bakedAO/flattened chunks | Explore before world-space flattening; keep perinstance AO/pattern inputs, batch repeatedcanopies without draw explosion |currentpostencodegain0; [estimate]5–10%island geometry if70%of45024foliagetri repeated, not proven bytegain | visual-risk until bakedAO/localpattern/season/shadow preserved | L | scenery differences + extra draws | generator redesign and S12 instance/culling plans; not firstwave | L |

## 4. Recommended encoding pipeline changes

1. **First wave, exact transport/layout:** edge-owned correctly negotiated Brotli+content-addressed caching; keep current gzip path functional until the complete delivery cutover. Preserve island high codec and COLOR semantic alpha. Do not spend time adding KTX2 for absent GLB textures.
2. **Small encoding win:** pin the tested glTF-Transform/meshoptimizer versions in the authoring toolchain, not unversioned npx on deploy. Change civic/hull/titan/wreck exporters' explicit medium to high after contract+GPU comparison. Export from raw Blender source once; retain node names, custom attributes and any morph channels. Meshopt filter→gzip/Zopfli/Brotli is the correct order. Record raw/gzip/Brotli, counts, max position bounds and normal/color error for each generatedasset.
3. **Exact CPU win:** fused runtime opaque decode+merge; maintain existing COLOR byte preservation and existing draw-call count. Prefer this to the measured lossy joined-quantization prototype.
4. **Then transport packing:** compare2scoped packs against highcodec individualassets on cold/repeat realproduction headers. Include packdirectory in final budgets. Do not turn small lazy cove resources into compulsory firstframebytes. Native HTTP2 may already reduce request cost, so bytes and endpoint measurements decide.
5. **Only after looks gate:** safeRGB6; quantify AO/color difference under night/winter plus daylight closestzoom before calling its impact marginal. Do not coarsen position or normal precision globally for small gains.

Minimum follow-through checks for the implementing main agent: existing harbour node/contracts and targeted loader/merge tests; exact decoded attribute comparison for lossless candidates; same-data/time heart+overview+closestzoom images in day/night/winter/storm on approvedGPU; cold/warm waterfall and boot-stage timings at production-faithful origin/live; lowCPU/iGPU scenario. No lint/tests/builds were run for this research assignment.

## 5. Ruled out / not worth it

- Add meshopt, generic assetprefetch, runtime staticmerging, normalized-byte COLOR retention: **already shipped**.77a03538 garden quantization18-mantissa result is not evidence that harbour currentint14 positions are uncompressed or need the old gardenencoder.
- KTX2/Basis for these GLBs:zero textures, thereforezero byte/VRAMgain. Standalone atlas/SDF belongs S4.
- Global12/13bitpositions: up to0.3945/0.1973m shift, multiple minimumzoom pixels; not marginal on quantitative evidence.
- Oct6 normals:4.07° change for negligiblegzipgain; currentisland alreadyoct8.
- Exponential18/14positions or quaternionfilter: larger wire payload/currentmaterialcontract issue/no quaternionstream.
- Generic current-island dedup/EXTinstancing:zero duplicates/instances discovered. Must change preflattening generation, not add extension flags.
- Conservative allopaque simplification:only2.15%trianglereduction and worsegzip; cannot infer AO/appearance quality from an error estimator. Source already removes safely hidden backfaces and drowned faces (`hb_export.py:324-348`), so do not sell those culls as unshipped.
- Strip islandUV2/tangents:absent. Strip hullUV/custompaint/brand:named consumers, breaks scenery/dataidentity. Strip emissivenormals:284gzipB not worth anothermateriallayout.
- Simple opaquecore/detailGLBsplit:97.9%trianglesremaininopaque,only13.9KBfirstframegain; pop-in andnamedservicerisks.
- Remove existingboatLODs:79.7KBsaving trades for sustainedGPUcost. DefaultLOD-only substitute atboot violates no/marginalscenery unless allvisiblegeometry equivalence proven.
- Whole-world singlepack:changes lazy261KBcove behavior/cachegranularity, no evidence it wins over2scopedpacks.
- Exact prebaked fullfleet attributeformat:measured+413KBgzip for36.5mscontendedCPU; not a cold-load win in this format.
- Worker decoder as a blanket answer: runtime vendoreddecoder alreadyWASM/SIMD; islanddecode only part of117msinit and doesnotaddress first-render~1.9s. Worker startup/transfer/CSP trade needs separate targetedmeasurement; no ungrounded speedup claimed.

## 6. Open questions / operator decisions

No missing prerequisite blocks this report. Implementation decisions: accept small normal/color precision changes only after GPUlooks; decide cacheversioning/contentencoding strategy withS8; choose scopedpack cachegranularity; decide whether artpipeline is allowed to preserve sourceinstances with perinstanceAO. GPUvisual equivalence remains unmeasured because captureowners hadpriority; allvisual-risk rows explicitly require it. Unquantized current Blenderraw exports were not present in the permitted scratch/source locations, so a final loss/byte evaluation should regenerate from those authoring scripts rather than repeatedly requantize shippedassets.

## Appendix — exhaustive per-file inventory

All rows share EXT_meshopt_compression+KHR_mesh_quantization,0textures,0animations; n=normalized, i/u8/16/32 denote signed/unsigned component widths, f32=float32. Attribute signatures are the union across that file'sprimitives; not everyprimitive carries everylistedattribute. Allprimitives are TRIANGLES. Vertexcounts deduplicate shared POSITIONaccessors, not disjoint positions across facetedvertices. Table sizes are sourcegeometry, not shadow/repeatedpass runtime triangles.

| File (under public/harbour/) | Raw B | Existing gz B | Mesh/primitives | Vertices | Triangles | Nodes | Mats | Index | Attrs |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| civic/burn.glb | 62480 | 32770 | 4/4 | 5662 | 2708 | 9 | 2 | u16 | A |
| civic/chartroom.glb | 50656 | 21343 | 3/3 | 5275 | 2629 | 4 | 3 | u16 | A |
| civic/customs.glb | 77396 | 25177 | 3/3 | 9576 | 4914 | 5 | 3 | u16 | A |
| civic/harbour-office-arbitrum.glb | 50336 | 18373 | 5/5 | 4323 | 2127 | 7 | 5 | u16 | B |
| civic/harbour-office-base.glb | 62616 | 24887 | 5/5 | 6164 | 2956 | 7 | 5 | u16 | B |
| civic/harbour-office-bsc.glb | 47376 | 18761 | 5/5 | 4402 | 2168 | 7 | 5 | u16 | B |
| civic/harbour-office-ethereum.glb | 54868 | 18541 | 5/5 | 5136 | 2526 | 7 | 5 | u16 | B |
| civic/harbour-office-hyperliquid-l1.glb | 84548 | 25003 | 5/5 | 8886 | 4488 | 7 | 5 | u16 | B |
| civic/harbour-office-polygon.glb | 43160 | 15380 | 5/5 | 4089 | 2027 | 7 | 5 | u16 | B |
| civic/harbour-office-solana.glb | 36024 | 13497 | 5/5 | 2967 | 1427 | 7 | 5 | u16 | B |
| civic/harbour-office-tron.glb | 63672 | 21027 | 6/6 | 6421 | 3175 | 8 | 5 | u16 | B |
| civic/harbourmaster.glb | 49688 | 18766 | 3/3 | 5742 | 2892 | 4 | 3 | u16 | A |
| civic/hull-stages.glb | 87788 | 43213 | 4/4 | 8144 | 4112 | 5 | 1 | u16 | C |
| civic/keeperslog.glb | 29520 | 10848 | 3/3 | 2599 | 1305 | 5 | 3 | u16 | A |
| civic/mint.glb | 142956 | 46725 | 8/8 | 16096 | 8112 | 13 | 3 | u16 | A |
| civic/registry.glb | 44704 | 18065 | 3/3 | 4769 | 2395 | 5 | 3 | u16 | A |
| civic/shipyard.glb | 257296 | 56553 | 9/9 | 30464 | 17444 | 53 | 3 | u16 | A |
| civic/stormstation.glb | 24024 | 10553 | 3/3 | 2314 | 1172 | 4 | 3 | u16 | A |
| island.glb | 4613120 | 2556686 | 15/15 | 648377 | 290834 | 28 | 3 | u16+u32 | D |
| kit/dinghy.glb | 11792 | 7130 | 1/1 | 892 | 468 | 3 | 1 | u16 | E |
| kit/hull_eur_greek_boat.glb | 33260 | 13873 | 8/8 | 1204 | 664 | 14 | 3 | u16 | F |
| kit/hull_eur_greek_boat_lod.glb | 7244 | 3410 | 1/1 | 257 | 135 | 2 | 1 | u16 | C |
| kit/hull_eur_greek_large.glb | 39804 | 17975 | 8/8 | 1684 | 924 | 14 | 3 | u16 | F |
| kit/hull_eur_greek_large_lod.glb | 7256 | 3422 | 1/1 | 257 | 135 | 2 | 1 | u16 | C |
| kit/hull_eur_greek_medium.glb | 37696 | 16712 | 8/8 | 1516 | 840 | 14 | 3 | u16 | F |
| kit/hull_eur_greek_medium_lod.glb | 7236 | 3414 | 1/1 | 257 | 135 | 2 | 1 | u16 | C |
| kit/hull_eur_greek_small.glb | 32988 | 13563 | 8/8 | 1156 | 660 | 14 | 3 | u16 | F |
| kit/hull_eur_greek_small_lod.glb | 7228 | 3385 | 1/1 | 257 | 135 | 2 | 1 | u16 | C |
| kit/hull_fiat_hippos_boat.glb | 33264 | 14304 | 8/8 | 1206 | 660 | 14 | 3 | u16 | F |
| kit/hull_fiat_hippos_boat_lod.glb | 7616 | 3751 | 1/1 | 287 | 149 | 2 | 1 | u16 | C |
| kit/hull_fiat_hippos_medium.glb | 38112 | 17393 | 8/8 | 1600 | 884 | 14 | 3 | u16 | F |
| kit/hull_fiat_hippos_medium_lod.glb | 7592 | 3720 | 1/1 | 287 | 149 | 2 | 1 | u16 | C |
| kit/hull_fiat_hippos_small.glb | 34048 | 14728 | 8/8 | 1242 | 698 | 14 | 3 | u16 | F |
| kit/hull_fiat_hippos_small_lod.glb | 7624 | 3742 | 1/1 | 287 | 149 | 2 | 1 | u16 | C |
| kit/hull_gold_bireme_medium.glb | 40864 | 16164 | 9/9 | 1622 | 888 | 15 | 3 | u16 | F |
| kit/hull_gold_bireme_medium_lod.glb | 7584 | 3644 | 1/1 | 285 | 145 | 2 | 1 | u16 | C |
| kit/hull_gold_trireme_large.glb | 50712 | 21099 | 9/9 | 2414 | 1284 | 15 | 3 | u16 | F |
| kit/hull_gold_trireme_large_lod.glb | 7728 | 3740 | 1/1 | 293 | 149 | 2 | 1 | u16 | C |
| kit/hull_other_sprit_boat.glb | 33356 | 13201 | 9/9 | 1015 | 556 | 16 | 3 | u16 | F |
| kit/hull_other_sprit_boat_lod.glb | 6924 | 3158 | 1/1 | 243 | 121 | 2 | 1 | u16 | C |
| kit/hull_other_sprit_skiff.glb | 30732 | 11256 | 9/9 | 797 | 446 | 16 | 3 | u16 | F |
| kit/hull_other_sprit_skiff_lod.glb | 6600 | 2884 | 1/1 | 213 | 107 | 2 | 1 | u16 | C |
| kit/hull_other_sprit_small.glb | 34348 | 13895 | 9/9 | 1087 | 604 | 16 | 3 | u16 | F |
| kit/hull_other_sprit_small_lod.glb | 6912 | 3153 | 1/1 | 243 | 121 | 2 | 1 | u16 | C |
| kit/hull_usd_coaster_boat.glb | 33708 | 14481 | 8/8 | 1220 | 670 | 14 | 3 | u16 | F |
| kit/hull_usd_coaster_boat_lod.glb | 7244 | 3419 | 1/1 | 257 | 135 | 2 | 1 | u16 | C |
| kit/hull_usd_coaster_small.glb | 33484 | 14163 | 8/8 | 1172 | 666 | 14 | 3 | u16 | F |
| kit/hull_usd_coaster_small_lod.glb | 7256 | 3429 | 1/1 | 257 | 135 | 2 | 1 | u16 | C |
| kit/hull_usd_corbita_medium.glb | 38352 | 17436 | 8/8 | 1557 | 862 | 14 | 3 | u16 | F |
| kit/hull_usd_corbita_medium_lod.glb | 7080 | 3323 | 1/1 | 247 | 131 | 2 | 1 | u16 | C |
| kit/hull_usd_fisher_skiff.glb | 27704 | 10565 | 8/8 | 766 | 434 | 14 | 3 | u16 | F |
| kit/hull_usd_fisher_skiff_lod.glb | 6912 | 3133 | 1/1 | 227 | 121 | 2 | 1 | u16 | C |
| kit/hull_usd_grain_flagship.glb | 48508 | 21452 | 9/9 | 2189 | 1180 | 15 | 3 | u16 | F |
| kit/hull_usd_grain_flagship_lod.glb | 7600 | 3712 | 1/1 | 285 | 149 | 2 | 1 | u16 | C |
| kit/hull_usd_merchant_large.glb | 43784 | 19193 | 9/9 | 1733 | 952 | 15 | 3 | u16 | F |
| kit/hull_usd_merchant_large_lod.glb | 7204 | 3433 | 1/1 | 255 | 135 | 2 | 1 | u16 | C |
| kit/mooring_buoy.glb | 5396 | 2756 | 1/1 | 248 | 124 | 3 | 1 | u16 | A |
| kit/titan_usdc.glb | 52576 | 25678 | 9/9 | 2895 | 1570 | 15 | 3 | u16 | F |
| kit/titan_usdc_lod.glb | 8468 | 4508 | 1/1 | 414 | 204 | 2 | 1 | u16 | C |
| kit/titan_usde.glb | 51860 | 25769 | 9/9 | 2791 | 1524 | 15 | 3 | u16 | F |
| kit/titan_usde_lod.glb | 8680 | 4497 | 1/1 | 444 | 218 | 2 | 1 | u16 | C |
| kit/titan_usds.glb | 48852 | 23975 | 9/9 | 2487 | 1362 | 15 | 3 | u16 | F |
| kit/titan_usds_lod.glb | 8332 | 4379 | 1/1 | 394 | 194 | 2 | 1 | u16 | C |
| kit/titan_usdt.glb | 54396 | 26090 | 9/9 | 3063 | 1662 | 15 | 3 | u16 | F |
| kit/titan_usdt_lod.glb | 8528 | 4418 | 1/1 | 424 | 210 | 2 | 1 | u16 | C |
| kit/wreck_a.glb | 18340 | 13330 | 1/1 | 1400 | 728 | 2 | 1 | u16 | A |
| kit/wreck_b.glb | 17424 | 12656 | 1/1 | 1310 | 670 | 2 | 1 | u16 | A |
| kit/wreck_burned.glb | 31804 | 20942 | 3/3 | 2445 | 1151 | 6 | 2 | u16 | G |
| kit/wreck_c.glb | 17236 | 11214 | 1/1 | 1438 | 720 | 2 | 1 | u16 | A |
| kit/wreck_capsized.glb | 36272 | 24259 | 3/3 | 2623 | 1191 | 6 | 2 | u16 | G |
| kit/wreck_cove_anchor.glb | 7340 | 4827 | 1/1 | 370 | 180 | 2 | 1 | u16 | A |
| kit/wreck_cove_bell.glb | 11256 | 6526 | 2/2 | 629 | 311 | 3 | 1 | u16 | A |
| kit/wreck_cove_driftwood.glb | 8380 | 5859 | 1/1 | 463 | 235 | 2 | 1 | u16 | A |
| kit/wreck_cove_epitaph.glb | 7904 | 3616 | 2/2 | 335 | 157 | 5 | 2 | u16 | G |
| kit/wreck_cove_flotsam.glb | 11788 | 7321 | 1/1 | 740 | 384 | 2 | 1 | u16 | A |
| kit/wreck_cove_gull_perches.glb | 8432 | 5504 | 1/1 | 536 | 208 | 2 | 1 | u16 | A |
| kit/wreck_cove_lifeboat_station.glb | 14084 | 6555 | 3/3 | 818 | 410 | 6 | 3 | u16 | A |
| kit/wreck_cove_lobster_pots.glb | 15016 | 7944 | 1/1 | 1150 | 574 | 2 | 1 | u16 | A |
| kit/wreck_cove_pennants.glb | 12452 | 5679 | 4/4 | 529 | 257 | 5 | 1 | u16 | A |
| kit/wreck_cove_tidepool.glb | 9248 | 6262 | 1/1 | 676 | 300 | 2 | 1 | u16 | A |
| kit/wreck_cove_warden_hut.glb | 13772 | 6585 | 3/3 | 787 | 389 | 6 | 3 | u16 | A |
| kit/wreck_dinghy.glb | 18052 | 11109 | 3/3 | 989 | 481 | 6 | 2 | u16 | G |
| kit/wreck_great_hulk.glb | 62560 | 44152 | 4/4 | 4739 | 2404 | 7 | 2 | u16 | G |
| kit/wreck_mast_stump.glb | 24616 | 14609 | 4/4 | 1459 | 697 | 7 | 2 | u16 | G |
| kit/wreck_merchant_sunk.glb | 33068 | 21505 | 4/4 | 2159 | 1051 | 7 | 2 | u16 | G |
| kit/wreck_rib_cage.glb | 31120 | 20531 | 3/3 | 2239 | 1095 | 6 | 2 | u16 | G |
| kit/wreck_skiff.glb | 21780 | 14222 | 3/3 | 1302 | 628 | 6 | 2 | u16 | G |
| kit/wreck_stern_section.glb | 34132 | 23417 | 3/3 | 2333 | 1153 | 6 | 2 | u16 | G |
| lighthouse.glb | 124216 | 45909 | 6/6 | 16033 | 8179 | 13 | 4 | u16 | H |

- **A**: COLOR_0:u8n:VEC4, NORMAL:i16n:VEC3, POSITION:i16n:VEC3
- **B**: COLOR_0:u8n:VEC4, NORMAL:i16n:VEC3, POSITION:i16n:VEC3, TEXCOORD_0:u16n:VEC2
- **C**: COLOR_0:u8n:VEC4, NORMAL:i16n:VEC3, POSITION:i16n:VEC3, _BRAND:u16n:SCALAR, _PAINT:f32:SCALAR
- **D**: COLOR_0:u8n:VEC4, NORMAL:i8n:VEC3, POSITION:i16n:VEC3
- **E**: COLOR_0:u8n:VEC4, NORMAL:i16n:VEC3, POSITION:i16n:VEC3, _BRAND:u16n:SCALAR
- **F**: COLOR_0:u8n:VEC4, NORMAL:i16n:VEC3, POSITION:i16n:VEC3, TEXCOORD_0:u16n:VEC2, TEXCOORD_1:f32:VEC2, _BRAND:u16n:SCALAR, _PAINT:f32:SCALAR
- **G**: COLOR_0:u8n:VEC4, NORMAL:i16n:VEC3, POSITION:i16n:VEC3, TEXCOORD_0:f32:VEC2
- **H**: COLOR_0:u8n:VEC4, NORMAL:i8n:VEC3, POSITION:i16n:VEC3, TEXCOORD_0:u16n:VEC2
