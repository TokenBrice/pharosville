# PharosVille Change Checklist

Last updated: 2026-06-11

Use this only when you need a pre-claim checklist. For task routing, start with
`docs/pharosville/AGENT_ONBOARDING.md`.

## Before Editing

- Run `git status --short` and identify dirty files before touching anything.
- Inspect the exact files you plan to edit. Work with existing dirty changes; do not revert or overwrite unrelated work.
- Classify the change: docs/process, app/API, world model, renderer, assets, visual snapshots, or mixed.
- Read the narrow docs named in `AGENT_ONBOARDING.md` for that class only.

## Scope Guardrails

- Keep changes narrowly scoped to the assigned PharosVille paths.
- Do not change the Pages Function/API contract for a visual-only app change without explicit approval.
- Do not change methodology, scoring thresholds, or classification semantics from a PharosVille task.
- Do not move analytical meaning into canvas only; keep DOM parity for detail and accessibility.
- Do not weaken the desktop viewport gate or reduced-motion contract.

## Implementation

- World-model changes should be pure and covered by focused system tests.
- Renderer changes must keep hit testing, selected rings, follow-selected behavior, and debug samples aligned.
- Motion changes must keep sampled routes deterministic, water-only where expected, and static under reduced motion.
- Asset changes must update `public/pharosville/assets/manifest.json`, bump `style.cacheVersion` when bytes/geometry/animation frames change, keep provenance aligned with `style.styleAnchorVersion`, and pass asset validation.
- Copy or route behavior changes may require `docs/pharosville-page.md`; route-maintenance process changes belong in `docs/pharosville/`.

## Pre-Claim Validation

Use the narrowest relevant check while iterating. For unknown or mixed scope:

```bash
npm run validate:changed
```

Docs/process only:

```bash
npm run validate:docs
```

Common implementation checks:

```bash
npm test -- src
npm run check:pharosville-assets
npm run check:pharosville-colors
```

UI, canvas, HTML metadata, screenshots, or deployable artifact behavior:

```bash
npm run build
npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"
```

Broad release confidence:

```bash
npm run validate:release
```

## Handoff Notes

Record exact commands and outcomes in the relevant plan/handoff file when work
spans multiple sessions. If validation is blocked by pre-existing dirty work,
identify the file and failure without changing unrelated files.
