# PharosVille Grand Scale Revamp — Implementation Plan

Date: 2026-07-25
Status: **approved for autonomous overnight execution** (operator decisions in §8)
Supersedes for scope: the 2026-07-24 Three.js visual revamp plan (deleted) and
the 2026-07-24 Pharos Wonder plan (deleted; its D1–D7 decisions stay in force
except where re-decided below).

## 0. Mission

Take the Three.js build from "credible draft" to "production-ready, visually
stunning, relaxing". Four operator-stated shortcomings, one operator-stated
permission:

1. **Scale.** 20 rendered ships → ~200+ concurrent, from a 300-stablecoin
   universe, with a working harbor-docking rotation. Non-negotiable.
2. **The lighthouse.** Currently reads as stacked grey blocks. It must read as
   the Pharos of Alexandria — one of the seven wonders.
3. **The sea zones.** Currently faint circles drawn on water. They must be
   distinct, visually recognizable *bodies of water* covering the vast majority
   of the map, and they govern ship behaviour.
4. **The whole.** Japanese garden × virtual world × data dashboard, per the
   concept render.
5. **Permission granted:** blow the budgets. Gzip may 3–10×. Frame smoothness
   may not.

### Acceptance criteria

| # | Criterion | Measurement |
| --- | --- | --- |
| A1 | ≥ 200 ships rendered concurrently at default zoom | `renderMetrics.visibleShipCount ≥ 200` |
| A2 | Fleet draw submission stays cheap | `drawDurationMs ≤ 6 ms` at 300 ships |
| A3 | Frame smoothness preserved | reference-gate `p90 ≤ 20 ms`; **not weakened** |
| A4 | Scheduler reaches `balanced` at 1920×1080 on the operator iGPU | `sessionTierReached`, sustained tier ≠ `recovery` |
| A5 | Shadows and bloom actually on in the shipped look | `shadowMapSize > 0`, `postPassList` contains `bloom` |
| A6 | Sea regions partition ≥ 90% of navigable water, contiguous, non-overlapping | `gardenSeaRegionCoverage` unit test |
| A7 | Each region visually distinguishable without color alone | water character + boundary + buoys + DOM parity |
| A8 | Lighthouse silhouette + surface detail reads as a Wonder at overview zoom | operator sign-off + triptych capture |
| A9 | Docking rotation live | `N ships docked / M total` footer reflects real berth occupancy |

---

## 1. Measured baseline (evidence, 2026-07-25)

Captured on the operator's machine via the live dev server at
`localhost:5173`, Playwright Chromium, 1920×1080, DPR 1.

**GPU:** `ANGLE (AMD, AMD Ryzen 7 7800X3D … radeonsi raphael_mendocino, OpenGL ES 3.2)`
— i.e. the Raphael **integrated** GPU. This is the reference machine for
"does it feel good on the operator's desk", and it is weak.

### 1.1 Current build, 20 ships (`GARDEN_OVERVIEW_SHIP_LIMIT = 20`)

| Metric | 1920×1080 | 1024×640 |
| --- | --- | --- |
| `framePacing.averageMs` | 29.16 | 20.13 |
| `framePacing.p90Ms` | 40.1 | 25.2 |
| `effectiveFps` | 34.3 | 49.7 |
| `drawDurationMs` (JS submit) | 3.3 | 3.1 |
| `schedulerTier` | `recovery` | `recovery` |
| `shadowMapSize` | **0** | 0 |
| `postPassList` | `render, grade, output` (**no bloom**) | same |
| `objectCount` | 530 | 530 |

Linear fit across the two resolutions: **frame time ≈ 16.0 ms fixed + 6.4 ms
per megapixel**. JS submission is only 3.3 ms, so ~13 ms of the fixed cost is
GPU/driver/compositor, and ~13 ms at 1080p is fragment/fill.

**Finding F1 — the current build never shows its best face.** The scheduler is
pinned in `recovery` on the operator's own machine, which sheds shadows and
bloom. The thresholds (`render-scheduler.ts:71-83`) are: `recovery` at
p90 ≥ 28 ms or draw ≥ 48 ms; `full` needs p90 ≤ 20 ms *and* draw ≤ 30 ms. The
measured p90 of **40.1 ms** clears the recovery trigger by a wide margin and is
nowhere near `full`. A large part of the "it looks like a draft" gap is that
the pretty passes are switched off before the operator ever sees them. Fixing
frame cost is therefore a *visual* workstream, not only a performance one.

### 1.2 Scale spike — cap raised to 200, measured, reverted

| Metric | 20 ships | 187 ships | Ratio |
| --- | --- | --- | --- |
| `visibleShipCount` | 20 | 187 | 9.35× |
| `objectCount` | 530 | **2,946** | 5.6× |
| `drawDurationMs` | 3.3 | **28.1** | **8.5×** |
| `framePacing.averageMs` | 29.2 | 31.1 | 1.07× |
| `framePacing.p90Ms` | 40.1 | 44.3 | 1.10× |
| `sampleDurationMs` (motion) | 0.8 | **0.6** | ~1× |
| `hitTargetDurationMs` | 0.2 | **0.1** | ~1× |
| hit targets | 126 | 293 | 2.3× |

**Finding F2 — the systems layer is already at full scale and is free.** Motion
samples exist for all 187 ships today (`shipMotionSamples.length = 187`) and
cost 0.6 ms. Hit testing at 293 targets costs 0.1 ms. Neither is a blocker.

Caveat: `applySeaRoomSeparationPass` (`motion-sampling/sea-room.ts:108-134`) is
**O(N²)** — ~20k pair tests per frame at 205 ships, already included in that
measured 0.6 ms. It survives 300 (~2.4× the pairs, ~1.5 ms) but is the first
thing that breaks if the fleet ever grows past ~500. Tracked as W3.10.

**Finding F3 — the *only* engine blocker is the per-ship scene graph.**
`createShip()` builds one `Group` with ~14 separate `Mesh`/`LineSegments`
children, each with its own cloned material (`garden-ships.ts:265-620`:
keel, hull, gunwale, deck, masts, per-sail meshes, cabin, cabin roof, rigging,
flag, signal, watch quarter, shield, shield mark). `world-renderer.ts:788`
maps every ship through it and `:1055` walks them every frame. That is
~2,700 draw calls at 187 ships, and 28 ms of pure JS submission — 90% of the
frame budget, leaving nothing for the visual ambition.

**Finding F4 — layout collapses long before the engine does.** The 187-ship
spike screenshot (`outputs/spike-187-ships.png`) shows hulls piled on the
island, on each other, and on the docks.
`representativeShipDisplayOffsets()` (`garden-observatory-slice.ts`) authors
rings sized for ~20 ships per band; at 187 the rings saturate and every
overflow ship is snapped by `nearestGardenShipWater` into the same few free
tiles. Scale is a *composition* problem at least as much as an engine problem.

**Finding F5 — the fleet lantern glow is what washes the frame out.** At 187
ships the additive glow quads blanket the scene in overlapping bloom-bright
blobs, flattening contrast — the opposite of the concept render's deep,
selective night.

