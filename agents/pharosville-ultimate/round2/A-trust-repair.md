# A — Trust repair

Verified 2026-11-08 against `/home/ahirice/Documents/git/pharosville`, HEAD `29e0b2a394db05d24d429a676e4f5e234f8a0500`. Anchors were reopened in current code. **20 normalized items kept; 1 false subclaim dropped; 8 enhancement clusters deferred.** Source ideas retain only the portions explicitly assigned below.

Keep D11: explanations on demand, one declared meaning per cue, identical analytical sentences in hover/panel/ledger. Fog means stale retained fleet data only. No new endpoint, dependency, renderer, asset, or persistent numeral surface. Preserve the sorted 720×600 screen/window gate and server-only API key. All estimates include focused tests; S ≤1 day, M ≤3 days, L ≤2 weeks.

## Shared state and copy contract

Keep freshness and completeness separate: `EndpointTruth.state = current | stale | unavailable`; add a reason and verified source timestamp, retaining receipt time separately. Reading coverage is complete/partial/absent; grade applicability is rated/not rated. Do not overload freshness with `partial` or treat NR as a failed endpoint. A stale partial reading displays both qualifications.

One pure formatter beside `src/harbour/ui/facts.ts` owns these sentences; `src/harbour/ui/bits.tsx`, Panel, Ledger, HoverTag and postcard consume it. `{reading}` is one of Supply, Chain comparisons, PSI, Peg readings, Stress readings, Safety grades, Flow readings. `{asOf}` is an explicit UTC date/time; no inferred timestamp when evidence is unknown.

| Condition | Exact shared sentences |
|---|---|
| Current, dated | “{reading}: current. Updated {asOf}.” |
| Stale, dated | “{reading}: stale. Last observed {asOf}.” |
| Stale, undated | “{reading}: stale. Source freshness is unverified.” |
| No usable observation | “{reading}: unavailable.” |
| Payload without source freshness | “{reading}: unavailable. Source freshness is unverified.” Retained values are headed “Last received values”; never current. |
| Partial coverage | “{reading}: partial. Observed across {coverage}% of tracked supply.” Append dated freshness sentence. |
| Individual absent row | “No peg reading is available for this coin.” / “No stress reading is available for this coin.” |
| Current grade feed, NR/missing grade | “Not rated.” If the feed is unavailable, say “Safety grades: unavailable.” instead. |
| Observed empty Shoals / alerts | “No off-peg coins were observed among covered coins.” / “No Alert-or-worse signals were observed among covered coins.” |
| PSI qualification | “Computed without stress signals.” / “Computed without depeg events.” / “Computed without stress signals and depeg events.” Then “A horn shutter narrows the beam until those inputs return.” |

Retain values in stale DOM records with their state; suppress live assertions. Unknown age renders “Source freshness is unverified.” Pending copy may say “Waiting for {reading}.” but pending is not a healthy analytical state. Use the same formatter for visual captions, accessible names and table disclosures; no bare dash as the sole explanation of missing evidence.

## Verified items and fix specifications

### A01 — Restore the consumed projection contract

Sources: S01-F1, S01-F2, S01-F3, S01-F10, S01-I1; S02-F4, S02-F5, S02-I1; S15-F1, S15-F2, S15-F3, S15-I1; S25-F1, S25-F2.

**Verified:** `functions/api/_project.ts:37,46,52,61,65,74,79,87` drops fields consumed by `src/harbour/model/readings.ts:34,87`, `src/harbour/model/events.ts:98,127,143,237` under `src/harbour/`. Direct consumer fixtures bypass that loss.

Extend projector, `shared/types/pharosville.ts:27`, and narrow model input types together:

| Endpoint | Additional retained evidence |
|---|---|
| chains | `globalChange24hPct`, `globalChange30dPct` (fractions, not percentages) |
| stability | `current.inputDegradation.{dewsUnavailable,depegEventsUnavailable}`, `current.methodologyVersion`, root `methodology.version`, history row `methodologyVersion`; include already-projected `computedAt` in narrow schema |
| pegSummary | root `methodology.version` alongside existing `asOf`; coin `methodologyVersion` |
| stress | root `methodology.version`, existing publication `updatedAt` in schema; see dropped subclaim D01 |
| safetyGrades | root `methodologyVersion`, existing `updatedAt` in schema |
| mintBurn | hourly `valuation` and all coin/window evidence enumerated in A08, included in this PR |

