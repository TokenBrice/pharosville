# 06 — Data inventory, current encodings, informativeness verdict

Author: DataInventory · 2026-10-13 · read-only on `main` (HEAD `d1bd2b0`)
Samples: `agents/2026-10-13-pharosville-reboot/prior-data/data/*.json` (7 files, 18–161 KB each, trimmed, no secrets)
Live frames used — all refreshed 10:46–10:56 on 2026-10-13, all healthy (`fleet 184 ships visible`, `logos 183/183`, `data live`):
`captures/main-live-{noon,golden,dusk,night,overview,gate900,gate1200}.png`, plus a separate 132-ship dense fixture set `captures/main-quiet-dense-*`;
`docs/pharosville/media/pharosville-desktop-shell.png` (2026-09-22, an **older build** — procedural tower, pre-Blender).

---

## Verdict (5–10 lines)

1. **The data is richer and more legible than the world uses; the world is richer than the data it shows.** Seven endpoints give 625 tracked assets, 396 peg rows, 110 scored chains, a 3,195-day daily PSI history and the only true hourly series in the set (24h mint/burn). The garden renders **184 ships**, **8 harbours + 1 pigeonnier**, 5 risk waters and **89 graves**.
2. **The fleet is not one-ship-per-stablecoin.** 421 of 625 payload assets have no local metadata row at all (`shared/data/stablecoins/coins.generated.json` has 217 ids; `activeAssets()` filters to 184) — see `src/systems/pharosville-world/stages/ship-placement.ts:107`. Two thirds of the API's universe is invisible by construction, and that is not flagged anywhere in the UI.
3. **Only four readings are promised at rest** (`docs/pharosville/CONTRACTS.md:232` and the keep-rest channel table at `:244-260`; echo at `docs/pharosville/VISUAL_INVARIANTS.md:170-215`): PSI (lighthouse + sky), water risk band, top-3 supply leaders (size + livery), and a subordinate 30-day PSI gravel trace. Everything else — peg trim, hull family, DEWS score, mint/burn cargo, safety grade, chain health, graves — is explicitly `inspection-only`. That decision is why the scene feels beautiful but mute: the interesting feeds were deliberately demoted to hover targets.
4. **Of the four rest readings, only two are actually decodable without the key.** In both sampled healthy frames (`main-live-golden.png` 17:30 and `main-live-noon.png` 12:15, each with `fleet 184 ships visible`) the lighthouse silhouette and the caption are clear, but the five risk-band water signatures read as *one* continuous blue-teal surface, and 92 of 184 hulls (50%) sit within 1.43× of each other on the compressed 0.42–1.15 scale.
5. **Today's drama is economically tiny and visually large.** 19 of 184 ships (10.3%) are in Warning/Danger water — but they hold **$1.16B of $326.0B = 0.4%** of rendered supply. Conversely the top-20 coins (95% of supply) sit in Calm/Watch/Ledger water with a worst deviation of −42 bps. A passive watcher sees a stressed corner that does not matter and a calm sea that does.
6. **Half the fleet would be noise if promoted.** 89 of 182 graded ships carry D or F. `cue.ship.safety-watch` is already inspection-only; raising it would paint ~48% of hulls identically.
7. **The two genuinely *changing* stories — net mint/burn flow (hourly swings −$179M…+$186M in one 24h window) and supply momentum (24h/7d/30d per coin and per chain) — have no rest encoding at all.** The only supply-momentum cue (`cue.world.supply-tide`) is inspection-only and deliberately quiet.
8. **Recommendation in one line:** keep the garden; re-cut the information hierarchy around *fleet-level state* (one number, one direction, one shape) rather than *per-coin detail*, and give the two flow/momentum stories a calm rest carrier each. No new art direction is needed for the data layer — the data is already there and already typed.

---

## 1. Method and provenance

- `npm run smoke:api-local` → all 7 allowlisted endpoints 200, `age` 125–2750 s, cache `s-maxage=300`.
- All 7 fetched through the local dev proxy `http://localhost:5173/api/...` (`.env.local` server-side; no key in the browser or in any saved file — verified by regex scan of `agents/2026-10-13-pharosville-reboot/prior-data/data/`).
- Types cross-checked against `shared/types/market.ts`, `core.ts`, `chains.ts`, `stability.ts`, `safety-grades.ts`, `mint-burn.ts`, and the runtime classifiers `shared/lib/classification.ts`, `shared/lib/pharosville-endpoint-registry.ts`, `shared/lib/cron-intervals-client.ts`, `shared/lib/api-freshness.ts`.
- Snapshot instant: `updatedAt` 1791879552 = 2026-10-13 10:19 UTC. Sources are one moment in time; every number below is that moment.
- Counts of "ships" are computed from the real eligibility rule, not guessed.

