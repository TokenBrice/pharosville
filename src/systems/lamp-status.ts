import type { PharosVilleFreshness } from "./world-types";

/**
 * The endpoint groups that make up the harbour's single liveness reading.
 * An omitted flag is not evidence of a failed feed, so it remains fresh until
 * the query layer can prove that the corresponding last-good copy is stale.
 */
export const LAMP_FRESHNESS_KEYS = [
  "stablecoinsStale",
  "chainsStale",
  "stabilityStale",
  "pegSummaryStale",
  "stressStale",
  "reportCardsStale",
  "mintBurnStale",
] as const satisfies readonly (keyof PharosVilleFreshness)[];

export type LampStatus = "fresh" | "stale" | "unreachable";

/** Two successive world observations prevent one failed poll from flickering. */
export const LAMP_STATUS_HYSTERESIS_POLLS = 2;

/** Render-side status transitions use this time constant, in seconds. */
export const LAMP_STATUS_TRANSITION_SECONDS = 30;

export interface LampStatusHysteresisState {
  status: LampStatus;
  pendingStatus: LampStatus | null;
  pendingObservations: number;
}

/** The raw, stateless fold used by the hysteresis state machine. */
export function deriveLampStatus(freshness: PharosVilleFreshness): LampStatus {
  const staleCount = LAMP_FRESHNESS_KEYS.reduce(
    (count, key) => count + (freshness[key] === true ? 1 : 0),
    0,
  );
  if (staleCount === LAMP_FRESHNESS_KEYS.length) return "unreachable";
  return staleCount > 0 ? "stale" : "fresh";
}

/** Start from the current reading; only later observations are hysteretic. */
export function initialLampStatusState(freshness: PharosVilleFreshness): LampStatusHysteresisState {
  return {
    status: deriveLampStatus(freshness),
    pendingStatus: null,
    pendingObservations: 0,
  };
}

/**
 * Advance the pure status state machine by one world observation. A changed
 * raw fold must be observed twice before it becomes the lamp's stable state;
 * a return to the old fold cancels the pending transition immediately.
 */
export function advanceLampStatus(
  state: LampStatusHysteresisState,
  freshness: PharosVilleFreshness,
): LampStatusHysteresisState {
  const observed = deriveLampStatus(freshness);
  if (observed === state.status) {
    return {
      status: state.status,
      pendingStatus: null,
      pendingObservations: 0,
    };
  }

  const pendingObservations = state.pendingStatus === observed
    ? state.pendingObservations + 1
    : 1;
  if (pendingObservations >= LAMP_STATUS_HYSTERESIS_POLLS) {
    return {
      status: observed,
      pendingStatus: null,
      pendingObservations: 0,
    };
  }
  return {
    status: state.status,
    pendingStatus: observed,
    pendingObservations,
  };
}

/** Position of a stable status in the render transition ladder. */
export function lampStatusMixForStatus(status: LampStatus): number {
  switch (status) {
    case "fresh": return 0;
    case "stale": return 1;
    case "unreachable": return 2;
  }
}

export interface LampStatusModulation {
  /** How far the lamp leans toward the cool harbour-night temperature. */
  coolMix: number;
  /** Multiplier applied after the existing PSI and day-cycle intensity. */
  intensityScale: number;
  /** Multiplier applied to the existing PSI-driven sweep tempo. */
  rotationScale: number;
}

const LAMP_STATUS_MODULATION: readonly LampStatusModulation[] = [
  { coolMix: 0, intensityScale: 1, rotationScale: 1 },
  { coolMix: 0.62, intensityScale: 0.82, rotationScale: 0.64 },
  { coolMix: 0.9, intensityScale: 0.2, rotationScale: 0.4 },
];

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

/** Resolve an eased status position without any Three.js dependency. */
export function lampStatusModulationForMix(
  mix: number,
  out?: LampStatusModulation,
): LampStatusModulation {
  const result = out ?? { coolMix: 0, intensityScale: 1, rotationScale: 1 };
  const clamped = Math.min(2, Math.max(0, Number.isFinite(mix) ? mix : 0));
  if (clamped >= 2) {
    Object.assign(result, LAMP_STATUS_MODULATION[2]);
    return result;
  }
  const lowerIndex = Math.min(1, Math.floor(clamped));
  const upperIndex = lowerIndex + 1;
  const amount = clamped - lowerIndex;
  const lower = LAMP_STATUS_MODULATION[lowerIndex]!;
  const upper = LAMP_STATUS_MODULATION[upperIndex]!;
  result.coolMix = lerp(lower.coolMix, upper.coolMix, amount);
  result.intensityScale = lerp(lower.intensityScale, upper.intensityScale, amount);
  result.rotationScale = lerp(lower.rotationScale, upper.rotationScale, amount);
  return result;
}

/** Text shared by the detail row and the accessibility-ledger cue. */
export function lampStatusReading(status: LampStatus): string {
  switch (status) {
    case "fresh": return "steady — all feeds fresh";
    case "stale": return "cooler and slower — some feeds stale";
    case "unreachable": return "dimmed — API unreachable; showing last-good data";
  }
}
