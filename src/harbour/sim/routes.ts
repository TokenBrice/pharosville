/**
 * Leg routing shared by the planner and the sim: how a hull leaves a slot (warp off the quay, back
 * out of a slip on a curve, or simply sail off its mooring), runs the lane graph, and arrives (the
 * last ~1.5 LOA straight along the berth axis, then warped in alongside). No pivots on the spot.
 */
import type { HullClass, Vec2 } from "../layout/types";
import { detourEdge, nearestNode, routeNodes, type SimLayout, type Slot } from "./layout-graph";
import { hullClearance } from "./obstacles";
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
function asternArc(L: SimLayout, start: Vec2, h: number, straight: number, loa: number, beam: number, target: Vec2, onward: (cusp: Vec2, hc: number) => boolean): { rev: Vec2[]; cusp: Vec2; hc: number } {
  const m0 = h + Math.PI;
  const [d0x, d0z] = dirOf(m0);
  // the straight run out of the slip: the whole hull must stay clear (she starts in it, so judge from
  // where she is: never worse than at the berth)
  const atBerth = Math.min(0, hullClearance(L.hard, start[0], start[1], h, loa, beam));
  // rank: 2 = clear astern and room to sail on from the cusp, 1 = clear astern, 0 = neither
  let best = null as { rev: Vec2[]; cusp: Vec2; hc: number; score: number; rank: number } | null;
  // the full run out of the slip first; a shorter one when the fairway behind her is narrow
  for (const sk of [1, 0.7, 0.45]) {
    const run = straight * sk;
    let straightOk = Infinity;
    for (let k = 1; k <= 6; k++) straightOk = Math.min(straightOk, hullClearance(L.hard, start[0] + d0x * (run * k) / 6, start[1] + d0z * (run * k) / 6, h, loa, beam) - atBerth);
    // widest turn that fits: a tight fairway gets a slow, tight turn (warped round on her lines)
    for (const rk of [1.25, 0.9, 0.65, 0.45]) {
      const R = Math.max(4, loa * rk);
      for (const side of [1, -1]) {
        for (const phi of [Math.PI / 2, Math.PI / 3, (2 * Math.PI) / 3, Math.PI / 6, (5 * Math.PI) / 6]) {
          let px = start[0] + d0x * run, pz = start[1] + d0z * run, m = m0;
          const rev: Vec2[] = [start, [px, pz]];
          const steps = Math.max(4, Math.ceil((phi * R) / 0.75)), stepL = (phi * R) / steps;
          let worst = Math.min(straightOk - 0.3, 3);
          for (let k = 0; k < steps; k++) {
            m += (side * phi) / steps;
            px += Math.sin(m) * stepL; pz += Math.cos(m) * stepL;
            rev.push([px, pz]);
            worst = Math.min(worst, hullClearance(L.hard, px, pz, m + Math.PI, loa, beam) - 0.3);
          }
          const hc = m - Math.PI;
          const [hx, hz] = dirOf(hc);
          const tx = target[0] - px, tz = target[1] - pz, tl = Math.hypot(tx, tz) || 1;
          const align = (hx * tx + hz * tz) / tl;
          // room ahead of the bow once turned
          const ahead = Math.min(L.hard(px + hx * loa * 0.6, pz + hz * loa * 0.6), L.hard(px + hx * loa * 1.2, pz + hz * loa * 1.2)) - beam / 2;
          const clear = worst >= 0;
          const score = (clear ? 3 : Math.max(-4, worst) * 2) + (ahead >= 0.5 ? 0.8 : Math.max(-2, ahead) * 0.5) + align - phi * 0.08 - (1.25 - rk) * 0.5 - (1 - sk);
          if (best && (clear ? 2 : 0) < best.rank) continue;
          if (best && !clear && score <= best.score) continue;
          const rank = clear ? (onward([px, pz], hc) ? 2 : 1) : 0;
          if (!best || rank > best.rank || (rank === best.rank && score > best.score)) best = { rev, cusp: [px, pz], hc, score, rank };
        }
      }
    }
    if (best?.rank === 2) break;
  }
  return best!;
}

/**
 * Sail off ahead and round toward `target` on an arc (radius ~1.3 LOA): a hull leaving a swing
 * mooring, or bearing away from wherever she is, never reverses through a hairpin.
 */
