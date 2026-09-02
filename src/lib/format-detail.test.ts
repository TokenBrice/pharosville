import { describe, expect, it } from "vitest";
import {
  buildDetailFactSections,
  buildDetailReadingLine,
  classifyDetailFactLabel,
  compactCurrency,
  composeCurrently,
  formatChangePercent,
  formatCompactUsd,
} from "./format-detail";

describe("compactCurrency", () => {
  it("compacts billions", () => {
    expect(compactCurrency("$8,438,840,589")).toBe("$8.4B");
  });
  it("compacts trillions", () => {
    expect(compactCurrency("$1,234,567,890,123")).toBe("$1.2T");
  });
  it("compacts millions", () => {
    expect(compactCurrency("$2,088,054")).toBe("$2.1M");
  });
  it("preserves small amounts under 1M", () => {
    expect(compactCurrency("$12,345")).toBe("$12,345");
  });
  it("returns input verbatim when not parseable", () => {
    expect(compactCurrency("n/a")).toBe("n/a");
  });
  it("handles input that's already compact", () => {
    expect(compactCurrency("$8.4B")).toBe("$8.4B");
  });
});

describe("formatCompactUsd", () => {
  it("formats numeric USD values with compact notation", () => {
    expect(formatCompactUsd(8_438_840_589)).toBe("$8.4B");
  });

  it("returns unavailable for absent numeric values", () => {
    expect(formatCompactUsd(null)).toBe("unavailable");
    expect(formatCompactUsd(Number.NaN)).toBe("unavailable");
  });
});

describe("formatChangePercent", () => {
  it("formats signed percentage changes", () => {
    expect(formatChangePercent(5.43)).toBe("+5.4%");
    expect(formatChangePercent(-3.21)).toBe("-3.2%");
  });

  it("returns unavailable for absent percentage changes", () => {
    expect(formatChangePercent(null)).toBe("unavailable");
  });
});

describe("composeCurrently", () => {
  it("composes area + idle suffix when zone reads as calm", () => {
    expect(composeCurrently({
      position: "Calm Anchorage idle",
      area: "Calm Anchorage",
      zone: "calm",
    })).toBe("Calm Anchorage (idle)");
  });
  it("uses position verbatim when zone is non-calm", () => {
    expect(composeCurrently({
      position: "Razormane Watch — boarding",
      area: "Razormane Watch",
      zone: "razormane",
    })).toBe("Razormane Watch — boarding");
  });
  it("falls back to the area when only area is provided", () => {
    expect(composeCurrently({ area: "Ledger Mooring" })).toBe("Ledger Mooring");
  });
  it("falls back to position when only position is provided", () => {
    expect(composeCurrently({ position: "Ledger Mooring idle" })).toBe("Ledger Mooring idle");
  });
  it("returns empty string when nothing is provided", () => {
    expect(composeCurrently({})).toBe("");
  });
  it("appends stress driver context to the current position", () => {
    expect(composeCurrently({
      position: "Warning Shoals idle",
      area: "Warning Shoals",
      zone: "warning",
      stressDriver: "Driven by: peg deviation",
    })).toBe("Warning Shoals idle · Driven by: peg deviation");
  });
});

