# PharosVille Hook Boundaries

Last updated: 2026-07-24

The world route has three high-frequency hook boundaries. Keep them stable and
avoid introducing a second renderer lifecycle.

## `useCanvasResizeAndCamera`

The historical name refers to the HTML rendering surface. The hook owns:

- surface measurement and bounded DPR inputs;
- camera state and clamping;
- pointer pan, pinch, wheel, and click gestures;
- keyboard pan/zoom and follow-selected behavior;
- current hit-target refs used by event handlers.

It does not draw the scene or own WebGL resources.

## `useWorldRenderLoop`

For Three.js factory, frame fields, disposal, and scheduler tiers, see
`THREEJS_AGENT_REFERENCE.md`.

This hook owns:

- dynamic import and lifecycle of the single Three.js renderer;
- renderer status: `loading`, `ready`, or `failed`;
- the one normal-motion RAF;
- reduced-motion on-demand frames;
- ship sample collection and smoothing;
- hit-target snapshot refresh;
- render-scheduler state, adaptive DPR, performance windows, and debug metrics;
- pause/resume behavior for hidden or offscreen surfaces;
- renderer failure transition to the DOM fallback.

Renderer, camera, motion plan, hover, selection, and size values that change at
different frequencies are mirrored through stable refs. Do not rebind the RAF
for ordinary hover or selection changes.

## `useShipLogoAssets`

The asset hook is a `ThreeLogoAssetStore`, not a scene asset manager.

- It derives a stable sorted set of same-origin ship logo sources.
- It loads and caches those images with abort support.
- It increments `logoGeneration` only when usable logos are added.
- A tick requests a new frame so sail textures can refresh.
- It does not load models, textures, terrain, docks, or ship bodies.

The model library under `src/three/garden-models.ts` owns checked GLBs
separately.

## Cross-Hook Refs

The route deliberately shares refs for:

- camera and viewport size;
- selected and hovered detail IDs;
- current motion plan and ship samples;
- hit-target snapshots and lookup maps;
- adaptive DPR and backing budget;
- the current paint request.

Update ref mirrors synchronously with the route helper designed for that
purpose. Late-bound callbacks should be assigned after commit and dereference
current values only when invoked.

## Dependency Rules

- Depend on semantic signatures when object identity can churn without a
  meaningful change.
- Keep callbacks stable when they are registered as event handlers or passed
  across the camera/render-loop boundary.
- Do not omit a dependency merely to silence the linter; document the semantic
  signature that makes the omission valid.
- Avoid `useMemo` for trivial values. Use it for world-derived structures,
  search indexes, motion plans, and other real work.
- Dispose renderer-owned resources and cancel image loads during cleanup.

## Change Checklist

When changing these hooks, verify:

1. normal motion owns exactly one RAF;
2. reduced motion owns none;
3. hover/select changes do not recreate the renderer;
4. world replacement disposes old scene content;
5. viewport failure imports no desktop runtime;
6. renderer failure shows `WorldStaticOverview`;
7. logo completion requests a coherent repaint;
8. tests cover StrictMode cleanup and late async completion.
