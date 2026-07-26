# PharosVille Three.js rendering-cleanliness audit and implementation plan

Date: 2026-07-27
Audited revision: `3e1b4cd` on `main`
Scope: the current React/Three.js/WebGL application, its runtime contracts,
browser chrome, visual test coverage, and rendering-related documentation.

## Outcome

The migration itself is structurally sound, and the real-GPU steady state is
fast. The current problems are primarily authored visual layers and lifecycle
work, not a broken renderer:

- The random blue “mountains” in the reported screenshot are the three
  `garden-horizon.ts` silhouette cards. They are being drawn inside visible
  water instead of reading as a distant horizon.
- The large pale wedges are the lighthouse's 10-triangle ray fan plus its inner
  cone, outer cone, plane fallback, and water lane. Too many versions of the
  same cue are visible at once.
- The water is simultaneously carrying posterized depth bands, region tints,
  region seams and shadows, current/foam, light lanes, reflections, weather,
  and surface texture. The layers are individually intentional but collectively
  read as overlapping transparent polygons.
- Several intentional effects can present as faults: hard-edged beacon
  posterization, stepped beacon jitter, the danger-zone flash plane, and one
  remaining hard spatial `step()` in the water light-lane shader.
- The ordinary frame is a clean 60 fps on the operator's real GPU, but a common
  data refresh causes a roughly 236 ms busy interval and rebuilds all world
  content. Reduced-motion frames also exceed the documented 500k-triangle
  ceiling after asynchronous assets settle.
- The size gate is correctly orientation-free, but its current `720×360`
  passing boundary produces a severely cropped, unchartable world.

There are no verified P0 failures. The first implementation round should remove
or simplify visual layers before introducing any new rendering technique.

## Audit method and constraints

- Ran the repository onboarding flow and read the task-routed architecture,
  Three.js, testing, asset, and visual-invariant documentation.
- Ran `npm run validate`, `npm run test:visual`, and `npm run test:perf`.
- Judged appearance and frame behavior only through `npm run preview`, using
  the operator's Chrome wrapper and NVIDIA RTX 5070 Ti. The Playwright lanes
  were treated as correctness checks only.
- Reviewed day, noon, night, reduced-motion, selected-detail, legend,
  whole-map, minimum-size, tall, and ultrawide states.
- Traced each visible artifact to its owning source rather than inferring from
  screenshots alone.
- Kept the product contract from the local Impeccable design context: calm,
  precise, contemplative, sea-first, data-truthful, and rich only where the
  richness earns its place.

This is a comprehensive audit of reachable current paths, not a claim that no
future payload or GPU/driver combination can reveal another defect. The plan
adds specific coverage for the unguarded paths found during exploration.

## Baseline evidence

### Automated lanes

- `npm run validate`: green.
- 117 unit-test files passed, 2 skipped; 1,320 tests passed, 2 skipped.
- `npm run test:visual`: 12/12 green.
- `npm run test:perf`: 7/7 green.
- Typecheck, lint, build, bundle-size, secret, runtime-media, color, docs, and
  viewport-gate checks passed.
- Test output is nevertheless noisy with repeated Node `localStorage`
  experimental warnings and jsdom
  `HTMLCanvasElement.getContext is not implemented` messages.

### Real-GPU observations

Scratch captures are under `outputs/` and must not be committed.

| State | Result | Important observation |
|---|---:|---|
| Default live-time | 60 fps, p90 16.7 ms, 671 calls, 312k tris | Stable full tier; visual density is high |
| Noon | 60 fps, 670 calls, 314k tris | Horizon cards and water facets are conspicuous |
| Night | 60 fps, 677 calls, 314k tris | Lighthouse ray fan dominates the frame |
| Reduced motion | Static as designed, 633 calls, **536k tris** | Exceeds the 500k triangle ceiling |
| Selected detail | 466 calls, **502k tris** | Large cue shaft, buoy litter, seams, and reflections compete |
| Whole-map `#cam=0,0,0.28` | 60 fps, 402 calls, 345k tris | Old 909-call documentation is stale |
| Minimum active `720×360` | 60 fps, 289 calls, 263k tris | World passes the gate but is severely cropped |
| Candidate `720×540` / `720×640` | 60 fps, 303/329 calls, 258k/264k tris | Better, but the lighthouse still meets or crosses the top edge before panel-fit testing |
| Tall `720×1000` | 60 fps, 431 calls, 282k tris | Correctly mounts; horizon triangles visibly cross the water |
| Ultrawide `2560×720` | 60 fps, 654 calls, 330k tris | Entire composition is fast but crowded and visibly faceted |
| Common refresh probe | 236 ms busy, 186 ms blocking | One long task; full content replacement is visible-hitch risk |

