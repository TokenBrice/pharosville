import { z } from "zod";
import { NET_FLOW_DIRECTION_24H_VALUES, PRESSURE_SHIFT_STATE_VALUES } from "@shared/lib/mint-burn-signals";

const SignedFlowIntensitySchema = z.number().min(-100).max(100);
const PressureShiftStateSchema = z.enum(PRESSURE_SHIFT_STATE_VALUES);
const NetFlowDirection24hSchema = z.enum(NET_FLOW_DIRECTION_24H_VALUES);

const ValuationCompletenessSchema = z.enum(["complete", "partial", "unknown"]);
const MintBurnValuationSchema = z.object({
  completeness: ValuationCompletenessSchema,
  mintCompleteness: ValuationCompletenessSchema,
  burnCompleteness: ValuationCompletenessSchema,
  unpricedMintEventCount: z.number().int().nonnegative(),
  unpricedBurnEventCount: z.number().int().nonnegative(),
});
export type MintBurnValuation = z.infer<typeof MintBurnValuationSchema>;

const MintBurnGaugeSchema = z.object({
  score: SignedFlowIntensitySchema.nullable(),
  band: z.string().nullable(),
  intensitySemantics: z.enum(["midpoint-v1", "signed-v2"]).optional(),
  flightToQuality: z.boolean().nullable(),
  flightIntensity: z.number().finite().nullable(),
  classificationSource: z.enum(["safety-score-v9-publication", "report-card-cache", "unavailable"]).optional(),
  trackedCoins: z.number().int().nonnegative(),
  trackedMcapUsd: z.number().finite().nonnegative(),
});
export type MintBurnGauge = z.infer<typeof MintBurnGaugeSchema>;

const MintBurnScopeSchema = z.object({
  chainIds: z.array(z.string()),
  label: z.string(),
});
export type MintBurnScope = z.infer<typeof MintBurnScopeSchema>;

const MintBurnSyncSchema = z.object({
  lastSuccessfulSyncAt: z.number().nullable(),
  freshnessStatus: z.enum(["fresh", "degraded", "stale"]),
  warning: z.string().nullable(),
  classificationWarning: z.string().nullable().optional(),
  criticalLaneHealthy: z.boolean(),
});
export type MintBurnSync = z.infer<typeof MintBurnSyncSchema>;

const MintBurnCoverageStatusSchema = z.enum([
  "full",
  "partial-history",
  "lagging",
  "bootstrapping",
  "disabled",
  "unknown",
]);
export type MintBurnCoverageStatus = z.infer<typeof MintBurnCoverageStatusSchema>;

const MintBurnCoinCoverageSchema = z.object({
  startBlock: z.number(),
  lastSyncedBlock: z.number().nullable(),
  lagBlocks: z.number().nullable(),
  historyStartAt: z.number().nullable(),
  has24hWindow: z.boolean(),
  has30dWindow: z.boolean(),
  has90dWindow: z.boolean(),
  isPartial: z.boolean(),
  adapterKinds: z.array(z.string()).optional(),
  startBlockSource: z.string().optional(),
  startBlockConfidence: z.enum(["high", "medium", "low"]).optional(),
  status: MintBurnCoverageStatusSchema,
});
export type MintBurnCoinCoverage = z.infer<typeof MintBurnCoinCoverageSchema>;

const MintBurnCoinFlowSchema = z.object({
  stablecoinId: z.string(),
  symbol: z.string(),
  flowIntensity: SignedFlowIntensitySchema.nullable().optional(),
  pressureShiftScore: SignedFlowIntensitySchema.nullable().optional(),
  pressureShiftState: PressureShiftStateSchema.optional(),
  netFlowDirection24h: NetFlowDirection24hSchema.nullable().optional(),
  has24hActivity: z.boolean().optional(),
  baselineDailyNetUsd: z.number().nullable().optional(),
  baselineDailyAbsUsd: z.number().nullable().optional(),
  baselineDataDays: z.number().nullable().optional(),
  /** Partial valuation withholds the signed net; gross volumes remain lower bounds. */
  netFlow24hUsd: z.number().finite().nullable(),
  mintVolume24hUsd: z.number().finite().nonnegative(),
  burnVolume24hUsd: z.number().finite().nonnegative(),
  mintCount24h: z.number().int().nonnegative(),
  burnCount24h: z.number().int().nonnegative(),
  netFlow7dUsd: z.number().finite().nullable(),
  netFlow30dUsd: z.number().finite().nullable(),
  netFlow90dUsd: z.number().finite().nullable(),
  largestEvent24h: z
    .object({
      direction: z.enum(["mint", "burn"]),
      amountUsd: z.number(),
      txHash: z.string(),
      timestamp: z.number(),
    })
    .nullable(),
  coverage: MintBurnCoinCoverageSchema.optional(),
  valuation: z.object({
    window24h: MintBurnValuationSchema,
    baseline: ValuationCompletenessSchema,
    netFlow7d: ValuationCompletenessSchema,
    netFlow30d: ValuationCompletenessSchema,
    netFlow90d: ValuationCompletenessSchema,
  }).optional(),
}).superRefine((coin, ctx) => {
  if (coin.netFlow24hUsd === null && coin.valuation?.window24h.completeness !== "partial") {
    ctx.addIssue({ code: "custom", path: ["netFlow24hUsd"], message: "Null net requires partial valuation evidence" });
  }
});
export type MintBurnCoinFlow = z.infer<typeof MintBurnCoinFlowSchema>;

