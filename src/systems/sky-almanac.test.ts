import { describe, expect, it } from "vitest";
import {
  GARDEN_REST_VIEW_AZIMUTH,
  gardenMoonStateAt,
  gardenRestViewHalfWidthRad,
  gardenSkyDayFromParts,
  gardenSkyLatitudeForZone,
} from "./sky-almanac";

const NORTH = { latitudeRad: (35 * Math.PI) / 180, southern: false };
const day = (month: number, dayOfMonth: number) => gardenSkyDayFromParts({
  year: 2026,
  month,
  day: dayOfMonth,
  utcOffsetHours: 2,
  dstHours: 1,
  latitude: NORTH,
});

describe("sky almanac moon", () => {
  it("knows the harvest full moon and the following new moon", () => {
    // Full moon 2026-09-26 ~16:49 UTC; new moon 2026-10-10 ~15:50 UTC.
    expect(gardenMoonStateAt(day(9, 26), 18.8, 1.6).illumination).toBeGreaterThan(0.99);
    expect(gardenMoonStateAt(day(10, 10), 17.8, 1.6).illumination).toBeLessThan(0.02);
    expect(gardenMoonStateAt(day(10, 3), 12, 1.6).waxing).toBe(false);
  });

  it("keeps the displayed disc inside the rest view's sky window at every aspect, rising left", () => {
    for (const aspect of [0.8, 1.25, 1.6, 1.875]) {
      const limit = 0.85 * gardenRestViewHalfWidthRad(aspect);
      let previousPresence = 1;
      let rises = 0;
      for (let minute = 0; minute < 1440; minute += 5) {
        const moon = gardenMoonStateAt(day(9, 26), minute / 60, aspect);
        const offset = moon.azimuthRad - GARDEN_REST_VIEW_AZIMUTH;
        if (previousPresence === 0 && moon.presence > 0) {
          rises += 1;
          expect(offset).toBeLessThan(0);
        }
        previousPresence = moon.presence;
        if (!moon.up) continue;
        expect(Math.abs(offset)).toBeLessThanOrEqual(limit + 1e-9);
        expect(moon.elevationRad).toBeLessThan((9.01 * Math.PI) / 180);
      }
      expect(rises).toBe(1);
    }
    // The tall 720×900 gate keeps the moon within ±11°.
    expect(0.85 * gardenRestViewHalfWidthRad(0.8) * (180 / Math.PI)).toBeCloseTo(11, 0);
  });
});

describe("sky almanac hemisphere", () => {
  it("puts southern zones south of the equator by name", () => {
    expect(gardenSkyLatitudeForZone("Australia/Brisbane", 2026).southern).toBe(true);
    expect(gardenSkyLatitudeForZone("America/Sao_Paulo", 2026).latitudeRad).toBeLessThan(0);
    expect(gardenSkyLatitudeForZone("Asia/Tokyo", 2026).southern).toBe(false);
  });
});
