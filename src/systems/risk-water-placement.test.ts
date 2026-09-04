import { describe, expect, it } from "vitest";
import {
  isRiskPlacementWaterTile,
  nearestRiskPlacementWaterTile,
  riskPlacementWaterTiles,
} from "./risk-water-placement";
import {
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
  terrainKindAt,
} from "./world-layout";
import { stationFootprint } from "./dock-layout";
import { SHIP_RISK_PLACEMENTS } from "./risk-water-areas";
import { PHAROSVILLE_MAP_SCALE, zoneWorldTile } from "./map-scale";

// N1: zone water is AUTHORED in the original 56-tile design space and scaled
// onto the 112-tile grid, so every tile literal below stays a design-space
// coordinate and areas multiply by MAP_SCALE².
const AREA_SCALE = PHAROSVILLE_MAP_SCALE ** 2;

// R4 (plan §8 L11): the oriented station envelopes placement water must keep
// risk markers off. Mirrors the module's derivation — stationFootprint at the
// most conservative envelope (saturated supply, maximum dock size), centred
// half a length seaward of the authored berth along the cove bearing.
const STATION_FOOTPRINTS = [
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
].flat().map((slot) => {
  const { length, span } = stationFootprint(slot.type, Number.POSITIVE_INFINITY, 10);
  const halfAlong = length / 2 / Math.SQRT2;
  const halfAcross = span / 2 / Math.SQRT2;
  const seawardX = Math.cos(slot.cove.seawardBearing);
  const seawardY = Math.sin(slot.cove.seawardBearing);
  return {
    center: {
      x: slot.cove.tile.x + seawardX * halfAlong,
      y: slot.cove.tile.y + seawardY * halfAlong,
    },
    halfAlong,
    halfAcross,
    id: slot.cove.id,
    seawardX,
    seawardY,
  };
});

/** Tile-centre distance to a station envelope; 0 when inside it. */
function distanceToStation(x: number, y: number, station: (typeof STATION_FOOTPRINTS)[number]): number {
  const along = (x - station.center.x) * station.seawardX + (y - station.center.y) * station.seawardY;
  const across = -(x - station.center.x) * station.seawardY + (y - station.center.y) * station.seawardX;
  return Math.hypot(
    Math.max(Math.abs(along) - station.halfAlong, 0),
    Math.max(Math.abs(across) - station.halfAcross, 0),
  );
}

// A risk marker occupies its whole tile, so a centre within half a tile of an
// envelope still overlaps the structure (matches the module's rejection
// margin).
const RISK_MARKER_TILE_HALF = 0.5;

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
    // RIM FIELD REVISION 1: Ledger's hooked cove and recalibrated reach measure 1,601 tiles (10.0%).
    expect(ledgerTiles.length).toBeGreaterThan(250 * AREA_SCALE);
    expect(calmTiles.every((tile) => isRiskPlacementWaterTile(tile, "safe-harbor"))).toBe(true);
    expect(ledgerTiles.every((tile) => isRiskPlacementWaterTile(tile, "ledger-mooring"))).toBe(true);
    const calmSouthEast = zoneWorldTile({ x: 18, y: 40 });
    expect(calmTiles.some((tile) => tile.x >= calmSouthEast.x && tile.y >= calmSouthEast.y)).toBe(true);
    const ledgerSouthEast = zoneWorldTile({ x: 25, y: 7 });
    expect(ledgerTiles.some((tile) => tile.x >= ledgerSouthEast.x && tile.y >= ledgerSouthEast.y)).toBe(true);
  });

  it("keeps every risk tile off the nine enlarged station footprints", () => {
    for (const placement of SHIP_RISK_PLACEMENTS) {
      for (const tile of riskPlacementWaterTiles(placement)) {
        for (const station of STATION_FOOTPRINTS) {
          expect(
            distanceToStation(tile.x, tile.y, station),
            `${placement} tile (${tile.x},${tile.y}) vs ${station.id}`,
          ).toBeGreaterThan(RISK_MARKER_TILE_HALF);
        }
      }
    }
  });

  it("rejects harbor mouth tiles that were valid risk water before the station keep-out", () => {
    // L11, measured before R4: the ethereum-mole mouth (15,95) and the
    // calm-engawa-south mouth (60,130) were themselves valid safe-harbor
    // placement water — calm-water, clear of every garden obstacle — so risk
    // tiles could be scattered straight onto the quays. Both mouths are roots
    // of their station envelopes, so removing the footprint term makes these
    // predicates true again and the exhaustive check above fails with these
    // very tiles.
    expect(isRiskPlacementWaterTile({ x: 15, y: 95 }, "safe-harbor")).toBe(false);
    expect(isRiskPlacementWaterTile({ x: 60, y: 130 }, "safe-harbor")).toBe(false);
  });
});
