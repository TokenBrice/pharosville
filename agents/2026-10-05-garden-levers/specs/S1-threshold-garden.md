# S1 — Threshold garden: a seat, not a green bank

## Lever statement
Replace the smooth bank and solid pine discs with **one asymmetric, authored garden between the seated visitor and the water**. Moss shelves, a recessed gravel/earth interval, buried stones, a disappearing path and a porous kuromatsu establish garden space before interaction. A cropped engawa/eave fragment makes the viewpoint inhabited; the tower remains the singular hero. Replace existing forms, rather than adding a Japanese prop collection.

## Verified current state
- The camera already has authored landscape/tall eyes, yaw 31°, pitch 2.6°, height 15.23 and vertical FOV 32° (`src/systems/rest-seat.ts:14-46`). Keep these initially; moving the camera is not the remedy.
- `src/three/garden-threshold.ts:103-140` authors the brow in screen rows; `:156-170` fills the interior with a concave fall and small swells. `:235-263` supplies sine-coloured value masks, not differentiated substrates. Threshold materials are **smooth**, not flat-shaded (`:804-827`); L01/L05/L06 correctly qualify this.
- Ten tiny displaced icosphere stones already include a triad and five steps (`garden-threshold.ts:370-405`). The more useful existing stone generator buries 35% and has tall/flat/reclining forms (`src/three/garden-set-stones.ts:18-29,37-85`). No new stone vocabulary is required.
- Engawa boards exist, but posts/body/eave deliberately stay outside every rest view (`garden-threshold.ts:454-483`). Two pines merge into one instance (`:820-836`). Tapered bark, roots and supporting twigs already exist (`src/three/garden-niwaki.ts:173-223,304-357`); foliage is flattened 3–5-icosphere lobes (`:232-287`). The replacement must change foliage closure and branch hierarchy, not claim taper is missing.
- Exact recipes are doctrine (`docs/pharosville/VISUAL_INVARIANTS.md:47-57`) and test pins (`src/three/garden-threshold.test.ts:184-335`). Preserve the actual clearance/coverage test (`:135-182`): despite the source comment's “3 u hull” language, it probes water-plane and **1.5 u** samples (`:152-161`), not complete hull volumes.
- Actual threshold census: 3 calls, 14,788 triangles (`outputs/holistic/day.json:600-616`). Whole-frame hard/tighter limits remain 700/275 calls, 500k/480k triangles, 72/60 textures (`docs/pharosville/CONTRACTS.md:385-395`). L18's “already 72/72” is historical, not this baseline; texture headroom is not permission to spend it twice.
- Viewed day/night and both gate captures: ground occupies the lower frame but lacks material boundaries; night loses almost all of it. These are baseline observations, not new verification.
- Threshold remains synchronous under rim ownership (`src/three/world-renderer.ts:3053-3057`); renderer offsets it with the breathed eye and forwards wind (`:3970-3991`). Retain that interface for independently shippable art packets.

## Target state
**Recommended macro A — Oblique moss ravine.** Two unequal, low moss shelves flank a recessed interval sweeping from lower-centre toward left-middle. Three broad-based stones form an unequal grouping on the larger left shelf; the dominant reclining stone hides the path's continuation. A handful of flat steps lead away from the engawa, then vanish behind that stone: miegakure, not a visible dead end. Pine structure crosses only the upper-left corner, with real sky gaps between needle sprays. One cropped post/eave return and the sill establish shelter without making a proscenium.

**Macro B — Engawa court.** A broader quiet gravel court runs laterally behind an L-shaped veranda return. The stone triad and smaller moss tongue interrupt its far-left edge; the path turns out of sight behind the tongue. The pine is a shorter, more upright edge fragment. This offers stronger architectural stillness, less terrain depth; reject it if the pale court competes with the tower.

