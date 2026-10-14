/**
 * Leg paths: a control polyline (berth departure → lane graph → berth approach) is filleted with
 * quadratic corner arcs (G1-smooth heading, turn radius ∝ hull length) and resampled at uniform
 * arc length, so a pose lookup is O(1) and speed along the path is exactly what the timing says.
 */
import type { Vec2 } from "../layout/types";
import { clearance, openWaterFactor, type ObstacleField } from "./obstacles";

export interface SubPath {
  /** Uniformly spaced samples, x,z interleaved. */
  pts: Float32Array;
  /** Unit tangent heading at each sample (direction of travel along (sin h, cos h)). */
  hdg: Float32Array;
  n: number;
  ds: number;
  length: number;
}

/**
 * One leg, in up to four moves: warp off the berth sideways (alongside berths), back out astern on a
 * curve (bow-in berths: no pivoting on the spot), sail the main path forward, warp in alongside.
 */
export interface PathRec extends SubPath {
  /** Relative speed at each sample (1 = harbour speed; slower in bends, up to OPEN_WATER_MAX offshore). */
  vrel: Float32Array;
  /** "Effort" coordinate q = ∫ ds / vrel at each sample; timing runs in q so turns are taken slowly. */
  q: Float32Array;
  Q: number;
  /** s at uniform q steps (n entries over [0, Q]). */
  sOfQ: Float32Array;
  /** Astern prefix, travelled backwards (hull heading = tangent + π), ending where the main path starts. */
  rev: SubPath | null;
  /** Warp off: [x, z, dx, dz, heading] — from the berth (x, z) by (dx, dz) to the leg's start, heading held. */
  w0: Float32Array | null;
  /** Warp in: [dx, dz, heading] — from the main path's end to the berth. */
  w1: Float32Array | null;
  /** Main-path arc range that runs the lanes (per-hull lane offsets apply there, faded 30 m each side). */
  laneA: number;
  laneB: number;
  /** The leg starts from a hull already under way (a voyage): no cast-off phase. */
  underway?: boolean;
}

/** Harbour cruising speed (m/s) for a hull: ~3 m/s for a 13 m cutter, scaled by √LOA (no toy boats). */
export function cruiseSpeed(loa: number): number {
  return 3.0 * Math.sqrt(Math.max(3, loa) / 13);
}
/** Gentle acceleration (m/s²): sailing hulls gather and lose way slowly. */
export const ACCEL = 0.12;

const MAX_SAMPLES = 720;
const scratchX: number[] = [];
const scratchZ: number[] = [];

function dedupe(points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.3) out.push(p);
  }
  return out;
}

/**
 * Merge interior vertices closer than `minGap` (lane node + approach start a few metres apart make a
 * compound hairpin no single-vertex test sees). The first `head` and last `tail` points are kept.
 */
