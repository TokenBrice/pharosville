import { endpointProjector, type ProjectionJson } from "../../../functions/api/_project";
import { PHAROSVILLE_API_PAYLOAD_SCHEMAS } from "@shared/types/pharosville";
import { PHAROSVILLE_API_ENDPOINT_KEYS } from "@shared/types/pharosville-endpoint-keys";
import type { EndpointKey } from "../model/types";

export const TRUTH_NOW = Date.UTC(2026, 10, 8, 12);
export const TRUTH_COIN_ID = "usdc-circle";
export type UpstreamFixtures = Record<EndpointKey, Record<string, ProjectionJson>>;

/** Small credential-free upstream shapes, shared by proxy, model and DOM proof tests. */
export function upstreamFixtures(nowMs = TRUTH_NOW): UpstreamFixtures {
  const asOf = nowMs / 1000 - 60;
  const _meta = { updatedAt: asOf, ageSeconds: 60, status: "fresh" };
  const hour = Math.floor(asOf / 3600) * 3600;
  return {
    stablecoins: { _meta: { ..._meta }, peggedAssets: [{ id: TRUTH_COIN_ID, name: "USD Coin", symbol: "USDC", pegType: "peggedUSD", circulating: { peggedUSD: 1e9 }, chains: ["Ethereum"], chainCirculating: { Ethereum: { current: 1e9 } }, circulatingPrevWeek: { peggedUSD: 1e9 } }] },
    chains: { _meta: { ..._meta }, chains: [{ id: "ethereum", name: "Ethereum", totalUsd: 1e9, healthScore: 80, change24hPct: 0.001, change7dPct: 0.004, change30dPct: -0.01 }], globalChange24hPct: 0.001, globalChange7dPct: 0.004, globalChange30dPct: -0.01 },
    stability: { _meta: { ..._meta }, methodology: { version: "psi-1" }, current: { score: 91, band: "BEDROCK", avg24h: 90, computedAt: asOf, methodologyVersion: "psi-1", components: { severity: 1, breadth: 1, stressBreadth: 1, trend: 0 }, inputDegradation: { dewsUnavailable: false, depegEventsUnavailable: false, dewsFailureReason: "not projected" } }, history: [{ date: asOf, score: 91, methodologyVersion: "psi-1" }] },
    pegSummary: { _meta: { ..._meta }, methodology: { version: "peg-1", asOf }, coins: [{ id: TRUTH_COIN_ID, currentDeviationBps: 0, activeDepeg: false, pegScore: 100, methodologyVersion: "peg-1", pegReference: { valueUsd: 1, source: "median", contributorCount: 3 } }] },
    stress: { _meta: { ..._meta }, updatedAt: asOf, methodology: { version: "stress-1" }, signals: { [TRUTH_COIN_ID]: { score: 10, band: "CALM", methodologyVersion: "unused-row-version" } } },
    safetyGrades: { _meta: { ..._meta }, updatedAt: asOf, methodologyVersion: "grade-1", grades: [{ id: TRUTH_COIN_ID, grade: "A" }] },
    mintBurn: { _meta: { ..._meta }, hourly: Array.from({ length: 24 }, (_, i) => ({ hourTs: hour - (24 - i) * 3600, netFlowUsd: 0, mintVolumeUsd: 1e6, burnVolumeUsd: 1e6, valuation: "complete" })), scope: { chainIds: ["ethereum"] }, coins: [{ stablecoinId: TRUTH_COIN_ID, mintVolume24hUsd: 24e6, burnVolume24hUsd: 24e6, netFlow24hUsd: 0, netFlow7dUsd: 0, coverage: { status: "full", has24hWindow: true, historyStartAt: asOf - 30 * 86400, isPartial: false }, valuation: { window24h: { completeness: "complete", mintCompleteness: "complete", burnCompleteness: "complete" }, netFlow7d: "complete" } }] },
  };
}

/** Validates projector output without reinserting any stripped fields. */
export function projectedFixtures(input = upstreamFixtures()): Record<EndpointKey, unknown> {
  return Object.fromEntries(PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => {
    const projected = endpointProjector(key)(input[key]);
    return [key, PHAROSVILLE_API_PAYLOAD_SCHEMAS[key].parse(projected)];
  })) as Record<EndpointKey, unknown>;
}
