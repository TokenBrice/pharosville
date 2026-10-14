import { describe, expect, it } from "vitest";
import { buildSeaSdf, distanceTransform, landMaskFromHeights, SDF_COAST_RANGE, type SeaSdfInput } from "./sea-sdf";
import { waveHeight } from "./waves";

const square = (c: number, h: number): [number, number][] => [[c - h, c - h], [c + h, c - h], [c + h, c + h], [c - h, c + h]];

function input(size = 64): SeaSdfInput {
  return { bounds: [-100, -100, 100, 100], size, land: [square(0, 30)], water: [], solids: [], structures: [] };
}
const R = (d: Uint8Array, n: number, i: number, j: number) => d[(j * n + i) * 4];

describe("sea SDF fallback", () => {
  it("encodes coast distance: land < 0.5 < sea, growing away from the coast", () => {
    const n = 64, d = buildSeaSdf(input(n));
    expect(R(d, n, 32, 32)).toBeLessThan(128);           // island centre
    expect(R(d, n, 2, 32)).toBeGreaterThan(128);         // open water
    expect(R(d, n, 2, 32)).toBeGreaterThan(R(d, n, 20, 32));
    const at = (i: number) => (R(d, n, i, 32) / 255 - 0.5) * SDF_COAST_RANGE;
    expect(at(2)).toBeGreaterThan(55);                   // ~ 64 m to the coast at x = -95
    expect(at(2)).toBeLessThan(72);
  });

  it("is deterministic and keeps alpha opaque", () => {
    const a = buildSeaSdf(input()), b = buildSeaSdf(input());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    for (let k = 3; k < a.length; k += 4) expect(a[k]).toBe(255);
  });

  it("carves bays out of land", () => {
    const n = 64, inp = input(n);
    inp.water = [square(0, 10)];
    expect(R(buildSeaSdf(inp), n, 32, 32)).toBeGreaterThan(128);
  });

  it("builds the land mask from a height field and keeps pier decks as water", () => {
    const n = 64, inp = input(n);
    inp.structures = [{ a: [40, 0], b: [80, 0], width: 3, piles: true }];
    const gs = 64, heights = new Float32Array(gs * gs).fill(-8);
    // ground: row 0 = z max; land block in the middle + a pier deck at y 1.2 along +x
    for (let j = 0; j < gs; j++) for (let i = 0; i < gs; i++) {
      const x = -100 + (i + 0.5) * (200 / gs), z = 100 - (j + 0.5) * (200 / gs);
      if (Math.abs(x) < 30 && Math.abs(z) < 30) heights[j * gs + i] = 6;
      if (x > 40 && x < 80 && Math.abs(z) < 1.5) heights[j * gs + i] = 1.2;
    }
    const land = landMaskFromHeights(inp, { heights, size: gs, bounds: [-100, -100, 100, 100] }, 1.2);
    expect(land[32 * n + 32]).toBe(1);
    expect(land[32 * n + 48]).toBe(0);                   // pier deck at x ~ 50 stays water
  });

  it("distance transform is exact on a single seed", () => {
    const n = 16, m = new Uint8Array(n * n); m[0] = 1;
    const d = distanceTransform(m, n, 1);
    expect(d[3 * n + 4]).toBeCloseTo(5, 5);
  });
});

describe("waves", () => {
  it("heightAt scales with amplitude and is bounded", () => {
    expect(Math.abs(waveHeight(10, 20, 3, 0))).toBe(0);
    for (let k = 0; k < 50; k++) expect(Math.abs(waveHeight(k * 13.1, k * 7.7, k * 0.3, 1))).toBeLessThan(3);
  });
});
