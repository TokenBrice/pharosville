# PharosVille

Standalone PharosVille frontend for `pharosville.pharos.watch`.

The browser reads same-origin `/api/*` paths. Cloudflare Pages Functions allow only the six PharosVille read endpoints and inject `PHAROS_API_KEY` server-side, so no API key is shipped to the client bundle.

## Commands

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Cloudflare Pages

Project name: `pharosville`

Required Pages configuration:

```bash
wrangler pages project create pharosville --production-branch main
wrangler pages secret put PHAROS_API_KEY --project-name pharosville
```

`PHAROS_API_BASE` is set in `wrangler.toml` as `https://api.pharos.watch`.

For Pages Functions preview, deployment, smoke, rollback, and credential rotation, see `docs/pharosville/OPERATIONS.md`.