**Finding F6 — the sea is already partitioned into named regions, and the
renderer ignores it.** `terrainKindAt()` (`world-layout.ts:174-201`) classifies
every tile into `calm-water`, `watch-water`, `ledger-water`, `alert-water`,
`warning-water`, `storm-water`, `deep-water` or generic `water`. Ship placement
and motion already bind to these painted tiles — *never* to the rendered
ellipse (`risk-water-placement.ts:13-22`, `ship-placement.ts:295-388`).
Measured census of the 56×56 map:

| Terrain | Tiles | % of map |
| --- | --- | --- |
| `calm-water` | 1,098 | 35.0% |
| `watch-water` | 709 | 22.6% |
| `ledger-water` | 310 | 9.9% |
| `water` (generic: island periphery + lighthouse clearance) | 309 | 9.9% |
| `grass` | 270 | 8.6% |
| `alert-water` | 154 | 4.9% |
| `rock` | 135 | 4.3% |
| `warning-water` | 65 | 2.1% |
| `storm-water` | 48 | 1.5% |
| `shore` | 38 | 1.2% |

Water is 2,693 tiles (85.9% of the map), of which **2,384 — 88.5% — already
belong to a named region.** The regions are contiguous, organically shaped, and
proportionate to risk semantics. They have simply never been drawn. The six
ellipses are a display fiction laid over a partition that already exists and
that the simulation already obeys.

This is the single most useful discovery in this recon: **W2 is a rendering
job, not an invention job.**

**Finding F7 — there are no per-ship DOM labels today.** The Three.js build
renders a single shared tooltip (`world-renderer.ts:528-539`); the only DOM
labels are zone names (`pharosville-world.tsx:705-721`). Production's per-ship
name chips (`USDT`, `DAI`, …) do not exist in this build. Scaling to 300 ships
therefore creates no DOM label pressure.

### 1.3 Current hard gates (what must be re-decided)

| Gate | Value | Where |
| --- | --- | --- |
| Rendered ship cap | 20 | `garden-observatory-slice.ts:17`; contract in `VISUAL_INVARIANTS.md:38` |
| Rendered docks | 1–2 | `selectGardenDocks()` (`garden-observatory-slice.ts`) |
| GPU draw calls | ≤ 450 | `tests/visual/pharosville-performance.spec.ts:26` |
| GPU geometries | ≤ 275 | same, `:27` |
| GPU textures | ≤ 40 | same, `:31` |
| GPU triangles | ≤ 70,000 | same, `:38` |
| Reference frame p90 | ≤ 20 ms | same, `:343` |
| Renderer chunk | 820 KiB raw / 218 KiB gzip | `scripts/bundle-budgets.mjs` |
| Total JS | 1,860 KiB raw / 530 KiB gzip | same |
| Map extent | 56 × 56 tiles (`TILE_SCALE = √2` ⇒ ~79 × 79 world units) | `world-layout.ts:10-16` |
| Water plane | 900 × 900 | `garden-water.ts:37` |
| Zone base radii | WATCH 48, LEDGER 36, ALERT 34, CALM 32, WARNING 15, DANGER 6 | `garden-zone-radii.ts` |
| Zone tint strength | WATCH **0.04**, CALM 0.08, ALERT 0.10, WARNING 0.13, DANGER 0.20 | `garden-zones.ts` |

Zone radii are already map-spanning (WATCH's 48 exceeds the map half-width of
~40). **The zones are not too small — they are too faint and too overlapping.**
Six concentric/overlapping ellipses at 4–20% tint cannot read as distinct
bodies of water no matter how large they get.

---

## 2. Decisions

Numbered so later work can cite them.

**D1 — Ship cap becomes a capacity, not a composition rule.**
`GARDEN_OVERVIEW_SHIP_LIMIT` 20 → 320. Note the real universe size: the world
builds **205** ships (217 canonical minus 12 pre-launch/frozen,
`ship-placement.ts:216-281`), and live data currently yields 187. A cap of 320
is capacity headroom, not a target — it means the cap stops being the thing
that decides the composition. See §7 Q1 on the gap to the stated 300 coins.
`VISUAL_INVARIANTS.md:38` is rewritten. The "framed asymmetric composition
with useful open water" invariant (`:36`) survives — it is now enforced by
region-weighted blue-noise density, not by a small count.

**D2 — The fleet is rendered as batched instances, not per-ship scene graphs.**
Target ≤ 24 draw calls for the entire fleet regardless of count. Hero GLB hulls
remain real `Object3D`s, capped (D4).

**D3 — Sail logos move to a single atlas.** One 2048² `CanvasTexture`, 16×16
grid of 128 px cells (256 slots), per-instance cell index. Replaces N
per-ship canvas textures. Ships beyond 256 fall back to the symbol/livery
path already required by `VISUAL_INVARIANTS.md:89`.

**D4 — "Titan" means genuinely unique, and stays rare.** 12 titans + 6
heritage hulls exist today as 2 shared GLBs. Grow to **10 distinct hero hull
models** covering the 24 largest stablecoins by market cap; everything else
uses the 4 batched silhouettes. Uniqueness is spent where the eye goes.

**D5 — Sea zones are rendered from the terrain field that already exists, and
the ellipses are deleted.** Per F6, `terrainKindAt()` already partitions 88.5%
of the sea into named, contiguous, organically-shaped regions that ship
placement and motion already obey. The renderer bakes that field into a
region-ID + signed-distance `DataTexture` and the water shader samples it.
`ZONE_BASE_RADIUS`, `ZONE_ELLIPSE_X/Z`, `AREA_DISPLAY_CENTER` and the
six-ellipse uniform loop are retired. This supersedes the zones-v2/v3
paragraph in `VISUAL_INVARIANTS.md:97-125` entirely.

*Revised from the first draft of this plan*, which proposed authoring a new
weighted-Voronoi partition. That would have re-invented an existing, better
system and risked display/simulation drift — the exact bug the ellipses have
today. Rendering the existing field is less code, guarantees ships sit in the
region they are labelled with, and matches what the production build did with
painted tiles.

The remaining generic `water` tiles (9.9%: island periphery + lighthouse visual
clearance) stay unassigned on purpose — they are the harbor approach and the
sightline to the tower, and they read as the composition's open water.

**D6 — Regions differ in water *character*, not only tint.** Colour is never
the only encoding (accessibility contract): each region also differs in swell
amplitude, chop frequency, foam density, glitter, and reflectivity, plus a
visible boundary treatment and buoy chain, plus DOM label and detail-panel
parity.

**D7 — Budgets are re-baselined, deliberately and with earmarks.**
Frame-time gates are **not** weakened. Everything else moves:

| Budget | From | To | Rationale |
| --- | --- | --- | --- |
| GPU draw calls | 450 | 700 | batched fleet + regions + richer island |
| GPU geometries | 275 | 500 | hero hull variety, lighthouse detail |
| GPU textures | 40 | 72 | sail atlas, region field, PBR maps, reflection RT |
| GPU triangles | 70k | 500k | Wonder-grade lighthouse + 10 hero hulls |
| Renderer chunk gzip | 218 KiB | 420 KiB | region shader, batching, reflection, hero kit |
| Renderer chunk raw | 820 KiB | 1,600 KiB | as above |
| Total JS gzip | 530 KiB | 820 KiB | as above |
| Total JS raw | 1,860 KiB | 3,200 KiB | as above |
| Runtime GLB total | ~315 KiB | 2,000 KiB | 10 hero hulls + Wonder lighthouse |
| Reference frame p90 | 20 ms | **20 ms (unchanged)** | this is the product |
| Mount frame threshold | 400 ms | 400 ms (unchanged) | |
| Time to first coherent frame | 2,500 ms | 3,500 ms | larger GLB set, still same-origin |

