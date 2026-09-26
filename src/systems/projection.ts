import { REST_SEAT_YAW_RAD } from "./rest-seat";

export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;
export const TILE_SCALE = Math.SQRT2;
export const CAMERA_FOV_DEG = 32;
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 600;

/**
 * W1.0 pose model. The thing the renderer, picking and every DOM anchor use is
 * a `CameraView` — an eye, a look-at target and a vertical FOV — not a zoom.
 * Two sources produce one:
 *
 * - the **interactive rig** (`IsoCamera` offsets + zoom, pan/zoom/clamp in
 *   iso pose space, `cameraPoseFromIso`), and
 * - the **rest ShotSpec** (`camera.ts` `solveRestShot`, seat C in
 *   `rest-seat.ts`), carried on the camera state as `IsoCamera.rest`.
 *
 * `cameraView` blends the two by the rest presence (1 = at rest, easing to 0
 * over the hand-off when the visitor first wheels or drags) and applies the
 * K16 breath on top, so hit rects, DOM anchors and picking rays built from
 * `worldToScreen` / `screenToGroundRay` land exactly where the eye saw the
 * world. Nothing here is module state: the view is a pure function of the
 * camera state and the viewport.
 *
 * The rig's pose shape is keyed to a **reference zoom**: the zoom that would
 * put the eye the same distance from its target on a 1000 px tall viewport.
 * The same physical stand-off therefore gets the same pitch, look-at height and
 * yaw at every viewport (engineering council finding 1: at 1200×640 the seat's
 * distance used to read as zoom 0.45 — a 12° top-down pitch). Standing close
 * (reference zoom ≥ 0.9; the rest hand-off rig sits at ≈ 1.48) the rig looks
 * 4° down along the rest yaw with the look-at point on the tower's lower
 * third; pulled back to the whole-map (reference zoom ≤ 0.44 at every gate
 * profile, below 0.45) it looks 12° down at the ground along the iso 45°
 * diagonal, exactly as before.
 */
export const CAMERA_REFERENCE_VIEWPORT_HEIGHT = 1000;
export const CAMERA_PITCH_FAR_RAD = 12 * Math.PI / 180;
export const CAMERA_PITCH_NEAR_RAD = 4 * Math.PI / 180;
/** Reference zoom at and below which the rig holds its whole-map pose. */
export const CAMERA_PITCH_FAR_ZOOM = 0.45;
/** Reference zoom at and above which the rig holds its near (rest-seat) pose. */
export const CAMERA_PITCH_NEAR_ZOOM = 0.9;
/** The whole-map pull-out yaw: the iso diagonal the pan/clamp maths is written for. */
export const CAMERA_YAW = Math.PI / 4;
/** The near rig shares the rest seat's yaw, so the hand-off never swings the world. */
export const CAMERA_NEAR_YAW = REST_SEAT_YAW_RAD;
export const CAMERA_TARGET_HEIGHT_NEAR = 14;

const CAMERA_TAN_HALF_FOV = Math.tan(CAMERA_FOV_DEG * Math.PI / 360);

/** Eye-to-target distance a zoom-1 rig keeps on the reference viewport (≈ 108.98 u). */
export const CAMERA_REFERENCE_DISTANCE = cameraDistanceForZoom(CAMERA_REFERENCE_VIEWPORT_HEIGHT, 1);

/** Rig zoom → reference zoom: the same stand-off expressed on the 1000 px reference viewport. */
export function cameraReferenceZoom(viewportHeight: number, zoom: number): number {
  return zoom * CAMERA_REFERENCE_VIEWPORT_HEIGHT / Math.max(1, viewportHeight);
}

function nearPoseWeight(referenceZoom: number): number {
  return Math.min(1, Math.max(0, (referenceZoom - CAMERA_PITCH_FAR_ZOOM) / (CAMERA_PITCH_NEAR_ZOOM - CAMERA_PITCH_FAR_ZOOM)));
}

/** Rig pitch for a reference zoom (`cameraReferenceZoom`). */
export function cameraPitchForZoom(referenceZoom: number): number {
  return CAMERA_PITCH_FAR_RAD + (CAMERA_PITCH_NEAR_RAD - CAMERA_PITCH_FAR_RAD) * nearPoseWeight(referenceZoom);
}

