import type { PharosVilleApiEndpointKey } from "../types/pharosville";
import {
  PHAROSVILLE_ENDPOINT_REGISTRY,
  PHAROSVILLE_ENDPOINT_REGISTRY_LIST,
  type PharosVilleEndpointRegistryEntry,
} from "./pharosville-endpoint-registry";

export interface PharosVilleApiClientEndpoint<K extends PharosVilleApiEndpointKey = PharosVilleApiEndpointKey>
  extends PharosVilleEndpointRegistryEntry<K> {}

export const PHAROSVILLE_API_CLIENT_CONTRACT = PHAROSVILLE_ENDPOINT_REGISTRY satisfies {
  [K in PharosVilleApiEndpointKey]: PharosVilleApiClientEndpoint<K>;
};

export const PHAROSVILLE_API_CLIENT_ENDPOINTS = PHAROSVILLE_ENDPOINT_REGISTRY_LIST as readonly PharosVilleApiClientEndpoint[];
