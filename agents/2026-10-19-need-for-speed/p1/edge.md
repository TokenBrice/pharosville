# EDGE — delivery, browser caching and the API proxy

## 1. Scope and method

Research only; no tracked application/configuration/docs changes, no build, no deployment, no browser launched, no shared server restart. Read the mandatory brief, `AGENTS.md`, onboarding, architecture, security-header and operations docs; inspected `public/_headers`, `functions/api/[[path]].ts`, `functions/api/_project.ts`, `functions/_shared.ts`, `functions/index.ts`, `functions/_log.ts`, `wrangler.toml`, `index.html`, `vite.config.ts`, `src/harbour/data/fetch.ts`, `src/lib/api.ts`, model/readings/truth, all direct raw-payload consumers in `ui/Panel.tsx`, civic chain movers, analytics scheduling and `engine/assets.ts`. A delegated read-only API scout failed before returning findings; field analysis below was completed directly.

Measurements, 2026-10-19 ~10:58–11:11 UTC, from this workstation to the live BEG Cloudflare point of presence. The machine/network are **shared/contended**, not a quiet controlled lab. No GPU/frame-time claims. Artifact root: `outputs/need-for-speed/edge/`.

Commands/methods:

- `curl -sI --compressed https://pharosville.pharos.watch/...` equivalent HEAD audits, both libcurl's supported-encoding offer (`deflate, gzip, br, zstd`) and explicit `Accept-Encoding: br, zstd, gzip`. Curl 8.22.0 has HTTP/2, HTTP/3, Brotli and zstd support.
- GETs with `curl -sS --compressed -H 'Accept-Encoding: br, zstd, gzip' -D <scratch>.headers -o <scratch>.body -w '%{json}' <URL>`; repeat with `identity` for decoded byte accounting. HEAD is insufficient for API: all seven allowlisted endpoints correctly return **405 to HEAD**, so API cache/encoding information is from **200 GETs**.
- Five live GETs per API path, fresh curl processes; report median TTFB. Static transfer byte counts are single exact samples, not timing benchmarks. Conditional GETs on five static assets repeated three times, and matching-validator tests on two API endpoints repeated three times.
- Additional single-algorithm offers (`br`, `zstd`, `gzip`) for JS, JSON, raw GLB and stablecoins. Local dev proxy GETs five times each for stablecoins/chains to characterize an upstream-containing path; it has no `caches.default` emulation.
- `node outputs/need-for-speed/edge/compress.mjs`: exact offline Brotli quality 11 and Zstandard level 19 sizes, **all 89 GLBs** (island, lighthouse, 69 kit, 18 civic), compared with committed gzip siblings. Encoding speed was not benchmarked; measured sizes are deterministic and unaffected by CPU contention.
- Offline conservative API projection into scratch JSON, then `node outputs/need-for-speed/edge/api-compress.mjs`: equal-codec Brotli-q11 comparison. Proposed endpoint projection is not deployed; projected live-wire gains below are explicitly estimates, not live responses.

Primary evidence: `live-audit.json` (full headers, full ETags, statuses, transfer sizes and curl timings), `api-head-default.json`, `api-equal-validator.json`, `local-upstream-proxy.json`, `compression.json`, `projection.json`, `projection-compressed.json`, and individual `.headers`/`.body` files. One civic-manifest HEAD had transient DNS resolution failure and was retried successfully (`retry_failure_0.json`). An initially chosen nonexistent logo URL returned the Pages SPA HTML fallback; it is excluded from asset results, replaced with repository-discovered real logo filenames.

## 2. Measurements

### 2.1 Live static header/transfer table

All rows below are 200 GETs. Matching HEAD audits also returned 200. `raw` means decoded HTTP body bytes (for `.glb.gz`, this is still the gzip file, **not** the inflated GLB). TTFB is one contended curl sample except the stated repeat medians. ETag values are abbreviated to their first 12 hex characters here; **complete exact values are recorded** in `live-audit.json` and per-request `.headers` files.

Cache-control shorthand: `I` = `public, max-age=31536000, immutable`; `R0` = `public, max-age=0, must-revalidate`; `R60` = `public, max-age=60, must-revalidate`; `D1` = `public, max-age=86400`. `—` means header absent. Every audited live response advertised `alt-svc: h3=":443"; ma=86400`; every measured connection used **HTTP/2**. **Age and Server-Timing were absent** across these responses. HTTP/3 advertisement is evidence of availability, not a measured HTTP/3 speedup.

