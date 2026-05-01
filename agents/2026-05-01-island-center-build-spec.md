# PharosVille Island Center Build Spec

Date: 2026-05-01
Status: Draft — pending user approval before plan generation
Scope: Standalone `pharosville` repository only

## Objective

Fill the bare central plaza of the main island with an ambient observatory citadel cluster (6-8 mid-height limestone houses with terracotta hip roofs) plus a single stone sundial east of the cluster. Pure flavor, no analytical signal. Two new PixelLab assets, no manifest cap bump, no retirements.

## Why

The cleanup pass left the central plaza honest but bare. The user wants compelling density there, inspired by a pixel-art coastal-village reference but adapted to PharosVille's polished maritime observatory citadel identity. Pure-flavor decoration is the lowest-contract-risk way to add visual richness — the canvas already carries plenty of analytical signal via ships, docks, named risk-water, lighthouse, and DEWS zones; the center doesn't need to add another encoded layer. A single sundial reinforces "observatory citadel" identity without promoting the cluster to a named landmark.

## Non-negotiable preservation rules

- Preserve `LIGHTHOUSE_TILE = (18, 28)` and the lighthouse clearance box `x:14..24, y:23..32`. The lighthouse silhouette must remain the dominant vertical anchor on the island.
- Preserve all DEWS / risk-water semantics, all named risk-water labels, the seawall ring, harbor districts, ship class/scale/sprite logic, motion rules, dock logic, reduced-motion contract, world layout, and same-origin `/api/*` access.
- Preserve all 19 existing `SCENERY_PROPS` entries (post-cleanup). Only one new entry (`civic-sundial`) is added; nothing relocates, nothing else is removed.
- Preserve all 20 remaining `SceneryPropKind` values (post-`palm` removal). Only one new value (`"sundial"`) is added.
- Preserve every existing manifest entry. Only two new entries (`overlay.center-cluster`, `prop.sundial`) are added. The validator cap stays 45.
- Preserve `requiredForFirstRender = 25`. Both new assets are deferred-tier.
- Preserve `style.styleAnchorVersion = 2026-04-29-lighthouse-hill-v5`. Only `style.cacheVersion` bumps.
- Preserve the static-scene render order: district pad → center cluster → lighthouse + headland. Cluster never paints over the lighthouse or its headland.
- Preserve canvas-not-only-source-of-meaning: the cluster carries no analytical signal, so it needs no detail-panel or accessibility-ledger entry. The sundial is decorative; same rule.
- Do not bake analytical color bands, chain names, logos, banners, embedded text, or numerals into either generated PNG.

## Scope

In:

- Add `overlay.center-cluster` (PixelLab `create_map_object`, 384×224, deferred-tier overlay) and `prop.sundial` (PixelLab `create_object`, 64×64, deferred-tier prop) to the manifest.
- Add `drawCenterCluster` in a new `src/renderer/layers/center-cluster.ts`; wire into the static-scene pass between district pad and lighthouse passes in `src/renderer/world-canvas.ts`.
- Extend `SceneryPropKind`, `SCENERY_PROPS`, `drawSceneryProp`, and add a `drawSundial` helper in `src/renderer/layers/scenery.ts`.
- Bump `style.cacheVersion` to `2026-05-01-island-center-build-v1` in `public/pharosville/assets/manifest.json`.
- Update `docs/pharosville/CURRENT.md`: bump cache-version mentions, bump asset-count line (43 → 45 with revised critical/deferred split), add a short paragraph in the Current Visual Model section noting the new ambient cluster + sundial flavor.

Out (anti-scope, explicit):

- No second monument prop (no orrery, no star-chart pavilion).
- No authored building props (the overlay carries the density inline; no per-building sprite slots).
- No analytical encoding — no roof banner tied to a metric, no window-count binding, no door-state encoding, no color shift on supply or peg state.
- No manifest cap bump (cap stays 45).
- No retirements (`terrain.road` stays in place).
- No edits to ship, dock, risk-water, motion, world-layout, API, or desktop-gate code.
- No relocation of any existing scenery prop.
- No edits to `style.styleAnchorVersion`.
- No additions to `requiredForFirstRender`.
- No new tests beyond updating the asset-manifest test fixture for the new entry count and new IDs.
- No PixelLab generation of variants beyond the two new entries; no in-place regen of existing assets.
- No edits to `tests/visual/pharosville.spec.ts` source. Visual baseline PNGs update intentionally for the cluster + sundial appearance; nothing else.

