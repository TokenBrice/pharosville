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

export const ZONE_THEMES = {
  "alert-water": { base: "#3d6e58", label: { accent: DEWS_AREA_LABEL_COLORS.ALERT } },
  "calm-water": { base: "#125e7e", label: { accent: DEWS_AREA_LABEL_COLORS.CALM } },
  "deep-water": { base: "#06131d", label: { accent: "#d8b56a" } },
  "harbor-water": { base: "#006f6f", label: { accent: "#d8b56a" } },
  "ledger-water": { base: "#3d4860", label: { accent: LEDGER_INK_HEX } },
  "storm-water": { base: "#1a1428", label: { accent: DEWS_AREA_LABEL_COLORS.DANGER } },
  "watch-water": { base: "#487c7a", label: { accent: DEWS_AREA_LABEL_COLORS.WATCH } },
  "warning-water": { base: "#5e5535", label: { accent: DEWS_AREA_LABEL_COLORS.WARNING } },
  water: { base: "#0b5665", label: { accent: "#d8b56a" } },
} as const satisfies Record<string, ZoneVisualTheme>;

export function zoneThemeForTerrain(kind: string): ZoneVisualTheme {
  return ZONE_THEMES[kind as keyof typeof ZONE_THEMES] ?? ZONE_THEMES.water;
}
