import type { LighthouseNode, PharosVilleFreshness } from "./world-types";

export const NEUTRAL_SKY_CLARITY = 0.65;
const CLARITY: Readonly<Record<string, number>> = {
  BEDROCK: 1, STEADY: 0.85, TREMOR: 0.65, FRACTURE: 0.4, CRISIS: 0.2, MELTDOWN: 0,
};

export interface PsiSkyInput {
  lighthouse: Pick<LighthouseNode, "psiBand" | "score" | "unavailable">;
  freshness?: PharosVilleFreshness;
  timeSeconds: number;
  asOf?: string | null;
}

export interface PsiSkyClarity {
  clarity: number;
  band: string;
  asOf: string | null;
  stale: boolean;
  pendingBand: string | null;
  pendingSinceSeconds: number;
}

/** Market stability correlates with cover, never illumination or a forecast.
 * A candidate band must remain current for sixty seconds before acceptance.
 * Stale intervals cancel the candidate, rather than counting as observation.
 */
export function psiSkyClarity(seaState: PsiSkyInput, previous: PsiSkyClarity | null = null): PsiSkyClarity {
  const { lighthouse, timeSeconds } = seaState;
  const stale = seaState.freshness?.stabilityStale === true;
  if (stale && previous) {
    if (previous.stale && previous.pendingBand === null) return previous;
    return { ...previous, stale: true, pendingBand: null };
  }
  const band = lighthouse.psiBand?.toUpperCase() ?? "UNAVAILABLE";
  const available = !stale && !lighthouse.unavailable && CLARITY[band] !== undefined;
  if (!available) {
    return { clarity: NEUTRAL_SKY_CLARITY, band: "UNAVAILABLE", asOf: null, stale, pendingBand: null, pendingSinceSeconds: timeSeconds };
  }
  const asOf = seaState.asOf ?? null;
  if (!previous || previous.band === "UNAVAILABLE") {
    return { clarity: CLARITY[band]!, band, asOf, stale: false, pendingBand: null, pendingSinceSeconds: timeSeconds };
  }
  if (band === previous.band) {
    if (!previous.stale && previous.pendingBand === null && previous.asOf === asOf) return previous;
    return { ...previous, asOf, stale: false, pendingBand: null };
  }
  if (previous.pendingBand !== band || timeSeconds < previous.pendingSinceSeconds) {
    return { ...previous, stale: false, pendingBand: band, pendingSinceSeconds: timeSeconds };
  }
  if (timeSeconds - previous.pendingSinceSeconds < 60) return previous;
  return { clarity: CLARITY[band]!, band, asOf, stale: false, pendingBand: null, pendingSinceSeconds: timeSeconds };
}