function forwardArc(L: SimLayout, p0: Vec2, h: number, target: Vec2, loa: number, beam: number): { pts: Vec2[]; ok: boolean } {
  const [fx, fz] = dirOf(h);
  const bearing = (run: number): number => {
    const d = Math.atan2(target[0] - p0[0] - fx * run, target[1] - p0[1] - fz * run) - h;
    return Math.atan2(Math.sin(d), Math.cos(d));
  };
  // straight off as far as the water ahead is clear (never worse than where she is)
  const c0 = Math.min(0.3, hullClearance(L.hard, p0[0], p0[1], h, loa, beam));
  const runOff = (len: number): Vec2[] | null => {
    for (let k = 1; k <= Math.ceil(len / 2); k++) {
      const t = Math.min(len, k * 2);
      if (hullClearance(L.hard, p0[0] + fx * t, p0[1] + fz * t, h, loa, beam) < c0) return null;
    }
    return [p0, [p0[0] + fx * len, p0[1] + fz * len]];
  };
  if (Math.abs(bearing(loa * 0.7)) < 0.6) {
    const pts = runOff(loa * 1.4) ?? runOff(loa * 0.7) ?? runOff(loa * 0.35);
    return pts ? { pts, ok: true } : { pts: [p0, [p0[0] + fx * loa * 0.2, p0[1] + fz * loa * 0.2]], ok: false };
  }
  // the short way round unless it runs into something, wide turns first; then the long way; in a
  // tight cove, a short run off and a slow, tight turn (never tighter than ~half a hull length)
  const CANDS: ReadonlyArray<readonly [short: boolean, rk: number, runK: number, margin: number]> = [
    [true, 1.3, 0.7, 0.6], [true, 1.8, 0.7, 0.6], [true, 1.0, 0.7, 0.6], [false, 1.3, 0.7, 0.6],
    [true, 0.7, 0.4, 0.3], [false, 0.7, 0.4, 0.3], [true, 0.5, 0.25, 0.2], [false, 0.5, 0.25, 0.2],
  ];
  for (const [short, rk, runK, margin] of CANDS) {
    const run = loa * runK, d = bearing(run);
    const side = short ? Math.sign(d) || 1 : -(Math.sign(d) || 1), sweep = short ? Math.abs(d) - 0.25 : 2 * Math.PI - Math.abs(d) - 0.25;
    const p1: Vec2 = [p0[0] + fx * run, p0[1] + fz * run];
    const R = Math.max(loa < 12 ? 3 : 6, loa * rk);
    const steps = Math.max(3, Math.ceil((sweep * R) / Math.max(3, loa * 0.5)));
    let x = p1[0], z = p1[1], m = h;
    // the whole hull, all along: the run off, then each chord of the arc
    let worst = Infinity;
    for (let k = 1; k <= 4; k++) worst = Math.min(worst, hullClearance(L.hard, p0[0] + (p1[0] - p0[0]) * k / 4, p0[1] + (p1[1] - p0[1]) * k / 4, h, loa, beam) - margin);
    const pts: Vec2[] = [p0, p1];
    for (let k = 0; k < steps && worst >= 0; k++) {
      const m0 = m;
      m += (side * sweep) / steps;
      const x0 = x, z0 = z;
      x += (Math.sin(m) * (sweep * R)) / steps; z += (Math.cos(m) * (sweep * R)) / steps;
      pts.push([x, z]);
      for (let q = 1; q <= 3; q++) worst = Math.min(worst, hullClearance(L.hard, x0 + (x - x0) * q / 3, z0 + (z - z0) * q / 3, m0 + (m - m0) * q / 3, loa, beam) - margin);
    }
    if (worst >= 0) return { pts, ok: true };
  }
  // no arc clears: only a run off, as far as gives her the most room to turn for the way on (found
  // round whatever is in the way)
  let best: Vec2[] = [p0, [p0[0] + fx * loa * 0.2, p0[1] + fz * loa * 0.2]], bestRoom = -Infinity;
  for (const k of [0.05, 0.2, 0.4, 0.7]) {
    const r = runOff(loa * k);
    if (!r) continue;
    const e = r[1], d = bearing(loa * k);
    let room = Infinity;
    for (let j = 0, m = Math.ceil(Math.abs(d) / 0.2); j <= m; j++) room = Math.min(room, hullClearance(L.hard, e[0], e[1], h + (d * j) / Math.max(1, m), loa, beam));
    if (room > bestRoom + 0.05) { bestRoom = room; best = r; }
  }
  return { pts: best, ok: false };
}

export interface LegControl {
  pts: Vec2[];
  tail: number;
  extras: PathExtras;
}

/**
 * Control polyline: leave slot A (or the current pose), lanes, arrive at slot B. `via` replaces the
 * lane route with these open-water way points (a harbour outing's loop, from and back to one slot).
 */
