import { Color, NearestFilter, DataTexture, PlaneGeometry, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  GARDEN_WATER_Y,
  GARDEN_ZONE_ROOT_Y,
} from "../systems/garden-observatory-slice";
import type { GardenWaterFrame } from "./garden-water";
import {
  createGardenWater,
  GARDEN_ISLAND_ROCK_RADIUS,
  GARDEN_WATER_MAX_DISPLACEMENT,
} from "./garden-water";

describe("createGardenWater", () => {
  it("creates one WebGL1 surface that samples the normal map and lane texture", () => {
    const water = createGardenWater(-0.12);
    water.setIslandCenter(12, -7);

    expect(water.mesh.children).toHaveLength(0);
    expect(water.mesh.geometry).toBeInstanceOf(PlaneGeometry);
    expect(water.mesh.material).toBeInstanceOf(ShaderMaterial);
    // Kept on WebGL1 GLSL so the shader compiles without an upgrade path.
    expect(water.mesh.material.glslVersion).toBeNull();
    expect(water.mesh.material.fragmentShader).not.toContain("#version 300");
    expect(water.mesh.material.fragmentShader).toContain("sampler2D");
    expect(water.mesh.material.fragmentShader).toContain("uNormalMap");
    expect(water.mesh.material.fragmentShader).toContain("uLaneTexture");
    expect(water.mesh.geometry.index?.count).toBe(96 * 96 * 6);
    expect(water.mesh.position.y).toBe(-0.12);
    expect(water.mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(water.material.uniforms.uIslandCenter!.value).toMatchObject({
      x: 12,
      y: 7,
    });
    water.setBeaconState(6, -4, 1.2, 3);
    expect(water.material.uniforms.uBeaconPosition!.value).toMatchObject({
      x: 6,
      y: 4,
    });
    expect(uniformNumber(water.material, "uBeaconAngle")).toBe(1.2);
    expect(uniformNumber(water.material, "uBeaconStrength")).toBe(1);
    // W6: flicker defaults to a calm mid-glow when the caller omits it, and
    // the island anchor carries the rock radius for the shore SDF.
    expect(uniformNumber(water.material, "uBeaconFlicker")).toBe(0.5);
    expect(uniformNumber(water.material, "uRockRadius")).toBe(
      GARDEN_ISLAND_ROCK_RADIUS,
    );
    water.setBeaconState(6, -4, 1.2, 0.8, 1.7);
    expect(uniformNumber(water.material, "uBeaconFlicker")).toBe(1);
  });

  it("wires the shared lane texture and outlying islet shore centers", () => {
    const water = createGardenWater(0);
    const laneTexture = new DataTexture();

    water.setLaneState(laneTexture, 9);
    expect(water.material.uniforms.uLaneTexture!.value).toBe(laneTexture);
    expect(uniformNumber(water.material, "uLaneCount")).toBe(9);

    water.setIsletCenters({ x: 20, z: -8 }, { x: -14, z: 6 });
    expect(water.material.uniforms.uCemeteryCenter!.value).toMatchObject({
      x: 20,
      y: 8,
    });
    expect(water.material.uniforms.uPigeonnierCenter!.value).toMatchObject({
      x: -14,
      y: -6,
    });
  });

  it("routes each band's colour to its sea-region slot", () => {
    // W2 / D5: the six tinted ellipses are gone. Region GEOMETRY comes from
    // the terrain field the simulation already obeys; what still arrives via
    // setZoneState is each band's live day-blended colour, keyed by region id.
    const water = createGardenWater(0);
    water.setZoneState([
      {
        center: { x: 30, z: -12 },
        color: new Color("#ef4444"),
        radiusX: 8,
        radiusZ: 5,
        regionId: 5,
        strength: 0.44,
      },
    ]);
    expect(water.material.fragmentShader).toContain("uRegionField");
    expect(water.material.fragmentShader).not.toContain("uZoneEllipse");

    const danger = water.material.uniforms.uRegionColor!.value[5]!;
    expect(danger.getHexString()).toBe("ef4444");
    expect(water.material.uniforms.uRegionParams!.value[5]!.w).toBeCloseTo(0.44);
  });

  it("maps the region field with the water plane's z-flip", () => {
    // A tile (tx, ty) lands at world (tx*sqrt2, _, ty*sqrt2), and the plane's
    // -90deg X rotation maps world +Z to local -Y — so V must be negated.
    // Getting this sign wrong mirrors every sea region about the equator.
    const water = createGardenWater(0);
    const transform = water.material.uniforms.uRegionTransform!.value;
    expect(transform.z).toBeGreaterThan(0);
    expect(transform.w).toBeCloseTo(-transform.z);
  });

  it("closes the open-ocean early-out with the same encoding as the main path", () => {
    // Three only compiles tone mapping and an encoding `linearToOutputTexel`
    // in when a material draws to the default framebuffer, so both chunks are
    // no-ops under the post composer and go live the frame it is shed at the
    // `constrained` tier. An early-out that returns without them writes linear
    // values into the sRGB canvas, and the open sea outside the map snaps to a
    // near-black void behind a hard diamond seam.
    const water = createGardenWater(0);
    const source = water.mesh.material.fragmentShader;
    const earlyOut = source.slice(0, source.indexOf("return;"));
    for (const chunk of ["tonemapping_fragment", "colorspace_fragment", "fog_fragment"]) {
      expect(source.split(`#include <${chunk}>`)).toHaveLength(3);
      expect(earlyOut).toContain(`#include <${chunk}>`);
    }
  });

  it("samples the region field with nearest filtering", () => {
    // Bilinear between region 1 and region 3 would synthesise region 2 and
    // paint a phantom band along every boundary.
    const water = createGardenWater(0);
    const field = water.material.uniforms.uRegionField!.value as { magFilter: number; minFilter: number };
    expect(field.magFilter).toBe(NearestFilter);
    expect(field.minFilter).toBe(NearestFilter);
  });

  it("freezes reduced motion and lowers decorative detail by quality tier", () => {
    const water = createGardenWater(0);

    water.update(frame({
      seaState: { swell: 2, tempo: -1 },
      timeSeconds: 17,
    }));
    expect(uniformNumber(water.material, "uTime")).toBe(17);
    expect(uniformNumber(water.material, "uDetail")).toBe(1);
    expect(uniformNumber(water.material, "uWaveAmplitude")).toBeCloseTo(
      GARDEN_WATER_MAX_DISPLACEMENT,
    );
    expect(GARDEN_WATER_MAX_DISPLACEMENT).toBeLessThan(
      GARDEN_ZONE_ROOT_Y - GARDEN_WATER_Y,
    );
    expect(uniformNumber(water.material, "uTempo")).toBe(0);

    // S1: a camera drag is not a load tier. `interaction` resolves through the
    // frozen load reading, so the water keeps full detail while the camera
    // moves — this is the operator's "goes bluish-pale on camera move" bug.
    settle(water, { renderScheduler: { tier: "interaction", loadTier: "full" } });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(1, 3);

    settle(water, { renderScheduler: { tier: "recovery" } });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(0.36, 3);

    // Reduced motion renders ONE static frame, so it must snap rather than ease
    // — a part-way value would read as an accidental pause.
    water.update(frame({
      reducedMotion: true,
      renderScheduler: { tier: "constrained" },
      timeSeconds: 99,
    }));
    expect(uniformNumber(water.material, "uDetail")).toBe(0.24);
    expect(uniformNumber(water.material, "uTime")).toBe(0);
  });

  it("keeps the sea's character through a camera drag", () => {
    // The reported bug, as a guard. On a drag the scheduler returns
    // `interaction` with no hysteresis and no load measurement behind it;
    // reading that as load pressure switched cloud shadows, glitter and every
    // ripple ring off in one frame and cost 41% of the surface's measured
    // luminance variance.
    const water = createGardenWater(0);
    settle(water, { renderScheduler: { tier: "full" } });
    const atRest = {
      cloud: uniformNumber(water.material, "uCloudShadowStrength"),
      detail: uniformNumber(water.material, "uDetail"),
      glitter: uniformNumber(water.material, "uGlitterStrength"),
      ripple: uniformNumber(water.material, "uRippleStrength"),
    };

    settle(water, { renderScheduler: { tier: "interaction", loadTier: "full" } });
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBeCloseTo(atRest.cloud, 5);
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(atRest.detail, 5);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(atRest.glitter, 5);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(atRest.ripple, 5);
    expect(water.cloudShadowsOn()).toBe(true);

    // A drag on a machine already shedding load still sheds — quality tracks
    // the machine, not the mouse.
    settle(water, { renderScheduler: { tier: "interaction", loadTier: "recovery" } });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(0.36, 3);
    expect(water.cloudShadowsOn()).toBe(false);
  });

  it("eases a load-tier change instead of stepping it", () => {
    // S2: hysteresis stops the ladder flapping but cannot make a single
    // crossing invisible. One frame must not carry the whole swing.
    const water = createGardenWater(0);
    settle(water, { renderScheduler: { tier: "full" } });
    const before = uniformNumber(water.material, "uDetail");

    water.update(frame({ renderScheduler: { tier: "recovery" }, timeSeconds: 13.5 }));
    const afterOneFrame = uniformNumber(water.material, "uDetail");
    expect(afterOneFrame).toBeLessThan(before);
    expect(afterOneFrame).toBeGreaterThan(0.36);

    settle(water, { renderScheduler: { tier: "recovery" }, timeSeconds: 14 });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(0.36, 3);
  });

  it("shares the C2 cloud-shadow uniforms with the water material", () => {
    const water = createGardenWater(0);

    expect(water.material.uniforms.uCloudShadow).toBe(water.cloudShadows.uniforms.uCloudShadow);
    expect(water.material.uniforms.uCloudShadowTransform).toBe(
      water.cloudShadows.uniforms.uCloudShadowTransform,
    );
    expect(water.material.uniforms.uCloudShadowStrength).toBe(
      water.cloudShadows.uniforms.uCloudShadowStrength,
    );
    expect(water.cloudShadows.texture.image.width).toBe(256);

    const transform = water.cloudShadows.uniforms.uCloudShadowTransform.value;
    water.cloudShadows.update({ reducedMotion: false, tier: "balanced", timeSeconds: 10 });
    const driftedX = transform[2];
    expect(driftedX).toBeGreaterThan(0);
    // Reduced motion and lower tiers freeze the drift.
    water.cloudShadows.update({ reducedMotion: true, tier: "full", timeSeconds: 40 });
    expect(transform[2]).toBe(driftedX);
    water.cloudShadows.update({ reducedMotion: false, tier: "recovery", timeSeconds: 40 });
    expect(transform[2]).toBe(driftedX);
  });

  it("gates cloud shadows and glitter to balanced+ tiers", () => {
    const water = createGardenWater(0);

    settle(water, { renderScheduler: { tier: "balanced" } });
    expect(water.cloudShadowsOn()).toBe(true);
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBeGreaterThan(0);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(1, 3);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(1, 3);

    settle(water, { renderScheduler: { tier: "recovery" } });
    expect(water.cloudShadowsOn()).toBe(false);
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBeCloseTo(0, 3);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(0, 3);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(0, 3);
  });

  it("registers karesansui ripple-ring emitters via the C2 API", () => {
    const water = createGardenWater(0);

    water.setIslandCenter(24, -16);
    expect(water.rippleRings.ringCount()).toBe(1);
    water.setIsletCenters({ x: 40, z: -20 }, { x: -10, z: 8 });
    expect(water.rippleRings.ringCount()).toBe(3);
    expect(uniformNumber(water.material, "uRippleCount")).toBe(3);

    water.rippleRings.setRing({
      id: "garden.dock.alpha",
      center: { x: 30, z: -4 },
      radius: 7,
      bands: 2,
      periodSeconds: 8,
      strength: 0.4,
    });
    expect(water.rippleRings.ringCount()).toBe(4);
    expect(uniformNumber(water.material, "uRippleCount")).toBe(4);
    const ring = water.material.uniforms.uRipple!.value[3]!;
    expect(ring).toMatchObject({ x: 30, y: 4, z: 7 });
    const params = water.material.uniforms.uRippleParams!.value[3]!;
    expect(params.x).toBe(2);
    expect(params.y).toBe(8);
    expect(params.z).toBeCloseTo(0.4);

    water.rippleRings.removeRing("garden.dock.alpha");
    expect(water.rippleRings.ringCount()).toBe(3);
  });

  it("keeps a default harbor-calm mask until Lane I overrides it", () => {
    const water = createGardenWater(0);

    water.setIslandCenter(24, -16);
    const ellipse = water.material.uniforms.uHarborEllipse!.value;
    expect(ellipse.x).toBe(42);
    expect(ellipse.y).toBe(2);

    water.setHarborCalmMask({
      center: { x: 10, z: -6 },
      radiusX: 8,
      radiusZ: 5,
      calmStrength: 2,
    });
    const overridden = water.material.uniforms.uHarborEllipse!.value;
    expect(overridden).toMatchObject({ x: 10, y: 6 });
    expect(overridden.z).toBeCloseTo(1 / 8);
    expect(uniformNumber(water.material, "uHarborCalm")).toBe(1);
    // A later island re-anchor must not clobber the explicit Lane I extents.
    water.setIslandCenter(1, 1);
    expect(water.material.uniforms.uHarborEllipse!.value).toMatchObject({ x: 10, y: 6 });
  });

  it("moves through distinct day, dusk, and night palettes", () => {
    const water = createGardenWater(0);

    water.update(frame({ wallClockHour: 12 }));
    const day = uniformColor(water.material, "uBaseColor").clone();

    water.update(frame({ wallClockHour: 18 }));
    const dusk = uniformColor(water.material, "uBaseColor").clone();

    water.update(frame({ wallClockHour: 0 }));
    const night = uniformColor(water.material, "uBaseColor").clone();

    expect(day.equals(dusk)).toBe(false);
    expect(dusk.equals(night)).toBe(false);
    expect(day.equals(night)).toBe(false);
    expect(uniformNumber(water.material, "uNight")).toBe(1);
  });
});

function frame(overrides: Partial<GardenWaterFrame> = {}): GardenWaterFrame {
  return {
    reducedMotion: false,
    renderScheduler: { tier: "full" },
    seaState: { swell: 0.18, tempo: 0.24 },
    timeSeconds: 12,
    wallClockHour: 12,
    ...overrides,
  };
}

/**
 * Drive enough advancing frames for S2's tier easing to settle.
 *
 * The tier-driven uniforms approach their target at `1 - e^(-12 dt)` per frame,
 * so a single `update` at a standing clock moves nothing — which is correct
 * (no time passed) but means a test asserting a tier's steady state has to run
 * a clock the way the render loop does.
 */
function settle(
  water: { update: (frame: GardenWaterFrame) => void },
  overrides: Partial<GardenWaterFrame> = {},
): void {
  const start = overrides.timeSeconds ?? 12;
  for (let step = 0; step < 30; step += 1) {
    water.update(frame({ ...overrides, timeSeconds: start + step * 0.05 }));
  }
}

function uniformNumber(material: ShaderMaterial, name: string): number {
  return material.uniforms[name]!.value as number;
}

function uniformColor(material: ShaderMaterial, name: string): Color {
  return material.uniforms[name]!.value as Color;
}
