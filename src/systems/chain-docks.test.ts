import { describe, expect, it } from "vitest";
import { fixtureChains, makeChain } from "../__fixtures__/pharosville-world";
import { buildChainDocks } from "./chain-docks";
import {
  CIVIC_CORE_CENTER,
  EVM_BAY_DOCK_TILES,
  isLandTileKind,
  isWaterTileKind,
  OUTER_HARBOR_DOCK_TILES,
  PHAROSVILLE_MAP_WIDTH,
  PREFERRED_DOCK_TILES,
  tileKindAt,
} from "./world-layout";

describe("buildChainDocks", () => {
  it("sizes docks from chain totalUsd and keeps concentration separate", () => {
    const docks = buildChainDocks(fixtureChains);

    expect(docks[0]?.chainId).toBe("ethereum");
    expect(docks[0]?.totalUsd).toBe(8_000_000_000);
    expect(docks[0]?.concentration).toBe(0.4);
    expect(docks[0]?.size).toBeGreaterThan(docks[1]?.size ?? 0);
    expect(docks[0]?.size).toBeGreaterThanOrEqual(7);
    expect(docks[1]?.size).toBeGreaterThanOrEqual(6);
    expect(docks[0]?.assetId).toBe("dock.ethereum-civic-cove");
    expect(docks[0]?.logoSrc).toBeNull();
  });

  it("anchors rendered docks on land-adjacent harbor water", () => {
    const docks = buildChainDocks(fixtureChains);

    expect(docks.find((dock) => dock.chainId === "ethereum")?.tile).toEqual(PREFERRED_DOCK_TILES.ethereum);
    expect(docks.find((dock) => dock.chainId === "tron")?.tile).toEqual(PREFERRED_DOCK_TILES.tron);
    expect(docks.every((dock) => isLandTileKind(tileKindAt(dock.tile.x, dock.tile.y)))).toBe(true);
    expect(docks.every((dock) => cardinalNeighbors(dock.tile).some((neighbor) => (
      isWaterTileKind(tileKindAt(neighbor.x, neighbor.y))
    )))).toBe(true);
    expect(docks.every((dock) => outwardWaterDirections(dock.tile).length > 0)).toBe(true);
    expect(docks.every((dock) => isProductionOutwardWater(dock.tile))).toBe(true);
  });

  it("keeps the Ethereum and L2 extension harbors in the EVM bay and distributes alt L1s outside it", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 100, logoPath: "/chains/ethereum.png" }),
        makeChain({ id: "tron", name: "Tron", totalUsd: 90 }),
        makeChain({ id: "bsc", name: "BSC", totalUsd: 80 }),
        makeChain({ id: "base", name: "Base", totalUsd: 70, logoPath: "/chains/base.png" }),
        makeChain({ id: "solana", name: "Solana", totalUsd: 60 }),
        makeChain({ id: "arbitrum", name: "Arbitrum", totalUsd: 50 }),
        makeChain({ id: "polygon", name: "Polygon", totalUsd: 40 }),
        makeChain({ id: "aptos", name: "Aptos", totalUsd: 30 }),
        makeChain({ id: "optimism", name: "Optimism", totalUsd: 20 }),
        makeChain({ id: "mantle", name: "Mantle", totalUsd: 10 }),
      ],
      globalTotalUsd: 550,
    });
    const byChain = new Map(docks.map((dock) => [dock.chainId, dock.tile]));

    expect(byChain.get("ethereum")).toEqual(PREFERRED_DOCK_TILES.ethereum);
    expect(byChain.get("base")).toEqual(PREFERRED_DOCK_TILES.base);
    expect(byChain.get("arbitrum")).toEqual(PREFERRED_DOCK_TILES.arbitrum);
    expect(byChain.get("optimism")).toEqual(PREFERRED_DOCK_TILES.optimism);
    expect(byChain.get("polygon")).toEqual(PREFERRED_DOCK_TILES.polygon);
    expect(docks.find((dock) => dock.chainId === "ethereum")?.assetId).toBe("dock.ethereum-civic-cove");
    expect(docks.find((dock) => dock.chainId === "base")?.assetId).toBe("dock.base-modular-slip");
    expect(docks.find((dock) => dock.chainId === "arbitrum")?.assetId).toBe("dock.arbitrum-arch-bridge");
    expect(docks.find((dock) => dock.chainId === "optimism")?.assetId).toBe("dock.optimism-sunrise-beacon");
    expect(docks.find((dock) => dock.chainId === "polygon")?.assetId).toBe("dock.polygon-hexmarket");
    expect(docks.find((dock) => dock.chainId === "ethereum")?.logoSrc).toBe("/chains/ethereum.png");
    expect(docks.find((dock) => dock.chainId === "base")?.logoSrc).toBe("/chains/base.png");
    expect(docks.find((dock) => dock.chainId === "tron")?.logoSrc).toBeNull();
    expect(byChain.get("bsc")).toEqual(PREFERRED_DOCK_TILES.bsc);
    expect(byChain.get("tron")).toEqual(PREFERRED_DOCK_TILES.tron);
    expect(byChain.get("solana")).toEqual(PREFERRED_DOCK_TILES.solana);
    expect(docks.map((dock) => dock.chainId)).not.toContain("aptos");
    expect(docks.map((dock) => dock.chainId)).not.toContain("mantle");

    for (const chainId of ["ethereum", "base", "arbitrum", "optimism", "polygon"]) {
      expect(EVM_BAY_DOCK_TILES).toContainEqual(byChain.get(chainId));
    }
    for (const chainId of ["bsc", "tron", "solana"]) {
      expect(EVM_BAY_DOCK_TILES).not.toContainEqual(byChain.get(chainId));
      expect(OUTER_HARBOR_DOCK_TILES).toContainEqual(byChain.get(chainId));
    }
    expect(new Set(docks.map((dock) => `${dock.tile.x}.${dock.tile.y}`)).size).toBe(docks.length);
  });

  it("reserves key Ethereum L2 extension slips before lower-ranked outer harbors", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
        makeChain({ id: "bsc", totalUsd: 80 }),
        makeChain({ id: "solana", totalUsd: 70 }),
        makeChain({ id: "hyperliquid", totalUsd: 60 }),
        makeChain({ id: "base", totalUsd: 50 }),
        makeChain({ id: "arbitrum", totalUsd: 40 }),
        makeChain({ id: "polygon", totalUsd: 30 }),
        makeChain({ id: "aptos", totalUsd: 20 }),
        makeChain({ id: "avalanche", totalUsd: 19 }),
        makeChain({ id: "xlayer", totalUsd: 18 }),
        makeChain({ id: "mantle", totalUsd: 5 }),
        makeChain({ id: "optimism", totalUsd: 4 }),
      ],
      globalTotalUsd: 586,
    });

    expect(docks).toHaveLength(8);
    expect(docks.map((dock) => dock.chainId)).toEqual([
      "ethereum",
      "tron",
      "bsc",
      "solana",
      "base",
      "arbitrum",
      "polygon",
      "optimism",
    ]);
    expect(docks.map((dock) => dock.chainId)).not.toContain("hyperliquid");
    expect(docks.map((dock) => dock.chainId)).not.toContain("aptos");
    expect(docks.map((dock) => dock.chainId)).not.toContain("avalanche");
    expect(docks.map((dock) => dock.chainId)).not.toContain("xlayer");
    expect(docks.map((dock) => dock.chainId)).not.toContain("mantle");
    expect(docks.find((dock) => dock.chainId === "optimism")?.tile).toEqual(PREFERRED_DOCK_TILES.optimism);
  });

  it("keeps billion-dollar hubs large even when their global share is modest", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      globalTotalUsd: 150_000_000_000,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 95_000_000_000 }),
        makeChain({ id: "base", totalUsd: 6_000_000_000 }),
        makeChain({ id: "arbitrum", totalUsd: 2_500_000_000 }),
        makeChain({ id: "small", totalUsd: 20_000_000 }),
      ],
    });

    expect(docks.find((dock) => dock.chainId === "ethereum")?.size).toBe(10);
    expect(docks.find((dock) => dock.chainId === "base")?.size).toBe(7);
    expect(docks.find((dock) => dock.chainId === "arbitrum")?.size).toBe(6);
    expect(docks.find((dock) => dock.chainId === "small")?.size).toBe(1);
  });

  it("emits only the top eight chain harbors and preserves top stablecoin cargo", () => {
    const chains = Array.from({ length: 12 }, (_, index) => makeChain({
      id: `chain-${index}`,
      totalUsd: 12_000_000_000 - index * 1_000_000_000,
      topStablecoins: [
        { id: `coin-${index}-a`, symbol: `A${index}`, share: 0.6, supplyUsd: 600_000_000 },
        { id: `coin-${index}-b`, symbol: `B${index}`, share: 0.4, supplyUsd: 400_000_000 },
      ],
    }));

    const docks = buildChainDocks({
      ...fixtureChains,
      chains,
      globalTotalUsd: 78_000_000_000,
    });

    expect(docks).toHaveLength(8);
    expect(docks.map((dock) => dock.chainId)).toEqual([
      "chain-0",
      "chain-1",
      "chain-2",
      "chain-3",
      "chain-4",
      "chain-5",
      "chain-6",
      "chain-7",
    ]);
    expect(docks.map((dock) => dock.tile)).toEqual(OUTER_HARBOR_DOCK_TILES.slice(0, 8));
    expect(docks.map((dock) => dock.assetId)).toEqual(Array(8).fill("dock.wooden-pier"));
    expect(docks[0]?.harboredStablecoins.map((coin) => coin.symbol)).toEqual(["A0", "B0"]);
  });
});

