# PharosVille Runtime and Analytical Contracts

Picture direction belongs in `VISUAL_INVARIANTS.md`; this file owns runtime,
truth, access and resource limits. The Hour-Print plan (rulings §3 and operator
decisions §4.1) supersedes conflicting Reborn prescriptions, and the accepted
Reborn decisions D1–D17 still stand where Hour-Print left them alone. Both
plans, and the verbatim pre-Hour-Print invariants archive, were retired from
the tree after v0.19.0 and remain in git history at commit `599c822`. The active
upgrade plan is `agents/2026-10-02-visual-upgrade/01-implementation-plan.md`.
Change a contract only with explicit intent and matching code, meaningful tests
and route documentation. Test pointers below locate coverage; old implementation
pins are not authority over the accepted picture.

## Runtime, security and access

- One production Three.js/WebGL renderer. Failure hides WebGL and presents the
  selectable DOM `WorldStaticOverview`; never boot another graphical renderer.
  WebGPU is outside this implementation session.
- Both the device screen and current viewport must satisfy the sorted-dimension
  `900×720` or `1200×640` size profile before world data, Three runtime, GLBs or
  logos load. These are size tests, never orientation tests.
- Browser world code calls same-origin `/api/*` only. `PHAROS_API_KEY` remains
  server-side; never expose it through client code, fixtures, docs or logs.
- Every analytical cue has detail-panel and accessibility-ledger parity, including
  source fields, freshness and caveats. Every tracked record remains reachable
  through keyboard order, search, selection, details and the ledger.
- The endpoint registry owns all seven source labels, roles and iteration order.
  World freshness is a required status per source: `loading`, `current`, `stale`
  or `unavailable`, with independent complete/partial/unknown coverage.
  A usable stale sample is displayed as **held (as of …)**; exhausted refresh
  errors hold it immediately even with fresh-looking envelope metadata.
  A missing sample is loading only while pending, otherwise unavailable.
  Unknown age is held, never assumed current.
- Source observations and publication/as-of times are separate epoch-millisecond
  fields; unknown observation times remain unknown. Receipt and the scene
  snapshot never renew observations. The existing 30-second visible query tick
  and visibility resume reclassify age using the shared freshness ratios
  (fresh through 8× the endpoint budget, degraded through 12×); no new timer.
  Semantic status-map equality preserves the world on a no-op tick, and freshness
  remains excluded from the render-content signature.
- Publication holds the last renderable payloads, not an obsolete world/status
  object: geometry identities and selected records survive incomplete refreshes
  while live source state updates. The ledger exposes seven registry-ordered
  source rows with times, coverage and reasons. Complete/current certification
  requires all seven current with explicitly complete coverage; current endpoints
  with partial or unknown coverage remain qualified. The lamp says unreachable
  only when all seven report explicit fetch failures, never merely old samples;
  its eased appearance is separate from immediate observed DOM status.
  Coverage: `src/hooks/use-pharosville-world-data.test.tsx`,
  `src/hooks/use-api-query.test.ts`, `src/systems/lamp-status.test.ts`,
  `src/components/accessibility-ledger.test.tsx`.
- Each ship retains its own peg, DEWS and grade evidence. DEWS observation age
  uses that row's `computedAt`, not a fresh envelope or another coin's sample;
  unavailable inputs qualify coverage, and missing/unsupported DEWS cannot
  certify calm. Known peg readings survive independently; the existing default
  berth remains explicitly caveated when risk evidence is unavailable.
  Peg observations require upstream `priceObservedAt` and mode; local-fetch,
  unknown or absent observation times stay unknown, with publication/as-of
  labeled separately. Grade observations use `asOfSec`.
  Currently and each ledger ship line expose the same relevant source states,
  observation/publication times and methodology; the own DEWS number is qualified
  by its own evidence rather than the flagship's or the global source summary.
- PSI keeps the official score, band, `computedAt`, version and input degradation;
  no local recomputation or unrelated publication renews the historical reading.
  Market stability and the ledger distinguish its observation from the world
  snapshot (including mint/burn publication). Sky appearance is separately
  delayed/eased, requires 60 continuous current seconds to accept a band, and
  holds the last accepted appearance—or neutral if none—while evidence is held.
  Coverage: `src/systems/pharosville-world/stages/ship-placement.test.ts`,
  `src/systems/risk-placement.test.ts`, `src/systems/pharosville-world.test.ts`,
  `src/components/detail-panel.test.tsx`, `src/systems/psi-sky.test.ts`.
