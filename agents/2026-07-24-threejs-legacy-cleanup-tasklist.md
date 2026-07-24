# PharosVille Three.js Legacy Cleanup Tasklist

Date: 2026-07-24

Status: Prepared for review; no cleanup in this tasklist has been executed.

## Objective

Remove every repository artifact whose only purpose was the retired Canvas/raster
renderer, while preserving the current Three.js Garden Observatory, its desktop
viewport gate, analytical behavior, navigation, DOM fallback, and release
workflow.

This is an execution checklist, not authorization to delete files blindly.
Items are ordered so live dependencies are detached before their assets,
contracts, tests, and tooling are removed.

## Audit Basis

The production path inspected for this plan is:

`index.html` -> `src/main.tsx` -> `src/App.tsx` -> `src/client.tsx` ->
desktop gate -> `src/pharosville-desktop-data.tsx` ->
`src/pharosville-world.tsx` -> `src/hooks/use-world-render-loop.ts` ->
dynamic import of `src/three/world-renderer.ts`.

Findings were based on production import reachability, repository-wide symbol
and URL searches, Git history around migration commit `20e59c4`, current build
and test configuration, public-file inventories, and direct inspection of
tracked media.

The repository was already dirty during the audit. In particular, active Three
hero-model work modifies `src/three/**`, tests, performance limits, and adds two
GLBs plus a generator. Do not start cleanup implementation until that work has
settled and the audit has been rerun against its final state.

### Measured removal opportunity

| Inventory | Files | Bytes | Disposition |
| --- | ---: | ---: | --- |
| `public/pharosville/assets/**` | 172 | 1,436,731 | Remove after replacing four Legend thumbnails |
| `public/chains/**` | 97 | 2,278,624 | Remove after deleting local dock-logo ownership |
| `public/logos/cemetery/**` | 86 | 897,227 | Remove after deleting grave-logo ownership |
| `public/sail-emblems/usdt-kraken.png` | 1 | 518 | Remove; no current consumer |
| **Deployable public files subtotal** | **356** | **4,613,100** | About 4.4 MiB removed from static deployment |
| `docs/pharosville/refs/seawall-precision-target.png` | 1 | 1,110,517 | Remove; unreferenced Canvas-era evidence |

`docs/pharosville/media/pharosville-desktop-shell.png` is another 1,153,169-byte
Canvas-era image, but it must be replaced with a current Three screenshot
rather than simply removed because the README embeds it.

### Baseline conditions to record before implementation

- The local shell used Node 26 while the repository expects Node 24.
- The `check:pharosville-assets` package script passed with one archived
  Tron-image warning.
- `npm run check:garden-models` passed for the lighthouse and the two currently
  dirty hero GLBs.
- `npm run check:runtime-facts` already failed because current Three/model facts
  have changed.
- The doc path/script check already failed on removed
  `test:visual:three`/`test:perf:three` commands in phase-3 evidence.
- These existing failures must be captured before cleanup so they are not
  misattributed to cleanup changes.

## Removal Rules

An item can be deleted when all of the following are true:

- It is unreachable from the production entry point, or every production
  reader has first been migrated.
- No current browser flow requests its public URL.
- No build, validation, deploy, generated-doc, or release script requires it.
- Tests that remain validate current product behavior rather than preserve a
  retired implementation contract.
- A current replacement exists for any user-visible behavior that must remain.

Do not treat the word `canvas`, an isometric/tile abstraction, or the absence of
a static import as proof of obsolescence. Three still uses an
`HTMLCanvasElement`, runtime `CanvasTexture`s, procedural/offline image tooling,
and dynamically imported modules.

## Phase 0: Freeze and Re-Baseline

- [ ] **P0.1 - Let concurrent Three work settle.** Resolve or land the current
  edits to `src/three/garden-models.ts`, `garden-ships.ts`,
  `garden-water.ts`, `garden-zones.ts`, `world-renderer.ts`, their tests,
  performance tests, hero GLBs, and `generate-garden-heroes.mjs`.
- [ ] **P0.2 - Use the supported toolchain.** Switch to Node 24, run a clean
  install, and record `node --version`, `npm --version`, and `git status
  --short`.
- [ ] **P0.3 - Capture a pre-cleanup baseline.** Save current desktop,
  Legend-open, selected-ship, cemetery, and dock screenshots under `outputs/`;
  record unit, visual, performance, viewport-gate, build, bundle, and static
  media results.
- [ ] **P0.4 - Measure the deployed baseline.** Record `dist/` file count and
  bytes by namespace, JS/CSS bundle sizes, Three texture/geometry/object
  telemetry, and browser requests made during a normal supported-viewport run.
