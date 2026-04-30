# PharosVille Repo Health Plan

Last updated: 2026-04-30

This handoff captures the 360-degree repo scan after splitting PharosVille out of `pharos-watch`. It is meant to support parallel agent work without losing ordering, blockers, or validation expectations.

## Current Baseline

Validated locally:

- `npm run validate` passed: typecheck, 151 Vitest tests, asset check, color check, build.
- `npm run test:visual` passed: 13/13 Playwright tests.
- Production build warns that `pharosville-desktop-data` is large: `866.81 kB` minified, `232.62 kB` gzip.

Known local state:

- During audit, dirty tracked files were observed in `.env.example`, `shared/AGENTS.md`, and `vite.config.ts`; inspect current `git status --short` before acting because the tree may keep changing.
- At handoff verification, current dirty/untracked items were `shared/AGENTS.md`, `AGENTS.md`, `CLAUDE.md`, and `agent/`.
- Do not revert or overwrite those changes unless the operator explicitly asks.

## Severity Summary

| Severity | Issue | Primary refs | Desired outcome |
|---|---|---|---|
| Critical | Ignored local `.env.local` contains live-looking credential material. Values were not printed. | `.env.local`, `.gitignore`, `AGENTS.md` | Rotate/revoke live credentials out of band, update Cloudflare secret, delete local live secret material, document safe local secret handling. |
| High | API proxy accepts any HTTPS `PHAROS_API_BASE` before sending `X-API-Key`. | `functions/api/[[path]].ts` | Exact upstream origin pinning, timeout, controlled upstream failure response, expanded proxy tests. |
| High | Source-of-truth docs still point to old Next `src/app/pharosville/*` layout and nonexistent scripts. | `docs/pharosville/CURRENT.md`, `docs/pharosville/TESTING.md`, `docs/pharosville/CHANGE_CHECKLIST.md`, `docs/pharosville-page.md` | Docs match standalone Vite layout and executable commands. |
| High | Release/deploy gate is weaker than docs imply. | `package.json`, `.github/workflows/deploy-cloudflare.yml`, `playwright.config.ts` | Clear dev vs release validation, visual policy, no dirty deploy bypass, built-artifact visual lane. |
| High | Standalone app emits relative analytical links to routes it does not own. | `src/systems/detail-model.ts`, `src/desktop-only-fallback.tsx` | Central route-link adapter; links go to canonical `https://pharos.watch/...` unless implemented locally. |
| High | Copied shared tests exist but are excluded from default Vitest. | `vitest.config.ts`, `shared/AGENTS.md`, `shared/lib/__tests__/*` | Explicit shared test strategy and docs. Do not blindly include all host-repo tests without triage. |
| Mid | Broken/missing asset reference for at least `rootstock.png`. | `shared/lib/chains.ts`, `public/chains/` | Asset/logo validation covers chain and logo references; broken references fixed. |
| Mid | Desktop chunk is large due to broad shared-data imports. | `src/systems/pharosville-world.ts`, `shared/lib/stablecoins/registry.ts`, `shared/lib/cemetery-merged.ts` | Measured bundle budget and compact PharosVille metadata path. |
| Mid | Renderer/runtime files are large edit surfaces. | `src/renderer/world-canvas.ts`, `src/pharosville-world.tsx` | Gradual layer/hook extraction after release blockers are resolved. |

## Execution Rules

- Always run `git status --short` before editing.
- Preserve existing dirty work. If a dirty file must be touched, inspect it first and work with the existing edits.
- Keep changes inside `/home/ahirice/Documents/git/pharosville`.
- Do not print, copy, or commit credential values.
- Treat visual screenshot updates as intentional-only changes after inspecting diffs.
- Keep Phase 0 through Phase 3 as the health baseline before claiming the split is stable.

## Task Tracker

Status key: `Todo`, `In Progress`, `Blocked`, `Done`, `Deferred`.

### Phase 0 - Preflight And Containment

| ID | Status | Priority | Task | Dependencies | Parallelization notes | Acceptance checks |
|---|---|---:|---|---|---|---|
| P0.1 | Done | Critical | Run `git status --short`, record dirty files, and identify files each worker intends to touch. | None | Every worker starts here. | Dirty work documented; no unrelated changes reverted. |
| P0.2 | Blocked | Critical | Rotate/revoke any live credentials found in ignored local env material, including `PHAROS_API_KEY` and any real asset-generation credentials. | Operator access to credential systems | Operational task, not repo code. Can run in parallel with code hardening once assigned. | Cloudflare Pages `PHAROS_API_KEY` updated; old key revoked; no live secrets remain in repo-local env files. |
| P0.3 | Todo | Critical | Delete or replace local live `.env.local` material with safe placeholders after rotation. | P0.2 | Do not inspect or print values. | No live values in local env files; `.env.example` contains only placeholders and safe docs. |
| P0.4 | Done | High | Add committed-file secret scanning with generated/dependency exclusions and safe fixture strategy. | None | Can run in parallel with Phase 1 code if file ownership is separate. | Scanner runs in CI; excludes `node_modules`, `dist`, reports, and generated artifacts; does not false-positive on test fixtures. |

