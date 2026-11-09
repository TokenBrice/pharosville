import * as THREE from "three";
import { BloomEffect, EffectComposer, ToneMappingEffect } from "postprocessing";
import { FrameProfile } from "./frame-profile";
import { AssetStore } from "./assets";
import { QualityGovernor } from "./governor";
import { installGpuPassProfiler, type GpuPassProfiler } from "./gpu-passes";
import { PostChain, type PostPreparation } from "./post";
import { prefetchHarbour } from "./prefetch";
import { CameraRig } from "./camera-rig";
import { CameraInput } from "./input";
import { ensureMotionService } from "../ui/services";
import { TimeOfDay } from "./time-of-day";
import { createWorldUniforms } from "./uniforms";
import type { EngineContext, HarbourStats, RenderedFleetState, WorldSystem } from "./types";
import { isPreparationAbort, preparationConsumer, ProgramPreparation, type PreparedPrograms } from "./prepare";
import type { PreparationPriority } from "./preparation-queue";
import { backingDpr, backingLimitsFor, HEADROOM_PIXELS, RT_BYTES_PER_PIXEL, TIERS, type BackingLimits, type QualitySettings } from "./quality";
import { BootFailure, failureCode, type HarbourLifecycle } from "./failure";
import { GraphicsValidity, probeGraphics } from "./graphics";
import { getHarbourMaterials, shaderFeatureKey } from "../world/materials";
import { assertShaderReady } from "./shader-failure";

/**
 * Systems nothing else needs at init and the first frame can do without (overlays and decoration):
 * they init right after the first frame. Every reader of their services tolerates their absence.
 */
const DEFERRED: ReadonlySet<string> = new Set(["life", "identity"]);
const DEFERRED_PREPARATION_ATTEMPTS = 3;
/** `?prof=1` stage tags, built once per stage name (a profiled frame laps ~25 stages). */
const STAGE_TAGS = new Map<string, string>();

/** Dev profiling (`?prof=1`): per-system update() cost, summed since the last reset (window.__harbourProf). */
const PROF = typeof location !== "undefined" && new URLSearchParams(location.search).get("prof") === "1";
const GPU_PROF = typeof location !== "undefined" && new URLSearchParams(location.search).get("prof") === "gpu";

declare global { interface Window { __harbourStats?: HarbourStats; __harbour?: Engine; __harbourProf?: FrameProfile } }

/**
 * The Harbour runtime: one WebGLRenderer, one scene, one perspective camera on a bounded rig,
 * a pmndrs post chain, and an ordered list of WorldSystems. No React here; the UI layer subscribes.
 */
export class Engine {
  readonly ctx: EngineContext;
  private readonly graphics = new GraphicsValidity();
  private lifecycle: HarbourLifecycle = { state: "BOOTING", code: null };
  private readonly lifecycleListeners = new Set<(state: HarbourLifecycle) => void>();
  private failedFrames = 0;
  private firstRenderedAt: number | undefined;
  private restorationTimer = 0;

  get canPublish(): boolean {
    if (this.aborted || this.disposed || this.lifecycle.state === "RECOVERING" || this.lifecycle.state === "FAILED") return false;
    try { this.graphics.assertValid(); return true; } catch { return false; }
  }

  onLifecycle(cb: (state: HarbourLifecycle) => void): () => void {
    this.lifecycleListeners.add(cb); cb(this.lifecycle);
    return () => this.lifecycleListeners.delete(cb);
  }

  private transition(state: HarbourLifecycle["state"], code: HarbourLifecycle["code"]): void {
    this.lifecycle = { state, code };
    for (const cb of this.lifecycleListeners) cb(this.lifecycle);
  }

