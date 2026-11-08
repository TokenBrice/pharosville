# S15

## Executive summary

The feed already has producer-aware polling, hidden-page suppression, projected ETags, edge caching, timeouts, and last-good recovery. The largest problems are correctness defects: projection removes PSI qualification, flow valuation, and methodology evidence; unknown age becomes current; malformed enrichment can permanently wedge model preparation. Fog also covers unavailable data, while stale side feeds retain active analytical cues. Fix these before optimizing delivery. The strongest speed improvement is bounded edge revalidation using existing snapshots, avoiding the current upstream wait before fallback. Savings below are estimates, not live measurements.

## Current state

- Seven endpoints load concurrently. Copied producer cadences are 15 minutes for stablecoins, chains, peg summary, and grades; 30 minutes for PSI, stress, and flows. These are repository declarations, not independently verified upstream schedules. Evidence: shared/lib/pharosville-endpoint-registry.ts:21; shared/lib/cron-intervals-client.ts:15; src/harbour/data/fetch.ts:135.
- Successful polling targets the next producer write plus 45 seconds, bounded between one minute and one interval. Missing metadata uses half an interval. Errors back off through 30/60/120/300/600 seconds without jitter. Evidence: src/harbour/data/fetch.ts:23; src/harbour/data/fetch.ts:94; src/harbour/data/fetch.ts:168.
- Scheduled hidden-page polling pauses through one-minute checks. There is no feed visibility-resume listener, offline handling, or cross-tab coordination; returning can wait nearly another minute. Evidence: src/harbour/data/fetch.ts:121; src/harbour/data/fetch.ts:174. Repository searches found no feed-level online/offline or BroadcastChannel implementation.
- Projected SHA-256 ETags support weak/strong GET validators, lists, and wildcard matching. Browser HTTP caching owns conditional reuse; misses still fetch and project the complete upstream response without upstream validators. Evidence: functions/api/[[path]].ts:104; functions/api/[[path]].ts:115; functions/api/[[path]].ts:176; docs/pharosville/CONTRACTS.md:117.
- The proxy already uses caches.default and a separately stored 24-hour last-good copy. Fallback follows upstream failure or 5xx, returns full JSON with Warning 110 and no-store, and preserves aging. Evidence: functions/_shared.ts:118; functions/_shared.ts:196; functions/api/[[path]].ts:138; functions/api/[[path]].ts:259.
- Projection already removes substantial unused fields, caps PSI history at 30 rows, and preserves _meta. Actual wire sizes were not measured. API cache headers belong to Function responses; public/_headers primarily configures static assets. Evidence: functions/api/_project.ts:22; functions/api/_project.ts:50; functions/api/[[path]].ts:276; public/_headers:1.
- Freshness fallback becomes stale above 12× endpoint budgets: fleet 2 hours, chains/stress 6 hours, peg/grades 3 hours, flows 12 hours, PSI 12 days. Explicit server stale status overrides these ages. Evidence: src/harbour/model/truth.ts:17; shared/lib/status-thresholds.ts:4; shared/lib/api-freshness.ts:119.
- First fleet preparation already overlaps API requests, coastline loading, and worker startup. Installation waits for stablecoins and peg-summary snapshots, including settled errors. Evidence: src/harbour/sim/system.ts:114; src/harbour/sim/system.ts:157.

## Findings

### S15-F1 [high] Projection disables the qualified PSI cue

- Evidence: functions/api/_project.ts:46; shared/types/pharosville.ts:34; src/harbour/model/readings.ts:34; src/harbour/ui/Panel.tsx:250.
- Detail: The proxy drops current.inputDegradation, although psiQualified reads its early-warning availability flags. Consequently, projected production responses cannot narrow the beam or show the existing qualification explanation when PSI was computed without those inputs. An in-memory projection probe confirmed the field disappears.
- Fix: Retain inputDegradation in the projector and standalone schema. Add a projected-response-to-model test covering each unavailable input and the existing qualified text.

### S15-F2 [medium] Projection prevents every real flow-hour event

- Evidence: functions/api/_project.ts:87; shared/types/pharosville.ts:47; src/harbour/model/events.ts:143; src/harbour/model/events.ts:321.
- Detail: Hourly projection removes valuation. Event detection requires valuation === "complete", so every projected hour fails completeness regardless of its volume. Existing event tests supply unprojected valuation fields and therefore miss the regression. An in-memory probe confirmed the loss.
- Fix: Retain hourly valuation and test projected consecutive hourly snapshots through eventSnapshot and detectEvents. Preserve rejection of partial or missing valuation.

