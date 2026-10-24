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
import { clearance, hullClearance, type CoastGrid } from "./obstacles";
import { buildOutingPath, buildScenicPath, scenicClearOf, seedOutings, type OutingSeed } from "./outings";
import { buildLegPath, legControlPoints } from "./routes";
import { buildPath, evalLeg, hullMargin, IO_LANE, IO_LOA, IO_S, IO_SEP, IO_T, legTiming, samplePath, LEG_APPROACH, LEG_CAST_OFF, LEG_HOLD, LEG_HOLD_END, LEG_TURN, newLegTiming, type LegTiming, type PathRec } from "./path";
import { boatLocalTime, buildPlan, RAFT_CLEAR, seedLegTimes, CYCLE_S, findSegment, MANOEUVRE_S, SEG_DOCK, SPEED, type BoatPlan, type Plan, type RepLeg } from "./plan";
import { hypot } from "./math";

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
  /**
   * Mooring lines out, 0..1: 0 under way; after arrival they are thrown and made fast (bow line, then
   * stern line, then the spring: 1 = all fast); before casting off they are let go and hauled aboard.
   */
  lines: Float32Array;
  /**
   * 1 while she is out on a harbour outing (D22): DECLARED-DECORATIVE, a loop out of her harbour and
   * back to her own berth that carries no data ("out for a sail", never "sailing to <chain>").
   */
  outing: Uint8Array;
  /**
   * The lane offset + give-way shove applied this frame (x, z per boat, m; 0 when none): the renderer yaws the
   * hull into its rate of change so she steers round a neighbour instead of crabbing sideways (07-M8).
   */
  drift: Float32Array;
  /**
   * Extra pitch (rad, + bow up), and position y: 1 while she is on the launching ways (the renderer seats her
   * keel on the ground there), else 0. 07-M12: the slide down the ways and the rebound after the splash.
   */
  pitch: Float32Array;
}

/**
 * 07-M6: DECLARED-DECORATIVE harbour tugs (a rowed lighter, hover "harbour tug"; they carry no data). One leads
 * each dying hull (EV_TOW) to Wreck Cove on a towline, casts off a couple of hull lengths short of the strand,
 * turns and rows home along the tow's path (offset to her starboard) and is gone at its start. A pure function
 * of the tow voyage (its path, timing and start).
 */
export const MAX_TUGS = 4;
export interface TugBuffer {
  count: number;
  x: Float32Array;
  z: Float32Array;
  heading: Float32Array;
  /** Index of the hull she tows, while the towline is fast (else -1: rowing home). */
  of: Int32Array;
}
/** Tug: towline length beyond the dying hull's bow (m, + 1.5 LOA), rowing speed home (m/s), turning radius (m). */
const TUG_LINE = 6, TUG_V = 1.6, TUG_R = 6;
/**
 * 07-M7 adrift: a depegged hull drifts to the Shoals at this share of her pace, her canvas half loose and
 * flogging, her head wandering (±ADRIFT_YAW rad about the path), listing more as she goes; on recovery she
 * sheets home over SHEET_HOME_S and comes upright.
 */
const ADRIFT_PACE = 0.6, ADRIFT_YAW = 0.2, SHEET_HOME_S = 30;
/** 07-M12: the slide down the ways (s), and the splash: pitch rebound amplitude (rad), decay (s), period (s). */
const SLIDE_S = 7, SPLASH_PITCH = 0.09, SPLASH_DECAY = 1.8, SPLASH_T = 2.8;

/** A sim event for listeners (audio, moments): the coin, what happened, where (world x, z). */
export type SimEventKind = "launch" | "tow" | "to-shoals" | "rejoin" | "docking";
export interface SimEvent { id: string; kind: SimEventKind; x: number; z: number }
const EV_KIND: Record<number, SimEventKind | undefined> = { [EV_LAUNCH]: "launch", [EV_TOW]: "tow", [EV_TO_SHOALS]: "to-shoals" };

interface Tow { path: PathRec; tm: LegTiming; t0: number; loa: number; ahead: number; tRel: number; sEnd: number; tEnd: number }

const MODE_PLAN = 0, MODE_VOYAGE = 1, MODE_HOLD = 2;
const END_HOLD = 0, END_PLAN = 1;
const SETTLE_S = 25;
/** Lines: thrown and made fast over this many seconds after arrival; let go over this many before casting off. */
const LINES_IN_S = 7, LINES_OUT_S = 4;
/** The fender bump: she carries a little way into the fenders, rebounds, settles (s, rad/s, m). */
const BUMP_T0 = 0.8, BUMP_W = (2 * Math.PI) / 4, BUMP_DECAY = 1.6, BUMP_END = 7, BUMP_A = 0.2;
const PREFETCH_S = 240;
const SHOALS_RING = 14;
/** Hulls under way spread across a lane this wide (± metres): by the speed they make, slow to starboard. */
const LANE_HALF = 7;
/** Leg cruise speed (m/s) at the lane's centre line, and the speed spread that spans its half-width. */
const LANE_V_MID = 3.0, LANE_V_SPAN = 1.6;
/** Own lane jitter (± m, by id), so hulls making the same speed do not stack exactly. */
const LANE_JITTER = 1.2;
/** Give-way passes per frame (the second settles shoves the first one caused). */
const SEP_PASSES = 2;
/** Hull-length stations sampled for the give-way overlap (bow … stern). */
const SEP_K = [-0.42, -0.21, 0, 0.21, 0.42];
/** A voyage begun under way (re-plan, depeg, recovery) eases her give-way shove in over this long (s). */
const PUSH_FADE_S = 12;
/** The most a moored hull sheers round her buoy away from a hull passing close (rad). */
const MOORED_SHEER = 0.45;
/** Water kept between hulls by the separation pass (m), and the most it may shove a hull sideways. */
const SEP_GAP = 1.2;
/** The shove eases in over this many metres before the gap is reached (no sudden sidesteps). */
const SEP_RAMP = 6;
/** Extra tie-break toward each side for hulls dead level in one lane at one pace (twins off one plan). */
const TWIN_TIE = 1.0;
/** Mooring yaw periods (s): each divides the 6 h cycle, so the whole harbour still repeats exactly. */
const YAW_PERIODS = [40, 45, 48, 50, 54, 60, 72, 75, 80, 90, 96, 100, 108, 120, 135, 144, 150];

/**
 * 07-M5: a slow decorative veer of the wind (rad, ±~13°; periods 1350 s and 540 s divide the 6 h cycle, so the
 * harbour still repeats exactly). It turns the swinging hulls (each a little behind, by her own lag: the
 * anchorage wheels as one, raggedly) and the render wind (flags, gusts); paths, plan and heel under way keep
 * the layout wind. Decorative only: never data.
 */
export function windVeer(t: number): number {
  const TAU = 2 * Math.PI;
  return 0.17 * Math.sin((TAU * t) / 1350 + 0.7) + 0.06 * Math.sin((TAU * t) / 540 + 2.1);
}

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
  /** She was aground on the Shoals when this voyage began (a recovery: canvas sheeted home, she comes upright). */
  fromShoals?: boolean;
  /** 07-M12 a launch: the ways she slides down first, stern first, over SLIDE_S (top x, z → foot x, z, heading down). */
  launch?: [number, number, number, number, number];
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
  /** The current leg is an outing she cannot sail cleanly: she stays at her berth through it. */
  legStay: boolean;
  voyage: Voyage | null;
  holdSlot: number;
  holdPhase: number;
  /** When a voyage put her in the slot she holds (s, sim clock; -1e9 = she has always been there). */
  holdSince: number;
  heelBase: number;
  lag: number;
  phi: number;
  /** Own yaw at a swinging mooring: amplitude (rad) and two periods (s); lane offset (m). */
  yawA: number;
  yawP: number;
  yawP2: number;
  laneOff: number;
  beam: number;
  shoals: boolean;
  wrecked: boolean;
  /** Per-hull constants, hashed and derived once per model: the side she lists / rolls to (±1), her wreck list (0..1), surge and fender-bump scales. */
  side: number;
  list: number;
  surge: number;
  bumpK: number;
  /** 07-M6: her last voyage under tow (kept until the tug is home). */
  tow: Tow | null;
}

const newTiming = (): LegTiming => newLegTiming();

/** A plan leg's path cache key: from>to>class, plus >s<loop> for an outing's or a scenic leg's loop. */
export function pathKey(fromSlot: number, toSlot: number, cls: HullClass, loop: number): string {
  return fromSlot + ">" + toSlot + ">" + cls + (loop ? ">s" + loop : "");
}

/** A plan leg to build: from slot, to slot, hull class, loop (plan.segLoop). */
export type PathRequest = [number, number, HullClass, number];

/** The whole hull stays clear of land and decks all along a path (and its astern prefix). */
function pathClear(L: SimLayout, p: PathRec, loa: number, beam: number): boolean {
  for (let k = 0; k < p.n; k++) {
    const x = p.pts[k * 2], z = p.pts[k * 2 + 1];
    if (L.field && clearance(L.field, x, z) > loa / 2 + 4) continue;
    if (hullClearance(L.hard, x, z, p.hdg[k], loa, beam) < -0.15) return false;
  }
  if (p.rev) for (let k = 0; k < p.rev.n; k++) if (hullClearance(L.hard, p.rev.pts[k * 2], p.rev.pts[k * 2 + 1], p.rev.hdg[k] + Math.PI, loa, beam) < -0.15) return false;
  return true;
}

