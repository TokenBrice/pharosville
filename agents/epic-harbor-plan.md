# Epic Harbor Plan — redistribute the ring, make Ethereum a landmark

**Date:** 2026-09-04 · **Status:** plan, not yet implemented · **Author:** orchestrator synthesis over seven research lanes (index in §14).

Operator brief: harbors are "super concentrated left of the lighthouse, all around the
ethereum harbor"; Ethereum "must feel like its own special landmark, like the lighthouse";
harbors must be "distributed all around the map, each given a proper and recognizable
identity", may grow in size and be reworked; buildings "overall feel weak"; and the plan
should absorb state-of-the-art Sept 2026 three.js building technique.

Everything below is either measured (script output from the real modules, cited) or an
explicit design decision with its trade named. Unverified inference is marked
`[INFERENCE]`.

---

## 1. The defect, measured

The complaint is exactly right, and it has one cause.

`ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS = ["ethereum", "base", "arbitrum", "polygon"]`
(`src/systems/world-layout.ts:64-67`, consumed at `src/systems/chain-docks.ts:166-169`)
hard-reserves **four of only eight** harbor slots (`MAX_CHAIN_HARBORS = 8`,
`src/systems/chain-docks.ts:14`) for the EVM bay, whose four authored mouths sit at
(14,74), (12,68), (14,81), (13,89) — a 21-tile stretch of west shore
(`src/systems/garden-rim.ts:125-128`). The lighthouse is at world tile (60,70)
(`LIGHTHOUSE_TILE`, `src/systems/world-layout.ts:56`, `landWorldTile` offset 42).

Measured on the realistic top-8 feed through the real `buildChainDocks`:

| Metric | Today | Target |
| --- | --- | --- |
| Other rendered stations within 30 tiles of the Ethereum mouth | **3 of 8** | **0** |
| Precinct pairwise distances | 6 / 7 / 8 / 13 / 15 / 21 tiles | ≥ 20 tiles, no trio ≤ 30 |
| Bearing wedge holding those four | **20.4°** (161°→181.5° from plate centre) | — |
| Largest station-free **closed-rim** arc | **111°** (compass 140°→251°) | **≤ 49°** |
| Trios within 30 tiles | **4** | **0** |
| Authored mouths on the W arc | **6 of 12** | **2 of 8** |
| Ethereum station height vs Pharos | 12.35 of 34 world units = **36%** | 21.5 = 63% |

The 111° hole is the **entire south and south-west rim** — the camera-near foreground.
So the world simultaneously masses half its harbors in one wedge beside the lighthouse
and leaves the most visible coastline empty. The "epic" failure and the "concentrated"
failure are the same failure.

Two aggravating factors, both measured:

- **The cluster is clone geometry.** `base`, `arbitrum` and `polygon` all run the identical
  `authorAnnexPavilion` with identical constants (`src/three/garden-docks.ts:723-750`);
  only the flag atlas cell and a ±0.05 hue jitter differ. The 21-tile precinct is three
  copies of one 13.4 × 7.0 pavilion.
- **Ethereum is bigger, not monumental.** Precinct vs one annex: 908 vs 520 triangles
  (1.75×), primary mass 22.24 vs 13.40 long (1.66×), second level 12.35 vs 8.75 (1.41×).
  It stands beside a 34-unit lighthouse (`src/three/garden-lighthouse.ts:775-776`) at
  36% of its height. The campanile with a visible bell already exists
  (`src/three/garden-docks.ts:688-704`) — it is simply scaled as a subordinate pavilion.

### Why the buildings feel weak (12 cited findings, Lane A §4)

The headline four; the rest are in the lane file.

1. **One pavilion, eleven hats.** Six archetypes call the same `articulateIrimoya`
   (`src/three/garden-docks.ts:1144`) over a ~13 × 7 plate. Eight of eleven primary
   masses measure within 12.99–13.40 × 6.81–7.29. The roofline *names* differ; the kit
   emits the same ridge + fascia + 4 brackets + course at slightly different scales, so
   real silhouette difference is about one eave unit.
2. **Slab massing.** Every wall is a single `BoxGeometry` (12–56 triangles per station).
   No reveals, no corner breaks, no bay rhythm; every plan is a rectangle except the
   storm-mole arc and the stepped-inlet steps.
3. **The detail that exists is switched off.** The *entire* metal bucket is authored
   `fineDetail = true` (`src/three/garden-docks.ts:335`) — winches, chain coils, mooring
   rings, ladder rungs, the reed boathouse's boat-bay mouth, the pigeonnier's entry holes
   — and the fine tier ships hidden (`src/three/garden-harbor-batch.ts:137-139`). At
   cruise the visible harbor is the *un-detailed remainder*: zero visible ironwork, and
   the two genuine architectural voids render as solid mass.
4. **Volume-to-detail starvation.** 468–934 triangles per whole station: 0.14–0.28% of the
   335,105-triangle frame. A 22-unit hall is lower-density than one 2.6-unit dead wreck
   hull. The 9-station layer is ~5,420 triangles in 14 draws.

**The enabling fact for everything below:** merging plus instancing means station count
never scales draw calls — 14 meshes for 9 stations, ceiling 20
(`src/three/garden-harbor-batch.test.ts:68-69`). Measured headroom is
**444 draws / 164,895 triangles / 270 geometries / 29 textures**, and the 500k ceiling
affords ~19.8k triangles per station, ~13× the current mean. Geometry is nearly free
here; attention is the scarce budget.

---

## 2. Decisions (where the lanes disagreed, arbitrated)

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| **D1** | Do the L2s stay beside Ethereum? | **No. Ethereum stands alone.** `base`, `arbitrum`, `polygon` become self-standing harbors on other arcs. No bridges, no annex flags, no "embassy" furniture, no bridge stubs. | Physical distance is the actual correction. Keeping symbolic annexes recreates the same hierarchy after moving the meshes. Overrides Lane D's "covered bridge stub" dressing for arbitrum. |
| **D2** | Is the Mole a checked GLB? | **No — fully procedural.** Reject Lane C §5.1's 11,600-triangle GLB. | `docs/pharosville/ASSET_PIPELINE.md:80-89` permits a model only when procedural geometry *cannot* make the required normal-distance silhouette. At ~19.8k affordable triangles per station it plainly can. A GLB would also import the hash/origin/scale/anchor/budget contract and a double-shell fallback path for zero silhouette gain. |
| **D3** | Mole crown height: Lane C 21.5 vs Lane D ≤16? | **21.5 world-unit cap** (21.7 above water). | Lane C owns Ethereum and did the ratio work: 63.2% of the 34-unit tower, 57.1% of its 38-unit water-to-tip rise. Lane D deferred explicitly. Amend the station band instead (§9). |
| **D4** | `annex-pavilion` after the precinct dies? | **Delete the archetype.** `arbitrum` takes `storm-mole` at the wreck shoal's east edge. | A form whose own source comment says it makes "every L2 an obvious but subordinate satellite of the Ethereum hall" (`src/three/garden-docks.ts:734-735`) is a lie once nothing is adjacent. Deleting beats renaming: it removes the clone form (W11/D1) rather than relabelling it. `storm-mole` is honest for Arbitrum — Orbit shelters satellite chains in the lee of one heavy structure. |
| **D5** | Spread depends on which chains rank top-8. | **Match the ring to the cap: 8 authored mouths, `MAX_CHAIN_HARBORS` stays 8**, and `ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS` shrinks to **`["ethereum"]`** — only the monument is reserved. | Two earlier drafts were wrong in opposite directions. Cap 8 with 10 mouths leaves two mouths dark and *which* two is feed-dependent (66° hole measured). Cap 10 with 10 mouths fixes that but adds two rendered stations, and the attention-displacement contract (`docs/pharosville/VISUAL_INVARIANTS.md:228-234`) gives them nothing to displace. Measuring the alternative settled it: an **8-mouth ring reaches the identical 49° spread with the station count unchanged at 9**, so the density increase bought nothing and was cut. Reserving all four EVM chains was the original cluster driver; reserving only `ethereum` keeps the monument guaranteed and lets the rest fill by supply. |
| **D6** | The single harbor calm mask under a full-rim spread. | **Re-seat it as the Mole's inner basin.** No contract widening. | `gardenHarborCalmMask` clamps radii to 18 × 13 world units (`src/three/garden-docks.ts:1811-1817`); Lane C's basin is 18 × 14, i.e. radii ~9 × 7 — the clamp *minimum*. The basin is a real enclosed mirror-water court, so the one-ellipse contract becomes correct instead of vestigial. Delete the dormant exported function Lane G found (the renderer never calls it, `src/three/world-renderer.ts:2985-3017`). |
| **D7** | Which archetypes retire? | **Four: `annex-pavilion`, `salvage-slip`, `signal-jetty`, `gate-landing`.** Two new forms: `uogashi` and `hatago-wharf`. `boathouse-precinct` is *renamed* to `ethereum-mole`. Net 11 → 9. | Archetypes are driven by the *slot*, so a form with no authored mouth never renders and is dead code. `salvage-slip` loses `wreck-salvage-cut` (retired: 5.1 tiles from `calm-engawa-south`, same stretch) and its "wreckyard image on a live chain" mis-read goes with it; `signal-jetty` loses `alert-signal-jetty` (§3). **`gate-landing` is removed on operator instruction (2026-09-04): "that red gate? you can remove it."** That releases `base` to Lane D's `hatago-wharf`, which is also better sited — `ledger-fog-hook` (9,54) sits beside the north-west borrowed-horizon opening, so it is the plate's first landfall, and a hatago (旅籠) is the Edo traveller's inn. Deleting the torii **requires** the §9.8 amendment, because the invariants name it by hand. |
| **D8** | Which `hyperliquid` id is canon, and where is it normalized? | **`hyperliquid` is canonical** — `shared/lib/chains.ts:110` maps `"hyperliquid-l1" → "hyperliquid"` and `CHAIN_META.hyperliquid` (`:30`) is the entry; `src/systems/world-layout.ts:143` is **already correct**. **Normalize once at `buildWorldScaffoldStage`** (`src/systems/pharosville-world/stages/world-scaffold.ts:394-395`): map `resolveChainId(id) ?? id` over a copied `ChainsResponse` and pass that one object to all three consumers. **Four conditions make it sufficient** (Lane N audit): (a) re-key `CHAIN_FLAG_FIELD` to `hyperliquid` (L6); (b) handle the mint-burn `scope.chainIds` join, which is the one real bypass (L13); (c) **pass unknown ids through unchanged** — `resolveChainId` returns `null` for anything outside `CHAIN_META` (`shared/lib/chains.ts:179`), so a bare `resolveChainId(id)` would drop generic chains, shrink the fill pool and unbind ring coverage; (d) collapse both-spellings duplicates by the deterministic rule in **D8a**. | That line hands the **same raw `inputs.chains`** to `buildChainDocks`, `withChainSignals` and `buildSupplyTide`. `useChains` has exactly one consumer, so the scaffold object is the complete boundary for everything fed by the chains payload — but a *partial* fix is worse than none: normalizing dock selection alone newly breaks the `withChainSignals` join, which is self-consistent today precisely because both sides read the same raw object. |

