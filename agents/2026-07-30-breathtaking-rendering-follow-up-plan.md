# PharosVille Breathtaking Rendering Follow-up Plan

Date: 2026-07-30
Status: remediation implemented and operator-approved; awaiting review and landing
Audited state: uncommitted implementation on `main @ 3c5c72a` (`v0.6.2`)
Source plan: `agents/2026-07-29-breathtaking-rendering-plan.md`

---

## 0. Execution result

The remediation described below was implemented on 2026-07-30. The worktree
remains intentionally uncommitted for operator review; no release, deployment,
tag, or GitHub Release was created.

### Resolved issue register

| Issues | Final state |
| --- | --- |
| R-01, R-22 | Removed the production WebGPU/TSL route, chunks, probe, and harness; restored the synchronous WebGL factory, measured budgets, exact dependency pins, and honest NO-GO documentation |
| R-02, R-18, R-19 | Observe now starts and cancels from the displayed camera, derives captions from the sampled camera timeline, returns through resize-safe world framing, and has no decorative handheld noise |
| R-03 through R-06 | Wake stamps composite once, default sea direction is preserved through one explicit wind convention, sail deformation uses one local coordinate space, and crest foam uses the analytic Gerstner Jacobian |
| R-07 | Seven sea-sign canvases now share one padded atlas with per-board UVs; whole-map use fell from 78 to exactly 72 textures without removing a sign or raising the cap |
| R-08, R-09, R-12 | Wake reprojection/fade/reset, monotonic environment time, content-local motion epochs, and hysteretic PMREM storm bands are deterministic |
| R-10 | A cancellable, ownership-checked texture upload scheduler now budgets idle and between-frame work and reports pending/uploaded/failed owners |
| R-11, R-13 | Logo bitmaps, water textures, wake targets, post targets/materials, and N8AO internals have explicit idempotent lifecycle coverage |
| R-14, R-15 | Metrics distinguish scene, recurring offscreen, and total calls; PMREM bakes are episodic; post order, configuration, resize, AO fade, fallback, and disposal have contract tests |
| R-16, R-17 | Lower tiers reserve analytical route capacity and weather DOM copy distinguishes possible lightning from active lightning |
| R-20, R-21 | Detached cumulus billboards are disabled; semantic tier hue is invariant while bounded fidelity luminance/contrast changes are documented |
| Final sail identity regression | Removed the ticker-text fallback, preserved native logo colors on issuer-dyed cloth, made logo publication progressive, and made asset ownership survive React Strict Mode effect replay |

The final hardware review also found and fixed one issue not named in the
register: a persistent moving-ship follow excludes camera-intent frames from
quality pacing, but the footer retained two startup samples and displayed a
fictional `1-2 fps`. The footer now reports `FPS --` while pacing is
intentionally unavailable and resumes measured output after camera intent.

The operator's final review found one further regression: unresolved logo
assets painted ticker letters onto sails, and the logo store was permanently
disposed by React Strict Mode's development effect replay. Sails now remain
markless until their real logo is decoded, then repaint progressively with the
logo's native colors. The final hardware capture reports all `184/184` logo
assets decoded; no ticker-letter fallback remains.

### Final validation

| Lane | Final result |
| --- | --- |
| `npm run validate:changed` | PASS: 127 test files passed, 2 skipped; 1,426 tests passed, 2 skipped; docs, media, colors, types, lint, build, and budgets green |
| `npm run test:visual` | PASS: 16/16, including the former Observe cancellation failure |
| `npm run test:perf` | The pre-sail run passed 8/8. The final rerun passed 7/8; the replacement soak remained at 61 textures for ten cycles, then established a flat 62-texture baseline for cycles 11-12 as one deferred texture initialized. This is bounded one-time warm-up, not per-replacement accumulation, but the exact-baseline assertion still needs calibration. |
| Production dependency audit | PASS: exact `n8ao@2.0.0`, `postprocessing@6.39.4`, `three@0.185.1`; zero production advisories |
| Bundle | PASS: renderer 1,264.7 KiB raw / 423.3 KiB gzip; total JS 2,443.9 KiB raw / 774.0 KiB gzip; no WebGPU/TSL production chunk |
| Night artifact probe | PASS: eight frames; no full-area flash; maximum bright-beam coverage 0.2% |

The final `npm run validate:release` rerun was stopped when the operator asked
to wrap. The complete source validation and visual lane above are final-tree
results; the prior release-gate run had already passed its unit, Chromium
distribution, and Firefox accessibility stages before it was stopped for the
sail correction.

### Final real-GPU evidence

All performance and visual captures used the maintained operator Chrome wrapper
on the NVIDIA RTX 5070 Ti. The full 3 zoom x 3 phase normal/reduced matrix
passed before the final sail correction. Its old texture counts are superseded
by these final logo-decoded captures:

| Framing | Final result |
| --- | --- |
| Explore/default, day | PASS: 60 fps, p50/p90 16.7 ms, `full`, 643 total calls, 309,515 triangles, 381 geometries, 64 textures, `184/184` logos |
| Overview/whole map, day | PASS: 60 fps, p50/p90 16.7 ms, `full`, 401 total calls, 344,994 triangles, 422 geometries, exactly 72 textures, `184/184` logos |

