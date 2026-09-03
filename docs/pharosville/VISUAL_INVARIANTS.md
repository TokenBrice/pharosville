# PharosVille Visual and Analytical Contracts

Last updated: 2026-09-03

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

- The Garden Observatory is asymmetric, sea-first, and intentionally spacious.
  An authored land rim may frame most of the finite plate, but it keeps two
  open-sea passages and broad unnamed water between the named bodies.
  “Spacious” names the ma inside that bounded garden; it does not require an
  infinite ocean beyond the plate.
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
- Harbors are shore stations sited in their body's named rim coves, and the
  station ring is spread around that rim rather than massed on the far
  shore: at most two rendered stations sit at or north of tile y=30, at
  least two hold the camera-near southern arc at y>=112, both horizontal
  extremes of the rim are inhabited, and outside the Ethereum precinct no
  three stations sit within 30 tiles of one another. Those numbers are the
  contract `src/systems/chain-docks.test.ts` enforces for any feed; the
  failure mode they prevent is a far-shore row of silhouettes across empty
  foreground water. Every station keeps a landward, distance-readable
  primary roof at least twice an ordinary hull's length, a contrasting
  clay/slate/thatch/timber palette, and a uniquely named upper silhouette
  that clears nearby sails — second-level silhouettes now span roughly
  7.2–12.4 world units with the Ethereum campanile the tallest, and the
  chain flag stays at exactly 1.6 times its former scale. Every roof is an
  articulated structure rather than a single unbroken plane: a ridge beam
  and cap, an eave fascia, a gable or gablet end, eave brackets, and a
  surface break (pent skirt or stepped course), with each archetype
  carrying one named signature element. A raised stone quay keeps one warm
  lit edge, windows glow at dusk/night, and Ethereum's hall and true
  campanile (shaft, open belfry, bell, and cap) read with its L2 belvederes
  as one precinct through thick railed, covered bridges; the vermilion
  double-lintel torii and every other upper archetype remain nameable from
  the default camera, while TON keeps its detached pigeonnier islet. The
  enlarged architecture, quay edge, windows, and bridge rails carry no new
  analytical meaning beyond the existing station identity and harbor
  reading.
- The finite plate is water-led and garden-framed: the irregular rim covers
  roughly 55–65% of the perimeter, has exactly two open-sea openings, and is
  6–14 tiles deep away from those openings. The two camera-near plate
  margins — the map's south edge and the east edge south of the Danger
  Strait opening — carry a decorative land skirt out across the plate
  margin, so the authored shoreline reads to the near corner instead of
  stranding a band of open water past the map edge; the far pair of margins
  still dissolves into the haze seam, and the Danger Strait and both far
  openings stay open water. The skirt is renderer-side only: it never
  reclassifies a tile, and it changes no navigation, placement, or
  berthing. Shore stations sit in coves, not around the island waterline;
  the Ethereum precinct has a shared path and bridge-connected annexes.
- The TON pigeonnier is spatially distinct. The dead/frozen fleet is a quiet
  sea wreckyard, not an island and never a live-ship destination.
- DOM labels must be legible and must not cover the lighthouse, controls, or
  active detail panel.

## World encoding

| Element | Required reading | Redundant channel |
| --- | --- | --- |
| Lighthouse | PSI score/band | DOM record and beacon state |
| Ship | stablecoin identity, scale, class, risk | branded sail/livery plus DOM record |
| Harbor | chain supply and concentration | hull-dominant landward roof, contrasting archetype palette, sail-clearing named upper silhouette, 1.6× chain flag, DOM record; raised lit quay/window embers are decorative and carry no meaning |
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
required to be "asymmetric, sea-first, and intentionally spacious". The coverage
guard is set at 0.72 for that reason; raising it back toward 1 would recreate
the residue body it was meant to prevent.

Sea-body place-names are carried by low stone steles at body boundaries AND by
the accessibility ledger, which lists every named area. The steles carry a
high-contrast carved name at default zoom; hover or inspection raises it to a
stronger warm-pale emphasis, and at night the inactive carving turns cool pale
so it remains readable against the darkened stone. They are canvas content and
therefore aria-hidden, so the ledger — not the stele — is the redundant channel.
Per-body boundary banks and foam seams are decorative and carry no meaning; the
field, steles, labels, and ledger own classification.

