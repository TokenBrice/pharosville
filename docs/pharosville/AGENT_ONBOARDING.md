# PharosVille Agent Onboarding

Last updated: 2026-10-14

Use this after `AGENTS.md` to route the current task. Keep startup small:
read only the docs needed for the change in front of you.

## Start

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Check local state and required files:

   ```bash
   npm run onboard:agent
   ```

3. Before debugging missing ships/data:

   ```bash
   npm run setup:local-api-key
   npm run smoke:api-local
   npm run smoke:dev-proxy
   ```

## Core Rules

- Work only in this repository unless explicitly authorized.
- Browser must use same-origin `/api/*` (no client cross-origin API calls).
- Keep `PHAROS_API_KEY` server-side only.
- Keep world runtime unmounted unless both the device screen and the current VIEWPORT satisfy the `720×600` size profile (long side × short side). Dimensions are sorted; do not gate on `(orientation: portrait)`, because CSS orientation is a viewport aspect test that blocks tall desktop windows with more room than wide ones it allows.
- Use `agents/` for plans and handoff artifacts.
- Use `outputs/` for temporary screenshots, renders, and generation scratch files.

## Task Routing

| Task | Read only if needed | First checks |
| --- | --- | --- |
| App shell, API proxy, metadata, viewport gate, first-paint poster | `docs/pharosville/CONTRACTS.md`, `docs/pharosville/ARCHITECTURE.md`, `docs/pharosville-page.md` | `npm run validate:changed` |
| The Harbour world: meaning, art direction, circuits, minimal UI | `agents/2026-10-13-pharosville-reboot/PLAN.md` (D1-D14), `agents/2026-10-13-pharosville-reboot/p2/BRIEF.md` (engine, services, asset contracts) | `npx vitest run src/harbour` |
| Engine, renderer, systems, sea/sky/beam, fleet | `docs/pharosville/ARCHITECTURE.md`, `src/harbour/systems.ts` (order = update order) | `npx vitest run src/harbour`, then `npm run preview -- --url <url>` |
| Data feed, model, sim (boat circuits) | `docs/pharosville/ARCHITECTURE.md`, `src/harbour/data/fetch.ts` | `npx vitest run src/harbour/data src/harbour/model src/harbour/sim` |
| Chart UI (hover tag, panel, ledger, search) | `src/harbour/ui/` | `npx vitest run src/harbour/ui` |
| Production mount and poster crossfade | `src/harbour/app/harbour-app.tsx`, `src/client.tsx` | `npm test -- src/client.test.tsx`, `npm run check:viewport-gate`, then the real-browser gate check in `docs/pharosville/TESTING.md` (`npm run preview -- --log-requests`) |
| Visual evidence, look, frame time | `docs/pharosville/TESTING.md` | `npm run preview` (`scripts/harbour/shot.mjs`, real GPU) for anything you LOOK at or quote a frame time from; `npm run test:visual` only for DOM assertions |
| Versioned release, tag, or GitHub Release | `docs/pharosville/RELEASES.md` | `npm run check:release-contract` |
| Docs/process only | `docs/pharosville/README.md` | `npm run validate:docs` |
| Unknown or mixed scope | this file, then exact source files | `npm run validate:changed` |

## Shortcuts

Create a worktree:

```bash
npm run worktree:new -- <name> --branch <branch-name> --install
```

One-shot bootstrap:

```bash
npm run agent:init -- [worktree-name] --branch <branch-name> --install
```

Plan scaffold:

```bash
npm run agent:plan:new -- <slug>
```

## Avoid

- Exposing `PHAROS_API_KEY` through client code, docs, fixtures, or logs.
- Treating old `agents/*plan*.md` files as authoritative over current code and route docs.
- Judging the render or the frame time through a Playwright browser. Use `npm run preview` (`scripts/harbour/shot.mjs`) — it goes through the operator's own Chrome and refuses a software frame. (The correctness lane asks the bundled browser for hardware rendering outside CI so the gates can run at all; that does not make its frame times quotable.)
- Looking for committed screenshot baselines to regenerate. There are none — the visual lane asserts DOM state and telemetry, so a renderer change cannot put it in debt.
- Gating any viewport decision on `(orientation: portrait)`. It is a viewport aspect test, not a device test.
- Treating a changelog entry, `main` deploy, local tag, or manual GitHub Release as the complete versioned release path.
- Reintroducing a renderer switch or graphical fallback.
- Reintroducing an unreviewed runtime asset inventory or namespace.
- Adding runtime references to remote generation or prototype URLs.
- Encoding analytical meaning only in WebGL without a hover tag, side panel or ledger reading for it (D11: text on demand only).
