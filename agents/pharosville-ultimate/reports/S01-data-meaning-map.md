# S01

## Executive summary

The strongest opportunity is restoring information already expected by existing consumers. Projection removes PSI qualification flags, event methodology versions, hourly valuation and two tide horizons. Other paths turn unknown flow values into zero or directional world cues. The Storm panel teaches a different mast encoding from the renderer. After these corrections, concentration, peg history, safety methodology and issuance momentum offer substantial learning value through on-demand DOM details, with no additional world geometry. The prior field map is outdated: most analytical extras are now stripped before reaching the browser, while tide parity, storm signals and the Day book already exist.

## Current state

- Inventory convention: count normalized response fields and direct collection-row fields; nested objects count once, collection containers and _meta are excluded. U means unused or unreachable after projection; O means operational publication-age checks. Across seven endpoints: 147 field groups, 46 used including 4 O, 101 U; 48 survive projection, including two unused chain fields. These are group counts, not recursive leaf counts. Sources: functions/api/_project.ts:22, shared/types/pharosville.ts:17, scripts/smoke-live.mjs:242.
- /stablecoins: 25 groups, 10 used/15 U. id selects static livery; name/symbol identify boats; pegType→rig; circulating→size; chainCirculating.current/chains→circuits; all have DOM equivalents. circulatingPrevDay→24h text; PrevWeek/Month→trend text and guarded maiden bunting. U: geckoId, pegMechanism, price, priceSource, priceConfidence, priceUpdatedAt, priceObservedAt, priceObservedAtMode, priceSyncedAt, consensusSources, agreeSources, supplySource, frozen, frozenAt, fxFallbackRates. Nested chain history is also stripped. Logos/brand are local assets, not API fields. Evidence: shared/types/market.ts:23; functions/api/_project.ts:28; src/harbour/model/build.ts:93; src/harbour/ui/Panel.tsx:139.
- /chains: 26 groups, 6 used/20 U. name identifies harbours; change24hPct→movers flags and DOM; change30dPct→office dress and DOM; change7dPct/healthScore→DOM; globalChange7dPct→gauge and DOM. U: id,totalUsd are retained but only stored; logoPath,type,change24h,change7d,change30d,stablecoinCount,dominantStablecoin,topStablecoins,dominanceShare,healthBand,healthFactors; globalTotalUsd,chainAttributedTotalUsd,unattributedTotalUsd,globalChange24hPct,globalChange30dPct,updatedAt,healthMethodologyVersion are stripped. World chain totals come from stablecoins. Evidence: shared/types/chains.ts:48; functions/api/_project.ts:37; src/harbour/model/build.ts:132; src/harbour/ui/Panel.tsx:590.
- /stability-index?detail=true: 16 groups, 7 used/9 U. current.score/band→beam reach/rhythm/lamp and DOM; avg24h/components→DOM; history.date/score→DOM sparkline; computedAt→O. Components retain severity,breadth,stressBreadth,trend. U: current.avg24hBand,contributors,inputDegradation,totalMcapUsd,methodologyVersion; history.band,components,methodologyVersion; root methodology. inputDegradation has an existing consumer but projection disconnects it. Evidence: shared/types/stability.ts:27; functions/api/_project.ts:40; src/harbour/model/readings.ts:19; src/harbour/ui/Panel.tsx:232.
- /peg-summary: 31 groups including standalone pegReference, 6 used/25 U. id joins boats; activeDepeg→Shoals; currentDeviationBps→heel/text; pegScore/pegReference→DOM; methodology.asOf→O. U: symbol,name,pegType,pegCurrency,governance,depegEventCoverageLimited,priceSource,priceConfidence,priceUpdatedAt,priceObservedAt,priceObservedAtMode,priceSyncedAt,consensusSources,agreeSources,primaryTrust,pegPct,severityScore,spreadPenalty,eventCount,worstDeviationBps,lastEventAt,trackingSpanDays,methodologyVersion,dexPriceCheck,summary. Other methodology members are stripped. Evidence: shared/types/market.ts:362; shared/types/pharosville.ts:39; functions/api/_project.ts:56; src/harbour/ui/Panel.tsx:155.
- /stress-signals: 10 groups, 3 used/7 U. signals[id].band/score→weighted weather, station mast, top-five boat signals and DOM; updatedAt→O. U: row signals,amplifiers,computedAt,methodologyVersion; root oldestComputedAt,malformedRows,methodology. Nested component available/value and amplifier psi/contagion never arrive. Weather coverage is calculated locally from covered boat supply. coverageRatio remains in the narrow model type but is absent from today's upstream shared response contract. Evidence: shared/types/market.ts:599; src/harbour/model/types.ts:35; functions/api/_project.ts:71; src/harbour/model/readings.ts:58.
- /safety-grades: 8 groups, 3 used/5 U. id joins boats; grade→Registry board, boat panel and ledger; updatedAt→O. U: score,model,methodologyVersion,asOfSec,publicationStatus. Projection restricts grades to RUNTIME_ACTIVE_IDS; unregistered payload boats therefore remain unrated even if upstream supplies a grade. Evidence: shared/types/safety-grades.ts:7; functions/api/_project.ts:77; src/harbour/model/build.ts:89; src/harbour/civic/yard.ts:101; src/harbour/ui/Ledger.tsx:189.
- /mint-burn-flows: 31 groups, 11 used/20 U. hourly.hourTs/netFlowUsd/mintVolumeUsd/burnVolumeUsd→fires, DOM bars/totals; scope.chainIds→DOM. Coin stablecoinId,mintVolume24hUsd,burnVolume24hUsd,netFlow24hUsd,netFlow7dUsd,coverage.status→DOM. U: coin symbol,flowIntensity,pressureShiftScore,pressureShiftState,netFlowDirection24h,has24hActivity,baselineDailyNetUsd,baselineDailyAbsUsd,baselineDataDays,mintCount24h,burnCount24h,netFlow30dUsd,netFlow90dUsd,largestEvent24h,valuation; hourly.valuation; root gauge,updatedAt,windowHours,sync. Other scope/coverage members are stripped. Evidence: shared/types/mint-burn.ts:71; functions/api/_project.ts:84; src/harbour/civic/flows.ts:65; src/harbour/ui/Panel.tsx:173.
- Already strong: tide hover/panel parity, guarded maiden bunting, top-five storm signals, office hysteresis, PSI component explanations, explicit circuit-versus-transfer copy and a confirmed-change Day book. These should be improved, not re-added. Code-only probes reproduced qualification loss, disabled flow-hour eligibility, unknown-net reconstruction, false calm with no peg coverage, missing tide horizons and degraded-as-current classification. Evidence: src/harbour/ui/facts.ts:203; src/harbour/model/readings.ts:136; src/harbour/readings/bind.ts:45; src/harbour/ui/Panel.tsx:534.

