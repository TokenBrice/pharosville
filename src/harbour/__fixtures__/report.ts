import { ApiMetaSchema } from "@shared/types/api-meta";
import { projectedFixtures, upstreamFixtures, TRUTH_NOW, type UpstreamFixtures } from "./projection";
import { buildHarbourModel } from "../model/build";
import type { EndpointKey, HarbourPayloads } from "../model/types";

/** Upstream → production projector → standalone schemas → model; no fields restored after projection. */
export function reportFixture(mutate: (input: UpstreamFixtures) => void = () => {}, nowMs = TRUTH_NOW) {
  const upstream = upstreamFixtures(nowMs);
  const asOf = nowMs / 1000 - 60;
  upstream.stablecoins.peggedAssets = [
    { id: "usdc-circle", symbol: "USDC", name: "USD Coin", pegType: "peggedUSD", chains: ["Ethereum"], chainCirculating: {}, circulating: { peggedUSD: 10e6 }, circulatingPrevDay: { peggedUSD: 8e6 }, circulatingPrevWeek: { peggedUSD: 6e6 } },
    { id: "tether", symbol: "USDT", name: "Tether", pegType: "peggedUSD", chains: ["Ethereum"], chainCirculating: {}, circulating: { peggedUSD: 5e6 }, circulatingPrevDay: { peggedUSD: 7e6 }, circulatingPrevWeek: { peggedUSD: 6e6 } },
  ];
  upstream.stability.history = [
    { date: asOf - 7 * 86400, score: 80, methodologyVersion: "psi-1" },
    { date: asOf - 86400, score: 90, methodologyVersion: "psi-1" },
  ];
  mutate(upstream);
  const projected = projectedFixtures(upstream);
  const payloads = Object.fromEntries((Object.keys(projected) as EndpointKey[]).map((key) => [key, {
    data: projected[key], meta: ApiMetaSchema.parse((projected[key] as { _meta?: unknown })._meta), fetchedAtMs: nowMs,
  }])) as HarbourPayloads;
  return { upstream, payloads, model: buildHarbourModel(payloads, nowMs, { dead: [] }), nowMs };
}