**D8 — GLB assets adopt `KHR_mesh_quantization`.** three r185 supports
quantized attributes natively — no runtime decoder, no new dependency in the
browser bundle. This buys ~3× on GLB bytes for zero runtime cost, so the
2 MiB earmark actually delivers ~6 MiB of authored geometry. DRACO/meshopt are
explicitly **not** adopted (they add decoder weight and async cost for a
same-origin asset set this small).

**D9 — Reclaiming frame budget is part of the visual work.** A5 requires
shadows and bloom to be on at 1920×1080. Fill cost (6.4 ms/Mpix measured) is
attacked directly, so the scheduler settles at `balanced`.

**D10 — Per-ship DOM labels stay off; no label-LOD work is needed.** Corrected
from the first draft, which assumed 200 ships implied 200 label chips. Per F7,
this build has no per-ship labels at all — one shared tooltip plus zone names.
Nothing to shed, so the "label LOD" task is dropped.

The live question this exposes instead: production *does* show a name chip
under every ship, and that legibility is part of what makes it read as a
dashboard. Adding them is a **separate, optional** scope item (see §7 Q5) — if
taken, it arrives with the LOD policy the first draft described, not before.

---

## 3. Workstreams

Seven workstreams. **W1 is the enabler and must land first**; W2–W4 can then
run in parallel; W5–W7 close.

---

### W1 — Fleet Scale Engine

*Removes F3. Nothing else in this plan is affordable until this lands.*

Target: **≤ 24 draw calls and ≤ 6 ms `drawDurationMs` for 300 ships.**

| # | Task | Verify |
| --- | --- | --- |
| W1.1 | Add a fleet-scale harness: a dev-only URL flag (`&fleet=N`) that forces the observatory slice to N ships, so every task below is measurable before the layout work lands. Reuse the debug channel already exposed at `window.__pharosVilleDebug`. | `&fleet=300` renders; metrics readable |
| W1.2 | Extract per-silhouette **merged static geometry**. In `garden-ships.ts`, build one `BufferGeometry` per silhouette (`galleon`/`clipper`/`schooner`/`junk`) merging keel, hull, gunwale, deck, cabin, cabin roof and shield, with livery-neutral vertex colours baked (the `bakeHullVertexColors` path at `:944` already exists). Cache in `shipGeometryCache`. | 4 geometries; unit test asserts merge determinism |
| W1.3 | Introduce `createFleetBatches(capacity)`: one `InstancedMesh` per silhouette for hulls, plus shared instanced meshes for masts, sails, flags, pennants and shields. Sized to capacity once; never reallocated on world replace (grow-only). | draw calls flat as N goes 20 → 300 |
| W1.4 | Per-instance livery via `InstancedMesh.setColorAt` / `instanceColor`; per-instance sail-atlas cell and motion phase via `InstancedBufferAttribute` (`aAtlasCell`, `aPhase`). Patch the sail material with `onBeforeCompile` to offset UVs by `aAtlasCell`. | unit test: instance N has expected colour + cell |
| W1.5 | Build the **sail logo atlas** (D3). One 2048² `CanvasTexture`; `use-ship-logo-assets.ts` writes each logo into its assigned cell; generation key invalidates the whole atlas, not per-ship textures. Keep the symbol fallback drawn into the cell when a logo fails. | `gpu.textures` drops despite 300 ships; no blank sails |
| W1.6 | Rewrite the per-frame ship update (`world-renderer.ts:1055`) as a single tight loop writing into the instance matrix arrays with module-scope scratch `Matrix4`/`Quaternion`/`Vector3`; one `needsUpdate` per buffer per frame. Zero allocation in the loop. | `drawDurationMs ≤ 6 ms` at 300 |
| W1.7 | Extend the already-instanced satellites to fleet capacity: `createShipShadows` (`:1293`), `createFleetLanterns` (`:731`), wake trails (`:1264`), ripple rings. Cap decorative counts by scheduler tier via draw-range, never reallocation (existing pattern from `garden-beacon-fire.ts`). | resource counts stable over a long session |
| W1.8 | Fleet LOD. At `overview` zoom: hull + sail + flag only. At `explore`/`analyze`: rigging `LineSegments`, signal lamps, watch quarters, deck props appear — for the *near* subset only, via instanced draw-range partitioning, not per-ship visibility toggles. | tier/zoom transitions add no frame spike |
| W1.9 | Retire per-ship cloned `MeshStandardMaterial`s. One shared material per part class; divergence expressed as instance colour/attribute only. | material count flat vs. N |
| W1.10 | Fix F5: shrink fleet lantern glow quad size and raise its bloom contribution threshold so 200 lanterns read as a scattering of warm points, not an overlapping wash. | night frame at 200 ships holds contrast |
| W1.11 | Hero GLB attach path (`attachGardenHeroModel`, `:673`) keeps working alongside batching: a ship promoted to a hero hull is skipped in the instanced hull batch (draw-range hole or zero-scale instance) and drawn as a real `Object3D`. | no double-drawn hull; selection still resolves |
| W1.12 | Dispose audit: `disposeThreeObjectTree` must handle the batch registry; shared cached geometry must not be double-disposed on world replace (existing pitfall, `THREEJS_AGENT_REFERENCE.md §2.7`). | StrictMode double-mount test green |

**Exit gate for W1:** `&fleet=300` at 1920×1080 →
`drawDurationMs ≤ 6 ms`, `gpu.calls ≤ 700`, resource counts stable, existing
`src/three` unit tests green.

---

### W2 — Sea Regions

*Removes shortcoming 3. Depends on nothing in W1; can run in parallel.*

