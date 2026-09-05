/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PHAROSVILLE_API_CLIENT_CONTRACT } from "@shared/lib/pharosville-api-client-contract";
import { WORLD_ENDPOINT_KEYS } from "@shared/lib/pharosville-endpoint-registry";
import type { ApiMeta } from "@/lib/api";
import { useApiQueryWithMeta, usePharosVilleEndpointQuery } from "./use-api-query";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

const mockedUseQuery = vi.mocked(useQuery);
function wrapper({ children }: { children: ReactNode }) {
  return children;
}

describe("useApiQueryWithMeta", () => {
  beforeEach(() => {
    mockedUseQuery.mockClear();
  });

  afterEach(() => {
    mockedUseQuery.mockReset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("narrowly tracks tracked fields to avoid unnecessary background updates", () => {
    const wrapped = {
      data: {
        data: { title: "fixture" },
        meta: {
          ageSeconds: 12,
          status: "fresh",
          updatedAt: Math.floor(Date.now() / 1000) - 12,
        } satisfies ApiMeta,
      },
      error: null,
      isError: false,
      isLoading: false,
      isSuccess: true,
      refetch: vi.fn(),
    };
    mockedUseQuery.mockReturnValueOnce(wrapped as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useApiQueryWithMeta<{ title: string }>(["fixture"], "/api/chains", 5000), {
      wrapper,
    });

    expect(mockedUseQuery).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      data: wrapped.data.data,
      error: wrapped.error,
      isError: false,
      isLoading: false,
      isSuccess: true,
      meta: wrapped.data.meta,
      refetch: expect.any(Function),
    });
    expect(mockedUseQuery.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        notifyOnChangeProps: ["data", "error", "isLoading"],
      }),
    );
    expect(typeof result.current.refetch).toBe("function");
  });

  it("ages retained evidence on visible ticks, reassesses on return, and recovers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const wrapped = { data: { data: {}, meta: { updatedAt: 1_800_000_000, ageSeconds: 0, status: "fresh" } },
      error: new Error("offline"), isError: true, isLoading: false, isSuccess: false, refetch: vi.fn() };
    mockedUseQuery.mockReturnValue(wrapped as unknown as ReturnType<typeof useQuery>);
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

  it.each(WORLD_ENDPOINT_KEYS)("derives %s query options from the endpoint registry", (endpointKey) => {
    mockedUseQuery.mockReturnValueOnce({
      data: undefined,
      error: null,
      isError: false,
      isLoading: true,
      isSuccess: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>);

    renderHook(() => usePharosVilleEndpointQuery(endpointKey), { wrapper });

    const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT[endpointKey];
    expect(mockedUseQuery).toHaveBeenCalledTimes(1);
    expect(mockedUseQuery.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      queryKey: endpoint.queryKey,
      staleTime: endpoint.producerIntervalSec * 1000,
      refetchInterval: endpoint.producerIntervalSec * 2_000,
      // Every world endpoint opts into the last-good store, and every restored
      // entry must be refetched on mount however recently it was written.
      initialData: expect.any(Function),
      initialDataUpdatedAt: expect.any(Function),
      refetchOnMount: "always",
    }));
  });
});
