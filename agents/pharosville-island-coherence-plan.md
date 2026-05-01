# PharosVille Island Coherence Implementation Plan

Date: 2026-05-01
Status: Reviewer-revised draft (correctness APPROVE; conciseness, graphical, execution-risk all REVISE-MINOR — applied)
Scope: Standalone `pharosville` repository only
Primary request: Refine the main-island texture (currently a procedural green diamond grid that reads cheap), better connect the lighthouse to the island (it currently plants on lawn-green tiles with no rocky transition), and refine/regenerate the perimeter seawall (currently dim PNGs at 0.76 alpha plus thin procedural strokes). Use PixelLab MCP for all sprite/tile generation.

## Objective

Replace the cheap-reading green/grey land-tile substrate with a coherent limestone-family ground material, integrate the lighthouse with its surroundings via a dedicated headland sprite drawn under the tower, and regenerate the seawall pieces so the harbor perimeter reads as one continuous limestone language. Preserve the existing lighthouse PNG, the map geometry, all sea-zone semantics, all ship logic, all dock logic, and the manifest budget cap.

## Non-Negotiable Preservation Rules

- Preserve `LIGHTHOUSE_TILE = { x: 18, y: 28 }` and `landmark.lighthouse` PNG (recently refined in `f8affc8`).
- Preserve the authored `56 x 56` map geometry, all DEWS / risk-water semantics, all named risk-water labels (Calm Anchorage, Watch Breakwater, Alert Channel, Warning Shoals, Danger Strait, Ledger Mooring).
- Preserve ship class, scale, sprite IDs, logo placement, motion cadence, risk placement, route sampling, docking semantics, reduced-motion behavior, and hit-target behavior.
- Preserve same-origin `/api/*` access; do not touch Pages Function/API allowlists.
- Preserve the desktop gate: below `1280 x 760`, do not mount the world, fetch world data, fetch the manifest, create canvas, or decode sprites.
- Bump the runtime asset cap in `scripts/pharosville/validate-assets.mjs` from 34 to 35 (single-line `maxManifestAssets` change). Justification: limestone tile-pack land variation requires `terrain.land-scrub` as a new ID; the only other retirement available (`terrain.road`) is left in place per "don't refactor what's not broken."
- Preserve first-render budgets: 24 entries, 575 KB, 875,000 decoded pixels.
- Do not bake analytical / status colors, chain names, logos, or text into any generated PNG.

## Current Baseline

- Land-tile rendering happens in `src/renderer/layers/terrain.ts` via `drawLandTile`. Each land tile paints a `drawDiamond` flat color from `terrainColor()` (green family: `#697a4d`, `#4f7e4d`) plus a faint asset texture at 0.28 alpha. The flat color is what reads cheap.
- `terrain.land`, `terrain.shore`, `terrain.road` are 64×64 dark-blue noise overlays that contribute almost nothing visible.
- `overlay.central-island` (400×320 diorama) is exported but `drawCentralIslandModel` has zero callers — the asset is not painted today and is dead weight in the manifest.
- `drawLighthouseHeadland` in `src/renderer/layers/lighthouse.ts` is wired into the static-scene pass at line 91 of `src/renderer/world-canvas.ts` but is currently a no-op stub. The lighthouse plinth visually rests directly on lawn-green tiles.
- Perimeter seawall is rendered by `drawSeawallRun` (procedural taupe-and-light strokes) plus six `GENERATED_SEAWALL_ASSETS` PNG placements at scale 0.5–0.68 and alpha 0.76 — the PNGs are barely visible; the strokes do most of the work and don't share the lighthouse limestone palette.
- Manifest currently holds 34 assets with `requiredForFirstRender = 24`. Cap is 34 enforced in `scripts/pharosville/validate-assets.mjs:24`.
- Existing PixelLab style anchor: `2026-04-29-lighthouse-hill-v5`. Runtime cache version: `2026-04-30-pharosville-main-island-revamp-v2`.

## Desired Visual Direction

