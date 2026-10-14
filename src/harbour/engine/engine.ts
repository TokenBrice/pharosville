import * as THREE from "three";
import { BloomEffect, EffectComposer, ToneMappingEffect } from "postprocessing";
import { AssetStore } from "./assets";
import { QualityGovernor } from "./governor";
import { PostChain } from "./post";
import { CameraRig } from "./camera-rig";
import { CameraInput } from "./input";
import { TimeOfDay } from "./time-of-day";
import { createWorldUniforms } from "./uniforms";
import type { EngineContext, HarbourStats, WorldSystem } from "./types";

/**
 * Systems nothing else needs at init and the first frame can do without (overlays and decoration):
 * they init right after the first frame. Every reader of their services tolerates their absence.
 */
const DEFERRED: ReadonlySet<string> = new Set(["life", "identity"]);

declare global { interface Window { __harbourStats?: HarbourStats; __harbour?: Engine } }

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
  /** Reused every frame (no per-frame allocation). */
  private readonly frameState: { elapsed: number; delta: number; nowMs: number } = { elapsed: 0, delta: 0, nowMs: 0 };
  private readonly stats: HarbourStats = {
    backend: "webgl2", drawCalls: 0, triangles: 0, textures: 0, programs: 0, hour: 0, systems: [], firstFrameMs: null, dpr: 1, gpuMs: null, quality: "high",
  };
  private readonly startMs = performance.now();
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  readonly post: PostChain;
  readonly governor: QualityGovernor;
  private readonly input: CameraInput;
  private readonly onResize = () => this.resize();
  private readonly onVisibility = () => { if (document.hidden) this.stop(); else this.start(); };

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
      renderer.setPixelRatio(dpr);
      this.post.setQuality(settings);
      if (this.ctx) this.resize();
    });
    // the layout system tunes the tilt-shift range from its presets

    this.ctx = { renderer, scene, camera, rig, composer, uniforms: createWorldUniforms(), timeOfDay: new TimeOfDay(), assets: new AssetStore(), services: new Map() };
    this.ctx.services.set("post", this.post);
    this.ctx.services.set("quality", this.governor);
    this.governor.publish();
    this.input = new CameraInput(renderer.domElement, rig);
    addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resize();
    window.__harbour = this;
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
      await s.init(this.ctx);
      boot[s.name] = Math.round(performance.now() - t);
      this.ready.add(s);
    }
    if (this.aborted) return;
    this.post.seal();
    this.resize();
    const t = performance.now(), r = this.ctx.renderer;
    // (three warns once per call when the extension is missing: issue the plain compile there)
    if (r.extensions.has("KHR_parallel_shader_compile")) await r.compileAsync(this.ctx.scene, this.ctx.camera);
    else r.compile(this.ctx.scene, this.ctx.camera);
    boot.compile = Math.round(performance.now() - t);
    this.booted = true;
  }

  /** Stop booting: init() returns before the next system's init (the caller then disposes). */
  abort(): void { this.aborted = true; }

  /** The deferred systems, one after another in registration order, once the first frame is out. */
  private async initLater(): Promise<void> {
    const boot = this.stats.boot ?? {};
    for (const s of this.later) {
      if (this.disposed) return;
      const t = performance.now();
      this.begun.add(s);
      try { await s.init(this.ctx); } catch (e) { console.error(`[harbour] ${s.name} init failed`, e); continue; }
      boot[s.name] = Math.round(performance.now() - t);
      if (this.disposed) { s.dispose(this.ctx); return; }
      this.ready.add(s);
      const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
      s.resize?.(w, h, this.ctx);
      // its programs compile now (off the main thread where the driver can) instead of stalling its first draw
      this.ctx.renderer.compile(this.ctx.scene, this.ctx.camera);
    }
  }

  start(): void {
    if (this.running) return;
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
    if (prof) prof["u:render"] = Math.round(performance.now() - tr);
    this.governor.end(delta);
    if (this.firstFrameMs === null) {
      this.firstFrameMs = performance.now() - this.startMs;
      if (this.stats.boot) this.stats.boot.firstRender = Math.round(performance.now() - t0);
      if (this.later.length) void this.initLater();
    }
    const st = this.stats, info = ctx.renderer.info;
    st.drawCalls = info.render.calls;
    st.triangles = info.render.triangles;
    st.textures = info.memory.textures;
    st.programs = info.programs?.length ?? 0;
    st.hour = Math.round(ctx.timeOfDay.hour * 100) / 100;
    if (st.systems.length !== this.systems.length) st.systems = this.systems.map((s) => s.name);
    st.firstFrameMs = this.firstFrameMs === null ? null : Math.round(this.firstFrameMs);
    st.dpr = this.governor.dpr;
    st.gpuMs = this.governor.gpuMs === null ? null : Math.round(this.governor.gpuMs * 100) / 100;
    st.quality = this.governor.tier;
    window.__harbourStats = st;
  }

  resize(): void {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    const { renderer, camera, composer, uniforms } = this.ctx;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    for (const s of this.systems) if (this.ready.has(s)) s.resize?.(w, h, this.ctx);
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.input.dispose();
    removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    // a deferred system still initialising disposes itself when its init settles (initLater)
    for (const s of [...this.systems].reverse()) if (this.ready.has(s) || (this.begun.has(s) && !this.later.includes(s))) s.dispose(this.ctx);
    this.post.dispose();
    this.ctx.composer.dispose();
    this.ctx.renderer.dispose();
    this.ctx.renderer.domElement.remove();
  }
}
