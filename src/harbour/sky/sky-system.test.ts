import { describe, expect, it } from "vitest";
import { NOMINAL_LATITUDE, solarDay } from "../season/calendar";
import { antiSolarTh, isDusk, sunElevationDeg, twilightSunAzimuth, twilightWindow } from "./twilight";

describe("E22 twilight: the real sun's angle opens the wedge (calendar only)", () => {
  const days = [20, 115, 196, 293, 313];

  it("puts the sun on the horizon at sunrise and sunset, and at the calendar's noon height at noon", () => {
    for (const doy of days) for (const lat of [NOMINAL_LATITUDE, -NOMINAL_LATITUDE]) {
      const d = solarDay(doy, lat, 0);
      expect(Math.abs(sunElevationDeg(d.sunrise, d.sunrise, d.sunset, lat))).toBeLessThan(1e-6);
      expect(Math.abs(sunElevationDeg(d.sunset, d.sunrise, d.sunset, lat))).toBeLessThan(1e-6);
      expect(sunElevationDeg((d.sunrise + d.sunset) / 2, d.sunrise, d.sunset, lat)).toBeCloseTo(d.noonElevation, 6);
    }
  });

  it("is open only while the sun stands between +3° and −9°, fullest from sunset into the blue hour", () => {
    for (let el = 3; el <= 60; el += 0.5) expect(twilightWindow(el).k).toBe(0);
    for (let el = -9; el >= -40; el -= 0.5) expect(twilightWindow(el).k).toBe(0);
    for (let el = -4.5; el <= 1.5; el += 0.25) expect(twilightWindow(el).k).toBeCloseTo(1, 6);
    for (let el = -8.9; el < 2.9; el += 0.1) expect(twilightWindow(el).k).toBeGreaterThan(0);
  });

  it("raises the Earth's shadow as the sun sinks", () => {
    let last = -Infinity;
    for (let el = 2; el >= -7; el -= 0.25) {
      const top = twilightWindow(el).shadowTop;
      expect(top).toBeGreaterThan(last);
      last = top;
    }
    // it clears the far hills and the horizon haze (≈ 0.6°) at sunset and stays inside the ~5° band
    expect(twilightWindow(3).shadowTop).toBeLessThan(0.65);
    expect(twilightWindow(-9).shadowTop).toBeLessThan(2.7);
  });

  it("frames the H/N hours of a November day: dawn, sunset and blue hour in, golden, day and night out", () => {
    const d = solarDay(313, NOMINAL_LATITUDE, 0);
    const k = (t: number) => twilightWindow(sunElevationDeg(t, d.sunrise, d.sunset, NOMINAL_LATITUDE)).k;
    for (const t of [9, 11, 16.4, 22, 3]) expect(k(t)).toBe(0);
    for (const t of [6.9, 17.1, 17.6]) expect(k(t)).toBeGreaterThan(0.5);
    expect(isDusk(17.6, d.sunrise, d.sunset)).toBe(true);
    expect(isDusk(6.9, d.sunrise, d.sunset)).toBe(false);
  });

  it("faces the wedge away from the scene's sun (its own sunrise/sunset keys, never a moved disc)", () => {
    for (const th of [-170, -90, -30, 0, 30, 90, 170]) {
      const anti = antiSolarTh(th);
      expect(anti).toBeGreaterThanOrEqual(-180);
      expect(anti).toBeLessThan(180);
      expect(Math.abs(Math.cos(((anti - th) * Math.PI) / 180) + 1)).toBeLessThan(1e-9);
    }
    // the TimeOfDay keys: sunset west of the noon key, sunrise east of it; a short day swings both toward noon
    expect(twilightSunAzimuth(true, 6, 19.85)).toBeCloseTo(298, 6);
    expect(twilightSunAzimuth(false, 6, 19.85)).toBeCloseTo(60, 6);
    expect(twilightSunAzimuth(true, 6.8, 17.2)).toBeLessThan(298);
    expect(twilightSunAzimuth(false, 6.8, 17.2)).toBeGreaterThan(60);
  });
});
