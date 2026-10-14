/**
 * Normalizes a HarbourLayout (v1 piers/berths, v2 + moorings) into what the sim needs:
 * typed slots grouped into (where, class) pools, and an all-pairs routed one-way lane graph.
 */
import { pierIdFor, u01 } from "../model/classify";
import type { HarbourLayout, HullClass, Vec2 } from "../layout/types";
import { buildKeepOffField, buildObstacleField, clearance, coastDistance, hullClearance, openWaterFactor, type CoastGrid, type ObstacleField } from "./obstacles";

export const CLASS_ORDER: readonly HullClass[] = ["flagship", "large", "medium", "small", "boat", "skiff"];
export const DEFAULT_LOA: Record<HullClass, number> = { flagship: 26, large: 18, medium: 13, small: 10, boat: 7.5, skiff: 5 };

export type SlotKind = "berth" | "mooring" | "far" | "raft" | "shoals" | "wreck";

export interface Slot {
  index: number;
  id: string;
  where: string;
  cls: HullClass;
  kind: SlotKind;
  x: number;
  z: number;
  /** Nominal bow heading when moored here (berth heading; into the prevailing wind for swinging slots). */
  heading: number;
  /** Swinging slots (mooring/shoals/far/raft): distance from the buoy/anchor to the hull centre. */
  swing: number;
  /** Lane node the arrival leaves the lane graph from / the departure joins it at. */
  inNode: number;
  outNode: number;
  /** Arrival polyline (x,z pairs), from the inNode position to the slot. */
  approach: Vec2[];
  /** True when departures back out first (bow-in berths, pontoon rows). */
  astern: boolean;
  /** How the hull lies: alongside a quay/T-head, bow-in to a finger or pontoon, or swinging/anchored/beached. */
  mode: SlotMode;
  /** Alongside: offset from the berth to where the hull lies once warped off (outward, ~1 beam). */
  warp: Vec2 | null;
  /** Pontoon rows: where the bow line makes fast. */
  line: Vec2 | null;
  /** Slots whose hull footprint overlaps this one's: never occupied at the same time. */
  conflicts: number[];
}

export type SlotMode = "alongside" | "finger" | "pontoon" | "swing" | "anchor" | "beached" | "raft";

export interface LaneGraph {
  ids: string[];
  x: Float64Array;
  z: Float64Array;
  n: number;
  /** All-pairs shortest distance (n*n), Infinity when unreachable. */
  dist: Float64Array;
  /** Same routes in harbour-speed metres (open-water stretches count less: hulls go faster there). */
  tdist: Float64Array;
  /** next hop on the shortest path from i to j (n*n), -1 if none. */
  next: Int32Array;
  /** Nodes with both an in and an out edge (the through-lanes). */
  through: number[];
  index: Map<string, number>;
}

/** Wind the hull lies to when it can swing: direction the wind blows FROM, as a bow heading. */
export const PREVAILING_WIND_FROM = -2.35;

/** Lanes keep this far (m) from land and structure: a flagship's half-beam plus a 4 m margin. */
export const LANE_CLEARANCE = 7.5;

/**
 * Lane edges authored as straight lines may cut a headland, a quay or a row of pontoons. Each blocked
 * edge is re-routed once, at load, by A* on a coarse clearance grid and string-pulled into a few
 * waypoints, so every hull path built on the lanes starts from water.
 */
export function detourEdge(field: ObstacleField, keepOff: ObstacleField | null, ax: number, az: number, bx: number, bz: number, need: number, pad = 220, skip = 12): Vec2[] | null {
  // clearance in "need" units: hard structure, and still hulls (which may be passed closer)
  const cl = (x: number, z: number) => {
    const c = clearance(field, x, z);
    return keepOff ? Math.min(c, (clearance(keepOff, x, z) + 0.5) * (need / 3)) : c;
  };
  const segOk = (x0: number, z0: number, x1: number, z1: number, lim: number, skipEnds: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), k = Math.max(2, Math.ceil(len / 2));
    for (let i = 0; i <= k; i++) {
      const t = i / k, d = t * len;
      if (d < skipEnds || len - d < skipEnds) continue;
      if (cl(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) < lim) return false;
    }
    return true;
  };
  // the nodes themselves may sit close to things: judge the edge away from its ends
  if (segOk(ax, az, bx, bz, need, skip)) return null;
  const C = 4;
  const minX = Math.min(ax, bx) - pad, minZ = Math.min(az, bz) - pad;
  const nx = Math.ceil((Math.max(ax, bx) + pad - minX) / C), nz = Math.ceil((Math.max(az, bz) + pad - minZ) / C);
  const N = nx * nz;
  const clr = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) clr[j * nx + i] = cl(minX + (i + 0.5) * C, minZ + (j + 0.5) * C);
  const cellOf = (x: number, z: number) => Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / C))) * nx + Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / C)));
  const s0 = cellOf(ax, az), s1 = cellOf(bx, bz);
  const g = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap: number[] = [], key: number[] = [];
  const push = (c: number, k: number) => {
    heap.push(c); key.push(k);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (key[p] <= key[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [key[p], key[i]] = [key[i], key[p]]; i = p; }
  };
  const pop = (): number => {
    const top = heap[0], lastC = heap.pop()!, lastK = key.pop()!;
    if (heap.length) {
      heap[0] = lastC; key[0] = lastK;
      let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && key[l] < key[m]) m = l; if (r < heap.length && key[r] < key[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [key[m], key[i]] = [key[i], key[m]]; i = m; }
    }
    return top;
  };
  const h = (c: number) => Math.hypot((c % nx) - (s1 % nx), Math.floor(c / nx) - Math.floor(s1 / nx)) * C;
  g[s0] = 0; push(s0, h(s0));
  const nearR = skip + 2;
  const near = (c: number) => Math.hypot(((c % nx) - (s0 % nx)) * C, (Math.floor(c / nx) - Math.floor(s0 / nx)) * C) < nearR || Math.hypot(((c % nx) - (s1 % nx)) * C, (Math.floor(c / nx) - Math.floor(s1 / nx)) * C) < nearR;
  while (heap.length) {
    const c = pop();
    if (closed[c]) continue;
    closed[c] = 1;
    if (c === s1) break;
    const ci = c % nx, cj = Math.floor(c / nx);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i2 = ci + di, j2 = cj + dj;
      if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= nz) continue;
      const c2 = j2 * nx + i2;
      if (closed[c2]) continue;
      const cl = clr[c2];
      if (cl < need * 0.6 && !near(c2)) continue;
      // prefer open water: a soft cost for running close to things
      const w = (di && dj ? Math.SQRT2 : 1) * C * (1 + Math.max(0, (need * 2.2 - cl) / need) * 1.5);
      const ng = g[c] + w;
      if (ng < g[c2]) { g[c2] = ng; prev[c2] = c; push(c2, ng + h(c2)); }
    }
  }
  if (prev[s1] < 0) return null;
  const cells: Vec2[] = [];
  for (let c = s1; c >= 0; c = prev[c]) cells.push([minX + ((c % nx) + 0.5) * C, minZ + (Math.floor(c / nx) + 0.5) * C]);
  cells.reverse();
  cells[0] = [ax, az]; cells[cells.length - 1] = [bx, bz];
  // string-pull: from each kept point, jump to the farthest point still in clear view
  const out: Vec2[] = [cells[0]];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !segOk(cells[i][0], cells[i][1], cells[j][0], cells[j][1], need * 0.85, i === 0 || j === cells.length - 1 ? skip - 2 : 0)) j--;
    out.push(cells[j]);
    i = j;
  }
  return out.slice(1, -1);
}

