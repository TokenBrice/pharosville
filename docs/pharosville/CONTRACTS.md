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

## Garden Observatory charter (2026-10-05)

The adopted programme is
`agents/2026-10-05-garden-levers/00-implementation-plan.md`, subject to its
operator decisions and `01-execution-overrides.md`. Direction A, Moss-side
observatory, and refined stylized PBR are elected. This charter authorizes only
the cutovers below: each clause changes **atomically with its owning packet's
code, tests and documentation**, never by treating this table as a premature
rewrite of the existing clause. All other requirements in this file and
`VISUAL_INVARIANTS.md` remain binding. Historical plans are not rewritten.

| Clause to retire or replace | Owning packet and replacement |
| --- | --- |
| Six-pad threshold recipe; three textureless draws; ≤15k construction triangles | S1-P1 retires recipe/texturelessness pins and authors the A graybox; S1-P2/P3/P4 complete ground, porous pine and shelter within attributed budgets. S2-P6 adds surface-atlas ownership/lifecycle coverage, not recipe retirement. |
| Exact seated camera numbers | S1-P1 with S8-P3: one approved seated composition across gate profiles; retain the current seat initially and renew camera/threshold/fleet acceptance for any change. |
| Resource-equal A/B | S9-P1: signed owner resource deltas under unchanged global caps, rather than identical resources per comparison arm. |
| Literal one-for-one object displacement | S9-P1: name the displaced salience or cost; replacement need not preserve object count. This authorization does not rewrite the existing Motion clause ahead of its owning implementation cutover. |
| Inspection-only water names | S3-P3: at most two collision-safe rest names, a learnable static key and a complete ledger. |
| Exactly three readings; analytical pine history | S3-P1/P4/P5: three immediate readings plus one subordinate dated gravel PSI record; ≤30 UTC daily closes, last write wins per day, visible gaps and methodology boundaries, no rolling average or interpolation across those breaks. |
| Fixed solar apex | S4-P4: bounded seasonal apex [0.42, 0.85] rad on the shared clock-owned light/sky/water arc. |
| K44 forced-home wandering | S8-P3/P4b: explicit six-station stroll; Home returns to the seat, Escape/deselection to the saved station-local pose, idle never tours. |
| Procedural-only ownership | S2-P2: checked local procedural or elected authored assets retain semantic roots, aligned fallbacks, lifecycle ownership and measured budgets; procedural-first remains the default. |
| Generator-only checked models | S2-P2, conditional on an authored election: checked source/export recipe with provenance, license, hashes and anchors. Current compiler scope is generator-produced assets and surface atlases; no `.blend` ingestion is elected. |
| Textureless custom GLB loader | S2-P3, dormant until an authored/textured asset is elected: one approved loader, funded local assets and a clean cutover, never dual loaders. |
| Near-black night land-ninth targets | S4-P1: garden/water/headland region floors (boundary pairs ≥4 L*, materials ≥3 L*, ≥90% of approach pixels ≥L*6); indigo sky L*7–15 and dominant beacon, no glowing lawn. |
| No new textures | S9-P1 policy with S2-P4 atlas adoption: measured signed owner deltas, logical byte accounting and unchanged global caps; no double charging shared atlas leases. |
| Fixed 3/5/7 moorings | S6-P1: unequal projected fleet masses, protected water intervals and continuous tower inlet, every eligible record still visible and reachable. |
| `feat/hour-print` approval/delivery programme | S9-P1: `feat/garden-observatory`, destination and CP-Final taste checkpoints only, one release after final acceptance and the required reading/M5 evidence. |

**Not retired:** exclusive source-warning precedence. D7 declined S3-P2;
caption warning honesty, precedence and its tests remain binding. The reading
key is a separate DOM surface. Existing visitors marked as taught are not
re-taught (D6d declined).

**Explicit keep-list (plan §9; not exhaustive):**

- API/security: same-origin `/api/*`; `PHAROS_API_KEY` server-side only.
- Desktop admission: sorted 900×720 / 1200×640 size profiles, never orientation;
  world unmounted below the gate, before world data/runtime/media work.
- Risk evidence: own peg/DEWS evidence remains distinct from an inherited berth.
- Official data: official PSI, version, observation and accepted appearance;
  independent freshness, coverage and publication times.
- Issuance: measurement versus allocation, materiality and pace.
- Geography: the sole weekly supply tide, finite geography and its classification
  field; decorative outboard land never changes classification or map bounds.
- Records: every eligible record remains visible and reachable.
- Fallback: the renderer-failure DOM overview.
- Sound: audio consent; sound is never an analytical carrier.
- Accessibility: DOM/ledger parity, non-colour/non-motion carriers and complete
  zero-continuous-RAF reduced motion.
- Rendering: one WebGL renderer, local assets, shared clock, hero-only reflection.
- Visual identity: the four immutable palette anchors.
- Attention: director limits, including six events per hour and the 12-minute quiet.
- Operations: global caps except explicitly approved changes; protected releases.

**Test retirement follows ownership.** S1-P1 replaces exact threshold recipe
pins with semantic coverage, clearance, finite geometry, budget, unpickability
and disposal coverage; S2-P6 adds atlas lifecycle tests. S7-P2 owns island
draw-equality retirement; S4-P4 owns fixed-apex tests; S8-P3 owns forced-home
tests; S3-P3 owns inspection-only sea-sign timing retirement while preserving
atlas reuse/disposal; S3-P1 owns obsolete audit-shield wording and cue parity.
Route idle behavior and exclusive-warning tests stay. Tests establish retained
safety, not aesthetic approval.

## Runtime, security and access

- One production Three.js/WebGL renderer. Failure hides WebGL and presents the
  selectable DOM `WorldStaticOverview`; never boot another graphical renderer.
  WebGPU is outside this implementation session.
- Both the device screen and current viewport must satisfy the sorted-dimension
  `900×720` or `1200×640` size profile before world data, Three runtime, GLBs or
  logos load. These are size tests, never orientation tests.
  Blocked devices and small windows receive a branded small-screen edition with
  the Lighthouse/Water/Sails guide and actual Pharos analytics links, not embedded
  tables. Size advice is secondary. Only an elected Garden Observatory publication
  (`public/pharosville/stills/garden-social.json`) admits the local-hour still;
  `picture` selects one portrait or landscape crop/encoding, labelled
  “Illustration, not live readings”. Missing publication or image failure leaves
  the useful DOM, never an old harbour photograph. The blocked edition fetches
  only this local publication marker and its chosen illustration, no world/API/
  GLB/logo resources; admitted desktop startup fetches neither.
- First-byte HTML supplies PharosVille identity, a generic Lighthouse/Water/Sails
  guide, the actual module-wait stage and working analytics links. React replaces
  it with the same branded gradient shell until data, renderer warmup and motion
  preference readiness; no pre-runtime live values, desktop still or fake progress.
  The ready frame is already at rest (or the explicit URL pose), with ordinary
  hour air: no intro rise, additional haze, timer or input interception. The
  independent reading key teaches beside unchanged exclusive caption warnings.
  Renderer failure retains the selectable DOM overview. Blocked stills are
  illustrations, never live readings. Coverage: `src/client.test.tsx`,
  `src/pharosville-world.test.tsx`, `src/hooks/use-canvas-resize-and-camera.test.ts`.
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
  its eased appearance is separate from immediate observed DOM status. The
  ingestion hook confirms a changed lamp fold over two poll observations (a new
  poll result for any source, or a tick of the visible observer clock) and
  publishes it as `world.lampStatus`, so an identical failure repeated poll
  after poll still settles the lamp without new payloads or content rebuilds.
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
- Chrome roles (now-line, labels, controls, detail sheets, Find, ledger and
  changelog) follow the wall-clock light score, never market data.
  `src/systems/chrome-air.ts` mixes within two independently readable sheets;
  paper/ink/quiet/link switch polarity atomically at dusk and dawn, with no
  CSS colour interpolation through mid-tones. Every composited text role
  holds ≥4.5:1 at anchors, between beats and across the sheet switch.
  Panels use one 200 ms entrance, disabled under reduced motion.
  Coverage: `src/systems/chrome-air.test.ts`.
