import { describe, expect, it } from "vitest";
import { buildPath, legTiming, newLegTiming, polar } from "./path";
import { HarbourSim } from "./sim";
import { buildHarbourModel } from "../model/build";
import { makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

describe("points of sail (07-M1)", () => {
  it("polar: slow head to wind, fastest on a broad reach", () => {
    expect(polar(0)).toBeLessThan(polar(0.87));
    expect(polar(0.87)).toBeLessThan(polar(Math.PI / 2));
    expect(polar(2.27)).toBeGreaterThan(polar(Math.PI / 2));
    expect(polar(Math.PI)).toBeLessThan(polar(2.27));
    expect(polar(-1)).toBe(polar(1));
  });

  it("reshapes speed along the leg but leaves its effort Q (and so every leg time) unchanged", () => {
    // an L: 600 m straight into the wind (wind from +z: bow heading 0), then 600 m across it
    const pts: Array<[number, number]> = [[0, 0], [0, 600], [600, 600]];
    const plain = buildPath(pts, 13, 2, null, 4);
    const sail = buildPath(pts, 13, 2, null, 4, { windFrom: 0 });
    // (to float32 accumulation: a few ms over a 20-minute leg)
    const rel = (x: number, y: number) => Math.abs(x - y) / y;
    expect(rel(sail.Q, plain.Q)).toBeLessThan(2e-5);
    const a = legTiming(plain, 900, 13, newLegTiming()), b = legTiming(sail, 900, 13, newLegTiming());
    expect(rel(b.tNom, a.tNom)).toBeLessThan(2e-5);
    expect(rel(b.minD, a.minD)).toBeLessThan(2e-5);
    const at = (p: typeof plain, s: number) => p.vrel[Math.round(s / p.ds)];
    // upwind she ghosts; across the wind she hurries
    expect(at(sail, 300) / at(plain, 300)).toBeLessThan(0.85);
    expect(at(sail, 900) / at(plain, 900)).toBeGreaterThan(1.1);
    // the cast-off and the glide in keep their speeds
    expect(at(sail, 5)).toBeCloseTo(at(plain, 5), 5);
    expect(at(sail, sail.length - 5)).toBeCloseTo(at(plain, plain.length - 5), 5);
  });

  it("heel peaks on a beam reach and is continuous through head to wind", () => {
    const model = buildHarbourModel(makePayloads(), T0_MS, { pieredChains: PIERED });
    const sim = new HarbourSim(model, makeLayout(), T0_MS);
    let maxH = 0;
    for (let s = 0; s < 1800; s += 3) {
      const p = sim.poseAt(T0_MS + s * 1000);
      for (let i = 0; i < p.count; i++) maxH = Math.max(maxH, Math.abs(p.heel[i]));
    }
    expect(maxH).toBeLessThan(0.3);
  });
});
