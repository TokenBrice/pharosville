# LOAD — authoritative load baseline and critical path

## 1. Scope and method

Research only: no tracked application/configuration changes and no build, lint or test gates. Read AGENTS.md, research brief, ARCHITECTURE/RUNTIME_FACTS and the source loading boundaries. Production truth is https://pharosville.pharos.watch/ at 1600×1000 DPR1, persistent real-GPU Chrome via `npm run preview` only. RTX 5070 Ti standard profile; one AMD Raphael iGPU sample. **All timings are contended**, not isolated device benchmarks.

Reproduce cold matrix with `node outputs/need-for-speed/load/run-load.mjs`: four configs ×3, plus one iGPU cold. Config a=no throttle; b=cable20Mbps/20ms; c=fast4g9Mbps/40ms; d=fast4g plus4× main-thread CPU throttle. Every capture has `--cold --waterfall --log-requests --seconds3 --wait1800`; profile navigation→first frame+1800ms for a/c/d run1. Actual CLI spacing is `--seconds 3 --wait 1800`. Cold clears HTTP cache and origin storage, **not driver shader cache**. Do not infer first-ever GPU-driver compilation from these samples.

Warm is a real repeat navigation without --cold, with a seed visit and repeat inside the **same capture lock** (`run-warm.mjs` in isolated worktree). This avoids another agent clearing shared cache between visits. The measurement-only shot patch adds true network status from `Network.responseReceivedExtraInfo` and seed navigation; saved `spike.patch`. Stock shot exposes cached304s as status200. The initial queue-starved attempt had launcher timeouts; incomplete attempts are not samples.

The isolated measurement worktree and branch were removed after all6warm captures completed; only the patch remains. To reproduce warm tooling: create the documented nfs-load worktree, symlink its node_modules to the root, apply `outputs/need-for-speed/load/spike.patch` there, then invoke `node outputs/need-for-speed/load/run-warm.mjs` from the root. The runner's paths deliberately refer to the throwaway worktree, not modified main tooling.

Probes collect LCP/paint, long tasks, resource timing, stablecoins JSON completion (cold), first completed engine-frame observation, actual visible fleet count, and data-pv-live/poster-removal mutations. First-data-frame means fleet.stats.visible>0 after a completed render, observed on the next rAF; precision is approximately one frame, not a GPU presentation timestamp. Stock firstFrameNavMs is a poll of engine stats, **not crossfade completion**. No screenshots are taken before readiness, so screenshots do not cause startup readback timings.

Raw captures, PNGs, V8 profiles and derived JSON are under `outputs/need-for-speed/load/`. `summarize.mjs` generates `summary.json`; `report.mjs` generates this report. Wire sums count completed CDP responses including headers, not partially received in-flight bytes. Site counts exclude data URLs and a13,160-byte Chrome extension injection; stock total wire includes that extension. Site counts still include CDN analytics attempts. Worker-internal network not attached to the page CDP target is outside the byte accounting.

## 2. Measurements

All durations ms; bytes are decimal bytes. Entries are medians, n shown. **LCP is not synonymous with poster paint**: Chrome often selected arrival text (empty LCP URL), and c-cold-1 eventually selected later text at16132ms. Poster column is resource responseEnd (network-ready lower bound, not decoded/presented timestamp). Do not claim a14–16s poster paint from final LCP. Firstpaint slice supplies complementary presentation probes.

| Config | n | Final LCP | Poster responseEnd | First live frame | Boats visible | Crossfade start | Poster removed | Site wire B | Site requests |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| a-cold | 3 | 4,200 | 80 | 2,974 | 2,974 | 3,045 | 4,171 | 7,821,111 | 151 |
| a-repeat | 3 | 120 | 71 | 2,956 | 2,956 | 3,049 | 4,168 | 105,994 | 151 |
| b-cold | 3 | 4,700 | 391 | 3,462 | 3,463 | 3,593 | 4,711 | 7,828,606 | 151 |
| c-cold | 3 | 7,492 | 834 | 5,944 | 5,944 | 6,089 | 7,204 | 7,828,391 | 151 |
| c-repeat | 3 | 124 | 76 | 2,740 | 2,740 | 2,875 | 4,001 | 176,335 | 153 |
| d-cold | 3 | 11,320 | 838 | 9,973 | 9,973 | 10,215 | 11,372 | 7,828,033 | 151 |
| igpu-cold | 1 | 956 | 79 | 8,756 | 8,756 | 10,413 | — | 7,820,615 | 151 |

