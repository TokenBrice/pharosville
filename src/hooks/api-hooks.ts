import { usePharosVilleEndpointQuery } from "./use-api-query";

export function usePegSummary() {
  return usePharosVilleEndpointQuery("pegSummary");
}

export function useSafetyGrades() {
  return usePharosVilleEndpointQuery("safetyGrades");
}

export function useStabilityIndexDetail() {
  return usePharosVilleEndpointQuery("stability");
}

export function useStressSignals() {
  return usePharosVilleEndpointQuery("stress");
}

export function useMintBurnFlows() {
  return usePharosVilleEndpointQuery("mintBurn");
}
