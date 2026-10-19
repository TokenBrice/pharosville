import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramPreparation, preparationDepth, preparationMaterial } from "./prepare";
import { createWorldUniforms } from "./uniforms";
import type { EngineContext } from "./types";
import { deferred } from "./deferred";
import { EdgeDetectionMaterial, SMAAWeightsMaterial } from "postprocessing";

function harness(parallel: boolean) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const input = new THREE.WebGLRenderTarget(), previous = new THREE.WebGLRenderTarget();
  let target: THREE.WebGLRenderTarget | null = previous;
  const completion = deferred();
  const programs = new WeakMap<THREE.Material, { programs: Map<number, { isReady(): boolean; getUniforms(): void; getAttributes(): void }> }>();
  const reflected = vi.fn();
  const compile = vi.fn((object: THREE.Object3D) => {
    const material = (object as THREE.Mesh).material as THREE.Material;
    expect(target).toBe(input);
    programs.set(material, { programs: new Map([[0, { isReady: () => true, getUniforms: reflected, getAttributes: reflected }]]) });
  });
  const renderer = {
    getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 3,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { target = next; }),
    extensions: { has: () => parallel }, properties: { get: (material: THREE.Material) => programs.get(material) ?? {} },
    compile, compileAsync: vi.fn((object: THREE.Object3D) => { compile(object); return completion.promise; }), initTexture: vi.fn(),
  };
  const ctx = { scene, camera, renderer, composer: { inputBuffer: input }, uniforms: createWorldUniforms(), services: new Map() } as unknown as EngineContext;
  return { ctx, scene, camera, renderer, input, previous, completion, reflected, preparation: new ProgramPreparation(ctx), target: () => target };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("requestIdleCallback", undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("owned program preparation", () => {
  it("restores target, lights and object materials before asynchronous compiler completion", async () => {
    const h = harness(true);
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const child = new THREE.Object3D(); mesh.add(child); h.scene.add(mesh);
    const light = new THREE.PointLight(); h.scene.add(light);
    let owned: THREE.Material | undefined;
    h.renderer.compile.mockImplementation((object) => {
      expect(h.target()).toBe(h.input);
      expect(light.visible).toBe(false);
      expect(object).toBe(mesh);
      owned = mesh.material;
      expect(owned).not.toBe(material);
      expect(mesh.children).toEqual([]);
    });
    const pending = h.preparation.prepareWorld(() => {
      const visible = light.visible; light.visible = false;
      return () => { light.visible = visible; };
    });
    expect(h.renderer.compile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mesh.material).toBe(material); expect(mesh.children).toEqual([child]);
    expect(light.visible).toBe(true); expect(h.target()).toBe(h.previous);
    expect(h.renderer.setRenderTarget).toHaveBeenLastCalledWith(h.previous, 2, 3);
    // A live currentProgram mutation cannot affect compileAsync's owned material.
    expect(owned).toBeDefined();
    h.completion.resolve();
    const batch = await pending;
    batch.dispose(); h.preparation.dispose(); mesh.geometry.dispose(); material.dispose();
  });

  it("uses synchronous compilation without KHR and reflects before reporting readiness", async () => {
    const h = harness(false);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); h.scene.add(mesh);
    const pending = h.preparation.prepareWorld();
    await vi.advanceTimersByTimeAsync(1);
    const batch = await pending;
    expect(h.renderer.compileAsync).not.toHaveBeenCalled();
    expect(h.renderer.compile).toHaveBeenCalledOnce();
    expect(h.reflected).toHaveBeenCalledTimes(2);
    expect(h.target()).toBe(h.previous);
    batch.dispose(); h.preparation.dispose();
  });

  it("restores synchronous failures and cancels pending work on invalidation/disposal", async () => {
    const h = harness(false);
    const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); h.scene.add(mesh);
    h.renderer.compile.mockImplementation(() => { throw new Error("compile failed"); });
    const failed = h.preparation.prepareWorld();
    const failure = expect(failed).rejects.toThrow("compile failed");
    await vi.advanceTimersByTimeAsync(1); await failure;
    expect(mesh.material).toBe(material); expect(h.target()).toBe(h.previous);
    const cancelled = h.preparation.prepareWorld();
    const cancellation = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    h.preparation.invalidate(); await cancellation;
    h.preparation.dispose(); h.preparation.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports live material disposal as an abort even without an epoch change", async () => {
    const h = harness(true);
    const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    h.scene.add(mesh);
    const pending = h.preparation.prepareGroup(mesh);
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1);
    expect(h.renderer.compileAsync).toHaveBeenCalledOnce();
    material.dispose(); // No compiler completion is needed to cancel an owned batch.
    await cancelled;
    expect(mesh.material).toBe(material);
    expect(h.target()).toBe(h.previous);
    h.preparation.dispose(); mesh.geometry.dispose();
  });

  it("stages each final texture version in idle, excluding render-target attachments", async () => {
    const h = harness(false);
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1); texture.needsUpdate = true;
    const material = new THREE.ShaderMaterial({ uniforms: { bitmap: { value: texture }, target: { value: h.input.texture } } });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
    h.preparation.stageTextures(mesh); h.preparation.stageTextures(mesh);
    expect(h.renderer.initTexture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.renderer.initTexture).toHaveBeenCalledExactlyOnceWith(texture);
    texture.needsUpdate = true; h.preparation.stageTextures(mesh);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.renderer.initTexture).toHaveBeenCalledTimes(2);
    h.preparation.dispose();
  });

  it("shares render-target uniforms without cloning textures, warning or losing shader subclasses", () => {
    const target = new THREE.WebGLRenderTarget();
    const textureClone = vi.spyOn(target.texture, "clone");
    const warn = vi.spyOn(console, "warn");
    for (const source of [new THREE.ShaderMaterial(), new THREE.RawShaderMaterial(), new EdgeDetectionMaterial(), new SMAAWeightsMaterial()]) {
      source.uniforms.renderTarget = { value: target.texture };
      const uniforms = source.uniforms;
      const owned = preparationMaterial(source);
      expect(owned.constructor).toBe(source.constructor);
      expect(owned.uniforms).toBe(uniforms);
      expect(owned.uniforms.renderTarget).toBe(uniforms.renderTarget);
      expect(owned.uniforms.renderTarget.value).toBe(target.texture);
      expect(source.uniforms).toBe(uniforms);
      expect(owned.defines).not.toBe(source.defines);
      owned.dispose(); source.dispose();
    }
    expect(textureClone).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    target.dispose();
  });

  it("submits multiple owned materials within one idle budget before waiting for KHR completion", async () => {
    const h = harness(true);
    for (let i = 0; i < 3; i++) h.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const pending = h.preparation.prepareWorld();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.renderer.compileAsync).toHaveBeenCalledTimes(3);
    expect(h.reflected).not.toHaveBeenCalled();
    h.completion.resolve();
    const batch = await pending;
    expect(h.reflected).toHaveBeenCalledTimes(6);
    batch.dispose(); h.preparation.dispose();
  });

  it("makes bounded progress when saturated idle callbacks arrive with no remaining time", async () => {
    const idle = vi.fn((callback: IdleRequestCallback, options?: IdleRequestOptions) =>
      window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), options?.timeout));
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("cancelIdleCallback", clearTimeout);
    const h = harness(false);
    for (let i = 0; i < 400; i++) h.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const pending = h.preparation.prepareWorld();
    await vi.advanceTimersByTimeAsync(16);
    const batch = await pending;
    expect(h.renderer.compile).toHaveBeenCalledTimes(400);
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 16 });
    expect(h.reflected).toHaveBeenCalledTimes(800);
    batch.dispose(); h.preparation.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns submitted programs on deadline instead of withholding scenery, and warns only once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness(true);
    const source = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), source);
    h.scene.add(mesh);
    const ownedDispose = vi.fn();
    h.renderer.compile.mockImplementation((object) => {
      ((object as THREE.Mesh).material as THREE.Material).addEventListener("dispose", ownedDispose);
    });
    const pending = h.preparation.prepareWorld();
    await vi.advanceTimersByTimeAsync(1);
    // compileAsync never resolves; the preparation deadline must still settle.
    await vi.advanceTimersByTimeAsync(30000);
    const batch = await pending;
    expect(batch.sources.has(source)).toBe(true);
    expect(mesh.material).toBe(source); expect(h.target()).toBe(h.previous);
    expect(warn).toHaveBeenCalledOnce();
    const group = h.preparation.prepareGroup(mesh);
    await vi.advanceTimersByTimeAsync(30000);
    await group;
    expect(warn).toHaveBeenCalledOnce();
    expect(ownedDispose).not.toHaveBeenCalled();
    batch.dispose(); h.preparation.dispose();
    expect(ownedDispose).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves custom hooks, frozen keys, geometry identity and PCF colour/depth inputs", () => {
    const source = new THREE.MeshStandardMaterial({ side: THREE.FrontSide, alphaTest: 0.4 });
    let key = "leaf";
    source.customProgramCacheKey = () => key;
    source.onBeforeCompile = vi.fn();
    const owned = preparationMaterial(source);
    key = "bare";
    expect(owned.customProgramCacheKey()).toBe("leaf");
    expect(owned.onBeforeCompile).toBe(source.onBeforeCompile);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), source, 2);
    const depth = preparationDepth(mesh, source) as THREE.MeshDepthMaterial;
    expect(depth.side).toBe(THREE.BackSide); expect(depth.alphaTest).toBe(0.4);
    expect(depth.depthPacking).toBe(THREE.BasicDepthPacking);
    owned.dispose(); depth.dispose(); source.dispose(); mesh.geometry.dispose();
  });
});
