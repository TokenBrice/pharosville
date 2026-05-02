import { describe, expect, it } from "vitest";
import { dockDrawTile, dockOutwardVector } from "./geometry";

describe("dock geometry overrides", () => {
  it("keeps the Solana and Hyperliquid north-east slips off the seawall bend", () => {
    const solanaDock: Parameters<typeof dockDrawTile>[0] = {
      tile: { x: 34, y: 22 },
      size: 4,
    } as Parameters<typeof dockDrawTile>[0];
    const hyperliquidDock: Parameters<typeof dockDrawTile>[0] = {
      tile: { x: 37, y: 23 },
      size: 4,
    } as Parameters<typeof dockDrawTile>[0];

    expect(dockOutwardVector(solanaDock.tile, 56)).toEqual({ x: 0, y: -1 });
    expect(dockOutwardVector(hyperliquidDock.tile, 56)).toEqual({ x: 0, y: -1 });

    expect(dockDrawTile(solanaDock, 56)).toEqual({ x: 34.45, y: 21.35 });
    expect(dockDrawTile(hyperliquidDock, 56)).toEqual({ x: 37.55, y: 22.25 });
  });
});