- The session market log compares accepted **own** peg/DEWS categories, not
  displayed berth tiles or a consort's inherited formation category. Both own
  risk carriers must be current with complete coverage; quality-only relocation
  may interpolate but never narrates deterioration or recovery. New same-category
  samples and methodology switches are silent; recurring comparable category
  edges receive distinct, monotonic occurrence IDs. Entries and ledger `<time>`
  use the decisive row's observation time (or unknown), never snapshot generation
  or unrelated publication. Log and now-line describe risk readings, not voyages.
  Coverage: `src/hooks/use-harbor-log.test.tsx`, `src/systems/motion-planning.test.ts`.
- Colour is never the only carrier of meaning. Keyboard traversal, pan/zoom,
  selection, Escape clear, controls, detail anchors and hit testing must remain
  useful without inspecting WebGL pixels. Focused controls remain available.
- DOM labels stay legible, clear of the lighthouse, controls and active detail
  panel, and hidden off-screen. Ship ink labels appear only on selection or for
  the crossing subject (the one admitted arrival ceremony) and are aria-hidden;
  their band word carries a glyph and a tone, never colour alone. Chain nobori,
  not permanent chain/concentration captions, identify harbours. TON has no
  permanent caption. Concentration remains in details and the ledger.
  Coverage: `src/components/harbor-label-chips.test.tsx`.
- Chrome text roles (now-line, ink labels, record card, controls) come from the
  light score, not a day/night switch: `src/systems/chrome-air.ts` mixes per-beat
  anchors, `useChromeAir` writes them to `:root` once a minute, and every role
  holds ≥ 4.5:1 on its own surface at the five beat anchors and through every
  crossfade. The chrome follows the wall clock only, never market data.
  Coverage: `src/systems/chrome-air.test.ts`.
- A non-current source outranks every other now-line phrase: evidence warning, then a
  first-visit or return-visit line, then the crossing, then a market transition,
  then the ambient phase. The status region speaks the phrase only, never the
  minute; decorative words (moon, cloud cover, kō) never reach it.
  Coverage: `src/components/now-caption.test.tsx`.

## Analytical authority and channels

| Element | Required meaning | Redundant channel |
| --- | --- | --- |
| Lighthouse | PSI score and band | Beacon state, exact DOM record and ledger |
| Ship | Stablecoin identity, cap scale, class and risk | Complete branded sail, family form/timber, DOM record |
| Harbour | Chain supply and concentration | Supply-scaled hall frontage, named archetype, chain nobori, DOM record |
| Water body | Existing risk/ledger category | Water character, boundary/buoy, inspection name and ledger |
| Fallen coin | Lifecycle status and cause | One unmarked set stone in the stone garden (size = peak cap, form = cause family), DOM record |

- At rest the world carries three coarse readings: tower = PSI, water = risk band,
  hero ships = who leads. Exact information lives in the DOM, not more ornament.
- The detail plaque quotes at most three first-screen figures. Its explicit
  `Read the record` rows are bounded: ship ≤11 core rows (including Formation
  and a DEX exception), lighthouse ≤12, harbour ≤6, pigeonnier 2 and grave ≤3.
  Material qualifiers stay with the quantity they explain; unknown labels are
  never dumped into the record. Currently carries full signed peg/actual trim,
  placement evidence status and source, and active risk-band tracking. Formation
  leads with the selected member's own distress without changing shared berths.
  Chain shares, footprint and route source remain inspectable together.
- Harbor light names the observed source status, separately from Beam warmth;
  appearance eases over about two observations. Snapshot generation is labeled
  as a snapshot, never as a PSI observation time. Month garden history is a
  distinct clause beside the worst-band mark, not the same measurement.
  This record repair exposes existing values only; upstream source observation
  times and issuance coverage are not inferred from snapshot generation.
  Coverage: `src/components/detail-panel.test.tsx`,
  `src/components/accessibility-ledger.test.tsx`, `src/lib/format-detail.test.ts`.