/** Rig yaw for a reference zoom: the iso diagonal far out, the rest yaw near. */
export function cameraYawForZoom(referenceZoom: number): number {
  return CAMERA_YAW + (CAMERA_NEAR_YAW - CAMERA_YAW) * nearPoseWeight(referenceZoom);
}

/**
 * The look-at point rises as the viewer approaches: at the whole-map pull-out
 * the rig looks at the ground; near the garden shore it looks at the tower's
 * lower third, which is how a standing viewer keeps a 40 u crown in a 32°
 * frame without craning. Eye height = targetHeight + distance·sin(pitch).
 */
export function cameraTargetHeightForZoom(referenceZoom: number): number {
  return CAMERA_TARGET_HEIGHT_NEAR * nearPoseWeight(referenceZoom);
}

/**
 * K16 camera breath: additive orbit angles and a multiplicative dolly about
 * the view's target. The render loop puts the breath it draws on the frame's
 * camera state (`IsoCamera.breath`); everything projected with that camera —
 * the renderer's eye, hit rects, DOM anchors — sees the same breathed pose.
 */
export interface CameraBreath {
  /** Multiplicative eye-to-target distance scale. */
  dolly: number;
  /** Additive vertical angle in radians. */
  pitch: number;
  /** Additive orbit angle in radians. */
  yaw: number;
}

export const CAMERA_BREATH_IDENTITY: Readonly<CameraBreath> = Object.freeze({ dolly: 1, pitch: 0, yaw: 0 });

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TilePoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/** A free perspective pose: what the eye actually sees. */
export interface CameraView {
  eye: WorldPoint;
  /** Look-at point; also the breath orbit pivot and the sky/wake anchor. */
  target: WorldPoint;
  vFovDeg: number;
}

/** The authored rest pose a camera state blends toward (W1.0). */
export interface CameraRestState {
  /** The rest ShotSpec view for the viewport it was solved at (`solveRestShot`). */
  view: Readonly<CameraView>;
  /**
   * Linear hand-off progress: 1 at rest, 0 on the rig. The view blends by its
   * smootherstep, so both ends of the ease leave and arrive with zero velocity.
   */
  presence: number;
}

/**
 * The camera state. Offsets + zoom are the interactive rig (pose-space pan,
 * zoom and clamp, and the URL `cam` contract); `rest` blends the authored rest
 * pose over it; `breath` is set only on the render loop's per-frame copy.
 */
export interface IsoCamera {
  offsetX: number;
  offsetY: number;
  zoom: number;
  rest?: CameraRestState | undefined;
  breath?: Readonly<CameraBreath> | undefined;
}

export interface CameraPose {
  targetTile: TilePoint;
  /** Height of the look-at point above the tile plane, world units. */
  targetHeight: number;
  /** Eye-to-target distance preserving the pose-space zoom's target-plane view height. */
  distance: number;
  yaw: number;
  pitch: number;
}

export function cameraDistanceForZoom(viewportHeight: number, zoom: number): number {
  return viewportHeight / (TILE_HEIGHT * zoom * 2 * CAMERA_TAN_HALF_FOV);
}

export function cameraEye(pose: CameraPose): WorldPoint {
  const horizontalDistance = pose.distance * Math.cos(pose.pitch);
  return {
    x: pose.targetTile.x * TILE_SCALE + horizontalDistance * Math.sin(pose.yaw),
    y: pose.targetHeight + pose.distance * Math.sin(pose.pitch),
    z: pose.targetTile.y * TILE_SCALE + horizontalDistance * Math.cos(pose.yaw),
  };
}

/** The rig's own pose (offsets + zoom only; ignores `rest` and `breath`). */
export function cameraPoseFromIso(camera: IsoCamera, viewport: ScreenPoint): CameraPose {
  const referenceZoom = cameraReferenceZoom(viewport.y, camera.zoom);
  return {
    targetTile: screenToTile({ x: viewport.x / 2, y: viewport.y / 2 }, camera),
    targetHeight: cameraTargetHeightForZoom(referenceZoom),
    distance: cameraDistanceForZoom(viewport.y, camera.zoom),
    yaw: cameraYawForZoom(referenceZoom),
    pitch: cameraPitchForZoom(referenceZoom),
  };
}

