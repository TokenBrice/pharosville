/**
 * Pure walk-graph logic for the DECLARED-DECORATIVE townsfolk (no three.js; carries no data).
 *
 * public/harbour/walkways.json is exported by src/harbour/life/tools/export_walkways.py from the island build's
 * own land/town/dress stages (quay promenades, terrace lanes, stairs, roads, pier spines, benches, chimneys).
 * Coordinates: glTF metres (x east, y up, z south). Headings: bow along (sin h, cos h).
 */

export type V3 = [number, number, number];
export type WalkKind = "quay" | "lane" | "stair" | "road" | "pier" | "mole";

export interface WalkPath { kind: WalkKind; w: number; pts: V3[] }
export interface Walkways {
  version: 1;
  paths: WalkPath[];
  benches: Array<{ p: V3; h: number }>;
  /** edge: quay edge facing the water; square: open standing ground; stall: a vendor's place behind a market stall */
  spots: Array<{ kind: "edge" | "square" | "stall"; p: V3; h: number }>;
  chimneys: V3[];
  flagpoles: Array<{ p: V3; h: number }>;
  bunting: Array<{ a: V3; b: V3; sag: number }>;
  /** the Pharos causeway, landing → islet pavement (the keeper's night walk) */
  causeway?: V3[];
  /** plan polygons [x, z] where goats graze */
  pastures?: Array<Array<[number, number]>>;
  /** the hay cart's farm road (never between two chain hamlets) */
  cartway?: V3[];
}

export interface WalkGraph {
  /** node positions, xyz interleaved */
  readonly pos: Float32Array;
  /** neighbours per node */
  readonly adj: number[][];
  /** half-width of the walkable strip at each node (lateral offset range) */
  readonly halfW: Float32Array;
  /** spawn table: directed edges (a → b) with cumulative weight */
  readonly spawnA: Int32Array;
  readonly spawnB: Int32Array;
  readonly spawnCum: Float32Array;
}

/** Where strollers go: the harbour front and the town, not the far coast roads. */
const KIND_WEIGHT: Record<WalkKind, number> = { quay: 4, lane: 2.4, stair: 1.2, pier: 0.4, road: 0.25, mole: 0.8 };

export interface WalkGraphOptions {
  /** test against the built island (e.g. the ground height field): a node inside a building or a wall is dropped with its edges */
  blocked?: ((x: number, y: number, z: number) => boolean) | undefined;
  /** the town heart (x, z): strollers start more often near it (≈ ×3 at the heart, fading over ~150 m) */
  focus?: [number, number] | undefined;
  joinDist?: number;
  joinDy?: number;
}

