import {
  BufferAttribute,
  BoxGeometry,
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  Euler,
  Group,
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
import { defaultCamera } from "../systems/camera";
import {
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_STATION_SLOT,
} from "../systems/world-layout";
import { PHAROSVILLE_DESIGN_SPAN, PHAROSVILLE_MAP_SCALE } from "../systems/map-scale";
import { HARBOR_PALETTE } from "../systems/palette";
import type { GardenSeason } from "../systems/season";
import {
  cameraEye,
  cameraPoseFromIso,
  GARDEN_PLATE_MARGIN_TILES,
} from "../systems/projection";
import type { WeatherPlan } from "../systems/weather";
import { TILE_SCALE, disposeThreeObjectTree, stableUnit } from "./garden-util";
import { createSpeciesBatch, createSpeciesGeometry, patchGardenFloraNight, updateGardenInstancedWindSway, type SpeciesPlacement } from "./garden-flora";
export { patchGardenInstancedWindSway, updateGardenInstancedWindSway } from "./garden-flora";

const MAP_SIZE = PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE;
const MAP_LAST = MAP_SIZE - 1;
const WATERLINE_Y = -0.11;
// Reviewed half-tile contour cadence, tightened enough to retain the authored
// irregular shoreline after rectangular station reservations restore detail.
const SAMPLE_STEP = 0.44475;
/** How far past tile 139 the decorative camera-side land skirt reaches. */
const CAMERA_SIDE_SKIRT_REACH_TILES = 4.5;
/** Cut-off steepness past the reach; beats the deepest boundary shore
 *  distance (~12 tiles) well inside the eight-tile plate margin. */
const CAMERA_SIDE_SKIRT_CUT_SLOPE = 6.5;
/** Skirt pines keep this fraction of the in-bounds keep odds at the boundary. */
const CAMERA_SIDE_SKIRT_PINE_KEEP = 0.1;
/** Skirt pines trail to none by this many tiles past the boundary. */
const CAMERA_SIDE_SKIRT_PINE_FADE_TILES = 6;
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
const EARTH = new Color(HARBOR_PALETTE.stone_pale).lerp(new Color(HARBOR_PALETTE.roof_thatch), 0.22);
const MOSS = new Color(HARBOR_PALETTE.aurora_green)
  .lerp(new Color(HARBOR_PALETTE.stone_mid), 0.25)
  .lerp(new Color(HARBOR_PALETTE.sun_day_warm), 0.04);
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
const PINE_TRUNK = new Color(HARBOR_PALETTE.timber_dark);
const PINE_NEEDLE = new Color(HARBOR_PALETTE.aurora_green)
  .multiplyScalar(0.58); // deep pine green
export const GARDEN_RIM_COLOR_HEX = {
  earth: `#${EARTH.getHexString()}`,
  moss: `#${MOSS.getHexString()}`,
  pathStone: `#${PATH_STONE.getHexString()}`,
  pineNeedle: `#${PINE_NEEDLE.getHexString()}`,
  wetRock: `#${WET_ROCK.getHexString()}`,
  exposedRock: `#${EXPOSED_ROCK.getHexString()}`,
  rakedGravel: `#${RAKED_GRAVEL.getHexString()}`,
  shoreSand: `#${SHORE_SAND.getHexString()}`,
} as const;
export const GARDEN_RIM_MOSS_BLEND_MAX = 0.62;
const LANTERN_EMBER = new Color(HARBOR_PALETTE.lantern_warm);
const ENGAWA_TIMBER = new Color(HARBOR_PALETTE.timber_dark).multiplyScalar(0.54);
const ENGAWA_TIMBER_LIT = ENGAWA_TIMBER.clone().lerp(
  new Color(HARBOR_PALETTE.stone_dark),
  0.16,
);
// The sole camera-near repoussoir uses darker values of the rim pine dyes,
// never a new hue or an emissive accent.
const FOREGROUND_PINE_TRUNK = PINE_TRUNK.clone().multiplyScalar(0.66);
const FOREGROUND_PINE_NEEDLE = PINE_NEEDLE.clone().multiplyScalar(0.58);

/** The veranda replaces the lower-left stroll-ribbon segment as foreground. */
export const GARDEN_ENGAWA_DISPLACEMENT = "lower-left rim path and pine thicket";
export const GARDEN_ENGAWA_PINE_HEIGHT = 14;
/** These camera-side bays displace the former straight shoreline run. */
export const GARDEN_NEAR_RIM_BAY_DEPTHS = [3.2, 4.8, 3.6] as const;
export const GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT = 1.55;
export const GARDEN_NEAR_RIM_DISPLACEMENT = "straight shoreline and ordinary headland pines";
/**
 * The camera-side skirt displaces open water past the south/east plate
 * limits. Its one named foreground mass is authored eight world units in
 * front of the desktop rest eye and crosses the lower-left frame edge.
 */
export const GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT = "the open water band beyond the camera-side plate limits, now carrying the pine bough at the rest corner";
const ENGAWA_LANTERN_TILE = { x: 82, y: 134 } as const;
export const GARDEN_ENGAWA_LANTERN_WORLD = {
  x: ENGAWA_LANTERN_TILE.x * TILE_SCALE,
  z: ENGAWA_LANTERN_TILE.y * TILE_SCALE,
} as const;

interface GeometryBuilder {
  colors: number[];
  indices: number[];
  positions: number[];
}

export interface GardenRimMesh {
  /** Momiji instances on the rim; crown colour follows the season (T2.2d). */
  broadleafCount: number;
  coveSpurCount: number;
  coastFormCounts: Readonly<Record<CoastForm, number>>;
  drawCallCount: number;
  engawaPineCount: number;
  /** The single camera-near pine-bough silhouette. */
  foregroundMassCount: number;
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


function addBox(
  builder: GeometryBuilder,
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  color: Color,
): void {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size.map((value) => value * 0.5) as [number, number, number];
  const x0 = cx - sx;
  const x1 = cx + sx;
  const y0 = cy - sy;
  const y1 = cy + sy;
  const z0 = cz - sz;
  const z1 = cz + sz;
  const colors = [color, color, color, color] as const;
  addQuad(builder, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], colors);
  addQuad(builder, [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], colors);
  addQuad(builder, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], colors);
  addQuad(builder, [x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], colors);
  addQuad(builder, [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], colors);
  addQuad(builder, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], colors);
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
/**
 * Decorative camera-side land skirt. Past the south and east rim the authored
 * boundary silhouette is carried outward across the plate margin so the
 * camera-near edges read as land receding into haze instead of a band of open
 * water. Only this renderer term changes: the rimShoreDistance field clamps
 * out-of-bounds samples to the boundary tile, so stretches that are water at
 * the boundary — the Danger Strait reach of the east edge — stay water, and
 * the far pair (x < 0 or y < 0) never gets a skirt at all.
 */
