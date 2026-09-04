# Harbor plan verification — machine check of `agents/epic-harbor-plan.md` (final 8-mouth design)

**Date:** 2026-09-04 · **Lane:** V (verification) · **Object under test:** `agents/epic-harbor-plan.md`
as corrected twice in-flight by the orchestrator (D8 inversion fixed; ring retargeted from 10 mouths/cap 10 to
**8 mouths/cap 8**, priority list reduced to `["ethereum"]`).

**Method.** One throwaway script, `outputs/harbor-plan-verify.ts`, run with the repo's own devDependency:
`npx tsx outputs/harbor-plan-verify.ts` (exit 0, deterministic; raw transcript in `outputs/verify-out.txt`).
It imports the **real modules** — `garden-rim`, `sea-bodies`, `world-layout`, `seawall`, `chain-docks`,
`dock-layout`, `garden-util`, `garden-docks`, `garden-harbor-batch`, `garden-chain-flag`,
`@shared/lib/cemetery-merged` — and edits nothing under `src/`/`shared/`/`docs/`. Slot tables for the
*proposed* ring are simulated in-script (the plan is not implemented); the selector logic is a faithful port of
`selectChainHarbors` + `stationSlotForChain` + the pigeonnier append (`src/systems/chain-docks.ts:65-215`), and
the today-baseline (3z) and claim 8 run the **real** `buildChainDocks`. No linters, formatters, or suites were run.

## Verdict summary

| # | Claim | Verdict |
| --- | --- | --- |
| 1 | 8 final mouths satisfy every authored predicate | **PASS** (8/8; retired draft mouths also pass, informational) |
| 2 | Seawall-barrier disjointness (plan §9 open item) | **PASS** — explicit, not inference |
| 3 | Spread metrics + cap-8 coverage guarantee | **PASS** — 49.0°, 0 trios, N=1, S=4, x 9..132, 6 bodies; all 8 mouths lit in all 4 feeds |
| 3z | Today baseline reproduces (real modules) | **PASS** — 4/9 within 30 of the Ethereum mouth, 111.0°, 4 trios |
| 4 | Density-decision evidence (cap-8 fallback) | **PASS** (retargeted: moot — cap stays 8; retired cap-10 variant also 49.0°) |
| 5 | Mole footprint (plan risk R5) | **PASS** — footprint→grave clearance **9.19 tiles** (need >3.25) |
| 6 | Calm-mask clamp arithmetic + call sites (plan D6/L3) | **PASS** |
| 7 | 9-station batch stays within ≤20 drawable ceiling | **PASS** — 15 drawables; per-station ~2-9k triangle target is a design figure, not yet checkable |
| 8 | `hyperliquid` vs `hyperliquid-l1` through real selector + dye | **PASS** — dye defect bites on the canonical id; slot defect bites on the alias |

Plan-document defects found (numbers only, no rewording): **2** — see "Defects in the plan document" below.

---

## Claim 1 — field verification of the 8 final mouths

Predicates checked per mouth, all against real module functions: `seaBodyAtTile`/`seaTerrainAtTile`/`tileKindAt`
+ `isWaterTileKind` (water of the named body), `rimShoreDistance ∈ (0,2]`, bearing outside both `RIM_OPENINGS`
(`bearingInsideRimOpening`) with `rimDepthAt > 0`, water at the immediately seaward tile and rim land within
14 tiles landward along the cardinal-snapped `dockSeawardVector` (mirrors `world-layout.test.ts:289-296`),
`isNavigableWaterTile`, and distance to every grave from the real `graveNodesFromEntries(CEMETERY_ENTRIES)` > 3.25
(mirrors `world-layout.test.ts:398`).

