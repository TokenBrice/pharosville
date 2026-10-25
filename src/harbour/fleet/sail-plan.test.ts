import { describe, expect, it } from "vitest";
import { hull2d, inscribedCircle, LOGO_R, planSails, ROLE_BAND, ROLE_BODY, ROLE_HEAD, ROLE_UPPER, type SailMeshIn } from "./sail-plan";

/** A flat sail in the x-y plane from its outline corners (fan-triangulated), with the kit's emblem UV (u = x / s, v = -y / s). */
function sail(name: string, pts: Array<[number, number]>, opts: { emblem?: number; color?: [number, number, number] } = {}): SailMeshIn {
  const pos: number[] = [], uv1: number[] = [], color: number[] = [], index: number[] = [];
  for (const [x, y] of pts) {
    pos.push(x, y, 0);
    uv1.push(opts.emblem ? x / opts.emblem : -4, opts.emblem ? -y / opts.emblem : 5);
    color.push(...(opts.color ?? [0.89, 0.84, 0.74]));
  }
  for (let i = 1; i + 1 < pts.length; i++) index.push(0, i, i + 1);
  return { name, pos, index, uv1, color };
}

describe("inscribedCircle", () => {
  it("finds the incircle of a square and a right triangle", () => {
    const sq = inscribedCircle(hull2d([[0, 0], [4, 0], [4, 4], [0, 4]]))!;
    expect(sq.r).toBeCloseTo(2, 2);
    expect(sq.x).toBeCloseTo(2, 2);
    const tri = inscribedCircle(hull2d([[0, 0], [3, 0], [0, 4]]))!;
    expect(tri.r).toBeCloseTo(1, 2); // (a + b - c) / 2
  });
});

describe("planSails", () => {
  const main = sail("sail_main", [[-4, 1], [0, 1], [0, 9]], { emblem: 2 });
  const fore = sail("sail_2", [[1, 1], [4, 1], [1, 7]]);
  const top = sail("sail_2", [[1, 7.5], [3, 7.5], [1, 11]]);
  const jib = sail("sail_jib", [[5, 1], [8, 1], [5, 8]]);

  it("sizes the main roundel so the logo fills the sail's inscribed circle", () => {
    const [m] = planSails([main]);
    const c = inscribedCircle(hull2d([[-4, 1], [0, 1], [0, 9]]))!;
    // emblem u = (x - cx) / D + 0.5 along +x: D from two corners
    const D = (0 - -4) / (m.emb[2] - m.emb[0]);
    expect(D * LOGO_R).toBeGreaterThan(c.r * 0.85);
    expect(D * LOGO_R).toBeLessThan(c.r);
    // the incircle centre maps to the emblem centre; v runs head → foot like the kit's
    const u = (c.x - -4) / D + m.emb[0];
    expect(u).toBeCloseTo(0.5, 3);
    expect(m.emb[5]).toBeLessThan(m.emb[1]); // the head corner (y = 9) has the smaller v
    // the frame the LOD bake projects with reproduces the main's own emblem UVs
    const f = m.frame!;
    for (let i = 0; i < 3; i++) {
      const p = [main.pos[i * 3], main.pos[i * 3 + 1], main.pos[i * 3 + 2]];
      const dot = (d: number[]) => p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
      expect((dot(f.du) - f.cx) / f.D + 0.5).toBeCloseTo(m.emb[i * 2], 5);
      expect((dot(f.dv) - f.cy) / f.D + 0.5).toBeCloseTo(m.emb[i * 2 + 1], 5);
    }
  });

  it("puts a second, smaller roundel on the next lower sail and none on the jib or topsails", () => {
    const out = planSails([main, fore, top, jib]);
    expect(Array.from(out[1].emb).every((v) => v !== -1)).toBe(true);
    expect(Array.from(out[2].emb).every((v) => v === -1)).toBe(true);
    expect(Array.from(out[3].emb).every((v) => v === -1)).toBe(true);
    expect(out[2].role[0]).toBe(ROLE_UPPER);
    expect(out[3].role[0]).toBe(ROLE_HEAD);
    expect(out[1].role[0]).toBe(ROLE_BODY);
  });

  it("marks a painted band (off the sail's own cloth colour) as ROLE_BAND", () => {
    const s = sail("sail_main", [[-4, 1], [0, 1], [0, 9], [-4, 9], [-4, 8], [0, 8]], { emblem: 2 });
    for (const i of [4, 5]) (s.color as number[]).splice(i * 3, 3, 0.03, 0.32, 0.16);
    const [m] = planSails([s]);
    expect(m.role[4]).toBe(ROLE_BAND);
    expect(m.role[0]).toBe(ROLE_BODY);
  });

  it("gives no second roundel to a small or steeply raked sail (an ancient artemon)", () => {
    const sq = sail("sail_main", [[-3, 1], [3, 1], [3, 7], [-3, 7]], { emblem: 2 });
    // the artemon: a small square sail raked 40° over the bow (out of the main's plane)
    const k = Math.cos((40 * Math.PI) / 180), z = Math.sin((40 * Math.PI) / 180);
    const art = sail("sail_extra", [[5, 1], [7, 1], [7, 3], [5, 3]]);
    const p = art.pos as number[];
    for (let i = 0; i < p.length; i += 3) { const y = p[i + 1] - 1; p[i + 1] = 1 + y * k; p[i + 2] = y * z; }
    // a big course raked the same way as the artemon (a raked secondary sail): still no roundel
    const raked = sail("sail_extra", [[8, 1], [13, 1], [13, 6], [8, 6]]);
    const q = raked.pos as number[];
    for (let i = 0; i < q.length; i += 3) { const y = q[i + 1] - 1; q[i + 1] = 1 + y * k; q[i + 2] = y * z; }
    const out = planSails([sq, art, raked]);
    expect(Array.from(out[1].emb).every((v) => v === -1)).toBe(true);
    expect(Array.from(out[2].emb).every((v) => v === -1)).toBe(true);
    // a tiny parallel sail: too small for a roundel
    const tiny = sail("sail_extra", [[5, 1], [6, 1], [6, 2], [5, 2]]);
    expect(Array.from(planSails([sq, tiny])[1].emb).every((v) => v === -1)).toBe(true);
    // a parallel fore course as big as the main keeps its roundel
    const fore = sail("sail_extra", [[5, 1], [10, 1], [10, 6], [5, 6]]);
    expect(Array.from(planSails([sq, fore])[1].emb).every((v) => v !== -1)).toBe(true);
  });
});
