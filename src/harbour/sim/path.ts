/**
 * Leg paths: a control polyline (berth departure → lane graph → berth approach) is filleted with
 * quadratic corner arcs (G1-smooth heading, turn radius ∝ hull length) and resampled at uniform
 * arc length, so a pose lookup is O(1) and speed along the path is exactly what the timing says.
 */
import type { Vec2 } from "../layout/types";
import { clearance, openWaterFactor, type ObstacleField } from "./obstacles";

export interface PathRec {
  /** Uniformly spaced samples, x,z interleaved. */
  pts: Float32Array;
  /** Unit tangent heading at each sample (bow along (sin h, cos h)). */
  hdg: Float32Array;
  n: number;
  ds: number;
  length: number;
  /** Distance backed out astern before the pivot turn (0 = departs bow first). */
  dRev: number;
  /** +1 / -1: which way the hull pivots after backing out. */
  turnSign: number;
  /** Relative speed at each sample (1 on straights, down to ~0.2 in tight turns). */
  vrel: Float32Array;
  /** "Effort" coordinate q = ∫ ds / vrel at each sample; timing runs in q so turns are taken slowly. */
  q: Float32Array;
  Q: number;
  /** s at uniform q steps (n entries over [0, Q]). */
  sOfQ: Float32Array;
}

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
function clearSegments(pts: Vec2[], head: number, tail: number, field: ObstacleField, need: number): Vec2[] {
  const out: Vec2[] = [pts[0]];
  const lastFree = pts.length - 1 - tail;
  const fix = (a: Vec2, b: Vec2, depth: number): void => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(2, Math.ceil(len / 2));
    let worst = Infinity, wt = 0;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const c = clearance(field, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (c < worst) { worst = c; wt = t; }
    }
    if (worst >= need || depth > 5 || len < 6) { out.push(b); return; }
    let px = a[0] + (b[0] - a[0]) * wt, pz = a[1] + (b[1] - a[1]) * wt;
    for (let it = 0; it < 80; it++) {
      const c = clearance(field, px, pz);
      if (c >= need + 3) break;
      const gx = clearance(field, px + 1, pz) - clearance(field, px - 1, pz);
      const gz = clearance(field, px, pz + 1) - clearance(field, px, pz - 1);
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

/**
 * @param points control polyline from the start pose to the end pose
 * @param loa hull length: sets the fillet radius and the smoothing width (turning circle ~ 1-2 LOA)
 * @param asternMax back out at most this far along the initial straight (0 = no astern start)
 * @param tailKeep trailing control points (the berth approach) kept exactly
 * @param field clearance field: paths ease off land and structures by ~beam/2 + 2.5 m
 */
export function buildPath(points: readonly Vec2[], loa: number, asternMax = 0, tailKeep = 2, field: ObstacleField | null = null, beam = loa * 0.32): PathRec {
  const cornerR = Math.min(24, Math.max(6, loa * 1.4));
  let pts = dedupe(points);
  if (pts.length < 2) pts = [pts[0] ?? [0, 0], [(pts[0]?.[0] ?? 0) + 0.5, pts[0]?.[1] ?? 0]];

  // straight run from the start (colinear segments) that the hull can back down
  let keep = 1;
  const dx0 = pts[1][0] - pts[0][0], dz0 = pts[1][1] - pts[0][1];
  const l0 = Math.hypot(dx0, dz0);
  let straight = l0;
  {
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const l = Math.hypot(dx, dz);
      if ((dx * dx0 + dz * dz0) / (l * l0) < 0.9986) break;
      straight += l; keep = i + 1;
    }
  }
  const R = Math.max(6, loa * 1.2);
  pts = mergeClose(pts, asternMax > 0 ? keep + 1 : 2, Math.min(tailKeep, pts.length - 1), R * 0.9);
  if (field) pts = dedupe(clearSegments(pts, asternMax > 0 ? keep : 0, Math.max(0, tailKeep - 2), field, beam / 2 + 2));

  // fillet every interior vertex with a quadratic arc
  scratchX.length = 0; scratchZ.length = 0;
  scratchX.push(pts[0][0]); scratchZ.push(pts[0][1]);
  let firstCornerCut = Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], v = pts[i], b = pts[i + 1];
    const lin = Math.hypot(v[0] - a[0], v[1] - a[1]), lout = Math.hypot(b[0] - v[0], b[1] - v[1]);
    const r = Math.min(cornerR, lin * 0.48, lout * 0.48);
    const uix = (v[0] - a[0]) / lin, uiz = (v[1] - a[1]) / lin, uox = (b[0] - v[0]) / lout, uoz = (b[1] - v[1]) / lout;
    const turn = Math.acos(Math.max(-1, Math.min(1, uix * uox + uiz * uoz)));
    const p0x = v[0] - uix * r, p0z = v[1] - uiz * r, p2x = v[0] + uox * r, p2z = v[1] + uoz * r;
    if (i === keep && firstCornerCut === Infinity) firstCornerCut = r;
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

  // 1 m resample, then diffuse away kinks the fillets could not (short control segments), keeping
  // the astern straight and the final berth approach pinned
  const r1 = resample(scratchX, scratchZ, scratchX.length, 1.0, 2500);
  const straightAfterCut = firstCornerCut === Infinity ? straight : straight - firstCornerCut;
  const dRev0 = asternMax > 0 ? Math.max(0, Math.min(asternMax, straightAfterCut, r1.length * 0.4)) : 0;
  const pinS = Math.min(r1.n - 2, Math.ceil(dRev0 / r1.ds) + 1);
  const pinE = Math.min(r1.n - 2 - pinS, Math.ceil(Math.min(loa * 0.8, r1.length * 0.15) / r1.ds) + 1);
  // ~Gaussian smoothing (3 box passes, running sums: O(n) whatever the width)
  const sigma = (cornerR * 0.45) / r1.ds;
  const rad = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const x = r1.x, z = r1.z, tx = new Float64Array(r1.n), tz = new Float64Array(r1.n);
  const lo = pinS, hi = r1.n - pinE; // free range [lo, hi)
  for (let pass = 0; pass < 3; pass++) {
    for (const [src, dst] of [[x, tx], [z, tz]] as const) {
      let sum = 0, cnt = 0;
      const a0 = Math.max(0, lo - rad);
      for (let j = a0; j <= Math.min(r1.n - 1, lo + rad); j++) { sum += src[j]; cnt++; }
      for (let i = lo; i < hi; i++) {
        dst[i] = sum / cnt;
        const out = i - rad, inn = i + rad + 1;
        if (out >= 0) { sum -= src[out]; cnt--; }
        if (inn < r1.n) { sum += src[inn]; cnt++; }
      }
      for (let i = lo; i < hi; i++) src[i] = dst[i];
    }
  }
  // curvature limit: wherever the hull would still turn tighter than ~0.9 LOA, diffuse locally
  const maxTurn = r1.ds / Math.max(3, loa * 0.9);
  const i0 = Math.max(1, pinS), i1 = r1.n - Math.max(1, pinE);
  const turnAt = (i: number) => {
    const ax = x[i] - x[i - 1], az = z[i] - z[i - 1], bx = x[i + 1] - x[i], bz = z[i + 1] - z[i];
    return Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
  };
  let bad: number[] = [];
  for (let i = i0; i < i1; i++) if (turnAt(i) > maxTurn) bad.push(i);
  for (let pass = 0; pass < 300 && bad.length; pass++) {
    const next = new Set<number>();
    for (const i of bad) {
      for (let j = Math.max(pinS, i - 2); j <= Math.min(r1.n - 1 - pinE, i + 2); j++) {
        tx[j] = 0.25 * x[j - 1] + 0.5 * x[j] + 0.25 * x[j + 1]; tz[j] = 0.25 * z[j - 1] + 0.5 * z[j] + 0.25 * z[j + 1];
      }
      for (let j = Math.max(pinS, i - 2); j <= Math.min(r1.n - 1 - pinE, i + 2); j++) { x[j] = tx[j]; z[j] = tz[j]; }
    }
    for (const i of bad) for (let j = Math.max(i0, i - 3); j <= Math.min(i1 - 1, i + 3); j++) if (turnAt(j) > maxTurn) next.add(j);
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
  // Slow down where the path turns tighter than ~1.8 LOA (speed carries no data): a gentle,
  // anticipating slow-down for bends, and a local crawl for any tight spot so the turn rate stays sane.
  const rRef = Math.max(6, loa * 1.8);
  const radius = new Float32Array(n), vrel = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const k = Math.abs(wrapAngle(hdg[b] - hdg[a])) / Math.max(1e-6, (b - a) * ds);
    radius[i] = 1 / Math.max(1e-6, k);
  }
  const win = Math.max(1, Math.round(loa / ds)), w2 = Math.max(1, Math.round(3 / ds));
  for (let i = 0; i < n; i++) {
    let rWide = Infinity, rNear = Infinity;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) {
      if (radius[j] < rWide) rWide = radius[j];
      if (Math.abs(j - i) <= w2 && radius[j] < rNear) rNear = radius[j];
    }
    const gentle = Math.min(1, Math.max(0.4, rWide / rRef));
    const crawl = Math.min(1, Math.max(0.04, rNear / (rRef * 0.6)));
    vrel[i] = gentle * crawl * openWaterFactor(field, out[i * 2], out[i * 2 + 1]);
  }
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
  const dRev = Math.min(dRev0, length * 0.4);
  // pivot toward the side the path turns next
  let turnSign = 1;
  if (dRev > 0) {
    const i0 = Math.min(n - 1, Math.round(dRev / ds)), i1 = Math.min(n - 1, i0 + Math.round(25 / ds));
    const d = wrapAngle(hdg[i1] - hdg[i0]);
    turnSign = d >= 0 ? 1 : -1;
  }
  return { pts: out, hdg, n, ds, length, dRev, turnSign, vrel, q, Q, sOfQ };
}

