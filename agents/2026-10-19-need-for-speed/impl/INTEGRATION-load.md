# Integrated acceptance — load, arrival and lifecycle

Date: 2026-10-19. Main b71dd282 versus branch perf/need-for-speed @ 8ea6f27c. Verification only; no tracked runtime/source edits.

## Verdict

- **58/58 load samples completed their capture contract**, with requested cold n=5 none/cable/fast4g/fast4g+cpu4 and n=3 iGPU, plus immediate-repeat n=3 none/fast4g, per release. This is a capture PASS, **not a quiet-machine performance-budget PASS**. Every arm is contended; timing deltas below are descriptive, not controlled release claims.
- **Blocked-viewport dependency gate PASS** at both requested sizes: branch requests no React, world code/geometry, or API. Only tiny bootstrap plus welcome-page assets load.
- **Static byte gate PASS** against the branch production output.
- W3 PNG sequences and contact sheets were **looked at**. Slow data exposes a boatless world with an awaiting-data toolbar, followed by a single whole-fleet arrival in the sampled sequence. Healthy-path life/identity code is initialized before the first captured reveal on both releases. These images are evidence for operator review, **not operator approval**.
- **Lifecycle follow-up: a genuine remount retainer is attributed and fixed.** The original twelve-cycle branch mounted slope was +579,107 B/cycle; it was not a newly branch-specific regression versus main. Late heap snapshots now identify Three r186's shared DFG lookup texture retaining one disposed renderer per cycle. Releasing that texture before engine teardown holds renderer count at one. A fresh twenty-cycle audio-ON/forced-GC soak observes +21,356 B/cycle mounted over cycles11–19, with a plateau verdict and no console warnings/errors; the slope is not asserted to be zero. See the attribution follow-up below.

## Builds, release-specific origin and environment

Main was built with `npx vite build --outDir /tmp/nfs-main-dist` from `.worktrees/nfs-base`; branch with `npx vite build --outDir /tmp/nfs-branch-dist`. Both succeeded; neither wrote `dist/`. Vite emitted warnings (including Zod pure annotations, the main mixed static/dynamic prelaunch import, and branch immutable-font resolution warnings). Branch static byte verification and browser captures nevertheless completed.

Branch origin: `node scripts/perf/origin.mjs --dist /tmp/nfs-branch-dist --port 4191`. Main origin uses `outputs/need-for-speed/integration/origin-release.mjs` with `NFS_RELEASE_ROOT=.worktrees/nfs-base`, `--dist /tmp/nfs-main-dist --port 4190`.

The origin chooses its API function, env loading and `public/_headers` from the **module-derived source root**, not from `--dist` or current working directory. Main has no harness script. Merely running branch origin from main's cwd would apply the wrong release headers/function. The output-only wrapper explicitly substitutes main's root while retaining branch harness/dependency imports. Main therefore uses main's actual function and headers; branch uses branch's. The wrapper logs only the root, never the API secret. Both production origins were stopped after this lane. The pre-existing branch dev server was not stopped; the peer-owned main dev server was released back to its owner after the baseline soak.

Hardware: AMD Ryzen7 7800X3D,16 logical CPUs; Linux x64; standard Chrome real-GPU ANGLE/Vulkan NVIDIA RTX5070Ti, driver610.57.04. At the start `nvidia-smi` reported39°C,P0,94.39W. The iGPU captures identify AMD Raphael/radeonsi, OpenGL ES3.2. Viewport1600×1000, display/effective requested DPR1. Desktop AC; no battery arm. No sustained thermal plateau or independent GPU/CPU isolation was established. Per-run GPU strings and boot phases are retained. Shared capture lock serialized browser work across verification agents, but other host work continued; `os.loadavg` exceeded the harness ceiling4. See `load-hardware.json` and each summary's machine metadata.

## Load methodology and main fallback

The output-only `load-legacy.mjs` adapts `scripts/perf/load.mjs`, preserving its A/B then B/A alternating rounds, cold cache/storage clears, real production API, completed-response CDP waterfall, network profiles and one lock per capture. A=main4190, B=branch4191. Three invocations cover cold standard profiles, iGPU cold, and immediate repeat. They and peer captures can interleave globally; A/B order **within each matrix** is retained. This is not an isolated quiet run.