export function buildLaneGraph(layout: HarbourLayout, field: ObstacleField | null = null, keepOff: ObstacleField | null = null): LaneGraph {
  const srcNodes = layout.lanes?.nodes ?? [];
  const ids = srcNodes.map((nd) => nd.id);
  const xs: number[] = srcNodes.map((nd) => nd.position[0]), zs: number[] = srcNodes.map((nd) => nd.position[2]);
  const index = new Map(ids.map((id, i) => [id, i]));
  // A zone's gate (Far Ports, Shoals) is where its traffic leaves the lane, not a waypoint for
  // everyone else: through traffic bypasses it instead of sailing through the moored rows / reef.
  let edges = [...(layout.lanes?.edges ?? [])];
  const zoneGates = new Set(Object.values(layout.zones ?? {}).map((z) => (z as { gate?: unknown })?.gate).filter((g): g is string => typeof g === "string"));
  for (const gid of zoneGates) {
    const ins = edges.filter((e) => e.to === gid).map((e) => e.from), outs = edges.filter((e) => e.from === gid).map((e) => e.to);
    for (const a of ins) for (const b of outs) if (a !== b && !edges.some((e) => e.from === a && e.to === b)) edges.push({ from: a, to: b });
  }
  if (field) {
    const split: typeof edges = [];
    for (const e of edges) {
      const a = index.get(e.from), b = index.get(e.to);
      if (a == null || b == null) { split.push(e); continue; }
      const way = detourEdge(field, keepOff, xs[a], zs[a], xs[b], zs[b], LANE_CLEARANCE);
      if (!way || !way.length) { split.push(e); continue; }
      let last = e.from;
      way.forEach((q, k) => {
        const id = `${e.from}>${e.to}#${k + 1}`;
        if (!index.has(id)) { index.set(id, ids.length); ids.push(id); xs.push(q[0]); zs.push(q[1]); }
        split.push({ from: last, to: id });
        last = id;
      });
      split.push({ from: last, to: e.to });
    }
    edges = split;
  }
  const n = ids.length;
  const x = Float64Array.from(xs), z = Float64Array.from(zs);
  const adj: Array<Array<[number, number]>> = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n), outdeg = new Int32Array(n);
  for (const e of edges) {
    const a = index.get(e.from), b = index.get(e.to);
    if (a == null || b == null) continue;
    adj[a].push([b, Math.hypot(x[b] - x[a], z[b] - z[a])]);
    outdeg[a]++; indeg[b]++;
    if (layout.lanes.oneWay === false) { adj[b].push([a, Math.hypot(x[b] - x[a], z[b] - z[a])]); outdeg[b]++; indeg[a]++; }
  }
  const dist = new Float64Array(n * n).fill(Infinity);
  const tdist = new Float64Array(n * n).fill(Infinity);
  const tcache = new Map<number, number>();
  const edgeTime = (a: number, b: number): number => {
    const key = a * n + b;
    let v = tcache.get(key);
    if (v == null) {
      const len = Math.hypot(x[b] - x[a], z[b] - z[a]), k = Math.max(2, Math.ceil(len / 20));
      let f = 0;
      for (let i = 0; i < k; i++) f += 1 / openWaterFactor(field, x[a] + ((x[b] - x[a]) * (i + 0.5)) / k, z[a] + ((z[b] - z[a]) * (i + 0.5)) / k);
      v = (len * f) / k;
      tcache.set(key, v);
    }
    return v;
  };
  const next = new Int32Array(n * n).fill(-1);
  const d = new Float64Array(n), prev = new Int32Array(n), done = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    d.fill(Infinity); prev.fill(-1); done.fill(0); d[s] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const [v, w] of adj[u]) if (d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = u; }
    }
    for (let t = 0; t < n; t++) {
      dist[s * n + t] = d[t];
      if (t === s || !Number.isFinite(d[t])) continue;
      let c = t, td = 0;
      while (c !== s && prev[c] >= 0) { td += edgeTime(prev[c], c); if (prev[c] === s) break; c = prev[c]; }
      tdist[s * n + t] = td;
      c = t;
      while (prev[c] !== s && prev[c] >= 0) c = prev[c];
      next[s * n + t] = c;
    }
  }
  const through: number[] = [];
  for (let i = 0; i < n; i++) {
    if (indeg[i] > 0 && outdeg[i] > 0) through.push(i);
    tdist[i * n + i] = 0;
  }
  return { ids, x, z, n, dist, tdist, next, through, index };
}

/** Node sequence a → b (inclusive). Empty when unreachable; [a] when a === b. */
export function routeNodes(g: LaneGraph, a: number, b: number): number[] {
  if (a < 0 || b < 0) return [];
  if (a === b) return [a];
  if (!Number.isFinite(g.dist[a * g.n + b])) return [];
  const out = [a];
  let c = a;
  for (let guard = 0; c !== b && guard < g.n; guard++) { c = g.next[c * g.n + b]; out.push(c); }
  return out;
}

