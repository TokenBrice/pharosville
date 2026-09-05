"use client";

// react-hooks/refs flags `completeWorldRef.current` accesses inside the
// `useMemo` body as render-time. The ref is a deliberately mutable holdover
// for the "last complete world" pattern across transient incomplete passes;
// disable the rule for this file (the discipline is enforced by review).
/* eslint-disable react-hooks/refs */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PHAROSVILLE_WORLD_QUERY_KEY_ROOTS } from "@shared/lib/pharosville-endpoint-registry";
import {
  useMintBurnFlows,
  usePegSummary,
  useReportCards,
  useStabilityIndexDetail,
  useStressSignals,
} from "@/hooks/api-hooks";
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
import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";
import { reportClientError } from "../error-reporter";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import type { PharosVilleWorld as PharosVilleWorldModel, RouteMode } from "../systems/world-types";

interface WorldInputData {
  stablecoins: StablecoinListResponse | null | undefined;
  chains: ChainsResponse | null | undefined;
  stability: StabilityIndexResponse | null | undefined;
  pegSummary: PegSummaryResponse | null | undefined;
  stress: StressSignalsAllResponse | null | undefined;
  reportCards: ReportCardsResponse | null | undefined;
  mintBurn: MintBurnFlowsResponse | null | undefined;
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
      && input.reportCards
      && input.mintBurn,
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

/**
 * How long the enrichment feeds get to arrive alongside the essentials before
 * the harbour opens without them. Long enough that the common case (all six
 * land together) publishes once, short enough that a stuck feed is not worth
 * staring at an empty sea for.
 */
const ENRICHMENT_GRACE_MS = 1_500;

const PHAROSVILLE_QUERY_KEY_ROOTS = new Set<string>(PHAROSVILLE_WORLD_QUERY_KEY_ROOTS);

export function usePharosVilleWorldData(): PharosVilleWorldDataResult {
  const stablecoinsQuery = useStablecoins();
  const chainsQuery = useChains();
  const stabilityQuery = useStabilityIndexDetail();
  const pegSummaryQuery = usePegSummary();
  const stressQuery = useStressSignals();
  const reportCardsQuery = useReportCards();
  const mintBurnQuery = useMintBurnFlows();

  const error = stablecoinsQuery.error
    ?? chainsQuery.error
    ?? stabilityQuery.error
    ?? pegSummaryQuery.error
    ?? stressQuery.error
    ?? reportCardsQuery.error
    ?? mintBurnQuery.error;

  // Query errors are swallowed by TanStack Query, so a feed that exhausts its
  // retries is invisible to the window handlers. The message doubles as the
  // dedupe key: a retry that fails the same way builds a fresh Error object
  // every time, and only the first one is worth a report.
  useEffect(() => {
    if (!error) return;
    reportClientError("data-load", {
      kind: "world-data",
      message: error.message,
      stack: error.stack?.slice(0, 2_000),
    }, error.message);
  }, [error]);

  const hasAnyData = Boolean(
    stablecoinsQuery.data
      || chainsQuery.data
      || stabilityQuery.data
      || pegSummaryQuery.data
      || stressQuery.data
      || reportCardsQuery.data
      || mintBurnQuery.data,
  );

  const isLoading = stablecoinsQuery.isLoading
    || chainsQuery.isLoading
    || stabilityQuery.isLoading
    || pegSummaryQuery.isLoading
    || stressQuery.isLoading
    || reportCardsQuery.isLoading
    || mintBurnQuery.isLoading;

  const currentHasCompleteData = hasCompleteData({
    stablecoins: stablecoinsQuery.data,
    chains: chainsQuery.data,
    stability: stabilityQuery.data,
    pegSummary: pegSummaryQuery.data,
    stress: stressQuery.data,
    reportCards: reportCardsQuery.data,
    mintBurn: mintBurnQuery.data,
  });

  const initialQueryWaveSettled = !isLoading;
  // The harbour needs stablecoins to have a fleet at all, and chains to have
  // docks to berth it at. The other four only ENRICH what is already there:
  // PSI drives the lighthouse band, peg and stress colour the placement, report
  // cards shape the hulls. A world without them is a real, readable harbour.
  //
  // Waiting for all six meant one slow feed held everything. Measured against
  // the live API, `/api/stablecoins` returned a 502 after 8s; with the client's
  // two retries and their backoff, a single bad enrichment feed can hold an
  // EMPTY SEA for ten seconds while five good payloads sit in memory.
  //
  // So: once the essentials are in, the enrichers get a short grace window to
  // arrive together — which is the common case, and avoids publishing twice —
  // and after that the harbour opens without them and they fold in when they
  // land.
  const hasEssentialPayloads = Boolean(stablecoinsQuery.data && chainsQuery.data);
  const [enrichmentGraceExpired, setEnrichmentGraceExpired] = useState(false);
  useEffect(() => {
    if (!hasEssentialPayloads || currentHasCompleteData) return;
    const id = window.setTimeout(() => setEnrichmentGraceExpired(true), ENRICHMENT_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [currentHasCompleteData, hasEssentialPayloads]);
  const canPublishCurrentPayloads = currentHasCompleteData
    || initialQueryWaveSettled
    || (hasEssentialPayloads && enrichmentGraceExpired);
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
    mintBurn: canPublishCurrentPayloads ? mintBurnQuery.data : undefined,
  };

  const stablecoinsStale = isMetaStale(stablecoinsQuery.meta);
  const chainsStale = isMetaStale(chainsQuery.meta);
  const stabilityStale = isMetaStale(stabilityQuery.meta);
  const pegSummaryStale = isMetaStale(pegSummaryQuery.meta);
  const stressStale = isMetaStale(stressQuery.meta);
  const reportCardsStale = isMetaStale(reportCardsQuery.meta);
  const mintBurnStale = isMetaStale(mintBurnQuery.meta);

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
      mintBurn: publishedData.mintBurn,
      routeMode,
      freshness: {
        stablecoinsStale,
        chainsStale,
        stabilityStale,
        pegSummaryStale,
        stressStale,
        reportCardsStale,
        mintBurnStale,
      },
    });
    if (canPublishCurrentPayloads && currentHasCompleteData && routeMode === "world") {
      completeWorldRef.current = built;
    }
    return built;
  }, [
    canPublishCurrentPayloads, currentHasCompleteData, routeMode,
    publishedData.stablecoins, publishedData.chains, publishedData.stability,
    publishedData.pegSummary, publishedData.stress, publishedData.reportCards, publishedData.mintBurn,
    stablecoinsStale, chainsStale, stabilityStale, pegSummaryStale, stressStale, reportCardsStale, mintBurnStale,
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