The whole-map texture census is 40 scene references plus 32 renderer-internal
textures. It includes one shared fleet sail atlas and one shared sea-sign atlas.
The saved final captures are
`outputs/2026-07-30-followup-sail-logo-final.png` and
`outputs/2026-07-30-followup-sail-logo-whole-map.png`.

Post-scheduler refresh evidence:

- `common`: renderer-equivalent content, roots `2 -> 2`, fleet `185 -> 185`,
  median 301 ms busy; the longest work was React commit, not texture upload.
- synthetic `churn`: authored areas, ranks, ships, paths, and hull bands all
  changed; median 1,959 ms busy, primarily scene/world-model rebuild. Uploads
  drained with no failure or resource leak. This adversarial non-release case is
  useful future pipeline evidence, not a reason to weaken a renderer budget.

### Remaining operator-owned steps

1. Split, commit, and land the dirty worktree through reviewable changes. Run
   the normal green-`main` deploy and workflow-owned release process afterward;
   do not manually tag or deploy this worktree.

---

## 1. Executive verdict

The implementation is **not ready to land or release as one batch**.

It is also not a failed rewrite. The weather dependency graph, upgraded post
platform, Gerstner/wake direction, Observe tour, and real-GPU preview tooling
are useful foundations. The default, dusk, night, reduced-motion, and artifact
preview probes render at 60 fps on the operator GPU, and the dedicated
performance suite is green.

The current tree still has release-blocking correctness failures:

1. The publicly reachable WebGPU route is a documented NO-GO prototype but is
   still shipped from the production graph and adds about 44.6 KiB gzip to the
   default renderer path.
2. Observe cancellation does not freeze the displayed camera. The hardware
   behavior lane fails because a stale camera intent resumes easing after Tab
   interrupts the tour.
3. Persistent wake stamps are composited twice.
4. The new default wind nearly reverses the established sea direction.
5. Sail flutter mixes authored and deformed coordinate spaces, so hull scale,
   ride offset, waterline, and furling can change or restore sail drop.
6. The Gerstner Jacobian used for crest foam is not the derivative of the
   displacement that is rendered.
7. Whole-map framing uses 78 textures against the 72-texture contract.

There are also material lifecycle, clock, reduced-motion, upload scheduling,
post-processing test, visual quality, and documentation gaps. These must be
fixed without adding more rendering features or raising another budget.

**Recommended landing decision:** retain the WebGL feature work after staged
repair; remove the WebGPU production route and chunks; treat atmosphere,
billboard clouds, lighthouse shafts, and post tuning as operator-reviewed
substitutions rather than completed versions of the original named techniques.

---

## 2. Audit basis and observed results

### Repository state

- The entire overnight implementation is still uncommitted.
- `git status --short` reports 35 modified tracked files plus new weather,
  Observe, wake, billboard, WebGPU, report, and type-shim files.
- The tracked diff alone is about 2,789 insertions and 522 deletions.
- The required Phase 0 baseline directory
  `outputs/2026-07-29-breathtaking-baseline/` does not exist.
- Older v0.6.2-era screenshots are available under `outputs/`, but they do not
  constitute the planned reproducible zoom x phase baseline matrix.

### Validation evidence

| Lane | Result | Important evidence |
| --- | --- | --- |
| `npm run onboard:agent` | PASS | Correct standalone repository and dirty-tree warning |
| `npm run validate:changed` | PASS | 125 test files passed, 2 skipped; 1,387 tests passed, 2 skipped; docs, media, colors, typecheck, lint, build, and bundle checks green |
| Focused renderer Vitest | PASS | 4 files, 67 tests; current assertions do not cover the renderer math/pass-order defects below |
| `npm run test:perf` | PASS | 8/8 hardware-enabled scenarios in 1.4 minutes, including long-session resources and repeated world replacement |
| `npm run test:visual` | FAIL | 15 passed, 1 failed; Observe accessibility/cancellation camera drift at `tests/visual/pharosville-gates.spec.ts:310` |
| `git diff --check` | PASS | No whitespace errors |
| `npm ls n8ao postprocessing three --all` | PASS | Dependency graph resolves cleanly |
| `npm audit --omit=dev` | PASS | No production advisories |
| Full `npm audit` | WARN | 8 high and 2 low advisories in development tooling; not caused by the new runtime dependencies |

### Real-GPU preview evidence

All visual/performance judgments below came through `npm run preview`, not a
generic Playwright browser.

| State | Result | Calls | Triangles | Textures | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| Default, 1600x1000 | PASS | 649 | 304,161 | 64 | `full`, composer on, p50/p90 16.7 ms, 185 ships |
| Dusk, 1440x1000 | PASS | 610 | 301,557 | 62 | 60 fps |
| Night, 1440x1000 | PASS | 610 | 301,503 | 62 | 60 fps |
| Reduced-motion night | PASS | 382 | 301,279 | 58 | Static composition |
| Night artifact probe | PASS | n/a | n/a | n/a | 8 frames; max bright-beam coverage 0.8% |
| Whole map, 1600x1000 | **FAIL** | 400 | 344,868 | **78** | p90 16.7 ms and `full`, but texture contract is 72 |

