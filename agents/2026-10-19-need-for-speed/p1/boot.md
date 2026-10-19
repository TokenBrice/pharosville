# BOOT — main-thread startup critical path

## 1. Scope and method

Research only, base brief `agents/2026-10-19-need-for-speed/00-BRIEF.md`; no tracked source changes, builds, server restarts, lint or test gates. Read `AGENTS.md`, architecture/runtime facts, `src/client.tsx`, app/poster, engine/assets/prefetch/static-merge, registry and every registered system init, feed/data sim/warm workers, identity fitting, ground and wake paths. Read `git show beb6a8ca --stat` including its full commit rationale. Followed the product design constraints for the reveal-policy review.

Eight real-GPU captures total, through the shared `npm run preview` lock, 1600×1000@1, NVIDIA RTX 5070 Ti / ANGLE Vulkan. Commands have this shape:

```sh
npm run preview -- --url http://localhost:5173/ --cold --throttle fast4g \
  --cpu-throttle 1 --seconds 3 --wait 1600 --ready-timeout 120 \
  --profile outputs/need-for-speed/boot/dev-1.cpuprofile \
  --json outputs/need-for-speed/boot/dev-1.json \
  --out outputs/need-for-speed/boot/dev-1.png --waterfall --log-requests \
  --init-script '<observer.js contents>' --eval '<read observer/measures/resources>'
```

- Three dev/API runs `dev-{1,2,3}`, three minified **no-API** runs `dist4-{1,2,3}` at `http://127.0.0.1:4173/` with 4× CPU throttle, two cold live runs `live-{1,2}`. All used fast4g (9 Mbps, 40 ms RTT).
- All timings are **contended**, with V8 sampling enabled. Primary groups use n=3 medians. The live runs are illustrative samples, **not a three-run baseline**; only live-2 has a working crossfade observer. Do not infer a CPU-slowdown ratio by comparing dev against dist: the module graph, APIs and payloads differ.
- `boot[system]` is elapsed time around **await system.init**, not CPU self time. `u:*` is first-frame synchronous elapsed time; it can include WebGL driver stalls. `firstRender` covers the entire first frame, not just composer rendering. Engine timestamps exclude chunk download/evaluation and most constructor setup.
- The observer in the first seven runs tried to observe `document.documentElement` before it existed. That produces a recorded pageerror, but the **long-task observer was already installed and remains usable**. It prevented the additional feed/crossfade polling in those runs. Fixed eighth run observes `document` with subtree attributes. Scripts are `observer.js` and `observer-fixed.js` in scratch. This error is measurement instrumentation, not an application defect.
- Raw evidence: `outputs/need-for-speed/boot/{tag}.{json,cpuprofile,png}`; derived `summary.json` contains per-group medians and a heuristic sampled-stack classification of observed tasks. `--trace` was not used because shot.mjs starts it only in the steady-state window. Long-task source attribution below is sampling/code correlation, not browser-provided attribution (the browser reports `unknown`).
- Inspected `live-2.png`: completed harbour, boats and chart labels visible. No visual A/B or optimization spike was performed, so all proposed gains are **[estimate]**, not measured speedups.

## 2. Measurements

### End-to-end samples

| Run | Origin / CPU | Navigation → first frame (ms) | Engine → first frame (ms) | First u:data (ms) | First u:ocean (ms) | First composer render (ms) |
|---|---|---:|---:|---:|---:|---:|
| dev-1 | :5173 / 1× | 24379 | 14791 | 4919 | 8 | 576 |
| dev-2 | :5173 / 1× | 18237 | 9454 | 961 | 2 | 196 |
| dev-3 | :5173 / 1× | 16638 | 7925 | 17 | 2 | 131 |
| dist4-1 | :4173 / 4×, no API | 19676 | 17566 | 1 | 2603 | 2014 |
| dist4-2 | :4173 / 4×, no API | 8372 | 6815 | 1 | 951 | 510 |
| dist4-3 | :4173 / 4×, no API | 8100 | 6551 | 1 | 1045 | 543 |
| live-1 | live / 1× | 6551 | 4890 | 8 | 312 | 187 |
| live-2 | live / 1× | 6017 | 4429 | 5 | 213 | 132 |
| **Dev median, n=3** | **cold fast4g, contended** | **18237** | **9454** | **961** | **2** | **196** |
| **Dist4 median, n=3** | **cold fast4g, contended; no API** | **8372** | **6815** | **1** | **1045** | **543** |

The dev first-update race is real but variable: `u:data` = **4919 / 961 / 17 ms**. The sample with a 4919 ms first data update also had two API 502s. The live samples installed data ahead of drawing: first data update **8 / 5 ms**, but still had **675 / 571 ms main-thread plan-install tasks** earlier in boot. Consequently a worker can improve responsiveness without saving its entire CPU duration from the reveal critical path.

Independent production-faithful corroboration from the load owner: `outputs/need-for-speed/load/diagnostic-4180.json:37-71` (single contended, unthrottled, non-cold diagnostic, not part of the medians above) records **u:data6113 ms**, firstRender6856 ms, engine firstFrame10404 ms and composer457 ms. Thus the seconds-long fallback is not an unbundled-dev-only artifact. This observation is a problem exposure, not a measured optimization gain.

S9's worker-instrumented `outputs/need-for-speed/datasim/profile-5.json` further corroborates the race (single diagnostic, outside this slice's medians): **u:data6727 ms**; four workers constructed at1259 ms, warm messages posted1804–1817 ms, but result callbacks delivered12582–12612 ms and workers terminated13556 ms. There were **zero `paths` posts**. The current first-frame fallback had already built the plan/paths before the early-install path could use the workers. Message callback delivery can itself be delayed by main-thread blockage, so this does not measure worker computation duration. It does show why increasing worker count alone cannot fix the lifecycle race.

