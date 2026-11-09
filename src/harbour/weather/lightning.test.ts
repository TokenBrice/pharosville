import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildBolt, fenceBolts, Lightning, PHAROS_CLEAR_DEG, strikeTh, type LightningFrame } from "./lightning";
import { RAIN_FLASH_LIFT } from "./precip";

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("E24 safe strikes: lightning never seems to hit the Pharos", () => {
  it("places every strike outside the projected Pharos ±4° from one sample (no reroll), inside the view", () => {
    const R = rng(11);
    for (const span of [4, 8, 17, 25, 30]) for (let i = 0; i < 2000; i++) {
      const avoid = (R() * 2 - 1) * (span + 6), th = strikeTh(R(), span, avoid);
      expect(Math.abs(th - avoid)).toBeGreaterThanOrEqual(PHAROS_CLEAR_DEG - 1e-9);
      if (2 * span - (Math.min(span, avoid + PHAROS_CLEAR_DEG) - Math.max(-span, avoid - PHAROS_CLEAR_DEG)) > 1e-6) {
        expect(th).toBeGreaterThanOrEqual(-span - 1e-9);
        expect(th).toBeLessThanOrEqual(span + 1e-9);
      }
    }
    // without a hero in view the old uniform spread is kept
    expect(strikeTh(0, 20, null)).toBe(-20);
    expect(strikeTh(0.5, 20, null)).toBe(0);
  });

  it("keeps the whole bolt (forks and crawlers) clear of the hero", () => {
    const R = rng(5);
    for (let i = 0; i < 300; i++) {
      const avoid = (R() * 2 - 1) * 20, th = strikeTh(R(), 25, avoid);
      const bolts = buildBolt(0, th, 2 + R() * 6, R);
      fenceBolts(bolts, avoid, th);
      for (const b of bolts) for (const p of b.pts) expect(Math.abs(p[0] - avoid)).toBeGreaterThanOrEqual(PHAROS_CLEAR_DEG - 1e-9);
    }
  });

  it("keeps the photosensitivity limits: at most two flashes a second, none under reduced motion", () => {
    const frame = (suppressed: boolean): LightningFrame => ({
      dt: 1 / 60, rate: 60, strikeKm: [2, 18], suppressed, camera: new THREE.PerspectiveCamera(), horizon: 1500,
      halfFovDeg: 25, bandTopDeg: 5, fwdAz: 0, night: 1, avoidTh: -8,
    });
    for (const suppressed of [false, true]) {
      const l = new Lightning();
      let last = 0, rising = 0;
      const perSecond: number[] = [];
      for (let i = 0; i < 60 * 60; i++) {
        l.update(frame(suppressed));
        if (l.flash > 0.3 && last <= 0.3) rising++;
        last = l.flash;
        if (i % 60 === 59) { perSecond.push(rising); rising = 0; }
        if (suppressed) expect(l.flash).toBe(0);
      }
      expect(Math.max(...perSecond)).toBeLessThanOrEqual(2);
      l.dispose();
    }
  });

  it("lifts the falling drops by 1.2 in a flash (was 2.2): the strike flashes, not every drop", () => {
    expect(RAIN_FLASH_LIFT).toBe(1.2);
  });
});
