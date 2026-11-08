# S02

## Executive summary

The panels already provide substantial analytical depth, but several claims contradict their inputs. The storm station’s text describes alerted-coin counts while its mast shows the supply-weighted DEWS band. Coin flow panels convert withheld net values into $0. Missing peg/stress feeds can produce reassuring empty states. Production projection also removes PSI degradation flags and two tide comparison periods. Prioritize these truth defects, then improve hierarchy, source visibility, terminology and existing charts. Evidence: src/harbour/ui/Panel.tsx:126, src/harbour/ui/Panel.tsx:320, src/harbour/readings/bind.ts:194, functions/api/_project.ts:37.

## Current state

- Boat/coin: identity, vessel type, whereabouts, follow control, route explanation, supply, 24 h/7 d/30 d changes, circuit, chain split, peg reference/deviation/score, early warning, safety grade and optional flows. Rich content, but route prose precedes the analytical summary and peg risk follows two route sections. Only supply freshness is identified; no outbound verification link appears. src/harbour/ui/Panel.tsx:116.
- Chain harbour: attributed supply share, dollar supply, three comparison periods, caller count, office-growth explanation, ten largest holders and optional health score. Supply leads appropriately; health lacks a scale/gloss. The panel combines stablecoin-derived totals with chain-endpoint changes but labels only chain freshness. src/harbour/ui/Panel.tsx:590; src/harbour/model/build.ts:136.
- Pharos/PSI: score and band lead, followed by beam explanation, degraded-input caveat, history, 24 h average, range and component contributions. Component glosses are particularly useful. Chart Room repeats history with period change. Neither panel links to methodology; fixed history labels can overstate the available interval. src/harbour/ui/Panel.tsx:232, src/harbour/ui/Panel.tsx:271, src/harbour/ui/Panel.tsx:819.
- Storm station: purported hoisted-cone count, explanatory prose, supply-weighted weather band and coverage, transition/recovery text, ranked alerted coins and stress freshness. It usefully separates early warning from depeg, but its station-mast explanation contradicts the rendering contract. src/harbour/ui/Panel.tsx:359; src/harbour/readings/readings-system.ts:47.
- Shoals: off-peg count, anchoring explanation, visual identifiers, confirmed-event explanation, sea-state share and coin rows with supply/deviation. The actionable list follows three explanatory paragraphs. Missing data can be called clear water; peg coverage and the off-peg qualification rule are not explained locally. src/harbour/ui/Panel.tsx:306.
- Wreck Cove: count, peak-cap/form explanation, anniversaries, cause filters, sorting, dated wreck list and cemetery link. Individual wreck: epitaph, location, lived dates, peak cap, cause family plus filed cause, peg, obituary, source and anchored cemetery link. This is the strongest provenance implementation. Ledger instead names raw causes. src/harbour/ui/Panel.tsx:397, src/harbour/ui/Panel.tsx:452; src/harbour/ui/Ledger.tsx:229.
- Shipyard/pre-launch: count, phase-to-hull explanation, phase totals, launched coins, grouped expected dates and upcoming link. Individual dossier adds construction stage, expected date, peg, phase narrative and six sourced milestones. Expected dates are appropriately qualified in the yard overview, but dossiers claim every entry is unlaunched and silently clamp their explanatory text. src/harbour/ui/Panel.tsx:719, src/harbour/ui/Panel.tsx:758; src/harbour/ui/harbour-ui.css:393.
- Customs House and Mint/Burn: 24 h headline, hourly chart, gross/net totals, scope and internal links. Mint/Burn lead with the relevant volume; Customs leads with net. However, net bars are described as gross activity, partial gross valuation lacks qualification, and missing coin flow coverage can disappear without explanation. src/harbour/ui/Panel.tsx:328, src/harbour/ui/Panel.tsx:648.
- Tide gauge: 7 d change leads, followed by 24 h/7 d/30 d comparisons, scale, stale treatment and source age. Harbourmaster: movement explanation/counts, decorative-outing caveat and session Day book. These are useful contextual panels, but two tide periods are stripped upstream, the circuit duration is outdated, and journal confirmation copy has an exception. src/harbour/ui/Panel.tsx:505, src/harbour/ui/Panel.tsx:535, src/harbour/ui/Panel.tsx:564.
- Other landmarks: Keeper’s Log lists feed ages; Registry counts grade letters; Far Ports lists up to 40 unpiered chains; Roads lists current occupants; decorative landmarks are hover-only. Formatting centralizes compact dollars, ratios, bps and missing-value dashes, using manual English formatting rather than Intl numbers. Detail loading is deferred with closable status placeholders. src/harbour/ui/Panel.tsx:486, src/harbour/ui/Panel.tsx:799, src/harbour/ui/Panel.tsx:849; src/harbour/ui/format.ts:8; src/harbour/ui/DetailFallback.tsx:26.

