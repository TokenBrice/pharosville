# Need for Speed — implementation brief (shared by every implementation agent)

Branch: `perf/need-for-speed` in `/home/ahirice/Documents/git/pharosville` (main checkout). Several agents edit this
working tree AT THE SAME TIME, each owning a disjoint set of files.

## Hard rules
- Edit ONLY the files your task lists as owned (plus new files you create under the directories it names). If you
  need a change in a file you do not own, message its owner (`write agent://<Name>`) or note it in your final reply.
  Never revert, reformat or "fix" other agents' edits.
- Do NOT run gates: no `npm run typecheck|lint|test|build|validate*`, no `npx vitest`, no eslint/prettier, no
  formatters. The orchestrator verifies after the phase. (Reading code, `node -e` one-off probes and writing new
  test files is fine.) Never `npm run build` (it rewrites tracked `public/harbour/**/*.gz`).
- Do NOT commit, stash, reset, checkout or switch branches. Do NOT touch `dist/`.
- No real-GPU captures unless your task explicitly asks; then only via `npm run preview -- …` (shared lock).
- The scenery is the product: every change must be pixel- and motion-identical unless the task says otherwise. No
  data-mapping changes, no renderer switch, CSP unchanged, desktop gate unchanged, sim routes byte-identical.
- Follow existing code style and patterns; minimal, surgical diffs; no speculative abstractions; remove code your
  change makes dead. Update/extend tests in the same area when behaviour contracts change (don't run them).
- Plan: `agents/2026-10-19-need-for-speed/PLAN.md`. Evidence: `p1/*.md`, `p2/*.md` (reports cite file:lines and
  give mechanisms). Prototype diffs: `outputs/need-for-speed/<spike>/spike.patch` — use as reference, not verbatim
  (spikes contain throwaway URL flags and diagnostics that must not ship).

## Final reply (required)
Changed files list; what each change does and the invariant that keeps scenery identical; any cross-owner request;
anything left undone and why. Keep it under 40 lines.
