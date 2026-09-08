# Sky / seam defects review

## Verdict

The “sky” visible in the locked orthographic view is not the sky dome: it is a 1,200-unit horizontal two-triangle plane underneath the finite map. That workaround is the common root of the void and seam, while a separate half-resolution tilt-shift kernel explains the suspiciously exact inset frame. Noon then stacks three warm atmospheric operations plus a warm grade, suppressing value separation. These are defects in composition architecture, not parameters worth nudging.

## Findings

### DEFECT A — cream void and hard diagonal plate seam

**Observed.** `noon-wholemap.png @ right half`: map water/land ends on a sharp isometric diagonal against a textureless cream field. `dusk-close.png @ upper right`: the same straight cream/blue break survives dusk.

**Root-cause chain.** The real sphere exists, but is explicitly hidden and retained only as a PMREM/material owner (`garden-sky.ts:444-450`). The visible replacement is `garden-sky-backdrop`, a finite `PlaneGeometry(1200,1200)` rotated horizontal at world Y=-2 (`garden-sky.ts:454-470,564-569`). Its shader uses screen Y, but everything below 0.62 is simply `uLower`; all gradient transitions are compressed into 0.62–1.0 (`garden-sky.ts:515-524`). Therefore exposed plane below/along the map is a flat field, not distant sky.

The map/rim is finite. Decorative land extends only beyond camera-near south/east boundaries; water boundary stretches remain water and north/west get no skirt (`garden-rim-mesh.ts:335-354,411-424`). Sampling likewise stops at `MAP_SIZE + GARDEN_PLATE_MARGIN_TILES` (`garden-rim-mesh.ts:502-514`). At the geometry boundary, ordinary depth testing switches in one pixel from opaque plate to opaque backdrop: the backdrop has no edge-distance fade, and `fog:false` (`garden-sky.ts:468-471`). Height fog cannot soften that silhouette: it mixes RGB on patched standard materials, never alpha (`garden-height-fog.ts:152-171,223-268`). The linear fog is view-scaled and capped at 1.5 specifically to reach the wide edge (`garden-sky.ts:89-133,875-898`), but matching fog colour cannot hide a geometric coverage discontinuity.

It stays cream in both phases because the exposed lower 62% always resolves to `uLower`: day is gold-cream horizon blended 32% toward day zenith, while dusk is ember blended 42% toward fog blue (`garden-sky.ts:241-263`), selected by the same phase lerp (`garden-sky.ts:761-768`). The two palettes differ, but both are warm/light and the lower field has no texture or depth cue.

**Fix sketch.** Delete the horizontal visible-sheet illusion. Render a camera-centred, depth-last sky dome/fullscreen analytic sky with the existing day uniforms, then extend the sea beyond the playable plate as a camera-following annulus (same water shader, no gameplay/placement), fading waves/reflection into horizon fog over 40–80 world units. Add a soft depth/alpha transition at the playable sea boundary; let distant borrowed hills overlap that transition. This cleanly separates “sea” below the horizon from “sky” above it.

**Cost/risk.** +1 sea draw, roughly 2–8k tris, 0 textures, estimated <0.2 ms; M. Risk: orthographic horizon placement across zoom/aspect and transparent ordering. Displaces the backdrop plane and its lower-stop workaround; re-pin `garden-sky.test.ts` from exact backdrop/stops to continuous coverage and phase-correct horizon. Coordinate with water/shore lanes.

### DEFECT B — ~12 px inset rectangle

**Observed.** All three frames show a faint axis-aligned rectangle about 12 px inside all four edges. Its straight sides and square corners rule out the radial vignette: that uses `distance(uv,.5)` and a broad 0.35–0.85 smoothstep (`garden-post.ts:415-431`). N8AO is half-resolution (`garden-post.ts:1608-1630`), but AO would follow scene depth/occluders rather than draw the same full-frame geometric contour.

**Root cause.** The custom tilt-shift makes a half-resolution two-pass blur (`garden-post.ts:735-782,898-913`) and composites it back wherever depth-derived CoC is nonzero (`garden-post.ts:795-819`). Its largest tap is `3.230769 × DOF_BLUR_SPREAD(2)` half-res texels (`garden-post.ts:683-696,735-737`) = **6.46 half-res ≈ 12.92 full-resolution pixels**. At each target boundary those taps cross the image edge and clamp to edge texels (render-target default), changing kernel support over precisely the observed inset width; two separable axes produce a rectangle. Strength 0.6 makes the contamination faint (`garden-post.ts:773-782`).