// P3 metaphor quick-wins: the gated signals must FOLD into existing rows so
// the panel's <= 8 fact-row density contract holds for the worst-case ship.
describe("buildDetailFactSections folds", () => {
  it("renders named-water facts in the area detail record", () => {
    const { identity } = buildDetailFactSections([
      { label: "Water style", value: "protected tidal inlet and wreck shoal" },
      { label: "Atmosphere", value: "still wreck water" },
      { label: "Source fields", value: "cemeteryEntries[], world-layout wreck-water field" },
    ]);

    expect(identity).toEqual([
      { key: "waterStyle", label: "Water style", value: "protected tidal inlet and wreck shoal" },
      { key: "atmosphere", label: "Atmosphere", value: "still wreck water" },
      { key: "sourceFields", label: "Source fields", value: "cemeteryEntries[], world-layout wreck-water field" },
    ]);
  });
  it("folds Bluechip audit into the Class row", () => {
    const { identity } = buildDetailFactSections([
      { label: "Ship class", value: "CeFi" },
      { label: "Size tier", value: "Titan class" },
      { label: "Bluechip audit", value: "Bluechip A" },
      { label: "Safety grade", value: "Safety B+ (score 78)" },
    ]);
    expect(identity).toEqual([
      { key: "class", label: "Class", value: "Titan class · CeFi · Bluechip A · Safety B+ (score 78)" },
    ]);
  });

  it("folds fleet context, price confidence, and source consensus into the Market cap row", () => {
    const { identity } = buildDetailFactSections([
      { label: "Market cap", value: "$1,000,000,000" },
      { label: "Fleet rank", value: "#3 of 198" },
      { label: "Share of fleet", value: "2.4% of fleet" },
      { label: "Price confidence", value: "Low-confidence price feed" },
      { label: "Source consensus", value: "2 of 3 price sources agree" },
    ]);
    expect(identity).toEqual([
      {
        key: "marketCap",
        label: "Market cap",
        value: "$1.0B · #3 of 198 · 2.4% of fleet · Low-confidence price feed · 2 of 3 price sources agree",
      },
    ]);
  });

  it("renders PSI trend and composition rows for lighthouse details", () => {
    const { identity } = buildDetailFactSections([
      { label: "Trend", value: "Observed 24h drift steady" },
      { label: "Composition", value: "severity 40%, breadth 20%" },
    ]);

    expect(identity).toEqual([
      { key: "psiTrend", label: "Trend", value: "Observed 24h drift steady" },
      { key: "psiComposition", label: "Composition", value: "severity 40%, breadth 20%" },
    ]);
  });

  it("renders Route cadence as an explicit ship detail row", () => {
    const { identity } = buildDetailFactSections([
      { label: "Route cadence", value: "90–180 s legs; 240–480 s rests; routes show presence only" },
    ]);
    expect(identity).toEqual([{
      key: "routeCadence",
      label: "Route cadence",
      value: "90–180 s legs; 240–480 s rests; routes show presence only",
    }]);
  });

  it("folds the depeg record into the 24h row instead of spending its own row", () => {
    const { identity } = buildDetailFactSections([
      { label: "24h supply change", value: "+5.4%" },
      { label: "Supply momentum", value: "7d +2.4%, 30d -5.1%" },
      { label: "Depeg history", value: "3 events on record; worst -8.2%; last 2026-05-30" },
    ]);
    expect(identity).toEqual([
      {
        key: "cycle24h",
        label: "24h change",
        value: "+5.4% · 7d +2.4%, 30d -5.1% · depeg history: 3 events on record; worst -8.2%; last 2026-05-30",
      },
    ]);
  });

  it("leaves the host rows unchanged when no gated signal is present", () => {
    const { identity } = buildDetailFactSections([
      { label: "Ship class", value: "CeFi" },
      { label: "Size tier", value: "Major" },
      { label: "Market cap", value: "$1,000,000,000" },
      { label: "24h supply change", value: "+5.4%" },
    ]);
    expect(identity).toEqual([
      { key: "class", label: "Class", value: "Major · CeFi" },
      { key: "marketCap", label: "Market cap", value: "$1.0B" },
      { key: "cycle24h", label: "24h change", value: "+5.4%" },
    ]);
  });

  it("renders a Backing diversity identity row for dock facts", () => {
    const { identity } = buildDetailFactSections([
      { label: "Backing diversity", value: "70% diversified" },
    ]);
    expect(identity).toEqual([
      { key: "backingDiversity", label: "Backing diversity", value: "70% diversified" },
    ]);
  });

  // The cargo-tide crates' DOM parity. An unregistered label is dropped from
  // the panel with every test still green, so this asserts the REGISTRATION —
  // without it the world would show a direction on canvas that the panel never
  // states, which is precisely the failure the cue contract exists to prevent.
  it("renders a Net flow 24h identity row for dock facts", () => {
    const { identity } = buildDetailFactSections([
      { label: "Net flow 24h", value: "+$8.0M minting — mint $10.0M, burn $2.0M" },
    ]);
    expect(identity).toEqual([
      { key: "netFlow24h", label: "Net flow 24h", value: "+$8.0M minting — mint $10.0M, burn $2.0M" },
    ]);
  });

  // Task 14 DOM parity. Same silent-drop trap as Net flow 24h: an unregistered
  // label vanishes from the panel with every test still green, which would leave
  // the tide band on the stonework saying something the panel never states.
  it("renders a Supply tide 7d identity row for lighthouse facts", () => {
    const { identity } = buildDetailFactSections([
      { label: "Supply tide 7d", value: "-0.92% falling — supply shrank this week" },
    ]);
    expect(identity).toEqual([
      { key: "supplyTide", label: "Supply tide 7d", value: "-0.92% falling — supply shrank this week" },
    ]);
  });

  it("classifies the Supply tide 7d label however it is cased or spaced", () => {
    expect(classifyDetailFactLabel("  SUPPLY   TIDE 7D ")).toBe("supplyTide");
  });

  it("classifies the Net flow 24h label however it is cased or spaced", () => {
    expect(classifyDetailFactLabel("  NET   FLOW 24H ")).toBe("netFlow24h");
  });

  // An unregistered fact label is dropped silently, so the lighthouse panel
  // would lose the signal mast's DOM parity with every test still green. This
  // asserts the registration, not the wording.
  it("renders the signal mast and fleet peg rows for lighthouse facts", () => {
    const { identity } = buildDetailFactSections([
      { label: "Signal mast", value: "3 pennants for 3 coins off peg" },
      { label: "Fleet peg", value: "Worst XUSD -6.2%; 211 of 214 at peg" },
    ]);
    expect(identity).toEqual([
      { key: "signalMast", label: "Signal mast", value: "3 pennants for 3 coins off peg" },
      { key: "fleetPeg", label: "Fleet peg", value: "Worst XUSD -6.2%; 211 of 214 at peg" },
    ]);
  });

  it("folds stress driver into the Currently row instead of spending its own row", () => {
    const { position } = buildDetailFactSections([
      { label: "Representative position", value: "Danger Strait idle" },
      { label: "Risk water area", value: "Danger Strait" },
      { label: "Risk water zone", value: "danger" },
      { label: "Stress driver", value: "Driven by: peg deviation; contagion amplifier active" },
    ]);

    expect(position).toEqual([
      {
        key: "currently",
        label: "Currently",
        value: "Danger Strait idle · Driven by: peg deviation; contagion amplifier active",
      },
    ]);
  });
});

