import { describe, expect, it } from "vitest";
import { FOLLOW_OMEGA, springStep } from "./store";

describe("follow spring", () => {
  it("trails a steadily sailing boat by about 1.2 s, without overshoot on arrival", () => {
    const p = { x: 0, z: 0, vx: 0, vz: 0 };
    const v = 4, dt = 1 / 60;
    for (let t = 0; t < 20; t += dt) springStep(p, v * t, 0, FOLLOW_OMEGA, dt);
    const lagS = (v * 20 - p.x) / v;
    expect(lagS).toBeGreaterThan(1.0);
    expect(lagS).toBeLessThan(1.4);
    // the boat stops: the view settles onto her without swinging past
    const goal = v * 20;
    let max = p.x;
    for (let t = 0; t < 10; t += dt) { springStep(p, goal, 0, FOLLOW_OMEGA, dt); max = Math.max(max, p.x); }
    expect(max).toBeLessThanOrEqual(goal + 0.05);
    expect(p.x).toBeCloseTo(goal, 1);
  });
});
