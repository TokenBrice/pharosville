# PharosVille Testing and Visual Review

Last updated: 2026-10-19

Use the smallest check that proves the contract you changed. The production
world is The Harbour (`src/harbour/`), one three.js WebGL2 Engine; if WebGL2
cannot start, the first-paint poster and guide stay up. The Garden Observatory
lanes, census and calibration protocols were retired with that world at the
Harbour cutover (2026-10-14); they remain in git history.

## Choose a lane

| Change | First check | Add when needed |
| --- | --- | --- |
| Harbour data, model, sim, readings | `npx vitest run src/harbour` | focused scenario test |
| Engine, systems, shaders, fleet, UI | `npx vitest run src/harbour` | `npm run preview` (real GPU) |
| Shell, viewport gate, first paint | `npm test -- src/client.test.tsx` | `npm run check:viewport-gate`, `npm run test:visual` |
| Runtime GLB, texture, poster, logo | `npm run check:runtime-media` | `npm run preview` |
| Bundle weight | `npm run build && npm run check:bundle-size` | a measured re-baseline in `scripts/bundle-budgets.mjs` |
| Docs only | `npm run validate:docs` | `git diff --check` |
| Mixed or uncertain scope | `npm run validate:changed` | relevant browser lane |

## Required browser contracts

`npm run test:visual` (`tests/visual/harbour-dom.spec.ts`) asserts DOM state
only, never pixels:

- the first paint carries the title, the poster, the guide and the links;
- a blocked viewport (screen or window too small; size tests, never
  orientation) gets the welcome page and requests no `/api/*`, GLB or Harbour
  chunk;
- an admitted desktop viewport mounts the world canvas, or, without WebGL2,
  keeps the poster with an honest failure message and the links.

`npm run test:visual:cross-browser` runs the accessibility subset in Chromium
and Firefox.

## Looks and frame time: real GPU only

Never judge how the Harbour looks or how fast it runs through a Playwright
browser: the bundled Chromium and `channel: "chrome"` both fall back to
SwiftShader and report fiction. Use `npm run preview`, which runs
`scripts/harbour/shot.mjs`: it launches the operator's Chrome through its
wrapper (headed), refuses to report a software frame, saves a PNG and prints
the GPU identity, frame-time p50/p95/max and `window.__harbourStats` (draws,
triangles, first frame, pixel ratio, GPU ms):

```bash
npm run preview -- --url "http://localhost:5173/?t=18.5" --out outputs/harbour/x.png --seconds 4
```

`?t=<hour>` pins the time of day; `?view=heart|overview` picks the camera.
LOOK at every PNG before claiming anything about the picture. `--uncapped`
lifts vsync so p50 is the true frame cost; any other GPU load on the machine
(another browser, a Blender export) skews it, so quote numbers from a quiet run.

Desktop gate on the real browser: `--log-requests` adds `apiRequests` and every
request to the report. A blocked window must mount no canvas and show
`apiRequests: []`; an admitted one mounts:

```bash
npm run preview -- --url http://localhost:5173/ --width 1100 --height 700 --log-requests --eval '!!document.querySelector("canvas")'
npm run preview -- --url http://localhost:5173/ --width 1600 --height 1000 --log-requests --eval '!!document.querySelector("canvas")'
```

### The CI visual lane renders no world

Reproduced in `mcr.microsoft.com/playwright:v1.59.1-noble`, the CI image at the
time (`deploy-cloudflare.yml` has since moved to `v1.63.0-noble`; the finding
has not been re-measured there):

- **Firefox gets no WebGL context at all** — not with `webgl.force-enabled`,
  `webgl.disabled`, `webgl.forbid-software`, `LIBGL_ALWAYS_SOFTWARE`,
  `GALLIUM_DRIVER=llvmpipe` or `MOZ_ENABLE_WEBRENDER`. Locally Firefox is fine
  both on the GPU and forced to software GL, so this is the container.
  the Firefox half of `visual` therefore exercises the DOM fallback, which it
  does correctly: the signal overview renders and the accessibility ledger
  carries every ship.
- **Default Chromium can reach SwiftShader and block DOM assertions** —
  omitting hardware flags does not prevent software WebGL. The original motion
  lane timed out on `locator.screenshot` at 180s; the expanded dense-data DOM
  cases also stalled while their correct caveat ledger was already present.

**How it is resolved.** CI gates on `@visual-dom` in
`tests/visual/harbour-dom.spec.ts`: the contract a visitor whose browser cannot
render the world is owed, which is precisely what a GPU-less runner is. Under CI
Chromium launches with `--disable-webgl` unless `PHAROSVILLE_VISUAL_GPU=1`, so
the Harbour's boot fails deterministically and the lane proves the poster, the
arrival guide, the failure message and the links stay useful, and that a
blocked viewport requests nothing.