Branch requires native `pv:first-frame`, `pv:first-fleet-frame`, renderedRevision>0 and renderedBoats>0. Crossfade is independently observed from `data-pv-live`; removal from disappearance of `#pv-poster`.

Main has no pv marks/coherent readiness revision. A pre-navigation rAF observer records the first publication of `__harbourStats.firstFrameMs` and first publication with `__harbour.systems.find(s=>s.name==='fleet').stats.visible>0`. Those follow completed composer rendering; the visible counter is private runtime frustum-visible boat count, **not complete-fleet revision readiness**. Main's published firstFrameMs itself is constructor-relative, not navigation-relative; it is retained separately as legacyFirstFrameDurationMs. The comparison table uses the navigation-relative observer timestamp. Observation can lag a frame, or longer when the main thread is busy. Tight first-frame/fleet deltas are therefore not measurement-equivalent. Main's raw adapter revision1 is only an explicitly documented validation sentinel; persisted baseline main renderedRevision is null, never claimed as observed. DOM crossfade/removal are measured identically on both.

Repeat samples clear HTTP cache/storage before their seed, seed and revisit under the **same lock**, with1800ms settle. These are immediate HTTP repeat visits, not >60s expiration, cross-deploy, rollback, bfcache or persisted last-good-data evidence. HTTP-cold does not clear driver shader caches. First branch iGPU sample includes3827ms compile and5546ms deferred life initialization; its fleet tail8143ms is retained, not discarded.

## All load observations

Each cell is **median (min–max)**; timestamps are navigation-relative milliseconds; wire is bytes. n is per release/configuration/arm. All samples are contended.

| Release / arm | n | First frame ms | First fleet ms | Crossfade ms | Poster removed ms | Wire B | Requests | 304s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| main none cold | 5 | 3,044 (1,661–3,183) | 3,110 (2,718–3,183) | 3,242 (2,844–3,373) | 4,371 (3,970–4,498) | 7,851,495 (7,850,992–7,851,614) | 149 (149–149) | 4 (4–4) |
| main cable cold | 5 | 3,262 (3,251–5,058) | 3,262 (3,251–5,058) | 3,389 (3,377–5,147) | 4,507 (4,489–6,261) | 7,851,495 (7,850,992–7,851,614) | 149 (149–149) | 4 (4–4) |
| main fast4g cold | 5 | 5,976 (5,967–6,177) | 5,976 (5,967–6,177) | 6,103 (6,078–6,302) | 7,227 (7,194–7,432) | 7,851,495 (7,851,475–7,853,648) | 149 (149–149) | 4 (4–4) |
| main fast4g+cpu4 cold | 5 | 9,381 (9,330–10,444) | 9,381 (9,330–10,444) | 9,643 (9,569–10,673) | 10,843 (10,732–11,970) | 7,851,495 (7,851,475–7,853,648) | 149 (149–149) | 4 (4–4) |
| branch none cold | 5 | 1,302 (1,251–1,436) | 2,472 (2,447–3,417) | 2,473 (2,449–3,418) | 3,595 (3,566–4,549) | 6,833,359 (6,833,289–6,833,366) | 83 (83–83) | 0 (0–0) |
| branch cable cold | 5 | 2,533 (2,508–2,654) | 2,669 (2,645–7,229) | 2,671 (2,646–7,230) | 3,812 (3,772–8,362) | 6,833,359 (6,833,340–6,833,373) | 83 (83–83) | 0 (0–0) |
| branch fast4g cold | 5 | 4,904 (4,901–4,999) | 4,904 (4,901–4,999) | 4,905 (4,903–5,001) | 6,044 (6,027–6,130) | 6,833,359 (6,833,347–6,833,401) | 83 (83–83) | 0 (0–0) |
| branch fast4g+cpu4 cold | 5 | 6,475 (6,445–6,569) | 6,475 (6,445–6,569) | 6,482 (6,452–6,576) | 7,649 (7,608–7,738) | 6,833,359 (6,833,347–6,833,408) | 83 (83–83) | 0 (0–0) |
| main none repeat | 3 | 2,724 (2,604–3,159) | 2,724 (2,604–3,159) | 2,841 (2,730–3,301) | 3,962 (3,851–4,409) | 17,405 (17,405–17,405) | 148 (148–148) | 12 (12–12) |
| main fast4g repeat | 3 | 2,904 (2,883–2,929) | 2,904 (2,883–2,929) | 2,953 (2,949–2,995) | 4,075 (4,075–4,095) | 17,405 (17,405–17,405) | 148 (148–148) | 12 (12–12) |
| branch none repeat | 3 | 1,281 (1,269–1,288) | 2,381 (2,354–2,396) | 2,383 (2,355–2,398) | 3,508 (3,491–3,535) | 7,886 (2,915–43,850) | 82 (82–85) | 2 (2–9) |
| branch fast4g repeat | 3 | 1,303 (1,284–1,317) | 2,445 (2,372–2,464) | 2,446 (2,373–2,465) | 3,576 (3,501–3,595) | 7,890 (2,915–7,891) | 85 (82–85) | 9 (2–9) |
| main igpu cold | 3 | 3,960 (3,190–4,216) | 3,960 (3,190–4,216) | 4,001 (3,451–6,161) | 6,026 (4,593–7,313) | 7,851,475 (7,850,992–7,851,475) | 149 (149–149) | 4 (4–4) |
| branch igpu cold | 3 | 2,096 (1,981–7,518) | 3,327 (2,827–8,143) | 3,329 (2,828–8,151) | 4,498 (3,965–10,673) | 6,833,371 (6,833,347–6,833,371) | 83 (83–83) | 0 (0–0) |


