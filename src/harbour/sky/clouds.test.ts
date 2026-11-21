import { describe, expect, it } from "vitest";
import { CLOUD_CELLS, CLOUD_KINDS, cloudLobes } from "./clouds";
import { SKY_BAND_GLSL } from "./sky-glsl";

describe("Mediterranean painterly cloud atlas", () => {
  it("generates bounded, deterministic, asymmetrical lobe clusters for every atlas cell", () => {
    for (let c = 0; c < CLOUD_CELLS; c++) {
      const a = cloudLobes(c + 1, CLOUD_KINDS[c]);
      const b = cloudLobes(c + 1, CLOUD_KINDS[c]);
      expect(a).toEqual(b);
      expect(a.lobes.length).toBeGreaterThanOrEqual(16);
      expect(a.lobes.length).toBeLessThanOrEqual(64);
      expect(a.base).toBeGreaterThan(0.1);
      expect(a.base).toBeLessThan(0.3);
      for (const [x, y, r] of a.lobes) {
        expect(x - r).toBeGreaterThanOrEqual(0.08 - 1e-6);
        expect(x + r).toBeLessThanOrEqual(4.0 - 0.08 + 1e-6);
        expect(y - r).toBeGreaterThanOrEqual(0.04 - 1e-6);
        expect(y + r).toBeLessThanOrEqual(0.96 + 1e-6);
      }
      // varied puff scales (grand billowing masses + delicate crown froth, never uniform bread-rolls)
      const radii = a.lobes.map((l) => l[2]);
      expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(2.2);
      // asymmetric silhouette: left half and right half reach distinct heights (never a symmetrical bread-roll loaf)
      const leftTop = Math.max(0, ...a.lobes.filter((l) => l[0] < 2.0).map((l) => l[1] + l[2]));
      const rightTop = Math.max(0, ...a.lobes.filter((l) => l[0] >= 2.0).map((l) => l[1] + l[2]));
      expect(Math.abs(leftTop - rightTop)).toBeGreaterThan(0.05);
    }
  });

  it("wires Henyey-Greenstein Mie scattering and smooth archipelago profiles in SKY_BAND_GLSL", () => {
    expect(SKY_BAND_GLSL).toContain("float sbHG(float cosT, float g)");
    expect(SKY_BAND_GLSL).toContain("float sbIsland(float x, float seed)");
    expect(SKY_BAND_GLSL).not.toContain("float sbRidge(");
  });
});
