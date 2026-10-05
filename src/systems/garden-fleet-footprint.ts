import { gardenShipHullReachWorld } from "./garden-water-exclusion";
import { GARDEN_SHIP_ROOT_Y, GARDEN_SILHOUETTE_FOR_HULL, gardenShipVisualScale, type GardenHullSilhouette } from "./garden-observatory-slice";
import { CAMERA_NEAR, TILE_SCALE, cameraViewFromAngles, worldToScreen, worldViewDepth, type IsoCamera, type ScreenPoint } from "./projection";
import { shipRestSailBraceRad } from "./ship-visuals";
import { restSeatEyeForAspect, REST_SEAT_YAW_RAD, REST_SEAT_PITCH_RAD, REST_SEAT_VFOV_DEG } from "./rest-seat";
import type { ShipNode } from "./world-types";

/** Renderer-independent conservative geometry, not a rendered-pixel occlusion claim.
 * Local +X is the bow; square cloth is athwartships. Identity is the largest
 * sail (bit zero), not necessarily the first mast. Dimensions include its
 * existing 1.1 square / 1.22 fore-and-aft identity enlargement. */
export interface GardenFleetSailEnvelope {
  x: number;
  z: number;
  y: number;
  width: number;
  height: number;
  kind: "square" | "triangle" | "junk";
  reverse?: boolean;
}
export interface GardenFleetFamilyEnvelope {
  hullHeight: number;
  sails: readonly GardenFleetSailEnvelope[];
}
/** Authored waterline and deck anchors shared by detailed and far hulls.
 * +X is the stem. Demi-hull spacing stays separate from its narrow outline. */
export interface GardenFleetHullForm {
  outline: readonly (readonly [number, number])[];
  bowLift: number;
  sternLift: number;
  bowRake: number;
  sternRake: number;
  deckY: number;
}
export const GARDEN_FLEET_HULL_FORMS: Record<GardenHullSilhouette, GardenFleetHullForm> = {
  bezaisen: { outline: [[-3.4, -0.9], [-3.4, 0.9], [-1.6, 1.28], [1.4, 1.2], [2.7, 0.76], [3.4, 0], [2.7, -0.76], [1.4, -1.2], [-1.6, -1.28]],
    bowLift: 0.64, sternLift: 0.56, bowRake: 0.06, sternRake: 0.04, deckY: 0.27 },
  kobaya: { outline: [[-4.28, -0.3], [-4.28, 0.3], [-1.2, 0.65], [2.7, 0.5], [4.6, 0.22], [5.32, 0], [4.6, -0.22], [2.7, -0.5], [-1.2, -0.65]],
    bowLift: 0.18, sternLift: 0.09, bowRake: 0.32, sternRake: 0.14, deckY: 0.32 },
  twinhull: { outline: [[-4.5, 0], [-2.7, 0.44], [1.65, 0.46], [4.5, 0], [1.65, -0.46], [-2.7, -0.44]],
    bowLift: 0.14, sternLift: 0.08, bowRake: 0.18, sternRake: 0.12, deckY: 0.32 },
  takasebune: { outline: [[-5.92, 0], [-4.2, 1.4], [4.3, 1.4], [5.95, 0], [4.3, -1.4], [-4.2, -1.4]],
    bowLift: 0.07, sternLift: 0.05, bowRake: 0.03, sternRake: 0.02, deckY: 0.34 },
  junk: { outline: [[-3.12, -0.95], [-3.12, 0.95], [-1.2, 1.3], [1.3, 1.22], [2.95, 0.72], [3.38, 0], [2.95, -0.72], [1.3, -1.22], [-1.2, -1.3]],
    bowLift: 0.22, sternLift: 0.62, bowRake: 0.06, sternRake: 0.05, deckY: 0.3 },
  scow: { outline: [[-2.58, 0], [-2.12, 1.55], [0.2, 2], [2.58, 0], [0.2, -2], [-2.12, -1.55]],
    bowLift: 0.08, sternLift: 0.1, bowRake: 0.02, sternRake: 0.02, deckY: 0.34 },
};
/** Resolve plan bounds once, not for every shell/deck/lantern vertex. */
export const GARDEN_FLEET_HULL_ENDS = Object.fromEntries(
  Object.entries(GARDEN_FLEET_HULL_FORMS).map(([family, form]) => {
    let bow = 0.001, stern = 0.001;
    for (const [x] of form.outline) { bow = Math.max(bow, x); stern = Math.max(stern, -x); }
    return [family, { bow, stern }];
  }),
) as Record<GardenHullSilhouette, { bow: number; stern: number }>;
export const GARDEN_FLEET_RAIL_Y = 0.47;
export const GARDEN_FLEET_DEMI_HULL_Z = 1.02;
export const GARDEN_FLEET_FAMILY_ENVELOPES: Record<GardenHullSilhouette, GardenFleetFamilyEnvelope> = {
  bezaisen: { hullHeight: 1.7, sails: [{ x: 0.15, z: 0, y: 3.15, width: 4.73, height: 3.3, kind: "square" }] },
  kobaya: { hullHeight: 1.0, sails: [
    { x: 1.25, z: 0, y: 2.85, width: 3.294, height: 4.758, kind: "triangle" },
    { x: -1.45, z: 0, y: 2.65, width: 2.45, height: 3.65, kind: "triangle", reverse: true },
  ] },
  twinhull: { hullHeight: 1.2, sails: [
    { x: 0.7, z: 1.02, y: 3.25, width: 2.806, height: 5.429, kind: "triangle" },
    { x: -0.7, z: -1.02, y: 3.05, width: 2.15, height: 4.15, kind: "triangle", reverse: true },
  ] },
  takasebune: { hullHeight: 1.4, sails: [{ x: -3.35, z: 0, y: 3.05, width: 3.19, height: 2.42, kind: "square" }] },
  junk: { hullHeight: 1.4, sails: [
    { x: -0.8, z: 0, y: 4.05, width: 3.721, height: 6.954, kind: "junk" },
    { x: 1.55, z: 0, y: 2.45, width: 1.55, height: 2.75, kind: "junk", reverse: true },
  ] },
  scow: { hullHeight: 1.1, sails: [{ x: 0, z: 0, y: 1.75, width: 2.501, height: 2.196, kind: "triangle" }] },
};

