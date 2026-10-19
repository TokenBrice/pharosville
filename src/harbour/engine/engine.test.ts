import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Engine } from "./engine";
import { CameraRig } from "./camera-rig";
import { TimeOfDay } from "./time-of-day";
import { createWorldUniforms } from "./uniforms";
import type { EngineContext, HarbourStats, RenderedFleetState, WorldSystem } from "./types";
import { ProgramPreparation } from "./prepare";
import { deferred } from "./deferred";
import { TIERS } from "./quality";
import type { QualitySettings } from "./quality";
import type { PreparedPrograms } from "./prepare";

interface EngineHarness {
  ctx: EngineContext;
  stats: HarbourStats;
  firstFrameMs: number | null;
  systems: WorldSystem[];
  ready: Set<WorldSystem>;
  profile: { frames: number; ms: Record<string, number>; max: Record<string, number> } | null;
  later: WorldSystem[];
  begun: Set<WorldSystem>;
  disposed: boolean;
  aborted: boolean;
  preparation: { prepareGroup: Mock; invalidate: Mock; prepare: Mock };
  qualityPreparation: Map<QualitySettings["tier"], Promise<void>>;
  qualityPrograms: Set<PreparedPrograms>;
  post: { preparationEntries: Mock };
  prepareQuality(settings: QualitySettings): Promise<void>;
  warmQuality: Mock;
  initLater(): Promise<void>;
  frame(now: number): void;
  profiledFrame(now: number): void;
  onRendered(cb: (state: RenderedFleetState) => void): () => void;
  resize(forceSystems?: boolean): void;
  dispose(): void;
}

function frameEngine() {
  const camera = new THREE.PerspectiveCamera();
  const renderer = {
    info: { reset: vi.fn(), render: { calls: 12, triangles: 34 }, memory: { textures: 3 }, programs: [{}] },
    getPixelRatio: () => 1, setSize: vi.fn(),
  };
  const composer = { render: vi.fn(), setSize: vi.fn() };
  const ctx = {
    camera, renderer, composer, rig: new CameraRig(camera), timeOfDay: new TimeOfDay(),
    scene: new THREE.Scene(),
    uniforms: createWorldUniforms(), services: new Map(),
  } as unknown as EngineContext;
  const engine = Object.assign(Object.create(Engine.prototype), {
    ctx, container: { clientWidth: 1000, clientHeight: 700 }, width: 0, height: 0, pixelRatio: 0,
    firstFrameMs: null, startMs: 0, profile: null, clock: { last: 0, elapsed: 0 },
    frameState: { elapsed: 0, delta: 0, nowMs: 0 }, rendered: { revision: 0, boats: 0 },
    renderedListeners: new Set(), systems: [], ready: new Set(), later: [], begun: new Set(),
    disposed: false, aborted: false, preparation: { prepareGroup: vi.fn(async () => {}), invalidate: vi.fn(), prepare: vi.fn() },
    qualityPreparation: new Map(), qualityPrograms: new Set(), warmQuality: vi.fn(),
    stats: { backend: "webgl2", drawCalls: 0, triangles: 0, textures: 0, programs: 0, hour: 0, systems: [], firstFrameMs: null, firstFleetFrameMs: null, renderedRevision: 0, renderedBoats: 0 },
    input: { update: vi.fn() }, post: { update: vi.fn() },
    governor: { begin: vi.fn(), end: vi.fn(), dpr: 1, tier: "high", gpuMs: 2, gpuP50Ms: 3, gpuSamples: 30, gpuCompletedSamples: 50, gpuPendingQueries: 1, gpuDisjointSamples: 2, gpuSkippedQueries: 0 },
  }) as EngineHarness;
  return { engine, ctx, renderer, composer };
}