|Config|First-frame min–max ms|Individual samples|
|---|---:|---|
| a-cold | 2,654–12,650 | a-cold-1.json: 12,650ms; a-cold-2.json: 2,974ms; a-cold-3.json: 2,654ms |
| a-repeat | 2,575–12,013 | a-repeat-1.json: 12,013ms; a-repeat-2.json: 2,956ms; a-repeat-3.json: 2,575ms |
| b-cold | 3,177–11,299 | b-cold-1.json: 11,299ms; b-cold-2.json: 3,462ms; b-cold-3.json: 3,177ms |
| c-cold | 5,901–14,091 | c-cold-1.json: 14,091ms; c-cold-2.json: 5,901ms; c-cold-3.json: 5,944ms |
| c-repeat | 2,679–10,396 | c-repeat-1.json: 10,396ms; c-repeat-2.json: 2,740ms; c-repeat-3.json: 2,679ms |
| d-cold | 9,460–26,026 | d-cold-1.json: 26,026ms; d-cold-2.json: 9,460ms; d-cold-3.json: 9,973ms |
| igpu-cold | 8,756–8,756 | igpu-cold-1.json: 8,756ms |

**Nonstationary contention:** early unthrottled warm a-run1 was12013ms versus2575–2956ms later; fast4g cold run1 was14091ms versus5901ms run2. These are not uniform network effects. Profiling is additionally enabled on a/c/d run1 only. Medians satisfy the requested matrix but are not clean causal A/B comparisons; use the raw range and require a quiet repeat before adopting an ms gate. CPU profiles remain authoritative for what ran, not for uninstrumented duration.

### Repeat-visit revalidation

| Config | n | True304 count |304 encoded B|Sum of304 request durations ms|Total site wire B|
|---|---:|---:|---:|---:|---:|
| a-repeat | 3 | 10 | 12,199 | 208 | 105,994 |
| c-repeat | 3 | 11 | 13,394 | 536 | 176,335 |

Duration sums are request work, **not additive critical-path latency** (parallel requests overlap). Immediate warm visits reuse immutable bundles and60s-fresh image/GLB/font assets; manifests/JSON revalidate. In warm a-run1 the ten304s were civic manifest2, kit manifest3, crests JSON2, emblems/chart-lettering/webmanifest1 each. Browser304 headers can be reported with0 encodedDataLength for some h2 streams; recorded encoded bytes are the CDP counter, not a reconstructed packet capture. Long-repeat after60s is not the same config; EDGE independently measured conditional GET medians32.6–37.5ms for static assets.

The single iGPU capture's removal mark is absent because the eval snapshot occurred before its delayed fade completed; this is a missing presentation observation, not an assertion that the poster never disappeared. Its first-frame/data-frame8756ms is observed. No repeat iGPU median is claimed.

### Engine phase medians

Boot phase numbers are wall time around awaited work; another main-thread task can occupy an awaited phase, so **do not sum or attribute them as exclusive CPU**. FirstRender includes all first-update work plus composer rendering, whereas u:render isolates composer.