The default frame has only about 30 draw calls of headroom under the documented
700-call ceiling. This is sufficient for cleanup, but not a reason to add more
effects.

## Audit scorecard

The five Impeccable technical dimensions score **15/20 (Good)**, but that score
does not capture authored 3D cleanliness, which is **1/4 (Major problems)**.

| Dimension | Score | Reason |
|---|---:|---|
| Accessibility | 3/4 | Strong DOM parity, keyboard behavior, focus handling, fallbacks, and reduced motion; some targets and dynamic-over-scene contrast are too weak |
| Performance | 3/4 | Excellent real-GPU steady state; refresh hitch, reduced-motion triangle overrun, and narrow draw-call headroom remain |
| Theming | 3/4 | Central Three palette and useful CSS tokens; many one-off translucent colors and effect strengths remain |
| Responsive | 3/4 | Correct size-only lazy gate and tall-window behavior; passing minimum is not usable and active-runtime edge states lack coverage |
| Anti-patterns | 3/4 | Distinctive product, but effect stacking, tiny uppercase copy, grid overlays, and wide shadowed cards add avoidable noise |

## Verified issue inventory

Severity definitions:

- **P1:** clear user-facing defect, WCAG AA failure, or recurring runtime hitch.
- **P2:** meaningful quality, legibility, coverage, or maintenance problem.
- **P3:** polish or hygiene debt with limited immediate user impact.

### P1 — fix first

| ID | Issue and evidence | Primary owners |
|---|---|---|
| V-01 | Three fixed vertical triangle-fan horizon cards appear as blue mountains floating in the water. The defect is strongest in tall and wide frames and exactly matches the supplied screenshot. | `src/three/garden-horizon.ts` |
| V-02 | The lighthouse simultaneously renders an inner cone, outer cone, plane fallback, 10-ray fan, dust, and water reflection. The fan creates giant pale wedges across ships and water, especially at night. | `src/three/garden-lighthouse.ts`, `garden-day-cycle.ts`, `world-renderer.ts`, `garden-water.ts` |
| V-03 | Four hard bathymetry bands, strong region tints, seam highlight/shadow, foam, and texture combine into large cyan/navy polygons. The water's analytical hierarchy is unclear. | `src/three/garden-water.ts`, `garden-zones.ts` |
| V-04 | At `720×360`, the world mounts and fetches data but the lighthouse and harbor are heavily cropped and the footer overlays the already compressed scene. This violates the gate's “room to chart” intent. | `src/systems/viewport-gate.ts`, `client.tsx`, gate tests |
| V-05 | A common refresh causes about 236 ms of main-thread work. `replaceWorldContent()` disposes and recreates all content even when most rendered entities are unchanged, risking a freeze or flash at each poll. | `src/three/world-renderer.ts`, world-data/render-loop integration |
| V-06 | Multiple flicker sources can read as rendering instability: 9 Hz stepped beacon jitter, hard shader posterization, a 0.4 s danger-zone flash every 9–14 s, and the water lane's raw `step(-2.0, along)`. | `garden-beacon-fire.ts`, `garden-zones.ts`, `garden-water.ts` |
| V-07 | Settled reduced-motion frames render 536k triangles by default and about 502k in a selected-detail state, over the documented 500k ceiling. Current perf coverage does not sample this settled static path. | renderer resource policy, `preview.mjs`, perf specs |
| V-08 | The 20×20 notice dismiss control fails WCAG 2.2 target-size minimum. Detail “Copy link” and “Close” are separate 13 px text controls with no minimum hit area. | `src/pharosville.css`, notice and detail components |
| V-09 | The composition has lost its intended sea-first negative space: 186 ships plus signs, wakes, reflections, seams, buoys, tenders, rays, and weather regularly overlap. The analytical fleet should remain; subordinate decoration needs a stricter feature budget. | `world-renderer.ts` and all garden effect owners |

