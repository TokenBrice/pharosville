import type { ChainsResponse, ChainSummary } from "@shared/types/chains";
import type { DockNode, DockStablecoin } from "./world-types";
import {
  type DockStationSlot,
  EVM_BAY_CHAIN_IDS,
  EVM_BAY_STATION_SLOTS,
  ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
  PIGEONNIER_HARBOR_CHAIN_IDS,
  PREFERRED_DOCK_STATIONS,
} from "./world-layout";

export const MAX_CHAIN_HARBORS = 8;
export const MAX_DOCK_SIZE = 10;

const SUPPRESSED_CHAIN_HARBOR_IDS = new Set<string>(["optimism"]);

// TON renders on its own pigeonnier-attached track and must not consume one of
// the eight standard chain harbor slots. Excluding it from `selectChainHarbors`
// keeps the existing harbor balance untouched while the pigeonnier dock is
// appended as a separately-built ninth node.
const PIGEONNIER_HARBOR_CHAIN_ID_SET = new Set<string>(PIGEONNIER_HARBOR_CHAIN_IDS);

function dockSize(chain: ChainSummary, globalTotalUsd: number): number {
  const shareSize = globalTotalUsd > 0
    ? Math.ceil((chain.totalUsd / globalTotalUsd) * MAX_DOCK_SIZE)
    : 1;
  const absoluteSize =
    chain.totalUsd >= 50_000_000_000 ? 10
    : chain.totalUsd >= 20_000_000_000 ? 9
    : chain.totalUsd >= 10_000_000_000 ? 8
    : chain.totalUsd >= 5_000_000_000 ? 7
    : chain.totalUsd >= 2_000_000_000 ? 6
    : chain.totalUsd >= 1_000_000_000 ? 5
    : chain.totalUsd >= 500_000_000 ? 4
    : chain.totalUsd >= 100_000_000 ? 3
    : chain.totalUsd >= 25_000_000 ? 2
    : 1;
  return Math.max(1, Math.min(MAX_DOCK_SIZE, Math.max(shareSize, absoluteSize)));
}

function harboredStablecoins(chain: ChainSummary): DockStablecoin[] {
  const top = (chain.topStablecoins ?? [])
    .filter((coin) => coin.supplyUsd > 0 && coin.share > 0)
    .map((coin) => ({
      id: coin.id,
      symbol: coin.symbol,
      share: coin.share,
      supplyUsd: coin.supplyUsd,
    }));

  if (top.length > 0) return top;

  if (chain.totalUsd <= 0 || chain.dominantStablecoin.share <= 0) return [];

  return [{
    id: chain.dominantStablecoin.id,
    symbol: chain.dominantStablecoin.symbol,
    share: chain.dominantStablecoin.share,
    supplyUsd: chain.totalUsd * chain.dominantStablecoin.share,
  }];
}

export function buildChainDocks(chains: ChainsResponse | null | undefined): DockNode[] {
  if (!chains?.chains?.length) return [];
  const occupiedCoves = new Set<string>();
  const standardDocks = selectChainHarbors(chains.chains)
    .map((chain, index) => buildDockNode(
      chain,
      stationSlotForChain(chain.id, index, occupiedCoves),
      chains.globalTotalUsd,
    ));

  const pigeonnierDocks = selectPigeonnierHarbors(chains.chains)
    .map((chain) => buildDockNode(chain, PIGEONNIER_STATION_SLOT, chains.globalTotalUsd));

  return attachRenderedHarborContext([...standardDocks, ...pigeonnierDocks], chains.globalTotalUsd);
}

function attachRenderedHarborContext(docks: DockNode[], globalTotalUsd: number): DockNode[] {
  const harborCount = docks.length;
  const rankedIds = [...docks]
    .sort((left, right) => right.totalUsd - left.totalUsd || left.chainId.localeCompare(right.chainId))
    .map((dock) => dock.id);
  const rankById = new Map(rankedIds.map((id, index) => [id, index + 1]));
  const hasGlobalTotal = Number.isFinite(globalTotalUsd) && globalTotalUsd > 0;

  return docks.map((dock) => ({
    ...dock,
    harborCount,
    ...(rankById.has(dock.id) ? { harborRank: rankById.get(dock.id)! } : {}),
    shareOfGlobal: hasGlobalTotal ? dock.totalUsd / globalTotalUsd : null,
  }));
}

/**
 * Chain marks vendored under `public/chains/` as glyph-only SVG.
 *
 * The API still reports these with their original raster extension, so without
 * this rewrite the flags would keep loading the files the SVGs replaced. The set is
 * explicit rather than inferred because the API can name ~90 chains and we
 * vendor eleven; anything outside it keeps whatever path the API gave, which
 * simply fails to load and leaves the painted chain mark (the designed
 * fallback — see `garden-chain-flag.ts`).
 *
 * These must stay glyph-only with a transparent background: the flag knocks
 * the mark out of the cloth using its alpha as a stencil, so a filled badge
 * would render as a solid block of ink.
 */
