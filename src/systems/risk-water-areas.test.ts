import { describe, expect, it } from "vitest";
import {
  DEWS_AREA_BANDS,
  DEWS_AREA_PLACEMENTS,
  RISK_WATER_AREAS,
  RISK_WATER_REGION_TILES,
  SHIP_RISK_PLACEMENTS,
  SHIP_SCATTER_RADIUS,
  SHIP_WATER_ANCHORS,
  dewsAreaPlacementForBand,
  riskWaterAreaForPlacement,
  waterZoneForPlacement,
} from "./risk-water-areas";
import { tileToIso } from "./projection";
import {
  DOCK_TILES,
  LIGHTHOUSE_TILE,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  isWaterTileKind,
  isNavigableWaterTile,
  terrainKindAt,
} from "./world-layout";
import { PHAROSVILLE_MAP_SCALE, landWorldTile, zoneWorldTile } from "./map-scale";
import type { DewsAreaBand, ShipRiskPlacement } from "./world-types";

// N1: the live grid is 112x112 but zones and terrain stay AUTHORED in the
// original 56-tile DESIGN space. Zone geometry (and therefore every anchor,
// label and region tile in RISK_WATER_AREAS) is SCALED onto the grid; the
// lighthouse clearance box belongs to the island, so it is OFFSET instead.
// Design-space literals are kept visible below so they still read against the
// authored zone diagrams.
const LIGHTHOUSE_CLEARANCE_MIN = landWorldTile({ x: 14, y: 23 });
const LIGHTHOUSE_CLEARANCE_MAX = landWorldTile({ x: 24, y: 32 });
/** The far map edge in ZONE terms: design 55 scales to world 110, not 111. */
/** Zone AREAS scale with the map, so authored tile counts multiply by 4. */
const AREA_SCALE = PHAROSVILLE_MAP_SCALE ** 2;
/**
 * Terrains that read as an ATTRIBUTED body of sea, as opposed to the generic
 * `"water"` halo around the island and lighthouse. N2 added `wreck-water` (the
 * south-west graveyard shoals) — it is a named sea region like the DEWS bands,
 * so the island periphery must stay clear of it too.
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

/** `terrainKindAt` for a design-space ZONE coordinate. */
/** `terrainKindAt` for a design-space LANDMASS coordinate. */
function landTerrain(x: number, y: number): ReturnType<typeof terrainKindAt> {
  const tile = landWorldTile({ x, y });
  return terrainKindAt(tile.x, tile.y);
}