|Phase|a-cold|a-repeat|b-cold|c-cold|c-repeat|d-cold|igpu-cold|
|---|---:|---:|---:|---:|---:|---:|---:|
| data | 144 | 153 | 602 | 1,241 | 127 | 1,435 | 290 |
| ocean | 38 | 37 | 371 | 298 | 33 | 942 | 70 |
| island | 280 | 257 | 704 | 1,259 | 240 | 2,626 | 2,385 |
| lighthouse | 15 | 7 | 48 | 16 | 18 | 272 | 613 |
| civic | 132 | 121 | 272 | 888 | 136 | 384 | 145 |
| fleet | 640 | 248 | 143 | 139 | 483 | 764 | 275 |
| compile | 41 | 26 | 26 | 22 | 25 | 106 | 72 |
| u:data | 1,229 | 1,386 | 3 | 4 | 1,371 | 50 | 3 |
| u:ocean | 2 | 2 | 227 | 211 | 2 | 807 | 1 |
| u:fleet | 49 | 52 | 51 | 60 | 47 | 220 | 24 |
| u:render | 136 | 149 | 151 | 125 | 115 | 363 | 3,723 |
| firstRender | 1,430 | 1,627 | 469 | 429 | 1,557 | 1,577 | 3,956 |

## 3. Cold fast4g critical-path timeline (profiled run c-cold-1)

This is one concrete captured trace, not a synthetic median waterfall. Navigation→first live/data frame14091ms; crossfade14379ms; poster removed15585ms. Stablecoin payload parsed2664ms, **11427ms before first frame**: moving API fetch earlier cannot shorten this run's reveal.

### Representative unprofiled median run (c-cold-3) — use this for normal-load prioritization

|Stage|Observed navigation-relative time or lap|
|---|---|
|Harbour module / Engine constructed|module50→1533ms; constructed1578.5ms|
|Stablecoin request / JSON parsed|1604→2211ms; parsed2221.6ms|
|Sea SDF / island bytes|SDF51→2711ms; island51→4265ms|
|Core civic / fleet bytes finish|civic5289ms; fleet5425ms|
|Eager CPU work|longtask3184.5→3712.5ms (528ms), while island was still arriving|
|Late initialization|civic888ms wall; fleet139ms; scene compile22ms|
|First update + composer|firstRender429ms; data4ms, ocean211ms, fleet60ms, composer125ms|
|First live/data frame / crossfade / removal|5943.6 /6088.9 /7203.9ms|

**Median-run ranking differs from the early contended profile:** (1) island-through-kit download chain (island ends4265, all core kit bytes5425); (2) JS/entry~1.58s and sea-decode/data-init work before that chain completes; (3)429ms first update/render; (4)145ms settle and1115ms fade tail. The worker/eager path won in this sample (first update data4ms), whereas it lost in the profiled sample (2321ms). DATASIM documents this real adoption race; LOAD-01 is a tail-latency/reliability fix, not a guaranteed2.3s saving on the median. Its additional compact-seed opportunity can reduce immutable warm work without changing routes. Live median requests negotiated **h3**; earlier captures also include h2. No physical connection count was recorded.

### Profiled contention/tail trace and network priorities

| Resource | Start ms | End ms | Initial priority | Wire B |
|---|---:|---:|---|---:|
| `/` | 0 | 58 | VeryHigh | 2,372 |
| `/assets/index-BaZfqNfI.js` | 100 | 233 | High | 4,463 |
| `/assets/vendor-react-B4YsRbsa.js` | 100 | 735 | High | 69,308 |
| `/assets/harbour-app-BM8XrivB.js` | 100 | 1603 | High | 319,959 |
| `/assets/vendor-rendering-Biq6a3cs.js` | 107 | 1395 | High | 245,131 |
| `/assets/layout-zlZG-JrX.json` | 107 | 638 | High | 54,980 |
| `/harbour/sea-sdf.webp` | 107 | 2798 | High | 824,823 |
| `/harbour/island.glb.gz` | 107 | 4634 | Low | 2,558,559 |
| `/harbour/lighthouse.glb.gz` | 107 | 582 | High | 47,256 |
| `/harbour/civic/manifest.json` | 107 | 257 | High | 6,992 |
| `/harbour/kit/manifest.json` | 107 | 279 | High | 10,350 |
| `/api/stablecoins` | 1972 | 2587 | High | 159,690 |
| `/harbour/civic/manifest.json` | 7676 | 7731 | High | 1,223 |
| `/harbour/crests.json` | 8359 | 8429 | High | 1,704 |
| `/harbour/crests.webp` | 8360 | 8494 | Low | 51,940 |
| `/harbour/kit/manifest.json` | 8361 | 8429 | High | 1,225 |
| `/harbour/emblems.json` | 8361 | 8433 | High | 7,147 |
| `/harbour/kit/manifest.json` | 8426 | 8494 | High | 1,220 |
| `/harbour/emblems.avif` | 14196 | 16107 | High | 1,484,480 |
| `/harbour/crests.json` | 14451 | 14543 | High | 1,218 |

