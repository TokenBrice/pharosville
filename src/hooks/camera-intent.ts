import { withoutRest, zoomCameraOnGround } from "../systems/camera";
import {
  cameraRestBlend,
  cameraView,
  lerpCameraView,
  worldToScreen,
  worldViewDepth,
  zoomCameraAt,
  type CameraRestState,
  type CameraShotState,
  type CameraView,
  type IsoCamera,
  type MapLike,
  type ScreenPoint,
  type WorldPoint,
} from "../systems/projection";
import type { ShipMotionSample } from "../systems/motion";
import { nearlySameCamera } from "../lib/camera-equality";

export const FOLLOW_CAMERA_DAMPING = 4;
/**
 * W1.7 selection glides (camera-3, ambient-journey-4): time-based quintic
 * smootherstep, not exponential damping, so the view eases into motion as
 * well as out of it. A 120 ms hold lets the click register first; the return
 * walks the same curve 1.25× slower; the panel opens at 70 % of the glide.
 */
export const SELECTION_GLIDE_HOLD_SECONDS = 0.12;
export const SELECTION_RETURN_GLIDE_SCALE = 1.25;
export const SELECTION_PANEL_REVEAL_PROGRESS = 0.7;
/** Lighthouse selection is a slow look-up, not a travel. */
export const LIGHTHOUSE_LOOK_UP_SECONDS = 3;
const SELECTION_GLIDE_MIN_SECONDS = 1.4;
const SELECTION_GLIDE_MAX_SECONDS = 2.4;
/** Screen-space travel at which the glide adds 0.45 s per doubling. */
const SELECTION_GLIDE_PATH_UNIT_PX = 240;
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
/**
 * W1.0 hand-off: the first wheel, drag, pinch or key from rest eases the view
 * from the seat's pitch and eye height into the rig over this long (quintic
 * smootherstep of the linear presence, so it leaves the seat with zero speed).
 */
export const REST_HAND_OFF_SECONDS = 0.6;
/** Reset, a selection return or a tour's end glide back onto the seat over this long. */
export const REST_RETURN_SECONDS = 1.2;

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

/**
 * One wheel step. The water point under the cursor in the view the camera
 * state shows (the rest seat included) stays under the cursor on the rig the
 * step returns; the rest hands off. N1: the zoom floor comes from the viewport,
 * so the wheel can never pull the camera back past the world into empty ocean.
 */
export function zoomCameraByWheelDelta(input: {
  camera: IsoCamera;
  deltaMode: number;
  deltaY: number;
  map?: MapLike;
  point: ScreenPoint;
  viewport: ScreenPoint;
}): IsoCamera {
  const nextZoom = input.camera.zoom * wheelZoomScaleFromDelta(input.deltaY, input.deltaMode, input.viewport.y);
  if (input.map) return zoomCameraOnGround(input.camera, input.point, nextZoom, { map: input.map, viewport: input.viewport });
  return zoomCameraAt(withoutRest(input.camera), input.point, nextZoom);
}

/**
 * The rest presence one frame on: linear toward the target's presence (a
 * missing `rest` is presence 0), over `REST_HAND_OFF_SECONDS` going out and
 * `REST_RETURN_SECONDS` coming back. The view keeps the rest pose it is
 * leaving or the one it is returning to. `undefined` once fully on the rig.
 */
export function stepRestPresence(
  current: IsoCamera,
  target: IsoCamera,
  deltaSeconds: number,
): CameraRestState | undefined {
  const view = target.rest?.view ?? current.rest?.view;
  const from = current.rest?.presence ?? 0;
  const to = target.rest?.presence ?? 0;
  if (!view) return undefined;
  const dt = Math.max(0, deltaSeconds);
  const presence = to >= from
    ? Math.min(to, from + dt / REST_RETURN_SECONDS)
    : Math.max(to, from - dt / REST_HAND_OFF_SECONDS);
  if (presence <= 0) return undefined;
  if (target.rest && presence === to) return target.rest;
  return { presence, view };
}

/** Eye and look-at within this many world units: a damped shot view has arrived. */
const SHOT_VIEW_ARRIVAL_EPSILON = 1e-3;

/**
 * The composed shot one frame on (W1.7). Presence moves like the rest's (in at
 * `REST_RETURN_SECONDS`, out at `REST_HAND_OFF_SECONDS`), so a gesture hands
 * off from a selection shot the way it hands off from the seat; when both ends
 * carry a shot (follow mode) the view damps with the rig by `alpha`.
 */
