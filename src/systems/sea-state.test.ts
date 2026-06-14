import { describe, expect, it } from "vitest";
import {
  SEA_STATE_SMOOTHING_TAU_SECONDS,
  recentFleetTrendEntryLabel,
  recentFleetTrendSummary,
  recentFleetTrendSummaryText,
  seaStateForSources,
  seaStateSummary,
  smoothSeaState,
} from "./sea-state";
import type { AreaNode, LighthouseNode, ShipNode } from "./world-types";

const lighthouse = {
  psiBand: "STEADY",
  score: 12,
  unavailable: false,
} satisfies Pick<LighthouseNode, "psiBand" | "score" | "unavailable">;

function area(band: AreaNode["band"], count = 1): Pick<AreaNode, "band" | "count"> {
  return { ...(band !== undefined ? { band } : {}), count };
}

describe("sea-state master signal", () => {
  it("derives stronger swell, wind, and tempo from the max active DEWS band", () => {
    const calm = seaStateForSources({
      areas: [area("CALM")],
      lighthouse,
      wallClockHour: 12,
    });
    const danger = seaStateForSources({
      areas: [area("WATCH"), area("DANGER")],
      lighthouse,
      wallClockHour: 12,
    });

    expect(danger.source.maxDewsBand).toBe("DANGER");
    expect(danger.swell).toBeGreaterThan(calm.swell);
    expect(danger.wind).toBeGreaterThan(calm.wind);
    expect(danger.tempo).toBeGreaterThan(calm.tempo);
  });

  it("ignores inactive zero-count DEWS bands", () => {
    const state = seaStateForSources({
      areas: [area("DANGER", 0), area("ALERT", 2)],
      lighthouse,
      wallClockHour: 12,
    });

    expect(state.source.maxDewsBand).toBe("ALERT");
  });

  it("includes lighthouse PSI and night factor in the deterministic target", () => {
    const noon = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse: { psiBand: "STEADY", score: 12, unavailable: false },
      wallClockHour: 12,
    });
    const midnightElevatedPsi = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse: { psiBand: "DANGER", score: 88, unavailable: false },
      wallClockHour: 23,
    });

    expect(midnightElevatedPsi.source.nightFactor).toBe(1);
    expect(midnightElevatedPsi.source.psiStress).toBeGreaterThan(noon.source.psiStress);
    expect(midnightElevatedPsi.swell).toBeGreaterThan(noon.swell);
  });

  it("marks reduced motion without randomizing the identifying data values", () => {
    const reduced = seaStateForSources({
      areas: [area("WARNING")],
      lighthouse,
      reducedMotion: true,
      wallClockHour: 12,
    });
    const animated = seaStateForSources({
      areas: [area("WARNING")],
      lighthouse,
      wallClockHour: 12,
    });

    expect(reduced.reducedMotion).toBe(true);
    expect(reduced.swell).toBe(animated.swell);
    expect(reduced.wind).toBe(animated.wind);
    expect(seaStateSummary(reduced)).toContain("reduced-motion holds animation phases flat");
  });

  it("provides a pure 8-second smoothing hook for future stateful consumers", () => {
    const current = seaStateForSources({
      areas: [area("CALM")],
      lighthouse,
      wallClockHour: 12,
    });
    const target = seaStateForSources({
      areas: [area("DANGER")],
      lighthouse,
      wallClockHour: 12,
    });

    const smoothed = smoothSeaState({
      current,
      target,
      deltaSeconds: SEA_STATE_SMOOTHING_TAU_SECONDS,
    });

    expect(smoothed.swell).toBeGreaterThan(current.swell);
    expect(smoothed.swell).toBeLessThan(target.swell);
    expect(smoothed.wind).toBeGreaterThan(current.wind);
    expect(smoothed.wind).toBeLessThan(target.wind);
    expect(smoothSeaState({ current, target, deltaSeconds: 0 })).toBe(current);
  });
});

describe("recent fleet trend summary", () => {
  it("selects top supply growers and shrinkers and labels every figure as 7d supply", () => {
    const summary = recentFleetTrendSummary({
      ships: [
        ship({ symbol: "USDe", change7dPct: 18, riskZone: "alert" }),
        ship({ symbol: "USDT", change7dPct: 7.4, riskZone: "calm" }),
        ship({ symbol: "FRAX", change7dPct: 5.01, riskZone: "warning" }),
        ship({ symbol: "DAI", change7dPct: -12.2, riskZone: "danger" }),
        ship({ symbol: "GHO", change7dPct: -8, riskZone: "watch" }),
        ship({ symbol: "QUIET", change7dPct: 4.9, riskZone: "calm" }),
      ],
    });

    expect(summary.growers.map(recentFleetTrendEntryLabel)).toEqual([
      "USDe supply +18% (7d)",
      "USDT supply +7.4% (7d)",
      "FRAX supply +5% (7d)",
    ]);
    expect(summary.shrinkers.map(recentFleetTrendEntryLabel)).toEqual([
      "DAI supply -12.2% (7d)",
      "GHO supply -8% (7d)",
    ]);
    expect(summary.elevatedShipCount).toBe(3);
    expect(recentFleetTrendSummaryText(summary)).toContain("USDe supply +18% (7d)");
    expect(recentFleetTrendSummaryText(summary)).toContain("3 ships in elevated water");
  });

  it("reports a flat or sparse week without bare percentages", () => {
    const summary = recentFleetTrendSummary({
      ships: [
        ship({ symbol: "USDC", change7dPct: 0, riskZone: "calm" }),
        ship({ symbol: "DAI", change7dPct: null, riskZone: "watch" }),
      ],
    });

    expect(summary.growers).toEqual([]);
    expect(summary.shrinkers).toEqual([]);
    expect(recentFleetTrendSummaryText(summary)).toBe("no notable supply moves this week; 0 ships in elevated water");
  });
});

function ship(input: {
  symbol: string;
  change7dPct: number | null;
  riskZone: ShipNode["riskZone"];
}): ShipNode {
  return {
    id: input.symbol.toLowerCase(),
    detailId: `ship.${input.symbol.toLowerCase()}`,
    symbol: input.symbol,
    change7dPct: input.change7dPct,
    riskZone: input.riskZone,
  } as unknown as ShipNode;
}
