# SCENE — static geometry, materials, draw calls and culling

## 1. Scope and method

Research only; no tracked implementation files changed, no build/test/lint gates run, no worktree spike required. Read `AGENTS.md`, the research brief, architecture/runtime/testing documentation; audited `world/{island-system,materials,standin,kit,ground,lighthouse-system,sun}.ts`, `engine/{engine,static-merge,camera-rig,post,quality}.ts`, `layout/{layout-system,framing}.ts`, ocean geometry/waves, civic static assembly, UI culling, the island exporter and installed three.js BatchedMesh implementation. `world/textures.ts` does not exist at HEAD; ocean textures are separate, and `ui/cull.ts` only culls overlapping DOM labels, not scene geometry.

Artifacts live in `outputs/need-for-speed/scene/`:

- `census.js`: complete per-renderable census: geometry/index counts, instance counts, material flags, visibility, culling/shadow flags, merge naming, render order, bounds and render-list membership. Later instrumentation brackets object main/shadow draws and reads actual renderer triangle/call deltas. Instanced *shader-displaced* objects' base bounding boxes are NOT their true world footprints.
- `overview.json/.png`: initial requested dev-origin census. **Rejected for steady-state accounting**: eval saw an incompletely initialized scene (empty render list and no stats), while subsequent screenshot/stats showed the populated world. The PNG was inspected. This demonstrates why the first-frame hook alone is insufficient for a complete deferred-system census.
- `overview-prod.json/.png`: production bundle + real API origin (`4180`), AMD Raphael iGPU, 1600×1000@1; valid populated overview census. Its two-frame callback sample includes one shadow refresh. Raw geometry count is not identical to submitted triangles for BatchedMesh.
- `project.mjs` → `projection.json`: Node GLTFLoader + shipped Meshopt decoder parses the actual island asset, applies authored camera and node transforms, computes six-plane triangle rejection and projected triangle areas for overview, heart and closest allowed zoom. Not an image-quality or GPU test.
- `chunks.mjs` → `chunks.json`: lossless *position-only planning probe*: assigns existing opaque island triangles to centroid-based spatial bins; measures per-view retained triangles using conservative chunk AABBs and bounding spheres. It does not rewrite an asset or claim measured frame-time improvement.
- `source-budgets.json`: reproducible camera/ocean/readback arithmetic.

Commands exercised: `git status --short`; `npm run onboard:agent`; `npm run preview -- --url http://localhost:5173/?view=overview&t=12 --igpu ... --seconds 3 --eval ...`; `node outputs/need-for-speed/scene/capture.mjs overview-prod overview --igpu`; `node outputs/need-for-speed/scene/project.mjs`; `node outputs/need-for-speed/scene/chunks.mjs`. Capture runner invokes only the approved `npm run preview` path. Shared measurement lock was saturated; early interrupted/queued attempts are not measurements. All recorded timing is **contended**, not quiet-machine performance.

## 2. Measurements and scene census

### 2.1 Overview census: top 30 renderables by geometry triangle budget

Populated `4180` overview, one census; deterministic geometry counts. `I` = explicit InstancedMesh count, otherwise 1; shader-instanced geometries also multiply their instance count into the triangle budget. `M` = already merged. `C/R` = casts/receives shadow. Unless noted all listed objects are effectively visible and appear in the main render list. These are **geometry budgets, not a claim that every triangle reaches the rasterizer**; fleet is already BatchedMesh and internally culls instances.

