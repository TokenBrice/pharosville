import { Color, InstancedMesh, Mesh, ShaderMaterial, SphereGeometry, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { HARBOR_PALETTE } from "../systems/palette";
import { defaultCamera, withoutRest } from "../systems/camera";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { CAMERA_FAR, CAMERA_PITCH_FAR_ZOOM, CAMERA_PITCH_NEAR_ZOOM, cameraView, screenToGroundRay } from "../systems/projection";
import { buildPharosVilleMap } from "../systems/world-layout";
import {
  DAY_CYCLE_LIGHT_PRESETS,
  dayCyclePhase,
} from "./garden-day-cycle";
import {
  createGardenSky,
  GARDEN_BOKASHI_BAND,
  GARDEN_SKY_VISIBLE_HEIGHT_FLOOR,
  gardenBokashiAmount,
  gardenBokashiInk,
  gardenSkyHeight,
  type GardenSky,
} from "./garden-sky";
import { psiBandClarity, SKY_CLOUD_COVER, SKY_CLARITY_CROSSFADE_SECONDS } from "../systems/psi-sky";
import { GARDEN_AIR, gardenAerialTransmittance } from "./garden-aerial";
import { GARDEN_ATMOSPHERE_GLSL, writeGardenAtmosphereSky } from "./garden-atmosphere";
import { gardenSolarApexForDay } from "./garden-sun";
import { gardenSkyDayFromParts, gardenSkyToday, pinGardenSkyDay } from "../systems/sky-almanac";

const MAP = buildPharosVilleMap();

const FRAME = {
  reducedMotion: false,
  wallClockHour: 12,
  targetX: 47.6,
  targetY: 0,
  targetZ: 38.9,
  cameraPosition: { x: 123, y: 23, z: 114 },
  timeSeconds: 0,
};

function domeUniforms(sky: GardenSky): ShaderMaterial["uniforms"] {
  return sky.domeMaterial.uniforms;
}

function colorDistance(left: Color, right: Color): number {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

describe("perspective sky dome", () => {
  it("fills the background from the actual eye without moving the weather off the sea", () => {
    const sky = createGardenSky();
    const dome = sky.root.getObjectByName("garden-sky-dome") as Mesh<SphereGeometry, ShaderMaterial>;
    expect(dome.visible).toBe(true);
    expect(dome.material.depthWrite).toBe(false);
    expect(dome.geometry.parameters.radius).toBeGreaterThanOrEqual(CAMERA_FAR * 0.9);
    expect(dome.geometry.parameters.radius).toBeLessThan(CAMERA_FAR);
    expect(sky.root.getObjectByName("garden-sky-backdrop")).toBeUndefined();
    const eye = new Vector3();
    for (const cameraPosition of [FRAME.cameraPosition, { x: 81, y: 45, z: 97 }]) {
      sky.update(dayCyclePhase(12), { ...FRAME, cameraPosition });
      dome.getWorldPosition(eye);
      expect(eye.toArray()).toEqual([cameraPosition.x, cameraPosition.y, cameraPosition.z]);
      expect(sky.root.position.toArray()).toEqual([FRAME.targetX, 0, FRAME.targetZ]);
    }
    sky.dispose();
  });

  it("spans the visible sky ladder to the top ray, never over less than 6° of sky", () => {
    const sky = createGardenSky();
    let floored = 0;
    for (const viewport of [{ x: 900, y: 720 }, { x: 1200, y: 640 }]) {
      const rest = defaultCamera({ width: viewport.x, height: viewport.y, map: MAP });
      // The rest ShotSpec, then rigs across the pose ramp and back.
      const cameras = [rest, ...[rest.zoom, 0.28, CAMERA_PITCH_FAR_ZOOM, CAMERA_PITCH_NEAR_ZOOM, rest.zoom]
        .map((zoom) => ({ ...withoutRest(rest), zoom }))];
      for (const camera of cameras) {
        const view = cameraView(camera, viewport);
        sky.update(dayCyclePhase(12), {
          ...FRAME,
          cameraPosition: view.eye,
          targetX: view.target.x,
          targetY: view.target.y,
          targetZ: view.target.z,
        });
        const topRay = screenToGroundRay({ x: viewport.x / 2, y: 0 }, camera, viewport);
        const visibleHeight = sky.domeMaterial.uniforms.uSkyVisibleHeight.value as number;
        if (topRay.direction.y < GARDEN_SKY_VISIBLE_HEIGHT_FLOOR) floored += 1;
        expect(visibleHeight).toBeCloseTo(Math.max(topRay.direction.y, GARDEN_SKY_VISIBLE_HEIGHT_FLOOR), 10);
      }
    }
    // The whole-map pull-out is exactly where the floor has to engage.
    expect(floored).toBeGreaterThan(0);
    sky.dispose();
  });

  it("eases the ladder into its top with no kink or overshoot", () => {
    const step = 0.001;
    let previous = gardenSkyHeight(0, 1);
    let previousSlope = 1;
    expect(previous).toBe(0);
    expect(gardenSkyHeight(-0.2, 1)).toBe(0);
    expect(gardenSkyHeight(0.5, 1)).toBeCloseTo(0.5, 12);
    for (let lift = step; lift <= 1.6; lift += step) {
      const height = gardenSkyHeight(lift, 1);
      const slope = (height - previous) / step;
      expect(slope).toBeGreaterThanOrEqual(0);
      expect(height).toBeLessThanOrEqual(1 + 1e-12);
      expect(Math.abs(slope - previousSlope)).toBeLessThan(0.01);
      previous = height;
      previousSlope = slope;
    }
    expect(previous).toBeCloseTo(1, 12);
  });
});

/**
 * Phase 2 (items 2d/6): the billboard atmosphere. W2.3/W2.5 (data-poetry-1,
 * sky-3): the far mist banks are deleted — by day, low mist means a stale
 * source, so the only billboard mist is a stale feed's bounded bank. X3: the
 * cumulus cards are deleted too; clouds are painted on the dome.
 */
describe("garden sky billboard atmosphere", () => {
  it("hangs no aesthetic mist at any hour: without a stale feed there is no mist card", () => {
    const sky = createGardenSky();
    const localMist = sky.root.getObjectByName("garden-source-fog") as InstancedMesh;
    for (const hour of [6, 12, 18, 23]) {
      sky.update(dayCyclePhase(hour), { ...FRAME, wallClockHour: hour, epistemicBanks: [] });
      expect(localMist.visible).toBe(false);
    }
    sky.dispose();
  });

  it("paints the clouds on the dome: no cloud or geese cards in any season", () => {
    for (const season of ["spring", "summer", "autumn", "winter"] as const) {
      const sky = createGardenSky(season);
      for (const hour of [7, 12, 18, 22]) {
        sky.update(dayCyclePhase(hour), { ...FRAME, wallClockHour: hour });
        const visibleCards: string[] = [];
        sky.root.traverseVisible((object) => {
          if (object instanceof InstancedMesh) visibleCards.push(object.name);
        });
        expect(visibleCards).toEqual([]);
      }
      sky.dispose();
    }
  });

  it("drifts the cloud field on the weather wind and holds it still under reduced motion", () => {
    const sky = createGardenSky();
    const offset = domeUniforms(sky).uCloudOffset!.value as Vector2;
    const wind = { x: 1, y: 0, speed: 0.8, gust: 0 };
    sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 10, wind });
    const start = offset.clone();
    sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 10.2, wind });
    expect(offset.distanceTo(start)).toBeGreaterThan(0);
    const moved = offset.clone();
    sky.update(dayCyclePhase(12), { ...FRAME, reducedMotion: true, timeSeconds: 10.4, wind });
    expect(offset.toArray()).toEqual(moved.toArray());
    sky.dispose();
  });

  it("wraps wind advection by one noise tile so both morphing layers remain periodic", () => {
    const sky = createGardenSky();
    try {
      const wind = { x: -0.855, y: 0.519, speed: 1, gust: 0 };
      sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 10, wind });
      const offset = domeUniforms(sky).uCloudOffset.value as Vector2;
      offset.set(0.9999, 0);
      sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 10.2, wind });
      expect(offset.x).toBeGreaterThan(0);
      expect(offset.x).toBeLessThan(0.001);
      expect(Math.abs(offset.y)).toBeLessThan(0.001);
    } finally {
      sky.dispose();
    }
  });

  it("pulls winter fog slightly toward the cool harbor fog anchor", () => {
    const spring = createGardenSky("spring");
    const winter = createGardenSky("winter");
    spring.update(dayCyclePhase(0), { ...FRAME, wallClockHour: 0 });
    winter.update(dayCyclePhase(0), { ...FRAME, wallClockHour: 0 });
    const cool = new Color(HARBOR_PALETTE.fog_blue);
    expect(colorDistance(winter.fog.color, cool)).toBeLessThan(
      colorDistance(spring.fog.color, cool),
    );
    for (const uniform of ["uSolarHorizon", "uAntiHorizon", "uZenith"] as const) {
      expect(colorDistance(winter.domeMaterial.uniforms[uniform].value as Color, cool))
        .toBeLessThan(colorDistance(spring.domeMaterial.uniforms[uniform].value as Color, cool));
    }
    spring.dispose();
    winter.dispose();
  });

});

