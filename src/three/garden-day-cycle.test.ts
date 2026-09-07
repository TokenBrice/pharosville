import { describe, expect, it } from "vitest";
import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import {
  DAY_CYCLE_HEIGHT_FOG_PRESETS,
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  GARDEN_SAIL_EMISSIVE,
  dayCyclePhase,
  updateDayCycle,
} from "./garden-day-cycle";
import { GARDEN_ENVIRONMENT_INTENSITY } from "./garden-environment";
import { HARBOR_PALETTE } from "../systems/palette";
import { gardenHeightFogFactor } from "./garden-height-fog";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";

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
    // T1.8 midday fill cut (2026-09-07): ambient 0.22 -> 0.20, hemi 0.5 ->
    // 0.42. Midday was the flattest hour in the piece; the key:fill ratio goes
    // 4.58:1 -> 5.32:1 and the honey key gets two more stops of ladder.
    expect(day.ambientIntensity).toBe(0.2);
    expect(day.hemiIntensity).toBe(0.42);
    expect(day.dirIntensity / (day.ambientIntensity + day.hemiIntensity))
      .toBeGreaterThan(5.3);
  });

  it("keeps every analytic fill above the environment probe it corrects", () => {
    // THE FLOOR under T1.8, pinned here so the next fill cut fails loudly.
    // `garden-environment.ts` treats the PMREM probe as a small CORRECTION on
    // top of the analytic fill, never a second fill light, and
    // garden-environment.test.ts asserts that ordering for every preset — so
    // ambient + hemi must stay strictly ABOVE GARDEN_ENVIRONMENT_INTENSITY
    // (0.6). The day preset is the tightest of the three at 0.20 + 0.42 =
    // 0.62: two hundredths of headroom. Cutting the day fill any further means
    // moving GARDEN_ENVIRONMENT_INTENSITY first, not just this number.
    for (const [name, preset] of Object.entries(DAY_CYCLE_LIGHT_PRESETS)) {
      expect(
        preset.ambientIntensity + preset.hemiIntensity,
        `${name} analytic fill must stay above the probe`,
      ).toBeGreaterThan(GARDEN_ENVIRONMENT_INTENSITY);
    }
    expect(
      DAY_CYCLE_LIGHT_PRESETS.day.ambientIntensity
      + DAY_CYCLE_LIGHT_PRESETS.day.hemiIntensity
      - GARDEN_ENVIRONMENT_INTENSITY,
    ).toBeCloseTo(0.02, 6);
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
    // Golden Garden (2026-09-07): the retired fog dye was
    // `sky_horizon lerp lantern_warm 0.36` ≈ #886440 brown-grey smog, and the
    // warm-village fix that reined the ember toward navy still mixed orange
    // into grey. Ember reads as light only against its complement, so the
    // contract is now a SPLIT: the horizon band carries the ember and must be
    // visibly warmer than the retired smog; the fog above it is the violet
    // side (bluer than it is red) and cooler than the horizon; and the dusk
    // zenith is a violet-blue distinct from both night and the fog.
    const duskSky = DAY_CYCLE_SKY_PRESETS.dusk;
    const retiredFog = new Color("#886440");
    expect(duskSky.horizon.r - duskSky.horizon.b).toBeGreaterThan(retiredFog.r - retiredFog.b);
    expect(duskSky.fog.r - duskSky.fog.b).toBeLessThan(duskSky.horizon.r - duskSky.horizon.b);
    expect(duskSky.fog.b).toBeGreaterThan(duskSky.fog.r);
    const nightZenith = DAY_CYCLE_SKY_PRESETS.night.zenith;
    expect(duskSky.zenith.b).toBeGreaterThan(duskSky.zenith.r);
    expect(duskSky.zenith.getHex()).not.toBe(new Color(HARBOR_PALETTE.sky_horizon).getHex());
    expect(duskSky.zenith.getHex()).not.toBe(nightZenith.getHex());
    expect(duskSky.zenith.getHex()).not.toBe(duskSky.fog.getHex());
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

/**
 * Minimal `updateDayCycle` rig for T0.2. Everything the frame path needs and
 * nothing it does not — the aperture handles are the subject; the rest exists
 * only so the function reaches them.
 */
function dayCycleRig() {
  const stationWindows = new Mesh(
    new SphereGeometry(1, 3, 2),
    new MeshStandardMaterial({ emissiveIntensity: 1.6, toneMapped: false }),
  );
  const towerWindow = new MeshStandardMaterial({ emissiveIntensity: 0.24 });
  // The island's two stone path lanterns share one lamp material.
  const islandLantern = new MeshStandardMaterial({ emissiveIntensity: 1.15, toneMapped: false });
  const scene = {
    ambientLight: new AmbientLight(),
    content: {
      beacon: new Mesh(new SphereGeometry(1, 3, 2), new MeshStandardMaterial()),
      beaconFire: {
        mirrorMaterial: new MeshStandardMaterial(),
        smokeMaterial: new ShaderMaterial({
          uniforms: { uDayMix: { value: 0 }, uOpacity: { value: 0 } },
        }),
        uniforms: { uIntensity: { value: 0 } },
      },
      beaconHalo: new Mesh(new SphereGeometry(1, 3, 2), new MeshBasicMaterial()),
      beam: new Group(),
      fleetSailMaterial: null,
      harborBatch: {
        bucketMeshes: { window: stationWindows },
        fineDetailBucketMeshes: { window: null },
      },
      harborLanternMaterial: new MeshStandardMaterial(),
      islandLanternMaterial: islandLantern,
      lighthouseLight: new PointLight(),
      lighthouseWindowMaterials: [towerWindow],
      shipLanternGlowMaterial: new MeshBasicMaterial(),
      shipLanternMaterial: new MeshStandardMaterial(),
      shipShadows: new InstancedMesh(new CircleGeometry(1, 3), new MeshBasicMaterial(), 1),
      ships: [],
      statueGleamMaterials: [],
    },
    directionalLight: new DirectionalLight(),
    hemisphereLight: new HemisphereLight(),
  };
  const frame = {
    reducedMotion: true,
    seaState: { source: { psiStress: 0 } },
    timeSeconds: 0,
  } as unknown as ThreeWorldRendererFrame;
  const at = (hour: number) => {
    updateDayCycle(scene, frame, dayCyclePhase(hour));
    return {
      islandLantern: islandLantern.emissiveIntensity,
      station: (stationWindows.material as MeshStandardMaterial).emissiveIntensity,
      tower: towerWindow.emissiveIntensity,
    };
  };
  return { at, scene };
}

describe("T0.2 building apertures (2026-09-07)", () => {
  it("lights every window at dusk and night instead of freezing them", () => {
    // VISUAL_INVARIANTS.md:115 promised "windows glow at dusk/night" from
    // W4.5 onward and NOTHING drove them: station apertures sat at a constant
    // 1.6 and the tower's at 0.24, so the harbour was as lit at noon as at
    // midnight. Both now ride the harbour-lantern curve shape.
    const { at } = dayCycleRig();
    const noon = at(12);
    const dusk = at(18.5);
    const midnight = at(1);

    expect(noon.station).toBeCloseTo(0.35, 6);
    expect(dusk.station).toBeGreaterThan(1.7);
    expect(midnight.station).toBeCloseTo(2.1, 6);
    expect(noon.tower).toBeCloseTo(0.18, 6);
    expect(dusk.tower).toBeGreaterThan(1);
    expect(midnight.tower).toBeCloseTo(1.53, 6);

    // T0.2 remainder: the island path lanterns, the world's last constant
    // aperture. Frozen 1.15 -> 0.22 day / 1.37 dusk / 1.97 night. They take
    // the harbour-LANTERN curve shape (a small warm point), not the station
    // window one, lifted 0.04 at the day end because they stand in a pale
    // gravel sweep in full sun, and held 0.11 below the harbour lanterns'
    // 2.08 night peak because they share the island with the beacon.
    expect(noon.islandLantern).toBeCloseTo(0.22, 6);
    expect(dusk.islandLantern).toBeGreaterThan(1.3);
    expect(midnight.islandLantern).toBeCloseTo(1.97, 6);
    expect(midnight.islandLantern).toBeLessThan(0.18 + 1.9);

    for (const key of ["islandLantern", "station", "tower"] as const) {
      expect(noon[key], `${key} must be dimmest at noon`).toBeLessThan(dusk[key]);
      expect(dusk[key], `${key} must peak at night`).toBeLessThan(midnight[key]);
    }
    // The Pharos' own windows stay under the quay's so they read as a lit
    // stair, never as a second signal beside the beacon.
    expect(midnight.tower).toBeLessThan(midnight.station);
  });

  it("keeps the ember peaks under the tone-mapping clip", () => {
    // The station bucket is `toneMapped: false`; anything much past ~2.2 rolls
    // off to white pinpricks instead of staying gold (same ceiling as the ship
    // lanterns). Sweep the clock rather than trusting the endpoints.
    const { at } = dayCycleRig();
    for (let hour = 0; hour < 24; hour += 0.25) {
      const lit = at(hour);
      expect(lit.station, `station window at ${hour}h`).toBeLessThanOrEqual(2.2);
      expect(lit.tower, `tower window at ${hour}h`).toBeLessThanOrEqual(2.2);
      expect(lit.islandLantern, `island lantern at ${hour}h`).toBeLessThanOrEqual(2.2);
    }
  });

  it("degrades to a no-op when the aperture handles are absent", () => {
    // The handles are wired in world-renderer; day-cycle must never assume
    // them (an un-wired build renders, it just does not glow).
    const { at, scene } = dayCycleRig();
    scene.content.harborBatch = null as never;
    scene.content.lighthouseWindowMaterials = undefined as never;
    // The island lantern handle lands in the same pass and must degrade the
    // same way: absent, and null, both no-op.
    scene.content.islandLanternMaterial = null as never;
    expect(() => at(18.5)).not.toThrow();
    delete (scene.content as { islandLanternMaterial?: unknown }).islandLanternMaterial;
    expect(() => at(18.5)).not.toThrow();
  });
});