- [ ] **P0.5 - Repeat production reachability.** Recompute the import graph
  from `src/main.tsx` and repeat symbol/URL searches after the dirty work is
  final. Any newly active consumer overrides a deletion candidate below.
- [ ] **P0.6 - Protect the unsupported-viewport contract.** Confirm narrow or
  portrait viewports mount no world runtime and request no `/api/*`,
  `/pharosville/models/*`, `/pharosville/textures/*`, or stablecoin logos.

Exit gate: baseline evidence is reproducible, existing failures are documented,
and no cleanup commit contains concurrent feature work.

## Phase 1: Detach the Live UI from the Raster Archive

The old raster inventory is not fully dormant: the Legend still requests four
ship PNGs.

- [ ] **P1.1 - Replace the four Legend thumbnails.** In
  `src/components/legend-panel.tsx`, remove references to:
  - `treasury-galleon.png`
  - `chartered-brigantine.png`
  - `dao-schooner.png`
  - `algo-junk.png`
- [ ] **P1.2 - Use a current representation.** Prefer current semantic hull
  names and code-owned UI marks, or remove the decorative thumbnail column.
  Do not introduce screenshots of Three objects or a second asset registry
  merely to preserve the old layout.
- [ ] **P1.3 - Remove thumbnail styling.** Delete
  `.pharosville-legend-panel__ship-thumb` and its `image-rendering: pixelated`
  rules once the markup no longer uses them.
- [ ] **P1.4 - Update Legend tests.** Test the retained semantic labels and
  analytical meaning rather than retired sprite URLs.
- [ ] **P1.5 - Add a browser network assertion.** Opening the Legend on a
  supported viewport must make no request under `/pharosville/assets/` and
  show no broken image.

Exit gate: no production code or browser flow references
`/pharosville/assets/`.

## Phase 2: Remove the Raster Archive and Its Pipeline

### Replace the useful validation first

`scripts/pharosville/validate-assets.mjs` contains both obsolete raster checks
and still-useful stablecoin-logo integrity checks.

- [ ] **P2.1 - Introduce a current runtime-media check.** Create or extend a
  focused validator that verifies:
  - every active `data/logos.json` path is same-origin and exists;
  - all files declared by the current Three model manifest exist and meet
    their budgets/hashes;
  - the current water-normal texture exists;
  - no runtime-media entry points at a retired namespace.
- [ ] **P2.2 - Keep model validation in deploy gates.** Ensure
  `check:garden-models`, or its replacement, runs in the PR/deploy path before
  removing `check:pharosville-assets`.
- [ ] **P2.3 - Cover current texture caching.** Add or verify an intentional
  cache policy for `/pharosville/textures/*`; retain the model policy.

### Delete the archive

- [ ] **P2.4 - Delete `public/pharosville/assets/**`.** This removes 86 PNGs,
  85 WebPs, and `manifest.json` with 73 old asset entries.
- [ ] **P2.5 - Delete the archive-only TypeScript contract.** Remove
  `src/systems/asset-manifest.ts`.
- [ ] **P2.6 - Delete archive-only scripts.** Remove:
  - `scripts/pharosville/asset-budgets.mjs`
  - `scripts/pharosville/validate-assets.mjs` after P2.1 is live
- [ ] **P2.7 - Replace package wiring.** Remove
  `check:pharosville-assets` from `package.json` and replace its place in
  `validate` with the current runtime-media check.
- [ ] **P2.8 - Replace deploy wiring.** Remove the old command from:
  - `scripts/pharosville/validate-deploy-gate.mjs`
  - `.github/workflows/deploy-cloudflare.yml`
- [ ] **P2.9 - Remove stale guard assertions.** Delete raster manifest-count
  and first-render asset-budget imports/assertions from
  `scripts/check-guards.test.mjs`; add focused assertions for the new runtime
  media contract.
- [ ] **P2.10 - Rewrite runtime facts generation.** In
  `scripts/pharosville/generate-runtime-facts.mjs`:
  - remove raster manifest and `asset-budgets` imports;
  - remove the Archived Raster Inventory and Asset Budgets sections;
  - stop regex-parsing ship sprite IDs and dock raster IDs;
  - enumerate every current Three model manifest entry, not only the first;
  - report current models, water texture, stablecoin-logo inventory, and
    renderer budgets.
- [ ] **P2.11 - Regenerate `docs/pharosville/RUNTIME_FACTS.md`.**
- [ ] **P2.12 - Remove archive cache blocks.** Delete the six
  `/pharosville/assets/{docks,landmarks,overlays,props,ships,terrain}/*`
  sections from `public/_headers`.
- [ ] **P2.13 - Remove old test request matching.** Delete the
  `/pharosville/assets/` branch in `tests/helpers/pharosville-debug.ts` after
  the positive no-request assertion exists.

