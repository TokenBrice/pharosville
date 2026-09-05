import { describe, expect, it } from "vitest";
import { Color } from "three";
import {
  DAY_CYCLE_HEIGHT_FOG_PRESETS,
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  GARDEN_SAIL_EMISSIVE,
  dayCyclePhase,
} from "./garden-day-cycle";
import { HARBOR_PALETTE } from "../systems/palette";
import { gardenHeightFogFactor } from "./garden-height-fog";

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
    // Wave 6: the key must own the form. Ambient + hemispheric fill may reveal
    // the cool side, but cannot flatten it back into the key's value register.
    expect(day.dirIntensity).toBeGreaterThan(
      (day.ambientIntensity + day.hemiIntensity) * 3,
    );
  });

  it("keeps dusk gold directional and its indigo fill subordinate", () => {
    const dusk = DAY_CYCLE_LIGHT_PRESETS.dusk;
    expect(dusk.dirIntensity).toBeGreaterThan(
      (dusk.ambientIntensity + dusk.hemiIntensity) * 3,
    );
    // Warm-village B4 (2026-09-05): key 2.6 against a 0.62 fill (ambient
    // raised 0.18 -> 0.28 so the analytic fill stays above the 0.6
    // environment probe) is the authored ~4.2:1 — the ember hour rakes
    // instead of tinting, still well clear of the old ~3:1.
    expect(dusk.dirIntensity / (dusk.ambientIntensity + dusk.hemiIntensity))
      .toBeGreaterThanOrEqual(4);
    // Warm-village B3/B4 (2026-09-05): the retired fog dye was
    // `sky_horizon lerp lantern_warm 0.36` ≈ #886440 brown-grey smog. The
    // ember derivation (lantern_warm → vermillion 0.2, reined to sky_horizon
    // 0.5 after the preview showed 0.35 painting the fleet orange) must be
    // visibly warmer/more chromatic than that, the horizon band must sit
    // warmer than the air above it, and the dusk zenith must be a navy
    // distinct from both the night zenith and the dusk fog.
    const duskSky = DAY_CYCLE_SKY_PRESETS.dusk;
    const retiredFog = new Color(HARBOR_PALETTE.sky_horizon)
      .lerp(new Color(HARBOR_PALETTE.lantern_warm), 0.36);
    expect(duskSky.fog.r - duskSky.fog.b).toBeGreaterThan(retiredFog.r - retiredFog.b);
    expect(duskSky.horizon.r - duskSky.horizon.b).toBeGreaterThan(duskSky.fog.r - duskSky.fog.b);
    const nightZenith = DAY_CYCLE_SKY_PRESETS.night.zenith;
    expect(duskSky.zenith.b).toBeGreaterThan(duskSky.zenith.r);
    // A third of the way to the day zenith: closer to navy than to either end.
    expect(duskSky.zenith.getHex()).not.toBe(new Color(HARBOR_PALETTE.sky_horizon).getHex());
    expect(duskSky.zenith.getHex()).not.toBe(nightZenith.getHex());
    // Height fog thinned 0.00062 -> 0.00035 so the ember reaches the near
    // half; dusk keeps the densest air of the three phases.
    expect(DAY_CYCLE_HEIGHT_FOG_PRESETS.dusk.density).toBeLessThan(0.0005);
  });

  it("keeps moon fill and sail backlight below the night hierarchy", () => {
    const night = DAY_CYCLE_LIGHT_PRESETS.night;
    expect(night.dirIntensity).toBeLessThan(1.5);
    // Item 3 energy audit: the dark-tinted analytic fill must outweigh the
    // environment correction while remaining subordinate to the moon key. The
    // colour split, rather than one oversized hard key, preserves land/sea form.
    expect(night.ambientIntensity).toBeGreaterThanOrEqual(0.25);
    expect(night.hemiIntensity).toBeGreaterThanOrEqual(0.35);
    expect(night.dirIntensity).toBeGreaterThanOrEqual(1);
    expect(night.dirIntensity).toBeGreaterThan(
      night.ambientIntensity + night.hemiIntensity,
    );
    expect(night.ambient.getHex()).not.toBe(new Color(HARBOR_PALETTE.sky_night).getHex());
    expect(night.hemiSky.getHex()).not.toBe(new Color(HARBOR_PALETTE.sky_horizon).getHex());
    expect(GARDEN_SAIL_EMISSIVE.night).toBeGreaterThanOrEqual(0.09);
    expect(GARDEN_SAIL_EMISSIVE.night).toBeLessThanOrEqual(0.1);
    expect(GARDEN_SAIL_EMISSIVE.night).toBeLessThan(GARDEN_SAIL_EMISSIVE.dusk);
    expect(GARDEN_SAIL_EMISSIVE.dusk).toBeGreaterThan(GARDEN_SAIL_EMISSIVE.day);
  });

  it("keeps day fog structured instead of milky", () => {
    const day = DAY_CYCLE_HEIGHT_FOG_PRESETS.day;
    const dusk = DAY_CYCLE_HEIGHT_FOG_PRESETS.dusk;
    const night = DAY_CYCLE_HEIGHT_FOG_PRESETS.night;
    expect(day.density).toBeLessThan(night.density);
    expect(night.density).toBeLessThan(dusk.density);
    expect(day.phaseGain).toBeLessThan(dusk.phaseGain);
    expect(day.horizon.getHex()).toBe(DAY_CYCLE_SKY_PRESETS.day.fog.getHex());
    expect(day.sunTint.getHex()).toBe(DAY_CYCLE_LIGHT_PRESETS.day.dirColor.getHex());

    const nearSea = gardenHeightFogFactor({
      density: day.density,
      distance: 120,
      heightFalloff: day.heightFalloff,
      seaLevel: 0,
      worldY: 0,
    });
    const farSea = gardenHeightFogFactor({
      density: day.density,
      distance: 300,
      heightFalloff: day.heightFalloff,
      seaLevel: 0,
      worldY: 0,
    });
    const farMonument = gardenHeightFogFactor({
      density: day.density,
      distance: 300,
      heightFalloff: day.heightFalloff,
      seaLevel: 0,
      worldY: 8,
    });
    expect(nearSea).toBeLessThan(0.02);
    expect(farSea).toBeGreaterThan(nearSea * 2);
    expect(farSea).toBeLessThan(0.04);
    expect(farMonument).toBeLessThan(0.006);
  });
});
