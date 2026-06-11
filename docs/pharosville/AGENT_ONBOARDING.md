# PharosVille Agent Onboarding

Last updated: 2026-06-11

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
- Keep world runtime unmounted when the device screen long side is below `720px`, the short side is below `360px`, or a capable screen is in portrait orientation.
- Use `agents/` for plans and handoff artifacts.
- Use `outputs/` for temporary screenshots, renders, and generation scratch files.

## Task Routing

| Task | Read only if needed | First checks |
| --- | --- | --- |
| App shell, API proxy, metadata, viewport gate | `docs/pharosville/ARCHITECTURE.md`, `docs/pharosville-page.md` | `npm run validate:changed` |
| World model, data semantics, layout, motion | `docs/pharosville/VISUAL_INVARIANTS.md`, `src/systems/README.md` | `npm test -- src` |
| Canvas renderer, hit testing, interaction | `src/renderer/README.md`, `docs/pharosville/TESTING.md` | focused unit test, then visual lane if pixels changed |
| Assets or PixelLab generation | `docs/pharosville/ASSET_PIPELINE.md`, `docs/pharosville/PIXELLAB_MCP.md` | `npm run check:pharosville-assets` |
| Visual snapshots | `docs/pharosville/TESTING.md`, `docs/pharosville/VISUAL_REGEN.md` | matching Playwright grep |
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
- Updating visual baselines for unintentional drift.
- Adding runtime references to remote/prototype sprite URLs.
- Encoding analytical meaning only in canvas without detail-panel and accessibility-ledger parity.
