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
  return { ...pick(payload, ["_meta", "globalChange7dPct"]) as JsonObject, chains: payload.chains.map((row) => pick(row, ["id", "name", "totalUsd", "healthScore", "change24hPct", "change7dPct", "change30dPct"])) };
}

function projectStability(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.history)) return payload;
  const out = pick(payload, ["_meta", "current"]) as JsonObject;
  const current = payload.current;
  if (current !== null && typeof current === "object" && !Array.isArray(current)) {
    // computedAt is the publication time live smoke age-checks; kept so the projection stays observable.
    const projected = pick(current, ["score", "band", "avg24h", "components", "computedAt"]) as JsonObject;
    if (Object.hasOwn(current, "components")) projected.components = pick(current.components, ["severity", "breadth", "stressBreadth", "trend"]);
    out.current = projected;
  }
  // Exactly Panel's finite-score filter, ascending stable date sort and tail.
  out.history = payload.history.filter((row): row is JsonObject => row !== null && typeof row === "object" && !Array.isArray(row) && Number.isFinite(row.score))
    .sort((a, b) => Number(a.date) - Number(b.date)).slice(-30).map((row) => pick(row, ["date", "score"]));
  return out;
}

function projectPegSummary(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.coins)) return payload;
  const out = pick(payload, ["_meta"]) as JsonObject;
  // methodology.asOf is the publication time live smoke age-checks; the rest of methodology stays dropped.
  if (payload.methodology !== null && typeof payload.methodology === "object" && !Array.isArray(payload.methodology) && Object.hasOwn(payload.methodology, "asOf")) {
    out.methodology = pick(payload.methodology, ["asOf"]);
  }
  return { ...out, coins: payload.coins.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
    const coin = pick(row, ["id", "currentDeviationBps", "activeDepeg", "pegScore", "pegReference"]) as JsonObject;
    if (Object.hasOwn(row, "pegReference")) coin.pegReference = pick(row.pegReference, ["valueUsd", "source", "contributorCount"]);
    return coin;
  }) };
}

function projectStress(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Object.hasOwn(payload, "signals")) return payload;
  // updatedAt (publication time) stays so live smoke can age-check the projected body.
  return { ...pick(payload, ["_meta", "updatedAt"]) as JsonObject, signals: dictionary(payload.signals, ["score", "band"]) };
}

function projectSafetyGrades(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.grades)) return payload;
  return { ...pick(payload, ["_meta", "updatedAt"]) as JsonObject, grades: payload.grades
    .filter((row): row is JsonObject => row !== null && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string" && RUNTIME_ACTIVE_IDS.has(row.id))
    .map((row) => pick(row, ["id", "grade"])) };
}

function projectMintBurn(payload: ProjectionJson): ProjectionJson {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.hourly)) return payload;
  const out = pick(payload, ["_meta", "scope", "coins"]) as JsonObject;
  out.hourly = payload.hourly.map((row) => pick(row, ["hourTs", "netFlowUsd", "mintVolumeUsd", "burnVolumeUsd"]));
  if (Object.hasOwn(payload, "scope")) out.scope = pick(payload.scope, ["chainIds"]);
  if (Array.isArray(payload.coins)) out.coins = payload.coins.map((row) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
    const coin = pick(row, ["stablecoinId", "mintVolume24hUsd", "burnVolume24hUsd", "netFlow24hUsd", "netFlow7dUsd", "coverage"]) as JsonObject;
    if (Object.hasOwn(row, "coverage")) coin.coverage = pick(row.coverage, ["status"]);
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
