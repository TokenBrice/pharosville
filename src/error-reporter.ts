const MAX_REPORTS_PER_SESSION = 5;
const ENDPOINT = "/_log";

let sent = 0;
let installed = false;

function summarize(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function send(payload: Record<string, unknown>): void {
  if (sent >= MAX_REPORTS_PER_SESSION) return;
  sent += 1;
  try {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Swallow — reporter must never throw inside an error path.
  }
}

export function installClientErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    send({
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
    send({
      kind: "unhandledrejection",
      reason: summarize(event.reason).slice(0, 2_000),
      stack: event.reason instanceof Error ? event.reason.stack?.slice(0, 2_000) : undefined,
      url: window.location.href,
    });
  });
}
