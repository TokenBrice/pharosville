# Execution rules — prettier lanes (read fully before starting)

Plan: `/home/ahirice/Documents/git/pharosville/agents/claudeville-prettier/PLAN.md` (operator decisions in §5 are
FINAL). Source reports `01`–`12-*.md` sit beside it: read the ones your lane cites for the detailed design, file
anchors and costs. Repo rules: `AGENTS.md` / `CLAUDE.md` in your worktree. The code is the truth; reports can be
slightly off — verify before building on a claim.

## Where you work

- You own ONE git worktree at `/home/ahirice/Documents/git/pharosville/.worktrees/pv-<lane>` on branch
  `prettier/<lane>` (branched from `feat/prettier`). Work and run every command there, with absolute paths.
  Never edit the main checkout or another lane's worktree (reading them is fine). Deps are installed.
- Several lanes run AT THE SAME TIME in other worktrees. Your branch will later be merged with theirs, so
  keep diffs surgical (see "Hot files").

## Dev server and looking at the picture

- Start your OWN dev server from your worktree, in the background: `npx vite --port <your port> --strictPort`.
  Kill only that process when you finish.
- Captures ONLY via the real-GPU shared headless Chrome:
  `node scripts/harbour/shot.mjs --url "http://localhost:<port>/?t=<hour>[&params]" --out outputs/<lane>/<name>.png --seconds 3`
  (`outputs/` is gitignored). It serialises captures across all lanes, so it may wait; be patient and batch.
  Budget about 25 captures. NEVER launch Playwright, Chromium or Chrome yourself; never a headed browser.
  Blender only headless (`blender -b ...`). Repeat these rules to any helper you spawn.
- LOOK at every PNG you produce (Read tool) and judge it with an art director's eye: calm, restraint, crafted
  miniature, value hierarchy (the Pharos stays the hero). Capture before and after for each visual item at the
  hours and states where it matters (useful params: `t`, `view=heart|overview`, `cam=x,y,z,dist,pitch`,
  `season`, `month`, `dews`, `psi`, `psiScore`, `stale`, `offpeg`, `rainbow`, `weather`, `simspeed`; grep
  `searchParams.get` for the rest). Up to 2 tuning loops per item; when unsure, go subtler.
- Frame times are NOT trustworthy now (other lanes load the machine). Do not claim fps. Report estimated
  shader/draw/tri/byte cost instead; the orchestrator measures on a quiet machine at integration.

## Truth and calm (non-negotiable)

- D11: any new analytical cue needs a named source field, a stated threshold, a hover fact and/or panel line
  in the same words, and a unit test for the threshold. Decorative things stay decorative and never respond
  to data. Fog = stale data ONLY. Beam = PSI. Weather = DEWS. Sea state = off-peg share. Never re-map a signal.
- Reduced motion must still or skip every new motion. Stale or unavailable data → neutral pose, never a "good" one.
- Add a dev URL param for any new state you need to test (e.g. `?front=1`, `?meteors=perseids`), following the
  existing `searchParams.get` pattern. Defaults must be the production behaviour.
- Do NOT edit `CHANGELOG.md` or the Ledger legend array (`src/harbour/ui/Ledger.tsx`). Instead write your
  user-facing changelog bullets and any legend lines to
  `agents/claudeville-prettier/exec/<lane>.md` IN YOUR WORKTREE (commit it); the orchestrator integrates them.

## Hot files (several lanes touch them)

`fleet/fleet-material.ts`, `fleet/fleet-system.ts`, `ocean/ocean-material.ts`, `world/materials.ts`,
`engine/post.ts`, `engine/uniforms.ts`, `beam/beam-system.ts`, `ui/Panel.tsx`, `ui/facts.ts`, `systems.ts`,
`sim/sim.ts`. In these: make localized, additive hunks; put new GLSL in new named functions/chunks (ideally in a
new file you own, imported where needed); never reformat, reorder, rename or delete existing code you don't need
to change. Prefer new files for new systems.

## Commits

- Commit on your branch after each coherent item: `git add <explicit paths>` (never `-A` or `.`), message
  `<lane>: <what>` with a short body, ending with the trailer line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never push, merge, rebase, reset other work, tag, or switch branches. Never use `git stash`.
- Do not commit `outputs/`, `dist/`, screenshots, or env files. Binary runtime assets (GLB/textures) only if your
  lane owns them and `npm run check:runtime-media` passes.

## Keep green before each commit (smallest relevant set) and before reporting (all)

`npx tsc --noEmit` · `npx eslint <changed files> --max-warnings=0` · `npx vitest run src/harbour` ·
when assets or bundle change: `npm run check:harbour-contracts`, `npm run check:runtime-media`,
`npm run build && npm run check:bundle-size`.

## If something is wrong

If an item proves infeasible, ugly on real frames, or would bend a truth rule, drop it and say why. Never
fake a result. If you are blocked by another lane's area, implement the minimal add-only hook you need and
note it as a merge hazard.

## Final report (your last message, under 300 words, no file dumps)

Items done (with commit SHAs) · items dropped and why · files touched (hot files flagged) · estimated iGPU cost ·
new URL params · best before/after capture paths · open issues and merge hazards.
