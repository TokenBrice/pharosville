# S25

## Executive summary

Recommend three features: a local return-visit digest, a deterministic daily/weekly harbour report, and dated PSI exploration. Existing data supports these without new endpoints. Full harbour replay and year-ago supply comparisons require additional historical contracts and operator decisions. Fix narrative truth first: projection removes methodology guards and flow completeness; Watch can misidentify newcomers and narrate stale readings. Anniversary bells already exist, but dates are mostly month precision. Evidence: functions/api/_project.ts:46, src/harbour/ui/watch.ts:41, src/harbour/model/anniversary.ts:7.

## Current state

- Supply has optional circulatingPrevDay/Week/Month buckets, already displayed in boat panels. These are comparison anchors, not a daily trajectory. Chain-level historical buckets are removed by projection. Evidence: shared/types/pharosville.ts:23; functions/api/_project.ts:29; src/harbour/ui/Panel.tsx:142.
- Chains retain per-chain 24-hour, seven-day and 30-day changes, but only the global seven-day change. Global 24-hour and 30-day fields consumed by TidePanel are absent from projection. Evidence: functions/api/_project.ts:37; src/harbour/model/readings.ts:87; src/harbour/ui/Panel.tsx:577.
- PSI history reaches the browser as at most 30 finite-score points containing date and score. Historical bands, methodology versions and components are removed. Two existing panels already show this history. Evidence: functions/api/_project.ts:51; src/harbour/ui/Panel.tsx:237; src/harbour/ui/Panel.tsx:823.
- Shared schemas describe supply history, depeg events and per-coin stress history, but their routes are outside the seven-endpoint app allowlist. Types alone establish neither accessible data nor retention. Evidence: shared/types/market.ts:304; shared/types/market.ts:355; shared/types/market.ts:642; shared/lib/pharosville-endpoint-registry.ts:21; functions/api/[[path]].ts:80.
- The event detector has strong foundations: endpoint-specific accepted polls, two-poll confirmation, coverage handling, observation timestamps and methodology rebaselining. Projection currently undermines the last protection. Evidence: src/harbour/model/events.ts:111; src/harbour/model/events.ts:229; functions/api/_project.ts:65.
- The Day book is session memory: 200 entries retained, 40 displayed, newest first. Ceremonies are separately limited to one every three minutes, six per rolling hour, and 20 seconds; reduced motion keeps the record. Evidence: src/harbour/model/event-hub.ts:36; src/harbour/ui/Panel.tsx:546; src/harbour/model/moments.ts:16.
- Simulation event voyages already implement snapshot differences and deliberately avoid first-load replay. Ordinary circuits describe current chain supply shares; they cannot reconstruct historical transfers. Evidence: src/harbour/sim/sim.ts:397; src/harbour/sim/sim.ts:491; src/harbour/ui/Panel.tsx:223.
- Death anniversaries already have panel text and an opt-in bell. A read-only count found 89 cemetery records: 88 month-only dates and one full date. Only one of 217 catalog records has launchDate. Evidence: src/harbour/model/anniversary.ts:7; src/harbour/audio/feed.ts:410; shared/data/dead-stablecoins.json:1652; shared/data/stablecoins/coins.generated.json:1678.
- The Shipyard already exposes dated milestones and expected launch dates. Its deferred book contains 43 entries; expected dates are forecasts, not launch evidence. Existing source-link merging should be preserved. Evidence: src/harbour/data/prelaunch.json:3; src/harbour/ui/yard.ts:139; src/harbour/ui/Panel.tsx:771.
- Seasons, solar timing, moon and meteors already follow a decorative calendar. Watch already ranks temporal subjects, and postcards already include date, scene hour and freshness. Harbour localStorage currently stores orientation and audio preferences, without a market baseline. Evidence: src/harbour/season/calendar.ts:2; src/harbour/ui/watch.ts:19; src/harbour/ui/postcard.ts:16; src/harbour/ui/CornerMark.tsx:6.

## Findings

### S25-F1 [high] Projection disables methodology-change suppression

