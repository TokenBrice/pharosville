/**
 * Harbour outings (D22): DECLARED-DECORATIVE. A hull that only ever lies at one harbour (a
 * single-chain coin) now and then casts off for a sail: out of her harbour (through the mouth past
 * the Pharos, along the outer coast) to the open water offshore, a few laps round loops there
 * (tacking out when that way is upwind), and back to the SAME berth or mooring, which stays hers all
 * the while. A gate with no offshore water sails a short loop near it instead. Outings carry no data:
 * the pose buffer flags them so the UI can say "out for a sail" rather than "sailing to <chain>".
 * Scenic legs (plan.ts) borrow the offshore loops: a circuit hull on her way to the next chain.
 *
 * Everything here is a pure function of the layout (cached per layout; never of a plan): every
 * viewer sees the same loops.
 */
import type { HullClass, Vec2 } from "../layout/types";
import { u01 } from "../model/classify";
import { CLASS_ORDER, routeNodes, type SimLayout } from "./layout-graph";
import { clearance, hullClearance, openWaterFactor } from "./obstacles";
import { buildPath, type PathRec } from "./path";
import { legControlPoints } from "./routes";
import { hypot } from "./math";

/** Loop variants per gate, so hulls sharing a gate do not all sail one track: near loops (her own harbour's water)… */
export const OUTING_VARIANTS = 3;
/** …and offshore loops: out along the lanes (through the mouth, along the outer coast), round in open water, home by the lanes. */
export const OFFSHORE_VARIANTS = 5;
/** Loop reach from the gate (m): the far end of the loop, at most. */
const REACH_MAX = 175, REACH_MIN = 70;
/** Offshore loops: reach, and the most lane run out to the loop's origin and home from it (m). */
const FAR_REACH_MAX = 380, FAR_REACH_MIN = 120, FAR_ORIGIN_MAX = 900;
/** Water kept round the loop's control points: to land and structure, and to still hulls (m). */
const NEED_HARD = 14, NEED_STILL = 5;
/** Offshore loops keep further off the coast and the moored fields, and off the lanes (they cross one only going out and in). */
const FAR_NEED_HARD = 24, FAR_NEED_STILL = 14, FAR_NEED_LANE = 25;
/** Offshore loops spread out: a loop whose water other loops already sail (mean loops per cell) above this is passed over. */
const FAR_CROWD = 0.6, FAR_TRIES = 60;
/** Laps an offshore outing sails before she heads home. */
const FAR_LAPS = 4;
/** The occupancy grid that spreads them: cells of OCC_CELL m, OCC_N a side from the field's corner. */
const OCC_CELL = 24, OCC_N = 48;
/** The first stretch out of the gate may run closer to the piers (they are laid out with fairways). */
const NEAR_GATE = 24;
/** A loop may start this far (lane metres) downstream of the gate. */
const ORIGIN_MAX = 300;
const DIRS = 48;

/** Per gate: near loops, offshore loops (out, round and home), and the same offshore loops without the way home (scenic legs). */
interface GateLoops { near: Vec2[][]; far: Vec2[][]; open: Vec2[][] }
const LOOPS = new WeakMap<SimLayout, Map<number, GateLoops>>();
/** Water an outing's track covers (m): a lap sailed again counts once (for the plan's per-track spacing). */
const FOOTPRINT = new WeakMap<Vec2[], number>();
/** An outing track's open-water parts (its loops, and the straight run home off the last): the plan keeps them clear of rafts. */
const OPEN_PARTS = new WeakMap<Vec2[], Vec2[][]>();
const LANES = new WeakMap<SimLayout, { minX: number; minZ: number; nx: number; nz: number; d: Float32Array }>();
const LANE_CELL = 4;
/** The plan's per-boat questions, answered once per layout: scenic extra metres (out>in>v), outing metres (slot>cls>v). */
const SCENIC_M = new WeakMap<SimLayout, Map<string, number>>();
const OUTING_M = new WeakMap<SimLayout, Map<string, number>>();
const memo = (w: WeakMap<SimLayout, Map<string, number>>, L: SimLayout): Map<string, number> => {
  let m = w.get(L);
  if (!m) w.set(L, (m = new Map()));
  return m;
};

