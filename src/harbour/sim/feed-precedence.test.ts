import { describe, expect, it, vi } from "vitest";
import { HarbourFeed, type Fetcher } from "../data/fetch";

const response = (id: string) => ({ data: { peggedAssets: [{ id, pegType: "peggedUSD", circulating: { peggedUSD: 1_000_000 }, chains: [] }] }, meta: null });
function pendingResponse() {
  let resolve!: (value: { data: unknown; meta: null }) => void, reject!: (error: Error) => void;
  const promise = new Promise<{ data: unknown; meta: null }>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

describe("feed revision precedence", () => {
  it.each([false, true])("ignores an older request settling after a newer installed snapshot (failure=%s)", async (fail) => {
    const older = pendingResponse(), newer = pendingResponse();
    let stableRequests = 0;
    const fetcher: Fetcher = async (path) => {
      if (path === "/api/stablecoins") return ++stableRequests === 1 ? older.promise : newer.promise;
      return { data: { chains: [], history: [], coins: [], signals: {}, grades: [], hourly: [] }, meta: null };
    };
    const feed = new HarbourFeed({ fetcher, setTimer: () => 0, clearTimer: () => {}, isHidden: () => false });
    const notify = vi.fn(); feed.subscribe(notify);
    const starting = feed.start(), refresh = feed.refresh("stablecoins");
    newer.resolve(response("newer")); await refresh;
    const snapshot = feed.payloads.stablecoins, notifications = notify.mock.calls.length;
    if (fail) older.reject(new Error("late failure")); else older.resolve(response("older"));
    await starting;
    expect(feed.payloads.stablecoins).toBe(snapshot);
    expect(feed.payloads.stablecoins?.data?.peggedAssets[0].id).toBe("newer");
    expect(notify).toHaveBeenCalledTimes(notifications);
    feed.stop();
  });

  it("ignores a response from a stopped lifecycle after restart", async () => {
    const old = pendingResponse(); let count = 0;
    const fetcher: Fetcher = async (path) => {
      if (path === "/api/stablecoins") return ++count === 1 ? old.promise : response("new lifecycle");
      return { data: { chains: [], history: [], coins: [], signals: {}, grades: [], hourly: [] }, meta: null };
    };
    const feed = new HarbourFeed({ fetcher, setTimer: () => 0, clearTimer: () => {}, isHidden: () => false });
    const first = feed.start(); feed.stop(); await feed.start();
    const snapshot = feed.payloads.stablecoins;
    old.resolve(response("old lifecycle")); await first;
    expect(feed.payloads.stablecoins).toBe(snapshot);
    feed.stop();
  });
});
