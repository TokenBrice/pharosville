import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { classifyFreshnessRatio } from "@shared/lib/status-thresholds";
import { PHAROSVILLE_API_ENDPOINT_KEYS, type PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";
import type { PharosVilleFreshness, PharosVilleSourceStatus } from "./world-types";

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
  // Only a genuine own observation can override another row's source age.
  // Envelope-only readings inherit the source's age and transport qualifiers.
  if (source.state !== "current" && (own.observedAt === null || (source.reason !== "age unknown" && !source.reason?.startsWith("Source age ")))) {
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
/** Shared four-state DOM vocabulary; stale usable readings are held samples. */
export function sourceStatusLabel(status: PharosVilleSourceStatus): string {
  if (status.state !== "stale") return status.state;
  const asOf = status.observedAt ?? status.publishedAt;
  return `held (as of ${asOf === null ? "unknown time" : new Date(asOf).toISOString()})`;
}

export function sourceCoverageLabel({ coverage }: PharosVilleSourceStatus): string {
  return `${coverage.state} coverage${coverage.coveredRows != null ? `; ${coverage.coveredRows}${coverage.expectedRows != null ? `/${coverage.expectedRows}` : ""} rows` : ""}${coverage.windowHours != null ? `; ${coverage.windowHours}h window` : ""}${coverage.scopeLabel ? `; ${coverage.scopeLabel}` : ""}`;
}

/** The selected record and the ship-local ledger quote the same own evidence. */
export function nodeSourceEvidenceLabel(evidence: Partial<PharosVilleFreshness>): string {
  return PHAROSVILLE_API_ENDPOINT_KEYS.flatMap((key) => {
    const status = evidence[key];
    if (!status) return [];
    return [[
      `${PHAROSVILLE_ENDPOINT_REGISTRY[key].label}: ${sourceStatusLabel(status)}`,
      `observed ${status.observedAt === null ? "unknown" : new Date(status.observedAt).toISOString()}`,
      status.publishedAt !== null ? `published/as of ${new Date(status.publishedAt).toISOString()}` : "publication time unknown",
      sourceCoverageLabel(status),
      status.methodologyVersion ? `methodology ${status.methodologyVersion}` : null,
      status.reason,
    ].filter(Boolean).join("; ")];
  }).join("\n");
}
