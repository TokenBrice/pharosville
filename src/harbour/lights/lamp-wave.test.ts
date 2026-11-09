import { describe, expect, it } from "vitest";
import {
  glslFloat, lampArrive, lampGlow, lampJitter, lampRank, lampWaveUniforms, LAMP_ARRIVE_WIDTH, LAMP_RAMP, LAMP_WAVE_GLSL,
  LAMP_WAVE_SPREAD, LAMP_WAVE_START, TOWER_BAND, type LampWaveParams,
} from "./lamp-wave";

const P: LampWaveParams = { x: 0, z: 0, footY: 6, rMin: 20, rMax: 600, hTop: 92, spread: LAMP_WAVE_SPREAD, fromEdge: 0 };

describe("lamplighting wave (05-P3)", () => {
  it("ranks outward from the Pharos, the tower's own windows first and top-down", () => {
    const top = lampRank(0, 90, 5, 0, P), low = lampRank(0, 10, 5, 0, P);
    expect(top).toBeLessThan(low);
    expect(low).toBeLessThanOrEqual(TOWER_BAND);
    const near = lampRank(60, 3, 0, 0, P), far = lampRank(500, 3, 0, 0, P), beyond = lampRank(2000, 3, 0, 0, P);
    expect(low).toBeLessThan(near);
    expect(near).toBeLessThan(far);
    expect(beyond).toBeLessThanOrEqual(1);
  });

  it("jitter only nudges the order", () => {
    expect(Math.abs(lampRank(300, 3, 0, 1, P) - lampRank(300, 3, 0, 0, P))).toBeLessThanOrEqual(0.04 + 1e-9);
    for (const [x, z] of [[1.3, 7], [-200, 45.2], [512, -3]]) {
      const j = lampJitter(x, z);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(1);
    }
  });

  it("an unlit Pharos starts the wave from the town edge", () => {
    const edge = { ...P, fromEdge: 1 };
    expect(lampRank(500, 3, 0, 0, edge)).toBeLessThan(lampRank(60, 3, 0, 0, edge));
  });

  it("each light switches on over a short ramp at its own moment; full night unchanged; reduced motion = the global step", () => {
    for (const r of [0, 0.3, 1]) expect(lampGlow(1, r, LAMP_WAVE_SPREAD, 1)).toBe(1);
    for (const g of [0, 0.2, 0.5, 0.9]) expect(lampGlow(g, 0.8, 0, 1)).toBeCloseTo(g, 9);
    for (const g of [0.9, 0.95]) for (const r of [0, 0.5, 1]) expect(lampGlow(g, r, LAMP_WAVE_SPREAD, 1)).toBeCloseTo(g, 9);
    // the ramp is short against the whole wave, so a still shows a front
    expect(LAMP_RAMP).toBeLessThan(LAMP_WAVE_SPREAD / 5);
    // dusk: halfway through the wave the near lamps are lit and the far ones still dark
    const mid = LAMP_WAVE_START + LAMP_WAVE_SPREAD * 0.5;
    expect(lampGlow(mid, 0.2, LAMP_WAVE_SPREAD, 1)).toBeCloseTo(mid, 9);
    expect(lampGlow(mid, 0.8, LAMP_WAVE_SPREAD, 1)).toBe(0);
    // before the first moment nothing is lit; at dawn (falling g) the far lamps go out first
    expect(lampGlow(LAMP_WAVE_START, 0, LAMP_WAVE_SPREAD, 1)).toBe(0);
  });
});