---

## 2. Endpoint catalog

### 2.1 `/api/stablecoins` — supply and identity (essential)

| | |
|---|---|
| Entities | `peggedAssets[]` — **625** assets; `fxFallbackRates` — 36 currencies |
| Granularity | one row per stablecoin id, with per-chain circulation |
| `_meta` | `updatedAt 1791879552`, `ageSeconds 125`, `freshBudgetSec 4800`, `degradedBudgetSec 7200`, `status fresh` |
| Producer cadence | `sync-stablecoins` every **900 s**; endpoint max-age 900 s (`shared/lib/cron-intervals-client.ts:17`) |
| Units | USD (and per-peg currency bucket), unix seconds |

Key fields: `id, name, symbol, price, priceConfidence, priceUpdatedAt, priceObservedAt, priceObservedAtMode, consensusSources[], agreeSources[], supplySource, circulating{pegBucket→usd}, circulatingPrevDay/PrevWeek/PrevMonth{...}, chains[], chainCirculating{chainName→{current,prevDay,prevWeek,prevMonth}}, contracts[]`.

Real distributions (625 rows):

| Measure | Value |
|---|---|
| Total circulating | **$344.5 B** |
| USDT / USDC | 53.41 % / 21.12 % |
| top-1 / top-3 / top-10 / top-20 share | 53.4 % / **76.6 %** / **84.8 %** / 90.3 % |
| assets < $1 M | **215** (34 %); < $100 k: 116; exactly $0: 3 |
| pegType | peggedUSD 490, peggedEUR 34, peggedGOLD 12, peggedVAR 11, GBP 8, JPY 7, … 33 distinct |
| pegMechanism | crypto-backed 347, fiat-backed 148, rwa-backed 102, algorithmic 27, **1 typo `crytpo-backed`** |
| priceConfidence | single-source 382, high 113, **null 102**, fallback 23, low 5 |
| chains per asset | mean 3.72, max 157, >1: 304, single: 314, none: 7 |
| distinct chain names referenced | **225** (vs 110 scored in `/api/chains`) |
| contracts | 1 817 |

Temporal: only four lookback points per asset (now, −1 d, −7 d, −30 d) plus a price timestamp. **No per-coin supply history array.**

### 2.2 `/api/chains` — where the supply sits (essential)

| | |
|---|---|
| Entities | `chains[]` — **110** |
| Aggregates | `globalTotalUsd $322.37 B`, `chainAttributedTotalUsd $312.82 B`, `unattributedTotalUsd $9.55 B` (**3.0 %**), `dominanceGeometryTotalUsd`, `globalChange24hPct/7dPct/30dPct` |
| `_meta` | fresh, `freshBudgetSec 1800`, embedded `dependencies.reportCards`, `safetyScoreIdentity` (model v9 / methodology 10.17) |
| Cadence | producer `sync-stablecoins` 900 s; endpoint max-age 1800 s |

Per chain: `totalUsd, change24h/Pct, change7d/Pct, change30d/Pct, stablecoinCount, topStablecoins[5]{id,symbol,share,supplyUsd}, dominantStablecoin, dominanceShare, healthScore 0–100, healthBand, healthFactors{concentration,quality,pegStability,backingDiversity,chainEnvironment}, pegStabilityCoverage{...}, chainEnvironmentEvidence{resilienceTier}`.

| Measure | Value |
|---|---|
| Ethereum | **47.60 %** ($148.9 B, 128 stablecoins, band `robust`, score 82, concentration factor 66) |
| Tron | **30.45 %** ($95.3 B, **9** stablecoins, band `mixed`, score 57, concentration factor **4**, USDT share 97.8 %) |
| top-5 / top-10 share | **90.8 %** / 95.7 % |
| chains < $1 M | 25 |
| healthBand | healthy 53, mixed 48, fragile 4, robust 1, **null 4** |
| healthScore buckets | 30–39: 4, 40–49: 18, 50–59: 30, 60–69: 35, 70–79: 18, 80–89: 1, null: 4 |
| stablecoinCount | min 1, median **4**, max 128 |
| chainEnvironmentEvidence tier | 1: 1, 2: 61, 3: 14, **null 34** |
| `healthScore` null for | Stellar and 3 others |

Temporal: three deltas per chain; no series.

### 2.3 `/api/stability-index?detail=true` — the headline number (enricher)

