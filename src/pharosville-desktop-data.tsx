"use client";
import { useRef } from "react";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { usePegSummary, useReportCards, useStabilityIndexDetail, useStressSignals } from "@/hooks/api-hooks";
import { useChains } from "@/hooks/use-chains";
import { useStablecoins } from "@/hooks/use-stablecoins";
import type { ApiMeta } from "@/lib/api";
import type {
  PegSummaryResponse,
  ReportCardsResponse,
  StablecoinData,
  StablecoinListResponse,
  StabilityIndexResponse,
  StressSignalsAllResponse,
} from "@shared/types";
import type { ChainsResponse, ChainSummary } from "@shared/types/chains";
import { buildPharosVilleWorld } from "./systems/pharosville-world";
import type { PharosVilleWorld as PharosVilleWorldModel, RouteMode } from "./systems/world-types";
import { PharosVilleWorld } from "./pharosville-world";

function isMetaStale(meta: ApiMeta | null | undefined): boolean {
  return meta?.status === "stale" || meta?.status === "degraded";
}

function metaToken(meta: ApiMeta | null | undefined): string {
  // Meta still affects freshness flags, but cannot be the only cache key because
  // upstream payloads can change without an updated meta timestamp.
  const updatedAt = meta?.updatedAt ?? "n";
  const status = meta?.status ?? "n";
  return `${updatedAt}:${status}`;
}

function numberToken(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "n";
}

function stringToken(value: string | boolean | null | undefined): string {
  if (value == null) return "n";
  return String(value);
}

function sortedObjectNumberToken(value: Record<string, unknown> | null | undefined, keys: readonly string[]): string {
  if (!value) return "";
  return Object.entries(value)
    .map(([key, entry]) => {
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        return `${key}:${keys.map((field) => numberToken(record[field] as number | null | undefined)).join(",")}`;
      }
      return `${key}:${numberToken(entry as number | null | undefined)}`;
    })
    .sort()
    .join(";");
}

function chainCirculatingToken(asset: StablecoinData): string {
  return sortedObjectNumberToken(asset.chainCirculating as Record<string, unknown> | null | undefined, [
    "current",
    "circulatingPrevDay",
    "circulatingPrevWeek",
    "circulatingPrevMonth",
  ]);
}

function stablecoinToken(asset: StablecoinData): string {
  return [
    asset.id,
    asset.symbol,
    asset.name,
    asset.frozen === true ? "frozen" : "active",
    stringToken(asset.pegType),
    stringToken(asset.pegMechanism),
    numberToken(asset.price),
    numberToken(asset.priceUpdatedAt),
    sortedObjectNumberToken(asset.circulating as Record<string, unknown> | null | undefined, ["peggedUSD"]),
    chainCirculatingToken(asset),
    [...(asset.chains ?? [])].sort().join(","),
  ].join("~");
}

function stablecoinsPayloadToken(data: StablecoinListResponse | null | undefined): string {
  if (!data) return "0";
  const assets = data.peggedAssets.map(stablecoinToken).sort();
  return `1:${assets.length}:${assets.join("|")}`;
}

function chainToken(chain: ChainSummary): string {
  return [
    chain.id,
    chain.name,
    numberToken(chain.totalUsd),
    numberToken(chain.stablecoinCount),
    numberToken(chain.dominanceShare),
    stringToken(chain.healthBand),
    numberToken(chain.healthScore),
    chain.dominantStablecoin?.id ?? "n",
    chain.dominantStablecoin?.symbol ?? "n",
    numberToken(chain.dominantStablecoin?.share),
    (chain.topStablecoins ?? [])
      .map((coin) => `${coin.id}:${coin.symbol}:${numberToken(coin.share)}:${numberToken(coin.supplyUsd)}`)
      .sort()
      .join(","),
  ].join("~");
}

