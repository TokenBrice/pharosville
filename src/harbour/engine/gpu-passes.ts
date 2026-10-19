import type * as THREE from "three";
import type { EffectComposer } from "postprocessing";

type State = { tier: string; dpr: number; width: number; height: number };
type Sample = { q: WebGLQuery; frame: number; label: string; epoch: number };
type Frame = { state: State; passes: Record<string, number> };
const MAX_QUERIES = 4096;
const MAX_FRAMES = 1200;

function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
  return { samples: values.length, p10Ms: percentile(0.1), p50Ms: percentile(0.5), p95Ms: percentile(0.95), meanMs: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
}

/** Opt-in submission diagnostics, not presentation timing. No hooks or queries exist until installed.
 * Requires exclusive ownership of TIME_ELAPSED_EXT (the engine disables governor queries in this mode).
 * Effects merged into one draw remain one label; per-pass values are not fictitious effect timings.
 */
export class GpuPassProfiler {
  readonly available: boolean;
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private frame = 0;
  private epoch = 0;
  private minimumFrame = 1;
  private collecting = true;
  private sampling = false;
  private disposed = false;
  private disjointPolls = 0;
  private discarded = 0;
  private skipped = 0;
  private label = "boot";
  private composerLabel = "";
  private readonly invalidFrames = new Set<number>();
  private readonly targets = new WeakMap<THREE.WebGLRenderTarget, string>();
  private readonly hooked = new WeakSet<THREE.Object3D>();
  private readonly materialLabels = new WeakMap<THREE.Material, string>();
  private readonly pending: Sample[] = [];
  private readonly free: WebGLQuery[] = [];
  private readonly frames = new Map<number, Frame>();
  private readonly undo: Array<() => void> = [];
  private nextTarget = 1;

