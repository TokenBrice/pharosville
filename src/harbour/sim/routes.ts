/**
 * Leg routing shared by the planner and the sim: the control polyline for leaving one slot (or a
 * pose under way), running the lane graph, and arriving at another slot.
 */
import type { HullClass, Vec2 } from "../layout/types";
import { nearestNode, routeNodes, type SimLayout, type Slot } from "./layout-graph";
import { buildPath, wrapAngle, type PathRec } from "./path";

export function slotPoint(s: Slot): Vec2 {
  if (s.swing > 0) return [s.x - Math.sin(s.heading) * s.swing, s.z - Math.cos(s.heading) * s.swing];
  return [s.x, s.z];
}

/** Control polyline: leave slot A (or the current pose), lanes, arrive at slot B. */
export function legControlPoints(L: SimLayout, from: Slot | null, at: { x: number; z: number; h: number } | null, to: Slot, loa: number): { pts: Vec2[]; astern: boolean; tail: number } {
  const g = L.graph;
  const pts: Vec2[] = [];
  let astern = false;
  let startNode: number;
  if (from) {
    if (from.kind === "berth" || from.kind === "raft") {
      for (let k = from.approach.length - 1; k >= 0; k--) pts.push(from.approach[k]);
      pts[0] = slotPoint(from);
      const a0 = from.approach[0];
      if (from.outNode >= 0 && Math.hypot(a0[0] - g.x[from.outNode], a0[1] - g.z[from.outNode]) > 1) pts.push([g.x[from.outNode], g.z[from.outNode]]);
      // back out only where the berth's heading runs along its approach tail (bow-in slips);
      // alongside berths leave by pivoting off the quay instead
      const a = from.approach, k = a.length - 1;
      const tail = k >= 1 ? Math.atan2(a[k][0] - a[k - 1][0], a[k][1] - a[k - 1][1]) : from.heading;
      astern = from.kind === "berth" && Math.abs(wrapAngle(tail - from.heading)) < 0.35;
    } else {
      const p0 = slotPoint(from);
      pts.push(p0, [p0[0] + Math.sin(from.heading) * loa * 1.6, p0[1] + Math.cos(from.heading) * loa * 1.6]);
    }
    startNode = from.outNode;
    if (startNode >= 0 && !(from.kind === "berth" || from.kind === "raft")) pts.push([g.x[startNode], g.z[startNode]]);
  } else {
    const p = at!;
    const fx = Math.sin(p.h), fz = Math.cos(p.h);
    pts.push([p.x, p.z], [p.x + fx * loa * 1.2, p.z + fz * loa * 1.2]);
    startNode = nearestNode(g, p.x + fx * loa * 1.2, p.z + fz * loa * 1.2, g.through, fx, fz);
    if (startNode >= 0) pts.push([g.x[startNode], g.z[startNode]]);
  }
  const route = routeNodes(g, startNode, to.inNode);
  let rp: Vec2[] = route.map((k) => [g.x[k], g.z[k]] as Vec2);
  // Leave the lane where it passes closest to the approach start, and join it where it passes
  // closest to the berth exit, instead of running on to a gate node and doubling back.
  const proj = (p: Vec2, a: Vec2, b: Vec2): [number, Vec2] => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    const q: Vec2 = [a[0] + dx * t, a[1] + dz * t];
    return [Math.hypot(p[0] - q[0], p[1] - q[1]), q];
  };
  if (rp.length >= 2) {
    const a0 = to.approach[0];
    let best = Math.hypot(a0[0] - rp[rp.length - 1][0], a0[1] - rp[rp.length - 1][1]) - 1, cut = -1, cq: Vec2 | null = null;
    for (let k = Math.max(0, rp.length - 4); k < rp.length - 1; k++) {
      const [d, q] = proj(a0, rp[k], rp[k + 1]);
      if (d < best) { best = d; cut = k; cq = q; }
    }
    if (cq) rp = [...rp.slice(0, cut + 1), cq];
    const j = pts[pts.length - 1];
    if (from && (from.kind === "berth" || from.kind === "raft") && rp.length >= 2) {
      let bestD = Math.hypot(j[0] - rp[0][0], j[1] - rp[0][1]) - 1, dcut = -1, dq: Vec2 | null = null;
      for (let k = 0; k < Math.min(3, rp.length - 1); k++) {
        const [d, q] = proj(j, rp[k], rp[k + 1]);
        if (d < bestD) { bestD = d; dcut = k; dq = q; }
      }
      if (dq) { rp = [dq, ...rp.slice(dcut + 1)]; if (pts.length > 1 && Math.hypot(pts[pts.length - 1][0] - g.x[startNode], pts[pts.length - 1][1] - g.z[startNode]) < 0.5) pts.pop(); }
    }
  }
  for (let k = 1; k < rp.length; k++) pts.push(rp[k]);
  for (let k = 0; k < to.approach.length; k++) pts.push(to.approach[k]);
  pts[pts.length - 1] = slotPoint(to);
  return { pts, astern, tail: to.approach.length };
}


/** Smoothed path for a slot-to-slot leg of a hull class. */
export function buildLegPath(L: SimLayout, fromSlot: number, toSlot: number, cls: HullClass): PathRec {
  const loa = L.loa[cls];
  const { pts, astern, tail } = legControlPoints(L, L.slots[fromSlot], null, L.slots[toSlot], loa);
  return buildPath(pts, loa, astern ? loa * 1.3 : 0, tail, L.field, L.beam[cls]);
}
