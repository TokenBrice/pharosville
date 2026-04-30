# Image Tooling Notes

Last updated: 2026-04-30

Concise reference of what we learned about asset generation/editing tooling
during the lighthouse-integration iteration. Companion to `PIXELLAB_MCP.md`
and `ASSET_PIPELINE.md`. Read those for the canonical workflow; this file
captures *gotchas* we paid for so future passes don't pay them again.

## Tool selection at a glance

| Need | Tool | Why |
| --- | --- | --- |
| New full-canvas runtime asset, ≤ 400×400 | `mcp:create_map_object` (basic mode) | Only PixelLab path that handles non-square at 400×320 |
| Multi-candidate review of small object, ≤ 256×256 | `mcp:create_object(directions:1, n_frames: 4|16|64)` | Returns N variations in one consistent style |
| In-place rewrite of an existing PNG region | OpenAI `gpt-image-2.../v1/images/edits` | True inpaint; PixelLab inpaint generates standalone objects, not rewrites |
| Region edits ≤ 192×192 with style anchoring | `mcp:create_map_object` (inpaint mode) | Bounded but useful for tile-scale fixes |
| Pixel-precise post-processing | ImageMagick (`magick`) | Deterministic; alpha-key, mask, feather |
| Lighthouse base / small surrounding terrain | Procedural renderer constants | No asset budget, no API, infinitely tweakable |

## PixelLab MCP gotchas

- `create_map_object` has **two modes**: basic (no `background_image`, max 400×400)
  and style-matching (`background_image` provided, max **192×192**). Inpaint
  cannot be used at full overlay size (400×320).
- Inpaint mode produces a **standalone object** to be composited onto the map,
  not an in-place pixel rewrite. The `background_image` is style/spatial
  context only. Don't use this when you want to remove a feature from an
  existing image.
- Output background is **solid teal**, not transparent, despite
  `transparentBackground: true` in style defaults. Always alpha-key in
  imagemagick (sample the corner pixel to get the exact teal: typically
  `rgb(33,112,134)` or `rgb(41,128,131)` ± fuzz).
- Output occasionally embeds an **artist signature watermark** ("DRNFCT" or
  similar) in the lower-right corner. Mask out via imagemagick.
- Prompt-level **transparency / empty-region constraints are unreliable**.
  PixelLab always generates a cohesive vignette regardless. Enforce
  empty regions programmatically in the imagemagick safety pass.
- Style/composition biases worth knowing:
  - "Observatory" → towers/spires
  - "Mediterranean" → warm sand palette unless cool hex codes are explicit
  - "Wide" / "fills entire canvas" → respected when included clearly
  - "FLAT", "no spire", "no tower" → respected; multiple negation phrasings help
- **Seed is supported only on** `create_isometric_tile`, `create_sidescroller_tileset`,
  `create_tiles_pro`, `vary_object`. NOT on `create_map_object` or
  `create_object`. Reproducibility for map-object generations isn't possible.
- Output **size is best-effort**. Even with `width/height` set, a square
  return is possible. Always post-crop/pad in imagemagick.
- `n_frames` only on `create_object` (square only, max 256), and only with
  `directions: 1`. Valid values: 1, 4, 16, 64. Returns a `review`-status
  object; promote keepers via `select_object_frames` or drop with
  `dismiss_review`.

## OpenAI Images API gotchas

- Available models on the account: `dall-e-2`, `dall-e-3`, `gpt-image-1`,
  `gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2`,
  `gpt-image-2-2026-04-21` (latest dated snapshot), `chatgpt-image-latest`.
  **Use the latest dated snapshot when image quality matters** —
  `gpt-image-1` is superseded.
- `POST /v1/images/edits` is the inpaint endpoint. Send `image` + `mask` +
  `prompt`. Response: JSON with `data[0].b64_json` (base64-encoded PNG).
- **Mask convention is the OPPOSITE of PixelLab's**:
  alpha=0 (transparent) = "inpaint here", alpha=255 (opaque) = "preserve".
  Mask must be RGBA.
