import { makeSourceStatuses } from "@/__fixtures__/pharosville-world";
import { describe, expect, it } from "vitest";
import {
  advanceSkyClarityFade,
  createSkyClarityFade,
  FAR_SHORE_RANGES,
  farShoreRangeVisibility,
  NEUTRAL_SKY_CLARITY,
  psiSkyClarity,
  signedSkyClarity,
  SKY_CLARITY_CROSSFADE_SECONDS,
  type PsiSkyInput,
} from "./psi-sky";

const input = (band: string, timeSeconds: number, stale = false): PsiSkyInput => ({
  lighthouse: { psiBand: band, score: 80, unavailable: false, evidence: { stability: makeSourceStatuses({ stability: { state: stale ? "stale" : "current" } }).stability } },
  timeSeconds, asOf: `reading-${timeSeconds}`,
});

describe("PSI sky clarity", () => {
  it("requires sixty continuous current seconds and rejects a transient band", () => {
    const good = psiSkyClarity(input("BEDROCK", 0));
    const pending = psiSkyClarity(input("CRISIS", 1), good);
    expect(psiSkyClarity(input("CRISIS", 60), pending).band).toBe("BEDROCK");
    const settled = psiSkyClarity(input("CRISIS", 61), pending);
    expect(settled.band).toBe("CRISIS");
    expect(settled.clarity).toBeLessThan(good.clarity);
    const recovered = psiSkyClarity(input("BEDROCK", 30), pending);
    expect(recovered.pendingBand).toBeNull();
  });

  it("freezes last good clarity and timestamp through stale PSI, restarting observation on recovery", () => {
    const good = psiSkyClarity(input("CRISIS", 0));
    const pending = psiSkyClarity(input("BEDROCK", 1), good);
    const stale = psiSkyClarity(input("BEDROCK", 1000, true), pending);
    expect(stale.clarity).toBe(good.clarity);
    expect(stale.asOf).toBe(good.asOf);
    const recovery = psiSkyClarity(input("BEDROCK", 2000), stale);
    expect(recovery.band).toBe("CRISIS");
    expect(psiSkyClarity(input("BEDROCK", 2059), recovery).band).toBe("CRISIS");
    expect(psiSkyClarity(input("BEDROCK", 2060), recovery).band).toBe("BEDROCK");
  });

  it("uses neutral authored clarity when unavailable or initially stale", () => {
    expect(psiSkyClarity(input("unknown", 0)).clarity).toBe(NEUTRAL_SKY_CLARITY);
    expect(psiSkyClarity(input("CRISIS", 0, true)).clarity).toBe(NEUTRAL_SKY_CLARITY);
  });
});

describe("clear air is earned (K39)", () => {
  const visibleRanges = (band: string) => {
    const signed = signedSkyClarity(psiSkyClarity(input(band, 0)).clarity);
    return FAR_SHORE_RANGES.filter((_, index) => farShoreRangeVisibility(signed, index) >= 0.5).length;
  };

  it("shows good news: the healthy bands differ, and the haze takes the far range first", () => {
    expect(signedSkyClarity(NEUTRAL_SKY_CLARITY)).toBe(0);
    expect(visibleRanges("BEDROCK")).toBe(3);
    expect(visibleRanges("STEADY")).toBe(3);
    expect(visibleRanges("TREMOR")).toBe(2);
    expect(visibleRanges("FRACTURE")).toBe(1);
    expect(visibleRanges("CRISIS")).toBe(0);
    // As clarity falls, a nearer range never vanishes before a farther one.
    for (let signed = -1; signed <= 1; signed += 0.05) {
      const visibility = FAR_SHORE_RANGES.map((_, index) => farShoreRangeVisibility(signed, index));
      expect(visibility[0]!).toBeLessThanOrEqual(visibility[1]! + 1e-9);
      expect(visibility[1]!).toBeLessThanOrEqual(visibility[2]! + 1e-9);
    }
  });

  it("crossfades an accepted band over 90 s, and applies it at once under reduced motion", () => {
    const fade = createSkyClarityFade();
    expect(advanceSkyClarityFade(fade, 1, 0, false)).toBe(1);
    expect(advanceSkyClarityFade(fade, -1, 10, false)).toBe(1);
    const midway = advanceSkyClarityFade(fade, -1, 10 + SKY_CLARITY_CROSSFADE_SECONDS / 2, false);
    expect(midway).toBeCloseTo(0, 5);
    expect(advanceSkyClarityFade(fade, -1, 10 + SKY_CLARITY_CROSSFADE_SECONDS, false)).toBe(-1);
    expect(advanceSkyClarityFade(fade, 1, 200, true)).toBe(1);
  });
});
