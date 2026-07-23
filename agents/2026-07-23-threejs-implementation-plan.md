# PharosVille Three.js Implementation Plan

Date: 2026-07-23

Status: Active reference

Companion assessment:
[`2026-07-23-threejs-pharosville-assessment.md`](./2026-07-23-threejs-pharosville-assessment.md)

## Objective

Prove that Three.js can make PharosVille calmer, clearer, more beautiful, and
more watchable without weakening its data meaning, accessibility, or
performance. If it passes that test, replace the Canvas renderer incrementally.

Current decision:

- **GO:** the operator approved the Three.js direction and production
  conversion after reviewing the decision slice.
- **ACTIVE:** Phase 4 production refinement and parity.
- **RELEASE HOLD:** work may continue autonomously, but no push is allowed
  without a later explicit operator instruction.

## Rules

1. Replace the renderer, not the application.
2. Keep `PharosVilleWorld` as the source of truth.
3. Keep exact analysis and accessibility in the DOM.
4. Use vanilla Three.js, `WebGLRenderer`, and an orthographic camera.
5. Build only what the active phase needs.
6. Measure before optimizing.
7. Keep Canvas working until the go/no-go decision.
8. Ship one renderer, not two.
9. The slice tests the Garden Observatory product concept, not density parity.
10. Slice geometry is procedural in code; the GLB pipeline waits for Phase 4.
11. Risk labels and captions are DOM overlays; revisit only if occlusion
    measurably breaks them.
12. Do not push any branch or release until the operator explicitly says to
    push.

Do not add WebGPU, React Three Fiber, physics, free orbit, a mobile runtime,
OffscreenCanvas, GLTFLoader, or an asset-pipeline campaign unless a later
measured need creates a separate decision.

## How To Track Work

- `[ ]` not started
- `[~]` active
- `[x]` verified
- `[!]` blocked

The orchestrator updates task status in the same change that completes the task.
Only one phase is active at a time. A phase is complete only when its exit gate
passes. Screenshots, traces, and scratch measurements belong in `outputs/`.

## Decision Gates

The slice may become the production renderer only if all critical gates pass.

| Area | Required result |
| --- | --- |
| Product | Clearly calmer and more compelling than Canvas, not merely novel |
| Composition | The slice overview demonstrates the calmer Garden Observatory composition, not a miniature of current density |
| Comprehension | The operator identifies lighthouse, water, docks, and ships and approves the production direction after direct review |
| Semantics | Same fixture produces the same PSI, risk, dock, ship, cemetery, and detail meanings |
| Accessibility | Keyboard, search, selection, details, ledger, focus, and announcements still work |
| Reduced motion | Deterministic scene with no continuous animation loop |
| Frame pacing | p90 at most 20 ms at 1440 x 1000 on the operator's reference machine |
| Responsiveness | No sustained period below 45 FPS or recurring interaction task above 50 ms |
| Startup | Cold first coherent scene at most 2.5 seconds under the agreed method |
| Stability | No unbounded GPU memory growth; context failure has a useful fallback |
| Desktop gate | Blocked viewports load no world data, Three.js, or 3D assets |
| Delivery | Final production build contains one renderer and passes the approved budget |

The 20 ms frame-pacing gate is deliberately stricter than the roughly 25 ms
p90 measured live on Canvas today. Record the Canvas baseline on the same
machine (P0.4) so the comparison is like-for-like.

---

## Phase 0: Prove The Look, Then Baseline

Purpose: answer "does a low-poly orthographic PharosVille look poetic?" before
building any renderer infrastructure, and create a trustworthy comparison. The
two tracks may run in parallel; the beauty spike is the gate.

Evidence:
[`2026-07-23-threejs-phase0-evidence.md`](./2026-07-23-threejs-phase0-evidence.md)

Beauty spike — the highest-risk unknown, run first:

- [x] **P0.1** Produce concept renders of the Garden Observatory look: palette,
  composition, negative space, materials, lighting, silhouette style.
