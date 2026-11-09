# PharosVille Operations

Last updated: 2026-11-09

This runbook covers the standalone Cloudflare Pages app at
`https://pharosville.pharos.watch/`.

## Service boundary

- Pages project: `pharosville`; production branch: `main`; build output: `dist`.
- `wrangler.toml` sets the public `PHAROS_API_BASE`.
- `functions/api/[[path]].ts` proxies allowlisted reads and holds the
  server-side `PHAROS_API_KEY` binding.
- `functions/index.ts` serves `/` and rewrites the social-card text tags for a
  recognised `?sel=`; it takes no binding and makes no upstream call. When the
  visitor's own hour (`request.cf.timezone`, or a pinned `?t=`) is night it names
  the night key art instead (E28, `functions/_poster.ts`), under its own ETag.
- `public/_headers` governs static responses; the Function owns API headers.

Initial Pages setup:

```bash
npx wrangler pages project create pharosville --production-branch main
npx wrangler pages secret put PHAROS_API_KEY --project-name pharosville
```

Never put the key in `VITE_*`, browser code, URLs, logs, docs, fixtures, or
committed environment files.

## Local work

```bash
npm ci
npm run setup:local-api-key
npm run onboard:agent
npm run dev
npm run smoke:api-local
npm run smoke:dev-proxy
```

Vite is the fast UI lane. Its `/api/*` proxy can resolve the ignored local key
from the process environment, current or main-worktree `.env.local`, or the
shared `.git/pharosville.env.local` file. For local Functions behavior:

```bash
npm run build
npx wrangler pages dev dist
```

Keep Wrangler bindings in ignored local files. Do not debug missing ships until
the local API and proxy smokes pass.

## Deploy and recovery

Normal production changes deploy from protected `main`. A direct deploy is
only for explicitly authorized operational recovery; it is not a versioned
release and must never be paired with a manually created tag or GitHub Release.

```bash
git status --short
npm run build
npx wrangler pages deploy dist --project-name pharosville
npm run smoke:live -- --url https://pharosville.pharos.watch
```

For the Ultimate pass, fix forward through the protected release path (EXECUTION.md §6);
do not roll back. Retained-artifact recovery mechanics below document the asset contract for
an explicitly authorized future recovery. Preview deployments are not production recovery targets.

### Immutable media and the two-release window

The Vite asset/preload plugin runs `scripts/harbour/build-asset-registry.mjs` during every production
build. One generated `/asset-registry.json` supplies HTML hints, rewritten static media references,
runtime loaders and manifest transport references. Objects live under
`/harbour/_immutable/<24-character SHA-256 prefix>/...`; the registry records their full SHA-256 and
stored byte size. Fonts, arrival CSS and posters use this namespace too. Stable HTML and the registry
revalidate; only content-addressed objects receive one-year immutable caching.

The deploy job runs `node scripts/harbour/retain-assets.mjs dist https://pharosville.pharos.watch`
immediately before Pages upload. It downloads the live registry without cache, copies **that release's
own** hashed files into the new artifact, verifies each stored-body hash and size, and records the
previous release in the new registry. It does not traverse `previous.previous`: production retains the
current and immediately preceding release, not an ever-growing history. A missing registry/HTML fallback
is accepted only for the initial migration; malformed registries, missing objects and hash mismatches fail
the deployment. Redeploying the live asset generation (a fresh build of release B over live B, e.g. a
code-only change) copies live B's own retained previous generation instead, so A tabs keep their A-only
lazy assets; the fixture in `node scripts/harbour/verify-asset-registry.mjs dist` exercises A→B→B. The
registry's `files` always describes
only its own release, never the retained union.

Production `.glb.br`, `.pack.br` and `.bin.br` objects carry real `Content-Encoding: br` and the appropriate
GLB/octet-stream MIME in `_headers`. The browser HTTP stack decompresses them; there is **no JavaScript
Brotli inflater** and no dependency on `DecompressionStream("br")`. Retention uses raw HTTP downloads to
preserve compressed bytes across encoder upgrades. Development still uses the existing gzip+JS-inflate
GLB siblings and exact WebP sea source. Packs contain the original 49 eager kit and 17 initial civic GLBs;
hull-stages and cove pieces remain independent. No model quantization or texture pixel changes occur.

