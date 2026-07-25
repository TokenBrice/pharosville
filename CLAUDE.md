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
- `src/**` owns the PharosVille React/Three.js/WebGL app. `shared/**` is copied runtime-neutral contract/data logic used by this app.
- For frontend changes, preserve the desktop gate: screens and WINDOWS too small to chart must not mount the world runtime or fetch world data. Both halves are SIZE tests — never gate on `(orientation: portrait)`, which is a viewport aspect test and blocks tall desktop windows that have more room than the wide ones it allows.
- Never judge how PharosVille looks or how fast it runs through a Playwright browser. The bundled Chromium AND `channel: "chrome"` both fall back to SwiftShader, a CPU rasteriser that renders an approximately-correct frame and reports fiction — it read `recovery`/`constrained` and 20-43 fps where the real GPU reads `full` and 59 fps. Use `npm run preview`; it goes through the operator's Chrome wrapper and exits non-zero rather than report a software frame. See `docs/pharosville/TESTING.md`.
- Versioned releases must be published by `.github/workflows/release.yml` after a green `main` deploy. Do not manually create semantic tags or GitHub Releases; follow `docs/pharosville/RELEASES.md`.
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