| | |
|---|---|
| Current | `score 91.2`, `band BEDROCK`, `avg24h 91.3`, components `{severity 0.02, breadth 6.62, stressBreadth 1.81, trend −0.37}`, `contributors[]` (top coins with `bps`, `mcapUsd`, `ageDays`) |
| History | **3 195 daily closes, exactly 86 400 s apart, 2018-01-14 → 2026-10-13**, newest-first, each `{date, score, band, methodologyVersion}` |
| Cadence | `stability-index` cron 1800 s; endpoint max-age **86400 s** (daily by contract) |
| Methodology | v3.67, changelog path published |

Band distribution over 8.8 years: **BEDROCK 3 010 (94.2 %), STEADY 132 (4.1 %), TREMOR 25, MELTDOWN 18, CRISIS 6, FRACTURE 4.** Non-BEDROCK = 5.8 % of days; non-BEDROCK/STEADY = **1.7 %**.
Last 30 days: min 89.7, max 94.2, **spread 4.5 points**, 28 BEDROCK + 2 STEADY.
17 distinct methodology versions in the file (edges are real discontinuities, not noise).

**This is the single hardest constraint on the whole concept: the flagship metric is nearly constant, and its rare excursions are the only genuine "event" the data contains.**

### 2.4 `/api/peg-summary` — is the peg holding (enricher)

| | |
|---|---|
| Entities | `coins[]` — **396**; `summary` object |
| `summary` | `activeDepegCount 21`, `coinsAtPeg 213`, `totalTracked 248`, `medianDeviationBps 13`, `worstCurrent {pmUSD, −3544 bps}`, `depegEventsToday 0`, `depegEventsYesterday 0` |
| Cadence | `sync-stablecoins` 900 s |
| Units | signed basis points vs peg reference |

| Deviation (n = 248 coins that have one; **138 are null**) | |
|---|---|
| \|dev\| median / p75 / p90 / p95 / p99 | 13 / 54 / 188 / 366 / 1 798 bps |
| \|dev\| > 10 / 25 / 50 / 100 / 200 / 500 / 1000 bps | 134 / 88 / 66 / 39 / 23 / 9 / 6 coins |
| min / max | −3 544 bps (pmUSD) / +1 716 bps (sUSD) |
| governance | centralized-dependent 201, centralized 180, decentralized 15 |
| `primaryTrust` | confirm_required 345, authoritative 41, **unusable 10** |
| `eventCount` | 17 105 events across 129 coins; `trackingSpanDays` max 1 461 |
| `recent90d` present | 258 / 396 (138 null) |
| `historyCoverage.status` | assumed 257, verified 1, absent 138 |

Per-coin fields: `currentDeviationBps, pegScore, severityScore, spreadPenalty, eventCount, worstDeviationBps, activeDepeg, lastEventAt, trackingSpanDays, observationStartedAt, recent90d{windowDays,observedDays,pegPct,incidentCount,thresholdCrossingCount,worstDeviationBps}, pegReference{valueUsd,source,contributorCount,asOf}, dexPriceCheck, primaryTrust`.

**Trap:** `activeDepeg` (a *state*, 21 today) and `depegEventsToday` (an *event count*, 0 today) disagree by design. A cue that conflates them will lie. Also, `recent90d` gives a *count*, never the dates.

### 2.5 `/api/stress-signals` — DEWS early warning (enricher)

| | |
|---|---|
| Coverage | `eligibleCount 396`, `computedCount 258` (**65.15 %**), `missingCount 138`, `coverageStatus "degraded"`, `coverageReasons ["partial-coverage"]` |
| Entity | `signals{}` — **object keyed by coin id**, not an array (easy to get wrong) |
| Cadence | `compute-dews` 1800 s |
| Per coin | `score 0–100`, `band`, `signals{supply,pool,liq,price,diverg,black,flow,yield}` each with `available`, `amplifiers{psi,contagion}`, `computedAt`, `ageClassification` |

| Band | Count |
|---|---|
| CALM | 136 |
| WATCH | **113** |
| ALERT | 8 |
| WARNING | 1 |
| DANGER | 0 |
| score | min 0, median 14, **max 61** (hbd-hive) |

Sub-signal availability out of 258: `price` 258, `supply` 257, `diverg` 247, `liq` 192, `pool` 95, `flow` **44**, `yield` **38**, `black` **33**. 172/258 carry non-neutral `amplifiers`.

**Verdict on this feed: it is a 4-band distribution (CALM/WATCH only, in practice) over two thirds of the universe.** WATCH being 44 % of computed coins means "Watch" carries almost no discriminating power at fleet level.

### 2.6 `/api/safety-grades` — static quality tier (enricher)

