import type { PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const finite = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
const nullableFinite = (value: unknown): boolean => value === null || finite(value);
const strings = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === "string");
const rows = (value: unknown, check: (row: Record<string, unknown>) => boolean): boolean =>
  Array.isArray(value) && value.every((row) => record(row) && check(row));
const numbers = (value: unknown): boolean => record(value) && Object.values(value).every(finite);
const fields = (value: Record<string, unknown>, keys: string[], check = finite): boolean => keys.every((key) => check(value[key]));

/** Small structural guards for the collections and numbers consumed by world construction.
 * Full semantic/schema audits remain off the production startup path.
 */
export function isRenderableWorldPayload(key: PharosVilleApiEndpointKey, data: unknown): boolean {
  if (!record(data)) return false;
  switch (key) {
    case "stablecoins":
      return rows(data.peggedAssets, (asset) => fields(asset, ["id", "name", "symbol", "pegType"], (v) => typeof v === "string")
        && nullableFinite(asset.price) && numbers(asset.circulating) && strings(asset.chains)
        && ["circulatingPrevDay", "circulatingPrevWeek", "circulatingPrevMonth"].every((k) => asset[k] == null || numbers(asset[k]))
        && record(asset.chainCirculating) && Object.values(asset.chainCirculating).every((chain) => record(chain)
          && finite(chain.current) && ["circulatingPrevDay", "circulatingPrevWeek", "circulatingPrevMonth"].every((k) => chain[k] == null || finite(chain[k]))));
    case "chains":
      return fields(data, ["globalTotalUsd", "updatedAt"])
        && rows(data.chains, (chain) => fields(chain, ["id", "name"], (v) => typeof v === "string")
          && fields(chain, ["totalUsd", "change24hPct", "change7dPct", "change30dPct", "dominanceShare"])
          && nullableFinite(chain.healthScore) && record(chain.healthFactors)
          && Object.values(chain.healthFactors).every(nullableFinite)
          && record(chain.dominantStablecoin) && finite(chain.dominantStablecoin.share)
          && (chain.topStablecoins === undefined || rows(chain.topStablecoins, (coin) => typeof coin.id === "string" && fields(coin, ["share", "supplyUsd"]))));
    case "stability":
      return rows(data.history, (point) => fields(point, ["date", "score"]))
        && (data.current === null || (record(data.current) && fields(data.current, ["score", "computedAt"])
          && typeof data.current.band === "string" && numbers(data.current.components)
          && (data.current.contributors === undefined || rows(data.current.contributors, (coin) => typeof coin.id === "string" && fields(coin, ["bps", "mcapUsd", "ageDays", "factor"])) )));
    case "pegSummary":
      return rows(data.coins, (coin) => typeof coin.id === "string"
        && fields(coin, ["currentDeviationBps", "pegScore"], nullableFinite) && typeof coin.activeDepeg === "boolean")
        && (data.summary === null || (record(data.summary) && fields(data.summary, ["activeDepegCount", "medianDeviationBps", "coinsAtPeg", "totalTracked"])));
    case "stress":
      return finite(data.updatedAt) && record(data.signals) && Object.values(data.signals).every((signal) => record(signal)
        && fields(signal, ["score", "computedAt"]) && typeof signal.band === "string" && record(signal.signals)
        && Object.values(signal.signals).every((detail) => record(detail) && finite(detail.value) && typeof detail.available === "boolean"));
    case "reportCards":
      return finite(data.updatedAt) && rows(data.cards, (card) => typeof card.id === "string"
        && nullableFinite(card.overallScore) && typeof card.overallGrade === "string" && record(card.rawInputs)
        && record(card.dimensions) && ["pegStability", "liquidity", "resilience", "decentralization", "dependencyRisk"].every((key) => {
          const dimension = (card.dimensions as Record<string, unknown>)[key];
          return record(dimension) && nullableFinite(dimension.score);
        })) && record(data.dependencyGraph) && rows(data.dependencyGraph.edges, (edge) =>
        typeof edge.from === "string" && typeof edge.to === "string" && finite(edge.weight));
    case "mintBurn":
      return finite(data.updatedAt) && record(data.gauge) && nullableFinite(data.gauge.score)
        && fields(data.gauge, ["flightIntensity", "trackedCoins", "trackedMcapUsd"])
        && rows(data.coins, (coin) => typeof coin.stablecoinId === "string" && nullableFinite(coin.flowIntensity)
          && fields(coin, ["netFlow24hUsd", "mintVolume24hUsd", "burnVolume24hUsd", "netFlow7dUsd", "netFlow30dUsd", "netFlow90dUsd"]))
        && rows(data.hourly, (hour) => fields(hour, ["hourTs", "netFlowUsd", "mintVolumeUsd", "burnVolumeUsd"]));
  }
}