For an asset-changing rollback that must preserve both supported releases, rebuild the target release
artifact, run the same retention command against the currently live release, and publish that artifact
through the authorized production recovery path. A dashboard rollback selects an **immutable older
deployment**: it cannot add newer-release objects to it and therefore does not preserve a newer tab's
never-fetched lazy hashes. Use dashboard rollback only with that limitation explicitly accepted, never
as proof of the two-release retention contract. Preview deployments are not production rollback targets.

Release acceptance: in a production-faithful two-release A→B fixture, leave an A tab open, request an
A-only lazy asset for the first time after B deploys, then republish A with B retained and request a
B-only lazy asset. Verify exact hashes, MIME, encoding, validators and immutable policy in both directions,
and that a third release drops the oldest generation. Repeat through Pages and run live smoke after the
actual production rollback. Latest-two Chrome/Edge, Firefox and Safari must decode the addressed Brotli
representations without JS Brotli support; missing hardware/browser evidence is SKIP, not PASS.

Targeted asset checks (no frame-time or visual claim):

```bash
node scripts/harbour/verify-asset-registry.mjs dist
node scripts/harbour/check-asset-delivery.mjs dist https://YOUR-PREVIEW.pharosville.pages.dev
```

The first checks every stored hash, all 89 intact models with the shipped parser, pack bounds,
full-resolution RGBA/coast equality and a bounded two-release/rollback fixture. The second uses the
maintained shared Chrome to fetch every object with JavaScript DecompressionStream removed.
It does not substitute for the Firefox/Safari or production rollback release checks.

## Routine checks

```bash
npm run validate:deploy-gate
npm run check:branch-protection
npm run check:security-headers
npm run smoke:live -- --url https://pharosville.pharos.watch
```

`npm run check:release-admin` verifies branch protection and release
credentials. `npm run check:release-readiness` adds the heavier browser and
live checks for human production sign-off. Versioned releases follow
`RELEASES.md` after a green `main` deployment.

## Monitoring and incident response

The reliability domains are static Pages delivery, the `/api/*` relay, upstream publications,
and diagnostic KV persistence. A saved 200 proves useful service, not upstream recovery.

`functions/api/_outcomes.ts` owns the pure proxy and external-probe classifiers. Every world
and panel response is classified; sampled records have exactly `event`, `endpoint`, `outcome`,
`statusClass`, `latencyBucket`, `release`, and `sampleRate`:

- `PHAROSVILLE_PROXY_OUTCOME`: `cache-hit`, `upstream-success`, `upstream-4xx`,
  `upstream-5xx`, `timeout`, `fetch-error`, `stale-fallback`, `not-configured`, or `rejected`.
- `PHAROSVILLE_PROXY_RESPONSE`: `outcome=response`, counting the final visitor status separately.
  A 503 answered by last-good JSON emits upstream-5xx/5xx, stale-fallback/2xx and response/2xx.

Failures and fallbacks are logged at 100%; normal hits/successes and their paired response counts
at 1%. Weight each record by `1 / sampleRate`; never compute an exact failure ratio from raw
sampled counts. One request may have both a failure and fallback outcome: do not add those as
independent requests. Latency is total relay time, in `lt100ms`, `lt1s`, `lt8s`, `gte8s` buckets.
Endpoint is an allowlisted key or `unlisted`, never a subject, path or query. No new ray, country,
IP or user-agent dimension is emitted. Existing upstream transport-failure logs retain their
current fields. `PHAROSVILLE_EDGE_CACHE_FAILED` remains unsampled for normal/last-good read/write
failures, independently of success sampling. Logs are console-only and do not delay service on
an external sink; Pages tails are not retained aggregates. No RUM or analytics is added.

Watch for these sustained signals when a retained/weighted log view is available:

- final `/api/*` 5xx ratio above 1% over 10 minutes or five failures in five minutes;
- three upstream 5xx, timeouts or fetch errors in 10 minutes, even if stale responses are 200;
- cache failures, missing proxy configuration, publication-age degradation, failed synthetic KV
  storage/readback, post-deploy smoke failure and scheduled-canary failure.