| Live path | CC | ETag prefix | Content-Encoding | CF-Cache-Status | Raw B | Wire B | TTFB ms |
|---|---|---|---|---|---:|---:|---:|
| `/` | R0 | — | br | DYNAMIC | 7,427 | 2,010 | 63.9 |
| `/assets/index-BaZfqNfI.js` | I | W/b8459c588d91 | br | MISS | 10,684 | 4,129 | 68.8 |
| `/assets/vendor-react-B4YsRbsa.js` | I | W/de0e6a8489fc | br | MISS | 219,335 | 68,387 | 96.5 |
| `/assets/harbour-app-BM8XrivB.js` | I | W/341660b0c3cd | br | MISS | 930,166 | 318,914 | 76.1 |
| `/assets/vendor-rendering-Biq6a3cs.js` | I | W/cc5b37809f39 | br | MISS | 859,952 | 244,523 | 79.0 |
| `/assets/layout-zlZG-JrX.json` | I | W/d196b15e23b7 | br | DYNAMIC | 289,813 | 54,561 | 76.6 |
| `/harbour/island.glb.gz` | R60 | fad7e819a7d3 | — | REVALIDATED | 2,556,686 | 2,556,686 | 47.3 |
| `/harbour/island.glb` | R0 | f66228e674c4 | — | DYNAMIC | 4,613,120 | 4,613,120 | 681.7 |
| `/harbour/lighthouse.glb.gz` | R60 | 53748ea65b21 | — | REVALIDATED | 45,909 | 45,909 | 45.2 |
| `/harbour/sea-sdf.webp` | R60 | 6abc3e6efc6e | — | REVALIDATED | 823,078 | 823,078 | 75.4 |
| `/harbour/emblems.avif` | R60 | b65a0bbf00ed | — | REVALIDATED | 1,482,977 | 1,482,977 | 48.3 |
| `/harbour/kit/manifest.json` | R0 | W/d2b98d793062 | br | DYNAMIC | 94,393 | 9,072 | 66.4 |
| `/harbour/civic/manifest.json` | R0 | W/201870e95627 | br | DYNAMIC | 49,853 | 5,708 | 65.5 |
| `/harbour/walkways.json` | R0 | W/11375f417256 | br | DYNAMIC | 35,300 | 10,995 | 57.3 |
| `/harbour/poster-1600.avif` | R60 | ba0f0c51fe00 | — | REVALIDATED | 104,998 | 104,998 | 3,123.8* |
| `/fonts/eb-garamond-400-latin.woff2` | R60 | 507529019f1c | — | MISS | 23,820 | 23,820 | 188.3* |
| `/fonts/eb-garamond-600-latin.woff2` | R60 | 79f91b21caf8 | — | MISS | 25,348 | 25,348 | 104.0* |
| `/logos/xusd-babelfish.svg` | D1 | W/db2fd9ef2398 | br | MISS | 347 | 212 | 110.4 |
| `/logos/2-usdc.svg` | D1 | W/94302b5ddca0 | br | MISS | 2,924 | 1,210 | 109.6 |
| `/logos/yvusdc-yearn.png` | D1 | 50be6a0426ba | — | MISS | 26,517 | 26,517 | 124.1 |
| `/manifest.webmanifest` | R0 | W/d03cccd003ef | br | DYNAMIC | 636 | 326 | 59.1 |
| `/arrival-shell.css` | R60 | W/88558c73eeaa | br | REVALIDATED | 6,785 | 2,296 | 72.3 |

\* Do not optimize against the isolated poster/font outliers: three additional GETs yielded medians **43.5 ms poster, 42.1 ms regular font, 46.3 ms semibold font** (contended). Initial-versus-repeat timing alone cannot attribute the outlier to origin/cache/network/host contention.

**Corrections to the initial brief:** `_headers` indeed has no `/harbour/*` policy, but the deployed CDN supplies **60-second freshness** to gzip/image/font assets, not zero caching. JSON manifests are R0. Also, the deployed `.glb.gz` response has **no `Content-Encoding: gzip`**, on both GET and HEAD; its `Content-Type` is `application/gzip`. `engine/assets.ts:55–61` correctly sees gzip magic and explicitly inflates it. Do not accidentally double-compress these files or assume the browser already decoded them.

**Encoding negotiation:** JS and JSON already receive Brotli. A zstd-only offer received **identity**, not zstd, for tested JS/JSON/API/raw-GLB responses; zstd is not currently enabled on this live path. Gzip-only worked for JS/JSON/API. For the tiny index JS, live gzip (4,054 B) was actually slightly smaller than live br (4,129 B); kit manifest similarly 8,893 B gzip versus 9,072 B br. Stablecoins favored br (158,343 B in the later br-only sample) versus gzip (164,849 B). Do not treat a codec label as a guaranteed size win. Raw `model/gltf-binary` island received **4,613,120 B identity with br-only, gzip-only and zstd-only**. This confirms the need for deliberate GLB compression rather than simply switching runtime requests back to raw `.glb`.

### 2.2 Live API headers, bytes and TTFB (5 GETs each)

Every GET below: HTTP/2 200, `Content-Type: application/json`, `Content-Encoding: br`, `CF-Cache-Status: DYNAMIC`, no `Age`, no `Server-Timing`, HTTP/3 advertised. Every API HEAD with both encoding offers: 405 (by design, `[[path]].ts:195–198`). CC `A` = `public, max-age=60, s-maxage=300`; `A+S` additionally has `stale-while-revalidate=300`. Full ETags are in the artifacts; table prefixes identify the snapshot. Byte counts are first sample; market data changes over time.

| Endpoint | CC | ETag prefix | Raw B | Live br B | TTFB samples ms | Median ms |
|---|---|---|---:|---:|---|---:|
| `/api/stablecoins` | A+S | W/5306ffa09ddf | 874,800 | 158,401 | 228.3, 73.0, 61.5, 87.2, 78.9 | **78.9** |
| `/api/chains` | A+S | W/d1ed5ce410d9 | 163,770 | 29,443 | 175.2, 50.5, 59.9, 75.8, 54.9 | **59.9** |
| `/api/stability-index?detail=true` | A | W/ea2f382c61c8 | 503,256 | 43,315 | 245.2, 65.9, 64.4, 68.0, 71.9 | **68.0** |
| `/api/peg-summary` | A+S | W/6e2eca3a4760 | 422,936 | 29,099 | 78.2, 53.2, 76.5, 49.6, 48.7 | **53.2** |
| `/api/stress-signals` | A | W/cb974dc41a65 | 229,892 | 20,385 | 80.8, 54.1, 69.4, 52.1, 64.1 | **64.1** |
| `/api/safety-grades` | A | W/82e34f21fbfa | 17,861 | 2,373 | 82.7, 61.7, 48.1, 52.8, 58.9 | **58.9** |
| `/api/mint-burn-flows` | A | W/5f8e4acded39 | 170,483 | 18,488 | 59.6, 51.2, 41.4, 41.3, 59.9 | **51.2** |
| **Total** | | | **2,382,998** | **301,504** | | |