Both are the **same physical composition across viewports**, not billboards or independent screen-space gardens. At 1200×640 and 900×720, retain a readable moss/gravel seam, unequal stone grouping, disappearing approach and at least one visible needle gap and architectural fragment. Keep tower right-of-centre/crown sky, shaded corner, continuous empty inlet, existing brow envelope and unpickability. Night distinguishes wood/stone/moss without emissive plants; recesses remain dark. Reduced motion shows the entire settled composition without waiting for wind, arrival or loading. The rotated 720×900 profile remains supported; below the sorted desktop size gate, world/assets remain unmounted.
For A's first graybox at 1600×1000, aim for triad bounds u=0.14–0.37/v=0.79–0.91 and recessed interval u=0.34–0.65/v=0.81–0.94; reproject actual geometry at gates, never enforce identical pixels. Pine envelope stays u<0.24/v<0.28, with ≥25% clear background inside its needle-cluster envelope. Eave return stays above the fleet band; sill below it. A post may terminate in the upper corner, never bisect hull rows. Clearance outranks these initial composition targets.
Seat the triad 45–50% buried by terrain-relative translation, retaining broad visible faces; the existing generator's 35% burial is a starting shape, not the final contact.

**Geometry choice:** ship reference-authored procedural ground, architecture and pine control graphs, built once into merged opaque meshes. Pine sprays use short tapered fascicle fans/tufts, never alpha cards, solid cloud caps or one cylinder per needle. Existing distant niwaki stays inexpensive. Checked GLB is an alternative **only** if approved silhouette cannot be achieved within the procedural packet: S2-P2/P3 must then own its compiler/loader/manifest integration, provenance and aligned failure form; do not ship two hero rendering lanes. Shared materials come from S2, not per-object textures.

## Capture protocol (executor runs serially; not run for this spec)
Use fixed `quiet-dense` data and the same date, then repeat the accepted result live. These exact commands define D/W/C/N/R/O; output names are overwritten per packet only after retaining its baseline.

```bash
# D
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 1600 --height 1000 --still-camera --clean --metrics --value-plan --draw-census --texture-census --out outputs/s1/day.png --json outputs/s1/day.json
# W
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 1200 --height 640 --out outputs/s1/wide.png --json outputs/s1/wide.json
# C
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=12.25' --width 900 --height 720 --out outputs/s1/compact.png --json outputs/s1/compact.json
# N
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=22' --width 1600 --height 1000 --clean --metrics --value-plan night --night-water --out outputs/s1/night.png --json outputs/s1/night.json
# R
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#t=22' --width 900 --height 720 --reduced --clean --out outputs/s1/static-night.png --json outputs/s1/static-night.json
# O
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --hash '#cam=0,0,0.28&t=12.25' --width 1600 --height 1000 --clean --draw-census --out outputs/s1/overview.png --json outputs/s1/overview.json
```

### S1-P1 · Approve the composition in graybox · M
**Goal:** choose A or B before material/detail work.
**Files:** `src/three/garden-threshold.ts`, `src/three/garden-threshold.test.ts`, `docs/pharosville/VISUAL_INVARIANTS.md`, `docs/pharosville/CONTRACTS.md`.
**Change:** retain `browAt`, deck coverage/tall shoulder and offscreen shade casters; replace interior swells/scattered stones with broad shelf/recess/triad/path masses and a plain architectural edge. Render two successive graybox candidates using fixed neutral role values and coarse branched pine; no lasting variant switch. Do not modify `rest-seat.ts` by default. Record selected frame and freeze seat/brow boundary for S6.
**Amend:** replace Bible §Hierarchy threshold paragraph with: “One asymmetric moss–stone–gravel composition and disappearing approach establish the shaded viewing garden. A tapered, porous black pine and partial engawa/eave frame it; no garden mass obstructs eligible hulls or the open inlet. Preserve bottom-quarter land/deck coverage, tower hierarchy, deterministic static state and unpickability. Shape and material recipes are replaceable within owner-attributed budgets.” Retain §§Picture/Hierarchy purposes; amend Contracts §Light budgets with S1 allocation. Rewrite the `:197` resource test into ceilings/finite geometry/unpickability; remove exact mesh/material/instance counts, texturelessness and universal cast+receive requirements. Keep `:135` coverage test; make its rasterizer handle every instance/non-indexed geometry if introduced. Rewrite `:184` as projected branch-envelope/sky-gap/hero-clearance tests; delete `:226` and `:279` inward-contour tests when that helper is removed. Keep disposal test, replace fixed six-resource array with once-per-owned-resource assertions.
**Budget:** incremental ≤+2 colour calls/+3.2k construction tris/+0 textures/+0.5 KiB gzip; cumulative ≤5 draws/18k tris. Graybox substitutes old meshes.
**Acceptance:** D/W/C/O + `npm test -- src/three/garden-threshold.test.ts src/systems/camera.test.ts`. Operator picks an unmistakably garden-like whole frame and 16px notan; coverage/clearance remains green. Graybox is a complete intentional composition, not released placeholder detail.
**Depends:** `S9:destination`, `S9:invariant-rewrite`. **Risk/rollback:** oversized court/stone hides data; reduce interior masses or restore previous threshold implementation, never shrink the fleet.

