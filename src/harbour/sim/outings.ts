/**
 * Harbour outings (D22): DECLARED-DECORATIVE. A hull that only ever lies at one harbour (a
 * single-chain coin) now and then casts off for a short sail: out of her harbour into the open
 * water nearby (past the Pharos when it is near, tacking out when that way is upwind), round, and
 * back to the SAME berth or mooring, which stays hers all the while. Outings carry no data: the pose
 * buffer flags them so the UI can say "out for a sail" rather than "sailing to <chain>".
 *
 * Everything here is a pure function of the layout (cached per layout): every viewer sees the same
 * loops.
 */
import type { HullClass, Vec2 } from "../layout/types";
import { u01 } from "../model/classify";
import { routeNodes, type SimLayout, type Slot } from "./layout-graph";
import { clearance, hullClearance } from "./obstacles";
import { buildPath, type PathRec } from "./path";
import { legControlPoints } from "./routes";

/** Loop variants per gate, so hulls sharing a gate do not all sail one track. */
export const OUTING_VARIANTS = 3;
/** Loop reach from the gate (m): the far end of the loop, at most. */
const REACH_MAX = 175, REACH_MIN = 70;
/** Water kept round the loop's control points: to land and structure, and to still hulls (m). */
const NEED_HARD = 14, NEED_STILL = 5;
/** The first stretch out of the gate may run closer to the piers (they are laid out with fairways). */
const NEAR_GATE = 24;
/** A loop may start this far (lane metres) downstream of the gate. */
const ORIGIN_MAX = 300;
const DIRS = 48;

const LOOPS = new WeakMap<SimLayout, Map<number, Vec2[][]>>();

/** The open-water margin at (x, z), in metres beyond the need: < 0 is too close. Off the field: -1. */
function margin(L: SimLayout, x: number, z: number, nearGate: boolean): number {
  if (!L.field) return 50; // no geometry (synthetic layouts): open water everywhere
  const c = clearance(L.field, x, z);
  if (c >= 999) return -1; // off the sea we know
  if (nearGate) return c - 5;
  let m = c - NEED_HARD;
  if (L.keepOff) m = Math.min(m, clearance(L.keepOff, x, z) - NEED_STILL);
  return m;
}

function segmentClear(L: SimLayout, a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 4));
  for (let k = 0; k <= n; k++) if (margin(L, a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, false) < -3) return false;
  return true;
}

/**
 * The way points of a gate's (out lane node's) loop variant v, or null when no open water near the
 * gate takes a loop: the fairway out to the loop's origin, then out on one side, round the far end
 * and back on the other (the outward side a beat of short tacks when the way out is to windward).
 */
export function outingLoop(L: SimLayout, outNode: number, v: number): Vec2[] | null {
  let cache = LOOPS.get(L);
  if (!cache) LOOPS.set(L, (cache = new Map()));
  let loops = cache.get(outNode);
  if (!loops) cache.set(outNode, (loops = makeLoops(L, outNode)));
  return loops.length ? loops[v % loops.length] : null;
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
        score += 150 * Math.max(0, 1 - Math.hypot(ex - L.pharos[0], ez - L.pharos[1]) / 320);
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
    if (used.some((p) => Math.hypot(g.x[p.o] - g.x[c.o], g.z[p.o] - g.z[c.o]) < 40 && Math.abs(Math.atan2(Math.sin(p.th - c.th), Math.cos(p.th - c.th))) < 0.5)) continue;
    used.push(c);
    const loop = ellipse(L, g.x[c.o], g.z[c.o], c.th, c.reach, `${g.ids[outNode]}#${picks.length}`);
    if (!loop) continue;
    // the fairway out to the loop's origin, then the loop
    const route = routeNodes(g, outNode, c.o).slice(1).map((k) => [g.x[k], g.z[k]] as Vec2);
    picks.push([...route, ...loop]);
  }
  return picks;
}

/** Out on one side, round the far end, back on the other (a beat out when that is to windward). */
function ellipse(L: SimLayout, gx: number, gz: number, th: number, reach: number, seed: string): Vec2[] | null {
  const up = L.windFrom;
  // one way round per gate and variant (hulls on one loop never meet head-on in it)
  const side = u01(seed + "#side") < 0.5 ? 1 : -1;
  const ux = Math.sin(th), uz = Math.cos(th), sx = -uz * side, sz = ux * side;
  const beat = Math.cos(th - up) > 0.45;
  const a0 = 16;
  let a = (Math.min(reach, REACH_MAX) - a0 - 10) / 2;
  let b = Math.min(42, a * 0.55);
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
    let ok = pts.every((p) => margin(L, p[0], p[1], false) >= 0);
    for (let k = 1; ok && k < pts.length; k++) ok = segmentClear(L, pts[k - 1], pts[k]);
    if (ok) return pts;
    if (b > 16) b *= 0.75; else { a *= 0.82; b = Math.min(42, a * 0.55); }
    if (a < 25) break;
  }
  return null;
}

/** Which loop variant a slot's hull sails (by slot: the berth is hers all cycle). */
export function outingVariant(s: Slot): number {
  return Math.floor(u01(s.id + "#outing-v") * OUTING_VARIANTS);
}

/** Control-point metres of a slot's outing for a hull class (for the plan's timing); -1 when it has none. */
export function outingMetres(L: SimLayout, slotIdx: number, cls: HullClass): number {
  const s = L.slots[slotIdx];
  // a berth she cannot leave cleanly (warped off, the hull would touch the quay's corner) keeps her in
  if (s.warp && hullClearance(L.hard, s.x + s.warp[0], s.z + s.warp[1], s.heading, L.loa[cls], L.beam[cls]) < 0.2) return -1;
  const loop = outingLoop(L, s.outNode, outingVariant(s));
  if (!loop) return -1;
  const g = L.graph, gx = s.outNode >= 0 ? g.x[s.outNode] : s.x, gz = s.outNode >= 0 ? g.z[s.outNode] : s.z;
  let m = Math.hypot(loop[0][0] - gx, loop[0][1] - gz) + Math.hypot(loop[loop.length - 1][0] - gx, loop[loop.length - 1][1] - gz);
  for (let k = 1; k < loop.length; k++) m += Math.hypot(loop[k][0] - loop[k - 1][0], loop[k][1] - loop[k - 1][1]);
  // and the run out of / back into the harbour, each way
  let ap = 0;
  for (let k = 1; k < s.approach.length; k++) ap += Math.hypot(s.approach[k][0] - s.approach[k - 1][0], s.approach[k][1] - s.approach[k - 1][1]);
  return m + 2 * ap;
}

/** The smoothed path of a slot's outing for a hull class: off the berth, round the loop, back in. */
export function buildOutingPath(L: SimLayout, slotIdx: number, cls: HullClass): PathRec | null {
  const s = L.slots[slotIdx];
  const loop = outingLoop(L, s.outNode, outingVariant(s));
  if (!loop) return null;
  const loa = L.loa[cls], beam = L.beam[cls];
  const c = legControlPoints(L, s, null, s, loa, beam, loop);
  return buildPath(c.pts, loa, c.tail, L.field, beam, c.extras);
}
