# S7 — Landscape continuity, headland & architecture kit

## Lever statement
Replace the harbour's square presentation boundary, terraced pedestal and primitive-looking subordinate buildings with a continuous, asymmetric coastal garden and credible roof-led construction. The visitor should perceive weathered land supporting the Pharos, not a monument standing on a model tray. Keep the Pharos the singular, non-Japanese hero; the working harbours and viewing verandas supply the quiet Japanese architectural context.

## Verified current state
- The authoritative domain is 140×140 (`src/systems/map-scale.ts:21–24`). `src/systems/garden-rim.ts:204–218` rejects outside coordinates and uses minimum distance to square edges; its signed distance clamps outside samples (`:307–320`). Keep this authority unchanged, including the two opening bearings (`:38–41`).
- The decorative predicate explicitly rejects north/west extensions (`src/three/garden-rim-mesh.ts:430–444`); south/east skirts use approximately 4.5-tile reach (`:285–302`). Geometry sampling starts at zero (`:588–596`). The eight-tile water-plate margin is also used by map bounds (`src/systems/projection.ts:526–533,579–582`): enlarging that constant would unintentionally change other systems. Water already has an annulus and 20-world-unit crossfade (`src/three/garden-water.ts:143–149`); another fog skirt is not the fix.
- Correct L06/L01's shorthand: the island is already a smooth 80-cell heightfield, not stacked cylinder meshes (`src/three/garden-island.ts:445–447,511–564`). Its height nevertheless follows successive radial bench thresholds (`:330–343,369–388`). Furniture uses the same height function, and the shore derives from the exclusion ellipse (`:235–240`). Rim coast forms are hashed eleven-tile patches (`src/three/garden-rim-mesh.ts:501–508`).
- Borrowed scenery exists: all five horizon silhouettes follow the eye; the near headland and peak are PSI-independent while three ranges carry PSI visibility (`src/three/garden-horizon.ts:53–79,358–381`). Do not erase those three analytical ranges.
- Correct L07's literal “flat roofs”: irimoya/hip/gable forms already exist, but irimoya is two planar slopes and ends, with box fascia and one broad course (`src/three/garden-docks.ts:1472–1537`). `DockRecipe` owns roots, footprints, flags, cargo lanes and kindling (`:180–211`); global material buckets bake recipe transforms (`src/three/garden-harbor-batch.ts:180–238`). Roof and accent currently share a material branch (`:260–262`); timber is not explicitly flat-shaded (`:257`).
- Chaseki is a wall box, four posts and hip roof (`src/three/garden-island.ts:1660–1704`). Precinct engawa has a 0.12-unit flat roof (`src/three/garden-precinct.ts:77–88`). The near oki-dōrō already has a chamber aperture (`src/three/garden-threshold.ts:485–516`), so craft it rather than inventing another lamp.

Baseline `outputs/holistic/day.png`, `night.png`, `overview.png` directly show the slab boundary, tiered read and night silhouette collapse. These are observations, not measured candidate improvements.

## Target state
At day rest, an oblique exposed rock face falls beneath the tower into interrupted planted pockets; one lower shoulder answers it, rather than matching concentric green ledges. The left harbour reads through deep eaves, dark timber recesses and restrained plaster, with roofs dominant and banners unobstructed. Chaseki has a usable veranda overlooking the existing pond. Exterior land overlaps into borrowed headlands with unequal heights and recessed coastal bites on every side; overview reveals a deliberately irregular coastline, not four straight outer edges.

At night, land/water boundaries and eave silhouettes remain distinguishable under S4's moon-independent fill, without adding emitters or bright roofs. At both 1200×640 and 900×720 the crown retains sky, the inlet remains continuous and station supply frontage remains inspectable. Reduced motion shows the identical complete geometry and construction shadows; nothing relies on sway, surf or camera movement to read.

## Packets

All deltas below are **proposed ceilings [INFERENCE]**, measured against the same fixture/camera before shipping, not allowances earned by the RTX baseline. Calls mean main-scene calls; triangle ceilings include a conservative shadow/main-pass allowance. Shared surfaces/textures are charged to S2, not counted twice. Retain ≤480k rendered triangles, ≤285 scene calls, ≤60 textures and the existing JS cap; `S9:triangle-spike` resolves the long-session spike and `S9:M5-calibration` supplies M5 evidence.

