/**
 * HarbourFeed: fetches the seven same-origin world endpoints, refreshes each on its producer
 * cadence, and keeps the last good payload per endpoint (a failed refresh never blanks the harbour;
 * it only lets that payload age into "stale"). No React.
 */
import { parseApiMeta, type ApiMeta } from "../../lib/api";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { classifyFreshnessRatio } from "@shared/lib/status-thresholds";
import { PHAROSVILLE_API_ENDPOINT_KEYS, type PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";
import type { EndpointSnapshot, HarbourPayloads } from "../model/types";

export type Fetcher = (path: string, maxAgeSec: number, signal: AbortSignal) => Promise<{ data: unknown; meta: ApiMeta | null }>;

export interface FeedOptions {
  fetcher?: Fetcher;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** Skip a scheduled refresh while the page is hidden (re-checked every minute). */
  isHidden?: () => boolean;
}

const MIN_REFRESH_MS = 60_000;
const ERROR_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];
/** Grace after the producer's next expected write before polling again. */
const PRODUCER_GRACE_MS = 45_000;

const REQUIRED_ARRAY: Record<PharosVilleApiEndpointKey, string | null> = {
  stablecoins: "peggedAssets", chains: "chains", stability: "history", pegSummary: "coins",
  stress: null, safetyGrades: "grades", mintBurn: "hourly",
};

/**
 * Structural check + repair. Deliberately more tolerant than src/lib/world-payload-guard: the live
 * /api/stablecoins carries rows like `chainCirculating.Arbitrum.current: null`, which that guard
 * rejects wholesale (one null hides all 625 boats). Here a non-finite chain amount is dropped (it
 * reads as "no supply there"), never the payload.
 */
export function sanitizePayload(key: PharosVilleApiEndpointKey, data: unknown): unknown {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(`${key}: payload is not an object`);
  const rec = data as Record<string, unknown>;
  const arr = REQUIRED_ARRAY[key];
  if (arr && !Array.isArray(rec[arr])) throw new Error(`${key}: missing ${arr}[]`);
  if (key === "stress" && (rec.signals === null || typeof rec.signals !== "object")) throw new Error("stress: missing signals");
  if (key === "stablecoins") {
    rec.peggedAssets = (rec.peggedAssets as unknown[]).filter((a): a is Record<string, unknown> =>
      a !== null && typeof a === "object" && typeof (a as Record<string, unknown>).id === "string" && typeof (a as Record<string, unknown>).pegType === "string")
      .map((a) => {
        const cc = (a.chainCirculating ?? {}) as Record<string, { current?: unknown } | null>;
        const clean: Record<string, unknown> = {};
        for (const [c, v] of Object.entries(cc)) if (v && typeof v.current === "number" && Number.isFinite(v.current)) clean[c] = v;
        const circ = (a.circulating ?? {}) as Record<string, unknown>;
        const circClean: Record<string, number> = {};
        for (const [k, v] of Object.entries(circ)) if (typeof v === "number" && Number.isFinite(v)) circClean[k] = v;
        return { ...a, chainCirculating: clean, circulating: circClean, chains: Array.isArray(a.chains) ? a.chains : [], symbol: String(a.symbol ?? a.id), name: String(a.name ?? a.id) };
      });
  }
  return rec;
}

