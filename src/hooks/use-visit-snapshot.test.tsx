// @vitest-environment jsdom
import { makeSourceStatuses } from "@/__fixtures__/pharosville-world";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gardenLastVisitTide, setGardenLastVisitTide } from "../systems/garden-last-visit";
import { UNAVAILABLE_SUPPLY_TIDE, type SupplyTide } from "../systems/supply-tide";
import type { PharosVilleWorld, ShipNode } from "../systems/world-types";
import {
  VISIT_SNAPSHOT_SCHEMA_VERSION,
  VISIT_SNAPSHOT_STORAGE_KEY,
  type VisitSnapshot,
  type VisitSnapshotDelta,
  useVisitSnapshot,
  visitSnapshotDeltaSummary,
} from "./use-visit-snapshot";

function HookHarness({ world }: { world: PharosVilleWorld }) {
  const { summary } = useVisitSnapshot({ world });
  return summary ? <p data-testid="pharosville-visit-summary">{summary}</p> : null;
}

describe("useVisitSnapshot", () => {
  beforeEach(() => {
    installLocalStorage();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows only deltas derived from a valid prior snapshot and writes current once", async () => {
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot({
      generatedAt: 1,
      lastFleetDepegAt: 100,
      notableMoverSymbols: ["USDC"],
      psiBand: "WATCH",
      psiScore: 20,
    })));
    const initialWorld = worldFixture({
      generatedAt: 2,
      lastFleetDepegAt: 101,
      psiBand: "DANGER",
      psiScore: 82,
      ships: [
        shipFixture({ change24hUsd: 2_000_000, symbol: "USDC" }),
        shipFixture({ change24hUsd: -3_000_000, symbol: "DAI" }),
        shipFixture({ change24hPct: 0.009, change24hUsd: 999_999, symbol: "QUIET" }),
      ],
    });

    const { rerender } = render(<HookHarness world={initialWorld} />);

    const summary = await screen.findByTestId("pharosville-visit-summary");
    expect(summary.textContent).toBe(
      "Since you were here earlier today — stability moved from Watch to Danger; a new fleet depeg was recorded; DAI is among today's movers.",
    );

    const storedAfterFirstWorld = readStoredSnapshot();
    expect(storedAfterFirstWorld.psiBand).toBe("DANGER");
    expect(storedAfterFirstWorld.notableMoverSymbols).toEqual(["DAI", "USDC"]);

    rerender(<HookHarness
      world={worldFixture({
        generatedAt: 3,
        lastFleetDepegAt: 150,
        psiBand: "ALERT",
        psiScore: 55,
        ships: [shipFixture({ change24hUsd: 5_000_000, symbol: "FRAX" })],
      })}
    />);

    expect(readStoredSnapshot().psiBand).toBe("DANGER");
    expect(screen.getByTestId("pharosville-visit-summary").textContent).toContain("stability moved from Watch to Danger");
  });

  it("records first-visit baseline silently", async () => {
    render(<HookHarness world={worldFixture({ generatedAt: 10, psiBand: "CALM" })} />);

    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(10));
    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();
  });

  it("waits for the settled world instead of baselining the loading world", async () => {
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot({
      generatedAt: 1,
      lastFleetDepegAt: null,
      notableMoverSymbols: [],
      psiBand: "WATCH",
      psiScore: 20,
    })));
    const loadingWorld = {
      ...worldFixture({ psiBand: null, psiScore: null }),
      generatedAt: null,
      routeMode: "loading",
    } as PharosVilleWorld;

    const { rerender } = render(<HookHarness world={loadingWorld} />);

    expect(readStoredSnapshot().psiBand).toBe("WATCH");
    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();

    rerender(<HookHarness world={worldFixture({ generatedAt: 2, psiBand: "DANGER", psiScore: 82 })} />);

    const summary = await screen.findByTestId("pharosville-visit-summary");
    expect(summary.textContent).toContain("stability moved from Watch to Danger");
    expect(readStoredSnapshot().psiBand).toBe("DANGER");
  });

  it("treats garbage and old-shape storage as baseline-only", async () => {
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, "{not-json");
    const { unmount } = render(<HookHarness world={worldFixture({ generatedAt: 20, psiBand: "CALM" })} />);

    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(20));
    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();
    unmount();

    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      generatedAt: 20,
      lastFleetDepegAt: null,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: null,
    }));
    render(<HookHarness world={worldFixture({ generatedAt: 21, psiBand: "DANGER" })} />);

    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(21));
    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();
  });

  it("stays silent when storage access throws", () => {
    installThrowingLocalStorage("getItem");

    render(<HookHarness
      world={worldFixture({ generatedAt: 30, psiBand: "DANGER" })}
     
    />);

    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();
  });

  it("stays silent when snapshot persistence throws", () => {
    installThrowingLocalStorage("setItem", JSON.stringify(snapshot({
      generatedAt: 1,
      lastFleetDepegAt: null,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: null,
    })));

    render(<HookHarness
      world={worldFixture({ generatedAt: 31, psiBand: "DANGER" })}
     
    />);

    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();
  });

  it("hands the last visit's tide to the flat and tells how far it moved", async () => {
    setGardenLastVisitTide(null);
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot({
      generatedAt: 1,
      lastFleetDepegAt: null,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: 10,
      supplyTideOffset: -0.6,
    })));
    render(<HookHarness world={worldFixture({
      generatedAt: 2,
      psiBand: "CALM",
      psiScore: 10,
      supplyTide: { change7dPct: 0.83, offset: 0.64, state: "flood" },
    })} />);

    const summary = await screen.findByTestId("pharosville-visit-summary");
    expect(summary.textContent).toBe("Since you were here earlier today — the tide on the flat has come in, from ebb to flood.");
    expect(gardenLastVisitTide()).toBe(-0.6);
    expect(readStoredSnapshot().supplyTideOffset).toBe(0.64);
  });

  it("keeps a tide that barely moved, or was never stored, out of the sentence", async () => {
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot({
      generatedAt: 1,
      lastFleetDepegAt: null,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: 10,
      supplyTideOffset: 0.5,
    })));
    const { unmount } = render(<HookHarness world={worldFixture({
      generatedAt: 2,
      psiBand: "CALM",
      supplyTide: { change7dPct: 0.6, offset: 0.55, state: "flood" },
    })} />);
    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(2));
    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();
    unmount();

    setGardenLastVisitTide(0.3);
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      generatedAt: 2,
      lastFleetDepegAt: null,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: null,
      schemaVersion: VISIT_SNAPSHOT_SCHEMA_VERSION,
    }));
    render(<HookHarness world={worldFixture({
      generatedAt: 3,
      psiBand: "CALM",
      supplyTide: { change7dPct: -1.8, offset: -0.95, state: "ebb" },
    })} />);
    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(3));
    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();
    // A pre-X2 snapshot stored no tide: no wrack line.
    expect(gardenLastVisitTide()).toBeNull();
  });

  it("requires lastFleetDepegAt to be strictly newer", async () => {
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot({
      generatedAt: 1,
      lastFleetDepegAt: 100,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: null,
    })));

    render(<HookHarness
      world={worldFixture({
        generatedAt: 40,
        lastFleetDepegAt: 100,
        psiBand: "CALM",
      })}
     
    />);

    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(40));
    expect(screen.queryByTestId("pharosville-visit-summary")).toBeNull();
  });
});

