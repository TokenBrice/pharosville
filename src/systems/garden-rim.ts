import { PHAROSVILLE_DESIGN_SPAN, PHAROSVILLE_MAP_SCALE } from "./map-scale";
import type { SeaBodyId } from "./sea-bodies";

export type RimCoveId = string;

export interface RimCove {
  id: RimCoveId;
  body: SeaBodyId;
  /** Shore tile at the cove mouth, on water. */
  tile: { x: number; y: number };
  /** Radians, from shore toward open water. */
  seawardBearing: number;
  /** Mouth width in tiles. */
  width: number;
}

export interface RimOpening {
  /** Inclusive start of the open arc, in radians about the map centre. */
  bearingStart: number;
  /** Inclusive end of the open arc, in radians about the map centre. */
  bearingEnd: number;
}

const MAP_SIZE = PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE;
const MAP_LAST = MAP_SIZE - 1;
const MAP_CENTER = MAP_LAST / 2;
const TAU = Math.PI * 2;
const radians = (degrees: number) => degrees * Math.PI / 180;

/**
 * The two places where the garden water is allowed to run out into fog.
 *
 * The broad north-west opening is the borrowed-horizon view. The narrower
 * north-east opening follows Danger Strait. A short, deep headland separates
 * them so they read as two passages rather than one missing side.
 */
export const RIM_OPENINGS: readonly RimOpening[] = [
  { bearingStart: radians(-158), bearingEnd: radians(-70) },
  { bearingStart: radians(-51), bearingEnd: radians(-18) },
];

interface RimContourPoint {
  bearing: number;
  depth: number;
}

/**
 * Authored shoreline profile, clockwise in screen/map space.
 *
 * These are deliberate banks, shoulders and headlands rather than samples
 * from a noise function. Linear interpolation lets later mesh authors follow
 * the same large shapes without baking tile stair-steps into their geometry.
 */
const RIM_CONTOUR: readonly RimContourPoint[] = [
  { bearing: radians(-180), depth: 11 },
  { bearing: radians(-173), depth: 9 },
  { bearing: radians(-158), depth: 7 },
  { bearing: radians(-70), depth: 8 },
  { bearing: radians(-65), depth: 12 },
  { bearing: radians(-61), depth: 14 },
  { bearing: radians(-51), depth: 9 },
  { bearing: radians(-18), depth: 7 },
  { bearing: radians(-7), depth: 10 },
  { bearing: radians(18), depth: 8 },
  { bearing: radians(31), depth: 8 },
  { bearing: radians(46), depth: 13 },
  { bearing: radians(63), depth: 11 },
  { bearing: radians(78), depth: 14 },
  { bearing: radians(94), depth: 9 },
  { bearing: radians(111), depth: 12 },
  { bearing: radians(126), depth: 10 },
  { bearing: radians(141), depth: 13 },
  { bearing: radians(157), depth: 7 },
  { bearing: radians(171), depth: 9 },
  { bearing: radians(180), depth: 11 },
] as const;

/** Authored water mouths reserved for Wave 3's shore stations. */
export const RIM_COVES: readonly RimCove[] = [
  { id: "ledger-west-hook", body: "ledger", tile: { x: 8, y: 47 }, seawardBearing: 0, width: 4 },
  { id: "calm-west-upper", body: "calm", tile: { x: 9, y: 61 }, seawardBearing: 0, width: 5 },
  { id: "calm-west-lower", body: "calm", tile: { x: 8, y: 91 }, seawardBearing: 0, width: 6 },
  { id: "calm-south-fold", body: "calm", tile: { x: 56, y: 127 }, seawardBearing: -Math.PI / 2, width: 5 },
  { id: "alert-headland", body: "alert", tile: { x: 100, y: 14 }, seawardBearing: Math.PI / 2, width: 3 },
  { id: "warning-headland", body: "warning", tile: { x: 116, y: 10 }, seawardBearing: Math.PI / 2, width: 3 },
  { id: "danger-gorge", body: "danger", tile: { x: 131, y: 50 }, seawardBearing: Math.PI, width: 4 },
  { id: "watch-east-upper", body: "watch", tile: { x: 128, y: 68 }, seawardBearing: Math.PI, width: 4 },
  { id: "watch-east-lower", body: "watch", tile: { x: 131, y: 98 }, seawardBearing: Math.PI, width: 5 },
  { id: "watch-south-reed", body: "watch", tile: { x: 116, y: 126 }, seawardBearing: -Math.PI / 2, width: 4 },
];

/** Notes for the Wave B1 mesh author; the field itself remains authoritative. */
export const RIM_DESIGN_NOTES: readonly string[] = [
  "A broad north-west borrowed-horizon opening and a tighter north-east Danger Strait opening are separated by one steep headland.",
  "The east rim alternates a shallow shelf, a deep pine shoulder, and a recessed lower-east bank; it must not become a smooth wall.",
  "The south rim rises into an off-centre foreground mass, then folds around Wreck Shoal as a west-and-south-sided tidal inlet.",
  "The west rim is lower and broken into long shelves so Calm Anchorage keeps the composition's largest quiet water interval.",
];

function normaliseBearing(bearing: number): number {
  if (!Number.isFinite(bearing)) return 0;
  let value = (bearing + Math.PI) % TAU;
  if (value < 0) value += TAU;
  return value - Math.PI;
}

