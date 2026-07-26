/* @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PHAROSVILLE_API_CLIENT_CONTRACT } from "@shared/lib/pharosville-api-client-contract";
import { WORLD_PAYLOAD_CACHE_INTERNALS as INTERNALS } from "@/lib/world-payload-cache";
import { usePharosVilleEndpointQuery } from "./use-api-query";

// Node's experimental `globalThis.localStorage` shadows jsdom's, so this suite
// installs the store it needs instead of assuming a global.
function createFakeStorage(): Storage & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
  } as Storage & { entries: Map<string, string> };
}

const NOW = 1_800_000_000_000;
const CHAINS_PAYLOAD = {
  chains: [],
  globalTotalUsd: 42,
  chainAttributedTotalUsd: 42,
  unattributedTotalUsd: 0,
  globalChange24hPct: 0,
  globalChange7dPct: 0,
  globalChange30dPct: 0,
  updatedAt: 1_799_999_000,
  healthMethodologyVersion: "v1",
};

let storage: ReturnType<typeof createFakeStorage>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  storage = createFakeStorage();
  vi.stubGlobal("localStorage", storage);
  vi.setSystemTime(NOW);
  // A request that never settles: anything the hook reports can only have come
  // from the last-good store.
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  INTERNALS.resetPersistThrottle();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("usePharosVilleEndpointQuery restore", () => {
  it("renders the world's data on the first render, before any response arrives", () => {
    storage.setItem(INTERNALS.storageKey("chains"), JSON.stringify({
      v: INTERNALS.STORE_VERSION,
      storedAt: NOW - 60_000,
      meta: { updatedAt: Math.floor(NOW / 1000) - 90, ageSeconds: 90, status: "fresh" },
      data: CHAINS_PAYLOAD,
    }));

    const renders: { hasData: boolean; status: string | undefined; isLoading: boolean }[] = [];
    renderHook(() => {
      const query = usePharosVilleEndpointQuery("chains");
      renders.push({
        hasData: query.data !== undefined,
        status: query.meta?.status,
        isLoading: query.isLoading,
      });
      return query;
    }, { wrapper });

    expect(renders[0]).toEqual({ hasData: true, status: "degraded", isLoading: false });
  });

  it("presents restored data as stale, never as fresh, however fresh it was when stored", () => {
    storage.setItem(INTERNALS.storageKey("chains"), JSON.stringify({
      v: INTERNALS.STORE_VERSION,
      storedAt: NOW - 1_000,
      meta: { updatedAt: Math.floor(NOW / 1000), ageSeconds: 0, status: "fresh" },
      data: CHAINS_PAYLOAD,
    }));

    const { result } = renderHook(() => usePharosVilleEndpointQuery("chains"), { wrapper });

    expect(result.current.data).toEqual(CHAINS_PAYLOAD);
    expect(result.current.meta?.status).not.toBe("fresh");
    expect(result.current.meta?.warning).toContain("110");
  });

  it("leaves the query loading when the store holds nothing usable", () => {
    storage.setItem(INTERNALS.storageKey("chains"), JSON.stringify({
      v: INTERNALS.STORE_VERSION + 1,
      storedAt: NOW - 1_000,
      meta: null,
      data: CHAINS_PAYLOAD,
    }));

    const { result } = renderHook(() => usePharosVilleEndpointQuery("chains"), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it("marks the restored query stale so the real refetch starts straight away", () => {
    storage.setItem(INTERNALS.storageKey("chains"), JSON.stringify({
      v: INTERNALS.STORE_VERSION,
      storedAt: NOW - 60_000,
      meta: null,
      data: CHAINS_PAYLOAD,
    }));

    renderHook(() => usePharosVilleEndpointQuery("chains"), { wrapper });

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      PHAROSVILLE_API_CLIENT_CONTRACT.chains.path,
      expect.anything(),
    );
  });
});
