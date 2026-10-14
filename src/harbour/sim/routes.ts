/**
 * Leg routing shared by the planner and the sim: how a hull leaves a slot (warp off the quay, back
 * out of a slip on a curve, or simply sail off its mooring), runs the lane graph, and arrives (the
 * last ~1.5 LOA straight along the berth axis, then warped in alongside). No pivots on the spot.
 */
import type { HullClass, Vec2 } from "../layout/types";
import { nearestNode, routeNodes, type SimLayout, type Slot } from "./layout-graph";
import { buildPath, type PathExtras, type PathRec } from "./path";

const dirOf = (h: number): Vec2 => [Math.sin(h), Math.cos(h)];

export function slotPoint(s: Slot): Vec2 {
  if (s.swing > 0) return [s.x - Math.sin(s.heading) * s.swing, s.z - Math.cos(s.heading) * s.swing];
  return [s.x, s.z];
}

const polyLen = (pts: readonly Vec2[]): number => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
};

/**
 * Back out astern from `start` (bow on heading h): straight for `straight` metres, then on an arc
 * (radius ≥ ~1.25 LOA), choosing the side and sweep that leave the bow pointing toward `target` with
 * the swept hull clear of structure. Returns the astern polyline (direction of travel) and the cusp.
 */
function asternArc(L: SimLayout, start: Vec2, h: number, straight: number, loa: number, beam: number, target: Vec2): { rev: Vec2[]; cusp: Vec2; hc: number } {
  const m0 = h + Math.PI;
  const [d0x, d0z] = dirOf(m0);
  // the straight run out of the slip: the hull centre must stay in water
  let straightOk = Infinity;
  for (let k = 1; k <= 6; k++) straightOk = Math.min(straightOk, L.hard(start[0] + d0x * (straight * k) / 6, start[1] + d0z * (straight * k) / 6));
  let best: { rev: Vec2[]; cusp: Vec2; hc: number; score: number } | null = null;
  // widest turn that fits: a tight fairway gets a slow, tight turn (warped round on her lines)
  for (const rk of [1.25, 0.9, 0.65, 0.45]) {
    const R = Math.max(4, loa * rk);
    for (const side of [1, -1]) {
      for (const phi of [Math.PI / 2, Math.PI / 3, (2 * Math.PI) / 3, Math.PI / 6, (5 * Math.PI) / 6]) {
        let px = start[0] + d0x * straight, pz = start[1] + d0z * straight, m = m0;
        const rev: Vec2[] = [start, [px, pz]];
        const steps = Math.max(4, Math.ceil((phi * R) / 0.75)), stepL = (phi * R) / steps;
        let worst = Math.min(straightOk - 0.3, 3);
        for (let k = 0; k < steps; k++) {
          m += (side * phi) / steps;
          px += Math.sin(m) * stepL; pz += Math.cos(m) * stepL;
          rev.push([px, pz]);
          const ax = Math.sin(m) * loa * 0.45, az = Math.cos(m) * loa * 0.45;
          worst = Math.min(worst, L.hard(px, pz) - beam / 2, L.hard(px + ax, pz + az) - beam * 0.3, L.hard(px - ax, pz - az) - beam * 0.3);
        }
        const hc = m - Math.PI;
        const [hx, hz] = dirOf(hc);
        const tx = target[0] - px, tz = target[1] - pz, tl = Math.hypot(tx, tz) || 1;
        const align = (hx * tx + hz * tz) / tl;
        // room ahead of the bow once turned
        const ahead = Math.min(L.hard(px + hx * loa * 0.6, pz + hz * loa * 0.6), L.hard(px + hx * loa * 1.2, pz + hz * loa * 1.2)) - beam / 2;
        const score = (worst >= 0.3 ? 3 : Math.max(-4, worst)) + (ahead >= 0.5 ? 0.8 : Math.max(-2, ahead) * 0.5) + align - phi * 0.08 - (1.25 - rk) * 0.5;
        if (!best || score > best.score) best = { rev, cusp: [px, pz], hc, score };
      }
    }
  }
  return best!;
}

