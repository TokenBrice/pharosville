// ---------------------------------------------------------------------------
// Cue priority
// ---------------------------------------------------------------------------
//
// `MOTION_POLICY` requires a stable priority order for cap-bound visual cues:
//
//   selected > active risk > recent supply > scenery
//
// Renderer code uses `cuePriority()` directly when ranking cue candidates.

import type { ShipMotionSample } from "./motion-types";
import type { ShipNode } from "./world-types";

/** Coarse cue tiers used by the priority arbiter. Higher value wins. */
export const CUE_PRIORITY_SELECTED = 4;
export const CUE_PRIORITY_ACTIVE_RISK = 3;
export const CUE_PRIORITY_RECENT_SUPPLY = 2;
export const CUE_PRIORITY_SCENERY = 1;

export type CuePriorityTier =
  | typeof CUE_PRIORITY_SELECTED
  | typeof CUE_PRIORITY_ACTIVE_RISK
  | typeof CUE_PRIORITY_RECENT_SUPPLY
  | typeof CUE_PRIORITY_SCENERY;

export interface CuePriorityInput {
  ship: Pick<ShipNode, "id" | "riskPlacement" | "change24hPct" | "change24hUsd">;
  sample?: ShipMotionSample | null;
  /** True when the ship is the user's current selection. */
  selected?: boolean;
}

/**
 * Active risk = ship is in any non-safe placement (storm-shelf, outer rough
 * water, harbor mouth watch, breakwater edge, ledger mooring). The
 * "safe-harbor" placement is the only non-risk placement.
 */
const ACTIVE_RISK_PLACEMENTS = new Set([
  "storm-shelf",
  "outer-rough-water",
  "harbor-mouth-watch",
  "breakwater-edge",
  "ledger-mooring",
]);

/**
 * Recent supply move heuristic: matches the existing `hasRecentMove`
 * threshold in motion-planning.ts so the priority tier lines up with the
 * existing `moverShipIds` set. ≥ $1M absolute or ≥ 0.01% relative.
 */
function hasRecentSupplyMove(ship: CuePriorityInput["ship"]): boolean {
  const absolute = Math.abs(ship.change24hUsd ?? 0);
  const percentage = Math.abs(ship.change24hPct ?? 0);
  return absolute >= 1_000_000 || percentage >= 0.01;
}

/**
 * Returns the cue priority tier for a ship in the current frame.
 *
 *   selected             → CUE_PRIORITY_SELECTED (highest)
 *   active risk          → CUE_PRIORITY_ACTIVE_RISK
 *   recent supply move   → CUE_PRIORITY_RECENT_SUPPLY
 *   otherwise (scenery)  → CUE_PRIORITY_SCENERY (lowest)
 */
export function cuePriority(input: CuePriorityInput): CuePriorityTier {
  if (input.selected) return CUE_PRIORITY_SELECTED;
  if (ACTIVE_RISK_PLACEMENTS.has(input.ship.riskPlacement)) return CUE_PRIORITY_ACTIVE_RISK;
  if (hasRecentSupplyMove(input.ship)) return CUE_PRIORITY_RECENT_SUPPLY;
  return CUE_PRIORITY_SCENERY;
}
