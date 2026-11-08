import { datedObservations, validObservationDate } from "../../shared/lib/dated-observations";
import { RUNTIME_ACTIVE_IDS } from "../../shared/lib/stablecoins/runtime-registry";
import type { PharosVilleApiEndpointKey } from "../../shared/types/pharosville-endpoint-keys";

/** JSON.parse has already checked the wire format, not an upstream schema. */
export type ProjectionJson = null | boolean | number | string | ProjectionJson[] | { [key: string]: ProjectionJson };
type JsonObject = { [key: string]: ProjectionJson };

/**
 * Full world AND on-demand panel contract, not upstream analytical extras.
 * Copy metadata intact; never turn missing/null readings into healthy defaults.
 */
function pick(value: ProjectionJson, fields: readonly string[]): ProjectionJson {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(value, field)).map((field) => [field, value[field]]));
}

function dictionary(value: ProjectionJson, fields: readonly string[]): ProjectionJson {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, pick(row, fields)]));
}

function projectStablecoins(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.peggedAssets)) return payload;
  return {
    ...pick(payload, ["_meta"]) as JsonObject,
    peggedAssets: payload.peggedAssets.map((row) => {
      if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
      const coin = pick(row, ["id", "name", "symbol", "pegType", "chains", "circulating", "circulatingPrevDay", "circulatingPrevWeek", "circulatingPrevMonth", "chainCirculating"]) as JsonObject;
      if (Object.hasOwn(row, "chainCirculating")) coin.chainCirculating = dictionary(row.chainCirculating, ["current"]);
      return coin;
    }),
  };
}

function projectChains(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.chains)) return payload;
  return { ...pick(payload, ["_meta", "globalChange24hPct", "globalChange7dPct", "globalChange30dPct"]) as JsonObject, chains: payload.chains.map((row) => pick(row, ["id", "name", "totalUsd", "healthScore", "change24hPct", "change7dPct", "change30dPct"])) };
}

function projectStability(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.history)) return payload;
  const out = pick(payload, ["_meta", "current"]) as JsonObject;
  if (Object.hasOwn(payload, "methodology")) out.methodology = pick(payload.methodology, ["version"]);
  const current = payload.current;
  if (current !== null && typeof current === "object" && !Array.isArray(current)) {
    // computedAt is the publication time live smoke age-checks; kept so the projection stays observable.
    const projected = pick(current, ["score", "band", "avg24h", "components", "computedAt", "methodologyVersion"]) as JsonObject;
    if (Object.hasOwn(current, "components")) projected.components = pick(current.components, ["severity", "breadth", "stressBreadth", "trend"]);
    if (Object.hasOwn(current, "inputDegradation")) projected.inputDegradation = pick(current.inputDegradation, ["dewsUnavailable", "depegEventsUnavailable"]);
    out.current = projected;
  }
  // Validate and resolve duplicate dates before the bounded tail, matching the plotted observations.
  const history = payload.history.filter((row): row is JsonObject & { date: number } => row !== null && typeof row === "object" && !Array.isArray(row) && Number.isFinite(row.score) && validObservationDate(row.date));
  out.history = datedObservations(history).slice(-30).map((row) => pick(row, ["date", "score", "methodologyVersion"]));
  return out;
}

function projectPegSummary(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.coins)) return payload;
  const out = pick(payload, ["_meta"]) as JsonObject;
  // Retain publication time and the methodology identity consumed by the event detector.
  if (Object.hasOwn(payload, "methodology")) out.methodology = pick(payload.methodology, ["asOf", "version"]);
  return { ...out, coins: payload.coins.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
    const coin = pick(row, ["id", "currentDeviationBps", "activeDepeg", "pegScore", "pegReference", "methodologyVersion"]) as JsonObject;
    if (Object.hasOwn(row, "pegReference")) coin.pegReference = pick(row.pegReference, ["valueUsd", "source", "contributorCount"]);
    return coin;
  }) };
}

function projectStress(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Object.hasOwn(payload, "signals")) return payload;
  // updatedAt (publication time) stays so live smoke can age-check the projected body.
  const out = pick(payload, ["_meta", "updatedAt"]) as JsonObject;
  if (Object.hasOwn(payload, "methodology")) out.methodology = pick(payload.methodology, ["version"]);
  return { ...out, signals: dictionary(payload.signals, ["score", "band"]) };
}

function projectSafetyGrades(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.grades)) return payload;
  return { ...pick(payload, ["_meta", "updatedAt", "methodologyVersion"]) as JsonObject, grades: payload.grades
    .filter((row) => row === null || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string" || RUNTIME_ACTIVE_IDS.has(row.id))
    .map((row) => pick(row, ["id", "grade"])) };
}

function projectMintBurn(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.hourly)) return payload;
  const out = pick(payload, ["_meta", "scope", "coins"]) as JsonObject;
  out.hourly = payload.hourly.map((row) => pick(row, ["hourTs", "netFlowUsd", "mintVolumeUsd", "burnVolumeUsd", "valuation"]));
  if (Object.hasOwn(payload, "scope")) out.scope = pick(payload.scope, ["chainIds"]);
  if (Array.isArray(payload.coins)) out.coins = payload.coins.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
    const coin = pick(row, ["stablecoinId", "mintVolume24hUsd", "burnVolume24hUsd", "netFlow24hUsd", "netFlow7dUsd", "coverage"]) as JsonObject;
    if (Object.hasOwn(row, "coverage")) coin.coverage = pick(row.coverage, ["status", "has24hWindow", "historyStartAt", "isPartial"]);
    if (Object.hasOwn(row, "valuation")) {
      coin.valuation = pick(row.valuation, ["window24h", "netFlow7d"]);
      if (coin.valuation !== null && typeof coin.valuation === "object" && !Array.isArray(coin.valuation) && Object.hasOwn(coin.valuation, "window24h")) coin.valuation.window24h = pick(coin.valuation.window24h, ["completeness", "mintCompleteness", "burnCompleteness"]);
    }
    return coin;
  });
  return out;
}

const PROJECTORS: Record<PharosVilleApiEndpointKey, (payload: ProjectionJson) => ProjectionJson> = {
  stablecoins: projectStablecoins,
  chains: projectChains,
  stability: projectStability,
  pegSummary: projectPegSummary,
  stress: projectStress,
  safetyGrades: projectSafetyGrades,
  mintBurn: projectMintBurn,
};

export function endpointProjector(key: PharosVilleApiEndpointKey): (payload: ProjectionJson) => ProjectionJson {
  return PROJECTORS[key];
}
