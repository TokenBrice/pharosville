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

`scripts/pharosville/preview.mjs` goes through the wrapper, exits non-zero rather
than report a software frame, and prints the scheduler tier, p50/p90, draw calls,
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
`full`, p90 ≤ 20 ms (a vsync-capped frame is 16.7 ms, so this tolerates the odd
missed vsync without accepting 33 ms — a whole dropped frame), and ≤ 700 draw
calls. It reads three rings spaced longer apart than the 120-sample window and
asserts the median p90, so no read still carries load-spike frames and one
background spike on a busy machine cannot block a push while a real regression —
which shows in all three — still does.

It has three outcomes, never two:

| exit | meaning |
| --- | --- |
| 0 | measured on the real GPU, within thresholds |
| 1 | measured, and it regressed |
| 78 | **not measured** — nothing is being claimed either way |

Exit 78 is the honest-degradation path, and it is why the gate can live on a
machine-dependent measurement at all. It fires under `CI`, when the Chrome
wrapper is missing, when there is no X11/Wayland display, when nothing is
serving the target URL, when the world never populates, and when the renderer
turns out to be SwiftShader after all. A bare `npm run preview` still fails loudly
on SwiftShader instead of skipping, because that run was asked for deliberately.

`validate:deploy-gate` — the pre-push gate for `main` — runs `--assert` last and
treats 78 as SKIP. CI, which has no GPU, therefore skips it every time rather
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

After network and GPU resource counts settle, this asserts full tier, at most
700 calls, 500k triangles, 500 geometries, and 72 textures. It intentionally
does not invent fps or frame-time data for a deterministic zero-RAF frame.

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

The thresholds are calibrated on the DEFAULT framing, which on an RTX 5070 Ti at
1600x1000 measures 60 fps, p50/p90 16.7 ms, tier `full`, and 620–693 draw calls
(2026-07-26). Note how little draw-call headroom that leaves: a feature that adds
~50 calls will trip the tripwire, and the answer is to batch it, not to raise the
number.

**Whole-map framing is a valid performance case again.** At the reachable zoom
floor (`ABSOLUTE_MIN_ZOOM` 0.28 — the viewport fit computes below it, so this is
as far out as a visitor can pull):

```bash
npm run preview -- --assert --hash "#cam=0,0,0.28"
```

measures **399 draw calls, p90 16.7 ms, tier `full`, 60 fps** over a full
120-sample ring (2026-07-27, RTX 5070 Ti, 1600x1000), within the same 700-call
and 20 ms ceilings as the default framing. The old 909-call/recovery result was
captured before whole-map detail shedding and is no longer an open debt. Do not
raise the ceilings if this regresses. Note also that `cam=` from the URL is not
clamped to the zoom floor, so smaller values render a framing no visitor can
reach; anything below 0.28 is not a valid measurement.

### The CI visual lane cannot render this world

Reproduced in `mcr.microsoft.com/playwright:v1.59.1-noble`, the exact CI image:

- **Firefox gets no WebGL context at all** — not with `webgl.force-enabled`,
  `webgl.disabled`, `webgl.forbid-software`, `LIBGL_ALWAYS_SOFTWARE`,
  `GALLIUM_DRIVER=llvmpipe` or `MOZ_ENABLE_WEBRENDER`. Locally Firefox is fine
  both on the GPU and forced to software GL, so this is the container.
  `visual-cross-browser` therefore only ever exercises the DOM fallback, which
  it does correctly: the signal overview renders and the accessibility ledger
  carries every ship.
- **Chromium reaches SwiftShader and is too slow for the assertions** — the
  motion lane times out on `locator.screenshot` at 180s.

This is not a regression. The Three.js world arrived in v0.4.0 and has never
been through these lanes; they were calibrated against the lighter world that
preceded it.

**How it is resolved.** CI gates on `@visual-dom` — the contract a visitor whose
browser cannot render the world is owed, which is precisely what a GPU-less
runner is. That lane proves the signal overview renders, the accessibility
ledger carries every named water, ship and dock, details open by pointer and by
keyboard with panel parity, Escape closes them, the live region exists, and a
blocked viewport requests nothing. Both `visual` and `visual-cross-browser` run
it, so Firefox finally exercises something real. Verified inside the CI image:
2 passed in under 4s per browser.

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
