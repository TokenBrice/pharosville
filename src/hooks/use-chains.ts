import { usePharosVilleEndpointQuery } from "./use-api-query";

export function useChains() {
  return usePharosVilleEndpointQuery("chains");
}
