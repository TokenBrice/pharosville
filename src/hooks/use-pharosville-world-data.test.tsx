/* @vitest-environment jsdom */
// The hook that owns route mode, the enrichment grace timer, the last-complete
// world hold and the signature memo. Its error-reporting path is covered
// separately in use-pharosville-world-data-error-reporting.test.tsx; this suite
// covers the publishing decisions themselves, which had no test at all.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fixtureChains,
  fixtureMintBurn,
  fixturePegSummary,
  fixtureReportCards,
  fixtureStability,
  fixtureStablecoins,
  fixtureStress,
} from "@/__fixtures__/pharosville-world";
import type { ApiMeta } from "@/lib/api";
import { usePharosVilleWorldData } from "./use-pharosville-world-data";

const mocks = vi.hoisted(() => ({
  useStablecoins: vi.fn(),
  useChains: vi.fn(),
  useStabilityIndexDetail: vi.fn(),
  usePegSummary: vi.fn(),
  useStressSignals: vi.fn(),
  useReportCards: vi.fn(),
  useMintBurnFlows: vi.fn(),
}));

vi.mock("@/hooks/use-stablecoins", () => ({ useStablecoins: mocks.useStablecoins }));
vi.mock("@/hooks/use-chains", () => ({ useChains: mocks.useChains }));
vi.mock("@/hooks/api-hooks", () => ({
  useStabilityIndexDetail: mocks.useStabilityIndexDetail,
  usePegSummary: mocks.usePegSummary,
  useStressSignals: mocks.useStressSignals,
  useReportCards: mocks.useReportCards,
  useMintBurnFlows: mocks.useMintBurnFlows,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ refetchQueries: vi.fn() }) }));
vi.mock("../error-reporter", () => ({ reportClientError: vi.fn() }));

type Feed = "chains" | "mintBurn" | "pegSummary" | "reportCards" | "stability" | "stablecoins" | "stress";

interface FeedStub {
  data: unknown;
  error: Error | null;
  isLoading: boolean;
  meta: ApiMeta | null;
}

const FRESH: ApiMeta = { updatedAt: 1_700_000_000, ageSeconds: 60, status: "fresh" };

const hookByFeed: Record<Feed, { mockReturnValue: (value: FeedStub) => unknown }> = {
  chains: mocks.useChains,
  mintBurn: mocks.useMintBurnFlows,
  pegSummary: mocks.usePegSummary,
  reportCards: mocks.useReportCards,
  stability: mocks.useStabilityIndexDetail,
  stablecoins: mocks.useStablecoins,
  stress: mocks.useStressSignals,
};

const payloadByFeed: Record<Feed, unknown> = {
  chains: fixtureChains,
  mintBurn: fixtureMintBurn,
  pegSummary: fixturePegSummary,
  reportCards: fixtureReportCards,
  stability: fixtureStability,
  stablecoins: fixtureStablecoins,
  stress: fixtureStress,
};

function pending(): FeedStub {
  return { data: undefined, error: null, isLoading: true, meta: null };
}

function landed(feed: Feed, meta: ApiMeta | null = FRESH): FeedStub {
  return { data: payloadByFeed[feed], error: null, isLoading: false, meta };
}

function failed(message: string): FeedStub {
  return { data: undefined, error: new Error(message), isLoading: false, meta: null };
}

/** Every feed not named is still in flight. */
function setFeeds(feeds: Partial<Record<Feed, FeedStub>>): void {
  for (const feed of Object.keys(hookByFeed) as Feed[]) {
    hookByFeed[feed].mockReturnValue(feeds[feed] ?? pending());
  }
}

