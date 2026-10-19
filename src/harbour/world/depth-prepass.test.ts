import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createWorldUniforms } from "../engine/uniforms";
import { HarbourMaterials } from "./materials";
import { replaceStaticDepth, StaticDepthPass } from "./depth-prepass";
import type { EngineContext } from "../engine/types";

function fixture() {
  const uniforms = createWorldUniforms(), materials = new HarbourMaterials(uniforms);
  const world = new THREE.Scene(), group = new THREE.Group(); world.add(group);
  const source = new THREE.Mesh(new THREE.BoxGeometry(), materials.kit()); group.add(source);
  return { uniforms, materials, world, group, source, registry: materials.staticDepth };
}

describe("static opaque depth registry", () => {
  it("never includes unregistered actors, windows, glass or late overlays", () => {
    const f = fixture();
    f.registry.add(f.source);
    for (const material of [f.materials.window(), f.materials.glass(), f.materials.emissive()]) {
      const mesh = new THREE.Mesh(f.source.geometry, material); f.group.add(mesh); f.registry.add(mesh);
    }
    f.world.add(new THREE.Mesh(f.source.geometry, f.materials.kit()));
    f.world.updateMatrixWorld(true); f.registry.sync(f.world);
    expect(f.registry.scene.children).toHaveLength(1);
    expect(f.source.visible).toBe(true); expect(f.source.material).toBe(f.materials.kit());
    f.materials.dispose();
  });
  it("tracks parent visibility, world transforms, layers, merge replacement and removal", () => {
    const f = fixture(); f.registry.add(f.source);
    f.group.position.x = 17; f.source.layers.set(3); f.world.updateMatrixWorld(true); f.registry.sync(f.world);
    const proxy = f.registry.scene.children[0] as THREE.Mesh;
    expect(proxy.matrixWorld).toEqual(f.source.matrixWorld); expect(proxy.layers.mask).toBe(f.source.layers.mask);
    f.group.visible = false; f.registry.sync(f.world); expect(proxy.visible).toBe(false);
    const merged = new THREE.Mesh(f.source.geometry, f.source.material); f.group.add(merged);
    replaceStaticDepth([f.source], merged); expect(f.registry.scene.children).toHaveLength(1);
    f.registry.sync(f.world); f.group.removeFromParent(); f.registry.sync(f.world);
    expect(f.registry.scene.children).toHaveLength(1);
    expect(f.registry.scene.children[0].visible).toBe(false); f.materials.dispose();
  });
  it("restores a detached contributor's coverage without re-registering or replacing its proxy", () => {
    const f = fixture(); f.registry.add(f.source);
    f.world.updateMatrixWorld(true); f.registry.sync(f.world);
    const proxy = f.registry.scene.children[0] as THREE.Mesh;
    const dispose = vi.spyOn(proxy.material as THREE.Material, "dispose");
    f.group.removeFromParent(); f.registry.sync(f.world);
    expect(proxy.visible).toBe(false); expect(dispose).not.toHaveBeenCalled();
    f.group.position.x = 23; f.world.add(f.group);
    f.world.updateMatrixWorld(true); f.registry.sync(f.world);
    expect(f.registry.scene.children).toEqual([proxy]);
    expect(proxy.visible).toBe(true); expect(proxy.matrixWorld).toEqual(f.source.matrixWorld);
    f.registry.remove(f.source); f.registry.sync(f.world);
    expect(f.registry.scene.children).toHaveLength(0); expect(dispose).toHaveBeenCalledOnce();
    f.materials.dispose();
  });
  it("invalidates prepared leaf/bare variants together without sharing per-object clipping", () => {
    const f = fixture(); f.uniforms.uFoliage.value.set(0, 1, 0, 0); f.registry.add(f.source);
    const proxy = f.registry.scene.children[0] as THREE.Mesh;
    const depth = proxy.material as THREE.Material, version = depth.version, key = depth.customProgramCacheKey();
    f.uniforms.uFoliage.value.set(0, 0, 0, 1); f.materials.invalidateSeason(f.world);
    expect(depth.version).toBe(version + 1); expect(depth.customProgramCacheKey()).not.toBe(key);
    f.uniforms.uFoliage.value.set(0, 1, 0, 0); f.materials.invalidateSeason(f.world);
    expect(depth.customProgramCacheKey()).toBe(key); f.materials.dispose();
  });
  it("registers preparation, clears before depth and restores renderer state even on failure", () => {
    const f = fixture(), unregister = vi.fn(), register = vi.fn(() => unregister);
    const ctx = { scene: f.world, camera: new THREE.PerspectiveCamera(), services: new Map([["preparation", { register }]]), composer: { inputBuffer: {} } } as unknown as EngineContext;
    const pass = new StaticDepthPass(ctx, f.registry);
    const renderer = { autoClear: true, shadowMap: { enabled: true }, setRenderTarget: vi.fn(), clear: vi.fn(), render: vi.fn(() => { throw new Error("draw"); }) };
    expect(() => pass.render(renderer as unknown as THREE.WebGLRenderer, {} as THREE.WebGLRenderTarget)).toThrow("draw");
    expect(renderer.clear).toHaveBeenCalledWith(true, true, true);
    expect(renderer.autoClear).toBe(true); expect(renderer.shadowMap.enabled).toBe(true);
    expect(register).toHaveBeenCalledOnce(); pass.dispose(); expect(unregister).toHaveBeenCalledOnce();
    f.materials.dispose();
  });
});

describe("depth shader coverage", () => {
  it.each([false, true])("compiles seasonal discard only for bare crowns (prepass=%s)", (prepass) => {
    const f = fixture();
    for (const fall of [0, 0.001, 0.0011, 1]) {
      f.uniforms.uFoliage.value.set(0, 1 - fall, 0, fall);
      const shader = { vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader, uniforms: {}, defines: {} as Record<string, string> };
      const depth = f.materials.kitDepth(prepass);
      depth.onBeforeCompile(shader as unknown as Parameters<THREE.Material["onBeforeCompile"]>[0], {} as THREE.WebGLRenderer);
      expect(shader.vertexShader).toContain("vHbCol = color;");
      expect(shader.vertexShader).toContain("vHbWorld = (modelMatrix * hbW).xyz;");
      expect("HB_BARE" in shader.defines).toBe(fall > 0.001);
      expect(shader.fragmentShader).toContain("#ifdef HB_BARE\n  {");
      expect(shader.fragmentShader).toContain("if (hbNoise(vHbWorld * 1.7) < bare * 0.84) discard;");
      expect(depth.customProgramCacheKey()).toMatch(fall > 0.001 ? /bare$/ : /leaf$/);
    }
    f.materials.dispose();
  });
});
