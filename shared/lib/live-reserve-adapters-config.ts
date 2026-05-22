import { z } from "zod";
import type { LiveReservesConfig } from "../types/live-reserves";
import { LIVE_RESERVE_ADAPTER_REGISTRY_ENTRIES } from "./live-reserve-adapters-registry";
import {
  baseLiveReserveConfigSchema,
  createLiveReserveInputsSchema,
} from "./live-reserve-adapters-schemas";

const liveReserveConfigVariants = LIVE_RESERVE_ADAPTER_REGISTRY_ENTRIES.map((entry) =>
  baseLiveReserveConfigSchema.extend({
    adapter: z.literal(entry.adapterKey),
    inputs: createLiveReserveInputsSchema(entry.adapterKey),
    params: entry.paramsSchema.optional(),
  }).strict(),
// Zod discriminatedUnion requires a non-empty tuple type that TS cannot infer from array operations
) as unknown as readonly [z.ZodTypeAny, ...z.ZodTypeAny[]];

const liveReserveConfigUnion = z.discriminatedUnion(
  "adapter",
  liveReserveConfigVariants as never,
);

export const LiveReservesConfigSchema = liveReserveConfigUnion as unknown as z.ZodType<LiveReservesConfig>;