**D8a — the both-spellings dedupe rule** (executable form of D8's condition (d)).
`selectChainHarbors` builds a `Map` keyed by chain id (`src/systems/chain-docks.ts:163-173`),
so once `hyperliquid-l1` normalizes to `hyperliquid` a feed carrying both spellings would
silently make the surviving entry **insertion-order dependent** — picking a different
`totalUsd`, a different `healthBand`, and potentially a different cap outcome on successive
loads. The boundary therefore collapses duplicates deterministically, before
`buildChainDocks` sees them:

1. Group the normalized summaries by canonical id.
2. Within a group, **prefer the entry whose raw id already equalled the canonical id**; if
   none does, take the largest `totalUsd`; break exact ties by raw id, lexicographic
   ascending.
3. **Never sum.** The API is not documented to partition one chain across two spellings, so
   adding them would double-count supply — and supply drives dock size, the harbor rank, the
   share-of-global fact and the roof-mass ladder. Losing a genuine partition is the safer
   failure, and step 4 makes it visible rather than silent.
4. Emit a development-time warning naming the canonical id and every raw id that collapsed
   into it, so a real partition surfaces as a bug report instead of a quiet halving.

Asserted in the Phase 1 normalization test: a feed containing both `hyperliquid` and
`hyperliquid-l1` yields **exactly one** dock, with the canonical entry's `totalUsd`,
deterministically across input orderings (assert both orderings produce identical output).

**Unit convention used throughout:** `TILE_SCALE = √2` (`src/three/garden-util.ts:13`), so
world units ÷ 1.4142 = tiles. All architecture dimensions are world units; all placement
coordinates are tiles.

---

## 3. The ring: 8 authored mouths

Every mouth below is machine-verified against the same authored predicates the existing
coves were checked with (`src/systems/garden-rim.ts:109-113`): water tile of a **named**
body, `rimShoreDistance ∈ (0, 2]`, outside both `RIM_OPENINGS`, rim land within 14 tiles
landward along `seawardBearing`, water at the immediately seaward tile, navigable by
flood-fill from the island, **and** > 3.25 tiles from every wreck-scatter grave
(`src/systems/world-layout.test.ts:398`). Brute force over all 19,600 tiles produced 762
valid candidates; these 8 are the selected ring.

**The ring is exactly as large as the harbor cap.** `MAX_CHAIN_HARBORS` stays **8**, so 8
rim mouths plus the untouched TON pigeonnier = 9 berths = **9 rendered stations, identical
to today's count**. Whenever the feed carries at least eight eligible chains — the
production case, since the API names roughly ninety — **and that selection includes
`ethereum`**, every authored mouth is lit, so there is no dark mouth to become a dead path.
The `ethereum` qualifier is required for the same reason §4 gives: the Mole sits in the
EVM-bay pool only (`src/systems/chain-docks.ts:192-200`). On a **degraded or sparse feed**
the ring simply renders fewer stations: `selectChainHarbors` returns only what is eligible
(`src/systems/chain-docks.ts:158-179`) and TON is conditional on its own supply
(`:181-185`). The four-arc and 49° figures are therefore asserted **only** against the
**≥8-eligible-including-`ethereum` dense fixture**. A sparse feed is asserted for what is
actually true of it — every rendered dock sits on a valid assigned mouth, no three
rendered stations within 30 tiles, TON present iff its supply is non-zero — and **never for
arc coverage**, which a feed of one to three chains cannot satisfy by definition. An
earlier draft authored 10 mouths and raised the cap to 10; that was cut, because a 10-mouth
ring measures the *same* 49° spread while adding two stations the attention budget would
have to pay for.

| # | cove id | body | tile | seaward (math°) | width | provenance |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `ethereum-mole` | calm | **(15, 95)** | 0 (E) | 6 | **NEW** — replaces all four EVM mouths |
| 2 | `ledger-fog-hook` | ledger | (9, 54) | 0 (E) | 4 | keeps — west extreme |
| 3 | `warning-stone-notch` | warning | (118, 10) | 90 (S) | 3 | keeps — the north arc's one mouth |
| 4 | `danger-gorge` | danger | (131, 59) | 180 (W) | 3 | keeps — east extreme |
| 5 | `watch-east-bay` | watch | (132, 80) | 180 (W) | 5 | keeps |
| 6 | `watch-south-reed` | watch | (122, 132) | 270 (N) | 4 | keeps — camera-near south |
| 7 | `calm-engawa-south` | calm | **(60, 130)** | 270 (N) | 4 | **NEW** — retires `wreck-salvage-cut` (55,129) |
| 8 | `wreck-shoal-east` | wreck | **(31, 125)** | 270 (N) | 3 | **NEW** — retires `wreck-west-ledge` (14,110) |

Authored mouths **12 → 8**. W-arc mouths **6 → 2**. EVM bay slots **4 → 1**. Also retired:
`ethereum-precinct`, `base-annex`, `arbitrum-annex`, `optimism-annex` (the cluster),
`alert-signal-jetty` and `watch-terrace-quay` (both were evaluated and cut — at cap 8 they
would never bind).

Three structural findings that constrain any alternative ring:

- **The "INTERIOR-SHORE" arc is impossible.** Zero of the valid tiles classify there: rim
  land only exists within `depth ≤ 14` of the plate edge, so every tile with
  `rimShoreDistance ≤ 2` is within 16 of an edge and therefore always N, E, S or W. "All
  five arcs" must be read as **four rim arcs plus the pigeonnier** (itself S).
- **Body capacity is very uneven.** `danger` offers exactly 2 valid tiles, `ledger` 2,
  `warning` 5. Ring freedom comes only from calm (95), watch (172), wreck (217) and
  alert (74). The SW corner is unusable: the cemetery scatter carpets it —
  (19,133) = 1.83, (14,133) = 2.65, (2,121) = 3.16 tiles to the nearest grave, versus the
  3.25 minimum. (31,125) at 5.53 is the best available SW tile, and it was chosen over
  (30,125) specifically to keep `chain-docks.test.ts:168` (`outer.every(x > 30)`) passing.
- **The `alert` body loses its harbor.** Dropping `alert-signal-jetty` takes body diversity
  to 6, which still satisfies the ≥6 gate (`world-layout.test.ts:300`). `alert` has 74
  valid candidate tiles, so this is the most recoverable of the possible omissions — unlike
  `danger` (2 tiles) or `ledger` (2), which the ring therefore keeps.

---

## 4. The binding: 9 berths, one identity each

Archetype comes from the **slot**, not the chain (`stationSlotForChain`,
`src/systems/chain-docks.ts:188-200`), so the slot table below is the whole identity
system: **the place owns the architecture, the chain brings its flag and its supply-scaled
mass.** Eight rim slots plus the untouched pigeonnier.

| cove | tile | arc | archetype | chain | nameable silhouette | roof rung / accent token |
| --- | --- | --- | --- | --- | --- | --- |
| `ethereum-mole` | (15,95) | **W** | **`ethereum-mole`** (was `boathouse-precinct`) | `ethereum` | civic hall + offset campanile on an enclosing stone mole | `roof_clay` `#a66147` / `stone_mid`, `iron_dark` |
| `ledger-fog-hook` | (9,54) | **W** | **`hatago-wharf`** (new) | `base` | two-storey travellers' inn, stacked roofs, lantern row over a water stair | `#56606b` (new rung) / `timber_warm`, `lantern_warm` |
| `warning-stone-notch` | (118,10) | **N** | `stepped-inlet` | `tron` | wide stone stair descending into water under a lantern crown | `#747a7c` / `iron_dark` |
| `danger-gorge` | (131,59) | **E** | `fishing-pier` | `solana` | long thin pier, single lean-to, tall forked net rack | `#9c694c` / `aurora_green` |
| `watch-east-bay` | (132,80) | **E** | **`uogashi`** (new) | `hyperliquid` | open-fronted market hall on pilings, great hanging steelyard | `#6f7a5e` (new rung) / `lantern_cold` |
| `watch-south-reed` | (122,132) | **S** | `reed-boathouse` | `polygon` | high sharp thatch gable, open boat-bay mouth, reed dome | `#c7ae72` / `timber_warm` |
| `calm-engawa-south` | (60,130) | **S** | `tea-house-quay` | `bsc` | tea house, round moon window, engawa water shelf | `#40515b` / `lantern_warm` |
| `wreck-shoal-east` | (31,125) | **S** | `storm-mole` | `arbitrum` | crenellated stone breakwater curving out, lantern tower at its head | `#354750` / `fog_pale` |
| pigeonnier islet | (125,126) | **S** | `pigeonnier-islet` | `ton` | round cote, cone roof, dark entry holes, perch ledges | `roof_cote_clay` `#ba7557` / `moonlight` |

Identity rationale is chain-truth, not flavour: `base` = "bring the next billion onchain",
whose product is *arrival* — a gate you pass through, sited on the fog-hook approach;
`tron` = the payments rail that berths at any tide (a stepped ferry landing);
`solana` = highest-velocity retail flow (the busiest small-boat quay); `hyperliquid` = the
chain that *is* the exchange, on the Ledger Mooring's working bay (uogashi 魚河岸, the
riverside market where boats trade under one roof); `polygon` = many strands woven into one
roof; `bsc` = the merchant house of the east, yield culture over tea, on the camera-near
calm shore; `arbitrum` = Orbit shelters satellite chains in the lee of one heavy structure;
`ton` = messenger birds.

