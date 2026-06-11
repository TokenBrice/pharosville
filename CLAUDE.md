# Agent Guide

Applies to the whole standalone `pharosville` repository.
`AGENTS.md` is the canonical agent guidance for this repository; keep this file aligned with it.

Use `/agents/` for planning artifacts. Use `/outputs/` for screenshots,
renders, test sprites, and other scratch files.
Local dev server (maintained): http://localhost:5173/

## Hard Rules

- Work only in `/home/ahirice/Documents/git/pharosville` unless the operator explicitly authorizes a specific read elsewhere.
- This repo is independent from `TokenBrice/pharos-watch` and the local `stablecoin-dashboard` checkout. Do not edit, clean up, merge, or deploy the host repo from here.
- Canonical remote: `https://github.com/TokenBrice/pharosville.git`.
- Canonical app URL: `https://pharosville.pharos.watch/`.
- Browser code calls same-origin `/api/*` only.
- Cloudflare Pages Function `functions/api/[[path]].ts` proxies the allowlisted read endpoints to `PHAROS_API_BASE`.
- `PHAROS_API_KEY` is a Cloudflare Pages secret and must remain server-side. Never expose it as `VITE_*`, static JS, HTML, query strings, logs, docs, or fixtures.
- `src/**` owns the PharosVille React/canvas app. `shared/**` is copied runtime-neutral contract/data logic used by this app.
- For frontend changes, preserve the desktop gate: narrow or portrait viewports must not mount the world runtime or fetch world data.
- Do not commit generated `dist/`, `test-results/`, local env files, or scratch artifacts.

## Startup

1. Run `git status --short`.
2. Run `npm run onboard:agent`.
3. Use `docs/pharosville/AGENT_ONBOARDING.md` for task routing and read only the task-specific docs it names.

## Validation

Use the smallest relevant check while iterating. For mixed or uncertain scope:

```bash
npm run validate:changed
```

Before claiming broad release confidence, use `npm run validate:release`.
For deployed changes:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```