Exit gate: `git ls-files public/pharosville/assets` is empty; the build contains
no copied raster archive; current logos/models/textures remain validated.

## Phase 3: Remove Unused Public Image Namespaces

### Chain logos

All 97 `public/chains/**` files are named by local metadata, but neither the
current DOM nor Three renderer displays them.

- [ ] **P3.1 - Remove local dock-logo propagation.** Stop copying
  `ChainSummary.logoPath` into `DockNode.logoSrc` in
  `src/systems/chain-docks.ts`.
- [ ] **P3.2 - Remove `DockNode.logoSrc`.** Update `src/systems/world-types.ts`,
  fixtures, builders, and assertions.
- [ ] **P3.3 - Narrow local chain metadata.** Remove local `logoPath` and
  image-only `darkInvert` ownership from `shared/lib/chains.ts` after proving
  no other standalone-app consumer needs them.
- [ ] **P3.4 - Preserve the upstream API contract.** Keep the
  `logoPath` response field in `shared/types/chains.ts` unless the upstream API
  itself changes; this app can ignore a response field without owning a file
  for it.
- [ ] **P3.5 - Delete `public/chains/**`.**

### Cemetery logos

Current Three cemetery markers use procedural geometry and analytical grave
metadata; they never read `GraveNode.logoSrc`.

- [ ] **P3.6 - Remove `GraveNode.logoSrc`.** Update
  `src/systems/world-types.ts`, construction in
  `src/systems/world-layout.ts`, fixtures, and tests.
- [ ] **P3.7 - Remove local filename generation.** Prune obsolete logo
  filename work from `shared/lib/cemetery-runtime.ts` and
  `shared/lib/cemetery-merged.ts`; retain upstream analytical cemetery data.
- [ ] **P3.8 - Remove local dead-stablecoin logo metadata** only after checking
  that no non-PharosVille owner in `shared/**` consumes it.
- [ ] **P3.9 - Delete `public/logos/cemetery/**`.** This includes the already
  orphaned `rusd.png` and `usr.png`.

### Standalone orphan

- [ ] **P3.10 - Delete `public/sail-emblems/usdt-kraken.png`.**

### Prove namespace retirement

- [ ] **P3.11 - Add supported-viewport network coverage.** Normal use,
  including opening the Legend, selecting docks and graves, and inspecting
  ships, must request nothing under `/chains/`, `/logos/cemetery/`, or
  `/sail-emblems/`.
- [ ] **P3.12 - Re-run the blocked-viewport request audit.** The desktop gate
  must remain stricter than the supported-viewport assertions.
- [ ] **P3.13 - Narrow browser request classification.** Remove retired chain,
  cemetery, and sail-emblem URL patterns from
  `tests/helpers/pharosville-debug.ts`; keep only namespaces that the current
  runtime can request.

Exit gate: the three retired namespaces are absent from source, `dist/`, and
browser requests; top-level stablecoin logos remain complete.

## Phase 4: Remove Raster Identity from Live Domain Models

### Ships

- [ ] **P4.1 - Remove sprite identity fields.** Delete:
  - `ShipVisual.spriteAssetId` in `src/systems/world-types.ts`
  - `TitanShipDefinition.spriteAssetId` and `TITAN_SHIP_ASSET_IDS` in
    `src/systems/ship-visuals.ts`
  - `UniqueShipDefinition.spriteAssetId` and `UNIQUE_SPRITE_IDS` in
    `src/systems/unique-ships.ts`
- [ ] **P4.2 - Preserve current Three semantics.** Keep semantic hull/class
  names, titan and heritage membership, `sizeTier`, scale, livery, overlay,
  rationale, brand colors, and logo-backed sail identity.
- [ ] **P4.3 - Update ship tests and fixtures.** Remove sprite-ID assertions
  from `ship-visuals.test.ts`, `unique-ships.test.ts`, motion/detail tests,
  accessibility fixtures, and generated-facts parsing.
- [ ] **P4.4 - Prune unused visual fields after a final reader audit.**
  `ShipVisual.shipClass`, `rigging`, and `sailStripeColor` currently have no
  production reader. Remove them and their assignment/tests if the settled
  Three work still does not consume them. Do not remove `classLabel`,
  `sailColor`, `hull`, livery, overlay, size, scale, or rationale.

### Docks

- [ ] **P4.5 - Remove dock sprite identity.** Delete `_DOCK_ASSET_IDS`,
  `PREFERRED_DOCK_ASSET_IDS`, and `DockNode.assetId` from
  `src/systems/chain-docks.ts`, `world-types.ts`, fixtures, tests, and runtime
  facts.
- [ ] **P4.6 - Remove the raster-derived detail row.** Delete the "Harbor
  style" row in `src/systems/detail-model.ts` unless it is replaced with a
  real current Three semantic value. Never retain a raster ID only to support
  display copy.
