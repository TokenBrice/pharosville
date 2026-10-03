/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHAROSVILLE_API_ENDPOINT_KEYS, type PharosVilleApiEndpointKey } from "@shared/types/pharosville-endpoint-keys";
import {
  FAILED_RETAINED_FRESH_STRESS_QUERY, FRESH_META, MISSING_STRESS_QUERY, NOW_MS,
  PENDING_STRESS_QUERY, quietNormalInput,
} from "@/__fixtures__/data-contract-scenarios";
import { hasCompleteCurrentSources } from "@/systems/lamp-status";
import { worldRenderContentSignature } from "@/systems/world-render-content-signature";
import type { ApiQueryWithMetaResult } from "./use-api-query";
import { usePharosVilleWorldData } from "./use-pharosville-world-data";

const mocks = vi.hoisted(() => ({
  useStablecoins: vi.fn(), useChains: vi.fn(), useStabilityIndexDetail: vi.fn(),
  usePegSummary: vi.fn(), useStressSignals: vi.fn(), useSafetyGrades: vi.fn(), useMintBurnFlows: vi.fn(),
}));
vi.mock("@/hooks/use-stablecoins", () => ({ useStablecoins: mocks.useStablecoins }));
vi.mock("@/hooks/use-chains", () => ({ useChains: mocks.useChains }));
vi.mock("@/hooks/api-hooks", () => ({
  useStabilityIndexDetail: mocks.useStabilityIndexDetail, usePegSummary: mocks.usePegSummary,
  useStressSignals: mocks.useStressSignals, useSafetyGrades: mocks.useSafetyGrades, useMintBurnFlows: mocks.useMintBurnFlows,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ refetchQueries: vi.fn() }) }));
vi.mock("../error-reporter", () => ({ reportClientError: vi.fn() }));

type FeedStub = Pick<ApiQueryWithMetaResult<unknown>, "data" | "meta" | "error" | "isLoading" | "isError" | "isSuccess" | "observedNowMs">;
const hookByFeed = {
  stablecoins: mocks.useStablecoins, chains: mocks.useChains, stability: mocks.useStabilityIndexDetail,
  pegSummary: mocks.usePegSummary, stress: mocks.useStressSignals, safetyGrades: mocks.useSafetyGrades, mintBurn: mocks.useMintBurnFlows,
};
const input = quietNormalInput();
function landed(key: PharosVilleApiEndpointKey): FeedStub {
  return { data: input[key], meta: FRESH_META, error: null, isLoading: false, isError: false, isSuccess: true, observedNowMs: NOW_MS };
}
function setFeeds(overrides: Partial<Record<PharosVilleApiEndpointKey, FeedStub>> = {}, pendingOthers = false): void {
  for (const key of PHAROSVILLE_API_ENDPOINT_KEYS) hookByFeed[key].mockReturnValue(overrides[key] ?? (pendingOthers ? PENDING_STRESS_QUERY : landed(key)));
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW_MS); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

