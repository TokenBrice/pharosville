import { townDensity } from "./walkways";

/**
 * ROLES BY THE HOUR (09-L1/L2, declared decorative: time of day and weather only, never data). The townsfolk cast
 * is fixed; each actor has a role, and each role its own hour curve (the share of that role's actors about):
 *
 * - folk         the strollers, standers and sitters (`townDensity`)
 * - angler       on the quay copings with a rod, at dawn (and a few at dusk)
 * - vendor       behind the Customs market stalls, in the morning
 * - promenader   in twos on the moles' promenades, at dusk
 * - watchman     one, with a lantern, on the quays from 23 h to 4 h
 * - keeper       one cloaked figure with a lantern on the Pharos causeway, 0–4 h (no name, no panel, no hover)
 * - shepherd     one, with a crook, on the west lobe's farm road by day
 * - carter       one, leading the donkey and its hay cart on the same road by day (off the roads at night)
 *
 * Storms thin everyone (`stormShare`): weather is the DEWS signal, and life only ever withdraws from it.
 */
export type Role = "folk" | "angler" | "vendor" | "promenader" | "watchman" | "keeper" | "shepherd" | "carter";

type Knots = ReadonlyArray<readonly [number, number]>;

const CURVES: Record<Exclude<Role, "folk">, Knots> = {
  angler: [[0, 0], [4.6, 0], [5.4, 0.8], [6.5, 1], [8.2, 0.7], [9.6, 0], [17.2, 0], [18.2, 0.35], [19.6, 0.3], [20.4, 0], [24, 0]],
  vendor: [[0, 0], [6.6, 0], [7.6, 0.7], [8.4, 1], [12.4, 1], [13.4, 0.35], [14.6, 0], [24, 0]],
  promenader: [[0, 0], [16.8, 0], [17.6, 0.5], [18.4, 1], [20, 1], [20.9, 0], [24, 0]],
  watchman: [[0, 1], [4, 1], [4.01, 0], [22.99, 0], [23, 1], [24, 1]],
  keeper: [[0, 1], [4, 1], [4.01, 0], [23.99, 0], [24, 1]],
  shepherd: [[0, 0], [6.4, 0], [6.5, 1], [18.4, 1], [18.5, 0], [24, 0]],
  carter: [[0, 0], [7, 0], [7.1, 1], [17.9, 1], [18, 0], [24, 0]],
};

function piecewise(k: Knots, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < k.length; i++) {
    const [h1, v1] = k[i];
    if (h <= h1) {
      const [h0, v0] = k[i - 1];
      return v0 + (v1 - v0) * (h - h0) / Math.max(1e-6, h1 - h0);
    }
  }
  return k[k.length - 1][1];
}

/** Share (0..1) of a role's actors about at this hour, before the quality tier and the weather. */
export function roleDensity(role: Role, hour: number): number {
  return role === "folk" ? townDensity(hour) : piecewise(CURVES[role], hour);
}

/**
 * Share of life that stays out in this wind (the DEWS wind 0..1: CALM 0.2 … DANGER 1). Full up to WATCH, about half
 * at WARNING, a third at DANGER. Never above 1: weather removes life, it never adds it.
 */
export function stormShare(wind: number): number {
  const t = Math.min(1, Math.max(0, (wind - 0.45) / 0.5));
  return 1 - 0.65 * t * t * (3 - 2 * t);
}
