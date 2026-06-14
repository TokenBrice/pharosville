// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PharosVilleWorld, ShipClass, ShipNode, ShipSizeTier, ShipWaterZone } from "../systems/world-types";
import { buildFleetFocusOptions, resolveFleetFocus, useWorldFocus } from "./use-world-focus";

describe("useWorldFocus", () => {
  it("returns undefined focusedShipIds when no focus criteria are active", () => {
    const ships = [
      makeShip({ id: "usdc", riskZone: "calm", shipClass: "cefi", sizeTier: "major" }),
      makeShip({ id: "dai", riskZone: "warning", shipClass: "defi", sizeTier: "regional" }),
    ];
    const { result } = renderHook(() => useWorldFocus({ world: worldFixture(ships) }));

    expect(result.current.focusedShipIds).toBeUndefined();
    expect(result.current.matchCount).toBe(2);
    expect(result.current.matchCountLabel).toBe("2 of 2 ships");
    expect(result.current.label).toBe("all ships");
  });

  it("intersects risk, class, size, and chain criteria using only positive chain deployment", () => {
    const ships = [
      makeShip({
        id: "a",
        riskZone: "warning",
        shipClass: "defi",
        sizeTier: "major",
        chainPresence: [
          { chainId: "ethereum", currentUsd: 100 },
          { chainId: "solana", currentUsd: 0 },
        ],
      }),
      makeShip({
        id: "b",
        riskZone: "warning",
        shipClass: "defi",
        sizeTier: "regional",
        chainPresence: [{ chainId: "ethereum", currentUsd: 50 }],
      }),
      makeShip({
        id: "c",
        riskZone: "warning",
        shipClass: "defi",
        sizeTier: "major",
        chainPresence: [{ chainId: "solana", currentUsd: 0 }],
      }),
      makeShip({
        id: "d",
        riskZone: "calm",
        shipClass: "cefi",
        sizeTier: "major",
        chainPresence: [{ chainId: "ethereum", currentUsd: 10 }],
      }),
    ];

    const focus = resolveFleetFocus({
      options: buildFleetFocusOptions(ships),
      selection: { riskBand: "warning", shipClass: "defi", sizeTier: "major", chain: "ethereum" },
      ships,
    });

    expect([...(focus.focusedShipIds ?? [])]).toEqual(["a"]);
    expect(focus.matchCountLabel).toBe("1 of 4 ships");
    expect(focus.activeSubsetLabel).toBe("risk band Warning, ship class DeFi, size tier Major and chain Ethereum");
    expect(focus.signature).toContain("risk:warning|class:defi|size:major|chain:ethereum");
  });

  it("updates and clears controlled selection state", () => {
    const ships = [
      makeShip({ id: "usdc", riskZone: "calm", shipClass: "cefi", sizeTier: "major" }),
      makeShip({ id: "dai", riskZone: "warning", shipClass: "defi", sizeTier: "regional" }),
    ];
    const { result } = renderHook(() => useWorldFocus({ world: worldFixture(ships) }));

    act(() => {
      result.current.updateSelection({ shipClass: "defi" });
    });

    expect(result.current.selection.shipClass).toBe("defi");
    expect([...(result.current.focusedShipIds ?? [])]).toEqual(["dai"]);

    act(() => {
      result.current.clearFocus();
    });

    expect(result.current.focusedShipIds).toBeUndefined();
    expect(result.current.selection).toEqual({ riskBand: null, shipClass: null, sizeTier: null, chain: null });
  });
});

function worldFixture(ships: ShipNode[]): Pick<PharosVilleWorld, "ships"> {
  return { ships };
}

function makeShip(input: {
  id: string;
  riskZone: ShipWaterZone;
  shipClass: ShipClass;
  sizeTier: ShipSizeTier;
  chainPresence?: Array<{ chainId: string; currentUsd: number }>;
}): ShipNode {
  return {
    id: input.id,
    kind: "ship",
    label: input.id,
    symbol: input.id.toUpperCase(),
    riskZone: input.riskZone,
    chainPresence: (input.chainPresence ?? []).map((presence) => ({
      ...presence,
      hasRenderedDock: false,
      share: presence.currentUsd > 0 ? 1 : 0,
    })),
    visual: {
      shipClass: input.shipClass,
      classLabel: input.shipClass,
      sizeTier: input.sizeTier,
      sizeLabel: input.sizeTier,
    },
  } as unknown as ShipNode;
}
