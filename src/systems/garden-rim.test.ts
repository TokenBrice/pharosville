import { describe, expect, it } from "vitest";
import {
  CEMETERY_CENTER,
  CEMETERY_RADIUS,
  DOCK_TILES,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  isNavigableWaterTile,
  isWaterTileKind,
  nearestWaterTile,
  terrainKindAt,
} from "./world-layout";
import { SEA_BODY_TERRAIN, type SeaBodyId } from "./sea-bodies";
import { seaBodyAnchors } from "./sea-body-anchors";
import { SHIP_WATER_ANCHORS } from "./risk-water-areas";
import {
  RIM_COVES,
  RIM_OPENINGS,
  rimDepthAt,
  rimLandAt,
  rimShoreDistance,
} from "./garden-rim";

const TAU = Math.PI * 2;

function normaliseBearing(bearing: number): number {
  let value = (bearing + Math.PI) % TAU;
  if (value < 0) value += TAU;
  return value - Math.PI;
}

function insideOpening(bearing: number): boolean {
  const value = normaliseBearing(bearing);
  return RIM_OPENINGS.some((opening) => {
    const start = normaliseBearing(opening.bearingStart);
    const end = normaliseBearing(opening.bearingEnd);
    return start <= end ? value >= start && value <= end : value >= start || value <= end;
  });
}

function tileKey(tile: { x: number; y: number }): string {
  return `${tile.x}.${tile.y}`;
}

function reachableWaterFromDockRing(): Set<string> {
  const queue = DOCK_TILES.map((dock) => nearestWaterTile(dock, 12));
  const reached = new Set<string>();
  for (let head = 0; head < queue.length; head += 1) {
    const tile = queue[head]!;
    if (tile.x < 0 || tile.y < 0 || tile.x >= PHAROSVILLE_MAP_WIDTH || tile.y >= PHAROSVILLE_MAP_HEIGHT) continue;
    const key = tileKey(tile);
    if (reached.has(key) || !isNavigableWaterTile(tile)) continue;
    reached.add(key);
    queue.push(
      { x: tile.x + 1, y: tile.y },
      { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 },
      { x: tile.x, y: tile.y - 1 },
    );
  }
  return reached;
}