`smoke:live` fails essential endpoint/contract violations; unavailable safety grades, stale data
and schema-legal findings are warning annotations. Safety grades are enrichment, so an outage
need not block a useful harbour. `--strict-freshness` (or `SMOKE_STRICT_FRESHNESS=1`) promotes these
warnings to failures. The daily canary uses strict freshness and confirms a failure five minutes
later before failing its smoke step. Inspect annotations even on green runs.

The deploy workflow probes the immutable deployment; `.github/workflows/canary-smoke.yml` probes
the canonical host daily at 07:23 UTC. Both depend on GitHub Actions. **External monitoring** is
the independent channel; repository code alone cannot activate it or prove delivery of alerts.

On an incident:

1. Run `npm run smoke:live -- --url https://pharosville.pharos.watch`, then repeat with
   `--strict-freshness` to distinguish contract/availability failure from delayed publications.
2. Check root delivery and `/api/chains` status, Warning and source age. A Warning-110 200 is
   degraded service; inspect upstream-failure outcomes before calling it recovery.
3. In a Function tail, distinguish `not-configured` (check server bindings), forwarded upstream
   4xx (key/allowlist/upstream request), upstream 5xx/timeout/fetch error, cache failure and schema
   projection failure. Do not copy credentials into tickets, commands or logs.
4. Check the three on-demand panel canaries below; panel failure must not become a world signal.
   Check KV storage signal/readback separately: ingest acceptance alone is not persistence.
5. Fix forward through the protected release path; check headers and branch posture with the
   routine commands. Rerun live and strict smoke after the fix. Resolve after two successful
   external observations. Retain endpoint key, outcome, source age, workflow URL and deploy SHA.

### On-demand panel readings

These supplement the seven world endpoints. Requests happen only when a supported viewport
opens the corresponding coin-panel section; no background polling or new world cue is added.
All paths are exact allowlists, projected and validated. Unknown ids, extra/reordered/encoded
queries and altered limits are rejected with 404. GET alone is allowed (other methods: 405).
The key stays server-side; browser requests remain same-origin.

| Reading / log key | Allowlisted path | Producer cache cap | Source evidence |
| --- | --- | --- | --- |
| Depeg events / `depegEvents` | `/api/depeg-events?stablecoin=<runtime-id>&limit=30` | 900 s | `_meta` / source age, 900 s budget |
| Reserves / `stablecoinReserves` | `/api/stablecoin-reserves/<runtime-id>` | 14,400 s | live/estimated/static provenance; liveAt and sync independently bounded to 8 hours |
| DEX liquidity / `dexLiquidity` | `/api/dex-liquidity` | 1,800 s | shared runtime-active map; source age and each coin observation, 3,600 s budget |

The registry and cron map are authoritative for producer caps. Normal cache keys are
`https://pharosville.pharos.watch/api/__projection/pv3` plus the exact request path/query.
Last-good keys prepend `/api/__last-good` to that epoch path; both internal prefixes return
404/no-store to public requests. Projected-byte ETags support 304; upstream validators are not
reused. Cache TTL never extends the source's freshness. Last-good copies survive at most 24 hours.
5xx/timeout/fetch errors may return saved 200 JSON with Warning 110 and no-store; upstream 4xx
is forwarded without fallback. This behavior and outcome logging are shared with world reads.

The panel keeps the shared current/stale/unavailable vocabulary, labels source provenance and
reserve estimates, and preserves unknown/partial evidence. Saved Warning-110 readings are
qualified as stale; unverified source age never reads as current. No observation, schema failure
or HTTP failure without usable data reads as unavailable. A missing reserve slice or liquidity
score stays missing; an empty depeg history is not a failed request. These readings do not
change fog, ship pose or any world threshold. UI copy comes from `ui/truth-copy.ts` and source-state.

