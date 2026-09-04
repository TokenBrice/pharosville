# Lane D — Harbor identity: one nameable form per chain

Research lane for `agents/epic-harbor-plan.md`. Scope: give every non‑Ethereum harbor a
proper, recognizable identity. Non‑goals: Ethereum's landmark (Lane C), tile placement
(Lane B), three.js technique (Lane E).

All structural claims are cited `path:line`. Every number in §1, §2 and §7 that is not
cited was computed by running the real `authorDock` / `buildChainDocks` headless (script
and verbatim output in Appendix A); the temp file used for the run was deleted after the
run, and no `src/**` file was modified. Chain‑character statements in §3 are design
rationale from public knowledge of each chain, not repo claims. Supply figures used in
simulations are marked `[INFERENCE]`.

---

## 1. Current state — eleven chains, what they get today

Preferred mouth = `PREFERRED_DOCK_STATIONS` (`src/systems/world-layout.ts:126-146`, ton
appended at `:206`). Archetype = the slot's `type` (`world-layout.ts:82-113`). Flag
treatment = `CHAIN_FLAG_FIELD` dye + `flagShape` from `STATION_IDENTITY`
(`src/three/garden-chain-flag.ts:185-197`, `src/three/garden-docks.ts:127-139`) at staff
height/scale from `stationFlagPlacement` (`garden-docks.ts:1628-1640`; measured at size 7,
non‑precinct staff ≈ 6.16, flag scale 1.42 = the pinned `HARBOR_FLAG_SCALE_MULTIPLIER`
1.6 × (0.72 + supply·0.24); precinct staff 7.36, scale 1.95). Initials/logo:
`chainInitials` + logo upgrade (`garden-chain-flag.ts:275-344`).

| chain | preferred mouth (tile, arc) | current archetype | flag treatment | what a viewer can NAME at default framing |
| --- | --- | --- | --- | --- |
| ethereum | ethereum-precinct (14,74) W | `boathouse-precinct` (deep‑hip hall + campanile, T 12.35) | swallowtail, #627eea field, "ET" | the one big hall with a bell tower — unmistakable (`garden-docks.test.ts:113-127` pins it largest, only bell tower) |
| base | base-annex (14,81) W | `annex-pavilion` (open belvedere, T 8.75) | notched, #0052ff, "BA" | "a pavilion" — indistinguishable from arbitrum/polygon except flag cloth |
| arbitrum | arbitrum-annex (12,68) W | `annex-pavilion` | notched, #12aaff, "AR" | "a pavilion" — same roof rung #c58b55, same belvedere |
| polygon | optimism-annex (13,89) W | `annex-pavilion` | notched, #8247e5, "PO" | "a pavilion"; note its mouth is literally named after the suppressed chain optimism (`chain-docks.ts:17`, `world-layout.ts:86-88`) |
| bsc | watch-east-bay (132,80) E | `tea-house-quay` (moon-window loft, T 8.60) | chamfered, #f0b90b, "BS" | tea house with round moon window |
| tron | warning-stone-notch (118,10) N | `stepped-inlet` (crown lanterns, T 8.06) | stepped, #ff060a, "TR" | stepped stone landing under lantern crowns |
| solana | watch-south-reed (122,132) S | `reed-boathouse` (thatch A-frame + dome, T 10.00) | tapered, #9945ff, "SO" | sharp thatch gable with round dome |
| hyperliquid | danger-gorge (131,59) E | `fishing-pier` (lean-to + net rack, T 7.20) | forked, #97fce4 (keyed `hyperliquid-l1`), "HL" | low lean-to and drying racks — a fishing pier, no exchange reading |
| aptos | wreck-salvage-cut (55,129) S | `salvage-slip` (hauled hull frame, T 8.99) | dovetail, #1a1a1a, "AP" | hauled-out hull skeleton on a slipway — a *wreckyard* image on a live chain |
| avalanche | wreck-salvage-cut (55,129) S — **same slot as aptos** | `salvage-slip` when it wins the race; else fill-order `gate-landing` at ledger-fog-hook (9,54) W | dovetail or pennant, #e84142, "AV" | whichever of the two it lands on — its form is decided by sort order, not meaning |
| ton | ton-pigeonnier-islet (125,126) SE corner | `pigeonnier-islet` (cone-roof cote, T 8.55) | square, #0098ea, "TO" | round pigeon tower — the best metaphor in the set (messenger birds = Telegram) |