The 4× no-data first ocean update costs **2603 / 951 / 1045 ms**. This is **not evidence of SDF decode failure**: the first update includes offscreen wake rendering, which the scene-wide compile does not necessarily prepare. SDF bytes returned 200/image-webp. The S10 source/profile review found no dominant buildSeaSdf cost; treat this as shader/upload/offscreen-pass investigation shared with S7/S10, not as a proven fallback bug.

### System costs and movement verdicts

The original brief's warm no-data `identity 746`, `life 188`, `civic 120`, `fleet 113`, `island 117`, `data 123` are **await spans**. They must not be added to first-frame cost indiscriminately: life and identity are already deferred. These cold measurements show why byte delivery and CPU must be separated.

| System | Dev median init ms (n=3) | Dist 4× median init ms (n=3; no API) | Live-2 init ms (n=1) | Awaits / synchronous work / graphics work | Defer, parallelize, worker verdict; expected savings fast4g / 4× CPU |
|---|---:|---:|---:|---|---|
| season | 3 | 16 | 3 | No await; calendar, hemisphere and uniforms. No scene upload. | Keep before material compilation. No useful move: 0 / 0 ms. |
| layout | 722 | 61 | 24 | Fetch+JSON parse layout; install camera presets, bounds and service. | Required dependency. Already preloaded in built HTML. 0 / 0 ms beyond delivery slice. |
| data | 5003 | 1199 | 1252 | Starts all seven APIs concurrently; starts up to four workers; awaits shared SDF fetch/decode/read/row flip; creates empty model and sim layout. No WebGL itself. | Do not await payload network in init (already does not). Split service/preparation from final sim install; overlap SDF with independent world preparation. BOOT-01/02; 0–1200 / 0–2000 ms [estimate] for preparation overlap, non-additive; do not multiply network waits by CPU slowdown. |
| readings | 53 | 57 | 22 | No await; first acquireFxTextures bakes noise+ripple on owning GL context; creates stale-fog post effect. | Keep truthful readings before reveal. GPU bake/compile belongs SHADER/ENV. No safe blanket defer: 0 / 0 ms. |
| weather | 6 | 15 | 6 | No await; precipitation/lightning/rainbow buffers, materials and scene objects; shared FX reused. | Keep semantics. Pure geometry preparation could parallelize but small (0–5 / 0–20 ms [estimate]); worker overhead not justified alone. |
| sky | 17 | 31 | 18 | No await; CPU coast-outline collection; cloud atlas GPU bake, backdrop mesh and reflection-band render target. | Keep first scenery; baking off critical path overlaps network only. No independent worker for WebGL context. BOOT-02 overlap 0–20 / 0–80 ms [estimate]. |
| ocean | 62 | 1256 | 350 | Awaits same cached SDF promise; CPU zone mask and sea geometry; data texture, wake targets, uniforms and mesh. First update renders wake decay to offscreen target. | Keep sea; share SDF is already shipped. Worker SDF row extraction / pure masks possible, not GL. BOOT-02 overlaps wait; BOOT-07 avoids unprepared offscreen first draw. Do not label all elapsed time CPU. |
| island | 785 | 1301 | 1197 | Awaits prefetched .glb.gz bytes, inflate/GLTF parse; apply materials, static merge; renderGround height render+readback and AO maxpool; sun/shadow resources. | Cannot defer visible island/ground dependencies. Parse can prepare in parallel; static transforms/height/AO can bake offline. BOOT-02/06, 20–100 / 80–400 ms CPU component [estimate], plus overlap. |
| lighthouse | 21 | 47 | 17 | Awaits cached GLB; ground placement, node lookup, static merge; fire, bronze/mirror materials and two light objects. | Do not reveal without tower. Async prepare with island but commit after ground; 0–20 / 0–80 ms overlap [estimate]. No WebGL worker. |
| civic | 1092 | 724 | 889 | Awaits manifest then Promise.all plot GLBs; clone/transform, pieceCentres lamps, merged buildings, workers and boards. buildYard intentionally launched without await. | Do not defer whole civic quarter (major scenery/data effects). Parallel prepare with fleet/island; offline static assembly where identity node contract survives. BOOT-02; network overlap 100–500 ms fast4g [estimate], CPU4 not 4× network. |
| fleet | 400 | 419 | 155 | Awaits Promise.all hull kit+EmblemAtlas.load(420); bakes/indexes kit geometries, BatchedMesh capacity1500 and auxiliaries. Full emblems grow after update. | Do not defer actual boats when data exists. Kit preparation parallelizable; fleet poses need explicit ready signal. BOOT-01/02; 50–250 / 100–500 ms overlap [estimate]. Existing emblem progressive path not new. |
| life | 417 | 690 | 187 | After first frame only. Fetch walkways JSON; build walk graph, 150 walkers+34 standers, gulls/smoke/drift/flags; mesh/material setup, then engine compiles whole scene. | Already deferred; moving again saves 0 first-frame ms. Split builders into bounded tasks / prepare walkways concurrently. 10–60 / 40–240 ms main-thread burst reduction [estimate], not total work saved; verify no post-fade pop-in. |
| identity | 903 | 1653 | 705 | After life. Promise.all two JSONs+two atlas images; CPU sight grid, label candidate scoring, LOS, office dresser/flags/pier marks. Uses baked SDF glyph atlas, not canvas text or document.fonts. | Already deferred; worker exact fitting or exact serialized layout cache. BOOT-03 removes 130–185 / ~500 ms fitting burst; 0 direct first-frame gain. Do not defer semantic labels visibly without checking fade. |
| lights | 1 | 6 | 1 | No await; consume ground+lights store, build pool target, instanced sprites/pillars and point-light pool. | Keep before nighttime reveal; GL-owned. No meaningful init saving beyond graphics slice: 0–5 / 0–20 ms [estimate]. |
| beam | 2 | 7 | 1 | No await; consume lighthouse+FX, build shimmer/beam effect pass and halo, service. | Must exist before post.seal and nighttime truthful reveal. No safe whole-system defer: 0 / 0 ms. |