export function buildWalkGraph(paths: readonly WalkPath[], opts: WalkGraphOptions = {}): WalkGraph {
  const { blocked, focus, joinDist = 6, joinDy = 1.3 } = opts;
  const pos: number[] = [], halfW: number[] = [], adj: number[][] = [];
  const bad: boolean[] = [];
  const pathNodes: number[][] = [];
  const edges: Array<[number, number, number]> = [];
  for (const p of paths) {
    const ids: number[] = [];
    for (const v of p.pts) {
      const i = adj.length;
      // drop exact repeats (zero-length edges)
      if (ids.length) {
        const j = ids[ids.length - 1];
        if (Math.hypot(v[0] - pos[j * 3], v[1] - pos[j * 3 + 1], v[2] - pos[j * 3 + 2]) < 0.05) continue;
      }
      pos.push(v[0], v[1], v[2]); halfW.push(p.w * 0.5); adj.push([]); ids.push(i);
      bad.push(blocked ? blocked(v[0], v[1], v[2]) : false);
    }
    for (let k = 1; k < ids.length; k++) {
      if (bad[ids[k - 1]] || bad[ids[k]]) continue;
      adj[ids[k - 1]].push(ids[k]); adj[ids[k]].push(ids[k - 1]);
      edges.push([ids[k - 1], ids[k], KIND_WEIGHT[p.kind] ?? 1]);
    }
    pathNodes.push(ids);
  }
  // join every path end to the nearest node of another path (stair feet/heads to lanes and quays, roads to quays)
  for (let pi = 0; pi < pathNodes.length; pi++) {
    const ids = pathNodes[pi];
    if (ids.length < 2) continue;
    for (const e of [ids[0], ids[ids.length - 1]]) {
      if (bad[e]) continue;
      let best = -1, bd = joinDist;
      for (let pj = 0; pj < pathNodes.length; pj++) {
        if (pj === pi) continue;
        for (const n of pathNodes[pj]) {
          if (bad[n]) continue;
          const dy = Math.abs(pos[n * 3 + 1] - pos[e * 3 + 1]);
          if (dy > joinDy) continue;
          const d = Math.hypot(pos[n * 3] - pos[e * 3], pos[n * 3 + 2] - pos[e * 3 + 2]);
          if (d < bd) { bd = d; best = n; }
        }
      }
      if (best >= 0 && !adj[e].includes(best)) { adj[e].push(best); adj[best].push(e); }
    }
  }
  const sa: number[] = [], sb: number[] = [], sc: number[] = [];
  let cum = 0;
  for (const [a, b, w] of edges) {
    const near = focus ? 1 + 2 * Math.exp(-Math.hypot(pos[a * 3] - focus[0], pos[a * 3 + 2] - focus[1]) / 150) : 1;
    cum += w * near * Math.hypot(pos[b * 3] - pos[a * 3], pos[b * 3 + 2] - pos[a * 3 + 2]);
    sa.push(a); sb.push(b); sc.push(cum);
  }
  return {
    pos: Float32Array.from(pos), adj, halfW: Float32Array.from(halfW),
    spawnA: Int32Array.from(sa), spawnB: Int32Array.from(sb), spawnCum: Float32Array.from(sc),
  };
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Walker {
  a: number;
  b: number;
  /** metres travelled from a toward b */
  s: number;
  /** walking speed, m/s */
  speed: number;
  /** lateral offset, -1..1 of the strip half-width (people keep to their side) */
  lane: number;
  /** seconds left standing still (looking at the view) */
  pause: number;
  /** smoothed heading (rad) */
  yaw: number;
  /** 0 standing … 1 walking, eased */
  gait: number;
  // output
  x: number; y: number; z: number;
}

export function spawnWalker(g: WalkGraph, r: () => number): Walker {
  const total = g.spawnCum[g.spawnCum.length - 1] ?? 0;
  const t = r() * total;
  let lo = 0, hi = g.spawnCum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (g.spawnCum[m] < t) lo = m + 1; else hi = m; }
  const fwd = r() < 0.5;
  const a = fwd ? g.spawnA[lo] : g.spawnB[lo], b = fwd ? g.spawnB[lo] : g.spawnA[lo];
  const w: Walker = {
    a, b, s: r() * edgeLen(g, a, b), speed: 0.95 + r() * 0.5, lane: (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.55),
    pause: 0, yaw: 0, gait: 1, x: 0, y: 0, z: 0,
  };
  place(g, w);
  w.yaw = targetYaw(g, w);
  return w;
}

