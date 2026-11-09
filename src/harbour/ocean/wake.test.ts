import * as THREE from "three";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OCEAN_FRAG } from "./ocean-material";
import { WakeField, type WakeService } from "./wake";

/**
 * E12 feathered wakes (O3-I3, O1-I11). TS twins of the stamp shader's Kelvin arm (wake.ts STAMP_FRAG) and of the
 * ocean's Kelvin foam (shaders/foam-wake.ts fKel), pinned to both sources below.
 */
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);
const TAU = 6.2831853;

/** The echelon along an arm, in crests (ec = u / spacing - lateral term): seeded jitter of place and strength. */
function echelon(ec: number, seed: number): number {
  const cj = Math.floor(ec + 0.25);
  const cr = fract(Math.sin(cj * 12.9898 + seed * 78.233) * 43758.5453);
  return smoothstep(-0.1, 0.7, Math.sin((ec - (cr - 0.5) * 0.2) * TAU)) * (0.8 + 0.4 * fract(cr * 7.13));
}
/** v1.5.0's echelon: one fixed period for every hull, the evenly dotted line. */
const echelonBefore = (ec: number) => smoothstep(-0.1, 0.7, Math.sin(ec * 6.2831));

interface Hull { hl: number; hb: number; spd: number }
/** STAMP_FRAG's moving-hull R channel (before × strength): Kelvin arms + transverse waves + bow wave. */
function kelvin(qx: number, qy: number, { hl, hb, spd }: Hull, seed: number, before = false): number {
  const sp = smoothstep(0.8, 1.6, spd) * (0.35 + 0.65 * smoothstep(1.6, 5.0, spd)) * Math.min(1, Math.max(0.5, hl / 7));
  const u = hl * 0.75 - qx;
  const wl = hl * (3 + 4 * smoothstep(1.2, 6.0, spd));
  const arm = Math.abs(Math.abs(qy) - (hb * 0.6 + u * 0.354));
  const w = 0.5 + u * 0.018;
  const fall = Math.exp(-u / (wl * (before ? 0.5 : 0.42))) * smoothstep(0, hl * 0.4, u);
  const ec = u / Math.max(1.2, hb * 1.3) - Math.abs(qy) * 0.2069;
  let kel = Math.exp(-(arm * arm) / (w * w)) * fall * (before ? 0.25 + 0.75 * echelonBefore(ec) : 0.4 + 0.6 * echelon(ec, seed));
  const inside = smoothstep(0, 1, (hb * 0.6 + u * 0.354) - Math.abs(qy)) * (u >= 0 ? 1 : 0);
  kel += inside * Math.pow(0.5 + 0.5 * Math.cos(u * 6.2831 / Math.max(2, hl * 0.9)), 6) * fall * 0.18;
  const bx = (qx - hl * 0.9) / (hl * 0.12), by = qy / (hb * 1.05);
  return (kel + Math.exp(-(bx * bx + by * by)) * 0.45) * sp;
}
/** The ocean's white Kelvin foam from the live R channel (nC.r = its mean, 0.5), now and in v1.5.0. */
const fKel = (r: number, fp: number) => smoothstep(0.3, 0.62, r * 0.95) * 0.6 * (1 - 0.65 * smoothstep(0.8, 2.0, fp));
const fKelBefore = (r: number) => smoothstep(0.07, 0.38, r * 0.95) * 0.85;

/** Crest centres of one arm (argmax of the arm's echelon in each crest cell) over `n` crests. */
function crests(seed: number, n: number, ech = (ec: number) => echelon(ec, seed)): number[] {
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    let best = -1, at = j;
    for (let k = 0; k <= 1000; k++) {
      const ec = j - 0.25 + k / 1000, v = ech(ec);
      if (v > best) { best = v; at = ec; }
    }
    out.push(at);
  }
  return out;
}
const spacings = (c: number[]) => c.slice(1).map((v, i) => v - c[i]);
const std = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

