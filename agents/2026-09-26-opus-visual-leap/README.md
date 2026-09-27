# 2026-09-26 — Opus visual leap

Planning artefacts for the "make PharosVille stunning, poetic and relaxing" review. Read in this order:

1. `01-implementation-plan.md` — **the plan**: diagnosis (§0), the Hour-Print north star, "the hand",
   hero frames and measured targets (§1), rulings on 46 lane conflicts (§3), operator decisions for the
   G−1 gate (§4), waves W0–W8 + Ext with owners, displacements and gates, including the attention budget
   (§5), budget ledger (§6), rejected/deferred (§7), bible amendments (§8), topology (§9), council
   dispositions (§11).
2. `00-brief.md` — the brief every lane received (ground truth, evidence, constraints, report format).
3. `council/` — three adversarial reviews of the first draft (art direction, engineering, restraint);
   every finding is disposed in plan §11.
4. `catalogue/` — lossless indexes of the 19 lane reports: A atmosphere/light/water/tech, B world objects,
   C experience/holistic, D conflicts, dependencies, reversal register, budgets, bible contradictions.
5. `reviews/` — the 19 lane reports: water, sky, light, printmaker, headroom, pharos, garden,
   garden-master, harbour, fleet-craft, fleet-motion, life, camera, chrome, data-poetry, sound,
   ambient-journey, art-director, critic.

All lanes, indexes and council reviewers ran on Opus 5.5.

## Evidence (`outputs/opus-review/`, not committed)

Serial real-GPU baseline (Chrome / ANGLE Metal / Apple M5 Pro, tier `full`): `dawn`, `morning`, `noon`,
`golden`, `blue`, `night`, `deep-night`, `wholemap-noon`, `wholemap-dusk`, `selected-ship`,
`selected-lighthouse`, `reduced-noon`, `sea-sign-hover`, `noon-1440p`, `compact-1200x640`, `gate-900x720`,
`gate-720x900` (`.png` + `.txt` metrics; the last two were added after the lanes ran). Lane captures live in `outputs/opus-review/<lane>/`; many ran below tier `full` under shared GPU
load and were used for composition only. Throwaway tools that seed plan items W0.2, W0.3 and W1.2a:
`tools/motion-sheet.mjs`, `light/ninths.mjs`, `camera/*.ts`.
