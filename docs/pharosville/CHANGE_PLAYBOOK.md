# PharosVille Change Playbook

Last updated: 2026-05-01

Use this playbook to choose the smallest safe path for `/pharosville/` work. The verified product contract remains `docs/pharosville-page.md`; this file is for maintenance execution.

## Decision Path

Start by classifying the change:

| Change type | Read first | Likely source files | Required follow-up |
| --- | --- | --- | --- |
| App shell, desktop gate, metadata, loading, or error state | `docs/pharosville-page.md`, `CURRENT.md`, `TESTING.md` | `index.html`, `src/App.tsx`, `src/client.tsx`, `src/desktop-only-fallback.tsx`, `src/pharosville-desktop-data.tsx`, `src/pharosville-world.tsx` | Update `docs/pharosville-page.md` for behavior changes. Run visual checks and `npm run build` for deployable artifact changes. |
| World-model mapping or data semantics | `VISUAL_INVARIANTS.md`, `SCENARIO_CATALOG.md`, `src/systems/README.md` | `src/systems/pharosville-world.ts`, `src/systems/detail-model.ts`, `src/systems/chain-docks.ts`, `src/systems/risk-placement.ts`, `src/systems/ship-visuals.ts`, `src/systems/world-types.ts` | Keep DOM detail parity. Add or update focused system tests. Update `docs/pharosville-page.md` if visual meaning changes. |
| Layout, geography, or selectable placement | `VISUAL_INVARIANTS.md`, `VISUAL_REVIEW_ATLAS.md`, `src/systems/README.md` | `src/systems/world-layout.ts`, `src/systems/chain-docks.ts`, `src/systems/pharosville-world.ts`, `src/renderer/hit-testing.ts` | Check target overlap, water/land ratios, desktop shell screenshot, absence of retired building targets, and interaction tests. |
| Canvas drawing or animation | `src/renderer/README.md`, `VISUAL_INVARIANTS.md`, `TESTING.md` | `src/renderer/world-canvas.ts`, `src/renderer/hit-testing.ts`, `src/pharosville-world.tsx`, `src/systems/motion.ts`, `src/systems/canvas-budget.ts` | Keep reduced motion deterministic, hit targets aligned, and backing pixels capped. Run Playwright visual checks. |
| Asset addition or replacement | `ASSET_PIPELINE.md`, `VISUAL_REVIEW_ATLAS.md`, `src/renderer/README.md` | `public/pharosville/assets/**`, `public/pharosville/assets/manifest.json`, `src/systems/asset-manifest.ts`, renderer draw/hitbox logic if geometry changes | Bump manifest cache/style provenance fields per `ASSET_PIPELINE.md`, validate PNG dimensions and manifest references, run asset/color checks and visual tests. |
| Fixture, scenario, or visual test update | `SCENARIO_CATALOG.md`, `VISUAL_REVIEW_ATLAS.md`, `TESTING.md` | `src/__fixtures__/pharosville-world.ts`, `tests/visual/pharosville.spec.ts`, focused `*.test.ts` files | Keep scenarios realistic and fixture-only. Do not introduce production fallback data. |
| Maintenance guidance | `README.md`, `AGENT_ONBOARDING.md`, `CURRENT.md`, this file | `README.md`, `AGENTS.md`, `CLAUDE.md`, `agents/*.md`, `docs/pharosville/*.md`, `docs/pharosville-page.md`, `src/renderer/README.md`, `src/systems/README.md` | Run docs validation when verified docs changed. Keep historical context subordinate to `CURRENT.md`. |

## Edit Loop

1. Run `git status --short`.
2. Inspect the files you plan to touch and any dirty files in that scope.
3. Identify whether the change affects route behavior, visual semantics, assets, tests, docs, or maintenance process only.
4. Make the smallest route-local change that satisfies the task.
5. Update matching docs before validation, not after.
6. Run the narrow checks from the table below, then broaden when the change affects exported pages or shared contracts.

## Focused Validation

| Work area | First checks |
| --- | --- |
| World model and data mapping | `npm test -- src` |
| Layout/geography | `npm test -- src/systems/world-layout.test.ts src/systems/chain-docks.test.ts` |
| Motion | `npm test -- src/systems/motion.test.ts` |
| Hit testing | `npm test -- src/renderer/hit-testing.test.ts` |
| Assets | `npm run check:pharosville-assets` |
| Palette/color drift | `npm run check:pharosville-colors` |
| Canvas/UI behavior | `npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"` |
| Deployable artifact or metadata | `npm run validate` |
| Release/deploy-impacting work | `npm run validate:release` |
| Docs/process only | `npm run validate:docs` |

## Documentation Rules

- Update `docs/pharosville-page.md` when user-visible behavior, visual semantics, route shell behavior, or validation expectations change.
- Update `docs/pharosville/CURRENT.md` when entrypoints, authoritative invariants, or workflow boundaries change.
- Update `SCENARIO_CATALOG.md` when tests/fixtures gain or lose canonical scenarios.
- Update `VISUAL_REVIEW_ATLAS.md` when screenshot baselines, Playwright coverage, or manual visual review criteria change.
- Update `ASSET_PIPELINE.md` when manifest schema, asset staging, or promotion rules change.
