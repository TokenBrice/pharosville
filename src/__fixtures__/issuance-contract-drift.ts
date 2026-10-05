import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";

/** Synthetic reproduction of the 2026-10-05 v6.23 wire drift; no live records. */
export const issuanceContractDrift: MintBurnFlowsResponse = {
  gauge: {
    score: null, band: null, flightToQuality: null, flightIntensity: null,
    classificationSource: "safety-score-v9-publication", trackedCoins: 1, trackedMcapUsd: 1_000,
  },
  coins: [{
    stablecoinId: "synthetic-issuance", symbol: "SYN", netFlowDirection24h: null,
    netFlow24hUsd: null, mintVolume24hUsd: 2, burnVolume24hUsd: 1,
    mintCount24h: 1, burnCount24h: 2,
    netFlow7dUsd: null, netFlow30dUsd: null, netFlow90dUsd: null, largestEvent24h: null,
    coverage: {
      startBlock: 0, lastSyncedBlock: 1, lagBlocks: null, historyStartAt: null,
      has24hWindow: true, has30dWindow: false, has90dWindow: false,
      isPartial: false, status: "unknown",
    },
    valuation: {
      window24h: {
        completeness: "partial", mintCompleteness: "complete", burnCompleteness: "partial",
        unpricedMintEventCount: 0, unpricedBurnEventCount: 1,
      },
      baseline: "unknown", netFlow7d: "partial", netFlow30d: "partial", netFlow90d: "partial",
    },
  }],
  hourly: [{ hourTs: 1_700_000_000, netFlowUsd: null, mintVolumeUsd: 2, burnVolumeUsd: 1, valuation: "partial" }],
  updatedAt: 1_700_000_000, windowHours: 24,
  scope: { chainIds: ["ethereum"], label: "Synthetic configured issuance chain" },
};
