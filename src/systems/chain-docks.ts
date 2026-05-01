import type { ChainsResponse, ChainSummary } from "@shared/types/chains";
import type { DockNode, DockStablecoin } from "./world-types";
import {
  DOCK_TILES,
  EVM_BAY_CHAIN_IDS,
  EVM_BAY_DOCK_TILES,
  ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS,
  OUTER_HARBOR_DOCK_TILES,
  PREFERRED_DOCK_TILES,
} from "./world-layout";

export const MAX_CHAIN_HARBORS = 8;
export const MAX_DOCK_SIZE = 10;

const DOCK_ASSET_IDS = [
  "dock.ethereum-civic-cove",
  "dock.tron-arena-wharf",
  "dock.bsc-mercantile-wharf",
  "dock.solana-prism-stilt",
  "dock.base-modular-slip",
  "dock.arbitrum-arch-bridge",
  "dock.polygon-hexmarket",
  "dock.aptos-jade-pagoda",
  "dock.avalanche-alpine-watch",
] as const;

const PREFERRED_DOCK_ASSET_IDS: Record<string, (typeof DOCK_ASSET_IDS)[number]> = {
  ethereum: "dock.ethereum-civic-cove",
  tron: "dock.tron-arena-wharf",
  bsc: "dock.bsc-mercantile-wharf",
  solana: "dock.solana-prism-stilt",
  base: "dock.base-modular-slip",
  arbitrum: "dock.arbitrum-arch-bridge",
  polygon: "dock.polygon-hexmarket",
  aptos: "dock.aptos-jade-pagoda",
  avalanche: "dock.avalanche-alpine-watch",
};

const SUPPRESSED_CHAIN_HARBOR_IDS = new Set<string>(["optimism"]);

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

  return [{
    id: chain.dominantStablecoin.id,
    symbol: chain.dominantStablecoin.symbol,
    share: chain.dominantStablecoin.share,
    supplyUsd: chain.totalUsd * chain.dominantStablecoin.share,
  }];
}

export function buildChainDocks(chains: ChainsResponse | null | undefined): DockNode[] {
  if (!chains?.chains?.length) return [];
  const occupiedTiles = new Set<string>();
  return selectChainHarbors(chains.chains)
    .map((chain, index) => {
      const tile = dockTileForChain(chain.id, index, occupiedTiles);
      return {
        id: `dock.${chain.id}`,
        kind: "dock" as const,
        label: chain.name,
        chainId: chain.id,
        logoSrc: chain.logoPath || null,
        assetId: PREFERRED_DOCK_ASSET_IDS[chain.id] ?? "dock.wooden-pier",
        tile,
        totalUsd: chain.totalUsd,
        size: dockSize(chain, chains.globalTotalUsd),
        healthBand: chain.healthBand,
        stablecoinCount: chain.stablecoinCount,
        concentration: chain.healthFactors?.concentration ?? null,
        harboredStablecoins: harboredStablecoins(chain),
        detailId: `dock.${chain.id}`,
      };
    });
}

function selectChainHarbors(chains: readonly ChainSummary[]): ChainSummary[] {
  const harborEligibleChains = chains.filter((chain) => !SUPPRESSED_CHAIN_HARBOR_IDS.has(chain.id));
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

function dockTileForChain(chainId: string, rankIndex: number, occupiedTiles: Set<string>): { x: number; y: number } {
  const preferred = PREFERRED_DOCK_TILES[chainId];
  if (preferred && reserveTile(preferred, occupiedTiles)) return preferred;

  const primaryPool = EVM_BAY_CHAIN_IDS.has(chainId) ? EVM_BAY_DOCK_TILES : OUTER_HARBOR_DOCK_TILES;
  const pooled = firstOpenTile(primaryPool, occupiedTiles);
  if (pooled) return pooled;

  const fallback = firstOpenTile(DOCK_TILES, occupiedTiles);
  if (fallback) return fallback;

  const repeated = DOCK_TILES[rankIndex % DOCK_TILES.length] ?? DOCK_TILES[0];
  reserveTile(repeated, occupiedTiles);
  return repeated;
}

function firstOpenTile(tiles: readonly { x: number; y: number }[], occupiedTiles: Set<string>): { x: number; y: number } | null {
  for (const tile of tiles) {
    if (reserveTile(tile, occupiedTiles)) return tile;
  }
  return null;
}

function reserveTile(tile: { x: number; y: number }, occupiedTiles: Set<string>): boolean {
  const key = `${tile.x}.${tile.y}`;
  if (occupiedTiles.has(key)) return false;
  occupiedTiles.add(key);
  return true;
}
