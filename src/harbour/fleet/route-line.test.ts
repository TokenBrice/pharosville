import { describe, expect, it } from "vitest";
import { resample, ROUTE_STEP_M } from "./route-line";

describe("route line resampling", () => {
  it("steps evenly along a bent path and keeps both ends", () => {
    const pts = Float32Array.of(0, 0, 10, 0, 10, 10);
    const out = resample(pts, 4);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(-2)).toEqual([10, 10]);
    for (let i = 2; i < out.length - 2; i += 2) {
      const d = Math.hypot(out[i] - out[i - 2], out[i + 1] - out[i - 1]);
      expect(d).toBeLessThanOrEqual(4.0001);
      expect(d).toBeGreaterThan(2.5); // a corner cuts a step short, never to nothing
    }
  });
  it("keeps a 1.5 km leg within budget", () => {
    const pts = new Float32Array(3000);
    for (let i = 0; i < 1500; i++) { pts[i * 2] = i; pts[i * 2 + 1] = 0; }
    expect(resample(pts, ROUTE_STEP_M).length / 2).toBeLessThan(400);
  });
});