export function stepShotState(
  current: IsoCamera,
  target: IsoCamera,
  deltaSeconds: number,
  alpha: number,
): CameraShotState | undefined {
  const from = current.shot;
  const to = target.shot;
  if (!from && !to) return undefined;
  const dt = Math.max(0, deltaSeconds);
  const fromPresence = from?.presence ?? 0;
  const toPresence = to?.presence ?? 0;
  const presence = toPresence >= fromPresence
    ? Math.min(toPresence, fromPresence + dt / REST_RETURN_SECONDS)
    : Math.max(toPresence, fromPresence - dt / REST_HAND_OFF_SECONDS);
  if (presence <= 0) return undefined;
  let view = to?.view ?? from!.view;
  if (from && to && from.view !== to.view) {
    const damped = lerpCameraView(from.view, to.view, alpha);
    const arrived = Math.hypot(damped.eye.x - to.view.eye.x, damped.eye.y - to.view.eye.y, damped.eye.z - to.view.eye.z) < SHOT_VIEW_ARRIVAL_EPSILON
      && Math.hypot(damped.target.x - to.view.target.x, damped.target.y - to.view.target.y, damped.target.z - to.view.target.z) < SHOT_VIEW_ARRIVAL_EPSILON;
    view = arrived ? to.view : damped;
  }
  if (to && presence === toPresence && view === to.view) return to;
  const subject = to?.subject ?? from?.subject;
  return subject ? { presence, subject, view } : { presence, view };
}

export function advanceCameraIntent(
  current: IsoCamera,
  target: IsoCamera,
  deltaSeconds: number,
  mode: CameraIntentMode = "toolbar",
): { camera: IsoCamera; settled: boolean } {
  if (nearlySameCamera(current, target)) return { camera: target, settled: true };
  const damping = cameraDampingForMode(mode);
  const rig = dampFollowCamera(current, target, deltaSeconds, damping);
  const rest = stepRestPresence(current, target, deltaSeconds);
  const alpha = deltaSeconds > 0 ? 1 - Math.exp(-damping * deltaSeconds) : 0;
  const shot = stepShotState(current, target, deltaSeconds, alpha);
  const next: IsoCamera = { offsetX: rig.offsetX, offsetY: rig.offsetY, zoom: rig.zoom };
  if (rest) next.rest = rest;
  if (shot) next.shot = shot;
  if (nearlySameCamera(next, target)) return { camera: target, settled: true };
  return { camera: next, settled: false };
}

/** W1.7 glide length for a screen-space travel of `pathPixels` (camera-3: 1.4–2.4 s). */
export function selectionGlideSeconds(pathPixels: number): number {
  const seconds = 1.1 + 0.45 * Math.log2(1 + Math.max(0, pathPixels) / SELECTION_GLIDE_PATH_UNIT_PX);
  return Math.min(SELECTION_GLIDE_MAX_SECONDS, Math.max(SELECTION_GLIDE_MIN_SECONDS, seconds));
}

/**
 * Screen travel of a glide between two views, in pixels: how far each view's
 * look-at point lands from the other view's frame centre (a point behind the
 * other eye counts a full diagonal), plus the stand-off change in half-frame
 * heights per doubling.
 */
export function glidePathPixels(from: Readonly<CameraView>, to: Readonly<CameraView>, viewport: ScreenPoint): number {
  const diagonal = Math.hypot(viewport.x, viewport.y);
  const offCentre = (view: Readonly<CameraView>, point: WorldPoint) => {
    const camera: IsoCamera = { offsetX: 0, offsetY: 0, zoom: 1, shot: { presence: 1, view } };
    if (worldViewDepth(point, camera, viewport) <= 1) return diagonal;
    const screen = worldToScreen(point, camera, viewport);
    return Math.min(diagonal, Math.hypot(screen.x - viewport.x / 2, screen.y - viewport.y / 2));
  };
  const standOff = (view: Readonly<CameraView>) => Math.hypot(
    view.eye.x - view.target.x,
    view.eye.y - view.target.y,
    view.eye.z - view.target.z,
  );
  const dolly = Math.abs(Math.log2(Math.max(1e-6, standOff(from)) / Math.max(1e-6, standOff(to)))) * viewport.y / 2;
  return Math.max(offCentre(from, to.target), offCentre(to, from.target)) + dolly;
}