- A ship's own finite DEWS score is shown as `DEWS n/100`, folded after the
  stress driver in Currently and repeated bare in its ledger line. Consorts
  retain their own score even though placement inherits the flagship's depth.
  Depth biases the preferred tile, not the order of final packed berths;
  sticky placement holds depth changes below `0.02`.
  Coverage: `src/components/detail-panel.test.tsx`,
  `src/systems/pharosville-world/stages/ship-placement.test.ts`.
- Harbour `Net flow 24h` values disclose an estimated allocation by held supply,
  renormalized across rendered in-scope chains. Changing the rendered harbour
  subset can change that estimate; untracked reasons never present an estimate
  or a measured zero. Ship and fleet issuance remain raw payload readings.
  Coverage: `src/systems/pharosville-world/stages/cargo-tide.test.ts`,
  `src/systems/detail-model.test.ts`, `src/components/accessibility-ledger.test.tsx`.
- Peg trim is the sole analytical hull-height carrier: fresh ±50 bps gives
  ±0.08 local trim, fresh ±200 bps gives ±0.16, and stale or missing peg evidence
  gives zero trim. Procedural and attached hero hulls, batched hulls, rig and
  lanterns carry that same trim once under the ship's scale. Issuance changes
  cargo work, never hull height; hero roots retain their nonfinancial pose.
  Coverage: `src/three/world-renderer.test.ts`, `src/three/garden-ships.test.ts`,
  `src/three/garden-fleet-batch.test.ts`.
- Routes and docking cadence show rendered-chain/risk presence, never transfers,
  bridge volume, transactions or issuer operations. Missing or stale peg evidence
  is a caveat, not confirmed stress. Decorative quay lights, windows, basin tide
  courses, capstones, landscape and ambient life carry no new analytical meaning.
- The finite `140×140` terrain field is the sole authority for navigation, risk
  classification, placement and motion, including conservative water-distance
  lookup. The renderer never reclassifies a tile. Extra sea, headlands, rim skirts
  and hills are decorative and non-selectable; they cannot change berthing.
- PSI owns clarity aloft: cloud cover, horizon visibility and wind calm follow
  market stability with slow hysteresis. Cloud cover is a fixed ladder by band
  (`SKY_CLOUD_COVER`, `src/systems/psi-sky.ts`), named by the same cover word in
  the now-line and the ledger. Non-current sources own bounded low fog in
  their own water; wall clock owns illumination; nothing else writes the sky.
  Non-current PSI freezes the last good sky, never clears it. Details and ledger expose
  exact PSI, band, as-of and unavailable state; copy says “market stability”,
  never a forecast or weather causation. The weekly supply tide is the one tide
  signal: it is drawn only as the tidal flat's bare area and its wrack line
  (`src/three/garden-tidal-flat.ts`), with ledger parity.

## Sea partition and geography

- Every water tile belongs to exactly one body, with no fallback or residue body.
  Classification coverage and visible naming coverage are distinct: roughly a
  quarter of the sea is open approach, not an attribution gap. Keep the named-water
  coverage guard at `0.72`; do not raise it toward `1` to erase open water.
- Size bodies for expected traffic; density spread stays within roughly `3×`,
  not `13×`. The named waters are Calm Anchorage, Watch Breakwater, Alert Channel,
  Warning Shoals, Danger Strait, Ledger Mooring and Wreck Shoal.
- Depth, swell, chop, foam, reflection, boundary movement and buoys may vary by
  field. Boundary banks, foam seams, reeds, mouth islets, current tongues, shoal
  bars, gorge cliffs, slate lips and wreck inlets are decorative, never classifiers.
- Sea names use low cedar boards on paired pilings at body boundaries, a shared
  mixed-case serif ink atlas and batched timber. Boards are inspection-only:
  hidden at rest, raised on water-body hover/focus, with warm-pale emphasis and
  legible night ink. Boards are aria-hidden; the ledger lists every named area
  and remains canonical. The field owns classification, not the board geometry.
- The water-led finite rim covers roughly `55–65%` of the perimeter, has exactly
  two open-sea openings and is `6–14` tiles deep away from them. The south margin
  and east margin south of Danger Strait may carry a decorative land skirt;
  Danger Strait and both openings remain water. The real sky dome, sea annulus,
  far-rim hills and headlands replace the backdrop sheet and probe-only sky rule.