## Phase 1: PixelLab generation

Generate two PixelLab jobs against the locked style anchor `2026-04-29-lighthouse-hill-v5`. Save candidates to `output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/`.

### 1a. `overlay.center-cluster` — `create_map_object`

Target: 384×224, transparent background.

```text
old-school 16-bit maritime isometric RPG pixel art, low top-down view, crisp pixel edges, transparent background.

A dense observatory citadel cluster, anchored at horizontal center. 6-8 limestone houses of mid height (max roof top ≈ 110 px from base), with terracotta hip roofs in #b04030 / #9a3a2c shade / #c8553f ridge highlight. Walls are pale limestone in #d8c8a8 base / #f0e2c4 highlight / #8e8470 mortar; one or two buildings use ochre stucco accent in #c89868 / #a07849 for variation. Painted-in stone stair run cutting south-southwest from the cluster down toward a quay edge, plus a short east-edge stair. Cypress columns in #5c5240 / #9c8a6c highlight between buildings. Tiny warm window pinpoints (1-2 px) in #f7d68a inside ~6-10 dark window slots — these are the "lit windows" cue, no glow halo, no radial light. Inland edges feather into transparency over the last 12 px so surrounding limestone tile ground blends without a hard outline. Strong dark contact shadow under the cluster base.

No tower, no spire, no second lighthouse, no banners, no text, no logos, no UI, no analytical color bands, no fishing nets, no fishing boats, no drying racks, no fish baskets, no painterly antialiasing, no soft outlines.
```

Acceptance for 1a:

- Dimensions exactly 384×224.
- Transparent background.
- Inland edges visibly feather into transparency over the last ~12 px.
- 6-8 distinct building silhouettes; max roof top ≤ 110 px from sprite base.
- No banner/text/logo/analytical-color-band; no fishing-village motifs.
- Lighthouse silhouette would still dominate when sprite is placed at `CIVIC_CORE_CENTER` and lighthouse sits at `LIGHTHOUSE_TILE`.
- Per-image overlay budget: ≤ 96 KiB / ≤ 150,000 decoded pixels (384×224 = 86,016 pixels — fits).

### 1b. `prop.sundial` — `create_object`

Target: 64×64, transparent background.

```text
old-school 16-bit maritime isometric RPG pixel art, low top-down view, crisp pixel edges, transparent background.

A stone sundial: square limestone plinth in #d8c8a8 / #f0e2c4 highlight / #8e8470 mortar, with a triangular brass gnomon in #7a5a3a shadow / #b08850 mid / #e6c47a glint casting a thin pixel shadow across a graduated dial face. Cartographic dial marks etched into the limestone (decorative, non-readable). Sprite content stays within roughly 40 px wide and 50 px tall inside the 64×64 frame; ground-contact bottom of the plinth sits at y≈56 so the manifest anchor [32, 56] aligns. Strong dark contact shadow at the base.

No embedded numerals, no Roman text, no logos, no UI, no analytical color bands.
```

Acceptance for 1b:

- Dimensions exactly 64×64.
- Transparent background.
- Single coherent silhouette readable at iso prop scale.
- No embedded numerals/text/logos.
- Per-image prop budget: ≤ 24 KiB / ≤ 30,000 decoded pixels (64×64 = 4,096 pixels — fits).

Promote accepted PNGs to:

- `public/pharosville/assets/overlays/center-cluster.png`
- `public/pharosville/assets/props/sundial.png`

## Phase 2: Manifest update

File: `public/pharosville/assets/manifest.json`.

Add:

