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
  { bearingStart: radians(-165), bearingEnd: radians(-85) },
  { bearingStart: radians(-50), bearingEnd: radians(-10) },
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
  { bearing: radians(-172), depth: 12 },
  { bearing: radians(-165), depth: 8 },
  { bearing: radians(-85), depth: 8 },
  { bearing: radians(-78), depth: 10 },
  { bearing: radians(-70), depth: 14 },
  { bearing: radians(-62), depth: 11 },
  { bearing: radians(-55), depth: 13 },
  { bearing: radians(-50), depth: 9 },
  { bearing: radians(-10), depth: 7 },
  { bearing: radians(-5), depth: 8 },
  { bearing: radians(0), depth: 6 },
  { bearing: radians(5), depth: 8 },
  { bearing: radians(10), depth: 6 },
  { bearing: radians(15), depth: 8 },
  { bearing: radians(20), depth: 6 },
  { bearing: radians(25), depth: 8 },
  { bearing: radians(30), depth: 6 },
  { bearing: radians(35), depth: 8 },
  { bearing: radians(40), depth: 6 },
  { bearing: radians(46), depth: 8 },
  { bearing: radians(52), depth: 6 },
  { bearing: radians(58), depth: 8 },
  { bearing: radians(64), depth: 6 },
  { bearing: radians(70), depth: 8 },
  { bearing: radians(76), depth: 6 },
  { bearing: radians(82), depth: 8 },
  { bearing: radians(88), depth: 7 },
  { bearing: radians(94), depth: 9 },
  { bearing: radians(100), depth: 8 },
  { bearing: radians(106), depth: 11 },
  { bearing: radians(109), depth: 14 },
  { bearing: radians(112), depth: 12 },
  { bearing: radians(118), depth: 11 },
  { bearing: radians(124), depth: 14 },
  { bearing: radians(130), depth: 12 },
  { bearing: radians(135), depth: 14 },
  { bearing: radians(140), depth: 12 },
  { bearing: radians(145), depth: 14 },
  { bearing: radians(150), depth: 12 },
  { bearing: radians(155), depth: 14 },
  { bearing: radians(160), depth: 12 },
  { bearing: radians(165), depth: 14 },
  { bearing: radians(170), depth: 12 },
  { bearing: radians(175), depth: 14 },
  { bearing: radians(178), depth: 12 },
  { bearing: radians(180), depth: 11 },
] as const;

/** Authored water mouths of the harbor ring, one per rendered berth.
 *
 * The ring is authored as a full circuit: every arc of the rim (west, north,
 * east, south) carries at least one mouth, no three mouths crowd a 30-tile
 * neighbourhood, and the camera-near southern arc carries three of the eight.
 * Eight mouths plus the untouched TON pigeonnier islet is nine berths — the
 * same rendered station count as the twelve-mouth ring it replaces, whose six
 * west-arc mouths left a 111-degree station-free stretch of south rim. Each
 * mouth was field-verified against the authored field: water of its named
 * body, rimShoreDistance in (0, 2], outside both openings, and rim land
 * within 14 tiles landward of the authored seawardBearing.
 *
 * The `alert` body is the one named water left without a mouth. That is a
 * deliberate trade, not an oversight: holding the ring at eight mouths keeps
 * the station count at nine, and `alert` offers 74 valid candidate tiles —
 * far more than the two-tile `danger` and `ledger` bodies the ring therefore
 * keeps — so it is the cheapest mouth to re-add if the cap ever grows. Body
 * diversity stays at six, above the >= 6 gate.
 */
export const RIM_COVES: readonly RimCove[] = [
  // The Mole stands alone: 34 tiles from any other mouth, on the west
  // shore's broadest promontory, with 117 tiles of clear water eastward for
  // the approach. It replaces all four mouths of the retired L2 precinct.
  { id: "ethereum-mole", body: "calm", tile: { x: 15, y: 95 }, seawardBearing: 0, width: 6 },
  { id: "ledger-fog-hook", body: "ledger", tile: { x: 9, y: 54 }, seawardBearing: 0, width: 4 },
  // The north arc's one mouth; the retired alert jetty was its second.
  { id: "warning-stone-notch", body: "warning", tile: { x: 118, y: 10 }, seawardBearing: Math.PI / 2, width: 3 },
  // East extreme: the gorge mouth sits one tile further out than the old
  // (130, 59) authoring so rim land starts immediately landward of the berth.
  { id: "danger-gorge", body: "danger", tile: { x: 131, y: 59 }, seawardBearing: Math.PI, width: 3 },
  { id: "watch-east-bay", body: "watch", tile: { x: 132, y: 80 }, seawardBearing: Math.PI, width: 5 },
  // Camera-near south arc, three mouths strong.
  { id: "watch-south-reed", body: "watch", tile: { x: 122, y: 132 }, seawardBearing: -Math.PI / 2, width: 4 },
  { id: "calm-engawa-south", body: "calm", tile: { x: 60, y: 130 }, seawardBearing: -Math.PI / 2, width: 4 },
  // The best available south-west tile, 5.5 tiles clear of the wreck-scatter
  // graves that carpet the corner; east of x = 30 so the outer fill line
  // never reaches the far western shore.
  { id: "wreck-shoal-east", body: "wreck", tile: { x: 31, y: 125 }, seawardBearing: -Math.PI / 2, width: 3 },
];