Current audit captures:

- `outputs/outputs/2026-07-30-followup-audit-default.png`
- `outputs/2026-07-30-followup-audit-dusk.png`
- `outputs/2026-07-30-followup-audit-night.png`
- `outputs/2026-07-30-followup-audit-reduced-night.png`
- `outputs/2026-07-30-followup-audit-whole-map.png`

The duplicated `outputs/outputs/` path in the default capture is an invocation
mistake, not a product issue.

### Visual observations requiring an operator decision

- The sea and ship sails are present in the current default frame.
- At whole-map zoom, the new cumulus billboards read as detached pale pills
  above the scene. They are materially weaker than the previous clean horizon
  in `outputs/final-whole-map-1600x1000.png`, and they make the water/dome
  boundary more conspicuous.
- The current night sea is much brighter and more emissive than
  `outputs/visual-gates/garden-observatory-night-1440x1000.png`. This may be an
  intentional direction, but it has not been approved through a controlled A/B
  comparison.
- Dusk, AO, bloom, haze, beam, and storm tuning have no preserved Phase 0 A/B
  matrix. A green frame-time probe cannot establish visual correctness.

---

## 3. Assessment of the original plan

### What the plan got right

- It identified the highest-value architectural idea: one weather/wind state
  feeding water, sails, rain, cloud shadows, ambient life, lighting, and post.
- It protected the desktop gate, real-GPU validation path, 60 fps contract,
  quality scheduler, and sea-first negative space in writing.
- It favored shader-side motion, instancing, authored stylization, and
  measurement over indiscriminate geometry.
- It made WebGPU a timeboxed go/no-go spike instead of the primary migration
  path.
- The operator preview extensions, weather model, and dedicated systems are
  useful implementation artifacts.

### Where planning and execution broke down

- Five cross-cutting phases were implemented into one uncommitted tree. The
  declared independently shippable phase gates were not preserved.
- Phase 0 baseline captures and AO timing evidence were skipped, so later visual
  and performance claims cannot be compared reproducibly.
- Acceptance concentrated on default p90 and scene draw calls. It did not catch
  wake pass order, shader math, default wind direction, camera cancellation,
  whole-map texture count, or hidden offscreen draws.
- The Phase 5 result was correctly reported as NO-GO, but the failed prototype
  remains publicly selectable with `?webgpu=1|compat` and affects the default
  bundle through shared core extraction.
- Several declared deliverables were substitutions:
  - The sky is an authored analytic/Preetham-inspired shader, not a precomputed
    Takram/Bruneton atmosphere.
  - The lighthouse remains a noisy additive mesh cone rather than the planned
    screen-space occlusion/radial-blur shaft.
  - Scene fog remains linear; only sky/water haze was enhanced.
  - Bloom is global and in its own `EffectPass`, not selective and not fused
    with the grade chain.
- The plan status says Phase 5 landed even though its named hinge was a TSL
  water port plus operator p90 and Safari/fallback evidence. The report states
  that those conditions were not met.
- Budget caps were raised to accommodate an experiment that default users
  cannot use. This contradicts the documented rule that a lazy backend may not
  grow the default path.
- Decorative clouds and handheld camera noise were allowed to outrun product
  meaning. PharosVille is a serious analytical register with a contemplative
  game-world presentation; spectacle must improve orientation or data
  understanding, not merely add motion.

The follow-up should therefore optimize for **truth, stability, and coherent
art direction**, not for completing every named technique from the original
research list.

---

## 4. Retain, repair, remove, or defer

| Area | Disposition | Reason |
| --- | --- | --- |
| WebGL renderer factory and current production backend | Retain | Default real-GPU behavior and performance are broadly healthy |
| Weather/wind system | Retain and repair | Strong dependency graph; clock, direction, semantics, and coverage need correction |
| pmndrs/postprocessing and N8AO | Retain provisionally | Useful depth improvement; disposal, phase, AO fade, and cost evidence are missing |
| Gerstner water | Retain and repair | Correct direction, but derivative math and default motion compatibility are wrong |
| Persistent wakes | Retain and repair | Valuable visual memory; double stamping, resets, epochs, reduced motion, and telemetry are wrong |
| Observe 2.0 | Retain and simplify | Useful guided camera language; cancellation, clocks, resize return, and handheld noise need work |
| Analytic atmosphere and water haze | Retain provisionally | Valid art-direction substitution if it wins controlled A/B review |
| Billboard cumulus | Disable first, then reevaluate | Current whole-map silhouette is visibly weaker and adds no analytical meaning |
| Production WebGPU query route and chunks | Remove | Declared NO-GO, incomplete parity, public broken path, default bundle penalty |
| WebGPU report | Retain and correct | Useful negative result and future evidence |
| WebGPU spike harness | Isolate or remove from app graph | A future spike must have a separate entry and zero production graph/budget impact |
| Perspective mode, planar reflections, volumetric clouds, new content | Defer | No new effects until current work is correct, measured, and approved |
| Takram/Bruneton adoption | Defer pending A/B need | Do not add a library merely to make the status line match the old plan |

