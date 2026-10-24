import { describe, expect, it } from "vitest";
import { gust, GUST_SPEED } from "./gust";

describe("gust field (F-wind)", () => {
  it("is 0..1, patchy: mostly lulls with a minority of paws", () => {
    let on = 0, any = 0, n = 0;
    for (let x = -800; x <= 800; x += 10) for (let z = -800; z <= 800; z += 10) {
      const g = gust(x, z, 123, 0.6, 0.8);
      expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(1);
      if (g > 0.5) on++;
      if (g > 0.01) any++;
      n++;
    }
    expect(on / n).toBeGreaterThan(0.08);
    expect(on / n).toBeLessThan(0.35);
    expect(any / n).toBeLessThan(0.6);
  });
  it("travels downwind at GUST_SPEED", () => {
    const dx = 0.6, dz = 0.8, dt = 10;
    for (const [x, z] of [[10, 20], [-300, 140], [77, -410]]) {
      expect(gust(x + dx * GUST_SPEED * dt, z + dz * GUST_SPEED * dt, dt, dx, dz)).toBeCloseTo(gust(x, z, 0, dx, dz), 6);
    }
  });
});
