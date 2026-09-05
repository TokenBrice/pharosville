# PharosVille Testing and Visual Review

Last updated: 2026-07-30

Use the smallest check that proves the contract you changed. The production
world has one Three.js renderer and a DOM `WorldStaticOverview` for renderer or
GPU failure.

## Choose a lane

| Change | First check | Add when needed |
| --- | --- | --- |
| Pure world, data, layout, motion | `npm test -- src/systems` | focused scenario test |
| Renderer, material, hit testing | `npm test -- src/three src/renderer` | `npm run test:visual` |
| Model, atlas, texture, runtime URL | `npm run check:runtime-media` | `npm run test:perf` |
| Viewport/loading boundary | `npm run check:viewport-gate` | visual gate lane |
| Docs only | `npm run validate:docs` | `git diff --check` |
| Mixed or uncertain scope | `npm run validate:changed` | relevant browser/perf lane |

`npm run test:visual` runs the production behavior, interaction, gate, and
failure coverage. Run `npm run test:visual:cross-browser` when accessibility or
browser interaction changes. Chromium is the reference-performance browser;
Firefox is the second accessibility/interaction browser. Safari is not a
cutover acceptance browser.

## Required browser contracts

The visual lane must keep proving:

- a nonblank ready Three.js surface (`data-renderer="three"`);
- resize, pan, zoom, selection, blank-world clear, Escape, deep links, and
  Observe interruption;
- the complete capacity-bounded fleet and its individual hit targets;
- detail-panel, label, announcement, and accessibility-ledger parity;
- day, dusk, night, reduced motion, hidden/offscreen pause, and renderer
  module/WebGL/context failure;
- a blocked viewport with no world data, Three.js, model, or logo request.

**Unexercised contract (2026-07-25):** the transient selected outsider — a ship
past the render cap, drawn only because it is selected — has no coverage,
because the scenario no longer occurs. The Grand Scale Revamp raised the cap to
320 and neither the dense fixture (~132 ships) nor the live fleet (187) comes
near it, so `selectGardenTransientShip` never fires. Covering it again needs a
fixture with more than 320 ships; until then treat that path as untested. Note
also that hit targets are VIEWPORT-CULLED, so a target count is a property of
the camera, not of fleet composition — never compare counts across framings.

## Visual review

Use deterministic API fixtures, screen/viewport, time, and reduced-motion
state. Keep scratch evidence under `outputs/`, never in `test-results/` or the
repository history.

| State | Review question |
| --- | --- |
| Day, 1440×1000 | Is the lighthouse dominant, sea legible, fleet readable, and chrome clear? |
| Dusk and night | Do light, water, flags, and details retain hierarchy? |
| Reduced motion | Is this a complete composed frame, not an accidental pause? |
| Overview and inspection | Are livery, marks, harbors, water bodies, labels, and selection clear? |
| Dense fleet | Do ships preserve water-safe spacing, open-water clearance, and bounded cost? |
| GPU failure | Is the selectable DOM overview useful with no broken WebGL visible? |
| Undersized screen or window | Does the intended DOM fallback/rotate prompt make no world requests? (Size test, not orientation — a tall desktop window charts.) |
| Ultrawide | Does framing stay stable with no UI/world overlap? |

Before accepting visual drift, verify the fixture, camera, time/reduced-motion
state, semantic detail, model/logo availability, GPU metrics, and DOM meaning.
GPU raster variation is not automatically a product change. Do not replace
evidence merely to silence unexplained differences.

## Performance and bundle

```bash
npm run test:perf
npm run build
npm run check:bundle-size
```

The performance suite measures coherent startup, pacing, long tasks, GPU
resources, long-session stability, transient selection cleanup, and clock
shutdown. Current resource ceilings are 700 draw calls, 500 geometries, 72
textures, and 500,000 triangles. `npm run test:perf:reference` is the strict
reference-hardware gate; headless or integrated results are diagnostics, not a
substitute for the designated reference environment.

For a measured renderer-local draw-owner census, use the real-GPU preview:

```bash
npm run preview -- --url http://localhost:5173 --draw-census --out w0-census-baseline.png
```

The census wraps the renderer instance for one scene frame. Its attributed-call
sum must reconcile to that frame's `renderer.info.render.calls`; a scene graph
traversal is not a draw census.