describe("E26 the visible lamp round", () => {
  it("runs from sunset light into the early blue hour, each lamp igniting over 0.002 of glow", () => {
    expect(LAMP_WAVE_START).toBe(0.45);
    expect(LAMP_RAMP).toBe(0.002);
    // the last lamp has caught before the blue-hour key's glow (0.95) and stays under full night
    expect(LAMP_WAVE_START + LAMP_WAVE_SPREAD + LAMP_RAMP).toBeLessThan(0.95);
  });

  it("writes every GLSL constant with at least four decimals that read back as the CPU value", () => {
    for (const v of [0.45, 0.002, 0.0005, 0.06, 0.94, 0.96, 0.04, 0.85, 0.15, 1 / 3]) {
      const s = glslFloat(v);
      expect(s).toMatch(/^\d+\.\d{4,}$/);
      if (v !== 1 / 3) expect(Number(s)).toBe(v);
    }
    // toFixed(3) would have zeroed a 0.0005 ramp; glslFloat keeps it
    expect(Number(glslFloat(0.0005))).toBe(0.0005);
    const literals = [...LAMP_WAVE_GLSL.matchAll(/(?<![\w.])(\d+\.\d+)(?![\w.])/g)].map((m) => m[1]);
    for (const constant of [LAMP_WAVE_START, LAMP_RAMP, TOWER_BAND, 1 - TOWER_BAND, LAMP_ARRIVE_WIDTH, 1 - LAMP_ARRIVE_WIDTH]) {
      expect(literals).toContain(glslFloat(constant));
    }
    for (const literal of literals.filter((l) => !/^\d+\.0$/.test(l) && !["12.9898", "78.233", "43758.5453"].includes(l))) {
      expect(literal, literal).toMatch(/\.\d{4,}$/);
    }
  });

  it("matches the shader on the CPU: a smoothstep ignition at d = start + spread × rank", () => {
    const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    for (const rank of [0, 0.13, 0.5, 0.97, 1]) for (let g = 0; g <= 1.0001; g += 0.0007) {
      const d = LAMP_WAVE_START + LAMP_WAVE_SPREAD * rank;
      expect(lampGlow(g, rank, LAMP_WAVE_SPREAD, 1)).toBeCloseTo(smooth(d, d + LAMP_RAMP, g) * g, 12);
    }
  });

  it("walks out at dusk and back in at dawn, and rests on the clock once the round is over", () => {
    const ranks = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1];
    const lit = (g: number) => ranks.filter((r) => lampGlow(g, r, LAMP_WAVE_SPREAD, 1) > g * 0.5);
    let previous: number[] = [];
    for (let g = 0.4; g <= 0.9; g += 0.01) { // dusk: every lamp lit stays lit, and lighting goes in rank order
      const now = lit(g);
      expect(now.slice(0, previous.length)).toEqual(previous);
      expect(now).toEqual(ranks.slice(0, now.length));
      previous = now;
    }
    expect(previous).toEqual(ranks);
    for (let g = 0.9; g >= 0.4; g -= 0.01) { // dawn: the town edge goes out first, the Pharos last
      const now = lit(g);
      expect(now).toEqual(ranks.slice(0, now.length));
      expect(now.length).toBeLessThanOrEqual(previous.length);
      previous = now;
    }
    expect(previous).toEqual([]);
    // steady final state: past the last ignition every lamp follows the clock exactly, at every rank
    const done = LAMP_WAVE_START + LAMP_WAVE_SPREAD + LAMP_RAMP;
    for (const g of [done, 0.9, 0.97, 1]) for (const r of [0, 0.37, 1]) expect(lampGlow(g, r, LAMP_WAVE_SPREAD, 1)).toBeCloseTo(g, 12);
  });
});

describe("E29 the arrival beat (uLampArrive)", () => {
  it("rests on the clock's true state by default and at 1", () => {
    expect(lampWaveUniforms.uLampArrive.value).toBe(1);
    for (const r of [0, 0.5, 1]) {
      expect(lampArrive(r, 1)).toBe(1);
      expect(lampGlow(0.95, r, LAMP_WAVE_SPREAD)).toBeCloseTo(0.95, 12); // default argument: the live uniform
    }
  });

  it("starts every decorative lamp dark and catches them outward in rank order", () => {
    for (const r of [0, 0.5, 1]) expect(lampGlow(1, r, LAMP_WAVE_SPREAD, 0)).toBe(0);
    for (let a = 0; a <= 1; a += 0.02) {
      const k = [0, 0.2, 0.4, 0.6, 0.8, 1].map((r) => lampArrive(r, a));
      for (let i = 1; i < k.length; i++) expect(k[i]).toBeLessThanOrEqual(k[i - 1] + 1e-12);
    }
    // each lamp's own catch is short against the beat; the last lamp lands exactly at its end
    expect(lampArrive(1, 1 - LAMP_ARRIVE_WIDTH)).toBe(0);
    expect(lampArrive(1, 0.999999)).toBeGreaterThan(0.99);
    expect(lampArrive(0, LAMP_ARRIVE_WIDTH)).toBe(1);
  });

  it("applies under reduced motion's global step too, and never brightens past the clock", () => {
    for (const a of [0, 0.3, 0.7, 1]) for (const g of [0, 0.5, 1]) {
      expect(lampGlow(g, 0.4, 0, a)).toBeLessThanOrEqual(g + 1e-12);
      expect(lampGlow(g, 0.4, LAMP_WAVE_SPREAD, a)).toBeLessThanOrEqual(g + 1e-12);
    }
  });
});
