# S19

## Executive summary

Security boundaries are strong: exact API allowlisting, server-only credentials, bounded error ingestion, and restrictive headers. The biggest gaps are operational visibility and error delivery. Retry timing can discard clustered failures; diagnostic text is insufficiently scrubbed; optional GA has no consent gate. Production code measures rendering locally but exports no performance cohorts or startup denominators. Prioritize independent uptime checks, reliable private diagnostics, and clearer degraded-service copy, then introduce sampled RUM using existing engine hooks. Static header validation passed; focused checks confirmed retry-window and CSP-validator gaps.

## Current state

- The proxy accepts exact allowlisted GET paths, pins the upstream origin, injects the secret server-side, and refuses redirects. Strong boundary: functions/api/[[path]].ts:57, functions/api/[[path]].ts:80, functions/api/[[path]].ts:176, functions/api/[[path]].ts:221.
- Client errors are categorized, deduplicated, capped at five per page lifetime, and retained as ten localStorage entries. The 'session' counter resets on reload: src/error-reporter.ts:1, src/error-reporter.ts:23, src/error-reporter.ts:42, src/error-reporter.ts:98.
- Error ingestion requires matching Origin, bounded JSON, and IP-derived throttling. URL fields lose query and fragment server-side; accepted records additionally contain country, ray, and truncated User-Agent: functions/_log.ts:64, functions/_log.ts:110, functions/_log.ts:139, functions/_log.ts:191, functions/_log.ts:252.
- Durable error storage is optional CLIENT_ERROR_KV with 30-day expiry; missing bindings and failed writes still permit 204 responses. Deployment binding status is unverified: functions/_log.ts:39, functions/_log.ts:176, functions/_log.ts:270.
- Optional GA installs after welcome paint or world reveal, then issues only initialization/configuration calls. Actual activation and vendor-side device reports cannot be established from source: src/google-analytics.ts:11, src/google-analytics.ts:28, src/main.tsx:24, src/harbour/app/harbour-app.tsx:79.
- Local engine diagnostics expose quality, DPR, GPU samples, boot timings, and first-fleet marks. Repository search found no production RUM exporter or custom GA performance events: src/harbour/engine/engine.ts:147, src/harbour/engine/engine.ts:372, src/harbour/engine/engine.ts:381.
- Freshness UI already exists: a corner dot/status, accessible button label, and per-endpoint Keeper’s Log. Extend these surfaces: src/harbour/ui/CornerMark.tsx:49, src/harbour/ui/bits.tsx:7, src/harbour/ui/Panel.tsx:849.
- Static CSP excludes JavaScript unsafe-eval and unsafe-inline; blob images and wasm-unsafe-eval support existing loaders. Google and Cloudflare script hosts remain permitted: public/_headers:10; docs/pharosville/SECURITY_HEADERS.md:28.
- Daily canary checks headers, confirms strict-freshness failure after five minutes, and probes error ingestion. Independent monitoring remains an operator setup item in repository documentation: .github/workflows/canary-smoke.yml:10, .github/workflows/canary-smoke.yml:26, ROADMAP.md:11.
- Read-only validation: onboarding ran, static header policy passed, and direct validator/source assertions confirmed two gaps. No browsers or live requests were used; git status remained unchanged apart from the pre-existing research folder.

## Findings

### S19-F1 [medium] Error retries expire inside the server throttle window

- Evidence: src/error-reporter.ts:6, src/error-reporter.ts:77, src/error-reporter.ts:107; functions/_log.ts:25, functions/_log.ts:120.
- Detail: After an accepted report, another distinct failure within ten seconds can receive 429. Its immediate, one-second, and four-second retries allow only five seconds of backoff, so a fast sequence can exhaust every attempt before the throttle expires. Reports send independently, while budget and deduplication are consumed before delivery. Clustered incident evidence is therefore preferentially lost.
- Fix: Serialize the existing bounded report queue, space successful deliveries beyond the throttle window, and handle 429 explicitly. Return Retry-After server-side. Test two distinct failures against a ten-second limiter.

