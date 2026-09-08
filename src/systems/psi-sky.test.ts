import { describe, expect, it } from "vitest";
import { NEUTRAL_SKY_CLARITY, psiSkyClarity, type PsiSkyInput } from "./psi-sky";

const input = (band: string, timeSeconds: number, stale = false): PsiSkyInput => ({
  lighthouse: { psiBand: band, score: 80, unavailable: false },
  freshness: { stabilityStale: stale }, timeSeconds, asOf: `reading-${timeSeconds}`,
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
