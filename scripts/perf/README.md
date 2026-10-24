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
