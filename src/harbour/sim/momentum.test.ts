import { describe, expect, it } from "vitest";
import { ACCEL, buildPath, evalLeg, IO_LOA, IO_S, IO_T, legTiming, newLegTiming } from "./path";

describe("inherited voyage velocity", () => {
  it("integrates the initial pace with bounded acceleration and the original arrival distance", () => {
    const path = buildPath([[0, 0], [0, 500], [0, 600]], 13);
    path.underway = true;
    const tm = legTiming(path, 320, 13, newLegTiming(), 0, 0, false, 3);
    expect(Math.abs(tm.v - tm.v0) / tm.t1).toBeCloseTo(ACCEL, 10);
    const out = new Float64Array(16); out[IO_LOA] = 13;
    evalLeg(path, tm, out); expect(out[3]).toBeCloseTo(3, 6);
    let distance = 0;
    for (let t = 0; t <= 320; t += 0.5) {
      out[IO_T] = t; evalLeg(path, tm, out);
      expect(out[IO_S]).toBeGreaterThanOrEqual(distance); distance = out[IO_S];
    }
    expect(distance).toBeCloseTo(path.length, 4); expect(out[3]).toBe(0);
  });

  it("keeps astern momentum and stops before sailing ahead", () => {
    const speed = 1.2, run = speed * speed / (2 * ACCEL);
    const path = buildPath([[0, -run], [0, 300]], 13, 2, null, 4, { rev: [[0, 0], [0, -run]] });
    path.underway = true;
    const tm = legTiming(path, 250, 13, newLegTiming(), 0, 0, false, -speed);
    const out = new Float64Array(16); out[IO_LOA] = 13;
    evalLeg(path, tm, out);
    expect(out[3]).toBeCloseTo(speed); expect(Math.cos(out[2])).toBeCloseTo(1);
    out[IO_T] = tm.tAstern - 1e-4; evalLeg(path, tm, out);
    expect(out[3]).toBeLessThan(1e-3); expect(out[1]).toBeCloseTo(-run, 3);
  });
});
