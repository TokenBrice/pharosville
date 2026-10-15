import { TIERS, initialRungFor, ladderFor, parseTier, type QualityRung, type QualityService, type QualitySettings, type QualityTier } from "./quality";

/**
 * Quality governor: walks the (tier, pixel ratio) ladder from measured frame cost. Exposed as the
 * 'quality' service.
 *  - GPU time from EXT_disjoint_timer_query_webgl2 when available (the honest number under vsync);
 *    otherwise rAF deltas: missed vsyncs step DOWN, and long clean stretches PROBE one rung up. A probe
 *    that misses frames is reverted and that rung becomes the ceiling (retried later, ever more rarely).
 *    This is the path Safari and Chrome-on-Mac take (no timer queries there).
 *  - With a GPU timer, a slow window steps down only when the GPU time is ≥ 60 % of the frame interval;
 *    a CPU-bound frame holds the rung (cheaper effects would not help, the recompile would hitch).
 *  - One rung per decision, hysteresis, and a cool-down after every change (which also swallows the
 *    shader recompiles a tier change may cause) so it never oscillates.
 *  - `?dpr=<x>` pins the pixel ratio, `?quality=high|medium|low` pins the tier (gate captures).
 *  - Allocation-free per frame (sample ring, no sorting of fresh arrays).
 */
export class QualityGovernor implements QualityService {
  readonly ladder: QualityRung[];
  private rung: number;
  private pinnedDpr: number | null;
  private pinnedTier: QualityTier | null;
  gpuMs: number | null = null;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly queries: Array<{ q: WebGLQuery; rung: number }> = [];
  private active: WebGLQuery | null = null;
  /**
   * GPU samples of the current window. Under vsync, ANGLE/GL timer queries absorb back-pressure on many
   * frames, so only the low tail (10th percentile) is trusted as the real cost.
   */
  private readonly gpuSamples = new Float32Array(256);
  private gpuN = 0;
  private slowFrames = 0;
  private frames = 0;
  private windowTime = 0;
  private cooldown = 3;
  /** seconds of clean frames at the current rung (timer-less probing) */
  private clean = 0;
  private probeAfter = 8;
  private probing = false;
  private ceiling: number;
  private ceilingTimer = 0;
  private readonly listeners = new Set<(s: QualitySettings, dpr: number) => void>();

  constructor(private readonly gl: WebGL2RenderingContext, private readonly apply: (s: QualitySettings, dpr: number) => void) {
    const q = new URLSearchParams(location.search);
    const p = Number.parseFloat(q.get("dpr") ?? "");
    this.pinnedDpr = Number.isFinite(p) && p > 0 ? Math.min(2, p) : null;
    this.pinnedTier = parseTier(q.get("quality"));
    this.ladder = ladderFor(devicePixelRatio);
    this.ceiling = this.ladder.length - 1;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    this.rung = initialRungFor(name, this.ladder, coarse);
    if (this.pinnedTier) this.rung = this.richest(this.pinnedTier);
    else if (this.pinnedDpr !== null) this.rung = this.ladder.length - 1;
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  }

  get auto(): boolean { return this.pinnedDpr === null && this.pinnedTier === null; }
  get tier(): QualityTier { return this.ladder[this.rung].tier; }
  get settings(): QualitySettings { return TIERS[this.tier]; }
  get dpr(): number { return this.pinnedDpr ?? this.ladder[this.rung].dpr; }
  /** Index of the current rung (for stats). */
  get level(): number { return this.rung; }

  set(tier: QualityTier | "auto"): void {
    if (tier === "auto") { this.pinnedTier = null; this.cooldown = 2; return; }
    this.pinnedTier = tier;
    this.go(this.richest(tier));
  }

