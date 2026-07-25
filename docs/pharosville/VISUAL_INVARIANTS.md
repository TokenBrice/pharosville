# PharosVille Visual and Analytical Contracts

Last updated: 2026-07-25

These are product contracts, not a design diary. Change one only with explicit
intent, code/tests, and a matching update to the relevant route documentation.

## Runtime and truth

- PharosVille has one production Three.js/WebGL renderer.
- Below the desktop screen gate, and in capable portrait, no world data, Three
  runtime, GLB, or logo request may start.
- Renderer failure hides WebGL and shows selectable DOM `WorldStaticOverview`;
  it never starts a second graphical renderer.
- Browser world code uses same-origin `/api/*` only.
- Every analytical cue has detail-panel or accessibility-ledger parity,
  including source fields, freshness, and caveats where the cue could mislead.
- Ship routes and docking cadence show rendered-chain/risk presence, never
  transfers, bridge volume, transactions, or issuer operations.
- Missing or stale peg evidence is a caveat, not confirmed stress.

## Composition

- The Garden Observatory is asymmetric, sea-first, and intentionally open.
  Do not replace its region-scoped fleet placement with a uniform grid.
- The Pharos lighthouse remains the visual and analytical anchor.
- The full eligible fleet may render up to the 320-ship batch capacity. Density,
  water-safe placement, lighthouse clearance, and edge falloff preserve
  composition; the former 20-ship cap is retired.
- Harbors ring the rendered island waterline and retain distinct built forms.
  Ethereum and available L2 docks remain a readable hub relationship.
- The TON pigeonnier is spatially distinct. The dead/frozen fleet is a quiet
  sea wreckyard, not an island and never a live-ship destination.
- DOM labels must be legible and must not cover the lighthouse, controls, or
  active detail panel.

## World encoding

| Element | Required reading | Redundant channel |
| --- | --- | --- |
| Lighthouse | PSI score/band | DOM record and beacon state |
| Ship | stablecoin identity, scale, class, risk | branded sail/livery plus DOM record |
| Harbor | chain supply and concentration | built form, flag, DOM record |
| Water body | existing risk/ledger category | water character, boundary/buoy, DOM label |
| Wreck | lifecycle status | model/cause color plus DOM record |

Risk regions derive from the same terrain field that placement and motion use.
They are bodies of water, not overlay ellipses: color, depth, swell, chop,
foam, reflection, boundary movement, and buoys may vary, but a renderer effect
must not reclassify a tile. Color is never the only carrier of meaning.

## Media and rendering

- Procedural geometry/materials own the island, harbors, ordinary fleet,
  water, wrecks, landmarks, sky, and ambient life.
- The checked lighthouse and hero GLBs preserve their hash, origin, scale,
  anchors, pick proxy, and budgets together; failure leaves aligned procedural
  forms visible.
- Stablecoin sails and harbor flags must remain identifiable when logo decoding
  fails: sail symbols and painted chain initials are the required fallbacks.
- Repeated fleet structures, marks, lanterns, and appropriate scenery use
  batching or instancing. One shared sail atlas replaces per-ship textures.
- Palette and region themes are shared contracts; do not introduce arbitrary
  debug colors or post effects to solve basic composition problems.
- Device pixels, backing pixels, resource counts, and bundle sizes remain
  bounded. Cosmetic changes do not justify relaxing measured gates.

## Motion and access

- One route-owned clock drives normal motion. No per-entity timers, independent
  CSS analytical animation, or renderer loops.
- Reduced motion is a complete deterministic static composition with zero
  continuous RAF.
- Hidden/offscreen surfaces pause and resume without a catch-up teleport.
- Keyboard traversal, pan/zoom, selection, Escape clear, controls, detail
  anchors, and hit testing remain useful without inspecting WebGL pixels.
