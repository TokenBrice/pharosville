import {
  BufferAttribute,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { distanceToStationFootprint, stationFootprintRect } from "../systems/dock-layout";
import {
  RIM_COVES,
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
import { GARDEN_PLATE_MARGIN_TILES } from "../systems/projection";
import type { WeatherPlan } from "../systems/weather";
import { TILE_SCALE, disposeThreeObjectTree, stableUnit } from "./garden-util";

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
  0.5,
); // OKLCH L 0.278 C 0.046 H 263 — cool wet blue-rock
const TIDE_STAIN = new Color(HARBOR_PALETTE.stone_dark)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.18)
  .multiplyScalar(0.72);
const EARTH = new Color(HARBOR_PALETTE.timber_mid).lerp(
  new Color(HARBOR_PALETTE.timber_warm),
  0.42,
); // OKLCH L 0.466 C 0.073 H 67 — warm ochre-brown
const MOSS = new Color(HARBOR_PALETTE.aurora_green)
  .multiplyScalar(0.78); // OKLCH L 0.571 C 0.115 H 145 — living moss
const PATH_STONE = new Color(HARBOR_PALETTE.stone_pale).lerp(
  new Color(HARBOR_PALETTE.roof_thatch),
  0.34,
); // OKLCH L 0.604 C 0.074 H 74 — warm sand
const PINE_TRUNK = new Color(HARBOR_PALETTE.timber_dark);
const PINE_NEEDLE = new Color(HARBOR_PALETTE.aurora_green)
  .multiplyScalar(0.58); // OKLCH L 0.519 C 0.104 H 145 — deep pine green
export const GARDEN_RIM_COLOR_HEX = {
  earth: `#${EARTH.getHexString()}`,
  moss: `#${MOSS.getHexString()}`,
  pathStone: `#${PATH_STONE.getHexString()}`,
  pineNeedle: `#${PINE_NEEDLE.getHexString()}`,
  wetRock: `#${WET_ROCK.getHexString()}`,
} as const;
export const GARDEN_RIM_MOSS_BLEND_MAX = 0.62;
const LANTERN_EMBER = new Color(HARBOR_PALETTE.lantern_warm);
const ENGAWA_TIMBER = new Color(HARBOR_PALETTE.timber_dark).multiplyScalar(0.54);
const ENGAWA_TIMBER_LIT = ENGAWA_TIMBER.clone().lerp(
  new Color(HARBOR_PALETTE.stone_dark),
  0.16,
);
// Warm-village A6: the camera-near foreground masses are dark-valued
// silhouettes — value drops of the rim's own pine/timber dyes, never new
// hues, and never emissive: after dark they read as black shapes against the
// sea exactly like the skirt they stand on.
const FOREGROUND_PINE_TRUNK = PINE_TRUNK.clone().multiplyScalar(0.66);
const FOREGROUND_PINE_NEEDLE = PINE_NEEDLE.clone().multiplyScalar(0.58);
const FOREGROUND_TIMBER = new Color(HARBOR_PALETTE.timber_dark)
  .lerp(new Color(HARBOR_PALETTE.iron_dark), 0.34);
const FOREGROUND_TIMBER_LIT = FOREGROUND_TIMBER.clone().lerp(
  new Color(HARBOR_PALETTE.stone_mid),
  0.2,
);

/** The veranda replaces the lower-left stroll-ribbon segment as foreground. */
export const GARDEN_ENGAWA_DISPLACEMENT = "lower-left rim path and pine thicket";
export const GARDEN_ENGAWA_PINE_HEIGHT = 14;
/** These camera-side bays displace the former straight shoreline run. */
export const GARDEN_NEAR_RIM_BAY_DEPTHS = [3.2, 4.8, 3.6] as const;
export const GARDEN_NEAR_RIM_MIN_TERRACE_HEIGHT = 1.55;
export const GARDEN_NEAR_RIM_DISPLACEMENT = "straight shoreline and ordinary headland pines";
/**
 * The camera-side skirt displaces open water past the south/east plate
 * limits. Warm-village A6 (2026-09-05): the rest frame's land-bearing near
 * corner — the bottom-left at `defaultCamera`, which lands on this skirt
 * around tile (60,141) — now also carries the two named foreground masses
 * (`GARDEN_RIM_FOREGROUND_MASSES`: the corner pine group and the
 * torii-and-fence run). They displace the same open-water band rather than
 * adding a parallel prop vocabulary.
 */