| # | Mesh / system | Triangles | I | M | C/R | Frustum culled |
|---|---|---:|---:|:---:|:---:|:---:|
| 1 | island-merged-hb_kit / island | 284,797 | 1 | yes | yes/yes | yes |
| 2 | ocean | 131,072 | 1 | no | no/no | no |
| 3 | civic-merged-hb_kit | 58,210 | 1 | yes | yes/yes | yes |
| 4 | life-townsfolk | 52,920 | 210 | no | yes/yes | no |
| 5 | shipyard-hulls / civic | 35,440 | 1 | no | yes/yes | yes |
| 6 | chart-lettering / first layer | 26,124 | 1 | no | no/no | no |
| 7 | chart-lettering / second layer | 26,124 | 1 | no | no/no | no |
| 8 | harbour-fleet / BatchedMesh | 25,962 geometry budget | batched | no | no/yes at snapshot | yes |
| 9 | harbour-house-flags | 24,420 | 407 | no | no/no | no |
| 10 | identity-pier-marks | 14,016 | 73 | no | yes/no | yes |
| 11 | civic-workers | 8,064 | 42 | no | yes/yes | no |
| 12 | pharos-merged-hb_kit | 7,755 | 1 | yes | yes/yes | yes |
| 13 | shakkei / island | 3,966 | 1 | no | no/yes | yes |
| 14 | life-drift | 3,600 | shader-instanced | no | no/no | no |
| 15 | civic-merged-hb_emissive | 1,126 | 1 | yes | no/yes | yes |
| 16 | island-merged-hb_emissive | 1,107 | 1 | yes | no/yes | yes |
| 17 | weather-ground | 1,050 | shader-instanced | no | no/no | no |
| 18 | life-flags | 946 | 1 | no | no/yes | no |
| 19 | wheel / mint | 796 | 1 | no | no/yes | yes |
| 20 | island-merged-hb_window | 760 | 1 | yes | no/yes | yes |
| 21 | harbour-light-sprites | 748 | shader-instanced | no | no/no | no |
| 22 | harbour-light-pillars | 748 | shader-instanced | no | no/no | no |
| 23 | crane_0_wheel | 716 | 1 | no | yes/yes | yes |
| 24 | crane_1_wheel | 716 | 1 | no | yes/yes | yes |
| 25 | crane_2_wheel | 716 | 1 | no | yes/yes | yes |
| 26 | life-gulls | 658 | 14 | no | no/no | no |
| 27 | identity-crest-flags | 576 | 8 | no | no/no | no |
| 28 | life-smoke | 574 | shader-instanced | no | no/no | no |
| 29 | offices-merged-hb_kit | 490 | 1 | yes | yes/yes | yes |
| 30 | civic-merged-hb_window | 417 | 1 | yes | no/yes | yes |

Consult raw JSON for exact material flags rather than treating this abbreviated table as a replacement for the census. Some actor material shadow-receive flags depend on their specialized implementation.

Initial populated overview contained **75 renderables, 69 main render-list entries (49 opaque, 20 transparent, 0 transmissive), 19 castShadow flags, and 39 renderables with frustumCulled=false**. Renderer final sample: 97 draws, 893,294 submitted triangles, 135 resident programs, 52 textures, medium quality, DPR 1; p50 83.30 ms, 12 fps, reported last GPU sample 64.13 ms. These are **one contended diagnostic run**, not a replacement for the measurement owners' baselines. Census-time submitted triangles were 812,458; frame-to-frame values change with cached shadow refresh and actors. Do not compare those directly to the brief's **no-data/high-tier 1,166,416** frame.

#### Draw-call breakdown by system, populated overview

The census sampled two main frames and one shadow refresh. Main column is render-list / object-draw callbacks per frame; shadow column is callbacks on that refresh. It deliberately separates world objects from composer and offscreen systems; BatchedMesh dispatch and zero-instance draws require the later actual-counter instrument to distinguish callbacks from physical driver calls.

| System | Renderables | Main callbacks/frame | Shadow callbacks/refresh |
|---|---:|---:|---:|
| Island + tide gauge | 9 | 9 | 3 |
| Ocean | 1 | 1 | 0 |
| Civic (includes actors/FX) | 30 | 28 | 9 |
| Life | 5 | 5 | 1 |
| Identity + office dressing | 7 | 7 | 3 |
| Fleet + flags/lines | 6 | 4 | 0 |
| Lighthouse + fire | 9 | 9 | 2 |
| Weather | 4 | 2 | 0 |
| Lights | 2 | 2 | 0 |
| Sky | 1 | 1 | 0 |
| Beam halo | 1 | 1 | 0 |
| **World total** | **75** | **69** | **18** |

The measured renderer total97 includes auxiliary/offscreen/post work; do not assign the remaining difference to static island draw calls. Assembled civic/identity draw counts can vary with API data, as can fleet visibility.

### 2.2 Where the triangles really are