First-fleet median differences (branch minus main; methodological caveat above):

| Arm | Main ms | Branch ms | Delta ms | Delta % |
|---|---:|---:|---:|---:|
| none cold | 3110 | 2472 | -638 | -20.5% |
| cable cold | 3262 | 2669 | -593 | -18.2% |
| fast4g cold | 5976 | 4904 | -1072 | -17.9% |
| fast4g+cpu4 cold | 9381 | 6475 | -2906 | -31.0% |
| none repeat | 2724 | 2381 | -343 | -12.6% |
| fast4g repeat | 2904 | 2445 | -459 | -15.8% |
| igpu cold | 3960 | 3327 | -633 | -16.0% |

**Wire accounting is not first-frame dependency accounting.** The harness sums completed same-origin page-target responses through its post-ready evaluation/timing/capture window, including headers, while excluding partial bodies and unattached worker traffic. Slow/deferred work changes this boundary. Worker/layout bytes can be undercounted; these are not immutable dependency savings. Local origin is HTTP/1.1, not Pages edge transport/cache truth. The independent static ledger below is the byte gate. The main cold304 responses include duplicate civic/kit manifest and crest revalidations within one navigation, not necessarily leftover cache from a previous sample (see iGPU cold1 waterfall).

Raw summaries: `cold-load.json`, `repeat-load.json`, `igpu-load.json`; each links its per-run PNG, JSON, stdout/stderr and detailed waterfall. Baselines: [main-load.json](../../../scripts/perf/baselines/main-load.json), [branch-load.json](../../../scripts/perf/baselines/branch-load.json). Baseline labels normalize to A for future single-origin comparisons, with original sourceLabel retained. They retain contention, machine, GPU, URLs/configurations, method caveats, per-run data and distributions. They are **contended reference evidence**, not approved quiet thresholds.

## Blocked viewport

Cold navigation,3000ms settle, one sample per cell; median=min=max. Site-only completed CDP bytes including headers:

| CSS viewport | Main bytes / requests | Branch bytes / requests | Branch React/world/API |
|---|---:|---:|---|
|700×500|215,621 /10|145,068 /9|0 /0 /0|
|1100×560|273,252 /10|202,699 /9|0 /0 /0|

