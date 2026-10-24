import * as THREE from "three";
import { BloomEffect, EffectComposer, ToneMappingEffect } from "postprocessing";
import { AssetStore } from "./assets";
import { QualityGovernor } from "./governor";
import { installGpuPassProfiler, type GpuPassProfiler } from "./gpu-passes";
import { PostChain, type PostPreparation } from "./post";
import { prefetchHarbour } from "./prefetch";
import { CameraRig } from "./camera-rig";
import { CameraInput } from "./input";
import { TimeOfDay } from "./time-of-day";
import { createWorldUniforms } from "./uniforms";
import type { EngineContext, HarbourStats, PreparationEntry, RenderedFleetState, WorldSystem } from "./types";
import { isPreparationAbort, ProgramPreparation, type PreparedPrograms } from "./prepare";
import { TIERS, type QualitySettings } from "./quality";

/**
 * Systems nothing else needs at init and the first frame can do without (overlays and decoration):
 * they init right after the first frame. Every reader of their services tolerates their absence.
 */
const DEFERRED: ReadonlySet<string> = new Set(["life", "identity"]);
const DEFERRED_PREPARATION_ATTEMPTS = 3;

/** Dev profiling (`?prof=1`): per-system update() cost, summed since the last reset (window.__harbourProf). */
interface FrameProfile { frames: number; ms: Record<string, number>; max: Record<string, number>; reset(): void }
const PROF = typeof location !== "undefined" && new URLSearchParams(location.search).get("prof") === "1";
const GPU_PROF = typeof location !== "undefined" && new URLSearchParams(location.search).get("prof") === "gpu";

declare global { interface Window { __harbourStats?: HarbourStats; __harbour?: Engine; __harbourProf?: FrameProfile } }

/**
 * The Harbour runtime: one WebGLRenderer, one scene, one perspective camera on a bounded rig,
 * a pmndrs post chain, and an ordered list of WorldSystems. No React here; the UI layer subscribes.
 */
