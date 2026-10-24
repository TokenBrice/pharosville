import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeOfDay } from "./time-of-day";
import { createWorldUniforms } from "./uniforms";

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
