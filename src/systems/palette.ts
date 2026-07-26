import type { DewsAreaBand } from "./world-types";

export const HARBOR_PALETTE = {
  deep_sea_2: "#0a0e1d",
  deep_sea_1: "#141a30",
  shallow_teal: "#1f2a4a",
  shallow_teal_lit: "#2d3f6b",
  sky_night: "#0d1226",
  sky_horizon: "#1a2240",
  fog_blue: "#3a4f7a",
  fog_pale: "#5a7099",
  // Garden Sea day identity (D-R1 ukiyo-e day, supersedes the D1 pearl
  // overcast): a saturated-but-harmonious bokashi sky, warm key sun, and one
  // reserved vermillion accent (lighthouse crown + danger semantics).
  // Pharos Wonder 2026-07-24 (D6): the reserved vermillion is spent on the
  // Pharos beacon fire — the flame's outer band (garden-beacon-fire.ts).
  sky_day_zenith: "#27567d",
  sky_day_horizon: "#e9d9b2",
  fog_day: "#dbcfae",
  sun_day_warm: "#f2ddab",
  vermillion: "#c23a22",
  stone_dark: "#2a2620",
  stone_mid: "#4a4238",
  stone_pale: "#6a5e4e",
  iron_dark: "#1a1612",
  timber_dark: "#3a2a1e",
  timber_mid: "#6a4a2e",
  timber_warm: "#8a6840",
  ember: "#2a1a0e",
  lantern_warm: "#d49a3e",
  lantern_glow: "#f7d68a",
  lantern_cold: "#5a8aaa",
  moonlight: "#bfd6e8",
  sail_teal: "#3a5e5a",
  sail_red: "#9a3a2e",
  foam_white: "#e8eef0",
  aurora_green: "#5ea970",
  bloodmoon_red: "#c83a3a",
} as const;

export const DEWS_AREA_LABEL_COLORS = {
  CALM: "#22c55e",
  WATCH: "#14b8a6",
  ALERT: "#eab308",
  WARNING: "#f97316",
  DANGER: "#ef4444",
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
