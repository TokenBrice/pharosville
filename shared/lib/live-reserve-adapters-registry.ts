import { LIVE_RESERVE_ADAPTER_KEYS, type LiveReserveAdapterKey } from "../types/live-reserves";
import { LIVE_RESERVE_ADAPTER_DEFINITIONS } from "./live-reserve-adapters-definitions";
import {
  adapterParamsSchemas,
  LIVE_RESERVE_ADAPTER_PRIMARY_INPUT_KINDS,
} from "./live-reserve-adapters-schemas";

export type LiveReserveAdapterRegistryEntry = {
  definition: (typeof LIVE_RESERVE_ADAPTER_DEFINITIONS)[LiveReserveAdapterKey];
  inputKinds: (typeof LIVE_RESERVE_ADAPTER_PRIMARY_INPUT_KINDS)[LiveReserveAdapterKey];
  paramsSchema: (typeof adapterParamsSchemas)[LiveReserveAdapterKey];
};

export const LIVE_RESERVE_ADAPTER_REGISTRY = Object.fromEntries(
  LIVE_RESERVE_ADAPTER_KEYS.map((adapterKey) => [
    adapterKey,
    {
      definition: LIVE_RESERVE_ADAPTER_DEFINITIONS[adapterKey],
      inputKinds: LIVE_RESERVE_ADAPTER_PRIMARY_INPUT_KINDS[adapterKey],
      paramsSchema: adapterParamsSchemas[adapterKey],
    },
  ]),
) as Record<LiveReserveAdapterKey, LiveReserveAdapterRegistryEntry>;

export const LIVE_RESERVE_ADAPTER_REGISTRY_ENTRIES = LIVE_RESERVE_ADAPTER_KEYS.map((adapterKey) => ({
  adapterKey,
  ...LIVE_RESERVE_ADAPTER_REGISTRY[adapterKey],
}));