Source anchors: registration `src/harbour/systems.ts:22-37`; init accounting and defer policy `engine/engine.ts:123-165`; first update accounting `engine/engine.ts:182-225`; data `sim/system.ts:64-108`; life `life/life-system.ts:59-132`; identity `identity/identity-system.ts:86-144`; civic `civic/civic-system.ts:107-215`; fleet `fleet/fleet-system.ts:235-301`; island `world/island-system.ts:24-58`. Times for separate systems share resource contention and are not independent savings.

### Boot DAG (measured live-2 spans, ms; n=1, contended)

Solid arrows are the current serialized engine `await` chain. Dashed branches run concurrently. These are not durations of exclusive CPU work.

```mermaid
flowchart TD
  N[Navigation] --> J[Harbour chunk fetch 71–1544 ms]
  J --> E[React effect / Engine construction]
  E --> PF[Byte prefetch island + lighthouse + manifests]
  E --> S[season 3]
  S --> L[layout 24]
  L --> D[data init 1252]
  D -. starts .-> A[7 API fetches in parallel
stablecoins 1623–2230 nav ms]
  D -. awaits .-> C[Shared SDF fetch + decode
preload 70–2724 nav ms]
  C -. coast ready .-> W[1–4 warm-leg workers
leg times + outings]
  A -. all endpoints settled .-> I[installEarly task]
  W -. warm.done .-> I
  I --> P[Main-thread model + plan
long task 571 at nav 3278]
  P --> WP[Worker required now paths
then initial poses]
  D --> R[readings 22]
  R --> WE[weather 6]
  WE --> SK[sky 18]
  SK --> O[ocean 350]
  C -. cached promise .-> O
  O --> IS[island 1197]
  PF -. GLB bytes .-> IS
  IS --> LH[lighthouse 17]
  LH --> CV[civic 889]
  CV -. no await .-> Y[Shipyard book + hulls + logos]
  CV --> F[fleet 155]
  PF -. civic / kit bytes after island bytes .-> CV
  PF -. kit bytes .-> F
  F --> LT[lights 1]
  LT --> B[beam 1]
  B --> CO[seal + resize + compile 28]
  CO --> FF[first update/render 439
u:data 5; u:ocean 213; fleet 57; render 132]
  WP -. data ready before draw .-> FF
  FF --> ST[Published first stats 6014 nav ms]
  FF -. initLater already starts .-> LI[life 187]
  LI --> ID[identity 705
label fit 137 at nav 6749]
  LI -. compile whole scene .-> LC[Deferred scene compilation]
  ID -. compile whole scene .-> LC
  ST --> Q[Data snapshot present + settle watch]
  A -. stablecoin success seen 2245 .-> Q
  Q --> X[Crossfade attribute 6160 nav ms]
  X --> END[Poster nominal fade end 7260 nav ms]
```

The data node starts the APIs and workers before its SDF await; it does **not** await API round trips in engine.init. The entire later engine chain nevertheless sits behind SDF completion, because init is serialized. Existing byte prefetch fetches island+lighthouse immediately and civic/kit manifests immediately, then civic/kit GLBs **after island bytes finish**, parsing them only in the consuming system (`engine/prefetch.ts:21-33`, `assets.ts:24-65`). This is an intentional network-priority policy already shipped. Do not propose “prefetch all GLBs” as new work.

## 3. What the big costs actually mean

### Identity: no runtime lettering canvas or font wait

`identity-system.ts:90-95` fetches prebuilt `chart-lettering.json`, `crests.json`, `chart-lettering.png` and `crests.webp` concurrently. There is no `document.fonts.ready`, web-font load or OffscreenCanvas text rendering in this path. The CPU hotspot is deterministic **placement**, not text rasterization:

- Build a coarse max-height sight grid from 1024² island heights and extra civic/lighthouse occluders (`identity-system.ts:49-70,205-216`).
- For each label: up to 3×11×11 = **363 coarse candidates**, glyph sampling, polygon/coast/pier tests, camera projection; then lazy fine batches of 24, with nine ink samples per glyph and 3 m visibility rays (`identity/labels.ts:325-435`). Collision resolution tries up to 160 candidates (`labels.ts:457-475`).
- Actual `identity:labels` measures: dev-2 **172.6**, dev-3 **129.6**; live-1 **184.5**, live-2 **137.3**; 4× dist **526.7 / 556.7 / 495.6**, **median 526.7 ms**. Dev-1 CPU samples also show the heavy `segDist`/`judge` task, but its evaluator did not collect performance measures.
- In live-2, total identity init **705 ms**, fitting **137 ms**. The remaining 568 ms includes atlas/JSON delivery/decode, allocations and small heraldry setup—not an observed 568 ms CPU task. The brief's 746 ms must not become a claimed 746 ms worker saving.

