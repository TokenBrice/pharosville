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

/**
 * data-poetry-1 (K39): clarity is SIGNED so the healthy half of the scale shows.
 * BEDROCK +1, STEADY +0.57, TREMOR 0, FRACTURE −0.71, CRISIS −1.
 */
export function signedSkyClarity(clarity: number): number {
  if (!Number.isFinite(clarity)) return 0;
  return Math.min(1, Math.max(-1, (clarity - NEUTRAL_SKY_CLARITY) / (1 - NEUTRAL_SKY_CLARITY)));
}

/**
 * The three borrowed ranges that carry market stability, in the order the haze takes
 * them (farthest first). The peak beside the crown and the near headland never
 * depend on PSI (K39): they are the composition, not the reading.
 */
export const FAR_SHORE_RANGES = [
  { name: "the far range", threshold: 0.3 },
  { name: "the western ridge", threshold: -0.3 },
  { name: "the eastern ridge", threshold: -0.8 },
] as const;
/** Width of each range's fade below its threshold, in signed clarity. */
export const FAR_SHORE_FADE = 0.25;

/** Visibility 0..1 of each PSI range for a signed clarity; the renderer draws this. */
export function farShoreRangeVisibility(signed: number, index: number): number {
  const threshold = FAR_SHORE_RANGES[index]!.threshold;
  const t = Math.min(1, Math.max(0, (signed - (threshold - FAR_SHORE_FADE)) / FAR_SHORE_FADE));
  return t * t * (3 - 2 * t);
}

/**
 * DOM twin of the ridges (K39: the row names what is visible). The ledger and the
 * detail panel read this, never pixels.
 */
export function farShoreLabel(band: string | null | undefined, unavailable = false): string {
  const clarity = unavailable ? NEUTRAL_SKY_CLARITY : CLARITY[band?.toUpperCase() ?? ""] ?? NEUTRAL_SKY_CLARITY;
  const signed = signedSkyClarity(clarity);
  const visible = FAR_SHORE_RANGES.filter((_, index) => farShoreRangeVisibility(signed, index) >= 0.5)
    .map((range) => range.name);
  const ranges = visible.length === 0
    ? "No far ranges visible, only the peak and the near headland"
    : `${visible.length === FAR_SHORE_RANGES.length ? "All three" : visible.length === 1 ? "One of three" : "Two of three"} ranges visible (${visible.join(", ")})`;
  return `${ranges} — distance you can see follows market stability; it is not weather. Low mist means a stale feed.`;
}

/**
 * X3 (sky-4): clouds aloft follow market stability. Cover is the fraction of
 * the visible sky the painted cloud field takes, by band: BEDROCK a clean sky
 * with two or three high strokes, STEADY fair, TREMOR a high veil, FRACTURE a
 * broken deck, CRISIS low cloud, MELTDOWN overcast. Cover is data, never a
 * forecast and never illumination: the wall clock still lights the clouds.
 */
export const SKY_CLOUD_COVER: Readonly<Record<string, number>> = {
  BEDROCK: 0.05, STEADY: 0.15, TREMOR: 0.3, FRACTURE: 0.5, CRISIS: 0.72, MELTDOWN: 0.88,
};

/** The same cover in words (the now-line and the lighthouse Sky cover row). */
export const SKY_COVER_WORDS: Readonly<Record<string, string>> = {
  BEDROCK: "a clear sky",
  STEADY: "a fair sky",
  TREMOR: "a high veil",
  FRACTURE: "a broken sky",
  CRISIS: "low cloud",
  MELTDOWN: "overcast",
};

const COVER_BY_CLARITY = (["MELTDOWN", "CRISIS", "FRACTURE", "TREMOR", "STEADY", "BEDROCK"] as const)
  .map((band) => [CLARITY[band]!, SKY_CLOUD_COVER[band]!] as const);

/**
 * Cover for a (possibly easing) clarity 0..1: piecewise linear through the
 * band points, so an accepted band change crossfades the sky between the two
 * bands' covers and lands exactly on the new one.
 */
export function skyCloudCover(clarity: number): number {
  const c = Number.isFinite(clarity) ? Math.min(1, Math.max(0, clarity)) : NEUTRAL_SKY_CLARITY;
  for (let i = 1; i < COVER_BY_CLARITY.length; i += 1) {
    const [c1, v1] = COVER_BY_CLARITY[i]!;
    if (c <= c1) {
      const [c0, v0] = COVER_BY_CLARITY[i - 1]!;
      return v0 + ((c - c0) / (c1 - c0)) * (v1 - v0);
    }
  }
  return COVER_BY_CLARITY[COVER_BY_CLARITY.length - 1]![1];
}

/** The clarity a band draws, or null for an unknown band (the debug seam's check). */
export function psiBandClarity(band: string | null | undefined): number | null {
  return CLARITY[band?.toUpperCase() ?? ""] ?? null;
}

/** The cover word for a band; null when unavailable (the sky holds its neutral veil unnamed). */
export function skyCoverWord(band: string | null | undefined, unavailable = false): string | null {
  if (unavailable) return null;
  return SKY_COVER_WORDS[band?.toUpperCase() ?? ""] ?? null;
}

/** DOM twin of the cloud field (the lighthouse Sky cover row and the ledger). */
export function skyCoverLabel(band: string | null | undefined, unavailable = false): string {
  const word = skyCoverWord(band, unavailable);
  if (!word) return "A thin neutral veil — no current stability reading to cover the sky with";
  const capitalised = word.charAt(0).toUpperCase() + word.slice(1);
  return `${capitalised} — cloud aloft follows market stability; it is not weather or a forecast.`;
}

export interface SkyClarityFade {
  from: number;
  to: number;
  sinceSeconds: number;
  value: number;
  started: boolean;
}

/** K39 crossfade: an accepted band change eases over 90 s (instant under reduced motion). */
export const SKY_CLARITY_CROSSFADE_SECONDS = 90;

export function createSkyClarityFade(): SkyClarityFade {
  return { from: 0, to: 0, sinceSeconds: 0, value: 0, started: false };
}

/** Advances the fade in place (the frame path must not allocate) and returns its value. */
export function advanceSkyClarityFade(
  fade: SkyClarityFade,
  target: number,
  timeSeconds: number,
  reducedMotion: boolean,
): number {
  if (!fade.started || reducedMotion) {
    fade.started = true;
    fade.from = fade.to = fade.value = target;
    fade.sinceSeconds = timeSeconds;
    return target;
  }
  if (fade.to !== target || timeSeconds < fade.sinceSeconds) {
    fade.from = fade.value;
    fade.to = target;
    fade.sinceSeconds = timeSeconds;
  }
  const t = Math.min(1, Math.max(0, (timeSeconds - fade.sinceSeconds) / SKY_CLARITY_CROSSFADE_SECONDS));
  fade.value = fade.from + (fade.to - fade.from) * t * t * (3 - 2 * t);
  return fade.value;
}
