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
  dayCycleBeats,
  dayCyclePhase,
  updateDayCycle,
} from "./garden-day-cycle";
import { gardenEnvironmentIntensityForBeats } from "./garden-environment";
import { GARDEN_BLOOM_PRACTICAL_THRESHOLD } from "./garden-post";
import { HARBOR_PALETTE } from "../systems/palette";
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

  it("hits the authored peaks and wraps midnight", () => {
    expect(dayCycleBeats(4.75).night).toBe(1);
    expect(dayCycleBeats(6).dawn).toBe(1);
    expect(dayCycleBeats(7.25).day).toBe(1);
    expect(dayCycleBeats(16.25).day).toBe(1);
    expect(dayCycleBeats(17.25).golden).toBe(1);
    expect(dayCycleBeats(18.25).golden).toBe(1);
    expect(dayCycleBeats(19).blue).toBe(1);
    expect(dayCycleBeats(20).night).toBe(1);
    expect(dayCycleBeats(-1)).toEqual(dayCycleBeats(23));
    expect(dayCycleBeats(36.5)).toEqual(dayCycleBeats(12.5));
  });

  it("renders the five rigs with authored contrast and restrained night fill", () => {
    const scene = {
      ambientLight: new AmbientLight(),
      hemisphereLight: new HemisphereLight(),
      directionalLight: new DirectionalLight(),
      content: null,
    };
    const samples = [
      [6, 2.9, 3.1], [12, 5, 6], [17.25, 7, 9], [19, 2.5, 3.5], [23, 4, 5],
    ];
    const keys: number[] = [];
    for (const [hour, minimum, maximum] of samples) {
      const frame = { wallClockHour: hour } as ThreeWorldRendererFrame;
      updateDayCycle(scene, frame, dayCyclePhase(hour));
      const fill = scene.ambientLight.intensity + scene.hemisphereLight.intensity;
      const ratio = scene.directionalLight.intensity / fill;
      expect(ratio).toBeGreaterThanOrEqual(minimum);
      expect(ratio).toBeLessThanOrEqual(maximum);
      expect(fill).toBeGreaterThan(gardenEnvironmentIntensityForBeats(dayCycleBeats(hour)));
      keys.push(scene.directionalLight.intensity);
    }
    expect(keys[2]).toBeGreaterThan(keys[1]);
    expect(keys[1]).toBeGreaterThan(keys[0]);
    expect(keys[0]).toBeGreaterThan(keys[3]);
    expect(keys[3]).toBeGreaterThan(keys[4]);
    expect(scene.ambientLight.intensity).toBeLessThanOrEqual(0.06);
    expect(scene.hemisphereLight.intensity).toBeLessThanOrEqual(0.1);
    expect(scene.directionalLight.intensity).toBeLessThanOrEqual(0.65);
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
    const dawn = sample(6);
    const day = sample(12);
    for (let repeat = 0; repeat < 2; repeat += 1) {
      sample(23);
      sample(6.625).forEach((value, index) => {
        expect(value).toBeCloseTo((dawn[index]! + day[index]!) / 2, 12);
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
  const stationLantern = new Mesh(new SphereGeometry(1, 3, 2),
    new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 1.5 }));
  const fineStationLantern = stationLantern.clone();
  fineStationLantern.material = stationLantern.material.clone();
  const scene = {
    ambientLight: new AmbientLight(),
    content: {
      beacon: new Mesh(new SphereGeometry(1, 3, 2), new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_glow })),
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
        propMeshes: { lampHead: stationLantern },
        fineDetailPropMeshes: { lampHead: fineStationLantern },
      },
      harborLanternMaterial: new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_warm }),
      islandLanternMaterial: islandLantern,
      lighthouseLight: new PointLight(),
      lighthouseWindowMaterials: [towerWindow],
      shipLanternGlowMaterial: new MeshBasicMaterial(),
      shipLanternMaterial: new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_glow }),
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
    frame.wallClockHour = hour;
    updateDayCycle(scene, frame, dayCyclePhase(hour));
    return {
      islandLantern: emittedLuminance(islandLantern),
      station: emittedLuminance(stationWindows.material),
      tower: emittedLuminance(towerWindow),
      harborLantern: emittedLuminance(scene.content.harborLanternMaterial),
      shipLantern: emittedLuminance(scene.content.shipLanternMaterial),
      stationLantern: emittedLuminance(stationLantern.material),
      fineStationLantern: emittedLuminance(fineStationLantern.material),
      beacon: emittedLuminance(scene.content.beacon.material),
    };
  };
  return { at, scene };
}

function emittedLuminance(material: MeshStandardMaterial): number {
  const color = material.emissive;
  return (color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722) * material.emissiveIntensity;
}

describe("practical light hierarchy", () => {
  it("lights windows and lanterns progressively while keeping the tower dominant", () => {
    const { at } = dayCycleRig();
    const noon = at(12);
    const dusk = at(18.5);
    const midnight = at(1);
    for (const key of ["islandLantern", "station", "tower", "shipLantern",
      "harborLantern", "stationLantern", "fineStationLantern"] as const) {
      expect(noon[key], `${key} must be dimmest at noon`).toBeLessThan(dusk[key]);
      expect(dusk[key], `${key} must peak at night`).toBeLessThan(midnight[key]);
    }
    expect(midnight.tower).toBeLessThan(midnight.station);
    expect(midnight.beacon).toBeGreaterThanOrEqual(3);
    for (const key of ["islandLantern", "shipLantern", "harborLantern",
      "stationLantern", "fineStationLantern"] as const) {
      expect(midnight[key], key).toBeGreaterThanOrEqual(2.6);
      expect(midnight[key], key).toBeLessThanOrEqual(2.8);
      expect(midnight[key], key).toBeGreaterThan(GARDEN_BLOOM_PRACTICAL_THRESHOLD);
      expect(midnight[key], key).toBeLessThan(midnight.beacon);
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
