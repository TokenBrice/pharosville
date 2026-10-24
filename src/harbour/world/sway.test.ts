import { describe, expect, it } from "vitest";
import { SWAY_AMP, swayAmplitude } from "./sway";

describe("08-T3 sway", () => {
  it("stays a few centimetres in ordinary wind and never exceeds ~0.4 m in a storm", () => {
    expect(swayAmplitude(0.8, 0.35, 1)).toBeGreaterThan(0.05);
    expect(swayAmplitude(0.8, 0.35, 1)).toBeLessThan(0.15);
    expect(swayAmplitude(1, 5, 1)).toBeCloseTo(SWAY_AMP.calm + SWAY_AMP.perWind * 1.4);
    expect(swayAmplitude(1, 5, 1)).toBeLessThan(0.4);
  });
  it("is still under reduced motion (gain 0) and on unweighted vertices", () => {
    expect(swayAmplitude(1, 1, 0)).toBe(0);
    expect(swayAmplitude(0, 1, 1)).toBe(0);
  });
});
