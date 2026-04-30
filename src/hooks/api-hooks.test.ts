import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHAROSVILLE_API_CONTRACT } from "@shared/lib/pharosville-api-contract";
import { PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY } from "@shared/lib/pharosville-api-endpoints";
import type { PharosVilleApiEndpointKey } from "@shared/types/pharosville";
import { CRON_15MIN, CRON_30MIN } from "@/lib/cron-intervals";
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
      cronInterval: CRON_15MIN,
      hook: useStablecoins,
      key: "stablecoins",
      queryKey: ["stablecoins"],
    },
    {
      cronInterval: CRON_15MIN,
      hook: useChains,
      key: "chains",
      queryKey: ["chains"],
    },
    {
      cronInterval: CRON_30MIN,
      hook: useStabilityIndexDetail,
      key: "stability",
      queryKey: ["stability-index-detail"],
    },
    {
      cronInterval: CRON_15MIN,
      hook: usePegSummary,
      key: "pegSummary",
      queryKey: ["peg-summary"],
    },
    {
      cronInterval: CRON_30MIN,
      hook: useStressSignals,
      key: "stress",
      queryKey: ["stress-signals"],
    },
    {
      cronInterval: CRON_15MIN,
      hook: useReportCards,
      key: "reportCards",
      queryKey: ["report-cards"],
    },
  ] satisfies Array<{
    cronInterval: number;
    hook: () => unknown;
    key: PharosVilleApiEndpointKey;
    queryKey: string[];
  }>)("derives $key path and schema from the shared PharosVille contract", ({ cronInterval, hook, key, queryKey }) => {
    const endpoint = PHAROSVILLE_API_CONTRACT[key];

    expect(endpoint.path).toBe(PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY[key]);

    hook();

    expect(mockedUseApiQueryWithMeta).toHaveBeenCalledTimes(1);
    expect(mockedUseApiQueryWithMeta).toHaveBeenCalledWith(
      queryKey,
      PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY[key],
      cronInterval,
      {
        schema: endpoint.schema,
        metaMaxAgeSec: endpoint.metaMaxAgeSec,
      },
    );
  });
});