export interface GardenFleetProjectedPolygon {
  /** Counterclockwise convex polygon in CSS pixels; only count pairs are live. */
  points: Float64Array;
  count: number;
  area: number;
  clippedArea: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export interface GardenFleetFootprint {
  hull: GardenFleetProjectedPolygon;
  identitySail: GardenFleetProjectedPolygon;
  /** Conservative union envelope including the secondary working sail. */
  sails: GardenFleetProjectedPolygon;
  sailHeightCssPx: number;
  viewDepth: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scratch: Float64Array;
  clipA: Float64Array;
  clipB: Float64Array;
}
function polygon(): GardenFleetProjectedPolygon {
  return { points: new Float64Array(64), count: 0, area: 0, clippedArea: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
}
/** Allocate once per slot; writeGardenFleetFootprint reuses every buffer. */
export function createGardenFleetFootprint(): GardenFleetFootprint {
  return { hull: polygon(), identitySail: polygon(), sails: polygon(), sailHeightCssPx: 0, viewDepth: 0,
    minX: 0, maxX: 0, minY: 0, maxY: 0,
    scratch: new Float64Array(64), clipA: new Float64Array(128), clipB: new Float64Array(128) };
}
function cross(p: Float64Array, a: number, b: number, x: number, y: number): number {
  return (p[b * 2]! - p[a * 2]!) * (y - p[a * 2 + 1]!) - (p[b * 2 + 1]! - p[a * 2 + 1]!) * (x - p[a * 2]!);
}
function area(p: Float64Array, count: number): number {
  let sum = 0;
  for (let i = 0, j = count - 1; i < count; j = i++) sum += p[j * 2]! * p[i * 2 + 1]! - p[i * 2]! * p[j * 2 + 1]!;
  return Math.abs(sum) * 0.5;
}
/** Convex clipping scratch is caller-owned; no per-pair collections. */
export function gardenFleetPolygonOverlap(a: GardenFleetProjectedPolygon, b: GardenFleetProjectedPolygon, scratch: GardenFleetFootprint): number {
  if (!a.count || !b.count || a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) return 0;
  let input = scratch.clipA;
  let output = scratch.clipB;
  let count = a.count;
  for (let i = 0; i < count * 2; i++) input[i] = a.points[i]!;
  for (let edge = 0; edge < b.count && count; edge++) {
    let nextCount = 0;
    const end = (edge + 1) % b.count;
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const x = input[i * 2]!;
      const y = input[i * 2 + 1]!;
      const px = input[j * 2]!;
      const py = input[j * 2 + 1]!;
      const d = cross(b.points, edge, end, x, y);
      const previousD = cross(b.points, edge, end, px, py);
      if ((d >= 0) !== (previousD >= 0)) {
        const t = previousD / (previousD - d);
        output[nextCount * 2] = px + (x - px) * t;
        output[nextCount++ * 2 + 1] = py + (y - py) * t;
      }
      if (d >= 0) { output[nextCount * 2] = x; output[nextCount++ * 2 + 1] = y; }
    }
    count = nextCount;
    const swap = input; input = output; output = swap;
  }
  return area(input, count);
}
function finishPolygon(target: GardenFleetProjectedPolygon, points: Float64Array, count: number, viewport: ScreenPoint, scratch: GardenFleetFootprint): void {
  // Insertion sort at most twenty prism vertices; monotone hull in reused storage.
  for (let i = 1; i < count; i++) {
    const x = points[i * 2]!;
    const y = points[i * 2 + 1]!;
    let j = i;
    while (j && (points[(j - 1) * 2]! > x || (points[(j - 1) * 2] === x && points[(j - 1) * 2 + 1]! > y))) {
      points[j * 2] = points[(j - 1) * 2]!; points[j * 2 + 1] = points[(j - 1) * 2 + 1]!; j--;
    }
    points[j * 2] = x; points[j * 2 + 1] = y;
  }
  const p = target.points;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const x = points[i * 2]!; const y = points[i * 2 + 1]!;
    while (n >= 2 && cross(p, n - 2, n - 1, x, y) <= 0) n--;
    p[n * 2] = x; p[n++ * 2 + 1] = y;
  }
  const lower = n + 1;
  for (let i = count - 2; i >= 0; i--) {
    const x = points[i * 2]!; const y = points[i * 2 + 1]!;
    while (n >= lower && cross(p, n - 2, n - 1, x, y) <= 0) n--;
    p[n * 2] = x; p[n++ * 2 + 1] = y;
  }
  target.count = count ? Math.max(0, n - 1) : 0;
  target.area = area(p, target.count);
  target.minX = target.minY = Infinity; target.maxX = target.maxY = -Infinity;
  for (let i = 0; i < target.count; i++) {
    target.minX = Math.min(target.minX, p[i * 2]!); target.maxX = Math.max(target.maxX, p[i * 2]!);
    target.minY = Math.min(target.minY, p[i * 2 + 1]!); target.maxY = Math.max(target.maxY, p[i * 2 + 1]!);
  }
  // Clip against the actual CSS viewport, not a hit-testing rectangle.
  const clip = viewportPolygon;
  clip.points[2] = clip.points[4] = viewport.x;
  clip.points[5] = clip.points[7] = viewport.y;
  clip.maxX = viewport.x; clip.maxY = viewport.y;
  target.clippedArea = gardenFleetPolygonOverlap(target, clip, scratch);
}
const viewportPolygon = polygon();
viewportPolygon.count = 4;

