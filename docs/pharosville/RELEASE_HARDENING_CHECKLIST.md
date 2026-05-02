# PharosVille Release Hardening Checklist

Last updated: 2026-05-02

## Production Readiness Sprint (Execution Checklist)

| Item | Owner | Due | Status | Acceptance Criteria | Commands / Proof |
| --- | --- | --- | --- | --- | --- |
| 1) Enforce merge gate on `main` | Repo admin | Immediate | Done | Branch protection/ruleset requires `typecheck`, `unit`, `guards`, `build`, `visual` before merge | `npm run check:branch-protection` |
| 2) Security headers policy rollout | Frontend + platform | Immediate | Done | CSP, HSTS, frame, referrer, COOP/CORP, permissions, X-Content-Type-Options returned on HTML and API responses | `npm run smoke:live -- --url https://pharosville.pharos.watch` (security assertions enabled) |
| 3) Security header verification | Security | Immediate | Done | Policy + runtime response header checks are codified and runnable in command form | `npm run check:security-headers` |
| 4) Observability + alerting | Platform | Immediate | In progress | Production monitors alert on `/api/*` 5xx, timeout/upstream `502`, scheduled smoke failures | `docs/pharosville/OBSERVABILITY.md` + workflow incident behavior |
| 5) Doc drift cleanup | Docs owner | Immediate | Done | Live docs aligned to runtime budgets and current manifest source of truth; stale limits removed | `docs/pharosville/ASSET_PIPELINE.md`, `docs/pharosville/TESTING.md`, `docs/pharosville/CURRENT.md`, `docs/pharosville/OPERATIONS.md` |
| 6) Broader-browser accessibility smoke | QA | Ongoing | Done | Accessibility lane runs on Chromium + Firefox without screenshot drift | `npm run test:visual:cross-browser` + `npm run test:visual:dist:accessibility` |
| 7) Scheduled live smoke | Platform | Before each production deploy | In progress | Scheduled smoke executes in CI and alerts on regressions | `.github/workflows/pharosville-scheduled-smoke.yml` with 4h cadence |
| 8) Release sign-off | Release owner | Before production release | Not started | All prior items complete and production readiness lane passes from clean tree | `npm run check:release-readiness` |

## Sign-off

1. Branch protection/ruleset verified.
2. Security header policy + verification checks pass.
3. Documented budgets/limits updated and reviewed.
4. Cross-browser accessibility smoke passes.
5. Scheduled smoke workflow, incident automation, and runbook are active.
6. Post-deploy release gate runs `npm run check:release-readiness`.
7. Final command lane passes: `npm run check:release-readiness`.