Preserve absence/null; project only the two qualification booleans, not failure diagnostics. Versions rebaseline silently; a complete closed flow hour retains the existing ≥$100M AND ≥3× mean eligibility. Qualification uses the shared exact sentences above. Tide rows remain 24 h / 7 d / 30 d; only 7 d moves the gauge.

**Cache cutover:** centralize epoch `pv2`, bump standalone contract 2→3, and namespace both normal and last-good internal cache keys by epoch. Never “upgrade” a stripped pv1 body by re-projecting it (`functions/api/[[path]].ts:139,254` cannot restore fields). Ignore old-epoch bodies; fetch upstream. Use browser revalidation (`cache: "no-cache"`) so an old browser max-age cannot hide the new ETag. Retain bodyless matching-304 behavior and Warning-110 fallback as full 200/no-store. Update `docs/pharosville/CONTRACTS.md:95` and fixtures atomically. First post-cutover outage may have no compatible fallback; disclose unavailable.

Tests: `functions/api/proxy.test.ts`, `src/harbour/model/events.test.ts`, `src/harbour/model/tide.test.ts`, new projection-to-DOM test described below. **M; medium risk; no dependency.**

### A02 — Unknown freshness and outage fallback cannot be current

Sources: S01-F7, S01-I3; S15-F4, S15-I2.

**Verified:** `src/harbour/data/fetch.ts:77,89` ignores warning-only responses without meta and changes fresh Warning 110 to degraded; `src/harbour/model/truth.ts:16,18` uses download age and accepts young degraded fallback as current. Proxy fallback marker is `functions/api/[[path]].ts:145`.

Carry explicit stale-fallback evidence outside nullable ApiMeta; classify retained fallback stale regardless of age. Without data, state is unavailable. Keep source age distinct from receipt time; reject negative/nonfinite ages. `Age` alone proves cache residence, not source freshness. Proxy fallback (`functions/api/[[path]].ts:141`) must not synthesize X-Data-Age from zero when original source age was unknown. Preserve numeric thresholds; ordinary input degradation remains a dated partial-reading caveat. Apply equivalent normalization to `src/lib/api.ts:323` where needed; do not import full upstream schemas into the eager feed.

Tests: `src/harbour/data/fetch.test.ts`, `src/harbour/model/build.test.ts`: fresh cache→immediate outage, warning without meta, malformed ages, age boundary, qualified PSI. Event acceptance must be false for fallback/unverified evidence. **M; medium; independent.**

### A03 — Separate cache lifetime from source tolerance

Sources: S15-F8, S15-I4.

**Verified, conditional:** `functions/api/[[path]].ts:281` supplies `metaMaxAgeSec` to `_shared.ts:94` when upstream omits Cache-Control. PSI tolerance is 86400 (`shared/lib/api-freshness.ts:138`), producer cadence 1800 (`cron-intervals-client.ts:24`). No claim about live headers is established.

Add registry `cacheTtlSec`, initially producerIntervalSec for each endpoint: 900 stablecoins/chains/peg/grades; 1800 PSI/stress/flows. Use it for browser/edge lifetime, preserving no-store/private and shorter upstream lifetimes; cap longer max-age/s-maxage at this bound. Do not change analytical tolerance or the separate 24-hour last-good retention. No user copy change. Tests: proxy absent/short/long/no-store headers and all seven registry entries. **S; low; independent.**

### A04 — Reject malformed enrichment without wedging publication

Sources: S15-F5, S15-I3.

**Verified:** `src/harbour/data/fetch.ts:43` checks containers only; `src/harbour/model/build.ts:88,89,135` dereferences rows; `src/harbour/sim/system.ts:179,189` builds after setting preparing but before try/finally.

Validate render-critical row identity, container shape and finite/nullable values before replacing last-good data. Reject invalid enrichment refreshes as contract errors; preserve accepted null/absent readings and stress null entries as missing coverage. Keep stablecoin sanitization’s valid null-chain tolerance. Put initial model construction inside cleanup ownership; model-validation errors must not mark the worker broken. Preserve installed coherent model/plan/pose. Copy uses A02 unavailable/stale reasons. Tests: `src/harbour/data/fetch.test.ts`, `src/harbour/sim/system.test.ts`: null peg/grade/chain row, array-as-dictionary, invalid hourly value, good refresh after rejection, `preparing` released. **M; medium; independent.**

### A05 — Neutralize stale cues; fog remains stale-only

Sources: S13-F9, S13-I9; S15-F6, S15-F7, S15-I5; S01-F8 (boards).