/** headingRad is the renderer's rotation.y (negative tile-heading angle).
 * Bounded cloth thickness covers belly, luff, yaw and settled sag; conservative
 * envelopes must remain distinct from the orchestrator's real-GPU pixel proof.
 * Optional renderer scale/root height include refresh fades and swell without
 * copying a ShipNode; placement keeps the canonical defaults. */
export function writeGardenFleetFootprint(target: GardenFleetFootprint, ship: ShipNode, tile: ScreenPoint, headingRad: number, camera: IsoCamera, viewport: ScreenPoint, braceRad = shipRestSailBraceRad(ship.id), displayedScale = gardenShipVisualScale(ship.visual.scale), rootY = GARDEN_SHIP_ROOT_Y): GardenFleetFootprint {
  const family = GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull];
  const descriptor = GARDEN_FLEET_FAMILY_ENVELOPES[family];
  const form = ship.visual.hullForm;
  const scale = displayedScale;
  const pose = projectionPose;
  pose.x = tile.x * TILE_SCALE; pose.z = tile.y * TILE_SCALE;
  pose.y = rootY + (form?.waterline ?? 0) * scale;
  pose.length = scale * (form?.length ?? 1); pose.beam = scale * (form?.beam ?? 1);
  pose.height = scale * (form?.height ?? 1);
  pose.cos = Math.cos(headingRad); pose.sin = Math.sin(headingRad);
  pose.camera = camera; pose.viewport = viewport;
  worldScratch.x = pose.x; worldScratch.y = pose.y; worldScratch.z = pose.z;
  target.viewDepth = worldViewDepth(worldScratch, camera, viewport);
  const reach = familyReach[family];
  let n = 0;
  for (let i = 0; i < 8; i++) {
    projectPoint(i & 1 ? reach.x : -reach.x, i & 2 ? descriptor.hullHeight + 0.2 : -0.5,
      i & 4 ? reach.z : -reach.z, target.scratch, n++);
  }
  finishPolygon(target.hull, target.scratch, nearClipPoints(target.scratch, n), viewport, target);
  let all = 0;
  for (let sailIndex = 0; sailIndex < descriptor.sails.length; sailIndex++) {
    const sail = descriptor.sails[sailIndex]!;
    const square = sail.kind === "square";
    const angle = square ? braceRad : (sail.reverse ? -0.05 : 0.05);
    const c = Math.cos(angle); const s = Math.sin(angle);
    const rows = square ? squareOutline : sail.kind === "triangle" ? triangleOutline : junkOutline;
    n = 0;
    for (const [u, v] of rows) for (let side = -1; side <= 1; side += 2) {
      const along = u * sail.width * (sail.reverse ? -1 : 1);
      const thickness = side * (0.24 + sail.width * (square ? 0.2 : 0.14));
      const x = square ? thickness : along + (sail.reverse ? -0.06 : 0.06);
      const z = square ? along : thickness + 0.03;
      projectPoint(sail.x + c * x + s * z, sail.y + v * (sail.height + 0.5), sail.z - s * x + c * z, target.scratch, n++);
    }
    const sailPolygon = sailIndex === 0 ? target.identitySail : workingSailPolygon;
    finishPolygon(sailPolygon, target.scratch, nearClipPoints(target.scratch, n), viewport, target);
    // The whole-rig envelope is the convex union of near-clipped sail polygons.
    for (let i = 0; i < sailPolygon.count * 2; i++) target.sails.points[all * 2 + i] = sailPolygon.points[i]!;
    all += sailPolygon.count;
  }
  for (let i = 0; i < all * 2; i++) target.scratch[i] = target.sails.points[i]!;
  finishPolygon(target.sails, target.scratch, all, viewport, target);
  target.sailHeightCssPx = target.identitySail.clippedArea > 0 ? Math.max(0, Math.min(viewport.y, target.identitySail.maxY) - Math.max(0, target.identitySail.minY)) : 0;
  target.minX = Math.min(target.hull.minX, target.sails.minX);
  target.maxX = Math.max(target.hull.maxX, target.sails.maxX);
  target.minY = Math.min(target.hull.minY, target.sails.minY);
  target.maxY = Math.max(target.hull.maxY, target.sails.maxY);
  return target;
}

