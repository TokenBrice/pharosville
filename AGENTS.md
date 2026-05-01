# Agent Guide

Applies to the whole standalone `pharosville` repository.

Use `/agents/` for planning artifacts, with subfolder organization as needed.
Use `/outputs/` to store screenshots, renders, test sprites, and other temporary files.
Legacy `/output/` content may exist, but new scratch artifacts should go under `/outputs/`.


## Scope

- Work only in `/home/ahirice/Documents/git/pharosville` unless the operator explicitly authorizes a specific read elsewhere.
- This repo is independent from `TokenBrice/pharos-watch` and the local `stablecoin-dashboard` checkout. Do not edit, clean up, merge, or deploy the host repo from here.
- Canonical remote: `https://github.com/TokenBrice/pharosville.git`.
- Canonical app URL: `https://pharosville.pharos.watch/`.

## Architecture

- Browser code calls same-origin `/api/*` only.
- Cloudflare Pages Function `functions/api/[[path]].ts` proxies the allowlisted read endpoints to `PHAROS_API_BASE`.
- `PHAROS_API_KEY` is a Cloudflare Pages secret and must remain server-side. Never expose it as `VITE_*`, static JS, HTML, query strings, logs, docs, or fixtures.
- `PHAROS_API_BASE` is non-secret and currently configured in `wrangler.toml`.
- `src/**` owns the PharosVille React/canvas app. `shared/**` is copied runtime-neutral contract/data logic used by this app.

## Read First

- `docs/pharosville/AGENT_ONBOARDING.md` for the quickest safe startup path.
- `README.md` for commands and deployment shape.
- `docs/pharosville/CURRENT.md` for current implementation boundaries.
- `docs/pharosville/CHANGE_CHECKLIST.md` before non-trivial UI, asset, renderer, or data-model changes.
- `docs/pharosville/PIXELLAB_MCP.md` before PixelLab MCP sprite generation or review.
- `docs/pharosville/TESTING.md` for focused validation and visual-review expectations.

## Change Rules

- Keep changes narrowly scoped to PharosVille.
- Preserve the Pages Function API allowlist unless the backend contract is intentionally expanded.
- Do not add client-side secrets, cross-origin browser API calls, or dependencies on local sibling repos.
- For frontend changes, maintain the desktop gate: narrow viewports must not mount the world runtime or fetch world data.
- For visual changes, inspect screenshot diffs before updating baselines. Update snapshots only when the rendered drift is intentional.
- Do not commit generated `dist/`, `test-results/`, or local environment files.

## Validation

Use the smallest focused check while developing. Before publishing or claiming broad completion, run:

```bash
npm run onboard:agent
npm run validate:docs
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

For deployed changes, confirm the live smoke path:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

## Testing

http://localhost:5173/ is maintained by operator
