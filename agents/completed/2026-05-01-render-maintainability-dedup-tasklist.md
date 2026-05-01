# PharosVille Optimization Tasklist

Date: 2026-05-01
Scope: visual rendering performance, maintainability, deduplication
Method: parallel subagent review + local source verification

## Priority Legend
- P0: highest impact / near-term ROI
- P1: medium-term, structural benefits
- P2: cleanup and consistency

## Tasklist

1. P0 - Cache and cadence-throttle dynamic water overlays and shoreline details.
   - Files: `src/renderer/world-canvas.ts`, `src/renderer/layers/terrain.ts`, `src/renderer/layers/shoreline.ts`
   - Goal: render animated water overlays into offscreen buffers at reduced cadence (15-30 Hz), blit between updates.
   - Acceptance: lower `drawDurationMs` p95 in normal motion; no semantic color/zone regressions; visual baselines intentionally updated.

2. P0 - Add adaptive DPR control tied to frame budget with hysteresis.
   - Files: `src/pharosville-world.tsx`, `src/systems/canvas-budget.ts`
   - Goal: dynamically downshift/upshift DPR from rolling frame metrics instead of static DPR after resize.
   - Acceptance: stable frame times on large screens; no DPR oscillation; canvas backing remains within budget constants.

3. P0 - Reduce per-frame entity-pass allocations and sort overhead.
   - Files: `src/renderer/layers/entity-pass.ts`, `src/renderer/drawable-pass.ts`, `src/renderer/layers/scenery.ts`
   - Goal: reuse descriptor arrays, reduce string compare work in hot sort path, split static vs dynamic drawables.
   - Acceptance: fewer allocations in profile and lower CPU time in dense scenes; draw order remains unchanged.

4. P0 - Introduce ship rendering LOD and wake budgeting.
   - Files: `src/renderer/layers/ships.ts`, `src/renderer/layers/entity-pass.ts`
   - Goal: skip expensive wake/overlay details for distant low-priority ships while preserving selected/titan fidelity.
   - Acceptance: reduced draw cost in dense scenes; selected and high-priority ships visually intact.

5. P0 - Optimize motion sampling hot path and lookup structures.
   - Files: `src/pharosville-world.tsx`, `src/systems/motion-sampling.ts`, `src/systems/motion-planning.ts`
   - Goal: precompute route constants, remove repeated linear searches, minimize per-frame object churn.
   - Acceptance: lower motion sampling CPU cost; route timing/semantics unchanged under tests.

6. P1 - Introduce incremental/spatial hit-target updates.
   - Files: `src/pharosville-world.tsx`, `src/renderer/hit-testing.ts`
   - Goal: stop rebuilding and scanning all targets when only subsets change.
   - Acceptance: improved pointer interaction cost in dense states; target priority behavior unchanged.

7. P1 - Consolidate viewport and tile-bounds/culling helpers.
   - Files: new `src/renderer/viewport.ts`, adopt in `terrain.ts`, `shoreline.ts`, `world-canvas.ts`, `hit-testing.ts`
   - Goal: single source for visible tile bounds and viewport rect checks.
   - Acceptance: no culling drift between layers; duplicate projection math removed.

8. P1 - Extract world data orchestration from `PharosVilleDesktopData` into dedicated hook/module.
   - Files: `src/pharosville-desktop-data.tsx`, new `src/hooks/use-pharosville-world-data.ts`
   - Goal: separate query aggregation / route mode / caching from rendering component.
   - Acceptance: component becomes render-focused; behavior parity in loading/error/stale cases.

9. P1 - Create canonical endpoint registry and generate query hooks from it.
   - Files: `shared/lib/pharosville-api-client-contract.ts`, `shared/lib/pharosville-api-contract.ts`, `shared/lib/pharosville-api-endpoints.ts`, `src/hooks/*`
   - Goal: one endpoint descriptor source reused by client hooks, contracts, and proxy allowlist utilities.
   - Acceptance: duplicated endpoint metadata removed; all hooks derive from shared registry.

10. P1 - Replace manual payload tokenizers with shared structural fingerprinting.
    - Files: `src/pharosville-desktop-data.tsx`, new `src/lib/structural-hash.ts`
    - Goal: make world cache key generation declarative, typed, and testable.
    - Acceptance: world identity churn reduced; fingerprint coverage validated with fixtures.

11. P2 - Split `buildPharosVilleWorld` monolith into staged pipeline modules.
    - Files: `src/systems/pharosville-world.ts` + new stage modules
    - Goal: isolate ship placement, dock assignment, and detail index construction into explicit phases.
    - Acceptance: clearer module boundaries; unchanged world outputs under existing tests.

12. P2 - Deduplicate rendering primitives and water texture dispatch plumbing.
    - Files: `src/renderer/canvas-primitives.ts`, `src/renderer/layers/selection.ts`, `src/renderer/layers/shoreline.ts`, `src/renderer/layers/terrain.ts`
    - Goal: remove local duplicate helpers (`drawDiamond`, `withAlpha`, `hexToRgba`) and unify texture dispatch tables.
    - Acceptance: fewer duplicated utilities; no visual drift except intentional.

13. P2 - Deduplicate smoke matrices and renderer test scaffolding.
    - Files: `scripts/pharosville/smoke-*.mjs`, `scripts/smoke-live.mjs`, `functions/api/proxy.test.ts`, `src/renderer/**/*.test.ts`
    - Goal: shared allowlist/negative test matrix and shared renderer test helpers.
    - Acceptance: less script/test drift; equivalent coverage with less boilerplate.

## Recommended Execution Sequence
1) Tasks 1-3, 5
2) Tasks 4, 6, 7
3) Tasks 8-10
4) Tasks 11-13

## Validation Lane Per Batch
- `npm test -- src`
- `npm run check:pharosville-assets`
- `npm run check:pharosville-colors`
- `npm run build`
- `npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville|normal motion|reduced motion"`

