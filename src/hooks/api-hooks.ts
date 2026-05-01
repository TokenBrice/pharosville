import { PHAROSVILLE_API_CLIENT_CONTRACT } from "@shared/lib/pharosville-api-client-contract";
import {
  type PegSummaryResponse,
  type ReportCardsResponse,
  type StabilityIndexResponse,
  type StressSignalsAllResponse,
} from "@shared/types";
import { useApiQueryWithMeta } from "./use-api-query";

export function usePegSummary() {
  const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT.pegSummary;
  return useApiQueryWithMeta<PegSummaryResponse>(
    endpoint.queryKey,
    endpoint.path,
    endpoint.producerIntervalSec * 1000,
    {
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}

export function useReportCards() {
  const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT.reportCards;
  return useApiQueryWithMeta<ReportCardsResponse>(
    endpoint.queryKey,
    endpoint.path,
    endpoint.producerIntervalSec * 1000,
    {
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}

export function useStabilityIndexDetail() {
  const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT.stability;
  return useApiQueryWithMeta<StabilityIndexResponse>(
    endpoint.queryKey,
    endpoint.path,
    endpoint.producerIntervalSec * 1000,
    {
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}

export function useStressSignals() {
  const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT.stress;
  return useApiQueryWithMeta<StressSignalsAllResponse>(
    endpoint.queryKey,
    endpoint.path,
    endpoint.producerIntervalSec * 1000,
    {
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}
