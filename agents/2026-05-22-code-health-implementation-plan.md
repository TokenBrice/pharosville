# PharosVille Code Health Implementation Plan

Date: 2026-05-22

Scope: whole standalone `pharosville` repository. This is a read-only review
consolidation and implementation task list for simplification, deduplication,
maintainability, LOC reduction, and code-health work.

## Review Inputs

- Six parallel xhigh explorer passes:
  - Nash: React app shell, hooks, data aggregation, client API, components.
  - Curie: `src/systems/**` world/model/motion logic.
  - Hegel: `src/renderer/**`, canvas runtime integration, asset loading.
  - Erdos: `shared/**`, `functions/**`, API contracts, server/client boundary.
  - Chandrasekhar: scripts, configs, tests, docs/process tooling.
  - Meitner: cross-codebase duplication, dead code, large files, artifacts.
- Local verification pass:
  - `git status --short` was clean before review.
  - `npm exec tsc -- --noEmit --noUnusedLocals --noUnusedParameters --pretty false` passed.
  - Spot-checked high-risk claims in current files.
  - Erdos reported `npm test -- functions/api/proxy.test.ts src/lib/api.test.ts` passed, 54 tests, and `npm run check:committed-secrets` passed.

## P0 - Correctness And Validation Confidence

1. [ ] Harden client API path validation against normalized path escapes.
   - Evidence: `src/lib/api.ts:58` checks only the raw string prefix; `/api/../health` and encoded dot segments can normalize outside `/api/`.
   - Tasks: normalize with `new URL(path, "https://pharosville.local")`; reject unless normalized `pathname` remains `/api/*`; add tests for `..`, encoded `..`, scheme, protocol-relative, and non-api cases.
   - Validation: `npm test -- src/lib/api.test.ts functions/api/proxy.test.ts`.

2. [ ] Fix non-main pre-push validation so clean committed changes are checked.
   - Evidence: `.githooks/pre-push:24` runs `npm run validate:changed`, but `scripts/pharosville/validate-changed.mjs:41` only reads `git status --porcelain`; a clean branch with pushed commits returns "Nothing to validate".
   - Tasks: add commit-range mode fed by hook stdin `local_sha` and `remote_sha`; keep worktree mode for manual use; handle new branches, deletes, renames, docs-only commits, and mixed commits.
   - Validation: `npm run test:guard-scripts`; add targeted tests for range parsing and lane selection.

3. [ ] Fix the stale split visual static grep.
   - Evidence: `package.json:21` greps `resizing below`, while `tests/visual/pharosville.spec.ts:832` says `resized below`, so the split lane misses that test.
   - Tasks: replace fragile title substrings with tags, `test.describe` groups, or a checked test-list helper; assert each split lane includes expected titles.
   - Validation: `npx playwright test tests/visual/pharosville.spec.ts --config=playwright.dist.config.ts --list` for each split lane.

4. [ ] Fix hard-coded squad evidence copy.
   - Evidence: `src/systems/pharosville-world/stages/ship-placement.ts:110` says "Maker squad member" for generic consort evidence, but Sky and Ethena consorts now exist.
   - Tasks: pass the active squad label into `consortRisk()` and emit `${squad.label} squad member...`.
   - Validation: add assertions for Sky, Maker, and Ethena consort reasons in `src/systems/pharosville-world.test.ts` or `src/systems/detail-model.test.ts`.

5. [ ] Align variant validation with active-asset semantics.
   - Evidence: `shared/lib/stablecoins/validate-variants.ts:10` excludes only `pre-launch`; `shared/lib/stablecoins/registry.ts:85` excludes both `pre-launch` and `frozen` from active assets.
   - Tasks: exclude frozen IDs from variant parents; reject `variantOf` / `variantKind` on frozen assets; add focused tests.
   - Validation: focused variant tests plus `npm run typecheck`.

