# PharosVille Testing and Visual Review

Last updated: 2026-09-27

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

Local renderer-backed correctness lanes need hardware WebGL. Agent shells set
`CI=true`, which deliberately launches Chromium with `--disable-webgl` unless
`PHAROSVILLE_VISUAL_GPU=1` is set. Run
`env -u CI npm run test:visual:dist:interaction` on the hardware workstation;
the unprefixed CI-mode lane can report the capacity case as unmeasured and
cannot prove its GPU/resource assertions.

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

**Over-capacity browser coverage:** the interaction lane limits the dense
fixture to 131 ordinary ships and derives the excluded ship in the browser
from the complete ledger minus the debug seam's admitted ship IDs (its detail
ID is printed as `H1 excluded detail id`). Selecting it gives 132 ships
without replacing content or adding textures. One select/Escape warm-up cycle
uploads camera/LOD-dependent assets; two subsequent identical cycles require
at most one extra geometry while selected, then exact warmed-baseline
geometry/texture counts and 131 ships after Escape (no per-cycle growth).
The panel and complete ledger retain
the outsider. If no WebGL renderer is available, the case records an
`unmeasured` annotation instead of claiming resource coverage. Production
capacity remains 320; hit targets are VIEWPORT-CULLED, so a target count measures
the camera, not fleet composition — never compare counts across framings.

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

For reproducible hardware comparisons, `--fixture` accepts `calm`, `dense`,
`stress`, `quiet-dense`, `mixed-capacity`, and `quiet-normal`. Stock `dense`
remains the crowding arm. `quiet-dense` is the normalized 132-identity art
baseline: unchanged stocks and identities, quiet peg/DEWS/flow readings, zero
weekly change and STEADY/82 PSI. `mixed-capacity` keeps those identities with
crowded risk waters and CRISIS/25 PSI. `quiet-normal` is the two-ship quiet case
with BEDROCK/98 PSI and inactive issuance. Presets default to
`--fixture-clock fixed`: Date stays at the source epoch plus 60 seconds.
`--fixture-clock flowing` starts at that same observer origin and advances
with native elapsed performance time. Exactly one Date observer is installed;
RAF, performance and timers remain native in either mode. This option requires
`--fixture`. A fixed observer never releases the director's 90-second initial
foreground silence (including foreground rituals); use flowing for natural
attention evidence.

Fixtures default to `#t=12`. Pass `--hash '#'` (or a selection hash without `t=`
or `n=1`) for a free hour; also keep those pins out of the base URL query.
With either fixture clock, `--clock` pins only `d=`, not the observer origin.
That calendar pin holds one day even while Date and the hour advance, so it
cannot prove multiday behavior. Flowing fixtures serve unchanged rows and
metadata: they measure snapshot aging, not healthy live producer updates.
`--overlap` records projected ship hit-rectangle overlap and an annotated
companion capture; this is a crowding proxy, not sail-pixel occlusion.
`--pan-zoom` records six gesture frames; `--blur-audit` saves a 16px canvas-blur
companion for the attention audit.

`--ship-limit N` requires `--fixture` and a base `--url` whose hostname is
exactly `localhost` or `127.0.0.1`. Integers are clamped to 1…320; fractional
and nonnumeric values are rejected. The init script installs
`window.__pharosVilleTestShipLimit` before navigation. The app honors it only
under its visual-debug guard and on those exact hosts, resolving it once per
world. Preview first verifies ordinary admission against the complete ledger,
refuses ignored overrides, and then cold-navigates to the requested selection
deep link (URL selection is consumed on mount).
For the real-GPU outsider arm, use the ID printed by the interaction case:

```bash
env -u CI npm run preview -- --url http://localhost:5173 --fixture dense \
  --ship-limit 131 --hash '#sel=<excluded-detail-id>&t=12' --assert \
  --out vu/h1/capacity-131.png --json vu/h1/capacity-131.json
```

