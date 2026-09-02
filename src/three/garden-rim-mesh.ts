import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Group,
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
import { TILE_SCALE, disposeThreeObjectTree, stableUnit } from "./garden-util";

const MAP_SIZE = PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE;
const MAP_LAST = MAP_SIZE - 1;
const WATERLINE_Y = -0.11;
const SAMPLE_STEP = 0.5;

const WET_ROCK = new Color(HARBOR_PALETTE.deep_sea_2).lerp(
  new Color(HARBOR_PALETTE.stone_dark),
  0.42,
);
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

interface GeometryBuilder {
  colors: number[];
  indices: number[];
  positions: number[];
}

export interface GardenRimMesh {
  drawCallCount: number;
  pathSegmentCount: number;
  pineCount: number;
  root: Group;
  stoneCount: number;
  triangleCount: number;
  dispose(): void;
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
  const keyX = Math.round(tileX / SAMPLE_STEP);
  const keyY = Math.round(tileY / SAMPLE_STEP);
  return (stableUnit(`rim-shore.${keyX}.${keyY}`) - 0.5) * 0.8;
}

function authoredDistance(tileX: number, tileY: number): number {
  return rimShoreDistance(tileX, tileY) + shoreJitter(tileX, tileY);
}

function rimHeight(tileX: number, tileY: number): number {
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  const rise = 0.6 + Math.min(1, inland / 7.5) * 1.48;
  const grain = (stableUnit(`rim-height.${Math.round(tileX * 2)}.${Math.round(tileY * 2)}`) - 0.5) * 0.2;
  // Danger Strait's east bank is the one deliberate cliff face.
  const dangerCliff = tileX > MAP_LAST - 7 && tileY > 38 && tileY < 82 ? 0.32 : 0;
  return Math.min(2.2, rise + grain + dangerCliff);
}

function rimColor(tileX: number, tileY: number): Color {
  const inland = Math.max(0, -authoredDistance(tileX, tileY));
  const moss = Math.min(0.82, Math.max(0, (inland - 0.45) / 5));
  const color = EARTH.clone().lerp(MOSS, moss);
  color.multiplyScalar(0.88 + stableUnit(`rim-color.${Math.round(tileX)}.${Math.round(tileY)}`) * 0.16);
  return color;
}

function isSubtileLand(tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX > MAP_LAST || tileY > MAP_LAST) return false;
  return authoredDistance(tileX, tileY) <= 0;
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
      const x0 = (cx - half) * TILE_SCALE;
      const x1 = (cx + half) * TILE_SCALE;
      const z0 = (cy - half) * TILE_SCALE;
      const z1 = (cy + half) * TILE_SCALE;
      const h00 = rimHeight(cx - half, cy - half);
      const h10 = rimHeight(cx + half, cy - half);
      const h11 = rimHeight(cx + half, cy + half);
      const h01 = rimHeight(cx - half, cy + half);
      addQuad(
        top,
        [x0, h00, z0], [x1, h10, z0], [x1, h11, z1], [x0, h01, z1],
        [rimColor(cx - half, cy - half), rimColor(cx + half, cy - half), rimColor(cx + half, cy + half), rimColor(cx - half, cy + half)],
      );
      const sides = [
        { dx: -SAMPLE_STEP, dy: 0, a: [x0, h01, z1], b: [x0, h00, z0], c: [x0, WATERLINE_Y, z0], d: [x0, WATERLINE_Y, z1] },
        { dx: SAMPLE_STEP, dy: 0, a: [x1, h10, z0], b: [x1, h11, z1], c: [x1, WATERLINE_Y, z1], d: [x1, WATERLINE_Y, z0] },
        { dx: 0, dy: -SAMPLE_STEP, a: [x0, h00, z0], b: [x1, h10, z0], c: [x1, WATERLINE_Y, z0], d: [x0, WATERLINE_Y, z0] },
        { dx: 0, dy: SAMPLE_STEP, a: [x1, h11, z1], b: [x0, h01, z1], c: [x0, WATERLINE_Y, z1], d: [x1, WATERLINE_Y, z1] },
      ] as const;
      for (const side of sides) {
        if (isSubtileLand(cx + side.dx, cy + side.dy)) continue;
        addQuad(face, side.a, side.b, side.c, side.d, [EARTH, EARTH, WET_ROCK, WET_ROCK]);
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

function pineTiles(): Array<{ scale: number; x: number; y: number; yaw: number }> {
  const candidates: Array<{ scale: number; x: number; y: number; yaw: number }> = [];
  for (let y = 4; y < MAP_LAST - 3; y += 4) {
    for (let x = 4; x < MAP_LAST - 3; x += 4) {
      if (!rimLandAt(x, y) || rimShoreDistance(x, y) > -2.2 || !clearOfCove(x, y, 3)) continue;
      const lowerLeft = x < 48 && y > 72;
      const thinEast = x > 122;
      const keep = lowerLeft ? 0.88 : thinEast ? 0.18 : 0.42;
      const unit = stableUnit(`rim-pine.${x}.${y}`);
      if (unit > keep) continue;
      candidates.push({
        scale: 0.78 + stableUnit(`rim-pine-scale.${x}.${y}`) * (lowerLeft ? 0.72 : 0.48),
        x,
        y,
        yaw: stableUnit(`rim-pine-yaw.${x}.${y}`) * Math.PI * 2,
      });
    }
  }
  return candidates;
}

function createPines(): InstancedMesh {
  const specs = pineTiles();
  const mesh = new InstancedMesh(
    createPineGeometry(),
    new MeshStandardMaterial({ flatShading: true, roughness: 0.94, vertexColors: true }),
    specs.length,
  );
  mesh.name = "garden-rim-pines";
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  specs.forEach((spec, index) => {
    quaternion.setFromAxisAngle(new Vector3(0, 1, 0), spec.yaw);
    scale.set(spec.scale, spec.scale, spec.scale);
    matrix.compose(
      new Vector3(spec.x * TILE_SCALE, rimHeight(spec.x, spec.y), spec.y * TILE_SCALE),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const HEADLANDS = [
  { x: 5, y: 110 },
  { x: 78, y: 4 },
  { x: 135, y: 100 },
] as const;

function createStones(): InstancedMesh {
  const count = HEADLANDS.length * 3;
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
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function buildPathGeometry(): { geometry: BufferGeometry; segments: number } {
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
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const px = -dy / length * 0.42;
    const py = dx / length * 0.42;
    const ay = rimHeight(a.x, a.y) + 0.045;
    const by = rimHeight(b.x, b.y) + 0.045;
    addQuad(
      builder,
      [(a.x + px) * TILE_SCALE, ay, (a.y + py) * TILE_SCALE],
      [(b.x + px) * TILE_SCALE, by, (b.y + py) * TILE_SCALE],
      [(b.x - px) * TILE_SCALE, by, (b.y - py) * TILE_SCALE],
      [(a.x - px) * TILE_SCALE, ay, (a.y - py) * TILE_SCALE],
      [PATH_STONE, PATH_STONE, PATH_STONE, PATH_STONE],
    );
    segments += 1;
  }
  return { geometry: finishGeometry(builder), segments };
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
    drawCallCount: 5,
    pathSegmentCount: path.segments,
    pineCount: pines.count,
    root,
    stoneCount: stones.count,
    triangleCount: [top, face, pathMesh, pines, stones].reduce((sum, mesh) => (
      sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3
        * (mesh instanceof InstancedMesh ? mesh.count : 1)
    ), 0),
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeThreeObjectTree(root);
      root.clear();
    },
  };
}