### S19-F2 [medium] Diagnostic privacy filtering happens too late and misses free text

- Evidence: src/error-reporter.ts:42, src/error-reporter.ts:169, src/error-reporter.ts:174, src/error-reporter.ts:179; functions/_log.ts:139, functions/_log.ts:153, functions/_log.ts:265.
- Detail: The browser stores full location.href locally before server projection, without a time-based expiry. Server projection removes queries only from url and filename; message, reason, and stack retain arbitrary text, including embedded URLs or sensitive values. Raw User-Agent is also stored. This does not establish an existing secret leak, but the pipeline cannot promise PII-free diagnostics.
- Fix: Scrub before local persistence and transmission, enforce equivalent server rules, expire local history, and replace raw User-Agent with coarse categories. Drop malformed URL values rather than retaining their original text.

### S19-F3 [medium] Configuring GA bypasses any application privacy choice

- Evidence: src/google-analytics.ts:13, src/google-analytics.ts:18, src/google-analytics.ts:28; src/main.tsx:24; src/harbour/app/harbour-app.tsx:81.
- Detail: VITE_GA_ID is the sole activation gate. Once configured, the loader runs and default configuration is queued after paint/reveal, including on denied viewports. Repository search found no consent default/update, withdrawal flow, GPC/DNT handling, or explicit page-location sanitization. This is a conditional configuration risk; production activation is unknown.
- Fix: Choose a documented analytics policy. Prefer removing dormant GA if first-party aggregates meet the need; otherwise gate loading on an explicit preference and configure sanitized, minimal collection.

### S19-F4 [medium] Smoothness has local diagnostics but no visitor population evidence

- Evidence: src/harbour/engine/engine.ts:372, src/harbour/engine/engine.ts:381; src/harbour/engine/governor.ts:76, src/harbour/engine/governor.ts:116; src/google-analytics.ts:28.
- Detail: Quality, GPU timing, and first-fleet measurements stay in browser globals or performance marks. No source-defined export measures frame pacing, tier residence, startup failures, or coarse device cohorts. Consequently, production cannot quantify how many supported visitors reach a smooth harbour, or distinguish successful visitors from those who never start.
- Fix: Add sampled, bounded first-party RUM with attempted-start denominators, terminal startup outcomes, foreground pacing buckets, and coarse capability cohorts. Preserve manual real-GPU release gates.

### S19-F5 [medium] Handled runtime failures escape the client-error pipeline

- Evidence: src/harbour/data/fetch.ts:159; src/harbour/sim/system.ts:146; src/harbour/engine/prepare.ts:258; src/harbour/engine/governor.ts:148; src/error-reporter.ts:166.
- Detail: Feed failures become snapshots, worker failures become console warnings, shader preparation timeouts warn and continue, and quality preparation failures are caught and logged. These paths do not reach window error/rejection listeners. Repository search also found no application context-loss/restoration listeners or shader-error callback. Generic boot reporting therefore misses important degraded experiences.
- Fix: Emit bounded structured outcome codes at these existing failure boundaries. Count context loss, restoration, preparation timeout, shader-link failure, and worker unavailability without intercepting all console output.

### S19-F6 [medium] The planned uptime probe can mistake stale fallback for upstream health

- Evidence: docs/pharosville/OPERATIONS.md:178, docs/pharosville/OPERATIONS.md:213; functions/api/[[path]].ts:138, functions/api/[[path]].ts:261; functions/_shared.ts:118.
- Detail: The proposed API monitor accepts 200 plus a chains keyword. During upstream failure, the proxy deliberately returns last-good JSON as 200 with Warning: 110 for up to 24 hours. That probe can correctly show relay availability while missing upstream degradation. ROADMAP.md:11 additionally records external setup as pending; dashboard state was not inspected.
- Fix: Keep separate availability and freshness/degradation signals. Inspect Warning, X-Data-Age/Age, and publication metadata rather than treating the keyword response as proof of current upstream health.