const MintBurnHourlyBucketSchema = z.object({
  hourTs: z.number().int().nonnegative(),
  netFlowUsd: z.number().finite().nullable(),
  mintVolumeUsd: z.number().finite().nonnegative(),
  burnVolumeUsd: z.number().finite().nonnegative(),
  valuation: ValuationCompletenessSchema.optional(),
}).superRefine((hour, ctx) => {
  if (hour.netFlowUsd === null && hour.valuation !== "partial") {
    ctx.addIssue({ code: "custom", path: ["netFlowUsd"], message: "Null net requires partial valuation evidence" });
  }
});
export type MintBurnHourlyBucket = z.infer<typeof MintBurnHourlyBucketSchema>;

export const MintBurnFlowsResponseSchema = z.object({
  gauge: MintBurnGaugeSchema,
  coins: z.array(MintBurnCoinFlowSchema),
  hourly: z.array(MintBurnHourlyBucketSchema),
  updatedAt: z.number(),
  windowHours: z.number().int().positive().optional(),
  scope: MintBurnScopeSchema.optional(),
  sync: MintBurnSyncSchema.optional(),
});
export type MintBurnFlowsResponse = z.infer<typeof MintBurnFlowsResponseSchema>;

const MintBurnPerCoinChainSchema = z.object({
  chainId: z.string(),
  mintVolumeUsd: z.number().finite().nonnegative(),
  burnVolumeUsd: z.number().finite().nonnegative(),
  mintCount: z.number().int().nonnegative(),
  burnCount: z.number().int().nonnegative(),
  netFlowUsd: z.number().finite(),
});

export const MintBurnPerCoinResponseSchema = z.object({
  stablecoinId: z.string(),
  symbol: z.string(),
  mintVolumeUsd: z.number().finite().nonnegative(),
  burnVolumeUsd: z.number().finite().nonnegative(),
  netFlowUsd: z.number().finite(),
  mintCount: z.number().int().nonnegative(),
  burnCount: z.number().int().nonnegative(),
  chains: z.array(MintBurnPerCoinChainSchema),
  hourly: z.array(MintBurnHourlyBucketSchema),
  updatedAt: z.number(),
  windowHours: z.number().int().positive().optional(),
  scope: MintBurnScopeSchema.optional(),
  sync: MintBurnSyncSchema.optional(),
});
export type MintBurnPerCoinResponse = z.infer<typeof MintBurnPerCoinResponseSchema>;

const MintBurnFlowTypeSchema = z.enum(["standard", "atomic_roundtrip", "bridge_transfer"]);

const MintBurnEventSchema = z.object({
  id: z.string(),
  stablecoinId: z.string(),
  symbol: z.string(),
  chainId: z.string(),
  direction: z.enum(["mint", "burn"]),
  flowType: MintBurnFlowTypeSchema,
  burnType: z.enum(["effective_burn", "bridge_burn", "review_required"]).nullable(),
  burnReviewReason: z.string().nullable(),
  amount: z.number(),
  amountUsd: z.number().nullable(),
  priceUsed: z.number().nullable(),
  priceTimestamp: z.number().nullable(),
  priceSource: z.string().nullable(),
  counterparty: z.string().nullable(),
  txHash: z.string(),
  blockNumber: z.number(),
  timestamp: z.number(),
  explorerTxUrl: z.string(),
});
export type MintBurnEvent = z.infer<typeof MintBurnEventSchema>;

export const MintBurnEventsResponseSchema = z.object({
  events: z.array(MintBurnEventSchema),
  total: z.number(),
});
export type MintBurnEventsResponse = z.infer<typeof MintBurnEventsResponseSchema>;