### P2 — important refinement and hardening

| ID | Issue and evidence | Primary owners |
|---|---|---|
| V-10 | At minimum zoom, the authored water detail/fog transition reads as a finite textured slab rather than continuous open ocean. | `garden-water.ts`, camera/fog configuration |
| V-11 | Zone boundary buoys are dark five-sided cones placed 5–24 times per region. They are hidden only in overview; in explore/analyze they resemble scattered black debris. | `garden-zones.ts`, `world-renderer.ts` |
| V-12 | The selected/hover cue combines a depth-test-disabled ring with a 3.4-unit translucent vertical cylinder. It reads as a ghost object and can draw through unrelated geometry. | `world-renderer.ts:createCueMarker` |
| V-13 | Hero reflections use high-alpha transparent planes and can read as rectangular smears rather than reflections, especially where they overlap wakes and region seams. | `garden-hero-reflections.ts` |
| V-14 | Footer/status copy is 0.72 rem at 40–55% opacity over a changing WebGL background, truncates aggressively, and is difficult to discover or read. | `pharosville.css`, footer component |
| V-15 | Quick-find rows, metadata, notices, and several eyebrows use 0.64–0.82 rem text. Result rows are small pointer targets, and the metadata hierarchy is too faint over the scene. | `pharosville.css`, quick-find and notice components |
| V-16 | Static contrast-pair tests pass, but do not evaluate semitransparent text and controls over day/dusk/night WebGL backgrounds or during bright beam/foam crossings. | color guard, CSS, preview review matrix |
| V-17 | The first-visit legend is long enough that “Watch harbor” can fall below its initial viewport, weakening the intended onboarding handoff. | `components/legend-panel.tsx`, panel CSS |
| V-18 | Active-runtime layout is not covered at the actual minimum, the new usable minimum, tall desktop, or ultrawide sizes. Existing browser checks mainly cover the blocked gate and standard desktop. | visual specs, viewport specs |
| V-19 | Current visual tests verify a nonblank frame, telemetry, and DOM behavior but contain no artifact-specific protection. Blue horizon triangles and giant beam wedges pass all 12 checks. | visual specs and real-GPU preview tooling |
| V-20 | The selected transient-outsider path beyond the 320-ship ordinary fleet cap remains explicitly unexercised. | world/fleet visual and capacity specs |
| V-21 | A green unit run prints many irrelevant `localStorage` and canvas-context warnings, making real regressions easier to miss. | Vitest/jsdom setup and mocks |
| V-22 | Rendering ownership is concentrated in very large files: ships 2,286 lines, world renderer 2,098, island 1,850, water 1,669, docks 1,634, render loop 1,341, CSS 1,527. Shader/effect debugging is harder than necessary. | named files |
| V-23 | `pharosville-world.tsx` uses a file-wide `react-hooks/refs` disable, weakening enforcement for unrelated code in the file. | `src/pharosville-world.tsx` |
| V-24 | Architecture/runtime facts still describe a landscape-orientation requirement, contradicting the implemented and required size-only gate. Testing docs still report the old 909-call whole-map debt and 9/9 visual count. | `ARCHITECTURE.md`, generated `RUNTIME_FACTS.md`, generator, `TESTING.md` |

### P3 — cleanup

| ID | Issue and evidence | Primary owners |
|---|---|---|
| V-25 | The shell adds two repeating grid gradients with `mix-blend-mode: soft-light` over an already detailed scene. | `pharosville.css` |
| V-26 | Several cards combine borders with wide 16–40 px shadows; repeated tiny uppercase tracked eyebrows also add chrome noise. | `pharosville.css` |
| V-27 | Old `output/` contains historical screenshots and probe scripts despite the repository standardizing scratch artifacts under `outputs/`. | `output/` |
| V-28 | Long implementation-archaeology comments and stale lane labels obscure current ownership. Clean them only after behavior is stable. | large Three/render-loop files |

