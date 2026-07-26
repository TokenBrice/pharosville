# PharosVille Architecture

Last updated: 2026-07-27

PharosVille is a desktop-gated React app with a pure data-to-world layer and
one imperative Three.js/WebGL renderer. The DOM remains the analytical and
failure-safe surface.

## Request and loading boundary

```text
Browser → /api/<allowlisted read path> → Pages Function → PHAROS_API_BASE
```

- Browser code calls same-origin `/api/*` only.
- `functions/api/[[path]].ts` permits only registry-backed `GET` endpoints and
  injects `PHAROS_API_KEY` server-side. The key never belongs in client code,
  URLs, logs, docs, or fixtures.
- `src/client.tsx` is the gate. The physical screen capability test requires a
  900px long side and a 720px short side; the current-window test applies those
  same two dimension floors to the current viewport before it lazy-loads
  desktop data. Neither test uses viewport orientation or aspect ratio.
- Blocked screens render a DOM fallback or rotate prompt. They must not query
  the world, import the Three.js runtime, decode logos, or request models.

## Runtime pipeline

```text
API hooks → buildPharosVilleWorld() → motion plan + display slice
         → route-owned frame loop → Three.js frame + DOM parity
```

1. `src/pharosville-desktop-data.tsx` fetches data only after the gate passes.
2. `src/systems/` deterministically constructs `PharosVilleWorld`: map,
   harbors, ships, analytical water, lifecycle wrecks, detail models, and
   visual-cue provenance.
3. `src/pharosville-world.tsx` owns selection, URL state, camera intent,
   accessible overlays, and the shared refs that connect interaction to the
   renderer.
4. `useWorldRenderLoop` owns the single normal-motion RAF, motion samples,
   adaptive DPR, scheduler, hit-target snapshots, metrics, and renderer
   lifecycle.
5. `src/three/world-renderer.ts` consumes a frame contract; it never invents
   analytical meaning.

The Garden Observatory renders the complete eligible fleet up to its fixed
capacity of 320. Composition comes from deterministic, region-scoped placement
and exclusion zones, not from the retired 20-ship overview cap.

## Rendering boundary

`src/renderer/` is the narrow engine-neutral boundary: the renderer interface,
scheduler, metrics, and hit testing. `src/three/` owns scene construction and
GPU disposal.

The scene includes a procedurally built island, harbors, water regions,
landmarks, weather, and ambient life; most fleet ships are instanced batches.
The lighthouse and selected hero hulls load checked GLBs over aligned
procedural fallbacks. Stablecoin and harbor marks are painted into shared
in-memory atlases from same-origin images.

The frame contract is intentionally shared by drawing, pointer hit testing,
keyboard targets, follow-selected, detail anchoring, and debug telemetry. A
display or motion transform must change in all of those places together.

## Failure and accessibility

If the renderer module fails, WebGL cannot start, the context is lost, or a
frame throws, the WebGL surface is hidden and `WorldStaticOverview` presents
the already-built signals as selectable DOM. There is no second graphical
renderer.

The detail panel, accessibility ledger, area labels, announcements, and
controls never depend on reading WebGL pixels. Every analytical cue must carry
source fields, caveats, and a DOM equivalent.

## Change ownership

| Change | Primary owner |
| --- | --- |
| API semantics, placement, risk, detail copy | `src/systems/` |
| Camera, pointer and keyboard behavior | `src/hooks/`, `src/renderer/` |
| Geometry, material, post-processing, resource disposal | `src/three/` |
| DOM controls, detail and accessibility parity | `src/components/`, `src/pharosville-world.tsx` |
| Checked models, textures, logos | `docs/pharosville/ASSET_PIPELINE.md` |

## Validation

Use the smallest relevant lane:

```bash
npm test -- src/systems
npm test -- src/three src/renderer
npm run check:viewport-gate
npm run test:visual
npm run test:perf
```

See `THREEJS_AGENT_REFERENCE.md` for renderer work and `TESTING.md` for the
complete test and review matrix.
