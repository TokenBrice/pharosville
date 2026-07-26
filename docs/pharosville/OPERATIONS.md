# PharosVille Operations

Last updated: 2026-07-25

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
minutes. If operations needs an independent monitor, add Cloudflare or external
uptime alerting in addition to GitHub Actions.

On an incident:

1. Run `npm run smoke:live -- --url https://pharosville.pharos.watch`.
2. Check headers and branch posture with the commands above.
3. Distinguish key/upstream failure from a code regression before rolling back.
4. Re-run smoke after a rollback and retain the failing endpoint, error class,
   workflow URL, and deployment/rollback evidence.

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