export const GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT = "the open water band beyond the camera-side plate limits, now carrying the named foreground masses at the rest corner";
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
  coveSpurCount: number;
  drawCallCount: number;
  engawaPineCount: number;
  /** The two camera-near silhouette masses (warm-village A6). */
  foregroundMassCount: number;
  pathSegmentCount: number;
  pineInstances: InstancedMesh;
  pineCount: number;
  root: Group;
  stoneCount: number;
  steppingStoneCount: number;
  triangleCount: number;
  dispose(): void;
  updateWind(weather: WeatherPlan, reducedMotion: boolean): void;
}

interface GardenWindSwayUniforms {
  uGardenWindDirection: { value: { x: number; y: number } };
  uGardenWindStrength: { value: number };
}

/**
 * Adds one vertex-only wind response to an existing instanced standard
 * material. Instances differ only by `aGardenSway`; direction, breath and gust
 * all come from the one frame weather plan, never from a local oscillator.
 */
export function patchGardenInstancedWindSway(
  material: MeshStandardMaterial,
  heightScale: number,
  baseFlex = 0,
): void {
  const uniforms: GardenWindSwayUniforms = {
    uGardenWindDirection: { value: { x: 0, y: 0 } },
    uGardenWindStrength: { value: 0 },
  };
  material.userData.gardenWindSwayUniforms = uniforms;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.uGardenWindDirection = uniforms.uGardenWindDirection;
    shader.uniforms.uGardenWindStrength = uniforms.uGardenWindStrength;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aGardenSway;
        uniform vec2 uGardenWindDirection;
        uniform float uGardenWindStrength;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 gardenWindWorld = vec3(uGardenWindDirection.x, 0.0, uGardenWindDirection.y);
          vec2 gardenWindLocal = vec2(
            dot(gardenWindWorld, normalize(instanceMatrix[0].xyz)),
            dot(gardenWindWorld, normalize(instanceMatrix[2].xyz))
          );
          float gardenWindHeight = clamp(position.y / ${heightScale.toFixed(3)}, 0.0, 1.0);
          float gardenWindFlex = mix(${baseFlex.toFixed(3)}, 1.0, gardenWindHeight * gardenWindHeight);
          transformed.xz += gardenWindLocal * uGardenWindStrength * aGardenSway * gardenWindFlex;
        #endif`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}|garden-instanced-wind-sway-${heightScale}-${baseFlex}`;
  material.needsUpdate = true;
}