### S7-P1 · Continuous decorative coast · M
**Goal:** decouple the finite chart from the visible silhouette.

**Files:** `src/three/garden-rim-mesh.ts`, `src/three/garden-horizon.ts`, `src/three/garden-rim-mesh.test.ts`, `src/three/garden-horizon.test.ts`.

**Change:** Replace `cameraSideSkirtExcursion` with explicit deterministic exterior contour knots on all four sides: a dominant oblique apron, lower broken counterpart and unequal corner returns. Coastal bites are outboard, not new navigable coves. Use a separately named decorative envelope (proposed maximum 18 tiles outboard, operator-approved); never change `GARDEN_PLATE_MARGIN_TILES`, map bounds, classifier or signed distance. Give `buildLandGeometry` a negative sample origin and replace shore-course positive-only clamps with symmetric decorative bounds. Coarsely tessellate broad exterior areas, refine silhouette/contact only, stitch common border vertices into existing top/face buckets. Sink feet below the existing annulus waterline. Preserve both opening corridors, Danger Strait, station maximum envelopes, detached islet collars and all eligible hull positions. Replace only the eye-following `near-headland` horizon ridge with fixed-world apron/headland geometry, leaving peak plus three PSI ranges and kasumi intact. Disable raycasts for decorative additions; exclude them from pick/DOM-anchor registries.

**Amend:** `docs/pharosville/CONTRACTS.md` §Sea partition and geography, lines 248–252, permit bounded four-sided decoration; §Analytical authority, lines 216–219, stays unchanged. `docs/pharosville/VISUAL_INVARIANTS.md` §The picture documents world-anchored near scenery. Rewrite rim test “carries the authored shoreline out across the camera-side plate margin”: delete north/west prohibition and fixed six-tile reach pins, replace with exterior-envelope, opening-clearance, watertight-border and all-side silhouette tests. Rewrite horizon five-ridge count to four sky ridges plus world headland; retain three-range PSI and crown-gap tests.

**Budget:** +0 calls, ≤+24k rendered tris (≤12k unique apron tris), +0 textures, ≤+1 KiB gzip JS; batching and removal of painted near ridge fund draw neutrality.

**Acceptance:** captures D/N/O/GW/GC/R below: irregular outline at overview, no straight outer run exceeding one-third of a side; no apron closes an opening, masks a berth or changes field/eligible counts. Add translation test proving near scenery has parallax while sky ranges remain eye-relative. Run `npm test -- src/three/garden-rim-mesh.test.ts src/three/garden-horizon.test.ts src/systems/garden-rim.test.ts src/systems/garden-sea-regions.test.ts`.

**Depends:** `S9:destination` approved destination/envelope; `S9:invariant-rewrite` semantic pins. **Risk/rollback:** false navigable territory or overview clipping; revert the contour/predicate and near-ridge replacement together, never modify truth to accommodate geometry.

### S7-P2 · Geological headland and coherent shore · M
**Files:** `src/three/garden-island.ts`, `src/three/garden-rim-mesh.ts`, `src/three/garden-island.test.ts`, `src/three/garden-rim-mesh.test.ts`.

**Goal/change:** Replace `cragBenchProfile`/radial moss rings with two unequal shoulder fields and one inclined exposed face. Blend authored low-frequency planes and interrupted planted pockets, not uniform erosion noise. Retain level stylobate court, pond shelf, gate spur and stair causeway; keep `islandTerrainHeight` the single furniture/mesh sampler and the existing obstacle unchanged. Replace coast-form hash with contiguous authored shore segments; revetments occur at quays, beach in sheltered reaches, bedrock on exposed reaches. Export immutable world-coordinate segment descriptors plus depth/substrate/exposure/dry–damp–submerged sampling for S5-P4. Build once; no per-frame allocation. Prefer vertex/channel transport, no new raster atlas. Do not change the analytical tidal-flat area/wrack geometry or drive decorative wetness from supply tide.

**Amend:** `docs/pharosville/VISUAL_INVARIANTS.md` §§The picture/Hierarchy and emptiness describes inclined shoulders, not terraces. `docs/pharosville/CONTRACTS.md` §Sea partition documents segment ownership; preserve lines 227–229 tide exclusivity. Keep island level-court, stair/exclusion and no-fortress tests; add furniture-foot sampling and dominant-face/interrupted-pocket tests, replacing any bench-specific probes. Rewrite rim coast counts to continuity/transition assertions rather than hash-distribution expectations.

