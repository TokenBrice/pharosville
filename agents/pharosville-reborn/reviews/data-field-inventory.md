# Data-field inventory

## Verdict
The world has a strong, explicit projection for the fields that make a ship move: supply, chain presence, PSI/DEWS risk, peg deviation, issuance, and a small report-card slice. `ShipNode` deliberately retains whole `StablecoinData` and `StablecoinMeta`, but the renderer and detail model read only a narrow subset; liquidity, lifecycle, reserve, blacklist, launch, and operational-health data do not become world objects. The 36-entry cue registry is contractually rich, yet the noon rest frame makes mostly boats, colour, scale, and landmarks legible; most analytical cues require selection, motion, or close zoom. This is therefore a data-to-attention gap rather than a lack of upstream Pharos data.

**Endpoint note.** `src/lib/api.ts` is a transport/validation wrapper, not the endpoint catalogue: it imports `PHAROSVILLE_API_CLIENT_ENDPOINTS` (`src/lib/api.ts:3`), validates same-origin `/api/` paths (`src/lib/api.ts:61-76`), and looks up the imported catalogue (`src/lib/api.ts:248-253,363-365`). Endpoint names below are the semantic contract paths implied by the source fields; the literal catalogue is outside the requested files and should be reconciled before implementation.

## 1. Source fields → world → rendered surfaces

