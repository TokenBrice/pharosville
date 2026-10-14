/**
 * HarbourSim: boat poses at wall-clock time t.
 *
 * Normal sailing is a pure function of (model, layout, UTC): the static Plan (plan.ts) says where
 * every hull is at every second of the 4-hour cycle, so every viewer sees the same harbour. On top
 * of it, one-off voyages play only for real snapshot diffs (depeg → Shoals, recovery → resume,
 * new coin → Slipway launch, death → tow to Wreck Cove, portfolio change → re-route) and for
 * stale data (finish the leg, then hold). poseAt() writes preallocated typed arrays: no per-frame
 * allocation.
 */
import type { HarbourLayout, HullClass } from "../layout/types";
import { u01 } from "../model/classify";
import type { HarbourModel } from "../model/types";
import { buildSimLayout, nearestNode, PREVAILING_WIND_FROM, type SimLayout, type Slot } from "./layout-graph";
import { buildLegPath, legControlPoints } from "./routes";
import { buildPath, evalLeg, IO_LOA, IO_T, legTiming, LEG_APPROACH, LEG_CAST_OFF, LEG_TURN, type LegTiming, type PathRec } from "./path";
import { boatLocalTime, buildPlan, warmLegTimes, CYCLE_S, findSegment, MANOEUVRE_S, SEG_DOCK, SPEED, type BoatPlan, type Plan } from "./plan";

export const PHASES = ["docked", "casting-off", "sailing", "approaching", "moored", "anchored"] as const;
export type Phase = (typeof PHASES)[number];
export const PH_DOCKED = 0, PH_CASTING_OFF = 1, PH_SAILING = 2, PH_APPROACHING = 3, PH_MOORED = 4, PH_ANCHORED = 5;

/** Why a hull is on a one-off voyage (0 = following the plan). */
export const EV_NONE = 0, EV_TO_SHOALS = 1, EV_REJOIN = 2, EV_LAUNCH = 3, EV_TOW = 4, EV_STALE = 5;

export interface PoseBuffer {
  count: number;
  /** Boat ids in model.boats order (index i ↔ model.boats[i]). */
  ids: readonly string[];
  /** x, y, z per boat (y = sea level; the renderer adds swell). */
  position: Float32Array;
  heading: Float32Array;
  heel: Float32Array;
  /** 0 = furled … 1 = set. */
  sailState: Float32Array;
  /** m/s along the path. */
  speed: Float32Array;
  /** Index into PHASES. */
  phase: Uint8Array;
  /** Slot (berth/mooring/raft/shoals/wreck) index while at one, else the destination; -1 none. */
  slot: Int32Array;
  /** EV_* code of the voyage being sailed. */
  event: Uint8Array;
}

const MODE_PLAN = 0, MODE_VOYAGE = 1, MODE_HOLD = 2;
const END_HOLD = 0, END_PLAN = 1;
const SETTLE_S = 25;
const PREFETCH_S = 240;
const SHOALS_RING = 14;

interface Voyage {
  path: PathRec;
  tm: LegTiming;
  t0: number;
  D: number;
  endSlot: number;
  endMode: number;
  endPhase: number;
  kind: number;
  startHeading: number;
}

interface BoatRt {
  id: string;
  cls: HullClass;
  loa: number;
  plan: BoatPlan;
  mode: number;
  cursor: number;
  legSeg: number;
  legPath: PathRec | null;
  legTm: LegTiming;
  /** The current leg casts off this much before its slot in the plan / arrives this much after. */
  legEarly: number;
  legLate: number;
  /** Last evaluated leg-local time and the leg's effective duration (for stale freezes). */
  legLocal: number;
  legD: number;
  /** Next leg already queued for look-ahead path building. */
  prefetchSeg: number;
  voyage: Voyage | null;
  holdSlot: number;
  holdPhase: number;
  heelBase: number;
  lag: number;
  phi: number;
  shoals: boolean;
  wrecked: boolean;
}

const newTiming = (): LegTiming => ({ tAstern: 0, tTurn: 0, s0: 0, lf: 0, aD: 0, dD: 0, v: 0, t1: 0, t3: 0, tf: 0, h0: 0, turn: 0, hEnd: 0 } as LegTiming);

export interface SimStats {
  underWay: number;
  docked: number;
  moored: number;
  anchored: number;
  voyages: number;
  overflow: number;
}

