import { PHAROSVILLE_API_CLIENT_CONTRACT } from "@shared/lib/pharosville-api-client-contract";
import {
  type StablecoinListResponse,
} from "@shared/types";
import { useApiQueryWithMeta } from "./use-api-query";

export function useStablecoins() {
  const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT.stablecoins;
  return useApiQueryWithMeta<StablecoinListResponse>(
    endpoint.queryKey,
    endpoint.path,
    endpoint.producerIntervalSec * 1000,
    {
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}