| Field(s) | Source type file:line | Endpoint | Carried into world model? | Rendered in WebGL as? | Detail panel / ledger? |
|---|---|---|---|---|---|
| `id`, `name`, `symbol`, `pegType`, `pegMechanism` | `shared/types/market.ts:23-31` | `/api/stablecoins` | Yes, wholesale as `ShipNode.asset` (`src/systems/world-types.ts:521-527`); display identity is copied to node fields | Ship identity, sail/livery label, hull-class input; name is not a readable at-rest label | Ship title; class/route/evidence context, not every raw field (`src/systems/detail-model.ts:1091-1197`) |
| `price`, `circulating`, `circulatingPrevDay/Week/Month`, `chainCirculating` | `shared/types/market.ts:31-45` | `/api/stablecoins` | Yes as `asset`; derived `marketCapUsd`, chain presence, change windows and placement (`world-types.ts:532-549,562-564`) | Compressed ship size; route/position; notable-mover circling; dock scale and supply-tide derivatives | Market cap, 24h change, supply momentum, fleet rank/share, chain footprint; matching ledger clauses (`detail-model.ts:1137-1179`) |
| `chains`, `supplySource` | `shared/types/market.ts:40-46` | `/api/stablecoins` | `chains` becomes `chainPresence`/dock visits (`world-types.ts:532-536`); `supplySource` stays only in `asset` | Ship route presence and harbor assignment; no supply-source mark | Chain footprint/route source text; `supplySource` itself is not named |
| `priceSource`, `priceConfidence`, `priceUpdatedAt`, `priceObservedAt`, `priceObservedAtMode`, `priceSyncedAt`, `consensusSources`, `agreeSources` | `shared/types/market.ts:32-39` (normalised at `51-66`) | `/api/stablecoins`; peg summary may repeat them | Whole asset retained (`world-types.ts:526`); derived confidence/consensus only | No stable at-rest mark (cross-check buoy is a separate peg-summary field) | Price confidence and source-consensus rows; ledger parity (`detail-model.ts:1115-1116,1142-1144`) |
| `frozen`, `frozenAt` | `shared/types/market.ts:47-49,74-75` | `/api/stablecoins` | Retained in `asset`; no dedicated `ShipNode` field | No ship cue; frozen/dead assets are represented by cemetery payloads instead | Not in ship detail; cemetery detail uses `DeadStablecoin` fields |
| `StablecoinFlags.backing`, `pegCurrency`, `governance`, `yieldBearing`, `rwa`, `navToken` | `shared/types/core.ts:50-57` | metadata bundled with stablecoins | Yes as `ShipNode.meta` (`world-types.ts:521-528`) | Hull family and nav/yield overlays; peg currency also labels trim (`visual-cue-registry.ts:315-323,381-400`) | Ship class, mast signal, peg-deviation currency; governance/backing are folded into class wording |
| `StablecoinMeta` identity, provider, peg/collateral identifiers (`id`, `llamaId`, `detailProvider`, `name`, `symbol`, `pegReferenceId`, `collateral`, `pegMechanism`, `commodityOunces`, provider slugs) | `shared/types/core.ts:230-244` | stablecoin metadata bundled with `/api/stablecoins` | Yes wholesale as `ShipNode.meta` (`world-types.ts:527`) | Only flag-derived class; no provider/reference/commodity glyph | Mostly no; ship title/symbol are node identity, not these raw metadata fields |
| `ProofOfReserves`, links, jurisdiction, contracts/traded contracts | `shared/types/core.ts:62-83,245-250` | metadata bundle | Retained inside `meta` (`world-types.ts:527`) | — | — |
| dependencies and `DependencyWeight` | `shared/types/core.ts:85-89,250` | metadata/report-card dependency graph | Derived to `dependencyFormation` (`world-types.ts:575-580`) | Close parent-child sailing formation (`visual-cue-registry.ts:348-356`) | Dependency formation row and ledger |
| `canBeBlacklisted`, chain/collateral/custody/governance quality, infrastructures, variant fields | `shared/types/core.ts:251-260` | metadata bundle | Retained as `meta`; selected report-card raw values become `fittings` (`world-types.ts:594-599`) | Fittings use blacklist authority/collateral quality; no chain-tier/custody/variant geometry (`visual-cue-registry.ts:337-345`) | Customs authority, collateral cargo, class; most quality/variant fields absent |
| reserves, `liveReservesConfig`, notices, tags, yield config | `shared/types/core.ts:260-264` | metadata bundle | Retained in `meta` (`world-types.ts:527`) | Yield flag alone gets a mast signal; reserve composition itself has no world node | No reserve/notice/tag/yield-source fact; only “Yield-bearing” signal |
| status, frozen/launch dates and phase, featured content, milestones, date history | `shared/types/core.ts:265-278` | metadata bundle | Retained in `meta`; dead assets use a separate cemetery entry | No lifecycle/launch visual in the live fleet; graves are a separate object | No ship launch/status timeline; grave date/obituary comes from cemetery |
| `DeadStablecoin` (`id`, `name`, `symbol`, peg/cause/date/peak/epitaph/obituary/source/contracts) | `shared/types/market.ts:90-104` | cemetery payload (catalogue path outside `api.ts`) | As `GraveNode.entry` (`world-types.ts:642-652`) | Wreck marker silhouette and cause colour (`visual-cue-registry.ts:529-537`) | Symbol, cause, date, peak cap, obituary, cemetery/source links (`detail-model.ts:1200-1229`); `llamaId`/contracts are not shown |
| `BluechipRating` and `BluechipSmidge` (`grade`, collateralization, audit, dates, six dimensions) | `shared/types/market.ts:106-145` | report-cards/safety payload | Report-card object retained (`world-types.ts:528`); selected raw inputs become fittings | Steel/gold audit shield; D/F safety-watch square (`visual-cue-registry.ts:370-410`) | Safety grade and dimension facts; audit row (`detail-model.ts:1117-1119,1150-1159`) |
| DEX liquidity pool/data (`totalTvlUsd`, volumes, pools, scores, concentration, depth, trends, source mix, evidence, components, etc.) | `shared/types/market.ts:181-289` | liquidity payload (not called out by `api.ts`) | **No** `ShipNode`/`DockNode` field; only a small DEX price-check summary can arrive through peg summary | — | — |
| liquidity/supply history points (`tvl`, `volume24h`, `score`, `date`, coverage; `circulatingUsd`, `price`) | `shared/types/market.ts:291-310` | liquidity/supply-history payload | **No** | — | — |
| `DepegEvent` raw audit fields (direction, peaks, start/end/recovery prices, peg reference, source, confirmation/pending reason) | `shared/types/market.ts:317-358` | `/api/depeg-events` | Only aggregated into `ShipDepegHistory` (`world-types.ts:565-568,635-640`) | Risk placement/weathering; no event timeline or recovery trajectory | Depeg history count/worst/last date, not raw event provenance |
| `PegSummaryCoin` deviation/peg fields, `trackingSpanDays`, event counts, `dexPriceCheck` | `shared/types/market.ts:362-401` | `/api/peg-summary` | Selected: peg deviation/currency, history, DEX cross-check (`world-types.ts:556-571,616-633`); fleet summary feeds mast (`world-types.ts:229-251`) | Trim, cross-bearing buoy, risk placement, weathering, signal mast | Peg deviation, DEX cross-check on disagreement, depeg history, fleet peg/mast rows (`detail-model.ts:1025-1089,1137-1148`) |
| `PegSummaryStats` (`activeDepegCount`, median/worst, coinsAtPeg, totals, today/yesterday events) | `shared/types/market.ts:403-420` | `/api/peg-summary` | Signal-mast subset (`world-types.ts:229-251`); yesterday count also drives pigeonnier roost | Pennants/cone and bird count (`visual-cue-registry.ts:138-146,171-179`) | Signal mast, Fleet peg, Pigeonnier depeg roost |
| stress entry (`score`, `band`, `signals`, amplifiers, computedAt/methodology) | `shared/types/market.ts:599-615,625-630` | `/api/stress` | `riskPlacement`, `riskZone`, `riskDepth`, `stressBreakdown` (`world-types.ts:538-545`) | Risk-water position, danger squall, localized band/weather | Risk water/zone, stress driver and evidence rows (`detail-model.ts:1165-1180`) |
| status freshness booleans | `shared/types/status.ts:201-212,465-488` (dataset freshness/status envelope) | `/api/status` | Reduced to seven `PharosVilleFreshness` flags (`world-types.ts:740-748`) | Epistemic haze and harbor-lamp temperature/opacity (`visual-cue-registry.ts:113-168`) | Harbor light, quay/risk-water haze; no full status timeline |
| full status/health operations (`CacheStatus`, cron runs/in-flight, causes, state, staleness, probes, discrepancies, quality, liquidity/provider diagnostics, D1, reconciliation, warnings) | `shared/types/status.ts:6-27,50-199,327-443,465-556,558-585,614-691` | `/api/status`, `/api/health` | **No**, beyond freshness flags above | — | Not in the world detail/ledger contract |

