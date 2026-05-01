import { describe, expect, it } from "vitest";
import {
  isRiskPlacementWaterTile,
  nearestAvailableRiskPlacementWaterTile,
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

  it("does not fall back to generic water while Ledger Mooring has available tiles", () => {
    const occupied = new Set(["8.2", "9.2", "10.2"]);
    const nearest = nearestAvailableRiskPlacementWaterTile({ x: 8, y: 2 }, "ledger-mooring", occupied, 8);

    expect(nearest).not.toBeNull();
    expect(nearest ? terrainKindAt(nearest.x, nearest.y) : null).toBe("ledger-water");
    expect(occupied.has(`${nearest?.x}.${nearest?.y}`)).toBe(false);
  });

  it("keeps scanning the ledger basin after the local placement radius is saturated", () => {
    const occupied = new Set<string>();
    for (let y = 0; y <= 2; y += 1) {
      for (let x = 7; x <= 13; x += 1) {
        occupied.add(`${x}.${y}`);
      }
    }

    const nearest = nearestAvailableRiskPlacementWaterTile({ x: 10, y: 1 }, "ledger-mooring", occupied, 1);

    expect(nearest).not.toBeNull();
    expect(nearest ? terrainKindAt(nearest.x, nearest.y) : null).toBe("ledger-water");
    expect(occupied.has(`${nearest?.x}.${nearest?.y}`)).toBe(false);
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
