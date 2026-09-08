# PharosVille Route Contract

Last updated: 2026-09-08

PharosVille is a living stablecoin garden at
`https://pharosville.pharos.watch/`: a stablecoin harbour you watch like a
garden. Live Pharos markets unfold as ships, water, light, and weather, while
exact readings remain available in DOM details and the accessibility ledger.

## Entry and trust boundary

- The browser uses same-origin `/api/*` endpoints only; the Pages Function
  holds `PHAROS_API_KEY` and proxies the allowlisted reads.
- The world loads only after both the physical screen and current viewport
  independently satisfy either the standard 900×720 profile or the wide-laptop
  1200×640 profile. Dimensions are sorted, so these remain direct size tests,
  not an orientation or aspect-ratio gate. Blocked viewports render DOM guidance
  without fetching world data or importing Three.js and its media.
- The production renderer is Three.js/WebGL. Renderer, WebGL, module, or
  context failure shows the selectable DOM `WorldStaticOverview`; there is no
  graphical fallback renderer.

## What the world means

| World element | Meaning | It must not imply |
| --- | --- | --- |
| Lighthouse | PSI score and band | total market health from one cue |
| Harbor | rendered-chain stablecoin supply | transfers or bridge volume |
| Ship | one active stablecoin and its evidence | issuer activity or operations |
| Route | deterministic display of chain/risk presence | real movement or transactions |
| Water body | existing peg/DEWS or ledger category | confirmed stress from stale evidence |
| Wreck | dead or frozen lifecycle state | a currently active stablecoin |

The Garden Observatory holds a terraced island and Pharos lighthouse, a ring
of distinct harbors, a full fleet of water-safe ships, separate water bodies,
the TON pigeonnier, and a sea wreckyard. Fleet placement is deterministic,
region-aware, and capacity-bounded at 320 ships; it is not a small curated
20-ship slice.

Four instanced procedural silhouettes carry ordinary ships. Titan and heritage
ships can load a checked hero hull over the same procedural fallback. Sail
cloth, marks, livery, chain flags, and water behavior make entities readable at
overview scale; the DOM detail panel and accessibility ledger carry exact
values, freshness, provenance, and caveats.

## Interaction, caption, and motion

- The resting frame is the world, one deterministic “now” sentence, and one
  quiet Explore affordance. Find, Legend, Harbor ledger, and view controls
  reveal on pointer approach, keyboard focus, `/`, or camera input; focused
  controls remain visible.
- The now sentence gives an arrival ceremony first, then the latest market
  transition, then a stale-feed warning, otherwise the wall-clock phase and
  freshness. It changes only when those data or time inputs change.
- Pointer and keyboard targets use the same displayed poses as rendering.
- Selection, deep links, pan, zoom, reset, Observe, day/night, Escape clear,
  and the accessible detail flow remain supported.
- Version and renderer telemetry are absent from ordinary chrome. `?debug=1`
  shows version, FPS, draws, triangles, textures, and GPU p95.
- One route-owned clock drives normal animation. Reduced motion produces a
  composed static frame with no continuous RAF; hidden or offscreen surfaces
  pause without a catch-up teleport.

## Performance and media

The renderer adapts between full, balanced, interaction, recovery, and
constrained tiers. It may shed decorative work but not analytical entities,
selection, hit targets, DOM labels, or details. Repeated fleet geometry,
lanterns, and marks use batching or instancing; resource and pacing limits are
tested rather than assumed.

Runtime media is same-origin and deliberately small in scope: stablecoin logos,
the checked chain-logo set for harbor flags, one checked water normal, and the
checked GLB manifest. All other scene content is procedural. See
`docs/pharosville/ASSET_PIPELINE.md`.

## Non-goals

- mobile or portrait world rendering
- client-side upstream API calls or credentials
- wallet, trading, custody, accounts, or financial advice
- inferred transfer, bridge-volume, or issuer-operation semantics
- a second renderer or invented fallback market data
