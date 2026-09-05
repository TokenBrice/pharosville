import type { DewsAreaBand } from "./world-types";

/**
 * The harbor's dye lot.
 *
 * Warm-village palette (2026-09-05). The perceptual OKLCH ceiling is now
 * C < 0.14: enough dye for warm ochre roofs and timber, living moss, and a
 * cooler teal sea to separate the two largest fields by hue instead of value
 * alone. `roof_clay`, `roof_cote_clay`, `roof_thatch`,
 * `roof_timber_shake`, `timber_mid`, and `timber_warm` moved toward the warm
 * ochre/terracotta register; `aurora_green` moved from verdigris to grass;
 * `deep_sea_1`, `shallow_teal`, and `shallow_teal_lit` moved toward a clearer
 * teal/indigo descent.
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
  // The cool field is a teal-to-indigo descent; authored values stay below the
  // C 0.14 ceiling while retaining enough dye to survive lighting and fog.
  deep_sea_2: "#0a0e20",
  deep_sea_1: "#002a52", // ai-fukami — OKLCH L 0.284 C 0.085 H 252
  shallow_teal: "#006078", // nando-iro — OKLCH L 0.454 C 0.084 H 223
  shallow_teal_lit: "#007487", // asagi-iro — OKLCH L 0.514 C 0.091 H 214
  sky_night: "#0f1128", // kachi-iro (勝色) night zenith
  sky_horizon: "#1c2240", // kachi-iro
  // Fog is where chroma had to come out: mist that carries a hue is paint.
  // Both now sit on ainezu (藍鼠, "indigo mouse") — fog_blue C 0.076 -> 0.061,
  // fog_pale C 0.070 -> 0.049.
  fog_blue: "#365371", // ainezu, night/dusk mist
  fog_pale: "#57758b", // ainezu, lifted
  // Garden Sea day identity (D-R1 ukiyo-e day, supersedes the D1 pearl
  // overcast): a saturated-but-harmonious bokashi sky, warm key sun, and one
  // reserved vermillion accent (lighthouse crown + danger semantics).
  // Pharos Wonder 2026-07-24 (D6): the reserved vermillion is spent on the
  // Pharos beacon fire — the flame's outer band (garden-beacon-fire.ts).
  sky_day_zenith: "#1f587c", // ai-iro (藍色) — was six degrees off it already
  sky_day_horizon: "#e6d9b9", // toward shironeri (白練), undyed silk
  fog_day: "#d8cfb4", // shironeri
  sun_day_warm: "#f6dbae", // yamabuki light — hue 88 -> 80, off the acid edge
  vermillion: "#c23a22", // shu-akane (真朱) — RESERVED, the one loud thing
  stone_dark: "#2a2620",
  stone_mid: "#4a4238",
  stone_pale: "#6a5e4e",
  iron_dark: "#1a1612",
  timber_dark: "#3a2a1e", // already kogecha's hue exactly (焦茶, H 57)
  timber_mid: "#6b421f", // kogecha — OKLCH L 0.420 C 0.075 H 59
  timber_warm: "#826235", // rikyūcha, warmed — OKLCH L 0.519 C 0.074 H 74
  // Station roofs form one material ladder: storm slate and tea-house slate at
  // the dark end, then slate kawara, clay, timber shake, weathered copper,
  // dressed stone and cote clay, with thatch catching the most light.
  roof_storm_slate: "#354750",
  roof_tea_house_slate: "#40515b",
  roof_slate_kawara: "#56606b",
  roof_clay: "#ad6034", // bengara clay — OKLCH L 0.570 C 0.116 H 49
  roof_timber_shake: "#ad6331", // warm cedar — OKLCH L 0.575 C 0.115 H 52
  roof_weathered_copper: "#6f7a5e",
  roof_dressed_stone: "#747a7c",
  roof_cote_clay: "#c8733f", // akakō clay — OKLCH L 0.640 C 0.126 H 50
  roof_thatch: "#d9a34d", // kitsurubami straw — OKLCH L 0.750 C 0.121 H 77
  ember: "#2a1a0e",
  lantern_warm: "#d49a3e", // yamabuki (山吹) — RESERVED, and hex-pinned
  lantern_glow: "#f7d68a",
  lantern_cold: "#568ca4", // nando-iro (納戸色) / sora-iro
  moonlight: "#bad8e7", // sora-iro (空色)
  sail_teal: "#3a5e5a", // issuer identity — restraint contract, do not grade
  sail_red: "#9a3a2e", // issuer identity — restraint contract, do not grade
  foam_white: "#e8eef0",
  aurora_green: "#519a55", // kusa-iro grass — OKLCH L 0.621 C 0.125 H 145
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
