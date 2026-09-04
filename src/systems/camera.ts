import type { IsoCamera, MapLike, ScreenPoint } from "./projection";
import {
  fitCameraToMap,
  GARDEN_FIT_CAMERA_MIN_ZOOM,
  mapIsoBounds,
  minZoomForViewport,
  tileToIso,
  TILE_WIDTH,
  zoomCameraAt,
} from "./projection";
import { MIN_LONG_SIDE_PX, MIN_SHORT_SIDE_PX } from "./viewport-gate";

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

export const GARDEN_DEFAULT_CAMERA_TIGHTEN = 1.02;
export const GARDEN_DEFAULT_CAMERA_ZOOM = GARDEN_FIT_CAMERA_MIN_ZOOM
  * GARDEN_DEFAULT_CAMERA_TIGHTEN;
const LANDING_PHAROS_TILE = { x: 60, y: 70 } as const;
const LANDING_ETHEREUM_MOLE_TILE = { x: 15, y: 95 } as const;

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
}): IsoCamera {
  const padding = cameraPadding();
  const fitted = fitCameraToMap({
    ...input,
    padding,
  });
  // Standard desktops tighten the authored 0.60 plate composition by 2%. Compact-height laptop
  // windows use the actual fit so the lighthouse crown stays visible; once
  // the short side reaches the standard 720px floor, extra room on either side
  // restores the standard composition monotonically.
  const shortSide = Math.min(input.width, input.height);
  const shortSideProgress = Math.max(
    0,
    Math.min(1, (shortSide - MIN_SHORT_SIDE_PX) / 280),
  );
  const longSideProgress = Math.max(
    0,
    Math.min(1, (Math.max(input.width, input.height) - MIN_LONG_SIDE_PX) / 100),
  );
  const compositionProgress = shortSide < MIN_SHORT_SIDE_PX
    ? 0
    : Math.max(shortSideProgress, longSideProgress);
  const tightenFactor = 1 + compositionProgress * (GARDEN_DEFAULT_CAMERA_TIGHTEN - 1);
  const tightened = zoomCameraAt(
    fitted,
    { x: input.width * 0.54, y: input.height * 0.5 },
    Math.max(
      minZoomForViewport({ x: input.width, y: input.height }, input.map),
      fitted.zoom * tightenFactor,
    ),
  );
  const pharosIso = tileToIso(LANDING_PHAROS_TILE);
  const moleIso = tileToIso(LANDING_ETHEREUM_MOLE_TILE);
  // Seat the Mole one half-tile inside the left water margin, then preserve
  // the authored (15,95) -> (60,70) isometric interval to the Pharos. At the
  // 900px floor the plate's existing right gutter wins if that interval would
  // consume it: the lighthouse remains the primary anchor and the water to its
  // right stays empty anchorage — ma, not missing content.
  const pharosScreenX = TILE_WIDTH / 2
    + (pharosIso.x - moleIso.x) * tightened.zoom;
  const authoredOffsetX = pharosScreenX - pharosIso.x * tightened.zoom;
  const framed = {
    ...tightened,
    offsetX: Math.min(authoredOffsetX, input.width - padding.right),
    // The lighthouse rises beyond the flat map bounds used by fitCameraToMap.
    // Give that vertical geometry explicit headroom at the short-side floor.
    offsetY: tightened.offsetY
      + compositionProgress * input.height * 0.055
      + (1 - shortSideProgress) * 32,
  };
  return clampCameraToMap(framed, {
    map: input.map,
    viewport: { x: input.width, y: input.height },
  });
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
