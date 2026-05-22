import { describe, expect, it } from "vitest";
import {
  isRiskPlacementWaterTile,
  nearestRiskPlacementWaterTile,
  riskPlacementWaterTiles,
} from "./risk-water-placement";
import { terrainKindAt } from "./world-layout";

describe("risk water placement", () => {
  it("resolves Ledger Mooring placements from the top-center shelf", () => {
    expect(isRiskPlacementWaterTile({ x: 15, y: 4 }, "ledger-mooring")).toBe(true);
    expect(isRiskPlacementWaterTile({ x: 8, y: 2 }, "ledger-mooring")).toBe(true);
    expect(isRiskPlacementWaterTile({ x: 40, y: 0 }, "ledger-mooring")).toBe(false);
    expect(isRiskPlacementWaterTile({ x: 47, y: 52 }, "ledger-mooring")).toBe(false);

    const nearest = nearestRiskPlacementWaterTile({ x: 5, y: 6 }, "ledger-mooring", 8);
    expect(nearest).not.toBeNull();
    expect(nearest ? terrainKindAt(nearest.x, nearest.y) : null).toBe("ledger-water");
  });

  it("exposes every valid tile in a placement so idle ships can use the full zone", () => {
    const calmTiles = riskPlacementWaterTiles("safe-harbor");
    const ledgerTiles = riskPlacementWaterTiles("ledger-mooring");

    expect(calmTiles.length).toBeGreaterThan(600);
    expect(ledgerTiles.length).toBeGreaterThan(280);
    expect(calmTiles.every((tile) => isRiskPlacementWaterTile(tile, "safe-harbor"))).toBe(true);
    expect(ledgerTiles.every((tile) => isRiskPlacementWaterTile(tile, "ledger-mooring"))).toBe(true);
    expect(calmTiles.some((tile) => tile.x >= 18 && tile.y >= 40)).toBe(true);
    expect(ledgerTiles.some((tile) => tile.x >= 25 && tile.y >= 7)).toBe(true);
  });
});
