import type { EndpointKey } from "../model/types";

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const nullableRequired = (v: unknown) => v === null || finite(v);
const nullable = (v: unknown) => v == null || finite(v);
const text = (v: unknown) => typeof v === "string" && v.length > 0;
const version = (v: unknown) => v == null || text(v);
const completeness = (v: unknown) => v === "complete" || v === "partial" || v === "unknown";
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const numbers = (row: Record<string, unknown>, fields: string[]) => fields.every((k) => nullable(row[k]));
const nonnegative = (v: unknown) => finite(v) && (v as number) >= 0;
const timestamp = (v: unknown) => nonnegative(v) && Number.isInteger(v);
const method = (v: unknown) => v == null || (record(v) && version(v.version) && optional(v.asOf, nonnegative));
const psiBands = ["BEDROCK", "STEADY", "TREMOR", "FRACTURE", "CRISIS", "MELTDOWN"];
const stressBands = ["CALM", "WATCH", "ALERT", "WARNING", "DANGER", "UNKNOWN"];
const grades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "NR"];
const coverageStatuses = ["full", "partial-history", "lagging", "bootstrapping", "disabled", "unknown"];
const rows = (v: unknown, check: (row: Record<string, unknown>) => boolean) => Array.isArray(v) && v.every((r) => record(r) && check(r));

/** Small consumed-field guard: keep full upstream schemas out of the eager feed. */
export function validEnrichment(key: Exclude<EndpointKey, "stablecoins">, data: Record<string, unknown>): boolean {
  if (!method(data.methodology) || !version(data.methodologyVersion) || !optional(data.updatedAt, nonnegative)) return false;
  switch (key) {
    case "chains":
      return numbers(data, ["globalChange24hPct", "globalChange7dPct", "globalChange30dPct"]) && rows(data.chains, (r) =>
        text(r.id) && text(r.name) && nonnegative(r.totalUsd) && numbers(r, ["healthScore", "change24hPct", "change7dPct", "change30dPct"]));
    case "pegSummary":
      return rows(data.coins, (r) => text(r.id) && numbers(r, ["currentDeviationBps", "pegScore"]) && typeof r.activeDepeg === "boolean" && version(r.methodologyVersion) &&
        (r.pegReference == null || (record(r.pegReference) && numbers(r.pegReference, ["valueUsd", "contributorCount"]) && version(r.pegReference.source))));
    case "safetyGrades":
      return rows(data.grades, (r) => text(r.id) && (r.grade === null || (typeof r.grade === "string" && grades.includes(r.grade))));
    case "stress":
      return record(data.signals) && Object.entries(data.signals).every(([id, r]) => text(id) && (r === null ||
        (record(r) && finite(r.score) && typeof r.band === "string" && stressBands.includes(r.band))));
    case "stability": {
      const r = data.current;
      return (r === null || (record(r) && nullable(r.score) && (r.band == null || psiBands.includes(String(r.band))) && nullable(r.avg24h) &&
        optional(r.computedAt, nonnegative) && version(r.methodologyVersion) &&
        (r.components == null || (record(r.components) && numbers(r.components, ["severity", "breadth", "stressBreadth", "trend"]))) &&
        (r.inputDegradation == null || (record(r.inputDegradation) && ["dewsUnavailable", "depegEventsUnavailable"].every((k) => optional(r.inputDegradation && (r.inputDegradation as Record<string, unknown>)[k], (v) => typeof v === "boolean")))))) &&
        rows(data.history, (h) => nonnegative(h.date) && finite(h.score) && version(h.methodologyVersion));
    }
    case "mintBurn":
      return rows(data.hourly, (h) => timestamp(h.hourTs) && nullableRequired(h.netFlowUsd) && nonnegative(h.mintVolumeUsd) && nonnegative(h.burnVolumeUsd) && optional(h.valuation, completeness)) &&
        (data.scope === undefined || (record(data.scope) && Array.isArray(data.scope.chainIds) && data.scope.chainIds.every(text))) &&
        (data.coins === undefined || rows(data.coins, (c) => text(c.stablecoinId) && nonnegative(c.mintVolume24hUsd) && nonnegative(c.burnVolume24hUsd) && nullableRequired(c.netFlow24hUsd) && nullableRequired(c.netFlow7dUsd) &&
          (c.coverage === undefined || (record(c.coverage) && coverageStatuses.includes(String(c.coverage.status)) && nullable(c.coverage.historyStartAt) &&
            ["has24hWindow", "isPartial"].every((k) => optional((c.coverage as Record<string, unknown>)[k], (v) => typeof v === "boolean")))) &&
          (c.valuation === undefined || (record(c.valuation) && record(c.valuation.window24h) && completeness(c.valuation.window24h.completeness) &&
            ["mintCompleteness", "burnCompleteness"].every((k) => optional((c.valuation as { window24h: Record<string, unknown> }).window24h[k], completeness)) && optional(c.valuation.netFlow7d, completeness)))));
  }
}
