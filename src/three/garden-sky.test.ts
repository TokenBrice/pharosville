import { Color, InstancedMesh, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { HARBOR_PALETTE } from "../systems/palette";
import { defaultCamera, GARDEN_DEFAULT_CAMERA_ZOOM } from "../systems/camera";
import { gardenCameraViewHeight } from "../systems/garden-observatory-slice";
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
  gardenBokashiBandGlsl,
  gardenBokashiInk,
} from "./garden-sky";
import {
  CLOUD_COUNT,
  GARDEN_AUTUMN_GEESE_COUNT,
  MIST_BANK_COUNT,
} from "./garden-sky-billboards";

const DEFAULT_VIEWPORT = { height: 1000, width: 1600 };
const DEFAULT_CAMERA = defaultCamera({ ...DEFAULT_VIEWPORT, map: buildPharosVilleMap() });
const DEFAULT_VIEW_HEIGHT = gardenCameraViewHeight(DEFAULT_VIEWPORT.height, DEFAULT_CAMERA.zoom);

const FRAME = {
  reducedMotion: false,
  wallClockHour: 12,
  targetX: 47.6,
  targetZ: 38.9,
  timeSeconds: 0,
  viewHeight: DEFAULT_VIEW_HEIGHT,
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
    const springBackdrop = spring.root.getObjectByName("garden-sky-backdrop") as Mesh<PlaneGeometry, ShaderMaterial>;
    const winterBackdrop = winter.root.getObjectByName("garden-sky-backdrop") as Mesh<PlaneGeometry, ShaderMaterial>;
    expect((winterBackdrop.material.uniforms.uHorizon.value as Color).getHex())
      .toBe(winter.fog.color.getHex());
    for (const uniform of ["uLower", "uMiddle", "uZenith"] as const) {
      expect(colorDistance(winterBackdrop.material.uniforms[uniform].value as Color, cool))
        .toBeLessThan(colorDistance(springBackdrop.material.uniforms[uniform].value as Color, cool));
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
  it("puts a two-triangle graded sky behind the finite plate", () => {
    const sky = createGardenSky();
    const backdrop = sky.root.getObjectByName("garden-sky-backdrop");
    expect(backdrop).toBeInstanceOf(Mesh);
    expect((backdrop as Mesh).geometry).toBeInstanceOf(PlaneGeometry);
    expect((backdrop as Mesh).geometry.index?.count).toBe(6);
    const source = ((backdrop as Mesh).material as ShaderMaterial).fragmentShader;
    expect(source).toContain("float skyHeight = clamp(vScreenPosition.y, 0.0, 1.0)");
    expect(source).toContain("uLower");
    expect(source).toContain("gardenBokashiShade(skyHeight, uBokashiAmount)");
    expect(source).toContain("uSunDir.x - uSunDir.z");
    expect(source).toContain("moonGlow");
    // Shakkei has one owner: the world-backed, batched garden-horizon mesh.
    expect(source).not.toContain("farCrest");
    expect(source).not.toContain("nearRidge");
    sky.dispose();
  });

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
    const backdrop = sky.root.getObjectByName("garden-sky-backdrop") as Mesh<PlaneGeometry, ShaderMaterial>;
    expect((backdrop.material.uniforms.uZenith.value as Color).getHex())
      .toBe(new Color(HARBOR_PALETTE.deep_sea_1).getHex());
    expect((backdrop.material.uniforms.uMiddle.value as Color).getHex())
      .toBe(new Color(HARBOR_PALETTE.moonlight)
        .lerp(new Color(HARBOR_PALETTE.sky_day_zenith), 0.42).getHex());
    const lower = backdrop.material.uniforms.uLower.value as Color;
    expect(colorDistance(lower, new Color(HARBOR_PALETTE.moonlight)))
      .toBeLessThan(colorDistance(lower, DAY_CYCLE_SKY_PRESETS.day.fog));
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
    const { near } = fogRangeAtViewHeight(DEFAULT_VIEW_HEIGHT);
    // The island spans ground depth ~155-195 at the calibration framing and its
    // near half is what the tone-mapped ortho grade was pinned against.
    expect(near).toBeGreaterThanOrEqual(178);
  });

  it("never hazes the far frame edge as hard as the pre-W6.8 ladder did", () => {
    const { far, near } = fogRangeAtViewHeight(DEFAULT_VIEW_HEIGHT);
    // Frame-top far water at the calibration framing. The old 192/275 ladder
    // read 0.627 here; a longer ramp to a further endpoint must come in under
    // that at every depth, which is what makes this change unable to white-out
    // more than its predecessor.
    expect(fogAt(244, near, far)).toBeLessThan(0.627);
    expect(fogAt(232, near, far)).toBeLessThan(0.482);
  });

  it("starts the rest ladder ~70% up the frame, so fog is far-field only", () => {
    const { far, near } = fogRangeAtViewHeight(DEFAULT_VIEW_HEIGHT);
    // Warm-village (2026-09-05, preview step 2): at the 1.0 rest the visible
    // ground span is ~125–250 wu, and the W6.8 unit ladder (near 178) fogged
    // from ~40% up — with the ember dye that read as an orange wash over half
    // the picture. The authored rest ladder (FOG_MIN_SCALE ~1.21) leaves the
    // island AND the midground ships at exactly zero haze, lifts first past
    // ~215 wu (~72% up the span), and still grades the frame top (~0.12 at
    // the doubled day span) so the seam dissolves without owning a third of
    // the frame.
    expect(fogAt(195, near, far)).toBe(0);
    expect(fogAt(212, near, far)).toBe(0);
    expect(fogAt(225, near, far)).toBeGreaterThan(0);
    expect(fogAt(250, near, far)).toBeGreaterThan(0.05);
    expect(fogAt(250, near, far)).toBeLessThan(0.2);
  });

  it("still pulls haze in at whole-map framing, per the W6.6 hard-edge finding", () => {
    const wide = fogRangeAtViewHeight(DEFAULT_VIEW_HEIGHT * 4);
    // Capped by FOG_MAX_SCALE. The old ladder put the near plane at 288 here and
    // the map edge resolved as a hard diamond slab in a void.
    expect(wide.near).toBeLessThan(288);
  });

  it("pivots the fog scale on the real default framing, so rest keeps the ladder on", () => {
    // Aerial-perspective contract: FOG_REFERENCE_VIEW_HEIGHT must track the
    // default view height (gardenCameraViewHeight(1000, GARDEN_DEFAULT_CAMERA_ZOOM)).
    // A pivot stranded at an old framing (34 was the 2026-08-13 bug; so is any
    // value far below the current 1.0 rest zoom's ~62.5) clamps the scale to
    // its 1.5 maximum at rest, pushes the near plane past everything visible
    // and silently switches the whole system off. At the default framing the
    // ladder must run at its authored scale, not the wide-framing cap.
    const rest = fogRangeAtViewHeight(
      gardenCameraViewHeight(1000, GARDEN_DEFAULT_CAMERA_ZOOM),
    );
    expect(rest.near).toBeGreaterThanOrEqual(178);
    expect(rest.near).toBeLessThan(178 * 1.25);
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

  it("is anchored to sky height rather than the scene fog range", () => {
    const height = 0.24;
    expect(gardenBokashiInk(height)).toBe(gardenBokashiInk(height));
    expect(gardenBokashiInk(height)).toBeGreaterThan(0);
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

  it("generates the injected GLSL from the same constants it exports", () => {
    const glsl = gardenBokashiBandGlsl();
    expect(glsl).toContain("float gardenBokashiShade(");
    for (const stop of [...GARDEN_BOKASHI_BAND.pale, ...GARDEN_BOKASHI_BAND.deep]) {
      expect(glsl).toContain(Number.isInteger(stop) ? stop.toFixed(1) : String(stop));
    }
    // No private palette or scene-depth uniforms: the sky supplies height and
    // the shared phase amount explicitly.
    expect(glsl).not.toMatch(/\bu[A-Z]\w*/);
    const sky = createGardenSky();
    expect(sky.domeMaterial.fragmentShader).toContain("gardenBokashiShade(skyHeight, uBokashiAmount)");
    sky.dispose();
  });
});