Live smoke includes these public, unauthenticated canaries plus blocked variants:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
npm run smoke:live -- --url https://pharosville.pharos.watch --strict-freshness
```

The canaries use `usdc-circle` for depegs/reserves and the shared DEX map. Smoke checks projected
shapes, source age, Warning 110, and the actual DEX response's 30 KB gzip ceiling. If one fails,
check upstream publication/provenance and server logs before changing a projector or age budget.

## External monitoring

**Operator action. This cannot be configured from the repository** — both
options live in a third-party dashboard. The settings below are exact; apply
them as written unless the stated reasoning no longer holds.

### What to probe

Two targets, no more. A monitor is a liveness signal, not a second smoke suite;
`scripts/smoke-live.mjs` already covers the full endpoint matrix.

| Target | Expect | Proves |
| --- | --- | --- |
| `https://pharosville.pharos.watch/` | `200`, HTML | Pages static delivery |
| `https://pharosville.pharos.watch/api/chains` | `200`, body contains `"chains"`; classify Warning/age separately | Relay availability; publication health is separate |

`/api/chains` is an inexpensive relay target with a 1800-second source freshness budget
(`API_FRESHNESS_MAX_AGE_SEC` in `shared/lib/api-freshness.ts`). Its healthy response is cached
for at most 900 seconds at each edge location, so a warm location normally reaches upstream
about four times an hour. Different probe regions and cache/upstream failures can increase that
load. An edge-cache hit does not exercise a new upstream fetch.

Do not point a monitor at `/api/stablecoins`, `/api/safety-grades`, or
`/api/stability-index?detail=true`. Those carry large payloads, so repeated probes add bandwidth and upstream load
without improving the basic relay signal.

There is no health endpoint, and none should be invented for this.
`/api/health` is asserted to return `404` in
`shared/lib/pharosville-smoke-matrix.ts`; the proxy only serves the allowlisted
paths. A monitor pointed there will alert forever.

**No credential may appear in a monitor configuration.** Both probes are
unauthenticated same-origin `GET`s — `functions/api/[[path]].ts` injects
`PHAROS_API_KEY` server-side. Never add a header, query string, or basic-auth
field carrying that key to a monitor: third-party monitors surface their
configuration in logs, exports, shared status pages, and support tickets.

### Availability and degradation are separate

Use the fixtures in `functions/api/outcomes.test.ts` when wiring the monitor's response check:

| Probe class | Rule | Operational meaning |
| --- | --- | --- |
| available | 200, expected content, and (for chains) verified publication age ≤ 1800 s, no Warning 110 | Useful current response; cached success is not proof of a new upstream fetch |
| degraded | 200 with Warning 110, source age > 1800 s, or unknown/invalid/future source age | Useful saved/unverified readings; upstream recovery is unproven |
| unavailable | transport failure (status 0), non-200, or invalid expected content | Delivery/relay unavailable |

For the root, check 200/HTML only: it has no publication clock. For chains, derive conservative
publication age from `_meta.updatedAt`, `_meta.ageSeconds`, `X-Data-Age`, and CDN `Age` using the
same source-age rules as `shared/lib/source-freshness.ts`: take the larger of time since valid
publication and `max(valid metadata age, valid X-Data-Age) + Age`. `Age` alone never dates a
publication; absent or invalid source evidence is degraded. Never use probe time as publication
time. Feed this age, status and Warning to the pure `classifyProbe` contract.

Apply the three-bad/two-good threshold independently to availability and degradation. A keyword-only
UptimeRobot check cannot inspect source age or headers: keep its availability alarm, then configure
a response-aware external check for degraded readings with the same cadence and owner/channel.
Until that check exists, mark external degradation monitoring **not configured**; the daily strict
canary is additional evidence, not independent five-minute coverage. Exercise failure and recovery
once, retain the notification receipt and name the alert owner; repository tests cannot prove it.

### Option A — third-party monitor (primary)

Use the operator's UptimeRobot availability monitors, or an external service that supports
these settings. Confirm plan support for three-failure/two-success hysteresis; do not claim the
thresholds are configured if the provider cannot express them. This is the primary signal because
it is the only one outside both GitHub's and Cloudflare's failure domains.

- [ ] Monitor 1 — HTTP(s), `GET https://pharosville.pharos.watch/`, expect `200`.
- [ ] Monitor 2 — keyword monitor, `GET https://pharosville.pharos.watch/api/chains`, expect `200` and keyword `"chains"` present.
- [ ] Interval: **5 minutes** on both.
- [ ] Confirm-before-alert: **3 consecutive failures**; resolve after **2 consecutive successes**.
- [ ] Request timeout: **10 seconds**.
- [ ] Alerts: operator email plus one non-email channel (push or webhook).
- [ ] Verify the alert path once by pausing a monitor or pointing it at a deliberately bad path, then restore it.

