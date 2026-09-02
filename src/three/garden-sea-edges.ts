import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_SEA_EDGE_SITES,
  type GardenSeaEdgeMaterial,
  type GardenSeaEdgeSite,
} from "../systems/garden-sea-edge-sites";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { applyGardenHeightFog } from "./garden-height-fog";
import { TILE_SCALE } from "./garden-util";
import type { WeatherPlan } from "../systems/weather";
import {
  patchGardenInstancedWindSway,
  updateGardenInstancedWindSway,
} from "./garden-rim-mesh";

/**
 * Six-draw physical geography for the seven named waters.
 *
 * Four vertex-coloured stone signatures are merged world-wide; all reed/lily
 * clusters share one instanced draw and all timber piles / warning buoys share
 * another. Placement comes verbatim from `garden-sea-edge-sites.ts`, so this
 * module never invents a renderer-only coastline or a random offset.
 *
 * Decorative only: these forms carry no market meaning and register no cue,
 * label or hit target. Their physical footprints are nevertheless obstacles
 * to ship placement and motion through `garden-water-exclusion.ts`.
 */

export const GARDEN_SEA_EDGES_OVERVIEW_NAME = "garden-sea-edges-overview";

type StoneSignature = Extract<GardenSeaEdgeMaterial, "dark" | "natural" | "pale" | "slate">;

export interface GardenSeaEdges {
  readonly bucketMeshes: ReadonlyMap<StoneSignature, Mesh>;
  readonly drawCallCount: number;
  readonly fixtureInstances: InstancedMesh;
  readonly reedInstances: InstancedMesh;
  readonly root: Group;
  readonly siteCount: number;
  readonly triangleCount: number;
  dispose(): void;
  updateWind(weather: WeatherPlan, reducedMotion: boolean): void;
}

const STONE_SIGNATURES: readonly StoneSignature[] = ["natural", "pale", "dark", "slate"];

const SIGNATURE_COLORS: Record<StoneSignature, { low: Color; high: Color }> = {
  natural: {
    low: new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.fog_pale), 0.28),
    high: new Color(HARBOR_PALETTE.stone_pale).lerp(new Color(HARBOR_PALETTE.foam_white), 0.38),
  },
  pale: {
    low: new Color(HARBOR_PALETTE.stone_pale).lerp(new Color(HARBOR_PALETTE.foam_white), 0.3),
    high: new Color(HARBOR_PALETTE.foam_white).lerp(new Color(HARBOR_PALETTE.sun_day_warm), 0.24),
  },
  dark: {
    low: new Color(HARBOR_PALETTE.deep_sea_1).lerp(new Color(HARBOR_PALETTE.stone_mid), 0.5),
    high: new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.fog_blue), 0.46),
  },
  slate: {
    low: new Color(HARBOR_PALETTE.deep_sea_1).lerp(new Color(HARBOR_PALETTE.fog_blue), 0.42),
    high: new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.foam_white), 0.28),
  },
};

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchScale = new Vector3();
const Y_AXIS = new Vector3(0, 1, 0);