export class HarbourSim {
  readonly layout: SimLayout;
  plan!: Plan;
  model!: HarbourModel;
  readonly pose: PoseBuffer;
  /** Wind the hulls lie to: bow heading into the wind (radians) and 0..1 strength (DEWS weather). */
  readonly wind = { fromRad: PREVAILING_WIND_FROM, strength: 0.35 };
  readonly stats: SimStats = { underWay: 0, docked: 0, moored: 0, anchored: 0, voyages: 0, overflow: 0 };
  frozen = false;

  private rt: BoatRt[] = [];
  private index = new Map<string, number>();
  private pathCache = new Map<string, PathRec>();
  /** Next-leg paths to build ahead of time, one per frame, so a cast-off never pays for its path. */
  private prefetch: Array<[number, number, number]> = [];
  private prefetchKeys = new Set<string>();
  private builtThisFrame = 0;
  private shoalsOf = new Map<string, number>();
  private wreckOf = new Map<string, number>();
  /** Slots authored by the layout; rafts and extra anchorages are appended after them. */
  private baseSlots = 0;
  private posed = false;
  private readonly tmp = new Float64Array(12);
  /** Hot-path doubles live in fields, not arguments: a double passed to a non-inlined call is boxed. */
  private t = 0;
  private blend = 1;
  private legT = 0;

  constructor(model: HarbourModel, layout: HarbourLayout, nowMs = Date.now()) {
    this.layout = buildSimLayout(layout);
    this.baseSlots = this.layout.slots.length;
    this.wind.fromRad = this.layout.windFrom;
    // no data yet (boot): spend the wait building leg times, so the first real plan is quick
    if (!model.hasFleet) warmLegTimes(this.layout);
    this.pose = { count: 0, ids: [], position: new Float32Array(0), heading: new Float32Array(0), heel: new Float32Array(0), sailState: new Float32Array(0), speed: new Float32Array(0), phase: new Uint8Array(0), slot: new Int32Array(0), event: new Uint8Array(0) };
    this.install(model, nowMs, true);
  }

  indexOf(id: string): number { return this.index.get(id) ?? -1; }
  slotOf(i: number): Slot | null { const s = this.pose.slot[i]; return s >= 0 ? this.layout.slots[s] ?? null : null; }
  berthId(i: number): string | null { return this.slotOf(i)?.id ?? null; }

  /** New snapshot. Diffs against the previous model start one-off voyages; first load never does. */
  setModel(model: HarbourModel, nowMs: number): void {
    this.install(model, nowMs, false);
  }

  /** Data freshness switch (also driven by model.truth.stablecoins in setModel). */
  setStale(stale: boolean, nowMs: number): void {
    const t = nowMs / 1000;
    if (stale === this.frozen) return;
    this.poseAt(nowMs);
    if (stale) this.freeze(t); else this.unfreeze(t);
  }

  // ------------------------------------------------------------------ model install & diffs