```
grid 140x140  plate centre (69.5,69.5)  graves=89
RIM_OPENINGS (math deg): (-2.8797932657906435,-1.4835298641951802) (-0.8726646259971648,-0.17453292519943295)
PASS ethereum-mole       ( 15, 95) body=calm    sd=1.50 openingsClear=true rimDepth=14.0 seawardWater=true land@2t nav=true graveDist=21.19
PASS ledger-fog-hook     (  9, 54) body=ledger  sd=0.50 openingsClear=true rimDepth=8.4 seawardWater=true land@1t nav=true graveDist=62.49
PASS warning-stone-notch (118, 10) body=warning sd=0.50 openingsClear=true rimDepth=9.7 seawardWater=true land@1t nav=true graveDist=143.94
PASS danger-gorge        (131, 59) body=danger  sd=0.50 openingsClear=true rimDepth=7.1 seawardWater=true land@1t nav=true graveDist=123.18
PASS watch-east-bay      (132, 80) body=watch   sd=0.50 openingsClear=true rimDepth=6.2 seawardWater=true land@1t nav=true graveDist=114.67
PASS watch-south-reed    (122,132) body=watch   sd=0.50 openingsClear=true rimDepth=6.7 seawardWater=true land@1t nav=true graveDist=96.48
PASS calm-engawa-south   ( 60,130) body=calm    sd=0.50 openingsClear=true rimDepth=8.2 seawardWater=true land@1t nav=true graveDist=34.47
PASS wreck-shoal-east    ( 31,125) body=wreck   sd=0.50 openingsClear=true rimDepth=13.8 seawardWater=true land@1t nav=true graveDist=5.53
retired-from-draft mouths (informational, not part of the final ring):
PASS alert-signal-jetty  (104, 12) body=alert   sd=0.50 openingsClear=true rimDepth=11.8 seawardWater=true land@1t nav=true graveDist=133.43
PASS watch-terrace-quay  (131,101) body=watch   sd=0.50 openingsClear=true rimDepth=7.2 seawardWater=true land@1t nav=true graveDist=107.57
INFO pigeonnier (125,126) body=watch nav=true graveDist=99.33 barrier=false
```