6. [ ] Fix previous-risk motion state lifecycle.
   - Evidence: `src/systems/motion-planning.ts:34` disposes only `pathCacheByMap`, while `previousRiskByShipId` at `src/systems/motion-planning.ts:60` is process-global; the comment at lines 49-50 says it clears with path-cache disposal.
   - Tasks: key previous-risk state by world/map identity, clear it in disposal, or make it explicit renderer-owned runtime state; remove unused `cyclesRemaining`.
   - Validation: extend disposal/tack-out tests; run `npm test -- src/systems/motion.test.ts src/systems/motion-planning.test.ts`.

## P1 - Source Of Truth Consolidation

7. [ ] Consolidate PharosVille endpoint metadata and query aggregation.
   - Evidence: endpoint registry lives in `shared/lib/pharosville-endpoint-registry.ts:16`, smoke allowlist in `shared/lib/pharosville-smoke-matrix.ts:11`, visual endpoint list in `tests/visual/pharosville.spec.ts:95`, and query roots in `src/hooks/use-pharosville-world-data.ts:83`.
   - Tasks: derive smoke endpoints, visual mock endpoints, query roots, and refetch predicates from the endpoint registry; introduce a typed `WORLD_ENDPOINT_KEYS` descriptor; keep hook ordering explicit or migrate carefully to `useQueries`.
   - Validation: `npm test -- src/hooks src/lib functions`, `npm run smoke:api-local`, `npm run smoke:dev-proxy`, and focused desktop-gate visual tests.

8. [ ] Derive API payload schema/contract tables from one map.
   - Evidence: endpoint keys and payload schema are split in `shared/types/pharosville.ts:13` and `:24`, while `shared/lib/pharosville-api-contract.ts` and endpoint registry repeat parallel metadata.
   - Tasks: export one payload schema map; derive `PharosVilleApiPayloadsSchema`, `PHAROSVILLE_API_CONTRACT`, endpoint-path maps, and smoke matrices from it.
   - Validation: `npm test -- functions/api/proxy.test.ts src/lib/api.test.ts`; `npm run validate:docs`.

9. [ ] Consolidate live-reserve adapter metadata.
   - Evidence: adapter keys and metadata repeat across `shared/types/live-reserves.ts:14`, `shared/lib/live-reserve-adapters-schemas.ts:42`, `shared/lib/live-reserve-adapters-definitions.ts:19`, and `shared/lib/live-reserve-adapters-config.ts:9`.
   - Tasks: introduce one adapter registry/build helper with input kinds, params schema, and definition metadata; derive keys and config variants; use `z.discriminatedUnion("adapter", ...)`; make top-level live-reserve config strict.
   - Validation: `npm run typecheck`; import/parse `shared/lib/stablecoins`; add schema tests for invalid adapter, input, params, and extra top-level fields.

10. [ ] Add duplicate-key guards for pricing registries.
    - Evidence: `shared/lib/pricing-source-registry.ts:14` concatenates registry arrays and `:23` converts to a `Map`, so duplicates silently last-write-win.
    - Tasks: build maps through a duplicate-checking helper; add invariant tests for pricing source keys and health bucket keys.
    - Validation: focused pricing registry tests plus `npm run typecheck`.

11. [ ] Share local API env discovery.
    - Evidence: Vite parses/discovers env paths in `vite.config.ts`; `scripts/pharosville/setup-local-api-key.mjs` exports similar discovery; `scripts/pharosville/onboard-agent.mjs` duplicates it again.
    - Tasks: move parser/path discovery to one importable helper and make Vite, setup, onboarding, smoke-local, and smoke-dev-proxy consume it.
    - Validation: `npm run test:guard-scripts`, `npm run onboard:agent`, `npm run smoke:api-local`, `npm run smoke:dev-proxy`.

12. [ ] Replace regex-parsed executable budgets with data modules.
    - Evidence: `scripts/pharosville/generate-runtime-facts.mjs:123` parses asset budgets out of `validate-assets.mjs`; `:149` parses bundle budgets out of `check-bundle-size.mjs`.
    - Tasks: export budget objects from dedicated modules; import them from validators and runtime-facts generation.
    - Validation: `npm run check:runtime-facts`, `npm run check:pharosville-assets`, `npm run build && npm run check:bundle-size`.