**Known cost, stated plainly:** CI cannot catch GPU-only regressions. Before
release, manually run `validate:deploy-gate` on the operator's real GPU: its
Harbour tripwire starts the production-faithful origin from the build, runs
three cold fast4g loads at 1600×1000/DPR1, and fails if the first-fleet median
exceeds `scripts/perf/baselines/branch-load.json` by more than **15%**. The static
byte gate runs too, including in CI. CI records `SKIP_PERF_CI`; unavailable or
software-only GPU records `SKIP_PERF_NO_GPU` (exit78), never a GPU PASS. The
full gate preserves `PASS_PERF_SKIPPED` when GPU measurement is skipped.
To exercise only this socket against a separate production build, run
`node scripts/pharosville/validate-deploy-gate.mjs --perf-only --dist /tmp/nfs-t1 --port 4195`;
JSON evidence is written under `outputs/perf/deploy-gate/`. The origin is
stopped afterward and needs the same server-side API configuration as
`perf:origin`. The persisted baseline is **contended reference evidence**:
this tolerant short regression check is not quiet-machine release confidence
or a frame-time/visual-equivalence check. Keep the other manual GPU lanes.

## Performance harness

Maintained tooling is in `scripts/perf/`; see its [usage and measurement
caveats](../../scripts/perf/README.md). Every entry point accepts `--help`.
The harness never changes the runtime scenery, simulation, fade or quality.

```bash
npm run perf:origin -- --dist dist --port 4180
npm run perf:load -- --url 'http://127.0.0.1:4180/?t=12&view=heart&intro=0' --runs 5 --config fast4g --arm both --out outputs/perf/load/summary.json
npm run perf:bytes -- --dist dist --json outputs/perf/bytes.json
```

Build separately before starting an origin. Unlike `vite preview`, the origin
applies `public/_headers`, compression and validators and runs the real Pages
API proxy with Vite's server-side environment loading; the key is never printed.
It is HTTP/1.1 without Cloudflare edge caching, not a substitute for live CDN
transport/cache checks.

`perf:load` interleaves `--url` and optional `--compare-url` A/B arms, with
`none|cable|fast4g|fast4g+cpu4|igpu` configurations. Cold and repeat are distinct;
repeat seeds and revisits inside the same shared capture lock. It reports
the first engine frame, first **fleet-bearing rendered model revision**,
crossfade start and poster removal separately, plus completed same-origin
wire bytes, requests, true network 304s and boot phases. JSON summaries include
medians/min/max, per-run load averages and a `contended` flag; `--baseline FILE`
adds median deltas against reviewed summaries in `scripts/perf/baselines/`.
Require quiet-machine n≥5 cold fast4g and n≥3 other arms before attributing wins.
Completed-before-frame responses omit partial bodies and can move across the
observation boundary: they are not the immutable first-frame dependency ledger.

`perf:bytes` is the **CI-safe** static ledger: built HTML hints plus eager
manifest files, layout, core scenery, slot metadata, shell/poster/fonts, and a
separate full Harbour media inventory. Budgets in `scripts/perf/budgets.json`
start at measured bytes +5%; regressions and unbudgeted media fail. It runs in
`validate` immediately after `check:bundle-size` and requires no browser/GPU/key.
Text compression estimates are labeled estimates, not measured CDN wire bytes.

`perf:frame`, `perf:golden`, `perf:soak` and `perf:compare` expose the manual
frame/resource, deterministic still/motion, lifecycle and comparison lanes.
Use their `--help`; all GPU captures go through `shot.mjs` and the shared lock.
Inspect every image/filmstrip pair: a numerical pass cannot approve scenery
or motion changes. Record GPU/driver/browser, viewport/DPR, quality,
thermal/battery state and contention alongside evidence.

Use `?prof=gpu` for completed, frame/state-tagged per-pass GPU queries; query
submission or the latest available result is not the cost of the current
frame. Exercise the timer-unavailable lane separately. Tier/weather/seasonal
preparation needs both KHR-present and KHR-absent runs: the latter remains
correct but synchronous driver compilation can block, so report observed
transition maxima rather than claiming a non-blocking guarantee.
Exercise cancellation and the 30 s preparation deadline separately: the
deadline warns and retains an active partial batch so scenery is not lost,
but a successful reveal is not proof all first-use shader work finished.

Arrival acceptance is separate from a successful load timing: exercise slow,
failed and valid zero-boat data, worker startup/planning failure, refreshes
with changed IDs, delayed/failed imports, and denied→admitted→denied→readmitted.
The pending-data hold is 2 s from the first composer-completed world frame;
if it expires, distinguish that empty-world reveal from the later first
complete fleet frame. A rendered model revision must carry a complete
fleet-frame report before boats count as arrived. Inspect normal-motion
filmstrips for the approved empty-world and deferred people/gulls/labels
trials; neither an earlier empty frame nor a settled still proves arrival
equivalence. Depth-prepass comparisons also cover offscreen shadows and live
leaf↔bare changes, not just the initial summer view.

**CI has no GPU.** Only static byte budgets run there. GPU lanes are manual
real-hardware checks and report **SKIP (exit 78), never PASS**, when unavailable
or in CI. A static/DOM pass or `PASS_PERF_SKIPPED` is not GPU performance
confidence; release confidence still requires the appropriate manual lanes.

## Release confidence

```bash
npm run validate:release
npm run smoke:live -- --url https://pharosville.pharos.watch
```

Report the checks actually run and anything intentionally skipped. A green
local run does not authorize a manual tag or GitHub Release; follow
`RELEASES.md`.
