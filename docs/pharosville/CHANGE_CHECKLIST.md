# PharosVille Change Checklist

Last updated: 2026-09-27

## Before editing

- Run `git status --short` and preserve unrelated work.
- Run `npm run onboard:agent`, then read the task-specific guide from
  `AGENT_ONBOARDING.md`.
- Confirm the change belongs to this standalone repository.
- Keep browser calls same-origin and `PHAROS_API_KEY` server-side.

## Keep these contracts

- One production Three.js renderer; a DOM static overview on renderer/GPU
  failure; no renderer flag or Canvas fallback.
- The desktop landscape gate before data, Three.js, models, and logo decoding.
- Analytical meaning in systems plus DOM detail/ledger parity, never pixels
  alone. Do not turn routes or docking into transfer/issuer claims.
- One shared motion sample for drawing, hit testing, following, selection, and
  debug; one route-owned RAF; a deterministic no-RAF reduced-motion frame.
- World rebuilds dispose old renderer-owned content; frame work does not create
  unbounded geometry, materials, textures, lights, loaders, or timers.
- Full-fleet composition is controlled by region placement and capacity, not by
  restoring the retired 20-ship cap.
- Same-origin media with deterministic fallbacks. Checked models change through
  generators, not binary edits.
- Garden Observatory comparisons report signed, owner-attributed JS gzip,
  draw-call, triangle, texture and logical-byte deltas under unchanged global
  caps; resource equality and a blanket no-new-textures rule are not required.
  Name the displaced salience or cost, charge shared assets once, and reconcile
  earned allowances against measured totals rather than spending headroom twice.
  Keep the existing fleet sail-program attribute ceiling (16/16) and admit
  every discrete event through the director's attention budget. Any cap change
  belongs to the orchestrator and requires the approved evidence.
- Chrome colours come from the light score (`src/systems/chrome-air.ts`), never
  a day/night switch, and every text role stays AA
  (`src/systems/chrome-air.test.ts`).

## Validate proportionately

- World semantics: `npm test -- src/systems`
- Three.js or hit testing: `npm test -- src/three src/renderer`
- Browser visual/interaction: `npm run test:visual`
- Resource or performance: `npm run test:perf`
- Garden Observatory resource/device acceptance: follow the M5 Pro calibration protocol in `TESTING.md` ("M5 Pro calibration — Garden Observatory"); hardware evidence remains pending until its baseline/candidate matrix and long-session gates are recorded.
- Media: `npm run check:runtime-media`
- Viewport/import boundary: `npm run check:viewport-gate`
- Docs: `npm run validate:docs`
- Mixed scope: `npm run validate:changed`

## Before handoff

- Inspect the diff and run `git diff --check`.
- State the checks run and the checks not run.
- Do not commit `dist/`, `test-results/`, `outputs/`, or local secrets.
- Do not deploy, push, tag, or publish a release without explicit authority.
- Versioned releases go through `RELEASES.md` and the protected workflow only.
