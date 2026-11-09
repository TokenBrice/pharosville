import { z } from "zod";
import type { PanelEndpointKey } from "../lib/pharosville-panel-endpoints";

// Transport metadata is interpreted by sourceFreshness, independently of the reading schema.
const meta = { _meta: z.unknown().optional() };
const timestamp = z.number().finite().nonnegative();
const number = z.number().finite();
const httpsUrl = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
});

export const PanelDepegEventsSchema = z.object({
  ...meta,
  events: z.array(z.object({
    startedAt: timestamp, endedAt: timestamp.nullable(), direction: z.enum(["above", "below"]),
    peakDeviationBps: number, source: z.enum(["live", "backfill"]),
  })).max(30),
  total: z.number().int().nonnegative(),
  methodology: z.object({ version: z.string().nullish() }).nullish(),
});

export const PanelReservesSchema = z.object({
  ...meta,
  stablecoinId: z.string(),
  mode: z.enum(["live", "live-stale", "curated-fallback", "template-fallback", "unavailable"]),
  estimated: z.boolean(), liveAt: timestamp.nullish(),
  reserves: z.array(z.object({
    name: z.string(), pct: number.positive().max(100),
    risk: z.enum(["very-low", "low", "medium", "high", "very-high"]),
  })),
  provenance: z.object({
    evidenceClass: z.enum(["independent", "static-validated", "weak-live-probe"]),
    sourceModel: z.enum(["dynamic-mix", "validated-static", "single-bucket"]),
    freshnessMode: z.enum(["verified", "unverified", "not-applicable"]).nullish(),
  }).nullish(),
  sync: z.object({
    status: z.enum(["ok", "degraded", "error", "skipped"]), stale: z.boolean(), lastSuccessAt: timestamp.nullish(),
  }).nullish(),
  displayUrl: httpsUrl.nullish(), evidenceUrls: z.array(httpsUrl).nullish(),
  metadata: z.object({ sourceTimestamp: timestamp.nullish() }).nullish(),
});

export const PanelLiquidityRowSchema = z.object({
  totalTvlUsd: number.nonnegative(), effectiveTvlUsd: number.nonnegative(), liquidityScore: number.min(0).max(100).nullable(),
  coverageClass: z.enum(["primary", "mixed", "fallback", "legacy", "unobserved"]).nullable(),
  coverageConfidence: number.min(0).max(1),
  liquidityEvidenceClass: z.enum(["unobserved", "measured", "partial_measured", "observed_unmeasured"]),
  hasMeasuredLiquidityEvidence: z.boolean(), updatedAt: timestamp, methodologyVersion: z.string(),
});
export const PanelDexLiquiditySchema = z.object(meta).catchall(PanelLiquidityRowSchema);

export const PHAROSVILLE_PANEL_SCHEMAS = {
  depegEvents: PanelDepegEventsSchema, stablecoinReserves: PanelReservesSchema, dexLiquidity: PanelDexLiquiditySchema,
} as const;
export type PanelPayload<K extends PanelEndpointKey> = z.infer<typeof PHAROSVILLE_PANEL_SCHEMAS[K]>;