## 2. Visual cue registry at noon rest zoom

Judgement is from `outputs/reborn/noon.png`: the medium-wide rest camera shows the full lighthouse and water, only partial harbour/city at left/bottom, and a collapsed HUD (`noon.png @ bottom HUD`). Boats, sail marks, colour, size variation and clustering are perceptible; tiny marks, labels, motion rates and detail-only cues are not.

| Cue | Encodes | Perceptible at rest zoom? |
|---|---|---|
| `world.epistemic-haze`; `dock.epistemic-haze` | stale peg/chains evidence | No; haze is not attributable in a still |
| `pigeonnier.notable-movers` | mover identity and today-vs-yesterday depeg count | No; loft/birds too small/off-frame |
| `lighthouse.psi`; `lighthouse.lamp-status` | fleet PSI; feed freshness | PSI **partial** (central beacon/glow), lamp state no |
| `lighthouse.signal-mast` | active off-peg count/worst storm | No; mast too small |
| `lighthouse.high-water-mark`; `garden-month-record` | 30d worst band; 30d garden stress | No; static salt/plant changes too subtle |
| `lighthouse.beam-dwell` | largest PSI contributor | No; dwell is a motion distinction, not a still |
| `ship.cross-bearing-buoy` | DEX vs consensus disagreement | No |
| `dock.size`; `dock.mole-monument`; `dock.mole-basin` | chain supply, Ethereum station/basin | Size/harbour **partial** at left/bottom edge; mole/basin no |
| `ship.distance`; `ship.motion` | DEWS band/magnitude; route/rest cadence | Distance **partial** (distribution); motion no |
| `water.semantic-terrain` | seven named waters | No; boards/labels not legible/in frame |
| `ship.peg-trim`; `ship.issuance-work`; `ship.seaworthiness-fittings` | peg sign; per-coin mint/burn; redemption/collateral/blacklist | No |
| `ship.dependency-formation` | strongest in-fleet dependency | No |
| `ship.hull`; `ship.scale` | classification family; supply magnitude | Hull **partial** (heterogeneous silhouettes); scale **yes** (relative size) |
| `ship.audit-shield`; `ship.nav-signal`; `ship.yield-signal`; `ship.safety-watch` | audit grade; NAV; yield; D/F watch | No |
| `dock.congestion`; `dock.quay-condition` | backing concentration; chain health | No |
| `world.supply-tide`; `dock.cargo-tide`; `fleet.flight-to-quality`; `dock.harbour-tempo` | weekly supply, daily issuance, capital rotation, chain supply change | No |
| `ship.age-patina`; `ship.zone-weathering` | service age; rough-water wear | No |
| `area.danger-squall` | active DANGER water | No in calm noon frame |
| `grave.lifecycle` | dead/frozen assets and cause family | No; wreck shoal off-frame |

