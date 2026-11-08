export interface ReplayResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
  failure?: boolean;
}
export interface Scenario {
  epoch: number;
  responses?: Record<string, ReplayResponse>;
  steps?: Array<{ atMs: number; responses: Record<string, ReplayResponse> }>;
}

/** Self-contained so the same seam can be serialized into preview's init script. */
export function createReplay(scenario: Scenario) {
  const steps = scenario.steps ?? [{ atMs: 0, responses: scenario.responses ?? {} }];
  if (!Number.isFinite(scenario.epoch) || !steps.length || steps.length > 128 || steps[0]!.atMs !== 0) throw new Error("Invalid scenario epoch/steps");
  let previous = -1;
  for (const step of steps) {
    if (!Number.isFinite(step.atMs) || step.atMs <= previous || step.atMs > 86_400_000) throw new Error("Scenario steps must increase within one day");
    previous = step.atMs;
    for (const [path, row] of Object.entries(step.responses)) {
      if (!path.startsWith("/api/") || path.includes("#") || !row || (row.delayMs !== undefined && (!Number.isFinite(row.delayMs) || row.delayMs < 0 || row.delayMs > 5_000)) || (row.status !== undefined && (!Number.isInteger(row.status) || row.status < 200 || row.status > 599))) throw new Error("Invalid scenario response");
    }
  }
  let atMs = 0;
  return {
    now: () => scenario.epoch + atMs,
    advanceTo(ms: number) {
      if (!Number.isFinite(ms) || ms < atMs || ms > 86_400_000) throw new Error("Scenario clock must advance within one day");
      atMs = ms;
      return scenario.epoch + atMs;
    },
    async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, "https://scenario.invalid");
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      let row: ReplayResponse | undefined;
      for (const step of steps) {
        if (step.atMs > atMs) break;
        row = step.responses[url.pathname + url.search] ?? step.responses[url.pathname] ?? row;
      }
      if (!row) throw new Error(`Scenario missing ${url.pathname}${url.search}`);
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (row.delayMs) await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, row.delayMs);
        signal?.addEventListener("abort", abort, { once: true });
      });
      if (row.failure) throw new TypeError("Scenario transport failure");
      const headers = new Headers(row.headers);
      headers.delete("content-encoding"); headers.delete("content-length");
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      const status = row.status ?? 200;
      return new Response([204, 205, 304].includes(status) ? null : typeof row.body === "string" ? row.body : JSON.stringify(row.body), { status, headers });
    },
  };
}

export function replayInitScript(scenario: Scenario): string {
  createReplay(scenario);
  return `window.__scenario = (${createReplay.toString()})(${JSON.stringify(scenario)});
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
  return url.origin === location.origin && url.pathname.startsWith('/api/') ? window.__scenario.fetch(input, init) : realFetch(input, init);
};
const NativeDate = Date;
function ReplayDate(...args) {
  if (!new.target) return new NativeDate(window.__scenario.now()).toString();
  return Reflect.construct(NativeDate, args.length ? args : [window.__scenario.now()], new.target);
}
ReplayDate.prototype = NativeDate.prototype;
Object.setPrototypeOf(ReplayDate, NativeDate);
ReplayDate.now = window.__scenario.now;
window.Date = ReplayDate;`;
}
