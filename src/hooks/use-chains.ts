import { API_PATHS } from "@shared/lib/api-endpoints";
import { API_FRESHNESS_MAX_AGE_SEC } from "@shared/lib/api-freshness";
import { ChainsResponseSchema, type ChainsResponse } from "@shared/types/chains";
import { CRON_15MIN } from "@/lib/cron-intervals";
import { useApiQueryWithMeta } from "./use-api-query";

export function useChains() {
  return useApiQueryWithMeta<ChainsResponse>(
    ["chains"],
    API_PATHS.chains(),
    CRON_15MIN,
    {
      schema: ChainsResponseSchema,
      metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.chains,
    },
  );
}
