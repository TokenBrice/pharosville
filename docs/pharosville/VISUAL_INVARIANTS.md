# PharosVille Visual Invariants

Last updated: 2026-07-24

These are product contracts. Changing one requires explicit intent plus matching
tests and documentation.

## Runtime

- PharosVille has one production world renderer: Three.js/WebGL.
- A device screen below the `720px` long-side or `360px` short-side gate, or a
  capable portrait screen, must not mount world data or import the world
  runtime.
- The blocked viewport must make no Three.js, GLB, or logo requests.
- Renderer, module, WebGL, context, or render failure must hide the WebGL
  surface and show the selectable DOM `WorldStaticOverview`.
- The failure path must not instantiate a second graphical renderer.
- Browser world code calls same-origin `/api/*` only.

## Analytical Truth

- The 3D world is a representation, not the only source of analytical truth.
- Every analytical visual cue needs detail-panel or accessibility-ledger
  parity.
- Source fields, freshness, and caveats remain in DOM when a visual encoding
  could be misread.
- Stablecoin list `circulating` values are already USD-denominated; use the
  canonical world-model helpers for scale tiers.
- Docking cadence indicates positive rendered-chain presence, not transfers,
  bridge volume, issuer operations, or transaction flow.
- Stale or missing peg evidence is an evidence caveat, not confirmed stress.

## Composition

- The Garden Observatory remains a framed asymmetric composition with useful
  open water. Do not turn it into a uniformly filled fleet grid.
- The lighthouse remains the visual and analytical anchor.
- The overview is capped at 20 representative ships. A selected outsider may
  appear transiently.
- The detached cemetery and TON pigeonnier remain spatially distinct from the
  main island.
- Ethereum and available Base, Arbitrum, and Polygon docks preserve a readable
  hub/rollup relationship.
- DOM analytical labels must remain legible and selectable without occluding
  the lighthouse or detail panel.

## Entity Meaning

| Entity | Meaning | Must not imply |
| --- | --- | --- |
| Lighthouse | PSI band and score | all market health |
| Dock | chain stablecoin supply and top stablecoins | bridge or transfer volume |
| Ship | one active stablecoin | linear supply area |
| Route | deterministic chain/risk patrol | real issuer operations |
| Risk water | existing peg/DEWS evidence | stress from stale evidence alone |
| Cemetery marker | dead/frozen lifecycle state | current active status |

## Renderer And Media

- Island, docks, ships, cemetery, pigeonnier, districts, ambient life, and
  water remain renderer-owned procedural content unless a model decision meets
  `ASSET_PIPELINE.md`.
- Checked GLBs must preserve manifest hashes, dimensions, base-center origins,
  named anchors, pick proxies, and budgets.
- GLB failure must leave aligned procedural fallbacks visible.
- Runtime image decoding is limited to same-origin ship logos; the checked
  water texture remains renderer-owned.
- Every ship needs a stable livery and readable logo or symbol fallback.
- Hit targets must use the same display transforms and motion samples as the
  rendered entities.
- Zone colors come from the shared palette/theme bridge rather than arbitrary
  renderer literals.
- Risk zones are drawn as charted water regions — a dashed band-colored
  perimeter, lit marker buoys, and a subtle in-water tint — not filled decal
  discs. Band color is never the only encoding: buoys add positional redundancy
  and danger buoys blink slowly (frozen under reduced motion), alongside the DOM
  label and detail-panel parity. The redesign changes presentation only; the
  meaning and stale-evidence caveat in the Entity Meaning table are unchanged.

## Performance

- Device pixel ratio and backing pixels remain bounded.
- Repeated scene structures should use shared geometry, merged geometry, or
  instancing when that reduces meaningful cost.
- Overview may hide inspection-only geometry; focused and Explore states may
  reveal it without rebuilding the world.
- Resource counts must remain stable during long sessions and transient
  selection.
- Performance budgets must not be weakened for a cosmetic change without an
  explicit decision and evidence.

## Accessibility And Motion

- Reduced motion freezes the world at a deterministic static frame and keeps no
  continuous RAF alive.
- Normal motion uses one route-owned clock.
- Analytical CSS animations, intervals, independent scene loops, or timers are
  not allowed.
- Keyboard pan, zoom, target traversal, Escape clear, toolbar controls, search,
  follow-selected, and blank-world clear remain part of the interaction
  contract.
- Detail panels, labels, announcements, and the accessibility ledger must
  remain useful without reading WebGL pixels.