- Stations occupy rim coves, never the island waterline. TON's pigeonnier is
  spatially distinct. The fallen coins are a stone garden on the Wreck Shoal's
  south shore, outside the rest frame (`src/three/garden-stone-garden.ts`), not
  an island or live-ship destination. Foreground masses stay clear of the lighthouse
  and Mole and remain non-emissive silhouettes at night. Near-edge furniture
  sheds below zoom `0.62`; its field/navigation exclusion never changes.
  Coverage: `src/three/garden-rim-mesh.test.ts`,
  `src/systems/garden-sea-regions.test.ts`, `src/systems/garden-zone-coverage.test.ts`.

## Fleet capacity, identity and camera

- Placement and batching retain capacity for `320` ships. Every eligible hull
  is visible at zoom `≥0.5`, including rest; no presentation cap or return to the
  former 20-ship cap. Density, water safety, lighthouse clearance and edge falloff
  must preserve authored anchorages, not remove records.
- Each risk band seeds three, five or seven widely separated, unequal moorings,
  filled from the middle outward. Never substitute a uniform grid or uniform
  blue-noise field. Test cluster structure and the largest empty circle, not
  nearest-neighbour spacing alone. Also preserve the projected continuous inlet
  at both desktop gates. Coverage: `src/systems/garden-fleet-placement.test.ts`.
- Below zoom `0.5`, display may thin reversibly toward the dominant mooring plus
  one or two representatives per other mooring at whole-map framing. Hidden hulls
  leave pointer hit testing, never keyboard order, details or ledger. Thinning is
  a viewing condition, not placement or identity. Sailing back to `0.5` restores
  every eligible hull. Coverage: `src/systems/garden-fleet-thinning.test.ts`.
- Near/far presentation controls rig detail, chroma restraint and mark presence;
  never bake it into cloth colour or placement. Distance recedes through chroma,
  not identity-destroying value changes. Zoom restraint starts below `0.62` and
  is reversible; the previous wider-frame extra chroma restraint was about `10%`.
  Screen-distance hierarchy replaces the requirement that every rest-frame mark
  assert equal presence. Complete logos and fallback initials remain on cloth;
  delete identity plates, not issuer identity.
- Six visual families — bezaisen, kobaya, twinhull, takasebune, junk and scow —
  carry nine semantic hull classes. Keep family form and palette-derived timber
  redundant, the issuer's `0.12` timber whisper and issuer-coloured sheer strake.
  Six DOM cap-tier labels survive. The accepted scale is
  `clamp(0.42 * (cap / 1e7)^0.10, 0.42, 1.15)`, replacing the `0.8` floor and
  old `2.6×` visual ladder. Coverage: `src/three/garden-ships.test.ts`.
- The rest view is an authored pose, not a zoom: seat C on the south shore
  (`src/systems/rest-seat.ts`), yaw `31°`, pitch `2.6°`, eye `15.2` u,
  long-lens perspective with a vertical FOV of `32°`, the tower foot in the
  middle-right ninth at every gate profile (the tall `720×900` window takes its
  own eye along the same orbit). The crown must read against real sky.
  An orthographic `24°` fallback requires explicit operator re-acceptance, not
  a silent swap. Whole-map framing remains an explicit zoom-out.
- Projection, picking, DOM anchors, follow and camera motion share one contract.
  Preserve a screen-space pick tolerance for `0.42`-scale hulls and perspective
  foreshortening; GLB scale, anchor and pick proxy must agree at camera extremes.
  Selection discloses DOM details immediately.
  Coverage: `src/systems/camera.test.ts`, `src/systems/postcards.test.ts`.

## Station siting and architectural identity

- Eight authored coves host eight chain harbours. On feeds with at least eight
  eligible chains including Ethereum, at most two stations sit at/north of
  `y=30`, at least two occupy `y≥112`, both horizontal extremes are inhabited,
  and all four rim arcs are occupied. The Mole slot is EVM-pool-only.
- On every feed, however sparse, no three stations sit within `30` tiles of one
  another, and every dock uses a valid assigned mouth and its archetype. Sparse
  feeds need not fill impossible arcs/extremes. Dense feeds render eight chain
  harbours plus TON's pigeonnier; TON renders only with non-zero supply.
  Coverage: `src/systems/chain-docks.test.ts`.