The seven named waters are Calm Anchorage, Watch Breakwater, Alert Channel,
Warning Shoals, Danger Strait, Ledger Mooring, and Wreck Shoal. Their edge
geography is authored from the same field: reeds and mouth islets, banks,
current tongues, shoal bars, a gorge cliff, slate ledger lips, and a wreck
inlet. These forms are decorative and carry no meaning; the field, steles,
labels, and ledger own classification. Wreck causes are read through
representative silhouettes (substantial hull, broken keel, and bare remains)
plus cause colour and the DOM record.

The fleet has six visual families: bezaisen, kobaya, twinhull, takasebune,
junk, and scow. The nine semantic hull classes map onto those six forms;
market-cap tier still controls scale, and brand identity remains in the shared
sail atlas. Motion is leg-based: island-to-shore voyages run in bounded
90–180-second legs and 240–480-second rests, with paired arrivals and
departures and restless rests ordered by risk band. The aggregate moored share
remains one third, and all water-safety decisions use the authoritative field
and its conservative distance lookup.

## Light and atmosphere

- **One arc owns where the light is.** `garden-sun.ts` is the single source for
  the sun's and moon's direction; the key light, the sky dome's glow and the
  water's road and glitter all read it. Three independent constants for the
  same sun is the state this replaced, and because none of them moved, only
  colour changed with the hour — which reads as a filter over the picture
  rather than as light inside it. The arc passes exactly through the calibrated
  noon bearing, so the day grade and the AO ladder cannot drift.
- **The haze band is this world's sky seam.** The finite plate exposes a graded
  sky past its far edge and through its two openings: shironeri fog at the seam,
  through mizu, to kon at the day zenith, descending to kachi-iro at night. The
  far plate dissolves into that seam instead of ending as a tabletop cut. The
  scattering dome still feeds the PMREM probe; the visible gradient, shared sun
  arc and bokashi bands make the background part of the composition rather than
  more water.
- Aerial perspective must actually reach the DEFAULT framing. The fog range's
  scale pivot (`FOG_REFERENCE_VIEW_HEIGHT`) must track the real default view
  height (`viewportHeight / (TILE_HEIGHT * zoom)`, ~96.5 at the Wave 1 landing
  frame). A pivot
  far below it clamps the scale to its maximum, pushes the near plane past
  everything visible, and silently switches the whole system off while leaving
  its documentation looking correct.

- The visible sky continues beyond the finite plate. Its graded phase backdrop
  is the far field; the haze band is the seam where plate, fog, and borrowed
  mountains dissolve together. The dome remains an environment probe, not the
  visible sky.

## Stillness

- After two uninterrupted idle minutes, the signed-off Garden attract mode may
  drift through four authored postcard framings. It is disabled for reduced
  motion, selections, explicit Observe tours, hidden tabs, and almanac events;
  any pointer, wheel, touch, or key input leaves the exact current pose and
  returns agency without a positional snap. This is the sole exception to the
  earlier idle-drift rejection (operator sign-off, 2026-08-13).

- **The night has one dominant light and one secondary.** The dominant is the
  beacon; the secondary is the moon road. Everything else that glows after dark
  — path and terrace lanterns, dock lamps, lit windows, buoy lamps, ship
  lanterns, and every reflection they lay on the sea — is an EMBER: warm,
  present, and subordinate. None of it may be raised to compete. This is
  enforced where the light is authored, not where it is composited: the shared
  lane registry applies a per-kind ember gain (`GARDEN_LANE_EMBER_GAIN`, 0.38 on
  lantern and buoy lanes) and exempts the beacon, and the island's own lamp
  emissives sit a step below the beacon in turn. A night frame containing a
  second thing as bright as the tower is a regression whatever else it gained.