- [ ] **P4.7 - Remove old dock draw overrides.** Delete
  `DOCK_DRAW_TILE_OVERRIDES` and `dockDrawTileOverride()` from
  `src/systems/dock-layout.ts`; keep `dockOutwardVectorForTile()`.

### Seawall

- [ ] **P4.8 - Split navigation from rendering in `src/systems/seawall.ts`.**
  Remove `SeawallPlacement`, raster `assetId`, authored sprite segments,
  jitter/flip/rotation/scale/y-offset builders, and
  `SEAWALL_RENDER_PLACEMENTS`.
- [ ] **P4.9 - Preserve live barrier geometry.** Keep
  `SEAWALL_BARRIER_TILES`, XY/barrier predicates, perimeter/distance helpers,
  and every pathing or placement dependency.
- [ ] **P4.10 - Convert tests.** Remove raster-placement assertions from
  `seawall.test.ts` and `world-layout.test.ts`; retain or add navigation
  boundary and route-collision tests.
- [ ] **P4.11 - Remove stale module comments** that name deleted Canvas
  harbor-rendering modules.

Exit gate: no world entity carries a path or ID for a deleted raster asset, and
ship placement, dock selection, and seawall collision behavior are unchanged.

## Phase 5: Prune Dead World and Motion Schemas

### World payload

- [ ] **P5.1 - Remove unused world effects.** Delete `WorldEffect*` types and
  `PharosVilleWorld.effects`; the builder always emits an empty array and no
  production reader exists.
- [ ] **P5.2 - Remove the duplicate world legend.** Delete `LegendItem` and
  `PharosVilleWorld.legends`; the current `LegendPanel` owns its own content.
- [ ] **P5.3 - Update builders, fixtures, and tests.** Remove effect/legend
  boilerplate from `src/systems/pharosville-world.ts`,
  `src/__fixtures__/**`, accessibility tests, visit-snapshot tests,
  visual-cue-registry tests, and world-builder tests.
- [ ] **P5.4 - Keep `visualCues`.** The Accessibility Ledger reads them.
- [ ] **P5.5 - Reconcile the stale rigging cue.** The current Three ship rig is
  selected by hull silhouette, not consensus-source density. Either encode
  the intended analytical distinction in Three or remove the unsupported
  cue/Legend claim; do not leave accessibility copy describing a visual that
  is not rendered.

### Motion plan

- [ ] **P5.6 - Remove debug-only motion-plan fields.** After confirming Three
  still consumes only routes, delete `animatedShipIds`, `effectShipIds`,
  `moverShipIds`, `lighthouseFireFlickerPerSecond`, and `shipPhases` from
  `src/systems/motion-types.ts` and `motion-planning.ts`.
- [ ] **P5.7 - Remove their implementation baggage.** Delete the selected-ship
  effect-ID cache, ranking/set construction, `stableMotionPhase`, and
  `lighthouseFireFlickerSpeed` when they have no remaining current consumer.
- [ ] **P5.8 - Preserve `hasRecentMove`.** Relocate it if necessary because
  `notable-movers.ts` still needs the predicate.
- [ ] **P5.9 - Simplify plan construction.** Selection must no longer rebuild
  a motion plan merely to change dead debug/effect sets.

### Motion samples

The following sample outputs are propagated and smoothed but currently have no
Three reader: `lanternAlpha`, `mooringSwayAmplitude`, `mooringSubPhase`,
`fenderContact`, and `mooringTension`.

- [ ] **P5.10 - Trace value flow before deletion.** Separate values that affect
  actual position, yaw, transit profiles, or `mapVisibilityAlpha` internally
  from values merely copied into the final sample.
- [ ] **P5.11 - Make `mapVisibilityAlpha` explicit.** Remove fallback
  dependence on exported mooring/fender fields, then make the visibility
  value required at the renderer boundary.
- [ ] **P5.12 - Remove unused sample outputs and smoothing.** Prune their
  declarations, writes, copying, equality checks, visual-motion cache state,
  fixtures, and assertions while retaining internal motion calculations that
  still influence position or heading.
- [ ] **P5.13 - Preserve current route behavior.** Keep tile, heading, state,
  velocity, speed, wake intensity, route data, map visibility, reduced-motion
  behavior, and active mooring/transit math.

Exit gate: the runtime world/motion payload contains only values consumed by
Three, DOM accessibility/detail UI, routing, or current telemetry; route and
reduced-motion tests remain green.

## Phase 6: Replace Canvas-Era Scheduling and Telemetry

### Render scheduler