## Implementation plan

### Phase 0 — lock the baseline and prevent accidental scope growth

- [x] **0.1 Create the visual review matrix.**
  - Record deterministic hashes for noon, dusk, and night.
  - Cover default, selected-detail, legend, quick-find, reduced-motion, active
    minimum, tall, standard, whole-map, and ultrawide states.
  - Keep captures in `outputs/`; do not commit scratch images.
  - Record fps/p90, quality tier, calls, triangles, geometries, textures, and
    visible fleet for every real-GPU run.

- [x] **0.2 State the protected invariants in the implementation PR.**
  - Preserve one renderer and one RAF owner.
  - Preserve all 186 analytical ships and the 320-cap contract.
  - Preserve terrain-classified risk water and DOM parity.
  - Preserve reduced-motion as a deterministic, no-RAF frame.
  - Preserve the pre-import size gate and same-origin `/api/*` boundary.
  - Add no new metaphor, data channel, post-processing pass, renderer, or asset
    system in this cleanup.

### Phase 1 — remove the visible artifacts

- [x] **1.1 Remove the horizon silhouette cards (V-01).**
  - Recommended change: delete the three vertical silhouette fans and rely on
    the existing sky/fog/open-ocean treatment for distant depth.
  - If a horizon accent is retained, it must be clipped/placed beyond every
    legal camera framing and must not resemble terrain inside a risk water body.
  - Add a focused ownership test so no vertical horizon mesh can re-enter the
    playable water bounds.
  - Acceptance: no flat blue triangle or mountain-like shape appears at
    `720×1000`, `1440×1000`, `2560×720`, or whole-map zoom at any time of day.

- [x] **1.2 Collapse the lighthouse to one primary volumetric cue (V-02).**
  - Remove the 10-triangle ray fan first.
  - Review whether both the outer cone and plane fallback are still necessary;
    keep the minimum combination that survives quality-tier fallback.
  - Retain the water reflection lane only if it reads as reflected light rather
    than a second beam.
  - Reduce depth-test/render-order exceptions so the beam does not paint over
    foreground ships indiscriminately.
  - Acceptance: at dusk/night a viewer sees one directionally coherent beam;
    no giant radial sunburst crosses the harbor; reduced/constrained tiers
    remain semantically equivalent.

- [x] **1.3 Rebalance the water visual hierarchy (V-03, V-10).**
  - Replace `floor(depth * 4)` hard bathymetry quantization with softened band
    transitions or a continuous limited-palette ramp.
  - Lower region-tint strength and keep danger distinguishable without turning
    each region into a translucent polygon.
  - Narrow/dim the region seam and its shadow; retain only the edge strength
    needed to understand the real terrain boundary.
  - Reduce foam/current contrast where it competes with ship silhouettes.
  - Audit the far-water blend so the detailed sea does not terminate as a
    visible rectangle/slab at whole-map framing.
  - Keep classification, placement, DOM wording, and body membership unchanged.
  - Acceptance: water reads first as a continuous sea, second as distinct risk
    bodies, and only third as animated surface detail in day, dusk, and night.

- [x] **1.4 Remove fault-like flicker while preserving calm motion (V-06).**
  - Remove the danger-zone flash plane; rain and the region treatment already
    carry the warning, including in DOM.
  - Replace the beacon's 9 Hz stepped hash with smoothly interpolated,
    lower-amplitude variation.
  - Anti-alias the beacon's hard spatial posterization with `fwidth`-based
    transitions while retaining a graphic flame.
  - Replace the remaining raw water-lane spatial `step()` with the existing
    anti-aliased helper.
  - Check region-ID texture transitions during subpixel pan/zoom for shimmer.
  - Build a short real-GPU frame-difference probe through the existing Chrome
    wrapper; it should flag single-frame full-area flashes, not ordinary water
    or ship motion.
  - Acceptance: no full-zone flash, hard one-frame lane cutoff, or high-frequency
    beacon strobe in normal motion; reduced motion is perfectly static.