## Findings

### S01-F1 [high] Projection disables PSI qualification

- Evidence: functions/api/_project.ts:46; src/harbour/model/readings.ts:34; src/harbour/readings/readings-system.ts:289; src/harbour/ui/Panel.tsx:250
- Detail: current.inputDegradation is removed before psiQualified reads it. An upstream score computed without DEWS or depeg-event inputs consequently receives neither the narrowing shutter nor its existing caveat. A source-backed probe changed qualified from true before projection to false afterward.
- Fix: Preserve the two qualification booleans in projection and the standalone contract. Test upstream payload→projector→model→qualification text, including independently unavailable inputs.

### S01-F2 [high] Projection defeats methodology-change suppression

- Evidence: functions/api/_project.ts:46; functions/api/_project.ts:65; functions/api/_project.ts:74; functions/api/_project.ts:79; src/harbour/model/events.ts:98; src/harbour/model/events.ts:237
- Detail: The event detector silently re-baselines methodology changes, but projected stability, peg, stress and grade payloads lose the versions it reads. Versions become null across releases, allowing a persistent methodology-driven band or grade change to be narrated as a market event. The Day book explicitly promises otherwise.
- Fix: Retain the endpoint and row versions actually consumed. Add projection-fed event tests showing methodology transitions remain silent while genuine same-method changes still confirm.

### S01-F3 [medium] Projected flow hours can never trigger their existing event