Useful preview flags are composable: `--draw-census` writes the reconciled
owner table; `--assert` gates tier, p90/p95, and resource ceilings;
`--reduced` checks the settled zero-RAF tableau; `--hash "#cam=0,0,0.28"`
checks the whole-map plate; `--headed --seconds 20` supports a longer visual
review; and `--out <path>` records the frame under `outputs/`. Use the real-GPU
preview for appearance and timing, then inspect the image and the census
reconciliation together.

For reproducible hardware comparisons, `--fixture calm|dense|stress` reuses the
checked-in browser fixtures and fixes the wall clock while leaving real RAF and
performance timing intact. `--overlap` records projected ship hit-rectangle
overlap and an annotated companion capture; this is a crowding proxy, not a
measurement of sail-pixel occlusion. `--pan-zoom` records six gesture frames;
`--blur-audit` saves a 16px canvas-blur companion for the attention audit.
`--json <name.json>` preserves the metrics beside the images in `outputs/`.

`--texture-census` includes logical storage estimates for reachable textures,
unique live handles and known depth/MSAA renderbuffers, with unknown allocations
listed separately. These are **not measured VRAM**. The GPU preflight reports
timer-query support; it does not time individual GPU passes.

For lower-tier visual inspection on the dev server, `--force-tier recovery` or
`--force-tier constrained` uses a debug-only test global. It cannot activate in
a production build. Pair it with the matching `--require-tier` when asserting
that particular fidelity state; the normal reference pacing gate remains full.

### Never judge the look or the frame time through a Playwright browser

Playwright's bundled Chromium falls back to **SwiftShader**, a CPU rasteriser,
and so does `chromium.launch({ channel: "chrome" })` — the latter because it
launches `/opt/google/chrome/chrome` directly and skips the wrapper that applies
the operator's `~/.config/chrome-flags.conf`. On a hybrid-GPU box that file is
what pins rendering to the discrete card.

The same scene, same machine, measured 2026-07-25:

| | bundled Chromium | operator's Chrome |
| --- | --- | --- |
| renderer | SwiftShader (CPU) | NVIDIA RTX 5070 Ti |
| p50 / p90 | ~17 / 33.4 ms | 16.7 / 16.7 ms |
| effective fps | 20–43 | 59 (vsync-capped) |
| scheduler tier | `recovery` → `constrained` | `full` |

**Correction (2026-07-25, measured):** the fallback is a FLAG choice, not a
limitation of the bundled browser. Launched with `--ignore-gpu-blocklist
--enable-gpu --use-angle=vulkan --use-cmd-decoder=passthrough`, the same bundled
Chromium reports `ANGLE (NVIDIA, Vulkan 1.4.341, RTX 5070 Ti)`. The correctness
lane now asks for those flags outside CI (see `shouldUseHardwareGpu` in
`tests/helpers/playwright-config.ts`, overridable with
`PHAROSVILLE_VISUAL_GPU=0|1`), because at ~2fps the lane is not merely slow — it
is wrong: multi-second long tasks time out clicks and trip the world's error
boundary, so the merge gates fail for reasons unrelated to the code under test.
The gates went from 5.8 minutes with two failures to 48 seconds all-green.

None of that changes the rule below. `npm run preview` remains the only way to
judge look or frame time, because it goes through the operator's own
`chrome-flags.conf` and therefore their real conditions; a Playwright browser
with GPU flags is merely no longer crippled.

A software frame looks approximately right and reports fiction, which is the
worst combination: it invites tuning the renderer against a bottleneck that does
not exist. Use:

```bash
npm run preview                                    # default framing
npm run preview -- --hash "#t=22&n=1" --out night.png
npm run preview -- --headed --seconds 8
```

`preview.mjs` resolves the operator's own Chrome per platform. On Linux that is
deliberately the WRAPPER (`/usr/bin/google-chrome-stable`), because it is what
applies `chrome-flags.conf` and so what keeps rendering off SwiftShader; on
macOS there is no wrapper and none is needed, since the app bundle reaches the
GPU through ANGLE/Metal (measured 2026-08-13 on an M5 Pro: `ANGLE (Apple, ANGLE
Metal Renderer: Apple M5 Pro)`, 120 fps, tier `full`). Override either with
`--chrome <path>`. The SwiftShader assertion is unchanged on every platform and
remains what makes the reading honest.