### Option B — Cloudflare Health Checks (secondary, Pro plan or above)

Not available on the Free plan. These run from Cloudflare's own edge network
against the address you give, so they share a failure domain with the thing
they monitor: they will catch a broken Pages project, Function, or upstream,
but they are the wrong tool for a Cloudflare-wide outage. Add them for faster
detection, not as a replacement for Option A.

- [ ] Type `HTTPS`, address `pharosville.pharos.watch`, port `443`, method `GET`.
- [ ] One check with path `/`, expected codes `200`.
- [ ] One check with path `/api/chains`, expected codes `200`, expected body `"chains"`.
- [ ] `interval` **60**, `timeout` **10**, `retries` **2**, `consecutive_fails` **3**, `consecutive_successes` **2**.
- [ ] Check regions: at least three across continents (for example `WEU`, `ENAM`, `SEAS`).
- [ ] Route notifications to the operator address, not to a GitHub-dependent inbox.

### Why these values

- **Interval.** The Actions canary runs once a day, so today's worst-case
  detection is a day plus queue latency. A 5-minute external probe with a
  3-failure threshold bounds detection to roughly 15 minutes; 60 seconds on
  Cloudflare bounds it to about 3. Going below 1 minute buys nothing —
  Pages deploys propagate in seconds, and sub-minute alerting mostly reports
  normal deploy churn.
- **Failure threshold of 3.** The Function aborts a slow upstream at 8 s and
  returns `502` (`UPSTREAM_TIMEOUT_MS` in `functions/api/[[path]].ts`). Single
  blips at that boundary are ordinary. Alerting on one failure trains the
  operator to ignore the channel, which costs more than the delay. Three
  consecutive failures also sits above the incident thresholds listed above,
  so the monitor and the incident criteria agree.
- **Timeout of 10 s.** Must exceed the Function's own 8 s upstream abort,
  otherwise the monitor reports a timeout for a request the app answered
  promptly with an error — the wrong fault class to page on. It also matches
  the `SMOKE_TIMEOUT_MS` default in `scripts/smoke-live.mjs`.
- **Two recovery successes.** Prevents a flapping upstream from emitting a
  resolve notice between every failure.

Retune honestly: if upstream 502s prove rarer than assumed, lower the threshold
before shortening the interval. Shortening the interval increases probe load
from every check region at once.

## Client error reports

`src/error-reporter.ts` posts browser failures (renderer, world-data, uncaught,
unhandled rejection) to `/_log`, handled by `functions/_log.ts`. Every accepted
report is written as one line beginning with a fixed token, followed by a flat
JSON object — flat so a log query can filter on `category` or `code` without
unwrapping a nested envelope.

| Token | Means |
| --- | --- |
| `PHAROSVILLE_CLIENT_ERROR` | A real visitor's browser failed |
| `PHAROSVILLE_CANARY_PROBE` | The scheduled synthetic probe, not a real failure |

Neither token is a prefix of the other, so a search for real errors can never
match a probe. The reporter caps itself at five admitted reports per page visit and
the Function rate-limits each client IP to one report per 10 seconds; a silent
day is normal, and a burst of identical controlled `code` values is the signal.

Delivery is serialized and spaced by at least ten seconds, honors `429 Retry-After`,
stops permanent 4xx responses, and tries transient failures at most three times.
Hiding/leaving the page cancels pending delivery. Both browser and server project
only category, controlled code, release, time and sanitized JavaScript source
locations. Free-text messages/reasons, selection URLs, raw user agents and
IP-derived event dimensions are omitted. UTF-8 request bodies stay below 4 KiB.
Local history retains ten entries for at most 24 hours and purges the legacy
free-text schema; operational KV retains its existing 30-day TTL.

PharosVille has no usage analytics or RUM. Google Analytics is removed. Check
the Cloudflare dashboard separately for injected analytics: repository checks
cannot inspect dashboard settings.

### Read path