The shipped island GLB contains 290,834 triangles; four opaque chunks account for **284,797 (97.9%)**: EN 38,819; ES 102,566; WN 48,158; WS 95,254. Trees, buildings, rocks, piers and terrain have already been flattened into these chunks: a runtime census cannot honestly attribute individual tree triangles without exporter/source instrumentation. Runtime merges all four opaque chunks to one 284,797-triangle mesh (`island-system.ts:47-50`). Its geometry is **632,450 vertices / 21,126,164 attribute+index bytes** after the material port. Shakkei is only 3,966 triangles and already does not cast shadows (`island-system.ts:51-52`).

The ocean is a fixed **256×256-cell grid = 131,072 triangles / 66,049 vertices / 2,365,452 bytes**, not millions of ocean triangles (`ocean-system.ts:43-73`). Lighthouse merged tower/statue is only **7,755 triangles**. Civic opaque static content is **58,210**, plus shipyard display hulls **35,440**; this is larger than the lighthouse and merits inclusion in static culling work. Data/actors account for a separate sizable budget; see ACTORS findings, not a static-geometry reduction disguised as a data-mapping change.

The brief's 1.17 M is a **frame's submitted triangles across main, shadow and auxiliary draws**, not 1.17 M distinct island triangles. High-tier redraws shadows every frame; lower tiers cache them. Never budget a geometry reduction as a 1:1 reduction in that aggregate without identifying its passes.

### 2.3 Triangle-versus-pixel analysis (actual asset, deterministic Node projection)

At 1600×1000, FOV 25°, target-plane metres/pixel = `2 * distance * tan(12.5°) / 1000` (`camera-rig.ts:63-65`).

| View | Distance | Pitch | Target-plane m/px | 1 m projected span |
|---|---:|---:|---:|---:|
| closest allowed, heart target | 90 m | 26° | 0.039905 | 25.06 px |
| heart | 650 m | 26° | 0.288203 | 3.47 px |
| overview | 1,000 m | 30° | 0.443389 | 2.26 px |
| maximum zoom out | 1,150 m | preset-dependent | 0.509898 | 1.96 px |

These are target-plane scales, not constant depth-independent sizes; ground-plane foreshortening and objects closer/farther than target matter. Near/far planes dynamically become `max(1,d*.05)` / `d*12` (`camera-rig.ts:85-92`). Authored bounds are layout min/max 90/1150, not the class's initializer max900. `framing.ts:59-90` can increase camera distance on narrow supported viewports; `layout-system.ts:69-80` extends max distance accordingly. LOD thresholds must use projected error, not only a hardcoded desktop distance.

| Island opaque triangle statistic | Overview | Heart | Closest |
|---|---:|---:|---:|
| submitted by merged mesh when drawn | 284,797 | 284,797 | 284,797 |
| completely outside ≥1 clip plane | 2,356 (0.83%) | 156,356 (54.90%) | 273,950 (96.19%) |
| fully inside all clip planes | 282,403 | 127,343 | 9,912 |
| fully-inside triangles with projected area <0.25 px² | 132,277 | 42,321 | 625 |
| fully-inside triangles <1 px² | 189,011 (66.93%) | 66,414 (52.15%) | 1,207 (12.18%) |
| fully-inside triangles <4 px² | 238,430 | 91,656 | 2,171 |

Projected areas are geometric areas, **not occlusion-aware visible pixels**, and are not permission to discard all small triangles: fences, roof edges, tree silhouettes and tiny high-contrast features can still matter. But the numbers establish two different opportunities: **far-view geometric detail is predominantly subpixel; near-view waste is predominantly offscreen**, so one blunt global decimation is the wrong design.

### 2.4 Chunk size versus draw count: measured planning trade-off

Lossless centroid regrouping of the actual 284,797 opaque island triangles; AABB and conservative bounding-sphere tests. Table uses **sphere results**, closer to Three's ordinary mesh/BatchedMesh culling. Bounding spheres here are the conservative sphere enclosing each chunk box; a vertex-fit sphere can be tighter. No asset is modified.