## Findings

### S02-F1 [high] Storm-station copy explains a different signal

- Evidence: src/harbour/ui/Panel.tsx:371; src/harbour/ui/facts.ts:181; src/harbour/ui/Ledger.tsx:99; src/harbour/readings/bind.ts:194; src/harbour/readings/storm-cones.ts:6.
- Detail: Panel, hover and legend describe one cone per alerted coin, capped at five. The rendered station instead shows the supply-weighted band: one cone at Watch, two at Alert, additional drums at Warning/Danger and a Danger pennant. The panel subtitle even prints the uncapped alert count as cones hoisted.
- Fix: Describe the existing band-to-shapes mapping consistently. Present the alerted-coin count separately and distinguish the five individual boat signals. Test hover, panel and legend against the binding.

### S02-F2 [high] Withheld coin net flows become $0

- Evidence: src/harbour/ui/Panel.tsx:177; src/harbour/ui/Panel.tsx:179; shared/types/mint-burn.ts:82.
- Detail: The shared contract permits null net flows when valuation is partial. BoatPanel calls Number() before formatting, so null becomes zero for both 24 h and 7 d. Direct execution confirmed money(Number(null), {signed:true}) returns $0.
- Fix: Pass nullable numbers through unchanged. Show why net is withheld and test partial-valued coins with nonzero gross activity.

### S02-F3 [high] Unavailable risk readings can claim healthy conditions

- Evidence: src/harbour/ui/Panel.tsx:312; src/harbour/ui/Panel.tsx:320; src/harbour/ui/Panel.tsx:377; src/harbour/ui/facts.ts:172; src/harbour/model/build.ts:101.
- Detail: Missing peg data produces no active-depeg rows, which becomes clear water and 'No coin is off its peg.' Missing stress data produces an empty alerts list followed by 'Calm.' Empty or incomplete coverage can likewise be overstated as a fleet-wide conclusion. A footer does not resolve the contradictory headline.
- Fix: Branch on availability, freshness and coverage before interpreting an empty list. Say 'No peg reading,' 'Stress readings unavailable,' or 'No alerts among covered coins,' as appropriate.

### S02-F4 [high] Production projection removes PSI qualification evidence

- Evidence: functions/api/_project.ts:46; src/harbour/model/readings.ts:34; src/harbour/model/readings.ts:39; src/harbour/ui/Panel.tsx:250.
- Detail: The PSI model reads current.inputDegradation to qualify a score computed without required inputs. The Pages projector excludes that field, preventing the qualification and its explanatory panel sentence from activating for projected production responses.
- Fix: Retain the degradation booleans, update projection fixtures and verify the qualified panel state using projected payloads. Advance the projection cache epoch when changing its contract.

### S02-F5 [medium] Production tide comparisons lose two periods

- Evidence: functions/api/_project.ts:37; src/harbour/model/readings.ts:87; src/harbour/ui/Panel.tsx:577.
- Detail: The chains projector retains globalChange7dPct but removes globalChange24hPct and globalChange30dPct. TidePanel renders all three periods, so production cannot populate two comparisons even when upstream supplies them.
- Fix: Preserve all three consumed global change fields and add a projected-response-to-tide regression test.

