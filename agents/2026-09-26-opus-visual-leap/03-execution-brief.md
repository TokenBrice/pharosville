# Hour-Print — execution brief (every implementation agent reads this first)

Repo: `/Users/ahirice/Documents/git/pharosville`, branch `feat/hour-print`. The plan is
`agents/2026-09-26-opus-visual-leap/01-implementation-plan.md` (read §1, §1.1 "The hand", §3 rulings, §4.1
decisions, and the rows you own in §5). The lane reports in `agents/2026-09-26-opus-visual-leap/reviews/`
hold the exact technique, parameters and `file:line` anchors for each idea ID — read the sections your task
cites before coding. `AGENTS.md` hard rules apply (API key server-side, same-origin `/api/*`, desktop gate).

## Rules

- **Own only the files your task lists.** Other agents are editing other files in the same working tree at
  the same time. If you must touch a file you do not own, keep the edit minimal and local, re-read it
  immediately before editing, and say so in your report. Never reformat or reorder code you did not change.
- **Skip every gate**: do not run tests, typecheck, lint, builds, formatters, `npm run preview`, or git
  commands that change state (no commit, no stash, no checkout). The orchestrator runs gates once for the
  whole wave and sends fix-ups.
- **Tests**: update the tests that cover the code you change. Tests that pin incidental values, shader
  source text or wording that your change makes obsolete are **deleted, not re-pinned**. Behaviour contracts
  (hit-testing, reduced-motion zero-RAF, a11y ledger/DOM parity, budgets, determinism, deep links) are kept
  and updated to the new behaviour. Add a test only for a genuinely uncertain edge.
- **Data truth**: any change to what a visual encodes must update, in the same change, the matching
  `visual-cue-registry.ts` entry, detail rows and accessibility-ledger text. Colour is never the only carrier.
  Reduced motion keeps a meaningful static state.
- **Budgets**: no new textures (whole-map census is 72/72); no new vertex attributes on the fleet sail
  program (16/16); no per-frame per-object JS unless your task says so; no new draw calls unless your task
  budgets them.
- **Immutable palette anchors**: `lantern_warm`, `vermillion`, `sail_teal`, `sail_red` unchanged.
- **No placeholders, TODOs or stubs.** Finish the reachable work; if something is genuinely blocked, stop
  and say exactly what is missing.

## Report (your final message)

1. Files changed (with one line each on what changed).
2. Plan rows completed; anything not completed and why.
3. Tests changed (deleted / updated / added) and why.
4. Risks the orchestrator should check at the gate (visual, perf, contract), with the capture hash to look at.
