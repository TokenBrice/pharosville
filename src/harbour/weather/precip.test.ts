import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getBeamUniforms } from "../beam/uniforms";
import { FAR_FLOOR, FAR_STREAK, farDepthAlpha, farStreakShare, PRECIP_BUDGET, Precipitation } from "./precip";

describe("E25 precipitation depth", () => {
  it("fades far drops monotonically toward a floor and shortens their streaks (the near drops untouched)", () => {
    for (const D of [300, 650, 1300]) {
      let a = Infinity, s = Infinity;
      for (let depth = 0; depth <= 3 * D; depth += D / 50) {
        const fa = farDepthAlpha(depth, D), fs = farStreakShare(depth, D);
        expect(fa).toBeLessThanOrEqual(a + 1e-12);
        expect(fs).toBeLessThanOrEqual(s + 1e-12);
        a = fa; s = fs;
      }
      expect(farDepthAlpha(0.5 * D, D)).toBe(1);
      expect(farStreakShare(0.5 * D, D)).toBe(1);
      expect(farDepthAlpha(2 * D, D)).toBeCloseTo(FAR_FLOOR, 9);
      expect(farStreakShare(2 * D, D)).toBeCloseTo(FAR_STREAK, 9);
    }
  });

  it("keeps the DEWS instance count (budget × precip) with or without the gust sheets", () => {
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const p = new Precipitation({
      uAOTex: { value: tex }, uAOBounds: { value: new THREE.Vector4() }, uPoolTex: { value: tex }, uPoolBounds: { value: new THREE.Vector4() },
      uWindowGlow: { value: 0 }, beam: getBeamUniforms({ services: new Map() } as unknown as Parameters<typeof getBeamUniforms>[0]), noise: tex,
    });
    const camera = new THREE.PerspectiveCamera(30, 1.6, 1, 5000);
    camera.position.set(0, 300, 600);
    for (const tier of ["low", "medium", "high"] as const) for (const rain of [0, 0.2, 0.55, 1]) for (const snow of [0, 0.3]) {
      const counts = [undefined, 0, 0.6, 1].map((sheets) => {
        p.update({
          camera, distance: 650, target: new THREE.Vector3(), rain, snow, wind: new THREE.Vector2(0.5, 0.2), spray: 0, flash: 0,
          ambient: new THREE.Color(0.3, 0.3, 0.35), time: 3, viewport: new THREE.Vector2(1600, 1000), budget: PRECIP_BUDGET[tier],
          gust: new THREE.Vector4(0.6, 0.8, 0.5, 12), ...(sheets === undefined ? {} : { sheets }),
        });
        return (p.fall.geometry as THREE.InstancedBufferGeometry).instanceCount;
      });
      for (const n of counts) expect(n).toBe(Math.round(PRECIP_BUDGET[tier].fall * Math.min(1, rain + snow)));
    }
    p.dispose(); tex.dispose();
  });
});
