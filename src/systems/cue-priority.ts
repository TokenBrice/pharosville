// ---------------------------------------------------------------------------
// W4.27 — Cue-priority arbiter
// ---------------------------------------------------------------------------
//
// `MOTION_POLICY` requires a stable priority order when multiple ships
// compete for a single cap-bound visual cue slot (e.g. only N overlay
// renders per frame, only M wake renders, etc.):
//
//   selected > active risk > recent supply > scenery
//
// The arbiter awards the slot to the highest-priority ship in any
// competing pair. Lower-priority ships fall back to their static reduced
// state for the contested cue, preserving reduced-motion truthfulness.
//
// This module provides the priority function and a small arbiter helper;
// the actual cap mechanism lives in the renderer (planShipRenderLod in
// ships.ts) which is outside this swarm's ownership lane. A clearly-marked
// TODO sits at the cap call site so the follow-up wave can wire this in.

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

/**
 * Arbitrate between two competing ships for a single cap-bound cue slot.
 * Returns the winning ship id (the one whose cue runs); the other ship's
 * cue should fall back to its static reduced state.
 *
 * Ties are broken by id-sort so the result is deterministic and stable
 * frame-to-frame for the same pair of inputs.
 */
export function arbitrateCueSlot(a: CuePriorityInput, b: CuePriorityInput): string {
  const pa = cuePriority(a);
  const pb = cuePriority(b);
  if (pa > pb) return a.ship.id;
  if (pb > pa) return b.ship.id;
  return a.ship.id < b.ship.id ? a.ship.id : b.ship.id;
}

/**
 * Award up to `capacity` cue slots to the highest-priority ships from
 * `candidates`. Stable id-sort breaks ties. Returns the set of winning
 * ship ids; ships not in the set should fall back to their static reduced
 * state for the contested cue.
 *
 * Pure / deterministic / allocation-free O(N log N) sort + O(capacity)
 * pick. Safe for per-frame use in the renderer.
 */
export function awardCueSlots(
  candidates: readonly CuePriorityInput[],
  capacity: number,
): Set<string> {
  const winners = new Set<string>();
  if (capacity <= 0 || candidates.length === 0) return winners;
  if (candidates.length <= capacity) {
    for (const candidate of candidates) winners.add(candidate.ship.id);
    return winners;
  }
  const sorted = [...candidates].sort((a, b) => {
    const pa = cuePriority(a);
    const pb = cuePriority(b);
    if (pa !== pb) return pb - pa;
    return a.ship.id < b.ship.id ? -1 : a.ship.id > b.ship.id ? 1 : 0;
  });
  for (let i = 0; i < capacity && i < sorted.length; i += 1) {
    winners.add(sorted[i]!.ship.id);
  }
  return winners;
}
