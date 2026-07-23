# Three.js Phase 3 Decision Packet

Date: 2026-07-23

Status: `GO` recorded. Phase 4 is active.

This records the operator decisions that moved the completed Garden
Observatory experiment into production conversion.

Implementation plan:
[`2026-07-23-threejs-implementation-plan.md`](./2026-07-23-threejs-implementation-plan.md)

Automated evidence:
[`2026-07-23-threejs-phase3-automated-evidence.md`](./2026-07-23-threejs-phase3-automated-evidence.md)

## P3.5: Operator Review

The operator explicitly chose to be the product tester, replacing the proposed
five-person cohort. The direct review used the experiment build and covered:

- landmark, water, dock, and ship comprehension;
- collision and fleet-motion behavior;
- calm/watchable product direction;
- production-quality gaps.

Review: encouraging direction and very smooth performance. The current world
still reads as a preview: water is too flat, the island and lighthouse need
authored models, the lighthouse needs unmistakable light, and ships need
stablecoin-specific sail colors and logos.

Result: `PASS`

## P3.6: Asset-Authoring Decision

The operator chose agent-authored procedural/GLB production assets rather than
an external human-art cost probe. A paid PixelLab evaluation generated a
usable eight-direction ship reference, but confirmed that the service outputs
2D pixel art rather than GLB, mesh, or PBR assets and is not deterministic
enough to serve as the production pipeline. PixelLab is therefore
reference-only. Stablecoin marks always use the repository's authoritative
local logo files rather than generated approximations.

Acceptance for every asset:

- approved at day and dusk in the binding camera and readable in grayscale;
- editable source retained; scale, origin, anchors, and pick proxy recorded;
- raw GLB passes Khronos validation with zero errors and zero warnings;
- one clean rebuild preserves structure and metrics;
- copyright, license, attribution, and commercial-use approval are recorded.

The exact mechanics probe, metadata contract, and compression comparison are in
`outputs/threejs-glb-probe/phase-3-6-phase-4-audit.md`.

Result: `PASS`

## P3.7: Budget Proposal

Approve or reject these limits. They are replacement budgets for a final
single-renderer build, not permission to ship Canvas and Three.js together.

| Budget | Proposal | Current evidence | Approval |
| --- | ---: | ---: | --- |
| Total production JavaScript | 1,330 KiB raw / 400 KiB gzip | Canvas build: 1,299.8 / 386.4 KiB | Approved |
| First three GLBs combined | 128 KiB raw | Mechanics probe: 79,356 bytes | Approved |
| GLB geometry | 5,000 triangles / 8,300 exported vertices | Probe: 1,141 / 1,916 | Approved |
| GLB render structure | 11 visible primitives, no textures | Probe: 10, no textures | Approved |

The experiment renderer measures 580.38 KiB raw / 151.40 KiB gzip, but the
final JavaScript total cannot be measured until Phase 5 removes Canvas. Keep
the current aggregate cap; if the single-renderer build exceeds it, return for
an explicit budget change instead of silently raising the limit.

Budget decision: approved as starting limits. A measured increase is allowed
when it buys clear visual value without compromising the currently smooth
reference performance.

Result: `PASS`

## Final Decision

- Decision: `GO`
- Operator: repository operator
- Date: 2026-07-23
- Rationale: the Three.js direction and performance are encouraging, but the
  current slice is a preview rather than a final product. Phase 4 must deliver
  substantially richer water, authored island and lighthouse forms, visible
  lighthouse light, and stablecoin-specific ships with sail colors and logos.

Implementation may continue autonomously. No branch may be pushed until the
operator gives a separate explicit push instruction.
