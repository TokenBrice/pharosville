/**
 * Per-issuer sail overrides — the escape hatch the heraldry plan named as R1.
 *
 * `PIRATE_CONTRAST_FLOOR` (see `garden-sail-texture.ts`) is one number applied
 * to a whole fleet, and six issuers landed just above it, between 2.00 and 2.09
 * against white. That band is pale enough that a white mark reads weakly but
 * not pale enough for the rule to catch it — the weakest identity read in the
 * fleet, and the one residual the 2026-07-25 heraldry pass left open.
 *
 * Moving the floor to 2.2 would sweep all six with a single character. It would
 * also blacken DAI, and DAI's amber is an operator decision: D5 set the floor at
 * 2.0 knowing DAI sat at 2.09, because a top-tier coin's colour is a
 * recognition cue worth more than the contrast it costs. So the five that are
 * NOT DAI are named here, one line each, and the constant stays where the
 * operator put it.
 *
 * **DAI (`dai-makerdao`) is deliberately absent.** It is not an oversight and
 * not a gap to close — adding it reverses D5. If DAI's amber should ever go
 * dark, that is the operator's call and not a tidy-up.
 *
 * Listed ships take the same hue-preserving near-black as the contrast rule
 * produces, never `#000`, so each keeps a whisper of its own colour and the
 * five do not collapse onto one another.
 *
 * Contrasts below are measured on the DYED cloth — the brand primary lifted 17%
 * toward canvas — because that is the colour the rule itself compares, not the
 * raw brand hex.
 */
export const SAIL_DARK_CANVAS_ISSUERS: ReadonlySet<string> = new Set([
  "bean-beanstalk", //     2.05 — mid leaf green
  "cash-phantom", //       2.01 — warm grey, the palest of the five
  "csusdl-coinshift", //   2.03 — light coral
  "eusd-lybra", //         2.06 — light sky blue
  "zchf-frankencoin", //   2.04 — near-neutral silver
]);
