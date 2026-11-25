import * as THREE from "three";
import { Pass } from "postprocessing";
import type { EngineContext } from "../engine/types";
import type { HarbourMaterials } from "./materials";

const owners = new WeakMap<THREE.Mesh, StaticDepthRegistry>();
interface Contributor { source: THREE.Mesh; proxy: THREE.Mesh; attached: boolean; depthGeometry: THREE.BufferGeometry | undefined }

export interface StaticDepthOptions {
  /** Optional depth-only geometry for the predepth proxy (must conservatively match the colour pass under LessEqualDepth). */
  readonly depthGeometry?: THREE.BufferGeometry | undefined;
}

/** Explicit opt-in: static, opaque kit, terrain & instanced vegetation surfaces. Windows, glass, actors, ocean and overlays stay out. */
export class StaticDepthRegistry {
  readonly scene = new THREE.Scene();
  private readonly contributors = new Map<THREE.Mesh, Contributor>();
  constructor(private readonly materials: HarbourMaterials) { this.scene.matrixWorldAutoUpdate = false; }

  add(source: THREE.Mesh, opts?: StaticDepthOptions): void {
    if (this.contributors.has(source) || Array.isArray(source.material)) return;
    if ((source as THREE.BatchedMesh).isBatchedMesh) return; // no static BatchedMesh is published by these owners
    const colour = source.material, isTerrain = colour.name === "hb_terrain", isVeg = colour.name === "hb_veg_solid";
    if ((colour.name !== "hb_kit" && !isTerrain && !isVeg) || colour.transparent || !colour.depthWrite || !colour.depthTest || colour.depthFunc !== THREE.LessEqualDepth) return;
    const expected = isTerrain ? this.materials.terrain({ side: colour.side })
      : isVeg ? this.materials.vegSolid({ side: colour.side })
      : this.materials.kit({ side: colour.side });
    if (colour !== expected || colour.alphaHash || colour.alphaToCoverage || source.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
    // The supported port has no texture/displacement alpha. Fail closed for a later custom shader variant.
    const standard = colour as THREE.MeshStandardMaterial;
    if (standard.map || standard.alphaMap || standard.displacementMap || standard.wireframe || colour.alphaTest || source.morphTargetInfluences || (source as THREE.SkinnedMesh).isSkinnedMesh || (source as THREE.InstancedMesh).instanceColor) return;
    const template = isTerrain ? this.materials.terrainDepth(true, colour.side)
      : isVeg ? this.materials.vegDepth(true, colour.side)
      : this.materials.kitDepth(true, colour.side);
    const depth = template.clone();
    depth.onBeforeCompile = template.onBeforeCompile;
    depth.customProgramCacheKey = template.customProgramCacheKey;
    // A dedicated proxy never changes world visibility/materials or participates in shadow/ground rendering.
    const instanced = source as THREE.InstancedMesh;
    const geom = opts?.depthGeometry ?? source.geometry;
    const proxy = instanced.isInstancedMesh ? new THREE.InstancedMesh(geom, depth, 0) : new THREE.Mesh(geom, depth);
    if (proxy instanceof THREE.InstancedMesh) {
      proxy.instanceMatrix = instanced.instanceMatrix;
      proxy.instanceColor = instanced.instanceColor;
      proxy.count = instanced.count;
      proxy.boundingBox = instanced.boundingBox;
      proxy.boundingSphere = instanced.boundingSphere;
    }
    proxy.name = `${source.name}-predepth`;
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorldAutoUpdate = false;
    this.scene.add(proxy);
    this.contributors.set(source, { source, proxy, attached: false, depthGeometry: opts?.depthGeometry });
    owners.set(source, this);
  }

  remove(source: THREE.Mesh): void {
    const entry = this.contributors.get(source);
    if (!entry) return;
    entry.proxy.removeFromParent();
    (entry.proxy.material as THREE.Material).dispose();
    this.contributors.delete(source);
    owners.delete(source);
    // Shared geometry remains source-owned.
  }

  sync(world: THREE.Scene): void {
    for (const entry of this.contributors.values()) {
      const { source, proxy } = entry;
      let visible = true, attached = false;
      for (let parent: THREE.Object3D | null = source; parent; parent = parent.parent) {
        visible &&= parent.visible;
        if (parent === world) { attached = true; break; }
      }
      // A transient detach hides coverage without losing registration for a later re-attach.
      entry.attached = attached;
      const colour = source.material as THREE.MeshStandardMaterial;
      proxy.visible = attached && visible && colour.visible;
      proxy.geometry = entry.depthGeometry ?? source.geometry;
      if (proxy instanceof THREE.InstancedMesh) {
        const inst = source as THREE.InstancedMesh;
        proxy.instanceMatrix = inst.instanceMatrix;
        proxy.count = inst.count;
        proxy.boundingBox = inst.boundingBox;
        proxy.boundingSphere = inst.boundingSphere;
      }
      proxy.layers.mask = source.layers.mask;
      proxy.frustumCulled = source.frustumCulled;
      proxy.matrixWorld.copy(source.matrixWorld);
      const depth = proxy.material as THREE.MeshDepthMaterial;
      depth.clippingPlanes = colour.clippingPlanes;
      depth.clipIntersection = colour.clipIntersection;
      depth.polygonOffset = colour.polygonOffset;
      depth.polygonOffsetFactor = colour.polygonOffsetFactor;
      depth.polygonOffsetUnits = colour.polygonOffsetUnits;
    }
  }

  invalidate(): void {
    for (const { proxy } of this.contributors.values()) {
      const m = proxy.material as THREE.Material;
      if (m.name !== "hb_terrain_predepth") m.needsUpdate = true;
    }
  }

  dispose(): void { for (const source of this.contributors.keys()) this.remove(source); }
}

/** Static merge transfers ownership rather than leaving removed source objects in the registry. */
export function replaceStaticDepth(sources: readonly THREE.Mesh[], merged: THREE.Mesh): void {
  const registry = owners.get(sources[0]);
  for (const source of sources) owners.get(source)?.remove(source);
  registry?.add(merged);
}

/** Clears once, fills the composer's existing depth attachment, then the colour RenderPass retains it. */
export class StaticDepthPass extends Pass {
  private readonly unregister: () => void;
  constructor(private readonly ctx: EngineContext, private readonly registry: StaticDepthRegistry) {
    super("StaticDepthPass", registry.scene, ctx.camera);
    this.needsSwap = false;
    this.unregister = ctx.services.get("preparation")!.register({ root: registry.scene, camera: ctx.camera, target: () => ctx.composer.inputBuffer, scene: registry.scene });
  }
  render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget): void {
    this.ctx.scene.updateMatrixWorld();
    this.registry.sync(this.ctx.scene);
    renderer.setRenderTarget(inputBuffer);
    renderer.clear(true, true, true);
    const autoClear = renderer.autoClear, shadows = renderer.shadowMap.enabled;
    renderer.autoClear = false;
    renderer.shadowMap.enabled = false;
    try { renderer.render(this.registry.scene, this.ctx.camera); }
    finally { renderer.autoClear = autoClear; renderer.shadowMap.enabled = shadows; }
  }
  dispose(): void { this.unregister(); this.registry.dispose(); }
}
