import type { DewsAreaBand } from "./world-types";

/**
 * The harbor's dye lot.
 *
 * Golden Garden palette (2026-09-07). The perceptual OKLCH ceiling is now
 * C < 0.16 — one step under the reserved vermillion (C 0.177), which stays the
 * loudest thing by construction. The previous warm-village lot (C < 0.14) put
 * warm hues at restrained chroma under a cold indigo sky fill, and the frame
 * read as "trying to be warm": ochre went to mud and moss to olive-grey. This
 * lot is authored for a golden-hour key against a complementary cool side:
 *
 *   - Land is luxuriant: `aurora_green` moves from a blue-leaning grass
 *     (H 145, C 0.125) to a warm, sunlit moss (H 134, C 0.15); timber, stone
 *     and roof rungs all gain ~0.02 C and a step of lightness.
 *   - The sea is a turquoise → emerald-teal → indigo descent rather than a
 *     cyan pool; `deep_sea_2` and the night sky move from kachi-iro navy
 *     toward a violet-indigo (H 286–288), which is the cool that makes an
 *     ember or a lantern read as light instead of as an orange tint.
 *   - The day sky is a lighter cerulean with a gold-cream horizon and a warm
 *     fog, so the fill never fights the honey key.
 *   - Mist keeps a hue but moves off ainezu onto a violet-grey.
 *
 * Why OKLCH and not HSL. HSL saturation is a ratio against available
 * lightness, so it inflates without bound as a colour darkens: authentic
 * kachi-iro (#181b39) measures HSL S 41 % while remaining a near-black
 * indigo. The ceiling is therefore applied in perceptual chroma — OKLCH C —
 * and cross-checked against the sRGB-cube spread ranked in `palette.test.ts`.
 *
 * RESERVED accents are unchanged and may sit above the ceiling:
 *   - `vermillion` #c23a22 is shu-akane (真朱), the single sacred accent,
 *     spent on the Pharos beacon flame and the DEWS DANGER band.
 *   - `lantern_warm` #d49a3e is yamabuki (山吹) gold and remains hex-pinned by
 *     `scripts/check-pharosville-colors.mjs`.
 *   - `lantern_glow`, `sail_red`, and `bloodmoon_red` remain load-bearing
 *     identity or rare-event accents.
 *
 * NOT TOUCHED: `sail_teal` / `sail_red` are issuer-identity anchors and the
 * restraint contract forbids grading them; `DEWS_AREA_LABEL_COLORS` remains
 * the separately harmonized ladder locked by test.
 */
export const HARBOR_PALETTE = {
  // The cool field: turquoise shelf, emerald-teal body, indigo deep, violet
  // abyss. Authored under the C 0.16 ceiling with enough dye to survive the
  // key light, the fog and the grade.
  deep_sea_2: "#151030", // violet-indigo abyss — OKLCH L 0.200 C 0.061 H 287
  deep_sea_1: "#0c2d57", // indigo — OKLCH L 0.299 C 0.085 H 256
  shallow_teal: "#0d7176", // emerald-teal — OKLCH L 0.500 C 0.082 H 200
  shallow_teal_lit: "#189290", // turquoise shelf — OKLCH L 0.599 C 0.098 H 193
  sky_night: "#171233", // violet-indigo zenith — OKLCH L 0.210 C 0.063 H 287
  sky_horizon: "#2d2554", // violet — OKLCH L 0.300 C 0.082 H 288
  // Mist carries a violet-grey hue: it is the cool side of the ember hour.
  fog_blue: "#52537e", // OKLCH L 0.460 C 0.070 H 282
  fog_pale: "#767b9c", // OKLCH L 0.591 C 0.051 H 278
  // Golden day: a lighter cerulean zenith so the sky fill reveals form
  // without cooling it, a gold-cream horizon, warm fog, and a honey key.
  sky_day_zenith: "#247dad", // cerulean — OKLCH L 0.561 C 0.110 H 238
  sky_day_horizon: "#f3dca9", // gold cream — OKLCH L 0.901 C 0.071 H 87
  fog_day: "#e2d2b3", // warm haze — OKLCH L 0.869 C 0.045 H 84
  sun_day_warm: "#fedd9a", // honey key — OKLCH L 0.910 C 0.092 H 84
  vermillion: "#c23a22", // shu-akane (真朱) — RESERVED, the one loud thing
  stone_dark: "#332a1f", // OKLCH L 0.292 C 0.023 H 72
  stone_mid: "#5a4a37", // OKLCH L 0.420 C 0.037 H 71
  stone_pale: "#7e6b51", // OKLCH L 0.539 C 0.045 H 75
  iron_dark: "#1a1612",
  timber_dark: "#3a2a1e", // kogecha's hue exactly (焦茶, H 57)
  timber_mid: "#7b4713", // OKLCH L 0.451 C 0.095 H 60
  timber_warm: "#976b2e", // OKLCH L 0.561 C 0.095 H 72
  // Station roofs form one material ladder: storm slate and tea-house slate at
  // the dark end, then slate kawara, clay, timber shake, weathered copper,
  // dressed stone and cote clay, with thatch catching the most light.
  roof_storm_slate: "#354750",
  roof_tea_house_slate: "#40515b",
  roof_slate_kawara: "#56606b",
  roof_clay: "#bc602b", // terracotta — OKLCH L 0.590 C 0.135 H 48
  roof_timber_shake: "#b96626", // warm cedar — OKLCH L 0.595 C 0.130 H 54
  roof_weathered_copper: "#5f7a59", // OKLCH L 0.549 C 0.059 H 140
  roof_dressed_stone: "#747a7c",
  roof_cote_clay: "#d47636", // OKLCH L 0.660 C 0.140 H 52
  roof_thatch: "#e2ae43", // sunlit straw — OKLCH L 0.780 C 0.135 H 82
  ember: "#2a1a0e",
  lantern_warm: "#d49a3e", // yamabuki (山吹) — RESERVED, and hex-pinned
  lantern_glow: "#f7d68a",
  lantern_cold: "#4c94ac", // OKLCH L 0.629 C 0.080 H 222
  moonlight: "#b2dcee", // cyan moonlight — OKLCH L 0.870 C 0.050 H 226
  sail_teal: "#3a5e5a", // issuer identity — restraint contract, do not grade
  sail_red: "#9a3a2e", // issuer identity — restraint contract, do not grade
  foam_white: "#e8eef0",
  aurora_green: "#67a23a", // sunlit moss — OKLCH L 0.650 C 0.150 H 134
  bloodmoon_red: "#c83a3a",
} as const;