**Verified:** `src/harbour/readings/bind.ts:217` fogs first-load failure; `src/harbour/model/readings.ts:23,54,70` and `src/harbour/readings/bind.ts:185,205,212` retain stale beam/sea/weather/tide. `src/harbour/civic/civic-system.ts:386,405` lacks owning-feed truth in board keys. Storm flags/office dressing already gate current (`src/harbour/model/readings.ts:137`, `src/harbour/readings/bind.ts:215`); preserve them.

Fog iff retained fleet is stale; remove attempted-unavailable branch and contrary `src/harbour/readings/bind.test.ts:107`. Gate analytical targets on current owning sources and current fleet where supply weights are involved. Stale PSI is unlit; station shapes/pennant stowed; gauge uses existing grey unknown pose; grade board neutral, movers lowered. Include truth in repaint keys. Retain dated values in DOM; explain “The beacon is unlit while its reading is stale.”

Null targets must reset consumers: `src/harbour/readings/readings-system.ts:296` otherwise holds sea, and `src/harbour/weather/director.ts:296` otherwise continues old weather. Reset ocean to its declared non-analytical boot parameters (`src/harbour/ocean/ocean-system.ts:107`), weather to boot cloud .38/wind .3, no precipitation/lightning/recovery. Clear front/recovery history so missing→current never stages a false recovery. Do not move retained Shoals boats back to healthy circuits merely because the peg feed aged; suspend new transitions and distress embellishment, extinguish reading lamps, retain location as last observed. Copy: “Positions are last observed; current peg readings are unavailable.”

Tests: bind, director, civic, fleet signals and sim tests; capture transitions, not only missing-on-load. **M; high visual risk; depends A02.**

### A06 — Observed zero is different from no coverage

Sources: S01-F6, S01-I3; S02-F3, S02-I2; S04-F1, S04-I1.

**Verified:** `src/harbour/model/build.ts:103,121` defaults absent peg rows false; `src/harbour/model/readings.ts:45,49` accepts empty feed as zero; `src/harbour/ui/facts.ts:174`, `src/harbour/ui/Panel.tsx:312,320,377` assert healthy emptiness.

Add peg observed-supply/coverage to SeaStateReading using valid finite peg observations. No covered supply or no fleet yields null share/step, not zero. Preserve the existing total-live-supply denominator; partial coverage reports “At least {share}% of tracked supply is observed off peg.” plus coverage sentence. Never silently renormalize to covered supply. Weather retains its existing covered-supply weighting. Gate empty-list claims on coverage/current truth; use vocabulary above. Panel subtitles: “Peg readings unavailable”, “Stress readings unavailable”, or “No observed depegs”. Aggregate Calm can coexist with alerts; do not infer it from an empty alert list.

Tests: build/bind and DOM: null/pending/failed/empty feed, partial coverage, real fully observed zero, valid zero-boat fleet. **M; medium; depends A02.**

### A07 — Freshness beside the reading, with advancing ages

Sources: S01-F8, S01-I3; S02-F8, S02-I2, S02-I6, S02-I8, S02-I13; S03-F4, S03-I4; S15-F9, S15-I11; S26-I3.

**Verified:** BoatPanel `src/harbour/ui/Panel.tsx:127,183` labels supply only; ledger `src/harbour/ui/Ledger.tsx:184,186,189,220` has no per-source state. `src/harbour/ui/bits.tsx:166`, `src/harbour/ui/Panel.tsx:865` render build-time age; `src/harbour/sim/system.ts:267` rebuilds only on state changes.

Apply shared sentences per Supply/Peg/Stress/Grade/Flow section and ledger column disclosure. Harbour holdings use stablecoins truth; comparisons/health use chains truth. Wordmark scopes status: “Supply: current; {n} other readings are stale or unavailable.” Keeper’s Log lists all seven independently. Advance relative age from source timestamp with one minute timer only while disclosures are visible; do not rebuild routes. Hover carries primary fact plus state; constrain/wrap it so caveats remain visible. No new provenance sheet needed. Tests: new `ui/truth-dom.test.tsx`, fake-timer ages and mixed current/stale feeds. **M; low; depends A02, A06.**

### A08 — Nullable flows, lower bounds and incomplete windows

Sources: S01-F4, S01-F12, S01-I2; S02-F2, S02-F6, S02-F7, S02-I3; S25-F8.

**Verified:** `src/harbour/ui/Panel.tsx:125,177,179` checks nonexistent status and coerces null; `src/harbour/civic/flows.ts:80,81` reconstructs net/direction. `shared/types/mint-burn.ts:45,55,82,100,119` defines actual evidence.

