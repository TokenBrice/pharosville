import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { TIERS } from "../engine/quality";
import { SeaShadowMask, sunShadowUniforms } from "./sun-shadow";
import { castFadeUniforms } from "./shadow-casters";
import { SunRig } from "./sun";

afterEach(() => vi.restoreAllMocks());

describe("sea-shadow consumer ownership", () => {
  it("does no low-tier allocation/resolve/mips and resumes only with a completed matching map", () => {
    const rig = new SunRig(1024), quality = { settings: TIERS.low };
    const renderer = { shadowMap: { needsUpdate: false, autoUpdate: false } };
    const ctx = { uniforms: createWorldUniforms(), services: new Map<string, unknown>([["quality", quality], ["ocean", {}]]) as Services, renderer, camera: new THREE.PerspectiveCamera() } as unknown as EngineContext;
    vi.spyOn(rig as unknown as { fitShadow(): boolean }, "fitShadow").mockReturnValue(false);
    const resolve = vi.spyOn(SeaShadowMask.prototype, "resolve").mockReturnValue(true);
    const lowMap = new THREE.WebGLRenderTarget(1024, 1024); lowMap.depthTexture = new THREE.DepthTexture(1024, 1024);
    rig.key.shadow.map = lowMap;
    for (let i = 0; i < 5; i++) { renderer.shadowMap.needsUpdate = false; rig.update(ctx, 1 / 60); }
    expect(resolve).not.toHaveBeenCalled(); expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    const mask = (rig as unknown as { seaMask: { rt: unknown } }).seaMask;
    expect(mask.rt).toBeNull();

    quality.settings = TIERS.medium;
    renderer.shadowMap.needsUpdate = true;
    rig.update(ctx, 0); // A pending map must not enable sampling an old mask.
    expect(resolve).not.toHaveBeenCalled(); expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    const map = new THREE.WebGLRenderTarget(2048, 2048); map.depthTexture = new THREE.DepthTexture(2048, 2048);
    rig.key.shadow.map = map;
    const matching = rig.key.shadow.matrix.clone().makeTranslation(3, 4, 5);
    rig.key.shadow.matrix.copy(matching);
    renderer.shadowMap.needsUpdate = false;
    rig.update(ctx, 0);
    expect(resolve).toHaveBeenLastCalledWith(ctx.renderer, map.depthTexture, 2048, matching);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(1);

    quality.settings = TIERS.low; rig.update(ctx, 0);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0); expect(mask.rt).toBeNull();
    const count = resolve.mock.calls.length;
    quality.settings = TIERS.high; rig.update(ctx, 0); // New map size destroys the old depth attachment.
    expect(resolve).toHaveBeenCalledTimes(count); expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    const richer = new THREE.WebGLRenderTarget(4096, 4096); richer.depthTexture = new THREE.DepthTexture(4096, 4096);
    rig.key.shadow.map = richer; renderer.shadowMap.needsUpdate = false;
    rig.update(ctx, 0);
    expect(resolve).toHaveBeenLastCalledWith(ctx.renderer, richer.depthTexture, 4096, rig.key.shadow.matrix);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(1);
    ctx.services.delete("ocean"); rig.update(ctx, 0);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    rig.dispose();
  });
});

/** three's call of a Scene's hook (renderer, scene, camera, target), before it renders the shadow map. */
function beforeRender(scene: THREE.Scene, renderer: unknown, camera: THREE.Camera): void {
  (scene.onBeforeRender as unknown as (r: unknown, s: THREE.Scene, c: THREE.Camera, t: null) => void)(renderer, scene, camera, null);
}