## 3. Available but unused by this world surface

These fields are declared upstream but have no dedicated read in the inspected world/cue/detail contracts (some remain inert inside wholesale `asset`/`meta` objects):

- **Liquidity:** the complete `DexLiquidityPool`/`DexLiquidityData` graph (`project`, `chain`, `tvlUsd`, `volumeUsd1d`, pool type/source/extra measurements, TVL/volume/score/concentration/depth/trends, source mix, coverage/evidence/methodology, and score components); `DexLiquidityHistoryPoint`; `SupplyHistoryPoint` (`market.ts:181-310`).
- **Raw depeg provenance:** `DepegEvent.id`, direction, peak/start/end/recovery prices, peg reference, source, confirmation sources, pending reason, and methodology (`market.ts:317-358`); only the compact history aggregate is carried.
- **Peg scoring metadata:** `PegSummaryCoin.depegEventCoverageLimited`, `pegScore`, `pegPct`, `severityScore`, `spreadPenalty`, `methodologyVersion`, and fallback-rate list (`market.ts:362-412`); the world uses deviation/event/DEX subsets.
- **Metadata richness:** `StablecoinMeta.detailProvider`, `pegReferenceId`, `collateral`, `commodityOunces`, provider slugs, proof-of-reserves (including URL/provider), links, jurisdiction, contract arrays/decimals, `chainTier`, `deploymentModel`, `custodyModel`, `governanceQuality`, `infrastructures`, `variantOf`, `variantKind`, `reserves`, `liveReservesConfig`, notices, tags, yield source/type, launch/status dates and phase detail, featured content, milestones, and date history (`core.ts:230-278`).
- **Blacklist telemetry:** every `BlacklistEvent` transaction/address/amount/status/provenance field and every summary/chart/chain aggregate (`market.ts:472-585`). A boolean blacklist authority can affect a fitting, but events and quantities do not enter the world.
- **Operational status:** all `CacheStatus` diagnostics, cron history/in-flight metadata, causes/state/probe/discrepancy/timeline, data-quality counts, provider diagnostics, reconciliation, reserve drift, classification warnings, D1 usage, and `HealthResponse` mint-burn/circuit/Telegram details (`status.ts:6-27,50-199,429-443,465-691`). Only freshness is reduced to haze/lamp flags.
- **Unprojected raw fields:** `StablecoinData.geckoId`, `pegMechanism`, `supplySource`, price timestamps/source, and frozen flags; stress `computedAt`, `methodologyVersion`, raw signal values/amplifiers; `DeadStablecoin.llamaId` and contracts (`market.ts:23-49,90-104,599-660`).

