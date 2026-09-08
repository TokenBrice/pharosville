import {
  gardenIslandDisplayTile,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
} from "./garden-observatory-slice";
import { EVM_BAY_STATION_SLOTS, LIGHTHOUSE_TILE, OUTER_HARBOR_STATION_SLOTS } from "./world-layout";
import type { DockNode } from "./world-types";
import type { IsoCamera, MapLike, ScreenPoint } from "./projection";
import {
  cameraEye,
  cameraPoseFromIso,
  GARDEN_PLATE_MARGIN_TILES,
  GARDEN_FIT_CAMERA_MIN_ZOOM,
  mapIsoBounds,
  minZoomForViewport,
  tileToIso,
  TILE_SCALE,
  worldToScreen,
  zoomCameraAt,
} from "./projection";

export interface CameraBoundsInput {
  map: MapLike;
  viewport: ScreenPoint;
  padding?: {
    bottom?: number;
    left?: number;
    right?: number;
    top?: number;
  };
}

/** Reference scale for distance-authored scenery, not a fixed resting zoom. */
export const GARDEN_DEFAULT_CAMERA_ZOOM = GARDEN_FIT_CAMERA_MIN_ZOOM;
/** Widest authored rest; whole-map framing remains an explicit zoom-out. */
export const GARDEN_REST_ZOOM_FLOOR = 0.8;
/** Rest must stay below the postcard-only tilt-shift regime. */
const GARDEN_REST_ZOOM_CEILING = 1.15;
const REST_STATION_TILES = [...EVM_BAY_STATION_SLOTS, ...OUTER_HARBOR_STATION_SLOTS]
  .map((slot) => slot.cove.tile);

function cameraPadding(input?: CameraBoundsInput["padding"]) {
  return {
    bottom: input?.bottom ?? 80,
    left: input?.left ?? 0,
    right: input?.right ?? 128,
    top: input?.top ?? 0,
  };
}

