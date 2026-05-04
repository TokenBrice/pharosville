import type { PharosVilleApiEndpointKey } from "../types/pharosville";
import {
  PHAROSVILLE_ENDPOINT_REGISTRY,
  PHAROSVILLE_ENDPOINT_REGISTRY_LIST,
  type PharosVilleEndpointRegistryEntry,
} from "./pharosville-endpoint-registry";

// Type alias rather than empty-extending interface — same shape, satisfies
// @typescript-eslint/no-empty-object-type. Renamed call sites stay typed
// since the alias is structurally identical.
export type PharosVilleApiClientEndpoint<K extends PharosVilleApiEndpointKey = PharosVilleApiEndpointKey>
  = PharosVilleEndpointRegistryEntry<K>;

export const PHAROSVILLE_API_CLIENT_CONTRACT = PHAROSVILLE_ENDPOINT_REGISTRY satisfies {
  [K in PharosVilleApiEndpointKey]: PharosVilleApiClientEndpoint<K>;
};

export const PHAROSVILLE_API_CLIENT_ENDPOINTS = PHAROSVILLE_ENDPOINT_REGISTRY_LIST as readonly PharosVilleApiClientEndpoint[];