- Evidence: functions/api/_project.ts:46; functions/api/_project.ts:65; functions/api/_project.ts:74; src/harbour/model/events.ts:98; src/harbour/model/events.ts:237.
- Detail: The detector reads endpoint and per-row methodology versions, but projection removes them. A recalibration can therefore become an apparent market transition after two polls. An in-memory probe produced no event with original payloads and a false depeg with projected payloads. Existing detector tests supply metadata that production projection discards.
- Fix: Retain the minimal methodology identities consumed by eventSnapshot, including relevant row versions. Align narrow contracts and add a projection-to-detector regression proving recalibration remains silent.

### S25-F2 [medium] Projected flow hours can never qualify for the Day book

- Evidence: functions/api/_project.ts:87; shared/types/pharosville.ts:47; src/harbour/model/events.ts:143; src/harbour/model/events.ts:321; functions/api/proxy.test.ts:104.
- Detail: Big-flow events require valuation === complete. The proxy removes valuation from every hourly bucket, making completeness false even for explicitly complete upstream records. An in-memory probe confirmed this. Production therefore loses the corresponding Day book entries and ceremonies.
- Fix: Preserve hourly valuation in projection and the narrow schema. Test projected complete, partial and unspecified buckets through eventSnapshot and detectEvents; retain explicit completeness requirements.

### S25-F3 [medium] Watch uses a weaker newcomer test than the world

- Evidence: src/harbour/ui/store.ts:436; src/harbour/ui/watch.ts:41; src/harbour/model/readings.ts:178; src/harbour/model/build.ts:126.
- Detail: Watch labels a coin new this week whenever its week bucket sums to zero. Empty objects or buckets containing only null values also sum to zero. Unlike isMaiden, Watch ignores month-ago supply and the feed-wide missing-history guard, so an established coin can receive a newcomer narrative.
- Fix: Pass the model's guarded maiden eligibility into Watch instead of independently inferring it from prevWeek. Add cases for empty history, positive month-ago supply and widespread producer gaps.

### S25-F4 [medium] Watch narratives outlive their source readings

- Evidence: src/harbour/ui/store.ts:431; src/harbour/ui/store.ts:448; src/harbour/ui/store.ts:467; src/harbour/ui/watch.ts:30; src/harbour/ui/watch.ts:38.
- Detail: Watch ranking does not inspect endpoint freshness. Its stops and explanatory sentences are computed once and looped, even when later models change. A recovered coin can remain the worst depeg now, while stale supply can retain a current-sounding biggest-mover claim.
- Fix: Gate each reason on its source endpoint's current truth. Refresh or invalidate stops when accepted source readings change, and stop presenting analytical claims when their source becomes stale.

### S25-F5 [low] An empty Day book overstates what was observed

- Evidence: src/harbour/ui/Panel.tsx:556; src/harbour/model/events.ts:237; src/harbour/model/events.ts:264.
- Detail: Nothing has changed since you arrived also appears before sufficient accepted polls, during unavailable coverage, or when changes remain below event thresholds. The detector establishes only that no qualifying event has been confirmed.
- Fix: Say No confirmed changes recorded this visit. Include observation coverage or waiting status and distinguish the flow-hour exception from two-poll state confirmation.

### S25-F6 [medium] Sparse PSI points are presented as a continuous month

- Evidence: functions/api/_project.ts:51; src/harbour/ui/Panel.tsx:252; src/harbour/ui/Panel.tsx:832; src/harbour/ui/bits.tsx:65; src/harbour/ui/bits.tsx:84.
- Detail: Projection retains the last 30 points without requiring daily spacing. The chart spaces points by array index, always labels its ends 30 days ago and today, and describes point count as days. Short, missing-day or old histories receive an unsupported temporal span.
- Fix: Use actual timestamp bounds and date-scaled positions. Display coverage gaps and observation count, and provide a keyboard-readable date/value table. Test short, irregular and stale histories.

### S25-F7 [medium] Register arrival is narrated as a verified launch date