describe("buildDetailReadingLine", () => {
  const shipFacts = [
    { label: "Peg deviation", value: "-1 bps vs GOLD — below peg; hull rides low" },
    { label: "Market cap", value: "$2,547,000,000" },
    { label: "Fleet rank", value: "#12 of 187" },
    { label: "Share of fleet", value: "0.8% of fleet" },
    { label: "24h supply change", value: "-14.0%" },
    { label: "Cycle tempo", value: "Active" },
  ];

  it("quotes at most three ship figures in a fixed order", () => {
    expect(buildDetailReadingLine("ship", shipFacts)).toBe("$2.5B · #12 of 187 · -14.0% 24h");
  });

  it("falls through to later figures when an earlier one is missing", () => {
    const withoutRank = shipFacts.filter((fact) => fact.label !== "Fleet rank");
    expect(buildDetailReadingLine("ship", withoutRank))
      .toBe("$2.5B · -14.0% 24h · -1 bps vs GOLD");
  });

  it("skips placeholder values rather than quoting them", () => {
    expect(buildDetailReadingLine("ship", [
      { label: "Market cap", value: "Unavailable" },
      { label: "24h supply change", value: "\u2014" },
      { label: "Cycle tempo", value: "Resting" },
    ])).toBe("Resting");
  });

  it("reads docks by supply, count and health", () => {
    expect(buildDetailReadingLine("dock", [
      { label: "Stablecoin supply", value: "$74,000,000,000" },
      { label: "Harbor rank", value: "#1 of 8 rendered harbors" },
      { label: "Stablecoin count", value: "12" },
      { label: "Health", value: "robust" },
    ])).toBe("$74.0B · 12 stablecoins · robust health");
  });

  it("omits the line entirely when the lighthouse has no figure to quote", () => {
    expect(buildDetailReadingLine("lighthouse", [
      { label: "Score", value: "Unavailable" },
      { label: "Band", value: "Unavailable" },
      { label: "Last fleet depeg", value: "None on record" },
    ])).toBeNull();
  });

  it("has no reading line for kinds that carry no figures", () => {
    expect(buildDetailReadingLine("pigeonnier", [{ label: "Channel", value: "PharosWatch" }]))
      .toBeNull();
  });
});

// The registration trap: an unregistered fact label is SILENTLY dropped from
// the panel and every test stays green. These three labels are new, so they get
// an explicit guard rather than trusting the rows above to notice.
describe("buildDetailFactSections round-two metaphor rows", () => {
  it("renders the lighthouse beam bearing and high-water mark as their own rows", () => {
    const { identity } = buildDetailFactSections([
      { label: "Beam bearing", value: "Holding on USDX, largest PSI contributor (-412 bps)" },
      { label: "Worst band, 30d", value: "FRACTURE at PSI 31 on 2026-07-20; 9 days on record" },
    ]);

    expect(identity).toEqual([
      { key: "beamBearing", label: "Beam bearing", value: "Holding on USDX, largest PSI contributor (-412 bps)" },
      { key: "highWaterMark", label: "Worst band, 30d", value: "FRACTURE at PSI 31 on 2026-07-20; 9 days on record" },
    ]);
  });

  it("keeps the DEX cross-check beside the market-cap figure it qualifies", () => {
    const { identity } = buildDetailFactSections([
      { label: "Market cap", value: "$1,000,000,000" },
      { label: "Price confidence", value: "Low-confidence price feed" },
      { label: "DEX cross-check", value: "Bearings cross — the two readings disagree; DEX $0.9912 (-88 bps)" },
    ]);

    // Next to the figure, not folded into it: a crossed bearing is a caveat on
    // the peg reading and it must not disappear into a run-on qualifier list.
    expect(identity.map((row) => row.key)).toEqual(["marketCap", "dexCrossCheck"]);
    expect(identity[0]!.value).not.toContain("Bearings cross");
  });

  it("classifies every new label instead of dropping it", () => {
    expect(classifyDetailFactLabel("Beam bearing")).toBe("beamBearing");
    expect(classifyDetailFactLabel("Worst band, 30d")).toBe("highWaterMark");
    expect(classifyDetailFactLabel("DEX cross-check")).toBe("dexCrossCheck");
  });
});