- One limestone-family palette across tiles, headland, seawall, plus the existing lighthouse. The palette anchors to the cool-gray-leaning mortar of the existing `landmark.lighthouse` PNG; warm-tan shades are reserved for the wild scrub edges, not the tile mortar:
  - limestone hi `#f0e2c4`, base `#d8c8a8`, neutral shade/mortar `#8e8470`, deep shadow `#5c5240`
  - scrub mid `#9c8a6c` (warmer), scrub dark `#7c6b48`
  - sand base `#dcb978`, sand hi `#f0d8a0`, damp-sand band `#b89060` (lower-right facets only)
  - terracotta cap `#b04030` (used sparsely on seawall top course only)
  - teal water-bounce `#7eb8b0` (used on cliff base / surf rim only)
- Land tiles read as a polished observatory citadel: limestone slabs across most ground, dry-grass scrub in scattered clumps, warm sand at the coastline.
- Lighthouse rests on a wide stepped limestone outcrop with a stair path winding up to the existing pedestal, a south-facing cliff face dropping toward sea with surf rim foam, and feathered inland edges that blend with surrounding scrub tiles.
- Seawall reads as one continuous limestone block course around the coast, full opacity, ~14 placements covering the actual coastline.

Avoid: greens beyond a dry "scrub mid" tan, generic fantasy village styling, baked-in analytics colors, painterly antialiasing, blurry edges, embedded text/logos/UI.

## Asset Architecture

Net manifest delta is +1 — cap bumps from 34 to 35. Validator's `maxManifestAssets` is updated in the same commit as the manifest entries.

| Action | Asset ID | Notes |
| --- | --- | --- |
| Retire | `overlay.central-island` | Already dead code; `drawCentralIslandModel` has zero callers |
| Add | `terrain.land-scrub` | 64×64, dry-grass-on-limestone variant for tile variation |
| Add | `overlay.lighthouse-headland` | **384×192**, limestone outcrop drawn under the lighthouse — sized to cover the full hill/rock/cliff ellipse around `LIGHTHOUSE_TILE` |
| Regen in place | `terrain.land` | 64×64, opaque pale-limestone paving |
| Regen in place | `terrain.shore` | 64×64, warm sand with damp-sand band on lower-right facets |
| Regen in place | `overlay.seawall-straight` | **160×96** (was 160×72) — vertical bump for visible block-course masonry at full opacity |
| Regen in place | `overlay.seawall-corner` | **192×128** (was 160×96) — proportional bump |
| Left in place | `terrain.road` | Manifest entry kept; no source/render code changes around road. "Don't refactor what's not broken." |
| Untouched | `landmark.lighthouse` | Recently refined in `f8affc8`; preserve |

`requiredForFirstRender` swaps `overlay.central-island` for `overlay.lighthouse-headland`. Count stays at 24. First-render decoded-pixel cost drops by ~54,000 (128,000 → 73,728); byte budget likely stays flat or drops.

Per-category fit:
- Terrain: 8 KB / 8,192 pixel cap. Three 64×64 tiles each = 4,096 pixels. OK.
- Overlay: 96 KB / 150,000 pixel cap. Headland 384×192 = 73,728 pixels. Seawall corner 192×128 = 24,576 pixels. OK.

## Implementation Strategy

Three tracks with one integration pass:

1. Generate and promote 5 PixelLab assets (3 land tiles via one `create_tiles_pro` batch + 2 seawall PNGs via `create_map_object` + 1 headland sprite via `create_map_object`).
2. Update manifest in place; bump `style.cacheVersion`.
3. Renderer alignment in `terrain.ts`, `lighthouse.ts`, `harbor-district.ts` — significant code deletion + small targeted additions.

Do not modify ship logic, ship sprites, dock logic, risk-placement logic, motion rules, API code, or desktop gating unless a focused test reveals an incidental adjustment is required.

## Phase 0: Baseline And Scratch

Status: Pending

Tasks:

