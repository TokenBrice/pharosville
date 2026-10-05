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

### Task-ready startup and experience instrument

S8-P1 coverage: `npm test -- src/systems/garden-arrival.test.ts src/client.test.tsx src/hooks/use-canvas-resize-and-camera.test.ts src/pharosville-world.test.tsx`;
`node --test scripts/pharosville/preview-experience.test.mjs`. Keep ceremony,
exact inline-script CSP hash, exclusive caption-warning and selectable
renderer-failure tests; intro rise and six-second-air recipe pins are retired.
Check both sorted screen and viewport profiles (900×720 / 1200×640), rotated
companions, one-pixel shrink and remount. Blocked cases start no world, API,
GLB or logo requests. Desktop startup transfers no pre-runtime still.

`preview.mjs --cold-filmstrip 0,0.5,1,2,4,6,9,12` navigates to response commit
and captures before canvas/fleet waits. `<out>-cold-NN.png` and
`<out>-cold.json` retain nominal, actual screenshot-start and completed offsets
on the navigation performance clock, first meaningful DOM and first complete
world observations, and actual response-commit latency. A nominal zero is never
labelled first-byte timing; delayed/missed capture deadlines retain their actual
offsets. These are DOM/readiness observations, not paint or perceptual metrics.
The same timing is included in a requested `--json` manifest.

Use separate runs for `--experience-state key|find|controls|light|legend|ledger|changelog`;
`--reading-key` aliases `key`, and legacy `--quick-find` aliases `find`. These
states perform native DOM actions, not debug mutations. No `--source-details`
or `sources` state exists because S3-P2 was declined. `--capture-shell
blocked|no-js|module-failure|renderer-failure` bypasses world readiness waits and
writes a DOM-only shell manifest with no GPU metrics; use a below-gate viewport
for `blocked`. The no-JS arm disables application scripts; the external capture
harness observes DOM only. Module failure leaves first-byte identity/links;
renderer failure must retain the selectable `WorldStaticOverview`.
Capture healthy/degraded first visits at both gates, their rotated companions,
noon/night and reduced motion, then every named DOM state independently.

### Expanded-chrome matrix (S8-P2)

Run `npm test -- src/components/world-controls.test.tsx src/systems/chrome-air.test.ts src/components/accessibility-ledger.test.tsx`.
Retain keyboard/combobox, focus restoration, key teaching and single-ledger
coverage with `npm test -- src/components/quick-find.test.tsx src/components/legend-panel.test.tsx src/pharosville-world.test.tsx`.

Capture each state separately on the real GPU with
`--experience-state key|find|controls|light|legend|ledger|changelog`.
Use both 1200×640 and 900×720, rotated companions, noon/night, normal and
reduced motion; also inspect both sides of the dawn/dusk sheet switch.
Every row below needs healthy and long degraded-caption copy, an active
selected record, and a keyboard-focused action or record.

| State | Acceptance |
| --- | --- |
| Rest / controls | Find `/`, Explore and Read key are distinct, one Find exists; explicit expansion reveals a wrapped secondary row, not a hidden duplicate. |
| Key | Nonmodal key remains reopenable, warning caption stays intact; closing restores its trigger without consuming prior seen visitors. |
| Find | Input/placeholder/meta are ≥4.5:1, listbox and active descendant agree; arrows/Enter/Escape work and close restores opener. |
| Light | Time/Still targets remain 44 px; drawer, selected sheet and wrapped warning occupy disjoint rectangles. |
| Legend / changelog | Existing fonts and lazy sheets remain; fine rules replace ornamental nested frames; focus is visible and restored. |
| Ledger | Exactly one ledger body/landmark; scroll region, section jumps and native selected disclosures remain keyboard operable and match accessible facts. |
| Clock boundary / reduced | All composited text roles are ≥4.5:1 before and after polarity switches; no ink/paper colour transition, duplicate entrance or reduced-motion animation. |

Record capture paths, viewport/time/motion, health copy, selected ID, focus
target, composited contrast minima and collision checks. Evidence remains
pending until captured; CSS token tests alone do not certify scene composites.

### Panel-aware selection matrix (S8-P4a)

Run `npm test -- src/systems/camera-tableaux.test.ts src/hooks/use-canvas-resize-and-camera.test.ts src/components/detail-panel.test.tsx src/pharosville-world.test.tsx`.
The hook keeps held departure, eased travel and exact landing, without a
70%-arrival disclosure clock. Candidate tests check measured sheet padding,
projected identity spans, deterministic bounded scoring, valid-pose retention,
clearance-route rejection and final-display-tile follow—not a first-yaw recipe.

Capture at 1600×1000, 1200×640 and 900×720 in normal and reduced motion:

| Subject / action | Acceptance |
| --- | --- |
| USDC; smallest admitted hull | Facts and focused heading appear on selection, before camera landing; conservative identity/hull bounds avoid the measured sheet plus 24 px. Inspection enlargement does not imply rank. |
| Moving hull; final berth | Accepted shot follows the canonical final display tile, not a raw or extrapolated berth; identity and water stay readable without per-frame candidate searches. |
| Edge berth; dock; grave | Eye, clearance route and silhouette stay unoccluded; an elevated three-quarter view may win. Shore/tower context is subordinate, not mandatory through blocked terrain. |
| Collapsed / expanded record; resize | ResizeObserver exclusion matches the actual visible sheet, including its scroll cap; it stays clear of the wrapping bottom chrome and never hides facts. |
| Mid-glide pointer/wheel/key interruption | Immediate facts remain available; the displayed pose freezes or hands off without a first-frame jump. Closing inspection preserves the separate station-local navigation contract. |

