import { TIERS, initialRungFor, ladderFor, parseTier, type CompletedGpuSample, type QualityRung, type QualityService, type QualitySettings, type QualityTier } from "./quality";

interface QuerySlot extends CompletedGpuSample { q: WebGLQuery | null; disjoint: boolean }
const QUERY_CAPACITY = 4;
const SAMPLE_CAPACITY = 256;

/**
 * Quality governor: walks the (tier, pixel ratio) ladder from measured frame cost. Exposed as the
 * 'quality' service.
 *  - GPU time from EXT_disjoint_timer_query_webgl2 when available (the honest number under vsync);
 *    otherwise rAF deltas: missed vsyncs step DOWN, and long clean stretches PROBE one rung up. A probe
 *    that misses frames is reverted and that rung becomes the ceiling (retried later, ever more rarely).
 *    This is the path Safari and Chrome-on-Mac take (no timer queries there).
 *  - With a GPU timer, a slow window steps down only when the GPU time is ≥ 60 % of the frame interval;
 *    a CPU-bound frame holds the rung (cheaper effects would not help).
 *  - One rung per decision, hysteresis, and a cool-down after every change so it never oscillates.
 *  - `?dpr=<x>` pins the pixel ratio, `?quality=high|medium|low` pins the tier (gate captures).
 *  - Allocation-free per frame (sample ring, no sorting of fresh arrays).
 */
