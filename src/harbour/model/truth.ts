import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { FRESHNESS_RATIOS } from "@shared/lib/status-thresholds";
import { PHAROSVILLE_API_ENDPOINT_KEYS } from "@shared/types/pharosville-endpoint-keys";
import type { EndpointKey, EndpointSnapshot, EndpointTruth, HarbourPayloads } from "./types";

export const ENDPOINT_KEYS: readonly EndpointKey[] = PHAROSVILLE_API_ENDPOINT_KEYS;

/**
 * Freshness of one endpoint at `nowMs`. Age keeps growing after the fetch, so a last-good payload
 * that stops refreshing turns stale on its own. Missing source evidence is "unknown"; no data is "unavailable", never current.
 */
export function endpointTruth(key: EndpointKey, snap: EndpointSnapshot<unknown> | undefined, nowMs: number): EndpointTruth {
  const receivedAtMs = snap?.fetchedAtMs != null && Number.isFinite(snap.fetchedAtMs) && snap.fetchedAtMs >= 0 ? snap.fetchedAtMs : null;
  if (!snap || snap.data == null) return { state: "unavailable", ageSec: null, serverStatus: null, sourceUpdatedAtMs: null, receivedAtMs, reason: "no-observation" };
  const meta = snap.meta;
  const verified = meta != null && Number.isFinite(meta.ageSeconds) && meta.ageSeconds >= 0 && Number.isFinite(meta.updatedAt) && meta.updatedAt >= 0 && meta.updatedAt * 1000 <= nowMs;
  const sinceFetch = receivedAtMs == null ? 0 : Math.max(0, (nowMs - receivedAtMs) / 1000);
  const ageSec = verified ? Math.max(meta.ageSeconds + sinceFetch, nowMs / 1000 - meta.updatedAt) : null;
  const maxAge = PHAROSVILLE_ENDPOINT_REGISTRY[key].metaMaxAgeSec;
  const fallback = snap.staleFallback === true || /(?:^|,\s*)110\b/.test(meta?.warning ?? "");
  const stale = fallback || (ageSec != null && (meta?.status === "stale" || ageSec / Math.max(1, maxAge) > FRESHNESS_RATIOS.DEGRADED));
  return {
    state: stale ? "stale" : verified ? "current" : "unknown", ageSec, serverStatus: meta?.status ?? null,
    sourceUpdatedAtMs: ageSec == null ? null : nowMs - ageSec * 1000, receivedAtMs,
    reason: fallback ? "stale-fallback" : stale ? "source-stale" : verified ? null : "unverified-source",
  };
}

export function allTruth(payloads: HarbourPayloads, nowMs: number): Record<EndpointKey, EndpointTruth> {
  const out = {} as Record<EndpointKey, EndpointTruth>;
  for (const key of ENDPOINT_KEYS) out[key] = endpointTruth(key, payloads[key] as EndpointSnapshot<unknown> | undefined, nowMs);
  return out;
}