- Evidence: functions/api/_project.ts:87; src/harbour/model/events.ts:143; src/harbour/model/events.ts:321; src/harbour/model/events.test.ts:158
- Detail: The detector requires hourly.valuation === complete. Projection always removes valuation, so every delivered hour fails that condition, including fully valued hours exceeding the existing $100M and three-times-mean thresholds. Direct fixtures retain valuation and therefore miss this integration failure.
- Fix: Project hourly valuation and exercise the existing event detector through the projector. Verify complete, partial and missing valuation separately.

### S01-F4 [high] Withheld flow nets become zero or directional certainty

- Evidence: shared/types/mint-burn.ts:82; src/harbour/ui/Panel.tsx:177; src/harbour/ui/Panel.tsx:179; src/harbour/civic/flows.ts:80
- Detail: The shared contract withholds signed net when valuation is partial and treats gross amounts as lower bounds. BoatPanel applies Number(null), displaying $0. civicFlows reconstructs the missing net from those gross amounts and still computes dominance. A probe turned unknown net into +$199M with maximum mint dominance, while the Customs panel correctly retained an unknown net.
- Fix: Preserve nullable nets through formatting and civic bindings. Never reconstruct a withheld net; neutralize directional dominance and label gross values as lower bounds when valuation is partial.

### S01-F5 [medium] Storm text teaches the wrong mast encoding

- Evidence: src/harbour/readings/bind.ts:152; src/harbour/readings/readings-system.ts:227; src/harbour/readings/storm-cones.ts:6; src/harbour/ui/Panel.tsx:371; src/harbour/ui/Ledger.tsx:99; src/harbour/ui/facts.ts:181
- Detail: The station renders the rounded supply-weighted DEWS band: zero to four shapes, plus a Danger pennant. Panel, legend and hover instead describe one cone per Alert+ coin, capped at five. Alert count and aggregate weather can differ substantially, making the explanation contradict the visible mast.
- Fix: Keep the existing world mapping. Describe its exact band-to-shape sequence everywhere; retain Alert+ coin count as a separately named DOM statistic.

### S01-F6 [medium] Missing readings produce affirmative healthy copy

- Evidence: src/harbour/model/build.ts:101; src/harbour/model/readings.ts:44; src/harbour/ui/facts.ts:172; src/harbour/ui/Panel.tsx:312; src/harbour/ui/Panel.tsx:377
- Detail: Missing peg rows default activeDepeg to false and enter the sea-state denominator. A present but empty peg feed yields zero off-peg share despite no observations. Shoals says nobody is off peg even without a model; Storm says Calm when no alerts exist, including unavailable coverage. A freshness footer cannot make those affirmative statements true.
- Fix: Separate observed-zero from unknown. Calculate and disclose covered supply, use unavailable copy when coverage is absent, and retain neutral aggregate targets when nothing is observed.

### S01-F7 [high] Outage fallback can still be classified current

- Evidence: functions/api/[[path]].ts:145; src/harbour/data/fetch.ts:89; src/harbour/model/truth.ts:18; src/harbour/ui/bits.tsx:15
- Detail: The proxy marks last-good outage responses Warning 110. The fetcher converts a fresh status to degraded, but endpointTruth only demotes explicit stale status or sufficiently old age. A young fallback therefore remains current, can retain live wording and can be accepted by the event detector.
- Fix: Carry explicit stale-fallback evidence through the snapshot and honor it independently of age. Distinguish an outage fallback from ordinary degraded inputs; test a newly cached response followed immediately by upstream failure.

### S01-F8 [medium] Retained secondary readings lack local freshness

- Evidence: src/harbour/ui/Panel.tsx:127; src/harbour/ui/Panel.tsx:155; src/harbour/ui/Panel.tsx:183; src/harbour/civic/civic-system.ts:386; src/harbour/civic/civic-system.ts:403
- Detail: BoatPanel combines peg, DEWS, grades and flows but only displays supply freshness. Those secondary endpoints can be stale while supply is current. Registry and movers boards also continue presenting their last values without checking their owning endpoint's freshness; movers only reconsider the row reference.
- Fix: Attach endpoint-specific age/state to the corresponding boat sections and hover facts. Give stale boards an explicit neutral or stale treatment; include freshness in board invalidation.

### S01-F9 [medium] Chain percentages overclaim their denominator

