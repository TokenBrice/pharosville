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

/**
 * The finite Garden Sea continues past the outer tile centres so the rim,
 * displaced water, and both sea openings end inside the authored plate rather
 * than at the interactive camera clamp.
 *
 * Camera framing and the renderer must share this extent. A smaller camera
 * bound makes an edge berth impossible to bring fully on screen at inspection
 * zoom even though the berth itself is still on the plate.
 */
export const GARDEN_PLATE_MARGIN_TILES = 8;

/** True when a tile centre is carried by the finite rendered water plate. */
export function gardenWaterPlateContainsTile(tile: TilePoint, map: MapLike): boolean {
  return tile.x >= -GARDEN_PLATE_MARGIN_TILES
    && tile.y >= -GARDEN_PLATE_MARGIN_TILES
    && tile.x <= map.width - 1 + GARDEN_PLATE_MARGIN_TILES
    && tile.y <= map.height - 1 + GARDEN_PLATE_MARGIN_TILES;
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
  const minTile = -GARDEN_PLATE_MARGIN_TILES;
  const maxTileX = map.width - 1 + GARDEN_PLATE_MARGIN_TILES;
  const maxTileY = map.height - 1 + GARDEN_PLATE_MARGIN_TILES;
  const corners = [
    tileToIso({ x: minTile, y: minTile }),
    tileToIso({ x: maxTileX, y: minTile }),
    tileToIso({ x: minTile, y: maxTileY }),
    tileToIso({ x: maxTileX, y: maxTileY }),
  ];
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
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
  // Warm-village A1 (2026-09-05): the fit floor is the sailed-in 1.0 rest
  // (see `defaultCamera`, which refines it to seat the landing interval).
  // The retired 0.60 plate kept two camera-side rim entries in the landing
  // frame; at 1.0 the rim and coves are reached by panning and by the
  // whole-map zoom-out, which stays owned by minZoomForViewport. Viewports
  // so large the plate itself fills the screen still fit past 1.0, capped
  // here at 1.25.
  const zoom = Math.max(GARDEN_FIT_CAMERA_MIN_ZOOM, Math.min(1.25, Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight)));
  const contentWidth = boundsWidth * zoom;
  const contentHeight = boundsHeight * zoom;
  return {
    offsetX: Math.round(padding.left + (availableWidth - contentWidth) / 2 - bounds.minX * zoom),
    offsetY: Math.round(padding.top + (availableHeight - contentHeight) / 2 - bounds.minY * zoom),
    zoom,
  };
}

/**
 * Authored resting composition floor (2026-09-06): 0.72. Warm-village A1 had
 * sailed the rest in to 1.0 and the world read as small; 0.72 shows roughly
 * twice the water without returning to the retired 0.612 plate. `defaultCamera`
 * may rest slightly below it to seat the Pharos→Mole landing interval on
 * compact gates, but never under its own rest floor; whole-map zoom-out uses
 * `minZoomForViewport`.
 */
export const GARDEN_FIT_CAMERA_MIN_ZOOM = 0.72;

/**
 * Absolute zoom floor, used only when no viewport/map is available to compute
 * the real one. Prefer `minZoomForViewport`.
 */
// Hard safety floor only. The real floor is `minZoomForViewport`, which is
// derived from the map; this exists so a pathologically small viewport can
// still frame the world. Lowered from 0.48 when the grid doubled to 112
// tiles (N1) — the old value sat ABOVE the new whole-map fit.
export const ABSOLUTE_MIN_ZOOM = 0.28;
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
// Just under a perfect fit, so a sliver of open sea frames the world rather
// than the map running exactly edge to edge.
export const MIN_ZOOM_SEA_MARGIN = 0.95;

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
