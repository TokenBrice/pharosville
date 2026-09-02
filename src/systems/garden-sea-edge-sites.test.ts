import { describe, expect, it } from "vitest";
import { SEA_REGION_ID, seaRegionAtTile } from "./garden-sea-regions";
import { RIM_COVES, rimLandAt } from "./garden-rim";
import { SHIP_WATER_ANCHORS } from "./risk-water-areas";
import {
  GARDEN_EDGE_STONE_OBSTACLES,
  GARDEN_SEA_EDGE_HULL_CLEARANCE_TILES,
  GARDEN_SEA_EDGE_ISLAND_WATERLINE,
  GARDEN_SEA_EDGE_SHED_LIST,
  GARDEN_SEA_EDGE_SITES,
  seaEdgeBoundaryAt,
  seaEdgeTileInOpening,
} from "./garden-sea-edge-sites";
import { isWaterTileKind, terrainKindAt } from "./world-layout";

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

  it("resolves every element onto its own water at a live field boundary, never rim or an opening", () => {
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

  it("exports one deterministic obstacle footprint for every rendered site", () => {
    expect(GARDEN_EDGE_STONE_OBSTACLES).toHaveLength(GARDEN_SEA_EDGE_SITES.length);
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
});
