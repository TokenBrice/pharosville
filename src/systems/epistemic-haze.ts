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

export interface EpistemicFogSource {
  id: string;
  feed: "Peg summary" | "Chains";
  stale: boolean;
  /** World-space centre and bounded radius, supplied by the water/quay owner. */
  centre: { x: number; z: number };
  radius: number;
  lastGood: string | null;
}

export interface EpistemicFogBank extends EpistemicFogSource {
  strength: number;
  arrival: number;
  edgeSeconds: number;
  edgeStrength: number;
  caption: string;
}

/** Freshness edges take 45 seconds to arrive or clear; no global fog writes. */
export function advanceEpistemicHaze(
  sources: readonly EpistemicFogSource[],
  previous: readonly EpistemicFogBank[],
  timeSeconds: number,
  reducedMotion = false,
): readonly EpistemicFogBank[] {
  return sources.map((source) => {
    const prior = previous.find((bank) => bank.id === source.id);
    const edge = !prior || prior.stale !== source.stale;
    const edgeSeconds = edge ? timeSeconds : prior.edgeSeconds;
    const edgeStrength = edge ? prior?.strength ?? 0 : prior.edgeStrength;
    const progress = Math.min(1, Math.max(0, (timeSeconds - edgeSeconds) / 45));
    const target = source.stale ? 1 : 0;
    const strength = reducedMotion ? target : edgeStrength + (target - edgeStrength) * progress;
    return {
      ...source,
      radius: Math.min(24, Math.max(1, source.radius)),
      strength,
      arrival: reducedMotion ? 1 : source.stale ? progress : prior?.arrival ?? 1,
      edgeSeconds,
      edgeStrength,
      caption: `${source.feed} last good ${source.lastGood ?? "unavailable"}`,
    };
  });
}