- [x] **P0.2** Build one throwaway static Three.js scene in `outputs/` scratch —
  island, lighthouse, water shader, three procedural hulls, hardcoded data, no
  interface, no quality tiers, no production code.
- [x] **P0.3** Approve one visual reference sheet from the spike for camera,
  palette, materials, lighting, water, and model complexity. This is the
  binding look reference for every later phase.

Baseline track:

- [x] **P0.4** Record current bundle, startup, FPS, frame-pacing, and long-task
  results using the dense fixture and live data on the operator's reference
  machine — the same machine used for every later gate.
- [x] **P0.5** Capture approved Canvas references for day, dusk, night, reduced
  motion, and constrained quality.
- [x] **P0.6** Record the semantic, interaction, accessibility, and desktop-gate
  invariants the new renderer must preserve.
- [x] **P0.7** Freeze the slice, authored as the Garden Observatory composition:
  central island, lighthouse, two docks, two risk zones, 20 deterministic
  representative ships arranged with negative space and a framed asymmetric
  viewpoint, and one Observe sequence. Not a miniature of current density.
- [x] **P0.8** Implement the experiment switch as a build-time flag that
  excludes the Three.js chunk from production builds, keeping
  `check:bundle-size` untouched. Fallback only if the flag is impractical: a
  temporary exemption in `scripts/bundle-budgets.mjs` with a Phase 5 removal
  task.

### Exit Gate

- [x] The spike scene demonstrably delivers the look and the reference sheet is
  approved. If the spike cannot produce the look, record `STOP` before Phase 1.
- [x] Baselines are reproducible on the reference machine.
- [x] Slice scope and composition are approved.
- [x] Production behavior is unchanged.

---

## Phase 1: Build The Smallest Renderer

Purpose: prove Three.js fits the current application boundary.

- [x] **P1.1** Pin Three.js behind the P0.8 build-time experiment flag, so
  production builds contain no Three.js chunk, and lazy-load it only after the
  desktop gate passes.
- [x] **P1.2** Add one thin temporary boundary for Canvas/Three selection.
- [x] **P1.3** Mount a `WebGLRenderer`, scene, orthographic camera, static island,
  resize handling, and DPR limits.
- [x] **P1.4** Reuse the existing camera state and world clock. Do not create a
  second animation clock.
- [x] **P1.5** Pause while hidden and render on change under reduced motion.
- [x] **P1.6** Add basic metrics, GPU resource disposal, and a useful failure
  fallback.
- [x] **P1.7** Verify blocked viewports load neither Three.js nor world data.

### Exit Gate

- [x] Scene is nonblank, resize-safe, and driven by the existing world.
- [x] Reduced motion and desktop gate pass.
- [x] Bundle cost is recorded.
- [x] API, DOM details, and selection behavior are unchanged.

---

## Phase 2: Build The Decision Slice

Purpose: build only enough world to answer the product question.

- [x] **P2.1** Render central-island geography, a calm sea, and two stable
  analytical risk zones using the approved negative-space composition.
- [x] **P2.2** Build the lighthouse and two docks from existing world data.
- [x] **P2.3** Build three or four reusable low-poly hull families from
  procedural in-code geometry — no GLB — and render the frozen 20 ships
  efficiently.
- [x] **P2.4** Preserve route, movement, bobbing, selection, and risk meaning.
- [x] **P2.5** Add restrained wakes, weather, lighting, and readable day, dusk,
  and night states.
- [x] **P2.6** Support constrained pan, zoom, picking, and correct DOM selection
  anchors.
- [x] **P2.7** Preserve search, follow, URL state, details, keyboard behavior,
  announcements, focus restoration, and the accessibility ledger.
- [x] **P2.8** Render labels and captions as DOM overlays, and keep risk meaning
  understandable without relying only on color, lighting, motion, or depth.
- [x] **P2.9** Build one factual Observe sequence that pauses on input and is
  absent under reduced motion.
