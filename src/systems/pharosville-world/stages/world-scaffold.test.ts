import { STATUS_COINGECKO_PRICE_DIFF_THRESHOLD_PCT } from "@shared/lib/status-thresholds";
import type { PegSummaryResponse, PegSummaryStats, StabilityIndexResponse } from "@shared/types";
import { describe, expect, it } from "vitest";
import { psiBandSeverity, SIGNAL_MAST_MAX_PENNANTS } from "../../world-types";
import {
  buildBeamDwell,
  buildHighWaterMark,
  buildSignalMast,
  SIGNAL_MAST_STORM_CONE_BPS,
} from "./world-scaffold";
import { buildGardenMonthRecord } from "../../garden-month-record";
import { buildPharosVilleWorld } from "../../pharosville-world";
import { fixtureChains, makePharosVilleWorldInput } from "../../../__fixtures__/pharosville-world";

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

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 26);

function history(
  points: ReadonlyArray<{ daysAgo: number; band: string; score?: number }>,
): StabilityIndexResponse {
  return {
    current: null,
    history: points.map(({ daysAgo, band, score }) => ({
      date: NOW - daysAgo * DAY_MS,
      score: score ?? 50,
      band,
      methodologyVersion: "test",
    })),
    methodology: { asOf: 0 } as StabilityIndexResponse["methodology"],
  };
}

describe("garden month record (W6.2)", () => {
  it("copies the trailing PSI record onto the lighthouse scaffold", () => {
    const input = makePharosVilleWorldInput();
    input.stability = history([
      { daysAgo: 0, band: "STEADY", score: 90 },
      { daysAgo: 15, band: "STEADY", score: 80 },
      { daysAgo: 40, band: "FRACTURE", score: 10 },
    ]);
    const world = buildPharosVilleWorld(input);
    expect(world.lighthouse.gardenMonthRecord).toEqual(buildGardenMonthRecord(input.stability));
    expect(world.lighthouse.gardenMonthRecord).toMatchObject({ averagePsi: 85, growth: 1, sampleCount: 2 });
  });
});

describe("buildHighWaterMark (3c)", () => {
  it("marks the worst band the window reached, not the latest one", () => {
    // The whole point: a harbour calm today that spent last week in FRACTURE
    // must not look like one that has never been anything else.
    const mark = buildHighWaterMark(history([
      { daysAgo: 0, band: "BEDROCK" },
      { daysAgo: 6, band: "FRACTURE", score: 31 },
      { daysAgo: 12, band: "TREMOR" },
    ]));

    expect(mark.band).toBe("FRACTURE");
    expect(mark.severity).toBe(psiBandSeverity("FRACTURE"));
    expect(mark.score).toBe(31);
    expect(mark.at).toBe(NOW - 6 * DAY_MS);
    expect(mark.sampleCount).toBe(3);
    expect(mark.spanDays).toBe(12);
    expect(mark.unavailable).toBe(false);
  });

  it("measures the window back from the newest reading, not from now", () => {
    // A producer that stopped writing must not have its record silently erased
    // as the payload ages — a high-water mark that forgets is not one.
    const mark = buildHighWaterMark(history([
      { daysAgo: 200, band: "STEADY" },
      { daysAgo: 210, band: "CRISIS" },
      { daysAgo: 260, band: "MELTDOWN" },
    ]));

    expect(mark.band).toBe("CRISIS");
    expect(mark.sampleCount).toBe(2);
  });

  it("drops readings older than the window", () => {
    const mark = buildHighWaterMark(history([
      { daysAgo: 0, band: "STEADY" },
      { daysAgo: 45, band: "MELTDOWN" },
    ]));

    expect(mark.band).toBe("STEADY");
    expect(mark.sampleCount).toBe(1);
    expect(mark.spanDays).toBe(0);
  });

  it("keeps the earlier of two readings that tie", () => {
    // The mark is where the sea FIRST reached; a later touch of the same band
    // did not raise it.
    const mark = buildHighWaterMark(history([
      { daysAgo: 2, band: "CRISIS" },
      { daysAgo: 9, band: "CRISIS" },
    ]));

    expect(mark.at).toBe(NOW - 9 * DAY_MS);
  });

  it("reports BEDROCK as a real record rather than as nothing", () => {
    const mark = buildHighWaterMark(history([
      { daysAgo: 0, band: "BEDROCK" },
      { daysAgo: 20, band: "BEDROCK" },
    ]));

    expect(mark.band).toBe("BEDROCK");
    expect(mark.severity).toBe(0);
    // Nothing is stained, but the evidence exists and the DOM must say so.
    expect(mark.unavailable).toBe(false);
  });

  it("stands unavailable rather than calm when there is no history", () => {
    for (const stability of [null, undefined, history([])]) {
      const mark = buildHighWaterMark(stability);
      expect(mark.unavailable).toBe(true);
      expect(mark.band).toBeNull();
      expect(mark.severity).toBeNull();
      expect(mark.sampleCount).toBe(0);
    }
  });

  it("ignores readings whose band this build does not know", () => {
    // An unrecognized band is not a calm one, and it must not set the mark.
    const mark = buildHighWaterMark(history([
      { daysAgo: 1, band: "SPICY" },
      { daysAgo: 3, band: "TREMOR" },
    ]));

    expect(mark.band).toBe("TREMOR");
    expect(mark.sampleCount).toBe(1);
  });
});

describe("buildBeamDwell (3d)", () => {
  it("points the beam at the head of the contributor list the DOM already shows", () => {
    const dwell = buildBeamDwell([
      { id: "usdx", symbol: "USDX", bps: -412, mcapUsd: 9e8 },
      { id: "eurz", symbol: "EURZ", bps: -900, mcapUsd: 4e6 },
    ]);

    // NOT the largest |bps| — the payload orders by contribution, and the
    // panel's "Top PSI contributors" list already presents that order. A second
    // sort here would be a second, quietly different answer.
    expect(dwell).toEqual({ shipId: "usdx", symbol: "USDX", bps: -412 });
  });

  it("has nothing to point at when the index named no contributor", () => {
    expect(buildBeamDwell(undefined)).toBeUndefined();
    expect(buildBeamDwell([])).toBeUndefined();
  });
});

describe("dock supply change (Tier 3 #13)", () => {
  it("carries each chain's own 24h and 7d held-supply change onto its harbour", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: {
        ...fixtureChains,
        chains: fixtureChains.chains.map((chain) => (
          chain.id === "ethereum"
            ? { ...chain, change24hPct: 2.4, change7dPct: -5 }
            : { ...chain, change24hPct: -1.1, change7dPct: 0.3 }
        )),
      },
    }));

    const ethereum = world.docks.find((dock) => dock.chainId === "ethereum");
    const tron = world.docks.find((dock) => dock.chainId === "tron");
    expect(ethereum?.change24hPct).toBe(2.4);
    expect(ethereum?.change7dPct).toBe(-5);
    // Each harbour reads its OWN chain, not the fleet's or its neighbour's.
    expect(tron?.change24hPct).toBe(-1.1);
    expect(tron?.change7dPct).toBe(0.3);
  });

  it("reports null rather than a bogus figure when the chain's number is not one", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: {
        ...fixtureChains,
        chains: fixtureChains.chains.map((chain) => (
          { ...chain, change24hPct: Number.NaN, change7dPct: Number.NaN }
        )),
      },
    }));

    expect(world.docks).not.toHaveLength(0);
    expect(world.docks.every((dock) => dock.change24hPct === null)).toBe(true);
    expect(world.docks.every((dock) => dock.change7dPct === null)).toBe(true);
  });
});
