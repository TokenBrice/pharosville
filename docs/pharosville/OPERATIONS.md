# PharosVille Operations

Last updated: 2026-07-26

This runbook covers the standalone Cloudflare Pages app at
`https://pharosville.pharos.watch/`.

## Service boundary

- Pages project: `pharosville`; production branch: `main`; build output: `dist`.
- `wrangler.toml` sets the public `PHAROS_API_BASE`.
- `functions/api/[[path]].ts` proxies allowlisted reads and holds the
  server-side `PHAROS_API_KEY` binding.
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

## Deploy and rollback

Normal production changes deploy from protected `main`. A direct deploy is
only for explicitly authorized operational recovery; it is not a versioned
release and must never be paired with a manually created tag or GitHub Release.

```bash
git status --short
npm run build
npx wrangler pages deploy dist --project-name pharosville
npm run smoke:live -- --url https://pharosville.pharos.watch
```

To roll back, select a prior successful **production** deployment in the
Cloudflare Pages dashboard, roll it back, then rerun live smoke. Preview
deployments are not rollback targets.

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

The reliability domains are static Pages delivery and the `/api/*` relay.
Watch for:

- `/api/*` 5xx ratio above 1% over 10 minutes or five failures in five minutes;
- three or more upstream timeout/502 responses in 10 minutes;
- post-deploy smoke failure and failure of the scheduled canary.

The deploy workflow probes the immutable deployment and
`.github/workflows/canary-smoke.yml` probes the canonical host every 30
minutes. Both run on GitHub Actions, so an Actions outage or a skipped schedule
removes the only alerting channel. See **External monitoring** below for the
independent monitor that closes that gap.

On an incident:

1. Run `npm run smoke:live -- --url https://pharosville.pharos.watch`.
2. Check headers and branch posture with the commands above.
3. Distinguish key/upstream failure from a code regression before rolling back.
4. Re-run smoke after a rollback and retain the failing endpoint, error class,
   workflow URL, and deployment/rollback evidence.

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
| `https://pharosville.pharos.watch/api/chains` | `200`, body contains `"chains"` | Function relay, key binding, upstream |

`/api/chains` is the correct data target because it carries the longest
freshness lane of the six allowlisted endpoints (1800 s, see
`API_FRESHNESS_MAX_AGE_SEC` in `shared/lib/api-freshness.ts`). The Function
stores that response in the Cloudflare edge cache, so probes are served from
the edge and reach upstream at most about twice an hour no matter how often the
monitor runs. It is the cheapest read that still exercises the whole relay
path.

Do not point a monitor at `/api/stablecoins`, `/api/report-cards`, or
`/api/stability-index?detail=true`. Those carry the largest payloads and the
shortest freshness lanes, so frequent probes turn into real upstream load and
real bandwidth for no extra signal.

There is no health endpoint, and none should be invented for this.
`/api/health` is asserted to return `404` in
`shared/lib/pharosville-smoke-matrix.ts`; the proxy only serves the allowlisted
paths. A monitor pointed there will alert forever.

**No credential may appear in a monitor configuration.** Both probes are
unauthenticated same-origin `GET`s — `functions/api/[[path]].ts` injects
`PHAROS_API_KEY` server-side. Never add a header, query string, or basic-auth
field carrying that key to a monitor: third-party monitors surface their
configuration in logs, exports, shared status pages, and support tickets.

### Option A — third-party monitor (primary)

Use any external service; UptimeRobot's free tier is sufficient (50 monitors,
5-minute floor, keyword monitors included). This is the primary signal because
it is the only one outside both GitHub's and Cloudflare's failure domains.

- [ ] Monitor 1 — HTTP(s), `GET https://pharosville.pharos.watch/`, expect `200`.
- [ ] Monitor 2 — keyword monitor, `GET https://pharosville.pharos.watch/api/chains`, expect `200` and keyword `"chains"` present.
- [ ] Interval: **5 minutes** on both.
- [ ] Confirm-before-alert: **3 consecutive failures**.
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

- **Interval.** The Actions canary runs every 30 minutes, so today's worst-case
  detection is 30 minutes plus queue latency. A 5-minute external probe with a
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

## Rotate `PHAROS_API_KEY`

1. Obtain a replacement key from the upstream owner.
2. Store it without printing it:

   ```bash
   npx wrangler pages secret put PHAROS_API_KEY --project-name pharosville
   ```

3. Deploy and smoke the canonical URL.
4. Revoke the old upstream key only after verification.
5. Remove any ignored local copy that was used during rotation.

## References

- https://developers.cloudflare.com/pages/
- https://developers.cloudflare.com/pages/functions/local-development/
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/configuration/rollbacks/
- https://developers.cloudflare.com/health-checks/
