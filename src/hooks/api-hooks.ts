import { PHAROSVILLE_API_CONTRACT } from "@shared/lib/pharosville-api-contract";
import {
  type PegSummaryResponse,
  type ReportCardsResponse,
  type StabilityIndexResponse,
  type StressSignalsAllResponse,
} from "@shared/types";
import { CRON_15MIN, CRON_30MIN } from "@/lib/cron-intervals";
import { useApiQueryWithMeta } from "./use-api-query";

export function usePegSummary() {
  const endpoint = PHAROSVILLE_API_CONTRACT.pegSummary;
  return useApiQueryWithMeta<PegSummaryResponse>(
    ["peg-summary"],
    endpoint.path,
    CRON_15MIN,
    {
      schema: endpoint.schema,
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}

export function useReportCards() {
  const endpoint = PHAROSVILLE_API_CONTRACT.reportCards;
  return useApiQueryWithMeta<ReportCardsResponse>(
    ["report-cards"],
    endpoint.path,
    CRON_15MIN,
    {
      schema: endpoint.schema,
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}

export function useStabilityIndexDetail() {
  const endpoint = PHAROSVILLE_API_CONTRACT.stability;
  return useApiQueryWithMeta<StabilityIndexResponse>(
    ["stability-index-detail"],
    endpoint.path,
    CRON_30MIN,
    {
      schema: endpoint.schema,
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}

export function useStressSignals() {
  const endpoint = PHAROSVILLE_API_CONTRACT.stress;
  return useApiQueryWithMeta<StressSignalsAllResponse>(
    ["stress-signals"],
    endpoint.path,
    CRON_30MIN,
    {
      schema: endpoint.schema,
      metaMaxAgeSec: endpoint.metaMaxAgeSec,
    },
  );
}
