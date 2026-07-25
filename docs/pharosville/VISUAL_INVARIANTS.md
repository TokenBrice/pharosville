# PharosVille Visual Invariants

Last updated: 2026-07-25

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
- The whole tracked fleet renders (~205 ships today). The render limit is a
  CAPACITY of 320, not a composition rule — decision D1 of the Grand Scale
  Revamp (2026-07-25) retired the 20-ship cap once instanced batching made
  ship count stop deciding what the frame could afford. A selected ship
  outside the rendered slice may still appear transiently, which now only
  happens if a world exceeds capacity.
- Composition is held by placement DENSITY, not by a small count: ships
  scatter as blue noise inside their own sea region, a 9-tile clearance
  keeps the lighthouse approach open, and a density falloff thins the fleet
  toward the frame edge.
- The TON pigeonnier remains spatially distinct from the main island.
- The ship graveyard is a REGION OF SEA, not an island (N2, 2026-07-25).
  Dead and frozen stablecoins rest as half-sunk wrecks across the wreck
  shoals in the south-west corner — the far pole from the north-east storm
  corner, so the map reads danger at one end and memory at the other. Its
  water is the stillest in the world (lowest swell, chop and foam), and no
  live ship is ever assigned there, so the corner stays quiet by
  construction rather than by rule.
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
| Wreck | dead/frozen lifecycle state | current active status |

## The Pharos Lighthouse

- The tower is the Pharos of Alexandria rebuilt as a Wonder: a 34-unit
  three-tier silhouette (battered square base → octagonal drum → cylindrical
  drum) crowned by an open bronze brazier and a Zeus Soter statue. Decision
  D1 (Pharos Wonder plan, 2026-07-24) supersedes the earlier "epic, not
  bigger" call (D-L1): contract constants are
  `GARDEN_LIGHTHOUSE_HEIGHT = 34` and `GARDEN_LIGHTHOUSE_BEACON_Y = 30.1`.
- The beacon signal is a living fire, not a glow sphere: flame brightness and
  flicker amplitude track the same PSI-stress intensity number the old beacon
  sphere carried (D5). The analytical encoding is unchanged — the fire is
  additive decoration on top of the same signal, and bloom stays
  decorative-only.
- Day identity is the smoke column, the mirror glint, and a banked flame;
  dusk/night identity is the full flame, halo, and rotating ray fan (D3).
- The ray fan is poster-art license (D4): a vintage travel-poster sunburst,
  not a claim of ancient optics. The bronze mirror dish carries the same
  knowingly-legendary status.
- The flame's outer band spends the one reserved vermillion accent (D6); all
  other fire colors derive from the shared palette.

## Renderer And Media

- Island, docks, ships, wrecks, pigeonnier, districts, ambient life, and
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
  renderer literals. Since Z3 (Garden Sea, 2026-07-24) each DEWS band accent is
  harmonized toward a `HARBOR_PALETTE` anchor — muted teal-green calm → deep
  amber warning → ember danger — and the water shader luminance-matches the
  tint against the live water color; DOM labels keep the raw DEWS accents.
- Risk zones are drawn as REGIONS OF THE SEA, not as shapes laid on top of it.
  Decision D5 of the Grand Scale Revamp (2026-07-25) supersedes the zones-v2 and
  zones-v3 ellipse designs entirely.

  The geometry is the terrain field the simulation already obeys.
  `terrainKindAt` classifies every tile (`calm-water`, `watch-water`,
  `alert-water`, `warning-water`, `storm-water`, `ledger-water`), covering 88.5%
  of the sea in named, contiguous, organically-shaped regions; ship placement
  and motion have always bound to it. The renderer rasterises that same field
  into a region-id + boundary-distance texture the water shader samples. Because
  display and simulation read one field, a ship is always drawn inside the
  region it is labelled with — the drift the ellipses allowed is now
  structurally impossible.

  A region is carried by water CHARACTER, not colour alone (D6, and the
  accessibility contract): per-region swell, chop, whitecap density,
  reflectivity and depth, escalating monotonically with risk. Calm water is
  glassy and mirror-like; danger water runs steep, dark and foam-streaked. A
  viewer who cannot separate the hues still reads the sea state from its motion.
  Colour support is a luminance-matched tint pulled toward deep sea so it reads
  as water rather than paint. Boundaries carry a drifting foam/current line, and
  marker buoys sit on the real region edge (positional redundancy; danger buoys
  blink slowly, frozen under reduced motion, as is the bob).

  Boundary smoothing is presentation-only: the sample position is domain-warped
  so edges wander like a current front instead of following the terrain tests'
  straight geometry, but a tile's classification never changes. A unit test pins
  the per-tile majority against the raw field.

  Region tint, foam and the boundary line fade out toward the open-ocean
  boundary so the detailed and cheap shader paths converge; without that the map
  reads as a hard diamond tile floating on flat sea.

  DOM labels, hit targets and camera focus anchor inside each region, inset
  toward the frame, never off-screen. The redesign changes presentation only;
  the meaning and the stale-evidence caveat in the Entity Meaning table are
  unchanged.

