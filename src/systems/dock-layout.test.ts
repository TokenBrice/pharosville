import { describe, expect, it } from "vitest";
import {
  STATION_SCALE_LADDER,
  stationFootprint,
  stationScaleFor,
} from "./dock-layout";

describe("station footprint", () => {
  it("uses the whole Ethereum Mole precinct as its clearance envelope", () => {
    expect(stationFootprint("ethereum-mole", 1, 1)).toEqual({ length: 40, span: 30 });
    expect(stationFootprint("ethereum-mole", Number.POSITIVE_INFINITY, 10)).toEqual({
      length: 40,
      span: 30,
    });
  });

  it("keeps the Ethereum Mole hall dimensions in the scale ladder", () => {
    expect(STATION_SCALE_LADDER["ethereum-mole"]).toEqual({
      baseLength: 24,
      span: 10,
      secondLevelTop: 21.5,
    });
    expect(stationScaleFor("ethereum-mole", Number.POSITIVE_INFINITY)).toEqual({
      baseLength: 24,
      span: 10,
      secondLevelTop: 21.5,
      heightScale: 1,
      length: 24,
    });
  });

  it("uses the scale-ladder envelope for an ordinary station", () => {
    const rung = STATION_SCALE_LADDER["pigeonnier-islet"];

    expect(stationFootprint("pigeonnier-islet", 1, 1)).toEqual({
      length: rung.baseLength,
      span: rung.span,
    });
  });
});