/**
 * The path of a plan leg on layout L, whose slots past `baseSlots` are the plan's rafts. `loop`: 0, or 1 +
 * the loop variant the leg sails (plan.segLoop: an outing's loop, or a scenic leg's offshore loop). `bad`:
 * an outing whose hull would touch land or a deck anywhere (e.g. backing out of a cramped slip) is never
 * sailed: she stays in. A pure function of (layout, rafts, leg): sim/warm-legs workers build the same.
 */
export function buildPlanLegPath(L: SimLayout, baseSlots: number, fromSlot: number, toSlot: number, cls: HullClass, loop: number): { path: PathRec; bad: boolean } {
  const loa = L.loa[cls], beam = L.beam[cls];
  // from a slot back to itself: a harbour outing's loop
  const out = fromSlot === toSlot && loop ? buildOutingPath(L, fromSlot, cls, loop - 1) : null;
  const bad = !!out && !pathClear(L, out, loa, beam);
  // a scenic leg by the departure gate's offshore loop (one that would touch land or a deck sails the plain leg)
  // (nor one whose loop runs through the plan's overflow rafts)
  const scenic = loop > 0 && fromSlot !== toSlot && scenicClearOf(L, fromSlot, toSlot, loop - 1, L.slots.slice(baseSlots).filter((s) => s.kind === "raft"), RAFT_CLEAR);
  let sc = scenic ? buildScenicPath(L, fromSlot, toSlot, cls, loop - 1) : null;
  if (sc && !pathClear(L, sc, loa, beam)) sc = null;
  const path = out ?? sc ?? buildLegPath(L, fromSlot, toSlot, cls);
  path.setFrom = sailSetAt(L.slots[fromSlot]); path.setTo = sailSetAt(L.slots[toSlot]);
  return { path, bad };
}

/** Sails are furled only when docked (berth, pontoon): at a swinging mooring or in a raft she lies with them set. */
export function sailSetAt(s: Slot | undefined): boolean {
  return s?.mode === "swing" || s?.mode === "raft";
}

/** Leg-local time at which the hull comes to rest at the far end (before any spare time spent there). */
function arrivalT(tm: LegTiming, path: PathRec): number {
  return tm.tHold + tm.tW0 + tm.tTurn + (path.rev ? tm.tAstern : 0) + tm.tf + tm.tW1;
}

export interface SimStats {
  underWay: number;
  docked: number;
  moored: number;
  anchored: number;
  voyages: number;
  overflow: number;
  /** Of those under way, hulls out on a decorative harbour outing (D22). */
  outings: number;
  /** Arrivals (berth or mooring made) counted since the sim started, over the frames it was posed. */
  dockings: number;
  /** The plan's expectation: hulls under way on average, and arrivals per minute (circuits + outings). */
  expectedUnderWay: number;
  expectedDockingsPerMin: number;
}

export class HarbourSim {
  readonly layout: SimLayout;
  plan!: Plan;
  model!: HarbourModel;
  readonly pose: PoseBuffer;
  /** Wind the hulls lie to: bow heading into the wind (radians) and 0..1 strength (DEWS weather). */
  readonly wind = { fromRad: PREVAILING_WIND_FROM, strength: 0.35, /** decorative veer now (07-M5, rad): render wind only */ veer: 0 };
  /** 07-M6 harbour tugs this frame (decorative). */
  readonly tugs: TugBuffer = { count: 0, x: new Float32Array(MAX_TUGS), z: new Float32Array(MAX_TUGS), heading: new Float32Array(MAX_TUGS), of: new Int32Array(MAX_TUGS) };
  private listeners = new Set<(e: SimEvent) => void>();
  /** A launch is being routed (its rejoin voyage is a launch). */
  private launching = false;
  readonly stats: SimStats = { underWay: 0, docked: 0, moored: 0, anchored: 0, voyages: 0, overflow: 0, outings: 0, dockings: 0, expectedUnderWay: 0, expectedDockingsPerMin: 0 };
  frozen = false;

  private rt: BoatRt[] = [];
  private index = new Map<string, number>();
  private pathCache = new Map<string, PathRec>();
  /** Next-leg paths to build ahead of time, one per frame, so a cast-off never pays for its path. */
  private prefetch: Array<[number, number, number, number]> = [];
  private prefetchKeys = new Set<string>();
  private builtThisFrame = 0;
  private shoalsOf = new Map<string, number>();
  private wreckOf = new Map<string, number>();
  /** Slots authored by the layout; rafts and extra anchorages are appended after them. */
  private baseSlots = 0;
  private posed = false;
  private readonly tmp = new Float64Array(16);
  /** Give-way scratch: the hull stations (heading × LOA × SEP_K) of hull i (x then z) and of the other hull j. */
  private readonly stI = new Float64Array(10);
  private readonly stJ = new Float64Array(10);
  /** Per hull, this frame: lane weight (0..1) of the leg being sailed, and the separation scratch. */
  private laneW = new Float32Array(0);
  private sepW = new Float32Array(0);
  private sepX = new Float32Array(0);
  private sepZ = new Float32Array(0);
  /** The give-way shove alone (excluding lane offsets), so re-plans start voyages from the unshoved pose. */
  private pushX = new Float32Array(0);
  private pushZ = new Float32Array(0);
  /** Lane offset alone (before any give-way shove), and the cruise speed of the leg being sailed. */
  private laneX = new Float32Array(0);
  private laneZ = new Float32Array(0);
  private legV = new Float32Array(0);
  /** Give-way weight 0..1: a voyage begun from where she was shown eases its shove in (no jump). */
  private pushF = new Float32Array(0);
  /** After a model install: the offset (lane + shove) each hull was shown with, eased out over PUSH_FADE_S. */
  private carryX = new Float32Array(0);
  private carryZ = new Float32Array(0);
  private carryT0 = -1e9;
  /** How far a hull at rest has settled on her mooring (restPose blend): her sheer from passers scales by it. */
  private settled = new Float32Array(0);
  private cellHead = new Int32Array(4096);
  /** Outing paths (from>to>cls) that would put a hull on land or a deck: those outings are not sailed. */
  private badOuting = new Set<string>();
  /** Last frame's phase per hull (255 = not yet posed): arrivals are counted from it. */
  private prevPhase = new Uint8Array(0);
  private cellNext = new Int32Array(0);
  /** Hot-path doubles live in fields, not arguments: a double passed to a non-inlined call is boxed. */
  private t = 0;
  private blend = 1;
  private legT = 0;
  /** Seconds since she arrived at the slot she lies at / until she casts off from it (1e9: long ago / not soon). */
  private dockT = 1e9;
  private castT = 1e9;
  /** The voyage being written (EV_*, 0 = a plan leg) and whether she began it aground on the Shoals. */
  private vKind = 0;
  private vFromShoals = false;

  /** @param coast the baked sea SDF's coast channel: hulls then keep off the island's real coastline */
  constructor(model: HarbourModel, layout: HarbourLayout, nowMs = Date.now(), coast: CoastGrid | null = null) {
    this.layout = buildSimLayout(layout, coast);
    this.baseSlots = this.layout.slots.length;
    this.wind.fromRad = this.layout.windFrom;
    this.pose = { count: 0, ids: [], position: new Float32Array(0), heading: new Float32Array(0), heel: new Float32Array(0), sailState: new Float32Array(0), speed: new Float32Array(0), phase: new Uint8Array(0), slot: new Int32Array(0), event: new Uint8Array(0), lines: new Float32Array(0), outing: new Uint8Array(0), drift: new Float32Array(0), pitch: new Float32Array(0) };
    this.install(model, nowMs, true);
  }

  /**
   * Representative leg times warmed off the main thread while the data is awaited (sim/warm-legs: workers
   * on the same layout and coast), so the first real plan is quick. A leg not seeded in time is simply
   * built when the plan needs it (the same value).
   */
  seedLegTimes(entries: ReadonlyArray<[string, RepLeg]>): void { seedLegTimes(this.layout, entries); }

  /** The layout-only outing and scenic answers (gate loops, metres), warmed off the main thread likewise (outings.outingSeed). */
  seedOutings(seed: OutingSeed): void { seedOutings(this.layout, seed); }

  /**
   * Read-only: a circuit hull's day of rounds under the plan (the route chart line, fleet/route-line.ts),
   * starting with the leg she is on (or the next one, alongside). Each leg is its main path's samples
   * (x, z interleaved); ports are the dock slots in calling order. Null for static, wrecked or unknown
   * hulls. Legs not yet in the path cache are built here without caching (the same value).
   */
  itineraryOf(id: string): { legs: Array<{ pts: Float32Array; current: boolean }>; ports: Array<[number, number]> } | null {
    const i = this.index.get(id);
    const r = i === undefined ? undefined : this.rt[i];
    const plan = r?.plan;
    if (!r || !plan || plan.kind !== "circuit") return null;
    const nSeg = plan.segStart.length, c = findSegment(plan, boatLocalTime(plan, this.t));
    const legs: Array<{ pts: Float32Array; current: boolean }> = [];
    const ports: Array<[number, number]> = [];
    for (let k = 0; k < nSeg; k++) {
      const seg = (c + k) % nSeg;
      const slot = this.layout.slots[plan.segSlot[seg]];
      if (plan.segKind[seg] === SEG_DOCK) { if (slot) ports.push([slot.x, slot.z]); continue; }
      const key = pathKey(plan.segFrom[seg], plan.segSlot[seg], r.cls, plan.segLoop[seg]);
      const path = this.pathCache.get(key) ?? buildPlanLegPath(this.layout, this.baseSlots, plan.segFrom[seg], plan.segSlot[seg], r.cls, plan.segLoop[seg]).path;
      legs.push({ pts: path.pts.slice(0, path.n * 2), current: k === 0 });
    }
    return { legs, ports };
  }