- [x] **1.5 Enforce a scene-effect budget (V-09).**
  - Inventory every visible layer at overview, explore, and analyze semantic
    zoom.
  - For each state, keep the analytical fleet and at most one primary cue per
    concept; hide or attenuate subordinate decoration.
  - Resolve overlaps in this order: selected entity, analytical ship
    silhouettes, risk body, lighthouse/island, labels/signs, decoration.
  - Acceptance: meaningful sea-colored negative space remains around the island
    in standard and ultrawide frames without reducing fleet truth.

### Phase 2 — refine secondary Three.js cues

- [x] **2.1 Make buoys intentional rather than litter (V-11).**
  - Show full boundary buoy fields only for the selected/hovered risk region, or
    reduce the ordinary field to a few stable landmark buoys.
  - Shorten/slim the body and reduce near-black mass while preserving a
    non-color boundary cue.
  - Keep overview suppression and reduced-motion behavior.
  - Acceptance: analyze view no longer contains dozens of unexplained dark
    cones, and the selected region remains understandable.

- [x] **2.2 Replace the cue shaft with a compact selection treatment (V-12).**
  - Prefer a waterline/ground ring plus subtle outline or short beacon.
  - Scale it against target size and camera zoom; do not draw a tall translucent
    cylinder through unrelated foreground geometry.
  - Preserve reliable keyboard/URL selection discoverability.
  - Acceptance: hover and selected states are distinct, visible on all risk
    colors, and unmistakably UI cues rather than world objects.

- [x] **2.3 Tune or remove rectangular hero reflections (V-13).**
  - Reduce peak alpha and plane width/reach, and soften the quad's rectangular
    footprint.
  - Gate reflections where wake, foam, or risk seams already occupy the same
    pixels.
  - If a reflection does not remain recognizable at ordinary explore zoom,
    remove it instead of adding another pass.
  - Acceptance: reflections visually attach to their hulls and never resemble
    a blurred rectangular sprite.

- [x] **2.4 Verify transparent ordering and depth behavior.**
  - Review render order, `depthTest`, `depthWrite`, and `transparent` settings
    for beam, cue, reflection, wake, weather, and water accent meshes.
  - Use transparency only where it contributes to the final reading.
  - Acceptance: panning/zooming cannot flip which translucent layer appears in
    front, and foreground ships are not washed out by background effects.

### Phase 3 — fix hitches and resource ceilings

- [x] **3.1 Skip no-op world-content replacement (V-05).**
  - Compute a renderer-facing semantic signature for the content that actually
    changes meshes/material inputs.
  - Do not call `replaceWorldContent()` when a refresh produces the same
    renderer content.
  - Measure the common-refresh path again before considering deeper diffing.
  - If it still exceeds 100 ms, reuse unchanged ship/dock/sign resources in a
    bounded second step; do not introduce a worker or new architecture in this
    cleanup.
  - Acceptance: common refresh has no visible blank/flash and no long task over
    100 ms on the reference machine; true changes still update correctly.

- [x] **3.2 Bring reduced-motion geometry below budget (V-07).**
  - Add a settled-static real-GPU resource assertion after GLB/logo loading.
  - Identify geometry visible only because the no-RAF frame is captured after a
    different LOD/initialization path.
  - Cull unreadable static detail or share geometry; do not simply raise the
    documented ceiling.
  - Acceptance: default and selected reduced-motion states stay at or below
    500k triangles, 700 calls, and full quality while remaining deterministic.

- [x] **3.3 Protect the normal steady-state headroom.**
  - Keep p90 at or below 20 ms and default calls below 700.
  - Require resource counts to return to baseline after refresh and selection
    churn.
  - Acceptance: no cleanup task adds a renderer, render target, permanent pass,
    or per-ship material.

### Phase 4 — correct the size gate and browser chrome

- [x] **4.1 Derive and apply a usable size-only threshold (V-04).**
  - Use actual lighthouse/island framing, footer/control footprints, and a
    selected panel to derive the smallest chartable width and height.
  - Current evidence identifies height as the binding defect: retain the
    720 px width floor unless panel-fit evidence proves it insufficient, and
    raise the height floor to the first reviewed composition that keeps the
    harbor and chrome usable.
  - Raise `MIN_LONG_SIDE_PX` and/or `MIN_SHORT_SIDE_PX` accordingly for both
    screen capability and current viewport checks.
  - Keep the checks strictly dimensional. Do not use
    `(orientation: portrait)`, aspect-ratio gating, or device labels.
  - Acceptance: the first passing viewport has a legible harbor and chrome;
    a `720×1000` tall desktop continues to pass if it satisfies the chosen
    width/height floors; every smaller dimension returns before imports/data.