`--light-cycle` exercises the real **Explore harbor controls → Light and
motion → Time of day** input at 06:00, 12:00, 18:00 and 22:00. It expands
the redesigned toolbar before opening the drawer, waits for the requested hour
to reach runtime telemetry, and settles each phase before recording resources,
shader errors and a `-light-HHMM.png` screenshot. With `--reduced`, each phase
uses the static upload/resource settling oracle; animated phases wait for
uploads after their dwell. The initial still retains the normal `--assert`
gate; phase resource/shader failures also exit nonzero. Example:

```bash
env -u CI npm run preview -- --url http://localhost:5173 --fixture dense \
  --light-cycle --reduced --assert --out vu/h1/light.png --json vu/h1/light.json
```

`--json <name.json>` preserves metrics beside the images in `outputs/`, and
prints one `manifest <path>` line. Its sibling `capture` block (not part of
`metrics`) records the preview checkout commit and dirty paths, viewport,
requested DPR (`deviceScaleFactor`), browser DPR and effective canvas DPR,
screen, IANA timezone, headed/reduced flags, WebGL vendor, browser version,
selected detail, world generation time, admitted ship detail IDs, canvas size,
hash, date-aware dominant sky phase (`phaseForHour`), fixture name/source epoch/
SHA-256 payload hash, and screenshot/JSON output paths. `capture.observer`
records observer origin/epoch, Date mode, calendar pin, hour pin and timezone;
`capture.shipLimit` records requested/effective capacity, the verified hostname,
ordinary count and honored status (or `null` when unused).
`capture.screenshotTiming` labels the main shot's timing. Missing optional
evidence is `null` with a reason in `unavailable`; live data and no selection
are ordinary null states. The identity is sampled beside the main screenshot,
before any pan/zoom or light-cycle probes. Commit identity describes the
preview script checkout, so always serve the same worktree being measured.

Agent shells set `CI=true`: prefix real-GPU commands with `env -u CI`, for
example `env -u CI npm run preview -- --fixture quiet-dense --assert --json quiet.json`.
Exit 78 means not measured, never a pass; SwiftShader remains refused.

`--texture-census` includes logical storage estimates for reachable textures,
unique live handles and known depth/MSAA renderbuffers, with unknown allocations
listed separately. These are **not measured VRAM**. The GPU preflight reports
timer-query support only. The `gpu` line's per-pass readings are not additive
and are not pass costs (see "Instruments" below).

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

Reduced motion has no self-chaining RAF. Date-driven on-demand paints up to
1 Hz remain with a live hour; each recaptures the hero reflection only when
the applied lighting changed (D22), unless another capture input changed.
Use its settled static resource gate:

```bash
npm run preview -- --assert --reduced
npm run preview -- --assert --reduced --hash "#sel=ship.satusd-river&t=12"
```

This asserts full tier, at most 700 calls, 500k triangles, 500 geometries, and
72 textures. It intentionally does not invent fps or frame-time data for a
static frame — no p95 either: isolated on-demand paints are not an animated
frame-time tail, and the sweep does not run on this arm.

The word that carries this resource lane is **settled**. Reduced motion
repaints on demand, including when asynchronous assets land, so an early read
is not wrong, it is early — the 2026-07-27 cleanliness audit (V-07) found this
path over the triangle ceiling exactly because nothing sampled it after it
was whole. Settled here means all three of: the network is idle, the texture upload
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

The last recorded settled reference (before the Hour-Print program) is about 316k
triangles and 214–216 calls, depending on phase and selection. Re-measure it
before quoting it for the current rest seat; the ceilings are what gate.

**Cached-texture validity is a separate gate.** The reflection pass compares
exact camera world/projection matrices, drawing-buffer size, effective DPR,
half-CSS target size, owner, motion mode and the last successfully captured
scene revision. Visibility is checked even on a cache hit; culling disables
reflection strength without consuming an invalidation. Failed captures restore
renderer state and remain dirty. The renderer compares applied colours
(including hemisphere ground colour), intensity, world positions and targets
of every reflection-enabled light, plus reflected-content/material drivers.
A pinned `t=` hour with identical applied state reuses the capture; a live hour
follows continuous day-cycle light drift, never a rounded-hour bucket.
Lighthouse insertion, upload-ready visibility and context restore invalidate;
fleet model and logo readiness alone do not.

