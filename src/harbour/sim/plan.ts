/**
 * The sailing plan: a static, conflict-free timetable for every hull over one CYCLE (6 h, aligned to
 * UTC midnight). Every period divides the cycle, so the whole harbour repeats exactly every 6 h and
 * berth allocation is a one-off circular-arc colouring at build time: no history, no per-frame
 * search, and the same answer for every viewer. Dock time at each stop = its supply share (D10).
 */
import { u01 } from "../model/classify";
import type { Boat, HarbourModel, HullClass } from "../model/types";
import { addRaftSlot, CLASS_ORDER, type SimLayout } from "./layout-graph";
import { ACCEL, cruiseSpeed, legTiming, newLegTiming } from "./path";
import { OFFSHORE_VARIANTS, outingMetres, outingTrack, outingVariants, scenicExtraMetres, trackClearOf } from "./outings";
import { buildLegPath } from "./routes";

export const CYCLE_S = 6 * 3600;
/** Divisors of the cycle, minutes. */
const ALLOWED_PERIODS_MIN = [18, 20, 24, 30, 36, 40, 45, 60, 72, 90, 120, 180, 360];
/** Calm tuning, not data: big ships move rarely, the mid-fleet carries the motion. */
export const PERIOD_MIN: Record<HullClass, number> = { flagship: 24, large: 30, medium: 40, small: 60, boat: 60, skiff: 60 };
/**
 * Harbour outings (D22, DECLARED-DECORATIVE, outings.ts): a single-chain hull sails a loop out of her
 * harbour and back to her own berth at most once per this many minutes (divisors of the cycle; a long
 * offshore sail, a busy gate or a full track make it rarer). Tuning, not data: the small fry go out
 * most, the big ships seldom.
 */
export const OUTING_PERIOD_MIN: Record<HullClass, number> = { flagship: 180, large: 120, medium: 40, small: 20, boat: 20, skiff: 18 };
/** Hulls berthed in a basin (not on a mooring or in the Far Ports) go out this many times less often. */
const OUTING_BERTH_FACTOR = 2.5;
/** An outing hull is out at most this share of her period: a long (offshore) loop stretches the period. */
export const OUTING_MAX_FRAC = 0.75;
/** Share of single-chain hulls that ever go out (hash-picked by id): the rest lie still all day. */
export const OUTING_SHARE = 0.95;
/** Harbour cruising speed by class (m/s; ×OPEN_WATER_MAX offshore): ~3 m/s for a 13 m hull, ∝ √LOA. */
export const SPEED: Record<HullClass, number> = { flagship: cruiseSpeed(26), large: cruiseSpeed(18), medium: cruiseSpeed(13), small: cruiseSpeed(10), boat: cruiseSpeed(7.5), skiff: cruiseSpeed(5) };
/** A hull spends at most this share of its circuit under way; long circuits stretch the period. */
export const MAX_SAIL_FRAC = 0.56;
/**
 * Scenic legs (D22): this share of the mid-size and smaller circuit hulls sail legs of their round by
 * their departure gate's offshore loop (still bound for the next chain: the loop is on the way there),
 * when their period has the slack, up to SCENIC_SAIL_FRAC of it under way. Dock time at each stop stays
 * ∝ its share. Tuning, not data; the big ships keep to the lanes.
 */
export const SCENIC_SHARE = 0.85;
export const SCENIC_SAIL_FRAC = 0.8;
const SCENIC_CLASSES: ReadonlySet<HullClass> = new Set<HullClass>(["medium", "small", "boat", "skiff"]);
/** Offshore a hull makes up to OPEN_WATER_MAX × her harbour speed: a scenic loop's metres count at this pace. */
const SCENIC_PACE = 1.35;
/** Unberthing (astern + pivot) and berthing, on top of the lane distance. */
export const MANOEUVRE_S = 55;
/** A berth is reserved this long before arrival and after departure (approach/exit fairway). */
export const RESERVE_IN_S = 30;
export const RESERVE_OUT_S = 50;
/** Arrivals/departures at one harbour are kept ≥ one bucket apart (no contested gate). */
const GATE_BUCKET_S = 20;
const OFFSET_TRIES = 72;
/** Above this many hulls under way in a minute, phase offsets that add more are penalised. */
const UNDER_WAY_SOFT_CAP = 84;
/** Outings: above this many on outings in a minute, phase offsets that add more are penalised. */
const OUTING_SOFT_CAP = 120;
const OUTING_OFFSET_TRIES = 48;
/** An outing hull at a busy gate tries this many periods (each the next longer divisor of the cycle). */
const OUTING_PERIOD_TRIES = 4;
/** An outing track's loops keep this far (m) from the plan's rafts (a large hull rafted, plus water). */
export const RAFT_CLEAR = 16;
/** Outings spread along a track: at most one hull out per this many metres of the water it covers. */
const TRACK_SPACING = 80;
/** Share of an outing hull's casts-off and berthings that may contest her gate (else a longer period, or she stays in). */
const OUTING_CONTEST = 0.6;