export class Engine {
  readonly ctx: EngineContext;
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
  private firstFrameMs: number | null = null;
  private readonly rendered = { revision: 0, boats: 0 };
  private readonly renderedListeners = new Set<(state: RenderedFleetState) => void>();
  private gpuPasses: GpuPassProfiler | null = null;
  private readonly preparation: ProgramPreparation;
  private postPreparation: PostPreparation | undefined;
  private readonly qualityPreparation = new Map<QualitySettings["tier"], Promise<void>>();
  private readonly qualityPrograms = new Set<PreparedPrograms>();
  private width = 0;
  private height = 0;
  private pixelRatio = 0;
  /** Reused every frame (no per-frame allocation). */
  private readonly frameState: { elapsed: number; delta: number; nowMs: number } = { elapsed: 0, delta: 0, nowMs: 0 };
  private readonly stats: HarbourStats = {
    backend: "webgl2", drawCalls: 0, triangles: 0, textures: 0, programs: 0, hour: 0, systems: [], firstFrameMs: null, firstFleetFrameMs: null, renderedRevision: 0, renderedBoats: 0, dpr: 1, gpuMs: null, quality: "high",
  };
  private readonly startMs = performance.now();
  private readonly profile: FrameProfile | null = PROF ? {
    frames: 0, ms: {}, max: {},
    reset() { this.frames = 0; this.ms = {}; this.max = {}; },
  } : null;
  private lap(key: string, since: number): number {
    const now = performance.now(), p = this.profile!, d = now - since;
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
  private readonly onVisibility = () => { if (document.hidden) this.stop(); else this.start(); };
  private readonly onSceneAddition = () => { if (this.booted) this.preparation.invalidate(); };

  constructor(readonly container: HTMLElement) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, depth: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
    this.governor = new QualityGovernor(renderer.getContext() as WebGL2RenderingContext, (settings, dpr) => {
      if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
      this.post.setQuality(settings);
      if (this.ctx) this.resize();
    }, !GPU_PROF); // Pass profiling owns elapsed queries: WebGL forbids nesting them.
    // the layout system tunes the tilt-shift range from its presets

    this.ctx = { renderer, scene, camera, rig, composer, uniforms: createWorldUniforms(), timeOfDay: new TimeOfDay(), assets: new AssetStore(), services: new Map(), signal: this.lifetime.signal };
    this.ctx.services.set("post", this.post);
    this.ctx.services.set("quality", this.governor);
    this.preparation = new ProgramPreparation(this.ctx);
    this.ctx.services.set("preparation", this.preparation);
    this.post.installDepthPrepass(this.ctx);
    scene.addEventListener("childadded", this.onSceneAddition);
    this.governor.setPreparation((settings) => this.prepareQuality(settings));
    this.governor.publish();
    this.input = new CameraInput(renderer.domElement, rig);
    addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resize();
    window.__harbour = this;
    if (this.profile) window.__harbourProf = this.profile;
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
    const boot: Record<string, number> = {};
    this.stats.boot = boot;
    const defer = new URLSearchParams(location.search).get("defer") !== "0";
    for (const s of this.systems) {
      if (this.aborted) return;
      if (defer && DEFERRED.has(s.name)) { this.later.push(s); continue; }
      const t = performance.now();
      this.begun.add(s);
      try { await s.init(this.ctx); }
      catch (error) { if (this.aborted) return; this.dispose(); throw error; }
      this.preparation.stageTextures(this.ctx.scene);
      if (this.aborted || this.disposed) return;
      boot[s.name] = Math.round(performance.now() - t);
      this.ready.add(s);
    }
    if (this.aborted) return;
    this.post.seal();
    this.resize(true);
    const t = performance.now();
    this.postPreparation = this.post.preparationEntries();
    for (const entry of this.postPreparation.entries) this.preparation.register(entry);
    const wake = this.ctx.services.get("wake") as { preparationEntries(): PreparationEntry[] } | undefined;
    for (const entry of wake?.preparationEntries() ?? []) this.preparation.register(entry);
    while (!this.aborted && !this.disposed) {
      try { this.preparation.adopt(await this.preparation.prepareWorld()); break; }
      catch (error) { if (!isPreparationAbort(error)) { this.dispose(); throw error; } }
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
    if (this.running || this.disposed || this.aborted) return;
    this.running = true;
    this.clock.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void { this.running = false; cancelAnimationFrame(this.raf); }

  private frame(now: number): void {
    if (this.profile && this.firstFrameMs !== null) { this.profiledFrame(now); return; }
    const { ctx } = this;
    const t0 = this.firstFrameMs === null ? performance.now() : 0;
    const delta = Math.min(0.1, Math.max(0, (now - this.clock.last) / 1000));
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
    const prof = this.firstFrameMs === null ? this.stats.boot : undefined;
    for (const s of this.systems) if (this.ready.has(s)) {
      const ts = prof ? performance.now() : 0;
      s.update(frame, ctx);
      if (prof) prof[`u:${s.name}`] = Math.round(performance.now() - ts);
    }
    this.post.update(delta, ctx.timeOfDay, ctx.rig);
    const tr = prof ? performance.now() : 0;
    ctx.composer.render(delta);
    this.recordRendered();
    if (prof) prof["u:render"] = Math.round(performance.now() - tr);
    this.governor.end(delta);
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
    let t = start;
    const delta = Math.min(0.1, Math.max(0, (now - this.clock.last) / 1000));
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
    t = this.lap("pre", t);
    for (const s of this.systems) if (this.ready.has(s)) { s.update(frame, ctx); t = this.lap(s.name, t); }
    this.post.update(delta, ctx.timeOfDay, ctx.rig);
    t = this.lap("post.update", t);
    ctx.composer.render(delta);
    this.recordRendered();
    t = this.lap("render", t);
    this.governor.end(delta);
    this.publishStats();
    this.lap("tail", t);
    this.lap("TOTAL", start);
  }

  /** Tier-invariant world lighting leaves only two SMAA materials to prepare, never the whole scene. */
  private prepareQuality(settings: QualitySettings): Promise<void> {
    const cached = this.qualityPreparation.get(settings.tier);
    if (cached) return cached;
    const pending = (async () => {
      while (!this.disposed && !this.aborted) {
        const post = this.post.preparationEntries(settings);
        try {
          const batch = await this.preparation.prepare(post.entries);
          if (this.disposed || this.aborted) { batch.dispose(); break; }
          this.qualityPrograms.add(batch);
          return;
        } catch (error) { if (!isPreparationAbort(error) || this.disposed || this.aborted) throw error; }
        finally { post.dispose(); }
      }
      throw new DOMException("Engine disposed", "AbortError");
    })();
    this.qualityPreparation.set(settings.tier, pending);
    void pending.catch(() => {
      if (this.qualityPreparation.get(settings.tier) === pending) this.qualityPreparation.delete(settings.tier);
    });
    return pending;
  }

  private warmQuality(): void {
    // The first fleet frame can reveal immediately; submissions yield to bounded idle tasks.
    // Retain every preset until teardown: seasonal/world batch adoption must not evict them.
    for (const settings of Object.values(TIERS)) {
      void this.prepareQuality(settings).catch((error: unknown) => {
        if (!isPreparationAbort(error)) console.error("[harbour] quality idle preparation failed", error);
      });
    }
  }

  private recordRendered(): void {
    const fleet = this.ctx.services.get("fleet-frame") as RenderedFleetState | undefined;
    this.rendered.revision = fleet?.revision ?? 0;
    this.rendered.boats = fleet?.boats ?? 0;
    this.stats.renderedRevision = this.rendered.revision;
    this.stats.renderedBoats = this.rendered.boats;
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
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    const { renderer, camera, composer, uniforms } = this.ctx;
    const dpr = renderer.getPixelRatio();
    const changed = w !== this.width || h !== this.height || dpr !== this.pixelRatio;
    if (changed) {
      this.preparation?.invalidate();
      this.width = w; this.height = h; this.pixelRatio = dpr;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      if (camera.aspect !== w / h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
      uniforms.uResolution.value.set(w * dpr, h * dpr);
    }
    if (changed || forceSystems) for (const s of this.systems) if (this.ready.has(s)) s.resize?.(w, h, this.ctx);
  }

  dispose(): void {
    if (this.disposed) return;
    this.abort();
    this.disposed = true;
    this.stop();
    this.preparation.dispose();
    for (const batch of this.qualityPrograms) batch.dispose();
    this.qualityPrograms.clear();
    this.qualityPreparation.clear();
    this.input.dispose();
    removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
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
    (this.ctx.services.get("sound") as { dispose(): void } | undefined)?.dispose();
    (this.ctx.services.get("motion") as { dispose(): void } | undefined)?.dispose();
    (this.ctx.services.get("materials") as { dispose(): void } | undefined)?.dispose();
    this.ctx.assets.dispose();
    this.ctx.services.clear();
    this.postPreparation?.dispose();
    if (window.__harbour === this) delete window.__harbour;
    if (window.__harbourStats === this.stats) delete window.__harbourStats;
    if (window.__harbourProf === this.profile) delete window.__harbourProf;
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