- Evidence: src/harbour/model/build.ts:116; src/harbour/model/build.ts:132; src/harbour/model/build.ts:143; src/harbour/ui/Panel.tsx:600; src/harbour/ui/bits.tsx:37
- Detail: Harbour.share divides by summed chain-attributed supply, but its heading says of all stablecoin supply. Boat chain shares similarly normalize only attributed amounts without naming that restriction. Unattributed supply is absent from those percentages although circuit planning can assign it to Far Ports.
- Fix: Name the existing denominator as reported chain-attributed supply and disclose the unattributed amount separately. Do not silently alter circuit or pier mappings.

### S01-F10 [low] Projection removes two existing tide-panel readings

- Evidence: functions/api/_project.ts:37; src/harbour/model/readings.ts:87; src/harbour/ui/Panel.tsx:577; src/harbour/model/tide.test.ts:13
- Detail: TidePanel and its model support global 24-hour and 30-day supply changes, but projection preserves only globalChange7dPct. Both other rows consequently display dashes regardless of upstream availability. Existing model tests bypass projection.
- Fix: Retain globalChange24hPct and globalChange30dPct in projection and the standalone contract; add a projection-fed three-horizon assertion.

### S01-F11 [low] Registry panel drops NR coins from its tally

- Evidence: shared/types/safety-grades.ts:3; src/harbour/civic/yard.ts:105; src/harbour/ui/Panel.tsx:879
- Detail: The world board correctly groups NR under unrated. RegistryPanel instead creates an N bucket, then renders only A, B, C, D, F and the missing-value bucket. NR coins disappear from its counts, breaking world-to-DOM parity.
- Fix: Reuse gradeTally in RegistryPanel. Assert that every live coin belongs to exactly one displayed grade or unrated bucket.

### S01-F12 [medium] Flow coverage checks use a status absent from the contract

- Evidence: shared/types/mint-burn.ts:45; shared/types/mint-burn.ts:55; functions/api/_project.ts:92; src/harbour/ui/Panel.tsx:125
- Detail: BoatPanel only rejects coverage.status === unavailable, but today's shared enum contains full, partial-history, lagging, bootstrapping, disabled and unknown. Every valid status passes. Window-completeness flags are stripped, so incomplete history can be presented as an ordinary 24-hour or seven-day reading.
- Fix: Interpret current coverage statuses explicitly, retain necessary completeness evidence, and show unavailable or partial-history wording rather than ordinary complete-window totals.

### S01-F13 [low] History graphics invent complete time spans

- Evidence: functions/api/_project.ts:51; src/harbour/ui/bits.tsx:65; src/harbour/ui/bits.tsx:84; src/harbour/ui/bits.tsx:114; src/harbour/model/readings.ts:97
- Detail: The PSI chart takes the last 30 records, spaces them by index and labels the ends 30 days ago and today. Short, sparse or stale histories therefore receive false dates. Flow bars similarly label any available tail as a complete 24-hour window, without checking timestamp continuity.
- Fix: Use actual timestamp bounds and spacing; expose gaps and incomplete windows. Preserve existing values and encodings while correcting captions and temporal geometry.

## Ideas

### S01-I1 Restore evidence required by existing consumers

*informative · infra · effort M · impact 5 · confidence 5*

- What: Extend projection narrowly for PSI qualification, consumed methodology versions, hourly valuation and global tide horizons. Add projector-to-consumer regression cases instead of relying only on direct model fixtures.
- Visitor benefit: Existing caveats, event suppression and tide readings work as already promised.
- Data/DOM: Preserve current.inputDegradation booleans; existing true→qualification text. Preserve methodology changes→silent re-baseline. Preserve hourly.valuation=complete→existing $100M and 3× event rule. Preserve globalChange24hPct/30dPct→existing tide rows. Test all four paths after projection.
- Where: functions/api/_project.ts:37; shared/types/pharosville.ts:27; src/harbour/model/events.ts:98; functions/api/proxy.test.ts:75
- Perf: 0 draws/tris; estimated <10 KB gzip per full seven-endpoint refresh, unmeasured.
- Risks: Retain only consumer-required evidence; update projection-contract tests and documented projection epoch.
- Depends on: —