- [ ] **P6.1 - Keep scheduler tier behavior.** Preserve tier resolution,
  hysteresis, thresholds, target-frame logic, and
  `PharosVilleRenderSchedulerTier`; Three uses tiers for water, shadows,
  lanes, lights, composer effects, and recovery behavior.
- [ ] **P6.2 - Remove pass-name fiction.** Delete Canvas-era pass arrays such
  as `film-grain`, `cloud-shadow`, `birds`, `god-rays`,
  `bioluminescent-sparkles`, `decorative-lights`, `moon-reflection`,
  `sea-mist`, `water-accents`, `coastal-water-motion`, and `dock-caustics`.
- [ ] **P6.3 - Delete unused pass helpers.** Remove
  `shouldDrawScheduledPass`, `isScheduledPassDegraded`, `skippedPasses`, and
  `degradedPasses`; rewrite tests around observable current tier contracts.

### Render metrics

- [ ] **P6.4 - Remove synthetic Canvas pass counts.** Delete
  `WorldDrawablePass`, `drawableCounts`, and fabricated
  underlay/body/overlay/selection counts from
  `src/renderer/render-types.ts` and `src/three/world-renderer.ts`.
- [ ] **P6.5 - Replace guessed visibility metrics.** Remove or redefine
  `visibleTileCount` if it is still map area rather than a measured current
  value.
- [ ] **P6.6 - Name actual Three metrics accurately.** Rename a real
  `drawableCount` to `objectCount` where appropriate and retain measured draw
  calls, triangles, textures, geometries, programs, render-target state, and
  frame duration.
- [ ] **P6.7 - Remove fake motion cue estimates.** Audit
  `motionCueCounts`; retain only values counted from actual renderer state,
  not caps or estimates inherited from Canvas effects.

### Canvas budget module

- [ ] **P6.8 - Keep WebGL surface safeguards.** Preserve adaptive DPR,
  main-canvas backing-pixel limits, draw-duration windows, generic ring
  buffers, and the budget resolver used by Three.
- [ ] **P6.9 - Remove deleted offscreen-cache budgets.** Delete terrain,
  weather, minimap, and total Canvas cache limits plus
  `CanvasBackingPixelMetrics`, `canvasPixelArea`,
  `resolveCanvasBackingPixelMetrics`, and `canRetainOffscreenCanvas`.
- [ ] **P6.10 - Rename remaining concepts.** Use WebGL surface/render-budget
  terminology and remove comments describing retired 2D cache behavior.

Exit gate: debug/performance data describes actual Three work, scheduler tests
exercise current tier effects, and adaptive DPR/recovery behavior is intact.

## Phase 7: Remove Fake Asset Readiness and Old Test Harnesses

### Runtime debug contract

- [ ] **P7.1 - Remove hard-coded old-loader readiness.** Delete
  `assetsLoaded`, `criticalAssetAttemptsSettled`, `criticalAssetsLoaded`,
  `deferredAssetsLoaded`, and constant-empty `assetLoadErrors` from
  `src/hooks/use-world-render-loop.ts` and test types.
- [ ] **P7.2 - Base readiness on current state.** Use Three
  `rendererStatus`, coherent frame/target state, and logo generation only
  where a test genuinely needs loaded sail logos.
- [ ] **P7.3 - Rename the live logo pipeline.** Rename
  `useAssetLoadingPipeline`, `assetLoadTick`, `assetGeneration`, and
  `getRenderAssetGenerationKey` to logo-specific names. Do not delete the
  loader; Three uses decoded logos for sail `CanvasTexture`s.
- [ ] **P7.4 - Remove Canvas pass/cache fields** from
  `tests/helpers/pharosville-debug.ts`, including ship-body cache stats and
  sky/static-blit/water-accent/entity/nameplate/ambient/selection pass
  timings/counts.
- [ ] **P7.5 - Keep current debug coverage.** Retain measured Three draw,
  duration, object/visibility, motion, routing, composer, post-processing,
  lane, light, and shadow state.

### Tests and setup

- [ ] **P7.6 - Delete `tests/perf/sustained-motion.spec.ts`.** It is outside
  Playwright's configured `tests/visual` directory, has no package-script
  entry, and asserts retired Canvas pass/cache metrics.
- [ ] **P7.7 - Remove empty legacy test directories** such as `tests/perf/`
  and `tests/probes/` after their contents are gone.
- [ ] **P7.8 - Remove the `Path2D` test stub** from `src/test-setup.ts`; no
  current code or test consumes it. Rewrite the old raster-output comment.
- [ ] **P7.9 - Confirm no stale snapshots.** Keep the repository free of
  retired Canvas snapshots; do not create replacement snapshots merely to
  mirror the old suite.

Exit gate: browser waits and performance tests rely only on real Three
readiness/telemetry, and all configured suites are discoverable from package
scripts.