/** Distance (m) to the nearest lane (a straight run between lane nodes), on a coarse grid over the field. */
function laneDistance(L: SimLayout, x: number, z: number): number {
  let f = LANES.get(L);
  if (!f) {
    const g = L.graph, F = L.field!;
    const segs: number[] = [];
    for (let a = 0; a < g.n; a++) for (let b = 0; b < g.n; b++) if (a !== b && g.next[a * g.n + b] === b) segs.push(g.x[a], g.z[a], g.x[b], g.z[b]);
    const nx = Math.ceil((F.nx * F.cell) / LANE_CELL), nz = Math.ceil((F.nz * F.cell) / LANE_CELL);
    const d = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const px = F.minX + (i + 0.5) * LANE_CELL, pz = F.minZ + (j + 0.5) * LANE_CELL;
      let best = Infinity;
      for (let k = 0; k < segs.length; k += 4) {
        const ax = segs[k], az = segs[k + 1], dx = segs[k + 2] - ax, dz = segs[k + 3] - az, l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
        const q = (px - ax - dx * t) ** 2 + (pz - az - dz * t) ** 2;
        if (q < best) best = q;
      }
      d[j * nx + i] = Math.sqrt(best);
    }
    LANES.set(L, (f = { minX: F.minX, minZ: F.minZ, nx, nz, d }));
  }
  const i = Math.floor((x - f.minX) / LANE_CELL), j = Math.floor((z - f.minZ) / LANE_CELL);
  return i < 0 || j < 0 || i >= f.nx || j >= f.nz ? 1e3 : f.d[j * f.nx + i];
}

/** The open-water margin at (x, z), in metres beyond the need: < 0 is too close. Off the field: -1. */
function margin(L: SimLayout, x: number, z: number, nearGate: boolean, far = false): number {
  if (!L.field) return 50; // no geometry (synthetic layouts): open water everywhere
  const c = clearance(L.field, x, z);
  if (c >= 999) return -1; // off the sea we know
  if (nearGate) return c - 5;
  let m = c - (far ? FAR_NEED_HARD : NEED_HARD);
  if (L.keepOff) m = Math.min(m, clearance(L.keepOff, x, z) - (far ? FAR_NEED_STILL : NEED_STILL));
  if (far) {
    // offshore: off the lanes, and within the water the camera can be panned over
    m = Math.min(m, laneDistance(L, x, z) - FAR_NEED_LANE);
    if (L.view) m = Math.min(m, x - L.view[0], z - L.view[1], L.view[2] - x, L.view[3] - z);
  }
  return m;
}

/** a → b in open water; `far`: keeping the offshore margins except within `near` metres of b (where it joins a lane). */
function segmentClear(L: SimLayout, a: Vec2, b: Vec2, far = false, near = 0): boolean {
  const len = hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 4));
  for (let k = 0; k <= n; k++) if (margin(L, a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, false, far && (n - k) * (len / n) > near) < -3) return false;
  return true;
}

/**
 * The way points of a gate's (out lane node's) loop variant v, or null when no open water near the
 * gate takes a loop. Variants below OUTING_VARIANTS are near loops: the fairway out to the loop's
 * origin, then out on one side, round the far end and back on the other (the outward side a beat of
 * short tacks when the way out is to windward). The rest are offshore loops: out along the lanes to
 * open water, a wide loop there, and home along the lanes. A gate without one kind sails the other.
 */
export function outingLoop(L: SimLayout, outNode: number, v: number): Vec2[] | null {
  const loops = gateLoops(L, outNode);
  const far = v >= OUTING_VARIANTS;
  const list = far ? (loops.far.length ? loops.far : loops.near) : loops.near.length ? loops.near : loops.far;
  return list.length ? list[(far ? v - OUTING_VARIANTS : v) % list.length] : null;
}

function gateLoops(L: SimLayout, outNode: number): GateLoops {
  let cache = LOOPS.get(L);
  if (!cache) LOOPS.set(L, (cache = new Map()));
  // every gate's offshore loops are laid out together (in a fixed order, so the same for every viewer
  // whichever gate is asked first): each keeps clear of the water the others already sail
  if (!cache.size) {
    const occ = new Uint8Array(OCC_N * OCC_N);
    // (the busiest gates first: their many hulls get the most open water)
    const users = new Map<number, number>();
    // (the layout's own slots only: a plan's rafts must not move anybody's loops, or two viewers whose
    // plans came in a different order would see different ones)
    for (const sl of L.slots) if (sl.outNode >= 0 && sl.kind !== "raft") users.set(sl.outNode, (users.get(sl.outNode) ?? 0) + 1);
    const gates = [...users.keys()].sort((a, b) => users.get(b)! - users.get(a)! || a - b);
    for (const gate of gates) cache.set(gate, { near: makeLoops(L, gate), ...makeFarLoops(L, gate, occ) });
  }
  let loops = cache.get(outNode);
  if (!loops) cache.set(outNode, (loops = { near: makeLoops(L, outNode), ...makeFarLoops(L, outNode, new Uint8Array(OCC_N * OCC_N)) }));
  return loops;
}