### S01-I2 Keep partial flow valuation visibly partial

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Use nullable nets directly, retain minimal valuation/completeness fields, suppress dominance when net is withheld, and explain gross lower bounds in the existing flow panels.
- Visitor benefit: Missing valuation cannot look like balanced issuance or a confident minting/burning direction.
- Data/DOM: Source: netFlow24hUsd/netFlow7dUsd, hourly.netFlowUsd, valuation and coverage. Null or partial→'Net unavailable: some events lack USD valuation'; gross copy 'at least $X minted'. Incomplete window→'Partial history'. Test null versus zero, all coverage statuses and neutral world dominance.
- Where: src/harbour/ui/Panel.tsx:124; src/harbour/civic/flows.ts:65; functions/api/_project.ts:84; shared/types/mint-burn.ts:55
- Perf: 0 new draws/tris; a few scalar fields per coin; no per-frame work.
- Risks: Gross activity remains a lower-bound observation; directional cues must not be reconstructed from unequal coverage.
- Depends on: S01-I1

### S01-I3 Make unknown and stale states local to each reading

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Carry explicit fallback status into truth, add freshness beside mixed-endpoint boat sections, and replace healthy empty-state assertions with coverage-aware text. Invalidate boards when truth changes.
- Visitor benefit: Visitors can distinguish no observed problems from no usable observations.
- Data/DOM: Source: endpoint truth, Warning 110, numeric peg coverage and weather.coverage. Unavailable/zero coverage→'No peg reading' or 'No stress reading'; stale→'Last observed … · stale'. Partial coverage→'Observed across X% of supply'. Test current supply with stale enrichers and an empty peg payload.
- Where: src/harbour/data/fetch.ts:88; src/harbour/model/truth.ts:12; src/harbour/ui/facts.ts:172; src/harbour/ui/Panel.tsx:155; src/harbour/civic/civic-system.ts:382
- Perf: 0 new draws; DOM text and existing board repaints only on truth transitions.
- Risks: Keep fog exclusive to fleet freshness. Preserve existing signal mappings and label retained observations honestly.
- Depends on: —

### S01-I4 Teach beam, sea and weather together

*informative · ux · effort S · impact 5 · confidence 5*

- What: Correct mast explanations and add a compact comparison inside the on-demand Legend, with links to Pharos, Shoals and Storm panels. Explain station shapes separately from boat signals.
- Visitor benefit: Visitors learn that PSI summarizes stability, waves represent observed off-peg supply, and weather represents early warning.
- Data/DOM: Keep current mappings: sea thresholds <0.5%, <2%, <10%, otherwise step 3; weather uses rounded supply-weighted DEWS; beam uses PSI band/score. Copy: 'Warnings can rise while pegs still hold.' Test all five station bands, Alert+ counts that differ from them, and shared hover/panel wording.
- Where: src/harbour/ui/Ledger.tsx:63; src/harbour/ui/Panel.tsx:359; src/harbour/ui/facts.ts:181; src/harbour/readings/bind.ts:123; src/harbour/readings/storm-cones.ts:6
- Perf: 0 world draws/tris; small static DOM addition, estimated <2 KB gzip.
- Risks: No remapping or persistent numerical HUD. Do not call a warning a confirmed depeg.
- Depends on: —

### S01-I5 Explain chain attribution and Far Ports precisely

*informative · data-bound · effort M · impact 4 · confidence 5*

- What: Rename chain-share denominators and add an on-demand reconciliation of total, chain-attributed and unattributed supply. Distinguish small named chains from unallocated supply in Far Ports copy.
- Visitor benefit: A displayed 60% has an explicit denominator, and missing attribution becomes understandable.
- Data/DOM: Source: circulating totals, chainCirculating.current; optionally projected globalTotalUsd,chainAttributedTotalUsd,unattributedTotalUsd. Always say 'X% of reported chain-attributed supply'. Positive gap→'$Y has no chain allocation'; attributed>total→'Reported totals do not reconcile'. Test $100 total/$60 attributed without changing circuits.
- Where: src/harbour/model/build.ts:99; src/harbour/model/build.ts:132; src/harbour/ui/Panel.tsx:486; src/harbour/ui/Panel.tsx:600; src/harbour/ui/bits.tsx:37
- Perf: 0 draws/tris; reuse model sums, with optional three-scalar projection expansion.
- Risks: Different endpoint timestamps can explain reconciliation differences; show provenance and avoid negative unattributed amounts.
- Depends on: S01-I3

