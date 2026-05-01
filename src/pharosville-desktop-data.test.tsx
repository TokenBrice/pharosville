/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiMeta } from "@/lib/api";
import {
  fixtureChains,
  fixturePegSummary,
  fixtureReportCards,
  fixtureStablecoins,
  fixtureStability,
  fixtureStress,
  makeAsset,
} from "./__fixtures__/pharosville-world";
import { PharosVilleDesktopData } from "./pharosville-desktop-data";

const mocks = vi.hoisted(() => {
  let nextBuildId = 1;
  return {
    resetBuildIds: () => {
      nextBuildId = 1;
    },
    useStablecoins: vi.fn(),
    useChains: vi.fn(),
    useStabilityIndexDetail: vi.fn(),
    usePegSummary: vi.fn(),
    useStressSignals: vi.fn(),
    useReportCards: vi.fn(),
    buildPharosVilleWorld: vi.fn((input: {
      routeMode?: string;
      stablecoins?: { peggedAssets?: Array<{ id: string; symbol: string }> } | null;
      chains?: { chains?: Array<{ id: string }> } | null;
      freshness?: Record<string, boolean | undefined>;
    }) => {
      const buildId = nextBuildId;
      nextBuildId += 1;
      return {
        generatedAt: buildId,
        routeMode: input.routeMode ?? "world",
        freshness: input.freshness ?? {},
        map: { width: 0, height: 0, tiles: [], waterRatio: 0 },
        lighthouse: {
          id: "lighthouse",
          kind: "lighthouse",
          label: "Pharos lighthouse",
          tile: { x: 0, y: 0 },
          psiBand: null,
          score: null,
          color: "#000000",
          unavailable: true,
          detailId: "lighthouse",
        },
        docks: (input.chains?.chains ?? []).map((chain) => ({
          id: `dock.${chain.id}`,
          kind: "dock",
          label: chain.id,
          chainId: chain.id,
          logoSrc: null,
          assetId: "dock.fixture",
          tile: { x: 0, y: 0 },
          totalUsd: 0,
          size: 1,
          healthBand: null,
          stablecoinCount: 0,
          concentration: null,
          harboredStablecoins: [],
          detailId: `dock.${chain.id}`,
        })),
        areas: [],
        ships: (input.stablecoins?.peggedAssets ?? []).map((asset) => ({
          id: `ship.${asset.id}`,
          kind: "ship",
          label: asset.symbol,
        })),
        graves: [],
        effects: [],
        detailIndex: {},
        legends: [],
        visualCues: [],
      };
    }),
  };
});

vi.mock("@/hooks/use-stablecoins", () => ({ useStablecoins: mocks.useStablecoins }));
vi.mock("@/hooks/use-chains", () => ({ useChains: mocks.useChains }));
vi.mock("@/hooks/api-hooks", () => ({
  useStabilityIndexDetail: mocks.useStabilityIndexDetail,
  usePegSummary: mocks.usePegSummary,
  useStressSignals: mocks.useStressSignals,
  useReportCards: mocks.useReportCards,
}));
vi.mock("./systems/pharosville-world", () => ({
  buildPharosVilleWorld: mocks.buildPharosVilleWorld,
}));
vi.mock("./pharosville-world", async () => {
  const React = await import("react");
  return {
    PharosVilleWorld: ({ world }: { world: { generatedAt: number; routeMode: string; ships: unknown[] } }) => (
      React.createElement("div", {
        "data-build-id": world.generatedAt,
        "data-route-mode": world.routeMode,
        "data-ship-count": world.ships.length,
        "data-testid": "pharosville-world",
      })
    ),
  };
});

const freshMeta = {
  updatedAt: 1_700_000_000,
  ageSeconds: 1,
  status: "fresh",
} satisfies ApiMeta;

interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  meta: ApiMeta | null;
  refetch: () => Promise<void>;
}

function queryState<T>(data: T | undefined, isLoading = false): QueryState<T> {
  return {
    data,
    error: null,
    isLoading,
    meta: data ? freshMeta : null,
    refetch: vi.fn(async () => undefined),
  };
}

function cloneStablecoins() {
  return {
    peggedAssets: fixtureStablecoins.peggedAssets.map((asset) => ({
      ...asset,
      circulating: { ...asset.circulating },
      chainCirculating: { ...asset.chainCirculating },
      chains: [...(asset.chains ?? [])],
    })),
  };
}