Retain coin `valuation.window24h.{completeness,mintCompleteness,burnCompleteness}`, `valuation.netFlow7d`, and `coverage.{status,has24hWindow,historyStartAt,isPartial}`; retain hourly valuation via A01. Carry them through FlowsReading. Pass nullable numbers unchanged; civic net stays null, dominance=0 whenever signed net is withheld. Partial/unknown hourly valuation keeps gross activity only as an explicitly lower-bound observation; incomplete 24-hour windows bank the comparative activity cue rather than treating missing hours as zero.

Copy: “Net unavailable: some events lack USD valuation.” / “Valuation completeness is unknown.” / “At least {amount} minted.” / “At least {amount} burned.” Use “Partial history” for partial-history/bootstrapping or insufficient window; “Flow coverage is lagging.” for lagging; disabled/unknown/absent evidence is unavailable. Complete means the relevant window is proven, not merely status=full. For 7 d use historyStartAt plus supplied valuation; there is no `has7dWindow` field. Never label an incomplete sum “24 h” without qualification. Customs: “Each bar is hourly net flow: mint minus burn. Positive bars show net minted; negative bars show net burned.” Real zero remains $0; empty series is unavailable. Remove default chain scope when missing; say “Flow scope is unavailable.”

Tests: civic, model and DOM projected fixtures for null/zero, all six coverage statuses, side-specific valuation, incomplete/gapped windows, unknown scope. **M; high; depends A01, A02.**

### A09 — Explain the actual storm mast

Sources: S01-F5, S01-I4; S02-F1, S02-I4; S03-F1, S03-I1; S04-F2, S04-I2.

**Verified:** `src/harbour/readings/bind.ts:152,194`, `src/harbour/readings/storm-cones.ts:8` render weighted-band shapes; Panel/facts/Ledger still teach coin counts (`src/harbour/ui/Panel.tsx:373`, `src/harbour/ui/facts.ts:184`, `src/harbour/ui/Ledger.tsx:99`).

Reuse one descriptor derived from mastForBand: “The station repeats the supply-weighted stress band: Calm, no shapes; Watch, one cone; Alert, two cones; Warning, two cones and one drum; Danger, two cones and two drums with a red pennant.” Current hover/panel/ledger reading: “Station: {band}; {shape description}.” Count separately: “{n} covered coins are at Alert or worse.” Individual signals: “The five highest-scoring Alert-or-worse coins may fly a masthead signal: Alert, a cone; Warning, a drum; Danger, a cone and a drum. Early warning, not a depeg.” Preserve weighted rounding and ranking/ties. No wire change. Tests: existing `src/harbour/readings/bind.test.ts:75` Calm-with-one-alert plus all bands and DOM parity. **S; low; independent.**

### A10 — Timestamped histories and readable observations

Sources: S01-F13; S02-F11, S02-I10; S25-F6, S25-I3; S26-F1, S26-I4.

**Verified:** `src/harbour/ui/bits.tsx:65,84,114,147` index-spaces and invents date bounds; `src/harbour/ui/Panel.tsx:251,828,835` calls record tails a month.

Validate dates before projection’s 30-row tail. Use actual UTC timestamps for positions/bounds; sort, retaining the last source row per duplicate timestamp. Leave missing hourly slots empty. Render PSI as dated dots without interpolated connecting lines. Titles “PSI observations”; caption “{n} observations from {start} to {end} (UTC).” Change/range refer to that interval; score differences require compatible known methodology, otherwise “Comparison unavailable across methodology versions.” Signed changes say “{signed value} points.” Flow caption gives actual range and “{n} of 24 hourly observations.” Add collapsed “View values” semantic tables from the plotted arrays, including missing/partial rows. Tests: new `src/harbour/ui/charts.test.tsx`, sparse/short/duplicate/stale series, timezone and method boundaries. **M; medium; depends A01, A08.**

### A11 — Name chain attribution denominators

Sources: S01-F9, S01-I5; S02-F8, S02-I9 (denominator only).

**Verified:** `src/harbour/model/build.ts:116,132,143` divides by attributed supply; `src/harbour/ui/Panel.tsx:600` claims all supply. `src/harbour/ui/facts.ts:102`, `src/harbour/ui/Panel.tsx:492` omit unattributed Far Ports allocation.

Keep circuit/pier arithmetic. Chain header/ledger: “{share}% of reported chain-attributed supply.” Boat split: “Percentages are shares of reported chain-attributed holdings.” Compute total versus attributed from existing coin buckets, not a different upstream aggregate. Positive gap: “{amount} has no reported chain allocation.” Overshoot: “Reported totals do not reconcile.” Far Ports: “Far Ports includes small chain allocations, chains without a pier, and supply without a reported chain allocation.” Rename holder list “Largest reported holdings”; preserve actual circuit caller count separately. No wire change. Tests: $100 total/$60 attributed, over-attribution, no allocations, holder outside quantized circuit. **S; low; independent.**

