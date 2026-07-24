# Three.js Phase 3 Automated Evidence

Date: 2026-07-23

Status: the operator, acting as the sole product tester, recorded `GO`.
Phase 4 is underway. The expanded world passes the strict reference-machine
performance and stability gates; production cutover and release remain open.

Plan:
[`2026-07-23-threejs-implementation-plan.md`](./2026-07-23-threejs-implementation-plan.md)

Operator review and sign-off:
[`2026-07-23-threejs-decision-packet.md`](./2026-07-23-threejs-decision-packet.md)

## Executive Result

The Garden Observatory slice supplied enough visual and interaction evidence
for the operator to choose `GO`. That decision unlocked Phase 4; it was not a
production cutover or release approval.

The current production-oriented world now renders the full area and dock
geography, 20 representative ships, stablecoin identity sails, analytical
labels, Observe behavior, richer water and island scenery, and the first
runtime GLB lighthouse asset. The current Chromium functional suite passes.

This is not release evidence. Phase 4 parity, cross-browser production checks,
the single-renderer cutover, and release validation remain open.

## Automated Visual Suite

The consolidated Chromium Three.js suite passes:

```bash
PHAROSVILLE_VISUAL_REUSE=1 \
PHAROSVILLE_VISUAL_BROWSERS=chromium \
npm run test:visual  # was test:visual:three before the one-renderer cutover
```

Result: **9/9 passed** in 37 seconds.

Coverage includes:

- day, dusk, night, reduced motion, resize, and nonblank pixels;
- pointer and keyboard selection, search, details, follow, deep links, Escape,
  focus restoration, and the accessibility ledger;
- Canvas and Three expose identical normalized detail-panel and full-ledger
  text for the same fixture and selection;
- Observe captions, interruption, and reduced-motion absence;
- DOM analytical labels and non-color risk meaning;
- blocked viewports loading neither world data nor Three.js;
- module failure, WebGL unavailability, and lost-context recovery;
- the full dock set, 20 representative ships, and a transient outsider.

No current Firefox or release-matrix result is claimed here.

## Diagnostic Performance

The non-reference diagnostic lane passes. The latest full representative
world sample after semantic-detail LOD and repeated-geometry batching records:

```bash
PHAROSVILLE_VISUAL_REUSE=1 \
PHAROSVILLE_VISUAL_BROWSERS=chromium \
npm run test:perf  # was test:perf:three before the one-renderer cutover
```

Result: **6/6 passed**.

The dense fixture stayed resource-stable during the diagnostic soak:

| Measure | Startup | Steady |
| --- | ---: | ---: |
| Draw calls | 403 | about 403 |
| Geometries | 247 | 247 |
| Textures | 21 | 21 |
| Triangles | 37,233 | about 37,233 |

The enforced steady-state ceilings are 450 calls, 275 geometries, 24 textures,
and 42,000 triangles. These diagnostic thresholds complement the strict
reference-machine pacing gate below.

## GLB Pipeline

The production conversion path is now exercised by one checked-in runtime
asset:

- asset: `public/pharosville/models/garden-lighthouse-shell.glb`;
- deterministic generator:
  `scripts/pharosville/generate-garden-lighthouse.mjs`;
- runtime library and focused tests:
  `src/three/garden-models.ts` and `src/three/garden-models.test.ts`;
- size: 64,808 bytes;
- SHA-256:
  `25fd507abedd77ff98e00fba2f89202b73cd24ccfe4de76d1acfb6b14c1030d3`;
- 1,020 triangles, 1,561 vertices, seven draw calls/materials, no textures;
- bounds: 5.4 x 17.3 x 5.535;
- named anchors drive the renderer-owned beacon and beam;
- a procedural shell renders immediately and is replaced after the GLB loads.

The generator `--check`, focused model tests, TypeScript, and lint checks pass.
At 64.8 KiB the asset is already below the proposed 100 KiB per-asset target,
so compression is not required for this first model.

Khronos glTF Validator `2.0.0-dev.3.10` reports zero errors and zero warnings.
The retained report is
`outputs/threejs-phase4/garden-lighthouse-shell-validator.json`.

PixelLab was evaluated for this work. Its available output is useful for 2D
concept references, not GLB, PBR, or mesh production, so it is not part of the
runtime model pipeline.

## Strict Reference Gate

The full representative world passes the 60-second headed Chromium gate on the
operator's discrete NVIDIA RTX 5070 Ti:

- startup p90: 12.6 ms;
- highest observed p90: 16.8 ms, below the 20 ms gate;
- observed FPS range: 74.11 to 103.08;
- recurring interaction tasks above 50 ms: zero;
- first coherent scene: 314 ms;
- GPU resources: 424-428 calls, 247 geometries, 21 textures.

The separate 300-second reference soak also passes: 424-434 calls, 247-248
geometries, and a constant 21 textures. Geometry range was one and texture
range was zero, with no unbounded growth. Machine-readable evidence:

`outputs/threejs-phase3/three-performance-reference-desktop-chromium.json`

`outputs/threejs-phase3/three-stability-reference-desktop-chromium.json`

## Current Decision State

- **Tester:** the operator is the sole required tester.
- **Phase 3 decision:** `GO`.
- **Current phase:** Phase 4 implementation and optimization.
- **Passed gates:** strict reference performance and five-minute stability.
- **Open work:** final parity, cross-browser production checks, and local
  single-renderer cutover.
- **Not claimed:** production cutover, release validation, deployment, or
  release approval.
