# 10 — Data alive (data semantics)

Vertical 10 of the prettier sweep. Read-only study of `shared/types/**`, `src/harbour/data/fetch.ts`,
`src/harbour/model/**`, `src/harbour/readings/bind.ts`, `src/harbour/sim/sim.ts` (diff voyages),
`src/harbour/civic/**` and `src/harbour/ui/{Panel,Ledger,facts}.tsx`. No captures taken (none needed:
this is a data report).

## 1. Current state

- **The grammar is small and strict** (`readings/bind.ts` header): PSI → beam rhythm/reach/lamp; off-peg
  share → sea state (4 steps); DEWS supply-weighted band → weather + Storm-station shapes; fleet 7d supply
  → tide gauge; 24 h mint/burn → Mint and Burn fires (`civic/flows.ts`); stale `/api/stablecoins` → fog.
  Per hull: size = supply decade (`classify.ts hullClassFor`), rig = peg currency, dock time = chain share,
  Shoals + list = `activeDepeg`/bps (`sim.ts heelBase`), stern lamp = has a peg reading (`variants.ts`).
- **Snapshot diffs already move hulls** (`sim.ts install()`): depeg → Shoals, recovery → rejoin, new id →
  Slipway launch, death → tow to Wreck Cove, re-plan on `planKey`. First load never replays. But these are
  **motion only**: no staging, no sound, no DOM record of the moment. `EV_*` codes are consumed nowhere
  outside the sim.
- **Civic boards are data-bound and cheap**: Registry grade tally (`gradeTally`), Harbourmaster movers
  hoist from chains `change24hPct` (`topMovers`), painted through `CivicBoards`. A proven pattern for
  "drawings from data" with one canvas slot each.
- **The model reads less than it is sent.** `CoinRow` types `price`, `circulatingPrev*` but only the Panel
  uses the prev buckets; `MintBurnPayload` drops `coins[]`; `StressPayload` drops per-signal components
  and amplifiers; `StabilityPayload` drops `components`, `history`, `inputDegradation` (the Panel reads them
  raw from the feed).
- **Honesty gaps found (fix regardless of prettiness):**
  1. The **tide gauge has no DOM equivalent**: `tide-gauge` is a `LandmarkId` but `PanelContent` has no
     case for it and `facts.ts` no hover fact; `globalChange7dPct` is shown nowhere in text.
  2. **PSI `inputDegradation`** (`dewsUnavailable`, `depegEventsUnavailable`) is ignored: the beam can burn
     at full certainty on a score computed without DEWS. Same class: stress `coverageRatio` and peg
     `depegEventCoverageLimited` are unused.
- Per-coin DEWS band and safety grade have **no per-hull expression** (only aggregate weather and the
  grade tally board) — the Storm panel's "Alerts" list has no world twin.

## 2. MAP — every field → World / DOM / Unused

W = expressed in the world, D = panel/ledger/hover only, U = unused.

