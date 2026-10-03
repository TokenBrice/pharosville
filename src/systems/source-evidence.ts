import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { classifyFreshnessRatio } from "@shared/lib/status-thresholds";
import type { PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";
import type { PharosVilleSourceStatus } from "./world-types";

export function observationEpochMs(seconds: number | null | undefined): number | null {
  return seconds != null && Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
}

/** A source's oldest row cannot stand in for this reading's own observation. */
export function rowSourceEvidence(
  key: PharosVilleApiEndpointKey,
  source: PharosVilleSourceStatus,
  reading: Omit<PharosVilleSourceStatus, "state" | "publishedAt"> & { available: boolean },
  observedNowMs?: number,
): PharosVilleSourceStatus {
  const { available, ...own } = reading;
  const status = { ...own, publishedAt: source.publishedAt };
  if (!available) return { ...status, state: "unavailable" };
  // These are transport/dependency qualifications, not another row's age.
  if (source.state !== "current" && source.reason !== "age unknown" && !source.reason?.startsWith("Source age ")) {
    return { ...status, state: "stale", reason: [source.reason ?? `Source ${source.state}`, own.reason].filter(Boolean).join("; ") };
  }
  const asOf = own.observedAt ?? source.publishedAt;
  if (asOf === null) return { ...status, state: "stale", reason: ["age unknown", own.reason].filter(Boolean).join("; ") };
  const age = Math.max(0, ((observedNowMs ?? source.publishedAt ?? asOf) - asOf) / 1_000);
  const ageState = classifyFreshnessRatio(age / PHAROSVILLE_ENDPOINT_REGISTRY[key].metaMaxAgeSec);
  return {
    ...status, state: ageState === "fresh" ? "current" : "stale",
    reason: [ageState === "fresh" ? null : `Reading age ${ageState}`, own.reason].filter(Boolean).join("; ") || null,
  };
}