Measured recipe facts behind the table (size 7 / $7B, Appendix A): every non‑Ethereum
archetype shares **identical dock footprint length 10.43 and identical quay 6.75×5.59**;
primary masses are constants (13.0–13.4 × 6.8–7.3); second‑level tops span 7.20 (fishing
rack) to 12.35 (campanile). Upper silhouettes are nameable per the invariant sentence
(`docs/pharosville/VISUAL_INVARIANTS.md`, "Composition" — "the vermilion double-lintel
torii and every other upper archetype remain nameable from the default camera… second-level
silhouettes now span roughly 7.2–12.4 world units with the Ethereum campanile the tallest,
and the chain flag stays at exactly 1.6 times its former scale").

Which chains actually render is feed-driven: 4 priority slots + top-by-USD up to
`MAX_CHAIN_HARBORS = 8` (`src/systems/chain-docks.ts:14,163-179`), ton as a separate
ninth node (`chain-docks.ts:19-24,181-186`). With realistic supplies `[INFERENCE]`
(Appendix A, sim): ethereum, tron, solana, bsc, base, arbitrum, hyperliquid, polygon
render + ton; aptos/avalanche render only on deeper feeds.

---

## 2. Where identity collapses (diagnosis, quoted)

**D1 — Three L2s are the same building.** The west cluster is three copies of one
archetype, in source twice over:

> `world-layout.ts:83-85` — `{ cove: cove("base-annex"), type: "annex-pavilion" }, { cove: cove("arbitrum-annex"), type: "annex-pavilion" },` …`{ cove: cove("optimism-annex"), type: "annex-pavilion" },`

> `garden-docks.ts:144-149` (LEGACY_STATION_BY_CHAIN) — `arbitrum: "annex-pavilion", … base: "annex-pavilion", … polygon: "annex-pavilion",`

The archetype's own comment states the intent — "A roof-top open belvedere makes **every
L2** an obvious but subordinate satellite of the Ethereum hall" (`garden-docks.ts:734-735`)
— i.e. it encodes the *category* L2, not any chain. Once the plan moves base/polygon off
the west shore, that shared form stops being a "precinct" and becomes a clone row.

**D2 — Identity is assigned by fill order, not chain meaning.** For any chain whose
preferred slot is taken, the archetype is whatever sits on the first open cove:

> `chain-docks.ts:188-196` — `const primaryPool = EVM_BAY_CHAIN_IDS.has(chainId) ? EVM_BAY_STATION_SLOTS : OUTER_HARBOR_STATION_SLOTS; const pooled = firstOpenSlot(primaryPool, occupiedCoves);`

> `world-layout.ts:94-95` — "Slot order is the fill order for non-preferred chains, so the first four slots are the ones a typical top-eight binds."

So a chain's *architecture* is a property of the cove list, not of the chain. The only
chain→form map, `LEGACY_STATION_BY_CHAIN` (`garden-docks.ts:142-155`), is a fallback
("Standalone fallback until the systems branch supplies `dock.station`", `:141`).

**D3 — aptos and avalanche collide on one slot.**

> `world-layout.ts:144-145` — `aptos: OUTER_HARBOR_STATION_SLOTS[2]!, avalanche: OUTER_HARBOR_STATION_SLOTS[2]!,`

`stationSlotForChain` resolves the loser by USD sort order into fill order (D2). Measured
(Appendix A): with avalanche the larger feed entry, avalanche binds wreck-salvage-cut
(`salvage-slip`) and aptos falls through to `ledger-fog-hook`/`gate-landing` — a harbor on
the Ledger Mooring shore for a Move L1, and a *wreck-salvage* image (hauled, broken hull)
for whichever loses. Both assignments are accidents of ordering.

**D4 — The flag is the only per-chain channel.** Every material is archetype-keyed or
global: one hardcoded accent hex for **all** stations —

> `garden-docks.ts:340` — `pushMergedPart(parts, "accent", accents, "#ad3f2f", false, true);`

— and the only chain-keyed color anywhere is the flag cloth: "The cloth is dyed in the
CHAIN's own colour, so a harbour is named by its flag the way a ship is named by its sail
(F1)" (`garden-chain-flag.ts:170-184`). If the flag pixel is occluded, missed (sail
occlusion), or the atlas cell is exhausted (16 cells, `garden-chain-flag.ts:30`), chain
identity is gone. The health accent is deliberately chain-noise (`dockAccentColor`,
`garden-docks.ts:1710-1727`) and is not identity by design.

**D5 — Identical envelopes: 19 archetype pairs fail a 10% differentiation check.**
Measured at equal supply (Appendix A): all ten non‑precinct archetypes have the *same*
dock length (10.43) and quay (6.75×5.59); primary halls are hardcoded constants
(`const w = 13.4; const d = 7.0;` `garden-docks.ts:727-728`; `const w = 13;` `:799`,
`:913`). Pairwise, **19 of 55 pairs sit within 10% on both second-level height and
footprint** (e.g. annex vs tea-house: ΔH 1.7%, Δfootprint 0.0%; tea-house vs pigeonnier:
ΔH 0.6%, Δfootprint 0.0%). The only guaranteed separators are the roof hex rung and the
flag — both small-area signals.

