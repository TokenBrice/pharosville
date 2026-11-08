export interface CpuFrame {
  frame: number;
  revision: number;
  tier: string;
  dpr: number;
  cpuMs: number;
  rafGapMs: number;
  tags: string[];
}

/** Opt-in CPU submission samples. Percentiles cover the retained ring, sums/max cover since reset. */
export class FrameProfile {
  frames = 0;
  ms: Record<string, number> = {};
  max: Record<string, number> = {};
  private readonly ring: CpuFrame[] = [];
  private cursor = 0;
  private readonly undo: Array<() => void> = [];
  private readonly pending = new Set<string>();
  constructor(readonly capacity = 1200) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Invalid CPU frame capacity");
  }
  /** GL upload calls include implicit atlas repaints and instance buffers, not just new texture allocations. */
  trackUploads(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    const object = gl as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const key of ["bufferData", "bufferSubData", "texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D", "compressedTexImage2D", "compressedTexSubImage2D", "compressedTexImage3D", "compressedTexSubImage3D"]) {
      const original = object[key];
      if (!original) continue;
      object[key] = (...args) => { this.tag(`upload:${key}`); return original.apply(gl, args); };
      this.undo.push(() => { object[key] = original; });
    }
  }
  dispose(): void { for (const undo of this.undo.splice(0).reverse()) undo(); }
  tag(value: string): void { if (this.pending.size < 64) this.pending.add(value); }
  record(frame: Omit<CpuFrame, "tags">): void {
    this.ring[this.cursor] = { ...frame, tags: [...this.pending] };
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pending.clear();
  }
  snapshot() {
    const samples = this.ring.length < this.capacity ? [...this.ring] : [...this.ring.slice(this.cursor), ...this.ring.slice(0, this.cursor)];
    const distribution = (key: "cpuMs" | "rafGapMs") => {
      const sorted = samples.map((sample) => sample[key]).sort((a, b) => a - b);
      const percentile = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
      return { samples: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99) };
    };
    return { frames: this.frames, capacity: this.capacity, ms: { ...this.ms }, max: { ...this.max }, cpu: distribution("cpuMs"), rafGap: distribution("rafGapMs"), samples };
  }
  reset(): void {
    this.frames = 0; this.ms = {}; this.max = {};
    this.ring.length = 0; this.cursor = 0; this.pending.clear();
  }
}
