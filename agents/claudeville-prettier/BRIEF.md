# PharosVille "prettier & more magical" sweep — shared brief

Date: 2026-10-24. Baseline: `main` @ v1.2.1 "Canvas Up" (classical Ptolemaic harbour, ancient fleet).
Orchestrator consolidates all vertical reports into `PLAN.md` in this folder.

## Goal

Find the most promising ideas to make PharosVille **prettier and more magical** without
breaking what makes it trustworthy. Ideation is grounded in the real code and real frames, not
generic "add bloom" advice. Each idea must name where it lands in `src/harbour/**`.

## Current look (real GPU, 1600×1000)

`shots/day.png` (t=11), `shots/dusk.png` (t=18.5), `shots/night.png` (t=22),
`shots/heart-day.png` (t=14, view=heart). LOOK at them before ideating.
Stats: ~1.26M triangles, GPU ≈1.2 ms/frame on an RTX 5070 Ti; p95 16.7 ms (vsync).

## Non-negotiables (from AGENTS.md, PRODUCT.md, reboot PLAN D1–D14)

- **D11 / data truth:** the world carries meaning, text only on demand. Any NEW analytical cue
  needs a source field, a hover/panel/ledger DOM equivalent, and must not lie. Decorative
  things must be clearly decorative (seasons, time of day are decorative; weather = DEWS stress
  band; fog = stale data ONLY; beam = Pharos Stability Index; Shoals = off-peg coins;
  hull family = peg currency; size = supply class; time docked per chain = supply share).
  Do not propose re-mapping an existing signal without saying so explicitly.
- **Anti-references:** generic crypto dashboard, neon, trading urgency, tech-demo spectacle,
  photorealism, free camera, decorative lore/agent roleplay, game mechanics.
- **Calm:** contemplative, poetic, pleasant during a ten-minute watch. Negative space matters.
- **D1** bounded 3/4 diorama with pan+zoom. **D4** assets are Blender kits authored by Opus via
  scripts in `scripts/harbour/blender/` (no GPT art, no remote generated URLs at runtime).
- **D13** sound opt-in, off by default. Reduced motion must still the world.
- **Perf:** integrated-GPU gate (Apple Silicon, Safari 26 + Chrome) p95 ≤ 16.7 ms; bundle
  budgets in `scripts/bundle-budgets.mjs`. Cost every idea (draws, tris, shader ALU, bytes).
- Single three.js WebGL2 engine, systems in `src/harbour/systems.ts` order; pmndrs PostChain
  (bloom, AgX, SMAA). No renderer switch / graphical fallback.
- Data feeds (same-origin only): `/api/stablecoins`, `/api/chains`, `/api/mint-burn-flows`,
  `/api/peg-summary`, `/api/safety-grades`, `/api/stability-index`, `/api/stress-signals`,
  `/api/health`. Types/contracts in `shared/`, model in `src/harbour/model/`.

## Rules for subagents

- **READ-ONLY on the codebase.** Do not edit `src/`, `shared/`, `public/`, `scripts/`, docs.
  Write ONLY your report file `agents/claudeville-prettier/NN-<vertical>.md` and optional
  captures under `agents/claudeville-prettier/shots/NN-*.png`.
- Captures: ONLY `npm run preview -- --url "http://localhost:5173/?t=<hour>[&view=heart|overview][&debug params]" --out agents/claudeville-prettier/shots/NN-name.png --seconds 4`
  (dev server already running at :5173). Max 6 captures each; it serialises through one shared
  headless real-GPU Chrome, so be patient. NEVER launch Playwright/Chromium/Chrome yourself,
  never headed browsers. Useful params found in source: `t`, `view`, `season`, `month`,
  `weather`, `dews`, `psi`, `psiScore`, `stale`, `offpeg`, `rainbow`, `strike`, `wind`, `tide`,
  `simspeed`, `cam` — grep `searchParams.get` in `src/harbour` to confirm semantics.
- Old `agents/*` plans are history, not authority; the code is the truth. Check that an idea is
  not ALREADY implemented before proposing it (grep first).

## Report format (`NN-<vertical>.md`)

1. **Current state** — 5–10 bullets: what exists, what's strong, what's weak (cite files).
2. **Ideas** — 8–15 candidates, each:
   `### <ID> <Title>` · **What** (concrete, implementable) · **Why magical** (what the visitor
   feels) · **Data/meaning** (decorative vs data-bound; field + DOM equivalent if data-bound) ·
   **Where** (files/systems/assets) · **Cost** (effort S/M/L; perf: draws/tris/ALU/bytes) ·
   **Risk** (calm, truth, perf, reduced-motion).
3. **Top picks** — your ranked top 5 with a one-line justification each (impact ÷ cost).
4. **Cross-vertical hooks** — ideas that need another vertical (e.g. weather ↔ ocean ↔ audio).

Keep the report under ~2,500 words. Return to the orchestrator a reply UNDER 250 words: the
top-5 IDs + titles + one line each, and the report path. No file dumps.
