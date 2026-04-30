# PharosVille Change Checklist

Last updated: 2026-04-29

Use this checklist for future standalone PharosVille work. Keep it agent-facing and update it when the app workflow changes.

## Before Editing

- Read `docs/pharosville-page.md`, `docs/pharosville/CURRENT.md`, and `docs/pharosville/TESTING.md`.
- For asset work, also read `docs/pharosville/ASSET_PIPELINE.md`.
- Run `git status --short` and identify dirty files before touching anything.
- Inspect the exact files you plan to edit. Work with existing dirty changes; do not revert or overwrite unrelated work.
- State whether the change affects app behavior, visual encoding, asset inventory, data/API contracts, operations, or agent docs only.

## Scope Guardrails

- Keep changes under `src/**`, `public/pharosville/assets/`, `functions/api/**`, route docs, and this agent pack only when those paths are in your assigned scope.
- Do not change the Pages Function/API contract for a visual-only app change without explicit approval.
- Do not change methodology, scoring thresholds, or classification semantics from a PharosVille task.
- Do not move analytical meaning into canvas only; keep DOM parity for detail and accessibility.
- Do not weaken the desktop viewport gate or reduced-motion contract.

## Implementation Checks

- World-model changes should be pure and covered by focused system tests.
- Renderer changes must keep hit testing, selected rings, follow-selected behavior, and debug samples aligned.
- Motion changes must keep sampled routes deterministic, water-only where expected, and static under reduced motion.
- Asset changes must update `public/pharosville/assets/manifest.json`, bump `style.cacheVersion` when bytes/geometry/animation frames change, keep provenance aligned with `style.styleAnchorVersion`, and pass asset validation.
- Copy or route behavior changes may require `docs/pharosville-page.md`; route-maintenance process changes belong in `docs/pharosville/`.

## Pre-Claim Validation

Choose the narrowest relevant checks from `TESTING.md`, then broaden when the change touches shared route behavior.

Minimum for docs-only agent changes: run `rg` over `README.md`, `docs/pharosville`, `docs/pharosville-page.md`, and shared agent notes for former route paths and removed script names.

Minimum for PharosVille implementation changes:

```bash
npm test -- src
npm run check:pharosville-assets
npm run check:pharosville-colors
```

Add visual and build validation when UI, canvas, HTML metadata, screenshots, or deployable artifact behavior changes:

```bash
npm run build
npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"
```

Before publishing or claiming broad release confidence:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Handoff Notes

Record exact commands and outcomes in the relevant plan/handoff file when work spans multiple sessions. If a command is skipped, state why. If validation is blocked by pre-existing dirty work, identify the file and failure without changing unrelated files.
