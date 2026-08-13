import { Color, InstancedMesh, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
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
  gardenBokashiBandGlsl,
  gardenBokashiInk,
} from "./garden-sky";
import { CLOUD_COUNT, MIST_BANK_COUNT } from "./garden-sky-billboards";

const FRAME = {
  reducedMotion: false,
  wallClockHour: 12,
  targetX: 47.6,
  targetZ: 38.9,
  timeSeconds: 0,
  viewHeight: 34,
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

  it("keeps the banks out of the midday frame and gives them dawn and night", () => {
    const sky = createGardenSky();
    const mist = mistOf(sky);

    sky.update(dayCyclePhase(12), FRAME);
    expect(mist.visible).toBe(false);

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
      .toBe(DAY_CYCLE_SKY_PRESETS.day.horizon.getHex());
    expect(sky.fog.color.getHex()).toBe(DAY_CYCLE_SKY_PRESETS.day.fog.getHex());
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
  const fogAt = (depth: number, near: number, far: number): number =>
    Math.max(0, Math.min(1, (depth - near) / (far - near)));

  function fogRangeAtViewHeight(viewHeight: number): { far: number; near: number } {
    const sky = createGardenSky();
    sky.update(dayCyclePhase(12), { ...FRAME, viewHeight });
    const range = { far: sky.fog.far, near: sky.fog.near };
    sky.dispose();
    return range;
  }

  it("leaves the island at zero haze, so the graded monument cannot shift", () => {
    const { near } = fogRangeAtViewHeight(34);
    // The island spans ground depth ~155-195 at the calibration framing and its
    // near half is what the AgX/ortho grade was pinned against.
    expect(near).toBeGreaterThanOrEqual(178);
  });

  it("never hazes the far frame edge as hard as the pre-W6.8 ladder did", () => {
    const { far, near } = fogRangeAtViewHeight(34);
    // Frame-top far water at the calibration framing. The old 192/275 ladder
    // read 0.627 here; a longer ramp to a further endpoint must come in under
    // that at every depth, which is what makes this change unable to white-out
    // more than its predecessor.
    expect(fogAt(244, near, far)).toBeLessThan(0.627);
    expect(fogAt(232, near, far)).toBeLessThan(0.482);
  });

  it("grades the midground instead of stacking the whole cue at the horizon", () => {
    const { far, near } = fogRangeAtViewHeight(34);
    // Depth 195 — the near ships. The old ladder gave them 0.036, which is no
    // depth cue at all; this is the half of the frame W6.8 was actually about.
    expect(fogAt(195, near, far)).toBeGreaterThan(0.1);
  });

  it("still pulls haze in at whole-map framing, per the W6.6 hard-edge finding", () => {
    const wide = fogRangeAtViewHeight(34 * 4);
    // Capped by FOG_MAX_SCALE. The old ladder put the near plane at 288 here and
    // the map edge resolved as a hard diamond slab in a void.
    expect(wide.near).toBeLessThan(288);
  });
});

/**
 * W1.4 bokashi bands. The ramp is defined here because garden-sky owns the fog
 * ladder, but it is drawn by the water shader — under the locked orthographic
 * camera the upper-frame haze band IS water fragments, so these tests are the
 * only place the ramp's shape can be asserted without reading pixels.
 */
describe("bokashi bands", () => {
  const NEAR = 178;

  it("is exactly zero at and below the fog's near plane", () => {
    // The strongest guarantee in the design: every stop starts at d >= 1, so
    // the bands cannot reach the island, the harbour or the near fleet at any
    // framing. Construction, not tuning.
    for (const depth of [0, 60, 121, 155, 177.9, NEAR]) {
      expect(gardenBokashiInk(depth, NEAR)).toBe(0);
    }
  });

  it("darkens the farthest readable water, then lightens the horizon seam", () => {
    // ichimonji strip (depth ~189-196 at the calibrated framing) sits below the
    // pale strip (~214-222) and pulls the other way — the woodblock mirror.
    expect(gardenBokashiInk(192, NEAR)).toBeLessThan(0);
    expect(gardenBokashiInk(218, NEAR)).toBeGreaterThan(0);
  });

  it("deepens hardest at the very top of the frame", () => {
    // d = 1.42 - 0.90 * fracFromTop, so the top row is depth ~253.
    const frameTop = gardenBokashiInk(253, NEAR);
    expect(frameTop).toBeLessThan(gardenBokashiInk(244, NEAR));
    expect(gardenBokashiInk(244, NEAR)).toBeLessThan(gardenBokashiInk(235, NEAR));
    // Deep, but a quiet graphic accent rather than a poster stripe: an eighth of
    // a stop at most, and no phase can push it past the authored gain.
    expect(frameTop).toBeGreaterThan(-GARDEN_BOKASHI_BAND.deepGain - 1e-9);
    expect(frameTop).toBeLessThan(-0.15);
  });

  it("rides the ladder when the fog range scales with the view", () => {
    // The stops are multiples of fogNear, so a wider framing moves them out
    // with the ladder instead of leaving them on a framing they were tuned at.
    const wideNear = NEAR * 1.5;
    expect(gardenBokashiInk(255 * 1.5, wideNear)).toBeCloseTo(
      gardenBokashiInk(255, NEAR),
      6,
    );
    expect(gardenBokashiInk(255, wideNear)).toBe(0);
  });

  it("keeps day barely-there and hands the bands to dusk and night", () => {
    const day = gardenBokashiAmount(dayCyclePhase(12));
    const dusk = gardenBokashiAmount(dayCyclePhase(19));
    const night = gardenBokashiAmount(dayCyclePhase(22));
    expect(day).toBeCloseTo(GARDEN_BOKASHI_BAND.dayAmount, 5);
    expect(dusk).toBeGreaterThan(day * 2);
    expect(night).toBeGreaterThan(day * 2);
    expect(Math.max(dusk, night)).toBeLessThanOrEqual(1);
  });

  it("generates the injected GLSL from the same constants it exports", () => {
    const glsl = gardenBokashiBandGlsl();
    expect(glsl).toContain("float gardenBokashiShade(");
    for (const stop of [...GARDEN_BOKASHI_BAND.pale, ...GARDEN_BOKASHI_BAND.deep]) {
      expect(glsl).toContain(Number.isInteger(stop) ? stop.toFixed(1) : String(stop));
    }
    // No uniforms: the water shader calls it from two exit paths.
    expect(glsl).not.toMatch(/\bu[A-Z]\w*/);
  });
});
