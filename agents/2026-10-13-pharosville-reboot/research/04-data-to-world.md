# 04 — From data to world: information architecture for the reboot

Author: data-to-world research · 2026-10-13 · read-only on `main` (HEAD `d1bd2b0`).
Numbers come from `agents/2026-10-13-pharosville-reboot/prior-data/06-data-inventory.md` (snapshot 2026-10-13 10:19 UTC) and the samples in `agents/2026-10-13-pharosville-reboot/prior-data/data/`.
**Binding operator decisions folded in:** every stablecoin is a boat, and the boats **move** (routes, docking, leaving port). The view is a bounded isometric island diorama at 3/4 from above with pan and zoom, like ClaudeVille. The theme is a **maritime harbour town**; the Japanese garden is dropped. Desktop first. Stylized real-time 3D.

**Thesis:** ClaudeVille works because *location means state*: an agent stands at the building for the work it is doing. PharosVille gets the same grammar. **Where a boat is says what it is**: in port means on that chain, on the Shoals means off peg, in Wreck Cove means dead. Global weather says how the whole market is doing, and the Pharos gives the verdict.

---

## 1. What the data contains

| Endpoint | Rows | Key fields | Cadence (producer / max-age) | Moves over |
|---|---|---|---|---|
| `/api/stablecoins` | **625** assets, 225 chain names, 33 peg types | `circulating`, `circulatingPrevDay/Week/Month`, `chainCirculating{chain→current,prevDay,prevWeek,prevMonth}`, `price`, `priceConfidence` (102 null), `pegType`, `pegMechanism` | 900 s / 900 s | supply shares: hours; prices: minutes |
| `/api/chains` | **110** scored chains | `totalUsd`, `change24h/7d/30dPct`, `topStablecoins[5]`, `dominanceShare`, `healthScore/Band` (4 null), `global*`, `unattributedTotalUsd` (3.0 %) | 900 s / 1800 s | days |
| `/api/stability-index?detail=true` | current + **3,195 daily closes** | `score 91.2`, `band`, `avg24h`, `components{severity,breadth,stressBreadth,trend}`, `contributors[21]`, `inputDegradation`, `aggregateUniverse` ($322.4 B, not $344.5 B) | 1800 s / 86400 s | score: hours; band: weeks to months (94.2 % of days BEDROCK) |
| `/api/peg-summary` | **396** coins (248 with a deviation, 138 null) | `currentDeviationBps`, `activeDepeg` (21), `pegScore`, `recent90d`, `primaryTrust`, `summary{activeDepegCount, worstCurrent, depegEventsToday}` | 900 s | minutes to hours |
| `/api/stress-signals` | **258** computed of 396 (65 %, `coverageStatus degraded`) | `signals{id→score, band, 8 sub-signals}` keyed by id | 1800 s | hours |
| `/api/safety-grades` | **182** | `grade` (A+…F, NR), `score`, `partialEvidence` | 900 s publish; changes only when the model changes | months |
| `/api/mint-burn-flows` | **131** coins (56 active), **3 chains only** (eth, base, arb), `hourly[24]` | `netFlow24h/7d/30d/90dUsd`, `mint/burnVolume24hUsd`, `largestEvent24h{direction,amountUsd,txHash,timestamp}`, `gauge{score,band,flightToQuality}` | 1800 s / 3600 s, closed UTC hours | **hours: the only hour-scale series** |
| `shared/data/dead-stablecoins.json` | **88** (+1 frozen) | `causeOfDeath`, `deathDate`, `epitaph`, `obituary`, peak cap | repo data, changes on deploy | never live |

Structural facts: top-1 / top-3 / top-20 supply share is 53.4 / 76.6 / 90.3 %. Ethereum holds 47.6 % and Tron 30.5 % (97.8 % of Tron is USDT). 314 assets live on one chain and 304 on several (max 157). 215 assets are under $1 M. Every series has only 4 lookback points (now, −1 d, −7 d, −30 d); only PSI (daily) and mint/burn (hourly) are true series.

