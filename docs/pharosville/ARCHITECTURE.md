# PharosVille Architecture

Last updated: 2026-07-24

This is the smallest useful model of the production app: gated data, a pure
world model, one Three.js renderer, and a DOM failure path.

## 1. Request Boundary

Browser code calls same-origin `/api/*` only.

```text
Browser
  |
  | GET /api/<allowlisted-path>
  v
Cloudflare Pages Function: functions/api/[[path]].ts
  |
  | HTTPS + server-side X-API-Key
  v
PHAROS_API_BASE
```

- `PHAROS_API_KEY` is a Pages secret and must never enter client JavaScript,
  HTML, URLs, logs, docs, or fixtures.
- `PHAROS_API_BASE` is constrained to the canonical Pharos API.
- Only the shared endpoint registry is allowed and only `GET` is accepted.
- Security headers and endpoint cache policy are applied by the Pages Function.

## 2. Desktop Gate

`src/client.tsx` checks device screen size and orientation before importing
`src/pharosville-desktop-data.tsx`.

```text
screen below 720 x 360 capability -> DesktopOnlyFallback
capable portrait screen           -> RotateToLandscape
capable landscape screen          -> lazy desktop data + world runtime
```

The blocked paths do not mount world queries, import Three.js, request the
lighthouse GLB, or decode ship logos. `vite.config.ts` emits media-qualified
modulepreloads for the desktop lazy chunk and its dependency closure.

## 3. World Construction

React Query payloads are converted into a deterministic `PharosVilleWorld`
before rendering.

```text
same-origin API hooks
  -> use-pharosville-world-data
  -> buildPharosVilleWorld()
  -> immutable world value
  -> motion plan + Garden Observatory slice
  -> Three.js frame and DOM details
```

`src/systems/` owns data semantics, layout, route planning, risk placement,
selection detail, observe ranking, and motion sampling. Rendering code must not
invent analytical meaning.

The overview slice keeps:

- all rendered docks and analytical areas;
- a stable representative set capped at 20 ships;
- one temporary selected ship when search or a deep link targets an outsider.

## 4. Renderer Lifecycle

`useWorldRenderLoop` dynamically imports `src/three/world-renderer.ts` and owns
the only renderer lifecycle.

```text
loading
  -> createThreeWorldRenderer()
  -> ready
  -> render(frame) on the route-owned clock

module/WebGL/context/render failure
  -> failed
  -> hide WebGL surface
  -> render WorldStaticOverview in DOM
```

There is no renderer selection flag and no Canvas 2D recovery backend.

The renderer owns:

- the Three.js scene, orthographic camera, lighting, fog, and WebGL lifecycle;
- shader water and risk-area presentation;
- terraced island, docks, procedural ship families, landmarks, weather, and
  bounded ambient life;
- entity cue anchors and selection markers;
- semantic detail visibility;
- GPU draw, geometry, texture, line, point, and triangle metrics;
- disposal of replaced world content and renderer resources.

`src/renderer/` now contains runtime-neutral interaction, scheduling, metrics,
and renderer contracts. It is not a second drawing stack.

## 5. Lighthouse Model

The scene creates a procedural lighthouse shell synchronously. The model
library then loads:

`public/pharosville/models/garden-lighthouse-shell.glb`

`src/three/garden-models.ts` records the model URL, SHA-256, dimensions,
base-center origin, anchors, pick proxy, geometry inventory, and budgets.
Successful load swaps the GLB into the existing lighthouse root while
renderer-owned beacon, beam, light, labels, and selection anchors remain
stable. Failed load leaves the procedural shell in place.

The GLB is deterministic and agent-authored by
`scripts/pharosville/generate-garden-lighthouse.mjs`.

## 6. Runtime Media

The React asset hook is deliberately narrow:

```text
world.ships[].logoSrc
  -> same-origin image decode
  -> ThreeLogoAssetStore
  -> in-memory sail CanvasTexture
```

It loads logos only. Procedural geometry/materials cover ships, docks, land,
cemetery, pigeonnier, districts, ambient gulls, and water. The lighthouse GLB
is fetched separately by the model library.

`public/pharosville/assets/manifest.json` and its raster files are an archived
authoring inventory. Current browser code does not request the manifest or use
it to build the scene.

## 7. Frame And Motion

One route-owned `requestAnimationFrame` loop advances ship samples, camera
intent, scheduler state, hit targets, Three.js rendering, and debug metrics.

- Reduced motion uses `timeSeconds = 0`, paints on demand, and keeps no
  continuous RAF alive.
- Hidden/offscreen surfaces pause and resume without accumulating a teleporting
  time delta.
- The adaptive DPR governor uses bounded backing pixels and frame pacing.
- The scheduler sheds decorative detail under constrained/recovery pressure;
  analytical content, selection, and DOM truth remain available.

## 8. Interaction And DOM Parity

`useCanvasResizeAndCamera` retains its historical name but owns the HTML WebGL
surface size, camera controls, pointer gestures, and keyboard navigation.
Garden Observatory hit testing uses the same display transforms and ship motion
samples as rendering.

DOM-owned surfaces include:

- detail panel and accessibility ledger;
- search, toolbar, time controls, fullscreen, and announcements;
- analytical area labels and Observe captions;
- `WorldStaticOverview` after GPU/renderer failure.

## 9. Validation Boundaries

- model artifact: `npm run check:garden-models`
- renderer/unit behavior: `npm test -- src/three`
- viewport import boundary: `npm run check:viewport-gate`
- browser behavior: `npm run test:visual`
- GPU/performance behavior: `npm run test:perf`
- bundle budgets: `npm run build && npm run check:bundle-size`
- mixed changes: `npm run validate:changed`