**D6 — The roof-mass ladder is flat.** The invariant makes the "hull-dominant landward
roof" the *required* reading of chain supply (`VISUAL_INVARIANTS.md`, World encoding
table). But supply scales only the pier and quay:

> `garden-docks.ts:291-296` — `const length = 7.6 * amountScale * (precinct ? 1.5 : 1.06);` … `const quayLength = (3.6 + supply * 3.5) * (precinct ? 1.38 : 1.05);`

while every non-Ethereum hall is a fixed 13×7 box regardless of $100M or $80B (measured
ladder, Appendix A: primary L constant 13.0 across a 800× supply range; only the pier
grows 6.61→13.44). Supply reads from pier length and flag scale today, not from roof
mass.

**D7 — hyperliquid is keyed two different ways.** The preferred-slot table keys
`"hyperliquid"` (`world-layout.ts:143`) but the flag dye table keys `"hyperliquid-l1"`
(`garden-chain-flag.ts:192`); LEGACY carries both spellings (`garden-docks.ts:152-153`).
Measured (Appendix A): with feed id `hyperliquid-l1` the preferred lookup *misses* and the
chain lands on danger-gorge only because it happens to be fill slot #2 — with
`"hyperliquid"` it would instead lose its mint flag field (falls to health accent,
`garden-chain-flag.ts:199-202`). One chain id must be picked everywhere.

**D8 — ~90 unnamed chains hash into five forms.** `fallbackStationType`
(`garden-docks.ts:1623-1626`) is fine as a fallback, but it means named-chain identity
depends entirely on the slot tables remaining hand-maintained in two files (D2).

---

## 3. One identity per chain (the proposal)

Design rule: the *chain's real role in stablecoin supply* picks the form; the form is a
building type a ukiyo-e harbour would actually contain; no logo-shaped buildings. Reuse
where the fit is genuine; two new archetypes only where the set has no honest form
(base's onboarding story, hyperliquid's exchange-as-chain story). Tile placement stays
Lane B's; "body affinity" notes below are advisory only.

| chain | archetype (reuse/new) | silhouette nameable at distance | palette tokens (roof rung + accent) | signature element | quay dressing | rationale (chain truth) |
| --- | --- | --- | --- | --- | --- | --- |
| ethereum | `boathouse-precinct` → **the Ethereum Mole** (Lane C extends) | great hip-roof hall + campanile on a stone breakwater mole | roof rung #a95f43 (existing); accent `sail_red` #9a3a2e; windows `lantern_glow` | moon-viewing deck reaching past the hall (existing) | veranda + stone stair (existing) | the settlement layer: the deep-water refuge every other berth orbits. Structure/identity detail is Lane C's brief; row included for ladder completeness |
| tron | `stepped-inlet` (reuse, keep) | wide stone stair descending into water under a lantern crown | rung #747a7c (existing); accent `iron_dark` #1a1612 mooring rings | crown lanterns (existing) + mooring rings at every step | tide-gauge post, worn steps | TRC-20 USDT is the payments/remittance rail: constant small-craft traffic berthing at any tide — a stepped ferry landing, busy at every level |
| solana | `fishing-pier` (rebind from reed) | long thin pier, single lean-to, tall forked net rack | rung #9c694c (existing); accent `aurora_green` #5e976e (rokushō) on the winch | net-drying racks (existing) | crates, winch drum | high-velocity retail flow: many small landings per hour. Reads "work happens here at speed" — the busiest small-boat quay on the rim |
| bsc | `tea-house-quay` (reuse, keep) | tea house with round moon window over an engawa shelf | rung #40515b (existing); accent `lantern_warm` #d49a3e (yamabuki — this IS lantern warmth); walls `timber_warm` | moon-window loft (existing) | engawa railing, engawa shelf | the old merchant house of the east: yield culture, deal-making, gossip over tea. The most socially-shaped harbor on the map |
| base | **`hatago-wharf` (new)** | two-storey travelers' inn, stacked roofs, lantern row over the water stair | NEW rung #56606b (slate kawara, graded into the roof-rung family); accent `timber_warm` #836c49 posts + `lantern_warm` #d49a3e lantern row (the token's pinned meaning) | the noren curtain + guest-lantern row at the water stair | water stair, luggage sleds, guest windows | "bring the next billion onchain": Base's product is arrival. A hatago (旅籠) is the Edo traveler's inn — the harbor where newcomers land and stay |
| arbitrum | `annex-pavilion` (reuse, keep) | open belvedere pavilion — deliberately the precinct's satellite form | rung #c58b55 (existing); accent `fog_blue` #365371 (ainezu) railing | open belvedere (existing) | latticed screen wall, covered bridge stub | Arbitrum Orbit literally spawns satellite chains around Arbitrum One: the annex IS the correct architecture for the chain whose product is annexes. Keep it — as the *one* annex |
| hyperliquid | **`uogashi` (new)** | long open-fronted market hall on pilings, boats nose in under the roof; a great hanging scale beam at the head | NEW rung #6f7a5e (weathered copper, graded into family); accent `lantern_cold` #568ca4 (nando steel) on the scale arm | the balance arm — a big steelyard (hakari) hanging over the stalls | stall posts, tally boards, tender skiffs alongside | the chain that IS the exchange: one venue, everything else small. Uogashi (魚河岸) — the riverside market where boats trade directly under one roof — is the idiom-native exchange |
| polygon | `reed-boathouse` (rebind from annex) | high sharp thatch gable, open boat-bay mouth, soft reed dome | rung #c7ae72 (existing thatch); accent `timber_warm` #836c49 | reed-clump moorings (existing) | reed bundles, cut-reed stacks | "polygon" = many-sided: a thatch roof is a mat woven from many reeds — one roof, many strands; the honest image of the CDK/PoS family. Also de-clones the annex row |
| avalanche | `storm-mole` (rebind from salvage) | crenellated stone breakwater curving out, lantern tower at its head | rung #354750 (existing); accent `fog_pale` #57758b gallery rail | lantern tower + merlon crown (existing) | mole blocks, sheltered berths in the lee | subnets: one heavy structure sheltering many small berths in its lee — the fortress-form of a chain that franchises consensus. Reads protection, not wreckage |
| aptos | `gate-landing` (rebind from salvage) | vermilion-family torii gate on the water, paired stone lanterns | rung #8a4d3c (existing); accent `sail_red` #9a3a2e (NOT reserved `vermillion` #c23a22 — the gate comment already keeps this distinction, `garden-docks.ts:796-798`) | rope-and-shide swag (existing) | landing steps, paired lanterns | Move's resource safety = a verified threshold: the gate that only lets the right things through. Formal verification deserves the formal gate |
| ton | `pigeonnier-islet` (reuse, keep) | round cote with cone roof, dark entry holes, perch ledges | rung #bc7455 (existing); accent `moonlight` #bad8e7 perch trim | pigeonnier cote (existing) | single lamp, islet wharf | messenger birds = Telegram. The best existing metaphor in the set; untouched |

