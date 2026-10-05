import {
  BufferAttribute,
  BoxGeometry,
  BufferGeometry,
  Color,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { distanceToStationFootprint, stationFootprintRect } from "../systems/dock-layout";
import {
  RIM_COVES,
  rimDepthAt,
  rimLandAt,
  rimShoreDistance,
} from "../systems/garden-rim";
import {
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
} from "../systems/world-layout";
import { PHAROSVILLE_DESIGN_SPAN, PHAROSVILLE_MAP_SCALE } from "../systems/map-scale";
import { HARBOR_PALETTE } from "../systems/palette";
import { REST_SEAT_EYE_LANDSCAPE, REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import type { WeatherPlan } from "../systems/weather";
import { TILE_SCALE, disposeThreeObjectTree, stableUnit } from "./garden-util";
import {
  createSpeciesBatch,
  GARDEN_FLORA_COLORS,
  patchGardenFloraNight,
  patchGardenFoliage,
  updateGardenInstancedWindSway,
  writeFoliageRanks,
  type SpeciesPlacement,
} from "./garden-flora";
import { createNiwakiPadGeometry } from "./garden-niwaki";
import { createSetStoneGeometry } from "./garden-set-stones";
import { gardenSnowCover } from "../systems/garden-calendar";
import type { GardenSurfaceAtlasOwner } from "./garden-surface-atlas";
import {
  applyGardenSurface,
  GARDEN_SURFACE_ROLE_ATTRIBUTE,
  GARDEN_SURFACE_ROLE_CODES,
  GARDEN_SURFACE_WEIGHT_ATTRIBUTE,
  type GardenSurfaceRole,
} from "./garden-surfaces";
import { chainGardenMaterialPatch } from "./garden-aerial";
import { gardenShoreContactGlsl } from "./garden-water-contract";
export { patchGardenInstancedWindSway, updateGardenInstancedWindSway } from "./garden-flora";

const MAP_SIZE = PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE;
const MAP_LAST = MAP_SIZE - 1;
const WATERLINE_Y = -0.11;
// Reviewed half-tile contour cadence, tightened enough to retain the authored
// irregular shoreline after rectangular station reservations restore detail.
const SAMPLE_STEP = 0.44475;
/** Renderer-only envelope; never a map, water-plate or navigation margin. */
export const GARDEN_DECORATIVE_COAST_ENVELOPE_TILES = 18;
// Unequally spaced (along, reach) knots: long oblique aprons, one deep bite,
// and smaller returns, not repeated scallops at a uniform spatial cadence.
const EXTERIOR_CONTOURS = {
  north: [[0, 3], [74, 4], [100, 18], [125, 5], [139, 3]],
  east: [[0, 3], [52, 4], [103, 17], [126, 2], [139, 10]],
  south: [[0, 14], [38, 18], [79, 2], [115, 9], [139, 12]],
  west: [[0, 4], [48, 7], [86, 18], [112, 2], [132, 11], [139, 14]],
} as const;
/** Shore contour vertices may move this far from their sampled height point. */
const SHORE_VERTEX_MAX_DISPLACEMENT_TILES = 0.72;
// Rim dressing is authored without a live feed. Reserve each complete
// maximum-recipe envelope at its cove-root origin, rotated into the authored
// seaward bearing.
const RIM_STATION_CLEARANCES = [
  ...EVM_BAY_STATION_SLOTS,
  ...OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
].map((slot) => ({
  cove: slot.cove,
  rect: stationFootprintRect(
    slot.type,
    slot.cove.tile,
    slot.cove.seawardBearing,
    slot.cove.id,
  ),
}));
// Decorative garden frame only: rim form, planting, stones, and the stroll
// ribbon carry no market or risk meaning.

const WET_ROCK = new Color(HARBOR_PALETTE.deep_sea_1).lerp(
  new Color(HARBOR_PALETTE.stone_dark),
  0.55,
); // cool wet rock, the shore's one blue-violet note
const TIDE_STAIN = new Color(HARBOR_PALETTE.stone_dark)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.18)
  .multiplyScalar(0.72);
/** Damp earth at the waterline only: the thin margin moss has not taken. */
const DAMP_EARTH = new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.aurora_green), 0.18);
const PATH_STONE = new Color(HARBOR_PALETTE.stone_pale).lerp(
  new Color(HARBOR_PALETTE.roof_thatch),
  0.36,
); // warm sand
const SHORE_SAND = new Color(HARBOR_PALETTE.stone_pale).lerp(
  new Color(HARBOR_PALETTE.roof_thatch),
  0.18,
);
const EXPOSED_ROCK = new Color(HARBOR_PALETTE.stone_mid).lerp(WET_ROCK, 0.36);
const RAKED_GRAVEL = PATH_STONE.clone().lerp(new Color(HARBOR_PALETTE.stone_pale), 0.3);
const PINE_NEEDLE = new Color(HARBOR_PALETTE.aurora_green)
  .multiplyScalar(0.58); // deep pine green
/**
 * garden-6 (W4.G3): sugi-goke in two greens. Yellow-green where the noon
 * sun sits on the slope, cool blue-green in the lee; hummocks swing between
 * them in vertex colour. `MOSS` stays the sunlit green for the ground decals.
 */
const MOSS = new Color(HARBOR_PALETTE.aurora_green)
  .lerp(new Color(HARBOR_PALETTE.stone_mid), 0.3)
  .lerp(PINE_NEEDLE, 0.2)
  .lerp(new Color(HARBOR_PALETTE.sun_day_warm), 0.05);
const SHADE_MOSS = new Color(HARBOR_PALETTE.aurora_green)
  .lerp(PINE_NEEDLE, 0.5)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.35)
  .multiplyScalar(0.8);
/**
 * W4.G2 (garden-4): the far ridges are a pine grove, not a lava lump. Their
 * floor is needle litter under the canopy; rock shows only in the bedded
 * outcrop strata.
 */
const FOREST_FLOOR = PINE_NEEDLE.clone().multiplyScalar(0.62).lerp(new Color(HARBOR_PALETTE.stone_dark), 0.25);
/** Ridge heights over which the moss gives way to the grove floor. */
const GROVE_FLOOR_HEIGHTS = [3.6, 6] as const;
export const GARDEN_RIM_COLOR_HEX = {
  dampEarth: `#${DAMP_EARTH.getHexString()}`,
  moss: `#${MOSS.getHexString()}`,
  shadeMoss: `#${SHADE_MOSS.getHexString()}`,
  pathStone: `#${PATH_STONE.getHexString()}`,
  pineNeedle: `#${PINE_NEEDLE.getHexString()}`,
  wetRock: `#${WET_ROCK.getHexString()}`,
  exposedRock: `#${EXPOSED_ROCK.getHexString()}`,
  rakedGravel: `#${RAKED_GRAVEL.getHexString()}`,
  shoreSand: `#${SHORE_SAND.getHexString()}`,
} as const;
/**
 * Horizontal bearing toward the noon sun (garden-sun's NOON_BEARING, the
 * seat's side light), in tile x/y. Slopes that face it grow the sunlit moss.
 */
const NOON_SUN_TILE = { x: Math.cos(-REST_SEAT_YAW_RAD), y: Math.sin(-REST_SEAT_YAW_RAD) } as const;
/**
 * How far the near-shore band in view of the seat (tiles x 60–120, y 128–139,
 * between the threshold brow and the water) is set down in value. W1 read
 * that band as a sunlit fairway, the brightest land in the frame; the hero
 * and the water it frames should own the light, not the foreground lawn.
 */
const NEAR_SHORE_MOSS_VALUE = 0.4;
/**
 * G3b: planting within this many world units of the seat is set down in
 * value (foliage × NEAR_BAND_FOLIAGE_VALUE at the eye, easing to 1 at the far
 * end), so the near band stays low and dark under the bible's bottom row and
 * the eye goes on to the water and the Pharos.
 */
const NEAR_BAND_FOLIAGE_DISTANCE = [95, 150] as const;
const NEAR_BAND_FOLIAGE_VALUE = 0.5;

function nearBand(placements: readonly SpeciesPlacement[]): SpeciesPlacement[] {
  const eye = REST_SEAT_EYE_LANDSCAPE.world;
  return placements.map((placement) => {
    const distance = Math.hypot(placement.position[0] - eye.x, placement.position[2] - eye.z);
    const far = MathUtils.smoothstep(distance, NEAR_BAND_FOLIAGE_DISTANCE[0], NEAR_BAND_FOLIAGE_DISTANCE[1]);
    return { ...placement, value: NEAR_BAND_FOLIAGE_VALUE + (1 - NEAR_BAND_FOLIAGE_VALUE) * far };
  });
}
/** These camera-side bays displace the former straight shoreline run. */
export const GARDEN_NEAR_RIM_BAY_DEPTHS = [3.2, 4.8, 3.6] as const;
export const GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT = 1.55;
export const GARDEN_NEAR_RIM_DISPLACEMENT = "straight shoreline and ordinary headland pines";
/**
 * The decorative coast displaces outboard open water on all four sides.
 * The viewer's own near garden is the threshold (garden-threshold.ts).
 */
export const GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT = "the open water band beyond the finite chart, on all four sides";
/**
 * Where the rest sight line crosses the south rim (the eye→tower line meets
 * row 134 near x 93): no pine stands in this near-shore clearing, so the
 * approach reads as open water up to the tower foot. It is the old engawa
 * pocket; the veranda, its pine and its tōrō now sit at the viewer's seat.
 */
const SIGHT_LINE_CLEARING = { x: 86, y: 134, radius: 11 } as const;

interface GeometryBuilder {
  colors: number[];
  indices: number[];
  positions: number[];
}

export interface GardenRimMesh {
  /** Momiji instances on the rim; crown colour follows the season (T2.2d). */
  broadleafCount: number;
  coveSpurCount: number;
  drawCallCount: number;
  pathSegmentCount: number;
  pineInstances: InstancedMesh;
  pineCount: number;
  root: Group;
  stoneCount: number;
  steppingStoneCount: number;
  triangleCount: number;
  /** Large clipped karikomi, replacing the micro-dome carpet. */
  understoryCount: number;
  dispose(): void;
  updateWind(weather: WeatherPlan, reducedMotion: boolean): void;
}


function addVertex(builder: GeometryBuilder, x: number, y: number, z: number, color: Color): number {
  const index = builder.positions.length / 3;
  builder.positions.push(x, y, z);
  builder.colors.push(color.r, color.g, color.b);
  return index;
}

function addQuad(
  builder: GeometryBuilder,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
  colors: readonly [Color, Color, Color, Color],
): void {
  const start = builder.positions.length / 3;
  addVertex(builder, ...a, colors[0]);
  addVertex(builder, ...b, colors[1]);
  addVertex(builder, ...c, colors[2]);
  addVertex(builder, ...d, colors[3]);
  builder.indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
}

