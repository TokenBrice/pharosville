import { describe, expect, it } from "vitest";
import type { ShipMotionSegmentKind } from "./motion-types";
import {
  GARDEN_ARRIVAL_BEAT_CAP_FULL,
  GARDEN_SAIL_DIP_MIN_SCALE,
  gardenArrivalBeatEnvelope,
  selectGardenArrivalBeatShipDetailIds,
} from "./garden-arrival-beats";

function sample(kind: ShipMotionSegmentKind, secondsInto: number, secondsRemaining: number) {
  return { segment: { kind, secondsInto, secondsRemaining } };
}

describe("gardenArrivalBeatEnvelope", () => {
  it("is quiet outside the dock beat windows", () => {
    expect(gardenArrivalBeatEnvelope(sample("risk-rest", 20, 200))).toEqual({
      furl: 0,
      bowWave: 0,
      nameplate: false,
    });
    expect(gardenArrivalBeatEnvelope(sample("arrival-transit", 20, 20))).toEqual({
      furl: 0,
      bowWave: 0,
      nameplate: false,
    });
  });

  it("dips on arrival, holds briefly, and fully recovers by four seconds", () => {
    const arrival = [0, 0.6, 1.2, 2.2, 3.1, 4].map((secondsInto) => (
      gardenArrivalBeatEnvelope(sample("dock-dwell", secondsInto, 100 - secondsInto)).furl
    ));
    expect(arrival).toEqual([0, 0.5, 1, 1, 0.5, 0]);
  });

  it("keeps a ship fully set thirty seconds into dock dwell", () => {
    const beat = gardenArrivalBeatEnvelope(sample("dock-dwell", 30, 70));
    expect(beat).toEqual({ furl: 0, bowWave: 0, nameplate: false });
    expect(1 - beat.furl * (1 - GARDEN_SAIL_DIP_MIN_SCALE)).toBe(1);
  });

  it("dips before departure and recovers continuously through two transit seconds", () => {
    const departure = [4, 3.4, 2.8, 1.8].map((secondsRemaining) => (
      gardenArrivalBeatEnvelope(sample("dock-dwell", 100 - secondsRemaining, secondsRemaining)).furl
    ));
    expect(departure[0]).toBe(0);
    expect(departure[1]).toBeCloseTo(0.5);
    expect(departure[2]).toBe(1);
    expect(departure[3]).toBe(1);
    const castOff = gardenArrivalBeatEnvelope(sample("dock-dwell", 100, 0)).furl;
    const transit = [0, 1, 2, 3].map((secondsInto) => (
      gardenArrivalBeatEnvelope(sample("departure-transit", secondsInto, 120 - secondsInto)).furl
    ));
    expect(castOff).toBeGreaterThan(0);
    expect(castOff).toBeLessThan(1);
    expect(transit[0]).toBe(castOff);
    expect(transit[1]).toBeGreaterThan(0);
    expect(transit[1]).toBeLessThan(castOff);
    expect(transit[2]).toBe(0);
    expect(transit[3]).toBe(0);
  });

  it("peaks the arrival bow wave, decays it in two seconds, and names for three", () => {
    expect(gardenArrivalBeatEnvelope(sample("dock-dwell", 0, 100))).toEqual({
      furl: 0,
      bowWave: 1,
      nameplate: true,
    });
    const middle = gardenArrivalBeatEnvelope(sample("dock-dwell", 1, 99));
    expect(middle.bowWave).toBeCloseTo(0.5);
    expect(middle.nameplate).toBe(true);
    expect(gardenArrivalBeatEnvelope(sample("dock-dwell", 2, 98)).bowWave).toBe(0);
    expect(gardenArrivalBeatEnvelope(sample("dock-dwell", 3, 97)).nameplate).toBe(false);
  });

  it("emits one decaying stern envelope in transit", () => {
    expect(gardenArrivalBeatEnvelope(sample("dock-dwell", 96.5, 3.5)).nameplate).toBe(false);
    expect(gardenArrivalBeatEnvelope(sample("dock-dwell", 97, 3)).nameplate).toBe(true);
    expect(gardenArrivalBeatEnvelope(sample("departure-transit", 0, 120)).bowWave).toBe(1);
    expect(gardenArrivalBeatEnvelope(sample("departure-transit", 1, 119)).bowWave).toBeCloseTo(0.5);
    expect(gardenArrivalBeatEnvelope(sample("departure-transit", 2, 118)).bowWave).toBe(0);
    expect(gardenArrivalBeatEnvelope(sample("departure-transit", 1, 119)).nameplate).toBe(false);
  });

  it("returns the exact quiet envelope for reduced motion", () => {
    expect(gardenArrivalBeatEnvelope(sample("dock-dwell", 0, 100), true)).toEqual({
      furl: 0,
      bowWave: 0,
      nameplate: false,
    });
  });
});

describe("selectGardenArrivalBeatShipDetailIds", () => {
  it("caps readable beats at six by market cap with a stable id tie-break", () => {
    const ships = Array.from({ length: 9 }, (_, index) => ({
      detailId: `ship-detail-${index}`,
      id: `ship-${index}`,
      marketCapUsd: index === 7 || index === 8 ? 700 : index * 100,
    }));
    const samples = new Map(ships.map((ship) => [ship.id, sample("dock-dwell", 1, 99)]));

    expect(selectGardenArrivalBeatShipDetailIds(ships, samples, false)).toEqual([
      "ship-detail-7",
      "ship-detail-8",
      "ship-detail-6",
      "ship-detail-5",
      "ship-detail-4",
      "ship-detail-3",
    ]);
    expect(selectGardenArrivalBeatShipDetailIds(ships, samples, false)).toHaveLength(
      GARDEN_ARRIVAL_BEAT_CAP_FULL,
    );
    expect(selectGardenArrivalBeatShipDetailIds(ships, samples, true)).toEqual([]);
  });
});
