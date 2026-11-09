/**
 * W10 SEASONAL SKY CHARACTER (pure, unit-tested). The season (calendar, decorative) chooses only the SHAPE of the
 * painted cloud: tall summer cumulus, long low autumn banks with a mackerel band, flat pale winter stratocumulus,
 * small spring fair-weather clouds with more cirrus. How MUCH cloud there is stays DEWS: the reveal by cover
 * never reads the season, and each bank keeps its painted area (width × height), so no season looks stormier.
 */

/** Season weights in contract order: spring, summer, autumn, winter (sum 1). */
export type SkySeasonWeights = readonly [number, number, number, number];

/** Aspect (width ÷ height multiplier, area kept) per season, and how much the near/far layers take it. */
const ASPECT = [0.85, 0.72, 1.35, 1.5] as const;

export interface BankShape { w: number; h: number }

/** In calm weather the autumn banks lie this long (their stretched, stormy-looking runs only with more cover). */
const AUTUMN_CALM_ASPECT = 1.08;

/**
 * A bank's season shape: aspect changes, area (w × h) preserved. `near` 0 far … 1 near layer (towers grow near).
 * `calm` 0..1 (from the DEWS cover, never the season) shortens the autumn's long low runs toward plain banks.
 */
export function seasonBankShape(base: BankShape, weights: SkySeasonWeights, near: number, calm = 0): BankShape {
  let a = 0;
  for (let i = 0; i < 4; i++) a += weights[i] * Math.log(i === 2 ? ASPECT[2] + (AUTUMN_CALM_ASPECT - ASPECT[2]) * calm : ASPECT[i]);
  // summer towers rise most in the near layer; winter flattens every layer alike
  const k = Math.exp(a * (0.6 + 0.4 * (weights[1] > 0.5 ? near : 1)));
  const s = Math.sqrt(k);
  return { w: base.w * s, h: base.h / s };
}

/** Reveal of a bank by cloud cover (slot order): DEWS only — the season is not an argument. */
export function bankReveal(cover: number, slot: number, maxBanks: number): number {
  return Math.min(1, Math.max(0, 5 + cover * maxBanks - slot));
}

/** Decorative high-cloud character: x cirrus amount multiplier, y autumn mackerel (altocumulus) band 0..1. */
export function seasonHighCloud(weights: SkySeasonWeights): [number, number] {
  return [1 + 0.35 * weights[0] - 0.15 * weights[3], weights[2]];
}