function mergeClose(pts: Vec2[], head: number, tail: number, minGap: number): Vec2[] {
  const out: Vec2[] = [];
  const lastFree = pts.length - tail;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = out[out.length - 1];
    if (q && i >= head && i < lastFree && out.length > head && Math.hypot(p[0] - q[0], p[1] - q[1]) < minGap) {
      out[out.length - 1] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Detour control segments that cut across land or structures: find the tightest point on the
 * segment and walk it out along the clearance gradient into open water, then re-check both halves.
 * The first `head` segments (backing out of a slip) and the last `tail` (the slip itself) are left
 * alone: there the hull is meant to be close to the pier.
 */
function clearSegments(pts: Vec2[], head: number, tail: number, field: ObstacleField, need: number, keepOff: ObstacleField | null = null, needK = 0): Vec2[] {
  const out: Vec2[] = [pts[0]];
  const lastFree = pts.length - 1 - tail;
  // clearance in units of "need": hard structure, and (softer, interior only) still hulls / no-go zones
  const cl = (x: number, z: number) => {
    const c = clearance(field, x, z) / need;
    return keepOff ? Math.min(c, (clearance(keepOff, x, z) + 0.5) / needK) : c;
  };
  const fix = (a: Vec2, b: Vec2, depth: number): void => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(2, Math.ceil(len / 2));
    let worst = Infinity, wt = 0;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const c = cl(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (c < worst) { worst = c; wt = t; }
    }
    if (worst >= 1 || depth > 6 || len < 6) { out.push(b); return; }
    let px = a[0] + (b[0] - a[0]) * wt, pz = a[1] + (b[1] - a[1]) * wt;
    for (let it = 0; it < 120; it++) {
      const c = cl(px, pz);
      if (c >= 1.25) break;
      const gx = cl(px + 1, pz) - cl(px - 1, pz);
      const gz = cl(px, pz + 1) - cl(px, pz - 1);
      const gl = Math.hypot(gx, gz);
      if (gl < 1e-6) break;
      px += (gx / gl) * 1.5; pz += (gz / gl) * 1.5;
    }
    fix(a, [px, pz], depth + 1);
    fix([px, pz], b, depth + 1);
  };
  for (let i = 1; i < pts.length; i++) {
    if (i - 1 < head || i - 1 >= lastFree) { out.push(pts[i]); continue; }
    fix(out[out.length - 1], pts[i], 0);
  }
  return out;
}

/** Uniform resample of a polyline (xs, zs) at ~`step` metres. */
function resample(xs: ArrayLike<number>, zs: ArrayLike<number>, m: number, step: number, maxN: number): { x: Float64Array; z: Float64Array; n: number; ds: number; length: number } {
  const cum = new Float64Array(m);
  for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  const length = Math.max(cum[m - 1], 1e-3);
  const n = Math.min(maxN, Math.max(2, Math.ceil(length / step) + 1));
  const ds = length / (n - 1);
  const x = new Float64Array(n), z = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (j < m - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j];
    const f = seg > 1e-9 ? Math.min(1, Math.max(0, (s - cum[j]) / seg)) : 0;
    x[i] = xs[j] + (xs[j + 1] - xs[j]) * f;
    z[i] = zs[j] + (zs[j + 1] - zs[j]) * f;
  }
  return { x, z, n, ds, length };
}

export interface PathExtras {
  /** Astern prefix control polyline (from the leg start to the cusp where the main path starts). */
  rev?: Vec2[] | null;
  w0?: [number, number, number, number, number] | null;
  w1?: [number, number, number] | null;
  /** Still hulls and no-go zones: the interior of the path keeps off them. */
  keepOff?: ObstacleField | null;
  /** Control-polyline metres before the lanes start / after they end (lane offsets fade there). */
  headLen?: number;
  tailLen?: number;
  /** Leading control points (the departure arc) kept exactly. */
  headKeep?: number;
}

function subPath(points: readonly Vec2[], step = 0.5): SubPath {
  const xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
  const r = resample(xs, zs, points.length, step, 400);
  const pts = new Float32Array(r.n * 2);
  for (let i = 0; i < r.n; i++) { pts[i * 2] = r.x[i]; pts[i * 2 + 1] = r.z[i]; }
  const hdg = new Float32Array(r.n);
  for (let i = 0; i < r.n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(r.n - 1, i + 1);
    hdg[i] = Math.atan2(pts[b * 2] - pts[a * 2], pts[b * 2 + 1] - pts[a * 2 + 1]);
  }
  return { pts, hdg, n: r.n, ds: r.ds, length: r.length };
}

/**
 * @param points main control polyline, from where the hull starts sailing forward to the end pose
 * @param loa hull length: sets the fillet radius and the smoothing width (turning circle ≥ ~1 LOA)
 * @param tailKeep trailing control points (the final approach) kept exactly
 * @param field clearance field: paths ease off land and structures by ~beam/2 + 2 m
 */
