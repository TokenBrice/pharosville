# PharosVille

PharosVille is a Canvas 2D maritime analytics UI for Pharos stablecoin signals. It runs as a desktop-only web app at `https://pharosville.pharos.watch/` and renders real-time stablecoin supply, dock chain presence, and risk indicators with local pixel-art sprites driven by a pure world model.

Standalone PharosVille frontend for `pharosville.pharos.watch`.

The browser reads same-origin `/api/*` paths. Cloudflare Pages Functions allow only the six PharosVille read endpoints and inject `PHAROS_API_KEY` server-side, so no API key is shipped to the client bundle.

For the data flow and rendering pipeline at a glance, see `docs/pharosville/ARCHITECTURE.md`. For agent-oriented entry points, see `AGENTS.md`.

## Agent Onboarding

For agent-oriented startup, guardrails, and focused command lanes:

- `AGENTS.md`
- `docs/pharosville/AGENT_ONBOARDING.md`

Run the onboarding/environment check:

```bash
npm run onboard:agent
```

## Commands

```bash
npm ci
npm run dev
npm run validate:docs
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Local API Key For Worktrees

`npm run dev` proxies same-origin `/api/*` through `functions/api/[[path]].ts`, which requires `PHAROS_API_KEY` server-side.

The dev proxy resolves `PHAROS_API_KEY` in this order:

1. `process.env.PHAROS_API_KEY`
2. `.env.local` in the current worktree
3. `.env.local` in the main worktree (auto-discovered for linked worktrees)
4. `.git/pharosville.env.local` (shared across worktrees)

Use `npm run onboard:agent` to confirm whether the key is discoverable before debugging missing ships/data in local dev.

Initialize/update the shared key file for all linked worktrees:

```bash
npm run setup:local-api-key
```

Smoke all allowlisted Pharos endpoints with the discovered key before debugging UI data issues:

```bash
npm run smoke:api-local
```

Smoke the same allowlisted endpoints through the local Vite `/api/*` proxy path:

```bash
npm run smoke:dev-proxy
```

## Agent Workflow Automation

Create and bootstrap a new local worktree:

```bash
npm run worktree:new -- <name> --branch <branch-name> --install
```

One-shot bootstrap (optional worktree creation + key setup + API smoke + onboarding):

```bash
npm run agent:init -- [worktree-name] --branch <branch-name> --install
```

Scaffold a dated plan artifact in `agents/`:

```bash
npm run agent:plan:new -- <slug>
```

Auto-select validation lane from current diff (`validate:docs` for docs-only changes, otherwise full `validate`):

```bash
npm run validate:changed
```

To install the optional local pre-push gate for direct `main` pushes:

```bash
npm run hooks:install
```

The hook runs `npm run validate:release` only when pushing to `main`.
For non-main branch pushes, the hook runs `npm run validate:changed`.

## Cloudflare Pages

Project name: `pharosville`

Required Pages configuration:

```bash
wrangler pages project create pharosville --production-branch main
wrangler pages secret put PHAROS_API_KEY --project-name pharosville
```

`PHAROS_API_BASE` is set in `wrangler.toml` as `https://api.pharos.watch`.

For Pages Functions preview, deployment, smoke, rollback, and credential rotation, see `docs/pharosville/OPERATIONS.md`.
