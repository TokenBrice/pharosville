# PharosVille Release Hardening Checklist

Last updated: 2026-07-14

## Production Readiness Sprint (Execution Checklist)

| Item | Owner | Due | Status | Acceptance Criteria | Commands / Proof |
| --- | --- | --- | --- | --- | --- |
| 1) Enforce merge gate on `main` | Repo admin | Immediate | Done | Branch protection/ruleset requires pull requests plus `typecheck`, `unit`, `guards`, `build`, `visual`, `visual-cross-browser`; approval count remains viable for the current collaborator count | `npm run check:branch-protection` |
| 2) Security headers policy rollout | Frontend + platform | Immediate | Done | CSP, HSTS, frame, referrer, COOP/CORP, permissions, X-Content-Type-Options returned on HTML and API responses | `npm run smoke:live -- --url https://pharosville.pharos.watch` (security assertions enabled) |
| 3) Security header verification | Security | Immediate | Done | Policy + runtime response header checks are codified and runnable in command form | `npm run check:security-headers` |
| 4) Observability + alerting | Platform | Immediate | In progress | Production monitors alert on `/api/*` 5xx, timeout/upstream `502`, and post-deploy or scheduled smoke failures | `docs/pharosville/OBSERVABILITY.md` |
| 5) Doc drift cleanup | Docs owner | Immediate | Done | Live docs aligned to runtime budgets and current manifest source of truth; stale limits removed | `docs/pharosville/ASSET_PIPELINE.md`, `docs/pharosville/TESTING.md`, `docs/pharosville/RUNTIME_FACTS.md`, `docs/pharosville/OPERATIONS.md` |
| 6) Broader-browser accessibility smoke | QA | Ongoing | Done | Accessibility lane runs on Chromium + Firefox without screenshot drift | `npm run test:visual:cross-browser` + `npm run test:visual:dist:accessibility` |
| 7) Scheduled live smoke | Platform | Immediate | Done | GitHub canary smoke runs on a 30-minute schedule and manual dispatch; external monitoring is optional if operations requires independence from GitHub Actions | `.github/workflows/canary-smoke.yml`, `docs/pharosville/OBSERVABILITY.md` |
| 8) Release sign-off | Release owner | Before production release | Enforced | Runtime readiness passes from a clean tree; protected merge and remote release records are independently auditable | `npm run check:release-readiness` + `npm run check:release-admin` |
| 9) GitHub Release publication | Release owner | Every version | Done | A green `main` deploy triggers the workflow that creates the annotated semantic tag and GitHub Release; daily audit detects drift | `.github/workflows/release.yml`, `docs/pharosville/RELEASES.md`, `npm run check:github-releases` |

## Sign-off

1. Branch protection/ruleset and remote release records pass `npm run check:release-admin`.
2. Security header policy + verification checks pass.
3. Documented budgets/limits updated and reviewed.
4. Cross-browser accessibility smoke passes.
5. Post-deploy job runs security headers and full smoke against the exact Pages deployment; the canary owns canonical-host availability.
6. Scheduled canary smoke is configured; external monitoring is tracked separately if operations require it.
7. Final command lane passes: `npm run check:release-readiness`.
8. Version declarations are published only by `.github/workflows/release.yml`.