---

## 5. Prioritized issue register

### P0: blockers before the feature batch can land

#### R-01: Remove the production-reachable WebGPU NO-GO

Evidence:

- `src/three/world-renderer.ts:278-286,336-346` exposes
  `?webgpu=1|compat`.
- The now-removed WebGPU renderer module documented incomplete visual parity.
- `agents/2026-07-29-webgpu-spike-report.md:90-99` says the water hinge,
  operator p90, and Safari/fallback criteria were not met.
- `scripts/bundle-budgets.mjs` raised renderer gzip from 420 to 480 KiB and
  aggregate gzip from 820 to 1,100 KiB.
- The default renderer path grew by about 44.6 KiB gzip because the dynamic
  `three/webgpu` import changes shared core chunking.

Required result:

- No WebGPU query parser, factory import, backend chunks, or TSL probe is
  reachable from the production app entry.
- Preserve the corrected report as a NO-GO record.
- If the harness is retained, give it an isolated non-production entry that
  does not alter default build chunking.
- Restore the 420 KiB renderer and 820 KiB aggregate gzip caps if measured
  post-removal output fits them, rather than preserving WebGPU headroom.
- Add a build assertion that no `three.webgpu`, `world-renderer-webgpu`, or TSL
  probe chunk exists in the production manifest.

#### R-02: Make Observe interruption freeze the displayed camera

Evidence:

- `npm run test:visual` fails at
  `tests/visual/pharosville-gates.spec.ts:310`.
- `src/hooks/use-canvas-resize-and-camera.ts:216-218` prefers a stale target
  camera over the currently displayed camera.
- Tour start at `:722-735` can record that stale target.
- `stopFollowChase` at `:199-214` clears the tour but only neutralizes the
  intent for one camera mode, so idle easing resumes after keyboard
  interruption.

Required result:

- Tour start always samples the displayed camera pose.
- Pointer, wheel, toolbar, Escape, Tab/focus loss, selection, and explicit stop
  all leave one well-defined intent.
- A non-easing interruption freezes the exact displayed pose; an explicit
  ease-back uses the stored return pose.
- The existing hardware accessibility test passes without tolerance inflation.

#### R-03: Composite each wake stamp exactly once

Evidence:

- `src/three/garden-wakes.ts:406-420` leaves `stampMesh.count` visible during
  the feedback pass, then renders the stamps again additively.
- `src/three/garden-wakes.test.ts:93-113` checks only the number of render
  calls, so it approves the wrong scene contents.

Required result:

- The feedback pass contains feedback only.
- The stamp pass contains stamps only.
- A render-spy test records mesh visibility/count and material/blend state at
  each pass.
- A deterministic pixel or CPU-composition test proves one stamp does not
  double its intended energy.

#### R-04: Preserve the established default sea direction

Evidence:

- The spectrum base bearing in `src/three/garden-water.ts:115-128,153` and the
  default `uWindDir` at `:1528-1533` have a dot product of about -0.988, a
  roughly 171-degree reversal.
- `src/systems/weather.ts:105-110` adds a phase offset immediately at startup.
- Existing tests check component separation, not the applied rotation or phase
  convention.

Required result:

- Define whether wind vectors mean "toward" or "from" once in the weather
  contract.
- Water, sails, pennants, rain, cloud shadows, mist, gulls, and foam all use
  that convention.
- At calm/default weather, CPU reference samples of Gerstner displacement and
  motion remain within an approved tolerance of the v0.6.2 field.
- Add direction tests for default, quarter-turn, and opposite wind cases.

#### R-05: Correct sail flutter and furling coordinates

Evidence:

- `src/three/garden-fleet-batch.ts:321-327,358-369,375-383` computes furling
  from authored `aSailHead`, deforms the hull/waterline position, then computes
  flutter from a mixture of both spaces.
- A furled sail can regain drop/flutter; non-unit hull height and ride offset
  change flutter amplitude.

Required result:

- Compute sail-local drop, set-sail/furl mask, and flutter before hull/world
  deformation, or deform both compared positions identically.
- Multiply flutter by the authored set-sail factor so a furled sail cannot
  reopen through animation.
- Add shader/pure-math fixtures across hull height, ride offset, waterline,
  wind, and every furl bit.

#### R-06: Derive crest foam from the actual Gerstner displacement

Evidence:

- `src/three/garden-water.ts:173-186,354-365` uses an extra wave number,
  applies chop twice, and omits amplitude scale from the claimed Jacobian.
- Whitecaps amplify the result heavily at `:989-993`.

Required result:

- Write the exact summed 2x2 derivative of the rendered horizontal
  displacement and use its determinant or another documented crest metric.
- Implement the same math in a small CPU reference helper.
- Compare the analytic derivative against finite differences for all wave
  components, regional amplitude scales, storm levels, and chop values.
- Lock visual thresholds only after the math is correct.

#### R-07: Restore the whole-map texture contract

Evidence:

- `npm run preview -- --assert --hash "#cam=0,0,0.28&t=13"` reports 78
  textures against a limit of 72.

