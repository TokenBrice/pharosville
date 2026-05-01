# Island Center Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the five-phase ambient observatory citadel cluster + sundial build from `agents/2026-05-01-island-center-build-spec.md` — generate two PixelLab assets, add them to the manifest under the existing 45-cap, render the cluster via a new `drawCenterCluster` static-pass helper between the district-pad and lighthouse-headland passes, render the sundial as a `kind: "sundial"` scenery prop drawn from the manifest, and document the new flavor in `CURRENT.md`.

**Architecture:** Two new sprite IDs added to the manifest (1 deferred-tier overlay, 1 deferred-tier prop), each rendered via the existing `drawAsset` primitive. New file `src/renderer/layers/center-cluster.ts` exports a single function called from the static-scene pass; `scenery.ts` is extended in the same end-to-end pattern as any other prop kind. The lighthouse stays the dominant vertical (cluster sprite paints under the lighthouse-headland pass).

**Tech Stack:** TypeScript, Vitest, Playwright (visual), PixelLab MCP (asset generation), Node validation scripts. Sprite generation is human-in-the-loop: the engineer reviews each candidate PNG before promoting to `public/pharosville/assets/`.

---

## File Structure

Files created or modified by this plan:

- **`output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/`** — scratch directory for PixelLab candidates; not committed.
- **`public/pharosville/assets/overlays/center-cluster.png`** — new, promoted from PixelLab candidate (Task 2).
- **`public/pharosville/assets/props/sundial.png`** — new, promoted from PixelLab candidate (Task 2).
- **`public/pharosville/assets/manifest.json`** — two new entries + cache-version bump (Task 3).
- **`src/renderer/layers/center-cluster.ts`** — new file, single export `drawCenterCluster` (Task 4).
- **`src/renderer/world-canvas.ts`** — single import + single call insertion in static pass (Task 4).
- **`src/renderer/layers/scenery.ts`** — extended `SceneryPropKind`, new `SCENERY_PROPS` entry, new switch branch, new `drawSundial` helper (Task 5).
- **`docs/pharosville/CURRENT.md`** — cache-version bumps, asset-count update, new flavor paragraph (Task 6).
- **`tests/visual/pharosville.spec.ts-snapshots/*.png`** — intentional baseline drift in 1-3 fixtures (Tasks 4-7).

No new Vitest tests. The existing `asset-manifest.test.ts` uses synthetic fixture data and does not lock the runtime asset count, so it does not need updating. Visual baselines are the gate for sprite placement.

---

## Pre-flight assumptions verified at plan time