/** Same eye/FOV, different CSS crop: perspective coordinates transform affinely.
 * Reuse the landscape projection for its two other gates, never the tall eye. */
export function writeGardenFleetFootprintCrop(target: GardenFleetFootprint, source: GardenFleetFootprint, sourceViewport: ScreenPoint, viewport: ScreenPoint): void {
  const scale = viewport.y / sourceViewport.y;
  for (const key of ["hull", "identitySail", "sails"] as const) {
    const polygon = source[key];
    for (let i = 0; i < polygon.count; i++) {
      target.scratch[i * 2] = (polygon.points[i * 2]! - sourceViewport.x / 2) * scale + viewport.x / 2;
      target.scratch[i * 2 + 1] = polygon.points[i * 2 + 1]! * scale;
    }
    finishPolygon(target[key], target.scratch, polygon.count, viewport, target);
  }
  target.viewDepth = source.viewDepth;
  target.sailHeightCssPx = target.identitySail.clippedArea > 0
    ? Math.max(0, Math.min(viewport.y, target.identitySail.maxY) - Math.max(0, target.identitySail.minY)) : 0;
  target.minX = Math.min(target.hull.minX, target.sails.minX);
  target.maxX = Math.max(target.hull.maxX, target.sails.maxX);
  target.minY = Math.min(target.hull.minY, target.sails.minY);
  target.maxY = Math.max(target.hull.maxY, target.sails.maxY);
}
const worldScratch = { x: 0, y: 0, z: 0 };
const worldVertices = new Float64Array(40);
const workingSailPolygon = polygon();
const projectionPose = { x: 0, y: 0, z: 0, length: 1, beam: 1, height: 1, cos: 1, sin: 0,
  camera: null as unknown as IsoCamera, viewport: { x: 0, y: 0 } };