function trianglesIn(geometry: BufferGeometry): number {
  return (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
}

function paintGeometry(
  geometry: BufferGeometry,
  low: Color,
  high: Color,
  salt: number,
): BufferGeometry {
  geometry.computeBoundingBox();
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const minY = geometry.boundingBox?.min.y ?? -1;
  const spanY = Math.max(0.001, (geometry.boundingBox?.max.y ?? 1) - minY);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const t = Math.max(0, Math.min(1, (y - minY) / spanY));
    const weather = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(x * 2.7 + y * 4.1 + z * 3.3 + salt));
    color.copy(low).lerp(high, t).multiplyScalar(weather);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

function stoneGeometry(site: GardenSeaEdgeSite, index: number): BufferGeometry {
  let geometry: BufferGeometry;
  if (site.form === "cliff") {
    const pieces: BufferGeometry[] = [];
    for (let piece = 0; piece < 4; piece += 1) {
      const rock = new IcosahedronGeometry(1, 1);
      const position = rock.getAttribute("position");
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const x = position.getX(vertex);
        const y = position.getY(vertex);
        const z = position.getZ(vertex);
        const relief = 0.84 + 0.18 * Math.sin(x * 4.7 + y * 6.3 + z * 3.1 + piece * 2.2);
        position.setXYZ(vertex, x * relief, Math.max(-0.78, y * relief), z * relief);
      }
      position.needsUpdate = true;
      rock.scale(
        site.length * TILE_SCALE * (0.14 + piece * 0.012),
        site.height * (0.34 + (piece % 3) * 0.07),
        site.width * TILE_SCALE * (0.46 + (piece % 2) * 0.12),
      );
      rock.translate((piece - 1.5) * site.length * TILE_SCALE * 0.245, 0, (piece % 2 - 0.5) * 0.18);
      rock.computeVertexNormals();
      pieces.push(rock);
    }
    const cliff = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    if (!cliff) throw new Error("Could not merge sea-edge cliff face.");
    geometry = cliff;
  } else if (site.form === "slate-edge") {
    geometry = new BoxGeometry(
      site.length * TILE_SCALE,
      site.height,
      site.width * TILE_SCALE,
      2,
      1,
      1,
    );
  } else if (
    site.form === "low-bank"
    || site.form === "shoal-bar"
    || site.form === "stone-tongue"
  ) {
    const pieces: BufferGeometry[] = [];
    for (let piece = 0; piece < 3; piece += 1) {
      const rock = new IcosahedronGeometry(1, 1);
      const positions = rock.getAttribute("position");
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        const x = positions.getX(vertex);
        const y = positions.getY(vertex);
        const z = positions.getZ(vertex);
        const relief = 0.88 + 0.14 * Math.sin(x * 5.1 + y * 6.7 + z * 4.5 + index + piece * 1.7);
        positions.setXYZ(vertex, x * relief, Math.max(-0.7, y * relief), z * relief);
      }
      positions.needsUpdate = true;
      rock.scale(
        site.length * TILE_SCALE * (0.13 + piece * 0.018),
        site.height * (0.62 + (piece % 2) * 0.16),
        site.width * TILE_SCALE * (0.32 + (piece % 2) * 0.09),
      );
      rock.translate((piece - 1) * site.length * TILE_SCALE * 0.31, 0, (piece - 1) * 0.13);
      rock.computeVertexNormals();
      pieces.push(rock);
    }
    const cluster = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    if (!cluster) throw new Error(`Could not merge sea-edge ${site.form} cluster.`);
    geometry = cluster;
  } else {
    geometry = new IcosahedronGeometry(1, 1);
    const positions = geometry.getAttribute("position");
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const x = positions.getX(vertex);
      const y = positions.getY(vertex);
      const z = positions.getZ(vertex);
      const relief = 0.88 + 0.15 * Math.sin(x * 5.7 + y * 7.1 + z * 4.3 + index * 1.9);
      positions.setXYZ(vertex, x * relief, Math.max(-0.72, y * relief), z * relief);
    }
    positions.needsUpdate = true;
    geometry.scale(
      site.length * TILE_SCALE * 0.5,
      site.height,
      site.width * TILE_SCALE * 0.5,
    );
    geometry.computeVertexNormals();
  }

  const signature = site.material as StoneSignature;
  const palette = SIGNATURE_COLORS[signature];
  paintGeometry(geometry, palette.low, palette.high, index * 0.73);
  geometry.rotateY(-site.bearing);
  const seat = site.form === "cliff"
    ? GARDEN_WATER_Y + site.height * 0.46
    : site.form === "slate-edge"
      ? GARDEN_WATER_Y - site.height * 0.12
      : GARDEN_WATER_Y - site.height * 0.28;
  geometry.translate(site.tile.x * TILE_SCALE, seat, site.tile.y * TILE_SCALE);
  return geometry;
}

