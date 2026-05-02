import { describe, expect, it } from "vitest";
import { dockDrawTile, dockOutwardVector } from "./geometry";

describe("dock geometry overrides", () => {
  it("pushes the Ethereum rotunda harbor farther seaward than the generic east anchor", () => {
    const ethereumDock: Parameters<typeof dockDrawTile>[0] = {
      tile: { x: 42, y: 31 },
      size: 8,
    } as Parameters<typeof dockDrawTile>[0];

    expect(dockDrawTile(ethereumDock, 56)).toEqual({ x: 44.9, y: 32.15 });
  });

  it("anchors the Solana slip on the NW shoulder near the lighthouse", () => {
    const solanaDock: Parameters<typeof dockDrawTile>[0] = {
      tile: { x: 25, y: 23 },
      size: 4,
    } as Parameters<typeof dockDrawTile>[0];

    // NW shoulder: outward vector projects north into the upper harbor.
    expect(dockOutwardVector(solanaDock.tile, 56)).toEqual({ x: 0, y: -1 });
  });

  it("anchors the Hyperliquid slip on the south periphery between Base and Arbitrum", () => {
    const hyperliquidDock: Parameters<typeof dockDrawTile>[0] = {
      tile: { x: 36, y: 39 },
      size: 4,
    } as Parameters<typeof dockDrawTile>[0];

    // S periphery: outward vector projects south.
    expect(dockOutwardVector(hyperliquidDock.tile, 56)).toEqual({ x: 0, y: 1 });
  });
});
