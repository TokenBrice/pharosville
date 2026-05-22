import { describe, expect, it } from "vitest";
import type { ShipNode } from "./world-types";
import {
  cuePriority,
  CUE_PRIORITY_ACTIVE_RISK,
  CUE_PRIORITY_RECENT_SUPPLY,
  CUE_PRIORITY_SCENERY,
  CUE_PRIORITY_SELECTED,
} from "./cue-priority";

function makeShip(id: string, attrs: Partial<Pick<ShipNode, "riskPlacement" | "change24hPct" | "change24hUsd">> = {}): Pick<ShipNode, "id" | "riskPlacement" | "change24hPct" | "change24hUsd"> {
  return {
    id,
    riskPlacement: attrs.riskPlacement ?? "safe-harbor",
    change24hPct: attrs.change24hPct ?? null,
    change24hUsd: attrs.change24hUsd ?? null,
  };
}

describe("W4.27 cuePriority", () => {
  it("ranks selected highest", () => {
    expect(cuePriority({ ship: makeShip("ship.a"), selected: true })).toBe(CUE_PRIORITY_SELECTED);
  });

  it("ranks active-risk placements above recent supply and scenery", () => {
    expect(cuePriority({ ship: makeShip("ship.a", { riskPlacement: "storm-shelf" }) })).toBe(CUE_PRIORITY_ACTIVE_RISK);
    expect(cuePriority({ ship: makeShip("ship.b", { riskPlacement: "outer-rough-water" }) })).toBe(CUE_PRIORITY_ACTIVE_RISK);
    expect(cuePriority({ ship: makeShip("ship.c", { riskPlacement: "harbor-mouth-watch" }) })).toBe(CUE_PRIORITY_ACTIVE_RISK);
    expect(cuePriority({ ship: makeShip("ship.d", { riskPlacement: "breakwater-edge" }) })).toBe(CUE_PRIORITY_ACTIVE_RISK);
    expect(cuePriority({ ship: makeShip("ship.e", { riskPlacement: "ledger-mooring" }) })).toBe(CUE_PRIORITY_ACTIVE_RISK);
  });

  it("ranks recent supply move above scenery", () => {
    expect(cuePriority({ ship: makeShip("ship.a", { change24hUsd: 2_000_000 }) })).toBe(CUE_PRIORITY_RECENT_SUPPLY);
    expect(cuePriority({ ship: makeShip("ship.b", { change24hPct: 5 }) })).toBe(CUE_PRIORITY_RECENT_SUPPLY);
  });

  it("ranks scenery (calm, no recent move) lowest", () => {
    expect(cuePriority({ ship: makeShip("ship.a") })).toBe(CUE_PRIORITY_SCENERY);
  });

  it("selected wins even when also in active risk", () => {
    expect(cuePriority({
      ship: makeShip("ship.a", { riskPlacement: "storm-shelf", change24hPct: 12 }),
      selected: true,
    })).toBe(CUE_PRIORITY_SELECTED);
  });

  it("priority ordering is strictly monotonic across tiers", () => {
    expect(CUE_PRIORITY_SELECTED).toBeGreaterThan(CUE_PRIORITY_ACTIVE_RISK);
    expect(CUE_PRIORITY_ACTIVE_RISK).toBeGreaterThan(CUE_PRIORITY_RECENT_SUPPLY);
    expect(CUE_PRIORITY_RECENT_SUPPLY).toBeGreaterThan(CUE_PRIORITY_SCENERY);
  });
});
