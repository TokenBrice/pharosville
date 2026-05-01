import { usePharosVilleEndpointQuery } from "./use-api-query";

export function useStablecoins() {
  return usePharosVilleEndpointQuery("stablecoins");
}
