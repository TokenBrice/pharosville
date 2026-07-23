# PixelLab Reference Workflow

Last updated: 2026-07-24

PixelLab is a concept and reference tool for the current Three.js world. It is
not a production runtime dependency and its output is not automatically copied
into `public/`.

## Good Uses

- compare lighthouse, ship, dock, or garden silhouettes;
- explore restrained maritime palettes and material combinations;
- create a composition reference for the Garden Observatory;
- test whether a proposed visual direction is legible at the production camera;
- produce small mood or detail sheets for operator review.

PixelLab is not needed for:

- stablecoin logos;
- water, lighting, fog, or shader tuning;
- DOM UI;
- ordinary procedural geometry changes;
- direct generation of production GLB files.

## Prompt Frame

Anchor prompts to the intended experience:

```text
poetic maritime observatory, Japanese-garden restraint, asymmetric island
composition, pale limestone, varied green planting, warm lighthouse beacon,
calm jade and teal water, distinct stablecoin sail identities, low isometric
camera, generous negative space, no text, no UI, no corporate logos
```

Ask for one decision at a time: silhouette, material, planting, shoreline, or
composition. Large all-in-one scene prompts are harder to translate into
maintainable code.

## Output Handling

1. Save candidates under `outputs/`.
2. Record the prompt, tool, date, and intended decision.
3. Compare candidates at the same aspect ratio as the production world.
4. Ask the operator to approve a direction, not raw production use.
5. Translate only the approved visual decisions into `src/three/` or
   `scripts/pharosville/generate-garden-lighthouse.mjs`.
6. Validate the resulting runtime, not the reference image.

## Rejection Rules

Reject candidates with:

- baked labels, analytics, logos, UI, or status colors;
- atmospheric beauty that hides the actual object or world layout;
- geometry that requires excessive materials or draw calls;
- a centered theme-park composition instead of the framed asymmetric garden;
- ornamental density that removes navigable water or analytical clarity;
- unclear provenance or usage rights.

## Production Boundary

The current browser media contract remains:

- logo images from same-origin world data;
- the deterministic lighthouse GLB;
- renderer-owned procedural geometry and materials.

Any proposed new media type must go through `ASSET_PIPELINE.md`; a PixelLab
result alone is not approval to add a runtime asset.