Required result:

- Add a named texture census at whole-map settle so the six-texture excess has
  an owner.
- Remove duplication, stale ownership, or unnecessary far-zoom allocations.
- Do not hide the regression by raising the cap or disabling required content.
- Add the whole-map hash to the recurring real-GPU acceptance matrix.

### P1: correctness, determinism, lifecycle, and measurement

#### R-08: Make wake state deterministic across zoom, tier, motion, and content

- `src/three/garden-wakes.ts:82-102` clears the field for a half-size change
  greater than 0.5, so smooth Observe/wheel zoom repeatedly destroys history.
- Recovery clears immediately at `:363-375` while the water wake strength
  visibly eases over about 300 ms.
- Reduced motion freezes whatever history happens to exist at `:377-381`;
  fresh reduced load and animated-then-reduced load differ.
- `src/three/world-renderer.ts:539-603` updates wakes before content-signature
  replacement and never clears/remaps history for removed or relocated ships.

Required result:

- Use quantized wake windows with hysteresis or reproject history into resized
  windows.
- Coordinate tier fade and target disposal so visible wake strength reaches
  zero before the target is cleared.
- Reset reduced-motion wakes to one canonical time-zero composition.
- Detect content epoch changes before wake update; clear or remap stamps.
- Cover zoom ramps, resize, tier descent/ascent, reduced toggles, and content
  replacement with sequence tests.

#### R-09: Separate the monotonic environment clock from content epochs

- `src/hooks/use-world-render-loop.ts:370-391` resets accumulated seconds when
  the content signature changes.
- Weather consumes that clock in `src/three/world-renderer.ts:520-529`.

Required result:

- Keep a monotonic environment clock for wind, waves, clouds, rain, sail
  flutter, ambient life, and post phase.
- Keep ship/path content interpolation on its own epoch.
- Preserve the existing hidden-page pause and deterministic reduced-motion
  zero.
- World refresh must not snap every environmental phase at once.

#### R-10: Implement a real texture upload scheduler

- GLB and region uploads call `renderer.initTexture` synchronously in
  `src/three/world-renderer.ts:315-334,906-909`.
- Sail atlas upload occurs inside the hot render path at `:1948-1955`.
- The planned `requestIdleCallback` queue does not exist.

Required result:

- Add a renderer-owned, cancellable upload queue using
  `requestIdleCallback` where available and a bounded between-frame fallback.
- Give each drain an explicit time/item budget and timeout fallback.
- Validate ownership/disposal immediately before upload.
- Instrument queued, uploaded, cancelled, and over-budget tasks.
- Measure world-refresh long tasks and first-use hitch before and after.

#### R-11: Close decoded logo bitmaps at the correct ownership boundary

- `src/hooks/use-ship-logo-assets.ts:14-57` retains decoded assets for the hook
  lifetime and does not prune removed sources.
- Abort cleanup at `:64-87` does not close a late `ImageBitmap`.

Required result:

- Give `ThreeLogoAssetStore` explicit replace/prune/dispose semantics.
- Close bitmaps on source removal, store teardown, and late completion after
  abort, but never while atlas generation is using them.
- Add mocked `ImageBitmap.close()` lifecycle tests for success, replacement,
  abort, and unmount.

#### R-12: Stop periodic PMREM rebakes and expose their cost

- Storm breathes continuously in `src/systems/weather.ts:112-116`.
- `src/three/garden-environment.ts:135-143` rounds `stormLevel * 4`, allowing a
  steady state near a boundary to cross repeatedly.
- Synchronous PMREM baking at `:179-190` occurs before renderer counter reset.

Required result:

- Key PMREM to stable storm bands/base state, or use hysteresis plus a minimum
  rebake interval.
- Stress a long clock sequence around every quantization boundary.
- Report bake count and CPU/GPU time separately as episodic work.

#### R-13: Complete GPU resource disposal

- `src/three/garden-post.ts:490-493` assumes composer disposal reaches N8AO
  fullscreen-triangle wrappers; `n8ao@2.0.0` does not provide that complete
  disposal path.
- `src/three/garden-util.ts:87-116` scans direct material values but not
  `ShaderMaterial.uniforms`.
- Water-owned region, distance, cloud-shadow, and normal textures live through
  uniforms and have no explicit water disposal in
  `src/three/world-renderer.ts:481-500`.

Required result:

- Add a local N8AO disposal adapter or move to a verified upstream version.
- Give water and every renderer subsystem explicit ownership/dispose methods.
- Extend resource-spy tests across mount/dispose and repeated backend creation.
- Ensure the fixes remain green in the long-session and world-replacement perf
  tests.

#### R-14: Report total recurring render work, not only scene calls

- Wake feedback/stamp and PMREM work occur before
  `renderer.info.reset()` in `src/three/world-renderer.ts:509-570`.
- The reported 610-649 calls therefore exclude recurring offscreen passes.

Required result:

- Publish scene calls, recurring offscreen calls, episodic calls, and total
  calls separately.
- Apply the release contract to recurring total work.
- Add operator-path GPU timings for AO, wake passes, post passes, and PMREM.
- Do not compare the new total with an old scene-only number without relabeling
  the baseline.