`scripts/pharosville/preview.mjs` goes through the wrapper, exits non-zero rather
than report a software frame, and prints the scheduler tier, p50/p90, the
p95/p99/worst-frame tail, long-task counts, draw calls,
triangles and visible ship count alongside a screenshot in `outputs/`. It waits
for the fleet to populate and then for the pacing ring to refill before reading,
because both the snapshot rebuild and the load spike otherwise dominate the
window. In assert mode it also fails on shader/program errors in the page
console: a material the driver rejects is skipped silently at draw time, so the
counters can stay green while a subsystem is missing from the frame (the water
fragment's undeclared `uStorm`, 2026-07-30 — the sea vanished at 60 fps). When
you touch rendering, LOOK at the screenshot in `outputs/`; the numbers alone
do not prove the frame is whole.

### The perf tripwire (`--assert`)

```bash
npm run preview -- --assert
npm run preview -- --assert --max-p90=20 --max-draw-calls=700 --require-tier=full
```

`--assert` turns those printed numbers into a gate. Defaults: scheduler tier
`full`, p90 ≤ 20 ms and **p95 ≤ 20 ms** (a vsync-capped frame is 16.7 ms, so
this tolerates the odd missed vsync without accepting 33 ms — a whole dropped
frame), and ≤ 700 draw calls.

#### The tail is the calm metric

Calm is a P95 property. One 100 ms frame a minute is felt; 2 ms on the average
is not. So the animated arm does not read the pacing window once — it SWEEPS it,
polling every 800 ms for `--tail-seconds` (default 12), and reports:

| line | what it is |
| --- | --- |
| `frame` | the representative window: fps, p50, p90, dropped |
| `tail` | p95 / p99 / worst frame **of that one 120-frame window** |
| `longtask` | long tasks in the rolling window and the longest — where a GC pause or a rebuild shows up before it reaches the frame |
| `sweep` | the **worst window** of the whole sweep, and whether the windows were continuous |

The reported window is the median-p90 read of the sweep, so neither the best nor
the worst read is the report; **the gate is the worst window's p95**, because
the question a tail asks is whether ANY second was bad, not whether the typical
one was. A P95 breach is a FAIL. p99, the worst single frame and the long-task
counts are printed but not gated: a lone spike on a busy machine is real
information and a bad reason to block a push, while a whole bad second moves p95
and does block one. Override with `--max-p95=<ms>`.

Be honest about the span. The in-page ring holds 120 frames — about 1 s at
120 Hz, 2 s at 60 Hz — so a `tail` line describes one second, and a 12 s sweep
is a dozen chances to catch a spike, not a minute of coverage. The sweep says
`continuous` only when each window spans at least the 800 ms poll interval, so
no frames fell between reads; otherwise it says `WITH GAPS` and names the
shortfall. Raise `--tail-seconds` to widen the search (runtime rises with it).

The ring is not simply made longer because its p90 is what the render scheduler
and the adaptive-DPR governor key off (`src/renderer/render-scheduler.ts`,
`src/systems/render-surface-budget.ts`) — a longer ring would slow every quality
decision the renderer makes in order to buy a statistic. Sampling the short
window often buys the same coverage without that cost.

A page whose telemetry publishes no `p95Ms` at all — any bundle older than this
lane — is a **SKIP (78)**, not a pass: the gate's headline metric was not
measured, and "measured everything except the one it is named for" is not a
claim it may make.

It has three outcomes, never two:

| exit | meaning |
| --- | --- |
| 0 | measured on the real GPU, within thresholds |
| 1 | measured, and it regressed |
| 78 | **not measured** — nothing is being claimed either way |

Exit 78 is the honest-degradation path, and it is why the gate can live on a
machine-dependent measurement at all. It fires under `CI`, when the Chrome
wrapper is missing, when there is no X11/Wayland display, when nothing is
serving the target URL, when the world never populates, when the page publishes
no P95 tail, and when the renderer turns out to be SwiftShader after all. A bare `npm run preview` still fails loudly
on SwiftShader instead of skipping, because that run was asked for deliberately.

`validate:deploy-gate` — the pre-push gate for `main` — runs both `--assert`
arms last (the animated frame, then the settled reduced-motion frame below) and
treats 78 from either as SKIP for the whole verdict. CI, which has no GPU, therefore skips it every time rather
than pretending to have measured a GPU frame. A skip still exits 0, so the last
line of every run carries the verdict that says which happened:
`PHAROSVILLE_DEPLOY_GATE: PASS` or `PHAROSVILLE_DEPLOY_GATE: PASS_PERF_SKIPPED`.
Grep for that token rather than trusting the exit code alone; under GitHub
Actions the same line lands in the step summary, and a skip also raises a
`::warning::` annotation.

Reduced motion has no continuous RAF, so use its settled static resource gate:

```bash
npm run preview -- --assert --reduced
npm run preview -- --assert --reduced --hash "#sel=ship.satusd-river&t=12"
```

This asserts full tier, at most 700 calls, 500k triangles, 500 geometries, and
72 textures. It intentionally does not invent fps or frame-time data for a
deterministic zero-RAF frame — no p95 either: a frame that is painted once has
no tail, and the sweep does not run on this arm.

The word that carries this lane is **settled**. Reduced motion paints once and
then repaints only when something asynchronous lands, so an early read is not
wrong, it is early — the 2026-07-27 cleanliness audit (V-07) found this path
over the triangle ceiling exactly because nothing sampled it after it was
whole. Settled here means all three of: the network is idle, the texture upload
queue has drained to zero pending, and the full counter tuple — GPU counts plus
the `uploads`/`logos` progress counters — has held still for four consecutive
reads. The progress counters are in the signature deliberately: ~184 logo
decodes land in bursts, and the gap between two bursts is indistinguishable from
a settled frame if only the GPU counters are watched. A logo whose fetch rejects
never reaches the loaded count, so the wait is for the count to stop *changing*,
never for `loaded === expected`, which in that case would never arrive.

The run prints a `settle` line saying which happened. If the frame never
settles, `--assert` exits **78 (SKIP)**, not 0 — an in-flight frame is missing
resources that are still arriving, and scoring it green would be the precise
error V-07 named.

The current settled reference is approximately 316k triangles and 214–216
calls, depending on phase and selection; it remains comfortably within the
same ceilings.

For fault-like flicker, run the bounded real-GPU artifact probe:

```bash
npm run preview -- --artifact-check --hash "#t=22"
```

It samples eight canvas frames at 120ms intervals on a 96×60 luminance grid,
fails only on coherent frame-wide flashes, and writes transition evidence to
`outputs/artifact-flash-evidence.json`. Ordinary local water and ship motion is
below its coverage threshold. Use `--quick-find` and `--hover-first` when those
chrome states belong in a visual review matrix.

The polling probe also reports whether renderer content was actually replaced:

```bash
npm run preview -- --refresh common
```

`content roots` must remain stable and `content` should report
`renderer-equivalent` for a sub-band supply refresh; a true authored change is
still expected to replace content.

### Historical WebGPU spike

The r185 WebGPU spike was a measured NO-GO and its backend, runtime flags, TSL
probe, and harness were removed. Its measurements and subsystem inventory live
in `agents/2026-07-29-webgpu-spike-report.md`. A future experiment must be
isolated from the production entry and keep the normal build byte budget
unchanged.

The hard ceilings remain 700 draw calls, 500 geometries, 500,000 triangles, and
72 textures. On the reference Apple M5 Pro at 1600×1000, the completed garden
default is approximately 245 recurring calls, 43 textures, and 16.8 ms worst
window p95 at tier `full`. Phase and visibility variation is expected; the
ceiling is not a tuning target.

**Completed garden (2026-09-02, Apple M5 Pro, 1600×1000, 185 ships).** The
default reference is approximately **245 recurring calls**, 321k–337k
triangles, 217–254 geometries, and 43 textures; worst-window p95 is 16.8 ms.
The funded batches are world-wide wakes (346 → 2 calls), shore-station harbor
content (about 98 → 13 for the core batch), and merged island statics. The
`--draw-census` probe wraps `renderBufferDirect` for one frame and must reconcile
exactly to `renderer.info.render.calls` — a mismatch fails `--assert`.

**Whole-map framing — valid performance case.** At the reachable zoom floor
(`ABSOLUTE_MIN_ZOOM` 0.28):

```bash
npm run preview -- --assert --hash "#cam=0,0,0.28"
```

the completed garden measures about 215–227 recurring calls and 42–43 textures
on the same hardware. URL values below 0.28 are not visitor-reachable and are
not valid budget evidence.

**Wave 1 frame remeasurement (2026-09-02, Apple M5 Pro, 1600×1000).** The
finite 140×140 plate remains complete at the retained 0.28 absolute floor; its
projected rim spans about 1,250×625 px, leaving visible sky on every side. The
landing camera is now 0.648 (0.60 authored fit × 1.08 desktop tightening), with
the Pharos near the left thirds line and the camera-side rim entering the lower
corners. `gardenCameraViewHeight` therefore measures 96.45 world units at this
viewport, now the scale-one fog reference.

**Texture gate diagnosis and closure (2026-09-02):** the inherited whole-map
failure was a first-use ordering issue, not seven whole-map scene assets. The
overview LOD starts at detail 1 and eases to its hidden target; before this
change that brief interval enabled N8AO and uploaded its seven private textures
(accumulation, blue noise, output, read, write, and the two half-resolution
depth attachments). The LOD then disabled N8AO but retained those GPU
allocations for the session. A renderer whose initial framing is whole-map now
suppresses only that construction ease, so N8AO is never first-used there. On
later zoom crossings it forwards the ordinary eased detail, preserving the
contact-shadow fade while props shed. Once that ease settles at zero, the post
owner disposes N8AO's seven GPU texture handles (but retains its pass,
materials, and target objects); Three lazily recreates those handles on a
subsequent zoom-in without rebuilding shaders. The settled picture is
unchanged.

