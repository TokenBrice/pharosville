# VX1 — fleet-detail pixel residuals (2026-10-19)

Source: VX1FleetPixels final report; evidence copied to `outputs/need-for-speed/fleet-pixels/` (`final/*/summary.json`).

## Cause (bisected)
- **Split emblem atlas (NFS-098)**: separate immutable logo texture + explicit-gradient sampling changed mip selection/filtering on sails, covers and house flags. Mooring-only revert, culling off and NFS-017 sizing restore had no effect on the residual.
- **Rig animation phase**: fleet colour/depth shaders derive boom/pennant phase from the BatchedMesh instance index. Reconciliation (NFS-060) plus early partial models moved the first live hull from instance 0 (main) to 578 (branch), shifting every boat's rig phase.

## Fix
- Restored main's combined emblem canvas, bitmap-to-canvas upload, common mip chain and sampling arithmetic (NFS-098 split relinquished; NFS-017 reservation/batching kept).
- Authored rig phase decoupled from allocation: the model-order ordinal main used is stored in paint texel `2.w` and read by colour and depth shaders, so reconciled instance IDs no longer change motion.
- Mooring lines back on main's JavaScript curve evaluation + Float32 rounding (NFS-063 relinquished; forgone saving ≈728 B/line/frame upload, CPU gain never measured).

## Result (branch vs main, igpu DPR1, frozen snapshot, independent main repeats)
| Lane | Result |
|---|---|
| Heart noon before fix | MAE 0.003335, max error 190 |
| Closest noon / night | SSIM 1, MAE 0 |
| Heart/overview noon/night summer, heart winter, 3 motion frames | 7–17 channels differ by exactly 1 level; MAE 0.0000015–0.0000035 |

The remaining one-level residual is repeatable, located almost entirely in sky pixels plus two quay/buoy pixels — below any visible threshold, but not bit-identical. Classified **marginal** (operator's "no/marginal impact" bar); not attributed further.
