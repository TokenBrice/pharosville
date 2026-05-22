export interface TileKeyPoint {
  readonly x: number;
  readonly y: number;
}

export function tileKey(tile: TileKeyPoint): string {
  return `${tile.x}.${tile.y}`;
}