### S02-F6 [medium] Hourly net bars are described as gross issuance

- Evidence: src/harbour/ui/Panel.tsx:338; src/harbour/ui/bits.tsx:102; src/harbour/ui/bits.tsx:114.
- Detail: TideBars plots hourly netUsd. Its caption and Customs explanation say minted above and burned below. An hour with $100M minted and $90M burned displays a $10M positive net bar, rather than either gross volume.
- Fix: Keep the existing chart and label positive bars 'net minted' and negative bars 'net burned.' State that mint minus burn determines each bar.

### S02-F7 [medium] Partial gross flows are presented as exact totals

- Evidence: shared/types/mint-burn.ts:82; functions/api/_project.ts:87; functions/api/_project.ts:91; src/harbour/ui/Panel.tsx:126; src/harbour/ui/facts.ts:136.
- Detail: Partial valuation makes gross amounts lower bounds, but the projector removes valuation metadata and the UI presents unqualified totals. The coin coverage guard only excludes 'unavailable,' whereas the shared enum also includes disabled, lagging, bootstrapping and unknown. Zero valued gross volumes can therefore be called 'no mint or burn' without proving inactivity.
- Fix: Retain minimal valuation/window coverage evidence. Label lower bounds, distinguish incomplete coverage from inactivity, and avoid a healthy zero conclusion from an empty hourly window.

### S02-F8 [medium] Chain supply claims use the wrong scope and freshness

- Evidence: src/harbour/model/build.ts:76; src/harbour/model/build.ts:132; src/harbour/model/build.ts:143; src/harbour/ui/Panel.tsx:600; src/harbour/ui/Panel.tsx:620.
- Detail: Harbour supply and share derive from stablecoin chain holdings, with share divided by total attributed holdings. The header calls this 'all stablecoin supply' and the footer only reports chains freshness. A stale stablecoin register can therefore underpin a headline beside a fresh chain-data footer. BoatPanel similarly exposes several feeds behind only supply freshness.
- Fix: Name the attributed-supply denominator and label freshness at the sections that consume each feed. Keep chain-endpoint changes distinct from register-derived holdings.

### S02-F9 [medium] Registry omits NR coins from its grade totals

- Evidence: shared/types/safety-grades.ts:3; src/harbour/ui/Panel.tsx:879; src/harbour/ui/Panel.tsx:880; src/harbour/civic/yard.ts:101.
- Detail: NR is a valid grade. RegistryPanel tallies it under N, then renders only A/B/C/D/F/—, silently dropping those coins. Boat and ledger also expose NR without expanding it. The civic gradeTally helper already treats non-letter grades as unrated.
- Fix: Reuse the existing tally rule and display NR as 'Not rated' consistently. Test reconciliation between live boats and displayed grade counts.

### S02-F10 [medium] Shipyard copy contradicts recorded mainnet status

- Evidence: src/harbour/ui/Panel.tsx:727; src/harbour/ui/Panel.tsx:768; src/harbour/data/prelaunch.json:1102; src/harbour/data/prelaunch.json:1595.
- Detail: The yard describes every entry as not launched. Its own narratives say kUSD is live on Base and tGLD is live on Ethereum, while explaining why usable public tracking inputs remain unavailable. Registry admission and real-world launch are different events.
- Fix: Qualify the yard as coins awaiting admission to the tracked fleet. Preserve per-coin pilot/mainnet status and explain missing tracking inputs without inventing launch facts.

### S02-F11 [medium] History axes invent calendar coverage

- Evidence: src/harbour/ui/Panel.tsx:237; src/harbour/ui/Panel.tsx:823; src/harbour/ui/bits.tsx:65; src/harbour/ui/bits.tsx:84.
- Detail: The panels take the last 30 observations rather than a date-bounded interval. Sparkline spaces them uniformly and labels its endpoints '30 days ago' and 'today' regardless of actual dates. Short, gapped or stale histories therefore receive misleading time labels.
- Fix: Use actual first/last dates and timestamp spacing, or explicitly label evenly spaced observations. Derive range headings from the available interval.