- Evidence: src/harbour/model/events.ts:180; src/harbour/model/events.ts:297; src/harbour/ui/facts.ts:67; shared/types/core.ts:270.
- Detail: The launch detector establishes that an ID appeared during this visit, not when the asset launched. Nevertheless, the book says launched and the hover says launched today. An established asset newly covered by the producer satisfies the same detector.
- Fix: Keep the visual arrival ceremony but describe it as new to this register or first observed this visit. Reserve launched on a date for independently sourced launchDate metadata.

### S25-F8 [medium] Unavailable flow comparisons become zero-dollar history

- Evidence: shared/types/pharosville.ts:51; src/harbour/ui/Panel.tsx:177; src/harbour/ui/Panel.tsx:179; src/harbour/ui/format.ts:8.
- Detail: The contract explicitly permits null netFlow24hUsd and netFlow7dUsd, but BoatPanel passes them through Number(). Number(null) is zero, so incomplete valuation or absent history appears as $0 instead of an unavailable comparison.
- Fix: Preserve null before formatting and show unavailable or partial valuation. Add focused cases distinguishing null from genuine zero, including seven-day windows.

## Ideas

### S25-I1 Restore a local return-visit digest

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Store one versioned browser snapshot containing endpoint observation times, methodology identities, PSI band, covered off-peg IDs and per-coin supply. Compare it with the next accepted readings. Freeze the previous-visit baseline throughout the visit; show the digest on demand in the Harbourmaster panel.
- Visitor benefit: Returning visitors understand what differs from their own previous observation without scanning the fleet.
- Data/DOM: Sources: current.band, activeDepeg, circulating and endpoint truth. Report changed bands/counts and up to three matched-ID supply differences above $1M. Text: Compared with your browser's reading at DATE. Separate coverage changes; do not claim an event path or event time. Unit-test missing data, methodology changes, first load and corrupt storage.
- Where: src/harbour/model/event-hub.ts:23; src/harbour/ui/Panel.tsx:535; src/harbour/ui/CornerMark.tsx:16; shared/types/pharosville.ts:18.
- Perf: Estimated 30–60 KB stored snapshot; O(coins) work per accepted update; zero new draws, triangles or frame-loop work.
- Risks: Requires S25-F1 metadata repair. Save only accepted readings after admission, never the empty loading world. Handle storage denial and clock changes. Calm budget: one digest per visit, no automatic camera movement or ceremony.
- Depends on: —

### S25-I2 A deterministic daily and weekly harbour report

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Add one on-demand report with 24-hour and seven-day views. Generate short sentences from fixed templates: comparable supply change, three largest absolute movers, dated PSI change and available scoped issuance. Link every sentence to its underlying values.
- Visitor benefit: A concise, verifiable narrative explains the market's direction without trading urgency.
- Data/DOM: Sources: circulating versus circulatingPrevDay/Week, stability.history dates/scores, mintBurn scope/hourly and per-coin netFlow7dUsd. Rank movers above $1M; aggregate only matched valid buckets and disclose omitted coverage. Say Seven-day comparison as of DATE, never a complete event chronicle. Do not interpolate daily supply paths. Unit-test nulls, zeros, coverage and period selection.
- Where: shared/types/pharosville.ts:23; functions/api/_project.ts:37; src/harbour/model/readings.ts:95; src/harbour/ui/Panel.tsx:526.
- Perf: O(coins) calculation on accepted updates; estimated under 5 KB additional lazy UI code; zero GPU work.
- Risks: Fix S25-F1/F2/F8 first. Report USD-denominated supply value, not proven issuance. Keep partial flow coverage explicit. Calm budget: one report per opening; no unsolicited announcements or animated market celebrations.
- Depends on: —

### S25-I3 Walk the dated PSI record

*informative · data-bound · effort M · impact 4 · confidence 5*

- What: Improve the existing Chart Room with date-scaled history, previous/next observation controls, a selected-date reading and an accessible table. Keep the live world live while visitors inspect historical PSI.
- Visitor benefit: Visitors can explain today's index using actual dated observations, including gaps.
- Data/DOM: Use the existing projected history[].date/score, at most 30 points. DOM: PSI SCORE on DATE; N observations from START to END. Show score differences only between compatible methodologies after retaining version identity. Never call points days or reconstruct historical bands from today's thresholds. Unit-test date gaps, duplicates, short windows and methodology boundaries.
- Where: src/harbour/ui/Panel.tsx:819; src/harbour/ui/bits.tsx:59; functions/api/_project.ts:51.
- Perf: At most 30 SVG points and table rows; zero additional world draws or fetches; calculation only when data or selection changes.
- Risks: Repairs S25-F6. This extends the existing DOM history, avoiding the previously unadopted in-world wall chart. Calm budget: manual steps only; reduced motion needs no special animation path.
- Depends on: —