## Performance

- Device pixel ratio and backing pixels remain bounded.
- Repeated scene structures should use shared geometry, merged geometry, or
  instancing when that reduces meaningful cost.
- The fleet is drawn from shared `InstancedMesh` batches (two per silhouette
  plus one pennant batch), so its draw-call cost is flat in ship count.
  Hero-tier ships (titans and uniques) keep their own scene graph for their
  bespoke GLB hull, grade shield and identity sail.
- Ship sail logos come from ONE shared atlas texture, not one texture per
  ship. Ships beyond the atlas fall back to the plain canvas plus their
  livery and pennant accent — never a blank sail.
- Overview may hide inspection-only geometry; focused and Explore states may
  reveal it without rebuilding the world.
- Resource counts must remain stable during long sessions and transient
  selection.
- Performance budgets must not be weakened for a cosmetic change without an
  explicit decision and evidence.
- Resource budgets were re-baselined on 2026-07-25 (decision D7, operator
  approval O9): draw calls 450 -> 700, geometries 275 -> 500, textures
  40 -> 72, triangles 70k -> 500k, renderer chunk 820/218 -> 1,600/420 KiB,
  total JS 1,860/530 -> 3,200/820 KiB. Measured cause: the full fleet renders
  instead of 20 ships, hero hulls went from 2 shared models to 10 distinct
  ones, the lighthouse became Wonder-grade, and the sea gained a region field.
- The FRAME-TIME gate was deliberately NOT relaxed. Smoothness is the
  product; bundle and resource weight are not.

## Accessibility And Motion

- Reduced motion freezes the world at a deterministic static frame and keeps no
  continuous RAF alive.
- Normal motion uses one route-owned clock.
- Analytical CSS animations, intervals, independent scene loops, or timers are
  not allowed.
- Keyboard pan, zoom, target traversal, Escape clear, world controls, and
  blank-world clear remain part of the interaction contract.
- Detail panels, labels, announcements, and the accessibility ledger must
  remain useful without reading WebGL pixels.

## Interface

Recorded 2026-07-25 from `agents/2026-07-25-interface-revamp-plan.md`
(decisions DU1-DU17). The world is the subject; chrome that is not in use is
barely there.

- Persistent chrome is one footer line and three faint world controls. Nothing
  else sits over the world unless something is selected or the world has
  something transient to say.
- The world controls are recenter, observe, and day/night. They idle at 40%
  behind a scrim disc and come up to full on hover, on keyboard focus, and for
  two seconds after any camera input. Faintness is paint only: they stay in the
  tab order, keep their accessible names, and are never the sole route to a
  capability.
- The footer carries exactly: product mark and version, Legend, Changelog,
  docked ship count, frame rate.
- There is no fleet search, no follow-selected control, no zoom readout, no
  hour slider, no auto day-night cycle, no fullscreen control, and no
  copy-link control. An exact session hour arrives only through the `t=`
  URL parameter; a view is shared by copying the address.
- The detail panel opens as prose: kind, title, the water it sails in, two or
  three sentences, and at most three figures. Fact rows, members and secondary
  links wait inside a `Read the record` disclosure, whose open state is
  remembered for the session.
- Panel copy speaks in the harbor's voice and keeps every analytical hedge
  verbatim. The accessibility ledger remains the parity surface and carries
  every fact regardless of what the panel shows.
- The interpretive-view disclaimer lives in the legend, which still opens on a
  first visit.