- Find `/`, Explore expansion and Read key are separate discoverable 44 px
  actions. Only Find owns slash; Explore never advertises it and exposes a
  wrapped secondary row. One intrinsic edge grid places the unchanged health
  caption beside discovery, wrapping to separate rows at both gate profiles.
  Long warning copy wraps without a fade mask, truncation or hidden duplicate
  Find. The key is nonmodal; reference panels remain lazy modal sheets.
  Find retains combobox/listbox semantics and restores its opener (or world
  if removed); the ledger keeps one body and native keyboard disclosures.
  Coverage: `src/components/world-controls.test.tsx`,
  `src/components/quick-find.test.tsx`, `src/components/accessibility-ledger.test.tsx`.
- A non-current source outranks every other now-line phrase: evidence warning, then a
  first-visit or return-visit line, then the crossing, then a market transition,
  then the ambient phase. The status region speaks the phrase only, never the
  minute; decorative words (moon, cloud cover, kō) never reach it.
  Coverage: `src/components/now-caption.test.tsx`.

### Onboarding

- Future first-visit teaching opens in the nonmodal live reading key as soon
  as the world and renderer are ready, independent of arrival choreography and
  source warnings. It never competes for the now-line. The existing exclusive
  caption warning precedence above is unchanged.
- Only explicit dismissal (`Got it`, closing the key or Escape inside it)
  records completion. Incidental pointer, wheel, touch or keyboard input,
  hidden tabs, elapsed time and source outages never consume teaching.
  Inspecting one exemplar or merely focusing it is not completion.
- Preserve `pharosville.orientation.seen` and its existing `"1"` write format.
  Any existing seen value suppresses teaching; there is no re-teaching migration.
  Denied storage still shows a key that can be dismissed for the current session.
- The reading key remains reopenable after dismissal. Return-visit summaries
  remain a separate 20-second post-arrival caption voice, subject to the
  unchanged warning precedence.
  Coverage: `src/hooks/use-visitor-line.test.tsx`,
  `src/components/legend-panel.test.tsx`, `src/pharosville-world.test.tsx`.


## Analytical authority and channels

| Element | Required meaning | Redundant channel |
| --- | --- | --- |
| Lighthouse | PSI score and band | Beacon state, exact DOM record and ledger |
| Ship | Stablecoin identity, cap scale, class and risk | Complete branded sail, family form/timber, DOM record |
| Harbour | Chain supply and concentration | Supply-scaled hall frontage, named archetype, chain nobori, DOM record |
| Water body | Existing risk/ledger category | Static five-band surface codebook, boundary/buoy, canonical name and ledger |
| Fallen coin | Lifecycle status and cause | One unmarked set stone in the stone garden (size = peak cap, form = cause family), DOM record |

- At rest the world carries three immediate coarse readings: tower = PSI, water
  = risk band, hero ships = who leads, plus one subordinate dated PSI gravel
  record beside the approach. It is history, never a fourth live alarm. Exact
  information lives in the DOM, not more ornament.
- Each `VisualCue` declares `presentationTier`: `keep-rest`, `inspection-only`
  or `retired`. Rest tiers own those readings, the dated record and instrument
  qualification, not extra headlines. Inspection-only means exact meaning in
  details, ledger and the expanded guide; natural forms may persist without
  promised glance decoding. Detachable secondary overlays are consumed by the
  fleet/water owners' inspection policy, never by hiding eligible hulls.

  | Channels | Presentation |
  | --- | --- |
  | PSI beacon, far ranges, six cloud states and wind | Keep-rest stability |
  | Seven-source lamp and bounded instrument haze | Keep-rest source qualification, not market score |
  | Peg/DEWS berth, five risk surfaces and boundary names | Keep-rest category; within-band packing is not score order |
  | Compressed cap scale and branded mon/initials/livery | Keep-rest qualitative supply leaders; exact ranks in DOM |
  | Fixed-width shallow gravel furrow | Keep-rest subordinate dated PSI history; no live alarm or sound |
  | Top-20 off-peg pennants/cone and contributor beam dwell | Inspection-only |
  | Signed peg trim, six hull families, Maker formation/own distress | Inspection-only; inherited berth is not own risk |
  | NAV, yield, D/F mast signals and DEX disagreement buoy | Inspection-only; pricing/yield/grade are separate facts |
  | Age patina and risk salt weathering | Inspection-only; age is not virtue |
  | Chain routes, issuance pace/risk swing, chain cove/frontage/nobori | Inspection-only; not transactions |
  | Ethereum fixed monument/still basin | Inspection-only identity, not magnitude |
  | Backing crates and quay health cracks/bollard | Inspection-only; absence never certifies safety |
  | Movers/depeg pigeons, ship issuance/largest-event lift | Inspection-only; complete-window measurement, not replay |
  | Estimated quay issuance and flight-to-quality tenders | Inspection-only; allocation/gauge, not measured chain transfers |
  | Weekly supply tide/visit wrack | Inspection-only; remains the sole supply tide |
  | Cemetery cause/peak-cap stones and anniversary lantern | Inspection-only lifecycle/calendar |
  | Pine fullness/browning and Danger rain-pock risk meaning | Retired; owning record/water cutovers replace/remove mappings |
  | Grade/backing/yield/NAV proportion deltas and deleted audit shields | Retired; facts remain in details and ledger |

- Hull proportions are family-authored with bounded decorative ID variation.
  Financial flags may select an inspection-only family, but never add
  continuous grade/reserve/yield/NAV dimension deltas. Signed peg trim gives
  direction only, never demand or redemption causation.
- The detail plaque quotes at most three first-screen figures. Its explicit
  `Read the record` rows are bounded: ship ≤11 core rows (including Formation
  and a DEX exception), lighthouse ≤12, harbour ≤6, pigeonnier 2 and grave ≤3.
  Material qualifiers stay with the quantity they explain; unknown labels are
  never dumped into the record. Currently carries full signed peg/actual trim,
  placement evidence status and source, and active risk-band tracking. Formation
  leads with the selected member's own distress without changing shared berths.
  Chain shares, footprint and route source remain inspectable together.
- Harbor light names observed seven-source status separately from Beam character.
  Beacon/beam character follows PSI; source qualification can cool or slow it,
  so warmth alone never decodes PSI. Appearance eases over about two observations.
  Snapshot generation is labeled
  as a snapshot, never as a PSI observation time. Month garden history is a
  distinct clause beside the worst-band mark, not the same measurement.
  This record repair exposes existing values only; upstream source observation
  times and issuance coverage are not inferred from snapshot generation.
  Coverage: `src/components/detail-panel.test.tsx`,
  `src/components/accessibility-ledger.test.tsx`, `src/lib/format-detail.test.ts`.
- The Garden record, 30d contains at most 30 supplied UTC daily PSI closes in
  the window ending at the newest supplied day—not receipt time or the current
  score's timestamp. Array-last-write-wins deduplicates each day while preserving
  exact close time, score, band and methodology. A fixed 0–100 axis reads oldest
  left/newest right; daily gaps and methodology edges split raw segments. There
  is no rolling average, invented close or interpolation across those breaks.
  Coverage count, window/close bounds and original source observation/publication
  qualification survive held data. The lighthouse's explicit record disclosure
  and accessibility ledger use the same native, keyboard-scrollable dated table;
  it adds no first-screen figure. The full Long Record remains separate.
  Empty history leaves neutral unmarked gravel, one close is one mark.
  Pines, moss, decorative stones and ambient sound have no PSI-history meaning.
  The one non-emissive gravel-role furrow follows the threshold's root-local
  metric plane and eye offset; dated-content keys refresh persistent buffers
  independently of the island's structural key, without per-frame allocation.
  Its ceiling is one colour draw, 128 triangles, zero textures; generic threshold
  disposal owns the attached geometry and cloned material.
  Coverage: `src/systems/garden-month-record.test.ts`,
  `src/three/garden-month-record.test.ts`,
  `src/systems/world-render-content-signature.test.ts`,
  `src/three/world-renderer.test.ts`, `src/components/detail-panel.test.tsx`,
  `src/components/accessibility-ledger.test.tsx`.