13. [ ] Share Pages Function security/cache helpers.
    - Evidence: `functions/api/[[path]].ts:8` and `functions/_log.ts:6` duplicate `EdgeCache`, security-header, and cache-helper concepts.
    - Tasks: extract `functions/_shared.ts` with base headers and cache helpers; keep endpoint-specific CSP/cache policy explicit.
    - Validation: function tests and `npm run check:security-headers`.

## P2 - Runtime And Renderer Modularization

14. [ ] Split render-loop telemetry/debug from React lifecycle.
    - Evidence: `src/hooks/use-world-render-loop.ts:104` has a wide input contract; the RAF effect spans `:321-752`; debug state is built both at `:761-804` and `:1212-1264`.
    - Tasks: extract frame pacing, longtask windows, ship sample collection, hit-target snapshot maintenance, canvas visibility, and debug publication into pure helpers; use one debug publishing path.
    - Validation: `npm test -- src/hooks/use-world-render-loop.test.tsx src/systems/canvas-budget.test.ts`, `npm run test:perf`, normal-motion and reduced-motion visual lanes.

15. [ ] Split camera, pointer, resize, and follow-selected responsibilities.
    - Evidence: `src/hooks/use-canvas-resize-and-camera.ts:44` exposes a broad input/result contract; pointer paths are `:289-440`; camera stepping is `:483-582`.
    - Tasks: extract pure `camera-intent` and `pointer-gesture` helpers; centralize camera equality helpers with `src/systems/camera.ts`; keep the hook focused on React wiring.
    - Validation: `npm test -- src/hooks/use-canvas-resize-and-camera.test.ts`; visual interaction tests.

16. [ ] Shrink `PharosVilleWorld` into composition plus markup.
    - Evidence: `src/pharosville-world.tsx` owns selection, hover, keyboard, announcements, motion plan wiring, fullscreen, reveal animation, changelog, time controls, outside-click behavior, and JSX.
    - Tasks: extract `useWorldSelection`, `useWorldKeyboardTargets`, `useWorldTimeControls`, and `useChangelogDialog`; longer term, wrap asset pipeline + camera + render loop in `usePharosVilleCanvasRuntime`.
    - Validation: `npm test -- src/pharosville-world.test.tsx`; visual interaction and accessibility lanes.

17. [ ] Extract terrain visible-tile traversal, then split terrain renderers.
    - Evidence: `src/renderer/layers/terrain.ts` is 2056 LOC; `drawTerrainBase`, `drawWaterTerrainStaticDetails`, and `drawWaterTerrainAccents` repeat bounds, row stepping, projection, and viewport checks around `:181`, `:226`, and `:286`.
    - Tasks: add an allocation-conscious visible-tile scanner/helper; reuse viewport point-in-viewport logic; then split water texture/glyph renderers into smaller files.
    - Validation: `npm test -- src/renderer/layers/terrain.test.ts`, `npm run check:pharosville-colors`, `npm run test:perf`, focused water/ledger/lighthouse visual snapshots.

18. [ ] Extract lighthouse beam model.
    - Evidence: `src/renderer/layers/terrain.ts:12` documents replicated beam math; terrain recomputes it around `:666`; lighthouse owns the same sweep constants/formula around `src/renderer/layers/lighthouse.ts:192`.
    - Tasks: create a beam model helper for sweep angle and vectors; use it in terrain caustics and lighthouse layers; verify fire-point alignment.
    - Validation: lighthouse night tests, terrain tests, reduced-motion visual, dawn/night visual lanes.

19. [ ] Normalize hit-target ordering and record construction.
    - Evidence: `src/renderer/hit-testing.ts:116` relies on manual count offsets; `staticHitTargetPrefixForWorld` includes pigeonnier but comments omit it; `shipSortIndex` repeats count math around `:697`.
    - Tasks: add `orderedHitTargetEntities(world)` returning entity, group, and sort index; add one `buildHitTargetRecord(...)` used by full snapshot, camera-only recompute, ship update, and change detection.
    - Validation: `npm test -- src/renderer/hit-testing.test.ts`; canvas selection visual tests.