### S19-F7 [medium] The error canary verifies acceptance, not durable retention

- Evidence: functions/_log.ts:178, functions/_log.ts:183, functions/_log.ts:270; .github/workflows/canary-smoke.yml:92; docs/pharosville/OPERATIONS.md:303.
- Detail: The endpoint returns 204 when KV is absent and also when its asynchronous write fails. The canary checks only response status and no-store, so it remains green if every report disappears after live tailing ends. The runbook acknowledges this degradation, but there is no automated persistence verification.
- Fix: Add an operator-authenticated CI readback of the synthetic KV record, with bounded eventual-consistency retries. Surface storage failures through an independent aggregate or alert.

### S19-F8 [medium] Known refresh degradation can still read as live

- Evidence: src/harbour/data/fetch.ts:89, src/harbour/data/fetch.ts:164; src/harbour/model/truth.ts:12; src/harbour/ui/bits.tsx:10; src/harbour/ui/CornerMark.tsx:61.
- Detail: Failed refreshes preserve an error alongside usable data, but endpointTruth ignores that error. A degraded serverStatus is retained without making the endpoint stale, and corner status checks only freshness states. Thus a failed refresh or recently saved fallback can still produce 'live' until age thresholds expire. Freshness and transport health need distinct wording.
- Fix: Expose service health separately from analytical freshness and extend the existing corner status and Keeper’s Log. Do not trigger stale fog merely because a refresh failed.

### S19-F9 [low] The CSP gate permits dangerous future relaxations

- Evidence: scripts/pharosville/check-security-headers.mjs:91, scripts/pharosville/check-security-headers.mjs:109; public/_headers:10.
- Detail: The current policy is restrictive, but validation checks required sources and rejects wildcards only. A direct invocation confirmed that adding unsafe-inline, unsafe-eval, and an arbitrary exact script host still returns no findings. The gate therefore cannot enforce the documented strict baseline against these regressions.
- Fix: Reject unsafe-inline and JavaScript unsafe-eval explicitly, and validate external origins against the approved policy. Preserve required wasm-unsafe-eval and blob image support.

### S19-F10 [low] Proxy outage logs omit handled HTTP failures and stale-serving outcomes

- Evidence: functions/api/[[path]].ts:205, functions/api/[[path]].ts:261, functions/api/[[path]].ts:271; docs/pharosville/OPERATIONS.md:141.
- Detail: Structured upstream failure logging runs for fetch errors and timeouts. An upstream HTTP 5xx follows another branch and may become a stale 200 without an equivalent event. Successful requests and cache outcomes also lack source-defined counters, so the runbook’s failure-ratio thresholds cannot be calculated from these application logs alone.
- Fix: Record bounded endpoint/status/cache-outcome counters and upstream latency, including stale responses and HTTP 5xx. Keep upstream health separate from the final visitor response status.

## Ideas

### S19-I1 Activate independent uptime and degraded-data monitoring

*professional · infra · effort S · impact 5 · confidence 5*

- What: Implement the existing external-monitor runbook: five-minute root and chains probes, three failures before alerting, and two recoveries before resolving. Add a separate response-header/publication-age check so saved 200 responses indicate degraded data. Exercise the alert channel once.
- Visitor benefit: Outages and stale service are detected between deploys, including when GitHub Actions is unavailable.
- Data/DOM: Availability: HTTP/content checks. Degradation: Warning 110, metadata status, and publication age against existing endpoint cadence. Public status, if exposed, distinguishes 'Unavailable' from 'Readings delayed'.
- Where: ROADMAP.md:11; docs/pharosville/OPERATIONS.md:167; functions/api/[[path]].ts:145; scripts/smoke-live.mjs:252.
- Perf: No client cost; roughly 576 baseline probes/day across two targets, before retries or additional regions.
- Risks: DECISION-NEEDED: provider, alert owner, and channel. Cached probes establish visitor-facing service, not continuous direct upstream reachability.
- Depends on: —

