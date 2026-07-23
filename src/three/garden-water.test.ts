import { Color, PlaneGeometry, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  GARDEN_WATER_Y,
  GARDEN_ZONE_ROOT_Y,
} from "../systems/garden-observatory-slice";
import type { GardenWaterFrame } from "./garden-water";
import {
  createGardenWater,
  GARDEN_WATER_MAX_DISPLACEMENT,
} from "./garden-water";

describe("createGardenWater", () => {
  it("creates one texture-free WebGL1 surface", () => {
    const water = createGardenWater(-0.12);
    water.setIslandCenter(12, -7);

    expect(water.mesh.children).toHaveLength(0);
    expect(water.mesh.geometry).toBeInstanceOf(PlaneGeometry);
    expect(water.mesh.material).toBeInstanceOf(ShaderMaterial);
    expect(water.mesh.material.glslVersion).toBeNull();
    expect(water.mesh.material.fragmentShader).not.toContain("#version 300");
    expect(water.mesh.material.fragmentShader).not.toContain("sampler2D");
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
