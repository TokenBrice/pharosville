import { Color, DataTexture, PlaneGeometry, ShaderMaterial } from "three";
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

  it("packs risk-zone tint ellipses into the shader with the water z-flip", () => {
    const water = createGardenWater(0);
    water.setZoneState([
      {
        center: { x: 30, z: -12 },
        color: new Color("#ef4444"),
        radiusX: 8,
        radiusZ: 5,
        strength: 0.22,
      },
    ]);
    expect(water.material.fragmentShader).toContain("uZoneEllipse");
    expect(uniformNumber(water.material, "uZoneCount")).toBe(1);
    const ellipse = water.material.uniforms.uZoneEllipse!.value[0]!;
    expect(ellipse).toMatchObject({ x: 30, y: 12 });
    expect(ellipse.z).toBeCloseTo(1 / 8);
    expect(ellipse.w).toBeCloseTo(1 / 5);
    const tint = water.material.uniforms.uZoneTint!.value[0]!;
    expect(tint.w).toBeCloseTo(0.22);
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

    water.update(frame({
      renderScheduler: { tier: "interaction" },
    }));
    expect(uniformNumber(water.material, "uDetail")).toBe(0.58);

    water.update(frame({
      renderScheduler: { tier: "recovery" },
    }));
    expect(uniformNumber(water.material, "uDetail")).toBe(0.36);

    water.update(frame({
      reducedMotion: true,
      renderScheduler: { tier: "constrained" },
      timeSeconds: 99,
    }));
    expect(uniformNumber(water.material, "uDetail")).toBe(0.24);
    expect(uniformNumber(water.material, "uTime")).toBe(0);
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

    water.update(frame({ renderScheduler: { tier: "balanced" } }));
    expect(water.cloudShadowsOn()).toBe(true);
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBeGreaterThan(0);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBe(1);
    expect(uniformNumber(water.material, "uRippleStrength")).toBe(1);

    water.update(frame({ renderScheduler: { tier: "recovery" } }));
    expect(water.cloudShadowsOn()).toBe(false);
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBe(0);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBe(0);
    expect(uniformNumber(water.material, "uRippleStrength")).toBe(0);
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

function uniformNumber(material: ShaderMaterial, name: string): number {
  return material.uniforms[name]!.value as number;
}

function uniformColor(material: ShaderMaterial, name: string): Color {
  return material.uniforms[name]!.value as Color;
}