| Endpoint · field | State | Where |
|---|---|---|
| **stablecoins** `id,name,symbol,logo,brand` | W+D | hull livery, labels, Ledger |
| `pegType` | W+D | rig family; Ledger "Peg" |
| `circulating` (sum) | W+D | hull class; Panel Supply |
| `chainCirculating[c].current` | W+D | circuit dock-time, harbour supply; Panel "Supply by chain" |
| `chainCirculating[c].circulatingPrev{Day,Week,Month}` | U | sanitised, never read |
| `circulatingPrev{Day,Week,Month}` | D | Panel Supply 24 h/7 d/30 d |
| `chains[]` | W | home fallback when nothing attributed |
| `price, priceSource, priceConfidence, consensusSources, agreeSources, pegMechanism, supplySource, frozen` | U | |
| **chains** `name,totalUsd` | D | `chainsTotalUsd` (world uses coin-summed totals) |
| `change24hPct` | W+D | movers hoist; Harbour panel |
| `change7dPct, change30dPct` | D | Harbour panel |
| `healthScore` | D | Harbour panel "Chain health" |
| `healthBand, healthFactors, dominanceShare, stablecoinCount, dominantStablecoin, topStablecoins` | U | |
| `globalChange7dPct` | **W only** | tide gauge — no DOM (gap) |
| `globalTotalUsd, chainAttributedTotalUsd, unattributedTotalUsd, globalChange24h/30dPct` | U | |
| **stability** `current.score, band` | W+D | beam; Pharos panel |
| `avg24h` | D | Pharos panel, hover |
| `components{severity,breadth,stressBreadth,trend}` | D | Pharos "Points off 100" |
| `history[] (score,band,date)` | D | Pharos + Chart Room sparkline |
| `avg24hBand, contributors[], inputDegradation, totalMcapUsd, history.components` | U | |
| **peg-summary** `activeDepeg` | W+D | Shoals; Ledger state |
| `currentDeviationBps` | W+D | Shoals list (heel); Ledger "Deviation" |
| `pegScore, pegReference` | D | Boat panel Peg |
| `worstDeviationBps, eventCount, lastEventAt, severityScore, trackingSpanDays, dexPriceCheck, priceConfidence, depegEventCoverageLimited` | U | |
| `summary{depegEventsToday/Yesterday, coinsAtPeg, medianDeviationBps, worstCurrent}` | U | |
| **stress** `signals[id].band, score` | W+D | weather + mast (weighted); Storm panel alerts; Boat Signals |
| `signals[id].signals{…}` (components, untyped keys), `amplifiers{psi,contagion}`, `coverageRatio`, `oldestComputedAt` | U | |
| **safety-grades** `grade` | W+D | Registry tally board; Boat panel, Ledger |
| `score, methodologyVersion, publicationStatus` | U | |
| **mint-burn** `hourly[] mint/burn/net` | W+D | Mint/Burn fires; Customs bars |
| `scope` | D | Customs "Chains read" |
| `coins[] netFlow24hUsd, mint/burnVolume24hUsd, netFlow7dUsd` | D | Boat panel Mint & burn |
| `coins[] largestEvent24h, mint/burnCount24h, flowIntensity, pressureShiftState, netFlowDirection24h, netFlow30/90d, valuation.*` | U | |
| `gauge{score,band,flightToQuality,flightIntensity}` | U | |
| **health** `/api/health` | U | not fetched by the world; freshness comes from per-endpoint `_meta` |
| static `dead-stablecoins.json` | W+D | Wreck Cove form/scale; Wreck panel, Ledger |
| static `prelaunch.json` | W+D | Shipyard stages; Shipyard panel, Ledger |

## 3. Ideas

Common policy for every data-bound idea: no cue when its endpoint is `stale`/`unavailable` (it falls
back to the neutral pose, never to a "good" pose); thresholds are constants beside `bind.ts` with unit
tests; every cue gets a hover fact in `ui/facts.ts` and a panel row using the same words.