- Stations are one vernacular: low, roof-dominant houses (charred-cedar lower
  walls, pale plaster, grey kawara under deep eaves) whose roof takes 40–60 % of
  the elevation, and nothing rises past the rim hills. Hall length and span
  carry supply frontage; heights are data-independent. The Ethereum Mole's open
  fire-watch frame is the ring's one vertical at `13.5` u, about a third of the
  Pharos. Identity lives at ground level and on the nobori.
  Coverage: `src/systems/dock-layout.test.ts`.
- Chain nobori (K28) replace the rooftop flags: one narrow banner per station
  (a pair at the Mole), `0.97–1.165 × 3.16–3.79` u cloth on an L-pole at the
  seaward eave or landing, tip `≤13.7` above water (`HARBOR_NOBORI_ENVELOPE`),
  facing the rest seat. Kinari cloth carries the complete chain mark (mon over
  vertical initials) in a muted ink of the chain's hue (OKLCH `C ≤ 0.10`,
  `L 0.38–0.62`, never above `vermillion`); every in-frame mark stays `≥18 px`
  tall at the 1600×1000 rest. Coverage: `src/systems/dock-layout.test.ts`,
  `src/three/garden-chain-flag.test.ts`, `src/three/garden-harbor-batch.test.ts`.
  One stone lantern per station kindles at blue hour in distance order.
- Raised quays keep a warm lit edge and dusk/night windows; the Mole alone is
  the ring's civic monument. L2 stations are self-standing distant harbours.
  No torii stand anywhere in the garden (O6): the Pharos landing is marked by
  two set stones and a kutsunugi step. Enlargement adds no analytical meaning.
- The Pharos precinct is demilitarised: shoin court, engawa and dry-stone replace
  curtain walls, bastions and merlons. Tower remains primary; pavilion, pond and
  signal mast are the only secondary precinct reads. Another monument must
  explicitly replace one, not join them.

## Light, palette, water and rendering budgets

- One shared sun/moon arc owns key direction, dome glow, water road and glitter.
  Wall clock is the default premise, never a flattering fixed hour. The beats
  follow the solar clock (`src/systems/sky-almanac.ts`: nominal 35°, hemisphere
  from the time zone); the key keeps a compressed ±57° arc around a noon side
  light from the rest seat's right (azimuth `−yaw`), apex `0.62` rad. Re-key
  light, AO, probe and grade together. Atmospheric depth must reach the actual
  default framing. Coverage: `src/three/garden-sky.test.ts`, `src/three/garden-day-cycle.test.ts`.
- Use one tone-mapping authority for renderer and post pass; LUTs may shape the
  look but cannot substitute for geometry/light. Neutral noon supersedes the
  honey-key prescription. Preserve differentiated dusk/blue-hour/night and
  separated distant value planes, not a second colour-only day.
- Shared palette/region authority is mandatory. Non-reserved palette chroma stays
  below OKLCH `0.16` (the later field ceiling supersedes the earlier `0.14`);
  vermillion at about `0.177` remains loudest. Immutable tokens:
  `lantern_warm` = `#d49a3e`, `vermillion` = `#c23a22`,
  `sail_teal` = `#3a5e5a`, `sail_red` = `#9a3a2e`.
  Reserved authored exceptions remain; DOM colours derive from, never redefine,
  these anchors. No arbitrary debug colours or post effects as composition fixes.
  Coverage: `src/systems/palette.test.ts`.
- Night's beacon dominates, moon road is secondary and all other lights and
  reflections are embers. Enforce hierarchy at authorship, not just compositing.
  The shared per-kind ember gain is `0.38` for lantern/buoy lanes; beacon is
  exempt and island lamps remain subordinate.
- At full tier, at most `16` reflection lanes burn; `48` texels describe packing,
  not a light-count target. Ember lanes closer than `8.5` world units cannot both
  burn; the dimmer reflection stands down while its land lamp remains lit.
  Thin overlapping pools before dimming every pool.
- Analytical route lanes are exempt from ember gain and spatial thinning. Cap
  simultaneity at four at full tier and rotate deterministically so every route
  takes its turn; quieting a cue cannot permanently remove its reading.
