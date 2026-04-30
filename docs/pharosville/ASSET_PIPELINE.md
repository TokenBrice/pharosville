# PharosVille Asset Pipeline

Last updated: 2026-04-30

This is the agent-facing workflow for PharosVille raster assets. Runtime asset truth is `public/pharosville/assets/manifest.json`.

## Asset Rules

- Generate or stage candidates under local scratch space first, such as `output/pharosville/pixellab-prototypes/`.
- Promote selected PNGs to `public/pharosville/assets/` only after they are chosen for runtime use.
- Runtime code must reference local manifest asset IDs, not remote generation URLs, tokens, or prototype paths.
- Every runtime PNG needs a manifest entry with accurate dimensions, anchor, footprint, hitbox, layer/category, load priority, semantic role when useful, and prompt provenance.
- Load priority is part of the runtime budget: use `critical` only for assets needed to make the initial desktop canvas frame coherent, and `deferred` for supplemental scenery or alternate sprites that can arrive after the core scene.
- Treat `public/pharosville/assets/manifest.json` as the runtime inventory source of truth and use `loadPriority` for the critical/deferred split. `npm run check:pharosville-assets` enforces the local PNG contract and the v0.1 manifest budget.
- Manifest schema v2 separates `style.cacheVersion` from `style.styleAnchorVersion`.
- Bump `style.cacheVersion` whenever promoted asset bytes, manifest geometry, or animation frame assets change.
- Keep `promptProvenance.jobId` and `promptProvenance.styleAnchorVersion` aligned with the selected asset's style anchor.
- Optional frame-based animation metadata belongs in `asset.animation`; keep `path` as the static/reduced-motion source unless a future renderer change says otherwise.

## Current Runtime Asset Areas

- Terrain tiles: `public/pharosville/assets/terrain/`
- Terrain overlays: `public/pharosville/assets/overlays/`, including `overlay.central-island`
- Landmark: `public/pharosville/assets/landmarks/lighthouse-alexandria.png` as `landmark.lighthouse`
- Chain docks: `public/pharosville/assets/docks/`
- Ships: `public/pharosville/assets/ships/`
- Props: `public/pharosville/assets/props/`, including the cemetery memorial terrace and marker sprite set
- Manifest: `public/pharosville/assets/manifest.json`

## PixelLab MCP Workflow

Use `PIXELLAB_MCP.md` for PixelLab-specific tool selection, prompt construction,
review-pack handling, provenance, and cleanup. The short guidance below remains
the shared style contract for any image-generation path.

## Main-Island Revamp Asset Handoff

For the main-island revamp, the selected production PNGs are promoted in place:

- Replace runtime assets in place first: `overlay.central-island`,
  `landmark.lighthouse`, and only the dock IDs that are actually regenerated.
- Do not add new runtime IDs or move extra assets into first-render loading
  unless a measured visual need and budget impact are recorded.
- Prefer current manifest dimensions for replacements. If PixelLab returns
  square or oversized output, crop or pad in scratch space before promotion
  rather than silently increasing decoded-pixel cost.
- Keep promoted files local under `public/pharosville/assets/**`; never commit
  PixelLab scratch output, remote URLs, tokens, or review-pack links.
- Record accepted PixelLab object/job IDs in `promptProvenance.jobId` and set
  `promptProvenance.styleAnchorVersion` to the manifest style anchor. Current
  promoted IDs are `25ee8636-32f7-4aa1-bb29-f924cbb4fc01` for
  `overlay.central-island`, `c47c36c5-dd3e-4721-923f-9e5852400f65` for
  `landmark.lighthouse`, and `31155966-7d76-413a-bd7b-557f79cffc9f` for
  `dock.compact-harbor-pier`. Current cache version is
  `2026-04-30-pharosville-main-island-revamp-v2`; the style anchor remains
  `2026-04-29-lighthouse-hill-v5`.
- Re-check renderer assumptions for central overlay placement, lighthouse crop,
  beacon point, hitbox, selection ring, and dock flag/logo offsets before
  updating screenshots.

## Image Generation Guidance