function finishGeometry(builder: GeometryBuilder): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(builder.positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(builder.colors), 3));
  geometry.setIndex(builder.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function shoreJitter(tileX: number, tileY: number): number {
  // Smooth, sub-tile irregularity: unlike per-cell noise this has a usable
  // gradient, so the mesh can project vertices onto the authored shoreline.
  return Math.sin(tileX * 1.73 + tileY * 0.91) * 0.23
    + Math.sin(tileX * 0.47 - tileY * 1.31) * 0.15;
}

function bell(value: number, centre: number, radius: number): number {
  const distance = Math.abs(value - centre) / radius;
  if (distance >= 1) return 0;
  const t = 1 - distance * distance;
  return t * t;
}

function stationMouthClearance(tileX: number, tileY: number): number {
  return RIM_STATION_CLEARANCES.reduce((closest, station) => Math.min(
    closest,
    distanceToStationFootprint({ x: tileX, y: tileY }, station.rect),
  ), Number.POSITIVE_INFINITY);
}

/**
 * Three camera-side bays cut only INTO the authoritative rim silhouette; no
 * decorative land is projected into navigable water. Station envelopes get a
 * six-tile shoulder, so widened buildings do not acquire a bay through them.
 */
export function gardenRimBayExcursionAt(tileX: number, tileY: number): number {
  if (stationMouthClearance(tileX, tileY) < 6) return 0;
  const south = Math.max(
    bell(tileX, 29, 13) * GARDEN_NEAR_RIM_BAY_DEPTHS[0],
    bell(tileX, 68, 11) * GARDEN_NEAR_RIM_BAY_DEPTHS[1],
    bell(tileX, 108, 12) * GARDEN_NEAR_RIM_BAY_DEPTHS[2],
  ) * bell(tileY, MAP_LAST + 1, 35);
  const west = bell(tileY, 112, 13) * 3.4 * bell(tileX, -1, 25);
  return Math.max(south, west);
}
type ExteriorContour = readonly (readonly [number, number])[];

function contourSlope(knots: ExteriorContour, index: number): number {
  const before = knots[Math.max(0, index - 1)]!;
  const here = knots[index]!;
  const after = knots[Math.min(knots.length - 1, index + 1)]!;
  const left = (here[1] - before[1]) / Math.max(1, here[0] - before[0]);
  const right = (after[1] - here[1]) / Math.max(1, after[0] - here[0]);
  if (index === 0) return right;
  if (index === knots.length - 1) return left;
  return left * right > 0 ? 2 * left * right / (left + right) : 0;
}

/** Monotone Hermite segments keep unequal smooth runs without overshoot. */
function exteriorReach(knots: ExteriorContour, along: number): number {
  const value = MathUtils.clamp(along, 0, MAP_LAST);
  let i = 1;
  while (i < knots.length - 1 && value > knots[i]![0]) i += 1;
  const a = knots[i - 1]!, b = knots[i]!;
  const span = b[0] - a[0], t = (value - a[0]) / span;
  const t2 = t * t, t3 = t2 * t;
  return MathUtils.clamp(
    (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * span * contourSlope(knots, i - 1)
      + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * span * contourSlope(knots, i),
    Math.min(a[1], b[1]), Math.max(a[1], b[1]),
  );
}

function exteriorDistance(tileX: number, tileY: number): number {
  // Boundary water remains water; also preserve the full radial opening
  // corridors, not just their intersections with the square chart border.
  if (rimDepthAt(Math.atan2(tileY - MAP_LAST / 2, tileX - MAP_LAST / 2)) === 0) return 1;
  const north = exteriorReach(EXTERIOR_CONTOURS.north, tileX);
  const east = exteriorReach(EXTERIOR_CONTOURS.east, tileY);
  const south = exteriorReach(EXTERIOR_CONTOURS.south, tileX);
  const west = exteriorReach(EXTERIOR_CONTOURS.west, tileY);
  const outX = Math.max(0, -tileX, tileX - MAP_LAST);
  const outY = Math.max(0, -tileY, tileY - MAP_LAST);
  const reachX = tileX < 0 ? west : east;
  const reachY = tileY < 0 ? north : south;
  // Elliptical unequal corner returns, not the intersection of two straight
  // side extrusions. The authoritative in-chart corner remains untouched.
  const corner = outX > 0 && outY > 0
    ? (Math.hypot(outX / reachX, outY / reachY) - 1) * Math.min(reachX, reachY)
    : Number.NEGATIVE_INFINITY;
  return Math.max(
    -tileY - north,
    tileX - MAP_LAST - east,
    tileY - MAP_LAST - south,
    -tileX - west,
    corner,
  );
}

function authoredDistance(tileX: number, tileY: number): number {
  const field = rimShoreDistance(tileX, tileY) + shoreJitter(tileX, tileY)
    + gardenRimBayExcursionAt(tileX, tileY);
  return tileX < 0 || tileY < 0 || tileX > MAP_LAST || tileY > MAP_LAST
    ? Math.max(field, exteriorDistance(tileX, tileY))
    : field;
}

/** Bedded outcrop strength, 0…1: where the ledges step and rock may show. */
function outcropAt(tileX: number, tileY: number): number {
  return MathUtils.smoothstep(
    Math.sin(tileX * 0.12 + tileY * 0.055) + Math.sin(tileY * 0.17 - 0.8),
    0.35, 1.45,
  );
}

function isFarPair(tileX: number, tileY: number): boolean {
  return Math.min(tileX, tileY) < Math.min(MAP_LAST - tileX, MAP_LAST - tileY);
}

function rimHeight(tileX: number, tileY: number): number {
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  const cameraSide = Math.max(
    bell(tileY, MAP_LAST + 1, 43),
    bell(tileX, -1, 31) * bell(tileY, 106, 53),
  );
  const shoreBase = 0.62 + cameraSide * (GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT - 0.62);
  const rise = shoreBase + MathUtils.smoothstep(inland, 0, 8.5) * 1.3;
  const ledge = outcropAt(tileX, tileY) * (
    MathUtils.smoothstep(inland, 1.2, 1.65) * 0.22
    + MathUtils.smoothstep(inland, 4.1, 4.8) * 0.28
  );
  const dangerCliff = MathUtils.smoothstep(tileX, MAP_LAST - 10, MAP_LAST - 6)
    * MathUtils.smoothstep(tileY, 38, 44)
    * (1 - MathUtils.smoothstep(tileY, 76, 82)) * 0.38;
  const grain = Math.sin(tileX * 0.43 + tileY * 0.31) * 0.045;
  const levelHeight = Math.max(0.6, Math.min(3.1, rise + ledge + dangerCliff + grain));
  const beyond = Math.max(0, -tileX, -tileY, tileX - MAP_LAST, tileY - MAP_LAST);
  if (beyond > 0) {
    const boundaryHeight = rimHeight(MathUtils.clamp(tileX, 0, MAP_LAST), MathUtils.clamp(tileY, 0, MAP_LAST));
    const recede = MathUtils.smoothstep(beyond, 0, GARDEN_DECORATIVE_COAST_ENVELOPE_TILES);
    // Fixed-world northern shoulder replaces the painted near headland.
    // A broad oblique western apron answers it; relief lifts both clear of
    // the sea-level veil without adding lights or changing the chart field.
    const shoulder = (bell(tileX, 98, 26) * bell(tileY, -5, 14) * 17
      + bell(tileX, -8, 20) * bell(tileY, 78, 46) * 8)
      * MathUtils.smoothstep(beyond, 0, 3);
    // Ease the exterior bank into submerged contact instead of leaving a
    // raised cut wall at the outer contour.
    return MathUtils.lerp(WATERLINE_Y - 0.18, Math.max(0.45, boundaryHeight * (1 - recede * 0.65) + shoulder), MathUtils.smoothstep(inland, 0, 2.4));
  }

  // Only the north/west (low-coordinate) rim pair rises. Rim depth controls
  // the broad inland envelope; slow deterministic waves vary its 8–18-unit
  // crest so the unchanged sheet reads as hills rather than a wall.
  const bearing = Math.atan2(tileY - MAP_LAST / 2, tileX - MAP_LAST / 2);
  const depth = rimDepthAt(bearing);
  if (
    !isFarPair(tileX, tileY)
    || depth <= 0
    || stationMouthClearance(tileX, tileY) <= 6 + SHORE_VERTEX_MAX_DISPLACEMENT_TILES
  ) return levelHeight;
  const acrossRim = MathUtils.clamp(inland / depth, 0, 1);
  const ridgeEnvelope = Math.pow(Math.sin(Math.PI * acrossRim), 0.72);
  const lowFrequency = (
    Math.sin(tileX * 0.071 + tileY * 0.043)
    + Math.sin(tileX * 0.027 - tileY * 0.061 + 1.8)
  ) * 0.25 + 0.5;
  const ridgeCrest = 8 + lowFrequency * 10;
  return Math.max(levelHeight, levelHeight + (ridgeCrest - levelHeight) * ridgeEnvelope);
}

/** Integer-lattice hash in [0, 1) for the hummock noise (no texture, no state). */
function latticeUnit(ix: number, iy: number, salt: number): number {
  let hash = Math.imul(ix, 374_761_393) ^ Math.imul(iy, 668_265_263) ^ Math.imul(salt, 1_274_126_177);
  hash = Math.imul(hash ^ (hash >>> 13), 1_103_515_245);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_296;
}

function valueNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = MathUtils.lerp(latticeUnit(ix, iy, salt), latticeUnit(ix + 1, iy, salt), sx);
  const bottom = MathUtils.lerp(latticeUnit(ix, iy + 1, salt), latticeUnit(ix + 1, iy + 1, salt), sx);
  return MathUtils.lerp(top, bottom, sy);
}

/** Two-octave moss hummocks, 0…1: broad cushions with a finer tuft grain. */
function mossHummock(tileX: number, tileY: number): number {
  return valueNoise(tileX / 2.7, tileY / 2.7, 11) * 0.68 + valueNoise(tileX / 0.95, tileY / 0.95, 29) * 0.32;
}

/**
 * 1 everywhere except the near-shore band in view of the seat, feathered at
 * its ends, where it falls to NEAR_SHORE_MOSS_VALUE.
 */
function nearShoreValue(tileX: number, tileY: number): number {
  const along = MathUtils.smoothstep(tileX, 56, 64) * (1 - MathUtils.smoothstep(tileX, 116, 124));
  const depth = MathUtils.smoothstep(tileY, 123, 129);
  return 1 - (1 - NEAR_SHORE_MOSS_VALUE) * along * depth;
}

interface RimSurfaceSample { role: GardenSurfaceRole; weight: number }
const scratchRimShade = new Color();

export function rimColor(
  tileX: number,
  tileY: number,
  target = new Color(),
  surface?: RimSurfaceSample,
): Color {
  const epsilon = 0.35;
  const gradientX = (rimHeight(tileX + epsilon, tileY) - rimHeight(tileX - epsilon, tileY)) / (epsilon * 2 * TILE_SCALE);
  const gradientY = (rimHeight(tileX, tileY + epsilon) - rimHeight(tileX, tileY - epsilon)) / (epsilon * 2 * TILE_SCALE);
  const slope = Math.hypot(gradientX, gradientY);
  const value = nearShoreValue(tileX, tileY);
  // Forecourt gravel stays the palest ground, but in the near band it steps
  // down with the moss so a quay apron never outshines the water beyond it.
  if (stationMouthClearance(tileX, tileY) <= 2.4) {
    if (surface) { surface.role = "gravel"; surface.weight = 1; }
    return target.copy(RAKED_GRAVEL).multiplyScalar(0.4 + value * 0.6);
  }
  const grove = isFarPair(tileX, tileY)
    ? MathUtils.smoothstep(rimHeight(tileX, tileY), GROVE_FLOOR_HEIGHTS[0], GROVE_FLOOR_HEIGHTS[1])
    : 0;
  if (slope > 0.6 && (grove === 0 || outcropAt(tileX, tileY) > 0.7)) {
    if (surface) { surface.role = "stone"; surface.weight = 1; }
    return target.copy(EXPOSED_ROCK);
  }
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  // Sand only in the beach coves, and only at their lip.
  if (inland < 1.1 && coastFormAt(tileX, tileY) === "beach") {
    const sand = shoreBeachWeight(tileX * TILE_SCALE, tileY * TILE_SCALE);
    if (surface) { surface.role = sand >= 0.5 ? "earth" : "stone"; surface.weight = sand >= 0.5 ? sand : 1 - sand; }
    return target.copy(EXPOSED_ROCK).lerp(SHORE_SAND, sand).multiplyScalar(value);
  }
  const hummock = mossHummock(tileX, tileY);
  // The slope's face toward the noon sun, plus the cushions' own lit crowns.
  const sunward = -(gradientX * NOON_SUN_TILE.x + gradientY * NOON_SUN_TILE.y);
  const sunlit = MathUtils.clamp(0.5 + sunward * 2.2 + (hummock - 0.5) * 1.3, 0, 1);
  const mossCoverage = MathUtils.smoothstep(inland, 0.15, 1.4);
  if (surface) {
    const moss = mossCoverage * (1 - grove);
    surface.role = moss >= 0.5 ? "moss" : "earth";
    surface.weight = moss >= 0.5 ? moss : 1 - moss;
  }
  return target.copy(DAMP_EARTH).lerp(
    scratchRimShade.copy(SHADE_MOSS).lerp(MOSS, sunlit),
    mossCoverage,
  ).lerp(FOREST_FLOOR, grove).multiplyScalar((0.9 + hummock * 0.2) * value);
}

/** The rim surface height (world y) at a tile: what furniture beds on. */
export function gardenRimHeightAt(tileX: number, tileY: number): number {
  return rimHeight(tileX, tileY);
}

/**
 * Renderer-only silhouette, bounded symmetrically and never used for tile
 * classification, berths, navigation or eligible-record placement.
 */
export function gardenRimDecorativeLandAt(tileX: number, tileY: number): boolean {
  const limit = GARDEN_DECORATIVE_COAST_ENVELOPE_TILES;
  if (tileX < -limit || tileY < -limit || tileX > MAP_LAST + limit || tileY > MAP_LAST + limit) return false;
  return authoredDistance(tileX, tileY) <= 0;
}

function shoreVertexTile(tileX: number, tileY: number): { x: number; y: number } {
  const quarter = SAMPLE_STEP * 0.5;
  const neighbourhood = [
    gardenRimDecorativeLandAt(tileX - quarter, tileY - quarter),
    gardenRimDecorativeLandAt(tileX + quarter, tileY - quarter),
    gardenRimDecorativeLandAt(tileX - quarter, tileY + quarter),
    gardenRimDecorativeLandAt(tileX + quarter, tileY + quarter),
  ];
  if (neighbourhood.every(Boolean) || neighbourhood.every((land) => !land)) {
    return { x: tileX, y: tileY };
  }
  const epsilon = 0.12;
  const distance = authoredDistance(tileX, tileY);
  const gradientX = (authoredDistance(tileX + epsilon, tileY)
    - authoredDistance(tileX - epsilon, tileY)) / (epsilon * 2);
  const gradientY = (authoredDistance(tileX, tileY + epsilon)
    - authoredDistance(tileX, tileY - epsilon)) / (epsilon * 2);
  const denominator = gradientX * gradientX + gradientY * gradientY;
  if (denominator < 1e-5) return { x: tileX, y: tileY };
  let moveX = -distance * gradientX / denominator;
  let moveY = -distance * gradientY / denominator;
  const move = Math.hypot(moveX, moveY);
  if (move > 0.72) {
    moveX *= 0.72 / move;
    moveY *= 0.72 / move;
  }
  const limit = GARDEN_DECORATIVE_COAST_ENVELOPE_TILES;
  return {
    x: MathUtils.clamp(tileX + moveX, -limit, MAP_LAST + limit),
    y: MathUtils.clamp(tileY + moveY, -limit, MAP_LAST + limit),
  };
}

function pointAtY(
  top: readonly [number, number, number],
  y: number,
): [number, number, number] {
  return [top[0], y, top[2]];
}

export type CoastForm = "beach" | "bedrock" | "revetment";

interface CoastStone {
  outwardX: number;
  outwardZ: number;
  x: number;
  y: number;
}

interface RevetmentBlock extends CoastStone {
  yaw: number;
}

export interface GardenShoreSegment {
  readonly id: string;
  readonly form: CoastForm;
  readonly side: "inner" | "outer" | "quay";
  readonly substrate: "sand" | "bedrock" | "masonry";
  readonly exposure: number;
  readonly start: Readonly<{ x: number; z: number }>;
  readonly end: Readonly<{ x: number; z: number }>;
  readonly bearingStart: number;
  readonly bearingEnd: number;
  /** Quays own their existing reserved footprint plus its 5.5-tile collar. */
  readonly quayIndex: number;
}

function shorePointAt(bearing: number, outer: boolean): Readonly<{ x: number; z: number }> {
  const dx = Math.cos(bearing), dy = Math.sin(bearing), centre = MAP_LAST / 2;
  let radius = 0;
  while (radius < MAP_SIZE && authoredDistance(centre + dx * radius, centre + dy * radius) > 0) radius += 1;
  if (outer) {
    while (radius < MAP_SIZE && authoredDistance(centre + dx * radius, centre + dy * radius) <= 0) radius += 1;
  }
  let low = Math.max(0, radius - 1), high = radius;
  for (let i = 0; i < 10; i += 1) {
    const mid = (low + high) / 2;
    const land = authoredDistance(centre + dx * mid, centre + dy * mid) <= 0;
    if (land === outer) low = mid;
    else high = mid;
  }
  return Object.freeze({ x: (centre + dx * high) * TILE_SCALE, z: (centre + dy * high) * TILE_SCALE });
}

// Clockwise reaches end at the protected openings; no hash-distributed patches.
// Endpoints are shared world-coordinate shore anchors, not navigation geometry.
export const GARDEN_SHORE_SEGMENTS: readonly GardenShoreSegment[] = Object.freeze([
  ...([
    [-180, -165, "bedrock", 0.9], [-85, -50, "bedrock", 1],
    [-10, 35, "bedrock", 0.8], [35, 100, "beach", 0.2],
    [100, 180, "bedrock", 0.8],
  ] as const).flatMap(([from, to, form, exposure], index) => [false, true].map((outer) => Object.freeze({
    id: `${outer ? "outer" : "reach"}-${index}`, side: outer ? "outer" as const : "inner" as const,
    form: outer ? "bedrock" as const : form,
    substrate: !outer && form === "beach" ? "sand" as const : "bedrock" as const,
    exposure: outer ? 1 : exposure,
    start: shorePointAt(from * Math.PI / 180 + (from === -85 || from === -10 ? 0.03 : 1e-6), outer),
    end: shorePointAt(to * Math.PI / 180 - (to === -165 || to === -50 ? 0.03 : 1e-6), outer),
    bearingStart: from * Math.PI / 180, bearingEnd: to * Math.PI / 180, quayIndex: -1,
  }))),
  ...RIM_STATION_CLEARANCES.map(({ cove, rect }, quayIndex) => {
    const dx = Math.cos(cove.seawardBearing), dz = Math.sin(cove.seawardBearing);
    return Object.freeze({
      id: `quay-${cove.id}`, side: "quay" as const, form: "revetment" as const, substrate: "masonry" as const, exposure: 0.35,
      start: Object.freeze({ x: (cove.tile.x - dz * rect.minAcross) * TILE_SCALE, z: (cove.tile.y + dx * rect.minAcross) * TILE_SCALE }),
      end: Object.freeze({ x: (cove.tile.x - dz * rect.maxAcross) * TILE_SCALE, z: (cove.tile.y + dx * rect.maxAcross) * TILE_SCALE }),
      bearingStart: 0, bearingEnd: 0, quayIndex,
    });
  }),
]);
const scratchShoreTile = { x: 0, y: 0 };

/** Continuous mineral-to-sand transport across reach ends and quay collars. */
export function shoreBeachWeight(worldX: number, worldZ: number): number {
  const segment = gardenShoreSegmentAt(worldX, worldZ);
  if (segment?.form !== "beach") return 0;
  const x = worldX / TILE_SCALE - MAP_LAST / 2, y = worldZ / TILE_SCALE - MAP_LAST / 2;
  const bearing = Math.atan2(y, x);
  const endDistance = Math.min(bearing - segment.bearingStart, segment.bearingEnd - bearing) * Math.hypot(x, y);
  let clearance = 7;
  for (const station of RIM_STATION_CLEARANCES) {
    clearance = Math.min(clearance, distanceToStationFootprint(scratchShoreTile, station.rect));
  }
  return MathUtils.smoothstep(endDistance, 0, 3) * MathUtils.smoothstep(clearance, 5.5, 7);
}

/** Sole presentation owner; null in either protected open-sea corridor. */
export function gardenShoreSegmentAt(worldX: number, worldZ: number): GardenShoreSegment | null {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return null;
  const x = worldX / TILE_SCALE, y = worldZ / TILE_SCALE;
  const limit = GARDEN_DECORATIVE_COAST_ENVELOPE_TILES;
  if (x < -limit || y < -limit || x > MAP_LAST + limit || y > MAP_LAST + limit) return null;
  const bearing = Math.atan2(y - MAP_LAST / 2, x - MAP_LAST / 2);
  if (rimDepthAt(bearing) === 0) return null;
  const outer = x < 0 || y < 0 || x > MAP_LAST || y > MAP_LAST;
  scratchShoreTile.x = x;
  scratchShoreTile.y = y;
  let quay: GardenShoreSegment | null = null, closest = 5.5;
  for (const segment of GARDEN_SHORE_SEGMENTS) {
    if (segment.quayIndex < 0 || outer) continue;
    const distance = distanceToStationFootprint(scratchShoreTile, RIM_STATION_CLEARANCES[segment.quayIndex]!.rect);
    if (distance < closest) { closest = distance; quay = segment; }
  }
  if (quay) return quay;
  for (const segment of GARDEN_SHORE_SEGMENTS) {
    if (segment.side === (outer ? "outer" : "inner")
      && bearing >= segment.bearingStart && bearing <= segment.bearingEnd) return segment;
  }
  return null;
}

export interface GardenShoreSample {
  segment: GardenShoreSegment | null;
  depth: number;
  substrate: GardenShoreSegment["substrate"] | null;
  exposure: number;
  state: "dry" | "damp" | "submerged";
}

export const GARDEN_SHORE_CONTACT = Object.freeze({ submergedAbove: -0.02, dryAbove: 0.45 });

/** Writes caller-owned storage. Physical contact only; never the supply tide. */
export function writeGardenShoreSample(
  target: GardenShoreSample, worldX: number, worldY: number, worldZ: number, waterY: number,
): void {
  const segment = gardenShoreSegmentAt(worldX, worldZ);
  const above = Number.isFinite(worldY) && Number.isFinite(waterY) ? worldY - waterY : 0;
  target.segment = segment;
  target.depth = Math.max(0, -above);
  target.substrate = segment?.substrate ?? null;
  target.exposure = segment?.form === "beach"
    ? MathUtils.lerp(0.8, segment.exposure, shoreBeachWeight(worldX, worldZ)) : segment?.exposure ?? 0;
  target.state = above < GARDEN_SHORE_CONTACT.submergedAbove ? "submerged"
    : above <= GARDEN_SHORE_CONTACT.dryAbove ? "damp" : "dry";
}

function coastFormAt(tileX: number, tileY: number): CoastForm {
  return gardenShoreSegmentAt(tileX * TILE_SCALE, tileY * TILE_SCALE)?.form ?? "bedrock";
}

function addShoreCourses(
  builder: GeometryBuilder,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
  topColor: Color,
  outwardX: number,
  outwardZ: number,
  form: CoastForm,
): void {
  const stainY = Math.min(a[1], b[1], 0.34);
  const stainA = pointAtY(a, stainY);
  const stainB = pointAtY(b, stainY);
  const sand = SHORE_SAND.clone().multiplyScalar(nearShoreValue(a[0] / TILE_SCALE, a[2] / TILE_SCALE));
  const dryColor = form === "beach" ? sand : topColor;
  // Side courses face seaward; the top-sheet winding faces inward here.
  addQuad(builder, b, a, stainA, stainB, [dryColor, dryColor, TIDE_STAIN, TIDE_STAIN]);
  addQuad(builder, stainB, stainA, d, c, [TIDE_STAIN, TIDE_STAIN, WET_ROCK, WET_ROCK]);
  // Beaches run two to three tiles seaward; rock forms retain a tight wet toe.
  const shelfA = MathUtils.lerp(0.48, 2.8 * TILE_SCALE, shoreBeachWeight(a[0], a[2]));
  const shelfB = MathUtils.lerp(0.48, 2.8 * TILE_SCALE, shoreBeachWeight(b[0], b[2]));
  const exterior = Math.min(a[0], a[2], b[0], b[2]) < 0
    || Math.max(a[0], a[2], b[0], b[2]) > MAP_LAST * TILE_SCALE;
  const contactY = exterior ? WATERLINE_Y - 0.16 : WATERLINE_Y + 0.045;
  const waterA = pointAtY(a, contactY);
  const waterB = pointAtY(b, contactY);
  const lower = -GARDEN_DECORATIVE_COAST_ENVELOPE_TILES * TILE_SCALE;
  const upper = (MAP_LAST + GARDEN_DECORATIVE_COAST_ENVELOPE_TILES) * TILE_SCALE;
  const outerA: [number, number, number] = [
    MathUtils.clamp(waterA[0] + outwardX * shelfA, lower, upper),
    waterA[1] - 0.025,
    MathUtils.clamp(waterA[2] + outwardZ * shelfA, lower, upper),
  ];
  const outerB: [number, number, number] = [
    MathUtils.clamp(waterB[0] + outwardX * shelfB, lower, upper),
    waterB[1] - 0.025,
    MathUtils.clamp(waterB[2] + outwardZ * shelfB, lower, upper),
  ];
  const toeA = WET_ROCK.clone().lerp(sand, shoreBeachWeight(a[0], a[2]));
  const toeB = WET_ROCK.clone().lerp(sand, shoreBeachWeight(b[0], b[2]));
  const toeStart = builder.indices.length;
  addQuad(builder, waterB, waterA, outerA, outerB, [TIDE_STAIN, TIDE_STAIN, toeA, toeB]);
  // Shore projection can reverse a short lattice edge, and envelope clamps
  // can skew its shelf. Orient each actual toe triangle upward instead of
  // assuming the unprojected lattice edge still determines its winding.
  for (let i = toeStart; i < builder.indices.length; i += 3) {
    const a = builder.indices[i]! * 3, b = builder.indices[i + 1]! * 3, c = builder.indices[i + 2]! * 3;
    // Match the Float32 positions used by finishGeometry/computeVertexNormals,
    // including nearly collinear shelves at a clipped envelope corner.
    const ax = Math.fround(builder.positions[a]!), az = Math.fround(builder.positions[a + 2]!);
    const bx = Math.fround(builder.positions[b]!), bz = Math.fround(builder.positions[b + 2]!);
    const cx = Math.fround(builder.positions[c]!), cz = Math.fround(builder.positions[c + 2]!);
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (up < 0) {
      const second = builder.indices[i + 1]!;
      builder.indices[i + 1] = builder.indices[i + 2]!;
      builder.indices[i + 2] = second;
    }
  }
}

/** Decimation tolerances for merging a 2×2 block of flat inland cells (W8.2). */
const COARSE_HEIGHT_TOLERANCE = 0.06;
const COARSE_COLOR_TOLERANCE = 0.035;

interface LatticeVertex {
  color: Color;
  /** Shore-projected tile position (moved only on coast cells). */
  moved: boolean;
  x: number;
  y: number;
  height: number;
}

/**
 * W8.2 / headroom-7: the land sheet keeps the half-tile lattice only where
 * it earns it. A 2×2 block of cells collapses to one quad when it is fully
 * inland (no coast side, no shore-projected corner) and its five inner
 * lattice points sit within tolerance of the block's bilinear surface in
 * both height and colour — flat moss and gentle slopes. Ridges, ledges,
 * shores and forecourt edges keep full density, so every silhouette stays.
 * Fine cells beside a coarse block snap their mid-edge vertex onto the
 * coarse edge, so the sheet stays watertight with no T-junction cracks.
 */
function buildLandGeometry(): {
  coastStones: CoastStone[];
  decals: { firstTriangle: number; roles: number[] };
  face: BufferGeometry;
  revetments: RevetmentBlock[];
  top: BufferGeometry;
} {
  const top: GeometryBuilder = { colors: [], indices: [], positions: [] };
  const face: GeometryBuilder = { colors: [], indices: [], positions: [] };
  const coastStones: CoastStone[] = [];
  const revetments: RevetmentBlock[] = [];
  const revetmentKeys = new Set<string>();
  const boulderKeys = new Set<string>();
  // Integral negative origin preserves the existing in-chart sample phase.
  const origin = -Math.ceil(GARDEN_DECORATIVE_COAST_ENVELOPE_TILES / (2 * SAMPLE_STEP)) * (2 * SAMPLE_STEP);
  const samples = Math.ceil((MAP_LAST - 2 * origin) / SAMPLE_STEP);
  const side = samples + 1;
  const land = new Uint8Array(samples * samples);
  for (let iy = 0; iy < samples; iy += 1) {
    for (let ix = 0; ix < samples; ix += 1) {
      land[iy * samples + ix] = gardenRimDecorativeLandAt(origin + (ix + 0.5) * SAMPLE_STEP, origin + (iy + 0.5) * SAMPLE_STEP) ? 1 : 0;
    }
  }
  const isLand = (ix: number, iy: number) => ix >= 0 && iy >= 0 && ix < samples && iy < samples && land[iy * samples + ix] === 1;
  // Heights and colours are sampled once per shared lattice corner, so
  // neighbouring cells stay a watertight sheet; local ledges interrupt
  // otherwise continuous earth.
  const lattice = new Map<number, LatticeVertex>();
  const vertexAt = (i: number, j: number): LatticeVertex => {
    const key = j * side + i;
    let vertex = lattice.get(key);
    if (!vertex) {
      const tileX = origin + i * SAMPLE_STEP;
      const tileY = origin + j * SAMPLE_STEP;
      const shore = shoreVertexTile(tileX, tileY);
      vertex = {
        color: rimColor(tileX, tileY),
        height: tileX < 0 || tileY < 0 || tileX > MAP_LAST || tileY > MAP_LAST
          ? rimHeight(shore.x, shore.y) : rimHeight(tileX, tileY),
        moved: shore.x !== tileX || shore.y !== tileY,
        x: shore.x,
        y: shore.y,
      };
      lattice.set(key, vertex);
    }
    return vertex;
  };

  // Broad exterior is coarse; a one-cell contact/silhouette collar stays
  // refined. Blocks never straddle the authoritative chart boundary.
  const apron = new Uint8Array(samples * samples);
  const apronBlocks: Array<{ x: number; y: number; size: number }> = [];
  for (const size of [16, 8, 4]) {
    for (let y = 0; y + size < samples; y += size) {
      for (let x = 0; x + size < samples; x += size) {
        if (!(origin + (x + size) * SAMPLE_STEP < 0 || origin + (y + size) * SAMPLE_STEP < 0
          || origin + x * SAMPLE_STEP > MAP_LAST || origin + y * SAMPLE_STEP > MAP_LAST)) continue;
        let interior = true;
        for (let j = y - 1; j <= y + size && interior; j += 1) {
          for (let i = x - 1; i <= x + size && interior; i += 1) {
            if (!isLand(i, j) || (i >= x && i < x + size && j >= y && j < y + size && apron[j * samples + i])) interior = false;
          }
        }
        if (!interior) continue;
        apronBlocks.push({ x, y, size });
        for (let j = y; j < y + size; j += 1) apron.fill(1, j * samples + x, j * samples + x + size);
      }
    }
  }
  const blocks = Math.ceil(samples / 2);
  const coarse = new Uint8Array(blocks * blocks);
  const isCoarse = (bx: number, by: number) => bx >= 0 && by >= 0 && bx < blocks && by < blocks && coarse[by * blocks + bx] === 1;
  for (let by = 0; by < blocks; by += 1) {
    for (let bx = 0; bx < blocks; bx += 1) {
      const ix = bx * 2;
      const iy = by * 2;
      if (apron[iy * samples + ix]) continue;
      let interior = true;
      for (let dy = -1; dy <= 2 && interior; dy += 1) {
        for (let dx = -1; dx <= 2 && interior; dx += 1) {
          if (!isLand(ix + dx, iy + dy)) interior = false;
        }
      }
      if (!interior) continue;
      const corners = [vertexAt(ix, iy), vertexAt(ix + 2, iy), vertexAt(ix, iy + 2), vertexAt(ix + 2, iy + 2)] as const;
      let flat = corners.every((corner) => !corner.moved);
      // Residual exterior blocks earn refinement only for contact/silhouette,
      // not moss grain or inland height variation. In-chart tolerances hold.
      const exterior = origin + (ix + 2) * SAMPLE_STEP < 0 || origin + (iy + 2) * SAMPLE_STEP < 0
        || origin + ix * SAMPLE_STEP > MAP_LAST || origin + iy * SAMPLE_STEP > MAP_LAST;
      for (let dj = 0; dj <= 2 && flat; dj += 1) {
        for (let di = 0; di <= 2 && flat; di += 1) {
          if ((di & 1) === 0 && (dj & 1) === 0) continue;
          const vertex = vertexAt(ix + di, iy + dj);
          if (vertex.moved) { flat = false; break; }
          if (exterior) continue;
          const u = di / 2;
          const v = dj / 2;
          const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v] as const;
          let height = 0;
          let r = 0;
          let g = 0;
          let b = 0;
          corners.forEach((corner, index) => {
            height += corner.height * weights[index]!;
            r += corner.color.r * weights[index]!;
            g += corner.color.g * weights[index]!;
            b += corner.color.b * weights[index]!;
          });
          if (Math.abs(height - vertex.height) > COARSE_HEIGHT_TOLERANCE
            || Math.abs(r - vertex.color.r) > COARSE_COLOR_TOLERANCE
            || Math.abs(g - vertex.color.g) > COARSE_COLOR_TOLERANCE
            || Math.abs(b - vertex.color.b) > COARSE_COLOR_TOLERANCE) flat = false;
        }
      }
      if (flat) coarse[by * blocks + bx] = 1;
    }
  }

  // A fine cell's mid-edge corner that lies on a coarse block's edge takes
  // the edge's midpoint, so the two meshes share the line exactly.
  const snappedAt = (i: number, j: number): LatticeVertex => {
    const oddI = (i & 1) === 1;
    const oddJ = (j & 1) === 1;
    if (oddI === oddJ) return vertexAt(i, j);
    const onCoarseEdge = oddI
      ? isCoarse((i - 1) / 2, j / 2) || isCoarse((i - 1) / 2, j / 2 - 1)
      : isCoarse(i / 2, (j - 1) / 2) || isCoarse(i / 2 - 1, (j - 1) / 2);
    if (!onCoarseEdge) return vertexAt(i, j);
    const a = oddI ? vertexAt(i - 1, j) : vertexAt(i, j - 1);
    const b = oddI ? vertexAt(i + 1, j) : vertexAt(i, j + 1);
    return {
      color: a.color.clone().lerp(b.color, 0.5),
      height: (a.height + b.height) / 2,
      moved: false,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  };
  const corner = (vertex: LatticeVertex): [number, number, number] => [vertex.x * TILE_SCALE, vertex.height, vertex.y * TILE_SCALE];

  for (const { x, y, size } of apronBlocks) {
    const centre = vertexAt(x + size / 2, y + size / 2);
    const hub = addVertex(top, ...corner(centre), centre.color);
    const border: number[] = [];
    // Shared two-cell border cadence; the intervening fine corner is snapped
    // onto exactly the same segment, just like the existing inland decimation.
    for (const [dx, dy, sx, sy] of [[1, 0, x, y], [0, 1, x + size, y], [-1, 0, x + size, y + size], [0, -1, x, y + size]]) {
      for (let s = 0; s < size; s += 2) {
        const a = vertexAt(sx! + dx! * s, sy! + dy! * s);
        const b = vertexAt(sx! + dx! * (s + 2), sy! + dy! * (s + 2));
        const mid = vertexAt(sx! + dx! * (s + 1), sy! + dy! * (s + 1));
        mid.height = (a.height + b.height) / 2;
        mid.color.copy(a.color).lerp(b.color, 0.5);
        border.push(addVertex(top, ...corner(a), a.color));
      }
    }
    for (let i = 0; i < border.length; i += 1) top.indices.push(hub, border[(i + 1) % border.length]!, border[i]!);
  }
  for (let by = 0; by < blocks; by += 1) {
    for (let bx = 0; bx < blocks; bx += 1) {
      if (!isCoarse(bx, by)) continue;
      const v00 = vertexAt(bx * 2, by * 2);
      const v10 = vertexAt(bx * 2 + 2, by * 2);
      const v11 = vertexAt(bx * 2 + 2, by * 2 + 2);
      const v01 = vertexAt(bx * 2, by * 2 + 2);
      addQuad(top, corner(v00), corner(v10), corner(v11), corner(v01), [v00.color, v10.color, v11.color, v01.color]);
    }
  }
  for (let iy = 0; iy < samples; iy += 1) {
    const cy = origin + (iy + 0.5) * SAMPLE_STEP;
    for (let ix = 0; ix < samples; ix += 1) {
      if (!isLand(ix, iy) || apron[iy * samples + ix] || isCoarse(ix >> 1, iy >> 1)) continue;
      const cx = origin + (ix + 0.5) * SAMPLE_STEP;
      const v00 = snappedAt(ix, iy);
      const v10 = snappedAt(ix + 1, iy);
      const v11 = snappedAt(ix + 1, iy + 1);
      const v01 = snappedAt(ix, iy + 1);
      const p00 = corner(v00);
      const p10 = corner(v10);
      const p11 = corner(v11);
      const p01 = corner(v01);
      addQuad(top, p00, p10, p11, p01, [v00.color, v10.color, v11.color, v01.color]);
      const sides = [
        { dx: -1, dy: 0, a: p01, b: p00 },
        { dx: 1, dy: 0, a: p10, b: p11 },
        { dx: 0, dy: -1, a: p00, b: p10 },
        { dx: 0, dy: 1, a: p11, b: p01 },
      ] as const;
      for (const edge of sides) {
        if (isLand(ix + edge.dx, iy + edge.dy)) continue;
        const form = coastFormAt(cx, cy);
        addShoreCourses(
          face,
          edge.a,
          edge.b,
          pointAtY(edge.b, WATERLINE_Y - 0.35),
          pointAtY(edge.a, WATERLINE_Y - 0.35),
          rimColor(cx, cy),
          edge.dx,
          edge.dy,
          form,
        );
        const midpointX = (edge.a[0] + edge.b[0]) * 0.5;
        const midpointY = (edge.a[2] + edge.b[2]) * 0.5;
        if (form === "revetment") {
          const key = `${Math.round(midpointX / 0.8)}.${Math.round(midpointY / 0.8)}.${edge.dx !== 0 ? "v" : "h"}`;
          if (!revetmentKeys.has(key)) {
            revetmentKeys.add(key);
            revetments.push({
              outwardX: edge.dx,
              outwardZ: edge.dy,
              x: midpointX,
              y: midpointY,
              yaw: edge.dx !== 0 ? Math.PI / 2 : 0,
            });
          }
        } else if (form === "bedrock") {
          const key = `${Math.round(midpointX / (1.15 * TILE_SCALE))}.${Math.round(midpointY / (1.15 * TILE_SCALE))}`;
          if (!boulderKeys.has(key)) {
            boulderKeys.add(key);
            coastStones.push({
              outwardX: edge.dx,
              outwardZ: edge.dy,
              x: midpointX / TILE_SCALE,
              y: midpointY / TILE_SCALE,
            });
          }
        }
      }
    }
  }
  // Flat moss/gravel decals conform to the land and share its vertex-colour draw.
  const decal = [[-1, -0.8], [-0.9, 0.9], [1.2, 0.7], [1, -0.7]] as const;
  const decals = { firstTriangle: top.indices.length / 3, roles: [] as number[] };
  for (const [index, placement] of plantingTiles(90, "ground").entries()) {
    // In the near-shore band the decal takes the band's value, or it would
    // read as a bright patch on the set-down moss.
    const color = (index % 3 === 0 ? RAKED_GRAVEL : MOSS).clone().multiplyScalar(
      nearShoreValue(placement.position[0] / TILE_SCALE, placement.position[2] / TILE_SCALE),
    );
    const corners = decal.map(([dx, dz]): [number, number, number] => {
      const x = placement.position[0] + dx, z = placement.position[2] + dz;
      return [x, rimHeight(x / TILE_SCALE, z / TILE_SCALE) + 0.025, z];
    });
    addQuad(top, corners[0]!, corners[1]!, corners[2]!, corners[3]!, [color, color, color, color]);
    const role = index % 3 === 0 ? GARDEN_SURFACE_ROLE_CODES.gravel : GARDEN_SURFACE_ROLE_CODES.moss;
    decals.roles.push(role, role);
  }
  const topGeometry = finishGeometry(top);
  topGeometry.deleteAttribute("normal");
  const smoothTop = mergeVertices(topGeometry);
  smoothTop.computeVertexNormals();
  topGeometry.dispose();
  return {
    coastStones: coastStones.slice(0, 97),
    decals,
    face: finishGeometry(face),
    revetments: revetments.slice(0, 166),
    top: smoothTop,
  };
}

/**
 * One terrain draw can carry several authored substrates. Split only role
 * boundaries after smoothing, copying normals and indices without changing
 * any coastal position, winding, silhouette or triangle count.
 */
function prepareRimSurfaceGeometry(
  source: BufferGeometry,
  fixedRole?: GardenSurfaceRole,
  decals?: { firstTriangle: number; roles: readonly number[] },
): BufferGeometry {
  const position = source.getAttribute("position");
  if (fixedRole) {
    const roles = new Float32Array(position.count).fill(GARDEN_SURFACE_ROLE_CODES[fixedRole]);
    const weights = new Float32Array(position.count);
    const uv = new Float32Array(position.count * 2);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      weights[vertex] = MathUtils.smoothstep(position.getY(vertex), WATERLINE_Y - 0.2, WATERLINE_Y + 0.5);
      uv[vertex * 2] = position.getX(vertex);
      uv[vertex * 2 + 1] = position.getZ(vertex);
    }
    source.setAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE, new BufferAttribute(roles, 1));
    source.setAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE, new BufferAttribute(weights, 1));
    source.setAttribute("uv", new BufferAttribute(uv, 2));
    return source;
  }
  const normal = source.getAttribute("normal");
  const color = source.getAttribute("color");
  const index = source.getIndex()!;
  const sample: RimSurfaceSample = { role: "moss", weight: 1 };
  const tint = new Color();
  const pool = new Map<number, number>();
  const split = { positions: [] as number[], normals: [] as number[], colors: [] as number[],
    uv: [] as number[], roles: [] as number[], weights: [] as number[], indices: [] as number[] };
  for (let face = 0; face < index.count; face += 3) {
    const a = index.getX(face), b = index.getX(face + 1), c = index.getX(face + 2);
    const decalRole = decals && face / 3 >= decals.firstTriangle
      ? decals.roles[face / 3 - decals.firstTriangle] : undefined;
    let role: number;
    if (decalRole !== undefined) {
      role = decalRole;
      sample.weight = 1;
    } else {
      rimColor((position.getX(a) + position.getX(b) + position.getX(c)) / (3 * TILE_SCALE),
        (position.getZ(a) + position.getZ(b) + position.getZ(c)) / (3 * TILE_SCALE), tint, sample);
      role = GARDEN_SURFACE_ROLE_CODES[sample.role];
    }
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index.getX(face + corner);
      const key = vertex * 7 + role;
      let next = pool.get(key);
      if (next === undefined) {
        next = split.roles.length;
        pool.set(key, next);
        const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
        split.positions.push(x, y, z);
        split.normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
        split.colors.push(color.getX(vertex), color.getY(vertex), color.getZ(vertex));
        split.uv.push(x, z);
        split.roles.push(role);
        // Coastal contact stays statically wet/dark; no new tide or emission.
        split.weights.push(sample.weight * MathUtils.smoothstep(y, WATERLINE_Y - 0.2, WATERLINE_Y + 0.5));
      }
      split.indices.push(next);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(split.positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(split.normals), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(split.colors), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(split.uv), 2));
  geometry.setAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE, new BufferAttribute(new Float32Array(split.roles), 1));
  geometry.setAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE, new BufferAttribute(new Float32Array(split.weights), 1));
  geometry.setIndex(split.indices);
  geometry.boundingSphere = source.boundingSphere;
  geometry.boundingBox = source.boundingBox;
  source.dispose();
  return geometry;
}