export function updateGardenInstancedWindSway(
  material: MeshStandardMaterial,
  weather: WeatherPlan,
  reducedMotion: boolean,
): void {
  const uniforms = material.userData.gardenWindSwayUniforms as GardenWindSwayUniforms | undefined;
  if (!uniforms) return;
  uniforms.uGardenWindDirection.value.x = weather.windDirX;
  uniforms.uGardenWindDirection.value.y = weather.windDirZ;
  const gust = reducedMotion ? 0 : weather.gust;
  uniforms.uGardenWindStrength.value = (
    0.035 + weather.windSpeed * 0.085 + gust * 0.14
  ) * (0.9 + weather.breath * 0.2);
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
  // Two broken outcrop shelves interrupt continuous earth, not every contour.
  const outcrop = MathUtils.smoothstep(
    Math.sin(tileX * 0.12 + tileY * 0.055) + Math.sin(tileY * 0.17 - 0.8),
    0.35, 1.45,
  );
  const ledge = outcrop * (
    MathUtils.smoothstep(inland, 1.2, 1.65) * 0.22
    + MathUtils.smoothstep(inland, 4.1, 4.8) * 0.28
  );
  // Danger Strait retains its single deliberate cliff with tapered ends.
  const dangerCliff = MathUtils.smoothstep(tileX, MAP_LAST - 10, MAP_LAST - 6)
    * MathUtils.smoothstep(tileY, 38, 44)
    * (1 - MathUtils.smoothstep(tileY, 76, 82)) * 0.38;
  const grain = Math.sin(tileX * 0.43 + tileY * 0.31) * 0.045;
  const height = Math.max(0.6, Math.min(3.1, rise + ledge + dangerCliff + grain));
  const beyond = Math.max(0, tileX - MAP_LAST, tileY - MAP_LAST);
  if (beyond <= 0) return height;
  // The skirt lets its surface down toward the outer margin so the land
  // recedes into the haze instead of ending as a wall at the plate limit.
  const recede = Math.min(1, beyond / (CAMERA_SIDE_SKIRT_REACH_TILES + 2));
  const letDown = 1 - 0.5 * recede * recede;
  // Gentle swells and dells keep the apron from reading as one flat plane.
  // The term eases in over the first tile and a half (no seam against the
  // authored rim), rides under the let-down, and is capped at the un-lowered
  // height so the skirt always stays below the in-bounds rim crest.
  const swellEase = Math.min(1, beyond / 1.5);
  const swell = (Math.sin(tileX * 0.31 + tileY * 0.23) * 0.3
    + Math.sin(tileX * 0.11 - tileY * 0.27 + 1.7) * 0.22) * swellEase * letDown;
  return Math.max(0.45, Math.min(height, height * letDown + swell));
}

function rimColor(tileX: number, tileY: number): Color {
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  const moss = MathUtils.smoothstep(inland, 0.8, 6) * GARDEN_RIM_MOSS_BLEND_MAX;
  const color = WET_ROCK.clone().lerp(EARTH, MathUtils.smoothstep(inland, 0, 2.4)).lerp(MOSS, moss);
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

function addShoreCourses(
  builder: GeometryBuilder,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
  topColor: Color,
  outwardX: number,
  outwardZ: number,
): void {
  const stainY = Math.min(a[1], b[1], 0.34);
  const stainA = pointAtY(a, stainY);
  const stainB = pointAtY(b, stainY);
  addQuad(builder, a, b, stainB, stainA, [topColor, topColor, TIDE_STAIN, TIDE_STAIN]);
  addQuad(builder, stainA, stainB, c, d, [TIDE_STAIN, TIDE_STAIN, WET_ROCK, WET_ROCK]);
  // A shallow shelf makes the wet course legible from the locked high camera.
  // It replaces the old razor-thin vertical waterline edge.
  const shelf = 0.34 + stableUnit(`wet-shelf.${a[0].toFixed(1)}.${a[2].toFixed(1)}`) * 0.3;
  const waterA = pointAtY(a, WATERLINE_Y + 0.045);
  const waterB = pointAtY(b, WATERLINE_Y + 0.045);
  const outerA: [number, number, number] = [
    waterA[0] + outwardX * shelf,
    waterA[1] - 0.025,
    waterA[2] + outwardZ * shelf,
  ];
  const outerB: [number, number, number] = [
    waterB[0] + outwardX * shelf,
    waterB[1] - 0.025,
    waterB[2] + outwardZ * shelf,
  ];
  addQuad(builder, waterA, waterB, outerB, outerA, [TIDE_STAIN, TIDE_STAIN, WET_ROCK, WET_ROCK]);
}

function buildLandGeometry(): { face: BufferGeometry; top: BufferGeometry } {
  const top: GeometryBuilder = { colors: [], indices: [], positions: [] };
  const face: GeometryBuilder = { colors: [], indices: [], positions: [] };
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
        addShoreCourses(
          face,
          side.a,
          side.b,
          pointAtY(side.b, WATERLINE_Y),
          pointAtY(side.a, WATERLINE_Y),
          rimColor(cx, cy),
          side.dx / SAMPLE_STEP,
          side.dy / SAMPLE_STEP,
        );
      }
    }
  }
  const topGeometry = finishGeometry(top);
  topGeometry.deleteAttribute("normal");
  const smoothTop = mergeVertices(topGeometry);
  smoothTop.computeVertexNormals();
  topGeometry.dispose();
  return { face: finishGeometry(face), top: smoothTop };
}