### S15-F3 [medium] Projection removes methodology change safeguards

- Evidence: functions/api/_project.ts:46; functions/api/_project.ts:65; functions/api/_project.ts:74; functions/api/_project.ts:79; src/harbour/model/events.ts:98; src/harbour/model/events.ts:237.
- Detail: The detector silently re-baselines methodology changes, but projection removes the endpoint and row version fields it reads. Production observations therefore carry null versions and can report methodology-driven changes as market events after hysteresis. Preserving _meta does not preserve these separate fields.
- Fix: Retain precisely the endpoint and per-row methodology versions consumed by events.ts. Test a version change through projection and confirm no event.

### S15-F4 [high] Missing freshness evidence becomes current

- Evidence: src/harbour/data/fetch.ts:77; src/harbour/data/fetch.ts:89; src/harbour/model/truth.ts:16; docs/pharosville/CONTRACTS.md:49.
- Detail: Without valid metadata or X-Data-Age, endpointTruth substitutes time since download and reports current. Every successful fetch resets that invented age. Warning 110 is ignored entirely when meta is null. Probes confirmed both behaviors, contradicting the explicit unknown-age contract.
- Fix: Keep unknown source age distinct from download age, preserve warning-only evidence, and prevent unknown evidence from enabling current analytical cues.

### S15-F5 [high] Malformed enrichment can permanently wedge preparation

- Evidence: src/harbour/data/fetch.ts:43; src/harbour/model/build.ts:88; src/harbour/sim/system.ts:179; src/harbour/sim/system.ts:189; src/harbour/sim/system.ts:190.
- Detail: The feed accepts peg-summary coins:[null] because it checks only the outer array. Model construction then dereferences null.id. Construction occurs after preparing=true but before the try/finally, leaving preparing stuck true and rejecting the unawaited preparation task. Later good refreshes cannot recover. An in-memory probe confirmed malformed row acceptance and the failing dereference.
- Fix: Validate render-critical enrichment rows before replacing last-good data. Move model construction inside preparation's try/finally and classify malformed data separately from worker failure.

### S15-F6 [medium] A failed first fleet request produces stale fog

- Evidence: src/harbour/readings/bind.ts:217; src/harbour/readings/readings-system.ts:220; src/harbour/readings/bind.test.ts:107; src/harbour/ui/Ledger.tsx:103.
- Detail: Fog explicitly enables for unavailable stablecoins after any attempt, including a first-request failure with no dated fleet. The test enshrines this behavior, while the legend and brief reserve fog for stale data. Unavailable and stale currently share an analytical visual meaning.
- Fix: Restrict fog to a dated stale fleet. Keep failed initial loading as an empty harbour with unavailable copy, and update the conflicting test.

### S15-F7 [high] Stale side feeds retain active analytical cues

- Evidence: src/harbour/model/readings.ts:23; src/harbour/model/readings.ts:54; src/harbour/model/readings.ts:70; src/harbour/readings/bind.ts:185; src/harbour/readings/bind.ts:205.
- Detail: Stale PSI remains lit; stale peg and stress readings still produce sea and weather targets. Their stale flags do not gate these bindings. Since side-feed staleness does not create fleet fog, an old STEADY/CALM reading can retain its healthy appearance despite the brief's neutral-pose requirement.
- Fix: Gate analytical targets on current source truth, retain dated values in DOM details, and test stale side feeds independently of stablecoins.

### S15-F8 [medium] Fallback cache TTL can hide a day of PSI updates

- Evidence: functions/api/[[path]].ts:281; functions/_shared.ts:94; shared/lib/pharosville-endpoint-registry.ts:46; shared/lib/api-freshness.ts:138; shared/lib/cron-intervals-client.ts:24.
- Detail: When upstream omits Cache-Control, the proxy uses the freshness budget as HTTP max-age. PSI therefore receives 86400 seconds despite a declared 1800-second producer cadence. Browser and edge caches can reuse one body across 48 producer cycles. This is a conditional code-path defect; live upstream headers were not checked.
- Fix: Define an explicit per-endpoint cache TTL bounded by publication cadence. Keep HTTP cache lifetime separate from analytical freshness tolerance.

