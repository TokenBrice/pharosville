import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  RIM_COVES,
  rimLandAt,
  rimShoreDistance,
} from "../systems/garden-rim";
import { PHAROSVILLE_DESIGN_SPAN, PHAROSVILLE_MAP_SCALE } from "../systems/map-scale";
import { HARBOR_PALETTE } from "../systems/palette";
import type { WeatherPlan } from "../systems/weather";
import { TILE_SCALE, disposeThreeObjectTree, stableUnit } from "./garden-util";

const MAP_SIZE = PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE;
const MAP_LAST = MAP_SIZE - 1;
const WATERLINE_Y = -0.11;
const SAMPLE_STEP = 0.5;

// Decorative garden frame only: rim form, planting, stones, and the stroll
// ribbon carry no market or risk meaning.

const WET_ROCK = new Color(HARBOR_PALETTE.deep_sea_2).lerp(
  new Color(HARBOR_PALETTE.stone_dark),
  0.42,
);
const TIDE_STAIN = new Color(HARBOR_PALETTE.stone_dark)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.18)
  .multiplyScalar(0.72);
const EARTH = new Color(HARBOR_PALETTE.timber_dark).lerp(
  new Color(HARBOR_PALETTE.stone_mid),
  0.5,
);
const MOSS = new Color(HARBOR_PALETTE.sail_teal).lerp(
  new Color(HARBOR_PALETTE.aurora_green),
  0.28,
);
const PATH_STONE = new Color(HARBOR_PALETTE.stone_pale).lerp(
  new Color(HARBOR_PALETTE.fog_day),
  0.16,
);
const PINE_TRUNK = new Color(HARBOR_PALETTE.timber_dark);
const PINE_NEEDLE = new Color(HARBOR_PALETTE.sail_teal).multiplyScalar(0.68);
const LANTERN_EMBER = new Color(HARBOR_PALETTE.lantern_warm);

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

function authoredDistance(tileX: number, tileY: number): number {
  return rimShoreDistance(tileX, tileY) + shoreJitter(tileX, tileY);
}

function rimHeight(tileX: number, tileY: number): number {
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  const rise = 0.62 + Math.min(1, inland / 7.5) * 1.5;
  // Danger Strait's east bank is the one deliberate cliff face.
  const dangerCliff = tileX > MAP_LAST - 8 && tileY > 38 && tileY < 82 ? 0.38 : 0;
  const stepped = 0.6 + Math.floor(Math.max(0, rise + dangerCliff - 0.6) / 0.34) * 0.34;
  const grain = (stableUnit(`rim-height.${Math.round(tileX * 2)}.${Math.round(tileY * 2)}`) - 0.5) * 0.055;
  return Math.max(0.6, Math.min(2.2, stepped + grain));
}

function rimColor(tileX: number, tileY: number): Color {
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  const moss = Math.min(0.52, Math.max(0, (inland - 0.8) / 6));
  const color = EARTH.clone().lerp(MOSS, moss);
  color.multiplyScalar(0.88 + stableUnit(`rim-color.${Math.round(tileX)}.${Math.round(tileY)}`) * 0.16);
  return color;
}

function isSubtileLand(tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX > MAP_LAST || tileY > MAP_LAST) return false;
  return authoredDistance(tileX, tileY) <= 0;
}

