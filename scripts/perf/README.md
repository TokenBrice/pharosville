# Performance harness

All commands accept `--help`. These tools observe the existing world; they do not change scenery, routes, fade timing or quality. GPU lanes use `scripts/harbour/shot.mjs` and its shared browser/capture lock, never a second browser launcher.

## Origin and load

Use an existing production build (build separately; the harness never writes `dist/`):

```bash
npm run perf:origin -- --dist dist --port 4180
npm run perf:load -- --url 'http://127.0.0.1:4180/?t=12&view=heart&intro=0' --runs 5 --config fast4g --arm both --out outputs/perf/load/summary.json
npm run perf:load -- --url 'http://127.0.0.1:4180/?t=12&view=heart&intro=0' --compare-url 'http://127.0.0.1:4181/?t=12&view=heart&intro=0' --config none,fast4g,fast4g+cpu4,igpu --runs 5 --baseline "scripts/perf/baselines/$NAME.json" --out outputs/perf/load/comparison.json
```

Start a second origin with its own `--dist` and `--port` for A/B. A and B are interleaved for each configuration/arm, reversing order each round. Configurations: `none`, `cable` (20 Mbps/20 ms), `fast4g` (9 Mbps/40 ms), `fast4g+cpu4`, `igpu`. Runs are serial. A repeat sample clears cache/storage **before its seed**, then seeds and revisits under the **same lock**; another capture cannot clear cache between visits. `--repeat-delay 65000` gives a distinct >60-second repeat arm. Cross-deploy and rollback require deliberately changing deployed builds between visits; an immediate repeat is not evidence of those contracts.

The origin uses Vite's development-mode `PHAROS_API_*` environment loading (shared worktree env, local Vite env, then process env), bundles the real Pages Function in memory, and forwards validators. It never prints the key. It serves `public/_headers`, static validators and text compression; JSON/HTML revalidate immediately, other unlisted media use the observed 60-second Pages default. **Not a CDN emulator:** HTTP/1.1, no Cloudflare edge cache, no edge latency. Confirm compression, caching, MIME and validators on live Pages too, using `perf:load --url https://pharosville.pharos.watch/` and the saved waterfall; do not publish localhost cache timings as CDN truth.

Every valid load sample requires `pv:first-frame`, **`pv:first-fleet-frame`**, a rendered model revision with boats, crossfade start (`data-pv-live`) and poster removal. Missing marks/readiness are failures, never an earlier empty-frame win. Summary JSON has per-run observations and boot phases, same-origin completed wire bytes/requests/true network 304s, raw report paths, medians/min/max and optional baseline deltas. Saved response/resource timestamps preserve phase evidence. Wire counters exclude in-flight partial bodies and unattached worker traffic; moving the observation boundary is not an asset byte saving. The independent static ledger below is the byte-regression gate.

`os.loadavg()` is captured before/after each sample. Any 1/5/15-minute value above `--max-load` flags it `contended` (default min(4, 75% of logical CPU count)); load is only a heuristic, not GPU/thermal isolation. Use quiet-machine measurements, n≥5 cold fast4g and n≥3 other arms. HTTP-cold does not clear GPU-driver shader caches. PASS means the capture contract completed, not that a timing budget passed or a speedup was established.

## Static byte gate (CI-safe)

```bash
npm run perf:bytes -- --dist dist --json outputs/perf/bytes.json
```

Reads built HTML entry/modulepreload/fetch-preload URLs (including admission-inert `data-pv-preload` hints), then eager hull/LOD/prop and civic files from manifests. Includes layout, sea, island, lighthouse, emblem slot metadata and the shell/font/poster lead. This is a conservative eager frontier: civic prefetch currently includes hull-stages even where it is not awaited. Deferred `wreck_kit.items`, decorations and variable live API bodies are excluded. Manifests select geometry; decoded `.glb` references use their existing `.gz` sibling only for legacy transport. Explicit manifest transport/pack URLs are used verbatim, allowing encoded/hashed deliveries without a baked list of GLB names. The emitted `preloadAudit` records priority, CORS mode and unconditional/media-only/bootstrap-admission boundaries for each hint; media predicates alone cannot prove the physical-screen gate.

The ledger reports stored bytes and deterministic gzip/Brotli text-body estimates, not promised CDN wire sizes. The complete `public/harbour` media inventory also includes deferred assets and decoded source GLBs. `budgets.json` starts at the measured existing build/media sizes + **5%**; totals, categories and individual media ceilings fail closed (new media needs reviewed evidence). No auto-rebaseline flag: review the emitted ledger, record why the dependency/transport changed, and update ceilings to the new measured +5%, preserving the measurement. A transport/hash cutover should migrate media keys, not leave obsolete ceilings or silently exempt new files.

