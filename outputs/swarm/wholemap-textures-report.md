# Whole-map texture gate report

Date: 2026-09-02
Unit: Swarm A6 / Wave 1 Task 0
GPU: Apple M5 Pro, ANGLE Metal, 1600×1000, 185 ships

## Result

The whole-map animated arm now passes at the existing ceiling: **72 textures**
(79 before). The default animated arm is **70**, the reduced default arm is
**67**, and the reduced whole-map arm is **70**. No budget was raised.

The census now reports both the original scene walk and the expanded owner
manifests. All four arms found 42 scene-referenced textures, 80 named/reachable
textures, and `minimumUnattributedRendererTextures: 0`.

## Diagnosis and fix

The seven whole-map-only resident textures were N8AO resources:

| Owner | Textures | Before whole-map | After whole-map |
| --- | ---: | ---: | ---: |
| `post.n8ao.accumulation` | 1 | resident | not resident |
| `post.n8ao.blue-noise` | 1 | resident | not resident |
| `post.n8ao.output` | 1 | resident | not resident |
| `post.n8ao.read` | 1 | resident | not resident |
| `post.n8ao.write` | 1 | resident | not resident |
| `post.n8ao.depth-downsample` | 2 | resident | not resident |
| **Total** | **7** | **7** | **0** |

`GardenOverviewLod` begins its animated detail value at 1 and eases to zero.
The post chain was reading that eased value, so the first whole-map frame
enabled N8AO and uploaded all seven targets before the LOD reached its hidden
state. Disabling the pass did not release those GPU allocations. The renderer
now sends `overviewLodTargetDetail(camera.zoom)` to the post chain at the
hidden zoom, while retaining the eased value in the transition band and at
default/detail zooms. This prevents first use without changing the settled
whole-map image.

The census extension adds a `GardenPost.getTextureManifest()` for composer,
N8AO, bloom, tilt-shift, god-rays, LUT, dither, and SMAA resources. Scene-scope
manifests cover both wake targets, lane data, PMREM/SH textures, and the shadow
map. Resident WebGL handles are also reported per owner; nonresident allocated
objects such as the unused composer copy target and bloom fallback target stay
named but do not inflate `renderer.info.memory.textures`.

## Gate measurements

The “before” values below are the inherited scene-only gate measurements. The
owner table that follows is the pre-fix instrumented snapshot, which names the
resources while the whole-map N8AO targets were still resident. In the owner
table, `N/R` means `N` named resources and `R` resident WebGL handles.

| Framing | Arm | Before renderer textures | Before scene / internal | After renderer textures | After named / min unattributed |
| --- | --- | ---: | ---: | ---: | ---: |
| default | animated | 72 | 42 / 30 | 70 | 80 / 0 |
| whole-map | animated | 79 | 42 / 37 | 72 | 80 / 0 |
| default | reduced | 67 | 42 / 25 | 67 | 80 / 0 |
| whole-map | reduced | 70 | 42 / 28 | 70 | 80 / 0 |

### Attributed owner table

| Owner group | Default before | Whole before | Default after | Whole after |
| --- | ---: | ---: | ---: | ---: |
| Scene graph owners (ships, water, island, flag, fleet sail, signs, lantern) | 39 / 30 | 39 / 39 | 39 / 30 | 39 / 39 |
| Scene systems (PMREM, SH cube, lane, shadows, wake A/B) | 7 / 7 | 7 / 7 | 7 / 7 | 7 / 7 |
| Post composer (input/output/depth/copy) | 7 / 6 | 7 / 6 | 7 / 6 | 7 / 6 |
| Post N8AO | 7 / 7 | 7 / 7 | 7 / 7 | 7 / 0 |
| Post bloom pyramid | 10 / 10 | 10 / 10 | 11 / 10 | 11 / 10 |
| Post other (tilt-shift, rays, LUT, dither, SMAA) | 9 / 8 | 9 / 8 | 9 / 8 | 9 / 8 |
| **Total named / resident in owner map** | **79 / 70** | **79 / 79** | **80 / 68** | **80 / 70** |

The default and whole-map “before” owner snapshots were captured on the same
Apple M5 Pro through the real-GPU `preview` lane. Default resident sail
textures vary with visibility/upload timing; the gate summary uses the
documented 72-texture default baseline. The important stable delta is the
whole-map N8AO family: 7 resident before, 0 after.

## Visual and validation checks

The post-gating change only avoids N8AO’s transient first use at a zoom where
the settled LOD already disables it. Reduced static captures were inspected
against `outputs/w0-final-day.png` and `outputs/w0-final-wholemap.png`; the
island, fleet, water, signs, grade, and framing remain unchanged.

Passing commands:

```text
env -u CI npm run preview -- --url http://localhost:5206 --assert --hash "#cam=0,0,0.28"
env -u CI npm run preview -- --url http://localhost:5206 --assert
env -u CI npm run preview -- --url http://localhost:5206 --assert --reduced --hash "#cam=0,0,0.28"
env -u CI npm run preview -- --url http://localhost:5206 --assert --reduced
npm test -- src/three src/renderer       # 51 files, 643 tests
npm run typecheck
```

## Fix round 1 — transition lifecycle

Review found that the fresh-load optimization was being applied on every
crossing below zoom 0.44. That sent zero to the post chain immediately while
`GardenOverviewLod.detail` was still easing, so AO contact shading could pop
off before the props it grounded had faded. It also prevented first use but did
not solve a visitor who allocated N8AO at default zoom and later pulled out.

The renderer now has a one-shot initial-overview suppression state. It skips
N8AO only when the renderer starts at the settled-hidden framing; after that it
always forwards the scene's eased detail. At exact settled zero, `GardenPost`
disposes only N8AO's six texture-owning objects (seven GPU handles because the
half-resolution depth target has color and depth attachments). The pass,
materials, fullscreen geometry, and target objects remain warm and are reused;
Three recreates their GPU handles lazily on zoom-in.

| Same headed hardware session | Calls | Triangles | Textures | p95 / max | Dropped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default before zoom-out | 251 | 347,865 | 71 | 17.6 / 17.7 ms | 0 |
| First settled whole-map | 247 | 374,504 | 72 | 17.6 / 17.6 ms | 0 |
| Zoom-in after release | 223 | 340,373 | 79 | 17.6 / 17.7 ms | 0 |
| Second settled whole-map | 247 | 374,504 | 72 | 17.2 / 17.6 ms | 0 |

The re-entry allocation caused no multi-frame hitch in the 120-frame hardware
window. The realistic first-frame regression test now uses `1 / 60` second,
and a new renderer lifecycle test proves default → eased crossing → settled
whole-map returns to the fresh whole-map texture count.

Round-1 gate measurements on Apple M5 Pro / ANGLE Metal were 67 default
animated, 72 whole-map animated, 65 default reduced, and 70 whole-map reduced.
All four stayed under 72; the scoped suite passed 51 files / 645 tests and
typecheck passed.
