import type { ServiceMap, Services } from "./services";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FrameProfile } from "./frame-profile";

// Real-driver capability probes are covered by graphics.test.ts; the frame/lifecycle harness has no GL context.
vi.mock("./graphics", async (importOriginal) => ({ ...(await importOriginal<typeof import("./graphics")>()), probeGraphics: vi.fn() }));
import { Engine } from "./engine";
import { CameraRig } from "./camera-rig";
import { TimeOfDay } from "./time-of-day";
import { createWorldUniforms } from "./uniforms";
import type { EngineContext, HarbourStats, RenderedFleetState, WorldSystem } from "./types";
import { ProgramPreparation } from "./prepare";
import { deferred } from "./deferred";
import { GraphicsValidity } from "./graphics";
import { BootFailure, type HarbourLifecycle } from "./failure";
import { TIERS } from "./quality";
import { QualityGovernor } from "./governor";
import type { QualitySettings } from "./quality";
import type { PreparedPrograms } from "./prepare";
import { getHarbourMaterials } from "../world/materials";
import { chainedKitMaterial } from "../life/figure-kit";
import { installShaderFailureHook } from "./shader-failure";

interface EngineHarness {
  ctx: EngineContext;
  graphics: GraphicsValidity;
  lifecycle: HarbourLifecycle;
  lifecycleListeners: Set<(state: HarbourLifecycle) => void>;
  onLifecycle(cb: (state: HarbourLifecycle) => void): () => void;
  onContextLost(event: Event): void;
  onContextRestored(): void;
  abort(): void;
  stop(): void;
  failedFrames: number;
  stats: HarbourStats;
  firstFrameMs: number | null;
  systems: WorldSystem[];
  ready: Set<WorldSystem>;
  profile: FrameProfile | null;
  later: WorldSystem[];
  begun: Set<WorldSystem>;
  disposed: boolean;
  aborted: boolean;
  preparation: { prepareGroup: Mock; invalidate: Mock; prepareWorld: Mock; generation: number };
  qualityPreparation: Map<string, Promise<void>>;
  qualityPrograms: Set<PreparedPrograms>;
  qualityReady: Set<QualitySettings["tier"]>;
  governor: { end: Mock; pause: Mock; resume: Mock; reconcileDisplay: Mock; resetTiming: Mock; publish: Mock; dpr: number };
  booted: boolean;
  requestedRunning: boolean;
  running: boolean;
  clock: { last: number; elapsed: number };
  frameState: { delta: number };
  container: { clientWidth: number; clientHeight: number };
  onResize: () => void;
  start(): void;
  stop(): void;
  reconcileRunning(): void;
  init(): Promise<void>;
  post: { preparationEntries: Mock };
  prepareQuality(settings: QualitySettings, signal?: AbortSignal): Promise<void>;
  warmQuality: Mock;
  initLater(): Promise<void>;
  init(): Promise<void>;
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
    getPixelRatio: () => 1, setDrawingBufferSize: vi.fn(),
  };
  const composer = { render: vi.fn(), setSize: vi.fn() };
  const ctx = {
    camera, renderer, composer, rig: new CameraRig(camera), timeOfDay: new TimeOfDay(),
    scene: new THREE.Scene(),
    uniforms: createWorldUniforms(), services: new Map() as Services,
  } as unknown as EngineContext;
  const engine = Object.assign(Object.create(Engine.prototype), {
    ctx, container: { clientWidth: 1000, clientHeight: 700 }, width: 0, height: 0, pixelRatio: 0,
    graphics: new GraphicsValidity(), lifecycle: { state: "BOOTING", code: null }, lifecycleListeners: new Set(), failedFrames: 0,
    lifetime: new AbortController(), stop: vi.fn(),
    firstFrameMs: null, startMs: 0, profile: null, clock: { last: 0, elapsed: 0 },
    frameState: { elapsed: 0, delta: 0, nowMs: 0 }, rendered: { revision: 0, boats: 0 },
    renderedListeners: new Set(), systems: [], ready: new Set(), later: [], begun: new Set(),
    disposed: false, aborted: false, preparation: { prepareGroup: vi.fn(async () => {}), invalidate: vi.fn(), prepare: vi.fn(), prepareWorld: vi.fn(), generation: 0 },
    qualityPreparation: new Map(), qualityPrograms: new Set(), qualityReady: new Set(), warmQuality: vi.fn(),
    backingLimits: { width: 8192, height: 8192 }, resolutionDpr: 0,
    booted: false, requestedRunning: false, running: false, raf: 0,
    stats: { backend: "webgl2", drawCalls: 0, triangles: 0, textures: 0, programs: 0, hour: 0, systems: [], firstFrameMs: null, firstFleetFrameMs: null, renderedRevision: 0, renderedBoats: 0 },
    input: { update: vi.fn() }, post: { update: vi.fn(), prepareGrade: vi.fn(async () => {}) },
    governor: { begin: vi.fn(), end: vi.fn(), pause: vi.fn(), resume: vi.fn(), reconcileDisplay: vi.fn(() => false), resetTiming: vi.fn(), publish: vi.fn(), dpr: 1, tier: "high", gpuMs: 2, gpuP50Ms: 3, gpuSamples: 30, gpuCompletedSamples: 50, gpuPendingQueries: 1, gpuDisjointSamples: 2, gpuSkippedQueries: 0 },
  }) as EngineHarness;
  engine.onResize = () => engine.resize();
  return { engine, ctx, renderer, composer };
}