Preferred: begin byte preparation earlier at low priority; move the exact pure fitting algorithm to a worker with serialized camera matrices, height/coast grids, obstacles and font metrics. Keep geometry/texture attachment on the owning thread. Copy/transfer **worker-owned** snapshots: transferring the engine's active ground/coast arrays would detach data that other systems still read. Preserve tie-breaking/order and floating-point math; do not replace placement with lower-quality heuristics or coarse aspect buckets. Build-time exact precomputation is possible only with explicit layout/font/terrain/camera/aspect cache keys; a single placement for all aspect ratios does not preserve the current picture.

### Life, civic, fleet, island, data

- **Life:** 35 KB walkways JSON round trip plus route graph and procedural meshes for population, gulls, chimney smoke, drift and flags. A 52 ms life construction task appeared in dev-1, while init elapsed 1050 ms. Default life is already off first frame. Move preparation/bounded graph batches, not the whole visible town, and avoid showing people popping in after fade.
- **Civic:** manifest → concurrent plot GLBs → per-plot transforms/light-centre scans → static merge → animated building FX/workers/boards. Shipyard build is already deliberately non-awaited (`civic-system.ts:211-225`). Whole-quarter deferral removes major scenery and data-linked mint/burn activity; reject that shortcut.
- **Fleet:** kit+initial emblem atlas are already Promise.all; kit GLBs internally cached. CPU copies decoded attributes and assembles the BatchedMesh; first update installs boat instances/poses and can trigger texture growth. Do not equate the original 113 ms init with the first fleet frame, or reveal an empty fleet as “ready” while poses are pending.
- **Island:** decompression/GLTF parse, material reassignment, merge plus **actual GPU render and synchronous height readback**. `world/ground.ts:39-85` reads 1024² RGBA Float32 = **16 MiB**, extracts 4 MiB heights; `aoHeightTexture` maxpools 512². Worker geometry math is possible; GPU readback cannot be made a worker job without moving the renderer. Prefer offline equivalent merge/height/AO data (scene slice owns that opportunity).
- **Data:** init's 123 ms warm baseline is primarily the shared SDF/empty sim setup, not waiting for the stablecoins API. API JSON parsing/sanitization and real model/plan installation happen separately. `Promise.all([landed, warm.done])` waits for **all seven initial endpoints**, not just stablecoins. Meanwhile any payload sets `dirty`, and `DataSystem.update()` can consume it and synchronously rebuild/pose **before warm preparation wins** (`sim/system.ts:87-107,115-127,148-164`). That explains the 17–4919 ms dev first-update variability. Keep the first real model/plan install out of frame callbacks, seed its required paths before publishing ready, and avoid a second install while the early one is waiting for paths. Missing endpoints must still retain their current unavailable/error truth; don't fake completion with fixtures.

### Worker history: beb6a8ca is scoped evidence, not a ban

The 2026-07-26 garden-era commit measured refresh after sticky placement: identical 0 ms, typical 239 ms, churn 795 ms; model rebuild had fallen 303→34 ms, and only that 34 ms was movable versus remaining GL resource recreation. Its verdict **against a whole-world refresh worker for that renderer remains sensible**. It does not rule out current pure boot work:

1. This renderer already uses workers for representative leg times/outings/first paths (`sim/warm-legs.ts:21-67`); no need to rediscover that design.
2. Current main-thread label fitting is directly measured at ~130–185 ms / ~527 ms at 4×.
3. Current main-thread **plan install** has 571–802 ms observed long tasks even when worker warm legs succeed; first-frame fallback can cost seconds. S9's dedicated CPU benches should own final model/plan decomposition and worker payload accounting.
4. WebGL constructors/uploads, scene attachment and driver stalls still stay on the renderer's thread. Moving JSON.parse alone is low value: S9 measured ~3 ms stablecoins parsing, not hundreds. Structured-cloning an object graph and worker startup may cost more than parsing. Prefer a worker for an entire useful pure stage, not for 875 KB JSON solely because its raw byte count looks large.

## 4. API request lead time and poster policy

### When the stablecoins request starts

There is **no** `/api/stablecoins` preload in `index.html` or generated first-frame preload list (`vite.config.ts:151-179`). The React entry passes **both screen and viewport** tests (`src/client.tsx:58-76`), imports the harbour app, React effect constructs Engine, LayoutSystem awaits layout, and DataSystem finally starts HarbourFeed. `HarbourFeed.start()` launches all seven endpoints in parallel (`data/fetch.ts:129-135`); default fetch preserves freshness headers + `_meta` and has a 15 s request timeout (`fetch.ts:62-90`).

| Evidence | API start from navigation | Stablecoin body end | Interpretation |
|---|---:|---:|---|
| Dev three runs, median | 9489 ms | 13305 ms | Unbundled module graph and no built head preloads; not production-like startup. |
| Dist 4× three runs, median | 1656 ms | 1704 ms | **404/error responses**, not real data timing. |
| live-1 | 1614 ms | 2221 ms | Cold fast4g, body transfer compressed ~159 KB including headers. |
| live-2 | 1623 ms | 2229 ms (CDP); 2230 Resource Timing | Harbour app itself fetched 71→1544 ms; payload success observed2245. |

875 KB is **raw JSON**, not live transfer. Browser Resource Timing live-2 reports stablecoin transferSize158705 B; CDP includes additional response/header accounting. Do not claim a 0.78 s minimum transfer at 9 Mbps from raw JSON alone.