Main entry+React costs75,568 wire B; branch bootstrap4,149B. Branch makes no rendering-vendor/world chunk, geometry or API requests and has no engine. Fonts, shell CSS and illustrative poster are intentionally present; larger viewport selects poster1600 rather than960. Both branch welcome screenshots were looked at: readable two-column welcome/illustration, scrollable content; no live canvas masquerades as data. Source `blocked.json` also recorded an injected browser-extension script13,160B; its raw top-level totals include that unrelated traffic. `blocked-site.json` explicitly excludes it; all figures above are site-only. PNGs: `blocked-{main,branch}-{700x500,1100x560}.png`.

## W3 operator-review filmstrips

All sequences use the same existing shared real-GPU browser/capture lock,1600×1000@1, normal motion, `?t=12&view=heart&intro=0`. PNGs are optimized-lossless CDP screenshots. They target fixed navigation/reveal times but cannot force an unavailable browser frame during a main-thread stall: actual observation times and target drift are saved in `report.json`/`timings.json` and printed on contact sheets. These are live-data trials, not deterministic same-snapshot goldens; boat routes/data and private clocks can differ. No still-equivalence claim is made.

### Slow stablecoins

[Contact sheet](../../../outputs/need-for-speed/integration/filmstrip-branch-slow/contact-sheet.png), PNGs `filmstrip-branch-slow/000.png`…`018.png`:19 frames targeting0…9000ms at500ms spacing. A pre-navigation fetch wrapper delays **only** `/api/stablecoins` by6000ms before issuing the real fetch; all other network data remains real and unmodified. No fake response or runtime-source edit.

Looked observations: poster/guide persists through frame6 (~3001ms); crossfade starts3292ms. Frame7 (~3501ms) visibly transitions to the empty working harbour; the guide's status is “Waiting for the fleet’s readings.” Poster is removed4423ms. Frames9–15 (~4501…7501ms) show the complete scenery/yard, people/sea labels and empty water rather than partial live boats. The toolbar reads **“awaiting data”**; the guide's role=status disappears with the arrival shell, but the awaiting-data toolbar remains. There is no added decorative pending fog claim: normal world weather continues. Native first-fleet mark8038ms; frame16 at8087ms reports **283 boats, revision1**, versus0/revision0 at7501ms. Frames17–18 remain283/revision1 and show live toolbar/fleet. At this sampling resolution it is one whole-fleet arrival, not a staged fraction. This does not prove every intermediate render between samples, nor imply a valid zero-boat response is pending.

The target0 frame is actually65ms; early500/1000/1500ms captures arrive357/107/129ms late during boot. From2000ms onward drift is about0.5–1.6ms except the fleet-adoption frame (+87ms). Actual timing is preserved, not relabelled as exact500ms capture.

### People, gulls and sea labels versus main

[Main contact sheet](../../../outputs/need-for-speed/integration/filmstrip-main/contact-sheet.png), [branch contact sheet](../../../outputs/need-for-speed/integration/filmstrip-branch/contact-sheet.png). Each has17 PNGs targeting reveal+0…4000ms at250ms intervals; `details-{people,gulls,labels}.png` supplies six selected crops per release, also looked at.

Main crossfade3231ms, poster removed4354ms; first screenshot is +301ms and last+4100ms. Main target drift100–353ms means the very first0–250ms interval is **not captured**; do not claim exact onset there. Branch crossfade2391ms, poster removed3520ms; first screenshot+43ms, last+4004ms, target drift3–56ms. The main thread/PNG pipeline cannot provide an exact missing main reveal frame; this is an explicit temporal-evidence limitation.

Sea labels “THE SHOALS”/“THE ROADS” are already visible in the first legible working-world frames on both, persisting through the sequence; branch's first frame still blends the warm poster over the cooler live scene. Neither sequence shows a later scene-wide label/inhabitant pop in the inspected0–4s window. Boat motion and ordinary clouds/water continue. People and gulls are very small at heart framing; the crops **do not establish individual pixel-level first appearance**, especially gulls against distant sky. Runtime boot evidence independently shows life and identity initialized by the first captured reveal in both: main life104ms/identity214ms; branch287ms/186ms (durations, not navigation timestamps). Therefore this healthy desktop run exposes **no measurable post-reveal initialization delay** from lazy modules, but is not proof that slower network/GPU paths preserve every person's/gull's onset. Default branch uses lazy wrappers; `?defer=0` was not used. Operator review remains required for both W3 trials.

