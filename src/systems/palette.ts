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

export type HarborPaletteKey = keyof typeof HARBOR_PALETTE;

export function hexToInt(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

export function paletteOrThrow(key: HarborPaletteKey): string {
  if (!(key in HARBOR_PALETTE)) {
    throw new Error(`HARBOR_PALETTE: unknown color ${String(key)}`);
  }
  return HARBOR_PALETTE[key];
}

/**
 * Build an `rgba(r, g, b, a)` CSS color string from a palette entry. Used by
 * gradient layers (vignette, horizon haze) where a hex literal can't carry
 * an alpha and a parallel hex constant would defeat the palette guard.
 */
export function paletteRgba(key: HarborPaletteKey, alpha: number): string {
  const hex = HARBOR_PALETTE[key];
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type WaterTextureKind =
  | "alert"
  | "calm"
  | "deep"
  | "harbor"
  | "ledger"
  | "storm"
  | "watch"
  | "warning"
  | "water";

export interface WaterTerrainStyle {
  accent: string;
  base: string;
  inner: string;
  wave: string;
  texture: WaterTextureKind;
}

export const WATER_TERRAIN_STYLES = {
  "alert-water": {
    accent: "rgba(230, 190, 105, 0.22)",
    base: "#276f78",
    inner: "rgba(82, 150, 145, 0.24)",
    texture: "alert",
    wave: "rgba(225, 214, 162, 0.18)",
  },
  "calm-water": {
    accent: "rgba(165, 222, 202, 0.2)",
    base: "#27734f",
    inner: "rgba(80, 162, 114, 0.2)",
    texture: "calm",
    wave: "rgba(198, 235, 220, 0.14)",
  },
  "deep-water": {
    accent: "rgba(96, 138, 162, 0.1)",
    base: "#06131d",
    inner: "rgba(1, 7, 14, 0.28)",
    texture: "deep",
    wave: "rgba(126, 172, 188, 0.1)",
  },
  "harbor-water": {
    accent: "rgba(169, 218, 204, 0.2)",
    base: "#126c74",
    inner: "rgba(80, 165, 154, 0.22)",
    texture: "harbor",
    wave: "rgba(207, 240, 231, 0.16)",
  },
  "ledger-water": {
    accent: "rgba(213, 180, 112, 0.24)",
    base: "#355346",
    inner: "rgba(93, 123, 107, 0.22)",
    texture: "ledger",
    wave: "rgba(226, 210, 166, 0.16)",
  },
  "storm-water": {
    accent: "rgba(218, 232, 224, 0.22)",
    base: "#08243b",
    inner: "rgba(2, 9, 18, 0.32)",
    texture: "storm",
    wave: "rgba(218, 232, 224, 0.18)",
  },
  "watch-water": {
    accent: "rgba(150, 196, 218, 0.22)",
    base: "#194d6e",
    inner: "rgba(70, 126, 160, 0.22)",
    texture: "watch",
    wave: "rgba(182, 222, 235, 0.16)",
  },
  "warning-water": {
    accent: "rgba(215, 174, 100, 0.28)",
    base: "#4a4a35",
    inner: "rgba(111, 93, 55, 0.24)",
    texture: "warning",
    wave: "rgba(224, 214, 174, 0.18)",
  },
  water: {
    accent: "rgba(176, 226, 218, 0.18)",
    base: "#0b5665",
    inner: "rgba(72, 142, 138, 0.16)",
    texture: "water",
    wave: "rgba(200, 236, 228, 0.14)",
  },
} as const satisfies Record<string, WaterTerrainStyle>;

export const DEWS_AREA_LABEL_COLORS = {
  CALM: "#22c55e",
  WATCH: "#14b8a6",
  ALERT: "#eab308",
  WARNING: "#f97316",
  DANGER: "#ef4444",
} as const satisfies Record<DewsAreaBand, string>;

export function waterTerrainStyle(kind: string): WaterTerrainStyle | null {
  return WATER_TERRAIN_STYLES[kind as keyof typeof WATER_TERRAIN_STYLES] ?? null;
}

export interface ZoneLabelTheme {
  /** Per-zone accent color for plaque pennants and underline. */
  accent: string;
  /** Outline drawn behind the title text. */
  outline: string;
  /** Title fill color. */
  fill: string;
  /** Plaque highlight color (top edge). */
  plaqueLight: string;
  /** Plaque shadow color (body). */
  plaqueDark: string;
}

export interface ZoneMotionTheme {
  /** Multiplier on procedural texture wave amplitude (1 = current). */
  amplitudeScale: number;
  /** Multiplier on accent stroke alpha (1 = current). */
  strokeAlphaScale: number;
}

export interface ZoneVisualTheme extends WaterTerrainStyle {
  label: ZoneLabelTheme;
  motion: ZoneMotionTheme;
}

// Defaults preserved from drawCartographicWaterLabel pre-refactor.
const DEFAULT_LABEL_OUTLINE = "rgba(5, 10, 17, 0.7)";
const DEFAULT_LABEL_FILL = "rgba(238, 218, 169, 0.78)";
const DEFAULT_LABEL_PLAQUE_LIGHT = "rgba(74, 50, 27, 0.5)";
const DEFAULT_LABEL_PLAQUE_DARK = "rgba(15, 10, 7, 0.76)";
const DEFAULT_MOTION: ZoneMotionTheme = { amplitudeScale: 1, strokeAlphaScale: 1 };

function defaultLabelTheme(accent: string): ZoneLabelTheme {
  return {
    accent,
    outline: DEFAULT_LABEL_OUTLINE,
    fill: DEFAULT_LABEL_FILL,
    plaqueLight: DEFAULT_LABEL_PLAQUE_LIGHT,
    plaqueDark: DEFAULT_LABEL_PLAQUE_DARK,
  };
}

export const ZONE_THEMES = {
  "alert-water": {
    ...WATER_TERRAIN_STYLES["alert-water"],
    label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.ALERT),
    motion: DEFAULT_MOTION,
  },
  "calm-water": {
    ...WATER_TERRAIN_STYLES["calm-water"],
    label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.CALM),
    motion: DEFAULT_MOTION,
  },
  "deep-water": {
    ...WATER_TERRAIN_STYLES["deep-water"],
    label: defaultLabelTheme("#d8b56a"), // matches riskWaterAreaColor fallback
    motion: DEFAULT_MOTION,
  },
  "harbor-water": {
    ...WATER_TERRAIN_STYLES["harbor-water"],
    label: defaultLabelTheme("#d8b56a"),
    motion: DEFAULT_MOTION,
  },
  "ledger-water": {
    ...WATER_TERRAIN_STYLES["ledger-water"],
    label: defaultLabelTheme("#d9b974"), // matches riskWaterAreaColor for "ledger"
    motion: DEFAULT_MOTION,
  },
  "storm-water": {
    ...WATER_TERRAIN_STYLES["storm-water"],
    label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.DANGER),
    motion: DEFAULT_MOTION,
  },
  "watch-water": {
    ...WATER_TERRAIN_STYLES["watch-water"],
    label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.WATCH),
    motion: DEFAULT_MOTION,
  },
  "warning-water": {
    ...WATER_TERRAIN_STYLES["warning-water"],
    label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.WARNING),
    motion: DEFAULT_MOTION,
  },
  water: {
    ...WATER_TERRAIN_STYLES.water,
    label: defaultLabelTheme("#d8b56a"),
    motion: DEFAULT_MOTION,
  },
} as const satisfies Record<keyof typeof WATER_TERRAIN_STYLES, ZoneVisualTheme>;

export function zoneThemeForTerrain(kind: string): ZoneVisualTheme {
  return ZONE_THEMES[kind as keyof typeof ZONE_THEMES] ?? ZONE_THEMES.water;
}
