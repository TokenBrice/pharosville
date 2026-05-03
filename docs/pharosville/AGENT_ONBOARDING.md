# PharosVille Agent Onboarding

Last updated: 2026-05-02

Use this file as the fastest path to productive and safe PharosVille work.

## 10-Minute Setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Run the onboarding check:

   ```bash
   npm run onboard:agent
   ```

3. Ensure local API key and endpoint smoke are healthy before UI debugging:

   ```bash
   npm run setup:local-api-key
   npm run smoke:api-local
   npm run smoke:dev-proxy
   ```

4. Read in this order:
   - `AGENTS.md`
   - `docs/pharosville-page.md`
   - `docs/pharosville/CHANGE_CHECKLIST.md`
   - `docs/pharosville/CURRENT.md`
   - `docs/pharosville/CHANGE_PLAYBOOK.md`
   - `docs/pharosville/TESTING.md`

5. For docs/process-only work, run:

   ```bash
   npm run validate:docs
   ```

For release-readiness claim, run:

```bash
npm run check:release-readiness
```

## Required Conventions

- Work only in this repository unless explicitly authorized.
- Keep `PHAROS_API_KEY` server-side only.
- Ensure `PHAROS_API_KEY` is discoverable for local `/api/*` dev proxy from one of: current `.env.local`, main worktree `.env.local`, `.git/pharosville.env.local`, or shell env.
- Browser must use same-origin `/api/*` (no client cross-origin API calls).
- Keep world runtime unmounted below `720x360`.
- Use `agents/` for plans and handoff artifacts.
- Use `outputs/` for temporary screenshots, renders, and generation scratch files.

## Change-Type Command Lanes

- Docs/process only:

  ```bash
  npm run validate:docs
  ```

- Mixed or unknown change scope (auto-select lane):

  ```bash
  npm run validate:changed
  ```

- World/data semantics:

  ```bash
  npm test -- src
  ```

- Asset/visual work:

  ```bash
  npm run check:pharosville-assets
  npm run check:pharosville-colors
  npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"
  ```

- Release-level confidence:

  ```bash
  npm run validate:release
  ```

## Worktree And Plan Shortcuts

- Create and bootstrap a new worktree:

  ```bash
  npm run worktree:new -- <name> --branch <branch-name> --install
  ```

- Run full one-shot bootstrap (optional worktree + install + key setup + smoke + onboard):

  ```bash
  npm run agent:init -- [worktree-name] --branch <branch-name> --install
  ```

- Create a dated plan scaffold in `agents/`:

  ```bash
  npm run agent:plan:new -- <slug>
  ```

## High-Risk Mistakes To Avoid

- Exposing `PHAROS_API_KEY` through client code, docs, fixtures, or logs.
- Treating old `agents/*plan*.md` files as authoritative over `CURRENT.md`.
- Updating visual baselines for unintentional drift.
- Adding runtime references to remote/prototype sprite URLs.
- Encoding analytical meaning only in canvas without detail-panel and accessibility-ledger parity.