Capture-driver corrections: an initial driver left its CDP connection alive after finishing files; completed captures were retained but processes later timed out/cancelled. The driver now closes its tab, releases the shared lock and exits without closing the shared browser. A600s batch expired while awaiting the slow sequence after the healthy sequences had completed; slow sequence was subsequently captured successfully. Final PNG/report pairs and contact sheets are the corrected completed artifacts; these harness-driver exits are not application failures.

## Lifecycle soak and baseline comparison

Branch command: `CI=false node scripts/perf/soak.mjs --origin http://localhost:5173/ --out outputs/need-for-speed/integration/soak --cycles 12 --refreshes 3 --settle 3000 --warmup 3 --audio --gc --machine contended`. Twelve viewport deny/readmit cycles, 36 seven-endpoint refresh batches, sound ON via trusted CDP gesture, 3000 ms mounted/disposed settles; forced GC before samples. One tab, not navigation between cycles. Branch requires a coherent newer rendered revision after each refresh and confirms worker/audio cleanup. Main was run against peer-owned main dev :5181 with identical parameters via output-only `soak-legacy.mjs`.

Main lacks branch readiness/revision hooks. Its closest equivalent waits all systems ready+first completed frame+FleetSystem visible>0; after feed.refresh resolves, two rAFs, renderer frame advance and visible>0. This is not a coherent-revision assertion. Its disposal flag+removed canvas is used because main retains `window.__harbour` until remount. No sound shutdown was manually added: that would hide main's actual lifecycle behavior. GC, tab, viewport, refresh count, audio gesture and settles are otherwise the same.

Post-warmup cycles3–11, **n=9 per phase**, median(min–max); logical counts are not resident VRAM:

| Release / phase | n | Geometries | Textures | Programs | JS heap B | Worker targets | Tracked workers | Open audio contexts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| main mounted | 9 | 83 (83–83) | 51 (51–51) | 102 (102–102) | 90,547,252 (58,860,736–121,028,804) | 0 (0–0) | 0 (0–0) | 8 (4–12) |
| branch mounted | 9 | 83 (83–83) | 54 (54–54) | 67 (67–67) | 38,001,276 (36,215,580–40,521,548) | 1 (1–1) | 1 (1–1) | 1 (1–1) |
| main disposed | 9 | 35 (35–35) | 5 (5–5) | 15 (15–15) | 84,437,776 (52,939,604–115,297,152) | 0 (0–0) | 0 (0–0) | 8 (4–12) |
| branch disposed | 9 | 6 (6–6) | 3 (3–3) | 6 (6–6) | 28,619,488 (26,882,360–29,921,320) | 0 (0–0) | 0 (0–0) | 0 (0–0) |

Trend algorithm uses the late half, cycles7–11 (**n=5**), endpoint medians and a fitted slope:

| Release/phase | Heap first→last B | Delta B | Slope B/cycle | Harness verdict |
|---|---:|---:|---:|---|
|main mounted|90,547,252→121,028,804|+30,481,552|+7,558,468|growth|
|main disposed|84,437,776→115,297,152|+30,859,376|+7,687,610|growth|
|branch mounted|38,001,276→40,521,548|+2,520,272|+579,107|growth|
|branch disposed|28,619,488→29,921,320|+1,301,832|+299,036|plateau by5% tolerance, **positive slope remains**|

Branch geometry/textures/programs and workers/audio plateau late; worker1 mounted→0 disposed, running audio context1→0. Main has0 workers but accumulating running audio contexts:1 in cycle0,12 in cycle11, including disposed phase; late8→12 (+1/cycle). Main disposed logical resources35 geometry/5textures/15programs vs branch6/3/6. Nonzero disposed renderer.info counters alone do not prove resident GPU leaks or complete release.