/** Up to OUTING_VARIANTS distinct loops for a gate, best first (empty: none fits). */
function makeLoops(L: SimLayout, outNode: number): Vec2[][] {
  const g = L.graph;
  if (outNode < 0) return [];
  const up = L.windFrom;
  // where the loop may start: the gate itself, or a lane node a short sail downstream of it (a basin
  // too snug for a loop sails out along its fairway to open water first)
  const cands: Array<{ o: number; th: number; reach: number; score: number }> = [];
  for (let o = 0; o < g.n; o++) {
    const route = g.dist[outNode * g.n + o];
    if (!(route <= ORIGIN_MAX)) continue;
    const ox = g.x[o], oz = g.z[o];
    for (let k = 0; k < DIRS; k++) {
      const th = (k / DIRS) * 2 * Math.PI, ux = Math.sin(th), uz = Math.cos(th);
      let reach = 0;
      for (let d = 4; d <= REACH_MAX + 12; d += 4) {
        if (margin(L, ox + ux * d, oz + uz * d, d < NEAR_GATE) < 0) break;
        reach = d;
      }
      if (reach < REACH_MIN) continue;
      let score = Math.min(reach, REACH_MAX) - 0.35 * route;
      // past the Pharos: a loop whose far end runs near the light, when it is close
      if (L.pharos) {
        const ex = ox + ux * reach * 0.8, ez = oz + uz * reach * 0.8;
        score += 150 * Math.max(0, 1 - hypot(ex - L.pharos[0], ez - L.pharos[1]) / 320);
      }
      score += 12 * Math.max(0, Math.cos(th - up)); // a beat out to windward is the prettier sail
      cands.push({ o, th, reach, score });
    }
  }
  if (!cands.length) return [];
  cands.sort((a, b) => b.score - a.score || a.o - b.o || a.th - b.th);
  // distinct loops for the variants (another origin, or a bearing ≥ ~30° off), best first; each
  // must find a clear ellipse
  const picks: Vec2[][] = [];
  const used: Array<{ o: number; th: number }> = [];
  for (const c of cands) {
    if (picks.length >= OUTING_VARIANTS) break;
    if (used.some((p) => hypot(g.x[p.o] - g.x[c.o], g.z[p.o] - g.z[c.o]) < 40 && Math.abs(Math.atan2(Math.sin(p.th - c.th), Math.cos(p.th - c.th))) < 0.5)) continue;
    used.push(c);
    const loop = ellipse(L, g.x[c.o], g.z[c.o], c.th, c.reach, `${g.ids[outNode]}#${picks.length}`);
    if (!loop) continue;
    // the fairway out to the loop's origin, then the loop
    const route = routeNodes(g, outNode, c.o).slice(1).map((k) => [g.x[k], g.z[k]] as Vec2);
    const track = [...route, ...loop];
    OPEN_PARTS.set(track, [loop]);
    picks.push(track);
  }
  return picks;
}

/**
 * Up to OFFSHORE_VARIANTS distinct offshore loops for a gate, best first (empty: none fits, or no real
 * geometry to judge open water by): out along the lanes to an origin (the gate itself, or up to
 * FAR_ORIGIN_MAX lane metres on: out of the bay through the mouth, along the outer coast), a wide loop in
 * open water well off the coast, the moored fields and the lanes, and home. The longest reach for the
 * least lane run scores best, a loop past the Pharos a little better; a loop over water other gates'
 * loops already sail (`occ`) is passed over while there are others.
 */
