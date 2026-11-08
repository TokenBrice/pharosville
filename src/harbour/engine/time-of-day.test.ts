import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_AIR, DEFAULT_KEYFRAMES, MORNING_AIR, TimeOfDay } from "./time-of-day";
import { createWorldUniforms } from "./uniforms";
import { SKY_BAND_GLSL, SKY_GRADIENT_DEG, SKY_LIFT, SKY_LIFT_DEG } from "../sky/sky-glsl";

describe("local hour cache", () => {
  beforeEach(() => vi.stubGlobal("location", { search: "", hash: "" }));
  afterEach(() => vi.unstubAllGlobals());

  it("derives local time only once per wall-clock second, including backwards clock jumps", () => {
    const tod = new TimeOfDay(), u = createWorldUniforms();
    const getHours = vi.spyOn(Date.prototype, "getHours");
    const now = new Date(2026, 9, 19, 12, 34, 56, 100).getTime();
    tod.update(now, 0, u);
    tod.update(now + 100, 0.1, u);
    expect(getHours).toHaveBeenCalledTimes(1);
    expect(tod.clockHour).toBe(12 + 34 / 60 + 56 / 3600);
    tod.update(now + 1000, 1, u);
    expect(getHours).toHaveBeenCalledTimes(2);
    expect(tod.clockHour).toBe(12 + 34 / 60 + 57 / 3600);
    tod.update(now - 1000, 2, u);
    expect(getHours).toHaveBeenCalledTimes(3);
    expect(tod.clockHour).toBe(12 + 34 / 60 + 55 / 3600);
    getHours.mockRestore();
  });

  it("always resets uniforms and grade even when the local hour stays cached or pinned", () => {
    const tod = new TimeOfDay(), u = createWorldUniforms();
    const now = new Date(2026, 9, 19, 12, 0, 0, 100).getTime();
    tod.update(now, 0, u);
    const sun = u.uSunColor.value.clone(), saturation = tod.grade.saturation;
    u.uSunColor.value.setRGB(0, 0, 0);
    tod.grade.saturation = -10;
    tod.update(now + 10, 0.01, u);
    expect(u.uSunColor.value.equals(sun)).toBe(true);
    expect(tod.grade.saturation).toBe(saturation);
    tod.setHour(12);
    tod.update(now, 0, u);
    tod.grade.saturation = -10;
    tod.update(now, 0, u);
    expect(tod.grade.saturation).toBe(saturation);
    tod.setHour(null);
    tod.speed = 2;
    tod.update(now, 3600, u);
    expect(tod.clockHour).toBe(13);
  });
});

describe("E03a hero value lock", () => {
  const key = (hour: number) => DEFAULT_KEYFRAMES.find((k) => k.hour === hour)!;
  const close = (hex: string, authored: string, k = DAY_AIR) => {
    const a = new THREE.Color(hex), b = new THREE.Color(authored).multiplyScalar(k);
    for (const c of ["r", "g", "b"] as const) expect(a[c]).toBeCloseTo(b[c], 2);
  };

  it("sets the day keys' horizon and haze DAY_AIR below their authored colours (linear), one air for sky, sea and fog", () => {
    expect(DAY_AIR).toBeLessThanOrEqual(0.85);
    close(key(12).horizon, "#E8F1F4"); close(key(12).haze, "#BCD3DF");
    close(key(16).horizon, "#F2E6D6"); close(key(16).haze, "#C9C6C8");
  });

  it("clears the back-lit morning's air a step below noon's and lifts its key no higher than the afternoon's", () => {
    expect(MORNING_AIR).toBeLessThan(1);
    expect(MORNING_AIR).toBeGreaterThanOrEqual(0.8);
    close(key(8.5).horizon, "#E6EEF0", DAY_AIR * MORNING_AIR); close(key(8.5).haze, "#C2D3DC", DAY_AIR * MORNING_AIR);
    expect(key(8.5).sunIntensity).toBeLessThanOrEqual(key(16).sunIntensity);
    expect(key(8.5).sunIntensity).toBeGreaterThan(key(6.4).sunIntensity);
  });

  it("leaves the dawn, golden and night keys their own light", () => {
    expect(key(6.4).horizon).toBe("#FAC8A4");
    expect(key(18.5).horizon).toBe("#FFD8A8");
    expect(key(22).horizon).toBe("#1D2740");
    expect(key(22).haze).toBe("#151C30");
  });

  it("gives the sky band a steeper gradient and a horizon lift confined below 1°", () => {
    expect(SKY_GRADIENT_DEG).toBeLessThanOrEqual(4.5);
    expect(SKY_LIFT_DEG).toBeLessThanOrEqual(1);
    expect(SKY_LIFT).toBeLessThan(0.35);
    expect(SKY_BAND_GLSL).toContain(`clamp(e / ${SKY_GRADIENT_DEG.toFixed(2)}, 0.0, 1.0)`);
    expect(SKY_BAND_GLSL).toContain(`smoothstep(0.0, ${SKY_LIFT_DEG.toFixed(2)}, e)`);
    expect(SKY_BAND_GLSL).not.toContain("e / 6.5");
  });
});