Record subject ID, viewport, motion, measured sheet rectangle, expanded state,
focus and capture path. Aim for ≤35% sky in the subject tableau. GPU images
and real pixel occlusion remain orchestrator evidence; projected conservative
envelopes and CSS-only tests do not certify visible pixels.

### Connected, inspectable stroll (S8-P3)

Run `npm test -- src/systems/postcards.test.ts src/hooks/use-canvas-resize-and-camera.test.ts`
and navigation parity with `npm test -- src/pharosville-world.test.tsx src/content/pharosville-controls.test.ts src/systems/visual-cue-registry.test.ts`.
Retain no-auto-tour, reduced-motion cuts and every station's sightline assertions.
Paths are sampled against production terrain, shelter roofs and station massing
at ≤0.5 world-unit increments; water clearance is ≥1.7, land/massing ≥0.8.
Check wheel/drag grabbed-point discontinuity <1 CSS px and saved local inspection
return after Escape/deselection, interruption, resize, Previous/Next and Home.

On the real GPU capture all six IDs with `--station inlet-mouth|north-deck|mole-end|crane-islet|chaseki-bench|crag-stair`;
sample each incoming adjacent route with `--path-progress 0|0.25|0.5|0.75|1`.
Each run pins one ID and one fraction, not the literal lists. Repeat at 1200×640,
900×720 and rotated gates, noon/night and reduced motion. Station/path controls
use the production path solver, not an elapsed-time screenshot approximation.
Archive under `outputs/s8/`; picture acceptance and measured bundle/GPU deltas
remain pending orchestrator captures.



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

### Resident ecology: natural versus forced evidence

S8-P5 targeted coverage:
`npm test -- src/systems/garden-score.test.ts src/three/garden-koi.test.ts src/three/garden-heron.test.ts src/three/garden-flora.test.ts src/three/garden-threshold.test.ts`.
Keep the population, clearance, disposal and owner-budget checks; koi coverage
now asserts seeded travel/pause/turn states rather than exact loop positions.
Foliage coverage proves the same gust arrives later downwind, the merged shader
selects each root, and root/trunk/branch/tip response remains ordered.

Archive separate real-GPU 90-second tea/rest clips for daylight habitat,
including a genuine koi pause and in-place turn, and a canonical-clock interval
covering the front's passage through both near-tree rest roots. Record clock
start, wind bearing, roots, viewport, fixture and station so a long gust-free
interval is not mistaken for failed flex. Include reduced-motion stills and
night absence without raising animal brightness. These new captures are
pending until the orchestrator publishes them.

A forced `fish-ring` or heron ritual clip is **handler/appearance evidence only**.
Natural fish-ring evidence must instead observe one generated score entry
admitted inside its half-open one-second window, recording scheduled time and
actual admission with the director budget active. Also retain busy-window,
exact-expiry and hidden-resume evidence: expired gifts do not catch up. Do not
call a forced ritual natural admission, or use either clip to infer market data.


## Performance and bundle

```bash
npm run test:perf
npm run build
npm run check:bundle-size
```

Production JavaScript uses the exact-pinned Terser dev dependency with two
compression passes and its default safe transforms; do not enable unsafe
optimizations or strip localhost-only instrumentation. The aggregate and
per-chunk limits in `scripts/bundle-budgets.mjs` remain the source of truth.
For chunk/module composition, `npm run build -- --sourcemap` emits source maps
alongside the production chunks; keep analysis artifacts under `outputs/`,
not in the committed runtime.

The performance suite measures coherent startup, pacing, long tasks, GPU
resources, long-session stability, transient selection cleanup, and clock
shutdown. Current resource ceilings are 700 draw calls, 500 geometries, 72
textures, and 500,000 triangles. `npm run test:perf:reference` is the strict
reference-hardware gate; headless or integrated results are diagnostics, not a
substitute for the designated reference environment.

For a measured renderer-local draw-owner census, use the real-GPU preview:

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --draw-census --out w0-census-baseline.png
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

**Exact-frame triangle spike diagnosis (DEV only).**

The recorded long-session peaks were **566,611 / 574,545 triangles**, or
**66,611 / 74,545 over the 500,000 hard ceiling**, not 216k excess. A settled
baseline below the ceiling does not excuse those transient frames.

