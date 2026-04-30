import { API_PATHS } from "@shared/lib/api-endpoints";
import { API_FRESHNESS_MAX_AGE_SEC } from "@shared/lib/api-freshness";
import {
  StablecoinListResponseSchema,
  type StablecoinListResponse,
} from "@shared/types";
import { CRON_15MIN } from "@/lib/cron-intervals";
import { useApiQueryWithMeta } from "./use-api-query";

export function useStablecoins() {
  return useApiQueryWithMeta<StablecoinListResponse>(
    ["stablecoins"],
    API_PATHS.stablecoins(),
    CRON_15MIN,
    {
      schema: StablecoinListResponseSchema,
      metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.stablecoins,
    },
  );
}