### S15-F9 [low] Displayed ages freeze between model installations

- Evidence: src/harbour/model/truth.ts:16; src/harbour/sim/system.ts:263; src/harbour/ui/bits.tsx:166; src/harbour/ui/Panel.tsx:865.
- Detail: Age is calculated into the model, then rendered directly. The periodic truth check only rebuilds when the categorical state changes. Between endpoint arrivals, an open freshness label can keep the same age for minutes despite continued wall-clock aging.
- Fix: Advance displayed age from the model timestamp with a low-frequency DOM timer while freshness details are visible; do not rebuild the fleet.

## Ideas

### S15-I1 Repair projection against actual consumers

*informative · data-bound · effort S · impact 5 · confidence 5*

- What: Restore PSI inputDegradation, hourly valuation, and consumed methodology versions. Extend standalone schemas and add projection-to-model/event integration tests covering S15-F1–F3.
- Visitor benefit: Restores honest PSI qualifications and flow events while preventing methodology changes from masquerading as market changes.
- Data/DOM: Use existing flags, methodology versions, and complete valuation. Preserve existing PSI qualification text and flow thresholds: at least $100M and 3× hourly mean. Test the existing DOM/event semantics.
- Where: functions/api/_project.ts:40; shared/types/pharosville.ts:32; src/harbour/model/events.ts:98; src/harbour/model/readings.ts:34.
- Perf: Zero new draws; estimated hundreds of bytes to several KB raw per response, depending on versioned row counts.
- Risks: Invalidate cached projected representations and update projection epoch checks; otherwise old objects retain omissions until expiry.
- Depends on: —

### S15-I2 Make unknown freshness explicit

*professional · data-bound · effort M · impact 5 · confidence 5*

- What: Separate source age from receipt time, preserve warning-only responses, and share the small freshness-evidence normalizer between the Harbour fetcher and generic API helper.
- Visitor benefit: A successful download no longer implies the underlying market observation is current.
- Data/DOM: Evidence: _meta, X-Data-Age, Age, Warning. Missing source age displays 'Source age unavailable'; warning-only data never claims fresh. Unit-test missing, malformed, negative, and warning-only evidence.
- Where: src/harbour/data/fetch.ts:68; src/lib/api.ts:317; src/harbour/model/truth.ts:12; src/harbour/ui/bits.tsx:162.
- Perf: Zero GPU cost; small constant work per response and negligible extra state.
- Risks: Some currently live-looking feeds may become explicitly unknown; preserve last-good values without inventing source timestamps.
- Depends on: —

### S15-I3 Contain bad rows before publication

*professional · infra · effort S · impact 5 · confidence 5*

- What: Add lightweight render-critical checks for enrichment rows, retain last-good data on invalid refreshes, and include model construction inside preparation's cleanup boundary.
- Visitor benefit: One malformed source row cannot disable future fleet updates.
- Data/DOM: Preserve unavailable/null readings; never repair malformed values into zero or healthy defaults. Test bad refresh followed by valid recovery.
- Where: src/harbour/data/fetch.ts:39; src/harbour/model/build.ts:88; src/harbour/sim/system.ts:179.
- Perf: Estimated sub-millisecond linear checks for ordinary projected payloads; no dependency or GPU work.
- Risks: Overly strict validation could reject tolerated upstream nulls; retain the existing stablecoin supply repair behavior.
- Depends on: —

### S15-I4 Separate cache lifetime from freshness policy

*professional · infra · effort M · impact 4 · confidence 5*

- What: Add explicit cache TTLs tied to producer cadence. Document and test each endpoint's polling, browser TTL, edge TTL, degraded age, and stale age separately.
- Visitor benefit: New publications reach visitors predictably, and 'current' has an understandable age limit.
- Data/DOM: Existing age evidence and statuses remain authoritative. DECISION-NEEDED: choose whether the current 2-hour fleet and 12-day PSI fallback stale thresholds remain appropriate.
- Where: shared/lib/pharosville-endpoint-registry.ts:17; shared/lib/api-freshness.ts:119; functions/api/[[path]].ts:281; functions/_shared.ts:94.
- Perf: Zero GPU cost. Removing a 24-hour PSI fallback TTL can expose updates up to 48× sooner; request volume rises on that conditional path.
- Risks: Do not silently reinterpret upstream metadata or increase upstream requests without bounded edge reuse.
- Depends on: —