describe("E12 feathered wakes", () => {
  it("jitters each crest of an arm by ±20 % of the spacing, per hull, where v1.5.0 printed an even dotted line", () => {
    let lo = Infinity, hi = -Infinity;
    const spreads: number[] = [];
    for (let s = 0; s < 60; s++) {
      const seed = (s / 60) * TAU, gaps = spacings(crests(seed, 40));
      lo = Math.min(lo, ...gaps); hi = Math.max(hi, ...gaps);
      spreads.push(std(gaps));
    }
    expect(lo).toBeGreaterThanOrEqual(0.8 - 1e-3);
    expect(hi).toBeLessThanOrEqual(1.2 + 1e-3);
    expect(Math.min(...spreads)).toBeGreaterThan(0.05);          // every wake is irregular …
    expect(std(spacings(crests(0, 40, echelonBefore)))).toBeLessThan(1e-3);   // … the old one was a metronome
  });

  it("is seamless across the crest cells and deterministic per seed; different hulls get different crests", () => {
    for (const seed of [0, 1.7, 4.2]) {
      let jump = 0;
      for (let k = 1; k <= 40000; k++) jump = Math.max(jump, Math.abs(echelon(k / 1000, seed) - echelon((k - 1) / 1000, seed)));
      expect(jump).toBeLessThan(0.02);                            // 1/1000 of a crest: no seam where the cells meet
      for (let j = 0; j < 40; j++) {
        expect(echelon(j - 0.25 - 1e-9, seed)).toBe(0);           // the cells meet in a trough, zero on both sides
        expect(echelon(j - 0.25 + 1e-9, seed)).toBe(0);
      }
      expect(crests(seed, 20)).toEqual(crests(seed, 20));
    }
    const a = crests(0.3, 20), b = crests(2.9, 20);
    expect(a.filter((v, i) => Math.abs(v - b[i]) > 0.01).length).toBeGreaterThan(10);
  });

  it("whitens only the first few crests behind a hull; the arm beyond is lighter water", () => {
    const hull: Hull = { hl: 10, hb: 3, spd: 4 };
    const white = (before: boolean) => {
      let n = 0, prev = false;
      for (let u = 0; u < 160; u += 0.05) {
        const qx = hull.hl * 0.75 - u, qy = hull.hb * 0.6 + u * 0.354;   // along the arm's centre line
        const r = kelvin(qx, qy, hull, 1.3, before), on = (before ? fKelBefore(r) : fKel(r, 0.5)) > 0.3;
        if (on && !prev) n++;
        prev = on;
      }
      return n;
    };
    expect(white(false)).toBeGreaterThanOrEqual(1);
    expect(white(false)).toBeLessThanOrEqual(4);
    expect(white(true)).toBeGreaterThan(white(false) * 2);       // v1.5.0: a long row of white dashes
    // the arm still lightens the water past its white crests (the live R channel the body tint and normals read)
    const tail = kelvin(hull.hl * 0.75 - 30, hull.hb * 0.6 + 30 * 0.354, hull, 1.3);
    expect(tail).toBeGreaterThan(0.05);
    expect(fKel(tail, 0.5)).toBe(0);
  });

  it("keeps the bow wave and the transverse waves, and fades the arms sooner behind the stern", () => {
    const hull: Hull = { hl: 10, hb: 3, spd: 4 };
    expect(kelvin(hull.hl * 0.9, 0, hull, 0)).toBeGreaterThan(0.3);                    // bow wave
    let transverse = 0;
    for (let u = 4; u < 20; u += 0.1) transverse = Math.max(transverse, kelvin(hull.hl * 0.75 - u, 0, hull, 0));
    expect(transverse).toBeGreaterThan(0.08);                                         // inside the wedge
    const wl = hull.hl * (3 + 4 * smoothstep(1.2, 6.0, hull.spd)), u = wl * 0.42;
    expect(Math.exp(-u / (wl * 0.42))).toBeCloseTo(Math.exp(-1), 12);
    expect(Math.exp(-u / (wl * 0.42))).toBeLessThan(Math.exp(-u / (wl * 0.5)));
  });

  it("raises the white threshold to .3, caps it at .6 and fades it by footprint far off", () => {
    expect(fKel(0.3 / 0.95, 0.5)).toBe(0);
    expect(fKel(1, 0.5)).toBeCloseTo(0.6, 12);
    for (let r = 0; r <= 2; r += 0.01) expect(fKel(r, 0.5)).toBeLessThanOrEqual(0.6);
    let prev = Infinity;
    for (let fp = 0; fp <= 3; fp += 0.05) { const v = fKel(1, fp); expect(v).toBeLessThanOrEqual(prev + 1e-12); prev = v; }
    expect(fKel(1, 0.8)).toBeCloseTo(0.6, 12);       // heart and closer: the full white
    expect(fKel(1, 2.5)).toBeCloseTo(0.6 * 0.35, 12);
  });

  it("carries the seed in the stamp's free component, through the service interface, from every fleet stamp", () => {
    const field = new WakeField([-100, -100, 100, 100], 64, 64);
    const svc: WakeService = field;
    const buf = (field as unknown as { bufB: Float32Array }).bufB;
    svc.stamp(1, 2, 3, 0, 1.5, 1, 6, 4.25);
    svc.stamp(1, 2, 0, 0, 1.5, 0.7);
    expect(Array.from(buf.slice(0, 8))).toEqual([1.5, 3, 1, 4.25, 1.5, 0, Math.fround(0.7), 0]);
    const live = (field as unknown as { liveMat: { vertexShader: string; fragmentShader: string } }).liveMat;
    expect(live.vertexShader).toContain("vW = w - sA.xy; vSeed = sB.w;");
    expect(live.fragmentShader).toContain("float fall = exp(-u / (wl * 0.42)) * smoothstep(0.0, hl * 0.4, u);");
    expect(live.fragmentShader).toContain("float ec = u / max(1.2, hb * 1.3) - abs(q.y) * 0.2069;");
    expect(live.fragmentShader).toContain("float cj = floor(ec + 0.25);");
    expect(live.fragmentShader).toContain("float cr = fract(sin(cj * 12.9898 + vSeed * 78.233) * 43758.5453);");
    expect(live.fragmentShader).toContain("float ech = smoothstep(-0.1, 0.7, sin((ec - (cr - 0.5) * 0.2) * 6.2831853)) * (0.8 + 0.4 * fract(cr * 7.13));");
    expect(live.fragmentShader).toContain("kel = exp(-(arm * arm) / (w * w)) * fall * (0.4 + 0.6 * ech);");
    expect(live.fragmentShader).toContain("kel += inside * pow(0.5 + 0.5 * cos(u * 6.2831 / max(2.0, hl * 0.9)), 6.0) * fall * 0.18;");
    expect(live.fragmentShader).toContain("kel = (kel + bow * 0.45) * sp;");
    expect(OCEAN_FRAG).toContain("float fKel = smoothstep(0.3, 0.62, live.r * (0.45 + 1.0 * nC.r)) * 0.6 * (1.0 - 0.65 * smoothstep(0.8, 2.0, fp));");
    expect(OCEAN_FRAG).toContain("float fp = length(fwidth(xz));");
    // every hull stamp in the fleet passes its own stable seed (stamp arguments only)
    const fleet = readFileSync(resolve(__dirname, "../fleet/fleet-system.ts"), "utf8");
    const calls = fleet.match(/wake\.stamp\([^;]*\)/g) ?? [];
    expect(calls.length).toBe(4);
    for (const call of calls) expect(call).toMatch(/, b\.phi\)$/);
    field.dispose();
  });
});

it("clears both history buffers and queued stamps at a resume boundary, restoring renderer state", async () => {
  const field = new WakeField([-10, -10, 10, 10], 8, 8);
  field.stamp(0, 0, 2, 0, 1, 1);
  const previous = {}, targets: unknown[] = [];
  let clearColor = new THREE.Color(0x112233), clearAlpha = 0.7, target: unknown = previous, clears = 0;
  const renderer = {
    getRenderTarget: () => target, setRenderTarget: (v: unknown) => { target = v; targets.push(v); },
    getClearAlpha: () => clearAlpha, getClearColor: (out: THREE.Color) => out.copy(clearColor),
    setClearColor: (v: number | THREE.Color, a: number) => { clearColor = new THREE.Color(v); clearAlpha = a; },
    clear: () => { clears++; },
  };
  field.clear(renderer as never);
  expect(clears).toBe(3); expect(targets).toHaveLength(4); expect(target).toBe(previous);
  expect(clearColor.getHex()).toBe(0x112233); expect(clearAlpha).toBe(0.7);
  expect((field as unknown as { count: number }).count).toBe(0);
  field.dispose();
});