function clearOfStation(tileX: number, tileY: number, extra = 0): boolean {
  return RIM_STATION_CLEARANCES.every((station) => (
    distanceToStationFootprint({ x: tileX, y: tileY }, station.rect) > extra
  ));
}

interface PlantSpot {
  x: number;
  y: number;
}

/**
 * Where planting may stand: authored land (or the camera-side skirt), at
 * least `inland` tiles from the water, clear of every station envelope and
 * of the rest sight line, and off the headland stone triads.
 */
function plantable(x: number, y: number, inland: number, clearance = 3): boolean {
  if (x < 0 || y < 0) return false;
  const inBounds = x <= MAP_LAST && y <= MAP_LAST;
  if (inBounds ? !rimLandAt(x, y) : !gardenRimDecorativeLandAt(x, y)) return false;
  if (authoredDistance(x, y) > -inland || !clearOfStation(x, y, clearance)) return false;
  if (Math.hypot(x - SIGHT_LINE_CLEARING.x, y - SIGHT_LINE_CLEARING.y) < SIGHT_LINE_CLEARING.radius) return false;
  return !HEADLANDS.some((headland) => Math.hypot(x - headland.x, y - headland.y) < 3.2);
}

/**
 * An odd group of up to `count` spots gathered around `anchor`: a jittered
 * golden-angle spiral, no two closer than `spacing` tiles. A gardener's
 * group, not a lattice — the members are unequal and the gaps breathe.
 */