Important interpretation: `DYNAMIC` is the outer CDN status, **not proof that `caches.default` misses**. The Function already explicitly `match`es before upstream and asynchronously writes normal and 24-hour last-good copies (`[[path]].ts:220–253`, `_shared.ts:104–207`). It preserves the upstream cache policy, so the registry's 600/1800/etc freshness budget does not replace the live browser60/shared300 policy. The first samples of three APIs were slower, but without an edge-hit/upstream timing marker these cannot honestly be called upstream-miss latencies.

Five uncached-through-this-app local-dev-proxy samples: stablecoins **42.4 ms median** (81.2, 41.0, 42.9, 42.4, 40.2); chains **19.1 ms median** (19.8, 15.4, 16.7, 19.3, 19.1). This includes workstation→upstream network, upstream's own caches, full-body consumption/JSON handling, and dev-server work; it is **not** an isolated Cloudflare-edge→upstream measurement. No server secret was read into this measurement or printed.

### 2.3 API fields actually used, retained fraction and projection bytes

The candidate retains **all currently observable panel features**, not just the first frame. Retained fractions below are computed from the saved live JSON and the conservative scratch projection: byte fraction is serialized projected JSON / original response bytes; leaf fraction counts retained scalar/null values, not merely top-level field names. These fractions are a reproducible usage-based projection model, not an assertion every retained metadata field is actively rendered. `_meta` is retained intact wherever present; `X-Data-Age`, `Warning`, `Age`, cache/freshness behavior and error behavior must remain intact. No stablecoin rows or chains are removed; every payload coin still gets its boat.

| Endpoint | Fields required by world **and UI** | Raw→projected B | Retained bytes / leaves | Equal-codec br11 source→projected B |
|---|---|---:|---:|---:|
| stablecoins | `peggedAssets[].id,name,symbol,pegType,chains,circulating,circulatingPrevDay,circulatingPrevWeek,circulatingPrevMonth`; `chainCirculating.*.current` | 874,800→287,820 | **32.90% / 32.73%** | 123,426→49,945 |
| chains | rows `id,name,totalUsd,healthScore,change24hPct,change7dPct,change30dPct`; top-level **`globalChange7dPct`** | 163,770→20,598 | **12.58% / 12.98%** | 23,018→5,450 |
| stability | `current.score,band,avg24h,components.{severity,breadth,stressBreadth,trend}`; **last 30 finite-score `history[]` rows, `date,score`**, sorted as the panel does | 503,256→1,138 | **0.23% / 0.26%** | 31,629→289 |
| peg summary | `coins[].id,currentDeviationBps,activeDepeg,pegScore,pegReference.{valueUsd,source,contributorCount}` | 422,936→54,733 | **12.94% / 14.85%** | 21,288→4,473 |
| stress | all signal IDs, each `score,band` | 229,892→11,023 | **4.79% / 5.01%** | 14,985→2,262 |
| safety grades | all **already-projected** rows `id,grade` | 17,861→6,381 | **35.73% / 39.22%** | 1,991→1,500 |
| mint/burn | `hourly[].hourTs,netFlowUsd,mintVolumeUsd,burnVolumeUsd`; `scope.chainIds`; `coins[].stablecoinId,mintVolume24hUsd,burnVolume24hUsd,netFlow24hUsd,netFlow7dUsd,coverage.status` | 170,483→25,173 | **14.77% / 14.72%** | 14,928→4,118 |
| **Total** | | **2,382,998→406,866** | **17.07% bytes retained** | **231,265→68,037** |

Evidence: `model/build.ts:68–143`, `model/readings.ts:18–88`; **do not miss** `Panel.tsx:115–170` (supply history, peg reference, per-coin flows), `209–266` and `725–728` (PSI components and 30-day chart), `502–514` (chain changes), `readings/readings-system.ts:181–186` (global seven-day change drives tide), `civic/yard.ts:120–124` (chain movers). The live PSI payload has **3,201 historical rows**; UI uses only 30. Dropping all history or projecting only `model/types.ts` would break the panel.

**Measured offline:** 1,976,132 fewer decoded JSON bytes (82.93% reduction); equal-q11 compressed bytes reduce 163,228 B (70.58%). **[estimate] live wire after projection ~87,544 B versus observed 301,504 B, saving ~213,960 B**, estimated independently per endpoint by multiplying live br bytes by its measured q11 projected/source ratio. Cloudflare's compressor differs from q11; do not quote 68,037 B as observed projected live traffic. At 1.6 Mbit/s, 214 KB is ~**1.07 seconds of aggregate bandwidth**; this is not an additive first-frame-time promise because HTTP/2 requests overlap with world initialization.

Contract implications: current `sanitizePayload` requires `history[]` for stability (`fetch.ts:28–30`), so retain a real array. `shared` API schemas/guards, smoke expectations, endpoint projectors, fixture/tests and documented standalone API contract must migrate together if narrowing the same URLs. Existing `functions/api/_project.ts:26–39` already filters safety grades to `RUNTIME_ACTIVE_IDS`; that is **shipped**, not a new optimization. Do not extend such ID filtering to stablecoins: eligibility comes from the live payload (`build.ts:63–65`). Preserve proper validator semantics after transformation; compute/version validators for the actual projected representation where required.

### 2.4 Lossless GLB compression comparison