|Main-thread / reveal stage|Observed time / duration|Critical-path interpretation|
|---|---|---|
|Document→entry/react→lazy harbour+renderer availability|document0–58; scripts discovered100–107; React735; renderer1395; harbour1603; Engine constructed marker1865|Real JS dependency, but **not a serialized network chain**: HTML modulepreloads launch entry/React/harbour/renderer in parallel.|
|Layout / sea / island / manifests|layout638; SDF2798; island4634; manifests257–279|Layout/sea required; island Low priority preserves JS bandwidth.|
|API round|starts1972–1980; stablecoins2587/JSON2664|Overlaps sea/island; all7 healthy world endpoints, not late critical bandwidth.|
|Civic+fleet GLB fanout|island completion releases prefetch batch; manifests re-fetched again at7676/8361/8426|Intentional island→all-small-GLBs waterfall. Exact raw request rows are in JSON. Body prefetch is not parsing: consumers still parse/bake sequentially during init.|
|Eager data task|longtask5726.5–7524.5 (1798ms)|Blocks progress while lighthouse awaited; lighthouse bytes finished582ms, so its2058ms init wall is **not a2s download**. Attribution to eager plan install is [INFERENCE] pending DATASIM stack mapping.|
|Pre-first-frame late init|civic686ms; fleet1492ms; scene compile115ms|Required by current implementation; package parse/bake and texture construction happen here.|
|First update+render|longtask9995.3–13989.3; firstRender3936ms|u:data2321; ocean550; fleet339; composer520. This is CPU/driver startup, not missing API data.|
|First completed live/data frame|14091ms; observed visible fleet >0|First-frame probe matches stock poll here; screenshot later confirms boats.|
|Fleet settle→crossfade|14091→14379 (+288ms)|Source4 rAF settle iterations; heavy post-frame decoration makes this much longer than ideal~50ms.|
|Crossfade→poster removed|14379→15585 (+1206ms)|CSS1100ms fade plus scheduling/removal. Fleet logos fetch14196→16107, after first frame; not initial frame weight.|

Full captured boot laps: season=9, layout=93, data=1410, readings=96, weather=12, sky=27, ocean=1288, island=815, lighthouse=2058, civic=686, fleet=1492, lights=6, beam=12, compile=115, u:season=0, u:layout=0, u:data=2321, u:readings=8, u:weather=11, u:sky=13, u:ocean=550, u:island=1, u:lighthouse=1, u:civic=76, u:fleet=339, u:lights=37, u:beam=0, u:ui=0, u:render=520, firstRender=3936, life=489, identity=769.

### Main-thread profile evidence

V8 profiles a/c/d run1 and their `*-profile-summary.json` contain sampled self time. c-run1 includes ~596ms GC self time, ~1792ms idle and~2070ms (program); these sampling categories are not standalone renderer compile times. Minified frame names are preserved in raw profiles; do not map them to original functions without source-column/stack matching. Long-task boundaries above come from PerformanceObserver. KHR/driver behavior is covered by GPUINIT: renderer.compile on the default target does not warm all composer output-space variants; driver cache state changes subsequent runs.

## 4. Completed bytes/requests before first frame

c-run1: stock poll reports6,016,245B; grouping at observer mark14091.1ms sums6,028,531B (event-boundary difference12,286B). These are completed-response totals, not total transferred partial bodies.

The12,286B boundary difference is exactly walkways.json, requested by already-deferred Life **after the first draw but before the next observable rAF**. It is not pre-draw critical weight. Per-request classification is saved in `outputs/need-for-speed/load/before-first-frame.csv`. The other4request group is webmanifest714B, favicon1974B, emblem slot map7147B (required by Fleet.init), and this deferred walkways12286B. Browser metadata need not block a live frame, whereas emblem metadata does. Non-awaited decoration is not guaranteed invisible: delaying it must pass the marginal-transition visual check, not be mislabeled exact pixel equivalence.

