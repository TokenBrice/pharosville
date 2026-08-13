import { clampCameraToMap, followTile } from "../systems/camera";
import {
  MAX_ZOOM,
  minZoomForViewport,
  zoomCameraAt,
  type IsoCamera,
  type MapLike,
  type ScreenPoint,
} from "../systems/projection";
import type { ShipMotionSample } from "../systems/motion";
import { nearlySameCamera } from "../lib/camera-equality";

export const FOLLOW_CAMERA_DAMPING = 4;
/** W4.6: a selection dolly resolves in roughly two seconds at normal distances. */
export const SELECTION_CAMERA_DAMPING = 5;
/** The return is deliberately a shade gentler than the inward dolly. */
export const SELECTION_RETURN_CAMERA_DAMPING = 4;
export const SELECTION_CAMERA_ZOOM = 1.2;
export const FOLLOW_LEAD_SECONDS = 0.45;
export const FOLLOW_MAX_DELTA_SECONDS = 0.25;
export const FOLLOW_INITIAL_DELTA_SECONDS = 1 / 60;
const CAMERA_INTERACTION_DAMPING = 26;
const CAMERA_COMMAND_DAMPING = 12;
const CAMERA_RESIZE_DAMPING = 18;
const WHEEL_DELTA_LINE_HEIGHT_PX = 16;
const WHEEL_DELTA_DEFAULT_PAGE_PX = 800;
const WHEEL_DELTA_CLAMP_PX = 240;
const WHEEL_ZOOM_EXPONENT_PER_PIXEL = 0.00145;

export type CameraIntentMode =
  | "idle"
  | "drag"
  | "wheel"
  | "pinch"
  | "keyboard"
  | "toolbar"
  | "reset"
  | "follow-selected"
  | "selection"
  | "selection-return"
  | "resize"
  | "external";

export interface CameraIntentState {
  lastFrameTime: number | null;
  mode: CameraIntentMode;
  targetCamera: IsoCamera | null;
}

export function normalizeWheelDeltaY(deltaY: number, deltaMode: number, pageSize = WHEEL_DELTA_DEFAULT_PAGE_PX): number {
  const pixelDelta = deltaMode === 1
    ? deltaY * WHEEL_DELTA_LINE_HEIGHT_PX
    : deltaMode === 2
      ? deltaY * Math.max(1, pageSize)
      : deltaY;
  if (!Number.isFinite(pixelDelta)) return 0;
  return Math.max(-WHEEL_DELTA_CLAMP_PX, Math.min(WHEEL_DELTA_CLAMP_PX, pixelDelta));
}

export function wheelZoomScaleFromDelta(deltaY: number, deltaMode: number, pageSize = WHEEL_DELTA_DEFAULT_PAGE_PX): number {
  return Math.exp(-normalizeWheelDeltaY(deltaY, deltaMode, pageSize) * WHEEL_ZOOM_EXPONENT_PER_PIXEL);
}

export function zoomCameraByWheelDelta(input: {
  camera: IsoCamera;
  deltaMode: number;
  deltaY: number;
  map?: MapLike;
  point: ScreenPoint;
  viewport: ScreenPoint;
}): IsoCamera {
  // N1: the zoom floor comes from the viewport, so the wheel can never pull
  // the camera back past the world into empty ocean.
  const next = zoomCameraAt(
    input.camera,
    input.point,
    input.camera.zoom * wheelZoomScaleFromDelta(input.deltaY, input.deltaMode, input.viewport.y),
    input.map ? minZoomForViewport(input.viewport, input.map) : undefined,
  );
  return input.map ? clampCameraToMap(next, { map: input.map, viewport: input.viewport }) : next;
}

export function advanceCameraIntent(
  current: IsoCamera,
  target: IsoCamera,
  deltaSeconds: number,
  mode: CameraIntentMode = "toolbar",
): { camera: IsoCamera; settled: boolean } {
  if (nearlySameCamera(current, target)) return { camera: target, settled: true };
  const next = dampFollowCamera(current, target, deltaSeconds, cameraDampingForMode(mode));
  if (nearlySameCamera(next, target)) return { camera: target, settled: true };
  return { camera: next, settled: false };
}

export function cameraModeCancelsFollow(mode: CameraIntentMode): boolean {
  return mode === "drag"
    || mode === "wheel"
    || mode === "pinch"
    || mode === "keyboard"
    || mode === "toolbar"
    || mode === "reset"
    || mode === "external";
}

function cameraDampingForMode(mode: CameraIntentMode): number {
  if (mode === "selection") return SELECTION_CAMERA_DAMPING;
  if (mode === "selection-return") return SELECTION_RETURN_CAMERA_DAMPING;
  if (mode === "follow-selected") return FOLLOW_CAMERA_DAMPING;
  if (mode === "resize") return CAMERA_RESIZE_DAMPING;
  if (mode === "drag" || mode === "wheel" || mode === "pinch" || mode === "keyboard") {
    return CAMERA_INTERACTION_DAMPING;
  }
  return CAMERA_COMMAND_DAMPING;
}

/**
 * W4.6 selection framing: centre the ship and make one restrained dolly step.
 * Never zoom back from a closer visitor-authored view, and keep the ordinary
 * map clamp so edge anchorages retain their surrounding water.
 */
export function selectionCameraTarget(input: {
  camera: IsoCamera;
  map: MapLike;
  tile: ScreenPoint;
  viewport: ScreenPoint;
}): IsoCamera {
  const zoom = Math.min(MAX_ZOOM, Math.max(input.camera.zoom, SELECTION_CAMERA_ZOOM));
  return followTile({
    camera: { ...input.camera, zoom },
    map: input.map,
    tile: input.tile,
    viewport: input.viewport,
  });
}

export function leadFollowTile(
  currentTile: ScreenPoint,
  previousTile: ScreenPoint | null,
  deltaSeconds: number,
  leadSeconds = FOLLOW_LEAD_SECONDS,
  sample?: Pick<ShipMotionSample, "speedTilesPerSecond" | "velocity"> | null,
): ScreenPoint {
  const velocity = sample?.velocity;
  if (
    velocity
    && leadSeconds > 0
    && Number.isFinite(velocity.x)
    && Number.isFinite(velocity.y)
    && (sample.speedTilesPerSecond ?? Math.hypot(velocity.x, velocity.y)) > 0
  ) {
    return {
      x: currentTile.x + velocity.x * leadSeconds,
      y: currentTile.y + velocity.y * leadSeconds,
    };
  }
  if (!previousTile || deltaSeconds <= 0 || leadSeconds <= 0) return currentTile;
  const velocityX = (currentTile.x - previousTile.x) / deltaSeconds;
  const velocityY = (currentTile.y - previousTile.y) / deltaSeconds;
  if (!Number.isFinite(velocityX) || !Number.isFinite(velocityY)) return currentTile;
  return {
    x: currentTile.x + velocityX * leadSeconds,
    y: currentTile.y + velocityY * leadSeconds,
  };
}

export function dampFollowCamera(
  current: IsoCamera,
  target: IsoCamera,
  deltaSeconds: number,
  damping = FOLLOW_CAMERA_DAMPING,
): IsoCamera {
  if (deltaSeconds <= 0 || damping <= 0) return current;
  const alpha = 1 - Math.exp(-damping * deltaSeconds);
  return {
    offsetX: current.offsetX + (target.offsetX - current.offsetX) * alpha,
    offsetY: current.offsetY + (target.offsetY - current.offsetY) * alpha,
    zoom: current.zoom + (target.zoom - current.zoom) * alpha,
  };
}