## Findings

- **GAP — high-value market evidence stops at the DOM/detail layer.** Liquidity depth, reserve proof, blacklist events, lifecycle/launch and provider disagreement are available but mostly absent from `world-types.ts:521-580`; the scene cannot tell a liquidity-rich harbour from a thin one without selecting a ship.
- **GAP — cue parity is not rest-zoom parity.** The registry promises 36 analytical cues (`visual-cue-registry.ts:113-540`), but `noon.png` makes only broad fleet marks, scale/colour, clustering and the central landmark legible; most cues are sub-pixel or motion-only.
- **GAP — operational trust is compressed too aggressively.** `StatusResponse` has causes, probe disagreement, source failures and freshness windows (`status.ts:465-556`), but the world receives seven booleans (`world-types.ts:740-748`). “Stale” is visible; why/which provider/when is not until a detail row or outside status surface.

## Ranked ideas

1. **Make a persistent “market garden observatory” around the lighthouse (step change).** Add a small, zoom-legible ring of authored garden beds/lanterns for liquidity depth, reserve proof, and lifecycle/launch cohorts; derive one calm shape/colour grammar from the unused liquidity + metadata fields, and mirror each bed in lighthouse detail/ledger. Cost: +25–45 draws, +8–15k tris, +2–4 textures, ~0.4–0.8 ms; **L/XL**. Risk: taxonomy overload and false precision; cap to 3–4 cohorts and state missing evidence. Displaces some decorative foreground planting, re-pins the “every analytical cue has DOM parity” invariant. Depends on data-story and garden-composition lanes.
2. **Give the rest camera a legible “tide board” (step change).** Promote daily issuance, weekly supply tide, flight-to-quality and freshness into three large, low-frequency forms anchored to each harbour/lighthouse: a standing tide ribbon, one readable cargo pennant, and a trust halo; keep ships as the calm garden texture. Cost: +15–30 draws, +5–12k tris, +1 atlas texture, ~0.3–0.7 ms; **L**. Risk: turning the garden into a dashboard; use restrained motion and only one dominant figure per station. Displaces redundant tiny cargo/fitting marks and re-pins reduced-motion static equivalents. Depends on fleet-density/composition and UI ledger parity.
3. **Add an “evidence provenance” interaction layer, not more always-on marks.** On hover/selection, reveal source age, provider, confidence, DEX-vs-feed evidence, reserve/blacklist provenance and missing reason from the currently unused fields; add a single focus beam/line from the selected garden object to its source-bearing ship. Cost: +5–10 draws only while focused, negligible tris/textures, ~0.1 ms; **M**. Risk: focus state can break relaxation; fade in slowly and keep the rest frame unchanged. Displaces no pinned cue; depends on status/data-story and detail-panel lanes.

## Rejected

- Rendering every liquidity pool as a ship or buoy: destroys the 320-ship attention budget and implies pool identity where only aggregates are reliable.
- Adding a full status dashboard to the WebGL plate: operational detail belongs in DOM/status surfaces; it would compete with the garden and duplicate the existing ledger.
- Making every unused metadata field a colour channel: colour cannot carry 20 categorical dimensions accessibly; it would violate cue clarity and parity.

## Cross-lane notes

Hand to data-story: choose the 3–4 unused fields that deserve garden metaphors and define missing-data wording. Hand to composition/performance: reserve a quiet lighthouse ring and budget the proposed 15–45 draws. Hand to UI/accessibility: expose provenance and every new cue in the detail model and ledger. Confirm literal endpoint paths against the imported API contract before wiring.