describe("engine preparation and rendered readiness", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { search: "", hash: "" });
    vi.stubGlobal("window", {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });


  it("prepares only post presets once, sharing idle and explicit requests and retaining their programs", async () => {
    const { engine } = frameEngine();
    const entries: unknown[] = [], dispose = vi.fn();
    engine.post.preparationEntries = vi.fn(() => ({ entries, dispose }));
    const completion = deferred<PreparedPrograms>();
    const batch = { sources: new Set<THREE.Material>(), dispose: vi.fn() };
    engine.preparation.prepare.mockReturnValue(completion.promise);
    const first = engine.prepareQuality(TIERS.low);
    expect(engine.prepareQuality(TIERS.low)).toBe(first);
    expect(engine.preparation.prepare).toHaveBeenCalledExactlyOnceWith(entries);
    expect(engine.preparation.invalidate).not.toHaveBeenCalled();
    completion.resolve(batch);
    await first;
    await engine.prepareQuality(TIERS.low);
    expect(engine.preparation.prepare).toHaveBeenCalledTimes(1);
    expect(engine.qualityPrograms.has(batch)).toBe(true);
    expect(batch.dispose).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("retries superseded post preparations but releases late completion after teardown", async () => {
    const { engine } = frameEngine();
    const dispose = vi.fn();
    engine.post.preparationEntries = vi.fn(() => ({ entries: [], dispose }));
    const completion = deferred<PreparedPrograms>();
    const batch = { sources: new Set<THREE.Material>(), dispose: vi.fn() };
    engine.preparation.prepare
      .mockRejectedValueOnce(new DOMException("Season superseded", "AbortError"))
      .mockReturnValueOnce(completion.promise);
    const pending = engine.prepareQuality(TIERS.medium);
    await Promise.resolve();
    expect(engine.preparation.prepare).toHaveBeenCalledTimes(2);
    engine.disposed = true;
    completion.resolve(batch);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(batch.dispose).toHaveBeenCalledOnce();
    expect(engine.qualityPrograms.size).toBe(0);
    expect(engine.qualityPreparation.size).toBe(0);
  });

  it("publishes only composer-completed revisions, marks first fleet once, and shares the profiled path", () => {
    const { engine, ctx, composer } = frameEngine();
    const mark = vi.spyOn(performance, "mark");
    const readiness = { revision: 0, boats: 0, prepared: false };
    ctx.services.set("readiness", readiness);
    const posed = { revision: 0, boats: 0 };
    ctx.services.set("fleet-frame", posed);
    const completed: RenderedFleetState[] = [];
    const off = engine.onRendered((state) => completed.push({ ...state }));
    engine.frame(16);
    expect(completed).toEqual([{ revision: 0, boats: 0 }]);
    expect(engine.stats.firstFleetFrameMs).toBeNull();
    Object.assign(readiness, { revision: 1, boats: 12, prepared: true });
    Object.assign(posed, { revision: 1, boats: 11 });
    composer.render.mockImplementationOnce(() => {
      expect(engine.stats.renderedRevision).toBe(0);
      expect(completed).toHaveLength(1);
    });
    engine.frame(32);
    expect(completed[1]).toEqual({ revision: 1, boats: 11 }); // Desired readiness must not invent a posed boat.
    expect(engine.stats.firstFleetFrameMs).not.toBeNull();
    Object.assign(readiness, { revision: 2, boats: 14 });
    Object.assign(posed, { revision: 1, boats: 12 }); // New readiness was not posed yet.
    engine.profile = { frames: 0, ms: {}, max: {} };
    engine.profiledFrame(48);
    expect(completed[2]).toEqual({ revision: 1, boats: 12 });
    expect(engine.stats).toMatchObject({ renderedRevision: 1, renderedBoats: 12, programs: 1, textures: 3, gpuMs: 2, gpuP10Ms: 2, gpuP50Ms: 3, gpuSamples: 30, gpuCompletedSamples: 50 });
    expect(mark.mock.calls.filter(([name]) => name === "pv:first-frame")).toHaveLength(1);
    expect(mark.mock.calls.filter(([name]) => name === "pv:first-fleet-frame")).toHaveLength(1);
    expect(engine.warmQuality).toHaveBeenCalledOnce();
    off();
    engine.profiledFrame(64);
    expect(completed).toHaveLength(3);
  });

  it("never publishes a failed composer draw", () => {
    const { engine, ctx, composer } = frameEngine();
    ctx.services.set("fleet-frame", { revision: 1, boats: 12 });
    const completed = vi.fn();
    engine.onRendered(completed);
    composer.render.mockImplementationOnce(() => { throw new Error("render failed"); });
    expect(() => engine.frame(16)).toThrow("render failed");
    expect(engine.stats.renderedRevision).toBe(0);
    expect(completed).not.toHaveBeenCalled();
  });

  it("skips unchanged resize fanout but initializes newly ready systems on the boot resize", () => {
    const { engine, renderer, composer } = frameEngine();
    const system = { name: "test", init() {}, update() {}, dispose() {}, resize: vi.fn() };
    engine.systems.push(system); engine.ready.add(system);
    engine.resize();
    engine.resize();
    expect(renderer.setSize).toHaveBeenCalledTimes(1);
    expect(composer.setSize).toHaveBeenCalledTimes(1);
    expect(system.resize).toHaveBeenCalledTimes(1);
    engine.resize(true);
    expect(renderer.setSize).toHaveBeenCalledTimes(1);
    expect(system.resize).toHaveBeenCalledTimes(2);
  });

  it("does not turn installed readiness into render evidence without a posed fleet service", () => {
    const { engine, ctx } = frameEngine();
    ctx.services.set("readiness", { revision: 7, boats: 99, prepared: true });
    const completed: RenderedFleetState[] = [];
    engine.onRendered((state) => completed.push({ ...state }));
    engine.frame(16);
    expect(completed).toEqual([{ revision: 0, boats: 0 }]);
    expect(engine.stats.firstFleetFrameMs).toBeNull();
  });

  it("retries deferred preparation aborts without disposing life or losing original visibility", async () => {
    const { engine, ctx } = frameEngine();
    const visible = new THREE.Group(), hidden = new THREE.Group(); hidden.visible = false;
    const system = { name: "life", init: vi.fn(() => { ctx.scene.add(visible, hidden); }), update() {}, dispose: vi.fn() };
    engine.later.push(system);
    engine.preparation.prepareGroup
      .mockImplementationOnce(async () => {
        expect(visible.visible).toBe(false); expect(hidden.visible).toBe(false);
        throw new DOMException("Live material disposed", "AbortError");
      });
    await engine.initLater();
    expect(system.init).toHaveBeenCalledOnce();
    expect(engine.preparation.prepareGroup).toHaveBeenCalledTimes(3); // Retry first root, then prepare hidden root.
    expect(system.dispose).not.toHaveBeenCalled();
    expect(engine.ready.has(system)).toBe(true);
    expect(visible.visible).toBe(true); expect(hidden.visible).toBe(false);
  });

  it("bounds repeated preparation aborts, warns and retains the deferred scenery", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { engine, ctx } = frameEngine();
    const root = new THREE.Group();
    const system = { name: "identity", init: () => { ctx.scene.add(root); }, update() {}, dispose: vi.fn() };
    engine.later.push(system);
    engine.preparation.prepareGroup.mockRejectedValue(new DOMException("Live material disposed", "AbortError"));
    await engine.initLater();
    expect(engine.preparation.prepareGroup).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledOnce();
    expect(system.dispose).not.toHaveBeenCalled();
    expect(engine.ready.has(system)).toBe(true);
    expect(root.visible).toBe(true);
  });

  it("commits deferred scenery after actual preparation deadlines without disposing either system", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("requestIdleCallback", undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { engine, ctx, renderer } = frameEngine();
    const completion = deferred();
    Object.assign(renderer, {
      getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
      setRenderTarget: vi.fn(), extensions: { has: () => true },
      compileAsync: vi.fn(() => completion.promise), initTexture: vi.fn(),
    });
    const preparation = new ProgramPreparation(ctx);
    engine.preparation.prepareGroup.mockImplementation((root: THREE.Object3D) => preparation.prepareGroup(root));
    const roots = [new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())];
    const systems = roots.map((root, index) => ({
      name: index ? "identity" : "life", init: () => { ctx.scene.add(root); }, update() {}, dispose: vi.fn(),
    }));
    engine.later.push(...systems);
    const pending = engine.initLater();
    await vi.advanceTimersByTimeAsync(60001);
    await pending;
    for (const system of systems) {
      expect(engine.ready.has(system)).toBe(true);
      expect(system.dispose).not.toHaveBeenCalled();
    }
    for (const root of roots) { expect(root.visible).toBe(true); expect(root.parent).toBe(ctx.scene); }
    expect(warn).toHaveBeenCalledOnce();
    preparation.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("logs real deferred errors and restores visibility even when init fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { engine, ctx } = frameEngine();
    const root = new THREE.Group(), failure = new Error("shader failed");
    const system = { name: "life", init: () => { ctx.scene.add(root); }, update() {}, dispose: vi.fn() };
    engine.later.push(system);
    engine.preparation.prepareGroup.mockRejectedValue(failure);
    await engine.initLater();
    expect(error).toHaveBeenCalledWith("[harbour] life init failed", failure);
    expect(system.dispose).toHaveBeenCalledOnce();
    expect(engine.ready.has(system)).toBe(false);
    expect(root.visible).toBe(true);
    const laterRoot = new THREE.Group(); ctx.scene.add(laterRoot);
    expect(laterRoot.visible).toBe(true); // The temporary hiding listener was removed.
  });

  it("does not retry deferred preparation after teardown and still restores visibility", async () => {
    const { engine, ctx } = frameEngine();
    const root = new THREE.Group();
    const system = { name: "life", init: () => { ctx.scene.add(root); }, update() {}, dispose: vi.fn() };
    engine.later.push(system);
    engine.preparation.prepareGroup.mockImplementationOnce(async () => {
      engine.aborted = true;
      throw new DOMException("Engine aborted", "AbortError");
    });
    await engine.initLater();
    expect(engine.preparation.prepareGroup).toHaveBeenCalledOnce();
    expect(system.dispose).toHaveBeenCalledOnce();
    expect(root.visible).toBe(true);
    expect(engine.ready.has(system)).toBe(false);
  });

  it("releases the shared DFG LUT's renderer listener once per remount before material teardown", () => {
    vi.stubGlobal("removeEventListener", vi.fn());
    vi.stubGlobal("document", { removeEventListener: vi.fn() });
    const lut = new THREE.DataTexture();
    lut.name = "DFG_LUT";
    const disposed = vi.spyOn(lut, "dispose");
    let retainedRenderers = 0;
    for (let cycle = 0; cycle < 3; cycle++) {
      const { engine, ctx, renderer, composer } = frameEngine();
      const basic = new THREE.MeshBasicMaterial(), physical = new THREE.MeshStandardMaterial();
      const geometry = new THREE.BufferGeometry();
      ctx.scene.add(new THREE.Mesh(geometry, [basic, physical]), new THREE.Mesh(geometry, physical));
      const onTextureDispose = () => {
        lut.removeEventListener("dispose", onTextureDispose);
        retainedRenderers--;
      };
      lut.addEventListener("dispose", onTextureDispose);
      retainedRenderers++;
      const properties = new Map<THREE.Material, unknown>([
        [basic, { uniforms: {} }], [physical, { uniforms: { dfgLUT: { value: lut } } }],
      ]);
      Object.assign(renderer, {
        properties: { get: (material: THREE.Material) => properties.get(material) },
        dispose: vi.fn(() => { expect(retainedRenderers).toBe(0); properties.clear(); }),
        domElement: { remove: vi.fn() },
      });
      Object.assign(composer, { dispose: vi.fn() });
      Object.assign(ctx, { assets: { dispose: vi.fn() } });
      Object.assign(engine, {
        abort: vi.fn(), stop: vi.fn(), input: { dispose: vi.fn() },
        post: { dispose: vi.fn() }, governor: { dispose: vi.fn() },
      });
      Object.assign(engine.preparation, { dispose: vi.fn() });
      const system: WorldSystem = {
        name: "physical", init() {}, update() {},
        dispose() {
          expect(retainedRenderers).toBe(0);
          properties.clear(); basic.dispose(); physical.dispose(); geometry.dispose();
        },
      };
      engine.systems.push(system); engine.ready.add(system);
      engine.dispose();
      engine.dispose();
      expect(disposed).toHaveBeenCalledTimes(cycle + 1);
      expect(retainedRenderers).toBe(0);
    }
  });
});