| | |
|---|---|
| Entities | `grades[]` — **182** rows, `{id, score, grade, ratingStatus, partialEvidence}` |
| Model | `v9`, `methodologyVersion 10.17`, `schemaVersion 1`, `publicationStatus "current"`, `asOfSec` ≈31 min before the fetch |
| Cadence | `publish-report-card-cache` 900 s publication; grades change only on a model/methodology event |

| Grade | A+ | A | A- | B+ | B | B- | C+ | C | C- | D | F | NR |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| count | 1 | 3 | 5 | 7 | 7 | 6 | 14 | 20 | 23 | **49** | **40** | 7 |

`score` 17–88 (median 49), **7 null**. `partialEvidence` on 19 rows (`reasonCode partial-evidence-pipeline-gap`).
**D + F = 89 of 182 = 48.9 %. This is a static tier, not a story: it will look identical next month.**

### 2.7 `/api/mint-burn-flows` — the only flow feed (enricher, and the best "story" source)

| | |
|---|---|
| Scope | **`chainIds ["ethereum","base","arbitrum"]` only** — label "Configured issuance chains" |
| Window | 24 **closed** UTC hours, `semantics "closed-utc-hours"` |
| Entities | `coins[]` **131** (of which **56 have any 24h activity**, 75 inactive); `chains[]` 3; `hourly[]` 24 |
| Gauge | `score −24.89`, `band CAUTIOUS`, `intensitySemantics "signed-v2"`, `flightToQuality **false**`, `flightIntensity 0`, `trackedCoins 131` |
| Sync | `lastSuccessfulSyncAt`, `freshnessStatus "fresh"`, `criticalLaneHealthy true` |
| Cadence | `sync-mint-burn` 1800 s; endpoint max-age 3600 s |

Per coin: `netFlow24hUsd/7d/30d/90d, mintVolume24hUsd, burnVolume24hUsd, mintCount24h, burnCount24h, largestEvent24h{direction,amountUsd,txHash,timestamp}, netFlowDirection24h (inactive|minting|burning|flat), pressureShiftState (nr|stable|improving|worsening), pressureShiftScore, baselineDailyAbsUsd, baselineDailyNetUsd, coverage{startBlock,lastSyncedBlock,lagBlocks,has24h/30d/90dWindow,isPartial,status,adapterKinds,startBlockConfidence}, valuation{window24h{completeness},…}`.

Real numbers this snapshot:
- fleet net 24 h **−$175.5 M**; direction: inactive 75, minting 32, burning 23, flat 1.
- top mints: USTB **+$27.9 M**, USDY +$12.9 M, syrupUSDT +$12.7 M, USDe +$9.1 M, USDG +$8.7 M.
- top burns: USDC **−$241.5 M**, USD1 −$13.7 M, DAI −$12.1 M, USDf −$10.2 M.
- `hourly[24]` net: min **−$179.2 M** (23:00), max **+$185.9 M** (00:00) — a genuine hour-to-hour signal.
- chains: ethereum −$176.4 M, arbitrum +$0.91 M, base −$21 k.
- `pressureShiftState`: nr 82, stable 19, improving 19, worsening 11.

**This is the only endpoint whose values move on a scale a passive viewer could plausibly perceive in minutes.**

---

## 3. Cardinality summary (what the world has to draw from)

| Quantity | Count | Source |
|---|---|---|
| Tracked assets in payload | 625 | `/api/stablecoins` |
| Assets in local metadata registry | 217 (205 active, 1 frozen, 11 pre-launch) | `shared/data/stablecoins/{canonical-order,coins.generated}.json` |
| Payload assets with **no** local metadata | **421 (67 %)** | intersection |
| **Ships actually rendered** | **184** (`fleet 184 ships visible`, `main-live-golden.log`); capacity 320 (`docs/pharosville/CONTRACTS.md:554`) | `activeAssets()` |
| Peg rows | 396 (248 with a deviation) | `/api/peg-summary` |
| DEWS rows | 258 of 396 eligible | `/api/stress-signals` |
| Safety grades | 182 | `/api/safety-grades` |
| Chains scored | 110 | `/api/chains` |
| Chain names appearing inside assets | 225 | `/api/stablecoins` |
| **Rendered harbours** | **8 + TON pigeonnier** (`MAX_CHAIN_HARBORS = 8`, `src/systems/chain-docks.ts:14`) | `/api/chains` |
| Named waters | 5 risk (Calm/Watch/Alert/Warning/Danger) + Ledger Mooring + Wreck Shoal = 7 | `src/systems/risk-water-areas.ts` |
| **Graves (cemetery)** | **89** = 88 in `shared/data/dead-stablecoins.json` + 1 frozen (`usr-resolv`) | `shared/lib/cemetery-runtime.ts` |
| Mint/burn tracked coins | 131 (56 active), 3 chains, 24 hours | `/api/mint-burn-flows` |
| Logo assets decoded | 183/183 | `main-live-golden.log` |