  private install(model: HarbourModel, nowMs: number, first: boolean): void {
    const t = nowMs / 1000;
    const prev = this.model;
    const prevRt = this.rt;
    const prevIndex = this.index;
    if (!first && this.posed) this.poseAt(nowMs); // current poses under the old model
    const oldPose = first ? null : this.snapshotPose();

    const replan = first || !this.plan || this.plan.key !== model.planKey;
    this.model = model;
    if (replan) {
      // drop rafts and extra anchorages made for the previous plan (and forget who was on them)
      this.layout.slots.length = this.baseSlots;
      for (const m of [this.shoalsOf, this.wreckOf]) for (const [id, sl] of [...m]) if (sl >= this.baseSlots) m.delete(id);
      this.plan = buildPlan(model, this.layout);
      this.pathCache.clear();
      this.prefetch.length = 0; this.prefetchKeys.clear();
    }
    this.stats.overflow = this.plan.stats.overflow;
    const w = model.readings.weather.wind;
    this.wind.strength = w == null ? 0.35 : w;

    const n = model.boats.length;
    this.index = new Map(model.boats.map((b, i) => [b.id, i]));
    this.rt = model.boats.map((b, i) => {
      const old = prevIndex.get(b.id);
      const o = old != null ? prevRt[old] : null;
      const plan = this.plan.boats[i];
      // a voyage under way survives a re-plan if it is bound for an authored slot (not a raft)
      const keepVoyage = o?.voyage && (!replan || o.voyage.endSlot < this.baseSlots) ? o.voyage : null;
      return {
        id: b.id, cls: b.hullClass, loa: this.layout.loa[b.hullClass], plan,
        mode: keepVoyage ? MODE_VOYAGE : o && !replan ? o.mode : MODE_PLAN, cursor: 0, legSeg: -1, legPath: null, legTm: newTiming(), legEarly: 0.5, legLate: 0.5, legLocal: 0.5, legD: 0.5, // doubles from the start: keeps the fields unboxed
        prefetchSeg: -1,
        voyage: keepVoyage, holdSlot: o && !replan ? o.holdSlot : -1, holdPhase: o && !replan ? o.holdPhase : PH_DOCKED,
        heelBase: Math.min(0.35, 0.05 * Math.log(1 + Math.abs(b.pegDeviationBps ?? 0) / 25)), lag: u01(b.id + "#lag") * 40, phi: u01(b.id + "#phi") * Math.PI * 2,
        shoals: b.state === "shoals", wrecked: b.state === "wrecked",
      };
    });
    this.resizePose(n);
    this.assignShoalsAndWrecks();

    const stale = model.truth.stablecoins.state !== "current" && model.hasFleet;
    if (first || !prev || !prev.hasFleet) {
      // first load: everything simply is where it is; no events replay
      for (let i = 0; i < n; i++) this.placeStatic(i);
      this.frozen = false;
      if (stale) { this.poseAt(nowMs); this.freeze(t); }
      return;
    }

    const prevById = new Map(prev.boats.map((b) => [b.id, b]));
    for (let i = 0; i < n; i++) {
      const b = model.boats[i];
      const r = this.rt[i];
      const pb = prevById.get(b.id);
      const at = oldPose?.get(b.id) ?? null;
      if (r.wrecked) {
        if (pb && pb.state !== "wrecked" && at) this.voyageTo(i, t, at, this.wreckOf.get(b.id)!, EV_TOW, END_HOLD, PH_ANCHORED, null);
        else this.placeStatic(i);
        continue;
      }
      if (!pb) {
        if (this.layout.launchPath && !r.shoals) this.launch(i, t);
        else this.placeStatic(i);
        continue;
      }
      if (r.shoals) {
        if (pb.state !== "shoals" && at) this.voyageTo(i, t, at, this.shoalsOf.get(b.id)!, EV_TO_SHOALS, END_HOLD, PH_ANCHORED, null);
        else if (!r.voyage && (!at || replan)) this.placeStatic(i);
        continue;
      }
      if (pb.state === "shoals" || pb.state === "wrecked") { if (at) this.rejoin(i, t, at); else this.placeStatic(i); continue; }
      if (replan && at && !r.voyage) this.resyncFrom(i, t, at);
    }
    if (replan && this.frozen) { this.frozen = false; this.poseAt(nowMs); this.freeze(t); }
    else if (stale && !this.frozen) { this.poseAt(nowMs); this.freeze(t); }
    else if (!stale && this.frozen) { this.poseAt(nowMs); this.unfreeze(t); }
  }

  private resizePose(n: number): void {
    const p = this.pose;
    p.count = n;
    p.ids = this.model.boats.map((b) => b.id);
    if (p.heading.length !== n) {
      p.position = new Float32Array(n * 3); p.heading = new Float32Array(n); p.heel = new Float32Array(n);
      p.sailState = new Float32Array(n); p.speed = new Float32Array(n); p.phase = new Uint8Array(n);
      p.slot = new Int32Array(n).fill(-1); p.event = new Uint8Array(n);
    }
  }

  private snapshotPose(): Map<string, { x: number; z: number; h: number; slot: number; phase: number; moving: boolean }> {
    const m = new Map<string, { x: number; z: number; h: number; slot: number; phase: number; moving: boolean }>();
    const p = this.pose;
    for (let i = 0; i < p.count; i++) {
      const ph = p.phase[i];
      m.set(p.ids[i], { x: p.position[i * 3], z: p.position[i * 3 + 2], h: p.heading[i], slot: p.slot[i], phase: ph, moving: ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING });
    }
    return m;
  }