**Coverage under the cap — the important robustness property.** All eight named chains hold
*explicit* preferred berths, so the normal top-8 binds deterministically. If a feed pushes
one of them out of the top eight, the substitute has no preferred slot and falls through to
`firstOpenSlot(OUTER_HARBOR_STATION_SLOTS)` (`src/systems/chain-docks.ts:188-207`) — taking
the freed mouth and **inheriting that place's archetype**. So the mouth stays lit, the
geography keeps its building, and only the flag changes. `aptos` and `avalanche` therefore
do render when they rank in the eight; they simply wear the place's form rather than a
private one. This is intended behaviour, not a gap.

**The guarantee's exact scope.** Phase 1 gates it as: *for any eight-chain selection that
includes `ethereum`, all eight rim mouths bind, each with its slot's archetype.* The
`ethereum` qualifier is load-bearing, not decorative: `stationSlotForChain` picks its pool
by EVM membership (`src/systems/chain-docks.ts:192-200`), and the Mole sits in the
**EVM-bay pool only** — so a selection without `ethereum` cannot fill it and yields at most
seven outer docks. That case is unreachable in production because `ethereum` is the one
chain still hard-reserved (D5) and is the largest stablecoin chain by supply, but the gate
must state the precondition rather than imply universal fill. If the operator ever wants the
Mole reachable by a non-EVM chain, that is a deliberate EVM-pool fallback to add, not an
accident to rely on.

One consequence worth stating plainly, because Lane V observed it in a real run: a
**generic** chain that out-ranks a named one also claims mouths in selection order, so with
`sui` at 4.2B above `hyperliquid` at 3.5B, `sui` takes `watch-east-bay` first and
`hyperliquid` is displaced onto a fill mouth. Coverage, spread and the archetype-of-place
all hold; only which flag flies over the market hall changes. A chain's *form* is therefore
a property of its berth, not a promise about the chain.

**Verified properties of this binding.** Computed independently by the orchestrator, then
re-verified end to end through the real `buildChainDocks`, `RIM_COVES`, `rimShoreDistance`,
`seaBodyAtTile` and `graveNodesFromEntries` by Lane V
(`agents/research/2026-09-04-harbor-plan-verification.md` — no FAIL; figures below matched
exactly):

```
stations = 9 (8 rim + ton)          today = 9   -> UNCHANGED
max closed-rim empty arc = 49.0deg  today = 111.0deg
trios within 30 tiles    = 0        today = 4
N(y<=30) = 1 (<=2)   S(y>=112) = 4 (>=2)   x = 9..132   arcs = [E,N,S,W]
bodies = calm, danger, ledger, warning, watch, wreck = 6 (>=6 required)
W-arc mouths = 2                    today = 6 of 12
nearest mouth to the Mole = 34.0 tiles   today = three within 21
min pairwise separation among lit stations = 6.7 tiles
  (watch-south-reed <-> the TON pigeonnier, an authored pair that exists today)
```

The 49° residual hole is the south-centre `ma` between `wreck-shoal-east` and
`calm-engawa-south`, and predicate 1 forbids inhabiting most of it anyway — the south rim
between x ≈ 62 and x ≈ 105 is unnamed `open` water. That emptiness is composition, per the
standing spacious-garden contract.

---

## 5. The Ethereum Mole

**Site (15,95), primary.** Chosen on measured grounds, not taste:

- **Its own promontory.** `rimDepth = 14.0` is the maximum authored shoulder
  (`RIM_CONTOUR`, `src/systems/garden-rim.ts:89-99`) — the "broad engawa lobe and pointed
  promontory" of `RIM_DESIGN_NOTES:152`. The mole lands on a headland that already exists.
- **Clear approach: 117 tiles** of unobstructed water eastward, versus **47** at today's
  mouth, where the island itself blocks the view.
- **Isolation: 34.0 tiles** to the nearest ring mouth (today: three neighbours within 21),
  and 51 tiles from the lighthouse.
- Grave clearance 21.2 tiles. Verified alternates: **(14,95)** if the quay should sit flush
  to the bank (`sd` 0.50), **(15,84)** if the operator wants it nearer the old west-shore
  sightline.

**Form — deliberately the lighthouse's opposite.** The Pharos is a natural irregular
promontory, one slender central vertical, successive circular contractions, a pale crown
against sky, fire and beam, a sacred terminal figure, a landscape base spreading outward.
The Mole is measured civic masonry, a broad horizontal enclosure plus one *offset*
vertical, rectilinear hall and open square belfry with unequal linear arms, mid-value
stone and dark roof against sea and land, no summit glow at all, a useful bell, and a void
carved *inward*.

Plan, land to sea (world units; ÷1.4142 for tiles):

1. **Landward civic apron 26 × 10** — a 7-wide asymmetrical stair arriving off-centre, a
   3-wide ramp folded along one side, a 10-unit clear court between gate and hall.
2. **Ethereum hall 24 × 10**, long axis along the shore — a low ashlar council hall with a
   deep hipped roof, *not* a miniature Pharos. Campanile at one shoulder, outside the hall
   eave, preserving the existing sail-clearing logic.
3. **Inner basin 18 × 14 of visible water**, bracketed by two unequal arms; clear entrance
   7 units, angled 12° off the hall axis so it never reads as a symmetrical U.
4. **Engineered arms** 4.5–5.5 wide, battered wet-stone toe, dry ashlar walk, 0.55
   capstones; the long arm projects 22 seaward, the short 15, terminating in a squared
   hammerhead — **not** a lantern tower.
5. **Bent approach axis**: water entrance → empty basin → off-centre stair → hall door,
   compressed by one thick lintel gate in iron-dark and timber-dark.

Envelope **≤ 40 × 34 world units = 28.3 × 24.0 tiles** — which is the same alongshore
extent the four clone mouths used to occupy (21 tiles), now spent on one monument.

**Vertical ladder** (dock-local Y; root is 0.2 above water, quay top 1.55):

| Stage | Top Y | Above water | Purpose |
| --- | ---: | ---: | --- |
| submerged toe / first tide course | −0.2 … 0.35 | 0–0.55 | the base visibly enters water |
| arm walk and quay | 1.55 | 1.75 | one continuous horizontal datum |
| civic podium / stair landing | 2.8 | 3.0 | separates hall from working quay |
| hall wall cornice | 7.0 | 7.2 | long calm primary mass |
| hall roof ridge | 9.2 | 9.4 | clears sails |
| campanile shaft cornice | 15.0 | 15.2 | narrow vertical marker, 3.8 × 3.8 shaft |
| open belfry head | 19.0 | 19.2 | four corner piers, visibly empty centre |
| shallow hipped cap | **21.5** | **21.7** | terminal silhouette; nothing above it |

21.5 is **63.2%** of the lighthouse's 34-unit local tower and **57.1%** of its 38-unit
water-to-tip rise. It may never reach two-thirds of that rise (25.3 above water), whatever
a later author asks for.

**Ground-plane integration** (the Pharos grammar, not its geology): two planar battered
stone faces from −0.2 to 0.75; three horizontal tide courses at 0.05 / 0.45 / 0.90, each
0.22–0.28 high and proud by 0.06, **fixed in count** (unlike the lighthouse's five
PSI-driven salt courses, these carry no meaning); unequal 1.2–2.4 capstones with every
fifth joint omitted or doubled so the arm is not a ruler stripe; stair and ramp cut into
the podium sharing its stone bucket; eight bollards (five long arm, three short) at
unequal spacing, **not** supply-scaled; one continuous warm lit edge on the hall-side quay
only.

**Displacement ledger — this is a replacement, not an addition:**

1. the entire current `boathouse-precinct` hall, moon-viewing deck, veranda, campanile and
   four-step stair (`src/three/garden-docks.ts:663-721`);
2. every Ethereum→L2 covered bridge (`:1509-1583`) — no stubs, no paths pointing at
   retired annex positions;
3. **three precinct lamp positions → two shielded portal lamps** (`:1646-1660`): a net
   *removal* of one light/reflection-lane candidate;
4. the empty moon-viewing deck → the enclosed basin (both are horizontal pauses; one
   survives);
5. generic supply-scaled bollards and plank scatter inside the envelope → the fixed civic
   rhythm;
6. the three warm campanile apertures → **one unlit open belfry** with a dark bronze bell
   and a non-emissive cap.

**Exactly two secondary reads:** the enclosed empty basin, and the gateway/bent axis.
Arms, steps, courses, capstones, bollards, bell, ramp and flag are parts or scale cues.
No statue, crane, pavilion, garden, beacon, clock, or terminal lantern.

**Night and blur.** No `PointLight`, halo, bloom tuning, flame, smoke, beam or water road.
Two portal lamps on the ordinary lantern ember gain; one lit quay edge and at most four
narrow apertures share the existing emissive bucket and register no new water lane. Under
the ~16px blur audit the Mole must reduce to a **low dark horizontal bracket with one thin
shoulder rise**, separated from the lighthouse by a large uninterrupted dark-water
interval; the basin merges with the dark sea rather than becoming a bright courtyard. If
capstones form a pale stripe, drop their value contrast; if the portal lamps merge into a
third light road, one reflection lane stands down.