---

## 4. Encoding audit — every data→visual mapping today

Tiers are the code's own `presentationTier` (`src/systems/visual-cue-registry.ts`): **R** = `keep-rest`, **I** = `inspection-only`, **X** = retired.
"Legible?" is judged on `main-live-golden.png` (1600×1000, rest seat), not on the key text.

| # | Encoding | Data source | Visual carrier | Tier | Legible at rest? | Passive viewer learns it? |
|---|---|---|---|---|---|---|
| 1 | Lighthouse beacon/beam + sky + far ranges | `stability.current.band` | glow/opacity, 3 far ranges, 6 cloud states | R | **Partly** — clear sky w/ 2 strokes = BEDROCK is readable *only* if you know the codebook; the lighthouse is unambiguous as a *presence* | Band family, yes; "91.2 / 100" no |
| 2 | Harbor light (7-source lamp) | `freshness.*` across 7 endpoints | lamp temperature + sweep speed | R | No — reads as "warm lamp" | No; the caption does the work |
| 3 | Docks/water haze | `freshness.chains` / `freshness.pegSummary` | low fog over quays / risk water | R | No | No |
| 4 | Water body signature (5 risk + 2 non-risk) | `stress.signals[].band`, `pegSummary`, `navToken`, `cemeteryEntries` | mirror / ribbons / pairs / triples / quads + ≤2 stone stele names | R | **No** — in the golden frame the sea reads as one surface; band texture is sub-threshold at rest | **No. This is the core failure.** |
| 5 | Ship berth (6 placements) | `pegSummary.coins[]`, `stress.signals[]` | position inside a named water | R | Position clusters are visible; *which* water they're in is not | Partly — "there's a crowded corner" |
| 6 | Ship size | `circularing` via `clamp(0.42·(cap/1e6)^0.10, 0.42, 1.15)` (`ship-visuals.ts:160`, `CONTRACTS.md:628`) | hull scale | R | **Weak** — 92/184 ships ≤0.60; 45 ≤0.50; only 3 ≥1.0; 2 saturate at 1.15 | Top-3 leaders yes; the rest indistinguishable |
| 7 | Ship identity | branding registry | mon/initials on a full sail | R | Large sails only (family admission at 28 CSS px, departure <22 px) | Top ~10 only |
| 8 | 30-day PSI gravel furrow | `stability.history` (≤30 daily closes) | narrow non-emissive furrow, 0–100 axis | R | No (sub-pixel band at rest) | No |
| 9 | Signal mast pennants + storm cone | count of top-20 supply coins off peg (hoist of 5); cone at ≥1 % of tracked supply off peg | small pennants/cone on the observatory terrace | I | No | No (invisible at rest) |
| 10 | Peg trim | `currentDeviationBps` sign, ±50/±200 bps → ±0.08/±0.16 waterline | hull rides high / low | I | No | No |
| 11 | Hull family (6 silhouettes, 9 classes) | `flags.governance/backing/yieldBearing/navToken/pegCurrency` | silhouette form + timber | I | No (by contract) | No |
| 12 | NAV / yield mast signals | `flags.navToken` / `flags.yieldBearing` | blue / green square + pennant | I | No | No |
| 13 | Safety-watch square | `safetyGrades.grades[].grade ∈ {D,F}` | checkered square | I | No | No — and **89/182 ships would carry it** |
| 14 | Cross-bearing buoy | `dexPriceCheck.agrees === false` | b&w striped buoy | I | No | No |
| 15 | Age patina | contributor `ageDays`, `launchDate`, `trackingSpanDays` | even wood value shift | I | No | No |
| 16 | Zone weathering | Warning/Danger placement | dark waterline band + salt streaks | I | No | No |
| 17 | Ship cargo work + crane lift | `mintBurn.coins[]` volumes, `largestEvent24h` | lighters aboard/ashore; top-3 only animate | I | No | No |
| 18 | Dock cargo tide | `mintBurn.coins[].netFlow24hUsd` allocated by held supply | ≤6 canvas-topped crates | I | No | No |
| 19 | Flight-to-quality tenders | `gauge.flightToQuality` (**false today** → nothing drawn) | small tenders under big hulls | I | n/a today | n/a |
| 20 | Dock size/type/frontage | `chains[].totalUsd`, `topStablecoins` | hall length/span at a rim cove | I | Frontage differences visible; *meaning* not | No |
| 21 | Quay condition masonry | `healthFactors` average | granite vs cracked masonry + leaning bollard | I | No | No |
| 22 | Dock congestion crates | `healthFactors.backingDiversity` (<0.50 floor) | crate stack on the quay | I | No | No |
| 23 | Ethereum Mole monument | fixed identity of the `ethereum` row | standalone stone mole, the ring's one vertical | I | Yes as *object*; no as *reading* | Only "Ethereum is here" |
| 24 | Supply tide (tidal flat) | `chains.globalChange7dPct`, 2 % full scale | waterline over a sand flat + tide-stone | I | No | No — deliberately quiet |
| 25 | Wrack line | stored last-visit tide | broken weed line | I | No | No |
| 26 | Graves (stone garden) | `cemeteryEntries[].causeOfDeath` + `peakMcap` (log) | 89 set stones, 3 cause families, **off-frame at rest** (`STONE_GARDEN_SITE` y = 136.8) | I | **Not in frame at all** | No |
| 27 | Anniversary lantern | death **month** | one stone lantern lit | I | Only on ~1 night/month | Rarely |
| 28 | Pigeonnier roost + circling pigeons | notable movers; `depegEventsToday/Yesterday` | bird count ≤12 | I | No | No |
| 29 | Maker/Sky squad formation | squad membership + flagship risk | shared berth | I | No | No |
| 30 | Day score rituals (heron, meteor, kindling, koi, fireflies…) | **none — decorative** | ambient motion | R | Yes, atmosphere | Learns nothing (correct: declared decorative) |