### S19-I2 Make the existing error channel deliver bounded bursts

*professional · infra · effort S · impact 4 · confidence 5*

- What: Use one five-entry memory queue with serialized sends and server-directed 429 retry timing. Bound the UTF-8 request below 4 KiB before sending; stop retrying permanent 4xx responses. Preserve deduplication and add one fake-clock delivery test spanning the ten-second window.
- Visitor benefit: Failures receive actionable diagnosis without retry storms or extra visitor work.
- Data/DOM: n/a; diagnostic transport only. Retain the existing report budget and failure categories.
- Where: src/error-reporter.ts:77; src/error-reporter.ts:98; functions/_log.ts:224; src/error-reporter.test.ts:53.
- Perf: Zero rendering cost; bounded memory, at most five accepted reports, fewer redundant requests.
- Risks: Page exit can still prevent delivery. Keep unload behavior best-effort and do not weaken server limits to improve apparent success.
- Depends on: —

### S19-I3 Minimize diagnostic data before it leaves memory

*professional · infra · effort M · impact 4 · confidence 5*

- What: Project diagnostic fields before local storage and transport; remove URL queries/fragments from embedded stack URLs, redact sensitive patterns, and cap bytes. Store only coarse browser family when needed, expire local history, and add adversarial redaction fixtures. Apply equivalent server checks.
- Visitor benefit: Troubleshooting retains useful failure context while reducing accidental disclosure.
- Data/DOM: No search terms, selections, referrers, persistent identifiers, raw GPU names, or raw User-Agent. Prefer known error codes over arbitrary messages.
- Where: src/error-reporter.ts:32; src/error-reporter.ts:42; functions/_log.ts:139; functions/_log.ts:153; functions/_log.ts:252.
- Perf: String processing only on rare reports; no frame-path work or added network calls.
- Risks: Redaction is not a guarantee for arbitrary free text. Preserve diagnostic usefulness with controlled codes and release identifiers.
- Depends on: —

### S19-I4 Extend the existing status with honest service-health copy

*professional · data-bound · effort M · impact 4 · confidence 5*

- What: Add a small service-health summary beside existing freshness. Show 'Refresh delayed — showing saved readings' after two consecutive failed refreshes, or immediately for explicit degraded server responses. Expand details through the Keeper’s Log and announce transitions politely once. Test failure, recovery, and fresh-but-degraded cases.
- Visitor benefit: Visitors understand why readings are held without interpreting market conditions as an infrastructure problem.
- Data/DOM: Source: per-endpoint failure streak, snapshot.error, and truth.serverStatus. Threshold: two failed refreshes or explicit degraded/stale response. DOM uses the same service-health wording; analytical freshness and stale fog remain governed by existing truth.
- Where: src/harbour/data/fetch.ts:159; src/harbour/model/truth.ts:12; src/harbour/ui/CornerMark.tsx:59; src/harbour/ui/Panel.tsx:849.
- Perf: Zero draws; React updates on health transitions and existing freshness cadence.
- Risks: Avoid a permanent numeral bar or repeated announcements. Distinguish unavailable enrichment from unavailable fleet data.
- Depends on: —

### S19-I5 DECISION-NEEDED: add a sampled first-party RUM sink

*professional · infra · effort M · impact 5 · confidence 4*

