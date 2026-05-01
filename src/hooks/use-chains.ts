import { PHAROSVILLE_API_CLIENT_CONTRACT } from "@shared/lib/pharosville-api-client-contract";
import { type ChainsResponse } from "@shared/types/chains";
import { useApiQueryWithMeta } from "./use-api-query";

export function useChains() {
  const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT.chains;
  return useApiQueryWithMeta<ChainsResponse>(
    endpoint.queryKey,
    endpoint.path,
    endpoint.producerIntervalSec * 1000,
    {
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}
