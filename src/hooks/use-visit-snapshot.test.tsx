// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SinceLastVisitBanner } from "../components/since-last-visit";
import type { PharosVilleWorld, ShipNode } from "../systems/world-types";
import {
  VISIT_SNAPSHOT_SCHEMA_VERSION,
  VISIT_SNAPSHOT_STORAGE_KEY,
  type VisitSnapshot,
  type VisitSnapshotDelta,
  useVisitSnapshot,
} from "./use-visit-snapshot";

function HookHarness({
  setAnnouncement,
  world,
}: {
  setAnnouncement: (message: string) => void;
  world: PharosVilleWorld;
}) {
  const visitSnapshot = useVisitSnapshot({ world, setAnnouncement });
  return <SinceLastVisitBanner delta={visitSnapshot.delta} onDismiss={visitSnapshot.dismiss} />;
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
    const setAnnouncement = vi.fn();
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

    const { rerender } = render(<HookHarness world={initialWorld} setAnnouncement={setAnnouncement} />);

    const banner = await screen.findByTestId("pharosville-since-last-visit");
    expect(banner.textContent).toContain("PSI WATCH -> DANGER");
    expect(banner.textContent).toContain("new fleet depeg recorded");
    expect(banner.textContent).toContain("new notable movers: DAI");
    expect(banner.textContent).not.toContain("QUIET");
    expect(setAnnouncement).toHaveBeenCalledWith(expect.stringContaining("Since last visit:"));

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
      setAnnouncement={setAnnouncement}
    />);

    expect(readStoredSnapshot().psiBand).toBe("DANGER");
    expect(screen.getByTestId("pharosville-since-last-visit").textContent).toContain("PSI WATCH -> DANGER");
  });

  it("records first-visit baseline silently", async () => {
    const setAnnouncement = vi.fn();
    render(<HookHarness world={worldFixture({ generatedAt: 10, psiBand: "CALM" })} setAnnouncement={setAnnouncement} />);

    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(10));
    expect(screen.queryByTestId("pharosville-since-last-visit")).toBeNull();
    expect(setAnnouncement).not.toHaveBeenCalled();
  });

  it("treats garbage and old-shape storage as baseline-only", async () => {
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, "{not-json");
    const setAnnouncement = vi.fn();
    const { unmount } = render(<HookHarness world={worldFixture({ generatedAt: 20, psiBand: "CALM" })} setAnnouncement={setAnnouncement} />);

    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(20));
    expect(screen.queryByTestId("pharosville-since-last-visit")).toBeNull();
    unmount();

    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      generatedAt: 20,
      lastFleetDepegAt: null,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: null,
    }));
    render(<HookHarness world={worldFixture({ generatedAt: 21, psiBand: "DANGER" })} setAnnouncement={setAnnouncement} />);

    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(21));
    expect(screen.queryByTestId("pharosville-since-last-visit")).toBeNull();
    expect(setAnnouncement).not.toHaveBeenCalled();
  });

  it("stays silent when storage access throws", () => {
    installThrowingLocalStorage("getItem");
    const setAnnouncement = vi.fn();

    render(<HookHarness
      world={worldFixture({ generatedAt: 30, psiBand: "DANGER" })}
      setAnnouncement={setAnnouncement}
    />);

    expect(screen.queryByTestId("pharosville-since-last-visit")).toBeNull();
    expect(setAnnouncement).not.toHaveBeenCalled();
  });

  it("stays silent when snapshot persistence throws", () => {
    installThrowingLocalStorage("setItem", JSON.stringify(snapshot({
      generatedAt: 1,
      lastFleetDepegAt: null,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: null,
    })));
    const setAnnouncement = vi.fn();

    render(<HookHarness
      world={worldFixture({ generatedAt: 31, psiBand: "DANGER" })}
      setAnnouncement={setAnnouncement}
    />);

    expect(screen.queryByTestId("pharosville-since-last-visit")).toBeNull();
    expect(setAnnouncement).not.toHaveBeenCalled();
  });

  it("requires lastFleetDepegAt to be strictly newer", async () => {
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot({
      generatedAt: 1,
      lastFleetDepegAt: 100,
      notableMoverSymbols: [],
      psiBand: "CALM",
      psiScore: null,
    })));
    const setAnnouncement = vi.fn();

    render(<HookHarness
      world={worldFixture({
        generatedAt: 40,
        lastFleetDepegAt: 100,
        psiBand: "CALM",
      })}
      setAnnouncement={setAnnouncement}
    />);

    await waitFor(() => expect(readStoredSnapshot().generatedAt).toBe(40));
    expect(screen.queryByTestId("pharosville-since-last-visit")).toBeNull();
    expect(setAnnouncement).not.toHaveBeenCalled();
  });
});

describe("SinceLastVisitBanner", () => {
  afterEach(() => {
    cleanup();
  });

  it("dismisses without removing surrounding detail content", () => {
    function DismissHarness() {
      const [delta, setDelta] = useState<VisitSnapshotDelta | null>(materialDelta());
      return (
        <div>
          <section data-testid="pharosville-detail-panel">Detail panel stays mounted</section>
          <SinceLastVisitBanner delta={delta} onDismiss={() => setDelta(null)} />
        </div>
      );
    }

    render(<DismissHarness />);

    const banner = screen.getByRole("status", { name: "Since last visit" });
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.getAttribute("aria-atomic")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss since last visit update" }));

    expect(screen.queryByTestId("pharosville-since-last-visit")).toBeNull();
    expect(screen.getByTestId("pharosville-detail-panel").textContent).toBe("Detail panel stays mounted");
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
} = {}): PharosVilleWorld {
  return {
    areas: [],
    detailIndex: {},
    docks: [],
    effects: [],
    entityById: {},
    freshness: {},
    generatedAt: input.generatedAt ?? 1,
    graves: [],
    legends: [],
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
  };
}
