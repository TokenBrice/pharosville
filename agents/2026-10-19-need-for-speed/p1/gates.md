# GATES — perf measurement + regression-gate tooling for the Need-for-Speed program

Slug `gates` · 2026-10-19 · base `main` @ b71dd282 · research only, no tracked files touched.

## 1. Scope + method

Read (fully or in the cited ranges): `scripts/harbour/shot.mjs`, `scripts/harbour/shared-browser.mjs`,
`scripts/bundle-budgets.mjs`, `scripts/check-bundle-size.mjs`,
`scripts/pharosville/validate-deploy-gate.mjs`, `scripts/pharosville/validate-changed.mjs` (paths/lanes),
`scripts/pharosville/validate-runtime-media.mjs`, `scripts/smoke-live.mjs`, `scripts/pharosville/smoke-local-api.mjs`,
`scripts/pharosville/generate-runtime-facts.mjs` (check mode), `.githooks/pre-push`,
`.github/workflows/deploy-cloudflare.yml`, `.github/workflows/canary-smoke.yml`,
`playwright.config.ts`, `playwright.dist.config.ts`, `tests/helpers/playwright-config.ts`,
`tests/visual/harbour-dom.spec.ts`, `src/harbour/engine/engine.ts`, `src/harbour/engine/governor.ts`,
`src/harbour/app/harbour-app.tsx`, `src/harbour/app/poster.ts`, `vite.config.ts`, `public/_headers`,
`docs/pharosville/TESTING.md`, `docs/pharosville/RUNTIME_FACTS.md`, relevant `package.json` scripts.
History: the retired Garden perf gate `scripts/pharosville/preview.mjs` was recovered in full from
commit `9dd34ff8` ("teach the deploy gate to measure the settled still frame") — it is the direct
precedent for everything proposed below.

No browser captures were run by this slice (not a designated measurement owner; machine contended by
~18 agents; every claim below is grounded in source or in the orchestrator brief's baseline numbers).
One peer artifact is incorporated: S1LoadBaseline's production-faithful local origin
`outputs/need-for-speed/load/server.mjs`, now running at http://127.0.0.1:4180/ (named service
`nfs-load-origin`): serves the shared `dist/`, applies all of `public/_headers` plus the
Cloudflare-observed default (`max-age=60, must-revalidate`) for unlisted paths, compresses text, and
runs the real bundled `functions/api/[[path]].ts` with the server-side key (`/api/stablecoins`
verified 200 / 874,800 B). HTTP/1.1, no edge cache — not a CDN baseline. `NFS_DIST` selects a variant
dist. It stays up for the program's duration.

## 2. Inventory: what exists, what it measures, where the gaps are

