import type { DewsAreaBand } from "./world-types";

/**
 * The harbor's dye lot.
 *
 * W1.6 (2026-08-13) — dentō-shoku discipline. Every token below was re-graded
 * toward a named traditional Japanese colour, in OKLCH, as a REFINEMENT: no
 * token moved more than ~0.02 in chroma or ~16° in hue, so this reads as the
 * same world at a lower volume rather than a repaint.
 *
 * Why OKLCH and not HSL. The obvious reading of "nothing above ~35 %
 * saturation" is HSL S, and by that measure half the sea family looks like a
 * violation — `deep_sea_2` reads 49 %. But so does the real thing: authentic
 * kachi-iro (#181b39) measures HSL S 41 %. HSL saturation is a ratio against
 * available lightness, so it inflates without bound as a colour darkens, and a
 * near-black indigo is exactly where it lies hardest. The ceiling is therefore
 * applied in perceptual chroma — OKLCH C, cross-checked against the sRGB-cube
 * spread `palette.test.ts` already uses to rank loudness. Under either, the
 * only tokens above the line are the reserved accent family, which is the
 * property that was actually wanted.
 *
 * The one genuine outlier the audit found was `aurora_green` at C 0.113 — a
 * grass green louder than anything in the palette except the accents, and the
 * tint 46 %/24 % of the day sea is mixed from. It is now rokushō (緑青),
 * verdigris, at C 0.086.
 *
 * RESERVED, and deliberately left above the ceiling:
 *   - `vermillion` #c23a22 is shu-akane (真朱) to within one hex step
 *     (OKLCH L 0.547 C 0.177 H 32 against the reference's 0.548/0.176/33). It
 *     is the single sacred accent, spent on the Pharos beacon flame (D6,
 *     `garden-beacon-fire.ts`), the DEWS DANGER band, and nothing else.
 *   - `lantern_warm` #d49a3e is yamabuki (山吹) gold and is PINNED by
 *     `scripts/check-pharosville-colors.mjs`; it carries lantern warmth.
 *   - `lantern_glow`, `sail_red` and `bloodmoon_red` sit in the same warm
 *     accent family and are load-bearing for identity or rare events.
 *
 * NOT TOUCHED: `sail_teal` / `sail_red` are issuer-identity anchors and the
 * restraint contract forbids grading them; `DEWS_AREA_LABEL_COLORS` was
 * harmonized separately (W0.5) and its ladder is locked by test.
 */
export const HARBOR_PALETTE = {
  // The sea reads as one dentō-shoku descent — asagi/nando at the shelf, ai in
  // the body, kachi-iro (褐色, near-black indigo) in the deep. The old family
  // sat flat at OKLCH H 266-271 for every rung; the hues now walk 250 -> 274 so
  // depth is a hue journey as well as a value one.
  deep_sea_2: "#0a0e20", // kachi-iro, deepened
  deep_sea_1: "#0f1b33", // ai-fukami (深藍) / kon-iro
  shallow_teal: "#152d4c", // kon-iro (紺色)
  shallow_teal_lit: "#1c446a", // ai-iro (藍色)
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
  timber_mid: "#674b34", // kogecha (焦茶)
  timber_warm: "#836c49", // rikyūcha (利休茶), grayed tea-brown
  // Station roofs form one material ladder: storm slate and tea-house slate at
  // the dark end, then slate kawara, clay, timber shake, weathered copper,
  // dressed stone and cote clay, with thatch catching the most light.
  roof_storm_slate: "#354750",
  roof_tea_house_slate: "#40515b",
  roof_slate_kawara: "#56606b",
  roof_clay: "#a66147", // re-graded in chroma only to clear the quiet-field ceiling
  roof_timber_shake: "#9c694c",
  roof_weathered_copper: "#6f7a5e",
  roof_dressed_stone: "#747a7c",
  roof_cote_clay: "#ba7557", // re-graded in chroma only to clear the quiet-field ceiling
  roof_thatch: "#c7ae72",
  ember: "#2a1a0e",
  lantern_warm: "#d49a3e", // yamabuki (山吹) — RESERVED, and hex-pinned
  lantern_glow: "#f7d68a",
  lantern_cold: "#568ca4", // nando-iro (納戸色) / sora-iro
  moonlight: "#bad8e7", // sora-iro (空色)
  sail_teal: "#3a5e5a", // issuer identity — restraint contract, do not grade
  sail_red: "#9a3a2e", // issuer identity — restraint contract, do not grade
  foam_white: "#e8eef0",
  aurora_green: "#5e976e", // rokushō (緑青), verdigris — the one real outlier
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
 * L3 (Sea Master, 2026-07-25): this ramp is a VALUE ladder inside one hue
 * family, not a set of band accents.
 *
 * `calm-water` used to be `#125e7e`, a saturated cyan-blue, laid over the 43%
 * of the sea that is Calm. Measured off a real-GPU noon frame, that pulled the
 * rendered sea to (81, 115, 126) — blue eleven points above green — while the
 * day palette's own ramp is a jade teal (#49857f -> #3c6f72 -> #2b4f65). The
 * authored sea never reached the screen.
 *
 * Every entry now sits in the sea's own blue-green family and separates by
 * LIGHTNESS, monotonically along the DEWS escalation: jade calm, teal watch,
 * greying alert, dulled warning, ink storm. That matters because the water
 * shader luminance-matches each tint against the live water before mixing it —
 * which is what stops a tint reading as paint on a surface, and which throws
 * most of a hue's own brightness away. Value is what survives, so value is what
 * carries the reading, hue-blind or not.
 *
 * The one deliberate outsider is `ledger-water`: NAV-priced water is not a risk
 * band at all, and its slate keeps it legible as a different KIND of water
 * rather than a rung on the same ladder.
 *
 * An earlier pass (R5) had the opposite problem — it left alert ochre, warning
 * orange and danger red, which read as concentric cream/pink/khaki bands and
 * made the sea look like mud. Desaturating toward grey-green rather than
 * warming toward olive is what keeps this ramp out of that ditch.
 */
export const ZONE_THEMES = {
  "alert-water": { base: "#3a5f63", label: { accent: DEWS_AREA_LABEL_COLORS.ALERT } },
  "calm-water": { base: "#2d7d6a", label: { accent: DEWS_AREA_LABEL_COLORS.CALM } },
  "deep-water": { base: "#08161c", label: { accent: "#d8b56a" } },
  "harbor-water": { base: "#2b6f6a", label: { accent: "#d8b56a" } },
  "ledger-water": { base: "#3d4860", label: { accent: LEDGER_INK_HEX } },
  "storm-water": { base: "#23343a", label: { accent: DEWS_AREA_LABEL_COLORS.DANGER } },
  "watch-water": { base: "#2f6470", label: { accent: DEWS_AREA_LABEL_COLORS.WATCH } },
  "warning-water": { base: "#40504e", label: { accent: DEWS_AREA_LABEL_COLORS.WARNING } },
  water: { base: "#1d5f68", label: { accent: "#d8b56a" } },
} as const satisfies Record<string, ZoneVisualTheme>;

export function zoneThemeForTerrain(kind: string): ZoneVisualTheme {
  return ZONE_THEMES[kind as keyof typeof ZONE_THEMES] ?? ZONE_THEMES.water;
}