- What: Sample 5% of page visits once in memory before admission. Send at most three sub-1-KiB records through same-origin POST /api/rum using keepalive fetch with credentials omitted. Validate bounded enums, Origin, body size, and abuse limits. Candidate destination: a dedicated ingestion Worker backed by Analytics Engine; confirm binding support during implementation.
- Visitor benefit: Real experience guides improvements without tracking individual visitors.
- Data/DOM: No visitor IDs, cookies, URLs, referrers, selections, raw UA, raw GPU string, or stored IP. Publish collection purpose and retention; honor the chosen privacy preference. Sampling and schema versions accompany aggregate events.
- Where: src/main.tsx:27; src/error-reporter.ts:77; functions/_log.ts:191; proposed functions/api/rum.ts and ingestion Worker; wrangler.toml:1.
- Perf: Target under 3 KiB client gzip; at most 3 KiB payload per sampled visit; no additional GPU queries.
- Risks: New telemetry route, storage, and operator cost require approval. Do not extend the upstream GET proxy allowlist or send PHAROS_API_KEY to ingestion.
- Depends on: S19-I3, S19-I9

### S19-I6 Measure foreground pacing and quality by coarse cohort

*all-devices · infra · effort M · impact 5 · confidence 4*

- What: During a bounded 30-second visible window, accumulate raw rAF-interval buckets and tier/DPR residence using existing frame and governor hooks. Report FPS buckets below 20, 20–29, 30–49, and 50+, plus long-frame shares. Classify the already-read renderer locally into broad integrated/mobile/discrete/software/unknown groups; discard its raw value.
- Visitor benefit: Performance work targets the supported devices that actually struggle.
- Data/DOM: Include broad viewport profile, coarse pointer, reduced-motion state, timer availability, and automatic/pinned quality. Never infer missing GPU time. Suppress small dashboard cohorts and keep browser families broad.
- Where: src/harbour/engine/engine.ts:259; src/harbour/engine/governor.ts:76; src/harbour/engine/governor.ts:116; src/harbour/engine/quality.ts:71.
- Perf: Zero draws or new timers; target below 0.02 ms/frame in sampled visits, to be measured on gate hardware.
- Risks: Use unclamped rAF intervals, exclude hidden/resume gaps, and separate reduced motion and pinned settings. FPS is refresh-rate dependent and does not replace real-GPU gates.
- Depends on: S19-I5

### S19-I7 Count startup outcomes before successful visitors disappear from view

*professional · infra · effort M · impact 5 · confidence 5*

- What: Emit sampled admission/start counts before lazy imports, then a bounded terminal outcome: denied, import failed, renderer unavailable, data unavailable, empty-valid, partial, or complete fleet. Measure navigation-to-complete-fleet and engine-to-complete-fleet separately using the reveal predicate. Include startup abandonments without inventing a fleet time.
- Visitor benefit: Broken or slow first visits become visible instead of being excluded from success-only timing.
- Data/DOM: WebGL2-unavailability denominator is admitted renderer attempts, not all visits. Record a specific renderer-creation failure code; generic boot errors are not automatically WebGL2 failures. Valid empty fleets remain successes with a separate outcome.
- Where: src/main.tsx:27; src/main.tsx:48; src/harbour/app/harbour-app.tsx:84; src/harbour/app/harbour-app.tsx:124; src/harbour/engine/engine.ts:373.
- Perf: Two tiny records within the shared sampled budget; no speculative context creation or world fetch on denied screens.
- Risks: Existing firstFleetFrameMs means first nonzero boat submission, not necessarily complete readiness. Reuse the stricter reveal predicate and test remounts, cancellation, and zero boats.
- Depends on: S19-I5

### S19-I8 Observe graphics failures without scraping console output

*professional · infra · effort M · impact 4 · confidence 4*

- What: Attach lifecycle-cleaned canvas context-loss/restoration listeners and a renderer shader-error hook. Emit controlled counters for link failure, preparation timeout, quality-preparation failure, and initial worker failure. Keep intentional aborts and disposal out of failure counts; test each boundary with existing engine/preparation harnesses.
- Visitor benefit: Invisible broken scenes and interrupted sessions can be diagnosed by release and capability cohort.
- Data/DOM: Only failure codes, counts, broad capability groups, release, and coarse recovery-duration buckets. No shader source, driver logs, raw GPU names, or user interaction content.
- Where: src/harbour/engine/engine.ts:88; src/harbour/engine/prepare.ts:258; src/harbour/engine/governor.ts:148; src/harbour/sim/system.ts:146.
- Perf: Zero steady-state rendering work; event listeners and capped failure counters only.
- Risks: Preserve Three.js context handling and existing shader diagnostics. A preparation timeout is distinct from a shader-link failure and must remain separately labeled.
- Depends on: S19-I5