export const SEG_DOCK = 0, SEG_LEG = 1;

const REP_LEGS = new WeakMap<SimLayout, Map<string, { travel: number; manoeuvre: number } | null>>();
const TIMING = newLegTiming();

export interface BoatPlan {
  id: string;
  cls: HullClass;
  /** "circuit" sails; "static" holds one slot for the whole cycle; "none" (wrecked) is not planned. */
  kind: "circuit" | "static" | "none";
  /** Circuit period (s) and phase offset (s); boat-local time u = (t + offset) mod CYCLE. */
  period: number;
  offset: number;
  /** Segments tiling [0, CYCLE) in boat-local time. */
  segStart: Float64Array;
  segEnd: Float64Array;
  segKind: Uint8Array;
  /** Dock: the slot. Leg: destination slot. */
  segSlot: Int32Array;
  /** Leg: departure slot (dock: same as segSlot). */
  segFrom: Int32Array;
  /** Leg: 0, or 1 + the loop variant it sails (an outing's loop; a scenic leg's offshore loop out of her departure gate). */
  segLoop: Uint8Array;
  staticSlot: number;
  /** A static hull with harbour outings: her legs run from staticSlot round a loop back to it (decorative). */
  outing: boolean;
  /** Dock seconds per where over one period (for the dwell ∝ share check). */
  dwell: Map<string, number>;
  legSeconds: number;
}

export interface PlanStats {
  circuitBoats: number;
  staticBoats: number;
  /** Static hulls that take harbour outings (decorative), and the share of the time they are out. */
  outingBoats: number;
  expectedOutings: number;
  expectedUnderWay: number;
  expectedDockingsPerMin: number;
  overflow: number;
  periodsMin: Record<string, number>;
}

export interface Plan {
  key: string;
  boats: BoatPlan[];
  byId: Map<string, BoatPlan>;
  stats: PlanStats;
  /** Nominal leg seconds where → where for a class (used by voyages). */
  legSeconds(from: string, to: string, cls: HullClass): number;
  /** Lane metres where → where, at harbour speed (open-water stretches count less). */
  laneMetres(from: string, to: string): number;
}

/** Interval set on the cycle circle, per slot. */
class Timeline {
  private s: number[] = [];
  private e: number[] = [];
  full = false;
  isFree(a: number, b: number): boolean {
    if (this.full) return false;
    if (b - a >= CYCLE_S) return this.s.length === 0;
    const a0 = ((a % CYCLE_S) + CYCLE_S) % CYCLE_S, b0 = a0 + (b - a);
    if (b0 > CYCLE_S) return this.freeRaw(a0, CYCLE_S) && this.freeRaw(0, b0 - CYCLE_S);
    return this.freeRaw(a0, b0);
  }
  add(a: number, b: number): void {
    if (b - a >= CYCLE_S) { this.full = true; return; }
    const a0 = ((a % CYCLE_S) + CYCLE_S) % CYCLE_S, b0 = a0 + (b - a);
    if (b0 > CYCLE_S) { this.s.push(a0, 0); this.e.push(CYCLE_S, b0 - CYCLE_S); }
    else { this.s.push(a0); this.e.push(b0); }
  }
  get empty(): boolean { return !this.full && this.s.length === 0; }
  private freeRaw(a: number, b: number): boolean {
    for (let i = 0; i < this.s.length; i++) if (a < this.e[i] && this.s[i] < b) return false;
    return true;
  }
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs.slice()];
  const out: T[][] = [];
  xs.forEach((x, i) => { for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...p]); });
  return out;
}

function snapPeriod(minSec: number): number {
  for (const m of ALLOWED_PERIODS_MIN) if (m * 60 >= minSec - 1e-6) return m * 60;
  return CYCLE_S;
}

/** Larger berths a hull may take when its own class is full (never more than two sizes up). */
function ladder(cls: HullClass): HullClass[] {
  const i = CLASS_ORDER.indexOf(cls);
  return [cls, ...CLASS_ORDER.slice(Math.max(0, i - 2), i).reverse()];
}