function chainsPayloadToken(data: ChainsResponse | null | undefined): string {
  if (!data) return "0";
  const chains = data.chains.map(chainToken).sort();
  return [
    "1",
    numberToken(data.updatedAt),
    numberToken(data.globalTotalUsd),
    numberToken(data.chainAttributedTotalUsd),
    numberToken(data.unattributedTotalUsd),
    data.healthMethodologyVersion,
    chains.length,
    chains.join("|"),
  ].join(":");
}

function stabilityPayloadToken(data: StabilityIndexResponse | null | undefined): string {
  if (!data) return "0";
  const current = data.current;
  return [
    "1",
    data.methodology?.version ?? "n",
    numberToken(data.methodology?.asOf),
    current?.band ?? "n",
    numberToken(current?.score),
    numberToken(current?.computedAt),
    current?.methodologyVersion ?? "n",
    numberToken(current?.components?.severity),
    numberToken(current?.components?.breadth),
    numberToken(current?.components?.stressBreadth),
    numberToken(current?.components?.trend),
    (current?.contributors ?? [])
      .map((entry) => `${entry.id}:${entry.symbol}:${numberToken(entry.bps)}:${numberToken(entry.mcapUsd)}`)
      .sort()
      .join(","),
  ].join(":");
}

function pegSummaryPayloadToken(data: PegSummaryResponse | null | undefined): string {
  if (!data) return "0";
  const coins = data.coins
    .map((coin) => [
      coin.id,
      coin.symbol,
      stringToken(coin.governance),
      numberToken(coin.currentDeviationBps),
      numberToken(coin.pegScore),
      stringToken(coin.priceConfidence),
      numberToken(coin.severityScore),
      numberToken(coin.eventCount),
      stringToken(coin.activeDepeg),
      numberToken(coin.lastEventAt),
    ].join("~"))
    .sort();
  return [
    "1",
    data.methodology?.version ?? "n",
    numberToken(data.methodology?.asOf),
    numberToken(data.summary?.activeDepegCount),
    numberToken(data.summary?.medianDeviationBps),
    data.summary?.worstCurrent?.id ?? "n",
    numberToken(data.summary?.worstCurrent?.bps),
    coins.length,
    coins.join("|"),
  ].join(":");
}

function stressPayloadToken(data: StressSignalsAllResponse | null | undefined): string {
  if (!data) return "0";
  const signals = Object.entries(data.signals)
    .map(([key, entry]) => [
      key,
      entry.band,
      numberToken(entry.score),
      numberToken(entry.computedAt),
      entry.methodologyVersion,
      sortedObjectNumberToken(entry.signals, ["value"]),
    ].join("~"))
    .sort();
  return [
    "1",
    numberToken(data.updatedAt),
    numberToken(data.oldestComputedAt),
    data.methodology?.version ?? "n",
    numberToken(data.methodology?.asOf),
    signals.length,
    signals.join("|"),
  ].join(":");
}

