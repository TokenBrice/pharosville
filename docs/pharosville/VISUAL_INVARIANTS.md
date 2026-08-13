# PharosVille Visual and Analytical Contracts

Last updated: 2026-08-13

These are product contracts, not a design diary. Change one only with explicit
intent, code/tests, and a matching update to the relevant route documentation.

## Runtime and truth

- PharosVille has one production Three.js/WebGL renderer.
- Unless both the desktop screen and current viewport satisfy either `900×720`
  or the wide-laptop `1200×640` profile, no world data, Three runtime, GLB, or
  logo request may start. Dimensions are sorted; both halves are SIZE tests,
  never orientation tests.
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
  Do not replace its region-scoped fleet placement with a uniform grid — or
  with any other uniform field, including blue noise. See below.
- **The fleet moors in anchorages.** Each risk band seeds an odd number of
  moorings (three, five or seven), widely separated across its own water and
  deliberately unequal in size, and fills each from the middle outward. The
  emptiness between moorings is a positive element of the composition, not a
  gap in it. Uniformity is the failure mode this prevents: a maximally-even
  scatter of ~185 hulls makes every part of the frame equally busy, leaves the
  monument competing with sixty hulls of identical visual weight, and reads as
  carpet. Asserted in `garden-fleet-placement.test.ts` by cluster structure and
  by the largest empty circle inside a band's water — not by nearest-neighbour
  statistics, which the hull gap makes uninformative at this fleet size.
- The Pharos lighthouse remains the visual and analytical anchor.
- The full eligible fleet may render up to the 320-ship batch capacity. Density,
  water-safe placement, lighthouse clearance, and edge falloff preserve
  composition; the former 20-ship cap is retired.
- **Distance and zoom are viewing conditions, not identity changes.** The fleet
  recedes with depth (chroma, never value) and its marks thin as the camera
  pulls back, so a wide framing reads as a harbour rather than as a hundred and
  eighty-five stickers. Sailing in restores full brand identity exactly as
  decision F1 specified. Restraint must never be baked into the cloth colour
  itself, which would remove identity at every distance with no way back.
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

The sea is a partition with no fallback: every water tile belongs to exactly one
body, and no body may be the residue. Body areas are sized to their expected
traffic — the density spread across bodies stays within roughly 3x, not the 13x
that left the most consequential water a corner sliver and the emptiest water
the second-largest body on the map.

**Not all water is named, deliberately.** Roughly a quarter of the sea is open
approach, and it is composition rather than an attribution gap: named waters
only read as bodies when there is unclaimed sea between them, and the world is
required to be "asymmetric, sea-first, and intentionally open". The coverage
guard is set at 0.72 for that reason; raising it back toward 1 would recreate
the residue body it was meant to prevent.

Sea-body place-names are carried by in-world signage AND by the accessibility
ledger, which lists every named area. The signs are canvas content and therefore
aria-hidden, so the ledger — not the sign — is the redundant channel.

## Light and atmosphere

- **One arc owns where the light is.** `garden-sun.ts` is the single source for
  the sun's and moon's direction; the key light, the sky dome's glow and the
  water's road and glitter all read it. Three independent constants for the
  same sun is the state this replaced, and because none of them moved, only
  colour changed with the hour — which reads as a filter over the picture
  rather than as light inside it. The arc passes exactly through the calibrated
  noon bearing, so the day grade and the AO ladder cannot drift.
- **The haze band IS this world's sky.** Under a locked orthographic camera
  every view ray is parallel and points down, so an effectively-infinite water
  plane fills every pixel at any elevation above zero: the sky dome can never
  enter frame, and lowering the isometric angle would not change that. The dome
  exists to feed the PMREM probe. The upper-frame band where far water
  dissolves into fog is the only sky there is, which makes the fog ladder a
  composition contract and not merely a depth cue.
- Aerial perspective must actually reach the DEFAULT framing. The fog range's
  scale pivot (`FOG_REFERENCE_VIEW_HEIGHT`) must track the real default view
  height (`viewportHeight / (TILE_HEIGHT * zoom)`, ~78). A pivot
  far below it clamps the scale to its maximum, pushes the near plane past
  everything visible, and silently switches the whole system off while leaving
  its documentation looking correct.

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
- Quality tiers preserve semantic hues, palette authority, tone mapping,
  day-cycle grade, and vignette. Enumerated fidelity effects may change local
  luminance or contrast, but must retain the same meaning and avoid abrupt
  transition pops.
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
