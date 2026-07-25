import { landWorldTile } from "./map-scale";
import { tileKey } from "./tile-key";

interface TilePoint {
  x: number;
  y: number;
}

const DOCK_OUTWARD_VECTOR_OVERRIDES: Record<string, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  // NW-shoulder Solana faces north into the upper harbor pocket so its
  // gangway stays clear of the seawall turn. N1: keyed in world space, but the
  // dock is authored in design space (25, 23) like the rest of the harbor ring.
  [tileKey(landWorldTile({ x: 25, y: 23 }))]: { x: 0, y: -1 },
};

export function dockOutwardVectorForTile(
  tile: TilePoint,
  mapWidth: number,
): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const override = DOCK_OUTWARD_VECTOR_OVERRIDES[tileKey(tile)];
  if (override) return override;

  const center = (mapWidth - 1) / 2;
  const dx = tile.x - center;
  const dy = tile.y - center;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: dy < 0 ? -1 : 1 };
}