**Count: 4 rest-coded readings (1, 4, 5+6+7, 8) + 2 qualifiers (2, 3); 24 inspection-only channels; 30 total.**

---

## 5. Legibility evidence from the frames

**`main-live-golden.png` (17:30, 184 ships, `fleet 184 ships visible`, `logos 183/183 decoded`)**
- Lighthouse: unambiguous, large, centre-right; sky clear with two thin strokes (consistent with PSI 91.2 / BEDROCK). The *band* is only readable because I know the codebook.
- Water: from the near shore to the far ranges it is one continuous blue-teal plane. I cannot separate Calm Anchorage from Watch Breakwater from Alert Channel by surface signature at this camera. The stele names are not resolvable.
- Ships: a dense harbour cluster on the left reads as *many small similar boats with pale sails*; a handful of logos are legible (a few large sails, right side). 92 of 184 hulls are within 1.43× of each other in size.
- Harbours: 3–4 station buildings visible with nobori banners; their supply ordering is not inferable.
- Graves, tidal flat, signal mast, tenders, buoys: not perceivable in this frame.
- Caption does the informational work: `17:30 — a quiet afternoon · a clear sky · endpoints current; coverage qualified`.

**`main-live-noon.png` (12:15, 184 ships, corroborating frame)**
- Same reading as golden, in flat noon light: the sea is one continuous plane from the near shore to the far ranges — no band boundary is separable by eye. Sails are pale and near-identical in tone; legible logos are confined to a few large hulls (left harbour cluster and two on the right). The caption again carries the reading: `12:15 — a quiet noon · a clear sky · endpoints current; coverage qualified`.
- This frame is the strongest single argument for finding 4: at *both* sampled hours, with a healthy 184-ship fleet, the only decodable market reading in frame is the caption.

**Correction (2026-10-13 10:56):** earlier `main-live-noon*` frames in this folder were taken at ~10:22 during a network outage (`502 /api/stablecoins`) and showed an **empty** fleet. Those files were overwritten by the healthy ~10:46 capture set above, so that outage evidence no longer survives in this folder in any form — `captures/failure-main-display.log` is a separate X-server launch failure, not the outage. Provenance in this report reflects the healthy set only, and none of the findings depend on the deleted frames.

**`docs/pharosville/media/pharosville-desktop-shell.png` (2026-09-22)** — an older build with a procedural tower; shows the same pattern (readable lighthouse, uniform water, logo sails legible only on the largest hulls).

**`main-quiet-dense-*` set** (separate 132-ship / 131-logo fixture, `fleet 132 ships visible`): a denser fleet than the live 184-ship run but the same fixture family. Corroborates the density finding — it does not add a different conclusion, and it is not the live feed.

**Evidence gap, stated plainly:** there is no real-GPU capture of an *inspection* state (a peg-trim, a mast signal, a cargo tide) in `captures/`. Every judgement above about tiers 10–29 is derived from source and the contract, not from an observed frame. Marked `[INFERENCE]` where it matters.

