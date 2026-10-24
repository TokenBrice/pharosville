# Non-GLB runtime media and data — MEDIA

## 1. Scope and method

Research only; no tracked source/assets/configuration changed, no build/test/lint/formatter run, no worktree required. Scope: emblems, crests, sea data image, chart lettering, walkways/layout/prelaunch data, posters/fonts, logos/chains, social card. Read the brief, AGENTS.md, architecture/runtime facts, consumers and builders cited below. A delegated read-only ancillary investigation failed at model capacity; the investigation was completed directly.

Artifacts: `outputs/need-for-speed/media/`. Reproducible commands:

- `node outputs/need-for-speed/media/measure.mjs` — inventory, Sharp encodes and three decode-to-RGBA repetitions per format (Sharp concurrency 1, cache disabled).
- `node outputs/need-for-speed/media/diff.mjs` — premultiplied RGBA atlas comparisons at 16/32/64/128 px per cell; three native-size contact sheets; SDF channel errors after linear reconstruction.
- `node outputs/need-for-speed/media/data-measure.mjs` — JSON precision/size, logo inventory.
- `node outputs/need-for-speed/media/packing.mjs`; `node outputs/need-for-speed/media/decode-packed.mjs` — exact SDF planar/delta packing and numeric JSON packing experiments.
- `node outputs/need-for-speed/media/logos.mjs` — all 634 raster logos lossless-WebP and 128 px variants, decoded-pixel comparison.
- `node outputs/need-for-speed/media/capture.mjs` — **one completed** `npm run preview -- --igpu ... --seconds 3` capture at dev `:5173/?t=16`, 1600×1000@1, instrumenting bitmap/readback timings and inspecting existing engine state. An earlier standard-profile request was canceled before completion to give measurement owners the lock. No more captures queued after the capture-priority instruction.
- FontTools inspected all three WOFF2 cmap/glyph sets; Bun `JSON.parse` was timed three times per JSON (saved `json-parse-results.json`).

All timings below are **contended**: other agents shared the machine, and browser decode probes ran while the real world was rendering on the iGPU. Neither Sharp timings nor this dev/iGPU frame time are page-load speedup measurements. Each decoder table reports a median of 3; the one observed boot invocation is explicitly distinguished. Encoding file sizes, equality checks and error metrics are deterministic observations, not timing estimates. `[estimate]` labels unexercised gain predictions. MiB = 1,048,576 bytes. GPU figures are nominal RGBA8/R8 allocation arithmetic including a full mip chain, not measured driver allocation.

### Important corrections to starting assumptions

1. **The AVIF atlas is already deferred until the first frame** (`fleet-system.ts:629-634`); this is shipped behavior, not a new proposal. Its large *canvas/GPU allocation* is nevertheless first-frame work.
2. **Life and identity are already deferred** by `engine.ts:13-17,123-165`. Therefore lettering/walkways changes mostly help crossfade-time work, not engine first-frame latency. `?defer=0` differs.
3. **Logos are not panel/search-only.** `Shipyard.drawBoard` creates `new Image()` for each placed coin (`civic/shipyard.ts:324-382`); `buildYard` starts fire-and-forget during Civic init (`civic-system.ts:211-225`). The warm observed run requested 29 logo images **before** first live frame.
4. **Prelaunch JSON is not actually a lazy standalone payload.** `ui/yard.ts:12,133-136` statically imports it; that defeats the dynamic-import split at `civic-system.ts:221`. Coordinate any cutover with BUNDLE findings, retaining all analytical text on demand.
5. The crest image starts before first frame through Civic's movers (`civic-system.ts:365-373`) even though Identity later reuses the same AssetStore texture. Crest metadata is fetched separately by both systems.

## 2. Measurements

### Per-file inventory, loading, decode and residency

`public/harbour/` abbreviated `h/`; source JSON is not assumed to equal production JS wire bytes. GPU allocations do not include driver padding or browser DOM/compositor caches.

