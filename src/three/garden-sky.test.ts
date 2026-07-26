import { Color, Mesh, MeshBasicMaterial, type DataTexture } from "three";
import { describe, expect, it } from "vitest";
import { DAY_CYCLE_SKY_PRESETS, dayCyclePhase } from "./garden-day-cycle";
import { createGardenSky } from "./garden-sky";

const FRAME = {
  reducedMotion: false,
  targetX: 47.6,
  targetZ: 38.9,
  timeSeconds: 0,
  viewHeight: 34,
};

function mistOf(sky: ReturnType<typeof createGardenSky>): Mesh<never, MeshBasicMaterial> {
  const mist = sky.root.getObjectByName("garden-sky-mist");
  expect(mist).toBeInstanceOf(Mesh);
  return mist as Mesh<never, MeshBasicMaterial>;
}

describe("garden sky mist band", () => {
  it("fades its alpha falloff to exactly zero at the geometry edge", () => {
    const sky = createGardenSky();
    const texture = mistOf(sky).material.alphaMap as DataTexture;
    const { data, height, width } = texture.image as {
      data: Uint8Array;
      height: number;
      width: number;
    };
    // three's `alphamap_fragment` reads the GREEN channel.
    const green = (x: number, y: number) => data[(y * width + x) * 4 + 1];

    // The plane is a 36:1 stripe rotated to the camera azimuth, so its top and
    // bottom edges project to exactly horizontal screen lines. Any non-zero
    // alpha on an edge texel is a straight band edge, not haze — DataTexture
    // clamps to edge, so the whole outer half-texel inherits that value.
    for (let x = 0; x < width; x += 1) {
      expect(green(x, 0)).toBe(0);
      expect(green(x, height - 1)).toBe(0);
    }
    for (let y = 0; y < height; y += 1) {
      expect(green(0, y)).toBe(0);
      expect(green(width - 1, y)).toBe(0);
    }

    // ...while the band itself still carries its full haze in the middle.
    expect(green(width >> 1, height >> 1)).toBeGreaterThan(200);
    sky.dispose();
  });

  it("keeps the band out of the night sky entirely", () => {
    const sky = createGardenSky();
    const mist = mistOf(sky);

    sky.update(dayCyclePhase(23), FRAME);
    expect(mist.material.opacity).toBe(0);
    expect(mist.visible).toBe(false);

    sky.update(dayCyclePhase(3), FRAME);
    expect(mist.material.opacity).toBe(0);
    expect(mist.visible).toBe(false);

    // Dusk still gets its mist — the band is a dawn/dusk element.
    sky.update(dayCyclePhase(18), FRAME);
    expect(mist.material.opacity).toBeGreaterThan(0.05);
    expect(mist.visible).toBe(true);
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
    // night colours it was constructed with, and the probe caches those under a
    // daytime key — every metal surface lit by a night sky at noon.
    const sky = createGardenSky();
    const zenith = sky.domeMaterial.uniforms.uZenith.value as Color;
    expect(zenith.getHex()).toBe(DAY_CYCLE_SKY_PRESETS.night.zenith.getHex());

    sky.applyPhase(dayCyclePhase(12));

    expect(zenith.getHex()).toBe(DAY_CYCLE_SKY_PRESETS.day.zenith.getHex());
    expect((sky.domeMaterial.uniforms.uHorizon.value as Color).getHex())
      .toBe(DAY_CYCLE_SKY_PRESETS.day.horizon.getHex());
    expect(sky.fog.color.getHex()).toBe(DAY_CYCLE_SKY_PRESETS.day.fog.getHex());
  });

  it("leaves update on the same picture, so grading twice a frame is free", () => {
    const early = createGardenSky();
    const whole = createGardenSky();
    const phase = dayCyclePhase(18.5);

    early.applyPhase(phase);
    early.update(phase, FRAME);
    whole.update(phase, FRAME);

    for (const uniform of ["uZenith", "uHorizon"] as const) {
      expect((early.domeMaterial.uniforms[uniform]!.value as Color).getHex())
        .toBe((whole.domeMaterial.uniforms[uniform]!.value as Color).getHex());
    }
    expect(early.domeMaterial.uniforms.uEmberStrength!.value)
      .toBe(whole.domeMaterial.uniforms.uEmberStrength!.value);
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