Exact byte counts; existing gzip is the shipped file (zopfli or deterministic gzip per `compress-assets.mjs:39–48`). Sizes below are an offline comparison, not actual Brotli/zstd live GLB delivery.

| Group | Files | Raw B | Existing gzip B | Brotli q11 B | zstd -19 B | br saving vs gzip |
|---|---:|---:|---:|---:|---:|---:|
| island | 1 | 4,613,120 | 2,556,686 | 2,386,501 | 2,470,226 | **170,185 B / 6.66%** |
| lighthouse | 1 | 124,216 | 45,909 | 44,285 | 45,985 | **1,624 B / 3.54%** |
| kit | 69 | 1,520,520 | 771,149 | 738,875 | 783,342 | **32,274 B / 4.19%** |
| civic | 18 | 1,269,108 | 439,482 | 421,295 | 436,458 | **18,187 B / 4.14%** |
| **All** | **89** | **7,526,964** | **3,813,226** | **3,590,956** | **3,736,011** | **222,270 B / 5.83%** |

Kit examples: `titan_usdt.glb` gzip26,090→br24,219; `titan_usdc.glb` 25,678→23,746; `wreck_great_hulk.glb` 44,152→42,464. Full per-file table is `compression.json`. Zstd -19 saves only 77,215 B over all gzip and is **larger** than gzip for the kit aggregate; do not prioritize it over Brotli for byte savings.

**Feasibility, not a deployed proof:** Pages does not automatically discover `.br` siblings and negotiate them. However its documented `_headers` can attach arbitrary response headers to a separately addressed static `.glb.br` object: set correct `Content-Type: model/gltf-binary`, `Content-Encoding: br`, and immutable cache policy on a fingerprinted path, then point a supported client at that URL. Browser HTTP decoding removes Brotli before GLTF parse, so no JS Brotli decoder is required. A compatibility/non-br path and correct per-encoding validators are still necessary. `_headers` cannot select siblings based on `Accept-Encoding`; it is not negotiation. A Function can negotiate, but would add invocation/routing/cache complexity to every model fetch and must use Workers' `encodeBody: "manual"` for pre-encoded bytes, not accidentally compress a compressed file again. Alternative: a zone Compression Rule may target `model/gltf-binary` and allow native browser negotiation on raw GLB, but actual Pages behavior/compression quality must be proven on an isolated deployment; q11 size is not its guaranteed output. Do **not** relabel GLB as a text MIME type just to trigger compression (`nosniff`/type correctness).

**[estimate]** Brotli island transport saves 0.85 s at 1.6 Mbit/s; all 89 files save 1.11 s of aggregate wire time at that rate, or 0.18 s at 10 Mbit/s. The user normally loads a subset; do not add all-asset savings to first frame. Geometry, RGBA bytes, textures and scenery remain byte-identical after decode.

### 2.5 Repeat visits and actual validators

| Resource | Matching If-None-Match GET statuses, n=3 | Median TTFB ms, contended |
|---|---|---:|
| island `.gz` | 304 / 304 / 304 | 34.8 |
| sea SDF | 304 / 304 / 304 | 32.6 |
| emblems AVIF | 304 / 304 / 304 | 37.5 |
| kit manifest | 304 / 304 / 304 | 34.1 |
| regular font | 304 / 304 / 304 | 33.5 |

- Within the first 60 seconds, fresh browser media/font entries need **no revalidation**; no optimization should claim otherwise. Hashed `/assets/` entries are already one-year immutable. Logos/chains already have one-day caching.
- After 60 seconds, unversioned media/fonts/shell CSS revalidate; manifests with R0 can revalidate on every revisit. A proper 304 **already avoids the multi-megabyte body download**. Fingerprinting buys round trips, scheduling and resilience, not a second claim of saving 5 MB of current repeat-visit transfer.
- Known initial document paths include five unversioned world fetch preloads (SDF, island, lighthouse, civic manifest, kit manifest), two fonts, poster, and arrival CSS: **at least nine validation opportunities** on a sufficiently old repeat visit, plus later GLBs/atlases/walkways. Layout and JS are already hashed. Nine × measured ~35 ms = **[estimate] 315 ms aggregate request waiting**, **not** 315 ms guaranteed wall time. At a 150 ms network RTT, nine validations cost 1.35 s aggregate waiting; HTTP/2 concurrency overlaps them. Critical serial dependency waves can still pay one RTT each. Actual number of loaded GLBs and serialized waves belongs to the load-owner waterfall, not an invented total from the 89-file repository inventory.
- Prefer a build-time fingerprinted media namespace (or Vite emitted asset URLs) plus a generated mapping: engine hardcoded URLs, manifest model references, HTML preloads, runtime texture refs and any build validators must all use the same generated URLs. Hash manifests after rewriting their references. Fonts/poster/arrival CSS should join this scheme. Stable names with a blanket one-year immutable header are **incorrect** across deploys. A versioned namespace also must not reuse a previous URL for changed bytes.
- A short SWR policy on stable asset names is lower effort, but can briefly show old scenery after deploy and mix old manifests with new model files. Fingerprinting avoids this risk and stale honesty problems for data. Retain previous deployment assets long enough for existing tabs/rollbacks; validate Pages retention behavior before assuming permanent old URLs.
- **API validator opportunity:** after obtaining a current ETag, three immediate GETs to each of stablecoins/chains sent that exact `If-None-Match` and received **200 with the same returned ETag**, ~158–160 KB and ~29 KB compressed respectively. Evidence: `api-equal-validator.json`. The Function builds a path-only cache request without incoming validators (`[[path]].ts:220–226`, `_shared.ts:81–85`) and never handles conditional requests. Thus unchanged API payloads still transfer full bodies after their 60-second browser TTL. Correct conditional handling can save **~188 KB per unchanged two-endpoint refresh**, up to **~301 KB** if all seven are unchanged. It does not eliminate the round trip, and producer-aligned polling means changed payloads still need full bodies. 304 responses must retain current age/warning evidence; returning a stale body's old age as fresh would be a semantic regression.