  /** Shoals berths by supply (biggest nearest the reef's heart); wreck slots by id. */
  private assignShoalsAndWrecks(): void {
    const L = this.layout;
    const keep = new Map<string, number>();
    const used = new Set<number>();
    for (const r of this.rt) if (r.shoals && this.shoalsOf.has(r.id)) { const s = this.shoalsOf.get(r.id)!; keep.set(r.id, s); used.add(s); }
    const free = L.shoals.filter((s) => !used.has(s));
    for (const r of this.rt) {
      if (!r.shoals || keep.has(r.id)) continue;
      let s = free.shift();
      if (s == null) s = this.ringSlot("shoals", keep.size);
      keep.set(r.id, s); used.add(s);
    }
    this.shoalsOf = keep;
    const wk = new Map<string, number>();
    const usedW = new Set<number>();
    for (const r of this.rt) {
      if (!r.wrecked) continue;
      let s = L.wrecks.find((w) => !usedW.has(w) && L.slots[w].id.startsWith(r.id));
      if (s == null) s = this.ringSlot("wreck", wk.size);
      wk.set(r.id, s); usedW.add(s);
    }
    this.wreckOf = wk;
  }

  /** Extra anchorage around a zone's centroid when its authored slots run out. */
  private ringSlot(zone: "shoals" | "wreck", k: number): number {
    const L = this.layout;
    const src = zone === "shoals" ? L.shoals : L.wrecks;
    let cx = 0, cz = 0;
    for (const s of src) { cx += L.slots[s].x; cz += L.slots[s].z; }
    if (src.length) { cx /= src.length; cz /= src.length; }
    const a = k * 2.399963, r = SHOALS_RING + 6 * Math.sqrt(k + 1);
    const node = nearestNode(L.graph, cx, cz);
    const slot: Slot = {
      index: L.slots.length, id: `${zone}/extra/${k + 1}`, where: zone, cls: "medium", kind: zone === "shoals" ? "shoals" : "wreck",
      x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, heading: L.windFrom, swing: zone === "shoals" ? 3 : 0, inNode: node, outNode: node,
      approach: node >= 0 ? [[L.graph.x[node], L.graph.z[node]], [cx + Math.cos(a) * r, cz + Math.sin(a) * r]] : [[cx, cz]], astern: false,
    };
    L.slots.push(slot);
    return slot.index;
  }

  /** No voyage: the hull is wherever its state says right now. */
  private placeStatic(i: number): void {
    const r = this.rt[i];
    r.voyage = null;
    if (r.wrecked) { r.mode = MODE_HOLD; r.holdSlot = this.wreckOf.get(r.id)!; r.holdPhase = PH_ANCHORED; return; }
    if (r.shoals) { r.mode = MODE_HOLD; r.holdSlot = this.shoalsOf.get(r.id)!; r.holdPhase = PH_ANCHORED; return; }
    r.mode = r.plan.kind === "none" ? MODE_HOLD : MODE_PLAN;
  }

  // ------------------------------------------------------------------ voyages

  private legPathFor(fromSlot: number, toSlot: number, r: BoatRt): PathRec {
    const key = fromSlot + ">" + toSlot + ">" + r.cls;
    let p = this.pathCache.get(key);
    if (!p) {
      this.builtThisFrame++;
      p = buildLegPath(this.layout, fromSlot, toSlot, r.cls);
      if (this.pathCache.size > 1500) this.pathCache.delete(this.pathCache.keys().next().value!);
      this.pathCache.set(key, p);
    }
    return p;
  }

  private voyageTo(i: number, t: number, at: { x: number; z: number; h: number; slot: number; moving: boolean }, toSlot: number, kind: number, endMode: number, endPhase: number, arriveAt: number | null): void {
    const r = this.rt[i];
    const L = this.layout;
    const from = !at.moving && at.slot >= 0 ? L.slots[at.slot] : null;
    const { pts, astern, tail } = legControlPoints(L, from, at, L.slots[toSlot], r.loa);
    if (from) pts[0] = [at.x, at.z];
    const path = buildPath(pts, r.loa, astern ? r.loa * 1.3 : 0, tail, L.field, L.beam[r.cls]);
    const nominal = path.length / SPEED[r.cls] + (astern ? MANOEUVRE_S : 15) * (kind === EV_TOW ? 1.6 : 1);
    const speedK = kind === EV_TOW ? 0.55 : 1;
    let D = nominal / speedK;
    if (arriveAt != null) D = Math.max(path.length / (SPEED[r.cls] * 1.5) + (astern ? MANOEUVRE_S : 15), arriveAt - t);
    const tm = legTiming(path, D, r.loa, newTiming(), from ? (from.swing > 0 ? at.h : from.heading) : at.h, L.slots[toSlot].heading);
    r.voyage = { path, tm, t0: t, D, endSlot: toSlot, endMode, endPhase, kind, startHeading: at.h };
    r.mode = MODE_VOYAGE;
  }