describe("engine preparation and rendered readiness", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { search: "", hash: "" });
    vi.stubGlobal("window", {});
    vi.stubGlobal("devicePixelRatio", 1);
    vi.stubGlobal("document", { hidden: false, removeEventListener: vi.fn() });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("publishes terminal boot failures and cancels the lifetime before rejecting", async () => {
    const { engine } = frameEngine(), states = vi.fn(), error = new BootFailure("loading");
    Object.assign(engine, { initialize: async () => { throw error; } });
    engine.onLifecycle(states);
    await expect(engine.init()).rejects.toBe(error);
    expect(engine.aborted).toBe(true);
    expect(states).toHaveBeenLastCalledWith({ state: "FAILED", code: "loading" });
  });

  it("prepares the complete target tier once, sharing idle and explicit requests and retaining their programs", async () => {
    const { engine } = frameEngine();
    const entries: unknown[] = [], dispose = vi.fn();
    engine.post.preparationEntries = vi.fn(() => ({ entries, dispose }));
    const completion = deferred<PreparedPrograms>();
    const batch: PreparedPrograms = { status: "complete", sources: new Set<THREE.Material>(), dispose: vi.fn() };
    engine.preparation.prepareWorld.mockReturnValue(completion.promise);
    const first = engine.prepareQuality(TIERS.low);
    expect(engine.prepareQuality(TIERS.low)).toBe(first);
    expect(engine.preparation.prepareWorld).toHaveBeenCalledExactlyOnceWith(expect.any(Function), entries, undefined, "visible");
    expect(engine.preparation.invalidate).not.toHaveBeenCalled();
    completion.resolve(batch);
    await first;
    await engine.prepareQuality(TIERS.low);
    expect(engine.preparation.prepareWorld).toHaveBeenCalledTimes(1);
    getHarbourMaterials(engine.ctx).setLite(true);
    await engine.prepareQuality(TIERS.low);
    expect(engine.preparation.prepareWorld).toHaveBeenCalledTimes(1);
    expect(engine.qualityPrograms.has(batch)).toBe(true);
    expect(batch.dispose).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("retries superseded world preparations but releases late completion after teardown", async () => {
    const { engine } = frameEngine();
    const dispose = vi.fn();
    engine.post.preparationEntries = vi.fn(() => ({ entries: [], dispose }));
    const completion = deferred<PreparedPrograms>();
    const batch: PreparedPrograms = { status: "complete", sources: new Set<THREE.Material>(), dispose: vi.fn() };
    engine.preparation.prepareWorld
      .mockRejectedValueOnce(new DOMException("Season superseded", "AbortError"))
      .mockReturnValueOnce(completion.promise);
    const pending = engine.prepareQuality(TIERS.medium);
    await Promise.resolve();
    expect(engine.preparation.prepareWorld).toHaveBeenCalledTimes(2);
    engine.disposed = true;
    completion.resolve(batch);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(batch.dispose).toHaveBeenCalledOnce();
    expect(engine.qualityPrograms.size).toBe(0);
    expect(engine.qualityPreparation.size).toBe(0);
  });

  it("rejects timed-out tiers and rebuilds readiness for late materials and season generations", async () => {
    const { engine, ctx } = frameEngine();
    engine.post.preparationEntries = vi.fn(() => ({ entries: [], dispose() {} }));
    const partial: PreparedPrograms = { status: "timed-out", sources: new Set(), dispose: vi.fn() };
    engine.preparation.prepareWorld.mockResolvedValueOnce(partial);
    await expect(engine.prepareQuality(TIERS.low)).rejects.toThrow("timed out");
    expect(partial.dispose).toHaveBeenCalledOnce(); expect(engine.qualityPrograms.size).toBe(0);
    const complete = (): PreparedPrograms => ({ status: "complete", sources: new Set(), dispose: vi.fn() });
    engine.preparation.prepareWorld.mockImplementation(async () => complete());
    await engine.prepareQuality(TIERS.low);
    const mats = getHarbourMaterials(ctx), life = chainedKitMaterial(mats, "late", { vertexHead: "", vertexPose: "", uniforms: {} });
    await engine.prepareQuality(TIERS.low);
    ctx.uniforms.uSeasonPhase.value = 0.1;
    await engine.prepareQuality(TIERS.low);
    engine.preparation.generation++;
    await engine.prepareQuality(TIERS.low);
    expect(engine.preparation.prepareWorld).toHaveBeenCalledTimes(5);
    expect(engine.qualityPrograms.size).toBe(4); // Adoption cannot evict a future tier's resident programs.
    for (const batch of engine.qualityPrograms) expect(batch.dispose).not.toHaveBeenCalled();
    life.dispose(); mats.dispose();
  });

  it("cancels an individual tier consumer without destroying shared preparation", async () => {
    const { engine } = frameEngine();
    engine.post.preparationEntries = vi.fn(() => ({ entries: [], dispose() {} }));
    const completion = deferred<PreparedPrograms>(), controller = new AbortController();
    const batch: PreparedPrograms = { status: "complete", sources: new Set(), dispose: vi.fn() };
    engine.preparation.prepareWorld.mockReturnValue(completion.promise);
    const cancelled = engine.prepareQuality(TIERS.medium, controller.signal), shared = engine.prepareQuality(TIERS.medium);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    completion.resolve(batch); await shared;
    expect(engine.preparation.prepareWorld).toHaveBeenCalledOnce(); expect(batch.dispose).not.toHaveBeenCalled();
  });

  it("blocks rendered readiness when Three reports a link failure without throwing", () => {
    const { engine, ctx, renderer, composer } = frameEngine();
    const debug = { checkShaderErrors: false, onShaderError: null as THREE.WebGLRenderer["debug"]["onShaderError"] };
    Object.assign(renderer, { debug });
    const uninstall = installShaderFailureHook(ctx.renderer), rendered = vi.fn();
    engine.onRendered(rendered);
    ctx.services.set("fleet-frame", { revision: 1, boats: 12 });
    composer.render.mockImplementationOnce(() => debug.onShaderError?.({} as WebGLRenderingContext, {} as Parameters<NonNullable<typeof debug.onShaderError>>[1], {} as WebGLShader, {} as WebGLShader));
    const states: HarbourLifecycle[] = [];
    engine.onLifecycle((state) => states.push(state));
    engine.frame(16); // boot's frame policy catches the latched link failure and enters recovery
    expect(states.at(-1)).toMatchObject({ state: "RECOVERING", code: "shader" });
    expect(engine.stats.renderedRevision).toBe(0); expect(rendered).not.toHaveBeenCalled();
    uninstall();
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
    expect(completed).toEqual([{ revision: 0, boats: 0, drawn: 0 }]);
    expect(engine.stats.firstFleetFrameMs).toBeNull();
    Object.assign(readiness, { revision: 1, boats: 12, prepared: true });
    Object.assign(posed, { revision: 1, boats: 11 });
    composer.render.mockImplementationOnce(() => {
      expect(engine.stats.renderedRevision).toBe(0);
      expect(completed).toHaveLength(1);
    });
    engine.frame(32);
    expect(completed[1]).toEqual({ revision: 1, boats: 11, drawn: 11 }); // Desired readiness must not invent a posed boat.
    expect(engine.stats.firstFleetFrameMs).not.toBeNull();
    Object.assign(readiness, { revision: 2, boats: 14 });
    Object.assign(posed, { revision: 1, boats: 12 }); // New readiness was not posed yet.
    engine.profile = new FrameProfile();
    engine.profiledFrame(48);
    expect(completed[2]).toEqual({ revision: 1, boats: 12, drawn: 12 });
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
    expect(() => engine.frame(16)).not.toThrow();
    expect(engine.failedFrames).toBe(1);
    expect(engine.stats.renderedRevision).toBe(0);
    expect(completed).not.toHaveBeenCalled();
  });

  it.each([false, true])("balances frame queries, resets the failure streak, and stops after three failures (profile=%s)", (profile) => {
    const { engine, composer } = frameEngine();
    const governor = (engine as unknown as { governor: { begin: Mock; end: Mock } }).governor;
    if (profile) { engine.firstFrameMs = 1; engine.profile = new FrameProfile(); }
    const states: HarbourLifecycle[] = [];
    engine.onLifecycle((state) => states.push(state));
    composer.render.mockImplementationOnce(() => { throw new Error("draw"); });
    engine.frame(16); expect(engine.failedFrames).toBe(1);
    engine.frame(32); expect(engine.failedFrames).toBe(0);
    composer.render.mockImplementation(() => { throw new Error("draw"); });
    for (const time of [48, 64, 80, 96]) engine.frame(time);
    expect(states.at(-1)).toEqual({ state: "FAILED", code: "frames" });
    expect(engine.aborted).toBe(true);
    expect(governor.begin).toHaveBeenCalledTimes(5);
    expect(governor.end).toHaveBeenCalledTimes(5);
  });

  it("never publishes a shader diagnostic even when composer.render returns normally", () => {
    const { engine, composer } = frameEngine(), published = vi.fn(), states = vi.fn();
    engine.onRendered(published); engine.onLifecycle(states);
    composer.render.mockImplementation(() => engine.graphics.onShaderError());
    engine.frame(16);
    expect(published).not.toHaveBeenCalled();
    expect(states).toHaveBeenLastCalledWith({ state: "RECOVERING", code: "shader" });
    expect(engine.stats.firstFleetFrameMs).toBeNull();
  });

  it("holds the context owner until restoration or the deadline and cancels feed/audio immediately", async () => {
    vi.useFakeTimers(); vi.stubGlobal("window", globalThis);
    const { engine, ctx } = frameEngine(), states = vi.fn(), data = { name: "data", init() {}, update() {}, dispose: vi.fn() };
    const sound = { dispose: vi.fn() }; ctx.services.set("sound", sound as unknown as ServiceMap["sound"]); engine.begun.add(data);
    const off = engine.onLifecycle(states), event = new Event("webglcontextlost", { cancelable: true });
    engine.onContextLost(event);
    expect(event.defaultPrevented).toBe(true); expect(engine.aborted).toBe(true);
    expect(data.dispose).toHaveBeenCalledOnce(); expect(sound.dispose).toHaveBeenCalledOnce();
    expect(states).toHaveBeenLastCalledWith({ state: "RECOVERING", code: "context-lost" });
    engine.onContextRestored();
    expect(states).toHaveBeenLastCalledWith({ state: "BOOTING", code: "context-lost" });
    await vi.advanceTimersByTimeAsync(30000);
    expect(states).not.toHaveBeenCalledWith({ state: "FAILED", code: "context-lost" });
    off(); engine.onContextRestored();
    expect(states).toHaveBeenCalledTimes(3);

    const exhausted = frameEngine().engine, terminal = vi.fn(); exhausted.onLifecycle(terminal);
    exhausted.onContextLost(new Event("webglcontextlost"));
    await vi.advanceTimersByTimeAsync(30000);
    expect(terminal).toHaveBeenLastCalledWith({ state: "FAILED", code: "context-lost" });
    exhausted.onContextRestored();
    expect(terminal).toHaveBeenCalledTimes(3);
  });

  it("skips unchanged resize fanout but initializes newly ready systems on the boot resize", () => {
    const { engine, renderer, composer } = frameEngine();
    const system = { name: "test", init() {}, update() {}, dispose() {}, resize: vi.fn() };
    engine.systems.push(system); engine.ready.add(system);
    engine.resize();
    engine.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);
    expect(composer.setSize).toHaveBeenCalledTimes(1);
    expect(system.resize).toHaveBeenCalledTimes(1);
    engine.resize(true);
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);
    expect(system.resize).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("passes raw visible timing separately from animation's clamp (profiled=%s)", (profiled) => {
    const { engine, composer } = frameEngine();
    if (profiled) engine.profile = new FrameProfile();
    engine.firstFrameMs = 1;
    engine.frame(250);
    expect(engine.frameState.delta).toBe(0.1);
    expect(engine.clock.elapsed).toBe(0.1);
    expect(composer.render).toHaveBeenCalledWith(0.1);
    expect(engine.governor.end).toHaveBeenCalledWith(0.25);
  });

  it.each([60, 120, 144])("integrates equal animation time at %i Hz", (hz) => {
    const { engine } = frameEngine();
    for (let i = 1; i <= hz; i++) engine.frame(i * 1000 / hz);
    expect(engine.clock.elapsed).toBeCloseTo(1, 8);
  });

  it("reconciles display DPR at unchanged CSS size and publishes actual allocation everywhere", () => {
    const { engine, ctx, renderer, composer } = frameEngine();
    const gl = { RENDERER: 1, getExtension: () => null, getParameter: () => "NVIDIA RTX 4070" } as unknown as WebGL2RenderingContext;
    vi.stubGlobal("devicePixelRatio", 2);
    const governor = new QualityGovernor(gl, () => engine.resize());
    Object.assign(engine, { governor });
    const changed = vi.fn(); governor.onChange(changed);
    engine.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(1000, 700, 2);
    vi.stubGlobal("devicePixelRatio", 1);
    engine.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(1000, 700, 1);
    expect(ctx.uniforms.uResolution.value.toArray()).toEqual([1000, 700]);
    expect(engine.stats.dpr).toBe(1);
    expect(governor.dpr).toBe(1);
    expect(changed).toHaveBeenCalledExactlyOnceWith(TIERS.high, 1);
    engine.resize();
    expect(composer.setSize).toHaveBeenCalledTimes(2);
    vi.stubGlobal("devicePixelRatio", 2);
    engine.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(1000, 700, 1.5);
    expect(governor.ladder.at(-1)?.dpr).toBe(2);
  });

  it("renews the resolution listener for zoom without a CSS resize and removes the old listener", () => {
    const queries: { addEventListener: Mock; removeEventListener: Mock }[] = [];
    const media = vi.fn(() => {
      const query = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
      queries.push(query); return query;
    });
    vi.stubGlobal("matchMedia", media);
    const { engine } = frameEngine();
    engine.resize();
    const listener = queries[0].addEventListener.mock.calls[0][1] as () => void;
    vi.stubGlobal("devicePixelRatio", 1.25);
    listener();
    expect(queries[0].removeEventListener).toHaveBeenCalledWith("change", listener);
    expect(media).toHaveBeenLastCalledWith("(resolution: 1.25dppx)");
    expect(engine.governor.reconcileDisplay).toHaveBeenLastCalledWith(1.25, 2);
    engine.resize();
    expect(queries).toHaveLength(2);
  });

  it("applies hard limits before a combined size/DPR allocation, including explicit overrides", () => {
    vi.stubGlobal("location", { search: "?dpr=2&quality=high", hash: "" });
    const { engine, ctx, renderer } = frameEngine();
    const gl = { RENDERER: 1, getExtension: () => null, getParameter: () => "NVIDIA RTX 4070" } as unknown as WebGL2RenderingContext;
    const governor = new QualityGovernor(gl, () => engine.resize());
    Object.assign(engine, { governor, backingLimits: { width: 2000, height: 1000 } });
    engine.container.clientWidth = 4000; engine.container.clientHeight = 2000;
    engine.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(4000, 2000, 0.5);
    expect(ctx.camera.aspect).toBe(2);
    expect(ctx.uniforms.uResolution.value.toArray()).toEqual([2000, 1000]);
    expect(engine.stats.dpr).toBe(0.5);
    engine.container.clientWidth = 1000; engine.container.clientHeight = 500;
    engine.resize();
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(1000, 500, 2);
    expect(governor.dpr).toBe(2);
  });

  it("does not schedule before boot, or on hidden boot completion, and resumes once visible", async () => {
    const visibility = { hidden: false };
    vi.stubGlobal("document", visibility);
    const { engine } = frameEngine();
    const ready = deferred<PreparedPrograms>();
    Object.assign(engine.post, { seal: vi.fn(), preparationEntries: () => ({ entries: [], dispose: vi.fn() }) });
    Object.assign(engine.preparation, { prepareWorld: () => ready.promise, adopt: vi.fn() });
    engine.start();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    const boot = engine.init();
    visibility.hidden = true;
    engine.reconcileRunning();
    ready.resolve({ sources: new Set(), status: "complete", dispose: vi.fn() });
    await boot;
    engine.start(); // Production also requests start after init resolves.
    expect(engine.booted).toBe(true);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    visibility.hidden = false;
    engine.reconcileRunning(); engine.start();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(engine.governor.resume).toHaveBeenCalledOnce();
  });

  it("preserves intentional stop across visibility changes and boot completion", async () => {
    const visibility = { hidden: false };
    vi.stubGlobal("document", visibility);
    const { engine } = frameEngine();
    delete (engine as { stop?: unknown }).stop; // the harness stubs stop() for abort tests; this case needs the real one
    const ready = deferred<PreparedPrograms>();
    Object.assign(engine.post, { seal: vi.fn(), preparationEntries: () => ({ entries: [], dispose: vi.fn() }) });
    Object.assign(engine.preparation, { prepareWorld: () => ready.promise, adopt: vi.fn() });
    engine.start();
    const boot = engine.init();
    engine.stop();
    ready.resolve({ sources: new Set(), status: "complete", dispose: vi.fn() }); await boot;
    visibility.hidden = true; engine.reconcileRunning();
    visibility.hidden = false; engine.reconcileRunning();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    engine.start(); engine.stop();
    engine.reconcileRunning();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(engine.running).toBe(false);
  });

  it("resets timing on resume, ignores hidden time and guards a queued hidden callback", () => {
    const visibility = { hidden: false };
    vi.stubGlobal("document", visibility);
    const { engine } = frameEngine(); engine.booted = true;
    vi.spyOn(performance, "now").mockReturnValue(1000);
    engine.start();
    const firstTick = vi.mocked(requestAnimationFrame).mock.calls[0][0];
    visibility.hidden = true;
    firstTick(2000); // Visibility event need not have arrived yet.
    expect(engine.governor.end).not.toHaveBeenCalled();
    expect(engine.running).toBe(false);
    expect(engine.governor.pause).toHaveBeenCalledOnce();
    vi.spyOn(performance, "now").mockReturnValue(100_000);
    visibility.hidden = false; engine.reconcileRunning();
    const resumedTick = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    resumedTick(100_016.7);
    expect(engine.governor.end.mock.calls[0][0]).toBeCloseTo(0.0167);
    expect(engine.governor.resume).toHaveBeenCalledTimes(2);
  });

  it.each(["aborted", "disposed"])("never schedules after %s", (flag) => {
    const { engine } = frameEngine();
    Object.assign(engine, { booted: true, [flag]: true });
    engine.start(); engine.reconcileRunning();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(engine.running).toBe(false);
  });

  it("does not turn installed readiness into render evidence without a posed fleet service", () => {
    const { engine, ctx } = frameEngine();
    ctx.services.set("readiness", { revision: 7, boats: 99, prepared: true });
    const completed: RenderedFleetState[] = [];
    engine.onRendered((state) => completed.push({ ...state }));
    engine.frame(16);
    expect(completed).toEqual([{ revision: 0, boats: 0, drawn: 0 }]);
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
        domElement: { remove: vi.fn(), removeEventListener: vi.fn() },
      });
      Object.assign(composer, { dispose: vi.fn() });
      Object.assign(ctx, { assets: { dispose: vi.fn() } });
      Object.assign(engine, {
        abort: vi.fn(), stop: vi.fn(), input: { dispose: vi.fn() },
        post: { dispose: vi.fn() }, governor: { dispose: vi.fn() },
      });
      const resolution = { removeEventListener: vi.fn() };
      Object.assign(engine, { resolution });
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
      expect(resolution.removeEventListener).toHaveBeenCalledExactlyOnceWith("change", engine.onResize);
      expect(disposed).toHaveBeenCalledTimes(cycle + 1);
      expect(retainedRenderers).toBe(0);
    }
  });
});