---

## 6. Informativeness verdict — the stories, ranked

Ranking is by "a passive watcher should absorb this", then by how well the world currently carries it.

| # | Story | Data bearing it | Currently encoded? | Verdict |
|---|---|---|---|---|
| **S1** | **Overall peg health today** — is the market calm? | `stability.current.score/band` (91.2 BEDROCK), `pegSummary.summary.activeDepegCount 21`, off-peg supply share | Yes: lighthouse + sky (R) | **Best-encoded story in the app.** But it under-reads: 94 % of days are BEDROCK, so at rest it is "calm" almost always, and the *scale* of near-misses is lost |
| **S2** | **Which coins are stressed right now** | 21 active depegs, 9 ALERT/WARNING DEWS, 66 coins >50 bps | Partly: berth in a water band (R) — but the band itself is illegible and the coin's own magnitude is `I` | **Poor.** 19 ships in Warning/Danger hold **0.4 % of supply**; the story that matters (which *material* coin is wobbling) is not on screen |
| **S3** | **Who is growing / shrinking** | per-coin `circulatingPrevDay/Week/Month`, per-chain `change24h/7d/30d`, `globalChange7dPct` | Effectively **not at all** live: `cue.world.supply-tide` is `I` and deliberately quiet; cargo tide is `I` | **Missing.** This is the single most under-served story relative to its data quality |
| **S4** | **Net mint vs burn today (flow)** | `mintBurn` — net −$175.5 M, hourly −$179 M…+$186 M, gauge CAUTIOUS | Only as `I` lighters/crates/tenders; gauge `flightToQuality=false` → tenders absent | **Missing at rest.** The only feed with hour-scale variation |
| **S5** | **Chain distribution / concentration** | Ethereum 47.6 %, Tron 30.5 %, top-5 90.8 %; Tron = 9 coins, 97.8 % USDT | 8 harbour frontages (`I` for meaning, visible for form) | **Poor.** Frontage exists but nothing says "one chain holds 48 % of everything" |
| **S6** | **Recent failures / history** | 89 graves; 17 105 historical depeg events; PSI 8.8 y with 53 stressed days | Graves `I` and **off-frame at rest**; the 30-day furrow `R` but sub-pixel | **Effectively not encoded.** The one thing a garden metaphor does beautifully (a cemetery of dead coins) is placed outside the rest view |
| **S7** | **Quality tier of the fleet** | safety grades: 89 D/F of 182 | Dropped to a `I` checkered square | **Correctly demoted.** At 48.9 % prevalence it would be visual noise |
| **S8** | **Is the data itself trustworthy right now** | freshness/coverage: `stress coverageStatus degraded` (65 %), 138 peg rows missing a deviation, 3 % unattributed supply, `coverage qualified` in the caption | Lamp temperature + haze (R) + the caption clause | **Present but unlearnable** — the caption word is the only channel that actually communicates it |

**Noise (encodings that carry no differential signal):**
- **184 logo sails.** Identity is not a fleet-level story; at rest the overwhelming majority are illegible (`<22 px` departure threshold). It is 184 decorative objects, one legitimate rest reading (top-3 leaders) buried in it.
- **89 identical D/F checkered squares** (if ever promoted) — 48.9 % of the fleet.
- **113 WATCH + 136 CALM DEWS bands** — 96.5 % of computed coins; the band layer is a two-state field, so a five-state water codebook spends its legibility budget on states that rarely occur (DANGER count today: 0).
- **58 ships under $10 M** (11 of them under $1 M) sit at scale < 0.53; 45 sit at ≤0.50 — a large undifferentiated shoal of near-identical micro-hulls. They are 32 % of the fleet and a rounding error of its supply.
- **The Tide/"Wreck" pair** requires the key to distinguish from the risk ladder; at rest both just look like water.
- **Age patina, hull family, weathering, quay masonry** — three separate aesthetic systems for `I` facts that share one appearance channel (surface value/roughness). They read as *texture*, not data.

---

## 7. Recommended information hierarchy (no implementation)

Design rule: **the garden should answer one question per viewing duration, and the answer should be one shape, not 184.**