- [x] **4.2 Fix minimum target sizes (V-08).**
  - Give notice dismiss, detail copy, and detail close controls at least a
    24×24 CSS-pixel hit area.
  - Prefer 44×44 under `hover: none` without making the desktop chrome bulky.
  - Add computed-size assertions to component/browser tests.
  - Acceptance: no standalone interactive target is smaller than WCAG 2.2
    minimum; focus rings remain fully visible.

- [x] **4.3 Improve small-copy legibility (V-14, V-15).**
  - Bring functional footer, result metadata, notice, and action copy to a
    readable floor; reserve tiny uppercase tracking for genuinely secondary
    decorative labels.
  - Increase quick-find row hit areas and reduce low-opacity text.
  - Separate debug fps/resource telemetry from essential user footer content if
    space remains constrained.
  - Acceptance: user-facing status and navigation remain readable against the
    brightest day water and darkest night water at active edge viewports.

- [x] **4.4 Validate dynamic contrast over the scene (V-16).**
  - Sample controls, footer, notices, captions, tooltips, and focus indicators
    over representative bright/dark scene regions at day, dusk, and night.
  - Add stable scrims where a fixed color cannot meet contrast across the
    dynamic background.
  - Keep the existing static token-pair guard.

- [x] **4.5 Shorten the first-visit path (V-17).**
  - Put the primary “Watch harbor” action in the legend's initial viewport, or
    trim/reorder copy so the action is visible without scrolling.
  - Keep the detailed ledger under progressive disclosure.
  - Acceptance: keyboard focus reaches the primary CTA without traversing a
    long scroll and the dialog still traps/restores focus correctly.

### Phase 5 — add regression coverage for what escaped

- [x] **5.1 Add an active-runtime viewport matrix (V-18).**
  - Test one blocked size, the first passing size, standard desktop,
    `720×1000`-class tall desktop, and `2560×720`-class ultrawide.
  - Check canvas/chrome bounds, footer/control separation, panel fit, and lazy
    gate behavior.
  - Use browser automation for geometry/correctness assertions only; use the
    real-GPU preview matrix for visual judgment.

- [x] **5.2 Add artifact-specific checks (V-19).**
  - Assert that no horizon silhouette mesh exists in playable content.
  - Assert the lighthouse has only the approved beam layers.
  - Add deterministic image-region metrics for unexpected full-area triangles,
    single-frame flashes, and excessive beam coverage.
  - Prefer masks/coverage/luminance checks over brittle full-frame pixel
    baselines.

- [x] **5.3 Cover the transient outsider (V-20).**
  - Build a fixture with the 320 ordinary ships plus a selected entity outside
    the cap.
  - Verify it renders, selects, receives a DOM detail record, and disposes
    without exceeding capacity or leaking resources.

- [x] **5.4 Add the reduced-motion settled-resource lane.**
  - Wait for asynchronous models/textures, render the single deterministic
    frame, and assert calls/triangles/memory.
  - Cover default and selected-detail states.

- [x] **5.5 Silence expected test-environment warnings (V-21).**
  - Provide explicit localStorage and canvas-context mocks where appropriate.
  - Do not globally swallow console warnings.
  - Fail on unexpected warning/error output after the known cases are removed.

### Phase 6 — documentation and bounded maintainability cleanup

- [x] **6.1 Correct documentation drift (V-24).**
  - Replace landscape-orientation wording with the two size tests in
    `ARCHITECTURE.md`.
  - Fix the runtime-facts generator so regenerated documentation stays correct.
  - Replace the stale 909-call/recovery/37.7 fps whole-map debt with the current
    402-call/full/60 fps measurement and update the visual-test count.
  - Retain the warning that Playwright is not a visual/performance authority.

