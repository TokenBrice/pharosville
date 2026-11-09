import { describe, expect, it } from "vitest";
import {
  meteorIntervalGain, meteorVisibleShare, METEOR_E_MIN, METEOR_MIN_SHARE, METEOR_TOP_MARGIN, milkyWayFootTh, milkyWayTiltDeg, spawnMeteor,
} from "./night-sky";
import { MILKY_WAY_CAP, SKY_BAND_GLSL } from "./sky-glsl";

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("E23 night sky projection: the river crosses the camera band", () => {
  it("leans 35–60° and turns with the clock through the night", () => {
    let last = Infinity;
    for (let h = 19; h <= 29; h += 0.5) {
      const tilt = milkyWayTiltDeg(h % 24);
      expect(tilt).toBeGreaterThanOrEqual(35);
      expect(tilt).toBeLessThanOrEqual(60);
      expect(tilt).toBeLessThanOrEqual(last);
      last = tilt;
    }
    expect(milkyWayTiltDeg(19)).toBe(60);
    expect(milkyWayTiltDeg(5)).toBe(35);
  });

  it("enters at the horizon inside the frame and leaves through the frame top, away from the hero's side", () => {
    for (const halfDeg of [20, 23, 30]) for (const visTop of [3, 5, 8]) for (let h = 19; h <= 29; h += 1) {
      const t = h % 24, foot = milkyWayFootTh(t), lean = (milkyWayTiltDeg(t) * Math.PI) / 180;
      const top = foot + visTop / Math.tan(lean);
      expect(Math.abs(foot)).toBeLessThan(halfDeg);
      expect(Math.abs(top)).toBeLessThan(halfDeg);
      expect(foot).toBeGreaterThan(0);         // the Pharos and the moon's station stand left of centre
    }
  });

  it("caps the river's light with a fixed palette constant (the fire keeps the night's brightest pixels)", () => {
    expect(MILKY_WAY_CAP).toBeLessThan(0.2);
    expect(SKY_BAND_GLSL).toContain(`${MILKY_WAY_CAP.toFixed(3)} - dot(c,`);
    expect(SKY_BAND_GLSL).toContain("mwAdd *= 2.5;");
  });
});

describe("E23 meteors: born in the band, mostly in view, as rare as today's visible ones", () => {
  it("spawns every meteor with e0 in [1.2°, visTop − 0.6°] and ≥ 60 % of its streak visible", () => {
    const R = rng(7);
    let born = 0;
    for (const halfDeg of [18, 23, 30]) for (const visTop of [1.7, 2.5, 5, 9]) for (let i = 0; i < 400; i++) {
      const m = spawnMeteor(R, halfDeg, visTop, (R() * 2 - 1) * 180);
      if (visTop - METEOR_TOP_MARGIN < METEOR_E_MIN) { expect(m).toBeNull(); continue; }
      if (!m) continue;
      born++;
      expect(m.e0).toBeGreaterThanOrEqual(METEOR_E_MIN);
      expect(m.e0).toBeLessThanOrEqual(visTop - METEOR_TOP_MARGIN);
      expect(meteorVisibleShare(m, halfDeg, visTop)).toBeGreaterThanOrEqual(METEOR_MIN_SHARE);
      expect(m.dy).toBeLessThan(0);           // away from the radiant, high above the band
      expect(m.len).toBeGreaterThan(0);
    }
    expect(born).toBeGreaterThan(3000);
  });

  it("keeps today's visible rate: the interval grows by the visibility gain (Q5)", () => {
    expect(meteorIntervalGain(5)).toBeCloseTo(1 / 0.3, 6);     // the F9 default view: ~30 % were seen
    expect(meteorIntervalGain(9)).toBe(1);
    expect(meteorIntervalGain(2)).toBeCloseTo(1 / 0.3, 6);
    for (let v = 1; v < 10; v += 0.25) expect(meteorIntervalGain(v)).toBeGreaterThanOrEqual(meteorIntervalGain(v + 0.25));
  });
});