CPU coverage: `garden-hero-reflection-pass.test.ts` exercises cache reuse,
view/projection changes, half-CSS sizing at DPR 1/2, same-wrapper content,
culling/mode changes and failure restoration. `world-renderer.test.ts`
exercises unchanged versus genuinely changed applied lighting, including a
light outside the day-cycle rig. `use-world-render-loop.test.tsx` consumes
asset bursts and latest-view changes, including hidden-to-visible resume,
then checks no pending RAF, no active motion loop and no pacing samples.
Run with the visual-debug reflection knockout off.

**In-session transition evidence is also separate from resource settling.**
On the real-GPU preview lane, settle before and after a canvas resize and
`t=` change; record CSS/drawing-buffer dimensions and reflection alignment
with before/after screenshots. Initial `--width`, `--height` and `--dpr`
arms do not prove transitions. Preview fixes its viewport, so resizing its
headed window does not count: a resize harness must change the page viewport
and observe a real canvas-size change. Use the preview Chrome resolution and
reject SwiftShader. `--light-cycle --reduced` settles at each of four phases.
Record monitor-DPR and context-loss transitions as observed or unmeasured,
never infer them from the initial-size arms.

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

### Instruments (plan W0.1–W0.3)

Cost, motion and picture evidence comes from `preview.mjs` itself, on its own
real-GPU frame path, after the renderer check and the populate/settle waits.
Every instrument that reads an app debug field (`window.__pharosVilleDebug`
`motionStats`, `directorLog`, `project`, `anchors`, `forceRitual`; the
`still=1`, `d=` and `window.__pharosVilleKnockout` seams) needs visual debug — the dev server or a
localhost build with `?debug=1` — and prints an `error` line naming the missing
field, with exit 1, when the page does not publish it. The rest of the run still
reports.