**Budget:** +0 calls/tris/textures, ≤+0.5 KiB gzip JS; retain 80-cell topology, replace masks and existing shore courses rather than adding rock layers.

**Acceptance:** D/N/O/GW/GC/R: tiered pedestal disappears at thumbnail scale; shore contacts are continuous, never a universal foam ring. Positive/negative/unavailable tide states remain unchanged in targeted tests. Run `npm test -- src/three/garden-island.test.ts src/three/garden-rim-mesh.test.ts src/systems/garden-water-exclusion.test.ts src/three/garden-tidal-flat.test.ts`.

**Depends:** S7-P1; S2-P6 for shared terrain surfaces; S5-P4 consumes descriptors; S4-P1 for final night boundary separation ≥4 L*. **Risk/rollback:** furniture floats or planted pockets obscure stairs; roll back height/placement masks together, retain descriptor API and unchanged authority.

### S7-P3 · Roof-led construction kit into recipes · L
**Files:** `src/three/garden-architecture-kit.ts` (new), `src/three/garden-docks.ts`, `src/three/garden-architecture-kit.test.ts` (new), `src/three/garden-docks.test.ts`.

**Goal/change:** Introduce pure `buildGardenRoof`, `buildGardenTimberBay`, `buildGardenVeranda`, `buildGardenOkiDoro` builders returning bucket-labelled geometry parts plus deck/eave/chamber anchors; no materials, lights or cloned scene roots. Roof profiles provide quiet irimoya/hip/gable and retained utilitarian mono-pitch variants: shallow eave sag, roof thickness, ridge/end courses, readable underside rafters. Repeated structural bays plus fitted end bays preserve exact supply-scaled outer length/span; never stretch detailed joinery or change heights. Recess plaster between timber members; keep coarse silhouette/courses in ordinary buckets, only subpixel tile detail in `fineDetail`. Attach role tags and grain-aligned metric UVs for S2's canonical merging. Adopt across existing station authors, deleting displaced shell/fascia/course helpers. Keep nine identities, fixed Mole vertical, all flags/chimneys/cargo/kindling/root anchors and frontage formulas. No per-station GLBs. The lamp builder supplies crafted cap/chamber geometry; S1-P4 exclusively owns near-lamp placement/adoption and existing kindling mask.

**Amend:** `docs/pharosville/CONTRACTS.md` §Station siting and architectural identity, lines 315–320: document modular construction, retain 40–60% roof elevation/data-independent height. Preserve dock envelope, frontage and bearing tests; rewrite “gives every station roof a ridge, eave and gable profile” to actual sampled profile, underside depth and bay-fit assertions, deleting feature-counter-only proof. New kit tests cover deterministic geometry, normals/UVs, bounds, apertures and ownership/disposal. Keep `src/three/garden-harbor-batch.test.ts` fifteen-shared-drawable/anchor tests unchanged.

**Budget:** +0 calls, ≤+16k rendered tris across nine stations, +0 textures, ≤+3 KiB gzip JS; reusable profiles replace existing helpers. Additional atlas cost belongs S2.

**Acceptance:** D/N/O/GW/GC/R: hip/gable/eave silhouettes read at rest, not just crop; banner marks remain clear. Run `npm test -- src/three/garden-architecture-kit.test.ts src/three/garden-docks.test.ts src/three/garden-harbor-batch.test.ts src/systems/dock-layout.test.ts`.

**Depends:** `S9:destination` roof board approval; S2-P7 canonical role/UV-preserving batch merge (geometry authoring can precede its normalization prerequisite); S2-P1/P4 surfaces. **Risk/rollback:** temple caricature, shimmering tile detail, bundle growth; replace over-detailed profiles with simpler complete kit profiles, not dual legacy/new author paths.

### S7-P4 · Credible chaseki and precinct veranda · M
**Files:** `src/three/garden-island.ts`, `src/three/garden-precinct.ts`, `src/three/garden-keeper.ts`, `src/three/garden-summit-birds.ts`, `src/three/garden-island.test.ts`, `src/three/garden-keeper.test.ts`.