### A12 — Reconcile Registry NR

Sources: S01-F11, S01-I11 (tally); S02-F9, S02-I12 (grades only).

**Verified:** `src/harbour/ui/Panel.tsx:879,880` creates invisible N bucket; `src/harbour/civic/yard.ts:101` already groups NR correctly.

Reuse gradeTally for panel; normalize NR/missing grade to “Not rated” across boat, ledger, panel and board explanation, subject to endpoint availability. No safety-score/metadata expansion or active-ID filter change. Every live boat must appear in one displayed bucket; wrecks excluded. Tests: civic tally and Registry DOM, all grade variants/NR/null. **S; low; independent.**

### A13 — Shipyard means admission, not verified public launch

Sources: S02-F10, S02-F13, S02-F16, S02-I11.

**Verified:** `src/harbour/ui/Panel.tsx:727,768`, `src/harbour/ui/Ledger.tsx:208`, `src/harbour/ui/facts.ts:194` contradict mainnet records (`src/harbour/data/prelaunch.json:1595`); `src/harbour/ui/yard.ts:171` resurrects entries for authoritative []; departure helper `src/harbour/ui/yard.ts:195` omits civic name+symbol matching (`src/harbour/civic/yard.ts:89`). Phase explanation is clamped (`src/harbour/ui/harbour-ui.css:393`).

Copy everywhere: “Awaiting admission to the tracked fleet.” Explanation: “A Shipyard record may already be in pilot or on mainnet. Its hull follows the recorded phase; it joins the fleet when tracking inputs become available.” Departure heading “Admitted to the fleet”; empty: “No records are awaiting admission to the tracked fleet.” Honor civic [] and reuse launchedIds identity rules. Preserve phase/expected-date/source details; expose full narrative with “More about this record”, not silent clipping. Label bundled records “Bundled admission records; see sources for dates.” No invented launch date. Tests: yard and DOM for mainnet beta, all admitted, absent civic service, alias/name match. **M; low; independent.**

### A14 — Bound Day book claims to observations

Sources: S02-F14, S02-F15, S02-I14; S13-F10, S13-I11; S25-F5, S25-F7, S25-I8.

**Verified:** `src/harbour/ui/Panel.tsx:513` says four hours versus `src/harbour/sim/plan.ts:15` six-hour scheduling cycle; `src/harbour/ui/Panel.tsx:556,558` overclaims empty journal/confirmation. `src/harbour/model/events.ts:297` calls register arrival launch; `src/harbour/model/event-hub.ts:82` caps 200.

Copy: “Boats follow deterministic schedules shared by visitors.” “No confirmed changes recorded this visit.” “State changes require two consecutive accepted readings. Completed, fully valued flow hours are evaluated once per new hour. Missing, stale and methodology-change readings do not establish market changes.” Arrival event/hover: “{symbol} joined the tracked register.” / “Dressed overall: joined the tracked register this visit.” Retain internal launch event kind/ceremony. Expose dropped count, earliest retained confirmation, date/timezone, and “Showing {n} of {retained} retained entries; {dropped} earlier entries discarded.” Add “Show earlier entries” within the existing cap. Expanded entry: “First observed {time}; confirmed {time}.” Never “occurred”. Tests: events/event-hub and DOM, 201 entries, midnight, closed-hour exception, no first-load ceremony. **M; low; depends A01, A02.**

### A15 — Watch reasons must still be supported

Sources: S25-F3, S25-F4; S04-I12 (waiting state only).

**Verified:** `src/harbour/ui/watch.ts:41` uses weaker prevWeek rule than `src/harbour/model/readings.ts:182`; `src/harbour/ui/store.ts:448,467` freezes reason strings without truth checks.

Pass Boat.maiden instead of recomputing newness. Gate mover/newcomer on current stablecoins; depeg on current peg and fleet. Re-rank/invalidate on installed model or freshness changes; never mix newer feed rows with an older model. Missing current sources: “The watch is waiting for current readings.” Current but empty ranking: “No qualifying watch subjects in current readings.” Preserve thresholds. Tests: `src/harbour/ui/watch.test.ts` and new `src/harbour/ui/watch-truth.test.ts`, positive month baseline, widespread week gaps, sources aging mid-stop. **S; medium; depends A02.**

