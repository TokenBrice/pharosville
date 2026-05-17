# PharosVille Smoothness Follow-Up Execution Report

Date: 2026-05-17

Source plan: `agents/2026-05-17-pharosville-smoothness-follow-up-plan.md`

## Scope Completed

- Phase 1: camera stepping now runs inside the world render loop, with debug proof fields `activeCameraLoopCount: 0` and `cameraFrameSource: "world-render-loop"`.
- Phase 2: hot-path telemetry now uses fixed-size windows and reusable debug sample buffers, with added timing diagnostics and a dedicated camera pan/zoom perf lane.
- Phase 3: static water detail moved into the terrain cache; continuous water accents draw live with pass metrics and thinned decorative density for steady-state frame pacing.
- Phase 4: render scheduler tiers (`full`, `interaction`, `constrained`, `recovery`) now shed decorative passes before analytical or interaction-critical content.
- Phase 5: retained backing metrics include sprite cache pixels, and ship body precomposition is budgeted, LRU-evicted, and warmed gradually per frame.
- Phase 6: scenery props are classified as static or dynamic, with tests covering classification and placement consistency.

## Swarm Ownership

- Phase 1 worker owned camera hook/world-loop integration files.
- Phase 3 worker owned terrain water split and render metric types.
- Phase 5 worker owned initial ship-body cache module and tests.
- Phase 6 worker owned scenery classification and tests.
- Final integration owned scheduler wiring, shared budget accounting, perf lane, docs, bundle budget update, and validation.

## Validation Run

- `npm run typecheck`
- `npm test` (73 files, 694 tests)
- `npm run test:perf` (2 Playwright perf tests)
- `npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion"`
- `npx playwright test tests/visual/pharosville.spec.ts --grep "interactions|reduced motion|dense visual fixture"`
- `npm run validate:docs`
- `npm run check:pharosville-assets`
- `npm run check:pharosville-colors`
- `npm run build`
- `npm run check:bundle-size`
- `git diff --check`

## Notes

- Raw JS bundle budgets were raised slightly for the new smoothness runtime machinery; gzip budgets remain unchanged and passing.
- Perf sampling now waits for deferred assets and steady telemetry before measuring sustained animation, so startup cache warmup does not pollute the steady-state lane.