#### R-15: Add focused post-processing contract tests

There is no real `src/three/garden-post.test.ts`; renderer tests mock the post
system.

Required coverage:

- Pass order, target formats, resize/DPR behavior, and disposal.
- AO enable/fade by zoom and quality tier.
- Day/dusk/night/storm/lightning uniform blends.
- Bloom threshold/strength and grade order.
- Exactly one tone-map/output-color conversion.
- Tier transitions without an abrupt AO luminance pop.
- Keep the operator shader-driver probe as an additional tripwire.

#### R-16: Preserve route and analytical cue capacity below `full`

- `src/three/garden-lanterns.ts:33-39` caps lane instances at 48/12/6/4.
- Selection at `:200-203` sorts only by priority; route lanes have no reserved
  capacity and can disappear behind beacon/lantern/buoy/ship lanes.

Required result:

- Define the semantic priority policy for routes at each tier.
- Reserve a small route quota where the analytical route signal is promised,
  or document and test its intended removal.
- Test a full fleet at balanced, interaction, recovery, and constrained tiers.

#### R-17: Align weather effects with DOM truth

- Area detail copy in `src/systems/detail-model.ts:98-120` can claim
  "lightning active" based on a DANGER band.
- Global lightning is scheduled only above a fleet-derived storm threshold in
  `src/systems/weather.ts:146-160`.
- The visual cue registry describes localized danger rain while lightning and
  sky modulation are global.

Required result:

- Never say lightning is active unless the current world state makes that true.
- Prefer "lightning possible in storm conditions" for capability copy, or
  expose actual global weather state in the DOM ledger.
- Document provenance for fleet-derived global storm/wind state.
- Test visual/DOM parity at WARNING, DANGER below storm threshold, and active
  storm/lightning slots.

### P2: coherence, art direction, and documentation

#### R-18: Drive Observe camera and captions from one timeline

- Camera sampling uses RAF in
  `src/hooks/use-canvas-resize-and-camera.ts:561-580`.
- Captions use independent timers in `src/pharosville-world.tsx:523-549`.
- `ObserveTourSample.beatIndex` is computed but not used to drive captions.

Required result:

- Use the sampled tour progress/beat as the only caption clock.
- Cover large clock jumps, background/foreground, interruption, replay, and
  completion.
- Remove default handheld noise unless operator A/B review proves it improves
  understanding without harming the calm register.

#### R-19: Make Observe return framing resize-safe

- The tour stores raw screen-dependent camera offsets in
  `src/hooks/use-canvas-resize-and-camera.ts:152-158,722-746`.

Required result:

- Store a world center/semantic pose and resolve it against the current
  viewport, or explicitly cancel/rebase on resize.
- Test resize during a tour and before ease-back.

#### R-20: Reevaluate billboard clouds and horizon treatment

Required result:

- Disable the current cumulus billboards for the first stabilization baseline.
- Compare no billboards vs a revised version at overview/explore/analyze and
  day/dusk/night.
- Retain billboards only if silhouettes read as clouds, remain attached to the
  horizon/atmosphere, preserve sea-first negative space, and do not make the
  dome boundary more visible.
- Do not replace them with a larger cloud or volumetric dependency in this
  follow-up.

#### R-21: Clarify the tier color invariant

The docs say no tier may change frame "COLOR", while AO, billboards, wakes, and
volumetric/beam fidelity are tier-gated. AO multiplication necessarily changes
local RGB/contrast.

Required result:

- Define invariant palette/tone-map/grade/hue continuity separately from
  allowed fidelity and local-luminance changes.
- Establish bounded transition deltas for AO/wakes/atmosphere.
- Capture tier transitions, not just settled endpoints.

#### R-22: Correct implementation status and dependency policy

Required result:

- Rewrite the original plan status as an implementation record with
  "delivered", "substituted", "deferred", "removed", and "failed spike"
  categories.
- Correct the WebGPU report's claims about default bundle parity and current
  validation.
- Record decimal Vite kB vs binary budget-checker KiB consistently.
- Pin `n8ao` and `postprocessing` exactly, matching repository policy.
- Replace or justify `src/types/n8ao.d.ts` against the installed package API so
  upgrades cannot silently invalidate the shim.

---

## 6. Execution sequence

Do not implement the register as one more large patch. Use the following
dependency-ordered slices. Each slice must leave focused checks green and
produce a reviewable commit.

### Slice 0: Preserve evidence and establish a repair baseline

Files/artifacts:

- `agents/2026-07-30-breathtaking-rendering-follow-up-plan.md`
- `outputs/2026-07-30-breathtaking-followup/` (scratch, never commit)

Actions:

1. Preserve the current uncommitted implementation on a local safety branch or
   checkpoint before splitting work. Do not merge the checkpoint as-is.
2. Record `git status --short`, `git diff --stat`, build chunk sizes, and the
   validation table above.
3. Copy or recapture the current default/dusk/night/reduced/whole-map evidence
   into one consistently named scratch directory.
4. Mark the missing Phase 0 baseline honestly; do not manufacture it after the
   fact.