- Supported sizes: `1024x1024`, `1024x1536`, `1536x1024`, `auto`. Pixel
  art needs **upscale → edit → downscale**, with `-filter point` (nearest
  neighbor) on both legs to preserve pixel grid.
- Aspect mismatch (e.g., 400×320 = 1.25 ratio) requires letterbox padding.
  Use 1024×1024 with transparent padding at bottom; the model respects the
  alpha boundary.
- The model tends to **over-smooth pixel-art edges and propagate "no X"
  prompts beyond the masked region** (e.g., a "no tower" prompt with a mask
  brushing a nearby building can erase the building too). Use surgical
  custom masks, not generous oval/rectangle masks.

## ImageMagick recipes

```bash
# Alpha-key a solid background to transparent
magick in.png -fuzz 12% -transparent "rgb(R,G,B)" out.png

# Punch an RGBA mask region transparent (compose Clear via -draw is unreliable —
# use a stencil + CopyOpacity instead)
magick -size WxH xc:white -fill black -draw "rectangle X1,Y1 X2,Y2" stencil.png
magick -size WxH xc:black stencil.png -alpha off -compose CopyOpacity -composite mask.png

# Feather the perimeter alpha (gaussian blur on alpha channel)
magick in.png -channel A -blur 0x1.6 +channel out.png

# Hard-zero alpha in a region (then any later feather doesn't soften the
# boundary if applied to the whole image — apply feather first, then hard mask)
magick in.png -region WxH+X+Y -channel A -evaluate set 0 +channel +region out.png

# Pixel-art-safe upscale / downscale
magick in.png -filter point -resize 1024x819 out.png

# Letterbox into a square (transparent padding, content at top)
magick in.png -background transparent -gravity North -extent 1024x1024 out.png
```

Always use `magick` (IM7 native), not `convert` (deprecated).

## Procedural renderer takeaways

- Layered diamond drawing (`drawDiamond` + `drawTileLowerFacet`) is the
  pattern for terrain mounts: shadow → cliff → grass crown → stone cap.
- Diamond sizes scale linearly with `camera.zoom` already; constants are in
  base pixels.
- A grounding mount needs the **cliff diamond ≥ ~110×46** at base scale to
  read as substantial under a 320×320 lighthouse PNG. Smaller (74×30) reads
  as a pebble.
- Foam ring is just an additional ellipse with cool teal at moderate alpha
  drawn just below the contact shadow.
- Vegetation tufts (small dark-green ellipses on the grass crown) channel
  the inspiration aesthetic at low cost.
- Procedural is **the lowest-blast-radius path** when the change is local
  to a single landmark and the surrounding overlay is acceptable.

## Architectural decision frame

When the visible problem is at a single landmark (e.g., the lighthouse
floating on a sandy plateau), three paths in increasing scope:

1. **Procedural-only (smallest blast radius)** — tune `drawXxxHeadland` and
   accent constants. Touches one renderer file. Visual snapshots regenerate.
   No asset budget impact. Deterministic. Choose this first when the
   landmark itself is fine; only its surrounding terrain reads broken.

2. **Asset edit (medium)** — surgical edit of an existing PNG via
   imagemagick (alpha-key, mask, color curves) or OpenAI inpaint with a
   tight mask. Touches the asset, manifest provenance, snapshots. Preserves
   architecture.

3. **Asset regeneration (largest)** — full from-scratch PixelLab generation
   plus imagemagick safety pass plus manifest update plus possible renderer
   constant tuning. Multiple iteration rounds typically needed. Reserve for
   when the existing asset has fundamental composition flaws.

The lighthouse-integration iteration tried (3) first across multiple
rounds, found that PixelLab's compositional output was hard to steer
toward the user's mental model, and shipped (1) — which addressed the
core complaint with a one-file renderer change. Lesson: try (1) before (3)
when the landmark itself is fine.