### S01-I6 Explain chain concentration and health

*informative · data-bound · effort M · impact 5 · confidence 4*

- What: Extend the chain panel with dominant-coin share and named health factors, reusing its existing largest-callers list. Keep all additions in DOM.
- Visitor benefit: Visitors understand why a large chain can still depend heavily on one stablecoin.
- Data/DOM: Source: dominantStablecoin,dominanceShare,healthFactors,healthBand,healthMethodologyVersion. Show available values; dominantStablecoin.share≥0.5→'More than half of this chain’s stablecoin supply is SYMBOL'. Otherwise show the exact share without a categorical warning. Test 49.9%, 50%, null quality and missing factors.
- Where: shared/types/chains.ts:22; shared/types/chains.ts:48; functions/api/_project.ts:35; src/harbour/ui/Panel.tsx:614
- Perf: 0 draws/tris; estimated 2–8 KB gzip additional chain payload, unmeasured.
- Risks: Health is a methodology assessment, not a safety guarantee. Never encode it as physical decay.
- Depends on: S01-I5

### S01-I7 Show where a coin’s supply changed

*informative · data-bound · effort M · impact 4 · confidence 4*

- What: Retain selected chain-history values and add a 24-hour/7-day change column to the existing supply-by-chain details.
- Visitor benefit: Visitors can distinguish overall issuance from supply redistributing across chains.
- Data/DOM: Source: chainCirculating[c].current/circulatingPrevDay/circulatingPrevWeek. Finite positive baseline→percentage and dollar change; missing/zero baseline→'No comparable baseline'. Copy: 'Supply change on this chain; not evidence of a bridge transfer.' Test missing versus zero and opposing chain changes with unchanged total supply.
- Where: shared/types/market.ts:13; functions/api/_project.ts:29; src/harbour/ui/bits.tsx:37; src/harbour/ui/Panel.tsx:151
- Perf: 0 draws/tris; potentially 10–40 KB gzip more stablecoin data, unmeasured; project only requested horizons.
- Risks: Snapshot differences do not identify transactions. Keep circuit motion unchanged and suppress comparisons across missing baselines.
- Depends on: S01-I5

### S01-I8 Give peg scores a track record and confidence

*informative · data-bound · effort M · impact 5 · confidence 4*

- What: Add a short peg-history section and observation-quality note to BoatPanel using existing upstream summary fields.
- Visitor benefit: A current peg reading gains historical context and a visible reliability boundary.
- Data/DOM: Source: eventCount,worstDeviationBps,lastEventAt,trackingSpanDays,depegEventCoverageLimited,priceConfidence,dexPriceCheck. eventCount=0→'No recorded events across X tracked days'; limited coverage→'Event coverage limited'. DEX disagreement→'DEX cross-check differs'. Test zero events, unknown worst deviation, limited coverage and disagreement without classifying them as depegs.
- Where: shared/types/market.ts:362; functions/api/_project.ts:65; src/harbour/ui/Panel.tsx:155
- Perf: 0 draws/tris; estimated 5–20 KB gzip additional peg payload, unmeasured.
- Risks: No recorded events is not proof of safety. Observation age and tracking duration must accompany claims.
- Depends on: S01-I3

### S01-I9 Explain what is moving PSI

*informative · data-bound · effort S · impact 4 · confidence 4*

- What: Extend the existing PSI component section with a small contributor list and a numerical comparison against its existing 24-hour average.
- Visitor benefit: Visitors can connect an aggregate score to named coins and distinguish its level from its recent direction.
- Data/DOM: Source: current.contributors and score−avg24h. Show up to five supplied contributors without inventing point allocations. |delta|≥0.05→'X.X points above/below the 24 h average'; smaller→'Near the 24 h average'. Test missing average, contributor ordering, rounding and qualified PSI. No beam change.
- Where: shared/types/stability.ts:11; functions/api/_project.ts:46; src/harbour/ui/Panel.tsx:251; src/harbour/ui/Panel.tsx:271
- Perf: 0 draws/tris; cap contributor projection at five, estimated <2 KB gzip.
- Risks: A contributor factor is not automatically an additive points deduction. Preserve upstream semantics and qualify degraded inputs.
- Depends on: S01-I1