describe("authored garden rim", () => {
  it("covers 55-65% of the perimeter with exactly two open arcs", () => {
    let perimeterTiles = 0;
    let rimTiles = 0;
    for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
      for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
        if (x !== 0 && y !== 0 && x !== PHAROSVILLE_MAP_WIDTH - 1 && y !== PHAROSVILLE_MAP_HEIGHT - 1) continue;
        perimeterTiles += 1;
        if (rimLandAt(x, y)) rimTiles += 1;
      }
    }

    expect(RIM_OPENINGS).toHaveLength(2);
    expect(rimTiles / perimeterTiles).toBeGreaterThanOrEqual(0.55);
    expect(rimTiles / perimeterTiles).toBeLessThanOrEqual(0.65);
  });

  it("keeps depth at 6-14 tiles outside the openings and zero inside", () => {
    for (let index = 0; index < 1440; index += 1) {
      const bearing = -Math.PI + index * TAU / 1440;
      const depth = rimDepthAt(bearing);
      if (insideOpening(bearing)) {
        expect(depth, `opening bearing ${bearing}`).toBe(0);
      } else {
        expect(depth, `land bearing ${bearing}`).toBeGreaterThanOrEqual(6);
        expect(depth, `land bearing ${bearing}`).toBeLessThanOrEqual(14);
      }
    }
    for (const opening of RIM_OPENINGS) {
      expect(rimDepthAt(opening.bearingStart)).toBe(0);
      expect(rimDepthAt(opening.bearingEnd)).toBe(0);
    }
  });

  it("stamps only rim terrain and never intersects the central island or islets", () => {
    for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
      for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
        if (!rimLandAt(x, y)) continue;
        expect(terrainKindAt(x, y), `${x}.${y}`).toBe("rim");
      }
    }
  });

  it("keeps every authored and derived anchorage mooring off the rim", () => {
    for (const anchors of Object.values(SHIP_WATER_ANCHORS)) {
      for (const anchor of anchors) expect(rimLandAt(anchor.x, anchor.y), tileKey(anchor)).toBe(false);
    }
    for (const body of ["calm", "watch", "alert", "warning", "danger", "ledger"] as const) {
      for (const anchor of seaBodyAnchors(body, 14)) {
        expect(rimLandAt(anchor.x, anchor.y), `${body} ${tileKey(anchor)}`).toBe(false);
      }
    }
  });

  it("keeps Wreck Shoal as water inside a west-and-south bordered inlet", () => {
    for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
      for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
        const wreckEllipse = ((x - CEMETERY_CENTER.x) / CEMETERY_RADIUS.x) ** 2
          + ((y - CEMETERY_CENTER.y) / CEMETERY_RADIUS.y) ** 2;
        if (wreckEllipse < 1) expect(rimLandAt(x, y), `${x}.${y}`).toBe(false);
      }
    }
    expect(terrainKindAt(Math.round(CEMETERY_CENTER.x), Math.round(CEMETERY_CENTER.y))).toBe("wreck-water");
    expect(rimLandAt(0, Math.round(CEMETERY_CENTER.y))).toBe(true);
    expect(rimLandAt(Math.round(CEMETERY_CENTER.x), PHAROSVILLE_MAP_HEIGHT - 1)).toBe(true);
  });

  it("authors ten spaced, body-specific coves reachable from the current dock ring", () => {
    const reached = reachableWaterFromDockRing();
    const bodies = new Set<SeaBodyId>();
    expect(RIM_COVES.length).toBeGreaterThanOrEqual(10);

    for (const cove of RIM_COVES) {
      bodies.add(cove.body);
      expect(terrainKindAt(cove.tile.x, cove.tile.y), cove.id).toBe(SEA_BODY_TERRAIN[cove.body]);
      expect(isWaterTileKind(terrainKindAt(cove.tile.x, cove.tile.y)), cove.id).toBe(true);
      expect(rimShoreDistance(cove.tile.x, cove.tile.y), cove.id).toBeGreaterThan(0);
      expect(rimShoreDistance(cove.tile.x, cove.tile.y), cove.id).toBeLessThanOrEqual(2);
      expect(rimDepthAt(Math.atan2(
        cove.tile.y - (PHAROSVILLE_MAP_HEIGHT - 1) / 2,
        cove.tile.x - (PHAROSVILLE_MAP_WIDTH - 1) / 2,
      )), cove.id).toBeGreaterThan(0);
      expect(reached.has(tileKey(cove.tile)), cove.id).toBe(true);
      expect(cove.width).toBeGreaterThan(0);
      expect(Number.isFinite(cove.seawardBearing)).toBe(true);
    }

    expect(bodies).toEqual(new Set(["calm", "watch", "alert", "warning", "danger", "ledger"]));
    for (let index = 0; index < RIM_COVES.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < RIM_COVES.length; otherIndex += 1) {
        const a = RIM_COVES[index]!.tile;
        const b = RIM_COVES[otherIndex]!.tile;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${RIM_COVES[index]!.id} / ${RIM_COVES[otherIndex]!.id}`)
          .toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("returns negative land, positive water, and zero on the shoreline", () => {
    const rimTile = { x: 7, y: 47 };
    const waterTile = { x: 8, y: 47 };
    expect(rimLandAt(rimTile.x, rimTile.y)).toBe(true);
    expect(rimLandAt(waterTile.x, waterTile.y)).toBe(false);
    expect(rimShoreDistance(rimTile.x, rimTile.y)).toBeLessThan(0);
    expect(rimShoreDistance(waterTile.x, waterTile.y)).toBeGreaterThan(0);
    expect(rimShoreDistance(7.5, 47)).toBe(0);
  });
});
