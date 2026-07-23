# PharosVille Runtime Media Pipeline

Last updated: 2026-07-24

The production Three.js world has two authored media inputs: same-origin
stablecoin logos and one lighthouse GLB. Everything else is procedural
geometry, material, shader, or DOM UI.

## Runtime Inventory

| Media | Source | Owner | Failure behavior |
| --- | --- | --- | --- |
| Ship logos | `world.ships[].logoSrc` | `useAssetLoadingPipeline` | deterministic symbol mark |
| Lighthouse shell | `public/pharosville/models/garden-lighthouse-shell.glb` | `garden-models.ts` | procedural lighthouse shell |
| Sail textures | generated in memory | `garden-sail-texture.ts` | livery and symbol remain |
| Island, docks, ships, landmarks, water, ambient life | procedural | `src/three/` | part of renderer code |

Runtime URLs must be same-origin. Do not add API keys, signed generation URLs,
prototype paths, or remote tool output to browser code.

## Logo Rules

- The React asset pipeline accepts only ship logo paths beginning with `/`.
- Logo loading is abortable and cached by source URL.
- Image failure must not block the world or leave a blank identity sail.
- Sail textures use stablecoin livery, a high-contrast matte, and the decoded
  logo when available; the short symbol is the deterministic fallback.
- Docks, graves, and scene decoration do not use the React image asset hook.
- A logo change needs focused sail-texture tests and browser review at Overview
  and Explore scale.

The generated Three.js `CanvasTexture` is an in-memory texture implementation,
not a separate world renderer or a network asset inventory.

## Lighthouse GLB

The canonical artifact is:

`public/pharosville/models/garden-lighthouse-shell.glb`

Its contract lives in `src/three/garden-models.ts`:

- cache-busted same-origin URL;
- exact byte size and SHA-256;
- base-center origin and unit scale;
- named beacon, beam, label, and selection anchors;
- dimensions and pick proxy;
- draw-call, material, texture, triangle, and vertex budgets;
- agent-authored provenance and license.

The source of truth is the deterministic generator:

```bash
node scripts/pharosville/generate-garden-lighthouse.mjs
npm run check:garden-models
```

Do not hand-edit the binary. Change the generator, regenerate the artifact,
update metadata only when the output intentionally changes, and run the check.

The scene creates a procedural shell before the asynchronous GLB load. Keep
that shell aligned with the GLB anchors so failure does not move the beacon,
beam, selection cue, or detail label.

## New Model Decision

Add another GLB only when all are true:

1. procedural geometry cannot produce the required silhouette or material;
2. the object matters at normal camera distance;
3. the model has a clear owner, license, origin, scale, anchors, and pick proxy;
4. draw, material, texture, triangle, vertex, and byte budgets are explicit;
5. failure has a deliberate procedural or DOM behavior.

Do not add a model campaign to solve color, lighting, spacing, or texture
framing problems. Those belong in the current renderer first.

## PixelLab And Generated Images

PixelLab and image generation are useful for visual exploration, reference
sheets, and composition studies. Save scratch outputs under `outputs/`.
Generated raster images are not runtime assets by default.

To translate an approved concept into production:

1. identify the minimum shape, palette, and material decisions;
2. implement them in procedural Three.js code or the deterministic model
   generator;
3. preserve analytical color semantics and logo legibility;
4. validate at the production camera and GPU budget.

See `PIXELLAB_MCP.md` for the reference-image workflow.

## Archived Raster Inventory

`public/pharosville/assets/manifest.json` and its PNG/WebP files are retained as
historical authoring material. The production browser does not request that
manifest or use its critical/deferred phases.

`npm run check:pharosville-assets` remains in the repository validation lane
until that archive is deliberately removed. Its budgets describe the archived
inventory, not current runtime loading.

## Validation

For a logo or sail change:

```bash
npm test -- src/three/garden-sail-texture.test.ts
npm run test:visual
```

For lighthouse/model changes:

```bash
npm run check:garden-models
npm test -- src/three/garden-models.test.ts
npm run test:visual
npm run test:perf
```

For a new runtime URL or loading-boundary change also run:

```bash
npm run check:viewport-gate
npm run build
npm run check:bundle-size
```