### A16 — Arrival must not attenuate analytical light

Sources: S04-F6, S04-I10.

**Verified:** `src/harbour/app/wake.ts:41,68` sets intro attenuation during exposed crossfade; `src/harbour/beam/beam-system.ts:347,406` multiplies analytical visibility by it.

Remove beam kindling from exposed arrival; keep camera drift and poster timing. Beam begins at the true current/qualified target, or neutral unavailable target. No additional copy or wire change. Tests: `src/harbour/app/wake.test.ts`, reveal tests, real-GPU arrival filmstrip with normal and reduced motion. **S; low; independent.**

### A17 — Display completeness survives the shell

Sources: S04-F4, S04-I8.

**Verified:** `src/harbour/app/harbour-app.tsx:71,79,103` stops monitoring after partial reveal/removes warning; `src/harbour/ui/bits.tsx:7` knows only data freshness.

Publish presentation status/revision/displayed/expected from the completed-render callback to UI; monitor committed revisions after reveal, update only on status changes. Keep it independent of endpoint truth. Wordmark disclosure, Keeper’s Log and postcard: “{displayed} of {expected} boats displayed. This view is incomplete.” Pending: “The fleet’s readings are still arriving; boats are not shown yet.” Planning failure: “The fleet could not be prepared. Readings remain available in Pharos analytics.” Clear partial only after matching rendered revision/count; valid zero is complete. Tests: reveal and truth DOM, partial→complete and complete→partial. **M; medium; independent.**

### A18 — Banked Mint is silent

Sources: S21-F1, S21-I1.

**Verified:** `src/harbour/audio/feed.ts:294` fabricates .5 activity; `src/harbour/audio/ambience.ts:715,965` gates only on proximity, unlike Burn. Civic already exposes banked (`src/harbour/civic/civic-system.ts:56`).

Add explicit Mint available/unbanked input, default false. Gate bus gain and new press scheduling; clear queued press deadlines on banking so recovery causes no catch-up burst. Preserve fresh zero-activity idle rhythm; rate=0 alone cannot represent unavailable. Shared flow state describes why fires are banked. No new audio meaning or opt-in change. Tests: controller/lifecycle, current/stale/unavailable/missing civic and recovery. **S; low; independent.**

### A19 — Freeze postcard provenance with its frame

Sources: S20-F2, S20-F3, S20-I5; S25-I10; S26-F3, S26-I7.

**Verified:** `src/harbour/ui/Postcard.tsx:31` uses remapped light hour (`src/harbour/engine/time-of-day.ts:254`); `src/harbour/ui/postcard.ts:30,32` collapses endpoint freshness and invents unknown timestamps. `src/harbour/ui/store.ts:514` returns pixels without receipt identity.

Return frame plus immutable receipt from the same completed render/model revision: capture UTC, `clockHour`, endpoint truth/source times, PSI score/band/qualification, and presentation completeness. Do not sample a later model after awaiting pixels/fonts. Print and expose selectable DOM caption: “Picture captured {UTC}.” “Decorative scene time: {HH:mm} local.” “Pharos Stability Index: {score}, {band}.” Then shared per-source sentences for all seven feeds and qualification, and “Source: https://pharosville.pharos.watch/ — this link opens current readings.” Missing PSI uses “PSI: unavailable.” Add “Copy caption” with selectable-text fallback; wrap footer and expand height at tablet drawing resolution. Preserve display-resolution capture and paper treatment. Tests: postcard unit/component race, mixed freshness, unknown age, seasonal clock remap, incomplete fleet; GPU export inspection. **M; medium; depends A01, A02, A17.**

### A20 — Correct the rest of the existing visual key

Sources: S03-F2, S03-F3, S03-F5, S03-F12, S03-I2; S01-I4 (comparison).

**Verified:** `src/harbour/ui/Ledger.tsx:71,81,85,95` mislabels distress, chain lettering, activity and boundaries; owners are `src/harbour/fleet/fleet-system.ts:967`, `src/harbour/sim/sim.ts:960`, `src/harbour/identity/labels.ts:57`, `src/harbour/civic/flows.ts:52`, `src/harbour/readings/bind.ts:45,123`.

Exact legend sentences, reused wherever that explanation appears:

