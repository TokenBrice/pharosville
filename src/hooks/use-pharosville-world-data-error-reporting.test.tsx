/* @vitest-environment jsdom */
// Query errors never reach the window handlers — TanStack Query owns them — so
// this covers the one path that puts a failed world feed on /_log.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportClientError } from "../error-reporter";
import { usePharosVilleWorldData } from "./use-pharosville-world-data";

const mocks = vi.hoisted(() => ({
  useStablecoins: vi.fn(),
  useChains: vi.fn(),
  useStabilityIndexDetail: vi.fn(),
  usePegSummary: vi.fn(),
  useStressSignals: vi.fn(),
  useReportCards: vi.fn(),
}));

vi.mock("@/hooks/use-stablecoins", () => ({ useStablecoins: mocks.useStablecoins }));
vi.mock("@/hooks/use-chains", () => ({ useChains: mocks.useChains }));
vi.mock("@/hooks/api-hooks", () => ({
  useStabilityIndexDetail: mocks.useStabilityIndexDetail,
  usePegSummary: mocks.usePegSummary,
  useStressSignals: mocks.useStressSignals,
  useReportCards: mocks.useReportCards,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ refetchQueries: vi.fn() }) }));
vi.mock("../error-reporter", () => ({ reportClientError: vi.fn() }));

const reportClientErrorMock = vi.mocked(reportClientError);

function setQueries(error: Error | null) {
  const idle = { data: undefined, error: null, isLoading: false, meta: null };
  for (const hook of Object.values(mocks)) hook.mockReturnValue(idle);
  mocks.useStablecoins.mockReturnValue({ ...idle, error });
}

describe("usePharosVilleWorldData error reporting", () => {
  beforeEach(() => {
    reportClientErrorMock.mockClear();
  });

  it("reports a failed feed under the data-load category", () => {
    const error = new Error("stablecoins: 502");
    setQueries(error);

    renderHook(() => usePharosVilleWorldData());

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
    const [category, payload, dedupeKey] = reportClientErrorMock.mock.calls[0]!;
    expect(category).toBe("data-load");
    expect(payload).toMatchObject({ kind: "world-data", message: "stablecoins: 502" });
    expect(dedupeKey).toBe("stablecoins: 502");
  });

  it("reports once across re-renders of the same error", () => {
    setQueries(new Error("stablecoins: 502"));

    const { rerender } = renderHook(() => usePharosVilleWorldData());
    rerender();
    rerender();

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
  });

  it("stays silent while every feed is healthy", () => {
    setQueries(null);

    renderHook(() => usePharosVilleWorldData());

    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });
});