- `overlay.center-cluster`: width 384, height 224, category `overlay`, layer `terrain`, displayScale 1, anchor `[192, 168]`, footprint `[240, 144]`, hitbox `[40, 40, 344, 184]`, loadPriority `deferred`, paletteKeys `["limestone", "terracotta", "scrub", "copper"]`, promptKey `overlay.center-cluster`, semanticRole `"observatory citadel cluster overlay"`, tool `mcp:create_map_object`, promptProvenance `{ jobId, styleAnchorVersion: "2026-04-29-lighthouse-hill-v5" }`. Mirror exact field order/schema from the existing `overlay.lighthouse-headland` entry; field names not enumerated here (e.g., `path`, any other manifest-required key) follow the existing schema.
- `prop.sundial`: width 64, height 64, category `prop`, layer `props`, displayScale 1, anchor `[32, 56]`, footprint `[20, 12]`, hitbox `[16, 14, 48, 56]`, loadPriority `deferred`, paletteKeys `["limestone", "copper"]`, promptKey `prop.sundial`, semanticRole `"observatory sundial monument"`, tool `mcp:create_object`, promptProvenance `{ jobId, styleAnchorVersion: "2026-04-29-lighthouse-hill-v5" }`. Mirror exact field order/schema from an existing `prop.*` entry such as `prop.memorial-headstone`.

Bump `style.cacheVersion` from `2026-05-01-unique-ships-v2` to `2026-05-01-island-center-build-v1`. `style.styleAnchorVersion` stays `2026-04-29-lighthouse-hill-v5`.

Acceptance:

