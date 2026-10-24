import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MooringLines } from "./mooring-lines";

describe("CPU mooring curves", () => {
  it("uploads eight indexed ribbon segments and only the active range", () => {
    const lines = new MooringLines({ value: new THREE.Vector2(1600, 1000) }, 3);
    lines.begin();
    lines.add(0, 1, 2, 8, 3, 4, 0.5);
    lines.throwLine(8, 3, 4, 0, 1, 2, 1);
    lines.end(new THREE.Color(1, 1, 1));
    const g = lines.object.geometry;
    expect(g.drawRange).toEqual({ start: 0, count: 2 * 8 * 6 });
    expect(g.index!.count).toBe(3 * 8 * 6);
    expect(g.getAttribute("position").count).toBe(3 * 8 * 4);
    for (const name of ["aA", "aB"]) {
      const attribute = g.getAttribute(name) as THREE.BufferAttribute;
      expect(attribute.updateRanges).toEqual([{ start: 0, count: 2 * 8 * 12 }]);
    }
    const q = g.getAttribute("aQ");
    expect(Array.from(q.array.slice(0, 8))).toEqual([-1, 0, 1, 0, -1, 1, 1, 1]);
    lines.begin(); lines.end(new THREE.Color(1, 1, 1));
    expect(g.drawRange.count).toBe(0);
    lines.dispose();
  });

  it("rounds the original JS parabola only after evaluating each segment endpoint", () => {
    const lines = new MooringLines({ value: new THREE.Vector2(1600, 1000) });
    // Non-Float32 endpoints catch the old GPU path's premature endpoint/coefficient rounding.
    const ax = 8.123456789, ay = 3.987654321, az = 4.246813579;
    const bx = -0.135792468, by = 1.864209753, bz = 2.123456789;
    const len = Math.hypot(ax - bx, ay - by, az - bz), sag = 0.05 * len + 0.12;
    for (const k of [0.03123456789, 0.5123456789, 1]) for (const thrown of [false, true]) {
      lines.begin();
      if (thrown) lines.throwLine(ax, ay, az, bx, by, bz, k);
      else lines.add(ax, ay, az, bx, by, bz, k);
      const a = lines.object.geometry.getAttribute("aA"), b = lines.object.geometry.getAttribute("aB");
      let previous = [ax, ay, az];
      for (let segment = 1; segment <= 8; segment++) {
        const u = segment / 8, t = u * k;
        const lift = (0.35 + 0.18 * len) * 4 * k * (1 - k);
        const y = thrown
          ? ay + (by - ay) * t + lift * u * (1.6 - 0.6 * u) * 0.75 - sag * 4 * t * (1 - t) * k * k
          : ay + (by - ay) * t - sag * 4 * t * (1 - t) * (1 + (1 - k) * 0.8);
        const point = [ax + (bx - ax) * t, y, az + (bz - az) * t];
        for (let vertex = 0; vertex < 4; vertex++) {
          const offset = ((segment - 1) * 4 + vertex) * 3;
          expect(Array.from(a.array.slice(offset, offset + 3))).toEqual(previous.map(Math.fround));
          expect(Array.from(b.array.slice(offset, offset + 3))).toEqual(point.map(Math.fround));
        }
        previous = point;
      }
    }
    lines.dispose();
  });

  it("keeps the existing paid-out cutoff and capacity semantics", () => {
    const lines = new MooringLines({ value: new THREE.Vector2(1600, 1000) }, 1);
    lines.add(0, 0, 0, 1, 1, 1, 0.01);
    lines.throwLine(0, 0, 0, 1, 1, 1, 0.01);
    expect(lines.lines).toBe(0);
    lines.add(0, 0, 0, 1, 1, 1, 1);
    lines.throwLine(0, 0, 0, 1, 1, 1, 1);
    expect(lines.lines).toBe(1);
    lines.dispose();
  });
});
