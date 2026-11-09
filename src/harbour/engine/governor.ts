import { TIERS, initialRungFor, ladderFor, parseTier, type CompletedGpuSample, type QualityRung, type QualityService, type QualitySettings, type QualityTier } from "./quality";

interface QuerySlot extends CompletedGpuSample { q: WebGLQuery | null; disjoint: boolean }
const QUERY_CAPACITY = 4;
const SAMPLE_CAPACITY = 256;
const TARGET_SECONDS = 0.0167;

/**
 * Quality governor: walks the (tier, pixel ratio) ladder from measured frame cost. Exposed as the
 * 'quality' service.
 *  - GPU p10 is compared to the target budget, never to an already-missed presentation interval.
 *  - Raw visible rAF intervals count missed target slots; low-GPU CPU-bound windows hold their rung.
 *  - Two slow windows reduce cost; upgrades require fifteen clean seconds and measured GPU headroom.
 *    Without usable timer samples, reductions remain available but upgrades cannot prove headroom.
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
  private severeFrames = 0;
  private frames = 0;
  private missedSlots = 0;
  private windowTime = 0;
  private emergencyTime = 0;
  private settling = 0.5;
  private calibrating = true;
  private slowWindows = 0;
  private clean = 0;
  private deviceDpr: number;
  private maxDpr = 2;
  private readonly listeners = new Set<(s: QualitySettings, dpr: number) => void>();
  private preparation: ((settings: QualitySettings, signal: AbortSignal) => Promise<void>) | undefined;
  private prepared: ((settings: QualitySettings) => boolean) | undefined;
  private pending: AbortController | undefined;
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly apply: (s: QualitySettings, dpr: number) => void, measureGpu = true) {
    const q = new URLSearchParams(location.search);
    const p = Number.parseFloat(q.get("dpr") ?? "");
    this.pinnedDpr = Number.isFinite(p) && p > 0 ? Math.min(2, p) : null;
    this.pinnedTier = parseTier(q.get("quality"));
    this.deviceDpr = devicePixelRatio;
    this.ladder = ladderFor(this.deviceDpr);
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
  get dpr(): number { return Math.min(this.maxDpr, this.pinnedDpr ?? this.ladder[this.rung].dpr); }
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
  setPreparation(prepare: (settings: QualitySettings, signal: AbortSignal) => Promise<void>, prepared?: (settings: QualitySettings) => boolean): void {
    this.preparation = prepare;
    this.prepared = prepared;
  }

  set(tier: QualityTier | "auto"): void {
    this.pending?.abort(); this.pending = undefined;
    if (tier === "auto") { this.pinnedTier = null; this.resetTiming(); return; }
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

  /** Reconcile before allocation; the engine publishes after its backing dimensions are coherent. */
  reconcileDisplay(deviceDpr: number, maxDpr: number): boolean {
    if (deviceDpr === this.deviceDpr && maxDpr === this.maxDpr) return false;
    const tier = this.tier, dpr = this.ladder[this.rung].dpr;
    this.pending?.abort(); this.pending = undefined;
    this.deviceDpr = deviceDpr; this.maxDpr = maxDpr;
    this.ladder.splice(0, this.ladder.length, ...ladderFor(deviceDpr, maxDpr));
    this.rung = this.richest(tier);
    if (this.pinnedTier !== tier) {
      for (let i = 0; i < this.ladder.length; i++) if (this.ladder[i].tier === tier &&
        Math.abs(this.ladder[i].dpr - dpr) < Math.abs(this.ladder[this.rung].dpr - dpr)) this.rung = i;
    }
    this.resetTiming();
    if (this.pinnedTier && this.pinnedTier !== tier) this.go(this.richest(this.pinnedTier));
    return true;
  }

  /** Pending automatic decisions and query generations cannot cross a pause boundary. */
  pause(): void {
    this.pending?.abort(); this.pending = undefined;
    this.resetTiming();
  }

  resume(): void {
    this.pause();
    if (this.pinnedTier) this.go(this.richest(this.pinnedTier));
  }

  resetTiming(): void {
    this.stateId++;
    this.measuredHead = this.measuredN = 0;
    this.settling = 0.5; this.calibrating = true;
    this.slowWindows = 0; this.clean = 0;
    this.frames = this.severeFrames = 0; this.emergencyTime = 0;
    this.resetWindow();
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
    if (!this.preparation || this.tier === this.ladder[next].tier || this.prepared?.(TIERS[this.ladder[next].tier])) { this.commit(next); return; }
    const controller = new AbortController();
    this.pending = controller;
    const transition = async () => {
      // Overrides and emergency reductions await only their requested preset;
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
    this.rung = next;
    this.resetTiming();
    this.publish();
  }

  private resetWindow(): void {
    this.gpuN = 0; this.windowTime = 0; this.missedSlots = 0;
  }

  begin(): void {
    if (this.disposed) return;
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
    if (this.disposed) return;
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
    if (!this.auto || this.pending || delta <= 0 || !Number.isFinite(delta)) return;
    if (this.settling > 0) { this.settling -= delta; this.resetWindow(); return; }
    this.frames++;
    this.windowTime += delta;
    this.emergencyTime += delta;
    const slots = delta / TARGET_SECONDS;
    // Fractional misses catch sustained 48 fps; short intervals never cancel a preceding long gap.
    this.missedSlots += Math.max(0, slots - 1);
    if (delta > 2 * TARGET_SECONDS) this.severeFrames++;
    if (this.emergencyTime >= 0.5) {
      const severe = this.severeFrames > this.frames / 2;
      this.frames = this.severeFrames = 0; this.emergencyTime = 0;
      const gpu = this.gpuN ? this.lowTail() : null;
      if (severe && (gpu === null || gpu > 0.8 * TARGET_SECONDS * 1000) && this.rung > 0) {
        if (this.preparation && this.tier !== "low" && !this.prepared?.(TIERS.low)) {
          // Save same-tier pixels immediately while the complete low variant prepares.
          const cheapest = this.ladder.findIndex((r) => r.tier === this.tier);
          this.go(cheapest);
        }
        this.go(0);
        return;
      }
    }
    if (this.windowTime < (this.calibrating ? 0.5 : 1)) return;
    const missedShare = this.missedSlots / (this.windowTime / TARGET_SECONDS);
    const gpu = this.gpuN ? this.lowTail() : null;
    const gpuPressure = gpu !== null && gpu > 0.8 * TARGET_SECONDS * 1000;
    const actionable = gpu === null || gpuPressure;
    const windowSecs = this.windowTime, calibration = this.calibrating;
    this.calibrating = false;
    this.resetWindow();

    if (calibration) return;
    const slow = missedShare > 0.05 || gpuPressure;
    this.slowWindows = slow && actionable ? this.slowWindows + 1 : 0;
    if (this.slowWindows >= 2) { this.go(this.rung - 1); return; }
    if (slow || missedShare >= 0.005) { this.clean = 0; return; }
    this.clean += windowSecs;
    if (this.clean < 15 || gpu === null || this.rung === this.ladder.length - 1) return;
    const next = this.ladder[this.rung + 1];
    const growth = (Math.min(this.maxDpr, next.dpr) / this.dpr) ** 2 * (next.tier !== this.tier ? 1.2 : 1);
    if (gpu * growth < 0.65 * TARGET_SECONDS * 1000) this.go(this.rung + 1);
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
