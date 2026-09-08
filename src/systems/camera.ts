import {
  gardenIslandDisplayTile,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
} from "./garden-observatory-slice";
import { topHarboursByShare } from "./chain-docks";
import { EVM_BAY_STATION_SLOTS, LIGHTHOUSE_TILE } from "./world-layout";
import type { DockNode } from "./world-types";
import type { IsoCamera, MapLike, ScreenPoint } from "./projection";
import {
  GARDEN_FIT_CAMERA_MIN_ZOOM,
  mapIsoBounds,
  minZoomForViewport,
  screenToGround,
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
export const GARDEN_REST_ZOOM_FLOOR = 0.55;

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
  const mole = EVM_BAY_STATION_SLOTS[0]!.cove.tile;
  const harbours = topHarboursByShare(input.subjects ?? [], 3);
  // A southern station remains a subject even when its share is outside the
  // leading three. Without a world, the Pharos/Mole pair owns the landing.
  const southern = topHarboursByShare(
    (input.subjects ?? []).filter((dock) => dock.tile.y >= 112), 1,
  )[0];
  if (southern && !harbours.includes(southern)) harbours.push(southern);
  const points = [mole, ...harbours.map((dock) => dock.tile)];
  let best = { offsetX: 0, offsetY: 0, zoom: GARDEN_REST_ZOOM_FLOOR };
  let bestViolation = Infinity;
  let bestAim = Infinity;
  let bestTarget = island;

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
  const inspect = (target: ScreenPoint, zoom: number) => {
    const camera = seat(target, zoom);
    const top = worldToScreen(crown, camera, viewport);
    const foot = worldToScreen(base, camera, viewport);
    const tx = top.x / viewport.x;
    const ty = top.y / viewport.y;
    const bx = foot.x / viewport.x;
    const by = foot.y / viewport.y;
    // Crown air is non-negotiable. The short gate's low eye cannot seat a
    // 38-unit tower at a 45%-height base; prefer the closest feasible base
    // over clipping its crown to imitate the retired orthographic shot.
    let violation = 1000 * (interval(tx, 0.56, 0.68) + interval(bx, 0.56, 0.68)
      + interval(ty, 0.041, 0.30)) + interval(by, 0.25, 0.50);
    for (const tile of points) {
      const projected = worldToScreen(
        { x: tile.x * TILE_SCALE, y: 0, z: tile.y * TILE_SCALE }, camera, viewport,
      );
      const x = projected.x / viewport.x;
      const y = projected.y / viewport.y;
      if (tile === mole || tile === southern?.tile) {
        violation += 1000 * (interval(x, 0.04, 0.96) + interval(y, 0.04, 0.96));
      }
      // A tapered approach joins bottom-centre to the island's foot. The
      // island is its endpoint, never an obstacle within the water interval.
      if (y > by + 0.04 && y <= 1) {
        const centre = bx + (0.5 - bx) * (y - by) / (1 - by);
        violation += 1000 * Math.max(0, 0.045 - Math.abs(x - centre));
      }
      if (x >= 0 && x < 0.15 && y > 0.85 && y <= 1) {
        violation += 1000 * Math.min(0.15 - x, y - 0.85);
      }
    }
    const aim = Math.abs(tx - 0.62) + Math.abs(by - 0.40);
    if (violation < bestViolation - 1e-9
      || (Math.abs(violation - bestViolation) <= 1e-9
        && (zoom > best.zoom || (zoom === best.zoom && aim < bestAim)))) {
      best = camera;
      bestTarget = target;
      bestViolation = violation;
      bestAim = aim;
    }
  };

  // Seed each zoom by seating the base through the same perspective inverse
  // used for picking; search ground-target offsets, then refine the best cell.
  for (let step = 0; step <= 9; step += 1) {
    const zoom = 1 - step * 0.05;
    const seed = seat(island, zoom);
    const underFoot = screenToGround(
      { x: viewport.x * 0.62, y: viewport.y * 0.32 }, seed, viewport, base.y,
    );
    const target = {
      x: island.x + base.x / TILE_SCALE - underFoot.x,
      y: island.y + base.z / TILE_SCALE - underFoot.y,
    };
    for (let x = -48; x <= 48; x += 6) {
      for (let y = -48; y <= 48; y += 6) {
        inspect({ x: target.x + x, y: target.y + y }, zoom);
      }
    }
  }
  const coarseTarget = bestTarget;
  const coarseZoom = best.zoom;
  for (let step = -5; step <= 5; step += 1) {
    const zoom = Math.max(GARDEN_REST_ZOOM_FLOOR, Math.min(1, coarseZoom + step * 0.01));
    for (let x = -6; x <= 6; x += 0.5) {
      for (let y = -6; y <= 6; y += 0.5) {
        inspect({ x: coarseTarget.x + x, y: coarseTarget.y + y }, zoom);
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