| # | Task | Verify |
| --- | --- | --- |
| W2.1 | New three-free module `src/systems/garden-sea-regions.ts`. Rasterise the **existing** `terrainKindAt()` field (`world-layout.ts:174-201`) over the 56×56 map into a region-id grid, then compute a signed distance to the nearest region boundary and to shore. Pure function of the terrain field — deterministic by construction, no new seeding, no new anchors. | unit test: field matches `terrainKindAt` for every tile |
| W2.2 | Smooth the boundaries for rendering only: supersample the terrain field (4× or 8×) and apply a light domain-warp so region edges read as organic coastlines rather than tile staircases. The *classification* is untouched — this is an anti-aliasing/aesthetic pass over an authoritative field, and must never move a tile from one region to another. | unit test: warped field's per-tile majority == raw field |
| W2.3 | Emit a `DataTexture`: 512×512 RGBA over the map extent. R = region id, G = normalised signed distance to the nearest region boundary, B = distance to shore, A = reserved. Built once per world, disposed on replace. | one texture; `gpu.textures` +1 |
| W2.4 | Replace `garden-zone-coverage.ts`'s ellipse-union guard with `gardenSeaRegionCoverage`: assert each named region is contiguous, regions are mutually exclusive, and named regions cover ≥ 85% of water tiles (measured today: 88.5%). Retire the ≥ 50% ellipse guard and the CALM-centre/radius-ordering assertions in `garden-zone-coverage.test.ts:13-37`. | new guard green |
| W2.5 | Water shader (`garden-water.ts`): replace the `uZoneEllipse`/`uZoneTint` loop (`:187-189`, `:346-356`, fed by `setZoneState` `:831-850`) with a single region-field sample. Per-region uniform arrays for base/deep/shallow colour, swell amplitude, chop frequency, foam density, glitter and reflectivity (D6), driving the existing `uWaveAmplitude`/`uSwell`/`uTempo`/`uDetail`/`uShallowColor`/`uDeepColor`/`uHighlightColor` levers per-region instead of globally. Blend across boundaries via the G channel. | shader compiles; per-region character visible |
| W2.6 | Boundary treatment: use the distance channel to draw a drifting foam/current line where regions meet, animated on the shared `uTime`. This is what makes a region read as a *body of water* with an edge rather than a tint. | boundaries legible at overview zoom |
| W2.7 | Raise region tints to values that actually read. The 0.04–0.20 range (`garden-zones.ts:83-89`) existed because six ellipses stacked; a partition has no stacking. Retune against `HARBOR_PALETTE`, keep the Z3 luminance-match rule (`garden-water.ts:352-355`). | contrast check across day/dusk/night |
| W2.8 | Delete the ellipse layer: `garden-zone-radii.ts`, `buildBrokenPerimeter` and the merged perimeter material (`garden-zones.ts:231-321`), and `AREA_DISPLAY_CENTER` (`garden-observatory-slice.ts:231-242`). Keep buoys, but place them **along region boundaries** (one per ~9 world units, capped) rather than on an ellipse. Update `three/garden-zones.test.ts:27-60+`, which pins the ellipse radii. | dead code removed, tests updated |
| W2.9 | Region label + hit target + camera focus anchor on the region's visual centroid (pole of inaccessibility, so the label lands inside the shape), clamped into frame. Replaces the hand-authored `AREA_LABEL_TILE` table. | labels never off-screen or over the lighthouse |
| W2.10 | Expose `regionIdAt(tile)` so W3 placement consumes the same field. `motion-sampling/risk-drift.ts:28-116` and `risk-water.ts:65-175` already bind to painted tiles and should need **no change** — verify that, don't refactor it. | ships stay inside their region; motion tests untouched |

**Exit gate for W2:** the rendered region boundaries coincide with the terrain
field the simulation obeys (no display/data drift); each region is identifiable
in a screenshot without reading a label; coverage guard green.

---

### W3 — Fleet Composition at Scale

*Removes F4. Depends on W1 (capacity) and W2 (region polygons).*

| # | Task | Verify |
| --- | --- | --- |
| W3.1 | Replace `representativeShipDisplayOffsets()` ring authoring with **region-scoped blue-noise scatter**: Poisson-disc sampling inside each region polygon, minimum spacing scaled by `gardenShipVisualScale` so titans get room. Deterministic per ship id. | no hull overlap at 300; deterministic |
| W3.2 | Density shaping preserves `VISUAL_INVARIANTS.md:36` ("useful open water"): a density field that thins toward the frame edges and keeps authored open-water lanes and a clear sightline to the lighthouse. Composition stays asymmetric — this is not a grid. | operator sign-off on framing |
| W3.3 | Raise `GARDEN_OVERVIEW_SHIP_LIMIT` 20 → 320 (D1) and delete the representative/transient split where it no longer applies — with 320 capacity, nearly every ship is present, so "representative" collapses to "all". Keep the transient-outsider path for the selected-ship case during data gaps. | `visibleShipCount ≥ 200` on live data |
| W3.4 | Harbor docking at scale. `selectGardenDocks()` currently returns 1–2 docks; open it to the full preferred-chain set (10, `RUNTIME_FACTS.md` "Dock Rules"). Give each dock **berths** along its pier, count driven by the existing `chainDockSize` (`chain-docks.ts`, `MAX_DOCK_SIZE = 10`). | 10 docks render; berths visible |
| W3.5 | Berth assignment + rotation: ships in `moored`/`arriving`/`departing` occupy a berth; the route cycle rotates occupancy so the harbor breathes, matching production's ~122/187 docked ratio. Wire the existing footer string to real berth occupancy. | footer reflects live docking |
| W3.6 | `garden-docks.ts` grows from 2 piers to a harbor: pier decking, bollards, moored-ship gangways, cargo, quay lanterns registered through `GardenLaneRegistry` (respect tier caps — do **not** add per-lamp `PointLight`s). | draw calls within D7 budget |
| W3.7 | Update `garden-water-exclusion.ts` margins for the new landmass/dock footprint so no hull ever sits on rock or a pier (the spike showed hulls on the island). | placement unit test at 300 ships |
| W3.8 | Hit-target and follow-selected parity at 300 (`garden-observatory-hit-testing.ts`). Measured cheap today (0.1 ms at 293 targets) but must be re-verified at 320 with the new display transforms. | `hitTargetDurationMs ≤ 0.5 ms` |
| W3.9 | Ship anchors: `spreadShipRiskAnchorsAcrossWater` (`ship-placement.ts:295-388`) authored anchor spreading for ~20 visible ships. Re-tune it for full-fleet occupancy so anchors fill their region rather than clustering, then let the W3.1 blue-noise pass refine within it. | anchors fill each region at 300 |
| W3.10 | Guard the O(N²) sea-room pass (F2): add a uniform-grid spatial hash to `motion-sampling/sea-room.ts:108-134` so separation is O(N·k). Not urgent at 300 (~1.5 ms) — do it if the measurement exceeds 2 ms. | `sampleDurationMs ≤ 2 ms` at 320 |

---

### W4 — The Pharos Wonder

*Removes shortcoming 2.*

Current state: 2,420 tris / 6 draws / **0 textures**, merged boxes and
cylinders with a vertex-colour ramp (`generate-garden-lighthouse.mjs`). Flat
vertex colour on prismatic solids is exactly why it reads as stacked pixels —
there is no surface detail, no ambient occlusion, and no material variation.