| Grid / nonempty chunks | Overview chunks / triangles | Heart chunks / triangles | Closest chunks / triangles |
|---|---|---|---|
| 2×2 / 4 | 4 / 284,797 | 4 / 284,797 | 3 / 240,386 |
| 4×4 / 16 | 16 / 284,797 | 13 / 278,348 | 4 / 82,615 |
| 8×8 / 56 | 54 / 284,277 | 36 / 233,075 | 10 / 46,338 |
| 16×16 / 191 | 180 / 283,976 | 103 / 178,811 | 19 / 40,302 |

AABB tests for 8×8 retain 218,434 triangles at heart and the same 46,338 closest. **Simply undoing the current four-to-one merge is not enough**: all four chunks overlap the heart frustum, and their spheres are very large near minimum zoom. **Blindly switching to 191 separate Mesh draws is also wrong**: overview would add 179 main draws to save only 821 triangles. A batched or zoom-switched representation is needed, with real-device testing.

BatchedMesh already exists in the fleet (`fleet-system.ts:290-296`, per-object culling on, sorting off). Installed Three supports per-object sphere culling and applies it separately for shadows (`node_modules/three/src/objects/BatchedMesh.js:1523-1690`). Reuse that pattern rather than inventing a batching layer. Its draw-dispatch win depends on `WEBGL_multi_draw`; ordinary per-chunk draws are an alternative only at close zoom where the geometry win is substantial.

**Non-obvious visual dependency:** `materials.ts:419-420` uses `USE_BATCHING` to mean *moving hull*, reducing snow cover to 40%. A naive static BatchedMesh conversion would alter scenery. Separate moving-hull semantics from batching first. `injectVaryings` (`474-484`) also handles instancing but not a batching matrix; identity batch transforms with world-baked vertices avoid that specific mismatch, while general transformed static batches need correct local/world varyings and window centres.

## 3. Findings / opportunities

All unmeasured gains below are explicitly estimates. Offline retained-triangle counts are measurements; their translation to frame time is not measured. Avoid summing overlapping geometric/shadow opportunities.

