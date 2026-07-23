import {
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Texture,
  type BufferGeometry as ThreeBufferGeometry,
  type Material,
} from "three";

export const TILE_SCALE = Math.SQRT2;

export interface GardenShipGeometryCache {
  geometries: Map<string, ThreeBufferGeometry>;
  wakeFillMaterial: MeshBasicMaterial;
  wakeMaterial: LineBasicMaterial;
}

export function setTilePosition(
  object: Object3D,
  tile: { x: number; y: number },
  height: number,
): void {
  object.position.set(tile.x * TILE_SCALE, height, tile.y * TILE_SCALE);
}

export function normalizedHeading(
  heading: { x: number; y: number } | null | undefined,
): { x: number; y: number } | null {
  if (!heading) return null;
  const length = Math.hypot(heading.x, heading.y);
  if (length < 0.0001) return null;
  return { x: heading.x / length, y: heading.y / length };
}

export function safeCssColor(value: string | null | undefined, fallback: string): string {
  return value && (/^#[\da-f]{3,8}$/i.test(value) || /^rgb/i.test(value)) ? value : fallback;
}

export function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function cachedShipGeometry<T extends ThreeBufferGeometry>(
  cache: GardenShipGeometryCache,
  key: string,
  create: () => T,
): T {
  const cached = cache.geometries.get(key);
  if (cached) return cached as T;
  const geometry = create();
  cache.geometries.set(key, geometry);
  return geometry;
}

export function countDrawableObjects(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if ((object as Mesh).isMesh || (object as Line).isLine) count += 1;
  });
  return count;
}

export function disposeThreeObjectTree(root: Object3D): void {
  const geometries = new Set<ThreeBufferGeometry>();
  const instancedMeshes = new Set<InstancedMesh>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (object instanceof InstancedMesh) instancedMeshes.add(object);
    const candidate = object as Object3D & {
      geometry?: ThreeBufferGeometry;
      material?: Material | Material[];
    };
    if (candidate.geometry) geometries.add(candidate.geometry);
    const objectMaterials = Array.isArray(candidate.material)
      ? candidate.material
      : candidate.material
        ? [candidate.material]
        : [];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });

  for (const instancedMesh of instancedMeshes) instancedMesh.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
