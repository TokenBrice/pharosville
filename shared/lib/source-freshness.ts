import type { ApiMeta } from "../types/api-meta";
import { classifyFreshnessRatio } from "./status-thresholds";

/** Age alone is CDN residence; only source metadata or X-Data-Age dates a reading. */
export function sourceFreshness(meta: ApiMeta | null, headers: Pick<Headers, "get">, maxAgeSec: number, nowMs: number) {
  const nowSec = Math.floor(nowMs / 1000);
  if (meta && (!Number.isFinite(meta.ageSeconds) || meta.ageSeconds < 0 || !Number.isFinite(meta.updatedAt) || meta.updatedAt < 0 || meta.updatedAt > nowSec)) meta = null;
  const age = (name: string) => {
    const raw = headers.get(name);
    const n = raw == null || !raw.trim() ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const dataAge = age("X-Data-Age");
  if (meta || dataAge !== null) {
    const ageSeconds = Math.max(Math.max(meta?.ageSeconds ?? 0, dataAge ?? 0) + (age("Age") ?? 0), meta ? nowSec - meta.updatedAt : 0);
    const cls = classifyFreshnessRatio(ageSeconds / Math.max(1, maxAgeSec));
    meta = { ...meta, updatedAt: Math.min(meta?.updatedAt ?? nowSec, nowSec - ageSeconds), ageSeconds,
      status: meta?.status === "stale" || cls === "stale" ? "stale" : meta?.status === "degraded" || cls === "degraded" ? "degraded" : "fresh" };
  }
  const warning = headers.get("Warning") ?? meta?.warning ?? null;
  const staleFallback = /(?:^|,\s*)110\b/.test(warning ?? "");
  const degradedTransport = staleFallback || /Response is (?:degraded|stale)/i.test(warning ?? "") || meta?.status === "degraded";
  if (meta && warning) meta = { ...meta, status: staleFallback ? "stale" : degradedTransport && meta.status === "fresh" ? "degraded" : meta.status, warning };
  return { meta, staleFallback, degradedTransport };
}
