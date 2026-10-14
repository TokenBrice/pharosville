/**
 * Normalizes a HarbourLayout (v1 piers/berths, v2 + moorings) into what the sim needs:
 * typed slots grouped into (where, class) pools, and an all-pairs routed one-way lane graph.
 */
import { pierIdFor } from "../model/classify";
import type { HarbourLayout, HullClass, Vec2 } from "../layout/types";
import { buildObstacleField, openWaterFactor, type ObstacleField } from "./obstacles";

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
  /** True when departures back out first (bow-in berths). */
  astern: boolean;
}

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

export function buildLaneGraph(layout: HarbourLayout, field: ObstacleField | null = null): LaneGraph {
  const nodes = layout.lanes?.nodes ?? [];
  const n = nodes.length;
  const ids = nodes.map((nd) => nd.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const x = new Float64Array(n), z = new Float64Array(n);
  nodes.forEach((nd, i) => { x[i] = nd.position[0]; z[i] = nd.position[2]; });
  const adj: Array<Array<[number, number]>> = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n), outdeg = new Int32Array(n);
  for (const e of layout.lanes?.edges ?? []) {
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
  slots: Slot[];
  /** pools.get(where)?.get(cls) → slot indices. */
  pools: Map<string, Map<HullClass, number[]>>;
  shoals: number[];
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
}

function mode(xs: number[]): number {
  const c = new Map<number, number>();
  let best = -1, bc = 0;
  for (const v of xs) { const k = (c.get(v) ?? 0) + 1; c.set(v, k); if (k > bc || (k === bc && v < best)) { bc = k; best = v; } }
  return best;
}

export function buildSimLayout(layout: HarbourLayout): SimLayout {
  const field = buildObstacleField(layout);
  const graph = buildLaneGraph(layout, field);
  const loa = { ...DEFAULT_LOA, ...(layout.hull?.loa ?? {}) } as Record<HullClass, number>;
  const beam = Object.fromEntries(CLASS_ORDER.map((k) => [k, layout.hull?.beam?.[k] ?? loa[k] * 0.32])) as Record<HullClass, number>;
  const slots: Slot[] = [];
  const pools = new Map<string, Map<HullClass, number[]>>();
  const pierChains = new Map<string, string>();
  const alias = new Map<string, string>();
  const nodeOf = (id: string | undefined) => (id == null ? -1 : graph.index.get(id) ?? -1);
  const bowVec = (h: number): Vec2 => [Math.sin(h), Math.cos(h)];
  const windFrom = (layout as { wind?: { bowHeadingRad?: number } }).wind?.bowHeadingRad ?? PREVAILING_WIND_FROM;

  const add = (s: Omit<Slot, "index">) => {
    const slot = { ...s, index: slots.length };
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
    return add({ id, where, cls, kind, x: px, z: pz, heading: h, swing, inNode, outNode, approach: ap, astern: false });
  };

  for (const p of layout.piers ?? []) {
    pierChains.set(p.id, p.chain);
    alias.set(p.id.toLowerCase(), p.id);
    alias.set(p.chain.toLowerCase(), p.id);
    alias.set(pierIdFor(p.chain), p.id);
    for (const b of p.berths ?? []) {
      const gate = nodeOf(b.gate);
      let approach: Vec2[] = (b.approach ?? []).map((q) => [q[0], q[1]] as Vec2);
      const end: Vec2 = [b.position[0], b.position[2]];
      if (approach.length < 2) {
        const [bx, bz] = bowVec(b.headingRad);
        const g = gate >= 0 ? gate : nearestNode(graph, end[0], end[1]);
        approach = [[graph.x[g], graph.z[g]], [end[0] - bx * loa[b.class] * 2, end[1] - bz * loa[b.class] * 2], end];
      }
      const g = gate >= 0 ? gate : nearestNode(graph, approach[0][0], approach[0][1]);
      add({ id: b.id, where: p.id, cls: b.class, kind: "berth", x: end[0], z: end[1], heading: b.headingRad, swing: 0, inNode: g, outNode: g, approach, astern: true });
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
  const farZone = zones.farPorts as ({ gate?: string } & NonNullable<typeof zones.farPorts>) | undefined;
  const farIn = zoneGate(farZone, "gate-in:far", "F-gate"), farOut = zoneGate(farZone, "gate-out:far", "F-gate");
  let fi = 0;
  for (const row of zones.farPorts?.rows ?? []) {
    for (const s of row.slots) {
      const inN = farIn >= 0 ? farIn : nearestNode(graph, s[0], s[2]);
      const outN = farOut >= 0 ? farOut : inN;
      swingSlot(`far/${row.cls}/${String(++fi).padStart(3, "0")}`, "far", row.cls, "far", s[0], s[2], loa[row.cls] * 0.6, inN, outN);
    }
  }
  const shZone = zones.shoals as ({ gate?: string } & NonNullable<typeof zones.shoals>) | undefined;
  const shIn = zoneGate(shZone, "gate-in:shoals", "SH-gate"), shOut = zoneGate(shZone, "gate-out:shoals", "SH-gate");
  const shoals: number[] = [];
  (zones.shoals?.slots ?? []).forEach((s, i) => {
    const inN = shIn >= 0 ? shIn : nearestNode(graph, s[0], s[2]);
    const slot = swingSlot(`shoals/${String(i + 1).padStart(2, "0")}`, "shoals", "medium", "shoals", s[0], s[2], 3, inN, shOut >= 0 ? shOut : inN);
    shoals.push(slot.index);
  });
  const wrecks: number[] = [];
  for (const w of zones.wreckCove?.slots ?? []) {
    const node = nearestNode(graph, w.position[0], w.position[2]);
    const slot = add({ id: w.id, where: "wreck", cls: w.class, kind: "wreck", x: w.position[0], z: w.position[2], heading: w.headingRad, swing: 0,
      inNode: node, outNode: node, approach: node >= 0 ? [[graph.x[node], graph.z[node]], [w.position[0], w.position[2]]] : [[w.position[0], w.position[2]]], astern: false });
    wrecks.push(slot.index);
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
  return { graph, windFrom, field, slots, pools, shoals, wrecks, launchPath: launch && launch.length >= 2 ? launch.map((q) => [q[0], q[1]] as Vec2) : null, loa, beam, pierChains, whereOf, gates };
}

/**
 * Overflow raft slot k for `where`: hulls lie side by side in rows beyond the harbour's gate, in open
 * water. Cells are sized for a large hull so any class fits any raft slot. Created on demand by the
 * planner (rare when berths are sized from the plan's demand).
 */
export function addRaftSlot(L: SimLayout, where: string, k: number): Slot {
  const g = L.gates.get(where);
  const node = g ? g.inNode : L.graph.through[0] ?? -1;
  const nx = node >= 0 ? L.graph.x[node] : 0, nz = node >= 0 ? L.graph.z[node] : 0;
  const cx = g ? g.x : nx, cz = g ? g.z : nz;
  let dx = nx - cx, dz = nz - cz;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  const cellL = L.loa.large * 1.15, cellB = L.beam.large * 1.25;
  const row = Math.floor(k / 6), col = k % 6;
  const ahead = 22 + cellL * 0.5 + row * cellL;
  const px = nx + dx * ahead - dz * (col - 2.5) * cellB;
  const pz = nz + dz * ahead + dx * (col - 2.5) * cellB;
  const slot: Slot = {
    index: L.slots.length, id: `${where}/raft/${k + 1}`, where, cls: "large", kind: "raft", x: px, z: pz, heading: Math.atan2(dx, dz), swing: 0,
    inNode: node, outNode: g ? g.outNode : node, approach: [[nx, nz], [px - dx * cellL, pz - dz * cellL], [px, pz]], astern: false,
  };
  L.slots.push(slot);
  return slot;
}
