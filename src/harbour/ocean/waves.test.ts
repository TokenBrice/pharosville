import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MotionClock } from "../ui/services";
import { RUNUP_GLSL } from "../world/runup";
import { OCEAN_FRAG } from "./ocean-material";
import { hullSwell, hullSwellCache, SEA_STATES, SWELL_PHASE_GLSL, swellPhase, waveHeight, WAVES, wavesGLSL } from "./waves";

/** Deterministic PRNG (mulberry32), so a failure reproduces. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The five points hullSwell samples, through the reference waveHeight. */
function reference(x: number, z: number, bx: number, bz: number, px: number, pz: number, t: number, amp: number): number[] {
  return [[x, z], [x + bx, z + bz], [x - bx, z - bz], [x + px, z + pz], [x - px, z - pz]].map(([u, v]) => waveHeight(u, v, t, amp));
}

describe("hullSwell", () => {
  const out = new Float64Array(5);

  it("matches waveHeight at all five points, with and without a cache (random points and times)", () => {
    const r = rng(7);
    let worst = 0;
    for (let n = 0; n < 4000; n++) {
      const x = (r() - 0.5) * 3000, z = (r() - 0.5) * 3000, t = r() * 2e5, amp = r();
      const h = r() * Math.PI * 2, half = 1 + r() * 40, hb = 0.5 + r() * 8;
      const fx = Math.sin(h), fz = Math.cos(h);
      const want = reference(x, z, fx * half, fz * half, fz * hb, -fx * hb, t, amp);
      for (const cache of [null, hullSwellCache()]) {
        hullSwell(x, z, fx * half, fz * half, fz * hb, -fx * hb, t, amp, out, cache);
        for (let k = 0; k < 5; k++) worst = Math.max(worst, Math.abs(out[k] - want[k]));
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it("stays on the reference while a cached hull surges, yaws and swings (incremental path and refreshes)", () => {
    const r = rng(11);
    let worst = 0;
    for (let hull = 0; hull < 40; hull++) {
      const cache = hullSwellCache();
      const x0 = (r() - 0.5) * 2000, z0 = (r() - 0.5) * 2000, h0 = r() * Math.PI * 2, half = 2 + r() * 38, hb = 0.5 + r() * 6;
      const yaw = 0.01 + r() * 0.6, amp = r();
      for (let f = 0; f < 600; f++) {
        const t = 100 + f / 60, h = h0 + yaw * Math.sin(t * 0.3), x = x0 + 0.2 * Math.sin(t * 0.26), z = z0 + 0.2 * Math.cos(t * 0.26);
        const fx = Math.sin(h), fz = Math.cos(h);
        hullSwell(x, z, fx * half, fz * half, fz * hb, -fx * hb, t, amp, out, cache);
        const want = reference(x, z, fx * half, fz * half, fz * hb, -fx * hb, t, amp);
        for (let k = 0; k < 5; k++) worst = Math.max(worst, Math.abs(out[k] - want[k]));
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it("the uncached path is the reference formula bit for bit", () => {
    const r = rng(3);
    for (let n = 0; n < 500; n++) {
      const x = (r() - 0.5) * 3000, z = (r() - 0.5) * 3000, t = r() * 1e4, amp = r(), bx = r() * 9, bz = r() * 9, px = r() * 3, pz = r() * 3;
      hullSwell(x, z, bx, bz, px, pz, t, amp, out, null);
      expect(Array.from(out)).toEqual(reference(x, z, bx, bz, px, pz, t, amp));
    }
  });
});

describe("E14 one swell phase", () => {
  const W0 = WAVES[0];
  const T = (2 * Math.PI) / W0.w;   // the main swell's period: the hulls' bob, the shore and the run-up share it

  it("exports the main 62 m swell's phase, the very phase the hulls ride, to the CPU and to GLSL", () => {
    expect(W0.length).toBe(62);
    const r = rng(5);
    for (let n = 0; n < 500; n++) {
      const x = (r() - 0.5) * 3000, z = (r() - 0.5) * 3000, t = r() * 1e4;
      expect(swellPhase(x, z, t)).toBe(W0.k * (W0.dirX * x + W0.dirZ * z) - W0.w * t);
    }
    // the GLSL clock is the Gerstner table's own first phase, character for character
    const glsl = wavesGLSL();
    const first = /\{ float ph = (\(.*?\* t\)); /.exec(glsl)![1];
    expect(SWELL_PHASE_GLSL).toContain(`float hbSwellPhase(vec2 p, float t) { return ${first}; }`);
    expect(glsl).toContain(SWELL_PHASE_GLSL);
    // and its 6-decimal constants stay on the CPU phase across the whole sea and a long visit
    const [k, dx, dz, w] = /return \(([\d.-]+) \* dot\(vec2\(([\d.-]+), ([\d.-]+)\), p\) - ([\d.-]+) \* t\)/.exec(SWELL_PHASE_GLSL)!.slice(1).map(Number);
    for (let n = 0; n < 500; n++) {
      const x = (r() - 0.5) * 6000, z = (r() - 0.5) * 6000, t = r() * 2e4;
      expect(Math.abs(k * (dx * x + dz * z) - w * t - swellPhase(x, z, t))).toBeLessThan(0.02);
    }
  });

  // TS twins of the four consumers' phases at one point (their fixed per-stretch offsets as constants)
  const consumers = {
    trains: (x: number, z: number, t: number) => 1.7 * 1.25 - swellPhase(x, z, t) + 0.6 * 5.0 + 0.4 * 0.8,
    swash: (x: number, z: number, t: number) => swellPhase(x, z, t) + 0.6 * 2.2 + 0.4 * 1.2,
    reef: (x: number, z: number, t: number) => swellPhase(x, z, t) + (0.6 - 0.5) * 5.0,
    runup: (x: number, z: number, t: number) => (-swellPhase(x, z, t) / (2 * Math.PI) + 0.37 * 0.35) * 2 * Math.PI,
  };

  it("drives the coast trains, swash, reef surf and run-up on that one clock: one cycle per swell period, never beating", () => {
    const r = rng(9);
    for (let n = 0; n < 200; n++) {
      const x = (r() - 0.5) * 2000, z = (r() - 0.5) * 2000, t = r() * 5000;
      for (const phase of Object.values(consumers)) {
        // a whole swell period later each consumer is back at the same point of its cycle
        expect(Math.abs(Math.abs(phase(x, z, t + T) - phase(x, z, t)) - 2 * Math.PI)).toBeLessThan(1e-6);
        // and after any time its offset to the hulls' swell is the same as at the start (no drift: one clock)
        const lag = (u: number) => phase(x, z, u) - Math.sign(phase(x, z, u + 1e-3) - phase(x, z, u)) * -swellPhase(x, z, u);
        expect(Math.abs(lag(t + 300) - lag(t))).toBeLessThan(1e-6);
      }
    }
    // the clocks it replaces beat against the swell (about every 1–3 minutes): this is the defect
    for (const w of [0.78, 0.85, 0.105 * 2 * Math.PI]) expect((2 * Math.PI) / Math.abs(w - W0.w)).toBeLessThan(200);
  });

  it("wires every consumer to hbSwellPhase on the sea clock, and leaves the declared sea-state amplitudes alone", () => {
    expect(OCEAN_FRAG).toContain("float trainPh = dnC * shoalW - hbSwellPhase(xz, t) + nA.b * 5.0 + nA.a * 0.8;");
    expect(OCEAN_FRAG).toContain("float swPh = hbSwellPhase(xz, t) + nA.b * 2.2 + nA.a * 1.2;");
    expect(OCEAN_FRAG).toContain("float sPh = hbSwellPhase(xz, t) + (nA.b - 0.5) * 5.0;");
    expect(RUNUP_GLSL).toContain("float ph = fract(-hbSwellPhase(W.xz, uRunup.y) * 0.15915494 + fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) * 0.35);");
    expect(RUNUP_GLSL).toContain(SWELL_PHASE_GLSL);
    for (const old of ["+ t * 0.78", "- t * 0.748", "- t * 0.85"]) expect(OCEAN_FRAG).not.toContain(old);
    expect(RUNUP_GLSL).not.toContain("uRunup.y * 0.105");
    // the run-up's cycles-per-radian literal is 1 / 2π to float32 precision (its sawtooth keeps the swell's period)
    expect(Math.abs(0.15915494 * 2 * Math.PI - 1)).toBeLessThan(1e-7);
    // the sea clock (uTime / uRunup.y) is the one MotionClock the ocean system steps
    const sys = readFileSync(resolve(__dirname, "ocean-system.ts"), "utf8");
    expect(sys).toContain("this.time = this.seaTime.value = this.clock.step(frame.delta);");
    expect(sys).toContain("runupUniforms.uRunup.value.set(this.seaU.value.x, this.time);");
    // sea-state amplitudes (the off-peg reading's swell, chop, caps, bands) are unchanged
    expect(SEA_STATES.map((s) => [s.amp, s.chop, s.caps, s.bands])).toEqual([[0.1, 0.35, 0, 0.8], [0.24, 0.55, 0, 1], [0.5, 0.8, 0.85, 1.15], [0.85, 1, 1, 1.35]]);
    expect(RUNUP_GLSL).toContain("float reach = (0.22 + 0.55 * uRunup.x) * (0.5 + 0.5 * pow(1.0 - ph, 1.5));");
  });

  it("evaluates the five phases once for every shading use, equal to the former per-wave normal and crest", () => {
    const glsl = wavesGLSL();
    expect(glsl).toContain("void gerstnerSums(vec2 p, float t, out vec3 g, out float crest)");
    expect(glsl).toContain("vec3 gerstnerNormalOf(vec3 g, float amp) { return normalize(vec3(-g.x * amp, 1.0 - g.y * amp, -g.z * amp)); }");
    expect(OCEAN_FRAG).toContain("gerstnerSums(xzw, t, gS, crestH);\n  vec3 gN = gerstnerNormalOf(gS, ampShade * groups);");
    expect(OCEAN_FRAG).toContain("vec3 gT = gerstnerNormalOf(gS, amp * groups);");
    expect(OCEAN_FRAG).not.toMatch(/gerstnerNormal\(|gerstnerCrest\(/);
    // CPU twin: the sums scaled by amp are the former per-wave normal accumulation, for any amplitude
    const n = WAVES.length, r = rng(13);
    for (let i = 0; i < 300; i++) {
      const x = (r() - 0.5) * 2000, z = (r() - 0.5) * 2000, t = r() * 1e4, amp = r() * 2;
      let ax = 0, ay = 1, az = 0, gx = 0, gy = 0, gz = 0;
      for (const wv of WAVES) {
        const ph = wv.k * (wv.dirX * x + wv.dirZ * z) - wv.w * t, c = Math.cos(ph), s = Math.sin(ph);
        ax -= wv.dirX * wv.k * wv.amp * amp * c; az -= wv.dirZ * wv.k * wv.amp * amp * c; ay -= (wv.steep / n) * s * amp;
        gx += wv.dirX * wv.k * wv.amp * c; gz += wv.dirZ * wv.k * wv.amp * c; gy += (wv.steep / n) * s;
      }
      expect(Math.abs(-gx * amp - ax) + Math.abs(1 - gy * amp - ay) + Math.abs(-gz * amp - az)).toBeLessThan(1e-12);
    }
  });

  it("stills under reduced motion: the sea clock stops, and with it every phase", () => {
    const motion = { reduced: false } as { reduced: boolean };
    const clock = new MotionClock(motion as unknown as ConstructorParameters<typeof MotionClock>[0]);
    for (let f = 0; f < 120; f++) clock.step(1 / 60);
    motion.reduced = true;
    for (let f = 0; f < 600; f++) clock.step(1 / 60);       // eases out over ~1–2 s
    const held = clock.step(1 / 60);
    const at = Object.values(consumers).map((phase) => phase(120, -40, held));
    for (let f = 0; f < 600; f++) expect(clock.step(1 / 60)).toBe(held);
    expect(Object.values(consumers).map((phase) => phase(120, -40, clock.time))).toEqual(at);
    // reduced from the first frame: the swell never moves at all
    const still = new MotionClock({ reduced: true } as unknown as ConstructorParameters<typeof MotionClock>[0]);
    for (let f = 0; f < 60; f++) expect(still.step(1 / 60)).toBe(0);
  });
});