**Live tail — all plans, nothing is stored.** This is the only zero-setup view:

```bash
npx wrangler pages deployment tail --project-name pharosville --search PHAROSVILLE_CLIENT_ERROR
```

The dashboard equivalent is **Workers & Pages** → `pharosville` → the
deployment → **View details** → **Functions**. It stops at 100 requests per
second and holds at most 10 concurrent viewers.

**Do not wait for Workers Logs or Logpush here.** Both are documented for
Workers, not for Pages Functions, and Cloudflare states plainly that Pages
Function logs are not persisted. There is no dashboard toggle that makes these
reports survive; the KV binding below is what does.

There is deliberately no authenticated read endpoint for these reports. Adding
one would mean a new server-side secret and a new public route on a site whose
only other credential is `PHAROS_API_KEY`, to save an operator a CLI call they
are already authenticated for.

### Operator action — bind KV for durability

Without this binding the Function still works and still logs; the reports just
vanish when the tail closes. One namespace makes them survive 30 days.

1. Create the namespace and note the id it prints:

   ```bash
   npx wrangler kv namespace create pharosville-client-errors
   ```

2. In the dashboard: **Workers & Pages** → `pharosville` → **Settings** →
   **Bindings** → **Add** → **KV namespace**. Variable name **must** be
   `CLIENT_ERROR_KV`; select the namespace from step 1.
3. Redeploy — a binding only reaches a deployment built after it was added.
4. Verify the production deployment's Functions binding is named exactly `CLIENT_ERROR_KV`
   and targets that namespace (not just the preview environment). Configure readback credentials
   below, dispatch the canary and confirm independent retrieval of its exact run key. A 204 alone
   does not verify the binding. Probes have their own prefix and never enter the real-error count.

Read the stored reports, newest last (keys sort by timestamp):

```bash
npx wrangler kv key list --remote --namespace-id <id> --prefix "PHAROSVILLE_CLIENT_ERROR:$(date -u +%F)"
npx wrangler kv key get --remote --text --namespace-id <id> "<key>"
```

The day's report count is the length of that listing. Each ordinary key is
`<TOKEN>:<ISO timestamp>:<random UUID>` and expires after 30 days
(`KV_TTL_SECONDS` in `functions/_log.ts`). One key per report rather than a
per-day counter: KV is eventually consistent, so concurrent increments would
lose each other, while distinct keys cannot collide.

Free-tier KV allows 1,000 writes per day. A failure hitting many visitors at
once can exhaust that; the writes then fail silently and the console line
remains the only record. That is the intended degradation — a full quota must
never cost a visitor their response.

### The canary probe and independent KV readback

`.github/workflows/canary-smoke.yml` POSTs one synthetic report daily and asserts 204/no-store,
GET→405 and cross-origin POST→403. `x-pharosville-canary: 1` labels the caller as synthetic;
anyone can send it, so it grants no authority or extra rate-limit budget. All reports from one
client IP share the same ephemeral ten-second limiter bucket.

A unique `x-pharosville-canary-run` token (run id, attempt and random UUID; 1–80 ASCII letters,
digits, underscores or hyphens) chooses `PHAROSVILLE_CANARY_PROBE:run:<token>` in KV. The token
is only in that synthetic key, never a real-visitor dimension. Invalid synthetic tokens get 400.
Ordinary reports retain timestamp/UUID keys and never receive storage information.

Only synthetic requests receive `x-pharosville-storage`: `accepted` after KV resolves,
`not-configured` for an absent binding, or `failed` for a rejected/thrown write or a two-second
storage deadline. Ingest remains best-effort 204/no-store in all three cases. Real visitor reports
never wait for KV. The canary fails on `failed` or a missing/unrecognised signal; absent binding
emits an explicit **not configured** notice, neither a persistence PASS nor an outage failure.

To enable readback (operator-only):

1. In Cloudflare **My Profile → API Tokens → Create Custom Token**, grant only account permission
   **Workers KV Storage: Read**, restricted to the account owning this namespace. Do not grant edit,
   zone or API-key access. KV tokens may cover the account's namespaces; use a dedicated account
   if namespace isolation is required. Store the token directly as GitHub repository secret
   `CF_KV_READ_TOKEN`, never in a file, command argument or monitor.