function cameraSideSkirtExcursion(tileX: number, tileY: number): number {
  const beyond = Math.max(0, tileX - MAP_LAST, tileY - MAP_LAST);
  if (beyond <= 0) return 0;
  // Low-frequency reach wobble keeps the outer silhouette a headland line
  // rather than a straight extruded band (deterministic: no Math.random).
  const reach = CAMERA_SIDE_SKIRT_REACH_TILES
    + Math.sin(tileX * 0.163 + 2.1) * 0.7
    + Math.sin(tileY * 0.211 - tileX * 0.087) * 0.4;
  // Inside the reach the clamped field extrudes unchanged; a slow seaward
  // drift and the hard cut past the reach shape the outer coastline.
  return beyond * 0.18 + Math.max(0, beyond - reach) * CAMERA_SIDE_SKIRT_CUT_SLOPE;
}

function authoredDistance(tileX: number, tileY: number): number {
  return rimShoreDistance(tileX, tileY)
    + shoreJitter(tileX, tileY)
    + gardenRimBayExcursionAt(tileX, tileY)
    + cameraSideSkirtExcursion(tileX, tileY);
}

function rimHeight(tileX: number, tileY: number): number {
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  const cameraSide = Math.max(
    bell(tileY, MAP_LAST + 1, 43),
    bell(tileX, -1, 31) * bell(tileY, 106, 53),
  );
  const shoreBase = 0.62 + cameraSide * (GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT - 0.62);
  const rise = shoreBase + MathUtils.smoothstep(inland, 0, 8.5) * 1.3;
  const outcrop = MathUtils.smoothstep(
    Math.sin(tileX * 0.12 + tileY * 0.055) + Math.sin(tileY * 0.17 - 0.8),
    0.35, 1.45,
  );
  const ledge = outcrop * (
    MathUtils.smoothstep(inland, 1.2, 1.65) * 0.22
    + MathUtils.smoothstep(inland, 4.1, 4.8) * 0.28
  );
  const dangerCliff = MathUtils.smoothstep(tileX, MAP_LAST - 10, MAP_LAST - 6)
    * MathUtils.smoothstep(tileY, 38, 44)
    * (1 - MathUtils.smoothstep(tileY, 76, 82)) * 0.38;
  const grain = Math.sin(tileX * 0.43 + tileY * 0.31) * 0.045;
  const levelHeight = Math.max(0.6, Math.min(3.1, rise + ledge + dangerCliff + grain));
  const beyond = Math.max(0, tileX - MAP_LAST, tileY - MAP_LAST);
  if (beyond > 0) {
    const recede = Math.min(1, beyond / (CAMERA_SIDE_SKIRT_REACH_TILES + 2));
    const letDown = 1 - 0.5 * recede * recede;
    const swellEase = Math.min(1, beyond / 1.5);
    const swell = (Math.sin(tileX * 0.31 + tileY * 0.23) * 0.3
      + Math.sin(tileX * 0.11 - tileY * 0.27 + 1.7) * 0.22) * swellEase * letDown;
    return Math.max(0.45, Math.min(levelHeight, levelHeight * letDown + swell));
  }

  // Only the north/west (low-coordinate) rim pair rises. Rim depth controls
  // the broad inland envelope; slow deterministic waves vary its 8–18-unit
  // crest so the unchanged sheet reads as hills rather than a wall.
  const bearing = Math.atan2(tileY - MAP_LAST / 2, tileX - MAP_LAST / 2);
  const depth = rimDepthAt(bearing);
  const farPair = Math.min(tileX, tileY) < Math.min(MAP_LAST - tileX, MAP_LAST - tileY);
  if (
    !farPair
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

export function rimColor(tileX: number, tileY: number): Color {
  const height = rimHeight(tileX, tileY);
  const epsilon = 0.35;
  const slope = Math.hypot(
    rimHeight(tileX + epsilon, tileY) - rimHeight(tileX - epsilon, tileY),
    rimHeight(tileX, tileY + epsilon) - rimHeight(tileX, tileY - epsilon),
  ) / (epsilon * 2 * TILE_SCALE);
  if (stationMouthClearance(tileX, tileY) <= 2.4) return RAKED_GRAVEL.clone();
  if (slope > 0.6) return EXPOSED_ROCK.clone();
  if (slope < 0.15 && height < 1.2) return SHORE_SAND.clone();
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  const moss = MathUtils.smoothstep(inland, 0.8, 6) * GARDEN_RIM_MOSS_BLEND_MAX;
  const aspect = MathUtils.clamp(0.5 + (rimHeight(tileX - epsilon, tileY) - rimHeight(tileX + epsilon, tileY)) * 0.3, 0, 1);
  const mossColor = MOSS.clone().lerp(new Color(HARBOR_PALETTE.fog_blue), (1 - aspect) * 0.2)
    .lerp(new Color(HARBOR_PALETTE.sun_day_warm), aspect * 0.08);
  const patch = Math.sin(tileX * 0.72 + Math.sin(tileY * 0.31)) * Math.cos(tileY * 0.61);
  const color = EARTH.clone().lerp(mossColor, moss).lerp(RAKED_GRAVEL, Math.max(0, patch - 0.58) * 0.6);
  color.multiplyScalar(0.94 + Math.sin(tileX * 0.24 - tileY * 0.18) * 0.055);
  return color;
}

/**
 * Decorative surface land test, exported so tests and future skirt furniture
 * share the one predicate. In bounds this is the authored silhouette plus
 * its decorative cuts, unchanged. Past the south and east rim the clamped
 * rimShoreDistance sample extrudes the authored boundary silhouette outward
 * across the camera-side plate margin — water at the boundary (the Danger
 * Strait reach of the east edge) therefore stays water. The far pair keeps
 * no skirt, so the north and west margins still dissolve into the haze seam.
 * It answers where decoration may STAND: it never feeds rimLandAt, tile
 * classification, navigation, or placement.
 */
export function gardenRimDecorativeLandAt(tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0) return false;
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
  // Upper clamp reaches into the plate margin so coast cells of the
  // camera-side skirt project onto their shoreline like every other coast.
  const skirtLimit = MAP_LAST + GARDEN_PLATE_MARGIN_TILES;
  return {
    x: Math.max(0, Math.min(skirtLimit, tileX + moveX)),
    y: Math.max(0, Math.min(skirtLimit, tileY + moveY)),
  };
}

function pointAtY(
  top: readonly [number, number, number],
  y: number,
): [number, number, number] {
  return [top[0], y, top[2]];
}

export type CoastForm = "beach" | "boulder" | "revetment";

interface CoastStone {
  outwardX: number;
  outwardZ: number;
  x: number;
  y: number;
}

interface RevetmentBlock extends CoastStone {
  yaw: number;
}

function coastFormAt(tileX: number, tileY: number): CoastForm {
  if (stationMouthClearance(tileX, tileY) < 5.5) return "revetment";
  const patchX = Math.floor(tileX / 11);
  const patchY = Math.floor(tileY / 11);
  const choice = stableUnit(`rim-coast-form.${patchX}.${patchY}`);
  if (choice < 0.34) return "beach";
  if (choice < 0.67) return "revetment";
  return "boulder";
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
  const dryColor = form === "beach" ? SHORE_SAND : topColor;
  addQuad(builder, a, b, stainB, stainA, [dryColor, dryColor, TIDE_STAIN, TIDE_STAIN]);
  addQuad(builder, stainA, stainB, c, d, [TIDE_STAIN, TIDE_STAIN, WET_ROCK, WET_ROCK]);
  // Beaches run two to three tiles seaward; rock forms retain a tight wet toe.
  const variation = stableUnit(`wet-shelf.${a[0].toFixed(1)}.${a[2].toFixed(1)}`);
  const shelf = form === "beach"
    ? (2 + variation) * TILE_SCALE
    : 0.34 + variation * 0.3;
  const waterA = pointAtY(a, WATERLINE_Y + 0.045);
  const waterB = pointAtY(b, WATERLINE_Y + 0.045);
  const plateLimit = (MAP_LAST + GARDEN_PLATE_MARGIN_TILES) * TILE_SCALE;
  const outerA: [number, number, number] = [
    MathUtils.clamp(waterA[0] + outwardX * shelf, 0, plateLimit),
    waterA[1] - 0.025,
    MathUtils.clamp(waterA[2] + outwardZ * shelf, 0, plateLimit),
  ];
  const outerB: [number, number, number] = [
    MathUtils.clamp(waterB[0] + outwardX * shelf, 0, plateLimit),
    waterB[1] - 0.025,
    MathUtils.clamp(waterB[2] + outwardZ * shelf, 0, plateLimit),
  ];
  const toeColor = form === "beach" ? SHORE_SAND : WET_ROCK;
  addQuad(builder, waterA, waterB, outerB, outerA, [TIDE_STAIN, TIDE_STAIN, toeColor, toeColor]);
}

function buildLandGeometry(): {
  coastFormCounts: Record<CoastForm, number>;
  coastStones: CoastStone[];
  face: BufferGeometry;
  revetments: RevetmentBlock[];
  top: BufferGeometry;
} {
  const top: GeometryBuilder = { colors: [], indices: [], positions: [] };
  const face: GeometryBuilder = { colors: [], indices: [], positions: [] };
  const coastFormCounts: Record<CoastForm, number> = { beach: 0, boulder: 0, revetment: 0 };
  const coastStones: CoastStone[] = [];
  const revetments: RevetmentBlock[] = [];
  const revetmentKeys = new Set<string>();
  const boulderKeys = new Set<string>();
  const half = SAMPLE_STEP / 2;
  // The walk spans the plate margin on the camera-near sides only: cells
  // beyond x/y 139 evaluate the skirt; cells before 0 are always water, so
  // the far pair generates nothing and keeps dissolving into the haze.
  const samples = Math.round((MAP_SIZE + GARDEN_PLATE_MARGIN_TILES) / SAMPLE_STEP);
  for (let iy = 0; iy < samples; iy += 1) {
    const cy = iy * SAMPLE_STEP + half;
    for (let ix = 0; ix < samples; ix += 1) {
      const cx = ix * SAMPLE_STEP + half;
      if (!gardenRimDecorativeLandAt(cx, cy)) continue;
      const p00 = shoreVertexTile(cx - half, cy - half);
      const p10 = shoreVertexTile(cx + half, cy - half);
      const p11 = shoreVertexTile(cx + half, cy + half);
      const p01 = shoreVertexTile(cx - half, cy + half);
      // Heights are sampled at shared corners so neighbouring tiles remain a
      // watertight sheet; local ledges interrupt otherwise continuous earth.
      const h00 = rimHeight(cx - half, cy - half);
      const h10 = rimHeight(cx + half, cy - half);
      const h11 = rimHeight(cx + half, cy + half);
      const h01 = rimHeight(cx - half, cy + half);
      addQuad(
        top,
        [p00.x * TILE_SCALE, h00, p00.y * TILE_SCALE],
        [p10.x * TILE_SCALE, h10, p10.y * TILE_SCALE],
        [p11.x * TILE_SCALE, h11, p11.y * TILE_SCALE],
        [p01.x * TILE_SCALE, h01, p01.y * TILE_SCALE],
        [
          rimColor(cx - half, cy - half),
          rimColor(cx + half, cy - half),
          rimColor(cx + half, cy + half),
          rimColor(cx - half, cy + half),
        ],
      );
      const sides = [
        { dx: -SAMPLE_STEP, dy: 0, a: [p01.x * TILE_SCALE, h01, p01.y * TILE_SCALE], b: [p00.x * TILE_SCALE, h00, p00.y * TILE_SCALE] },
        { dx: SAMPLE_STEP, dy: 0, a: [p10.x * TILE_SCALE, h10, p10.y * TILE_SCALE], b: [p11.x * TILE_SCALE, h11, p11.y * TILE_SCALE] },
        { dx: 0, dy: -SAMPLE_STEP, a: [p00.x * TILE_SCALE, h00, p00.y * TILE_SCALE], b: [p10.x * TILE_SCALE, h10, p10.y * TILE_SCALE] },
        { dx: 0, dy: SAMPLE_STEP, a: [p11.x * TILE_SCALE, h11, p11.y * TILE_SCALE], b: [p01.x * TILE_SCALE, h01, p01.y * TILE_SCALE] },
      ] as const;
      for (const side of sides) {
        if (gardenRimDecorativeLandAt(cx + side.dx, cy + side.dy)) continue;
        const form = coastFormAt(cx, cy);
        coastFormCounts[form] += 1;
        addShoreCourses(
          face,
          side.a,
          side.b,
          pointAtY(side.b, WATERLINE_Y),
          pointAtY(side.a, WATERLINE_Y),
          rimColor(cx, cy),
          side.dx / SAMPLE_STEP,
          side.dy / SAMPLE_STEP,
          form,
        );
        const midpointX = (side.a[0] + side.b[0]) * 0.5;
        const midpointY = (side.a[2] + side.b[2]) * 0.5;
        if (form === "revetment") {
          const key = `${Math.round(midpointX / 0.8)}.${Math.round(midpointY / 0.8)}.${side.dx !== 0 ? "v" : "h"}`;
          if (!revetmentKeys.has(key)) {
            revetmentKeys.add(key);
            revetments.push({
              outwardX: side.dx / SAMPLE_STEP,
              outwardZ: side.dy / SAMPLE_STEP,
              x: midpointX,
              y: midpointY,
              yaw: side.dx !== 0 ? Math.PI / 2 : 0,
            });
          }
        } else if (form === "boulder") {
          const key = `${Math.round(midpointX / (1.15 * TILE_SCALE))}.${Math.round(midpointY / (1.15 * TILE_SCALE))}`;
          if (!boulderKeys.has(key)) {
            boulderKeys.add(key);
            coastStones.push({
              outwardX: side.dx / SAMPLE_STEP,
              outwardZ: side.dy / SAMPLE_STEP,
              x: midpointX / TILE_SCALE,
              y: midpointY / TILE_SCALE,
            });
          }
        }
      }
    }
  }
  // Flat moss/gravel decals conform to the land and share its vertex-colour draw.
  for (const [index, placement] of plantingTiles(90, "ground").entries()) {
    const decal = createSpeciesGeometry("ground", "summer", PINE_TRUNK, index % 3 === 0 ? RAKED_GRAVEL : MOSS);
    const positions = decal.getAttribute("position");
    const color = index % 3 === 0 ? RAKED_GRAVEL : MOSS;
    const corners: [number, number, number][] = [];
    for (let i = 0; i < positions.count; i += 1) {
      const x = placement.position[0] + positions.getX(i), z = placement.position[2] + positions.getZ(i);
      corners.push([x, rimHeight(x / TILE_SCALE, z / TILE_SCALE) + 0.025, z]);
    }
    addQuad(top, corners[0]!, corners[1]!, corners[2]!, corners[3]!, [color, color, color, color]);
    decal.dispose();
  }
  const topGeometry = finishGeometry(top);
  topGeometry.deleteAttribute("normal");
  const smoothTop = mergeVertices(topGeometry);
  smoothTop.computeVertexNormals();
  topGeometry.dispose();
  return {
    coastFormCounts,
    coastStones: coastStones.slice(0, 97),
    face: finishGeometry(face),
    revetments: revetments.slice(0, 166),
    top: smoothTop,
  };
}



function clearOfStation(tileX: number, tileY: number, extra = 0): boolean {
  return RIM_STATION_CLEARANCES.every((station) => (
    distanceToStationFootprint({ x: tileX, y: tileY }, station.rect) > extra
  ));
}

interface PineSpec {
  leanX: number;
  leanZ: number;
  scale: number;
  x: number;
  y: number;
  yaw: number;
}

function pineTiles(): PineSpec[] {
  const candidates: PineSpec[] = [];
  // A half-density lattice supplies the authored 120-tree selection without
  // relaxing station, headland or foreground-pocket clearances.
  for (let y = 3; y < MAP_LAST - 2; y += 1.5) {
    for (let x = 3; x < MAP_LAST - 2; x += 1.5) {
      if (!rimLandAt(x, y) || authoredDistance(x, y) > -2.2 || !clearOfStation(x, y, 3)) continue;
      if (HEADLANDS.some((headland) => Math.hypot(x - headland.x, y - headland.y) < 4.5)) continue;
      // The engawa is one silhouette, not another grove: its hero tree
      // explicitly displaces every ordinary pine in this near-corner pocket.
      if (Math.hypot(x - 86, y - 134) < 11) continue;
      // Same rule for the two foreground mass pockets (warm-village A6).
      if (inForegroundMassPocket(x, y)) continue;
      const lowerLeft = x < 48 && y > 72;
      const thinEast = x > 122;
      // T2.2c (2026-09-07): general keep 0.3 -> 0.5, east 0.12 -> 0.3. The
      // measured census was 41 trees in the whole world — one pine per nine
      // rim tiles — against a brief that says "Japanese garden". The east
      // stays the thinner half of the ring, just not near-bare.
      const keep = lowerLeft ? 0.92 : thinEast ? 0.3 : 0.5;
      const unit = stableUnit(`rim-pine.${x}.${y}`);
      if (unit > keep) continue;
      candidates.push({
        leanX: 0,
        leanZ: 0,
        scale: 0.78 + stableUnit(`rim-pine-scale.${x}.${y}`) * (lowerLeft ? 0.72 : 0.48),
        x,
        y,
        yaw: stableUnit(`rim-pine-yaw.${x}.${y}`) * Math.PI * 2,
      });
      if (lowerLeft && stableUnit(`rim-pine-cluster.${x}.${y}`) < 0.48) {
        candidates.push({
          leanX: -0.08,
          leanZ: 0.05,
          scale: 0.62 + stableUnit(`rim-pine-cluster-scale.${x}.${y}`) * 0.34,
          x: x + 1.15,
          y: y - 0.75,
          yaw: stableUnit(`rim-pine-cluster-yaw.${x}.${y}`) * Math.PI * 2,
        });
      }
    }
  }
  // Engawa foreground: a single larger niwaki leans seaward from the deep
  // lower-left lobe. It remains in this one ring-wide pine instance batch.
  candidates.push({ leanX: -0.14, leanZ: 0.08, scale: GARDEN_ENGAWA_PINE_HEIGHT / 4.5, x: 86, y: 134, yaw: 0.34 });
  // Camera-side skirt dressing: the same shore pines continue past the south
  // and east rim on the in-bounds three-tile lattice, thinned from roughly a
  // third to a half of the in-bounds keep odds at the boundary and trailing
  // to none at the outer coast. In-bounds rings are untouched, and the far
  // pair (x < 0 or y < 0) is water in gardenRimDecorativeLandAt, so it gains
  // nothing.
  for (let y = 3; y <= MAP_LAST + 5; y += 3) {
    for (let x = 3; x <= MAP_LAST + 5; x += 3) {
      const beyond = Math.max(0, x - MAP_LAST, y - MAP_LAST);
      // Lattice points still inside the map were settled (or not) by the
      // in-bounds pass above and keep their authored odds.
      if (beyond === 0) continue;
      if (!gardenRimDecorativeLandAt(x, y) || authoredDistance(x, y) > -2.2) continue;
      if (!clearOfStation(x, y, 3)) continue;
      // The engawa hero keeps its pocket; no ordinary pine crowds it.
      if (Math.hypot(x - 86, y - 134) < 11) continue;
      // The foreground masses own their pockets too.
      if (inForegroundMassPocket(x, y)) continue;
      const keep = CAMERA_SIDE_SKIRT_PINE_KEEP
        * Math.max(0, 1 - beyond / CAMERA_SIDE_SKIRT_PINE_FADE_TILES);
      if (stableUnit(`rim-skirt-pine.${x}.${y}`) > keep) continue;
      candidates.push({
        leanX: 0,
        leanZ: 0,
        scale: 0.7 + stableUnit(`rim-skirt-pine-scale.${x}.${y}`) * 0.4,
        x,
        y,
        yaw: stableUnit(`rim-skirt-pine-yaw.${x}.${y}`) * Math.PI * 2,
      });
    }
  }
  const hero = candidates.filter((spec) => spec.scale > 2);
  const ordinary = candidates.filter((spec) => spec.scale <= 2);
  const count = Math.min(120 - hero.length, ordinary.length);
  return [...Array.from({ length: count }, (_, i) => ordinary[Math.floor(i * ordinary.length / count)]!), ...hero];
}

function createPines(specs: readonly PineSpec[]): InstancedMesh {
  const mesh = createSpeciesBatch("pine", specs.map((spec) => ({
    position: [spec.x * TILE_SCALE, rimHeight(spec.x, spec.y), spec.y * TILE_SCALE],
    scale: spec.scale, yaw: spec.yaw, leanX: spec.leanX, leanZ: spec.leanZ,
  })));
  mesh.name = "garden-rim-pines";
  return mesh;
}


function plantingTiles(count: number, seed: string): SpeciesPlacement[] {
  const spots: SpeciesPlacement[] = [];
  for (let y = 4.5; y < MAP_LAST - 2; y += 1.5) {
    for (let x = 4.5; x < MAP_LAST - 2; x += 1.5) {
      if (!rimLandAt(x, y) || authoredDistance(x, y) > -2 || !clearOfStation(x, y, 3)) continue;
      if (HEADLANDS.some((headland) => Math.hypot(x - headland.x, y - headland.y) < 4.5)) continue;
      if (Math.hypot(x - 86, y - 134) < 11 || inForegroundMassPocket(x, y)) continue;
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

function createStones(coastStones: readonly CoastStone[]): InstancedMesh {
  const steppingStones = [
    { scale: [1.05, 0.28, 0.82] as const, x: 82.4, y: 131.4, yaw: -0.18 },
    { scale: [0.86, 0.22, 1.08] as const, x: 81.7, y: 129.0, yaw: 0.31 },
    { scale: [1.12, 0.25, 0.72] as const, x: 82.6, y: 126.6, yaw: -0.42 },
  ].filter((stone) => clearOfStation(stone.x, stone.y));
  const skirtStones = skirtStoneTiles();
  const count = HEADLANDS.length * 3 + steppingStones.length + skirtStones.length + coastStones.length;
  const mesh = new InstancedMesh(
    new DodecahedronGeometry(0.72, 0),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.stone_mid, flatShading: true, roughness: 1 }),
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
      rotation.set(
        member === 0 ? 0.08 : 0.42,
        angle,
        member === 0 ? -0.12 : 0.22,
      );
      quaternion.setFromEuler(rotation);
      scale.set(member === 0 ? 0.85 : 0.72, member === 0 ? 1.75 : 0.62, member === 0 ? 0.72 : 1.05);
      matrix.compose(new Vector3(x * TILE_SCALE, rimHeight(x, y) + 0.42, y * TILE_SCALE), quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  for (const step of steppingStones) {
    rotation.set(0.05, step.yaw, -0.04);
    quaternion.setFromEuler(rotation);
    scale.set(step.scale[0], step.scale[1], step.scale[2]);
    matrix.compose(
      new Vector3(step.x * TILE_SCALE, WATERLINE_Y + 0.22, step.y * TILE_SCALE),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
    index += 1;
  }
  for (const spot of skirtStones) {
    rotation.set(0.34, stableUnit(`rim-skirt-stone-yaw.${spot.x}.${spot.y}`) * Math.PI * 2, 0.18);
    quaternion.setFromEuler(rotation);
    scale.set(0.62, 0.55, 0.88);
    matrix.compose(
      new Vector3(spot.x * TILE_SCALE, rimHeight(spot.x, spot.y) + 0.3, spot.y * TILE_SCALE),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
    index += 1;
  }
  for (const spot of coastStones) {
    const seed = `${spot.x.toFixed(2)}.${spot.y.toFixed(2)}`;
    rotation.set(
      0.2 + stableUnit(`rim-boulder-pitch.${seed}`) * 0.35,
      stableUnit(`rim-boulder-yaw.${seed}`) * Math.PI * 2,
      0.12,
    );
    quaternion.setFromEuler(rotation);
    const size = 0.42 + stableUnit(`rim-boulder-size.${seed}`) * 0.28;
    scale.set(size, size * 0.72, size * 0.86);
    matrix.compose(
      new Vector3(
        MathUtils.clamp(spot.x * TILE_SCALE + spot.outwardX * 0.22, 0, 145 * TILE_SCALE),
        WATERLINE_Y + 0.18,
        MathUtils.clamp(spot.y * TILE_SCALE + spot.outwardZ * 0.22, 0, 145 * TILE_SCALE),
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

// ---------------------------------------------------------------------------
// Spatial foundation W1.9: one camera-near pine bough. The ordinary pine
// geometry already supplies a leaning trunk and four flattened needle pads;
// this authored transform turns it into a single merged repoussoir draw.
// ---------------------------------------------------------------------------

export const GARDEN_RIM_FOREGROUND_BOUGH_NAME = "garden-rim-foreground-pine-bough";

/** One authored foreground mass: what it is, where it stands, how tall. */
export interface GardenRimForegroundMassSpec {
  /** Ordinary rim-pine lattice candidates inside this radius are dropped. */
  readonly clearRadiusTiles: number;
  /** Crest height above the skirt surface, world units. */
  readonly height: number;
  /** The composed mesh name; registered in OVERVIEW_LOD_DETAIL_NAMES. */
  readonly name: string;
  /** Anchor tile. Past tile 139: outside the authoritative grid entirely. */
  readonly tile: { readonly x: number; readonly y: number };
}

const FOREGROUND_BOUGH_VIEWPORT = { x: 1600, y: 1000 } as const;
const FOREGROUND_BOUGH_POSE = cameraPoseFromIso(defaultCamera({
  width: FOREGROUND_BOUGH_VIEWPORT.x,
  height: FOREGROUND_BOUGH_VIEWPORT.y,
  map: { width: MAP_SIZE, height: MAP_SIZE },
}), FOREGROUND_BOUGH_VIEWPORT);
const FOREGROUND_BOUGH_EYE = cameraEye(FOREGROUND_BOUGH_POSE);
const FOREGROUND_BOUGH_FORWARD_WORLD = 8;
const FOREGROUND_BOUGH_LEFT_WORLD = 12;
const FOREGROUND_BOUGH = {
  height: 28,
  padCenterY: FOREGROUND_BOUGH_EYE.y - 6,
  leanX: -0.18,
  leanZ: 0.34,
  tileX: (
    FOREGROUND_BOUGH_EYE.x
    - Math.sin(FOREGROUND_BOUGH_POSE.yaw) * FOREGROUND_BOUGH_FORWARD_WORLD
    - Math.cos(FOREGROUND_BOUGH_POSE.yaw) * FOREGROUND_BOUGH_LEFT_WORLD
  ) / TILE_SCALE,
  tileY: (
    FOREGROUND_BOUGH_EYE.z
    - Math.cos(FOREGROUND_BOUGH_POSE.yaw) * FOREGROUND_BOUGH_FORWARD_WORLD
    + Math.sin(FOREGROUND_BOUGH_POSE.yaw) * FOREGROUND_BOUGH_LEFT_WORLD
  ) / TILE_SCALE,
  yaw: 2.25,
} as const;

/** The sole authored foreground mass: one dark pine bough at the near corner. */
export const GARDEN_RIM_FOREGROUND_MASSES: readonly GardenRimForegroundMassSpec[] = [
  {
    clearRadiusTiles: 4,
    height: FOREGROUND_BOUGH.height,
    name: GARDEN_RIM_FOREGROUND_BOUGH_NAME,
    tile: { x: FOREGROUND_BOUGH.tileX, y: FOREGROUND_BOUGH.tileY },
  },
] as const;

function inForegroundMassPocket(tileX: number, tileY: number): boolean {
  return GARDEN_RIM_FOREGROUND_MASSES.some((mass) => (
    Math.hypot(tileX - mass.tile.x, tileY - mass.tile.y) < mass.clearRadiusTiles
  ));
}
function createForegroundBough(): Mesh {
  const geometry = createSpeciesGeometry("pine", "summer", FOREGROUND_PINE_TRUNK, FOREGROUND_PINE_NEEDLE);
  const scale = FOREGROUND_BOUGH.height / 4.5;
  const rotation = new Quaternion().setFromEuler(new Euler(
    FOREGROUND_BOUGH.leanX,
    FOREGROUND_BOUGH.yaw,
    FOREGROUND_BOUGH.leanZ,
  ));
  // Anchor the highest needle pad to the rest eye rather than to the terrain:
  // zoom changes move the eye, and a terrain-relative crest can cross the
  // view axis instead of hanging into the lower-left corner.
  const topPadCenter = new Vector3(0.36 * scale * 1.3, 4.1 * scale, -0.08 * scale * 0.72)
    .applyQuaternion(rotation);
  const matrix = new Matrix4();
  matrix.compose(
    new Vector3(
      FOREGROUND_BOUGH.tileX * TILE_SCALE,
      FOREGROUND_BOUGH.padCenterY - topPadCenter.y,
      FOREGROUND_BOUGH.tileY * TILE_SCALE,
    ),
    rotation,
    new Vector3(scale * 1.3, scale, scale * 0.72),
  );
  geometry.applyMatrix4(matrix);
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ flatShading: true, roughness: 0.95, vertexColors: true }),
  );
  mesh.name = GARDEN_RIM_FOREGROUND_BOUGH_NAME;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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

function buildPathGeometry(): { coveSpurs: number; geometry: BufferGeometry; segments: number } {
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
  // Engawa repoussoir: broad black-brown planks and one stone sill, merged
  // into the existing path draw. This is the viewer's place, and replaces the
  // otherwise continuous pale stroll ribbon at the lower-left corner.
  const deckCentreX = 84.5 * TILE_SCALE;
  // Centre pulled to 136.35 so the deck's near lip (136.35 + 5.2/2) stays
  // inside tile 139: the whole path draw — ribbon, cove spurs, and this
  // veranda — remains on the authored plate.
  const deckCentreZ = 136.35 * TILE_SCALE;
  const deckTop = Math.max(1.9, rimHeight(84.5, 136.2) + 0.28);
  addBox(
    builder,
    [deckCentreX, deckTop - 0.23, deckCentreZ],
    [19 * TILE_SCALE, 0.46, 5.2 * TILE_SCALE],
    ENGAWA_TIMBER,
  );
  for (let plank = 0; plank < 18; plank += 1) {
    const x = (75.9 + plank * 0.99) * TILE_SCALE;
    addBox(
      builder,
      [x, deckTop + 0.035, deckCentreZ],
      [0.91 * TILE_SCALE, 0.07, 5.05 * TILE_SCALE],
      plank % 3 === 0 ? ENGAWA_TIMBER_LIT : ENGAWA_TIMBER,
    );
  }
  addBox(
    builder,
    [deckCentreX, deckTop - 0.05, 134.42 * TILE_SCALE],
    [19.4 * TILE_SCALE, 0.26, 0.62 * TILE_SCALE],
    WET_ROCK,
  );
  // One tōrō at the camera-side engawa. Stone body and warm chamber are merged
  // into the path draw; its water reflection is registered separately as the
  // scene's `engawa-lantern` ember lane.
  const lanternX = GARDEN_ENGAWA_LANTERN_WORLD.x;
  const lanternZ = GARDEN_ENGAWA_LANTERN_WORLD.z;
  const lanternGround = deckTop;
  addBox(builder, [lanternX, lanternGround + 0.14, lanternZ], [1.2, 0.28, 1.05], PATH_STONE);
  addBox(builder, [lanternX, lanternGround + 0.72, lanternZ], [0.34, 0.9, 0.34], PATH_STONE);
  addBox(builder, [lanternX, lanternGround + 1.32, lanternZ], [0.58, 0.42, 0.58], LANTERN_EMBER);
  addBox(builder, [lanternX, lanternGround + 1.59, lanternZ], [1.05, 0.16, 0.95], PATH_STONE);
  addBox(builder, [lanternX, lanternGround + 1.75, lanternZ], [0.52, 0.18, 0.48], PATH_STONE);
  return { coveSpurs, geometry: finishGeometry(builder), segments };
}

/**
 * @param season drives the broadleaf crown colour only (T2.2d). Defaulted to
 * summer so every existing no-argument call site keeps compiling and keeps
 * its authored green.
 */
export function createGardenRimMesh(season: GardenSeason = "summer"): GardenRimMesh {
  const root = new Group();
  root.name = "garden-rim";
  const land = buildLandGeometry();
  const landMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.98, vertexColors: true });
  patchGardenFloraNight(landMaterial);
  const top = new Mesh(land.top, landMaterial);
  top.name = "garden-rim-land";
  const face = new Mesh(land.face, landMaterial);
  face.name = "garden-rim-tide-rock";
  const pineSpecs = pineTiles();
  const pines = createPines(pineSpecs);
  const understory = createSpeciesBatch("karikomi", plantingTiles(80, "karikomi").map((placement, i) => ({ ...placement, scale: 0.8 + stableUnit(`karikomi-size.${i}`) * 0.66 })));
  const broadleaf = createSpeciesBatch("momiji", plantingTiles(40, "deciduous").slice(0, 40), season);
  const cherry = createSpeciesBatch("cherry", plantingTiles(60, "deciduous").slice(40), season);
  const bamboo = createSpeciesBatch("bamboo", plantingTiles(35, "bamboo"));
  const stones = createStones(land.coastStones);
  const revetments = createRevetments(land.revetments);
  const foregroundBough = createForegroundBough();
  patchGardenFloraNight(foregroundBough.material as MeshStandardMaterial);
  const path = buildPathGeometry();
  const pathMesh = new Mesh(
    path.geometry,
    new MeshStandardMaterial({ flatShading: true, roughness: 1, vertexColors: true }),
  );
  pathMesh.name = "garden-rim-path";
  const drawables = [
    top, face, pathMesh, pines, understory, broadleaf, cherry, bamboo, stones, revetments, foregroundBough,
  ];
  root.add(...drawables);
  for (const object of drawables) {
    object.castShadow = true;
    object.receiveShadow = true;
  }
  let disposed = false;
  return {
    broadleafCount: broadleaf.count + cherry.count,
    coastFormCounts: land.coastFormCounts,
    coveSpurCount: path.coveSpurs,
    drawCallCount: drawables.length,
    engawaPineCount: 1,
    foregroundMassCount: 1,
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
    },
  };
}