Main therefore establishes that large lifecycle growth/audio retention pre-exists; branch mounted heap slope is about92% lower. It does **not** establish the retaining type of branch's smaller residual growth, nor a production heap plateau (both are dev origins). Parent's conditional heap-snapshot/allocation follow-up was contingent on branch-specific growth; the main comparison does not establish branch-specific growth, so no snapshot/type attribution is claimed. Branch soak logged one resource502; refresh error assertions did not abort. Main logged no console errors. Raw evidence: `soak/{summary.json,capture.json,capture.log,capture.png}` and `soak-main/{summary.json,capture.json,capture.log,capture.png}`.

### Residual heap attribution and fix — twenty-cycle follow-up

This follow-up supersedes the original lane's **no snapshot/type attribution** limitation above; the original main comparison remains unchanged. It uses the isolated branch worktree's own Vite server at `http://127.0.0.1:5197/`, not the maintained development server. All captures share the existing standard real-GPU browser and global capture lock. GPU: ANGLE/Vulkan NVIDIA RTX5070Ti. Both viewport1600×1000@1 and lifecycle parameters match the original lane: three seven-endpoint refresh batches per cycle, sound ON, 3000ms mounted/disposed settles, forced GC, warmup3. These are contended development-origin observations, not production or quiet-machine budgets.

Four captures were performed: twenty-cycle snapshot runs before/after the fix, and independent unmodified `scripts/perf/soak.mjs` twenty-cycle controls before/after. The output-only `heap-slope/capture.mjs` imports `connectShared`/`captureLock` and executes the existing `trackResources` and `runSoak` functions directly from `soak.mjs`; it does not launch a browser or replace feed data. A Node-side CDP binding writes `HeapProfiler.addHeapSnapshotChunk` events at mounted and disposed cycles7,11,19, immediately after each sample's forced GC. Snapshot samples are intrusive and are reported separately from the uninstrumented controls.

**Retainer, not just a slope:** pinned `three@0.186.0` creates one module-scoped `DFG_LUT` in `renderers/shaders/DFGLUTData.js`. `WebGLRenderer` assigns that texture to physical-material `uniforms.dfgLUT`. Each renderer's `WebGLTextures` registers its own texture-dispose callback; `WebGLRenderer.dispose()` does not dispose this shared texture. Heap paths show:

```text
Three module context.lut → DataTexture(DFG_LUT) → _listeners.dispose[]
  → onTextureDispose → context.info.programs[] → WebGLProgram
  → getUniforms/getAttributes closure context.renderer → disposed WebGLRenderer
```

The custom snapshot analysis compares constructor counts and computes strong-edge dominators, excluding weak edges. Retained-byte figures below are that analysis's estimates, including reachable native backing, not CDP `JSHeapUsedSize` or resident VRAM:

| Disposed snapshot observation | Before cycle7→19 | Fixed cycle7→19 |
|---|---:|---:|
| WebGLRenderer objects | 8→20 | 1→1 |
| Shared DFG texture dispose listeners | 8→20 | 0→0 |
| Shared DFG texture retained bytes | 845,796→2,303,904 | cycle19:684 |
| AssetStore / Scene / FiberNode counts | 1/21/1→1/21/1 | 1/21/1→1/21/1 |
| HTMLCanvasElement objects | 9→13 | 3→3 |

Before the fix, cycles7→19 also accumulate twelve native WebGL2 contexts,84 native WebGL programs,1356 uniform locations and1224 anonymous closures. The shared LUT listener array alone retains an additional1,458,108 B. This is a real unbounded renderer-listener lifetime bug, not an AssetStore/JSON/emblem cache, worker-message queue, React-root accumulation or an accumulating open AudioContext. The independent unfixed twenty-cycle control emits six “Too many active WebGL contexts” warnings despite satisfying the harness's heap tolerance.

**Minimal source fix:** `Engine.dispose()` reads the actual DFG texture from rendered scene materials' renderer properties and disposes it once **before** systems dispose materials and before renderer properties are cleared. Importing Three's separate `src` helper would address a different singleton than the compiled Three package. This changes teardown only: no shaders, texture contents, render order, data mapping, scenery or motion change. The texture is shared; an overlapping still-live renderer may reupload identical lookup bytes on its next draw. It is not a per-renderer ownership API. The regression test exercises three remounts, material arrays, shared texture reuse, cleanup ordering and idempotent teardown.