### S02-F12 [medium] Hover content can exceed the viewport

- Evidence: src/harbour/ui/facts.ts:70; src/harbour/ui/HoverTag.tsx:43; src/harbour/ui/harbour-ui.css:124.
- Detail: Boat facts concatenate supply, location, warning explanation and maiden status. Harbour facts append a long office explanation. Tags prohibit wrapping and have no width cap. Placement shifts a tag horizontally but cannot fit one wider than the viewport.
- Fix: Limit hover to the highest-priority fact plus state, cap its width and permit controlled wrapping. Keep full explanations in the panel.

### S02-F13 [low] Launch explanations are silently truncated

- Evidence: src/harbour/ui/Panel.tsx:774; src/harbour/ui/harbour-ui.css:393; src/harbour/ui/Panel.tsx:788.
- Detail: Phase narratives are clamped to five lines with no expansion control. They contain material distinctions such as deployed-but-untracked status. The alternative 'full dossier' link targets the general upcoming page rather than identifying this coin.
- Fix: Provide an explicit expandable explanation and accurately label the directory link. Preserve caveats in the visible summary.

### S02-F14 [low] Harbourmaster names an obsolete circuit duration

- Evidence: src/harbour/ui/Panel.tsx:513; src/harbour/sim/plan.ts:15; src/harbour/sim/plan.ts:19.
- Detail: The panel says every boat follows a four-hour circuit. The scheduler repeats over six hours, with individual circuit periods varying by hull and route.
- Fix: Say boats follow deterministic schedules shared by visitors. If duration matters, distinguish the six-hour scheduling cycle from individual boat periods.

### S02-F15 [low] Day-book confirmation promise has an undisclosed exception

- Evidence: src/harbour/ui/Panel.tsx:558; src/harbour/model/events.ts:14; src/harbour/model/events.ts:325.
- Detail: The panel says every recorded change needs two consecutive readings. Large closed-hour flow events are intentionally recorded on their first qualifying poll. The broad statement misdescribes those entries.
- Fix: Describe two-reading confirmation for state changes and separately explain completed-hour flow records. Prefer 'No confirmed changes recorded' to the unqualified empty-state claim.

### S02-F16 [medium] An authoritative empty yard resurrects registry entries

- Evidence: src/harbour/ui/yard.ts:169; src/harbour/civic/civic-system.ts:257.
- Detail: The civic yard excludes launched hulls. When that authoritative list becomes empty, yardCoins treats it like an absent service and returns the entire static registry yard. The UI can consequently list launched coins as still under construction.
- Fix: Fall back only when the civic list is absent or invalid; honor an empty array. Test the all-launched case across hover, panel and ledger.

### S02-F17 [low] Number formatting has boundary inconsistencies

- Evidence: src/harbour/ui/format.ts:12; src/harbour/ui/format.ts:21; src/harbour/ui/Panel.tsx:836.
- Detail: Direct checks produce $1000K for 999999 and asymmetric half-basis-point rounding: −0.5 becomes 0 bps while +0.5 becomes +1 bps. Chart Room’s positive period change also lacks a plus sign and a points unit. These weaken comparison consistency.
- Fix: Define rounding, compact-unit promotion and signed score-change rules centrally. Add boundary examples while retaining null/nonfinite guards.

## Ideas

### S02-I1 Repair the projected panel contract

*professional · infra · effort M · impact 5 · confidence 5*

- What: Preserve consumed tide horizons and PSI degradation flags, plus the minimal valuation/coverage evidence needed to qualify flows. Update projector fixtures and cache epoch together.
- Visitor benefit: Production panels retain the comparisons and caveats their components already support.
- Data/DOM: Retain globalChange24hPct/globalChange30dPct, current.inputDegradation booleans and flow completeness/window evidence. Keep existing thresholds. Test projected payloads through tide, PSI qualification and flow presentation.
- Where: functions/api/_project.ts:35; functions/api/[[path]].ts:122; functions/api/proxy.test.ts:88; src/harbour/model/readings.ts:19.
- Perf: Estimated hundreds of bytes to a few KB per response; no extra requests or GPU work.
- Risks: Cached pv1 responses must not conceal the repaired contract. Preserve same-origin requests and server-side secrets.
- Depends on: —