For the long-session spike investigation, run a visible real-GPU DEV session:

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --spike-trace --seconds 600 --json spike-trace.json --out spike-trace.png
```

`--spike-trace` opts into `?spikeTrace=1`. The renderer installs and publishes
`window.__pharosVilleSpikeTrace` during construction, before bootstrap or the
first world frame; preview checks that handle after canvas readiness, before
waiting for the session. Installation no longer depends on a periodic owner
sample or debug telemetry publication. The first real frame explicitly samples
owners, and the existing render-loop debug seam then carries the same handle at
`window.__pharosVilleDebug.renderMetrics.drawOwnerCensus.spikeTrace`.
Production builds do not install either handle or allocate the ring. Disposal
marks the last trace retired but keeps it exportable after a world unmount.
Each successor constructor publishes its own handle and imports the bounded
persisted windows, with `rendererEpoch` distinguishing repeated frame IDs.
An interrupted predecessor window stays incomplete; a successor cannot supply
its missing post frames. Preview re-reads the current global handle at export.
Call `snapshot()` only when exporting or replacing a renderer, never during
normal frame/tail polling.

Every frame records actual `renderBufferDirect` call/triangle deltas by object
identity, historical owner name and pass into preallocated storage. Shadow draws
are identified by the shadow camera; hero reflection, environment/PMREM, wake,
update, post fullscreen and post scene work remain separate. Counter resets,
shadow invalidation/refresh/resize, reflection boundaries, environment bake
counts, explicit texture uploads, model attaches, part epochs, content
replacement epochs and GPU resource counts are correlated with frame IDs,
frame time and monotonic event timestamps. Between-frame async events attach
to the next frame. Frame 0 records renderer scene/probe bootstrap.

A rising crossing strictly above **480,000 triangles** in either actual
whole-frame work or the existing reported triangle counter persists that exact
frame, up to three preceding frames and three following frames. Already-open
windows accept post frames even when another crossing opens an overlapping
window. Exports retain both actual totals and unchanged reported counters, so
reset-accounting differences are evidence, not subtracted work. The top-level
`spikeTrace` field in `--json` contains the persisted windows; stdout prints one
summary line with crossings, persisted frames, peak, incomplete windows and
dropped crossings. It exports the live trace after the session, not a selected
median/tail sample.

Storage is bounded to the first 32 crossing windows, 2,048 object/pass bins per
frame and 128 events per frame. `droppedTriggers`, `droppedDraws` and
`droppedEvents` disclose saturation; numerical actual totals still include
unattributed draws. A continuous over-threshold plateau opens one window,
not an unbounded capture per frame. End-of-session windows may be incomplete
if fewer than three post frames have occurred. This diagnostic changes no
rendering, scheduler decision or cap, but its DEV CPU/storage overhead means
it is not production timing evidence. The source attribution below comes from
the orchestrator's captured 150-second real-GPU session; the longer stability
rerun remains the orchestrator's acceptance evidence.

Ring/trigger and source-fix coverage: `npm test -- src/three/world-renderer.test.ts src/three/garden-draw-census.test.ts`.

**Measured source and scoped source fix (2026-10-05).** The mid-programme live
trace at `outputs/g/spike/trace.json` retained 15 crossings, 101 frames and a
603,073-triangle whole-frame peak, with no dropped draws/events. Late resting
crossings in renderer epoch 1 (frames 1012, 1174, 1862, 2246 and 2317) each
added **76 directional-shadow calls / 228,290 triangles**. At frame 2317,
370,176 actual recurring triangles became 598,466; the unchanged legacy
reported triangle counter was 598,298 because its reset window excludes that
frame's 168 wake triangles. This is genuine shadow work, not duplicated
ownership or an accounting error. Every late crossing had `shadow-invalidate`
bit 1 (view only), with no sun, content, attach or environment-bake change.
Idle K16 camera breath was crossing the camera re-fit threshold.

The source fix fits and keys the static map with the **unbreathed visitor
view**, derived without another per-frame view allocation. The color/picking
camera still follows the shared breathed view. Breath alone no longer
re-fits or re-bakes the map; genuine visitor pose, sun, content and tier
changes retain their refresh paths. The regression crosses the old
half-unit threshold at historical spike times, asserts unchanged shadow
matrices and no refresh request, and still requires genuine view/sun
refreshes. For the measured tree, eliminating this unnecessary pass predicts
late-session resting peaks around **370k actual triangles**, not a measured
post-fix GPU result.

**Legitimate refresh funding remains separate.** Startup, tier changes and
genuine view/sun/content refreshes can still exceed the unchanged 500k hard
ceiling with this tree's geometry. Startup reached 603,073 actual triangles,
including 11,832 PMREM triangles. The measured directional-shadow pass had:

| Shadow caster owner | Refresh triangles |
| --- | ---: |
| Rim pines (`garden-rim/garden-rim-pines`) | 41,580 |
| Lighthouse stone shell (`garden-lighthouse-shell/stone-shell`) | 26,612 |
| Rim land (`garden-rim/garden-rim-land`) | 26,198 |
| Remaining static casters | 133,900 |
| **Total** | **228,290** |

Per-frame shadow-pass cost during a legitimate refresh is a **funding decision
for the geometry owners**, not an accounting change. No cap is raised, no
real draw is subtracted, and no distant caster is removed in this packet.
The source-fix acceptance here is the historical breath-driven resting-frame
defect; it is not a claim that every legitimate refresh now fits the hard cap.

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
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture dense \
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
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture dense \
  --light-cycle --reduced --assert --out vu/h1/light.png --json vu/h1/light.json
```

