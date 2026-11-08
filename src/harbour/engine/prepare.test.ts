import type { Services } from "./services";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramPreparation, preparationDepth, preparationMaterial } from "./prepare";
import { createWorldUniforms } from "./uniforms";
import type { EngineContext } from "./types";
import { deferred } from "./deferred";
import { EdgeDetectionMaterial, SMAAWeightsMaterial } from "postprocessing";
import { GraphicsValidity } from "./graphics";
import { PreparationQueue } from "./preparation-queue";
import { getHarbourMaterials } from "../world/materials";
import { chainedKitMaterial } from "../life/figure-kit";
import { Workers } from "../civic/workers";
import { createFleetMaterials, type FleetUniforms } from "../fleet/fleet-material";
import { FleetSystem } from "../fleet/fleet-system";
import { onShaderFailure } from "./shader-failure";

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
    debug: { checkShaderErrors: true, onShaderError: null as THREE.WebGLRenderer["debug"]["onShaderError"] },
    getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 3,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { target = next; }),
    extensions: { has: () => parallel }, properties: { get: (material: THREE.Material) => programs.get(material) ?? {} },
    compile, compileAsync: vi.fn((object: THREE.Object3D) => { compile(object); return completion.promise; }), initTexture: vi.fn(),
  };
  const ctx = { scene, camera, renderer, composer: { inputBuffer: input }, uniforms: createWorldUniforms(), services: new Map() as Services } as unknown as EngineContext;
  return { ctx, scene, camera, renderer, input, previous, completion, reflected, preparation: new ProgramPreparation(ctx), target: () => target };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("requestIdleCallback", undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("owned program preparation", () => {
  it("rejects a reflected shader failure without publishing or poisoning the current variant", async () => {
    const h = harness(false), graphics = new GraphicsValidity();
    h.ctx.services.set("graphics-validity", graphics);
    const material = new THREE.MeshBasicMaterial(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); h.scene.add(mesh);
    h.reflected.mockImplementationOnce(() => graphics.onShaderError());
    const pending = h.preparation.prepareWorld(), rejected = expect(pending).rejects.toMatchObject({ code: "shader" });
    await vi.advanceTimersByTimeAsync(100); await rejected; // the shared queue submits in frame-paced slots
    expect(mesh.material).toBe(material); expect(h.target()).toBe(h.previous);
    expect(() => graphics.assertValid()).not.toThrow();
    h.preparation.dispose();
  });
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
    await vi.advanceTimersByTimeAsync(100);
    expect(mesh.material).toBe(material); expect(mesh.children).toEqual([child]);
    expect(light.visible).toBe(true); expect(h.target()).toBe(h.previous);
    expect(h.renderer.setRenderTarget).toHaveBeenLastCalledWith(h.previous, 2, 3);
    // A live currentProgram mutation cannot affect compileAsync's owned material.
    expect(owned).toBeDefined();
    h.completion.resolve();
    await vi.advanceTimersByTimeAsync(100);
    const batch = await pending;
    expect(batch.status).toBe("complete");
    batch.dispose(); h.preparation.dispose(); mesh.geometry.dispose(); material.dispose();
  });

  it("uses synchronous compilation without KHR and reflects before reporting readiness", async () => {
    const h = harness(false);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); h.scene.add(mesh);
    const pending = h.preparation.prepareWorld();
    await vi.advanceTimersByTimeAsync(100);
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
    await vi.advanceTimersByTimeAsync(100); await failure;
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
    await vi.advanceTimersByTimeAsync(100);
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
    await vi.advanceTimersByTimeAsync(100);
    expect(h.renderer.initTexture).toHaveBeenCalledExactlyOnceWith(texture);
    texture.needsUpdate = true; h.preparation.stageTextures(mesh);
    await vi.advanceTimersByTimeAsync(100);
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
    await vi.advanceTimersByTimeAsync(100);
    expect(h.renderer.compileAsync).toHaveBeenCalledTimes(3);
    expect(h.reflected).not.toHaveBeenCalled();
    h.completion.resolve();
    await vi.advanceTimersByTimeAsync(100);
    const batch = await pending;
    expect(h.reflected).toHaveBeenCalledTimes(6);
    batch.dispose(); h.preparation.dispose();
  });

  it("uses presentation frames even when idle callbacks have no remaining time", async () => {
    const idle = vi.fn((callback: IdleRequestCallback, options?: IdleRequestOptions) =>
      window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), options?.timeout));
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("cancelIdleCallback", clearTimeout);
    const h = harness(false);
    for (let i = 0; i < 400; i++) h.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const pending = h.preparation.prepareWorld();
    await vi.advanceTimersByTimeAsync(500);
    const batch = await pending;
    expect(h.renderer.compile).toHaveBeenCalledTimes(400);
    expect(idle).not.toHaveBeenCalled();
    expect(h.reflected).toHaveBeenCalledTimes(800);
    batch.dispose(); h.preparation.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not spend a presentation frame per already-ready KHR program", async () => {
    const h = harness(true); h.completion.resolve();
    for (let i = 0; i < 400; i++) h.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    let complete = false;
    const pending = h.preparation.prepareWorld().then((batch) => { complete = true; return batch; });
    await vi.advanceTimersByTimeAsync(500);
    expect(complete).toBe(true);
    const batch = await pending;
    expect(h.reflected).toHaveBeenCalledTimes(800);
    batch.dispose(); h.preparation.dispose();
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
    await vi.advanceTimersByTimeAsync(100);
    // compileAsync never resolves; the preparation deadline must still settle.
    await vi.advanceTimersByTimeAsync(30000);
    const batch = await pending;
    expect(batch.status).toBe("timed-out");
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

  it("prepares kit/fleet/life/workers/predepth/shadow variants in both directions without changing live versions", async () => {
    const h = harness(false), mats = getHarbourMaterials(h.ctx);
    const kit = mats.kit(), life = chainedKitMaterial(mats, "test", { vertexHead: "", vertexPose: "", uniforms: {} });
    const fleetUniforms = (new FleetSystem() as unknown as { uniforms: FleetUniforms }).uniforms;
    const fleet = createFleetMaterials(mats, h.ctx.uniforms, fleetUniforms);
    const workers = new Workers(mats, 2, 17);
    const geometry = new THREE.BoxGeometry();
    const land = new THREE.Mesh(geometry, kit); land.castShadow = true;
    h.scene.add(land, new THREE.Mesh(geometry, life), new THREE.Mesh(geometry, fleet.material), workers.mesh);
    mats.staticDepth.add(land);
    h.preparation.register({ root: mats.staticDepth.scene, camera: h.camera, target: () => h.input });
    const versions = [kit, life, fleet.material, workers.mesh.material as THREE.Material].map((m) => m.version);
    const records: { key: string; defines: Record<string, string | number | boolean>; target: THREE.WebGLRenderTarget | null }[] = [];
    h.renderer.compile.mockImplementation((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material;
      const shader = { ...THREE.ShaderLib.standard, uniforms: {}, defines: {} } as THREE.WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, h.ctx.renderer);
      records.push({ key: material.customProgramCacheKey(), defines: shader.defines ?? {}, target: h.target() });
    });
    for (const lite of [true, false]) {
      records.length = 0;
      const pending = h.preparation.prepareWorld(() => mats.preparationScope(lite));
      await vi.advanceTimersByTimeAsync(500);
      const batch = await pending;
      expect(batch.status).toBe("complete");
      for (const prefix of ["hb_kit_0", "hb_fleet_", "hb_life_test", "hb_life_civic_worker", "hb_kit_predepth", "hb_kit_depth"]) {
        const record = records.find((r) => r.key.startsWith(prefix));
        expect(record, prefix).toBeDefined();
        if (prefix !== "hb_kit_depth") expect("HB_LITE" in record!.defines).toBe(lite);
      }
      const shadow = records.find((r) => r.key.startsWith("hb_kit_depth"))!;
      expect(shadow.target).not.toBe(h.input); expect(shadow.target?.depthTexture?.compareFunction).toBe(THREE.LessEqualCompare);
      expect(mats.featureIdentity().lite).toBe(false);
      expect([kit, life, fleet.material, workers.mesh.material as THREE.Material].map((m) => m.version)).toEqual(versions);
      batch.dispose();
    }
    workers.dispose(); life.dispose(); fleet.material.dispose(); fleet.depth.dispose(); geometry.dispose();
    for (const uniform of [fleetUniforms.uFleetData, fleetUniforms.uFleetPaint, fleetUniforms.uEmblems, fleetUniforms.uBoards]) uniform.value.dispose();
    h.preparation.dispose(); mats.dispose();
  });

  it("rejects failed shader links and delivers one bounded failure hook", async () => {
    const h = harness(false), failed = vi.fn();
    const off = onShaderFailure(h.ctx.renderer, failed);
    h.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    h.reflected.mockImplementation(() => h.renderer.debug.onShaderError?.({} as WebGLRenderingContext, {} as Parameters<NonNullable<THREE.WebGLRenderer["debug"]["onShaderError"]>>[1], {} as WebGLShader, {} as WebGLShader));
    const pending = h.preparation.prepareWorld(), failure = expect(pending).rejects.toThrow("could not link");
    await vi.advanceTimersByTimeAsync(100); await failure;
    expect(failed).toHaveBeenCalledOnce();
    const late = vi.fn(); onShaderFailure(h.ctx.renderer, late)(); expect(late).toHaveBeenCalledOnce();
    off(); h.preparation.dispose();
  });
});

