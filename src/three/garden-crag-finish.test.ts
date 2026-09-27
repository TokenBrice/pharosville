import { describe, expect, it } from "vitest";
import { UNAVAILABLE_SUPPLY_TIDE, type SupplyTide } from "../systems/supply-tide";
import { gardenCragStrandline } from "./garden-crag-finish";
import { tideStrandlineRise } from "./garden-tide-line";

describe("gardenCragStrandline", () => {
  it("carries a real week's strandline onto the crag's wet skirt", () => {
    for (const tide of [
      { change7dPct: 1, offset: 0.7, state: "flood" },
      { change7dPct: -1, offset: -0.7, state: "ebb" },
      { change7dPct: 0, offset: 0, state: "slack" },
    ] satisfies SupplyTide[]) {
      expect(gardenCragStrandline(tide)).toBeCloseTo(tideStrandlineRise(tide), 10);
    }
  });

  it("reports no strandline at all when the tide was never measured", () => {
    // A missing payload must not paint the skirt to any height a real week
    // could produce (0 … 2 × datum): the shader treats < 0 as "no reading".
    expect(gardenCragStrandline(UNAVAILABLE_SUPPLY_TIDE)).toBeLessThan(0);
    expect(gardenCragStrandline(undefined)).toBeLessThan(0);
  });
});
