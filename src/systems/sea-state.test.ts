import { describe, expect, it } from "vitest";
import {
  recentFleetTrendEntryLabel,
  recentFleetTrendSummary,
  recentFleetTrendSummaryText,
  seaStateForSources,
  seaStateSummary,
} from "./sea-state";
import type { AreaNode, LighthouseNode, ShipNode } from "./world-types";

const lighthouse = {
  psiBand: "STEADY",
  score: 82,
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

  it("treats a high PSI score as calm water and a collapsing PSI as storm stress", () => {
    const bedrock = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse: { psiBand: "BEDROCK", score: 92, unavailable: false },
      wallClockHour: 12,
    });
    const crisis = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse: { psiBand: "CRISIS", score: 30, unavailable: false },
      wallClockHour: 12,
    });
    const meltdown = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse: { psiBand: "MELTDOWN", score: 4, unavailable: false },
      wallClockHour: 12,
    });

    expect(bedrock.source.psiStress).toBeLessThan(0.2);
    expect(crisis.source.psiStress).toBeGreaterThan(bedrock.source.psiStress);
    expect(meltdown.source.psiStress).toBeGreaterThanOrEqual(0.96);
    expect(crisis.swell).toBeGreaterThan(bedrock.swell);
  });

  it("keeps the session-hour decoration out of the analytic sea-state channel", () => {
    const noon = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse,
      wallClockHour: 12,
    });
    const midnight = seaStateForSources({
      areas: [area("WATCH")],
      lighthouse,
      wallClockHour: 23,
    });

    expect(midnight.source.nightFactor).toBe(1);
    expect(midnight.swell).toBe(noon.swell);
    expect(midnight.wind).toBe(noon.wind);
    expect(midnight.tempo).toBe(noon.tempo);
    expect(seaStateSummary(midnight)).not.toContain("night");
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