function gatherGroup(
  anchor: PlantSpot,
  count: number,
  spacing: number,
  seed: string,
  accept: (x: number, y: number) => boolean,
): PlantSpot[] {
  const spots: PlantSpot[] = [];
  for (let k = 0; spots.length < count && k < count * 30; k += 1) {
    const angle = k * 2.39996 + stableUnit(`${seed}.a.${k}`) * 0.9;
    const radius = spacing * (0.2 + Math.sqrt(k) * 0.62) * (0.8 + stableUnit(`${seed}.r.${k}`) * 0.4);
    const x = anchor.x + Math.cos(angle) * radius;
    const y = anchor.y + Math.sin(angle) * radius;
    if (!accept(x, y) || spots.some((spot) => Math.hypot(spot.x - x, spot.y - y) < spacing)) continue;
    spots.push({ x, y });
  }
  if (spots.length > 1 && spots.length % 2 === 0) spots.pop();
  return spots;
}

/** Unit seaward direction at a tile (the authored distance field's gradient). */
function seawardAt(x: number, y: number): PlantSpot {
  const epsilon = 0.4;
  const gx = authoredDistance(x + epsilon, y) - authoredDistance(x - epsilon, y);
  const gy = authoredDistance(x, y + epsilon) - authoredDistance(x, y - epsilon);
  const length = Math.hypot(gx, gy) || 1;
  return { x: gx / length, y: gy / length };
}

