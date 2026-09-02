import type { DockNode } from "../../systems/world-types";

export const ISLAND_TILE = { x: 18, y: 28 };

export const DISPLAY_TILES = Array.from({ length: 9 }, (_, index) => {
  const angle = (index / 9) * Math.PI * 2;
  return {
    x: ISLAND_TILE.x + Math.cos(angle) * 14,
    y: ISLAND_TILE.y + Math.sin(angle) * 14,
  };
});

export function dockFixture(
  chainId: string,
  size: number,
  backingDiversity: number | null = null,
  totalUsd = size * 1_000_000_000,
): DockNode {
  return {
    backingDiversity,
    chainId,
    concentration: null,
    detailId: `dock.${chainId}`,
    harboredStablecoins: [],
    healthBand: "healthy",
    id: `dock.${chainId}`,
    kind: "dock",
    label: chainId,
    size,
    stablecoinCount: 1,
    tile: { x: 40, y: 32 },
    totalUsd,
  };
}
