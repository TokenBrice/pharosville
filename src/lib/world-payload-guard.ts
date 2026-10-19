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
const nonnegative = (value: unknown): boolean => finite(value) && (value as number) >= 0;
const count = (value: unknown): boolean => nonnegative(value) && Number.isInteger(value);

/** Small structural guards for the collections and numbers consumed by world construction.
 * Full semantic/schema audits remain off the production startup path.
 */
export function isRenderableWorldPayload(key: PharosVilleApiEndpointKey, data: unknown): boolean {
  if (!record(data)) return false;
  switch (key) {
    case "stablecoins":
      return rows(data.peggedAssets, (asset) => fields(asset, ["id", "name", "symbol", "pegType"], (v) => typeof v === "string")
        && record(asset.circulating) && Object.values(asset.circulating).every(nullableFinite) && strings(asset.chains)
        && ["circulatingPrevDay", "circulatingPrevWeek", "circulatingPrevMonth"].every((k) => asset[k] == null || numbers(asset[k]))
        && record(asset.chainCirculating) && Object.values(asset.chainCirculating).every((chain) => chain === null || (record(chain) && nullableFinite(chain.current))));
    case "chains":
      return finite(data.globalChange7dPct)
        && rows(data.chains, (chain) => fields(chain, ["id", "name"], (v) => typeof v === "string")
          && finite(chain.totalUsd) && nullableFinite(chain.healthScore)
          && fields(chain, ["change24hPct", "change7dPct", "change30dPct"], nullableFinite));
    case "stability":
      return rows(data.history, (point) => fields(point, ["date", "score"]))
        && (data.current === null || (record(data.current) && finite(data.current.score)
          && typeof data.current.band === "string" && numbers(data.current.components)
          && (data.current.avg24h === undefined || finite(data.current.avg24h))));
    case "pegSummary":
      return rows(data.coins, (coin) => typeof coin.id === "string"
        && fields(coin, ["currentDeviationBps", "pegScore"], nullableFinite) && typeof coin.activeDepeg === "boolean"
        && (coin.pegReference == null || (record(coin.pegReference) && nullableFinite(coin.pegReference.valueUsd))));
    case "stress":
      return record(data.signals) && Object.values(data.signals).every((signal) => signal === null || (record(signal)
        && finite(signal.score) && typeof signal.band === "string"));
    case "safetyGrades":
      return rows(data.grades, (grade) => typeof grade.id === "string" && typeof grade.grade === "string");
    case "mintBurn":
      return (data.scope === undefined || (record(data.scope) && strings(data.scope.chainIds)))
        && rows(data.coins, (coin) => typeof coin.stablecoinId === "string"
          && fields(coin, ["netFlow24hUsd", "netFlow7dUsd"], nullableFinite)
          && fields(coin, ["mintVolume24hUsd", "burnVolume24hUsd"], nonnegative)
          && (coin.coverage === undefined || (record(coin.coverage) && typeof coin.coverage.status === "string")))
        && rows(data.hourly, (hour) => count(hour.hourTs) && nullableFinite(hour.netFlowUsd)
          && fields(hour, ["mintVolumeUsd", "burnVolumeUsd"], nonnegative));
  }
}