- Run `git status --short` before editing.
- Capture current focused baseline:
  - `npm test -- src/systems/asset-manifest.test.ts src/renderer/drawable-pass.test.ts`
  - `npm run check:pharosville-assets`
  - `npm run check:pharosville-colors`
- Stash existing tile and seawall PNGs under `output/pharosville/pixellab-prototypes/island-coherence-2026-05-01/before/` for diff reference.
- Snapshot current visual baselines under `output/pharosville/pixellab-prototypes/island-coherence-2026-05-01/baseline-screenshots/` for manual side-by-side comparison later. Do not commit scratch artifacts.

Acceptance:

- Pre-change focused checks pass.
- Existing PNGs and key visual baselines are preserved for diff reference.

## Phase 1: PixelLab Asset Generation

Status: Pending

Read first: `docs/pharosville/PIXELLAB_MCP.md`, `docs/pharosville/ASSET_PIPELINE.md`, the manifest entry for each asset to be replaced or extended, and the renderer code that consumes its geometry.

Generate four PixelLab jobs (one batch + three single-objects).

### 1a. Land tile pack — `create_tiles_pro`

Single batch, locked seed for stylistic continuity. Output: 3 PNGs at 64×64.

```text
old-school 16-bit maritime isometric RPG pixel art, crisp pixel edges, low top-down view, transparent diamond ground tiles, edge-clean for tile adjacency, slab joints and texture lines run across tile interiors but no joint terminates at the diamond border, no text, no logos, no UI, no analytical color bands.

Tile 1 (terrain.land, pale limestone paving): 64x64 diamond. Pale limestone slabs in #d8c8a8 with #f0e2c4 highlights and #8e8470 neutral-gray mortar lines, tiny dust speckles, faint cream veining. Reads as polished observatory ground.

Tile 2 (terrain.land-scrub, dry-grass-on-limestone): 64x64 diamond. Same limestone base as tile 1, with sparse dry-grass tufts in #9c8a6c and #7c6b48, a few small pebbles, occasional pale lichen patch. Reads as wild edge of the citadel.

Tile 3 (terrain.shore, warm sand): 64x64 diamond. Warm sand base in #dcb978 with #f0d8a0 highlights on the upper-left facets, a darker damp-sand band #b89060 on the lower-right two facets fading toward dry sand on the upper-left, scattered darker pebbles, occasional dry-shell fleck. NO foam, NO water — those are renderer-controlled overlays.
```

### 1b. Lighthouse headland — `create_map_object`

```text
old-school 16-bit maritime isometric RPG pixel art, low top-down view, crisp pixel edges, transparent background.

A wide stepped limestone headland outcrop, 384x192, anchored at horizontal center. Pale limestone upper plateau in base color exactly #d8c8a8 with #f0e2c4 highlights — match surrounding ground tile, no atmospheric tint, no rim light on the inland edges. A narrow stair path winds up the right side toward where a tower would sit. South-facing cliff drops into the sea with #5c5240 deep-shadow rocks and a thin #7eb8b0 teal water-bounce + cream foam rim along the base. Small dry scrub clumps in #9c8a6c and #7c6b48 on the flat sections. Inland (top) and side edges feather into transparency over the last 12 px so surrounding tile ground blends without a hard outline. Strong dark contact shadow under the cliff base.

The sprite must extend visibly past the lighthouse plinth (which is approximately 140 px wide) on both sides — at 384 px wide it gives ~120 px of headland on each side of the tower.

No tower, no lantern, no beacon, no walls, no doors, no banners, no text, no logos, no UI, no analytical color bands. Single color outline, medium shading, medium detail.
```

### 1c. Seawall straight — `create_map_object`

```text
old-school 16-bit maritime isometric RPG pixel art, crisp pixel edges, low top-down view, transparent background.

A pale-limestone seawall segment running along an iso-diagonal, 160x96. Three visible block courses with #d8c8a8 base, #f0e2c4 cap highlights, #8e8470 neutral-gray mortar lines. A subtle terracotta wash on the very top course (#b04030 muted, ~10% area). Small dark notches and weep-holes along the seaward face. Strong dark contact shadow underneath where it meets the ground.

The 96 px height must give at least 56 px of visible block-course masonry above the contact shadow — at full opacity it should read as a wall, not a curb.

No tower, no doors, no banners, no text, no logos, no UI.
```