  /** Back into the plan at its next dock window that a voyage from here can still make. */
  private rejoin(i: number, t: number, at: { x: number; z: number; h: number; slot: number; moving: boolean }): void {
    const r = this.rt[i];
    const p = r.plan;
    if (p.kind === "none") { this.placeStatic(i); return; }
    if (this.frozen) { this.voyageTo(i, t, at, this.freeSlotNear(p.staticSlot >= 0 ? p.staticSlot : p.segSlot[0], r), EV_REJOIN, END_HOLD, PH_DOCKED, null); return; }
    if (p.kind === "static") { this.voyageTo(i, t, at, p.staticSlot, EV_REJOIN, END_PLAN, PH_DOCKED, null); return; }
    const u = boatLocalTime(p, t);
    const nSeg = p.segStart.length;
    let k = findSegment(p, u);
    const L = this.layout;
    for (let tries = 0; tries < nSeg; tries++, k = (k + 1) % nSeg) {
      if (p.segKind[k] !== SEG_DOCK) continue;
      // global time of this window, unwrapped to be ≥ now - one cycle
      let start = t + (p.segStart[k] - u), end = t + (p.segEnd[k] - u);
      if (end < t) { start += CYCLE_S; end += CYCLE_S; }
      const slot = L.slots[p.segSlot[k]];
      const dist = Math.hypot(slot.x - at.x, slot.z - at.z) * 1.4 + 60;
      const minD = dist / SPEED[r.cls] + MANOEUVRE_S;
      if (end - 45 < t + minD) continue;
      this.voyageTo(i, t, at, p.segSlot[k], EV_REJOIN, END_PLAN, PH_DOCKED, Math.max(start, t + minD));
      return;
    }
    this.placeStatic(i);
  }

  private launch(i: number, t: number): void {
    const lp = this.layout.launchPath!;
    const a = lp[0], b = lp[1];
    const h = Math.atan2(b[0] - a[0], b[1] - a[1]);
    this.rejoin(i, t, { x: a[0], z: a[1], h, slot: -1, moving: true });
    const v = this.rt[i].voyage;
    if (v) v.kind = EV_LAUNCH;
  }

  /** After a re-plan: hulls whose planned place changed sail there; the rest just carry on. */
  private resyncFrom(i: number, t: number, at: { x: number; z: number; h: number; slot: number; moving: boolean }): void {
    const r = this.rt[i];
    r.mode = MODE_PLAN; r.voyage = null;
    this.t = t;
    this.evalBoat(i);
    const p = this.pose;
    const same = !at.moving && p.slot[i] === at.slot && (p.phase[i] === PH_DOCKED || p.phase[i] === PH_MOORED);
    const close = Math.hypot(p.position[i * 3] - at.x, p.position[i * 3 + 2] - at.z) < 1.5;
    if (same || close) return;
    this.rejoin(i, t, at);
  }

  // ------------------------------------------------------------------ stale data

  private freeSlotNear(slotIdx: number, r: BoatRt, taken?: Set<number>): number {
    const L = this.layout;
    const want = L.slots[slotIdx];
    const held = taken ?? this.heldSlots();
    if (!held.has(slotIdx)) return slotIdx;
    const pool = L.pools.get(want.where);
    for (const list of pool ? [pool.get(r.cls) ?? [], ...[...pool.values()]] : []) for (const s of list) if (!held.has(s)) return s;
    return slotIdx;
  }

  private heldSlots(): Set<number> {
    const s = new Set<number>();
    for (const r of this.rt) {
      if (r.mode === MODE_HOLD && r.holdSlot >= 0) s.add(r.holdSlot);
      else if (r.mode === MODE_VOYAGE && r.voyage && r.voyage.endMode === END_HOLD) s.add(r.voyage.endSlot);
    }
    return s;
  }

