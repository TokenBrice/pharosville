/* @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ApiMeta } from "@/lib/api";
import { useApiQueryWithMeta } from "./use-api-query";

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
  });

  it("narrowly tracks tracked fields to avoid unnecessary background updates", () => {
    const wrapped = {
      data: {
        data: { title: "fixture" },
        meta: {
          ageSeconds: 12,
          status: "fresh",
          updatedAt: 1_700_000_000,
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
});
