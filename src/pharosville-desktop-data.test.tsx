/* @vitest-environment jsdom */
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PHAROSVILLE_API_ENDPOINT_KEYS } from "@shared/types/pharosville-endpoint-keys";
import type { ApiQueryWithMetaResult } from "./hooks/use-api-query";
import {
  fixtureChains, fixturePegSummary, fixtureMintBurn, fixtureSafetyGrades,
  fixtureStablecoins, fixtureStability, fixtureStress, makeAsset,
} from "./__fixtures__/pharosville-world";
import * as worldSystem from "./systems/pharosville-world";
import { PharosVilleDesktopData } from "./pharosville-desktop-data";
import { AccessibilityLedger } from "./components/accessibility-ledger";

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
// Replace only the WebGL shell; inspect the actual ledger over actual built worlds.
vi.mock("./pharosville-world", () => ({ PharosVilleWorld: AccessibilityLedger }));
vi.mock("./error-reporter", () => ({ reportClientError: vi.fn() }));

type QueryState<T> = ApiQueryWithMetaResult<T>;
function queryState<T>(data: T | undefined, isLoading = false): QueryState<T> {
  return {
    data, error: null, isError: false, isSuccess: data !== undefined, isLoading,
    observedNowMs: 1_700_000_060_000,
    meta: data ? { updatedAt: 1_700_000_000, ageSeconds: 60, status: "fresh" } : null,
    refetch: vi.fn(async () => undefined),
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
  safetyGrades: QueryState<typeof fixtureSafetyGrades>;
  mintBurn: QueryState<typeof fixtureMintBurn>;
};
const queryListeners = new Set<() => void>();
let queryVersion = 0;
function subscribeQueries(listener: () => void): () => void {
  queryListeners.add(listener);
  return () => queryListeners.delete(listener);
}
function getQueryVersion(): number { return queryVersion; }
async function notifyQueriesChanged(): Promise<void> {
  await act(async () => {
    queryVersion += 1;
    for (const listener of queryListeners) listener();
  });
}
function useNotifierBackedQuery<T>(read: () => QueryState<T>): QueryState<T> {
  useSyncExternalStore(subscribeQueries, getQueryVersion, getQueryVersion);
  return read();
}
async function renderData() {
  await act(async () => {
    root ??= createRoot(container);
    root.render(<QueryClientProvider client={queryClient}><PharosVilleDesktopData /></QueryClientProvider>);
  });
}
function fleetIds(): string[] {
  return [...container.querySelectorAll<HTMLElement>("[id^='ledger-ship-']")].map((node) => node.id).sort();
}
function sourceRow(key: keyof typeof currentQueries): HTMLElement {
  return container.querySelector<HTMLElement>(`[data-source="${key}"]`)!;
}
function routeMode(): string | null {
  return [...container.querySelectorAll("dt")].find((term) => term.textContent === "Route mode")!.nextElementSibling!.textContent;
}

const buildSpy = vi.spyOn(worldSystem, "buildPharosVilleWorld");
describe("PharosVilleDesktopData", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    buildSpy.mockClear();
    queryListeners.clear();
    queryVersion = 0;
    currentQueries = {
      stablecoins: queryState(fixtureStablecoins), chains: queryState(fixtureChains),
      stability: queryState(fixtureStability), pegSummary: queryState(fixturePegSummary),
      stress: queryState(fixtureStress), safetyGrades: queryState(fixtureSafetyGrades), mintBurn: queryState(fixtureMintBurn),
    };
    mocks.useStablecoins.mockImplementation(() => useNotifierBackedQuery(() => currentQueries.stablecoins));
    mocks.useChains.mockImplementation(() => useNotifierBackedQuery(() => currentQueries.chains));
    mocks.useStabilityIndexDetail.mockImplementation(() => useNotifierBackedQuery(() => currentQueries.stability));
    mocks.usePegSummary.mockImplementation(() => useNotifierBackedQuery(() => currentQueries.pegSummary));
    mocks.useStressSignals.mockImplementation(() => useNotifierBackedQuery(() => currentQueries.stress));
    mocks.useSafetyGrades.mockImplementation(() => useNotifierBackedQuery(() => currentQueries.safetyGrades));
    mocks.useMintBurnFlows.mockImplementation(() => useNotifierBackedQuery(() => currentQueries.mintBurn));
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    queryClient.clear();
    container.remove();
  });

  it("does not rebuild renderable geometry for semantically unchanged query wrappers", async () => {
    await renderData();
    const ids = fleetIds();
    currentQueries.stablecoins = queryState(fixtureStablecoins);
    await notifyQueriesChanged();
    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(fleetIds()).toEqual(ids);
    expect(ids).toEqual(["ledger-ship-usdc-circle", "ledger-ship-usdt-tether"]);
  });

  it("publishes newly admitted identities when payload semantics change", async () => {
    await renderData();
    currentQueries.stablecoins = queryState({ peggedAssets: [
      ...fixtureStablecoins.peggedAssets, makeAsset({ id: "dai-makerdao", symbol: "DAI", name: "Dai" }),
    ] });
    await notifyQueriesChanged();
    expect(fleetIds()).toEqual(["ledger-ship-dai-makerdao", "ledger-ship-usdc-circle", "ledger-ship-usdt-tether"]);
    expect(sourceRow("safetyGrades").dataset.coverage).toBe("partial");
  });

  it("keeps cold-start geometry unpublished while source states track staggered arrivals", async () => {
    for (const key of PHAROSVILLE_API_ENDPOINT_KEYS) Object.assign(currentQueries, { [key]: queryState(undefined, true) });
    await renderData();
    expect(routeMode()).toBe("loading");
    expect(fleetIds()).toEqual([]);
    for (const key of PHAROSVILLE_API_ENDPOINT_KEYS) expect(sourceRow(key).dataset.state).toBe("loading");
    currentQueries.stablecoins = queryState(fixtureStablecoins);
    await notifyQueriesChanged();
    expect(routeMode()).toBe("loading");
    expect(fleetIds()).toEqual([]);
    expect(sourceRow("stablecoins").dataset.state).toBe("current");
    expect(sourceRow("chains").dataset.state).toBe("loading");
    Object.assign(currentQueries, {
      chains: queryState(fixtureChains), stability: queryState(fixtureStability), pegSummary: queryState(fixturePegSummary),
      stress: queryState(fixtureStress), safetyGrades: queryState(fixtureSafetyGrades), mintBurn: queryState(fixtureMintBurn),
    });
    await notifyQueriesChanged();
    expect(routeMode()).toBe("world");
    expect(fleetIds()).toEqual(["ledger-ship-usdc-circle", "ledger-ship-usdt-tether"]);
    for (const key of PHAROSVILLE_API_ENDPOINT_KEYS) expect(sourceRow(key).dataset.state).toBe("current");
    // These stock fixtures lack complete stress/issuance coverage: current is not complete.
    expect(container.querySelector("[data-complete-current]")!.getAttribute("data-complete-current")).toBe("false");
  });

  it("retains the fleet and records while later loading and failure update source truth", async () => {
    await renderData();
    const ids = fleetIds();
    const publishedAt = sourceRow("stablecoins").querySelector("time")!.dateTime;
    currentQueries.stablecoins = queryState<typeof fixtureStablecoins>(undefined, true);
    await notifyQueriesChanged();
    expect(routeMode()).toBe("world");
    expect(fleetIds()).toEqual(ids);
    expect(sourceRow("stablecoins").dataset.state).toBe("stale");
    expect(sourceRow("stablecoins").querySelector("time")!.dateTime).toBe(publishedAt);
    currentQueries.stablecoins = { ...queryState<typeof fixtureStablecoins>(undefined), error: new Error("offline"), isError: true };
    await notifyQueriesChanged();
    expect(fleetIds()).toEqual(ids);
    expect(sourceRow("stablecoins").dataset.state).toBe("stale");
    expect(sourceRow("stablecoins").textContent).toContain("offline");
    expect(sourceRow("stablecoins").querySelector("time")!.dateTime).toBe(publishedAt);
  });
});