/** Inverts a rig pose; pitch and yaw are recomputed from zoom by `cameraPoseFromIso`. */
export function isoFromCameraPose(pose: CameraPose, viewport: ScreenPoint): IsoCamera {
  const zoom = cameraDistanceForZoom(viewport.y, 1) / pose.distance;
  const target = tileToIso(pose.targetTile);
  return {
    offsetX: viewport.x / 2 - target.x * zoom,
    offsetY: viewport.y / 2 - target.y * zoom,
    zoom,
  };
}

/** A rig pose as a free view. */
export function cameraViewFromPose(pose: CameraPose): CameraView {
  return {
    eye: cameraEye(pose),
    target: { x: pose.targetTile.x * TILE_SCALE, y: pose.targetHeight, z: pose.targetTile.y * TILE_SCALE },
    vFovDeg: CAMERA_FOV_DEG,
  };
}

/** A free view from an eye and look angles (the ShotSpec form); `distance` places the target. */
export function cameraViewFromAngles(eye: WorldPoint, yaw: number, pitch: number, distance: number, vFovDeg: number): CameraView {
  const horizontal = distance * Math.cos(pitch);
  return {
    eye: { x: eye.x, y: eye.y, z: eye.z },
    target: {
      x: eye.x - horizontal * Math.sin(yaw),
      y: eye.y - distance * Math.sin(pitch),
      z: eye.z - horizontal * Math.cos(yaw),
    },
    vFovDeg,
  };
}

/** Yaw (about +y, eye = target + h·(sin yaw, cos yaw)), down-pitch and eye-to-target distance of a view. */
export function cameraViewAngles(view: CameraView): { distance: number; pitch: number; yaw: number } {
  const dx = view.eye.x - view.target.x;
  const dy = view.eye.y - view.target.y;
  const dz = view.eye.z - view.target.z;
  const horizontal = Math.hypot(dx, dz);
  return {
    distance: Math.hypot(horizontal, dy),
    pitch: Math.atan2(dy, horizontal),
    yaw: Math.atan2(dx, dz),
  };
}

