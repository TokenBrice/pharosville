# PharosVille reboot — exploration brief (2026-10-13)

## Operator ask

Previous directions (Garden Observatory on `main`, Tidal Observatory, Pharos Inlet in
`.worktrees/inlet` / `feat/pharos-inlet`) "lead nowhere interesting". Prepare a comprehensive
revamp / redo-from-scratch plan. Execution happens later in "ultracode" (multi-agent) mode.

Targets, verbatim intent:
- Stunning visuals, state of the art of what can run in a browser in Oct 2026.
- Informative: a representation of Pharos Watch (stablecoin analytics) data.
- An actual lighthouse.
- Beautiful sea and sky.
- Overall a beautiful, coherent and neat experience.
- Reference bar: ClaudeVille (`/home/ahirice/Documents/git/claude-ville`, read-only) — an isometric
  pixel-art island village visualising AI-agent activity. Different theme, "works so much better".
  Goal: PharosVille of ClaudeVille quality or better.
- Blender is promising, but only when Opus authors it (Opus renders were much better than GPT/Sol's).

## Prior material (read, do not redo)

- `agents/pharosville-revamp/` — 2026-10-13 reboot-vs-overhaul study: 02 codebase audit, 03 process
  history, 04 stack options, 05 device reach, 06 data inventory, 07 art direction, 08 Blender
  assessment, 10 recommendation (+11 review), 12 build architecture; beauty plates, spikes, captures.
  Its recommendation (Pharos Inlet, slim Three.js + Blender-baked plates, Japanese viewing garden)
  was built in `.worktrees/inlet` (branch feat/pharos-inlet, ~50 commits, mostly test/provenance/capture
  plumbing) and the operator now judges it uninteresting.
- Earlier decisions recorded there (mobile required, 16:9 only, leaders+flotillas, no artist) are
  NOT binding for this plan; flag where they matter.

## Repo facts

- Stack: React 19 + Three.js r186 (WebGL2), Cloudflare Pages + Pages Function proxy
  `functions/api/[[path]].ts`; `PHAROS_API_KEY` server-side only. `shared/**` holds data contracts.
- API allowlist: /api/stablecoins, /api/chains, /api/stability-index?detail=true, /api/peg-summary,
  /api/stress-signals, /api/safety-grades, /api/mint-burn-flows. Samples in
  `agents/2026-10-13-pharosville-reboot/prior-data/data/`.
- Local: Blender 5.2.2 at /usr/bin/blender, NVIDIA RTX 5070 Ti, Node 24. Dev server :5173.
- HARD RULE: never judge looks/perf via Playwright (SwiftShader). Real GPU = `npm run preview`.
- Do not modify `main` working-tree files (operator has uncommitted edits). Write only under
  `agents/2026-10-13-pharosville-reboot/`.

## Output conventions

- Deliverable at the path your task names under `agents/2026-10-13-pharosville-reboot/`.
- Evidence-first; mark unverified claims `[INFERENCE]`; cite file:line, commit or URL.
- Be opinionated: recommend, don't survey.
