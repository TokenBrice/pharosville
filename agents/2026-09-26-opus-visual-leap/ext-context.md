# Ext wave — shared context (orchestrator)

Repo /Users/ahirice/Documents/git/pharosville, branch feat/hour-print, last commit 3b23b45 (W5 green). Plan
`agents/2026-09-26-opus-visual-leap/01-implementation-plan.md` §5 "Ext" rows X1–X10, §5.0 attention budget, §3
rulings (K29 stone-garden site, K44 postcard/Wander, K45 tide/wind), §4.1 decisions (O8 stone garden, O9 tidal
flat, O16 dawn skein, O20). Rules and report format: `agents/2026-09-26-opus-visual-leap/03-execution-brief.md`.
Lane reviews under `agents/2026-09-26-opus-visual-leap/reviews/` (cited per task).

Landed and reusable: day score `src/systems/garden-score.ts` + director `src/systems/garden-director.ts`
(`registerRitual(kind, {start, update → done, cancel})`, `forceGardenRitual`, `__pharosVilleDebug.forceRitual`,
`directorLog`, preview `--ritual <kind>`); calendar `src/systems/garden-calendar.ts` (72 kō, phenology,
`gardenSeasonalVisitor`); sky almanac `src/systems/sky-almanac.ts`; aerial `src/three/garden-aerial.ts`; noise pack
`src/three/garden-noise-pack.ts` (R dither, G fbm, B Worley, A curl — use it, no new textures); sound
`src/lib/pharosville-audio/**`, `playGardenSoundBeat`; rest seat `src/systems/rest-seat.ts`, ShotSpec in
`src/systems/projection.ts` / `src/systems/camera.ts`.

## Wave rules
- Agents edit concurrently; own only your files; re-read shared files immediately before each edit.
  `src/three/world-renderer.ts`, `src/pharosville-world.tsx`, `src/systems/garden-score.ts`: minimal wiring only.
  **Keep the tree importable at every step.**
- **New score kinds** (X5 etc.): message **PrintIntegrator** (owns the score) the kind name, its timing rule
  (season/kō/hour/moon), foreground or background, and duration; it adds the kind to `GardenRitualKind`, the
  score and the §5.0 checker. Every Ext event must go through the director so §5.0 still holds with it on.
- No full test suite / lint / format / git. Allowed: `npm run -s typecheck`, focused `npx vitest run <files>`,
  up to 8 `npm run preview` captures on LIVE data (no `--fixture`), `--clock 2026-09-26` (or the date your item
  needs), `--out opus-review/ext/<name>/x.png`. Look at the captures. A 60-minute watch is running on port 5190
  from a separate worktree; ignore it (don't touch `outputs/g4-tree`).
- Budgets: 0 new textures (72/72), 0 new fleet attributes, per-frame JS ≤ 0.05 ms per feature, ≤ 500k tris,
  bundle gzip aggregate cap 963 KiB (918 used), CSS gzip cap 8 KiB (7.8 used — any CSS must be tiny or
  replace existing rules). Every new cue: a ledger line in `src/systems/visual-cue-registry.ts` plus a
  reduced-motion state. Palette anchors immutable; vermillion only for the beacon flame and danger water.

Report in the 03-execution-brief format when done.
