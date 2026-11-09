/** Longest slice of resumable work per task (ms). */
export const IDLE_SLICE_MS = 5;
/** A busy main thread still gives the work a slice this often (ms): about every second frame at 60 Hz. */
export const IDLE_TIMEOUT_MS = 34;

/**
 * Drive pure, resumable work (a generator whose every yield is a safe pause point) in idle slices of at most
 * IDLE_SLICE_MS, each its own task: a long CPU computation never becomes a long task. An idle period lends
 * what it has left (down to 1 ms); a main thread with no idle time still gets a whole slice every
 * IDLE_TIMEOUT_MS. Rejects with the signal's reason when aborted (the generator is closed).
 */
export function runIdleSteps<T>(steps: Generator<unknown, T>, signal?: AbortSignal, sliceMs = IDLE_SLICE_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const ric = typeof requestIdleCallback === "function" ? requestIdleCallback : null;
    let handle: number | undefined, idle = false, settled = false;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (handle !== undefined) { if (idle) cancelIdleCallback(handle); else clearTimeout(handle); handle = undefined; }
      if (error !== undefined) { try { steps.return(undefined as T); } catch { /* already finished */ } reject(error); } else resolve(value as T);
    };
    const abort = () => finish(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    const slice = (budget: number) => {
      handle = undefined;
      if (settled) return;
      const end = performance.now() + budget;
      try {
        for (;;) {
          const step = steps.next();
          if (step.done) { finish(undefined, step.value); return; }
          if (performance.now() >= end) break;
        }
      } catch (error) { finish(error ?? new Error("Idle work failed")); return; }
      schedule();
    };
    const schedule = () => {
      if (ric) {
        idle = true;
        handle = ric((deadline) => slice(deadline.didTimeout ? sliceMs : Math.max(1, Math.min(sliceMs, deadline.timeRemaining()))), { timeout: IDLE_TIMEOUT_MS });
      } else {
        idle = false;
        handle = window.setTimeout(() => slice(sliceMs), 0);
      }
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    schedule();
  });
}