export function nearestNode(g: LaneGraph, x: number, z: number, candidates: readonly number[] = g.through, fx = 0, fz = 0): number {
  let best = -1, bd = Infinity;
  for (const i of candidates) {
    const dx = g.x[i] - x, dz = g.z[i] - z;
    let dd = Math.hypot(dx, dz);
    if ((fx !== 0 || fz !== 0) && dx * fx + dz * fz < 0) dd *= 3; // prefer nodes ahead of the bow
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
}

export interface SimLayout {
  graph: LaneGraph;
  /** Bow heading into the prevailing wind (layout.wind.bowHeadingRad in v2). */
  windFrom: number;
  /** Clearance field from the layout geometry (null when the layout has none, e.g. tests). */
  field: ObstacleField | null;
  /** Distance to still hulls (moorings, Far Ports rows, the Shoals) and no-go zones: lanes keep off it. */
  keepOff: ObstacleField | null;
  /** Fine clearance (m) to hard structure: the real coast (sea SDF) and pier decks. */
  hard(x: number, z: number): number;
  slots: Slot[];
  /** pools.get(where)?.get(cls) → slot indices. */
  pools: Map<string, Map<HullClass, number[]>>;
  shoals: number[];
  /** Wreck Cove: authored hulks first (beached), then the boneyard along the same strand. */
  wrecks: number[];
  /** Slipway launch polyline (x,z), or null. */
  launchPath: Vec2[] | null;
  loa: Record<HullClass, number>;
  beam: Record<HullClass, number>;
  /** where → chain name (piers only). */
  pierChains: Map<string, string>;
  /** chain name / pier id (lower-case) → where. */
  whereOf(chainOrId: string | null): string;
  /** Representative in/out lane nodes per where. */
  gates: Map<string, { inNode: number; outNode: number; x: number; z: number }>;
  /** The Pharos (x, z): harbour outings near it sail past under the light. Null when the layout has none. */
  pharos: Vec2 | null;
}

function mode(xs: number[]): number {
  const c = new Map<number, number>();
  let best = -1, bc = 0;
  for (const v of xs) { const k = (c.get(v) ?? 0) + 1; c.set(v, k); if (k > bc || (k === bc && v < best)) { bc = k; best = v; } }
  return best;
}

function segDist(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

/** Where still hulls lie (from the layout alone): mooring swing circles, Far Ports rows, the Shoals. */
function stillHullDisks(layout: HarbourLayout, loa: Record<HullClass, number>): Array<[number, number, number]> {
  const disks: Array<[number, number, number]> = [];
  type M = NonNullable<HarbourLayout["moorings"]>[number] & { boatCenter?: [number, number, number] };
  for (const m of (layout.moorings ?? []) as M[]) {
    const L = loa[m.class];
    const swing = m.boatCenter ? Math.hypot(m.boatCenter[0] - m.position[0], m.boatCenter[2] - m.position[2]) : Math.max(L * 0.5 + 1, (m.swingRadius ?? L) - L * 0.5);
    disks.push([m.position[0], m.position[2], swing + L / 2 + 1.5]);
  }
  for (const row of layout.zones?.farPorts?.rows ?? []) {
    const L = loa[row.cls], la = row.line?.[0], lb = row.line?.[row.line.length - 1];
    for (const sl of row.slots) {
      if (!la || !lb) { disks.push([sl[0], sl[2], L / 2 + 1]); continue; }
      const ll = Math.hypot(lb[0] - la[0], lb[1] - la[1]) || 1, dx = (lb[0] - la[0]) / ll, dz = (lb[1] - la[1]) / ll;
      const t = (sl[0] - la[0]) * dx + (sl[2] - la[1]) * dz, px = la[0] + dx * t, pz = la[1] + dz * t;
      let nx = sl[0] - px, nz = sl[2] - pz;
      const nl = Math.hypot(nx, nz);
      if (nl < 1e-3) { disks.push([sl[0], sl[2], L / 2 + 1]); continue; }
      nx /= nl; nz /= nl;
      disks.push([px + nx * (1.6 + L / 2), pz + nz * (1.6 + L / 2), L / 2 + 1]);
    }
  }
  for (const sl of layout.zones?.shoals?.slots ?? []) disks.push([sl[0], sl[2], 3 + loa.medium / 2 + 1.5]);
  return disks;
}

function noGoZones(layout: HarbourLayout): Vec2[][] {
  const polys: Vec2[][] = [];
  const z = layout.zones ?? {};
  if ((z.wreckCove?.polygon?.length ?? 0) >= 3) polys.push(z.wreckCove!.polygon);
  if ((z.shoals?.polygon?.length ?? 0) >= 3) polys.push(z.shoals!.polygon);
  return polys;
}

/** Wreck Cove boneyard size: room for every recorded dead coin. */
export const BONEYARD_MAX = 110;
/** The boneyard keeps to the cove: strand within this radius (m) of its hulks. */
const BONEYARD_R = 95;
/** Shoals anchorages (authored + generated): a bad day can put dozens of coins off peg. */
export const SHOALS_MAX = 40;

export function buildSimLayout(layout: HarbourLayout, coast: CoastGrid | null = null): SimLayout {
  const field = buildObstacleField(layout, coast);
  const loa0 = { ...DEFAULT_LOA, ...(layout.hull?.loa ?? {}) } as Record<HullClass, number>;
  const keepOff = field ? buildKeepOffField(field, stillHullDisks(layout, loa0), noGoZones(layout)) : null;
  const graph = buildLaneGraph(layout, field, keepOff);
  const loa = { ...DEFAULT_LOA, ...(layout.hull?.loa ?? {}) } as Record<HullClass, number>;
  const beam = Object.fromEntries(CLASS_ORDER.map((k) => [k, layout.hull?.beam?.[k] ?? loa[k] * 0.32])) as Record<HullClass, number>;
  const slots: Slot[] = [];
  const pools = new Map<string, Map<HullClass, number[]>>();
  const pierChains = new Map<string, string>();
  const alias = new Map<string, string>();
  const nodeOf = (id: string | undefined) => (id == null ? -1 : graph.index.get(id) ?? -1);
  const bowVec = (h: number): Vec2 => [Math.sin(h), Math.cos(h)];
  const windFrom = (layout as { wind?: { bowHeadingRad?: number } }).wind?.bowHeadingRad ?? PREVAILING_WIND_FROM;

  // hard structure, fine: the real coast when the SDF is known, else the coarse field; plus decks
  const decks: Array<{ a: Vec2; b: Vec2; hw: number }> = [];
  for (const p of layout.piers ?? []) for (const s of p.segments ?? []) if (!(coast && s.kind === "quay")) decks.push({ a: s.a, b: s.b, hw: Math.max(0.45, s.width / 2) });
  for (const row of layout.zones?.farPorts?.rows ?? []) for (let i = 1; i < (row.line?.length ?? 0); i++) decks.push({ a: row.line[i - 1], b: row.line[i], hw: 1.4 });
  // decks bucketed by DECK_CELL: every deck within DECK_CELL m of a point is in that point's bucket
  // (exact below that range; beyond it a distance only reads as "at least that far")
  const DECK_CELL = 16;
  const deckGrid = new Map<number, number[]>();
  const dkey = (i: number, j: number) => (i + 4096) * 8192 + j + 4096;
  decks.forEach((d, k) => {
    const r = d.hw + DECK_CELL;
    for (let i = Math.floor((Math.min(d.a[0], d.b[0]) - r) / DECK_CELL); i <= Math.floor((Math.max(d.a[0], d.b[0]) + r) / DECK_CELL); i++)
      for (let j = Math.floor((Math.min(d.a[1], d.b[1]) - r) / DECK_CELL); j <= Math.floor((Math.max(d.a[1], d.b[1]) + r) / DECK_CELL); j++) {
        const key = dkey(i, j);
        (deckGrid.get(key) ?? deckGrid.set(key, []).get(key)!).push(k);
      }
  });
  const hard = (x: number, z: number): number => {
    let c = coast ? coastDistance(coast, x, z) : field ? clearance(field, x, z) : 1e3;
    const near = deckGrid.get(dkey(Math.floor(x / DECK_CELL), Math.floor(z / DECK_CELL)));
    if (near) for (const k of near) {
      const d = decks[k];
      const v = segDist(x, z, d.a, d.b) - d.hw;
      if (v < c) c = v;
    }
    return c;
  };

  const add = (s: Omit<Slot, "index" | "conflicts" | "warp" | "line"> & { warp?: Vec2 | null; line?: Vec2 | null }) => {
    const slot: Slot = { warp: null, line: null, ...s, conflicts: [], index: slots.length };
    slots.push(slot);
    if (s.kind === "shoals" || s.kind === "wreck") return slot;
    let byCls = pools.get(s.where);
    if (!byCls) pools.set(s.where, (byCls = new Map()));
    let list = byCls.get(s.cls);
    if (!list) byCls.set(s.cls, (list = []));
    list.push(slot.index);
    return slot;
  };
  /** Swinging slot: arrive from the lane node, finish heading into the prevailing wind. */
  const swingSlot = (id: string, where: string, cls: HullClass, kind: SlotKind, px: number, pz: number, swing: number, inNode: number, outNode: number, heading?: number, approach?: Vec2[]) => {
    // Without an authored approach the hull comes straight in from its gate and lets go there; it
    // then swings to the wind at rest (restPose), instead of looping round to come up head-to-wind.
    let h = heading ?? windFrom;
    if (heading == null && !approach && inNode >= 0) h = Math.atan2(px - graph.x[inNode], pz - graph.z[inNode]);
    const [bx, bz] = bowVec(h);
    const cx = px - bx * swing, cz = pz - bz * swing;
    const pre: Vec2 = [cx - bx * loa[cls] * 2.2, cz - bz * loa[cls] * 2.2];
    const start: Vec2 = inNode >= 0 ? [graph.x[inNode], graph.z[inNode]] : pre;
    let ap: Vec2[] = [start, pre, [cx, cz]];
    if (approach && approach.length >= 2) {
      ap = approach.map((q) => [q[0], q[1]] as Vec2);
      ap[ap.length - 1] = [cx, cz];
      if (inNode >= 0 && Math.hypot(ap[0][0] - start[0], ap[0][1] - start[1]) > 1) ap.unshift(start);
    }
    return add({ id, where, cls, kind, x: px, z: pz, heading: h, swing, inNode, outNode, approach: ap, astern: false, mode: kind === "shoals" ? "anchor" : "swing" });
  };

  /**
   * Alongside: slide the berth off the wall until the whole hull (tapered at the ends) clears it by a
   * fender gap, and note which way it warps off. Curved quays and T-heads no longer eat the hull.
   */
  const fitAlongside = (x: number, z: number, h: number, cls: HullClass): { x: number; z: number; warp: Vec2 } => {
    const [fx, fz] = bowVec(h);
    const sx = -fz, sz = fx;
    const L = loa[cls], B = beam[cls];
    const side = hard(x + sx * B, z + sz * B) >= hard(x - sx * B, z - sz * B) ? 1 : -1;
    const ox = sx * side, oz = sz * side;
    let px = x, pz = z;
    for (let it = 0; it < 48; it++) {
      let worst = Infinity;
      for (const t of [-0.47, -0.35, -0.2, 0, 0.2, 0.35, 0.47]) {
        const need = 0.6 + (B / 2) * (1 - 0.55 * (2 * t) ** 2);
        worst = Math.min(worst, hard(px + fx * L * t, pz + fz * L * t) - need);
      }
      if (worst >= 0) break;
      px += ox * 0.25; pz += oz * 0.25;
    }
    // warped off about a beam, less where something lies off her (the whole hull must stay clear)
    let w = B * 0.85 + 0.8;
    while (w > 0.4 && hullClearance(hard, px + ox * w, pz + oz * w, h, L, B) < 0.3) w -= 0.2;
    return { x: px, z: pz, warp: [ox * w, oz * w] };
  };

  for (const p of layout.piers ?? []) {
    pierChains.set(p.id, p.chain);
    alias.set(p.id.toLowerCase(), p.id);
    alias.set(p.chain.toLowerCase(), p.id);
    alias.set(pierIdFor(p.chain), p.id);
    for (const b of p.berths ?? []) {
      const gate = nodeOf(b.gate);
      let approach: Vec2[] = (b.approach ?? []).map((q) => [q[0], q[1]] as Vec2);
      let end: Vec2 = [b.position[0], b.position[2]];
      const alongside = (b as { mode?: string }).mode === "alongside" || ((b as { mode?: string }).mode == null && (b.class === "flagship" || b.class === "large"));
      let warp: Vec2 | null = null;
      if (alongside && (coast || field)) {
        const f = fitAlongside(end[0], end[1], b.headingRad, b.class);
        end = [f.x, f.z]; warp = f.warp;
      }
      if (approach.length < 2) {
        const [bx, bz] = bowVec(b.headingRad);
        const g = gate >= 0 ? gate : nearestNode(graph, end[0], end[1]);
        approach = [[graph.x[g], graph.z[g]], [end[0] - bx * loa[b.class] * 2, end[1] - bz * loa[b.class] * 2], end];
      }
      approach[approach.length - 1] = end;
      const g = gate >= 0 ? gate : nearestNode(graph, approach[0][0], approach[0][1]);
      add({ id: b.id, where: p.id, cls: b.class, kind: "berth", x: end[0], z: end[1], heading: b.headingRad, swing: 0, inNode: g, outNode: g, approach, astern: !alongside, mode: alongside ? "alongside" : "finger", warp });
    }
  }
  const whereOf = (chainOrId: string | null): string => {
    if (!chainOrId) return "far";
    const k = chainOrId.toLowerCase();
    return alias.get(k) ?? alias.get(pierIdFor(chainOrId)) ?? "far";
  };

  type MooringV2 = NonNullable<HarbourLayout["moorings"]>[number] & { headingRad?: number; boatCenter?: [number, number, number]; gate?: string; approach?: Vec2[] };
  for (const m of (layout.moorings ?? []) as MooringV2[]) {
    const where = whereOf(m.chain);
    const g = nodeOf(m.gate);
    const node = g >= 0 ? g : nearestNode(graph, m.position[0], m.position[2]);
    const swing = m.boatCenter
      ? Math.hypot(m.boatCenter[0] - m.position[0], m.boatCenter[2] - m.position[2])
      : Math.max(loa[m.class] * 0.5 + 1, (m.swingRadius ?? loa[m.class]) - loa[m.class] * 0.5);
    swingSlot(m.id, where, m.class, "mooring", m.position[0], m.position[2], swing, node, node, m.headingRad ?? windFrom, m.approach);
  }

  const zones = layout.zones ?? {};
  const zoneGate = (zone: { gate?: unknown } | undefined, ...ids: string[]) => {
    for (const id of [typeof zone?.gate === "string" ? zone.gate : "", ...ids]) { const k = nodeOf(id || undefined); if (k >= 0) return k; }
    return -1;
  };
  // Far Ports: pontoon rows; hulls lie bow-in to the pontoon and come and go along the fairway behind
  // their row (the next row's pontoon bounds it), so nobody sails through a moored row.
  const farZone = zones.farPorts as ({ gate?: string } & NonNullable<typeof zones.farPorts>) | undefined;
  const farIn = zoneGate(farZone, "gate-in:far", "F-gate"), farOut = zoneGate(farZone, "gate-out:far", "F-gate");
  let fi = 0;
  for (const row of zones.farPorts?.rows ?? []) {
    const L = loa[row.cls];
    const la = row.line?.[0], lb = row.line?.[row.line.length - 1];
    for (const s of row.slots) {
      const inN = farIn >= 0 ? farIn : nearestNode(graph, s[0], s[2]);
      const outN = farOut >= 0 ? farOut : inN;
      const id = `far/${row.cls}/${String(++fi).padStart(3, "0")}`;
      if (!la || !lb || Math.hypot(lb[0] - la[0], lb[1] - la[1]) < 1) {
        swingSlot(id, "far", row.cls, "far", s[0], s[2], L * 0.15, inN, outN);
        continue;
      }
      const ll = Math.hypot(lb[0] - la[0], lb[1] - la[1]);
      const dx = (lb[0] - la[0]) / ll, dz = (lb[1] - la[1]) / ll;
      const t = (s[0] - la[0]) * dx + (s[2] - la[1]) * dz;
      const lp: Vec2 = [la[0] + dx * t, la[1] + dz * t];
      let nx = s[0] - lp[0], nz = s[2] - lp[1];
      const nl = Math.hypot(nx, nz) || 1;
      if (nl > L * 0.8 || t < -L || t > ll + L) {
        // not moored to this row's pontoon: an anchorage spot
        swingSlot(id, "far", row.cls, "far", s[0], s[2], L * 0.15, inN, outN);
        continue;
      }
      nx /= nl; nz /= nl;
      const h = Math.atan2(-nx, -nz); // bow to the pontoon
      const off = 1.6 + L / 2;
      const cx = lp[0] + nx * off, cz = lp[1] + nz * off;
      // fairway: from the sterns to whatever bounds it (the next pontoon), at most 2 LOA
      let room = 0;
      while (room < L * 2 && hard(cx + nx * (L / 2 + room + 1), cz + nz * (L / 2 + room + 1)) > beam[row.cls] * 0.5) room += 1;
      const co = L / 2 + Math.max(2.5, room * 0.5);
      // enter the fairway from one of its ends, from the nearest lane node in clear water (the Far
      // Ports gate may sit among the rows: through the rows is no way in)
      const fairway = (tt: number): Vec2 => [la[0] + dx * tt + nx * (off + co), la[1] + dz * tt + nz * (off + co)];
      const clearRun = (p: Vec2, q: Vec2) => {
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.max(2, Math.ceil(len / 3));
        for (let i = 1; i < k; i++) {
          const x = p[0] + ((q[0] - p[0]) * i) / k, z = p[1] + ((q[1] - p[1]) * i) / k;
          if ((field && clearance(field, x, z) < 4) || (keepOff && clearance(keepOff, x, z) < 0.5)) return false;
        }
        return true;
      };
      let best: { endT: number; node: number; d: number } | null = null;
      // (enter the fairway well clear of the row's end: the turn in must not sweep the end hull)
      for (const endT of [-L * 2.6, ll + L * 2.6]) {
        const e = fairway(endT);
        const cand = graph.through.map((k) => [k, Math.hypot(graph.x[k] - e[0], graph.z[k] - e[1])] as [number, number]).sort((p, q) => p[1] - q[1]).slice(0, 8);
        for (const [k, d] of cand) {
          const dd = d + Math.abs(endT - t);
          if (best && dd >= best.d) break;
          if (clearRun([graph.x[k], graph.z[k]], e)) { best = { endT, node: k, d: dd }; break; }
        }
      }
      const endT = best ? best.endT : -L * 2.6;
      const node = best ? best.node : inN;
      const sg = Math.sign(endT - t) || 1;
      const approach: Vec2[] = [fairway(endT)];
      if (Math.abs(endT - t) > L * 2.2) approach.push(fairway(t + sg * L * 1.1));
      approach.push([cx + nx * Math.min(co, L * 0.9), cz + nz * Math.min(co, L * 0.9)], [cx, cz]);
      if (node >= 0) approach.unshift([graph.x[node], graph.z[node]]);
      add({ id, where: "far", cls: row.cls, kind: "far", x: cx, z: cz, heading: h, swing: 0, inNode: node, outNode: node, approach, astern: true, mode: "pontoon", line: [lp[0] + nx * 1.2, lp[1] + nz * 1.2] });
    }
  }
  /** Least clearance of a hull lying to the wind (± the tide and her own yaw) round an anchor at (px, pz). */
  const swingClear = (px: number, pz: number, swing: number, cls: HullClass): number => {
    let w = Infinity;
    for (let k = -10; k <= 10; k++) {
      const h = windFrom + k * 0.125;
      w = Math.min(w, hullClearance(hard, px - Math.sin(h) * (swing + 0.3), pz - Math.cos(h) * (swing + 0.3), h, loa[cls], beam[cls]));
    }
    return w;
  };
  /** An anchorage too close in for the hull swinging round it moves to the nearest spot where she clears (within ~30 m). */
  const offShore = (px: number, pz: number, swing: number, cls: HullClass): Vec2 => {
    if (swingClear(px, pz, swing, cls) >= 1) return [px, pz];
    for (let k = 1; k < 1200; k++) {
      const a = k * 2.399963, r = 0.9 * Math.sqrt(k);
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (swingClear(x, z, swing, cls) >= 1) return [x, z];
    }
    return [px, pz];
  };
  const shZone = zones.shoals as ({ gate?: string } & NonNullable<typeof zones.shoals>) | undefined;
  const shIn = zoneGate(shZone, "gate-in:shoals", "SH-gate"), shOut = zoneGate(shZone, "gate-out:shoals", "SH-gate");
  const shoals: number[] = [];
  (zones.shoals?.slots ?? []).forEach((s, i) => {
    const inN = shIn >= 0 ? shIn : nearestNode(graph, s[0], s[2]);
    const [ax, az] = offShore(s[0], s[2], 3, "medium");
    const slot = swingSlot(`shoals/${String(i + 1).padStart(2, "0")}`, "shoals", "medium", "shoals", ax, az, 3, inN, shOut >= 0 ? shOut : inN);
    shoals.push(slot.index);
  });

  // more anchorage on the reef than authored (a bad day has many depegs): spread seaward of the
  // authored spots, well clear of every lane and of each other
  if (shoals.length) {
    let cx = 0, cz = 0;
    for (const i of shoals) { cx += slots[i].x; cz += slots[i].z; }
    cx /= shoals.length; cz /= shoals.length;
    const laneD = (x: number, z: number) => {
      let d = Infinity;
      for (const e of layout.lanes?.edges ?? []) {
        const a = graph.index.get(e.from), b = graph.index.get(e.to);
        if (a == null || b == null) continue;
        d = Math.min(d, segDist(x, z, [graph.x[a], graph.z[a]], [graph.x[b], graph.z[b]]));
      }
      return d;
    };
    const taken: Vec2[] = shoals.map((i) => [slots[i].x, slots[i].z]);
    const inN = slots[shoals[0]].inNode, outN = slots[shoals[0]].outNode;
    for (let k = 0; k < 1200 && shoals.length < SHOALS_MAX; k++) {
      const a = k * 2.399963, r = 8 + 3.2 * Math.sqrt(k + 1);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (laneD(x, z) < 30 || hard(x, z) < 12 || swingClear(x, z, 3, "medium") < 1) continue;
      if (taken.some((q) => Math.hypot(q[0] - x, q[1] - z) < 15)) continue;
      // and clear of every other hull lying here (moorings and Far Ports rows near the reef)
      const reach = 3 + loa.medium / 2 + 2;
      if (slots.some((o) => o.kind !== "shoals" && o.kind !== "wreck" && Math.hypot(o.x - x, o.z - z) < reach + o.swing + loa[o.cls] / 2)) continue;
      taken.push([x, z]);
      shoals.push(swingSlot(`shoals/x${String(shoals.length + 1).padStart(2, "0")}`, "shoals", "medium", "shoals", x, z, 3, inN, outN).index);
    }
  }

  // Wreck Cove: hulks lie beached on the strand (half in the water), never in open water or the trees
  const wrecks: number[] = [];
  const wreckAt = (id: string, cls: HullClass, x: number, z: number, h: number) => {
    const node = nearestNode(graph, x, z);
    const [bx, bz] = bowVec(h);
    const slot = add({ id, where: "wreck", cls, kind: "wreck", x, z, heading: h, swing: 0, inNode: node, outNode: node,
      approach: node >= 0 ? [[graph.x[node], graph.z[node]], [x - bx * loa[cls] * 2, z - bz * loa[cls] * 2], [x, z]] : [[x, z]], astern: false, mode: "beached" });
    wrecks.push(slot.index);
  };
  // Wreck Cove: hulks lie beached up the strand, keel in the sand with no water under them. The beach
  // slots the island authors (zones.wreckCove.beach) are taken as they are; otherwise the cove's hulk
  // slots are walked up onto the nearest dry strand, and a boneyard of smaller hulks fills the same beach.
  type BeachSlot = { id?: string; class?: HullClass; position: [number, number, number]; headingRad?: number } | [number, number, number];
  const beach = ((zones.wreckCove as { beach?: BeachSlot[] } | undefined)?.beach ?? []).map((b, k) => Array.isArray(b)
    ? { id: `wreck/beach/${String(k + 1).padStart(3, "0")}`, cls: "large" as HullClass, x: b[0], z: b[2], h: NaN }
    : { id: b.id ?? `wreck/beach/${String(k + 1).padStart(3, "0")}`, cls: b.class ?? ("large" as HullClass), x: b.position[0], z: b.position[2], h: b.headingRad ?? NaN });
  const authored = zones.wreckCove?.slots ?? [];
  /** Up the beach (bow heading), from the coast SDF's gradient; the layout's wind when unknown. */
  const upAt = (x: number, z: number): number => {
    if (!coast) return windFrom;
    const gx = coastDistance(coast, x + 1.5, z) - coastDistance(coast, x - 1.5, z), gz = coastDistance(coast, x, z + 1.5) - coastDistance(coast, x, z - 1.5);
    return Math.hypot(gx, gz) < 0.2 ? windFrom : Math.atan2(-gx, -gz);
  };
  // an authored beach (many slots, or slots set on the sand above sea level): taken as authored
  const authoredBeach = authored.length >= 24 || authored.some((w) => w.position[1] > 0.05);
  if (authoredBeach) for (const w of authored) beach.push({ id: w.id, cls: w.class, x: w.position[0], z: w.position[2], h: w.headingRad });
  if (beach.length) {
    beach.forEach((b, k) => wreckAt(b.id, b.cls, b.x, b.z, Number.isFinite(b.h) ? b.h : upAt(b.x, b.z) + (u01(b.id + "#up") - 0.5) * 1.3 + (k % 2 ? 0.2 : -0.2)));
  } else if (!coast || !authored.length) {
    for (const w of authored) wreckAt(w.id, w.class, w.position[0], w.position[2], w.headingRad);
  } else {
    // the strand: dry shore round the cove, from just above the waterline to a few metres up the beach
    let cx = 0, cz = 0;
    for (const w of authored) { cx += w.position[0]; cz += w.position[2]; }
    cx /= authored.length; cz /= authored.length;
    type Cand = { x: number; z: number; c: number; up: number; d: number };
    const cand: Cand[] = [];
    for (let z = cz - BONEYARD_R; z <= cz + BONEYARD_R; z += 2) for (let x = cx - BONEYARD_R; x <= cx + BONEYARD_R; x += 2) {
      const c = coastDistance(coast, x, z);
      if (c < -6 || c > -0.6) continue;
      const gx = coastDistance(coast, x + 1.5, z) - coastDistance(coast, x - 1.5, z), gz = coastDistance(coast, x, z + 1.5) - coastDistance(coast, x, z - 1.5);
      const gl = Math.hypot(gx, gz);
      if (gl < 0.3) continue; // no clear slope: a spit or an islet tip
      const d = Math.hypot(x - cx, z - cz);
      if (d > BONEYARD_R) continue;
      cand.push({ x, z, c, up: Math.atan2(-gx / gl, -gz / gl), d });
    }
    cand.sort((p, q) => p.d - q.d);
    const taken: Array<[number, number, number]> = [];
    const free = (p: Cand, r: number) => !taken.some((q) => Math.hypot(q[0] - p.x, q[1] - p.z) < r + q[2]);
    // authored hulks: the nearest free dry strand to where they were meant to lie
    for (const w of authored) {
      const r = loa[w.class] * 0.42;
      let best: Cand | null = null, bd = Infinity;
      for (const p of cand) {
        if (Math.abs(p.c + 1.6) > 1.2 || !free(p, r)) continue;
        const d = Math.hypot(p.x - w.position[0], p.z - w.position[2]);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) continue;
      taken.push([best.x, best.z, r]);
      // heeled over on the strand: bow up the beach, give or take the way she drove ashore
      wreckAt(w.id, w.class, best.x, best.z, best.up + (u01(w.id + "#up") - 0.5) * 1.3);
    }
    // the boneyard: the rest of the dead along the same strand, smaller and further gone
    let k = 0;
    for (const p of cand) {
      if (wrecks.length >= authored.length + BONEYARD_MAX) break;
      if (!free(p, 2.3)) continue;
      taken.push([p.x, p.z, 2.3]);
      wreckAt(`wreck/bone/${String(k).padStart(3, "0")}`, "boat", p.x, p.z, p.up + (u01("bone#h" + k) - 0.5) * 1.6);
      k++;
    }
  }
  const launch = zones.slipway?.launchPath;

  const gates = new Map<string, { inNode: number; outNode: number; x: number; z: number }>();
  for (const [where, byCls] of pools) {
    const all = [...byCls.values()].flat();
    const inNode = mode(all.map((i) => slots[i].inNode));
    const outNode = mode(all.map((i) => slots[i].outNode));
    let x = 0, z = 0;
    for (const i of all) { x += slots[i].x; z += slots[i].z; }
    gates.set(where, { inNode, outNode, x: x / all.length, z: z / all.length });
  }

  // footprints that overlap are never occupied together (adjacent alongside berths, close moorings)
  const foot = (s: Slot): Array<[number, number, number, number, number]> => {
    const L = loa[s.cls], B = beam[s.cls];
    const caps: Array<[number, number, number, number, number]> = [];
    const yaws = s.swing > 0 ? [-0.45, 0, 0.45] : [0];
    for (const dy of yaws) {
      const h = s.heading + dy;
      const [fx, fz] = bowVec(h);
      const cx = s.x - Math.sin(h) * s.swing, cz = s.z - Math.cos(h) * s.swing;
      const hl = Math.max(0, L / 2 - B / 2);
      caps.push([cx - fx * hl, cz - fz * hl, cx + fx * hl, cz + fz * hl, B / 2]);
    }
    return caps;
  };
  const cell = 30, grid = new Map<number, number[]>();
  const key = (x: number, z: number) => (Math.floor(x / cell) + 1000) * 4096 + Math.floor(z / cell) + 1000;
  const docks = slots.filter((s) => s.kind !== "wreck");
  for (const s of docks) { const k = key(s.x, s.z); (grid.get(k) ?? grid.set(k, []).get(k)!).push(s.index); }
  const capDist = (a: [number, number, number, number, number], b: [number, number, number, number, number]) => {
    let d = Infinity;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      d = Math.min(d, segDist(a[0] + (a[2] - a[0]) * t, a[1] + (a[3] - a[1]) * t, [b[0], b[1]], [b[2], b[3]]), segDist(b[0] + (b[2] - b[0]) * t, b[1] + (b[3] - b[1]) * t, [a[0], a[1]], [a[2], a[3]]));
    }
    return d - a[4] - b[4];
  };
  for (const s of docks) {
    const fs = foot(s);
    const gx = Math.floor(s.x / cell), gz = Math.floor(s.z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const o of grid.get((gx + i + 1000) * 4096 + gz + j + 1000) ?? []) {
        if (o <= s.index) continue;
        const so = slots[o];
        // berths only crowd berths of their own pier (piers are laid out apart); swinging hulls anyone
        if (s.swing === 0 && so.swing === 0 && s.where !== so.where) continue;
        if (Math.hypot(so.x - s.x, so.z - s.z) > (loa[s.cls] + loa[so.cls]) / 2 + s.swing + so.swing + 2) continue;
        const gap = s.swing > 0 || so.swing > 0 ? 0.8 : s.mode === "finger" && so.mode === "finger" ? 0.3 : 0.5;
        const fo = foot(so);
        // two buoys laid closer than their rodes allow (the hulls swing with wind, tide and yaw, ~±1.2 rad, far
        // past the footprints above): never occupied together either
        const crowded = s.swing > 0 && so.swing > 0 && Math.hypot(so.x - s.x, so.z - s.z) < (s.swing + so.swing + (loa[s.cls] + loa[so.cls]) / 2) * 0.6;
        if (crowded || fs.some((a) => fo.some((b) => capDist(a, b) < gap))) { s.conflicts.push(o); so.conflicts.push(s.index); }
      }
    }
  }

  const ph = (layout as { pharos?: { position?: number[] } }).pharos?.position ?? layout.landmarks?.find((m) => m.id === "pharos")?.position;
  const pharos: Vec2 | null = ph ? [ph[0], ph[2]] : null;
  return { graph, windFrom, field, keepOff, hard, slots, pools, shoals, wrecks, launchPath: launch && launch.length >= 2 ? launch.map((q) => [q[0], q[1]] as Vec2) : null, loa, beam, pierChains, whereOf, gates, pharos };
}

