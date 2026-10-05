# CP-Destination: orchestrator gate record (2026-10-05)

Under the operator's request for autonomous execution (decision D3, adapted), the orchestrator ran this checkpoint against the A board (`A-board.md`). The operator will review it at CP-Final.

Evidence (untracked captures in `outputs/g/l1/`):

| Capture | Configuration |
|---|---|
| `day.png` | Graybox round 1 |
| `day2.png` | Graybox round 2 |
| `day4.png` | Graybox round 3, integrated with S4-P1/S5-P1 |
| `c900*.png` | 900×720 |
| `t720.png` | 720×900 |
| `night.png`, `newmoon.png` | Night, with light ROIs |
| `overview.png` | Overview |

**Verdict: conditional pass on placement only.**

What passed:
- The macro-A masses are placed: two shelves, a triad on the left shelf, an upper-left pine fragment visible at every gate, a stepping run, and an unchanged seat, brow and inlet.
- Land separates from water.
- The NaN black-block regression was found (an S5-P1 shader in divergent derivative lanes), fixed and re-verified (`day4.png`).

What did not pass, and is deferred to the owning packets:
- The ground still reads as smooth lawn with dark flat slabs. Owners: S1-P2 (ground, stones and path craft, with the S2 surfaces/atlas) and S4-P2 (daylight).
- The stones read as slabs at the grazing seat angle. Owner: S1-P2.
- The pine reads as clustered pads. Owner: S1-P3 (authored kuromatsu).
- The night floors are unmet. Owners: S4-P1 recalibrated, then S1-P4 night integration (the threshold-flora night multiplier of 0.5 is flagged for S1-P4).
- The overview still reads as a square tray. Owner: S7-P1 revision in progress.

Escalation rule: if S1-P2 or S1-P3 still cannot make the stones, gravel, path and pine legible at the fixed seat, re-solve the seat pose and FOV jointly with the threshold. This is permitted by the D2 charter and plan §5.1, and must be re-accepted across all gates.
