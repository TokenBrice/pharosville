import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHAROSVILLE_API_CLIENT_CONTRACT } from "@shared/lib/pharosville-api-client-contract";
import { PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY } from "@shared/lib/pharosville-api-endpoints";
import type { PharosVilleApiEndpointKey } from "@shared/types/pharosville";
import { usePegSummary, useReportCards, useStabilityIndexDetail, useStressSignals } from "./api-hooks";
import { useApiQueryWithMeta } from "./use-api-query";
import { useChains } from "./use-chains";
import { useStablecoins } from "./use-stablecoins";

vi.mock("./use-api-query", () => ({
  useApiQueryWithMeta: vi.fn(() => ({ data: undefined, meta: null })),
}));

const mockedUseApiQueryWithMeta = vi.mocked(useApiQueryWithMeta);

describe("PharosVille API hooks", () => {
  beforeEach(() => {
    mockedUseApiQueryWithMeta.mockClear();
  });

  it.each([
    {
      hook: useStablecoins,
      key: "stablecoins",
      queryKey: ["stablecoins"],
    },
    {
      hook: useChains,
      key: "chains",
      queryKey: ["chains"],
    },
    {
      hook: useStabilityIndexDetail,
      key: "stability",
      queryKey: ["stability-index-detail"],
    },
    {
      hook: usePegSummary,
      key: "pegSummary",
      queryKey: ["peg-summary"],
    },
    {
      hook: useStressSignals,
      key: "stress",
      queryKey: ["stress-signals"],
    },
    {
      hook: useReportCards,
      key: "reportCards",
      queryKey: ["report-cards"],
    },
  ] satisfies Array<{
    hook: () => unknown;
    key: PharosVilleApiEndpointKey;
    queryKey: string[];
  }>)("derives $key path and freshness metadata from the lightweight client contract", ({ hook, key, queryKey }) => {
    const endpoint = PHAROSVILLE_API_CLIENT_CONTRACT[key];

    expect(endpoint.path).toBe(PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY[key]);

    hook();

    expect(mockedUseApiQueryWithMeta).toHaveBeenCalledTimes(1);
    expect(mockedUseApiQueryWithMeta).toHaveBeenCalledWith(
      endpoint.queryKey,
      PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY[key],
      endpoint.producerIntervalSec * 1000,
      {
        metaMaxAgeSec: endpoint.metaMaxAgeSec,
      },
    );
    expect(endpoint.queryKey).toEqual(queryKey);
  });
});