**Scale proof.** Projection is 32 × 16 tiles with world height shifting screen Y by
`worldY × 16 × √3/2 × zoom`. At the default ~96.5 view height the 21.5 cap spans ~19.3% of
viewport height against the tower's ~30.5% — the Pharos keeps ~1.58× the screen span
before counting its island seat. At the four authored attract zooms (0.76 / 0.68 / 0.74 /
0.84) the Mole projects to ~226 / 203 / 221 / 250 px against the tower's ~358 / 320 / 349 /
396 px.

**Budget (procedural, per D2):** 6,144 triangles for toe/arms/quay/court/steps/ramp/
capstones/courses/bollards/gateway/apertures, plus a ~2,800-triangle hall-and-campanile
superstructure at the same silhouette — call it **≤ 9,000 triangles all-in**, against a
current whole-station range of 468–934 and ~19,800 affordable per station. Eight visible
Mole draws maximum, all joining existing global buckets; **zero new textures**.

---

## 6. Identity system and the scale ladder

Four mechanisms, all inside existing structures:

1. **Two new archetypes** — `uogashi` and `hatago-wharf` (§4), both authored in the existing
   bucket/prop kit. `hatago-wharf` reuses `articulateIrimoya` for a main roof plus a smaller
   stepped roof over the water stair, with an open first-floor gallery (engawa posts), a
   guest-window row whose count rises with supply, a noren curtain built from two short
   cloth planes sharing the flag lane's wave phase (no new shader), and a nobori vertical
   banner. Its identity quadruple is fixed here so Phase 4 invents nothing:
   `secondLevel: "inn-gallery"`, `signature: "guest-lantern-row"` (the lantern row over the
   water stair), `flagShape: "nobori"`, `roofline: "hatago-stacked"`. `uogashi`'s quadruple
   likewise: `secondLevel: "scale-beam"`, `signature: "steelyard"`, `flagShape: "twin-tail"`,
   `roofline: "market-monopitch"`. All eight enum members are new additions to the unions at
   `src/three/garden-docks.ts:39-92` and the identity table at `:127-137`. `uogashi` is a long
   open-fronted hall on pier pilings (`pushPierPilings`), a mono-pitch roof reusing
   `articulateLeanToRoof` at hall scale, stall posts along the open front, tally boards on
   the landward wall, and one oversized steelyard (post, pivoting beam, hanging pan) built
   from five primitives into the `metal` bucket. Second level named `scale-beam`. The two
   new authors **displace** the four deleted ones (`annex-pavilion`, `salvage-slip`,
   `signal-jetty`, `gate-landing`), so the station-author count falls from 11 to 9.
2. **Per-chain accent.** Today one hardcoded `#ad3f2f` serves every station
   (`src/three/garden-docks.ts:340`). Make it a lookup into the tokens in §4. Zero new
   draws — each station already emits exactly one accent part. All chosen tokens sit at or
   below the palette chroma ceiling; `vermillion` #c23a22 stays reserved for the beacon
   flame and DEWS danger.
3. **Supply drives roof mass, not just the pier.** Today every non-Ethereum hall is a
   fixed 13 × 7 box across an 800× supply range while only the pier grows (6.61 → 13.44) —
   so the invariant's required "hull-dominant landward roof" reading of chain supply is not
   actually carried by the roof. Introduce
   `mult = 0.95 + clamp((log10(usd) − 8.5)/3.2, 0, 1) × 0.40` on length and `× 0.15` on
   height, with rendered length clamped to **[12.6, 20.0]**.
4. **Two new roof rungs** (`#56606b` slate kawara, `#6f7a5e` weathered copper) graded inside
   the existing
   `#354750`…`#c7ae72` family; trim stays rung × 0.66. Chain brand colour stays on the
   flag cloth — the sanctioned brand channel — so architecture stays dentō-shoku quiet.

**The Mole is exempt from supply scaling.** Its geometry is an authored monumental
composition (24 × 10 hall, ≤40 × 34 envelope, 21.5 cap), not a data-driven mass, so it
renders at its base size always. This is what makes the lead safe: without the exemption
and the 20.0 ceiling, a 16.0-base station at ×1.35 would reach 21.6 and a naive reading of
§5 would let the Mole itself swell to 32.4. Ethereum's own supply still reads through every
existing channel (pier and quay length, flag scale, window count, dock size).

**Scale ladder.** `base L` is the authored constant a test pins; `rend L` is what the
realistic feed produces through the multiplier above.

| chain | archetype | base L | span | area | 2nd-level T | mult | rend L |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ethereum | `ethereum-mole` | 24.0 | 10.0 | 240.0 | **21.5** | exempt | **24.0** |
| tron | `stepped-inlet` | 16.0 | 7.8 | 124.8 | 9.4 | 1.237 | 19.8 |
| solana | `fishing-pier` | 15.4 | 6.7 | 103.2 | 8.3 | 1.150 | 17.7 |
| bsc | `tea-house-quay` | 15.0 | 7.4 | 111.0 | 10.7 | 1.125 | 16.9 |
| base | `hatago-wharf` | 14.6 | 6.6 | 96.4 | 11.8 | 1.147 | 16.8 |
| hyperliquid | `uogashi` | 14.2 | 7.8 | 110.8 | 7.2 | 1.081 | 15.3 |
| arbitrum | `storm-mole` | 13.4 | 8.8 | 117.9 | 12.1 | 1.094 | 14.7 |
| polygon | `reed-boathouse` | 13.6 | 6.0 | 81.6 | 11.2 | 1.062 | 14.4 |
| ton | `pigeonnier-islet` | 12.6 | 5.6 | 70.6 | 8.6 | 1.035 | 13.0 |

- **Ethereum leads by 1.21×** the largest station (24.0 vs 19.8) under the realistic feed,
  and the 20.0 ceiling guarantees ≥1.20× under any feed.
- **Rendered ordering tracks supply exactly**: ethereum, tron, solana, bsc, base,
  hyperliquid, arbitrum, polygon, ton. The acceptance test asserts rendered-length ordering
  on the dense fixture, not base ordering.
- The smallest base L is 12.6 — the repo's own pinned operationalisation of "primary roof
  ≥ 2× an ordinary hull" (`src/three/garden-docks.test.ts:74-78`; the modal bezaisen hull
  is 6.93 units).
- **Differentiation check:** of the 36 archetype pairs, **zero** sit within 10% on *both*
  footprint area and second-level height. Five tightest surviving margins: 11.2% / 11.6% /
  12.1% / 12.6% / 13.3%. Today **19 of 55 pairs fail** that check, all at Δfootprint 0.0%.
- Height-band crowding is fixed at the same time: today seven of eleven second levels sit
  inside one 1.5-unit shelf (8.06–9.60). The ladder above spreads stations across
  **7.2–12.1** with the Mole alone at 21.5.

---

## 7. The three.js programme (r185, authoring upgrade — not a renderer upgrade)

The current published release **is** r185 / npm `0.185.1`; nothing has shipped since this
repo's pin. r186 exists only as development-branch migration notes and must not be planned
against. So the right programme is **deepen silhouette, panel breaks, edge catches,
grounding and restrained emissive inside the existing recipe/bucket system** — every API
needed is already present.

**Rejected, with reasons:**

1. **WebGPU / TSL / RenderPipeline migration.** Forbidden by the renderer-switch rule, and
   the prior spike measured the real bill: 16 classic `ShaderMaterial`s, 1,725 GLSL lines,
   nine `onBeforeCompile` patches, plus no production path for the pmndrs post stack and
   N8AO. r185's GTAO/SSGI/clustered-lighting work removes none of it.
2. **Wholesale `RoundedBoxGeometry` / bevel everything.** Measured at r185: `BoxGeometry`
   12 triangles, `RoundedBoxGeometry` **108** at segment 1 and **300** at segment 2 — a
   9–25× increase applied to a file built out of boxes, and it makes every material
   equally soft.
3. **Unique GLB buildings and per-harbor PBR texture sets.** Procedural geometry owns
   harbors; eight unique texture sets would also defeat atlas batching and spend the
   29-texture headroom on detail invisible at overview.
4. **Transmissive glass and anisotropic spectacle as identity** — photoreal material
   language, nothing for the whole-map silhouette.
5. **A new outline / post edge pass** — the post chain is signed off, offscreen passes
   count against the census, and an outline would compete with the haze/bokashi vocabulary.
6. **Station impostors as the first LOD** — rim buildings are inspected from varying
   bearings and *are* the plate silhouette; existing fine-detail shedding buys the saving
   without billboard popping.
7. **`BatchedMesh` conversion** — draw-neutral and CPU/memory-heavier for seven static
   merged buckets. It only earns its place if per-station visibility must vary *inside* a
   bucket.