/** A composed glide from the shown view onto a target camera state (W1.7). */
export interface ShotGlide {
  /** The shown, unbreathed view the glide leaves. */
  from: Readonly<CameraView>;
  to: IsoCamera;
  /** The target's shown, unbreathed view. */
  toView: Readonly<CameraView>;
  holdSeconds: number;
  durationSeconds: number;
  /**
   * The rest the seat's threshold reads while the eye travels: its presence
   * runs from the start's to the target's, and its eye rides the travelling
   * eye by an offset easing from the start's to the target's, so the
   * threshold stays put in the world as the eye leaves or reaches the seat.
   */
  restPresence: readonly [number, number];
  restEyeOffset: readonly [WorldPoint, WorldPoint];
  /**
   * X6: how far the eye (and its look-at) rises at mid-glide, world units, so
   * a long travel between postcards clears the island and rim rather than
   * cutting through them. 0 for the short selection glides.
   */
  arcHeight: number;
}

function restEyeOffset(camera: IsoCamera, shownEye: WorldPoint): WorldPoint | null {
  const rest = camera.rest;
  if (!rest || rest.presence <= 0) return null;
  return { x: shownEye.x - rest.view.eye.x, y: shownEye.y - rest.view.eye.y, z: shownEye.z - rest.view.eye.z };
}

export function createShotGlide(input: {
  from: IsoCamera;
  to: IsoCamera;
  viewport: ScreenPoint;
  durationSeconds: number;
  holdSeconds?: number;
  arcHeight?: number;
}): ShotGlide {
  const from = cameraView(input.from, input.viewport, { breath: false });
  const toView = cameraView(input.to, input.viewport, { breath: false });
  const zero = { x: 0, y: 0, z: 0 };
  const fromOffset = restEyeOffset(input.from, from.eye);
  const toOffset = restEyeOffset(input.to, toView.eye);
  return {
    from,
    to: input.to,
    toView,
    holdSeconds: input.holdSeconds ?? SELECTION_GLIDE_HOLD_SECONDS,
    durationSeconds: Math.max(1e-3, input.durationSeconds),
    restPresence: [input.from.rest?.presence ?? 0, input.to.rest?.presence ?? 0],
    restEyeOffset: [fromOffset ?? toOffset ?? zero, toOffset ?? fromOffset ?? zero],
    arcHeight: Math.max(0, input.arcHeight ?? 0),
  };
}

/**
 * The glide at `elapsedSeconds` (hold included): the target's rig under a
 * shot that walks the straight blend of the two views on a quintic
 * smootherstep clock, so it leaves and lands with zero speed and acceleration.
 * `progress` is the linear time share (the panel reveal keys on it); at
 * `done` the camera is the target itself.
 */
export function sampleShotGlide(glide: ShotGlide, elapsedSeconds: number): { camera: IsoCamera; progress: number; done: boolean } {
  const progress = Math.min(1, Math.max(0, (elapsedSeconds - glide.holdSeconds) / glide.durationSeconds));
  if (progress >= 1) return { camera: glide.to, progress, done: true };
  const eased = cameraRestBlend(progress);
  const view = lerpCameraView(glide.from, glide.toView, eased);
  if (glide.arcHeight > 0) {
    const lift = glide.arcHeight * 4 * eased * (1 - eased);
    view.eye.y += lift;
    view.target.y += lift;
  }
  const camera: IsoCamera = {
    offsetX: glide.to.offsetX,
    offsetY: glide.to.offsetY,
    zoom: glide.to.zoom,
    shot: { presence: 1, view },
  };
  const presence = glide.restPresence[0] + (glide.restPresence[1] - glide.restPresence[0]) * eased;
  if (presence > 0) {
    const [start, end] = glide.restEyeOffset;
    camera.rest = {
      presence,
      view: {
        eye: {
          x: view.eye.x - (start.x + (end.x - start.x) * eased),
          y: view.eye.y - (start.y + (end.y - start.y) * eased),
          z: view.eye.z - (start.z + (end.z - start.z) * eased),
        },
        target: view.target,
        vFovDeg: view.vFovDeg,
      },
    };
  }
  return { camera, progress, done: false };
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
  if (mode === "follow-selected") return FOLLOW_CAMERA_DAMPING;
  if (mode === "resize") return CAMERA_RESIZE_DAMPING;
  if (mode === "drag" || mode === "wheel" || mode === "pinch" || mode === "keyboard") {
    return CAMERA_INTERACTION_DAMPING;
  }
  return CAMERA_COMMAND_DAMPING;
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
