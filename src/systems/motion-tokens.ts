/**
 * W3.2 — the named motion vocabulary shared by TypeScript render systems and
 * DOM CSS. CSS consumes the matching `--pv-motion-*` properties declared in
 * `pharosville.css`; the exported names keep JS-authored transitions on the
 * same vocabulary instead of scattering anonymous ease-outs and durations.
 *
 * Springs are deliberately absent: render-path motion must remain a pure,
 * deterministic function of the world clock.
 */
export const GARDEN_MOTION_CURVES = Object.freeze({
  settle: Object.freeze({ css: "cubic-bezier(0.22, 1, 0.36, 1)", cssVar: "--pv-motion-curve-settle" }),
  drift: Object.freeze({ css: "linear", cssVar: "--pv-motion-curve-drift" }),
  breathe: Object.freeze({ css: "cubic-bezier(0.45, 0, 0.55, 1)", cssVar: "--pv-motion-curve-breathe" }),
} as const);

export const GARDEN_MOTION_DURATIONS = Object.freeze({
  whisper: Object.freeze({ css: "300ms", cssVar: "--pv-motion-duration-whisper", ms: 300 }),
  settle: Object.freeze({ css: "450ms", cssVar: "--pv-motion-duration-settle", ms: 450 }),
  breathe: Object.freeze({ css: "9s", cssVar: "--pv-motion-duration-breathe", ms: 9_000 }),
  tide: Object.freeze({ css: "30s", cssVar: "--pv-motion-duration-tide", ms: 30_000 }),
  weather: Object.freeze({ css: "90s", cssVar: "--pv-motion-duration-weather", ms: 90_000 }),
} as const);

/** The W3.2 oscillator audit: every named route and its sanctioned driver. */
export const GARDEN_MOTION_AUDIT = Object.freeze([
  { system: "sails-and-chain-flags", driver: "wind+gust" },
  { system: "wakes", driver: "ship-motion+breath" },
  { system: "mist-opacity", driver: "breath" },
  { system: "lantern-emissive", driver: "breath" },
  { system: "buoy-and-ship-bob", driver: "sea+breath" },
  { system: "gull-soaring-direction", driver: "wind" },
  { system: "water-normal-scroll", driver: "wind+breath" },
  { system: "ripples", driver: "fast-exception" },
  { system: "wingbeats", driver: "fast-exception" },
] as const);
