import { PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY } from "./pharosville-api-endpoints";
import type { PharosVilleApiEndpointKey } from "../types/pharosville";

const PHAROSVILLE_API_CLIENT_META_MAX_AGE_SEC = {
  stablecoins: 600,
  chains: 1800,
  stability: 86400,
  pegSummary: 900,
  stress: 1800,
  reportCards: 900,
} as const;

const PHAROSVILLE_API_CLIENT_PRODUCER_INTERVAL_SEC = {
  stablecoins: 900,
  chains: 900,
  stability: 1800,
  pegSummary: 900,
  stress: 1800,
  reportCards: 900,
} as const;

export interface PharosVilleApiClientEndpoint<K extends PharosVilleApiEndpointKey = PharosVilleApiEndpointKey> {
  key: K;
  path: string;
  queryKey: readonly string[];
  metaMaxAgeSec: number;
  producerIntervalSec: number;
}

export const PHAROSVILLE_API_CLIENT_CONTRACT = {
  stablecoins: {
    key: "stablecoins",
    path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stablecoins,
    queryKey: ["stablecoins"],
    metaMaxAgeSec: PHAROSVILLE_API_CLIENT_META_MAX_AGE_SEC.stablecoins,
    producerIntervalSec: PHAROSVILLE_API_CLIENT_PRODUCER_INTERVAL_SEC.stablecoins,
  },
  chains: {
    key: "chains",
    path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.chains,
    queryKey: ["chains"],
    metaMaxAgeSec: PHAROSVILLE_API_CLIENT_META_MAX_AGE_SEC.chains,
    producerIntervalSec: PHAROSVILLE_API_CLIENT_PRODUCER_INTERVAL_SEC.chains,
  },
  stability: {
    key: "stability",
    path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stability,
    queryKey: ["stability-index-detail"],
    metaMaxAgeSec: PHAROSVILLE_API_CLIENT_META_MAX_AGE_SEC.stability,
    producerIntervalSec: PHAROSVILLE_API_CLIENT_PRODUCER_INTERVAL_SEC.stability,
  },
  pegSummary: {
    key: "pegSummary",
    path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.pegSummary,
    queryKey: ["peg-summary"],
    metaMaxAgeSec: PHAROSVILLE_API_CLIENT_META_MAX_AGE_SEC.pegSummary,
    producerIntervalSec: PHAROSVILLE_API_CLIENT_PRODUCER_INTERVAL_SEC.pegSummary,
  },
  stress: {
    key: "stress",
    path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stress,
    queryKey: ["stress-signals"],
    metaMaxAgeSec: PHAROSVILLE_API_CLIENT_META_MAX_AGE_SEC.stress,
    producerIntervalSec: PHAROSVILLE_API_CLIENT_PRODUCER_INTERVAL_SEC.stress,
  },
  reportCards: {
    key: "reportCards",
    path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.reportCards,
    queryKey: ["report-cards"],
    metaMaxAgeSec: PHAROSVILLE_API_CLIENT_META_MAX_AGE_SEC.reportCards,
    producerIntervalSec: PHAROSVILLE_API_CLIENT_PRODUCER_INTERVAL_SEC.reportCards,
  },
} as const satisfies {
  [K in PharosVilleApiEndpointKey]: PharosVilleApiClientEndpoint<K>;
};

export const PHAROSVILLE_API_CLIENT_ENDPOINTS = Object.values(
  PHAROSVILLE_API_CLIENT_CONTRACT,
) as readonly PharosVilleApiClientEndpoint[];