export function legControlPoints(L: SimLayout, from: Slot | null, at: { x: number; z: number; h: number } | null, to: Slot, loa: number, beam = loa * 0.32, via: readonly Vec2[] | null = null): LegControl {
  const g = L.graph;
  const extras: PathExtras = { keepOff: L.keepOff, hard: L.hard };
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
  let rp: Vec2[] = via
    ? [...(startNode >= 0 ? [[g.x[startNode], g.z[startNode]] as Vec2] : []), ...via]
    : routeNodes(g, startNode, to.inNode).map((k) => [g.x[k], g.z[k]] as Vec2);
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
  if (from?.mode === "alongside" && rest.length) {
    // the way on lies ahead along the quay and the water ahead is clear: sail straight off, never back
    // out down the way she came in and turn round (a flagship would loop round the headland)
    const ax = after[0] - p1[0], az = after[1] - p1[1], al = Math.hypot(ax, az) || 1;
    let ahead = Infinity;
    for (let k = 1; k <= 4; k++) ahead = Math.min(ahead, hullClearance(L.hard, p1[0] + fx * loa * 0.4 * k, p1[1] + fz * loa * 0.4 * k, h0, loa, beam));
    if ((fx * ax + fz * az) / al > 0.3 && ahead > 0.8) rest = [];
  }
  const target = (from?.mode === "alongside" ? rest[0] : restFar) ?? after;

  // ---- departure head
  let head: Vec2[] | null = null;
  if (from && berthLike) {
    const tx = target[0] - p1[0], tz = target[1] - p1[1], tl = Math.hypot(tx, tz) || 1;
    const fwdOk = from.mode === "alongside" && (fx * tx + fz * tz) / tl > -0.25
      && L.hard(p1[0] + fx * loa * 0.7, p1[1] + fz * loa * 0.7) > beam / 2 + 0.6 && L.hard(p1[0] + fx * loa * 1.3, p1[1] + fz * loa * 1.3) > beam / 2 + 0.6;
    if (fwdOk) {
      const f = forwardArc(L, p1, h0, target, loa, beam);
      if (f.ok) head = f.pts;
    }
    // no room to sail off ahead: back out
    if (!head) {
      // straight out of the slip (as far as the approach runs along the slot axis), then curve astern
      let straight = loa * 0.35;
      const ap = from.approach;
      if (from.mode !== "alongside" && ap.length >= 2) {
        const q = ap[ap.length - 2];
        const dx = from.x - q[0], dz = from.z - q[1], dl = Math.hypot(dx, dz);
        straight = dl > 0.5 && (dx * fx + dz * fz) / dl > 0.97 ? Math.min(loa * 1.6, Math.max(loa * 0.5, dl * 0.9)) : loa * 0.7;
      }
      // where she turns for from a cusp: the first fairway point not yet backed past, else the lanes
      const nextFrom = (cusp: Vec2, hc: number): Vec2 => {
        const [hx, hz] = dirOf(hc);
        return rest.find((q) => (q[0] - cusp[0]) * hx + (q[1] - cusp[1]) * hz >= loa * 1.2) ?? after;
      };
      const a = asternArc(L, p1, h0, straight, loa, beam, target, (cusp, hc) => forwardArc(L, cusp, hc, nextFrom(cusp, hc), loa, beam).ok);
      extras.rev = a.rev;
      const [hx, hz] = dirOf(a.hc);
      // the fairway points she has already backed past (beside or behind the bow) are done with; she
      // turns for whatever comes next (never for a point she then leaves astern: a hairpin)
      while (rest.length && (rest[0][0] - a.cusp[0]) * hx + (rest[0][1] - a.cusp[1]) * hz < loa * 1.2) rest.shift();
      head = forwardArc(L, a.cusp, a.hc, rest[0] ?? after, loa, beam).pts;
    }
  } else head = forwardArc(L, p1, h0, target, loa, beam).pts;

  let pts: Vec2[] = [...head, ...rest];
  for (const q of rp) if (Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 1) pts.push(q);
  let nDep = pts.length;
  // a way point just past the departure that she would have to turn back for (a lane join she is
  // already level with) is skipped: no hairpin
  {
    const e = head[head.length - 1], q = head[head.length - 2], ul = Math.hypot(e[0] - q[0], e[1] - q[1]) || 1;
    const ux = (e[0] - q[0]) / ul, uz = (e[1] - q[1]) / ul;
    while (head.length < nDep - 1) {
      const p = pts[head.length], d = Math.hypot(p[0] - e[0], p[1] - e[1]);
      if (d > loa * 3 || (p[0] - e[0]) * ux + (p[1] - e[1]) * uz > 0.2 * d) break;
      pts.splice(head.length, 1); nDep--;
    }
  }
  pts.push(...arr);
  // the departure arc (checked) and the final run in are kept; anything else that runs the hull over
  // land or a deck (an approach across a corner, a raft across the island) is re-routed round it
  pts = repairBlocked(L, pts, head.length - 1, 1, beam);
  pts = roundHairpins(L, pts, head.length - 1, loa, to.mode === "alongside" || to.mode === "finger" || to.mode === "pontoon");
  extras.headLen = polyLen(pts.slice(0, Math.min(nDep, head.length + rest.length + 1)));
  extras.headKeep = head.length;
  extras.tailLen = polyLen(arr);
  extras.w1 = w1;
  // a swinging slot is reached through its field: only the pick-up run is kept exactly, the way in to
  // it is cleared round the other moored hulls like the rest of the leg
  const tail = to.swing > 0 && arr.length > 3 ? 3 : arr.length;
  return { pts, tail, extras };
}