### S25-I4 DECISION-NEEDED: seven-day harbour replay

*enchanting · data-bound · effort XL · impact 4 · confidence 2*

- What: If an upstream owner supplies versioned daily harbour snapshots, offer an explicitly historical mode with dated steps and optional slow playback. Begin with seven days. Isolate playback from the live event hub and restore live mode explicitly.
- Visitor benefit: Shows how fleet composition, chain distribution and market conditions changed across several days.
- Data/DOM: Needs dated coin membership, supply, chain distributions, peg states/references, stress, PSI, methodology and freshness. Existing comparison buckets cannot supply these snapshots. DOM mirrors every selected date and unavailable field. Positions remain illustrative circuits, not historical transfers. Default paused; optional maximum one day per two seconds; reduced motion uses discrete manual steps.
- Where: functions/api/[[path]].ts:80; shared/lib/pharosville-endpoint-registry.ts:21; src/harbour/sim/sim.ts:491; src/harbour/sim/system.ts:195.
- Perf: Historical payload size unknown. Reuse one renderer, but each daily step may require worker planning and fleet preparation; no credible millisecond estimate before a prototype.
- Risks: Requires a new history producer and allowlisted contract; shared history types do not establish availability. Current cemetery metadata must not leak future deaths into past scenes. No first-load event ceremonies, autoplay or catch-up queue.
- Depends on: S25-I3

### S25-I5 This month in Wreck Cove

*informative · data-bound · effort S · impact 3 · confidence 5*

- What: Extend the existing anniversary section with one manually opened monthly remembrance drawn from month-precision death records. Show the existing obituary, recorded date and source; rotate the selected record deterministically by month.
- Visitor benefit: Turns the archive into a quiet historical lesson despite sparse exact-day dates.
- Data/DOM: Match deathDate month in an earlier year. DOM: Recorded as discontinued in MONTH YEAR; exact day not recorded where appropriate. Preserve the existing exact-day anniversary rule and bell. Read sourceUrl/sourceLabel from deferred obituary records. Test month boundaries, current-year exclusions and date precision.
- Where: src/harbour/ui/Panel.tsx:416; src/harbour/model/anniversary.ts:7; src/harbour/model/obituary.ts:66; shared/data/dead-stablecoins.json:1652.
- Perf: Scan 89 existing records on panel opening; existing deferred prose; zero new assets, draws or continuous work.
- Risks: No invented anniversary day, additional offerings or repeated bell. Calm budget: one story per month, opened by the visitor. This improves existing remembrance rather than reintroducing rejected anniversary scenery.
- Depends on: —

### S25-I6 A life record with explicit date precision

*informative · data-bound · effort M · impact 2 · confidence 4*

- What: Add a compact chronological record to selected coin dossiers: sourced launch date when available, Shipyard milestones, and recorded discontinuation. Label registration observations separately from product launch.
- Visitor benefit: Provides historical context without pretending every coin has a complete biography.
- Data/DOM: Sources: optional launchDate, milestones[].date/sourceUrl and deathDate. Exact anniversaries require a validated full date from an earlier year. ExpectedLaunchDate stays Expected; missing launch dates stay Not recorded. Only one catalog launch date currently exists, so expand coverage upstream before promoting birthdays. Test partial dates and forecast/actual separation.
- Where: shared/types/core.ts:270; shared/data/stablecoins/coins.generated.json:1678; src/harbour/ui/Panel.tsx:775; src/harbour/model/obituary.ts:49.
- Perf: Small deferred metadata projection and DOM list; avoid importing the full catalog eagerly; zero GPU work.
- Risks: Catalog dates need provenance before anniversary treatment. Obituary prose-derived birth years must retain their uncertainty. Calm budget: selection only, with no birthday ceremonies or notifications.
- Depends on: —