## 3. Findings and proposed prioritization

S/M/L are relative implementation efforts, not measured durations. All runtime/latency gains marked `[estimate]` are extrapolations; byte-size reductions above are measured offline or on live as labeled. No opportunity changes the data-to-world mapping.

| ID | Opportunity | Evidence | Proposed change | Expected gain, estimation method | Visual impact | Effort | Risk | Dependencies/conflicts | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| **EDGE-01** | Project the standalone API to its full actual consumer contract | §2.3; `_project.ts:37–39`; model + raw panel reads | Extend edge projectors beyond existing grade-row filtering; keep UI history/flow/reference fields and metadata; migrate schemas/guards/smoke/docs together | Measured **1.98 MB less JSON / 83%**; equal-q11 **163 KB less /71%**; **[estimate] ~214 KB less live br /1.07 s aggregate @1.6 Mbps**; also less parse/clone/sanitize work, CPU gain not measured here | **none**: model equivalence + all panel columns/charts on saved live data, stale/unavailable fixtures; GPU screenshot only after implementation | M | Accidentally dropping fields read outside model; narrowing public route contract | Data/sim and boot slice; update schemas/fixtures/validators atomically; keep all coin rows | H for byte potential; M for live-wall-time |
| **EDGE-02** | Fingerprint all deployed first-view media/fonts/shell CSS and cache immutable | §2.1/2.5; `_headers:12–24`; preload URLs `vite.config.ts:151–180` | Build-time content-hashed URLs/generated mapping, rewritten manifests and preload consumers; `/harbour/<hash>/...` or Vite assets + immutable policy | At least **9 expired validation requests removed** on known first-view paths; **[estimate] 315 ms aggregate @35 ms or 1.35 s @150 ms RTT**, wall gain dependency-wave limited; no repeat-body saving claim when already304 | **none** with correct atomic URL cutover; verify identical bytes/scene and old-tab deploy compatibility | M | Mixed old manifest/new object or stale hardcoded URL | Asset inventory/build namespace owners; module/GLB repacking must emit final hashes after transforms | H mechanism; M wall gain |
| **EDGE-03** | Honor API conditional validators | Same-ETag live200s in `api-equal-validator.json`; proxy's path-only cache key | Match `If-None-Match` correctly on cached/projected response and return304 with current freshness/security headers; support upstream validation where useful without forwarding secrets/headers broadly | Measured unchanged stable+chains still send **~188 KB**; **[estimate] up to301 KB avoided per unchanged seven-endpoint refresh** (87.5 KB after EDGE-01), zero RTT elimination | **none** if age/status cannot regress; check fog/landmark stale transitions on304 | M | Validator comparison/metadata correctness; upstream ETags may describe unprojected response | EDGE-01 representation/versioning; retain browser cached body semantics | H current failure; M realized hit frequency |
| **EDGE-04** | Serve pre-Brotli GLBs with actual HTTP content encoding | §2.4; raw GLB no native CE; `assets.ts:55–65` | Prefer static fingerprinted `.glb.br` + correct headers if supported client coverage is acceptable; otherwise prove native Compression Rule negotiation before choosing Function | Exact **222,270 B /5.83%** less over all89 versus existing gzip; island alone **170,185 B /6.66%**, **[estimate] 0.85 s @1.6 Mbps** | **none**, lossless decoded bytes; verify identical GLB checksum after HTTP decode and no double decode | M | Pages encoding/negotiation not deployment-tested; Function overhead if used | GLB optimization may supersede baseline sizes; EDGE-02 generated URLs and preload changes | H size; M delivery feasibility |
| **EDGE-05** | Persist last-good public data for repeat-visit hydration without a service worker | `HarbourFeed.payloads` only RAM, `fetch.ts:102–165`; `truth.ts:12–19` age model | Versioned IndexedDB/Cache Storage snapshots with original receipt/freshness evidence, async hydrate on admitted viewport only, revalidate in parallel, bounded lifetime; do not reset fetchedAtMs on reload | **[estimate] removes ~51–79 ms live median network wait before cached data is usable**, more on slow/offline links; does not remove JS/shader/world startup; raw projected storage ~407 KB vs2.38 MB before projection | **none in mappings**, but possibly honestly foggier scene: stale snapshots MUST age into fog/dim landmarks; verify elapsed/offline/clock-skew cases | M | Stale honesty, cache schema incompatibility, quota/eviction; parse on main thread | EDGE-01 helps size; boot owner must integrate hydration without blocking first paint; no unsupported-device fetch | M |
| **EDGE-06** | True bounded edge SWR rather than a forwarded unsupported directive | Existing Cache API +24h last-good; upstream A+S only on3; current CF Cache API docs explicitly exclude SWR | Only if miss tails matter: use a stamped valid cache object and bounded soft/hard freshness, return still-allowed copy immediately, `waitUntil` refresh; preserve X-Data-Age/Warning and hard cap; explicit no-store stale-error response remains | **[estimate] one upstream-containing wait avoided on expiry**; local proxy medians19/42ms illustrate its scale, not edge cost. First live-sample deltas100–180ms are *not* verified miss penalties. No gain on already-hit requests | **none** provided stale truth maintained; weather/fog can legitimately reflect older data inside current rules | M | Cache API SWR not automatic; stale served too long; duplicated concurrent refreshes | Need safe hit/miss/upstream timing evidence before priority; don't replace working normal/last-good caches blindly | H API limitation; L gain size |
| **EDGE-07** | Reduce duplicate edge JSON work on misses after contracts settle | `[[path]].ts:153–160` parses every JSON even without projector; `_shared.ts:163–177` reparses last-good candidate | Reuse the successful parse/validation result for projected body + last-good pinning; keep one validity check and the whole-body deadline | **[estimate] at most one parse pass over2.38 MB/round avoided**, far smaller after projection (~407KB); no browser frame-time benefit on edge hits. No measured edge CPU duration | **none**; malformed/truncated200 must still never become last-good | S/M | Removing parseability guard or extending timeout accidentally | EDGE-01 changes representation; preserve existing outage semantics | M mechanism; L timing |
| **EDGE-08** | Carefully bounded short SWR for stable media names if fingerprinting deferred | R0/R60 live policy; Pages supports custom static headers | Alternative, not additive to EDGE-02: modest max-age/SWR for coherent media groups; document allowed deploy staleness, do not apply API/HTML blanket rule | **[estimate] same up-to9 revalidation waits hidden on repeat**, but browser may show old files until background refresh; no cold gain | **marginal / visual-risk at deploy**: old/new asset mixing; side-by-side + multi-tab deploy validation | S | Cross-version manifests/models, old poster vs new world | Conflicts with clean fingerprinted approach; prefer EDGE-02 | M |
| **EDGE-09** | Optional shell-only Early Hints, not ungated world preloads | no live Link/103; Pages rules exclude extra HTML link attrs; current fonts need crossorigin, world links have media | If tested beneficial: add correctly credentialed header hints for arrival CSS/fonts/poster where safe, preserving priority; attach through `/` Function response as needed. Do not add unconditional API/world Link hints | **[estimate] at most HTML preparation interval (~64ms sampled whole TTFB is an upper bound including network)** of earlier shell fetch start; near-zero on cache-fast shell; no proven win | **none**, viewport-gate/network contract verification mandatory | S/M | Credentials mismatch doubles font requests; EH media/priority handling; all-device downloads | First-paint owner; Function route means `_headers` alone may not attach newly added header as expected | L |
| **EDGE-10** | Share engine-lifetime static JSON promises, including prefetch consumers | Load-owner warm trace has civic manifest2x, kit3x, crests2x; independent fetch sites: `engine/prefetch.ts:24–25`, `fleet/hull-kit.ts:328`, `civic/civic-system.ts:136,366`, `civic/shipyard.ts:194`, `identity/identity-system.ts:92` | Reuse the existing AssetStore lifetime/cache convention for typed immutable JSON; prefetch and later systems consume one fetch/parse promise per URL, no module-global cross-request state | Observed **at least4 redundant manifest/crests requests** beyond one per URL; **[estimate] ~4×35ms=140ms aggregate validation waiting** eliminated before fingerprinting, plus duplicate JSON.parse/allocation; after EDGE-02 still avoids repeated decode but no claimed wire304 saving | **none**; do not let consumers mutate shared manifest objects; model/asset contract equivalence | S/M | Sharing a mutable object or permanently pinning a failed promise across engine restart | Boot owner; complements EDGE-02 rather than double-counting network savings | H duplicate evidence; M wall gain |

