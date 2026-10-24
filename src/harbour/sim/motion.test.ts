import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import { CYCLE_S } from "./plan";
import { HarbourSim, PH_SAILING, windVeer } from "./sim";
import { makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

const layout = makeLayout();
const model = () => buildHarbourModel(makePayloads(), T0_MS, { pieredChains: PIERED });

describe("lane MOTION sim hooks", () => {
  it("07-M5 veer: small, slow and periodic with the 6 h cycle", () => {
    let max = 0, rate = 0;
    for (let t = 0; t < CYCLE_S; t += 7) {
      const v = windVeer(t);
      max = Math.max(max, Math.abs(v));
      rate = Math.max(rate, Math.abs(windVeer(t + 1) - v));
      expect(windVeer(t + CYCLE_S)).toBeCloseTo(v, 9);
    }
    expect(max).toBeLessThan(0.25);
    expect(max).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.002); // rad/s: the anchorage wheels over minutes
  });

  it("07-M8 drift: only hulls under way carry a lane / give-way offset; still hulls none", () => {
    const sim = new HarbourSim(model(), layout, T0_MS);
    let moving = 0, withDrift = 0;
    for (let s = 0; s < 900; s += 5) {
      const p = sim.poseAt(T0_MS + s * 1000);
      for (let i = 0; i < p.count; i++) {
        const d = Math.hypot(p.drift[i * 2], p.drift[i * 2 + 1]);
        if (p.phase[i] === PH_SAILING) { moving++; if (d > 0.05) withDrift++; }
        else if (p.phase[i] !== 1 && p.phase[i] !== 3) expect(d).toBe(0);
      }
    }
    expect(moving).toBeGreaterThan(0);
    expect(withDrift).toBeGreaterThan(0);
  });
});
