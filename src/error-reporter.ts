import { PHAROSVILLE_LATEST_VERSION } from "./content/pharosville-version";
import { projectDiagnostic, type ErrorCategory } from "./error-diagnostic";
export type { ErrorCategory } from "./error-diagnostic";

const MAX_REPORTS_PER_SESSION = 5;
const HISTORY_KEY = "pharosville:error-history";
const HISTORY_TTL_MS = 24 * 60 * 60 * 1_000;
type HistoryEntry = NonNullable<ReturnType<typeof projectDiagnostic>>;
let admitted = 0;
let installed = false;
let running = false;
let nextDelivery = 0;
const reportedKeys = new Set<string>();
const queue: HistoryEntry[] = [];
let controller = new AbortController();

export function readClientErrorHistory(): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    const history = Array.isArray(parsed) ? parsed.flatMap((entry: Record<string, unknown>) => {
      // Purge the legacy free-text schema rather than retaining sensitive old entries.
      if (!entry || typeof entry !== "object" || !("code" in entry) || typeof entry.ts !== "number" || entry.ts > Date.now() || Date.now() - entry.ts >= HISTORY_TTL_MS) return [];
      const projected = projectDiagnostic(entry);
      return projected ? [projected] : [];
    }).slice(-10) : [];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return history;
  } catch {
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* storage policy */ }
    return [];
  }
}

function wait(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, Math.max(0, delay));
    signal.addEventListener("abort", done, { once: true });
  });
}

async function deliver(): Promise<void> {
  if (running) return;
  running = true;
  const signal = controller.signal;
  try {
    while (queue.length && !signal.aborted) {
      const report = queue.shift()!;
      for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
        await wait(nextDelivery - Date.now(), signal);
        if (signal.aborted) break;
        const request = new AbortController();
        const abort = () => request.abort();
        signal.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, 10_000);
        nextDelivery = Date.now() + 10_000;
        try {
          const response = await fetch("/_log", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify(report), keepalive: true, signal: request.signal,
          });
          if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) break;
          if (response.status === 429) {
            const retry = response.headers.get("retry-after");
            const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1_000 : Date.parse(retry ?? "") - Date.now();
            if (Number.isFinite(delay)) nextDelivery = Math.max(nextDelivery, Date.now() + delay);
          }
        } catch { /* best effort; the bounded sanitized local history survives */ }
        finally {
          nextDelivery = Math.max(nextDelivery, Date.now() + 10_000);
          clearTimeout(timeout); signal.removeEventListener("abort", abort);
        }
      }
    }
  } finally {
    running = false;
    if (queue.length && !controller.signal.aborted) void deliver();
  }
}

export function reportClientError(category: ErrorCategory, payload: Record<string, unknown>, dedupeKey?: string): void {
  if (admitted >= MAX_REPORTS_PER_SESSION || payload.name === "AbortError" || payload.code === "cancelled") return;
  const key = dedupeKey?.slice(0, 200);
  if (key && reportedKeys.has(key)) return;
  const entry = projectDiagnostic({ ...payload, category, release: PHAROSVILLE_LATEST_VERSION, ts: Date.now() });
  if (!entry || new TextEncoder().encode(JSON.stringify(entry)).byteLength >= 4_096) return;
  admitted++;
  if (key) reportedKeys.add(key);
  const history = readClientErrorHistory();
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify([...history, entry].slice(-10))); } catch { /* storage may be unavailable */ }
  queue.push(entry);
  if (controller.signal.aborted) controller = new AbortController();
  void deliver();
}

export function installClientErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  readClientErrorHistory();
  window.addEventListener("error", (event) => {
    const opaque = !event.filename && /^script error\.?$/i.test(event.message.trim());
    reportClientError("uncaught", { filename: event.filename, stack: event.error instanceof Error ? event.error.stack : undefined }, opaque ? undefined : event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason instanceof Error && event.reason.name === "AbortError") return;
    reportClientError("rejection", { stack: event.reason instanceof Error ? event.reason.stack : undefined }, event.reason instanceof Error ? event.reason.message : undefined);
  });
  const cancel = () => { queue.length = 0; controller.abort(); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") cancel(); });
  window.addEventListener("pagehide", cancel);
}