  private onContextLost(event: Event): void {
    event.preventDefault();
    if (this.disposed || this.aborted) return;
    this.abort();
    this.transition("RECOVERING", "context-lost");
    this.restorationTimer = window.setTimeout(() => this.transition("FAILED", "context-lost"), 30000);
  }
  private onContextRestored(): void {
    if (this.disposed || this.lifecycle.state !== "RECOVERING") return;
    clearTimeout(this.restorationTimer);
    // The app disposes this owner before mounting a fresh Engine; GPU-only bakes never survive.
    this.transition("BOOTING", "context-lost");
  }
  private readonly systems: WorldSystem[] = [];
  /** Systems whose init has completed (only these update / resize). */
  private readonly ready = new Set<WorldSystem>();
  private readonly later: WorldSystem[] = [];
  private disposed = false;
  private readonly lifetime = new AbortController();
  /** abort(): init stops before the next system (a mount torn down mid-boot, e.g. React's dev double-mount). */
  private aborted = false;
  /** Systems whose init has started (dispose tears down only these). */
  private readonly begun = new Set<WorldSystem>();
  /** init() has finished: systems added from now on init themselves. */
  private booted = false;
  private readonly clock = { last: 0, elapsed: 0 };
  private raf = 0;
  private running = false;
  private requestedRunning = false;
  private firstFrameMs: number | null = null;
  private readonly rendered = { revision: 0, boats: 0, drawn: 0 };
  private readonly renderedListeners = new Set<(state: RenderedFleetState) => void>();
  private gpuPasses: GpuPassProfiler | null = null;
  private readonly preparation: ProgramPreparation;
  private postPreparation: PostPreparation | undefined;
  private readonly qualityPreparation = new Map<string, Promise<void>>();
  private readonly qualityPrograms = new Set<PreparedPrograms>();
  /** Feature identities whose complete target-tier preparation is resident (governor's synchronous ready predicate). */
  private readonly qualityReady = new Set<string>();
  private readonly backingLimits: BackingLimits;
  private resolution: MediaQueryList | undefined;
  private resolutionDpr = 0;
  private width = 0;
  private height = 0;
  private pixelRatio = 0;
  /** The drawing buffer and its estimated render-target memory (Q3: logged on every headroom-rung transition). */
  readonly backing = { width: 0, height: 0, rtMB: 0, headroom: false };
  /** Reused every frame (no per-frame allocation). */
  private readonly frameState: { elapsed: number; delta: number; nowMs: number } = { elapsed: 0, delta: 0, nowMs: 0 };
  private readonly stats: HarbourStats = {
    backend: "webgl2", drawCalls: 0, triangles: 0, textures: 0, programs: 0, hour: 0, systems: [], firstFrameMs: null, firstFleetFrameMs: null, renderedRevision: 0, renderedBoats: 0, dpr: 1, gpuMs: null, quality: "high",
  };
  private readonly startMs = performance.now();
  private readonly profile: FrameProfile | null = PROF ? new FrameProfile() : null;
  private lap(key: string, since: number): number {
    const now = performance.now(), p = this.profile!, d = now - since;
    let tag = STAGE_TAGS.get(key);
    if (tag === undefined) { tag = `stage:${key}`; STAGE_TAGS.set(key, tag); }
    p.tag(tag);
    p.ms[key] = (p.ms[key] ?? 0) + d;
    if (d > (p.max[key] ?? 0)) p.max[key] = d;
    return now;
  }
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  readonly post: PostChain;
  readonly governor: QualityGovernor;
  private readonly input: CameraInput;
  private readonly onResize = () => this.resize();
  private readonly onVisibility = () => this.reconcileRunning();
  private readonly onSceneAddition = () => { if (this.booted) this.preparation.invalidate(); };