- **Light pools are budgeted, and a crowd of them is thinned before any one is
  dimmed.** At most 16 reflection lanes burn at once at tier full
  (`GARDEN_LANE_BUDGET_FOR_TIER`); the 48-texel lane texture is a packing
  layout, never a target. Two ember lanes closer than
  `GARDEN_EMBER_LANE_MIN_SEPARATION` (8.5 world units — beyond the shader
  pool's 1/e radius plus margin) may not both burn, and the dimmer stands down.
  Overlapping pools merge into one pale disc, which is how the sea turned milky; the remedy
  is fewer lights, not weaker ones. The lamp keeps burning on land — only its
  reflection is thinned.
- **Simultaneity is a viewing condition. A reading is not.** Analytical lanes —
  today the route pulses — are never touched by the ember gain and never
  spatially thinned. They are capped in how many run AT ONCE (four at tier full)
  and rotate on a slow deterministic clock, so every route takes its turn and
  none goes permanently dark. Capping simultaneity and demoting brightness are
  the two sanctioned ways to quiet a cue; removing what it says is not one of
  them.
- **The Pharos precinct carries three secondary reads and no more:** the
  pavilion, the reflection pond, and the signal mast. The tower is the primary.
  Everything else on the rock is landscape (grove, Sakuteiki triads, talus,
  cliffs, tide-stain courses), a service building with a single light (the
  keeper's cottage — one lit window, no strung lanterns), or a part of some
  other composition (the obelisk pair are the quay stair's gateposts, not a
  monument of their own). A fourth free-standing monument must name which of the
  three it replaces.
- **Empty terrace surface is a positive element,** exactly as the emptiness
  between anchorages is. Props on the rock stand at unequal intervals with at
  least one wide dark arc left bare — a ring of evenly-spaced lanterns is the
  same failure as an evenly-scattered fleet, a uniform placement field, and is
  banned for the same reason.
- **Every new feature names what it displaces.** Each wave opens with its
  shed-list, and each addition to a finished frame carries one: a new light
  names the light it demotes or replaces, a new prop names the prop it removes,
  a new motion names the oscillator it slows or stops. "It is cheap" is not an
  argument — the budget being defended is the viewer's attention, not the frame
  time. Additions that displace nothing are how a garden becomes a marina, one
  defensible increment at a time.
- **The audit is a blurred frame.** Blur a preview capture to ~16 px at any
  phase: a large calm, dark, low-contrast region must survive the blur. If the
  whole frame turns into an even field of glow, the composition has no
  emptiness left to read the lighthouse against, whatever the still frame looks
  like at full resolution.
- **Sea quietness is a feature-complete contract.** The water shader's existing
  terms — regions, swell, ripples, wakes, shore and crest foam, cloud shadow,
  sky-probe fresnel, light roads, glints, lanes, tower shadow, fog and bokashi —
  are the complete vocabulary. A future sea idea refines one of those terms and
  names the term it removes or demotes: one in, one out. It does not add another
  independent light, motion or foam vocabulary. Open night water remains below
  the recorded mean-emissive ceiling of 0.016. The focused unit gate in
  `garden-water.test.ts` is explicitly a shader-budget proxy, not a rendered
  pixel claim: it weights the exact moon-road, moon-glitter and lane-clamp GLSL
  gains by their recorded open-water occupancy (unit-luminance conservative
  colours) and asserts a mean of 0.0155. Post-AgX output still requires the
  real-GPU night preview.

- Stillness has authored displacements: the lower-left engawa lantern replaces
  `harbor-lantern.11`; the single hero waterfall replaces the
  `water-silver-accents` draw; and the koi school lives in the calm engawa
  shallows rather than filling the reflection basin. Seasonal and almanac
  dressing follows the rim path and openings. These additions are quiet,
  deterministic, and carry no new analytical meaning.

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

- The measured default budget is approximately 256 recurring draw calls,
  335,105 triangles, 230 geometries, and 43 textures on the reference Apple
  M5 Pro frame (60 fps at tier full; phase variation is expected within the
  existing ceilings). The whole-map N8AO release keeps the animated
  overview at 72 textures or fewer; hard ceilings remain 700 calls, 500
  geometries, 500,000 triangles, and 72 textures.

## Motion and access

- One route-owned clock drives normal motion. No per-entity timers, independent
  CSS analytical animation, or renderer loops.
- Reduced motion is a complete deterministic static composition with zero
  continuous RAF.
- Hidden/offscreen surfaces pause and resume without a catch-up teleport.
- Keyboard traversal, pan/zoom, selection, Escape clear, controls, detail
  anchors, and hit testing remain useful without inspecting WebGL pixels.
