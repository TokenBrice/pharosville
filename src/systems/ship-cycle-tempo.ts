import type { ShipNode } from "./world-types";

/**
 * Four human-readable tempo labels corresponding to marketCap quartiles.
 * Q0 (lowest marketCap) → "Languid"; Q3 (highest) → "Active".
 * These labels surface in the detail panel and accessibility ledger so any
 * data-driven speed difference on the canvas has a DOM-parity equivalent.
 *
 * "Active" replaces an earlier "Lively" because screen-reader playback of
 * "cycle tempo lively" reads as a fashion adjective rather than a speed
 * cue (see DOM-parity review 2026-05-03).
 */
export const CYCLE_TEMPO_LABELS = ["Languid", "Steady", "Brisk", "Active"] as const;

export type CycleTempoLabel = typeof CYCLE_TEMPO_LABELS[number];

export function cycleTempoReadingClause(): string {
  return "cycle pace tracks supply tier, not transfers";
}

/**
 * Compute the marketCap quartile (0–3) for a ship relative to its fleet.
 * Pure / deterministic. Returns 0 for single-ship fleets.
 */
function normalizedMarketCap(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function compareShipsByMarketCapRank(left: ShipNode, right: ShipNode): number {
  const byMarketCap = normalizedMarketCap(left.marketCapUsd) - normalizedMarketCap(right.marketCapUsd);
  return byMarketCap !== 0 ? byMarketCap : left.id.localeCompare(right.id);
}

function quartileForRankPosition(index: number, total: number): 0 | 1 | 2 | 3 {
  if (total <= 1) return 0;
  return Math.max(0, Math.min(3, Math.round((index / (total - 1)) * 3))) as 0 | 1 | 2 | 3;
}

function marketCapQuartile(ship: ShipNode, allShips: readonly ShipNode[]): 0 | 1 | 2 | 3 {
  if (allShips.length <= 1) return 0;
  const sorted = [...allShips].sort(compareShipsByMarketCapRank);
  const index = sorted.findIndex((entry) => entry.id === ship.id);
  return quartileForRankPosition(index >= 0 ? index : 0, sorted.length);
}

export interface ShipCycleTempoResult {
  quartile: 0 | 1 | 2 | 3;
  label: CycleTempoLabel;
  scalar: number;
}

/**
 * Compute the cycle-tempo descriptor for a single ship relative to its fleet.
 * Single source of truth used by motion-planning, detail-model, and
 * accessibility-ledger so the quartile logic is never duplicated.
 *
 * Each call sorts the full marketCap array (O(N log N)). When you need
 * tempos for many ships in the same fleet, prefer `precomputeShipTempos` —
 * it amortizes the sort to a single pass.
 *
 * @param ship - The ship to compute tempo for.
 * @param allShips - All ships in the world (including `ship`).
 */
export function shipCycleTempo(ship: ShipNode, allShips: readonly ShipNode[]): ShipCycleTempoResult {
  const quartile = marketCapQuartile(ship, allShips);
  return {
    quartile,
    label: CYCLE_TEMPO_LABELS[quartile],
    scalar: SPEED_QUARTILE_SCALARS[quartile],
  };
}

/**
 * Precompute cycle-tempo descriptors for every ship in a fleet with one sort.
 * Returns a Map keyed on ship id. O(N log N) total instead of O(N² log N) for
 * naive `ships.map(s => shipCycleTempo(s, ships))`.
 *
 * Use this whenever you need tempos for more than one ship in the same fleet:
 * plan-build (`buildBaseMotionPlan`), detail-index, accessibility-ledger.
 */
export function precomputeShipTempos(allShips: readonly ShipNode[]): Map<string, ShipCycleTempoResult> {
  const result = new Map<string, ShipCycleTempoResult>();
  if (allShips.length === 0) return result;
  if (allShips.length === 1) {
    const ship = allShips[0]!;
    result.set(ship.id, {
      quartile: 0,
      label: CYCLE_TEMPO_LABELS[0],
      scalar: SPEED_QUARTILE_SCALARS[0],
    });
    return result;
  }
  const sorted = [...allShips].sort(compareShipsByMarketCapRank);
  for (const [index, ship] of sorted.entries()) {
    const quartile = quartileForRankPosition(index, sorted.length);
    result.set(ship.id, {
      quartile,
      label: CYCLE_TEMPO_LABELS[quartile],
      scalar: SPEED_QUARTILE_SCALARS[quartile],
    });
  }
  return result;
}

/**
 * Speed scalars indexed by marketCap quartile (0 = lowest, 3 = highest).
 * Applied as a divisor to cycleSeconds so high-quartile ships complete cycles
 * faster (shorter cycleSeconds = faster perceived movement):
 *   cycleSeconds / scalar → Q3 ships are ~15% faster than Q0 ships.
 *
 * The 0.85–1.15 range keeps the cycle within the 780–1560s bounds by design.
 */
export const SPEED_QUARTILE_SCALARS = [0.85, 0.95, 1.05, 1.15] as const;