The texture census now combines the scene walk with manifests from the post
chain, wakes, lane DataTexture, PMREM/SH cube, and shadow map. It reports the
original 42 scene references, 80 named/reachable resources, and a zero
`minimumUnattributedRendererTextures` lower bound in every arm. On the real
GPU (Apple M5 Pro, Metal, 1600x1000), the measured gate is:

| framing | arm | renderer textures | scene references | named/reachable | minimum unattributed |
| --- | --- | ---: | ---: | ---: | ---: |
| default | animated | 67 | 42 | 80 | 0 |
| whole-map | animated | 72 | 42 | 80 | 0 |
| default | reduced | 65 | 42 | 80 | 0 |
| whole-map | reduced | 70 | 42 | 80 | 0 |

The whole-map animated arm is therefore at, not above, the existing 72-texture
ceiling; do not raise that ceiling.

### The CI visual lane cannot render this world

Reproduced in `mcr.microsoft.com/playwright:v1.59.1-noble`, the exact CI image:

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

This is not a regression. The Three.js world arrived in v0.4.0 and has never
been through these lanes; they were calibrated against the lighter world that
preceded it.

**How it is resolved.** CI gates on `@visual-dom` — the contract a visitor whose
browser cannot render the world is owed, which is precisely what a GPU-less
runner is. That lane proves the signal overview renders, the accessibility
ledger carries every named water, ship and dock, details open by pointer and by
keyboard with panel parity, Escape closes them, the live region exists, and a
blocked viewport requests nothing. The single `visual` job runs that contract
in both Chromium and Firefox. Chromium now launches with `--disable-webgl`
under CI unless `PHAROSVILLE_VISUAL_GPU=1` explicitly requests hardware. This
makes the intended no-WebGL contract deterministic rather than depending on
whether the browser falls back to SwiftShader. Local browser launches retain
hardware rendering and the existing explicit GPU opt-out.

**The full lane still runs, on hardware that can run it.** `npm run test:visual`
locally runs the complete current visual suite, including the active-runtime
viewport matrix; use the runner summary as the authoritative count rather than
copying a fixed total here. `validate:deploy-gate` — which the pre-push hook runs
for `main` — keeps `test:visual:dist` and the Firefox accessibility lane. So the
GPU-dependent contracts are gated at push time on a real GPU rather than not at
all.

**Known cost, stated plainly:** a renderer regression that only shows on a GPU
will not be caught by CI. It will be caught by the pre-push gate — the visual
lanes above for correctness, and the `--assert` perf tripwire for frame time and
draw calls. Both are real measurements on real hardware or an explicit skip;
neither ever runs in CI. If that trade stops being acceptable, the fix is a GPU
runner for the visual job.

## Release confidence

```bash
npm run validate:release
npm run smoke:live -- --url https://pharosville.pharos.watch
```

Report the checks actually run and anything intentionally skipped. A green
local run does not authorize a manual tag or GitHub Release; follow
`RELEASES.md`.
