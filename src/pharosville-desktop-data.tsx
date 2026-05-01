"use client";
import { useRef } from "react";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { usePegSummary, useReportCards, useStabilityIndexDetail, useStressSignals } from "@/hooks/api-hooks";
import { useChains } from "@/hooks/use-chains";
import { useStablecoins } from "@/hooks/use-stablecoins";
import type { ApiMeta } from "@/lib/api";
import { buildPharosVilleWorld } from "./systems/pharosville-world";
import type { PharosVilleWorld as PharosVilleWorldModel, RouteMode } from "./systems/world-types";
import { PharosVilleWorld } from "./pharosville-world";

function isMetaStale(meta: ApiMeta | null | undefined): boolean {
  return meta?.status === "stale" || meta?.status === "degraded";
}

function metaToken(meta: ApiMeta | null | undefined, data: unknown): string {
  // Compose a cheap, stable token capturing the dimensions that affect the world build:
  // - meta.updatedAt advances when the payload genuinely changes
  // - meta.status drives the freshness flags
  // - presence of data covers the loading -> loaded transition when meta is absent
  const updatedAt = meta?.updatedAt ?? "n";
  const status = meta?.status ?? "n";
  const has = data == null ? "0" : "1";
  return `${updatedAt}:${status}:${has}`;
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

export function PharosVilleDesktopData() {
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
  const routeMode = resolveRouteMode({ hasAnyData, hasBlockingError: Boolean(error), isLoading });

  // Structural-compare cache: refetches frequently produce new `data`/`meta` references
  // even when payloads are byte-identical. Skip the (expensive) world rebuild when the
  // structural hash of inputs has not advanced, so downstream effects keying on `world`
  // identity (RAF loop, motion plan) don't churn.
  const worldHash = `${routeMode}|`
    + metaToken(stablecoinsQuery.meta, stablecoinsQuery.data)
    + "|" + metaToken(chainsQuery.meta, chainsQuery.data)
    + "|" + metaToken(stabilityQuery.meta, stabilityQuery.data)
    + "|" + metaToken(pegSummaryQuery.meta, pegSummaryQuery.data)
    + "|" + metaToken(stressQuery.meta, stressQuery.data)
    + "|" + metaToken(reportCardsQuery.meta, reportCardsQuery.data);

  const worldCacheRef = useRef<{ hash: string; world: PharosVilleWorldModel } | null>(null);
  let world: PharosVilleWorldModel;
  if (worldCacheRef.current && worldCacheRef.current.hash === worldHash) {
    world = worldCacheRef.current.world;
  } else {
    world = buildPharosVilleWorld({
      stablecoins: stablecoinsQuery.data,
      chains: chainsQuery.data,
      stability: stabilityQuery.data,
      pegSummary: pegSummaryQuery.data,
      stress: stressQuery.data,
      reportCards: reportCardsQuery.data,
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
    worldCacheRef.current = { hash: worldHash, world };
  }

  return (
    <>
      <QueryErrorNotice
        error={error}
        hasData={world.ships.length > 0 || world.docks.length > 0}
        onRetry={() => {
          void stablecoinsQuery.refetch();
          void chainsQuery.refetch();
          void stabilityQuery.refetch();
          void pegSummaryQuery.refetch();
          void stressQuery.refetch();
          void reportCardsQuery.refetch();
        }}
      />
      <PharosVilleWorld world={world} />
    </>
  );
}
