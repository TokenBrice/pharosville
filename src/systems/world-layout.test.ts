import { describe, expect, it } from "vitest";
import { CEMETERY_ENTRIES } from "@shared/lib/cemetery-merged";
import {
  buildPharosVilleMap,
  CEMETERY_CENTER,
  CEMETERY_RADIUS,
  DOCK_TILES,
  BASE_HARBOR_DOCK_TILE,
  EVM_BAY_DOCK_TILES,
  HYPERLIQUID_HARBOR_DOCK_TILE,
  graveNodesFromEntries,
  isNavigableWaterTile,
  isWaterTileKind,
  LIGHTHOUSE_TILE,
  OUTER_HARBOR_DOCK_TILES,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  PIGEON_ISLAND_CENTER,
  PIGEONNIER_HARBOR_DOCK_TILE,
  nearestAvailableWaterTile,
  nearestWaterTile,
  REGION_TILES,
  terrainKindAt,
  tileKindAt,
} from "./world-layout";
import { SEAWALL_BARRIER_TILES, isSeawallBarrierTile } from "./seawall";
import { PHAROSVILLE_MAP_SCALE, landWorldTile, zoneWorldTile } from "./map-scale";
import type { PharosVilleTile } from "./world-types";

// N1: the live grid is 112x112, but terrain and zones stay AUTHORED in the
// original 56-tile DESIGN space. Every literal below is therefore a design-space
// coordinate (so it still matches the authored diagrams), passed through one of
// the two transforms:
// - `landWorldTile` OFFSETS landmass features (+28 on each axis). The island,
//   cemetery, pigeonnier, docks and lighthouse keep their absolute size.
// - `zoneWorldTile` SCALES zone geometry (x2 on each axis). DEWS bands stretch
//   to fill the enlarged sea.
/** `terrainKindAt` for a design-space ZONE coordinate. */
function zoneTerrain(x: number, y: number): ReturnType<typeof terrainKindAt> {
  const tile = zoneWorldTile({ x, y });
  return terrainKindAt(tile.x, tile.y);
}
/** `terrainKindAt` for a design-space LANDMASS coordinate. */
function landTerrain(x: number, y: number): ReturnType<typeof terrainKindAt> {
  const tile = landWorldTile({ x, y });
  return terrainKindAt(tile.x, tile.y);
}
/** Zone terrain AREAS scale with the map, so authored tile counts multiply by 4. */
const AREA_SCALE = PHAROSVILLE_MAP_SCALE ** 2;

/**
 * Every terrain that reads as an ATTRIBUTED body of sea, as opposed to the
 * generic `"water"` halo the island and lighthouse keep around themselves.
 * N2 added `wreck-water` (the south-west graveyard shoals) to this set.
 */
const NAMED_SEA_TERRAINS = [
  "calm-water",
  "watch-water",
  "alert-water",
  "warning-water",
  "storm-water",
  "ledger-water",
  "wreck-water",
] as const;

const CIVIC_CORE_DESIGN = { x: 31, y: 31 } as const;
const CIVIC_CORE_CENTER = landWorldTile(CIVIC_CORE_DESIGN);
const isLandTileKind = (kind: ReturnType<typeof tileKindAt>) => !isWaterTileKind(kind);
const isLandTerrainKind = (kind: ReturnType<typeof terrainKindAt>) => !kind.endsWith("-water");

