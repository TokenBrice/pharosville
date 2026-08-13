import { describe, expect, it } from "vitest";
import { makeReportCard } from "../__fixtures__/pharosville-world";
import {
  deriveShipFittings,
  shipCollateralFittingLabel,
  shipCustomsFittingLabel,
  shipFittingsCode,
  shipRedemptionFittingLabel,
} from "./ship-fittings";

describe("ship seaworthiness fittings", () => {
  it("derives swung lifeboats, sealed cargo, and a customs brand from raw inputs", () => {
    const card = makeReportCard({ id: "x", symbol: "X" });
    const fittings = deriveShipFittings({
      ...card,
      rawInputs: {
        ...card.rawInputs,
        canBeBlacklisted: true,
        collateralQuality: "rwa",
        redemptionImmediateCapacityRatio: 0.8,
      },
    })!;
    expect(fittings).toMatchObject({
      blacklistStatus: true,
      collateralCargo: "sealed",
      redemptionCapacityRatio: 0.8,
    });
    expect(shipFittingsCode(fittings)).toBeGreaterThan(12);
    expect(shipRedemptionFittingLabel({ fittings })).toContain("fully out");
    expect(shipCollateralFittingLabel({ fittings })).toContain("sealed treasury chests");
    expect(shipCustomsFittingLabel({ fittings })).toContain("customs brand at the plimsoll mark");
  });

  it("maps exotic collateral to mixed crates and keeps missing cards honest", () => {
    const card = makeReportCard({ id: "x", symbol: "X" });
    const fittings = deriveShipFittings({
      ...card,
      rawInputs: {
        ...card.rawInputs,
        collateralQuality: "exotic",
        redemptionImmediateCapacityRatio: null,
      },
    })!;
    expect(fittings?.collateralCargo).toBe("mixed");
    expect(shipCollateralFittingLabel({ fittings })).toContain("mixed open crates");
    expect(shipRedemptionFittingLabel({ fittings })).toContain("Unavailable");
    expect(deriveShipFittings(null)).toBeUndefined();
    expect(shipFittingsCode(undefined)).toBe(0);
  });

  it("keeps exact zero redemption capacity at no deployed lifeboats", () => {
    const card = makeReportCard({ id: "x", symbol: "X" });
    const fittings = deriveShipFittings({
      ...card,
      rawInputs: {
        ...card.rawInputs,
        redemptionImmediateCapacityRatio: 0,
      },
    })!;
    expect(shipFittingsCode(fittings) % 4).toBe(0);
    expect(shipRedemptionFittingLabel({ fittings })).toBe(
      "0% immediate capacity — no lifeboats deployed",
    );
  });
});