function makeFarLoops(L: SimLayout, outNode: number, occ: Uint8Array): { far: Vec2[][]; open: Vec2[][] } {
  const g = L.graph;
  const none = { far: [], open: [] };
  if (outNode < 0 || !L.field) return none;
  const up = L.windFrom;
  const cands: Array<{ o: number; th: number; reach: number; score: number }> = [];
  for (let o = 0; o < g.n; o++) {
    const out = g.dist[outNode * g.n + o];
    if (!(out <= FAR_ORIGIN_MAX)) continue;
    const ox = g.x[o], oz = g.z[o];
    for (let k = 0; k < DIRS; k++) {
      const th = (k / DIRS) * 2 * Math.PI, ux = Math.sin(th), uz = Math.cos(th);
      let reach = 0;
      for (let d = 6; d <= FAR_REACH_MAX + 12; d += 6) {
        // the first stretch off the lane only needs open water; the loop itself keeps well off
        if (margin(L, ox + ux * d, oz + uz * d, false, d > 50) < 0) break;
        reach = d;
      }
      if (reach < FAR_REACH_MIN) continue;
      let score = Math.min(reach, FAR_REACH_MAX) - 0.15 * out;
      if (L.pharos) {
        const ex = ox + ux * reach * 0.6, ez = oz + uz * reach * 0.6;
        score += 50 * Math.max(0, 1 - hypot(ex - L.pharos[0], ez - L.pharos[1]) / 420);
      }
      score += 12 * Math.max(0, Math.cos(th - up));
      cands.push({ o, th, reach, score });
    }
  }
  if (!cands.length) return none;
  cands.sort((a, b) => b.score - a.score || a.o - b.o || a.th - b.th);
  const picks: Array<{ route: Vec2[]; ring: Vec2[]; home: Vec2[] }> = [];
  const used: Array<{ o: number; th: number }> = [];
  // the best loop that keeps clear of the others' water; failing that, the least crowded one tried
  let spare: { route: Vec2[]; ring: Vec2[]; home: Vec2[]; crowd: number } | null = null;
  let tried = 0;
  for (const c of cands) {
    if (picks.length >= OFFSHORE_VARIANTS || tried >= FAR_TRIES) break;
    if (used.some((p) => hypot(g.x[p.o] - g.x[c.o], g.z[p.o] - g.z[c.o]) < 90 && Math.abs(Math.atan2(Math.sin(p.th - c.th), Math.cos(p.th - c.th))) < 0.6)) continue;
    tried++;
    const ring = ellipse(L, g.x[c.o], g.z[c.o], c.th, c.reach, `${g.ids[outNode]}#far${picks.length}`, true);
    if (!ring) continue;
    const route = routeNodes(g, outNode, c.o).slice(1).map((k) => [g.x[k], g.z[k]] as Vec2);
    const home = homeFrom(L, outNode, ring[ring.length - 1]);
    if (!home) continue;
    const crowd = crowding(L, ring, occ);
    if (crowd > FAR_CROWD) { if (!spare || crowd < spare.crowd) spare = { route, ring, home, crowd }; continue; }
    used.push(c);
    picks.push({ route, ring, home });
    stamp(L, ring, occ);
  }
  if (!picks.length && spare) { picks.push(spare); stamp(L, spare.ring, occ); }
  // an outing sails FAR_LAPS laps in one go, round the gate's next offshore loops where open water joins
  // them (else her own loop again), the last one's end leading home: a long sail for one cast-off and
  // one berthing
  const far = picks.map((p, k) => {
    const pts = [...p.route, ...p.ring], rings = new Set([p]);
    let cur = p;
    for (let lap = 1; lap < FAR_LAPS; lap++) {
      const q = picks[(k + lap) % picks.length], end = cur.ring[cur.ring.length - 1];
      const next = q !== cur && segmentClear(L, end, q.ring[0]) ? q : segmentClear(L, end, cur.ring[0]) ? cur : null;
      if (!next) break;
      pts.push(...next.ring);
      rings.add(next);
      cur = next;
    }
    const track = [...pts, ...cur.home];
    FOOTPRINT.set(track, polyLength(p.route) + polyLength(cur.home) + [...rings].reduce((a, q) => a + polyLength(q.ring), 0));
    OPEN_PARTS.set(track, [...[...rings].map((q) => q.ring), [cur.ring[cur.ring.length - 1], cur.home[0]]]);
    return track;
  });
  return { far, open: picks.map((p) => [...p.route, ...p.ring]) };
}