interface PineGroup {
  anchor: PlantSpot;
  count: number;
  /** Instance scale range (the rim pine is 4.5 u tall at 1). */
  scale: readonly [number, number];
  spacing: number;
  /** Ridge groves stand on the far hills, never on the level shore. */
  ridge?: boolean;
}

/**
 * W4.G1 / garden-master-4: pine 120 → 45 in odd groups, placed where the
 * seat looks. The far-west ridge carries the massed grove (garden-4) left of
 * the tower; the north ridge answers it on the right; two small groups hold
 * the near shore; the rest of the ring gets a few groups for the whole map
 * (two of them on the camera-side skirt, off the rest frame).
 */
const PINE_GROUPS: readonly PineGroup[] = [
  { anchor: { x: 6, y: 63 }, count: 7, scale: [1.4, 2.2], spacing: 1.7, ridge: true },
  { anchor: { x: 5, y: 72 }, count: 5, scale: [1.3, 2.0], spacing: 1.8, ridge: true },
  { anchor: { x: 8, y: 80 }, count: 3, scale: [1.3, 1.9], spacing: 1.9, ridge: true },
  { anchor: { x: 88, y: 5 }, count: 5, scale: [1.3, 2.0], spacing: 1.8, ridge: true },
  { anchor: { x: 96, y: 6 }, count: 3, scale: [1.3, 1.9], spacing: 1.9, ridge: true },
  { anchor: { x: 84, y: 9 }, count: 1, scale: [1.8, 2.2], spacing: 2, ridge: true },
  // The near band keeps one small group framing the left edge of the rest
  // view (the hero, this subordinate and a maple). The near-right shore holds
  // no tree: anything standing there crosses the bay and the right third,
  // so it keeps only the low karikomi wave (G3b).
  { anchor: { x: 52, y: 134.5 }, count: 1, scale: [0.95, 1.05], spacing: 2 },
  { anchor: { x: 136, y: 84 }, count: 5, scale: [1.0, 1.5], spacing: 2.4 },
  { anchor: { x: 140, y: 68 }, count: 3, scale: [1.2, 1.7], spacing: 2.4 },
  { anchor: { x: 142, y: 104 }, count: 3, scale: [0.9, 1.25], spacing: 2.6 },
  { anchor: { x: 126, y: 142 }, count: 5, scale: [0.9, 1.25], spacing: 2.6 },
  { anchor: { x: 10, y: 137 }, count: 1, scale: [1.2, 1.5], spacing: 2 },
];

