import { describe, expect, it } from "vitest";
import type { ShipNode } from "./world-types";
import {
  arbitrateCueSlot,
  awardCueSlots,
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

describe("W4.27 arbitrateCueSlot", () => {
  it("awards the slot to the higher-priority ship", () => {
    const winner = arbitrateCueSlot(
      { ship: makeShip("ship.a") },
      { ship: makeShip("ship.b"), selected: true },
    );
    expect(winner).toBe("ship.b");
  });

  it("breaks ties deterministically by id-sort", () => {
    const winner = arbitrateCueSlot(
      { ship: makeShip("ship.b", { riskPlacement: "storm-shelf" }) },
      { ship: makeShip("ship.a", { riskPlacement: "storm-shelf" }) },
    );
    expect(winner).toBe("ship.a");
  });

  it("tie-break is symmetric: same pair always picks the same winner regardless of order", () => {
    const a = { ship: makeShip("ship.a", { riskPlacement: "storm-shelf" }) };
    const b = { ship: makeShip("ship.b", { riskPlacement: "storm-shelf" }) };
    expect(arbitrateCueSlot(a, b)).toBe("ship.a");
    expect(arbitrateCueSlot(b, a)).toBe("ship.a");
  });
});

describe("W4.27 awardCueSlots", () => {
  it("awards every ship when capacity exceeds candidate count", () => {
    const winners = awardCueSlots(
      [
        { ship: makeShip("ship.a") },
        { ship: makeShip("ship.b") },
      ],
      10,
    );
    expect(winners.size).toBe(2);
    expect(winners.has("ship.a")).toBe(true);
    expect(winners.has("ship.b")).toBe(true);
  });

  it("picks the highest-priority ships when capacity is limiting", () => {
    const winners = awardCueSlots(
      [
        { ship: makeShip("ship.a") }, // scenery
        { ship: makeShip("ship.b", { riskPlacement: "storm-shelf" }) }, // active risk
        { ship: makeShip("ship.c"), selected: true }, // selected
        { ship: makeShip("ship.d", { change24hUsd: 5_000_000 }) }, // recent supply
      ],
      2,
    );
    expect(winners.size).toBe(2);
    expect(winners.has("ship.c")).toBe(true); // selected
    expect(winners.has("ship.b")).toBe(true); // active risk
  });

  it("ties at the priority cliff are broken by id-sort (deterministic)", () => {
    const winners = awardCueSlots(
      [
        { ship: makeShip("ship.z", { riskPlacement: "storm-shelf" }) },
        { ship: makeShip("ship.a", { riskPlacement: "storm-shelf" }) },
        { ship: makeShip("ship.m", { riskPlacement: "storm-shelf" }) },
      ],
      2,
    );
    expect(winners.size).toBe(2);
    expect(winners.has("ship.a")).toBe(true);
    expect(winners.has("ship.m")).toBe(true);
    expect(winners.has("ship.z")).toBe(false);
  });

  it("returns empty winner set on zero capacity", () => {
    const winners = awardCueSlots(
      [{ ship: makeShip("ship.a") }, { ship: makeShip("ship.b"), selected: true }],
      0,
    );
    expect(winners.size).toBe(0);
  });

  it("is deterministic across repeated calls with the same inputs", () => {
    const candidates = [
      { ship: makeShip("ship.a", { riskPlacement: "storm-shelf" }) },
      { ship: makeShip("ship.b", { change24hUsd: 5_000_000 }) },
      { ship: makeShip("ship.c"), selected: true },
      { ship: makeShip("ship.d") },
    ];
    const first = awardCueSlots(candidates, 2);
    const second = awardCueSlots(candidates, 2);
    expect([...first].sort()).toEqual([...second].sort());
  });
});
