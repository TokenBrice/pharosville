import { describe, expect, it } from "vitest";
import { precomputeShipTempos, shipCycleTempo } from "./ship-cycle-tempo";
import type { ShipNode } from "./world-types";

function ship(id: string, marketCapUsd: number): ShipNode {
  return {
    id,
    marketCapUsd,
  } as ShipNode;
}

describe("ship cycle tempo market-cap ranking", () => {
  it("assigns tied or zero market caps by deterministic rank position instead of collapsing to Active", () => {
    const ships = [
      ship("a", 0),
      ship("b", 0),
      ship("c", 0),
      ship("d", 0),
    ];

    expect(ships.map((entry) => shipCycleTempo(entry, ships).label)).toEqual([
      "Languid",
      "Steady",
      "Brisk",
      "Active",
    ]);

    const precomputed = precomputeShipTempos(ships);
    expect(ships.map((entry) => precomputed.get(entry.id)?.label)).toEqual([
      "Languid",
      "Steady",
      "Brisk",
      "Active",
    ]);
  });
});
