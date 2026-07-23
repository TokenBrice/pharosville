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

- **GO:** build a production-quality vertical slice.
- **NOT APPROVED:** full Three.js conversion.

## Rules

1. Replace the renderer, not the application.
2. Keep `PharosVilleWorld` as the source of truth.
3. Keep exact analysis and accessibility in the DOM.
4. Use vanilla Three.js, `WebGLRenderer`, and an orthographic camera.
5. Build only what the active phase needs.
6. Measure before optimizing.
7. Keep Canvas working until the go/no-go decision.
8. Ship one renderer, not two.

Do not add WebGPU, React Three Fiber, physics, free orbit, a mobile runtime,
OffscreenCanvas, or a high-poly asset campaign unless a later measured need
creates a separate decision.

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
| Comprehension | At least 80% of representative testers identify lighthouse, water, docks, and ships correctly after one minute |
| Semantics | Same fixture produces the same PSI, risk, dock, ship, cemetery, and detail meanings |
| Accessibility | Keyboard, search, selection, details, ledger, focus, and announcements still work |
| Reduced motion | Deterministic scene with no continuous animation loop |
| Frame pacing | p90 at most 20 ms at 1440 x 1000 on the agreed reference machine |
| Responsiveness | No sustained period below 45 FPS or recurring interaction task above 50 ms |
| Startup | Cold first coherent scene at most 2.5 seconds under the agreed method |
| Stability | No unbounded GPU memory growth; context failure has a useful fallback |
| Desktop gate | Blocked viewports load no world data, Three.js, or 3D assets |
| Delivery | Final production build contains one renderer and passes the approved budget |

---

## Phase 0: Establish The Baseline

Purpose: create a trustworthy comparison before adding Three.js.

- [ ] **P0.1** Agree on reference browsers and hardware.
- [ ] **P0.2** Record current bundle, startup, FPS, frame-pacing, and long-task
  results using the dense fixture and live data.
- [ ] **P0.3** Capture approved Canvas references for day, dusk, night, reduced
  motion, and constrained quality.
- [ ] **P0.4** Record the semantic, interaction, accessibility, and desktop-gate
  invariants the new renderer must preserve.
- [ ] **P0.5** Freeze the slice: central island, lighthouse, two docks, two risk
  zones, 20 deterministic representative ships, and one Observe sequence.
- [ ] **P0.6** Approve one visual reference sheet for camera, palette, materials,
  lighting, water, and model complexity.
- [ ] **P0.7** Define a non-default experiment switch.

### Exit Gate

- [ ] Baselines are reproducible.
- [ ] Slice scope and visual direction are approved.
- [ ] Production behavior is unchanged.

---

## Phase 1: Build The Smallest Renderer

Purpose: prove Three.js fits the current application boundary.

- [ ] **P1.1** Pin Three.js and lazy-load it only after the desktop gate passes.
- [ ] **P1.2** Add one thin temporary boundary for Canvas/Three selection.
- [ ] **P1.3** Mount a `WebGLRenderer`, scene, orthographic camera, static island,
  resize handling, and DPR limits.
- [ ] **P1.4** Reuse the existing camera state and world clock. Do not create a
  second animation clock.
- [ ] **P1.5** Pause while hidden and render on change under reduced motion.
- [ ] **P1.6** Add basic metrics, GPU resource disposal, and a useful failure
  fallback.
- [ ] **P1.7** Verify blocked viewports load neither Three.js nor world data.

### Exit Gate

- [ ] Scene is nonblank, resize-safe, and driven by the existing world.
- [ ] Reduced motion and desktop gate pass.
- [ ] Bundle cost is recorded.
- [ ] API, DOM details, and selection behavior are unchanged.

---

## Phase 2: Build The Decision Slice

Purpose: build only enough world to answer the product question.

- [ ] **P2.1** Render central-island geography, a calm sea, and two stable
  analytical risk zones.
- [ ] **P2.2** Build the lighthouse and two docks from existing world data.
- [ ] **P2.3** Build three or four reusable low-poly hull families and render 20
  ships efficiently.
- [ ] **P2.4** Preserve route, movement, bobbing, selection, and risk meaning.
- [ ] **P2.5** Add restrained wakes, weather, lighting, and readable day, dusk,
  and night states.
- [ ] **P2.6** Support constrained pan, zoom, picking, and correct DOM selection
  anchors.
- [ ] **P2.7** Preserve search, follow, URL state, details, keyboard behavior,
  announcements, focus restoration, and the accessibility ledger.
- [ ] **P2.8** Keep labels and risk meaning understandable without relying only
  on color, lighting, motion, or depth.
- [ ] **P2.9** Build one factual Observe sequence that pauses on input and is
  absent under reduced motion.
- [ ] **P2.10** Implement balanced, recovery, constrained, and reduced-motion
  quality states.
- [ ] **P2.11** Downshift DPR and decoration before removing analytical cues.
- [ ] **P2.12** Add focused semantic, interaction, disposal, reduced-motion, and
  performance tests.
