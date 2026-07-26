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
// Keys already reported this session. Keys are deliberately NOT namespaced by
// category: a failure that a call site reports AND that also reaches the window
// handlers should cost one report, not two. With a budget of five per session,
// duplicates are what we can least afford to spend it on.
const reportedKeys = new Set<string>();

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

function send(
  category: ErrorCategory,
  payload: Record<string, unknown>,
  dedupeKey?: string,
): void {
  if (dedupeKey !== undefined && dedupeKey !== "") {
    if (reportedKeys.has(dedupeKey)) return;
    reportedKeys.add(dedupeKey);
  }
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
 *
 * Pass the error message as `dedupeKey` when the same failure can be raised
 * more than once — a retried query, a re-rendered effect, or a throw that also
 * reaches the window handlers — so it costs one report, not one per occurrence.
 */
export function reportClientError(
  category: ErrorCategory,
  payload: Record<string, unknown>,
  dedupeKey?: string,
): void {
  send(category, payload, dedupeKey);
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

/**
 * A cross-origin script failure is opaque: browsers report every one of them as
 * the literal `Script error.` with no filename, position or stack, so nothing
 * in the event tells two of them apart. Keying on the message therefore let the
 * FIRST such fault suppress every later one for the rest of the session,
 * whatever it was. Those go unkeyed and are held by the per-session budget
 * instead; every other uncaught error still keys on its message, which is what
 * makes a failure a call site already reported cost one report rather than two.
 */
function uncaughtDedupeKey(event: ErrorEvent): string | undefined {
  if (!event.filename && /^script error\.?$/i.test(event.message.trim())) return undefined;
  return event.message;
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
    }, uncaughtDedupeKey(event));
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = summarize(event.reason).slice(0, 2_000);
    send("rejection", {
      kind: "unhandledrejection",
      reason,
      stack: event.reason instanceof Error ? event.reason.stack?.slice(0, 2_000) : undefined,
      url: window.location.href,
    }, reason);
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") abortPendingReports();
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", abortPendingReports);
}