## Phase 8: Delete Unreachable Source and Test Islands

The following production modules are unreachable from `src/main.tsx`. They
have only self-tests or no callers.

- [ ] **P8.1 - Delete orphaned loader support.**
  - `src/lib/idle-scheduler.ts`
- [ ] **P8.2 - Delete old label/cue/boat mapping modules and paired tests.**
  - `src/systems/area-labels.ts`
  - `src/systems/area-labels.test.ts`
  - `src/systems/cue-priority.ts`
  - `src/systems/cue-priority.test.ts`
  - `src/systems/classification-to-boat.ts`
  - `src/systems/classification-to-boat.test.ts`
- [ ] **P8.3 - Delete superseded projection support and test.**
  - `src/systems/isometric.ts`
  - `src/systems/isometric.test.ts`
- [ ] **P8.4 - Delete unused general helpers and paired tests.**
  - `src/lib/fuzzy-match.ts`
  - `src/lib/fuzzy-match.test.ts`
  - `src/lib/structural-hash.ts`
  - `src/lib/structural-hash.test.ts`
- [ ] **P8.5 - Remove stale references.** Update `src/systems/README.md`,
  generated facts, tests, and comments that still name deleted modules.
- [ ] **P8.6 - Re-run reachability before deleting.** The current dirty Three
  work may create a new reader; production use cancels the relevant deletion.

Exit gate: no production-unreachable implementation remains solely because a
self-test imports it.

## Phase 9: Prune Dead Helpers, CSS, and Dependencies

### Mixed system modules

- [ ] **P9.1 - Prune test-only world-layout exports.** Remove
  `CIVIC_CORE_CENTER`, `CIVIC_CORE_RADIUS`, `isLandTileKind`,
  `isElevatedTileKind`, `isShoreTileKind`, and `isRoadTileKind` if the final
  source graph still has no production reader. Keep tile data, bounds, dock
  tiles, terrain, and `isWaterTileKind`.
- [ ] **P9.2 - Prune unused palette API.** Remove `hexToInt`,
  `paletteOrThrow`, `paletteRgba`, `waterTerrainStyle`, and Canvas-only theme
  fields after rechecking the final visual-revamp branch. Keep every palette
  token consumed by Three or DOM UI.
- [ ] **P9.3 - Prune unused sea-state API.** Remove test-only smoothing,
  `SEA_STATE_SMOOTHING_TAU_SECONDS`, and unconsumed roughness/wind/tempo/
  lighthouse/smoke multipliers. Keep sea-state derivation, summary,
  swell/tempo/PSI values, fleet trend, and the mooring-sway multiplier while
  motion still consumes it.

### CSS

- [ ] **P9.4 - Delete verified dead selector blocks.** Remove `.pv-parchment`,
  `.pv-corner-action`, `.pv-wax-seal`, `.pv-beacon-pulse`, their pseudo
  elements, keyframes, and reduced-motion override when a DOM/class coverage
  scan confirms no dynamic consumer.
- [ ] **P9.5 - Keep dynamically constructed dock selectors.**
  `.pharosville-detail-dock--left` and `--right` are assembled from
  `selectedDetailAnchor.side`; they are not dead.
- [ ] **P9.6 - Evaluate shell-wide pixelation.** Remove
  `image-rendering: pixelated` from `.pharosville-shell` only after desktop
  visual comparison proves current WebGL/DOM rendering is unaffected or
  improved.
- [ ] **P9.7 - Fix stale comments.** Remove references to
  `drawHorizonShips`, deleted Canvas layers, "Canvas hover tooltip", and old
  pixel-output assumptions. Update the old emblem/nameplate-drawer comment in
  `scripts/bundle-budgets.mjs`. Keep the current loading-state data-URI
  effect.

### Dependencies

- [ ] **P9.8 - Remove `@testing-library/jest-dom`.** It has no import and no
  matcher use.
- [ ] **P9.9 - Remove `tsx`.** It has no repository invocation or import;
  confirm final scripts/CI still do not use it.
- [ ] **P9.10 - Regenerate the lockfile** with Node 24 and run install,
  typecheck, unit, and build checks.
- [ ] **P9.11 - Keep required direct dependencies.** Retain `playwright`
  because offline image tools import it, and retain `@types/three` because the
  installed `three` package does not supply the required type entry.

Exit gate: CSS coverage, dependency checks, typecheck, and build are clean
without reintroducing renderer-specific shims.

## Phase 10: Update Documentation, Templates, and Tracked Media

### Canonical wording

- [ ] **P10.1 - Replace "React/canvas app" ownership wording** with the current
  React/Three/WebGL architecture in `AGENTS.md` and `CLAUDE.md`. Continue to
  describe the real HTML canvas only where technically relevant.
