import { afterEach, describe, expect, it, vi } from "vitest";
import { endpointProjector, type ProjectionJson } from "../../../functions/api/_project";
import { upstreamFixtures, TRUTH_NOW } from "../__fixtures__/projection";
import { endpointTruth } from "../model/truth";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import type { EndpointKey } from "../model/types";
import type { ApiMeta } from "@shared/types/api-meta";
import { defaultFetcher, FeedError, HarbourFeed, nextRefreshDelayMs, retryAfterMs, sanitizePayload, type Fetcher } from "./fetch";

function harness(respond: (path: string, call: number) => { data: unknown; meta: ApiMeta | null } | Error) {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const calls: string[] = [];
  let now = 1_000_000;
  const fetcher: Fetcher = async (path) => {
    calls.push(path);
    const r = respond(path, calls.filter((c) => c === path).length);
    if (r instanceof Error) throw r;
    return r;
  };
  const feed = new HarbourFeed({ fetcher, now: () => now, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}, isHidden: () => false, random: () => 0.5 });
  return { feed, timers, calls, advance: (ms: number) => { now += ms; } };
}

const meta = (age = 60): ApiMeta => ({ updatedAt: 1000, ageSeconds: age, status: "fresh" });
const ok = (path: string) => ({
  data: path.startsWith("/api/stablecoins") ? { peggedAssets: [] } : path.startsWith("/api/chains") ? { chains: [] }
    : path.startsWith("/api/stability") ? { history: [], current: null } : path.startsWith("/api/peg-summary") ? { coins: [] }
    : path.startsWith("/api/stress") ? { signals: {} } : path.startsWith("/api/safety") ? { grades: [] } : { hourly: [] },
  meta: meta(),
});

describe("HarbourFeed", () => {
  it("fetches the seven same-origin endpoints once each, then schedules refreshes", async () => {
    const h = harness((p) => ok(p));
    await h.feed.start();
    expect(h.calls.sort()).toEqual(["/api/chains", "/api/mint-burn-flows", "/api/peg-summary", "/api/safety-grades", "/api/stability-index?detail=true", "/api/stablecoins", "/api/stress-signals"]);
    expect(h.calls.every((c) => c.startsWith("/api/"))).toBe(true);
    expect(h.timers).toHaveLength(7);
    for (const t of h.timers) { expect(t.ms).toBeGreaterThanOrEqual(60_000); expect(t.ms).toBeLessThanOrEqual(1800_000); }
    expect(Object.keys(h.feed.payloads)).toHaveLength(7);
    expect(h.feed.payloads.stablecoins?.fetchedAtMs).toBe(1_000_000);
  });

  it("keeps the last good payload when a refresh fails, and backs off", async () => {
    let fail = false;
    const h = harness((p) => (fail && p === "/api/stablecoins" ? new Error("HTTP 503") : ok(p)));
    await h.feed.start();
    const good = h.feed.payloads.stablecoins!.data;
    fail = true;
    h.advance(900_000);
    await h.feed.refresh("stablecoins");
    expect(h.feed.payloads.stablecoins!.data).toBe(good);
    expect(h.feed.payloads.stablecoins!.fetchedAtMs).toBe(1_000_000); // age keeps growing → turns stale
    expect(h.feed.payloads.stablecoins!.error).toMatch(/503/);
    expect(h.timers[h.timers.length - 1].ms).toBe(30_000);
  });

  it("polls just after the producer's next write, within [1 min, one interval]", () => {
    expect(nextRefreshDelayMs("stablecoins", meta(60))).toBe(900_000 - 60_000 + 45_000);
    expect(nextRefreshDelayMs("stablecoins", meta(890))).toBe(60_000);
    expect(nextRefreshDelayMs("stablecoins", null)).toBe(450_000);
  });

  it("tolerates null chain amounts instead of dropping the whole fleet", () => {
    const out = sanitizePayload("stablecoins", { peggedAssets: [
      { id: "a", name: "A", symbol: "A", pegType: "peggedUSD", circulating: { peggedUSD: 5 }, chainCirculating: { Arbitrum: { current: null }, Base: { current: 5 } }, chains: ["Base"] },
      { nope: true },
    ] }) as { peggedAssets: Array<{ id: string; chainCirculating: Record<string, unknown> }> };
    expect(out.peggedAssets.map((a) => a.id)).toEqual(["a"]);
    expect(Object.keys(out.peggedAssets[0].chainCirculating)).toEqual(["Base"]);
    expect(() => sanitizePayload("chains", { nope: 1 })).toThrow();
  });
});

