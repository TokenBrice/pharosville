# Classical town exploration — shared brief (2026-10-15)

Operator: "the buildings overall feel too modern compared to the magnificent classical lighthouse. Explore a less
contemporain vibe for the houses, harbours, and buildings like the mint and co."

Today the town is "Northern Light": Scandinavian clapboard houses with dormers, slate roofs, gambrel/Dutch-gable/Tudor
offices, a Victorian brick-chimney Mint. The hero is the Pharos of Alexandria (public/harbour/lighthouse.glb, ~100 m).
Baseline inventory: agents/2026-10-13-pharosville-reboot/p6/civic/civic-sheet-golden.jpg (LOOK at it).

## Deliverable per direction (exploration only — NO production changes)
Folder: agents/2026-10-15-classical-town/<direction>/
- frames.py — a standalone Blender script (blender -b --factory-startup -P frames.py) that builds style-frame buildings
  with the existing civic primitives (scripts/harbour/blender/civic/cv_lib.py: Kit, PAL, gable_roof, hip_roof, colonnade,
  arcade, pediment, dome, window, door, stairs, crest_panel ...) and renders them with the SAME preview look as
  scripts/harbour/blender/civic/lineup.py (style C kit material, AgX, golden-hour sun). Reuse/import from lineup.py's
  setup by copying the minimal material/world/camera code; do not edit any file under scripts/ or src/.
- Buildings to author (style frames, not production-complete; 1–4k tris each like today):
  1. a pair of town houses (the residential quarter, 7–11 m tall)
  2. the Ethereum harbour office — MUST keep: crest panel on facade (hb_crest), chain-tinted awning/canopy (hb_cover),
     flag pole with a `flag_pole_top` empty. Say how the other 7 chains would differ in this style (one line each max).
  3. the Mint — MUST keep the data affordances: smoke emitters (`chimney_N` empties/stacks; they need not be brick
     factory chimneys), furnace mouths (`furnace_glow` mesh, hb_emissive), stamping presses (`press_N`), a `wheel`.
  4. the Burn (a fire on a small islet today) — MUST keep a `fire_core` and a big readable flame.
- Renders (EEVEE, 32 samples is fine), into the same folder:
  - lineup-golden.jpg (1600x1000): the real Pharos GLB imported at true scale at the back, your buildings on a quay
    in front, camera like the runtime (pitch ~34°, high oblique). The Pharos must still dominate.
  - sheet-golden.jpg: the four subjects framed individually (2x2), labelled.
  - one night lineup is a bonus, not required.
- LOOK at every render (Read the jpg) and iterate at least twice on proportions/palette before reporting.

## Shared art rules
- Pre-industrial and pre-modern: no slate, no clapboard, no dormers, no brick factory chimneys, no sash windows with
  white Georgian trim, no awnings that read as shop-front vinyl (use cloth canopies/velaria on poles instead).
- Must sit with the Pharos: warm limestone/stucco, terracotta tile, bronze, painted accents. The Pharos stays the
  only monument; the town is quieter and lower.
- Crafted-miniature low-poly look as today (flat-ish shading, vertex colours, pattern ids). Chain colours stay legible.
- Never launch a browser. Blender only. No commits. Write only inside your direction folder (+ outputs/ scratch).

## Report (under 250 words, no file dumps)
Paths of the renders; 3–5 bullets on the design language; what was hard; how data affordances map; tri counts.
