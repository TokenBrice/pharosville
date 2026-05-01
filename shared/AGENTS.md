# Shared Agent Guide

Applies to `shared/**`.

## Scope

- `shared/**` is copied runtime-neutral contract/data logic used by standalone PharosVille.
- Treat copied shared data and helper modules as an import boundary for this app, not as the full host repository source of truth.
- Do not import from `src/**`, `functions/**`, or local sibling repositories.
- Do not assume host-repo-only scripts, docs, Worker code, or deployment settings exist here.

## Rules

- `shared/lib/**` must stay runtime-neutral and avoid frontend-only or Worker-only globals unless explicitly abstracted.
- Import shared runtime logic as `@shared/lib/...` from frontend code; import shared type/schema modules as `@shared/types...`. Avoid relative cross-boundary imports.
- Classification labels and colors live in `shared/lib/classification.ts`; do not redefine them locally.
- Keep PharosVille API contract changes aligned with `shared/types/pharosville.ts` and `shared/lib/pharosville-api-contract.ts`.

## Common Checks

- `npm run typecheck`.
- `npm run build` when exported types or shared imports change.
- `npm test` for the standalone app's default suite.
- Focused shared tests may be run by explicit file path after confirming they are standalone-safe; broad `shared/**` host-repo test sweeps are not part of the default PharosVille gate.
