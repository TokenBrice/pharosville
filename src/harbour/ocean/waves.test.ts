import { describe, expect, it } from "vitest";
import { hullSwell, hullSwellCache, waveHeight } from "./waves";

/** Deterministic PRNG (mulberry32), so a failure reproduces. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The five points hullSwell samples, through the reference waveHeight. */
function reference(x: number, z: number, bx: number, bz: number, px: number, pz: number, t: number, amp: number): number[] {
  return [[x, z], [x + bx, z + bz], [x - bx, z - bz], [x + px, z + pz], [x - px, z - pz]].map(([u, v]) => waveHeight(u, v, t, amp));
}

describe("hullSwell", () => {
  const out = new Float64Array(5);

  it("matches waveHeight at all five points, with and without a cache (random points and times)", () => {
    const r = rng(7);
    let worst = 0;
    for (let n = 0; n < 4000; n++) {
      const x = (r() - 0.5) * 3000, z = (r() - 0.5) * 3000, t = r() * 2e5, amp = r();
      const h = r() * Math.PI * 2, half = 1 + r() * 40, hb = 0.5 + r() * 8;
      const fx = Math.sin(h), fz = Math.cos(h);
      const want = reference(x, z, fx * half, fz * half, fz * hb, -fx * hb, t, amp);
      for (const cache of [null, hullSwellCache()]) {
        hullSwell(x, z, fx * half, fz * half, fz * hb, -fx * hb, t, amp, out, cache);
        for (let k = 0; k < 5; k++) worst = Math.max(worst, Math.abs(out[k] - want[k]));
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it("stays on the reference while a cached hull surges, yaws and swings (incremental path and refreshes)", () => {
    const r = rng(11);
    let worst = 0;
    for (let hull = 0; hull < 40; hull++) {
      const cache = hullSwellCache();
      const x0 = (r() - 0.5) * 2000, z0 = (r() - 0.5) * 2000, h0 = r() * Math.PI * 2, half = 2 + r() * 38, hb = 0.5 + r() * 6;
      const yaw = 0.01 + r() * 0.6, amp = r();
      for (let f = 0; f < 600; f++) {
        const t = 100 + f / 60, h = h0 + yaw * Math.sin(t * 0.3), x = x0 + 0.2 * Math.sin(t * 0.26), z = z0 + 0.2 * Math.cos(t * 0.26);
        const fx = Math.sin(h), fz = Math.cos(h);
        hullSwell(x, z, fx * half, fz * half, fz * hb, -fx * hb, t, amp, out, cache);
        const want = reference(x, z, fx * half, fz * half, fz * hb, -fx * hb, t, amp);
        for (let k = 0; k < 5; k++) worst = Math.max(worst, Math.abs(out[k] - want[k]));
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it("the uncached path is the reference formula bit for bit", () => {
    const r = rng(3);
    for (let n = 0; n < 500; n++) {
      const x = (r() - 0.5) * 3000, z = (r() - 0.5) * 3000, t = r() * 1e4, amp = r(), bx = r() * 9, bz = r() * 9, px = r() * 3, pz = r() * 3;
      hullSwell(x, z, bx, bz, px, pz, t, amp, out, null);
      expect(Array.from(out)).toEqual(reference(x, z, bx, bz, px, pz, t, amp));
    }
  });
});