|Class|Completed requests|Completed wire B|Classification|
|---|---:|---:|---|
| document and poster shell | 6 | 187,477 | See classification below |
| JS CSS layout workers | 6 | 701,928 | See classification below |
| sea SDF | 1 | 824,823 | See classification below |
| island | 1 | 2,558,559 | See classification below |
| lighthouse | 1 | 47,256 | See classification below |
| civic kit | 19 | 451,542 | See classification below |
| fleet kit | 52 | 586,411 | See classification below |
| analytics—not needed | 3 | 30,028 | Not a first-frame dependency |
| extension—not site | 1 | 13,160 | Not a first-frame dependency |
| other | 4 | 22,121 | See classification below |
| inline data | 2 | 0 | See classification below |
| world APIs | 7 | 309,893 | See classification below |
| crests—not awaited | 2 | 53,644 | Not a first-frame dependency |
| yard logos—not awaited | 29 | 241,689 | Not a first-frame dependency |

**Needed categories:** document/poster/fonts are needed for the arrival experience, not GPU pixels; JS/CSS/layout, SDF, island, lighthouse, core kit+civic and API bodies implement the correct live scene. All7 APIs contribute world meaning; dropping them is out of scope. The engine currently awaits full+LOD meshes for22 hulls and5props, so these are structural boot dependencies even when some are outside the initial frustum. Splitting first-view geometry needs GLB/ACTORS geometry auditing, not silently omitting boats or changing mappings.

**Definitely not awaited by first frame:**29 yard logos241689B + crest JSON/WebP53644B + analytics30028B = **325361B across34 requests**; plus extension13160B across1 request is environmental, not an app optimization. Logos/crests eventually decorate the scene, so rescheduling saves **0 total bytes** but can remove~0.289s of9Mbps wire occupancy [estimate:325361×8/9e6] during boot. Actual critical-path saving is0–289ms [estimate], not all325kB/throughput automatically: these requests occur late and overlap CPU work. External analytics alone is not scenery. The request-level raw list in c-cold-1-analysis.json/JSON permits precise scheduling checks. Other22121B/4 requests include browser shell metadata and emblem slot map; do not call the entire remainder unnecessary. Deferred emblem AVIF1484480B is **not before first frame**; neither is the later Wreck Cove kit.

## 5. Ranked bottlenecks and findings

Ranking is based on observed critical-path **components**, not a claim that all component time is removable. In c-run1: (1) first-update data2321ms plus separate1798ms longtask; (2) waiting for large world bytes through4634ms and then GLB fanout; (3) fleet init1492ms and other serial parse/bake; (4) first composer520ms / ocean first-update550ms; (5)288ms settle overhead +1206ms fade. Across configs use phase medians above; real data makes no-data4173's3.1s baseline inapplicable.

