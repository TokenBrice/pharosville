import type { HullClass } from "../layout/types";
import type { SimLayout, Slot } from "./layout-graph";
import { clearance, hullClearance } from "./obstacles";
import { buildOutingPath, buildScenicPath, scenicClearOf } from "./outings";
import type { PathRec } from "./path";
import { boatLocalTime, findSegment, RAFT_CLEAR, SEG_DOCK, type BoatPlan, type PlanData } from "./plan";
import { buildLegPath } from "./routes";

export const PREFETCH_S = 240;
/** A plan leg's path cache key: from>to>class, plus >s<loop> for an outing's or a scenic leg's loop. */
export function pathKey(fromSlot: number, toSlot: number, cls: HullClass, loop: number): string {
  return fromSlot + ">" + toSlot + ">" + cls + (loop ? ">s" + loop : "");
}

/** A plan leg to build: from slot, to slot, hull class, loop (plan.segLoop). */
export type PathRequest = [number, number, HullClass, number];

export interface PreparedPlan {
  plan: PlanData;
  rafts: Slot[];
  paths: Array<[string, PathRec, boolean]>;
}

/** The whole hull stays clear of land and decks all along a path (and its astern prefix). */
export function pathClear(L: SimLayout, p: PathRec, loa: number, beam: number, blocked?: { x: number; z: number }): boolean {
  const clear = (x: number, z: number, h: number) => {
    if (L.field && clearance(L.field, x, z) > loa / 2 + 4 || hullClearance(L.hard, x, z, h, loa, beam) >= -0.15) return true;
    if (blocked) { blocked.x = x; blocked.z = z; }
    return false;
  };
  for (const [part, reverse] of [[p, 0], [p.rev, Math.PI]] as const) {
    if (!part) continue;
    for (let k = 0; k < part.n; k++) {
      const prev = Math.max(0, k - 1), steps = Math.max(1, Math.ceil(part.ds));
      const h0 = part.hdg[prev], dh = Math.atan2(Math.sin(part.hdg[k] - h0), Math.cos(part.hdg[k] - h0));
      for (let j = 1; j <= steps; j++) {
        const u = j / steps;
        if (!clear(part.pts[prev * 2] + (part.pts[k * 2] - part.pts[prev * 2]) * u, part.pts[prev * 2 + 1] + (part.pts[k * 2 + 1] - part.pts[prev * 2 + 1]) * u, h0 + dh * u + reverse)) return false;
      }
    }
  }
  for (const w of [p.w0, p.w1 && new Float32Array([p.pts[(p.n - 1) * 2], p.pts[(p.n - 1) * 2 + 1], p.w1[0], p.w1[1], p.w1[2]])]) {
    if (!w) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(w[2], w[3])));
    for (let k = 0; k <= steps; k++) if (!clear(w[0] + w[2] * k / steps, w[1] + w[3] * k / steps, w[4])) return false;
  }
  return true;
}

/**
 * The path of a plan leg on layout L, whose slots past `baseSlots` are the plan's rafts. `loop`: 0, or 1 +
 * the loop variant the leg sails (plan.segLoop: an outing's loop, or a scenic leg's offshore loop). `bad`:
 * any route whose hull would touch land or a deck after repair is rejected. A pure function of (layout, rafts, leg): sim/warm-legs workers build the same.
 */
export function buildPlanLegPath(L: SimLayout, baseSlots: number, fromSlot: number, toSlot: number, cls: HullClass, loop: number): { path: PathRec; bad: boolean } {
  const loa = L.loa[cls], beam = L.beam[cls];
  // from a slot back to itself: a harbour outing's loop
  const out = fromSlot === toSlot && loop ? buildOutingPath(L, fromSlot, cls, loop - 1) : null;
  // a scenic leg by the departure gate's offshore loop (one that would touch land or a deck sails the plain leg)
  // (nor one whose loop runs through the plan's overflow rafts)
  const scenic = loop > 0 && fromSlot !== toSlot && scenicClearOf(L, fromSlot, toSlot, loop - 1, L.slots.slice(baseSlots).filter((s) => s.kind === "raft"), RAFT_CLEAR);
  let sc = scenic ? buildScenicPath(L, fromSlot, toSlot, cls, loop - 1) : null;
  if (sc && !pathClear(L, sc, loa, beam)) sc = null;
  const path = out ?? sc ?? buildLegPath(L, fromSlot, toSlot, cls);
  path.setFrom = sailSetAt(L.slots[fromSlot]); path.setTo = sailSetAt(L.slots[toSlot]);
  return { path, bad: !pathClear(L, path, loa, beam) };
}

/** Sails are furled only when docked (berth, pontoon): at a swinging mooring or in a raft she lies with them set. */
export function sailSetAt(s: Slot | undefined): boolean {
  return s?.mode === "swing" || s?.mode === "raft";
}

/** Canonical request selection, shared by playback and the allocation-only worker. */
export function planPathRequests(plans: Iterable<BoatPlan>, nowMs: number, hasPath: (key: string) => boolean): { now: PathRequest[]; soon: PathRequest[] } {
  const t = nowMs / 1000, now = new Map<string, PathRequest>(), soon = new Map<string, PathRequest>();
  const want = (m: Map<string, PathRequest>, plan: BoatPlan, seg: number) => {
    const k = pathKey(plan.segFrom[seg], plan.segSlot[seg], plan.cls, plan.segLoop[seg]);
    if (!hasPath(k) && !now.has(k)) m.set(k, [plan.segFrom[seg], plan.segSlot[seg], plan.cls, plan.segLoop[seg]]);
  };
  for (const plan of plans) {
    if (plan.kind === "none" || (plan.kind === "static" && !plan.outing)) continue;
    const nSeg = plan.segStart.length, u = boatLocalTime(plan, t), c = findSegment(plan, u);
    if (plan.segKind[c] !== SEG_DOCK) { want(now, plan, c); continue; }
    if (nSeg < 2) continue;
    const into = u - plan.segStart[c], toEnd = plan.segEnd[c] - u, cap = 0.25 * (plan.segEnd[c] - plan.segStart[c]);
    if (into < cap) want(now, plan, (c - 1 + nSeg) % nSeg);
    else if (toEnd < cap) want(now, plan, (c + 1) % nSeg);
    if (toEnd < PREFETCH_S) want(soon, plan, (c + 1) % nSeg);
  }
  for (const k of now.keys()) soon.delete(k);
  return { now: [...now.values()], soon: [...soon.values()] };
}
