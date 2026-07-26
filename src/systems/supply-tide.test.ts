import { describe, expect, it } from "vitest";
import type { ChainsResponse } from "@shared/types/chains";
import {
  buildSupplyTide,
  SUPPLY_TIDE_FULL_SCALE_PCT,
  supplyTideOffset,
} from "./supply-tide";

function chains(globalChange7dPct: number | undefined): ChainsResponse {
  return {
    chains: [],
    globalTotalUsd: 1,
    chainAttributedTotalUsd: 1,
    unattributedTotalUsd: 0,
    globalChange24hPct: 0,
    globalChange7dPct: globalChange7dPct as number,
    globalChange30dPct: 0,
    updatedAt: 0,
    healthMethodologyVersion: "test",
  };
}

describe("buildSupplyTide", () => {
  it("reads globalChange7dPct as a FRACTION, not as percent units", () => {
    // The trap this guards. `ShipNode.change7dPct` is percent units (recent-change.ts
    // multiplies by 100); `chains.globalChange7dPct` is a fraction despite the
    // identical suffix. Verified against live data: the fleet's own 7d change
    // computed from /api/stablecoins was +0.0486%, and this field read 0.000187
    // — which only agrees as a fraction. Reading it as percent units would
    // under-report every week by 100x.
    expect(buildSupplyTide(chains(0.000187)).change7dPct).toBeCloseTo(0.0187, 4);
    expect(buildSupplyTide(chains(-0.0092)).change7dPct).toBeCloseTo(-0.92, 4);
  });

  it("names the direction rather than leaving it to the sign", () => {
    expect(buildSupplyTide(chains(0.005)).state).toBe("flood");
    expect(buildSupplyTide(chains(-0.005)).state).toBe("ebb");
  });

  it("floods above the datum for growth and ebbs below it for contraction", () => {
    expect(buildSupplyTide(chains(0.005)).offset).toBeGreaterThan(0);
    expect(buildSupplyTide(chains(-0.005)).offset).toBeLessThan(0);
  });

  it("calls a hundredth-of-a-percent week slack rather than asserting a direction", () => {
    // A ~$330B float moving 0.005% is producer noise. Claiming "rising" from it
    // would be inventing a direction out of rounding.
    const tide = buildSupplyTide(chains(0.00005));
    expect(tide.state).toBe("slack");
    expect(tide.offset).toBe(0);
  });

  it("reports unavailable — never a flat tide — when there is no chains payload", () => {
    // Slack water and no data must not look alike: one is a measured flat week.
    expect(buildSupplyTide(null).state).toBe("unavailable");
    expect(buildSupplyTide(undefined).state).toBe("unavailable");
    expect(buildSupplyTide(chains(undefined)).state).toBe("unavailable");
    expect(buildSupplyTide(chains(Number.NaN)).state).toBe("unavailable");
    expect(buildSupplyTide(null).change7dPct).toBeNull();
  });
});

describe("supplyTideOffset", () => {
  it("saturates at full scale and never exceeds the datum's excursion", () => {
    expect(supplyTideOffset(SUPPLY_TIDE_FULL_SCALE_PCT)).toBe(1);
    expect(supplyTideOffset(-SUPPLY_TIDE_FULL_SCALE_PCT)).toBe(-1);
    expect(supplyTideOffset(500)).toBe(1);
    expect(supplyTideOffset(-500)).toBe(-1);
  });

  it("lifts an ordinary week clear of the datum instead of pinning it there", () => {
    // The reason the response is compressed at all: on a linear scale against a
    // 2% full scale, a real +0.2% week would sit at 10% of the excursion and be
    // invisible. The square root puts it around a third.
    const ordinary = supplyTideOffset(0.2);
    expect(ordinary).toBeGreaterThan(0.28);
    expect(ordinary).toBeLessThan(0.36);
  });

  it("is monotonic in the change, so a bigger week always reads as a bigger tide", () => {
    const samples = [0.001, 0.01, 0.05, 0.2, 0.5, 1, 2].map(supplyTideOffset);
    for (const [index, value] of samples.entries()) {
      if (index === 0) continue;
      expect(value).toBeGreaterThan(samples[index - 1]!);
    }
  });

  it("is symmetric about zero", () => {
    expect(supplyTideOffset(0.4)).toBeCloseTo(-supplyTideOffset(-0.4), 12);
  });
});