/** Three heroes at the viewpoints: by the Mole, the near shore, the north headland. */
const HERO_PINES: readonly { anchor: PlantSpot; scale: number }[] = [
  { anchor: { x: 9, y: 108.5 }, scale: 2.5 },
  { anchor: { x: 55, y: 132 }, scale: 1.8 },
  { anchor: { x: 79, y: 8 }, scale: 2.6 },
];

function rimPinePlacements(): SpeciesPlacement[] {
  const placements: SpeciesPlacement[] = [];
  PINE_GROUPS.forEach((group, groupIndex) => {
    const seed = `rim-pine-group.${groupIndex}`;
    const spots = gatherGroup(group.anchor, group.count, group.spacing, seed, (x, y) => (
      plantable(x, y, group.ridge ? 3 : 2.2) && (!group.ridge || rimHeight(x, y) > 3.5)
    ));
    spots.forEach((spot, member) => {
      const unit = stableUnit(`${seed}.scale.${member}`);
      // The group's first member is its tallest: one dominant, the rest unequal.
      const scale = member === 0 ? group.scale[1] : group.scale[0] + (group.scale[1] - group.scale[0]) * unit * 0.8;
      placements.push({
        // Ridge pines stand down inside the canopy: their tiers rise out of the
        // grove as lumps in its crown line, never as caps on bare stems.
        position: [spot.x * TILE_SCALE, rimHeight(spot.x, spot.y) - (group.ridge ? scale * 1.9 : 0), spot.y * TILE_SCALE],
        scale,
        yaw: stableUnit(`${seed}.yaw.${member}`) * Math.PI * 2,
      });
    });
  });
  HERO_PINES.forEach((hero, index) => {
    const [spot] = gatherGroup(hero.anchor, 1, 1, `rim-hero-pine.${index}`, (x, y) => plantable(x, y, 1.6));
    if (!spot) return;
    // The trunk's authored lean (+x local) and the sashi-eda turn seaward;
    // the hero then leans a further ~10° out over the water.
    const seaward = seawardAt(spot.x, spot.y);
    placements.push({
      position: [spot.x * TILE_SCALE, rimHeight(spot.x, spot.y), spot.y * TILE_SCALE],
      scale: hero.scale,
      yaw: Math.atan2(-seaward.y, seaward.x),
      leanZ: -0.17,
    });
  });
  return placements;
}

interface Planting {
  anchor: PlantSpot;
  count: number;
  spacing: number;
  /** Specimens stand this near the water (tiles inland, min … max). */
  inland: readonly [number, number];
}

/**
 * garden-master-4: momiji 40 → 5 and cherry 20 → 3, specimens at the
 * viewpoints. One maple under the near-left hero pine, a group of three on
 * the east ring by the water; three cherries for the whole-map ring, off
 * the rest frame.
 */
const MOMIJI_PLANTING: readonly Planting[] = [
  { anchor: { x: 49, y: 136 }, count: 1, spacing: 1.6, inland: [1.2, 4] },
  { anchor: { x: 134, y: 112 }, count: 3, spacing: 1.6, inland: [1.2, 4] },
  { anchor: { x: 132, y: 128 }, count: 1, spacing: 1.6, inland: [1.2, 4] },
];
const CHERRY_PLANTING: readonly Planting[] = [
  { anchor: { x: 117, y: 140 }, count: 1, spacing: 1.6, inland: [1.2, 4] },
  { anchor: { x: 16, y: 138 }, count: 1, spacing: 1.6, inland: [1.2, 4] },
  { anchor: { x: 140, y: 64 }, count: 1, spacing: 1.6, inland: [1.2, 4] },
];
/**
 * garden-8: bamboo 35 clumps → two groves, each behind one station, off
 * the ridge crests: five clumps behind the hatago wharf (the one in the rest
 * frame, at the foot of the west grove), three behind the uogashi.
 */
const BAMBOO_GROVES: readonly Planting[] = [
  { anchor: { x: 3, y: 61 }, count: 5, spacing: 0.9, inland: [2, 12] },
  { anchor: { x: 142, y: 88 }, count: 3, spacing: 0.9, inland: [2, 12] },
];

function specimenPlacements(plantings: readonly Planting[], species: string, scale: readonly [number, number]): SpeciesPlacement[] {
  const placements: SpeciesPlacement[] = [];
  plantings.forEach((planting, plantingIndex) => {
    const seed = `rim-${species}.${plantingIndex}`;
    const spots = gatherGroup(planting.anchor, planting.count, planting.spacing, seed, (x, y) => (
      plantable(x, y, planting.inland[0]) && authoredDistance(x, y) >= -planting.inland[1] && rimHeight(x, y) < 3.2
    ));
    spots.forEach((spot, member) => {
      placements.push({
        position: [spot.x * TILE_SCALE, rimHeight(spot.x, spot.y), spot.y * TILE_SCALE],
        scale: scale[0] + (scale[1] - scale[0]) * stableUnit(`${seed}.scale.${member}`),
        seed: `${seed}.${member}`,
        yaw: stableUnit(`${seed}.yaw.${member}`) * Math.PI * 2,
      });
    });
  });
  return placements;
}

/**
 * garden-8: karikomi 80 → 40 segments chained into ō-karikomi waves of 7 /
 * 5 / 3 along the shore: long, low, overlapping, their size rising and
 * falling like a slow swell. The near-right wave replaces the lime domes.
 */
const KARIKOMI_WAVES: readonly { anchor: PlantSpot; count: number }[] = [
  { anchor: { x: 101, y: 136.5 }, count: 7 },
  { anchor: { x: 67, y: 136 }, count: 5 },
  { anchor: { x: 48, y: 137 }, count: 5 },
  { anchor: { x: 136, y: 96 }, count: 7 },
  { anchor: { x: 111, y: 5 }, count: 5 },
  { anchor: { x: 110, y: 135.5 }, count: 5 },
  { anchor: { x: 5, y: 79 }, count: 3 },
  { anchor: { x: 132, y: 128 }, count: 3 },
  { anchor: { x: 139, y: 110 }, count: 5 },
  { anchor: { x: 26, y: 137 }, count: 3 },
];
/** Along-chain step between segment centres, world units (segments are ~3.6 u long). */
const KARIKOMI_STEP = 2.3;

