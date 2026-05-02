# PharosVille Observability and Alerting

Last updated: 2026-05-02

## Production signals to monitor

PharosVille has two reliability domains:

- Static delivery (Cloudflare Pages)
- API relay layer (`functions/api/[[path]].ts`) for Pharos allowlisted endpoints

Priority alerts are:

1. `/api/*` `5xx` ratio
2. Upstream timeout and proxy `502` responses on API relay
3. Post-deploy production smoke failures

## Recommended Cloudflare alert setup

Use Cloudflare Analytics dashboards/alerts for Pages traffic and Workers/Functions metrics.

- Alert if 5xx responses for `/api/*` exceed:
  - `1%` of `/api/*` traffic over 10 minutes, or
  - `>= 5` failures in 5 minutes (whichever triggers first)
- Alert if upstream timeout or Pages Functions `502` for `/api/*` exceeds:
  - `>= 3` events in 10 minutes
- Alert if a deployment succeeds and is followed by a live smoke failure within 30 minutes.

## Production smoke alerting

Production smoke currently runs on every successful production deploy in:

- `.github/workflows/deploy-cloudflare.yml`

The deploy workflow checks live security headers and then runs live smoke against
`https://pharosville.pharos.watch`. A failure blocks the deploy workflow status.

Use this command to replay the health checks:

```bash
npm run check:security-headers
npm run smoke:live -- --url https://pharosville.pharos.watch
```

External scheduled monitoring is not configured in this repository. If operations
requires checks independent of deploys, prefer a Cloudflare or uptime-monitoring
alert rather than a second GitHub workflow status on every push.

## On-call runbook

1. Run live smoke with trace output:

   ```bash
   npm run smoke:live -- --url https://pharosville.pharos.watch
   ```

2. If smoke fails, verify branch and header posture:

   ```bash
   npm run check:branch-protection
   npm run check:security-headers
   ```

3. Open the last deploy job and rollback only after verifying config drift:

   - If API key binding is healthy and regression is code-related, roll back to previous
     good deployment in Cloudflare Pages.
   - Re-run smoke immediately after rollback.
4. File an incident report with failing endpoint, error class (`5xx`, `502`, or smoke variance),
   and the first deploy that introduced it.

## Evidence artifacts

Retain:

- `npm run smoke:live -- --url ...` output
- `npm run check:security-headers` output
- the corresponding workflow run URL
- the rollback action or deployment artifact