  /** Stale: nobody casts off; hulls under way finish their leg (or divert to a free berth) and hold. */
  private freeze(t: number): void {
    this.frozen = true;
    const p = this.pose;
    const held = new Set<number>();
    const moving: number[] = [];
    for (let i = 0; i < this.rt.length; i++) {
      const r = this.rt[i];
      if (r.mode === MODE_HOLD) { if (r.holdSlot >= 0) held.add(r.holdSlot); continue; }
      if (r.mode === MODE_PLAN) {
        const ph = p.phase[i];
        if (ph === PH_DOCKED || ph === PH_MOORED || ph === PH_ANCHORED) { r.mode = MODE_HOLD; r.holdSlot = p.slot[i]; r.holdPhase = ph; held.add(p.slot[i]); continue; }
      }
      moving.push(i);
    }
    for (const i of moving) {
      const r = this.rt[i];
      if (r.mode === MODE_VOYAGE && r.voyage) {
        if (r.voyage.endMode === END_HOLD) { held.add(r.voyage.endSlot); continue; }
        if (!held.has(r.voyage.endSlot)) { r.voyage.endMode = END_HOLD; held.add(r.voyage.endSlot); continue; }
      }
      // under way on a plan leg: keep sailing it if its berth is free, else divert
      const dest = p.slot[i];
      if (r.mode === MODE_PLAN && r.legPath && dest >= 0 && !held.has(dest)) {
        const tm = { ...r.legTm };
        r.voyage = { path: r.legPath, tm, t0: t - r.legLocal, D: r.legD, endSlot: dest, endMode: END_HOLD, endPhase: PH_DOCKED, kind: EV_STALE, startHeading: 0 };
        r.mode = MODE_VOYAGE;
        held.add(dest);
        continue;
      }
      const target = this.freeSlotNear(dest >= 0 ? dest : (r.plan.staticSlot >= 0 ? r.plan.staticSlot : r.plan.segSlot[0] ?? 0), r, held);
      held.add(target);
      this.voyageTo(i, t, { x: p.position[i * 3], z: p.position[i * 3 + 2], h: p.heading[i], slot: -1, moving: true }, target, EV_STALE, END_HOLD, PH_ANCHORED, null);
    }
  }

  private unfreeze(t: number): void {
    this.frozen = false;
    const at = this.snapshotPose();
    for (let i = 0; i < this.rt.length; i++) {
      const r = this.rt[i];
      if (r.shoals || r.wrecked || r.plan.kind === "none") continue;
      if (r.mode === MODE_VOYAGE && r.voyage) { r.voyage.endMode = END_PLAN; continue; }
      if (r.mode === MODE_HOLD) this.resyncFrom(i, t, at.get(r.id)!);
    }
  }

  // ------------------------------------------------------------------ poses

  /** Bow heading for a hull lying to wind at a swinging slot, written to tmp[10] (no boxed return). */
  private swingHeading(r: BoatRt): void {
    const t = this.t, tt = t - r.lag;
    // every period divides the 6 h cycle, so the whole harbour repeats exactly
    this.tmp[10] = this.layout.windFrom + 0.3 * Math.sin((2 * Math.PI * tt) / 1440 + 0.7) + 0.12 * Math.sin((2 * Math.PI * tt) / 432)
      + 0.07 * Math.sin((2 * Math.PI * t) / 30 + r.phi);
  }

  /** Rest pose; this.blend (0..1) blends from the nominal (path end) pose to the swinging pose. */
  private restPose(i: number, r: BoatRt, s: Slot, phase: number): void {
    const p = this.pose, t = this.t, w = this.blend;
    let x = s.x, z = s.z, h = s.heading;
    if (s.swing > 0) {
      this.swingHeading(r);
      let d = (this.tmp[10] - s.heading + Math.PI) % (2 * Math.PI); // wrapAngle, inlined
      if (d < 0) d += 2 * Math.PI;
      const hh = s.heading + (d - Math.PI) * w;
      x = s.x - Math.sin(hh) * s.swing; z = s.z - Math.cos(hh) * s.swing; h = hh;
    }
    p.position[i * 3] = x; p.position[i * 3 + 1] = 0; p.position[i * 3 + 2] = z;
    p.heading[i] = h; p.speed[i] = 0; p.sailState[i] = 0;
    p.phase[i] = phase === PH_DOCKED && s.swing > 0 ? (s.kind === "shoals" ? PH_ANCHORED : PH_MOORED) : phase;
    p.slot[i] = s.index;
    let heel = 0;
    if (r.shoals && s.kind === "shoals") {
      heel = r.heelBase + 0.02 * Math.sin((2 * Math.PI * t) / 9 + r.phi);
    } else if (r.wrecked) heel = 0.32;
    p.heel[i] = heel;
  }