/** A rig in a scene (finalize runs from scene.onBeforeRender, as three calls it before the shadow pass). */
function stage(tier: "high" | "medium" | "low", services: Array<[string, unknown]> = []) {
  const rig = new SunRig(TIERS[tier].shadowMapSize), quality = { settings: TIERS[tier] };
  const renderer = { shadowMap: { needsUpdate: false, autoUpdate: true }, domElement: { clientHeight: 1000 } };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(25, 1.6, 1, 20000);
  camera.position.set(410, 285, 410); camera.lookAt(-110, 20, -99); camera.updateMatrixWorld();
  const rigState = { distance: 650 };
  const ctx = { uniforms: createWorldUniforms(), services: new Map<string, unknown>([["quality", quality], ...services]) as unknown as Services,
    renderer, camera, scene, rig: rigState } as unknown as EngineContext;
  scene.add(rig.group);
  /** One engine frame: systems update (the rig first), then three renders (scene.onBeforeRender → finalize). */
  const frame = (dt: number, between?: () => void) => {
    renderer.shadowMap.needsUpdate = false;
    rig.update(ctx, dt);
    between?.();
    scene.updateMatrixWorld();
    beforeRender(scene, renderer, camera);
    return renderer.shadowMap.needsUpdate;
  };
  return { rig, quality, renderer, scene, camera, ctx, rigState, frame };
}

function caster(name: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial());
  mesh.name = name; mesh.castShadow = true;
  return mesh;
}

describe("B10 shadow cadence", () => {
  it.each(["medium", "low"] as const)("keeps %s cadence/minimum frames while a dynamic caster is in the map, with immediate fit and tier invalidation", (tier) => {
    const s = stage(tier), hulls = caster("hulls");
    s.scene.add(hulls); s.rig.casters.dynamic(hulls);
    const fit = vi.spyOn(s.rig as unknown as { fitShadow(): boolean }, "fitShadow").mockReturnValue(false);
    expect(s.frame(0)).toBe(true);
    expect(s.frame(1)).toBe(false); // Even a one-second frame cannot bypass the two-frame interval guard.
    expect(s.frame(0)).toBe(true);
    expect(s.frame(0)).toBe(false);
    expect(s.frame(TIERS[tier].shadowInterval - 1e-6)).toBe(false);
    expect(s.frame(2e-6)).toBe(true);
    fit.mockReturnValueOnce(true);
    expect(s.frame(0)).toBe(true); // A fit change bypasses the interval and minimum-frame guards.
    s.quality.settings = TIERS.high;
    expect(s.frame(0)).toBe(true);
    expect(s.rig.key.shadow.mapSize.toArray()).toEqual([4096, 4096]);
    expect(s.frame(0)).toBe(true);
    expect(s.renderer.shadowMap.autoUpdate).toBe(false);
    s.rig.dispose();
  });
});