function createStoneBuckets(root: Group): {
  meshes: Map<StoneSignature, Mesh>;
  triangles: number;
} {
  const meshes = new Map<StoneSignature, Mesh>();
  let triangles = 0;
  for (const signature of STONE_SIGNATURES) {
    const geometries = GARDEN_SEA_EDGE_SITES
      .map((site, index) => ({ index, site }))
      .filter(({ site }) => site.material === signature)
      .map(({ index, site }) => stoneGeometry(site, index));
    if (geometries.length === 0) continue;
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) throw new Error(`Could not merge sea-edge ${signature} geometry.`);
    const material = new MeshStandardMaterial({
      flatShading: signature !== "slate",
      metalness: 0,
      roughness: signature === "slate" ? 0.88 : 0.98,
      vertexColors: true,
    });
    const mesh = new Mesh(merged, material);
    mesh.name = `garden-sea-edges-stone-${signature}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes.set(signature, mesh);
    triangles += trianglesIn(merged);
  }
  return { meshes, triangles };
}

function colored(geometry: BufferGeometry, color: Color): BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    values[index * 3] = color.r;
    values[index * 3 + 1] = color.g;
    values[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(values, 3));
  return geometry;
}

function translated(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  geometry.translate(x, y, z);
  return geometry;
}

function createReedGeometry(): BufferGeometry {
  const green = new Color(HARBOR_PALETTE.aurora_green).multiplyScalar(0.72);
  const tip = new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.stone_pale), 0.24);
  const lily = new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.deep_sea_1), 0.48);
  const parts: BufferGeometry[] = [];
  const stems = [
    [-0.48, 0.86, -0.12],
    [-0.18, 1.14, 0.14],
    [0.12, 0.98, -0.2],
    [0.38, 1.26, 0.08],
    [0.56, 0.78, 0.25],
  ] as const;
  for (const [index, [x, height, z]] of stems.entries()) {
    const stem = translated(new CylinderGeometry(0.035, 0.055, height, 5), x, height * 0.5, z);
    parts.push(colored(stem, index % 2 === 0 ? green : tip));
  }
  for (const [index, [x, z, radius]] of [
    [-0.62, 0.38, 0.28],
    [0.06, 0.5, 0.34],
    [0.62, -0.34, 0.24],
  ].entries()) {
    const pad = new CircleGeometry(radius, 9);
    pad.rotateX(-Math.PI / 2);
    parts.push(colored(translated(pad, x, 0.035 + index * 0.004, z), lily));
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Could not merge sea-edge reed geometry.");
  return merged;
}

function createFixtureGeometry(): BufferGeometry {
  // Neutral palette-derived bands are multiplied by each instance's timber or
  // vermilion tint. No debug colour enters the final material.
  const light = new Color(HARBOR_PALETTE.foam_white);
  const shade = new Color(HARBOR_PALETTE.stone_pale);
  const parts = [
    colored(translated(new CylinderGeometry(0.24, 0.3, 0.55, 8), 0, 0.275, 0), shade),
    colored(translated(new CylinderGeometry(0.22, 0.24, 0.5, 8), 0, 0.8, 0), light),
    colored(translated(new CylinderGeometry(0.19, 0.22, 0.48, 8), 0, 1.29, 0), shade),
    colored(translated(new CylinderGeometry(0, 0.2, 0.28, 8), 0, 1.67, 0), light),
  ];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Could not merge sea-edge fixture geometry.");
  return merged;
}

function createInstances(
  sites: readonly GardenSeaEdgeSite[],
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  colorFor: (site: GardenSeaEdgeSite) => Color,
  scaleFor: (site: GardenSeaEdgeSite) => { x: number; y: number; z: number },
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, sites.length);
  for (const [index, site] of sites.entries()) {
    const scale = scaleFor(site);
    scratchPosition.set(site.tile.x * TILE_SCALE, GARDEN_WATER_Y - 0.18, site.tile.y * TILE_SCALE);
    scratchQuaternion.setFromAxisAngle(Y_AXIS, -site.bearing);
    scratchScale.set(scale.x, scale.y, scale.z);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    mesh.setMatrixAt(index, scratchMatrix);
    mesh.setColorAt(index, colorFor(site));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createGardenSeaEdges(): GardenSeaEdges {
  const root = new Group();
  root.name = GARDEN_SEA_EDGES_OVERVIEW_NAME;
  const buckets = createStoneBuckets(root);

  const reedSites = GARDEN_SEA_EDGE_SITES.filter((site) => (
    site.form === "reed-lily" || site.form === "watch-reed"
  ));
  const reedGeometry = createReedGeometry();
  const reedMaterial = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.94,
    vertexColors: true,
  });
  patchGardenInstancedWindSway(reedMaterial, 1.3, 0.02);
  const reedInstances = createInstances(
    reedSites,
    reedGeometry,
    reedMaterial,
    (site) => new Color(site.form === "reed-lily" ? HARBOR_PALETTE.aurora_green : HARBOR_PALETTE.timber_warm),
    (site) => ({
      x: site.length / 2.4,
      y: site.height / 1.2,
      z: site.width / 1.8,
    }),
  );
  reedInstances.name = "garden-sea-edges-reeds";
  reedGeometry.setAttribute(
    "aGardenSway",
    new InstancedBufferAttribute(
      new Float32Array(reedSites.map((_site, index) => 0.72 + (index % 5) * 0.09)),
      1,
    ),
  );
  root.add(reedInstances);

  const fixtureSites = GARDEN_SEA_EDGE_SITES.filter((site) => (
    site.form === "timber-pile" || site.form === "warning-buoy"
  ));
  const fixtureGeometry = createFixtureGeometry();
  const fixtureMaterial = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.9,
    vertexColors: true,
  });
  const fixtureInstances = createInstances(
    fixtureSites,
    fixtureGeometry,
    fixtureMaterial,
    (site) => new Color(site.form === "warning-buoy" ? HARBOR_PALETTE.vermillion : HARBOR_PALETTE.timber_mid),
    (site) => ({
      x: site.width / 0.7,
      y: site.height / 1.8,
      z: site.width / 0.7,
    }),
  );
  fixtureInstances.name = "garden-sea-edges-piles-buoys";
  root.add(fixtureInstances);

  applyGardenHeightFog(root);
  const drawCallCount = buckets.meshes.size + 2;
  const triangleCount = buckets.triangles
    + trianglesIn(reedGeometry) * reedSites.length
    + trianglesIn(fixtureGeometry) * fixtureSites.length;
  let disposed = false;
  return {
    bucketMeshes: buckets.meshes,
    drawCallCount,
    fixtureInstances,
    reedInstances,
    root,
    siteCount: GARDEN_SEA_EDGE_SITES.length,
    triangleCount,
    updateWind(weather, reducedMotion) {
      updateGardenInstancedWindSway(reedMaterial, weather, reducedMotion);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
        if (object instanceof InstancedMesh) {
          object.instanceMatrix.dispose();
          object.instanceColor?.dispose();
          object.dispose();
        }
      });
      root.clear();
    },
  };
}
