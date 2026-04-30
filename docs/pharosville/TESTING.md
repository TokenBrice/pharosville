# PharosVille Testing Guide

Last updated: 2026-04-29

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

## Visual And Browser Checks

Run Playwright when the change affects canvas drawing, interaction, viewport gating, reduced motion, screenshots, detail positioning, or route shell behavior:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"
```

Useful narrower lanes:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion"
npx playwright test tests/visual/pharosville.spec.ts --grep "reduced motion"
npx playwright test tests/visual/pharosville.spec.ts --grep "narrow fallback"
```

The visual suite covers desktop shell rendering, narrow/short fallback behavior, canvas interaction, reduced-motion behavior, normal-motion movement, and backing-store budget checks.

## Build And Release Checks

Use these when HTML metadata, CSS, assets, screenshots, or app shell behavior changes:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
```

Before claiming release-level confidence, run the current broad manual gate until the release worker adds a dedicated release script:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Docs-Only Maintenance Changes

For changes limited to PharosVille docs, run grep checks for stale standalone drift:

Run `rg` over `README.md`, `docs/pharosville`, `docs/pharosville-page.md`, and shared agent notes for former route paths and removed script names. Matches should be historical/tracker context only, not live instructions.

## What To Verify Manually

- The desktop gate still prevents world data, manifest, canvas, and sprite loading below `1280px` by `760px`.
- Normal motion visibly moves ships without turning route semantics into game mechanics.
- Reduced motion stays deterministic and does not run a RAF loop.
- Detail panel and accessibility ledger describe any new visual encoding.
- Hit targets align with sprites after scale, anchor, or motion changes.
- Docking cadence reads as chain presence, not transfers or activity.
