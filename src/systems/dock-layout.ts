interface TilePoint {
  x: number;
  y: number;
}

const DOCK_OUTWARD_VECTOR_OVERRIDES: Record<string, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  // NW-shoulder Solana faces north into the upper harbor pocket so its
  // gangway stays clear of the seawall turn.
  "25.23": { x: 0, y: -1 },
};

const DOCK_DRAW_TILE_OVERRIDES: Record<string, TilePoint> = {
  // The Ethereum flag sits at the foot of the Yggdrasil world-tree inside the
  // civic cove, rather than pushed out to the seawall.
  "42.31": { x: 42.5, y: 29.2 },
};

function tileKey(tile: TilePoint): string {
  return `${tile.x}.${tile.y}`;
}

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

export function dockDrawTileOverride(tile: TilePoint): TilePoint | null {
  return DOCK_DRAW_TILE_OVERRIDES[tileKey(tile)] ?? null;
}