### S19-I9 DECISION-NEEDED: choose one explicit analytics privacy policy

*professional · ux · effort S · impact 4 · confidence 5*

- What: Prefer removing unused GA and its CSP hosts if first-party aggregates meet product needs. If retained, gate script insertion on a reversible visitor preference and configure minimal sanitized collection. Document operational diagnostics separately from optional audience analytics, with tests for disabled collection and withdrawal.
- Visitor benefit: Collection behavior becomes predictable, understandable, and controllable.
- Data/DOM: Expose a concise privacy explanation and analytics preference in existing welcome/ledger surfaces. No analytics request before the applicable choice; do not add a large dashboard-style banner by default.
- Where: src/google-analytics.ts:11; src/main.tsx:24; src/harbour/app/harbour-app.tsx:81; public/_headers:10; docs/pharosville/SECURITY_HEADERS.md:36.
- Perf: Removing GA saves its optional third-party requests; retaining preferences adds negligible event-driven UI work.
- Risks: Production GA and dashboard-injected Cloudflare analytics are unverified. Inventory actual configuration before deleting sources or claiming collection is disabled.
- Depends on: —

### S19-I10 Add a canonical-host release health receipt

*professional · infra · effort S · impact 4 · confidence 5*

- What: After existing artifact verification, smoke the canonical host and record release SHA, registry generation, header results, endpoint availability, and freshness warnings in the workflow summary. Compare the served release identity with the intended build. Keep upstream enrichment warnings distinct from deployment failures and preserve release.yml publication ownership.
- Visitor benefit: A green release more closely represents the URL visitors actually use.
- Data/DOM: Public build identity only; no new health API or credentials in output. RUM can later compare startup/pacing cohorts across releases once sample sizes support it.
- Where: .github/workflows/deploy-cloudflare.yml:93; .github/workflows/deploy-cloudflare.yml:107; .github/workflows/release.yml:37; scripts/smoke-live.mjs:347.
- Perf: No rendering cost; one additional smoke pass and a few build-identity bytes.
- Risks: Canonical asset delivery is already checked; extend its receipt rather than duplicating that work. Avoid automatic rollback based solely on an upstream outage or sparse RUM.
- Depends on: —

### S19-I11 Prove that accepted diagnostic reports survive

*professional · infra · effort S · impact 4 · confidence 5*

- What: Verify the optional KV binding operationally, then add authenticated synthetic-record readback to the canary with bounded retries. Emit a controlled storage-failure signal instead of silently swallowing every KV error. Keep ingestion responses best-effort so telemetry failure cannot break the harbour.
- Visitor benefit: An incident leaves evidence the operator can inspect after it happens.
- Data/DOM: Retain the existing 30-day diagnostic TTL and separate synthetic token. Use CI-side access; do not add a public error-reading endpoint.
- Where: functions/_log.ts:176; .github/workflows/canary-smoke.yml:46; docs/pharosville/OPERATIONS.md:301.
- Perf: One daily synthetic write plus bounded readback; no additional client traffic.
- Risks: DECISION-NEEDED: binding ownership and least-privilege CI access. Eventual consistency and quota exhaustion must produce distinct operational results.
- Depends on: S19-I3

### S19-I12 Make proxy health thresholds computable

*professional · infra · effort M · impact 4 · confidence 4*

