import { PHAROSVILLE_API_CONTRACT } from "@shared/lib/pharosville-api-contract";
import {
  type StablecoinListResponse,
} from "@shared/types";
import { CRON_15MIN } from "@/lib/cron-intervals";
import { useApiQueryWithMeta } from "./use-api-query";

export function useStablecoins() {
  const endpoint = PHAROSVILLE_API_CONTRACT.stablecoins;
  return useApiQueryWithMeta<StablecoinListResponse>(
    ["stablecoins"],
    endpoint.path,
    CRON_15MIN,
    {
      schema: endpoint.schema,
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}
