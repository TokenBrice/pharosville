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
  EVM_BAY_STATION_SLOTS,
  LIGHTHOUSE_TILE,
  OUTER_HARBOR_STATION_SLOTS,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  PIGEONNIER_STATION_SLOT,
} from "./world-layout";
import type { DockNode } from "./world-types";
import type { CameraView, IsoCamera, MapLike, ScreenPoint, TilePoint, WorldPoint } from "./projection";
import {
  ABSOLUTE_MIN_ZOOM,
  cameraDistanceForZoom,
  cameraViewFromAngles,
  gardenWaterPlateContainsTile,
  mapIsoBounds,
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
 * civic hall's second level) and its nobori (`stationNoboriPoints`, W1.3).
 */
function stationEnvelopePoints(station: RestStation): WorldPoint[] {
  const rect = stationFootprintRect(station.type, station.tile, station.seawardBearing);
  const top = GARDEN_DOCK_ROOT_Y + STATION_SCALE_LADDER[station.type].secondLevelTop;
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

/** The rig alone: interactive gestures take the camera off the rest ShotSpec. */
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