/** Notes for the Wave B1 mesh author; the field itself remains authoritative. */
export const RIM_DESIGN_NOTES: readonly string[] = [
  "The upper-left borrowed-horizon opening is twice the width of the off-axis top-right Danger Strait opening; a steep, narrow headland divides them.",
  "The right shore stays thin: two modest headlands interrupt its six-tile recessed bay, with no matching forms on the opposite shore.",
  "The camera-side lower-left is the dominant mass, swelling through several twelve-to-fourteen-tile shoulders into a broad engawa lobe and a pointed promontory.",
  "Wreck Shoal is bitten out of that foreground lobe as an irregular tidal inlet, held by land on its west and south sides rather than enclosed symmetrically.",
  "Short changing slopes join every shoulder and recess; mesh silhouettes should preserve the fukinsei rhythm and avoid a continuous picture-frame wall.",
];

function normaliseBearing(bearing: number): number {
  if (!Number.isFinite(bearing)) return 0;
  let value = (bearing + Math.PI) % TAU;
  if (value < 0) value += TAU;
  return value - Math.PI;
}

export function bearingInsideRimOpening(bearing: number, opening: RimOpening): boolean {
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
  if (RIM_OPENINGS.some((opening) => bearingInsideRimOpening(value, opening))) return 0;

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

function squaredDistanceTransform1d(input: Float64Array, output: Float64Array): void {
  const length = input.length;
  const sites = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  let envelope = 0;
  sites[0] = 0;
  boundaries[0] = Number.NEGATIVE_INFINITY;
  boundaries[1] = Number.POSITIVE_INFINITY;

  for (let point = 1; point < length; point += 1) {
    let site = sites[envelope]!;
    let boundary = ((input[point]! + point * point) - (input[site]! + site * site))
      / (2 * point - 2 * site);
    while (boundary <= boundaries[envelope]!) {
      envelope -= 1;
      site = sites[envelope]!;
      boundary = ((input[point]! + point * point) - (input[site]! + site * site))
        / (2 * point - 2 * site);
    }
    envelope += 1;
    sites[envelope] = point;
    boundaries[envelope] = boundary;
    boundaries[envelope + 1] = Number.POSITIVE_INFINITY;
  }

  envelope = 0;
  for (let point = 0; point < length; point += 1) {
    while (boundaries[envelope + 1]! < point) envelope += 1;
    const site = sites[envelope]!;
    output[point] = (point - site) ** 2 + input[site]!;
  }
}

/** Felzenszwalb/Huttenlocher exact squared-Euclidean transform, two 1-D passes. */
function buildDistanceTo(targetLand: boolean): Float32Array {
  const count = MAP_SIZE * MAP_SIZE;
  const rowPass = new Float64Array(count);
  const squared = new Float64Array(count);
  const input = new Float64Array(MAP_SIZE);
  const output = new Float64Array(MAP_SIZE);
  const unreachable = MAP_SIZE * MAP_SIZE * 4;

  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      input[x] = authoredRimLandAt(x, y) === targetLand ? 0 : unreachable;
    }
    squaredDistanceTransform1d(input, output);
    for (let x = 0; x < MAP_SIZE; x += 1) rowPass[y * MAP_SIZE + x] = output[x]!;
  }
  for (let x = 0; x < MAP_SIZE; x += 1) {
    for (let y = 0; y < MAP_SIZE; y += 1) input[y] = rowPass[y * MAP_SIZE + x]!;
    squaredDistanceTransform1d(input, output);
    for (let y = 0; y < MAP_SIZE; y += 1) squared[y * MAP_SIZE + x] = output[y]!;
  }

  const distance = new Float32Array(count);
  for (let index = 0; index < count; index += 1) distance[index] = Math.sqrt(squared[index]!);
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
 * Signed Euclidean distance to the authored shore, in tiles.
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