function bearingInsideOpening(bearing: number, opening: RimOpening): boolean {
  const value = normaliseBearing(bearing);
  const start = normaliseBearing(opening.bearingStart);
  const end = normaliseBearing(opening.bearingEnd);
  return start <= end
    ? value >= start && value <= end
    : value >= start || value <= end;
}

/** Tiles of authored rim depth at a bearing; exactly zero in either opening. */
export function rimDepthAt(bearing: number): number {
  const value = normaliseBearing(bearing);
  if (RIM_OPENINGS.some((opening) => bearingInsideOpening(value, opening))) return 0;

  for (let index = 1; index < RIM_CONTOUR.length; index += 1) {
    const previous = RIM_CONTOUR[index - 1]!;
    const next = RIM_CONTOUR[index]!;
    if (value > next.bearing) continue;
    const span = next.bearing - previous.bearing;
    const progress = span > 0 ? (value - previous.bearing) / span : 0;
    return previous.depth + (next.depth - previous.depth) * progress;
  }
  return RIM_CONTOUR[RIM_CONTOUR.length - 1]!.depth;
}

/**
 * The protected tidal pool at Wreck Shoal.
 *
 * It stops short of both map edges, leaving rim land immediately west and
 * south. Its asymmetric union is hand-shaped around the existing wreck
 * scatter rather than derived from the sea body's noisy partition.
 */
function wreckInletAt(x: number, y: number): boolean {
  const mainPool = ((x - 15.0) / 13.2) ** 2 + ((y - 122.5) / 11.2) ** 2 <= 1;
  const innerMouth = ((x - 25.0) / 8.5) ** 2 + ((y - 116.0) / 6.2) ** 2 <= 1;
  return mainPool || innerMouth;
}

/** The detached messenger islet and its existing wharf keep a water collar. */
function pigeonnierInletAt(x: number, y: number): boolean {
  return Math.hypot(x - 125, y - 125) <= 2.25;
}

function authoredRimLandAt(tileX: number, tileY: number): boolean {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return false;
  if (tileX < 0 || tileY < 0 || tileX > MAP_LAST || tileY > MAP_LAST) return false;
  if (wreckInletAt(tileX, tileY) || pigeonnierInletAt(tileX, tileY)) return false;

  const bearing = Math.atan2(tileY - MAP_CENTER, tileX - MAP_CENTER);
  const depth = rimDepthAt(bearing);
  if (depth <= 0) return false;
  const edgeInset = Math.min(tileX, tileY, MAP_LAST - tileX, MAP_LAST - tileY);
  return edgeInset < depth;
}

/** Authoritative authored land-rim lookup. */
export function rimLandAt(tileX: number, tileY: number): boolean {
  return authoredRimLandAt(tileX, tileY);
}

let signedDistanceField: Float32Array | null = null;

function buildDistanceTo(targetLand: boolean): Uint16Array {
  const count = MAP_SIZE * MAP_SIZE;
  const distance = new Uint16Array(count);
  distance.fill(0xffff);
  const queueX = new Uint16Array(count);
  const queueY = new Uint16Array(count);
  let head = 0;
  let tail = 0;

  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      if (authoredRimLandAt(x, y) !== targetLand) continue;
      const index = y * MAP_SIZE + x;
      distance[index] = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
    }
  }

  const visit = (x: number, y: number, nextDistance: number) => {
    if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return;
    const index = y * MAP_SIZE + x;
    if (distance[index]! <= nextDistance) return;
    distance[index] = nextDistance;
    queueX[tail] = x;
    queueY[tail] = y;
    tail += 1;
  };

  while (head < tail) {
    const x = queueX[head]!;
    const y = queueY[head]!;
    const nextDistance = distance[y * MAP_SIZE + x]! + 1;
    head += 1;
    visit(x - 1, y, nextDistance);
    visit(x + 1, y, nextDistance);
    visit(x, y - 1, nextDistance);
    visit(x, y + 1, nextDistance);
  }
  return distance;
}

function getSignedDistanceField(): Float32Array {
  if (signedDistanceField) return signedDistanceField;
  const toLand = buildDistanceTo(true);
  const toWater = buildDistanceTo(false);
  const field = new Float32Array(MAP_SIZE * MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const index = y * MAP_SIZE + x;
      field[index] = authoredRimLandAt(x, y)
        ? -(toWater[index]! - 0.5)
        : toLand[index]! - 0.5;
    }
  }
  signedDistanceField = field;
  return field;
}

/**
 * Signed Manhattan distance to the authored shore, in tiles.
 *
 * Integer rim cells are negative and integer water cells positive. Bilinear
 * sampling places zero on the conceptual shoreline halfway between adjacent
 * land and water tile centres. The transform is built once on first use.
 */
export function rimShoreDistance(tileX: number, tileY: number): number {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return Number.POSITIVE_INFINITY;
  const x = Math.max(0, Math.min(MAP_LAST, tileX));
  const y = Math.max(0, Math.min(MAP_LAST, tileY));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(MAP_LAST, x0 + 1);
  const y1 = Math.min(MAP_LAST, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const field = getSignedDistanceField();
  const top = field[y0 * MAP_SIZE + x0]! * (1 - tx) + field[y0 * MAP_SIZE + x1]! * tx;
  const bottom = field[y1 * MAP_SIZE + x0]! * (1 - tx) + field[y1 * MAP_SIZE + x1]! * tx;
  return top * (1 - ty) + bottom * ty;
}