| ID | Opportunity | Evidence | Proposed change | Expected gain / estimation method | Visual impact and verification | Effort | Risk | Dependencies / conflicts | Confidence |
|---|---|---|---|---|---|:---:|---|---|:---:|
| SCENE-01 | Bake the static ground/AO field outside boot | `ground.ts:39-85`, `island-system.ts:55-58`: 1024² RGBA32F render, synchronous readback, R extraction; `ground.ts:21-34` 512² max pool | Generate height/AO data alongside the island asset; load equivalent Red height texture + CPU heights + AO texture instead of rendering/readPixels at boot. Preserve bounds, orientation, FLOOR and interpolation exactly. | Removes **one full-island top-down render, 16 MiB synchronous GPU→CPU readback, 4 MiB extraction loop and 512² max-pool conversion**. **[estimate] 10–60 ms desktop boot** from the 117 ms whole-island baseline ceiling; iGPU may gain more, not isolated. Adds baked transfer bytes, so measure net cold load; raw exact height+AO is 4.5 MiB before compression. | **none** with exact precomputed data; quantized height alternative is **marginal/visual-risk** until checked. Compare heightAt samples and daytime/night pools, piers and AO at closest zoom. | M | Stale asset mismatch; compressed bytes can outweigh CPU savings on cold links | GLB exporter/asset-loading slice; do not also count fused dequant/merge savings as this gain | H for eliminated work, M for net load win |
| SCENE-02 | Spatial static batching rather than one island-wide mesh | `island-system.ts:47-50`; `chunks.json`; civic static merge similarly spans all plots | Keep spatial chunks (start 8×8 planning bins), batch same-material opaque geometry with the existing BatchedMesh pattern, or use few close-only Mesh chunks. Maintain independent shadow-frustum visibility; keep main/ground representations coherent. | **Measured geometry opportunity:** 8×8 conservative sphere grouping saves **51,722 island triangles/main pass at heart (18.2%)**, **238,459 closest (83.7%)**; overview saves only520. Shadow savings depend on light frustum. **[estimate] 0–1 ms desktop / 0–4 ms iGPU**; deliberately broad until sensitivity test, can regress if draw dispatch increases. | **none** geometrically; visual-risk implementation until batch snow/world/window semantics corrected. Verify all seasons, pan bounds, minimum zoom and offscreen-caster shadows; opaque sorting can change tiny z-fighting. | M–L | Driver extension, shader variant and culling CPU overhead; far-view draw explosion | Fleet BatchedMesh patterns; shader slice; source/exporter chunking; avoid adding separate whole-island copies unnecessarily | H counts, M implementation, L ms |
| SCENE-03 | Camera-aware ocean tessellation; keep the close grid | `ocean-system.ts:43-73,184-186`; `waves.ts:10-17`; source-budgets.json | Coarser far-view grid or visible-region patch/rings, with full current geometry at close zoom; never change sea-state wave/data mapping. First test192 rather than blindly halving to128. | 256→192: **57,344 fewer triangles (43.75%)**, **1,476,096 fewer geometry bytes (62.4%)**, because indices also become Uint16. 128 would save98,304 triangles/1,969,152 bytes but has greater wave/silhouette risk. **[estimate] 0–0.3 ms desktop / 0–1.5 ms iGPU**, geometric fraction not a whole-frame speedup. | **marginal only after verification** across all sea states, foam, hull contact and far coastline; otherwise **visual-risk**. Current inner cells≈4.98 m versus smallest9.5 m swell; 192 gives≈6.64 m, so geometric aliasing is a genuine constraint. Fragment-normal detail does not prove displaced geometry unchanged. | M | Cracks/transitions, wave interpolation/coast aliasing, vertex/fragment normal mismatch | Ocean shader owner; LOD transition hysteresis or continuous mesh approach; shared sea meaning untouched | H counts, M suitability, L ms |
| SCENE-04 | Selectively restore backface culling on authored one-sided opaque meshes | `materials.ts:520-525` defaults every kit material to DoubleSide; exporter already removes deeply back-facing/drowned island faces (`hb_export.py:324-348`); wreck exporters explicitly duplicate reversed faces | Audit per-asset winding and intentional two-sided surfaces, then use a cached FrontSide material variant for proven one-sided meshes. Do **not** globally flip the kit or remove documented duplicated front/back art. | **[estimate] 0–15% of opaque fragment/shadow raster work**, not triangles submitted and not15% whole-frame. Upper bound comes from rejecting hidden/back-facing faces; exporter already culls many island backfaces, so island-only benefit may be near zero. No network-byte saving without exporter changes. | **visual-risk until audited**, then none for genuinely one-sided geometry. Compare silhouettes, tree undersides, walls/roofs and every pan/closest framing; check shadows from light-side backs, not just camera view. | S–M | Open meshes and reverse-wound faces vanish; extra material variant/program cost | GLB/civic authorship contracts; shader compilation plan | M–L |
| SCENE-05 | Source-authored far LOD, not blind whole-asset simplification | `projection.json`: 189,011 island triangles <1 px² in overview; exporter flattens per-face colour/pattern data | Reduce *authored* distant prop/crown detail before chunk flattening; preserve coastline, roof silhouette, pattern-ID boundaries and named semantic nodes. Switch back to full detail by screen error at close zoom; tree impostors only if lighting/season/shadow equivalence is demonstrated. | **[estimate / exploratory target] 25–50% of284,797 opaque island triangles =71k–142k/main pass**, potentially again on shadow refresh. Not an achieved reduction. GLB slice's actual attribute-safe generic simplifier achieved only6,256 triangles (2.15%) and worsened gzip, so generic meshopt is NOT this proposal. No honest ms/transfer estimate before a source-authored prototype. | **visual-risk**, potentially marginal after side-by-side captures at supported sizes, noon/night/winter and pan extremes; close mesh must remain unchanged. | L | Semantic COLOR_0.a corruption, facet/paint changes, transition pops, duplicate LOD bytes | GLB/authoring work; source tree/detail inventory required; competes with chunking/overlapping shadow gains | L |
| SCENE-06 | Fine-feature static shadow proxies, only if shadow work is proven limiting | `sun.ts:39-49,53-91`; merged island is284,797 caster triangles; current 2048/4096 fitted shadow map | Keep visible meshes untouched; author conservative per-chunk caster proxies or lower-detail caster-only representation for sub-texel features. Never disable all shadows or use main-camera visibility to hide offscreen casters. | **[estimate / target] 25–50% of284,797 island triangles on shadow-refresh frames =71k–142k**, zero improvement on cached frames. At observed overview medium fit832 m/2048, one shadow texel≈0.406 m (high≈0.203 m). Whole-frame gain unmeasured and may be negligible. | **visual-risk**: thin railings, trees and long low-sun shadows can matter even below one texel. Verify sunrise/noon/night and closest view; shadow footprint differs from main visibility. | M–L | Shadow leaks, lost fine silhouettes; maintenance of separate asset representation | Shadow/render pipeline owner; do only after GPU sensitivity evidence; overlaps far LOD | L |