export function buildPath(points: readonly Vec2[], loa: number, tailKeep = 2, field: ObstacleField | null = null, beam = loa * 0.32, extras: PathExtras = {}): PathRec {
  const cornerR = Math.min(26, Math.max(7, loa * 1.4));
  let pts = dedupe(points);
  if (pts.length < 2) pts = [pts[0] ?? [0, 0], [(pts[0]?.[0] ?? 0) + 0.5, pts[0]?.[1] ?? 0]];
  const ctrlLen = (() => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; })();

  const R = Math.max(6, loa * 1.2);
  // the first segment is the hull's own heading at the start: keep it
  const headKeep = Math.max(2, Math.min(extras.headKeep ?? 2, pts.length - 1));
  pts = mergeClose(pts, headKeep, Math.min(tailKeep, pts.length - 1), R * 0.9);
  if (field) pts = dedupe(clearSegments(pts, headKeep - 1, Math.max(0, tailKeep - 2), field, beam / 2 + 2, extras.keepOff ?? null, beam / 2 + 2.5));

  // fillet every interior vertex with a quadratic arc
  scratchX.length = 0; scratchZ.length = 0;
  scratchX.push(pts[0][0]); scratchZ.push(pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], v = pts[i], b = pts[i + 1];
    const lin = Math.hypot(v[0] - a[0], v[1] - a[1]), lout = Math.hypot(b[0] - v[0], b[1] - v[1]);
    const r = Math.min(cornerR, lin * 0.48, lout * 0.48);
    const uix = (v[0] - a[0]) / lin, uiz = (v[1] - a[1]) / lin, uox = (b[0] - v[0]) / lout, uoz = (b[1] - v[1]) / lout;
    const turn = Math.acos(Math.max(-1, Math.min(1, uix * uox + uiz * uoz)));
    const p0x = v[0] - uix * r, p0z = v[1] - uiz * r, p2x = v[0] + uox * r, p2z = v[1] + uoz * r;
    scratchX.push(p0x); scratchZ.push(p0z);
    const steps = Math.max(2, Math.ceil((turn * r) / 0.8));
    for (let k = 1; k < steps; k++) {
      const t = k / steps, mt = 1 - t;
      scratchX.push(mt * mt * p0x + 2 * mt * t * v[0] + t * t * p2x);
      scratchZ.push(mt * mt * p0z + 2 * mt * t * v[1] + t * t * p2z);
    }
    scratchX.push(p2x); scratchZ.push(p2z);
  }
  const last = pts[pts.length - 1];
  scratchX.push(last[0]); scratchZ.push(last[1]);

  // 1 m resample, then diffuse away kinks the fillets could not (short control segments). The start
  // heading and the final berth run are held, with the smoothing easing in past them (no kink where
  // a held stretch meets a smoothed one).
  const r1 = resample(scratchX, scratchZ, scratchX.length, 1.0, 2500);
  const n1 = r1.n, ds1 = r1.ds;
  const holdS = Math.min(loa * 0.6, r1.length * 0.12), holdE = Math.min(loa * 1.0, r1.length * 0.15);
  const taper = Math.max(4, cornerR * 1.2);
  const wgt = new Float64Array(n1);
  for (let i = 0; i < n1; i++) {
    const sa = Math.min(1, Math.max(0, (i * ds1 - holdS) / taper)), sb = Math.min(1, Math.max(0, (r1.length - holdE - i * ds1) / taper));
    wgt[i] = sa * sa * (3 - 2 * sa) * sb * sb * (3 - 2 * sb);
  }
  // ~Gaussian smoothing (3 box passes, running sums: O(n) whatever the width)
  const sigma = (cornerR * 0.45) / ds1;
  const rad = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const x = r1.x, z = r1.z, tx = new Float64Array(n1), tz = new Float64Array(n1);
  const x0 = Float64Array.from(x), z0 = Float64Array.from(z);
  for (let pass = 0; pass < 3; pass++) {
    for (const [src, dst] of [[x, tx], [z, tz]] as const) {
      let sum = 0, cnt = 0;
      for (let j = 0; j <= Math.min(n1 - 1, rad); j++) { sum += src[j]; cnt++; }
      for (let i = 0; i < n1; i++) {
        dst[i] = sum / cnt;
        const out = i - rad, inn = i + rad + 1;
        if (out >= 0) { sum -= src[out]; cnt--; }
        if (inn < n1) { sum += src[inn]; cnt++; }
      }
      for (let i = 1; i < n1 - 1; i++) src[i] = dst[i];
    }
  }
  for (let i = 0; i < n1; i++) { x[i] = x0[i] + (x[i] - x0[i]) * wgt[i]; z[i] = z0[i] + (z[i] - z0[i]) * wgt[i]; }
  // curvature limit: wherever the hull would still turn tighter than ~1 LOA, diffuse locally
  // (held samples move only as much as their weight lets them)
  const maxTurn = ds1 / Math.max(4, loa * 1.0);
  const turnAt = (i: number) => {
    const ax = x[i] - x[i - 1], az = z[i] - z[i - 1], bx = x[i + 1] - x[i], bz = z[i + 1] - z[i];
    return Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
  };
  let bad: number[] = [];
  for (let i = 1; i < n1 - 1; i++) if (wgt[i] > 0.02 && turnAt(i) > maxTurn) bad.push(i);
  for (let pass = 0; pass < 300 && bad.length; pass++) {
    const next = new Set<number>();
    for (const i of bad) {
      for (let j = Math.max(1, i - 2); j <= Math.min(n1 - 2, i + 2); j++) {
        const w = Math.max(wgt[j], 0.15 * Math.min(1, wgt[i] * 4));
        tx[j] = x[j] + (0.25 * x[j - 1] + 0.25 * x[j + 1] - 0.5 * x[j]) * w; tz[j] = z[j] + (0.25 * z[j - 1] + 0.25 * z[j + 1] - 0.5 * z[j]) * w;
      }
      for (let j = Math.max(1, i - 2); j <= Math.min(n1 - 2, i + 2); j++) { x[j] = tx[j]; z[j] = tz[j]; }
    }
    for (const i of bad) for (let j = Math.max(1, i - 3); j <= Math.min(n1 - 2, i + 3); j++) if (wgt[j] > 0.02 && turnAt(j) > maxTurn) next.add(j);
    bad = [...next];
  }
  const r2 = resample(x, z, r1.n, 1.0, MAX_SAMPLES);
  const n = r2.n, ds = r2.ds, length = r2.length;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { out[i * 2] = r2.x[i]; out[i * 2 + 1] = r2.z[i]; }
  const hdg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    hdg[i] = Math.atan2(out[b * 2] - out[a * 2], out[b * 2 + 1] - out[a * 2 + 1]);
  }
  // Speed profile (relative to harbour speed; speed carries no data): slow for bends (tighter than
  // ~1.8 LOA), faster offshore (low-passed over ~60 m, so no surges), gentle acceleration, and a
  // monotonic slow-down over the final approach.
  const rRef = Math.max(6, loa * 1.8);
  const radius = new Float32Array(n), vrel = new Float32Array(n), ow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    const k = Math.abs(wrapAngle(hdg[b] - hdg[a])) / Math.max(1e-6, (b - a) * ds);
    radius[i] = 1 / Math.max(1e-6, k);
    ow[i] = openWaterFactor(field, out[i * 2], out[i * 2 + 1]);
  }
  const owr = Math.max(1, Math.round(30 / ds));
  {
    let sum = 0, cnt = 0;
    for (let j = 0; j <= Math.min(n - 1, owr); j++) { sum += ow[j]; cnt++; }
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      sm[i] = sum / cnt;
      const o = i - owr, inn = i + owr + 1;
      if (o >= 0) { sum -= ow[o]; cnt--; }
      if (inn < n) { sum += ow[inn]; cnt++; }
    }
    ow.set(sm);
  }
  const win = Math.max(1, Math.round(loa / ds)), w2 = Math.max(1, Math.round(3 / ds));
  for (let i = 0; i < n; i++) {
    let rWide = Infinity, rNear = Infinity;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
      if (radius[j] < rWide) rWide = radius[j];
      if (Math.abs(j - i) <= w2 && radius[j] < rNear) rNear = radius[j];
    }
    const gentle = Math.min(1, Math.max(0.35, rWide / rRef));
    const crawl = Math.min(1, Math.max(0.12, rNear / (rRef * 0.6)));
    vrel[i] = gentle * crawl * ow[i];
  }
  // acceleration limit along the path, in (relative speed)² per metre, both ways
  const vn = cruiseSpeed(loa), kk = (2 * ACCEL * 0.8) / (vn * vn);
  for (let i = 1; i < n; i++) vrel[i] = Math.min(vrel[i], Math.sqrt(vrel[i - 1] * vrel[i - 1] + kk * ds));
  for (let i = n - 2; i >= 0; i--) vrel[i] = Math.min(vrel[i], Math.sqrt(vrel[i + 1] * vrel[i + 1] + kk * ds));
  const iMono = Math.max(1, n - Math.round((loa * 3) / ds));
  for (let i = iMono; i < n; i++) vrel[i] = Math.min(vrel[i], vrel[i - 1]);
  const q = new Float32Array(n);
  for (let i = 1; i < n; i++) q[i] = q[i - 1] + ds * 2 / (vrel[i] + vrel[i - 1]);
  const Q = q[n - 1];
  const sOfQ = new Float32Array(n);
  for (let k = 0, i = 0; k < n; k++) {
    const qq = (k / (n - 1)) * Q;
    while (i < n - 2 && q[i + 1] < qq) i++;
    const f = q[i + 1] > q[i] ? Math.min(1, Math.max(0, (qq - q[i]) / (q[i + 1] - q[i]))) : 0;
    sOfQ[k] = (i + f) * ds;
  }
  const ratio = ctrlLen > 0 ? length / ctrlLen : 1;
  const laneA = Math.min(length, (extras.headLen ?? loa * 2) * ratio + loa);
  const laneB = Math.max(laneA, length - (extras.tailLen ?? loa * 3) * ratio - loa);
  const rev = extras.rev && extras.rev.length >= 2 ? subPath(extras.rev) : null;
  return {
    pts: out, hdg, n, ds, length, vrel, q, Q, sOfQ, rev,
    w0: extras.w0 ? Float32Array.from(extras.w0) : null, w1: extras.w1 ? Float32Array.from(extras.w1) : null, laneA, laneB,
  };
}

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