Recommended order: EDGE-01, EDGE-02 and EDGE-10 (small coherent cache cleanup), then EDGE-03; EDGE-04 is a smaller byte-only win and may be superseded by source GLB optimization. EDGE-05 is a repeat-visit/offline improvement, not a substitute for critical-path work. EDGE-06/09 require deployment evidence before paying their complexity cost.

## 4. API cadence, bundling, connection priority and service-worker decisions

### Existing cadence is already mostly right

`fetch.ts:23–26,93–99,170–179`: producer-aligned polling, 45-second grace, minimum60s, hidden-tab refresh checks once/minute, failure backoff30/60/120/300/600s, last-good per endpoint. Producer intervals (`cron-intervals-client.ts:15–28`): stablecoins/chains/peg/grading900s; PSI/stress/mint-burn1800s. Freshness budgets are separate: stable600, chains1800, peg900, PSI86400, stress1800, grades900, flows3600 (`api-freshness.ts:121–138`). Do not conflate producer cadence, browser cache TTL and stale-world thresholds. Slower global polling just to save tiny request overhead risks changing the chart's truth and is not recommended. First startup currently fetches all seven in parallel; `Promise.all` completion feeds early model installation, not a requirement that all enrichers be present to represent boats.

### Bundle the first two APIs?

The registry calls stablecoins/chains “essential”, but current actual boat geometry/circuits derive chain totals from stablecoin `chainCirculating` (`build.ts:76–85`), and the poster waits for a **stablecoins attempt**, not two endpoints (`harbour-app.tsx:54–56`). `feed.start()` issues all seven concurrently (`fetch.ts:129–134`). One bootstrap endpoint could save one request's headers and shared parse overhead, but HTTP/2 already multiplexes same-origin requests, so **there is no extra connection/TLS handshake to remove**. A naive aggregate blocks stablecoins on the slowest included upstream request, duplicates cache/failure/freshness handling and broadens the allowlist/API contract. **[estimate] header saving <2KB for merging two**, versus much larger EDGE-01 byte savings; **no measured wall-time improvement**. Keep independent endpoint caches and partial failure behavior unless the boot owner demonstrates a real serialization bottleneck.

### Inline/stream data into HTML?

