// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShipRiskTransitionEntry } from "../components/accessibility-ledger";
import type { ShipNode } from "../systems/world-types";
import { HARBOR_LOG_HOLD_MS, HARBOR_LOG_SPOKEN_LIMIT, useHarborLog } from "./use-harbor-log";

function ship(symbol: string): ShipNode {
  return {
    id: symbol.toLowerCase(),
    detailId: `ship.${symbol.toLowerCase()}`,
    symbol,
  } as unknown as ShipNode;
}

function transition(fromLabel: string, toLabel: string): ShipRiskTransitionEntry {
  return { fromLabel, toLabel, progress: 0 };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useHarborLog", () => {
  it("speaks each new transition once on the now-line and keeps it in the session log", () => {
    vi.useFakeTimers();
    const shipsById = new Map([["usdx", ship("USDX")]]);
    const transitions = new Map([["usdx", transition("Calm Anchorage", "Danger Strait")]]);
    const { result, rerender } = renderHook(
      (props: { map: ReadonlyMap<string, ShipRiskTransitionEntry>; observedAt: number }) => useHarborLog({
        riskTransitionByShipId: props.map,
        shipsById,
        observedAt: props.observedAt,
      }),
      { initialProps: { map: transitions, observedAt: 1000 } },
    );

    expect(result.current.current).toMatchObject({ symbol: "USDX", toLabel: "Danger Strait", observedAt: 1000 });
    expect(result.current.entries.map((entry) => entry.message)).toEqual(["USDX left Calm Anchorage for Danger Strait"]);

    // The same transition surviving the next refresh neither repeats nor duplicates.
    act(() => vi.advanceTimersByTime(HARBOR_LOG_HOLD_MS));
    expect(result.current.current).toBeNull();
    rerender({ map: new Map(transitions), observedAt: 2000 });
    expect(result.current.current).toBeNull();
    expect(result.current.entries).toHaveLength(1);
  });

  it("speaks one phrase at a time and sends overflow to the ledger only", () => {
    vi.useFakeTimers();
    const symbols = ["A1", "B2", "C3", "D4", "E5", "F6"];
    const shipsById = new Map(symbols.map((symbol) => [symbol.toLowerCase(), ship(symbol)]));
    const transitions = new Map(
      symbols.map((symbol) => [symbol.toLowerCase(), transition("Calm Anchorage", "Watch Breakwater")]),
    );
    const { result } = renderHook(() => useHarborLog({ riskTransitionByShipId: transitions, shipsById, observedAt: 1000 }));

    expect(result.current.entries).toHaveLength(symbols.length);
    const spoken: string[] = [];
    for (let step = 0; step < symbols.length; step += 1) {
      if (result.current.current) spoken.push(result.current.current.symbol);
      act(() => vi.advanceTimersByTime(HARBOR_LOG_HOLD_MS));
    }
    expect(spoken).toEqual(symbols.slice(0, HARBOR_LOG_SPOKEN_LIMIT));
    expect(result.current.current).toBeNull();
  });
});