describe("CPU profiler ring", () => {
  it("wraps in chronological order, retains sums/max, and resets every population", () => {
    const profile = new FrameProfile(3);
    for (let frame = 1; frame <= 5; frame++) {
      profile.frames++; profile.tag("stage:fleet");
      profile.ms.TOTAL = (profile.ms.TOTAL ?? 0) + frame;
      profile.max.TOTAL = frame;
      profile.record({ frame, revision: 2, tier: "low", dpr: 1, cpuMs: frame, rafGapMs: frame * 2 });
    }
    expect(profile.snapshot()).toMatchObject({ frames: 5, ms: { TOTAL: 15 }, max: { TOTAL: 5 }, cpu: { samples: 3, p50Ms: 4, p95Ms: 5, p99Ms: 5 } });
    expect(profile.snapshot().samples.map((s) => s.frame)).toEqual([3, 4, 5]);
    expect(profile.snapshot().samples[0].tags).toEqual(["stage:fleet"]);
    profile.reset();
    expect(profile.snapshot()).toMatchObject({ frames: 0, ms: {}, max: {}, samples: [], cpu: { p95Ms: null } });
  });
  it("does no CPU profiling when disabled and records revision/stage tags when enabled", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("location", { search: "", hash: "" });
    const { engine, ctx } = frameEngine();
    engine.frame(16);
    expect(window.__harbourProf).toBeUndefined();
    expect(engine.profile).toBeNull();
    engine.profile = new FrameProfile();
    ctx.services.set("fleet-frame", { revision: 4, boats: 2 });
    engine.frame(32);
    expect(engine.profile.snapshot().samples[0]).toMatchObject({ frame: 1, revision: 4, tier: "high", dpr: 1, rafGapMs: 16 });
    expect(engine.profile.snapshot().samples[0].tags).toEqual(expect.arrayContaining(["revision:install", "stage:render", "stage:TOTAL"]));
    vi.unstubAllGlobals();
  });
});

it("CPU upload profiling preserves GL calls, tags reused-buffer uploads and removes its hooks", () => {
  const profile = new FrameProfile();
  const original = vi.fn(() => 42);
  const gl = { bufferSubData: original } as unknown as WebGL2RenderingContext;
  profile.trackUploads(gl);
  expect(gl.bufferSubData(1, 0, new Float32Array([1]))).toBe(42);
  profile.record({ frame: 1, revision: 1, tier: "high", dpr: 1, cpuMs: 2, rafGapMs: 16 });
  expect(profile.snapshot().samples[0].tags).toEqual(["upload:bufferSubData"]);
  expect(original).toHaveBeenCalledOnce();
  expect(original.mock.contexts[0]).toBe(gl);
  profile.dispose();
  expect(gl.bufferSubData).toBe(original);
});