- [x] **P2.10** Implement balanced, recovery, constrained, and reduced-motion
  quality states.
- [x] **P2.11** Downshift DPR and decoration before removing analytical cues.
- [x] **P2.12** Add focused semantic, interaction, disposal, reduced-motion, and
  performance tests.
- [x] **P2.13** Capture matching Canvas and Three evidence from the same fixture
  and camera state.

### Exit Gate

- [x] Day, dusk, night, and reduced-motion scenes are coherent.
- [x] Pointer, keyboard, search, and details work.
- [x] Shared-fixture analytical meanings match Canvas.
- [x] Formal gate measurements are ready.

---

## Phase 3: Test And Decide

Purpose: make a measured decision before full conversion.

Evidence:
[`2026-07-23-threejs-phase3-automated-evidence.md`](./2026-07-23-threejs-phase3-automated-evidence.md)

Operator review and sign-off:
[`2026-07-23-threejs-decision-packet.md`](./2026-07-23-threejs-decision-packet.md)

- [x] **P3.1** Run all decision gates on the reference hardware. Automated
  reference-hardware and visual gates pass; the operator completed the
  remaining product decisions.
- [x] **P3.2** Check Chromium, Firefox, and Safari where available. Chromium
  and Firefox pass 9/9; native Safari is unavailable on Linux and Playwright's
  unsupported-host WebKit fallback could not complete installation.
- [x] **P3.3** Test long-session memory, context loss, asset failure, slow
  loading, and WebGL unavailability. A 300-second real-GPU soak held geometry
  and texture counts constant; six transient replacement cycles returned to
  baseline resources.
- [x] **P3.4** Complete keyboard-only and reduced-motion reviews.
- [x] **P3.5** Complete comprehension and preference review. The operator
  explicitly chose to be the product tester and approved the direction.
- [x] **P3.6** Approve the production asset-authoring approach. The operator
  chose agent-authored procedural/GLB assets with recorded validation and
  repository-owned provenance instead of an external human-art cost probe;
  a paid PixelLab probe confirmed that it produces useful disposable 2D
  multi-view references but no GLB, mesh, or production 3D output. It is not
  part of the runtime asset pipeline, and authoritative local logo assets are
  never regenerated.
- [x] **P3.7** Approve the bundle and asset-budget proposal. The candidate
  limits are approved and may be raised only when measured visual value and
  smooth reference performance justify the change.
- [x] **P3.8** Record one decision: `GO`, `ITERATE ONCE`, or `STOP`.
  The operator recorded `GO`.

### Exit Gate

- [x] Every decision gate has evidence.
- [x] The decision and rationale are recorded below.
- [x] Full conversion starts only after an explicit `GO`.

If the result is `STOP`, keep Canvas and separately consider the successful
engine-independent ideas: Observe mode, calmer density, framed viewpoints,
semantic zoom, and improved night contrast.

---

## Phase 4: Complete The Production Renderer

**Active after the Phase 3 `GO`.**

Purpose: reach full parity without redesigning unrelated application layers.

- [x] **P4.1** Complete geography, sea, analytical zones, labels, lighthouse,
  districts, docks, TON dispatch, and cemetery.
- [x] **P4.2** Complete standard ships; add optimized titan and heritage models
  only where distinct silhouettes matter. Four procedural hull families,
  stablecoin liveries, and logo sails provide the required distinction; no
  additional ship GLBs are justified for this release.
- [x] **P4.3** Complete routes, wakes, weather, ambient life, day, night, and
  reduced-motion presentation under the quality scheduler.
- [x] **P4.4** Instance or merge repeated geometry where measurements justify
  it.
- [x] **P4.5** Stand up the GLB pipeline, deferred from the slice, with simple
  geometry, material, texture, and file-size budgets.
- [x] **P4.6** Record scale, origin, anchors, LOD, pick proxy, provenance, and
  license for each model.
- [x] **P4.7** Add compression only if measurements justify the added runtime
  complexity. The checked lighthouse is 64.8 KiB, so compression is explicitly
  not justified.