export function defaultCamera(input: {
  height: number;
  map: MapLike;
  width: number;
  subjects?: readonly DockNode[];
}): IsoCamera {
  const viewport = { x: input.width, y: input.height };
  const island = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
  const base = {
    x: island.x * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
    y: GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
    z: island.y * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
  };
  const crown = { ...base, y: base.y + GARDEN_LIGHTHOUSE_HEIGHT };
  const stationTiles = input.subjects?.map((dock) => dock.tile) ?? REST_STATION_TILES;
  const points = input.subjects?.length
    ? stationTiles
    : [EVM_BAY_STATION_SLOTS[0]!.cove.tile];
  const stationFlags = stationTiles.map((tile) => {
    const tip = { x: tile.x * TILE_SCALE, y: 26, z: tile.y * TILE_SCALE };
    const vertices = [{ ...tip, y: 0 }, tip];
    for (const reach of [-6, 6]) {
      for (const y of [16, 26]) {
        vertices.push({ x: tip.x + reach / Math.SQRT2, y, z: tip.z - reach / Math.SQRT2 });
      }
    }
    return { tile, tip, vertices };
  });
  // G1 0.5-tile / 0.01-zoom scan: 150 feasible rests at 900×720/60%.
  // At 1200×640, 50% admits none (0.0129 best violation); 44% admits 31.
  const nearFlagBand = viewport.x / viewport.y >= 1.8 ? 0.44 : 0.60;
  const nearFlagLeft = (1 - nearFlagBand) / 2;
  const nearFlagRight = (1 + nearFlagBand) / 2;
  const eyeMaxX = input.map.width + GARDEN_PLATE_MARGIN_TILES - 4;
  const eyeMaxY = input.map.height + GARDEN_PLATE_MARGIN_TILES - 4;
  let best = { offsetX: 0, offsetY: 0, zoom: GARDEN_REST_ZOOM_FLOOR };
  let bestViolation = Infinity;
  let bestScore = -Infinity;
  let bestAim = Infinity;
  let bestEye = { x: eyeMaxX, y: eyeMaxY };

  const seat = (target: ScreenPoint, zoom: number): IsoCamera => {
    const iso = tileToIso(target);
    return {
      offsetX: viewport.x / 2 - iso.x * zoom,
      offsetY: viewport.y / 2 - iso.y * zoom,
      zoom,
    };
  };
  const interval = (value: number, low: number, high: number) => (
    Math.max(0, low - value, value - high)
  );
  const inspect = (eyeTile: ScreenPoint, zoom: number, shift: ScreenPoint) => {
    if (eyeTile.x < 8 || eyeTile.x > eyeMaxX || eyeTile.y < 8 || eyeTile.y > eyeMaxY
      || eyeTile.x + eyeTile.y < 200) return;
    const eyeX = eyeTile.x * TILE_SCALE;
    const eyeZ = eyeTile.y * TILE_SCALE;
    const segmentX = base.x - eyeX;
    const segmentZ = base.z - eyeZ;
    const segmentLengthSquared = segmentX ** 2 + segmentZ ** 2;
    for (const tile of stationTiles) {
      if ((tile.x - eyeTile.x) ** 2 + (tile.y - eyeTile.y) ** 2 < 14 ** 2) return;
      const stationX = tile.x * TILE_SCALE - eyeX;
      const stationZ = tile.y * TILE_SCALE - eyeZ;
      const along = segmentLengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
        (stationX * segmentX + stationZ * segmentZ) / segmentLengthSquared,
      ));
      if ((stationX - along * segmentX) ** 2 + (stationZ - along * segmentZ) ** 2 < 4 ** 2) return;
    }
    const camera = seat({ x: eyeTile.x - shift.x, y: eyeTile.y - shift.y }, zoom);
    const top = worldToScreen(crown, camera, viewport);
    const foot = worldToScreen(base, camera, viewport);
    const tx = top.x / viewport.x;
    const ty = top.y / viewport.y;
    const bx = foot.x / viewport.x;
    const by = foot.y / viewport.y;
    let violation = interval(tx, 0.50, 0.72) + interval(bx, 0.50, 0.72)
      + Math.max(0, 0.04 - ty) + interval(by, 0.35, 0.65);
    // All remaining violations are nonnegative; avoid projecting flag
    // envelopes when this candidate already cannot beat the current rest.
    if (violation > bestViolation + 1e-9) return;
    // Distant tips must clear the tower column; nearby staffs and cloth must
    // clear the central frame, even when their tips miss the tower itself.
    const columnLeft = Math.min(tx, bx) - 0.12;
    const columnRight = Math.max(tx, bx) + 0.12;
    let flagViolation = 0;
    for (const flag of stationFlags) {
      if ((flag.tile.x - eyeTile.x) ** 2 + (flag.tile.y - eyeTile.y) ** 2 > 40 ** 2) {
        const x = worldToScreen(flag.tip, camera, viewport).x / viewport.x;
        if (x >= columnLeft && x <= columnRight) return;
        continue;
      }
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const vertex of flag.vertices) {
        const projected = worldToScreen(vertex, camera, viewport);
        const x = projected.x / viewport.x;
        const y = projected.y / viewport.y;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      flagViolation += Math.max(0, Math.min(right - nearFlagLeft, nearFlagRight - left, bottom, 1 - top));
    }
    violation += flagViolation;
    let harbourViolation = Infinity;
    let visible = 0;
    let corridorSubjects = 0;
    for (const tile of points) {
      const projected = worldToScreen(
        { x: tile.x * TILE_SCALE, y: 0, z: tile.y * TILE_SCALE }, camera, viewport,
      );
      const x = projected.x / viewport.x;
      const y = projected.y / viewport.y;
      const outside = interval(x, 0.04, 0.96) + interval(y, 0.04, 0.96);
      harbourViolation = Math.min(harbourViolation, outside);
      if (outside === 0) visible += 1;
      if (x >= 0.35 && x <= 0.65 && y >= 0.6 && y <= 0.95) corridorSubjects += 1;
    }
    if (input.subjects?.length) violation += harbourViolation;
    // The shore and subject bands own feasibility. Within that set, prefer
    // open approach water, a closer rest and more readable harbours.
    const score = zoom + 0.02 * visible - 2 * corridorSubjects
      - (input.subjects?.length ? 0 : harbourViolation);
    const aim = Math.abs(tx - 0.62) + Math.abs(by - 0.50);
    if (violation < bestViolation - 1e-9
      || (Math.abs(violation - bestViolation) <= 1e-9
        && (score > bestScore || (score === bestScore && aim < bestAim)))) {
      best = camera;
      bestEye = eyeTile;
      bestViolation = violation;
      bestScore = score;
      bestAim = aim;
    }
  };
  const eyeShift = (zoom: number): ScreenPoint => {
    const eye = cameraEye(cameraPoseFromIso(seat({ x: 0, y: 0 }, zoom), viewport));
    return { x: eye.x / TILE_SCALE, y: eye.z / TILE_SCALE };
  };

  // Search the physical eye footprint, not a subject-driven target that can
  // pull the viewer off the finite plate. The near-flag feasible cells are
  // narrower than the old four-tile grid; search at the feasibility-scan scale.
  for (let step = 0; step <= 35; step += 1) {
    const zoom = Math.round((GARDEN_REST_ZOOM_FLOOR + step * 0.01) * 1e6) / 1e6;
    const shift = eyeShift(zoom);
    for (let x = eyeMaxX; x >= 8; x -= 0.5) {
      for (let y = eyeMaxY; y >= Math.max(8, 200 - x); y -= 0.5) {
        inspect({ x, y }, zoom, shift);
      }
    }
  }
  const coarseEye = bestEye;
  const coarseZoom = best.zoom;
  for (let step = -5; step <= 5; step += 1) {
    const zoom = Math.round(Math.max(GARDEN_REST_ZOOM_FLOOR, Math.min(GARDEN_REST_ZOOM_CEILING, coarseZoom + step * 0.01)) * 1e6) / 1e6;
    const shift = eyeShift(zoom);
    for (let x = -4; x <= 4; x += 0.25) {
      for (let y = -4; y <= 4; y += 0.25) {
        inspect({ x: coarseEye.x + x, y: coarseEye.y + y }, zoom, shift);
      }
    }
  }
  // Map clamping is an orthographic navigation bound, not a rest-shot fit:
  // applying it here would undo the projected subject constraints.
  return best;
}