/**
 * Sail off ahead and round toward `target` on an arc (radius ~1.3 LOA): a hull leaving a swing
 * mooring, or bearing away from wherever she is, never reverses through a hairpin.
 */
function forwardArc(L: SimLayout, p0: Vec2, h: number, target: Vec2, loa: number, beam: number): Vec2[] {
  const [fx, fz] = dirOf(h);
  const run = loa * 0.7;
  const p1: Vec2 = [p0[0] + fx * run, p0[1] + fz * run];
  const tx = target[0] - p1[0], tz = target[1] - p1[1];
  let d = Math.atan2(tx, tz) - h;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) < 0.6) return [p0, [p0[0] + fx * loa * 1.4, p0[1] + fz * loa * 1.4]];
  // the short way round unless it runs into something; then the long way
  let best: Vec2[] | null = null, bestW = -Infinity;
  for (const [side, sweep, rk] of [[Math.sign(d) || 1, Math.abs(d) - 0.25, 1.3], [Math.sign(d) || 1, Math.abs(d) - 0.25, 1.8], [-(Math.sign(d) || 1), 2 * Math.PI - Math.abs(d) - 0.25, 1.3]] as const) {
    const R = Math.max(6, loa * rk);
    const steps = Math.max(3, Math.ceil((sweep * R) / Math.max(3, loa * 0.5)));
    let x = p1[0], z = p1[1], m = h, worst = Infinity;
    const pts: Vec2[] = [p0, p1];
    for (let k = 0; k < steps; k++) {
      m += (side * sweep) / steps;
      x += (Math.sin(m) * (sweep * R)) / steps; z += (Math.cos(m) * (sweep * R)) / steps;
      pts.push([x, z]);
      worst = Math.min(worst, L.hard(x, z) - beam / 2 - 1);
    }
    if (worst >= 0) return pts;
    if (worst > bestW) { bestW = worst; best = pts; }
  }
  return best!;
}

export interface LegControl {
  pts: Vec2[];
  tail: number;
  extras: PathExtras;
}