- [x] **6.2 Extract by rendering ownership, not by arbitrary line count
  (V-22).**
  - First candidates: water shader source/uniform state, world-content
    creation/replacement, ship batch/update code, and effect-specific CSS.
  - Keep public contracts stable and make one behavior-preserving extraction
    per change.
  - Do this after visible fixes, so extraction does not hide the behavioral
    diff.

- [x] **6.3 Narrow the hook lint suppression (V-23).**
  - Refactor or locally suppress the specific ref access that requires it.
  - Restore `react-hooks/refs` enforcement for the rest of
    `pharosville-world.tsx`.

- [x] **6.4 Remove decorative shell noise (V-25, V-26).**
  - Remove the repeating grid overlay and `mix-blend-mode`.
  - Reduce wide card shadows and tracked uppercase labels where they do not
    improve hierarchy.
  - Acceptance: the UI still feels maritime/archival but no longer lays a
    texture grid over the water.

- [x] **6.5 Reconcile scratch directories safely (V-27).**
  - Inventory `output/`, retain any still-useful diagnostic scripts under the
    appropriate source/tooling directory, and move needed scratch images to
    `outputs/`.
  - Delete nothing blindly; keep generated artifacts uncommitted.

- [x] **6.6 Prune implementation archaeology (V-28).**
  - After behavior and tests settle, replace numbered historical narratives
    with concise current invariants and ownership comments.
  - Remove no comment that documents a data-truth, lifecycle, GPU, or
    accessibility constraint.

## Implementation evidence (2026-07-27)

All plan items above are implemented. The final change set remains a bounded
cleanup: it removes or attenuates competing visual layers, strengthens existing
contracts, and adds regression coverage without adding a renderer, render pass,
data channel, asset pipeline, or product metaphor.

### Final visual and runtime record

Scratch captures and JSON measurements remain under `outputs/` and are not part
of the release:

| State | Final evidence |
|---|---|
| Noon, dusk, night | Continuous limited-palette water; no horizon triangles, radial fan, zone flash, or rectangular light pools |
| First passing `900×720` | Harbor, lighthouse crown, controls, footer, and quick-find remain chartable |
| Tall `720×1000` | Mounts through the dimensional gate and keeps the world legible |
| Standard `1600×1000`, night | 60 fps, p90 16.7 ms, 688 calls, 302,817 triangles, 405 geometries, 49 textures, 186 ships |
| Whole map | 60 fps, 399 calls, 345,773 triangles, 478 geometries, 62 textures |
| Ultrawide `2560×720` | 60 fps, p90 16.7 ms, 693 calls, 331,937 triangles; lighthouse crown and one coherent beam remain visible |
| Reduced-motion default | Deterministic no-RAF frame, 418 calls, 303,019 triangles, 412 geometries, 49 textures |
| Reduced-motion selected outsider | 144 calls, 206,835 triangles, 370 geometries, 39 textures; compact selection cue and detail parity remain intact |
| Renderer-equivalent refresh | Median 56 ms busy, 6 ms blocking; content roots remain `2 → 2` with no replacement flash |

The final real-GPU night artifact probe sampled eight frames through the
operator's NVIDIA/Vulkan Chrome wrapper. It found no full-area flash and a
maximum bright-beam coverage of 0.3%. Source-level guards also assert that
playable content contains no horizon silhouette geometry, no obsolete
lighthouse fan/outer-beam layer, and no raw spatial `step()` in the water lane.

### Implemented protections

- The viewport gate is a shared monotonic size test: long side at least 900 px
  and short side at least 720 px. Blocked screens and windows still return
  before world imports or data requests; tall desktop windows remain valid.
- The analytical fleet remains 186 visible ships with the 320 ordinary-ship
  capacity plus a tested transient selected outsider. Terrain risk
  classification, DOM detail parity, keyboard/deep-link selection, failure
  fallback, and same-origin API use are unchanged.
- One renderer, one RAF owner, deterministic reduced motion, semantic zoom, and
  disposal/resource-return behavior remain enforced.
- Renderer content now has a semantic signature, so equivalent refreshes retain
  world resources while genuine rendered changes still replace content.
- Ownership was narrowed only where it clarified behavior: compact cue creation,
  renderer content signatures, and artifact-frame metrics have focused modules
  and tests.