| flag | what it does |
| --- | --- |
| `--uncapped` | launches Chrome with `--disable-gpu-vsync --disable-frame-rate-limit`, so frame p50 is throughput cost rather than the vsync interval |
| `--knockout <list>` | sets `window.__pharosVilleKnockout` before load; names: `ao`, `bloom`, `smaa`, `rays`, `reflection`, `grade`, `keyline`, `water-lanes` |
| `--knockout-compare <list>` | runs the baseline and each named knockout as whole serial previews, one Chrome per arm, alternating for 3 rounds; prints each arm and Δp50/Δp90 = knockout − baseline, averaged over same-round pairs, plus Σ Δp50. Arm captures and JSON land as `<out>-kc-rN-<arm>.{png,json}`; `--json` writes the summary |
| `--still-camera` | appends `still=1`: no camera breath and no eased moves (idle already holds the rest shot; Wander postcards move only when asked); director, fleet and water keep running |
| `--clock <ISO>` | starts a flowing Date observer at that instant for live data and adds `d=YYYY-MM-DD` (the date as written) to the hash. A bare date is local midnight. Under `--fixture`, only `d=` is pinned; the selected fixture clock and source+60 s observer origin are unchanged. RAF, performance and timers stay native. Not combinable with `--refresh` |
| `--fixture-clock fixed\|flowing` | requires `--fixture`; default `fixed` for art stills, `flowing` for observer-time attention and snapshot-aging watches. Use `--hash '#'` to bypass the fixture's noon pin |
| `--burst N [--interval ms] [--clip x,y,w,h] [--burst-sheet]` | N ordered frames `<out>-burst-NN.png`, paced start to start (default 600 ms), of the canvas or of a viewport clip in CSS pixels; `--burst-sheet` also tiles them into `<out>-burst-sheet.png` |
| `--stats [--watch-seconds S]` | prints motion samples and classified debug rows; watches poll every 500 ms and snapshot rows before the capped browser log evicts them. Reports ordinary discrete admissions/h, urgent admissions separately, duration-union occupancy %, quiet runs and longest quiet, plus the distinct `longestAdmissionGap` cadence metric in milliseconds. Ritual-start, forced-motion and environment rows do not count as discrete admissions. A non-advancing browser epoch reports occupancy/quiet as `unmeasured` |
| `--metrics` | HUD-free capture (debug HUD and world chrome hidden): 3×3 ninths mean L\*, pixels L\* > 85, bottom-left ninth, saturated-orange share (HSV hue 15–50°, s·v > 0.35), left/right top-band hue Δ (chroma-weighted), bottom-third high-frequency energy \|L\* − gauss σ6\|, tower lit/shade face ratio and tower-vs-air Δ from projected `anchors`, and a 3-value notan at 16 px blur written to `<out>-notan.png` |
| `--temporal` | mean frame-to-frame \|ΔL\*\| of the bottom third over an 11-frame, 1.5 s HUD-free burst |
| `--value-plan [noon\|dusk\|night]` | MAE and Pearson r of the ninths against the value-plan table in `VISUAL_INVARIANTS.md`, parsed from the document on each run; the column comes from the `t=` hour (noon 9–16, dusk 16–20 or 5–7, night otherwise), else the page's wall-clock hour, unless named |
| `--night-water` | mean, p95 and max L\* and the share above L\* 10 over the projected inlet water polygon (`anchors.inletPolygon`): the measured night-water probe |
| `--clean` | the main shot is the canvas alone, with the debug HUD, world chrome and overlay (chips, nameplates) hidden: the source for the gate's hour stills |
| `--ritual <kind> [--ritual-wait ms]` | calls `__pharosVilleDebug.forceRitual(kind)` just before the shot (and any burst), outside the day score; kinds are the ritual registry (`GARDEN_RITUAL_KINDS`, `src/systems/garden-director.ts`): `heron-arrives`, `heron-departs`, `kindling`, `moonrise`, `meteor`, `seasonal-visitor`, `crossing`, `dawn-skein`, `fish-rings`, `tree-lets-go`, `anniversary-lantern`. A kind with no registered handler is logged only |
| `--first-visit` | keeps the three first-visit teachings; by default the preview seeds them as read so they do not cover the ordinary now-line |

All readings print as text and, with `--json`, land under `instruments` in the
JSON (`instrumentConfig` records clock, knockout, still camera and uncapped).
L\* is CIE L\* from sRGB through Rec.709 Y, the same maths as the light lane's
ninths. Blur radii are CSS pixels, scaled by DPR. High-frequency energy is
measured at full CSS resolution, so re-baseline it with this tool instead of
comparing it with lane figures taken from downsampled frames.

With both `--tail-seconds` and `--watch-seconds`, readers run concurrently on
the same settled scene. JSON records each monotonic start/end and
`measurementOverlap` (duration and tail continuity); the main screenshot is
after both readers finish. A short tail still cannot supply a longer watch's
p95 coverage. Inspect overlap and continuous pacing windows before claiming
matched coverage; polling overhead is part of this instrumented run.

Occupancy unions effective half-open epoch attention intervals, clipped to
the watch bounds, including beats already active at its start. Preemption
truncates the replaced beat. Urgent market exceptions are counted separately
from the ordinary admission budget but remain part of occupied time.
The stats are not video and sampled underway hull share is not visual salience.
Keep the tab visible, inspect recorded visibility and epoch advancement, and
use independent observation/recording for natural-motion reading.