### S1-P2 · Ground, buried stone and disappearing path · L
**Goal:** make stone, moss and recessed substrate readable through spatial relationships.
**Files:** `src/three/garden-threshold.ts`, `src/three/garden-threshold.test.ts`, `src/three/garden-set-stones.ts`, `docs/pharosville/VISUAL_INVARIANTS.md`, `docs/pharosville/CONTRACTS.md`.
**Change:** one authored seat-space mask set drives height, substrate weights and stone seating. Recess 0.15–0.35 u initially, clamp at deck/brow boundaries; avoid holes exposing outer ocean. Replace old `setStone`/ten-lump recipe with three unequal broad forms from `createSetStoneGeometry` plus the reseated existing step run. Stone origins follow terrain; buried bases never float. Merge by material role. Consume `applyGardenSurface` from S2-P1 (`worldXZ` ground, `triplanar` stones), restrained normals/roughness and distance-filtered detail. Reserve one planar inset/anchor within gravel for S3-P4; S3 owns its analytical trace, DOM and integration, not decorative rake stripes here.
**Amend:** P1 coverage/resource tests; add buried contact, uninterrupted substrate seam, step continuation occluded by dominant stone at both gates, masks finite/bounded and no analytical IDs. Bible threshold wording/docs describe selected layout, not exact coordinates.
**Budget:** incremental ≤+2 calls/+10k tris/+0 unique textures/+0.5 KiB; cumulative ≤7/28k. S2-P4 owns any shared atlas +3 textures; never charge that again here.
**Acceptance:** D/W/C/N/R + `npm test -- src/three/garden-threshold.test.ts`. Whole-frame stones read unequal and seated; moss/gravel differ in surface response without bright noise; actual hull coverage unchanged.
**Depends:** S1-P1, S2-P1. **Risk/rollback:** gravel becomes second hero or aliases; reduce relief/contrast, not material distinction; revert this packet if composition worsens.

### S1-P3 · Replace the cloud-pad hero pine · L
**Goal:** a believable near black-pine silhouette without an alpha-overdraw tax.
**Files:** `src/three/garden-niwaki.ts`, `src/three/garden-niwaki.test.ts`, `src/three/garden-threshold.ts`, `src/three/garden-threshold.test.ts`, `docs/pharosville/VISUAL_INVARIANTS.md`.
**Change:** add a threshold-only authored kuromatsu builder reusing tapered-tube construction. Explicit trunk/primary/secondary/twig graph, progressively thinner radii and attached irregular opaque needle sprays; hollow intervals between sprays reveal supporting twigs. Author both landscape and tall-seat trees, merge their buckets; do not globally replace cheap distant pads. Remove threshold `ScreenPad`, `screenLimb`, outline arrays, `shapeThresholdLimbPads` and pad-centre metadata/callers. Bake `aGardenFlex` vec3 (trunk/branch/tip, rooted zero), `aGardenRootIndex` scalar 0/1 and two cached rest-root positions for S8-P5's CPU-sampled root gust uniforms. Keep `updateWind(weather,reducedMotion)` and near sway attenuation; no independent clock or per-vertex frame uploads.
**Amend:** delete old contour-helper tests/helpers; preserve distant niwaki pad tests. Add new-builder deterministic geometry, taper/attachment, finite normals/bounds, opaque material and zero static displacement tests; threshold projection tests measure actual mesh gaps/branch envelope, not three anchors.
**Budget:** incremental +0 calls/≤+15k tris/+0 textures/≤+1.25 KiB; cumulative ≤7/43k. Merge sprays, not one draw per tuft.
**Acceptance:** D/W/C/R/O + `npm test -- src/three/garden-niwaki.test.ts src/three/garden-threshold.test.ts`. Pine reads branching and porous at both gates, no discs; tower/crown/inlet remain unobscured and wind is unnecessary for recognition.
**Depends:** S1-P1. S8-P5 consumes these weights and owns any subsequent clock-API/caller migration; it is not a static-geometry prerequisite. **Risk/rollback:** noisy fringe or expensive shadows; reduce tuft density inside silhouette, preserve gaps; revert hero replacement, never change all species.

