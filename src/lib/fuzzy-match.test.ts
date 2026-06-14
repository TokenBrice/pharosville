import { describe, expect, it } from "vitest";
import { filterFuzzyMatches, scoreFuzzyMatch } from "./fuzzy-match";

describe("scoreFuzzyMatch", () => {
  it("scores exact matches above prefixes and subsequences", () => {
    const exact = scoreFuzzyMatch("usdc", "USDC");
    const prefix = scoreFuzzyMatch("usdc", "USDC Treasury");
    const subsequence = scoreFuzzyMatch("usdc", "USD Coin");

    expect(exact).not.toBeNull();
    expect(prefix).not.toBeNull();
    expect(subsequence).not.toBeNull();
    expect(exact as number).toBeGreaterThan(prefix as number);
    expect(prefix as number).toBeGreaterThan(subsequence as number);
  });

  it("boosts word-prefix matches above loose subsequences", () => {
    const wordPrefix = scoreFuzzyMatch("mo", "Ledger Mooring");
    const looseSubsequence = scoreFuzzyMatch("mo", "Demo Token");

    expect(wordPrefix).not.toBeNull();
    expect(looseSubsequence).not.toBeNull();
    expect(wordPrefix as number).toBeGreaterThan(looseSubsequence as number);
  });

  it("matches subsequences", () => {
    expect(scoreFuzzyMatch("lgr", "Ledger Mooring")).not.toBeNull();
  });

  it("returns null when the query is not a subsequence", () => {
    expect(scoreFuzzyMatch("zzz", "Ledger Mooring")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(scoreFuzzyMatch("usdc", "USDC")).toBe(scoreFuzzyMatch("USDC", "usdc"));
  });
});

describe("filterFuzzyMatches", () => {
  it("filters and ranks jump-palette items by label, symbol, kind, and keywords", () => {
    const results = filterFuzzyMatches([
      { label: "USD Coin", symbol: "USDC", kind: "ship" },
      { label: "Stability Lighthouse", kind: "landmark", keywords: ["psi beacon"] },
      { label: "Bridge District", kind: "district", keywords: ["treasury", "mooring"] },
      { label: "Risk Cemetery", kind: "landmark" },
    ], "psi");

    expect(results.map((result) => result.item.label)).toEqual(["Stability Lighthouse"]);
    expect(results[0]?.matchedField).toBe("keyword");
    expect(results[0]?.matchedText).toBe("psi beacon");
  });

  it("uses symbol matches for stablecoin tickers", () => {
    const results = filterFuzzyMatches([
      { label: "USD Coin", symbol: "USDC" },
      { label: "Tether", symbol: "USDT" },
    ], "usdt");

    expect(results.map((result) => result.item.label)).toEqual(["Tether"]);
    expect(results[0]?.matchedField).toBe("symbol");
  });

  it("uses kind matches for category-style queries", () => {
    const results = filterFuzzyMatches([
      { label: "Bridge District", kind: "district" },
      { label: "Stability Lighthouse", kind: "landmark" },
    ], "landmark");

    expect(results.map((result) => result.item.label)).toEqual(["Stability Lighthouse"]);
    expect(results[0]?.matchedField).toBe("kind");
  });

  it("keeps original order for equal scores by default", () => {
    const results = filterFuzzyMatches([
      { label: "Gamma", keywords: ["stable"] },
      { label: "Alpha", keywords: ["stable"] },
      { label: "Beta", keywords: ["stable"] },
    ], "stable");

    expect(results.map((result) => result.item.label)).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  it("can use label sorting as the stable tie-break", () => {
    const results = filterFuzzyMatches([
      { label: "Gamma", keywords: ["stable"] },
      { label: "Alpha", keywords: ["stable"] },
      { label: "Beta", keywords: ["stable"] },
    ], "stable", { tieBreaker: "label" });

    expect(results.map((result) => result.item.label)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("returns no results when no field matches", () => {
    const results = filterFuzzyMatches([
      { label: "USD Coin", symbol: "USDC", keywords: ["blue chip"] },
      { label: "Tether", symbol: "USDT", keywords: ["liquidity"] },
    ], "cemetery");

    expect(results).toEqual([]);
  });
});
