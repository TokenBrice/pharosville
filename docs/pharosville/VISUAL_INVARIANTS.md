# PharosVille Visual and Analytical Contracts

Last updated: 2026-09-04

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
- **The resting frame is a sailed-in close composition.** `defaultCamera`
  rests at `GARDEN_DEFAULT_CAMERA_ZOOM` (1.0) wherever the authored Pharos
  (60,70) → Ethereum Mole (15,95) landing interval seats with the island centre
  clear of the 128 px right-hand anchorage gutter; narrower gates fit the
  interval instead (0.825 at 1200 px wide) and no legal viewport rests below
  `GARDEN_REST_ZOOM_FLOOR` (0.8). The statue tip keeps its sky. Whole-map
  framing remains the explicit zoom-out via `minZoomForViewport`. The four
  idle postcards are sailed-in framings (zoom 1.0–1.4), never wider than rest.
  Pinned in `src/systems/camera.test.ts` and `garden-attract.test.ts`
  (warm-village A1, 2026-09-05; replaces the retired 0.60 plate composition).
- **Fleet placement capacity and displayed hull count are separate.** The
  eligible fleet retains the 320-ship placement and batch capacity; density,
  water-safe placement, lighthouse clearance, and edge falloff preserve the
  authored anchorage composition. Below zoom 0.7, displayed hulls thin
  reversibly toward each risk band's dominant mooring plus one or two
  representatives per other mooring at whole-map framing; thinned hulls leave
  pointer hit testing but never the keyboard order, detail panel, or ledger.
  This viewing condition is never baked into placement; the former 20-ship cap
  remains retired. Pinned in `src/systems/garden-fleet-thinning.test.ts`.
- **Distance, zoom, and displayed hull count are viewing conditions, not
  identity changes.** The fleet recedes with depth (chroma, never value), its
  marks begin fading only below zoom 0.85, and its displayed count thins below
  zoom 0.7, so a wide framing reads as a harbour rather than as a hundred and
  eighty-five stickers. At the zoom-1.0 rest marks are fully present and the
  extra framing restraint is fully released; wider framing applies at most the
  operator-approved ~10 % further chroma restraint (2026-09-05, superseding the
  15–20 % step of 2026-08-13). Sailing in to zoom 0.7 restores every eligible
  hull. Restraint and thinning must never be baked into the cloth colour or
  into placement, which would remove identity or hulls with no way back.
  Market-cap tier still controls hull scale: the 0.7–3.0 data band maps onto a
  ~2.6× visual range above a 0.8 legibility floor so all six hull families stay
  separable at rest (`src/three/garden-ships.test.ts`).
- Harbors are shore stations sited in their body's named rim coves —
  eight authored coves for the eight chain harbors — and the station ring
  is spread around that rim rather than massed on the far shore. On any
  feed carrying at least eight eligible chains including Ethereum — the
  production case — at most two rendered stations sit at or north of tile
  y=30, at least two hold the camera-near southern arc at y>=112, both
  horizontal extremes of the rim are inhabited, and all four rim arcs are
  occupied. Two rules hold on EVERY feed, however sparse: no three stations
  sit within 30 tiles of one another, and every rendered dock sits on a
  valid assigned mouth wearing that mouth's archetype. The arc and extreme
  requirements are deliberately scoped, because a feed of fewer than four
  eligible chains cannot inhabit four arcs and one without Ethereum cannot
  fill the Mole at all — the mole slot is EVM-pool-only. Those numbers are
  the contract `src/systems/chain-docks.test.ts` enforces; the failure mode
  they prevent is a far-shore row of silhouettes across empty foreground
  water. On a dense feed the rendered harbor count stays eight chain harbors
  plus the TON pigeonnier — TON itself renders only when its supply is
  non-zero, and a sparse feed renders fewer — so no density amendment
  accompanies the smaller
  mouth inventory. Every station keeps a landward, distance-readable
  primary roof at least twice an ordinary hull's length, a contrasting
  clay/slate/thatch/timber palette, and a uniquely named upper silhouette
  that clears nearby sails — second-level silhouettes now span roughly
  13.3–17.9 world units for chain stations (re-based 2026-09-05 so an
  ordinary hall reads near the reference's 1/6-frame landmark scale at the
  zoom-1.0 rest; vertical only — footprints, water exclusion, and berthing
  unchanged; `src/systems/dock-layout.test.ts`), the Ethereum Mole excepted
  at a 21.5 local cap (≤21.7 above water), still ≥1.20× the tallest ordinary
  rung on the authored ladder, and the
  chain flag uses 2.6 times its original scale, on a raised seaward staff clear
  of the station roof. This supersedes the 1.6× limit to meet the operator's
  harbor-recognition request: flags must show their complete chain mark and
  remain broadly camera-facing while luffing. Every roof is an
  articulated structure rather than a single unbroken plane: a ridge beam
  and cap, an eave fascia, a gable or gablet end, eave brackets, and a
  surface break (pent skirt or stepped course), with each archetype
  carrying one named signature element. A raised stone quay keeps one warm
  lit edge, windows glow at dusk/night, and the Ethereum Mole stands alone
  as the ring's civic monument; L2 stations are self-standing distant
  harbors; every upper archetype remains nameable from the default camera,
  while TON keeps its detached pigeonnier islet. The station landing torii
  is retired; the world keeps its separate decorative torii on the garden
  islets, rendered from its own geometry. The enlarged architecture, quay
  edge, and windows carry no new analytical meaning beyond the existing
  station identity and harbor reading.
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
  berthing. The skirt's rest-frame corner (the bottom-left at the 1.0 rest,
  around tile 60,141) carries two named dark foreground masses — the corner
  pine group and the kuro torii with its fence run,
  `GARDEN_RIM_FOREGROUND_MASSES` in `src/three/garden-rim-mesh.ts` — which
  frame the plate's near edge, displace that same open-water band rather
  than adding a new prop vocabulary, stay clear of the lighthouse rect and
  the Mole quay from the default camera, are pure silhouettes after dark
  (no emissive), and shed with the other skirt furniture below zoom 0.62
  (`garden-rim-mesh.test.ts`). Shore stations sit in coves, not around the
  island waterline; the Ethereum Mole stands alone as the ring's civic
  monument; L2 stations are self-standing distant harbors.