```bash
npm run preview -- --uncapped --knockout-compare ao,bloom,smaa,rays,reflection,grade,water-lanes
npm run preview -- --still-camera --hash "#t=18.3" --burst 9 --interval 600 --clip 900,700,500,250 --burst-sheet
npm run preview -- --still-camera --stats --watch-seconds 600
env -u CI npm run preview -- --fixture quiet-dense --fixture-clock flowing --hash '#' --still-camera --stats --watch-seconds 300 --tail-seconds 300 --assert --out vu/c1/watch-smoke.png --json vu/c1/watch-smoke.json
npm run preview -- --fixture calm --clock 2026-09-26 --hash "#t=12.25" --metrics --value-plan --json noon.json
npm run preview -- --clock 2026-09-26 --hash "#t=22" --metrics --temporal --night-water --out night.png
npm run preview -- --clock 2026-09-26 --hash "#t=19.2" --ritual kindling --ritual-wait 20000 --out kindling.png
```

**Cost claims.** The `gpu` line prints non-additive per-pass timer readings.
On ANGLE Metal they are overlapping command-buffer spans: they do not sum to the
frame, and a pass's reading is not what removing it saves. `--max-gpu-ms` is
therefore refused on Metal (exit 2). Pass costs come from `--uncapped
--knockout-compare`. Run arms serially, never beside another GPU job: uncapped
runs heat the GPU.

**Hour stills (K17).** The desktop gate shows one of five chrome-free stills of
the rest seat, chosen by the visitor's local hour (`stillForLocalHour` in
`src/client.tsx`). Regenerate them whenever the rest seat or the look moves, and
at each release: capture each beat at the rest after the arrival, then encode
AVIF and JPEG at ≤ 90 KB each into `public/pharosville/stills/garden-<beat>.*`.

```bash
for beat in dawn:7.0 day:12.25 golden:18.5 blue:19.2 night:22; do
  npm run preview -- --clean --still-camera --seconds 14 --clock 2026-09-26 \
    --hash "#t=${beat#*:}" --out "stills/garden-${beat%%:*}.png"
done
```

**Serial DPR-2 baseline.** Every ms claim cites the baseline table taken on
the operator's MacBook: run the default and each gate hash one after another,
once at `--dpr 1` and once at `--dpr 2`, each `--uncapped` and each with its own
`--knockout-compare` when pass costs are in question. For example:

```bash
npm run preview -- --uncapped --dpr 2 --hash "#t=12.25" --json dpr2-noon.json --out dpr2-noon.png
npm run preview -- --uncapped --dpr 2 --hash "#t=22" --json dpr2-night.json --out dpr2-night.png
```

**Headed 120 Hz arm.** On a ProMotion display, `--headed` adds a `display`
line: the raw `requestAnimationFrame` rate that panel delivers, beside the
app's achieved fps. Read it at rest and during `--pan-zoom`, for example
`npm run preview -- --headed --seconds 20 --pan-zoom`. Do not pass
`--uncapped` here; the arm measures the display cadence.

### Historical WebGPU spike

The r185 WebGPU spike was a measured NO-GO and its backend, runtime flags, TSL
probe, and harness were removed. Its measurements and subsystem inventory live
in the spike report, retired from the tree and kept in git history at commit
`599c822`. A future experiment must be isolated from the production entry and
keep the normal build byte budget unchanged.

The hard ceilings remain 700 draw calls, 500 geometries, 500,000 triangles, and
72 textures. The texture budget is fully spent at whole-map (72/72), so new
work reuses the packed noise texture rather than adding one. At the Hour-Print
rest seat (seat C; 2026-09-27, Apple M5 Pro, 1600×1000, live data, a ship
selected) the HUD reads about 105 recurring scene calls and 50 textures at
noon and about 160 calls at night, well inside the ceilings. The dated tables
below are the pre-Hour-Print references. Phase and visibility variation is
expected; the ceiling is not a tuning target.

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

**Wave 1 frame remeasurement (2026-09-02, Apple M5 Pro, 1600×1000;
superseded).** The finite 140×140 plate remains complete at the retained 0.28
absolute floor; its projected rim spans about 1,250×625 px, leaving visible sky
on every side. The zoom-0.648 landing camera this paragraph measured has since
been replaced by the authored rest seat (`src/systems/rest-seat.ts`; seat C,
yaw 31°, tower in the middle-right ninth). Rest is a pose, not a zoom level.

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
