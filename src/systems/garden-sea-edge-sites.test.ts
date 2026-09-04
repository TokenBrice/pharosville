import { describe, expect, it } from "vitest";
import { SEA_REGION_ID, seaRegionAtTile } from "./garden-sea-regions";
import { RIM_COVES, rimLandAt } from "./garden-rim";
import { SHIP_WATER_ANCHORS } from "./risk-water-areas";
import {
  GARDEN_EDGE_STONE_OBSTACLES,
  GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES,
  GARDEN_SEA_EDGE_ISLAND_WATERLINE,
  GARDEN_SEA_EDGE_SCALE_FACTOR,
  GARDEN_SEA_EDGE_SHED_LIST,
  GARDEN_SEA_EDGE_SITES,
  seaEdgeBoundaryAt,
  seaEdgeTileInOpening,
} from "./garden-sea-edge-sites";
import {
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
  isWaterTileKind,
  terrainKindAt,
} from "./world-layout";
import { distanceToStationFootprint, stationFootprintRect } from "./dock-layout";

// R4: use the same cove-rooted oriented rectangle contract as every consumer.
const STATION_FOOTPRINTS = [
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
].flat().map((slot) => stationFootprintRect(
  slot.type,
  slot.cove.tile,
  slot.cove.seawardBearing,
  slot.cove.id,
));