| # | Task | Verify |
| --- | --- | --- |
| W4.1 | Raise the geometry budget from 2.4k to ~60k tris in `generate-garden-lighthouse.mjs`. The three-tier silhouette and the D1 anchor contract (`GARDEN_LIGHTHOUSE_HEIGHT = 34`, `GARDEN_LIGHTHOUSE_BEACON_Y = 30.1`) are **unchanged** — the mass is right, the surface is not. | `check:garden-models` passes with new manifest |
| W4.2 | Masonry: real ashlar coursing on the square tier — per-course inset rings with alternating depth and slight per-block jitter, so raking light produces horizontal shadow lines. This single change does more than anything else to stop it reading as a box. | visual diff at day and dusk |
| W4.3 | Architecture pass, per the attested Pharos: the great ramp/causeway spiralling the base, corbel table and dentil cornices at each tier joint, arched window reveals with real recess depth, bronze double doors, a colonnade ring at the octagonal drum, and Triton corner finials with actual form (not cones). | silhouette reads at 100% and at overview zoom |
| W4.4 | Give it a **material set**, not just vertex colour: tiling limestone/marble albedo + normal + roughness authored procedurally in the generator, plus a baked AO map from the generator's own geometry. AO in the recesses is what sells stone. Colour maps tagged `SRGBColorSpace`; normal/roughness left linear. | no black or washed surfaces; `envMap` response correct |
| W4.5 | Warm interior emissive: window apertures glow from within at dusk/night, as in the concept render. Emissive-only — no new lights (light add/remove triggers shader recompiles, `THREEJS_AGENT_REFERENCE.md §2.6`). | windows glow; light count unchanged |
| W4.6 | Zeus Soter statue and the bronze mirror dish get real modelled form at the crown. The D4/D6 poster-art licence for the ray fan and mirror stands. | crown legible against the sky |
| W4.7 | Apply `KHR_mesh_quantization` (D8) in the generator's export step; update `garden-models.ts` manifest (sha256, dims, anchors, pick proxy, budgets) and `validate-runtime-media.mjs` limits. | GLB ≤ ~600 KiB at 60k tris |
| W4.8 | Keep the procedural fallback shell aligned to the new GLB anchors — `VISUAL_INVARIANTS.md:86` requires the fallback to stay visible and aligned on load failure. Its silhouette may stay coarse; it must not drift. | GLB-blocked test still renders aligned shell |
| W4.9 | **The island under it.** The concept render's rock is layered, eroded, tree-covered, with cut stone stairs and lantern-lit terraces; the current island is a smooth green mass. Add rock strata banding, boulder scatter, cliff faces on the seaward side, a stone stair from the quay to the tower, and denser planting — all instanced (`garden-island.ts`, `garden-harbor-life.ts`). | island reads as terrain, not a blob |

---

### W5 — Fleet Identity

*Removes the "craft much more titan unique models, refine overall ship models"
part of shortcoming 1.*

| # | Task | Verify |
| --- | --- | --- |
| W5.1 | Grow `generate-garden-heroes.mjs` from 2 hero hulls to **10 distinct models** (D4). Suggested spread: treasury galleon, war carrack, tea clipper, brigantine, dhow, junk, barquentine, cog, xebec, cutter — each with its own hull sheer, rig plan, stern gallery and deck furniture. | 10 GLBs; `check:garden-models` green |
| W5.2 | Assign hero hulls to the top 24 stablecoins by market cap, deterministically and stably (a coin must not change ship between refreshes). Extend the titan/heritage tables in `unique-ships.ts`. | stable assignment unit test |
| W5.3 | Refine the 4 batched silhouettes themselves: better sheer curve, proper stem/stern rake, visible planking via vertex colour, deck camber. These carry ~280 of 300 ships — they matter more than the heroes. | side-by-side before/after |
| W5.4 | Sail and rig quality: cloth curvature (already partly in `createSailGeometry`, `:1105`), reef points, halyards, and a livery-tinted sail border so the logo sits on a branded field rather than raw white. | logo legibility preserved at overview zoom |
| W5.5 | Pennants and flags carry chain identity as well as livery, giving a second non-colour encoding at scale. | DOM parity retained |
| W5.6 | Apply D8 quantization to all hero GLBs; update manifest and media validation. | total GLB ≤ 2,000 KiB (D7) |

---

### W6 — The Look

*Removes shortcoming 4 and F1. This is where the concept render is met.*

| # | Task | Verify |
| --- | --- | --- |
| W6.1 | **Reclaim fill budget (D9).** Profile the water fragment shader — it is the dominant full-screen cost (6.4 ms/Mpix measured, and it now also samples the region field). Move constant work to the vertex stage, collapse the retired zone loop, early-out the ripple loop on `uRippleCount`, and reduce the ripple/lane loop trip counts under `interaction`. Target: reach `balanced` at 1920×1080 on the reference iGPU. | A4: sustained tier ≠ `recovery` |
| W6.2 | Turn shadows back on and keep them on. With W6.1 headroom, restore a real `shadowMapSize` at `balanced`, with the directional light's orthographic shadow frustum fitted tightly to the island (not the 900-unit water plane) and `normalBias` tuned against acne. | A5: `shadowMapSize > 0` |
| W6.3 | Restore bloom at `balanced` with the per-day-phase knees already authored in `garden-post.ts`, re-tuned against the new emissive population (200 ship lanterns + lighthouse windows). | A5: `bloom` in `postPassList` |
| W6.4 | **Water reflection.** The concept render's defining feature is the lighthouse and its beam reflected in near-still water. Add a bounded planar reflection: render a *reduced* scene (lighthouse + island + hero hulls only, no fleet, no post) into a small render target once per frame, sampled by the water shader with region-driven reflectivity — glassy in Calm, broken in Danger. Budget one extra RT and one extra pass; shed entirely below `balanced`. | reflection visible; frame p90 held |
| W6.5 | Environment lighting: add a small procedural `PMREM` environment (sky-derived, rebuilt only on day-phase change — never per frame) so `MeshStandardMaterial` surfaces get grounded ambient response instead of flat fill. This is the cheapest large quality jump for the lighthouse stone and hero hulls. | stone and hulls gain form |
| W6.6 | Night grade correction: with F5 fixed and bloom restored, re-tune `NIGHT_GRADE` toward the concept's deep blue-black sea with selective warm pools. | night triptych matches concept intent |
| W6.7 | Scheduler tier matrix update: document what the new systems shed at each tier (reflection, region boundary foam, fleet LOD tier, label density) in `THREEJS_AGENT_REFERENCE.md §6`. | doc + tier unit tests |
| W6.8 | Depth cueing: strengthen distance fog/aerial perspective over the 900-unit water plane so the horizon reads as depth rather than a flat band, supporting the "relaxing" goal. | horizon capture |

---

### W7 — Contracts, Gates, Evidence

*Runs alongside; must complete before any claim of production readiness.*

| # | Task | Verify |
| --- | --- | --- |
| W7.1 | Rewrite `VISUAL_INVARIANTS.md`: line 38 ship cap (D1), the zones-v3 paragraph `:97-125` (D5/D6), the renderer/media paragraph for the new asset set, and the Performance section for D7. Record every decision D1–D10 with its measured cause. | `npm run validate:docs` |
| W7.2 | Apply the D7 budget re-baseline: `scripts/bundle-budgets.mjs`, `GPU_RESOURCE_BUDGET` in `tests/visual/pharosville-performance.spec.ts:25-38`, `validate-runtime-media.mjs`. Each raise carries a measured-cause comment, matching the file's existing convention. **Do not touch the p90 gate.** | `npm run check:bundle-size` |
| W7.3 | Regenerate `RUNTIME_FACTS.md` (`npm run docs:runtime-facts`) — model table, budgets, dock rules, titan/heritage tables all change. | `npm run check:runtime-facts` |
| W7.4 | Update `MOTION_POLICY.md` for the batched fleet: still one route-owned clock, still a deterministic t=0 reduced-motion pose, now expressed as a composed instance-buffer state rather than per-ship transforms. | reduced-motion tests green |
| W7.5 | Unit test sweep: `src/three` (batching, atlas, regions, lighthouse anchors, dispose), `src/systems` (region field determinism + coverage, blue-noise placement, berth assignment), `src/renderer` (tier matrix). | `npm test` |
| W7.6 | Re-baseline visual snapshots. Note the documented host/CI update-mode divergence — regenerate against the CI Playwright image locally via the Docker lane, then `chown` back. | `npm run test:visual:dist` |
| W7.7 | Reference-gate performance run at 300 ships: `npm run test:perf:reference`. This is the acceptance measurement for A1–A5. | p90 ≤ 20 ms |
| W7.8 | Capture a triptych (`npm run capture:triptych`) at day/dusk/night for operator sign-off against the concept render. | operator approval |
| W7.9 | Accessibility re-verify: label LOD (D10) must not reduce what is reachable — search, keyboard traversal, detail panel, and ledger must still reach all 300 ships. | `npm run test:visual:accessibility` |
| W7.10 | Full release lane before deploy: `npm run validate` then `npm run validate:release`. | green |