### S25-I7 An on-demand harbour almanac

*enchanting · decorative · effort S · impact 3 · confidence 5*

- What: Add a small calendar section to the Keeper's Log explaining the current decorative season, nominal day length, moon phase and active painted meteor period. Use existing calendar services.
- Visitor benefit: Makes the harbour's changing light and seasonal details feel intentional and memorable.
- Data/DOM: Calendar sources only: visitor date/time zone and SeasonService. DOM explicitly says Decorative calendar, with solar timing calculated at nominal 35° latitude. Explain painted meteor periods without predicting real local visibility. No market fields, new analytical thresholds or weather remapping.
- Where: src/harbour/season/calendar.ts:2; src/harbour/season/calendar.ts:137; src/harbour/season/calendar.ts:170; src/harbour/season/season-system.ts:91; src/harbour/ui/Panel.tsx:849.
- Perf: Reuse existing calculations; a few DOM rows on demand; zero new rendering passes, assets or per-frame computation.
- Risks: Avoid holiday spectacle and geographic precision the nominal model cannot support. Calm budget: no alerts or extra meteor frequency; reduced motion displays the same information statically.
- Depends on: —

### S25-I8 Explain each recorded voyage

*informative · data-bound · effort S · impact 4 · confidence 5*

- What: Expand Day book entries on demand to show source field, previous/new reading, first observation, confirmation time and whether a ceremony was staged. Link to the existing coin or landmark panel.
- Visitor benefit: Connects the harbour's memorable movements to verifiable changes and explains confirmation delays.
- Data/DOM: Reuse HarbourEvent.endpoint/field/from/to/firstSeenMs/atMs and DayBookEntry.staged. DOM: First observed TIME; confirmed TIME, not Occurred TIME. Preserve two accepted polls for state transitions and the closed-hour flow exception. Clearly distinguish register arrivals from verified launches. Unit-test timestamps, unstaged entries and reduced-motion parity.
- Where: src/harbour/model/events.ts:41; src/harbour/model/event-hub.ts:18; src/harbour/ui/Panel.tsx:546; src/harbour/model/moments.ts:11.
- Perf: Existing event data plus expanded DOM; zero new fetches, draws or simulation work.
- Risks: Repair S25-F1/F2/F7 first. Do not replay ceremonies or move the camera automatically. Calm budget: details appear only after activation; staged status is descriptive, not a reward.
- Depends on: —

### S25-I9 Keep a bounded personal observation journal

*informative · data-bound · effort M · impact 3 · confidence 4*

- What: Persist up to the existing 200 confirmed entries for seven days, grouped by observed visit intervals. Provide pagination and an explicit clear action. Keep restored records separate from the live detector and ceremony queue.
- Visitor benefit: Lets visitors revisit changes they actually witnessed without implying continuous server coverage.
- Data/DOM: Source only confirmed HarbourEvent records and observation intervals. DOM: Recorded on this browser; no observations between START and END. Exclude dev-injected entries. Expire by age and count, validate stored schema, deduplicate IDs and never synthesize events across absence. Test interrupted visits, corrupt storage, expiry and restoration without staging.
- Where: src/harbour/model/event-hub.ts:36; src/harbour/model/event-hub.ts:70; src/harbour/model/event-hub.ts:82; src/harbour/ui/Panel.tsx:557.
- Perf: Estimated 50–150 KB storage depending on sentences; batched writes outside frames; paginated DOM; zero GPU cost.
- Risks: Browser-local and incomplete by design; unavailable storage must leave the current session working. Calm budget: archive opening only, no backlog announcements or historical ceremonies.
- Depends on: S25-I8

### S25-I10 Give postcards an immutable reading receipt

*informative · data-bound · effort M · impact 3 · confidence 4*

