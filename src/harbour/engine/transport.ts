import { BootFailure } from "./failure";

/** Native decoders cannot always cancel; settle now and release their late result. */
export function abortable<T>(pending: Promise<T>, signal?: AbortSignal, release?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const cancel = () => { cancelled = true; signal?.removeEventListener("abort", cancel); reject(signal?.reason ?? new DOMException("Cancelled", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    void pending.then((value) => {
      if (cancelled) release?.(value); else resolve(value);
    }, reject).finally(() => signal?.removeEventListener("abort", cancel));
  });
}

/** The deadline covers headers, stalled response bodies and decoding, not just fetch(). */
export async function transport<T>(signal: AbortSignal | undefined, read: (signal: AbortSignal) => Promise<T>, release?: (value: T) => void): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new BootFailure("loading")), 30000);
  try {
    controller.signal.throwIfAborted();
    return await abortable(read(controller.signal), controller.signal, release);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}
