import { describe, expect, it } from "vitest";
import { bankReveal, seasonBankShape, type SkySeasonWeights } from "./season-sky";

const SEASONS: SkySeasonWeights[] = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0, 0, 0.5, 0.5]];

describe("W10 seasonal sky: shapes only, cover stays DEWS", () => {
  it("keeps every bank's painted area in every season (no season looks cloudier)", () => {
    for (const w of SEASONS) for (const near of [0, 0.5, 1]) {
      const s = seasonBankShape({ w: 12, h: 3 }, w, near);
      expect(s.w * s.h).toBeCloseTo(36, 6);
    }
  });

  it("summer towers, winter lies flat", () => {
    const summer = seasonBankShape({ w: 12, h: 3 }, [0, 1, 0, 0], 1), winter = seasonBankShape({ w: 12, h: 3 }, [0, 0, 0, 1], 1);
    expect(summer.h).toBeGreaterThan(3);
    expect(winter.h).toBeLessThan(3);
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
});