export function edgeLen(g: WalkGraph, a: number, b: number): number {
  const p = g.pos;
  return Math.hypot(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
}

function targetYaw(g: WalkGraph, w: Walker): number {
  const p = g.pos;
  return Math.atan2(p[w.b * 3] - p[w.a * 3], p[w.b * 3 + 2] - p[w.a * 3 + 2]);
}

/** Next node after arriving at `b` from `a`: mostly straight on, sometimes a turn, back only at dead ends. */
export function chooseNext(g: WalkGraph, a: number, b: number, r: () => number): number {
  const nb = g.adj[b];
  if (nb.length === 1) return nb[0];
  const p = g.pos;
  const ix = p[b * 3] - p[a * 3], iz = p[b * 3 + 2] - p[a * 3 + 2];
  const il = Math.hypot(ix, iz) || 1;
  let sum = 0;
  const ws: number[] = [];
  for (const n of nb) {
    if (n === a) { ws.push(0); continue; }
    const ox = p[n * 3] - p[b * 3], oz = p[n * 3 + 2] - p[b * 3 + 2];
    const ol = Math.hypot(ox, oz) || 1;
    const c = (ix * ox + iz * oz) / (il * ol);
    const w = (1 + c) * (1 + c) + 0.08;
    ws.push(w); sum += w;
  }
  if (sum <= 0) return a;
  let t = r() * sum;
  for (let k = 0; k < nb.length; k++) { t -= ws[k]; if (t <= 0 && ws[k] > 0) return nb[k]; }
  return nb.find((n) => n !== a) ?? a;
}

function place(g: WalkGraph, w: Walker): void {
  const p = g.pos, a = w.a * 3, b = w.b * 3;
  const L = edgeLen(g, w.a, w.b) || 1;
  const t = Math.min(1, Math.max(0, w.s / L));
  const dx = (p[b] - p[a]) / L, dz = (p[b + 2] - p[a + 2]) / L;
  const hw = g.halfW[w.a] + (g.halfW[w.b] - g.halfW[w.a]) * t;
  // keep to the right of travel (perp = (-dz, dx) is the left)
  const off = -w.lane * hw;
  w.x = p[a] + (p[b] - p[a]) * t - dz * off;
  w.y = p[a + 1] + (p[b + 1] - p[a + 1]) * t;
  w.z = p[a + 2] + (p[b + 2] - p[a + 2]) * t + dx * off;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Advance one stroller by dt seconds. Allocation-free. */
export function stepWalker(g: WalkGraph, w: Walker, dt: number, r: () => number): void {
  if (w.pause > 0) {
    w.pause -= dt;
    w.gait = Math.max(0, w.gait - dt * 2.5);
  } else {
    w.gait = Math.min(1, w.gait + dt * 1.6);
    w.s += w.speed * dt * (0.35 + 0.65 * w.gait);
    let guard = 4;
    let L = edgeLen(g, w.a, w.b);
    while (w.s >= L && guard-- > 0) {
      w.s -= L;
      const n = chooseNext(g, w.a, w.b, r);
      w.a = w.b; w.b = n;
      L = edgeLen(g, w.a, w.b);
      if (r() < 0.035) { w.pause = 2.5 + r() * 6; w.s = 0; break; }
    }
    if (L <= 0) w.s = 0;
  }
  place(g, w);
  const ty = targetYaw(g, w);
  w.yaw = wrap(w.yaw + wrap(ty - w.yaw) * Math.min(1, dt * 4));
}

/** How many townsfolk are about at this hour (0..1): a quiet dawn, a busy day, a thinning evening, few at night. */
export function townDensity(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const knots: Array<[number, number]> = [[0, 0.1], [4.5, 0.06], [6.5, 0.3], [9, 0.85], [12, 1], [17, 1], [19.5, 0.75], [21, 0.45], [23, 0.18], [24, 0.1]];
  for (let k = 1; k < knots.length; k++) {
    const [h1, v1] = knots[k];
    if (h <= h1) {
      const [h0, v0] = knots[k - 1];
      const t = (h - h0) / (h1 - h0);
      return v0 + (v1 - v0) * t * t * (3 - 2 * t);
    }
  }
  return knots[0][1];
}

/** Chimney smoke amount (0..1): the cooler hours and the night; a few kitchen fires at midday. */
export function smokeAmount(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const knots: Array<[number, number]> = [[0, 0.8], [5, 0.9], [8, 0.85], [11, 0.3], [15, 0.25], [17.5, 0.6], [20, 0.95], [24, 0.8]];
  for (let k = 1; k < knots.length; k++) {
    const [h1, v1] = knots[k];
    if (h <= h1) {
      const [h0, v0] = knots[k - 1];
      return v0 + (v1 - v0) * (h - h0) / (h1 - h0);
    }
  }
  return knots[0][1];
}