| File | Bytes on disk | When / consumer | Decode path / CPU ownership | Dimensions, GPU format / filtering; nominal VRAM | Needed at first live frame? |
|---|---:|---|---|---|---|
| h/emblems.json | 12,041 (5,585 gzip) | Fleet init awaits `EmblemAtlas.load`, parallel with hull kit | fetch + `response.json()` on main thread | 678 IDs → 620 unique logo slots; no own GPU allocation | Yes, existing slot assignment/placeholder construction |
| h/emblems.avif | 1,482,977 | First Fleet update schedules a later rAF; typically overlaps poster crossfade, not awaited by it | fetch Blob → async `createImageBitmap(premultiplyAlpha:none)` → **main-thread Canvas2D drawImage** → whole CanvasTexture reupload + mip generation | Source4096×2560, 128px cells,32 columns,20 logo rows. sRGB RGBA8, premultiplied; trilinear mips, anisotropy4 | **No image**; initial placeholder canvas **yes** |
| h/emblems.webp | 2,032,722 | Only after AVIF fails; never normally both | Same bitmap/canvas path | Same source pixels, same resulting VRAM | No |
| h/emblems.png | 7,256,824 | Build source only (`build-emblems.mjs:74-95`); **not** a runtime fallback | None in browser | No runtime allocation | No; deleting deployed copy is a deployment-size change, not navigation-byte saving |
| Emblem runtime canvas (not a file) | — | Constructor before first frame; grows for unknown-logo monograms | Main-thread canvas paint/copies (`emblems.ts:39-57,94-128`) | Initial4096×2688:42MiB canvas +56MiB mipmapped GPU. Observed4096×2944:46MiB canvas +61.33MiB GPU. Cap4096²:64MiB +85.33MiB GPU | Yes; important hidden cost despite deferred image |
| h/crests.json | 1,768 (462 gzip) | Civic fire-and-forget before frame; Identity fetches again after frame | Main-thread JSON parse | No own GPU allocation | Not awaited; Civic movers may use it immediately |
| h/crests.webp | 50,634 | Civic starts load during init; cached texture reused by deferred Identity | Three TextureLoader → HTMLImageElement/onload; browser-managed decode, **not** explicit ImageBitmap. Civic copies image to boards canvas | 2048×512, sRGB RGBA8; trilinear mips/aniso8 after Identity;5.33MiB GPU. Canvas-board copy shares Civic's existing board texture | Early request, not a hard init dependency; original texture mainly uploaded for Identity after frame |
| h/sea-sdf.webp | 823,078 | Data/sim and Ocean share one `loadSdfImage(ctx,url)` promise; first-frame dependency; HTML also preloads it | fetch → bitmap with **no color conversion/premultiply** → CPU OffscreenCanvas2D (`willReadFrequently:true`) → getImageData → main-thread row flip + coast extraction | 2048² RGB data on disk, expanded to **RGBA8** DataTexture, no color space; trilinear mips;21.33MiB GPU. Retained arrays16MiB RGBA +4MiB coast | Yes: sea appearance **and simulation coast clearance** |
| h/chart-lettering.png | 90,887 | Deferred Identity Promise.all | AssetStore TextureLoader/HTMLImageElement, browser decode; no CPU readback in this consumer | 1024×1120, **1-channel source but default RGBA8 GPU upload**; no color space, trilinear mips/aniso8;5.83MiB GPU | No by default; appears during/after crossfade |
| h/chart-lettering.json | 2,573 (714 gzip) | Deferred Identity | Main-thread JSON parse; SDF glyph metrics | No own GPU allocation | No |
| h/walkways.json | 35,300 (11,012 gzip) | Deferred Life init fetches; builds folk paths, perches, chimneys, flags | Main-thread JSON parse/graph construction | No texture; generated geometry is Life's responsibility | No by default |
| src/harbour/data/layout.json | 289,813 (55,330 gzip;40,791 Brotli) | `LayoutSystem.init` fetches emitted `?url` asset first; services read by every later system; build preloads URL | Main-thread JSON parse into objects/arrays | No direct texture/VRAM; drives scene and sim geometry | Yes; cannot simply defer the full document |
| src/harbour/data/prelaunch.json | 97,418 (27,357 gzip as source; compact26,820 gzip) | Statically included via UI yard module; Civic's dynamic import does not create independent lazy bytes | Production module parse/evaluation; source JSON benchmark is **not** production parse cost |43 coins; no direct texture. Yard creates hulls, canvas board logos | Current eager bundle yes; most narrative detail not needed to draw first scene |
| h/poster-1600.avif | 104,998 | HTML high-priority responsive image preload + picture; before world boot, removed after crossfade | Browser image decode (`img decoding=async`); compositor/DOM, not Three |1600×1000, ~6.10MiB RGBA decoded backing if4B/px; **no Three texture/mips** | Needed for initial visual/LCP, not live renderer |
| h/poster-1600.webp | 147,568 | Picture fallback only | Browser image decode |Same dimensions/backing | Fallback only |
| h/poster-960.avif | 47,368 | Responsive selection for small sizes; also welcome-page picture | Browser image decode |960×600, ~2.20MiB decoded backing; no Three texture | Initial poster at smaller effective image width |
| h/poster-960.webp | 66,116 | Responsive WebP fallback | Browser image decode |Same | Fallback only |
| fonts/eb-garamond-400-latin.woff2 | 23,820 | HTML preloaded; arrival and UI serif | Browser WOFF2 decode/shaping; no JS decode or Three texture | Already Latin subset:336glyphs/236 mapped characters; DOM glyph cache memory not measured | Arrival typography; `font-display:swap`, does not block fallback paint |
| fonts/eb-garamond-600-latin.woff2 | 25,348 | HTML preloaded; headings/wordmark | Same |336glyphs/236 mapped characters | Same |
| fonts/eb-garamond-400-italic-latin.woff2 | 25,388 | CSS-discovered; used in visible arrival promise/wordmark | Same |331glyphs/233 mapped characters | Used before live frame, but not blocking under swap |
| public/logos/* | **8,622,930**,704 files | DOM panel/search **and** eager Shipyard boards |634 rasters:576PNG/43JPEG/15WebP;70SVG. DOM images browser-decode; Shipyard uses HTMLImageElement then main-thread canvas draw into shared boards texture | Typical raster250² (~244KiB decoded RGBA each), varies. DOM medallions40px, image78%=31.2CSSpx; search22px→17.16CSSpx. Board source logo~65px within512×128 canvas slot. No separate Three texture per logo | **29 images were requested before first frame** in observed scene, not all704 |
| public/chains/* | 10,228,11SVG | Panel/search medallions; build-crests also reads source SVG at build time | Browser SVG rasterization for DOM images; no runtime per-file Three texture | Main crest default52px box, image64%=33.28CSSpx; smaller20px uses12.8px. Browser raster cache not measured | No requests in observed no-interaction run |
| og-card.png | 285,847 | OpenGraph/Twitter metadata only; fetched by crawlers/social clients, **not normal navigation** | Browser navigation does not decode it |1200×630 if a crawler decodes it; no world GPU allocation | No |

Sources: `fleet/emblems.ts:39-91,115-128`; `engine/assets.ts:68-74`; `identity/identity-system.ts:86-112`; `identity/lettering.ts:88-90,171-187`; `ocean/sdf-image.ts:18-33`; `ocean/ocean-system.ts:76-83,121-141,225-241`; `sim/system.ts:30-36`; `life/life-system.ts:59-98`; `layout/layout-system.ts:1,34-37`; `civic/shipyard.ts:324-382`; `ui/bits.tsx:17-23,151-156`; `ui/harbour-ui.css:159-164,280,360-364`; `index.html:14-16,25-33,38-41`; `public/arrival-shell.css:3-5`.

### Decode measurements: do not mix Node and browser columns

| Asset / variant | Bytes | Sharp decode median ms (n=3) | Browser createImageBitmap median ms (n=3) | Interpretation |
|---|---:|---:|---:|---|
| Existing emblems AVIF128 q70/effort6 |1,482,977|2,205.0|465.1|Observed actual boot bitmap decode1,552.8ms **n=1**, highly contended; native probes later differ |
| Existing emblems WebP128 q90 |2,032,722|720.1|543.4|Browser did **not** establish WebP as faster; do not switch based on Sharp alone |
| Emblems128 AVIF q60/effort4/444 |1,301,206|1,068.6|Not run|12.3% fewer bytes; same canvas/VRAM |
| Emblems128 AVIF q50/effort4/444 |1,008,685|604.5|Not run|32.0% fewer bytes; same canvas/VRAM |
| Emblems64 AVIF q70/effort4/444 |942,497|292.8|Not run|36.4% fewer bytes;75% fewer pixels |
| Emblems32 AVIF q70/effort4/444 |397,344|94.8|Not run|73.2% fewer bytes;93.75% fewer pixels, not approved visually |
| Emblems64 WebP q90/alpha100 |1,059,732|68.2|Not run|28.5% fewer bytes; lossy chroma noticeably worse than AVIF in error metrics |
| Existing sea2048 lossless WebP |823,078|234.8|78.1|Actual boot bitmap104.7ms, CPU getImageData15.6ms, each **n=1**; no GPU readback alleged |
| Sea2048 RGB PNG lossless |2,876,415|17.8|Not run|Faster native decoder but **+2.05MB** wire; not recommended |
| Sea1024 lossless WebP |308,862|14.4|Not run|Encoding lossless **after** spatial reduction; original field is not preserved |
| Sea512 lossless WebP |111,024|6.2|Not run|Same warning, greater structure error |
| Coast-only2048 PNG |313,851|19.9|Not run|Only R; cannot replace RGB field |
| Coast-only2048 WebP |183,618|Not run|Not run|Possible exact CPU coast sidecar; not a complete sea asset |
| Crests2048 lossless WebP |50,634|27.0|25.7|Bitmap probe is decoder proxy; real consumer uses HTMLImageElement |
| Crests1024 lossless WebP |35,172|3.4|Not run|75% fewer pixels;15,462B saved; zoomed flags/facades need visual verification |
| Lettering PNG |90,887|15.4|19.3|Scalar source; RGBA GPU upload is separate issue |
| Lettering lossless WebP |77,438|10.2|Not run|**Pixel-exact** decoded comparison;13,449B saved |
| Poster1600 AVIF |104,998|161.0|48.6|Native bitmap proxy, not measured LCP decode attribution |

Sharp timings include materializing raw RGBA buffers. Baseline variants were measured early in a serial encode/decode script while contention changed; speed ratios are not controlled A/B speedups. Browser probes use the same Blob for three explicit decodes, while world rendering continues. Data are in `variants.json`, `browser.json`; raw runs retained.

#### Independent upload evidence from the measurement owner

S7ShaderCompileUpload supplied three additional contended first-composer upload observations: emblem CanvasTexture4096×2688 **25 /137.2 /105.2ms (median105.2ms)**; Civic boardsCanvas2048² **16 /45.7 /39.7ms (median39.7ms)**; SDF Uint8RGBA2048² **6 /31.6 /13.6ms (median13.6ms)**. These are S7's GL upload-call measurements, not this slice's bitmap timings or isolated GPU execution durations. They strengthen the case that the first-frame placeholder atlas allocation/upload matters even though AVIF is deferred. Eliminating that upload must still preserve placeholder/monogram appearance; do not promise the whole105.2ms as recoverable wall time without a controlled variant. S7 found no meaningful mip submission cost (>0.1ms), so do not target mip removal on the basis of the large texture alone.

### How much of the emblem atlas is actually needed?

- **Before the first engine frame: zero source-image logos.** Brand-roundel placeholders/monograms are already the designed behavior. Atlas metadata and a large CanvasTexture exist before that frame.
- Source atlas has620 unique logo cells /678 aliases. The observed live model had623 boats,618 unique assigned slots;761 slot-map IDs after83 generated IDs were added. This means indiscriminately dropping most source cells because the model is supposedly small is not supported.
- Camera heart650m, FOV25°, viewport1000px tall; rig minimum90m. Observed254 boat spheres intersected the frustum,243 boat centers were on screen. These are **potential emblem-bearing vessel counts, not a fabricated count of nonzero decal fragments**. Furl, LOD, occlusion and flag derivative fade further reduce actual visible decals (`fleet-system.ts:748-781`, `fleet-material.ts:354-376`, `house-flags.ts:80-89`). The screenshot was inspected: many sails are tiny/LOD-colored; larger crest flags are conspicuous. Exact fragment visibility cannot be read from a scene node count.
- The probe derived emblem-plane cell diameter from actual baked positions/aEmbUV and the camera projection. This is an **orientation/furl-independent upper bound**, not a screenshot pixel measurement: on-screen Tether87.9px, Sky69.2px, Ethena60.8px, next major boats~45–55px for the *cell*, logo circle roughly0.84×that. At a90m target-distance placement, the largest cell bound is617.6px (Tether),605.4px (Circle). DPR multiplies required texture sampling resolution. Therefore **neither64 nor32px globally is scenery-safe across supported zoom/pan**.
- Mips are already generated and shader uses `textureGrad` for sail decals. Mip bias/selection cannot avoid downloading/decoding/uploading the base image. Mipmaps protect runtime aliasing; removing them is not an optimization to recommend.
- A small64px far-view atlas could be useful **only** with full-resolution hero cells or an upgrade before zoom exposes detail. Per-first-view subset streaming requires stable slots and a complete second-stage/panning path; it is not simply deleting offscreen logos.

### Atlas visual proxy results

Compared to the lossless PNG after resizing every cell to the stated screen-size proxy; premultiplied RGBA MAE in 0–255 units and PSNR. Includes all source cells and padding, so metrics are diagnostic, **not** operator visual approval.

| Variant |16px cell MAE / PSNR|32px cell MAE / PSNR|64px cell MAE / PSNR|128px PSNR|
|---|---|---|---|---:|
| Current AVIF128 q70|0.30 /52.42dB|0.41 /49.42dB|0.60 /45.84dB|41.95dB|
| AVIF128 q60|0.40 /50.44dB|0.56 /46.97dB|0.83 /43.14dB|38.91dB|
| AVIF128 q50|0.54 /48.13dB|0.78 /44.26dB|1.16 /40.26dB|36.15dB|
| AVIF64 q70|0.71 /46.12dB|1.14 /41.76dB|1.69 /37.81dB|22.87dB|
| AVIF32 q70|1.74 /38.84dB|2.51 /35.11dB|13.42 /19.46dB|20.14dB|
| WebP64 q90|1.01 /41.68dB|1.57 /36.80dB|2.15 /33.04dB|22.61dB|

Inspected `atlas-contact-cell32.png` and `atlas-contact-cell64.png`: q60/q50 preserve the sampled logos' identity well at32px;64px-source remains reasonably similar at32px but32px-source visibly blurs fine marks at64px. These are static media comparisons, **not an in-world variant approval**. Existing builder guard requires AVIF PSNR≥40dB at original resolution (`build-emblems.mjs:80-91`): q60/q50 variants **fail that current guard**. Do not silently weaken it; choose view-aware acceptance before selecting an encoder setting. Current q70/effort6/444 is deliberate, not an unoptimized default.

### Sea precision and downsampling

The asset is already **8-bit**, not16-bit. `sea-sdf.ts:3-8,27-29` encodes coast128m, depth40m, structure16m ranges. One LSB is~0.502m coast,0.157m depth,0.0627m structure. At2048 over1020m, spatial pitch~0.498m/texel;1024~0.996m;512~1.992m. All RGB channels matter (`ocean-material.ts:124-127`); alpha is constant255.

| Reconstructed field vs2048 reference |R coast MAE / max (LSB)|G depth MAE / max|B structure MAE / max|Coast sign changes (pixel-center diagnostic)|Result |
|---|---|---|---|---:|---|
|1024, linear-upsampled|0.230 /2|0.347 /10|0.738 /11|6,185 /4,194,304 =0.1475%|Max errors~1.00m coast,1.57m depth,0.69m structure; not zero-impact |
|512, linear-upsampled|0.216 /3|0.409 /12|0.870 /21|6,320 =0.1507%|Max~1.51m coast,1.88m depth,1.32m structure; rejects narrow foam/structure fidelity more strongly |

Near-coast R MAE within16LSB of shoreline:1024=0.487LSB;512=0.472LSB. These averages do **not** prove safety; CPU Ocean sampling is nearest-neighbor (`ocean-system.ts:225-241`), and sim consumes the same coast field (`sim/system.ts:30-36`). Reducing shared coast resolution can change hull clearance, not just sea appearance. A viable experiment preserves original CPU coast exactly, then tests lower-resolution **visual** depth/structure separately, with shoreline/foam crops and existing clearance scenarios. Never replace three data channels with a grayscale PNG or lossy BasisU texture.

Lossless alternative experiment: RGB planar+horizontal byte delta+gzip=813,092B versus823,078B current WebP (only9,986B/1.2% saved). Exact reconstruction/flip/coast extraction had **zero mismatches** against the original. Node synchronous inflate+reconstruct median104.4ms (3 runs; decode steps49.2+55.2,15.3+65.4,22.7+87.1ms); no browser implementation benchmark. Brotli planar-delta601,660B, but would need a compatible runtime/HTTP delivery design; loading HTTP-br decoded bytes already materializes12MiB. Not a free decode win. PNG RGB2,876,415B is worse on network. A data-path rewrite could avoid bitmap/canvas/ImageData temporary surfaces (tens of MiB), but current exact WebP is the safer shipping format until a worker/direct decoder proves its benefit.

### JSON structure, precision and binary experiments

| Source | Main structure / numeric count |Raw original→compact|Gzip original→compact→round2dp→round1dp|Brotli original|Parse proxy median n=3 |
|---|---|---:|---:|---:|---:|
|layout|8 piers101,212B;469 moorings104,416B; island22,745B; zones21,659B;180 lights14,238B;20,143 numbers,17,688 fractional|289,813→285,496|55,330→54,892→53,534→45,126|40,791|7.08ms(Bun, contended)|
|walkways|35 paths25,558B;139 spots7,253B;41 chimneys874B;6 benches;19 bunting;4,349 numbers|35,300→35,208|11,012→10,986→10,880→8,559|7,976|0.205ms(Bun)|
|prelaunch|43 coins86,747B compact content; largely text/metadata, only7 numbers|97,418→86,963|27,357→26,820→same→same|22,419|0.275ms(Bun source JSON, not production module)|

Numeric skeleton+float32 binary pack experiment: layout52,608gzipB vs55,330 original; max numeric change0.0000293 (mixed units); walkways11,749gzipB **larger** than11,012. Float64 lossless layout55,844gzipB also larger. These are simple prototypes, not an optimal custom schema; they demonstrate why a binary rewrite cannot be justified merely by289KB raw JSON. Integer-mm coordinate-only encoding could be smaller but needs field-aware schema: indiscriminate rounding also touches radians/widths. Rounding all fields to1dp changes headings by up to0.05rad (~2.86°), unacceptable as a no-impact claim. Two decimals save only1,796gzipB for layout,132B walkways.

First frame needs framing, ground/shore bounds, lights, civic plots, fleet/sim berths/moorings/lanes. Deferring the entire layout breaks existing initialization contracts; splitting it has substantial dependencies. Walkways is already deferred. Prelaunch narrative/source text can be separated from the small scenery projection **without deleting UI facts**; BUNDLE owns that opportunity. Metadata like export notes/capacity can be excluded from runtime generation only after caller audit, but is low-value compared with scene data.

### Logos and actual early weight

The inventory counts **file bytes**, not allocated disk blocks (hence8.62MB, not the initial9.6MB approximation).634 raster files total8,315,325B;70SVG add307,605B. Every lossless reencode was decoded and compared: **zero nontransparent-pixel/alpha mismatches across all634 rasters**; hidden RGB under alpha0 is immaterial.

| Set |Current bytes|Keep smaller original or lossless WebP|Keep smaller original or128px lossless WebP|When those bytes matter |
|---|---:|---:|---:|---|
|All634 raster logos|8,315,325|5,067,261 (**−3,248,064 /39.1%**)|3,206,584 (**−5,108,741 /61.4%**)|Across future panel/search/yard visits; **not one navigation's payload** |
|32 raster logos referenced by43-coin prelaunch book|332,175|215,372 (**−116,803**)|146,574 (**−185,601**)|Potential yard set;39 total logo URLs incl SVG |
|Actual observed29 eager image URLs incl SVG|211,536|131,905 (**−79,631 /37.6%**)|107,118 (**−104,418 /49.4%**)|Started5,541–5,730ms; all ended by5,927ms, before firstFrameNav13,576ms |

All observed requests were warm cache hits; **211,536B is a cold body-weight estimate from the exact requested local files**, not observed transfer. No user opened search/panel, so these29 requests independently disprove the panel-only assumption. Largest file example `/logos/302-hyusd.png`:134,434B→50,300B same-resolution lossless;128px19,196B. UI images are mostly17–31CSSpx, so128px is generous for usual DPR1–2; shipyard canvas paints source logo~65px, so128px is adequate for its intrinsic board raster. Higher-DPR/magnification and detailed thin marks still need verification for a downsize policy. Preserve vectors as vectors, preserve build-source logos for emblem creation, and choose smaller originals per file rather than blindly transcoding all SVG/JPEG/WebP.

### Poster and fonts

Responsive AVIF and high-priority preload are already present and correctly share srcset/sizes; do not recommend adding the same preload again. Desktop1600→960 would save57,630B but discard64% of source pixels; it is **visual-risk**, particularly with `object-fit:cover`, tall windows or high DPR. Current1600 AVIF is only105KB; prioritize bigger world assets before a destructive poster downsize. The responsive image affects first-paint scenery; the OG card does not. **S15FirstPaintPerceived's live-site observation found that the poster was NOT the reported LCP element**: FCP168ms, an initial DD candidate168ms, then an intro-background div candidate5500ms. Poster request started45ms, ended82ms,105,474wireB. Do not infer poster LCP attribution from its dimensions or preload. The firstpaint slice owns actual FCP/LCP/CLS and arrival scheduling; this report's bitmap48.6ms median is not a measured LCP improvement.

Fonts total74,556B and are already Latin WOFF2. `font-display:swap` is shipped. No `unicode-range` declarations, but adding ranges **without actually splitting/subsetting font files saves zero bytes**. Both normal preloads are used in initial arrival UI; italic also appears immediately but is CSS-discovered. Blindly removing these preloads trades queue pressure for FOUT rather than a proven free win. ASCII-only subsetting would risk accented names/currency punctuation; keep required glyph coverage, and test any true critical-shell subset plus full on-demand coverage with firstpaint. Do not treat DOM font files as world GL textures.

S15's corresponding font observations support **keeping current preloads**: normal fonts started44ms and ended75/76ms; italic95→119ms. Desktop CLS0.0001294 with all three local fonts; blocked-viewport medianCLS0. No throttled preload A/B established a gain from removal. Its inspected poster/live comparison matched broad geometry but showed golden-hour versus current-daylight and fleet-placement differences; the crossfade is not an invisible swap.

## 3. Findings / opportunities

Gain estimates are incremental alternatives, **not additive**. Wire-duration examples use9Mbps payload throughput only; scheduling/overlap means page-level gain may be zero. Dependencies on another slice mean one implementation owner, not duplicate work.

|ID|Opportunity|Evidence|Proposed change|Expected gain, estimation method|Visual impact / verification|Effort|Risk|Dependencies/conflicts|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|MEDIA-01|Losslessly modernize raster logos|634-file pixel equality; `logo-results.json`; Shipyard/UI consumers above|Generate smaller lossless WebP only where it wins; migrate runtime logo mapping/sync builders/cemetery/prelaunch references; retain original build sources|Measured−3,248,064B across raster library; observed eager set−79,631B; potential full yard−116,803B. `[estimate]` eager payload-time budget~71ms at9Mbps, actual first-frame gain0–71ms|**None**: zero visible decoded-pixel/alpha errors in prototype; preserve ICC/color policy and per-file smaller originals|M|Low/medium; mapping/sync drift, avoid changing emblem builder inputs accidentally|BUNDLE logo map; asset delivery/cache slice; no duplicate byte counting|H bytes/equality;M load gain|
|MEDIA-02|Stop eager yard logo fan-out competing with first frame|`civic-system.ts:211-225`; `shipyard.ts:324-382`;29 requests before first frame|Explicitly schedule board image fetches after engine first frame, preferably low priority and completed under poster crossfade; do not remove board identity|Measured211,536B exact eager body set moved off first-frame critical competition. `[estimate]`0–188ms bandwidth budget at9Mbps; also defers29 HTML image callbacks/canvas touches, not timed|**Marginal transient**, none steady-state; verify board crops before/after crossfade, slow network and first zoom to yard; avoid exposing incomplete boards|S/M|Medium: cold images may land after poster, must not gate essential fleet data|S11 actor boot owns yard scheduling; coordinate with firstpaint's crossfade|H eager behavior;M benefit|
|MEDIA-03|Use scalar GPU storage for chart lettering|Source1channel; `lettering.ts:88-90` reads `.r`; current default RGBA upload|Set proper R8/RedFormat upload through existing WebGL2 path, preserve identical byte values/mips/filtering; avoid conversion canvas if direct DOM-source R8 works|`[estimate]`5.83→1.46MiB GPU (**−4.38MiB**,75% upload storage), dimension arithmetic; no wire improvement and no measured frame-time gain|**None** mathematically for sampled R; verify WebGL2 DOM-source RED upload on both GPUs and identical label crops/no GL error|S/M|Medium until upload path exercised; sampler swizzle/driver format details|A1/S7 upload review; can combine withMEDIA-04|H channel use;M implementation|
|MEDIA-04|Lossless WebP chart atlas|`diff-results.json` pixel equality;90,887→77,438B|Builder emits losslessWebP and consumer requests it; preserve glyph JSON and scalar values|Measured−13,449B (**14.8%**) after-first-frame payload; `[estimate]`~12ms payload duration at9Mbps. Native decode15.4→10.2ms is not browser proof|**None**, exact decoded pixels; verify in-world label crops and glyph metadata unchanged|S|Low|MEDIA-03 optional; S11 identity already deferred|H bytes/equality;M decode|
|MEDIA-05|Reencode full-resolution AVIF more economically, only with view-aware acceptance|q60=1,301,206B; q50=1,008,685B; visual proxy table; current PSNR guard≥40dB|Test q60/effort4/444 first at unchanged128px cells; preserve current encoding until hero/max-zoom comparison passes; do not silently weaken guard|Measured potential−181,771B (q60) or−474,292B(q50); `[estimate]`162/422ms payload duration at9Mbps **after first frame**; no VRAM reduction. Browser decode gain unmeasured|**Visual-risk** at close zoom: both fail current full-res PSNR guard; compare hero/main/second-sail, flags,128+screenpx, DPR2, both faces/day/night|S for encode;M approval|Medium; atlas logos carry coin identity|S14 codec guidance; operator visual approval; alternatives toMEDIA-06/07|H bytes;L scenery approval|
|MEDIA-06|View-aware64px atlas, preserve hero/near detail|942,497B AVIF64;75% fewer pixels; geometric default cell boundsup to88px/min-zoom618px|Use far-view64px only with retained128px hero cells or a guaranteed full-detail upgrade before zoom. Do **not** globally replace atlas with64/32|Measured64-source−540,480B; `[estimate]`current23row canvas46→11.5MiB and GPU61.33→15.33MiB (**−46MiB GPU**) if every cell halves; mixed/high-res design saves less; decode pixels75% lower|**Visual-risk** until near/hero upgrade proven; native contact sheet only supports small-view proxy; test zoom/pan/DPR2 and logo-ready transitions|M/L|Medium/high: stable slots, async upgrade and extra total download if both atlases fetched|S11 atlas growth; MEDIA-05/07 alternative; no mapping/identity removal|H pixel/byte arithmetic;L global approval|
|MEDIA-07|Separate immutable logo atlas from dynamic monograms; assess KTX2|CurrentCanvasTexture merges static620logos+runtime monograms; observed46MiB canvas/61.33MiB GPU|Separate small monogram canvas from static texture; then prototype staticKTX2 with offline mips and supported compressed GPU formats, not canvas copy|`[estimate]`static4096×2560 RGBA8 mips53.33MiB→8bpp compressed13.33MiB (**−40MiB GPU**) plus~40MiB static canvas backing avoided. In observed83-monogram state, small monogram atlas~6MiB base/8MiB mips vs initial42/56MiB combined before logo arrival: potential~48MiB first-upload saving. Wire/transcode time **not measured**|**Visual-risk** for BasisU quality/alpha/mips; uncompressed static separation can be none with identical premultiplied sampling. Verify white roundel edges on dark/white cloth, both faces, far mips, realGPU support|L|High: static/dynamic UV ownership, monogram/failure behavior, compression support and loader tax|No toktx/basisu installed. InstalledKTX2 adds~245KB gzip WASM + wrapper; CSP blob-worker change required perS14. Coordinate S7/S11; not a drop-in AVIF replacement|M memory arithmetic;L priority without prototype|
|MEDIA-08|Constrain sea reduction to visual data, retain exact CPU coast|1024WebP308,862B; SDF errors/sign changes; sim sharescoast|Prototype full-resolution coast sidecar + lower-resolution depth/structure, or retain full-res source and only lower visual GPU texture. Never downsample simulation coast as incidental media work|Whole1024 prototype measured−514,216B (**62.5%**), GPU21.33→5.33MiB (**−16MiB**) and retained arrays20→5MiB (**−15MiB**); exact-coast split saves less and adds request/sample. ExactR-onlyWebP183,618B establishes sidecar budget; full split unmeasured|**Visual-risk**; max1024 errors~1m coast/1.57m depth/0.69m structure. Preserve exact sim coast; verify foam/shore/night crops and clearance scenarios, maxzoom, currents/weather|M/L|High if shared CPU field changed; medium if only visualG/B reduced|S9 sim clearance; S10 sea shaders; do not change data mapping or create a graphical fallback|H measured tradeoff;L marginal-visual approval|
|MEDIA-09|Reduce prelaunch eager module to scenery projection, lazy full facts|97,418B source; UI static import defeats dynamicCivic import;43coins|Eager exact fields needed to place/color/label stage hulls; lazy narrative/milestones/sources for panel/search, preserving every factual field|Upper bound sourcecompact26,820gzipB to split; `[estimate]`~15–23KB gzip off eager JS if narratives dominate; BUNDLE owns exact emitted calculation. Do not count entire27KB as removable|**None** if same43hulls/stages/logos/analytical UI; verify predata UI fallback and lazy detail resolution|M|Medium: fallback registry truth and asynchronous UI|BUNDLE implementation owner; S11 yard lifecycle|H eager path;M gain until exact projection|
|MEDIA-10|Keep JSON delivery compressed instead of binary-rewrite detour|layout55,330gzip/40,791br; walkways11,012/7,976; simplebinary barelywins/loses|Coordinate proper Brotli HTTP serving/cache for text emittedassets; preserve schema and full precision|Measured compression potential layout−14,539B andwalkways−3,036B vs gzip (not additive if CDN alreadyBrotli); compactingalone−438/26gzipB. `[estimate]`~15.6ms combinedpayload at9Mbps|**None**; byte-identical decompressed JSON|S if edge supports;M build pipeline|Low; ensure Content-Encoding negotiation/cacheVary correctness|EDGE owns headers/compression and live negotiation; do not double-count |H bytes;M actual deliverydelta|
|MEDIA-11|Reserve required monogram rows once, not repeated canvas growth|`emblems.ts:94-128`; observed23rows; S11 profilinggrow~79ms self/drawRoundel~33ms in a separate contendedrun|Calculate exact missing unique logo IDs before Fleet.install allocates slots; reserve required rows+spare once, keep slots stable|`[estimate]`avoid1–several full42+MiB canvas copies/dispose/reuploads per install; S11 measured attribution provides order-of-magnitude~79ms of grow work, not promised wall gain|**None**: identical pixels/UVslots; retain growth when new model IDs arrive; verify monogram aliases/grid|S/M|Low/medium: asynchronous modelinstall andcapacitycap|**S11 owns** this row; listed here for completeness, not duplicate implementation|H source;M timinggain|

Recommended order: MEDIA-01 + MEDIA-02 (real eager-logo bytes, safe/near-safe), MEDIA-03/04 (small exact scalar fix), MEDIA-11/S11 (allocation batching), MEDIA-09/BUNDLE (eager facts boundary). TreatMEDIA-05–08 as gated experiments, not scenery-safe approvals. The largest possible memory win is immutable/static atlas separation, but it is materially more invasive than image re-encoding.

## 4. Ruled out / not worth it

- Re-proposing deferred emblem image, Life or Identity loading: already shipped. Do not assign their entire byte/time budgets to first-frame savings.
- Assuming all8.62MB logos load at entry, or assuming zero logos load at entry: both false; exact observed early set29 URLs/211,536B source. No `/chains/` request observed without interaction.
- Global32px atlas: visibly poorer fine marks at64px and cannot support current zoom. Global64px is also unapproved because hero/default and minimum-zoom bounds exceed64px. Mip selection alone does not reduce base download/decode/residency.
- WebP atlas priority just because Sharp decodes faster: browser median did not confirm it and it costs+549,745B over AVIF. Browser threading differs; `createImageBitmap` is not proof of main-thread AVIF decode.
- Lowering AVIF encoder *effort alone* as a user-load speed claim: primarily changes build work/codec decisions, must measure final bytes/quality/browser decode; q60 experiments change both quality and effort.
- Dropping atlas mips/aniso blindly: risks sail/flag shimmer and angle quality; no measured bandwidth bottleneck justifies it. Existing sail `textureGrad` derivative path is intentional.
- Sea grayscale-only replacement or16→8-bit conversion: already8-bit RGB with three distinct meanings. SingleR is not a substitute for depth/structure. ETC1S/UASTC directly on shared sea data is numerically unsafe; GPU compression must not become sim clearance truth.
- Whole seaPNG substitution: +2,053,337B for a decoder proxy win, likely a loading regression on realistic links.
- Custom exact sea planar-delta gzip as an immediate ship: saves only9,986B and measured Node reconstruction still~104ms. It may save transient canvas surfaces but requires a browser/worker benchmark before replacing a simple, pixel-exact format. Brotli601,660B is promising only with proper delivery/decoder and memory measurements, not a free codec switch.
- Blind all-number JSON rounding: tiny2dp savings, radians affected,1dp headings visibly/geometrically wrong. Simple float32pack saved only2,722gzipB layout and increasedwalkways737B; protocol complexity not justified. Runtime/precomputed sim structures belong toS9, not an invented second format here.
- Deferring layout wholesale: framing/ocean/world/fleet/sim/lights need it before live scene; parse proxy is small relative to boot work and a split needs audited consumers.
- Shrinking crests2048→1024 globally just for15KB: large zoomed office/flag graphics and only5.33MiB currenttexture; source is already50KB lossless. Revisit only with actual GPU memory pressure/crop approval.
- Font `font-display:swap`, Latin subsets and poster preload as new work: already shipped. Merely adding `unicode-range` cannot shrink a file. Removing all font preloads is not automatically scenery-neutral at first paint.
- Global poster1600→960: saves57,630B but risks visible key-art blur; current105KBAVIF is already small. Add larger variants only for demonstrated sharpness need, not loading optimization. Never fetch bothAVIF andWebP fallback as preloads.
- Removing/reencoding socialOG card for world performance: normal navigation does not fetch it. Deleting deployed emblems.png similarly saves deployment footprint only; don't count it as page-load gain.

## 5. Open questions / evidence needed before implementation

1. **Operator visual decision:** full128-cell AVIF q60/q50 fail the existing40dB full-res guard despite good32px proxies. Is a view-aware criterion acceptable? Keep current atlas until max-zoom/DPR2 hero/flag comparisons pass. This is not an approval to weaken scenery.
2. **Measurement owner:** exact number of nonzero visible emblem fragments varies with sailfurl/LOD/flags/occlusion. Current measurement provides potential243on-screen centers/254frustum hulls and geometric size bounds, not a fake decal count. For a specialized first-view subset, measure visible slot use across heart/overview, settleddata/day/night and boundedpan/zoom before fixing subset membership.
3. **KTX2 prerequisite:** no installedtoktx/basisu/ktx executable and no standalonecompressed-atlas prototype in this slice. Memory estimates are solid; bytes, transcode cost, visual quality and platformtarget support remain unmeasured. The installedThree loader's blobWorker requires narrowly scopedCSP worker permission or a same-originworker; static/dynamicatlas separation must precede compressedtexture use. S14 has exact loader/CSP evidence.
4. **Sea reduction:** default1024 is **not approved**; exact CPUcoast must remain fixed and the visualsplit must pass shoreline/structure and clearance scenarios. No replacement of data mappings or rendererfallback proposed.
5. **Delivery owner:** does liveCF already serveBrotli/layout caching? UseEDGE evidence; compressionpotentials here are not automatically additive to its plan.
6. **Firstpaint owner:** compare fontpreload competition vs FOUT and poster actualLCP separately. This slice did not run a newposter encode or claim an LCPimprovement.

No blocker to the research deliverable. Unexercised browser variants and operator visual approvals are intentionally marked, not presented as completed optimizations.
