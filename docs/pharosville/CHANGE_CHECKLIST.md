# PharosVille Change Checklist

Last updated: 2026-07-24

## Before Editing

- Run `git status --short` and preserve unrelated work.
- Run `npm run onboard:agent`.
- Read only the task-specific docs named by `AGENT_ONBOARDING.md`.
- Confirm the change belongs to this standalone repository.
- Keep browser API calls same-origin and `PHAROS_API_KEY` server-side.

## Runtime

- Preserve one production Three.js renderer.
- Preserve the desktop screen/orientation gate before data and runtime import.
- Keep the DOM static overview as the renderer/GPU failure path.
- Keep analytical meaning in details and the accessibility ledger.
- Use the same motion sample for rendering, hit testing, follow, and debug.
- Keep reduced motion deterministic with no continuous RAF.
- For Three.js work, follow `THREEJS_AGENT_REFERENCE.md` (dispose paths, shared
  geometry, tiers, hit-test parity).

## Media

- Runtime image decoding remains logo-only; model and water media use their
  narrow Three.js owners.
- Checked model changes go through deterministic generators and metadata.
- New models need explicit origin, scale, anchors, pick proxy, provenance,
  license, failure behavior, and budgets.
- Image-generation output stays reference-only until deliberately
  translated into production code or an approved model pipeline.
- `npm run check:runtime-media` must pass for media changes.

## Validation

- Use the smallest focused unit test while iterating.
- Three.js visual changes: `npm run test:visual`.
- Performance/resource changes: `npm run test:perf`.
- Runtime media changes: `npm run check:runtime-media`.
- Viewport/loading changes: `npm run check:viewport-gate`.
- Mixed scope: `npm run validate:changed`.
- Broad release confidence: `npm run validate:release`.

## Before Claiming Completion

- Inspect the diff and run `git diff --check`.
- State which checks ran and which did not.
- Do not commit generated `dist/`, browser scratch, test results, or local env
  files.
- Do not deploy, tag, publish a GitHub Release, or push unless explicitly
  authorized.
- Versioned releases must follow `RELEASES.md` and the protected workflow after
  a green `main` deployment.
