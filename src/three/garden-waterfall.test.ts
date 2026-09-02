import { Mesh, ShaderMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import { SEA_REGION_ID, seaRegionAtTile } from "../systems/garden-sea-regions";
import { rimLandAt } from "../systems/garden-rim";
import {
  createGardenWaterfall,
  GARDEN_WATERFALL_DISPLACEMENT,
  GARDEN_WATERFALL_CASCADE_WIDTH_WORLD,
  GARDEN_WATERFALL_PLUNGE_WIDTH_WORLD,
  GARDEN_WATERFALL_POINTS,
} from "./garden-waterfall";

describe("garden waterfall", () => {
  it("ties the deep rim lobe to Calm Anchorage in one opaque dithered draw", () => {
    const waterfall = createGardenWaterfall();
    expect(waterfall.mesh).toBeInstanceOf(Mesh);
    expect(waterfall.mesh.material).toBeInstanceOf(ShaderMaterial);
    expect(waterfall.mesh.material.transparent).toBe(false);
    expect(waterfall.mesh.material.depthWrite).toBe(true);
    expect(waterfall.mesh.material.fragmentShader).toContain("gardenDither");
    expect(waterfall.mesh.material.fragmentShader).toContain("foamCrest");
    expect(waterfall.mesh.material.fragmentShader).toContain("plungeFoam");
    expect(waterfall.drawCallCount).toBe(1);
    expect(waterfall.triangleCount).toBeGreaterThan(0);
    expect(waterfall.triangleCount).toBeLessThan(40);
    expect(rimLandAt(GARDEN_WATERFALL_POINTS[0]!.tileX, GARDEN_WATERFALL_POINTS[0]!.tileY)).toBe(true);
    const pool = GARDEN_WATERFALL_POINTS.at(-1)!;
    expect(rimLandAt(pool.tileX, pool.tileY)).toBe(false);
    expect(seaRegionAtTile(pool.tileX, pool.tileY)).toBe(SEA_REGION_ID.calm);
    expect(GARDEN_WATERFALL_DISPLACEMENT).toBe("water-silver-accents");
    expect(GARDEN_WATERFALL_CASCADE_WIDTH_WORLD).toBeGreaterThanOrEqual(2.9);
    expect(GARDEN_WATERFALL_CASCADE_WIDTH_WORLD).toBeLessThanOrEqual(3.1);
    expect(GARDEN_WATERFALL_PLUNGE_WIDTH_WORLD).toBeGreaterThan(3.8);
  });

  it("scrolls from the route clock and stamps the existing wake field without moving in reduced motion", () => {
    const waterfall = createGardenWaterfall();
    const wakes = { stamp: vi.fn() };
    waterfall.update({ night: 0.25, reducedMotion: false, timeSeconds: 12 }, wakes as never);
    expect(waterfall.mesh.material.uniforms.uTime!.value).toBe(12);
    expect(waterfall.mesh.material.uniforms.uNight!.value).toBe(0.25);
    expect(wakes.stamp).toHaveBeenCalledTimes(3);

    wakes.stamp.mockClear();
    waterfall.update({ night: 1, reducedMotion: true, timeSeconds: 99 }, wakes as never);
    expect(waterfall.mesh.material.uniforms.uTime!.value).toBe(0);
    expect(wakes.stamp).not.toHaveBeenCalled();
  });
});