### S1-P4 · Inhabited engawa and night integration · M
**Goal:** establish shelter and keep the finished near garden readable after dark.
**Files:** `src/three/garden-threshold.ts`, `src/three/garden-threshold.test.ts`, `docs/pharosville/VISUAL_INVARIANTS.md`, `docs/pharosville/CONTRACTS.md`, `docs/pharosville/ASSET_PIPELINE.md`.
**Change:** consume S7-P3 bucket geometry for a cropped sill, one off-centre post/eave return and existing lantern cap/chamber; replace hidden boxlike fragments, no new pavilion/lamp. Preserve chamber-only `patchGardenToroKindling`. Consume S2 timber/stone roles and S4 shared clock-driven fill; no threshold point light, emission floor or exposure compensation. Keep `setEyeOffset`, coherent shadow bounds and leased-resource disposal. Update media ownership for shared surfaces.
**Amend:** threshold tests for aperture/kindling isolation, shadow bounds, unpickability/disposal; Bible night/threshold targets with S4, not a contradictory local table.
**Budget:** incremental ≤+1 call/+2k tris/+0 unique textures/+0.75 KiB; final ≤8/45k, net ≤+5 calls/+30.2k construction tris/+3 KiB gzip. Reserve provisionally +60.5k submitted tris including shadow redraw; only reconciled owner census establishes actual pass cost. No global cap increase.
**Acceptance:** D/W/C/N/R/O + `npm test -- src/three/garden-threshold.test.ts`. Cropped architecture reads shelter, never a full frame border. With S4, non-emissive material medians differ ≥3 L*, threshold–inlet boundary ≥4 L*, ≥90% non-recess approach pixels ≥6 L*; beacon dominates notan. Repeat night at 1200×640 and reduced 900×720. Final resource acceptance requires S9 M5 evidence, including refresh passes.
**Depends:** S1-P2/P3, S7-P3, S2-P1, S4-P1/P3; resource sign-off `S9:triangle-spike`, `S9:M5-calibration`. **Risk/rollback:** foreground becomes theatrical or night resembles day; reduce fragment occupancy/shared fill, never brighten lamps; revert packet as a unit.

## Operator decisions required
1. **A oblique moss ravine or B engawa court?** Recommend A: stronger depth and miegakure with less pale gravel; approve graybox whole frames before detail.
2. **Procedural authored pine or checked GLB?** Recommend procedural first with explicit control graph; elect checked local GLB only on silhouette evidence, triggering S2-P2/P3 and a revised P3 file/budget contract before execution.
3. **Keep seat or jointly re-solve it?** Recommend keep; any seat move requires renewed camera/threshold/fleet acceptance, not cropping away the garden.

## Out of scope / do-not-do
No new torii, lamps, pavilion, grass carpet, season showcase, global flora replacement, shore/risk classifier changes, free orbit, WebGPU or runtime remote assets. S3 owns analytical gravel truth; decorative stones never represent records. Preserve same-origin `/api/*`, server-only `PHAROS_API_KEY`, sorted desktop gate/unmounting, DOM/ledger parity, non-colour/non-motion analytical carriers, one renderer and complete static reduced motion. Releases remain exclusively `.github/workflows/release.yml`. No tests, builds or browser captures were run while authoring this specification.
