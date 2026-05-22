export interface WaitForIdleChunkOptions {
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}

type IdleSchedulerGlobal = typeof globalThis & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

export function waitForIdleChunk(options: WaitForIdleChunkOptions = {}): Promise<void> {
  const { signal, timeoutMs } = options;
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const idleGlobal = globalThis as IdleSchedulerGlobal;
    let settled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      if (idleHandle != null) idleGlobal.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle != null) clearTimeout(timeoutHandle);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const abort = () => finish();
    signal?.addEventListener("abort", abort, { once: true });
    if (idleGlobal.requestIdleCallback) {
      idleHandle = idleGlobal.requestIdleCallback(
        finish,
        timeoutMs === undefined ? undefined : { timeout: timeoutMs },
      );
      return;
    }
    timeoutHandle = setTimeout(finish, 0);
  });
}
