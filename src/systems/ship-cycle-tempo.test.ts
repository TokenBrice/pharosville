import { describe, expect, it } from "vitest";
import {
  cycleTempoDetailLabel,
  cycleTempoReadingClause,
  cycleTempoSpeedScalar,
  precomputeShipTempos,
  shipCycleTempo,
} from "./ship-cycle-tempo";
import type { ShipNode } from "./world-types";

type TestShip = ShipNode & { flowIntensity?: number | null };

function ship(id: string, flowIntensity?: number | null): TestShip {
  return {
    id,
    flowIntensity,
  } as TestShip;
}

describe("ship cycle tempo flow intensity", () => {
  it("maps absolute per-coin flow intensity across the existing modest speed band", () => {
    const ships = [
      ship("quiet", 0),
      ship("steady", -25),
      ship("brisk", 50),
      ship("active", 100),
    ];

    expect(ships.map((entry) => shipCycleTempo(entry, ships).label)).toEqual([
      "Languid",
      "Steady",
      "Brisk",
      "Active",
    ]);
    expect(ships.map((entry) => shipCycleTempo(entry, ships).scalar)).toEqual([
      0.85,
      expect.closeTo(0.925, 10),
      1,
      1.15,
    ]);
    expect(shipCycleTempo(ships[1]!, ships).flowIntensity).toBe(-25);
  });

  it("uses a neutral scalar and an explicit disclaimer when flow intensity is unavailable", () => {
    const tempo = shipCycleTempo(ship("missing"), [ship("missing")]);

    expect(tempo).toEqual({
      flowIntensity: null,
      label: "Unmeasured",
      scalar: 1,
    });
    expect(cycleTempoDetailLabel(tempo)).toBe(
      "Unmeasured — neutral pace (24h mint/redeem flow intensity unavailable)",
    );
    expect(cycleTempoReadingClause()).toContain("unavailable flow uses neutral pace");
  });

  it("clamps malformed out-of-range values without widening the motion band", () => {
    expect(cycleTempoSpeedScalar(-200)).toBe(1.15);
    expect(cycleTempoSpeedScalar(200)).toBe(1.15);
    expect(cycleTempoSpeedScalar(Number.NaN)).toBe(1);
  });

  it("precomputes independent coin readings without market-cap sorting", () => {
    const ships = [ship("a", 100), ship("b", null), ship("c", -80)];
    const precomputed = precomputeShipTempos(ships);

    expect(precomputed.get("a")?.scalar).toBe(1.15);
    expect(precomputed.get("b")).toMatchObject({ label: "Unmeasured", scalar: 1 });
    expect(precomputed.get("c")?.label).toBe("Active");
  });
});