/** Occupancy cells (OCC_CELL m) a loop's water covers, each once. */
function cellsOf(L: SimLayout, loop: readonly Vec2[]): number[] {
  const F = L.field!, out = new Set<number>();
  for (let k = 1; k < loop.length; k++) {
    const a = loop[k - 1], b = loop[k], n = Math.max(1, Math.ceil(hypot(b[0] - a[0], b[1] - a[1]) / 8));
    for (let s = 0; s <= n; s++) {
      const i = Math.floor((a[0] + ((b[0] - a[0]) * s) / n - F.minX) / OCC_CELL), j = Math.floor((a[1] + ((b[1] - a[1]) * s) / n - F.minZ) / OCC_CELL);
      if (i >= 0 && j >= 0 && i < OCC_N && j < OCC_N) out.add(j * OCC_N + i);
    }
  }
  return [...out];
}
/** Mean number of loops already sailing the cells this loop would. */
function crowding(L: SimLayout, loop: readonly Vec2[], occ: Uint8Array): number {
  const cells = cellsOf(L, loop);
  let s = 0;
  for (const c of cells) s += occ[c];
  return cells.length ? s / cells.length : 0;
}
function stamp(L: SimLayout, loop: readonly Vec2[], occ: Uint8Array): void {
  for (const c of cellsOf(L, loop)) if (occ[c] < 255) occ[c]++;
}

/**
 * The way home from an offshore loop's end to the gate: straight across open water to the lane node
 * that leads home soonest (one-way lanes seldom lead straight back), or to a point off the gate and in.
 * Null: no clear way.
 */
function homeFrom(L: SimLayout, gate: number, end: Vec2, maxLane = FAR_ORIGIN_MAX): Vec2[] | null {
  const g = L.graph;
  const joins: Array<{ h: number; len: number }> = [];
  for (let h = 0; h < g.n; h++) {
    const lane = g.dist[h * g.n + gate];
    if (lane <= maxLane) joins.push({ h, len: lane + hypot(end[0] - g.x[h], end[1] - g.z[h]) });
  }
  joins.sort((a, b) => a.len - b.len || a.h - b.h);
  let best: Vec2[] | null = null, bestLen = Infinity;
  for (const j of joins) {
    // a long run home keeps well off the coast and the moored fields until it nears its lane
    const p: Vec2 = [g.x[j.h], g.z[j.h]];
    if (!segmentClear(L, end, p, hypot(end[0] - p[0], end[1] - p[1]) > 120, 60)) continue;
    best = routeNodes(g, j.h, gate).map((k) => [g.x[k], g.z[k]] as Vec2);
    bestLen = j.len;
    break;
  }
  // a point off the gate, reached in clear water from the loop's end and clear in to the gate
  const gx = g.x[gate], gz = g.z[gate];
  for (const r of [60, 90, 130]) for (let k = 0; k < 24; k++) {
    const th = (k / 24) * 2 * Math.PI, p: Vec2 = [gx + Math.sin(th) * r, gz + Math.cos(th) * r];
    const len = hypot(end[0] - p[0], end[1] - p[1]) + r;
    if (len >= bestLen || margin(L, p[0], p[1], false) < 0) continue;
    if (!segmentClear(L, end, p)) continue;
    // in to the gate: open water (the last stretch may run closer, as the fairway out does)
    let ok = true;
    for (let d = 4; ok && d < r - NEAR_GATE; d += 4) ok = margin(L, p[0] + ((gx - p[0]) * d) / r, p[1] + ((gz - p[1]) * d) / r, false) >= -3;
    if (ok) { best = [p, [gx, gz]]; bestLen = len; }
  }
  return best;
}