describe("E05 still shadows", () => {
  it("holds the map while only still casters are in it, at every tier and frame time", () => {
    for (const tier of ["high", "medium", "low"] as const) {
      const s = stage(tier);
      s.scene.add(caster("island"));
      vi.spyOn(s.rig as unknown as { fitShadow(): boolean }, "fitShadow").mockReturnValue(false);
      expect(s.frame(0)).toBe(true);
      for (let i = 0; i < 200; i++) expect(s.frame(i % 3 ? 1 / 60 : 0.5)).toBe(false);
      expect(s.rig.stats).toMatchObject({ renders: 1, holds: 200, live: false });
      s.rig.dispose();
    }
  });

  it("re-renders at once when a dynamic caster enters or leaves the map, and keeps High live while it is in", () => {
    const s = stage("high"), hulls = caster("hulls");
    s.scene.add(caster("island"), hulls); s.rig.casters.dynamic(hulls);
    hulls.castShadow = false;
    vi.spyOn(s.rig as unknown as { fitShadow(): boolean }, "fitShadow").mockReturnValue(false);
    s.frame(0);
    expect(s.frame(1 / 60)).toBe(false);
    expect(s.frame(1 / 60, () => { hulls.castShadow = true; })).toBe(true);   // entry (the fleet's zoom gate, after the rig)
    for (let i = 0; i < 5; i++) expect(s.frame(1 / 60)).toBe(true);        // High: every frame while live
    expect(s.rig.stats.reason).toBe("live");
    expect(s.frame(1 / 60, () => { hulls.castShadow = false; })).toBe(true);  // exit: once more, without the hulls
    expect(s.frame(1 / 60)).toBe(false);
    s.rig.dispose();
  });

  it("re-renders for a sun drift beyond 0.002 rad but never for a running clock below it", () => {
    const s = stage("high");
    s.scene.add(caster("island"));
    s.frame(0);
    const sun = s.ctx.uniforms.uSunDir.value, axis = new THREE.Vector3(0, 0, 1);
    sun.applyAxisAngle(axis, 0.0015);
    expect(s.frame(1 / 60)).toBe(false);
    sun.applyAxisAngle(axis, 0.001);
    expect(s.frame(1 / 60)).toBe(true);
    expect(s.rig.stats.reason).toBe("fit");
    expect(s.frame(1 / 60)).toBe(false);
    s.rig.dispose();
  });

  it("does no sea-mask work on held frames and resolves only a completed matching map", () => {
    const s = stage("high", [["ocean", {}]]);
    s.scene.add(caster("island"));
    vi.spyOn(s.rig as unknown as { fitShadow(): boolean }, "fitShadow").mockReturnValue(false);
    const resolve = vi.spyOn(SeaShadowMask.prototype, "resolve").mockReturnValue(true);
    const map = new THREE.WebGLRenderTarget(4096, 4096); map.depthTexture = new THREE.DepthTexture(4096, 4096);
    s.rig.key.shadow.map = map;
    expect(s.frame(0)).toBe(true);                 // asked: three renders it this frame (the stage clears needsUpdate)
    expect(resolve).not.toHaveBeenCalled();
    expect(s.frame(1 / 60)).toBe(false);           // the completed map is resolved before anything else is asked
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenLastCalledWith(s.ctx.renderer, map.depthTexture, 4096, s.rig.key.shadow.matrix);
    for (let i = 0; i < 30; i++) s.frame(1 / 60);  // held: neither a shadow render nor a mask resolve
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(1);
    s.rig.dispose();
  });

  it("finalizes once per frame, after the casters, however often the scene renders", () => {
    const s = stage("high"), hulls = caster("hulls");
    s.scene.add(hulls); s.rig.casters.dynamic(hulls);
    s.frame(0);
    const check = vi.spyOn(s.rig.casters, "check");
    s.frame(1 / 60);
    beforeRender(s.scene, s.renderer, s.camera);
    expect(check).toHaveBeenCalledTimes(1);
    s.rig.dispose();
    expect(s.scene.onBeforeRender).toBe(THREE.Object3D.prototype.onBeforeRender);   // detached on dispose
  });

  it("gates the figures at their limit and publishes the figure fade and a world-anchored texel phase", () => {
    const s = stage("high");
    const folk = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2);
    folk.castShadow = true; s.scene.add(folk);
    s.rig.casters.figures(folk, 1.75);
    s.rigState.distance = 650; s.frame(0);
    expect(folk.castShadow).toBe(false);
    expect(castFadeUniforms.uHbFigureFade.value).toBe(1);
    s.rigState.distance = 290; s.frame(1 / 60);
    expect(folk.castShadow).toBe(true);
    expect(castFadeUniforms.uHbFigureFade.value).toBeGreaterThan(0); expect(castFadeUniforms.uHbFigureFade.value).toBeLessThan(1);
    s.rigState.distance = 200; s.frame(1 / 60);
    expect(castFadeUniforms.uHbFigureFade.value).toBe(0);
    const phase = castFadeUniforms.uHbCastPhase.value.toArray();
    for (const p of phase) { expect(Number.isInteger(p)).toBe(true); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(4); }
    s.rig.dispose();
  });
});