Independent uninstrumented controls used:

```sh
CI=false node scripts/perf/soak.mjs --origin http://127.0.0.1:5197/ \
  --out outputs/need-for-speed/heap-slope/{control,after} \
  --cycles 20 --refreshes 3 --settle 3000 --warmup 3 --audio --gc --machine contended
```

Each output directory denotes a separate invocation. An initial invocation with inherited CI settings exited78/SKIP; only completed `CI=false` captures supply the following results. Harness late window is cycles11–19, n=9; endpoints below are its first/last three-sample medians:

| Run / phase | Heap endpoint medians B | Delta B | Fitted B/cycle | Verdict |
|---|---:|---:|---:|---|
| Before mounted | 39,570,820→40,211,868 | +641,048 | +110,903 | plateau by tolerance |
| After mounted | 38,155,168→38,337,424 | +182,256 | +21,356 | plateau |
| Before disposed | 29,938,216→31,067,828 | +1,129,612 | +175,528 | plateau by tolerance |
| After disposed | 28,741,224→29,272,120 | +530,896 | +75,317 | plateau |

The comparable twenty-cycle mounted slope falls80.7%; disposed falls57.1%. The earlier +579,107 B/cycle twelve-cycle observation uses a different window/run and must not be treated as a controlled fix delta. In the fixed uninstrumented run, mounted slope flattens from +206,351 B/cycle at cycles7–11 to +21,356 at11–19 and +9,429 at15–19. Mounted worker/audio counts remain1/1 and disposed0/0. Late logical resource counts are mounted80geometry/54texture/67program and disposed6/2/6; the removed disposed texture is the DFG LUT. The fixed uninstrumented run records **no console warnings or errors**, including no context-limit warning.

Residual growth is not declared zero: the fixed snapshot diff's largest named additions are V8 `InstructionStream` (+928,128 B), `TrustedByteArray` (+232,532 B) and `FeedbackVector` (+79,612 B), rather than additional renderers or growing asset stores. Both snapshot arms also show +600 native `Text` nodes (+48,000 B) rooted through document internals around repeatedly cloned viewport-denial markup; no app-owned accumulating callback was established for those native nodes. The dev-only `window.__harbourUI` also retains **one** disposed store/engine until remount, explaining why fixed disposed renderer/AssetStore counts are one, not zero. These observations do not establish an arbitrarily long production/native-memory plateau, but they distinguish remaining warm-code/native bookkeeping from the proven renderer-listener leak now removed.

Evidence under `outputs/need-for-speed/heap-slope/`: `before/` and `fixed/` contain six `.heapsnapshot` files plus `samples.json` each; `mounted-diff.json`, `disposed-diff.json`, `fixed-mounted-diff.json`, `fixed-disposed-diff.json` preserve constructor/retainer/dominator results; `comparison.json` records exact slope windows; `control/summary.json` and `after/summary.json` retain the independent harness reports/capture artifacts. `capture.mjs` and `analyze.mjs` are output-only diagnostic drivers, not runtime code. Targeted verification: `npx vitest run src/harbour/engine/engine.test.ts` **10/10 PASS**; `npx tsc --noEmit` PASS; `npx eslint src/harbour/engine/engine.ts src/harbour/engine/engine.test.ts` PASS. The isolated :5197 server was stopped after capture.

## Static first-frame byte gate

Exercised `npm run perf:bytes -- --dist /tmp/nfs-branch-dist --json outputs/need-for-speed/integration/bytes.json`; exit0/PASS:

| Ledger | Measured B | Budget B |
|---|---:|---:|
|First-frame stored|6,170,329|6,465,073|
|First-frame gzip body estimate|4,542,958|4,765,946|
|First-frame Brotli body estimate|4,428,868|4,646,869|
|Full harbour media stored|23,513,514|24,689,190|

This is deterministic stored/estimated text transport accounting, not observed CDN wire bytes. No live-CDN or release-retention/rollback result is implied. The later lifecycle follow-up above is the only runtime fix described in this report.
