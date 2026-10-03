import type { PharosVilleFreshness } from "./world-types";

export interface EpistemicHaze {
  /** Peg-summary instruments: the named DEWS risk waters. */
  riskWaters: boolean;
  /** Chain instruments: every built quay. */
  quays: boolean;
}

/**
 * The bounded haze qualifies non-current instruments. Loading or missing
 * evidence must not be described as current simply because it has no stale flag.
 */
export function deriveEpistemicHaze(
  freshness: PharosVilleFreshness | null | undefined,
): EpistemicHaze {
  return {
    riskWaters: freshness?.pegSummary.state !== "current",
    quays: freshness?.chains.state !== "current",
  };
}

export function epistemicHazeLabel(haze: EpistemicHaze): string {
  if (haze.riskWaters && haze.quays) {
    return "Haze over the risk waters and quays — Peg summary and Chains readings are not current";
  }
  if (haze.riskWaters) return "Haze over the risk waters — Peg summary reading is not current";
  if (haze.quays) return "Haze over the quays — Chains reading is not current";
  return "Clear instruments — Peg summary and Chains feeds are current";
}

export function riskWaterHazeLabel(haze: EpistemicHaze): string {
  return haze.riskWaters
    ? "Hazy — Peg summary reading is not current"
    : "Clear — Peg summary feed is current";
}

export function quayHazeLabel(haze: EpistemicHaze): string {
  return haze.quays
    ? "Hazy — Chains reading is not current"
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
