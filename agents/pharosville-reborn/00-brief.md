# PharosVille Reborn — review swarm brief

Date: 2026-09-08. Base: `main` @ `4edd97c` (v0.16.0 "Air and Lantern").
Worktree carries one unrelated operator edit (`src/three/garden-post.ts` + regenerated
`garden-grade-lut.png`); leave it alone.

## The ask (verbatim from the operator)

> Pharosville is looking better, but still not satisfactory. I am tired of us going
> iterative about it, so I want instead to prepare the mother of all upgrade/enhancement
> plan that will take Pharosville from "okay" to "amazing" in one massive development
> session.
>
> ULTIMATE GOAL = Pharosville is a visually stunning, beautiful, relaxing experience,
> similar to a digital japanese garden. It's a scene evolving by itself, pleasant to
> watch and informative about stablecoin markets (Pharos data).

Read that as: **step change, not polish**. Sixteen releases of incremental tuning have
not produced "amazing". Prior operator decisions (below) are context, not law: you MAY
propose reversing one, but you must say so explicitly and say what it buys.

## What you are reviewing

- App: React + Three.js/WebGL isometric orthographic world, 140×140 tile plate, one
  lighthouse island, eight chain harbour stations on a land rim, ~185 displayed
  stablecoin ships (320 capacity), seven named waters by risk band, a wall-clock day
  cycle, post chain (N8AO, grade LUT, vignette, god rays), DOM detail panel + ledger.
- Source: `src/three/**` (renderer), `src/systems/**` (pure world model), `src/hooks/**`,
  `src/components/**`, `src/pharosville-world.tsx`, `src/pharosville.css`.
- Contracts: `docs/pharosville/VISUAL_INVARIANTS.md` (read it — it is the list of
  things every lane before you has pinned), `docs/pharosville/ARCHITECTURE.md`,
  `docs/pharosville/THREEJS_AGENT_REFERENCE.md`.
- Prior plans: `agents/*.md` — the most recent are `2026-09-07-visual-refinement-consolidated.md`
  and `2026-09-07-composition-consensus-plan.md`. They are what "iterative" produced.

## Real-GPU reference frames (RTX 5070 Ti, tier full, 60 fps, 1600×1000)

All in `outputs/reborn/`:

| File | Hash | What |
| --- | --- | --- |
| `morning.png` | `#t=7` | rest camera, morning |
| `noon.png` | `#t=12.25` | rest camera, the modal hour |
| `dusk.png` | `#t=17.5` | rest camera, dusk |
| `night.png` | `#t=22&n=1` | rest camera, night |
| `noon-wholemap.png` | `#t=12.25&cam=0,0,0.42` | whole plate, shows the plate edge + backdrop |
| `dusk-close.png` | `#t=17.5&cam=0,0,1.4` | zoom 1.4 on the north water, shows the backdrop seam |
| `noon-legend.png` | `#t=12.25` + `--legend` | onboarding overlay kept |

Read them with the `read` tool (they are images; ask `?q=` questions if you want a
targeted description). **Never** judge look or frame time through Playwright's bundled
browser. If you need one more frame, at most two, run:

```
PHV_GL_FLAGS="--use-angle=vulkan --enable-features=Vulkan" node scripts/pharosville/preview.mjs \
  --chrome outputs/reborn/chrome-gpu.sh --hash "#t=17.5&cam=0,0,1.2" --out reborn/<yourlane>-<name>.png --seconds 5
```

(`cam=x,y,zoom` are camera offsets + zoom; `t` hour; `n=1` night. Dev server is on :5173.)

## Orchestrator's first look (confirm or refute; do not treat as findings)

1. The rest frame is a carpet: ~185 hulls at near-uniform visual weight, hulls as large
   as the lighthouse island's grove. "Japanese garden" reads as "marina".
2. Value structure is flat and washed — a beige haze sits over the whole frame at noon;
   the tower and the water are one value plane. Dusk is noon with a warm filter.
3. Past the plate edge the backdrop is a flat cream void with a **hard diagonal seam**
   against a blue band (`noon-wholemap.png`, `dusk-close.png`). Reads as a render bug.
4. A faint inset rectangle outline is visible ~12 px inside every frame edge.
5. The water is a flat teal plane: no reflection of the tower, no depth, no sky.
6. Sails read as stickers (flat logo cards on flat cloth).
7. Nothing in a still frame says "garden": no raked gravel, no stone, no maple, no
   moss, no bridge, no path, no scale figure. The island is a fort.
8. Harbours — the "informative" surface — are mostly off-frame at the rest camera.

## Hard constraints that stay (not negotiable in this plan)

- Desktop gate (900×720 / 1200×640 size profiles) — no world runtime below it.
- One renderer; renderer failure → DOM static overview; no graphical fallback switch.
- Browser calls same-origin `/api/*` only; `PHAROS_API_KEY` stays server-side.
- Every analytical cue keeps detail-panel / accessibility-ledger parity.
- Reduced motion = deterministic static frame, zero RAF.
- Hard ceilings: 700 draw calls, 500 geometries, 500k triangles, 72 textures;
  p95 ≤ 20 ms on the reference machine. (Current: ~213–233 calls, ~355k tris, 44 tex.)
  There is headroom. Spending it well is part of the ask.

## Prior operator decisions (context — reversible if you argue it)

- Wall clock is the premise (no "flattering hour" default). Sun elevation change
  (T3.1) parked, not rejected. `ARC_SWEEP` widening rejected (sun behind viewer).
- Planar reflection pass rejected on cost (~40 duplicated draws) in favour of fresnel
  + PMREM probe tuning.
- Fleet moors in odd-count anchorages; uniform/blue-noise scatter banned. 320-ship
  placement capacity kept; ≥0.5 zoom shows every eligible hull.
- Rest zoom 0.72 (reopened from 1.0 on 2026-09-06). Whole-map = explicit zoom-out.
- Chain captions removed; harbour identity lives on 2.6× rooftop flags.
- Night: one dominant light (beacon), one secondary (moon road), everything else ember.
- "Every new feature names what it displaces." Attention is the budget.
- Ambient-life counts (birds/koi/fireflies) not to be raised; redistribute instead.
- No more free-standing monuments on the Pharos rock beyond pavilion/pond/mast.

## Your report

Write to `agents/pharosville-reborn/reviews/<lane>.md` (scouts return text instead).
**≤ 2500 words. No file dumps, no pasted source.** Structure:

1. **Verdict** — 3–5 sentences: what this component is today, measured against the goal.
2. **Findings** — each with evidence: `file:line` for code, `frame.png @ region` for
   look. Separate DEFECT (broken vs. its own intent) from GAP (works, but not amazing).
3. **Ideas** — ranked. For each: what changes (files/symbols), why it moves toward the
   goal, cost (draws/tris/tex/ms, engineering hours S/M/L/XL), risk, what it displaces
   or which pinned test/invariant it re-pins, and dependencies on other lanes.
   Be bold: include at least two ideas you'd call "step change", not "tune".
4. **Rejected** — ideas you considered and dropped, one line each, with the reason.
5. **Cross-lane notes** — what you need from, or would hand to, another lane.

Do NOT edit source, run formatters, linters, test suites, or builds. Read-only, except
your report file and at most two preview captures. Skip all gates.
