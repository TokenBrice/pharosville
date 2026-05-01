import { usePharosVilleEndpointQuery } from "./use-api-query";

export function usePegSummary() {
  return usePharosVilleEndpointQuery("pegSummary");
}

export function useReportCards() {
  return usePharosVilleEndpointQuery("reportCards");
}

export function useStabilityIndexDetail() {
  return usePharosVilleEndpointQuery("stability");
}

export function useStressSignals() {
  return usePharosVilleEndpointQuery("stress");
}