### S02-I2 Make missing and stale states analytically honest

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Give Shoals, Storm, Registry and mixed-feed boat sections explicit unavailable, incomplete, current-empty and stale states. Keep last-known facts dated; never interpret absent coverage as zero risk.
- Visitor benefit: Visitors can distinguish reassuring evidence from missing evidence.
- Data/DOM: Use model.truth, nullPeg, covered stress rows and endpoint availability. DOM: 'No peg reading,' 'Last known,' and 'No alerts among covered coins.' Apply identical qualifications in hover, panel and ledger; test missing/stale/partial fixtures.
- Where: src/harbour/ui/Panel.tsx:155; src/harbour/ui/Panel.tsx:306; src/harbour/ui/Panel.tsx:359; src/harbour/ui/facts.ts:146; src/harbour/ui/Ledger.tsx:180.
- Perf: Small conditional text and existing-data counts; no network or GPU cost.
- Risks: Do not erase useful last-known readings or introduce new stale thresholds.
- Depends on: —

### S02-I3 Correct flow units, coverage and uncertainty

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Remove nullable-number coercion, qualify gross lower bounds, explain coverage gaps, and relabel Customs bars as hourly net issuance/redemption. Preserve existing charts and internal links.
- Visitor benefit: A withheld value remains unknown; gross volume, net change and inactivity become distinguishable.
- Data/DOM: Read nullable netFlow24hUsd/netFlow7dUsd, hourly.netFlowUsd, valuation and coverage. DOM: 'Net unavailable: partial valuation,' 'At least $X valued,' 'Net minted/burned.' Test null net, zero activity, incomplete windows and balanced gross flows.
- Where: src/harbour/ui/Panel.tsx:124; src/harbour/ui/Panel.tsx:328; src/harbour/ui/Panel.tsx:648; src/harbour/ui/bits.tsx:90; src/harbour/ui/facts.ts:136.
- Perf: Estimated <2 KB additional UI code; no new chart library, requests or GPU work.
- Risks: Do not infer complete valuation or inactivity merely from zero dollar totals.
- Depends on: S02-I1

### S02-I4 Explain the storm mast that actually exists

*informative · data-bound · effort S · impact 5 · confidence 5*

- What: Share the existing band-to-shape description across station hover, panel and legend. Separate aggregate weather, number of alerted coins and the five selected boat signals.
- Visitor benefit: Visitors can correctly read the station without confusing coin count, stress severity and depeg.
- Data/DOM: Source weather.band and mastForBand: Calm none; Watch one cone; Alert two cones; Warning adds one drum; Danger adds two drums and pennant. Alert list uses band ≥ ALERT independently. Test every band and >5 alerted coins.
- Where: src/harbour/readings/bind.ts:152; src/harbour/ui/Panel.tsx:359; src/harbour/ui/facts.ts:181; src/harbour/ui/Ledger.tsx:99; src/harbour/civic/paint.ts:128.
- Perf: Copy/helper change; zero draws, triangles or extra requests.
- Risks: Preserve the rendered mapping; changing the mast to match obsolete copy would silently redefine a signal.
- Depends on: —

### S02-I5 Give every panel a concise analytical opening

*informative · ux · effort M · impact 4 · confidence 5*

