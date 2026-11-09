import {
  panelEndpointPath, PHAROSVILLE_PANEL_ENDPOINT_REGISTRY, PANEL_RESERVES_MAX_AGE_SEC, type PanelEndpointKey,
} from "@shared/lib/pharosville-panel-endpoints";
import { RUNTIME_ACTIVE_IDS } from "@shared/lib/stablecoins/runtime-active-ids";
import { FRESHNESS_RATIOS } from "@shared/lib/status-thresholds";
import { PHAROSVILLE_PANEL_SCHEMAS, type PanelPayload } from "@shared/types/pharosville-panels";
import type { ApiMeta } from "@shared/types/api-meta";
import { defaultFetcher, FeedError, type Fetcher } from "./fetch";

export type PanelReadingReason = "unverified-source" | "stale-fallback" | "source-stale" | "no-observation" | "invalid-payload" | "http" | "network";
export interface PanelReading<K extends PanelEndpointKey> {
  state: "current" | "stale" | "unavailable";
  reason: PanelReadingReason | null;
  sourceUpdatedAtMs: number | null;
  data: PanelPayload<K> | null;
}
interface Snapshot {
  data: unknown;
  meta: ApiMeta | null;
  staleFallback: boolean;
  fetchedAtMs: number;
}
interface Pending {
  controller: AbortController;
  readers: Set<symbol>;
  promise: Promise<Snapshot>;
}

function reading<K extends PanelEndpointKey>(key: K, id: string, snap: Snapshot, nowMs: number): PanelReading<K> {
  const data = snap.data as PanelPayload<K>;
  const result = (state: PanelReading<K>["state"], reason: PanelReadingReason | null, sourceUpdatedAtMs: number | null): PanelReading<K> => ({ state, reason, sourceUpdatedAtMs, data });
  const dated = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value >= 0 && value * 1000 <= nowMs;
  let sourceUpdatedAtMs = snap.meta && dated(snap.meta.updatedAt)
    ? Math.min(snap.meta.updatedAt * 1000, snap.fetchedAtMs - snap.meta.ageSeconds * 1000) : null;
  if (key === "stablecoinReserves") {
    const reserves = data as PanelPayload<"stablecoinReserves">;
    if (reserves.stablecoinId !== id || reserves.mode === "unavailable" || reserves.reserves.length === 0) return result("unavailable", "no-observation", null);
    sourceUpdatedAtMs = dated(reserves.liveAt) ? reserves.liveAt * 1000 : null;
    if (dated(reserves.sync?.lastSuccessAt) && sourceUpdatedAtMs != null) sourceUpdatedAtMs = Math.min(sourceUpdatedAtMs, reserves.sync.lastSuccessAt * 1000);
    if (snap.staleFallback) return result("stale", "stale-fallback", sourceUpdatedAtMs);
    if (reserves.mode === "live-stale" || reserves.sync?.stale) return result("stale", "source-stale", sourceUpdatedAtMs);
    if (reserves.mode !== "live" || reserves.estimated || reserves.provenance?.freshnessMode !== "verified" || sourceUpdatedAtMs == null) return result("unavailable", "unverified-source", sourceUpdatedAtMs);
    return nowMs - sourceUpdatedAtMs > PANEL_RESERVES_MAX_AGE_SEC * 1000
      ? result("stale", "source-stale", sourceUpdatedAtMs) : result("current", null, sourceUpdatedAtMs);
  }
  if (key === "dexLiquidity") {
    const row = (data as PanelPayload<"dexLiquidity">)[id];
    if (!row) return result("unavailable", "no-observation", null);
    if (!dated(row.updatedAt)) sourceUpdatedAtMs = null;
    else if (sourceUpdatedAtMs != null) sourceUpdatedAtMs = Math.min(sourceUpdatedAtMs, row.updatedAt * 1000);
  }
  if (snap.staleFallback) return result("stale", "stale-fallback", sourceUpdatedAtMs);
  if (sourceUpdatedAtMs == null) return result("unavailable", "unverified-source", null);
  const stale = snap.meta?.status === "stale" || nowMs - sourceUpdatedAtMs > PHAROSVILLE_PANEL_ENDPOINT_REGISTRY[key].metaMaxAgeSec * FRESHNESS_RATIOS.DEGRADED * 1000;
  return result(stale ? "stale" : "current", stale ? "source-stale" : null, sourceUpdatedAtMs);
}

/** No timers or prefetch: only the admitted coin-panel slot calls fetch(). */
export class PanelFetcher {
  private cache = new Map<string, Snapshot>();
  private pending = new Map<string, Pending>();
  constructor(private fetcher: Fetcher = defaultFetcher, private now: () => number = Date.now) {}

  async fetch<K extends PanelEndpointKey>(key: K, id: string, signal: AbortSignal): Promise<PanelReading<K>> {
    signal.throwIfAborted();
    const path = RUNTIME_ACTIVE_IDS.has(id) ? panelEndpointPath(key, id) : null;
    const unavailable = (reason: PanelReadingReason): PanelReading<K> => ({ state: "unavailable", reason, sourceUpdatedAtMs: null, data: null });
    if (!path) return unavailable("no-observation");
    const endpoint = PHAROSVILLE_PANEL_ENDPOINT_REGISTRY[key];
    const cached = this.cache.get(path);
    if (cached && this.now() - cached.fetchedAtMs < endpoint.cacheTtlSec * 1000) return reading(key, id, cached, this.now());
    this.cache.delete(path);
    let pending = this.pending.get(path);
    if (!pending) {
      const controller = new AbortController();
      const promise = (async () => {
        const response = await this.fetcher(path, endpoint.metaMaxAgeSec, controller.signal);
        controller.signal.throwIfAborted();
        const parsed = PHAROSVILLE_PANEL_SCHEMAS[key].safeParse(response.data);
        if (!parsed.success) throw new FeedError("Invalid panel reading", "invalid-payload");
        if (key === "stablecoinReserves" && (parsed.data as PanelPayload<"stablecoinReserves">).stablecoinId !== id) throw new FeedError("Panel subject mismatch", "invalid-payload");
        const snap = { data: parsed.data, meta: response.meta, staleFallback: response.staleFallback === true || /(?:^|,\s*)110\b/.test(response.meta?.warning ?? ""), fetchedAtMs: this.now() };
        if (!snap.staleFallback) this.cache.set(path, snap);
        return snap;
      })();
      pending = { controller, readers: new Set(), promise };
      this.pending.set(path, pending);
      const finished = () => { if (this.pending.get(path)?.promise === promise) this.pending.delete(path); };
      void promise.then(finished, finished);
    }
    const reader = Symbol();
    pending.readers.add(reader);
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    try {
      const snap = await Promise.race([pending.promise, aborted]);
      signal.throwIfAborted();
      return reading(key, id, snap, this.now());
    } catch (error) {
      signal.throwIfAborted();
      return unavailable(error instanceof FeedError && error.kind === "invalid-payload" ? "invalid-payload" : error instanceof FeedError && error.kind === "http" ? "http" : "network");
    } finally {
      signal.removeEventListener("abort", onAbort);
      pending.readers.delete(reader);
      if (pending.readers.size === 0 && this.pending.get(path) === pending) {
        pending.controller.abort();
        this.pending.delete(path);
      }
    }
  }
}

const visit = new PanelFetcher();
export const fetchPanelReading = <K extends PanelEndpointKey>(key: K, id: string, signal: AbortSignal): Promise<PanelReading<K>> => visit.fetch(key, id, signal);
