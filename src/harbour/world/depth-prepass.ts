import * as THREE from "three";
import { Pass } from "postprocessing";
import type { EngineContext, PreparationService } from "../engine/types";
import type { HarbourMaterials } from "./materials";

const owners = new WeakMap<THREE.Mesh, StaticDepthRegistry>();
interface Contributor { source: THREE.Mesh; proxy: THREE.Mesh; attached: boolean }

/** Explicit opt-in: only static, opaque kit surfaces. Windows, glass, actors, ocean and overlays stay out. */
export class StaticDepthRegistry {
  readonly scene = new THREE.Scene();
  private readonly contributors = new Map<THREE.Mesh, Contributor>();
  constructor(private readonly materials: HarbourMaterials) { this.scene.matrixWorldAutoUpdate = false; }

  add(source: THREE.Mesh): void {
    if (this.contributors.has(source) || Array.isArray(source.material)) return;
    if ((source as THREE.BatchedMesh).isBatchedMesh) return; // no static BatchedMesh is published by these owners
    const colour = source.material;
    if (colour.name !== "hb_kit" || colour.transparent || !colour.depthWrite || !colour.depthTest || colour.depthFunc !== THREE.LessEqualDepth) return;
    if (colour !== this.materials.kit({ side: colour.side }) || colour.alphaHash || colour.alphaToCoverage || source.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
    // The supported port has no texture/displacement alpha. Fail closed for a later custom shader variant.
    const standard = colour as THREE.MeshStandardMaterial;
    if (standard.map || standard.alphaMap || standard.displacementMap || standard.wireframe || colour.alphaTest || source.morphTargetInfluences || (source as THREE.SkinnedMesh).isSkinnedMesh || (source as THREE.InstancedMesh).instanceColor) return;
    const template = this.materials.kitDepth(true, colour.side);
    const depth = template.clone();
    depth.onBeforeCompile = template.onBeforeCompile;
    depth.customProgramCacheKey = template.customProgramCacheKey;
    // A dedicated proxy never changes world visibility/materials or participates in shadow/ground rendering.
    const instanced = source as THREE.InstancedMesh;
    const proxy = instanced.isInstancedMesh ? new THREE.InstancedMesh(source.geometry, depth, 0) : new THREE.Mesh(source.geometry, depth);
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
    this.contributors.set(source, { source, proxy, attached: false });
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
      proxy.geometry = source.geometry;
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

  invalidate(): void { for (const { proxy } of this.contributors.values()) (proxy.material as THREE.Material).needsUpdate = true; }

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
    this.unregister = (ctx.services.get("preparation") as PreparationService).register({ root: registry.scene, camera: ctx.camera, target: () => ctx.composer.inputBuffer, scene: registry.scene });
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
