import { Color, InstancedMesh, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { HARBOR_PALETTE } from "../systems/palette";
import { defaultCamera } from "../systems/camera";
import { GARDEN_ISLAND_TILE_OFFSET, GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { CAMERA_FAR, cameraEye, cameraPoseFromIso, TILE_SCALE } from "../systems/projection";
import { buildPharosVilleMap } from "../systems/world-layout";
import {
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  dayCyclePhase,
} from "./garden-day-cycle";
import {
  createGardenSky,
  GARDEN_BOKASHI_BAND,
  GARDEN_CUMULUS_BILLBOARDS_ENABLED,
  gardenBokashiAmount,
  gardenBokashiInk,
} from "./garden-sky";
import {
  CLOUD_COUNT,
  GARDEN_AUTUMN_GEESE_COUNT,
  MIST_BANK_COUNT,
} from "./garden-sky-billboards";

const DEFAULT_VIEWPORT = { height: 1000, width: 1600 };
const MAP = buildPharosVilleMap();
const DEFAULT_CAMERA = defaultCamera({ ...DEFAULT_VIEWPORT, map: MAP });

const FRAME = {
  reducedMotion: false,
  wallClockHour: 12,
  targetX: 47.6,
  targetZ: 38.9,
  cameraPosition: { x: 123, y: 23, z: 114 },
  timeSeconds: 0,
};

function mistOf(sky: ReturnType<typeof createGardenSky>): InstancedMesh {
  const mist = sky.root.getObjectByName("garden-sky-mist-banks");
  expect(mist).toBeInstanceOf(InstancedMesh);
  return mist as InstancedMesh;
}

function cloudsOf(sky: ReturnType<typeof createGardenSky>): InstancedMesh {
  const clouds = sky.root.getObjectByName("garden-sky-clouds");
  expect(clouds).toBeInstanceOf(InstancedMesh);
  return clouds as InstancedMesh;
}

function uniformsOf(mesh: InstancedMesh): ShaderMaterial["uniforms"] {
  return (mesh.material as ShaderMaterial).uniforms;
}

function colorDistance(left: Color, right: Color): number {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

describe("perspective sky dome", () => {
  it("fills the background from the actual eye without moving the mist off the sea", () => {
    const sky = createGardenSky();
    const dome = sky.root.getObjectByName("garden-sky-dome") as Mesh<SphereGeometry, ShaderMaterial>;
    expect(dome.visible).toBe(true);
    expect(dome.material.depthWrite).toBe(false);
    expect(dome.geometry.parameters.radius).toBeGreaterThanOrEqual(CAMERA_FAR * 0.9);
    expect(dome.geometry.parameters.radius).toBeLessThan(CAMERA_FAR);
    expect(sky.root.getObjectByName("garden-sky-backdrop")).toBeUndefined();
    const eye = new Vector3();
    const mistPosition = new Vector3();
    for (const cameraPosition of [FRAME.cameraPosition, { x: 81, y: 45, z: 97 }]) {
      sky.update(dayCyclePhase(12), { ...FRAME, cameraPosition });
      dome.getWorldPosition(eye);
      expect(eye.toArray()).toEqual([cameraPosition.x, cameraPosition.y, cameraPosition.z]);
      mistOf(sky).getWorldPosition(mistPosition);
      expect(mistPosition.toArray()).toEqual([FRAME.targetX, 0, FRAME.targetZ]);
    }
    sky.dispose();
  });
});

/**
 * Phase 2 (items 2d/6): the billboard atmosphere. The retired 320x9 mist
 * plane was a dawn/dusk band whose hard edges read as a stripe at night; the
 * instanced banks replace it as the ONE mist cue and own dawn AND night,
 * while the cumulus layer is the day sky's own clouds.
 */
describe("garden sky billboard atmosphere", () => {
  it("packs each system into ONE instanced draw with authored anchors", () => {
    const sky = createGardenSky();
    const mist = mistOf(sky);
    const clouds = cloudsOf(sky);
    expect(mist.count).toBe(MIST_BANK_COUNT);
    expect(clouds.count).toBe(CLOUD_COUNT);
    // Sea-first negative space: every anchor sits in the far quadrant, well
    // clear of the island's ±20 around the sky root's anchor.
    for (const mesh of [mist, clouds]) {
      const anchors = mesh.geometry.getAttribute("aAnchor");
      expect(anchors).toBeDefined();
      for (let i = 0; i < anchors.count; i += 1) {
        expect(anchors.getX(i)).toBeLessThanOrEqual(-40);
        expect(anchors.getZ(i)).toBeLessThanOrEqual(-40);
        expect(anchors.getY(i)).toBeGreaterThan(0);
      }
    }
    sky.dispose();
  });

  it("gives the banks a midday whisper under their dawn, dusk and night body", () => {
    const sky = createGardenSky();
    const mist = mistOf(sky);

    // 2026-09-07 (T2.4) — DELIBERATE REVERSAL of the earlier contract, which
    // was named "keeps the banks out of the midday frame" and asserted
    // `mist.visible === false` at hour 12.
    //
    // That contract was written against the retired 320x9 mist PLANE, whose
    // hard-edged full-width band really did white out a noon frame. The
    // instanced banks are nine soft radial billboards on the far anchors, and
    // the clear-sky term `dusk * 0.55 + night * 0.48` sat at EXACTLY zero for
    // the 8.5 hours `dayCyclePhase` reports daylight = 1 / dusk = 0 — so the
    // modal hour of the piece got nothing from the whole system.
    //
    // The new intent is a whisper on the far shelves only: ~0.066 uniform
    // opacity, which the shader's radial shape and distance fade take to about
    // 0.036 on screen, riding the pulled-in fog ladder rather than fighting it.
    // The old white-out concern does not apply at that opacity — a third of the
    // dusk value on billboards that are already fading out at their anchors is
    // aerial perspective, not a layer over the garden. The dusk and night
    // assertions below still guard the element's real body.
    sky.update(dayCyclePhase(12), FRAME);
    expect(mist.visible).toBe(true);
    const middayOpacity = uniformsOf(mist).uOpacity!.value as number;
    expect(middayOpacity).toBeGreaterThan(0.02);
    expect(middayOpacity).toBeLessThan(0.09);

    sky.update(dayCyclePhase(18), FRAME);
    expect(mist.visible).toBe(true);
    const duskOpacity = uniformsOf(mist).uOpacity!.value as number;
    expect(duskOpacity).toBeGreaterThan(0.05);

    // Unlike the retired band, the banks are a night element too — soft
    // radial-noise billboards cannot draw the hard stripe the plane did.
    sky.update(dayCyclePhase(23), FRAME);
    expect(mist.visible).toBe(true);
    expect(uniformsOf(mist).uOpacity!.value as number).toBeGreaterThan(0.05);
    sky.dispose();
  });

  it("thickens mist with storms while the cumulus review baseline stays disabled", () => {
    const sky = createGardenSky();
    const mist = mistOf(sky);
    const clouds = cloudsOf(sky);
    const night = dayCyclePhase(23);

    sky.update(night, FRAME);
    const calm = uniformsOf(mist).uOpacity!.value as number;
    sky.update(night, { ...FRAME, stormLevel: 1 });
    expect(uniformsOf(mist).uOpacity!.value as number).toBeGreaterThan(calm);

    // Tier gate: the caller resolves the quality tier; below balanced mist
    // sheds. Cumulus stays disabled at every tier pending operator A/B review.
    sky.update(night, { ...FRAME, billboards: false });
    expect(mist.visible).toBe(false);
    expect(clouds.visible).toBe(false);
    sky.update(night, { ...FRAME, billboards: true });
    expect(mist.visible).toBe(true);
    expect(GARDEN_CUMULUS_BILLBOARDS_ENABLED).toBe(false);
    expect(clouds.visible).toBe(false);
    sky.dispose();
  });

  it("freezes the drift under reduced motion and follows the weather wind", () => {
    const sky = createGardenSky();
    const mist = mistOf(sky);
    sky.update(dayCyclePhase(23), { ...FRAME, timeSeconds: 120 });
    expect(uniformsOf(mist).uTime!.value).toBe(120);
    sky.update(dayCyclePhase(23), {
      ...FRAME,
      reducedMotion: true,
      timeSeconds: 240,
      wind: { windDirX: 1, windDirZ: 0, windSpeed: 0.8 },
    });
    expect(uniformsOf(mist).uTime!.value).toBe(0);
    expect(uniformsOf(mist).uWindDir!.value).toMatchObject({ x: 1, y: 0 });
    expect(uniformsOf(mist).uWindSpeed!.value).toBe(0.8);
    sky.dispose();
  });

  it("shows only summer high clouds and the autumn geese line", () => {
    const summer = createGardenSky("summer");
    const summerClouds = cloudsOf(summer);
    summer.update(dayCyclePhase(12), FRAME);
    expect(summerClouds.visible).toBe(true);
    expect(uniformsOf(summerClouds).uOpacity!.value as number).toBeLessThanOrEqual(0.34);
    expect(summer.root.getObjectByName("garden-sky-autumn-geese")!.visible).toBe(false);
    summer.dispose();

    const autumn = createGardenSky("autumn");
    autumn.update(dayCyclePhase(12), FRAME);
    const geese = autumn.root.getObjectByName("garden-sky-autumn-geese") as InstancedMesh;
    expect(geese.count).toBe(GARDEN_AUTUMN_GEESE_COUNT);
    expect(geese.visible).toBe(true);
    expect(cloudsOf(autumn).visible).toBe(false);
    autumn.dispose();
  });

  it("pulls winter fog slightly toward the cool harbor fog anchor", () => {
    const spring = createGardenSky("spring");
    const winter = createGardenSky("winter");
    spring.update(dayCyclePhase(12), FRAME);
    winter.update(dayCyclePhase(12), FRAME);
    const cool = new Color(HARBOR_PALETTE.fog_blue);
    expect(colorDistance(winter.fog.color, cool)).toBeLessThan(
      colorDistance(spring.fog.color, cool),
    );
    expect((winter.domeMaterial.uniforms.uHorizon.value as Color).getHex())
      .toBe(winter.fog.color.getHex());
    for (const uniform of ["uMiddle", "uZenith"] as const) {
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
    // Solar noon on the arc, where it still passes exactly through the
    // calibrated key light at island + (-35, 48, -30).
    sky.applyPhase(dayCyclePhase(12.25), 12.25);
    expect(sky.domeMaterial.uniforms.uScattering!.value).toBeCloseTo(1);
    expect(sky.domeMaterial.uniforms.uSunIntensity!.value).toBeCloseTo(1.55);
    const sunDir = sky.domeMaterial.uniforms.uSunDir!.value as Vector3;
    expect(sunDir.y).toBeCloseTo(0.721, 2);
    expect(sunDir.x / sunDir.z).toBeCloseTo(35 / 30, 1);
    const sunColor = sky.domeMaterial.uniforms.uSunColor!.value as Color;
    expect(sunColor.getHex()).toBe(DAY_CYCLE_LIGHT_PRESETS.day.dirColor.getHex());
    // The haze band shares the fog's own Color instance — one fog colour.
    expect(sky.domeMaterial.uniforms.uHazeColor!.value).toBe(sky.fog.color);
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
    expect(morningDir.y).toBeGreaterThan(0.5);
    expect(eveningDir.y).toBeGreaterThan(0.5);

    morning.dispose();
    evening.dispose();
  });

  it("smothers the sun and the scattering in a storm", () => {
    const sky = createGardenSky();
    sky.applyPhase(dayCyclePhase(12), 12, 1);
    expect(sky.domeMaterial.uniforms.uScattering!.value).toBeCloseTo(0.4);
    expect(sky.domeMaterial.uniforms.uSunIntensity!.value).toBeCloseTo(1.55 * 0.15);
    sky.dispose();
  });
});

/**
 * W6.8. These are the arithmetic guarantees the fog ladder was chosen for, not
 * a taste judgement — so they can be asserted, and a future retune that quietly
 * gives one of them up fails here instead of in a screenshot nobody compares.
 */
describe("garden sky applyPhase", () => {
  it("grades the dome without a frame, so the probe can bake before the update", () => {
    // `garden-environment` bakes its PMREM probe from this material EARLY in
    // the frame, before `update` runs. Left ungraded the dome still holds the
    // night colours it was constructed with, and the probe caches those under
    // a daytime key — every metal surface lit by a night sky at noon.
    const sky = createGardenSky();
    const zenith = sky.domeMaterial.uniforms.uZenith.value as Color;
    expect(zenith.getHex()).toBe(DAY_CYCLE_SKY_PRESETS.night.zenith.getHex());

    sky.applyPhase(dayCyclePhase(12), 12);

    expect(zenith.getHex()).toBe(DAY_CYCLE_SKY_PRESETS.day.zenith.getHex());
    expect((sky.domeMaterial.uniforms.uHorizon.value as Color).getHex())
      .toBe(DAY_CYCLE_SKY_PRESETS.day.fog.getHex());
    expect((sky.domeMaterial.uniforms.uMiddle.value as Color).getHex())
      .toBe(DAY_CYCLE_SKY_PRESETS.day.horizon.getHex());
    expect(sky.fog.color.getHex()).toBe(DAY_CYCLE_SKY_PRESETS.day.fog.getHex());
    sky.dispose();
  });

  it("leaves update on the same picture, so grading twice a frame is free", () => {
    const early = createGardenSky();
    const whole = createGardenSky();
    const phase = dayCyclePhase(18.5);

    early.applyPhase(phase, 18.5);
    early.update(phase, FRAME);
    whole.update(phase, FRAME);

    for (const uniform of ["uZenith", "uHorizon"] as const) {
      expect((early.domeMaterial.uniforms[uniform]!.value as Color).getHex())
        .toBe((whole.domeMaterial.uniforms[uniform]!.value as Color).getHex());
    }
    for (const uniform of ["uEmberStrength", "uScattering", "uSunIntensity", "uHazeStrength"] as const) {
      expect(early.domeMaterial.uniforms[uniform]!.value)
        .toBe(whole.domeMaterial.uniforms[uniform]!.value);
    }
    expect((early.domeMaterial.uniforms.uSunDir!.value as Vector3).toArray())
      .toEqual((whole.domeMaterial.uniforms.uSunDir!.value as Vector3).toArray());
  });
});

describe("garden sky aerial perspective", () => {
  // Three's linear Fog uses smoothstep, not a linear blend.
  const fogAt = (depth: number, near: number, far: number): number => {
    const t = Math.max(0, Math.min(1, (depth - near) / (far - near)));
    return t * t * (3 - 2 * t);
  };

  function fogAtCamera(
    camera: typeof DEFAULT_CAMERA,
    viewport = DEFAULT_VIEWPORT,
  ) {
    const pose = cameraPoseFromIso(camera, { x: viewport.width, y: viewport.height });
    const eye = cameraEye(pose);
    const sky = createGardenSky();
    sky.update(dayCyclePhase(12), {
      ...FRAME,
      cameraPosition: eye,
      targetX: pose.targetTile.x * TILE_SCALE,
      targetZ: pose.targetTile.y * TILE_SCALE,
    });
    const range = { far: sky.fog.far, near: sky.fog.near, eye, pose };
    sky.dispose();
    return range;
  }

  function fogAtZoom(zoom: number) {
    return fogAtCamera({ ...DEFAULT_CAMERA, zoom });
  }

  it("keeps the island below two percent fog while dissolving the far plate", () => {
    for (const viewport of [
      { height: 720, width: 900 },
      { height: 640, width: 1200 },
    ]) {
      const camera = defaultCamera({ ...viewport, map: MAP });
      const { far, near, eye } = fogAtCamera(camera, viewport);
      const distanceTo = (x: number, z: number) =>
        Math.hypot(eye.x - x, eye.y - GARDEN_WATER_Y, eye.z - z);
      const islandX = (60 + GARDEN_ISLAND_TILE_OFFSET.x) * TILE_SCALE;
      const islandZ = (70 + GARDEN_ISLAND_TILE_OFFSET.y) * TILE_SCALE;
      // Include the far side of the island, not only the target or tower centre.
      expect(fogAt(distanceTo(islandX - 12, islandZ - 12), near, far)).toBeLessThan(0.02);
      // Midpoints of both far edges, before the transparent plate skirt.
      for (const [x, z] of [[0, 70 * TILE_SCALE], [70 * TILE_SCALE, 0]]) {
        expect(fogAt(distanceTo(x!, z!), near, far)).toBeGreaterThanOrEqual(0.3);
      }
    }
  });

  it("moves the fog behind the target when the perspective eye pulls out", () => {
    const rest = fogAtZoom(DEFAULT_CAMERA.zoom);
    const wide = fogAtZoom(DEFAULT_CAMERA.zoom / 2);
    expect(wide.near).toBeGreaterThan(rest.near);
    expect(fogAt(wide.pose.distance, wide.near, wide.far)).toBeLessThan(0.02);
    expect(wide.far - wide.pose.distance).toBeGreaterThan(wide.near - wide.pose.distance);
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
