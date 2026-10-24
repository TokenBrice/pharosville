import { describe, expect, it } from "vitest";
import { lampGlow, lampJitter, lampRank, LAMP_RAMP, LAMP_WAVE_SPREAD, LAMP_WAVE_START, TOWER_BAND, type LampWaveParams } from "./lamp-wave";

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
    for (const r of [0, 0.3, 1]) expect(lampGlow(1, r, LAMP_WAVE_SPREAD)).toBe(1);
    for (const g of [0, 0.2, 0.5, 0.9]) expect(lampGlow(g, 0.8, 0)).toBeCloseTo(g, 9);
    for (const g of [0.75, 0.9]) for (const r of [0, 0.5, 1]) expect(lampGlow(g, r, LAMP_WAVE_SPREAD)).toBeCloseTo(g, 9);
    // the ramp is short against the whole wave, so a still shows a front
    expect(LAMP_RAMP).toBeLessThan(LAMP_WAVE_SPREAD / 5);
    // dusk: halfway through the wave the near lamps are lit and the far ones still dark
    const mid = LAMP_WAVE_START + LAMP_WAVE_SPREAD * 0.5;
    expect(lampGlow(mid, 0.2, LAMP_WAVE_SPREAD)).toBeCloseTo(mid, 9);
    expect(lampGlow(mid, 0.8, LAMP_WAVE_SPREAD)).toBe(0);
    // before the first moment nothing is lit; at dawn (falling g) the far lamps go out first
    expect(lampGlow(LAMP_WAVE_START, 0, LAMP_WAVE_SPREAD)).toBe(0);
  });
});
