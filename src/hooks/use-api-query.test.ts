/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ApiMeta } from "@/lib/api";
import { useApiQueryWithMeta } from "./use-api-query";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { NOW_MS, quietNormalInput } from "@/__fixtures__/data-contract-scenarios";
import { classifyPharosVilleSource } from "./use-pharosville-world-data";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

const mockedUseQuery = vi.mocked(useQuery);

describe("useApiQueryWithMeta", () => {
  beforeEach(() => {
    mockedUseQuery.mockClear();
  });

  afterEach(() => {
    mockedUseQuery.mockReset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });


  it("ages retained evidence on visible ticks, reassesses on return, and recovers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const wrapped = { data: { data: {}, meta: { updatedAt: 1_800_000_000, ageSeconds: 0, status: "fresh" } },
      error: new Error("offline"), isError: true, isLoading: false, isSuccess: false, refetch: vi.fn() };
    mockedUseQuery.mockReturnValue(wrapped as unknown as UseQueryResult);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { result, rerender, unmount } = renderHook(() => useApiQueryWithMeta(["fixture"], "/api/fixture", 1_000));
    expect(result.current.meta?.status).toBe("fresh");
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current.meta?.status).toBe("stale");
    visibility.mockReturnValue("hidden");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current.meta?.ageSeconds).toBe(30);
    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.meta?.ageSeconds).toBe(90);
    wrapped.data.meta = { updatedAt: 1_800_000_090, ageSeconds: 0, status: "fresh" };
    rerender();
    expect(result.current.meta?.status).toBe("fresh");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ages rows on visible tick and resume without renewing observations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    const endpoint = PHAROSVILLE_ENDPOINT_REGISTRY.stress;
    const rowSec = NOW_MS / 1_000 - endpoint.metaMaxAgeSec * 8 + 10;
    const source = quietNormalInput().stress!;
    const data = { ...source, signals: Object.fromEntries(Object.entries(source.signals).map(([id, row]) => [id, { ...row, computedAt: rowSec }])) };
    const wrapped = {
      data: { data, meta: { updatedAt: NOW_MS / 1_000, ageSeconds: 0, status: "fresh" } satisfies ApiMeta },
      error: null, isError: false, isLoading: false, isSuccess: true, refetch: vi.fn(),
    };
    mockedUseQuery.mockReturnValue(wrapped as unknown as UseQueryResult);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { result, unmount } = renderHook(() => {
      const query = useApiQueryWithMeta<typeof data>(endpoint.queryKey, endpoint.path, endpoint.producerIntervalSec * 1_000, { metaMaxAgeSec: endpoint.metaMaxAgeSec });
      return { query, status: classifyPharosVilleSource("stress", query) };
    });
    expect(result.current.status).toMatchObject({ state: "current", observedAt: rowSec * 1_000 });
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current.query.meta?.status).toBe("fresh");
    expect(result.current.status).toMatchObject({ state: "stale", observedAt: rowSec * 1_000 });
    visibility.mockReturnValue("hidden");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current.query.observedNowMs).toBe(NOW_MS + 30_000);
    // A new envelope does not change the retained rows' observation times.
    wrapped.data.meta = { updatedAt: (NOW_MS + 90_000) / 1_000, ageSeconds: 0, status: "fresh" };
    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.query.observedNowMs).toBe(NOW_MS + 90_000);
    expect(result.current.query.meta?.status).toBe("fresh");
    expect(result.current.status).toMatchObject({ state: "stale", observedAt: rowSec * 1_000 });
    expect(result.current.query.data!.signals[Object.keys(data.signals)[0]!]!.computedAt).toBe(rowSec);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

});