describe("source publication", () => {
  it("publishes honest states through essentials/grace/failure/late enrichment", () => {
    setFeeds({ stablecoins: landed("stablecoins"), chains: landed("chains") }, true);
    const { result, rerender } = renderHook(() => usePharosVilleWorldData());
    expect(result.current.world.routeMode).toBe("loading");
    expect(result.current.hasRenderableData).toBe(false);
    expect(result.current.world.freshness.stress.state).toBe("loading");
    expect(hasCompleteCurrentSources(result.current.world.freshness)).toBe(false);
    act(() => { vi.advanceTimersByTime(1_500); });
    const fleet = result.current.world.ships.map((ship) => ship.id);
    const berths = result.current.world.docks.map((dock) => dock.id);
    const selectedId = result.current.world.ships[0]!.detailId;
    expect(fleet.toSorted()).toEqual(input.stablecoins!.peggedAssets.map((asset) => asset.id).toSorted());
    expect(result.current.world.routeMode).toBe("world");
    expect(result.current.world.freshness.stablecoins.state).toBe("current");
    expect(result.current.world.freshness.chains.state).toBe("current");
    setFeeds({ stablecoins: landed("stablecoins"), chains: landed("chains"), stress: MISSING_STRESS_QUERY }, true);
    rerender();
    expect(result.current.world.freshness.stress.state).toBe("unavailable");
    expect(result.current.world.ships.map((ship) => ship.id)).toEqual(fleet);
    expect(result.current.world.docks.map((dock) => dock.id)).toEqual(berths);
    expect(result.current.world.detailIndex[selectedId]?.id).toBe(selectedId);
    expect(hasCompleteCurrentSources(result.current.world.freshness)).toBe(false);
    setFeeds(); rerender();
    expect(result.current.world.ships.map((ship) => ship.id)).toEqual(fleet);
    expect(result.current.world.detailIndex[selectedId]?.id).toBe(selectedId);
    expect(hasCompleteCurrentSources(result.current.world.freshness)).toBe(true);
  });

  it("updates source state while retaining last renderable geometry", () => {
    setFeeds();
    const { result, rerender } = renderHook(() => usePharosVilleWorldData());
    const fleet = result.current.world.ships.map((ship) => ship.id);
    const docks = result.current.world.docks.map((dock) => dock.id);
    const selectedId = result.current.world.ships[0]!.detailId;
    setFeeds({ stress: PENDING_STRESS_QUERY }); rerender();
    expect(result.current.world.routeMode).toBe("world");
    expect(result.current.world.freshness.stress.state).toBe("stale");
    expect(result.current.world.ships.every((ship) => ship.placementEvidence.stale)).toBe(true);
    expect(result.current.world.freshness.stress.observedAt).toBe(NOW_MS);
    setFeeds({ stablecoins: MISSING_STRESS_QUERY, stress: MISSING_STRESS_QUERY }); rerender();
    expect(result.current.world.ships.map((ship) => ship.id)).toEqual(fleet);
    expect(result.current.world.docks.map((dock) => dock.id)).toEqual(docks);
    expect(result.current.world.detailIndex[selectedId]?.id).toBe(selectedId);
    expect(result.current.world.freshness.stablecoins.state).toBe("stale");
    expect(result.current.world.freshness.stablecoins.publishedAt).toBe(NOW_MS);
    expect(hasCompleteCurrentSources(result.current.world.freshness)).toBe(false);
  });

  it("holds failed retained source independently of envelope freshness", () => {
    setFeeds({ stress: FAILED_RETAINED_FRESH_STRESS_QUERY });
    const { result, rerender } = renderHook(() => usePharosVilleWorldData());
    expect(result.current.world.freshness.stress).toMatchObject({ state: "stale", observedAt: NOW_MS });
    expect(result.current.world.freshness.stress.reason).toContain(FAILED_RETAINED_FRESH_STRESS_QUERY.error.message);
    expect(hasCompleteCurrentSources(result.current.world.freshness)).toBe(false);
    const newTime = NOW_MS + 60_000;
    const recovered = { ...input.stress!, updatedAt: newTime / 1_000, signals: Object.fromEntries(Object.entries(input.stress!.signals).map(([id, row]) => [id, { ...row, computedAt: newTime / 1_000 }])) };
    setFeeds({ stress: { ...landed("stress"), data: recovered, meta: { ...FRESH_META, updatedAt: newTime / 1_000 }, observedNowMs: newTime } });
    rerender();
    expect(result.current.world.freshness.stress).toMatchObject({ state: "current", observedAt: newTime, reason: null });
  });

  it.each(PHAROSVILLE_API_ENDPOINT_KEYS)("distinguishes %s's isolated staleness", (key) => {
    // Fresh metadata and original observation times on every untouched source.
    setFeeds({ [key]: { ...landed(key), meta: { ...FRESH_META, status: "stale" } } });
    const { result } = renderHook(() => usePharosVilleWorldData());
    for (const source of PHAROSVILLE_API_ENDPOINT_KEYS) expect(result.current.world.freshness[source].state).toBe(source === key ? "stale" : "current");
    expect(hasCompleteCurrentSources(result.current.world.freshness)).toBe(false);
  });

  it("does not rebuild the world or render content on a semantically unchanged observer tick", () => {
    setFeeds();
    const { result, rerender } = renderHook(() => usePharosVilleWorldData());
    const world = result.current.world;
    const signature = worldRenderContentSignature(world);
    setFeeds(Object.fromEntries(PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => [key, { ...landed(key), observedNowMs: NOW_MS + 30_000 }])));
    rerender();
    expect(result.current.world).toBe(world);
    expect(result.current.world.freshness).toBe(world.freshness);
    expect(worldRenderContentSignature(result.current.world)).toBe(signature);
  });

  it("confirms the harbour light on a second identical failed poll without new payloads or content", () => {
    setFeeds();
    const { result, rerender } = renderHook(() => usePharosVilleWorldData());
    expect(result.current.world.lampStatus).toBe("fresh");
    const failedPoll = () => ({ ...landed("stress"), error: new Error("offline"), isError: true, isSuccess: false });
    // A lone failure that recovers on the next poll never dims the light.
    setFeeds({ stress: failedPoll() }); rerender();
    setFeeds(); rerender();
    expect(result.current.world.lampStatus).toBe("fresh");
    setFeeds({ stress: failedPoll() }); rerender();
    // One failed poll is held by hysteresis; the record already says held.
    expect(result.current.world.freshness.stress.state).toBe("stale");
    expect(result.current.world.lampStatus).toBe("fresh");
    const heldFreshness = result.current.world.freshness;
    const signature = worldRenderContentSignature(result.current.world);
    setFeeds({ stress: failedPoll() }); rerender();
    expect(result.current.world.freshness).toBe(heldFreshness);
    expect(result.current.world.lampStatus).toBe("stale");
    expect(worldRenderContentSignature(result.current.world)).toBe(signature);
  });

  it("routes to error only when settled failures have no renderable payloads", () => {
    setFeeds(Object.fromEntries(PHAROSVILLE_API_ENDPOINT_KEYS.map((key) => [key, MISSING_STRESS_QUERY])));
    const { result } = renderHook(() => usePharosVilleWorldData());
    expect(result.current.world.routeMode).toBe("error");
    expect(result.current.hasRenderableData).toBe(false);
    expect(PHAROSVILLE_API_ENDPOINT_KEYS.every((key) => result.current.world.freshness[key].state === "unavailable")).toBe(true);
  });
});