## GPU/manual lanes and persisted evidence

```bash
npm run perf:frame -- --help
npm run perf:golden -- --help
npm run perf:soak -- --help
npm run perf:compare -- --help
```

Frame matrices, deterministic still/motion pairs and lifecycle soaks are **manual real-GPU lanes**. Inspect images/filmstrips; numerical comparisons do not authorize scenery changes. Follow the lane-specific help for pinned inputs, hardware metadata and comparisons. CI has no GPU: GPU lanes report **SKIP (78), never PASS**, while `perf:bytes` runs after bundle budgets in `validate`.

Golden capture requires `--snapshot FILE`; use `--record-snapshot FILE` once to freeze API data, then reuse that snapshot for both arms. `--filmstrip N --interval MS` captures fixed simulation-step normal motion. Weather matrices assert the **effective** requested weather band: production ignores development weather overrides, so use matching frozen API data or an appropriate development origin rather than label an unchanged production scene “storm.” Frame lanes expose `--prof gpu|none`, `--quality auto` and `--timerless`; see their help for the full matrix.

Reviewed load/frame summaries belong in `scripts/perf/baselines/`; `.gitkeep` intentionally contains no invented timing baseline. Capture artifacts belong in `outputs/`. Persist a baseline only with its hardware, contention state and pinned URL/configuration; `load --baseline FILE` retains before/after/delta/percent for each median. Do not treat different cameras, CPU/network profiles, machine states or missing metrics as a controlled A/B.

## True Bearing measurements and capture receipts

`?prof=1` exposes `window.__harbourProf.snapshot()`: the last **1200** CPU frames,
chronologically ordered, with `{frame,revision,tier,dpr,cpuMs,rafGapMs,tags}` and
p50/p95/p99 distributions. `frames`, `ms` and `max` retain their original since-reset
meaning. `reset()` clears both populations. Stage tags describe submitted CPU work;
`revision:install`, `route:pending`, `preparation:start/end`, `upload:texture` and
`upload:texture-allocation` plus actual GL buffer/texture upload-call tags describe observed events, not inferred GC or GPU waits.
The ring is absent without `?prof=1`. `?prof=gpu` additionally records submitted
material/caster draws and actual render-target dimensions. GPU instrumentation owns
elapsed queries exclusively, as before.

Every shot installs a bounded Long Tasks observer **before navigation**. Reports
include support status, raw start/duration/attribution and dropped count. Browser
attribution can be unavailable: do not label all tasks application work automatically.
The report's CPU ring is reset at the steady-window boundary; Long Tasks span arrival
and steady work so they can be split at `pv:first-fleet-frame`. Ring percentiles cover
only retained frames (about 20 seconds at 60 Hz); for 15-minute sessions retain raw
rAF intervals and inspect Long Tasks across the whole session. Measure observer/profiler
overhead against instrumentation-off controls before quoting a gain.

Both shot and load accept explicit **`3g` = 1.6 Mbps down, 0.75 Mbps up, 400 ms RTT**.
Frame accepts `--paced` (uses the standard paced shared browser instead of uncapped),
`--seconds 900 --quality auto`, `--timerless`, `--multi-draw-disabled`, `--prof 1|gpu|none`
and `--snapshot FILE`. Add `--live-clock` to omit the hour pin during paced sessions. Load also accepts `--snapshot FILE` and `--paced`. Snapshot
replay preserves bodies/status/source ages, anchors the advancing Date clock/RNG to its epoch, keeps rAF and
performance clocks real, and labels API latency **replayed**, never live. Real service
latency needs a separate live arm. A paced run alone does not prove pan/zoom, selection,
revision installation or hide/resume: exercise these through an explicit capture init/
evaluation script and retain that script with the receipt.

Use identical fixtures, requested/effective weather, time/camera/season, build identity,
viewport/backing size/DPR, backend/extensions, cache arm and recorded contention/power/
thermal state. Do three quiet steady repetitions and five interleaved cold/repeat load
runs; repeat after >60 seconds and across deliberate deploy changes separately. The
new schema preserves `legacyTotals`; current `totals` close over actual emitted JS/CSS
references (including workers, URL seed assets, dynamic CSS and italic font). Base and
fleet ledgers partition that conservative dependency frontier; decorative media are a
separate stored inventory, including authoring/alternate transports. No budget changes
are automatic. The gate compares `budgets.json` with `legacyTotals`/`legacyCategories`, the
frontier those budgets were measured on; the complete ledgers are reported, not yet budgeted.

