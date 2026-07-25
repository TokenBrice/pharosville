export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TilePoint {
  x: number;
  y: number;
}

export interface IsoCamera {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface MapLike {
  width: number;
  height: number;
}

export function tileToIso(tile: TilePoint): ScreenPoint {
  return {
    x: (tile.x - tile.y) * (TILE_WIDTH / 2),
    y: (tile.x + tile.y) * (TILE_HEIGHT / 2),
  };
}

export function isoToScreen(point: ScreenPoint, camera: IsoCamera): ScreenPoint {
  return {
    x: point.x * camera.zoom + camera.offsetX,
    y: point.y * camera.zoom + camera.offsetY,
  };
}

export function tileToScreen(tile: TilePoint, camera: IsoCamera): ScreenPoint {
  return isoToScreen(tileToIso(tile), camera);
}

export function screenToIso(point: ScreenPoint, camera: IsoCamera): ScreenPoint {
  return {
    x: (point.x - camera.offsetX) / camera.zoom,
    y: (point.y - camera.offsetY) / camera.zoom,
  };
}

export function isoToTile(point: ScreenPoint): TilePoint {
  const diagonalA = point.x / (TILE_WIDTH / 2);
  const diagonalB = point.y / (TILE_HEIGHT / 2);
  return {
    x: (diagonalA + diagonalB) / 2,
    y: (diagonalB - diagonalA) / 2,
  };
}

export function screenToTile(point: ScreenPoint, camera: IsoCamera): TilePoint {
  return isoToTile(screenToIso(point, camera));
}

export function mapIsoBounds(map: MapLike) {
  const corners = [
    tileToIso({ x: 0, y: 0 }),
    tileToIso({ x: map.width - 1, y: 0 }),
    tileToIso({ x: 0, y: map.height - 1 }),
    tileToIso({ x: map.width - 1, y: map.height - 1 }),
  ];
  return {
    minX: Math.min(...corners.map((corner) => corner.x)) - TILE_WIDTH,
    maxX: Math.max(...corners.map((corner) => corner.x)) + TILE_WIDTH,
    minY: Math.min(...corners.map((corner) => corner.y)) - TILE_HEIGHT,
    maxY: Math.max(...corners.map((corner) => corner.y)) + TILE_HEIGHT,
  };
}

export function fitCameraToMap(input: {
  height: number;
  map: MapLike;
  padding?: { bottom?: number; left?: number; right?: number; top?: number };
  width: number;
}): IsoCamera {
  const padding = {
    bottom: input.padding?.bottom ?? 24,
    left: input.padding?.left ?? 24,
    right: input.padding?.right ?? 24,
    top: input.padding?.top ?? 56,
  };
  const bounds = mapIsoBounds(input.map);
  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(320, input.width - padding.left - padding.right);
  const availableHeight = Math.max(320, input.height - padding.top - padding.bottom);
  const zoom = Math.max(0.72, Math.min(1.25, Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight)));
  const contentWidth = boundsWidth * zoom;
  const contentHeight = boundsHeight * zoom;
  return {
    offsetX: Math.round(padding.left + (availableWidth - contentWidth) / 2 - bounds.minX * zoom),
    offsetY: Math.round(padding.top + (availableHeight - contentHeight) / 2 - bounds.minY * zoom),
    zoom,
  };
}

/**
 * Absolute zoom floor, used only when no viewport/map is available to compute
 * the real one. Prefer `minZoomForViewport`.
 */
export const ABSOLUTE_MIN_ZOOM = 0.48;
export const MAX_ZOOM = 2.4;

/**
 * N1 (2026-07-25): the smallest zoom that still frames the map.
 *
 * The map's iso bounds are 1760 x 880 for a 56-tile world, so at 1920x1080 it
 * fits at zoom ~1.09 — yet the floor was a flat 0.48, letting the camera pull
 * back to 2.3x the map's area. The world then read as a small tile adrift in
 * empty ocean (operator: "the current lighthouse+sea is like 25% of the map").
 *
 * The floor is now derived from the viewport, with a margin so a border of open
 * sea still frames the composition rather than the map running edge to edge.
 */
export const MIN_ZOOM_SEA_MARGIN = 0.86;

export function minZoomForViewport(viewport: ScreenPoint, map: MapLike): number {
  const bounds = mapIsoBounds(map);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const fit = Math.min(viewport.x / width, viewport.y / height);
  // Never rise above the interactive max, and never below the absolute floor:
  // a very small viewport must still be able to see the whole world.
  return Math.max(ABSOLUTE_MIN_ZOOM, Math.min(MAX_ZOOM, fit * MIN_ZOOM_SEA_MARGIN));
}

export function zoomCameraAt(
  camera: IsoCamera,
  point: ScreenPoint,
  nextZoom: number,
  minZoom = ABSOLUTE_MIN_ZOOM,
): IsoCamera {
  const clampedZoom = Math.max(minZoom, Math.min(MAX_ZOOM, nextZoom));
  const isoPoint = screenToIso(point, camera);
  return {
    offsetX: point.x - isoPoint.x * clampedZoom,
    offsetY: point.y - isoPoint.y * clampedZoom,
    zoom: clampedZoom,
  };
}