function cardinalNeighbors(tile: { x: number; y: number }): { x: number; y: number }[] {
  return cardinalDirections().map((direction) => ({
    x: tile.x + direction.x,
    y: tile.y + direction.y,
  }));
}

function outwardWaterDirections(tile: { x: number; y: number }) {
  const centerDistance = Math.hypot(tile.x - CIVIC_CORE_CENTER.x, tile.y - CIVIC_CORE_CENTER.y);
  return cardinalDirections().filter((direction) => {
    const waterTile = {
      x: tile.x + direction.x,
      y: tile.y + direction.y,
    };
    const mooringTile = {
      x: tile.x + direction.x * 2,
      y: tile.y + direction.y * 2,
    };
    const waterDistance = Math.hypot(waterTile.x - CIVIC_CORE_CENTER.x, waterTile.y - CIVIC_CORE_CENTER.y);
    return waterDistance > centerDistance
      && isWaterTileKind(tileKindAt(waterTile.x, waterTile.y))
      && isWaterTileKind(tileKindAt(mooringTile.x, mooringTile.y));
  });
}

function isProductionOutwardWater(tile: { x: number; y: number }) {
  const outward = productionDockOutwardVector(tile);
  return isWaterTileKind(tileKindAt(tile.x + outward.x, tile.y + outward.y));
}

function productionDockOutwardVector(tile: { x: number; y: number }): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const center = (PHAROSVILLE_MAP_WIDTH - 1) / 2;
  const dx = tile.x - center;
  const dy = tile.y - center;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: dy < 0 ? -1 : 1 };
}

function cardinalDirections(): { x: number; y: number }[] {
  return [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
}
