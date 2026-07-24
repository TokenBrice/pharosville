# PharosVille Route Contract

Last updated: 2026-07-24

PharosVille is the standalone Pharos stablecoin observatory at
`https://pharosville.pharos.watch/`. It combines a quiet Three.js harbor with
live market signals, deterministic ship motion, and complete DOM details.

## Runtime Boundary

- PharosVille has one production world renderer: Three.js/WebGL.
- Browser code calls same-origin `/api/*` only. The Pages Function keeps
  `PHAROS_API_KEY` server-side and proxies only the shared allowlist.
- `src/client.tsx` checks device screen capability before lazy-loading desktop
  data or the world runtime.
- A device screen must have a long side of at least `720px`, a short side of at
  least `360px`, and be in landscape orientation.
- A blocked viewport renders the desktop or rotate DOM fallback without world
  queries, the Three.js chunk, model requests, or logo decoding.
- Vite adds media-qualified modulepreloads for the gated desktop chunk and its
  dependencies. No raster asset inventory is preloaded.

## World Experience

- The primary composition is the Garden Observatory: an asymmetric terraced
  island, lighthouse, surrounding docks and ships, detached cemetery, TON
  pigeonnier, analytical water areas, and deliberate open water.
- The overview contains a stable representative slice capped at 20 ships. A
  selected ship outside that slice may be added temporarily so search and deep
  links remain truthful.
- Ships use four procedural hull silhouettes, compressed market-cap scale,
  stablecoin livery, sail logos or symbol fallbacks, wakes, and deterministic
  water-only routes.
- Ethereum, Base, Arbitrum, and Polygon retain their preferred harbor
  relationship. Their live docks produce a subtle district layer and merged
  Ethereum-to-L2 causeways.
- Calm Anchorage, Watch Breakwater, Alert Channel, Warning Shoals, Danger
  Strait, and Ledger Mooring retain their existing analytical semantics.
- DOM overlays label the active analytical areas. They are not baked into the
  WebGL scene.
- Observe mode presents an interruptible sequence for the top risk mover,
  growth story, and concentration story. Pointer, wheel, keyboard, visibility,
  or reduced-motion changes stop the sequence.

## Rendering And Media

- Agent implementation playbook: `docs/pharosville/THREEJS_AGENT_REFERENCE.md`.
- `src/three/world-renderer.ts` owns the scene, camera, lights, water, ships,
  districts, landmarks, effects, semantic detail levels, and GPU metrics.
- The water is one bounded shader surface with day/dusk/night color, shallow
  shore treatment, fine ripples, and lighthouse reflection.
- The island, docks, ships, cemetery, pigeonnier, harbor life, and most
  decoration use renderer-owned procedural geometry and materials.
- The production lighthouse and hero hulls are deterministic agent-authored
  GLBs under `public/pharosville/models/`.
- `src/three/garden-models.ts` records their hashes, dimensions, anchors,
  origins, draw inventories, and budgets. Generator scripts create and check
  every model.
- A procedural lighthouse shell is built with the scene and remains visible if
  the GLB request fails.
- `useShipLogoAssets` loads same-origin stablecoin logo images only.
  `garden-sail-texture.ts` paints those logos and deterministic fallbacks into
  Three.js sail textures in memory.
- Runtime media is limited to ship logos, the checked model manifest, and the
  checked water-normal texture.

## Analytical Truth

The world is a representation, not the only source of meaning.

- Lighthouse: PSI band and score.
- Dock: rendered-chain stablecoin supply and highest-supply stablecoins.
- Ship: one active stablecoin, its class, scale tier, chain presence, risk
  placement, and evidence.
- Route and docking cadence: deterministic visualization of positive chain
  presence, not transfers or issuer operations.
- Cemetery marker: dead or frozen lifecycle status.
- Water area: the existing DEWS or Ledger Mooring analytical category.

Every analytical encoding must remain available in the detail panel or
accessibility ledger with exact values, source caveats, freshness, and links.

## Interaction And Accessibility

- Pointer hover/select, blank-world clear, wheel zoom, pan, reset, fullscreen,
  follow-selected, search, deep links, and Escape behavior remain supported.
- Keyboard target traversal and the detail panel must not depend on WebGL
  pixels.
- DOM details, the accessibility ledger, announcements, labels, and controls
  remain available independently of scene rendering.
- Reduced motion paints deterministic static frames and keeps no continuous RAF
  alive.

## Failure Behavior

If Three.js cannot load, WebGL cannot initialize, the context is lost, or a
render throws:

1. the WebGL surface is hidden;
2. the world does not switch to a second renderer;
3. `WorldStaticOverview` presents the current lighthouse, risk, growth, and
   concentration signals as selectable DOM controls;
4. the normal detail panel and accessibility ledger remain usable.

This GPU fallback is distinct from the pre-data viewport fallback: it uses the
already-built world but renders no 3D scene.

## Performance Contract

- Device pixel ratio remains bounded by the shared backing-pixel governor and
  the Three.js renderer cap.
- Semantic detail levels keep inspection geometry available for Explore or the
  focused entity while Overview remains bounded.
- Docks, shadows, harbor districts, graves, ambient gulls, and repeated ship
  structures use batching or instancing where practical.
- The browser performance lane guards frame pacing, startup, recurring long
  tasks, draw calls, geometry, textures, triangles, transient selection, hidden
  tabs, and reduced motion.

## Validation

Use the smallest relevant lane:

```bash
npm run check:garden-models
npm test -- src/three
npm run test:visual
npm run test:perf
npm run check:viewport-gate
npm run validate:changed
```

Before broad release confidence use `npm run validate:release`. Versioned
releases are published only by `.github/workflows/release.yml` after a green
`main` deployment; do not manually create semantic tags or GitHub Releases.

## Out Of Scope

- mobile or portrait world rendering
- client-side cross-origin Pharos API calls
- invented fallback market data
- transfer, bridge-volume, or issuer-operation semantics inferred from routes
- a second graphical renderer
- automatic promotion of generated concept images into runtime assets