20. [ ] Share idle scheduling.
    - Evidence: `src/hooks/use-asset-loading-pipeline.ts` and `src/renderer/asset-manager.ts` both define idle scheduler globals and `waitForIdleChunk`-style logic.
    - Tasks: move idle scheduling to a small shared utility with timeout support; keep water-path warmup and deferred asset loading as separate callers.
    - Validation: `npm test -- src/hooks/use-asset-loading-pipeline.test.tsx src/renderer/asset-manager.test.ts`.

21. [ ] Share small LRU/cache helpers and surface titan path stats if useful.
    - Evidence: sail logo/emblem/tint caches, lighthouse caches, and titan path caches repeat Map LRU touch/evict/stats patterns; `src/renderer/layers/ships/wake.ts:96` still has a TODO for titan cache telemetry.
    - Tasks: add `createLruCache` / `createStatsLruCache` for simple bounded caches; do not fold in pixel-budgeted `ship-body-cache`; either publish titan stats in debug telemetry or delete the stale TODO.
    - Validation: ships tests, lighthouse-night tests, cache-specific tests, perf.

22. [ ] Centralize time-of-day and test-clock logic.
    - Evidence: `src/pharosville-world.tsx` writes `globalThis.__pharosVilleTestWallClockHour`; `src/hooks/use-world-render-loop.ts:392` resolves it independently; `src/components/world-toolbar.tsx` formats/normalizes time separately.
    - Tasks: add a clock module for hour normalization and override resolution; prefer passing resolved `wallClockHour` into render-loop input.
    - Validation: `src/pharosville-world.test.tsx`, `src/hooks/use-world-render-loop.test.tsx`, dawn/night visual lanes.

## P3 - Systems Cleanup And API Surface Reduction

23. [ ] Narrow the ship water route cache interface.
    - Evidence: `src/systems/motion-types.ts:44` aliases `ShipWaterRouteCache` to full `Map`; `src/systems/motion-planning.ts:76` implements full `Map`, but `src/systems/motion-water.ts` production use needs only `get` and `set`.
    - Tasks: define a narrow cache interface with `get`, `set`, and optional test stats; remove iterator/forEach/keys/values/entries boilerplate.
    - Validation: motion cache tests around `src/systems/motion.test.ts` and `npm test -- src/systems/motion-water.test.ts`.

24. [ ] Split `motion-sampling.ts` behind stable public exports.
    - Evidence: `src/systems/motion-sampling.ts` contains consort shadowing, reduced motion, route-cycle sampling, transit profiles, mooring, ledger roaming, risk drift, and sea-room logic in one 1900+ LOC module.
    - Tasks: split by state/concern while preserving exports from `src/systems/motion.ts`; extract repeated stale-evidence orbit factors used in multiple sections.
    - Validation: `npm test -- src/systems/motion.test.ts src/systems/motion-sampling.test.ts src/systems/motion-water.test.ts`.

25. [ ] Merge titan ship asset and scale registries.
    - Evidence: `src/systems/ship-visuals.ts:34` stores titan asset IDs, `:52` stores scales, and `:144` silently falls back if a scale is missing.
    - Tasks: replace parallel maps with one `TITAN_SHIPS` registry containing `{ spriteAssetId, scale }`; derive exported ID and scale views if needed.
    - Validation: add a registry completeness test; run `npm test -- src/systems/ship-visuals.test.ts`.

26. [ ] Remove stale squad aliases and duplicate speed constants.
    - Evidence: `src/systems/maker-squad.ts:206` defines `MAKER_SQUAD_FLAGSHIP_ID = SKY_SQUAD.flagshipId`, and `:207` makes `MAKER_SQUAD_MEMBER_IDS` mean all squad members. `SPEED_QUARTILE_SCALARS` exists in both `src/systems/motion-types.ts:14` and `src/systems/ship-cycle-tempo.ts:111`, with stale "Lively" prose.
    - Tasks: update tests/imports to use `SKY_SQUAD`, `STABLECOIN_SQUAD_MEMBER_IDS`, `squadForMember`, and the `motion` re-export; remove compatibility aliases and duplicate constants.
    - Validation: `npm test -- src/systems/maker-squad.test.ts src/systems/ship-cycle-tempo.ts src/systems/motion.test.ts`.

