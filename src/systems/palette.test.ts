import { describe, expect, it } from "vitest";
import { RISK_WATER_AREAS } from "./risk-water-areas";
import { DEWS_AREA_LABEL_COLORS, HARBOR_PALETTE, ZONE_THEMES, zoneThemeForTerrain } from "./palette";
import { SHIP_WATER_ZONES } from "./world-types";

describe("HARBOR_PALETTE", () => {
  it("keeps valid hex colors for Three materials", () => {
    for (const color of Object.values(HARBOR_PALETTE)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("ZONE_THEMES", () => {
  it("keeps distinct risk-water bases and analytical accents", () => {
    expect(ZONE_THEMES["calm-water"]).toEqual({
      base: "#125e7e",
      label: { accent: DEWS_AREA_LABEL_COLORS.CALM },
    });
    expect(ZONE_THEMES["storm-water"]).toEqual({
      base: "#1a1428",
      label: { accent: DEWS_AREA_LABEL_COLORS.DANGER },
    });
    expect(new Set(Object.values(ZONE_THEMES).map((theme) => theme.base)).size)
      .toBe(Object.keys(ZONE_THEMES).length);
  });

  it("falls back to the generic water theme", () => {
    expect(zoneThemeForTerrain("unknown")).toBe(ZONE_THEMES.water);
  });

  it("covers every ship water zone", () => {
    for (const zone of SHIP_WATER_ZONES) {
      const placement = Object.values(RISK_WATER_AREAS).find((area) => area.motionZone === zone);
      expect(placement, zone).toBeDefined();
      expect(zoneThemeForTerrain(placement!.terrain), zone).not.toBe(ZONE_THEMES.water);
    }
  });
});