**Prefer a small admitted-entry request over an HTML-only API preload.** Start a single same-origin stablecoin fetch as soon as both gate checks pass, in parallel with the lazy import; hand the **same response/promise**, including headers and errors, to the real feed's initial round. Preserve accept header, freshness metadata, sanitization, cadence and unmount abort semantics; no duplicate request or second independent polling service. Estimate request lead on this live sample ~1.0–1.5 s; reveal savings **0 ms here**, because data beat the first frame by 3.77 s. In a slow-API case benefit is `min(request lead, positive data-caused reveal wait)`. A pure HTML `as=fetch` preload could begin ~70 ms, ~1.55 s earlier here, but the existing generated media query tests **viewport only**, whereas the hard gate also checks physical screen. It also needs exact fetch-mode/credentials/header/cache reuse validation. Do not introduce API requests on blocked devices to gain speculative loading.

### Actual reveal waits

`harbour-app.tsx:49-66` requires: first published frame; stablecoins **snapshot defined** OR 8 s since **engine.init finished**; then a four-count rAF watch. A failure snapshot also satisfies “defined” (`fetch.ts:155-163`), so this is **not a successful-data guarantee**. The dist preview's 404s do not exercise the 8 s timeout.

Live-2 (single instrumented cold sample):

| Milestone | Navigation ms | Incremental wait |
|---|---:|---|
| Engine first visible stat | 6014 (shot poll6017) | Main critical path, not poster fade completion. |
| Stablecoin payload success | 2245 | **0 additional data wait**; arrived3769 ms before first stat. |
| `data-pv-live` mutation | 6160 | **147 ms after first stat**; includes watch/rAF scheduling and intervening frames. |
| Poster fade nominal completion | 7260 | **1100 ms opacity fade**, source-derived, not observed transitionend. |

`SETTLE_FRAMES=4` decrements on its first eligible watch callback, so its minimum after that callback is three further frame intervals (~50 ms at 60 Hz), not a guaranteed 67 ms. It is not a proof that a particular model version's fleet was rendered. `engine.initLater()` starts inside the first frame before the stat is published (`engine.ts:209-225`); async life/identity continuation and synchronous whole-scene compile can still block the watch or fade even though they are not explicit requirements.

**Faster, honest default policy:** retain the truthful no-data fallback and current timeout semantics, but replace the arbitrary four-count watch with “this feed/model version's poses have been installed and its fleet has completed a render,” and crossfade as soon as that condition and a real frame hold. Data can be ready in advance; do not require unrelated endpoint completion to show stablecoin boats. During real API delay, keep all untried/failed endpoints marked unavailable; do not substitute fixtures or infer a safe sea state. Prepare/decode labels and small decorative layers within the fade, with task/compile work budgeted rather than competing with its first frames.

An optional **earlier awaiting-data reveal** (e.g. 2 s after first drawn frame, rather than the 8 s post-init ceiling) is honest if labelled unavailable, but changes the initial empty-fleet scenery: **visual-risk**, not a default no-impact optimization. Hypothetically, using live-2's439 ms first-frame work, current remaining wait would be~7561 ms; a 2 s bound could save~5561 ms. Using dist4 median1740 ms first-frame work gives~6260 ms remaining and~4260 ms savings. These are **[estimate] timeout arithmetic, not measured hung-API runs**; do not add them to normal-case gains. S15 owns broader perceived-first-paint/fade duration recommendations.

## 5. Findings table

All gains below are **[estimate]**. `fast4g` means cold network at the measured 1× desktop CPU; `4×` scales only movable CPU unless noted, not RTT or GPU time. Lower bounds include zero because overlap can hide a stage entirely. These opportunities overlap; **do not sum the upper bounds**.