export function clampCameraToMap(camera: IsoCamera, input: CameraBoundsInput): IsoCamera {
  const padding = cameraPadding(input.padding);
  const bounds = mapIsoBounds(input.map);
  const left = padding.left;
  const right = Math.max(left + 1, input.viewport.x - padding.right);
  const top = padding.top;
  const bottom = Math.max(top + 1, input.viewport.y - padding.bottom);
  const contentWidth = (bounds.maxX - bounds.minX) * camera.zoom;
  const contentHeight = (bounds.maxY - bounds.minY) * camera.zoom;
  const availableWidth = right - left;
  const availableHeight = bottom - top;

  const offsetX = clampOffset({
    availableSize: availableWidth,
    contentSize: contentWidth,
    maxCoordinate: bounds.maxX,
    minCoordinate: bounds.minX,
    offset: camera.offsetX,
    rangeEnd: right,
    rangeStart: left,
    zoom: camera.zoom,
  });
  const offsetY = clampOffset({
    availableSize: availableHeight,
    contentSize: contentHeight,
    maxCoordinate: bounds.maxY,
    minCoordinate: bounds.minY,
    offset: camera.offsetY,
    rangeEnd: bottom,
    rangeStart: top,
    zoom: camera.zoom,
  });

  return {
    ...camera,
    offsetX,
    offsetY,
  };
}

export function panCamera(camera: IsoCamera, delta: ScreenPoint, bounds?: CameraBoundsInput): IsoCamera {
  const next = {
    ...camera,
    offsetX: camera.offsetX + delta.x,
    offsetY: camera.offsetY + delta.y,
  };
  return bounds ? clampCameraToMap(next, bounds) : next;
}

export function zoomIn(camera: IsoCamera, viewport: ScreenPoint, map?: MapLike): IsoCamera {
  const next = zoomCameraAt(
    camera,
    { x: viewport.x / 2, y: viewport.y / 2 },
    camera.zoom * 1.18,
    map ? minZoomForViewport(viewport, map) : undefined,
  );
  return map ? clampCameraToMap(next, { map, viewport }) : next;
}

export function zoomOut(camera: IsoCamera, viewport: ScreenPoint, map?: MapLike): IsoCamera {
  // N1: the floor is derived from the viewport so the camera can never pull
  // back past the world into empty ocean.
  const next = zoomCameraAt(
    camera,
    { x: viewport.x / 2, y: viewport.y / 2 },
    camera.zoom / 1.18,
    map ? minZoomForViewport(viewport, map) : undefined,
  );
  return map ? clampCameraToMap(next, { map, viewport }) : next;
}

export function followTile(input: {
  camera: IsoCamera;
  map?: MapLike;
  tile: ScreenPoint;
  viewport: ScreenPoint;
}): IsoCamera {
  const iso = tileToIso(input.tile);
  const next = {
    ...input.camera,
    offsetX: input.viewport.x / 2 - iso.x * input.camera.zoom,
    offsetY: input.viewport.y / 2 - iso.y * input.camera.zoom,
  };
  const pose = cameraPoseFromIso(next, input.viewport);
  const anchor = worldToScreen({
    x: input.tile.x * TILE_SCALE,
    y: GARDEN_SHIP_ROOT_Y,
    z: input.tile.y * TILE_SCALE,
  }, next, input.viewport);
  // The iso target is elevated above the hull. Correct the projected numerator,
  // not raw pixels: perspective depth changes as the target moves along the shore.
  const sinPitch = Math.sin(pose.pitch);
  const depthRatio = (pose.distance - (GARDEN_SHIP_ROOT_Y - pose.targetHeight) * sinPitch) / pose.distance;
  next.offsetX += (input.viewport.x / 2 - anchor.x) * depthRatio;
  next.offsetY += (input.viewport.y / 2 - anchor.y) * depthRatio / (2 * sinPitch);
  return input.map ? clampCameraToMap(next, { map: input.map, viewport: input.viewport }) : next;
}

export function cameraZoomLabel(camera: IsoCamera): string {
  return `${Math.round(camera.zoom * 100)}%`;
}

function clampOffset(input: {
  availableSize: number;
  contentSize: number;
  maxCoordinate: number;
  minCoordinate: number;
  offset: number;
  rangeEnd: number;
  rangeStart: number;
  zoom: number;
}) {
  if (input.contentSize <= input.availableSize) {
    return input.rangeStart + (input.availableSize - input.contentSize) / 2 - input.minCoordinate * input.zoom;
  }
  const minOffset = input.rangeEnd - input.maxCoordinate * input.zoom;
  const maxOffset = input.rangeStart - input.minCoordinate * input.zoom;
  return Math.max(minOffset, Math.min(maxOffset, input.offset));
}
