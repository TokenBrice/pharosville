import { screenToTile, type IsoCamera, type ScreenPoint } from "../systems/projection";

export interface VisibleTileBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

interface CachedVisibleTileBoundsState {
  bounds: VisibleTileBounds | null;
  camera: IsoCamera;
  mapHeight: number;
  mapWidth: number;
  tileMargin: number;
  viewportHeight: number;
  viewportWidth: number;
}

export interface VisibleTileBoundsCacheState {
  last: CachedVisibleTileBoundsState | null;
}

const CAMERA_DELTA_TILE_EPSILON = 1;
const CAMERA_ZOOM_DELTA_EPSILON = 0.002;
const SMALL_MOVEMENT_TILE_PADDING = 1;

export function createVisibleTileBoundsCacheState(): VisibleTileBoundsCacheState {
  return { last: null };
}

function shouldReuseCachedBoundsForNearCamera(
  a: IsoCamera,
  b: IsoCamera,
): boolean {
  const avgZoom = Math.min(a.zoom, b.zoom);
  if (avgZoom <= 0 || Math.abs(a.zoom - b.zoom) > CAMERA_ZOOM_DELTA_EPSILON) return false;
  const tileDelta = (Math.abs(a.offsetX - b.offsetX) + Math.abs(a.offsetY - b.offsetY)) / (2 * avgZoom);
  return tileDelta <= CAMERA_DELTA_TILE_EPSILON;
}

function sameVisibleTileBoundsSignature(left: CachedVisibleTileBoundsState, right: Parameters<typeof visibleTileBoundsForCamera>[0]): boolean {
  return left.mapWidth === right.mapWidth
    && left.mapHeight === right.mapHeight
    && left.tileMargin === right.tileMargin
    && left.viewportHeight === right.viewportHeight
    && left.viewportWidth === right.viewportWidth;
}

function inflateVisibleTileBoundsForReuse(
  bounds: VisibleTileBounds | null,
  mapWidth: number,
  mapHeight: number,
): VisibleTileBounds | null {
  if (!bounds) return null;
  return {
    maxX: Math.min(mapWidth - 1, bounds.maxX + SMALL_MOVEMENT_TILE_PADDING),
    maxY: Math.min(mapHeight - 1, bounds.maxY + SMALL_MOVEMENT_TILE_PADDING),
    minX: Math.max(0, bounds.minX - SMALL_MOVEMENT_TILE_PADDING),
    minY: Math.max(0, bounds.minY - SMALL_MOVEMENT_TILE_PADDING),
  };
}

function sameCamera(left: IsoCamera, right: IsoCamera): boolean {
  return left.offsetX === right.offsetX && left.offsetY === right.offsetY && left.zoom === right.zoom;
}

function visibleTileBoundsForCameraCore(input: {
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

export function visibleTileBoundsForCamera(input: {
  camera: IsoCamera;
  mapHeight: number;
  mapWidth: number;
  tileMargin: number;
  viewportHeight: number;
  viewportWidth: number;
}, cache?: VisibleTileBoundsCacheState): VisibleTileBounds | null {
  const cached = cache?.last;
  if (cached && sameVisibleTileBoundsSignature(cached, input)) {
    if (sameCamera(cached.camera, input.camera)) {
      return cached.bounds;
    }

    if (shouldReuseCachedBoundsForNearCamera(cached.camera, input.camera)) {
      return inflateVisibleTileBoundsForReuse(cached.bounds, input.mapWidth, input.mapHeight);
    }
  }

  const bounds = visibleTileBoundsForCameraCore(input);
  if (cache) {
    cache.last = {
      ...input,
      camera: input.camera,
      bounds,
    };
  }
  return bounds;
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