- `manifest.assets.length === 45`.
- `requiredForFirstRender.length === 25` (unchanged).
- `style.cacheVersion === "2026-05-01-island-center-build-v1"`.
- `npm run check:pharosville-assets` passes (validator cap is 45; we're at the cap).

## Phase 3: Renderer integration

### 3a. `src/renderer/layers/center-cluster.ts` (new file)

Export `drawCenterCluster(input: DrawPharosVilleInput)`. Body fetches `assets.get("overlay.center-cluster")`; returns no-op if undefined; otherwise computes `tileToScreen(CIVIC_CORE_CENTER, camera)` and draws via `drawAsset` at zoom-aware scale 1. Pattern matches `drawLighthouseHeadland` in `src/renderer/layers/lighthouse.ts`.

Imports: `tileToScreen` from `../../systems/projection`, `drawAsset` from canvas primitives, `CIVIC_CORE_CENTER` from `../../systems/world-layout`, `DrawPharosVilleInput` from `src/renderer/render-types.ts`.

### 3b. `src/renderer/world-canvas.ts` — wire into static pass

Add a single call to `drawCenterCluster(input)` inside `paintStaticScenePass` after the district-pad pass and before the lighthouse-headland pass. The exact insertion point is between the existing `drawHarborDistrictGround` call and the existing `drawLighthouseHeadland` call. Do not change any other render order.

Static-scene cache key already includes `style.cacheVersion`, so bumping the cache version invalidates the cache automatically — no cache-key edit required.

### 3c. `src/renderer/layers/scenery.ts` — extend with sundial

Three coordinated edits, single commit:

1. Add `"sundial"` to the `SceneryPropKind` union (alphabetical placement between `"stone-steps"` and `"timber-pile"`).
2. Add a new entry to `SCENERY_PROPS`:

```ts
{ id: "civic-sundial", kind: "sundial", tile: { x: 35.0, y: 31.0 }, scale: 0.9 },
```

Place it adjacent to the (now-removed) civic-* slot in the file, above `cemetery-lamp`.

3. Add an `else if (prop.kind === "sundial")` branch in `drawSceneryProp` that calls a new `drawSundial(ctx, p.x, p.y, scale, input.assets)` helper.

4. Add `drawSundial`: fetches `prop.sundial` from assets, paints via `drawAsset` at the prop position with the prop scale. No-op if asset not yet loaded. Pattern matches existing prop helpers but with asset-backed rendering instead of procedural drawing.

Acceptance for Phase 3:

- `npm run typecheck` passes (the union update + new switch branch + new helper export are all consistent).
- `SCENERY_PROPS.length` increases by 1.
- New file `center-cluster.ts` exports a single function `drawCenterCluster`.
- The static-scene pass call ordering is preserved (district pad → center cluster → lighthouse headland → lighthouse).

## Phase 4: Documentation

File: `docs/pharosville/CURRENT.md`.

Edits:

- Update both cache-version mentions (currently `2026-05-01-unique-ships-v2`) to `2026-05-01-island-center-build-v1`.
- Update the asset-count summary line (currently noting 43 / 25 critical / 18 deferred) to **"45 assets / 25 critical / 20 deferred (validator cap stays 45)"**.
- Add a short paragraph in the Current Visual Model section, immediately after the lighthouse paragraph, of the form: "The central plaza is filled by the ambient `overlay.center-cluster` observatory citadel — a dense limestone+terracotta residential cluster anchored at `CIVIC_CORE_CENTER (31, 31)`. It carries no analytical signal and no detail-panel parity. A single `prop.sundial` at tile (35, 31) reinforces the observatory identity. The lighthouse remains the dominant vertical anchor; the cluster's silhouette caps at ≈ 110 px in 1× zoom."

No other CURRENT.md edits. No `VISUAL_INVARIANTS.md` edits — invariants are unchanged. No `ASSET_PIPELINE.md` edits — pipeline is unchanged; only the manifest count moved within the cap.

Acceptance:

- `npm run validate:docs` passes.
- A grep for `2026-05-01-unique-ships-v2` in `docs/` returns no hits after the bump.
- The new paragraph mentions the cluster, the sundial tile, the lighthouse-anchor invariant, and the silhouette cap.

## Phase 5: Tests

Update only the asset-manifest test fixture if it asserts asset counts or specific IDs (`src/systems/asset-manifest.test.ts`). No new behavioral tests — the build is purely additive ambient flavor with no new analytical surface to verify.

Visual baselines drift in three places (intentional):

- `pharosville-desktop-shell-linux.png` (cluster + sundial visible)
- `pharosville-dense-civic-core-linux.png` (cluster + sundial dominate this fixture region)
- Possibly `pharosville-dense-lighthouse-linux.png` (depending on sprite coverage)

Update via `--update-snapshots` only after manual diff inspection confirms only the cluster/sundial regions changed and the lighthouse remains visually dominant.

## Validation

Focused (during iteration):

```bash
npm run typecheck
npm test -- src/renderer src/systems
npm run check:pharosville-assets
npm run check:pharosville-colors
npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture"
npm run validate:docs
```

Manual screenshot review focus:

- **Desktop shell**: cluster sits centrally, terracotta roofs read against limestone, lighthouse silhouette dominates by ≈ 70 px at default zoom, no fishing-village artefacts, no banners, no text.
- **Dense civic core**: cluster + sundial fill the bare plaza, density reads as inspiration-like, sundial is a clear single silhouette east of the cluster.
- **Dense lighthouse**: lighthouse and headland still dominate; cluster does not duel.

Pre-claim broad gate per `AGENTS.md`:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Done criteria

- `overlay.center-cluster` and `prop.sundial` exist as PNGs under `public/pharosville/assets/overlays/` and `public/pharosville/assets/props/`, dimensions 384×224 and 64×64 respectively, transparent backgrounds, edge-feathered (cluster only).
- `manifest.json` lists 45 assets including the two new entries; `requiredForFirstRender` count unchanged at 25; `style.cacheVersion` is `2026-05-01-island-center-build-v1`.
- `src/renderer/layers/center-cluster.ts` exists and is wired into the static scene; cluster renders at `CIVIC_CORE_CENTER (31, 31)` between district pad and lighthouse headland.
- `civic-sundial` is in `SCENERY_PROPS` at tile (35, 31); `"sundial"` is a `SceneryPropKind` value; `drawSundial` paints `prop.sundial` via `drawAsset`.
- `CURRENT.md` reflects the new cache version, the new asset count, and the cluster+sundial flavor paragraph.
- All focused tests + pre-claim gate pass.
- Visual baselines updated only after manual diff review confirms only the cluster + sundial regions changed and the lighthouse remains the dominant vertical.
- Manifest cap stays at 45; `terrain.road` stays in place; no ship/dock/risk-water/motion/API/desktop-gate code touched.

## Hand-off

After approval, the writing-plans skill produces a step-by-step implementation plan that follows the five phases above with bite-sized tasks and TDD-where-applicable. The plan is then executed inline with surgical commits per phase.