2. Store the namespace id as repository secret `CLIENT_ERROR_KV_NAMESPACE_ID`. Reuse the existing
   `CLOUDFLARE_ACCOUNT_ID` secret from deployment; confirm all three refer to the binding's account.
   Enter values through **Repository Settings → Secrets and variables → Actions → New repository
   secret**; do not paste values into issue comments or workflow output.
3. Confirm the production `CLIENT_ERROR_KV` binding in Pages Settings → Bindings and redeploy if
   changed. In **Actions → Canary smoke → Run workflow**, select the released main revision.
4. Confirm storage `accepted` followed by “KV readback: retrieved the synthetic report”. Missing
   secrets/binding yield **not configured**, not proof of durability. A green run with that notice
   still requires operator setup. Wrong namespace/account or accepted-but-not-found fails readback.

When all secrets exist and storage was accepted, `scripts/pharosville/kv-readback.mjs` reads the
exact run key through the authenticated Cloudflare API, outside the app. No public read endpoint
is added. Six attempts wait 0/5/10/15/30/15 seconds (75 seconds total propagation allowance), each
with a ten-second request deadline; the workflow step is bounded to five minutes. Missing records,
429/5xx and transport failures retry within that budget; authentication refusal and invalid records
fail immediately. Exhaustion after acceptance is failure, never a skip. Response bodies, thrown
messages, token values, namespace/account ids and request URLs are never printed by the script.
If readback fails, verify account/namespace alignment, token permission, KV quota and the write
signal before retrying. The stored report retains the 30-day TTL.

Offline regression checks:

```bash
npx vitest run functions tests/qa/kv-readback.test.mjs
node scripts/check-guards.test.mjs
```

## Per-selection social cards

`functions/index.ts` serves `/` and rewrites the `og:*`, `twitter:*`,
`description` and `<title>` text when the query string names a recognised
entity, so a link shared to one ship unfurls as that ship rather than as the
homepage. It is text-only: `og:image` stays the single static `og-card.png` for
every variant. It fetches nothing, holds no credential, and writes no cache
entry; a day request with no `sel=` gets the asset response untouched.

The edge also fills `#pv-shared-subject` inside the welcome template with the
validated static identity, on both day and night shells. It makes no claim about
readings or position. Known active ships, known chain keys, the fixed panel
places and pre-launch records in the bundled registry get named text. Wrecks,
live-only yard records and unknown subjects keep the generic welcome and card.

The same route picks the night key art (E28): when the visitor's hour, from the
edge's `cf.timezone` or a pinned `?t=`, falls on the harbour's night (night share
≥ 0.5, `functions/_poster.ts`), it names `poster-night-*` wherever the shell
names the day poster and marks the root `data-pv-hour="night"`, before first
paint. An unknown zone keeps the day poster. The night body carries
`<asset etag>-night` and no `Last-Modified`, and is always built from a whole
asset response, so a revalidation never replays a body cached at another hour.
Headers are otherwise the asset's own. Check it after a deploy:

```bash
curl -s 'https://pharosville.pharos.watch/?t=22' | grep -o 'data-pv-hour="night"'
curl -sI 'https://pharosville.pharos.watch/?t=22' | grep -i 'etag\|content-security-policy'
```

Two things need a human.

**Verify the header policy on the first deploy that carries it.** This is the
first Function in front of the app shell. `public/_headers` governs `/` today,
and the route is written to pass the asset response's headers through
unchanged, but a Function on the HTML route is a new arrangement — confirm the
policy survived before trusting it:

```bash
npm run check:security-headers
curl -sI 'https://pharosville.pharos.watch/?sel=ship.usdc-circle' | grep -i 'content-security-policy\|x-frame-options\|permissions-policy'
```

The Permissions-Policy must show `fullscreen=(self)` and `screen-wake-lock=(self)`; Stay mode needs both
(`SECURITY_HEADERS.md`).

Then check that the rewrite actually fires:

```bash
curl -s 'https://pharosville.pharos.watch/?sel=ship.usdc-circle' | grep 'og:title'
```