- The TON pigeonnier is spatially distinct. The dead/frozen fleet is a quiet
  sea wreckyard, not an island and never a live-ship destination.
- DOM labels must be legible and must not cover the lighthouse, controls, or
  active detail panel.
- **Harbor stations are named in-frame at every zoom.** The eight rendered
  chain stations and the TON pigeonnier carry always-on, aria-hidden DOM chips
  projected from their existing station/landmark label anchors — whole-map
  framing, where all nine share the frame, included. Each chip shows the
  chain logo when its existing same-origin
  `logoPath` is available (otherwise the painted initials), the chain name,
  and one existing concentration-state word; the TON fallback names its
  existing watch state. When chips overlap, the lower-supply station steps
  below the higher-supply one. A chip is hidden rather than covering the
  lighthouse, bottom controls, or an active detail panel, and an off-screen
  anchor hides its chip. Ships receive a chip only while selected (the
  arrival/anomaly trigger input is reserved for the life phase). These chips
  displace hover-only station naming, add no WebGL draw or texture, and stay
  aria-hidden because the accessibility ledger is the spoken naming channel.
  Pinned in `src/components/harbor-label-chips.test.tsx`.

## World encoding

| Element | Required reading | Redundant channel |
| --- | --- | --- |
| Lighthouse | PSI score/band | DOM record and beacon state |
| Ship | stablecoin identity, scale, class, risk | branded sail/livery, family-coded hull timber plus DOM record |
| Harbor | chain supply and concentration | hull-dominant landward roof, supply-driven roof mass, contrasting archetype palette with per-chain accent, sail-clearing named upper silhouette, 2.6× chain flag on a raised seaward staff, DOM record; raised lit quay/window embers are decorative and carry no meaning, and the Mole's basin, tide courses, and capstones likewise carry no analytical meaning |
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

Sea-body place-names are carried by low cedar boards on paired pilings at body
boundaries AND by the accessibility ledger, which lists every named area.
Mixed-case serif names use one shared ink atlas and the timber uses one batched
draw. Hover or inspection raises the ink to warm-pale emphasis; at night the
inactive ink turns muted tan so it remains readable against darkened timber. The
world signs are aria-hidden; the ledger remains the redundant naming channel.
Per-body boundary banks and foam seams are decorative and carry no meaning; the
field, boards, labels, and ledger own classification.

The seven named waters are Calm Anchorage, Watch Breakwater, Alert Channel,
Warning Shoals, Danger Strait, Ledger Mooring, and Wreck Shoal. Their edge
geography is authored from the same field: reeds and mouth islets, banks,
current tongues, shoal bars, a gorge cliff, slate ledger lips, and a wreck
inlet. These forms are decorative and carry no meaning; the field, boards,
labels, and ledger own classification. Wreck causes are read through
representative silhouettes (substantial hull, broken keel, and bare remains)
plus cause colour and the DOM record.