/** Control polyline: leave slot A (or the current pose), lanes, arrive at slot B. */
export function legControlPoints(L: SimLayout, from: Slot | null, at: { x: number; z: number; h: number } | null, to: Slot, loa: number, beam = loa * 0.32): LegControl {
  const g = L.graph;
  const extras: PathExtras = { keepOff: L.keepOff };
  // ---- where the hull leaves from
  const berthLike = !!from && (from.mode === "alongside" || from.mode === "finger" || from.mode === "pontoon");
  let p1: Vec2, h0: number, startNode: number;
  let rest: Vec2[] = [];
  if (from && berthLike) {
    h0 = from.heading;
    p1 = [from.x, from.z];
    if (from.mode === "alongside" && from.warp) {
      extras.w0 = [from.x, from.z, from.warp[0], from.warp[1], h0];
      p1 = [from.x + from.warp[0], from.z + from.warp[1]];
    }
    // the berth's approach, reversed: the way out (alongside: minus the angled run-in; slips and
    // pontoons: minus the slip itself, which she backs out of)
    rest = from.mode === "alongside"
      ? from.approach.slice(0, -1).reverse().filter((q) => Math.hypot(q[0] - from.x, q[1] - from.z) > loa * 1.7)
      : from.approach.slice(0, -2).reverse();
    startNode = from.outNode;
  } else if (from) {
    h0 = from.heading; p1 = slotPoint(from); startNode = from.outNode;
  } else {
    h0 = at!.h; p1 = [at!.x, at!.z];
    const fx = Math.sin(h0), fz = Math.cos(h0);
    startNode = nearestNode(g, p1[0] + fx * loa * 1.2, p1[1] + fz * loa * 1.2, g.through, fx, fz);
  }
  const [fx, fz] = dirOf(h0);

  // ---- arrival: authored approach, then a straight final run on (or near) the slot axis
  const arrive: Vec2[] = [];
  let w1: [number, number, number] | null = null;
  const [ex, ez] = dirOf(to.heading);
  const end = slotPoint(to);
  const runClear = (q0: Vec2, q1: Vec2, ux: number, uz: number): boolean => {
    for (let k = 0; k <= 8; k++) {
      const x = q0[0] + ((q1[0] - q0[0]) * k) / 8, z = q0[1] + ((q1[1] - q0[1]) * k) / 8;
      if (L.hard(x, z) < beam / 2 + 0.8) return false;
      if (L.hard(x + ux * loa * 0.45, z + uz * loa * 0.45) < beam * 0.3 + 0.4 || L.hard(x - ux * loa * 0.45, z - uz * loa * 0.45) < beam * 0.3 + 0.4) return false;
    }
    return true;
  };
  if (to.mode === "alongside" && to.warp) {
    const q1: Vec2 = [to.x + to.warp[0], to.z + to.warp[1]];
    const wl = Math.hypot(to.warp[0], to.warp[1]) || 1, ox = to.warp[0] / wl, oz = to.warp[1] / wl;
    // run in along the quay from astern; where the quay ends in land astern, come in at an angle
    let q0: Vec2 = [q1[0] - ex * loa * 1.6, q1[1] - ez * loa * 1.6], hIn = to.heading;
    for (const al of [0, 0.26, 0.45, 0.65, 0.85]) {
      const ux = ex * Math.cos(al) - ox * Math.sin(al), uz = ez * Math.cos(al) - oz * Math.sin(al);
      const c0: Vec2 = [q1[0] - ux * loa * 1.6, q1[1] - uz * loa * 1.6];
      q0 = c0; hIn = Math.atan2(ux, uz);
      if (runClear(c0, q1, ux, uz)) break;
    }
    const [ix, iz] = dirOf(hIn);
    for (const q of to.approach.slice(0, -1)) {
      // keep what leads in from astern of the final run; drop the authored angled run-in
      if (Math.hypot(q[0] - to.x, q[1] - to.z) < loa * 2) continue;
      if ((q[0] - q0[0]) * ix + (q[1] - q0[1]) * iz > -loa * 0.3) continue;
      arrive.push(q);
    }
    arrive.push(q0, q1);
    w1 = [-to.warp[0], -to.warp[1], to.heading];
  } else {
    // slips, pontoons and moorings: the authored approach knows the fairways; just make sure the
    // final run is on the slot axis
    for (const q of to.approach.slice(0, -1)) arrive.push(q);
    const prev = arrive[arrive.length - 1];
    const dx = prev ? end[0] - prev[0] : 0, dz = prev ? end[1] - prev[1] : 0, dl = Math.hypot(dx, dz);
    if (!prev || dl < 0.5 || (dx * ex + dz * ez) / dl < 0.985) {
      const run = Math.min(loa * 1.5, Math.max(loa * 0.6, dl * 0.8 || loa * 1.5));
      const q0: Vec2 = [end[0] - ex * run, end[1] - ez * run];
      if (!prev || runClear(q0, end, ex, ez)) arrive.push(q0);
    }
    arrive.push(end);
  }
  if (to.inNode >= 0 && arrive.length && Math.hypot(arrive[0][0] - g.x[to.inNode], arrive[0][1] - g.z[to.inNode]) > 1) arrive.unshift([g.x[to.inNode], g.z[to.inNode]]);

  // ---- lanes between: leave the lane where it passes closest to the approach start, join it where
  // it passes closest to the way out, instead of running on to a gate node and doubling back
  const proj = (p: Vec2, a: Vec2, b: Vec2): [number, Vec2] => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    const q: Vec2 = [a[0] + dx * t, a[1] + dz * t];
    return [Math.hypot(p[0] - q[0], p[1] - q[1]), q];
  };
  let rp: Vec2[] = routeNodes(g, startNode, to.inNode).map((k) => [g.x[k], g.z[k]] as Vec2);
  let arr = arrive;
  if (rp.length >= 2) {
    const a0 = arr.length > 1 ? arr[1] : arr[0];
    let best = Math.hypot(a0[0] - rp[rp.length - 1][0], a0[1] - rp[rp.length - 1][1]) - 1, cut = -1, cq: Vec2 | null = null;
    for (let k = Math.max(0, rp.length - 4); k < rp.length - 1; k++) {
      const [d, q] = proj(a0, rp[k], rp[k + 1]);
      if (d < best) { best = d; cut = k; cq = q; }
    }
    if (cq) { rp = [...rp.slice(0, cut + 1), cq]; if (arr.length > 1) arr = arr.slice(1); }
  }
  if (rp.length >= 2) {
    const j = rest.length ? rest[rest.length - 1] : p1;
    let bestD = Math.hypot(j[0] - rp[0][0], j[1] - rp[0][1]) - 1, dcut = -1, dq: Vec2 | null = null;
    for (let k = 0; k < Math.min(3, rp.length - 1); k++) {
      const [d, q] = proj(j, rp[k], rp[k + 1]);
      if (d < bestD) { bestD = d; dcut = k; dq = q; }
    }
    if (dq) rp = [dq, ...rp.slice(dcut + 1)];
  }
  // where the hull is bound once clear of the slot
  const after = [...rp, ...arr].find((q) => Math.hypot(q[0] - p1[0], q[1] - p1[1]) > loa * 2.5) ?? arr[arr.length - 1];
  const restFar = rest.find((q) => Math.hypot(q[0] - p1[0], q[1] - p1[1]) > loa * 2.5);
  if (from?.mode === "alongside" && restFar && Math.hypot(restFar[0] - after[0], restFar[1] - after[1]) > Math.hypot(p1[0] - after[0], p1[1] - after[1]) + loa) rest = [];
  const target = (from?.mode === "alongside" ? rest[0] : restFar) ?? after;

  // ---- departure head
  let head: Vec2[];
  if (from && berthLike) {
    const tx = target[0] - p1[0], tz = target[1] - p1[1], tl = Math.hypot(tx, tz) || 1;
    const fwdOk = from.mode === "alongside" && (fx * tx + fz * tz) / tl > -0.25
      && L.hard(p1[0] + fx * loa * 0.7, p1[1] + fz * loa * 0.7) > beam / 2 + 0.6 && L.hard(p1[0] + fx * loa * 1.3, p1[1] + fz * loa * 1.3) > beam / 2 + 0.6;
    if (fwdOk) head = forwardArc(L, p1, h0, target, loa, beam);
    else {
      // straight out of the slip (as far as the approach runs along the slot axis), then curve astern
      let straight = loa * 0.35;
      const ap = from.approach;
      if (from.mode !== "alongside" && ap.length >= 2) {
        const q = ap[ap.length - 2];
        const dx = from.x - q[0], dz = from.z - q[1], dl = Math.hypot(dx, dz);
        straight = dl > 0.5 && (dx * fx + dz * fz) / dl > 0.97 ? Math.min(loa * 1.6, Math.max(loa * 0.5, dl * 0.9)) : loa * 0.7;
      }
      const a = asternArc(L, p1, h0, straight, loa, beam, target);
      extras.rev = a.rev;
      const [hx, hz] = dirOf(a.hc);
      head = forwardArc(L, a.cusp, a.hc, target, loa, beam);
      // the fairway points she has already backed past (beside or behind the bow) are done with
      while (rest.length && (rest[0][0] - a.cusp[0]) * hx + (rest[0][1] - a.cusp[1]) * hz < loa * 1.2) rest.shift();
    }
  } else head = forwardArc(L, p1, h0, target, loa, beam);

  const pts: Vec2[] = [...head, ...rest];
  for (const q of rp) if (Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 1) pts.push(q);
  const nDep = pts.length;
  pts.push(...arr);
  extras.headLen = polyLen(pts.slice(0, Math.min(nDep, head.length + rest.length + 1)));
  extras.headKeep = head.length;
  extras.tailLen = polyLen(arr);
  extras.w1 = w1;
  return { pts, tail: arr.length, extras };
}

/** Smoothed path for a slot-to-slot leg of a hull class. */
export function buildLegPath(L: SimLayout, fromSlot: number, toSlot: number, cls: HullClass): PathRec {
  const loa = L.loa[cls], beam = L.beam[cls];
  const c = legControlPoints(L, L.slots[fromSlot], null, L.slots[toSlot], loa, beam);
  return buildPath(c.pts, loa, c.tail, L.field, beam, c.extras);
}