/**
 * Phase 2 (item 2c): the scattering dome's drivers. The dome is the PMREM
 * probe's source, so these uniforms are what the world's metals are lit by —
 * and they are graded in `applyPhase`, before the bake, for exactly that
 * reason.
 */
describe("garden sky atmospheric scattering", () => {

  it("fades the whole scattering layer to zero at night", () => {
    const sky = createGardenSky();
    sky.applyPhase(dayCyclePhase(0), 0);
    expect(sky.domeMaterial.uniforms.uScattering!.value).toBe(0);
    expect(sky.domeMaterial.uniforms.uSunIntensity!.value).toBe(0);
    // ...with the sun below the horizon and the authored indigo untouched.
    expect((sky.domeMaterial.uniforms.uSunDir!.value as Vector3).y).toBeLessThan(0);
    sky.dispose();
  });

  it("drives the field from the day cycle and the light rig's own sun tint", () => {
    const sky = createGardenSky();
    // The pinned day's real solar noon uses its composed seasonal apex.
    const day = gardenSkyToday();
    sky.applyPhase(dayCyclePhase(day.solarNoonHour), day.solarNoonHour);
    expect(sky.domeMaterial.uniforms.uScattering!.value).toBeCloseTo(1);
    expect(sky.domeMaterial.uniforms.uSunIntensity!.value).toBeCloseTo(1.55);
    const sunDir = sky.domeMaterial.uniforms.uSunDir!.value as Vector3;
    expect(sunDir.y).toBeCloseTo(Math.sin(gardenSolarApexForDay(day)), 6);
    const sunColor = sky.domeMaterial.uniforms.uSunColor!.value as Color;
    expect(sunColor.getHex()).toBe(DAY_CYCLE_LIGHT_PRESETS.day.dirColor.getHex());
    expect(sky.domeMaterial.fragmentShader).toContain(GARDEN_ATMOSPHERE_GLSL);
    expect(sky.domeMaterial.uniforms.uGardenAir.value).toBe(GARDEN_AIR);
    sky.dispose();
  });

  it("tells morning from evening, which a fixed azimuth could not", () => {
    // Both hours carry near-identical day-cycle weights; the ONLY thing that
    // separates them is where the sun is. Before the arc this uniform was
    // identical at 09:00 and 15:30 and the sky read the same at both.
    const morning = createGardenSky();
    const evening = createGardenSky();
    morning.applyPhase(dayCyclePhase(9), 9);
    evening.applyPhase(dayCyclePhase(15.5), 15.5);

    const morningDir = (morning.domeMaterial.uniforms.uSunDir!.value as Vector3).clone();
    const eveningDir = (evening.domeMaterial.uniforms.uSunDir!.value as Vector3).clone();

    expect(morningDir.angleTo(eveningDir)).toBeGreaterThan(0.5);
    // Both still high in the sky — this is a bearing difference, not the sun
    // simply having set.
    expect(morningDir.y).toBeGreaterThan(0);
    expect(eveningDir.y).toBeGreaterThan(0);

    morning.dispose();
    evening.dispose();
  });

});