function colorGeometry(geometry: BufferGeometry, color: Color): BufferGeometry {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

function createPineGeometry(
  trunk: Color = PINE_TRUNK,
  needle: Color = PINE_NEEDLE,
): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  const branch = (from: number[], to: number[], base: number, tip: number, sides: number) => {
    const start = new Vector3(...from);
    const end = new Vector3(...to);
    const direction = end.clone().sub(start);
    const wood = colorGeometry(new CylinderGeometry(tip, base, direction.length(), sides, 1, true), trunk);
    wood.applyQuaternion(new Quaternion().setFromUnitVectors(up, direction.normalize()));
    wood.translate(...start.add(end).multiplyScalar(0.5).toArray());
    pieces.push(wood);
  };
  branch([0, 0, 0], [0.32, 1.65, 0.08], 0.32, 0.23, 5);
  branch([0.32, 1.65, 0.08], [-0.16, 3.0, 0.12], 0.24, 0.15, 5);
  branch([-0.16, 3.0, 0.12], [0.35, 4.14, -0.08], 0.16, 0.06, 5);
  branch([0.22, 1.85, 0.09], [-1.02, 2.45, 0.25], 0.14, 0.04, 4);
  branch([-0.03, 2.65, 0.11], [0.95, 3.14, -0.25], 0.12, 0.035, 4);
  branch([-0.08, 3.2, 0.09], [-0.62, 3.54, 0.4], 0.085, 0.025, 4);
  const padSpecs = [
    [-1.0, 2.57, 0.25, 1.12, 0.44, 0.78, -0.14],
    [0.93, 3.2, -0.25, 0.98, 0.36, 0.66, 0.18],
    [-0.57, 3.64, 0.4, 0.73, 0.34, 0.58, -0.2],
    [0.36, 4.1, -0.08, 0.72, 0.4, 0.56, 0.12],
  ] as const;
  for (const [x, y, z, sx, sy, sz, tilt] of padSpecs) {
    const pad = colorGeometry(new SphereGeometry(1, 8, 4), needle);
    pad.scale(sx, sy, sz);
    pad.rotateZ(tilt);
    pad.translate(x, y, z);
    pieces.push(pad);
  }
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  return geometry;
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
  for (let y = 3; y < MAP_LAST - 2; y += 3) {
    for (let x = 3; x < MAP_LAST - 2; x += 3) {
      if (!rimLandAt(x, y) || authoredDistance(x, y) > -2.2 || !clearOfStation(x, y, 3)) continue;
      if (HEADLANDS.some((headland) => Math.hypot(x - headland.x, y - headland.y) < 4.5)) continue;
      // The engawa is one silhouette, not another grove: its hero tree
      // explicitly displaces every ordinary pine in this near-corner pocket.
      if (Math.hypot(x - 86, y - 134) < 11) continue;
      // Same rule for the two foreground mass pockets (warm-village A6).
      if (inForegroundMassPocket(x, y)) continue;
      const lowerLeft = x < 48 && y > 72;
      const thinEast = x > 122;
      const keep = lowerLeft ? 0.92 : thinEast ? 0.12 : 0.3;
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
  return candidates;
}

function createPines(): InstancedMesh {
  const specs = pineTiles();
  const material = new MeshStandardMaterial({ flatShading: true, roughness: 0.94, vertexColors: true });
  patchGardenInstancedWindSway(material, 4.6, 0.08);
  const mesh = new InstancedMesh(
    createPineGeometry(),
    material,
    specs.length,
  );
  mesh.name = "garden-rim-pines";
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const rotation = new Euler();
  const scale = new Vector3();
  const sway = new Float32Array(specs.length);
  specs.forEach((spec, index) => {
    rotation.set(spec.leanX, spec.yaw, spec.leanZ);
    quaternion.setFromEuler(rotation);
    scale.set(spec.scale, spec.scale, spec.scale);
    matrix.compose(
      new Vector3(spec.x * TILE_SCALE, rimHeight(spec.x, spec.y), spec.y * TILE_SCALE),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
    sway[index] = 0.68 + stableUnit(`rim-pine-sway.${spec.x}.${spec.y}`) * 0.52;
  });
  mesh.geometry.setAttribute("aGardenSway", new InstancedBufferAttribute(sway, 1));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
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

function createStones(): InstancedMesh {
  const steppingStones = [
    { scale: [1.05, 0.28, 0.82] as const, x: 82.4, y: 131.4, yaw: -0.18 },
    { scale: [0.86, 0.22, 1.08] as const, x: 81.7, y: 129.0, yaw: 0.31 },
    { scale: [1.12, 0.25, 0.72] as const, x: 82.6, y: 126.6, yaw: -0.42 },
  ].filter((stone) => clearOfStation(stone.x, stone.y));
  const skirtStones = skirtStoneTiles();
  const count = HEADLANDS.length * 3 + steppingStones.length + skirtStones.length;
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
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Warm-village A6: camera-near foreground silhouette masses.
//
// Sited at the zoom-1.0 rest (`defaultCamera`, warm-village), where the frame
// was an interior window on the Pharos–Mole interval and the bottom-left
// corner of 1568×1004 landed on the south-west skirt around tile (59.7,140.7)
// with the bottom-right on interior water. The rest has since opened out to
// 0.72 (2026-09-06); the same masses now read as near-shore silhouettes in
// the lower-left quarter instead of bleeding past the frame edge, and they
// keep their place — exactly one rest corner carries land, and these two own
// it: a dark pine group and a low kuro torii with a fence run, both past
// tile 139 on decorative skirt land. They displace the open-water band named
// by GARDEN_NEAR_RIM_SKIRT_DISPLACEMENT — no new prop vocabulary, no tile
// reclassification, no navigation/placement change, and nothing emissive:
// after dark they are black shapes against the sea (night one-dominant-light
// untouched). The calm-engawa-south station envelope reaches y≈143 at
// x 57–63, so both masses sit east of tile 66 to keep the rim's own
// three-tile scenery margin.
// ---------------------------------------------------------------------------

export const GARDEN_RIM_FOREGROUND_PINE_NAME = "garden-rim-foreground-pines";
export const GARDEN_RIM_FOREGROUND_TORII_NAME = "garden-rim-foreground-torii";

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

const FOREGROUND_PINES = [
  { height: 15.4, leanX: -0.06, leanZ: 0.1, tileX: 71.5, tileY: 141.6, yaw: 2.2 },
  { height: 10.8, leanX: 0.04, leanZ: -0.05, tileX: 72.6, tileY: 142.8, yaw: 4.1 },
  { height: 13.2, leanX: -0.03, leanZ: 0.07, tileX: 74.3, tileY: 144.2, yaw: 0.7 },
  { height: 12.0, leanX: 0, leanZ: 0, tileX: 75.9, tileY: 142.5, yaw: 3.1 },
] as const;
const FOREGROUND_GATE = { tileX: 66.8, tileY: 142.0, yaw: -0.32 } as const;
const FOREGROUND_FENCE_POSTS = [
  { height: 2.6, tileX: 68.6, tileY: 143.0 },
  { height: 2.7, tileX: 69.7, tileY: 143.6 },
  { height: 2.8, tileX: 70.8, tileY: 144.2 },
] as const;

/**
 * The authored masses. Heights are crest heights; `height` doubles as the
 * declared per-mass crest for the contract test, and both masses stay well
 * inside the renderer budget (≤ 2 draw calls, ≤ 1.2k triangles together).
 */
export const GARDEN_RIM_FOREGROUND_MASSES: readonly GardenRimForegroundMassSpec[] = [
  {
    clearRadiusTiles: 4.5,
    height: 15.4,
    name: GARDEN_RIM_FOREGROUND_PINE_NAME,
    tile: {
      x: (Math.min(...FOREGROUND_PINES.map((pine) => pine.tileX))
        + Math.max(...FOREGROUND_PINES.map((pine) => pine.tileX))) / 2,
      y: (Math.min(...FOREGROUND_PINES.map((pine) => pine.tileY))
        + Math.max(...FOREGROUND_PINES.map((pine) => pine.tileY))) / 2,
    },
  },
  {
    clearRadiusTiles: 4.5,
    height: 6.22,
    name: GARDEN_RIM_FOREGROUND_TORII_NAME,
    tile: { x: FOREGROUND_GATE.tileX, y: FOREGROUND_GATE.tileY },
  },
] as const;

function inForegroundMassPocket(tileX: number, tileY: number): boolean {
  return GARDEN_RIM_FOREGROUND_MASSES.some((mass) => (
    Math.hypot(tileX - mass.tile.x, tileY - mass.tile.y) < mass.clearRadiusTiles
  ));
}

function createForegroundPines(): Mesh {
  const pieces: BufferGeometry[] = [];
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const rotation = new Euler();
  const scale = new Vector3();
  for (const pine of FOREGROUND_PINES) {
    rotation.set(pine.leanX, pine.yaw, pine.leanZ);
    quaternion.setFromEuler(rotation);
    scale.setScalar(pine.height / 4.5);
    matrix.compose(
      new Vector3(
        pine.tileX * TILE_SCALE,
        rimHeight(pine.tileX, pine.tileY) - 0.12,
        pine.tileY * TILE_SCALE,
      ),
      quaternion,
      scale,
    );
    const piece = createPineGeometry(FOREGROUND_PINE_TRUNK, FOREGROUND_PINE_NEEDLE);
    piece.applyMatrix4(matrix);
    pieces.push(piece);
  }
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ flatShading: true, roughness: 0.95, vertexColors: true }),
  );
  mesh.name = GARDEN_RIM_FOREGROUND_PINE_NAME;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createForegroundTorii(): Mesh {
  const pieces: BufferGeometry[] = [];
  const alongX = Math.cos(FOREGROUND_GATE.yaw);
  // rotateY maps +X to (cos yaw, -sin yaw); the placement vector follows the
  // same convention so members sit on the line their rotation lays out.
  const alongZ = -Math.sin(FOREGROUND_GATE.yaw);
  const gateX = FOREGROUND_GATE.tileX * TILE_SCALE;
  const gateZ = FOREGROUND_GATE.tileY * TILE_SCALE;
  const ground = rimHeight(FOREGROUND_GATE.tileX, FOREGROUND_GATE.tileY);
  // Yawed (and optionally pitched) timber member; length rides the X axis,
  // pitch rotates the +X end upward, then yaw turns it into place.
  const timber = (
    length: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    color: Color,
    yaw: number = FOREGROUND_GATE.yaw,
    pitch = 0,
  ) => {
    const piece = colorGeometry(new BoxGeometry(length, height, depth), color);
    if (pitch !== 0) piece.rotateZ(pitch);
    piece.rotateY(yaw);
    piece.translate(x, y, z);
    pieces.push(piece);
  };
  // Kuro gate: no vermillion — the reserved accent stays with the beacon and
  // danger semantics, and a silhouette mass reads by value, not by hue.
  for (const side of [-1, 1]) {
    timber(
      0.52, 6.15, 0.52,
      gateX + side * 2.9 * alongX, ground + 2.75, gateZ + side * 2.9 * alongZ,
      FOREGROUND_TIMBER,
    );
  }
  timber(6.3, 0.36, 0.44, gateX, ground + 4.35, gateZ, FOREGROUND_TIMBER);
  timber(0.32, 0.95, 0.32, gateX, ground + 4.95, gateZ, FOREGROUND_TIMBER);
  timber(7.2, 0.34, 0.5, gateX, ground + 5.4, gateZ, FOREGROUND_TIMBER);
  timber(8.1, 0.44, 0.58, gateX, ground + 6.0, gateZ, FOREGROUND_TIMBER_LIT);
  // The fence run reads east from the gate along the skirt shore; two rails
  // thread the post tops so the line follows the land, not a plane.
  const anchors = [
    { x: gateX + 2.9 * alongX, y: ground, z: gateZ + 2.9 * alongZ },
    ...FOREGROUND_FENCE_POSTS.map((post) => ({
      x: post.tileX * TILE_SCALE,
      y: rimHeight(post.tileX, post.tileY),
      z: post.tileY * TILE_SCALE,
    })),
  ];
  for (const post of FOREGROUND_FENCE_POSTS) {
    timber(
      0.34, post.height, 0.34,
      post.tileX * TILE_SCALE,
      rimHeight(post.tileX, post.tileY) + post.height / 2 - 0.2,
      post.tileY * TILE_SCALE,
      FOREGROUND_TIMBER,
    );
  }
  for (const railHeight of [1.35, 2.25]) {
    for (let index = 1; index < anchors.length; index += 1) {
      const a = anchors[index - 1]!;
      const b = anchors[index]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const run = Math.hypot(dx, dz);
      timber(
        run + 0.3, 0.14, 0.1,
        (a.x + b.x) / 2, (a.y + b.y) / 2 + railHeight, (a.z + b.z) / 2,
        FOREGROUND_TIMBER,
        Math.atan2(-dz, dx),
        Math.atan2(b.y - a.y, run),
      );
    }
  }
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ flatShading: true, roughness: 0.95, vertexColors: true }),
  );
  mesh.name = GARDEN_RIM_FOREGROUND_TORII_NAME;
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

export function createGardenRimMesh(): GardenRimMesh {
  const root = new Group();
  root.name = "garden-rim";
  const land = buildLandGeometry();
  const landMaterial = new MeshStandardMaterial({ flatShading: false, roughness: 0.98, vertexColors: true });
  const top = new Mesh(land.top, landMaterial);
  top.name = "garden-rim-land";
  const face = new Mesh(land.face, landMaterial);
  face.name = "garden-rim-tide-rock";
  const pines = createPines();
  const stones = createStones();
  const foregroundPines = createForegroundPines();
  const foregroundTorii = createForegroundTorii();
  const path = buildPathGeometry();
  const pathMesh = new Mesh(
    path.geometry,
    new MeshStandardMaterial({ flatShading: true, roughness: 1, vertexColors: true }),
  );
  pathMesh.name = "garden-rim-path";
  root.add(top, face, pathMesh, pines, stones, foregroundPines, foregroundTorii);
  const drawables = [top, face, pathMesh, pines, stones, foregroundPines, foregroundTorii];
  for (const object of drawables) {
    object.castShadow = true;
    object.receiveShadow = true;
  }
  let disposed = false;
  return {
    coveSpurCount: path.coveSpurs,
    drawCallCount: 7,
    engawaPineCount: 1,
    foregroundMassCount: 2,
    pathSegmentCount: path.segments,
    pineInstances: pines,
    pineCount: pines.count,
    root,
    stoneCount: stones.count,
    steppingStoneCount: 3,
    triangleCount: drawables.reduce((sum, mesh) => (
      sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3
        * (mesh instanceof InstancedMesh ? mesh.count : 1)
    ), 0),
    updateWind(weather, reducedMotion) {
      updateGardenInstancedWindSway(pines.material as MeshStandardMaterial, weather, reducedMotion);
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
