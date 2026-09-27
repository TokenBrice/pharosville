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
  SphereGeometry,
} from "three";
import {
  DAY_CYCLE_HEIGHT_FOG_PRESETS,
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_MOONLESS_KEY,
  DAY_CYCLE_SKY_PRESETS,
  GARDEN_SAIL_EMISSIVE,
  dayCycleBeats,
  dayCyclePhase,
  updateDayCycle,
} from "./garden-day-cycle";
import { GARDEN_BLOOM_PRACTICAL_THRESHOLD } from "./garden-post";
import { HARBOR_PALETTE } from "../systems/palette";
import { gardenSkyDayFromParts, gardenSkyToday, gardenSolarElevationAt } from "../systems/sky-almanac";
import { gardenHeightFogFactor } from "./garden-height-fog";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";

describe("five-beat light score", () => {
  it("forms a continuous adjacent partition throughout the clock", () => {
    const order = ["night", "dawn", "day", "golden", "blue", "night"];
    for (let minute = 0; minute < 1440; minute += 1) {
      const hour = minute / 60;
      const beats = dayCycleBeats(hour);
      const active = Object.entries(beats).filter(([, weight]) => weight > 0);
      expect(Object.values(beats).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
      expect(active.length).toBeLessThanOrEqual(2);
      for (const weight of Object.values(beats)) expect(weight).toBeGreaterThanOrEqual(0);
      if (active.length === 2) {
        expect(order.some((name, index) =>
          active.some(([key]) => key === name)
          && active.some(([key]) => key === order[index + 1]))).toBe(true);
      }
      const next = dayCycleBeats(hour + 1 / 60);
      for (const name of Object.keys(beats) as (keyof typeof beats)[]) {
        expect(Math.abs(next[name] - beats[name])).toBeLessThan(0.04);
      }
      const phase = dayCyclePhase(hour);
      expect(phase.daylight).toBe(beats.day + 0.5 * (beats.dawn + beats.golden));
      expect(phase.dusk).toBe(0.5 * (beats.dawn + beats.golden) + beats.blue);
      expect(phase.night).toBe(beats.night);
    }
  });

  it("keys the beats to the sun: golden ends at sunset, blue follows it, night by nautical dusk", () => {
    // The suite's pinned sky day (test-setup): 26 Sep, 35° N, sunset ≈ 18:54.
    const day = gardenSkyToday();
    const elevationAt = (hour: number) => gardenSolarElevationAt(day, hour) * (180 / Math.PI);
    expect(dayCycleBeats(12.25).day).toBe(1);
    expect(dayCycleBeats(18.5).golden).toBe(1);
    const goldenLeft = dayCycleBeats(day.sunsetHour);
    expect(goldenLeft.golden).toBeGreaterThan(0.4);
    expect(goldenLeft.blue).toBeGreaterThan(0.4);
    expect(elevationAt(19.2)).toBeLessThan(0);
    expect(dayCycleBeats(19.2).blue).toBeGreaterThan(0.95);
    expect(elevationAt(20)).toBeLessThan(-12);
    expect(dayCycleBeats(20).night).toBe(1);
    expect(dayCycleBeats(-1)).toEqual(dayCycleBeats(23));
    expect(dayCycleBeats(36.5)).toEqual(dayCycleBeats(12.5));
  });

  it("follows the date and the hemisphere (O11)", () => {
    const on = (month: number, dayOfMonth: number, dstHours: number, southern: boolean) => gardenSkyDayFromParts({
      year: 2026,
      month,
      day: dayOfMonth,
      utcOffsetHours: 1 + dstHours,
      dstHours,
      latitude: { latitudeRad: (southern ? -35 : 35) * (Math.PI / 180), southern },
    });
    // December darkens before five; June is still gold after eight.
    expect(dayCycleBeats(17, on(12, 15, 0, false)).blue).toBeGreaterThan(0.8);
    expect(dayCycleBeats(19.75, on(6, 21, 1, false)).golden).toBeGreaterThan(0.5);
    // South of the equator the same December evening is a long summer day.
    expect(dayCycleBeats(17, on(12, 15, 0, true)).day).toBe(1);
  });

  it("keeps the night rig a moon rim over restrained fill", () => {
    const scene = {
      ambientLight: new AmbientLight(),
      hemisphereLight: new HemisphereLight(),
      directionalLight: new DirectionalLight(),
      content: null,
    };
    const frame = { wallClockHour: 23 } as ThreeWorldRendererFrame;
    updateDayCycle(scene, frame, dayCyclePhase(23));
    const night = DAY_CYCLE_LIGHT_PRESETS.night;
    expect(scene.ambientLight.intensity).toBeLessThanOrEqual(0.06);
    expect(scene.hemisphereLight.intensity).toBeLessThanOrEqual(0.1);
    // Moon down or new, the rim falls to the moonless share; never above full.
    expect(scene.directionalLight.intensity).toBeGreaterThanOrEqual(night.dirIntensity * DAY_CYCLE_MOONLESS_KEY - 1e-9);
    expect(scene.directionalLight.intensity).toBeLessThanOrEqual(night.dirIntensity + 1e-9);
    expect(scene.directionalLight.color.b).toBeGreaterThan(scene.directionalLight.color.r);
  });

  it("blends light colours and intensity linearly without accumulating prior frames", () => {
    const { scene, at } = dayCycleRig();
    const sample = (hour: number) => {
      at(hour);
      return [
        ...scene.directionalLight.color.toArray(),
        ...scene.ambientLight.color.toArray(),
        ...scene.hemisphereLight.color.toArray(),
        ...scene.hemisphereLight.groundColor.toArray(),
        scene.directionalLight.intensity,
        scene.ambientLight.intensity,
        scene.hemisphereLight.intensity,
      ];
    };
    // Pinned sky day (test-setup): dawn = 1 at 7.0, day = 1 at 12.25, and
    // 8.0 is their crossfade.
    const dawn = sample(7);
    const day = sample(12.25);
    const { dawn: dawnWeight, day: dayWeight } = dayCycleBeats(8);
    expect(dawnWeight + dayWeight).toBeCloseTo(1, 12);
    for (let repeat = 0; repeat < 2; repeat += 1) {
      sample(23);
      sample(8).forEach((value, index) => {
        expect(value).toBeCloseTo(dawn[index]! * dawnWeight + day[index]! * dayWeight, 12);
      });
    }
  });
});

describe("day-cycle presets (C1 contract)", () => {
  it("keeps noon neutral and confines golden warmth to the directional key", () => {
    const day = DAY_CYCLE_LIGHT_PRESETS.day;
    expect(day.dirColor.r).toBe(day.dirColor.g);
    expect(day.dirColor.g).toBe(day.dirColor.b);
    expect(day.ambient.b).toBeGreaterThanOrEqual(day.ambient.r);
    expect(day.hemiSky.b).toBeGreaterThanOrEqual(day.hemiSky.r);
    const golden = DAY_CYCLE_LIGHT_PRESETS.golden;
    expect(golden.dirColor.r).toBeGreaterThan(golden.dirColor.b);
    expect(golden.hemiSky.b).toBeGreaterThan(golden.hemiSky.r);
  });

  it("keeps the ember horizon distinct from violet air", () => {
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
    expect(night.ambientIntensity).toBeLessThanOrEqual(0.06);
    expect(night.hemiIntensity).toBeLessThanOrEqual(0.1);
    expect(night.dirIntensity).toBeGreaterThan(
      night.ambientIntensity + night.hemiIntensity,
    );
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
    new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 1.6, toneMapped: false }),
  );
  const towerWindow = new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 0.24 });
  // The island's two stone path lanterns share one lamp material.
  const islandLantern = new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 1.15, toneMapped: false });
  const statue = new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_glow, emissiveIntensity: 0.08 });
  const scene = {
    ambientLight: new AmbientLight(),
    content: {
      beacon: new Mesh(new SphereGeometry(1, 3, 2), new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_glow })),
      beaconFire: {
        mirrorMaterial: new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_glow }),
        uniforms: { uIntensity: { value: 0 } },
      },
      beaconHalo: new Mesh(new SphereGeometry(1, 3, 2), new MeshBasicMaterial()),
      beam: new Group(),
      fleetSailMaterial: null,
      harborBatch: {
        bucketMeshes: { window: stationWindows },
        fineDetailBucketMeshes: { window: null },
      },
      harborLanternMaterial: new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_warm }),
      islandLanternMaterial: islandLantern,
      lighthouseLight: new PointLight(),
      lighthouseWindowMaterials: [towerWindow],
      shipLanternGlowMaterial: new MeshBasicMaterial(),
      shipLanternMaterial: new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_glow }),
      shipShadows: new InstancedMesh(new CircleGeometry(1, 3), new MeshBasicMaterial(), 1),
      ships: [],
      statueGleamMaterials: [statue],
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
    frame.wallClockHour = hour;
    updateDayCycle(scene, frame, dayCyclePhase(hour));
    return {
      islandLantern: emittedLuminance(islandLantern),
      station: emittedLuminance(stationWindows.material),
      tower: emittedLuminance(towerWindow),
      harborLantern: emittedLuminance(scene.content.harborLanternMaterial),
      shipLantern: emittedLuminance(scene.content.shipLanternMaterial),
      shipLanternGlow: scene.content.shipLanternGlowMaterial.opacity,
      statue: statue.emissiveIntensity,
      beacon: emittedLuminance(scene.content.beacon.material),
      mirror: emittedLuminance(scene.content.beaconFire.mirrorMaterial),
      pointLight: scene.content.lighthouseLight.intensity,
      haloOpacity: scene.content.beaconHalo.material.opacity,
      haloScale: scene.content.beaconHalo.scale.x,
    };
  };
  return { at, scene };
}