### S15-I5 Enforce stale and unavailable visual meanings

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Keep fog exclusive to dated stale fleet data. Gate stale side-feed targets into their declared neutral states while retaining exact last-known readings in panels.
- Visitor benefit: Old or missing evidence cannot look like a healthy live market.
- Data/DOM: Use model.truth per endpoint. Fog iff stablecoins is stale; initial failure says 'Fleet readings unavailable'. Side panels say 'Last known reading' with age. Test independent source failures.
- Where: src/harbour/readings/bind.ts:182; src/harbour/model/readings.ts:19; src/harbour/readings/bind.test.ts:102.
- Perf: Zero additional draws; potentially fewer active analytical effects during outages.
- Risks: Coordinate neutral sea/weather behavior with their owners so neutral never becomes an implicit CALM claim.
- Depends on: S15-I2

### S15-I6 Use classified retries with bounded jitter

*professional · infra · effort S · impact 3 · confidence 5*

- What: Retain HTTP status and Retry-After in feed errors. Apply bounded jitter to transient retries, honor 429/503 retry guidance, and slow persistent configuration or contract failures.
- Visitor benefit: Recovery is steadier during outages and avoids synchronized retry bursts.
- Data/DOM: n/a; transport state does not change analytical values. Preserve original last-good timestamps.
- Where: src/harbour/data/fetch.ts:66; src/harbour/data/fetch.ts:159; src/lib/api.ts:35; functions/api/[[path]].ts:40.
- Perf: Negligible CPU; can avoid repeated 30-second retries when upstream explicitly requests a longer wait.
- Risks: Bound retry delays, support both Retry-After forms, and inject randomness/time for deterministic tests.
- Depends on: —

### S15-I7 Refresh overdue sources on return

*professional · ux · effort S · impact 4 · confidence 5*

- What: Track due times, refresh overdue sources on visibility return or online events, and pause routine attempts while offline. Deduplicate in-flight refreshes and remove listeners on stop.
- Visitor benefit: Returning visitors avoid the current possible minute-long wait before refreshing.
- Data/DOM: Offline is a transport label, never an immediate stale classification. Last-good data continues aging normally.
- Where: src/harbour/data/fetch.ts:138; src/harbour/data/fetch.ts:174; src/harbour/engine/engine.ts:84.
- Perf: A few event listeners; eliminates hidden-page minute wakeups if scheduling becomes event-driven.
- Risks: navigator.onLine is advisory; failed requests still need normal handling. Avoid seven unnecessary requests on every focus.
- Depends on: S15-I6

### S15-I8 Revalidate existing edge snapshots without blocking

*professional · infra · effort M · impact 4 · confidence 4*

- What: Add a bounded application-level revalidation window: serve an eligible stored projected response immediately and refresh through waitUntil. Keep explicit stored-age accounting and a hard maximum; coalesce concurrent refreshes within an isolate.
- Visitor benefit: First fleet dependencies and outage recovery avoid waiting for upstream before usable dated data arrives.
- Data/DOM: Reuse existing endpoints and metadata. Stale snapshots remain marked stale; no fabricated current fleet or market events. Headers alone do not implement this Cache API behavior.
- Where: functions/api/[[path]].ts:246; functions/api/[[path]].ts:259; functions/_shared.ts:186; src/harbour/sim/system.ts:160.
- Perf: Removes approximately one upstream round trip on eligible misses; avoids up to the existing 8-second timeout before fallback. No extra browser requests.
- Risks: Only helps warm locations; isolate coalescing is not global. Bound stale serving and test background refresh failures.
- Depends on: S15-I2, S15-I4, S15-I5

### S15-I9 Conditionally revalidate upstream representations

*professional · infra · effort M · impact 3 · confidence 3*

- What: Store the upstream validator separately from the projected ETag. Revalidate retained upstream representations conditionally and reuse projected bytes on 304 while correctly merging freshness headers.
- Visitor benefit: Unchanged datasets cost less upstream bandwidth and projection work.
- Data/DOM: n/a; preserve browser projected-byte validators and all freshness evidence.
- Where: functions/api/[[path]].ts:115; functions/api/[[path]].ts:176; functions/api/[[path]].ts:260.
- Perf: Potentially eliminates most upstream response-body bytes and JSON projection on unchanged revalidations; benefit depends on upstream validator support.
- Risks: Never send a projected validator upstream. Handle 304 only when the matching retained body exists.
- Depends on: S15-I4

