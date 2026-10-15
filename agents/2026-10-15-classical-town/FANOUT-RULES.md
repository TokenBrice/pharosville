# Fan-out rules (P3 / P4 / P5 / P7a run concurrently in ONE worktree)

Worktree: /home/ahirice/Documents/git/pharosville/.worktrees/harbour, branch restyle/classical. Brief: PLAN.md.
Approved language: G1 (verdicts.md, p2/G1-fix-board.jpg). Reference code: the P2 builders in civic/cv_civic.py
(build_customs, build_registry, build_stoa_office), civic/cv_works.py (build_mint), island/hb_town.py (classical
terrace lots), the kit in civic/cv_lib.py + island/nl_classical.py.

- NEVER launch a browser or pop a window. Runtime captures ONLY via `node scripts/harbour/shot.mjs` (one persistent
  headless real-GPU Chrome; it serialises captures). Blender only headless (`blender -b`). Repeat this rule to any
  subagent you spawn.
- Dev server: start your OWN on your assigned port (`npx vite --port <port> --strictPort`, background) and kill only
  that one when done. P3=5192, P4=5193, P5=5194, P7a=5195.
- Do NOT commit, stash, reset or checkout. The lead commits by path. Never revert files you didn't change.
- File ownership:
  - P3: civic/cv_civic.py, civic/cv_works.py, civic/cv_yard.py is NOT yours (P6), public/harbour/civic/*,
    src/harbour/civic/*, src/harbour/identity/*.
  - P4: island/hb_town.py, island/hb_dress.py (furniture parts only: lamps, cranes, bunting, benches, walls,
    pier-head beacons, reef daymark, windmill in hb_town), island/compose.py (text strings, pier-head lights),
    walkways (src/harbour/life/tools/export_walkways.py, public/harbour/walkways.json), audio/controller.ts text.
  - P5: island/hb_dress.py (vegetation parts only: trees, meadow, hedges), island/nl_kit.py tree builders,
    src/harbour/season/* if needed.
  - P7a: scripts/harbour/blender/hulls/* (new forms/rigs only, NOT the export into public/ yet), outputs.
  - Shared libs (cv_lib.py, nl_common.py, nl_classical.py, materials.ts): ADD-ONLY edits, re-read the file
    immediately before each edit, never rename/remove existing symbols.
- Island bake (build_island.py --export and the steps after it, PLAN §5.1) is shared by P4 and P5: wrap the whole
  rebuild sequence in `flock outputs/island-bake.lock -c '<commands>'`. Your bake will include the other agent's
  current work in progress; that is expected.
- Captures and boards go to agents/2026-10-15-classical-town/<phase>/. LOOK at every image. Max 2 fix loops after
  the first full pass.
- Keep green before reporting: `npx tsc --noEmit`, eslint on changed TS, `npx vitest run src/harbour`,
  `npm run check:harbour-contracts`, `npm run check:runtime-media`.
- Report under 250 words: what was built, tri/size deltas vs budgets, board path, files touched, open issues.
