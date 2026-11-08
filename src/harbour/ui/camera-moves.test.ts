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

it("integrates follow identically at 15/30/60/120/144Hz for fixed targets", () => {
  const ends = [15, 30, 60, 120, 144].map((hz) => {
    const p = { x: 0, z: 0, vx: 0, vz: 0 };
    for (let i = 0; i < hz * 3; i++) springStep(p, 20, -10, FOLLOW_OMEGA, 1 / hz);
    return p;
  });
  for (const p of ends) for (const key of ["x", "z", "vx", "vz"] as const) expect(p[key]).toBeCloseTo(ends[0][key], 10);
});

it("keeps a sailing follow endpoint within 1 CSS pixel across refresh rates", () => {
  const endpoints = [15, 30, 60, 120, 144].map((hz) => {
    const p = { x: 0, z: 0, vx: 0, vz: 0 };
    for (let i = 0; i < hz * 20; i++) springStep(p, 4 * (i + 1) / hz, 0, FOLLOW_OMEGA, 1 / hz);
    return p.x;
  });
  const metresPerPixel = 2 * 300 * Math.tan(30 * Math.PI / 360) / 1000;
  for (const x of endpoints) expect(Math.abs(x - endpoints[0]) / metresPerPixel).toBeLessThan(1);
});