  constructor(readonly container: HTMLElement) {
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, depth: true, powerPreference: "high-performance" }); }
    catch (cause) { throw new BootFailure("graphics-buffers", { cause }); }
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = this.graphics.onShaderError;
    this.onContextLost = this.onContextLost.bind(this);
    this.onContextRestored = this.onContextRestored.bind(this);
    renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", this.onContextRestored);
    const gl = renderer.getContext() as WebGL2RenderingContext;
    this.backingLimits = backingLimitsFor(gl);
    renderer.setDrawingBufferSize(container.clientWidth || innerWidth, container.clientHeight || innerHeight,
      backingDpr(container.clientWidth || innerWidth, container.clientHeight || innerHeight, Math.min(devicePixelRatio, 2), this.backingLimits));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in post
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // r186: soft PCF = PCFShadowMap + shadow.radius (Vogel disk)
    renderer.info.autoReset = false;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(25, 1, 5, 9000);
    const rig = new CameraRig(camera);
    const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.post = new PostChain(renderer, composer, scene, camera);
    this.bloom = this.post.bloom;
    this.toneMapping = this.post.toneMapping;
    this.governor = new QualityGovernor(gl, (settings) => {
      this.post.setQuality(settings);
      if (this.ctx) this.resize();
    }, !GPU_PROF); // Pass profiling owns elapsed queries: WebGL forbids nesting them.
    // the layout system tunes the tilt-shift range from its presets

    this.ctx = { renderer, scene, camera, rig, composer, uniforms: createWorldUniforms(), timeOfDay: new TimeOfDay(), assets: new AssetStore(this.lifetime.signal), services: new Map(), signal: this.lifetime.signal };
    this.ctx.services.set("graphics-validity", this.graphics);
    this.ctx.services.set("post", this.post);
    this.ctx.services.set("quality", this.governor);
    this.preparation = new ProgramPreparation(this.ctx);
    this.ctx.services.set("preparation", this.preparation);
    this.post.installDepthPrepass(this.ctx);
    scene.addEventListener("childadded", this.onSceneAddition);
    this.governor.setPreparation((settings, signal) => this.prepareQuality(settings, signal), (settings) => this.qualityReady.has(this.qualityIdentity(settings)));
    this.governor.publish();
    this.input = new CameraInput(renderer.domElement, rig, ensureMotionService(this.ctx));
    addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resize();
    window.__harbour = this;
    if (this.profile) {
      window.__harbourProf = this.profile;
      this.profile.trackUploads(renderer.getContext());
      const upload = renderer.initTexture.bind(renderer);
      renderer.initTexture = (texture) => { this.profile!.tag("upload:texture"); return upload(texture); };
      const prepare = this.preparation.prepare.bind(this.preparation);
      this.preparation.prepare = (...args) => {
        this.profile!.tag("preparation:start");
        return prepare(...args).finally(() => this.profile?.tag("preparation:end"));
      };
    }
    prefetchHarbour(this.ctx.assets);
  }

  /** Register a system; order of registration is update order. One added after boot (the UI's frame hook) runs once its init settles. */
  add(system: WorldSystem): this {
    this.systems.push(system);
    if (this.booted) {
      this.begun.add(system);
      void Promise.resolve(system.init(this.ctx)).then(() => { if (!this.disposed) this.ready.add(system); }, (e: unknown) => console.error(`[harbour] ${system.name} init failed`, e));
    }
    return this;
  }

  /**
   * Boot: every system's init in registration order, except the DEFERRED ones, which init right after the
   * first frame (their update() is skipped until then). Then the scene's programs are compiled before the
   * first frame (in parallel where KHR_parallel_shader_compile exists; elsewhere the GPU process compiles
   * them while the main thread finishes the frame's CPU work). `?defer=0` boots everything first (A/B).
   */
  async init(): Promise<void> {
    try { await this.initialize(); }
    catch (error) {
      if (this.aborted) return;
      this.abort(); this.transition("FAILED", failureCode(error));
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    probeGraphics(this.ctx.renderer);
    this.graphics.assertValid();
    const boot: Record<string, number> = {};
    this.stats.boot = boot;
    const defer = new URLSearchParams(location.search).get("defer") !== "0";
    for (const s of this.systems) {
      if (this.aborted) return;
      if (defer && DEFERRED.has(s.name)) { this.later.push(s); continue; }
      const t = performance.now();
      this.begun.add(s);
      try { await s.init(this.ctx); }
      catch (error) { if (this.aborted) return; throw error; }
      if (this.aborted || this.disposed) return;
      this.graphics.assertValid();
      this.preparation.stageTextures(this.ctx.scene);
      if (this.aborted || this.disposed) return;
      boot[s.name] = Math.round(performance.now() - t);
      this.ready.add(s);
    }
    if (this.aborted) return;
    this.post.seal();
    this.resize(true);
    this.ctx.timeOfDay.update(Date.now(), 0, this.ctx.uniforms);
    await this.post.prepareGrade(this.ctx);
    const t = performance.now();
    this.postPreparation = this.post.preparationEntries();
    for (const entry of this.postPreparation.entries) this.preparation.register(entry);
    const wake = this.ctx.services.get("wake");
    for (const entry of wake?.preparationEntries() ?? []) this.preparation.register(entry);
    const sun = this.ctx.services.get("sun");
    if (sun) this.preparation.register(sun.preparationEntry());
    while (!this.aborted && !this.disposed) {
      try {
        const batch = await this.preparation.prepareWorld();
        if (this.aborted || this.disposed) { batch.dispose(); return; }
        try { this.graphics.assertValid(); } catch (error) { batch.dispose(); throw error; }
        this.preparation.adopt(batch); break;
      }
      catch (error) { if (!isPreparationAbort(error)) throw error; }
    }
    if (this.aborted || this.disposed) return;
    // The first ordinary composer render is already behind the poster and provides real pose/depth
    // coverage. Do not add a second, pre-update render to the serial startup frontier.
    boot.compile = Math.round(performance.now() - t);
    if (GPU_PROF && !this.aborted && !this.disposed) {
      this.gpuPasses = installGpuPassProfiler(this.ctx.renderer, this.ctx.composer);
      window.__gpuPasses = this.gpuPasses;
    }
    this.booted = true;
    this.reconcileRunning();
  }


  /** Called after successful composer renders, with a reused read-only state (copy it to retain it). */
  onRendered(cb: (state: RenderedFleetState) => void): () => void {
    this.renderedListeners.add(cb);
    return () => this.renderedListeners.delete(cb);
  }

  /** Stop booting: init() returns before the next system's init (the caller then disposes). */
  abort(): void {
    if (this.aborted) return;
    this.aborted = true; this.lifetime.abort(); this.stop(); this.preparation.invalidate();
    // The app waits for boot to settle before dispose; do not leave the data worker/feed alive meanwhile.
    this.ctx.services.get("sound")?.dispose();
    for (const system of this.begun) if (system.name === "data") {
      system.dispose(this.ctx); this.begun.delete(system); this.ready.delete(system);
    }
  }

  /** The deferred systems, one after another in registration order, once the first frame is out. */
  private async initLater(): Promise<void> {
    const boot = this.stats.boot ?? {};
    for (const s of this.later) {
      if (this.disposed || this.aborted) return;
      const t = performance.now();
      this.begun.add(s);
      const additions = new Map<THREE.Object3D, boolean>();
      const hide = (event: { child: THREE.Object3D }) => {
        additions.set(event.child, event.child.visible); event.child.visible = false;
      };
      this.ctx.scene.addEventListener("childadded", hide);
      try {
        await s.init(this.ctx);
        if (this.disposed || this.aborted) { s.dispose(this.ctx); return; }
        const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
        s.resize?.(w, h, this.ctx);
        for (const root of additions.keys()) {
          for (let attempt = 1; attempt <= DEFERRED_PREPARATION_ATTEMPTS; attempt++) {
            if (this.disposed || this.aborted) break;
            try { await this.preparation.prepareGroup(root); break; }
            catch (error) {
              if (!isPreparationAbort(error)) throw error;
              if (this.disposed || this.aborted) break;
              if (attempt === DEFERRED_PREPARATION_ATTEMPTS) {
                // Repeated live-material replacement must not erase the system's scenery.
                console.warn(`[harbour] ${s.name} preparation repeatedly superseded; showing current scenery`, error);
              }
            }
          }
        }
        if (this.disposed || this.aborted) { s.dispose(this.ctx); return; }
        this.ready.add(s);
        boot[s.name] = Math.round(performance.now() - t);
      } catch (error) {
        if (!this.disposed && !this.aborted) console.error(`[harbour] ${s.name} init failed`, error);
        s.dispose(this.ctx);
      } finally {
        this.ctx.scene.removeEventListener("childadded", hide);
        for (const [root, visible] of additions) root.visible = visible;
      }
    }
  }

  start(): void {
    this.requestedRunning = true;
    this.reconcileRunning();
  }

  private reconcileRunning(): void {
    const shouldRun = this.booted && this.requestedRunning && !document.hidden && !this.disposed && !this.aborted;
    if (!shouldRun) {
      if (this.running) this.governor.pause();
      this.running = false; cancelAnimationFrame(this.raf); this.raf = 0;
      return;
    }
    if (this.running) return;
    this.resize();
    this.governor.resume();
    this.running = true;
    this.clock.last = performance.now();
    const tick = (now: number) => {
      if (!this.running || document.hidden || this.disposed || this.aborted) { this.reconcileRunning(); return; }
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void { this.requestedRunning = false; this.reconcileRunning(); }

  private frame(now: number): void {
    if (this.aborted || this.disposed) return;
    try {
      this.graphics.assertValid();
      this.renderFrame(now);
      this.failedFrames = 0;
    } catch (error) {
      if (this.aborted || this.disposed) return;
      if (failureCode(error) === "shader") {
        this.abort(); this.transition("RECOVERING", "shader");
      } else if (++this.failedFrames >= 3) {
        this.abort(); this.transition("FAILED", "frames");
      }
    }
  }

  private renderFrame(now: number): void {
    if (this.profile && this.firstFrameMs !== null) { this.profiledFrame(now); return; }
    const { ctx } = this;
    const t0 = this.firstFrameMs === null ? performance.now() : 0;
    const rawDelta = Math.max(0, (now - this.clock.last) / 1000);
    const delta = Math.min(0.1, rawDelta);
    this.clock.last = now;
    this.clock.elapsed += delta;
    const frame = this.frameState;
    frame.elapsed = this.clock.elapsed; frame.delta = delta; frame.nowMs = Date.now();
    ctx.uniforms.uTime.value = frame.elapsed;
    ctx.timeOfDay.update(frame.nowMs, frame.elapsed, ctx.uniforms);
    this.input.update(delta);
    ctx.rig.update(delta);
    ctx.uniforms.uCameraPos.value.copy(ctx.camera.position);
    ctx.renderer.info.reset();
    this.governor.begin();
    try {
      const prof = this.firstFrameMs === null ? this.stats.boot : undefined;
      for (const s of this.systems) if (this.ready.has(s)) {
        const ts = prof ? performance.now() : 0;
        s.update(frame, ctx);
        if (prof) prof[`u:${s.name}`] = Math.round(performance.now() - ts);
      }
      this.post.update(delta, ctx.timeOfDay, ctx.rig);
      const tr = prof ? performance.now() : 0;
      ctx.composer.render(delta);
      this.graphics.assertValid();
      if (this.aborted || this.disposed) return;
      this.recordRendered();
      if (prof) prof["u:render"] = Math.round(performance.now() - tr);
    } finally { this.governor.end(rawDelta); }
    if (this.firstFrameMs === null) {
      this.firstFrameMs = performance.now() - this.startMs;
      if (this.stats.boot) this.stats.boot.firstRender = Math.round(performance.now() - t0);
      for (const system of this.ready) if (system.prepareIdle) {
        void system.prepareIdle(ctx).catch((error: unknown) => {
          if (!isPreparationAbort(error)) console.error(`[harbour] ${system.name} idle preparation failed`, error);
        });
      }
      if (this.later.length) void this.initLater();
    }
    this.publishStats();
  }

  /** frame() with a lap around each stage (`?prof=1` only; same order, same work). */
  private profiledFrame(now: number): void {
    const { ctx } = this;
    const p = this.profile!;
    p.frames++;
    const start = performance.now();
    const rafGapMs = Math.max(0, now - this.clock.last);
    const revision = this.rendered.revision;
    const textures = ctx.renderer.info.memory.textures;
    const readiness = ctx.services.get("readiness");
    if (readiness && !readiness.prepared) p.tag("route:pending");
    let t = start;
    const rawDelta = Math.max(0, (now - this.clock.last) / 1000);
    const delta = Math.min(0.1, rawDelta);
    this.clock.last = now;
    this.clock.elapsed += delta;
    const frame = this.frameState;
    frame.elapsed = this.clock.elapsed; frame.delta = delta; frame.nowMs = Date.now();
    ctx.uniforms.uTime.value = frame.elapsed;
    ctx.timeOfDay.update(frame.nowMs, frame.elapsed, ctx.uniforms);
    this.input.update(delta);
    ctx.rig.update(delta);
    ctx.uniforms.uCameraPos.value.copy(ctx.camera.position);
    ctx.renderer.info.reset();
    this.governor.begin();
    try {
      t = this.lap("pre", t);
      for (const s of this.systems) if (this.ready.has(s)) { s.update(frame, ctx); t = this.lap(s.name, t); }
      this.post.update(delta, ctx.timeOfDay, ctx.rig);
      t = this.lap("post.update", t);
      ctx.composer.render(delta);
      this.graphics.assertValid();
      if (this.aborted || this.disposed) return;
      this.recordRendered();
      t = this.lap("render", t);
    } finally { this.governor.end(rawDelta); }
    this.publishStats();
    this.lap("tail", t);
    const end = this.lap("TOTAL", start);
    if (revision !== this.rendered.revision) p.tag("revision:install");
    if (textures !== ctx.renderer.info.memory.textures) p.tag("upload:texture-allocation");
    p.record({ frame: p.frames, revision: this.rendered.revision, tier: this.governor.tier,
      dpr: ctx.renderer.getPixelRatio(), cpuMs: end - start, rafGapMs });
  }

  /** One tier's complete feature identity: tier, SMAA preset, preparation/material generations and compile features. */
  private qualityIdentity(settings: QualitySettings): string {
    const materials = getHarbourMaterials(this.ctx);
    return `${settings.tier}:${settings.smaa}:${this.preparation.generation}:${materials.generation}:${shaderFeatureKey(materials.featureIdentity(0, settings.tier === "low"))}:${this.ctx.uniforms.uFoliage.value.y > 0.001}`;
  }

  /** Target world, private passes and SMAA stay resident until teardown; no live state crosses an await. */
  private prepareQuality(settings: QualitySettings, signal?: AbortSignal, priority: PreparationPriority = "visible"): Promise<void> {
    const materials = getHarbourMaterials(this.ctx);
    const identity = () => this.qualityIdentity(settings);
    const key = identity();
    const cached = this.qualityPreparation.get(key);
    if (cached) return preparationConsumer(cached, signal);
    let preparedKey = key;
    const pending = (async () => {
      while (!this.disposed && !this.aborted) {
        const generation = this.preparation.generation;
        const materialGeneration = materials.generation;
        const post = this.post.preparationEntries(settings);
        const scope = () => {
          const restoreKit = materials.preparationScope(settings.tier === "low");
          const restoreOcean = this.ctx.services.get("ocean")?.preparationScope(settings.tier === "low");
          return () => { restoreOcean?.(); restoreKit(); };
        };
        try {
          const batch = await this.preparation.prepareWorld(scope, post.entries, undefined, priority);
          if (this.disposed || this.aborted) { batch.dispose(); break; }
          if (generation !== this.preparation.generation || materialGeneration !== materials.generation) { batch.dispose(); continue; }
          if (batch.status !== "complete") { batch.dispose(); throw new Error("Target tier preparation timed out"); }
          this.qualityPrograms.add(batch);
          preparedKey = identity();
          this.qualityReady.add(preparedKey);
          return;
        } catch (error) { if (!isPreparationAbort(error) || this.disposed || this.aborted) throw error; }
        finally { post.dispose(); }
      }
      throw new DOMException("Engine disposed", "AbortError");
    })();
    this.qualityPreparation.set(key, pending);
    void pending.then(() => {
      this.qualityPreparation.set(preparedKey, pending);
      if (preparedKey !== key) this.qualityPreparation.delete(key);
    }, () => {
      if (this.qualityPreparation.get(key) === pending) this.qualityPreparation.delete(key);
    });
    return preparationConsumer(pending, signal);
  }

  private warmQuality(): void {
    // The first fleet frame can reveal immediately; submissions yield to bounded idle tasks.
    // Retain every preset until teardown: seasonal/world batch adoption must not evict them.
    for (const settings of Object.values(TIERS)) {
      void this.prepareQuality(settings, undefined, "background").catch((error: unknown) => {
        if (!isPreparationAbort(error)) console.error("[harbour] quality idle preparation failed", error);
      });
    }
  }

  private recordRendered(): void {
    if (!this.canPublish) return;
    assertShaderReady(this.ctx.renderer);
    if (this.lifecycle.state === "BOOTING") this.transition("READY", null);
    const fleet = this.ctx.services.get("fleet-frame");
    this.rendered.revision = fleet?.revision ?? 0;
    this.rendered.boats = fleet?.boats ?? 0;
    this.rendered.drawn = fleet?.drawn ?? this.rendered.boats;
    this.stats.renderedRevision = this.rendered.revision;
    this.stats.renderedBoats = this.rendered.boats;
    if (!this.ctx.assets.decorationsReady) {
      const now = performance.now();
      this.firstRenderedAt ??= now;
      const readiness = this.ctx.services.get("readiness"), model = this.ctx.services.get("model");
      const complete = model?.hasFleet && readiness?.prepared && readiness.revision > 0
        && this.rendered.revision === readiness.revision && this.rendered.boats === readiness.boats;
      const snapshot = this.ctx.services.get("feed")?.payloads.stablecoins;
      const boatless = model?.boats.length === 0 && this.rendered.boats === 0;
      const waiting = snapshot === undefined || snapshot.data === null || this.ctx.services.get("simulation-status")?.unavailable;
      this.ctx.assets.decorationsReady = !!complete || (!!boatless && !!waiting && now - this.firstRenderedAt >= 2000);
    }
    if (this.firstFrameMs === null) performance.mark("pv:first-frame");
    if (this.stats.firstFleetFrameMs === null && this.rendered.boats > 0) {
      this.stats.firstFleetFrameMs = Math.round(performance.now() - this.startMs);
      performance.mark("pv:first-fleet-frame");
      this.warmQuality();
    }
  }

  /** One publication path keeps ordinary and ?prof=1 rendering/statistics coherent. */
  private publishStats(): void {
    const st = this.stats, info = this.ctx.renderer.info, g = this.governor;
    st.drawCalls = info.render.calls;
    st.triangles = info.render.triangles;
    st.textures = info.memory.textures;
    st.programs = info.programs?.length ?? 0;
    st.hour = Math.round(this.ctx.timeOfDay.hour * 100) / 100;
    if (st.systems.length !== this.systems.length) st.systems = this.systems.map((s) => s.name);
    st.firstFrameMs = this.firstFrameMs === null ? null : Math.round(this.firstFrameMs);
    st.dpr = g.dpr;
    st.gpuMs = g.gpuMs === null ? null : Math.round(g.gpuMs * 100) / 100;
    st.gpuP10Ms = st.gpuMs;
    st.gpuP50Ms = g.gpuP50Ms === null ? null : Math.round(g.gpuP50Ms * 100) / 100;
    st.gpuSamples = g.gpuSamples;
    st.gpuCompletedSamples = g.gpuCompletedSamples;
    st.gpuPendingQueries = g.gpuPendingQueries;
    st.gpuDisjointSamples = g.gpuDisjointSamples;
    st.gpuSkippedQueries = g.gpuSkippedQueries;
    st.quality = g.tier;
    window.__harbourStats = st;
    for (const cb of this.renderedListeners) cb(this.rendered);
  }

  resize(forceSystems = false): void {
    if (this.disposed || this.aborted) return;
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    const { renderer, camera, composer, uniforms } = this.ctx;
    if (this.resolutionDpr !== devicePixelRatio) {
      this.resolution?.removeEventListener("change", this.onResize);
      this.resolutionDpr = devicePixelRatio;
      this.resolution = typeof matchMedia === "function" ? matchMedia(`(resolution: ${devicePixelRatio}dppx)`) : undefined;
      this.resolution?.addEventListener("change", this.onResize);
    }
    // B25's 4 MP ceiling governs arrival, pins and rescue; Q3's headroom rungs have their own 8.3 MP ceiling
    const displayChanged = this.governor.reconcileDisplay(devicePixelRatio, backingDpr(w, h, 2, this.backingLimits),
      backingDpr(w, h, 2, this.backingLimits, HEADROOM_PIXELS));
    const dpr = this.governor.dpr;
    const changed = w !== this.width || h !== this.height || dpr !== this.pixelRatio;
    if (changed) {
      if (w !== this.width || h !== this.height) this.preparation?.invalidate();
      this.width = w; this.height = h; this.pixelRatio = dpr;
      this.governor.resetTiming();
      renderer.setDrawingBufferSize(w, h, dpr);
      composer.setSize(w, h);
      if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
      uniforms.uResolution.value.set(Math.floor(w * dpr), Math.floor(h * dpr));
      this.stats.dpr = dpr;
      const b = this.backing, headroom = this.governor.headroom, was = b.headroom;
      b.width = Math.floor(w * dpr); b.height = Math.floor(h * dpr); b.headroom = headroom;
      b.rtMB = Math.round(b.width * b.height * RT_BYTES_PER_PIXEL / 1e6);
      if (headroom || was) console.info(`[harbour] backing ${b.width}×${b.height} (DPR ${dpr.toFixed(2)}, ≈${b.rtMB} MB render targets)${headroom ? " on a headroom rung" : ""}`);
    }
    if (changed || forceSystems) for (const s of this.systems) if (this.ready.has(s)) s.resize?.(w, h, this.ctx);
    if (displayChanged) this.governor.publish();
  }

  dispose(): void {
    if (this.disposed) return;
    this.abort();
    this.disposed = true;
    clearTimeout(this.restorationTimer);
    this.ctx.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.ctx.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.lifecycleListeners.clear();
    this.stop();
    this.preparation.dispose();
    for (const batch of this.qualityPrograms) batch.dispose();
    this.qualityPrograms.clear();
    this.qualityPreparation.clear();
    this.qualityReady.clear();
    this.input.dispose();
    removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resolution?.removeEventListener("change", this.onResize);
    this.ctx.scene.removeEventListener("childadded", this.onSceneAddition);
    // Three r186's module-owned DFG LUT keeps a texture-dispose listener per renderer.
    // Release it while material uniforms still exist, before renderer.dispose clears properties.
    // Read the actual uniform: importing Three's src helper would use a different singleton.
    let dfgLut: THREE.Texture | undefined;
    const findLut = (material: THREE.Material) => {
      const { uniforms } = this.ctx.renderer.properties.get(material) as { uniforms?: { dfgLUT?: { value: THREE.Texture | null } } };
      dfgLut = uniforms?.dfgLUT?.value ?? undefined;
    };
    this.ctx.scene.traverse((object) => {
      if (dfgLut) return;
      const material = (object as THREE.Mesh).material;
      if (Array.isArray(material)) {
        for (const item of material) { findLut(item); if (dfgLut) break; }
      } else if (material) findLut(material);
    });
    dfgLut?.dispose();
    // a deferred system still initialising disposes itself when its init settles (initLater)
    for (const s of [...this.systems].reverse()) if (this.ready.has(s) || (this.begun.has(s) && !this.later.includes(s))) s.dispose(this.ctx);
    this.ctx.services.get("sound")?.dispose();
    this.ctx.services.get("motion")?.dispose();
    this.ctx.services.get("materials")?.dispose();
    this.ctx.assets.dispose();
    this.ctx.services.clear();
    this.postPreparation?.dispose();
    if (window.__harbour === this) delete window.__harbour;
    if (window.__harbourStats === this.stats) delete window.__harbourStats;
    if (window.__harbourProf === this.profile) delete window.__harbourProf;
    this.profile?.dispose();
    this.gpuPasses?.dispose();
    if (window.__gpuPasses === this.gpuPasses) delete window.__gpuPasses;
    this.governor.dispose();
    this.renderedListeners.clear();
    this.post.dispose();
    this.ctx.composer.dispose();
    this.ctx.renderer.dispose();
    this.ctx.renderer.domElement.remove();
  }
}