`functions/index.ts:219–226` returns the asset response untouched with no `sel=`, and HTMLRewriter streams only recognized selection text; there is **no upstream fetch and no full-body buffering** to optimize away (`196–217`). Fetching API data before returning HTML would move upstream latency in front of poster paint, remove shared static-shell simplicity and download world data for blocked devices. An inert JSON script would still add ~188KB current br (two essential endpoints) to all visitors; an executable inline bootstrap conflicts with the current no-inline-script CSP policy (`SECURITY_HEADERS.md:28–30`). No key may ever enter HTML. Do not embed API data in this shell.

### HTTP/2 preloads and third parties

One same-origin world origin means HTTP/2 streams, not a six-connection HTTP/1 sharding problem. Curl measured HTTP/2; actual Chrome connection/socket count and effective network priority are not measured in this slice and must come from the load owner's trace. Do not introduce asset hostnames, preconnect the same origin, or replace HTTP/2 priorities with extra connections.

Already shipped: media-gated desktop module/fetch preloads; island `fetchpriority=low`; poster `high`; font preload credentials; `as=fetch crossorigin=anonymous` matches runtime fetch (`vite.config.ts:137–180`, `index.html:14–16,41`). Vite visits the harbour chunk's import graph and may redundantly list shared module URLs in HTML, but identical matching URLs do not imply duplicate body downloads. Avoid “preload everything high”; 2.56MB island should not displace core JS/poster. React's all-viewport preload and the gate-aware critical graph are owned by bundle/first-paint slices.

Live HTML injects **Cloudflare Pages Analytics** (`beacon.min.js`, defer) and a same-origin challenge-platform iframe script beyond tracked HTML. `src/google-analytics.ts:10–35` is already env-gated and idle/5-second deferred; the first-paint peer found no active GA code in the shipping index chunk. Thus “defer GA” is not a new current optimization. Removing Cloudflare analytics is an operator observability tradeoff and challenge JS is zone-managed, not a tracked frontend dependency; request bytes/timing were not measured here. Do not disable security challenges merely for an unmeasured performance win, and do not add third-party preconnects that compete with first-world delivery.

### Service worker vs simpler persistence

A cache-first SW could eliminate expired-media revalidation, but **EDGE-02 provides that using ordinary HTTP cache** without SW startup, lifecycle, version cleanup, offline-shell support burden, duplicate storage or old-shell/new-asset hazards. It cannot improve the first uncontrolled visit. No SW registration/Cache Storage usage exists in current searched client/public sources. Do not install a general SW solely for this performance pass. If offline support becomes a product requirement, use a versioned, bounded strategy and never serve a fresh-looking stale API body. For this task, optional EDGE-05 snapshot persistence inside HarbourFeed is the smaller scope: keep original timestamps/status/warnings, age while closed, hydrate only after viewport admission, and refresh concurrently. Avoid synchronous localStorage serialization of2.38MB on boot; async storage does not eliminate JSON.parse/model cost.

## 5. Ruled out / not worth it

- **“Enable Brotli for JS/JSON”**: already shipped by live delivery. A zstd-only offer currently falls back to identity; enabling zstd is an operator rule change and not automatically smaller than Brotli. No codecs should be blindly globally preferred from their name.
- **Return raw GLB and trust default Cloudflare compression**: measured identity4.61MB versus shipped gzip2.56MB; model MIME absent from default eligible compression types. This would regress island wire bytes by~2.06MB.
- **Service worker as the first repeat-visit fix**: ordinary hashed immutable HTTP caching is simpler, first-visit-neutral and sufficient for static bytes; persistence can be scoped to public data.
- **Blanket one-year caching on stable `/harbour/*` names**: unsafe after deployment. Likewise long HTML caching could pin a shell referencing missing hashed assets; leave shell revalidation profile unless proven otherwise.
- **Assume existing `stale-while-revalidate` headers implement Cache API SWR**: Cloudflare explicitly documents they do not. Existing caches and last-good fallback are real; don't re-propose adding them from scratch.
- **Cross-request module-global Promise single-flight map in Workers**: not a reliable distributed lock across isolates/POPs and risks request-scoped I/O sharing errors. A Durable Object/request-collapse service is excessive without measured herd/expiry load. At n concurrent misses it could theoretically reduce n upstream calls to1, but n was not measured; no benefit promised for normal single-user startup.
- **Add `cf.cacheTtl` blindly to the cross-zone upstream fetch**: upstream is `api.pharos.watch`; cross-zone cache policy and authorization/privacy constraints must be checked by its owner. It is not equivalent to caching the projected public Function response. Do not put secret-bearing upstream request keys in browser storage or expose request headers in debug timing.
- **Remove all API history/reference/flow details based on model-only reads**: breaks already-shipped panels; retained data table explicitly includes them. Likewise filtering live stablecoins to a checked-in registry changes what the world means.
- **Fully stream upstream JSON immediately**: today's8-second deadline includes body consumption and parsing (`[[path]].ts:135–176`), and last-good pinning refuses malformed JSON. Simple streaming would weaken these behaviors and preclude projection; projection's larger savings outrank removing all buffering.
- **Optimize `/_log` as a load blocker**: error-only POSTs, max4KiB, capped/rate-limited; optional durable write in `waitUntil`, no normal-boot request dependency (`_log.ts:24–25,176–185`; `OPERATIONS.md:207–223`). Keep it off render/loading success paths; no measured steady-state cost to recover.
- **Remove social-card Function / HTMLRewriter**: ordinary shell already returns without rewrite/buffering/upstream. Deleting useful social cards for an unmeasured few-ms invocation saving is not justified.
- **Enable Tiered Cache on Pages as a new optimization**: Pages static assets already use it. Cache API responses are POP-local and cannot gain tiered caching through `cache.put` configuration.

## 6. Open questions / required deployment evidence