  /** Leg pose at leg-local time this.legT. */
  private writeLeg(i: number, r: BoatRt, path: PathRec, tm: LegTiming, dest: number): void {
    const o = this.tmp;
    o[IO_T] = this.legT; o[IO_LOA] = r.loa;
    evalLeg(path, tm, o);
    const p = this.pose;
    p.position[i * 3] = o[0]; p.position[i * 3 + 1] = 0; p.position[i * 3 + 2] = o[1];
    p.heading[i] = o[2]; p.speed[i] = o[3]; p.sailState[i] = o[4];
    const code = o[5];
    p.phase[i] = code === LEG_CAST_OFF || code === LEG_TURN ? PH_CASTING_OFF : code === LEG_APPROACH ? PH_APPROACHING : PH_SAILING;
    p.slot[i] = dest;
    // heel to leeward with the sail drawing (decorative; wind strength follows DEWS weather)
    const side = Math.sin(this.wind.fromRad - o[2]) >= 0 ? 1 : -1;
    p.heel[i] = side * o[4] * (0.04 + 0.08 * this.wind.strength);
  }

  private evalBoat(i: number): void {
    const t = this.t;
    const r = this.rt[i];
    const p = this.pose;
    const L = this.layout;
    p.event[i] = EV_NONE;
    if (r.mode === MODE_VOYAGE && r.voyage) {
      const v = r.voyage;
      const tl = t - v.t0;
      if (tl < v.D) { this.legT = tl; this.writeLeg(i, r, v.path, v.tm, v.endSlot); p.event[i] = v.kind; return; }
      r.voyage = null;
      if (v.endMode === END_HOLD || this.frozen) { r.mode = MODE_HOLD; r.holdSlot = v.endSlot; r.holdPhase = v.endPhase; }
      else {
        r.mode = MODE_PLAN;
        this.evalBoat(i);
        if (p.slot[i] !== v.endSlot || (p.phase[i] !== PH_DOCKED && p.phase[i] !== PH_MOORED && p.phase[i] !== PH_ANCHORED)) {
          // the window moved on while we sailed: resync from where the voyage ended
          const s = L.slots[v.endSlot];
          r.mode = MODE_HOLD; r.holdSlot = v.endSlot; r.holdPhase = PH_DOCKED;
          this.blend = 0;
          this.restPose(i, r, s, PH_DOCKED);
          this.rejoin(i, t, { x: p.position[i * 3], z: p.position[i * 3 + 2], h: p.heading[i], slot: v.endSlot, moving: false });
        }
        return;
      }
    }
    if (r.mode === MODE_HOLD) {
      if (r.holdSlot < 0) { p.speed[i] = 0; p.sailState[i] = 0; p.phase[i] = PH_ANCHORED; return; }
      this.blend = 1;
      this.restPose(i, r, L.slots[r.holdSlot], r.holdPhase);
      return;
    }
    // MODE_PLAN
    const plan = r.plan;
    if (plan.kind === "static") { this.blend = 1; this.restPose(i, r, L.slots[plan.staticSlot], PH_DOCKED); return; }
    if (plan.kind === "none") { p.speed[i] = 0; p.phase[i] = PH_ANCHORED; p.slot[i] = -1; return; }
    const g = ((t % CYCLE_S) + CYCLE_S) % CYCLE_S;
    const u = (g + plan.offset) % CYCLE_S; // boatLocalTime, inlined
    let c = r.cursor;
    if (!(plan.segStart[c] <= u && u < plan.segEnd[c])) {
      const nx = (c + 1) % plan.segStart.length;
      c = plan.segStart[nx] <= u && u < plan.segEnd[nx] ? nx : findSegment(plan, u);
      r.cursor = c;
    }
    const nSeg = plan.segStart.length;
    if (plan.segKind[c] === SEG_DOCK) {
      const s = L.slots[plan.segSlot[c]];
      const into = u - plan.segStart[c], toEnd = plan.segEnd[c] - u;
      const cap = 0.25 * (plan.segEnd[c] - plan.segStart[c]);
      if (nSeg > 1) {
        const prv = (c - 1 + nSeg) % nSeg, nxt = (c + 1) % nSeg;
        // a long leg may arrive a little after its window opens, or cast off a little before it closes
        if (into < cap) {
          this.ensureLeg(r, prv);
          if (into < r.legLate) { this.legT = plan.segEnd[prv] - plan.segStart[prv] + r.legEarly + into; this.planLeg(i, r, prv); return; }
        } else if (toEnd < cap) {
          this.ensureLeg(r, nxt);
          if (toEnd < r.legEarly) { this.legT = r.legEarly - toEnd; this.planLeg(i, r, nxt); return; }
        }
      }
      if (toEnd < PREFETCH_S && nSeg > 1 && r.prefetchSeg !== (c + 1) % nSeg) {
        const nxt = (c + 1) % nSeg, key = plan.segFrom[nxt] + ">" + plan.segSlot[nxt] + ">" + r.cls;
        r.prefetchSeg = nxt;
        if (!this.pathCache.has(key) && !this.prefetchKeys.has(key)) { this.prefetchKeys.add(key); this.prefetch.push([i, plan.segFrom[nxt], plan.segSlot[nxt]]); }
      }
      const lateOff = r.legSeg === (c - 1 + nSeg) % nSeg ? r.legLate : 0, earlyOff = r.legSeg === (c + 1) % nSeg ? r.legEarly : 0;
      const w = s.swing > 0 ? Math.min(1, Math.max(0, Math.min(into - lateOff, toEnd - earlyOff)) / SETTLE_S) : 1;
      this.blend = w * w * (3 - 2 * w);
      this.restPose(i, r, s, PH_DOCKED);
      return;
    }
    this.ensureLeg(r, c);
    this.legT = u - plan.segStart[c] + r.legEarly;
    this.planLeg(i, r, c);
  }

