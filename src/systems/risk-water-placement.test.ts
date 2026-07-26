import { describe, expect, it } from "vitest";
import {
  isRiskPlacementWaterTile,
  nearestRiskPlacementWaterTile,
  riskPlacementWaterTiles,
} from "./risk-water-placement";
import { terrainKindAt } from "./world-layout";
import { PHAROSVILLE_MAP_SCALE, zoneWorldTile } from "./map-scale";

// N1: zone water is AUTHORED in the original 56-tile design space and scaled
// onto the 112-tile grid, so every tile literal below stays a design-space
// coordinate and areas multiply by MAP_SCALE².
const AREA_SCALE = PHAROSVILLE_MAP_SCALE ** 2;

describe("risk water placement", () => {
  it("resolves Ledger Mooring placements from the top-center shelf", () => {
    expect(isRiskPlacementWaterTile(zoneWorldTile({ x: 15, y: 4 }), "ledger-mooring")).toBe(true);
    expect(isRiskPlacementWaterTile(zoneWorldTile({ x: 8, y: 2 }), "ledger-mooring")).toBe(true);
    expect(isRiskPlacementWaterTile(zoneWorldTile({ x: 40, y: 0 }), "ledger-mooring")).toBe(false);
    expect(isRiskPlacementWaterTile(zoneWorldTile({ x: 47, y: 52 }), "ledger-mooring")).toBe(false);

    const nearest = nearestRiskPlacementWaterTile(zoneWorldTile({ x: 5, y: 6 }), "ledger-mooring", 8);
    expect(nearest).not.toBeNull();
    expect(nearest ? terrainKindAt(nearest.x, nearest.y) : null).toBe("ledger-water");
  });

  it("exposes every valid tile in a placement so idle ships can use the full zone", () => {
    const calmTiles = riskPlacementWaterTiles("safe-harbor");
    const ledgerTiles = riskPlacementWaterTiles("ledger-mooring");

    expect(calmTiles.length).toBeGreaterThan(600 * AREA_SCALE);
    // H4: the floors are authored 56-tile windows x MAP_SCALE^2. That model is
    // exact only at an integer scale — the zone predicates test INCLUSIVE integer
    // design bounds (`y <= 9`), which at 2.5 clips half a design row off each edge.
    // Ledger measures 1748 against a nominal 1750, so the floor is 278, not 280.
    expect(ledgerTiles.length).toBeGreaterThan(278 * AREA_SCALE);
    expect(calmTiles.every((tile) => isRiskPlacementWaterTile(tile, "safe-harbor"))).toBe(true);
    expect(ledgerTiles.every((tile) => isRiskPlacementWaterTile(tile, "ledger-mooring"))).toBe(true);
    const calmSouthEast = zoneWorldTile({ x: 18, y: 40 });
    expect(calmTiles.some((tile) => tile.x >= calmSouthEast.x && tile.y >= calmSouthEast.y)).toBe(true);
    const ledgerSouthEast = zoneWorldTile({ x: 25, y: 7 });
    expect(ledgerTiles.some((tile) => tile.x >= ledgerSouthEast.x && tile.y >= ledgerSouthEast.y)).toBe(true);
  });
});
