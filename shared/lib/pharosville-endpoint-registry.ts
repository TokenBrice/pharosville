import { PHAROSVILLE_API_ENDPOINT_KEYS, type PharosVilleApiEndpointKey } from "../types/pharosville";
import { API_FRESHNESS_MAX_AGE_SEC } from "./api-freshness";
import { API_PATHS } from "./api-endpoints/paths";
// NFS4 #4: import cadence from the curated client map instead of `cron-jobs.ts`
// so the desktop chunk never pulls the full server-only cron job catalog.
import { CRON_INTERVALS_CLIENT as CRON_INTERVALS } from "./cron-intervals-client";

export interface PharosVilleEndpointRegistryEntry<K extends PharosVilleApiEndpointKey = PharosVilleApiEndpointKey> {
  key: K;
  path: string;
  queryKey: readonly string[];
  metaMaxAgeSec: number;
  producerIntervalSec: number;
}

export const PHAROSVILLE_ENDPOINT_REGISTRY = {
  stablecoins: {
    key: "stablecoins",
    path: API_PATHS.stablecoins(),
    queryKey: ["stablecoins"],
    metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.stablecoins,
    producerIntervalSec: CRON_INTERVALS["sync-stablecoins"],
  },
  chains: {
    key: "chains",
    path: API_PATHS.chains(),
    queryKey: ["chains"],
    metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.chains,
    producerIntervalSec: CRON_INTERVALS["sync-stablecoins"],
  },
  stability: {
    key: "stability",
    path: API_PATHS.stabilityIndex(true),
    queryKey: ["stability-index-detail"],
    metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.stabilityIndex,
    producerIntervalSec: CRON_INTERVALS["stability-index"],
  },
  pegSummary: {
    key: "pegSummary",
    path: API_PATHS.pegSummary(),
    queryKey: ["peg-summary"],
    metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.pegSummary,
    producerIntervalSec: CRON_INTERVALS["sync-stablecoins"],
  },
  stress: {
    key: "stress",
    path: API_PATHS.stressSignals(),
    queryKey: ["stress-signals"],
    metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.stressSignals,
    producerIntervalSec: CRON_INTERVALS["compute-dews"],
  },
  reportCards: {
    key: "reportCards",
    path: API_PATHS.reportCards(),
    queryKey: ["report-cards"],
    metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.reportCards,
    producerIntervalSec: CRON_INTERVALS["publish-report-card-cache"],
  },
} as const satisfies {
  [K in PharosVilleApiEndpointKey]: PharosVilleEndpointRegistryEntry<K>;
};

export const PHAROSVILLE_ENDPOINT_REGISTRY_LIST = PHAROSVILLE_API_ENDPOINT_KEYS.map(
  (key) => PHAROSVILLE_ENDPOINT_REGISTRY[key],
) as readonly PharosVilleEndpointRegistryEntry[];

export const PHAROSVILLE_ENDPOINT_PATHS_BY_KEY = Object.freeze(
  Object.fromEntries(
    PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => [key, PHAROSVILLE_ENDPOINT_REGISTRY[key].path]),
  ) as Record<PharosVilleApiEndpointKey, string>,
);

export const PHAROSVILLE_ENDPOINT_PATHS = PHAROSVILLE_ENDPOINT_REGISTRY_LIST.map(
  (endpoint) => endpoint.path,
) as readonly string[];
