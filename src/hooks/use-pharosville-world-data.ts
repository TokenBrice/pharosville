"use client";

// Publication and semantic-status refs retain the last renderable payloads
// across transient query waves without freezing the source-status record.
/* eslint-disable react-hooks/refs */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PHAROSVILLE_ENDPOINT_REGISTRY, PHAROSVILLE_WORLD_QUERY_KEY_ROOTS } from "@shared/lib/pharosville-endpoint-registry";
import { PHAROSVILLE_API_ENDPOINT_KEYS, type PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";
import { classifyFreshnessRatio } from "@shared/lib/status-thresholds";
import { RUNTIME_ACTIVE_IDS, RUNTIME_ACTIVE_META_BY_ID } from "@shared/lib/stablecoins/runtime-registry";
import type { ApiQueryWithMetaResult } from "./use-api-query";
import {
  useMintBurnFlows,
  usePegSummary,
  useSafetyGrades,
  useStabilityIndexDetail,
  useStressSignals,
} from "@/hooks/api-hooks";
import { useChains } from "@/hooks/use-chains";
import { useStablecoins } from "@/hooks/use-stablecoins";
import type {
  PegSummaryResponse,
  SafetyGradesResponse,
  StablecoinListResponse,
  StabilityIndexResponse,
  StressSignalsAllResponse,
} from "@shared/types";
import type { ChainsResponse } from "@shared/types/chains";
import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";
import { reportClientError } from "../error-reporter";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import type { PharosVilleFreshness, PharosVilleSourceCoverage, PharosVilleSourceStatus, PharosVilleWorld as PharosVilleWorldModel, RouteMode } from "../systems/world-types";

interface WorldInputData {
  stablecoins: StablecoinListResponse | null | undefined;
  chains: ChainsResponse | null | undefined;
  stability: StabilityIndexResponse | null | undefined;
  pegSummary: PegSummaryResponse | null | undefined;
  stress: StressSignalsAllResponse | null | undefined;
  safetyGrades: SafetyGradesResponse | null | undefined;
  mintBurn: MintBurnFlowsResponse | null | undefined;
}

export interface PharosVilleWorldDataResult {
  world: PharosVilleWorldModel;
  error: Error | null;
  hasRenderableData: boolean;
  refetchAll: () => void;
}

type SourceQuery = Pick<ApiQueryWithMetaResult<unknown>, "data" | "meta" | "error" | "isLoading" | "isError" | "observedNowMs">;

function epochMs(seconds: number | null | undefined): number | null {
  return seconds != null && Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
}

/** Source summary only; selected rows retain their own evidence in their adapters. */
export function classifyPharosVilleSource(
  key: PharosVilleApiEndpointKey,
  query: SourceQuery,
  payload: WorldInputData[PharosVilleApiEndpointKey] = query.data as WorldInputData[PharosVilleApiEndpointKey],
  expectedIds?: ReadonlySet<string>,
): PharosVilleSourceStatus {
  let observedAt: number | null = null;
  let publishedAt = epochMs(query.meta?.updatedAt);
  let methodologyVersion: string | null = null;
  let coverage: PharosVilleSourceCoverage = { state: "unknown" };
  let sourceReason: string | null = null;
  const rowsCoverage = (ids: readonly string[]): PharosVilleSourceCoverage => {
    const coveredRows = new Set(expectedIds ? ids.filter((id) => expectedIds.has(id)) : ids).size;
    return expectedIds
      ? { state: coveredRows === expectedIds.size ? "complete" : "partial", coveredRows, expectedRows: expectedIds.size }
      : { state: "unknown", coveredRows };
  };
  if (payload) {
    switch (key) {
      case "stablecoins": {
        const data = payload as StablecoinListResponse;
        coverage = { state: "complete", coveredRows: data.peggedAssets.length, expectedRows: data.peggedAssets.length };
        break;
      }
      case "chains": {
        const data = payload as ChainsResponse;
        publishedAt = epochMs(data.updatedAt) ?? publishedAt;
        methodologyVersion = data.healthMethodologyVersion ?? null;
        coverage = { state: "complete", coveredRows: data.chains.length, expectedRows: data.chains.length };
        break;
      }
      case "stability": {
        const data = payload as StabilityIndexResponse;
        observedAt = epochMs(data.current?.computedAt);
        methodologyVersion = data.current?.methodologyVersion ?? null;
        coverage = { state: data.current ? "complete" : "unknown" };
        if (data.current?.inputDegradation?.dewsUnavailable || data.current?.inputDegradation?.depegEventsUnavailable) {
          sourceReason = "PSI inputs degraded";
        }
        break;
      }
      case "pegSummary": {
        const data = payload as PegSummaryResponse;
        coverage = rowsCoverage(data.coins.map((row) => row.id));
        break;
      }
      case "stress": {
        const data = payload as StressSignalsAllResponse;
        const rows = Object.values(data.signals);
        const times = rows.map((row) => epochMs(row.computedAt)).filter((time): time is number => time !== null);
        observedAt = times.length ? Math.min(...times) : null;
        publishedAt = epochMs(data.updatedAt) ?? publishedAt;
        methodologyVersion = rows[0]?.methodologyVersion ?? null;
        coverage = rowsCoverage(Object.keys(data.signals));
        if (data.malformedRows || rows.some((row) => Object.values(row.signals).some((signal) => !signal.available))) {
          coverage = { ...coverage, state: "partial" };
        }
        break;
      }
      case "safetyGrades": {
        const data = payload as SafetyGradesResponse;
        observedAt = epochMs(data.asOfSec);
        publishedAt = epochMs(data.updatedAt) ?? publishedAt;
        methodologyVersion = data.methodologyVersion ?? null;
        coverage = rowsCoverage(data.grades.map((row) => row.id));
        if (data.publicationStatus !== "current") sourceReason = `Grade publication ${data.publicationStatus}`;
        break;
      }
      case "mintBurn": {
        const data = payload as MintBurnFlowsResponse;
        publishedAt = epochMs(data.updatedAt) ?? publishedAt;
        const coveredRows = new Set(data.coins.map((row) => row.stablecoinId)).size;
        const partial = coveredRows !== data.gauge.trackedCoins || data.windowHours != null && data.windowHours !== 24
          || data.coins.some((row) => row.coverage && (row.coverage.isPartial || !row.coverage.has24hWindow || row.coverage.status !== "full"));
        const known = data.windowHours === 24 && coveredRows === data.gauge.trackedCoins
          && data.coins.every((row) => row.coverage?.status === "full" && row.coverage.has24hWindow && !row.coverage.isPartial);
        coverage = {
          state: partial ? "partial" : known ? "complete" : "unknown",
          coveredRows,
          expectedRows: data.gauge.trackedCoins,
          ...(data.windowHours != null ? { windowHours: data.windowHours } : {}),
          ...(data.scope ? { scopeLabel: data.scope.label } : {}),
        };
        if (data.sync && (data.sync.freshnessStatus !== "fresh" || !data.sync.criticalLaneHealthy)) {
          sourceReason = data.sync.warning ?? "Issuance sync degraded";
        }
        break;
      }
    }
  }
  const status = { observedAt, publishedAt, coverage, methodologyVersion };
  const failed = query.isError || Boolean(query.error);
  if (!payload) return {
    ...status,
    state: failed || !query.isLoading ? "unavailable" : "loading",
    reason: failed ? `Fetch failed: ${query.error?.message ?? "query failed"}` : query.isLoading ? null : "No usable payload",
  };
  if (failed) return { ...status, state: "stale", reason: `Refresh failed: ${query.error?.message ?? "query failed"}` };
  if (!query.data && query.isLoading) return { ...status, state: "stale", reason: "Refresh pending; retained sample" };
  if (query.meta?.status === "stale" || query.meta?.status === "degraded" || sourceReason) {
    return { ...status, state: "stale", reason: sourceReason ?? `Source ${query.meta?.status}` };
  }
  const asOf = observedAt ?? publishedAt;
  if (asOf === null) return { ...status, state: "stale", observedAt: null, reason: "age unknown" };
  const ageSec = Math.max(0, (query.observedNowMs - asOf) / 1_000, query.meta?.ageSeconds ?? 0);
  const ageState = classifyFreshnessRatio(ageSec / PHAROSVILLE_ENDPOINT_REGISTRY[key].metaMaxAgeSec);
  return { ...status, state: ageState === "fresh" ? "current" : "stale", reason: ageState === "fresh" ? null : `Source age ${ageState}` };
}

function sameSourceStatus(left: PharosVilleSourceStatus, right: PharosVilleSourceStatus): boolean {
  return left.state === right.state && left.observedAt === right.observedAt && left.publishedAt === right.publishedAt
    && left.methodologyVersion === right.methodologyVersion && left.reason === right.reason
    && left.coverage.state === right.coverage.state && left.coverage.coveredRows === right.coverage.coveredRows
    && left.coverage.expectedRows === right.coverage.expectedRows && left.coverage.windowHours === right.coverage.windowHours
    && left.coverage.scopeLabel === right.coverage.scopeLabel;
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
 * the harbour opens without them. Long enough that the common case (all seven
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
  const safetyGradesQuery = useSafetyGrades();
  const mintBurnQuery = useMintBurnFlows();

  const queries = {
    stablecoins: stablecoinsQuery, chains: chainsQuery, stability: stabilityQuery,
    pegSummary: pegSummaryQuery, stress: stressQuery, safetyGrades: safetyGradesQuery, mintBurn: mintBurnQuery,
  };
  const error = PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => queries[key].error).find((value) => value != null) ?? null;

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

  const hasAnyData = PHAROSVILLE_API_ENDPOINT_KEYS.some((key) => Boolean(queries[key].data));
  const isLoading = PHAROSVILLE_API_ENDPOINT_KEYS.some((key) => queries[key].isLoading);
  const currentHasCompleteData = PHAROSVILLE_API_ENDPOINT_KEYS.every((key) => Boolean(queries[key].data));

  const initialQueryWaveSettled = !isLoading;
  // Essentials provide the fleet and its berths. Enrichers get one short grace
  // window, then join the published harbour as they arrive.
  const hasEssentialPayloads = PHAROSVILLE_API_ENDPOINT_KEYS.every((key) => (
    PHAROSVILLE_ENDPOINT_REGISTRY[key].role !== "essential" || Boolean(queries[key].data)
  ));
  const [enrichmentGraceExpired, setEnrichmentGraceExpired] = useState(false);
  useEffect(() => {
    if (!hasEssentialPayloads || currentHasCompleteData) return;
    const id = window.setTimeout(() => setEnrichmentGraceExpired(true), ENRICHMENT_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [currentHasCompleteData, hasEssentialPayloads]);
  const canPublishCurrentPayloads = currentHasCompleteData
    || initialQueryWaveSettled
    || (hasEssentialPayloads && enrichmentGraceExpired);
  const retainedDataRef = useRef<WorldInputData | null>(null);
  const retainedStatusRef = useRef<PharosVilleFreshness | null>(null);
  const retainedQueriesRef = useRef<Partial<Record<PharosVilleApiEndpointKey, SourceQuery>>>({});
  const publishedData = {} as WorldInputData;
  for (const key of PHAROSVILLE_API_ENDPOINT_KEYS) {
    // Hold payloads, not the whole world: live status must still reach the DOM.
    Object.assign(publishedData, { [key]: canPublishCurrentPayloads || retainedDataRef.current
      ? queries[key].data ?? retainedDataRef.current?.[key]
      : retainedDataRef.current?.[key] });
  }
  if (publishedData.stablecoins && publishedData.chains) retainedDataRef.current = publishedData;
  const routeMode = retainedDataRef.current
    ? "world"
    : canPublishCurrentPayloads
      ? resolveRouteMode({ hasAnyData, hasBlockingError: Boolean(error), isLoading })
      : "loading";
  const expectedIds = publishedData.stablecoins
    ? new Set(publishedData.stablecoins.peggedAssets.filter((asset) => (
      RUNTIME_ACTIVE_IDS.has(asset.id) && RUNTIME_ACTIVE_META_BY_ID.has(asset.id) && asset.frozen !== true
    )).map((asset) => asset.id))
    : undefined;
  const nextStatus = {} as PharosVilleFreshness;
  for (const key of PHAROSVILLE_API_ENDPOINT_KEYS) {
    const query = queries[key];
    const heldQuery = retainedQueriesRef.current[key];
    nextStatus[key] = classifyPharosVilleSource(key, {
      ...query, meta: query.meta ?? (!query.data ? heldQuery?.meta ?? null : null),
    }, publishedData[key] ?? query.data, expectedIds);
    if (query.data) retainedQueriesRef.current[key] = query;
  }
  const previousStatus = retainedStatusRef.current;
  const freshness = previousStatus && PHAROSVILLE_API_ENDPOINT_KEYS.every((key) => sameSourceStatus(previousStatus[key], nextStatus[key]))
    ? previousStatus
    : nextStatus;
  retainedStatusRef.current = freshness;

  const world = useMemo<PharosVilleWorldModel>(() => buildPharosVilleWorld({
    ...publishedData,
    routeMode,
    freshness,
  }), [
    routeMode, freshness,
    publishedData.stablecoins, publishedData.chains, publishedData.stability,
    publishedData.pegSummary, publishedData.stress, publishedData.safetyGrades, publishedData.mintBurn,
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