| Tool | Measures (verified in source) | Gaps for this program |
| --- | --- | --- |
| `scripts/harbour/shot.mjs` (`npm run preview`) | ONE real-GPU capture through the shared browser: rAF frame-time p50/p95/max + fps over `--seconds` (shot.mjs:244-248, 265-280); full `window.__harbourStats` snapshot incl. `boot` per-system ms + `compile` + `firstRender` + first-frame `u:*` update costs (engine.ts:123-145, 198-211); `load.firstFrameNavMs` (rAF-polled `waitForFunction`, shot.mjs:188), `firstFrameMs`, nav timing (ttfb/DCL/load), `wireBytes`/`wireBytesAtFirstFrame` (CDP `encodedDataLength`, shot.mjs:131-134, 190); `--cold` (clears whole profile cache + origin storage, 135-138); `--throttle fast4g\|cable` (83-88, 139-144); `--cpu-throttle`; `--waterfall` (per-request start/resp/end, priority, wire bytes, cache-control, encoding, cached, protocol); `--log-requests` (requests, `apiRequests`, `transferBytes`); `--profile`/`--steady-profile`/`--heap-sample`/`--trace`; `--eval`/`--init-script`; `--igpu` (refuses non-AMD GPU), `--uncapped`; refuses software renderer with exit 78 (219-226); `--json` report writer (297) | Single run, no aggregation: no N-run medians, no baseline diff, no thresholds/`--assert` mode; measures the first *rendered* frame, not the perceived-live poster crossfade (see GATES-05); `webgpuAdapter` field reports the WebGL string — bug (GATES-06); default URL `:5190` stale (73); no longtask observer built in (possible via `--init-script`) |
| `scripts/harbour/shared-browser.mjs` | ONE persistent real-GPU Chrome per profile (`standard`/`uncapped`/`webgpu`/`igpu`/`igpu-uncapped`, ports 9333-9337, shared-browser.mjs:11-17); mkdir lock serializes every capture across all processes (101-113) | None for its job — but serialization means a harness must run captures sequentially, and wall-clock numbers on this shared machine are *contended* by definition |
| `scripts/bundle-budgets.mjs` + `check-bundle-size.mjs` | Raw+gzip budgets per named chunk (entry 64/24 KiB, harbour-app 1020/352, vendor-rendering 960/276, css 28/7) + aggregate JS (2260/724 KiB) + forbidden WebGPU chunks; re-baseline discipline documented in comments; enforced in `validate` (build → check) and deploy gate | JS/CSS only. **No byte budget for first-frame wire bytes, `public/harbour` media (island.glb.gz 2.56 MB gz, emblems.avif 1.48 MB, sea-sdf.webp 823 KB, poster), layout.json, fonts, or `/logos`** (GATES-04) |
| `scripts/pharosville/validate-runtime-media.mjs` | Existence + structural sanity (PNG/JPEG/WebP/SVG containers, glTF header) of every referenced media file; retired-pattern check | Never checks **size** — a doubled atlas passes |
| `scripts/pharosville/validate-deploy-gate.mjs` | Local equivalent of the CI pre-deploy jobs + the three-outcome perf verdict machinery: `PERF_TRIPWIRES` loop with SKIP=78 semantics (`PREVIEW_SKIP_EXIT_CODE`), `PASS_PERF_SKIPPED` vs `PASS` greppable verdict token, GHA warning + step summary (34-100). Run by `.githooks/pre-push` on `main` pushes | **`PERF_TRIPWIRES = []`** (line 34): every run since the Harbour cutover says PASS_PERF_SKIPPED. The socket exists; no Harbour tripwire is plugged in (GATES-01) |
| Retired `scripts/pharosville/preview.mjs` (git `9dd34ff8`, Garden era) | The full precedent: `--assert` gate with thresholds (p90 ≤ 20 ms, draw calls ≤ 700, geometries ≤ 500, textures ≤ 72, triangles ≤ 500 k, tier `full`), 3-read **median** for noise immunity, settled-static arm ("unsettled is SKIP, never PASS"), shader-error console tripwire (a silently rejected material leaves every counter green), refresh-cost probe (longtask + V8 profile + trace attribution) | Retired at the Harbour cutover; read `window.__pharosVilleDebug`, which no longer exists. Its *structure* (thresholds file → assert command → SKIP/FAIL/PASS) is exactly what the Harbour needs, now reading `__harbourStats` |
| `tests/visual/harbour-dom.spec.ts` + both playwright configs | DOM/a11y contract only, "never pixels" (spec header 4-5); dist lane on :4174 (`playwright.dist.config.ts:41-46`); reference-hardware mode `PHAROSVILLE_REFERENCE_GATE=1` with real Chrome + `--render-node-override` (`playwright.config.ts:38-63`); CI Chromium launches `--disable-webgl` deliberately | **No pixel comparison anywhere in the repo** — nothing can verify "marginal visual impact" claims automatically (GATES-08) |
| `.github/workflows/deploy-cloudflare.yml` + `canary-smoke.yml` | CI: `validate` (incl. build + bundle-size) + dist DOM lanes in the Playwright container + deploy + live smoke; daily canary = API contract/freshness/security headers | **No GPU in CI** (workflow comments 48-50; TESTING.md 84-95): no frame-time or cold-load gate can ever run there. Bundle budgets are CI's only perf-adjacent gate |
| `src/harbour/engine/engine.ts` — `__harbourStats` | `boot` map: per-system init ms (130-133), `compile` (143), deferred systems' init ms recorded when they land post-first-frame (154-158), first-frame `u:<system>` update ms + `u:render` + `boot.firstRender` (198-211); `firstFrameMs`, drawCalls/triangles/textures/programs, dpr, quality, hour (214-225); `?prof=1` → per-frame lap table `__harbourProf` (19-21, 228-264); `?defer=0` A/B (126) | No mark for the poster→world crossfade moment; `u:*` sampled only on frame #1; no memory footprint stat |
| `src/harbour/engine/governor.ts` | Honest GPU ms via `EXT_disjoint_timer_query_webgl2` under vsync (103-129); internal p10 `lowTail()` for decisions (173-178); `?dpr=`/`?quality=` pinning for gate captures (44-48) | Published `stats.gpuMs` is the **latest sample**, not the p10 the governor itself trusts — a single-read capture can catch a back-pressure spike (GATES-07) |
| Determinism knobs (scattered) | `?t=` (time-of-day.ts:126-130), `?view=heart\|overview` (layout-system.ts:47-50), `?dpr=`, `?quality=`, `?defer=`, `?prof=1`, `?life=0` (life-system.ts:53), `?cloud=`/`?wind=` (sky-system.ts:199-202), `?season=`, `?intro=0`; `navigator.webdriver` already suppresses the intro overlay (CornerMark.tsx:13-15) | Not documented in one place; world *state* still varies with live `/api` data (boat placement, weather bands) on 5173/4180/live — no frozen-data fixture mode for byte-identical repeat runs |
| Serving origins | dev :5173 (unminified + `/api`), dist :4173 (minified, **no `/api`** — `localPharosVilleApiProxy` is `apply: "serve"`, `configureServer` only, vite.config.ts:18-22; vite preview also ignores `public/_headers`), live site (real CDN+API, uncontrolled), **S1's :4180** (dist + `_headers` + CF-default revalidation + real `/api`) | Gap (f) from the task brief is **closed** by :4180 — adopt it as the harness default target; keep live-site spot checks for CDN truth (HTTP/2 + edge) |