- “Ordinary sail motion is decorative. Shoals placement, listing, distressed canvas and the checkered flag indicate an observed depeg; weather strength follows stress.”
- “Sea-state thresholds are below 0.5%, 0.5% to below 2%, 2% to below 10%, and 10% or more of tracked supply observed off peg.” Append A06 coverage qualification.
- “Sea zones are lettered on the water. Chain harbours use crests; optional chart labels name the chains.”
- “Office works begin at +8% over 30 days and remain until below +6%; furled awnings begin at −8% and remain until above −6%. Unavailable or stale comparisons leave offices neutral.”
- “Mint and Burn activity uses 60% of the 24-hour mean and 40% of the latest completed hour, on a compressed scale. Direction is unavailable when net valuation is withheld.”
- “The tide gauge shows seven-day global supply change on a signed square-root scale, full at ±2%; changes smaller than 0.01% are slack.”
- “Hull supply classes begin at $1M, $10M, $100M, $1B and $10B.” “Wreck form follows the recorded cause family; size follows peak-cap rank.” “A fresh wreath marks the newest recorded death within 90 days; month-only dates count from month end.”
- “Confirmed visit events may stage brief ceremonies; the Day book also records events that receive no ceremony. Night and seasons follow the calendar and carry no market reading.”

Use existing FAMILIES/REEF_FLARE_LINE and A09 mapping; no new cue. Add anniversary explanation from `src/harbour/model/anniversary.ts:7`: “An anniversary requires a recorded full date from an earlier year; month-only dates have no anniversary day.” Tests: mapping boundary tests and legend DOM assertions against owner constants, including exact 10%, office release boundaries and 90 days. **M; low; depends A05, A06, A08, A09, A13, A14.**

## Ordered PR bundles

Changed-line estimates include tests/docs, not generated files. Each ships on the stated prior bundles, needs no later bundle, and stays below roughly 600 lines. Split before implementation if measurement exceeds the cap.

| Order | Bundle / items | Est. lines; effort; dependency | One-line acceptance |
|---|---|---|---|
| 1 | Projection evidence — A01 | 450–580; M; none | Projected payloads preserve qualification, silent method rebaselines, valued-hour eligibility and all tide horizons; pv1 cannot masquerade as pv2. |
| 2 | Freshness evidence — A02 | 220–350; M; none | Warning-110 and unverified-source payloads never authorize current cues/events. |
| 3 | Honest flow values — A08 | 350–520; M; 1,2 | Withheld net remains unknown end to end; partial histories never become exact daily totals. |
| 4 | Publication guard — A04 | 220–350; M; none | Bad enrichment cannot replace last-good data or wedge preparation. |
| 5 | Cache lifetime — A03 | 100–180; S; none | Normal cache lifetime never exceeds producer cadence. |
| 6 | Coverage and empty states — A06 | 220–360; M; 2 | No-coverage Shoals/Storm never claim healthy observations. |
| 7 | Neutral world targets — A05 | 350–550; M; 2 | Independent stale feeds lose active analytical cues; first-load failure produces no fog. |
| 8 | Local provenance — A07 | 300–480; M; 2,6 | Mixed-source DOM disclosures use identical state sentences and advancing ages. |
| 9 | Mast, Registry, attribution — A09,A12,A11 | 300–480; M; none | Shapes match text, every live grade is counted, and percentages name their denominator. |
| 10 | Honest histories — A10 | 320–500; M; 1,3 | Actual dates/gaps/methods and accessible values agree with each plot. |
| 11 | Admission dossier — A13 | 220–370; M; none | Mainnet-in-yard and authoritative-empty records agree across surfaces. |
| 12 | Session observation language — A14,A15 | 300–500; M; 1,2 | Journal/watch claims remain bounded by accepted observations and retention. |
| 13 | Arrival integrity — A16,A17 | 260–430; M; none | Visible beacon is truthful and display incompleteness stays inspectable until repaired. |
| 14 | Banked audio — A18 | 100–200; S; none | A banked/missing Mint schedules no audible presses. |
| 15 | Postcard receipt — A19 | 280–450; M; 1,2,13 | Pixels and portable caption describe one rendered revision without fabricated provenance. |
| 16 | Finish visual key — A20 | 220–350; M; 3,6,7,9,11,12 | Every listed cue explains its existing source, thresholds and neutral state accurately. |

## Projection-contract proof and delivery gates

Create fixture builders from real upstream shapes with no credentials. Run **payload → endpointProjector → standalone schema → defaultFetcher/HarbourFeed → buildHarbourModel → deriveTargets/eventSnapshot → rendered DOM**. Tests must feed projector output, not reinsert stripped fields afterward. New `src/harbour/ui/projection-truth.test.tsx` can use jsdom; test events separately in model integration. Keep shared fixtures small and importable by proxy/model/DOM tests.

