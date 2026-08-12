# PharosVille Agent Onboarding

Last updated: 2026-07-24

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
- Keep world runtime unmounted unless both the device screen and the current VIEWPORT satisfy either the standard `900×720` size profile or the wide-laptop `1200×640` profile. Dimensions are sorted; do not gate on `(orientation: portrait)`, because CSS orientation is a viewport aspect test that blocks tall desktop windows with more room than wide ones it allows.
- Use `agents/` for plans and handoff artifacts.
- Use `outputs/` for temporary screenshots, renders, and generation scratch files.

## Task Routing

| Task | Read only if needed | First checks |
| --- | --- | --- |
| App shell, API proxy, metadata, viewport gate | `docs/pharosville/ARCHITECTURE.md`, `docs/pharosville-page.md` | `npm run validate:changed` |
| World model, data semantics, layout, motion | `docs/pharosville/VISUAL_INVARIANTS.md`, `src/systems/README.md` | `npm test -- src/systems` |
| Three.js renderer, hit testing, interaction | `docs/pharosville/THREEJS_AGENT_REFERENCE.md`, `docs/pharosville/ARCHITECTURE.md`, `docs/pharosville/TESTING.md` | focused unit test (`npm test -- src/three src/renderer`), then `npm run test:visual` |
| Lighthouse model or ship logos | `docs/pharosville/ASSET_PIPELINE.md` | `npm run check:garden-models` or focused sail tests |
| Reference generation | `docs/pharosville/ASSET_PIPELINE.md` | operator review; keep scratch in `outputs/` |
| Visual evidence, look, frame time | `docs/pharosville/TESTING.md` | `npm run preview` for anything you intend to LOOK at or quote a frame time from; `npm run test:visual` for the assertions |
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
- Judging the render or the frame time through a Playwright browser. Use `npm run preview` — it goes through the operator's own Chrome flags. (The correctness lane asks the bundled browser for hardware rendering outside CI so the gates can run at all; that does not make its frame times quotable.)
- Looking for committed screenshot baselines to regenerate. There are none — the visual lane asserts DOM state and telemetry, so a renderer change cannot put it in debt.
- Gating any viewport decision on `(orientation: portrait)`. It is a viewport aspect test, not a device test.
- Treating a changelog entry, `main` deploy, local tag, or manual GitHub Release as the complete versioned release path.
- Reintroducing a renderer switch or graphical fallback.
- Reintroducing an unreviewed runtime asset inventory or namespace.
- Adding runtime references to remote generation or prototype URLs.
- Encoding analytical meaning only in WebGL without detail-panel and accessibility-ledger parity.