**Adopted, ranked, with budget deltas** (planning estimates `[INFERENCE]`; acceptance is
the operator's `npm run preview`):

| # | Technique | Gain | Delta | Risk / mitigation |
| --- | --- | --- | --- | --- |
| 1 | **Silhouette-first massing and negative space** — a limited kit of massing modules (podium, hall, tower, gate, shed, stepped seawall) per station, each with a different dominant height rhythm and one negative-space cut | Very high; the whole "recognizable at distance" goal | +0 draws, +8–18k tri, +0 tex | Lighthouse must keep primary anchor: Mole stays lower and darker, no new precinct secondary |
| 2 | **Selective one-strip chamfers on hero edges only** — `ExtrudeGeometry` bevels for profile masses, custom chamfer strips plus `toCreasedNormals()` elsewhere; primary masses, parapets, crowns, quay nosings only | High; the specific cure for boxes reading as boxes | +0 draws, +2–4k tri | Never planks/rungs/windows/hidden joints; vary radius by material |
| 3 | **Wall and roof panelization in existing buckets** — bays, pilasters, sill/lintel bands, recessed infill, eave shadow gaps, tile courses, roof step-backs, with real 0.08–0.25 recesses | High at inspection, medium at overview | +0 draws, +4–9k tri | Must *replace* blank surface, keeping at least one calm face and roof field per station |
| 4 | **Foundation, tide line and contact integration** — real foundation overlap, waterline geometry, piles entering water, under-eave recess | Medium-high; enlarged stations stop hovering | +0 draws, +0.5–1.5k tri | Keep it structure geometry; add no water-shader term, displace redundant piling clutter |
| 5 | **Fix the overview/inspection split** — move the two genuine architectural **voids** (reed boat-bay mouth, pigeonnier entry holes) and structural ironwork out of `fineDetail` into coarse; leave true greebles (planks, bollards, rungs) fine | Medium; resolves weakness #3 at zero cost | +0 resources; still sheds 5–15k submitted tri | Update the fine-tier assertions (`garden-harbor-batch.test.ts:128-130`); only sub-silhouette greebles may shed |
| 6 | **Sparse irregular apertures in the existing ember bucket** — vary window count and shape, never brightness | Medium; inhabits each structure | +0 draws, +0.1–0.5k tri | Directly touches the one-dominant-light rule: thin windows before dimming, never a brighter Mole material |
| 7 | **One neutral trim/mark atlas — only after the geometry pass proves it necessary** | Medium at inspection | +1 tex, +0 tri, +0 draws *if* every bucket UV is compatible | Palette authority: neutral/value-only, colours still from `HARBOR_PALETTE`; displaces literal micro-crack geometry |
| 8 | **Keep the existing half-res N8AO**; add restrained geometry-local cavity value only where it misses | Medium | +0 all | Do not raise global AO for harbors; do not bake AO into vertices the runtime recolours |

**Combined upper case (planning estimate):** ~**+0–1 draws, +14.6k–33.5k triangles,
+1 texture** → roughly 256–257 draws / 349.7k–368.6k triangles / 44 textures, against
ceilings of 700 / 500,000 / 72. Comfortable, and headroom is not a spending target.

**Amended after measurement (2026-09-04): +2 draws, not +0–1.** The harbor layer measured
14 drawables before this epic and **16** after. The two additions are `harbor-accent` and
`harbor-metal`, and both are load-bearing consequences of changes this plan itself mandates:
`harbor-accent` is the per-chain architectural accent bucket §6 requires (previously the
accent geometry was empty because every station shared one hardcoded hex), and
`harbor-metal` is the coarse structural-ironwork tier §7 rank 5 requires (the metal bucket
was entirely `fineDetail`, so the ironwork and the two architectural voids were invisible at
cruise). Merging either into a neighbouring bucket would erase a real material policy —
accent carries the runtime recolour contract and flat-shaded DoubleSide roughness 0.86;
metal carries metalness 0.42 / roughness 0.62 — so the honest resolution is to amend the
estimate rather than merge for the sake of the number. The layer sits at 16 against its
retained 20-draw backstop and a 700-draw hard ceiling, with the whole recorded frame at
~256. `garden-harbor-batch.test.ts` now pins the exact 16 by name so the next change to
bucket population is caught rather than drifting under a generous cap.

Design each station at **three scales**: blurred-frame silhouette, overview-visible
structural breaks, inspection-only greebles. The first two never tier out; only the third
uses `fineDetail`.

---

## 8. Latent defects this work must fix (found during research, all pre-existing)

| # | Defect | Evidence | Fix |
| --- | --- | --- | --- |
| **L1** | **Ghost moorings.** `GARDEN_STATION_LEG_TILES = 96` is not a planning constant — it is the *display* motion cap applied to every rendered ship. Worst anchor→mouth legs today already measure 145.3 / 143.7 / 138.8 / 179.7 tiles, so state and the detail panel say "moored" while the hull renders up to 84 tiles short. A full-rim ring makes >96 the norm. | `src/systems/garden-observatory-slice.ts:40`, `:289-291`, worst-case legs computed by Lane G | Exempt moored/arriving/departing from the cap, mirroring the existing `includeDocks` exemption at `:315-317`. Motion *cadence* needs no change: any plate-corner leg still fits 2 × ≤121 s legs, cycle ≤1320 s, ≤0.8 tiles/s. |
| **L2** | **Dock exclusion radius is a fixed r = 2.2 circle** per mouth tile while a max station already renders ~15.7 tiles long — and the Mole will be 28 tiles. | `src/systems/garden-water-exclusion.ts:111-115` vs `src/three/garden-docks.ts:291` | Derive the radius from the station footprint. For the Mole, exclude **arms and hall only** — the basin is navigable water by design. |
| **L3** | **The calm mask is a dormant trap.** The exported `gardenHarborCalmMask` computes one bounding ellipse over all docks, clamped to 18 × 13; measured on the *current* fill it is already saturated at both maxima and dragged to (107, 113), covering 0 of 8 harbors. The renderer never calls it. | `src/three/garden-docks.ts:1819-1841`; `src/three/world-renderer.ts:2985-3017` | Per D6: delete the dead export, seat the single mask on the Mole basin. |
| **L4** | **The landing frame is hard-coded to the west precinct** (`offsetX + width × 0.06`, comment "Bring the deep lower-left Ethereum precinct into the picture"). | `src/systems/camera.ts:70-81`, pinned at `src/systems/camera.test.ts:69-81` | Re-derive for (15,95), 21 tiles further south, and update the pins. |
| **L5** | **`aptos` and `avalanche` collide on one slot**, resolved by USD sort order — so one of them gets a wreck-salvage image and the other lands on the ledger shore by accident. | `src/systems/world-layout.ts:144-145` | Delete both preferred entries. Neither chain has a private form in the 8-mouth ring; when either ranks in the eight it falls to `firstOpenSlot` and wears the freed mouth's archetype (§4 coverage). The collision disappears with the entries. |
| **L6** | **Today's apparent correctness is coincidence — the four-way reproduced through the real modules by Lane N.** With canonical `hyperliquid`: the preferred slot **hits** (danger-gorge) but the flag dye **misses** and falls back to the `#ad3f2f` health accent, losing the one sanctioned per-chain brand channel. With raw `hyperliquid-l1`: the dye **hits** (`#97fce4`) but the slot **misses** and the chain lands on `watch-south-reed` wearing `reed-boathouse`. Which half breaks is feed-dependent, and the new `uogashi` binding inherits whichever it is. | `src/three/garden-chain-flag.ts:192` (dye table keyed on the alias); `shared/lib/chains.ts:110` (alias); `src/systems/pharosville-world/stages/world-scaffold.ts:394-395` (the un-normalized boundary) | Normalize at the D8 boundary **and** retarget `CHAIN_FLAG_FIELD` to `hyperliquid`. **Leave `VENDORED_CHAIN_MARKS` (`src/systems/chain-docks.ts:110-122`) alone** — Lane N confirms it is the *only* slug consumer and is rename-safe (the SVG rewrite fires under both ids). `LEGACY_STATION_BY_CHAIN` is dual-keyed; its `-l1` entry becomes dead and is a Phase 3 cleanup. Gate with a real-feed identity check asserting both resolved berth and resolved dye for every named chain. |
| **L7** | **`RUNTIME_FACTS.md` publishes garbage today — confirmed.** `docs/pharosville/RUNTIME_FACTS.md:123` reads `Preferred chain IDs: x, cove, id, body, tile, seawardBearing, width, type` — those are the slot object's *keys*, not chain ids. The generator scrapes `PREFERRED_DOCK_TILES` with an object-literal regex that no longer matches its `Object.fromEntries` form, and `npm run validate:docs` still passes because the check only compares generator output to the committed file, so a broken extraction is self-consistent. | `scripts/pharosville/generate-runtime-facts.mjs:237-244`; observed at `docs/pharosville/RUNTIME_FACTS.md:123` | Rewrite the extraction against the current shape and regenerate. The redistribution changes this list anyway, so it must be fixed in the same pass rather than publishing a second wrong generation. |
| **L8** | **`dockHarborGroupLabel` will start lying** — "Ethereum precinct annex" is false once the annexes disperse. | `src/systems/detail-model.ts:196-201` | Reword with the cutover. |
| **L9** | **Dead constants and tautological pins.** `SOLANA_HARBOR_DOCK_TILE` is referenced only by its own definition; `BASE_HARBOR_DOCK_TILE` / `HYPERLIQUID_HARBOR_DOCK_TILE` are consumed only by pins that compare an array element to the constant derived from that same element. | `src/systems/world-layout.ts:118,122,124`; `src/systems/world-layout.test.ts:282,287` | Delete constants and pins (repo policy: a test that pins nothing observable is deleted, not re-pinned). |
| **L10** | **Precinct bridges vanish silently** outside a 1–20.5 tile span. | `src/three/garden-docks.ts:1513-1516` | Moot — bridges are deleted entirely (D1). |
| **L11** | **Every spread mouth sits inside a risk-anchor field** (E↔watch 5.0, S↔watch 9.2, N↔warning 10.0, W↔calm 9.2 tiles) and risk-tile placement ignores dock circles entirely, while the berth occupied-set ignores anchorages. | `src/systems/risk-water-placement.ts:17`; `dock-assignment.ts:187` | Feed the station footprints into risk placement, or nudge the affected anchorages. |
| **L12** | **A raw feed id yields ZERO ship moorings at that harbour** — the defect that outranks both halves of L6, and it was missing from this plan until the Lane N audit. `assignDockVisits` joins canonical chain presence against the raw `dock.chainId`, so `homeDockChainId` resolves `null` and the harbour renders with no ships ever mooring at it. Reproduced: **0 visits under a raw id versus 1 under the normalized id.** | `src/systems/pharosville-world/stages/dock-assignment.ts:186,200,229` | Healed by the D8 boundary — no separate fix, but it is the strongest reason the boundary is required rather than cosmetic, and the Phase 2 acceptance ("a moored ship at every one of the 9 berths") is exactly its gate. |
| **L13** | **The mint-burn scope join bypasses the scaffold boundary.** `scope.chainIds` is matched against `dock.chainId` with no normalizer. Today raw-vs-raw happens to match, so **canonicalising docks alone would newly darken cargo tides** at an aliased chain — a partial fix actively regresses it. | `src/three/garden-cargo-tide.ts:188-194` | Either normalize `scope.chainIds` at the same boundary or prove the upstream mint-burn payload already emits canonical ids; do not leave it to raw-vs-raw luck. |
| **L14** | **`OP Mainnet` is a second hard alias victim, and it interacts with suppression.** Un-normalized it escapes `SUPPRESSED_CHAIN_HARBOR_IDS` (`src/systems/chain-docks.ts:17`) **and** consumes a harbor slot — so a chain the world deliberately hides can occupy one of the eight mouths. Reproduced; the D8 boundary fixes it. The remaining seven aliases touch only soft consumers (label fallback, off-site link). | `shared/lib/chains.ts:109-120`; `src/systems/chain-docks.ts:17,163-168` | Same boundary. Assert the suppression set against canonical ids in the Phase 1 coverage test. Live payload vocabulary beyond `hyperliquid-l1` is `[INFERENCE]` — confirm with `npm run smoke:api-local`. |

---

## 9. Contract amendments (operator sign-off required)

Each is a sentence this plan intentionally changes. Nothing else in
`docs/pharosville/VISUAL_INVARIANTS.md` moves.

1. **`:56-58`** — "outside the Ethereum precinct no three stations sit within 30 tiles" →
   drop the exemption; the rule becomes global. *Trade:* the exemption is the licence the
   cluster was built on; the ring satisfies the rule globally (verified, 0 trios).
2. **`:71-74`** — "Ethereum's hall and true campanile … read with its L2 belvederes as one
   precinct through thick railed, covered bridges" → **"The Ethereum Mole stands alone as
   the ring's civic monument; L2 stations are self-standing distant harbors."**
3. **`:89-90`** — "the Ethereum precinct has a shared path and bridge-connected annexes" →
   deleted, replaced by the same sentence as (2).
4. **`:61-66`** — "second-level silhouettes now span roughly 7.2–12.4 world units with the
   Ethereum campanile the tallest" → **"7.2–12.1 for chain stations, the Ethereum Mole
   excepted at a 21.5 local cap (≤21.7 above water)."** *Trade:* the Mole must out-scale
   every station to be a landmark at all; the cap keeps it at 63% of the tower.
5. **World-encoding table, Harbor row** — add per-chain accent and supply-driven roof mass
   as the required supply channel; note that the Mole's basin, courses and capstones are
   decorative and carry no analytical meaning.
6. **`:53-58`** — "Harbors are shore stations sited in their body's named rim coves" keeps
   every quantitative floor; only the mouth inventory shrinks, so the twelve-cove /
   eight-harbor arithmetic becomes eight coves for eight harbors. **The north limit stays a
   maximum**: "at most two rendered stations at or north of y=30" is unchanged, and the ring
   simply happens to author one north mouth. Do **not** rewrite it as "exactly one" — that
   would turn a ceiling into a floor and make a sparse feed, which may render zero northern
   stations, fail a contract it does not violate. *Trade:* none.
7. **Attract postcards** — deferred by the operator (2026-09-04): implement the ring first,
   then judge from a real-GPU preview whether any of the four signed-off framings is worth
   re-pointing at the north-east arc. Not a plan item; revisit after Phase 6.
8. **`:73-75`** — "the vermilion double-lintel torii and every other upper archetype remain
   nameable from the default camera" → drop the torii clause; the sentence becomes "every
   upper archetype remains nameable from the default camera." **Authorised by the operator
   (2026-09-04): "that red gate? you can remove it."** *Trade:* the **station** torii goes —
   the inline gate and shide geometry at `src/three/garden-docks.ts:752-792` — and `base`
   gains the `hatago-wharf` inn instead (D7). **The world keeps its other torii:**
   `createGardenIslets` renders a decorative one from its own authored geometry
   (`src/three/garden-islets.ts:18,213-221`; `src/three/garden-torii.ts:139-159`) and MUST
   NOT be touched. The nameability requirement itself is untouched, and no other invariant
   names a specific archetype. Amend the clause to say "the station landing torii", not
   "the world's only torii".

**No density amendment is required.** The rendered harbor count stays 8 + TON, so the
attention-displacement contract (`:228-234`) is satisfied without argument: this plan
*replaces* nine stations with nine stations, three of which were clones of one form.

**Operator decisions of record (2026-09-04):** ring stays at 8 mouths / 6 sea bodies, so
the Alert Channel keeps no harbor (§13.1 closed); the Mole takes site **(15,95)**;
`gate-landing` is deleted and `base` takes `hatago-wharf`; attract postcards deferred to
post-Phase-6 preview; execution begins at Phase 0.

### Gate surface

**Preserve** (these implement contracts the plan keeps): the rim-spread contract
(`chain-docks.test.ts:152-245`, minus the precinct clauses), cove geometry gates
(`world-layout.test.ts:289-296,300,311-312`, `garden-rim.test.ts:226-264`), grave
clearance (`world-layout.test.ts:398`), the outer `x > 30` rule (`:168` — the reason
(31,125) was chosen over (30,125)), silhouette minimums and "Ethereum largest, sole bell
tower" (`garden-docks.test.ts:57-89,131-143`), the ≤20-drawable batch ceiling
(`garden-harbor-batch.test.ts:60-66`), LOD name shedding, the water-exclusion mirror test,
berth locality, the pigeonnier ninth-dock gates, and the browser-level rendered-dock-id
list (`tests/visual/pharosville.spec.ts:384-395`).

**Amend** (the contract itself changes): `DOCK_TILES` and `RIM_COVES` length 12 → 8; the
four precinct-membership and precinct-geometry assertions
(`chain-docks.test.ts:85-113,166,215-230`); the generic-eight length `:140` and tile-list
equality `:364` (now eight outer-plus-mole slots); the second-level band; the bridge-span
gate (no pair left to span); the north-arc count (now exactly one authored north mouth);
the archetype roster in `garden-docks.test.ts` (11 → 9 types); **the authoritative
`DockNode.station.type` union in `src/systems/world-types.ts:410-421`**, which independently
lists all four retired names; and **both fixture rosters in
`src/three/garden-harbor-batch.test.ts:11-18`** (the nine-dock set and the all-archetype
set) plus the station name in `src/three/__fixtures__/harbor.ts:33`.
The immediate-landward anchoring assertion in
`chain-docks.test.ts:57-59` becomes the documented ≤14-tile rim-land predicate (matching the
slot loop in `world-layout.test.ts:285-288`, open water still required immediately seaward):
the eight shore stations stay pinned to rim land at exactly one tile landward, and the
ethereum mole is exempt by design — its §5 off-shore foot leaves the promontory two tiles
landward so the superstructure rises from its own quay without borrowing rim land.

**Delete** (pins nothing observable): `world-layout.test.ts:282,287` and the three dead
tile constants (L9).

**Add** (new contracts this plan introduces):
- **Ring coverage under the cap** — for any eight-chain selection **that contains
  `ethereum`**, all eight rim mouths bind and each keeps its slot's archetype (§4). The
  precondition is required, not cosmetic: the Mole sits in the EVM-bay pool only
  (`src/systems/chain-docks.ts:192-200`), so a selection without `ethereum` leaves it empty
  and yields at most seven outer docks. Without the qualifier this gate is impossible to
  satisfy. **Sparse or degraded feeds** assert only what holds of them: every rendered dock
  on a valid assigned mouth with that mouth's archetype, no three rendered stations within
  30 tiles, and TON present iff its supply is non-zero. They are **never** asserted for
  universal fill or for **arc coverage** — a feed of fewer than four eligible chains cannot
  inhabit four arcs, and one without `ethereum` cannot fill the Mole at all. The existing
  north limit stays a *maximum* of two rather than becoming an unconditional "exactly one".
- **Rendered-length ordering** follows supply on the ≥8-eligible-including-`ethereum` dense
  fixture, with the Mole exempt and stations clamped to [12.6, 20.0] (§6).

**One open verification** `[INFERENCE]`: seawall-barrier regeneration
(`world-layout.test.ts:316-322`) was not inspected. The new mouths are
water-cardinally-adjacent-to-land exactly like the retired ones, so it likely auto-adapts —
must be re-run, not assumed.

---

## 10. Phases

Ordered by dependency. Each phase is verified before the next; nothing advances on red.

**Phase 0 — Contract.** **First, fix the impossible workspace rule:** `AGENTS.md:11`
requires all work under `/home/ahirice/Documents/git/pharosville`, a path that does not
exist on this Darwin workstation. The authorized checkout is
`/Users/ahirice/Documents/git/pharosville` and its remote matches the canonical
`TokenBrice/pharosville.git` named at `AGENTS.md:12-13`. Replace that line with the real
path (or a platform-neutral repository-root rule) — an implementer literally cannot run a
command without it. Then apply the §9 amendments to `VISUAL_INVARIANTS.md` and the affected
route docs. Must precede code so tests are rewritten against a stated contract rather than
retrofitted to whatever the code does.
*Accept:* `npm run validate:docs` green; every amended sentence traceable to a §9 entry;
`AGENTS.md` names a path that exists.

**Phase 1 — The ring.** `RIM_COVES` → the 8 mouths (§3). `EVM_BAY_STATION_SLOTS` → one slot
(`ethereum-mole`); `OUTER_HARBOR_STATION_SLOTS` → seven, ordered so the first four are all
x > 30 with ≥2 southern. `PREFERRED_DOCK_STATIONS` → the §4 binding; delete the
`aptos`/`avalanche` entries (L5). `ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS` → `["ethereum"]`.
`MAX_CHAIN_HARBORS` unchanged at 8. Canonicalise chain ids at the D8 boundary, **retaining
the raw id for anything `resolveChainId` does not recognise** (`?? id`) so an unlisted live
chain is never dropped from harbor eligibility or the supply totals. Delete the four
retired coves, `wreck-salvage-cut`, `wreck-west-ledge`, and the dead tile constants.
*Accept:* on a **≥8-eligible-including-`ethereum` dense fixture** the §4 verification
reproduces from the real `buildChainDocks` — 0 trios ≤30, N=1, S=4, four arcs, x 9–132,
6 bodies, 49° max closed-rim hole. **Coverage holds across feeds whose top-8 membership
changes** (all eight mouths bind, each with its slot's archetype) for every selection
containing `ethereum` (§4). **Degraded/sparse feeds** assert only valid assigned mouths,
the no-trio rule, and TON-iff-supply — never universal fill and never arc coverage. The
focused normalization test MUST cover: an aliased id (`hyperliquid-l1`), an **unrecognised**
id (retained, still eligible), the `OP Mainnet` suppression case (L14), and both spellings
present at once (dedupe policy, `chain-docks.ts:163-168`). **Also in this phase, normalize
the mint-burn scope (L13):** `buildCargoTideStage` builds `scope.chainIds` straight from the
payload and intersects it with canonical `dock.chainId`
(`src/systems/pharosville-world/stages/cargo-tide.ts:176-194`), so after this cutover an
aliased scope would mark the canonical Hyperliquid harbor untracked. Gate it with an
observable cargo-tide assertion under an aliased scope, and make the alias case also
exercise `assignDockVisits` — the generic "a moored ship at every berth" check does not
prove L12 for an aliased feed. Amended
`chain-docks.test.ts` / `world-layout.test.ts` green — note the
pigeonnier gates stay valid unchanged, since 8 standard docks + TON is still the ninth dock
(`chain-docks.test.ts:368-385,408-426`). Seawall-barrier assertion re-run (Lane V: min
clearance 47.2 tiles, structurally insensitive to rim authoring).

**Phase 2 — Systems the move breaks.** L1 leg-cap exemption, L3 calm-mask cutover, L4
landing frame, L8 label rewording, L11 risk-anchor interaction. **Introduce the
systems-owned station footprint first** (R4): `stationFootprint(slot, size)` in
`src/systems/dock-layout.ts`, exposed on `DockNode.station`, replacing the fixed r = 2.2
dock circle (L2). Then make every geometry owner consume it — ship exclusion
(`src/systems/garden-water-exclusion.ts:111-115`), risk placement
(`src/systems/risk-water-placement.ts:17`), sea-edge site siting
(`src/systems/garden-sea-edge-sites.ts:240-251`) and rim-mesh
path/pine/stone/bay-excursion clearance (`src/three/garden-rim-mesh.ts:248-252,517-520,777-805`),
the last of which reads the systems value rather than the renderer recipe. With every
station enlarged and the Mole at 40 × 34 world units, cove-width clearance no longer bounds
the structure. Because the footprint is authored in `src/systems`, this phase lands before
the Mole recipe exists in Phase 3 — the Mole's entry is a slot-type dimension, and
`authorDock` asserts against it in Phase 3.
*Accept:* focused `npm test -- src/systems`; no ship reports moored while rendering
off-berth; `camera.test.ts` re-pinned to the new frame; a moored ship at every one of the 9
berths; no sea-edge stele, rim path, pine or stone intersecting a station footprint.

**Phase 3 — The Ethereum Mole.** Author the §5 spec procedurally. **Rename the station type
`boathouse-precinct` → `ethereum-mole` across every type-indexed registry and fallback** —
`StationType`, `StationSignature`, `StationRoofline`, `StationSecondLevel`,
`StationFlagShape`, `STATION_TYPES`, `STATION_IDENTITY`, `STATION_AUTHORS`,
`STATION_ROOF_COLOR`, `STATION_SPAN_SCALE`, `stationFlagPlacement`,
`LEGACY_STATION_BY_CHAIN`, `fallbackStationType`, the slot tables, **the authoritative
`DockNode.station.type` union (`src/systems/world-types.ts:410-421`)**, **both fixture
rosters in `src/three/garden-harbor-batch.test.ts:11-18`**, and the station name in
`src/three/__fixtures__/harbor.ts:33`. Delete
`authorPrecinctBridge` and its batch call site (`src/three/garden-harbor-batch.ts:149-157`).
**Delete the second, independent bridge producer:** `createGardenHarborDistricts` finds
Ethereum plus the L2 chain ids and authors stone causeways, two lanterns per route, and
route lanes (`src/three/garden-harbor-life.ts:300-344,620-661`) — because those chain ids
still exist, those causeways would otherwise span the redistributed map. Remove the
producer and its tests.
*Accept:* cap exactly 21.5 local / ≤21.7 above water; envelope ≤40×34; basin 18×14 visible
water; arms unequal (22 vs 15); exactly two secondary reads; two portal lamps, one lit quay
edge, ≤4 apertures, zero summit emissive; ≤9,000 triangles and ≤8 draws measured through
`authorDock` + `createGardenHarborBatch`; no vermillion in any Mole part; **grep proves no
bridge, causeway, or route-lane geometry references any L2 chain id**.

**Phase 4 — Identity.** Delete `annex-pavilion`, `salvage-slip`, `signal-jetty` and
`gate-landing` (§9.8). Add `uogashi` and `hatago-wharf` across the same registry list as
Phase 3 — including `src/systems/world-types.ts:410-421` and both
`garden-harbor-batch.test.ts:11-18` rosters. Per-chain accent lookup replacing the
fixed `#ad3f2f`. Supply-driven hall mass with the Mole exempt and stations clamped to
[12.6, 20.0]. Apply the §6 ladder. **Update the non-derived copy:** the legend panel
hard-codes the connected precinct (`src/components/legend-panel.tsx:225-232`) and its test
pins that wording (`src/components/legend-panel.test.tsx:12-17`).
*Accept:* 9 archetypes, all identity quadruples distinct; zero of 36 pairs within 10% on
both footprint area and height; Ethereum ≥1.20× the largest station under any feed;
rendered-length ordering follows supply on the dense fixture; min base L ≥12.6; every roof
rung distinct; detail-panel and ledger strings derive from `dock.station.type` with no
duplicated literals; no **current-state** UI copy mentions a precinct or annexes — the
legend panel especially, which described the precinct and annexes as "one connected place".

**Amended 2026-09-04 — the rendered changelog is exempt, and its historical entries are
restored.** This clause originally required rewording
`src/content/pharosville-changelog.ts:36` because it "advertises the Ethereum campanile
precinct bridged to its annexes to users". That was a mistake of category, made when the
concern was current-state copy claiming scenery that does not exist. `changelog-panel.tsx`
renders every entry under an explicit version badge and a `<time>` element, so it is a dated
historical record, not a description of the present world — and v0.9.0 genuinely did ship the
precinct, the torii landing and the signal mast. Retconning that bullet to describe a mole
states something false about a past release, and doing it in only one of the two mirrored
surfaces would additionally break the agreement `RELEASES.md` requires.

So the v0.9.0 and v0.10.0 bullets are restored verbatim to match `CHANGELOG.md`, and the
removal is recorded where it belongs: in the v0.11.0 entry, which states that the precinct,
its annex pavilions, the connecting bridges and the station torii were replaced by the
Ethereum Mole and a distributed ring. **Leave `:52` alone** either way: its "torii grove"
refers to the still-rendered garden-islet torii, not the deleted station form.

**Phase 5 — Fidelity.** The §7 adopted programme, ranks 1–6, plus the fine-detail split fix.
Rank 7 (atlas) only if the operator's preview shows material scale still missing.
*Accept:* measured census within the **amended** +2 draws / +33.5k triangles / +1 texture of
baseline (see §7 — the +2 is `harbor-accent` and `harbor-metal`, both mandated by §6 and §7
rank 5, pinned by name);
**coarse-tier triangles per station ≤ 6,000 and the whole harbor layer ≤ 60,000** (R7);
each station's blurred silhouette distinguishable from every other; at least one calm face
and roof field per station; architectural voids visible at cruise.

**Phase 6 — Verification.** `npm run validate:changed`, then `npm test -- src/three src/systems`,
`npm run test:visual`, and `npm run validate:release` before any release claim. Then the
operator's `npm run preview` for every look and frame-time judgement — day, dusk, night,
whole-map, default landing, sailed-in, all four attract framings, and the ~16px blur audit.
If this ships as a versioned release, follow `docs/pharosville/RELEASES.md:5-9,26-31` — the
three synchronised release records, published by `.github/workflows/release.yml` after a
green `main` deploy, never by hand.

**Phase 7 — Cleanup.** L7 runtime-facts generator, L9 dead constants and tautological pins,
delete the dormant calm-mask export, remove any scratch under `outputs/`.

---

## 11. Risk register

| # | Risk | Fails in | Guard |
| --- | --- | --- | --- |
| R1 | Mole reads as a second lighthouse and steals the anchor | composition, blur audit | 21.5 cap enforced by test; no summit emissive (assert zero emissive geometry above local Y 15.0); opposite-in-kind form. **Objective blur threshold:** at 16px blur the Pharos crown must remain the single brightest connected region, and the Mole's mean luminance must stay below it by ≥25% — measured on an operator preview capture, not asserted |
| R2 | Ghost moorings across the wider ring | `motion.test.ts`, visible hulls | L1 exemption in Phase 2, before Phase 3 |
| R3 | Enlarged stations read as a marina, not a garden | the spacious/`ma` contract | Station count unchanged at 9 (D5); 0 trios ≤30; 49° `ma` preserved. **Objective threshold:** the largest empty circle inside each sea body may not shrink by more than 10% versus baseline, measured by the existing `garden-fleet-placement.test.ts` largest-empty-circle helper |
| R4 | Enlarged footprints collide with anchorages, risk fields, or rim scenery | `garden-fleet-placement.test.ts`, `risk-water-placement`, `garden-sea-edge-sites`, `garden-rim-mesh` | **Specified fix, systems-owned:** add an authoritative oriented footprint to the **system-side** station contract — `stationFootprint(slot, size)` in `src/systems/dock-layout.ts`, derived from the slot type and dock size and exposed on `DockNode.station` — and have ship exclusion, risk placement, sea-edge siting and rim-mesh clearance all consume *that*. `authorDock` then **consumes or asserts** the same dimensions instead of `src/systems` depending on `src/three`. This preserves the documented boundary (`docs/pharosville/THREEJS_AGENT_REFERENCE.md:9-12` puts placement and risk semantics in `src/systems`, presentation recipes in `garden-docks.ts`) and lets Phase 2 land before the Mole recipe exists in Phase 3. Gate: no anchorage, risk tile, stele, path, pine or stone inside any station footprint |
| R5 | Mole arms encroach on the cemetery scatter | `world-layout.test.ts:398` | **Cleared by measurement.** Lane V computed the real footprint x[1..29] × y[83..107] (725 tiles): nearest grave **9.19 tiles**, well past the 3.25 threshold (the real minimum grave y is 116.19, not the ≈113 an earlier draft assumed). Headroom: the envelope's south edge may reach y = 112.9 before any grave closes to 3.25. Re-run against the footprint if the arms lengthen |
| R6 | Per-chain accent breaks the runtime recolour path | `setDockAccent` vertex ranges | Keep one accent part per station; re-test the accent retarget |
| R7 | Fine-detail unhide inflates the submitted triangle count at overview | draw census | **Specified ceiling:** coarse-tier ≤6,000 triangles per station and ≤60,000 for the layer (Phase 5 acceptance). Only the two architectural voids and structural ironwork move to coarse; planks, bollards and rungs stay fine |
| R8 | Route-pulse endpoints run off-plate for east-arc stations (+30 world units seaward) | visual lane | Clamp the pulse endpoint to plate bounds |
| R9 | Upstream reports a chain key that `CHAIN_ALIASES` does not cover, so a station silently loses its preferred berth or flag dye | `stationSlotForChain` / `CHAIN_FLAG_FIELD` miss, no error | Normalize at ingestion (D8) and assert the canonical id set in a focused test; `npm run smoke:api-local` to confirm the live keys |
| R10 | Sticky-berth churn on first load after the move (holds are keyed on the dock tile) | none — self-invalidating | Accept: one refresh of churn, no corruption |
| R11 | A retired archetype or cove id survives in a registry, fallback or fixture and resurrects a dead form | `garden-docks.ts` type maps, `src/systems/world-types.ts:410-421`, `src/three/__fixtures__/harbor.ts`, `src/three/garden-harbor-batch.test.ts:11-18`, `LEGACY_STATION_BY_CHAIN`, `fallbackStationType` | Two checks. **(1)** Enumerate `STATION_TYPES` in a test and assert it equals exactly the 9 authored types, and assert `RIM_COVES` ids equal exactly the 8 authored mouths — this is the real guard, and it is self-verifying. **(2)** A scoped grep for each retired id (`boathouse-precinct`, `annex-pavilion`, `salvage-slip`, `signal-jetty`, `gate-landing`, `ethereum-precinct`, `base-annex`, `arbitrum-annex`, `optimism-annex`, `alert-signal-jetty`, `wreck-salvage-cut`, `wreck-west-ledge`) over **`src/**` and `tests/**` only**. It MUST NOT scan `agents/**` or `docs/**`: this plan and the route docs deliberately name every retired id, so an unscoped repo-wide "zero hits" assertion contradicts itself and would fail on its own specification |

---

## 12. What this delivers against the brief

| Operator ask | Delivered by | Measured outcome |
| --- | --- | --- |
| "distribute the harbors all around the area" | §3 ring | largest station-free closed-rim arc **111° → 49°**; trios within 30 tiles **4 → 0**; W-arc mouths **6 of 12 → 2 of 8**; all four arcs inhabited on the ≥8-eligible-including-`ethereum` dense fixture — the production case (§9). Sparse feeds render fewer stations and are gated only on valid assigned mouths, the no-trio rule and TON-iff-supply; four-arc coverage is not asserted of them, because a feed of fewer than four chains cannot satisfy it |
| "not concentrated left of the lighthouse" | §4 binding | other stations within 30 tiles of Ethereum **3 → 0**; nearest mouth to the Mole **21 → 34 tiles** |
| "Ethereum feels like its own special landmark" | §5 Mole | height vs Pharos **36% → 63%**; neighbours within 30 tiles **3 → 0**; clear approach **47 → 117 tiles**; leads the largest station **1.21×**; one enclosing civic mole with basin, gate and campanile |
| "each given a proper and recognizable identity" | §4 + §6 | 9 distinct archetypes for 9 berths, all three clone/homeless forms deleted, per-chain accent, pairs within 10% on both axes **19 of 55 → 0 of 36** |
| "increase their size and rework them" | §6 ladder + §7 | base hall length **13.0–13.4 → 12.6–16.0** for the eight ordinary stations and **24.0** for the Mole; rendered **13.0–19.8** plus the Mole; per-station triangles **468–934 → ~2–6k for the eight stations and ≤9,000 for the Mole** (§5), still far inside the ceiling |
| "buildings feel weak" | §7 ranks 1–6 | silhouette-first massing, hero-edge chamfers, panelization, ground contact, and the fine-detail fix that makes existing detail visible at all |
| "state of the art Sept 2026 three.js" | §7 | r185 is current; the honest answer is an authoring upgrade, with WebGPU/TSL, rounded-box beveling, GLB buildings, transmission, outline passes and impostors explicitly rejected on measured grounds |

**Station count is unchanged at 9 (8 + TON), so nothing in this plan spends new attention
budget.** The three deleted archetypes, four retired cluster mouths, two consolidated
south-west mouths, all Ethereum→L2 bridges and causeways, and one precinct lamp are the
displacement ledger; the Mole, the one new form, and the fidelity programme are what they
pay for.

---

## 13. Open questions for the operator

1. **Optional concentration sharpening** — berth occupancy (share of quay bollards carrying
   a moored tender light rising with HHI), displacing part of the continuous quay lit edge.
   The existing ⅕-of-masonry channel already satisfies parity, so this is a legibility
   upgrade, not a gap fill. **This is the only question still open** — the Alert-body
   omission, the Mole site and the attract postcards were all closed by the operator
   (§9 decisions of record).

---

## 14. Research index

| Lane | File | Owns |
| --- | --- | --- |
| A | `agents/research/2026-09-04-harbor-lane-a-inventory.md` | 11-archetype measured inventory, composition pipeline, life/dressing census, 12 cited weaknesses |
| B | `agents/research/2026-09-04-harbor-lane-b-geometry.md` | 762 field-verified candidate mouths, the ring, ASCII map, assertion-by-assertion breakage, Mole siting |
| C | `agents/research/2026-09-04-harbor-lane-c-ethereum.md` | Pharos landmark grammar, full Mole spec, displacement list, scale proof, budget |
| D | `agents/research/2026-09-04-harbor-lane-d-identity.md` | per-chain identity, palette mechanics, parity map, scale ladder, differentiation check |
| E | `agents/research/2026-09-04-harbor-lane-e-threejs-sota.md` | r185 version reality, 13 technique blocks, 6 cited reference scenes, ranked shortlist, 6 rejections |
| F | `agents/research/2026-09-04-harbor-lane-f-budget.md` | coupling table, classified gate surface, measured per-station cost and headroom, verification recipe |
| G | `agents/research/2026-09-04-harbor-lane-g-systems.md` | voyage legs, exclusion/calm-mask analysis, camera visibility, DOM parity, risk register |
| R1 | `agents/research/2026-09-04-harbor-plan-review.md` | first contract review (pre-rewrite draft): unnamed invariant conflicts, internal contradictions, density verdict, forgotten consumers |
| R2 | `agents/research/2026-09-04-harbor-plan-review-final.md` | second contract review, of this final revision: coverage-gate impossibility, systems/renderer footprint boundary, incomplete type cutover, stale triangle range |
| V | `agents/research/2026-09-04-harbor-plan-verification.md` | machine verification against the real modules: 8/8 mouths field-verified, seawall question resolved, coverage across rotating feeds, Mole footprint clearance, calm-mask arithmetic |
| N | `agents/research/2026-09-04-harbor-chain-id-audit.md` | chain-id consumer audit: canonical/raw/slug classification, single-boundary sufficiency verdict, four-way reproduction, other alias victims |

Lane digests were arbitrated by the orchestrator where they conflicted; §2 records every
override and its reason. Where a lane's number was superseded, **this document is
authoritative**: Lane D's ≤16 Mole cap and its `hatago-wharf` archetype, Lane C's checked
GLB and its L2 bridge-stub dressing, Lane B's 10-mouth ring, and the first two drafts of
D5 (cap 10, then cap 8 with 10 mouths) were all cut for the reasons recorded in §2 and §3.

**Review and verification status.** Four independent passes, all applied:

- **R1** (pre-rewrite draft): eight defects, four P1 — all applied. Its density finding was
  resolved more aggressively than it recommended: the ring was cut to 8 mouths rather than
  kept at 10 with a 66° hole.
- **R2** (this revision): four defects, two P1 — all applied. The coverage gate now carries
  its `ethereum` precondition, the station footprint moved to `src/systems` ownership, the
  type cutover gained `world-types.ts:410-421` plus both batch rosters and the fixture, and
  §12 reports the Mole's ≤9,000 triangles separately.
- **V**: **no FAIL.** Three documentation corrections (pigeonnier tile (125,126), min
  pairwise 6.7 tiles, real grave clearance 9.19 tiles) applied. It could not check the
  Phase 3–5 geometry budgets, which have no geometry to measure yet, nor the 762-candidate
  census, which was outside its brief.
- **N**: found **L12**, a defect outranking everything in L6 — a raw feed id yields *zero*
  ship moorings at that harbour (0 visits vs 1, reproduced) — plus the L13 cargo-tide
  bypass and the L14 `OP Mainnet` suppression escape. It also **refuted** this plan's
  earlier claim that a raw id nulls `healthFactors`/`change24hPct`/`change7dPct`: that join
  is self-consistent today and breaks only under a *partial* fix. The prescription survived;
  the symptom sentence was corrected in D8.