function karikomiPlacements(): SpeciesPlacement[] {
  const placements: SpeciesPlacement[] = [];
  KARIKOMI_WAVES.forEach((wave, waveIndex) => {
    const seed = `rim-karikomi.${waveIndex}`;
    const [start] = gatherGroup(wave.anchor, 1, 1, `${seed}.start`, (x, y) => plantable(x, y, 1, 2));
    if (!start) return;
    const seaward = seawardAt(start.x, start.y);
    const along = { x: -seaward.y, y: seaward.x };
    const stepTiles = KARIKOMI_STEP / TILE_SCALE;
    // Grow the chain outward from its start, alternating sides, skipping
    // any segment that would leave the ground, until the wave is complete.
    let placed = 0;
    for (let step = 0; placed < wave.count && step <= wave.count * 2; step += 1) {
      const slot = step % 2 === 0 ? step / 2 : -(step + 1) / 2;
      const offset = slot * stepTiles;
      const sway = Math.sin(slot * 1.1 + waveIndex) * 0.35;
      const x = start.x + along.x * offset - seaward.x * sway;
      const y = start.y + along.y * offset - seaward.y * sway;
      if (!plantable(x, y, 0.8, 2) || rimHeight(x, y) > 3.2) continue;
      const swell = 0.5 + 0.5 * Math.sin(slot * 1.3 + waveIndex * 0.7);
      placements.push({
        position: [x * TILE_SCALE, rimHeight(x, y) - 0.05, y * TILE_SCALE],
        scale: 0.78 + swell * 0.5 + stableUnit(`${seed}.${slot}`) * 0.1,
        yaw: Math.atan2(-along.y, along.x) + (stableUnit(`${seed}.yaw.${slot}`) - 0.5) * 0.5,
      });
      placed += 1;
    }
  });
  return placements;
}

/**
 * W4.G2 (garden-4): the ridge grove's canopy — overlapping flattened crowns
 * stepping up both far ridges so the hill reads as one dark massed grove
 * that recedes into the air, with the ridge pines breaking its line. Chosen
 * by low-frequency noise, not a stride, so clumps and clearings alternate.
 */
const RIDGE_BOXES = [
  { minX: 0.5, maxX: 16, minY: 44, maxY: 92 },
  { minX: 60, maxX: 110, minY: 0.5, maxY: 16 },
] as const;
const GARDEN_RIM_RIDGE_CANOPY_MAX = 56;

function ridgeCanopyPlacements(): SpeciesPlacement[] {
  const spots: Array<PlantSpot & { height: number }> = [];
  for (const box of RIDGE_BOXES) {
    for (let y = box.minY; y <= box.maxY; y += 1.3) {
      for (let x = box.minX; x <= box.maxX; x += 1.3) {
        const jx = x + (stableUnit(`ridge-canopy.jx.${x}.${y}`) - 0.5) * 1.1;
        const jy = y + (stableUnit(`ridge-canopy.jy.${x}.${y}`) - 0.5) * 1.1;
        const height = rimHeight(jx, jy);
        if (height < 4.5 || !plantable(jx, jy, 2.5, 4)) continue;
        const clump = Math.sin(jx * 0.31 + jy * 0.17) * 0.5 + Math.sin(jx * 0.13 - jy * 0.29 + 1.1) * 0.5;
        if (clump < -0.15) continue;
        if (spots.some((spot) => Math.hypot(spot.x - jx, spot.y - jy) < 2.1)) continue;
        spots.push({ x: jx, y: jy, height });
      }
    }
  }
  // The highest crowns first: the grove masses up the slope to the crest.
  spots.sort((a, b) => b.height - a.height);
  return spots.slice(0, GARDEN_RIM_RIDGE_CANOPY_MAX).map((spot, index) => ({
    position: [spot.x * TILE_SCALE, spot.height - 0.35, spot.y * TILE_SCALE],
    scale: 2.3 + stableUnit(`ridge-canopy.scale.${index}`) * 1.3,
    yaw: stableUnit(`ridge-canopy.yaw.${index}`) * Math.PI * 2,
  }));
}

function createRidgeCanopy(placements: readonly SpeciesPlacement[], snow: number): InstancedMesh {
  const geometry = createNiwakiPadGeometry("ridge-canopy", new Vector3(1.6, 0.62, 1.3), new Color(1, 1, 1), 0);
  const padOfVertex = new Int16Array(geometry.getAttribute("position").count);
  writeFoliageRanks(geometry, padOfVertex, 1, "ridge-canopy");
  const material = new MeshStandardMaterial({ flatShading: false, roughness: 0.98, vertexColors: true });
  patchGardenFloraNight(material);
  patchGardenFoliage(material, snow);
  const mesh = new InstancedMesh(geometry, material, placements.length);
  mesh.name = "garden-rim-ridge-grove";
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const color = new Color();
  // Deeper than the specimen pines: the grove is shade seen from outside.
  const canopy = GARDEN_FLORA_COLORS.needle.clone().multiplyScalar(0.78);
  placements.forEach((placement, index) => {
    quaternion.setFromAxisAngle(new Vector3(0, 1, 0), placement.yaw ?? 0);
    matrix.compose(new Vector3(...placement.position), quaternion, scale.setScalar(placement.scale ?? 1));
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.copy(canopy).multiplyScalar(0.88 + stableUnit(`ridge-canopy.tone.${index}`) * 0.24));
  });
  geometry.setAttribute("aGardenLeaf", new InstancedBufferAttribute(new Float32Array(placements.length).fill(1), 1));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function plantingTiles(count: number, seed: string): SpeciesPlacement[] {
  const spots: SpeciesPlacement[] = [];
  for (let y = 4.5; y < MAP_LAST - 2; y += 1.5) {
    for (let x = 4.5; x < MAP_LAST - 2; x += 1.5) {
      if (!rimLandAt(x, y) || authoredDistance(x, y) > -2 || !clearOfStation(x, y, 3)) continue;
      if (HEADLANDS.some((headland) => Math.hypot(x - headland.x, y - headland.y) < 4.5)) continue;
      if (Math.hypot(x - SIGHT_LINE_CLEARING.x, y - SIGHT_LINE_CLEARING.y) < SIGHT_LINE_CLEARING.radius) continue;
      spots.push({ position: [x * TILE_SCALE, rimHeight(x, y), y * TILE_SCALE], yaw: stableUnit(`${seed}.${x}.${y}`) * Math.PI * 2 });
    }
  }
  spots.sort((a, b) => stableUnit(`${seed}.${a.position}`) - stableUnit(`${seed}.${b.position}`));
  return spots.slice(0, count);
}


const HEADLANDS = [
  { x: 5, y: 110 },
  { x: 78, y: 4 },
  { x: 135, y: 100 },
  { x: 43, y: 136 },
  { x: 94, y: 136 },
] as const;

/**
 * Deterministic skirt boulders: a few of the same dodecahedron stones
 * continuing the headland vocabulary across the camera-side apron. Anchors
 * skip the Danger Strait stretch of the east boundary (open sea in the
 * authored field, so no skirt land); the land and station tests drop any
 * generated anchor that lands on skirt water or a berth envelope. The five
 * HEADLANDS above are the coast's fukinsei punctuation, not scatter candidates;
 * their triads are deliberately retained and independently guarded by the
 * footprint test rather than silently smoothing a future coast.
 */
function skirtStoneTiles(): Array<{ x: number; y: number }> {
  const anchors = [
    { axis: "south", at: 22 },
    { axis: "south", at: 58 },
    { axis: "south", at: 94 },
    { axis: "south", at: 126 },
    { axis: "east", at: 24 },
    { axis: "east", at: 122 },
  ] as const;
  const spots: Array<{ x: number; y: number }> = [];
  for (const anchor of anchors) {
    const along = anchor.at
      + (stableUnit(`rim-skirt-stone-along.${anchor.axis}.${anchor.at}`) - 0.5) * 6;
    const out = MAP_LAST + 1.3
      + stableUnit(`rim-skirt-stone-out.${anchor.axis}.${anchor.at}`) * 2.4;
    const x = anchor.axis === "south" ? along : out;
    const y = anchor.axis === "south" ? out : along;
    if (!gardenRimDecorativeLandAt(x, y) || authoredDistance(x, y) > -0.7) continue;
    if (!clearOfStation(x, y)) continue;
    spots.push({ x, y });
  }
  return spots;
}

// The small interior margin keeps Float32 instance translations inside the
// authored envelope even when a boundary is not exactly representable.
const TOE_STONE_MIN_WORLD = -GARDEN_DECORATIVE_COAST_ENVELOPE_TILES * TILE_SCALE + 0.0001;
const TOE_STONE_MAX_WORLD = (MAP_LAST + GARDEN_DECORATIVE_COAST_ENVELOPE_TILES) * TILE_SCALE - 0.0001;

function toeStoneCoordinate(tile: number, outward: number): number {
  return Math.fround(MathUtils.clamp(tile * TILE_SCALE + outward * 0.22, TOE_STONE_MIN_WORLD, TOE_STONE_MAX_WORLD));
}

