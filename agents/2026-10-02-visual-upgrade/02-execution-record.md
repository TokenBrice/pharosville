# Visual upgrade: execution record (2026-10-03)

This records how `01-implementation-plan.md` was executed and released as v0.20.0
"Clear Record". The operator delegated every art and reading decision to the
orchestrator, so the A1R, A2, P1, B1 and W1 reviews and the I0 reading review
were all made by the orchestrator, using real-GPU captures.

## Packet outcomes

| Packet | Outcome | Evidence |
|---|---|---|
| H0, H1, C0, C1a, C1b, S1a, S1b, U0a | Merged | per-packet gates; DOM lane 8/8 |
| S1c-1/2/3, S1d, S1e | Merged | full suite 2218 pass; DOM lane 8/8 |
| S2 | Merged. The constants were accepted as a declared policy (labelled "declared", no longer "uncalibrated"). | Live calibration: 128/131 current full-window rows; 27 (snapshot) / 23 (live) coins eligible; top 3: DAI, USDC, USDS |
| A1 | Accepted on the third iteration | Day value-plan MAE 8.98 → 8.30; bottom middle ninth 19.2 → 27.4; resources unchanged (176 calls, 353,258 triangles) |
| A1b | Accepted. `THRESHOLD_NIGHT_FLOOR = 0.50`, threshold land and pines only. | Night bottom row 0.8/0.6/1.0 → 1.3/0.9/1.1 (target 3/7/4; still below target) |
| A2 | Rejected after two candidates. The whole-frame and 16 px blur results were indistinguishable from baseline. | `outputs/vu/a2/` (vu-a2 worktree) |
| B1 | Rejected. Near-hull crops were indistinguishable at 0.075 → 0.050. | `outputs/vu/b1/` (vu-b1 worktree) |
| P1 | Grove craft rejected (no whole-frame gain). The month-record oracle repairs were kept. | `test(month-record)` commit |
| W1 | Not warranted. Bottom-third temporal mean is 0.111 L* per frame pair at day and 0.028 at night. | `outputs/vu/w1/` |

## Production incidents fixed during execution

- v0.19.1 "Harbor Holds": an infeasible optional patrol leg aborted fleet planning.
- v0.19.2 "Harbors Return": live API drift. Null 7d/30d chain history and an
  absent `flowIntensity` made the render guard reject both the chains and the
  mint-burn feeds, so production showed no harbours and no issuance.

## I0 acceptance

- `npm run validate`: pass (2218 tests; total JS 948.0 KiB gzip, cap 963).
- `env -u CI npm run validate:release`: `PHAROSVILLE_DEPLOY_GATE: PASS`. The
  first attempt found a real regression: a held-source caption carrying a full
  ISO timestamp overlapped the controls at 1200×640. Fixed in `fix(caption)`.
- `npm run test:perf:reference`: pass, with 1 flaky case. See the residual note below.
- `npm run test:visual:cross-browser`: 4/4.
- §7.2 matrix on the integrated build: 9/9 settled PASS (720×900, 1200×640,
  900×720, t=7 / 18.5 / 19.2 / 22, DPR 2, 2560×720). All arms show 132 ships.
  Dusk value-plan MAE is 7.7, night 3.1, noon 8.3.
- D22 static live-hour cost, real GPU, 60 s, live data:
  - Live hour: 1.10 paints/s at 320 draws per paint, submit p50 7.3 ms /
    p95 9.1 ms, main thread 0.79 % busy.
  - Pinned hour: 1.00 paints/s at 170 draws per paint, main thread 0.23 % busy.
- §7.4 reading review: 10 matched scenes, each in normal and reduced motion.
  - The keyboard path (`/`, then Enter, then Escape) opens and focuses the
    record and closes it in all 20 arms.
  - The stale feed is captioned as held and qualified in the ledger.
  - Own distress survives the squad disclosure in both record and ledger.
  - Mint, redemption, balanced and $1 activity are distinguished exactly in the
    record, including policy eligibility.
  - No channel contradicted another.
- §7.3 30-minute live watch: see `outputs/vu/i0/live-watch.json` and the 1 fps
  screen recordings (local only).

## Residual risks

- Long-session triangle spike (pre-existing). One per-second sample exceeds the
  500k per-frame triangle budget by about 216k triangles and about 75 calls.
  - Integration: 566,611 triangles at 145 s.
  - v0.19.2 production tree: 574,545 triangles at 258 s, reproduced on the same test.
  - The reference gate passes on retry. The cause has not been diagnosed.
- A held-source caption with a long reason can still reach the expanded
  controls at exactly 1200 px wide. Its right edge is faded by the caption mask.
- Warn-mode schema drift in the live API is not addressed: `priceObservedAtMode:
  "nominal_reference"`, null per-chain `circulatingPrev*`, a new
  `classificationSource` and `coverage.status: "unknown"`. Because of this
  drift, the offline payload cache refuses to persist stablecoins, peg summary
  and mint-burn. Render behaviour is unaffected.
- The threshold early-arrival outer-ocean exposure measured before this work
  (273/212/473/1637 px at arrival 0 across four sizes) was not changed.