### Phase 1 - Security And API Contract

| ID | Status | Priority | Task | Dependencies | Parallelization notes | Acceptance checks |
|---|---|---:|---|---|---|---|
| P1.1 | Done | High | Pin `PHAROS_API_BASE` to exact `https://api.pharos.watch` origin before attaching `X-API-Key`. Reject wrong protocol, hostname variants, username/password, custom port, path, query, and hash. | P0.1 | Own `functions/api/[[path]].ts` and proxy tests. | Malicious/invalid bases fail closed before upstream fetch. |
| P1.2 | Done | High | Add upstream timeout and controlled `502` response for fetch failures. | P1.1 | Same owner as P1.1. | Timeout/rejected fetch tests pass; no internal details leaked. |
| P1.3 | Done | High | Add endpoint drift protection between proxy allowlist and PharosVille API contract. Use a lightweight path list or test; avoid schema-heavy Function imports. | P0.1 | Can run beside P1.1 if interface agreed first. | Test fails if six endpoint paths diverge. |
| P1.4 | Done | High | Expand `functions/api/proxy.test.ts`: all six endpoints, exact query rejection, non-GET 405, missing env, invalid base, header filtering, fetch failure, neutral fake key. | P1.1, P1.2, P1.3 | Same owner as proxy hardening. | Focused proxy test file passes and covers failure modes. |
| P1.5 | Done | Mid | Guard `apiFetch*` so client code rejects absolute URLs and non-`/api/` paths. | P0.1 | Separate frontend/API owner; add focused unit tests. | Tests prove same-origin invariant. |

### Phase 2 - Release And Deployment Pipeline

| ID | Status | Priority | Task | Dependencies | Parallelization notes | Acceptance checks |
|---|---|---:|---|---|---|---|
| P2.1 | Done | High | Decide visual-test gating policy: every PR, main only, or deploy-impacting paths. | Team/operator decision | Must precede CI script changes. | Policy written in README/operations docs and reflected in workflow. |
| P2.2 | Done | High | Add no-reuse visual lane and built-artifact visual lane using a real alternate Playwright config or env-driven `webServer`. | P2.1 | Test owner can work independently from proxy owner. | `test:visual:no-reuse` and production visual script run the intended server, not stale dev server. |
| P2.3 | Done | High | Add `validate:release` with typecheck, Vitest, asset/color checks, build, and selected visual lane. Keep fast `validate` clearly documented. | P2.2 | Own `package.json` and docs together. | `npm run validate:release` is executable and matches docs. |
| P2.4 | Done | High | Remove `--commit-dirty=true` from normal deploy and GitHub deploy together; ensure CI deploys the artifact that passed validation or runs full release validation in deploy job. | P2.3 | Own `package.json` and `.github/workflows/deploy-cloudflare.yml` atomically. | No normal deploy path bypasses validation or dirty-tree protection. |
| P2.5 | Done | Mid | Expand `scripts/smoke-live.mjs` to cover `/`, all six allowlisted endpoints, proxy marker/header, minimal payload shape, timeouts, and blocked variants. | P1.3 | Can run after endpoint list exists. | Live smoke fails on missing endpoint, missing proxy marker, or unexpectedly allowed path/query. |
| P2.6 | Done | Low | Add `.nvmrc` / `.node-version` and `packageManager` matching npm lockfile; document Node 24 local setup. | None | Low conflict risk. | Local and CI Node expectations are explicit. |

### Phase 3 - Documentation And Agent Hygiene

| ID | Status | Priority | Task | Dependencies | Parallelization notes | Acceptance checks |
|---|---|---:|---|---|---|---|
| P3.1 | Done | High | Reconcile source-of-truth docs first: `CURRENT.md`, `TESTING.md`, `CHANGE_CHECKLIST.md`, and `docs/pharosville-page.md`. | P0.1 | Docs owner can start immediately; coordinate script names with P2 owner. | No stale `src/app/pharosville/*` as live instructions. |
| P3.2 | Done | High | Replace old Next/static-export language with actual Vite layout and root-domain behavior. | P3.1 | Same docs owner. | Docs point to `src/App.tsx`, `src/client.tsx`, `src/pharosville-desktop-data.tsx`, `src/pharosville-world.tsx`, `src/systems/**`, `src/renderer/**`. |
| P3.3 | Done | High | Remove or replace nonexistent command references: `seo:check`, `test:merge-gate`, `check:verified-doc-links`, `check:doc-source-paths`, `check:harbor-palette`, unless scripts are intentionally added. | P2.3 | Same docs owner; wait for final script names. | Every documented `npm run` command exists. |
| P3.4 | Done | Mid | Add `docs/pharosville/OPERATIONS.md`: Pages setup, secrets, local dev vs Pages Functions preview, deploy, smoke, rollback, credential rotation. | P2.4, P2.5 helpful | Can draft early, finalize after pipeline changes. | Operators can deploy and rollback without host-repo context. |
| P3.5 | Done | Mid | Fix `shared/data/stablecoins/AGENTS.md` for copied/read-only shared data or mark host-repo instructions historical/not executable here. | P0.1 | Watch existing dirty `shared/AGENTS.md`; inspect before editing. | Shared agent docs no longer point to missing host scripts as required local steps. |
| P3.6 | Done | Mid | Replace exact asset-count prose with manifest/validator-derived guidance or current counts. | None | Low conflict risk. | Asset docs no longer contradict current 32 total / 22 critical / 10 deferred state. |
| P3.7 | Done | Mid | Add lightweight doc path/script checker and run it in CI. | P3.1-P3.3 | Can be separate script owner. | CI catches nonexistent local paths and documented `npm run` scripts. |

