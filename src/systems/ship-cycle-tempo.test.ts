import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../__fixtures__/data-contract-scenarios";
import { buildPharosVilleWorld } from "./pharosville-world";
import { cycleTempoSpeedScalar, shipCycleTempo } from "./ship-cycle-tempo";

describe("supported per-coin route intensity", () => {
  it("separates supported zero intensity from unsupported readings", () => {
    const current = buildPharosVilleWorld(structuredClone(SCENARIOS.largeMint)).ships.find((ship) => ship.id === "usdc-circle")!;
    expect(shipCycleTempo(current)).toMatchObject({ scalar: 0.85, label: "Languid", flowIntensity: 0 });
    for (const scenario of [SCENARIOS.partialFlow, SCENARIOS.legacyFlowSemantics]) {
      const ship = buildPharosVilleWorld(structuredClone(scenario)).ships.find((ship) => ship.id === "usdc-circle")!;
      expect(shipCycleTempo(ship)).toMatchObject({ scalar: 1, label: "Unmeasured", flowIntensity: null });
    }
    for (const mutation of [
      { ...current.issuance!, evidence: { ...current.issuance!.evidence, state: "stale" as const } },
      { ...current.issuance!, intensitySemantics: null },
      { ...current.issuance!, completeWindow: false },
    ]) expect(shipCycleTempo({ ...current, issuance: mutation })).toMatchObject({ scalar: 1, label: "Unmeasured" });
    const { issuance: _issuance, ...missing } = current;
    expect(shipCycleTempo(missing)).toMatchObject({ scalar: 1, label: "Unmeasured" });
  });

  it("preserves the sign while deriving equal pace from equal supported magnitude", () => {
    const ship = buildPharosVilleWorld(structuredClone(SCENARIOS.largeMint)).ships.find((ship) => ship.id === "usdc-circle")!;
    const positive = shipCycleTempo({ ...ship, flowIntensity: 60 });
    const negative = shipCycleTempo({ ...ship, flowIntensity: -60 });
    expect(positive.scalar).toBeCloseTo(1.03);
    expect(negative.scalar).toBe(positive.scalar);
    expect(negative.flowIntensity).toBe(-60);
    expect(cycleTempoSpeedScalar(200)).toBe(1.15);
    expect(cycleTempoSpeedScalar(Number.NaN)).toBe(1);
  });
});