`--json <name.json>` preserves metrics beside the images in `outputs/`, and
prints one `manifest <path>` line. Its sibling `capture` block (not part of
`metrics`) records the preview checkout commit and dirty paths, viewport,
requested DPR (`deviceScaleFactor`), browser DPR and effective canvas DPR,
screen, IANA timezone, headed/reduced/clean flags, WebGL vendor/renderer, browser version,
selected detail, world generation time, admitted ship detail IDs, canvas size
and total drawing-buffer pixels (`capture.canvasSize.backingPixels`),
hash, date-aware dominant sky phase (`phaseForHour`), fixture name/source epoch/
SHA-256 payload hash, and screenshot/JSON output paths. `capture.observer`
records observer origin/epoch, Date mode, calendar pin, hour pin and timezone;
`capture.shipLimit` records requested/effective capacity, the verified hostname,
ordinary count and honored status (or `null` when unused).
`capture.screenshotTiming` labels the main shot's timing.
`capture.appearance` records schema, preset, exported and applied checksum;
`capture.inspectorActive` and `capture.screenshotPhase` identify the main shot.
Missing optional evidence is `null` with a reason in `unavailable`; live data and no selection
are ordinary states. The identity is sampled beside the main screenshot,
before any pan/zoom or light-cycle probes. `scriptCheckout` describes the tree
running the preview script; the independent `servedCheckout` comes from the DEV
server's `/__pharosville/checkout` endpoint and records its real root, commit,
filtered dirty paths and runtime-source SHA-256. Production servers leave this
DEV-only identity unavailable; no serving-tree identity is inferred from the
script checkout. Ordinary previews retain a frame when that tree changes, emit
one warning and mark `servedCheckout.changedDuringCapture`; unavailable
mid-capture provenance retains the known identity with `samplingIncomplete`.
Appearance/look comparisons instead refuse mixed or unknown source evidence.
The endpoint exposes neither Git contents nor `.env*` filenames/values.

Agent shells set `CI=true`: prefix real-GPU commands with `env -u CI` and keep
the tab visible. On Linux hybrid-GPU/Wayland setups, **`--headed` is required**,
for example `env -u CI npm run preview -- --headed --fixture quiet-dense --assert --json quiet.json`.
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

For complete Chromium shader diagnostics, retain the existing
`PHAROSVILLE_PREVIEW_FULL_SHADER_LOG=1` environment switch. It expands shader
logs on the same preview lane; it does not suppress shader failures or change
the picture.

### Blind garden look selection (DEV only)

`scripts/pharosville/look-selection.mjs` invokes the **existing** preview path
serially, with explicit served URLs/checkouts and local appearance documents.
It never starts another render loop or silently chooses a localhost port.
Both trees must include the DEV lookdev bridge and serving-identity endpoint.
Export complete appearance JSON from `window.__pharosVilleLookdev.export()`;
close the panel and reset inspector overrides before collecting art evidence.
Never commit the local preset exports, raw captures or private reviewer key.

For a single preview, add `--appearance <local-json>` and
`--served-checkout <absolute-serving-tree>`. The appearance is installed before
the first scene render; the main-shot manifest verifies the exported and
applied checksum/schema/preset. An active inspector, wrong serving tree,
unapplied document or changing source refuses the comparison.

Place a matrix in `outputs/look-matrix.json`; paths are relative to that file,
not whichever checkout happens to launch the command. This example compares
two exported presets on the same serving tree; use each tree's real path and
explicit server URL when comparing code changes:

```json
{
  "schemaVersion": 1,
  "outputDirectory": "look/xy",
  "arms": [
    { "id": "a", "checkout": "..", "url": "http://localhost:5173", "appearance": "looks/a.json", "dpr": 1, "clean": true },
    { "id": "b", "checkout": "..", "url": "http://localhost:5173", "appearance": "looks/b.json", "dpr": 1, "clean": true }
  ],
  "suite": {
    "clock": "2026-10-05",
    "selectedDetailId": "ship.satusd-river",
    "fixture": "quiet-dense"
  }
}
```

Choose an actually admitted selected-detail ID from a fixture capture's
`capture.admittedShipDetailIds`; a non-admitted selection fails rather than
becoming an overview. The suite expands to 72 serial cold-browser captures:
five hours (07:00, 12:15, 18:30, 19:12, 22:00), dense/live/selected/overview
states, both 1200×640 and 900×720 gates, normal and reduced motion.

For a smaller explicit matrix, replace `arms`/`suite` with `entries`. Each entry
must supply `id`, `case`, `checkout`, `url`, `appearance`, `fixture` (known name
or explicit `null` for live), `observer: { "dateMode": "fixed" }` (live requires
`"flowing"`), `clock`, `hash` with finite `t=`, `width`, `height`, `dpr`,
`reduced`, `clean` and `stem`. Each case contains exactly two distinct arms
with identical shot inputs. Optional `seconds`, `burst` (at least two frames)
and `clip: [x,y,width,height]` reuse preview's existing burst/viewport-crop
instruments; crops are secondary and cannot replace the full frame.

```bash
node scripts/pharosville/look-selection.mjs --matrix outputs/look-matrix.json
node --test scripts/pharosville/preview-manifest.test.mjs scripts/pharosville/look-selection.test.mjs
```

