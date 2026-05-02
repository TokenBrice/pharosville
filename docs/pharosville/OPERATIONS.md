# PharosVille Operations

Last updated: 2026-05-01

This runbook covers the standalone Cloudflare Pages app at `https://pharosville.pharos.watch/`.

## Cloudflare Pages Setup

- Project name: `pharosville`
- Production branch: `main`
- Build output: `dist`
- Wrangler config: `wrangler.toml`
- Pages Function proxy: `functions/api/[[path]].ts`
- Public API base: `PHAROS_API_BASE=https://api.pharos.watch` in `wrangler.toml`
- Secret API key: `PHAROS_API_KEY` as a Cloudflare Pages secret

Initial project setup:

```bash
npx wrangler pages project create pharosville --production-branch main
npx wrangler pages secret put PHAROS_API_KEY --project-name pharosville
```

Do not put `PHAROS_API_KEY` in `VITE_*`, static JS, HTML, docs, fixtures, logs, or committed env files.

## Local Development

Vite dev is fastest for UI work, but it does not exercise the Pages Function runtime:

```bash
npm ci
npm run dev
```

Use it for canvas, layout, and React behavior that does not require a live `/api/*` proxy.

For linked-worktree development, the Vite `/api/*` proxy can read `PHAROS_API_KEY`
from either the current worktree `.env.local`, the main worktree `.env.local`,
or `.git/pharosville.env.local` as a shared local secret file.
Run these before debugging missing ships/data:

```bash
npm run setup:local-api-key
npm run onboard:agent
npm run smoke:api-local
npm run smoke:dev-proxy
```

For local Pages Functions preview, keep local secrets in ignored `.dev.vars` or pass local bindings through Wrangler. Do not commit local secret files.

```bash
npm run build
npx wrangler pages dev dist
```

Wrangler serves Pages locally, including Functions, at `http://localhost:8788` by default. Confirm `/api/*` behavior in this mode before debugging proxy-only issues.

## Validation

Focused development checks:

```bash
npm run validate
```

Before publishing or claiming release-level confidence:

```bash
npm run validate:release
```

For direct `main` pushes, install the optional local pre-push hook once:

```bash
npm run hooks:install
```

Run `npm run check:branch-protection` to validate merge-gate controls before calling `main` protected.

## Branch protection requirements

Before declaring production readiness, enforce `main` merge control on the
`pharosville` repository:

- Require pull requests with at least one approval
- Require all of these status checks to pass:
  - `typecheck`
  - `unit`
  - `guards`
  - `build`
  - `visual`
- Require branches to be up to date before merge and no direct bypass for `main`

Recommended verification:

```bash
npm run check:branch-protection
```

This command verifies the required checks and merge controls and exits non-zero if any control is missing.
Optionally pass explicit target context:

```bash
npm run check:branch-protection -- --branch release
```

## Deploy

Check the worktree first and do not deploy unrelated dirty work:

```bash
git status --short
```

Build and deploy the current `dist` artifact:

```bash
npm run build
npx wrangler pages deploy dist --project-name=pharosville
```

The current `npm run deploy` script also deploys `dist`, but release hardening is still tracked separately. Prefer the explicit command above when you need dirty-tree protection.

CI now runs a dedicated post-deploy `release-readiness` job on production pushes. That runtime gate runs `npm run check:release-readiness` and a production smoke against the configured live URL. Repository admin hardening remains separately checkable with `npm run check:release-admin` until branch protection is configured.

## Live Smoke

After production deploy, smoke the canonical URL:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

At minimum, verify:

- `/` returns the PharosVille app shell.
- Narrow viewport fallback does not fetch world data or runtime assets.
- Allowlisted `/api/*` endpoints respond through the Pages Function proxy.
- Unexpected paths or query shapes fail closed.

Run a full release checklist before release cut:

```bash
npm run check:release-readiness
```

### Security headers and health posture

Use this matrix for routine production verification:

- Security policy: docs/pharosville/SECURITY_HEADERS.md
- Browser and static routes: `public/_headers`
- API proxy routes: `functions/api/[[path]].ts`
- Live smoke with security assertions: `npm run smoke:live -- --url https://pharosville.pharos.watch`

For production monitoring, add alerts on:

1. `5xx` error-rate for `/api/*`
2. Upstream timeout / proxy `502` rates
3. Scheduled smoke failures

See also: docs/pharosville/OBSERVABILITY.md

## Schedules

Continuous health checks now run via:

- `.github/workflows/pharosville-scheduled-smoke.yml` (every 4 hours, UTC, with manual dispatch)
- `npm run smoke:live -- --url https://pharosville.pharos.watch`

## Rollback

Use Cloudflare Pages production rollback from the dashboard:

1. Open Workers & Pages.
2. Select `pharosville`.
3. Open Deployments.
4. Choose a previous successful production deployment.
5. Select the actions menu and roll back to that deployment.

Only production deployments are rollback targets; preview deployments are not.

After rollback, rerun:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

## Credential Rotation

Rotate `PHAROS_API_KEY` out of band with the upstream credential owner:

1. Create a replacement upstream API key.
2. Store it as the Pages secret without printing it:

   ```bash
   npx wrangler pages secret put PHAROS_API_KEY --project-name pharosville
   ```

3. Deploy after the secret is set so the Pages Function sees the new binding:

   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name=pharosville
   ```

4. Run live smoke against `https://pharosville.pharos.watch`.
5. Revoke the old upstream key after the new deployment is verified.
6. Delete any local live secret material from ignored env files after rotation.

## References

- Cloudflare Pages overview: https://developers.cloudflare.com/pages/
- Pages Functions local development: https://developers.cloudflare.com/pages/functions/local-development/
- Pages Functions bindings and secrets: https://developers.cloudflare.com/pages/functions/bindings/
- Wrangler Pages commands: https://developers.cloudflare.com/workers/wrangler/commands/pages/
- Pages rollbacks: https://developers.cloudflare.com/pages/configuration/rollbacks/
