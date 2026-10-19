import { z } from "zod";
import type { PharosVilleApiEndpointKey } from "./pharosville-endpoint-keys";
import { ChainSummarySchema } from "./chains";
import { PegSummaryCoinSchema, StressSignalEntrySchema } from "./market";
import { SafetyGradeEntrySchema } from "./safety-grades";
import { StabilityIndexCurrentSchema, StabilityIndexHistoryPointSchema } from "./stability";

export { PHAROSVILLE_API_ENDPOINT_KEYS } from "./pharosville-endpoint-keys";
export type { PharosVilleApiEndpointKey } from "./pharosville-endpoint-keys";

/** Standalone route contract, deliberately separate from full upstream schemas. */
export const PHAROSVILLE_API_CONTRACT_VERSION = 2;
const buckets = z.record(z.string(), z.number().nullable());
const meta = { _meta: z.unknown().optional() };
const nullableNumber = z.number().finite().nullable();

export const PHAROSVILLE_API_PAYLOAD_SCHEMAS = {
  stablecoins: z.object({
    ...meta,
    peggedAssets: z.array(z.object({
      id: z.string(), name: z.string(), symbol: z.string(), pegType: z.string(),
      chains: z.array(z.string()), circulating: buckets,
      circulatingPrevDay: buckets.nullish(), circulatingPrevWeek: buckets.nullish(), circulatingPrevMonth: buckets.nullish(),
      chainCirculating: z.record(z.string(), z.object({ current: nullableNumber }).nullable()),
    })),
  }),
  chains: z.object({
    ...meta,
    globalChange7dPct: z.number(),
    chains: z.array(ChainSummarySchema.pick({ id: true, name: true, totalUsd: true, healthScore: true, change24hPct: true, change7dPct: true, change30dPct: true })),
  }),
  stability: z.object({
    ...meta,
    current: StabilityIndexCurrentSchema.pick({ score: true, band: true, avg24h: true, components: true }).nullable(),
    history: z.array(StabilityIndexHistoryPointSchema.pick({ date: true, score: true })),
  }),
  pegSummary: z.object({
    ...meta,
    coins: z.array(PegSummaryCoinSchema.pick({ id: true, currentDeviationBps: true, activeDepeg: true, pegScore: true }).extend({
      pegReference: z.object({ valueUsd: nullableNumber, source: z.string().nullable(), contributorCount: nullableNumber }).nullish(),
    })),
  }),
  stress: z.object({ ...meta, signals: z.record(z.string(), StressSignalEntrySchema.pick({ score: true, band: true }).nullable()) }),
  safetyGrades: z.object({ ...meta, grades: z.array(SafetyGradeEntrySchema.pick({ id: true, grade: true })) }),
  mintBurn: z.object({
    ...meta,
    hourly: z.array(z.object({ hourTs: z.number().int().nonnegative(), netFlowUsd: nullableNumber, mintVolumeUsd: z.number().nonnegative(), burnVolumeUsd: z.number().nonnegative() })),
    scope: z.object({ chainIds: z.array(z.string()) }).optional(),
    coins: z.array(z.object({
      stablecoinId: z.string(), mintVolume24hUsd: z.number().nonnegative(), burnVolume24hUsd: z.number().nonnegative(),
      netFlow24hUsd: nullableNumber, netFlow7dUsd: nullableNumber,
      coverage: z.object({ status: z.string() }).optional(),
    })),
  }),
} as const satisfies Record<PharosVilleApiEndpointKey, z.ZodType>;

export const PharosVilleApiPayloadsSchema = z.object(PHAROSVILLE_API_PAYLOAD_SCHEMAS);
export type PharosVilleApiPayloads = z.infer<typeof PharosVilleApiPayloadsSchema>;
export type PharosVilleApiPayload<K extends PharosVilleApiEndpointKey> = PharosVilleApiPayloads[K];