  constructor(renderer: THREE.WebGLRenderer, composer: EffectComposer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.ext = this.gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.available = this.ext !== null;
    if (!this.ext) return;
    const gl = this.gl;
    const multi = gl.getExtension("WEBGL_multi_draw") as Record<string, (...args: unknown[]) => unknown> | null;
    const methods: Array<[object, string]> = ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "clear", "blitFramebuffer", "generateMipmap"].map((key) => [gl, key]);
    if (multi) for (const key of ["multiDrawArraysWEBGL", "multiDrawElementsWEBGL", "multiDrawArraysInstancedWEBGL", "multiDrawElementsInstancedWEBGL"]) methods.push([multi, key]);
    for (const [target, key] of methods) {
      const object = target as Record<string, (...args: unknown[]) => unknown>;
      const original = object[key];
      object[key] = (...args: unknown[]) => {
        if (!this.sampling) return original.apply(target, args);
        if (this.pending.length >= MAX_QUERIES) {
          this.skipped++; this.invalidFrames.add(this.frame);
          return original.apply(target, args);
        }
        const q = this.free.pop() ?? gl.createQuery();
        if (!q) { this.skipped++; this.invalidFrames.add(this.frame); return original.apply(target, args); }
        let label = this.label;
        if (key === "clear" && label !== "shadow") {
          const rt = renderer.getRenderTarget();
          label = rt ? this.targets.get(rt) ?? (rt.texture.name || `RT${this.nextTarget++}@${rt.width}x${rt.height}`) : "screen";
          if (rt) this.targets.set(rt, label);
        }
        label = key === "blitFramebuffer" ? "depth-copy" : `${label}${key === "clear" ? "/clear" : key === "generateMipmap" ? "/mips" : ""}`;
        if (!this.frames.has(this.frame)) {
          const canvas = renderer.domElement;
          this.frames.set(this.frame, { state: { tier: window.__harbourStats?.quality ?? "boot", dpr: renderer.getPixelRatio(), width: canvas.width, height: canvas.height }, passes: {} });
        }
        gl.beginQuery(this.ext!.TIME_ELAPSED_EXT, q);
        try { return original.apply(target, args); }
        finally {
          gl.endQuery(this.ext!.TIME_ELAPSED_EXT);
          this.pending.push({ q, frame: this.frame, label, epoch: this.epoch });
        }
      };
      this.undo.push(() => { object[key] = original; });
    }
    const render = renderer.render;
    renderer.render = (scene, camera) => {
      const previous = this.label;
      if (scene === window.__harbour?.ctx.scene) {
        scene.traverse((object) => {
          if (this.hooked.has(object) || (!(object as THREE.Mesh).isMesh && !(object as THREE.Points).isPoints && !(object as THREE.Line).isLine)) return;
          this.hooked.add(object);
          const before = object.onBeforeRender, after = object.onAfterRender;
          object.onBeforeRender = (...args) => {
            before.apply(object, args);
            let group = object;
            while (group.parent && group.parent !== scene) group = group.parent;
            this.label = `scene/${group.name || object.name || (args[4] as THREE.Material).name || object.type}`;
          };
          object.onAfterRender = (...args) => { after.apply(object, args); this.label = "scene"; };
          this.undo.push(() => { object.onBeforeRender = before; object.onAfterRender = after; });
        });
        this.label = "scene";
      } else {
        const mesh = scene.children.find((o) => (o as THREE.Mesh).material) as THREE.Mesh | undefined;
        const mat = mesh?.material as THREE.ShaderMaterial | undefined;
        const u = mat?.uniforms;
        this.label = (mat && this.materialLabels.get(mat)) || (u?.uLobes ? "cloud-atlas" : u?.uRange && u?.uBanks ? "sky-band" : u?.uSpread && u?.uPrev ? "wake-decay" : u?.uTrail ? (u.uTrail.value ? "wake-trail" : "wake-live") : u?.uBounds && mat?.fragmentShader.includes("vMount") ? "light-pool" : `${this.composerLabel || "offscreen"}/${mat?.name || mat?.type || "draw"}`);
      }
      const rt = renderer.getRenderTarget();
      if (rt) this.targets.set(rt, this.label);
      try { return render.call(renderer, scene, camera); } finally { this.label = previous; }
    };
    this.undo.push(() => { renderer.render = render; });
    const shadow = renderer.shadowMap.render;
    renderer.shadowMap.render = (...args) => {
      const previous = this.label;
      this.label = "shadow";
      try { return shadow.apply(renderer.shadowMap, args); } finally { this.label = previous; }
    };
    this.undo.push(() => { renderer.shadowMap.render = shadow; });
    for (const pass of composer.passes) {
      const effectPass = pass as unknown as { effects?: readonly { name: string }[]; fullscreenMaterial?: THREE.Material };
      if (effectPass.effects?.length && effectPass.fullscreenMaterial) this.materialLabels.set(effectPass.fullscreenMaterial, `composer/${effectPass.effects.map((effect) => effect.name).join("+")}`);
      const passRender = pass.render;
      pass.render = (...args) => {
        const previous = this.composerLabel;
        this.composerLabel = `composer/${pass.name || pass.constructor.name}`;
        try { return passRender.apply(pass, args); } finally { this.composerLabel = previous; }
      };
      this.undo.push(() => { pass.render = passRender; });
    }
    const compose = composer.render;
    composer.render = (...args) => {
      try { return compose.apply(composer, args); }
      finally {
        // A frame starts AFTER composition: update-time offscreen submissions belong to the next render.
        this.frame++;
        this.poll();
        this.sampling = this.collecting && (Math.imul(this.frame, 0x9e3779b1) >>> 30) === 0;
      }
    };
    this.undo.push(() => { composer.render = compose; });
  }

  private poll(): void {
    if (!this.ext || this.disposed) return;
    const gl = this.gl;
    const disjoint = !!gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    if (disjoint) {
      this.disjointPolls++;
      this.invalidFrames.add(this.frame);
      for (const p of this.pending) { this.invalidFrames.add(p.frame); gl.deleteQuery(p.q); }
      this.discarded += this.pending.length;
      this.pending.length = 0;
    } else {
      let count = 0;
      while (count < this.pending.length) {
        const p = this.pending[count];
        if (p.frame > this.frame - 3 || !gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
        if (p.epoch !== this.epoch || this.invalidFrames.has(p.frame)) this.discarded++;
        else {
          const row = this.frames.get(p.frame);
          if (row) row.passes[p.label] = (row.passes[p.label] ?? 0) + Number(gl.getQueryParameter(p.q, gl.QUERY_RESULT)) / 1e6;
        }
        this.free.push(p.q);
        count++;
      }
      if (count) this.pending.splice(0, count);
    }
    for (const f of this.frames.keys()) if (f < this.frame - MAX_FRAMES && !this.pending.some((p) => p.frame === f)) { this.frames.delete(f); this.invalidFrames.delete(f); }
    for (const f of this.invalidFrames) if (f < this.frame - MAX_FRAMES && !this.pending.some((p) => p.frame === f)) this.invalidFrames.delete(f);
  }

  /** Exclude the in-progress partial frame. Outstanding old-generation queries are safely drained/reused. */
  reset(): void {
    this.epoch++; this.minimumFrame = this.frame + 1;
    this.frames.clear(); this.invalidFrames.clear();
    this.discarded = this.skipped = this.disjointPolls = 0;
    this.collecting = true; this.sampling = false;
  }
  /** Rendering continues while already-issued queries drain asynchronously. */
  pause(): void { this.collecting = false; this.sampling = false; }

  snapshot() {
    this.poll();
    const pendingFrames = new Set(this.pending.filter((p) => p.epoch === this.epoch).map((p) => p.frame));
    const complete = [...this.frames].filter(([f]) => f >= this.minimumFrame && f < this.frame && !this.invalidFrames.has(f) && !pendingFrames.has(f));
    const labels = new Set(complete.flatMap(([, row]) => Object.keys(row.passes)));
    const samples = complete.map(([frame, row]) => ({ frame, ...row.state, ms: Object.values(row.passes).reduce((a, b) => a + b, 0), passes: row.passes }));
    const total = distribution(samples.map((s) => s.ms));
    const passes = Object.fromEntries([...labels].sort().map((label) => {
      const values = complete.map(([, row]) => row.passes[label] ?? 0);
      return [label, { ...distribution(values), activeSamples: values.filter((v) => v > 0).length }];
    }));
    return { available: this.available, sampledFrames: samples.length, pendingQueries: this.pending.length, currentPendingQueries: this.pending.filter((p) => p.epoch === this.epoch).length, disjointPolls: this.disjointPolls, invalidFrames: this.invalidFrames.size, discarded: this.discarded, skipped: this.skipped, total, totalP10Ms: total.p10Ms, totalMedianMs: total.p50Ms, totalP95Ms: total.p95Ms, passes, samples };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const undo of this.undo.reverse()) undo();
    for (const p of this.pending) this.gl.deleteQuery(p.q);
    for (const q of this.free) this.gl.deleteQuery(q);
    this.pending.length = this.free.length = 0;
    this.frames.clear(); this.invalidFrames.clear(); this.undo.length = 0;
    if (window.__gpuPasses === this) delete window.__gpuPasses;
  }
}

export function installGpuPassProfiler(renderer: THREE.WebGLRenderer, composer: EffectComposer) {
  return new GpuPassProfiler(renderer, composer);
}

declare global { interface Window { __gpuPasses?: GpuPassProfiler } }