|ID|Opportunity|Evidence|Proposed change|Expected gain (quantified, estimation)|Visual impact|Effort|Risk|Dependencies/conflicts|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|LOAD-01|Remove duplicated/unseeded first-data plan work from the first rendered update|c:first u:data2321ms; local4180 and warm a1 u:data6113/6118ms; stable payload long ready; sim/system.ts:91–107 starts worker warming but first frame still pays work|Use DATASIM's source-verified seeding/plan fix so the exact same deterministic model and routes are ready before first update, rather than merely moving the same blocking task onto an earlier main-thread slot|[estimate]0.5–2.3s fast4g, potentially several seconds unthrottled under contention; ceiling2321ms measured c first-update plus any genuinely duplicated eager work, **not guaranteed additive1798ms**|None if poses/routes/freshness identical; compare boats and sim contract|M|Medium|DATASIM/BOOT ownership; must preserve all mappings and don't gate first world on every worker|H bottleneck, M saving|
|LOAD-02|Shrink the unchanged island/SDF and core geometry bytes|c island2558559B/SDF824823B; their preloads already exist; assets.ts:44–65 inflates/parses GLB|Apply GLB/media slice's validated packing/encoding while preserving geometry, data-channel SDF and appearance; do not add duplicate preloads|[estimate]Each saved1MiB is0.93s of9Mbps wire occupancy;25% of island+SDF is~0.75s occupancy; actual critical-path reduction0–0.75s given overlap|None for lossless; marginal only after equivalent-shot checks|M|Medium|GLB/MEDIA, no lossy SDF channels, keep island priority Low until evidence changes|H bytes,M time|
|LOAD-03|Stop boot-time nonessential image/analytics contention|c29logos+crests+analytics325361B/34requests; civic/system350+shipyard starts image loads without frame gate|Start decorative logo/crest requests after first frame or crossfade and coalesce updates; delay analytics until live/idle|[estimate]0–289ms fast4g initial-critical-path saving by wire-occupancy bound; **34requests/325kB rescheduled,0 total byte savings** before any re-encoding|Marginal timing only; compare crossfade/default shipyard board visibility; don't leave missing final scenery|S–M|Low–medium|MEDIA/ACTORS own atlas final-content timing|H traffic,M latency|
|LOAD-04|Warm the actual composer output-space shader variants, not duplicate default-target variants|c compile115ms then composer520ms; GPUINIT found srgb/srgb-linear duplicate keys and info-log synchronization|Use GPUINIT validated compile-target fix and earlier actual-target warmup; reduce redundant variants, overlap compiler with already-needed fetches where safe|[estimate]0–520ms c startup ceiling from measured composer interval; expected100–300ms if duplicate compile waits are removed, not the entire frame|None; exact same material output and target color space; compare supported GPUs|M|Medium|GPUINIT owns; GPU-driver cache means HTTP-cold is not shader-cold; don't promise1.9s from ghost baseline|M|
|LOAD-05|Share parsed manifests and cache versioned immutable harbour assets|Warm10 raw304s incl civic2/kit3/crests2; prefetch.ts:24–25 vs loaders; public/_headers only assets immutable|Reuse one per-engine manifest promise and adopt content versioning before long TTL for mutable harbour assets|[estimate]Remove3–4 duplicate JSON304 roundtrips and parses (~30–80ms each request; overlapping critical gain~30–150ms), plus long-repeat asset revalidation costs; near-zero body byte savings on immediate warm|None; version changes must invalidate exact assets|S–M|Medium stale-cache risk|EDGE/BOOT; do not immutable-cache unversioned mutable content; compatible with existing blocked gate|H counts,M critical gain|
|LOAD-06|Reduce synchronous height-field readback without changing data|ground.ts:39–85; island-system.ts:55; diagnostic4180 readPixels2337.8→2380ms once|Prefer single-channel R32F or validated baked exact field/async transfer at the same spatial precision; preserve upper-surface/depth semantics|Measured42.2ms blocking call in one contended diagnostic; [estimate]0–42ms startup saving, up to12MiB less readback/transient buffer forRGBA→R|None only if identical heights/precision; verify placement, AO, masks|M|Medium portability|PIPELINE owns; cannot simply deleteCPU heights|H source,M gain|
|LOAD-07|Shorten reveal tail only with explicit experience approval|c:first frame→fade start288ms, fade→remove1206ms; app4frames, poster1100ms|Keep data-first correctness, prevent deferred decoration from blocking settle; optionally shorten the CSS fade rather than changing scene art|[estimate]Up to~200ms settle scheduling improvement; shortening1100→500ms yields~600ms perceived-complete improvement, **0 first-frame/network gain**|Marginal transition change, requires side-by-side arrival review; no scenery change|S|Low|FIRSTPAINT/BOOT; don't re-propose shipped life/identity deferral|H bounds,M preference|

## 6. Seven404s and GPU ReadPixels warnings