| ID | Opportunity | Evidence | Proposed change | Expected gain and estimation method | Visual impact / verification | Effort | Risk | Dependencies / conflicts | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| BOOT-01 | Make initial model/plan/paths a deterministic prepared job, not a first-frame fallback | `sim/system.ts:105-127,148-164`; dev u:data4919/961/17; live install long tasks675/571 | Track actual prepared model version and paths; schedule first real install outside frame, prevent concurrent fallback install, offload remaining pure plan work if S9 profiling supports it; preserve partial/error truth | Fast4g: **0–1000 ms typical race/plan critical-path saving; up to4919 ms observed fallback exposure**. 4× data-bearing: **0–4000 ms**, CPU scaling estimate; no-data measured saving0. Main-thread install burst can fall~0.5–0.8 s at1× if moved, but that is not all reveal time | None final-state if same plan/clock; verify fleet/model version, initial poses and no duplicate install under slow endpoints, failure and worker readiness permutations | L | High: sim and clock lifecycle | S9 data/sim; do not merely await all data before engine starts or gate forever on worker errors | H cause / M gain |
| BOOT-02 | Prepare independent assets/systems concurrently; preserve ordered scene commit | `engine.ts:127-135`; data wait1252 live; island1197/civic889/fleet155; prefetch bytes already shipped | Separate prepare promises from scene/service commit for SDF, island/lighthouse, civic and kit; keep service dependency edges and compile only attached objects. Start independent parse/prep during waits, not Promise.all CPU callbacks all at once | Fast4g **300–1200 ms**, bounded by overlapping live SDF/island/kit spans rather than sum; 4× **500–2000 ms** [estimate], not4× network. Dependency-bound upper bound requires A/B. Existing byte prefetch is not counted as new | None with same commit state; compare heart/overview noon/night and in-flight abort disposal | L | Medium/high init dependencies and peak parse memory | S3 assets, S4 masks, S7 compile; respect island byte priority; do not let background logos compete | M |
| BOOT-03 | Move exact identity fitting off main thread | `identity-system.ts:99-102,178-223`; `labels.ts:353-435`; measures129.6–184.5 and4×median526.7 | Worker pure fit using serialized matrices/grids/metrics; main only attaches buffers/materials. Early low-priority atlas preparation; same deterministic candidates/ties | **~120–180 ms main-thread burst removed at1×; ~480–530 ms at4×**, subtracting estimated small message/attach overhead from measured fitting; **0 ms direct first-frame gain** because already deferred. Reveal/fade hitch benefit depends timing | None final layout; assert label specs identical at supported aspect bounds and compare labels/occlusion in heart/overview and resize | M | Medium transfer ownership / float determinism | Needs ground+coast snapshot; do not transfer active engine arrays; S13 frame-idle overlaps scheduling | H hotspot / M gain |
| BOOT-04 | Start stablecoins at admitted entry while lazy chunk downloads | `client.tsx:58-76`; `fetch.ts:62-90,129-135`; live API1614–1623 ms versus chunk preload~71 ms | Single gate-owned first request consumed by HarbourFeed, preserve headers/errors/cancellation and no extra poller | Fast4g **~1000–1500 ms request lead; 0 reveal ms measured here**. Slow API reveal saves min(lead, data wait). 4× **~1000–2500 ms lead** [estimate] if more chunk CPU delays start; network itself unchanged | None; verify zero API on either denied gate, one initial request on admission/remount, same freshness truth | M | Medium fetch reuse/abort scope | S5 entry split + S8 API delivery; **not** blanket media-gated HTML preload without full gate | H timing / M realized gain |
| BOOT-05 | Replace arbitrary settle counter with rendered fleet/model readiness | `harbour-app.tsx:50-65`; live firstStats6014→crossfade6160; DATA_WAIT starts post-init | Have prepared sim + fleet publish model-version/pose-render readiness, then reveal on first eligible rendered version; retain current timeout and truthful no-data state | Fast4g **0–50 ms** watch-count component typically; 4× **0–100 ms** [estimate] from3 unnecessary rAF intervals at16.7–33 ms. Cannot promise entire147 ms since other work runs | None if same placed fleet at reveal; verify first revealed frame has intended fleet, not just payload snapshot | M | Medium readiness races | BOOT-01, S11 fleet, S15 policy; snapshot failure must still resolve fallback honestly | M |
| BOOT-06 | Bake equivalent static ground/AO/merge work instead of reproducing it per viewer | `island-system.ts:49-58`; `ground.ts:39-85`; static-merge.ts:131-177 | Scene/asset pipeline emits exact versioned height/AO + premerged static chunks; retain named dynamic/identity nodes | **20–100 ms1× /80–400 ms4× CPU component** [estimate] bounded by brief117 ms warm island span; also removes16 MiB readback and one boot render. GPU stall benefit unisolated; do not claim whole1197 ms cold island saving | None only if raster/half-float output equivalent; compare height grids, lights/labels/AO and island scene; any rebake tolerance needs visual review | M/L | Medium asset version skew | **S12 scene owns this recommendation**, S3 GLB static pipeline; not additive with BOOT-02 | M |
| BOOT-07 | Prepare offscreen first draws / budget deferred compile and construction | `engine.ts:150-165`; `ocean-system.ts:283`; `wake.ts:169-196`; dist4 median u:ocean1045 vs compile113 | Extend preparation coverage to actual offscreen passes and deferred materials; use parallel compile where supported and bounded construction tasks. Do not compile entire scene synchronously after each deferred system if only new programs need preparation | Fast4g **0–200 ms first-frame/fade stall reduction**,4× **0–1000 ms exposure** [estimate] bounded by live u:ocean213–312 and4×1045, not isolated speedup. Scheduling life changes~10–60 /40–240 ms burst shape, not total work | None if same textures initialized before sampled; compare wakes, pool reflections, night, first enabled weather; no missing-pass shortcut | M | Medium driver-dependent behavior | **S7 compile/S10 env own detailed fix**; do not double-count render/shader savings | M hotspot / L isolated gain |
| BOOT-08 | Share parsed static JSON manifests across engine consumers | LOAD `outputs/need-for-speed/load/a-repeat-1.json` records civic manifest2 requests, kit3, crests2, all wire304; `engine/prefetch.ts:24-25`, `fleet/hull-kit.ts:328-330`, `civic-system.ts:136-138,366`, `civic/shipyard.ts:194` | Extend the existing engine-lifetime AssetStore Promise-map pattern to immutable static JSON; route prefetch and consumers through it, keeping each caller's current error/fallback semantics and not caching live API data here | Removes **4 redundant manifest/crest fetch+JSON-consumption operations** versus one per URL in this measured warm visit. Observed redundant body-completion spans about28/39/39/17 ms: **~123 ms aggregate validation exposure**, not123 ms reveal saving. Cold fast4g **0–120 ms critical-path saving** [estimate] from at most~3 serial40 ms waits;4× **0–150 ms** [estimate], network not4×. Fingerprinted immutable URLs remove304s but not repeated res.json work | None if shared manifest values are treated readonly; verify consumers do not mutate shared records and civic/kit/crest output matches | S/M | Low/medium error memoization and accidental shared mutation | **S8 edge owns duplicate-request evidence**; complements fingerprinting, does not double-count removed304 wire time | H duplication / M realized gain |

Priority inside this slice: BOOT-01/02 before adding workers indiscriminately; BOOT-03 for an unusually well-isolated responsiveness win; BOOT-04 for slow-endpoint robustness; BOOT-05 small but deterministic once BOOT-01 exists. BOOT-06/07 belong their scene/shader owners.