describe("shared presentation allowance", () => {
  it("shares 2 ms between concurrent jobs, prioritises visible work and counts indivisible overruns", async () => {
    let cpu = 0;
    vi.spyOn(performance, "now").mockImplementation(() => Date.now() + cpu);
    const queue = new PreparationQueue(), order: string[] = [];
    const run = (name: string, cost = 1) => () => { order.push(name); cpu += cost; };
    const jobs = [queue.submit(run("background"), { priority: "background" }), queue.submit(run("visible")), queue.submit(run("next"))];
    await vi.advanceTimersByTimeAsync(16);
    expect(order).toEqual(["visible", "next"]); expect(queue.stats.pending).toBe(1);
    await vi.advanceTimersByTimeAsync(16); await Promise.all(jobs);
    expect(queue.stats.overruns).toBe(0);
    const slow = queue.submit(run("driver", 3));
    await vi.advanceTimersByTimeAsync(16); await slow;
    expect(queue.stats).toMatchObject({ overruns: 1, maxOverrunMs: 1, submitted: 4 });
    queue.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it("ages background work and releases cancelled waiters without starving", async () => {
    let cpu = 0;
    vi.spyOn(performance, "now").mockImplementation(() => Date.now() + cpu);
    const queue = new PreparationQueue(), controller = new AbortController(), background = vi.fn();
    const cancelled = queue.submit(() => {}, { signal: controller.signal });
    const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await rejection;
    const pending = queue.submit(background, { priority: "background" });
    const visible = async () => { for (let i = 0; i < 30; i++) await queue.submit(() => { cpu += 2; }); };
    const flood = visible();
    await vi.advanceTimersByTimeAsync(1000); await Promise.all([pending, flood]);
    expect(background).toHaveBeenCalledOnce(); expect(queue.stats.maxQueueAgeMs).toBeLessThan(300);
    const disposed = queue.submit(() => {}), disposedRejection = expect(disposed).rejects.toMatchObject({ name: "AbortError" });
    queue.dispose(); await disposedRejection; expect(vi.getTimerCount()).toBe(0);
  });
});
