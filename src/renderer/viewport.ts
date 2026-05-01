import { screenToTile, type IsoCamera, type ScreenPoint } from "../systems/projection";

export interface VisibleTileBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export function visibleTileBoundsForCamera(input: {
  camera: IsoCamera;
  mapHeight: number;
  mapWidth: number;
  tileMargin: number;
  viewportHeight: number;
  viewportWidth: number;
}): VisibleTileBounds | null {
  const { camera, mapHeight, mapWidth, tileMargin, viewportHeight, viewportWidth } = input;
  if (mapWidth <= 0 || mapHeight <= 0) return null;

  const corners = [
    screenToTile({ x: 0, y: 0 }, camera),
    screenToTile({ x: viewportWidth, y: 0 }, camera),
    screenToTile({ x: 0, y: viewportHeight }, camera),
    screenToTile({ x: viewportWidth, y: viewportHeight }, camera),
  ];
  const xValues = corners.map((corner) => corner.x);
  const yValues = corners.map((corner) => corner.y);

  const minX = Math.max(0, Math.floor(Math.min(...xValues)) - tileMargin);
  const maxX = Math.min(mapWidth - 1, Math.ceil(Math.max(...xValues)) + tileMargin);
  const minY = Math.max(0, Math.floor(Math.min(...yValues)) - tileMargin);
  const maxY = Math.min(mapHeight - 1, Math.ceil(Math.max(...yValues)) + tileMargin);
  if (minX > maxX || minY > maxY) return null;
  return { maxX, maxY, minX, minY };
}

export function isScreenPointInViewport(
  point: Pick<ScreenPoint, "x" | "y">,
  viewportWidth: number,
  viewportHeight: number,
  marginX: number,
  marginY: number,
): boolean {
  return (
    point.x >= -marginX
    && point.x <= viewportWidth + marginX
    && point.y >= -marginY
    && point.y <= viewportHeight + marginY
  );
}

export function tileBoundsTileCount(bounds: VisibleTileBounds | null): number {
  if (!bounds) return 0;
  return (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
}
