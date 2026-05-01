"use client";

import { useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePegSummary, useReportCards, useStabilityIndexDetail, useStressSignals } from "@/hooks/api-hooks";
import { useChains } from "@/hooks/use-chains";
import { useStablecoins } from "@/hooks/use-stablecoins";
import type { ApiMeta } from "@/lib/api";
import type {
  PegSummaryResponse,
  ReportCardsResponse,
  StablecoinListResponse,
  StabilityIndexResponse,
  StressSignalsAllResponse,
} from "@shared/types";
import type { ChainsResponse } from "@shared/types/chains";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import type { PharosVilleWorld as PharosVilleWorldModel, RouteMode } from "../systems/world-types";

interface WorldInputData {
  stablecoins: StablecoinListResponse | null | undefined;
  chains: ChainsResponse | null | undefined;
  stability: StabilityIndexResponse | null | undefined;
  pegSummary: PegSummaryResponse | null | undefined;
  stress: StressSignalsAllResponse | null | undefined;
  reportCards: ReportCardsResponse | null | undefined;
}

export interface PharosVilleWorldDataResult {
  world: PharosVilleWorldModel;
  error: Error | null;
  hasRenderableData: boolean;
  refetchAll: () => void;
}

function isMetaStale(meta: ApiMeta | null | undefined): boolean {
  return meta?.status === "stale" || meta?.status === "degraded";
}

function hasCompleteData(input: WorldInputData): boolean {
  return Boolean(
    input.stablecoins
      && input.chains
      && input.stability
      && input.pegSummary
      && input.stress
      && input.reportCards,
  );
}

function resolveRouteMode(input: {
  hasAnyData: boolean;
  hasBlockingError: boolean;
  isLoading: boolean;
}): RouteMode {
  if (input.hasBlockingError && !input.hasAnyData) return "error";
  if (input.isLoading && !input.hasAnyData) return "loading";
  return "world";
}

const PHAROSVILLE_QUERY_KEY_ROOTS = new Set<string>([
  "stablecoins",
  "chains",
  "stability-index-detail",
  "peg-summary",
  "stress-signals",
  "report-cards",
]);

export function usePharosVilleWorldData(): PharosVilleWorldDataResult {
  const stablecoinsQuery = useStablecoins();
  const chainsQuery = useChains();
  const stabilityQuery = useStabilityIndexDetail();
  const pegSummaryQuery = usePegSummary();
  const stressQuery = useStressSignals();
  const reportCardsQuery = useReportCards();

  const error = stablecoinsQuery.error
    ?? chainsQuery.error
    ?? stabilityQuery.error
    ?? pegSummaryQuery.error
    ?? stressQuery.error
    ?? reportCardsQuery.error;

  const hasAnyData = Boolean(
    stablecoinsQuery.data
      || chainsQuery.data
      || stabilityQuery.data
      || pegSummaryQuery.data
      || stressQuery.data
      || reportCardsQuery.data,
  );

  const isLoading = stablecoinsQuery.isLoading
    || chainsQuery.isLoading
    || stabilityQuery.isLoading
    || pegSummaryQuery.isLoading
    || stressQuery.isLoading
    || reportCardsQuery.isLoading;

  const currentHasCompleteData = hasCompleteData({
    stablecoins: stablecoinsQuery.data,
    chains: chainsQuery.data,
    stability: stabilityQuery.data,
    pegSummary: pegSummaryQuery.data,
    stress: stressQuery.data,
    reportCards: reportCardsQuery.data,
  });

  const initialQueryWaveSettled = !isLoading;
  const canPublishCurrentPayloads = currentHasCompleteData || initialQueryWaveSettled;
  const routeMode = canPublishCurrentPayloads
    ? resolveRouteMode({ hasAnyData, hasBlockingError: Boolean(error), isLoading })
    : "loading";

  const publishedData: WorldInputData = {
    stablecoins: canPublishCurrentPayloads ? stablecoinsQuery.data : undefined,
    chains: canPublishCurrentPayloads ? chainsQuery.data : undefined,
    stability: canPublishCurrentPayloads ? stabilityQuery.data : undefined,
    pegSummary: canPublishCurrentPayloads ? pegSummaryQuery.data : undefined,
    stress: canPublishCurrentPayloads ? stressQuery.data : undefined,
    reportCards: canPublishCurrentPayloads ? reportCardsQuery.data : undefined,
  };

  const stablecoinsStale = isMetaStale(stablecoinsQuery.meta);
  const chainsStale = isMetaStale(chainsQuery.meta);
  const stabilityStale = isMetaStale(stabilityQuery.meta);
  const pegSummaryStale = isMetaStale(pegSummaryQuery.meta);
  const stressStale = isMetaStale(stressQuery.meta);
  const reportCardsStale = isMetaStale(reportCardsQuery.meta);

  const completeWorldRef = useRef<PharosVilleWorldModel | null>(null);

  const world = useMemo<PharosVilleWorldModel>(() => {
    // Hold the last complete "world"-mode build during transient incomplete passes.
    if (!canPublishCurrentPayloads && completeWorldRef.current) {
      return completeWorldRef.current;
    }
    const built = buildPharosVilleWorld({
      stablecoins: publishedData.stablecoins,
      chains: publishedData.chains,
      stability: publishedData.stability,
      pegSummary: publishedData.pegSummary,
      stress: publishedData.stress,
      reportCards: publishedData.reportCards,
      routeMode,
      freshness: {
        stablecoinsStale,
        chainsStale,
        stabilityStale,
        pegSummaryStale,
        stressStale,
        reportCardsStale,
      },
    });
    if (canPublishCurrentPayloads && currentHasCompleteData && routeMode === "world") {
      completeWorldRef.current = built;
    }
    return built;
    // TanStack Query returns stable `data` references when content hasn't changed,
    // so this memo will hit reliably across re-renders.
  }, [
    publishedData.stablecoins,
    publishedData.chains,
    publishedData.stability,
    publishedData.pegSummary,
    publishedData.stress,
    publishedData.reportCards,
    routeMode,
    stablecoinsStale,
    chainsStale,
    stabilityStale,
    pegSummaryStale,
    stressStale,
    reportCardsStale,
    canPublishCurrentPayloads,
    currentHasCompleteData,
  ]);

  const queryClient = useQueryClient();
  const refetchAll = useCallback(() => {
    void queryClient.refetchQueries({
      predicate: (query) => {
        const root = query.queryKey[0];
        return typeof root === "string" && PHAROSVILLE_QUERY_KEY_ROOTS.has(root);
      },
    });
  }, [queryClient]);

  return {
    world,
    error,
    hasRenderableData: world.ships.length > 0 || world.docks.length > 0,
    refetchAll,
  };
}