function emittedLuminance(material: MeshStandardMaterial): number {
  const color = material.emissive;
  return (color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722) * material.emissiveIntensity;
}

const PRACTICALS = ["islandLantern", "station", "tower", "shipLantern",
  "harborLantern"] as const;

describe("practical light hierarchy", () => {
  it("lets nothing glow in full daylight except the beacon and its mirror glint", () => {
    const { at } = dayCycleRig();
    for (const hour of [9, 12, 15]) {
      const lit = at(hour);
      for (const key of [...PRACTICALS, "shipLanternGlow", "statue"] as const) {
        expect(lit[key], `${key} at ${hour}h`).toBe(0);
      }
      expect(lit.mirror, `mirror glint at ${hour}h`).toBeGreaterThan(0);
      expect(lit.beacon, `banked beacon at ${hour}h`).toBeGreaterThan(0);
    }
  });

  it("kindles windows and lanterns through dusk into night, all below the beacon", () => {
    const { at } = dayCycleRig();
    const noon = at(12);
    const dusk = at(19.2);
    const midnight = at(1);
    for (const key of PRACTICALS) {
      expect(noon[key], `${key} must be dark at noon`).toBeLessThan(dusk[key]);
      expect(dusk[key], `${key} must peak at night`).toBeLessThan(midnight[key]);
    }
    expect(midnight.tower).toBeLessThan(midnight.station);
    expect(midnight.beacon).toBeGreaterThanOrEqual(3);
    for (const key of ["islandLantern", "shipLantern", "harborLantern"] as const) {
      expect(midnight[key], key).toBeGreaterThan(GARDEN_BLOOM_PRACTICAL_THRESHOLD);
      expect(midnight[key], key).toBeLessThan(midnight.beacon);
    }
  });

  it("keeps the tower's window openings dark until dusk is well under way", () => {
    const { at } = dayCycleRig();
    // 17:45 on the pinned sky day is early golden light: the harbour starts
    // to kindle, the tower's openings stay dark voids.
    const earlyGolden = at(17.75);
    expect(earlyGolden.harborLantern).toBeGreaterThan(0);
    expect(earlyGolden.tower).toBe(0);
  });

  it("gives the bronze statue only a faint dusk catch, never a day or night glow", () => {
    const { at } = dayCycleRig();
    expect(at(12).statue).toBe(0);
    expect(at(1).statue).toBe(0);
    let duskPeak = 0;
    for (let hour = 16; hour <= 20; hour += 0.125) duskPeak = Math.max(duskPeak, at(hour).statue);
    expect(duskPeak).toBeGreaterThan(0);
    expect(duskPeak).toBeLessThanOrEqual(0.4);
  });

  it("keeps the night beacon a tight corona instead of a floodlight", () => {
    const { at } = dayCycleRig();
    const noon = at(12);
    const dusk = at(18.5);
    const midnight = at(1);
    expect(noon.pointLight).toBeLessThan(dusk.pointLight);
    expect(dusk.pointLight).toBeLessThan(midnight.pointLight);
    for (let hour = 0; hour < 24; hour += 0.25) {
      const lit = at(hour);
      expect(lit.haloScale, `halo scale at ${hour}h`).toBeLessThanOrEqual(1.25 + 1e-9);
      expect(lit.haloOpacity, `halo opacity at ${hour}h`).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });

  it("keeps windows below the bloom knee throughout the clock", () => {
    const { at } = dayCycleRig();
    for (let hour = 0; hour < 24; hour += 0.25) {
      const lit = at(hour);
      for (const key of ["station", "tower"] as const) {
        expect(lit[key], `${key} window at ${hour}h`).toBeLessThanOrEqual(2.2);
        expect(lit[key]).toBeLessThan(GARDEN_BLOOM_PRACTICAL_THRESHOLD);
      }
    }
  });
});
