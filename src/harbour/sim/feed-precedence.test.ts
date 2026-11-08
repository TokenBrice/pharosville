import { describe, expect, it, vi } from "vitest";
import { HarbourFeed, type Fetcher } from "../data/fetch";

const response = (id: string) => ({ data: { peggedAssets: [{ id, pegType: "peggedUSD", circulating: { peggedUSD: 1_000_000 }, chains: [] }] }, meta: null });
function pendingResponse() {
  let resolve!: (value: { data: unknown; meta: null }) => void, reject!: (error: Error) => void;
  const promise = new Promise<{ data: unknown; meta: null }>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

describe("feed single-flight and lifecycle precedence", () => {
  it.each([false, true])("shares the pending request, then installs a later refresh (failure=%s)", async (fail) => {
    const first = pendingResponse(), next = pendingResponse();
    let stableRequests = 0;
    const fetcher: Fetcher = async (path) => {
      if (path === "/api/stablecoins") return ++stableRequests === 1 ? first.promise : next.promise;
      return { data: { chains: [], current: null, history: [], coins: [], signals: {}, grades: [], hourly: [] }, meta: null };
    };
    const feed = new HarbourFeed({ fetcher, setTimer: () => 0, clearTimer: () => {}, isHidden: () => false });
    const notify = vi.fn(); feed.subscribe(notify);
    const starting = feed.start(), refresh = feed.refresh("stablecoins");
    expect(feed.refresh("stablecoins")).toBe(refresh);
    expect(stableRequests).toBe(1);
    if (fail) first.reject(new Error("first failure")); else first.resolve(response("first"));
    await refresh; await starting;
    const notifications = notify.mock.calls.length;
    const later = feed.refresh("stablecoins");
    expect(stableRequests).toBe(2);
    next.resolve(response("newer")); await later;
    expect(feed.payloads.stablecoins?.data?.peggedAssets[0].id).toBe("newer");
    expect(notify).toHaveBeenCalledTimes(notifications + 1);
    feed.stop();
  });

  it.each([false, true])("ignores a response from a stopped lifecycle after restart (failure=%s)", async (fail) => {
    const old = pendingResponse(); let count = 0;
    const fetcher: Fetcher = async (path) => {
      if (path === "/api/stablecoins") return ++count === 1 ? old.promise : response("new lifecycle");
      return { data: { chains: [], history: [], coins: [], signals: {}, grades: [], hourly: [] }, meta: null };
    };
    const feed = new HarbourFeed({ fetcher, setTimer: () => 0, clearTimer: () => {}, isHidden: () => false });
    const first = feed.start(); feed.stop(); await feed.start();
    const snapshot = feed.payloads.stablecoins;
    if (fail) old.reject(new Error("old lifecycle failure")); else old.resolve(response("old lifecycle"));
    await first;
    expect(feed.payloads.stablecoins).toBe(snapshot);
    feed.stop();
  });
});