- What: Extend Head with an at-a-glance sentence and source state. Order content as current fact, comparisons, breakdown, then expandable world explanation and sources. For off-peg boats, lead with deviation before route prose; for ordinary boats, lead with supply. Keep PSI, flow and tide’s existing strong metric-first openings.
- Visitor benefit: The first screen answers what matters before explaining the scenery.
- Data/DOM: Reuse existing values only: boat supply/peg, chain supply/share, PSI score/band, storm band, Shoals count/share, wreck date/cause, yard phase/expected date, flows/window, tide change and journal count.
- Where: src/harbour/ui/Panel.tsx:61; src/harbour/ui/Panel.tsx:134; src/harbour/ui/Panel.tsx:314; src/harbour/ui/harbour-ui.css:146.
- Perf: DOM reordering and small disclosure controls; no persistent HUD or world work.
- Risks: Do not bury uncertainty in collapsed sections. Preserve title focus and bottom-sheet usability.
- Depends on: S02-I2

### S02-I6 Adopt a compact copy and terminology guide

*informative · ux · effort S · impact 4 · confidence 5*

- What: Use plain analytical nouns first, nautical metaphor second. Expand PSI and DEWS on first inspection. Explain peg deviation as distance from target, 1 bp as 0.01 percentage point, positive as above peg, negative as below. Label score changes in points; ratios in %. Use 'Not rated,' 'Not covered,' 'Unavailable' and 'Stale' distinctly. Define scores as methodology assessments, not guarantees.
- Visitor benefit: Readers understand jargon and encounter the same meaning in hover, panels and ledger.
- Data/DOM: No new analytical signal. Preserve established thresholds and choose one canonical PSI expansion across Panel and fallback links.
- Where: src/harbour/ui/format.ts:20; src/harbour/ui/facts.ts:52; src/harbour/ui/Panel.tsx:155; src/harbour/ui/Ledger.tsx:63; src/fallback-links.ts:2.
- Perf: Static copy and optional short glosses; negligible runtime cost.
- Risks: Avoid turning a glossary into a persistent dashboard or treating early warning as a depeg probability.
- Depends on: S02-I4

### S02-I7 Make number and unit formatting consistent

*professional · ux · effort M · impact 3 · confidence 5*

- What: Keep format.ts as the UI owner. Use cached Intl formatters under an explicit locale policy, promote rounded compact units, define symmetric bps rounding, and offer exact USD values through accessible disclosure. Centralize signed PSI-point changes and peg-reference precision.
- Visitor benefit: Amounts and comparisons remain readable, precise and consistent across every inspection surface.
- Data/DOM: Existing USD amounts, fractional changes, shares and bps retain their units. Show USD explicitly where 'Supply' could mean token quantity. Test 999999, sub-dollar amounts, ±0.5 bp, null and nonfinite inputs.
- Where: src/harbour/ui/format.ts:8; src/harbour/ui/Panel.tsx:17; src/harbour/ui/Panel.tsx:159; src/harbour/ui/Panel.tsx:836; src/harbour/ui/ui.test.ts:29.
- Perf: A few cached Intl instances; no dependency or locale-data bundle proposed.
- Risks: Locale changes affect wrapping and snapshots. Exact values must be available beyond pointer hover.
- Depends on: —

### S02-I8 Expose section provenance and verification links

*professional · ux · effort M · impact 4 · confidence 5*

- What: Extend the existing freshness pattern with source publication time, relative age and a verification link. Label each contributing feed in mixed panels. Reuse known Pharos directory destinations; add entity deep links only when their mapping is verified. Identify static cemetery/yard records as bundled snapshots.
- Visitor benefit: Visitors can date, qualify and verify the facts they inspect.
- Data/DOM: Use _meta.updatedAt, endpoint age/state and explicit computedAt where present; distinguish source time from browser receipt time. Static metadata needs an honest sync timestamp, not a fabricated live age.
- Where: shared/types/api-meta.ts:12; src/harbour/ui/bits.tsx:162; src/harbour/ui/Panel.tsx:183; src/harbour/ui/Panel.tsx:620; src/fallback-links.ts:1.
- Perf: A few links and time elements; no additional API fetches.
- Risks: Do not imply that a fresh response guarantees complete analytical inputs. Preserve opener protection and new-tab labels.
- Depends on: S02-I1

### S02-I9 Add contextual rank and honest denominators

*informative · data-bound · effort M · impact 4 · confidence 4*

