import { RUNTIME_ACTIVE_IDS } from "../../shared/lib/stablecoins/runtime-registry";
import type { PanelEndpointKey } from "../../shared/lib/pharosville-panel-endpoints";
import type { ProjectionJson } from "./_project";

type JsonObject = { [key: string]: ProjectionJson };
const isObject = (value: ProjectionJson): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
function pick(value: ProjectionJson, fields: readonly string[]): ProjectionJson {
  if (!isObject(value)) return value;
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(value, field)).map((field) => [field, value[field]]));
}
function httpsUrl(value: ProjectionJson): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

function depegEvents(payload: ProjectionJson): ProjectionJson {
  if (!isObject(payload)) return payload;
  const out = pick(payload, ["events", "total", "methodology", "_meta"]) as JsonObject;
  if (Array.isArray(payload.events)) out.events = payload.events.map((row) => pick(row, ["startedAt", "endedAt", "direction", "peakDeviationBps", "source"]));
  if (Object.hasOwn(payload, "methodology")) out.methodology = pick(payload.methodology, ["version"]);
  return out;
}
function stablecoinReserves(payload: ProjectionJson): ProjectionJson {
  if (!isObject(payload)) return payload;
  const out = pick(payload, ["stablecoinId", "mode", "estimated", "liveAt", "reserves", "provenance", "sync", "displayUrl", "evidenceUrls", "metadata", "_meta"]) as JsonObject;
  if (Array.isArray(payload.reserves)) out.reserves = payload.reserves.map((row) => pick(row, ["name", "pct", "risk"]));
  if (Object.hasOwn(payload, "provenance")) out.provenance = pick(payload.provenance, ["evidenceClass", "sourceModel", "freshnessMode"]);
  if (Object.hasOwn(payload, "sync")) out.sync = pick(payload.sync, ["status", "stale", "lastSuccessAt"]);
  if (Object.hasOwn(payload, "metadata")) out.metadata = pick(payload.metadata, ["sourceTimestamp"]);
  if (out.displayUrl != null && !httpsUrl(out.displayUrl)) delete out.displayUrl;
  if (Array.isArray(out.evidenceUrls)) out.evidenceUrls = out.evidenceUrls.filter(httpsUrl);
  return out;
}
function dexLiquidity(payload: ProjectionJson): ProjectionJson {
  if (!isObject(payload)) return payload;
  // Only registered subjects can open a reading; omit the rest to bound the map for this visit.
  return Object.fromEntries(Object.entries(payload).filter(([id]) => id === "_meta" || RUNTIME_ACTIVE_IDS.has(id)).map(([id, row]) => [id, id === "_meta" ? row : pick(row, ["totalTvlUsd", "effectiveTvlUsd", "liquidityScore", "coverageClass", "coverageConfidence", "liquidityEvidenceClass", "hasMeasuredLiquidityEvidence", "updatedAt", "methodologyVersion"])]));
}

const PROJECTORS = { depegEvents, stablecoinReserves, dexLiquidity };
export function panelEndpointProjector(key: PanelEndpointKey): (payload: ProjectionJson) => ProjectionJson {
  return PROJECTORS[key];
}
