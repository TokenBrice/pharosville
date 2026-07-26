import { describe, expect, it } from "vitest";
import {
  buildQuickFindCandidates,
  matchQuickFindCandidates,
  type QuickFindCandidate,
} from "./quick-find-match";
import type { PharosVilleWorld } from "./world-types";

function candidate(overrides: Partial<QuickFindCandidate> & { label: string }): QuickFindCandidate {
  return {
    detailId: `detail.${overrides.label.toLowerCase()}`,
    kindLabel: "Ship",
    symbol: null,
    weight: 0,
    ...overrides,
  };
}

const FLEET: readonly QuickFindCandidate[] = [
  candidate({ label: "USD Coin", symbol: "USDC", weight: 60_000 }),
  candidate({ label: "Tether USD", symbol: "USDT", weight: 120_000 }),
  candidate({ label: "Dai", symbol: "DAI", weight: 5_000 }),
  candidate({ label: "Ethereum", kindLabel: "Harbor", weight: 900_000 }),
  candidate({ label: "First Digital USD", symbol: "FDUSD", weight: 1_000 }),
  candidate({ label: "USDX Bond", symbol: "XBOND", weight: 50 }),
];

describe("matchQuickFindCandidates", () => {
  it("returns nothing for an empty or whitespace query", () => {
    expect(matchQuickFindCandidates(FLEET, "")).toEqual([]);
    expect(matchQuickFindCandidates(FLEET, "   ")).toEqual([]);
  });

  it("matches symbol and display name case-insensitively", () => {
    expect(matchQuickFindCandidates(FLEET, "dai").map((entry) => entry.label)).toEqual(["Dai"]);
    expect(matchQuickFindCandidates(FLEET, "ETHEREUM").map((entry) => entry.label)).toEqual(["Ethereum"]);
  });

  it("ranks symbol prefixes above name prefixes above substrings", () => {
    expect(matchQuickFindCandidates(FLEET, "usd").map((entry) => entry.label)).toEqual([
      // Symbol prefixes lead, heaviest first.
      "Tether USD",
      "USD Coin",
      // Then the name prefix, then the symbol substring.
      "USDX Bond",
      "First Digital USD",
    ]);
  });

  it("orders equal-rank matches by weight, then alphabetically", () => {
    const ties = [
      candidate({ label: "Alpha USD", symbol: "AUSD", weight: 10 }),
      candidate({ label: "Beta USD", symbol: "BUSD", weight: 10 }),
      candidate({ label: "Gamma USD", symbol: "GUSD", weight: 99 }),
    ];
    expect(matchQuickFindCandidates(ties, "usd").map((entry) => entry.label)).toEqual([
      "Gamma USD",
      "Alpha USD",
      "Beta USD",
    ]);
  });

  it("caps the result list at the requested limit", () => {
    expect(matchQuickFindCandidates(FLEET, "usd", 2)).toHaveLength(2);
  });
});

describe("buildQuickFindCandidates", () => {
  it("carries symbols for ships, weights for ships and harbors, and reader-facing kinds", () => {
    const world = {
      entityById: {
        "ship.usdc": {
          detailId: "ship.usdc",
          kind: "ship",
          label: "USD Coin",
          marketCapUsd: 60_000,
          symbol: "USDC",
        },
        "dock.ethereum": {
          detailId: "dock.ethereum",
          kind: "dock",
          label: "Ethereum",
          totalUsd: 900_000,
        },
        "landmark.lighthouse": {
          detailId: "landmark.lighthouse",
          kind: "lighthouse",
          label: "Pharos Lighthouse",
        },
      },
    } as unknown as PharosVilleWorld;

    expect(buildQuickFindCandidates(world)).toEqual([
      { detailId: "ship.usdc", kindLabel: "Ship", label: "USD Coin", symbol: "USDC", weight: 60_000 },
      { detailId: "dock.ethereum", kindLabel: "Harbor", label: "Ethereum", symbol: null, weight: 900_000 },
      { detailId: "landmark.lighthouse", kindLabel: "Landmark", label: "Pharos Lighthouse", symbol: null, weight: 0 },
    ]);
  });

  it("treats a missing market cap as zero weight rather than NaN", () => {
    const world = {
      entityById: {
        "ship.mystery": { detailId: "ship.mystery", kind: "ship", label: "Mystery", symbol: "MYS" },
      },
    } as unknown as PharosVilleWorld;

    expect(buildQuickFindCandidates(world)[0]?.weight).toBe(0);
  });
});