Required cases: each PSI qualification flag/both/neither; root and peg-row version changes versus same-method confirmed changes; complete/partial/missing hourly valuation; all tide horizons; null/zero net; all coverage statuses; empty/malformed feeds; fresh supply with stale PSI/stress/grades/flows; unknown metadata; young Warning-110 fallback; pv1 normal/last-good cache entries; matching pv2 304 versus fallback full 200. Assert identical qualification/state sentences in hover/panel/ledger and postcard, not merely schema success. Assert guardrails: no API credentials, unchanged same-origin allowlist, no request/runtime on denied viewport.

Implementation gates: focused `npx vitest run functions/api/proxy.test.ts src/harbour/data src/harbour/model src/harbour/readings src/harbour/civic src/harbour/ui src/harbour/app src/harbour/audio`, then `npm run validate:changed`. Existing `tests/visual/harbour-dom.spec.ts` covers DOM/admission only; never infer rendering quality or FPS from its browser.

For A05/A09/A16/A17/A19, later implementation must use **`npm run preview`** (shared headless real-GPU path only) for current/stale/unavailable transitions, all five mast bands with mismatched alert count, zero coverage, partial flows, arrival normal/reduced motion and 834×1112 export layout. Route controlled responses through the existing capture harness or approved fixtures; URL overrides alone do not prove the production projector/freshness pipeline. No browser was launched in this research pass. Before broad release confidence run `validate:release`; Apple Silicon Safari 26/Chrome remains the hardware gate, currently unavailable here. No release/performance PASS is claimed.

## Decisions and dispositions

**DECISION-NEEDED — D-A1, sea denominator:** recommend keeping off-peg observed supply / all tracked live supply with explicit lower-bound/coverage copy (A06). Renormalizing to covered supply would change existing sea-state thresholds and requires an explicit product decision, reviewed examples and matching DOM/tests. The default repair ships without that remap.

**DECISION-NEEDED — D-A2, freshness tolerance:** current shared ratios are 8× fresh/12× degraded (`shared/lib/status-thresholds.ts:4`), with a one-day PSI base. Recommend a separate producer-cadence review before tightening those numeric budgets; A02 removes invented freshness and transport ambiguity without silently changing them. A03 fixes cache lifetime independently.

**Dropped D01, false subclaim:** S01-F2/S15-F3/S25-F1 must not claim stress *row* methodology changes are already suppressed. `src/harbour/model/events.ts:129` stores `dewsMethod`, but `varsOf`/detector never compares it; only endpoint methodology protects aggregate DEWS. Restore root `methodology.version`; omit unused row versions. Row-only guarantees would need detector design and tests, not projection alone. All other retained defects remain present; none was found already fixed.

Deferred clusters (excluded from A; partial source ideas retain only portions explicitly assigned above):

1. New analytics, ranks and filters: S01-I6–I12 beyond A12 tally; S02-I5/I7/I9 beyond denominator; S03-I3/I10/I12; S26-I14. They expand analysis rather than repair existing readings.
2. New endpoints/history replay: S01-I13–I15, S25-I4/I11. Require upstream/allowlist decisions; current comparison buckets cannot reconstruct history.
3. Return digests/persisted journals: S04-I11, S25-I1/I2/I9. New storage/comparison semantics, unnecessary for present truth repair.
4. Life records/calendar/history controls: S25-I3 beyond accurate chart/table, S25-I5–I7. Additional experiences, not required for dated evidence.
5. Teaching, navigation, search and modal controls: S02-F12 beyond readable caveats; S03-F6–F11/I5–I9/I11/I13; S04-F3/F5/F7 and I3–I7/I9/I12 beyond waiting/I13; S20-I1–I4/I6–I14; S26-I1/I2/I5/I6/I8/I12/I13. Route to UX/motion/sharing work; reduced-motion timed watch jumps (S26-F4) need that workstream, not a truth-state remap.
6. General recovery, retry, optimization and telemetry: S13 except F9/F10/I9/I11; S15-I6–I10/I12; S21 except F1/I1. Separate resilience/audio owners; do not duplicate machinery here.
7. Art/quality experiments: S26-I9–I11. Need hardware/taste evidence, outside data truth.
8. Global numeric-format overhaul (S02-F17/I7) beyond A10’s points unit. Current boundary quirks are real (`src/harbour/ui/format.ts:12,23`), but locale/precision redesign can ship separately.

Only this spec was written. Startup checks ran; no runtime tests, live upstream verification, browser captures or performance measurements ran. Remaining risk is visual acceptance of neutral transitions and the intentional loss of incompatible cached fallback at projection cutover.