### S01-I10 Put fleet concentration in the Registry

*informative · data-bound · effort S · impact 4 · confidence 5*

- What: Add top-one/top-three supply shares and a peg-currency breakdown to the existing Registry panel using current boat data.
- Visitor benefit: Visitors learn why a few large ships dominate a fleet containing hundreds of coins.
- Data/DOM: Source: live Boat.supply and pegType. Positive total→'The three largest coins hold X% of tracked supply'; zero/unknown total→unavailable. Group currencies with pegName and label USD-valued supply. Test wreck exclusion, deterministic ties, zero totals and mixed peg currencies. DOM only.
- Where: src/harbour/model/build.ts:130; src/harbour/model/types.ts:93; src/harbour/ui/Panel.tsx:876; src/harbour/ui/format.ts:63
- Perf: 0 network/draws/tris; one cached reduction per model revision, not per frame.
- Risks: Label the tracked universe; do not imply issuer concentration because no issuer field supports that grouping.
- Depends on: S01-I3

### S01-I11 Make safety grades interpretable

*informative · data-bound · effort S · impact 4 · confidence 5*

- What: Show grade score, model, methodology version, publication status and date in existing safety details; reuse the world tally for Registry counts.
- Visitor benefit: A letter becomes a dated model assessment with an explicit unrated state.
- Data/DOM: Source: grades[].score/grade,model,methodologyVersion,asOfSec,publicationStatus. NR/null→'Not rated'; finite score→'Model score X/100'. Show publication status verbatim and 'Methodology assessment, not a guarantee'. Test every grade, NR totals, null scores and nonstandard publication status.
- Where: shared/types/safety-grades.ts:7; functions/api/_project.ts:77; src/harbour/civic/yard.ts:101; src/harbour/ui/Panel.tsx:164; src/harbour/ui/Panel.tsx:876
- Perf: 0 draws/tris; estimated 1–4 KB gzip extra payload, unmeasured.
- Risks: No hull wear or safety-themed world decoration. Do not interpret an unknown publication status as final.
- Depends on: S01-I1, S01-I3

### S01-I12 Separate issuance direction from momentum

*informative · data-bound · effort M · impact 4 · confidence 4*

- What: Add a quiet two-line flow reading to BoatPanel showing net direction and change relative to the supplied baseline.
- Visitor benefit: Net burning and worsening pressure become distinguishable instead of collapsing into one red number.
- Data/DOM: Source: netFlowDirection24h,pressureShiftScore,pressureShiftState,baselineDailyNetUsd,baselineDataDays. Reuse getPressureShiftState: >10 improving, <−10 worsening, inclusive ±10 stable, null NR. Copy: 'Net burning over 24 h; pressure improving versus its baseline'. Test ±10 boundaries, inactivity, insufficient baseline and partial valuation.
- Where: shared/types/mint-burn.ts:74; shared/lib/mint-burn-signals.ts:40; functions/api/_project.ts:91; src/harbour/ui/Panel.tsx:173
- Perf: 0 draws/tris; estimated 3–10 KB gzip additional fields, unmeasured.
- Risks: Improving describes this metric, not a price forecast. Withhold direction or momentum when valuation/baseline evidence is insufficient.
- Depends on: S01-I2

### S01-I13 DECISION-NEEDED: dated depeg history on demand

*informative · data-bound · effort M · impact 4 · confidence 4*

- What: Allow a bounded, validated depeg-events request when a visitor opens peg history; render a short timeline in the boat panel.
- Visitor benefit: Visitors can inspect when a peg failed, how far it moved and whether it recovered.
- Data/DOM: Source: /api/depeg-events events.startedAt/endedAt/direction/peakDeviationBps/source. endedAt=null→'Ongoing recorded event'; otherwise show dated duration and peak. Distinguish live/backfill. Test bounded ID/limit validation, ongoing events, empty results, stale responses and supplied methodology. No new world cue.
- Where: shared/lib/api-endpoints/paths.ts:24; shared/types/market.ts:317; functions/api/[[path]].ts:80; src/harbour/ui/Panel.tsx:155
- Perf: 0 world cost; one optional request, limit 30; estimated 2–8 KB gzip per selected coin.
- Risks: Requires allowlist expansion and explicit per-request ID/query validation; never request it below the viewport gate.
- Depends on: S01-I8