- [ ] **P10.2 - Remove manifest-backed raster requirements** from:
  - `README.md`
  - `CONTRIBUTING.md`
  - `docs/pharosville-page.md`
  - `docs/pharosville/AGENT_ONBOARDING.md`
  - `docs/pharosville/ARCHITECTURE.md`
  - `docs/pharosville/ASSET_PIPELINE.md`
  - `docs/pharosville/CHANGE_CHECKLIST.md`
  - `docs/pharosville/KNOWN_PITFALLS.md`
  - `docs/pharosville/README.md`
  - `docs/pharosville/VISUAL_INVARIANTS.md`
- [ ] **P10.3 - Document the positive current contract.** Canonical docs must
  say that runtime visual media consists of the current Three model manifest,
  water texture, and stablecoin logo inventory, with validation and cache
  rules that match those files.
- [ ] **P10.4 - Update collaboration templates.** Remove Canvas/manifest/
  snapshot assumptions from:
  - `.github/pull_request_template.md`
  - `.github/ISSUE_TEMPLATE/visual_regression.yml`
- [ ] **P10.5 - Reconcile current facts after concurrent work.** Update model,
  texture, triangle, and performance limits in `ASSET_PIPELINE.md`,
  `TESTING.md`, and generated runtime facts only after the hero-model and
  performance changes settle.

### Media

- [ ] **P10.6 - Replace the README screenshot.** Recapture
  `docs/pharosville/media/pharosville-desktop-shell.png` from the current
  Three scene at the documented 1200px presentation width.
- [ ] **P10.7 - Update `docs/pharosville/GITHUB_MEDIA.md`** so its source and
  generation command describe the current capture.
- [ ] **P10.8 - Delete the old seawall reference.** Remove
  `docs/pharosville/refs/seawall-precision-target.png`; it is unreferenced and
  depicts the retired raster scene.
- [ ] **P10.9 - Keep `public/og-card.png`.** It is renderer-neutral branding.

### Historical and planning documents

- [ ] **P10.10 - Preserve historical release truth.** Do not rewrite Canvas,
  sprite, or `Path2D` mentions in `CHANGELOG.md` or
  `src/content/pharosville-changelog.ts`.
- [ ] **P10.11 - Consolidate completed migration evidence.** Move any durable
  decisions into canonical docs, then delete completed artifacts if no longer
  operationally useful:
  - `agents/2026-07-23-threejs-pharosville-assessment.md`
  - `agents/2026-07-23-threejs-phase0-evidence.md`
  - `agents/2026-07-23-threejs-decision-packet.md`
  - `agents/2026-07-23-threejs-phase3-automated-evidence.md`
- [ ] **P10.12 - Retire the implementation plan only when complete.** Keep
  `agents/2026-07-23-threejs-implementation-plan.md` until its open
  stabilization/release tasks have closed.
- [ ] **P10.13 - Keep the active visual plan.** Do not remove
  `agents/2026-07-24-threejs-visual-revamp-plan.md`.
- [ ] **P10.14 - Review old authoring references.** Delete
  `docs/pharosville/scenery-brief.md`, `IMAGE_TOOLING_NOTES.md`, and
  `PIXELLAB_MCP.md` only after any still-current semantic/model-authoring
  guidance has been moved into `ASSET_PIPELINE.md`; otherwise rewrite them
  around the current Three workflow.
- [ ] **P10.15 - Keep and index current operational docs.** Preserve
  `HOOKS.md`, `SCENARIO_CATALOG.md`, and unrelated release hardening docs.
- [ ] **P10.16 - Do not restore the operator's existing deletion** of the
  June 27 ship-capacity/island-resize investigation plan.
- [ ] **P10.17 - Keep active plans honest.** Review the path checker's
  singular planning-directory exclusion, define the intended
  active-plan/archive policy, and do not exclude all planning artifacts merely
  to hide stale commands. Active plans must pass the documentation contract.

Exit gate: canonical docs and contribution templates describe one Three
renderer and its actual media/testing contract; no current screenshot depicts
the retired renderer.

## Phase 11: Final Proof and Regression Guards

### Static residue scan

- [ ] **P11.1 - Require these searches to return no executable/config hits:**

  ```bash
  git ls-files public/pharosville/assets public/chains public/logos/cemetery public/sail-emblems
  rg -n 'pharosville/assets|check:pharosville-assets|asset-budgets|spriteAssetId|SEAWALL_RENDER_PLACEMENTS|Path2DStub'
  rg -n 'test:visual:three|test:perf:three'
  ```

  Historical changelog text and an explicitly documented waiver are the only
  acceptable exceptions.

- [ ] **P11.2 - Search for retired Canvas concepts.** Audit `assetId`,
  `logoSrc`, Canvas pass names, cache names, effect/legend world fields, and
  old debug readiness fields. Every survivor must have a named current
  consumer.