function reportCardsPayloadToken(data: ReportCardsResponse | null | undefined): string {
  if (!data) return "0";
  const cards = data.cards
    .map((card) => [
      card.id,
      card.symbol,
      card.overallGrade,
      numberToken(card.overallScore),
      numberToken(card.baseScore),
      stringToken(card.isDefunct),
      stringToken(card.rawInputs?.chainTier),
      stringToken(card.rawInputs?.deploymentModel),
      stringToken(card.rawInputs?.collateralQuality),
      stringToken(card.rawInputs?.custodyModel),
      stringToken(card.rawInputs?.governanceTier),
      stringToken(card.rawInputs?.navToken),
      (card.rawInputs?.dependencies ?? [])
        .map((dependency) => `${dependency.id}:${dependency.type ?? "n"}:${numberToken(dependency.weight)}`)
        .sort()
        .join(","),
      Object.entries(card.dimensions ?? {})
        .map(([key, dimension]) => `${key}:${dimension.grade}:${numberToken(dimension.score)}`)
        .sort()
        .join(","),
    ].join("~"))
    .sort();
  return [
    "1",
    numberToken(data.updatedAt),
    data.methodology?.version ?? "n",
    cards.length,
    cards.join("|"),
  ].join(":");
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

function hasCompleteData(input: {
  stablecoins: StablecoinListResponse | null | undefined;
  chains: ChainsResponse | null | undefined;
  stability: StabilityIndexResponse | null | undefined;
  pegSummary: PegSummaryResponse | null | undefined;
  stress: StressSignalsAllResponse | null | undefined;
  reportCards: ReportCardsResponse | null | undefined;
}): boolean {
  return Boolean(
    input.stablecoins
      && input.chains
      && input.stability
      && input.pegSummary
      && input.stress
      && input.reportCards,
  );
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
  const initialQueryWaveSettled = !isLoading;
  const currentHasCompleteData = hasCompleteData({
    stablecoins: stablecoinsQuery.data,
    chains: chainsQuery.data,
    stability: stabilityQuery.data,
    pegSummary: pegSummaryQuery.data,
    stress: stressQuery.data,
    reportCards: reportCardsQuery.data,
  });
  const canPublishCurrentPayloads = currentHasCompleteData || initialQueryWaveSettled;
  const routeMode = canPublishCurrentPayloads
    ? resolveRouteMode({ hasAnyData, hasBlockingError: Boolean(error), isLoading })
    : "loading";

  // Structural-compare cache: refetches frequently produce new `data`/`meta` references
  // even when payloads are byte-identical. Skip the (expensive) world rebuild when the
  // structural hash of inputs has not advanced, so downstream effects keying on `world`
  // identity (RAF loop, motion plan) don't churn.
  const publishedStablecoins = canPublishCurrentPayloads ? stablecoinsQuery.data : undefined;
  const publishedChains = canPublishCurrentPayloads ? chainsQuery.data : undefined;
  const publishedStability = canPublishCurrentPayloads ? stabilityQuery.data : undefined;
  const publishedPegSummary = canPublishCurrentPayloads ? pegSummaryQuery.data : undefined;
  const publishedStress = canPublishCurrentPayloads ? stressQuery.data : undefined;
  const publishedReportCards = canPublishCurrentPayloads ? reportCardsQuery.data : undefined;

  const worldHash = `${routeMode}|`
    + metaToken(canPublishCurrentPayloads ? stablecoinsQuery.meta : null) + ":" + stablecoinsPayloadToken(publishedStablecoins)
    + "|" + metaToken(canPublishCurrentPayloads ? chainsQuery.meta : null) + ":" + chainsPayloadToken(publishedChains)
    + "|" + metaToken(canPublishCurrentPayloads ? stabilityQuery.meta : null) + ":" + stabilityPayloadToken(publishedStability)
    + "|" + metaToken(canPublishCurrentPayloads ? pegSummaryQuery.meta : null) + ":" + pegSummaryPayloadToken(publishedPegSummary)
    + "|" + metaToken(canPublishCurrentPayloads ? stressQuery.meta : null) + ":" + stressPayloadToken(publishedStress)
    + "|" + metaToken(canPublishCurrentPayloads ? reportCardsQuery.meta : null) + ":" + reportCardsPayloadToken(publishedReportCards);

  const worldCacheRef = useRef<{ hash: string; world: PharosVilleWorldModel } | null>(null);
  const completeWorldRef = useRef<PharosVilleWorldModel | null>(null);
  let world: PharosVilleWorldModel;
  if (!canPublishCurrentPayloads && completeWorldRef.current) {
    world = completeWorldRef.current;
  } else if (worldCacheRef.current && worldCacheRef.current.hash === worldHash) {
    world = worldCacheRef.current.world;
  } else {
    world = buildPharosVilleWorld({
      stablecoins: publishedStablecoins,
      chains: publishedChains,
      stability: publishedStability,
      pegSummary: publishedPegSummary,
      stress: publishedStress,
      reportCards: publishedReportCards,
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
    if (currentHasCompleteData && routeMode === "world") {
      completeWorldRef.current = world;
    }
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