### Loading-related ownership boundaries

GLB slice owns **fused dequantize+merge** (avoid decoding four opaque chunks into temporary float buffers and copying them again) and confirms normalized colour bytes are already preserved in `dequantizeForPatterns`/`static-merge`. Its measured generic simplification result above is referenced rather than re-proposed. ACTORS owns the civic `worldGeometry` float promotion/copy chain, which differs from the general static merger and must retain window centres and shared-source ownership. These are good scene-adjacent loading opportunities, but their gains must not be double-counted under this table.

## 4. Depth, transparency, shadows and draw-call conclusions

- **One shadow-casting directional key, no cascades**; fill and hemisphere do not cast; lighthouse point lights do not cast. PCF shadow map, initial/high4096², medium/low2048² (`engine.ts:75-76`, `sun.ts:39-49`, `quality.ts:28-30`). Fitted to camera footprint and island bounds, not a permanent world-sized map. Medium refreshes≤30Hz and low≤15Hz while still; this caching has already shipped. Do not propose it as new.
- Opaque kit and only opaque kit generally casts; window/glass/emissive shadows are already excluded (`materials.ts:799-801`). Shakkei is already excluded. Static detail behind/under terrain may still submit to the shadow pass, but a source-camera-hidden face can cast a visible shadow; broad camera-based shadow removal is unsafe.
- Existing merges are extensive: island by material, lighthouse tower+statue, civic still parts across buildings, office dressing and tide pins. Flags, actors and lights are instanced; fleet is BatchedMesh. The runtime is not suffering hundreds of repeated static prop Mesh draws. **Texture atlasing/array textures cannot merge the island's opaque draw further: it is already one vertex-coloured/procedural material draw.**
- General `mergeStaticMeshes` groups by **material identity, attribute layout, shadow flags, renderOrder and layers**, rejects hidden/instanced/skinned/morphing/hooked meshes, freezes merged local matrices and sets bounds (`static-merge.ts:16-60`). Preserve these safety distinctions. Merging every system into one object would make culling, dynamic parts and lifecycle ownership worse for only a handful of saved draws.
- Overview has20 transparent render-list entries. Large transparent overlays, rather than island glass alone, include **two26,124-triangle chart-lettering layers**, order61/62, DoubleSide, depthWrite=false; weather overlays order79/80; smoke order2/3; additive flames/glints order11/12; light pillars/sprites. These can overlap sea/island and one another. Identity/ocean/weather owners should account for their shader/fill cost; no measured evidence here supports deleting them without changing scenery.
- Glass has opacity0.22, DoubleSide, depthWrite=false (`materials.ts:759-766`). Thin lantern glass is small; do not expect a meaningful full-frame improvement by removing it. Transparent DoubleSide may use two physical passes depending on `forceSinglePass`; raw render-list count alone is not physical draw count. A `forceSinglePass` experiment is only appropriate for proven billboard/single-layer effects and must check ordering—many current ShaderMaterials already avoid the expensive standard-glass path.
- Ocean is opaque and **renderOrder60**, deliberately after opaque land and sky order50 for early depth rejection (`ocean-system.ts:184-187`). Do not “optimize” it to render first or enable unnecessary transparent sorting. `frustumCulled=false` is reasonable for a world-sized sea whose vertices move; chunking/visible-region geometry is the relevant optimization, not merely toggling the boolean.
- Resident **program count is not draw count** and should not be optimized by counting material names alone. Shader owner found34 program pairs differing by target output colour space:97→63 normalized variants. Material cache sharing already works; proper-target precompile belongs to GPUINIT, not another scene-material consolidation convention.

