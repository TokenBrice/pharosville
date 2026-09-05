import {
  GARDEN_ISLAND_TILE_OFFSET,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
} from "./garden-observatory-slice";
import type { IsoCamera, MapLike, ScreenPoint } from "./projection";
import {
  fitCameraToMap,
  GARDEN_FIT_CAMERA_MIN_ZOOM,
  mapIsoBounds,
  minZoomForViewport,
  TILE_HEIGHT,
  tileToIso,
  TILE_WIDTH,
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

/**
 * Warm-village A1 (2026-09-05): the resting frame is a sailed-in close
 * composition at 1.0, replacing the retired `0.6 * 1.02` plate framing.
 * Standard desktops rest exactly here; compact gates rest slightly lower
 * while seating the landing interval (see `defaultCamera`). Whole-map
 * remains the explicit zoom-out via `minZoomForViewport`.
 */
export const GARDEN_DEFAULT_CAMERA_ZOOM = GARDEN_FIT_CAMERA_MIN_ZOOM;
/** The rest never opens this wide, even where the landing interval cannot seat. */
export const GARDEN_REST_ZOOM_FLOOR = 0.8;
const LANDING_PHAROS_TILE = { x: 60, y: 70 } as const;
const LANDING_ETHEREUM_MOLE_TILE = { x: 15, y: 95 } as const;
/** Sky kept above the Pharos statue tip in the resting frame, in px. */
const LANDING_CROWN_SKY_PX = 48;

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
  const fitted = fitCameraToMap({ ...input, padding });
  const pharosIso = tileToIso(LANDING_PHAROS_TILE);
  const moleIso = tileToIso(LANDING_ETHEREUM_MOLE_TILE);
  // The rendered tower rises from the lighthouse's display anchor, above the
  // flat map bounds `fitCameraToMap` frames. At the 1.0 rest it spans ~half
  // the frame height, so the crown — not the flat-map fit — owns the
  // vertical seat. Iso rise of a world-y unit under the 30-degree pitch.
  const isoYPerWorldUnit = TILE_HEIGHT * (Math.sqrt(3) / 2);
  const towerIsoY = tileToIso({
    x: LANDING_PHAROS_TILE.x
      + GARDEN_ISLAND_TILE_OFFSET.x
      + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x / Math.SQRT2,
    y: LANDING_PHAROS_TILE.y
      + GARDEN_ISLAND_TILE_OFFSET.y
      + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z / Math.SQRT2,
  }).y;
  const crownIsoY = towerIsoY
    - (GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + GARDEN_LIGHTHOUSE_HEIGHT) * isoYPerWorldUnit;
  // Resting rule (warm-village A1): rest at GARDEN_DEFAULT_CAMERA_ZOOM (1.0)
  // wherever the authored landing composition seats, fitting it instead when
  // the viewport is too narrow, and never resting below GARDEN_REST_ZOOM_FLOOR.
  //
  // The composition: the Mole is seated half a tile inside the left water
  // margin, which spans -moleIso.x of iso space to the island centre; the
  // island centre must not spend the 128px right-hand anchorage gutter (the
  // water east of the island stays empty — ma, not missing content). The
  // widest zoom honouring both is (width - gutter - half-tile inset) /
  // mole span, e.g. 0.825 on the 1200px gate; wider viewports get the full
  // 1.0 rest with the interval comfortably inside the gutter. Below the
  // floor the gutter wins and the Mole quay waits off-frame to the west:
  // the lighthouse remains the primary anchor. Viewports so large the plate
  // itself fills the screen keep their fit (up to 1.25) rather than being
  // pulled back to the rest target.
  const landingIntervalZoom = (input.width - padding.right - TILE_WIDTH / 2) / -moleIso.x;
  const zoom = Math.max(
    GARDEN_REST_ZOOM_FLOOR,
    Math.min(fitted.zoom, landingIntervalZoom),
  );
  const pharosScreenX = TILE_WIDTH / 2 + (pharosIso.x - moleIso.x) * zoom;
  const authoredOffsetX = pharosScreenX - pharosIso.x * zoom;
  return clampCameraToMap(
    {
      offsetX: Math.min(authoredOffsetX, input.width - padding.right),
      offsetY: LANDING_CROWN_SKY_PX - crownIsoY * zoom,
      zoom,
    },
    {
      map: input.map,
      viewport: { x: input.width, y: input.height },
    },
  );
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