Post-publication addendum (verified from peer evidence `outputs/need-for-speed/frame/diagnostics/igpu-noon-r1.log`,
S2FrameBaseline, 2026-10-19): shot.mjs's broad-category `--trace` (categories at shot.mjs:242) can exceed
V8's max string length at `JSON.stringify(traceChunks)` (shot.mjs:263) on a 5 s uncapped iGPU window —
`RangeError: Invalid string length`, and because it throws outside the try/catch paths the `uncaughtException`
handler (shot.mjs:125) exits the whole capture, losing the PNG and the `--json` report too. The harness
therefore avoids `--trace` (or restricts categories to `devtools.timeline,v8,disabled-by-default-v8.gc`,
S2's workaround) until trace chunks are streamed to disk incrementally. See GATES-14. Two further
measurement-validity caveats from the same peer runs: `fps` divides by the requested `--seconds`
rather than the actual rAF window span (shot.mjs:279), and under `?prof=1` `stats.programs` /
`stats.textures` are never refreshed after frame #1 (`profiledFrame`, engine.ts:254-261) — read
`ctx.renderer.info` for live values; see GATES-15. Third caveat: with `--heap-sample`+`--trace`
combined, the samplers' own teardown produces one MajorGC after the CPU profile endTime but inside
the still-recording trace (stop order at shot.mjs:249-263) — not a steady-state pause; see GATES-16.

### Missing-capability checklist (task brief items a–g)

- (a) Byte budgets: **missing** for wire bytes and media; only JS chunk budgets exist → GATES-04.
- (b) Scripted repeatable cold-load benchmark: **missing** (all primitives exist in shot.mjs) → GATES-02.
- (c) Steady-state frame matrix standard+iGPU with gpuMs: **missing** (profiles + `--igpu` + `--uncapped` exist; no matrix/median/baseline) → GATES-03.
- (d) Boot-phase timing breakdown: **exists** (`stats.boot`) but ephemeral — only inside a one-shot report; no persistence or diff → captured by the harness summary (GATES-10).
- (e) Visual-equivalence check: **missing entirely** → GATES-08.
- (f) Production-faithful local origin: **closed** by S1's `:4180` (adopt + later make tracked) → GATES-09.
- (g) CI feasibility: no GPU in CI, permanent (TESTING.md 84-95, workflow comments). Perf gates belong in `validate:deploy-gate` (pre-push, real hardware); CI can only get **static** byte budgets computable from `dist/` + `public/` without a browser → GATES-04.

## 3. Proposed harness (plan step 0) — minimal and boring, shot.mjs is the only browser driver

Nothing below launches a browser itself; everything shells out to `npm run preview -- …` so the
shared-browser lock, real-GPU refusal (exit 78) and single-foreground-tab guarantees are inherited.
New files live in `scripts/harbour/perf/`, scratch output in `outputs/need-for-speed/<slug>/`.

### 3.1 Commands

```
node scripts/harbour/perf/cold-load.mjs  --origin http://127.0.0.1:4180 --runs 5 [--arm cold|warm] [--throttle fast4g] [--cpu-throttle 4]
node scripts/harbour/perf/steady.mjs     --origin http://127.0.0.1:4180 --runs 3 [--matrix standard,igpu] [--view heart]
node scripts/harbour/perf/report.mjs     --baseline outputs/…/summary.json --current outputs/…/summary.json   # delta table, exit 1 on budget breach
node scripts/harbour/perf/visual-diff.mjs --origin http://127.0.0.1:4180 --golden tests/visual/goldens/heart-t12.png   # phase 2
npm run perf:bytes                       # (proposed here as check:first-frame-bytes) static, CI-safe: parses dist/index.html preloads + dist asset sizes
```

- `cold-load.mjs`: N sequential shot.mjs runs with `--cold --throttle fast4g --json --waterfall
  --seconds 1 --wait 500`, URL pinned `?t=12&view=heart` (+ `?intro=0`), `--ready-timeout 90`.
  Warm arm: same without `--cold`. Collects `load.*`, `stats.boot`, `waterfall`, `consoleErrors`.
- `steady.mjs`: per profile in matrix: `--profile-args` (`--igpu --uncapped` / `--uncapped`) with
  `--wait 6000 --seconds 6`; reads p50/p95/max, fps, and polls `stats.gpuMs` once per second across
  the window to compute a **p10/p50 of gpuMs** in the driver (no engine change needed; GATES-07).
- Both write `runs/*.json` + one `summary.json`; medians across runs, plus min/max for spread.
- Gate wiring (GATES-01): add to `PERF_TRIPWIRES` in `validate-deploy-gate.mjs`:
  `node scripts/harbour/perf/steady.mjs --runs 3 --gate` (fast arm, ~1 min) — SKIP=78 already flows
  through `PREVIEW_SKIP_EXIT_CODE`. Cold-load stays a bench command (too slow / too
  network-sensitive for pre-push), gated instead by its byte budget (below).

### 3.2 `summary.json` schema (one doc per benchmark invocation)

```jsonc
{
  "meta": { "tool": "cold-load|steady", "origin": "http://127.0.0.1:4180", "url": "/?t=12&view=heart",
            "git": "<sha>", "date": "ISO", "dist": "shared|<variant>", "machine": "contended|quiet",
            "runs": 5, "throttle": "fast4g", "cpuThrottle": null },
  "load":  { "firstFrameNavMs":   { "med": 0, "min": 0, "max": 0 },      // median across runs
             "firstFrameMs":      { "med": 0 },                          // engine-internal
             "crossfadeNavMs":    { "med": 0 },                          // NEW: data-pv-live attr (GATES-05)
             "ttfbMs": { "med": 0 }, "domContentLoadedMs": { "med": 0 }, "loadMs": { "med": 0 },
             "wireBytesAtFirstFrame": { "med": 0 }, "wireBytes": { "med": 0 } },
  "boot":  { "u:render": { "med": 0 }, "compile": { "med": 0 }, "<system>": { "med": 0 }, "…": {} },
  "steady":{ "p50Ms": { "med": 0 }, "p95Ms": { "med": 0 }, "maxMs": { "med": 0 }, "fps": { "med": 0 },
             "gpuMsP10": { "med": 0 }, "gpuMsP50": { "med": 0 },          // polled stats.gpuMs
             "drawCalls": { "med": 0 }, "programs": { "med": 0 },
             "textures": { "med": 0 }, "triangles": { "med": 0 }, "quality": "high", "dpr": 1 },
  "waterfallTop": [ { "url": "/harbour/island.glb.gz", "start": 0, "end": 0, "wire": 0, "cached": false } ],
  "consoleErrors": { "count": 0, "sample": [] },
  "budgets": { "checked": [ { "id": "cold.firstFrameNavMs", "value": 0, "max": 0, "pass": true } ] }
}
```

### 3.3 Thresholds (initial values = orchestrator baseline + headroom; ratchet like bundle budgets)

| Budget id | Ceiling (initial) | Rationale |
| --- | --- | --- |
| `cold.firstFrameNavMs` (fast4g, :4180) | measured-median × 1.15 | baseline to be set by S1's cold run; re-baseline only with a measurement (bundle-budgets discipline) |
| `bytes.firstFrameWire` | measured + 5 % | locks every load win; the static CI proxy (below) covers the no-browser case |
| `steady.p95Ms` (standard, uncapped) | 20 ms | Garden gate precedent (9dd34ff8) — one dropped vsync frame of headroom at 60 Hz |
| `steady.p50Ms` (igpu, uncapped) | measured + 15 % | iGPU arm catches the class of regression the RTX card hides; governor would otherwise silently step quality down (invisible scenery change) |
| `steady.drawCalls` / `programs` / `textures` / `triangles` | 107 / 107 / 56 / 1.28 M | today's 97/97/51/1.166 M (brief) + ~10 % |
| `visual.meanDelta` (phase 2) | 1.0 /255 mean, 0.5 % pixels > 25 | tuned on a known-good pair before enforcement |

Static CI-safe byte gate (`check:first-frame-bytes`): parse `dist/index.html` modulepreloads +
fetch-preloads, stat those files in `dist/` + `public/harbour/`, compare against a budgets file —
pure `node:fs`, runs in the `validate` job with no GPU. Media budgets (island.glb.gz, emblems.avif,
sea-sdf.webp, poster-1600, layout json) live in the same file.

### 3.4 Effort

Core (cold-load + steady + report + budgets + gate wiring + static byte gate): **M** — ~1 day of
careful scripting, all duplication of existing patterns (bundle-budgets, validate-deploy-gate,
generate-runtime-facts `--check`). Crossfade metric: **S** (init-script MutationObserver on
`document.documentElement[data-pv-live]`, poster.ts:16). Visual-diff: **M** (sharp already in
devDependencies; hand-rolled RGBA delta, no new deps; goldens decision needed). Fixing the
`webgpuAdapter` bug: **XS**.

## 4. Findings table

| ID | opportunity | evidence | proposed change | expected gain | visual impact | effort | risk | deps/conflicts | confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GATES-01 | No automated perf gate: `PERF_TRIPWIRES = []`, every deploy gate says PASS_PERF_SKIPPED | validate-deploy-gate.mjs:34, 67-72; TESTING.md:92-95 | add `steady.mjs --gate` (+ optional cold byte budget) to PERF_TRIPWIRES; SKIP=78 semantics already implemented (37, 78-83) | converts the program's wins from one-off measurements into enforced ceilings — a 20 % frame-time or byte regression blocks push instead of shipping silently | none | S | low (gate runs only on operator hardware, pre-push) | none | H |
| GATES-02 | No repeatable cold-load benchmark (N runs, medians, fast4g, JSON to diff) | shot.mjs is single-run by design; no driver script exists in repo (glob of scripts/) | `perf/cold-load.mjs` per §3.1 | lets every load optimization show a median±spread instead of a single contended number; single-run cold numbers vary with machine load [estimate: ±5-15 % run-to-run on this shared box] | none | S-M | low | needs S1's :4180 origin (running) | H |
| GATES-03 | No steady-state matrix (standard+iGPU, uncapped, gpuMs) with medians | profiles exist (shared-browser.mjs:11-17) but no matrix runner; baseline brief has single standard-GPU run only | `perf/steady.mjs` per §3.1 | catches iGPU-only regressions the RTX 5070 Ti hides; uncapped p50 = true frame cost (TESTING.md:53-55); quantifies gpuMs honestly via p10 polling | none | S | low | serialized lock ⇒ matrix is sequential (~4 min) | H |
| GATES-04 | Byte budgets cover JS chunks only — nothing guards first-frame wire bytes or `public/harbour` media | bundle-budgets.mjs:1-65 (JS/CSS only); validate-runtime-media.mjs checks structure, never size | budgets file + `check:first-frame-bytes` (static, CI-safe) + media size ceilings | locks in the program's byte wins in CI where no GPU can measure anything; today a 2× atlas regrowth would pass every gate | none | S | low | coordinate thresholds with S4ImagesAtlases/S3GlbAssets findings | H |
| GATES-05 | `firstFrameNavMs` = first rendered frame, NOT the perceived-live crossfade the program targets | shot.mjs:188 polls `firstFrameMs`; crossfade waits data + 4 settle frames, up to `DATA_WAIT_MS` 8000 (harbour-app.tsx:12,52-66); poster.ts:16 sets `data-pv-live` at dismiss | `--init-script` MutationObserver on `data-pv-live`; report gains `crossfadeNavMs` | measures the user-perceived "world is live" moment — on :4173 today it is firstFrame + ~8 s (no data); on :4180 it tracks real API latency, i.e. the true end-to-end target metric | none | S | low | best paired with GATES-02 | H |
| GATES-06 | shot.mjs bug: `webgpuAdapter` reports the WebGL renderer string, never the adapter | shot.mjs:278 `gpu: identity.webgl, webgpuAdapter: identity.webgl` (should be `identity.webgpu`, computed at 208-217) | one-word fix when the file is next touched | removes a misleading field from every future report | none | XS | none | none | H |
| GATES-07 | Published `stats.gpuMs` is the latest timer-query sample, not the p10 `lowTail()` the governor itself trusts under vsync | governor.ts:126 (`this.gpuMs = ms` per sample) vs 173-178; engine.ts:223 republishes it | driver-side fix first: poll `stats.gpuMs` 1/s across the window, report p10/p50 (no src change). Engine-side export of the sample ring only if polling proves too coarse | honest steady GPU cost; single reads can catch an back-pressure spike and mis-attribute a regression [estimate: spikes of 2-5× on some frames per governor.ts:26-29 comment] | none | S | low | none | M-H |
| GATES-08 | No visual-equivalence check anywhere: the visual lane is DOM-only by rule, and no pixel goldens exist | tests/visual/harbour-dom.spec.ts:4-5; no pixelmatch/image-diff in devDependencies (package.json:81-105) | `perf/visual-diff.mjs`: shot.mjs golden capture at pinned `?t&view&quality&dpr` on :4180, sharp-decode both PNGs, report mean abs delta + % pixels > threshold vs golden | gives every `visual-risk` finding in this program an automated verification method instead of eyeballing; catches shader/material regressions counters can't see (garden precedent: silent material skip) | none (tool) | M | medium (needs determinism: frozen data fixture or data-free dist framing; goldens per viewport) | needs a frozen `/api` fixture mode on :4180 (open question) | M |
| GATES-09 | `vite preview` (:4173) is not production-faithful: no `/api` (`apply: "serve"` only, vite.config.ts:21) and `_headers` ignored ⇒ wrong cache behavior | vite.config.ts:18-22; brief: "awaiting data + fog" at :4173; closed by S1's :4180 (verified 200/874 KB) | adopt `:4180` as the harness default origin; promote `outputs/need-for-speed/load/server.mjs` to a tracked script in step 0 | load measurements reflect real headers (immutable assets, 60 s revalidate on `/harbour/*`) + real API path; crossfade timing becomes meaningful | none | XS to adopt / S to track | low | coordinate with S1LoadBaseline (owner) | H |
| GATES-10 | No persisted baselines: every measurement evaporates with the terminal | reports exist only as ad-hoc `--json` files; RUNTIME_FACTS.md pattern (regenerate + `--check` diff) shows the house style | commit `summary.json` snapshots (or a generated `docs/pharosville/PERF_BASELINES.md`) with `report.mjs --baseline` diffs | before/after deltas per optimization step become reproducible evidence for the plan's prioritization; guards against re-litigating wins | none | S | low | none | H |
| GATES-11 | Boot-phase breakdown exists but is one-shot and unpinned in docs | engine.ts:123-145, 198-211 (`boot` map incl. `u:render` 1942 ms baseline); only reachable inside a shot report | fold `stats.boot` into `summary.json.boot` (schema §3.2); no engine change | attribute each load win to a phase (compile vs system init vs first render); diffable per change | none | XS (part of GATES-02) | low | none | H |
| GATES-12 | Shared-machine contention corrupts absolute numbers | brief hard rules (≥3 runs, medians, label contended); capture lock serializes but other agents' CPU load remains | harness records `machine: contended\|quiet` in `meta` and gates only on quiet runs (operator decision at gate time) | prevents false regressions/blocked pushes from noise | none | XS (part of drivers) | low | social: coordinate quiet windows | M |
| GATES-13 | CI can never measure GPU perf (permanent constraint) | deploy-cloudflare.yml:48-50; TESTING.md:84-95 | accept + compensate: static byte budgets in CI (GATES-04), real-GPU tripwires pre-push (GATES-01) | sets honest expectations; no wasted effort on headless-GPU hacks | none | 0 (decision) | none | none | H |
| GATES-14 | shot.mjs `--trace` with the broad category set crashes at serialization and loses the whole capture | `RangeError: Invalid string length` at shot.mjs:263 (`JSON.stringify(traceChunks)`), categories at :242 incl. `gpu`,`blink`,`cc`,`viz`; reproduced on a 5 s `--uncapped --igpu` run (S2FrameBaseline, `outputs/need-for-speed/frame/diagnostics/igpu-noon-r1.log`); the `uncaughtException` exit (shot.mjs:125) also discards the PNG + `--json` report | stream trace chunks to the output file incrementally (append per `Tracing.dataCollected` event) or trim categories to `devtools.timeline,v8,disabled-by-default-v8.gc` (S2's spike workaround); harness avoids `--trace` meanwhile | trace-based attribution (S7/S13 slices) becomes reliable instead of intermittently fatal; no more lost captures | none | S | low | coordinates with S7ShaderCompileUpload/S13FrameLoopIdle (trace consumers) | H (reproduced) |
| GATES-15 | Two report fields can mislead: `fps` divides by requested (not actual) seconds, and under `?prof=1` `stats.programs`/`stats.textures` go stale | `fps: Math.round(timing.length / seconds)` at shot.mjs:279 while the rAF window can overshoot `--seconds` (244-248); `profiledFrame` updates drawCalls/triangles/dpr/gpuMs/quality/hour but NOT programs/textures (engine.ts:254-261), so with `?prof=1` they freeze at frame #1 values; observed live: uncapped iGPU p50 4.3 ms but fps 33, p95 105.6, max 1576.9 (S2FrameBaseline) — backpressure bursts make any single-number summary misleading | harness computes fps from measured window span and reads programs/textures via `ctx.renderer.info` when `?prof=1` is on; report p50 AND p95/max side by side (schema §3.2 already does) | percentiles stop hiding multi-hundred-ms GPU submission stalls; prof-mode counters become trustworthy | none | XS-S | low | none | H (source + reproduced numbers) |
| GATES-16 | Combined `--heap-sample`+`--trace` runs contain a teardown MajorGC that can be misread as a steady-state GC pause | every such run shows exactly one MajorGC AFTER the CPU profile endTime — noon +162 ms, storm +158 ms, winter +26 ms (S2FrameBaseline, 2026-10-19, 3 consistent runs) — matching shot.mjs's stop sequence: CPU profile stops at :249-252, heap sampler at :254-257, trace at :259-263, so the samplers' own teardown allocations land inside the still-recording trace. True in-window steady evidence is MinorGC-only: noon 2 events / 11.581 ms (max 9.52), storm 3 / 12.568 ms (max 7.469), winter 2 / 1.456 ms (max 0.764) | analysis rule for the harness (and for any consumer of these traces): discard GC events timestamped after the steady-profile stop; count only in-window MinorGCs as steady pauses. Optional shot.mjs hardening: stop heap+trace before the CPU profile, or add a drain delay before `Tracing.end` | steady-state GC attribution stops blaming the world for the profiler's own teardown; protects S13/S9 memory conclusions from a false "major GC pause" narrative | none | XS (analysis rule) / S (shot.mjs reorder) | low | feeds S13FrameLoopIdle + S9DataSimCpu GC attribution | H (3 consistent reproductions + mechanism verified in source order) |

## 5. Ruled out / not worth it

- **Perf gates in CI**: no GPU on hosted runners, documented and reproduced (TESTING.md 66-95);
  Lighthouse/WebPageTest-style CI perf would measure SwiftShader fiction or an unsynchronized
  external environment. Ruled out; static byte budgets are the CI compensation.
- **Playwright-driven frame/pixel measurement**: explicit repo rule (AGENTS.md 20-21); the
  reference-gate Chrome mode stays DOM-only. All pixel/timing capture stays behind shot.mjs.
- **Reviving `preview.mjs` verbatim**: reads the deleted `window.__pharosVilleDebug`; a from-scratch
  thin driver over shot.mjs that reads `__harbourStats` is smaller than porting the Garden probe's
  refresh-cost machinery (Harbour has no equivalent payload-churn freeze question yet — revisit if
  S9DataSimCpu finds one).
- **A trend service / historical dashboard**: side project, no uptime commitment (canary header);
  committed summary JSONs + `report.mjs` diffs cover the program's needs.
- **Load measurement against dev :5173**: unminified modules, dev React, Vite middleware — numbers
  would not transfer to production. Dev server stays for debugging only.
- **New npm dependency for perceptual diff** (pixelmatch/odiff): sharp 0.35.4 already decodes PNGs
  to raw RGBA; a mean-delta + hot-pixel-count metric is boring and sufficient for "marginal vs
  visual-risk" classification. Perceptual weighting can be added later if the simple metric
  misclassifies.

## 6. Open questions needing operator decision

1. **Where do committed baselines live** — `agents/…/` per program, a tracked
   `docs/pharosville/PERF_BASELINES.md` (RUNTIME_FACTS style), or `scripts/harbour/perf/baselines/`?
   (Affects whether gates diff against git-tracked data.)
2. **Goldens in-repo?** `tests/visual/goldens/*.png` would be the repo's first pixel fixtures
   (~100-300 KB each × viewports × day-hours). Needed only if GATES-08 goes ahead.
3. **Frozen `/api` fixture** on :4180 for deterministic captures (boat placement/weather vary with
   live data): record-once replay in S1's server, or accept data variance and pin only
   time-of-day/camera? Determines visual-diff reliability.
4. **Gate strictness on a contended machine**: hard-FAIL steady p95 pre-push even when the box is
   busy, or require a "quiet" acknowledgment (`--machine quiet`) that downgrades to warning
   otherwise? Recommendation: the latter, preserving the SKIP≠PASS discipline.
5. **igpu cadence**: is the AMD Raphael iGPU profile considered release-blocking hardware (gate on
   every push) or a periodic check? Affects whether the matrix runs in PERF_TRIPWIRES or on demand.