- [x] **P4.8** Complete Overview, Explore, Analyze, semantic zoom, the Observe
  sequence, and the analytical ranking that selects Observe beats (top risk
  watch, growth or shrink story, concentration story).
- [x] **P4.9** Obtain explicit product approval before changing default fleet
  density or current visual invariants. Keep the 20-ship composition for now;
  refine the environment and identity before reconsidering density.
- [x] **P4.10** Preserve all search, selection, follow, detail, toolbar, time,
  URL, keyboard, ledger, announcement, and focus workflows.
- [x] **P4.11** Enforce startup, frame, draw-call, texture, and asset budgets.
- [x] **P4.12** Test disposal, world replacement, visibility, resize, context
  failure, and long-running stability.
- [ ] **P4.13** Replace renderer-specific tests and reapprove visual baselines.
  Tests and captures are replaced; direct operator approval of the final look
  remains pending.
- [x] **P4.14** Verify every Three.js and asset-loading entry remains behind the
  desktop gate.

### Exit Gate

- [x] Feature, semantic, accessibility, and failure-state parity are complete.
- [ ] All decision gates pass with the full representative world.
- [x] One-renderer production cutover is approved.

---

## Phase 5: Cut Over, Release, And Stabilize

This phase follows the normal release process; it adds no ceremony beyond it.
Local cutover work may proceed after Phase 4, but pushing and release remain
blocked until the operator explicitly authorizes a push.

- [x] **P5.1** Run the final Canvas/Three parity audit.
- [x] **P5.2** Approve final single-renderer JavaScript and first-render asset
  budgets; remove the experiment flag and any temporary budget exemption.
  Final limits are 1,800 KiB raw / 515 KiB gzip aggregate JavaScript and
  740 KiB raw / 200 KiB gzip for the renderer chunk.
- [x] **P5.3** Make Three.js the default and remove Canvas renderer code,
  caches, and tests. Confirm the build contains one renderer.
- [x] **P5.4** Update affected architecture, renderer, asset, testing, motion,
  visual-invariant, and operating docs — including that post-cutover GPU or
  context failure falls back to a DOM/static overview, since Canvas no longer
  exists as a fallback.
- [ ] **P5.5** Ship through the normal flow: `npm run validate:release`, green
  `main` deploy, `.github/workflows/release.yml`, then
  `npm run smoke:live -- --url https://pharosville.pharos.watch`.
- [ ] **P5.6** Monitor errors, context loss, startup, frame pacing, and quality
  downshifts; fix semantic, accessibility, stability, and performance
  regressions before adding effects.
- [ ] **P5.7** Review budgets and product outcomes using production evidence,
  then mark this plan `Completed` and record the final outcome.

### Exit Gate

- [ ] Production and live smoke are healthy with one renderer.
- [ ] Rollback is documented and tested.
- [ ] Stabilization review is complete.

WebGPU, worker rendering, extra post-processing, and larger model campaigns are
future decisions, not unfinished tasks here.

## Definition Of Done

A task is complete when its smallest relevant tests pass, its meaning and DOM
equivalents are preserved, reduced motion and the desktop gate still work where
relevant, rendering changes have measurements, and lasting decisions are
recorded here.

Use `npm run validate:changed` for mixed work and `npm run validate:release`
before release confidence.

