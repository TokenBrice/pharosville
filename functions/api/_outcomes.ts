import { PHAROSVILLE_LATEST_VERSION } from "../../src/content/pharosville-version";
import type { PharosVilleApiEndpointKey } from "../../shared/types/pharosville-endpoint-keys";
import type { PanelEndpointKey } from "../../shared/lib/pharosville-panel-endpoints";

export type ProxyOutcome = "cache-hit" | "upstream-success" | "upstream-4xx" | "upstream-5xx"
  | "timeout" | "fetch-error" | "stale-fallback" | "not-configured" | "rejected";
export interface ProxyEvidence {
  source: "cache" | "upstream" | "not-configured" | "rejected";
  status: number;
  upstreamStatus?: number;
  errorKind?: "timeout" | "fetch-error";
  warning?: string | null;
}

export function hasStaleWarning(warning?: string | null): boolean {
  return /(?:^|,)\s*110\b/.test(warning ?? "");
}

/** Upstream evidence survives a successful stale response. */
export function classifyProxyOutcome(evidence: ProxyEvidence): ProxyOutcome[] {
  const { source, status, upstreamStatus = status, errorKind, warning } = evidence;
  const outcome: ProxyOutcome = source === "cache" ? "cache-hit"
    : source === "not-configured" || source === "rejected" ? source
      : errorKind ?? (upstreamStatus >= 500 ? "upstream-5xx" : upstreamStatus >= 400 ? "upstream-4xx" : "upstream-success");
  return hasStaleWarning(warning) ? [outcome, "stale-fallback"] : [outcome];
}

function latencyBucket(durationMs: number): string {
  return durationMs < 100 ? "lt100ms" : durationMs < 1_000 ? "lt1s" : durationMs < 8_000 ? "lt8s" : "gte8s";
}

/** One sampling decision pairs the outcome(s) with a separate final-status count. */
export function proxyOutcomeRecords(
  endpoint: PharosVilleApiEndpointKey | PanelEndpointKey | "unlisted",
  evidence: ProxyEvidence,
  durationMs: number,
  random: number,
) {
  const outcomes = classifyProxyOutcome(evidence);
  const sampleRate = outcomes.every((outcome) => outcome === "cache-hit" || outcome === "upstream-success") ? 0.01 : 1;
  if (random >= sampleRate) return [];
  const common = { endpoint, latencyBucket: latencyBucket(durationMs), release: PHAROSVILLE_LATEST_VERSION, sampleRate };
  return [
    ...outcomes.map((outcome) => ({
      event: "PHAROSVILLE_PROXY_OUTCOME",
      ...common,
      outcome,
      statusClass: `${Math.floor((outcome === "stale-fallback" ? evidence.status : evidence.upstreamStatus ?? evidence.status) / 100)}xx`,
    })),
    { event: "PHAROSVILLE_PROXY_RESPONSE", ...common, outcome: "response", statusClass: `${Math.floor(evidence.status / 100)}xx` },
  ];
}

/** Omit maxAgeSec for the static root probe; unknown data age is degraded. */
export function classifyProbe(input: {
  status: number;
  warning?: string | null;
  publicationAgeSec?: number | null;
  maxAgeSec?: number;
  contentValid?: boolean;
}): "available" | "degraded" | "unavailable" {
  if (input.status !== 200 || input.contentValid === false) return "unavailable";
  if (hasStaleWarning(input.warning)) return "degraded";
  if (input.maxAgeSec !== undefined && (
    !Number.isFinite(input.maxAgeSec) || input.maxAgeSec <= 0
    || input.publicationAgeSec == null || !Number.isFinite(input.publicationAgeSec)
    || input.publicationAgeSec < 0 || input.publicationAgeSec > input.maxAgeSec
  )) return "degraded";
  return "available";
}