Use a fresh, neutrally named output directory. The driver refuses missing or
different fixture payload SHA, observer/calendar/hour, camera, viewport,
effective/browser/requested DPR, browser/GPU, screen/timezone, motion mode,
selection, screenshot phase or timing. Served code and appearance may differ
intentionally. Live captures hash the actually observed API JSON and require
complete responses; changing live data refuses the pair, never substitutes a
fixture or silently relaxes the equality gate.

Share only anonymous `full-NN.png` sheets and `review.json` with the reviewer.
X/Y is randomized per case; **all full-frame sheets precede** secondary
`detail-NN-MM.png` motion/crop sheets. Keep raw named-arm captures and the
owner-readable (`0600`) `private-xy-key.json` private until the choice is made.
Record X/Y first, then cold-recapture the winning case using its original key:

```bash
node scripts/pharosville/look-selection.mjs --key outputs/look/xy/private-xy-key.json \
  --winner hour-12-25-1200x640-reduced:X --out outputs/look/winner
```

The winner capture must match the original evidence inputs and winning
served commit/source hash and appearance checksum. A stale winner, nonzero
preview exit (including unmeasured exit 78), mismatch or reused output
directory cannot qualify as art evidence.


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
judge look or frame time: it resolves the operator's Chrome and verifies the
actual WebGL renderer. Wrapper flags alone do not guarantee hardware, and a
Playwright browser with GPU flags is merely no longer crippled.

A software frame looks approximately right and reports fiction, which is the
worst combination: it invites tuning the renderer against a bottleneck that does
not exist. Use:

```bash
env -u CI npm run preview -- --headed              # default framing
env -u CI npm run preview -- --headed --hash "#t=22&n=1" --out night.png
env -u CI npm run preview -- --headed --seconds 8
```

`preview.mjs` resolves the operator's own Chrome per platform. On Linux that is
deliberately the WRAPPER (`/usr/bin/google-chrome-stable`), which applies
`chrome-flags.conf`; it is necessary on this setup but **not sufficient**.
**Measured correction, 2026-10-05 (RTX 5070 Ti):** headless `npm run preview`
through that wrapper resolved to ANGLE SwiftShader and was refused. Adding
`--headed` reached `ANGLE (NVIDIA ..., OpenGL 4.5.0)` at tier `full`.
Use `--headed` on Linux hybrid-GPU/Wayland setups; do not rerun headless to
reinterpret that observation. Every measurement must record actual WebGL
renderer/vendor identity and tier, not infer hardware from the launch command.

On macOS the app bundle reaches the GPU through ANGLE/Metal (historical
measurement, 2026-08-13 on an M5 Pro: `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro)`,
120 fps, tier `full`). This is not Garden Observatory acceptance.
Override either executable with `--chrome <path>`. The SwiftShader assertion
remains unchanged on every platform and is what makes the reading honest.

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
env -u CI npm run preview -- --headed --assert
env -u CI npm run preview -- --headed --assert --max-p90=20 --max-draw-calls=700 --require-tier=full
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

The legacy `frame`, `tail`, `sweep`, `metrics` and `tailSweep` still describe all
reads, including refresh-contaminated windows; their JSON keys retain their
meaning for existing consumers. The `rest` line and additive
`performanceEvidence.steadyState` report the median-p90 **clean** window and the
worst clean-window p95. **`--assert` gates resting p90 and worst resting p95** at
the same unchanged limits. A slow resting frame is never relabelled a refresh
merely because it was slow. p99, worst single frame and long tasks remain
observability rather than additional timing gates.

An allocation-free **DEV-only** capture observer consumes the existing
per-frame debug publication before its mutable global update, without a second
RAF. It survives React deleting/recreating that global during refreshes, so the
first heavier frame is recorded too. The callback is removed from production
builds; animated steady-state classification on an older/production bundle is
**SKIP (78)**, not invented evidence. Reduced-motion resource gates are unchanged.
Refresh markers are actual shadow-map submissions, uploaded/pending atlases and
logo repaint generations, world/content rebuilds, environment bakes, GPU
warm-up, tier changes and disjoint query results. The full 120-frame pacing ring
must age beyond the latest marker before a visible window counts as resting.
Missing shadow telemetry, no complete clean window or a replaced observer
(`coverageBreaks`) cannot pass the timing gate.
Registration replaces and disposes its previous owner rather than chaining
callbacks. Disposal is idempotent and cannot detach a newer owner; repeated
reads of one lost callback count one coverage break, not one per read.

The `refresh` line and `performanceEvidence.frames.refresh` retain frame counts,
CPU render mean/max and draw/triangle/geometry/texture peaks; the corresponding
`steady` counters retain ordinary-frame peaks. `refreshWindows` reports the
worst contaminated (or unclassified) pacing window separately, not a fabricated
refresh-only percentile. CPU work attribution names each observed cause and the
largest associated CPU span; coincident causes overlap and are not isolated
pass costs. **Every observed resource peak, including refreshes, remains gated
by the unchanged hard caps.** Refresh work does not earn a budget exemption.

