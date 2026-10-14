/**
 * Quality governor: picks the render pixel ratio in [1, 2] from measured frame cost.
 *  - GPU time from EXT_disjoint_timer_query_webgl2 when available (the honest number under vsync);
 *    otherwise only rAF deltas (missed vsync) can step it down.
 *  - Steps of 0.25 with hysteresis and a cool-down so it never oscillates.
 *  - `?dpr=<x>` pins it (gate captures).
 */
export class QualityGovernor {
  dpr: number;
  readonly pinned: boolean;
  gpuMs: number | null = null;
  private readonly maxDpr: number;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly queries: Array<{ q: WebGLQuery; dpr: number }> = [];
  private active: WebGLQuery | null = null;
  /**
   * GPU samples of the current window. Under vsync, ANGLE/GL timer queries absorb back-pressure on many
   * frames, so only the low tail (10th percentile) is trusted as the real cost.
   */
  private gpuSamples: number[] = [];
  private slowFrames = 0;
  private frames = 0;
  private cooldown = 2;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly apply: (dpr: number) => void) {
    const p = Number.parseFloat(new URLSearchParams(location.search).get("dpr") ?? "");
    this.pinned = Number.isFinite(p) && p > 0;
    this.maxDpr = 2;
    this.dpr = this.pinned ? Math.min(2, p) : Math.min(this.maxDpr, Math.max(1, devicePixelRatio));
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  }

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
      this.queries.push({ q: this.active, dpr: this.dpr });
      this.active = null;
    }
    if (ext) {
      while (this.queries.length && gl.getQueryParameter(this.queries[0].q, gl.QUERY_RESULT_AVAILABLE)) {
        const { q, dpr } = this.queries.shift()!;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
        gl.deleteQuery(q);
        if (disjoint || dpr !== this.dpr) continue;
        const ms = ns / 1e6;
        this.gpuMs = ms;
        this.gpuSamples.push(ms);
      }
    }
    if (this.pinned) return;
    this.frames++;
    if (delta > 0.0215) this.slowFrames++;
    this.cooldown -= delta;
    if (this.frames < 90 || this.cooldown > 0) return;
    const slowShare = this.slowFrames / this.frames;
    const gs = this.gpuSamples.sort((x, y) => x - y);
    const gpu = gs.length > 20 ? gs[Math.floor(gs.length * 0.1)] : null;
    let next = this.dpr;
    if (slowShare > 0.06 || (gpu !== null && gpu > 13)) next = Math.max(1, this.dpr - 0.25);
    else if (gpu !== null && slowShare < 0.01 && gpu * ((this.dpr + 0.25) / this.dpr) ** 2 < 6) next = Math.min(this.maxDpr, this.dpr + 0.25);
    this.frames = 0; this.slowFrames = 0; this.gpuSamples = [];
    if (next !== this.dpr) {
      this.cooldown = next < this.dpr ? 2 : 4;
      this.dpr = next;
      this.apply(next);
    }
  }
}
