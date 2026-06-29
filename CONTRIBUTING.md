# Contributing To PharosVille

PharosVille is a public standalone app, but it also fronts a production stablecoin analytics surface. Small, well-evidenced changes are much easier to review and ship than broad rewrites.

## Good Contribution Lanes

- Documentation fixes, examples, and operational clarity.
- Visual regressions with screenshots and viewport/browser context.
- Accessibility, performance, and UI quality fixes that preserve the desktop gate.
- Data/signal reports with stablecoin or chain names, timestamps, and source links.
- Asset-pipeline fixes that keep runtime assets local and manifest-backed.

Feature ideas should start as an issue before implementation when they change PharosVille visual semantics, data mapping, or maintenance cost.

## Before Editing

1. Read [AGENTS.md](./AGENTS.md).
2. Read [Agent onboarding](./docs/pharosville/AGENT_ONBOARDING.md).
3. Read only the task-specific docs named by the onboarding guide.
4. Keep changes narrow and avoid unrelated refactors or formatting sweeps.
5. Update user-facing docs when route behavior, operations, validation, data semantics, or visual contracts change.

Important project rules:

- Browser code calls same-origin `/api/*` only.
- `PHAROS_API_KEY` must stay server-side and must never be exposed in browser-visible env vars, docs, fixtures, logs, query strings, or static assets.
- Preserve the desktop gate. Unsupported viewports must not mount the world runtime or fetch world data.
- Runtime art must come from local assets under `public/pharosville/assets/` and the manifest.
- Do not commit generated `dist/`, `test-results/`, local env files, or scratch artifacts.

## Local Setup

Use Node 24:

```bash
npm ci
npm run onboard:agent
npm run dev
```

The maintained local dev server is `http://localhost:5173/`.

For local data, initialize the shared key helper and smoke the proxy before debugging missing ships or dock data:

```bash
npm run setup:local-api-key
npm run smoke:api-local
npm run smoke:dev-proxy
```

Do not commit local secret files.

## Checks

Use focused checks while iterating. For mixed or uncertain scope:

```bash
npm run validate:changed
```

Docs-only changes:

```bash
npm run validate:docs
```

Before release-level confidence:

```bash
npm run validate:release
```

For deployed changes:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

## Pull Requests

- Use a descriptive title and explain why the change is needed.
- Link related issues.
- Include screenshots or video for UI/canvas changes.
- List validation commands and any skipped checks.
- Call out risk around data mapping, assets, viewport gating, performance, or secrets.

Do not include API keys, private tokens, upstream credentials, or operational secrets in issues, pull requests, screenshots, logs, docs, or fixtures.