- Sea vocabulary is bounded: regions, swell, ripples, wakes, shore/crest foam,
  cloud shadow, sky-probe fresnel, light roads, glints, lanes, tower shadow, fog
  and bokashi. Each new term replaces/demotes an existing term. Hero-only planar
  reflection replaces synthetic beacon columns and hero reflection quads; it is
  clipped, half-resolution, tower/island/grove only, budgeted at `+12` calls,
  `+12k` triangles, `+2` textures and `≤1.2 ms` GPU, not a full-scene pass.
- Open night water retains mean-emissive ceiling `0.016`. The existing unit proxy
  weights moon-road, moon-glitter and lane-clamp gains by recorded open-water
  occupancy with conservative unit-luminance colours, asserting `0.0155`.
  This is a shader-budget proxy, never rendered-pixel proof; real-GPU night
  output still needs review. Coverage: `src/three/garden-water.test.ts`.
- Blur a real-GPU preview by about `16 px` at every phase: a large calm, dark,
  low-contrast region must remain. Cosmetic improvements cannot relax budgets.
- Hard ceilings: `700` draw calls, `500` geometries, `500,000` triangles,
  `72` textures and `20 ms` whole-frame time. GPU p95 target is `16 ms` with
  shipped passes on at `1600×1000`; measure GPU separately from CPU/main-thread
  time and discard disjoint query samples. Animated whole-map N8AO also stays
  within `72` textures. Historical device baselines are not allowances.
- Reborn acceptance is tighter: at most `275` scene calls after Core (`285` with
  extensions), `480k` triangles and `60` textures. Spending needs measured owner
  deltas; never spend hypothetical savings. Device/backing pixels, resource
  counts and bundle sizes remain bounded. Fidelity tiers preserve semantic hues,
  palette, tone mapping, day grade and vignette; permitted local contrast or
  luminance changes must retain meaning and avoid transition pops.

## Media and motion

- Procedural geometry/materials own island, harbours, ordinary fleet, water,
  wrecks, landmarks, sky and ambient life. Checked lighthouse/hero GLBs keep
  hash, origin, scale, anchors, pick proxy and budgets coherent; load failure
  leaves aligned procedural forms visible. Logo decode failure preserves sail
  symbols and painted chain initials.
- Batch/instance repeated fleet structures, marks, lanterns and suitable scenery.
  Use one shared sail atlas, never per-ship textures. Retire shared hero GLBs in
  favour of the procedural batch as funded by Reborn; retain the named titans.
- One route-owned clock drives normal motion: no per-entity timers, independent
  CSS analytical animation or extra renderer loops. Shared final `displayTile`
  drives rendering, hit testing, follow and debug positions.
- Voyages use bounded `90–180`-second legs and `600–1500`-second rests
  (`src/systems/motion-config.ts`); departures and homecomings gather in the
  attention scheduler's shared windows and the harbour stands still between them.
  Aggregate moored share remains one third. All water-safety uses the
  authoritative conservative field.
- Reduced motion is a complete deterministic static composition with **zero
  continuous RAF**. Ordinary ships settle at safe authored risk anchorages and
  rest headings; Ledger Mooring keeps its representative stop and consorts keep
  flagship offsets. This is representative composition, not instantaneous dock
  occupancy. No avoidance nudges, attract drift or animated sail beats remain.
- Soft sea-room avoidance acts on final positions after smoothing, uses hull
  length/beam, fixes moored hulls and preserves formation children. Persistent
  corrections stay within eight tiles of route and `1.2` tiles/second, reject
  unsafe water/Mole steps, taper to zero at berth and relax home only when clear.
  Final derivatives drive follow velocity; route-smoothed heading stays intact.
  This reduces underway crowding, not a guarantee of collision-free berths.
- Hidden/offscreen surfaces pause and resume without catch-up teleport or replay.
  The idle state is the rest shot (K44): nothing tours on its own. The postcard
  book is the explicit "Wander" action (the word or W): each press glides to the
  next of six authored views from inside the world (`src/systems/postcards.ts`)
  and holds; any other pointer, wheel or key input glides back to the rest seat
  and is not also acted on by the world. Reduced motion cuts. Every card keeps
  its subject on its anchor, clear sight lines and a clear eye at the four gate
  profiles. The director holds ordinary
  foreground captions for its first 90 s (market pre-emption still speaks).
  Coverage: `src/hooks/use-canvas-resize-and-camera.test.ts`,
  `src/systems/garden-director.test.ts`.
