import { API_PATHS } from "@shared/lib/api-endpoints";
import { API_FRESHNESS_MAX_AGE_SEC } from "@shared/lib/api-freshness";
import {
  PegSummaryResponseSchema,
  ReportCardsResponseSchema,
  StabilityIndexResponseSchema,
  StressSignalsAllResponseSchema,
  type PegSummaryResponse,
  type ReportCardsResponse,
  type StabilityIndexResponse,
  type StressSignalsAllResponse,
} from "@shared/types";
import { CRON_15MIN, CRON_30MIN } from "@/lib/cron-intervals";
import { useApiQueryWithMeta } from "./use-api-query";

export function usePegSummary() {
  return useApiQueryWithMeta<PegSummaryResponse>(
    ["peg-summary"],
    API_PATHS.pegSummary(),
    CRON_15MIN,
    {
      schema: PegSummaryResponseSchema,
      metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.pegSummary,
    },
  );
}

export function useReportCards() {
  return useApiQueryWithMeta<ReportCardsResponse>(
    ["report-cards"],
    API_PATHS.reportCards(),
    CRON_15MIN,
    {
      schema: ReportCardsResponseSchema,
      metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.reportCards,
    },
  );
}

export function useStabilityIndexDetail() {
  return useApiQueryWithMeta<StabilityIndexResponse>(
    ["stability-index-detail"],
    API_PATHS.stabilityIndex(true),
    CRON_30MIN,
    {
      schema: StabilityIndexResponseSchema,
      metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.stabilityIndex,
    },
  );
}

export function useStressSignals() {
  return useApiQueryWithMeta<StressSignalsAllResponse>(
    ["stress-signals"],
    API_PATHS.stressSignals(),
    CRON_30MIN,
    {
      schema: StressSignalsAllResponseSchema,
      metaMaxAgeSec: API_FRESHNESS_MAX_AGE_SEC.stressSignals,
    },
  );
}