function shoreVertexTile(tileX: number, tileY: number): { x: number; y: number } {
  const quarter = SAMPLE_STEP * 0.5;
  const neighbourhood = [
    isSubtileLand(tileX - quarter, tileY - quarter),
    isSubtileLand(tileX + quarter, tileY - quarter),
    isSubtileLand(tileX - quarter, tileY + quarter),
    isSubtileLand(tileX + quarter, tileY + quarter),
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
  return {
    x: Math.max(0, Math.min(MAP_LAST, tileX + moveX)),
    y: Math.max(0, Math.min(MAP_LAST, tileY + moveY)),
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
): void {
  const stainY = Math.min(a[1], b[1], 0.34);
  const stainA = pointAtY(a, stainY);
  const stainB = pointAtY(b, stainY);
  addQuad(builder, a, b, stainB, stainA, [topColor, topColor, TIDE_STAIN, TIDE_STAIN]);
  addQuad(builder, stainA, stainB, c, d, [TIDE_STAIN, TIDE_STAIN, WET_ROCK, WET_ROCK]);
}

function buildLandGeometry(): { face: BufferGeometry; top: BufferGeometry } {
  const top: GeometryBuilder = { colors: [], indices: [], positions: [] };
  const face: GeometryBuilder = { colors: [], indices: [], positions: [] };
  const half = SAMPLE_STEP / 2;
  const samples = Math.round(MAP_SIZE / SAMPLE_STEP);
  for (let iy = 0; iy < samples; iy += 1) {
    const cy = iy * SAMPLE_STEP + half;
    for (let ix = 0; ix < samples; ix += 1) {
      const cx = ix * SAMPLE_STEP + half;
      if (!isSubtileLand(cx, cy)) continue;
      const p00 = shoreVertexTile(cx - half, cy - half);
      const p10 = shoreVertexTile(cx + half, cy - half);
      const p11 = shoreVertexTile(cx + half, cy + half);
      const p01 = shoreVertexTile(cx - half, cy + half);
      // Heights are sampled at shared corners so neighbouring tiles remain a
      // watertight sheet. Quantisation in rimHeight still creates broad,
      // unequal terraces without the hairline cracks of disconnected slabs.
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
        if (isSubtileLand(cx + side.dx, cy + side.dy)) continue;
        addShoreCourses(
          face,
          side.a,
          side.b,
          pointAtY(side.b, WATERLINE_Y),
          pointAtY(side.a, WATERLINE_Y),
          rimColor(cx, cy),
        );
      }
    }
  }
  return { face: finishGeometry(face), top: finishGeometry(top) };
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

function createPineGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  const trunk = colorGeometry(new CylinderGeometry(0.22, 0.36, 4.5, 7), PINE_TRUNK);
  trunk.translate(0, 2.25, 0);
  pieces.push(trunk);
  const padSpecs = [
    [-0.6, 2.5, 0.15, 1.55, 0.34, 1.1],
    [0.48, 3.35, -0.12, 1.4, 0.28, 0.96],
    [-0.18, 4.15, 0.08, 1.05, 0.25, 0.8],
  ] as const;
  for (const [x, y, z, sx, sy, sz] of padSpecs) {
    const pad = colorGeometry(new SphereGeometry(1, 9, 5), PINE_NEEDLE);
    pad.scale(sx, sy, sz);
    pad.translate(x, y, z);
    pieces.push(pad);
  }
  return mergeGeometries(pieces, false)!;
}

function clearOfCove(tileX: number, tileY: number, extra = 2): boolean {
  return RIM_COVES.every((cove) => (
    Math.hypot(tileX - cove.tile.x, tileY - cove.tile.y) > cove.width * 0.5 + extra
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
      if (!rimLandAt(x, y) || rimShoreDistance(x, y) > -2.2 || !clearOfCove(x, y, 3)) continue;
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
  candidates.push({ leanX: -0.3, leanZ: 0.1, scale: 1.42, x: 86, y: 134, yaw: 0.4 });
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
] as const;

function createStones(): InstancedMesh {
  const steppingStones = [
    { scale: [1.05, 0.28, 0.82] as const, x: 82.4, y: 131.4, yaw: -0.18 },
    { scale: [0.86, 0.22, 1.08] as const, x: 81.7, y: 129.0, yaw: 0.31 },
    { scale: [1.12, 0.25, 0.72] as const, x: 82.6, y: 126.6, yaw: -0.42 },
  ];
  const count = HEADLANDS.length * 3 + steppingStones.length;
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
    if (!clearOfCove(a.x, a.y, 2.5) || !clearOfCove(b.x, b.y, 2.5)) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) > 3) continue;
    if (addPathRibbon(builder, a, b)) segments += 1;
  }
  let coveSpurs = 0;
  for (const cove of RIM_COVES) {
    const landward = {
      x: cove.tile.x - Math.cos(cove.seawardBearing) * 1.6,
      y: cove.tile.y - Math.sin(cove.seawardBearing) * 1.6,
    };
    const perimeter = cove.tile.x < 24
      ? { x: 3, y: landward.y }
      : cove.tile.x > MAP_LAST - 24
        ? { x: MAP_LAST - 3, y: landward.y }
        : cove.tile.y < 24
          ? { x: landward.x, y: 3 }
          : { x: landward.x, y: MAP_LAST - 3 };
    const steps = Math.max(1, Math.ceil(Math.hypot(
      landward.x - perimeter.x,
      landward.y - perimeter.y,
    ) / 1.5));
    for (let step = 1; step <= steps; step += 1) {
      const t0 = (step - 1) / steps;
      const t1 = step / steps;
      const a = {
        x: perimeter.x + (landward.x - perimeter.x) * t0,
        y: perimeter.y + (landward.y - perimeter.y) * t0,
      };
      const b = {
        x: perimeter.x + (landward.x - perimeter.x) * t1,
        y: perimeter.y + (landward.y - perimeter.y) * t1,
      };
      if (addPathRibbon(builder, a, b)) {
        segments += 1;
        coveSpurs += 1;
      }
    }
  }
  // One tōrō at the camera-side engawa. Stone body and warm chamber are merged
  // into the path draw; its water reflection is registered separately as the
  // scene's `engawa-lantern` ember lane.
  const lanternX = GARDEN_ENGAWA_LANTERN_WORLD.x;
  const lanternZ = GARDEN_ENGAWA_LANTERN_WORLD.z;
  const lanternGround = rimHeight(ENGAWA_LANTERN_TILE.x, ENGAWA_LANTERN_TILE.y);
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
  const landMaterial = new MeshStandardMaterial({ flatShading: true, roughness: 0.98, vertexColors: true });
  const top = new Mesh(land.top, landMaterial);
  top.name = "garden-rim-land";
  const face = new Mesh(land.face, landMaterial);
  face.name = "garden-rim-tide-rock";
  const pines = createPines();
  const stones = createStones();
  const path = buildPathGeometry();
  const pathMesh = new Mesh(
    path.geometry,
    new MeshStandardMaterial({ flatShading: true, roughness: 1, vertexColors: true }),
  );
  pathMesh.name = "garden-rim-path";
  root.add(top, face, pathMesh, pines, stones);
  for (const object of [top, face, pathMesh, pines, stones]) {
    object.castShadow = true;
    object.receiveShadow = true;
  }
  let disposed = false;
  return {
    coveSpurCount: path.coveSpurs,
    drawCallCount: 5,
    engawaPineCount: 1,
    pathSegmentCount: path.segments,
    pineInstances: pines,
    pineCount: pines.count,
    root,
    stoneCount: stones.count,
    steppingStoneCount: 3,
    triangleCount: [top, face, pathMesh, pines, stones].reduce((sum, mesh) => (
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