/** Quintic smootherstep: the rest hand-off leaves and arrives with zero velocity and acceleration. */
export function cameraRestBlend(presence: number): number {
  const t = Math.min(1, Math.max(0, presence));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerpPoint(from: WorldPoint, to: WorldPoint, t: number): WorldPoint {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

/** The unbreathed view: the rig, the rest ShotSpec, or the hand-off blend between them. */
function cameraBaseView(camera: IsoCamera, viewport: ScreenPoint): CameraView {
  const rig = cameraViewFromPose(cameraPoseFromIso(camera, viewport));
  const rest = camera.rest;
  if (!rest) return rig;
  const t = cameraRestBlend(rest.presence);
  if (t <= 0) return rig;
  if (t >= 1) return { eye: { ...rest.view.eye }, target: { ...rest.view.target }, vFovDeg: rest.view.vFovDeg };
  return {
    eye: lerpPoint(rig.eye, rest.view.eye, t),
    target: lerpPoint(rig.target, rest.view.target, t),
    vFovDeg: rig.vFovDeg + (rest.view.vFovDeg - rig.vFovDeg) * t,
  };
}

/**
 * The view a camera state shows: the rig/rest blend with the breath orbit
 * applied about the target. Pass `{ breath: false }` for the pose-physical
 * detail measures, which must not flicker with the breath.
 */
export function cameraView(camera: IsoCamera, viewport: ScreenPoint, options?: { breath?: boolean }): CameraView {
  const view = cameraBaseView(camera, viewport);
  const breath = options?.breath === false ? undefined : camera.breath;
  if (!breath || (breath.dolly === 1 && breath.pitch === 0 && breath.yaw === 0)) return view;
  const angles = cameraViewAngles(view);
  const yaw = angles.yaw + breath.yaw;
  const pitch = angles.pitch + breath.pitch;
  const distance = angles.distance * breath.dolly;
  const horizontal = distance * Math.cos(pitch);
  view.eye = {
    x: view.target.x + horizontal * Math.sin(yaw),
    y: view.target.y + distance * Math.sin(pitch),
    z: view.target.z + horizontal * Math.cos(yaw),
  };
  return view;
}

/**
 * The pose-physical detail measure (W1.0): the reference zoom of the view's
 * eye-to-target stand-off, unbreathed. On the rig this is
 * `cameraReferenceZoom(viewport.y, zoom)`; at rest the ShotSpec's target sits at
 * its hand-off rig's stand-off, so the rest reads the same as that rig (≈ 1.48)
 * at every viewport.
 */
export function cameraDetailZoom(camera: IsoCamera, viewport: ScreenPoint): number {
  const view = cameraBaseView(camera, viewport);
  const distance = Math.hypot(view.eye.x - view.target.x, view.eye.y - view.target.y, view.eye.z - view.target.z);
  return CAMERA_REFERENCE_DISTANCE / Math.max(1e-6, distance);
}

/**
 * Screen-scale companion of `cameraDetailZoom`: how many pixels an iso unit at
 * the target covers on THIS viewport. Equals `camera.zoom` on the rig. Pixel
 * properties (sub-pixel cloth weave, the sea-sign chart rung) key on this.
 */
export function cameraPixelZoom(camera: IsoCamera, viewport: ScreenPoint): number {
  return cameraDetailZoom(camera, viewport) * Math.max(1, viewport.y) / CAMERA_REFERENCE_VIEWPORT_HEIGHT;
}

/** True while any of the rest ShotSpec shows (at rest or mid hand-off). */
export function cameraAtRest(camera: IsoCamera | null | undefined): boolean {
  return (camera?.rest?.presence ?? 0) > 0;
}

interface CameraBasis {
  right: WorldPoint;
  up: WorldPoint;
  back: WorldPoint;
}

function cameraBasis(pitch: number, yaw: number): CameraBasis {
  return {
    right: { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) },
    up: { x: -Math.sin(pitch) * Math.sin(yaw), y: Math.cos(pitch), z: -Math.sin(pitch) * Math.cos(yaw) },
    back: { x: Math.cos(pitch) * Math.sin(yaw), y: Math.sin(pitch), z: Math.cos(pitch) * Math.cos(yaw) },
  };
}

// One-entry memo: hit-testing projects hundreds of points per frame through
// the same camera state. Keyed on values (callers may mutate a camera object
// between calls), never on identity alone.
const matrixMemo = {
  offsetX: Number.NaN,
  offsetY: Number.NaN,
  zoom: Number.NaN,
  rest: undefined as CameraRestState | undefined,
  presence: Number.NaN,
  breath: undefined as Readonly<CameraBreath> | undefined,
  breathDolly: Number.NaN,
  breathPitch: Number.NaN,
  breathYaw: Number.NaN,
  viewportX: Number.NaN,
  viewportY: Number.NaN,
  matrix: [] as number[],
};

// Row-major perspective projection * view matrix (OpenGL depth convention).
function perspectiveMatrix(camera: IsoCamera, viewport: ScreenPoint): readonly number[] {
  const memo = matrixMemo;
  const breath = camera.breath;
  if (
    memo.offsetX === camera.offsetX && memo.offsetY === camera.offsetY && memo.zoom === camera.zoom
    && memo.rest === camera.rest && memo.presence === (camera.rest?.presence ?? 0)
    && memo.breath === breath
    && memo.breathDolly === (breath?.dolly ?? 1) && memo.breathPitch === (breath?.pitch ?? 0) && memo.breathYaw === (breath?.yaw ?? 0)
    && memo.viewportX === viewport.x && memo.viewportY === viewport.y
  ) return memo.matrix;
  const view = cameraView(camera, viewport);
  const { pitch, yaw } = cameraViewAngles(view);
  const eye = view.eye;
  const { right, up, back } = cameraBasis(pitch, yaw);
  const tanHalfFov = Math.tan(view.vFovDeg * Math.PI / 360);
  const sx = viewport.y / (viewport.x * tanHalfFov);
  const sy = 1 / tanHalfFov;
  const sz = -(CAMERA_FAR + CAMERA_NEAR) / (CAMERA_FAR - CAMERA_NEAR);
  const tz = -2 * CAMERA_FAR * CAMERA_NEAR / (CAMERA_FAR - CAMERA_NEAR);
  const rightEye = right.x * eye.x + right.z * eye.z;
  const upEye = up.x * eye.x + up.y * eye.y + up.z * eye.z;
  const backEye = back.x * eye.x + back.y * eye.y + back.z * eye.z;
  const matrix = [
    sx * right.x, 0, sx * right.z, -sx * rightEye,
    sy * up.x, sy * up.y, sy * up.z, -sy * upEye,
    sz * back.x, sz * back.y, sz * back.z, tz - sz * backEye,
    -back.x, -back.y, -back.z, backEye,
  ];
  memo.offsetX = camera.offsetX;
  memo.offsetY = camera.offsetY;
  memo.zoom = camera.zoom;
  memo.rest = camera.rest;
  memo.presence = camera.rest?.presence ?? 0;
  memo.breath = breath;
  memo.breathDolly = breath?.dolly ?? 1;
  memo.breathPitch = breath?.pitch ?? 0;
  memo.breathYaw = breath?.yaw ?? 0;
  memo.viewportX = viewport.x;
  memo.viewportY = viewport.y;
  memo.matrix = matrix;
  return matrix;
}

export function worldToScreen(world: WorldPoint, camera: IsoCamera, viewport: ScreenPoint): ScreenPoint {
  const matrix = perspectiveMatrix(camera, viewport);
  const w = Math.max(1e-9, matrix[12] * world.x + matrix[13] * world.y + matrix[14] * world.z + matrix[15]);
  const ndcX = (matrix[0] * world.x + matrix[1] * world.y + matrix[2] * world.z + matrix[3]) / w;
  const ndcY = (matrix[4] * world.x + matrix[5] * world.y + matrix[6] * world.z + matrix[7]) / w;
  return { x: (ndcX + 1) * viewport.x / 2, y: (1 - ndcY) * viewport.y / 2 };
}

/** View depth of a world point in front of the (breathed) eye; ≤ `CAMERA_NEAR` means behind or clipped. */
export function worldViewDepth(world: WorldPoint, camera: IsoCamera, viewport: ScreenPoint): number {
  const matrix = perspectiveMatrix(camera, viewport);
  return matrix[12] * world.x + matrix[13] * world.y + matrix[14] * world.z + matrix[15];
}

/** Perspective rays share the eye and diverge through the viewport pixels. */
export function screenToGroundRay(
  point: ScreenPoint,
  camera: IsoCamera,
  viewport: ScreenPoint,
): { origin: WorldPoint; direction: WorldPoint } {
  const view = cameraView(camera, viewport);
  const { pitch, yaw } = cameraViewAngles(view);
  const { right: rightAxis, up, back } = cameraBasis(pitch, yaw);
  const tanHalfFov = Math.tan(view.vFovDeg * Math.PI / 360);
  const right = (2 * point.x / viewport.x - 1) * tanHalfFov * viewport.x / viewport.y;
  const upScale = (1 - 2 * point.y / viewport.y) * tanHalfFov;
  const x = right * rightAxis.x + upScale * up.x - back.x;
  const y = upScale * up.y - back.y;
  const z = right * rightAxis.z + upScale * up.z - back.z;
  const length = Math.hypot(x, y, z);
  return {
    origin: view.eye,
    direction: { x: x / length, y: y / length, z: z / length },
  };
}

export function screenToGround(
  point: ScreenPoint,
  camera: IsoCamera,
  viewport: ScreenPoint,
  groundY = 0,
): TilePoint {
  const ray = screenToGroundRay(point, camera, viewport);
  const intersection = (groundY - ray.origin.y) / ray.direction.y;
  const distance = ray.direction.y >= 0 || intersection < 0
    ? CAMERA_FAR
    : Math.min(CAMERA_FAR, intersection);
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

/**
 * The iso conversions below are pose-space helpers for fitting, clamping and
 * zooming, not rendered screen truth. Use worldToScreen / screenToGround for
 * perspective projection and picking.
 */
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
  // Warm-village A1 (2026-09-05): the fit floor is the sailed-in 1.0 rest.
  // (The rest itself is now the W1.1 ShotSpec pose, `camera.ts` `defaultCamera`.)
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
 * `fitCameraToMap`'s framing floor (2026-09-06): 0.72 shows roughly twice the
 * water of the sailed-in 1.0 without returning to the retired 0.612 plate.
 * The rest is not a fit (W1.1 ShotSpec, `defaultCamera`); whole-map zoom-out
 * uses `minZoomForViewport`.
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