export function buildPlan(model: HarbourModel, L: SimLayout): Plan {
  const timelines = new Map<number, Timeline>();
  const tl = (slot: number) => { let t = timelines.get(slot); if (!t) timelines.set(slot, (t = new Timeline())); return t; };
  const rafts = new Map<string, number[]>(); // where → raft slots
  let overflow = 0;

  // Leg length between harbours: between the mean and the longest gate-to-gate lane run, plus a long
  // (p75) approach each end, so hulls on short approaches ease off rather than any hull racing.
  const approachLong = new Map<string, number>();
  const gateNodes = new Map<string, { ins: number[]; outs: number[] }>();
  for (const [where, byCls] of L.pools) {
    const lens: number[] = [];
    const ins = new Set<number>(), outs = new Set<number>();
    for (const list of byCls.values()) for (const i of list) {
      const sl = L.slots[i], a = sl.approach;
      let len = 0;
      for (let k = 1; k < a.length; k++) len += Math.hypot(a[k][0] - a[k - 1][0], a[k][1] - a[k - 1][1]);
      lens.push(len);
      if (sl.inNode >= 0) ins.add(sl.inNode);
      if (sl.outNode >= 0) outs.add(sl.outNode);
    }
    lens.sort((x, y) => x - y);
    approachLong.set(where, lens.length ? lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.75))] : 40);
    gateNodes.set(where, { ins: [...ins], outs: [...outs] });
  }
  const laneCache = new Map<string, number>();
  const laneMetres = (from: string, to: string): number => {
    const k = from + ">" + to;
    let v = laneCache.get(k);
    if (v != null) return v;
    const a = gateNodes.get(from), b = gateNodes.get(to), ga = L.gates.get(from), gb = L.gates.get(to);
    let sum = 0, cnt = 0, mx = 0;
    if (a && b) for (const o of a.outs) for (const i of b.ins) {
      const d = L.graph.tdist[o * L.graph.n + i];
      if (Number.isFinite(d)) { sum += d; cnt++; mx = Math.max(mx, d); }
    }
    v = cnt ? (sum / cnt + mx) / 2 : -1;
    if (v < 0) v = ga && gb ? Math.hypot(gb.x - ga.x, gb.z - ga.z) * 1.3 : 400;
    laneCache.set(k, v);
    return v;
  };
  const repLeg = (from: string, to: string) => representativeLeg(L, from, to);
  const legSeconds = (from: string, to: string, cls: HullClass): number => {
    const r = repLeg(from, to);
    if (!r) return (laneMetres(from, to) + (approachLong.get(from) ?? 40) + (approachLong.get(to) ?? 40)) / SPEED[cls] + MANOEUVRE_S;
    const v = SPEED[cls];
    return r.travel / v + v / ACCEL + r.manoeuvre * Math.sqrt(L.loa[cls] / L.loa.medium) + 10;
  };

  // a scenic leg's time: the plain leg's, plus the loop's extra metres at an offshore pace (-1: none)
  const scenicSeconds = (from: string, to: string, cls: HullClass, v: number): number => {
    const ga = L.gates.get(from), gb = L.gates.get(to);
    const m = ga && gb ? scenicExtraMetres(L, ga.outNode, gb.inNode, v) : -1;
    return m < 0 ? -1 : legSeconds(from, to, cls) + m / (SPEED[cls] * SCENIC_PACE);
  };

  const whereOfStop = (chain: string | null) => {
    const w = L.whereOf(chain);
    return L.pools.has(w) ? w : "far";
  };

  const takeRaft = (where: string, a: number, b: number): number => {
    let list = rafts.get(where);
    if (!list) rafts.set(where, (list = []));
    for (const s of list) if (tl(s).isFree(a, b)) return s;
    const slot = addRaftSlot(L, where, list.length);
    list.push(slot.index);
    return slot.index;
  };

  /** First free slot for [a, b) at `where`, walking the class ladder from a hash-rotated start. */
  const findSlot = (where: string, cls: HullClass, a: number, b: number, seed: string, avoid: ReadonlyArray<[number, number, number]>): number => {
    const byCls = L.pools.get(where);
    if (!byCls) return -1;
    for (const k of ladder(cls)) {
      const list = byCls.get(k);
      if (!list || list.length === 0) continue;
      const start = Math.floor(u01(seed + k) * list.length);
      for (let j = 0; j < list.length; j++) {
        const s = list[(start + j) % list.length];
        if (!tl(s).isFree(a, b)) continue;
        if (avoid.some(([as, aa, ab]) => as === s && a < ab && aa < b)) continue;
        // a neighbour whose hull would overlap this one's is busy then: skip
        const cf = L.slots[s].conflicts;
        if (cf.length && cf.some((c) => !tl(c).isFree(a, b) || avoid.some(([as, aa, ab]) => as === c && a < ab && aa < b))) continue;
        return s;
      }
    }
    return -1;
  };

  const ordered = model.boats.map((b, i) => ({ b, i })).sort((x, y) =>
    CLASS_ORDER.indexOf(x.b.hullClass) - CLASS_ORDER.indexOf(y.b.hullClass) || y.b.supply - x.b.supply || (x.b.id < y.b.id ? -1 : 1));

  const plans = new Map<string, BoatPlan>();
  const empty = (b: Boat, kind: BoatPlan["kind"]): BoatPlan => ({
    id: b.id, cls: b.hullClass, kind, period: CYCLE_S, offset: 0,
    segStart: new Float64Array(0), segEnd: new Float64Array(0), segKind: new Uint8Array(0), segSlot: new Int32Array(0), segFrom: new Int32Array(0), segLoop: new Uint8Array(0),
    staticSlot: -1, outing: false, dwell: new Map(), legSeconds: 0,
  });

  // 1. static hulls hold one slot for the whole cycle
  for (const { b } of ordered) {
    if (b.state === "wrecked") { plans.set(b.id, empty(b, "none")); continue; }
    if (b.circuit.length !== 1) continue;
    const where = whereOfStop(b.circuit[0].chain);
    let slot = findSlot(where, b.hullClass, 0, CYCLE_S, b.id, []);
    if (slot < 0) { slot = takeRaft(where, 0, CYCLE_S); overflow++; }
    tl(slot).add(0, CYCLE_S);
    const p = empty(b, "static");
    p.staticSlot = slot;
    p.segStart = Float64Array.of(0); p.segEnd = Float64Array.of(CYCLE_S); p.segKind = Uint8Array.of(SEG_DOCK);
    p.segSlot = Int32Array.of(slot); p.segFrom = Int32Array.of(slot);
    p.dwell.set(where, CYCLE_S);
    plans.set(b.id, p);
  }

  // 2. circuit hulls: choose a phase offset whose arrivals/departures never contest a gate and whose
  //    every dock window finds a free berth; colour the windows.
  const gateBuckets = new Map<string, Uint8Array>();
  // the same per lane node (a harbour can have several gates): circuits fill it, outings consult it
  const nodeBuckets = new Map<number, Uint8Array>();
  const buckets = (where: string) => { let g = gateBuckets.get(where); if (!g) gateBuckets.set(where, (g = new Uint8Array(CYCLE_S / GATE_BUCKET_S))); return g; };
  const NB = CYCLE_S / GATE_BUCKET_S;
  const nodeB = (node: number) => { let g = nodeBuckets.get(node); if (!g) nodeBuckets.set(node, (g = new Uint8Array(NB))); return g; };
  const bucketOf = (g: number) => Math.floor((((g % CYCLE_S) + CYCLE_S) % CYCLE_S) / GATE_BUCKET_S) % NB;
  // departures per lane node: an outing leaves at least a bucket after/before any other departure from
  // her gate (two off together would sail out as twins, and a scenic leg sails the same loops)
  const outDep = new Map<number, Uint8Array>();
  const depB = (node: number) => { let d = outDep.get(node); if (!d) outDep.set(node, (d = new Uint8Array(NB))); return d; };
  const depClear = (node: number, g: number) => { const d = depB(node), i = bucketOf(g); return d[i] === 0 && d[(i + 1) % NB] === 0 && d[(i + NB - 1) % NB] === 0; };
  const gateClear = (where: string, g: number) => {
    const bk = buckets(where), i = bucketOf(g);
    return bk[i] === 0 && bk[(i + 1) % NB] === 0 && bk[(i + NB - 1) % NB] === 0;
  };

  // hulls under way per cycle minute, so phase offsets can spread the traffic evenly
  const uwMin = new Uint16Array(CYCLE_S / 60);
  const overload = (offset: number, T: number, reps: number, legsLocal: Array<{ a: number; e: number }>): number => {
    let over = 0;
    for (let r = 0; r < reps; r++) for (const lg of legsLocal) {
      for (let t = lg.a; t < lg.e; t += 60) {
        const m = Math.floor((((r * T + t - offset) % CYCLE_S) + CYCLE_S) % CYCLE_S / 60);
        if (uwMin[m] >= UNDER_WAY_SOFT_CAP) over++;
      }
    }
    return over;
  };
  let expUnderWay = 0, expDock = 0, nCircuit = 0, nStatic = 0;
  const periods: Record<string, number> = {};
  for (const { b } of ordered) {
    if (plans.has(b.id)) { if (plans.get(b.id)!.kind === "static") nStatic++; continue; }
    const stops = b.circuit.map((s) => ({ where: whereOfStop(s.chain), share: s.share }));
    // merge stops that fold onto the same where (e.g. two un-piered chains)
    const merged: Array<{ where: string; share: number }> = [];
    for (const s of stops) { const m = merged.find((x) => x.where === s.where); if (m) m.share += s.share; else merged.push({ ...s }); }
    if (merged.length === 1) { // degenerate circuit → static
      const where = merged[0].where;
      let slot = findSlot(where, b.hullClass, 0, CYCLE_S, b.id, []);
      if (slot < 0) { slot = takeRaft(where, 0, CYCLE_S); overflow++; }
      tl(slot).add(0, CYCLE_S);
      const p = empty(b, "static");
      p.staticSlot = slot;
      p.segStart = Float64Array.of(0); p.segEnd = Float64Array.of(CYCLE_S); p.segKind = Uint8Array.of(SEG_DOCK);
      p.segSlot = Int32Array.of(slot); p.segFrom = Int32Array.of(slot); p.dwell.set(where, CYCLE_S);
      plans.set(b.id, p); nStatic++;
      continue;
    }
    // sail the stops in the order that makes the shortest round (one-way lanes make it asymmetric);
    // the largest stop stays first so the order is stable
    if (merged.length > 2) {
      const rest = merged.slice(1);
      let bestOrder = rest, bestSail = Infinity;
      for (const perm of permutations(rest)) {
        const seq = [merged[0], ...perm];
        let t = 0;
        for (let i = 0; i < seq.length; i++) t += legSeconds(seq[i].where, seq[(i + 1) % seq.length].where, b.hullClass);
        if (t < bestSail - 1e-6) { bestSail = t; bestOrder = perm; }
      }
      merged.splice(1, merged.length - 1, ...bestOrder);
    }
    const n = merged.length;
    const legs = merged.map((s, i) => legSeconds(s.where, merged[(i + 1) % n].where, b.hullClass));
    let sail = legs.reduce((a, v) => a + v, 0);
    const T = snapPeriod(Math.max(PERIOD_MIN[b.hullClass] * 60, sail / MAX_SAIL_FRAC));
    // scenic legs, first out of the stop she lies at longest, while the period has room for them
    const scenic = new Uint8Array(n);
    if (SCENIC_CLASSES.has(b.hullClass) && u01(b.id + "#scenic") < SCENIC_SHARE) {
      const v = Math.floor(u01(b.id + "#scenic-v") * OFFSHORE_VARIANTS);
      const order = merged.map((_, i) => i).sort((x, y) => merged[y].share - merged[x].share || x - y);
      for (const i of order) {
        const sc = scenicSeconds(merged[i].where, merged[(i + 1) % n].where, b.hullClass, v);
        if (sc > legs[i] && sail + sc - legs[i] <= SCENIC_SAIL_FRAC * T) { sail += sc - legs[i]; legs[i] = sc; scenic[i] = v + 1; }
      }
    }
    const dockTotal = T - sail;
    const dwell = merged.map((s) => s.share * dockTotal);
    const reps = CYCLE_S / T;
    // boat-local segment times for one period
    const local: Array<{ kind: number; stop: number; a: number; e: number }> = [];
    let u = 0;
    for (let i = 0; i < n; i++) {
      local.push({ kind: SEG_DOCK, stop: i, a: u, e: u + dwell[i] }); u += dwell[i];
      local.push({ kind: SEG_LEG, stop: i, a: u, e: u + legs[i] }); u += legs[i];
    }
    const base = u01(b.id + "#phase") * T;
    const legsLocal = local.filter((x) => x.kind === SEG_LEG);
    let best: { offset: number; slots: number[]; score: number } | null = null;
    for (let k = 0; k < OFFSET_TRIES; k++) {
      const offset = (base + k * (T / OFFSET_TRIES) + (k ? u01(b.id + "#j" + k) * 7 : 0)) % T;
      // contested gates: arrivals/departures closer than a bucket to another hull's at that harbour
      let gateBad = 0;
      for (let r = 0; r < reps; r++) for (const sgm of local) {
        if (sgm.kind !== SEG_DOCK) continue;
        const w = merged[sgm.stop].where;
        if (!gateClear(w, r * T + sgm.a - offset)) gateBad++;
        if (!gateClear(w, r * T + sgm.e - offset)) gateBad++;
      }
      const over = overload(offset, T, reps, legsLocal);
      if (best && gateBad + over * 0.25 >= best.score) continue;
      const chosen: number[] = [];
      const avoid: Array<[number, number, number]> = [];
      let fails = 0;
      for (let r = 0; r < reps; r++) for (const sgm of local) {
        if (sgm.kind !== SEG_DOCK) continue;
        const w = merged[sgm.stop].where;
        const a = r * T + sgm.a - offset - RESERVE_IN_S, e = r * T + sgm.e - offset + RESERVE_OUT_S;
        const s = findSlot(w, b.hullClass, a, e, `${b.id}#${r}#${sgm.stop}`, avoid);
        if (s < 0) fails++;
        chosen.push(s);
        avoid.push([s, a, e]);
      }
      // an overflowed window costs far more than a shared gate bucket
      const score = fails * 100 + gateBad + over * 0.25;
      if (!best || score < best.score) best = { offset, slots: chosen, score };
      if (score === 0) break;
    }
    const { offset } = best!;
    const slots = best!.slots;
    // commit: reservations, gate events, overflow rafts
    let si = 0;
    const segs: Array<{ kind: number; a: number; e: number; slot: number; from: number; scenic: number }> = [];
    for (let r = 0; r < reps; r++) for (const sgm of local) {
      if (sgm.kind !== SEG_DOCK) { segs.push({ kind: SEG_LEG, a: r * T + sgm.a, e: r * T + sgm.e, slot: -1, from: -1, scenic: scenic[sgm.stop] }); continue; }
      const w = merged[sgm.stop].where;
      const a = r * T + sgm.a - offset - RESERVE_IN_S, e = r * T + sgm.e - offset + RESERVE_OUT_S;
      let s = slots[si++];
      if (s < 0) { s = takeRaft(w, a, e); overflow++; }
      tl(s).add(a, e);
      buckets(w)[bucketOf(r * T + sgm.a - offset)] = 1;
      buckets(w)[bucketOf(r * T + sgm.e - offset)] = 1;
      if (L.slots[s].inNode >= 0) nodeB(L.slots[s].inNode)[bucketOf(r * T + sgm.a - offset)]++;
      if (L.slots[s].outNode >= 0) { nodeB(L.slots[s].outNode)[bucketOf(r * T + sgm.e - offset)]++; depB(L.slots[s].outNode)[bucketOf(r * T + sgm.e - offset)]++; }
      segs.push({ kind: SEG_DOCK, a: r * T + sgm.a, e: r * T + sgm.e, slot: s, from: s, scenic: 0 });
    }
    for (let r = 0; r < reps; r++) for (const lg of legsLocal) for (let t = lg.a; t < lg.e; t += 60) {
      uwMin[Math.floor((((r * T + t - offset) % CYCLE_S) + CYCLE_S) % CYCLE_S / 60)]++;
    }
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].kind !== SEG_LEG) continue;
      segs[i].from = segs[i - 1].slot;
      segs[i].slot = segs[(i + 1) % segs.length].slot;
    }
    const p = empty(b, "circuit");
    p.period = T; p.offset = offset; p.legSeconds = sail;
    p.segStart = Float64Array.from(segs, (s) => s.a);
    p.segEnd = Float64Array.from(segs, (s) => s.e);
    p.segKind = Uint8Array.from(segs, (s) => s.kind);
    p.segSlot = Int32Array.from(segs, (s) => s.slot);
    p.segFrom = Int32Array.from(segs, (s) => s.from);
    p.segLoop = Uint8Array.from(segs, (s) => s.scenic);
    merged.forEach((s, i) => p.dwell.set(s.where, (p.dwell.get(s.where) ?? 0) + dwell[i]));
    plans.set(b.id, p);
    nCircuit++;
    expUnderWay += sail / T;
    expDock += n / (T / 60);
    periods[b.hullClass] = Math.max(periods[b.hullClass] ?? 0, T / 60);
  }

  // 3. harbour outings (D22, decorative): a single-chain hull casts off, sails a loop and comes back to
  //    the berth she holds all cycle (no reservation to make). Phase offsets keep departures and
  //    arrivals at one gate apart and spread the outings over the cycle.
  let nOuting = 0, expOuting = 0;
  const owMin = new Uint16Array(CYCLE_S / 60);
  const trackMin = new Map<unknown, Uint16Array>();
  // the plan's overflow rafts lie off the gates in open water: a track whose loops run through them is not sailed
  const raftSlots = L.slots.filter((sl) => sl.kind === "raft");
  const raftFree = new Map<unknown, boolean>();
  // (an outing keeps a bucket clear of other events at a basin's gate, hulls ~60 m apart in its
  // fairway; a mooring field's or the Far Ports' lane node lies in open water and takes two)
  const nodeClear = (node: number, g: number, cap: number) => nodeB(node)[bucketOf(g)] < cap;
  for (const { b } of ordered) {
    const p = plans.get(b.id)!;
    if (p.kind !== "static" || p.staticSlot < 0) continue;
    const slot = L.slots[p.staticSlot];
    if (slot.kind === "raft" || u01(b.id + "#outing") >= OUTING_SHARE) continue;
    const where = slot.where, outN = slot.outNode, inN = slot.inNode, cap = slot.kind === "berth" ? 1 : 2;
    // her gate's tracks, the least sailed first: hulls out on one track at once, about one per
    // TRACK_SPACING metres of the water it covers
    const tracks = outingVariants(L, p.staticSlot).filter((v) => {
      const tr = outingTrack(L, p.staticSlot, v)!;
      let ok = raftFree.get(tr.track);
      if (ok == null) raftFree.set(tr.track, (ok = trackClearOf(tr.track, raftSlots, RAFT_CLEAR)));
      return ok;
    }).map((v) => {
      const tr = outingTrack(L, p.staticSlot, v)!;
      let on = trackMin.get(tr.track);
      if (!on) trackMin.set(tr.track, (on = new Uint16Array(CYCLE_S / 60)));
      let load = 0;
      for (let k = 0; k < on.length; k++) load += on[k];
      const full = Math.max(2, Math.floor(tr.metres / TRACK_SPACING));
      return { v, on, full, load: load / full };
    }).sort((a, b) => a.load - b.load || a.v - b.v);
    // a gate takes one event (out or home, circuit or outing) at a time: when most of her outings would
    // contest one whatever the phase, she goes out less often (a busy gate's later hulls take longer
    // periods) or on another track, and failing that stays in (a busy basin's fairway never fills up)
    // (the outings are spread over the cycle too: each rep's share of minutes already at the soft cap)
    let pick: { v: number; on: Uint16Array; T: number; D: number; offset: number } | null = null;
    for (const tk of tracks) {
      const m = outingMetres(L, p.staticSlot, b.hullClass, tk.v);
      if (m < 0) continue;
      const D = Math.round(m / SPEED[b.hullClass] + MANOEUVRE_S * Math.sqrt(L.loa[b.hullClass] / L.loa.medium) + 20);
      // (a basin's fairway is shared with the circuits that berth there: its hulls go out less often)
      const T0 = snapPeriod(Math.max(OUTING_PERIOD_MIN[b.hullClass] * 60 * (slot.kind === "berth" ? OUTING_BERTH_FACTOR : 1), D / OUTING_MAX_FRAC));
      for (let pi = ALLOWED_PERIODS_MIN.indexOf(T0 / 60), tries = 0; pi >= 0 && pi < ALLOWED_PERIODS_MIN.length && tries < OUTING_PERIOD_TRIES; pi++, tries++) {
        const T = ALLOWED_PERIODS_MIN[pi] * 60, dock = T - D, reps = CYCLE_S / T;
        const base = u01(b.id + "#outing-phase") * T;
        let best = { offset: base, score: Infinity, gate: Infinity };
        for (let k = 0; k < OUTING_OFFSET_TRIES && best.score > 0; k++) {
          const offset = (base + (k * T) / OUTING_OFFSET_TRIES) % T;
          let gate = 0, over = 0;
          for (let r = 0; r < reps && gate + (over * 60) / D < best.score; r++) {
            const dep = r * T + dock - offset, arr = r * T + T - offset;
            if (outN >= 0 && (!nodeClear(outN, dep, cap) || !depClear(outN, dep))) gate += 1;
            if (inN >= 0 && !nodeClear(inN, arr, cap)) gate += 1;
            for (let t = dep; t < arr; t += 60) {
              const mi = Math.floor((((t % CYCLE_S) + CYCLE_S) % CYCLE_S) / 60);
              if (owMin[mi] >= OUTING_SOFT_CAP) over++;
              // a full track counts as a contested gate, by the share of the outing spent on it
              if (tk.on[mi] >= tk.full) gate += 60 / D;
            }
          }
          const score = gate + (over * 60) / D;
          if (score < best.score) best = { offset, score, gate };
        }
        if (best.gate <= reps * OUTING_CONTEST + 0.5) { pick = { v: tk.v, on: tk.on, T, D, offset: best.offset }; break; }
      }
      if (pick) break;
    }
    if (!pick) continue;
    const { T, D, offset } = pick, dock = T - D, reps = CYCLE_S / T;
    const segs: Array<{ kind: number; a: number; e: number }> = [];
    for (let r = 0; r < reps; r++) {
      segs.push({ kind: SEG_DOCK, a: r * T, e: r * T + dock }, { kind: SEG_LEG, a: r * T + dock, e: (r + 1) * T });
      const dep = r * T + dock - offset, arr = r * T + T - offset;
      if (outN >= 0) { nodeB(outN)[bucketOf(dep)]++; depB(outN)[bucketOf(dep)]++; }
      if (inN >= 0) nodeB(inN)[bucketOf(arr)]++;
      for (let t = dep; t < arr; t += 60) { const mi = Math.floor((((t % CYCLE_S) + CYCLE_S) % CYCLE_S) / 60); owMin[mi]++; pick.on[mi]++; }
    }
    p.outing = true; p.period = T; p.offset = offset; p.legSeconds = D;
    p.segStart = Float64Array.from(segs, (q) => q.a);
    p.segEnd = Float64Array.from(segs, (q) => q.e);
    p.segKind = Uint8Array.from(segs, (q) => q.kind);
    p.segSlot = new Int32Array(segs.length).fill(p.staticSlot);
    p.segFrom = new Int32Array(segs.length).fill(p.staticSlot);
    p.segLoop = Uint8Array.from(segs, (q) => (q.kind === SEG_LEG ? pick.v + 1 : 0));
    p.dwell.set(where, dock * reps);
    nOuting++;
    expOuting += D / T;
    expDock += 1 / (T / 60);
  }

  const boats = model.boats.map((b) => plans.get(b.id)!);
  return {
    key: model.planKey,
    boats,
    byId: plans,
    stats: { circuitBoats: nCircuit, staticBoats: nStatic, outingBoats: nOuting, expectedOutings: expOuting, expectedUnderWay: expUnderWay + expOuting, expectedDockingsPerMin: expDock, overflow, periodsMin: periods },
    legSeconds,
    laneMetres,
  };
}