## 5. Ruled out / not worth it

1. **Global island decimation / blanket tree impostors / removing scenery**: risks silhouettes, per-face paint, seasons, COLOR_0.a pattern IDs and closest zoom. The generic simplification experiment from GLB actually saved only2.15%; neither50% nor a large byte win is demonstrated.
2. **Undo four-chunk merge and call it culling**: measured four chunk spheres retain all284,797 triangles in heart and240,386 closest; not enough for its extra draws.
3. **Fine ordinary Mesh chunking everywhere**: 16×16 needs180 overview draws to save821 triangles. Use batching or close-only representation; do not regress far view.
4. **More texture atlases for opaque island draw calls**: no meaningful target; already one procedural vertex-colour material draw. Baking procedural materials to new textures would add transfer/upload burden and change scale-dependent effects.
5. **Disable shadows/casters wholesale, smaller shadow maps as a new discovery, cascade changes**: shadows are part of scenery; existing quality tiers already reduce map size/refresh. No cascades to remove.
6. **Reduce lighthouse polygon count first**:7,755 triangles versus284,797 island and131,072 sea. Protect the hero silhouette; prioritize larger budgets.
7. **Enable generic frustum culling on all shader-instanced objects using base geometry bounds**: invalid bounds will pop people/flags/weather/lights; their geometry positions are not their world instances. Actor slice owns correct bounds/activity culling.
8. **Freeze/remove dozens of static transform nodes as a headline win**: possible small CPU cleanup but no timing evidence and far below actor counts; existing merged meshes already have matrixAutoUpdate=false. Do not promise milliseconds.
9. **Tiny ocean grid254 as a headline FPS win**: it saves810,960 bytes (34.3%) via Uint16 indices but only2,040 triangles (1.56%); a possible memory/upload alternative, not a demonstrated runtime winner. Exact two-patch partition keeps the256 geometry but adds a draw; not justified without a memory/driver bottleneck.
10. **Treat rejected initial dev capture or one contended83ms frame as a stable hardware baseline**: invalid; use owners' repeated measurements and the sensitivity experiment for direction only.

## 6. Open questions needing operator decision

- Is a generated ground/AO asset acceptable if its net cold-transfer bytes increase? Exact Float32 height bytes preserve behavior; compact quantized heights need a defined acceptable placement/lighting error and cold-load measurement before adoption.
- Source-authored LOD/impostors and caster proxies require art review; no operator should approve a numeric triangle target as evidence that appearance has already been preserved.
- Which supported platforms must retain a benefit without `WEBGL_multi_draw`? The existing fleet already relies on BatchedMesh fallback behavior, but static chunking must not multiply slow-platform draw dispatch at overview.
- No blocker for source research. Runtime timings in this shared session are contended; no quiet timing or broad seasonal/pan visual equivalence is claimed.

## 7. Final real-GPU three-view census and sensitivity experiment

After FRAME released capture priority, ran **one batched `igpu-uncapped` capture** through `node outputs/need-for-speed/scene/views.mjs`. An initial batched attempt failed because production CSP rejects nested string `eval`; the corrected runner inlines function literals and succeeded. Complete per-mesh JSON for **all three views** and nine A/B blocks: `outputs/need-for-speed/scene/views.json`. Final closest screenshot `views.png` was inspected. No renderer/asset source was edited.

Settings: production bundle with real API at4180, AMD Raphael ACO/ANGLE GL,1600×1000, medium tier and DPR1 pinned. Overview distance1000; heart650; closest90.0011 after damping toward allowed90. Each census brackets **two main frames** and reads actual renderer call/triangle deltas per object. Shadow columns below cover **one observed shadow refresh in that sample**, not every frame.

### Actual world draw-call breakdown across views

