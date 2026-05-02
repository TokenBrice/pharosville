import { describe, expect, it } from "vitest";
import { CEMETERY_ENTRIES } from "@shared/lib/cemetery-merged";
import {
  buildPharosVilleMap,
  CEMETERY_CENTER,
  CEMETERY_RADIUS,
  CIVIC_CORE_CENTER,
  CIVIC_CORE_RADIUS,
  DOCK_TILES,
  BASE_HARBOR_DOCK_TILE,
  EVM_BAY_DOCK_TILES,
  HYPERLIQUID_HARBOR_DOCK_TILE,
  graveNodesFromEntries,
  isLandTileKind,
  isNavigableWaterTile,
  isWaterTileKind,
  LIGHTHOUSE_TILE,
  OUTER_HARBOR_DOCK_TILES,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  nearestAvailableWaterTile,
  nearestWaterTile,
  REGION_TILES,
  terrainKindAt,
  tileKindAt,
} from "./world-layout";
import { SEAWALL_BARRIER_TILES, isSeawallBarrierTile } from "./seawall";
import type { PharosVilleTile } from "./world-types";

describe("buildPharosVilleMap", () => {
  it("creates a sea-first authored map", () => {
    const map = buildPharosVilleMap();

    expect(map.width).toBe(PHAROSVILLE_MAP_WIDTH);
    expect(map.height).toBe(PHAROSVILLE_MAP_HEIGHT);
    expect(map.tiles).toHaveLength(PHAROSVILLE_MAP_WIDTH * PHAROSVILLE_MAP_HEIGHT);
    // Sea zones now dominate more of the canvas after the compact-island revamp.
    expect(map.waterRatio).toBeGreaterThanOrEqual(0.850);
    expect(map.waterRatio).toBeLessThanOrEqual(0.856);
    const mainIslandLandTiles = landTilesExcludingCemetery(map.tiles);
    // Baseline was 592 main-island land tiles; 393 is a 33.6% reduction.
    // +11 from absorbing the former west-seawall pocket into the lighthouse
    // south flank (closes the visible BSC harbor pool).
    expect(mainIslandLandTiles).toHaveLength(404);
    const mainIslandBounds = landBoundsExcludingCemetery(map.tiles);
    expect(mainIslandBounds.minX).toBeGreaterThanOrEqual(16);
    expect(mainIslandBounds.maxX).toBeLessThanOrEqual(43);
    expect(mainIslandBounds.minY).toBeGreaterThanOrEqual(21);
    expect(mainIslandBounds.maxY).toBeLessThanOrEqual(41);
    const mainCenter = {
      x: (mainIslandBounds.minX + mainIslandBounds.maxX) / 2,
      y: (mainIslandBounds.minY + mainIslandBounds.maxY) / 2,
    };
    expect(Math.abs(mainCenter.x - CIVIC_CORE_CENTER.x)).toBeLessThan(2);
    expect(Math.abs(mainCenter.y - CIVIC_CORE_CENTER.y)).toBeLessThan(2);
    const counts = terrainCounts(map.tiles);
    expect((counts.get("deep-water") ?? 0) / map.tiles.length).toBeLessThanOrEqual(0.03);
    expect(counts.get("watch-water") ?? 0).toBeGreaterThan(counts.get("calm-water") ?? 0);
    expect(counts.get("calm-water") ?? 0).toBeGreaterThan(counts.get("ledger-water") ?? 0);
    expect(counts.get("ledger-water") ?? 0).toBeGreaterThanOrEqual(280);
    expect(counts.get("watch-water") ?? 0).toBeGreaterThanOrEqual(80);
    expect(counts.get("alert-water") ?? 0).toBeGreaterThan(counts.get("warning-water") ?? 0);
    expect(counts.get("warning-water") ?? 0).toBeGreaterThan(counts.get("storm-water") ?? 0);
    expect(map.tiles.every((tile) => tile.terrain)).toBe(true);
    expect([...new Set(map.tiles.map((tile) => tile.terrain))]).toEqual(expect.arrayContaining([
      "alert-water",
      "calm-water",
      "ledger-water",
      "watch-water",
      "warning-water",
      "storm-water",
      "grass",
      "rock",
    ]));
    expect([...new Set(map.tiles.map((tile) => tile.terrain))]).not.toContain("road");
  });

  it("defines a civic core around the island center", () => {
    expect(CIVIC_CORE_CENTER).toEqual({ x: 31, y: 31 });
    expect(CIVIC_CORE_RADIUS).toBe(8.5);
    expect(isLandTileKind(tileKindAt(CIVIC_CORE_CENTER.x, CIVIC_CORE_CENTER.y))).toBe(true);
    expect(terrainKindAt(CIVIC_CORE_CENTER.x, CIVIC_CORE_CENTER.y)).toBe("rock");
  });

  it("places the lighthouse on the western shoulder clear of outer harbors", () => {
    expect(LIGHTHOUSE_TILE).toEqual({ x: 18, y: 28 });
    expect(LIGHTHOUSE_TILE.x).toBeLessThan(CIVIC_CORE_CENTER.x);
    expect(LIGHTHOUSE_TILE.y).toBeLessThan(CIVIC_CORE_CENTER.y);
    expect(isLandTileKind(tileKindAt(LIGHTHOUSE_TILE.x, LIGHTHOUSE_TILE.y))).toBe(true);
  });

  it("keeps the civic core natural without road terrain", () => {
    // Central rock interior around the island harbor ring.
    expect(terrainKindAt(37, 30)).toBe("rock");
    expect(terrainKindAt(38, 31)).toBe("rock");
    expect(terrainKindAt(34, 30)).toBe("rock");
    expect(terrainKindAt(31, 29)).toBe("rock");
    expect(terrainKindAt(30, 35)).toBe("rock");
    expect(terrainKindAt(32, 33)).toBe("rock");
    // Harbor ring slots stay natural coast, not roads.
    expect(terrainKindAt(23, 37)).toBe("shore");
    expect(terrainKindAt(27, 40)).toBe("shore");
    expect(terrainKindAt(Math.round(CEMETERY_CENTER.x), Math.round(CEMETERY_CENTER.y))).toBe("grass");
  });

  it("keeps risk anchors on matching water terrain", () => {
    expect(Object.values(REGION_TILES).every((tile) => isWaterTileKind(tileKindAt(tile.x, tile.y)))).toBe(true);
    expect(terrainKindAt(REGION_TILES["safe-harbor"].x, REGION_TILES["safe-harbor"].y)).toBe("calm-water");
    expect(terrainKindAt(REGION_TILES["breakwater-edge"].x, REGION_TILES["breakwater-edge"].y)).toBe("watch-water");
    expect(terrainKindAt(REGION_TILES["harbor-mouth-watch"].x, REGION_TILES["harbor-mouth-watch"].y)).toBe("alert-water");
    expect(terrainKindAt(REGION_TILES["outer-rough-water"].x, REGION_TILES["outer-rough-water"].y)).toBe("warning-water");
    expect(terrainKindAt(REGION_TILES["storm-shelf"].x, REGION_TILES["storm-shelf"].y)).toBe("storm-water");
    expect(terrainKindAt(REGION_TILES["ledger-mooring"].x, REGION_TILES["ledger-mooring"].y)).toBe("ledger-water");
    expect(terrainKindAt(0, 55)).toBe("calm-water");
    expect(terrainKindAt(47, 52)).toBe("watch-water");
    expect(terrainKindAt(50, 55)).toBe("watch-water");
  });

  it("uses the left edge for Calm Anchorage and the south basin for Watch Breakwater", () => {
    const calmSamples = [
      { x: 0, y: 13 },
      { x: 0, y: 27 },
      { x: 0, y: 39 },
      { x: 0, y: 55 },
      { x: 6, y: 20 },
      { x: 14, y: 42 },
    ];
    const watchSamples = [
      { x: 18, y: 47 },
      { x: 22, y: 49 },
      { x: 28, y: 50 },
      { x: 34, y: 52 },
      { x: 48, y: 44 },
      { x: 52, y: 42 },
      { x: 55, y: 38 },
      { x: 55, y: 25 },
      { x: 50, y: 30 },
      { x: 45, y: 35 },
      { x: 22, y: 55 },
      { x: 38, y: 55 },
    ];

    for (const tile of calmSamples) {
      expect(terrainKindAt(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("calm-water");
    }
    for (const tile of watchSamples) {
      expect(terrainKindAt(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("watch-water");
    }
  });

  it("places Ledger Mooring across the entire top shelf while preserving the east risk stack", () => {
    const ledgerSamples = [
      { x: 0, y: 0 },
      { x: 0, y: 9 },
      { x: 7, y: 0 },
      { x: 14, y: 0 },
      { x: 22, y: 0 },
      { x: 30, y: 0 },
      { x: 10, y: 5 },
      { x: 15, y: 4 },
      { x: 20, y: 5 },
      { x: 13, y: 8 },
    ];
    const southeastWatchSamples = [
      { x: 45, y: 55 },
      { x: 47, y: 52 },
      { x: 50, y: 55 },
      { x: 55, y: 55 },
    ];

    for (const tile of ledgerSamples) {
      expect(terrainKindAt(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("ledger-water");
    }
    for (const tile of southeastWatchSamples) {
      expect(terrainKindAt(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("watch-water");
    }
    // The south basin previously held by Calm now reads as Watch Breakwater.
    expect(terrainKindAt(28, 50)).toBe("watch-water");
    expect(terrainKindAt(43, 54)).toBe("watch-water");
    // Ledger ends at y=9; Calm picks up at y=10 along the western flank so
    // the two zones touch without overlap.
    expect(terrainKindAt(0, 10)).toBe("calm-water");
    expect(terrainKindAt(15, 10)).toBe("calm-water");
    // Tiles between the new Ledger shelf and the eastern Alert ring fall back
    // to generic navigable water; the eastern rings stay intact.
    expect(terrainKindAt(31, 0)).toBe("water");
    expect(terrainKindAt(34, 2)).toBe("water");
    expect(terrainKindAt(37, 5)).toBe("water");
    expect(terrainKindAt(40, 0)).toBe("alert-water");
    expect(terrainKindAt(55, 17)).toBe("alert-water");
    expect(terrainKindAt(55, 18)).toBe("watch-water");
    expect(terrainKindAt(55, 38)).toBe("watch-water");
    expect(terrainKindAt(45, 0)).toBe("warning-water");
    expect(terrainKindAt(55, 0)).toBe("storm-water");
  });

  it("extends DEWS water over the exposed outer perimeter while keeping the island halo generic", () => {
    for (const tile of [
      { x: 0, y: 54 },
      { x: 1, y: 55 },
      { x: 55, y: 24 },
      { x: 55, y: 38 },
      { x: 44, y: 40 },
      { x: 51, y: 31 },
    ]) {
      expect(
        ["calm-water", "watch-water", "alert-water", "warning-water", "storm-water"],
        `${tile.x}.${tile.y}`,
      ).toContain(terrainKindAt(tile.x, tile.y));
    }

    for (const tile of [
      { x: 14, y: 21 },
      { x: 19, y: 40 },
    ]) {
      expect(terrainKindAt(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("water");
    }
  });

  it("keeps the immediate lighthouse mountain water buffer generic", () => {
    for (const tile of [
      { x: 14, y: 24 },
      { x: 14, y: 30 },
      { x: 16, y: 32 },
      { x: 13, y: 31 },
    ]) {
      expect(terrainKindAt(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("water");
    }
  });

  it("keeps dock slots on coastline edges with water access", () => {
    expect(EVM_BAY_DOCK_TILES).toEqual([
      { x: 43, y: 31 },
      BASE_HARBOR_DOCK_TILE,
      { x: 32, y: 41 },
      { x: 26, y: 39 },
    ]);
    expect(OUTER_HARBOR_DOCK_TILES).toEqual([
      { x: 18, y: 35 },
      { x: 28, y: 22 },
      { x: 34, y: 22 },
      HYPERLIQUID_HARBOR_DOCK_TILE,
      { x: 33, y: 41 },
      { x: 23, y: 37 },
      { x: 25, y: 38 },
      { x: 27, y: 40 },
      { x: 43, y: 33 },
      { x: 25, y: 23 },
    ]);
    expect(OUTER_HARBOR_DOCK_TILES.every((tile) => !isInLighthouseClearance(tile))).toBe(true);
    expect(DOCK_TILES.every((tile) => !isWaterTileKind(tileKindAt(tile.x, tile.y)))).toBe(true);
    expect(DOCK_TILES.every((tile) => cardinalNeighbors(tile).some((neighbor) => (
      isWaterTileKind(tileKindAt(neighbor.x, neighbor.y))
    )))).toBe(true);
    expect(DOCK_TILES.every((tile) => outwardWaterDirections(tile).length > 0)).toBe(true);
    expect(DOCK_TILES.every((tile) => isProductionOutwardWater(tile))).toBe(true);
  });

  it("pins seawall blockers to coastal water outside dock openings", () => {
    expect(SEAWALL_BARRIER_TILES.length).toBeGreaterThanOrEqual(40);
    for (const tile of SEAWALL_BARRIER_TILES) {
      expect(isSeawallBarrierTile(tile)).toBe(true);
      expect(isWaterTileKind(tileKindAt(tile.x, tile.y)), `${tile.x}.${tile.y}`).toBe(true);
      expect(DOCK_TILES.some((dock) => dock.x === tile.x && dock.y === tile.y), `${tile.x}.${tile.y}`).toBe(false);
    }
  });

  it("resolves inland placement anchors back to water", () => {
    const tile = nearestWaterTile({ x: 32, y: 36 });

    expect(isWaterTileKind(tileKindAt(tile.x, tile.y))).toBe(true);
  });

  it("resolves occupied placement anchors to an open nearby water tile", () => {
    const occupied = new Set(["37.6"]);
    const tile = nearestAvailableWaterTile({ x: 37, y: 6 }, occupied);

    expect(`${tile.x}.${tile.y}`).not.toBe("37.6");
    expect(isWaterTileKind(tileKindAt(tile.x, tile.y))).toBe(true);
  });

  it("keeps nearest-water helpers off the seawall barrier", () => {
    const north = nearestWaterTile({ x: 28, y: 22 });
    const east = nearestAvailableWaterTile({ x: 44, y: 31 }, new Set());

    expect(isSeawallBarrierTile(north)).toBe(false);
    expect(isSeawallBarrierTile(east)).toBe(false);
    expect(north.y).toBeLessThanOrEqual(20);
    expect(east.x).toBeGreaterThanOrEqual(45);
  });

  it("closes the seawall ring around the interior harbor pockets", () => {
    for (const tile of [
      { x: 43, y: 28 },
      { x: 42, y: 26 },
      { x: 38, y: 37 },
    ]) {
      expect(isNavigableWaterTile(tile), `${tile.x}.${tile.y}`).toBe(false);
    }
    expect(isNavigableWaterTile({ x: 45, y: 28 })).toBe(true);
    expect(isNavigableWaterTile({ x: 39, y: 17 })).toBe(true);
  });

  it("scatters cemetery graves across expanded land with varied markers", () => {
    const graves = graveNodesFromEntries(CEMETERY_ENTRIES);
    const cemeteryIsland = connectedLandTileKeys({
      x: Math.round(CEMETERY_CENTER.x),
      y: Math.round(CEMETERY_CENTER.y),
    });
    const xs = graves.map((grave) => grave.tile.x);
    const ys = graves.map((grave) => grave.tile.y);

    expect(graves).toHaveLength(CEMETERY_ENTRIES.length);
    expect(CEMETERY_CENTER).toEqual({ x: 8.0, y: 50.0 });
    expect(CEMETERY_RADIUS).toEqual({ x: 3.3, y: 2.1 });
    expect(CEMETERY_CENTER.x).toBeLessThan(CIVIC_CORE_CENTER.x);
    expect(CEMETERY_CENTER.y).toBeGreaterThan(CIVIC_CORE_CENTER.y);
    expect(CEMETERY_CENTER.x).toBeLessThan(LIGHTHOUSE_TILE.x);
    expect(tileKindAt(Math.round(CEMETERY_CENTER.x), Math.round(CEMETERY_CENTER.y))).toBe("land");
    expect(terrainKindAt(Math.round(CEMETERY_CENTER.x), Math.round(CEMETERY_CENTER.y))).toBe("grass");
    // Cemetery islet is detached from the main island.
    expect(cemeteryIsland.has(tileKey({ x: LIGHTHOUSE_TILE.x, y: LIGHTHOUSE_TILE.y }))).toBe(false);
    expect(graves.every((grave) => tileKindAt(grave.tile.x, grave.tile.y) === "land")).toBe(true);
    expect(cemeteryIsland.has(tileKey({ x: Math.round(CEMETERY_CENTER.x), y: Math.round(CEMETERY_CENTER.y) }))).toBe(true);
    expect(graves.every((grave) => isNearConnectedLand(grave.tile, cemeteryIsland))).toBe(true);
    expect(graves.every((grave) => Math.hypot(grave.tile.x - LIGHTHOUSE_TILE.x, grave.tile.y - LIGHTHOUSE_TILE.y) > 10)).toBe(true);
    expect(graves.every((grave) => DOCK_TILES.every((dock) => Math.hypot(grave.tile.x - dock.x, grave.tile.y - dock.y) > 3.25))).toBe(true);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(4.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(3.5);
    expect(new Set(graves.map((grave) => grave.visual.marker)).size).toBeGreaterThan(2);
    expect(graves.filter((grave) => grave.entry.causeOfDeath === "regulatory").every((grave) => grave.visual.marker === "broken-keel")).toBe(true);
    expect(graves.filter((grave) => grave.entry.causeOfDeath === "liquidity-drain").every((grave) => grave.visual.marker === "sinking-stern")).toBe(true);
    expect(Math.max(...graves.map((grave) => grave.visual.scale))).toBeGreaterThan(0.42);
    expect(Math.min(...graves.map((grave) => grave.visual.scale))).toBeLessThan(0.27);
    expect(graves.reduce((sum, grave) => sum + grave.visual.scale, 0) / graves.length).toBeLessThan(0.38);
  });
});

function nearbyTiles(center: { x: number; y: number }, radius: number): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

function landBoundsExcludingCemetery(tiles: PharosVilleTile[]) {
  // Cemetery is its own islet now — exclude tiles within ~6 tiles of CEMETERY_CENTER
  // when measuring the main-island envelope.
  const landTiles = landTilesExcludingCemetery(tiles);
  const xs = landTiles.map((tile) => tile.x);
  const ys = landTiles.map((tile) => tile.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function landTilesExcludingCemetery(tiles: PharosVilleTile[]) {
  const cemeteryRadius = 6;
  return tiles.filter((tile) => {
    if (isWaterTileKind(tile.kind)) return false;
    const dx = tile.x - CEMETERY_CENTER.x;
    const dy = tile.y - CEMETERY_CENTER.y;
    return Math.hypot(dx, dy) > cemeteryRadius;
  });
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

function isInLighthouseClearance(tile: { x: number; y: number }) {
  return tile.x >= 14 && tile.x <= 24 && tile.y >= 23 && tile.y <= 32;
}

function isProductionOutwardWater(tile: { x: number; y: number }) {
  const outward = productionDockOutwardVector(tile);
  const waterTile = {
    x: tile.x + outward.x,
    y: tile.y + outward.y,
  };
  return isWaterTileKind(tileKindAt(waterTile.x, waterTile.y));
}

function productionDockOutwardVector(tile: { x: number; y: number }): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const center = (PHAROSVILLE_MAP_WIDTH - 1) / 2;
  const dx = tile.x - center;
  const dy = tile.y - center;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: dy < 0 ? -1 : 1 };
}

function cardinalNeighbors(tile: { x: number; y: number }): { x: number; y: number }[] {
  return cardinalDirections().map((direction) => ({
    x: tile.x + direction.x,
    y: tile.y + direction.y,
  }));
}

function cardinalDirections(): { x: number; y: number }[] {
  return [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
}


function connectedLandTileKeys(start: { x: number; y: number }): Set<string> {
  const visited = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const tile = queue.shift();
    if (!tile) continue;
    if (tile.x < 0 || tile.x >= PHAROSVILLE_MAP_WIDTH || tile.y < 0 || tile.y >= PHAROSVILLE_MAP_HEIGHT) continue;
    if (isWaterTileKind(tileKindAt(tile.x, tile.y))) continue;
    const key = tileKey(tile);
    if (visited.has(key)) continue;

    visited.add(key);
    queue.push(...cardinalNeighbors(tile));
  }

  return visited;
}

function isNearConnectedLand(tile: { x: number; y: number }, connected: ReadonlySet<string>): boolean {
  return nearbyTiles({ x: Math.round(tile.x), y: Math.round(tile.y) }, 1).some((candidate) => (
    connected.has(tileKey(candidate))
    && Math.hypot(candidate.x - tile.x, candidate.y - tile.y) < 1.25
  ));
}

function tileKey(tile: { x: number; y: number }): string {
  return `${tile.x}.${tile.y}`;
}

function terrainCounts(tiles: Array<{ terrain?: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    counts.set(String(tile.terrain), (counts.get(String(tile.terrain)) ?? 0) + 1);
  }
  return counts;
}