- What: Show a coin’s supply rank and share of the loaded register; show chain rank and share of attributed holdings. Retain existing supply-change comparisons. Label chain breakdown percentages as shares of reported chain holdings and distinguish holder lists from actual circuit callers.
- Visitor benefit: Large numbers gain scale without adding a dashboard or inventing historical data.
- Data/DOM: Use boats[].supply, supplyTotal, harbours[].supplyUsd and chainShares. No thresholds; deterministic ties. DOM must state each denominator and loaded scope identically in panel/ledger, with compact hover wording. Test unattributed supply and tied ranks.
- Where: src/harbour/model/build.ts:116; src/harbour/model/build.ts:130; src/harbour/model/build.ts:143; src/harbour/ui/Panel.tsx:593; src/harbour/ui/bits.tsx:37.
- Perf: Reuse existing sorted collections; small O(n) aggregation when the model changes, no per-frame sorting.
- Risks: Loaded-register rank is not universal market rank. Never relabel attributed supply as all supply.
- Depends on: S02-I2

### S02-I10 Improve existing inline charts before adding more

*informative · data-bound · effort M · impact 4 · confidence 5*

- What: Date PSI axes from actual observations, label net-flow semantics, and add an expandable table of existing chart samples. Make inspection work with keyboard and touch. Keep coin and chain comparisons textual because their available snapshots do not establish a continuous historical series.
- Visitor benefit: Charts become interpretable and inspectable without implying nonexistent history.
- Data/DOM: Use stability.history[].date/score and flow hourly timestamps/nullable net values. Label actual date ranges, timezone and gaps; expose the same samples in DOM tables. Test short/gapped/stale history and partial flow hours.
- Where: src/harbour/ui/bits.tsx:59; src/harbour/ui/bits.tsx:90; src/harbour/ui/bits.tsx:123; src/harbour/ui/Panel.tsx:823.
- Perf: At most 30 PSI or 24 hourly rows when expanded; no chart dependency or GPU work.
- Risks: Avoid suggesting equal time spacing across missing dates or showing partial valuation as zero.
- Depends on: S02-I3

### S02-I11 Make the Shipyard an honest admission dossier

*informative · ux · effort M · impact 4 · confidence 5*

- What: Separate registry admission from public launch. Surface phase, expected date and tracking caveat together; expand long narratives explicitly. Honor authoritative empty yard lists and reuse the civic launch-identity rules so panel, hover and ledger agree about departures.
- Visitor benefit: Already-deployed pilots are explained accurately and launched coins do not reappear as unfinished hulls.
- Data/DOM: Reuse recorded phase, expected date, narrative and live identity evidence. Unknown phase stays unknown; dates remain expected, not promised. Test empty civic yard, alias/name matching and deployed-but-untracked narratives.
- Where: src/harbour/ui/yard.ts:169; src/harbour/ui/yard.ts:195; src/harbour/civic/yard.ts:89; src/harbour/ui/Panel.tsx:758; src/harbour/ui/harbour-ui.css:393.
- Perf: Existing metadata and small disclosure controls; no runtime data endpoint.
- Risks: Do not infer launch readiness from build-phase order. Keep source caveats readable before expansion.
- Depends on: —

### S02-I12 Reconcile grades and cemetery terminology

*professional · ux · effort S · impact 3 · confidence 5*

- What: Reuse the civic grade tally for Registry and expand NR everywhere. In Wrecks, distinguish the visual cause family from the source’s filed cause, matching the obituary’s existing treatment. Link wreck rows to their obituary panel.
- Visitor benefit: Counts reconcile, and different cause labels stop appearing contradictory.
- Data/DOM: Existing grade and cause/family fields only; no reclassification or new thresholds. Test NR/null counts and an exploited coin whose filed cause belongs to another category.
- Where: src/harbour/civic/yard.ts:101; src/harbour/ui/Panel.tsx:876; src/harbour/ui/Panel.tsx:468; src/harbour/ui/Ledger.tsx:229; src/harbour/ui/cemetery-classify.ts:9.
- Perf: Small text/helper reuse; no extra requests or rendering cost.
- Risks: Preserve the source cause and existing family assignment; do not present inferred classifications as source quotations.
- Depends on: —

