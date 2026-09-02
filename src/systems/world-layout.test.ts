import { describe, expect, it } from "vitest";
import { CEMETERY_ENTRIES } from "@shared/lib/cemetery-merged";
import {
  SEA_BODY_NAMES,
  SEA_BODY_TARGET_SHARE,
  SEA_BODY_TERRAIN,
  type SeaBodyName,
} from "./sea-bodies";
import { seaBodyAnchors, seaBodyCentroidTile, seaBodyTiles } from "./sea-body-anchors";
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
  terrainKindAt,
  tileKindAt,
} from "./world-layout";
import { SEAWALL_BARRIER_TILES, isSeawallBarrierTile } from "./seawall";
import { dockOutwardVectorForTile } from "./dock-layout";
import { landWorldTile, zoneWorldTile } from "./map-scale";
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
/** `terrainKindAt` for a design-space LANDMASS coordinate. */
function landTerrain(x: number, y: number): ReturnType<typeof terrainKindAt> {
  const tile = landWorldTile({ x, y });
  return terrainKindAt(tile.x, tile.y);
}
/** Zone terrain AREAS scale with the map, so authored tile counts multiply by 4. */

/**
 * Every terrain that reads as an ATTRIBUTED body of sea, as opposed to the
 * generic `"water"` halo the island and lighthouse keep around themselves.
 * N2 added `wreck-water` (the south-west graveyard shoals) to this set.
 */

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
    // RIM FIELD REVISION 1: 3,205 asymmetric rim tiles move the measured water ratio to 0.8172.
    expect(map.waterRatio).toBeGreaterThanOrEqual(0.815);
    expect(map.waterRatio).toBeLessThanOrEqual(0.819);
    const mainIslandLandTiles = landTilesExcludingIslets(map.tiles);
    // Baseline was 592 main-island land tiles; 377 is a 36.3% reduction
    // resulting from the single-oval + lighthouse-promontory geometry. Neither
    // the N1 map growth nor the N2 cemetery drowning may change this — the
    // island is offset, not scaled, and the cemetery was never part of it.
    // RIM FIELD REVISION 1: the rim reshape remains disjoint, so the island stays exactly 377 tiles.
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
    // H4: the floors are authored 56-tile windows x MAP_SCALE^2. That model is
    // exact only at an integer scale — the zone predicates test INCLUSIVE integer
    // design bounds (`y <= 9`), which at 2.5 clips half a design row off each edge.
    // Ledger measures 1748 against a nominal 1750, so the floor is 278, not 280.
    // Z3: sizing is traffic-proportional now, so the ordering follows the
    // fleet. Danger Strait carries 11 ships against Warning Shoals' 5, so
    // Danger is the LARGER of the two — the reverse of the old authored
    // ordering, which gave the most narratively important water 1.4% of the sea
    // and packed it at 13x the density of the emptiest band.
    expect(counts.get("alert-water") ?? 0).toBeGreaterThan(counts.get("warning-water") ?? 0);
    expect(counts.get("storm-water") ?? 0).toBeGreaterThan(counts.get("warning-water") ?? 0);
    expect(counts.get("alert-water") ?? 0).toBeGreaterThan(counts.get("storm-water") ?? 0);
    expect(map.tiles.every((tile) => tile.terrain)).toBe(true);
    expect([...new Set(map.tiles.map((tile) => tile.terrain))]).toEqual(expect.arrayContaining([
      "alert-water",
      "calm-water",
      "ledger-water",
      "watch-water",
      "warning-water",
      "storm-water",
      "wreck-water",
      "rim",
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

  /**
   * Z1 (Sea Master, 2026-07-25): the three tests this replaces were point-dumps
   * of the old partition — roughly forty hand-listed tiles asserting that
   * `x <= 15` really did make Calm, that Ledger really did fill `y <= 9`, and
   * that the east corner rings really were rings. They passed for exactly as
   * long as the geometry they transcribed existed, and told you nothing about
   * whether that geometry was any good. The operator's complaint about the sea
   * zones was true the whole time these were green.
   *
   * What follows asserts the DESIGN instead: every body exists, is one piece,
   * holds roughly the share its traffic earns, and sits where the narrative
   * needs it. Those survive a reshape; a tile list cannot.
   */
  it("gives every named body a share close to its traffic target", () => {
    const { shares, total } = bodyShares();
    // RIM FIELD REVISION 1: recalibration puts all eight shares within 0.01 point over 16,001 body tiles.
    expect(total).toBeGreaterThan(15_000);
    for (const [body, target] of Object.entries(SEA_BODY_TARGET_SHARE)) {
      expect(shares[body as SeaBodyName], body).toBeGreaterThan(0);
      // +-2 points. The reach values are solved against these targets by
      // CALIBRATE_SEA_BODIES=1; drifting outside the band means a seed moved
      // and the solve was not re-run.
      expect(Math.abs(shares[body as SeaBodyName]! - target), `${body} share`).toBeLessThanOrEqual(0.02);
    }
  });

  it("keeps every named body in one piece", () => {
    // A partition by nearest-seed cannot leave gaps, but it CAN split a body in
    // two if its seeds are pulled apart — and a Calm Anchorage in two halves is
    // not an anchorage. Ships also path within their own water, so a detached
    // fragment is a place the fleet can be stranded.
    // RIM FIELD REVISION 1: the weakest hooked bodies still measure Ledger 0.936 and Alert 0.956 contiguous.
    for (const body of SEA_BODY_NAMES) {
      const tiles = seaBodyTiles(body);
      expect(tiles.length, body).toBeGreaterThan(0);
      expect(largestComponentShare(tiles), `${body} contiguity`).toBeGreaterThan(0.9);
    }
  });

  it("keeps the escalation running north-east and the poles apart", () => {
    // The world reads danger at one end and memory at the other, and the DEWS
    // ladder is a journey outward: sailing north-east from the anchorage you
    // cross calm, then watch, then alert, then warning, then the strait.
    const bearing = (body: SeaBodyName): number => {
      const tile = seaBodyCentroidTile(body)!;
      return (tile.x - tile.y) / PHAROSVILLE_MAP_WIDTH;
    };
    const ladder: SeaBodyName[] = ["calm", "watch", "alert", "warning", "danger"];
    for (let step = 1; step < ladder.length; step += 1) {
      expect(bearing(ladder[step]!), `${ladder[step]} vs ${ladder[step - 1]}`)
        .toBeGreaterThan(bearing(ladder[step - 1]!));
    }
    const danger = seaBodyCentroidTile("danger")!;
    const wreck = seaBodyCentroidTile("wreck")!;
    expect(danger.x).toBeGreaterThan(PHAROSVILLE_MAP_WIDTH * 0.6);
    expect(danger.y).toBeLessThan(PHAROSVILLE_MAP_HEIGHT * 0.4);
    expect(wreck.x).toBeLessThan(PHAROSVILLE_MAP_WIDTH * 0.4);
    expect(wreck.y).toBeGreaterThan(PHAROSVILLE_MAP_HEIGHT * 0.6);
  });

  it("lands every derived ship anchor in its own body", () => {
    // Anchors are farthest-point sampled from the body itself (Z3), so this is
    // the guard that the derivation stays honest — an anchor outside its body
    // silently reroutes the whole placement to the nearest edge.
    // RIM FIELD REVISION 1: the new Ledger and Danger shore spurs keep all fourteen derived anchors body-local.
    for (const body of SEA_BODY_NAMES) {
      const terrain = SEA_BODY_TERRAIN[body];
      for (const anchor of seaBodyAnchors(body, 14)) {
        expect(terrainKindAt(anchor.x, anchor.y), `${body} anchor ${anchor.x},${anchor.y}`).toBe(terrain);
      }
    }
  });

  it("keeps the island halo and the deep rim out of the named bodies", () => {
    // The approach water around the monument stays unattributed on purpose, and
    // the deep rim belongs to the open sea — letting it override named water
    // un-names every band authored to reach the map's edge.
    expect(terrainKindAt(CIVIC_CORE_CENTER.x + 14, CIVIC_CORE_CENTER.y)).toBe("water");
    expect(terrainKindAt(0, Math.round(PHAROSVILLE_MAP_HEIGHT / 2))).not.toBe("deep-water");
    const { shares } = bodyShares();
    expect(shares.open).toBeGreaterThan(0.2);
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
    // H1: the twelve slots are DERIVED from the island's coastline, so this
    // pins the properties that make them a harbour ring rather than a list of
    // tiles that has to be re-authored whenever the island is retuned.
    expect(DOCK_TILES).toHaveLength(12);
    expect(new Set(DOCK_TILES.map((tile) => `${tile.x}.${tile.y}`)).size).toBe(12);
    expect(EVM_BAY_DOCK_TILES[1]).toEqual(BASE_HARBOR_DOCK_TILE);
    expect(OUTER_HARBOR_DOCK_TILES[3]).toEqual(HYPERLIQUID_HARBOR_DOCK_TILE);
    expect(DOCK_TILES.every((tile) => !isWaterTileKind(tileKindAt(tile.x, tile.y)))).toBe(true);
    expect(DOCK_TILES.every((tile) => cardinalNeighbors(tile).some((neighbor) => (
      isWaterTileKind(tileKindAt(neighbor.x, neighbor.y))
    )))).toBe(true);
    expect(DOCK_TILES.every((tile) => outwardWaterDirections(tile).length > 0)).toBe(true);
    expect(DOCK_TILES.every((tile) => isProductionOutwardWater(tile))).toBe(true);
  });

  it("spreads the harbour ring right around the island", () => {
    // The failure this guards is the one the operator reported: harbours
    // bunched on one arc (six of twelve were on the southern coast) and
    // sitting inland rather than on the water's edge.
    const center = landWorldTile({ x: 31, y: 31 });
    const quadrants = new Set(DOCK_TILES.map((tile) => (
      `${tile.x >= center.x ? "E" : "W"}${tile.y >= center.y ? "S" : "N"}`
    )));
    expect(quadrants.size).toBe(4);

    for (const tile of DOCK_TILES) {
      // On the coast: the next tile outward is water, not more island.
      const outward = dockOutwardVectorForTile(tile);
      expect(
        isWaterTileKind(tileKindAt(tile.x + outward.x, tile.y + outward.y)),
        `${tile.x}.${tile.y} is not on the waterline`,
      ).toBe(true);
    }

    // No two slots collide, and none is far enough from its neighbours to
    // leave a bare stretch of coast (the ring is ~68 tiles round).
    for (const tile of DOCK_TILES) {
      const nearest = Math.min(...DOCK_TILES
        .filter((other) => other !== tile)
        .map((other) => Math.hypot(other.x - tile.x, other.y - tile.y)));
      expect(nearest, `${tile.x}.${tile.y}`).toBeGreaterThan(3.5);
      expect(nearest, `${tile.x}.${tile.y}`).toBeLessThan(11);
    }
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
    // RIM FIELD: perimeter land is real terrain but not part of the unchanged 377-tile lighthouse island.
    if (tile.terrain === "rim") return false;
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

// Exercises the SAME outward vector production docks and gangways use, rather
// than a second copy of the rule that can drift away from it.
function isProductionOutwardWater(tile: { x: number; y: number }) {
  const outward = dockOutwardVectorForTile(tile);
  const waterTile = {
    x: tile.x + outward.x,
    y: tile.y + outward.y,
  };
  return isWaterTileKind(tileKindAt(waterTile.x, waterTile.y));
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

/** Share of the classified sea each body holds. */
function bodyShares(): { shares: Record<SeaBodyName, number>; total: number } {
  const counts = Object.fromEntries(SEA_BODY_NAMES.map((name) => [name, 0])) as Record<SeaBodyName, number>;
  let total = 0;
  for (const body of SEA_BODY_NAMES) {
    counts[body] = seaBodyTiles(body).length;
    total += counts[body];
  }
  const shares = Object.fromEntries(
    SEA_BODY_NAMES.map((name) => [name, counts[name] / total]),
  ) as Record<SeaBodyName, number>;
  return { shares, total };
}

/** Fraction of a body's tiles that sit in its single largest connected component. */
function largestComponentShare(tiles: readonly { x: number; y: number }[]): number {
  const members = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
  const seen = new Set<string>();
  let largest = 0;
  for (const tile of tiles) {
    const start = `${tile.x},${tile.y}`;
    if (seen.has(start)) continue;
    let size = 0;
    const queue = [tile];
    seen.add(start);
    while (queue.length > 0) {
      const current = queue.pop()!;
      size += 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const key = `${current.x + dx},${current.y + dy}`;
        if (!members.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push({ x: current.x + dx, y: current.y + dy });
      }
    }
    if (size > largest) largest = size;
  }
  return largest / tiles.length;
}