/**
 * The band accent — the colour a named body of water's own label rule, and its
 * marker buoy lamp, carry.
 *
 * W0.5 (2026-08-13): these were the five framework defaults — `#22c55e`,
 * `#14b8a6`, `#eab308`, `#f97316`, `#ef4444` — a Tailwind traffic light shipped
 * into a ukiyo-e harbour. They arrived from a dashboard and read like one: two
 * of them (a lime green and a pure yellow) sit at chroma 0.64-0.89, well past
 * anything else in HARBOR_PALETTE, and the set had no ladder at all — alert was
 * the LIGHTEST of the five and danger the darkest, so the escalation ran up and
 * then down again.
 *
 * Each is now pulled toward a harbor anchor exactly the way the water tints
 * were (`garden-zones.ts` ZONE_COLOR_HARMONY is the precedent and the
 * technique): calm and watch toward `sail_teal`, alert toward `lantern_warm`,
 * warning between `timber_warm` and `vermillion`, danger onto `vermillion`
 * itself — the reserved accent, spent here because the highest-priority data
 * state is exactly what it is reserved for.
 *
 * Two properties are load-bearing and are enforced by `palette.test.ts`:
 *
 * 1. ORDER. The ramp descends monotonically in relative luminance
 *    (0.501 -> 0.399 -> 0.321 -> 0.251 -> 0.199, an even ~1.22:1 step between
 *    neighbours) and rises monotonically in chroma (0.20 -> 0.28 -> 0.42 ->
 *    0.52 -> 0.60). Escalation therefore reads as one ordered scale — the water
 *    gets deeper and the dye gets stronger — in the same direction the
 *    `ZONE_THEMES` water bases already ramp, and it survives being seen in
 *    greyscale.
 * 2. LEGIBILITY. Every accent clears WCAG AA (4.5:1) as text against the shell
 *    ground `#050d13`: 10.27, 8.36, 6.91, 5.61, 4.64:1. Danger is the floor of
 *    the set, which is why it sits a step above pure `vermillion` (#c23a22,
 *    3.66:1 — below AA) rather than on it.
 *
 * Hue is never the only channel: the band NAME is the primary one (the sea sign
 * paints it in bone white, and the ledger and detail panel spell it out), which
 * is what lets these be quiet.
 */
export const DEWS_AREA_LABEL_COLORS = {
  CALM: "#94c7ac",
  WATCH: "#6fb6ae",
  ALERT: "#b7954c",
  WARNING: "#c97344",
  DANGER: "#d54e3c",
} as const satisfies Record<DewsAreaBand, string>;

export const LEDGER_INK_HEX = "#d9b974";

export interface ZoneVisualTheme {
  base: string;
  label: {
    accent: string;
  };
}

/**
 * The WATER colour of each terrain — the tint its sea carries, and the swatch
 * the legend and detail panel show for it.
 *
 * Warm-village re-grade (2026-09-05): the risk-water ladder now walks from
 * green-teal calm toward blue-teal danger while descending in lightness. The
 * cooler, more saturated family separates sea from the ochre/green land
 * without turning analytical regions into warm paint.
 *
 * The one deliberate outsider is `ledger-water`: NAV-priced water is not a
 * risk band at all, and its slate keeps it legible as a different KIND of
 * water rather than a rung on the same ladder.
 */
export const ZONE_THEMES = {
  "alert-water": { base: "#00657b", label: { accent: DEWS_AREA_LABEL_COLORS.ALERT } }, // L 0.469 C 0.085 H 220
  "calm-water": { base: "#008081", label: { accent: DEWS_AREA_LABEL_COLORS.CALM } }, // L 0.544 C 0.093 H 196
  "deep-water": { base: "#001d35", label: { accent: "#d8b56a" } },
  "harbor-water": { base: "#007780", label: { accent: "#d8b56a" } },
  "ledger-water": { base: "#3d4860", label: { accent: LEDGER_INK_HEX } },
  "storm-water": { base: "#003b58", label: { accent: DEWS_AREA_LABEL_COLORS.DANGER } }, // L 0.335 C 0.074 H 238
  "watch-water": { base: "#00737e", label: { accent: DEWS_AREA_LABEL_COLORS.WATCH } }, // L 0.508 C 0.087 H 206
  "warning-water": { base: "#00536f", label: { accent: DEWS_AREA_LABEL_COLORS.WARNING } }, // L 0.414 C 0.082 H 230
  water: { base: "#006378", label: { accent: "#d8b56a" } },
} as const satisfies Record<string, ZoneVisualTheme>;

export function zoneThemeForTerrain(kind: string): ZoneVisualTheme {
  return ZONE_THEMES[kind as keyof typeof ZONE_THEMES] ?? ZONE_THEMES.water;
}