- A ship's own finite DEWS score is shown as `DEWS n/100`, folded after the
  stress driver in Currently and repeated bare in its ledger line. Consorts
  retain their own score even though placement inherits the flagship's depth.
  Depth biases the preferred tile, not the order of final packed berths;
  sticky placement holds depth changes below `0.02`.
  Coverage: `src/components/detail-panel.test.tsx`,
  `src/systems/pharosville-world/stages/ship-placement.test.ts`.
- Harbour `Net flow 24h` values disclose **Estimated 24h allocation by held supply
  across the reported scope**. Each coin's denominator includes all presence
  shares in `mintBurn.scope.chainIds`, whether or not their harbours render;
  hiding a harbour never inflates another allocation. Rendered allocations plus
  fleet unattributed gross equal raw gross. Fleet and harbour records disclose
  the unattributed total and its placement reasons: unrendered harbour, outside
  the reported scope, or no chain presence. Unknown scope keeps attribution
  unavailable, not zero; held/partial samples retain totals with source coverage.
  Only material flow with no known presence can disqualify an otherwise empty
  in-scope quay; known unrendered or outside-scope homes do not. Untracked reasons
  never present a local estimate or measured zero. Ship and fleet totals remain
  raw payload readings; existing gross/net and balanced-cargo policy is unchanged.
  Coverage: `src/systems/pharosville-world/stages/cargo-tide.test.ts`,
  `src/components/detail-panel.test.tsx`, `src/components/accessibility-ledger.test.tsx`.
- Peg trim is the sole analytical hull-height carrier: fresh ±50 bps gives
  ±0.08 local trim, fresh ±200 bps gives ±0.16, and stale or missing peg evidence
  gives zero trim. Procedural and attached hero hulls, batched hulls, rig and
  lanterns carry that same trim once under the ship's scale. Issuance changes
  cargo work, never hull height; hero roots retain their nonfinancial pose.
  Coverage: `src/three/world-renderer.test.ts`, `src/three/garden-ships.test.ts`,
  `src/three/garden-fleet-batch.test.ts`.
- Issuance records retain raw mint and burn volumes/counts, gross (mint + burn),
  exact signed net, intensity and its semantics, reporting window, per-coin
  history coverage and source publication/as-of. Zero gross/net is inactive
  only with complete trailing-24h coverage; positive gross with zero net is
  balanced activity. Missing quantities stay unavailable, never measured zero.
  Partial history is neither extrapolated nor certified as complete inactivity;
  held samples retain quantities with the source qualification.
  Ship readings are per-coin measurements; quay totals remain estimated
  allocations by held supply, not measured chain issuance.
  Coverage: `src/systems/ship-issuance.test.ts`,
  `src/components/detail-panel.test.tsx`.
