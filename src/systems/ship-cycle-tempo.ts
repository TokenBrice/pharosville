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

/**
 * Compute the marketCap quartile (0–3) for a ship relative to its fleet.
 * Pure / deterministic. Returns 0 for single-ship fleets.
 */
function marketCapQuartile(marketCap: number, allMarketCaps: number[]): 0 | 1 | 2 | 3 {
  if (allMarketCaps.length <= 1) return 0;
  const sorted = [...allMarketCaps].sort((a, b) => a - b);
  const n = sorted.length;
  // Thresholds at 25%, 50%, 75% of the sorted array.
  const q1 = sorted[Math.floor(n * 0.25)]!;
  const q2 = sorted[Math.floor(n * 0.5)]!;
  const q3 = sorted[Math.floor(n * 0.75)]!;
  if (marketCap < q1) return 0;
  if (marketCap < q2) return 1;
  if (marketCap < q3) return 2;
  return 3;
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
 * @param ship - The ship to compute tempo for.
 * @param allShips - All ships in the world (including `ship`).
 */
export function shipCycleTempo(ship: ShipNode, allShips: readonly ShipNode[]): ShipCycleTempoResult {
  const allMarketCaps = allShips.map((s) => s.marketCapUsd);
  const quartile = marketCapQuartile(ship.marketCapUsd, allMarketCaps);
  return {
    quartile,
    label: CYCLE_TEMPO_LABELS[quartile],
    scalar: SPEED_QUARTILE_SCALARS[quartile],
  };
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