**Known defect to fix first:** `activeAssets()` (`src/systems/pharosville-world/stages/ship-placement.ts:107-111`) keeps a payload asset only if it is also in the *local* registry, which drops 441 of 625. In the reboot, eligibility comes from the payload alone. The registry only adds art (livery). An asset the registry does not know gets a generic hull with its symbol.

---

## 2. Stories, ranked

1. **Is the system holding?** PSI score and band, 24 h average and trend. This is the headline, but it is nearly constant, so the world must show *magnitude* as well as band.
2. **Who is off peg, and does it matter?** 21 active depegs that together hold only ~0.4 % of supply, while the top 20 sit within −42 bps. The honest reading is weighted by supply, not by count.
3. **Where the supply lives.** Two chains hold 78 % of it, and a coin's chain footprint varies (USDT spans 157 chains).
4. **Who leads and who is moving.** Concentration (USDT is 53 %) and momentum over 24 h, 7 d and 30 d, per coin and for the whole fleet. Today this has the best data and the least encoding.
5. **Net mint vs burn today.** Net −$175.5 M, with hourly swings between −$179 M and +$186 M. The only story a viewer can watch change, but it covers only 3 chains.
6. **Early warning.** DEWS ALERT+ (9 coins today) and coverage (65 %).
7. **The fallen.** 88 dead coins with causes and epitaphs: the strongest narrative asset in the dataset.

Cross-cutting, and not a story of its own: **whether the reading is current** (freshness and coverage). Kept inspection-only: **safety grades**. 48.9 % of graded coins are D or F, so the grade carries no signal at a glance.

---

## 3. World grammar: one channel, one meaning

| Story | Carrier | At rest | Hover / click | Channel | Why it is honest |
|---|---|---|---|---|---|
| 1 PSI | **The Pharos** | Beam **rhythm** = band (reuse `PSI_SWEEP_DURATION`: 12 s BEDROCK … 1.2 s MELTDOWN). Beam **reach and brightness** = score, continuous, so 91.2 and 97 look different. Lamp colour in 3 steps: white (BEDROCK/STEADY), amber (TREMOR/FRACTURE), red (CRISIS/MELTDOWN) | Score, components, 24 h average, 30-day sparkline, contributors | rhythm + reach + 3-step colour, all redundant | A real lighthouse's *characteristic* is the coded signal; reach adds the magnitude that "BEDROCK 94 % of the time" lacks |
| 2 Peg (per coin) | **The Shoals**: a reef with buoys off the main harbour mouth | Boats whose `activeDepeg` is true leave their route and anchor on the Shoals. Heel angle grows with log\|bps\| | bps, peg reference, `recent90d`, when it left | location (binary) + heel | Uses the API's own `activeDepeg` state, never an invented threshold. Replaces the illegible 5-band risk waters |
| 2 Peg (fleet) | **Sea state** around the whole island | Swell and whitecaps by **share of supply off peg**, in 4 declared steps (<0.5 %, 0.5–2 %, 2–10 %, >10 %) | Exact share, plus the coins behind it | surface amplitude | Weighting by supply stops 21 tiny depegs from painting a storm |
| 3 Chains | **Harbours**, one per top-8 chain, plus the **Outer Passage** to the Far Ports | Quay length is linear in chain share, so the Grand Harbour (Ethereum) is visibly half the waterfront | `totalUsd`, deltas, top coins, health factors (null = "unscored") | length / occupancy | Linear share keeps "half of everything" readable |
| 3+4 Coins | **Boats**: all 625 | Hull **class by supply decade** (6 classes, ≥$10 B → <$1 M). **Ensign = peg currency**. Branded sails on the hulls the registry knows | Full record (§5) | discrete size + flag | Discrete classes can be read from a legend; the old continuous 0.42–1.15 scale could not be told apart |
| 4 Momentum (fleet) | **Tide gauge** on the harbour wall | Water level against a graduated stone = `globalChange7dPct`, full scale set from the historical p5–p95 range [INFERENCE: range to be measured] | 24 h / 7 d / 30 d values | level | The scale is printed on the stone, so the viewer can read it |
| 4 Momentum (coins) | **Harbourmaster's board** | Chalk list of the top 3 gainers and losers (7 d) | Click a name to fly to that boat | text in the world | A list is more honest than hull tricks |
| 5 Flow | **Customs House** with its **tide board** | 24 painted hourly bars (net mint above the line, burn below). The quay chip shows the 24 h net | Per-coin net, the largest real event with its tx hash | position on a fixed axis | Closed-hour data, drawn as a record and never replayed as live traffic. The scope "ETH · BASE · ARB" is on the chip |
| 6 DEWS | **Weather and the Storm Signal Mast** | Cloud cover and wind follow the supply-weighted DEWS band. The mast hoists one traditional storm cone per ALERT+ coin, up to 5, then "+N" | Band, score, available sub-signals, coverage | sky + counted shapes | DEWS is a forecast, and weather is a forecast. There is **no random weather**, so a storm always means data |
| 7 Dead | **Wreck Cove**, beached hulks in a sheltered cove *inside the rest frame* | 88 grey, sailless hulks. Size = peak cap; wreck form = cause family | Epitaph, obituary, date, source | shape + place | Distinct from distress: afloat and heeling is a live problem, beached is a death |
| Freshness | **Keeper's Log** and **sea fog** | Fog **only** when data is stale or unavailable | Per-endpoint age and budget | fog | Fog is reserved for "unknown" and is never decoration |