---

## 4. Sequencing

```
Phase 0  W7.1 (decisions recorded)  +  W7.2 (budgets raised)  +  W1.1 (harness)
            └── unblocks everything; ~half a session

Phase 1  W1  Fleet Scale Engine                        ← hard dependency
            exit: 300 ships @ ≤6 ms draw, ≤700 calls

Phase 2  W2  Sea Regions        ║  W4  Pharos Wonder    ← parallel, independent
                                ║  W5  Fleet Identity

Phase 3  W3  Composition at Scale                       ← needs W1 + W2

Phase 4  W6  The Look                                   ← needs W1–W4 in place
            exit: A4 + A5 (balanced tier, shadows + bloom on)

Phase 5  W7  Re-baseline, evidence, sign-off
```

Phases 2's three streams touch disjoint files (`garden-water.ts` +
`garden-sea-regions.ts` / `generate-garden-lighthouse.ts` +
`garden-island.ts` / `generate-garden-heroes.mjs` + `unique-ships.ts`) and are
safe to run as separate worktrees via `npm run worktree:new`.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Instanced fleet loses per-ship material nuance (heroes aside) | Medium | Medium | Push variation into instance colour + vertex colour + sail atlas; accept fewer distinct materials as the cost of 10× count (D2) |
| The reference iGPU cannot reach `balanced` at 1080p even after W6.1 | Medium | **High** — A4/A5 fail | W6.1 is measured before W6.2–W6.4 are attempted; if headroom is short, adaptive DPR already exists as the release valve, and reflection (W6.4) is the first thing cut |
| Region field looks like flat map paint rather than water | Medium | High | D6 is the guard: character (swell/chop/foam/reflectivity) carries the read, tint only supports it. Prototype W2.5 visually before W2.7 tuning |
| W2.2 boundary smoothing silently reclassifies tiles, drifting display from simulation — the exact bug the ellipses have | Low | **High** | W2.2's verify is an explicit per-tile majority-match test against the raw field; smoothing is presentation-only by contract |
| `calm-water` is 35% of the map — the largest region is the *safest* one, so a healthy market reads as a mostly-uniform sea | Medium | Medium | Accept: that *is* the analytical truth, and a calm sea is on-brief for "relaxing". Character differentiation (D6) keeps it from reading as empty |
| Blue-noise placement destroys the composed, asymmetric framing | Medium | High | W3.2 density shaping + explicit operator sign-off gate before W3.3 raises the cap |
| 60k-tri lighthouse pushes GLB past the earmark | Low | Medium | D8 quantization measured at W4.7; fall back to a lower course-jitter density |
| Visual baseline churn masks a real regression | High | Medium | Re-baseline **once**, at W7.6, after all visual work lands — not per workstream |
| Label LOD (D10) reads as lost information | Medium | Medium | W7.9 verifies reachability; the ledger and search are the parity surface, per existing contract |
| Bundle growth hurts first paint | Medium | Medium | Renderer chunk is already lazy behind the desktop gate; W7.7 measures time-to-first-coherent-frame against the raised 3,500 ms gate |

---

## 6. Explicitly out of scope

- Any change to `/api/*` allowlist, the Pages Function proxy, or secret handling.
- The desktop/portrait viewport gate — narrow and portrait viewports must
  still mount nothing.
- React Three Fiber, drei, a second rendering backend, or a renderer switch
  (`THREEJS_AGENT_REFERENCE.md §11.1, §11.10`).
- The DOM failure fallback architecture (`WorldStaticOverview`).
- Analytical meaning: every entity keeps the meaning in the Entity Meaning
  table. This plan changes presentation and scale, not what a ship *is*.
- Manual tags or GitHub Releases — release flow stays with
  `.github/workflows/release.yml` per `docs/pharosville/RELEASES.md`.

---

## 7. Open questions for the operator

