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
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  PIGEONNIER_STATION_SLOT,
  isWaterTileKind,
  terrainKindAt,
} from "./world-layout";
import { stationFootprint } from "./dock-layout";

// R4 (plan §8 L11): the oriented station envelopes steles must clear.
// Mirrors the module's derivation — stationFootprint at the most
// conservative envelope (saturated supply, maximum dock size), centred half
// a length seaward of the authored berth along the cove bearing.
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
    // The rim-land Danger wall is the deliberate exception: enlarging it had
    // no clearance-valid site and would narrow the navigable strait.
    expect(GARDEN_SEA_EDGE_SITES.find((site) => site.id === "danger-rim-cliff"))
      .toMatchObject({ height: 5.2, length: 5.4, width: 1.2 });
  });

  it("resolves water elements onto their live field boundary and the Danger cliff onto its rim flank", () => {
    const cliff = GARDEN_SEA_EDGE_SITES.find((site) => site.form === "cliff");
    expect(cliff).toBeDefined();
    expect(rimLandAt(cliff!.tile.x, cliff!.tile.y)).toBe(true);
    expect([
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ].some((offset) => {
      const x = cliff!.tile.x + offset.x;
      const y = cliff!.tile.y + offset.y;
      return isWaterTileKind(terrainKindAt(x, y))
        && seaRegionAtTile(x, y) === SEA_REGION_ID.danger;
    })).toBe(true);
    expect(seaEdgeTileInOpening(cliff!.tile)).toBe(false);

    for (const site of GARDEN_SEA_EDGE_SITES.filter((candidate) => candidate !== cliff)) {
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

  it("exports deterministic water obstacles without narrowing Danger Strait for its land cliff", () => {
    const waterSites = GARDEN_SEA_EDGE_SITES.filter((site) => site.form !== "cliff");
    expect(GARDEN_EDGE_STONE_OBSTACLES).toHaveLength(waterSites.length);
    expect(GARDEN_EDGE_STONE_OBSTACLES.some((obstacle) => obstacle.id === "danger-rim-cliff"))
      .toBe(false);
    expect(GARDEN_EDGE_STONE_OBSTACLES).toEqual(waterSites.map((site) => ({
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
        const distance = distanceToStation(site.tile.x, site.tile.y, station);
        expect(distance, `${site.id} / ${station.id}`)
          .toBeGreaterThanOrEqual(site.footprintRadius);
        tightest = Math.min(tightest, distance - site.footprintRadius);
      }
    }
    // The keep-out is load-bearing, not vacuous: at least one stele presses
    // against a station envelope within a tile of the limit (the inner
    // Warning shoal bar against the stepped inlet measures 0.7). Were every
    // stele far away, this suite could not tell the footprint term from the
    // old mouth apron.
    expect(tightest).toBeLessThan(1);
  });

  it("would fail if station clearance reverted to the cove mouth alone", () => {
    // Reproduce the pre-R4 rule exactly: candidates cleared against the
    // island waterline, the moorings and the RIM_COVES mouths with the fixed
    // 4-tile hull apron — no station term. Re-resolving the inner Warning
    // shoal bar's guide (114,18) under that rule picks (113,21) (recorded
    // old resolution), whose own footprint overlaps the stepped inlet's
    // envelope — the defect R4 exists to close. If candidateIsClear ever
    // loses its station term, that is the site the module would emit again,
    // and the assertion above fails on this pair.
    const barRadius = Math.hypot(5.4 * GARDEN_SEA_EDGE_SCALE_FACTOR, 2.0 * GARDEN_SEA_EDGE_SCALE_FACTOR) * 0.5 + 0.25;
    const oldRuleClear = (x: number, y: number): boolean => {
      const island = GARDEN_SEA_EDGE_ISLAND_WATERLINE;
      const islandValue = ((x - island.x)
        / (island.rx + barRadius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES)) ** 2
        + ((y - island.y)
          / (island.ry + barRadius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES)) ** 2;
      if (islandValue < 1) return false;
      if (Object.values(SHIP_WATER_ANCHORS).flat().some((mooring) => (
        Math.hypot(x - mooring.x, y - mooring.y)
          < barRadius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES
      ))) return false;
      return RIM_COVES.every((cove) => (
        Math.hypot(x - cove.tile.x, y - cove.tile.y)
          >= barRadius + GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES
      ));
    };
    let oldRule: { x: number; y: number } | null = null;
    let oldRuleDistance = Number.POSITIVE_INFINITY;
    for (let y = 1; y < PHAROSVILLE_MAP_HEIGHT - 1; y += 1) {
      for (let x = 1; x < PHAROSVILLE_MAP_WIDTH - 1; x += 1) {
        if (seaRegionAtTile(x, y) !== SEA_REGION_ID.warning) continue;
        if (!isWaterTileKind(terrainKindAt(x, y)) || rimLandAt(x, y)) continue;
        const meetsAlert = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (
          isWaterTileKind(terrainKindAt(x + dx, y + dy))
          && seaRegionAtTile(x + dx, y + dy) === SEA_REGION_ID.alert
        ));
        if (!meetsAlert) continue;
        if (seaEdgeTileInOpening({ x, y })) continue;
        if (!oldRuleClear(x, y)) continue;
        const distance = (x - 114) ** 2 + (y - 18) ** 2;
        if (distance >= oldRuleDistance) continue;
        oldRuleDistance = distance;
        oldRule = { x, y };
      }
    }
    expect(oldRule).toEqual({ x: 113, y: 21 });
    const notch = STATION_FOOTPRINTS.find((station) => station.id === "warning-stone-notch");
    expect(notch).toBeDefined();
    expect(distanceToStation(oldRule!.x, oldRule!.y, notch!)).toBeLessThan(barRadius);
  });
});