**Stable subject-link contract for pharos.watch.** Use the runtime-neutral
`shared/lib/selection-link.ts` codec: `canonicalSubjectUrl({ kind: "ship", id })`
produces `https://pharosville.pharos.watch/?sel=ship.<id>`. The reciprocal link
label is **“See this coin in PharosVille”**. IDs are the exact Pharos registry
IDs (for example, `usdc-circle`), never guessed slugs or symbols. Chain links use
`{ kind: "chain", id: <CHAIN_META key> }`, for example `chain.ethereum`.
Other supported subjects are `yard.<id>`, `wreck.<id>` and `place.<id>`;
`chart=1` optionally shows chart names. The entire selection is at most 128
characters, with lowercase, structurally checked IDs. The destination resolves
membership after the current fleet, layout and detail module are ready.

Copy link emits this canonical origin and subject/chart only. Links always open
latest readings; they carry no camera, time, quality or development state. The
homepage remains the HTML canonical and every subject keeps the same OG image.
The client also reads old `#sel=` fragments when the query has no `sel`, and
normalizes `lighthouse` to `place.pharos`. Fragments never reach the edge, so old
hash links have generic unfurls until copied again. The removed `pigeonnier`
opens no panel and explains that the place is no longer in the harbour.

Deliberate selections and close push history; ship stepping replaces the current
entry. Back/Forward restore subjects without adding entries. Unknown subjects
open no panel and show a brief polite notice. A phone keeps its subject URL and
loads no world runtime or readings; an admitted larger window restores it.

Outbound boat and chain panel links currently lead to the Stablecoins and Chains
directories on pharos.watch, with explicit new-tab wording. Per-entity host
routes and the reciprocal host change require separate confirmation and
authorization; do not derive routes from IDs here.

## Rotate `PHAROS_API_KEY`

1. Obtain a replacement key from the upstream owner.
2. Store it without printing it:

   ```bash
   npx wrangler pages secret put PHAROS_API_KEY --project-name pharosville
   ```

3. Deploy and smoke the canonical URL.
4. Revoke the old upstream key only after verification.
5. Remove any ignored local copy that was used during rotation.

## Sync pharos-watch data

The pre-launch book (`src/harbour/data/prelaunch.json`), the logo book
(`public/logos/` + `data/logos.json`), brand colours (`data/brand-colors.json`)
and the cemetery behind Wreck Cove (`shared/data/dead-stablecoins.json`) are
vendored from `TokenBrice/pharos-watch`. One command refreshes all four:

```bash
npm run sync:pharos-watch -- --source /path/to/pharos-watch
npm run sync:pharos-watch -- --repo git@github.com:TokenBrice/pharos-watch.git --ref main
```

It reads authored, tracked upstream files only, plans everything in memory,
and on any schema violation (shared/'s strict cemetery schema, a broken
logo, a malformed launch date) writes nothing and exits 1. A second run
changes no byte. It prints a per-file summary; when logo files changed,
rebuild the sail atlas with `node scripts/harbour/build-emblems.mjs`.
`data/pharos-watch-sync.json` stamps the source commit; `npm run
check:pharos-watch-sync` (in `validate:docs`) fails on missing referenced
files and warns once the stamp is older than 30 days.

`.github/workflows/sync-pharos-data.yml` runs it weekly (and on demand) and
opens or refreshes one pull request from `sync/pharos-watch`. It never
deploys or pushes to `main`. Operator setup, once:

1. Create a fine-grained personal access token: resource owner TokenBrice,
   repository access only `pharos-watch`, permission Contents: Read-only.
2. Store it as the repository secret `PHAROS_WATCH_READ_TOKEN`:
   `gh secret set PHAROS_WATCH_READ_TOKEN --repo TokenBrice/pharosville`.
3. Settings → Actions → General → Workflow permissions: enable "Allow GitHub
   Actions to create and approve pull requests".

A pull request opened with `GITHUB_TOKEN` does not start other workflows:
close and reopen it (or push to its branch) to run the deploy validation.

## References

- https://developers.cloudflare.com/pages/
- https://developers.cloudflare.com/pages/functions/local-development/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/functions/debugging-and-logging/
- https://developers.cloudflare.com/pages/configuration/rollbacks/
- https://developers.cloudflare.com/health-checks/