### 1d. Seawall corner — `create_map_object`

```text
old-school 16-bit maritime isometric RPG pixel art, crisp pixel edges, low top-down view, transparent background.

A pale-limestone seawall corner piece (90-degree iso turn), 192x128. Same limestone palette as the straight segment: #d8c8a8 base, #f0e2c4 cap highlights, #8e8470 mortar lines, #b04030 terracotta wash on the top course. The corner has a slightly raised cornerstone, three visible block courses, and a small dark contact shadow underneath.

No tower, no doors, no banners, no text, no logos, no UI.
```

Variation strategy at runtime (no extra IDs): `drawGeneratedSeawallAssets` flips on `flipX` (already used) plus alpha jitter ±0.04 per placement and small `yOffset` jitter to break stamp rhythm across the ~14 placements.

### Inspection & promotion

Save every candidate to `output/pharosville/pixellab-prototypes/island-coherence-2026-05-01/`. Use `curl --fail` for downloads so pending-job JSON or HTTP errors are not saved as PNG. For each candidate, verify:

- Actual dimensions match the manifest target exactly. Re-run if PixelLab returned square output for a rectangular request.
- Transparent background where required.
- No embedded text, logos, UI, status badges, chain names, or analytical color bands.
- No painterly edges, soft antialiasing, or photorealistic rendering.
- Tiles: edge-clean diamond shape; the three tiles read as one stylistic family.
- Headland: feathered inland edges, no tower or lantern pixels, palette continuous with the existing lighthouse PNG.
- Seawalls: clean cap line, mortar lines visible at game zoom, contact shadow present.

Promote accepted PNGs to:

- `public/pharosville/assets/terrain/land.png` (overwrite)
- `public/pharosville/assets/terrain/land-scrub.png` (new)
- `public/pharosville/assets/terrain/shore.png` (overwrite)
- `public/pharosville/assets/overlays/lighthouse-headland.png` (new)
- `public/pharosville/assets/overlays/seawall-straight.png` (overwrite)
- `public/pharosville/assets/overlays/seawall-corner.png` (overwrite)

Acceptance:

- All 6 promoted PNGs match manifest target dimensions.
- Manual visual review confirms shared limestone-family palette and rejection-criteria pass.
- Per-asset byte size stays under category budget (terrain 8 KB, overlay 96 KB).

## Phase 2: Manifest + Validator Update

Status: Pending

> **Phase ordering trap:** the validator's `validateReferencedAssetIds` scans `src/` for namespaced asset-id literals and requires every found ID to exist in the manifest. If Phase 2 lands in a separate commit before Phase 3 deletes the source-side `"overlay.central-island"` reference (in `harbor-district.ts:74`), `npm run check:pharosville-assets` will fail. **Do Phase 3c source deletion (delete `drawCentralIslandModel`) in the same commit as Phase 2**, or delete the dead function first.

Primary files:
- `public/pharosville/assets/manifest.json`
- `scripts/pharosville/validate-assets.mjs`

Tasks:

