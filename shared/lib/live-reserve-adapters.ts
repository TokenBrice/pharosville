import { z } from "zod";
import { type LiveReserveAdapterKey } from "../types/live-reserves";
import { LiveReservesConfigSchema } from "./live-reserve-adapters-config";
import {
  LIVE_RESERVE_ADAPTER_REGISTRY,
  LIVE_RESERVE_ADAPTER_REGISTRY_ENTRIES,
} from "./live-reserve-adapters-registry";
import {
  adapterParamsSchemas,
  LIVE_RESERVE_ADAPTER_PRIMARY_INPUT_KINDS,
  type LiveReserveAdapterParamsByKey,
  type LiveReserveAdapterParams,
} from "./live-reserve-adapters-schemas";

export type LiveReserveRedemptionCapacityTelemetry = "direct" | "proxy" | "none";
export type LiveReserveRedemptionFeeTelemetry = "current-bps" | "none";

export {
  LiveReservesConfigSchema,
  LIVE_RESERVE_ADAPTER_REGISTRY,
  LIVE_RESERVE_ADAPTER_REGISTRY_ENTRIES,
  LIVE_RESERVE_ADAPTER_PRIMARY_INPUT_KINDS,
};

export type {
  LiveReserveAdapterParamsByKey,
  LiveReserveAdapterParams,
};

export function getLiveReserveAdapterDefinition(
  adapterKey: string,
): (typeof LIVE_RESERVE_ADAPTER_REGISTRY)[LiveReserveAdapterKey]["definition"] | null {
  return LIVE_RESERVE_ADAPTER_REGISTRY[adapterKey as LiveReserveAdapterKey]?.definition ?? null;
}

export function parseLiveReserveAdapterParams<K extends LiveReserveAdapterKey>(
  adapterKey: K,
  params: Record<string, unknown> | undefined,
): LiveReserveAdapterParamsByKey[K] {
  // Zod indexed access loses the per-key type; cast aligns the schema with the keyed params type
  const schema = adapterParamsSchemas[adapterKey] as unknown as z.ZodType<LiveReserveAdapterParamsByKey[K]>;
  const parsed = schema.safeParse(params ?? {});
  if (parsed.success) {
    return parsed.data;
  }

  const issue = parsed.error.issues[0];
  const path = issue?.path.length ? `.${issue.path.join(".")}` : "";
  throw new Error(`${adapterKey} adapter params invalid${path}: ${issue?.message ?? "unknown validation error"}`);
}
