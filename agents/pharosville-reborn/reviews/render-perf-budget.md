# Render performance budget

## 1. Draw owners by subsystem

The authoritative capture reports **242 recurring calls** (240 scene + 2 offscreen), **392,474 triangles**, 235 geometries, and **51 textures** at 1600×1000 (`outputs/reborn/census/draw-census.txt:7-17`). The subsystem grouping below rolls the listed render-owner names into upgrade-sized ownership domains; texture ownership comes from the named/reachable allocation census (`outputs/reborn/census/texture-census.txt:17-21`).

| owner | calls | tris | textures |
| --- | ---: | ---: | ---: |
| Fleet + hero ships | 104 | 193,784 | 4 |
| Island + lighthouse garden | 64 | 66,466 | 3 |
| Rim + harbours + markers | 37 | 111,655 | 2 |
| Sea + sky + islets/environment | 10 | 20,554 | 8 |
| Unattributed `Mesh` | 25 | 25 | 0 |
| Post-chain targets | 0 scene-attributed | 0 | 34 |
| Recurring offscreen, not owner-attributed | 2 | — | included above |
| **Capture headline** | **242** | **392,474** | **51** |

Fleet batching alone owns 13 calls / 140,530 tris (`outputs/reborn/census/draw-census.txt:56-68`), while the rim land/planting cluster is unusually geometry-heavy (`outputs/reborn/census/draw-census.txt:89-97`). Note: listed owner rows total 392,484 triangles, 10 more than the capture headline; preserve the headline as the budget baseline and fix this census reconciliation before treating owner-level triangle deltas as exact.

## 2. Post chain and shadow configuration

Order is explicit (`src/three/garden-post.ts:1533-1536`, `src/three/garden-post.ts:1697-1701`):

1. **RenderPass** — full-resolution scene into a 4× MSAA HalfFloat composer (`src/three/garden-post.ts:1538-1539`, `src/three/garden-post.ts:1601-1606`); dominant scene submission.
2. **N8AOPostPass** — half-resolution, Performance mode; transparency re-rendering is disabled (`src/three/garden-post.ts:1615-1629`). This is a multi-stage AO cost, not one cheap fullscreen sample: its owned set includes seven textures, including two depth-downsample attachments (`outputs/reborn/census/texture-census.txt:24-25`, `outputs/reborn/census/texture-census.txt:90-99`).
3. **EffectPass(BloomEffect)** — additive five-level mipmap pyramid (`src/three/garden-post.ts:1640-1649`): full-resolution luminance plus half-and-smaller down/up levels. Its live targets span 12.21 MiB luminance, then 3.05/0.76/0.19/0.05 MiB pyramid levels (`outputs/reborn/census/texture-census.txt:50-69`). Cost is multiple fullscreen pyramid draws.
4. **Fused grade EffectPass** — one full-resolution composite containing tilt shift → god rays → grade → tone map → LUT/dither (`src/three/garden-post.ts:1660-1686`). Tilt shift adds two half-resolution offscreen blur draws and god rays one half-resolution target; the effects remain fused in the main pass (`src/three/garden-post.ts:1662-1666`; `outputs/reborn/census/texture-census.txt:84-89`, `outputs/reborn/census/texture-census.txt:108-111`).
5. **EffectPass(SMAA)** — final full-resolution LDR pass (`src/three/garden-post.ts:1688-1695`), with area/search lookup textures and full-resolution edge/weight targets (`outputs/reborn/census/texture-census.txt:100-107`).

Resizes use the renderer drawing-buffer dimensions—DPR is already applied—through `composer.setSize(width, height)` (`src/three/garden-post.ts:2201-2205`). The scoped `garden-environment.ts` grep has no `shadow`, `mapSize`, `PCF`, or `bias` hit, so it does not declare a shadow-map size/filter/bias. The census does establish one `garden-shadows` color target and one depth target, each estimated at 4.00 MiB (`outputs/reborn/census/texture-census.txt:40-43`); do not invent a resolution or PCF mode from storage alone.

## 3. Headroom against hard ceilings

| metric | observed | ceiling | headroom |
| --- | ---: | ---: | ---: |
| recurring calls | 242 | 700 | 458 |
| triangles | 392,474 | 500,000 | 107,526 |
| textures | 51 | 72 | 21 |
| frame time | p95 16.7 ms; p99 16.8 ms | 20 ms | **unknown GPU headroom** |

The frame tail is synchronized almost perfectly to 60 Hz, so the cited 16.8 ms p95 should be treated as **vsync-bound, not measured workload cost** (`outputs/reborn/census/draw-census.txt:8-10`). CPU-side samples (motion 3.3 ms, hit targets 0.5 ms, draw submit 4.8 ms) do not provide post-pass GPU cost (`outputs/reborn/census/draw-census.txt:12`). `EXT_disjoint_timer_query_webgl2` is supported (`outputs/reborn/census/draw-census.txt:4`), so the **first tool to build is a per-pass GPU-ms readout in `scripts/pharosville/preview.mjs`**, with disjoint handling and rolling p50/p95 per composer stage. Until then, the 20 ms gate cannot honestly be allocated from the vsync plateau.

## 4. Upgrade-session allocation

These are **maximum net deltas from the captured baseline**, not targets to spend. The ms column is an incremental GPU p95 allowance to verify with timer queries; DOM is main-thread p95 and must be reported separately.

| lane | calls | tris | tex | ms allowance |
| --- | ---: | ---: | ---: | ---: |
| Hero-only planar reflection | +12 | +12,000 | +2 | +1.2 GPU |
| Vegetation species set | +10 | +45,000 | +5 | +0.8 GPU |
| Sky dome + infinite sea annulus | +2 | +4,000 | +3 | +0.3 GPU |
| Beacon beam volume | +2 | +4,000 | +2 | +0.4 GPU |
| Curated-fleet savings | **−45** | **−80,000** | **−1** | **−1.6 GPU** |
| Island garden rebuild | +25 | +90,000 | +5 | +2.4 GPU |
| DOM | 0 | 0 | 0 | +0.5 main thread |
| **Net reservation** | **+6** | **+75,000** | **+16** | **+3.5 GPU, +0.5 main** |
| **Result if fully spent** | **248** | **467,474** | **67** | timer-gated |

This leaves 452 calls, 32,526 triangles, and five textures as contingency. The reflection allowance assumes strict hero-only layers and a bounded reflection target; reflecting the full fleet would multiply scene submission and violates the intent of the lane.

## 5. Renderer version and WebGPU scope

The stack is Three.js **0.185.1**, `postprocessing` 6.39.4, and `n8ao` 2.0.0 (`package.json:78-86`). **WebGPU is later, and possibly never—not in this upgrade session**: migrating a working WebGL2, pmndrs, N8AO, custom-pass chain creates compatibility/revalidation work but no direct garden-quality gain; reconsider only if per-pass WebGL2 timer evidence shows the 20 ms ceiling cannot be met.