- Bump `maxManifestAssets` from 34 to 35 in `scripts/pharosville/validate-assets.mjs:24`. Single-line change.
- Remove `overlay.central-island` entry; remove from `requiredForFirstRender`.
- Add `terrain.land-scrub` entry mirroring `terrain.land` shape (64×64, anchor [32,32], category `terrain`, layer `terrain`, displayScale 1, loadPriority `deferred`, paletteKeys `["limestone", "scrub"]`, tool `mcp:create_tiles_pro`, promptProvenance `{ jobId, seed, styleAnchorVersion: "2026-04-29-lighthouse-hill-v5" }`).
- Add `overlay.lighthouse-headland` entry: 384×192, anchor [192, 128], footprint [240, 128], hitbox [72, 16, 312, 176], category `overlay`, layer `terrain`, displayScale 1, loadPriority `critical`, criticalReason `"Limestone outcrop under the PSI lighthouse — required for first-frame headland and to cover the lighthouse-mountain ellipse."`, paletteKeys `["limestone", "scrub", "teal sea", "deep shadow"]`, tool `mcp:create_map_object`, promptProvenance `{ jobId, styleAnchorVersion }`. Add to `requiredForFirstRender`.
- Update `width`/`height`/`anchor` for the resized seawall entries (straight 160×96 anchor [80,86]; corner 192×128 anchor [96,114]). Update `tool` and `promptProvenance` for all four regenerated entries (`terrain.land`, `terrain.shore`, `overlay.seawall-straight`, `overlay.seawall-corner`).
- Bump `style.cacheVersion` to `2026-05-01-pharosville-island-coherence-v1`. Keep manifest-wide `styleAnchorVersion` at `2026-04-29-lighthouse-hill-v5` for validator continuity.
- Delete the retired central-island PNG asset.

Acceptance:

- `manifest.assets.length === 35`.
- `requiredForFirstRender.length === 24`.
- `npm run check:pharosville-assets` passes (after Phase 3c deletes the source reference to `overlay.central-island`).

## Phase 3: Renderer Alignment

Status: Pending

Apply file-by-file in this order. Run a focused test pass between files.

### 3a. `src/renderer/layers/terrain.ts`

- Replace the `TERRAIN_ASSET_BY_KIND` constant with a function `landVariantId(kind, x, y)` that returns:
  - For `kind in {grass, land}`: variant picker. **Use a 2D PRNG hash, not the lattice-aligning `(7x + 11y) mod 5`** — that hash creates visible diagonal bands of scrub at iso projection. Use:
    ```ts
    const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
    return (h % 5 < 2) ? "terrain.land-scrub" : "terrain.land";
    ```
    Constants are large coprime primes so neither `x` nor `y` lattice direction dominates; produces ~40% scrub with no visible diagonal pattern.
  - For `kind in {hill, rock, cliff}`: `"terrain.land"` (covered by the now-larger 384×192 headland sprite; limestone is a safe fallback under any uncovered edge).
  - For `kind in {beach, shore}`: `"terrain.shore"`.
  - Water kinds: existing routing unchanged.
- Update `terrainAssetFor` (or its replacement) to take `(assets, kind, tileX, tileY)` — both call sites at lines 87 and 101 must be updated.
- In `drawLandTile`:
  - Drop the underlying `drawDiamond(...)` flat-color base for non-elevated land tiles. The opaque PNG carries the visual.
  - Drop the post-asset `drawDiamond(... withAlpha ...)` tint.
  - Draw the asset opaque (alpha 1).
  - Keep `drawTileLowerFacet` for elevated tiles only.
  - Keep `drawShoreFoam` for beach/shore.
- Delete `drawGrassTexture`, `drawRockTexture`, `drawRoadTexture` and all their call sites in `drawLandTile`.
- Delete the `road`-related branch in `drawGroundGrain` and `drawLandTile`.
- Remove `road`, `rock` entries from `TILE_COLORS` **and** delete the matching `value.includes("road")` and `value.includes("rock")` fallback branches in `terrainColor()` (lines 173-175). Otherwise `terrainColor` returns `undefined` for any value containing `"rock"`.
- Keep `drawWaterTileBase`, `drawWaterTerrainOverlays`, all water texture functions, and `drawShoreFoam` untouched.
- Do NOT recolor `cliff` — that's adjacent code unrelated to the user's three objectives.

### 3b. `src/renderer/layers/lighthouse.ts`

Replace the body of `drawLighthouseHeadland` with:

```ts
export function drawLighthouseHeadland(input: DrawPharosVilleInput) {
  const { assets, camera, ctx, world } = input;
  const headland = assets?.get("overlay.lighthouse-headland");
  if (!headland) return;
  const center = tileToScreen(world.lighthouse.tile, camera);
  drawAsset(ctx, headland, center.x, center.y, camera.zoom);
}
```

If `tileToScreen` and `drawAsset` are not already imported, add them. The function continues to be called from `paintStaticScenePass` in `src/renderer/world-canvas.ts:91`, so no caller-side changes.

### 3c. `src/renderer/layers/harbor-district.ts`

- Delete `drawCentralIslandModel`, `CENTRAL_ISLAND_MODEL_TILE`, `CENTRAL_ISLAND_MODEL_SCALE`. Confirmed zero callers across `src/`. **This deletion must land in the same commit as the Phase 2 manifest retirement of `overlay.central-island`** (the validator scans source for the literal).
- Delete `drawSeawallRun`, `densifySeawallTiles`, `MAIN_SEAWALL_RUN`. Drop the `drawSeawallRun(ctx, camera, MAIN_SEAWALL_RUN)` call from `drawHarborDistrictGround`.
- Author a 14-entry `GENERATED_SEAWALL_ASSETS` array covering the actual island coast. Pick straight vs corner per placement by inspecting cardinal water neighbors of the anchored coast tile (1 → straight; 2+ → corner). Manual list — do not derive at runtime.
- Drop `ctx.globalAlpha = 0.76`. Add per-placement variation to break stamp rhythm at full opacity:
  - `flipX` continues per the existing pattern.
  - Per-placement `alphaJitter` field (range −0.04 to +0.04) and `yOffset` jitter (±1 px), seeded by placement index.
- Keep `drawHarborDistrictGround`, `drawDistrictPad`, `drawDistrictPaving`, `drawEthereumHarborExtensions`, and all `drawRollup*` helpers untouched.

### 3d. `src/renderer/world-canvas.ts` — static-cache invalidation fix

The static-scene cache (`staticCacheKey`, line 61) currently keys on viewport, zoom, dpr, world id, and `assetLoadTickFor` (a count of loaded assets). It does **not** include `style.cacheVersion`. When PNG bytes change at the same path with the same load count, the in-memory cache serves stale paint.

Add the manifest cache version to the cache key:

```ts
function staticCacheKey(input, dpr, scope) {
  // ...existing fields...
  const cv = input.assets?.getManifest()?.style?.cacheVersion ?? "0";
  return `${scope}|${worldIdFor(input.world)}|${width}x${height}|z${zoomBucket}|o${offsetX},${offsetY}|d${dprBucket}|a${assetLoadTickFor(input)}|cv${cv}`;
}
```

Verify `getManifest()` exists on the asset manager (or pull cacheVersion through whatever existing accessor is available; do not add new asset-manager API surface).

### Test pass between files

After 3a:
- `npm test -- src/renderer/drawable-pass.test.ts`
- Visual smoke: `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"`

After 3b:
- Visual smoke: `npx playwright test tests/visual/pharosville.spec.ts --grep "dense lighthouse"`

After 3c:
- Full renderer focused: `npm test -- src/renderer src/systems/asset-manifest.test.ts`

Acceptance:

- TypeScript compiles after each file.
- No dead-import warnings.
- No unused function exports.
- Lighthouse hit target, selection ring, beam, and visual tower align (no shifts — anchor unchanged).
- Water labels remain visible and clickable.
- Static-scene cache invalidates against the bumped `style.cacheVersion`.

## Phase 4: Color Allowlist And Documentation

Status: Pending

Confirmed at plan time: `scripts/check-pharosville-colors.mjs` only blocks specific debug tokens — it does **not** enforce a positive palette allowlist. New limestone hexes will not be blocked. No script update needed unless `npm run check:pharosville-colors` flags something at validation.

Tasks:

- Update `docs/pharosville/CURRENT.md`:
  - new island ground material (limestone tile pack)
  - new headland sprite under lighthouse
  - new cache version `2026-05-01-pharosville-island-coherence-v1`
  - retired `overlay.central-island`
  - asset count is now 35 (cap bumped from 34)