- What: Emit low-cardinality endpoint counters for normal-cache hit, upstream success, HTTP failure, timeout, and stale fallback, with latency buckets. Aggregate in the chosen server-side sink and implement the runbook’s sustained-failure alerts. Count availability and degraded-data service separately.
- Visitor benefit: The operator can distinguish a broken deployment, expired key, slow upstream, and successful stale-data protection.
- Data/DOM: Allowlisted endpoint key, outcome enum, status class, duration bucket, and release only. No request query, secret, raw IP, User-Agent, or ray identifier required.
- Where: functions/api/[[path]].ts:205; functions/api/[[path]].ts:248; functions/api/[[path]].ts:260; docs/pharosville/OPERATIONS.md:141.
- Perf: No browser cost; bounded asynchronous telemetry per miss/failure and sampled normal hits.
- Risks: High-volume cache hits need sampling. Do not report a stale 200 as healthy upstream service or block responses on telemetry storage.
- Depends on: S19-I5

### S19-I13 Make the header gate enforce the approved CSP

*professional · infra · effort S · impact 3 · confidence 5*

- What: Extend validateCsp to reject JavaScript unsafe-eval, unsafe-inline, and unapproved external hosts. Add small fixtures for each rejected relaxation and required WASM/blob exceptions. Extend header checks to a recognized selection URL so the HTMLRewriter route is covered automatically.
- Visitor benefit: Future changes are less likely to weaken security or break the shared-link shell silently.
- Data/DOM: n/a; build and deployment validation only. Keep current rendering-required sources.
- Where: scripts/pharosville/check-security-headers.mjs:7; scripts/pharosville/check-security-headers.mjs:91; functions/index.ts:219; public/_headers:10.
- Perf: No client cost; a few validator fixtures and one extra header request.
- Risks: Synchronize documented policy and validator. Do not remove wasm-unsafe-eval, blob images, or a verified active analytics source indiscriminately.
- Depends on: —

## Top picks

1. S19-I1 — Highest operational value per day: closes the documented independent-alerting gap and distinguishes saved data from upstream health.
2. S19-I2 — Small, deterministic repair to the existing diagnostic channel; clustered failures are precisely when reliable delivery matters.
3. S19-I3 — Closes concrete privacy exposure paths before expanding collection.
4. S19-I4 — Direct visitor benefit using existing status surfaces and failure evidence, with no GPU cost.
5. S19-I5 — Foundation for measurable startup and smoothness claims; implement with S19-I6 and S19-I7 as the first useful RUM slice.

## Operator decisions

- Which independent monitor, alert owner, and non-email recovery channel should activate the pending ROADMAP.md:11 item?
- May PharosVille add a dedicated same-origin telemetry POST route and ingestion Worker while preserving the upstream proxy’s GET-only allowlist?
- Approve a starting 5% in-memory sampling rate, coarse cohort dimensions, retention period, and minimum dashboard cohort size?
- Should dormant GA be removed, or retained behind an explicit reversible preference? Is any analytics currently injected through Cloudflare dashboard configuration?
- Is CLIENT_ERROR_KV bound in production, and may the canary receive narrowly scoped access to verify synthetic report persistence?

## Cross-lane hooks

- Performance lane: use existing governor/frame hooks for foreground histograms; preserve manual Apple Silicon and real-GPU acceptance. Local GPU p10 is not visitor frame-pacing p95.
- Arrival lane: share the complete-readiness reveal predicate, valid-zero outcome, cancellation rules, and navigation timing boundary with S19-I7.
- Data/UI lane: expose transport health separately from analytical freshness; extend CornerMark and Keeper’s Log with matching copy and transition tests.
- Release lane: attach canonical-host evidence to the existing deploy workflow and preserve release.yml as the sole semantic-release publisher.
- Not checked: browsers, live responses, provider dashboards, production bindings, consent behavior, or real-device performance. No repository files were changed.
- Risk: this report establishes source behavior, not deployed configuration; telemetry provider support and actual collection settings require verification before implementation.