### S15-I10 Share feed results across admitted tabs

*professional · infra · effort M · impact 2 · confidence 3*

- What: If telemetry shows meaningful duplicate use, coordinate one visible polling owner with Web Locks and BroadcastChannel, broadcasting snapshots with their original source and receipt timestamps.
- Visitor benefit: Multiple harbour windows share network and parsing work.
- Data/DOM: n/a; initialize coordination only after viewport admission. Received snapshots must retain real ages.
- Where: src/harbour/data/fetch.ts:102; src/harbour/sim/system.ts:115; src/main.tsx.
- Perf: For N active tabs, polling requests can approach 1/N of today's count; structured-clone costs depend on payload size.
- Risks: Low priority without evidence of multi-tab usage. Handle owner closure, unsupported APIs, and background ownership without split-brain polling.
- Depends on: S15-I7, S15-I12

### S15-I11 Make the Keeper’s Log explain feed health

*informative · ux · effort M · impact 4 · confidence 5*

- What: Extend the existing log with advancing source age, last successful receipt, next retry, and a concise failure category. Distinguish degraded transport evidence from fresh readings.
- Visitor benefit: Visitors can verify why a reading is delayed without interpreting fog or raw errors.
- Data/DOM: Use EndpointSnapshot.error, source age, receipt time, and retry state. Show 'Offline', 'Rate limited', 'Refresh failed', or 'Source age unavailable'; retain last-known values.
- Where: src/harbour/ui/Panel.tsx:849; src/harbour/ui/bits.tsx:162; src/harbour/model/types.ts:55; src/harbour/model/truth.ts:19.
- Perf: One low-frequency timer while details are visible; no fleet rebuild or GPU cost.
- Risks: Keep details on demand and avoid announcing every age tick to assistive technology.
- Depends on: S15-I2, S15-I6

### S15-I12 Measure feed bytes and cache effectiveness

*professional · infra · effort S · impact 3 · confidence 5*

- What: Add sampled endpoint timing, projected-byte counts, cache outcomes, fallback use, and conditional-hit counters. Add fixture-based projection byte budgets alongside consumer integration checks.
- Visitor benefit: Optimization targets actual first-fleet delays and payload regressions.
- Data/DOM: n/a; log endpoint identifiers and timings only, never keys or response bodies.
- Where: functions/api/[[path]].ts:205; functions/api/[[path]].ts:252; functions/api/proxy.test.ts:114; src/harbour/data/fetch.ts:153.
- Perf: Small sampled logging overhead; byte budgets run outside rendering. Establish measurements before claiming KB or latency savings.
- Risks: Separate projection size from compressed wire bytes and browser cache reuse from upstream cache hits.
- Depends on: —

## Top picks

1. S15-I1 — Small contract repair restores three existing analytical safeguards without new visual machinery.
2. S15-I3 — A small validation and cleanup change prevents malformed enrichment from permanently disabling updates.
3. S15-I2 — Closes a direct truth-contract violation at the shared freshness boundary.
4. S15-I5 — Makes stale, unavailable, and current evidence visually consistent with the brief.
5. S15-I8 — Uses existing edge snapshots to remove upstream waiting from eligible first-fleet requests.

## Operator decisions

- DECISION-NEEDED: Keep the current age-only stale thresholds, including fleet at 2 hours and PSI at 12 days, or choose tighter per-source thresholds?
- DECISION-NEEDED: What maximum age may an edge snapshot have for immediate first-fleet delivery while background revalidation runs?

## Cross-lane hooks

- S01: coordinate projection restoration, stale neutral states, and matching DOM explanations; extend the source-field map to include event consumers.
- S25: run event scenarios through the actual projector, including valuation completeness and methodology re-baselining.
- Startup/performance lanes: measure stablecoins and peg-summary completion separately; both gate first fleet at src/harbour/sim/system.ts:160.
- Skipped browsers, live upstream requests, full test suites, and edits; verification used source tracing and read-only in-memory assertions.
- Risk: live cache headers, compressed payload sizes, upstream validator support, and latency gains remain unmeasured.