| System | Overview main/frame | Heart main/frame | Closest main/frame | Overview shadow/refresh | Heart shadow/refresh | Closest shadow/refresh |
|---|---:|---:|---:|---:|---:|---:|
| Island + tide | 9 | 9 | 4 | 3 | 3 | 3 |
| Ocean | 1 | 1 | 1 | 0 | 0 | 0 |
| Civic | 28 | 27 | 13 | 9 | 9 | 6 |
| Life | 5 | 5 | 5 | 1 | 1 | 1 |
| Fleet + flags/lines | 3 | 3 | 3 | 0 | 0 | 1 |
| Identity + offices | 7 | 7 | 7 | 3 | 3 | 3 |
| Lighthouse + fire | 9 | 9 | 6 | 2 | 2 | 2 |
| Weather | 2 | 2 | 2 | 0 | 0 | 0 |
| Lights | 2 | 2 | 2 | 0 | 0 | 0 |
| Sky | 1 | 1 | 1 | 0 | 0 | 0 |
| Beam halo | 1 | 1 | 1 | 0 | 0 | 0 |
| **World total** | **68** | **67** | **45** | **18** | **18** | **16** |

Zero-instance/zero-range objects explain callback/render-list totals exceeding physical calls. Composer/offscreen draws are additional. Snapshot renderer totals were115 overview,91 heart and84 closest, with submitted triangles1,357,985 /770,278 /1,166,738 respectively; last-frame shadow refresh status differs, so these are **not comparable steady-state averages**.

| Actual main-pass triangles | Overview | Heart | Closest |
|---|---:|---:|---:|
| All world renderables | 890,334 | 767,764 | 635,805 |
| Island merged opaque | 284,797 | 284,797 | 284,797 |
| Ocean | 131,072 | 131,072 | 131,072 |
| Civic merged opaque | 58,210 | 58,210 | 58,210 |
| Shipyard display hulls | 35,440 | 35,440 | 0 |
| Pharos merged opaque | 7,755 | 7,755 | 7,755 |
| Fleet system including flags | 222,874 | 100,304 | 8,515 |

**Batched geometry count is not submitted instance triangle count**; the top30 table remains explicitly a raw geometry budget. Actual per-object submitted main/shadow triangle deltas are in final JSON.

Runtime opaque-island clip counts match offline analysis exactly:2,356 /156,356 /273,950 triangles completely outside overview/heart/closest. Civic opaque has23,621/58,210 outside heart and54,276/58,210 outside closest. Pharos still submits7,755 when7,665 are completely outside closest. Ocean submits131,072 when77,701 /99,305 /129,214 undeformed triangles are outside overview/heart/closest; these ignore wave displacement and must not become an unsafe culling mask.

**Offscreen shadow example:** closest shipyard display hulls have zero main calls/triangles but one shadow call/35,440 triangles; all35,440 are rejected by the main-frustum triangle test. That does not prove useless shadow work: light-frustum visibility and visible receivers differ. Never hide casters solely from main clipping.

### Contended iGPU triangle-versus-fill sensitivity

Three sequential repeats per condition, alternating baseline → half pixels → hidden island;≈1.1s sampled after0.55s settling per block. Scene restored before final closest screenshot. Half pixels changes DPR1→0.7071 and composer size with geometry fixed. Hide-island removes three merged island materials plus shakkei, leaving ground/service data. Both are diagnostics, not scenery-preserving variants.

| Condition | Per-repeat rAF p50 ms | Median of p50s | Per-repeat reported GPU median ms | Median of GPU medians |
|---|---|---:|---|---:|
| Baseline | 29.1,43.2,14.6 | 29.1 | 61.27,56.01,58.88 | 58.88 |
| Half pixel count, same geometry | 38.5,40.5,8.0 | 38.5 | 37.32,35.08,37.07 | 37.07 |
| Hide island, full pixel count | 47.0,44.3,12.0 | 44.3 | 47.60,43.25,41.86 | 43.25 |

GPU-sample medians fell37.0% with half the screen pixels,26.5% hiding island geometry/material/shadow work. This supports **substantial fill/screen-pass cost as well as island cost**, not purely triangle-bound rendering. rAF results are contradictory and highly contended; later repeats improve sharply, and the asynchronous governor timer is back-pressure-sensitive. **No reliable causal FPS/millisecond win is established for a triangle-only reduction.** Hiding island also changes fragment shading, occlusion and shadows; water beneath removed land remains SDF-masked. Do not extrapolate a26.5% production speedup from this diagnostic.

All requested views and the diagnostic were exercised. Remaining limitations: quiet isolated performance attribution and seasonal/pan visual equivalence of future implementations, **not missing research captures**.