27. [ ] Reduce test-only risk-water exports.
    - Evidence: `AREA_LABEL_TILES`, `DEWS_AREA_LABELS`, and `DEWS_AREA_WATER_STYLE` in `src/systems/risk-water-areas.ts` are test-only; `nearestAvailableRiskPlacementWaterTile()` in `src/systems/risk-water-placement.ts` is also test-only.
    - Tasks: either delete exports and assert through `RISK_WATER_AREAS` / `riskWaterAreaForPlacement()`, or make production code use them.
    - Validation: `npm test -- src/systems/risk-water-areas.test.ts src/systems/risk-water-placement.test.ts`.

28. [ ] Consolidate stable hash helpers.
    - Evidence: `src/systems/stable-random.ts` exports `stableHash()`, while `src/systems/stablecoin-ship-branding.ts:144` defines another local `stableHash()`.
    - Tasks: move the FNV variant into `stable-random.ts` under a distinct name, or import the shared hash if visual fallback drift is acceptable; add a pinned fallback-livery test first.
    - Validation: fallback branding tests and `npm test -- src/systems/stablecoin-ship-branding.test.ts`.

29. [ ] Resolve unused cue-priority arbiter API.
    - Evidence: `src/systems/cue-priority.ts` documents future arbiter wiring; production only calls `cuePriority()` from `src/renderer/layers/ships/draw-ship.ts:401`; `arbitrateCueSlot()` and `awardCueSlots()` are test-only.
    - Tasks: either wire `awardCueSlots()` into ship LOD candidate selection or delete unused exports/tests/comments.
    - Validation: `npm test -- src/systems/cue-priority.test.ts src/renderer/layers/ships.test.ts`.

30. [ ] Remove or privatize unused `apiFetch()`.
    - Evidence: `src/lib/api.ts:216` exports `apiFetch()`, but static search found only `src/lib/api.test.ts` callers; app code uses `apiFetchWithMeta()` through `src/hooks/use-api-query.ts`.
    - Tasks: make `apiFetchWithMeta()` the only public helper, or keep `apiFetch()` private/test-only.
    - Validation: `npm test -- src/lib/api.test.ts src/hooks/use-api-query.test.ts`.

31. [ ] Centralize detail/accessibility formatting.
    - Evidence: `src/components/detail-panel.tsx:28` uses regex label grouping; `src/components/accessibility-ledger.tsx` has separate compact USD formatting and embedded row narration; `src/lib/format-detail.ts` handles string-only compacting.
    - Tasks: centralize USD and fact formatting for string/number inputs; consider structured fact keys or a shared fact-slot table; extract ledger row builders and shared swatch rendering.
    - Validation: `npm test -- src/components/detail-panel.test.tsx src/components/accessibility-ledger.test.tsx`; accessibility visual smoke.

32. [ ] Centralize tile-key helpers used by world/model placement code.
    - Evidence: small local `tileKey()` helpers exist in multiple systems/tests, including `src/systems/pharosville-world/stages/ship-placement.ts:342`, `src/systems/dock-layout.ts:18`, and `src/renderer/layers/shoreline.ts:257`.
    - Tasks: add a tiny typed tile-key helper in a low-level system utility and migrate production callers first; leave tests alone unless they benefit.
    - Validation: focused world-layout, shoreline, and ship-placement tests.

## P4 - Test, Config, And Artifact Cleanup

33. [ ] Extract shared Playwright config helpers and include all configs in typecheck.
    - Evidence: `tsconfig.json:30` includes only `playwright.config.ts`; root `playwright.dist.config.ts` and `playwright.perf.config.ts` duplicate project/browser/server logic and are outside typecheck.
    - Tasks: include `playwright*.config.ts`; extract shared browser/project/reuse-server helpers into a config module.
    - Validation: `npm run typecheck`; `npx playwright test --list` for visual, dist, and perf configs.