Notes. The Mole mouth is the only one with `sd = 1.50` (deep-water berth) and `land@2t`; all others sit at the
`sd = 0.50` bank line with land immediately landward. `rimDepth = 14.0` at (15,95) confirms the plan §5
"maximum authored shoulder" claim. Cut mouths `alert-signal-jetty`/`watch-terrace-quay` remain valid candidate
tiles, so retiring them is a choice, not a necessity (consistent with plan §3's "evaluated and cut").

## Claim 2 — the seawall-barrier question (plan §9's open `[INFERENCE]`)

**Verdict: PASS — the 10→8 new mouths are disjoint from the seawall barrier by construction, and the number is
not close.** `SEAWALL_BARRIER_TILES` is generated (`src/systems/seawall.ts:89-105`) as the unique water tiles
immediately cardinal-seaward of the **main-island** perimeter (`computePerimeter` scans
`getMainIslandLandMask`); it is an island moat, not a rim feature. The authored rim coves sit on the plate edge.
Machine check that every barrier tile is cardinally adjacent to main-island land (generation source) plus
per-mouth disjointness and clearance:

```
SEAWALL_BARRIER_TILES.length=68 (world-layout.test.ts:317 requires >=40)
barrier bbox x[57..85] y[63..83]
every barrier tile cardinally adjacent to main-island land: true
PASS ethereum-mole       ( 15, 95) isBarrier=false minDistToBarrier=48.37 tiles
PASS ledger-fog-hook     (  9, 54) isBarrier=false minDistToBarrier=50.60 tiles
PASS warning-stone-notch (118, 10) isBarrier=false minDistToBarrier=66.29 tiles
PASS danger-gorge        (131, 59) isBarrier=false minDistToBarrier=47.30 tiles
PASS watch-east-bay      (132, 80) isBarrier=false minDistToBarrier=47.17 tiles
PASS watch-south-reed    (122,132) isBarrier=false minDistToBarrier=65.44 tiles
PASS calm-engawa-south   ( 60,130) isBarrier=false minDistToBarrier=48.05 tiles
PASS wreck-shoal-east    ( 31,125) isBarrier=false minDistToBarrier=55.61 tiles
PASS ton-pigeonnier-islet (125,126) isBarrier=false minDistToBarrier=62.94 tiles
```

The `world-layout.test.ts:316-322` invariant (no barrier tile coincides with a dock tile) therefore holds for
the proposed `DOCK_TILES` with ≥ 47.2 tiles of clearance — nothing needs to "re-adapt"; the assertion is
structurally insensitive to which rim coves are authored.

## Claim 3 — spread metrics and the cap-8 coverage guarantee

Four feeds where top-8 membership changes, through the ported selector with the final tables
(1 EVM slot `ethereum-mole`; 7 outer slots; preferred keys `ethereum, base, tron, solana, hyperliquid, polygon,
bsc, arbitrum` + `ton`; `PRIORITY = ["ethereum"]`; `MAX_CHAIN_HARBORS = 8`; canonical `hyperliquid` id per D8).
Arc vocabulary N = y≤30, E = x≥110, S = y≥112, W = x≤30 with S taking precedence over E (the pigeonnier at
(125,126) is south rim). Full station tables, pairwise matrices and metrics per feed are in the transcript;
condensed results:

```
feed A (realistic: polygon 2.5 > aptos 1.8):  mouths lit 8/8 + pigeonnier; dark=none; named chains on their preferred berths=true; fill-order substitutions=none
  trios<=30=0 [] | y<=30=1 y>=112=4 | x[9..132] | distinctBodies=6 (watch,calm,wreck,ledger,warning,danger)
  largest station-free arc: raw=114.8deg [base->tron]  minusRIM_OPENINGS=49.0deg [polygon->bsc]
feed B (polygon dropped to 1.0, aptos in):    mouths lit 8/8 + pigeonnier; dark=none; substitutions=aptos->watch-south-reed(reed-boathouse)
  trios<=30=0 | y<=30=1 y>=112=4 | x[9..132] | bodies=6 | maxHoleAfterOpenings=49.0deg [aptos->bsc]
feed C (arbitrum dropped to 1.0, avalanche in): mouths lit 8/8 + pigeonnier; dark=none; substitutions=aptos->wreck-shoal-east(storm-mole)
  trios<=30=0 | y<=30=1 y>=112=4 | x[9..132] | bodies=6 | maxHoleAfterOpenings=49.0deg [polygon->bsc]
feed D (deep 20-chain, sui 4.2 outranks hyperliquid 3.5): mouths lit 8/8 + pigeonnier; dark=none; substitutions=sui->watch-east-bay(uogashi)
  trios<=30=0 | y<=30=1 y>=112=4 | x[9..132] | bodies=6 | maxHoleAfterOpenings=49.0deg [hyperliquid->bsc]
```

Feed A pairwise matrix (tiles):

```
             hyperl    ton polygo    bsc arbitr ethere   base   tron solana
    hyperliq      .     47     53     88    111    118    126     71     21
    ton          47      .      7     65     94    114    137    116     67
    polygon      53      7      .     62     91    113    137    122     74
    bsc          88     65     62      .     29     57     92    133    100
    arbitrum    111     94     91     29      .     34     74    144    120
    ethereum    118    114    113     57     34      .     41    134    121
    base        126    137    137     92     74     41      .    118    122
    tron         71    116    122    133    144    134    118      .     51
    solana       21     67     74    100    120    121    122     51      .
```

**The coverage guarantee is confirmed:** in every feed all 8 rim mouths plus the pigeonnier bind, and every
substitute inherits the place's archetype (feeds B/C exactly as plan §4 describes). One *additional* behaviour
the plan's wording does not mention, observed in feed D: a **richer generic chain can take a preferred mouth
before the named chain processes** (sui, USD 4.2, claims `watch-east-bay` ahead of hyperliquid, USD 3.5), which
displaces the named chain to a fill mouth — hyperliquid rendered at `watch-south-reed` in `reed-boathouse`.
Coverage and metrics are unaffected (0 trios, 49.0°), and "the place owns the architecture" still holds; only the
flag/supply mapping shuffles. Worth a one-line caveat in §4 if the operator expects named chains to always wear
their §4 archetype under deeper feeds.

## Claim 3z — today baseline from the real, unmodified `buildChainDocks`

```
  station table: bsc(132,80) ton(125,126) solana(122,132) polygon(13,89) base(14,81) ethereum(14,74) arbitrum(12,68) tron(118,10) hyperliquid(131,59)
  trios<=30=4 [["polygon","base","ethereum"],["polygon","base","arbitrum"],["polygon","ethereum","arbitrum"],["base","ethereum","arbitrum"]] | y<=30=1 y>=112=2 | x[12..132] | distinctBodies=4 (watch,calm,warning,danger)
  largest station-free arc: raw=127.7deg [arbitrum->tron]  minusRIM_OPENINGS=111.0deg [solana->polygon]
  stations within 30 tiles of today's Ethereum mouth (14,74): 4 of 9 -> polygon,base,ethereum,arbitrum
```

Reproduces plan §1's defect table exactly: 4 of 9 within 30 tiles, 111° hole, 4 trios, 4 bodies.

## Claim 4 — density decision evidence (retargeted)

The plan no longer raises the cap, so the original "cap-8 fallback" item is moot — items 3a-3d **are** the
cap-8 evidence. For the operator's both-ways comparison the retired draft was also measured:

```
final design runs at MAX_CHAIN_HARBORS=8 (items 3a-3d above ARE the cap-8 evidence).
for the operator's both-ways comparison, the retired 10-mouth/cap-10 draft measured:
  retired 10-mouth ring, all lit (cap 10): maxHoleAfterOpenings=49.0deg raw=106.6deg — versus final 8-mouth ring: 49.0deg (item 3)
```

Confirms plan §3's justification for the cut: the 10-mouth/cap-10 variant bought **zero** additional spread
(49.0° both ways) for two extra stations.

## Claim 5 — Mole footprint (plan risk R5)

Envelope ≤ 40 × 34 world units rooted at (15,95), local +X seaward = +x east (bearing 0 ⇒ `root.rotation.y = 0`),
converted at `TILE_SCALE = √2`: half-extents 14.142 × 12.021 tiles → tile footprint **x[1..29] × y[83..107]**,
725 tiles, south edge y = 107.

```
(a) rim land tiles=313 x[1..13] | rim land on the SEAWARD half (x>=15)=0 | non-navigable WATER tiles=0
(c) terrainLandAt land tiles=313 (the west-rim apron band, intended) | true main-island land (getMainIslandLandMask) overlap=0 | cemetery centre=(15.0,124.0) r=12x9
(c) footprint tiles inside the wreck-scatter ellipse=0
(b) nearest graves to the mouth tile: (15.169,116.188)@21.19 (13.060,116.485)@21.57 (14.047,116.915)@21.94 | min grave y=116.188
(b) footprint->nearest grave: rect-model=9.17 tiles, tile-enumeration=9.19 tiles (threshold 3.25)
(d) currently-navigable water tiles consumed=412 of 725 footprint tiles (water=412, rim land=313)
(fix numbers) with the other half-extent held: max hz=17.94 tiles (25.4 world units, south edge y<=112.9) and max hx=40.00 tiles still clearing 3.25
```

Reading: (a) the 313 rim-land tiles are exactly the landward apron band x∈[1..13] — intended for the civic apron;
the seaward half (basin + arms, x ≥ 15) contains **zero** rim land and **zero** non-navigable water. (b) **The
footprint clears graves by 9.19 tiles, not marginally** — the plan's R5 warning ("south arm reaches y≈107
against graves from y≈113") overstates the proximity: the real nearest grave is at y = 116.19, x ≈ 15.2, and even
the full 24-tile alongshore envelope keeps 9.19 tiles ≥ 3.25. Headroom if a longer arm is ever wanted: the
envelope could grow to hz ≤ 17.94 tiles (south edge y ≤ 112.9) before any grave comes within 3.25; hx is
unconstrained by graves (all graves lie south of the envelope). (c) no overlap with the island landmass or the
wreck-scatter ellipse. (d) the envelope consumes 412 currently-navigable water tiles — the number L2's
footprint-derived exclusion radius should be fed, and the basin portion is intended to remain navigable by design.

## Claim 6 — calm mask (plan D6 / L3)

```
single-dock mask at the Mole root (15,95): radiusX=9 radiusZ=7 (clamp minimums 9 x 7, src/three/garden-docks.ts:1813-1814)
18 x 14 world-unit basin -> radii 9 x 7; the real function returns exactly those: true
9-station final ring through the same function: radiusX=18 radiusZ=13 centre=(82.6,90.1) tiles -> saturated at clamp maxima 18x13: true
```

Arithmetic and execution agree: an 18 × 14 basin is radii 9 × 7, **exactly the clamp minimum** — a single-dock
mask seated on the Mole basin sits at the bottom of the clamp range with no contraction, confirming D6's
"clamp minimum, no contract widening". Call-site claim confirmed by grep across `src/`:
`gardenHarborCalmMask` is referenced only by `src/three/garden-docks.test.ts:258-263`; the renderer's actual
masking is `registerHarborWater` at `src/three/world-renderer.ts:2985-3017`, which calls
`scene.water.setHarborCalmMask` directly (radiusX 13, radiusZ 9, calmStrength 0.7, seated just seaward of the
largest-USD dock) and never the exported function. L3's "dormant trap" characterisation holds — feeding the
9-station final ring through the function saturates it at the 18 × 13 maxima centred at tiles (82.6, 90.1),
covering no individual harbor.

## Claim 7 — batch composition at the proposed tiles (stand-ins for unbuilt forms)

9 recipes (8 mouths + pigeonnier) through the real `authorDock` + `createGardenHarborBatch`, with
`ethereum-mole → boathouse-precinct` (its declared replacement source) and `uogashi → annex-pavilion` as the
stand-in for the one unbuilt archetype; display tiles = the proposed mouth tiles; canvas stubbed exactly as
`garden-harbor-batch.test.ts:21-27` does.

```
recipes=9 (8 final mouths + pigeonnier; stand-ins: ethereum-mole->boathouse-precinct, uogashi->annex-pavilion)
drawables(batch.root)=15 (ceiling 20 per src/three/garden-harbor-batch.test.ts:61-69) | anchor-local drawables=0 (must be 0)
triangles: visible-tier=4456 fine-tier(hidden by default)=1099 total=5555
per-station merged-part triangles: ethereum-mole=738  ledger-fog-hook=399  warning-stone-notch=368  danger-gorge=333  watch-east-bay=404  watch-south-reed=331  calm-engawa-south=440  wreck-shoal-east=742  pigeonnier=521
per-station range: 331..742 (plan: today 468-934, target ~2-9k per station)
```

Confirmed: 9 stations compose into **15 drawables**, comfortably inside the ≤20 ceiling (`garden-harbor-batch.test.ts:60-69`),
with 0 drawables left on per-dock anchors — merging/instancing absorbs station count exactly as the plan's
budget argument requires, and the stand-in composition (9 stations vs today's 9) keeps the count flat.
`[INFERENCE boundary]` the plan's "~2-9k triangles per station" is a *target for geometry that does not exist
yet* (Phases 3-5) and cannot be machine-checked pre-implementation; what is machine-checked today is the
current-archetype baseline (331-742 merged-part triangles per station at sizes 4-8), the flat drawable count,
and the ~19.8k-per-station affordability arithmetic that the ≤9,000-triangle Mole budget fits inside.

## Claim 8 — `hyperliquid` vs `hyperliquid-l1` (corrected D8/L6)

Real `buildChainDocks` on a realistic feed containing exactly one of the two ids, plus the real
`assignGardenChainFlagCell` dye path (first `fillStyle` written to the painted cell; `#97fce4` is the
`CHAIN_FLAG_FIELD` brand for `hyperliquid-l1`, `#ad3f2f` is the passed health accent):

```
PREFERRED_DOCK_STATIONS keys (today, real module): ethereum, base, arbitrum, polygon, bsc, tron, solana, hyperliquid, aptos, avalanche, ton
id=hyperliquid     rendered=true preferredKeyHit=true preferredResolved=true cove=danger-gorge tile=(131,59) type=fishing-pier flagCell=0 firstFieldHex=#ad3f2f brandDyeResolved=false
id=hyperliquid-l1  rendered=true preferredKeyHit=false preferredResolved=false cove=danger-gorge tile=(131,59) type=fishing-pier flagCell=0 firstFieldHex=#97fce4 brandDyeResolved=true
```

Establishes which L6 defect bites for each raw id, through the real code paths:

- **Canonical id `hyperliquid`** (what `resolveChainId`-normalized feeds deliver, and the id
  `world-layout.ts:143` keys): preferred slot **resolves**; flag dye **misses** (`CHAIN_FLAG_FIELD` keys only
  `hyperliquid-l1`, `src/three/garden-chain-flag.ts:192`) and falls back to the health accent — the brand
  channel is lost today on the canonical id.
- **Alias id `hyperliquid-l1`** (raw upstream key, un-normalized): dye **hits**; preferred lookup **misses**
  (`hyperliquid-l1` is not a `PREFERRED_DOCK_STATIONS` key) and the chain falls to fill order — which today
  coincidentally lands on the same `danger-gorge` berth (first open outer slot), masking the slot defect at
  this feed shape but not in general.

Both halves of corrected L6 are confirmed as *separate, real* defects; neither requires moving the layout key
off `hyperliquid`, consistent with D8. (`VENDORED_CHAIN_MARKS` was not exercised — logoPath null in the feed —
and per the orchestrator's note it keys filename slugs, so it is out of scope for the id question.)

---

## Defects in the plan document (machine-found; orchestrator to apply)

1. **§4 pigeonnier tile is stale.** The table says `pigeonnier islet (124,125)`. The real
   `PIGEONNIER_HARBOR_DOCK_TILE` = `PIGEON_ISLAND_CENTER` − 1x = **(125,126)** (`zoneWorldTile({x:50,y:50})`
   lands on (126,126)). No behavioral consequence (the berth is untouched), but the coordinate is wrong, and it
   propagates to defect 2.
2. **§4 "min pairwise separation among lit stations = 7.3 tiles" is computed from the stale tile.** With the
   real (125,126), the minimum is **6.7 tiles** (same pair: `watch-south-reed` ↔ TON pigeonnier;
   hypot(3,6)). Still an authored today-pair, still zero trios — only the number needs correcting.

## Digest — FAIL / UNVERIFIABLE (most severe first)

1. **UNVERIFIABLE (by construction):** plan §6/§7 per-station "~2-9k triangles" and the ≤9,000-triangle Mole
   budget are Phase 3-5 authoring targets; only their affordability envelope is checkable today (claim 7).
2. **UNVERIFIABLE (out of scope):** plan §3 "762 valid candidates / body capacities 95/172/217/74" brute-force
   census was not re-run (not in the verification brief); all *selected* ring tiles were re-verified (claim 1).
3. **Plan-doc defect (minor):** §4 pigeonnier tile (124,125) → real (125,126); derived min-pairwise 7.3 → 6.7.
4. **No FAILs.** All machine-checkable claims (1-8, incl. 3z) PASS; the seawall question is resolved PASS by
   construction with ≥47.2 tiles clearance; Mole footprint grave clearance is 9.19 tiles (≥3.25) with headroom
   to hz ≤ 17.94 tiles; coverage under cap 8 holds across all four rotating feeds (one behavioural caveat: a
   richer generic can displace a named chain from its preferred archetype — feed D — while keeping every mouth
   lit and all metrics unchanged).
