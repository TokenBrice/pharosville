import { describe, expect, it } from "vitest";
import type { ApiMeta } from "@shared/types/api-meta";
import { HarbourFeed, nextRefreshDelayMs, sanitizePayload, type Fetcher } from "./fetch";

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
  const feed = new HarbourFeed({ fetcher, now: () => now, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}, isHidden: () => false });
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