1. Is the standalone same-origin API contract allowed to narrow while preserving every current world/UI field, or is there an undocumented external consumer expecting the upstream's extras? Existing proxy/schema docs imply a contract, so explicitly migrate it rather than silently assuming model-only projection.
2. Which content-hashed media strategy should the build owner standardize on (Vite emitted URLs vs generated hashed namespace/manifest)? Avoid a second independent asset registry. How will deploy retention support open tabs and rollbacks?
3. Can an isolated Pages preview prove pre-Brotli static headers and all supported-client negotiation paths? Does a targeted zone Compression Rule actually compress raw model/gltf-binary on this Pages route, at what effective size? Without that proof, gzip remains correct.
4. Current edge cache hit rate, edge→upstream timings, expiry tails and simultaneous miss volume are **not observable from current headers**. Before EDGE-06 or coalescing, use safe `Server-Timing`/hit markers in an isolated measurement variant or deployment logs; never include secrets/requests/payloads. No fabricated miss-rate or first-sample attribution is supplied here.
5. Is persistent last-good hydration desired across visits, with the deliberate UX that old data may immediately show fog? Bound maximum persisted age; test tab-closed aging, clock changes, missing metadata and storage eviction before enabling it.
6. Is Cloudflare's injected analytics/challenge traffic materially in the first-live-frame waterfall? The load/first-paint owners' real-GPU capture is the source for request bytes/priorities/connections; no extra capture was queued by this slice because that shared measurement lane is saturated.

## Supplemental load-owner evidence received after the curl audit

Read `outputs/need-for-speed/load/a-repeat-1.json` produced by the designated real-GPU measurement owner; **this slice did not queue a capture**. It is **one contended guaranteed-warm run**, not a median or a new performance baseline:

- 154 CDP waterfall events include data URLs and an extension URL, not154 network requests. CDP reports29,804 total wire bytes, but13,160 B belong to a `chrome-extension://.../page-script.js` event; do not call the whole total origin transfer. The file's `transferBytes` field is negative and is not a usable browser-transfer metric.
- Raw `responseReceivedExtraInfo` reveals **10 real304s**, even though Chrome's reconstructed cached responses show status200: civic manifest2×, kit manifest3×, crests2×, plus emblems JSON, chart-lettering JSON and webmanifest once each. This is direct browser evidence for EDGE-02/10. `walkways.json` also has1,214 encoded bytes but no captured `wireStatus`; it is **not counted** as an additional proven304.
- Initial entry/vendor/world fetch priorities are **High**, island **Low**, document/CSS **VeryHigh**, Cloudflare beacon **Low**. This confirms current source priority choices. The warm beacon had zero encoded network bytes, so that sample cannot establish its cold transfer cost.
- Actual browser navigation/uncached manifest requests use **HTTP/3**; other cached entries retain h2/h3 protocol labels. This supplements the curl-only h2 observation above. Physical connection IDs were not collected, so exact socket/connection count remains unknown.
- Browser response headers include `Server-Timing: cfExtPri` and RFC9218-style `priority` fields, unlike the curl samples. `cfExtPri` contains no edge-cache/upstream duration and does not resolve the API latency attribution question.
- First frame12,013ms and `u:data`6,118ms in this single run are dominated by CPU/initialization rather than a multi-megabyte warm network load; immutable caching is **not** a cure for that runtime bottleneck. Other owners supply controlled medians and CPU attribution. No frame-rate or scenery judgment is derived here.

The redundant static JSON calls are small enough to fix at their source rather than adding a service worker or attributing all warm delay to CDN validation.

Additional first-paint-owner cold evidence: read `outputs/need-for-speed/firstpaint/blocked-live-2.json`. Cloudflare `beacon.min.js` transfers **10,351 B gzip**, **Low** initial priority, starts36ms after navigation; the `/cdn-cgi/rum` attempt starts100ms and has no captured response. Thus eliminating the beacon would save only **[estimate] ~52ms aggregate wire time at1.6Mbit/s**, with no demonstrated first-live-frame benefit and a real observability tradeoff. No active gtag request was reported. The challenge-platform script visible in raw HTML lives in an iframe absent from this page-target waterfall; its cost is not quantified. Do not include the13,160B extension event in site bytes.

## Primary platform references

Retrieved current documentation (not assumptions from older Pages behavior):

- [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/) — arbitrary static response headers, 100-rule limit, no automatic application to Function-generated responses.
- [Pages serving and caching](https://developers.cloudflare.com/pages/configuration/serving-pages/) — ETag/304 behavior, SPA fallback, built-in Tiered Cache, custom-cache/deploy warning and retention caveat.
- [Pages Early Hints](https://developers.cloudflare.com/pages/configuration/early-hints/) — always enabled; Link-header hints; automatic extraction excludes additional attributes including media/crossorigin/fetchpriority.
- [Cloudflare compression](https://developers.cloudflare.com/speed/optimization/content/compression/) — eligible MIME list excludes model/gltf-binary; supported codecs and transformation caveats.
- [Compression Rules](https://developers.cloudflare.com/rules/compression-rules/) — path/content-type rules, visitor encoding choice, all-plan availability; still needs actual Pages-route verification.
- [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) — Pages support, local-to-data-center cache, conditional matching, **no SWR/stale-if-error support**.
- [Workers cache interaction](https://developers.cloudflare.com/workers/reference/how-the-cache-works/) — fetch vs Cache API, cross-zone behavior and tiering differences.
- [Workers Response](https://developers.cloudflare.com/workers/runtime-apis/response/) — `encodeBody: "manual"` for precompressed response bytes.
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) — streaming tradeoffs, request-scoped I/O, secrets and waitUntil.
