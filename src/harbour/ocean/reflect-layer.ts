import type * as THREE from "three";

/**
 * Dedicated Three.js render layer for High-tier planar reflection geometry and lights (PLAN.md §5.6, C3 / M7).
 *
 * Kept tiny with type-only Three.js imports so static world systems (`island`, `lighthouse`, `civic`, `fleet`,
 * `sun`, `lights`) can tag reflective meshes and shared lights at init/pre-merge time without pulling the lazy
 * `planar-mirror.ts` chunk into the initial bundle.
 */
export const LAYER_REFLECT = 1;

interface RenderableObjectLike {
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  isLOD?: boolean;
}

/**
 * Enables `LAYER_REFLECT` on every renderable object (`Mesh` including `InstancedMesh`/`BatchedMesh`/`SkinnedMesh`,
 * `Line`, `Points`, `Sprite`, and `LOD`) under `root`. Must be called BEFORE `mergeStaticMeshes()` so merged
 * batches preserve `layers.mask` (M7).
 */
export function enableReflectLayer(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const r = obj as RenderableObjectLike;
    if (r.isMesh || r.isLine || r.isPoints || r.isSprite || r.isLOD) {
      obj.layers.enable(LAYER_REFLECT);
    }
  });
}

/**
 * Enables `LAYER_REFLECT` on a scene light without touching `castShadow` so the planar reflection pass matches
 * the main camera's Three.js light-state hash byte-for-byte (zero unlit reflections, zero shader recompiles, C3).
 */
export function enableLightReflectLayer(light: THREE.Light): void {
  light.layers.enable(LAYER_REFLECT);
}
