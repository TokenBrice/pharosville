import { describe, expect, it } from "vitest";
import { OCEAN_FRAG, OCEAN_VERT } from "./ocean-material";
import { buildSeaSdf, distanceTransform, landMaskFromHeights, SDF_COAST_RANGE, SDF_ISLAND_RADII, sdfMainlandFade, type SeaSdfInput } from "./sea-sdf";
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

describe("E02 the retired mainland leaves the sea", () => {
  it("fades the SDF's coast and depth to open water beyond the island's coasts, smoothly, about the layout centre", () => {
    const [r0, r1] = SDF_ISLAND_RADII;
    expect([r0, r1]).toEqual([470, 560]);
    for (const a of [0, 1, 2.5, 4]) {
      const at = (d: number) => sdfMainlandFade(11.2 + Math.cos(a) * d, 21.45 + Math.sin(a) * d, 11.2, 21.45);
      expect(at(0)).toBe(0); expect(at(436)).toBe(0); expect(at(r0)).toBe(0);
      expect(at(r1)).toBeCloseTo(1, 12); expect(at(604.7)).toBe(1); expect(at(2000)).toBe(1);
      let prev = 0;
      for (let d = r0; d <= r1; d += 1) { const k = at(d); expect(k).toBeGreaterThanOrEqual(prev); prev = k; }
      const t = (515 - r0) / (r1 - r0);
      expect(at(515)).toBeCloseTo(t * t * (3 - 2 * t), 12);              // GLSL smoothstep
    }
  });

  it("pins the fade on R and G only, in both ocean shaders; structures, buoys and zones keep their channels", () => {
    expect(OCEAN_FRAG).toContain("sdf.rg = mix(sdf.rg, vec2(1.0), smoothstep(470.0, 560.0, length(xz - uSceneCenter)));");
    expect(OCEAN_FRAG).toContain("float sdist = mix(16.0, sdf.b * 16.0, inside);");
    expect(OCEAN_FRAG).toContain("vec4 zm = texture2D(uZones, clamp(suv, 0.0, 1.0)) * inside;");
    expect(OCEAN_VERT).toContain("uniform vec2 uSceneCenter;");
    expect(OCEAN_VERT).toContain("mix(textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0).r, 1.0, smoothstep(470.0, 560.0, length(p.xz - uSceneCenter)))");
    // the shaders' literal radii are the CPU's (one fade everywhere)
    for (const src of [OCEAN_FRAG, OCEAN_VERT]) {
      const m = /smoothstep\(([\d.]+), ([\d.]+), length\((?:xz|p\.xz) - uSceneCenter\)\)/.exec(src)!;
      expect([Number(m[1]), Number(m[2])]).toEqual([...SDF_ISLAND_RADII]);
    }
  });
});