- Update `docs/pharosville/VISUAL_INVARIANTS.md` if it documents land-color contracts; replace green-family invariants with limestone-family. Review `docs/pharosville/VISUAL_INVARIANTS.md:26` (asserts "lighthouse stays on the generated central-island mountain") and rewrite for the headland sprite.

Skip: `ASSET_PIPELINE.md`, `VISUAL_REVIEW_ATLAS.md`, `pharosville-page.md`. None are load-bearing for this change; revisit only if `npm run check:doc-paths-and-scripts` flags a stale reference.

Acceptance:

- `CURRENT.md` and `VISUAL_INVARIANTS.md` match the implemented island, asset, and validation contract.
- No docs imply new analytical semantics.

## Phase 5: Validation And Visual Approval

Status: Pending

Focused iteration (3 lanes — broad lanes ride on the pre-claim gate):

```bash
npm test -- src/renderer/drawable-pass.test.ts src/systems/asset-manifest.test.ts
npm run check:pharosville-assets
npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"
npx playwright test tests/visual/pharosville.spec.ts --grep "dense lighthouse"
npx playwright test tests/visual/pharosville.spec.ts --grep "dense risk water"
```

**DEWS-label readability gate (must verify before generation acceptance):** white DEWS labels go from ~5:1 contrast on green to ~1.6:1 on limestone if any label happens to render over land. Confirm in code that water labels render over water tiles only — `drawWaterAreaLabels` at runtime should never produce a label whose bounding box overlaps a non-water tile. If any do, add a dark text shadow / pill background before snapshot acceptance.

Manual screenshot review focus:

- **Desktop shell**: limestone ground reads coherent, no green diamond grid, lighthouse plants on visible headland, no diagonal scrub stripes.
- **Dense lighthouse**: stair / cliff / surf rim visible under the tower, palette continuous with the tower base, no flat-limestone peek through at the cliff/rock/hill ring.
- **Dense risk-water**: DEWS labels remain readable; storm-water tints and named labels still pop.

Broad pre-claim gate (per `AGENTS.md`):

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Update visual baselines only after manual diff inspection confirms the drift is intentional.

Acceptance:

- All focused tests pass.
- DEWS labels confirmed readable.
- Full pre-claim gate passes.
- Visual snapshots updated only after manual review.

## File-by-File Checklist

The asset architecture table above is the source of truth for asset deltas. Code edits below are the renderer-side companion:

- `src/renderer/layers/terrain.ts` — variant routing via PRNG hash, opaque tile draw, delete grass/rock/road procedural passes, delete the matching `terrainColor` `value.includes(...)` branches.
- `src/renderer/layers/lighthouse.ts` — fill `drawLighthouseHeadland` body.
- `src/renderer/layers/harbor-district.ts` — delete dead `drawCentralIslandModel`, delete `drawSeawallRun` pass, 14-entry seawall placement list at full opacity with mirror+jitter variation.
- `src/renderer/world-canvas.ts` — add `cacheVersion` to `staticCacheKey` (Phase 3d).
- `scripts/pharosville/validate-assets.mjs` — bump `maxManifestAssets` 34 → 35.
- `docs/pharosville/CURRENT.md`, `VISUAL_INVARIANTS.md` — updates per Phase 4.
- `tests/visual/pharosville.spec.ts-snapshots/*.png` — re-bake after manual review.

Avoid editing:

- `functions/api/**`
- `src/systems/world-layout.ts` (map geometry preserved)
- `src/systems/chain-docks.ts`, `src/systems/ship-visuals.ts`, `src/systems/risk-placement.ts`, `src/systems/motion.ts`
- `src/renderer/geometry.ts` (lighthouse hit-target geometry preserved)
- `src/renderer/hit-testing.ts`
- ship PNGs, dock PNGs, prop PNGs, `landmark.lighthouse.png`
- shared stablecoin data
- `terrain.road` manifest entry and `terrain/road.png` (left in place; the road code path is dead but not load-bearing for this change)