/** I/O slots in the scratch array (doubles stay unboxed across calls). out[IO_LANE] = lane-offset weight. */
export const IO_T = 7, IO_LOA = 8, IO_S = 9, IO_LANE = 11, IO_SEP = 12;

/** Sample position + heading at arc length out[IO_S] into out[0..2] = x, z, heading. */
export function samplePath(p: SubPath, out: Float64Array): void {
  const s = out[IO_S];
  const u = Math.min(Math.max(s / p.ds, 0), p.n - 1);
  const i = Math.min(Math.floor(u), p.n - 2);
  const f = u - i;
  out[0] = p.pts[i * 2] + (p.pts[i * 2 + 2] - p.pts[i * 2]) * f;
  out[1] = p.pts[i * 2 + 1] + (p.pts[i * 2 + 3] - p.pts[i * 2 + 1]) * f;
  let d = (p.hdg[i + 1] - p.hdg[i] + Math.PI) % (2 * Math.PI); // wrapAngle, inlined (hot path)
  if (d < 0) d += 2 * Math.PI;
  out[2] = p.hdg[i] + (d - Math.PI) * f;
}

// ------------------------------------------------------------------ leg timing

/**
 * Timing of one leg of duration D: [hold at the berth] [warp off] [yaw to the path] [astern] [forward
 * trapezoid in q: gather way, cruise, slow down] [warp in]. Spare time is spent at the berth before
 * casting off, so a hull never crawls a whole leg; a short window speeds the cruise up instead.
 */