**Rejected collisions.**
- (a) Sky = PSI *and* weather = DEWS. The sky belongs to DEWS; the Pharos alone carries PSI.
- (b) Waterline for peg *and* cargo for flow. Peg owns heel; flow lives at the Customs House, never on hulls.
- (c) Speed as data. Speed is constant per hull class and is declared to mean nothing.
- (d) Hue for identity. Saturated hue is reserved for status; identity uses livery and ensigns.
- (e) Grades on hulls: 48.9 % of graded coins would carry the same mark.
- (f) Five textured risk waters. They were already proven illegible (inventory §5).
- (g) Day and night as data. The local clock drives light, as in ClaudeVille, and is declared decorative.

---

## 4. Boats in motion: honest semantics (operator decision 1)

**Ports = chains. A route = the coin's chain portfolio. Dwell = supply share.**

- Each boat sails a deterministic **circuit** through the harbours of its top chains (at most 4 harbours, plus the Outer Passage for chains with no harbour and for unattributed supply). It docks at each one for `dwell_i = share_i × (T − legs × t_leg)`. T is fixed, about 8 min [INFERENCE: tune]. So **the time a boat spends at a port equals its share of supply on that chain**, and over time each harbour's occupancy equals that chain's supply mix. The phase is `hash(id) + UTC clock`, so every viewer sees the same scene and screenshots match.
- **Sailing between ports is not a bridge transfer.** The legend and the detail panel say so in exactly those words, and boats keep to fixed sea lanes rather than drawing point-to-point lines. This carries forward the existing contract line "Chain routes … not transactions" (`docs/pharosville/CONTRACTS.md:254`).
- **Single-chain coins** (314) stay at their home harbour and swing at a mooring, which is how moored boats physically move. Most of the visible sailing therefore comes from the large multi-chain coins, which is correct.
- **State-change voyages, triggered by a real diff between two snapshots:**
  - `activeDepeg` turns true: the boat leaves port for the Shoals.
  - It turns false: the boat returns.
  - A new id appears: the boat is launched from the **Slipway**.
  - An id enters the cemetery list: the boat is towed to Wreck Cove.

  First load never replays transitions, and each voyage happens only once.
