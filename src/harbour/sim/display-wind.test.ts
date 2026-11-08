import { describe, expect, it } from "vitest";
import { approach, targetSwing, wrapAngle } from "../fleet/variants";
import { buildHarbourModel } from "../model/build";
import { HarbourSim } from "./sim";
import { makeLayout, T0_MS } from "./test-fixtures";

describe("one display wind", () => {
  it("keeps cloth trim on the flags' wind at both veer extremes without changing planning wind", () => {
    const sim = new HarbourSim(buildHarbourModel({}, T0_MS), makeLayout(), T0_MS);
    const planning = sim.wind.fromRad;
    for (const veer of [-0.23, 0.23]) {
      sim.wind.veer = veer;
      const display = sim.wind.displayFromRad;
      const flagTo = display + Math.PI, clothFrom = Math.atan2(-Math.sin(flagTo), -Math.cos(flagTo));
      expect(wrapAngle(clothFrom - display)).toBeCloseTo(0, 12);
      for (const h of [planning - 0.1, planning + 0.1]) expect(targetSwing(h, display, 1)).toBeCloseTo(targetSwing(h, clothFrom, 1), 12);
      const beforeTack = targetSwing(display - 1e-6, display, 1), afterTack = targetSwing(display + 1e-6, display, 1);
      expect(Math.abs(approach(beforeTack, afterTack, 0.01) - beforeTack)).toBeCloseTo(0.01, 12);
      expect(sim.wind.fromRad).toBe(planning);
    }
  });
});