describe("source evidence at the fetch boundary", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  const controller = new AbortController();
  it.each([{}, { Age: "60" }, { "X-Data-Age": "-1" }, { "X-Data-Age": "NaN" }, { "X-Data-Age": "" }, { "X-Data-Age": "Infinity" }])("does not invent source freshness from %j", async (headers) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ coins: [] }, { headers })));
    expect((await defaultFetcher("/api/peg-summary", 900, controller.signal)).meta).toBeNull();
  });
  it("keeps Warning 110 outside metadata, and treats even a young dated fallback as stale", async () => {
    vi.spyOn(Date, "now").mockReturnValue(TRUTH_NOW);
    for (const dated of [false, true]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ coins: [], ...(dated ? { _meta: { updatedAt: TRUTH_NOW / 1000 - 5, ageSeconds: 5, status: "fresh" } } : {}) }, { headers: { Warning: '110 - "Response is stale"' } })));
      const result = await defaultFetcher("/api/peg-summary", 900, controller.signal);
      expect(result.staleFallback).toBe(true);
      expect(endpointTruth("pegSummary", { ...result, fetchedAtMs: TRUTH_NOW }, TRUTH_NOW)).toMatchObject({ state: "stale", reason: "stale-fallback", ageSec: dated ? 5 : null });
    }
  });
  it("combines source/header/cache age once and preserves ordinary input degradation", async () => {
    vi.spyOn(Date, "now").mockReturnValue(TRUTH_NOW);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ _meta: { updatedAt: TRUTH_NOW / 1000 - 20, ageSeconds: 20, status: "degraded" } }, { headers: { "X-Data-Age": "40", Age: "10" } })));
    const result = await defaultFetcher("/api/peg-summary", 900, controller.signal);
    expect(result.meta).toMatchObject({ ageSeconds: 50, updatedAt: TRUTH_NOW / 1000 - 50, status: "degraded" });
    expect(endpointTruth("pegSummary", { ...result, fetchedAtMs: TRUTH_NOW }, TRUTH_NOW).state).toBe("current");
  });
  it.each([-1, NaN, Infinity])("rejects malformed source ages: %s", async (ageSeconds) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ _meta: { updatedAt: TRUTH_NOW / 1000, ageSeconds, status: "fresh" } })));
    expect((await defaultFetcher("/api/peg-summary", 900, controller.signal)).meta).toBeNull();
  });
  it("preserves HTTP status and Retry-After in typed failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429, headers: { "Retry-After": "120" } })));
    await expect(defaultFetcher("/api/chains", 900, controller.signal)).rejects.toMatchObject({ kind: "http", status: 429, retryAfter: "120" });
  });
  it("times out a stalled body and releases its timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start() {} }))));
    const pending = defaultFetcher("/api/chains", 900, controller.signal);
    const checked = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(15_000); await checked;
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["https://api.pharos.watch/api/chains", "//api.pharos.watch/api/chains", "/api/../health"])("rejects paths outside the same-origin API: %s", async (path) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(defaultFetcher(path, 900, controller.signal)).rejects.toMatchObject({ kind: "invalid-payload" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("malformed enrichment containment", () => {
  const bad: Array<[EndpointKey, ProjectionJson]> = [
    ["pegSummary", { coins: [null] }], ["safetyGrades", { grades: [null] }], ["chains", { chains: [null] }],
    ["stress", { signals: [] }], ["stress", { signals: { a: { score: "90", band: "ALERT" } } }],
    ["mintBurn", { hourly: [{ hourTs: 1, netFlowUsd: "bad", mintVolumeUsd: 1, burnVolumeUsd: 1 }] }],
    ["mintBurn", { hourly: [], coins: [null] }], ["mintBurn", { hourly: [], scope: [] }],
    ["stability", { history: [], current: { score: 90, band: "BEDROCK", inputDegradation: { dewsUnavailable: "true" } } }],
  ];
  it.each(bad)("rejects the entire %s snapshot, then accepts the next good refresh", async (key, body) => {
    const good = endpointProjector(key)(upstreamFixtures()[key]);
    let response: unknown = good;
    const h = harness((path) => path === PHAROSVILLE_ENDPOINT_REGISTRY[key].path ? { data: response, meta: meta() } : ok(path));
    await h.feed.start();
    const saved = h.feed.payloads[key]!.data;
    response = endpointProjector(key)(body);
    await h.feed.refresh(key);
    expect(h.feed.payloads[key]).toMatchObject({ data: saved, failureKind: "invalid-payload", failureStreak: 1, nextRetryAtMs: 1_600_000 });
    expect(h.feed.payloads[key]!.data).toBe(saved);
    response = good;
    await h.feed.refresh(key);
    expect(h.feed.payloads[key]).toMatchObject({ failureKind: null, failureStreak: 0, error: null, nextRetryAtMs: null });
    h.feed.stop();
  });
  it("rejects non-finite values and arrays masquerading as containers", () => {
    expect(() => sanitizePayload("chains", { chains: [{ id: "a", name: "A", totalUsd: Infinity }] })).toThrow(FeedError);
    expect(() => sanitizePayload("pegSummary", { coins: [{ id: "a", currentDeviationBps: NaN, activeDepeg: false }] })).toThrow(FeedError);
    expect(() => sanitizePayload("stability", { history: [], current: [] })).toThrow(FeedError);
    expect(() => sanitizePayload("mintBurn", { hourly: [{ hourTs: 0, netFlowUsd: 0, mintVolumeUsd: -1, burnVolumeUsd: 0 }] })).toThrow(FeedError);
    expect(sanitizePayload("stress", { signals: { a: null } })).toEqual({ signals: { a: null } });
  });
});

describe("classified retry lifecycle", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it.each([0, 1])("jitters backoff by ±20%% and caps it at ten minutes (random=%s)", async (random) => {
    let fail = false;
    const timers: number[] = [];
    const feed = new HarbourFeed({ random: () => random, fetcher: async (path) => { if (fail) throw new FeedError("network", "network"); return ok(path); }, setTimer: (_fn, ms) => { timers.push(ms); return 0; }, clearTimer: () => {} });
    await feed.start(); fail = true;
    for (let n = 0; n < 7; n++) {
      await feed.refresh("stablecoins");
      expect(timers.at(-1)).toBe(Math.min(600_000, [30_000, 60_000, 120_000, 300_000, 600_000, 600_000, 600_000][n] * (random ? 1.2 : 0.8)));
      expect(feed.payloads.stablecoins?.failureStreak).toBe(n + 1);
    }
    feed.stop();
  });
  it("parses Retry-After seconds/dates, rejects malformed values and caps at an hour", () => {
    expect(retryAfterMs("120", TRUTH_NOW)).toBe(120_000);
    expect(retryAfterMs(new Date(TRUTH_NOW + 120_000).toUTCString(), TRUTH_NOW)).toBe(120_000);
    expect(retryAfterMs("99999", TRUTH_NOW)).toBe(3600_000);
    for (const value of [null, "", "-1", "1.5", "tomorrow", "Infinity", new Date(TRUTH_NOW - 1000).toUTCString()]) expect(retryAfterMs(value, TRUTH_NOW)).toBeNull();
  });
  it.each([429, 503])("respects HTTP %s Retry-After on wake; refreshes only failed/due endpoints and removes listeners", async (status) => {
    vi.useFakeTimers(); vi.setSystemTime(TRUTH_NOW);
    const win = new EventTarget(), doc = new EventTarget();
    const removeWin = vi.spyOn(win, "removeEventListener"), removeDoc = vi.spyOn(doc, "removeEventListener");
    let fail = false, hidden = false;
    const calls: string[] = [];
    const feed = new HarbourFeed({ windowTarget: win, documentTarget: doc, isHidden: () => hidden, isOnline: () => true, fetcher: async (path) => {
      calls.push(path); if (fail && path === "/api/stablecoins") throw new FeedError("limited", "http", status, "120"); return ok(path);
    } });
    await feed.start(); fail = true; await feed.refresh("stablecoins");
    expect(feed.payloads.stablecoins?.nextRetryAtMs).toBe(TRUTH_NOW + 120_000);
    for (const event of [new Event("online"), new Event("visibilitychange")]) { win.dispatchEvent(event); doc.dispatchEvent(event); }
    await Promise.resolve(); expect(calls).toHaveLength(8);
    hidden = true; await vi.advanceTimersByTimeAsync(120_000); expect(calls).toHaveLength(8);
    hidden = false; fail = false; doc.dispatchEvent(new Event("visibilitychange")); win.dispatchEvent(new Event("online"));
    await Promise.resolve(); await Promise.resolve();
    expect(calls).toHaveLength(9);
    expect(feed.payloads.stablecoins?.failureKind).toBeNull();
    feed.stop();
    expect(removeWin).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeDoc).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    win.dispatchEvent(new Event("online")); expect(calls).toHaveLength(9);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shares one promise per endpoint across timer, explicit and wake refreshes", async () => {
    let resolve!: (value: Awaited<ReturnType<Fetcher>>) => void;
    const pending = new Promise<Awaited<ReturnType<Fetcher>>>((r) => { resolve = r; });
    let slow = false;
    const fetcher = vi.fn(async (path: string) => slow && path === "/api/stablecoins" ? pending : ok(path));
    const feed = new HarbourFeed({ fetcher, setTimer: () => 0, clearTimer: () => {} });
    await feed.start(); slow = true;
    const first = feed.refresh("stablecoins"), second = feed.refresh("stablecoins");
    expect(first).toBe(second); expect(fetcher).toHaveBeenCalledTimes(8);
    resolve(ok("/api/stablecoins")); await first; feed.stop();
  });
  it("pauses offline attempts, retries overdue sources on reconnect, and leaves source age alone", async () => {
    vi.useFakeTimers(); vi.setSystemTime(TRUTH_NOW);
    let online = true;
    const win = new EventTarget();
    const fetcher = vi.fn(async (path: string) => ok(path));
    const feed = new HarbourFeed({ fetcher, windowTarget: win, isOnline: () => online, isHidden: () => false });
    await feed.start(); online = false;
    const saved = feed.payloads.stablecoins;
    await vi.advanceTimersByTimeAsync(900_000);
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(feed.payloads.stablecoins).toBe(saved);
    online = true; win.dispatchEvent(new Event("online"));
    await Promise.resolve(); await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(11); // the four 15-minute producers, no healthy 30-minute refresh
    feed.stop(); expect(vi.getTimerCount()).toBe(0);
  });
});
