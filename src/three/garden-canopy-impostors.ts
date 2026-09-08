import {
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { TILE_SCALE } from "./garden-util";

export const GARDEN_CANOPY_IMPOSTOR_NAME = "garden-canopy-impostors";
export const GARDEN_CANOPY_IMPOSTOR_MAX_COUNT = 120;
const CLUSTER_RADIUS = 6 * TILE_SCALE;
const TREES_PER_IMPOSTOR = 4;

export interface CanopyImpostorPlacement {
  readonly position: Vector3;
  /** Horizontal radius needed to cover the clustered crowns. */
  readonly radius: number;
}

/**
 * Groups nearby tree bases into stable, four-tree canopy masses. Sorting first
 * makes the result independent of traversal or instance insertion order.
 */
export function canopyImpostorPlacements(
  treePositions: readonly Readonly<{ x: number; y: number; z: number }>[],
): CanopyImpostorPlacement[] {
  const remaining = treePositions
    .map((position) => new Vector3(position.x, position.y, position.z))
    .sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
  const placements: CanopyImpostorPlacement[] = [];

  while (remaining.length > 0 && placements.length < GARDEN_CANOPY_IMPOSTOR_MAX_COUNT) {
    const seed = remaining.shift()!;
    const nearby = remaining
      .map((position, index) => ({
        distance: Math.hypot(position.x - seed.x, position.z - seed.z),
        index,
        position,
      }))
      .filter(({ distance }) => distance <= CLUSTER_RADIUS)
      .sort((a, b) => a.distance - b.distance
        || a.position.x - b.position.x
        || a.position.z - b.position.z
        || a.position.y - b.position.y)
      .slice(0, TREES_PER_IMPOSTOR - 1);
    const cluster = [seed, ...nearby.map(({ position }) => position)];
    for (const { index } of [...nearby].sort((a, b) => b.index - a.index)) {
      remaining.splice(index, 1);
    }

    const position = cluster.reduce((centroid, tree) => centroid.add(tree), new Vector3())
      .multiplyScalar(1 / cluster.length);
    const radius = cluster.reduce((extent, tree) => Math.max(
      extent,
      Math.hypot(tree.x - position.x, tree.z - position.z),
    ), 0) + 1.8 * TILE_SCALE;
    placements.push({ position, radius });
  }
  return placements;
}

/** One opaque draw call replacing sub-pixel individual broadleaf crowns. */
export function createGardenCanopyImpostors(
  treePositions: readonly Readonly<{ x: number; y: number; z: number }>[],
): InstancedMesh<SphereGeometry, MeshStandardMaterial> {
  const placements = canopyImpostorPlacements(treePositions);
  const geometry = new SphereGeometry(1, 8, 4);
  const material = new MeshStandardMaterial({
    color: "#183f2c",
    flatShading: true,
    roughness: 1,
  });
  const mesh = new InstancedMesh(geometry, material, placements.length);
  mesh.name = GARDEN_CANOPY_IMPOSTOR_NAME;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const matrix = new Matrix4();
  for (const [index, placement] of placements.entries()) {
    matrix.makeScale(placement.radius, placement.radius * 0.34, placement.radius)
      .setPosition(
        placement.position.x,
        placement.position.y + placement.radius * 0.28,
        placement.position.z,
      );
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
