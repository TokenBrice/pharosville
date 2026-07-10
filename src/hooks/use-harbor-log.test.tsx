// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HarborLog } from "../components/harbor-log";
import type { ShipRiskTransitionEntry } from "../components/accessibility-ledger";
import type { ShipNode } from "../systems/world-types";
import { HARBOR_LOG_LIMIT, useHarborLog } from "./use-harbor-log";

function HookHarness({
  onSelectDetail,
  riskTransitionByShipId,
  setAnnouncement,
  shipsById,
}: {
  onSelectDetail: (detailId: string) => void;
  riskTransitionByShipId: ReadonlyMap<string, ShipRiskTransitionEntry>;
  setAnnouncement: (message: string) => void;
  shipsById: ReadonlyMap<string, ShipNode>;
}) {
  const harborLog = useHarborLog({ riskTransitionByShipId, setAnnouncement, shipsById });
  return (
    <HarborLog
      entries={harborLog.entries}
      onDismiss={harborLog.dismiss}
      onSelectDetail={onSelectDetail}
    />
  );
}

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
  cleanup();
});

describe("useHarborLog", () => {
  it("logs new risk-band transitions once, clickable to the ship, and announces them", () => {
    const onSelectDetail = vi.fn();
    const setAnnouncement = vi.fn();
    const shipsById = new Map([["usdx", ship("USDX")]]);
    const transitions = new Map([["usdx", transition("Calm Anchorage", "Danger Strait")]]);

    const { rerender } = render(
      <HookHarness
        onSelectDetail={onSelectDetail}
        riskTransitionByShipId={transitions}
        setAnnouncement={setAnnouncement}
        shipsById={shipsById}
      />,
    );

    const entry = screen.getByRole("button", { name: "USDX left Calm Anchorage for Danger Strait" });
    expect(setAnnouncement).toHaveBeenCalledWith("Harbor log: USDX left Calm Anchorage for Danger Strait.");

    fireEvent.click(entry);
    expect(onSelectDetail).toHaveBeenCalledWith("ship.usdx");

    // The same transition surviving the next refresh must not duplicate.
    rerender(
      <HookHarness
        onSelectDetail={onSelectDetail}
        riskTransitionByShipId={new Map(transitions)}
        setAnnouncement={setAnnouncement}
        shipsById={shipsById}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(setAnnouncement).toHaveBeenCalledTimes(1);
  });

  it("caps the visible log and renders nothing once dismissed", () => {
    const symbols = ["A1", "B2", "C3", "D4", "E5", "F6"];
    const shipsById = new Map(symbols.map((symbol) => [symbol.toLowerCase(), ship(symbol)]));
    const transitions = new Map(
      symbols.map((symbol) => [symbol.toLowerCase(), transition("Calm Anchorage", "Watch Breakwater")]),
    );

    render(
      <HookHarness
        onSelectDetail={() => undefined}
        riskTransitionByShipId={transitions}
        setAnnouncement={() => undefined}
        shipsById={shipsById}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(HARBOR_LOG_LIMIT);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss harbor log" }));
    expect(screen.queryByTestId("pharosville-harbor-log")).toBeNull();
  });
});
