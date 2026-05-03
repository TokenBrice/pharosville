import { describe, expect, it } from "vitest";
import {
  THREAT_LEVEL_FOR_BAND,
  atmosphereDescriptionForArea,
  bandReceivesLightning,
  cloudScalarsForThreat,
  maxActiveThreatLevel,
  threatForPoint,
  threatLevelForArea,
  windMultiplier,
} from "./weather";
import type { AreaNode, PharosVilleWorld } from "../../systems/world-types";

function makeArea(id: string, band: AreaNode["band"], tile = { x: 0, y: 0 }): AreaNode {
  return {
    id,
    kind: "area",
    label: id,
    tile,
    band,
    detailId: id,
  };
}

function worldWith(areas: AreaNode[]): PharosVilleWorld {
  return {
    generatedAt: 0,
    routeMode: "world",
    freshness: {},
    map: { width: 0, height: 0, tiles: [], waterRatio: 0 },
    lighthouse: {} as PharosVilleWorld["lighthouse"],
    pigeonnier: {} as PharosVilleWorld["pigeonnier"],
    docks: [],
    areas,
    ships: [],
    graves: [],
    effects: [],
    detailIndex: {},
    entityById: {},
    legends: [],
    visualCues: [],
  };
}

describe("weather", () => {
  describe("THREAT_LEVEL_FOR_BAND", () => {
    it("escalates monotonically from CALM to DANGER", () => {
      expect(THREAT_LEVEL_FOR_BAND.CALM).toBe(0);
      expect(THREAT_LEVEL_FOR_BAND.WATCH).toBe(1);
      expect(THREAT_LEVEL_FOR_BAND.ALERT).toBe(2);
      expect(THREAT_LEVEL_FOR_BAND.WARNING).toBe(3);
      expect(THREAT_LEVEL_FOR_BAND.DANGER).toBe(4);
    });
  });

  describe("threatLevelForArea", () => {
    it("returns 0 for a ledger (band-less) area", () => {
      expect(threatLevelForArea(makeArea("ledger", undefined))).toBe(0);
    });

    it("maps the band to the matching threat level", () => {
      expect(threatLevelForArea(makeArea("a", "WARNING"))).toBe(3);
      expect(threatLevelForArea(makeArea("a", "DANGER"))).toBe(4);
    });
  });

  describe("windMultiplier", () => {
    it("is 1.0 at CALM (default)", () => {
      expect(windMultiplier(0)).toBe(1);
    });

    it("is monotonically increasing across threat levels", () => {
      const values = [0, 1, 2, 3, 4].map((t) => windMultiplier(t as 0 | 1 | 2 | 3 | 4));
      for (let i = 1; i < values.length; i += 1) {
        expect(values[i]!).toBeGreaterThan(values[i - 1]!);
      }
    });

    it("caps below ~2x so amplitudes don't tear", () => {
      expect(windMultiplier(4)).toBeLessThan(2);
    });
  });

  describe("cloudScalarsForThreat", () => {
    it("returns identity scalars at threat 0 (default-zone parity)", () => {
      const s = cloudScalarsForThreat(0);
      expect(s.alphaScale).toBe(1);
      expect(s.thicknessScale).toBe(1);
      expect(s.yBias).toBe(0);
    });

    it("escalates alpha and thickness with threat", () => {
      expect(cloudScalarsForThreat(4).alphaScale).toBeGreaterThan(cloudScalarsForThreat(0).alphaScale);
      expect(cloudScalarsForThreat(4).thicknessScale).toBeGreaterThan(cloudScalarsForThreat(0).thicknessScale);
    });
  });

  describe("maxActiveThreatLevel", () => {
    it("returns 0 when no banded areas exist", () => {
      expect(maxActiveThreatLevel(worldWith([]))).toBe(0);
      expect(maxActiveThreatLevel(worldWith([makeArea("ledger", undefined)]))).toBe(0);
    });

    it("returns the max threat across banded areas", () => {
      expect(maxActiveThreatLevel(worldWith([
        makeArea("a", "CALM"),
        makeArea("b", "DANGER"),
        makeArea("c", "WATCH"),
      ]))).toBe(4);
    });
  });

  describe("threatForPoint", () => {
    it("returns 0 in a world with no banded areas", () => {
      expect(threatForPoint(worldWith([]), 10, 10)).toBe(0);
    });

    it("inherits the closest banded area's threat", () => {
      const world = worldWith([
        makeArea("calm", "CALM", { x: 0, y: 0 }),
        makeArea("danger", "DANGER", { x: 50, y: 50 }),
      ]);
      expect(threatForPoint(world, 1, 1)).toBe(0);
      expect(threatForPoint(world, 49, 49)).toBe(4);
    });
  });

  describe("bandReceivesLightning", () => {
    it("only triggers at WARNING and above", () => {
      expect(bandReceivesLightning(undefined)).toBe(false);
      expect(bandReceivesLightning(null)).toBe(false);
      expect(bandReceivesLightning("CALM")).toBe(false);
      expect(bandReceivesLightning("WATCH")).toBe(false);
      expect(bandReceivesLightning("ALERT")).toBe(false);
      expect(bandReceivesLightning("WARNING")).toBe(true);
      expect(bandReceivesLightning("DANGER")).toBe(true);
    });
  });

  describe("atmosphereDescriptionForArea", () => {
    it("describes calm with no lightning", () => {
      const text = atmosphereDescriptionForArea(makeArea("a", "CALM"));
      expect(text).toContain("clear sky");
      expect(text).not.toContain("lightning");
    });

    it("includes 'lightning active' for DANGER", () => {
      expect(atmosphereDescriptionForArea(makeArea("a", "DANGER"))).toContain("lightning active");
    });

    it("includes 'lightning active' for WARNING", () => {
      expect(atmosphereDescriptionForArea(makeArea("a", "WARNING"))).toContain("lightning active");
    });
  });
});