### Phase 4 - Production Confidence

| ID | Status | Priority | Task | Dependencies | Parallelization notes | Acceptance checks |
|---|---|---:|---|---|---|---|
| P4.1 | Done | High | Add route-link adapter and make analytical links absolute to `https://pharos.watch/...` unless routes are implemented locally. | P0.1 | Frontend owner; independent from deploy pipeline. | Tests cover generated links; no broken same-origin host-site links remain. |
| P4.2 | Done | High | Decide shared test strategy. Start with PharosVille-imported shared modules and API contract tests; do not blindly add all host-repo tests to default `npm test`. | P0.1 | Test owner; coordinate with docs owner. | `shared/AGENTS.md` and Vitest config agree on what runs. |
| P4.3 | Done | Mid | Tighten desktop-gate Playwright assertions: below gate, zero `/api/*`, `/_site-data/*`, manifest, sprite/logo requests, and no desktop dynamic chunk import. | P2.2 | Visual test owner. | Fallback tests fail on world runtime/data loading below gate. |
| P4.4 | Done | Mid | Extend asset/logo validation for `shared/lib/chains.ts`, `data/logos.json`, cemetery/stablecoin references; fix missing `rootstock.png` path or asset. | P0.1 | Asset owner. | Validator catches missing referenced public assets. |
| P4.5 | Deferred | Low | Consider stricter color/palette validation with explicit waivers. | P3.1 | Do after blockers. | Palette drift becomes intentional and documented. |

### Phase 5 - Maintainability And Bundle Work

| ID | Status | Priority | Task | Dependencies | Parallelization notes | Acceptance checks |
|---|---|---:|---|---|---|---|
| P5.1 | Todo | Mid | Measure bundle composition before refactoring. Identify exact contribution of shared registry, cemetery data, and logo maps. | P2.3 | Performance owner. | Bundle report stored or summarized; target budget proposed. |
| P5.2 | Todo | Mid | Replace browser imports of full stablecoin/cemetery registries with compact generated/fetched PharosVille metadata if measurement supports it. | P5.1 | Larger data-model task; avoid parallel edits to world builder. | Desktop chunk materially smaller; behavior tests unchanged. |
| P5.3 | Todo | Mid | Add bundle budget tracking in CI. | P5.1 | Can follow measurement. | Build fails or warns on agreed budget regression. |
| P5.4 | Deferred | Mid | Refactor `src/renderer/world-canvas.ts` gradually into layer modules while preserving draw order and screenshots. | P2-P4 stable | High visual risk; one layer per PR/agent. | Visual tests unchanged except intentional screenshot updates. |
| P5.5 | Deferred | Low | Split `src/pharosville-world.tsx` into hooks: `useWorldAssets`, `useWorldCamera`, `useWorldFrame`, `useWorldSelection`, `usePharosvilleDebug`. | P5.4 optional | Keep behavior-preserving. | Unit/visual tests pass; component becomes composition shell. |
| P5.6 | Deferred | Low | Add runtime validation/generated types for asset manifests and logo maps; narrow `ShipNode` backend payload coupling with `ShipAnalyticsSnapshot`. | P4.4 | Data-model owner. | Renderer/detail consumers no longer depend on full backend payload shape. |

## Suggested Parallel Workstreams

| Workstream | Owns | Can start after | Avoid touching |
|---|---|---|---|
| Security/proxy | P1.1-P1.4, P2.5 | P0.1 | Docs rewrites except operations details. |
| Release/CI | P2.1-P2.6 | P0.1, policy decision | Proxy code unless coordinating endpoint list. |
| Docs/agent hygiene | P3.1-P3.7 | P0.1 | Existing dirty files without inspection. |
| Frontend correctness | P1.5, P4.1, P4.3 | P0.1 | Renderer refactors. |
| Asset/test quality | P4.2, P4.4, P4.5 | P0.1 | Shared tests outside agreed scope. |
| Bundle/maintainability | P5.1-P5.6 | Phases 0-4 mostly stable | Release/security files. |

## Minimum Health Gate

Do not claim the split is healthy until these are done:

- P0.2 and P0.3 accepted out of band.
- P1.1 through P1.5 complete.
- P2.1 through P2.5 complete.
- P3.1 through P3.7 complete.
- P4.1 and P4.2 complete.

## Validation Targets

Development validation:

```bash
npm run validate
```

Release validation, once implemented:

```bash
npm run validate:release
```

Current broad manual validation until release scripts are fixed:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Live smoke, after secret rotation and script expansion:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```