Use transparent PNG map-object generation for standalone sprites and tile generation for repeatable terrain. Keep prompts consistent with the manifest style anchor:

```text
old-school 16-bit maritime isometric RPG pixel art, crisp pixel edges, low top-down view, deep navy and teal sea, pale limestone island city, bronze and gold beacon light, restrained analytics palette, readable silhouettes, no text, no logos, no UI
```

For main-island revamp assets, extend the prompt with: compact Pharos maritime
observatory island, terraced pale limestone cliffs and seawalls, terracotta roof
accents, dark timber piers and quay decks, oxidized bronze beacon hardware,
warm harbor lights, cool teal water-bounce on lower edges, and dark contact
shadows. Keep `no text`, `no logos`, `no UI`, `no ships`, and no analytical
status colors.

## Sprite Bible

Treat `landmark.lighthouse` as the live style anchor. New or regenerated sprites
should look like they belong beside that lighthouse rather than beside a generic
fantasy town:

- **Camera:** low top-down isometric, matching the existing tile projection.
- **Light:** warm key from the upper-left, cool teal bounce from water on lower
  edges, dark contact shadow under every sprite.
- **Outline:** single dark outline with selective internal dark pixels; no soft
  antialiased edges.
- **Materials:** weathered limestone, oxidized bronze, dark timber, cream sail
  cloth, teal harbor water, pale foam, restrained red/blue roof accents.
- **Scale:** readable silhouettes at default `/pharosville/` zoom before detail
  is visible.
- **Ships:** each hull needs a clear sail or pennant area for runtime logo marks;
  do not bake logos, token badges, text, counts, UI panels, or chain names into
  the PNG.
- **Docks/landmarks:** include built-in mass, posts, stairs, rope/crate clutter,
  lanterns, and waterline contact so they read as districts rather than floating
  stickers.
- **Cemetery props:** use pale maritime limestone, bronze/enamel plaque details,
  restrained grass seams, and teal water-bounce edges. Avoid purple graveyard
  styling, spooky silhouettes, or floating badge-like token marks.
- **Terrain:** tile art can carry texture and material quality, but analytical
  water-zone color stays renderer-controlled so DEWS semantics remain legible.
- **Reduced motion:** the static `path` image must be complete on its own even
  when optional animation frame metadata is present.

Preferred constraints:

- Transparent background for objects.
- Low top-down/isometric viewpoint.
- Readable silhouette at route zoom.
- No embedded text, logos, UI, or photorealistic details.
- restrained palette that works with the existing sea/island colors.
- No ClaudeVille-specific lore, fantasy-village props, agent characters,
  decorative signs, or copy baked into the sprite.

## Promotion Checklist

1. Save candidate PNGs under local scratch space such as `output/pharosville/pixellab-prototypes/`.
2. For PixelLab review packs, use `get_object` to inspect candidates, then
   `select_object_frames` for keepers or `dismiss_review` for rejects.
3. Select one candidate and copy only the chosen production asset into `public/pharosville/assets/...`.
4. Verify actual PNG dimensions before editing the manifest.
5. Update manifest geometry, cache/provenance versions, and optional animation metadata.
6. Re-check renderer assumptions for anchor, scale, beacon points, sail-logo offsets, and hitboxes.
7. Run focused asset and visual checks.

## Required Checks For Asset Changes

```bash
npm run check:pharosville-assets
npm run check:pharosville-colors
```

For geometry, anchor, hitbox, or visible sprite changes, also run focused unit tests and visual checks:

```bash
npm test -- src/renderer/hit-testing.test.ts src/systems/pharosville-world.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"
```

Use `npm run build` when the change affects the deployable Vite artifact or is part of release validation.

## Common Failure Modes

- Manifest dimensions do not match the PNG.
- Anchor/footprint changes make hit targets or selection rings drift from the drawn sprite.
- Lighthouse beacon geometry no longer lands on the lantern.
- Sail-logo offsets no longer fit a replacement ship sprite.
- A prototype or remote URL leaks into runtime paths.
- Too many critical assets slow first render; keep first-render priority narrow.
- Deferred scenery promoted into the critical set without an initial-frame reason.