`dominant` names the largest **refresh-free** per-pass GPU timer reading, with
its basis. GPU rings are separate from pacing: whole-frame/per-pass queries
alternate, and disabled or stalled tracks retain old results. Each track must
complete more than **120 retained + 8 potentially pending** queries beyond its
last refresh baseline before being labelled clean. The new cumulative
`samplesCompleted` / `frameSamplesCompleted` scalars establish that provenance
without changing query lifecycles or sample windows. Unflushed/older-bundle
results remain unclassified rolling readings; requested GPU assertions are
SKIP (78) if no clean whole-frame ring was measured. ANGLE Metal still refuses
`--max-gpu-ms` and its spans cannot establish causal/removable pass cost.
Use serial uncapped knockout comparisons for that claim. No GPU timer reading
is inferred from CPU render time, refresh peaks or display cadence.

Focused coverage: `node --test scripts/pharosville/preview.test.mjs scripts/pharosville/preview-experience.test.mjs`;
`npm test -- src/three/world-renderer.test.ts` covers actual shadow submission
telemetry. These tests do not supply hardware calibration.

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
env -u CI npm run preview -- --headed --assert --reduced
env -u CI npm run preview -- --headed --assert --reduced --hash "#sel=ship.satusd-river&t=12"
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
env -u CI npm run preview -- --headed --artifact-check --hash "#t=22"
```

It samples eight canvas frames at 120ms intervals on a 96×60 luminance grid,
fails only on coherent frame-wide flashes, and writes transition evidence to
`outputs/artifact-flash-evidence.json`. Ordinary local water and ship motion is
below its coverage threshold. Use `--quick-find` and `--hover-first` when those
chrome states belong in a visual review matrix.

The polling probe also reports whether renderer content was actually replaced:

```bash
env -u CI npm run preview -- --headed --refresh common
```

`content roots` must remain stable and `content` should report
`renderer-equivalent` for a sub-band supply refresh; a true authored change is
still expected to replace content.

`--refresh … --json` now retains `instruments.refresh`: the warm-up arm (timing
excluded), all three timed long-task rounds, V8 stage attribution and the
overhead-included profiled/Blink-traced arms. Each arm independently records
per-frame draw/triangle/geometry/texture peaks and explicit work counts, with
`resources.complete` identifying whether the DEV observer captured it fully.
These provoked arms run after the resting gate and never replace its timing
evidence. Their resource peaks still fail `--assert` on any unchanged hard-cap
breach, including warm-up and profiled arms. Because this probe owns
`page.clock`, CPU frame-interval fields are not claimed as resting timing;
refresh CPU evidence remains the native long-task/profile/trace measurements.

### M5 Pro calibration — Garden Observatory

**Evidence: pending hardware.** S9-P5a delivers this protocol, not M5
measurements. The RTX captures and the historical M5 reading above cannot
approve `feat/garden-observatory`; S9-P5b requires an actual Apple M5 Pro.

**Paired environment.** Record baseline and candidate served commit/dirty
paths, asset hashes, fixture payload hash/source epoch, macOS and Chrome
versions, WebGL renderer/vendor, display size/refresh rate, CSS viewport and
screen, requested/browser/effective DPR, canvas backing dimensions and total
backing pixels. Baseline is the programme's recorded pre-change checkout
(`ccbfca8`); candidate is the integrated Garden Observatory checkout under
review. Serve the same checkout as the preview script, one at a time, with
equivalent build mode and data. Never compare a live-data arm with a fixture arm.

Plug into mains power; keep the same display, browser, power mode, timezone
and background workload. Keep Chrome headed and the measured tab visible and
foregrounded throughout; record visibility and observer advancement. Record
thermal state before/after and cooldown between arms. Run all GPU jobs
**serially** (including reference tests); no parallel server/capture/knockout
workload. Alternate baseline → candidate and candidate → baseline in repeated
paired rounds rather than approving a best run.

**Cold and warm are separate evidence.** Cold means a newly launched browser
with a fresh profile/cache after cooldown; record time to first coherent frame
without discarding startup. Warm means the same asset/data workload has loaded,
uploads have drained and pacing has settled before the 60 s tail. A fresh
`preview` process creates a cold browser, even if its later tail is warm
steady-state evidence; do not label that as a cached warm navigation. For a
warm-start claim, explicitly record a repeat navigation in the same browser
and its cache state. Do not average cold startup away into warm pacing.

**Matrix, independently in each arm:** requested DPR `1` and `2`, normal rest
at day, night (`t=22`), selected ship (a verified admitted detail ID), dense
fleet (`dense` fixture), and overview (`cam=0,0,0.28`). Retain matching fixture,
clock/date, selection and camera between arms. Include both gate profiles
`1200×640` and `900×720`, the `1600×1000` reference frame, and settled
reduced-motion resource/picture counterparts. Confirm actual phase, selection,
full tier and effective DPR in the manifest: a DPR-2 request that was clamped
is not proof of rendering at effective DPR 2.

Each animated matrix cell needs a **≥60 s pacing tail** after settle, recording
p50/p90, worst-window p95, p99/worst frame, long tasks, continuity/gaps, tier,
resources and upload/cache epochs. Separately run **≥600 s stability** for
rest/night/selected/dense/overview at each DPR, with tail and stats watch both
covering the full interval; verify their recorded overlap rather than treating
a short tail as long-session evidence. Report peaks and drift, including exact
triangle-spike frames when using the DEV trace. A still, median window or
reduced-motion frame cannot supply animated pacing evidence.

Example warm settled-tail and long-session recipes (repeat for both arms,
DPRs and states with unique paths; `baseline` below is an output label):

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --still-camera --width 1600 --height 1000 --dpr 1 --tail-seconds 60 --draw-census --texture-census --assert --out m5/baseline/dpr1-rest.png --json m5/baseline/dpr1-rest.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --fixture-clock flowing --hash '#t=12.25' --still-camera --width 1600 --height 1000 --dpr 1 --stats --watch-seconds 600 --tail-seconds 600 --draw-census --texture-census --assert --out m5/baseline/dpr1-rest-long.png --json m5/baseline/dpr1-rest-long.json
env -u CI npm run test:perf:reference
```