  /** The plan's overflow rafts (the slots past the authored ones): a worker adds them to its own layout before building legs. */
  rafts(): Slot[] { return this.layout.slots.slice(this.baseSlots); }

  /**
   * The plan legs poseAt(nowMs) will build (`now`) and those its look-ahead will queue next (`soon`), not built
   * yet: sim/warm-legs builds them off the main thread after a re-plan. A leg missed here is simply built
   * when it is needed (the same path).
   */
  pathRequests(nowMs: number): { now: PathRequest[]; soon: PathRequest[] } {
    const t = nowMs / 1000, now = new Map<string, PathRequest>(), soon = new Map<string, PathRequest>();
    const want = (m: Map<string, PathRequest>, plan: BoatPlan, seg: number, cls: HullClass) => {
      const k = pathKey(plan.segFrom[seg], plan.segSlot[seg], cls, plan.segLoop[seg]);
      if (!this.pathCache.has(k) && !now.has(k)) m.set(k, [plan.segFrom[seg], plan.segSlot[seg], cls, plan.segLoop[seg]]);
    };
    for (const r of this.rt) {
      const plan = r.plan;
      if (r.mode !== MODE_PLAN || plan.kind === "none" || (plan.kind === "static" && !plan.outing)) continue;
      // (as evalBoat: a leg under way, or a dock window's neighbouring leg within its quarter, or the next one within PREFETCH_S)
      const nSeg = plan.segStart.length, u = boatLocalTime(plan, t), c = findSegment(plan, u);
      if (plan.segKind[c] !== SEG_DOCK) { want(now, plan, c, r.cls); continue; }
      if (nSeg < 2) continue;
      const into = u - plan.segStart[c], toEnd = plan.segEnd[c] - u, cap = 0.25 * (plan.segEnd[c] - plan.segStart[c]);
      if (into < cap) want(now, plan, (c - 1 + nSeg) % nSeg, r.cls);
      else if (toEnd < cap) want(now, plan, (c + 1) % nSeg, r.cls);
      if (toEnd < PREFETCH_S) want(soon, plan, (c + 1) % nSeg, r.cls);
    }
    for (const k of now.keys()) soon.delete(k);
    return { now: [...now.values()], soon: [...soon.values()] };
  }

  /** Plan leg paths built elsewhere for this very plan (sim/warm-legs): the same values legPathFor would build. */
  seedPaths(plan: Plan, entries: ReadonlyArray<[string, PathRec, boolean]>): void {
    if (plan !== this.plan) return;
    for (const [k, p, bad] of entries) {
      if (this.pathCache.has(k)) continue;
      if (bad) this.badOuting.add(k);
      if (this.pathCache.size > 1500) this.pathCache.delete(this.pathCache.keys().next().value!);
      this.pathCache.set(k, p);
    }
  }

  indexOf(id: string): number { return this.index.get(id) ?? -1; }

