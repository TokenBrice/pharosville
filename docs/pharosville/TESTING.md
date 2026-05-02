# PharosVille Testing Guide

Last updated: 2026-05-01

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

The visual suite covers desktop shell rendering, narrow/short fallback behavior, canvas interaction, reduced-motion behavior, normal-motion movement, and backing-store budget checks. The narrow fallback has a committed screenshot baseline; the short fallback is DOM-only coverage that confirms no clipped canvas and no world/runtime requests below `760px` height.

## Budget Guards

Current executable budgets:

- Entry chunk: `<= 300 KiB` raw and `<= 90 KiB` gzip.
- Desktop lazy chunk: `<= 950 KiB` raw and `<= 275 KiB` gzip.
- Entry CSS: `<= 32 KiB` raw and `<= 8 KiB` gzip.
- Total JS: `<= 1,250 KiB` raw and `<= 375 KiB` gzip.
- First-render assets: `<= 28` PNGs, `<= 575 KiB` source bytes, and `<= 875,000` decoded pixels.
- Total runtime PharosVille assets: `<= 900 KiB` source bytes and `<= 1,300,000` decoded pixels.
- Canvas backing store: capped by `MAX_MAIN_CANVAS_PIXELS` and `MAX_TOTAL_BACKING_PIXELS` in `src/systems/canvas-budget.ts`.

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

- The desktop gate still prevents world data, manifest, canvas, and sprite loading below `1280px` by `760px`.
- Normal motion visibly moves ships without turning route semantics into game mechanics.
- Reduced motion stays deterministic and does not run a RAF loop.
- Detail panel and accessibility ledger describe any new visual encoding.
- Hit targets align with sprites after scale, anchor, or motion changes.
- Docking cadence reads as chain presence, not transfers or activity.