let root: Root | null = null;
let container: HTMLDivElement;
let queryClient: QueryClient;
let currentQueries: {
  stablecoins: QueryState<typeof fixtureStablecoins>;
  chains: QueryState<typeof fixtureChains>;
  stability: QueryState<typeof fixtureStability>;
  pegSummary: QueryState<typeof fixturePegSummary>;
  stress: QueryState<typeof fixtureStress>;
  reportCards: QueryState<typeof fixtureReportCards>;
};

function setCompleteQueries() {
  currentQueries = {
    stablecoins: queryState(fixtureStablecoins),
    chains: queryState(fixtureChains),
    stability: queryState(fixtureStability),
    pegSummary: queryState(fixturePegSummary),
    stress: queryState(fixtureStress),
    reportCards: queryState(fixtureReportCards),
  };
}

async function renderData() {
  await act(async () => {
    root ??= createRoot(container);
    root.render(
      <QueryClientProvider client={queryClient}>
        <PharosVilleDesktopData />
      </QueryClientProvider>,
    );
  });
}

function renderedWorld(): HTMLElement {
  const world = container.querySelector<HTMLElement>("[data-testid='pharosville-world']");
  if (!world) throw new Error("Expected mocked PharosVilleWorld to render.");
  return world;
}

describe("PharosVilleDesktopData", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.resetBuildIds();
    mocks.buildPharosVilleWorld.mockClear();
    setCompleteQueries();
    mocks.useStablecoins.mockImplementation(() => currentQueries.stablecoins);
    mocks.useChains.mockImplementation(() => currentQueries.chains);
    mocks.useStabilityIndexDetail.mockImplementation(() => currentQueries.stability);
    mocks.usePegSummary.mockImplementation(() => currentQueries.pegSummary);
    mocks.useStressSignals.mockImplementation(() => currentQueries.stress);
    mocks.useReportCards.mockImplementation(() => currentQueries.reportCards);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
  });

  it("does not rebuild the world when query data references are stable", async () => {
    const stableStablecoins = cloneStablecoins();
    currentQueries.stablecoins = queryState(stableStablecoins);
    await renderData();

    // Same reference returned on the next render (TanStack's no-change behavior).
    currentQueries.stablecoins = queryState(stableStablecoins);
    await renderData();

    expect(mocks.buildPharosVilleWorld).toHaveBeenCalledTimes(1);
    expect(renderedWorld().dataset.shipCount).toBe("2");
  });

  it("rebuilds when payload semantics change with unchanged meta", async () => {
    await renderData();

    currentQueries.stablecoins = queryState({
      peggedAssets: [
        ...fixtureStablecoins.peggedAssets,
        makeAsset({ id: "dai", symbol: "DAI", name: "Dai" }),
      ],
    });
    await renderData();

    expect(mocks.buildPharosVilleWorld).toHaveBeenCalledTimes(2);
    expect(renderedWorld().dataset.shipCount).toBe("3");
  });

  it("keeps a single loading world during staggered cold-start query arrivals", async () => {
    currentQueries = {
      stablecoins: queryState<typeof fixtureStablecoins>(undefined, true),
      chains: queryState<typeof fixtureChains>(undefined, true),
      stability: queryState<typeof fixtureStability>(undefined, true),
      pegSummary: queryState<typeof fixturePegSummary>(undefined, true),
      stress: queryState<typeof fixtureStress>(undefined, true),
      reportCards: queryState<typeof fixtureReportCards>(undefined, true),
    };
    await renderData();

    currentQueries.stablecoins = queryState(fixtureStablecoins);
    await renderData();

    currentQueries.chains = queryState(fixtureChains);
    currentQueries.stability = queryState(fixtureStability);
    currentQueries.pegSummary = queryState(fixturePegSummary);
    currentQueries.stress = queryState(fixtureStress);
    currentQueries.reportCards = queryState(fixtureReportCards);
    await renderData();

    expect(mocks.buildPharosVilleWorld).toHaveBeenCalledTimes(2);
    expect(renderedWorld().dataset.routeMode).toBe("world");
  });

  it("keeps the last complete world when a later loading pass has incomplete data", async () => {
    await renderData();
    expect(renderedWorld().dataset.buildId).toBe("1");

    currentQueries.stablecoins = queryState<typeof fixtureStablecoins>(undefined, true);
    await renderData();

    expect(mocks.buildPharosVilleWorld).toHaveBeenCalledTimes(1);
    expect(renderedWorld().dataset.buildId).toBe("1");
    expect(renderedWorld().dataset.routeMode).toBe("world");
  });
});