Exit criteria:

- The current overnight state can be recovered.
- No `dist/`, `test-results/`, env files, or scratch outputs are staged.

### Slice 1: Remove the failed backend and restore release budgets

Primary issues: R-01, part of R-22.

Primary files:

- `src/three/world-renderer.ts`
- `src/renderer/world-renderer-backend.ts`
- Removed WebGPU renderer module and its test.
- Removed TSL beacon-fire probe.
- Removed isolated WebGPU spike harness.
- `scripts/bundle-budgets.mjs`
- `agents/2026-07-29-webgpu-spike-report.md`
- affected runtime/architecture docs

Actions:

1. Remove the production query switch, dynamic import, factory, and TSL probe.
2. Delete spike-only production modules/tests, or move a genuinely useful
   harness behind an isolated non-production entry.
3. Restore pre-spike renderer/aggregate budgets after measuring the retained
   WebGL stack.
4. Add a manifest/chunk regression assertion.
5. Correct the report and docs without rewriting the historical result.

Exit criteria:

- Production build contains no WebGPU/TSL chunks.
- Default renderer no longer pays the shared-core penalty.
- `npm run check:bundle-size` and `npm run validate:changed` pass without a new
  cap increase.

### Slice 2: Repair camera and shader correctness

Primary issues: R-02 through R-06.

Primary files:

- `src/hooks/use-canvas-resize-and-camera.ts`
- `src/systems/observe-tour.ts`
- `tests/visual/pharosville-gates.spec.ts`
- `src/three/garden-wakes.ts`
- `src/three/garden-wakes.test.ts`
- `src/systems/weather.ts`
- `src/three/garden-water.ts`
- `src/three/garden-water.test.ts`
- `src/three/garden-fleet-batch.ts`
- `src/three/garden-fleet-batch.test.ts`

Actions:

1. Neutralize stale camera intents on interruption and start from displayed
   pose.
2. Split wake feedback and stamp visibility explicitly.
3. Define and apply one wind-direction convention.
4. Move sail flutter/furling math into a consistent coordinate space.
5. Replace the Gerstner derivative with tested analytic math.

Exit criteria:

- Focused unit tests include behavior/math assertions, not shader-string-only
  assertions.
- `npm run test:visual` is fully green.
- Default sea direction and sail silhouettes match approved v0.6.2/current
  comparison frames.

### Slice 3: Make runtime state deterministic

Primary issues: R-08, R-09, R-12, R-16.

Primary files:

- `src/three/garden-wakes.ts`
- `src/three/world-renderer.ts`
- `src/hooks/use-world-render-loop.ts`
- `src/three/garden-environment.ts`
- `src/systems/weather.ts`
- `src/three/garden-lanterns.ts`

Actions:

1. Add wake window hysteresis/reprojection and coordinated tier fade.
2. Define canonical wake state for reduced motion and content replacement.
3. Separate environment time from content interpolation epochs.
4. Stabilize PMREM storm keys and instrument rebakes.
5. Reserve or explicitly remove route capacity by tier.

Exit criteria:

- Fresh reduced load equals animated-then-reduced composition.
- Zoom/Observe ramps do not repeatedly erase wakes.
- World replacement cannot leave ghost wakes or reset weather phases.
- Long PMREM boundary simulation has a bounded bake count.
- Full-fleet tier tests preserve the declared analytical cues.

### Slice 4: Close upload, disposal, telemetry, and texture gaps

Primary issues: R-07, R-10, R-11, R-13, R-14, R-15.

Primary files:

- `src/three/world-renderer.ts`
- `src/hooks/use-ship-logo-assets.ts`
- `src/hooks/use-ship-logo-assets.test.tsx`
- `src/three/garden-post.ts`
- new `src/three/garden-post.test.ts`
- `src/three/garden-water.ts`
- `src/three/garden-util.ts`
- preview/runtime facts and telemetry tests

Actions:

1. Add a named whole-map texture census and remove excess ownership.
2. Implement the cancellable bounded upload queue.
3. Give logo bitmaps and renderer subsystems explicit lifecycles.
4. Verify N8AO internal disposal.
5. Report recurring offscreen and total work.
6. Add focused post-system contract tests and AO transition coverage.

Exit criteria:

- Whole map settles at no more than 72 textures.
- Repeated create/replace/dispose returns texture, geometry, target, and pass
  resources to a flat baseline.
- No sail-atlas or region upload runs synchronously inside the hot ship render
  path.
- Published draw-call totals include wake work.
- `npm run test:perf` remains 8/8 green.

### Slice 5: Reconcile visual direction and analytical truth

Primary issues: R-17 through R-21.

Primary files:

- `src/three/garden-sky-billboards.ts`
- `src/three/garden-sky.ts`
- `src/three/garden-post.ts`
- `src/three/garden-lighthouse.ts`
- `src/components/accessibility-ledger.tsx`
- `src/systems/detail-model.ts`
- `src/systems/visual-cue-registry.ts`
- Observe UI/tour files
- visual invariants and Three.js reference docs

Actions:

