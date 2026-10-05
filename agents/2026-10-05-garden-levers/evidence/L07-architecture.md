# L07 — Architecture & props

## Verdict
The biggest gap is **architectural craft at the garden/harbour scale, not a missing Japanese-themed prop inventory**. The Pharos has articulated masonry and a memorable silhouette; subordinate buildings and fixtures read as planar modelling primitives, so the intended Japanese threshold does not convincingly mediate the monumental tower and fleet. Keep the Pharos as the singular non-Japanese brand object, but make the surrounding architectural language materially and spatially credible.

## Evidence

1. **Confirm H1 in this lens, but refute “flat roofs” literally.** In `outputs/holistic/day.png` (left third), the pale hall has a pitched hip roof and the nearer shed has pitched slopes; nevertheless their broad uninterrupted faces and rectangular trim read as generic slab buildings. This persists in `day-1200x640.png` (left middle). The code already authors irimoya, stacked inn roofs, deep eaves, charred cedar, plaster and a moon window (`src/three/garden-docks.ts:1084-1116,1171-1203`). Missing terminology is not the cause: the irimoya field is two quad slopes plus triangular ends, with box fascias and a single broad slope course (`garden-docks.ts:1472-1537`). **[INFERENCE]** More labels/feature-count assertions will not create cultural recognition at rest.
2. **The tower is the strongest architecture, with an obvious fidelity mismatch.** `day.png` (centre-right) shows coursed stone, deep apertures, balconies, small bronze figures and an open crown; nearby buildings have almost no comparable surface articulation. The generator already builds mortar relief and geometry-aware baked occlusion (`scripts/pharosville/generate-garden-lighthouse.mjs:94-110,1222-1228`). The runtime swaps GLB for aligned shell and carries beacon/beam anchors (`src/three/garden-lighthouse.ts:135-169`). Replacing it with a Japanese pagoda would discard a functioning brand hero rather than fix the mismatch.
3. **The Japanese architectural threshold is largely outside the picture.** Foreground engawa boards exist, but the tea-house body/posts/eaves are explicitly placed off-frame (`src/three/garden-threshold.ts:454-483`); only a dark horizontal deck band is visible in `day.png` (bottom edge). The island “shoin precinct” is a narrow open engawa with a flat 0.12-unit roof, stone opening and parapet, not a legible shoin building (`src/three/garden-precinct.ts:77-99`). The island chaseki is one wall box, four posts and a hipped roof (`src/three/garden-island.ts:1690-1704`). **[INFERENCE]** The blend can work as a Japanese viewing garden overlooking Pharos; it currently reads more like Japanese vocabulary attached to a harbour model. This supports H2's featureless foreground diagnosis, without requiring another building in the inlet.
4. **Materials erase useful distinctions.** Harbour stone, roof and walls use constant roughness, vertex colour and flat shading; roof and accent even share a material branch (`src/three/garden-harbor-batch.ts:255-268`). Thus tile, plaster and stone lack differentiated microstructure/specular response. The current loader intentionally accepts a textureless static GLB subset, with no VEC2 accessor size (`src/three/garden-models.ts:543-571`): an ordinary textured Blender GLB is not a drop-in upgrade.
5. **Lantern forms exist but do not read.** Stations already have instanced Kasuga-style base/shaft/platform/cap/jewel (`src/three/garden-docks.ts:224-277`); the foreground has an oki-dōrō with a real small fire-chamber opening (`garden-threshold.ts:485-516`). In `day.png` (bottom-left centre) it reads as a squat dark box; in `night.png` it is almost only a square ember. Confirm H3 for subordinate architecture: night loses bodies and eaves, although the beacon/tower remain legible. This is a framing/light/material issue, not permission for a glowing lantern collection.
6. **Existing identities and batching are valuable.** Chain nobori supply physical signage and DOM records preserve exact meaning (`docs/pharosville/CONTRACTS.md:111-114,322-330`). The station recipe carries footprints, root matrix, flag, noren, cargo lanes and kindling (`garden-docks.ts:180-206`); its nine-type test expects 15 shared drawables (`src/three/garden-harbor-batch.test.ts:93-110`). Day metrics report 179 calls and GPU frame p95 3.17 ms on the captured machine (`outputs/holistic/day.json:30,52-56`), but this does not establish Apple M5 Pro allowance.

## Levers — ranked

### 1. Author a roof-dominant architectural kit · Impact 5/5 · Effort L
**Change:** Replace the slab grammar in `garden-docks.ts` with a small authored kit: believable irimoya/hip/gable profiles, modest eave sag/curvature, tile ridge/end courses, deep exposed rafters, recessed timber bays and plaster panels. Use chashitsu-like open verandas where appropriate and kura-like storage massing where appropriate—not identical ornate temple roofs. Extract static kit geometry into the existing `DockRecipe` buckets; repeat structural bays/endcaps rather than stretching detailed joins with supply frontage. Preserve the existing quay/berth topology.

**Why:** Changes silhouettes, cast shadow and recognisable construction at rest, not merely close-up finish. **Risk:** temple caricature, excessive detail, or supply-scaled houses losing analytical meaning. **Touched:** roof share/frontage/height contract (`CONTRACTS.md:315-320`), procedural ownership (`399-403`), asset provenance/export policy (`ASSET_PIPELINE.md:25-46`), hard/reborn budgets (`CONTRACTS.md:385-392`). **Dependencies:** asset pipeline, shared materials, station layout. **Verify later:** matched day/overview/gate captures, owner census; dock-layout/docks/harbour-batch tests for bounds, frontage, anchors and batching; model validation if runtime GLBs are adopted.