function createStones(coastStones: readonly CoastStone[]): InstancedMesh {
  const steppingStones = [
    { scale: [1.05, 0.28, 0.82] as const, x: 82.4, y: 131.4, yaw: -0.18 },
    { scale: [0.86, 0.22, 1.08] as const, x: 81.7, y: 129.0, yaw: 0.31 },
    { scale: [1.12, 0.25, 0.72] as const, x: 82.6, y: 126.6, yaw: -0.42 },
  ].filter((stone) => clearOfStation(stone.x, stone.y));
  const skirtStones = skirtStoneTiles();
  // garden-5: the boulder toe gathers into unequal groups with open shore
  // between them (ma) instead of a dotted line of equal eggs. A slow swell
  // along the coast picks the groups and makes one stone of each dominant.
  const toeGroup = (spot: CoastStone) => Math.sin(spot.x * 0.23 + spot.y * 0.19) * 0.5 + 0.5;
  // Use the emitted centre for admission: outboard coast anchors must not
  // be clamped back into the chart or allowed through a station footprint.
  const toe = coastStones.filter((spot) => toeGroup(spot) >= 0.4 && clearOfStation(
    toeStoneCoordinate(spot.x, spot.outwardX) / TILE_SCALE,
    toeStoneCoordinate(spot.y, spot.outwardZ) / TILE_SCALE, 0.1,
  ));
  const count = HEADLANDS.length * 3 + steppingStones.length + skirtStones.length + toe.length;
  // W4.G4: set stones — flat-topped, bedded, moss on the crown, wet at the
  // foot, a third buried — smooth-shaded. One low form; instance scale makes
  // the triad's tall father stone and its reclining companions.
  const geometry = createSetStoneGeometry("rim-stone", "low", 2);
  geometry.scale(0.72, 0.72, 0.72);
  const mesh = new InstancedMesh(
    geometry,
    new MeshStandardMaterial({ roughness: 1, vertexColors: true }),
    count,
  );
  mesh.name = "garden-rim-stones";
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const rotation = new Euler();
  const scale = new Vector3();
  let index = 0;
  for (const [triad, center] of HEADLANDS.entries()) {
    for (let member = 0; member < 3; member += 1) {
      const angle = triad * 1.7 + member * 2.25;
      const radius = member === 0 ? 0 : 1.05;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      // Companions lean ~8–12° in toward the father stone (sanzon triad).
      rotation.set(
        member === 0 ? 0.05 : 0.18,
        angle,
        member === 0 ? -0.06 : 0.1,
      );
      quaternion.setFromEuler(rotation);
      scale.set(member === 0 ? 0.85 : 1.1, member === 0 ? 1.9 : 0.62, member === 0 ? 0.72 : 0.9);
      matrix.compose(new Vector3(x * TILE_SCALE, rimHeight(x, y) - 0.04, y * TILE_SCALE), quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  for (const step of steppingStones) {
    rotation.set(0.05, step.yaw, -0.04);
    quaternion.setFromEuler(rotation);
    scale.set(step.scale[0], step.scale[1], step.scale[2]);
    matrix.compose(
      new Vector3(step.x * TILE_SCALE, WATERLINE_Y + 0.12, step.y * TILE_SCALE),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
    index += 1;
  }
  for (const spot of skirtStones) {
    rotation.set(0.1, stableUnit(`rim-skirt-stone-yaw.${spot.x}.${spot.y}`) * Math.PI * 2, 0.06);
    quaternion.setFromEuler(rotation);
    scale.set(0.62, 0.55, 0.88);
    matrix.compose(
      new Vector3(spot.x * TILE_SCALE, rimHeight(spot.x, spot.y) - 0.04, spot.y * TILE_SCALE),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
    index += 1;
  }
  for (const spot of toe) {
    const seed = `${spot.x.toFixed(2)}.${spot.y.toFixed(2)}`;
    rotation.set(
      0.06 + stableUnit(`rim-boulder-pitch.${seed}`) * 0.14,
      stableUnit(`rim-boulder-yaw.${seed}`) * Math.PI * 2,
      0.05,
    );
    quaternion.setFromEuler(rotation);
    const group = toeGroup(spot);
    const size = (0.34 + stableUnit(`rim-boulder-size.${seed}`) * 0.24) * (0.6 + group * group * 1.1);
    scale.set(size, size * 0.8, size * 0.86);
    matrix.compose(
      new Vector3(
        toeStoneCoordinate(spot.x, spot.outwardX),
        WATERLINE_Y + 0.02,
        toeStoneCoordinate(spot.y, spot.outwardZ),
      ),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
    index += 1;
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createRevetments(blocks: readonly RevetmentBlock[]): InstancedMesh {
  const mesh = new InstancedMesh(
    new BoxGeometry(0.8, 0.34, 0.42),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.stone_pale, roughness: 1 }),
    blocks.length,
  );
  mesh.name = "garden-rim-revetments";
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const scale = new Vector3(1, 1, 1);
  blocks.forEach((block, index) => {
    quaternion.setFromAxisAngle(new Vector3(0, 1, 0), block.yaw);
    matrix.compose(
      new Vector3(
        block.x + block.outwardX * 0.16,
        WATERLINE_Y + 0.18,
        block.y + block.outwardZ * 0.16,
      ),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function addPathRibbon(
  builder: GeometryBuilder,
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  if (!rimLandAt(a.x, a.y) || !rimLandAt(b.x, b.y)) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length * 0.56;
  const py = dx / length * 0.56;
  const ay = rimHeight(a.x, a.y) + 0.065;
  const by = rimHeight(b.x, b.y) + 0.065;
  addQuad(
    builder,
    [(a.x + px) * TILE_SCALE, ay, (a.y + py) * TILE_SCALE],
    [(b.x + px) * TILE_SCALE, by, (b.y + py) * TILE_SCALE],
    [(b.x - px) * TILE_SCALE, by, (b.y - py) * TILE_SCALE],
    [(a.x - px) * TILE_SCALE, ay, (a.y - py) * TILE_SCALE],
    [PATH_STONE, PATH_STONE, PATH_STONE, PATH_STONE],
  );
  return true;
}

function buildPathGeometry(): {
  coveSpurs: number;
  geometry: BufferGeometry;
  segments: number;
} {
  const builder: GeometryBuilder = { colors: [], indices: [], positions: [] };
  const points: Array<{ x: number; y: number }> = [];
  // Clockwise perimeter route, three tiles inland. Gaps follow the two
  // authored openings and every reserved cove mouth.
  for (let x = 3; x <= MAP_LAST - 3; x += 2) points.push({ x, y: 3 });
  for (let y = 5; y <= MAP_LAST - 3; y += 2) points.push({ x: MAP_LAST - 3, y });
  for (let x = MAP_LAST - 5; x >= 3; x -= 2) points.push({ x, y: MAP_LAST - 3 });
  for (let y = MAP_LAST - 5; y >= 3; y -= 2) points.push({ x: 3, y });
  let segments = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    if (!rimLandAt(a.x, a.y) || !rimLandAt(b.x, b.y)) continue;
    if (!clearOfStation(a.x, a.y, 2.5) || !clearOfStation(b.x, b.y, 2.5)) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) > 3) continue;
    if (addPathRibbon(builder, a, b)) segments += 1;
  }
  let coveSpurs = 0;
  for (const station of RIM_STATION_CLEARANCES) {
    const { cove } = station;
    if (!RIM_COVES.includes(cove)) continue;
    // Route one approach along a rectangle flank. Search landward from the
    // water-rooted cove for the first land point beyond an across-shore edge;
    // the whole straight ribbon then stays outside the measured envelope.
    const seawardX = Math.cos(cove.seawardBearing);
    const seawardY = Math.sin(cove.seawardBearing);
    const tangentX = -seawardY;
    const tangentY = seawardX;
    coveSearch:
    for (const across of [station.rect.maxAcross + 1, station.rect.minAcross - 1]) {
      for (let along = 0; along >= station.rect.minAlong - 1; along -= 1) {
        const approach = {
          x: cove.tile.x + seawardX * along + tangentX * across,
          y: cove.tile.y + seawardY * along + tangentY * across,
        };
        if (!rimLandAt(approach.x, approach.y)) continue;
        const landwardX = -seawardX;
        const landwardY = -seawardY;
        const perimeter = Math.abs(landwardX) >= Math.abs(landwardY)
          ? { x: landwardX < 0 ? 3 : MAP_LAST - 3, y: approach.y }
          : { x: approach.x, y: landwardY < 0 ? 3 : MAP_LAST - 3 };
        if (!clearOfStation(perimeter.x, perimeter.y, 0.75)
          || !clearOfStation(approach.x, approach.y, 0.75)
          || !addPathRibbon(builder, perimeter, approach)) continue;
        segments += 1;
        coveSpurs += 1;
        break coveSearch;
      }
    }
  }
  return {
    coveSpurs,
    geometry: finishGeometry(builder),
    segments,
  };
}

function applyRimShoreContact(material: MeshStandardMaterial): void {
  chainGardenMaterialPatch(material, {
    key: "garden-shore-contact",
    compile(shader) {
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
  ${gardenShoreContactGlsl(`vGardenSurfacePosition.y - ${GARDEN_WATER_Y}`, GARDEN_SHORE_CONTACT)}
  diffuseColor.rgb *= 1.0 - shoreDamp * 0.15 - shoreSubmerged * 0.08;`);
    },
  });
}

/**
 * @param date the world calendar day: deciduous phenology and the rare snow
 * (garden-calendar). Omitted, the garden is a green summer day without snow.
 */
export function createGardenRimMesh(date?: Date, surfaceAtlas?: GardenSurfaceAtlasOwner): GardenRimMesh {
  const root = new Group();
  root.name = "garden-rim";
  const surfaceLease = surfaceAtlas?.lease();
  const detailSource = surfaceLease?.detailSource;
  const land = buildLandGeometry();
  const landMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.98, vertexColors: true });
  // Shared top/face terrain keeps physical distance air, but the overview's
  // square-chart veil must not erase its separately bounded decorative coast.
  landMaterial.defines ??= {};
  landMaterial.defines.GARDEN_AIR_DECORATIVE_TERRAIN = 1;
  patchGardenFloraNight(landMaterial);
  applyGardenSurface(landMaterial, {
    role: "moss", mapping: "triplanar", metresPerRepeat: 2.6, detailStrength: 0.45,
    vertexRoles: true, vertexWeights: true, ...(detailSource ? { detailSource } : {}),
  });
  applyRimShoreContact(landMaterial);
  const top = new Mesh(prepareRimSurfaceGeometry(land.top, undefined, land.decals), landMaterial);
  top.name = "garden-rim-land";
  const face = new Mesh(prepareRimSurfaceGeometry(land.face, "stone"), landMaterial);
  face.name = "garden-rim-tide-rock";
  const dress = { date };
  const pines = createSpeciesBatch("pine", nearBand(rimPinePlacements()), dress);
  pines.name = "garden-rim-pines";
  const understory = createSpeciesBatch("karikomi", nearBand(karikomiPlacements()), dress);
  const broadleaf = createSpeciesBatch("momiji", nearBand(specimenPlacements(MOMIJI_PLANTING, "momiji", [1.05, 1.35])), dress);
  const cherry = createSpeciesBatch("cherry", nearBand(specimenPlacements(CHERRY_PLANTING, "cherry", [1.1, 1.3])), dress);
  const bamboo = createSpeciesBatch("bamboo", nearBand(specimenPlacements(BAMBOO_GROVES, "bamboo", [0.95, 1.2])), dress);
  const ridgeGrove = createRidgeCanopy(ridgeCanopyPlacements(), date ? gardenSnowCover(date) : 0);
  const stones = createStones(land.coastStones);
  const revetments = createRevetments(land.revetments);
  for (const mesh of [stones, revetments]) applyGardenSurface(mesh.material as MeshStandardMaterial, {
    role: "stone", mapping: "triplanar", metresPerRepeat: 2.2, detailStrength: 0.45,
    ...(detailSource ? { detailSource } : {}),
  });
  for (const mesh of [stones, revetments]) applyRimShoreContact(mesh.material as MeshStandardMaterial);
  const path = buildPathGeometry();
  const pathMaterial = new MeshStandardMaterial({ flatShading: true, roughness: 1, vertexColors: true });
  applyGardenSurface(pathMaterial, {
    role: "gravel", mapping: "worldXZ", metresPerRepeat: 0.45, detailStrength: 0.45,
    ...(detailSource ? { detailSource } : {}),
  });
  const pathMesh = new Mesh(path.geometry, pathMaterial);
  pathMesh.name = "garden-rim-path";
  const drawables = [
    top, face, pathMesh, pines, understory, broadleaf, cherry, bamboo, stones, revetments, ridgeGrove,
  ];
  root.add(...drawables);
  for (const object of drawables) {
    object.castShadow = true;
    object.receiveShadow = true;
    object.raycast = () => {};
  }
  let disposed = false;
  return {
    broadleafCount: broadleaf.count + cherry.count,
    coveSpurCount: path.coveSpurs,
    drawCallCount: drawables.length,
    pathSegmentCount: path.segments,
    pineInstances: pines,
    pineCount: pines.count,
    root,
    stoneCount: stones.count,
    steppingStoneCount: 3,
    understoryCount: understory.count,
    triangleCount: drawables.reduce((sum, mesh) => (
      sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3
        * (mesh instanceof InstancedMesh ? mesh.count : 1)
    ), 0),
    updateWind(weather, reducedMotion) {
      for (const batch of [pines, understory, broadleaf, cherry, bamboo]) {
        updateGardenInstancedWindSway(batch.material as MeshStandardMaterial, weather, reducedMotion);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeThreeObjectTree(root);
      root.clear();
      surfaceLease?.release();
    },
  };
}
