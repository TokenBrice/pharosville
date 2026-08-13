import type { PharosVilleFreshness } from "./world-types";

export interface EpistemicHaze {
  /** Peg-summary instruments: the named DEWS risk waters. */
  riskWaters: boolean;
  /** Chain instruments: every built quay. */
  quays: boolean;
}

/**
 * W7.4's one semantic derivation. Rendering and every DOM equivalent consume
 * these same two booleans; absence is clear water, never an invented stale
 * reading.
 */
export function deriveEpistemicHaze(
  freshness: PharosVilleFreshness | null | undefined,
): EpistemicHaze {
  return {
    riskWaters: freshness?.pegSummaryStale === true,
    quays: freshness?.chainsStale === true,
  };
}

export function epistemicHazeLabel(haze: EpistemicHaze): string {
  if (haze.riskWaters && haze.quays) {
    return "Haze over the risk waters and quays — Peg summary and Chains feeds are stale";
  }
  if (haze.riskWaters) return "Haze over the risk waters — Peg summary feed is stale";
  if (haze.quays) return "Haze over the quays — Chains feed is stale";
  return "Clear instruments — Peg summary and Chains feeds are current";
}

export function riskWaterHazeLabel(haze: EpistemicHaze): string {
  return haze.riskWaters
    ? "Hazy — Peg summary feed is stale"
    : "Clear — Peg summary feed is current";
}

export function quayHazeLabel(haze: EpistemicHaze): string {
  return haze.quays
    ? "Hazy — Chains feed is stale"
    : "Clear — Chains feed is current";
}