export interface LegTiming {
  tHold: number;
  /** spare time at the destination once in (≤ the berth's arrival reservation) */
  tHoldEnd: number;
  tW0: number;
  tTurn: number;
  tAstern: number;
  tW1: number;
  /** yaw on the spot (small: swing moorings) from h0 by `turn` radians */
  h0: number;
  turn: number;
  /** final approach: rotate from the path tangent to the berth heading by this much (should be ~0) */
  hEnd: number;
  /** forward part, in q units */
  lf: number;
  aD: number;
  dD: number;
  v: number;
  t1: number;
  t3: number;
  tf: number;
  /** Leg time at harbour speed with no hold, and the least time the leg can be sailed in. */
  tNom: number;
  minD: number;
}

export const newLegTiming = (): LegTiming => ({ tHold: 0, tHoldEnd: 0, tW0: 0, tTurn: 0, tAstern: 0, tW1: 0, h0: 0, turn: 0, hEnd: 0, lf: 0, aD: 0, dD: 0, v: 0, t1: 0, t3: 0, tf: 0, tNom: 0, minD: 0 });

const WARP_V = 0.16;
/** Spare leg time spent at the berths, at most (inside the planner's berth reservations). */
export const HOLD_OUT_MAX = 40, HOLD_IN_MAX = 22;