describe("garden sea-edge sites", () => {
  it("gives every named body authored edge geography and leaves open approach empty", () => {
    const bodies = new Set(GARDEN_SEA_EDGE_SITES.map((site) => site.body));
    expect(bodies).toEqual(new Set(["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"]));
    expect(GARDEN_SEA_EDGE_SITES.some((site) => (site.body as string) === "open")).toBe(false);
    expect(GARDEN_SEA_EDGE_SITES.map((site) => site.form)).toEqual(expect.arrayContaining([
      "reed-lily",
      "low-bank",
      "stone-tongue",
      "warning-buoy",
      "shoal-bar",
      "cliff",
      "slate-edge",
      "timber-pile",
      "inlet-stone",
    ]));
    expect(Object.keys(GARDEN_SEA_EDGE_SHED_LIST).sort()).toEqual([...bodies].sort());
    for (const displacement of Object.values(GARDEN_SEA_EDGE_SHED_LIST)) {
      expect(displacement).toMatch(/demote/i);
    }
  });

  it("enlarges water-edge tongues, bars and piles by the authored scale factor", () => {
    expect(GARDEN_SEA_EDGE_SCALE_FACTOR).toBe(1.5);
    expect(GARDEN_SEA_EDGE_SITES.find((site) => site.id === "alert-tongue-west"))
      .toMatchObject({ height: 1.25 * 1.5, length: 7.2 * 1.5, width: 2.2 * 1.5 });
    expect(GARDEN_SEA_EDGE_SITES.find((site) => site.id === "warning-bar-inner"))
      .toMatchObject({ height: 0.48 * 1.5, length: 5.4 * 1.5, width: 2 * 1.5 });
    expect(GARDEN_SEA_EDGE_SITES.find((site) => site.id === "ledger-pile-1"))
      .toMatchObject({ height: 2.7 * 1.5, length: 0.55 * 1.5, width: 0.55 * 1.5 });
    // The displaced Danger wall keeps its reviewed, non-enlarged footprint.
    expect(GARDEN_SEA_EDGE_SITES.find((site) => site.id === "danger-rim-cliff"))
      .toMatchObject({ height: 5.2, length: 5.4, width: 1.2 });
  });

  it("resolves every water element onto its live field boundary", () => {
    const cliff = GARDEN_SEA_EDGE_SITES.find((site) => site.form === "cliff");
    expect(cliff).toMatchObject({ body: "danger", surface: "water" });
    expect(cliff!.tile).toEqual({ x: 121, y: 50 });
    expect([
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ].some((offset) => (
      seaRegionAtTile(cliff!.tile.x + offset.x, cliff!.tile.y + offset.y)
        === SEA_REGION_ID.watch
    ))).toBe(true);

    for (const site of GARDEN_SEA_EDGE_SITES) {
      expect(isWaterTileKind(terrainKindAt(site.tile.x, site.tile.y)), site.id).toBe(true);
      expect(rimLandAt(site.tile.x, site.tile.y), site.id).toBe(false);
      expect(seaRegionAtTile(site.tile.x, site.tile.y), site.id).toBe(SEA_REGION_ID[site.body]);
      expect(seaEdgeBoundaryAt(site.tile, site.body), site.id).toBe(true);
      expect(seaEdgeTileInOpening(site.tile), site.id).toBe(false);
    }
  });

  it("keeps every footprint a hull-clear distance from anchorage moorings, coves and island waterline", () => {
    const moorings = Object.values(SHIP_WATER_ANCHORS).flat();
    const island = GARDEN_SEA_EDGE_ISLAND_WATERLINE;
    for (const site of GARDEN_SEA_EDGE_SITES) {
      for (const mooring of moorings) {
        expect(Math.hypot(site.tile.x - mooring.x, site.tile.y - mooring.y), `${site.id} / mooring`)
          .toBeGreaterThanOrEqual(site.footprintRadius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES);
      }
      for (const cove of RIM_COVES) {
        expect(Math.hypot(site.tile.x - cove.tile.x, site.tile.y - cove.tile.y), `${site.id} / ${cove.id}`)
          .toBeGreaterThanOrEqual(
            site.footprintRadius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES,
          );
      }
      const islandValue = ((site.tile.x - island.x)
        / (island.rx + site.footprintRadius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES)) ** 2
        + ((site.tile.y - island.y)
          / (island.ry + site.footprintRadius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES)) ** 2;
      expect(islandValue, site.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("exports every physical water feature as a deterministic obstacle", () => {
    expect(GARDEN_EDGE_STONE_OBSTACLES).toHaveLength(GARDEN_SEA_EDGE_SITES.length);
    expect(GARDEN_EDGE_STONE_OBSTACLES.some((obstacle) => obstacle.id === "danger-rim-cliff"))
      .toBe(true);
    expect(GARDEN_EDGE_STONE_OBSTACLES).toEqual(GARDEN_SEA_EDGE_SITES.map((site) => ({
      body: site.body,
      id: site.id,
      r: site.footprintRadius,
      x: site.tile.x,
      y: site.tile.y,
    })));
    for (const form of new Set(GARDEN_SEA_EDGE_SITES.map((site) => site.form))) {
      const sites = GARDEN_SEA_EDGE_SITES.filter((site) => site.form === form);
      expect(new Set(sites.map((site) => `${site.tile.x},${site.tile.y}`)).size, form)
        .toBe(sites.length);
    }
  });

  it("keeps every stele outside the nine enlarged station footprints", () => {
    let tightest = Number.POSITIVE_INFINITY;
    for (const site of GARDEN_SEA_EDGE_SITES) {
      for (const station of STATION_FOOTPRINTS) {
        const distance = distanceToStationFootprint(site.tile, station);
        expect(distance, `${site.id} / ${station.id}`)
          .toBeGreaterThanOrEqual(site.footprintRadius);
        tightest = Math.min(tightest, distance - site.footprintRadius);
      }
    }
    // The keep-out remains load-bearing: a site is within two tiles of the
    // exact station-envelope limit.
    expect(tightest).toBeLessThan(2);
  });

  it("guards the landward origin against cove-only and seaward-centred regressions", () => {
    const ledger = STATION_FOOTPRINTS.find((station) => station.id === "ledger-fog-hook")!;
    const ledgerCove = RIM_COVES.find((cove) => cove.id === "ledger-fog-hook")!;
    const landwardHall = { x: 2, y: 54 };
    expect(distanceToStationFootprint(landwardHall, ledger)).toBe(0);
    expect(Math.hypot(
      landwardHall.x - ledgerCove.tile.x,
      landwardHall.y - ledgerCove.tile.y,
    )).toBeGreaterThan(ledgerCove.width * 0.5 + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES);

    const along = landwardHall.x - ledger.origin.x;
    const legacyHalfAlong = (ledger.maxAlong - ledger.minAlong) / 2;
    const legacySeawardCentredDistance = Math.max(
      Math.abs(along - legacyHalfAlong) - legacyHalfAlong,
      0,
    );
    expect(legacySeawardCentredDistance).toBeGreaterThan(0);
  });
});
