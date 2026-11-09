import { describe, expect, it } from "vitest";
import { bankReveal, bankRevealByBand, seasonBankShape, type SkySeasonWeights } from "./season-sky";

const SEASONS: SkySeasonWeights[] = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0, 0, 0.5, 0.5]];

describe("W10 seasonal sky: shapes only, cover stays DEWS", () => {
  it("keeps every bank's painted area in every season (no season looks cloudier)", () => {
    for (const w of SEASONS) for (const near of [0, 0.5, 1]) for (const calm of [0, 0.5, 1]) {
      const s = seasonBankShape({ w: 12, h: 3 }, w, near, calm);
      expect(s.w * s.h).toBeCloseTo(36, 6);
    }
  });

  it("summer towers, winter lies flat", () => {
    const summer = seasonBankShape({ w: 12, h: 3 }, [0, 1, 0, 0], 1), winter = seasonBankShape({ w: 12, h: 3 }, [0, 0, 0, 1], 1);
    expect(summer.h).toBeGreaterThan(3);
    expect(winter.h).toBeLessThan(3);
  });

  it("calm weather shortens the autumn's long low banks (shape only)", () => {
    const stormy = seasonBankShape({ w: 12, h: 3 }, [0, 0, 1, 0], 1, 0), calm = seasonBankShape({ w: 12, h: 3 }, [0, 0, 1, 0], 1, 1);
    expect(calm.w).toBeLessThan(stormy.w);
    expect(calm.w * calm.h).toBeCloseTo(stormy.w * stormy.h, 6);
  });

  it("the cover a DEWS level reveals is identical in every season", () => {
    // the reveal takes no season; equal DEWS → equal cover → equal total painted area
    for (const cover of [0.15, 0.37, 0.59, 0.81, 1]) {
      const area = (w: SkySeasonWeights) => [0, 1, 2, 3, 4, 5, 6, 7].reduce((sum, slot) => {
        const s = seasonBankShape({ w: 10 + slot, h: 2 + slot * 0.3 }, w, slot / 7);
        return sum + bankReveal(cover, slot, 8) * s.w * s.h;
      }, 0);
      const a0 = area(SEASONS[0]);
      for (const w of SEASONS) expect(area(w)).toBeCloseTo(a0, 6);
    }
  });

  it("T6: the visible banks step strictly by band (Calm ≈ 3, Watch ≈ 5, Alert full), in every season alike", () => {
    const cover = (level: number) => Math.min(1, 0.15 + level * 0.22);   // weather/director targetsForLevel
    const shown = (level: number) => [0, 1, 2, 3, 4, 5, 6, 7].reduce((n, slot) => n + bankRevealByBand(cover(level), slot, 8), 0);
    expect(shown(0)).toBeCloseTo(3, 1);
    expect(shown(1)).toBeGreaterThan(5);
    expect(shown(1)).toBeLessThan(6);
    expect(shown(2)).toBe(8);
    for (let l = 0; l < 2; l++) expect(shown(l + 1)).toBeGreaterThan(shown(l) + 1.5);
    for (let l = 2; l < 4; l++) expect(shown(l + 1)).toBe(8);
    for (let c = 0; c < 1; c += 0.01) for (let slot = 0; slot < 8; slot++) expect(bankRevealByBand(c + 0.01, slot, 8)).toBeGreaterThanOrEqual(bankRevealByBand(c, slot, 8));
    for (const level of [0, 1, 2]) {
      const area = (w: SkySeasonWeights) => [0, 1, 2, 3, 4, 5, 6, 7].reduce((sum, slot) => {
        const s = seasonBankShape({ w: 10 + slot, h: 2 + slot * 0.3 }, w, slot / 7);
        return sum + bankRevealByBand(cover(level), slot, 8) * s.w * s.h;
      }, 0);
      for (const w of SEASONS) expect(area(w)).toBeCloseTo(area(SEASONS[0]), 6);
    }
  });
});
