import {
  GARDEN_DOCK_ROOT_Y,
  GARDEN_SHIP_ROOT_Y,
  GARDEN_WATER_Y,
  gardenTowerWorldAnchors,
} from "./garden-observatory-slice";
import { GARDEN_EMPTY_INLET, GARDEN_INLET_CORE_INSET_TILES } from "./garden-inlet";
import { STATION_SCALE_LADDER, stationFootprintRect, stationNobori, type StationType } from "./dock-layout";
import {
  REST_SEAT_EYE_LANDSCAPE,
  REST_SEAT_EYE_TALL,
  REST_SEAT_PITCH_RAD,
  REST_SEAT_TARGETS,
  REST_SEAT_VFOV_DEG,
  REST_SEAT_YAW_RAD,
  type RestSeatEye,
} from "./rest-seat";
import {
  buildPharosVilleMap,
  EVM_BAY_STATION_SLOTS,
  isWaterTileKind,
  LIGHTHOUSE_TILE,
  OUTER_HARBOR_STATION_SLOTS,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  PIGEONNIER_STATION_SLOT,
  STONE_GARDEN_GROUND_Y,
} from "./world-layout";
import type { DockNode } from "./world-types";
import type { CameraShotState, CameraView, IsoCamera, MapLike, ScreenPoint, TilePoint, WorldPoint } from "./projection";
import {
  ABSOLUTE_MIN_ZOOM,
  CAMERA_FOV_DEG,
  CAMERA_PITCH_NEAR_RAD,
  cameraDistanceForZoom,
  cameraView,
  cameraViewAngles,
  cameraViewFromAngles,
  gardenWaterPlateContainsTile,
  mapIsoBounds,
  MAX_ZOOM,
  minZoomForViewport,
  screenToGround,
  screenToGroundRay,
  tileToIso,
  TILE_SCALE,
  worldToScreen,
  worldViewDepth,
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

function cameraPadding(input?: CameraBoundsInput["padding"]) {
  return {
    bottom: input?.bottom ?? 80,
    left: input?.left ?? 0,
    right: input?.right ?? 128,
    top: input?.top ?? 0,
  };
}

// ---------------------------------------------------------------------------
// W1.1 — the rest ShotSpec (plan K1; `agents/2026-09-26-opus-visual-leap/
// w1-station-scan.md` §3). The rest is an authored pose checked against
// screen rects with the projection, never a zoom maximiser: there is no zoom
// term anywhere in the objective.
// ---------------------------------------------------------------------------

type Interval = readonly [number, number];

export interface ShotRects {
  /** Tower axis x at the waterline, fraction of the frame width. */
  footX: Interval;
  /** Crown (sceptre tip, world-fixed y) screen y, fraction of the frame height. */
  crownY: Interval;
  /** Crown-to-waterline screen height, fraction of the frame height. */
  span: Interval;
  /** The detail panel's corner: no subject may sit at x > minX and y < maxY. */
  panel: { minX: number; maxY: number };
}

export interface ShotSpec {
  id: "seat-c-landscape" | "seat-c-tall";
  eye: RestSeatEye;
  yaw: number;
  pitch: number;
  vFovDeg: number;
  /** Composition aim inside the rects (the objective's zero). */
  aim: { footX: number; crownY: number; span: number };
}

/** Landscape (aspect ≥ 1) and tall-window (aspect < 1) rect classes, K1. */
export const REST_SHOT_RECTS: { landscape: ShotRects; tall: ShotRects } = {
  landscape: { footX: [0.58, 0.68], crownY: [0.12, 0.20], span: [0.36, 0.47], panel: { minX: 0.74, maxY: 0.33 } },
  tall: { footX: [0.56, 0.62], crownY: [0.12, 0.20], span: [0.36, 0.47], panel: { minX: 0.74, maxY: 0.33 } },
};

/** Seat C's authored eyes: one serves every landscape gate, the tall window has its own. */
export const REST_SHOT_SPECS: readonly ShotSpec[] = [
  {
    id: "seat-c-landscape",
    eye: REST_SEAT_EYE_LANDSCAPE,
    yaw: REST_SEAT_YAW_RAD,
    pitch: REST_SEAT_PITCH_RAD,
    vFovDeg: REST_SEAT_VFOV_DEG,
    aim: { footX: REST_SEAT_TARGETS.towerFootX.landscape, crownY: REST_SEAT_TARGETS.crownY, span: REST_SEAT_TARGETS.towerSpan },
  },
  {
    id: "seat-c-tall",
    eye: REST_SEAT_EYE_TALL,
    yaw: REST_SEAT_YAW_RAD,
    pitch: REST_SEAT_PITCH_RAD,
    vFovDeg: REST_SEAT_VFOV_DEG,
    aim: { footX: REST_SEAT_TARGETS.towerFootX.tall, crownY: REST_SEAT_TARGETS.crownY, span: REST_SEAT_TARGETS.towerSpan },
  },
];

// Lazy: `garden-observatory-slice` → `garden-fleet-placement` → this module is
// an import cycle, so the slice's constants are unreadable at module load.
let towerMemo: { crown: WorldPoint; beacon: WorldPoint; foot: WorldPoint; waterline: WorldPoint } | null = null;
function towerAnchors() {
  if (!towerMemo) {
    const anchors = gardenTowerWorldAnchors(LIGHTHOUSE_TILE);
    /** The world-fixed waterline under the tower axis (the crag's rock foot). */
    towerMemo = { ...anchors, waterline: { x: anchors.foot.x, y: GARDEN_WATER_Y, z: anchors.foot.z } };
  }
  return towerMemo;
}
const REST_SHOT_MAP: MapLike = { height: PHAROSVILLE_MAP_HEIGHT, width: PHAROSVILLE_MAP_WIDTH };

interface RestStation {
  id: string;
  tile: TilePoint;
  type: StationType;
  seawardBearing: number;
}

const REST_STATIONS: readonly RestStation[] = [
  ...EVM_BAY_STATION_SLOTS,
  ...OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
].map((slot) => ({ id: slot.cove.id, seawardBearing: slot.cove.seawardBearing, tile: slot.cove.tile, type: slot.type }));

function stationsForSubjects(subjects: readonly DockNode[] | undefined): readonly RestStation[] {
  if (!subjects?.length) return REST_STATIONS;
  return subjects.map((dock) => {
    const slot = REST_STATIONS.find((station) => station.tile.x === dock.tile.x && station.tile.y === dock.tile.y);
    return {
      id: dock.id,
      seawardBearing: slot?.seawardBearing ?? dock.station.shoreBearing,
      tile: dock.tile,
      type: dock.station.type,
    };
  });
}

const noboriPointsByStation = new Map<string, readonly WorldPoint[]>();

/**
 * Every place a station's nobori can fly, in world units: `stationNobori`'s
 * banners over the same supply/frontage grid `HARBOR_NOBORI_ENVELOPE` spans,
 * at the station's own bearing (`shoreBearing` is the cove's seaward bearing),
 * each cloth swung through a full circle about its pole (wind yaw). The union
 * envelope's 17 u reach is the Mole pair's; an ordinary station flies far
 * closer to its dock tile than that.
 */
function stationNoboriPoints(station: RestStation): readonly WorldPoint[] {
  const key = `${station.id}|${station.type}|${station.tile.x},${station.tile.y}|${station.seawardBearing}`;
  const cached = noboriPointsByStation.get(key);
  if (cached) return cached;
  const cos = Math.cos(-station.seawardBearing);
  const sin = Math.sin(-station.seawardBearing);
  const originX = station.tile.x * TILE_SCALE;
  const originZ = station.tile.y * TILE_SCALE;
  const points: WorldPoint[] = [];
  for (const size of [1, 10]) for (const totalUsd of [1, 1e13]) for (const frontageShare of [0.01, 1, 100]) {
    const { banners } = stationNobori({
      frontageMedianShare: 1,
      frontageShare,
      size,
      station: { shoreBearing: station.seawardBearing, type: station.type },
      totalUsd,
    });
    for (const banner of banners) {
      const poleX = originX + banner.x * cos + banner.z * sin;
      const poleZ = originZ - banner.x * sin + banner.z * cos;
      for (let index = 0; index < 8; index += 1) {
        const angle = (index * Math.PI) / 4;
        const x = poleX + Math.cos(angle) * banner.clothWidth;
        const z = poleZ + Math.sin(angle) * banner.clothWidth;
        points.push(
          { x, y: GARDEN_DOCK_ROOT_Y + banner.clothBottomY, z },
          { x, y: GARDEN_DOCK_ROOT_Y + banner.poleTopY, z },
        );
      }
    }
  }
  noboriPointsByStation.set(key, points);
  return points;
}

/**
 * World points bounding a station's massing (its precinct footprint up to the
 * station's silhouette top) and its nobori (`stationNoboriPoints`, W1.3).
 */
function stationEnvelopePoints(station: RestStation): WorldPoint[] {
  const rect = stationFootprintRect(station.type, station.tile, station.seawardBearing);
  const top = GARDEN_DOCK_ROOT_Y + STATION_SCALE_LADDER[station.type].silhouetteTop;
  const points: WorldPoint[] = [];
  for (const along of [rect.minAlong, rect.maxAlong]) {
    for (const across of [rect.minAcross, rect.maxAcross]) {
      const x = (rect.origin.x + along * rect.seawardX - across * rect.seawardY) * TILE_SCALE;
      const z = (rect.origin.y + along * rect.seawardY + across * rect.seawardX) * TILE_SCALE;
      points.push({ x, y: GARDEN_DOCK_ROOT_Y, z }, { x, y: top, z });
    }
  }
  points.push(...stationNoboriPoints(station));
  return points;
}

/**
 * The inlet's impassable core, sampled on the water (`GARDEN_EMPTY_INLET`,
 * W1.6): the capsule of half-width `halfWidth − GARDEN_INLET_CORE_INSET_TILES`
 * that W1.6 sized to contain the seat's sight inlet at every gate. The outer
 * band is a routing-cost margin, not the corridor the shot keeps empty.
 */
let inletOutlineMemo: readonly WorldPoint[] | null = null;
function inletOutline(): readonly WorldPoint[] {
  inletOutlineMemo ??= buildInletOutline();
  return inletOutlineMemo;
}

function buildInletOutline(): readonly WorldPoint[] {
  const [start, end] = [GARDEN_EMPTY_INLET.polyline[0]!, GARDEN_EMPTY_INLET.polyline[GARDEN_EMPTY_INLET.polyline.length - 1]!];
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const points: WorldPoint[] = [];
  const radius = GARDEN_EMPTY_INLET.halfWidth - GARDEN_INLET_CORE_INSET_TILES;
  const cap = (centre: { x: number; y: number }, from: number) => {
    for (let step = 0; step <= 12; step += 1) {
      const a = from + (step / 12) * Math.PI;
      points.push({
        x: (centre.x + Math.cos(a) * radius) * TILE_SCALE,
        y: GARDEN_WATER_Y,
        z: (centre.y + Math.sin(a) * radius) * TILE_SCALE,
      });
    }
  };
  cap(end, angle - Math.PI / 2);
  cap(start, angle + Math.PI / 2);
  return points;
}

interface ScreenBox { minX: number; maxX: number; minY: number; maxY: number }

function convexHull(points: ScreenPoint[]): ScreenPoint[] {
  const sorted = points.toSorted((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: ScreenPoint[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: ScreenPoint[] = [];
  for (const p of sorted.toReversed()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Separating-axis test of an axis-aligned box against a convex polygon. */
function boxIntersectsConvex(box: ScreenBox, polygon: readonly ScreenPoint[]): boolean {
  if (polygon.length < 3) return false;
  const corners = [
    { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY },
  ];
  const axes: ScreenPoint[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    axes.push({ x: -(b.y - a.y), y: b.x - a.x });
  }
  for (const axis of axes) {
    let polyMin = Infinity;
    let polyMax = -Infinity;
    for (const p of polygon) {
      const d = p.x * axis.x + p.y * axis.y;
      polyMin = Math.min(polyMin, d);
      polyMax = Math.max(polyMax, d);
    }
    let boxMin = Infinity;
    let boxMax = -Infinity;
    for (const p of corners) {
      const d = p.x * axis.x + p.y * axis.y;
      boxMin = Math.min(boxMin, d);
      boxMax = Math.max(boxMax, d);
    }
    if (boxMax <= polyMin || polyMax <= boxMin) return false;
  }
  return true;
}

export interface RestShotReport {
  spec: ShotSpec["id"];
  footX: number;
  crownY: number;
  span: number;
  /** Stations whose massing or nobori envelope enters the projected inlet core. */
  inletIntrusions: string[];
  /**
   * Share of the frame's bottom quarter whose ground ray lands off the water
   * plate. Reported, not failed: the W1.5 threshold landform covers it.
   */
  plateEdgeHidden: number;
  /** Subjects (tower anchors, station mouths) inside the detail panel's corner. */
  panelIntrusions: string[];
  /** Sum of rect, corridor and panel violations; 0 means every rect holds. */
  violation: number;
  /** Composition objective (higher is better); no zoom term. */
  objective: number;
}

export interface RestShot {
  spec: ShotSpec;
  /**
   * The rest view. Its target lies on the view axis at the hand-off rig's
   * stand-off, so the breath pivot, sky/wake anchors and the pose-physical
   * detail measure read the rest exactly as they read that rig.
   */
  view: CameraView;
  /** The rig the rest hands off to (`restHandOffRig`). */
  rig: IsoCamera;
  report: RestShotReport;
}

const restCameraFor = (view: CameraView): IsoCamera => ({ offsetX: 0, offsetY: 0, zoom: 1, rest: { presence: 1, view } });

function measureRestShot(
  spec: ShotSpec,
  viewport: ScreenPoint,
  stations: readonly RestStation[],
): RestShot {
  const TOWER = towerAnchors();
  const rects = viewport.x / viewport.y >= 1 ? REST_SHOT_RECTS.landscape : REST_SHOT_RECTS.tall;
  const seatDistance = Math.hypot(spec.eye.world.x - TOWER.foot.x, spec.eye.world.y - TOWER.foot.y, spec.eye.world.z - TOWER.foot.z);
  const view = cameraViewFromAngles(spec.eye.world, spec.yaw, spec.pitch, seatDistance, spec.vFovDeg);
  const camera = restCameraFor(view);
  const normalised = (point: WorldPoint) => {
    const screen = worldToScreen(point, camera, viewport);
    return { x: screen.x / viewport.x, y: screen.y / viewport.y };
  };
  const foot = normalised(TOWER.waterline);
  const crown = normalised(TOWER.crown);
  const span = foot.y - crown.y;
  const outside = (value: number, [low, high]: Interval) => Math.max(0, low - value, value - high);

  const inletPolygon = convexHull(inletOutline()
    .filter((point) => worldViewDepth(point, camera, viewport) > 1)
    .map(normalised));
  const frame: ScreenBox = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const inletIntrusions: string[] = [];
  const panelIntrusions: string[] = [];
  const inPanel = (point: ScreenPoint) => point.x > rects.panel.minX && point.x <= 1 && point.y >= 0 && point.y < rects.panel.maxY;
  for (const station of stations) {
    const projected = stationEnvelopePoints(station)
      .filter((point) => worldViewDepth(point, camera, viewport) > 1)
      .map(normalised);
    if (projected.length > 0) {
      const box = {
        minX: Math.max(frame.minX, Math.min(...projected.map((p) => p.x))),
        maxX: Math.min(frame.maxX, Math.max(...projected.map((p) => p.x))),
        minY: Math.max(frame.minY, Math.min(...projected.map((p) => p.y))),
        maxY: Math.min(frame.maxY, Math.max(...projected.map((p) => p.y))),
      };
      if (box.minX < box.maxX && box.minY < box.maxY && boxIntersectsConvex(box, inletPolygon)) {
        inletIntrusions.push(station.id);
      }
    }
    const mouth = { x: station.tile.x * TILE_SCALE, y: GARDEN_WATER_Y, z: station.tile.y * TILE_SCALE };
    if (worldViewDepth(mouth, camera, viewport) > 1 && inPanel(normalised(mouth))) panelIntrusions.push(station.id);
  }
  for (const [name, point] of [["tower-foot", TOWER.waterline], ["tower-beacon", TOWER.beacon], ["tower-crown", TOWER.crown]] as const) {
    if (inPanel(normalised(point))) panelIntrusions.push(name);
  }

  let offPlate = 0;
  let samples = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 24; column += 1) {
      const point = { x: ((column + 0.5) / 24) * viewport.x, y: (0.75 + ((row + 0.5) / 8) * 0.25) * viewport.y };
      samples += 1;
      if (screenToGroundRay(point, camera, viewport).direction.y >= 0) continue;
      const tile = screenToGround(point, camera, viewport, GARDEN_WATER_Y);
      if (!gardenWaterPlateContainsTile(tile, REST_SHOT_MAP)) offPlate += 1;
    }
  }

  const violation = outside(foot.x, rects.footX) + outside(crown.y, rects.crownY) + outside(span, rects.span)
    + inletIntrusions.length + panelIntrusions.length;
  const objective = -4 * Math.abs(foot.x - spec.aim.footX) - 3 * Math.abs(crown.y - spec.aim.crownY) - 2 * Math.abs(span - spec.aim.span);
  return {
    spec,
    view,
    rig: { offsetX: 0, offsetY: 0, zoom: 1 },
    report: {
      spec: spec.id,
      footX: foot.x,
      crownY: crown.y,
      span,
      inletIntrusions,
      plateEdgeHidden: offPlate / samples,
      panelIntrusions,
      violation,
      objective,
    },
  };
}

/**
 * Solve the rest shot for a viewport: every authored seat-C eye is measured
 * against the aspect class's rects with the projection; the feasible pose with
 * the best composition objective wins (least violation first when none is).
 */
export function solveRestShot(viewport: ScreenPoint, subjects?: readonly DockNode[]): RestShot {
  const stations = stationsForSubjects(subjects);
  let best: RestShot | null = null;
  for (const spec of REST_SHOT_SPECS) {
    const shot = measureRestShot(spec, viewport, stations);
    if (
      !best
      || shot.report.violation < best.report.violation - 1e-9
      || (Math.abs(shot.report.violation - best.report.violation) <= 1e-9 && shot.report.objective > best.report.objective)
    ) best = shot;
  }
  const { spec } = best!;
  const rig = restHandOffRig(best!.view, viewport);
  const view = cameraViewFromAngles(spec.eye.world, spec.yaw, spec.pitch, cameraDistanceForZoom(viewport.y, rig.zoom), spec.vFovDeg);
  return { ...best!, rig, view };
}

const restShotMemo = new Map<string, RestShot>();

function memoRestShot(viewport: ScreenPoint, subjects?: readonly DockNode[]): RestShot {
  if (subjects?.length) return solveRestShot(viewport, subjects);
  const key = `${viewport.x}x${viewport.y}`;
  const cached = restShotMemo.get(key);
  if (cached) return cached;
  const shot = solveRestShot(viewport);
  if (restShotMemo.size > 32) restShotMemo.clear();
  restShotMemo.set(key, shot);
  return shot;
}

/** Moves a rig so the ray through `screen` meets the plane y = `planeY` at `world`. Exact: pose shape depends on zoom only. */
function placeRigPoint(camera: IsoCamera, viewport: ScreenPoint, screen: ScreenPoint, world: WorldPoint, planeY: number): IsoCamera {
  const hit = screenToGround(screen, camera, viewport, planeY);
  const delta = tileToIso({ x: world.x / TILE_SCALE - hit.x, y: world.z / TILE_SCALE - hit.y });
  return { ...camera, offsetX: camera.offsetX - delta.x * camera.zoom, offsetY: camera.offsetY - delta.y * camera.zoom };
}

/**
 * The rig camera the rest hands off to (W1.0): the IsoCamera whose own pose
 * puts the tower foot on the same pixel and the crown on the same row as the
 * rest shot. The first wheel or drag eases pitch and eye height from the seat
 * into this rig with no swing (same yaw) and no jump.
 */
export function restHandOffRig(view: CameraView, viewport: ScreenPoint): IsoCamera {
  const TOWER = towerAnchors();
  const rest = restCameraFor(view);
  const foot = worldToScreen(TOWER.foot, rest, viewport);
  const crownY = worldToScreen(TOWER.crown, rest, viewport).y;
  const seat = (zoom: number): IsoCamera => {
    const iso = tileToIso({ x: TOWER.foot.x / TILE_SCALE, y: TOWER.foot.z / TILE_SCALE });
    const rig = { offsetX: viewport.x / 2 - iso.x * zoom, offsetY: viewport.y / 2 - iso.y * zoom, zoom };
    return placeRigPoint(rig, viewport, foot, TOWER.foot, TOWER.foot.y);
  };
  let low = ABSOLUTE_MIN_ZOOM;
  let high = 8;
  for (let step = 0; step < 48; step += 1) {
    const mid = (low + high) / 2;
    // Closer (higher zoom) raises the crown on screen.
    if (worldToScreen(TOWER.crown, seat(mid), viewport).y > crownY) low = mid;
    else high = mid;
  }
  return seat((low + high) / 2);
}

/**
 * The rest: the solved ShotSpec pose at presence 1, carried on its hand-off rig.
 * `subjects` (live docks) replace the authored station slots in the corridor
 * and panel rects.
 */
export function defaultCamera(input: {
  height: number;
  map: MapLike;
  width: number;
  subjects?: readonly DockNode[];
}): IsoCamera {
  const viewport = { x: input.width, y: input.height };
  const shot = memoRestShot(viewport, input.subjects);
  return { ...shot.rig, rest: { presence: 1, view: shot.view } };
}

/** The rig alone: interactive gestures take the camera off the rest ShotSpec and any composed shot. */
export function withoutRest(camera: IsoCamera): IsoCamera {
  return { offsetX: camera.offsetX, offsetY: camera.offsetY, zoom: camera.zoom };
}

/**
 * Ground-plane pan (W1.1): the water point under `from` follows the pointer to
 * `to`, whatever the rig's yaw. Rays above the horizon fall back to the
 * pose-space delta. Always returns a rig (the rest hands off).
 */
export function panCameraOnGround(
  camera: IsoCamera,
  from: ScreenPoint,
  to: ScreenPoint,
  bounds: CameraBoundsInput,
): IsoCamera {
  const rig = withoutRest(camera);
  const grabbed = groundPointUnder(camera, from, bounds.viewport);
  const next = grabbed
    ? placeRigPoint(rig, bounds.viewport, to, grabbed, GARDEN_WATER_Y)
    : { ...rig, offsetX: rig.offsetX + to.x - from.x, offsetY: rig.offsetY + to.y - from.y };
  return clampCameraToMap(next, bounds);
}

/** Ground-anchored zoom: the water point under `point` in the shown view stays under it on the rig. */
export function zoomCameraOnGround(
  camera: IsoCamera,
  point: ScreenPoint,
  nextZoom: number,
  bounds: CameraBoundsInput,
  anchorTo: ScreenPoint = point,
): IsoCamera {
  const grabbed = groundPointUnder(camera, point, bounds.viewport);
  const zoomed = zoomCameraAt(withoutRest(camera), anchorTo, nextZoom, minZoomForViewport(bounds.viewport, bounds.map));
  const next = grabbed ? placeRigPoint(zoomed, bounds.viewport, anchorTo, grabbed, GARDEN_WATER_Y) : zoomed;
  return clampCameraToMap(next, bounds);
}

/**
 * The water point a screen pixel sees, or null above (or too near) the
 * horizon — and for an unmeasured (zero) viewport, whose ray is NaN.
 */
export function groundPointUnder(camera: IsoCamera, point: ScreenPoint, viewport: ScreenPoint): WorldPoint | null {
  const ray = screenToGroundRay(point, camera, viewport);
  if (!(ray.direction.y < -1e-3)) return null;
  const distance = (GARDEN_WATER_Y - ray.origin.y) / ray.direction.y;
  if (!(distance > 0 && distance <= 450)) return null;
  return {
    x: ray.origin.x + distance * ray.direction.x,
    y: GARDEN_WATER_Y,
    z: ray.origin.z + distance * ray.direction.z,
  };
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

/** Pose-space pan of the rig (the rest hands off). Screen-anchored input uses `panCameraOnGround`. */
export function panCamera(camera: IsoCamera, delta: ScreenPoint, bounds?: CameraBoundsInput): IsoCamera {
  const next = {
    ...withoutRest(camera),
    offsetX: camera.offsetX + delta.x,
    offsetY: camera.offsetY + delta.y,
  };
  return bounds ? clampCameraToMap(next, bounds) : next;
}

export function zoomIn(camera: IsoCamera, viewport: ScreenPoint, map?: MapLike): IsoCamera {
  return zoomToolbar(camera, viewport, 1.18, map);
}

export function zoomOut(camera: IsoCamera, viewport: ScreenPoint, map?: MapLike): IsoCamera {
  // N1: the floor is derived from the viewport so the camera can never pull
  // back past the world into empty ocean.
  return zoomToolbar(camera, viewport, 1 / 1.18, map);
}

function zoomToolbar(camera: IsoCamera, viewport: ScreenPoint, scale: number, map?: MapLike): IsoCamera {
  const centre = { x: viewport.x / 2, y: viewport.y / 2 };
  if (map) return zoomCameraOnGround(camera, centre, camera.zoom * scale, { map, viewport });
  return zoomCameraAt(withoutRest(camera), centre, camera.zoom * scale);
}

/**
 * Share of the chrome-free frame, per side, that the map clamp may push a
 * followed subject into. The clamp bounds the plate in iso space, which no
 * longer squares with the 31° near rig (W1.0): at the plate's south-east
 * corner it would push a station clean off the frame.
 */
const FOLLOW_SUBJECT_SAFE_INSET = 0.2;

/**
 * Centre a tile's hull waterline on screen at the camera's zoom (a rig; the
 * rest hands off). With a map, the ordinary clamp keeps edge anchorages'
 * surrounding water, but never pushes the subject out of the inset safe box.
 */
export function followTile(input: {
  camera: IsoCamera;
  map?: MapLike;
  tile: ScreenPoint;
  viewport: ScreenPoint;
}): IsoCamera {
  const iso = tileToIso(input.tile);
  const rig = {
    offsetX: input.viewport.x / 2 - iso.x * input.camera.zoom,
    offsetY: input.viewport.y / 2 - iso.y * input.camera.zoom,
    zoom: input.camera.zoom,
  };
  const subject = { x: input.tile.x * TILE_SCALE, y: GARDEN_SHIP_ROOT_Y, z: input.tile.y * TILE_SCALE };
  const next = placeRigPoint(
    rig,
    input.viewport,
    { x: input.viewport.x / 2, y: input.viewport.y / 2 },
    subject,
    GARDEN_SHIP_ROOT_Y,
  );
  if (!input.map) return next;
  const clamped = clampCameraToMap(next, { map: input.map, viewport: input.viewport });
  const padding = cameraPadding();
  const width = Math.max(1, input.viewport.x - padding.left - padding.right);
  const height = Math.max(1, input.viewport.y - padding.top - padding.bottom);
  const screen = worldToScreen(subject, clamped, input.viewport);
  const safe = {
    x: Math.min(
      padding.left + width * (1 - FOLLOW_SUBJECT_SAFE_INSET),
      Math.max(padding.left + width * FOLLOW_SUBJECT_SAFE_INSET, screen.x),
    ),
    y: Math.min(
      padding.top + height * (1 - FOLLOW_SUBJECT_SAFE_INSET),
      Math.max(padding.top + height * FOLLOW_SUBJECT_SAFE_INSET, screen.y),
    ),
  };
  if (safe.x === screen.x && safe.y === screen.y) return clamped;
  return placeRigPoint(clamped, input.viewport, safe, subject, GARDEN_SHIP_ROOT_Y);
}

// ---------------------------------------------------------------------------
// W1.7 — selection and return as composed shots (camera-3 ∪ ambient-journey-4
// ∪ critic-8). A selection composes its subject on a third with lead space,
// sized by the subject rather than a hard zoom, from the first pose whose
// sight lines clear the land, station and tower probe: yaw within ±20° of the
// rest yaw, then a raised pitch, then the same search looking outward from
// the harbour interior (rim berths). Run once per selection, never per frame.
// ---------------------------------------------------------------------------

/** Ship subject on the lower-left third; x mirrors to 0.64 when the heading points left. */
export const SELECTION_SHIP_ANCHOR: Readonly<ScreenPoint> = { x: 0.36, y: 0.62 };
export const SELECTION_DOCK_ANCHOR: Readonly<ScreenPoint> = { x: 0.40, y: 0.55 };
/** Waterline-to-masthead share of the frame height: the middle of camera-3's 9–12 % band. */
export const SELECTION_SHIP_SPAN = 0.105;
/** A station's quay-to-second-level massing share of the frame height. */
const SELECTION_DOCK_SPAN = 0.2;
/** A grave's shot stands back far enough to hold the whole stone garden bed (≈ 28 u) in frame. */
const SELECTION_GRAVE_DISTANCE = 38;
/**
 * The ship's silhouette height over `gardenShipSelectionRadius`: the hit
 * rect's convention (`rectAboveAnchor`, 1.25 × the 2r diameter), which holds
 * for low barges and tall-masted hulls alike better than any one mast height.
 */
export const SHIP_SILHOUETTE_PER_SELECTION_RADIUS = 2.5;
const SELECTION_YAW_OFFSETS_DEG = [0, 5, -5, 10, -10, 15, -15, 20, -20] as const;
const SELECTION_PITCH_RAISES_DEG = [0, 3, 6, 9] as const;
const SELECTION_DISTANCE_MIN = 24;
const SELECTION_DISTANCE_MAX = 180;
const SELECTION_MIN_EYE_HEIGHT = 5;
/** Rim banks read as solid to this height with their planting (bamboo, pines, precinct trees). */
const OCCLUDER_RIM_HEIGHT = 8;
/** The Pharos crag, Pigeon Island and the islets: headland rock plus pines. */
const OCCLUDER_ISLAND_HEIGHT = 24;
const OCCLUDER_SHORE_HEIGHT = 2;
const OCCLUDER_TOWER_RADIUS = 4;
/**
 * The W1.9 crag headland reaches past the island's tiles: probed as a solid
 * drum this wide about the tower axis, to `OCCLUDER_ISLAND_HEIGHT`.
 */
const OCCLUDER_CRAG_RADIUS = 22;
/** The Pharos and its crag, as a foreground mass: nearer than this share of the subject's distance it crowds the shot. */
const TOWER_FOREGROUND_RADIUS = 20;
const TOWER_FOREGROUND_DEPTH_SHARE = 0.8;
/** No land within this many tiles of the eye, so no bank sits against the lens. */
const SELECTION_EYE_CLEARANCE_TILES = 4;
/** Sight-line steps nearer the subject than this cross its own hull and water. */
const SELECTION_SUBJECT_SELF_RADIUS = 2.5;
const SELECTION_SIGHT_STEP = 0.7;
/** Lighthouse selection: a slow look-up — tilt up 3°, dolly in 4 %, tower foot to x 0.40. */
export const LIGHTHOUSE_LOOK_UP = { pitchRad: (3 * Math.PI) / 180, dolly: 0.96, towerX: 0.4 } as const;

/** Another hull the subject must not hide behind: its display tile and selection radius. */
export interface SelectionShotObstacle {
  tile: TilePoint;
  selectionRadius: number;
}

export type SelectionShotSubject = (
  | { kind: "ship"; tile: TilePoint; selectionRadius: number; heading?: TilePoint | null | undefined }
  | { kind: "dock"; dock: DockNode }
  // X1 (K29): a fallen coin's stone, framed with the stone garden round it.
  | { kind: "grave"; tile: TilePoint }
) & {
  /** The rest of the fleet (the subject excluded), probed as upright hull cylinders. */
  obstacles?: readonly SelectionShotObstacle[] | undefined;
};

export interface SelectionShotReport {
  /** The anchor the subject was composed on (after the lead flip). */
  anchor: ScreenPoint;
  yawOffsetDeg: number;
  pitchRaiseDeg: number;
  /** The search fell back to looking outward from the harbour interior. */
  outward: boolean;
  /** Subject probe points whose sight line land, the tower or a station crosses, of `samples`. */
  blocked: number;
  /** Probe points (of the rest) whose sight line crosses another hull. */
  hullBlocked: number;
  samples: number;
  /** The eye sits over open map water, clear of land. */
  eyeClear: boolean;
  /** The Pharos does not stand in front of the subject inside the frame. */
  foregroundClear: boolean;
}

/**
 * Lexicographic cost; 0 is a clean shot: a land-bound eye, then each line
 * hidden by land, tower or station, then a foreground tower, then each line
 * crossing another hull (a sail in front is a lesser loss than the crag).
 */
function selectionCandidateCost(report: SelectionShotReport): number {
  return (report.eyeClear ? 0 : 1000) + report.blocked * 20 + (report.foregroundClear ? 0 : 10) + report.hullBlocked * 2;
}

export interface SelectionShot {
  /** The rig under the shot (URL `cam`, gesture hand-off) with the shot at presence 1. */
  camera: IsoCamera;
  report: SelectionShotReport;
}

interface WorldBox { min: WorldPoint; max: WorldPoint }

function stationMassingBox(station: { type: StationType; tile: TilePoint; seawardBearing: number }): WorldBox {
  const rect = stationFootprintRect(station.type, station.tile, station.seawardBearing);
  const xs: number[] = [];
  const zs: number[] = [];
  for (const along of [rect.minAlong, rect.maxAlong]) {
    for (const across of [rect.minAcross, rect.maxAcross]) {
      xs.push((rect.origin.x + along * rect.seawardX - across * rect.seawardY) * TILE_SCALE);
      zs.push((rect.origin.y + along * rect.seawardY + across * rect.seawardX) * TILE_SCALE);
    }
  }
  return {
    min: { x: Math.min(...xs), y: GARDEN_DOCK_ROOT_Y, z: Math.min(...zs) },
    max: { x: Math.max(...xs), y: GARDEN_DOCK_ROOT_Y + STATION_SCALE_LADDER[station.type].silhouetteTop, z: Math.max(...zs) },
  };
}

let stationBoxesMemo: ReadonlyArray<{ key: string; box: WorldBox }> | null = null;
/** Station massing boxes keyed by their dock tile (`x,y`), so a dock subject can skip its own. */
function stationBoxes(): ReadonlyArray<{ key: string; box: WorldBox }> {
  stationBoxesMemo ??= REST_STATIONS.map((station) => ({ key: `${station.tile.x},${station.tile.y}`, box: stationMassingBox(station) }));
  return stationBoxesMemo;
}

/** Slab test: does the segment `from`→`to` cross the box? */
function segmentHitsBox(from: WorldPoint, to: WorldPoint, box: WorldBox): boolean {
  let enter = 0;
  let exit = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-9) {
      if (from[axis] < box.min[axis] || from[axis] > box.max[axis]) return false;
      continue;
    }
    const a = (box.min[axis] - from[axis]) / delta;
    const b = (box.max[axis] - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return false;
  }
  return true;
}

/** Solid top of the map at a world point: planted land or a low shore; open water and off-map are -∞. */
function occluderLandHeight(x: number, z: number): number {
  const map = buildPharosVilleMap();
  const tileX = Math.round(x / TILE_SCALE);
  const tileY = Math.round(z / TILE_SCALE);
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return Number.NEGATIVE_INFINITY;
  const tile = map.tiles[tileY * map.width + tileX]!;
  if (isWaterTileKind(tile.kind)) return Number.NEGATIVE_INFINITY;
  if (tile.kind === "shore") return OCCLUDER_SHORE_HEIGHT;
  return tile.terrain === "rim" ? OCCLUDER_RIM_HEIGHT : OCCLUDER_ISLAND_HEIGHT;
}

interface HullCylinder { x: number; z: number; radius: number; top: number }

/** Where along the segment (0..1) it passes nearest a vertical axis, in plan. */
function nearestPlanT(eye: WorldPoint, dx: number, dz: number, x: number, z: number, reach: number): number {
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-9) return 0;
  return Math.min(reach, Math.max(0, ((x - eye.x) * dx + (z - eye.z) * dz) / lengthSquared));
}

/** What hides the sight line from the eye to a probe point, if anything. */
function sightBlocker(
  eye: WorldPoint,
  point: WorldPoint,
  geometry: Pick<SelectionSubjectGeometry, "hulls" | "ownStation"> & { groundHeight?: ShotGroundHeight | undefined },
): "land" | "hull" | null {
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const length = Math.hypot(dx, dy, dz);
  const reach = Math.max(0, length - SELECTION_SUBJECT_SELF_RADIUS) / Math.max(1e-6, length);
  const tower = towerAnchors();
  const steps = Math.ceil(length / SELECTION_SIGHT_STEP);
  for (let step = 1; step < steps && step / steps <= reach; step += 1) {
    const t = step / steps;
    const x = eye.x + dx * t;
    const y = eye.y + dy * t;
    const z = eye.z + dz * t;
    // A caller holding the island's real terrain replaces the crude island
    // block and crag drum with it (authored shots stand on the island).
    const fine = geometry.groundHeight?.(x, z);
    if (fine !== undefined && fine !== null) {
      if (y < fine) return "land";
    } else {
      if (y < occluderLandHeight(x, z)) return "land";
      if (y < OCCLUDER_ISLAND_HEIGHT && Math.hypot(x - tower.foot.x, z - tower.foot.z) < OCCLUDER_CRAG_RADIUS) return "land";
    }
    if (y < tower.crown.y && Math.hypot(x - tower.foot.x, z - tower.foot.z) < OCCLUDER_TOWER_RADIUS) return "land";
  }
  const end = { x: eye.x + dx * reach, y: eye.y + dy * reach, z: eye.z + dz * reach };
  if (stationBoxes().some(({ key, box }) => key !== geometry.ownStation && segmentHitsBox(eye, end, box))) return "land";
  for (const hull of geometry.hulls) {
    const t = nearestPlanT(eye, dx, dz, hull.x, hull.z, reach);
    const x = eye.x + dx * t;
    const z = eye.z + dz * t;
    if (Math.hypot(x - hull.x, z - hull.z) < hull.radius && eye.y + dy * t < hull.top) return "hull";
  }
  return null;
}

/**
 * Terrain height at a world point where the caller knows it better than the
 * map's tile classes (the island's crag, bench and stair), else null.
 */
export type ShotGroundHeight = (x: number, z: number) => number | null;

/**
 * X6 (postcards): the selection probe for an authored shot — land, the
 * tower and every station but `ownStation` (an `x,y` dock tile) along the
 * eye→point line. `groundHeight` supplies the island's real terrain.
 */
export function shotSightBlocked(
  eye: WorldPoint,
  point: WorldPoint,
  options: { ownStation?: string | null | undefined; groundHeight?: ShotGroundHeight | undefined } = {},
): boolean {
  return sightBlocker(eye, point, { groundHeight: options.groundHeight, hulls: [], ownStation: options.ownStation ?? null }) !== null;
}

/** Whether an eye stands inside a station's massing (a postcard eye must not). */
export function eyeInsideStation(eye: WorldPoint): boolean {
  return stationBoxes().some(({ box }) => eye.x >= box.min.x && eye.x <= box.max.x
    && eye.y >= box.min.y && eye.y <= box.max.y && eye.z >= box.min.z && eye.z <= box.max.z);
}

function eyeOverOpenWater(eye: WorldPoint): boolean {
  if (eye.y < SELECTION_MIN_EYE_HEIGHT) return false;
  const tileX = eye.x / TILE_SCALE;
  const tileY = eye.z / TILE_SCALE;
  // The map proper: the plate margin beyond it carries the camera-side skirt land.
  if (tileX < 0 || tileY < 0 || tileX > PHAROSVILLE_MAP_WIDTH - 1 || tileY > PHAROSVILLE_MAP_HEIGHT - 1) return false;
  const tower = towerAnchors();
  if (Math.hypot(eye.x - tower.foot.x, eye.z - tower.foot.z) < OCCLUDER_CRAG_RADIUS + SELECTION_EYE_CLEARANCE_TILES * TILE_SCALE) return false;
  for (let dy = -SELECTION_EYE_CLEARANCE_TILES; dy <= SELECTION_EYE_CLEARANCE_TILES; dy += 1) {
    for (let dx = -SELECTION_EYE_CLEARANCE_TILES; dx <= SELECTION_EYE_CLEARANCE_TILES; dx += 1) {
      if (occluderLandHeight(eye.x + dx * TILE_SCALE, eye.z + dy * TILE_SCALE) > Number.NEGATIVE_INFINITY) return false;
    }
  }
  return true;
}

/** The camera state that shows `view` alone (for measuring a candidate shot). */
function shotCameraFor(view: CameraView): IsoCamera {
  return { offsetX: 0, offsetY: 0, zoom: 1, shot: { presence: 1, view } };
}

/**
 * The view at (yaw, down-pitch) that puts `subject` on the frame `anchor`
 * `distance` along its pixel ray; its look-at target sits the same distance
 * down the axis, so breath pivots and the detail measure read the subject.
 */
function composedView(subject: WorldPoint, yaw: number, pitch: number, anchor: ScreenPoint, distance: number, viewport: ScreenPoint): CameraView {
  const tanHalfFov = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const right = (2 * anchor.x - 1) * tanHalfFov * (viewport.x / viewport.y);
  const up = (1 - 2 * anchor.y) * tanHalfFov;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);
  // right·(cos, 0, −sin)yaw + up·(camera up) − back, as in projection's camera basis.
  const x = right * cosYaw - up * sinPitch * sinYaw - cosPitch * sinYaw;
  const y = up * cosPitch - sinPitch;
  const z = -right * sinYaw - up * sinPitch * cosYaw - cosPitch * cosYaw;
  const scale = distance / Math.hypot(x, y, z);
  const eye = { x: subject.x - x * scale, y: subject.y - y * scale, z: subject.z - z * scale };
  return cameraViewFromAngles(eye, yaw, pitch, distance, CAMERA_FOV_DEG);
}

interface SelectionSubjectGeometry {
  /** The point composed on the anchor (the silhouette's centre). */
  point: WorldPoint;
  /** Probe points: the sight lines that must stay clear. */
  samples: readonly WorldPoint[];
  anchor: ScreenPoint;
  distance: number;
  heading: { x: number; z: number } | null;
  /** The subject's own station (`x,y` dock tile), exempt from the probe. */
  ownStation: string | null;
  hulls: readonly HullCylinder[];
}

function hullCylinders(obstacles: readonly SelectionShotObstacle[] | undefined): HullCylinder[] {
  return (obstacles ?? []).map((obstacle) => ({
    radius: obstacle.selectionRadius * 0.9,
    top: GARDEN_SHIP_ROOT_Y + obstacle.selectionRadius * SHIP_SILHOUETTE_PER_SELECTION_RADIUS,
    x: obstacle.tile.x * TILE_SCALE,
    z: obstacle.tile.y * TILE_SCALE,
  }));
}

function selectionSubjectGeometry(subject: SelectionShotSubject): SelectionSubjectGeometry {
  const frameHeightPerDistance = 2 * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const clampDistance = (distance: number) => Math.min(SELECTION_DISTANCE_MAX, Math.max(SELECTION_DISTANCE_MIN, distance));
  if (subject.kind === "dock") {
    const station = stationsForSubjects([subject.dock])[0]!;
    const box = stationMassingBox(station);
    const centre = { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
    const height = box.max.y - box.min.y;
    return {
      point: { x: centre.x, y: box.min.y + height / 2, z: centre.z },
      samples: [box.min.y + 0.4, box.min.y + height / 2, box.max.y].map((y) => ({ x: centre.x, y, z: centre.z })),
      anchor: SELECTION_DOCK_ANCHOR,
      distance: clampDistance(height / (SELECTION_DOCK_SPAN * frameHeightPerDistance)),
      heading: null,
      ownStation: `${station.tile.x},${station.tile.y}`,
      hulls: hullCylinders(subject.obstacles),
    };
  }
  if (subject.kind === "grave") {
    const point = { x: subject.tile.x * TILE_SCALE, y: STONE_GARDEN_GROUND_Y + 0.4, z: subject.tile.y * TILE_SCALE };
    return {
      point,
      samples: [0.1, 0.4, 0.9].map((lift) => ({ ...point, y: STONE_GARDEN_GROUND_Y + lift })),
      anchor: SELECTION_DOCK_ANCHOR,
      distance: clampDistance(SELECTION_GRAVE_DISTANCE),
      heading: null,
      ownStation: null,
      hulls: hullCylinders(subject.obstacles),
    };
  }
  const height = subject.selectionRadius * SHIP_SILHOUETTE_PER_SELECTION_RADIUS;
  const x = subject.tile.x * TILE_SCALE;
  const z = subject.tile.y * TILE_SCALE;
  const speed = subject.heading ? Math.hypot(subject.heading.x, subject.heading.y) : 0;
  const heading = speed > 1e-6 ? { x: subject.heading!.x / speed, z: subject.heading!.y / speed } : null;
  const half = subject.selectionRadius * 0.9;
  const samples: WorldPoint[] = [
    { x, y: GARDEN_SHIP_ROOT_Y + 0.4, z },
    { x, y: GARDEN_SHIP_ROOT_Y + height * 0.5, z },
    { x, y: GARDEN_SHIP_ROOT_Y + height * 0.9, z },
  ];
  if (heading) {
    for (const sign of [1, -1]) {
      samples.push({ x: x + heading.x * half * sign, y: GARDEN_SHIP_ROOT_Y + height * 0.3, z: z + heading.z * half * sign });
    }
  }
  return {
    point: { x, y: GARDEN_SHIP_ROOT_Y + height * 0.5, z },
    samples,
    anchor: SELECTION_SHIP_ANCHOR,
    distance: clampDistance(height / (SELECTION_SHIP_SPAN * frameHeightPerDistance)),
    heading,
    ownStation: null,
    hulls: hullCylinders(subject.obstacles),
  };
}

interface SelectionCandidate {
  view: CameraView;
  report: SelectionShotReport;
}

function measureSelectionCandidate(
  geometry: SelectionSubjectGeometry,
  yaw: number,
  pitch: number,
  viewport: ScreenPoint,
  meta: Pick<SelectionShotReport, "yawOffsetDeg" | "pitchRaiseDeg" | "outward">,
): SelectionCandidate {
  let anchor = geometry.anchor;
  let view = composedView(geometry.point, yaw, pitch, anchor, geometry.distance, viewport);
  if (geometry.heading) {
    // Lead space: the bow points into the open two thirds; mirror when it heads left.
    const camera = shotCameraFor(view);
    const at = worldToScreen(geometry.point, camera, viewport);
    const ahead = worldToScreen({
      x: geometry.point.x + geometry.heading.x * 6,
      y: geometry.point.y,
      z: geometry.point.z + geometry.heading.z * 6,
    }, camera, viewport);
    if (ahead.x - at.x < -0.002 * viewport.x) {
      anchor = { x: 1 - anchor.x, y: anchor.y };
      view = composedView(geometry.point, yaw, pitch, anchor, geometry.distance, viewport);
    }
  }
  const blockers = geometry.samples.map((point) => sightBlocker(view.eye, point, geometry));
  return {
    view,
    report: {
      ...meta,
      anchor,
      blocked: blockers.filter((blocker) => blocker === "land").length,
      hullBlocked: blockers.filter((blocker) => blocker === "hull").length,
      samples: geometry.samples.length,
      eyeClear: eyeOverOpenWater(view.eye),
      foregroundClear: !towerInForeground(view, geometry.distance, viewport),
    },
  };
}

/** The Pharos stands between the eye and the subject, inside the frame: a wall, not a backdrop. */
function towerInForeground(view: CameraView, subjectDistance: number, viewport: ScreenPoint): boolean {
  const TOWER = towerAnchors();
  const camera = shotCameraFor(view);
  const depth = worldViewDepth(TOWER.foot, camera, viewport);
  if (depth <= 1 || depth >= subjectDistance * TOWER_FOREGROUND_DEPTH_SHARE) return false;
  const { yaw } = cameraViewAngles(view);
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const xs = [-1, 1].map((side) => worldToScreen({
    x: TOWER.foot.x + right.x * TOWER_FOREGROUND_RADIUS * side,
    y: TOWER.foot.y,
    z: TOWER.foot.z + right.z * TOWER_FOREGROUND_RADIUS * side,
  }, camera, viewport).x);
  return Math.max(...xs) > 0 && Math.min(...xs) < viewport.x;
}

/** The rig under a shot: the subject on the same pixel at the shot's stand-off. */
function selectionRig(point: WorldPoint, anchor: ScreenPoint, distance: number, viewport: ScreenPoint): IsoCamera {
  const zoom = Math.min(MAX_ZOOM, cameraDistanceForZoom(viewport.y, 1) / distance);
  const iso = tileToIso({ x: point.x / TILE_SCALE, y: point.z / TILE_SCALE });
  const rig = { offsetX: viewport.x / 2 - iso.x * zoom, offsetY: viewport.y / 2 - iso.y * zoom, zoom };
  return placeRigPoint(rig, viewport, { x: anchor.x * viewport.x, y: anchor.y * viewport.y }, point, point.y);
}

/**
 * W1.7 `selectionShot`: the composed shot for a selected ship or dock at this
 * viewport. Candidates run from the rest yaw (±20°, then raised pitches), to
 * the harbour-interior look outward, to the rest of the compass in 40° steps;
 * the first clean one wins, else the cheapest (`selectionCandidateCost`).
 */
export function selectionShot(subject: SelectionShotSubject, viewport: ScreenPoint): SelectionShot {
  const geometry = selectionSubjectGeometry(subject);
  const centre = { x: ((PHAROSVILLE_MAP_WIDTH - 1) / 2) * TILE_SCALE, z: ((PHAROSVILLE_MAP_HEIGHT - 1) / 2) * TILE_SCALE };
  const families = [
    { outward: false, yaw: REST_SEAT_YAW_RAD },
    // Rim berths: stand in the harbour and look out at the berth.
    { outward: true, yaw: Math.atan2(centre.x - geometry.point.x, centre.z - geometry.point.z) },
    // Last resort (a subject walled in by the crag from every near-rest yaw).
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((step) => ({ outward: true, yaw: REST_SEAT_YAW_RAD + (step * 40 * Math.PI) / 180 })),
  ];
  let best: SelectionCandidate | null = null;
  search: for (const family of families) {
    for (const pitchRaiseDeg of SELECTION_PITCH_RAISES_DEG) {
      for (const yawOffsetDeg of SELECTION_YAW_OFFSETS_DEG) {
        const candidate = measureSelectionCandidate(
          geometry,
          family.yaw + (yawOffsetDeg * Math.PI) / 180,
          CAMERA_PITCH_NEAR_RAD + (pitchRaiseDeg * Math.PI) / 180,
          viewport,
          { outward: family.outward, pitchRaiseDeg, yawOffsetDeg },
        );
        if (!best || selectionCandidateCost(candidate.report) < selectionCandidateCost(best.report)) best = candidate;
        if (selectionCandidateCost(best.report) === 0) break search;
      }
    }
  }
  const { view, report } = best!;
  const rig = selectionRig(geometry.point, report.anchor, geometry.distance, viewport);
  const shot: CameraShotState = { presence: 1, subject: { anchor: report.anchor, world: geometry.point }, view };
  return { camera: { ...rig, shot }, report };
}

/**
 * Lighthouse selection (camera-3 How 4): from the view the camera shows, the
 * eye dollies 4 % toward the tower and tilts up 3°, turning until the tower's
 * waterline sits at x 0.40, left of the detail panel. The camera keeps its rig
 * and rest under the shot, so the seat's threshold stays with the viewer.
 * Null when the tower is not in front of the view.
 */
export function lighthouseLookUpCamera(camera: IsoCamera, viewport: ScreenPoint): IsoCamera | null {
  const view = cameraView(camera, viewport, { breath: false });
  const { distance, pitch, yaw } = cameraViewAngles(view);
  const TOWER = towerAnchors();
  const toTower = Math.hypot(TOWER.foot.x - view.eye.x, TOWER.foot.y - view.eye.y, TOWER.foot.z - view.eye.z);
  const step = (1 - LIGHTHOUSE_LOOK_UP.dolly) * toTower;
  const eye = {
    x: view.eye.x - Math.cos(pitch) * Math.sin(yaw) * step,
    y: view.eye.y - Math.sin(pitch) * step,
    z: view.eye.z - Math.cos(pitch) * Math.cos(yaw) * step,
  };
  const lookPitch = pitch - LIGHTHOUSE_LOOK_UP.pitchRad;
  const lookDistance = distance * LIGHTHOUSE_LOOK_UP.dolly;
  const viewAt = (lookYaw: number) => cameraViewFromAngles(eye, lookYaw, lookPitch, lookDistance, view.vFovDeg);
  const footX = (lookYaw: number) => {
    const probe = shotCameraFor(viewAt(lookYaw));
    if (worldViewDepth(TOWER.waterline, probe, viewport) <= 1) return Number.NaN;
    return worldToScreen(TOWER.waterline, probe, viewport).x / viewport.x - LIGHTHOUSE_LOOK_UP.towerX;
  };
  let low = yaw - Math.PI / 4;
  let high = yaw + Math.PI / 4;
  const lowValue = footX(low);
  const highValue = footX(high);
  if (!(lowValue * highValue <= 0)) return null;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const mid = (low + high) / 2;
    if (Math.sign(footX(mid)) === Math.sign(lowValue)) low = mid;
    else high = mid;
  }
  const lookUp = viewAt((low + high) / 2);
  const anchor = worldToScreen(TOWER.waterline, shotCameraFor(lookUp), viewport);
  return {
    offsetX: camera.offsetX,
    offsetY: camera.offsetY,
    zoom: camera.zoom,
    rest: camera.rest,
    shot: {
      presence: 1,
      subject: { anchor: { x: anchor.x / viewport.x, y: anchor.y / viewport.y }, world: TOWER.waterline },
      view: lookUp,
    },
  };
}

/**
 * Follow mode inherits the selection's composition: the shot translates with
 * its subject so the ship stays on the shot's anchor at the shot's yaw and
 * pitch; the rig under it moves the same way. Null without a composed shot.
 */
export function followShotCamera(camera: IsoCamera, tile: TilePoint, viewport: ScreenPoint): IsoCamera | null {
  const shot = camera.shot;
  const subject = shot?.subject;
  if (!shot || !subject || shot.presence < 1) return null;
  const world = { x: tile.x * TILE_SCALE, y: subject.world.y, z: tile.y * TILE_SCALE };
  const dx = world.x - subject.world.x;
  const dz = world.z - subject.world.z;
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return camera;
  const view = {
    eye: { x: shot.view.eye.x + dx, y: shot.view.eye.y, z: shot.view.eye.z + dz },
    target: { x: shot.view.target.x + dx, y: shot.view.target.y, z: shot.view.target.z + dz },
    vFovDeg: shot.view.vFovDeg,
  };
  const rig = placeRigPoint(
    withoutRest(camera),
    viewport,
    { x: subject.anchor.x * viewport.x, y: subject.anchor.y * viewport.y },
    world,
    world.y,
  );
  return { ...rig, shot: { presence: 1, subject: { anchor: subject.anchor, world }, view } };
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