const VENDORED_CHAIN_MARKS = new Set<string>([
  "aptos",
  "arbitrum",
  "avalanche",
  "base",
  "bsc",
  "ethereum",
  "hyperliquid-l1",
  "polygon",
  "solana",
  "ton",
  "tron",
]);

function vendoredChainMark(logoPath: string | undefined | null): string | null {
  if (!logoPath?.startsWith("/")) return null;
  // Only the EXTENSION is rewritten — the directory and slug still come from
  // the API, so no chain media path is hardcoded in browser source (the rule
  // `validate-runtime-media.mjs` enforces).
  const slug = logoPath.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
  return VENDORED_CHAIN_MARKS.has(slug) ? logoPath.replace(/\.[^.]+$/, ".svg") : logoPath;
}

function buildDockNode(chain: ChainSummary, slot: DockStationSlot, globalTotalUsd: number): DockNode {
  return {
    id: `dock.${chain.id}`,
    kind: "dock" as const,
    label: chain.name,
    chainId: chain.id,
    tile: slot.cove.tile,
    station: {
      coveId: slot.cove.id,
      type: slot.type,
      shoreBearing: slot.cove.seawardBearing,
    },
    totalUsd: chain.totalUsd,
    size: dockSize(chain, globalTotalUsd),
    healthBand: chain.healthBand,
    stablecoinCount: chain.stablecoinCount,
    concentration: chain.healthFactors?.concentration ?? null,
    // N4: the harbour flies this as its flag. Same-origin paths only — a
    // remote or empty value is dropped rather than reaching browser code.
    logoPath: vendoredChainMark(chain.logoPath),
    harboredStablecoins: harboredStablecoins(chain),
    detailId: `dock.${chain.id}`,
  };
}

function selectChainHarbors(chains: readonly ChainSummary[]): ChainSummary[] {
  const harborEligibleChains = chains.filter((chain) => (
    !SUPPRESSED_CHAIN_HARBOR_IDS.has(chain.id)
    && !PIGEONNIER_HARBOR_CHAIN_ID_SET.has(chain.id)
  ));
  const byId = new Map(harborEligibleChains.map((chain) => [chain.id, chain]));
  const selected = new Map<string, ChainSummary>();

  for (const chainId of ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS) {
    const chain = byId.get(chainId);
    if (chain && chain.totalUsd > 0) selected.set(chain.id, chain);
  }

  for (const chain of harborEligibleChains.toSorted((a, b) => b.totalUsd - a.totalUsd)) {
    if (selected.size >= MAX_CHAIN_HARBORS) break;
    selected.set(chain.id, chain);
  }

  return [...selected.values()]
    .toSorted((a, b) => b.totalUsd - a.totalUsd || a.id.localeCompare(b.id))
    .slice(0, MAX_CHAIN_HARBORS);
}

function selectPigeonnierHarbors(chains: readonly ChainSummary[]): ChainSummary[] {
  const byId = new Map(chains.map((chain) => [chain.id, chain]));
  return PIGEONNIER_HARBOR_CHAIN_IDS
    .map((chainId) => byId.get(chainId))
    .filter((chain): chain is ChainSummary => !!chain && chain.totalUsd > 0);
}

function stationSlotForChain(chainId: string, rankIndex: number, occupiedCoves: Set<string>): DockStationSlot {
  const preferred = PREFERRED_DOCK_STATIONS[chainId];
  if (preferred && reserveSlot(preferred, occupiedCoves)) return preferred;

  const primaryPool = EVM_BAY_CHAIN_IDS.has(chainId) ? EVM_BAY_STATION_SLOTS : OUTER_HARBOR_STATION_SLOTS;
  const pooled = firstOpenSlot(primaryPool, occupiedCoves);
  if (pooled) return pooled;

  const fallback = firstOpenSlot([...EVM_BAY_STATION_SLOTS, ...OUTER_HARBOR_STATION_SLOTS], occupiedCoves);
  if (fallback) return fallback;

  const allSlots = [...EVM_BAY_STATION_SLOTS, ...OUTER_HARBOR_STATION_SLOTS];
  const repeated = allSlots[rankIndex % allSlots.length] ?? EVM_BAY_STATION_SLOTS[0]!;
  reserveSlot(repeated, occupiedCoves);
  return repeated;
}

function firstOpenSlot(slots: readonly DockStationSlot[], occupiedCoves: Set<string>): DockStationSlot | null {
  for (const slot of slots) {
    if (reserveSlot(slot, occupiedCoves)) return slot;
  }
  return null;
}

function reserveSlot(slot: DockStationSlot, occupiedCoves: Set<string>): boolean {
  const key = slot.cove.id;
  if (occupiedCoves.has(key)) return false;
  occupiedCoves.add(key);
  return true;
}
