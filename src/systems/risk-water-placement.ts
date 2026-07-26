import { riskWaterAreaForPlacement } from "./risk-water-areas";
import { isGardenObstacleTile } from "./garden-water-exclusion";
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
  // Zones-v2 placement fix: painted zone water under the RENDERED island
  // rock (or any decorative islet) is not usable — the garden island mesh is
  // display-decoupled from the terrain model and covers some data water.
  if (isGardenObstacleTile(tile.x, tile.y)) return false;
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

// A whole-map scan per placement, and the terrain field it reads is fixed for
// the session — so the answer is too. Memoised because the ship spread asks for
// it once per placement on every world build (and a build happens on every data
// refresh). Callers only read the tiles, so the shared array is frozen.
const candidatesByPlacement = new Map<ShipRiskPlacement, readonly { x: number; y: number }[]>();

export function riskPlacementWaterTiles(placement: ShipRiskPlacement): readonly { x: number; y: number }[] {
  const cached = candidatesByPlacement.get(placement);
  if (cached) return cached;
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const candidate = { x, y };
      if (isRiskPlacementWaterTile(candidate, placement)) candidates.push(Object.freeze(candidate));
    }
  }
  const frozen = Object.freeze(candidates);
  candidatesByPlacement.set(placement, frozen);
  return frozen;
}