The fleet has six visual families: bezaisen, kobaya, twinhull, takasebune,
junk, and scow. The nine semantic hull classes map onto those six forms;
market-cap tier still controls scale, and brand identity remains in the shared
sail atlas. Each family carries its own authored timber — six palette-derived
hull colours on an OKLCH value/hue ladder (`GARDEN_HULL_FAMILY_PAINT`) with the
issuer's 0.12 whisper in the timber, while the sheer strake stays painted in
the issuer's colour — so hull form and hull colour encode the same family
reading (warm-village C2, 2026-09-05). Motion is leg-based: island-to-shore voyages run in bounded
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
  scale pivot (`FOG_REFERENCE_VIEW_HEIGHT`) derives from
  `GARDEN_DEFAULT_CAMERA_ZOOM` and so tracks the real default view height
  (`viewportHeight / (TILE_HEIGHT * zoom)`, 62.5 at the 1.0 rest frame). A
  pivot far below it clamps the scale to its maximum, pushes the near plane
  past everything visible, and silently switches the whole system off while
  leaving its documentation looking correct; `garden-sky.test.ts` pins the
  near plane at the default framing.
- **Dusk is an ember hour, not a brown-grey one.** The dusk fog and horizon
  dye derive from `lantern_warm` toward `vermillion`, the dusk zenith is a navy
  distinct from night, the dusk key rakes (key:fill ≈ 4:1, sun floor 0.06 rad
  from the single `garden-sun` arc), and the borrowed mountains step through
  three value planes (0.90/0.80/0.70) behind the seam. The output tone mapper
  is a single switch, `GARDEN_TONE_MAPPING` in `garden-post.ts`, consumed by
  both the renderer and the post pass; the LUT remains the sanctioned place
  for any posterizing look.

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
  `water-silver-accents` draw; the koi school lives in the calm engawa
  shallows rather than filling the reflection basin; and station chimney
  smoke on three archetypes (uogashi, hatago-wharf, tea-house-quay) displaces
  the beacon plume's uniqueness — unlit, ember-tier, data-gated on the cargo
  tide, one instanced draw (`garden-station-smoke.test.ts`). Seasonal and
  almanac dressing follows the rim path and openings. These additions are
  quiet, deterministic, and carry no new analytical meaning.
- **Arrivals and departures are the fleet's readable beats.** Their transient
  sail dips, existing wake-field bow/stern stamps, and transient DOM
  nameplates derive from the route-owned segment clock; no ship owns a timer.
  During the first 4 seconds of dock dwell, sails ease from 1.0 to 0.6 over
  1.2 seconds, hold for 1 second, and ease back to 1.0 by second 4; departure
  repeats the dip over the last 4 seconds of dwell and the first 2 seconds of
  transit. Outside these windows every ship's sail scale is exactly 1.0,
  moored and hero/GLB identity sails included — the sail is the identity
  channel and a beat may never become a moored state. This displaces the
  beam's monopoly on large motion and 30 % of the moored-bob amplitude, adds
  no draw or texture, and at tier full caps wake/nameplate simultaneity at six
  by market cap while every ship remains eligible for the dip. Reduced motion
  returns the quiet envelope with fully set sails. Pinned in
  `src/systems/garden-arrival-beats.test.ts` and
  `src/three/garden-fleet-batch.test.ts`. Bird life is amplitude, not count:
  the sortie share is 0.6 with wider loops (2026-09-05 D2), an existing
  oscillator re-tuned rather than a new one.

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
- Palette and region themes are shared contracts: every non-reserved
  `HARBOR_PALETTE` token stays below OKLCH C 0.14 (raised from 0.10 on
  2026-09-05 so land reads warm ochre/green against a cooler, more saturated
  teal-to-indigo sea), reserved accents keep their authored exceptions, and
  `sail_teal`/`sail_red`/`lantern_warm`/`vermillion` are immutable
  (`src/systems/palette.test.ts`). Do not introduce arbitrary debug colors or
  post effects to solve basic composition problems.
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
  continuous RAF. Ordinary ships settle directly at their authored safe risk
  anchorage, using its rest heading; Ledger Mooring keeps its own representative
  stop and squad consorts keep their flagship offsets. This is a composed
  representative view, not a count of ships instantaneously docked.
- Soft sea-room avoidance operates on final garden positions after route
  smoothing. It uses hull length/beam envelopes, keeps moored hulls fixed, and
  preserves formation-child attachment. Persistent corrections stay within eight
  tiles of the route and 1.2 tiles/second, reject unsafe water/mole steps, and
  taper to zero at the berth. They relax home only when clear. Final position
  derivatives drive follow velocity; the route-smoothed hull heading is preserved.
  Rendering, hit testing, following and debug positions share `displayTile`.
  This reduces underway crowding; it does not guarantee collision-free berths
  or formations, and reduced-motion anchorages are never nudged.
- Hidden/offscreen surfaces pause and resume without a catch-up teleport.
- Keyboard traversal, pan/zoom, selection, Escape clear, controls, detail
  anchors, and hit testing remain useful without inspecting WebGL pixels.
