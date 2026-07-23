# Image Tooling Notes

Last updated: 2026-07-24

These are reference-image lessons from earlier visual exploration. Current
runtime media rules live in `ASSET_PIPELINE.md`; generated images stay under
`outputs/` unless a separate production decision is approved.

## Tool Selection

| Need | Tool | Use |
| --- | --- | --- |
| Composition or full-scene reference | PixelLab map object or image generation | operator-facing concept only |
| Small silhouette variations | PixelLab object variations | compare shapes before procedural implementation |
| Edit a reference-image region | image editing/inpaint | refine the reference, not production runtime |
| Pixel-precise cleanup | ImageMagick | deterministic crop, alpha, resize, or documentation media |
| Production water, light, material, or layout | Three.js code | validate in the actual camera and GPU budget |
| Production lighthouse shape | deterministic GLB generator | preserve manifest anchors and budgets |

## PixelLab Lessons

- Basic map-object mode and style-matching/inpaint mode have different size
  limits; verify the active tool contract before requesting output.
- Inpaint output may be a standalone object rather than an in-place rewrite.
- Transparency, dimensions, empty regions, and reproducibility can be
  best-effort rather than exact.
- Inspect for solid background keys, signatures, unexpected text, and overly
  cohesive vignettes.
- PixelLab tends to add towers for "observatory" and warm sand for
  "Mediterranean"; specify the intended jade/teal water, pale stone, planting,
  and low silhouette directly.
- Keep corporate logos, analytical colors, labels, and UI out of generated
  references.

## ImageMagick Recipes

```bash
# Alpha-key a solid background
magick in.png -fuzz 12% -transparent "rgb(R,G,B)" out.png

# Feather alpha
magick in.png -channel A -blur 0x1.6 +channel out.png

# Pixel-art-safe resize for historical reference material
magick in.png -filter point -resize 1024x819 out.png

# Remove metadata for documentation media
magick in.png -strip out.png
```

Use `magick`, not deprecated `convert`.

## Production Decision Frame

When a reference exposes a visible problem, choose the smallest production
change:

1. tune existing Three.js composition, material, light, shader, or geometry;
2. add a small deterministic procedural helper;
3. change the lighthouse generator if its actual silhouette is wrong;
4. propose a new model only when procedural geometry cannot deliver the
   approved form within budget.

Do not add a raster runtime layer or a model campaign to reproduce a reference
image literally. The reference is evidence for a visual decision, not an
artifact contract.