- Camera breath is idle-only: weight 1 only after 45 s with no pointer, wheel or
  key input, hover, selection or camera intent; in over a 12 s smootherstep, out
  with τ 0.5 s; phase keeps running; amplitude yaw ±0.8°, pitch ±0.6°, dolly
  ±1.2 %. Hit targets, DOM anchors and picking rays use the breathed pose through
  the projection seam. Reduced motion and the debug `still=1` camera hold 0.
  Cadence: display rate while interacting and for 500 ms after, 60 Hz ambient
  (a frame is drawn only ≥ 12.7 ms after the last), the 33 ms duty cycle after
  180 s untouched; motion is one dt clock, so speed never changes with cadence.
  Coverage: `src/hooks/use-world-render-loop.test.tsx`,
  `src/renderer/render-scheduler.test.ts`, `src/systems/projection.test.ts`.
- Arrival/departure dips, wake stamps and nameplates derive from segment time,
  never ship timers. Sails dip briefly to a `0.6` scale and never hold furled at
  berth; outside a beat sails are exactly `1.0`, including moored and hero
  identity sails. Reduced motion holds fully set sails. Only the crossing
  (`src/systems/garden-crossing.ts`) is announced: one significant arrival,
  admitted by the director as a foreground beat, crosses the mirror inlet with
  the only caption and the only nameplate, at most twice an hour and at least
  15 minutes apart. Every other arrival is silent.
  Coverage: `src/systems/garden-arrival-beats.test.ts`,
  `src/three/garden-fleet-batch.test.ts`.
- Every addition records its displacement, including attention as well as GPU
  cost. The engawa lantern replaced `harbor-lantern.11`; hero waterfall replaced
  `water-silver-accents`; station smoke on uogashi, hatago-wharf and tea-house-quay
  displaces the beacon plume's uniqueness: unlit, ember-tier, cargo-tide-gated,
  one instanced draw, deterministic and non-analytical.
  Coverage: `src/three/garden-station-smoke.test.ts`.
- Seasonal/almanac dressing follows paths and openings. Keep the ambient-life
  count ban; redistribute into fewer, larger readable fauna rather than adding
  oscillators. Koi live in the reflection pond. Foreground events have long quiet
  intervals and market transitions pre-empt decorative beats.
- The day score (`src/systems/garden-score.ts`) is the only source of rituals:
  deterministic per UTC day, placed by the local sun and moon, each entry a
  kind in the ritual registry (`GARDEN_RITUAL_KINDS`, `registerRitual` in
  `src/systems/garden-director.ts`). One visual owner registers per kind; the
  director admits a ritual only inside the §5.0 attention budget (at most six
  discrete events an hour, one unbroken 12-minute quiet, ≥ 8 minutes between
  foreground events, a 90 s back-off after any ritual, at most six gifts a day
  and two in dusk). Seasonal gates come from the 72-kō calendar
  (`src/systems/garden-calendar.ts`). Kō names and moon phase stay in the ledger
  and ambient slot and never speak through the live region.
  Coverage: `src/systems/garden-score.test.ts`, `src/systems/garden-director.test.ts`.
- Sound is opt-in only (`src/hooks/use-garden-sound.ts`): off by default; the
  AudioContext is created inside the Sound switch's own click and only then is
  the lazy procedural audio chunk fetched. Music is a separate switch, also off
  by default. A returning visitor who left sound on sees it armed and must
  switch it on again. Hidden tabs fade to silence and suspend. Motion preference
  is never audio consent; the DOM caption stays the truth for every sounded
  beat, and there are no market alarms.

## Approval and delivery

Picture changes pass the Hour-Print gates in the plan's §5, judged on real-GPU
captures at the four gate profiles; the Print gate is an operator art review.
The program stays on one feature branch (`feat/hour-print`) with one
final PR and an unreleased changelog entry; no tag or release workflow without
explicit operator permission. Validation routing lives in `TESTING.md`.
