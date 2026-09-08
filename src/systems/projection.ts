export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;
export const TILE_SCALE = Math.SQRT2;
export const CAMERA_DISTANCE = 110;

const CAMERA_RADIUS = CAMERA_DISTANCE * Math.sqrt(8 / 3);
const CAMERA_YAW = Math.PI / 4;
const CAMERA_PITCH = Math.atan(1 / Math.sqrt(3));
// Orthonormal lookAt basis for eye = target + (D, D * sqrt(2/3), D).
const CAMERA_RIGHT = { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 };
const CAMERA_UP = { x: -1 / Math.sqrt(8), y: Math.sqrt(3) / 2, z: -1 / Math.sqrt(8) };
const CAMERA_BACK = { x: Math.sqrt(3 / 8), y: 0.5, z: Math.sqrt(3 / 8) };

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

export interface CameraPose {
  targetTile: TilePoint;
  /** Equivalent orbit radius: the fixed orthographic rig radius divided by zoom. */
  distance: number;
  yaw: number;
  pitch: number;
}

interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export function cameraPoseFromIso(camera: IsoCamera, viewport: ScreenPoint): CameraPose {
  return {
    targetTile: screenToTile({ x: viewport.x / 2, y: viewport.y / 2 }, camera),
    distance: CAMERA_RADIUS / camera.zoom,
    yaw: CAMERA_YAW,
    pitch: CAMERA_PITCH,
  };
}

/** Inverts a pose on the fixed-yaw, fixed-pitch orthographic rig. */
export function isoFromCameraPose(pose: CameraPose, viewport: ScreenPoint): IsoCamera {
  const zoom = CAMERA_RADIUS / pose.distance;
  const target = tileToIso(pose.targetTile);
  return {
    offsetX: viewport.x / 2 - target.x * zoom,
    offsetY: viewport.y / 2 - target.y * zoom,
    zoom,
  };
}

// Row-major projection * view matrix. The symmetric depth range encloses the
// target; x/y use exactly gardenCameraViewHeight's viewportHeight/(16*zoom).
function orthographicMatrix(camera: IsoCamera, viewport: ScreenPoint): number[] {
  const target = screenToTile({ x: viewport.x / 2, y: viewport.y / 2 }, camera);
  const x = target.x * TILE_SCALE;
  const z = target.y * TILE_SCALE;
  const viewHeight = viewport.y / (TILE_HEIGHT * camera.zoom);
  const sx = 2 / (viewHeight * viewport.x / Math.max(1, viewport.y));
  const sy = 2 / viewHeight;
  const sz = -1 / CAMERA_RADIUS;
  return [
    sx * CAMERA_RIGHT.x, 0, sx * CAMERA_RIGHT.z, -sx * (CAMERA_RIGHT.x * x + CAMERA_RIGHT.z * z),
    sy * CAMERA_UP.x, sy * CAMERA_UP.y, sy * CAMERA_UP.z, -sy * (CAMERA_UP.x * x + CAMERA_UP.z * z),
    sz * CAMERA_BACK.x, sz * CAMERA_BACK.y, sz * CAMERA_BACK.z, -sz * (CAMERA_BACK.x * x + CAMERA_BACK.z * z),
    0, 0, 0, 1,
  ];
}

export function worldToScreen(world: WorldPoint, camera: IsoCamera, viewport: ScreenPoint): ScreenPoint {
  const matrix = orthographicMatrix(camera, viewport);
  const ndcX = matrix[0] * world.x + matrix[1] * world.y + matrix[2] * world.z + matrix[3];
  const ndcY = matrix[4] * world.x + matrix[5] * world.y + matrix[6] * world.z + matrix[7];
  return { x: (ndcX + 1) * viewport.x / 2, y: (1 - ndcY) * viewport.y / 2 };
}

/** Parallel orthographic rays start on the plane through the renderer's eye. */
export function screenToGroundRay(
  point: ScreenPoint,
  camera: IsoCamera,
  viewport: ScreenPoint,
): { origin: WorldPoint; direction: WorldPoint } {
  const target = screenToTile({ x: viewport.x / 2, y: viewport.y / 2 }, camera);
  const viewHeight = viewport.y / (TILE_HEIGHT * camera.zoom);
  const viewWidth = viewHeight * viewport.x / Math.max(1, viewport.y);
  const right = (point.x / viewport.x - 0.5) * viewWidth;
  const up = (0.5 - point.y / viewport.y) * viewHeight;
  return {
    origin: {
      x: target.x * TILE_SCALE + CAMERA_DISTANCE + right * CAMERA_RIGHT.x + up * CAMERA_UP.x,
      y: CAMERA_DISTANCE * Math.sqrt(2 / 3) + up * CAMERA_UP.y,
      z: target.y * TILE_SCALE + CAMERA_DISTANCE + right * CAMERA_RIGHT.z + up * CAMERA_UP.z,
    },
    direction: { x: -CAMERA_BACK.x, y: -CAMERA_BACK.y, z: -CAMERA_BACK.z },
  };
}

export function screenToGround(
  point: ScreenPoint,
  camera: IsoCamera,
  viewport: ScreenPoint,
  groundY = 0,
): TilePoint {
  const ray = screenToGroundRay(point, camera, viewport);
  const distance = (groundY - ray.origin.y) / ray.direction.y;
  return {
    x: (ray.origin.x + distance * ray.direction.x) / TILE_SCALE,
    y: (ray.origin.z + distance * ray.direction.z) / TILE_SCALE,
  };
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
