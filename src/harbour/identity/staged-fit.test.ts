import { describe, expect, it } from "vitest";
import font from "../../../public/harbour/chart-lettering.json";
import layout from "../data/layout.json";
import { sightGridSteps, type SightBlock } from "./identity-system";
import { labelSpecs, placeLabels, placeLabelSteps, type FitObstacle } from "./labels";
import type { ChartFont, SeaZone } from "./types";

const F = font as unknown as ChartFont;
const L = layout as unknown as {
  civic: Array<{ kind: string; position: [number, number, number]; footprint: [number, number]; rotationY: number }>;
  pharos: { position: [number, number, number] }; seaZones: SeaZone[];
  piers: Array<{ segments: Array<{ a: [number, number]; b: [number, number]; width: number }> }>;
};
const HEIGHTS: Record<string, number> = { customs: 26, mint: 30, burn: 26, shipyard: 14, registry: 20, stormstation: 22 };
const tall: SightBlock[] = L.civic.map((c) => ({ x: c.position[0], z: c.position[2], hx: c.footprint[0] / 2, hz: c.footprint[1] / 2, r: c.rotationY, h: c.position[1] + (HEIGHTS[c.kind] ?? 18) }));

function ground(N: number, b: [number, number, number, number]) {
  const heights = new Float32Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = b[0] + ((c + 0.5) / N) * (b[2] - b[0]), z = b[3] - ((r + 0.5) / N) * (b[3] - b[1]), d = Math.hypot(x + 100, z + 40);
    heights[r * N + c] = 30 * Math.exp(-(d * d) / 51200) - 4 + 3 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  }
  return { bounds: b, size: N, heights };
}

/** The previous single-pass grid: every building tested at every cell centre. */
function referenceGrid(g: ReturnType<typeof ground>, pharos: readonly number[], cell = 4): (x: number, z: number) => number {
  const [minX, minZ, maxX, maxZ] = g.bounds, N = g.size;
  const nx = Math.ceil((maxX - minX) / cell), nz = Math.ceil((maxZ - minZ) / cell), out = new Float32Array(nx * nz).fill(-8);
  for (let r = 0; r < N; r++) {
    const z = maxZ - ((r + 0.5) / N) * (maxZ - minZ), gz = Math.min(nz - 1, Math.floor((z - minZ) / cell));
    for (let c = 0; c < N; c++) {
      const gx = Math.min(nx - 1, Math.floor((((c + 0.5) / N) * (maxX - minX)) / cell)), k = gz * nx + gx;
      const h0 = g.heights[r * N + c], h = h0 > 1.5 ? h0 + 11 : h0;
      if (h > out[k]) out[k] = h;
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = minX + (i + 0.5) * cell, z = minZ + (j + 0.5) * cell;
    let h = Math.max(Math.abs(x - pharos[0]), Math.abs(z - pharos[2])) < 22 ? 100 : -Infinity;
    for (const b of tall) {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.r), s = Math.sin(b.r);
      if (Math.abs(dx * c - dz * s) < b.hx && Math.abs(dx * s + dz * c) < b.hz) h = Math.max(h, b.h);
    }
    if (h > out[j * nx + i]) out[j * nx + i] = h;
  }
  return (x, z) => { const i = Math.floor((x - minX) / cell), j = Math.floor((z - minZ) / cell); return i < 0 || j < 0 || i >= nx || j >= nz ? -8 : out[j * nx + i]; };
}

function drain<T>(steps: Generator<unknown, T>): { value: T; pauses: number } {
  let step = steps.next(), pauses = 0;
  while (!step.done) { step = steps.next(); pauses++; }
  return { value: step.value, pauses };
}

describe("staged chart fitting (main-thread slices, same names)", () => {
  it.each([
    [384, [-334.8, -316.8, 357.2, 359.7]],
    [257, [-650.3, -611.7, 701.9, 655.1]],
  ] as const)("stamps buildings into exactly the grid every-cell testing built (N=%i)", (N, bounds) => {
    expect(tall.every((b) => Number.isFinite(b.h))).toBe(true);
    const g = ground(N, [...bounds]), want = referenceGrid(g, L.pharos.position);
    const { value: got, pauses } = drain(sightGridSteps(g, tall, L.pharos.position));
    expect(pauses).toBeGreaterThan(tall.length);
    let cells = 0;
    for (let x = bounds[0] - 8; x <= bounds[2] + 8; x += 1.37) for (let z = bounds[1] - 8; z <= bounds[3] + 8; z += 1.41, cells++) {
      if (got(x, z) !== want(x, z)) expect([x, z, got(x, z)]).toEqual([x, z, want(x, z)]);
    }
    expect(cells).toBeGreaterThan(100_000);
  });

  it("places the same names whether run whole or step by step, pausing between bounded pieces", () => {
    const zones = L.seaZones;
    const obstacles: FitObstacle[] = L.piers.flatMap((p) => p.segments.map((s) => ({ a: s.a, b: s.b, halfWidth: s.width / 2 })));
    const heightAt = drain(sightGridSteps(ground(256, [-700, -700, 700, 700]), tall, L.pharos.position)).value;
    const env = { obstacles, heightAt, coastAt: (x: number, z: number) => Math.hypot(x + 100, z + 40) - 230 };
    const whole = placeLabels(labelSpecs(zones), zones, F, env);
    const staged = drain(placeLabelSteps(labelSpecs(zones), zones, F, env));
    expect(staged.value).toEqual(whole);
    expect(whole.length).toBeGreaterThan(3);
    // a row of coarse candidates or one fine judgement per step, never a whole name
    expect(staged.pauses).toBeGreaterThan(whole.length * 30);
  });
});