/**
 * @param startHeading the hull's heading at the start (berth heading, or the swung heading)
 * @param hold spend spare time at the berth first (plan legs); false = sail it out (voyages under way)
 */
export function legTiming(p: PathRec, D: number, loa: number, out: LegTiming, startHeading?: number, endHeading?: number, hold = true): LegTiming {
  const vn = cruiseSpeed(loa);
  const tW0 = p.w0 ? Math.max(12, Math.hypot(p.w0[2], p.w0[3]) / WARP_V) : 0;
  const tW1 = p.w1 ? Math.max(12, Math.hypot(p.w1[0], p.w1[1]) / WARP_V) : 0;
  const vA = 0.35 + 0.45 * Math.sqrt(loa / 13);
  const tAstern = p.rev ? Math.max(10, (1.5 * p.rev.length) / vA) : 0;
  const hullStart = p.w0 ? p.w0[4] : p.rev ? p.rev.hdg[0] + Math.PI : p.hdg[0];
  const h0 = startHeading ?? hullStart;
  const turn = wrapAngle(hullStart - h0);
  const tTurn = Math.abs(turn) > 0.04 ? 3 + (Math.abs(turn) / Math.PI) * (16 + loa * 1.2) : 0;
  const lf = Math.max(0.01, p.Q);
  const man = tW0 + tW1 + tAstern + tTurn;
  // trapezoid at harbour speed (in q units vrel=1 ≡ vn)
  const a = ACCEL;
  const tAt = (v: number) => (lf / v + v / a);
  const tNom = man + (lf < (vn * vn) / a ? 2 * Math.sqrt(lf / a) : tAt(vn));
  const vMax = vn * 1.2;
  const minD = man + (lf < (vMax * vMax) / a ? 2 * Math.sqrt(lf / a) : tAt(vMax));
  let tf = Math.max(8, D - man);
  let tHold = 0, tHoldEnd = 0;
  let v: number, acc = a;
  if (hold && D > tNom) {
    // spare time: a little at each berth, the rest as an easier cruise
    const spare = D - tNom;
    tHold = Math.min(spare * 0.5, HOLD_OUT_MAX);
    tHoldEnd = Math.min(spare - tHold, HOLD_IN_MAX);
    tf = D - man - tHold - tHoldEnd;
  }
  if (lf < (vn * vn) / a && tf <= 2 * Math.sqrt(lf / a) + 1e-6) {
    // short leg: triangle at whatever acceleration fits
    acc = (4 * lf) / (tf * tf); v = acc * tf / 2;
  } else {
    const disc = a * a * tf * tf - 4 * a * lf;
    if (disc >= 0) { v = (a * tf - Math.sqrt(disc)) / 2; }
    else { acc = (4 * lf) / (tf * tf); v = acc * tf / 2; }
  }
  if (!(v > 0)) { v = lf / Math.max(1, tf); acc = 2 * v / Math.max(1, tf); }
  const tAcc = v / acc;
  out.tHold = tHold; out.tHoldEnd = tHoldEnd; out.tW0 = tW0; out.tTurn = tTurn; out.tAstern = tAstern; out.tW1 = tW1;
  out.h0 = h0; out.turn = turn;
  const hEndT = p.w1 ? p.w1[2] : endHeading ?? p.hdg[p.n - 1];
  out.hEnd = wrapAngle(hEndT - p.hdg[p.n - 1]);
  out.lf = lf; out.aD = (v * tAcc) / 2; out.dD = (v * tAcc) / 2; out.v = v;
  out.t1 = tAcc; out.t3 = tAcc; out.tf = tf;
  out.tNom = tNom; out.minD = minD;
  return out;
}