  onChange(fn: (s: QualitySettings, dpr: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Push the current rung to the engine (called once at start-up, and on every change). */
  publish(): void {
    this.apply(this.settings, this.dpr);
    for (const fn of this.listeners) fn(this.settings, this.dpr);
  }

  private richest(tier: QualityTier): number {
    let best = 0;
    for (let i = 0; i < this.ladder.length; i++) if (this.ladder[i].tier === tier) best = i;
    return best;
  }

  private go(next: number): void {
    next = Math.max(0, Math.min(this.ladder.length - 1, next));
    if (next === this.rung) return;
    this.cooldown = next < this.rung ? 2 : 2.5;
    if (this.tier !== this.ladder[next].tier) this.cooldown += 1.5;   // tier changes recompile a few programs
    this.rung = next;
    this.resetWindow();
    this.clean = 0;
    this.publish();
  }

  private resetWindow(): void { this.frames = 0; this.slowFrames = 0; this.gpuN = 0; this.windowTime = 0; }

  begin(): void {
    if (!this.ext || this.active || this.queries.length > 3) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(delta: number): void {
    const { gl, ext } = this;
    if (ext && this.active) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.queries.push({ q: this.active, rung: this.rung });
      this.active = null;
    }
    if (ext) {
      while (this.queries.length && gl.getQueryParameter(this.queries[0].q, gl.QUERY_RESULT_AVAILABLE)) {
        const { q, rung } = this.queries.shift()!;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
        gl.deleteQuery(q);
        if (disjoint || rung !== this.rung) continue;
        const ms = ns / 1e6;
        this.gpuMs = ms;
        if (this.gpuN < this.gpuSamples.length) this.gpuSamples[this.gpuN++] = ms;
      }
    }
    if (!this.auto) return;   // pinned: measure only
    if (this.ceilingTimer > 0 && (this.ceilingTimer -= delta) <= 0) this.ceiling = this.ladder.length - 1;
    this.cooldown -= delta;
    if (this.cooldown > 0) { this.resetWindow(); return; }
    this.frames++;
    this.windowTime += delta;
    if (delta > 0.0215) this.slowFrames++;
    if (this.frames < 90 && this.windowTime < 1.5) return;
    const slowShare = this.slowFrames / this.frames;
    const gpu = this.gpuN > 20 ? this.lowTail() : null;
    const windowSecs = this.windowTime, frames = this.frames;
    this.resetWindow();

    // with a GPU timer, step down only when the GPU is the bottleneck (≥ 60 % of the frame interval): a
    // CPU-bound frame gains nothing from cheaper effects, it only pays the tier change's recompile hitch
    const slow = slowShare > 0.06 || (gpu !== null && gpu > 13);
    const gpuBound = gpu === null || gpu >= 0.6 * (windowSecs * 1000 / frames);
    if (slow && gpuBound) {
      if (this.probing) {
        // the probe failed: this rung is too rich for now; back off and retry much later
        this.ceiling = this.rung - 1;
        this.ceilingTimer = this.probeAfter * 8;
        this.probeAfter = Math.min(240, this.probeAfter * 2);
      }
      this.probing = false;
      this.go(this.rung - 1);
      return;
    }
    this.probing = false;
    if (slow) return;   // CPU-bound: hold the rung
    if (this.rung >= Math.min(this.ceiling, this.ladder.length - 1)) return;
    const next = this.ladder[this.rung + 1];
    if (gpu !== null) {
      const cur = this.ladder[this.rung];
      const growth = (next.dpr / cur.dpr) ** 2 * (next.tier !== cur.tier ? 1.2 : 1);
      if (slowShare < 0.01 && gpu * growth < 6) this.go(this.rung + 1);
      return;
    }
    // no GPU timer: probe upward after a long clean stretch
    if (slowShare < 0.005) this.clean += windowSecs; else this.clean = 0;
    if (this.clean >= this.probeAfter) { this.go(this.rung + 1); this.probing = true; }
  }

  /** 10th percentile of the window's GPU samples (insertion sort in place, n ≤ 256). */
  private lowTail(): number {
    const a = this.gpuSamples, n = this.gpuN;
    for (let i = 1; i < n; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
    return a[Math.floor(n * 0.1)];
  }
}