/**
 * W6.8. These are the arithmetic guarantees the fog ladder was chosen for, not
 * a taste judgement — so they can be asserted, and a future retune that quietly
 * gives one of them up fails here instead of in a screenshot nobody compares.
 */
describe("garden sky applyPhase", () => {
  it("grades neutral noon air before the environment probe bakes", () => {
    const sky = createGardenSky();
    sky.applyPhase(dayCyclePhase(12), 12);
    const zenith = sky.domeMaterial.uniforms.uZenith.value as Color;
    const solar = sky.domeMaterial.uniforms.uSolarHorizon.value as Color;
    const anti = sky.domeMaterial.uniforms.uAntiHorizon.value as Color;
    expect(zenith.b).toBeGreaterThan(zenith.r * 2);
    // The sun's side is never a warm grade; the far side is cooler than it.
    expect(solar.b).toBeGreaterThanOrEqual(solar.r);
    expect(anti.b).toBeGreaterThan(anti.r);
    expect(anti.b / anti.r).toBeGreaterThan(solar.b / solar.r);
    sky.dispose();
  });

  it("separates rose dawn, amber golden, indigo blue hour and an indigo night that deepens upward", () => {
    const sky = createGardenSky();
    const sample = (hour: number) => {
      sky.applyPhase(dayCyclePhase(hour), hour);
      return {
        solar: (sky.domeMaterial.uniforms.uSolarHorizon.value as Color).clone(),
        anti: (sky.domeMaterial.uniforms.uAntiHorizon.value as Color).clone(),
        zenith: (sky.domeMaterial.uniforms.uZenith.value as Color).clone(),
        belt: sky.domeMaterial.uniforms.uBeltStrength.value as number,
      };
    };
    // The pinned sky day: sunrise 07:06, sunset 18:54.
    const dawn = sample(7);
    const golden = sample(18.5);
    const blue = sample(19.2);
    const night = sample(23);
    expect(dawn.solar.r).toBeGreaterThan(dawn.solar.g);
    expect(golden.solar.r).toBeGreaterThan(golden.solar.b * 2);
    // sky-1: the sky has a side — warm toward the sun, cool opposite.
    expect(golden.solar.r / Math.max(golden.solar.b, 1e-6)).toBeGreaterThan(golden.anti.r / Math.max(golden.anti.b, 1e-6));
    expect(golden.zenith.b).toBeGreaterThan(golden.zenith.g);
    expect(blue.zenith.b).toBeGreaterThan(blue.zenith.r * 2);
    // The Belt of Venus stands between sunset and nautical dusk only.
    expect(golden.belt).toBe(0);
    expect(blue.belt).toBeGreaterThan(0.9);
    // sky-6: the night is not black paper — a cool sky whose horizon is
    // lighter than its zenith, so ridges, masts and the tower read as ink.
    const luma = (color: Color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    expect(night.zenith.b).toBeGreaterThan(night.zenith.r * 1.5);
    expect(luma(night.anti)).toBeGreaterThan(luma(night.zenith));
    expect(night.belt).toBe(0);
    sky.dispose();
  });

  it("leaves update on the same picture, so grading twice a frame is free", () => {
    const early = createGardenSky();
    const whole = createGardenSky();
    const phase = dayCyclePhase(18.5);

    early.applyPhase(phase, 18.5);
    early.update(phase, FRAME);
    whole.update(phase, FRAME);

    for (const uniform of ["uZenith", "uSolarHorizon", "uAntiHorizon"] as const) {
      expect((early.domeMaterial.uniforms[uniform]!.value as Color).getHex())
        .toBe((whole.domeMaterial.uniforms[uniform]!.value as Color).getHex());
    }
    for (const uniform of ["uBeltStrength", "uGlow", "uScattering", "uSunIntensity"] as const) {
      expect(early.domeMaterial.uniforms[uniform]!.value)
        .toBe(whole.domeMaterial.uniforms[uniform]!.value);
    }
    expect((early.domeMaterial.uniforms.uSunDir!.value as Vector3).toArray())
      .toEqual((whole.domeMaterial.uniforms.uSunDir!.value as Vector3).toArray());
  });
});

describe("garden sky aerial perspective", () => {
  it("keeps clear near/mid geometry readable at both supported seat aspects", () => {
    const sky = createGardenSky();
    sky.setClarity(1);
    for (const viewport of [{ height: 720, width: 900 }, { height: 640, width: 1200 }]) {
      const camera = defaultCamera({ ...viewport, map: MAP });
      const view = cameraView(camera, { x: viewport.width, y: viewport.height });
      sky.update(dayCyclePhase(12), {
        ...FRAME, cameraPosition: view.eye,
        targetX: view.target.x, targetY: view.target.y, targetZ: view.target.z,
      });
      const direction = new Vector3(view.target.x - view.eye.x, 0, view.target.z - view.eye.z).normalize();
      for (const [distance, floor] of [[140, 0.9], [300, 0.8]]) {
        expect(gardenAerialTransmittance(GARDEN_AIR, view.eye, {
          x: view.eye.x + direction.x * distance!, y: GARDEN_WATER_Y,
          z: view.eye.z + direction.z * distance!,
        })).toBeGreaterThanOrEqual(floor!);
      }
    }
    sky.dispose();
  });

  it("uses the same linear-radiance horizon on each side of the sky/water seam", () => {
    const sky = createGardenSky();
    sky.setClarity(1);
    sky.update(dayCyclePhase(12), { ...FRAME, reducedMotion: true });
    const sun = sky.domeMaterial.uniforms.uSunDir.value as Vector3;
    const direction = new Vector3(sun.x, 0, sun.z).normalize();
    for (const side of [1, -1]) {
      const dir = direction.clone().multiplyScalar(side);
      const skyColor = writeGardenAtmosphereSky(new Color(), dir, sun, GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
      const airColor = side === 1 ? GARDEN_AIR.airSun : GARDEN_AIR.airAnti;
      expect(colorDistance(skyColor, airColor)).toBeLessThan(1e-10);
      for (const y of [-1e-6, 1e-6]) {
        const edge = writeGardenAtmosphereSky(new Color(), new Vector3(dir.x, y, dir.z).normalize(), sun, GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
        expect(colorDistance(edge, skyColor)).toBeLessThan(0.001);
      }
    }
    expect(sky.domeMaterial.fragmentShader).not.toMatch(/hazeBand|airMass|rayPhase/);
    sky.dispose();
  });

  it("stages accepted cloud and lunar radiance before the probe, including the first static frame", () => {
    const sky = createGardenSky();
    sky.setClarity(0.2);
    sky.update(dayCyclePhase(22), { ...FRAME, wallClockHour: 22, reducedMotion: true });
    expect(sky.signedClarity).toBe(-1);
    expect(GARDEN_AIR.clarity).toBe(-1);
    expect(sky.domeMaterial.uniforms.uCloudDeck.value).toBeGreaterThan(0.9);
    expect(sky.domeMaterial.uniforms.uAtmosphereDate.value).toBeGreaterThan(0);
    expect((sky.domeMaterial.uniforms.uCloudLit.value as Color).getHex()).not.toBe(0);
    expect((sky.domeMaterial.uniforms.uMoonDir.value as Vector3).length()).toBeCloseTo(1, 12);
    sky.dispose();
  });
});

/**
 * Wave 1 bokashi bands. The finite plate exposes the dome, so the ramp is
 * measured from its fog seam into the visible sky rather than from scene depth.
 */
describe("bokashi bands", () => {
  it("is exactly zero at the sky seam", () => {
    for (const height of [0, 0.005, 0.01, GARDEN_BOKASHI_BAND.ichimonji[0]]) {
      expect(gardenBokashiInk(height)).toBe(0);
    }
  });

  it("darkens above the seam, then lightens the middle sky", () => {
    expect(gardenBokashiInk(0.07)).toBeLessThan(0);
    expect(gardenBokashiInk(0.24)).toBeGreaterThan(0);
  });

  it("deepens hardest at the very top of the frame", () => {
    const frameTop = gardenBokashiInk(1);
    expect(frameTop).toBeLessThan(gardenBokashiInk(0.72));
    expect(gardenBokashiInk(0.72)).toBeLessThan(gardenBokashiInk(0.5));
    // Deep, but a quiet graphic accent rather than a poster stripe: an eighth of
    // a stop at most, and no phase can push it past the authored gain.
    expect(frameTop).toBeGreaterThan(-GARDEN_BOKASHI_BAND.deepGain - 1e-9);
    expect(frameTop).toBeLessThan(-0.15);
  });


  it("keeps day barely-there and hands the bands to dusk and night", () => {
    const day = gardenBokashiAmount(dayCyclePhase(12));
    const dusk = gardenBokashiAmount(dayCyclePhase(19));
    const night = gardenBokashiAmount(dayCyclePhase(22));
    expect(day).toBeCloseTo(GARDEN_BOKASHI_BAND.dayAmount, 5);
    expect(dusk).toBeGreaterThan(day * 8);
    expect(night).toBeGreaterThan(day * 8);
    expect(Math.max(dusk, night)).toBeLessThanOrEqual(1);
  });

});

describe("market stability sky channel", () => {
  it("stages six occupancy targets and separates high-only veil from the three low-deck morphologies", () => {
    for (const [band, cover] of Object.entries(SKY_CLOUD_COVER)) {
      const sky = createGardenSky();
      sky.setClarity(psiBandClarity(band)!);
      sky.update(dayCyclePhase(12), { ...FRAME, reducedMotion: true });
      const uniforms = domeUniforms(sky);
      expect(uniforms.uCloudCover.value).toBeCloseTo(cover, 12);
      expect(uniforms.uCloudHighThreshold.value).toBeCloseTo(0.8 - 0.47 * Math.min(cover, 0.3), 12);
      if (band === "TREMOR") {
        expect(uniforms.uCloudVeil.value).toBe(1);
        expect(uniforms.uCloudDeck.value).toBe(0);
        expect(uniforms.uCloudHighAlpha.value).toBeCloseTo(0.38, 12);
      } else if (cover < 0.3) {
        expect(uniforms.uCloudVeil.value).toBe(0);
        expect(uniforms.uCloudDeck.value).toBe(0);
        expect(uniforms.uCloudHighAlpha.value).toBe(0.65);
      } else {
        expect(uniforms.uCloudVeil.value).toBe(0);
        expect(uniforms.uCloudDeck.value).toBeGreaterThan(0);
      }
      const fragment = sky.domeMaterial.fragmentShader;
      expect(fragment).toContain("vec2 highScale = mix");
      expect(fragment).toContain("highScale = mix(highScale, vec2(0.026, 0.028), uCloudVeil)");
      expect(fragment).toContain("if (uCloudCover > 0.3)");
      expect(fragment).toContain("float ceiling = smoothstep(0.78, 0.9, uCloudCover)");
      expect(fragment).toContain("vec2 weights = mix(vec2(0.75, 0.35), vec2(0.9, 0.2), ceiling)");
      expect(fragment).toContain("cp * highScale + uCloudOffset");
      expect(fragment).toContain("cp * lowScale + uCloudOffset");
      expect(fragment).not.toContain("+ uCloudVeil * 0.32");
      sky.dispose();
    }
  });

  it("retains indigo cloud bodies with no lunar rim on a moonless night", () => {
    const savedDay = gardenSkyToday();
    pinGardenSkyDay(gardenSkyDayFromParts({
      year: 2026, month: 10, day: 10, utcOffsetHours: 2, dstHours: 1,
      latitude: { latitudeRad: 35 * Math.PI / 180, southern: false },
    }));
    try {
      for (const band of Object.keys(SKY_CLOUD_COVER)) {
        const sky = createGardenSky();
        try {
          sky.setClarity(psiBandClarity(band)!);
          sky.update(dayCyclePhase(1), { ...FRAME, wallClockHour: 1, reducedMotion: true });
          const uniforms = domeUniforms(sky);
          const lit = uniforms.uCloudLit.value as Color;
          const shade = uniforms.uCloudShade.value as Color;
          const zenith = uniforms.uZenith.value as Color;
          expect(uniforms.uCloudRim.value).toBe(0);
          expect(lit.b).toBeGreaterThan(lit.r);
          expect(shade.b).toBeGreaterThan(shade.r);
          expect(lit.b).toBeGreaterThan(shade.b);
          expect(shade.b).toBeGreaterThan(0);
          expect(shade.b).toBeLessThan(zenith.b);
        } finally {
          sky.dispose();
        }
      }
    } finally {
      pinGardenSkyDay(savedDay);
    }
  });

  it("draws the first real reading at once, then eases later band changes", () => {
    const sky = createGardenSky();
    // Before any PSI reading the sky holds the neutral veil.
    sky.setClarity(0.65, false);
    sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 0 });
    // The first accepted reading (CRISIS) lands whole: the words name it now.
    sky.setClarity(0.2, true);
    sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 1 });
    expect(sky.signedClarity).toBe(-1);
    const crisisCover = domeUniforms(sky).uCloudCover.value as number;
    // A later change eases.
    sky.setClarity(1, true);
    sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 2 });
    expect(sky.signedClarity).toBe(-1);
    expect(domeUniforms(sky).uCloudCover.value).toBe(crisisCover);
    sky.dispose();
  });

  it("eases accepted aerosol and cloud cover together over 90 s", () => {
    const sky = createGardenSky("summer");
    sky.setClarity(1);
    sky.update(dayCyclePhase(12), FRAME);
    expect(sky.signedClarity).toBe(1);
    const clearAerosol = GARDEN_AIR.mie.x;
    const clearCover = domeUniforms(sky).uCloudCover.value as number;
    const clearDeck = domeUniforms(sky).uCloudDeck.value as number;
    sky.setClarity(0);
    sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 1 });
    // An accepted band change does not jump the air.
    expect(sky.signedClarity).toBe(1);
    sky.update(dayCyclePhase(12), { ...FRAME, timeSeconds: 1 + SKY_CLARITY_CROSSFADE_SECONDS });
    expect(sky.signedClarity).toBe(-1);
    expect(GARDEN_AIR.mie.x).toBeGreaterThan(clearAerosol);
    // X3/X4: cover rises from a clean sky to a heavy deck with the same ease.
    expect(domeUniforms(sky).uCloudCover.value).toBeGreaterThan(clearCover + 0.5);
    expect(domeUniforms(sky).uCloudDeck.value).toBeGreaterThan(clearDeck);
    sky.dispose();
  });
});