The strict reference suite records `timeToFirstCoherentFrameMs`; acceptance
requires **startup ≤2.5 s**, **full tier**, **p90 ≤20 ms** and
**worst-window p95 ≤20 ms**, with unchanged hard and acceptance budgets (`CONTRACTS.md`, "Light, palette, water and rendering budgets").
Preview's default `--assert` enforces the hard resource ceilings, not the
tighter rest allocation: reconcile the census and peaks against both columns.
Report every paired run, missing field, clamp, shader error and failed gate.
Exit 78, missing M5 hardware or missing timing/identity is **not measured**,
never an acceptance or a reason to enlarge a cap.

**Metal cost attribution.** ANGLE Metal timer queries are overlapping,
nonadditive command-buffer spans. Never sum per-pass “GPU ms” or a Σ knockout
delta into a whole-frame saving. Use separate **serial uncapped**
`--knockout-compare` rounds at each DPR/state for causal knockout − baseline
p50/p90 deltas, recording the sign, paired runs and thermal conditions. These
throughput diagnostics are distinct from the capped, shipped-all-passes-on
pacing gate; an effect-disabled arm does not demonstrate final full-tier
acceptance. Signed owner resource deltas remain bounded by the budget table.

| Garden Observatory evidence slot | Required record | Status |
| --- | --- | --- |
| Device and paired identity | Actual M5 Pro, environment, baseline/candidate revisions, renderer and manifests | Pending hardware |
| Cold/warm startup | Cache/thermal state and coherent-frame timing for both arms, ≤2.5 s | Pending hardware |
| DPR 1 / 2 matrix | Rest/night/selected/dense/overview, gate/reference sizes, effective DPR and backing pixels | Pending hardware |
| ≥60 s tails | Full tier, p90 and worst-window p95 ≤20 ms, continuity and long tasks, both arms | Pending hardware |
| ≥600 s stability | Matched watch/tail overlap, resource peaks/drift and exact spike evidence, both arms | Pending hardware |
| Settled reduced motion | Complete picture, zero-RAF and resource counterparts, both arms | Pending hardware |
| Owner/cost reconciliation | Signed resource offsets, serial uncapped knockout deltas, unchanged caps | Pending hardware |
| Strict reference gate and verdict | Attached reference-suite output and all failures/skips; no RTX substitution | Pending hardware |

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
| `--station <id>` / `--path-progress <0..1>` | Before settling, visit an authored station (`inlet-mouth`, `north-deck`, `mole-end`, `crane-islet`, `chaseki-bench`, `crag-stair`); optional progress freezes that previous-station→destination route at an exact sample. Requires the DEV stroll API and a successful action; rejected actions fail rather than fabricating camera state. Progress requires a station; shell captures cannot select one. Requested inputs are recorded in `capture.stroll`. |
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
env -u CI npm run preview -- --headed --uncapped --knockout-compare ao,bloom,smaa,rays,reflection,grade,water-lanes
env -u CI npm run preview -- --headed --still-camera --hash "#t=18.3" --burst 9 --interval 600 --clip 900,700,500,250 --burst-sheet
env -u CI npm run preview -- --headed --still-camera --stats --watch-seconds 600
env -u CI npm run preview -- --headed --fixture quiet-dense --fixture-clock flowing --hash '#' --still-camera --stats --watch-seconds 300 --tail-seconds 300 --assert --out vu/c1/watch-smoke.png --json vu/c1/watch-smoke.json
env -u CI npm run preview -- --headed --fixture calm --clock 2026-09-26 --hash "#t=12.25" --metrics --value-plan --json noon.json
env -u CI npm run preview -- --headed --clock 2026-09-26 --hash "#t=22" --metrics --temporal --night-water --out night.png
env -u CI npm run preview -- --headed --clock 2026-09-26 --hash "#t=19.2" --ritual kindling --ritual-wait 20000 --out kindling.png
```

**Cost claims.** The `gpu` line prints non-additive per-pass timer readings.
On ANGLE Metal they are overlapping command-buffer spans: they do not sum to the
frame, and a pass's reading is not what removing it saves. `--max-gpu-ms` is
therefore refused on Metal (exit 2). Pass costs come from `--uncapped
--knockout-compare`. Run arms serially, never beside another GPU job: uncapped
runs heat the GPU.

**Hour stills (K17 / S8-P7).** Small-screen visitors receive a useful branded
edition before any still exists. The local-hour beat (`stillForLocalHour` in
`src/client.tsx`) is an illustration, not live readings; size guidance follows
the encoding guide and working analytics links. Renderer failure is different:
it retains selectable `WorldStaticOverview`, never these stills.

`agents/2026-10-05-garden-levers/destination/social-crops.json` lists all ten exact
serial `outputs/cap.sh` commands, fixed fixture/date and pixel crop rectangles.
After integrated art acceptance, the orchestrator captures and reviews the
landscape/portrait five-beat matrix and OG crop, then sets `accepted: true`.
Pending or missing inputs cannot publish. Use only the real-GPU clean rest lane;
do not promote the legacy harbour stills or synthetic encoder-test pixels.

```bash
node scripts/pharosville/generate-garden-social.mjs --manifest agents/2026-10-05-garden-levers/destination/social-crops.json
node --test scripts/pharosville/generate-garden-social.test.mjs
npm test -- src/client.test.tsx src/systems/viewport-gate.test.ts functions/index.test.ts src/systems/garden-arrival.test.ts
```

The offline generator uses installed ImageMagick (AVIF/JPEG/PNG support) and the
repo-local EB Garamond WOFF2 font through FreeType; no network or runtime package
is added. Same inputs and encoder build yield identical hashes. It writes five
1200×750 landscape and five 720×900 portrait images in both AVIF and JPEG,
each ≤90,000 bytes, plus the branded 1200×630 `public/og-card.png`. Publication
metadata records source/crop/output hashes and is written last. Regenerate and
ship all outputs together whenever accepted art/seat changes, and each release.

Review 390×844, 844×390 and a capable device with a blocked window, a missing
publication, failed image, no-JS/module failure and the OG thumbnail. Check that
only the selected crop/encoding transfers, the guide/links remain legible, no
world/API/GLB/logo request occurs below the sorted gate, and admitted desktop
loads no still or publication marker. Exercise both sorted admission profiles,
rotated companions, one-pixel shrink/remount. Inline script bytes and their CSP
hash are unchanged; no inline styles/handlers or CSP relaxation are introduced.

**Serial DPR-2 baseline.** Every ms claim cites the baseline table taken on
the operator's MacBook: run the default and each gate hash one after another,
once at `--dpr 1` and once at `--dpr 2`, each `--uncapped` and each with its own
`--knockout-compare` when pass costs are in question. For example:

```bash
env -u CI npm run preview -- --headed --uncapped --dpr 2 --hash "#t=12.25" --json dpr2-noon.json --out dpr2-noon.png
env -u CI npm run preview -- --headed --uncapped --dpr 2 --hash "#t=22" --json dpr2-night.json --out dpr2-night.png
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
env -u CI npm run preview -- --headed --assert --hash "#cam=0,0,0.28"
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