## Execution Order

1. Phase 0 baseline focused checks + PNG stash to scratch.
2. Phase 1 PixelLab generation; inspect and promote one asset class at a time, accepting candidates in scratch first. If the `create_tiles_pro` batch doesn't read as one stylistic family, regen the batch with the same seed before promoting any tile.
3. **Single commit** containing: Phase 2 manifest+validator update **plus** Phase 3c source deletion of `drawCentralIslandModel` and the `overlay.central-island` literal — the validator scans source for retired IDs.
4. Phase 3a (terrain), 3b (lighthouse headland), 3d (cache key fix) — separate commits OK with focused tests between.
5. Phase 4 docs.
6. Phase 5 focused checks + DEWS-label readability gate; manual diff inspection; baseline updates.
7. Phase 5 broad pre-claim gate.
8. Commit with a focused message and the required `Co-Authored-By` line.

## Reviewer Signoff Summary

Four Opus reviewers ran in parallel against the initial draft:

- **Correctness — APPROVE.** All 14 verification points (file paths, function names, line numbers, manifest fields, validator constants, picker arithmetic) check out. Two minor flags folded in: explicit deletion of `value.includes("road")`/`("rock")` branches in `terrainColor`, and explicit mention of `terrainAssetFor`'s 2 call sites.
- **Conciseness — REVISE-MINOR (applied).** Dropped `terrain.road` retirement (don't refactor what's not broken). Dropped `cliff` recolor (adjacent code). Trimmed Phase 4 to `CURRENT.md` + `VISUAL_INVARIANTS.md` only. Trimmed Phase 5 focused lanes to 3. Collapsed three redundant change-summary sections into the asset-architecture table + a smaller file-by-file list.
- **Graphical — REVISE-MINOR (applied).** Shifted shade hex `#9c8a6c` → `#8e8470` to neutralize olive cast vs the lighthouse's cool-gray mortar; reserved `#9c8a6c` for scrub clumps only. Bumped headland from 288×144 to **384×192** to cover the lighthouse-mountain ellipse and extend visibly past the 140-px tower base. Bumped seawall straight to 160×96 and corner to 192×128 for visible block-course masonry. Added prompt addenda for shore wet-edge band, tile mortar joints not ending at diamond edges, and headland inland-edge color exact-match. Added DEWS-label readability gate to Phase 5. Added runtime mirror+alpha-jitter variation to break seawall stamping at full opacity (no new IDs).
- **Execution-risk — REVISE-MINOR (applied).** **Real bug:** `staticCacheKey` did not include `style.cacheVersion` — added Phase 3d that injects it. **Real bug:** the `(7x + 11y) mod 5` variant picker aligns with iso lattice direction, producing diagonal scrub stripes — replaced with PRNG hash `((x * 374761393) ^ (y * 668265263)) >>> 0`. **Phase ordering trap:** validator scans source for retired IDs — Phase 2 manifest update bundled into the same commit as Phase 3c source deletion. **Coverage gap:** 288×144 headland could not cover the lighthouse-mountain ellipse — bump to 384×192 (also addresses graphical reviewer's sizing concern).

## Done Criteria

- Main island reads as a coherent old-school isometric maritime observatory citadel: limestone ground, dry-scrub edges, sand at coastline.
- Lighthouse rests on a visible limestone headland with stair, cliff, and surf rim — the tower no longer plants on lawn green.
- Perimeter seawall reads as one continuous limestone block course at full opacity, ~14 placements covering the coast.
- Manifest holds 35 entries (cap bumped from 34); first-render budget and category byte/pixel budgets all pass.
- Static-scene cache invalidates against the bumped `style.cacheVersion`.
- Sea zones, water labels (readable on limestone), ship visuals, ship routes, dock logic, risk placement, motion rules, and desktop gate are all preserved.
- Reduced-motion contract preserved.
- All required checks pass; visual baselines updated only after manual review.