- **Speed, wake and sail trim carry no data** and are declared as such.
- **Boats with no peg reading** (138 coins with a null deviation) sail their circuit, because their chain data is real, but they carry an **unlit stern lamp**. A lit lamp means a peg reading exists. Unknown is never drawn as calm.
- **Count and the long tail.** All 625 boats exist as instanced meshes, so each is selectable and each is a row in the ledger.
  - Hull classes keep the tail quiet: the ~215 boats under $1 M are skiffs gathered in each harbour's small-craft basin.
  - Labels follow ClaudeVille's tiers:
    - **always**: the top ~10 by supply, plus the 5 largest boats on the Shoals;
    - **on hover or selection**: any boat;
    - **elsewhere**: each harbour basin shows a `+N skiffs` tab.
  - Counts reconcile: boats drawn = payload length, and the HUD and ledger state 625.

---

## 5. Landmarks

| # | Place | Domain | Endpoint | Label chip |
|---|---|---|---|---|
| 1 | **The Pharos** (headland) | Stability verdict | `/api/stability-index?detail=true` | `PHAROS · PSI 91.2 · BEDROCK` |
| 2 | **Chart Room** (keeper's house) | PSI history | same, `history[]` | `CHART ROOM · 8.8 YRS · 53 STORM DAYS` |
| 3 | **Keeper's Log** (cottage board) | Freshness of all 7 endpoints | `_meta` of all | `KEEPER'S LOG · 7/7 CURRENT` |
| 4 | **Storm Signal Mast** | DEWS | `/api/stress-signals` | `STORM SIGNALS · 9 ALERT+ · 65% SEEN` |
| 5 | **The Shoals** | Active depegs | `/api/peg-summary` | `THE SHOALS · 21 OFF PEG · 0.4%` |
| 6 | **Grand Harbour** | Ethereum | `/api/chains` | `ETHEREUM · 47.6% · $148.9B` |
| 7 | **Tron Harbour** and the other 6 harbours | Chains 2–8 | `/api/chains` | `TRON · 30.5% · $95.3B` |
| 8 | **Outer Passage** (map-edge gate) | The other 102 chains + unattributed | `/api/chains` | `FAR PORTS · 102 CHAINS · {share}` |
| 9 | **Customs House** | Mint/burn | `/api/mint-burn-flows` | `CUSTOMS · NET −$175.5M 24H · ETH·BASE·ARB` |
| 10 | **Harbourmaster's Office** | Supply movers | `/api/stablecoins` | `HARBOURMASTER · MOVERS 7D` |
| 11 | **Tide Gauge** | Fleet supply change | `/api/chains` `global*Pct` | `TIDE · {±x.x}% 7D` |
| 12 | **Registry Office** | Safety grades | `/api/safety-grades` | `REGISTRY · 182 GRADED` |
| 13 | **Slipway** | New listings (snapshot diff) | `/api/stablecoins` | `SLIPWAY · {n} NEW` (hidden at 0) |
| 14 | **Wreck Cove** | Dead coins | repo `dead-stablecoins.json` | `WRECK COVE · 88 LOST` |

Each chip follows ClaudeVille's walnut-plaque pattern (`FORGE │ 8`): a name plus one exact number. When a domain is stale, the chip shows its age (`CUSTOMS · LAST 3H`) instead of the number.

---

## 6. HUD, panels, ledger, accessibility

**Top bar** (48 px). Left: wordmark, a connection chip (`SYNCING` until the first payload, never a green `LIVE` before it; `LIVE`, `STALE {age}` or `DEGRADED`), and the local clock. Centre: four numerals, 22 px over 8 px captions.
1. `91.2`: PSI · BEDROCK · 24h 91.3
2. `$344.5B`: SUPPLY · 7D ±x.x %
3. `21`: OFF PEG · 0.4 % OF SUPPLY
4. `−$175.5M`: NET FLOW 24H · 3 CHAINS

There is also one **attention slot** that appears only while non-zero: any DEWS WARNING/DANGER coin, or any top-20 coin with `activeDepeg`. Today it would read `1 WARNING`. Zeros and unknowns recede to dim ink, and unknown shows `—` rather than 0. A one-line caption is generated from the data, for example: "Calm seas · 21 small coins on the Shoals hold 0.4 % of supply · net redemption $175 M today".

**Detail panel (DOM).**
- **Boat:** identity and logo; supply with 24 h / 7 d / 30 d change; route as a chain split (with "time at port = share"); peg type, bps and reference; `activeDepeg`; DEWS band, score and available sub-signals; grade; mint/burn when tracked; freshness stamps; **"why it is here"** (for example "On the Shoals: active depeg −3,544 bps since …").
- **Landmark:** that domain's panel.

**Ledger (DOM).** Sortable and filterable tables:
- 625 coins;
- 110 chains;
- 88 wrecks;
- PSI history with methodology-version breaks marked.

The ledger is the parity path for screen readers.

**Accessibility.** WCAG AA for the DOM chrome (this is a public site, unlike ClaudeVille's local-tool exemption). Keyboard cycling covers landmarks, then labelled boats; `/` searches. Colour is never the only cue: rhythm, heel, location and counted shapes all repeat it. Reduced motion places boats at the dwell positions for the current phase with no sailing, keeps the beam static with the rhythm shown in the chip, and keeps the swell static.

---

## 7. Motion: what moves and why

| Moves | Meaning |
|---|---|
| Boats on circuits | Time-share of each coin's chain presence (§4) |
| One-off voyages | Real state transitions between snapshots |
| Mooring swing, flags in the wind | Physics only. Wind strength follows the DEWS weather |
| Beam | PSI rhythm and reach |
| Swell | Supply share off peg |
| Clouds and rain | DEWS band |
| Light and stars | Local clock (declared decorative) |
| Gulls and townsfolk | Declared decorative. Low density, and they never carry crates |

**Forbidden:** looping lighters, cranes or cargo that imply mint/burn transactions; random departures; replaying old events as live. The single allowed flow animation is the Customs House largest real event of the latest closed hour, labelled with its timestamp and tx hash, played once per data refresh.

---

## 8. Data-truth rules

1. **Unknown ≠ calm.**
   - A null PSI band gives an unlit Pharos and `NO READING`. Fix the fallback in `psiSweepDuration()` (`shared/lib/psi-colors.ts:65-67`), which turns an unknown band into BEDROCK.
   - A null deviation gives an unlit stern lamp.
   - A null chain health shows as "unscored".
   - DEWS coverage under 100 % is always stated.
2. **Stale freezes motion.** When `/api/stablecoins` is past `degradedBudgetSec`, boats finish their current leg and anchor, fog rolls in, and the chip shows the age. When a single endpoint is stale, only its landmark dims, with a "LAST {age}" chip.
3. **No fixture fleet ever poses as live.** On a cold failure the harbours stay empty and the HUD reads `AWAITING DATA`.
4. **Use API states, not invented thresholds:** `activeDepeg`, the DEWS band, the PSI band. Never merge `activeDepeg` (a state, 21) with `depegEventsToday` (an event count, 0).
5. **Totals reconcile:** boats = payload, and harbours + Far Ports + unattributed = global. State the scope wherever it differs: PSI universe $322.4 B vs payload $344.5 B, and mint/burn on 3 chains.
6. **Eligibility from the payload, art from the registry** (fixes the 441-coin loss).
7. **Deterministic from `id` and UTC** (no `Math.random` in data-bearing placement), and events come only from real snapshot diffs.
8. **Breaks in the record are shown:** PSI methodology changes (17 versions) are marked in the Chart Room.
9. **The desktop size gate stays.** World data is never fetched below the size threshold.