## 6. Long tasks >50 ms during observed boot window

### Source-backed task families

| Observed task(s) | Source / causal attribution | Evidence strength |
|---|---|---|
| dev-2 8688.6/86; dev-3 8658.5/54; dev-1 9228.6/372 | Engine/PostChain construction/resize; `engine.ts:70-105`, `post.ts` constructor. | Dev sampled stacks; contended wall time includes native GL. |
| dev-2 15500.6/802; dev-3 14171.8/593; live-2 3278.1/571; live-1 3392.2/675 | Real model/plan install: `sim/system.ts:115-127,140-145`, `sim/plan.ts` buildPlan, `sim/sim.ts` install. | Readable dev stacks; minified method install/rebuild corroborates live; long task is not875 KB JSON parse. |
| dev-1 18427.6/5922; dev-2 16908.7/1305 | First engine frame includes synchronous sim plan/path fallback + composer upload/compile. `engine.ts:199-207`, `sim/system.ts:158-164`. | u:data4919/961 and u:render576/196 plus buildPath/buildPlan/coastDistance/hard samples. |
| dev-3 16389.3/243; live-2 5558.6/454; live-1 5804.9/663 | First frame with prepared sim; ocean offscreen draw + fleet installation/emblem growth + composer render. | Per-system first-update timers; frame stack. Do not attribute entire task to one source. |
| dist4-1 14118.2/5366; dist4-2 6703.1/1649; dist4-3 6290.9/1786 | No-data first frame: offscreen ocean/wake initialization + composer; u:data1 ms excludes data parsing/plan as its cause. | FirstRender5248/1603/1740, u:ocean2603/951/1045, render2014/510/543. |
| dev-1 18040.3/386 and25872.5/107; dev-2 16805.3/103 | Kit decode/bake/BatchedMesh/late yard work and engine compile continuation, `fleet/hull-kit.ts`, `fleet-system.ts:283-301`, `civic-system.ts:218-231`. | Dev stacks; overlapping completion callbacks prevent exact exclusive system attribution. |
| dev-1 25234.1/52 | `life/walkways.ts` buildWalkGraph and Townsfolk construction; `life-system.ts:98`. | Dev sampled stacks; total life init much larger because awaits. |
| dev-2 19293.0/195; dev-3 17561.9/142; live-2 6749.3/153; live-1 7226.0/205 | `identity-system.ts:100`, sightGrid/fittedSpecs, `identity/labels.ts:353-435`; grid/polygon/candidate/LOS search. | Existing identity:labels performance measures and sampled stack agree. |
| Other post-first-frame tasks in inventory | Rendering/native work, late kit/yard/emblem resource construction, life/identity compile. | Exact tasks observed; cannot assign each to a unique TS symbol without startup timeline/source maps. Sampling candidates in summary.json are **[INFERENCE]**, not exhaustive exact attribution. |

### Complete captured inventory

| Run | All observed `start/duration` pairs (ms from navigation / ms duration), strictly >50 ms |
|---|---|
| dev-1 | 250.8/55, 8982.4/163, 9228.6/372, 18040.3/386, 18427.6/5922, 24378.4/423, 25041.2/146, 25234.1/52, 25401.6/234, 25736.2/101, 25872.5/107, 26301.6/154, 26459.3/513, 26973.3/194, 27307.3/86 |
| dev-2 | 8688.6/86, 15500.6/802, 16805.3/103, 16908.7/1305, 18411.6/53, 18627.7/82, 18896.6/77, 18997.8/69, 19083.7/53, 19151.6/59, 19293.0/195, 19488.6/62 |
| dev-3 | 8658.5/54, 14171.8/593, 15134.1/52, 16389.3/243, 17561.9/142 |
| dist4-1 | 75.6/120, 196.9/52, 364.1/154, 608.2/58, 698.5/76, 1643.9/118, 1797.7/230, 2053.8/64, 7456.5/55, 13812.7/305, 14118.2/5366, 19526.4/148, 19675.6/269, 20905.1/544, 21786.3/142, 22033.3/286, 22420.3/236, 22759.6/163, 23125.2/228, 23725.1/61, 23899.8/114 |
| dist4-2 | 223.7/61, 1414.1/56, 1490.4/105, 6534.9/168, 6703.1/1649, 8372.0/62, 8734.9/102, 9044.6/172, 9246.1/86, 9430.6/82, 9624.1/82, 9810.7/101, 10026.1/83, 10113.2/612, 10725.3/140 |
| dist4-3 | 1410.2/56, 1479.2/101, 6125.4/165, 6290.9/1786, 8099.4/59, 8395.0/94, 8654.4/146, 8812.4/89, 9119.0/73, 9283.1/80, 10004.3/188 |
| live-1 | 3392.2/675, 4697.7/83, 5731.9/72, 5804.9/663, 6550.8/63, 6752.0/89, 6857.3/63, 7226.0/205 |
| live-2 | 3278.1/571, 5558.6/454, 6749.3/153 |

Durations are browser Long Tasks API durations, integer ms. Sources are not supplied by that API. The inventory includes the first frame and the captured after-first-frame window, not indefinitely scheduled refresh tasks. Deferred work sometimes finishes after the observer snapshot: dist4-1's **526.7 ms identity:labels measure at24203** is recorded by the measure evaluator, but its eventual long-task callback was absent from that snapshot; dist4-3's **495.6 ms fit at9451.3** likewise has no corresponding delivered entry in the snapshot. Do not silently interpret a missing entry as “no task.” Exact lifetime-complete per-task TS attribution remains a measurement limitation; the measured named fitting spans still prove >50 ms CPU blocks. Stock shot closes the tab after capture; no additional browser was launched to fill this gap.

