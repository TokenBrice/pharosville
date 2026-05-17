# PharosVille Testing Guide

Last updated: 2026-05-17

Use this guide to choose focused checks for the standalone PharosVille Vite app.

## Fast Focused Checks

World model, route facts, ship visual classes, risk placement, map layout, and motion:

```bash
npm test -- src
```

Asset manifest and local PNG contract:

```bash
npm run check:pharosville-assets
```

Built bundle-size budget, after `npm run build`:

```bash
npm run check:bundle-size
```

Route palette guardrail:

```bash
npm run check:pharosville-colors
```

Focused renderer/hit-testing changes:

```bash
npm test -- src/renderer/hit-testing.test.ts
```

Focused motion changes:

```bash
npm test -- src/systems/motion.test.ts
```

Sustained animation performance and frame pacing:

```bash
npm run test:perf
```

Local API/dev-proxy sanity (recommended before debugging missing ships/data):

```bash
npm run setup:local-api-key
npm run smoke:api-local
npm run smoke:dev-proxy
```

## Visual And Browser Checks

Run Playwright when the change affects canvas drawing, interaction, viewport gating, reduced motion, screenshots, detail positioning, or route shell behavior:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"
```

Focus only on accessibility/semantic checks:

```bash
npm run test:visual:accessibility
```

Cross-browser accessibility smoke check (Chromium + Firefox):

```bash
npm run test:visual:cross-browser
npm run test:visual:dist:accessibility
```

Useful narrower lanes:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion"
npx playwright test tests/visual/pharosville.spec.ts --grep "reduced motion"
npx playwright test tests/visual/pharosville.spec.ts --grep "narrow fallback"
```

The visual suite covers desktop shell rendering, narrow/short fallback behavior, canvas interaction, reduced-motion behavior, normal-motion movement, and backing-store budget checks. The narrow fallback has a committed screenshot baseline; the short fallback is DOM-only coverage that confirms no clipped canvas and no world/runtime requests below `360px` height.

Temporal smoothness coverage lives in the browser lane, not the screenshot baselines:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|normal motion"
```

This checks camera zoom monotonicity, camera bounds during interaction, and follow-selected attachment to a moving ship using `window.__pharosVilleDebug` fields. Keep visual snapshot updates out of this lane unless the rendered pixels intentionally change.

## Budget Guards

Current executable budgets:

- Entry chunk: `<= 300 KiB` raw and `<= 90 KiB` gzip.
- Desktop lazy chunk: `<= 960 KiB` raw and `<= 275 KiB` gzip.
- Entry CSS: `<= 32 KiB` raw and `<= 8 KiB` gzip.
- Total JS: `<= 1,268 KiB` raw and `<= 375 KiB` gzip.
- First-render assets: `<= 28` PNGs, `<= 575 KiB` source bytes, and `<= 875,000` decoded pixels.
- Total runtime PharosVille assets: `<= 900 KiB` source bytes and `<= 1,300,000` decoded pixels.
- Canvas backing store: capped by `MAX_MAIN_CANVAS_PIXELS` and `MAX_TOTAL_BACKING_PIXELS` in `src/systems/canvas-budget.ts`.

`npm run test:perf` also samples `window.__pharosVilleDebug.renderMetrics.framePacing` when present. The CI guard tier is intentionally conservative while run history is gathered:

- `activeMotionLoopCount === 1` under normal motion.
- `activeCameraLoopCount === 0` and `cameraFrameSource === "world-render-loop"` during the camera-stress lane.
- `drawDurationMs` median `<= 140ms` and p95 `<= 200ms` over the sustained window.
- `framePacing.effectiveFps >= 8`.
- `framePacing.p90Ms <= 180ms`.
- `framePacing.droppedFrameCount` and `framePacing.longestDroppedBurst` stay below broad rolling-window ratios.
- Camera pan/zoom stress uses an initial CI guard of `effectiveFps >= 12`, `p90Ms <= 120ms`, and longest dropped burst `<= 25%` of the sampled window.
- `longtask.count === 0` when longtask telemetry is available.

The local smooth target for manual optimization at `1440x960` is stricter: `effectiveFps >= 50`, `framePacing.p90Ms <= 24ms`, `longestDroppedBurst <= 1`, and `longtask.count === 0`. Tighten the CI guard only after several stable runs on the target runners.

Runtime smoothness telemetry also exposes per-frame timing diagnostics
(`sampleDurationMs`, `hitTargetDurationMs`, `debugPublishDurationMs`,
`telemetryOverheadMs`), water accent metrics, render-scheduler tier/skipped
passes, and backing-store sprite cache pixels. Use these fields to distinguish
actual renderer pressure from instrumentation or retained-cache pressure before
tightening budgets.

Display-size waste in `npm run check:pharosville-assets` is warning-only unless an image decodes more than 4x its displayed pixel area. Treat warnings as optimization backlog and failures as release blockers.

## Build And Release Checks

Use these when HTML metadata, CSS, assets, screenshots, or app shell behavior changes:

```bash
npm run validate
```

For bundle-sensitive changes, run the build-output budget explicitly:

```bash
npm run build
npm run check:bundle-size
```

`npm test` is the default Vitest lane and includes `src`, `functions`, and the PharosVille shared contract tests so the split app keeps the copied shared contracts under validation.

Before claiming release-level confidence, run the broad release gate:

```bash
npm run validate:release
```

For the post-deploy production readiness gate (security headers + cross-browser
accessibility smoke + live smoke), run:

```bash
npm run check:release-readiness
```

## Docs-Only Maintenance Changes

For changes limited to PharosVille docs, run:

```bash
npm run validate:docs
```

For mixed or uncertain scope, use:

```bash
npm run validate:changed
```

And keep grep checks for stale standalone drift when needed:

Run `rg` over `README.md`, `docs/pharosville`, `docs/pharosville-page.md`, and shared agent notes for former route paths and removed script names. Matches should be historical/tracker context only, not live instructions.

## What To Verify Manually

- The desktop gate still prevents world data, manifest, canvas, and sprite loading below `720px` by `360px`.
- Normal motion visibly moves ships without turning route semantics into game mechanics.
- Sustained normal motion and scripted camera pan/zoom stress report stable frame pacing in the perf lane, with no longtask entries during the sampled window.
- Reduced motion stays deterministic and does not run a RAF loop.
- Camera zoom moves monotonically for repeated zoom-in input, and follow-selected keeps the selected moving ship attached without violating camera bounds.
- Detail panel and accessibility ledger describe any new visual encoding.
- Hit targets align with sprites after scale, anchor, or motion changes.
- Docking cadence reads as chain presence, not transfers or activity.