- [ ] **P2.13** Capture matching Canvas and Three evidence from the same fixture
  and camera state.

### Exit Gate

- [ ] Day, dusk, night, and reduced-motion scenes are coherent.
- [ ] Pointer, keyboard, search, and details work.
- [ ] Shared-fixture analytical meanings match Canvas.
- [ ] Formal gate measurements are ready.

---

## Phase 3: Test And Decide

Purpose: make a measured decision before full conversion.

- [ ] **P3.1** Run all decision gates on the reference hardware.
- [ ] **P3.2** Check Chromium, Firefox, and Safari where available.
- [ ] **P3.3** Test long-session memory, context loss, asset failure, slow
  loading, and WebGL unavailability.
- [ ] **P3.4** Complete keyboard-only and reduced-motion reviews.
- [ ] **P3.5** Run representative comprehension and preference testing.
- [ ] **P3.6** Measure the time and cost to produce one finished ship, one
  landmark, and one environment asset.
- [ ] **P3.7** Approve a final bundle and asset-budget proposal.
- [ ] **P3.8** Record one decision: `GO`, `ITERATE ONCE`, or `STOP`.

### Exit Gate

- [ ] Every decision gate has evidence.
- [ ] The decision and rationale are recorded below.
- [ ] Full conversion starts only after an explicit `GO`.

If the result is `STOP`, keep Canvas and separately consider the successful
engine-independent ideas: Observe mode, calmer density, framed viewpoints,
semantic zoom, and improved night contrast.

---

## Phase 4: Complete The Production Renderer

**Locked until Phase 3 records `GO`.**

Purpose: reach full parity without redesigning unrelated application layers.

- [ ] **P4.1** Complete geography, sea, analytical zones, labels, lighthouse,
  districts, docks, TON dispatch, and cemetery.
- [ ] **P4.2** Complete standard ships; add optimized titan and heritage models
  only where distinct silhouettes matter.
- [ ] **P4.3** Complete routes, wakes, weather, ambient life, day, night, and
  reduced-motion presentation under the quality scheduler.
- [ ] **P4.4** Instance or merge repeated geometry where measurements justify
  it.
- [ ] **P4.5** Use GLB with simple geometry, material, texture, and file-size
  budgets.
- [ ] **P4.6** Record scale, origin, anchors, LOD, pick proxy, provenance, and
  license for each model.
- [ ] **P4.7** Add compression only if measurements justify the added runtime
  complexity.
- [ ] **P4.8** Complete Overview, Explore, Analyze, semantic zoom, and the
  Observe sequence.
- [ ] **P4.9** Obtain explicit product approval before changing default fleet
  density or current visual invariants.
- [ ] **P4.10** Preserve all search, selection, follow, detail, toolbar, time,
  URL, keyboard, ledger, announcement, and focus workflows.
- [ ] **P4.11** Enforce startup, frame, draw-call, texture, and asset budgets.
- [ ] **P4.12** Test disposal, world replacement, visibility, resize, context
  failure, and long-running stability.
- [ ] **P4.13** Replace renderer-specific tests and reapprove visual baselines.
- [ ] **P4.14** Verify every Three.js and asset-loading entry remains behind the
  desktop gate.

### Exit Gate

- [ ] Feature, semantic, accessibility, and failure-state parity are complete.
- [ ] All decision gates pass with the full representative world.
- [ ] One-renderer production cutover is approved.

---

## Phase 5: Cut Over And Release

- [ ] **P5.1** Run the final Canvas/Three parity audit.
- [ ] **P5.2** Approve final JavaScript and first-render asset budgets.
- [ ] **P5.3** Make Three.js the default.
- [ ] **P5.4** Remove Canvas renderer code, caches, tests, and experiment switch.
- [ ] **P5.5** Confirm the build contains one renderer.
- [ ] **P5.6** Update affected architecture, renderer, asset, testing, motion,
  visual-invariant, and operating docs.
- [ ] **P5.7** Run `npm run validate:release`.
- [ ] **P5.8** Merge through the normal green-main deployment flow.
- [ ] **P5.9** Release only through `.github/workflows/release.yml`.
- [ ] **P5.10** Run `npm run smoke:live -- --url
  https://pharosville.pharos.watch`.

### Exit Gate

- [ ] Production and live smoke are healthy.
- [ ] Rollback is documented and tested.

---

## Phase 6: Stabilize

- [ ] **P6.1** Monitor errors, context loss, startup, frame pacing, and quality
  downshifts.
- [ ] **P6.2** Fix semantic, accessibility, stability, and performance
  regressions before adding effects.
- [ ] **P6.3** Review budgets and product outcomes using production evidence.
- [ ] **P6.4** Mark this plan `Completed` and record the final outcome after
  stabilization passes.

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

## Progress

| Phase | Status |
| --- | --- |
| 0. Baseline | Not started |
| 1. Minimal renderer | Not started |
| 2. Decision slice | Not started |
| 3. Test and decide | Not started |
| 4. Production renderer | Locked |
| 5. Cutover and release | Locked |
| 6. Stabilization | Locked |