## 7. Ruled out / not worth it

- **“Defer life and identity until after first frame.” Already shipped**, controlled by `DEFERRED` and `?defer=0`. Further deferral alone saves no first-frame time and may expose missing scenery after fade.
- **“Await all network before CPU.”** All APIs, plot GLBs, kit+atlas and identity assets already have local Promise.all. A global wait-for-all would delay useful CPU and truthful partial availability; overlap preparation along actual dependencies instead.
- **Whole civic/fleet/island deferral:** major temporary scenery/data loss, not marginal. Keep geography/boats and truthful readings at reveal.
- **OffscreenCanvas runtime text rendering:** wrong target for identity; glyph SDF is prebuilt. Worker the fitter, not a nonexistent font rasterizer.
- **Worker JSON.parse solely for875 KB raw stablecoins:** low single-digit ms in S9 bench versus hundreds of ms plan/fitting; serialization/startup can dominate.
- **Whole renderer/scene in a worker, OffscreenCanvas WebGL migration, renderer switch:** out of scope and high lifecycle cost; pure jobs can transfer arrays without moving GL ownership.
- **More warm-leg workers by default:** current min(4,hardwareConcurrency−1) already parallelizes; extra workers on small laptops/shared CPU can slow startup and increase cloned coast/layout memory.
- **Unconditional HTML API preload:** violates the full screen+viewport admission boundary and may duplicate fetches; entry gate is the safer boundary.
- **Remove8 s and reveal instantly on first geometry:** technically honest only if unavailable state is obvious, but an empty fleet can materially change initial reading. Treat as an explicit operator choice, not a no-impact win.
- **Treat boot.compile as all shader work:** actual first-frame ocean/composer uploads and deferred materials remain outside it. S7 owns those details.
- **Promise.all around entire init methods:** parallel scene/material mutation is not a dependency model; may break ground, lights, material application and post.seal invariants. Split pure/async preparation from ordered attachment instead.

## 8. Open questions / decisions

1. May the first reveal show an explicitly unavailable/empty-fleet world after a shorter post-frame wait, or must the current data-first visual promise remain? Default recommendation preserves it; shorter timeout is visual-risk.
2. BOOT-01 should expose a model-version/pose-render readiness contract shared by DataSystem and FleetSystem. S9/S11 own the integration shape; what is measured here is the race and cost, not an implemented fix.
3. Confirm exact/offline ground + label precomputation acceptance at all supported aspects before choosing it over runtime worker fitting. Quantized aspect buckets are not automatically scenery-preserving.
4. **Baseline gap closed by the load owner:** a data-bearing live4× CPU matrix is now available; see Section9. Optimization gains remain estimates until controlled A/B implementation runs. This slice's own4× group remains the requested4173 no-API baseline, not a substitute for the live matrix.
5. Use the load/frame owners' n≥3 baselines for release thresholds, retaining their contention caveats. This slice's own live observer has n=1, but the owner's completed live reveal matrix supplies repeated crossfade and completion observations below. Startup trace/source-map attribution would still close the remaining long-task-source gaps.

## 9. Reused completed load-owner matrix

After this slice's eight captures completed, S1 released its load matrix. The following are **owner-observed n=3 medians**, not additional captures or optimization speedups. Sources: `outputs/need-for-speed/load/summary.json`, configs `c-cold` and `d-cold`; raw `c-cold-{1,2,3}.json` and `d-cold-{1,2,3}.json`. Both are the actual live site, cold fast4g; `d` additionally uses4× CPU. All remain contended. Medians of phase differences were calculated per run, not by subtracting unrelated marginal medians.

| Live cold fast4g group | First frame nav ms | Engine first frame ms | Stablecoin parse observed nav ms | Crossfade nav ms | Poster complete observed nav ms | First-frame→crossfade gap ms | Crossfade→complete gap ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1× CPU, n=3 | 5943.6 | 4368 | 2221.6 | 6088.9 | 7203.9 | 145.3 | 1128.5 |
| 4× CPU, n=3 | 9973.1 | 8289 | 2391.1 | 10215 | 11372.2 | 241.9 | 1322.6 |

Median stablecoin lead over first frame is **3722 ms at1×** and **7582 ms at4×**. Thus no successful-sample data wait is exposed in these groups; an earlier API request alone still predicts **zero normal-case reveal saving here**. It remains useful for genuinely slow endpoints and readiness robustness.

| Median boot span, ms | data init | island init | civic init | fleet init | life init, already deferred | identity init, already deferred | u:data | u:ocean | u:render | entire first frame |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Live cold fast4g1×, n=3 | 1241 | 1259 | 888 | 139 | 184 | 705 | 4 | 211 | 125 | 429 |
| Live cold fast4g4×, n=3 | 1435 | 2626 | 384 | 764 | 365 | 895 | 50 | 807 | 363 | 1577 |

These validate the broad live timing shape of the single instrumented sample, while demonstrating that the no-data4× baseline is not interchangeable with data-bearing boot. Civic's smaller4× elapsed span is not a CPU speedup: cached/prefetched bytes, task readiness and contention change which wait a stage measures. The data-frame race exposure remains independently demonstrated by the slow diagnostic runs, rather than implied by these group medians.


No source implementation was attempted and no A/B speedup is claimed. There is no blocker to the prioritized plan; the listed measurement limits constrain certainty, not the causal source findings.