- Browser chrome now has WCAG-sized controls, 44 px hoverless targets, stronger
  scene scrims, more legible status/quick-find copy, a first-view CTA, and less
  decorative grid/shadow noise.
- Historical `output/` material was inventoried and moved recoverably beneath
  ignored `outputs/`; no scratch artifact is staged.

### Final validation

- `npm run validate:changed`: green; 121 test files passed, 2 skipped;
  1,333 tests passed, 2 skipped; typecheck, lint, docs, secrets, media, color,
  build, and bundle checks passed.
- `npm run test:perf`: 8/8 green, including steady-state pacing, long-session
  resources, settled reduced-motion budgets, replacement/selection disposal,
  clock suspension, and renderer fallback.
- `npm run validate:release`: green; 1,333 unit tests, 16/16 Chromium production
  correctness tests, 2/2 Firefox accessibility tests, and the real-GPU deploy
  tripwire passed at full tier and 60 fps.
- `npm run preview -- --assert --artifact-check --hash "#t=22"`: green at
  688 calls and 0.3% maximum bright coverage.

## Required implementation order

1. Baseline and invariants.
2. Horizon, beam, water, and flicker cleanup.
3. Scene-effect budget and secondary cue cleanup.
4. Refresh and reduced-motion resource fixes.
5. Size gate and UI accessibility/legibility.
6. Artifact-specific regression coverage.
7. Documentation, extraction, and hygiene.

Do not mix maintainability extraction into the first visual-fix commit. Keeping
the visible changes isolated makes regressions and review much easier to
attribute.

## Validation matrix

Use the smallest relevant checks during implementation, then complete the full
matrix before declaring the cleanup done.

### Automated

- `npm run validate:changed` after each bounded task.
- Targeted Three/unit/component specs while iterating.
- `npm run test:visual` for browser correctness only.
- `npm run test:perf` for its existing deterministic diagnostics only.
- `npm run validate:release` before broad release confidence.

### Real-GPU visual/performance

Use `npm run preview`; never judge visual quality or frame time from Playwright.

For each relevant state, inspect:

- noon, dusk, and night;
- normal and reduced motion;
- default, hover, selected detail, legend, and quick find;
- first passing viewport, standard desktop, tall desktop, whole-map, and
  ultrawide;
- idle, pan, zoom, selection transition, and data refresh;
- full, balanced, and constrained fallback semantics where they can be
  deliberately exercised.

### Release exit criteria

- No blue horizon polygons, giant radial wedges, rectangular flashes, or
  transparency-order popping.
- Water reads as a continuous sea with quieter, still-truthful risk bodies.
- No high-frequency strobe or single-frame full-zone flash.
- The first allowed viewport is genuinely chartable and the gate remains
  width/height-only.
- Default and reduced-motion frames meet the documented call/triangle ceilings.
- Common refresh produces no visible blank/flash and no reference-machine long
  task over 100 ms.
- Every standalone control meets target-size minimum and dynamic contrast is
  verified across the time-of-day matrix.
- Fleet count, risk classification, DOM parity, keyboard behavior, selection
  deep links, failure fallback, reduced-motion no-RAF behavior, same-origin API
  use, and server-side secret handling remain unchanged.

## Explicit non-goals

- No new ships, metaphors, signals, game systems, mobile world runtime, data
  endpoints, post-processing effects, render passes, or account/wallet work.
- No renderer rewrite, camera rewrite, Web Worker migration, or new asset
  pipeline.
- No reduction of analytical data truth to make the frame prettier.
- No manual semantic tag, release, deploy, or host-repository work.

## Positive findings to preserve

- The real-GPU normal and whole-map frames are currently full-tier 60 fps.
- The size gate lazy-load boundary, same-origin API boundary, server-side key,
  one-renderer/one-RAF lifecycle, disposal coverage, deterministic placement,
  instanced fleet, DOM accessibility ledger, failure fallback, keyboard/Escape
  behavior, focus rings, and reduced-motion no-RAF contract are strong.
- The central harbor palette, semantic zoom foundation, resource telemetry,
  preview wrapper, bundle budget, and comprehensive automated suite make this a
  cleanup project rather than a rescue or rewrite.
