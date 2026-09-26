import { describe, expect, it } from "vitest";
import {
  HARBOR_NOBORI_ENVELOPE,
  HARBOR_NOBORI_FACING_YAW,
  STATION_LOCAL_BOUNDS,
  STATION_SCALE_LADDER,
  distanceToStationFootprint,
  stationFootprint,
  stationFootprintRect,
  stationNobori,
  stationScaleFor,
  type StationType,
} from "./dock-layout";
import { GARDEN_DOCK_ROOT_Y, GARDEN_WATER_Y } from "./garden-observatory-slice";

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
      { id: "ethereum-mole-short-arm", minX: -5, maxX: 12.4, minZ: 6.75, maxZ: 13.6 },
    ]);
  });

  it("keeps the Ethereum Mole hall dimensions in the scale ladder", () => {
    expect(STATION_SCALE_LADDER["ethereum-mole"]).toEqual({
      baseLength: 24,
      span: 10,
      secondLevelTop: 21.5,
    });
    expect(stationScaleFor("ethereum-mole", Number.POSITIVE_INFINITY, 0.01)).toEqual({
      baseLength: 24,
      span: 10,
      secondLevelTop: 21.5,
      frontageScale: 1,
      heightScale: 1,
      length: 24,
    });
  });

  it("grows the ordinary recognizability ladder in order with the Mole >=1.20x ahead", () => {
    const ordinary = (Object.keys(STATION_SCALE_LADDER) as StationType[])
      .filter((type) => type !== "ethereum-mole");
    const ranked = ordinary.toSorted(
      (left, right) => STATION_SCALE_LADDER[left].secondLevelTop - STATION_SCALE_LADDER[right].secondLevelTop,
    );
    // The authored order survives the 2026-09-05 vertical growth (operator
    // decision A4, zoom-1.0 rest): uogashi stays the lowest ordinary silhouette
    // and storm-mole the tallest, with every rung between keeping its rank.
    expect(ranked).toEqual([
      "uogashi", "fishing-pier", "pigeonnier-islet", "stepped-inlet",
      "tea-house-quay", "reed-boathouse", "hatago-wharf", "storm-mole",
    ]);
    const tops = ordinary.map((type) => STATION_SCALE_LADDER[type].secondLevelTop);
    expect(Math.min(...tops)).toBeCloseTo(13.3, 5);
    expect(Math.max(...tops)).toBeCloseTo(17.9, 5);
    // The Mole's 21.5 landmark cap keeps a >=1.20x lead over the tallest
    // ordinary rung so the ring still reads one civic monument; the band floor
    // (13.3, not the nominal 14) is set by the clone-separation contract in
    // garden-docks.test.ts, which needs >10% height gaps between the
    // footprint-area-close uogashi/fishing-pier/tea-house/storm-mole chain.
    expect(STATION_SCALE_LADDER["ethereum-mole"].secondLevelTop)
      .toBeGreaterThanOrEqual(Math.max(...tops) * 1.2);
  });

  it("allocates monotone, bounded frontage without changing the height ladder", () => {
    const shares = [0.001, 0.01, 0.1, 1];
    const scales = shares.map((share) => stationScaleFor("tea-house-quay", share, 0.1));
    expect(scales.map((scale) => scale.frontageScale)).toEqual([0.75, 0.75, 0.75, 1.25]);
    expect(scales.map((scale) => scale.length)).toEqual([11.25, 11.25, 11.25, 18.75]);
    expect(scales.every((scale) => scale.secondLevelTop === 16.2)).toBe(true);
    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]!.length).toBeGreaterThanOrEqual(scales[index - 1]!.length);
    }
  });

  it("keeps the Mole capped regardless of tracked-supply share", () => {
    const tiny = stationScaleFor("ethereum-mole", 0.0001, 0.1);
    const huge = stationScaleFor("ethereum-mole", 1, 0.001);
    expect(tiny).toEqual(huge);
    expect(huge.secondLevelTop).toBe(21.5);
    expect(huge.frontageScale).toBe(1);
  });

  it("keeps measured recipe envelopes distinct from hall dimensions", () => {
    const footprint = stationFootprint("pigeonnier-islet", 1, 1);
    expect(footprint).toMatchObject(STATION_LOCAL_BOUNDS["pigeonnier-islet"]);
    expect(footprint.length).toBeCloseTo(23.01, 8);
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

describe("station nobori (plan K28)", () => {
  const TYPES = Object.keys(STATION_SCALE_LADDER) as StationType[];
  const docks = TYPES.flatMap((type) => [1, 6, 10].flatMap((size) => [3e7, 2e9, 2e11].flatMap((totalUsd) => (
    [0.01, 1, 100].flatMap((frontageShare) => [0.3, 1.9, -2.6].map((shoreBearing) => ({
      frontageMedianShare: 1,
      frontageShare,
      size,
      station: { shoreBearing, type },
      totalUsd,
    })))
  ))));

  it("flies narrow banners whose tips stay under 13.7 u above the water, inside the exported envelope", () => {
    expect(GARDEN_DOCK_ROOT_Y + HARBOR_NOBORI_ENVELOPE.tipLocalY - GARDEN_WATER_Y).toBeLessThanOrEqual(13.7);
    for (const dock of docks) {
      for (const banner of stationNobori(dock).banners) {
        expect(banner.clothWidth).toBeGreaterThanOrEqual(0.95);
        expect(banner.clothWidth).toBeLessThanOrEqual(1.2);
        expect(banner.clothHeight).toBeGreaterThanOrEqual(3.0);
        expect(banner.clothHeight).toBeLessThanOrEqual(3.8);
        expect(banner.poleTopY).toBeLessThanOrEqual(HARBOR_NOBORI_ENVELOPE.tipLocalY);
        expect(banner.clothBottomY).toBeGreaterThanOrEqual(HARBOR_NOBORI_ENVELOPE.clothBottomLocalY);
        expect(Math.hypot(banner.x, banner.z) + banner.clothWidth).toBeLessThanOrEqual(HARBOR_NOBORI_ENVELOPE.reach);
      }
    }
  });

  it("gives the Mole a pair side by side and every other station one banner", () => {
    for (const dock of docks) {
      const { banners, yaw } = stationNobori(dock);
      if (dock.station.type !== "ethereum-mole") {
        expect(banners).toHaveLength(1);
        continue;
      }
      expect(banners).toHaveLength(2);
      const [first, second] = banners;
      // The second pole stands along the cloth's flight, a gap beyond the first cloth's free edge.
      const along = (second!.x - first!.x) * Math.cos(yaw) - (second!.z - first!.z) * Math.sin(yaw);
      expect(along).toBeGreaterThan(first!.clothWidth);
      expect(Math.hypot(second!.x - first!.x, second!.z - first!.z)).toBeCloseTo(along, 6);
    }
  });

  it("faces every banner along the rest seat's yaw whatever the shore bearing", () => {
    for (const dock of docks) {
      expect(stationNobori(dock).yaw - dock.station.shoreBearing).toBeCloseTo(HARBOR_NOBORI_FACING_YAW, 9);
    }
  });
});