## Garden sound consent and blind audition (S8-P6)

Run `npm test -- src/lib/pharosville-audio/bed.test.ts src/lib/pharosville-audio/borrowed.test.ts src/hooks/use-garden-sound.test.tsx src/three/garden-island.test.ts`.
These cover canonical source/eye writes and root gust, visual-night hush,
muted/Still scheduling, mode cleanup, the six-voice ceiling, basin grounding
and disposal, stored armed consent, and no context/chunk before the Sound gesture.
The bowl, spout and dark mouth must share the existing stone draw; preserve the
42-draw merged island assertion, with no dedicated basin material or wet draw.

On a real browser, keep the network panel open before any gesture: neither a
fresh visit nor stored `{v:1,on:true,music:true}`, Music, drawer opening, unrelated
input or `?debug=1&audio=record:N` may request `pharosville-audio-*.js` or create a
context. Its own Sound switch must explain shore water, pine wind, basin drips
and distant harbour work. Only that explicit switch gesture starts the chunk.
At noon and night, audition rest, shore, pines and a far station using the
canonical visual clock. Confirm distance/pan and sheltered basin hearing, the
root gust and visible foliage agree, night is hushed and harbour work rests.

Capture Sound-off, stored-armed, hidden/resume, Still and OS reduced-motion
states. Hidden stops scheduling, fades/suspends and resumes without backlog;
Sound-off/Still silences and closes immediately. Still must not allocate an
engine/chunk; leaving it must require another Sound gesture. Verify listener
and timer cleanup on unmount/remount. Save scene/basin crops at noon/night with
the gull landing unchanged; frame statistics are not audio recordings.

With motion enabled, `?debug=1&audio=record:N` now waits for the explicit Sound
gesture before its offline audition. Save WAV, stem/peak table and six-voice
report, then compare equal-level randomized old/new headphone and speaker
auditions. Accept a quiet stone/water basin rather than a bell/knock costume,
with shore/hiss energy displaced, no increased loudness and ≤−6 dBTP.
Forced/offline scores are auditions, never evidence of natural event admission.
Stem/peak evidence, blind preference and headphone/speaker acceptance remain
pending until the orchestrator records them; no hardware/audition claim is made here.

## Release confidence

```bash
npm run validate:release
npm run smoke:live -- --url https://pharosville.pharos.watch
```

Report the checks actually run and anything intentionally skipped. A green
local run does not authorize a manual tag or GitHub Release; follow
`RELEASES.md`.
