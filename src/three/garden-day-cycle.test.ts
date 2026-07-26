import { describe, expect, it } from "vitest";
import { Color } from "three";
import {
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  dayCyclePhase,
} from "./garden-day-cycle";
import { HARBOR_PALETTE } from "../systems/palette";

describe("dayCyclePhase (G4 dusk fix)", () => {
  it("holds full daylight through midday", () => {
    const phase = dayCyclePhase(12);
    expect(phase.daylight).toBe(1);
    expect(phase.dusk).toBe(0);
    expect(phase.night).toBe(0);
  });

  it("keeps the late afternoon lit instead of collapsing to night", () => {
    // The old sine curve was already 0 by 18:30; the G4 curve still has
    // meaningful daylight at 17:30 while dusk rises.
    const phase = dayCyclePhase(17.5);
    expect(phase.daylight).toBeGreaterThan(0.5);
    expect(phase.dusk).toBeGreaterThan(0.5);
  });

  it("makes 18:30 a genuine dusk state, not early night", () => {
    const phase = dayCyclePhase(18.5);
    expect(phase.dusk).toBe(1);
    // Night yields to dusk so the ember horizon owns the frame.
    expect(phase.night).toBeLessThan(0.15);
  });

  it("covers the whole 17:00–20:00 window with a dominant dusk factor", () => {
    for (const hour of [17, 17.5, 18, 18.5, 19, 19.5]) {
      const phase = dayCyclePhase(hour);
      expect(phase.dusk, `dusk at ${hour}`).toBeGreaterThan(0.5);
      expect(phase.night, `night at ${hour}`).toBeLessThan(0.5);
    }
  });

  it("resolves deep night by 23:00", () => {
    const phase = dayCyclePhase(23);
    expect(phase.daylight).toBe(0);
    expect(phase.dusk).toBe(0);
    expect(phase.night).toBe(1);
  });

  it("wraps negative and >24 hours", () => {
    expect(dayCyclePhase(-1)).toEqual(dayCyclePhase(23));
    expect(dayCyclePhase(36.5)).toEqual(dayCyclePhase(12.5));
  });
});

describe("day-cycle presets (C1 contract)", () => {
  it("derives every sky preset from HARBOR_PALETTE", () => {
    expect(`#${DAY_CYCLE_SKY_PRESETS.day.zenith.getHexString()}`).toBe(HARBOR_PALETTE.sky_day_zenith);
    expect(`#${DAY_CYCLE_SKY_PRESETS.day.horizon.getHexString()}`).toBe(HARBOR_PALETTE.sky_day_horizon);
    expect(`#${DAY_CYCLE_SKY_PRESETS.day.fog.getHexString()}`).toBe(HARBOR_PALETTE.fog_day);
    expect(`#${DAY_CYCLE_SKY_PRESETS.night.zenith.getHexString()}`).toBe(HARBOR_PALETTE.sky_night);
  });

  it("lights the ukiyo-e day with a warm key and a cool sky fill", () => {
    const day = DAY_CYCLE_LIGHT_PRESETS.day;
    expect(`#${day.dirColor.getHexString()}`).toBe(HARBOR_PALETTE.sun_day_warm);
    expect(`#${day.hemiSky.getHexString()}`).toBe(HARBOR_PALETTE.sky_day_zenith);
    // Warm key / cool fill split: the key is warmer (higher R–B) than the fill.
    const key = new Color(HARBOR_PALETTE.sun_day_warm);
    const fill = new Color(HARBOR_PALETTE.sky_day_zenith);
    expect(key.r - key.b).toBeGreaterThan(fill.r - fill.b);
  });
});