const familyReach = Object.fromEntries(
  (["bezaisen", "kobaya", "twinhull", "takasebune", "junk", "scow"] as const)
    .map((family) => [family, gardenShipHullReachWorld(1, family, null)]),
) as Record<GardenHullSilhouette, { x: number; z: number }>;
function projectPoint(x: number, y: number, z: number, points: Float64Array, index: number): void {
  const pose = projectionPose;
  const world = worldScratch;
  world.x = pose.x + pose.cos * x * pose.length + pose.sin * z * pose.beam;
  world.y = pose.y + y * pose.height;
  world.z = pose.z - pose.sin * x * pose.length + pose.cos * z * pose.beam;
  const depth = worldViewDepth(world, pose.camera, pose.viewport);
  worldVertices[index * 4] = world.x; worldVertices[index * 4 + 1] = world.y;
  worldVertices[index * 4 + 2] = world.z; worldVertices[index * 4 + 3] = depth;
  const screen = depth >= CAMERA_NEAR ? worldToScreen(world, pose.camera, pose.viewport) : null;
  points[index * 2] = screen?.x ?? 0;
  points[index * 2 + 1] = screen?.y ?? 0;
}

/** Clip a convex prism before perspective division. Every crossing chord lies
 * inside the prism; including all pairs includes its true clipped edges without
 * an edge table or a temporary 3D mesh. This rare path runs only across near. */
function nearClipPoints(points: Float64Array, count: number): number {
  let front = 0;
  for (let i = 0; i < count; i++) {
    if (worldVertices[i * 4 + 3]! < CAMERA_NEAR) continue;
    points[front * 2] = points[i * 2]!; points[front++ * 2 + 1] = points[i * 2 + 1]!;
  }
  if (!front || front === count) return front;
  for (let i = 0; i < count; i++) for (let j = 0; j < i; j++) {
    const a = worldVertices[i * 4 + 3]!; const b = worldVertices[j * 4 + 3]!;
    if ((a >= CAMERA_NEAR) === (b >= CAMERA_NEAR)) continue;
    const t = (CAMERA_NEAR - a) / (b - a);
    worldScratch.x = worldVertices[i * 4]! + (worldVertices[j * 4]! - worldVertices[i * 4]!) * t;
    worldScratch.y = worldVertices[i * 4 + 1]! + (worldVertices[j * 4 + 1]! - worldVertices[i * 4 + 1]!) * t;
    worldScratch.z = worldVertices[i * 4 + 2]! + (worldVertices[j * 4 + 2]! - worldVertices[i * 4 + 2]!) * t;
    const screen = worldToScreen(worldScratch, projectionPose.camera, projectionPose.viewport);
    points[front * 2] = screen.x; points[front++ * 2 + 1] = screen.y;
  }
  return front;
}
const squareOutline = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const;
const triangleOutline = [[0, 0.5], [1, -0.39], [0, -0.5]] as const;
const junkOutline = [[0, 0.5], [0.58, 0.34], [1, -0.08], [0.94, -0.375], [0, -0.5]] as const;

export interface GardenFleetRestView {
  camera: IsoCamera;
  viewport: ScreenPoint;
  intervals: readonly (readonly [number, number])[];
}
let restViews: readonly GardenFleetRestView[] | null = null;
let publishedIntervals: readonly (readonly (readonly [number, number])[])[] | null = null;

/** Protected intervals are chosen from the water the seated fleet leaves free,
 * so they can never be a band the composition has to dodge. Placement
 * publishes them; every consumer reads the same accepted pair. */
export function publishGardenFleetProtectedIntervals(
  perView: readonly (readonly (readonly [number, number])[])[] | null,
): void {
  publishedIntervals = perView;
}

/** Both authored eyes and every gate crop. Intervals are fractions of CSS width. */
export function gardenFleetRestViews(): readonly GardenFleetRestView[] {
  return restViews ??= [[1600, 1000], [1200, 640], [900, 720], [720, 900]].map(([width, height], index) => {
    const viewport = { x: width!, y: height! };
    const aspect = viewport.x / viewport.y;
    const authored = aspect < 1 ? [[0.16, 0.24], [0.48, 0.56]] as const
      : [[0.39, 0.433], [0.55, 0.595]].map(([a, b]) => [0.5 + (a! - 0.5) * 1.6 / aspect, 0.5 + (b! - 0.5) * 1.6 / aspect] as const);
    const view = cameraViewFromAngles(restSeatEyeForAspect(aspect).world, REST_SEAT_YAW_RAD, REST_SEAT_PITCH_RAD, 200, REST_SEAT_VFOV_DEG);
    const camera: IsoCamera = { offsetX: 0, offsetY: 0, zoom: 1, rest: { presence: 1, view } };
    return { camera, viewport, get intervals() { return publishedIntervals?.[index] ?? authored; } };
  });
}