function allLanded(overrides: Partial<Record<Feed, FeedStub>> = {}): Partial<Record<Feed, FeedStub>> {
  const feeds = {} as Record<Feed, FeedStub>;
  for (const feed of Object.keys(hookByFeed) as Feed[]) feeds[feed] = landed(feed);
  return { ...feeds, ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

describe("route mode", () => {
  it("routes to error when every feed failed and nothing landed", () => {
    setFeeds({
      chains: failed("chains: 502"),
      mintBurn: failed("mint-burn-flows: 502"),
      pegSummary: failed("peg-summary: 502"),
      reportCards: failed("report-cards: 502"),
      stability: failed("stability: 502"),
      stablecoins: failed("stablecoins: 502"),
      stress: failed("stress: 502"),
    });

    const { result } = renderHook(() => usePharosVilleWorldData());

    expect(result.current.world.routeMode).toBe("error");
    expect(result.current.hasRenderableData).toBe(false);
    expect(result.current.error?.message).toBe("stablecoins: 502");
  });

  it("keeps the world route when a feed fails but others already landed", () => {
    setFeeds(allLanded({ stress: failed("stress: 502") }));

    const { result } = renderHook(() => usePharosVilleWorldData());

    // A broken enrichment feed is a caveat, not a dead harbour: the error is
    // still reported upward, but the route stays open.
    expect(result.current.world.routeMode).toBe("world");
    expect(result.current.error?.message).toBe("stress: 502");
    expect(result.current.hasRenderableData).toBe(true);
  });
});

describe("the enrichment grace window", () => {
  it("holds the loading route while the enrichers may still arrive together", () => {
    setFeeds({ chains: landed("chains"), stablecoins: landed("stablecoins") });

    const { result } = renderHook(() => usePharosVilleWorldData());

    expect(result.current.world.routeMode).toBe("loading");
    expect(result.current.hasRenderableData).toBe(false);
  });

  it("opens the harbour on the essentials alone once the grace expires", () => {
    setFeeds({ chains: landed("chains"), stablecoins: landed("stablecoins") });

    const { result } = renderHook(() => usePharosVilleWorldData());
    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    // The incident this guards: a stuck enrichment feed used to hold five good
    // payloads behind an empty sea for the length of its retry budget.
    expect(result.current.world.routeMode).toBe("world");
    expect(result.current.world.ships.length).toBeGreaterThan(0);
    expect(result.current.world.docks.length).toBeGreaterThan(0);
    expect(result.current.hasRenderableData).toBe(true);
  });

  it("does not open on an enricher alone — the essentials are what make a harbour", () => {
    setFeeds({ pegSummary: landed("pegSummary"), stress: landed("stress") });

    const { result } = renderHook(() => usePharosVilleWorldData());
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.world.routeMode).toBe("loading");
    expect(result.current.hasRenderableData).toBe(false);
  });
});

describe("the last complete world", () => {
  it("is held through a transient incomplete pass rather than flashing an empty sea", () => {
    setFeeds(allLanded());
    const { rerender, result } = renderHook(() => usePharosVilleWorldData());
    const complete = result.current.world;
    expect(complete.routeMode).toBe("world");

    // A refetch puts one feed back in flight, so this pass cannot publish.
    setFeeds(allLanded({ stability: pending() }));
    rerender();

    expect(result.current.world).toBe(complete);
    expect(result.current.world.routeMode).toBe("world");
  });
});

describe("the world-input signature memo", () => {
  it("holds the same world across a refetch that returns identical payload references", () => {
    setFeeds(allLanded());
    const { rerender, result } = renderHook(() => usePharosVilleWorldData());
    const first = result.current.world;

    // Fresh query-result objects wrapping the same payload references, which
    // is what TanStack Query hands back when a refetch changed nothing.
    setFeeds(allLanded());
    rerender();

    expect(result.current.world).toBe(first);
  });

  it("rebuilds when a payload reference actually changes", () => {
    setFeeds(allLanded());
    const { rerender, result } = renderHook(() => usePharosVilleWorldData());
    const first = result.current.world;

    setFeeds(allLanded({
      stablecoins: { data: { ...fixtureStablecoins }, error: null, isLoading: false, meta: FRESH },
    }));
    rerender();

    expect(result.current.world).not.toBe(first);
  });
});

describe("freshness", () => {
  // Restored last-good payloads arrive here exactly like any other data, with
  // a recomputed stale/degraded meta — so this is also the path a browser-cache
  // restore travels.
  it.each([["stale"], ["degraded"]] as const)("marks a %s feed as stale for the world", (status) => {
    setFeeds(allLanded({ pegSummary: landed("pegSummary", { ...FRESH, status }) }));

    const { result } = renderHook(() => usePharosVilleWorldData());

    expect(result.current.world.freshness.pegSummaryStale).toBe(true);
    expect(result.current.world.freshness.stressStale).toBe(false);
  });

  it("rebuilds the world when a feed's freshness changes under identical payloads", () => {
    setFeeds(allLanded());
    const { rerender, result } = renderHook(() => usePharosVilleWorldData());
    const fresh = result.current.world;

    setFeeds(allLanded({ pegSummary: landed("pegSummary", { ...FRESH, status: "stale" }) }));
    rerender();

    expect(result.current.world).not.toBe(fresh);
    expect(result.current.world.freshness.pegSummaryStale).toBe(true);
  });
});