- Issuance boundary diagnosis (2026-10-05): the same-origin live
  `/api/mint-burn-flows` rejected `gauge.classificationSource`, `"unknown"`
  coverage status, nullable coin `netFlowDirection24h`/`netFlow24hUsd` and
  hourly `netFlowUsd`. Semantics are established by the producer's
  [v6.23 valuation contract](https://github.com/TokenBrice/pharos-watch/blob/42ae8201aa73f9d7868559c0183d7bb8893758a8/docs/mint-burn-flows.md#valuation-completeness)
  and [pinned schema](https://github.com/TokenBrice/pharos-watch/blob/42ae8201aa73f9d7868559c0183d7bb8893758a8/shared/types/mint-burn.ts):
  `"safety-score-v9-publication"` names classification provenance, not flow
  coverage; coverage `"unknown"` means the current chain head is unavailable.
  Partial USD valuation withholds the signed net, never zero-fills it. Gross
  mint/burn subtotals are nonnegative lower bounds unless their valuation side
  is complete, labelled in details and ledger. Null 24h/hourly nets require
  explicit partial-valuation evidence in both validators; a supplied net must
  remain finite and signed. A historical numeric partial subtotal is withheld
  by consumers; legacy unknown valuation may retain numeric nets with a caveat,
  but cannot certify complete-window illustrations. Null flight-to-quality
  classification/intensity stays unavailable. Unknown/missing intensity
  semantics never acquire supported pace.
  Both validators accepted all three repaired live bodies (issuance,
  stablecoins and peg summary) in the diagnostic session. The producer commit
  above is the reviewed public reference, not an asserted deployed build ID.
  Other proven persistence blockers were `priceObservedAtMode:
  "nominal_reference"`, null/absent per-chain `circulatingPrev*` and nullable
  peg-summary `pegPct`; the [producer market schema](https://github.com/TokenBrice/pharos-watch/blob/42ae8201aa73f9d7868559c0183d7bb8893758a8/shared/types/market.ts)
  defines absence as unavailable, not zero. Canonical chain aliases retain a
  null history sum if any contributing observation is missing; observed zero
  remains zero. Nominal par is not a market observation. `_meta` was absent in
  the issuance body; sync warning and
  classification warning were null, independently of schema drift. API
  freshness parsing and idle full-schema cache validation stay unchanged;
  restoration still re-ages evidence, emits Warning 110, and never upgrades it
  to fresh. Invalid refreshes preserve the previous good entry. Browser
  persistence/restore execution remains an orchestrator gate, not a claim from
  the read-only live probe.
  Coverage: `src/lib/api.test.ts`, `src/lib/world-payload-guard.test.ts`,
  `src/lib/world-payload-cache.test.ts`,
  `src/hooks/use-pharosville-world-data.test.tsx`,
  `src/systems/ship-issuance.test.ts`,
  `src/systems/pharosville-world/stages/cargo-tide.test.ts`.
- Current full-window active issuance has categorical cargo: mint aboard,
  redeem ashore, balanced one aboard and one ashore. Inactive, incomplete,
  held or unavailable evidence suppresses worksets/quay crates, not records.
  Largest-event lift is static, never a transaction replay; its exact amount
  and own event timestamp remain in record and ledger. Cargo pose never scales
  with intensity. Visible-state keys omit publication times/provenance, so a
  same-value new sample cannot replay work or reset the motion epoch.
  Coverage: `src/three/garden-ship-issuance.test.ts`,
  `src/three/garden-cargo-tide.test.ts`, `src/three/world-renderer.test.ts`,
  `src/systems/world-render-content-signature.test.ts`.
- Issuance work uses a **declared illustration policy** (checked against the
  full live fleet on 2026-10-03: 23–27 coins eligible; not financial methodology):
  gross ≥ `$1,000,000` and either gross/own supply ≥ `0.01` or
  gross/current full-window covered-fleet gross ≥ `0.001`, with current complete
  issuance evidence required: `coverage.status === "full"` plus complete 24h
  flags and complete USD valuation; producer `"unknown"` never certifies a
  complete window.
  Missing, zero or non-finite denominators produce
  unmeasured shares, never infinity; either independently measured share can
  qualify. The denominator includes covered payload rows, not only displayed
  hulls. Decisions are computed once per refresh.
  Eligible coins are ordered by gross descending, ID ascending for ties; only
  the first three have moving work at overview. Explore/analyze may work other
  eligible cargo. Below-policy or unmeasured activity retains its categorical
  static cargo and exact raw record; materiality never erases net direction or
  changes route pace. Largest-event lift stays static. Record and ship ledger
  disclose the policy, shares and overview slot. Keys include only eligibility
  and overview membership, not raw shares, rank or sample time. The director
  and urgent market lane are unchanged. Snapshot sensitivity and real-GPU
  operator acceptance are required before these constants are called calibrated.
  Coverage: `src/systems/ship-issuance.test.ts`,
  `src/three/garden-ship-issuance.test.ts`,
  `src/systems/world-render-content-signature.test.ts`.
- Route pace accepts only current, complete-window `signed-v2` intensity.
  Supported zero remains 0.85; unsupported, held, partial, legacy or unknown
  readings use neutral 1.0 Unmeasured pace without discarding raw intensity.
  Motion plans key the effective scalar, not the raw number or sample time.
  Coverage: `src/systems/ship-cycle-tempo.test.ts`,
  `src/systems/motion-planning.test.ts`.
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
  Six morphology targets are sparse cirrus / separated fair strokes / high veil
  without low bodies / broken low deck / nearly closed low cloud / textured
  overcast ceiling, approximately 3–7 / 10–20 / 25–40 / 45–60 / 68–80 / 85–95%
  visible sky occupancy. These are image-sheet acceptance bands, not measured
  claims. Canonical S3 cover words remain unchanged. One dome and one leased
  noise pack draw them; shared analytic sky radiance lights the bodies, which
  retain indigo contrast even without a moon. The crown clearing only thins the
  field. Sixty continuous current seconds accept a band; ninety seconds ease
  its existing controls, reduced motion snaps them and holds wind drift, and
  `sky=BAND` still snaps the six capture exemplars without rewriting live data.
  No seventh named unavailable state, new draw, triangle or texture; the
  cloud reauthoring allowance is ≤0.5 KiB JS. Coverage:
  `src/systems/psi-sky.test.ts`, `src/three/garden-sky.test.ts`.
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
- Risk is a static, world-anchored categorical surface codebook, shared with the
  reading key: Calm is unmarked mirror; Watch bending singles; Alert interrupted
  pairs; Warning short oblique triples; Danger close dark fours. Coverage caps
  rise 0/3/5/7/10 percent with passive value contrast, not mandatory agitation.
  Seeded groups filter with derivatives; unresolved strokes retain integrated
  coverage/value instead of disappearing. Dark cores and light shoulders use
  existing reflected light, never emission. Hue is subdued reinforcement, with
  Danger's reserved accent retained; no categorical signature interpolation.
- Depth, swell, chop, reflection and buoys may vary by field, but are not a
  forced risk ladder. Boundary banks, reeds, mouth islets, current tongues,
  shoal bars, gorge cliffs, slate lips and wreck inlets are decorative, never
  classifiers. Inlet/shore shelter and wind/wake slicks may quiet any body's
  optical slopes; they never attenuate static signature ink/value or region identity.
- The plate, inner skirt and annulus form continuous water through both protected
  open-sea corridors. All retain shared physical distance air and horizon radiance;
  `GARDEN_AIR_CONTINUOUS_WATER` excludes only the rectangular overview plate veil.
  The rest-seat transport, analytical field, plate bounds and risk surfaces remain
  unchanged. Land cannot hide the water join or close the openings.
- Local water surface/Atmosphere wording is shared by details and ledger.
  Sky and far-shore clarity belong to fleet PSI, not local DEWS or fleet threat.
  Risk-normal engravings, risk-only whitecaps and Danger-masked rain pocks are
  removed. Ledger has widely separated horizontal singles; Wreck held irregular
  silt. These pricing/lifecycle waters are never sixth and seventh risk bands.
- Sea names use low stone steles at body boundaries and shared mixed-case serif
  ink. At most two risk-water names are admitted at rest, ranked by real body
  area and conservatively checked for projected legibility, mutual separation,
  tower clearance and inlet clearance at every desktop gate. Unsafe names are
  omitted, never moved away from their canonical hit sites. Hover/focus raises
  the remaining names over 380 ms; reduced motion cuts to the static pose.
  The live, reopenable nonmodal Reading key names official PSI with evidence
  and observation time, all five ordered surfaces, separate Ledger/Wreck
  waters and the top-three supply ranks. Supply size is qualitative, never
  proportional. Real-GPU exemplars are decorative DOM images, added only when
  the local atlas and its generated manifest exist; absent exemplars stay
  text-only. The key never replaces the caption or its exclusive warning
  precedence. Focusing a key button previews location without camera travel;
  activation uses existing detail selection and its reduced-motion cut.
  Boards are aria-hidden; the ledger lists every named area and remains
  canonical. The field owns classification, not the board geometry.
- The water-led finite rim covers roughly `55–65%` of the perimeter, has exactly
  two open-sea openings and is `6–14` tiles deep away from them. Renderer-only
  land may extend up to `18` tiles outboard on all four sides in a separately
  bounded decorative envelope, with unequal aprons, corner returns and outboard
  coastal bites. This never changes the water-plate margin, map bounds,
  classifier, signed distance, navigation, berths or eligible-record counts.
  Danger Strait, both complete opening corridors and detached-islet collars
  remain water. The near headland is fixed-world geometry in the existing rim
  top/face buckets; sky ranges remain eye-relative. Decorative feet sink below
  the sea annulus waterline, and decoration is non-selectable.
  Its terrain material caps only the square-chart overview veil so outboard
  land stays visible; physical distance air stays unchanged. Continuous water is
  independently exempt from the rectangular overview veil, not from physical air.
- `garden-rim-mesh.ts` owns contiguous decorative shore reaches and their
  immutable world-coordinate `GARDEN_SHORE_SEGMENTS`: sheltered inner beach,
  exposed bedrock and quay revetment confined to existing station reservations
  plus their dressing collar. Reach endpoints anchor the authored contour;
  ownership follows their bearing intervals, with nearest reserved quay taking
  precedence inside the chart. Exterior reaches remain exposed bedrock. No
  segment owns either protected opening or changes the classification field.
  `gardenShoreSegmentAt` and allocation-free `writeGardenShoreSample` share
  those owners with shore-contact consumers; caller-supplied world height and
  still-water height determine positive physical depth and dry/damp/submerged
  contact. Frozen `GARDEN_SHORE_CONTACT` shares the −0.02 submerged threshold
  and +0.45 dry threshold above still water with contact shaders.
  `shoreBeachWeight` shares the feathered sand transport with substrate consumers.
  Exposure feathers at beach transitions. This is static substrate
  and contact, never a second tide, foam ring or risk classifier. Weekly
  supply tide remains exclusive to the tidal flat's bare area and wrack line.
  Water borrows the renderer's surface atlas through one lease per water owner;
  sea-edge stone batches borrow one per rebuild. Consumers release leases once,
  never dispose borrowed maps, and add no refraction pass or texture. The existing
  linear distance copy retains boundary/shore R/G and packs feathered sand/exposure
  in B/A; canonical IDs stay nearest-only. Rim-only distance gates reach metadata
  against nearer island/islet land, whose submerged substrate stays mineral.
  Bottom detail uses the same world-XZ metric plane and 2.6-unit repeat as rim
  terrain; only clear shallow bottom sampling bends, never IDs, depth or masks.
  Crag, rim and edge stones share the physical contact thresholds above without
  changing coast geometry, water obstacles or analytical datum/area/wrack behavior.
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
- Compose three global, unequal shoreline masses and sparse satellites: a leading
  near-left group, quieter rear-left crescent and receding right group. Clip
  every berth pool to the actual risk field; adjacent legal bands may share a
  visual mass, never a new risk category. Own risk and inherited consort berths
  remain separate. Reserve retained IDs before newcomers; supply-ranked leaders
  earn legal front edges without a size bonus or aggregation. Keep the compressed
  `clamp(0.42 * (cap / 1e6)^0.10, 0.42, 1.15)` law unchanged.
  Hull/apron safety and the continuous tower inlet outrank composition. Score
  conservative hull and cloth polygons in both frozen rest eyes, not picking
  rectangles. ONE protected water interval is reserved before the single fleet
  solve — the quietest readable column the last accepted picture left open, or
  the authored band on a cold start — and every admission tier treats it as a
  hard rule, so it is empty and at least `3%` of viewport width. The second
  interval is descriptive, not reserved: it is measured from the accepted
  picture's remaining free columns and published with its true width. Placement
  stays one solve per arrival. Landscape crops share the reference eye's
  decision through the affine crop mapping; the tall eye decides its own, with
  leading-sail envelope loss below `10%` and at least `25%` less worst-eye
  overlap than the frozen pre-cutover allocator on dense/mixed fixtures.
  Ordinary recovery keeps the existing `MIN_HULL_GAP` admission floor and the
  real-fleet `3.5`-tile mean nearest-neighbour gate—not a `3.5`-tile pair floor.
  Projection budgets never truncate legal candidate admission: at most `256`
  primary and `192` recovery footprint candidates precede a full, cheap
  clearance-only scan with conservative interval bounds. An exact cached
  tile-distance field, broad-phase envelope rejection and one projection per
  frozen eye reused across landscape crops bound arrival work. Projected recovery
  minimizes worst-eye overlap. Every recovery tier, including the final
  navigable-water scan, checks the complete mean after neighbour distances
  shrink; choose mean-preserving water before forced capacity admission.
  Exhausted proposals recover in farthest clear water. Synthetic over-capacity
  gates retain every ID through the old own-band, outside-inlet navigable-water
  tier, labelled `capacity-overflow` in berth provenance. No test-only allocator
  option or production failure path is introduced. Four-percent churn moves
  retained berths less than half a tile. Conservative envelopes are not
  rendered-pixel proof: review real-GPU
  captures at all four gate crops, including the tall eye.
  Because berths are composed far from data tiles, route navigation solves on
  the rendered hull-clearance field at the moving ship's own margin, quantized
  upward in quarter tiles and keyed into route caches; the zero-margin point
  graph and its consumers are unchanged, and zone/shore costs stay shared.
  Coverage: `src/systems/garden-fleet-placement.test.ts`,
  `src/systems/motion-water.test.ts`.
- Every eligible hull remains drawn and pickable at whole-map framing. The
  shared `40`-triangle far family batches own fleet simplification; legacy
  fleet zoom thinning cannot hide identities or remove pointer coverage.
  Keyboard order, details and the ledger retain the same complete fleet.
- Near/far presentation consumes the shared displayed-pose identity-sail
  footprint in CSS pixels: full family admission at `28` px, departure below
  `22` px, with immediate selected/keyboard-focused restoration. Macro family
  form remains for every hull; distance and nearest-rank rules cannot admit
  detail. At most three unattended foreground leaders, ranked by current
  circulating supply rather than heritage, retain full mark/dye/lamp emphasis.
  Fine standing rig requires inspection or at least `48` px. Secondary fleet
  overlays consume the cue registry's `presentationTier`: inspection-only
  mast signals, disagreement buoys, tenders and issuance work never render at
  rest, and inspection reveals only the focused entity's instances.
  Ordinary changes use the existing complementary `0.9`-second dissolve;
  reduced-motion and stationary-clock frames cut immediately. Bespoke GLB
  scene graphs stay dormant when far, using the existing family batch rather
  than a second renderer, and share the same rig/lantern weights. No leader size
  bonus, aggregation, berth movement or identity removal is permitted.
  Physical hull/cloth pick bounds retain minimum CSS tolerance; far hulls remain
  pointer selectable and every eligible hull remains in keyboard order, even
  beyond the crop. Chroma recession never becomes identity-destroying value.
  Coverage: `src/three/garden-fleet-batch.test.ts`,
  `src/three/garden-ships.test.ts`,
  `src/renderer/garden-observatory-hit-testing.test.ts`.
- Six visual families — bezaisen, kobaya, twinhull, takasebune, junk and scow —
  carry nine semantic hull classes. Keep family form and palette-derived timber
  redundant, the issuer's `0.12` timber whisper and issuer-coloured sheer strake.
  Six DOM cap-tier labels survive. The accepted scale is
  `clamp(0.42 * (cap / 1e6)^0.10, 0.42, 1.15)`, replacing the `0.8` floor and
  old `2.6×` visual ladder. Coverage: `src/three/garden-ships.test.ts`.
- Vessel craft uses one open waterline shell, a recessed working deck and a thin
  catching gunwale instead of duplicated full-volume keel/deck geometry.
  Bezaisen lifts both ends, kobaya keeps its long fine bow and low occupied deck
  beneath opposed cloth, and junk pairs a compact belly and raised stern with
  an asymmetric batten fan. Twin-hull water slots, takasebune cargo banks and
  scow squatness survive. `garden-fleet-footprint.ts` owns the shared plan,
  lifted rail/deck anchors and conservative envelopes consumed by full/far
  geometry; no vessel exceeds existing water-clearance length/beam margins.
  Stern poles step onto that same authored rail, independent of peg trim.
  Family-sheet acceptance uses actual `28/48/96` CSS-pixel identity-sail sizes,
  including a no-logo `48` px read, not enlarged selection crops alone.
  Coverage: `src/three/garden-ships.test.ts`,
  `src/three/garden-fleet-batch.test.ts`,
  `src/systems/garden-water-exclusion.test.ts`.
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
  Selection discloses DOM details and focuses its title immediately, regardless
  of camera arrival, interruption or reduced motion; no hidden/inert/opacity
  gate may delay facts. A ResizeObserver measures the actual sheet in canvas
  CSS pixels, including the expanded record and viewport changes.
  Selection evaluates at most 72 tableaux plus the current pose, rejecting eye,
  clearance-route and silhouette obstruction before composition: sheet
  exclusion with 24 px padding, S6 projected identity span, neighbour separation,
  sky share targeting ≤35%, and visible shore/tower context. Elevated
  three-quarter views are permitted; a landmark never outranks clearance.
  Retain an already valid pose, with deterministic candidate-order tie-breaks.
  Search runs only on selection or measured sheet changes, never per frame;
  moving follow translates the accepted shot using the final displayed tile.
  Enlargement is a viewing condition, not supply rank or a leader size bonus.
  Coverage: `src/systems/camera.test.ts`, `src/systems/camera-tableaux.test.ts`,
  `src/hooks/use-canvas-resize-and-camera.test.ts`,
  `src/components/detail-panel.test.tsx`, `src/pharosville-world.test.tsx`.

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
- Stations are one vernacular: low, roof-dominant houses (charred-cedar timber
  bays, recessed pale plaster, grey kawara under deep eaves) whose roof takes 40–60 % of
  the elevation, and nothing rises past the rim hills. Hall length and span
  carry supply frontage; heights are data-independent. The Ethereum Mole's open
  fire-watch frame is the ring's one vertical at `13.5` u, about a third of the
  Pharos. Identity lives at ground level and on the nobori.
  Coverage: `src/systems/dock-layout.test.ts`.
- Station recipes adopt `garden-architecture-kit.ts`'s fresh caller-owned
  bucket-labelled geometries, not materials, lights or scene roots. Length is
  local X, span is Z, and all dimensions/UVs are metres; timber grain follows U.
  Each vertex carries S2's canonical `gardenSurfaceRole` code. Its sampled hip,
  gable, irimoya and working mono-pitch fields have thickness, shallow sag,
  coarse ridge/end courses and underside rafters, without universal upturned
  corners. Full interior structural bays (kit default 3 m; station walls
  4.5 m, narrow strip stores 6 m) and symmetric
  fitted end bays preserve exact outer length/span without scaling fixed
  joinery or changing heights;
  plaster is recessed and door/chamber apertures remain open. Deck, eave,
  door, chamber and ridge anchors are local and exported where applicable.
  The station recipes retain these parts until the existing global harbour
  buckets merge them; the batch disposes recipe geometry exactly once on
  teardown. Fixed 2 m rafter density (at most 12 per roof) preserves underside
  depth; only backs embedded into the shell are omitted, with continuous
  visible sides, underside and both end caps retained. No subpixel tile meshes
  are added. Open market and tea-house verandas use
  boarded decks; boat mouths, quay/berth topology, supply frontage, nobori,
  noren, cargo lanes, kindling and the Mole's fixed height stay unchanged.
  No per-station material, texture, GLB or drawable is added.
  Coverage: `src/three/garden-architecture-kit.test.ts`,
  `src/three/garden-docks.test.ts` (sampled sag, underside depth, exact frontage
  and fitted structural bays), `src/three/garden-harbor-batch.test.ts`
  (shared drawables and anchors). The adoption's rendered triangle ceiling is
  +16k across nine stations, including shadow/main submissions; measured
  owner deltas remain an orchestrator gate.
- Chain nobori (K28) replace the rooftop flags: one narrow banner per station
  (a pair at the Mole), `0.97–1.165 × 3.16–3.79` u cloth on an L-pole at the
  seaward eave or landing, tip `≤13.7` above water (`HARBOR_NOBORI_ENVELOPE`),
  with each pole's full radius seated on structure; the tea-house and storm
  feet sit 8 cm inboard of the exact roof edge to avoid floating-point edge
  misses, and the boathouse foot uses the actual fixed ridge-cap height rather
  than the displaced slab top. All consumers share `stationNobori` placement
  and rest-seat facing. Kinari cloth carries the complete chain mark (mon over
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
- The chaseki is a usable subordinate shelter: recessed timber/plaster bays
  open onto a boarded, seated-facing veranda and a lower threshold step beneath
  one thick, quiet hip/thatch eave. Bearing feet sample `islandTerrainHeight`;
  `GARDEN_CHASEKI_ANCHORS` owns island-local door, deck, threshold, eave and
  ridge positions used by the keeper, hung lantern and ridge gulls. The keeper
  crosses deck and step continuously before following the sampled gravel.
  Precinct engawa stays inside its existing north crown strip with a restrained
  pitched roof and underside rafters; gate, stair, single lit gatehouse window,
  landing perch, pond/reflection and lighthouse anchors remain unchanged.
  Both replacements retain static merge/LOD ownership, add no shelter or torii,
  and introduce no draw bucket or texture.
  Coverage: `src/three/garden-island.test.ts`, `src/three/garden-keeper.test.ts`.

## Light, palette, water and rendering budgets

- One shared sun/moon arc owns key direction, dome glow, water road and glitter.
  Wall clock is the default premise, never a flattering fixed hour. The beats
  follow the solar clock (`src/systems/sky-almanac.ts`: nominal 35°, hemisphere
  from the time zone); the key keeps a compressed ±57° arc around a noon side
  light from the rest seat's right (azimuth `−yaw`). Its composed seasonal apex
  is `clamp(0.62 + 0.4 × (almanac apex − (π/2 − 35°)), 0.42, 0.85)` radians:
  winter casts longer shadows without claiming the garden is at an astronomical
  location. Horizon crossings and beat boundaries retain true almanac timing;
  the minimum key elevation stays unchanged. Re-key
  light, AO, probe and grade together. The shared arc also drives the single
  analytic Rayleigh/Mie sky and finite-distance Beer–Lambert object/water air,
  including the custom waterfall ribbon's live shared uniform.
  The energy-normalized forward aerosol lobe remains localized to the sun so
  seasonal noon air stays neutral/cool without a compensating colour grade.
  Displayed accepted PSI controls aerosol monotonically, never stale-source fog.
  At clear noon, authored 140/300-unit samples retain ≥0.9/0.8 luminance
  transmittance; recession belongs primarily to borrowed hills, not a fitted
  plate-edge wash or stepped object air. Coverage: `src/three/garden-sky.test.ts`,
  `src/three/garden-atmosphere.test.ts`, `src/three/garden-aerial.test.ts`,
  `src/three/garden-day-cycle.test.ts`, `src/three/garden-waterfall.test.ts`.
- Three smooth world-space L1 fields shape engawa shelter, the stone court and
  waterside bounce. Prepared/shared/instanced PBR materials replace one quarter
  of their actual ambient/hemi diffuse with a normalized nonnegative blend;
  final drifted light colour/intensity (including DEV overrides) is metered once
  before rendering. The original global rig remains unchanged for identities,
  practicals and foliage. The court follows the authoritative lighthouse tile.
  Surface preparation → indirect correction → print ink → aerial transport
  preserves deformed/batched/instanced world position and mapped normals.
  PMREM diffuse/specular, differential SH, direct light and the single AO pass
  remain untouched; no extra probe, readback, texture, draw or triangle is added.
  Budget: ≤2 KiB JavaScript, four RGB coefficients per zone, three bounded
  evaluations, no per-frame allocation. Coverage:
  `src/three/garden-irradiance.test.ts`, `src/three/garden-surfaces.test.ts`,
  `src/three/garden-print-inks.test.ts`, `src/three/garden-environment.test.ts`.
- Conditional contact softening (S4-P6) was evaluated and not built: the
  existing five-tap cached PCF grounds the reviewed seat-garden stones and
  lantern and station eaves; moored hull waterlines retain their existing
  physical contact owner. The proposed eight-blocker/sixteen-filter PCSS
  path requires 24 texture fetches per participating shaded fragment versus
  five for PCF (+19, 4.8×); a near-region gate limits affected area, not that
  per-fragment cost. Reusing the shadow attachment can avoid new draws and
  textures, but does not establish no measurable regression at 1600×1000.
  No pass, material patch, enablement flag or dormant alternate lane ships.
  S9-P4's breath-independent shadow-view key and static-map cache remain
  unchanged; reduced-motion and static contact shading use the same PCF.
  This decision adds zero JavaScript, draws, triangles and textures.
  Reopen only for an operator-reviewed grounding failure on calibrated
  hardware, with paired whole-frame/crop and frame-time evidence satisfying
  the zero-new-draw/texture and no-measurable-regression ceiling.
  Existing lifecycle coverage remains `src/three/world-renderer.test.ts`;
  PCSS enablement-region tests apply only if that conditional cutover ships.
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
- Moon-independent night is judged by aspect-specific region floors, not
  near-black ninths: threshold–inlet and headland–water median contrasts ≥4 L*;
  every stone/moss/timber patch pair ≥3 L*; ≥90% of designated non-recess
  approach pixels ≥L*6. Cool diffuse/ground fill and the night PMREM are one
  calibrated rig. The indigo sky stays L*7–15; the beacon remains the brightest
  blurred local source, any true lunar rim/road is optional and subordinate,
  and all other lights/reflections are embers. No moonless directional-key
  floor, exposure raise, sail-emission lift or permanent water road.
  `preview --light-rois <json>` measures canvas CSS-pixel polygons and copies
  them into result JSON; exclude lamps/cloth/recesses and re-annotate each aspect
  after geometry changes. Coverage: `src/three/garden-day-cycle.test.ts`,
  `src/three/garden-environment.test.ts`, `scripts/pharosville/preview-metrics.test.mjs`.
  The shared per-kind ember gain stays `0.38` for lantern/buoy lanes; beacon is
  exempt and island lamps remain subordinate.
- At full tier, at most `16` reflection lanes burn; `48` texels describe packing,
  not a light-count target. Ember lanes closer than `8.5` world units cannot both
  burn; the dimmer reflection stands down while its land lamp remains lit.
  Thin overlapping pools before dimming every pool.
- Analytical route lanes are exempt from ember gain and spatial thinning. Cap
  simultaneity at four at full tier and rotate deterministically so every route
  takes its turn; quieting a cue cannot permanently remove its reading.
- Sea vocabulary is bounded: regions, swell, ripples, wakes, sparse exposed lap/crest foam,
  cloud shadow, sky-probe fresnel, light roads, glints, lanes, tower shadow, fog
  and bokashi. Each new term replaces/demotes an existing term.
  Masked stone/sand absorption replaces the approximate ellipse seabed and
  universal pale lap collar. Sheltered beach, quay and island contacts stay dark
  and still; lap requires exposure ≥0.65, a sparse world-anchored noise gate and
  clear hull contact, with passive highlight mix capped at 0.055. Shared substrate
  textures are counted only by their atlas owner.
  Pond optics replace the crossed three-octave normal blanket with a deterministic
  256² linear normal map: integer 2–12 cycle bands, ≥85% of slope energy within
  ±20° of one primary axis, RMS slope ≤0.06. One broad band and one weak fine
  band share that axis. Mip mean-length loss and complete-field derivative
  variance feed one filtered normal/roughness pair for Fresnel, probe, hero
  distortion and sun/moon lobes; base body roughness stays 0.06–0.22.
  Hero-only planar reflection replaces synthetic beacon columns and hero reflection
  quads. Its clipped half-CSS-resolution target admits only the tower/island/grove
  layer, retains transparent premultiplied coverage and cache invalidation, and is
  budgeted at `+12` calls, `+12k` triangles, `+2` textures and `≤1.2 ms` GPU,
  including the complete hero; it is not a full-scene pass. Target texel dimensions,
  reflected-UV pixel footprint and the shared variance-aware optical roughness
  determine mip filtering, never distance below shore. At most three bounded
  surface-axis taps spread in roughness-scaled texels (maximum two); distortion
  stays within 1.5 texels. Contact has zero spread/displacement and continuous
  coverage; farther reflection retains recognizable inverted tiers with a few
  held irregular strips, transparent edges and the existing emissive soft knee.
- Open night water retains mean-emissive ceiling `0.016`; S4/S5 leave additive
  gains unchanged. `src/three/garden-water.test.ts` restores the conservative
  unit-luminance proxy: sun glitter `0.9×0` (daylight-gated), moon road
  `0.15×0.04`, beacon `1.3×0.002`, summed point/route lanes `0.75×0.009`,
  totaling `0.01535`. Every additive term is enumerated; Fresnel, hero reflection,
  risk pairs, foam and ripple mixtures are passive, not added emission.
  Occupancies remain acceptance bounds on equivalent full-intensity coverage,
  not measured claims. Matched 22:00, animated 1600×1000 captures are archived
  at `outputs/g/l2/fullmoon.png` / `outputs/g/l2/fullmoon.json` (2026-09-26)
  and `outputs/g/l2/newmoon.png` / `outputs/g/l2/newmoon.json` (2026-10-10).
  Each JSON's `instruments.picture.nightWater` reports `pixels = 223919`.
  Its observed fields are listed below, rounded to six decimal places:

  | Capture | `mean` (L*) | `median` (L*) | `p95` (L*) | `brightShare` | `coverageAtOrAbove` |
  | --- | --- | --- | --- | --- | --- |
  | Full moon | 2.051102 | 1.503712 | 4.830175 | 0.003756 | 0.014831 |
  | New moon | 2.026950 | 1.699802 | 4.501905 | 0.001849 | 0.008914 |

  `brightShare` uses `brightThreshold = 10` L*; `coverageAtOrAbove` uses
  `minimumThreshold = 6` L*. These are rendered lightness statistics of the
  sampled water region, not direct occupancy of moon/beacon/lane emissions.
  Neither JSON measures normalized additive-term occupancy or emitted radiance,
  so it does not validate the proxy's occupancy bounds. Term-isolated coverage
  calibration remains required at both gate sizes, animated and reduced.
  Rendered inlet L* from `--night-water` or `--light-rois` is not emission proof.
- Blur a real-GPU preview by about `16 px` at every phase: a large calm, dark,
  low-contrast region must remain. Cosmetic improvements cannot relax budgets.

| Resource | Global hard ceiling | Reborn / Garden Observatory acceptance |
| --- | --- | --- |
| Draw calls | `700` whole-frame reported calls | `275` scene calls after Core; `285` with extensions |
| Geometries | `500` | `500` (no separate local allowance) |
| Triangles | `500,000` | `480,000` at rest |
| Textures | `72`, including animated whole-map N8AO | `60` at rest |

Both columns bind: local Reborn allowances (including hero reflection and
individual owner allocations) are included in measured totals, **not added to
either ceiling**. An owner must report signed baseline → candidate deltas for
JS gzip KiB, calls, triangles, textures and logical texture bytes, name the
displaced salience or cost, and identify the same viewport/DPR/scene/pass scope.
Reconcile owner census calls with `renderer.info`; report whole-frame peaks as
well as scene/rest counts. Charge shared resources once and fund spending only
from measured offsets, never hypothetical savings or another owner's reserve.
Historical device baselines are not allowances; no cap is enlarged here.

Daylight transport adds no draws, triangles, textures or LUTs; its net JS gzip
allowance is ≤3 KiB, offset by retired gradient/scattering/haze shader laws.
Sky radiance, displayed clouds and lunar lighting are staged before PMREM.
The probe key includes quantized solar direction/date, displayed accepted
clarity, effective displayed cloud cover and night lunar state with hysteresis.
The cover key uses 20 bins and stays zero until the shared noise field is ready,
so closed low cloud and overcast cannot alias at saturated aerosol clarity.
The existing bake cadence,
async differential SH, disposal/failure arms and immediate reduced-motion
bake remain binding. Celestial discs are excluded only during the bake.
Decorative coast materials may opt into `GARDEN_AIR_DECORATIVE_TERRAIN` to
cap only the overview chart-edge veil at 0.08; distance extinction, water
and other materials remain unchanged. Coverage: `src/three/garden-environment.test.ts`,
`src/three/world-renderer.test.ts`, `src/three/garden-aerial.test.ts`.

Whole-frame time remains at most `20 ms`; the separate GPU p95 target remains
`16 ms` with shipped passes on at `1600×1000`. Measure GPU separately from
CPU/main-thread time and discard disjoint samples; on ANGLE Metal, per-pass
timers are nonadditive and serial uncapped knockout deltas are the cost
evidence. Garden Observatory requires the M5 Pro calibration protocol in `TESTING.md` ("M5 Pro calibration — Garden Observatory"),
including full tier, p90 and worst-window p95 ≤`20 ms`, before device acceptance.
Device/backing pixels, resource counts and bundle sizes remain bounded.
Fidelity tiers preserve semantic hues, palette, tone mapping, day grade and
vignette; permitted local contrast/luminance changes retain meaning and avoid
transition pops.

- S1-P1's single macro-A threshold placement baseline was allocated at most `5` colour draws
  and `18,000` construction triangles, with incremental ceilings of `+2` draws,
  `+3,200` construction triangles, `+0` textures and `+0.5 KiB` gzip JavaScript
  against the previous threshold. These are owner allocations, not global-cap
  increases or submitted-pass allowances. Preserve the existing brow, deck
  coverage, tall-seat shoulder and offscreen shade casters; the same physical
  garden serves landscape and tall seats. Coverage/clearance, finite geometry,
  unpickability and disposal are tested in `src/three/garden-threshold.test.ts`.
- S1-P2 completes the ground, buried triad and disappearing approach within
  cumulative owner ceilings of `7` colour draws and `28,000` construction
  triangles; its incremental allocation is at most `+2` draws, `+10,000`
  construction triangles and `+0.5 KiB` gzip JavaScript. It adds no unique
  textures: S2 owns the shared atlas's three maps, and the threshold leases
  their detail source once for ground, stone and face-aligned timber. The
  existing engawa/tōrō draw uses zero detail weight on practical stone/chamber
  faces, retaining its kindling emission without another draw. The threshold's
  idempotent custom disposer owns its entire subtree and releases its lease;
  rim rebuilds and renderer teardown invoke it before generic tree disposal.
  One authored mask set drives ground height, moss/gravel/earth weights and
  terrain-relative stone contact. Surface roles remain constant per triangle,
  metric sampling preserves scale, and finite pixel-neighbour footprints keep
  visible shelf detail below the atlas's diffuse fade end. The uninterrupted
  gravel interval reserves one root-local horizontal plane beside the approach,
  free of decorative stones, for S3's record. Geometry and shade casters stay
  unpickable; coverage/clearance, 45–50% burial, smooth weathered shoulders,
  masks, seams, exposed crowns/four steps, path occlusion, metric timber UVs,
  practical exclusions and lease lifecycle are covered by
  `src/three/garden-threshold.test.ts`; subtree GPU and lease disposal exactly
  once across rim replacement/teardown are covered by
  `src/three/world-renderer.test.ts`.
- S1-P3 replaces only the near threshold's pad/outline recipe with two authored
  kuromatsu graphs: tapered parent-attached trunks, primary/secondary limbs,
  twigs and dense flattened opaque needle clusters with actual inter-cluster
  sky gaps. Closed short needles overlap into each irregular mass; individual
  spikes do not substitute for a recognizable kuromatsu silhouette. Distant niwaki
  retain the inexpensive pad kit. Its allowance is `+0` draws, at most
  `+15,000` construction triangles, `+0` textures and `+1.25 KiB` gzip JS;
  cumulative S1-P3 owner ceilings are `7` draws and `43,000` triangles.
  Vertex-baked `aGardenFlex` contains trunk/branch/tip weights, zero at the
  root, and `aGardenRootIndex` identifies the two trees as `0`/`1`. Two cached
  world-space rest roots survive breathed eye offsets. Wind uses the existing
  shared weather/clock and near attenuation, without vertex uploads; reduced
  motion forces exactly zero shader displacement. Determinism, taper,
  attachment, finite normals/bounds, closed needles, actual projected mesh
  gaps/branch envelopes and static roots are covered by
  `src/three/garden-niwaki.test.ts` and `src/three/garden-threshold.test.ts`.

## Media and motion

- Procedural geometry/materials own island, harbours, ordinary fleet, water,
  wrecks, landmarks, sky and ambient life. Checked lighthouse/hero GLBs keep
  hash, origin, scale, anchors, pick proxy and budgets coherent; load failure
  leaves aligned procedural forms visible. Logo decode failure preserves sail
  symbols and painted chain initials.
- Batch/instance repeated fleet structures, marks, lanterns and suitable scenery.
  Use one shared sail atlas, never per-ship textures. Retire shared hero GLBs in
  favour of the procedural batch as funded by Reborn; retain the named titans.
  Vessel shell replacement adds no fleet draws, textures, GLBs or loader;
  its allowance is ≤`1 KiB` gzip and ≤`8,000` added submitted triangles at
  `320` capacity, with shared S2 timber texture leases charged only to S2.
  Timber preparation follows existing deformation/material patches and never
  touches identity atlas cloth. Family far resources stay ≤`40` triangles per
  vessel; silhouette/waterline/anchor/resource tests replace recipe-count pins,
  while family paint, peg trim and sail-grid assertions remain binding.
- One route-owned clock drives normal motion: no per-entity timers, independent
  CSS analytical animation or extra renderer loops. Shared final `displayTile`
  drives rendering, hit testing, follow and debug positions.
- Hull contact is current physical grounding, not motion history or financial
  recategorisation. Every hull writes B only; actual movers add R bow/stern/short
  arms and G soft slick at the unchanged zone/speed/change strength, irrespective
  of selection. The 512² HalfFloat ping-pong pair retains MAX blending and exact
  R/G decay horizons (12/60 seconds), small-pan reprojection and teleport resets.
  Water filters history by pixel footprint with a monotonic R/G transfer; contact
  stays hull-bedded with at most 0.75 world units of footprint-filtered optical
  reach, replacing the long reflection smear. Below balanced the existing local
  wake quads preserve mover/intensity order and painted hull discs retain contact;
  moored hulls gain no artificial trail or dock-dwell flourish. Reduced motion
  has no R/G and redraws B only when footprints or the camera window change.
  Coverage: `src/three/garden-wakes.test.ts`, `src/three/garden-water.test.ts`,
  `src/three/garden-wake-batch.test.ts`, `src/systems/motion.test.ts`.
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
  K44 is replaced by the explicit six-station **Stroll** (the control or W):
  Previous/Next visit adjacent authored viewpoints and hold indefinitely.
  Home alone returns to the seat; Escape or deselection closes inspection
  back to its saved station-local pose. Wheel and drag retain the displayed
  lens/yaw within authored local bounds; unrelated chrome input never ends
  a station. Interruption holds the displayed pose, and resize re-solves its
  composition without landing on an unseen destination. Reduced motion cuts;
  idle never tours or orbits. The shared piecewise eye/target paths use explicit
  corridor waypoints, sampled against production terrain and station massing
  at ≤0.5 world-unit increments, with ≥1.7 water and ≥0.8 land eye clearance.
  Every station keeps its subject anchor, clear eye and clear sight lines at
  the four gate profiles (`src/systems/postcards.ts`). The director holds ordinary
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
  identity sails. Fully set means unfurled, not taut: docked/anchored and
  unsampled cloth keeps its identity bit zero, cuts dynamic fill to 20% and
  flutter to 8%, and hangs a bounded downward foot catenary (≤0.336 local units).
  The resting bit shares `aSailAttention.x` with luff and attention; no new
  vertex attribute is added. Batch, hero and CPU reference share this state,
  F-A brace conventions, furl masks and dip bounds. Underway retains apparent
  wind. Reduced motion holds one complete, fully set sag pose on the frozen
  shared clock, without animation. Only the crossing
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
- Resident ecology remains exactly four koi in the reflection pond and one grey
  heron. Koi use seeded, bounded travel/pause/turn itineraries on the canonical
  water clock, with real still-water pauses and short in-place heading changes,
  not figure-eights or station oscillators. Near-bank routes and the tea-side
  shallow heron station seek legibility through habitat placement, never a new
  animal glow. Daylight presence and the scored heron flights remain unchanged;
  reduced motion fixes complete positions/headings/poses, not merely translation.
  The displaced cost is the former synchronized looping motion, with no added
  draws, triangles or textures. Coverage: `src/three/garden-koi.test.ts`,
  `src/three/garden-heron.test.ts`.
- The merged near trees consume baked `aGardenFlex` trunk/branch/tip weights
  and `aGardenRootIndex` (`0`/`1`). The renderer samples
  `gardenGustAtWorldPosition` exactly twice for the two cached world rest roots
  on `frame.timeSeconds`; two scalar uniforms carry that downwind front.
  Eye breath never moves the sampling roots, vertices never upload per frame,
  and no second wind clock or height-only sway survives this cutover. Root
  displacement is zero, flexibility increases through branch to tip, and
  reduced motion sets the complete wind displacement to zero. Coverage:
  `src/three/garden-flora.test.ts`, `src/three/garden-threshold.test.ts`.
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
  Generated fish-ring admission retains S8-P5a's half-open one-second window:
  busy, expired or missed windows drop without catch-up or replay. Noon/sunset
  exclusions and quiet checks include admission plus the full hold; forced
  rituals demonstrate the handler, not natural score admission.
- Sound is strictly opt-in (`src/hooks/use-garden-sound.ts`): the named Sound
  switch explains shore water, pine wind, basin drips and distant harbour work.
  Only its explicit gesture creates an AudioContext and fetches the lazy
  `pharosville-audio-*.js` chunk, including debug offline auditions. Music stays
  separate. `pharosville.sound` keeps the existing `{v:1,on,music}` format;
  remembered Sound is armed, never autoplayed. Still/OS reduced motion allocate
  no context or audio chunk; entering Still or switching Sound off silences and
  closes the engine immediately. Leaving Still only arms it again. Hidden tabs
  stop event scheduling, fade and suspend; resume drops missed events.
- The basin replaces the south ensemble's `(3.8,6.75)` companion, never the gull
  landing stones. The grounded bowl, spout and non-emissive dark hydraulic mouth
  all share the existing stone material/batch: no new draw, material or texture,
  retaining the island's 42 merged drawables. Modal drips reuse the lap bus and existing shore-breath
  event cadence, displacing 3 dB of lap/wash; root-gust pine rustle displaces
  4 dB of broad wind hiss. Actual source/listener coordinates determine distance,
  pan and sheltered basin hearing. Wind uses the same `writeWeatherPlan` inputs
  and `gardenGustAtWorldPosition` root sample as the visuals. The visual solar
  score hushes the bed at night and rests distant rope/fender work; the existing
  director environment slot still owns far events. A stale visual clock holds,
  never becomes a second audio clock. All events share the six-voice ceiling and
  the master remains ≤−6 dBTP. Sound, basin and gravel have no market-direction,
  PSI-history, alarm or metronomic-knock mapping; DOM/ledger readings remain truth.
  Coverage: `src/lib/pharosville-audio/bed.test.ts`,
  `src/lib/pharosville-audio/borrowed.test.ts`,
  `src/hooks/use-garden-sound.test.tsx`, `src/three/garden-island.test.ts`.

## Approval and delivery

The programme stays on `feat/garden-observatory`, with an Unreleased changelog
until one final release; there is no intermediate release. Taste checkpoints
are destination and CP-Final only, not a separate operator graybox gate.
CP-Destination is reviewed autonomously by the orchestrator against the elected
A board and archived for the operator's final review; model judgment is not
operator preference. Real-GPU gate-profile evidence, CP-Final operator
acceptance, the reading gate and actual M5 evidence are required before the
single release, through `RELEASES.md` and the protected workflow. Agents never
push, open PRs, tag or release. Validation routing lives in `TESTING.md`.
