/**
 * HarbourFeed: fetches the seven same-origin world endpoints, refreshes each on its producer
 * cadence, and keeps the last good payload per endpoint (a failed refresh never blanks the harbour;
 * it only lets that payload age into "stale"). No React.
 */
import { parseApiMeta, type ApiMeta } from "../../lib/api";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { sourceFreshness } from "@shared/lib/source-freshness";
import { validEnrichment } from "./validate";
import { PHAROSVILLE_API_ENDPOINT_KEYS, type PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";
import type { EndpointSnapshot, FeedFailureKind, HarbourPayloads } from "../model/types";

export type Fetcher = (path: string, maxAgeSec: number, signal: AbortSignal) => Promise<{ data: unknown; meta: ApiMeta | null; staleFallback?: boolean; degradedTransport?: boolean }>;

export interface FeedOptions {
  fetcher?: Fetcher;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** Skip a scheduled refresh while the page is hidden (re-checked every minute). */
  isHidden?: () => boolean;
  isOnline?: () => boolean;
  random?: () => number;
  windowTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  documentTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
}

const MIN_REFRESH_MS = 60_000;
const ERROR_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];
/** Grace after the producer's next expected write before polling again. */
const PRODUCER_GRACE_MS = 45_000;

const REQUIRED_ARRAY: Record<PharosVilleApiEndpointKey, string | null> = {
  stablecoins: "peggedAssets", chains: "chains", stability: "history", pegSummary: "coins",
  stress: null, safetyGrades: "grades", mintBurn: "hourly",
};

export class FeedError extends Error {
  constructor(message: string, readonly kind: FeedFailureKind, readonly status: number | null = null, readonly retryAfter: string | null = null) {
    super(message);
    this.name = "FeedError";
  }
}

/**
 * Structural check + repair. Deliberately more tolerant than src/lib/world-payload-guard: the live
 * /api/stablecoins carries rows like `chainCirculating.Arbitrum.current: null`, which that guard
 * rejects wholesale (one null hides all 625 boats). Here a non-finite chain amount is dropped (it
 * reads as "no supply there"), never the payload.
 */
export function sanitizePayload(key: PharosVilleApiEndpointKey, data: unknown): unknown {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new FeedError(`${key}: payload is not an object`, "invalid-payload");
  const rec = data as Record<string, unknown>;
  const arr = REQUIRED_ARRAY[key];
  if (arr && !Array.isArray(rec[arr])) throw new FeedError(`${key}: missing ${arr}[]`, "invalid-payload");
  if (key !== "stablecoins" && !validEnrichment(key, rec)) throw new FeedError(`${key}: invalid consumed fields`, "invalid-payload");
  if (key === "stablecoins") {
    rec.peggedAssets = (rec.peggedAssets as unknown[]).filter((a): a is Record<string, unknown> =>
      a !== null && typeof a === "object" && typeof (a as Record<string, unknown>).id === "string" && typeof (a as Record<string, unknown>).pegType === "string")
      .map((a) => {
        const cc = (a.chainCirculating ?? {}) as Record<string, { current?: unknown } | null>;
        const clean: Record<string, unknown> = {};
        for (const [c, v] of Object.entries(cc)) if (v && typeof v.current === "number" && Number.isFinite(v.current)) clean[c] = v;
        const circ = (a.circulating ?? {}) as Record<string, unknown>;
        const circClean: Record<string, number | null> = {};
        for (const [k, v] of Object.entries(circ)) circClean[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
        return { ...a, chainCirculating: clean, circulating: circClean, chains: Array.isArray(a.chains) ? a.chains : [], symbol: String(a.symbol ?? a.id), name: String(a.name ?? a.id) };
      });
  }
  return rec;
}

/** Same-origin GET with the freshness evidence of src/lib/api.ts (body _meta, X-Data-Age, Age, Warning). */
export const defaultFetcher: Fetcher = async (path, maxAgeSec, signal) => {
  const url = new URL(path, "https://pharosville.local");
  if (!path.startsWith("/api/") || url.origin !== "https://pharosville.local" || !url.pathname.startsWith("/api/")) throw new FeedError(`not a same-origin /api/ path: ${path}`, "invalid-payload");
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const timeout = setTimeout(() => controller.abort(new DOMException("API request timed out", "TimeoutError")), 15_000);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(combined.reason);
    if (combined.aborted) onAbort(); else combined.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([(async () => {
      combined.throwIfAborted();
      const res = await fetch(path, { cache: "no-cache", signal: combined, headers: { accept: "application/json" } });
      if (!res.ok) throw new FeedError(`${path}: HTTP ${res.status}`, "http", res.status, res.headers.get("Retry-After"));
      let json: unknown;
      try { json = await res.json(); }
      catch (error) { if (combined.aborted) throw error; throw new FeedError(`${path}: invalid JSON`, "invalid-payload"); }
      let meta: ApiMeta | null = null;
      let data = json;
      if (json && typeof json === "object" && !Array.isArray(json) && "_meta" in json) {
        const { _meta, ...rest } = json as Record<string, unknown>;
        meta = parseApiMeta(_meta);
        data = rest;
      }
      return { data, ...sourceFreshness(meta, res.headers, maxAgeSec, Date.now()) };
    })(), aborted]);
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError(`${path}: ${controller.signal.aborted ? "timed out" : "network request failed"}`, controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timeout);
    combined.removeEventListener("abort", onAbort);
  }
};

