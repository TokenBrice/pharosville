# PharosVille Architecture

Last updated: 2026-09-03

PharosVille is a desktop-gated React app with a pure data-to-world layer and
one imperative Three.js/WebGL renderer. The DOM remains the analytical and
failure-safe surface.

## Request and loading boundary

```text
Browser → /api/<allowlisted read path> → Pages Function → PHAROS_API_BASE
```

The gate in `src/client.tsx` admits only the 900×720 or 1200×640 size profiles
before desktop data, logos, models, or Three.js load. Dimensions are sorted;
these are SIZE tests, never orientation tests. The Pages Function alone reads
`PHAROS_API_KEY`, and browser code calls same-origin `/api/*` only.

## Runtime pipeline

```text
API hooks → buildPharosVilleWorld() → motion plan + display slice
         → route-owned frame loop → Three.js frame + DOM parity
```

`src/systems/` builds the authoritative finite 140×140 plate: the irregular
land rim and its two openings, seven named waters, shore coves and stations,
the connected Ethereum/L2 precinct, the tsukiyama island, and the leg-based
motion plan. `src/pharosville-world.tsx` owns selection, URL state, camera
intent, accessible overlays, and shared refs. `useWorldRenderLoop` owns the
single normal-motion RAF, samples, scheduler, hit snapshots, metrics, and
renderer lifecycle.

## Rendering boundary and modules

`src/renderer/` owns the engine-neutral backend, scheduler, metrics, and hit
testing. `src/three/` owns scene construction, GPU resources, and disposal.

- `garden-rim.ts` is the authoritative water-safety/placement field; its
  `garden-rim-mesh.ts` turns the finite rim into batched shore geometry.
- `garden-sea-edges.ts` and `src/systems/garden-sea-edge-sites.ts` place the
  decorative edge geography from the seven-body field.
- `garden-docks.ts` authors `DockRecipe` station archetypes;
  `garden-harbor-batch.ts` renders their global material buckets and instanced
  props. Cove, station type, and shore bearing come from `DockNode.station`.
- `garden-wake-batch.ts` owns world-wide trail and bow batches. Its slots cover
  live, departing, and outsider ships without per-ship wake meshes.
- `garden-draw-census.ts` attributes draw submissions and must reconcile with
  `renderer.info`; it is diagnostic evidence, not a second renderer.
- `garden-waterfall.ts` is the single hero fall; `garden-water-exclusion.ts`
  is the conservative distance field used by placement and motion.
- `garden-sky.ts`, `garden-horizon.ts`, and `garden-day-cycle.ts` compose the
  graded sky, fog seam, shakkei, and shared phase state. `garden-post.ts` owns
  the post chain and its overview N8AO lifecycle.

The fleet uses six batched hull families and a shared sail atlas. The lighthouse
and selected heroes use checked GLBs over aligned procedural fallbacks.

## Contracts and budgets

The finite plate, rim field, sea-body partition, station topology, display
transforms, and leg samples are shared by drawing, hit testing, keyboard
targets, following, detail anchors, and telemetry. Shader edge smoothing is
presentation only. Reduced motion is a complete deterministic static frame.

Hard ceilings are 700 calls, 500 geometries, 500,000 triangles, and 72
textures. The reference default is approximately 256 calls and 43 textures;
whole-map N8AO is released so its animated overview remains at or below 72.
Repeated structures are batched or instanced and renderer-owned resources are
disposed with their content subtree.

## Validation

```bash
npm test -- src/systems
npm test -- src/three src/renderer
npm run check:viewport-gate
npm run validate:docs
npm run test:visual
npm run test:perf
```

See `THREEJS_AGENT_REFERENCE.md` for renderer changes and `TESTING.md` for
real-GPU preview and census evidence.
