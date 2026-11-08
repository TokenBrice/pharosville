# PharosVille — "Ultimate enhancement pass": shared research brief

Date: 2026-11-08. Baseline: `main` @ `29e0b2a3` = **v1.4.1 "Flying Colours"** (2026-10-25).
Repo: `/home/ahirice/Documents/git/pharosville` (absolute paths everywhere). Engagement folder:
`/home/ahirice/Documents/git/pharosville/agents/pharosville-ultimate/` (this file's folder).
The orchestrator consolidates every lane report into one implementation plan (`PLAN.md`, here).

## 1. Goal

Find what would make PharosVille **prettier, more enchanting, more informative, smooth on every device,
and feel like a professional-grade product** — then cost it. This is a research/planning pass: no code
changes. Every claim must be anchored in the real code (`file:line`) or a real frame. Generic advice
("add bloom", "use memoization") with no anchor is worthless here.

The five pillars (tag every idea with exactly one):
- `prettier` — the picture: composition, light, materials, water, sky, ships, town.
- `enchanting` — wonder and delight over a 10-minute watch: moments, motion, life, sound, surprise.
- `informative` — the visitor understands the stablecoin market better, faster, and can verify it.
- `all-devices` — smooth and correct on weak laptops, Retina/HiDPI, tablets, foldables, Safari/Firefox,
  and a deliberate story for phones.
- `professional` — polish, consistency, resilience, accessibility, shareability, observability, QA.

## 2. What PharosVille is (read before anything else)

- `PRODUCT.md` (users, purpose, personality, anti-references, principles), `AGENTS.md` (hard rules),
  `docs/pharosville/ARCHITECTURE.md`, `docs/pharosville/RUNTIME_FACTS.md`.
- Locked decisions **D1–D14**: `agents/2026-10-13-pharosville-reboot/PLAN.md` §2.
- The Harbour: every stablecoin is a boat sailing a circuit between its chains' piers (time docked ∝
  supply share), the Pharos beam = Pharos Stability Index (PSI), sea state = off-peg share, weather =
  DEWS stress band, **fog = stale data ONLY**, the Shoals = off-peg coins, hull family = peg currency,
  size = supply class, Wreck Cove = dead coins, Shipyard = pre-launch coins. Seasons and time of day
  are decorative (visitor's calendar/clock). Text only on demand (hover tag, side panel, ledger, search).
- Code map: `src/harbour/` (~53k lines TS): `engine/` (renderer, camera rig, governor, post, prepare),
  `systems.ts` (update order), `data/ model/ sim/ readings/` (feed → model → worker-planned sim →
  bindings), `ocean/ sky/ weather/ world/ civic/ fleet/ lights/ beam/ life/ identity/ season/` (the
  picture), `ui/` (React chart-paper overlay), `audio/` (opt-in sound), `app/` (mount, poster crossfade).
  Shell: `index.html`, `src/main.tsx` (pre-React viewport gate), `src/client.tsx`, `src/systems/viewport-gate.ts`.
  Proxy: `functions/api/[[path]].ts`. Contracts/types: `shared/`.

## 3. What already shipped — do NOT re-propose it

v1.4.0 "Living Harbour" (2026-10-25) implemented an 8-wave "prettier & more magical" plan:
`agents/claudeville-prettier/PLAN.md` (read §3–§9, especially **§9 deferred/rejected** and **§6 rejected
cues**), its fresh-eyes review `agents/claudeville-prettier/REVIEW.md` (15 ranked open visual issues —
check whether each is still open), and `agents/claudeville-prettier/exec/INTEGRATION-NOTES.md` (lane
leftovers, e.g. hover lights pop with no fade, lamp wave barely visible, gust TODOs, iGPU cost +20 %).
The v1.4.0 / v1.1.0–v1.4.1 entries in `CHANGELOG.md` list what visitors already get. **Grep before you
propose**: if it exists, propose improving it, not adding it. You may reopen a previously rejected idea
only with a new argument; mark its title `REOPEN:`.

## 4. Non-negotiables (violations make an idea worthless)

- **Data truth (D11, PRODUCT.md):** any NEW analytical cue names its source field, threshold, hover/panel/
  ledger text in the same words, and a unit test. Decorative things never respond to data. Never re-map an
  existing signal silently. Stale/unavailable data → neutral pose, never a "good" one. Fog = stale only.
- **Calm, contemplative, poetic.** Anti-references: crypto dashboards, neon, trading urgency, tech-demo
  spectacle, photorealism, free camera, decorative lore, game mechanics.
- **D1** bounded 3/4 diorama, pan + zoom. **D4** art assets are Blender scripts in `scripts/harbour/blender/`
  (no GPT-authored art, no remote generated URLs at runtime). **D13** sound opt-in, off by default.
  Reduced motion must still the world. **D14** perf gate: integrated GPU (Apple Silicon, Safari 26 + Chrome),
  p95 ≤ 16.7 ms; bundle budgets in `scripts/bundle-budgets.mjs`.
- One three.js WebGL2 engine. **No renderer switch, no graphical fallback renderer** (AGENTS onboarding "Avoid").
- Browser calls same-origin `/api/*` only; `PHAROS_API_KEY` server-side only.
- **Viewport gate:** screens/windows below the sorted 720×600 profile must not mount the world or fetch
  world data. Never gate on orientation.
- If an idea needs one of these changed (e.g. phones get a runtime, WebGPU, sound on by default, a new
  allowlisted endpoint), it is still welcome — mark it `DECISION-NEEDED`, state the trade-off honestly,
  and put the question in `operator_decisions`.

## 5. Evidence already gathered (use it; don't redo it)

Real-GPU captures (RTX 5070 Ti, headless Chrome, 1600×1000 unless noted) in `shots/`:
`base-day.png` (t=11), `base-dusk.png` (t=18.3, already night in November), `base-night.png` (t=22),
`base-heart.png` (view=heart t=14), `base-overview.png` (view=overview t=12), `base-tablet-portrait.png`
(834×1112 touch), `hour-{dawn,morning,golden,sunset,bluehour,deepnight}.png` (t=6.9/9/16.4/17.1/17.6/3),
`view-heart-night.png`, `view-overview-night.png`, `state-storm-danger.png` (dews=DANGER),
`state-front.png` (dews=WARNING only — `front=1` is ignored; for a real rising front use `O4-front-rising.png`), `state-stale-fog.png` (stale=1), `state-psi-none.png`,
`state-offpeg-high.png` (offpeg=0.08), `season-{winter,spring}.png`, `aspect-ultrawide.png` (2560×1080),
`aspect-tablet-landscape.png` (1194×834 touch), `aspect-retina-1440.png` (1440×900 @2x),
`aspect-small-laptop.png` (1100×640). (Some may still be rendering when you start; they land within minutes.)

Perf facts (RTX 5070 Ti, uncapped, t=11, high tier): GPU ≈ 1.7 ms/frame, 115 draws, 1.65 M triangles,
74 programs, 56 textures. **Main-thread JS ≈ 3.1 ms/frame on a fast desktop CPU** (`?prof=1`, 456 frames):
fleet 1.13 ms, render submit 1.02 ms, data 0.55 ms, life 0.08, civic 0.05, sky 0.05, ocean 0.04;
**spikes: TOTAL max 92.7 ms, render max 48.9, fleet max 27.8, civic max 12.3** (hitches). Per-pass GPU
timings for day/night/storm (`?prof=gpu`): `shots/perf-rtx-{day,night,storm}.json` → `gpuPasses`.
Prior iGPU measurement (`agents/claudeville-prettier/exec/INTEGRATION-NOTES.md`): AMD Raphael iGPU at
low tier, DPR 1: **68–76 ms GPU/frame (≈15 fps), +20 % vs v1.3.0**; no perf pass has happened since.
The iGPU capture profile is unavailable this session; the Apple Silicon gate device is not on this machine.
First fleet frame on this machine (dev server, warm): ~2.0 s.

## 6. Ground rules for every lane

- **Read-only on the repository.** Do not edit anything under `src/ shared/ public/ scripts/ functions/
  docs/ tests/` or config files. Do not run `git` commands that change state. Do not install packages.
- Old `agents/*` plans are history, not authority. **The code is the truth.**
- Browsers: never launch Playwright/Chromium/Chrome yourself, never a headed window. The only capture path
  is `node scripts/harbour/shot.mjs ...` (dev server already running at `http://localhost:5173/`), which
  serialises through one shared headless real-GPU Chrome — so it queues; be patient and frugal.
  (Code-only lanes do not capture at all.)
- Useful URL params (dev only): `t=<hour>` `view=heart|overview` `cam=x,y,z,dist,pitch` `season=` `month=`
  `dews=CALM|WATCH|ALERT|WARNING|DANGER` `front=1` `psi=<BAND>|none` `psiScore=` `offpeg=0.06` `stale=1`
  `cones=` `tide=` `stormflags=N` `maiden=N` `office=Ethereum:works` `psiQualified=1` `rainbow=1`
  `strike=1` `wind=` `meteors=` `moment=` `simevent=` `simspeed=` `wake=1` `intro=1` `prof=1|gpu`
  `quality=` `dpr=`. Confirm semantics by grepping `.get("<name>")` under `src/harbour`.

## 7. Output contract

Every lane produces one structured report with these fields (Sol lanes: as the final JSON message, the
schema is enforced; Opus lanes: write `reports/<LANE>-<slug>.json` with the same shape plus a narrative
`reports/<LANE>-<slug>.md`):

- `lane`, `executive_summary` (≤ 200 words: the 3–5 things that matter most from your lane),
- `current_state`: 5–10 bullets — what exists, what is strong, what is weak (cite `file:line`),
- `findings`: concrete defects/regressions/risks you found (bugs, perf hazards, a11y failures, visual
  errors), each with `severity` (critical/high/medium/low), `evidence` (file:line or shot), `detail`, `fix`,
- `ideas`: 8–15 improvement candidates (quality over quantity), each with: `id` (e.g. `S06-I3`), `title`,
  `what` (concrete and implementable — name the mechanism), `visitor_benefit`, `pillar`, `meaning`
  (decorative / data-bound / ux / infra), `data_and_dom` (for data-bound: field, threshold, DOM text;
  else "n/a" or why it is safe), `where` (files/systems/assets), `effort` (S ≤1 day, M ≤3 days, L ≤1–2
  weeks, XL more), `perf_cost` (draws/tris/ALU/ms/KB — estimate honestly), `risks` (calm, truth, perf,
  reduced motion, regressions), `impact` 1–5, `confidence` 1–5, `depends_on` (other idea ids or lanes),
- `top_picks`: your ranked top 5 (id + one-line why: impact ÷ cost),
- `operator_decisions`: questions only the operator can settle (DECISION-NEEDED items),
- `cross_lane_hooks`: what another lane must do for your ideas to land.

Quality bar: verify every "missing" claim by grepping; cite real line numbers; estimate cost; prefer the
smallest change with the largest visible or felt effect; say plainly when something is already excellent.