/** Next poll: just after the producer's next expected write, within [1 min, one producer interval]. */
export function nextRefreshDelayMs(key: PharosVilleApiEndpointKey, meta: ApiMeta | null): number {
  const interval = PHAROSVILLE_ENDPOINT_REGISTRY[key].producerIntervalSec * 1000;
  if (!meta) return Math.max(MIN_REFRESH_MS, interval / 2);
  const age = Math.max(0, meta.ageSeconds * 1000);
  const untilNext = interval - (age % interval) + PRODUCER_GRACE_MS;
  return Math.min(interval, Math.max(MIN_REFRESH_MS, untilNext));
}

export class HarbourFeed {
  readonly payloads: HarbourPayloads = {};
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly isHidden: () => boolean;
  private readonly isOnline: () => boolean;
  private readonly random: () => number;
  private readonly windowTarget: FeedOptions["windowTarget"];
  private readonly documentTarget: FeedOptions["documentTarget"];
  private due = new Map<PharosVilleApiEndpointKey, number>();
  private retryNotBefore = new Map<PharosVilleApiEndpointKey, number>();
  private inFlight = new Map<PharosVilleApiEndpointKey, Promise<void>>();
  private timers = new Map<PharosVilleApiEndpointKey, unknown>();
  private errors = new Map<PharosVilleApiEndpointKey, number>();
  private listeners = new Set<(payloads: HarbourPayloads, key: PharosVilleApiEndpointKey) => void>();
  private abort = new AbortController();
  private running = false;

  constructor(opts: FeedOptions = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.random = opts.random ?? Math.random;
    this.isOnline = opts.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
    this.windowTarget = opts.windowTarget ?? (typeof window === "undefined" ? undefined : window);
    this.documentTarget = opts.documentTarget ?? (typeof document === "undefined" ? undefined : document);
    this.isHidden = opts.isHidden ?? (() => typeof document !== "undefined" && document.visibilityState === "hidden");
  }

