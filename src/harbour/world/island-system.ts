import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import { aoHeightTexture, renderGround, type GroundService } from "./ground";
import { getLightsStore } from "../lights/lights-service";
import { dequantizeForPatterns, getHarbourMaterials } from "./materials";
import { SunRig } from "./sun";
import { mergeStaticMeshes } from "../engine/static-merge";
import { updateSway } from "./sway";
import { graphicsValidity } from "../engine/graphics";

export const ISLAND_URL = "/harbour/island.glb";
/** The exported 3D mainland across the northern sound; retired at runtime (E02). */
export const RETIRED_MAINLAND = "shakkei";

/**
 * E02: the far land is the sky card's painted ridges alone; the sea SDF keeps the mainland's coast. The exported
 * mainland mesh stood nearer than the card whenever the camera stood back (zoomed out, squarer screens, pans to
 * the north) and read as a faceted wall over the horizon. It is hidden and detached before the material port, the
 * island merge, the ground height field and the static-depth registration, so none of them ever sees it (and it
 * casts, draws and pre-depths nothing). The node leaves the export at the next island rebuild; until then this is
 * the only place that knows it exists.
 */
export function retireMainland(root: THREE.Object3D): THREE.Object3D | null {
  const mainland = root.getObjectByName(RETIRED_MAINLAND) ?? null;
  if (!mainland) return null;
  mainland.visible = false;
  mainland.removeFromParent();
  return mainland;
}

/**
 * The static island: public/harbour/island.glb (fetched pre-gzipped, engine/assets.ts) through the harbour
 * material port; in dev only, when it fails to load, the stand-in assembled from style C's kit along the layout. Owns the key/fill/world lights and the
 * fitted sun shadow, and publishes the 'ground' height-field service.
 */
export class IslandSystem implements WorldSystem {
  readonly name = "island";
  readonly sun = new SunRig(4096);
  private root: THREE.Object3D | null = null;
  private fallbackSea: THREE.Mesh | null = null;
  private readonly fallbackBg = new THREE.Color();
  private ground: GroundService | null = null;

  async init(ctx: EngineContext): Promise<void> {
    const layout = ctx.services.get("layout");
    if (!layout) throw new Error("[harbour] island needs the layout service");
    const mats = getHarbourMaterials(ctx);
    getLightsStore(ctx); // register 'lights' early so the fleet can add riding lights in its own init
    const { min, max } = layout.bounds;
    this.sun.bounds.set(min[0], min[2], max[0], max[2]);
    this.sun.topY = Math.min(60, max[1]);
    ctx.scene.add(this.sun.group);
    ctx.services.set("sun", this.sun);

    try {
      const gltf = await ctx.assets.gltf(ISLAND_URL);
      retireMainland(gltf.scene);
      mats.apply(gltf.scene, { deferStatic: (mesh) => mesh.name.startsWith("island_") });
      this.root = gltf.scene;
    } catch (e) {
      if (ctx.signal?.aborted || !import.meta.env.DEV) throw e;
      console.warn("[harbour] island.glb failed to load: dev stand-in", e);
      const { buildStandIn } = await import("./standin");
      const s = await buildStandIn(ctx, layout, mats);
      layout.lights = [...(layout.lights ?? []), ...s.lights];
      this.root = s.group;
    }
    this.root.name = this.root.name || "harbour-island";
    // the island's four chunks never move: one draw per material (main pass and shadow pass) instead of four
    const chunks: THREE.Mesh[] = [];
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.name.startsWith("island_")) chunks.push(o as THREE.Mesh); });
    mergeStaticMeshes(chunks, this.root, "island");
    // A source rejected by the merger (for example a singleton fallback chunk) still needs its bake.
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) dequantizeForPatterns(o as THREE.Mesh); });
    ctx.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    const ground = await renderGround(ctx.renderer, this.root, [min[0], min[2], max[0], max[2]], 1024, ctx.signal, ctx.services.get("preparation"));
    this.ground = ground;
    graphicsValidity(ctx)?.assertValid();
    ctx.services.set("ground", ground);
    mats.ao.uAOTex.value = aoHeightTexture(ground, 512);
    mats.ao.uAOBounds.value.set(min[0], max[2], 1 / (max[0] - min[0]), 1 / (max[2] - min[2]));
    // All island renderables are classified; only static opaque kit geometry contributes depth.
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) mats.staticDepth.add(o as THREE.Mesh); });

    // Dev scaffolding only: when no ocean system registered its wake service, show a flat style C sea
    // so the shell can be judged on its own. Removed automatically once the ocean lands.
    if (!ctx.services.has("wake")) {
      this.fallbackSea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color("#143F55") }));
      this.fallbackSea.name = "harbour-fallback-sea";
      this.fallbackSea.receiveShadow = false;
      ctx.scene.add(this.fallbackSea);
      if (!ctx.scene.background) ctx.scene.background = this.fallbackBg;
    }
  }

  resize(): void { this.sun.resize(); }

  update(frame: FrameState, ctx: EngineContext): void {
    this.sun.update(ctx, frame.delta);
    updateSway(ctx); // 08-T3: reduced motion stills the leaf / cloth sway
    if (ctx.scene.background === this.fallbackBg) this.fallbackBg.copy(ctx.uniforms.uHorizon.value).lerp(ctx.uniforms.uZenith.value, 0.25);
    if (this.fallbackSea) (this.fallbackSea.material as THREE.MeshBasicMaterial).color.set("#143F55").multiplyScalar(1 - 0.75 * ctx.uniforms.uNight.value);
  }

  dispose(ctx: EngineContext): void {
    this.sun.dispose();
    ctx.services.delete("sun");
    if (this.root) ctx.scene.remove(this.root);
    if (this.fallbackSea) { ctx.scene.remove(this.fallbackSea); this.fallbackSea.geometry.dispose(); }
    // Engine disposes systems in reverse registration order: lights has released its pillar sampler.
    this.ground?.dispose();
    this.ground = null;
    ctx.services.delete("ground");
  }
}
