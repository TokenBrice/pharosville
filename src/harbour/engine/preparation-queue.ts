import { deferred } from "./deferred";

export const PREPARATION_ALLOWANCE_MS = 2;
export type PreparationPriority = "visible" | "background";
export interface SubmissionOptions { signal?: AbortSignal | undefined; priority?: PreparationPriority | undefined; estimateMs?: number | undefined; nextFrame?: boolean }
interface Submission {
  run(deadline: number): void;
  cancel(): void;
  queuedAt: number;
  priority: PreparationPriority;
  estimateMs: number;
  frame: number;
}

/** One allowance per presentation frame, shared by compilation, uploads, bakes and CPU slices. */
export class PreparationQueue {
  private readonly pending: Submission[] = [];
  private scheduled = 0;
  private draining = false;
  private frame = 0;
  private disposed = false;
  private readonly native = typeof requestAnimationFrame === "function";
  readonly counters = { submitted: 0, overruns: 0, maxOverrunMs: 0, maxQueueAgeMs: 0 };

  get stats() {
    return { ...this.counters, pending: this.pending.length, oldestMs: this.pending.length ? performance.now() - this.pending[0].queuedAt : 0 };
  }

  submit<T>(work: (deadline: number) => T, options: SubmissionOptions = {}): Promise<T> {
    if (this.disposed || options.signal?.aborted) return Promise.reject(new DOMException("Preparation cancelled", "AbortError"));
    const { promise, resolve, reject } = deferred<T>();
    const clean = () => options.signal?.removeEventListener("abort", job.cancel);
    const job: Submission = {
      queuedAt: performance.now(), priority: options.priority ?? "visible", estimateMs: options.estimateMs ?? 0,
      frame: this.frame + (options.nextFrame ? 1 : 0),
      run: (deadline) => { clean(); try { resolve(work(deadline)); } catch (error) { reject(error); } },
      cancel: () => {
        const index = this.pending.indexOf(job);
        if (index >= 0) this.pending.splice(index, 1);
        clean(); reject(new DOMException("Preparation cancelled", "AbortError"));
        if (!this.pending.length && this.scheduled) { this.cancelFrame(); this.scheduled = 0; }
      },
    };
    this.pending.push(job);
    options.signal?.addEventListener("abort", job.cancel, { once: true });
    this.schedule();
    return promise;
  }

  private schedule(): void {
    if (this.scheduled || this.draining || this.disposed || !this.pending.length) return;
    this.scheduled = this.native ? requestAnimationFrame(() => { void this.drain(); }) : window.setTimeout(() => { void this.drain(); }, 16);
  }

  private async drain(): Promise<void> {
    this.scheduled = 0; this.draining = true; this.frame++;
    const deadline = performance.now() + PREPARATION_ALLOWANCE_MS;
    try {
      while (this.pending.length && !this.disposed && performance.now() < deadline) {
        const now = performance.now();
        // Ageing gives background warming a turn even under a stream of visible additions.
        let index = this.pending.findIndex((job) => job.frame <= this.frame && now - job.queuedAt >= 250);
        if (index < 0) index = this.pending.findIndex((job) => job.frame <= this.frame && job.priority === "visible");
        if (index < 0) index = this.pending.findIndex((job) => job.frame <= this.frame);
        if (index < 0) break;
        const job = this.pending[index];
        if (job.estimateMs > deadline - now && now > deadline - PREPARATION_ALLOWANCE_MS) break;
        this.pending.splice(index, 1);
        this.counters.maxQueueAgeMs = Math.max(this.counters.maxQueueAgeMs, now - job.queuedAt);
        job.run(deadline); this.counters.submitted++;
        const overrun = performance.now() - deadline;
        // shortcut: a driver call (or one CPU row) is indivisible; profile overruns before splitting it further.
        if (overrun > 0) { this.counters.overruns++; this.counters.maxOverrunMs = Math.max(this.counters.maxOverrunMs, overrun); }
        await Promise.resolve();
      }
    } finally { this.draining = false; this.schedule(); }
  }

  private cancelFrame(): void { if (this.native) cancelAnimationFrame(this.scheduled); else clearTimeout(this.scheduled); }

  dispose(): void {
    this.disposed = true;
    if (this.scheduled) this.cancelFrame();
    this.scheduled = 0;
    for (const job of [...this.pending]) job.cancel();
  }
}