export const LEG_CAST_OFF = 1, LEG_TURN = 2, LEG_SAIL = 3, LEG_APPROACH = 4, LEG_HOLD = 5, LEG_HOLD_END = 6;

/**
 * Evaluate a leg at local time out[IO_T] ∈ [0, D] for a hull of length out[IO_LOA]. Writes x, z,
 * heading, speed, sailState, phaseCode, remaining into out[0..6] and the lane weight into out[IO_LANE].
 */
export function evalLeg(p: PathRec, tm: LegTiming, out: Float64Array): void {
  let t = out[IO_T];
  const loa = out[IO_LOA];
  out[IO_LANE] = 0;
  out[IO_SEP] = 0;
  out[4] = 0;
  // where the forward/astern part begins, and the hull's heading there
  if (t < tm.tHold + tm.tW0 + tm.tTurn) {
    if (p.rev) { out[IO_S] = 0; samplePath(p.rev, out); out[2] = tm.h0; }
    else { out[IO_S] = 0; samplePath(p, out); out[2] = tm.h0; }
    if (p.w0) {
      // the start of the leg proper is the warped-off point; before that, the berth
      const u = Math.min(1, Math.max(0, (t - tm.tHold) / tm.tW0));
      const e = u * u * (3 - 2 * u);
      out[0] = p.w0[0] + p.w0[2] * e; out[1] = p.w0[1] + p.w0[3] * e; out[2] = p.w0[4];
      out[3] = t < tm.tHold ? 0 : (Math.hypot(p.w0[2], p.w0[3]) * 6 * u * (1 - u)) / tm.tW0;
    } else out[3] = 0;
    if (t >= tm.tHold + tm.tW0) {
      const u = (t - tm.tHold - tm.tW0) / tm.tTurn;
      out[2] = tm.h0 + tm.turn * u * u * (3 - 2 * u);
      out[3] = 0.05;
    }
    out[5] = t < tm.tHold ? LEG_HOLD : LEG_CAST_OFF; out[6] = p.length;
    return;
  }
  t -= tm.tHold + tm.tW0 + tm.tTurn;
  if (p.rev && t < tm.tAstern) {
    const u = t / tm.tAstern;
    const e = u * u * (3 - 2 * u);
    out[IO_S] = p.rev.length * e; samplePath(p.rev, out);
    out[2] += Math.PI;
    out[3] = (p.rev.length * 6 * u * (1 - u)) / tm.tAstern;
    out[5] = LEG_CAST_OFF; out[6] = p.length;
    return;
  }
  if (p.rev) t -= tm.tAstern;
  if (t > tm.tf + tm.tW1 && tm.tHoldEnd > 0) {
    out[IO_S] = p.length; samplePath(p, out);
    if (p.w1) { out[0] += p.w1[0]; out[1] += p.w1[1]; out[2] = p.w1[2]; }
    out[3] = 0; out[5] = LEG_HOLD_END; out[6] = 0;
    return;
  }
  if (t > tm.tf && p.w1) {
    const u = Math.min(1, (t - tm.tf) / tm.tW1);
    const e = u * u * (3 - 2 * u);
    out[IO_S] = p.length; samplePath(p, out);
    out[0] += p.w1[0] * e; out[1] += p.w1[1] * e; out[2] = p.w1[2];
    out[3] = (Math.hypot(p.w1[0], p.w1[1]) * 6 * u * (1 - u)) / tm.tW1;
    out[5] = LEG_APPROACH; out[6] = 0;
    return;
  }
  const tl = Math.min(t, tm.tf);
  let s: number, v: number;
  if (tl < tm.t1) { s = tm.aD * (tl / tm.t1) ** 2; v = (tm.v * tl) / tm.t1; }
  else if (tl > tm.tf - tm.t3) { const r = Math.max(0, tm.tf - tl); s = tm.lf - tm.dD * (r / tm.t3) ** 2; v = (tm.v * r) / tm.t3; }
  else { s = tm.aD + tm.v * (tl - tm.t1); v = tm.v; }
  s = Math.min(tm.lf, Math.max(0, s));
  // q → arc length; speed scales with the path's relative speed there
  const uq = Math.min(Math.max((s / Math.max(p.Q, 1e-9)) * (p.n - 1), 0), p.n - 1);
  const iq = Math.min(Math.floor(uq), p.n - 2);
  const sq = p.sOfQ[iq] + (p.sOfQ[iq + 1] - p.sOfQ[iq]) * (uq - iq);
  out[IO_S] = sq; samplePath(p, out);
  v *= p.vrel[Math.min(p.n - 1, Math.round(sq / p.ds))];
  const remaining = p.length - sq;
  if (tm.hEnd !== 0 && remaining < loa * 1.5) { const u = 1 - remaining / (loa * 1.5); out[2] += tm.hEnd * u * u * (3 - 2 * u); }
  out[3] = v;
  // sail set over the first ~2 LOA once clear, furled over the last ~3 LOA
  const set = Math.min(1, Math.max(0, (sq - loa * 0.6) / (loa * 1.8)));
  const furl = Math.min(1, Math.max(0, (remaining - loa * 0.6) / (loa * 2.8)));
  const sail = Math.min(set, furl);
  out[4] = sail * sail * (3 - 2 * sail);
  out[5] = !p.rev && !p.w0 && !p.underway && sq < loa * 1.5 ? LEG_CAST_OFF : remaining < loa * 3 || p.w1 && remaining < loa * 4 ? LEG_APPROACH : LEG_SAIL;
  out[6] = remaining;
  const la = Math.min(1, Math.max(0, (sq - p.laneA) / 60)), lb = Math.min(1, Math.max(0, (p.laneB - sq) / 60));
  out[IO_LANE] = Math.min(la * la * (3 - 2 * la), lb * lb * (3 - 2 * lb));
  // give-way weight: none in the slip, full once a couple of hull lengths out
  const sa = p.underway ? 1 : Math.min(1, sq / (loa * 2.5)), sb = Math.min(1, remaining / (loa * 2.5));
  out[IO_SEP] = Math.min(sa * sa * (3 - 2 * sa), sb * sb * (3 - 2 * sb));
}