describe("visitSnapshotDeltaSummary", () => {
  it("tells the return in one sentence: when, which way stability moved, and who moved", () => {
    expect(visitSnapshotDeltaSummary({
      ...materialDelta(),
      generatedAt: new Date(2026, 8, 26, 9).getTime(),
      notableMoverSymbols: ["USDC", "DAI", "FRAX"],
      previousGeneratedAt: new Date(2026, 8, 22, 21).getTime(),
      psiBandChange: { fromBand: "STEADY", fromScore: 80, toBand: "TREMOR", toScore: 61 },
    })).toBe("Since you were here on Tuesday — stability fell from Steady to Tremor; USDC, DAI and 1 more are among today's movers.");
    expect(visitSnapshotDeltaSummary({
      ...materialDelta(),
      generatedAt: new Date(2026, 8, 26, 9).getTime(),
      previousGeneratedAt: new Date(2026, 8, 12, 9).getTime(),
      psiBandChange: { fromBand: "TREMOR", fromScore: 61, toBand: "BEDROCK", toScore: 95 },
    })).toBe("Since you were here 14 days ago — stability rose from Tremor to Bedrock; DAI is among today's movers.");
  });
});

function installLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

function installThrowingLocalStorage(method: "getItem" | "setItem", storedValue: string | null = null): void {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: () => {
        if (method === "getItem") throw new Error("storage disabled");
        return storedValue;
      },
      setItem: () => {
        if (method === "setItem") throw new Error("storage disabled");
      },
      removeItem: () => undefined,
      clear: () => undefined,
    },
  });
}

function readStoredSnapshot(): VisitSnapshot {
  const raw = window.localStorage.getItem(VISIT_SNAPSHOT_STORAGE_KEY);
  if (!raw) throw new Error("missing stored snapshot");
  return JSON.parse(raw) as VisitSnapshot;
}

function snapshot(input: Omit<VisitSnapshot, "schemaVersion">): VisitSnapshot {
  return {
    schemaVersion: VISIT_SNAPSHOT_SCHEMA_VERSION,
    ...input,
  };
}

function worldFixture(input: {
  generatedAt?: number;
  lastFleetDepegAt?: number | null;
  psiBand?: string | null;
  psiScore?: number | null;
  ships?: ShipNode[];
  supplyTide?: SupplyTide;
} = {}): PharosVilleWorld {
  return {
    areas: [],
    detailIndex: {},
    docks: [],
    entityById: {},
    freshness: makeSourceStatuses(),
    generatedAt: input.generatedAt ?? 1,
    graves: [],
    lighthouse: {
      detailId: "lighthouse",
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos Lighthouse",
      lastFleetDepegAt: input.lastFleetDepegAt ?? null,
      psiBand: input.psiBand ?? null,
      score: input.psiScore ?? null,
    },
    map: { height: 1, tiles: [], waterRatio: 1, width: 1 },
    pigeonnier: {
      detailId: "pigeonnier",
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
    },
    routeMode: "world",
    ships: input.ships ?? [],
    supplyTide: input.supplyTide ?? UNAVAILABLE_SUPPLY_TIDE,
    visualCues: [],
  } as unknown as PharosVilleWorld;
}

function shipFixture(input: {
  change24hPct?: number | null;
  change24hUsd?: number | null;
  symbol: string;
}): ShipNode {
  return {
    change24hPct: input.change24hPct ?? null,
    change24hUsd: input.change24hUsd ?? null,
    detailId: `ship.${input.symbol.toLowerCase()}`,
    id: `ship.${input.symbol.toLowerCase()}`,
    kind: "ship",
    riskWaterLabel: "Watch water",
    symbol: input.symbol,
  } as unknown as ShipNode;
}

function materialDelta(): VisitSnapshotDelta {
  return {
    generatedAt: 2,
    lastFleetDepegAt: null,
    notableMoverSymbols: ["DAI"],
    previousGeneratedAt: 1,
    psiBandChange: {
      fromBand: "CALM",
      fromScore: 10,
      toBand: "DANGER",
      toScore: 82,
    },
    supplyTideChange: null,
  };
}
