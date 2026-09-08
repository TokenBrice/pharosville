# pharosville-reborn

Planning artefacts for the "okay → amazing" session. Read in this order:

1. `00-brief.md` — the ask, reference frames, constraints, prior decisions, swarm report format.
2. `01-implementation-plan.md` — **the plan**: diagnosis (§0), target picture and value plan (§1),
   fourteen resolved decisions (§2), seven waves W0–W6 of items tagged **Core** / **Ext**, each with
   files, cost, displaces and re-pins (§3), the per-item budget against the measured census (§4),
   the gated execution order **G0–G5** with exclusive shared-file ownership (§5), rejected and
   deferred (§6), operator decisions requested (§7).
3. `02-plan-review.md` — adversarial cross-review by a `heavy` critic; every finding's disposition
   is logged in `01-implementation-plan.md` §7b.

## Lane reports (`reviews/`)

Holistic critics (`heavy` agent): `astra-garden-director.md`, `astra-game-art-director.md`,
`astra-ambient-experience.md`, `astra-ruthless-critic.md`.

Components: `water.md`, `sky-seam-defects.md`, `sky-time-ideas.md`, `fleet-visuals.md`,
`fleet-motion-quality.md`, `fleet-density-strategy.md`, `island-lighthouse.md`,
`shore-rim-vegetation.md`, `ambient-life-light.md`, `camera-composition.md`, `ui-hud-inventory.md`,
`data-story-ideas.md`, `data-field-inventory.md`, `render-perf-budget.md`, `proxy-security.md`.

Reference: `decision-ledger.md` (operator decisions, blockers, recurring complaints),
`test-coupling-map.md` (which tests pin which choices, re-pin cost), `tuning-sky.md`,
`tuning-post-light.md`, `changelog-promises.md` (what the changelog claims vs the frames).

## Evidence (`outputs/reborn/`, not committed)

Real-GPU frames (RTX 5070 Ti, tier full): `morning`, `noon`, `dusk`, `night`, `noon-wholemap`,
`dusk-close`, `noon-legend` (`.png`). Census: `census/draw-census.txt`, `texture-census.txt`,
`light-cycle.json`, `blur-audit-{noon,night}.txt`. Capture recipe:

```
PHV_GL_FLAGS="--use-angle=vulkan --enable-features=Vulkan" node scripts/pharosville/preview.mjs \
  --chrome outputs/reborn/chrome-gpu.sh --hash "#t=12.25" --out reborn/<name>.png --seconds 6
```

(`chrome-gpu.sh` exists because the operator's `chrome-flags.conf` no longer forces the NVIDIA
render node; without the Vulkan flags headless capture lands on SwiftShader or the iGPU.)
