import { describe, expect, it } from "vitest";
import { compactCurrency, composeCurrently, formatChangePercent, formatCompactUsd } from "./format-detail";

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
