import { PHAROSVILLE_API_CONTRACT } from "@shared/lib/pharosville-api-contract";
import { type ChainsResponse } from "@shared/types/chains";
import { CRON_15MIN } from "@/lib/cron-intervals";
import { useApiQueryWithMeta } from "./use-api-query";

export function useChains() {
  const endpoint = PHAROSVILLE_API_CONTRACT.chains;
  return useApiQueryWithMeta<ChainsResponse>(
    ["chains"],
    endpoint.path,
    CRON_15MIN,
    {
      schema: endpoint.schema,
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}