B01 proposed targets remain: CPU4 frame CPU p95 ≤8 ms/p99 ≤12 ms; no application
Long Tasks ≥50 ms after first fleet over ten minutes; cold arrival ≤2 tasks and none
>100 ms under CPU4. First complete fleet: warm ≤2.5 s, cold fast4g median/max ≤8/10 s,
CPU4 fast4g ≤12/15 s, provisional 3G ≤30/40 s. Never count an empty/unavailable render
as a faster complete fleet. B01's physical Safari/iGPU rows are **SKIP for this pass**
under PLAN §3; CPU throttling is a proxy, not device acceptance. These tools record
evidence, not an unexecuted acceptance verdict.

Shot refuses software **or unknown** GPU identity with exit **78**. Every PNG has a
`.provenance.json` sidecar: actual browser/backend, driver details or explicit
unavailability, serving source hash (DEV) or fetched document/JS/CSS content hash,
fixture hash, viewport/backing dimensions, effective DPR and effective state captured
at that frame. Build-content hashing happens after the timed window. `--fixture-hash`
is for golden's already-installed snapshot; `--snapshot FILE` hashes the replay itself.
Golden embeds the same receipt in its manifest. `--empty-fixture` relaxes the zero-flag
assumption only after verifying zero rendered boats. Comparison requires receipts for
every native/filmstrip frame, matching GPU/browser/backend/driver/fixture/viewport/DPR/
effective state; both builds must be identified, but A/B hashes may differ. Missing
receipts produce **UNVERIFIED**, never PASS, and a nonzero exit (78 for explicitly unknown/software GPU receipts). Numerical screening
still needs native-resolution art and motion review.

```bash
node scripts/harbour/contact-sheet.mjs --snapshot outputs/perf/api-snapshot.json --matrix true-bearing --origin http://localhost:5173/ --out outputs/perf/contact --filmstrip 3
node scripts/harbour/analyze-frame.mjs outputs/perf/contact/heart-t11.png --tower 760,330,16,65 --band 560,210,480,300 --fire 746,270,55,55 --region 300,600,1000,250
```

The named **true-bearing** matrix has 18 cases: heart hours 6.9/9/11/16.4/17.1/17.6/
22/3; overview day/night; DANGER; stale day/night; unavailable PSI; 8% off-peg; a held
rising front; 834×1112 touch; 2560×1080. It uses the existing shot path exclusively,
asserts DEV analytical overrides are effective, and writes `sheet.jpg`, `manifest.json`
and `index.html` links to native PNGs/optional fixed-step filmstrips. The rising-front
case always includes three frames. Production ignores these DEV overrides; refusing
an ineffective state is intentional. No thumbnails constitute art approval.

Analysis boxes are **physical pixel** `[x,y,width,height]`. Defaults in the command
above are starting regions for the 1600×1000 heart view; check the lit tower face,
background band, fire/lantern and open basin against the native image, and supply
explicit boxes for other views/sizes. No automatic landmark detection or scaling:
reports retain all boxes. Transparent input is converted to sRGB with alpha removed.

- **Hero band share:** convert sRGB to linear relative luminance (Rec.709 coefficients),
  average the tower box, then count band pixels at or above that mean, excluding tower
  pixels. The daytime O10 target is ≤0.25.
- **Fire share:** fraction of the entire image's brightest `ceil(N×0.007)` pixels inside
  the fire box. Cutoff ties contribute proportionally, avoiding scan-order bias.
- **Bright specks:** 8-connected islands at L*≥85, at most nine physical pixels each,
  within the region; report islands per 10,000 region pixels. `--speck-l` and
  `--max-speck-area` make those diagnostic thresholds explicit.
- **Region means:** CIE L* (D65/sRGB relative Y, 0–100) and HSL saturation (0–1), averaged
  per pixel. These do not establish haze coherence, readable print or calm motion.

Browser-free checks: `node scripts/perf/first-frame-bytes.test.mjs`,
`node scripts/harbour/analyze-frame.test.mjs`, `node scripts/harbour/capture-provenance.test.mjs`
and `node scripts/harbour/capture-hooks.test.mjs`. Engine profiler checks live in Vitest.

## Lamplighter assertion gates and release receipt

Run `npx vitest run tests/qa` for browser-free verdict and serialized-hook checks.
The commands below are for the orchestrator on the shared real RTX browser. No
hardware execution is implied by these tests.

Soak asserts by default (`--assert` is explicit). Growth or an unrecovered scenario
exits **1**; unsupported counters, missing phases or insufficient post-warmup
measurements are **UNVERIFIED (78)**; an observed plateau exits **0**. Use
`--diagnostic` explicitly to collect without asserting. Required counters include
heap, logical GL geometry/texture/program counts, CDP page DOM listeners, workers
and open audio contexts. Individual unsupported counters stay null/UNVERIFIED.
Heap without `--gc` includes garbage; forced GC is intrusive. Neither logical GL
counts nor a plateau establishes resident VRAM usage or proves absence of leaks.

