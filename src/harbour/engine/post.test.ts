import { describe, expect, it } from "vitest";
import { fillGradeLUT, gradePixel } from "./post";
import { DEFAULT_KEYFRAMES, styleCDirection } from "./time-of-day";

import type { Grade } from "./time-of-day";

const neutral = (): Grade => ({ lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1 });

describe("grade LUT", () => {
  it("a neutral grade is the identity", () => {
    for (const v of [0, 0.18, 0.5, 0.9, 1]) {
      const o = gradePixel([v, v * 0.5, 1 - v], neutral());
      expect(o[0]).toBeCloseTo(v, 5);
      expect(o[1]).toBeCloseTo(v * 0.5, 5);
      expect(o[2]).toBeCloseTo(1 - v, 5);
    }
  });

  it("stays in [0, 1] and fills size³ RGBA texels", () => {
    const size = 4;
    const data = new Uint16Array(size ** 3 * 4);
    fillGradeLUT(data, size, { lift: [1.1, 1, 0.9], gamma: [0.9, 1, 1.1], gain: [1.2, 1, 0.8], saturation: 1.4, contrast: 1.3 });
    expect(data.every((h) => h !== 0x7e00)).toBe(true); // no NaN
    const g = gradePixel([1, 1, 1], { lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1.5, 1.5, 1.5], saturation: 2, contrast: 1.4 });
    for (const c of g) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); }
  });
});

describe("time of day", () => {
  it("keyframes are ordered and wrap 0 → 24", () => {
    const hours = DEFAULT_KEYFRAMES.map((k) => k.hour);
    expect(hours[0]).toBe(0);
    expect(hours[hours.length - 1]).toBe(24);
    for (let i = 1; i < hours.length; i++) expect(hours[i]).toBeGreaterThan(hours[i - 1]);
  });

  it("style C light angles keep their relation to the camera (Blender cam az 225° ↔ runtime yaw 45°)", () => {
    // a light at the camera's own azimuth must point back toward the runtime camera (+x, +z)
    const d = styleCDirection(225, 0);
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(d.z).toBeCloseTo(Math.SQRT1_2, 5);
    // golden sun (az 288°, el 9°) sits 63° off the camera azimuth
    const g = styleCDirection(288, 9);
    const ang = Math.acos((g.x * Math.SQRT1_2 + g.z * Math.SQRT1_2) / Math.hypot(g.x, g.z)) * 180 / Math.PI;
    expect(ang).toBeCloseTo(63, 3);
    expect(Math.asin(g.y) * 180 / Math.PI).toBeCloseTo(9, 3);
  });
});
