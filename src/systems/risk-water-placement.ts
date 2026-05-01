import { riskWaterAreaForPlacement } from "./risk-water-areas";
import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  clampMapTile,
  isWaterTileKind,
  terrainKindAt,
  tileKindAt,
} from "./world-layout";
import type { ShipRiskPlacement } from "./world-types";

export function isRiskPlacementWaterTile(tile: { x: number; y: number }, placement: ShipRiskPlacement): boolean {
  const terrain = terrainKindAt(tile.x, tile.y);
  const validTerrains = riskWaterAreaForPlacement(placement).validTerrains;
  if (validTerrains === "any-water") return isWaterTileKind(tileKindAt(tile.x, tile.y));
  return validTerrains.includes(terrain);
}

export function nearestRiskPlacementWaterTile(
  tile: { x: number; y: number },
  placement: ShipRiskPlacement,
  maxRadius = 12,
): { x: number; y: number } | null {
  if (isRiskPlacementWaterTile(tile, placement)) return tile;

  let bestTile: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = {
          ...clampMapTile({ x: tile.x + dx, y: tile.y + dy }),
        };
        if (!isRiskPlacementWaterTile(candidate, placement)) continue;
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < bestDistance) {
          bestTile = candidate;
          bestDistance = distance;
        }
      }
    }
    if (bestTile) return bestTile;
  }

  return null;
}

export function nearestAvailableRiskPlacementWaterTile(
  tile: { x: number; y: number },
  placement: ShipRiskPlacement,
  occupied: ReadonlySet<string>,
  maxRadius = 12,
): { x: number; y: number } | null {
  const initialKey = `${tile.x}.${tile.y}`;
  if (isRiskPlacementWaterTile(tile, placement) && !occupied.has(initialKey)) return tile;

  let bestTile: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = {
          ...clampMapTile({ x: tile.x + dx, y: tile.y + dy }),
        };
        if (occupied.has(`${candidate.x}.${candidate.y}`)) continue;
        if (!isRiskPlacementWaterTile(candidate, placement)) continue;
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < bestDistance) {
          bestTile = candidate;
          bestDistance = distance;
        }
      }
    }
    if (bestTile) return bestTile;
  }

  for (const candidate of riskPlacementWaterTilesByDistance(tile, placement)) {
    if (!occupied.has(`${candidate.x}.${candidate.y}`)) return candidate;
  }

  return null;
}

export function riskPlacementWaterTiles(placement: ShipRiskPlacement): { x: number; y: number }[] {
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const candidate = { x, y };
      if (isRiskPlacementWaterTile(candidate, placement)) candidates.push(candidate);
    }
  }
  return candidates;
}

function riskPlacementWaterTilesByDistance(
  tile: { x: number; y: number },
  placement: ShipRiskPlacement,
): { x: number; y: number }[] {
  return riskPlacementWaterTiles(placement)
    .map((candidate) => ({
      ...candidate,
      distance: Math.abs(tile.x - candidate.x) + Math.abs(tile.y - candidate.y),
    }))
    .toSorted((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x)
    .map(({ x, y }) => ({ x, y }));
}
