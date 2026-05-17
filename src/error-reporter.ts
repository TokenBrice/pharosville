const MAX_REPORTS_PER_SESSION = 5;
const ENDPOINT = "/_log";
const HISTORY_KEY = "pharosville:error-history";
const HISTORY_LIMIT = 10;
// Exponential backoff for fetch retries: try immediately, then 1s, then 4s.
const RETRY_DELAYS_MS = [0, 1_000, 4_000];

export type ErrorCategory =
  | "render"
  | "data-load"
  | "interaction"
  | "network"
  | "uncaught"
  | "rejection"
  | "unknown";

interface HistoryEntry {
  category: ErrorCategory;
  ts: number;
  [key: string]: unknown;
}

let sent = 0;
let installed = false;
const pendingReportControllers = new Set<AbortController>();

function summarize(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pushHistory(entry: HistoryEntry): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const history = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    history.push(entry);
    while (history.length > HISTORY_LIMIT) history.shift();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage may be disabled, full, or corrupt; reporter must never throw.
  }
}

function abortPendingReports(): void {
  for (const controller of pendingReportControllers) {
    controller.abort();
  }
  pendingReportControllers.clear();
}

function waitForBackoff(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve(!signal.aborted);
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      resolve(false);
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

async function postWithBackoff(payload: Record<string, unknown>, signal: AbortSignal): Promise<void> {
  for (const delayMs of RETRY_DELAYS_MS) {
    if (signal.aborted) return;
    if (delayMs > 0 && !(await waitForBackoff(delayMs, signal))) return;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        signal,
      });
      if (res.ok) return;
    } catch {
      if (signal.aborted) return;
      // network or aborted; loop continues to next backoff slot
    }
  }
  // Exhausted retries; the entry survives in localStorage history for debugging.
}

function send(category: ErrorCategory, payload: Record<string, unknown>): void {
  if (sent >= MAX_REPORTS_PER_SESSION) return;
  sent += 1;
  const tagged: HistoryEntry = { category, ts: Date.now(), ...payload };
  pushHistory(tagged);
  const controller = new AbortController();
  pendingReportControllers.add(controller);
  void postWithBackoff(tagged, controller.signal).finally(() => {
    pendingReportControllers.delete(controller);
  });
}

/**
 * Manually report a categorised client error from anywhere in the app
 * (renderer, data-load pipeline, interaction handlers).
 */
export function reportClientError(
  category: ErrorCategory,
  payload: Record<string, unknown>,
): void {
  send(category, payload);
}

/**
 * Read the local error history (last {@link HISTORY_LIMIT} entries) for
 * in-browser debugging from the devtools console.
 */
export function readClientErrorHistory(): HistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function installClientErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    send("uncaught", {
      kind: "error",
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack?.slice(0, 2_000) : undefined,
      url: window.location.href,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    send("rejection", {
      kind: "unhandledrejection",
      reason: summarize(event.reason).slice(0, 2_000),
      stack: event.reason instanceof Error ? event.reason.stack?.slice(0, 2_000) : undefined,
      url: window.location.href,
    });
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") abortPendingReports();
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", abortPendingReports);
}
