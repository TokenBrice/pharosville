"use client";

import { useCallback, useRef } from "react";
import { usePegSummary, useReportCards, useStabilityIndexDetail, useStressSignals } from "@/hooks/api-hooks";
import { useChains } from "@/hooks/use-chains";
import { useStablecoins } from "@/hooks/use-stablecoins";
import type { ApiMeta } from "@/lib/api";
import { structuralFingerprint } from "@/lib/structural-hash";
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

function metaFingerprint(meta: ApiMeta | null | undefined): { updatedAt: number | null; status: ApiMeta["status"] | null } {
  return {
    updatedAt: meta?.updatedAt ?? null,
    status: meta?.status ?? null,
  };
}

function worldFingerprint(input: {
  routeMode: RouteMode;
  data: WorldInputData;
  meta: {
    stablecoins: ApiMeta | null;
    chains: ApiMeta | null;
    stability: ApiMeta | null;
    pegSummary: ApiMeta | null;
    stress: ApiMeta | null;
    reportCards: ApiMeta | null;
  };
}): string {
  return structuralFingerprint({
    routeMode: input.routeMode,
    stablecoins: {
      meta: metaFingerprint(input.meta.stablecoins),
      data: input.data.stablecoins ?? null,
    },
    chains: {
      meta: metaFingerprint(input.meta.chains),
      data: input.data.chains ?? null,
    },
    stability: {
      meta: metaFingerprint(input.meta.stability),
      data: input.data.stability ?? null,
    },
    pegSummary: {
      meta: metaFingerprint(input.meta.pegSummary),
      data: input.data.pegSummary ?? null,
    },
    stress: {
      meta: metaFingerprint(input.meta.stress),
      data: input.data.stress ?? null,
    },
    reportCards: {
      meta: metaFingerprint(input.meta.reportCards),
      data: input.data.reportCards ?? null,
    },
  }, {
    // Endpoint payloads are set-like snapshots for world construction.
    arrayOrder: "unordered",
  });
}

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

  const hash = worldFingerprint({
    routeMode,
    data: publishedData,
    meta: {
      stablecoins: canPublishCurrentPayloads ? stablecoinsQuery.meta : null,
      chains: canPublishCurrentPayloads ? chainsQuery.meta : null,
      stability: canPublishCurrentPayloads ? stabilityQuery.meta : null,
      pegSummary: canPublishCurrentPayloads ? pegSummaryQuery.meta : null,
      stress: canPublishCurrentPayloads ? stressQuery.meta : null,
      reportCards: canPublishCurrentPayloads ? reportCardsQuery.meta : null,
    },
  });

  const worldCacheRef = useRef<{ hash: string; world: PharosVilleWorldModel } | null>(null);
  const completeWorldRef = useRef<PharosVilleWorldModel | null>(null);

  let world: PharosVilleWorldModel;
  if (!canPublishCurrentPayloads && completeWorldRef.current) {
    world = completeWorldRef.current;
  } else if (worldCacheRef.current && worldCacheRef.current.hash === hash) {
    world = worldCacheRef.current.world;
  } else {
    world = buildPharosVilleWorld({
      stablecoins: publishedData.stablecoins,
      chains: publishedData.chains,
      stability: publishedData.stability,
      pegSummary: publishedData.pegSummary,
      stress: publishedData.stress,
      reportCards: publishedData.reportCards,
      routeMode,
      freshness: {
        stablecoinsStale: isMetaStale(stablecoinsQuery.meta),
        chainsStale: isMetaStale(chainsQuery.meta),
        stabilityStale: isMetaStale(stabilityQuery.meta),
        pegSummaryStale: isMetaStale(pegSummaryQuery.meta),
        stressStale: isMetaStale(stressQuery.meta),
        reportCardsStale: isMetaStale(reportCardsQuery.meta),
      },
    });

    worldCacheRef.current = { hash, world };
    if (currentHasCompleteData && routeMode === "world") {
      completeWorldRef.current = world;
    }
  }

  const refetchAll = useCallback(() => {
    void stablecoinsQuery.refetch();
    void chainsQuery.refetch();
    void stabilityQuery.refetch();
    void pegSummaryQuery.refetch();
    void stressQuery.refetch();
    void reportCardsQuery.refetch();
  }, [
    chainsQuery,
    pegSummaryQuery,
    reportCardsQuery,
    stabilityQuery,
    stablecoinsQuery,
    stressQuery,
  ]);

  return {
    world,
    error,
    hasRenderableData: world.ships.length > 0 || world.docks.length > 0,
    refetchAll,
  };
}
