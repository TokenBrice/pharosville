import { landWorldTile } from "./map-scale";

interface TilePoint {
  x: number;
  y: number;
}

/**
 * The island the harbour ring wraps, in world tiles, and its design half-axes
 * (see `mainIslandDesignValue` in world-layout.ts).
 */
const ISLAND_CENTER = landWorldTile({ x: 31, y: 31 });
const ISLAND_HALF_WIDTH = 12;
const ISLAND_HALF_HEIGHT = 9.5;

/**
 * Which way is "out to sea" from a berth, as a cardinal direction.
 *
 * H1: measured from the ISLAND centre, not the map centre. The island sits
 * three tiles off the middle of the grid, so the map-centre reading pointed
 * the north-east and south-west berths back into the rock; growing the map
 * (H4) widened that error. Distances are normalised by the island's half-axes
 * first, because on a 12x9.5 oval a raw |dx| vs |dy| test calls nearly every
 * berth "east" or "west".
 */
export function dockOutwardVectorForTile(tile: TilePoint): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const acrossX = (tile.x - ISLAND_CENTER.x) / ISLAND_HALF_WIDTH;
  const acrossY = (tile.y - ISLAND_CENTER.y) / ISLAND_HALF_HEIGHT;
  if (Math.abs(acrossX) >= Math.abs(acrossY)) return { x: acrossX < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: acrossY < 0 ? -1 : 1 };
}