  /**
   * Path + timing for plan leg `seg`. When the path needs longer than the plan allows at a sane top
   * speed (~1.3× class speed), the leg borrows up to a quarter of each neighbouring dock window:
   * berths stay reserved, dwell barely moves, and nobody races.
   */
  private ensureLeg(r: BoatRt, seg: number): void {
    if (r.legSeg === seg && r.legPath) return;
    const L = this.layout, plan = r.plan, nSeg = plan.segStart.length;
    const path = this.legPathFor(plan.segFrom[seg], plan.segSlot[seg], r);
    const from = L.slots[plan.segFrom[seg]], to = L.slots[plan.segSlot[seg]];
    const D = plan.segEnd[seg] - plan.segStart[seg];
    const tm = legTiming(path, 1e9, r.loa, r.legTm, from.heading, to.heading);
    const need = tm.tAstern + tm.tTurn + (tm.lf + tm.aD + tm.dD) / (SPEED[r.cls] * 1.3);
    const extra = Math.max(0, need - D);
    const pd = (seg - 1 + nSeg) % nSeg, nd = (seg + 1) % nSeg;
    const capE = 0.25 * (plan.segEnd[pd] - plan.segStart[pd]), capL = 0.25 * (plan.segEnd[nd] - plan.segStart[nd]);
    const late = Math.min(capL, extra / 2);
    const early = Math.min(capE, extra - late);
    r.legEarly = early; r.legLate = Math.min(capL, extra - early);
    r.legD = D + r.legEarly + r.legLate;
    legTiming(path, r.legD, r.loa, r.legTm, from.heading, to.heading);
    r.legPath = path; r.legSeg = seg;
  }

  private planLeg(i: number, r: BoatRt, seg: number): void {
    r.legLocal = this.legT;
    this.writeLeg(i, r, r.legPath!, r.legTm, r.plan.segSlot[seg]);
  }

  /** Poses for every boat at wall-clock nowMs. Returns the shared buffer (overwritten each call). */
  poseAt(nowMs: number): PoseBuffer {
    const t = nowMs / 1000;
    const n = this.rt.length;
    const st = this.stats;
    this.builtThisFrame = 0;
    st.underWay = 0; st.docked = 0; st.moored = 0; st.anchored = 0; st.voyages = 0;
    this.t = t;
    for (let i = 0; i < n; i++) {
      this.evalBoat(i);
      const ph = this.pose.phase[i];
      if (ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING) st.underWay++;
      else if (ph === PH_DOCKED) st.docked++;
      else if (ph === PH_MOORED) st.moored++;
      else st.anchored++;
      if (this.pose.event[i] !== EV_NONE) st.voyages++;
    }
    // at most one look-ahead path per frame, and none on a frame that already built one
    while (this.builtThisFrame === 0 && this.prefetch.length) {
      const [bi, from, to] = this.prefetch.shift()!;
      const r = this.rt[bi];
      this.prefetchKeys.delete(from + ">" + to + ">" + (r?.cls ?? ""));
      if (r && from < this.layout.slots.length && to < this.layout.slots.length) this.legPathFor(from, to, r);
    }
    this.posed = true;
    return this.pose;
  }
}