/**
 * Control segments whose line runs the hull's centre over land or a deck are re-routed by A* on the
 * clearance grid (string-pulled waypoints). The first `head` and last `tail` segments are left alone.
 */
function repairBlocked(L: SimLayout, pts: Vec2[], head: number, tail: number, beam: number): Vec2[] {
  if (!L.field) return pts;
  const blocked = (a: Vec2, b: Vec2): boolean => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 2; s < len - 2; s += 1) if (L.hard(a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len) < beam / 2 + 0.3) return true;
    return false;
  };
  const out: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1], b = pts[i];
    if (i - 1 >= head && i - 1 < pts.length - 1 - tail && blocked(a, b)) {
      // round with room to spare and clear of the still hulls; else as tight as the water allows
      const way = detourEdge(L.field, L.keepOff, a[0], a[1], b[0], b[1], beam / 2 + 2.5, 360, 4)
        ?? detourEdge(L.field, null, a[0], a[1], b[0], b[1], beam / 2 + 1.2, 360, 8);
      if (way) out.push(...way);
    }
    out.push(b);
  }
  return out;
}

/**
 * A way point the path doubles back at (a raft or a mooring approached from beyond it) is replaced by a
 * turning loop out to one side, where the water is open enough: she sails round, she does not spin on
 * the spot. Points before `from` (the departure arc) are left alone.
 */
function roundHairpins(L: SimLayout, pts: Vec2[], from: number, loa: number, axisEnd: boolean): Vec2[] {
  const R = Math.max(6, loa * 1.2);
  const out: Vec2[] = pts.slice(0, Math.max(1, from + 1));
  for (let i = out.length; i < pts.length; i++) {
    const a = out[out.length - 1], v = pts[i], b = pts[i + 1];
    // (a berth's final run in stays on its axis)
    if (!b || (axisEnd && i === pts.length - 2)) { out.push(v); continue; }
    const li = Math.hypot(v[0] - a[0], v[1] - a[1]), lo = Math.hypot(b[0] - v[0], b[1] - v[1]);
    if (li < 1 || lo < 1) { out.push(v); continue; }
    const ux = (v[0] - a[0]) / li, uz = (v[1] - a[1]) / li, wx = (b[0] - v[0]) / lo, wz = (b[1] - v[1]) / lo;
    if (ux * wx + uz * wz > -0.8) { out.push(v); continue; }
    // loop out to the side the way on already leans to (else either), in open water only
    const lean = -uz * wx + ux * wz;
    let done = false;
    for (const side of lean >= 0 ? [1, -1] : [-1, 1]) {
      const nx = -uz * side, nz = ux * side;
      const q1: Vec2 = [v[0] + ux * R * 0.5 + nx * R, v[1] + uz * R * 0.5 + nz * R];
      const q2: Vec2 = [v[0] - ux * R * 0.3 + nx * R * 2, v[1] - uz * R * 0.3 + nz * R * 2];
      let ok = true;
      for (let k = 0; k <= 8 && ok; k++) {
        const t = k / 8;
        for (const [p0, p1] of [[v, q1], [q1, q2]] as const) if (L.hard(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t) < loa / 2 + 2) ok = false;
      }
      if (!ok) continue;
      out.push(q1, q2);
      done = true;
      break;
    }
    if (!done) out.push(v);
  }
  return out;
}

/** Smoothed path for a slot-to-slot leg of a hull class. */
export function buildLegPath(L: SimLayout, fromSlot: number, toSlot: number, cls: HullClass): PathRec {
  const loa = L.loa[cls], beam = L.beam[cls];
  const c = legControlPoints(L, L.slots[fromSlot], null, L.slots[toSlot], loa, beam);
  return buildPath(c.pts, loa, c.tail, L.field, beam, c.extras);
}