### DA-01 Draught: 7-day supply as how deep a hull rides
**What** Hulls whose supply grew this week ride a little deeper (laden), those that shrank ride light
(boot-top showing). 5 steps: −2 … +2. **Why magical** You can see the week's winners settle into the
water without reading a number. **Data** `circulating` vs `circulatingPrevWeek` (sum of buckets, the
Panel's own `prev()` maths). Policy: step ±1 at |Δ7d| ≥ 5 %, ±2 at ≥ 20 %, and only if |Δ$| ≥ $1M and the
prev bucket exists (> 0); empty prev → step 0 ("unmeasured", not "light"). Draught offset ≤ 6 % of
`freeboard_m`. DOM: Panel Supply "7 d" row gains "riding deep / light"; hover adds "+12 % this week".
**Where** `model/types.ts` (`Boat.draughtStep`), `build.ts`, `fleet/fleet-system.ts` instance y offset.
**Cost** S; 0 draws, 1 float/instance. **Risk** Must not touch hull class (that is size). v0.20 said "hull
height carries the peg alone" — that grammar is gone in the reboot, but say so in the CHANGELOG. Conflicts
with DA-05 if both use "laden": keep cargo for flows, draught for supply.

### DA-02 Hull condition from the safety grade
**What** Paint freshness on the hull: A-band clean, B faintly salt-streaked, C weathered strakes,
D/F patched planks. NR = untouched base paint (never "worn"). **Why** The harbour reads like a real
roadstead: some ships are kept, some are tired. **Data** `safety-grades.grade` (first letter, as
`gradeTally`). DOM: Boat panel "Safety grade" + hover "grade B+". **Where** `fleet/fleet-material.ts`
(per-instance wear scalar into the existing hull shader), `build.ts` already has `b.grade`.
**Cost** M; ~8 ALU in the hull fragment, 1 attribute. **Risk** Truth: a grade is a methodology opinion,
so wear must be mild and the panel must say "kept to the Registry's grade". Brand colour must survive.

### DA-03 The Chart Room's wall chart
**What** Paint the 30-day PSI history as an ink trace on a parchment chart pinned in the Chart Room
(a `CivicBoards` slot, like the grade board), with the 30-day low marked by a small red pin. **Why** The
beacon is now; the chart is memory — a quiet reason to walk to the Chart Room. **Data**
`stability.history[].score` last 30 (exactly `ChartRoomPanel`'s slice). DOM: Chart Room sparkline +
"30-day range" — identical. Not a remap (history is DOM-only today). **Where** `civic/civic-system.ts`
(`paintChartRoom`, repaint on history length/last date change), `civic/paint.ts`. **Cost** S; one
256×128 board slot, repaint ≤ once per stability poll. **Risk** none; no text on the chart (D11).

### DA-04 Storm cones at the masthead of each Alert coin
**What** Each live coin at DEWS ALERT+ hoists one small black cone at its own masthead (drum at
WARNING, cone+drum at DANGER, the station's shape vocabulary). Max 5, worst score first, matching
`stormCones.shown`. **Why** The storm stops being abstract: you find the ships it is about.
**Data** `stress.signals[id].band`/`score` via `alertCoins()`. DOM: Storm panel "Alerts" list (already
sorted the same) + Boat "Early warning". **Where** `readings/bind.ts` (`alerts` already exported),
`fleet/fleet-system.ts` (mast-top instanced shape, mast height from `hull-kit` meta). **Cost** S; 1 instanced
draw, ≤ 5 instances. **Risk** Must not read as "this coin is off peg" (that is the Shoals). Panel copy:
"signal hoisted: early warning, not a depeg".

### DA-05 Cargo on deck for a material day of issuance
**What** Amphorae lashed on deck for a coin whose 24 h net mint is material; open empty hatch for net
burn. **Data** `mint-burn.coins[].netFlow24hUsd` with `valuation.window24h.completeness === "complete"`;
v0.20 policy: ≥ $1M gross AND ≥ 1 % of the coin's supply; top 3 visible at overview. Partial → nothing.
Scope chains only (ETH · Base · Arbitrum) — say so. DOM: Boat panel "Mint & burn". **Where**
`model/types.ts` (add `coins[]` slice), `fleet/` deck props. **Cost** M; 1 instanced draw, ≤ 30 inst.
**Risk** Overclaim on unscoped coins (show only coins with `coverage.status !== "unavailable"`).

### DA-06 Pier-head burgees for each chain's week
**What** A small burgee on each piered chain's pierhead: green swallow-tail up when `change7dPct ≥ +5 %`,
red when `≤ −5 %`, bare staff between. **Data** `chains.change7dPct`. DOM: Harbour panel 7 d.
**Where** `identity/pier-marks.ts`. **Cost** S. **Risk / remap flag** Pier *length* already = supply
(Panel copy) — do NOT extend piers for growth. Overlaps the Harbourmaster's 24 h movers hoist; pick the
7 d window so the two say different things.

### DA-07 Maiden-voyage bunting for coins new to the register
**What** A coin with no week-ago supply sails dressed overall (a line of brand-tinted flags bow to
masthead) on every circuit until it has a week of history. **Why** Newcomers feel celebrated, and every
viewer sees the same thing (not just people present at the poll). **Data** `circulatingPrevWeek` sum ===
0 or absent AND `circulating` > 0. DOM: Boat panel "new to the register this week"; Shipyard "Launched"
already lists launches. **Where** `build.ts` (`Boat.maiden`), `fleet/house-flags.ts`. **Cost** S.
**Risk** Absent buckets can mean a producer gap — require `stablecoins` current and state the rule.

### DA-08 Half-mast after a death
**What** The Pharos flag (or the Wreck Cove memorial pennant) flies at half-mast for 7 days after the
newest `deathDate`. **Data** `dead-stablecoins.json deathDate` (deterministic). DOM: Wreck panel names
the coin and date. **Where** `fleet/wreck-cove.ts` / lighthouse flag. **Cost** S. **Risk** none.

### DA-09 Qualified lamp when the PSI inputs are degraded (honesty)
**What** When `inputDegradation.dewsUnavailable || depegEventsUnavailable`, a horn shutter half-covers
the lantern: the beam still sweeps but narrower. **Data** `stability.current.inputDegradation`. DOM:
Pharos panel line "computed without early-warning data". **Where** `model/readings.ts psiReading`
(`qualified`), `beam/beam-system.ts`. **Cost** S. **Risk** None; closes a D11 gap.

### DA-10 Tide-gauge panel + your last-visit wrack mark
**What** First give the gauge its DOM twin (panel: fleet 7 d %, global 24 h/30 d, scale). Then a thin
wrack line of weed on the gauge at the reading of your previous visit (localStorage, ≤ 30 days old).
**Data** `chains.globalChange7dPct` (a fraction). DOM: the new panel "at your last visit +0.4 %".
**Where** `ui/Panel.tsx` (case `tide-gauge`), `ui/facts.ts`, `readings/tide-gauge.ts`. **Cost** S.
**Risk** Per-viewer state; label it "your last visit".

### DA-11 Reef surf from the worst depeg
**What** The Shoals surf grows with `peg-summary summary.worstCurrent.bps` in 3 steps (50/200/1000 bps).
**Remap flag:** sea state already = off-peg *share*; this adds *depth*. Only do it on the reef, not the
open sea. DOM: Shoals panel (the list already shows bps). **Cost** S. Lower priority.

### Not recommended
- **Stress components as specific weather** (rain = liquidity, lightning = contagion…): component keys in
  `signals[id].signals` are an untyped open record and the methodology is versioned. Until `shared/` pins
  names and semantics it would overclaim. `amplifiers.contagion` is the only stable candidate.
- **Chain `healthBand` as pier decay**: "concentrated" is not decay; the metaphor lies.
- **Price / DEX disagreement**: already covered honestly by the unlit stern lamp + Shoals.

## 4. Events — moments staged from poll deltas

**EV-00 The detector + day book (foundation).** Pure `model/events.ts`:
`detectEvents(prev, next, hist) → HarbourEvent[]`, unit-tested, run in the data system after each
model build. Rules (v0.20 honesty bar):
- Only **accepted market readings**; a change of freshness, coverage or `methodologyVersion` is silent.
- **Hysteresis**: a state change counts only after it holds for 2 consecutive polls of its endpoint.
- Never on first load, never while the endpoint is stale, never under reduced motion (DOM entry only).
- **Throttle**: one staged moment per 3 min, ≤ 6/hour; a queue keeps the highest priority (death > depeg >
  recovery > launch > band change > flow hour) and drops the rest to the DOM book without staging.
  Each staging lasts ≤ 20 s, then the world returns to rest.
- **DOM**: a "Day book" section in the Harbourmaster panel — "since you arrived", time, coin, field,
  old → new (e.g. "14:20 USDX left the Shoals · 412 → 18 bps").

| ID | Trigger (field, threshold) | Staging (≤ 20 s) | Exists today |
|---|---|---|---|
| EV-01 Depeg | `activeDepeg` false→true ×2 polls | reef beacon flashes 3×, crew strike sails | voyage only |
| EV-02 Recovery | `activeDepeg` true→false ×2 polls | crew wave from the rail, gulls lift off the reef, sails set as she clears | voyage only |
| EV-03 Launch | new `id` in stablecoins | yard workers line the slip, hull dressed overall, then DA-07 bunting | voyage only |
| EV-04 Death | id enters dead list (deploy) | tow + one bell toll (audio opt-in) + DA-08 | tow only |
| EV-05 PSI band change | `current.band` changes ×2 | keeper's figure on the gallery; rhythm already eases | rhythm only |
| EV-06 Weather band change | weighted DEWS `band` changes ×2 | a figure hauls the new shape up the station mast | shape swaps |
| EV-07 Big flow hour | latest closed hour `mint` or `burnVolumeUsd` ≥ $100M and ≥ 3× the 24 h hourly mean, complete valuation | one Mint stamp flourish / Burn flare | no |
| EV-08 Class change | `hullClassFor(supply)` crosses a decade (replan) | the hull dips her pennant to the Pharos once | silent swap |
| EV-09 Grade change | `grade` letter changes for a coin | Registry clerk re-chalks the board | silent repaint |

Note: EV-01/02 hysteresis changes today's immediate-reaction sim behaviour — flag it for the sim owner.

## 5. Top picks (impact ÷ cost)

1. **DA-04 Storm cones at the masthead** — the storm gets names; one instanced draw, exact Storm-panel twin.
2. **EV-00 Event detector + Day book** — makes the existing diff voyages into moments, with throttle and a DOM record; foundation for EV-01…09.
3. **DA-01 Draught from 7-day supply** — the most "alive" cue for every coin at zero draws; data already in the payload.
4. **DA-03 Chart Room wall chart** — memory made visible through the proven CivicBoards path; no truth risk.
5. **DA-07 Maiden-voyage bunting** — deterministic launch celebration every viewer shares.

Fix regardless: **DA-09** (degraded PSI inputs) and **DA-10** first half (tide gauge has no DOM twin).

## 6. Cross-vertical hooks

- Fleet/rigging: DA-01 draught, DA-02 wear, DA-04 mast shapes, DA-05 deck cargo, DA-07 bunting.
- Life/figures: EV-02/03/05/06/09 staged figures (`life/folk.ts`, `civic/workers.ts`).
- Audio (opt-in): bells for EV-01/04, cheer for EV-02/03; silent by default and in reduced motion.
- Beam/lighthouse: DA-09 shutter, DA-08 half-mast flag.
- Ocean: DA-11 reef surf, draught-aware wake/waterline foam.
- UI: Day book, tide-gauge panel, hover facts for every new cue.