/** Out on one side, round the far end, back on the other (a beat out when that is to windward). */
function ellipse(L: SimLayout, gx: number, gz: number, th: number, reach: number, seed: string, far = false): Vec2[] | null {
  const up = L.windFrom;
  // one way round per gate and variant (hulls on one loop never meet head-on in it)
  const side = u01(seed + "#side") < 0.5 ? 1 : -1;
  const ux = Math.sin(th), uz = Math.cos(th), sx = -uz * side, sz = ux * side;
  const beat = Math.cos(th - up) > 0.45;
  const a0 = far ? 50 : 16, bMax = far ? 75 : 42;
  let a = (Math.min(reach, far ? FAR_REACH_MAX : REACH_MAX) - a0 - 10) / 2;
  let b = Math.min(bMax, a * 0.55);
  for (let tries = 0; tries < 10; tries++) {
    const cx = gx + ux * (a0 + a), cz = gz + uz * (a0 + a);
    const at = (phi: number): Vec2 => [cx + ux * a * Math.cos(phi) + sx * b * Math.sin(phi), cz + uz * a * Math.cos(phi) + sz * b * Math.sin(phi)];
    const pts: Vec2[] = [];
    if (beat) {
      // short tacks out to windward, about the loop's axis
      const m = Math.max(2, Math.min(5, Math.floor((2 * a) / 42)));
      for (let j = 0; j <= m; j++) {
        const t = j / m, lat = (j % 2 === 0 ? 0.35 : -0.35) * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.75));
        pts.push([gx + ux * (a0 + 2 * a * t * 0.92) + sx * b * lat, gz + uz * (a0 + 2 * a * t * 0.92) + sz * b * lat]);
      }
      // round the far end and run home free on the other side
      for (let k = 1; k <= 6; k++) pts.push(at(-(k / 6) * Math.PI * 0.85));
    } else {
      for (let k = 0; k <= 9; k++) pts.push(at(Math.PI - 0.45 - (k / 9) * (2 * Math.PI - 0.9)));
    }
    let ok = pts.every((p) => margin(L, p[0], p[1], false, far) >= 0);
    for (let k = 1; ok && k < pts.length; k++) ok = segmentClear(L, pts[k - 1], pts[k], far);
    if (ok) return pts;
    if (b > 16) b *= 0.75; else { a *= 0.82; b = Math.min(bMax, a * 0.55); }
    if (a < (far ? 45 : 25)) break;
  }
  return null;
}

/**
 * The loop variants a slot's hull may sail, one per distinct track: her gate's offshore loops (variant
 * OUTING_VARIANTS + k), or its near loops when it has none. The plan picks among them (least crowded).
 */
export function outingVariants(L: SimLayout, slotIdx: number): number[] {
  const s = L.slots[slotIdx];
  if (s.outNode < 0) return [];
  const loops = gateLoops(L, s.outNode);
  return loops.far.length ? loops.far.map((_, k) => OUTING_VARIANTS + k) : loops.near.map((_, k) => k);
}

function polyLength(p: readonly Vec2[]): number {
  let m = 0;
  for (let k = 1; k < p.length; k++) m += hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
  return m;
}

/**
 * Whether an outing track's open water keeps `clear` metres off every slot passing `near` (rafts: they
 * are laid out by the plan, after the tracks). Sampled every 6 m.
 */
export function trackClearOf(track: Vec2[], near: ReadonlyArray<{ x: number; z: number }>, clear: number): boolean {
  return partsClearOf(OPEN_PARTS.get(track) ?? [track], near, clear);
}

/** Whether a scenic leg's open water (its loop, and the straight run on off it) keeps `clear` metres off every slot in `near`. */
export function scenicClearOf(L: SimLayout, fromIdx: number, toIdx: number, v: number, near: ReadonlyArray<{ x: number; z: number }>, clear: number): boolean {
  const from = L.slots[fromIdx], to = L.slots[toIdx];
  if (from.outNode < 0 || to.inNode < 0 || !near.length) return true;
  const open = gateLoops(L, from.outNode).open;
  if (!open.length) return true;
  const loop = open[v % open.length];
  const on = homeFrom(L, to.inNode, loop[loop.length - 1], Infinity);
  return partsClearOf(on ? [loop, [loop[loop.length - 1], on[0]]] : [loop], near, clear);
}

function partsClearOf(parts: readonly Vec2[][], near: ReadonlyArray<{ x: number; z: number }>, clear: number): boolean {
  if (!near.length) return true;
  for (const part of parts) for (let k = 1; k < part.length; k++) {
    const a = part[k - 1], b = part[k], n = Math.max(1, Math.ceil(hypot(b[0] - a[0], b[1] - a[1]) / 6));
    for (let j = 0; j <= n; j++) {
      const x = a[0] + ((b[0] - a[0]) * j) / n, z = a[1] + ((b[1] - a[1]) * j) / n;
      for (const q of near) if (Math.abs(q.x - x) < clear && Math.abs(q.z - z) < clear && hypot(q.x - x, q.z - z) < clear) return false;
    }
  }
  return true;
}