Flag shapes travel with the archetype (`STATION_IDENTITY`, `garden-docks.ts:127-139`):
solana taper→**forked**, polygon notched→**tapered**, aptos dovetail→**pennant**,
avalanche dovetail→**storm-split**, arbitrum/bsc/tron/ton/ethereum unchanged; the two new
archetypes add **nobori** (vertical banner — the inn's sign cloth) for base and
**twin-tail** (echoing the balance arm) for hyperliquid. The 11-shape distinctness test
(`garden-docks.test.ts:34`) extends to 13. `salvage-slip` and `signal-jetty` become the
deep-fill archetypes for generic top-8 entrants (salvage reads "risk recovery",
signal-jetty stays the alert-body's own mast), which suits their fill positions at slots
5+ of `OUTER_HARBOR_STATION_SLOTS` (`world-layout.ts:107-113`).

Body affinity (advisory; Lane B decides tiles): stepped-inlet → alert/warning steps,
fishing-pier → danger-gorge mouth (existing), tea-house → watch/calm shore, uogashi → any
working bay (watch-east reads well), reed-boathouse → reeded south rim (existing),
storm-mole → weather-facing rim (wreck-west-ledge today), gate-landing → ledger slate
lips (existing ledger-fog-hook), hatago → calm/watch (arrival water), annex-pavilion →
near the Mole only (its meaning is "satellite of").

### 3.1 New archetype definitions (the only two inventions)

**`hatago-wharf`** (base) — author in the existing kit (`authorDock`'s bucket/prop
system, `garden-docks.ts:550-660`): two-storey wall mass (w≈16.6 base), irimoya main roof
plus a smaller stepped lower roof over the water stair (reuse `articulateIrimoya`
`:1144-1180`), open first-floor gallery facing the water (engawa posts), guest-window row
on the upper floor (window count = supply rungs), noren curtain (two short cloth planes on
the stair posts — shares the flag lane's wave phase, no new shader), nobori flag. Second
level named `inn-gallery`. Cost: one more station author ≈ the size of `authorTeaHouseQuay`
(~60-80 bucket boxes); paid for by D1's de-cloning (net station count unchanged).

**`uogashi`** (hyperliquid) — long (≈15.2 base) open-fronted hall on pier pilings
(`pushPierPilings` `:1678-1692`), mono-pitch roof reusing `articulateLeanToRoof`
`:1301-1343` at hall scale, stall posts along the open front, tally boards on the landward
wall, and one oversized steelyard: a post, a pivoting beam, a hanging pan — built from 5
primitives into the `metal` bucket. Second level named `scale-beam`. Cost: comparable to
`authorSalvageSlip`; same pay-for as above.

Displacement named (the "every addition names what it displaces" rule): the two new
archetypes displace the second and third `annex-pavilion` copies and the misfiled
`salvage-slip`/`fishing-pier` bindings — nothing is added to the frame that those clones
did not already occupy; draw-call and bucket structure are unchanged (one accent, roof,
wall, timber, stone, window part per station).

### 3.2 Palette mechanics (how the tokens get into pixels)

- **Accent bucket becomes per-chain** — today one hex for everyone
  (`garden-docks.ts:340`). Make it a lookup keyed by archetype/chain into the token set
  above. Zero new draw calls: each station already owns exactly one accent
  `pushMergedPart`. All chosen tokens sit at/below the chroma ceiling
  (`src/systems/palette.ts:20-45`: only the reserved accent family — `vermillion`,
  `lantern_warm`, `lantern_glow`, `sail_red` family — exceeds it; `aurora_green` was
  graded to C 0.086 to comply). `vermillion` #c23a22 stays untouched: reserved for the
  beacon flame and DEWS danger (`palette.ts:29-34`).
- **Roof rungs stay the ladder** — one distinct hex per archetype is test-pinned
  (`garden-docks.test.ts:78-79`). Two new rungs (#56606b, #6f7a5e) are graded to sit
  inside the existing family spread (#354750…#c7ae72); trim stays the rung × 0.66
  (`roofTrimColor`, `garden-docks.ts:465-467`).
- **Chain brand color stays on the flag** — `CHAIN_FLAG_FIELD`
  (`garden-chain-flag.ts:185-197`) is the sanctioned brand channel; architecture stays
  dentō-shoku quiet so the loud thing on each station remains the cloth.
- **Windows**: keep `lantern_glow` warm windows; raise count with supply (see §4).

---

## 4. The analytical contract stays readable (parity map)

The World encoding table (`VISUAL_INVARIANTS.md`) requires Harbor to read *chain supply
and concentration*, with DOM/accessibility parity for every cue.

| reading | visual channel (where authored) | DOM parity (where produced) |
| --- | --- | --- |
| supply — roof mass | **proposed**: hall dims scale by the §5 architecture multiplier (today pier-only, `garden-docks.ts:291-296`; D6) | — |
| supply — pier/quay length | `authorDock` `:291-298` (amountScale); `dockSize` `src/systems/chain-docks.ts:22-39` | detail "Stablecoin supply" row `detail-model.ts:870`; ledger `formatCompactUsd(dock.totalUsd)` `accessibility-ledger.tsx:393` |
| supply — flag scale | `stationFlagPlacement` `garden-docks.ts:1628-1640`: (0.72 + supply·0.24)·1.6 (precinct 1.05 base); multiplier pinned `:219` and test `garden-docks.test.ts:88-89` | — (decorative channels carry no meaning per invariant; flag is identity, scale is redundant) |
| supply — window count | **proposed**: warmWindowCount = archetype base + supply rungs (today 1-6, mostly 1 — measured, Appendix A; each window box is 12 tris, +4/station ≈ +400 trips total against a 165k-triangle ceiling margin) | — |
| concentration | renderer channel exists only as ⅕ of quay masonry: `1 - factors.concentration` in `src/systems/dock-health.ts:7-13` → stone tint `garden-docks.ts:295`, cracks `:341-353`, leaning bollard `:322-327` | detail "Concentration" row via `dockConcentrationLabel` `detail-model.ts:843-848` (row `:874`); ledger `concentration ${…}` `accessibility-ledger.tsx:396`. Test-pinned wording `detail-model.test.ts` |
| rank | implicit (size ordering) | detail "Harbor rank" (`harborRankLabel`, row `:872`); ledger `:394` |
| identity — station type | `STATION_IDENTITY`/authors (§3) | detail "Station type" row `detail-model.ts:895` via `stationTypeLabel` `:203-205`; summary sentence `:875-878`; ledger `${dock.station.type.replaceAll("-", " ")} station at ${dock.station.coveId} cove` `accessibility-ledger.tsx:393` |
| identity — cove/group | slot tables (`world-layout.ts:82-113`) | detail "Rim cove" `:896`, "Harbor group" `:897` via `dockHarborGroupLabel` `:196-201` |

Because the panel and ledger strings are **derived** from `dock.station.type` and
`coveId`, the new archetypes automatically gain parity the moment the type exists in
`StationType`/`STATION_TYPES`/`STATION_AUTHORS` (`garden-docks.ts:32-43,122-139,503-515`)
and the slot/legacy tables name them — no string duplication to drift. `stationTypeLabel`
title-cases the type, so `hatago-wharf` reads "Hatago Wharf" and `uogashi` reads "Uogashi"
(`detail-model.ts:203-205`; existing pins at `detail-model.test.ts:270-272`).

Concentration sharpening (optional, flag to operator): berth occupancy — the share of
quay bollards carrying a moored tender light rises with HHI (few fat berths vs many thin
ones), reusing the existing bollard props (`garden-docks.ts:321-327`) and ember rules; it
displaces part of the continuous quay lit-edge, adding no lights. The current ⅕-of-masonry
channel already satisfies parity, so this is a legibility upgrade, not a gap fill.

---

## 5. Scale ladder (numbers + checks)

Anchors: "ordinary hull" = bezaisen, the modal fleet family, 6.93-unit hull at unit scale
(`createHullShape` points `src/three/garden-ships.ts:2279-2284`, extent −3.48…+3.45;
visual scale floor 0.55 `src/systems/garden-observatory-slice.ts:83`). The repo's own
operationalization of "primary roof ≥ 2× an ordinary hull" is the pinned minimum hall
length **12.6** (`garden-docks.test.ts:74-78`: non-precinct minimum `{length: 12.6}`);
the ladder keeps that floor.

Ladder contract (base values at unit scale — these are what a test pins):

| tier | chain | archetype | base L | base span | base area | base T (2nd level) | rendered L (×0.95–1.35, floor 12.6) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ethereum | Mole / boathouse-precinct | 24.0 | 12.0 | 288 | 14.4 | 22.8–32.4 (T ≤ 16 cap) |
| 2 | tron | stepped-inlet | 19.0 | 7.8 | 148 | 9.4 | 18.1–25.7 |
| 2 | solana | fishing-pier | 18.2 | 6.7 | 122 | 8.3 | 17.3–24.6 |
| 2 | bsc | tea-house-quay | 17.4 | 7.4 | 129 | 10.7 | 16.5–23.5 |
| 3 | base | hatago-wharf | 16.6 | 6.8 | 113 | 11.8 | 15.8–22.4 |
| 3 | arbitrum | annex-pavilion | 15.9 | 6.6 | 105 | 8.6 | 15.1–21.5 |
| 3 | hyperliquid | uogashi | 15.2 | 7.8 | 119 | 7.2 | 14.4–20.5 |
| 4 | polygon | reed-boathouse | 14.5 | 6.0 | 87 | 11.2 | 13.8–19.6 |
| 4 | avalanche | storm-mole | 13.8 | 8.8 | 121 | 9.4 | 13.1–18.6 |
| 4 | aptos | gate-landing | 13.2 | 7.0 | 92 | 9.5 | 12.6–17.8 |
| 5 | ton | pigeonnier-islet | 12.6 | 5.6 | 71 | 8.6 | 12.6–17.0 |

- **Ethereum first**: base ratio to the second-largest = 24.0/19.0 = **1.26** even at
  equal supply multipliers; with realistic supplies both sit at the multiplier ceiling and
  the ratio holds (measured today: 19.11 vs 13.13 = 1.46 — the plan narrows but keeps
  >1.25; the Mole's T cap 16 keeps it under the Pharos tower's dominance, Lane C's call).
- **Top-3 read next**: tron/solana/bsc bases 17.4–19.0 vs tier-3 bases ≤16.6; the supply
  multiplier band (below) is what a feed's actual top-3 modulates within.
- **Smallest clears 2× a hull**: min base L = 12.6 = the pinned 2× floor; rendered L is
  clamped ≥ 12.6 by the ladder rule.
- **Supply multiplier** (fixes D6): architecture scale = `0.95 + clamp((log10(usd) −
  8.5)/3.2, 0, 1) · 0.40` (L) and `· 0.15` (T), i.e. L ×0.95–1.35, T ×0.95–1.10 — the
  hall now *is* the supply reading. Tier-head base ratios run 1.26 / 1.14 / 1.14 / 1.15
  (ethereum→tron→base→polygon→ton heads); the Ethereum gap survives any
  multiplier combination, and the narrower interior gaps are ordered the same way feeds
  order supplies — the acceptance test therefore asserts rendered L ordering on the dense
  fixture, not on base alone.
- **Differentiation check (the assignment's rule)**: across all 55 archetype pairs,
  **none sit within 10% on both footprint area (L×S) and height (T)**. Verified
  programmatically on the table above (Appendix B); the five tightest surviving margins:
  solana–avalanche 11.7%, arbitrum–aptos 11.9%, bsc–avalanche 12.1%, bsc–base 12.3%,
  tron–bsc 13.1%. For contrast, the *current* geometry fails this check on 19 pairs (D5).

Invariant sentences that require amendment (explicitly, with the trade):

1. `garden-docks.test.ts:94-98` pins second-level heights to **7.0–12.6** with Ethereum
   max. The Mole at T 14.4 (cap 16) exceeds it. Trade: the Mole must out-scale everything
   to be "unmistakably first" (operator goal 2); amend the band to 7.2–13.5 for
   non-Ethereum and exempt/pin the Mole separately — Lane C owns the final number.
2. `VISUAL_INVARIANTS.md` "Composition" — "second-level silhouettes now span roughly
   7.2–12.4 world units": restate as "7.2–13.5, the Ethereum Mole excepted (≤16)".
3. `garden-docks.test.ts:74-78` minimums (`{height: 5.4, length: 12.6, span: 6.5}`) need
   per-archetype minimums matching the ladder (all ≥ the 12.6/6.5 floors proposed here,
   so the *floor* sentences survive unchanged).

---

## 6. What an implementation touches (informational — no edits made by this lane)

- `src/three/garden-docks.ts` — add `hatago-wharf`, `uogashi` to `StationType`,
  `StationSignature`, `StationRoofline`, `StationFlagShape`, `StationSecondLevel`
  (`:32-92`), `STATION_TYPES`/`STATION_IDENTITY` (`:122-139`), `STATION_AUTHORS`
  (`:503-515`), `STATION_ROOF_COLOR` (`:453-462`), `STATION_SPAN_SCALE` (`:1664-1676`),
  `stationFlagPlacement` (`:1628-1640`), accent lookup at `:340`; hall dims become ladder
  × multiplier at `:291-296`.
- `src/systems/world-layout.ts` — retype `OUTER_HARBOR_STATION_SLOTS` (`:107-113`) and
  `PREFERRED_DOCK_STATIONS` (`:126-146`, fix `:144-145` collision; unify hyperliquid id
  per D7).
- `src/three/garden-docks.ts:142-155` — `LEGACY_STATION_BY_CHAIN` to match.
- Tests: `garden-docks.test.ts` (ARCHETYPES list, minimums, bands, shapes),
  `chain-docks.test.ts` (spread + archetype-per-chain), `detail-model.test.ts:270-272`
  (auto-derives), `VISUAL_INVARIANTS.md` Composition sentence.

---

## Appendix A — measurement script output (verbatim)

Run: transient vitest file executing the real `authorDock`/`buildChainDocks` headless
(`npx vitest run <temp>`; deleted after). Feed supplies are realistic placeholders
`[INFERENCE]`.

```
== Baseline recipe: size 7, $7B, bearing 0 ==
type | dockLen | dockSpan | primary LxSxH | second LxSxH (name) | quay LxS | win | flagY | flagScale
boathouse-precinct | 14.76 | 10.66 | 22.24x10.25x7.40 | 3.70x3.70x12.35 (bell-tower) | 8.75x8.75 | 6 | 7.36 | 1.95
annex-pavilion | 10.43 | 4.84 | 13.40x7.00x5.50 | 4.60x3.90x8.75 (open-belvedere) | 6.75x5.59 | 1 | 6.16 | 1.42
gate-landing | 10.43 | 4.84 | 13.00x7.00x5.50 | 1.16x8.30x9.27 (torii-gate) | 6.75x5.59 | 3 | 6.16 | 1.42
tea-house-quay | 10.43 | 4.84 | 13.00x7.00x6.35 | 3.80x3.50x8.60 (moon-window-loft) | 6.75x5.59 | 2 | 6.16 | 1.42
fishing-pier | 10.43 | 4.84 | 13.00x7.29x6.02 | 0.30x4.90x7.20 (net-drying-rack) | 6.75x5.59 | 1 | 6.16 | 1.42
stepped-inlet | 10.43 | 4.84 | 13.40x7.00x5.60 | 1.44x4.32x8.06 (lantern-crown) | 6.75x5.59 | 3 | 6.16 | 1.42
reed-boathouse | 10.43 | 4.84 | 13.00x7.15x6.21 | 4.80x4.60x10.00 (thatched-dome) | 6.75x5.59 | 1 | 6.16 | 1.42
storm-mole | 10.43 | 7.21 | 13.00x7.00x6.20 | 4.10x4.10x9.60 (lantern-tower) | 6.75x5.59 | 2 | 6.16 | 1.42
salvage-slip | 10.43 | 4.84 | 13.00x6.93x5.71 | 5.60x7.62x8.99 (hauled-hull-frame) | 6.75x5.59 | 1 | 6.16 | 1.42
signal-jetty | 10.43 | 4.84 | 13.00x6.81x5.62 | 0.32x4.20x10.95 (signal-mast) | 6.75x5.59 | 1 | 6.76 | 1.42
pigeonnier-islet | 10.43 | 4.84 | 13.00x7.00x6.55 | 4.70x4.70x8.55 (pigeonnier-cote) | 6.75x5.59 | 4 | 5.76 | 1.42
-- Pairs within 10% on BOTH secondLevel height and dock footprint length --
annex-pavilion vs gate-landing: dHeight=5.6% dLen=0.0%
annex-pavilion vs tea-house-quay: dHeight=1.7% dLen=0.0%
annex-pavilion vs stepped-inlet: dHeight=7.8% dLen=0.0%
annex-pavilion vs storm-mole: dHeight=8.9% dLen=0.0%
annex-pavilion vs salvage-slip: dHeight=2.6% dLen=0.0%
annex-pavilion vs pigeonnier-islet: dHeight=2.3% dLen=0.0%
gate-landing vs tea-house-quay: dHeight=7.2% dLen=0.0%
gate-landing vs reed-boathouse: dHeight=7.3% dLen=0.0%
gate-landing vs storm-mole: dHeight=3.4% dLen=0.0%
gate-landing vs salvage-slip: dHeight=3.1% dLen=0.0%
gate-landing vs pigeonnier-islet: dHeight=7.8% dLen=0.0%
tea-house-quay vs stepped-inlet: dHeight=6.2% dLen=0.0%
tea-house-quay vs salvage-slip: dHeight=4.3% dLen=0.0%
tea-house-quay vs pigeonnier-islet: dHeight=0.6% dLen=0.0%
stepped-inlet vs pigeonnier-islet: dHeight=5.7% dLen=0.0%
reed-boathouse vs storm-mole: dHeight=4.0% dLen=0.0%
reed-boathouse vs signal-jetty: dHeight=8.7% dLen=0.0%
storm-mole vs salvage-slip: dHeight=6.4% dLen=0.0%
salvage-slip vs pigeonnier-islet: dHeight=4.9% dLen=0.0%
-- supply ladder --
$0.1B: reed dockLen=6.61 pH=6.21 sH=10.00 | precinct dockLen=9.35 sH=12.35
$1B: reed dockLen=8.03 … | precinct dockLen=11.36 sH=12.35
$5B: reed dockLen=10.02 … | precinct dockLen=14.17 sH=12.35
$10B: reed dockLen=10.87 … | precinct dockLen=15.39 sH=12.35
$50B: reed dockLen=12.86 … | precinct dockLen=18.20 sH=12.35
$80B: reed dockLen=13.44 pH=6.21 sH=10.00 | precinct dockLen=19.02 sH=12.35   (primary L constant 13.00 at every rung)
== Simulated realistic feed ==
ethereum -> ethereum-precinct (boathouse-precinct) tile=(14,74) size=10 dockLen=19.11 sH=12.35
tron -> warning-stone-notch (stepped-inlet) tile=(118,10) size=10 dockLen=13.13 sH=8.06
solana -> watch-south-reed (reed-boathouse) tile=(122,132) size=7 dockLen=10.47 sH=10.00
bsc -> watch-east-bay (tea-house-quay) tile=(132,80) size=7 dockLen=10.11 sH=8.60
base -> base-annex (annex-pavilion) tile=(14,81) size=6 dockLen=9.97 sH=8.75
arbitrum -> arbitrum-annex (annex-pavilion) tile=(12,68) size=6 dockLen=9.61 sH=8.75
hyperliquid-l1 -> danger-gorge (fishing-pier) tile=(131,59) size=5 dockLen=8.82 sH=7.20   [preferred lookup MISSED — fill order gave it the pier]
polygon -> optimism-annex (annex-pavilion) tile=(13,89) size=5 dockLen=8.44 sH=8.75
ton -> ton-pigeonnier-islet (pigeonnier-islet) tile=(125,126) size=4 dockLen=7.90 sH=8.55
(aptos/avalanche below top-8 in this sim; when they render, the :144-145 collision resolves by USD sort)
```

## Appendix B — proposed-ladder check output (verbatim)

```
VIOLATIONS (area & height both within 10%): (none)
tightest 5 margins: solana-avalanche 11.7%, arbitrum-aptos 11.9%, bsc-avalanche 12.1%, bsc-base 12.3%, tron-bsc 13.1%
min primary length: 12.6 (invariant pin: >= 12.6 = 2x ordinary hull)
T range (non-ethereum): 7.2 - 11.8 (existing test band 7.0-12.6)
ethereum vs 2nd largest L ratio: 1.26
rendered L bands: ethereum 22.8-32.4 | tron 18.1-25.7 | solana 17.3-24.6 | bsc 16.5-23.5 | base 15.8-22.4
                   | arbitrum 15.1-21.5 | hyperliquid 14.4-20.5 | polygon 13.8-19.6 | avalanche 13.1-18.6
                   | aptos 12.6-17.8 | ton 12.6-17.0   (T multiplier capped 0.95-1.10; Mole T capped at 16)
```
