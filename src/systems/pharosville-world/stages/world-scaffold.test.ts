import { STATUS_COINGECKO_PRICE_DIFF_THRESHOLD_PCT } from "@shared/lib/status-thresholds";
import type { PegSummaryResponse, PegSummaryStats } from "@shared/types";
import { describe, expect, it } from "vitest";
import { SIGNAL_MAST_MAX_PENNANTS } from "../../world-types";
import { buildSignalMast, SIGNAL_MAST_STORM_CONE_BPS } from "./world-scaffold";

function pegSummary(summary: Partial<PegSummaryStats> | null): PegSummaryResponse {
  return {
    coins: [],
    summary: summary === null
      ? null
      : {
          activeDepegCount: 0,
          medianDeviationBps: 2,
          worstCurrent: null,
          coinsAtPeg: 214,
          totalTracked: 214,
          depegEventsToday: 0,
          depegEventsYesterday: 0,
          ...summary,
        },
    methodology: { asOf: 0 } as PegSummaryResponse["methodology"],
  };
}

describe("buildSignalMast (3a)", () => {
  it("takes the storm gate from the shared price-materiality threshold", () => {
    expect(SIGNAL_MAST_STORM_CONE_BPS).toBe(STATUS_COINGECKO_PRICE_DIFF_THRESHOLD_PCT * 100);
  });

  it("flies one pennant per coin off peg", () => {
    const mast = buildSignalMast(pegSummary({ activeDepegCount: 3 }));

    expect(mast.activeDepegCount).toBe(3);
    expect(mast.pennantCount).toBe(3);
    expect(mast.capped).toBe(false);
    expect(mast.unavailable).toBe(false);
  });

  it("caps the hoist and records that it did, so the DOM can carry the count", () => {
    const mast = buildSignalMast(pegSummary({ activeDepegCount: 17 }));

    expect(mast.pennantCount).toBe(SIGNAL_MAST_MAX_PENNANTS);
    expect(mast.capped).toBe(true);
    // The exact figure survives the cap — the mast rounds, the model does not.
    expect(mast.activeDepegCount).toBe(17);
  });

  it("hoists the cone on magnitude, so a coin above par counts as much as one below", () => {
    const below = buildSignalMast(pegSummary({
      activeDepegCount: 1,
      worstCurrent: { id: "x", symbol: "XUSD", bps: -SIGNAL_MAST_STORM_CONE_BPS },
    }));
    const above = buildSignalMast(pegSummary({
      activeDepegCount: 1,
      worstCurrent: { id: "x", symbol: "XUSD", bps: SIGNAL_MAST_STORM_CONE_BPS },
    }));
    const under = buildSignalMast(pegSummary({
      activeDepegCount: 1,
      worstCurrent: { id: "x", symbol: "XUSD", bps: -(SIGNAL_MAST_STORM_CONE_BPS - 1) },
    }));

    expect(below.stormCone).toBe(true);
    expect(above.stormCone).toBe(true);
    expect(under.stormCone).toBe(false);
    expect(under.worstSymbol).toBe("XUSD");
  });

  it("stands bare and says so when no peg summary arrived", () => {
    for (const input of [pegSummary(null), null, undefined]) {
      const mast = buildSignalMast(input);

      expect(mast.unavailable).toBe(true);
      expect(mast.pennantCount).toBe(0);
      expect(mast.stormCone).toBe(false);
      // Absent evidence must not read as a calm fleet.
      expect(mast.coinsAtPeg).toBeNull();
      expect(mast.totalTracked).toBeNull();
    }
  });

  it("drops non-finite figures rather than hoisting nonsense", () => {
    const mast = buildSignalMast(pegSummary({
      activeDepegCount: Number.NaN,
      medianDeviationBps: Number.NaN,
      worstCurrent: { id: "x", symbol: "XUSD", bps: Number.NaN },
    }));

    expect(mast.activeDepegCount).toBe(0);
    expect(mast.pennantCount).toBe(0);
    expect(mast.worstBps).toBeNull();
    expect(mast.medianDeviationBps).toBeNull();
    expect(mast.stormCone).toBe(false);
  });
});