/** A slot's outing track for variant v (the same array for every hull that sails it) and the water it covers (m); null: none. */
export function outingTrack(L: SimLayout, slotIdx: number, v: number): { track: Vec2[]; metres: number } | null {
  const s = L.slots[slotIdx];
  const track = outingLoop(L, s.outNode, v);
  return track ? { track, metres: FOOTPRINT.get(track) ?? polyLength(track) } : null;
}

/** Control-point metres (at harbour pace) of a slot's outing for a hull class (for the plan's timing); -1 when it has none. */
export function outingMetres(L: SimLayout, slotIdx: number, cls: HullClass, v: number): number {
  // (a berth's answer never changes; the index of a raft or an extra anchorage names another after a re-plan)
  const kind = L.slots[slotIdx].kind;
  if (kind !== "berth" && kind !== "mooring" && kind !== "far") return outingMetresOf(L, slotIdx, cls, v);
  const memoM = memo(OUTING_M, L), key = slotIdx + ">" + cls + ">" + v;
  let m = memoM.get(key);
  if (m === undefined) memoM.set(key, (m = outingMetresOf(L, slotIdx, cls, v)));
  return m;
}

function outingMetresOf(L: SimLayout, slotIdx: number, cls: HullClass, v: number): number {
  const s = L.slots[slotIdx];
  // a berth she cannot leave cleanly (warped off, the hull would touch the quay's corner) keeps her in
  if (s.warp && hullClearance(L.hard, s.x + s.warp[0], s.z + s.warp[1], s.heading, L.loa[cls], L.beam[cls]) < 0.2) return -1;
  const loop = outingLoop(L, s.outNode, v);
  if (!loop) return -1;
  const g = L.graph, gx = s.outNode >= 0 ? g.x[s.outNode] : s.x, gz = s.outNode >= 0 ? g.z[s.outNode] : s.z;
  let m = hypot(loop[0][0] - gx, loop[0][1] - gz) + hypot(loop[loop.length - 1][0] - gx, loop[loop.length - 1][1] - gz);
  // (open water is sailed faster: its metres count at harbour pace)
  for (let k = 1; k < loop.length; k++) m += hypot(loop[k][0] - loop[k - 1][0], loop[k][1] - loop[k - 1][1]) / openWaterFactor(L.field, (loop[k][0] + loop[k - 1][0]) / 2, (loop[k][1] + loop[k - 1][1]) / 2);
  // and the run out of / back into the harbour, each way
  let ap = 0;
  for (let k = 1; k < s.approach.length; k++) ap += hypot(s.approach[k][0] - s.approach[k - 1][0], s.approach[k][1] - s.approach[k - 1][1]);
  return m + 2 * ap;
}

/** The smoothed path of a slot's outing (loop variant v) for a hull class: off the berth, round the loop, back in. */
export function buildOutingPath(L: SimLayout, slotIdx: number, cls: HullClass, v: number): PathRec | null {
  const s = L.slots[slotIdx];
  const loop = outingLoop(L, s.outNode, v);
  if (!loop) return null;
  const loa = L.loa[cls], beam = L.beam[cls];
  const c = legControlPoints(L, s, null, s, loa, beam, loop);
  return buildPath(c.pts, loa, c.tail, L.field, beam, c.extras);
}

/** The way points of a scenic leg out of gate `outNode` (loop v) on to lane node `inNode`, or null. */
function scenicVia(L: SimLayout, outNode: number, inNode: number, v: number): Vec2[] | null {
  if (outNode < 0 || inNode < 0) return null;
  const open = gateLoops(L, outNode).open;
  if (!open.length) return null;
  const loop = open[v % open.length];
  const on = homeFrom(L, inNode, loop[loop.length - 1], Infinity);
  return on ? [...loop, ...on] : null;
}

/**
 * Extra metres a scenic leg out of gate `outNode` (loop v) to lane node `inNode` sails over the plain
 * lane run between them (for the plan's timing; open water counts at its faster pace), or -1: none.
 */
export function scenicExtraMetres(L: SimLayout, outNode: number, inNode: number, v: number): number {
  const memoM = memo(SCENIC_M, L), key = outNode + ">" + inNode + ">" + v;
  let m = memoM.get(key);
  if (m === undefined) memoM.set(key, (m = scenicExtraMetresOf(L, outNode, inNode, v)));
  return m;
}

