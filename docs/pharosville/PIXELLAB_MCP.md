# PharosVille PixelLab MCP Workflow

Last updated: 2026-04-30

Use this when generating or regenerating PharosVille sprites with PixelLab MCP.
It extends `ASSET_PIPELINE.md`; it does not replace the manifest, renderer, or
visual-invariant rules.

## Security And Scope

- PixelLab is configured through MCP. Use the `mcp__pixellab__*` tools directly.
  Do not treat `https://api.pixellab.ai/mcp` as a normal REST API.
- Official MCP tool reference: `https://api.pixellab.ai/mcp/docs`.
- The PixelLab token may exist in `.env.local`, but it must never be printed,
  copied into docs, committed, embedded in prompts, or exposed as `VITE_*`.
- PixelLab download URLs and job IDs are generation provenance only. Runtime code
  must use local PNG files under `public/pharosville/assets/` and manifest IDs.
- Keep candidates in scratch space such as `outputs/pharosville/pixellab-prototypes/`
  until a specific PNG is accepted for runtime.
- If MCP tools are unavailable, say PixelLab MCP is not configured. Do not fall
  back to unauthenticated curl calls against MCP endpoints.

## Tool Choice

Use the smallest tool that matches the asset class:

| Need | Preferred tool | Notes |
| --- | --- | --- |
| Standalone landmarks, docks, ships, memorial props | `create_map_object` | Best for transparent PNGs with explicit width/height. Good default for production sprite candidates. |
| Multiple static object candidates in one style | `create_object` with `directions: 1`, `n_frames: 4` or `16` | Produces review packs. Use `get_object`, then `select_object_frames` for keepers or `dismiss_review` for rejects. |
| Terrain tile packs for renderer-controlled semantics | `create_tiles_pro` | Number each requested tile in the prompt. Use the same seed and style anchor for related terrain. |
| Wang/autotile terrain transitions | `create_topdown_tileset` | Use only when a future renderer or tooling path needs corner-based transition sets. Chain with base tile IDs for continuity. |
| Small isometric probes or one-off blocks | `create_isometric_tile` | Useful for quick style tests, but production PharosVille objects usually need non-square dimensions from `create_map_object`. |
| Characters and character animation | `create_character`, `animate_character` | Usually out of scope for PharosVille. Get explicit product intent before adding character-like entities. |
| Object animation | `animate_object` | Use only when renderer support and reduced-motion fallback are planned. Static `path` remains required. |

Deletion tools are destructive. Use them for obvious smoke-test cleanup or
discarded review assets only when the target ID is unquestionably generated for
the current task.

## Base Prompt

Start production prompts from the manifest style anchor:

```text
old-school 16-bit maritime isometric RPG pixel art, crisp pixel edges, low top-down view, deep navy and teal sea, pale limestone and terracotta island city, bronze and gold beacon light, restrained analytics palette, readable silhouettes, no text, no logos, no UI
```

Then add object-specific constraints:

- Include the intended category and role: dock, harbor infrastructure, ship,
  cemetery marker, terrain tile, overlay, or landmark.
- Name materials: pale limestone, oxidized bronze, dark timber, cream sail cloth,
  teal water-bounce edge light, warm lantern, foam, rope, crates, posts.
- Specify transparent background for standalone objects.
- Keep analytical overlays out of the PNG. No text, token badges, chain names,
  UI panels, counts, labels, logos, or status colors baked into sprites.
- For ships, reserve a clean sail or pennant area for runtime logo marks.
- For docks, include waterline contact, posts, stairs, rope/crate clutter, and
  dark contact shadow so the sprite reads as infrastructure, not a sticker.
- For terrain, keep texture subtle because renderer overlays preserve DEWS and
  route semantics.

Recommended production defaults:

```text
view: low top-down
outline: single color outline
shading: medium shading
detail: medium detail
```

Use explicit dimensions that match the intended manifest footprint. Current
common sizes are 64x64 terrain tiles, 96x64 compact docks, 104x80 ships, 224x160
large harbor pieces, and 320x320 landmarks, but verify against the actual sprite
slot before generating.

## Generation Loop

1. Read `ASSET_PIPELINE.md`, `VISUAL_INVARIANTS.md`, the manifest entry to be
   replaced or extended, and the renderer code that consumes its geometry.
2. List recent PixelLab assets first when continuing prior work:
   `list_objects`, `list_tiles_pro`, `list_topdown_tilesets`, or
   `list_isometric_tiles`.
3. Queue candidates with one or two tightly scoped prompts. Prefer review packs
   over many unrelated one-off generations when exploring object variations.
4. Poll with the matching `get_*` tool until status is completed, failed, or
   review. MCP generation is asynchronous; creation tools return job IDs before
   images are ready.
5. For review objects, inspect candidates through `get_object`. Promote only
   selected frames with `select_object_frames`; discard unusable packs with
   `dismiss_review`.
6. Download selected PNGs into scratch space, not runtime paths. Use
   `curl --fail` for PixelLab download URLs so pending-job JSON or HTTP errors
   are not saved as PNG files.
7. Inspect actual dimensions, transparency, silhouette, scale, contact shadow,
   and style match against `landmark.lighthouse`.
8. Promote only chosen PNGs to `public/pharosville/assets/...`.
9. Update `manifest.json` dimensions, anchor, footprint, hitbox, load priority,
   `tool`, and `promptProvenance`. Bump `style.cacheVersion` when bytes or
   geometry change.
10. Run the focused checks in `ASSET_PIPELINE.md` and visual checks when geometry
    or visible pixels changed.

## Provenance Notes

Every promoted generated asset should record:

- PixelLab tool name, such as `mcp:create_map_object`.
- PixelLab job ID or promoted object/tile ID.
- Seed when provided.
- `styleAnchorVersion` matching the manifest style anchor used for prompting.
- Any review selection detail worth preserving in a plan or handoff note.

Do not put API tokens, bearer headers, temporary local download commands, or
remote image URLs in the manifest.

## Quality Gate

Reject candidates that have:

- embedded text, UI, logos, status badges, or chain names
- soft antialiasing, painterly edges, photorealistic rendering, or blurry scale
- a style that reads as generic fantasy village rather than Pharos maritime
  observatory
- no dark contact shadow or unclear waterline/ground contact
- insufficient transparent margin for the manifest anchor and hitbox
- baked analytical colors that would compete with renderer-controlled DEWS,
  ledger, ship-risk, or cemetery semantics
- ship sails/pennants too busy for runtime logo marks

When in doubt, keep the asset out of runtime and document what failed.
