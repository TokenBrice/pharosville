import type { ShipNode } from "./world-types";

/**
 * Four human-readable tempo labels corresponding to 24h mint/redeem activity.
 * The magnitude of a coin's signed `flowIntensity` selects the label; the
 * sign remains the separate 24h supply-change reading. These labels surface in
 * the detail panel and accessibility ledger so the rate cue has DOM parity.
 */
export const CYCLE_TEMPO_LABELS = ["Languid", "Steady", "Brisk", "Active"] as const;

export type CycleTempoLabel = typeof CYCLE_TEMPO_LABELS[number];
export const CYCLE_TEMPO_UNAVAILABLE_LABEL = "Unmeasured" as const;
export type CycleTempoDisplayLabel = CycleTempoLabel | typeof CYCLE_TEMPO_UNAVAILABLE_LABEL;

/**
 * The cycle pace now says something about transfers: it tracks the magnitude
 * of the coin's 24h mint/redeem flow, not its market-cap tier. Direction stays
 * in the adjacent 24h supply-change fact.
 */
export function cycleTempoReadingClause(): string {
  return "cycle pace tracks 24h mint/redeem flow intensity by magnitude, not market-cap tier; unavailable flow uses neutral pace and is explicitly disclaimed";
}

/**
 * The old export name is kept because `motion.ts` is a stable barrel consumed
 * by the motion tests and renderer. Its values are now the low-to-high flow
 * intensity interpolation landmarks, not market-cap quartiles.
 */
export const SPEED_QUARTILE_SCALARS = [0.85, 0.95, 1.05, 1.15] as const;

const FLOW_INTENSITY_MAX = 100;

type ShipWithFlowIntensity = ShipNode & { flowIntensity?: number | null };

function normalizedFlowIntensity(ship: ShipNode): number | null {
  const value = (ship as ShipWithFlowIntensity).flowIntensity;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(-FLOW_INTENSITY_MAX, Math.min(FLOW_INTENSITY_MAX, value));
}

function intensityBand(flowIntensity: number): 0 | 1 | 2 | 3 {
  return Math.min(3, Math.floor(Math.abs(flowIntensity) / 25)) as 0 | 1 | 2 | 3;
}

/**
 * Map signed per-coin flow intensity to the existing modest speed band.
 * Missing intensity is deliberately different from measured zero: the former
 * is neutral 1.0 and says nothing, while the latter is a measured languid
 * reading at the slow edge of the band.
 */
export function cycleTempoSpeedScalar(flowIntensity: number | null | undefined): number {
  if (typeof flowIntensity !== "number" || !Number.isFinite(flowIntensity)) return 1;
  const magnitude = Math.min(FLOW_INTENSITY_MAX, Math.abs(flowIntensity));
  const slow = SPEED_QUARTILE_SCALARS[0];
  const fast = SPEED_QUARTILE_SCALARS[SPEED_QUARTILE_SCALARS.length - 1];
  return slow + (fast - slow) * (magnitude / FLOW_INTENSITY_MAX);
}

export interface ShipCycleTempoResult {
  flowIntensity: number | null;
  label: CycleTempoDisplayLabel;
  scalar: number;
}

/**
 * Format the detail-panel value for the same result used by motion planning.
 * An absent feed is explicit: the route remains at neutral speed and the
 * stillness contract is not allowed to turn missing data into a calm reading.
 */
export function cycleTempoDetailLabel(tempo: ShipCycleTempoResult): string {
  if (tempo.flowIntensity === null) {
    return `${CYCLE_TEMPO_UNAVAILABLE_LABEL} — neutral pace (24h mint/redeem flow intensity unavailable)`;
  }
  return `${tempo.label} — ${Math.round(Math.abs(tempo.flowIntensity))}/100 24h mint/redeem flow intensity`;
}

/**
 * Compute the flow-tempo descriptor for a single ship.
 * `allShips` remains in the signature for the shared motion/detail call shape;
 * tempo is per-coin now and no fleet ranking or sort is involved.
 */
export function shipCycleTempo(ship: ShipNode, _allShips: readonly ShipNode[] = []): ShipCycleTempoResult {
  const flowIntensity = normalizedFlowIntensity(ship);
  if (flowIntensity === null) {
    return {
      flowIntensity: null,
      label: CYCLE_TEMPO_UNAVAILABLE_LABEL,
      scalar: 1,
    };
  }
  return {
    flowIntensity,
    label: CYCLE_TEMPO_LABELS[intensityBand(flowIntensity)],
    scalar: cycleTempoSpeedScalar(flowIntensity),
  };
}

/**
 * Precompute cycle-tempo descriptors for every ship. The function remains the
 * fleet-level entry point used by motion planning, detail-index, and the
 * accessibility ledger; the derivation itself is now O(N) because it is
 * independent per coin.
 */
export function precomputeShipTempos(allShips: readonly ShipNode[]): Map<string, ShipCycleTempoResult> {
  const result = new Map<string, ShipCycleTempoResult>();
  for (const ship of allShips) result.set(ship.id, shipCycleTempo(ship, allShips));
  return result;
}
