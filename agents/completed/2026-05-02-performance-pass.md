# Performance Pass

Date: 2026-05-02

## Goal

- Identify low-risk PharosVille runtime bottlenecks and implement improvements with no intentional visual drift.
- Keep the change set maintainable and route-local.
- Validate both behavioral integrity and build/bundle budgets after the optimization pass.

## Scope

- In scope:
  - Hot-path renderer/runtime bookkeeping under `src/renderer/**`.
  - Supporting test coverage for the optimized asset-loading path.
  - Focused runtime/build measurements to justify the changes.
- Out of scope:
  - Asset bytes, manifests, or visual baselines.
  - API/query contract changes.
  - Non-PharosVille repo cleanup.

## Constraints

- Keep changes route-local unless explicitly requested otherwise.
- Preserve `/api/*` allowlist and server-side secret handling.

## Plan

1. Inspect the desktop runtime for repeated work in render/cache paths and measure current build/runtime-sensitive baselines.
2. Optimize the highest-confidence hot path with minimal visual risk, favoring allocation reduction and cheaper cache invalidation.
3. Run focused tests first, then broaden to repo validation and a browser canvas lane.

## Validation

- [x] `npm run validate`
- [x] Additional focused checks (list exact commands):
  - `npm test -- src/renderer/asset-manager.test.ts`
  - `npm test -- src/hooks/use-world-render-loop.test.tsx`
  - `npm run typecheck`
  - `npm run build`
  - `npm run check:bundle-size`
  - `npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville normal motion"`
  - In-process benchmark before change:
    - `npx tsx --eval '... manager.getLoadStats() loop ...'`
    - Result: `20000` iterations in `60.43 ms` (`0.003022 ms/call`)
  - In-process benchmark after change:
    - `npx tsx --eval '... manager.getLoadStats() loop ...'`
    - Result: `20000` iterations in `2.46 ms` (`0.000123 ms/call`)

## Handoff

- Files changed:
  - `src/renderer/asset-manager.ts`
  - `src/renderer/world-canvas.ts`
  - `src/renderer/asset-manager.test.ts`
- Risks/notes:
  - Full validation passes. `check:pharosville-assets` still emits the existing warning about `landmark.yggdrasil` source size; no asset files changed in this pass.
  - Build output remains within budget, though the desktop lazy chunk grew slightly (`884.8 KiB -> 885.4 KiB` raw) because the optimization adds a small amount of bookkeeping code.
  - Pre-existing untracked harbor PNG files were left untouched.
- Follow-ups:
  - If another runtime pass is needed, next candidates are hit-target snapshot recomputation and any repeated work inside the animated ship draw path.