describe("risk water areas", () => {
  it("defines one source of truth for every ship risk placement", () => {
    expect(Object.keys(RISK_WATER_AREAS).sort()).toEqual([...SHIP_RISK_PLACEMENTS].sort());

    for (const placement of SHIP_RISK_PLACEMENTS) {
      const area = riskWaterAreaForPlacement(placement);

      expect(area.placement).toBe(placement);
      expect(area.label.length).toBeGreaterThan(0);
      expect(area.waterStyle.length).toBeGreaterThan(0);
      expect(area.shipAnchors.length).toBeGreaterThan(0);
      expect(area.scatterRadius.x).toBeGreaterThan(0);
      expect(area.scatterRadius.y).toBeGreaterThan(0);
      expect(RISK_WATER_REGION_TILES[placement]).toBe(area.regionTile);
      expect(SHIP_WATER_ANCHORS[placement]).toBe(area.shipAnchors);
      expect(SHIP_SCATTER_RADIUS[placement]).toBe(area.scatterRadius);
      expect(waterZoneForPlacement(placement)).toBe(area.motionZone);
    }
  });

  it("keeps DEWS band labels, tiles, styles, and placements in sync", () => {
    const expectedLabels: Record<DewsAreaBand, string> = {
      DANGER: "Danger Strait",
      WARNING: "Warning Shoals",
      ALERT: "Alert Channel",
      WATCH: "Watch Breakwater",
      CALM: "Calm Anchorage",
    };

    expect(Object.keys(DEWS_AREA_PLACEMENTS)).toEqual([...DEWS_AREA_BANDS]);
    for (const band of DEWS_AREA_BANDS) {
      const placement = DEWS_AREA_PLACEMENTS[band];
      const area = RISK_WATER_AREAS[placement];

      expect(area.band).toBe(band);
      expect(dewsAreaPlacementForBand(band.toLowerCase())).toBe(placement);
      expect(area.label).toBe(expectedLabels[band]);
      expect(riskWaterAreaForPlacement(placement).labelTile).toBe(area.labelTile);
      expect(riskWaterAreaForPlacement(placement).waterStyle).toBe(area.waterStyle);
      expect(terrainKindAt(area.labelTile.x, area.labelTile.y)).toBe(area.terrain);
      expect(area.motionZone).toBe(band.toLowerCase());
    }
  });

  it("arranges DEWS sea zones around the authored island composition", () => {
    const lighthouseIso = tileToIso(LIGHTHOUSE_TILE);
    const isoByBand = new Map<DewsAreaBand, { x: number; y: number }>();
    for (const band of DEWS_AREA_BANDS) {
      const area = RISK_WATER_AREAS[DEWS_AREA_PLACEMENTS[band]];
      isoByBand.set(band, tileToIso(area.labelTile));
    }
    const calm = isoByBand.get("CALM")!;
    const watch = isoByBand.get("WATCH")!;
    const alert = isoByBand.get("ALERT")!;
    const warning = isoByBand.get("WARNING")!;
    const danger = isoByBand.get("DANGER")!;

    // CALM lives left of every eastern DEWS band; WATCH now lives in the
    // south basin so it sits below Calm and below every eastern DEWS band.
    expect(calm.x).toBeLessThan(alert.x);
    expect(calm.x).toBeLessThan(warning.x);
    expect(calm.x).toBeLessThan(danger.x);
    expect(watch.y).toBeGreaterThan(calm.y);
    expect(watch.y).toBeGreaterThan(alert.y);
    expect(watch.y).toBeGreaterThan(warning.y);
    expect(watch.y).toBeGreaterThan(danger.y);

    // The eastern DEWS cluster sits well east of the lighthouse approach.
    expect(alert.x).toBeGreaterThan(lighthouseIso.x + 500);
    expect(warning.x).toBeGreaterThan(lighthouseIso.x + 500);
    expect(danger.x).toBeGreaterThan(lighthouseIso.x + 500);

    // Concentric east-corner rings: tile distance to (55, 0) increases
    // DANGER → WARNING → ALERT, anchored at the eastern tip of the iso diamond.
    const eastCorner = zoneWorldTile({ x: 55, y: 0 });
    const tileDist = (band: DewsAreaBand): number => {
      const tile = RISK_WATER_AREAS[DEWS_AREA_PLACEMENTS[band]].labelTile;
      return Math.hypot(tile.x - eastCorner.x, tile.y - eastCorner.y);
    };
    expect(tileDist("DANGER")).toBeLessThan(tileDist("WARNING"));
    expect(tileDist("WARNING")).toBeLessThan(tileDist("ALERT"));

    // In iso projection, deeper rings recede south-westward from the corner:
    // DANGER has the highest iso.x and lowest iso.y; ALERT the inverse.
    expect(alert.x).toBeLessThan(warning.x);
    expect(warning.x).toBeLessThan(danger.x);
    expect(danger.y).toBeLessThan(warning.y);
    expect(warning.y).toBeLessThan(alert.y);
  });

  it("keeps Ledger Mooring a northern shelf distinct from the DEWS ladder", () => {
    // Z1 (Sea Master): this used to pin the exact authored tiles and the
    // y=9/y=10 seam where the Ledger rectangle met the Calm rectangle. Both
    // rectangles are gone. What has to stay true is what Ledger MEANS: it is
    // NAV-priced water, not a rung on the risk ladder, and it lies north of the
    // anchorage rather than inside it.
    const ledger = RISK_WATER_AREAS["ledger-mooring"];
    const calm = RISK_WATER_AREAS["safe-harbor"];

    expect(ledger.band).toBeNull();
    expect(ledger.terrain).toBe("ledger-water");
    expect(ledger.validTerrains).toEqual(["ledger-water"]);
    expect(terrainKindAt(ledger.regionTile.x, ledger.regionTile.y)).toBe("ledger-water");
    expect(minDistance([ledger.regionTile, ...ledger.shipAnchors], DOCK_TILES)).toBeGreaterThanOrEqual(3);
    // North of the anchorage, and the two share a frontier.
    expect(ledger.regionTile.y).toBeLessThan(calm.regionTile.y);
  });

  it("keeps named risk water out of the lighthouse mountain clearance lane", () => {
    for (const area of Object.values(RISK_WATER_AREAS)) {
      for (const tile of [area.regionTile, area.labelTile, ...area.shipAnchors]) {
        expect(isInLighthouseClearance(tile), `${area.placement} ${tile.x}.${tile.y}`).toBe(false);
      }
    }
  });

  it("keeps semantic water out of the lighthouse clearance lane", () => {
    for (let x = LIGHTHOUSE_CLEARANCE_MIN.x; x <= LIGHTHOUSE_CLEARANCE_MAX.x; x += 1) {
      for (let y = LIGHTHOUSE_CLEARANCE_MIN.y; y <= LIGHTHOUSE_CLEARANCE_MAX.y; y += 1) {
        const terrain = terrainKindAt(x, y);
        if (!isWaterTileKind(terrain)) continue;
        expect(terrain, `${x}.${y}`).toBe("water");
      }
    }
  });

  it("keeps every placement's anchors inside its own water", () => {
    // Z3 (Sea Master): this used to be a diagram of ~60 exact tiles. Those
    // described one partition and rotted with it. The property that matters is
    // the one the diagram existed to protect — a placement's anchors are in the
    // water that placement names — and it holds for any composition.
    for (const placement of SHIP_RISK_PLACEMENTS) {
      const area = RISK_WATER_AREAS[placement];
      for (const tile of [area.regionTile, area.labelTile, ...area.shipAnchors]) {
        expect(terrainKindAt(tile.x, tile.y), `${placement} ${tile.x}.${tile.y}`).toBe(area.terrain);
      }
    }
  });

  it("keeps every named sea zone reachable from the open sea", () => {
    // The analytical claim is navigability: a ship placed in a zone must be
    // able to sail there. The old form of this test also asserted that certain
    // zones touched specific map edges, which the reshape retired — named water
    // now stops short of the deep rim by design.
    for (const placement of SHIP_RISK_PLACEMENTS) {
      const area = RISK_WATER_AREAS[placement];
      expect(isNavigableWaterTile(area.regionTile), placement).toBe(true);
      for (const anchor of area.shipAnchors) {
        expect(isNavigableWaterTile(anchor), `${placement} ${anchor.x}.${anchor.y}`).toBe(true);
      }
    }
  });

  it("keeps authored region tiles and anchors on matching water terrain", () => {
    for (const placement of SHIP_RISK_PLACEMENTS) {
      const area = RISK_WATER_AREAS[placement];

      expect(terrainKindAt(area.regionTile.x, area.regionTile.y)).toBe(area.terrain);
      if (area.validTerrains !== "any-water") {
        expect(area.validTerrains).toContain(area.terrain);
      }
      for (const anchor of area.shipAnchors) {
        const terrain = terrainKindAt(anchor.x, anchor.y);
        if (area.validTerrains === "any-water") {
          expect(
            isWaterTileKind(terrain),
            `${placement} anchor ${anchor.x}.${anchor.y} should remain water`,
          ).toBe(true);
        } else {
          expect(
            area.validTerrains,
            `${placement} anchor ${anchor.x}.${anchor.y} should stay in ${area.validTerrains.join(", ")}`,
          ).toContain(terrain);
        }
      }
    }
  });

  it("keeps the DEWS ladder escalating north-east", () => {
    // Replaces the edge-snapping assertions. Zones no longer run flush to the
    // map's edge — the deep rim and the open approach own that water now — but
    // the journey the ladder describes is unchanged and is what a reader
    // actually navigates by.
    const bearing = (placement: ShipRiskPlacement): number => {
      const tile = RISK_WATER_AREAS[placement].regionTile;
      return tile.x - tile.y;
    };
    const ladder: ShipRiskPlacement[] = [
      "safe-harbor",
      "breakwater-edge",
      "harbor-mouth-watch",
      "outer-rough-water",
      "storm-shelf",
    ];
    for (let step = 1; step < ladder.length; step += 1) {
      expect(bearing(ladder[step]!), `${ladder[step]} vs ${ladder[step - 1]}`)
        .toBeGreaterThan(bearing(ladder[step - 1]!));
    }
  });

  it("keeps the direct island periphery out of every zone", () => {
    // Tiles inside the generated island periphery should be land or generic
    // water, not DEWS-colored zone water.
    // Island-relative, so these are design-space LANDMASS coordinates.
    const peripherySamples = [
      { x: 32, y: 27 }, // adjacent to bridge step
      { x: 27, y: 35 }, // south of green step
      { x: 17, y: 40 }, // west of left column
      { x: 27, y: 41 }, // east of left column mid-section
      { x: 35, y: 18 }, // west of right column
    ];
    for (const tile of peripherySamples) {
      const terrain = landTerrain(tile.x, tile.y);
      const isZoneTerrain = NAMED_SEA_TERRAINS.includes(terrain as (typeof NAMED_SEA_TERRAINS)[number]);
      expect(isZoneTerrain, `${tile.x}.${tile.y} should be generic water, got ${terrain}`).toBe(false);
    }
  });

  it("clears the immediate periphery around the lighthouse sprite", () => {
    const lighthouseClearanceSamples = [
      { x: 14, y: 24 },
      { x: 14, y: 30 },
      { x: 16, y: 32 },
      { x: 13, y: 31 },
    ];
    for (const tile of lighthouseClearanceSamples) {
      const terrain = landTerrain(tile.x, tile.y);
      const isZoneTerrain = NAMED_SEA_TERRAINS.includes(terrain as (typeof NAMED_SEA_TERRAINS)[number]);
      expect(isZoneTerrain, `${tile.x}.${tile.y} should be generic water (lighthouse clearance), got ${terrain}`).toBe(false);
    }
  });

  it("sizes the top-shelf Ledger Mooring footprint to span the full upper edge", () => {
    const counts = terrainCounts();

    // Authored 56-tile windows x MAP_SCALE² (measured 1159 on the 112x112 grid).
    // H4: the floors are authored 56-tile windows x MAP_SCALE^2. That model is
    // exact only at an integer scale — the zone predicates test INCLUSIVE integer
    // design bounds (`y <= 9`), which at 2.5 clips half a design row off each edge.
    // RIM FIELD REVISION 1: Ledger's hooked cove and recalibrated reach measure 1,601 tiles (10.0%).
    expect(counts["ledger-water"]).toBeGreaterThanOrEqual(250 * AREA_SCALE);
    expect(counts["ledger-water"]).toBeLessThanOrEqual(260 * AREA_SCALE);
    expect(counts["calm-water"]).toBeGreaterThan(counts["ledger-water"]);
  });

  it("sizes each zone proportionally to ship count", () => {
    // Z3 (Sea Master): the caps this used to assert encoded the OLD sizing,
    // where Danger Strait held 1.4% of the sea for 5.9% of the fleet and Watch
    // Breakwater held 28% for 8.6% — a 13x density spread. Sizing is
    // traffic-proportional now; the exact shares are asserted against
    // SEA_BODY_TARGET_SHARE in world-layout.test.ts, and what belongs here is
    // the ORDERING those shares imply.
    const counts = terrainCounts();
    expect(counts["calm-water"]).toBeGreaterThan(counts["watch-water"]!);
    expect(counts["watch-water"]).toBeGreaterThan(counts["alert-water"]!);
    expect(counts["alert-water"]).toBeGreaterThan(counts["storm-water"]!);
    // Danger carries more ships than Warning, so it gets more water.
    expect(counts["storm-water"]).toBeGreaterThan(counts["warning-water"]!);
  });


});

function terrainCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const t = terrainKindAt(x, y);
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}


function isInLighthouseClearance(tile: { x: number; y: number }): boolean {
  return tile.x >= LIGHTHOUSE_CLEARANCE_MIN.x
    && tile.x <= LIGHTHOUSE_CLEARANCE_MAX.x
    && tile.y >= LIGHTHOUSE_CLEARANCE_MIN.y
    && tile.y <= LIGHTHOUSE_CLEARANCE_MAX.y;
}



function minDistance(
  first: readonly { x: number; y: number }[],
  second: readonly { x: number; y: number }[],
): number {
  let result = Number.POSITIVE_INFINITY;
  for (const a of first) {
    for (const b of second) {
      result = Math.min(result, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return result;
}