### S02-I13 Restore the hover tag’s one-fact promise

*professional · ux · effort S · impact 3 · confidence 4*

- What: Select one primary fact by state: off-peg deviation, unavailable/stale qualification, or supply/location. Move extended warning, maiden and office explanations into the panel. Cap tag width and allow brief wrapping within supported windows.
- Visitor benefit: Hover remains a quick reading instead of an unbounded sentence.
- Data/DOM: Reuse existing state and facts; no new analytical mapping. Match the panel’s first sentence and preserve an accessible panel/ledger equivalent because tags are aria-hidden.
- Where: src/harbour/ui/facts.ts:70; src/harbour/ui/facts.ts:211; src/harbour/ui/HoverTag.tsx:61; src/harbour/ui/harbour-ui.css:124.
- Perf: Shorter strings; retain measurement caching and batched overlay reads/writes.
- Risks: Do not remove uncertainty or a material warning merely to shorten copy. Verify layout later on the permitted capture path.
- Depends on: S02-I2, S02-I5

### S02-I14 Clarify the Harbourmaster’s session journal

*informative · ux · effort S · impact 3 · confidence 5*

- What: Correct the scheduling description, call timestamps confirmation times, explain completed-hour flow exceptions, and say 'No confirmed changes recorded.' Add local date/timezone and an explicit way to reveal earlier retained entries; disclose the 200-entry retention cap.
- Visitor benefit: The Day book accurately describes what was observed, when it was confirmed and how much history remains.
- Data/DOM: Reuse event.atMs, firstSeenMs, endpoint, kind and retained book entries. No new event thresholds. Test a midnight-spanning visit, a flow-hour entry and more than 40 retained entries.
- Where: src/harbour/ui/Panel.tsx:513; src/harbour/ui/Panel.tsx:532; src/harbour/ui/Panel.tsx:546; src/harbour/model/event-hub.ts:36; src/harbour/model/events.ts:41.
- Perf: Small date formatting and on-demand list expansion; existing 200-entry cap remains.
- Risks: Do not imply this session journal is a complete market event archive or that confirmation time is event occurrence time.
- Depends on: —

## Top picks

1. S02-I4 — Small copy change corrects a direct contradiction between the mast and all three explanatory surfaces.
2. S02-I1 — Restores already-built production comparisons and caveats with a narrow proxy-contract repair.
3. S02-I3 — Prevents unknown financial values becoming zero and corrects existing chart semantics.
4. S02-I2 — Removes reassuring claims precisely when risk evidence is missing.
5. S02-I5 — Makes the existing analytical depth faster to understand without adding visual clutter.

## Operator decisions


## Cross-lane hooks

- API/data lane: retain consumed fields and minimal uncertainty metadata; update projection tests and the cache epoch together. functions/api/_project.ts:35; functions/api/[[path]].ts:122.
- Signal/world lane: preserve the current station band mapping while UI copy is corrected. Keep aggregate mast shapes distinct from selected boat signals. src/harbour/readings/readings-system.ts:47.
- Interaction/accessibility lane: implement keyboard/touch chart inspection, explicit narrative expansion and obituary selection from Wrecks rows. src/harbour/ui/bits.tsx:77; src/harbour/ui/Ledger.tsx:229.
- Content/sync lane: supply trustworthy static snapshot dates and clarify deployed-but-untracked yard entries without rewriting upstream facts. src/harbour/data/prelaunch.json:1102.
- Validation: add focused projected-payload, missing-risk, partial-flow, NR and empty-yard regressions. Existing tests cover formatting and loading boundaries but do not establish these content guarantees. src/harbour/ui/ui.test.ts:29; functions/api/proxy.test.ts:88.
- Skipped browsers, repository edits and the full test suite; direct formatter assertions passed. Findings are code-derived, and layout, live responses and hardware behavior remain unverified.
