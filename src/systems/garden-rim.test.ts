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
import { seaSignFootprintTiles, seaSignSites } from "../three/garden-sea-sign-siting";
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

function positionOf(site: { x: number; z: number }): { x: number; y: number } {
  return { x: Math.round(site.x / Math.SQRT2), y: Math.round(site.z / Math.SQRT2) };
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
    const openingWidths = RIM_OPENINGS.map((opening) => opening.bearingEnd - opening.bearingStart);
    expect(openingWidths[0]! / openingWidths[1]!).toBeCloseTo(2, 5);
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

  it("gives at least 35% of the rim no partner in its horizontal mirror", () => {
    let rimTiles = 0;
    let xorTiles = 0;
    for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
      for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
        const land = rimLandAt(x, y);
        const mirror = rimLandAt(PHAROSVILLE_MAP_WIDTH - 1 - x, y);
        if (land) rimTiles += 1;
        if (land !== mirror) xorTiles += 1;
      }
    }
    expect(xorTiles / rimTiles).toBeGreaterThanOrEqual(0.35);
  });

  it("authors at least three headlands and two bays over 360 bearings", () => {
    const depths = Array.from({ length: 360 }, (_, index) => rimDepthAt(-Math.PI + index * TAU / 360));
    let headlands = 0;
    let bays = 0;
    for (let index = 0; index < depths.length; index += 1) {
      const previous = depths[(index + depths.length - 1) % depths.length]!;
      const depth = depths[index]!;
      const next = depths[(index + 1) % depths.length]!;
      if (previous <= 0 || depth <= 0 || next <= 0) continue;
      if (depth > previous && depth > next) headlands += 1;
      if (depth < previous && depth < next) bays += 1;
    }
    expect(headlands).toBeGreaterThanOrEqual(3);
    expect(bays).toBeGreaterThanOrEqual(2);
  });

  it("turns the inner shoreline about every twelve edge tiles", () => {
    const size = PHAROSVILLE_MAP_WIDTH;
    const profiles = [
      Array.from({ length: size }, (_, y) => {
        let x = 0;
        while (x < size && rimLandAt(x, y)) x += 1;
        return x;
      }),
      Array.from({ length: size }, (_, y) => {
        let inset = 0;
        while (inset < size && rimLandAt(size - 1 - inset, y)) inset += 1;
        return inset;
      }),
      Array.from({ length: size }, (_, x) => {
        let y = 0;
        while (y < size && rimLandAt(x, y)) y += 1;
        return y;
      }),
      Array.from({ length: size }, (_, x) => {
        let inset = 0;
        while (inset < size && rimLandAt(x, size - 1 - inset)) inset += 1;
        return inset;
      }),
    ];
    for (const profile of profiles) {
      let runStart = 0;
      for (let index = 1; index <= profile.length; index += 1) {
        if (index < profile.length && profile[index] === profile[runStart]) continue;
        if (profile[runStart]! > 0) expect(index - runStart).toBeLessThanOrEqual(13);
        runStart = index;
      }
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

  it("keeps every maximum-rung stele footprint entirely over water", () => {
    const bodies = ["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"] as const;
    const sites = seaSignSites(bodies);
    expect(sites).toHaveLength(bodies.length);
    for (const site of sites) {
      const positionTile = positionOf(site);
      const positionKind = terrainKindAt(positionTile.x, positionTile.y);
      expect(isWaterTileKind(positionKind), `${site.body} position (${positionKind})`).toBe(true);
      expect(rimLandAt(positionTile.x, positionTile.y), `${site.body} position`).toBe(false);
      for (const tile of seaSignFootprintTiles(site)) {
        expect(tile.x, `${site.body} footprint x`).toBeGreaterThanOrEqual(0);
        expect(tile.y, `${site.body} footprint y`).toBeGreaterThanOrEqual(0);
        expect(tile.x, `${site.body} footprint x`).toBeLessThan(PHAROSVILLE_MAP_WIDTH);
        expect(tile.y, `${site.body} footprint y`).toBeLessThan(PHAROSVILLE_MAP_HEIGHT);
        const kind = terrainKindAt(tile.x, tile.y);
        expect(isWaterTileKind(kind), `${site.body} footprint ${tileKey(tile)} (${kind})`).toBe(true);
        expect(rimLandAt(tile.x, tile.y), `${site.body} footprint ${tileKey(tile)}`).toBe(false);
      }
    }
    expect(positionOf(sites.find((site) => site.body === "wreck")!)).toEqual({ x: 50, y: 122 });
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

  it("authors spaced, body-specific coves reachable from the current dock ring", () => {
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

    expect(bodies).toEqual(new Set(["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"]));
    const precinct = RIM_COVES.filter((cove) => cove.id === "ethereum-precinct" || cove.id.endsWith("-annex"));
    expect(precinct).toHaveLength(4);
    for (const cove of precinct) expect(cove.body).toBe("calm");
    for (let index = 0; index < precinct.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < precinct.length; otherIndex += 1) {
        const a = precinct[index]!.tile;
        const b = precinct[otherIndex]!.tile;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(24);
      }
    }
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
    const rimTile = { x: 8, y: 54 };
    const waterTile = { x: 9, y: 54 };
    expect(rimLandAt(rimTile.x, rimTile.y)).toBe(true);
    expect(rimLandAt(waterTile.x, waterTile.y)).toBe(false);
    expect(rimShoreDistance(rimTile.x, rimTile.y)).toBeLessThan(0);
    expect(rimShoreDistance(waterTile.x, waterTile.y)).toBeGreaterThan(0);
    expect(rimShoreDistance(8.5, 54)).toBe(0);
  });

  it("uses true Euclidean clearance at diagonal shoreline corners", () => {
    const rimTiles: { x: number; y: number }[] = [];
    let diagonalWater: { x: number; y: number } | null = null;
    for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
      for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
        if (rimLandAt(x, y)) rimTiles.push({ x, y });
      }
    }
    for (let y = 1; y < PHAROSVILLE_MAP_HEIGHT - 1 && !diagonalWater; y += 1) {
      for (let x = 1; x < PHAROSVILLE_MAP_WIDTH - 1; x += 1) {
        if (rimLandAt(x, y)) continue;
        const cardinalLand = rimLandAt(x - 1, y) || rimLandAt(x + 1, y)
          || rimLandAt(x, y - 1) || rimLandAt(x, y + 1);
        const diagonalLand = rimLandAt(x - 1, y - 1) || rimLandAt(x + 1, y - 1)
          || rimLandAt(x - 1, y + 1) || rimLandAt(x + 1, y + 1);
        if (!cardinalLand && diagonalLand) {
          diagonalWater = { x, y };
          break;
        }
      }
    }
    expect(diagonalWater).not.toBeNull();
    const tile = diagonalWater!;
    const bruteForce = Math.min(...rimTiles.map((land) => Math.hypot(tile.x - land.x, tile.y - land.y))) - 0.5;
    expect(bruteForce).toBeCloseTo(Math.SQRT2 - 0.5, 6);
    expect(rimShoreDistance(tile.x, tile.y)).toBeCloseTo(bruteForce, 6);
    expect(rimShoreDistance(tile.x, tile.y)).toBeLessThan(1);
  });
});