const LANE_SEGS = new WeakMap<SimLayout, Float64Array>();
/** The lane graph's edges as flat [ax, az, bx, bz] (derived once per layout). */
function laneSegments(L: SimLayout): Float64Array {
  let segs = LANE_SEGS.get(L);
  if (segs) return segs;
  const g = L.graph, out: number[] = [];
  for (let a = 0; a < g.n; a++) for (let b = 0; b < g.n; b++) if (a !== b && g.next[a * g.n + b] === b && Number.isFinite(g.dist[a * g.n + b])) out.push(g.x[a], g.z[a], g.x[b], g.z[b]);
  segs = Float64Array.from(out);
  LANE_SEGS.set(L, segs);
  return segs;
}

/**
 * Overflow raft slot k for `where`: hulls lie rafted side by side, six to a raft, bows to the wind, in
 * open water near the harbour's gate but clear of every lane, structure, still hull and other raft.
 * Cells are sized for a large hull so any class fits any raft slot. Created on demand by the planner
 * (rare when berths are sized from the plan's demand); deterministic.
 */
export function addRaftSlot(L: SimLayout, where: string, k: number): Slot {
  const g = L.gates.get(where);
  const node = g ? g.inNode : L.graph.through[0] ?? -1;
  const nx = node >= 0 ? L.graph.x[node] : 0, nz = node >= 0 ? L.graph.z[node] : 0;
  const cellL = L.loa.large * 1.15, cellB = L.beam.large * 1.25;
  const h = L.windFrom, fx = Math.sin(h), fz = Math.cos(h), sx = -fz, sz = fx;
  const segs = laneSegments(L);
  const others = L.slots.filter((s) => s.kind === "raft");
  const hulls = L.slots.filter((s) => s.kind !== "wreck");
  /** Closest approach between this cell's hull and slot o's (sampled capsules), less both half-beams. */
  const gapTo = (x: number, z: number, o: Slot): number => {
    const ol = L.loa[o.cls], ob = L.beam[o.cls];
    const ocx = o.x - Math.sin(o.heading) * o.swing, ocz = o.z - Math.cos(o.heading) * o.swing;
    const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
    let d = Infinity;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const ux = x + fx * cellL * 0.21 * a - (ocx + ofx * ol * 0.21 * b), uz = z + fz * cellL * 0.21 * a - (ocz + ofz * ol * 0.21 * b);
      d = Math.min(d, Math.hypot(ux, uz));
    }
    return d - (cellB + ob) / 2 - o.swing * 0.5;
  };
  /** Reachable straight from the gate (her approach is that line): never across a headland. */
  const seen = (x: number, z: number): boolean => {
    const ax = x - fx * cellL * 1.6, az = z - fz * cellL * 1.6;
    for (const [qx, qz, rx, rz] of [[nx, nz, ax, az], [ax, az, x, z]]) {
      const len = Math.hypot(rx - qx, rz - qz);
      for (let d = 4; d < len; d += 3) if (L.hard(qx + ((rx - qx) * d) / len, qz + ((rz - qz) * d) / len) < cellB / 2 + 1.5) return false;
    }
    return true;
  };
  const fits = (x: number, z: number, laneM = 16): boolean => {
    for (const [a, b] of [[0, 0], [0.5, 0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5]]) {
      const px = x + fx * cellL * a + sx * cellB * b, pz = z + fz * cellL * a + sz * cellB * b;
      if (L.hard(px, pz) < 6) return false;
      if (L.keepOff && clearance(L.keepOff, px, pz) < 4) return false;
    }
    for (let i = 0; i < segs.length; i += 4) if (segDist(x, z, [segs[i], segs[i + 1]], [segs[i + 2], segs[i + 3]]) < laneM + cellL / 2) return false;
    for (const o of others) if (Math.hypot(o.x - x, o.z - z) < cellB * 0.95) return false;
    for (const o of hulls) if (Math.hypot(o.x - x, o.z - z) < (cellL + L.loa[o.cls]) / 2 + o.swing + 4 && o.kind !== "raft" && gapTo(x, z, o) < 2) return false;
    for (const o of others) if (Math.hypot(o.x - x, o.z - z) >= cellB * 0.95 && Math.hypot(o.x - x, o.z - z) < cellL + 2 && gapTo(x, z, o) < 0.4) return false;
    return seen(x, z);
  };
  // the next berth in this harbour's raft: beside the last one, else a new raft somewhere clear
  const mine = others.filter((s) => s.where === where);
  let px = NaN, pz = NaN;
  const last = mine[mine.length - 1];
  if (last && k % 6 !== 0) {
    for (const side of [1, -1]) {
      const qx = last.x + sx * cellB * side, qz = last.z + sz * cellB * side;
      if (fits(qx, qz)) { px = qx; pz = qz; break; }
    }
  }
  // (a cramped harbour: nearer the lanes, which then pass the raft at a hull's length or two)
  for (const laneM of [16, 8, 3]) {
    if (Number.isFinite(px)) break;
    for (let i = 0; i < 6000; i++) { // out to ~340 m: a marina gate sits among berth rows and other harbours' rafts
      const a = i * 2.399963, r = 30 + 4 * Math.sqrt(i);
      const qx = nx + Math.cos(a) * r, qz = nz + Math.sin(a) * r;
      if (fits(qx, qz, laneM)) { px = qx; pz = qz; break; }
    }
  }
  // last resort: any open water the gate can see (still clear of other rafts), else the gate itself
  for (let i = 0; i < 6000 && !Number.isFinite(px); i++) {
    const a = i * 2.399963, r = 20 + 4 * Math.sqrt(i);
    const qx = nx + Math.cos(a) * r, qz = nz + Math.sin(a) * r;
    if (L.hard(qx, qz) >= cellL / 2 + 2 && !others.some((o) => Math.hypot(o.x - qx, o.z - qz) < cellB * 0.95) && seen(qx, qz)) { px = qx; pz = qz; }
  }
  if (!Number.isFinite(px)) { px = nx; pz = nz; }
  const slot: Slot = {
    index: L.slots.length, id: `${where}/raft/${k + 1}`, where, cls: "large", kind: "raft", x: px, z: pz, heading: h, swing: 0,
    inNode: node, outNode: g ? g.outNode : node, approach: [[nx, nz], [px - fx * cellL * 1.6, pz - fz * cellL * 1.6], [px, pz]], astern: false,
    mode: "raft", warp: null, line: null, conflicts: [],
  };
  L.slots.push(slot);
  return slot;
}