/** Same-origin GET with the freshness evidence of src/lib/api.ts (body _meta, X-Data-Age, Age, Warning). */
export const defaultFetcher: Fetcher = async (path, maxAgeSec, signal) => {
  if (!path.startsWith("/api/") || path.startsWith("//")) throw new Error(`not a same-origin /api/ path: ${path}`);
  const timeout = AbortSignal.timeout(15_000);
  const res = await fetch(path, { signal: AbortSignal.any([signal, timeout]), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const json = (await res.json()) as unknown;
  let meta: ApiMeta | null = null;
  let data = json;
  if (json && typeof json === "object" && !Array.isArray(json) && "_meta" in json) {
    const { _meta, ...rest } = json as Record<string, unknown>;
    meta = parseApiMeta(_meta);
    data = rest;
  }
  const dataAge = Number(res.headers.get("X-Data-Age") ?? NaN);
  const cacheAge = Math.max(0, Number(res.headers.get("Age")) || 0);
  if (meta || Number.isFinite(dataAge)) {
    const nowS = Math.floor(Date.now() / 1000);
    const ageSeconds = Math.max(Math.max(meta?.ageSeconds ?? 0, Number.isFinite(dataAge) ? dataAge : 0) + cacheAge, meta ? nowS - meta.updatedAt : 0);
    const cls = classifyFreshnessRatio(ageSeconds / Math.max(1, maxAgeSec));
    meta = {
      ...meta,
      updatedAt: Math.min(meta?.updatedAt ?? nowS, nowS - ageSeconds),
      ageSeconds,
      status: meta?.status === "stale" || cls === "stale" ? "stale" : meta?.status === "degraded" || cls === "degraded" ? "degraded" : "fresh",
    };
  }
  const warning = res.headers.get("Warning");
  if (warning && meta && meta.status === "fresh" && (/(?:^|,\s*)110\b/.test(warning) || /Response is (?:degraded|stale)/i.test(warning))) meta = { ...meta, status: "degraded", warning };
  return { data, meta };
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
  private timers = new Map<PharosVilleApiEndpointKey, unknown>();
  private errors = new Map<PharosVilleApiEndpointKey, number>();
  private listeners = new Set<(payloads: HarbourPayloads, key: PharosVilleApiEndpointKey) => void>();
  private abort = new AbortController();
  private running = false;
  private requests = new Map<PharosVilleApiEndpointKey, number>();

  constructor(opts: FeedOptions = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.isHidden = opts.isHidden ?? (() => typeof document !== "undefined" && document.visibilityState === "hidden");
  }

  /** Called after every endpoint update (success or failure). */
  subscribe(fn: (payloads: HarbourPayloads, key: PharosVilleApiEndpointKey) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Fetch everything now, then keep each endpoint on its own cadence. Resolves after the first round. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    await Promise.all(PHAROSVILLE_API_ENDPOINT_KEYS.map((k) => this.refresh(k)));
  }

  stop(): void {
    this.running = false;
    this.abort.abort();
    for (const h of this.timers.values()) this.clearTimer(h);
    this.timers.clear();
  }

  async refresh(key: PharosVilleApiEndpointKey): Promise<void> {
    const entry = PHAROSVILLE_ENDPOINT_REGISTRY[key];
    const request = (this.requests.get(key) ?? 0) + 1;
    this.requests.set(key, request);
    const abort = this.abort;
    const prev = this.payloads[key] as EndpointSnapshot<unknown> | undefined;
    let delay: number;
    try {
      const { data: raw, meta } = await this.fetcher(entry.path, entry.metaMaxAgeSec, abort.signal);
      if (!this.running || this.abort !== abort || this.requests.get(key) !== request) return;
      const data = sanitizePayload(key, raw);
      (this.payloads as Record<string, EndpointSnapshot<unknown>>)[key] = { data, meta, fetchedAtMs: this.now(), error: null };
      this.errors.delete(key);
      delay = nextRefreshDelayMs(key, meta);
    } catch (err) {
      if (!this.running || this.abort !== abort || this.requests.get(key) !== request) return;
      const n = this.errors.get(key) ?? 0;
      this.errors.set(key, n + 1);
      // keep the last good payload; record the failure
      (this.payloads as Record<string, EndpointSnapshot<unknown>>)[key] = {
        data: prev?.data ?? null, meta: prev?.meta ?? null, fetchedAtMs: prev?.fetchedAtMs ?? null,
        error: err instanceof Error ? err.message : String(err),
      };
      delay = ERROR_BACKOFF_MS[Math.min(n, ERROR_BACKOFF_MS.length - 1)];
    }
    for (const fn of this.listeners) fn(this.payloads, key);
    this.schedule(key, delay);
  }

  private schedule(key: PharosVilleApiEndpointKey, ms: number): void {
    if (!this.running) return;
    const old = this.timers.get(key);
    if (old != null) this.clearTimer(old);
    this.timers.set(key, this.setTimer(() => {
      this.timers.delete(key);
      if (!this.running) return;
      if (this.isHidden()) { this.schedule(key, MIN_REFRESH_MS); return; }
      void this.refresh(key);
    }, ms));
  }
}
