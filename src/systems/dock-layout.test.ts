import { describe, expect, it } from "vitest";
import {
  STATION_LOCAL_BOUNDS,
  STATION_SCALE_LADDER,
  distanceToStationFootprint,
  stationFootprint,
  stationFootprintRect,
  stationScaleFor,
} from "./dock-layout";

describe("station footprint", () => {
  it("returns the Mole's measured cove-rooted precinct bounds", () => {
    expect(stationFootprint("ethereum-mole", Number.POSITIVE_INFINITY, 10)).toEqual({
      minX: -23,
      maxX: 17,
      minZ: -16.5,
      maxZ: 13.6,
      length: 40,
      span: 30.1,
    });
    expect(STATION_LOCAL_BOUNDS["ethereum-mole"].components).toEqual([
      { id: "ethereum-mole-landward", minX: -23, maxX: -3, minZ: -16.5, maxZ: 13.6 },
      { id: "ethereum-mole-long-arm", minX: -5, maxX: 17, minZ: -14.2, maxZ: -6.75 },
      { id: "ethereum-mole-short-arm", minX: -5, maxX: 10, minZ: 6.75, maxZ: 13.6 },
    ]);
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

  it("keeps measured recipe envelopes distinct from hall dimensions", () => {
    const footprint = stationFootprint("pigeonnier-islet", 1, 1);
    expect(footprint).toMatchObject(STATION_LOCAL_BOUNDS["pigeonnier-islet"]);
    expect(footprint.length).toBeCloseTo(22.13, 8);
    expect(footprint.span).toBeCloseTo(6.48, 8);
    expect(footprint.length).toBeGreaterThan(STATION_SCALE_LADDER["pigeonnier-islet"].baseLength);
  });

  it("rotates bounds around their real cove origin", () => {
    const rect = stationFootprintRect("hatago-wharf", { x: 40, y: 50 }, Math.PI / 2);
    expect(distanceToStationFootprint({ x: 40, y: 38 }, rect)).toBe(0);
    expect(distanceToStationFootprint({ x: 40, y: 54 }, rect)).toBe(0);
    expect(distanceToStationFootprint({ x: 40, y: 63 }, rect)).toBeGreaterThan(0);
  });
});