The seven404s are **the seven API endpoints on the static-only dist origin**, not seven missing scene assets. Exact captured evidence: `outputs/need-for-speed/boot/dist4-2.json` waterfall shows /api/stablecoins, /chains, /stability-index?detail=true, /peg-summary, /stress-signals, /safety-grades, /mint-burn-flows all404 at1656–1753ms. A separate Node fetch later received SPA HTML200 for all seven on4173 (`dist-api-statuses.json`), so status behavior varies by request/preview handling, but neither response is API JSON. The live/4180 world has real data. Do not optimize a ghost/fog scene as the production baseline, and don't add client retries/fake data to paper over the missing local proxy.

ReadPixels source is a single explicit app WebGL readback: `world/ground.ts:75–76`, called once by `island-system.ts:55` while booting. It reads1024²RGBA floats (16MiB), copies R to CPU heights and retains the height texture for placement/AO/masking. Diagnostic4180 prototype wrapper recorded **one1024²readPixels at2337.8–2380.0ms,42.2ms**, with stack through renderer.readRenderTargetPixels→IslandSystem.init. No per-frame app readPixels call was found. That diagnostic emitted no GPU-stall warning; warnings are driver/cache-path dependent. The historical warning text alone is not a recurring steady-state stall counter. Screenshot readback is harness activity after the load/steady observation; it must not be charged to startup shader work. SDF getImageData uses willReadFrequently CPU canvas, not this WebGL readback.

## 7. Local production-faithful origin

**Ready and reusable: http://127.0.0.1:4180/** — named service `nfs-load-origin`. Start from repo root:

`node outputs/need-for-speed/load/server.mjs`

For a variant: `NFS_DIST=outputs/need-for-speed/<slug>/dist node outputs/need-for-speed/load/server.mjs` (use a free port/process lifecycle rather than restarting the shared service while peers capture). Script currently binds4180; stop only its own named service when intentionally replacing it. It serves existing shared dist without building/writing dist, bundles the real Pages Function in memory via esbuild, and discovers PHAROS_API_KEY server-side using existing local-api-env loader. It never prints the key. /api/stablecoins checked200/874800uncompressedB/313ms; local screenshot inspected and visibly contains the fleet.

Applies public/_headers security/CSP, /assets immutable and /logos,/chains day TTL; text is compressed br/gzip and static files have validators. **Not a CDN emulator:** HTTP1.1 rather than liveh2/h3, no Cloudflare caches.default, no edge latency, and script's fallback max-age60 for unspecified static assets differs from liveJSON's max-age0. Thus useful for CPU/scene/variant comparison, **not** authoritative cache/CDN timing. API proxy uses real upstream security/projectors. Raw diagnostic4180 firstFrame11174ms/engine10404ms is n1 contended, not a replacement matrix.

## 8. Ruled out / not worth it

- Moving stablecoin requests earlier does not shorten the observed c trace: data already11.4s ahead of live frame. Keep gate; no /api on blocked viewports.
- Existing HTML modulepreloads and first-frame fetch preloads, island-low priority, byte prefetch, life/identity deferral, deferred emblem image and Wreck Cove are shipped. Don't re-propose them as new work.
- Larger fleet emblem AVIF is not cold first-frame weight; it arrives after first frame. Optimize its decode/upload/settle separately, not by subtracting1.48MB from initial bytes.
- Removing stablecoin payload fields/endpoints to change world semantics, dropping boats, graphical fallbacks or renderer/WebGPU switch remain out of scope.
- A bare compileAsync call, arbitrary worker count increase, or hiding warnings does not establish a speedup. Profiles show data work and exact-target driver behavior matter.
- A shorter crossfade changes perceived completion only; never report it as a faster GPU first frame.

## 9. Open questions / caveats

No operator decision blocks a research conclusion. A shorter arrival transition is an experience preference, not a scenery optimization. Need quiet-machine reruns before performance budgets: shared-machine timing spread and persistent shader cache prevent device-independent conclusions. Final LCP can select post-poster UI, so use separate poster decode/presentation, first-live, boats-visible and removal metrics in implementation gates. Byte counters omit partial in-flight bodies; request-level timing alone cannot prove exact prioritization fairness/physical connection count. Browser profiles contain a13kBextension injection, explicitly excluded from site totals. Local origin's cache defaults must be aligned before using it for repeat-cache assertions. No application implementation was attempted in this planning stage.
