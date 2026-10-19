import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWalkGraph, chooseNext, rng, smokeAmount, spawnWalker, stepWalker, townDensity, type WalkPath, type Walkways } from "./walkways";

const lane: WalkPath = { kind: "lane", w: 2, pts: [[0, 8, 0], [10, 8, 0], [20, 8, 0]] };
const stair: WalkPath = { kind: "stair", w: 1, pts: [[10, 2.4, 9], [10, 2.4, 6], [10, 8, 2], [10, 8, 0.5]] };
const quay: WalkPath = { kind: "quay", w: 1.4, pts: [[0, 2.4, 12], [10, 2.4, 11], [20, 2.4, 12]] };

describe("walk graph", () => {
  it("joins stair ends to the lane above and the quay below, never across levels", () => {
    const g = buildWalkGraph([lane, stair, quay]);
    // stair head (node 6) → lane middle (node 1); stair foot (node 3) → quay middle (node 8)
    expect(g.adj[6]).toContain(1);
    expect(g.adj[3]).toContain(8);
    // the lane's ends are 9-12 m above-plan from the quay but 5.6 m higher: no join
    expect(g.adj[0]).not.toContain(7);
  });

  it("goes straight on at a crossing more often than it turns, and turns back only at dead ends", () => {
    const g = buildWalkGraph([lane, stair, quay]);
    const r = rng(3);
    let straight = 0;
    for (let i = 0; i < 400; i++) if (chooseNext(g, 0, 1, r) === 2) straight++;
    expect(straight).toBeGreaterThan(250);
    expect(chooseNext(g, 1, 2, r)).toBe(1);
  });

  it("strollers stay on the network and never produce NaN", () => {
    const g = buildWalkGraph([lane, stair, quay]);
    const r = rng(9);
    const ws = Array.from({ length: 20 }, () => spawnWalker(g, r));
    for (let f = 0; f < 3000; f++) for (const w of ws) stepWalker(g, w, 1 / 30, r);
    for (const w of ws) {
      expect(Number.isFinite(w.x + w.y + w.z + w.yaw)).toBe(true);
      expect(w.y).toBeGreaterThanOrEqual(2.4 - 1e-4);
      expect(w.y).toBeLessThanOrEqual(8 + 1e-4);
    }
  });

  it("preserves the recorded seeded paths and poses exactly with cached edge geometry", () => {
    const g = buildWalkGraph([lane, stair, quay]);
    const r = rng(9);
    const ws = Array.from({ length: 3 }, () => spawnWalker(g, r));
    for (let f = 0; f < 3000; f++) for (const w of ws) stepWalker(g, w, 1 / 30, r);
    expect(ws).toEqual([
      { a: 0, b: 1, s: 9.438272935039034, speed: 1.3608358586672693, lane: 0.7288738855742849, pause: 0, yaw: 1.5707963267952187, gait: 1, x: 9.438272935039034, y: 8, z: -0.7288738855742849 },
      { a: 0, b: 1, s: 8.037548343730098, speed: 1.2661452601198107, lane: 0.673006965208333, pause: -0.0009409147935523082, yaw: 1.5707963267991318, gait: 1, x: 8.037548343730098, y: 8, z: -0.673006965208333 },
      { a: 9, b: 8, s: 0.3523032375043684, speed: 1.3151356541085988, lane: 0.551815199572593, pause: 0, yaw: -2.5370650336735885, gait: 1, x: 19.61100981190747, y: 2.4000000953674316, z: 12.349298163088188 },
    ]);
  });

  it("the exported walkways tie every town stair to the quays (one town network)", () => {
    const w = JSON.parse(readFileSync(resolve(__dirname, "../../../public/harbour/walkways.json"), "utf8")) as Walkways;
    const g = buildWalkGraph(w.paths);
    const comp = new Int32Array(g.adj.length).fill(-1);
    let c = 0;
    for (let s = 0; s < g.adj.length; s++) {
      if (comp[s] >= 0) continue;
      const stack = [s]; comp[s] = c;
      while (stack.length) { const v = stack.pop()!; for (const u of g.adj[v]) if (comp[u] < 0) { comp[u] = c; stack.push(u); } }
      c++;
    }
    // node index of each path's first vertex
    const first: number[] = [];
    let n = 0;
    for (const p of w.paths) { first.push(n); n += p.pts.filter((v, i) => i === 0 || v.some((x, k) => Math.abs(x - p.pts[i - 1][k]) >= 0.05)).length; }
    const quayComps = new Set(w.paths.flatMap((p, i) => (p.kind === "quay" ? [comp[first[i]]] : [])));
    const stairs = w.paths.flatMap((p, i) => (p.kind === "stair" ? [comp[first[i]]] : []));
    expect(stairs.length).toBeGreaterThan(3);
    for (const s of stairs) expect(quayComps.has(s)).toBe(true);
    expect(w.chimneys.length).toBeGreaterThan(10);
  });
});

describe("hour curves", () => {
  it("fewer people at night, more smoke in the cool hours", () => {
    expect(townDensity(13)).toBeGreaterThan(townDensity(23));
    expect(townDensity(3)).toBeLessThan(0.15);
    expect(smokeAmount(21)).toBeGreaterThan(smokeAmount(13));
  });
});
