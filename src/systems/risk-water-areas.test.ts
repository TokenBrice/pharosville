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
  terrainKindAt,
} from "./world-layout";
import { PHAROSVILLE_DESIGN_SPAN, PHAROSVILLE_MAP_SCALE, landWorldTile, zoneWorldTile } from "./map-scale";
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
const ZONE_EDGE_MAX = zoneWorldTile({
  x: PHAROSVILLE_DESIGN_SPAN - 1,
  y: PHAROSVILLE_DESIGN_SPAN - 1,
});
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
function zoneTerrain(x: number, y: number): ReturnType<typeof terrainKindAt> {
  const tile = zoneWorldTile({ x, y });
  return terrainKindAt(tile.x, tile.y);
}
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

  it("keeps Ledger Mooring as the top-shelf non-DEWS water area touching Calm Anchorage", () => {
    const ledger = RISK_WATER_AREAS["ledger-mooring"];
    const calm = RISK_WATER_AREAS["safe-harbor"];
    const watch = RISK_WATER_AREAS["breakwater-edge"];

    expect(ledger.regionTile).toEqual(zoneWorldTile({ x: 10, y: 5 }));
    expect(ledger.labelTile).toEqual(zoneWorldTile({ x: 10, y: 5 }));
    expect(ledger.terrain).toBe("ledger-water");
    expect(ledger.validTerrains).toEqual(["ledger-water"]);
    expect(minDistance([ledger.regionTile, ...ledger.shipAnchors], DOCK_TILES)).toBeGreaterThanOrEqual(3);
    expect(ledger.shipAnchors.some((tile) => tile.y === 0)).toBe(true);
    expect(ledger.shipAnchors.some((tile) => tile.x === 0)).toBe(true);
    // Ledger is above Calm in iso projection (smaller iso.y) and shares an
    // edge with Calm at the y=9/y=10 boundary along the western flank.
    expect(ledger.regionTile.x + ledger.regionTile.y).toBeLessThan(calm.labelTile.x + calm.labelTile.y);
    expect(ledger.regionTile.x + ledger.regionTile.y).toBeLessThan(watch.labelTile.x + watch.labelTile.y);
    expect(zoneTerrain(0, 9)).toBe("ledger-water");
    expect(zoneTerrain(0, 10)).toBe("calm-water");
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

  it("matches the authored DEWS placement diagram", () => {
    // Z1 (decision D-Z1): operator-approved DATA anchors — Calm fills the
    // south-west dead quadrant, Watch slides west along the south basin, and
    // the east escalation stack fans out (sketch:
    // agents/2026-07-24-zone-recomposition-sketch.md). Zones-v2 (operator
    // overlay) re-composes only the RENDERED rings; these data tiles are
    // unchanged by it. N2 pulled Calm's anchor north from design (10,40) to
    // (11,36): the extreme south-west corner is the wreck shoals now, so Calm's
    // authored anchor has to sit clear of the graveyard's water.
    const expectedSamples = [
      { band: "CALM", tile: { x: 11, y: 36 }, terrain: "calm-water" },
      { band: "WATCH", tile: { x: 38, y: 48 }, terrain: "watch-water" },
      { band: "ALERT", tile: { x: 50, y: 16 }, terrain: "alert-water" },
      { band: "WARNING", tile: { x: 50, y: 8 }, terrain: "warning-water" },
      { band: "DANGER", tile: { x: 54, y: 1 }, terrain: "storm-water" },
    ] as const;

    for (const sample of expectedSamples) {
      const area = RISK_WATER_AREAS[DEWS_AREA_PLACEMENTS[sample.band]];
      expect(area.regionTile).toEqual(zoneWorldTile(sample.tile));
      expect(zoneTerrain(sample.tile.x, sample.tile.y)).toBe(sample.terrain);
    }

    // CALM occupies the left edge, LEDGER owns the entire top mooring shelf
    // touching Calm at its western flank, WATCH owns the south breakwater
    // basin plus the entire eastern shelf below the Alert ring, and
    // ALERT/WARNING/DANGER form concentric rings anchored at the east corner.
    expect(zoneTerrain(0, 27)).toBe("calm-water");
    expect(zoneTerrain(14, 42)).toBe("calm-water");
    expect(zoneTerrain(28, 50)).toBe("calm-water");
    expect(zoneTerrain(22, 47)).toBe("calm-water");
    expect(zoneTerrain(34, 44)).toBe("calm-water");
    expect(zoneTerrain(44, 34)).toBe("calm-water");
    expect(zoneTerrain(38, 52)).toBe("watch-water");
    expect(zoneTerrain(48, 44)).toBe("watch-water");
    expect(zoneTerrain(52, 42)).toBe("watch-water");
    expect(zoneTerrain(55, 38)).toBe("watch-water");
    expect(zoneTerrain(30, 55)).toBe("calm-water");
    // East shelf below the Alert ring also reads as Watch Breakwater now.
    expect(zoneTerrain(55, 25)).toBe("watch-water");
    expect(zoneTerrain(55, 30)).toBe("watch-water");
    expect(zoneTerrain(55, 37)).toBe("watch-water");
    expect(zoneTerrain(50, 30)).toBe("watch-water");
    expect(zoneTerrain(45, 35)).toBe("calm-water");
    // Watch east bridge absorbs the strip between the south basin and the
    // southeast Calm corner that previously read as un-attributed water.
    expect(zoneTerrain(45, 44)).toBe("watch-water");
    expect(zoneTerrain(45, 45)).toBe("watch-water");
    expect(zoneTerrain(55, 0)).toBe("storm-water");
    expect(zoneTerrain(54, 0)).toBe("storm-water");
    expect(zoneTerrain(55, 8)).toBe("warning-water");
    expect(zoneTerrain(45, 0)).toBe("warning-water");
    expect(zoneTerrain(40, 0)).toBe("alert-water");
    expect(zoneTerrain(47, 14)).toBe("alert-water");
    expect(zoneTerrain(55, 17)).toBe("alert-water");
    expect(RISK_WATER_AREAS["ledger-mooring"].regionTile).toEqual(zoneWorldTile({ x: 10, y: 5 }));
    expect(zoneTerrain(0, 0)).toBe("ledger-water");
    expect(zoneTerrain(0, 9)).toBe("ledger-water");
    expect(zoneTerrain(10, 5)).toBe("ledger-water");
    expect(zoneTerrain(15, 4)).toBe("ledger-water");
    expect(zoneTerrain(20, 5)).toBe("ledger-water");
    expect(zoneTerrain(30, 5)).toBe("ledger-water");
    expect(zoneTerrain(47, 52)).toBe("watch-water");
    expect(zoneTerrain(50, 55)).toBe("watch-water");
  });

  it("keeps every named sea zone in the same water component with edge-snapped ship anchors where required", () => {
    const component = connectedWaterTileKeys(RISK_WATER_AREAS[DEWS_AREA_PLACEMENTS.CALM].labelTile);
    const edgeSnappedPlacements = new Set<ShipRiskPlacement>([
      "safe-harbor",
      "breakwater-edge",
      "harbor-mouth-watch",
      "outer-rough-water",
      "storm-shelf",
      "ledger-mooring",
    ]);

    for (const area of Object.values(RISK_WATER_AREAS)) {
      const authoredTiles = [area.regionTile, area.labelTile, ...area.shipAnchors];

      expect(component.has(tileKey(area.labelTile)), `${area.placement} label ${area.labelTile.x}.${area.labelTile.y}`).toBe(true);
      expect(component.has(tileKey(area.regionTile)), `${area.placement} region ${area.regionTile.x}.${area.regionTile.y}`).toBe(true);
      if (edgeSnappedPlacements.has(area.placement)) {
        expect(authoredTiles.some((tile) => isExactEdgeTile(tile)), area.placement).toBe(true);
      } else {
        expect(authoredTiles.every((tile) => !isExactEdgeTile(tile)), area.placement).toBe(true);
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

  it("anchors edge-snapped DEWS zones to their authored map edges", () => {
    const expectedEdge: Partial<Record<DewsAreaBand, "x0" | "x55" | "y0" | "y55">> = {
      CALM: "x0",
      WATCH: "y55",
      ALERT: "x55",
      WARNING: "x55",
      DANGER: "x55",
    };
    // Edge names stay in design space (x55 / y55); scaled, that is world 110 —
    // the outermost coordinate the authored zone geometry reaches.
    const MAX = ZONE_EDGE_MAX.x;

    for (const band of DEWS_AREA_BANDS) {
      const area = RISK_WATER_AREAS[DEWS_AREA_PLACEMENTS[band]];
      const edge = expectedEdge[band];
      if (!edge) {
        expect([area.regionTile, area.labelTile, ...area.shipAnchors].every((tile) => !isExactEdgeTile(tile)), band).toBe(true);
        continue;
      }
      const onEdge = (tile: { x: number; y: number }): boolean => {
        if (edge === "x0") return tile.x === 0;
        if (edge === "x55") return tile.x === MAX;
        if (edge === "y0") return tile.y === 0;
        return tile.y === MAX;
      };
      const hasEdgeTile = area.shipAnchors.some(onEdge);
      expect(hasEdgeTile, `${band} should have at least one anchor on its primary edge ${edge}`).toBe(true);
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
    // Ledger measures 1748 against a nominal 1750, so the floor is 278, not 280.
    expect(counts["ledger-water"]).toBeGreaterThanOrEqual(278 * AREA_SCALE);
    expect(counts["ledger-water"]).toBeLessThanOrEqual(330 * AREA_SCALE);
    expect(counts["calm-water"]).toBeGreaterThan(counts["ledger-water"]);
  });

  it("sizes each zone proportionally to ship count", () => {
    const counts = terrainCounts();
    expect(counts["calm-water"]).toBeGreaterThan(counts["watch-water"]);
    expect(counts["watch-water"]).toBeGreaterThanOrEqual(80 * AREA_SCALE);
    expect(counts["alert-water"]).toBeGreaterThan(counts["warning-water"] ?? 0);
    expect(counts["alert-water"]).toBeGreaterThan(counts["storm-water"] ?? 0);
    expect(counts["warning-water"] ?? 0).toBeGreaterThanOrEqual(30 * AREA_SCALE);
    expect(counts["warning-water"] ?? 0).toBeLessThanOrEqual(125 * AREA_SCALE);
    expect(counts["storm-water"] ?? 0).toBeGreaterThanOrEqual(30 * AREA_SCALE);
    expect(counts["storm-water"] ?? 0).toBeLessThanOrEqual(100 * AREA_SCALE);
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

function connectedWaterTileKeys(start: { x: number; y: number }): Set<string> {
  const visited = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const tile = queue.shift();
    if (!tile) continue;
    if (tile.x < 0 || tile.x >= PHAROSVILLE_MAP_WIDTH || tile.y < 0 || tile.y >= PHAROSVILLE_MAP_HEIGHT) continue;
    const terrain = terrainKindAt(tile.x, tile.y);
    if (!isWaterTileKind(terrain)) continue;
    const key = tileKey(tile);
    if (visited.has(key)) continue;

    visited.add(key);
    queue.push(
      { x: tile.x + 1, y: tile.y },
      { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 },
      { x: tile.x, y: tile.y - 1 },
    );
  }

  return visited;
}

function isInLighthouseClearance(tile: { x: number; y: number }): boolean {
  return tile.x >= LIGHTHOUSE_CLEARANCE_MIN.x
    && tile.x <= LIGHTHOUSE_CLEARANCE_MAX.x
    && tile.y >= LIGHTHOUSE_CLEARANCE_MIN.y
    && tile.y <= LIGHTHOUSE_CLEARANCE_MAX.y;
}

function isExactEdgeTile(tile: { x: number; y: number }): boolean {
  // N1: "edge" means the authored design-space edge. Scaling maps design 55 to
  // world 110, so the outermost world row/column (111) is beyond anything the
  // authored zone geometry can name.
  return tile.x === 0
    || tile.y === 0
    || tile.x === ZONE_EDGE_MAX.x
    || tile.y === ZONE_EDGE_MAX.y;
}

function tileKey(tile: { x: number; y: number }): string {
  return `${tile.x}.${tile.y}`;
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