  /**
   * Listen for sim events (for audio / moments lanes): one-off voyages as they begin (launch, tow, to-shoals,
   * rejoin: real snapshot diffs only, never on first load) and arrivals at a berth or mooring. Returns an
   * unsubscribe. Called synchronously from setModel / poseAt; keep handlers cheap.
   */
  onEvent(cb: (e: SimEvent) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private emit(id: string, kind: SimEventKind, x: number, z: number): void {
    if (this.listeners.size) for (const cb of this.listeners) cb({ id, kind, x, z });
  }
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
    // the lane offset + give-way shove each hull was shown with (a re-plan moves her neighbours: the
    // shove she gets from them changes; it eases over rather than jumping)
    const oldSep = new Map<string, [number, number]>();
    if (!first) for (let i = 0; i < this.pose.count && i < this.sepX.length; i++) if (this.sepX[i] !== 0 || this.sepZ[i] !== 0) oldSep.set(this.pose.ids[i], [this.sepX[i], this.sepZ[i]]);

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
    this.stats.expectedUnderWay = this.plan.stats.expectedUnderWay;
    this.stats.expectedDockingsPerMin = this.plan.stats.expectedDockingsPerMin;
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
        prefetchSeg: -1, legStay: false,
        voyage: keepVoyage, holdSlot: o && !replan ? o.holdSlot : -1, holdPhase: o && !replan ? o.holdPhase : PH_DOCKED, holdSince: o && !replan ? o.holdSince : -1e9,
        // on the Shoals: 8-15° of list, more the further off peg
        heelBase: Math.min(0.27, 0.13 + 0.035 * Math.log(1 + Math.abs(b.pegDeviationBps ?? 0) / 50)), lag: u01(b.id + "#lag") * 40, phi: u01(b.id + "#phi") * Math.PI * 2,
        yawA: 0.24 + 0.18 * u01(b.id + "#yaw"), yawP: YAW_PERIODS[Math.floor(u01(b.id + "#yp") * YAW_PERIODS.length)], yawP2: YAW_PERIODS[Math.floor(u01(b.id + "#yp2") * YAW_PERIODS.length)],
        laneOff: (u01(b.id + "#lane") * 2 - 1) * LANE_JITTER, beam: this.layout.beam[b.hullClass],
        shoals: b.state === "shoals", wrecked: b.state === "wrecked",
        side: u01(b.id + "#side") < 0.5 ? 1 : -1, list: u01(b.id + "#list"), surge: 0.16 + 0.004 * this.layout.loa[b.hullClass], bumpK: BUMP_A * Math.sqrt(this.layout.loa[b.hullClass] / 13),
        tow: o?.tow ?? null,
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
      if (pb.state === "shoals" || pb.state === "wrecked") {
        if (at) { this.rejoin(i, t, at); this.emit(b.id, "rejoin", at.x, at.z); } else this.placeStatic(i);
        continue;
      }
      if (replan && at && !r.voyage) this.resyncFrom(i, t, at);
    }
    // hulls carrying on under the plan ease from the offset they were shown with; voyages start from it
    this.carryT0 = t;
    for (let i = 0; i < n; i++) {
      const o = oldSep.get(model.boats[i].id);
      const keep = !!o && this.rt[i].mode === MODE_PLAN;
      this.carryX[i] = keep ? o[0] : 0; this.carryZ[i] = keep ? o[1] : 0;
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
      p.slot = new Int32Array(n).fill(-1); p.event = new Uint8Array(n); p.lines = new Float32Array(n); p.outing = new Uint8Array(n); p.drift = new Float32Array(n * 2); p.pitch = new Float32Array(n);
      this.prevPhase = new Uint8Array(n).fill(255);
    }
    if (this.laneW.length !== n) {
      this.laneW = new Float32Array(n); this.sepW = new Float32Array(n); this.sepX = new Float32Array(n); this.sepZ = new Float32Array(n); this.cellNext = new Int32Array(n);
      this.pushX = new Float32Array(n); this.pushZ = new Float32Array(n);
      this.laneX = new Float32Array(n); this.laneZ = new Float32Array(n); this.legV = new Float32Array(n); this.pushF = new Float32Array(n);
      this.carryX = new Float32Array(n); this.carryZ = new Float32Array(n); this.settled = new Float32Array(n);
    }
  }

  /** Where every hull is shown now (x, z include the give-way shove px, pz: a voyage starts from there). */
  private snapshotPose(): Map<string, { x: number; z: number; px: number; pz: number; h: number; slot: number; phase: number; moving: boolean }> {
    const m = new Map<string, { x: number; z: number; px: number; pz: number; h: number; slot: number; phase: number; moving: boolean }>();
    const p = this.pose;
    for (let i = 0; i < p.count; i++) {
      const ph = p.phase[i];
      const k = i < this.pushX.length ? i : -1;
      m.set(p.ids[i], { x: p.position[i * 3], z: p.position[i * 3 + 2], px: k >= 0 ? this.pushX[k] : 0, pz: k >= 0 ? this.pushZ[k] : 0, h: p.heading[i], slot: p.slot[i], phase: ph, moving: ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING });
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
      // a spot whose swing circle clears every hull already aground, if there is one left
      let k = free.findIndex((s) => !L.slots[s].conflicts.some((c) => used.has(c)));
      if (k < 0) k = 0;
      let s = free.splice(k, 1)[0];
      if (s == null) s = this.ringSlot("shoals", keep.size);
      keep.set(r.id, s); used.add(s);
    }
    this.shoalsOf = keep;
    const wk = new Map<string, number>();
    const usedW = new Set<number>();
    // payload coins that died take the authored hulks' strand first (biggest hulls the biggest slots)
    const order = [...L.wrecks].sort((a, b) => L.loa[L.slots[b].cls] - L.loa[L.slots[a].cls] || a - b);
    const dead = this.rt.filter((r) => r.wrecked).sort((a, b) => b.loa - a.loa || (a.id < b.id ? -1 : 1));
    for (const r of dead) {
      const prev = this.wreckOf.get(r.id);
      let s = prev != null && prev < L.slots.length && !usedW.has(prev) ? prev : order.find((w) => !usedW.has(w));
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
      mode: zone === "shoals" ? "anchor" : "beached", warp: null, line: null, conflicts: [],
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

  /** `loop`: 0, or 1 + the loop variant the leg sails (plan.segLoop: an outing's loop, or a scenic leg's offshore loop). */
  private legPathFor(fromSlot: number, toSlot: number, r: BoatRt, loop = 0): PathRec {
    const key = pathKey(fromSlot, toSlot, r.cls, loop);
    let p = this.pathCache.get(key);
    if (!p) {
      this.builtThisFrame++;
      const b = buildPlanLegPath(this.layout, this.baseSlots, fromSlot, toSlot, r.cls, loop);
      if (b.bad) this.badOuting.add(key);
      p = b.path;
      if (this.pathCache.size > 1500) this.pathCache.delete(this.pathCache.keys().next().value!);
      this.pathCache.set(key, p);
    }
    return p;
  }

  private voyageTo(i: number, t: number, at: { x: number; z: number; h: number; slot: number; moving: boolean }, toSlot: number, kind: number, endMode: number, endPhase: number, arriveAt: number | null): void {
    const r = this.rt[i];
    const L = this.layout;
    // (a slot index from before a re-plan may name a raft that no longer exists)
    const from = !at.moving && at.slot >= 0 && at.slot < this.baseSlots ? L.slots[at.slot] : null;
    const c = legControlPoints(L, from, at, L.slots[toSlot], r.loa, r.beam);
    if (from && from.swing > 0) c.pts[0] = [at.x, at.z];
    const path = buildPath(c.pts, r.loa, c.tail, L.field, r.beam, c.extras);
    path.underway = at.moving;
    path.setFrom = sailSetAt(from ?? undefined); path.setTo = sailSetAt(L.slots[toSlot]);
    const startH = from ? (from.swing > 0 ? at.h : from.heading) : at.h;
    const nom = legTiming(path, 1e9, r.loa, newTiming(), startH, L.slots[toSlot].heading, false);
    // under tow, slow; adrift to the Shoals (07-M7), at ~0.6 of her pace
    let D = kind === EV_TOW ? nom.tNom * 1.8 : kind === EV_TO_SHOALS ? nom.tNom / ADRIFT_PACE : nom.tNom;
    if (arriveAt != null) D = Math.max(nom.minD, arriveAt - t);
    const tm = legTiming(path, D, r.loa, newTiming(), startH, L.slots[toSlot].heading, false);
    if (this.launching) kind = EV_LAUNCH;
    r.voyage = { path, tm, t0: t, D, endSlot: toSlot, endMode, endPhase, kind, startHeading: at.h, fromShoals: from?.kind === "shoals" };
    r.mode = MODE_VOYAGE;
    if (kind === EV_TOW) r.tow = this.makeTow(r, path, tm, t);
    const ev = EV_KIND[kind];
    if (ev) this.emit(r.id, ev, at.x, at.z);
  }

  /** 07-M12: on the ways, u 0..1 of the slide: stern first, gathering speed, canvas not yet bent on. */
  private slide(i: number, w: [number, number, number, number, number], u: number, dest: number): void {
    const p = this.pose, e = Math.max(0, Math.min(1, u)) ** 2;
    p.position[i * 3] = w[0] + (w[2] - w[0]) * e; p.position[i * 3 + 1] = 1; p.position[i * 3 + 2] = w[1] + (w[3] - w[1]) * e;
    p.heading[i] = w[4] + Math.PI; p.speed[i] = (2 * Math.max(0, u) * Math.hypot(w[2] - w[0], w[3] - w[1])) / SLIDE_S;
    p.sailState[i] = 0; p.heel[i] = 0; p.lines[i] = 0; p.phase[i] = PH_CASTING_OFF; p.slot[i] = dest;
    this.laneW[i] = 0; this.sepW[i] = 0;
  }

  /** 07-M6: the tug's schedule for a tow: when she casts off (the hull's bow a hull length short of the end). */
  private makeTow(r: BoatRt, path: PathRec, tm: LegTiming, t0: number): Tow {
    const ahead = 1.5 * r.loa + TUG_LINE;
    const sRel = Math.max(0, path.length - r.loa - ahead);
    let lo = 0, hi = tm.tHold + tm.tW0 + tm.tTurn + (path.rev ? tm.tAstern : 0) + tm.tf;
    for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; if (this.towS(path, tm, r.loa, m) < sRel) lo = m; else hi = m; }
    const tRel = t0 + hi, sEnd = sRel + ahead;
    return { path, tm, t0, loa: r.loa, ahead, tRel, sEnd, tEnd: tRel + (Math.PI * TUG_R) / TUG_V + sEnd / TUG_V };
  }

  /** Arc length along the tow path's main run of the towed hull at leg time lt (0 before it starts). */
  private towS(path: PathRec, tm: LegTiming, loa: number, lt: number): number {
    const o = this.tmp;
    o[IO_T] = lt; o[IO_LOA] = loa;
    evalLeg(path, tm, o);
    return lt < tm.tHold + tm.tW0 + tm.tTurn + (path.rev ? tm.tAstern : 0) ? 0 : o[IO_S];
  }

  /** Tug poses at this.t (after the hulls). */
  private poseTugs(): void {
    const T = this.tugs, t = this.t, o = this.tmp, L = this.layout;
    T.count = 0;
    for (let i = 0; i < this.rt.length && T.count < MAX_TUGS; i++) {
      const tw = this.rt[i].tow;
      if (!tw) continue;
      if (t >= tw.tEnd || t < tw.t0) { if (t >= tw.tEnd) this.rt[i].tow = null; continue; }
      const k = T.count++;
      const p = tw.path;
      if (t < tw.tRel) {
        o[IO_S] = Math.min(tw.sEnd, this.towS(p, tw.tm, tw.loa, t - tw.t0) + tw.ahead); samplePath(p, o);
        T.x[k] = o[0]; T.z[k] = o[1]; T.heading[k] = o[2]; T.of[k] = i;
        continue;
      }
      T.of[k] = -1;
      // cast off: a U-turn to starboard, then home along the tow's path, standing off to her starboard
      const u = t - tw.tRel, tTurn = (Math.PI * TUG_R) / TUG_V;
      o[IO_S] = u < tTurn ? tw.sEnd : Math.max(0, tw.sEnd - TUG_V * (u - tTurn)); samplePath(p, o);
      const h = o[2], fx = Math.sin(h), fz = Math.cos(h), sx = -fz, sz = fx;
      if (u < tTurn) {
        const a = (Math.PI * u) / tTurn, cx = o[0] + sx * TUG_R, cz = o[1] + sz * TUG_R;
        T.x[k] = cx - sx * TUG_R * Math.cos(a) + fx * TUG_R * Math.sin(a); T.z[k] = cz - sz * TUG_R * Math.cos(a) + fz * TUG_R * Math.sin(a);
        T.heading[k] = h - a;
      } else {
        // (closer in where the water is narrow)
        const room = L.field ? Math.min(1, Math.max(0.3, (clearance(L.field, o[0], o[1]) - 4) / 10)) : 1;
        T.x[k] = o[0] + sx * 2 * TUG_R * room; T.z[k] = o[1] + sz * 2 * TUG_R * room; T.heading[k] = h + Math.PI;
      }
    }
  }

  /** Back into the plan at its next dock window that a voyage from here can still make. */
  private rejoin(i: number, t: number, at: { x: number; z: number; h: number; slot: number; moving: boolean }): void {
    const r = this.rt[i];
    const p = r.plan;
    if (p.kind === "none") { this.placeStatic(i); return; }
    if (this.frozen) { this.voyageTo(i, t, at, this.freeSlotNear(p.staticSlot >= 0 ? p.staticSlot : p.segSlot[0], r), EV_REJOIN, END_HOLD, PH_DOCKED, null); return; }
    if (p.kind === "static" && !p.outing) { this.voyageTo(i, t, at, p.staticSlot, EV_REJOIN, END_PLAN, PH_DOCKED, null); return; }
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
      const dist = hypot(slot.x - at.x, slot.z - at.z) * 1.4 + 60;
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
    // 07-M12: she slides stern first down the ways (lp[0] → lp[1]), then swings round in the water and sails
    this.launching = true;
    this.rejoin(i, t, { x: b[0], z: b[1], h: h + Math.PI, slot: -1, moving: true });
    this.launching = false;
    const v = this.rt[i].voyage;
    if (v && v.kind === EV_LAUNCH) { v.t0 += SLIDE_S; v.launch = [a[0], a[1], b[0], b[1], h]; }
  }

  /** After a re-plan: hulls whose planned place changed sail there; the rest just carry on. */
  private resyncFrom(i: number, t: number, at: { x: number; z: number; px?: number; pz?: number; h: number; slot: number; moving: boolean }): void {
    const r = this.rt[i];
    r.mode = MODE_PLAN; r.voyage = null;
    this.t = t;
    this.evalBoat(i);
    const p = this.pose;
    // (a raft index from the old plan can name a different raft now: same slot means same place)
    const same = !at.moving && p.slot[i] === at.slot && at.slot < this.baseSlots && (p.phase[i] === PH_DOCKED || p.phase[i] === PH_MOORED);
    const close = hypot(p.position[i * 3] - (at.x - (at.px ?? 0)), p.position[i * 3 + 2] - (at.z - (at.pz ?? 0))) < 1.5;
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
        // no waiting at the far end: the berth is only ours on arrival
        const tm = { ...r.legTm, tHoldEnd: 0 };
        r.voyage = { path: r.legPath, tm, t0: t - r.legLocal, D: r.legD - r.legTm.tHoldEnd, endSlot: dest, endMode: END_HOLD, endPhase: PH_DOCKED, kind: EV_STALE, startHeading: 0 };
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

  /**
   * Bow heading for a hull lying at a swinging slot, written to tmp[10] (no boxed return): into the
   * wind, turned by a tidal set that varies across the bay and slowly sweeps it, plus the hull's own
   * yaw (±14-24°, its own periods). Neighbours lie alike but never in lockstep.
   */
  private swingHeading(r: BoatRt, s: Slot): void {
    const t = this.t, TAU = 2 * Math.PI;
    const tide = 0.22 * Math.sin(s.x / 95 + 0.4) + 0.16 * Math.cos(s.z / 70 - s.x / 160)
      + 0.24 * Math.sin((TAU * t) / 1800 + s.x / 130 + s.z / 170);
    this.tmp[10] = this.layout.windFrom + windVeer(t - r.lag) + tide + 0.1 * Math.sin((TAU * t) / 432)
      + r.yawA * Math.sin((TAU * t) / r.yawP + r.phi) + 0.07 * Math.sin((TAU * t) / r.yawP2 + r.phi * 2.3);
  }

  /**
   * The fender bump, `tau` seconds after arrival (negative: just before): she carries a little way into
   * the fenders, springs back, and settles on her lines. Writes the offset to tmp[13..14] and the roll
   * it gives an alongside hull to tmp[15]. Bow-in slips and pontoons: along the bow; alongside: toward
   * the quay; swinging slots: none.
   */
  private bumpAt(s: Slot, r: BoatRt, tau: number): void {
    const o = this.tmp;
    o[13] = 0; o[14] = 0; o[15] = 0;
    const u = tau + BUMP_T0;
    if (s.swing > 0 || !(u > 0 && u < BUMP_END)) return;
    const win = 1 - (u / BUMP_END) ** 4;
    const b = r.bumpK * Math.sin(BUMP_W * u) * Math.exp(-u / BUMP_DECAY) * win;
    let dx = Math.sin(s.heading), dz = Math.cos(s.heading);
    if (s.mode === "alongside" && s.warp) {
      const wl = hypot(s.warp[0], s.warp[1]) || 1;
      dx = -s.warp[0] / wl; dz = -s.warp[1] / wl;
      o[15] = (b / BUMP_A) * 0.035 * r.side;
    }
    o[13] = dx * b; o[14] = dz * b;
  }

  /** Rest pose; this.blend (0..1) blends from the nominal (path end) pose to the living one. */
  private restPose(i: number, r: BoatRt, s: Slot, phase: number): void {
    const p = this.pose, t = this.t, w = this.blend, TAU = 2 * Math.PI;
    let x = s.x, z = s.z, h = s.heading;
    if (s.swing > 0) {
      this.swingHeading(r, s);
      let d = (this.tmp[10] - s.heading + Math.PI) % TAU; // wrapAngle, inlined
      if (d < 0) d += TAU;
      const hh = s.heading + (d - Math.PI) * w;
      // the bow surges on its buoy / snubs at its anchor
      const sw = s.swing + w * 0.3 * Math.sin((TAU * t) / r.yawP2 + r.phi * 1.7);
      x = s.x - Math.sin(hh) * sw; z = s.z - Math.cos(hh) * sw; h = hh;
    } else if (s.kind !== "wreck") {
      // alongside / in a slip: a little surge and yaw, held by the lines (they take up once made fast)
      const held = 0.35 + 0.65 * Math.min(1, Math.max(0, this.dockT / LINES_IN_S));
      const su = w * held * r.surge * Math.sin((TAU * t) / 24 + r.phi);
      x += Math.sin(h) * su; z += Math.cos(h) * su;
      h += w * (s.mode === "pontoon" ? 0.04 : 0.012) * Math.sin((TAU * t) / r.yawP + r.phi * 0.7);
      this.bumpAt(s, r, this.dockT);
      x += this.tmp[13]; z += this.tmp[14];
    }
    p.position[i * 3] = x; p.position[i * 3 + 1] = 0; p.position[i * 3 + 2] = z;
    p.heading[i] = h; p.speed[i] = 0; p.sailState[i] = sailSetAt(s) ? 1 : 0;
    this.settled[i] = w;
    p.phase[i] = phase === PH_DOCKED && s.swing > 0 ? (s.kind === "shoals" ? PH_ANCHORED : PH_MOORED) : phase;
    p.slot[i] = s.index;
    // lines: made fast after arrival, let go before casting off (anchor rodes and wrecks: none to throw)
    const inL = Math.min(1, Math.max(0, this.dockT / LINES_IN_S)), outL = Math.min(1, Math.max(0, (this.castT - 0.5) / LINES_OUT_S));
    p.lines[i] = s.kind === "wreck" ? 0 : Math.min(inL, outL);
    let heel = 0;
    if (r.shoals && s.kind === "shoals") {
      // aground and pounding: an irregular roll on top of the list, the loose sail flogging
      const side = -r.side;
      heel = side * (r.heelBase + 0.045 * Math.sin((TAU * t) / 7.2 + r.phi) + 0.025 * Math.sin((TAU * t) / 3.6 + r.phi * 2) + 0.015 * Math.sin((TAU * t) / 2.4 + r.phi * 3));
      p.sailState[i] = 0.22 + 0.08 * Math.sin((TAU * t) / 2.4 + r.phi);
    } else if (r.wrecked) heel = -r.side * (0.36 + 0.24 * r.list) + 0.012 * Math.sin((TAU * t) / 12 + r.phi);
    else if (s.mode === "alongside") heel = this.tmp[15]; // the fender touch rolls her off the quay a little
    p.heel[i] = heel;
    this.laneW[i] = 0;
  }

  /** Leg pose at leg-local time this.legT. */
  private writeLeg(i: number, r: BoatRt, path: PathRec, tm: LegTiming, dest: number, from = -1): void {
    const o = this.tmp;
    o[IO_T] = this.legT; o[IO_LOA] = r.loa;
    evalLeg(path, tm, o);
    const p = this.pose;
    const code = o[5];
    const tau = this.legT - arrivalT(tm, path);
    if ((code === LEG_HOLD && from >= 0) || code === LEG_HOLD_END) {
      // spare time before casting off / once in: at the berth, which is ours meanwhile
      this.blend = 0;
      if (code === LEG_HOLD) { this.castT = tm.tHold - this.legT; this.dockT = 1e9; } else { this.dockT = tau; this.castT = 1e9; }
      this.restPose(i, r, this.layout.slots[code === LEG_HOLD_END ? dest : from], PH_DOCKED);
      return;
    }
    p.lines[i] = 0;
    if (tau > -BUMP_T0 && dest >= 0) {
      // the last moment of the glide in: she touches the fenders
      this.bumpAt(this.layout.slots[dest], r, tau);
      o[0] += o[13]; o[1] += o[14];
    }
    p.position[i * 3] = o[0]; p.position[i * 3 + 1] = 0; p.position[i * 3 + 2] = o[1];
    p.heading[i] = o[2]; p.speed[i] = o[3]; p.sailState[i] = o[4];
    this.laneW[i] = o[IO_LANE]; this.sepW[i] = o[IO_SEP]; this.legV[i] = tm.v;
    p.phase[i] = code === LEG_CAST_OFF || code === LEG_TURN || code === LEG_HOLD ? PH_CASTING_OFF : code === LEG_APPROACH ? PH_APPROACHING : PH_SAILING;
    p.slot[i] = dest;
    // heel to leeward with the sail drawing (decorative; wind strength follows DEWS weather), by the point of
    // sail (07-M1): ∝ sin²θ, most on a beam reach, upright head to wind and on a dead run (and so continuous
    // through a tack or a gybe: no snap from one side to the other)
    const sa = Math.sin(this.wind.fromRad - o[2]);
    p.heel[i] = sa * Math.abs(sa) * o[4] * (0.05 + 0.1 * this.wind.strength);
    if (this.vKind === EV_TO_SHOALS) {
      // adrift (07-M7): sail half loose and flogging, her head wandering, the list of the Shoals coming on
      const TAU = 2 * Math.PI, t = this.t, rem = o[6];
      const prog = Math.min(1, Math.max(0, this.legT / Math.max(1, arrivalT(tm, path))));
      const wander = Math.min(1, this.legT / 20) * Math.min(1, Math.max(0, rem / (r.loa * 2)));
      p.heading[i] += ADRIFT_YAW * wander * (0.7 * Math.sin((TAU * t) / 23 + r.phi) + 0.3 * Math.sin((TAU * t) / 9.5 + r.phi * 1.7));
      p.sailState[i] = Math.min(p.sailState[i], 0.25 + 0.08 * Math.sin((TAU * t) / 2.4 + r.phi));
      p.heel[i] = -r.side * r.heelBase * prog * prog * (3 - 2 * prog) + 0.03 * Math.sin((TAU * t) / 6.5 + r.phi);
    } else if (this.vFromShoals) {
      // recovered (07-M7): her canvas sheeted home, she comes upright
      const k0 = Math.min(1, this.legT / SHEET_HOME_S), k = k0 * k0 * (3 - 2 * k0);
      p.sailState[i] = Math.min(p.sailState[i], 0.25 + 0.75 * k);
      p.heel[i] = p.heel[i] * k - r.side * r.heelBase * (1 - k);
    }
    if (r.wrecked) {
      // her last voyage (07-M6): canvas struck, under tow, a list growing as she goes
      p.sailState[i] = 0;
      const prog = Math.min(1, Math.max(0, this.legT / Math.max(1, arrivalT(tm, path))));
      p.heel[i] = -r.side * (0.03 + 0.12 * prog * prog);
    }
  }

  private evalBoat(i: number): void {
    const t = this.t;
    const r = this.rt[i];
    const p = this.pose;
    const L = this.layout;
    p.event[i] = EV_NONE;
    p.outing[i] = 0;
    this.laneW[i] = 0;
    this.dockT = 1e9; this.castT = 1e9; this.pushF[i] = 1;
    p.pitch[i] = 0; p.position[i * 3 + 1] = 0;
    if (r.mode === MODE_VOYAGE && r.voyage) {
      const v = r.voyage;
      const tl = t - v.t0;
      if (tl < 0 && v.launch) { this.slide(i, v.launch, 1 + tl / SLIDE_S, v.endSlot); p.event[i] = EV_LAUNCH; return; }
      if (tl < v.D) {
        this.legT = tl; this.vKind = v.kind; this.vFromShoals = !!v.fromShoals;
        this.writeLeg(i, r, v.path, v.tm, v.endSlot); p.event[i] = v.kind;
        this.vKind = 0; this.vFromShoals = false;
        // the splash: stern first into the water, her bow pitching up and settling (07-M12)
        if (v.launch && tl < 5 * SPLASH_DECAY) p.pitch[i] = SPLASH_PITCH * Math.exp(-tl / SPLASH_DECAY) * Math.cos((2 * Math.PI * tl) / SPLASH_T);
        // and her canvas is bent on and hoisted only once she has swung round, afloat
        if (v.launch) { const k = Math.min(1, Math.max(0, (tl - 10) / 20)); p.sailState[i] = Math.min(p.sailState[i], k * k * (3 - 2 * k)); }
        const f = Math.min(1, tl / PUSH_FADE_S);
        this.pushF[i] = f * f * (3 - 2 * f);
        return;
      }
      r.voyage = null;
      if (v.endMode === END_HOLD || this.frozen) { r.mode = MODE_HOLD; r.holdSlot = v.endSlot; r.holdPhase = v.endPhase; r.holdSince = v.t0 + arrivalT(v.tm, v.path); }
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
          // that berth is someone else's now: she is already leaving it, not lying in it
          const nv = r.voyage as Voyage | null;
          if (r.mode === MODE_VOYAGE && nv) { this.legT = 0; this.writeLeg(i, r, nv.path, nv.tm, nv.endSlot); p.event[i] = nv.kind; }
        }
        return;
      }
    }
    if (r.mode === MODE_HOLD) {
      if (r.holdSlot < 0) { p.speed[i] = 0; p.sailState[i] = 1; p.phase[i] = PH_ANCHORED; p.lines[i] = 0; return; }
      this.blend = 1;
      this.dockT = t - r.holdSince;
      this.restPose(i, r, L.slots[r.holdSlot], r.holdPhase);
      return;
    }
    // MODE_PLAN
    const plan = r.plan;
    if (plan.kind === "static" && !plan.outing) { this.blend = 1; this.restPose(i, r, L.slots[plan.staticSlot], PH_DOCKED); return; }
    if (plan.kind === "none") { p.speed[i] = 0; p.phase[i] = PH_ANCHORED; p.slot[i] = -1; p.lines[i] = 0; return; }
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
          if (into < r.legLate && !r.legStay) { this.legT = plan.segEnd[prv] - plan.segStart[prv] + r.legEarly + into; this.planLeg(i, r, prv); return; }
        } else if (toEnd < cap) {
          this.ensureLeg(r, nxt);
          if (toEnd < r.legEarly && !r.legStay) { this.legT = r.legEarly - toEnd; this.planLeg(i, r, nxt); return; }
        }
      }
      if (toEnd < PREFETCH_S && nSeg > 1 && r.prefetchSeg !== (c + 1) % nSeg) {
        const nxt = (c + 1) % nSeg, sc = plan.segLoop[nxt], key = pathKey(plan.segFrom[nxt], plan.segSlot[nxt], r.cls, sc);
        r.prefetchSeg = nxt;
        if (!this.pathCache.has(key) && !this.prefetchKeys.has(key)) { this.prefetchKeys.add(key); this.prefetch.push([i, plan.segFrom[nxt], plan.segSlot[nxt], sc]); }
      }
      const lateOff = r.legSeg === (c - 1 + nSeg) % nSeg && !r.legStay ? r.legLate : 0, earlyOff = r.legSeg === (c + 1) % nSeg && !r.legStay ? r.legEarly : 0;
      if (nSeg > 1 && !r.legStay) {
        // when she came in (the leg's spare time at the berth was spent here already) / casts off
        if (r.legSeg === (c - 1 + nSeg) % nSeg && r.legPath) this.dockT = into - lateOff + r.legTm.tHoldEnd;
        else if (r.legSeg === (c + 1) % nSeg) this.castT = toEnd - earlyOff + r.legTm.tHold;
      }
      const w = s.swing > 0 ? Math.min(1, Math.max(0, Math.min(into - lateOff, toEnd - earlyOff)) / SETTLE_S) : 1;
      this.blend = w * w * (3 - 2 * w);
      this.restPose(i, r, s, PH_DOCKED);
      return;
    }
    this.ensureLeg(r, c);
    if (r.legStay) { this.blend = 1; this.restPose(i, r, L.slots[plan.segSlot[c]], PH_DOCKED); return; }
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
    const path = this.legPathFor(plan.segFrom[seg], plan.segSlot[seg], r, plan.segLoop[seg]);
    const from = L.slots[plan.segFrom[seg]], to = L.slots[plan.segSlot[seg]];
    const D = plan.segEnd[seg] - plan.segStart[seg];
    const tm = legTiming(path, 1e9, r.loa, r.legTm, from.heading, to.heading);
    const extra = Math.max(0, tm.minD - D);
    const pd = (seg - 1 + nSeg) % nSeg, nd = (seg + 1) % nSeg;
    const capE = 0.25 * (plan.segEnd[pd] - plan.segStart[pd]), capL = 0.25 * (plan.segEnd[nd] - plan.segStart[nd]);
    const late = Math.min(capL, extra / 2);
    const early = Math.min(capE, extra - late);
    r.legEarly = early; r.legLate = Math.min(capL, extra - early);
    r.legD = D + r.legEarly + r.legLate;
    legTiming(path, r.legD, r.loa, r.legTm, from.heading, to.heading);
    r.legPath = path; r.legSeg = seg;
    r.legStay = plan.segFrom[seg] === plan.segSlot[seg] && this.badOuting.has(pathKey(plan.segFrom[seg], plan.segSlot[seg], r.cls, plan.segLoop[seg]));
  }

  private planLeg(i: number, r: BoatRt, seg: number): void {
    r.legLocal = this.legT;
    this.writeLeg(i, r, r.legPath!, r.legTm, r.plan.segSlot[seg], r.plan.segFrom[seg]);
    const ph = this.pose.phase[i];
    this.pose.outing[i] = r.plan.outing && (ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING) ? 1 : 0;
  }

  /**
   * Hulls under way keep to their lane and give way: a pure function of this instant's poses
   * (deterministic, history-free). Lane discipline first: across the lane by the speed she is making
   * (slow hulls keep to starboard, fast ones overtake to port), so a faster hull passes beside a slower
   * one rather than through it. Then a give-way pass shoves each hull under way sideways out of any
   * other hull's water: still hulls never move, an overtaking hull keeps clear, and the smaller hull
   * yields to the bigger one. Which side to give is chosen from the lane positions alone (never from
   * this frame's shoves), so it cannot flip-flop from one frame to the next.
   */
  private separate(): void {
    const p = this.pose, n = p.count, rt = this.rt, L = this.layout;
    const pos = p.position, sx = this.sepX, sz = this.sepZ, lx = this.laneX, lz = this.laneZ;
    const G = 36, CELL = 36, O = 640; // a cell spans the longest give-way reach
    const head = this.cellHead, next = this.cellNext;
    head.fill(-1);
    p.drift.fill(0);
    let movers = 0;
    for (let i = 0; i < n; i++) {
      const c = Math.min(G - 1, Math.max(0, Math.floor((pos[i * 3] + O) / CELL))) * G + Math.min(G - 1, Math.max(0, Math.floor((pos[i * 3 + 2] + O) / CELL)));
      next[i] = head[c]; head[c] = i;
      const ph = p.phase[i];
      sx[i] = 0; sz[i] = 0; lx[i] = 0; lz[i] = 0; this.pushX[i] = 0; this.pushZ[i] = 0;
      if (ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING) {
        movers++;
        const lw = this.laneW[i];
        if (lw > 0) {
          const h = p.heading[i];
          // starboard (+) for the slow, port (-) for the fast, plus a little of her own
          const k = Math.min(1, Math.max(-1, (LANE_V_MID - this.legV[i]) / LANE_V_SPAN));
          let o = (k * LANE_HALF + rt[i].laneOff) * lw;
          // the lane is narrower past moorings and the reef, and where it runs near a quay or the shore
          const ko = L.keepOff;
          if (ko && o !== 0) {
            const ox = pos[i * 3] - Math.cos(h) * o, oz = pos[i * 3 + 2] + Math.sin(h) * o;
            let c = clearance(ko, ox, oz) / 14;
            if (L.field) c = Math.min(c, (clearance(L.field, ox, oz) - rt[i].beam / 2) / 8);
            const f = Math.min(1, Math.max(0, c - rt[i].beam / 28));
            o *= f * f * (3 - 2 * f);
          }
          lx[i] = -Math.cos(h) * o; lz[i] = Math.sin(h) * o;
          sx[i] = lx[i]; sz[i] = lz[i];
        }
      }
    }
    if (!movers) return;
    for (let pass = 0; pass < SEP_PASSES; pass++) {
      for (let i = 0; i < n; i++) {
        const ph = p.phase[i];
        if (!(ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING)) continue;
        const r = rt[i];
        // berthing / leaving a berth: slips and fairways are laid out with room; only true overlaps count
        const sw = this.sepW[i];
        const ramp = 1 + (SEP_RAMP - 1) * sw, gap = 0.4 + (SEP_GAP - 0.4) * sw;
        const hi = p.heading[i], fx = Math.sin(hi), fz = Math.cos(hi), stx = -fz, stz = fx;
        // each pass shoves her afresh from her lane position, against the others' latest
        const x0 = pos[i * 3] + lx[i], z0 = pos[i * 3 + 2] + lz[i], xi = x0, zi = z0;
        const ci = Math.min(G - 1, Math.max(0, Math.floor((pos[i * 3] + O) / CELL))), cj = Math.min(G - 1, Math.max(0, Math.floor((pos[i * 3 + 2] + O) / CELL)));
        const sI = this.stI, sJ = this.stJ, fxl = fx * r.loa, fzl = fz * r.loa;
        for (let u = 0; u < 5; u++) { sI[u] = fxl * SEP_K[u]; sI[u + 5] = fzl * SEP_K[u]; }
        let push = 0;
        for (let a = Math.max(0, ci - 1); a <= Math.min(G - 1, ci + 1); a++) for (let b = Math.max(0, cj - 1); b <= Math.min(G - 1, cj + 1); b++) {
          for (let j = head[a * G + b]; j >= 0; j = next[j]) {
            if (j === i) continue;
            const rj = rt[j];
            const xj = pos[j * 3] + sx[j], zj = pos[j * 3 + 2] + sz[j];
            const dx = xi - xj, dz = zi - zj;
            const reach = (r.loa + rj.loa) / 2 + gap + ramp;
            if (dx * dx + dz * dz > reach * reach) continue;
            const hj = p.heading[j], gx = Math.sin(hj), gz = Math.cos(hj);
            // deepest overlap of the stations: the nearest pair (one square root, not 25: the same value)
            const gxl = gx * rj.loa, gzl = gz * rj.loa;
            for (let v = 0; v < 5; v++) { sJ[v] = gxl * SEP_K[v]; sJ[v + 5] = gzl * SEP_K[v]; }
            let m2 = Infinity;
            for (let u = 0; u < 5; u++) for (let v = 0; v < 5; v++) {
              const ex = dx + sI[u] - sJ[v], ez = dz + sI[u + 5] - sJ[v + 5];
              const d2 = ex * ex + ez * ez;
              if (d2 < m2) m2 = d2;
            }
            let pen = (r.beam + rj.beam) / 2 + gap + ramp - Math.sqrt(m2);
            if (pen <= 0) continue;
            pen = pen < ramp ? (pen * pen) / (2 * ramp) : pen - ramp / 2;
            const phj = p.phase[j];
            const mj = phj === PH_CASTING_OFF || phj === PH_SAILING || phj === PH_APPROACHING;
            // the side, from the lane positions only (stable): she keeps to the side of the other she is
            // already on; dead level, the lower index goes to starboard
            const lat0 = (x0 - pos[j * 3] - lx[j]) * stx + (z0 - pos[j * 3 + 2] - lz[j]) * stz;
            // (a still hull: decisively off the side she is on, never half a shove)
            let sgn = Math.tanh(lat0 / 0.5 + (i < j ? 0.3 : -0.3));
            // running together, the faster hull passes to port of the slower (a side that holds while the
            // paths converge or cross at a shallow angle; the lane order only breaks a tie). Twins (off one
            // plan: the same lane line at the same pace) break it decisively, or they run on stacked.
            const dv = p.speed[j] - p.speed[i];
            const tie = 0.2 + TWIN_TIE * Math.max(0, 1 - Math.abs(lat0) / 1.5) * Math.max(0, 1 - Math.abs(dv) / 0.3);
            const sPar = Math.tanh(dv / 0.2 + lat0 / 3 + (i < j ? tie : -tie));
            const cosd = fx * gx + fz * gz;
            // bigger hull, right of way: the yield share by size (squared, so a skiff gives nearly all of it)
            const li = r.loa * r.loa, lj = rj.loa * rj.loa;
            const sizeW = lj / (li + lj);
            let w = 1;
            if (mj) {
              const wPar = Math.min(1, Math.max(0, (cosd - 0.45) / 0.4)), wHead = Math.min(1, Math.max(0, (-cosd - 0.45) / 0.4));
              // head-on, both to starboard; crossing, aim astern of the other (stable through the crossing)
              const sCross = Math.tanh(-4 * (stx * gx + stz * gz));
              sgn = wPar * sPar + wHead + (1 - wPar - wHead) * sCross;
              // the overtaking hull (the other ahead) keeps clear; a big one overtaking a small one, the small also steps aside
              const ahead = -(dx * fx + dz * fz) > 0 ? 1 : 0;
              w = wPar * Math.max(0.15 + 0.85 * ahead, sizeW) + (1 - wPar) * sizeW;
              // both give way, so each shoves against the other's shove and the pair settles short of clear
              // water (two equal hulls: ~2/3 of the way): share the whole of it instead
              const wj = wPar * Math.max(0.15 + 0.85 * (1 - ahead), 1 - sizeW) + (1 - wPar) * (1 - sizeW);
              w /= Math.min(1, w + wj - w * wj);
            }
            push += sgn * pen * w;
          }
        }
        if (push === 0) { sx[i] = lx[i]; sz[i] = lz[i]; this.pushX[i] = 0; this.pushZ[i] = 0; continue; }
        const cap = Math.max(r.beam + 2.5, 5);
        push = Math.max(-cap, Math.min(cap, push)) * this.pushF[i];
        let ox = lx[i] + stx * push, oz = lz[i] + stz * push;
        // never into a quay, pier or the shore (eased, so the shove never snaps)
        if (L.field) {
          const c = clearance(L.field, pos[i * 3] + ox, pos[i * 3 + 2] + oz), lo = r.beam / 2 + 0.3;
          const f = Math.min(1, Math.max(0, (c - lo) / 5));
          ox = lx[i] + (ox - lx[i]) * f * f * (3 - 2 * f); oz = lz[i] + (oz - lz[i]) * f * f * (3 - 2 * f);
        }
        this.pushX[i] = ox - lx[i]; this.pushZ[i] = oz - lz[i];
        sx[i] = ox; sz[i] = oz;
      }
    }
    const cw = Math.min(1, Math.max(0, (this.t - this.carryT0) / PUSH_FADE_S)), carry = cw < 1 ? 1 - cw * cw * (3 - 2 * cw) : 0;
    const drift = p.drift;
    for (let i = 0; i < n; i++) {
      if (carry > 0 && (this.carryX[i] !== 0 || this.carryZ[i] !== 0)) {
        const ph = p.phase[i];
        if (ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING) {
          sx[i] += (this.carryX[i] - sx[i]) * carry; sz[i] += (this.carryZ[i] - sz[i]) * carry;
        }
      }
      if (sx[i] === 0 && sz[i] === 0) continue;
      this.keepOffHard(i);
      pos[i * 3] += sx[i]; pos[i * 3 + 2] += sz[i];
      drift[i * 2] = sx[i]; drift[i * 2 + 1] = sz[i];
    }
    this.mooredYield();
  }

  /**
   * The lane offset and the give-way shove never put any part of the hull (bow, stern, either side)
   * on land or over a deck, nor closer to them than her path already runs: the offset is scaled back
   * to what the water allows (linearly in the clearance it costs, so it eases rather than snaps).
   */
  private keepOffHard(i: number): void {
    const L = this.layout, p = this.pose, r = this.rt[i];
    const x = p.position[i * 3], z = p.position[i * 3 + 2], h = p.heading[i];
    const ox = this.sepX[i], oz = this.sepZ[i], ol = hypot(ox, oz);
    if (L.field && clearance(L.field, x, z) > r.loa / 2 + ol + 3) return;
    const c0 = hullClearance(L.hard, x, z, h, r.loa, r.beam);
    const want = Math.min(c0, hullMargin(r.loa) * 0.8);
    const c1 = hullClearance(L.hard, x + ox, z + oz, h, r.loa, r.beam);
    if (c1 >= want) return;
    let f = c0 - c1 > 1e-6 ? Math.min(1, Math.max(0, (c0 - want) / (c0 - c1))) : 0;
    // the clearance is not quite linear in the offset: back off until it holds
    for (let k = 0; k < 6 && f > 0 && hullClearance(L.hard, x + ox * f, z + oz * f, h, r.loa, r.beam) < want; k++) f = k < 5 ? f * 0.7 : 0;
    this.sepX[i] = ox * f; this.sepZ[i] = oz * f;
    this.laneX[i] *= f; this.laneZ[i] *= f;
    this.pushX[i] *= f; this.pushZ[i] *= f;
  }

  /**
   * A hull on a swinging mooring sheers away from a hull passing close: she swings round her buoy (on
   * the same rode, so she never drags), never more than MOORED_SHEER radians. Pure, like the give-way.
   */
  private mooredYield(): void {
    const p = this.pose, n = p.count, rt = this.rt, L = this.layout, pos = p.position;
    const G = 36, CELL = 36, O = 640, head = this.cellHead, next = this.cellNext;
    for (let i = 0; i < n; i++) {
      if (p.phase[i] !== PH_MOORED) continue;
      const s = L.slots[p.slot[i]];
      if (!s || s.swing <= 0) continue;
      const r = rt[i], hi = p.heading[i], fx = Math.sin(hi), fz = Math.cos(hi);
      const xi = pos[i * 3], zi = pos[i * 3 + 2];
      const ci = Math.min(G - 1, Math.max(0, Math.floor((xi + O) / CELL))), cj = Math.min(G - 1, Math.max(0, Math.floor((zi + O) / CELL)));
      const sI = this.stI, sJ = this.stJ, fxl = fx * r.loa, fzl = fz * r.loa;
      for (let u = 0; u < 5; u++) { sI[u] = fxl * SEP_K[u]; sI[u + 5] = fzl * SEP_K[u]; }
      let px = 0, pz = 0;
      for (let a = Math.max(0, ci - 1); a <= Math.min(G - 1, ci + 1); a++) for (let b = Math.max(0, cj - 1); b <= Math.min(G - 1, cj + 1); b++) {
        for (let j = head[a * G + b]; j >= 0; j = next[j]) {
          const phj = p.phase[j];
          if (!(phj === PH_CASTING_OFF || phj === PH_SAILING || phj === PH_APPROACHING)) continue;
          const rj = rt[j];
          const dx = xi - pos[j * 3], dz = zi - pos[j * 3 + 2];
          const reach = (r.loa + rj.loa) / 2 + 2;
          if (dx * dx + dz * dz > reach * reach) continue;
          const hj = p.heading[j], gx = Math.sin(hj), gz = Math.cos(hj);
          const gxl = gx * rj.loa, gzl = gz * rj.loa;
          for (let v = 0; v < 5; v++) { sJ[v] = gxl * SEP_K[v]; sJ[v + 5] = gzl * SEP_K[v]; }
          // deepest overlap between the two hulls' stations, and which way it pushes her (a pair no nearer than
          // the deepest so far, or than the overlap reach, cannot be deeper: its square root is skipped)
          const reachQ = (r.beam + rj.beam) / 2 + 0.8;
          let pen = 0, nx = 0, nz = 0, best2 = reachQ * reachQ * (1 + 1e-9);
          for (let u = 0; u < 5; u++) for (let v = 0; v < 5; v++) {
            const ex = dx + sI[u] - sJ[v], ez = dz + sI[u + 5] - sJ[v + 5];
            const d2 = ex * ex + ez * ez;
            if (d2 > best2) continue;
            const d = Math.sqrt(d2), q = reachQ - d;
            if (q > pen && d > 1e-3) { pen = q; nx = ex / d; nz = ez / d; best2 = d2; }
          }
          px += nx * pen; pz += nz * pen;
        }
      }
      if (px === 0 && pz === 0) continue;
      // swing round the buoy: the tangential part of the shove, as an angle on her rode
      const bx = s.x, bz = s.z, rx = xi - bx, rz = zi - bz, rl = hypot(rx, rz);
      if (rl < 0.5) continue;
      const tx = -rz / rl, tz = rx / rl;
      // (one about to slip her mooring, or just picked it up, lies as her leg begins / ended: no sheer)
      let da = Math.max(-MOORED_SHEER, Math.min(MOORED_SHEER, (px * tx + pz * tz) / rl)) * this.settled[i];
      // never sheer into a still neighbour (one swung the other way on her own mooring): ease it off
      for (let k = 0; k < 4 && da !== 0 && this.sheerHits(i, bx, bz, rx, rz, da, ci, cj); k++) da = k < 3 ? da * 0.5 : 0;
      if (da === 0) continue;
      const c = Math.cos(da), sn = Math.sin(da);
      const nrx = rx * c - rz * sn, nrz = rx * sn + rz * c;
      pos[i * 3] = bx + nrx; pos[i * 3 + 2] = bz + nrz;
      p.heading[i] = Math.atan2(-nrx, -nrz);
    }
  }

  /** Would hull i, sheered by `da` round her buoy (bx, bz) from rode (rx, rz), overlap a still hull? */
  private sheerHits(i: number, bx: number, bz: number, rx: number, rz: number, da: number, ci: number, cj: number): boolean {
    const p = this.pose, rt = this.rt, pos = p.position, G = 36, head = this.cellHead, next = this.cellNext;
    const c = Math.cos(da), sn = Math.sin(da), nrx = rx * c - rz * sn, nrz = rx * sn + rz * c;
    const xi = bx + nrx, zi = bz + nrz, hi = Math.atan2(-nrx, -nrz), fx = Math.sin(hi), fz = Math.cos(hi), r = rt[i];
    for (let a = Math.max(0, ci - 1); a <= Math.min(G - 1, ci + 1); a++) for (let b = Math.max(0, cj - 1); b <= Math.min(G - 1, cj + 1); b++) {
      for (let j = head[a * G + b]; j >= 0; j = next[j]) {
        const phj = p.phase[j];
        if (j === i || !(phj === PH_DOCKED || phj === PH_MOORED || phj === PH_ANCHORED)) continue;
        const rj = rt[j], dx = xi - pos[j * 3], dz = zi - pos[j * 3 + 2], reach = (r.loa + rj.loa) / 2 + 1;
        if (dx * dx + dz * dz > reach * reach) continue;
        const gx = Math.sin(p.heading[j]), gz = Math.cos(p.heading[j]);
        for (let u = 0; u < 5; u++) for (let v = 0; v < 5; v++) {
          const ex = dx + fx * r.loa * SEP_K[u] - gx * rj.loa * SEP_K[v], ez = dz + fz * r.loa * SEP_K[u] - gz * rj.loa * SEP_K[v];
          if (ex * ex + ez * ez < ((r.beam + rj.beam) / 2 + 0.3) ** 2) return true;
        }
      }
    }
    return false;
  }

  /** Poses for every boat at wall-clock nowMs. Returns the shared buffer (overwritten each call). */
  poseAt(nowMs: number): PoseBuffer {
    const t = nowMs / 1000;
    const n = this.rt.length;
    const st = this.stats;
    this.builtThisFrame = 0;
    st.underWay = 0; st.docked = 0; st.moored = 0; st.anchored = 0; st.voyages = 0; st.outings = 0;
    const prev = this.prevPhase;
    this.t = t;
    this.wind.veer = windVeer(t);
    for (let i = 0; i < n; i++) {
      this.evalBoat(i);
      const ph = this.pose.phase[i];
      if (ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING) { st.underWay++; if (this.pose.outing[i]) st.outings++; }
      else if (ph === PH_DOCKED) st.docked++;
      else if (ph === PH_MOORED) st.moored++;
      else st.anchored++;
      if (prev[i] === PH_APPROACHING && (ph === PH_DOCKED || ph === PH_MOORED)) { st.dockings++; this.emit(this.rt[i].id, "docking", this.pose.position[i * 3], this.pose.position[i * 3 + 2]); }
      prev[i] = ph;
      if (this.pose.event[i] !== EV_NONE) st.voyages++;
    }
    this.separate();
    this.poseTugs();
    // at most one look-ahead path per frame, and none on a frame that already built one
    while (this.builtThisFrame === 0 && this.prefetch.length) {
      const [bi, from, to, sc] = this.prefetch.shift()!;
      const r = this.rt[bi];
      this.prefetchKeys.delete(r ? pathKey(from, to, r.cls, sc) : "");
      if (r && from < this.layout.slots.length && to < this.layout.slots.length) this.legPathFor(from, to, r, sc);
    }
    this.posed = true;
    return this.pose;
  }
}
