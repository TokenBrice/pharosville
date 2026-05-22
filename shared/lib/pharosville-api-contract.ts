import type { ZodType } from "zod";
import {
  PHAROSVILLE_API_ENDPOINT_KEYS,
  PHAROSVILLE_API_PAYLOAD_SCHEMAS,
  type PharosVilleApiEndpointKey,
  type PharosVilleApiPayload,
} from "../types/pharosville";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "./pharosville-endpoint-registry";

export interface PharosVilleApiEndpoint<K extends PharosVilleApiEndpointKey = PharosVilleApiEndpointKey> {
  key: K;
  path: string;
  queryKey: readonly string[];
  schema: ZodType<PharosVilleApiPayload<K>>;
  metaMaxAgeSec: number;
  producerIntervalSec: number;
}

function endpointWithSchema<K extends PharosVilleApiEndpointKey>(key: K): PharosVilleApiEndpoint<K> {
  return ({
    ...PHAROSVILLE_ENDPOINT_REGISTRY[key],
    schema: PHAROSVILLE_API_PAYLOAD_SCHEMAS[key] as unknown as ZodType<PharosVilleApiPayload<K>>,
  } as unknown) as PharosVilleApiEndpoint<K>;
}

export const PHAROSVILLE_API_CONTRACT = Object.freeze(
  Object.fromEntries(
    PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => [key, endpointWithSchema(key)]),
  ),
) as {
  readonly [K in PharosVilleApiEndpointKey]: PharosVilleApiEndpoint<K>;
};

export const PHAROSVILLE_API_ENDPOINTS = PHAROSVILLE_API_ENDPOINT_KEYS.map(
  (key) => PHAROSVILLE_API_CONTRACT[key],
);