- What: Capture scene time, capture time and endpoint-specific reading times with the frame. Show the same receipt as selectable DOM text beside the existing image, optionally including one explicitly selected Day book entry.
- Visitor benefit: A saved or shared harbour image retains understandable temporal context and a readable text equivalent.
- Data/DOM: Use the captured model's truth, PSI score/band and endpoint publication evidence. Distinguish Picture captured TIME, Decorative scene hour H and PSI reading as of TIME. Freeze the receipt with its frame rather than reading a later model. Historical captions require historical data; current scenery alone never becomes a historical postcard.
- Where: src/harbour/ui/Postcard.tsx:30; src/harbour/ui/postcard.ts:16; src/harbour/ui/postcard.ts:32; src/harbour/model/types.ts:55.
- Perf: Reuse existing capture/composition; a small immutable metadata object and DOM block; no extra world draws or resolution increase.
- Risks: Different endpoints have different ages; avoid one universal as-of claim. Calm budget: explicit postcard action only. Keep text available without requiring image OCR or motion.
- Depends on: —

### S25-I11 DECISION-NEEDED: a verified year-ago comparison

*informative · data-bound · effort L · impact 4 · confidence 3*

- What: Allow one bounded supply-history request when a visitor selects a coin and asks for a year comparison. First verify upstream retention and semantics; display only when a suitable historical observation exists.
- Visitor benefit: Supports meaningful statements such as twice the reported USD supply value recorded on a named date.
- Data/DOM: Candidate contract: SupplyHistoryPoint.date/circulatingUsd through API_PATHS.supplyHistory. Require finite values, positive denominator, compatible identity/valuation and a historical observation within one day of the target UTC calendar date. Show both dates and values; otherwise Comparison unavailable. Never infer a year from PrevMonth or multiply monthly growth.
- Where: shared/types/market.ts:304; shared/lib/api-endpoints/paths.ts:38; functions/api/[[path]].ts:80; src/harbour/ui/Panel.tsx:140.
- Perf: One deferred, cached bounded request per selected coin; payload size and retention unverified; zero GPU cost.
- Risks: Requires exact query validation and an allowlist decision. USD supply value can change through valuation, not only token quantity. No automatic growth celebration; unit-test date tolerance, zeros, gaps and incompatible series.
- Depends on: —

## Top picks

1. S25-I1 — First: highest return-visit value using existing snapshots; bounded browser storage and no new endpoints.
2. S25-I2 — Second: turns existing comparisons into a useful daily/weekly explanation with deterministic, auditable sentences.
3. S25-I3 — Third: makes the only currently exposed time series trustworthy and explorable at negligible rendering cost.
4. S25-I8 — Small change that connects existing ceremonies to their evidence and observation times.
5. S25-I5 — Uses the cemetery's actual month precision to make existing historical content discoverable.

## Operator decisions

- DECISION-NEEDED: Should full seven-day harbour replay fund an upstream snapshot producer and a new allowlisted history contract, or remain deferred while existing PSI history is improved?
- DECISION-NEEDED: Should selected-coin year comparisons add a bounded supply-history route after upstream retention and valuation semantics are verified?
- Should upstream catalog maintenance prioritize sourced launch dates? Current coverage supports one recorded launch date, insufficient for a fleet-wide birthday feature.

## Cross-lane hooks

- API/data owners: preserve methodology identities and hourly valuation before building narratives; extend projection-to-consumer tests. Evidence: functions/api/_project.ts:46; src/harbour/model/events.ts:143.
- UI/accessibility owners: provide dated tables, manual history controls and readable postcard receipts; keep every narrative on demand. Evidence: src/harbour/ui/bits.tsx:77; src/harbour/ui/Postcard.tsx:54.
- Simulation owners: keep archived observations outside live transition detection; full replay requires historical membership and chain distributions. Evidence: src/harbour/sim/sim.ts:491; src/harbour/sim/system.ts:195.
- Archive/audio owners: preserve existing exact-day anniversary eligibility and opt-in bell; month-only remembrances must remain silent. Evidence: src/harbour/model/anniversary.ts:7; src/harbour/audio/feed.ts:410.
- Skipped browsers, live APIs, builds and full test suites; repository remained read-only. In-memory probes confirmed projection failures and Watch inference; performance costs are estimates.
- Risk: shared history schemas do not prove upstream availability, retention or completeness; replay and year comparisons remain conditional on verified contracts.