- [ ] **P11.3 - Recompute production reachability.** Investigate every
  non-fixture production module not reachable from `src/main.tsx`; either
  remove it or record why dynamic/ambient ownership makes it valid.
- [ ] **P11.4 - Inspect the built artifact.** `dist/` must contain current
  models, water texture, and referenced top-level logos, and none of the
  deleted namespaces.
- [ ] **P11.5 - Compare reductions.** Report tracked-file count, public bytes,
  `dist/` bytes, bundle bytes, and request count against P0.4.

### Automated validation

- [ ] **P11.6 - Run focused checks while iterating.** Cover changed systems,
  Three models/logos, Legend, world building, motion, routing, scheduler,
  debug helpers, viewport policy, docs, and guard scripts.
- [ ] **P11.7 - Run the current media checks.** Verify model budgets/hashes,
  texture presence, exact stablecoin-logo references, colors, and security
  headers.
- [ ] **P11.8 - Run the build and bundle budget.**
- [ ] **P11.9 - Run supported and blocked viewport browser scenarios.**
  Include WebGL initialization failure and the DOM static-overview fallback.
- [ ] **P11.10 - Run visual and performance suites.** Confirm current Three
  screenshots, object/GPU metrics, scheduler tiers, motion, selection/search,
  reduced motion, and no missing-media requests.
- [ ] **P11.11 - Run `npm run validate:release`** under Node 24 before claiming
  broad confidence.
- [ ] **P11.12 - Use the normal release path.** After a green `main` deploy,
  run the live smoke command against `https://pharosville.pharos.watch/`.
  Do not manually tag, release, or bypass `.github/workflows/release.yml`.
- [ ] **P11.13 - Close this planning artifact.** Once execution evidence and
  durable decisions are captured in the cleanup PR and canonical docs, delete
  this completed tasklist so its intentionally retired paths do not become
  stale documentation references.

## Explicit Keep List

These are common false positives and must not be removed by this cleanup:

- All production-reachable `src/three/**`, including current dirty hero-model
  work.
- Current renderer contracts and hit testing under `src/renderer/**`;
  simplify only the legacy fields named above.
- `src/systems/projection.ts`, `camera.ts`, Garden slice/tile data, routing,
  risk placement, ship motion sampling, and seawall barrier geometry.
- `src/components/world-static-overview.tsx`, the current DOM failure fallback.
- The desktop/orientation gate and its no-fetch/no-runtime behavior.
- Stablecoin logo loading/decoding and top-level `public/logos/*`.
- `data/logos.json`, `data/brand-colors.json`, overrides, and current
  brand-color extraction tooling.
- `public/pharosville/models/**`, the current model generators/manifest, and
  `check:garden-models`.
- `public/pharosville/textures/water-normals.png` and
  `scripts/pharosville/generate-water-normals.mjs`.
- Legitimate `HTMLCanvasElement`, `CanvasTexture`, WebGL, texture-generation,
  and image-analysis usage.
- `public/favicon.svg`, `public/og-card.png`, font files, and the web manifest.
- `visualCues` while consumed by the Accessibility Ledger.
- `src/__fixtures__/**` and `src/types/lucide-react-icons.d.ts`.
- Historical changelog entries.
- `.pharosville-detail-dock--left` and `--right`, which are dynamically
  constructed.
- Direct `playwright` and `@types/three` dependencies.

## Local Scratch Hygiene

Ignored `output/` and `outputs/` contain a mixture of old PixelLab/Canvas
evidence and current Three evidence. They are not tracked or deployed and are
outside the code cleanup:

- [ ] Inventory them separately after the tracked cleanup.
- [ ] Remove obsolete local captures, probes, vendored files, and temporary
  tool installs only with operator confirmation that the evidence is no longer
  needed.
- [ ] Keep both ignore rules; never commit scratch output, `dist/`,
  `test-results/`, or local environment files.

## Definition of Done

- [ ] Only one graphical renderer remains: the production Three.js Garden
  Observatory.
- [ ] No production, test, build, CI, deploy, generated-doc, or canonical-doc
  contract depends on the retired raster manifest or Canvas renderer.
- [ ] No deleted public namespace is copied to `dist/` or requested in a
  browser.
- [ ] Current models, textures, logos, analytical cues, navigation, fallback,
  desktop gate, and release controls remain intact.
- [ ] Tests validate current behavior and measured Three telemetry rather than
  synthetic Canvas passes, caches, or readiness.
- [ ] Canonical docs, templates, runtime facts, and screenshots describe the
  current engine.
- [ ] Full Node 24 release validation is green, with before/after size and
  request evidence attached to the cleanup PR.