## Decision Log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-07-23 | Build a bounded slice; do not authorize full conversion yet. | Visual upside is high, but bundle, art, density, accessibility, and performance risks need proof. |
| 2026-07-23 | Use vanilla Three.js, `WebGLRenderer`, and an orthographic camera. | Smallest fit with the current renderer and stable analytical scale. |
| 2026-07-23 | Phase 0 leads with a beauty spike; an approved look reference gates all later phases. | Art direction is the weakest-scored, highest-risk unknown; prove it before infrastructure. |
| 2026-07-23 | The slice is authored as the calmer Garden Observatory composition, not current-density parity. | The experiment must test the product concept; parity at current density answers the wrong question. |
| 2026-07-23 | Slice geometry is procedural in code; GLB and the asset pipeline are deferred to Phase 4, except the single P3.6 cost probe. | Removes the art pipeline from the slice critical path; the look is provable with palette, materials, lighting, and silhouette. |
| 2026-07-23 | The experiment chunk is excluded from production builds by a build-time flag. | `check:bundle-size` sums every JS chunk in `dist/assets`; ~44 KiB raw headroom cannot absorb Three.js even lazily. |
| 2026-07-23 | Risk labels and captions are DOM overlays. | Minimal and accessible; revisit only if occlusion measurably breaks them. |
| 2026-07-23 | Post-cutover GPU failure falls back to a DOM/static overview, not Canvas. | Canvas is removed at cutover; no maintained dual fallback. |
| 2026-07-23 | Gates are sized to this project: direct operator review and the operator's machine as reference hardware. | The operator is the product tester; invented external cohorts would add ceremony without improving this decision. |
| 2026-07-23 | `ITERATE ONCE`: improve water, boat silhouettes, fleet staging, and localized risk legibility only. | Reference performance was already strong, but the first slice was too basic to answer the product question. |
| 2026-07-23 | The bounded beauty iteration passes the approved visual review. | One shader water surface, shared procedural boat geometry, a separated fleet crescent, warmer beacon, and the existing risk field deliver the look without new pipelines or effects. |
| 2026-07-23 | Separate the 60-second strict pacing gate from a 300-second resource soak, and name the normal animated quality tier `balanced`. | Performance and unbounded-growth questions need different evidence; the runtime name now matches the approved quality ladder. |
| 2026-07-23 | `GO`: proceed with the production Three.js renderer. | The operator found the slice encouraging and exceptionally smooth, while identifying water, landmark modeling, lighting, and stablecoin ship identity as the production-quality gaps. |
| 2026-07-23 | Replace the five-person cohort and external human-art probe with direct operator review and agent-authored assets. | The operator is the product tester and chose the simpler production path; validation, provenance, and measured budgets remain mandatory. |
| 2026-07-23 | Keep 20 staged ships for now and pursue a more ambitious visual style. | The current emptiness may come from under-authored water and landmarks rather than fleet count; refine those before increasing density. |
| 2026-07-23 | Accept Chromium and Firefox coverage without native Safari on the Linux reference machine. | Safari is unavailable in the current environment and is not a release blocker for this conversion. |
| 2026-07-23 | No push without a new explicit operator instruction. | Implementation may continue autonomously, but remote mutation and release remain under operator control. |
| 2026-07-23 | PixelLab is reference-only, not a production 3D pipeline. | The paid probe produced useful multi-view concepts but no GLB, mesh, PBR material, or deterministic rebuild; local logos and agent-authored geometry remain authoritative. |
| 2026-07-23 | Keep the four procedural ship families for the first Three.js release. | Stablecoin color, logo sails, rig, scale, and silhouette already provide identity; another model campaign adds weight without resolving a measured gap. |
| 2026-07-23 | Approve measured single-renderer budgets of 1,800/515 KiB aggregate and 740/200 KiB for the renderer chunk. | The final build measures 1,728.4/487.3 KiB aggregate and 692.2/183.2 KiB for the renderer; strict reference pacing and GPU resource gates pass with deliberate headroom. |
| 2026-07-23 | Run WebGL Playwright worlds serially. | Parallel fresh WebGL initialization created artificial context contention; one worker matches real use and removes test-only flakiness. |

## Progress

| Phase | Status |
| --- | --- |
| 0. Look and baseline | Complete |
| 1. Minimal renderer | Complete |
| 2. Decision slice | Complete |
| 3. Test and decide | Complete: `GO` |
| 4. Production renderer | Implementation complete; operator visual approval pending |
| 5. Cutover, release, stabilize | Local cutover complete; push and release locked |