- `CIVIC_CORE_CENTER` is exported from `src/systems/world-layout.ts:12` as `{ x: 31, y: 31 } as const`.
- `drawAsset` signature in `src/renderer/canvas-primitives.ts:3` is `(ctx, asset, x, y, scale)`.
- `drawLighthouseHeadland` (the precedent for `drawCenterCluster`) is at `src/renderer/layers/lighthouse.ts:74-80` — fetches the asset, returns no-op if undefined, computes screen-space center via `tileToScreen`, calls `drawAsset` at `camera.zoom * LIGHTHOUSE_HEADLAND_SCALE`. Headland uses scale 0.5; cluster will use scale 0.5 by the same convention so the 384×224 sprite covers ~6-9 tiles around `CIVIC_CORE_CENTER`.
- `paintStaticScenePass` in `src/renderer/world-canvas.ts:124-132` orders draws as: `drawHarborDistrictGround` → `drawBackgroundedHarborDocks` → `drawCemeteryGround` → `drawLighthouseHeadland` → `drawCemeteryContext`. The new `drawCenterCluster` call goes between `drawCemeteryGround` and `drawLighthouseHeadland`, so the lighthouse-headland (and lighthouse body, drawn later) stay on top.
- `drawSceneryProp` in `src/renderer/layers/scenery.ts:188` already receives `input` and therefore `input.assets`. The new `drawSundial` helper can call `input.assets?.get("prop.sundial")` directly.
- `scripts/pharosville/validate-assets.mjs:26` has `maxManifestAssets = 45`. Two new assets (43 → 45) hit the cap exactly. No cap edit.
- `style.cacheVersion` in `public/pharosville/assets/manifest.json:4` is `"2026-05-01-unique-ships-v2"`. Bumping to `"2026-05-01-island-center-build-v1"` is a single-line change.
- The static-scene cache key already includes `style.cacheVersion`, so the bump invalidates the cache automatically (no `world-canvas.ts` cache-key edit needed).
- `CURRENT.md` cache-version mentions are currently at lines 29 and 193 (per the cleanup plan's verification). Plan Task 6 anchors fixes by string match, not line number, in case drift moved them.

---

## Task 1: Capture clean baseline

**Files:** none changed.

**Why:** Confirm pre-change focused checks pass before any edit. If the baseline is failing on something unrelated, surface it now rather than blame the build.

- [ ] **Step 1: Confirm working tree is clean (or note user wip explicitly)**

Run: `git -C /home/ahirice/Documents/git/pharosville status --short`
Expected: empty output. If non-empty, identify whether changes are user wip (preserve) or stale (resolve before starting). Surface either way.

- [ ] **Step 2: Run focused checks**

```bash
npm run typecheck
npm test -- src/renderer src/systems
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run validate:docs
```

Expected: all five pass. The asset validator should report `PharosVille asset validation passed for 43 assets.`

If any pre-change check fails, stop and surface the failure.

- [ ] **Step 3: Snapshot the current visual baseline**

Run: `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"`
Expected: PASS against current baseline (no diff).

If this fails before any edit, the existing baseline is already out of sync. Surface and stop.

---

## Task 2: PixelLab generation — cluster + sundial

**Files:**
- Create: `output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/cluster-candidates/`
- Create: `output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/sundial-candidates/`
- Create: `public/pharosville/assets/overlays/center-cluster.png` (promoted from candidate)
- Create: `public/pharosville/assets/props/sundial.png` (promoted from candidate)

**Why:** Both new asset IDs require source PNGs that match the established style anchor `2026-04-29-lighthouse-hill-v5`. PixelLab generation is human-in-the-loop: each candidate is reviewed against acceptance criteria before promotion.

**Read first:** `docs/pharosville/PIXELLAB_MCP.md` for MCP usage, `docs/pharosville/ASSET_PIPELINE.md` for promotion rules, the spec's Phase 1 prompt blocks for the exact prompts.

- [ ] **Step 1: Create scratch directories**

Run:
```bash
mkdir -p /home/ahirice/Documents/git/pharosville/output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/cluster-candidates
mkdir -p /home/ahirice/Documents/git/pharosville/output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/sundial-candidates
```
Expected: directories exist.

- [ ] **Step 2: Generate the cluster overlay candidate**

Use the PixelLab MCP `create_map_object` tool. Pass the spec's Phase 1a prompt verbatim. Target dimensions 384×224, transparent background, locked to the lighthouse style anchor (`2026-04-29-lighthouse-hill-v5`).

Save the returned PNG via `curl --fail` to `output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/cluster-candidates/<jobId>.png`.

If the job returns pending or HTTP error, do not save the response body as PNG — re-poll until success.

- [ ] **Step 3: Verify the cluster candidate against acceptance criteria**

Open the saved PNG. Verify:

- Dimensions exactly 384×224 (use `identify` from ImageMagick or Python `PIL`).
- Transparent background outside cluster footprint.
- 6-8 distinct building silhouettes (count rooflines).
- Max roof top ≤ 110 px from sprite base in 1× zoom.
- Inland edges feather into transparency over the last ~12 px.
- No banner/text/logo/analytical-color-band visible at any zoom.
- No fishing-village motifs (no nets, drying racks, fish baskets, beached hulls).
- No second tower or spire competing with the lighthouse.
- Painted-in stair runs visible (one south-southwest, one east).
- Tiny 1-2 px warm window pinpoints visible inside dark window slots.
- Strong dark contact shadow under cluster base.

If any criterion fails, regenerate with the same prompt + style anchor + a new seed; do not promote. Surface failures explicitly to the user.

- [ ] **Step 4: Generate the sundial prop candidate**

Use the PixelLab MCP `create_object` tool. Pass the spec's Phase 1b prompt verbatim. Target dimensions 64×64, transparent background, same style anchor.

Save to `output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/sundial-candidates/<jobId>.png`.

- [ ] **Step 5: Verify the sundial candidate against acceptance criteria**

Verify:

- Dimensions exactly 64×64.
- Transparent background.
- Single coherent sundial silhouette (square plinth + triangular gnomon).
- Sprite content stays within ~40×50 px inside the 64×64 frame; bottom of plinth at y≈56.
- No embedded numerals, Roman text, logos, or UI.
- Brass gnomon visible with the three palette tones (`#7a5a3a` / `#b08850` / `#e6c47a`).
- Strong dark contact shadow at base.

If any criterion fails, regenerate; do not promote.

- [ ] **Step 6: Promote accepted candidates**

Copy the chosen PNGs to their final paths:

```bash
cp /home/ahirice/Documents/git/pharosville/output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/cluster-candidates/<chosen>.png \
   /home/ahirice/Documents/git/pharosville/public/pharosville/assets/overlays/center-cluster.png
cp /home/ahirice/Documents/git/pharosville/output/pharosville/pixellab-prototypes/island-center-build-2026-05-01/sundial-candidates/<chosen>.png \
   /home/ahirice/Documents/git/pharosville/public/pharosville/assets/props/sundial.png
```

- [ ] **Step 7: Verify file presence and dimensions**

Run:
```bash
identify /home/ahirice/Documents/git/pharosville/public/pharosville/assets/overlays/center-cluster.png
identify /home/ahirice/Documents/git/pharosville/public/pharosville/assets/props/sundial.png
```
Expected: 384x224 and 64x64 respectively, both with transparent backgrounds.

This task does not commit on its own — the PNGs commit alongside the manifest entries in Task 3 to keep the manifest and asset bytes in sync.

---

## Task 3: Manifest update

**Files:**
- Modify: `public/pharosville/assets/manifest.json` — add two entries, bump cacheVersion.

**Why:** Two new assets (43 → 45) at deferred tier; cap stays 45; first-render budget unchanged at 25.

- [ ] **Step 1: Read the current manifest header to anchor the cacheVersion edit**

Run: `grep -n '"cacheVersion"\|"styleAnchorVersion"\|"requiredForFirstRender"\|"assets":' /home/ahirice/Documents/git/pharosville/public/pharosville/assets/manifest.json | head -10`

Expected:
```
4:    "cacheVersion": "2026-05-01-unique-ships-v2",
5:    "styleAnchorVersion": "2026-04-29-lighthouse-hill-v5",
```

- [ ] **Step 2: Bump cacheVersion**

Use Edit tool, scoped to manifest.json:

Old: `"cacheVersion": "2026-05-01-unique-ships-v2",`
New: `"cacheVersion": "2026-05-01-island-center-build-v1",`

- [ ] **Step 3: Add the cluster overlay entry**

Locate the existing `overlay.lighthouse-headland` entry as a structural precedent. Insert the new overlay entry alphabetically inside `assets[]`:

```json
    {
      "id": "overlay.center-cluster",
      "path": "overlays/center-cluster.png",
      "category": "overlay",
      "layer": "terrain",
      "width": 384,
      "height": 224,
      "displayScale": 1,
      "anchor": [192, 168],
      "footprint": [240, 144],
      "hitbox": [40, 40, 344, 184],
      "loadPriority": "deferred",
      "promptKey": "overlay.center-cluster",
      "semanticRole": "observatory citadel cluster overlay",
      "paletteKeys": ["limestone", "terracotta", "scrub", "copper"],
      "tool": "mcp:create_map_object",
      "promptProvenance": {
        "jobId": "<the actual jobId returned by PixelLab in Task 2 step 2>",
        "styleAnchorVersion": "2026-04-29-lighthouse-hill-v5"
      }
    },
```

The exact field order, formatting, and any field this plan omits should mirror the existing `overlay.lighthouse-headland` entry. Replace `<the actual jobId returned by PixelLab in Task 2 step 2>` with the real jobId before saving.

- [ ] **Step 4: Add the sundial prop entry**

Insert alphabetically inside `assets[]`, modeled on `prop.memorial-headstone`:

```json
    {
      "id": "prop.sundial",
      "path": "props/sundial.png",
      "category": "prop",
      "layer": "props",
      "width": 64,
      "height": 64,
      "displayScale": 1,
      "anchor": [32, 56],
      "footprint": [20, 12],
      "hitbox": [16, 14, 48, 56],
      "loadPriority": "deferred",
      "promptKey": "prop.sundial",
      "semanticRole": "observatory sundial monument",
      "paletteKeys": ["limestone", "copper"],
      "tool": "mcp:create_object",
      "promptProvenance": {
        "jobId": "<the actual jobId returned by PixelLab in Task 2 step 4>",
        "styleAnchorVersion": "2026-04-29-lighthouse-hill-v5"
      }
    },
```

Replace `<the actual jobId returned by PixelLab in Task 2 step 4>` with the real jobId.

- [ ] **Step 5: Run the asset validator**

Run: `npm run check:pharosville-assets`
Expected: `PharosVille asset validation passed for 45 assets.`

If validation fails, the entries' field names/types deviate from schema. Fix by aligning to the precedent entries (`overlay.lighthouse-headland` for the overlay; `prop.memorial-headstone` for the prop), then re-run.

- [ ] **Step 6: Commit Task 2 + Task 3 together**

```bash
git -C /home/ahirice/Documents/git/pharosville add \
  public/pharosville/assets/overlays/center-cluster.png \
  public/pharosville/assets/props/sundial.png \
  public/pharosville/assets/manifest.json
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
build(center): add overlay.center-cluster and prop.sundial assets

Two PixelLab assets backing the ambient central observatory citadel:
- overlay.center-cluster (384x224, deferred): dense limestone+terracotta
  residential cluster anchored at CIVIC_CORE_CENTER (31, 31)
- prop.sundial (64x64, deferred): brass-gnomon stone sundial placed at
  tile (35, 31) for observatory identity reinforcement

Manifest cap stays 45 (43 -> 45). requiredForFirstRender unchanged at 25.
style.cacheVersion bumped to 2026-05-01-island-center-build-v1; the
static-scene cache invalidates against the new key.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Renderer integration — center cluster

**Files:**
- Create: `src/renderer/layers/center-cluster.ts`
- Modify: `src/renderer/world-canvas.ts` — single import + single call insertion in `paintStaticScenePass`.

**Why:** The cluster overlay needs a static-pass paint helper following the same shape as `drawLighthouseHeadland`. Wired between cemetery-ground and lighthouse-headland so the lighthouse silhouette draws on top.

- [ ] **Step 1: Create `src/renderer/layers/center-cluster.ts`**

Write file:

```ts
import { CIVIC_CORE_CENTER } from "../../systems/world-layout";
import { tileToScreen } from "../../systems/projection";
import { drawAsset } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

const CENTER_CLUSTER_SCALE = 0.5;

export function drawCenterCluster(input: DrawPharosVilleInput) {
  const { assets, camera, ctx } = input;
  const cluster = assets?.get("overlay.center-cluster");
  if (!cluster) return;
  const center = tileToScreen(CIVIC_CORE_CENTER, camera);
  drawAsset(ctx, cluster, center.x, center.y, camera.zoom * CENTER_CLUSTER_SCALE);
}
```

The scale `0.5` matches `LIGHTHOUSE_HEADLAND_SCALE` in `lighthouse.ts:67`, sized so a 384×224 sprite covers ~6-9 tiles around `CIVIC_CORE_CENTER`.

- [ ] **Step 2: Wire `drawCenterCluster` into `world-canvas.ts`**

In `src/renderer/world-canvas.ts`, find the existing `drawLighthouseHeadland` import (around line 23) and add `drawCenterCluster` to the imports.

Locate the `paintStaticScenePass` function (around line 124-132). Add a single call to `drawCenterCluster(input)` between `drawCemeteryGround(input)` and `drawLighthouseHeadland(input)`.

Use Edit tool. Old:

```ts
function paintStaticScenePass(input: DrawPharosVilleInput, frame: WorldCanvasFrame) {
  const { ctx } = input;
  ctx.imageSmoothingEnabled = false;
  drawHarborDistrictGround(input);
  drawBackgroundedHarborDocks(input, frame);
  drawCemeteryGround(input);
  drawLighthouseHeadland(input);
  drawCemeteryContext(input);
}
```

New:

```ts
function paintStaticScenePass(input: DrawPharosVilleInput, frame: WorldCanvasFrame) {
  const { ctx } = input;
  ctx.imageSmoothingEnabled = false;
  drawHarborDistrictGround(input);
  drawBackgroundedHarborDocks(input, frame);
  drawCemeteryGround(input);
  drawCenterCluster(input);
  drawLighthouseHeadland(input);
  drawCemeteryContext(input);
}
```

Add the import. Old:

```ts
import { drawLighthouseBeamRim, drawLighthouseBody, drawLighthouseHeadland, drawLighthouseNightHighlights, drawLighthouseOverlay, drawLighthouseSurf, lighthouseOverlayScreenBounds, lighthouseRenderState, type LighthouseRenderState } from "./layers/lighthouse";
```

After this line, add a new import line:

```ts
import { drawCenterCluster } from "./layers/center-cluster";
```

(Place it alphabetically among the other layer imports.)

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

If typecheck fails, the most likely cause is a missing import or a typo in the world-layout export name (`CIVIC_CORE_CENTER`). Fix and re-run.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/renderer src/systems`
Expected: PASS (existing tests unaffected; cluster sprite is deferred-tier so it's allowed to be absent during early renders).

- [ ] **Step 5: Commit Task 4**

```bash
git -C /home/ahirice/Documents/git/pharosville add \
  src/renderer/layers/center-cluster.ts \
  src/renderer/world-canvas.ts
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
build(center): paint overlay.center-cluster in the static-scene pass

New layer src/renderer/layers/center-cluster.ts exports drawCenterCluster,
which paints overlay.center-cluster at CIVIC_CORE_CENTER via drawAsset
(no-op until the deferred sprite is loaded).

Wired into paintStaticScenePass between cemetery-ground and lighthouse-
headland, so the lighthouse silhouette continues to dominate the central
vertical anchor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Renderer integration — sundial

**Files:**
- Modify: `src/renderer/layers/scenery.ts` — three coordinated edits.

**Why:** The sundial is rendered as a manifest-backed scenery prop, following the same end-to-end pattern as any existing prop kind: type union → SCENERY_PROPS entry → switch branch → draw helper.

- [ ] **Step 1: Add `"sundial"` to `SceneryPropKind`**

Use Edit tool. Old:

```ts
  | "stone-steps"
  | "timber-pile";
```

New:

```ts
  | "stone-steps"
  | "sundial"
  | "timber-pile";
```

(Alphabetical placement: `stone-steps` < `sundial` < `timber-pile`.)

- [ ] **Step 2: Add the `civic-sundial` entry to `SCENERY_PROPS`**

Locate the entry just above `cemetery-lamp` (the position vacated by the removed `civic-lamp-east`). Use Edit tool. Old:

```ts
  { id: "east-net", kind: "net-rack", tile: { x: 46.1, y: 29.1 }, scale: 0.58 },
  { id: "cemetery-lamp", kind: "harbor-lamp", tile: { x: 8.4, y: 47.0 }, scale: 0.72 },
```

(The exact preceding line may differ if Task 2 of the cleanup left other entries between `east-net` and `cemetery-lamp`. Match by the post-cleanup file state.)

New:

```ts
  { id: "east-net", kind: "net-rack", tile: { x: 46.1, y: 29.1 }, scale: 0.58 },
  { id: "civic-sundial", kind: "sundial", tile: { x: 35.0, y: 31.0 }, scale: 0.9 },
  { id: "cemetery-lamp", kind: "harbor-lamp", tile: { x: 8.4, y: 47.0 }, scale: 0.72 },
```

- [ ] **Step 3: Add the `sundial` switch branch in `drawSceneryProp`**

Use Edit tool. Old (the branch immediately before `timber-pile`):

```ts
  } else if (prop.kind === "stone-steps") {
    drawStoneSteps(ctx, p.x, p.y, scale);
  } else if (prop.kind === "timber-pile") {
```

New:

```ts
  } else if (prop.kind === "stone-steps") {
    drawStoneSteps(ctx, p.x, p.y, scale);
  } else if (prop.kind === "sundial") {
    drawSundial(input, p.x, p.y, scale);
  } else if (prop.kind === "timber-pile") {
```

(`drawSundial` takes `input` rather than just `ctx` because it needs access to `input.assets` to fetch the manifest sprite.)

- [ ] **Step 4: Add the `drawSundial` helper**

Append to `src/renderer/layers/scenery.ts`, immediately after `drawStoneSteps`. Use Edit tool. Old (the function-end of `drawStoneSteps`):

```ts
function drawStoneSteps(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
```

(The full body of `drawStoneSteps` follows; we anchor by the next function we need to insert *after* it. Use a unique enough trailing line of `drawStoneSteps` as the anchor.)

Actually anchor by the function-end of the *last* draw helper before the file's tail. The simplest, anchor-by-content way:

Find the line `function drawTimberPile(`. This function exists in `scenery.ts`. Insert `drawSundial` immediately *before* `drawTimberPile`. Use Edit tool. Old:

```ts
function drawTimberPile(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
```

New:

```ts
function drawSundial(input: DrawPharosVilleInput, x: number, y: number, scale: number) {
  const sprite = input.assets?.get("prop.sundial");
  if (!sprite) return;
  drawAsset(input.ctx, sprite, x, y, scale);
}

function drawTimberPile(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
```

- [ ] **Step 5: Add the `drawAsset` import if not already present**

Run: `grep -n "import.*drawAsset\|drawAsset," /home/ahirice/Documents/git/pharosville/src/renderer/layers/scenery.ts`

If no match, add to the imports at the top of the file:

```ts
import { drawAsset } from "../canvas-primitives";
```

If `drawDiamond, drawSignBoard` is already imported from `src/renderer/canvas-primitives.ts`, extend the existing import to include `drawAsset` instead of adding a second import line.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

If typecheck fails on `kind === "sundial"` exhaustiveness, the union update in Step 1 is missing or misplaced. If it fails on `drawAsset is not defined`, Step 5 is missing.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- src/renderer src/systems`
Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git -C /home/ahirice/Documents/git/pharosville add src/renderer/layers/scenery.ts
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
build(center): render prop.sundial as the civic-sundial scenery prop

Extends scenery.ts end-to-end with the sundial kind:
- "sundial" added to SceneryPropKind union
- civic-sundial entry placed at tile (35, 31) in SCENERY_PROPS
- drawSundial helper paints prop.sundial via drawAsset (no-op while
  the deferred sprite is loading)
- drawSceneryProp switch branch routes "sundial" to drawSundial

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Documentation update

**Files:**
- Modify: `docs/pharosville/CURRENT.md` — bump cache-version mentions, update asset-count line, add new flavor paragraph.

- [ ] **Step 1: Verify current cache-version mentions**

Run:
```bash
grep -n "2026-05-01-unique-ships-v2\|2026-05-01-island-center-build-v1" /home/ahirice/Documents/git/pharosville/docs/pharosville/CURRENT.md
```

Expected: two hits on the old value (the two lines referencing `landmark.lighthouse` cache version and the runtime asset cache version).

- [ ] **Step 2: Bump both cache-version mentions**

Use Edit tool with `replace_all: true`, scoped to `docs/pharosville/CURRENT.md`. Old: `2026-05-01-unique-ships-v2`. New: `2026-05-01-island-center-build-v1`.

- [ ] **Step 3: Update the asset-count summary line**

Find the line that reports the current manifest count. Run:
```bash
grep -n "the manifest contains 43 runtime assets\|manifest contains 43" /home/ahirice/Documents/git/pharosville/docs/pharosville/CURRENT.md
```

Use Edit tool. Old:

```
the manifest contains 43 runtime assets, split by `loadPriority` into 25 critical/first-render entries and 18 deferred entries
```

New:

```
the manifest contains 45 runtime assets, split by `loadPriority` into 25 critical/first-render entries and 20 deferred entries
```

(The exact surrounding prose may include "(the heritage-hull tier added 5 deferred unique-ship sprites)" or similar context. Replace only the count phrases; keep the surrounding sentence intact. If the validator's `maxManifestAssets` is mentioned in the same sentence, leave it as 45 — the cap did not change.)

- [ ] **Step 4: Add the new-flavor paragraph**

Find the lighthouse paragraph in the Current Visual Model section. Run:
```bash
grep -n "current lighthouse asset is" /home/ahirice/Documents/git/pharosville/docs/pharosville/CURRENT.md
```

Insert the following paragraph immediately after that paragraph (i.e., add a new bullet/paragraph item right after the lighthouse paragraph, preserving Markdown structure):

```
- The central plaza is filled by the ambient `overlay.center-cluster` observatory citadel — a dense limestone+terracotta residential cluster anchored at `CIVIC_CORE_CENTER (31, 31)`, drawn between the district-pad and lighthouse-headland passes via `src/renderer/layers/center-cluster.ts`. It carries no analytical signal and no detail-panel parity. A single `prop.sundial` at tile (35, 31) reinforces the observatory identity. The lighthouse remains the dominant vertical anchor; the cluster's silhouette caps at ≈ 110 px in 1× zoom.
```

(If the Current Visual Model section is structured as a top-level bullet list, the paragraph above is one bullet. If it's free-form prose, drop the leading `- ` and use a paragraph break.)

- [ ] **Step 5: Run validate:docs**

Run: `npm run validate:docs`
Expected: PASS for all three checks (`check:doc-paths-and-scripts`, `check:agent-onboarding-docs`, `test:guard-scripts`).

If `check:doc-paths-and-scripts` flags missing paths, the most likely cause is a mistyped reference to `src/renderer/layers/center-cluster.ts` — verify the file exists (Task 4 created it) and the prose path matches.

- [ ] **Step 6: Commit Task 6**

```bash
git -C /home/ahirice/Documents/git/pharosville add docs/pharosville/CURRENT.md
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
docs(current): describe the new central observatory cluster + sundial

CURRENT.md now mentions:
- the cache version (2026-05-01-island-center-build-v1)
- the manifest count (45 assets, 25 critical / 20 deferred, cap 45)
- the ambient central cluster + sundial flavor, anchored at
  CIVIC_CORE_CENTER (31, 31) and tile (35, 31), with the lighthouse
  preserved as dominant vertical anchor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Visual baseline update

**Files:**
- Modify: `tests/visual/pharosville.spec.ts-snapshots/*.png` — at minimum `pharosville-desktop-shell-linux.png` and `pharosville-dense-civic-core-linux.png`.

**Why:** The cluster + sundial appear in the central plaza, intentionally drifting any snapshot whose crop overlaps tiles `(25-37, 27-36)`. Update only after manual diff inspection confirms only those regions changed.

- [ ] **Step 1: Run the desktop-shell test and inspect the diff**

Run: `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"`
Expected: FAIL with snapshot diff in central plaza area.

Open the diff PNG under `test-results/` and verify the only changes are:
- The cluster appearing around tile (31, 31)
- The sundial appearing at tile (35, 31)
- No drift outside that bounding region
- Lighthouse silhouette still visually dominates (cluster does not duel)

If unexpected drift appears (palette shift, terrain change, ship displacement), stop and investigate — the cluster overlay may be painting outside its intended footprint, or the cache-version bump may have triggered an unrelated re-render.

- [ ] **Step 2: Update the desktop-shell baseline**

Run: `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell" --update-snapshots`
Expected: PASS, snapshot file regenerated.

- [ ] **Step 3: Run the dense fixture suite and inspect diffs**

Run: `npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture"`
Expected: FAIL on at least `pharosville-dense-civic-core-linux.png` (the fixture cropped to the civic core, where the cluster and sundial are now visible). Possibly also `pharosville-dense-lighthouse-linux.png` if the cluster sprite extends into that crop's left edge.

Inspect each diff. Verify same constraints as Step 1.

- [ ] **Step 4: Update dense-fixture baselines**

Run: `npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture" --update-snapshots`
Expected: PASS.

- [ ] **Step 5: Re-run full visual suite to confirm stability**

Run: `npm run test:visual`
Expected: all 16 tests PASS.

If a test fails after baseline update (animation-state flake), re-run once. If it persists across two runs, surface as a real regression.

- [ ] **Step 6: Commit Task 7**

```bash
git -C /home/ahirice/Documents/git/pharosville add tests/visual/pharosville.spec.ts-snapshots/
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
test(visual): refresh baselines for central cluster + sundial

Intentional drift on snapshots whose crop overlaps tiles (25-37, 27-36):
- pharosville-desktop-shell
- pharosville-dense-civic-core
- (possibly) pharosville-dense-lighthouse

Manual diff inspection confirmed only those regions changed and the
lighthouse silhouette continues to dominate the central vertical.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Pre-claim broad gate

**Files:** none changed.

**Why:** Per `AGENTS.md`, the broad gate runs before claiming completion. Catches anything the per-task focused checks missed.

- [ ] **Step 1: Run the broad gate sequentially**

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Expected: all six pass. The asset validator should report `PharosVille asset validation passed for 45 assets.` Vitest should report all tests passing.

If any check fails at this stage, the failure is either an interaction effect missed by the focused checks, or run-to-run flakiness. Investigate and surface.

- [ ] **Step 2: Confirm clean working tree**

Run: `git -C /home/ahirice/Documents/git/pharosville status --short`
Expected: empty.

- [ ] **Step 3: Show commit history for the build**

Run: `git -C /home/ahirice/Documents/git/pharosville log --oneline -8`
Expected: the build's commits at the top of the log (Tasks 3, 4, 5, 6, 7), atop the prior cleanup commits.

---

## Done criteria (mirrors spec)

- `overlay.center-cluster` (384×224) and `prop.sundial` (64×64) PNGs exist in `public/pharosville/assets/overlays/` and `public/pharosville/assets/props/` respectively, transparent backgrounds, edge-feathered (cluster only).
- `manifest.json` lists 45 assets including the two new entries; `requiredForFirstRender` count unchanged at 25; `style.cacheVersion` is `2026-05-01-island-center-build-v1`.
- `src/renderer/layers/center-cluster.ts` exists exporting `drawCenterCluster`; the function is called inside `paintStaticScenePass` between `drawCemeteryGround` and `drawLighthouseHeadland`.
- `civic-sundial` is in `SCENERY_PROPS` at tile (35, 31); `"sundial"` is a `SceneryPropKind` value; `drawSundial` paints `prop.sundial` via `drawAsset`.
- `CURRENT.md` reflects the new cache version, the new asset count (45 / 25 critical / 20 deferred), and the cluster+sundial flavor paragraph.
- All focused tests + pre-claim broad gate pass.
- Visual baselines updated only after manual diff review confirms only the cluster + sundial regions changed and the lighthouse remains the dominant vertical.
- Manifest cap stays at 45; `terrain.road` stays in place; no ship/dock/risk-water/motion/API/desktop-gate code touched.