function qAt(p: PathRec, s: number): number {
  const u = Math.min(Math.max(s / p.ds, 0), p.n - 1);
  const i = Math.min(Math.floor(u), p.n - 2);
  return p.q[i] + (p.q[i + 1] - p.q[i]) * (u - i);
}

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

/** I/O slots in the scratch array (doubles stay unboxed across calls). */
export const IO_T = 7, IO_LOA = 8, IO_S = 9;

/** Sample position + heading at arc length out[IO_S] into out[0..2] = x, z, heading. */
export function samplePath(p: PathRec, out: Float64Array): void {
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
 * Timing of one leg of duration D over a path. Astern start (bow-in berths): back out dRev at a
 * crawl, pivot ~180° in place, then accelerate, cruise and ease in over the last ~3 LOA.
 */
export interface LegTiming {
  tAstern: number;
  tTurn: number;
  /** pivot: heading h0 rotating by `turn` radians */
  h0: number;
  turn: number;
  /** final approach: rotate from the path tangent to the berth heading by this much (alongside berths) */
  hEnd: number;
  /** forward part */
  s0: number;
  lf: number;
  aD: number;
  dD: number;
  v: number;
  t1: number;
  t3: number;
  tf: number;
}

/**
 * @param startHeading the hull's heading at the start (berth heading, or the swung heading)
 */
export function legTiming(p: PathRec, D: number, loa: number, out: LegTiming, startHeading = p.hdg[0], endHeading = p.hdg[p.n - 1]): LegTiming {
  const tAstern = p.dRev > 0 ? Math.max(8, p.dRev / 0.45) : 0;
  const iRev = Math.min(p.n - 1, Math.round(p.dRev / p.ds));
  let h0: number, turn: number;
  if (p.dRev > 0) { h0 = p.hdg[iRev] + Math.PI; turn = p.turnSign >= 0 ? -Math.PI : Math.PI; }
  else { h0 = startHeading; turn = wrapAngle(p.hdg[0] - startHeading); }
  const tTurn = Math.abs(turn) > 0.05 ? 4 + (Math.abs(turn) / Math.PI) * (14 + loa * 0.9) : 0;
  const tf = Math.max(10, D - tAstern - tTurn);
  const q0 = qAt(p, p.dRev);
  const lf = Math.max(0.01, p.Q - q0); // forward length in q (effort) units
  const aD = Math.min(loa * 2, lf * 0.25), dD = Math.min(loa * 3, lf * 0.35);
  const v = (lf + aD + dD) / tf;
  out.tAstern = tAstern; out.tTurn = tTurn; out.h0 = h0; out.turn = turn; out.hEnd = wrapAngle(endHeading - p.hdg[p.n - 1]);
  out.s0 = q0; out.lf = lf; out.aD = aD; out.dD = dD; out.v = v;
  out.t1 = (2 * aD) / v; out.t3 = (2 * dD) / v; out.tf = tf;
  return out;
}

export const LEG_CAST_OFF = 1, LEG_TURN = 2, LEG_SAIL = 3, LEG_APPROACH = 4;

/**
 * Evaluate a leg at local time out[IO_T] ∈ [0, D] for a hull of length out[IO_LOA]. Writes x, z,
 * heading, speed, sailState, phaseCode, remaining into out[0..6].
 */
export function evalLeg(p: PathRec, tm: LegTiming, out: Float64Array): void {
  const t = out[IO_T], loa = out[IO_LOA];
  if (t < tm.tAstern) {
    const u = t / tm.tAstern;
    const e = u * u * (3 - 2 * u);
    out[IO_S] = p.dRev * e; samplePath(p, out);
    out[2] += Math.PI;
    out[3] = (p.dRev * 6 * u * (1 - u)) / tm.tAstern;
    out[4] = 0; out[5] = LEG_CAST_OFF; out[6] = p.length - p.dRev * e;
    return;
  }
  if (t < tm.tAstern + tm.tTurn) {
    const u = (t - tm.tAstern) / tm.tTurn;
    const e = u * u * (3 - 2 * u);
    out[IO_S] = p.dRev; samplePath(p, out);
    out[2] = tm.h0 + tm.turn * e;
    out[3] = 0.1; out[4] = 0; out[5] = LEG_TURN; out[6] = p.length - p.dRev;
    return;
  }
  const tl = t - tm.tAstern - tm.tTurn;
  let s: number, v: number;
  if (tl < tm.t1) { s = tm.aD * (tl / tm.t1) ** 2; v = (tm.v * tl) / tm.t1; }
  else if (tl > tm.tf - tm.t3) { const r = Math.max(0, tm.tf - tl); s = tm.lf - tm.dD * (r / tm.t3) ** 2; v = (tm.v * r) / tm.t3; }
  else { s = tm.aD + tm.v * (tl - tm.t1); v = tm.v; }
  s = Math.min(tm.lf, Math.max(0, s));
  // q → arc length; speed scales with the path's relative speed there
  // sOfQAt, inlined (hot path)
  const uq = Math.min(Math.max(((tm.s0 + s) / Math.max(p.Q, 1e-9)) * (p.n - 1), 0), p.n - 1);
  const iq = Math.min(Math.floor(uq), p.n - 2);
  const sq = p.sOfQ[iq] + (p.sOfQ[iq + 1] - p.sOfQ[iq]) * (uq - iq);
  out[IO_S] = sq; samplePath(p, out);
  v *= p.vrel[Math.min(p.n - 1, Math.round(sq / p.ds))];
  const remaining = p.length - sq;
  const travelled = sq - p.dRev;
  if (tm.hEnd !== 0 && remaining < loa * 3) { const u = 1 - remaining / (loa * 3); out[2] += tm.hEnd * u * u * (3 - 2 * u); }
  out[3] = v;
  // sail set over the first ~2 LOA once clear, furled over the last ~3 LOA
  const set = Math.min(1, Math.max(0, (travelled - loa * 0.4) / (loa * 1.6)));
  const furl = Math.min(1, Math.max(0, (remaining - loa * 0.4) / (loa * 2.6)));
  const sail = Math.min(set, furl);
  out[4] = sail * sail * (3 - 2 * sail);
  out[5] = tm.tAstern === 0 && travelled < loa * 1.5 ? LEG_CAST_OFF : remaining < loa * 3 ? LEG_APPROACH : LEG_SAIL;
  out[6] = remaining;
}
