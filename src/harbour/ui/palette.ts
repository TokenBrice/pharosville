/**
 * The night bridge (O8-I1, E03c): after dusk the overlay's chart paper turns to the S-52-style night palette
 * (harbour-ui.css `.hb-ui[data-palette="night"]`), so the Pharos's fire, not the chrome, holds the brightest pixels.
 * The UI reads the world's night factor (uNight: the clock and calendar only, never a reading) at its 1 Hz tick:
 * night above 0.55, day again below 0.45, so dusk and dawn never flicker between the two. The switch crossfades
 * every colour token together over --t-palette (a cut under reduced motion).
 */
export type Palette = "day" | "night";

export const NIGHT_ON = 0.55;
export const NIGHT_OFF = 0.45;

/** The palette for this night factor; between the thresholds the current one holds (a first reading splits at 0.5). */
export function nextPalette(current: Palette | null | undefined, night: number): Palette {
  if (night > NIGHT_ON) return "night";
  if (night < NIGHT_OFF) return "day";
  return current ?? (night >= 0.5 ? "night" : "day");
}

/**
 * The colour tokens the night palette redefines (palette.test.ts keeps this list equal to the night block). Registered
 * as <color>, they interpolate: one transition on the root crossfades every surface, rule, halo and gradient stop at
 * once. The paper grain and the sheet shadow are not colours; they change at the flip, where they barely show.
 */
export const PALETTE_TOKENS = ("paper paper-2 paper-3 ink ink-2 ink-3 brass-ink rule neat edge dot-rule wash-1 wash-2 wash-3 face link up "
  + "down focus live stale stale-ink unavail halo sea-ink medal ring sheen-hi sheen-lo chart-down c1 c2 c3 c4 c5 c-other").split(" ");

/** The root's transition-property (its duration and curve live in harbour-ui.css). */
export const PALETTE_FADE = { transitionProperty: PALETTE_TOKENS.map((t) => `--${t}`).join() };

/** Once per page. Already registered (a remount, a hot reload) or no API (older browsers, jsdom): a cut instead of a fade. */
export function registerPaletteTokens(): void {
  for (const t of PALETTE_TOKENS) {
    try { CSS.registerProperty({ name: `--${t}`, syntax: "<color>", inherits: true, initialValue: "transparent" }); } catch { /* see above */ }
  }
}
