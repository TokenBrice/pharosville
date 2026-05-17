import { describe, it, expect } from "vitest";
import { THREAT_BAND_HEX } from "@shared/lib/classification";
import { DEWS_AREA_LABEL_COLORS, HARBOR_PALETTE, WATER_TERRAIN_STYLES, ZONE_THEMES, hexToInt, paletteOrThrow, paletteRgba, waterTerrainStyle } from "./palette";
import { RISK_WATER_AREAS } from "./risk-water-areas";
import { SHIP_WATER_ZONES } from "./world-types";

const DEWS_TERRAIN_LADDER = ["calm-water", "watch-water", "alert-water", "warning-water", "storm-water"] as const;
const MONOTONIC_TOLERANCE = 0.05;
const LEDGER_MIN_OFF_AXIS_DISTANCE = 32;

describe("HARBOR_PALETTE", () => {
  it("contains 25 entries", () => {
    expect(Object.keys(HARBOR_PALETTE)).toHaveLength(25);
  });

  it("each value is a 7-char hex starting with #", () => {
    for (const [k, v] of Object.entries(HARBOR_PALETTE)) {
      expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("hexToInt parses #d49a3e to 0xd49a3e", () => {
    expect(hexToInt("#d49a3e")).toBe(0xd49a3e);
  });

  it("paletteOrThrow returns the named color", () => {
    expect(paletteOrThrow("lantern_warm")).toBe("#d49a3e");
  });

  it("paletteOrThrow throws on unknown key", () => {
    expect(() => paletteOrThrow("not_a_color" as never)).toThrow(/HARBOR_PALETTE/);
  });

  it("paletteRgba builds an rgba string for a palette entry", () => {
    expect(paletteRgba("lantern_warm", 0.5)).toBe("rgba(212, 154, 62, 0.5)");
    expect(paletteRgba("deep_sea_2", 0)).toBe("rgba(10, 14, 29, 0)");
    expect(paletteRgba("foam_white", 1)).toBe("rgba(232, 238, 240, 1)");
  });

  it("defines explicit styles for every rendered water terrain", () => {
    expect(Object.keys(WATER_TERRAIN_STYLES).sort()).toEqual([
      "alert-water",
      "calm-water",
      "deep-water",
      "harbor-water",
      "ledger-water",
      "storm-water",
      "warning-water",
      "watch-water",
      "water",
    ]);
    expect(waterTerrainStyle("calm-water")?.texture).toBe("calm");
    expect(waterTerrainStyle("ledger-water")?.texture).toBe("ledger");
    expect(waterTerrainStyle("watch-water")?.texture).toBe("watch");
    expect(waterTerrainStyle("unknown")).toBeNull();
  });

  it("keeps water terrain zones visually separable by color and texture", () => {
    const styles = Object.values(WATER_TERRAIN_STYLES);

    expect(new Set(styles.map((style) => style.texture)).size).toBe(styles.length);
    expect(minimumHexDistance(styles.map((style) => style.base))).toBeGreaterThan(18);
    expect(WATER_TERRAIN_STYLES["calm-water"].texture).not.toBe(WATER_TERRAIN_STYLES["watch-water"].texture);
    expect(hexDistance(WATER_TERRAIN_STYLES["calm-water"].base, WATER_TERRAIN_STYLES["harbor-water"].base)).toBeGreaterThan(24);
    expect(hexDistance(WATER_TERRAIN_STYLES["calm-water"].base, WATER_TERRAIN_STYLES["alert-water"].base)).toBeGreaterThan(32);
    expect(WATER_TERRAIN_STYLES["warning-water"].accent).not.toBe(WATER_TERRAIN_STYLES.water.accent);
    expect(WATER_TERRAIN_STYLES["ledger-water"].base).not.toBe(WATER_TERRAIN_STYLES["calm-water"].base);
  });

  it("matches the W1.13 merged water terrain palette refit", () => {
    expect(HARBOR_PALETTE.lantern_warm).toBe("#d49a3e");
    expect(WATER_TERRAIN_STYLES["calm-water"].base).toBe("#125e7e");
    expect(WATER_TERRAIN_STYLES["watch-water"].base).toBe("#1c4d6d");
    expect(WATER_TERRAIN_STYLES["alert-water"].base).toBe("#3d6e58");
    expect(WATER_TERRAIN_STYLES["warning-water"].base).toBe("#5e5535");
    expect(WATER_TERRAIN_STYLES["storm-water"].base).toBe("#1a1428");
    expect(WATER_TERRAIN_STYLES["ledger-water"].base).toBe("#3d4860");
    expect(WATER_TERRAIN_STYLES["ledger-water"].accent).toBe("rgba(180,210,196,0.24)");
  });

  it("keeps the DEWS water ladder monotonic against the lantern anchor", () => {
    const baseColors = DEWS_TERRAIN_LADDER.map((terrain) => WATER_TERRAIN_STYLES[terrain].base);
    const visibleLightness = baseColors.map(dominantChannelValue);
    const lanternChroma = rgbChroma(HARBOR_PALETTE.lantern_warm);
    const lanternChromaDistances = baseColors.map((base) => Math.abs(rgbChroma(base) - lanternChroma));

    expect(isNonIncreasingWithinTolerance(visibleLightness, MONOTONIC_TOLERANCE)).toBe(true);
    expect(isNonDecreasingWithinTolerance(lanternChromaDistances, MONOTONIC_TOLERANCE)).toBe(true);
  });

  it("keeps Ledger Mooring off the DEWS color axis", () => {
    const ledgerDistance = Math.min(
      ...DEWS_TERRAIN_LADDER.map((terrain) => hexDistance(WATER_TERRAIN_STYLES["ledger-water"].base, WATER_TERRAIN_STYLES[terrain].base)),
    );

    expect(ledgerDistance).toBeGreaterThanOrEqual(LEDGER_MIN_OFF_AXIS_DISTANCE);
  });

  it("uses canonical DEWS threat colors for water-area labels", () => {
    expect(DEWS_AREA_LABEL_COLORS).toEqual({
      CALM: THREAT_BAND_HEX.CALM,
      WATCH: THREAT_BAND_HEX.WATCH,
      ALERT: THREAT_BAND_HEX.ALERT,
      WARNING: THREAT_BAND_HEX.WARNING,
      DANGER: THREAT_BAND_HEX.DANGER,
    });
  });

  it("provides a complete ZoneVisualTheme for every water terrain", () => {
    const waterKinds = Object.keys(WATER_TERRAIN_STYLES);
    expect(Object.keys(ZONE_THEMES).sort()).toEqual(waterKinds.sort());
    for (const kind of waterKinds) {
      const theme = ZONE_THEMES[kind as keyof typeof ZONE_THEMES];
      expect(theme.base).toBe(WATER_TERRAIN_STYLES[kind as keyof typeof WATER_TERRAIN_STYLES].base);
      expect(theme.label.outline).toBeTruthy();
      expect(theme.label.fill).toBeTruthy();
      expect(theme.label.plaqueLight).toBeTruthy();
      expect(theme.label.plaqueDark).toBeTruthy();
      expect(theme.label.accent).toMatch(/^#|^rgba/);
      expect(theme.motion.amplitudeScale).toBeGreaterThan(0);
      expect(theme.motion.strokeAlphaScale).toBeGreaterThan(0);
    }
  });

  it("every ShipWaterZone resolves to a ZONE_THEMES entry via the RISK_WATER_AREAS terrain mapping", () => {
    for (const zone of SHIP_WATER_ZONES) {
      const placement = Object.values(RISK_WATER_AREAS).find((area) => area.motionZone === zone);
      expect(placement, zone).toBeDefined();
      const terrainKind = placement!.terrain;
      expect(ZONE_THEMES[terrainKind as keyof typeof ZONE_THEMES], `${zone} → ${terrainKind}`).toBeDefined();
    }
  });
});

function minimumHexDistance(colors: string[]) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let first = 0; first < colors.length; first += 1) {
    for (let second = first + 1; second < colors.length; second += 1) {
      minimum = Math.min(minimum, hexDistance(colors[first]!, colors[second]!));
    }
  }
  return minimum;
}

function hexDistance(first: string, second: string) {
  const a = hexChannels(first);
  const b = hexChannels(second);
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function dominantChannelValue(hex: string) {
  const { r, g, b } = hexChannels(hex);
  return Math.max(r, g, b);
}

function rgbChroma(hex: string) {
  const { r, g, b } = hexChannels(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function isNonIncreasingWithinTolerance(values: number[], tolerance: number) {
  return values.every((value, index) => index === 0 || value <= values[index - 1]! * (1 + tolerance));
}

function isNonDecreasingWithinTolerance(values: number[], tolerance: number) {
  return values.every((value, index) => index === 0 || value >= values[index - 1]! * (1 - tolerance));
}

function hexChannels(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return {
    b: n & 0xff,
    g: (n >> 8) & 0xff,
    r: (n >> 16) & 0xff,
  };
}