### 2. Make the viewing threshold visibly architectural · Impact 5/5 · Effort M
**Change:** Coordinate `garden-threshold.ts`, `garden-precinct.ts` and island chaseki around one quiet construction language. Expose an asymmetrical fragment of engawa edge/post/eave and its shadow in the rest seat; give the existing island hut a recessed opening/veranda rather than adding a new pavilion. Replace existing hidden/boxlike pieces, not the continuous inlet. Keep the tower non-Japanese and singular; unify only weathering, scale and stone/timber transition at its foot.

**Why:** Establishes “I am seated in a Japanese garden looking outward” with very few objects. **Risk:** foreground obstruction or a frame that becomes a stage proscenium. **Touched:** authored seat and three textureless threshold draws/15k triangles (`VISUAL_INVARIANTS.md:19-25,47-57`); no extra monument (`CONTRACTS.md:335-338`). **Dependencies:** composition, terrain/pine, camera, light/shadow. **Verify later:** full-frame and 16px blur at both gate sizes, tower/inlet occlusion comparison; threshold/island tests and deterministic reduced-motion capture.

### 3. Introduce a shared architectural surface language · Impact 4/5 · Effort M
**Change:** In `garden-harbor-batch.ts`, distinguish low-sheen cedar grain, mineral plaster, rounded tile relief and salt-weathered stone with a restrained shared normal/roughness atlas and authored bevels. Apply compatible treatment to the precinct/lantern bodies; keep the already-crafted tower's broad stone values rather than adding more windows/statues. Keep grain subordinate at rest and mip-filtered at distance.

**Why:** Makes buildings feel built from materials instead of coloured solids. **Risk:** shimmer, material noise, texture budget and loader growth. **Touched:** textureless ownership/loader and same-origin asset rule (`ASSET_PIPELINE.md:20-23,87-92`), immutable palette (`VISUAL_INVARIANTS.md:114-122`), budgets (`CONTRACTS.md:385-392`). **Dependencies:** asset export/loader capability; renderer aerial/material patches and day lighting. **Verify later:** day/night temporal crops, texture census and M5 Pro p95; material/asset lifecycle tests. Do not assume current GLB loader supports UVs/textures.

### 4. Replace—not multiply—fixtures and secondary landmarks · Impact 3/5 · Effort M
**Change:** Craft the existing near oki-dōrō with a readable stone cap/chamber silhouette and directional grazing light; retain instanced Kasuga station lamps. Rework TON's existing raised timber loft/pyramid-cap landmark (`garden-landmarks.ts:150-198`) with the shared kit, preserving pigeon openings and dispatch anchor. Keep nobori as chain identity; replace oversized-looking box plaques with integrated facade joinery where they carry no independent analytical truth. No new landmark/sign system.

**Risk:** foreground lamp competes with beacon; decorative changes accidentally touch dispatch/chain semantics. **Touched:** ember hierarchy (`VISUAL_INVARIANTS.md:74-77`), kindling order (`garden-lanterns.ts:45-60`), additions displace existing props (`CONTRACTS.md:457-461`); chain mark visibility (`322-330`). **Dependencies:** night lighting, material kit, DOM/picking owners. **Verify later:** normal/reduced night captures; lantern-kindling, landmark and chain-flag tests; compare landmark/fixture draw deltas.

## Do-not-do / traps

- No torii, pagoda replacement, shrine district or catalogue of Japanese ornaments. Product explicitly rejects cultural decoration and fantasy-village lore (`PRODUCT.md:39-44`).
- No blanket upward-curving roofs: use distinct quiet domestic/working architecture, not a temple on every chain berth.
- No per-building GLB/material/texture proliferation; preserve recipe-owned semantics and global batches.
- No confidence from tiny close-up tweaks: A2/P1 lacked whole-frame gain, B1's 0.075→0.050 hull tweak was indistinguishable (`agents/2026-10-02-visual-upgrade/02-execution-record.md:17-20`).

## Invariants worth challenging

Challenge **procedural-only harbour/landmark ownership** (`CONTRACTS.md:399-403`) and **generator-only model edits** (`ASSET_PIPELINE.md:37-46`): permit reproducible, checked authored-source exports while retaining anchors, provenance, local URLs and batching. Challenge **textureless threshold** (`VISUAL_INVARIANTS.md:56-57`) if one shared material atlas visibly improves stone/timber. Do not challenge the tower hierarchy, no-torii rule, data-independent height, same-origin/desktop gate or DOM parity.

## Captures wanted

Run serially on the integrated candidate and matched baseline; repeat metric arms on M5 Pro. Full shots must improve, not just crops:

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#t=12.25' --clean --draw-census --texture-census --out levers/l07-day.png --json levers/l07-day.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#t=22' --clean --metrics --value-plan night --out levers/l07-night.png --json levers/l07-night.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1200 --height 640 --hash '#t=12.25' --blur-audit --out levers/l07-gate.png --json levers/l07-gate.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 900 --height 720 --hash '#t=12.25' --reduced --out levers/l07-reduced.png --json levers/l07-reduced.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#cam=0,0,0.28&t=12.25' --draw-census --out levers/l07-overview.png --json levers/l07-overview.json
```

Read-only review: no source changes, browsers, tests or gates run.
