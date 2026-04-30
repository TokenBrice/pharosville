# World Canvas Decomposition Plan

## Purpose

`src/renderer/world-canvas.ts` is too large to remain easy to maintain. Decompose it progressively while preserving behavior, draw order, hit-test alignment, asset semantics, reduced-motion behavior, and visual output.

This is a behavior-preserving refactor plan, not a redesign plan. `drawPharosVille()` stays the stable public renderer entry point.

## Non-Negotiables

- Keep `world-canvas.ts` as the facade and render sequencer.
- Preserve render order unless a visual change is intentional and reviewed.
- Move one coherent subsystem at a time; avoid broad rewrites.
- Extend existing renderer boundaries instead of duplicating them.
- Keep renderer modules route-local: no data fetching, no world mutation, no API contract changes.
- Keep analytical meaning out of canvas-only visuals; new semantic visual signals need DOM/detail/accessibility parity.
- Keep shared geometry in `src/renderer/geometry.ts`; do not duplicate anchor, hitbox, dock offset, printed-label, or follow-selected math.
- Keep layer imports pointed at `render-types.ts`, `geometry.ts`, `drawable-pass.ts`, `frame-cache.ts`, and system modules as needed. Do not import from `world-canvas.ts` inside layer modules.
- Treat screenshot drift as a regression until inspected.
- Do not revert or overwrite unrelated dirty work.

## Existing Boundaries

Before this decomposition, `world-canvas.ts` owned the renderer entry point plus many private subsystems: sky, terrain, water texture overlays, lighthouse, cemetery, docks, ships, graves, scenery props, water labels, color constants, and low-level canvas helpers.

The repo already has useful renderer boundaries:

- `render-types.ts`
- `frame-cache.ts`
- `drawable-pass.ts`
- `geometry.ts`
- `layers/entity-pass.ts`
- `layers/selection.ts`
- `layers/shoreline.ts`
- `ship-sail-tint.ts`

Do not add a `render-frame.ts` that overlaps `frame-cache.ts` unless there is a clear responsibility that `frame-cache.ts` cannot own.

## Target Shape

```txt
src/renderer/
  world-canvas.ts              # facade: frame setup, sequencing, metrics
  render-types.ts              # existing input/metric types
  frame-cache.ts               # existing per-frame geometry/cache helpers
  drawable-pass.ts             # existing drawable ordering helpers
  geometry.ts                  # existing render/hit-test geometry
  canvas-primitives.ts         # new low-level drawing/color/text helpers
  ship-sail-tint.ts            # existing sail tint utility
  layers/
    entity-pass.ts             # existing entity pass coordinator
    selection.ts               # existing selection overlays
    shoreline.ts               # existing coastal water details
    sky.ts                     # new
    terrain.ts                 # new, excluding shoreline behavior
    harbor-district.ts         # new
    lighthouse.ts              # new environment + entity helpers
    cemetery.ts                # new
    docks.ts                   # new
    ships.ts                   # new
    graves.ts                  # new
    scenery.ts                 # new
    water-labels.ts            # new post-entity overlay
    ambient.ts                 # new birds, lights, mist, atmosphere
```

Optional only if `layers/ships.ts` remains hard to scan, create a future ship-rendering subdirectory with files such as:

```txt
draw-ship.ts
sail-logo.ts
livery.ts
wake.ts
```

The target is not a specific line count. The target is a `world-canvas.ts` that clearly shows render order while each visual subsystem is independently navigable.

## Execution Protocol

Use this protocol for every phase:

- [ ] Run `git status --short` and identify dirty files before editing.
- [ ] Move only the subsystem named by the phase.
- [ ] Keep names and signatures stable where practical.
- [ ] Preserve the call order in `world-canvas.ts`.
- [ ] Keep subsystem-specific helpers private.
- [ ] Export helpers only when they are already shared or scheduled for the next extracted module.
- [ ] Run the phase validation listed below.
- [ ] Inspect visual diffs before updating baselines.
- [ ] Record skipped validation and why.

## Phase 0: Baseline

Goal: establish what already passes before moving code.

Checklist:

- [ ] Record current `git status --short`.
- [ ] Identify modified and untracked files that must not be overwritten.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run focused visual coverage before the first canvas extraction:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"
```

- [ ] If visual coverage is skipped, record the blocker and do not update baselines later without first establishing whether drift was pre-existing.

Acceptance:

- Existing failures, if any, are documented.
- Later failures can be distinguished from pre-existing failures.
- No behavior has changed.

## Phase 1: Define Boundaries In Place

Goal: prepare `world-canvas.ts` for extraction without changing behavior.

Checklist:

- [ ] Confirm the shape of `WorldCanvasFrame`, `DockRenderState`, `ShipRenderState`, and `GraveRenderState`.
- [ ] Group constants and helpers by subsystem.
- [ ] Identify helpers that should move to `canvas-primitives.ts`.
- [ ] Add brief section comments only where they make extraction safer.
- [ ] Avoid import/export churn unless necessary.

Acceptance:

- Diff is organizational.
- Typecheck passes or only has documented pre-existing failures.

## Phase 2: Extract Canvas Primitives

Goal: move dependency-light drawing helpers into `src/renderer/canvas-primitives.ts`.

Candidates:

- `roundedRectPath`, `drawDiamond`, `drawFittedText`
- `hexToRgba`, `withAlpha`, `readableInkForFill`
- simple path helpers
- `drawAsset`, only if it stays dependency-light

Checklist:

- [ ] Keep primitive helpers independent of world state.
- [ ] Avoid circular imports.
- [ ] Keep subsystem-specific helpers private in their eventual layer modules.

Acceptance:

- Shared helpers have a single home.
- No visual behavior changes.

## Phase 3: Extract Sky Layer

Goal: move the mostly self-contained sky subsystem to `src/renderer/layers/sky.ts`.

Move:

- `SKY_MOODS`, `SKY_STARS`, `SKY_CONSTELLATIONS`, `SKY_CLOUDS`
- `drawSky`, `skyState`, `skyPathPoint`
- `drawCelestialArc`, `drawSun`, `drawMoon`, `drawStars`, `drawSkyClouds`

Checklist:

- [ ] Export `drawSky(input: DrawPharosVilleInput)`.
- [ ] Keep sky constants private.
- [ ] Preserve reduced-motion determinism.
- [ ] Preserve dawn/day/dusk/night behavior.
- [ ] Keep `drawSky(input)` at the same point in `world-canvas.ts`.

Acceptance:

- Screenshot drift is absent or inspected and intentional.

## Phase 4: Extract Terrain Without Reabsorbing Shoreline

Goal: move terrain drawing to `src/renderer/layers/terrain.ts` while preserving existing shoreline extraction.

Move:

- terrain colors, texture constants, and terrain asset mapping
- `drawTerrain`, `terrainAssetFor`, `terrainColor`, `isTileInViewport`
- water tile and land tile rendering
- water/land texture helpers currently still in `world-canvas.ts`

Checklist:

- [ ] Do not fold `layers/shoreline.ts` behavior back into `terrain.ts`.
- [ ] Preserve call order: `drawTerrain(input)`, then `drawCoastalWaterDetails(input)`.
- [ ] Preserve semantic water terrain behavior and palette semantics from `systems/palette`.
- [ ] Preserve manifest terrain sprite draw order before overlays.
- [ ] Keep viewport culling behavior unchanged.

Acceptance:

- Terrain and water output matches baseline except for inspected intentional drift.
- `terrain.ts` has no entity-specific render-state dependency.

## Phase 5: Extract Static Environment

Goal: move static scenic areas before entity renderers.

Destinations:

- `layers/harbor-district.ts`
- `layers/lighthouse.ts`
- `layers/cemetery.ts`
- `layers/ambient.ts`

Move in order:

1. Harbor district ground and Ethereum harbor extensions.
2. Lighthouse static environment: sea glow, surf, headland, reflections.
3. Cemetery ground, context, paths, quay edge, fence, shrubs, mausoleum, shrine, tree, lantern, mist.
4. Birds, decorative lights, and broad atmospheric overlays.

Checklist:

- [ ] Keep lighthouse tile and visual-clearance assumptions untouched.
- [ ] Keep lighthouse asset IDs and scale behavior unchanged.
- [ ] Keep cemetery scale/context constants private unless reused.
- [ ] Ensure asset IDs still resolve through `public/pharosville/assets/manifest.json`.
- [ ] Do not move lighthouse body, overlay, fire, or beam here if they are depth-sorted through `drawEntityLayer()` callbacks.

Acceptance:

- Scenic sections leave `world-canvas.ts`.
- `world-canvas.ts` still plainly shows when each scenic layer is drawn.
- No asset, depth-order, or visual-clearance regressions.

## Phase 6: Extract Entity Renderers

Goal: move entity drawing details while keeping the existing entity pass model intact.

Destinations:

- `layers/docks.ts`
- `layers/ships.ts`
- `layers/graves.ts`
- `layers/scenery.ts`
- `layers/lighthouse.ts`

Move:

- render state helpers per entity
- underlay/body/overlay draw functions
- entity-specific constants
- scenery prop table and prop drawing
- dock flags/ribbons/crests
- grave procedural marker helpers
- ship wake/body/overlay/livery helpers
- lighthouse body/overlay/fire/beam helpers wired through `drawEntityLayer()`

Checklist:

- [ ] Keep the existing `drawEntityLayer()` pass model intact.
- [ ] Keep depth ordering through `drawableDepth`, `drawEntityLayer()`, and `drawable-pass.ts`.
- [ ] Keep geometry shared through `geometry.ts` and `frame-cache.ts`.
- [ ] Keep selected and hovered visual behavior unchanged.
- [ ] Keep hit-testing untouched unless a shared helper must move.
- [ ] Keep render metrics unchanged.

Acceptance:

- Entity layers own drawing details.
- `world-canvas.ts` still owns sequencing and metrics.
- Hit targets, selected rings, and follow-selected behavior remain aligned.

## Phase 7: Extract Water Labels As A Post-Entity Overlay

Goal: move labels without accidentally treating them as entity-pass members.

Destination:

- `layers/water-labels.ts`

Move:

- water area label drawing
- Ethereum harbor signs
- cartographic label helpers
- flag/crest/ribbon helpers only if they are truly overlay helpers; keep dock-specific helpers with docks

Checklist:

- [ ] Preserve call order after `drawEntityPass(input, frame)` and before decorative overlays.
- [ ] Keep printed water labels visually above overlapping ships/landmarks as currently intended.
- [ ] Keep label placement sourced from `systems/area-labels.ts`.

Acceptance:

- Overlay order is unchanged.
- Label placement and text fitting match baseline.

## Phase 8: Split Ship Internals If Needed

Goal: split `layers/ships.ts` only if it remains difficult to scan after Phase 6.

Checklist:

- [ ] Keep `layers/ships.ts` as the public layer wrapper.
- [ ] Keep `ship-sail-tint.ts` as the tinting utility if that extraction remains valid.
- [ ] Avoid splitting tiny helpers into import-heavy fragments.
- [ ] Keep livery, sail logo, peg pennant, and wake helpers grouped by responsibility.

Acceptance:

- Ship rendering is easier to navigate.
- Import overhead remains reasonable.
- No motion, reduced-motion, wake, or livery regressions.

## Phase 9: Review The Facade

Goal: leave `world-canvas.ts` as an obvious coordinator.

Checklist:

- [ ] Keep type exports from `world-canvas.ts` stable unless deliberately migrated.
- [ ] Keep `drawPharosVille()` as the main public entry point.
- [ ] Keep frame creation, render sequencing, and render metrics easy to inspect.
- [ ] Remove dead imports and dead local helpers.
- [ ] Confirm no hidden dependency cycles were introduced.

Acceptance:

- `world-canvas.ts` reads as orchestration.
- Render order can be reviewed without opening every layer module.

## Phase 10: Documentation Update

Goal: align docs with the final renderer structure.

Checklist:

- [ ] Update `src/renderer/README.md`.
- [ ] Update `docs/pharosville/CURRENT.md` renderer file references.
- [ ] Mention that `world-canvas.ts` is the facade/sequencer.
- [ ] Document each extracted layer's responsibility.
- [ ] Do not update unrelated docs.

Acceptance:

- Docs match the new structure.
- Future agents know where to place renderer behavior.

## Validation Matrix

Run focused checks while developing, then broaden as the refactor crosses layer boundaries.

| Scope | Commands |
| --- | --- |
| Every phase | `npm run typecheck` |
| Entity, cache, geometry, selection, or hit-test risk | `npm test -- src/renderer/drawable-pass.test.ts src/renderer/frame-cache.test.ts src/renderer/hit-testing.test.ts` |
| Terrain or palette risk | `npm run check:pharosville-colors` |
| Any canvas output change | `npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"` |
| Release-level confidence | `npm run validate:release` |
| Deployed changes | `npm run smoke:live -- --url https://pharosville.pharos.watch` |

For a narrower non-release handoff, record the focused commands, outcomes, and why broader validation was skipped.

## Suggested Commit Or PR Sequence

1. Boundary prep plus canvas primitives.
2. Sky layer.
3. Terrain layer while preserving existing shoreline extraction.
4. Static environment layers.
5. Entity renderers.
6. Water-label overlay.
7. Optional ship internals split.
8. Docs and final validation.

Each step should be behavior-preserving and reviewable on its own.

## Risk Register

High-risk areas:

- Entity pass ordering and `drawableDepth`.
- Water-label overlay order after entities.
- Shared `frame-cache.ts` and `geometry.ts` usage.
- Reduced-motion deterministic frame behavior.
- Asset manifest ID, anchor, hitbox, and scale alignment.

Mitigations:

- Move code without rewriting math.
- Keep existing pass coordinators in place until a better abstraction is proven.
- Validate after each coherent subsystem.
- Use visual tests as regression detection, not as automatic approval.
- Keep screenshot baseline updates separate from extraction commits.