```bash
npm run perf:soak -- --assert --snapshot outputs/perf/api-snapshot.json --out outputs/perf/soak-remount
npm run perf:soak -- --assert --mode mounted --minutes 30 --interval 30000 --snapshot outputs/perf/api-snapshot.json --faults --out outputs/perf/soak-mounted
npm run perf:soak -- --assert --mode mounted --minutes 30 --snapshot outputs/perf/api-snapshot.json --faults --reduced-motion --audio --out outputs/perf/soak-reduced-audio
```

Mounted mode keeps one tab and owner except its single intentional context rebuild.
It refreshes all seven feeds, opens the ledger and Keeper's Log, synthesizes
document visibility changes, checks renderer pause/wake, injects one worker error
through the tracked worker and one actual `WEBGL_lose_context` loss/restore, and
waits for coherent preparation. Synthetic visibility is labeled; it does not prove
OS sleep/lock or audio-route behavior. Audio requires explicit `--audio`, uses a CDP
user gesture and rapid off/on toggles. Reduced motion is installed before navigation.
Replay advances monotonically within its one-day contract. Use a replay whose
refreshes succeed for this recovery/growth run; outage semantics have separate tests.

`perf:frame --assert --machine quiet --profiles standard --runs 3 --seconds 30`
requires real RTX evidence, quiet load averages, pinned fixtures, day/night/storm
coverage and stable quality/DPR/program populations. Frame-interval p95 must be
≤16.7 ms; max is recorded separately. `--cpu-throttle 4 --prof 1` additionally
requires CPU submission p95 ≤8 ms and zero Long Tasks after first fleet. `--prof gpu`
requires completed, non-disjoint GPU samples; pair it with `--prof none` controls.
The CPU ring and completed GPU populations are bounded windows; raw frame intervals
cover the full 30 seconds. These are distinct clocks, not presentation timestamps.
Use `--baseline FILE --max-gpu-ratio 0.7` for the Lite 30% GPU reduction gate, or
ratio `1` for non-regression; baseline must match fixture, device/browser/backend,
viewport and effective state and have a quiet PASS. No baseline is invented.
Quiet load averages are a contention heuristic, not proof of isolation/thermal state.
Use `--snapshot 'outputs/perf/{weather}.json'` for a built CALM/DANGER matrix.
Storm fixture and `--weather` must actually agree on a production build (DEV overrides
are ignored there). Single-state diagnostic matrices cannot pass the full steady gate.

`node scripts/harbour/arrival-smoke.mjs --url http://127.0.0.1:4180/` checks the first
nonempty fleet, simulation `ready`, lifecycle `READY`, posed and rendered `drawn ===
readiness.boats` at the same revision, completed poster removal and zero console
errors/warnings. It exits **0/1/78** for PASS/FAIL/no real GPU. `validate:release`
runs this through the local non-CI GPU arm beside the existing load tripwire.

After canonical deployment, extend the existing smoke rather than repeating asset
transport verification:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch --sha FULL_COMMIT_SHA --receipt outputs/perf/canonical.json
node scripts/pharosville/release-receipt.mjs --smoke outputs/perf/canonical.json --evidence outputs/perf/evidence.json --out outputs/perf/release-receipt.json
```

Evidence JSON contains `{sha, buildHash, fixtures: [fixtureHash], checks: [{id,file}],
art: {status,reviewer,evidence}}`. Paths are relative to that JSON. Required IDs are
`arrival`, `soak` (30+ minutes mounted, panels/wake/worker/context outcomes),
`soak-remount`, `steady` (GPU profiler), `steady-cpu4` (CPU profiler at ×4), and
`steady-control` (profiler off). Each references its existing summary. Raw summaries
are embedded and re-evaluated; archive referenced capture JSON/logs alongside the
receipt. Art PASS is a named review of native evidence, independently recorded.
Missing required evidence is UNVERIFIED/78; measured failure remains FAIL/1.

Canonical smoke records SHA, document/asset-registry identity, header/endpoint
checks and freshness/availability warnings. Built capture identity uses the same
document+registry digest, independent of which lazy panels a run opened. Captures
must identify the same build/fixtures and match canonical delivery identity. DEV
source hashes remain diagnostic; use the actual built artifact for release evidence.
RTX rows are measured; Apple/D14, iGPU and other device/browser rows explicitly SKIP
under PLAN §3. Emulation grants no physical-device claim. Receipt assembly is local
evidence tooling; `.github/workflows/release.yml` retains sole publication ownership.