1. Establish a no-billboard comparison baseline.
2. Review day/dusk/night at all three zoom bands with the operator.
3. Tune or remove night emissive sea, AO, bloom, haze, and beam only from
   controlled A/B evidence.
4. Drive Observe captions from camera progress and make return framing
   resize-safe.
5. Remove unapproved handheld noise.
6. Align weather DOM text with actual global state/provenance.
7. Clarify allowed quality-tier fidelity and luminance transitions.
8. Relabel atmosphere, beam, fog, bloom, and WebGPU status accurately.

Exit criteria:

- The operator approves one coherent 3 zoom x 3 phase matrix.
- Whole-map clouds/horizon no longer read as detached sprites.
- DOM copy never asserts an inactive lightning effect.
- Tier transitions have no distracting pop.
- No new renderer feature or dependency was introduced to achieve the result.

### Slice 6: Release evidence and documentation

Actions:

1. Run all focused tests while iterating.
2. Run `npm run validate:changed`.
3. Run `npm run test:visual`.
4. Run `npm run test:perf`.
5. Run the real-GPU preview matrix below.
6. Run `npm run validate:release`.
7. Review `git diff --check`, staged files, generated artifacts, dependency
   pins, and secret boundaries.
8. Update architecture/runtime/testing docs from measured final behavior.

Exit criteria:

- Every lane is green.
- Every retained effect has an owner, lifecycle, test, tier policy, and
  operator-approved visual state.
- Commits are reviewable by slice; the overnight checkpoint is not merged as
  one opaque batch.
- Release is performed only through `.github/workflows/release.yml` after a
  green `main` deployment.

---

## 7. Required acceptance matrix

### Focused correctness

- Observe start, Tab, Escape, pointer, wheel, toolbar, selection, replay,
  completion, resize, and reduced-motion stepping.
- Wake pass contents, decay, zoom ramp, tier fade, reduced transition, content
  epoch, and disposal.
- Gerstner displacement plus finite-difference derivative at calm, regional
  scale, storm, and wind rotations.
- Sail set/furl states across hull scale, waterline, ride offset, and wind.
- Weather direction, deterministic lightning slots, hidden pause, content
  refresh, and DOM parity.
- Post pass order, phase uniforms, AO transition, resize, output conversion,
  and disposal.
- Upload queue scheduling, cancellation, timeout, and ownership.
- Logo bitmap close/prune/abort/unmount.

### Real-GPU preview

Use the maintained operator Chrome wrapper only.

| Zoom/state | Day | Dusk | Night |
| --- | --- | --- | --- |
| Overview/whole map | Required | Required | Required |
| Explore/default | Required | Required | Required |
| Analyze/selected | Required | Required | Required |

For every applicable cell:

- Normal motion and reduced motion.
- `full`, balanced/interaction, recovery, and constrained transition evidence.
- Default and selected fleet state where the view supports it.
- Record p50, p90, tier, scene calls, recurring offscreen calls, total calls,
  triangles, geometries, textures, targets, and ships.
- Run the night artifact probe.
- Run refresh/common and refresh/churn stress paths after upload scheduling.

Known whole-map regression command:

```bash
npm run preview -- --assert --hash "#cam=0,0,0.28&t=13" --width 1600 --height 1000
```

The fix must make that command pass without raising the 72-texture contract.

### Visual review questions

1. Is the sea still the first-viewport negative-space anchor?
2. Do default wind and sail motion preserve the established scene identity?
3. Do clouds read as part of the atmosphere at whole-map zoom?
4. Is night legible without making the water an uncontrolled emissive field?
5. Does AO ground ships/island without dirtying the quiet palette?
6. Does the beam read as a lighthouse/data signal without dominating the map?
7. Does each weather cue correspond to data or declared environmental state?
8. Does Observe teach the harbor sequence, or merely move the camera?

---

## 8. Commit and ownership boundaries

Recommended commit sequence:

1. `remove failed production WebGPU spike and restore budgets`
2. `fix Observe cancellation and camera intent ownership`
3. `correct wake passes, wind convention, sails, and Gerstner math`
4. `stabilize wake, weather, PMREM, and route state transitions`
5. `budget uploads and close renderer resource lifecycles`
6. `add post, telemetry, and whole-map resource contracts`
7. `retune approved atmosphere, post, weather semantics, and Observe`
8. `record final evidence and correct rendering documentation`

Do not combine a visual retune with shader-math or resource-lifecycle changes.
The visual result must be attributable to one reviewable cause.

---

## 9. Explicit non-goals

- No WebGPU migration in this follow-up.
- No `three` upgrade for version-number progress.
- No perspective camera mode.
- No planar reflections or SSR.
- No volumetric cloud dependency.
- No new atmospheric library unless a later, separately approved spike proves
  the current authored atmosphere cannot meet the product need.
- No new decorative content, particles, or ambient-life systems.
- No budget increase as a substitute for ownership or disposal.
- No manual semantic tag, GitHub Release, or deployment.

The completion condition is not "every Phase 1-5 idea exists." It is that the
retained rendering upgrade is correct, deterministic, resource-bounded,
analytically truthful, visually coherent, and releasable through the existing
gates.
