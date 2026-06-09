import { describe, expect, it } from "vitest";
import { buildDetailFactSections, compactCurrency, composeCurrently, formatChangePercent, formatCompactUsd } from "./format-detail";

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
});

// P3 metaphor quick-wins: the gated signals must FOLD into existing rows so
// the panel's <= 8 fact-row density contract holds for the worst-case ship.
describe("buildDetailFactSections folds", () => {
  it("folds Bluechip audit into the Class row", () => {
    const { identity } = buildDetailFactSections([
      { label: "Ship class", value: "CeFi" },
      { label: "Size tier", value: "Titan class" },
      { label: "Bluechip audit", value: "Bluechip A" },
    ]);
    expect(identity).toEqual([
      { key: "class", label: "Class", value: "Titan class · CeFi · Bluechip A" },
    ]);
  });

  it("folds price confidence and source consensus into the Market cap row", () => {
    const { identity } = buildDetailFactSections([
      { label: "Market cap", value: "$1,000,000,000" },
      { label: "Price confidence", value: "Low-confidence price feed" },
      { label: "Source consensus", value: "2 of 3 price sources agree" },
    ]);
    expect(identity).toEqual([
      {
        key: "marketCap",
        label: "Market cap",
        value: "$1.0B · Low-confidence price feed · 2 of 3 price sources agree",
      },
    ]);
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
});