**Fix sketch.** In the blur shader mirror UVs at boundaries (or pad the blur target/kernel by 7 half-res pixels and crop); do not merely shrink strength. Verify by A/B disabling only tilt-shift, then N8AO. Cost 0 draws/tris/textures, negligible ALU; S. Risk: mirrored corners may reveal bright off-frame streaks. Re-pin `garden-post.test.ts` around bounded/mirrored UV sampling and the 13 px kernel footprint; keep the existing vignette contract unchanged.

### DEFECT C — noon beige wash

**Observed.** `noon.png @ whole frame`: teal water and cream masonry converge toward a milkier beige-green plane; contrast drops with distance, while local highlights are globally honey-tinted.

**Root-cause stack at clear noon** (`daylight=1,dusk=0,storm=0`):

1. **Linear fog:** near = `124 × fogScale`; far = `(336 + 20) × fogScale`, with scale clamped 1.21–1.5 (`garden-sky.ts:93-133,875-898`). It mixes far geometry toward the warm day fog colour; the authored note says far water reaches substantial haze and cites ~0.36 at depth 250 (`garden-sky.ts:39-47,890-895`).
2. **Height fog:** every patched standard material receives a second exponential mix after Three fog (`garden-height-fog.ts:18-26,253-267`). At noon it selects the day preset density/falloff/horizon/sun-tint/zenith exactly, with storm multiplier 1 (`garden-height-fog.ts:60-114`); factor is `1-exp(-density*exp(-(y-sea)*falloff)*distance)` (`garden-height-fog.ts:117-127`). Thus sea-level objects get the strongest second warm mix.
3. **Day mist remains on:** density 0.12 and opacity `0.12 × .55 × (0.95..1.05)` = **0.0627–0.0693** before billboard radial/distance fades (`garden-sky.ts:924-955`).
4. **Warm parametric grade:** gain `[1.04,1,.95]`, lift `[.004,.004,.007]`, highlight tint `[1.12,1.03,.82]`, split .45, saturation 1.12 (`garden-post.ts:242-255`), applied globally as gain+lift then luma-based tint (`garden-post.ts:415-426`). The LUT then applies the 100% day band when loaded (`garden-post.ts:611-619,1851-1859`). Day AO is only 3, so it cannot restore large-scale separation (`garden-post.ts:280-289`).

**Fix sketch.** Establish one atmosphere owner: retain linear depth fog for aerial perspective; reduce or remove global height fog from sea-level hero materials and reserve localized height fog for actual banks. Make noon mist opt-in to distant anchors only. Re-author the day grade/LUT around neutral whites and blue-green water, moving honey warmth into direct sun rather than every highlight. Cost 0 draws/tris/textures and likely faster; M due palette re-authoring. Risk: distant edge reappears until Defect A is fixed. Re-pin `garden-sky.test.ts` fog-factor/horizon continuity and `garden-post.test.ts` day grade/LUT values; do not tune this independently of the infinite-sea fix.

## Ranked step-change ideas

1. **Infinite sea + true analytic sky** (above). Highest leverage; +1 draw, 2–8k tris, 0 tex, <0.2 ms; M. Displaces backdrop sheet.
2. **Visible celestial composition:** render an actual sun disc/corona on the visible sky and phase-linked moon/stars, all from existing sun/moon bearings. +2–3 draws, <1k tris, 0–1 tex, <0.15 ms; M. Re-pins sky projection tests; displaces sheet-space fake glows.
3. **Low, sparse cloud scroll:** 2–3 broad camera-facing procedural cloud layers with parallax and phase lighting, not pills. +1 instanced draw, <200 tris, 1 small noise texture, ~0.1–0.25 ms; M. Replaces disabled cumulus and some mist attention.
4. **Hills meet atmosphere:** expand the three ridge profiles into wraparound, depth-faded silhouettes whose feet disappear into the sea horizon rather than a fog strip (`garden-horizon.ts:50-72,105-127,197-212`). +1 draw retained, modest tris, 0 tex; M. Displaces the current thin mist base.
5. **Weather horizon states:** cloud bank/rain veil changes horizon visibility while preserving the same sea/sky geometry. +1 draw, 1 noise tex, ~0.2 ms; L; depends on weather/data-story lanes and displaces generic global storm tint.

## Rejected

- Increase fog until the seam vanishes: hides the map and repeats the noon wash.
- Enlarge the cream plane: changes where its outer edge lies, not the plate/plane coverage break.
- CSS border removal for Defect B: geometry and exact 12.9 px kernel footprint implicate tilt-shift; isolate-pass A/B first.

## Cross-lane notes

Water owns the horizon annulus shader continuity; sky owns projection and phase palette; post owns the mirrored blur fix. Art direction should choose the horizon line and cloud silhouette before fog/grade are re-authored, otherwise each lane will compensate for the others again.