### Glance (≤5 s)
1. **Market state, as one number made visible**: PSI band via the sky/lighthouse as today — but add exactly one honest *magnitude* carrier, because "BEDROCK" is true 94 % of the time. Candidate: the tower's beam *reach*/halo radius, or the number of clear far ranges (3 = calm … 0 = crisis), i.e. give the existing 6-state codebook a continuous second axis below it.
2. **Peg pressure**: one fleet-level mark near the tower = *share of tracked supply off peg* (today: tiny). Today this data exists (`offPegSupplyShare` in `buildSignalMast`) but is bound to `I` mast pennants. Move the **aggregate** to rest; keep per-coin pennants at `I`.
3. **Flow direction**: one mark = net mint vs burn over the trailing 24 h (today −$175 M, i.e. net redemption). Neither direction nor magnitude is visible anywhere today.

### Watch (≤1 min)
4. **Which waters are populated** — make the water read as five *populations*, not five textures: e.g. the calm/warn/danger distinction must survive as **silhouette/shoreline** differences (reed beds, bars, cliffs), not as stroke density inside a same-coloured plane. Data: `resolveShipRiskPlacement` counts.
5. **Who is moving** — a small, slow, unambiguous rotation: which *material* coin is climbing or sliding in supply rank (per-coin `circulatingPrevWeek` + chain `change7dPct`). Today only the tidal flat carries a 7-day reading and it is invisible.
6. **Where the supply lives** — chain concentration as a *composition* the viewer can see without counting: 8 harbours whose relative *mass* answers "Ethereum is half of everything" (data: 47.6 / 30.5 / 12 %). The Mole already owns "Ethereum"; it needs to own "half".

### Inspect (deliberate)
7. Keep the whole existing `I` inventory reachable — peg trim, hull family, mast signals, DEWS score, cargo, breaks, grades, graves — exactly as now. This layer is already complete and contract-compliant (`CONTRACTS.md:222-455`, `VISUAL_INVARIANTS.md:170-229`). It is the *record*, not the *reading*.
8. **Move the stone garden into the rest frame or accept it is invisible.** 89 coins died; the cemetery is the strongest narrative asset in the dataset and it currently sits off-frame at the rest seat (`STONE_GARDEN_SITE` y≈137).

### Candidate calm encodings (concept only)

| Story | Candidate carrier (garden-native, static, non-alarming) |
|---|---|
| S1 magnitude | **Beam reach / far-range count** — how far the light actually cuts; or the number of the three borrowed ranges standing clear. Continuous, calm, already sourced |
| S2 peg pressure | **A single floating lantern-ring around the tower** whose *closed fraction* = share of supply at peg. One object, one arc, no per-coin work |
| S3 supply momentum | **The tidal flat, promoted and duplicated at fleet scale**: bare sand / standing water against a fixed tide-stone is already the right metaphor — it just needs to be in frame and to move on a readable scale (today ±2 % of full → effectively never moves) |
| S4 flow | **Water level at the harbour mouths vs the open sea**, or a single slow current tongue leaving/entering the bay. The `hourly[24]` series is the only genuinely hour-varying input; anything that shows it must be a *continuous surface*, not a per-ship prop |
| S5 chain concentration | **Shore-mass / harbour fullness**: one big hall = one chain's share, read as occupancy of a basin rather than as building length |
| S6 failures | **The cemetery inside the rest frame**, sized by peak cap — near enough to be *seen*, far enough that it stays a garden bed rather than a graveyard |
| S8 data trust | **Weather, once, and only for truth**: today haze is spread across quays and waters as four overlapping channels. One honest sky state ("the reading is behind") is learnable; four is not |

---

## 8. Honest limitations of this inventory

- One snapshot. "Changes hour to hour" is inferred from producer cadence (900 s / 1800 s) and from the `hourly[24]` spread, not from two observations. `[INFERENCE]` for every cadence claim beyond the documented cron map.
- Legibility of `inspection-only` cues (peg trim, mast signals, cargo, buoys, patina, tenders, roost) is **not** observed in any capture; the `I` column verdicts are derived from the cue registry and the CONTRACTS presentation tiers. All `captures/main-live-*` frames sampled are healthy rest frames (`fleet 184 ships visible`, `logos 183/183`) — none enters selection or inspection.
- The ~10:22 outage frames (`502` on `/api/stablecoins`, empty fleet) were overwritten at ~10:46 and survive nowhere in this folder; the remaining `failure-main-display.log` is an unrelated X-server launch failure. Nothing in this report depends on the deleted frames.
- Fleet counts (184) are computed from the live payload against the local registry and match the live capture log exactly, but the registry is a local file that the server does not control: a payload id absent from `coins.generated.json` silently produces no ship.
- Two data-quality defects worth flagging upstream, both real in this snapshot: `pegMechanism` contains the typo `"crytpo-backed"` (1 asset), and `healthScore`/`healthBand` are `null` for 4 chains while `chainEnvironmentEvidence` is `null` for 34 — the UI must not render those as calm.