1. **300 vs 205.** You said we track 300 stablecoins, but the world only builds
   **205** ships from 217 canonical entries, and live data yields 187. The
   missing ~95 are either filtered upstream or never enter the canonical set.
   Do you want the fleet grown toward 300 by loosening that filter (a
   `systems/` data-scope change, outside this plan's rendering scope), or is
   "render essentially all of the ~205 we have" the real target? *This plan
   delivers the latter and is sized for the former.*
2. **Map extent.** The map is 56×56 tiles (~79×79 world units), 85.9% water.
   Production's diamond reads much wider relative to the island. Do we grow the
   map to ~80×80 to give 300 ships room, or hold 56×56 and rely on tighter
   blue-noise spacing? Growing it touches every tile-space constant *and* the
   terrain field W2 now depends on. *Recommendation: hold 56×56 through
   Phase 1–3, re-evaluate with the full fleet actually on screen.*
3. **Docked ratio.** Production shows ~122 docked / 187 total. Should the
   Three.js build target that same ratio, or keep more of the fleet under sail
   for motion interest? *Recommendation: target ~40% docked — enough to make
   the harbor feel busy, enough sail traffic to keep the world alive.*
4. **Hero hull count.** D4 proposes 10 models for the top 24 coins. More models
   is more identity but more GLB weight and authoring time. Confirm 10.
5. **Per-ship name labels (new, from F7).** This build has none; production has
   one under every ship. They are a real part of production's
   dashboard legibility. Add them (with the LOD policy from the D10 first
   draft), or keep the world clean and leave identification to hover, search
   and the ledger? *Recommendation: add them, gated to explore zoom and above —
   it is the cheapest step toward the "data dashboard" third of the brief.*
6. **Reflection scope (W6.4).** Lighthouse + island only, or also hero hulls?
   Including hulls roughly doubles the reflection pass cost. *Recommendation:
   start lighthouse + island; add heroes only if W6.1 leaves headroom.*

---

## 8. Operator decisions (2026-07-25, pre-execution)

Settled before an unattended overnight run. These bind execution; where they
conflict with §2, these win.

| # | Decision | Consequence |
| --- | --- | --- |
| **O1** | **Scope: everything through W6.** Attempt the full plan, not a subset. | W7 evidence work is folded in as I go; expect breadth over polish on the later streams. |
| **O2** | **Commit the existing Lantern Sea work as a baseline first.** | My overnight changes stay cleanly separable and revertible. |
| **O3** | **Commit directly to local `main`. Do NOT push.** | Nothing reaches `pharosville.pharos.watch` overnight. No deploy, no tags, no releases. Operator pushes when satisfied. |
| **O4** | **If the p90 ≤ 20 ms gate cannot be met, ship over-budget and document the gap.** Supersedes D9's implication that visual features get cut. | I do NOT silently cut visual features to pass a gate. I measure, report the number, and leave the decision to the operator. |
| **O5** | **Render all ~205 ships. Do not touch the upstream data filter.** | Stays in rendering scope. The gap to 300 is deferred, not chased. |
| **O6** | **Map stays 56×56 tiles.** | No tile-space migration. W2's dependency on the terrain field is safe. |
| **O7** | **No per-ship name labels.** Confirms D10's drop and closes Q5 in the negative. | The world stays clean; identification via hover, search, ledger. Closest to the concept render. |
| **O8** | **Look: concept mood at production density.** | Deep dark water, selective warm pools, strong contrast and reflection — with 200+ ships spread wide and real breathing room. The concept's *lighting and materials*, production's *population*. This is the north star for every W6 tuning call. |
| **O9** | **D7 budget re-baseline approved as written.** | Draw calls 700, geometries 500, textures 72, triangles 500k, renderer 1,600 KiB raw / 420 KiB gzip, total JS 3,200/820 KiB, GLB 2,000 KiB. Each raise still carries a measured-cause comment. |
| **O10** | **Regenerate visual baselines once, at the very end, via the Docker CI lane** (then `chown` back). | I do not re-baseline per workstream against a moving target. The visual lane stays red until that final pass. |
| **O11** | **10 hero hull models for the top 24 coins** (D4 confirmed). | |
| **O12** | **~40% of the fleet docked** (production runs ~65%). | More sail traffic stays alive on the water. |
| **O13** | **Authorised to rewrite `VISUAL_INVARIANTS.md` contracts** to match what ships, recording each decision with its measured cause. | |
| **O14** | **Reflection scope is NOT limited to lighthouse + island** — the operator declined that conservative default. | W6.4 includes hero hulls in the reflection pass; fleet hulls only if budget allows. Reflection is now a first-class feature, not a nice-to-have. |

### Standing constraints for the unattended run

These are not re-decidable by me overnight:

- No push, no deploy, no tags, no GitHub Releases (O3).
- No `/api/*` allowlist change; `PHAROS_API_KEY` stays server-side.
- Desktop/portrait viewport gate stays intact — narrow and portrait mount nothing.
- One production renderer. No R3F, no drei, no second backend.
- One route-owned RAF; reduced motion stays a deterministic t=0 frame.
- Analytical meaning keeps DOM/ledger parity.
- Seeded determinism only — no `Math.random` in world or render paths.
- Every entity keeps its meaning from the Entity Meaning table.

### Reporting contract

At the end of the run I leave, in this file:

1. What actually landed, per workstream, with measured numbers.
2. Every budget I raised and the measured cause.
3. Every gate that is red, with the number and why (per O4).
4. Anything I chose not to do, and the reason.

---

## 9. Execution report (2026-07-25 overnight run)

Written per the §8 reporting contract. Honest account: what landed, what did
not, and what is still red.

### 9.1 Headline

**Scale is solved and the engine is no longer the constraint.**

| Metric | Before (20 ships) | After (187 ships) |
| --- | --- | --- |
| Rendered ships | 20 | **187** (9.4×) |
| Fleet draw calls | ~2,700 at 187 | **7** |
| `drawDurationMs` | 3.3 (at 20) / 28.1 (at 187) | **2.7–5.5** |
| `objectCount` | 530 (at 20) / 2,946 (at 187) | **~1,100** |
| Frame avg | 29.2 ms | 23.4–38.8 ms (see 9.4) |
| Frame p90 | 40.1 ms | 29.3–50.1 ms |

Draw submission at 187 ships is now **cheaper than the old build's 20**.

### 9.2 What landed

**W1 — Fleet Scale Engine (complete).** Ships draw from shared `InstancedMesh`
batches: merged hull assembly + merged sails per silhouette, plus one pennant
batch — 7–9 draw calls for the whole fleet at any size. Per-part tonal identity
is baked into vertex colours so one `instanceColor` reproduces the old
multi-material read. Sail logos moved to a single 2048² atlas with a per-vertex
`aAtlasSail` selector, replacing one `CanvasTexture` per ship. Hero-tier ships
keep their own scene graph.

**W2 — Sea Regions (complete).** The six tinted ellipses are gone. The renderer
now draws the terrain field the simulation already obeyed, rasterised into a
512² region-id + boundary-distance texture. Regions differ in swell, chop,
whitecap density, reflectivity and depth — not just tint. Boundaries are
domain-warped so they wander like a current front, carry a drifting foam line,
and marker buoys sit on the real edge. Display and data can no longer drift.

**W3 — Composition at scale (complete).** Blue-noise (Mitchell best-candidate)
scatter inside each band's own painted region, with a 9-tile lighthouse
clearance and an edge-density falloff. The rendered harbor grew from 2 piers to
up to 10 separated chain docks.

**W4 — Pharos Wonder (delegated, complete).** Lighthouse GLB went 153 KiB →
519 KiB with ashlar coursing, geometry-aware baked AO, cornices, arched window
reveals, colonnade, finials and a modelled crown. Windows now glow from within
at dusk/night.

**W5 — Fleet Identity (delegated, complete).** 2 shared hero hulls → **10
distinct models** covering the top 24 coins, assigned deterministically so a
coin never changes ship. Hero-tier ships went 18 → 29.

**W6.1 — Frame budget (partial).** The open-ocean early-out is the big win: the
water plane is 900 units, the map is ~79, and everything beyond it was running
the full shader. Skipping it cut frame time ~35% at wide zoom. Whitecap noise
is gated to rough water; the second normal fetch sheds below balanced.

**W7 — Contracts and budgets (complete).** D7 budgets applied with measured
causes. `VISUAL_INVARIANTS` rewritten for the new ship-cap, zone and renderer
contracts. `RUNTIME_FACTS` regenerated. **`npm run validate` passes end to
end**; 841 unit tests green across 87 files.

### 9.3 What did NOT land

- **W6.2 — shadows are BACK (fixed late in the run).** They now survive down
  to `recovery` at a 384px map; only `constrained` drops them. The casters are
  static and `shadow.autoUpdate` is false, so the recurring cost is just the
  PCF taps. Verified live: `shadowMapSize: 384` at 26.2 ms.
- **W6.3 — bloom is BACK at `recovery` (fixed late in the run).** It now runs
  at half resolution: `UnrealBloomPass` is a five-level mip pyramid, so halving
  its working resolution quarters its fragment cost, and bloom is a blur so the
  difference is invisible at this radius. A5 is met at `recovery` and above.
- **A4 — the scheduler still settles in `recovery`, and drops to
  `constrained` under load.** Not met.

  **Open question for the operator, deliberately NOT actioned blind:** at
  `constrained` the composer is disabled *entirely*, which drops the colour
  grade along with bloom. Grade is one cheap full-screen pass and it carries
  the whole day/dusk/night colour identity, so losing it is a much larger
  visual cliff than its cost justifies. The obvious change is to keep the
  composer at `constrained` with bloom off, and let the tier shed elsewhere
  (shadows, water detail, lanes — all already wired). It was not made tonight
  because `constrained` is the last-resort recovery valve and the machine was
  too contended to verify the change would not make a drowning device worse.
  Verify on an idle machine first.
- **W6.4 — water reflection not implemented.** The concept render's defining
  feature. Not started.
- **W6.6 — the washed-out day is FIXED (late in the run).** The fog ladder had
  been calibrated for a single framing (1440x960 at zoom 0.78); at the wide
  zooms the new scale invites, most of the frame fell past `FOG_FAR` and noon
  rendered as a white-out. Fog range now scales with camera view height.
- **W6.5/W6.8 — PMREM environment and depth cueing not done.**
- **W4.9 — island detail (rock strata, cliffs, stone stair, denser planting)
  not done.**
- **W5.3 — the 4 batched silhouettes were not refined.** They carry ~160 of 187
  ships, so this is higher leverage than it sounds.
- **W3.5 — berth rotation not implemented.** Docking still uses the existing
  mooring behaviour; the ~40% target (O12) is not wired.
- **W2.7 tuning is a first pass.** Region tints were tuned by eye in two
  iterations, not against the triptych.
- **O10 visual baselines NOT regenerated.** The visual lane is expected red.
- **W5.6 GLB quantization (D8) not applied** — requested from the hero agent
  late; not confirmed landed.

### 9.4 Red gates and honest caveats

**The p90 ≤ 20 ms gate is NOT met.** Per operator decision O4, this ships
over-budget with the gap documented rather than cutting visual features to
pass.

**The measurements in this report are unreliable in absolute terms.** They were
taken on the operator's workstation while subagents were concurrently running
builds and test suites; load average sat at 3–4.6 throughout. Three consecutive
samples of identical code spanned 28.9–38.8 ms avg and 37.6–50.1 ms p90. The
*relative* before/after comparisons (draw calls, `drawDurationMs`,
`objectCount`) are solid because they are counters, not timings. **The frame
timings need a clean re-run on an idle machine** via
`npm run test:perf:reference` before any conclusion is drawn about A3–A5.

A second caveat: this hardware is an AMD Raphael **integrated** GPU. The
pre-existing build already ran at 29.2 ms / 34 fps with twenty ships, so it was
never smooth here. The bar "faster than it used to be" is met comfortably; the
bar "20 ms p90" may not be reachable on this GPU at 1080p regardless.

### 9.5 Recommended next session, in order

1. Clean-machine `npm run test:perf:reference` to get real numbers.
2. W6.2/W6.3 — get shadows and bloom back on; they are most of the remaining
   "stunning" gap. If the tier will not rise, consider decoupling shadow/bloom
   from the tier ladder and gating them on an explicit quality setting instead.
3. W6.6 — fix the washed-out day grade.
4. W5.3 — refine the four batched silhouettes (highest ship-count leverage).
5. W6.4 — water reflection.
6. O10 — regenerate visual baselines once the look settles.

---

## 10. Second pass — the N-series (same night, after operator review)

The operator reviewed the first pass and pushed back: too fast, not deep
enough. Five specific asks followed, then two more during execution. All of
this landed after §9 was written.

### 10.1 What the operator asked for

1. Harness the whole map — the fleet used ~30% of it and ships overlapped.
2. The cemetery must stop being an island and become a shipwreck sea zone.
3. There is barely any ship movement.
4. Harbours are barely noticeable; each must fly its chain's logo.
5. Ships still share a base hull; titans must be genuinely unique.
6. (mid-run) Fully zoomed out, the world is ~25% of the frame.
7. (mid-run) Still packed — 2x the map.

### 10.2 What landed

**N1 — the whole map.** Two separate faults, both measured rather than
guessed:

- The camera's zoom floor was a flat 0.48 while the map framed at ~1.09, so
  the world could be pulled back to 2.3x its own area. The floor is now
  derived from the viewport. Fleet screen footprint went 30% → 67% of canvas
  width.
- The grid then doubled to **112x112 — 4x the sea**. Terrain stays authored in
  the original 56-tile design space; `map-scale.ts` offsets landmasses (so the
  island keeps its exact size) and scales zone geometry (so every band gains
  proportional water). **Eligible water per ship: 10.1 → 58.5 tiles.**

Worth recording: an offline audit proved the blue-noise placement was already
near-optimal (0 fallbacks, 93% distinct cells). The packing was never a
placement bug — it was a framing bug and a map-size bug. Measuring first saved
rewriting a correct system.

**N2 — the ship graveyard.** `wreck-water` is a new terrain kind filling the
south-west corner (948 tiles), a first-class sea region with the lowest swell
and chop in the world. The cemetery islet is gone; dead stablecoins rest as
wrecks on open water, with memorial lanterns still burning on the freshest
hulls. It is the far pole from the north-east storm corner, so the map reads
danger at one end and memory at the other. No live ship is ever assigned
there, so the corner stays quiet by construction rather than by rule.

**N3 — real movement.** Patrols were 0.38–0.54 TILES at 0.017 rad/s: a
sub-tile circle taking six minutes. Amplitude is now sized to each band's own
water (a patrol that overran its region would carry a ship out of the water it
is labelled with), and the DEWS escalation moved to SPEED, tuned so linear
travel still climbs monotonically with turbulence. A display cap of 2.5 tiles
— set when the map was 56 wide — would have flattened every one of these, and
rose to 9. **Measured: 1.3–4.0 tiles per 12s, from ~0.02.**

**N4 — harbours** (delegated): real pier architecture, bollards, cranes,
warehouses, and per-chain flag logos from a shared atlas.

**N5 — fleet identity** (delegated): seven bespoke titans — USDT, USDC, DAI,
USDS, USDe, USD1, pyUSD — plus ten generic hero hulls, all quantized with
`KHR_mesh_quantization`.

**Look work alongside:** the Pharos mirror column (the tower standing
upside-down in the water, obeying its region's reflectivity — the concept
render's signature image, at no extra render pass); fleet lantern halos cut
from 3.0 to 1.7 units so 187 ships read as many small lights instead of one
warm wash; region tints raised so the seas read apart at whole-map framing;
shore shelf and world-boundary fade retuned for the larger sea.

### 10.3 Measured state at the end of the second pass

| | Start of night | Now |
| --- | --- | --- |
| Rendered ships | 20 | **187** |
| Fleet draw calls | ~2,700 at 187 | **7** |
| Map | 56x56 | **112x112** |
| Eligible water per ship | 10.1 tiles | **58.5** |
| Ship travel per 12s | ~0.02 tiles | **1.3–4.0** |
| Hero hull models | 2 shared | **17, 7 bespoke** |
| Frame (1080p, whole-map framing) | 29.2 ms / 34 fps at 20 ships | **21.5 ms / 46 fps at 187** |
| GPU draw calls / triangles | — | 377 / 273k (budgets 700 / 500k) |

Tests: 894 green. `npm run validate` clean.

### 10.4 Still open

- **A3/A4 remain unmet**: p90 is above 20 ms and the scheduler settles in
  `recovery`. Shadows and bloom now survive that tier, so the visual cost is
  paid, but the gate is not met. Per O4 this ships documented rather than by
  cutting features.
- The `constrained` tier still drops the whole composer, losing colour grading
  along with bloom (see §9.4) — unchanged, still worth fixing awake.
- Visual baselines are still not regenerated (O10).
- W5.3, refining the four batched silhouettes that carry ~160 of 187 ships,
  was handed over late and its status is unconfirmed.
- A comprehensive poetry/polish review was commissioned and had not reported
  by the end of the session.
