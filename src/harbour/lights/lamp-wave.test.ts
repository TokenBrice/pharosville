import { describe, expect, it } from "vitest";
import { lampGlow, lampJitter, lampRank, LAMP_WAVE_SPREAD, TOWER_BAND, type LampWaveParams } from "./lamp-wave";

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
    expect(Math.abs(lampRank(300, 3, 0, 1, P) - lampRank(300, 3, 0, 0, P))).toBeLessThanOrEqual(0.12 + 1e-9);
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

  it("same share curve, later by spread × rank; full night unchanged; reduced motion = the global step", () => {
    for (const r of [0, 0.3, 1]) expect(lampGlow(1, r, LAMP_WAVE_SPREAD)).toBe(1);
    for (const g of [0, 0.2, 0.5, 0.9]) {
      expect(lampGlow(g, 0, LAMP_WAVE_SPREAD)).toBeCloseTo(g, 9);
      expect(lampGlow(g, 0.8, 0)).toBeCloseTo(g, 9);
      expect(lampGlow(g, 0.8, LAMP_WAVE_SPREAD)).toBeLessThanOrEqual(g);
    }
    // dusk: the far town is still dark while the Pharos side is already lit; at dawn (falling g) it goes out first
    expect(lampGlow(0.15, 1, LAMP_WAVE_SPREAD)).toBe(0);
    expect(lampGlow(0.15, 0, LAMP_WAVE_SPREAD)).toBeGreaterThan(0.1);
  });
});