export class QualityGovernor implements QualityService {
  readonly ladder: QualityRung[];
  private rung: number;
  private pinnedDpr: number | null;
  private pinnedTier: QualityTier | null;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  /** Four reusable handles, retaining the previous at-most-four outstanding-query cadence. */
  private readonly queries: QuerySlot[] = Array.from({ length: QUERY_CAPACITY }, (): QuerySlot => ({
    q: null, disjoint: false, frame: 0, state: 0, rung: 0, tier: "high", dpr: 1, ms: 0,
  }));
  private queryHead = 0;
  private queryN = 0;
  private active: QuerySlot | null = null;
  private frameId = 0;
  private stateId = 0;
  gpuCompletedSamples = 0;
  gpuDisjointSamples = 0;
  gpuSkippedQueries = 0;
  private readonly completed: CompletedGpuSample[] = Array.from({ length: SAMPLE_CAPACITY }, (): CompletedGpuSample => ({
    frame: 0, state: 0, rung: 0, tier: "high", dpr: 1, ms: 0,
  }));
  private completedHead = 0;
  private completedN = 0;
  /** Independent from the governor's decision window, so pinned/cooldown stats remain meaningful. */
  private readonly measured = new Float32Array(SAMPLE_CAPACITY);
  private readonly measuredSorted = new Float32Array(SAMPLE_CAPACITY);
  private measuredHead = 0;
  private measuredN = 0;
  /**
   * GPU samples of the current window. Under vsync, ANGLE/GL timer queries absorb back-pressure on many
   * frames, so only the low tail (10th percentile) is trusted as the real cost.
   */
  private readonly decisionSamples = new Float32Array(256);
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
  private preparation: ((settings: QualitySettings, signal: AbortSignal) => Promise<void>) | undefined;
  private pending: AbortController | undefined;
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly apply: (s: QualitySettings, dpr: number) => void, measureGpu = true) {
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
    this.ext = measureGpu ? gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null : null;
  }

  get auto(): boolean { return this.pinnedDpr === null && this.pinnedTier === null; }
  get tier(): QualityTier { return this.ladder[this.rung].tier; }
  get settings(): QualitySettings { return TIERS[this.tier]; }
  get dpr(): number { return this.pinnedDpr ?? this.ladder[this.rung].dpr; }
  /** Index of the current rung (for stats). */
  get level(): number { return this.rung; }
  get gpuMs(): number | null { return this.gpuP10Ms; }
  get gpuP10Ms(): number | null { return this.measuredN ? this.measuredSorted[Math.floor(this.measuredN * 0.1)] : null; }
  get gpuP50Ms(): number | null { return this.measuredN ? this.measuredSorted[Math.floor(this.measuredN * 0.5)] : null; }
  get gpuSamples(): number { return this.measuredN; }
  get gpuPendingQueries(): number { return this.queryN + (this.active ? 1 : 0); }

  /** Diagnostic-only copy; the frame path reuses every record and query handle. */
  completedGpuSamples(): CompletedGpuSample[] {
    const samples: CompletedGpuSample[] = [];
    for (let i = 0; i < this.completedN; i++) samples.push({ ...this.completed[(this.completedHead + i) % SAMPLE_CAPACITY] });
    return samples;
  }

  /** Effect preparation is separate from resolution-only publication; still one controller. */
  setPreparation(prepare: (settings: QualitySettings, signal: AbortSignal) => Promise<void>): void {
    this.preparation = prepare;
  }

  set(tier: QualityTier | "auto"): void {
    this.pending?.abort(); this.pending = undefined;
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
    if (next === this.rung || this.disposed) return;
    this.pending?.abort();
    this.pending = undefined;
    if (!this.preparation || this.tier === this.ladder[next].tier) { this.commit(next); return; }
    const controller = new AbortController();
    this.pending = controller;
    const transition = async () => {
      // Automatic decisions are adjacent. Explicit overrides await only their requested preset;
      // the engine shares this with post-reveal warming, without publishing intermediate tiers.
      await this.preparation?.(TIERS[this.ladder[next].tier], controller.signal);
      if (controller.signal.aborted || this.disposed) return;
      this.commit(next);
    };
    void transition().catch((error: unknown) => {
      if (!controller.signal.aborted) console.error("[harbour] quality preparation failed; retaining current tier", error);
    }).finally(() => { if (this.pending === controller) this.pending = undefined; });
  }

  private commit(next: number): void {
    const tierChanged = this.tier !== this.ladder[next].tier;
    this.cooldown = (next < this.rung ? 2 : 2.5) + (tierChanged ? 1.5 : 0);
    this.rung = next;
    this.stateId++;
    this.measuredHead = this.measuredN = 0;
    this.resetWindow(); this.clean = 0;
    this.publish();
  }

  private resetWindow(): void { this.frames = 0; this.slowFrames = 0; this.gpuN = 0; this.windowTime = 0; }

  begin(): void {
    this.frameId++;
    if (!this.ext || this.active) return;
    if (this.queryN === QUERY_CAPACITY) { this.gpuSkippedQueries++; return; }
    const slot = this.queries[(this.queryHead + this.queryN) % QUERY_CAPACITY];
    slot.q ??= this.gl.createQuery();
    if (!slot.q) { this.gpuSkippedQueries++; return; }
    slot.frame = this.frameId;
    slot.state = this.stateId;
    slot.rung = this.rung;
    slot.tier = this.tier;
    slot.dpr = this.dpr;
    slot.disjoint = false;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, slot.q);
    this.active = slot;
  }

  end(delta: number): void {
    const { gl, ext } = this;
    if (ext && this.active) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.queryN++;
      this.active = null;
    }
    if (ext) {
      // A disjoint invalidates all in-flight intervals, even ones whose result is not available yet.
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (let i = 0; i < this.queryN; i++) this.queries[(this.queryHead + i) % QUERY_CAPACITY].disjoint = true;
      }
      while (this.queryN) {
        const slot = this.queries[this.queryHead], q = slot.q!;
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        this.queryHead = (this.queryHead + 1) % QUERY_CAPACITY;
        this.queryN--;
        if (slot.disjoint) { this.gpuDisjointSamples++; continue; }
        slot.ms = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
        this.gpuCompletedSamples++;
        const index = (this.completedHead + this.completedN) % SAMPLE_CAPACITY;
        const sample = this.completed[index];
        sample.frame = slot.frame; sample.state = slot.state; sample.rung = slot.rung;
        sample.tier = slot.tier; sample.dpr = slot.dpr; sample.ms = slot.ms;
        if (this.completedN < SAMPLE_CAPACITY) this.completedN++; else this.completedHead = (this.completedHead + 1) % SAMPLE_CAPACITY;
        if (slot.state !== this.stateId) continue;
        this.measure(slot.ms);
        if (this.gpuN < this.decisionSamples.length) this.decisionSamples[this.gpuN++] = slot.ms;
      }
    }
    if (!this.auto || this.pending) return;   // pinned/pending: measure only; current tier keeps drawing
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

    // With a GPU timer, step down only when the GPU is the bottleneck (≥ 60 % of the frame interval):
    // CPU-bound frames gain nothing from cheaper effects.
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

  /** Rolling sorted population: O(256) shifts, no allocation or per-frame sort. */
  private measure(ms: number): void {
    const n = this.measuredN, a = this.measuredSorted;
    if (n === SAMPLE_CAPACITY) {
      const old = this.measured[this.measuredHead];
      let i = 0;
      while (i < n - 1 && a[i] !== old) i++;
      for (; i < n - 1; i++) a[i] = a[i + 1];
    } else this.measuredN++;
    this.measured[this.measuredHead] = ms;
    const value = this.measured[this.measuredHead];
    this.measuredHead = (this.measuredHead + 1) % SAMPLE_CAPACITY;
    let i = this.measuredN - 1;
    while (i > 0 && a[i - 1] > value) { a[i] = a[i - 1]; i--; }
    a[i] = value;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending?.abort(); this.pending = undefined;
    if (this.active && this.ext) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.active = null;
    for (const slot of this.queries) { if (slot.q) this.gl.deleteQuery(slot.q); slot.q = null; }
    this.queryN = 0;
    this.listeners.clear();
  }

  /** 10th percentile of the window's GPU samples (insertion sort in place, n ≤ 256). */
  private lowTail(): number {
    const a = this.decisionSamples, n = this.gpuN;
    for (let i = 1; i < n; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
    return a[Math.floor(n * 0.1)];
  }
}
