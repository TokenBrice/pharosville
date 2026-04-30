import type { PharosVilleApiEndpointKey } from "../types/pharosville";

export const PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY = {
  stablecoins: "/api/stablecoins",
  chains: "/api/chains",
  stability: "/api/stability-index?detail=true",
  pegSummary: "/api/peg-summary",
  stress: "/api/stress-signals",
  reportCards: "/api/report-cards",
} as const satisfies Record<PharosVilleApiEndpointKey, string>;

export const PHAROSVILLE_API_ENDPOINT_PATHS = Object.values(
  PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY,
) as readonly string[];
