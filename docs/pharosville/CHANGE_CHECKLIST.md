# PharosVille Change Checklist

Last updated: 2026-10-14

## Before editing

- Run `git status --short` and preserve unrelated work.
- Run `npm run onboard:agent`, then read the task-specific guide from
  `AGENT_ONBOARDING.md`.
- Confirm the change belongs to this standalone repository.
- Keep browser calls same-origin and `PHAROS_API_KEY` server-side.

## Keep these contracts

- One production world, The Harbour (`src/harbour/`), on one three.js WebGL2
  Engine; if WebGL2 cannot start the poster and guide stay up. No renderer flag
  or second graphics stack.
- The desktop gate (size tests on screen and window, never orientation) before
  data, three.js, GLBs and logo decoding.
- The world carries the meaning (PLAN D10/D11): no persistent numeral HUD; every
  reading the world encodes is also readable on demand (hover tag, side panel,
  ledger). Do not turn circuits or docking into transfer/issuer claims.
- Systems register through `src/harbour/systems.ts` (order = update order) and
  share uniforms and services through the Engine context; frame work does not
  create unbounded geometry, materials, textures, lights or timers, and every
  system disposes what it created.
- Same-origin media under `public/harbour/`, `/logos/` and `/chains/`;
  `npm run check:runtime-media` keeps them decodable.
- Bundle caps live in `scripts/bundle-budgets.mjs`; raise one only with a
  measured re-baseline and its cause.

## Validate proportionately

- Harbour logic: `npx vitest run src/harbour`
- Shell, gate and first paint: `npm test -- src/client.test.tsx` and `npm run check:viewport-gate`
- Browser DOM contract: `npm run test:visual`
- Look and frame time: `npm run preview` (real GPU only)
- Media: `npm run check:runtime-media`
- Docs: `npm run validate:docs`
- Mixed scope: `npm run validate:changed`

## Before handoff

- Inspect the diff and run `git diff --check`.
- State the checks run and the checks not run.
- Do not commit `dist/`, `test-results/`, `outputs/`, or local secrets.
- Do not deploy, push, tag, or publish a release without explicit authority.
- Versioned releases go through `RELEASES.md` and the protected workflow only.