describe("buildPharosVilleMap", () => {
  it("creates a sea-first authored map", () => {
    const map = buildPharosVilleMap();

    expect(map.width).toBe(PHAROSVILLE_MAP_WIDTH);
    expect(map.height).toBe(PHAROSVILLE_MAP_HEIGHT);
    expect(map.tiles).toHaveLength(PHAROSVILLE_MAP_WIDTH * PHAROSVILLE_MAP_HEIGHT);
    // THRESHOLD CHANGE, twice over. N1: land is OFFSET, not scaled, so the
    // island's absolute footprint sits in a 4x sea and the water share rose from
    // ~0.86 at 56x56 to ~0.9647. N2: the cemetery islet became open water (the
    // wreck shoals), removing its ~65 land tiles, and the measured share is now
    // 0.9699. The invariant that still holds exactly is the absolute main-island
    // footprint asserted just below.
    expect(map.waterRatio).toBeGreaterThanOrEqual(0.968);
    expect(map.waterRatio).toBeLessThanOrEqual(0.972);
    const mainIslandLandTiles = landTilesExcludingIslets(map.tiles);
    // Baseline was 592 main-island land tiles; 377 is a 36.3% reduction
    // resulting from the single-oval + lighthouse-promontory geometry. Neither
    // the N1 map growth nor the N2 cemetery drowning may change this — the
    // island is offset, not scaled, and the cemetery was never part of it.
    expect(mainIslandLandTiles).toHaveLength(377);
    const mainIslandBounds = landBoundsExcludingIslets(map.tiles);
    const islandEnvelopeMin = landWorldTile({ x: 15, y: 22 });
    const islandEnvelopeMax = landWorldTile({ x: 42, y: 40 });
    expect(mainIslandBounds.minX).toBeGreaterThanOrEqual(islandEnvelopeMin.x);
    expect(mainIslandBounds.maxX).toBeLessThanOrEqual(islandEnvelopeMax.x);
    expect(mainIslandBounds.minY).toBeGreaterThanOrEqual(islandEnvelopeMin.y);
    expect(mainIslandBounds.maxY).toBeLessThanOrEqual(islandEnvelopeMax.y);
    const mainCenter = {
      x: (mainIslandBounds.minX + mainIslandBounds.maxX) / 2,
      y: (mainIslandBounds.minY + mainIslandBounds.maxY) / 2,
    };
    // The lighthouse promontory bulges west of the main oval, so the geometric
    // center of the land mask sits ~2.5 tiles west of the civic core by design.
    expect(Math.abs(mainCenter.x - CIVIC_CORE_CENTER.x)).toBeLessThan(3);
    expect(Math.abs(mainCenter.y - CIVIC_CORE_CENTER.y)).toBeLessThan(2);
    const counts = terrainCounts(map.tiles);
    expect((counts.get("deep-water") ?? 0) / map.tiles.length).toBeLessThanOrEqual(0.03);
    expect(counts.get("calm-water") ?? 0).toBeGreaterThan(counts.get("watch-water") ?? 0);
    expect(counts.get("calm-water") ?? 0).toBeGreaterThan(counts.get("ledger-water") ?? 0);
    // Zone areas scale with the map: the authored 56-tile floors x MAP_SCALE².
    expect(counts.get("ledger-water") ?? 0).toBeGreaterThanOrEqual(280 * AREA_SCALE);
    expect(counts.get("watch-water") ?? 0).toBeGreaterThanOrEqual(80 * AREA_SCALE);
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
      "wreck-water",
      "grass",
      "rock",
    ]));
    expect([...new Set(map.tiles.map((tile) => tile.terrain))]).not.toContain("road");
  });

  it("defines a civic core around the island center", () => {
    expect(CIVIC_CORE_DESIGN).toEqual({ x: 31, y: 31 });
    expect(isLandTileKind(tileKindAt(CIVIC_CORE_CENTER.x, CIVIC_CORE_CENTER.y))).toBe(true);
    expect(terrainKindAt(CIVIC_CORE_CENTER.x, CIVIC_CORE_CENTER.y)).toBe("rock");
  });

  it("places the lighthouse on the western shoulder clear of outer harbors", () => {
    expect(LIGHTHOUSE_TILE).toEqual(landWorldTile({ x: 18, y: 28 }));
    expect(LIGHTHOUSE_TILE.x).toBeLessThan(CIVIC_CORE_CENTER.x);
    expect(LIGHTHOUSE_TILE.y).toBeLessThan(CIVIC_CORE_CENTER.y);
    expect(isLandTileKind(tileKindAt(LIGHTHOUSE_TILE.x, LIGHTHOUSE_TILE.y))).toBe(true);
  });

  it("places the pigeonnier on a tiny islet in the southeast Watch shelf", () => {
    // The islet is authored relative to the Watch shelf, so it SCALES with the
    // zone bands rather than riding the island offset (N1).
    expect(PIGEON_ISLAND_CENTER).toEqual(zoneWorldTile({ x: 50, y: 50 }));
    // The center tile is land (grass), and the islet is detached: cardinal
    // neighbors are watch-water, so the pigeonnier reads as a single-tile
    // platform off the south coast rather than fused to the main island.
    expect(terrainKindAt(PIGEON_ISLAND_CENTER.x, PIGEON_ISLAND_CENTER.y)).toBe("grass");
    expect(terrainKindAt(PIGEON_ISLAND_CENTER.x - 1, PIGEON_ISLAND_CENTER.y)).toBe("watch-water");
    expect(terrainKindAt(PIGEON_ISLAND_CENTER.x + 1, PIGEON_ISLAND_CENTER.y)).toBe("watch-water");
    expect(terrainKindAt(PIGEON_ISLAND_CENTER.x, PIGEON_ISLAND_CENTER.y - 1)).toBe("watch-water");
    expect(terrainKindAt(PIGEON_ISLAND_CENTER.x, PIGEON_ISLAND_CENTER.y + 1)).toBe("watch-water");
  });

  it("anchors the TON pigeonnier wharf in watch-water immediately west of the pigeonnier islet", () => {
    expect(PIGEONNIER_HARBOR_DOCK_TILE).toEqual({ x: PIGEON_ISLAND_CENTER.x - 1, y: PIGEON_ISLAND_CENTER.y });
    expect(terrainKindAt(PIGEONNIER_HARBOR_DOCK_TILE.x, PIGEONNIER_HARBOR_DOCK_TILE.y)).toBe("watch-water");
  });

  it("keeps the civic core natural without road terrain", () => {
    // Central rock interior around the island harbor ring (design space).
    expect(landTerrain(37, 30)).toBe("rock");
    expect(landTerrain(38, 31)).toBe("rock");
    expect(landTerrain(34, 30)).toBe("rock");
    expect(landTerrain(31, 29)).toBe("rock");
    expect(landTerrain(30, 35)).toBe("rock");
    expect(landTerrain(32, 33)).toBe("rock");
    // Harbor ring slots stay natural land/coast, not roads.
    expect(isLandTerrainKind(landTerrain(23, 37))).toBe(true);
    expect(isLandTerrainKind(landTerrain(26, 39))).toBe(true);
    // N2: the graveyard is sea now, so nothing outside the island reads as land.
    expect(terrainKindAt(Math.round(CEMETERY_CENTER.x), Math.round(CEMETERY_CENTER.y))).toBe("wreck-water");
  });

  it("keeps risk anchors on matching water terrain", () => {
    expect(Object.values(REGION_TILES).every((tile) => isWaterTileKind(tileKindAt(tile.x, tile.y)))).toBe(true);
    expect(terrainKindAt(REGION_TILES["safe-harbor"].x, REGION_TILES["safe-harbor"].y)).toBe("calm-water");
    expect(terrainKindAt(REGION_TILES["breakwater-edge"].x, REGION_TILES["breakwater-edge"].y)).toBe("watch-water");
    expect(terrainKindAt(REGION_TILES["harbor-mouth-watch"].x, REGION_TILES["harbor-mouth-watch"].y)).toBe("alert-water");
    expect(terrainKindAt(REGION_TILES["outer-rough-water"].x, REGION_TILES["outer-rough-water"].y)).toBe("warning-water");
    expect(terrainKindAt(REGION_TILES["storm-shelf"].x, REGION_TILES["storm-shelf"].y)).toBe("storm-water");
    expect(terrainKindAt(REGION_TILES["ledger-mooring"].x, REGION_TILES["ledger-mooring"].y)).toBe("ledger-water");
    // N2: the bottom of the left edge is the wreck shoals, not Calm.
    expect(zoneTerrain(0, 55)).toBe("wreck-water");
    expect(zoneTerrain(47, 52)).toBe("watch-water");
    expect(zoneTerrain(50, 55)).toBe("watch-water");
  });

  it("splits the left edge between Calm Anchorage above and the wreck shoals below, with Watch in the south basin", () => {
    // N2 carved the extreme south-west corner out of Calm Anchorage and made it
    // the wreck shoals. Calm still owns the left edge ABOVE the shoals and the
    // whole south basin west of Watch; the two facts are asserted together so
    // neither zone can quietly eat the other.
    const calmSamples = [
      { x: 0, y: 13 },
      { x: 0, y: 27 },
      { x: 0, y: 38 }, // last calm tile on the left edge before the shoals
      { x: 6, y: 20 },
      { x: 14, y: 42 },
      { x: 18, y: 47 },
      { x: 28, y: 50 },
      { x: 34, y: 44 },
      { x: 37, y: 55 },
      { x: 44, y: 34 },
      { x: 45, y: 35 },
    ];
    // The graveyard corner: the sea south-west of the Calm boundary.
    const wreckSamples = [
      { x: 0, y: 39 }, // first shoal tile on the left edge
      { x: 0, y: 55 },
      { x: 1, y: 54 },
      { x: 6, y: 49 }, // authored wreck-scatter center
    ];
    const watchSamples = [
      { x: 38, y: 52 },
      { x: 38, y: 55 },
      { x: 48, y: 44 },
      { x: 52, y: 42 },
      { x: 55, y: 38 },
      { x: 55, y: 25 },
      { x: 50, y: 30 },
      { x: 43, y: 54 },
      { x: 49, y: 50 },
    ];

    for (const tile of calmSamples) {
      expect(zoneTerrain(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("calm-water");
    }
    for (const tile of wreckSamples) {
      expect(zoneTerrain(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("wreck-water");
    }
    for (const tile of watchSamples) {
      expect(zoneTerrain(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("watch-water");
    }
  });

  it("places Ledger Mooring across the entire top shelf while preserving the east risk stack", () => {
    const ledgerSamples = [
      { x: 0, y: 0 },
      { x: 0, y: 9 },
      { x: 7, y: 0 },
      { x: 14, y: 0 },
      { x: 22, y: 0 },
      { x: 25, y: 0 },
      { x: 30, y: 1 },
      { x: 30, y: 5 },
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
      expect(zoneTerrain(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("ledger-water");
    }
    for (const tile of southeastWatchSamples) {
      expect(zoneTerrain(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("watch-water");
    }
    // Calm claims the southwest south basin plus the two circled pockets;
    // Watch resumes east/southeast of those reclaimed areas.
    expect(zoneTerrain(28, 50)).toBe("calm-water");
    expect(zoneTerrain(34, 44)).toBe("calm-water");
    expect(zoneTerrain(44, 34)).toBe("calm-water");
    expect(zoneTerrain(37, 55)).toBe("calm-water");
    expect(zoneTerrain(38, 55)).toBe("watch-water");
    expect(zoneTerrain(43, 54)).toBe("watch-water");
    // Ledger ends at y=9; Calm picks up at y=10 along the western flank so
    // the two zones touch without overlap.
    expect(zoneTerrain(0, 10)).toBe("calm-water");
    expect(zoneTerrain(15, 10)).toBe("calm-water");
    // Ledger is snapped to the top-left corner; freed water immediately east
    // of x=30 belongs to Watch before the Alert ring takes over.
    expect(zoneTerrain(25, 0)).toBe("ledger-water");
    expect(zoneTerrain(30, 1)).toBe("ledger-water");
    expect(zoneTerrain(31, 0)).toBe("watch-water");
    expect(zoneTerrain(34, 2)).toBe("watch-water");
    expect(zoneTerrain(37, 5)).toBe("watch-water");
    expect(zoneTerrain(39, 7)).toBe("alert-water");
    expect(zoneTerrain(40, 5)).toBe("alert-water");
    expect(zoneTerrain(40, 0)).toBe("alert-water");
    expect(zoneTerrain(47, 14)).toBe("alert-water");
    expect(zoneTerrain(52, 14)).toBe("alert-water");
    expect(zoneTerrain(55, 17)).toBe("alert-water");
    expect(zoneTerrain(55, 18)).toBe("watch-water");
    expect(zoneTerrain(43, 34)).toBe("calm-water");
    expect(zoneTerrain(55, 38)).toBe("watch-water");
    expect(zoneTerrain(45, 0)).toBe("warning-water");
    expect(zoneTerrain(55, 0)).toBe("storm-water");
  });

  it("extends named sea water over the exposed outer perimeter while keeping the island halo generic", () => {
    for (const tile of [
      { x: 0, y: 54 }, // N2: the south-west perimeter is wreck shoals now
      { x: 1, y: 55 },
      { x: 55, y: 24 },
      { x: 55, y: 38 },
      { x: 44, y: 40 },
      { x: 51, y: 31 },
    ]) {
      expect(NAMED_SEA_TERRAINS, `${tile.x}.${tile.y}`).toContain(zoneTerrain(tile.x, tile.y));
    }

    // The generic halo hugs the island, so these samples are landmass-relative.
    for (const tile of [
      { x: 17, y: 24 },
      { x: 19, y: 39 },
    ]) {
      expect(landTerrain(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("water");
    }
  });

  it("keeps the immediate lighthouse mountain water buffer generic", () => {
    for (const tile of [
      { x: 14, y: 24 },
      { x: 14, y: 30 },
      { x: 16, y: 32 },
      { x: 13, y: 31 },
    ]) {
      expect(landTerrain(tile.x, tile.y), `${tile.x}.${tile.y}`).toBe("water");
    }
  });

  it("keeps dock slots on coastline edges with water access", () => {
    // Docks ride the island perimeter, so they are authored in design space and
    // offset onto the enlarged grid with the island (N1).
    expect(EVM_BAY_DOCK_TILES).toEqual([
      landWorldTile({ x: 42, y: 31 }),
      BASE_HARBOR_DOCK_TILE,
      landWorldTile({ x: 32, y: 40 }),
      landWorldTile({ x: 26, y: 39 }),
    ]);
    expect(OUTER_HARBOR_DOCK_TILES).toEqual([
      landWorldTile({ x: 21, y: 36 }),
      landWorldTile({ x: 32, y: 22 }), // tron — slid east toward Yggdrasil to clear the new (W6.09) Solana footprint
      landWorldTile({ x: 25, y: 23 }), // solana — NW shoulder near lighthouse (was the spare slot)
      HYPERLIQUID_HARBOR_DOCK_TILE, // design (36, 39) — S periphery between Base and Arbitrum
      landWorldTile({ x: 28, y: 22 }), // aptos — took Tron's previous N-wall slot
      landWorldTile({ x: 33, y: 40 }),
      landWorldTile({ x: 42, y: 28 }),
      landWorldTile({ x: 35, y: 39 }),
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
    // Design-space island interior, offset onto the enlarged grid.
    const tile = nearestWaterTile(landWorldTile({ x: 32, y: 36 }));

    expect(isWaterTileKind(tileKindAt(tile.x, tile.y))).toBe(true);
  });

  it("resolves occupied placement anchors to an open nearby water tile", () => {
    // Zone water on the top shelf, so this anchor scales with the zone bands.
    const anchor = zoneWorldTile({ x: 37, y: 6 });
    const anchorKey = `${anchor.x}.${anchor.y}`;
    const occupied = new Set([anchorKey]);
    const tile = nearestAvailableWaterTile(anchor, occupied);

    expect(`${tile.x}.${tile.y}`).not.toBe(anchorKey);
    expect(isWaterTileKind(tileKindAt(tile.x, tile.y))).toBe(true);
  });

  it("keeps nearest-water helpers off the seawall barrier", () => {
    const north = nearestWaterTile(landWorldTile({ x: 28, y: 22 }));
    const east = nearestAvailableWaterTile(landWorldTile({ x: 43, y: 31 }), new Set());

    expect(isSeawallBarrierTile(north)).toBe(false);
    expect(isSeawallBarrierTile(east)).toBe(false);
    // Nearest navigable water above the N shelf must clear the immediate
    // seawall moat outside design (28, 22). Open water resumes at design y=21
    // because the perimeter only barriers tiles cardinally adjacent to land.
    expect(north.y).toBeLessThanOrEqual(landWorldTile({ x: 0, y: 21 }).y);
    expect(east.x).toBeGreaterThanOrEqual(landWorldTile({ x: 44, y: 0 }).x);
  });

  it("closes the seawall ring around the interior harbor pockets", () => {
    // All design-space, island-relative: the seawall follows the island coast.
    for (const tile of [
      { x: 43, y: 28 },
      { x: 42, y: 26 },
      { x: 38, y: 37 },
    ].map(landWorldTile)) {
      expect(isNavigableWaterTile(tile), `${tile.x}.${tile.y}`).toBe(false);
    }
    expect(isNavigableWaterTile(landWorldTile({ x: 45, y: 28 }))).toBe(true);
    expect(isNavigableWaterTile(landWorldTile({ x: 39, y: 17 }))).toBe(true);
  });

  it("strews wrecks across the south-west shoals with varied markers", () => {
    // N2: the memorial islet is gone. Dead and frozen stablecoins are an
    // accumulation of wrecks lying on the wreck shoals — open, slack sea in the
    // south-west corner — so every assertion here is about WATER, not land.
    const graves = graveNodesFromEntries(CEMETERY_ENTRIES);
    const shoals = connectedTerrainTileKeys(
      { x: Math.round(CEMETERY_CENTER.x), y: Math.round(CEMETERY_CENTER.y) },
      "wreck-water",
    );
    const xs = graves.map((grave) => grave.tile.x);
    const ys = graves.map((grave) => grave.tile.y);

    expect(graves).toHaveLength(CEMETERY_ENTRIES.length);
    // The scatter region is authored in ZONE space (it is a body of water now),
    // and widened so wrecks spread over the shoals instead of a churchyard plot.
    expect(CEMETERY_CENTER).toEqual(zoneWorldTile({ x: 6.0, y: 49.0 }));
    expect(CEMETERY_RADIUS).toEqual({ x: 12.0, y: 9.0 });
    expect(CEMETERY_CENTER.x).toBeLessThan(CIVIC_CORE_CENTER.x);
    expect(CEMETERY_CENTER.y).toBeGreaterThan(CIVIC_CORE_CENTER.y);
    expect(CEMETERY_CENTER.x).toBeLessThan(LIGHTHOUSE_TILE.x);
    expect(tileKindAt(Math.round(CEMETERY_CENTER.x), Math.round(CEMETERY_CENTER.y))).toBe("water");
    expect(terrainKindAt(Math.round(CEMETERY_CENTER.x), Math.round(CEMETERY_CENTER.y))).toBe("wreck-water");
    // Every wreck lies on the shoals, and the shoals are ONE body of water —
    // the whole graveyard is sailable, with no marooned pockets.
    expect(graves.every((grave) => terrainKindAt(grave.tile.x, grave.tile.y) === "wreck-water")).toBe(true);
    expect(graves.every((grave) => isNearConnectedTile(grave.tile, shoals))).toBe(true);
    expect(shoals.size).toBe(terrainCounts(buildPharosVilleMap().tiles).get("wreck-water"));
    // The graveyard keeps its distance from the living harbor.
    expect(graves.every((grave) => Math.hypot(grave.tile.x - LIGHTHOUSE_TILE.x, grave.tile.y - LIGHTHOUSE_TILE.y) > 10)).toBe(true);
    expect(graves.every((grave) => DOCK_TILES.every((dock) => Math.hypot(grave.tile.x - dock.x, grave.tile.y - dock.y) > 3.25))).toBe(true);
    // THRESHOLD CHANGE: the old floors (4.5 x 3.5) were sized for the 3.3x2.1
    // churchyard plot. Derive them from the widened scatter radius instead —
    // wrecks must span more than one half-axis on each side. Measured spread is
    // 21.35 x 15.85 against radii of 12 x 9.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(CEMETERY_RADIUS.x);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(CEMETERY_RADIUS.y);
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

function landBoundsExcludingIslets(tiles: PharosVilleTile[]) {
  const landTiles = landTilesExcludingIslets(tiles);
  const xs = landTiles.map((tile) => tile.x);
  const ys = landTiles.map((tile) => tile.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// N2: the cemetery is no longer land, so the pigeonnier platform is the only
// detached landmass left to exclude when measuring the main-island envelope.
function landTilesExcludingIslets(tiles: PharosVilleTile[]) {
  const pigeonRadius = 2;
  return tiles.filter((tile) => {
    if (isWaterTileKind(tile.kind)) return false;
    const dPigeon = Math.hypot(tile.x - PIGEON_ISLAND_CENTER.x, tile.y - PIGEON_ISLAND_CENTER.y);
    return dPigeon > pigeonRadius;
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
  // Design-space clearance box around the lighthouse mountain, offset onto the
  // enlarged grid with the island (N1).
  const min = landWorldTile({ x: 14, y: 23 });
  const max = landWorldTile({ x: 24, y: 32 });
  return tile.x >= min.x && tile.x <= max.x && tile.y >= min.y && tile.y <= max.y;
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


/** Flood-fills the contiguous run of `terrain` tiles reachable from `start`. */
function connectedTerrainTileKeys(
  start: { x: number; y: number },
  terrain: ReturnType<typeof terrainKindAt>,
): Set<string> {
  const visited = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const tile = queue.shift();
    if (!tile) continue;
    if (tile.x < 0 || tile.x >= PHAROSVILLE_MAP_WIDTH || tile.y < 0 || tile.y >= PHAROSVILLE_MAP_HEIGHT) continue;
    if (terrainKindAt(tile.x, tile.y) !== terrain) continue;
    const key = tileKey(tile);
    if (visited.has(key)) continue;

    visited.add(key);
    queue.push(...cardinalNeighbors(tile));
  }

  return visited;
}

function isNearConnectedTile(tile: { x: number; y: number }, connected: ReadonlySet<string>): boolean {
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
