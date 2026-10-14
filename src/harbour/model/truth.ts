import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { FRESHNESS_RATIOS } from "@shared/lib/status-thresholds";
import { PHAROSVILLE_API_ENDPOINT_KEYS } from "@shared/types/pharosville-endpoint-keys";
import type { EndpointKey, EndpointSnapshot, EndpointTruth, HarbourPayloads } from "./types";

export const ENDPOINT_KEYS: readonly EndpointKey[] = PHAROSVILLE_API_ENDPOINT_KEYS;

/**
 * Freshness of one endpoint at `nowMs`. Age keeps growing after the fetch, so a last-good payload
 * that stops refreshing turns stale on its own. Unknown (no data) is "unavailable", never current.
 */
export function endpointTruth(key: EndpointKey, snap: EndpointSnapshot<unknown> | undefined, nowMs: number): EndpointTruth {
  if (!snap || snap.data == null) return { state: "unavailable", ageSec: null, serverStatus: null };
  const meta = snap.meta;
  const sinceFetch = snap.fetchedAtMs == null ? 0 : Math.max(0, (nowMs - snap.fetchedAtMs) / 1000);
  const ageSec = meta ? meta.ageSeconds + sinceFetch : snap.fetchedAtMs == null ? null : sinceFetch;
  const maxAge = PHAROSVILLE_ENDPOINT_REGISTRY[key].metaMaxAgeSec;
  const stale = meta?.status === "stale" || (ageSec != null && ageSec / Math.max(1, maxAge) > FRESHNESS_RATIOS.DEGRADED);
  return { state: stale ? "stale" : "current", ageSec, serverStatus: meta?.status ?? null };
}

export function allTruth(payloads: HarbourPayloads, nowMs: number): Record<EndpointKey, EndpointTruth> {
  const out = {} as Record<EndpointKey, EndpointTruth>;
  for (const key of ENDPOINT_KEYS) out[key] = endpointTruth(key, payloads[key] as EndpointSnapshot<unknown> | undefined, nowMs);
  return out;
}