**Goal/change:** Replace chaseki's box wall with recessed timber/plaster bays, an open seated-facing veranda, boarded deck/threshold step and thick quiet hip/thatch eave from P3. Seat supporting feet using P2's sampler; export island-local door/deck/eave/ridge anchors. Migrate hung-lantern, keeper door/walk and gull-perch consumers to them, removing duplicated pose/roof constants (`src/three/garden-keeper.ts:67–72,97–99`; `src/three/garden-summit-birds.ts:164–172`). Replace precinct's flat engawa slab with a restrained roof/rafter fragment within its existing crown strip. Keep gate/stair/perch, single gatehouse window, pond/reflection and lighthouse anchors; preserve merge/LOD boundaries. S8-P5 owns basin/habitat replacement, not this packet. No additional pavilion, fixture, emitter or monument.

**Amend:** `docs/pharosville/VISUAL_INVARIANTS.md` §The picture and `docs/pharosville/CONTRACTS.md` §Station siting, lines 335–338, specify usable subordinate verandas. Rewrite island “builds the pavilion as a thatched chaseki” existence-only test to deck/roof/feet/aperture tests; rewrite keeper walking test's numeric door pin to exported threshold and continuous grounded route. Keep single-window/no-torii/exclusion tests; retain three precinct draws unless S2's measured surface migration explicitly replaces that material pin.

**Budget:** +0 calls, ≤+4k rendered tris, +0 textures, ≤+0.5 KiB gzip JS; replace box pieces and retain merging.

**Acceptance:** D/N/O/GW/GC/R: usable veranda gap/shadow is visible, tower still wins 16px blur; lantern stays beneath its eave, gulls perch on the actual ridge and keeper clears the deck. Run `npm test -- src/three/garden-island.test.ts src/three/garden-architecture-kit.test.ts src/three/garden-keeper.test.ts src/three/garden-lanterns.test.ts`.

**Depends:** S7-P2/P3, S2-P7, S4-P1/P3; coordinate S1-P4, S8-P5. **Risk/rollback:** veranda competes with tower or shadows pond; reduce replacement footprint/recess within existing anchors, never add a second shelter.

## Capture acceptance matrix
Executor runs serially on a served candidate and matched baseline; record fixture/date/hardware and owner deltas. These commands are specified, **not executed** in this review. Repeat D/O/N resource arms on M5 via `S9:M5-calibration`. Review full frame, foreground/roof/shore crops and 16px blur; material integration must not be accepted solely from crops.

```bash
# D / N / O
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --width 1600 --height 1000 --hash '#t=12.25' --clean --blur-audit --draw-census --texture-census --out levers/s7-day.png --json levers/s7-day.json
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --width 1600 --height 1000 --hash '#t=22' --clean --metrics --out levers/s7-night.png --json levers/s7-night.json
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --width 1600 --height 1000 --hash '#cam=0,0,0.28&t=12.25' --clean --draw-census --texture-census --out levers/s7-overview.png --json levers/s7-overview.json
# GW / GC, day and night
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --width 1200 --height 640 --hash '#t=12.25' --clean --out levers/s7-wide.png
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --width 900 --height 720 --hash '#t=12.25' --clean --out levers/s7-compact.png
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --width 1200 --height 640 --hash '#t=22' --clean --out levers/s7-wide-night.png
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --width 900 --height 720 --hash '#t=22' --clean --out levers/s7-compact-night.png
# R
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock 2026-10-05 --width 1600 --height 1000 --hash '#t=12.25' --reduced --clean --out levers/s7-static.png
```

## Operator decisions required
1. Permit decorative land up to **18 tiles outboard on every side**, or retain eight? Recommend bounded 18, approved from overview/rest boards; the authoritative domain/water-plate/map bounds remain unchanged.
2. Quiet working-house kit or ornate temple-like eaves? Recommend domestic/working irimoya/hip/gable, with modest sag and material age; no universal upturned corners.

## Out of scope / do-not-do
No torii, pagoda substitution, new monuments, decorative prop inventory, enlarged classification/navigation or invented tide semantics. No extra fog to conceal square edges, renderer migration, remote runtime assets, per-station texture/GLB proliferation or silently raised budgets. Retain same-origin `/api/*`, server-only `PHAROS_API_KEY`, sorted desktop gate/world-unmounted fallback, DOM/ledger parity, non-colour/non-motion alternatives, complete reduced-motion frame, one WebGL renderer and release-only `.github/workflows/release.yml`.
