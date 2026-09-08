# PharosVille Runtime and Analytical Contracts

Picture direction belongs in `VISUAL_INVARIANTS.md`; this file owns runtime,
truth, access and resource limits. The accepted Reborn decisions D1–D17 in
`agents/pharosville-reborn/01-implementation-plan.md` supersede conflicting old
picture prescriptions. These are acceptance contracts, not a claim that later
Reborn waves have shipped. The previous document is preserved verbatim in
`agents/pharosville-reborn/visual-invariants-2026-09-08-archive.md`.
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
- Colour is never the only carrier of meaning. Keyboard traversal, pan/zoom,
  selection, Escape clear, controls, detail anchors and hit testing must remain
  useful without inspecting WebGL pixels. Focused controls remain available.
- DOM labels stay legible, clear of the lighthouse, controls and active detail
  panel, and hidden off-screen. Ship captions appear only on selection or an
  arrival/departure beat and are aria-hidden; rooftop chain flags, not permanent
  chain/concentration captions, identify harbours. TON has no permanent caption.
  Concentration remains in details and the ledger.
  Coverage: `src/components/harbor-label-chips.test.tsx`.

## Analytical authority and channels

| Element | Required meaning | Redundant channel |
| --- | --- | --- |
| Lighthouse | PSI score and band | Beacon state, exact DOM record and ledger |
| Ship | Stablecoin identity, cap scale, class and risk | Complete branded sail, family form/timber, DOM record |
| Harbour | Chain supply and concentration | Supply-driven roof mass, named archetype, complete chain flag, DOM record |
| Water body | Existing risk/ledger category | Water character, boundary/buoy, inspection name and ledger |
| Wreck | Lifecycle status and cause | Representative silhouette, cause colour and DOM record |

- At rest the world carries three coarse readings: tower = PSI, water = risk band,
  hero ships = who leads. Exact information lives in the DOM, not more ornament.
- Routes and docking cadence show rendered-chain/risk presence, never transfers,
  bridge volume, transactions or issuer operations. Missing or stale peg evidence
  is a caveat, not confirmed stress. Decorative quay lights, windows, basin tide
  courses, capstones, landscape and ambient life carry no new analytical meaning.
- The finite `140×140` terrain field is the sole authority for navigation, risk
  classification, placement and motion, including conservative water-distance
  lookup. The renderer never reclassifies a tile. Extra sea, headlands, rim skirts
  and hills are decorative and non-selectable; they cannot change berthing.
- PSI owns clarity aloft: cloud cover, horizon visibility and wind calm follow
  market stability with slow hysteresis. Stale sources own bounded low fog in
  their own water; wall clock owns illumination; nothing else writes the sky.
  Stale PSI freezes the last good sky, never clears it. Details and ledger expose
  exact PSI, band, as-of and unavailable state; copy says “market stability”,
  never a forecast or weather causation. Supply tide and moon record are optional
  extensions after Core acceptance and may not both ship.

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
  spatially distinct; the dead/frozen fleet is a quiet sea wreckyard, not an
  island or live-ship destination. Foreground masses stay clear of the lighthouse
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
- Accepted camera direction is long-lens perspective, vertical FOV `32°`, pitch
  about `12°`, existing yaw, with authored subject framing at both gates rather
  than an obligatory rest zoom/gutter. The crown must read against real sky.
  An orthographic `24°` fallback requires explicit operator re-acceptance, not
  a silent swap. Whole-map framing remains an explicit zoom-out.
- Projection, picking, DOM anchors, follow and camera motion share one contract.
  Preserve a screen-space pick tolerance for `0.42`-scale hulls and perspective
  foreshortening; GLB scale, anchor and pick proxy must agree at camera extremes.
  Selection discloses DOM details immediately.
  Coverage: `src/systems/camera.test.ts`, `src/systems/garden-attract.test.ts`.

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
- Stations retain a landward primary roof at least twice an ordinary hull's
  length, contrasting clay/slate/thatch/timber, and a named upper silhouette
  clear of sails. Ordinary upper silhouettes span roughly `13.3–17.9` world
  units; the Ethereum Mole caps at `21.5` local (`≤21.7` above water), at least
  `1.20×` the tallest ordinary rung. Footprints, water exclusion and berthing
  remain coherent with these envelopes. Coverage: `src/systems/dock-layout.test.ts`.
- Chain flags use `2.6×` original scale on raised, seaward rooftop staffs/racks,
  stay clear of roofs and fleet, show complete marks and remain broadly
  camera-facing while luffing. Roofs articulate ridge/cap, fascia, gable/gablet,
  brackets and a pent skirt or stepped course, with a named archetype signature.
- Raised quays keep a warm lit edge and dusk/night windows; the Mole alone is
  the ring's civic monument. L2 stations are self-standing distant harbours.
  Station landing torii stay retired; separate decorative islet torii retain
  their own geometry. Enlargement adds no analytical meaning.
- The Pharos precinct is demilitarised: shoin court, engawa and dry-stone replace
  curtain walls, bastions and merlons. Tower remains primary; pavilion, pond and
  signal mast are the only secondary precinct reads. Another monument must
  explicitly replace one, not join them.

## Light, palette, water and rendering budgets

- One shared sun/moon arc owns key direction, dome glow, water road and glitter.
  Wall clock is the default premise, never a flattering fixed hour. Accepted sun
  elevation is `0.62` rad rather than `0.806`; re-key light, AO, probe and grade
  together. Atmospheric depth must reach the actual default framing rather than
  a stale fog-height pivot. Coverage: `src/three/garden-sky.test.ts`.
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
- Voyages use bounded `90–180`-second legs and `240–480`-second rests, paired
  arrivals/departures and risk-ordered restless rests; aggregate moored share
  remains one third. All water-safety uses the authoritative conservative field.
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
  Idle attract may begin after two uninterrupted minutes, never during reduced
  motion, selection, explicit Observe, hidden tabs or almanac events. Any pointer,
  wheel, touch or key input returns agency at the exact current pose, no snap.
  Reborn replaces continuous postcard drift with stationary windows and deliberate
  transitions; named subjects remain framed at both gates.
- Arrival/departure dips, wake stamps and nameplates derive from segment time,
  never ship timers. Existing dwell envelope: first four seconds ease sails
  `1.0→0.6` over `1.2 s`, hold `1 s`, restore by second four; departure spans
  last four dwell seconds and first two transit seconds. Outside beats sails are
  exactly `1.0`, including moored and hero identity sails. Reduced motion holds
  fully set sails. Existing full-tier wake/nameplate cap is six by market cap;
  every hull remains eligible for the dip. Reborn's director replaces this with
  one significant ceremony, not simultaneous independent ceremonies.
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
  oscillators. Reborn may place koi in the reflection pond, replacing the old
  empty-basin prescription. Foreground events have long quiet intervals and
  market transitions pre-empt decorative beats.
- Ambient audio is optional only after Core acceptance: explicit opt-in, default
  muted, at most `5 MB` compressed, `24 MB` decoded and six voices; suspend on
  hidden tabs. Motion preference is never audio consent. No market alarms.

## Approval and delivery

The design bible requires operator review before any W1 edits land. Its approval
is separate from the integrated-picture acceptance gate. Reborn stays on one
feature branch with one final PR and a changelog entry; no tag or release workflow
without explicit operator permission. Validation routing lives in `TESTING.md`;
this documentation split does not itself certify the future renderer changes.