### S01-I14 DECISION-NEEDED: explain available market liquidity

*informative · data-bound · effort M · impact 4 · confidence 3*

- What: Fetch a narrowly projected dex-liquidity map on first explicit inspection and add a DOM liquidity section to BoatPanel.
- Visitor benefit: Visitors understand that large circulating supply does not imply deep measured trading liquidity.
- Data/DOM: Source: /api/dex-liquidity totalTvlUsd,effectiveTvlUsd,liquidityScore,coverageConfidence,liquidityEvidenceClass,hasMeasuredLiquidityEvidence. No measured evidence→'No measured liquidity evidence'; otherwise show observed TVL, score and coverage without inventing a safe threshold. Test unobserved/partial/measured classes, null score and stale timestamps.
- Where: shared/lib/api-endpoints/paths.ts:32; shared/types/market.ts:243; functions/api/[[path]].ts:80; src/harbour/ui/Panel.tsx:116
- Perf: 0 draws/tris; optional shared request; estimated 5–30 KB gzip after minimal projection, unmeasured.
- Risks: Requires allowlist expansion. TVL is not executable exit depth; retain evidence class and methodology, and avoid implying redemption capacity.
- Depends on: S01-I3

### S01-I15 DECISION-NEEDED: inspect backing with provenance

*informative · data-bound · effort L · impact 4 · confidence 3*

- What: Add an explicit backing-details action using the shared stablecoin-reserves contract, with reserve slices and source links in DOM.
- Visitor benefit: Visitors can investigate what backs a coin and distinguish an estimate from a dated observation.
- Data/DOM: Source: /api/stablecoin-reserves/:id reserves[].name/pct/risk,mode,estimated,liveAt,provenance,sync,evidenceUrls. estimated=true→'Estimated reserve composition'; absent verified timestamp→'Freshness unverified'. Test estimated/static/live modes, stale sync, missing slices and percentage reconciliation. No world cargo or hull treatment.
- Where: shared/lib/api-endpoints/paths.ts:18; shared/types/live-reserves.ts:255; shared/types/reserves.ts:8; functions/api/[[path]].ts:80
- Perf: 0 draws/tris; one optional selected-coin request, estimated 2–10 KB gzip.
- Risks: Requires validated dynamic allowlisting. Preserve provenance and presentation mode; a reserve composition is not proof of solvency.
- Depends on: S01-I3, S01-I11

## Top picks

1. S01-I1 — Restores four existing information paths with small payload changes and focused integration tests.
2. S01-I2 — Removes false numerical and directional certainty from both DOM and world.
3. S01-I4 — A small copy change corrects the central teaching contradiction without changing any encoding.
4. S01-I3 — Makes unavailable and retained readings understandable where visitors encounter them.
5. S01-I6 — Adds substantial market understanding inside an existing panel with no rendering cost.

## Operator decisions

- DECISION-NEEDED: Allow bounded /api/depeg-events requests for selected-coin history, or keep event-level investigation on pharos.watch?
- DECISION-NEEDED: Add a minimally projected /api/dex-liquidity endpoint for explicit inspection, accepting another optional feed?
- DECISION-NEEDED: Allow validated /api/stablecoin-reserves/:id requests and their provenance UI, or retain backing details as an external destination?

## Cross-lane hooks

- Data/proxy ownership: coordinate S01-I1/I2 contract changes across functions/api/_project.ts:22, shared/types/pharosville.ts:17 and projection-fed consumer tests.
- UI/teaching ownership: use one shared description for station mast shapes, weather coverage and freshness; src/harbour/ui/facts.ts:52 already demonstrates shared wording.
- Visual lanes: preserve beam=PSI, sea=off-peg supply, weather=DEWS and fog=fleet staleness. Added analytical depth can remain DOM-only.
- Accessibility lane: ensure new history, concentration and coverage details have readable DOM values; do not rely on SVG hover alone, as in src/harbour/ui/bits.tsx:77.
- Verification limits: no edits, browsers, live API calls or full test suite; inspection and in-memory source probes only.
- Risk: upstream field population and optional-endpoint availability remain unverified; payload-size estimates require measurement before implementation.