34. [ ] Prune stale visual snapshots only after proving they are unused.
    - Evidence: current project names include `desktop-${browser}`; `tests/visual/pharosville.spec.ts-snapshots` still contains 11 unnamed `*-linux.png` snapshots alongside project-suffixed snapshots, with all PNG baselines totaling about 20 MB.
    - Tasks: confirm current visual tests reference only project-suffixed snapshots; delete stale unnamed baselines in a dedicated visual-baseline cleanup PR.
    - Validation: `npm run test:visual`, `npm run test:visual:dist:static`, inspect snapshot diffs before deletion.

35. [ ] Share visual/perf debug contracts and route mocks.
    - Evidence: debug types live separately in `tests/visual/pharosville.spec.ts:46` and `tests/perf/sustained-motion.spec.ts:41`; dense route mocks are duplicated.
    - Tasks: add `tests/helpers/pharosville-debug.ts` with shared types, route mocks, wait/read helpers, and endpoint payload setup.
    - Validation: `npm run test:perf` and focused visual greps.

36. [ ] Migrate renderer tests to the shared canvas recorder.
    - Evidence: `src/renderer/__test-utils__/canvas-context-builder.ts` exists, while tests such as `src/renderer/layers/ships.test.ts` and `maker-squad-chrome.test.ts` hand-roll recorders.
    - Tasks: extend the shared recorder only where needed; migrate bespoke recorders incrementally.
    - Validation: affected renderer tests.

37. [ ] Make runtime-manifest CLI output clearly generated/scratch.
    - Evidence: `scripts/pharosville/build-runtime-manifest.mjs` writes a scratch manifest to `outputs/pharosville/manifest.runtime.json`, while Vite emits the shipped runtime manifest at `dist/pharosville/assets/manifest.runtime.json`.
    - Tasks: keep the CLI output under `outputs/` so no public generated file is required.
    - Validation: `npm run build`; confirm `dist/pharosville/assets/manifest.runtime.json` is still emitted and no public generated file is required.

38. [ ] Keep generated stablecoin data treated as copied artifacts.
    - Evidence: `shared/data/stablecoins/AGENTS.md` says not to hand-edit `coins.generated.json`; generated and per-coin JSON totals over 42k LOC.
    - Tasks: avoid local PharosVille-only refactors that rewrite stablecoin catalog artifacts; if data workflow cleanup is needed, coordinate with the canonical upstream source and copy results intentionally.
    - Validation: `npm run typecheck`, `npm test`; data-specific checks only when the copied artifact changes.

## Suggested Sequencing

1. Do P0 first. These are correctness or validation-confidence gaps.
2. Do P1 next, especially endpoint/API source-of-truth work, before broad test/helper refactors.
3. Do P2 in separate small branches. Render-loop, terrain, hit-target, and camera changes each deserve focused review and browser validation.
4. Do P3 in small code-health PRs after P0/P1 reduces the risk of hidden validation gaps.
5. Do P4 opportunistically, keeping visual snapshot deletion isolated from functional code changes.

## Baseline Validation For Plan-Only Change

This file is docs/process-only. Minimum validation for this artifact:

```bash
npm run validate:docs
```

For follow-up implementation branches, use the validation listed on each task and broaden to `npm run validate:changed` or `npm run validate:release` when touching shared runtime behavior, renderer output, API contracts, or visual baselines.

## Healthy Areas To Preserve

- App-level same-origin/API-key posture is sound: browser code uses `/api/*`, and `PHAROS_API_KEY` stays server-side in the Pages Function.
- The desktop viewport gate is centralized and guarded by tests/scripts.
- `src/App.tsx` is appropriately small.
- Renderer geometry/frame-cache/render-scheduler boundaries are useful separation points.
- Risk-water area metadata is well centralized and strongly tested.
- Asset validation and manifest staging have strong coverage; keep visual-only assets out of critical loading unless first-render need is proven.
