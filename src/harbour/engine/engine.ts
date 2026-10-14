import * as THREE from "three";
import { BloomEffect, EffectComposer, ToneMappingEffect } from "postprocessing";
import { AssetStore } from "./assets";
import { QualityGovernor } from "./governor";
import { PostChain } from "./post";
import { CameraRig } from "./camera-rig";
import { TimeOfDay } from "./time-of-day";
import { createWorldUniforms } from "./uniforms";
import type { EngineContext, FrameState, HarbourStats, WorldSystem } from "./types";

declare global { interface Window { __harbourStats?: HarbourStats; __harbour?: Engine } }

/**
 * The Harbour runtime: one WebGLRenderer, one scene, one perspective camera on a bounded rig,
 * a pmndrs post chain, and an ordered list of WorldSystems. No React here; the UI layer subscribes.
 */
export class Engine {
  readonly ctx: EngineContext;
  private readonly systems: WorldSystem[] = [];
  private readonly clock = { last: 0, elapsed: 0 };
  private raf = 0;
  private running = false;
  private firstFrameMs: number | null = null;
  private readonly startMs = performance.now();
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  readonly post: PostChain;
  readonly governor: QualityGovernor;
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
    this.governor = new QualityGovernor(renderer.getContext() as WebGL2RenderingContext, (dpr) => {
      renderer.setPixelRatio(dpr);
      this.resize();
    });
    renderer.setPixelRatio(this.governor.dpr);
    // the layout system tunes the tilt-shift range from its presets

    this.ctx = { renderer, scene, camera, rig, composer, uniforms: createWorldUniforms(), timeOfDay: new TimeOfDay(), assets: new AssetStore(), services: new Map() };
    this.ctx.services.set("post", this.post);
    this.attachInput();
    addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resize();
    window.__harbour = this;
  }

  /** Register a system; order of registration is update order. */
  add(system: WorldSystem): this { this.systems.push(system); return this; }

  async init(): Promise<void> {
    for (const s of this.systems) await s.init(this.ctx);
    this.resize();
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
    const delta = Math.min(0.1, Math.max(0, (now - this.clock.last) / 1000));
    this.clock.last = now;
    this.clock.elapsed += delta;
    const frame: FrameState = { elapsed: this.clock.elapsed, delta, nowMs: Date.now() };
    ctx.uniforms.uTime.value = frame.elapsed;
    ctx.timeOfDay.update(frame.nowMs, frame.elapsed, ctx.uniforms);
    ctx.rig.update(delta);
    ctx.uniforms.uCameraPos.value.copy(ctx.camera.position);
    ctx.renderer.info.reset();
    this.governor.begin();
    for (const s of this.systems) s.update(frame, ctx);
    this.post.update(delta, ctx.timeOfDay, ctx.rig);
    ctx.composer.render(delta);
    this.governor.end(delta);
    if (this.firstFrameMs === null) this.firstFrameMs = performance.now() - this.startMs;
    window.__harbourStats = {
      backend: "webgl2",
      drawCalls: ctx.renderer.info.render.calls,
      triangles: ctx.renderer.info.render.triangles,
      textures: ctx.renderer.info.memory.textures,
      programs: ctx.renderer.info.programs?.length ?? 0,
      hour: Number(ctx.timeOfDay.hour.toFixed(2)),
      systems: this.systems.map((s) => s.name),
      firstFrameMs: this.firstFrameMs === null ? null : Math.round(this.firstFrameMs),
      dpr: this.governor.dpr,
      gpuMs: this.governor.gpuMs === null ? null : Number(this.governor.gpuMs.toFixed(2)),
    };
  }

  resize(): void {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    const { renderer, camera, composer, uniforms } = this.ctx;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uResolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    for (const s of this.systems) s.resize?.(w, h, this.ctx);
  }

  private attachInput(): void {
    const el = this.ctx.renderer.domElement;
    let dragging = false, lx = 0, ly = 0;
    el.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const [dx, dz] = this.ctx.rig.dragToWorld(e.clientX - lx, e.clientY - ly, el.clientHeight || innerHeight);
      this.ctx.rig.pan(dx, dz);
      lx = e.clientX; ly = e.clientY;
    });
    el.addEventListener("pointerup", (e) => { dragging = false; el.releasePointerCapture(e.pointerId); });
    el.addEventListener("wheel", (e) => { e.preventDefault(); this.ctx.rig.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }

  dispose(): void {
    this.stop();
    removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const s of [...this.systems].reverse()) s.dispose(this.ctx);
    this.post.dispose();
    this.ctx.composer.dispose();
    this.ctx.renderer.dispose();
    this.ctx.renderer.domElement.remove();
  }
}