  /** Called after every endpoint update (success or failure). */
  subscribe(fn: (payloads: HarbourPayloads, key: PharosVilleApiEndpointKey) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** UI wake status describes an admitted overdue request, not a future retry deadline. */
  get refreshingOverdue(): boolean {
    return [...this.inFlight.keys()].some((key) => (this.due.get(key) ?? Infinity) <= this.now());
  }

  /** Fetch everything now, then keep each endpoint on its own cadence. Resolves after the first round. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    this.windowTarget?.addEventListener("online", this.wake);
    this.documentTarget?.addEventListener("visibilitychange", this.wake);
    await Promise.all(PHAROSVILLE_API_ENDPOINT_KEYS.map((k) => this.refresh(k)));
  }

  stop(): void {
    this.running = false;
    this.abort.abort();
    this.windowTarget?.removeEventListener("online", this.wake);
    this.documentTarget?.removeEventListener("visibilitychange", this.wake);
    this.inFlight.clear();
    this.due.clear();
    this.retryNotBefore.clear();
    for (const h of this.timers.values()) this.clearTimer(h);
    this.timers.clear();
  }

  /** Wake only failed/overdue sources, preserving server and contract retry deadlines. */
  private wake = (): void => {
    if (!this.running || this.isHidden() || !this.isOnline()) return;
    for (const key of PHAROSVILLE_API_ENDPOINT_KEYS) {
      const failed = (this.payloads[key]?.failureStreak ?? 0) > 0;
      if ((failed || (this.due.get(key) ?? Infinity) <= this.now()) && (this.retryNotBefore.get(key) ?? 0) <= this.now()) void this.refresh(key);
    }
  };

  refresh(key: PharosVilleApiEndpointKey): Promise<void> {
    if (!this.running) return Promise.resolve();
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const task = this.fetchEndpoint(key);
    this.inFlight.set(key, task);
    void task.finally(() => { if (this.inFlight.get(key) === task) this.inFlight.delete(key); });
    return task;
  }

  private async fetchEndpoint(key: PharosVilleApiEndpointKey): Promise<void> {
    const entry = PHAROSVILLE_ENDPOINT_REGISTRY[key];
    const abort = this.abort;
    const prev = this.payloads[key] as EndpointSnapshot<unknown> | undefined;
    let delay: number;
    this.retryNotBefore.delete(key);
    const old = this.timers.get(key);
    if (old != null) this.clearTimer(old);
    this.timers.delete(key);
    try {
      if (!this.isOnline()) throw new FeedError("offline", "offline");
      const { data: raw, meta, staleFallback = false, degradedTransport = false } = await this.fetcher(entry.path, entry.metaMaxAgeSec, abort.signal);
      if (!this.running || this.abort !== abort) return;
      const data = sanitizePayload(key, raw);
      (this.payloads as Record<string, EndpointSnapshot<unknown>>)[key] = {
        data, meta, fetchedAtMs: this.now(), error: null, staleFallback, degradedTransport,
        failureKind: null, failureStreak: 0, nextRetryAtMs: null,
      };
      this.errors.delete(key);
      delay = nextRefreshDelayMs(key, meta);
    } catch (err) {
      if (!this.running || this.abort !== abort) return;
      const n = this.errors.get(key) ?? 0;
      this.errors.set(key, n + 1);
      const failure = err instanceof FeedError ? err : new FeedError(err instanceof Error ? err.message : String(err), this.isOnline() ? "network" : "offline");
      const contractFailure = failure.kind === "invalid-payload" || (failure.status != null && [400, 401, 403, 404, 405, 500].includes(failure.status));
      delay = contractFailure ? 600_000 : Math.min(600_000, Math.round(ERROR_BACKOFF_MS[Math.min(n, ERROR_BACKOFF_MS.length - 1)] * (0.8 + this.random() * 0.4)));
      const retryAfter = failure.status === 429 || failure.status === 503 ? retryAfterMs(failure.retryAfter, this.now()) : null;
      if (retryAfter != null) delay = retryAfter;
      if (contractFailure || retryAfter != null) this.retryNotBefore.set(key, this.now() + delay);
      (this.payloads as Record<string, EndpointSnapshot<unknown>>)[key] = {
        data: prev?.data ?? null, meta: prev?.meta ?? null, fetchedAtMs: prev?.fetchedAtMs ?? null,
        staleFallback: prev?.staleFallback ?? false, degradedTransport: prev?.degradedTransport ?? false,
        error: failure.message, failureKind: failure.kind, failureStreak: n + 1, nextRetryAtMs: this.now() + delay,
      };
    }
    for (const fn of this.listeners) fn(this.payloads, key);
    this.schedule(key, delay);
  }

  private schedule(key: PharosVilleApiEndpointKey, ms: number): void {
    if (!this.running) return;
    this.due.set(key, this.now() + ms);
    this.arm(key, ms);
  }

  private arm(key: PharosVilleApiEndpointKey, ms: number): void {
    const old = this.timers.get(key);
    if (old != null) this.clearTimer(old);
    this.timers.set(key, this.setTimer(() => {
      this.timers.delete(key);
      if (!this.running) return;
      if (this.isHidden() || !this.isOnline()) { this.arm(key, MIN_REFRESH_MS); return; }
      void this.refresh(key);
    }, ms));
  }
}

/** RFC Retry-After seconds or HTTP date, bounded to an hour. */
export function retryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const delay = /^\d+$/.test(trimmed) ? Number(trimmed) * 1000 : /^[A-Za-z]{3},/.test(trimmed) ? Date.parse(trimmed) - nowMs : NaN;
  return Number.isFinite(delay) && delay >= 0 ? Math.min(3_600_000, delay) : null;
}