function scenicExtraMetresOf(L: SimLayout, outNode: number, inNode: number, v: number): number {
  const via = scenicVia(L, outNode, inNode, v);
  if (!via) return -1;
  const g = L.graph;
  let m = hypot(via[0][0] - g.x[outNode], via[0][1] - g.z[outNode]);
  for (let k = 1; k < via.length; k++) m += hypot(via[k][0] - via[k - 1][0], via[k][1] - via[k - 1][1]);
  const lane = g.dist[outNode * g.n + inNode];
  return Number.isFinite(lane) ? Math.max(0, m - lane) : -1;
}

/**
 * A scenic leg (D22): a circuit hull bound from one harbour to another first sails her departure gate's
 * offshore loop `v`, then on to her destination across open water and the lanes. Null when the gate has
 * no offshore loop or no clear way on from it.
 */
export function buildScenicPath(L: SimLayout, fromIdx: number, toIdx: number, cls: HullClass, v: number): PathRec | null {
  const from = L.slots[fromIdx], to = L.slots[toIdx];
  const via = scenicVia(L, from.outNode, to.inNode, v);
  if (!via) return null;
  const loa = L.loa[cls], beam = L.beam[cls];
  const c = legControlPoints(L, from, null, to, loa, beam, via);
  return buildPath(c.pts, loa, c.tail, L.field, beam, c.extras);
}

/**
 * The layout-only answers above as plain data (structured-clonable: a worker computes them on its own
 * copy of the layout while the main thread loads the world; seedOutings adopts them): every gate's loops
 * with their footprints and open-water parts, the lane-distance grid, the scenic extra metres between
 * every pair of gates and the outing metres of every hull class an authored slot may hold.
 */
export interface OutingSeed {
  gates: Array<[number, GateLoops & { foot: Array<number | null>; parts: Array<Vec2[][] | null> }]>;
  lanes: { minX: number; minZ: number; nx: number; nz: number; d: Float32Array } | null;
  scenic: Array<[string, number]>;
  outing: Array<[string, number]>;
}

export function outingSeed(L: SimLayout): OutingSeed {
  for (const [a, ga] of L.gates) for (const [b, gb] of L.gates) if (a !== b) for (let v = 0; v < OFFSHORE_VARIANTS; v++) scenicExtraMetres(L, ga.outNode, gb.inNode, v);
  for (const s of L.slots) {
    if ((s.kind !== "berth" && s.kind !== "mooring" && s.kind !== "far") || s.outNode < 0) continue;
    // (a hull lies in a berth of her own class or up to two sizes bigger: plan.ts ladder)
    const ci = CLASS_ORDER.indexOf(s.cls), vs = outingVariants(L, s.index);
    for (const cls of CLASS_ORDER.slice(ci, ci + 3)) for (const v of vs) outingMetres(L, s.index, cls, v);
  }
  const gates: OutingSeed["gates"] = [...(LOOPS.get(L) ?? [])].map(([gate, g]) => {
    const tracks = [...g.near, ...g.far];
    return [gate, { ...g, foot: tracks.map((t) => FOOTPRINT.get(t) ?? null), parts: tracks.map((t) => OPEN_PARTS.get(t) ?? null) }];
  });
  return { gates, lanes: LANES.get(L) ?? null, scenic: [...memo(SCENIC_M, L)], outing: [...memo(OUTING_M, L)] };
}

/** Adopt an outingSeed built on an identical layout (the same values this thread would compute; anything already computed here is kept). */
export function seedOutings(L: SimLayout, seed: OutingSeed): void {
  let cache = LOOPS.get(L);
  if (!cache) LOOPS.set(L, (cache = new Map()));
  // (gateLoops lays every gate's loops out together, or not at all)
  if (!cache.size) for (const [gate, { near, far, open, foot, parts }] of seed.gates) {
    [...near, ...far].forEach((t, k) => {
      if (foot[k] != null) FOOTPRINT.set(t, foot[k]);
      if (parts[k]) OPEN_PARTS.set(t, parts[k]);
    });
    cache.set(gate, { near, far, open });
  }
  if (seed.lanes && !LANES.has(L)) LANES.set(L, seed.lanes);
  for (const [w, entries] of [[SCENIC_M, seed.scenic], [OUTING_M, seed.outing]] as const) {
    const m = memo(w, L);
    for (const [k, v] of entries) if (!m.has(k)) m.set(k, v);
  }
}
