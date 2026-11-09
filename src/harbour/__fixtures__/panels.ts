import { DepegEventsResponseSchema, DexLiquidityMapSchema } from "@shared/types/market";
import { StablecoinReservesResponseSchema } from "@shared/types/live-reserves";
import { RUNTIME_ACTIVE_IDS } from "@shared/lib/stablecoins/runtime-registry";
import type { ProjectionJson } from "../../../functions/api/_project";
import type { PanelEndpointKey } from "@shared/lib/pharosville-panel-endpoints";

export const PANEL_NOW = Date.UTC(2026, 10, 9, 12);
export const PANEL_COIN_ID = "usdc-circle";

/** Credential-free upstream fixtures, parsed before they reach the standalone projector. */
export function panelUpstreamFixtures(nowMs = PANEL_NOW): Record<PanelEndpointKey, Record<string, ProjectionJson>> {
  const asOf = Math.floor(nowMs / 1000) - 60;
  const depegEvents = DepegEventsResponseSchema.parse({
    events: Array.from({ length: 30 }, (_, i) => ({
      id: i, stablecoinId: PANEL_COIN_ID, symbol: "USDC", pegType: "peggedUSD", direction: i % 2 ? "above" : "below",
      peakDeviationBps: 100 + i * 13.7, startedAt: asOf - i * 321_678, endedAt: i === 0 ? null : asOf - i * 321_678 + 3600,
      startPrice: 0.99, peakPrice: 0.98, recoveryPrice: i === 0 ? null : 1, pegReference: 1, source: i < 4 ? "live" : "backfill",
    })), total: 45,
    methodology: { version: "depeg-v1", versionLabel: "Depeg v1", currentVersion: "depeg-v1", currentVersionLabel: "Depeg v1", changelogPath: "/methodology/depegs", asOf, isCurrent: true },
  });
  const stablecoinReserves = StablecoinReservesResponseSchema.parse({
    stablecoinId: PANEL_COIN_ID, mode: "live", estimated: false, liveAt: asOf,
    reserves: [{ name: "Short-dated US Treasuries", pct: 83.2, risk: "very-low" }, { name: "Cash at banks", pct: 16.8, risk: "low" }],
    provenance: { evidenceClass: "independent", sourceModel: "dynamic-mix", freshnessMode: "verified", scoringEligible: true },
    sync: { enabled: true, status: "ok", stale: false, bootstrap: false, lastSuccessAt: asOf },
    displayUrl: "https://www.circle.com/transparency", evidenceUrls: ["https://www.circle.com/transparency"], metadata: { sourceTimestamp: asOf },
  });
  const dexLiquidity = DexLiquidityMapSchema.parse(Object.fromEntries([...RUNTIME_ACTIVE_IDS].map((id, i) => [id, {
    totalTvlUsd: 100_000 + i * 41_239.73, effectiveTvlUsd: 80_000 + i * 31_521.23,
    totalVolume24hUsd: 500_000, totalVolume7dUsd: 3_000_000, poolCount: 12, pairCount: 6, chainCount: 3,
    protocolTvl: { uniswap: 100_000 }, chainTvl: { ethereum: 100_000 }, topPools: [],
    liquidityScore: i % 4 === 0 ? null : (i * 13.3) % 100, concentrationHhi: 0.2, depthStability: 0.9, tvlChange24h: null, tvlChange7d: null,
    updatedAt: asOf - i * 7, dexPriceUsd: null, dexDeviationBps: null, priceSourceCount: null, priceSourceTvl: null, priceSources: null,
    avgPoolStress: null, weightedBalanceRatio: null, organicFraction: null, durabilityScore: null,
    coverageClass: i % 4 === 0 ? "unobserved" : "primary", coverageConfidence: (i % 101) / 100,
    liquidityEvidenceClass: (["unobserved", "partial_measured", "measured", "observed_unmeasured"] as const)[i % 4], hasMeasuredLiquidityEvidence: i % 4 === 1 || i % 4 === 2,
    trendworthy: false, sourceMix: {}, balanceMeasuredTvlUsd: 0, organicMeasuredTvlUsd: 0, scoreComponents: null,
    lockedLiquidityPct: null, methodologyVersion: "liquidity-v3",
  }])));
  const _meta = { updatedAt: asOf, ageSeconds: 60, status: "fresh" };
  return JSON.parse(JSON.stringify({ depegEvents: { ...depegEvents, _meta }, stablecoinReserves: { ...stablecoinReserves, _meta }, dexLiquidity: { ...dexLiquidity, _meta } })) as Record<PanelEndpointKey, Record<string, ProjectionJson>>;
}