/** Representative slot of a harbour: the median-approach medium berth (else any class). */
function repSlot(L: SimLayout, where: string): number {
  const byCls = L.pools.get(where);
  const list = (byCls?.get("medium")?.length ? byCls.get("medium")! : [...(byCls?.values() ?? [])].flat()).filter((i) => L.slots[i].kind !== "raft");
  if (!list.length) return -1;
  const len = (i: number) => { const a = L.slots[i].approach; let t = 0; for (let k = 1; k < a.length; k++) t += Math.hypot(a[k][0] - a[k - 1][0], a[k][1] - a[k - 1][1]); return t; };
  const sorted = [...list].sort((x, y) => len(x) - len(y) || (L.slots[x].id < L.slots[y].id ? -1 : 1));
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Leg time from a real representative path (median-approach slot each end), so the plan's legs
 * already include detours, slow turns and the faster open-water stretches. Cached per layout.
 */
function representativeLeg(L: SimLayout, from: string, to: string): { travel: number; manoeuvre: number } | null {
  let reps = REP_LEGS.get(L);
  if (!reps) REP_LEGS.set(L, (reps = new Map()));
  const key = from + ">" + to;
  if (reps.has(key)) return reps.get(key)!;
  const a = repSlot(L, from), b = repSlot(L, to);
  let v: { travel: number; manoeuvre: number } | null = null;
  if (a >= 0 && b >= 0) {
    const path = buildLegPath(L, a, b, "medium");
    const tm = legTiming(path, 1e9, L.loa.medium, TIMING, L.slots[a].heading, L.slots[b].heading);
    v = { travel: tm.lf, manoeuvre: tm.tW0 + tm.tW1 + tm.tAstern + tm.tTurn };
  }
  reps.set(key, v);
  return v;
}

/** Build every harbour-to-harbour representative leg now, on this thread (boot uses sim/warm-legs instead). */
export function warmLegTimes(L: SimLayout): void { legTimes(L); }

export type RepLeg = { travel: number; manoeuvre: number } | null;

/**
 * The harbour-to-harbour representative legs as plain data, built now: share w of n (round-robin), so n
 * workers can each warm their own copy of the layout off the main thread (seedLegTimes adopts them).
 */
export function legTimes(L: SimLayout, w = 0, n = 1): Array<[string, RepLeg]> {
  const wheres = [...L.pools.keys()], out: Array<[string, RepLeg]> = [];
  let k = 0;
  for (const a of wheres) for (const b of wheres) if (a !== b && k++ % n === w) out.push([a + ">" + b, representativeLeg(L, a, b)]);
  return out;
}

/** Adopt leg times built on an identical layout elsewhere (a worker); keys already built here are kept. */
export function seedLegTimes(L: SimLayout, entries: ReadonlyArray<[string, RepLeg]>): void {
  let reps = REP_LEGS.get(L);
  if (!reps) REP_LEGS.set(L, (reps = new Map()));
  for (const [k, v] of entries) if (!reps.has(k)) reps.set(k, v);
}

/** Segment index containing boat-local time u (binary search). */
export function findSegment(p: BoatPlan, u: number): number {
  let lo = 0, hi = p.segStart.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.segStart[mid] <= u) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function boatLocalTime(p: BoatPlan, tSec: number): number {
  const g = ((tSec % CYCLE_S) + CYCLE_S) % CYCLE_S;
  return (g + p.offset) % CYCLE_S;
}
