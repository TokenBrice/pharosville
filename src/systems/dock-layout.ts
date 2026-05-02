interface TilePoint {
  x: number;
  y: number;
}

const DOCK_OUTWARD_VECTOR_OVERRIDES: Record<string, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  // North-east shoulder docks should project into the upper harbor pocket,
  // not eastward into the seawall bend.
  "34.22": { x: 0, y: -1 },
  "37.23": { x: 0, y: -1 },
};

const DOCK_DRAW_TILE_OVERRIDES: Record<string, TilePoint> = {
  // These authored draw anchors tuck the Solana / Hyperliquid slips against
  // the north wall while keeping their gangways clear of the seawall turn.
  "34.22": { x: 34.45, y: 21.35 },
  "37.23": { x: 37.55, y: 22.25 },
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
