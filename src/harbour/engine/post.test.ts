import * as THREE from "three";
import { BloomEffect, EdgeDetectionMaterial, SMAAEffect, SMAAPreset, SMAAWeightsMaterial } from "postprocessing";
import { describe, expect, it, vi } from "vitest";
import { fillGradeLUT, gradePixel, PostChain } from "./post";
import { DEFAULT_KEYFRAMES, styleCDirection } from "./time-of-day";
import { TIERS } from "./quality";

import type { Grade } from "./time-of-day";

const neutral = (): Grade => ({ lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1 });

describe("grade LUT", () => {
  it("a neutral grade is the identity", () => {
    for (const v of [0, 0.18, 0.5, 0.9, 1]) {
      const o = gradePixel([v, v * 0.5, 1 - v], neutral());
      expect(o[0]).toBeCloseTo(v, 5);
      expect(o[1]).toBeCloseTo(v * 0.5, 5);
      expect(o[2]).toBeCloseTo(1 - v, 5);
    }
  });

  it("stays in [0, 1] and fills size³ RGBA texels", () => {
    const size = 4;
    const data = new Uint16Array(size ** 3 * 4);
    fillGradeLUT(data, size, { lift: [1.1, 1, 0.9], gamma: [0.9, 1, 1.1], gain: [1.2, 1, 0.8], saturation: 1.4, contrast: 1.3 });
    expect(data.every((h) => h !== 0x7e00)).toBe(true); // no NaN
    const g = gradePixel([1, 1, 1], { lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1.5, 1.5, 1.5], saturation: 2, contrast: 1.4 });
    for (const c of g) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); }
  });
});

describe("time of day", () => {
  it("keyframes are ordered and wrap 0 → 24", () => {
    const hours = DEFAULT_KEYFRAMES.map((k) => k.hour);
    expect(hours[0]).toBe(0);
    expect(hours[hours.length - 1]).toBe(24);
    for (let i = 1; i < hours.length; i++) expect(hours[i]).toBeGreaterThan(hours[i - 1]);
  });

  it("style C light angles keep their relation to the camera (Blender cam az 225° ↔ runtime yaw 45°)", () => {
    // a light at the camera's own azimuth must point back toward the runtime camera (+x, +z)
    const d = styleCDirection(225, 0);
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(d.z).toBeCloseTo(Math.SQRT1_2, 5);
    // golden sun (az 288°, el 9°) sits 63° off the camera azimuth
    const g = styleCDirection(288, 9);
    const ang = Math.acos((g.x * Math.SQRT1_2 + g.z * Math.SQRT1_2) / Math.hypot(g.x, g.z)) * 180 / Math.PI;
    expect(ang).toBeCloseTo(63, 3);
    expect(Math.asin(g.y) * 180 / Math.PI).toBeCloseTo(9, 3);
  });
});

describe("bloom mip ownership", () => {
  it("resizes only targets through 8→6→8→7→8 without disposing blur materials", () => {
    const bloom = new BloomEffect({ mipmapBlur: true, levels: 8, radius: 0.72 });
    const pass = bloom.mipmapBlurPass;
    const mip = pass as typeof pass & {
      downsamplingMaterial: THREE.ShaderMaterial;
      upsamplingMaterial: THREE.ShaderMaterial;
      downsamplingMipmaps: THREE.WebGLRenderTarget[];
      upsamplingMipmaps: THREE.WebGLRenderTarget[];
    };
    const down = mip.downsamplingMaterial, up = mip.upsamplingMaterial;
    const disposed = vi.fn();
    down.addEventListener("dispose", disposed);
    up.addEventListener("dispose", disposed);
    pass.setSize(1600, 1000);
    const chain = Object.assign(Object.create(PostChain.prototype) as PostChain, {
      bloom, smaa: { applyPreset: vi.fn() },
    });
    const output = pass.texture;
    for (const tier of ["low", "high", "medium", "high"] as const) {
      const oldTargets = [...mip.downsamplingMipmaps, ...mip.upsamplingMipmaps];
      const targetDisposed = vi.fn();
      for (const target of oldTargets) target.addEventListener("dispose", targetDisposed);
      chain.setQuality(TIERS[tier]);
      expect(targetDisposed).toHaveBeenCalledTimes(oldTargets.length);
      // The output object is also sampled by BloomEffect's uniform: its identity must not change.
      expect(pass.texture).toBe(output);
      expect(pass.levels).toBe(TIERS[tier].bloomLevels);
      expect(pass.radius).toBe(0.72);
      expect(mip.downsamplingMaterial).toBe(down);
      expect(mip.upsamplingMaterial).toBe(up);
      expect(disposed).not.toHaveBeenCalled();
      let w = 1600, h = 1000;
      for (const target of mip.downsamplingMipmaps) {
        w = Math.round(w * 0.5); h = Math.round(h * 0.5);
        expect([target.width, target.height]).toEqual([w, h]);
      }
      const unchanged = vi.fn();
      for (const target of [...mip.downsamplingMipmaps, ...mip.upsamplingMipmaps]) target.addEventListener("dispose", unchanged);
      chain.setQuality(TIERS[tier]);
      expect(unchanged).not.toHaveBeenCalled();
    }
    bloom.dispose();
    expect(disposed).toHaveBeenCalled();
  });
});

describe("quality preset preparation", () => {
  it("prepares only the two changing SMAA surfaces, preserving live defines and per-tier presets", () => {
    const edge = new EdgeDetectionMaterial(), weights = new SMAAWeightsMaterial();
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    const smaa = {
      edgeDetectionMaterial: edge, weightsMaterial: weights,
      edgeDetectionPass: { scene, camera }, weightsPass: { scene, camera },
      renderTargetEdges: new THREE.WebGLRenderTarget(), renderTargetWeights: new THREE.WebGLRenderTarget(),
    };
    const chain = Object.assign(Object.create(PostChain.prototype) as PostChain, { smaa });
    const liveEdge = { ...edge.defines }, liveWeights = { ...weights.defines };
    for (const tier of ["low", "medium", "high"] as const) {
      const prepared = chain.preparationEntries(TIERS[tier]);
      expect(prepared.entries).toHaveLength(2);
      const expectedEdge = new EdgeDetectionMaterial(), expectedWeights = new SMAAWeightsMaterial();
      SMAAEffect.prototype.applyPreset.call({ edgeDetectionMaterial: expectedEdge, weightsMaterial: expectedWeights } as SMAAEffect,
        tier === "low" ? SMAAPreset.LOW : tier === "medium" ? SMAAPreset.MEDIUM : SMAAPreset.HIGH);
      const materials = prepared.entries.map((entry) => (entry.root as THREE.Mesh).material as THREE.ShaderMaterial);
      expect(materials[0].defines).toEqual(expectedEdge.defines);
      expect(materials[1].defines).toEqual(expectedWeights.defines);
      expect(edge.defines).toEqual(liveEdge);
      expect(weights.defines).toEqual(liveWeights);
      expect(prepared.entries.map((entry) => entry.target())).toEqual([smaa.renderTargetEdges, smaa.renderTargetWeights]);
      const disposed = vi.fn();
      for (const material of materials) material.addEventListener("dispose", disposed);
      prepared.dispose();
      expect(disposed).toHaveBeenCalledTimes(2);
      expectedEdge.dispose(); expectedWeights.dispose();
    }
    edge.dispose(); weights.dispose(); smaa.renderTargetEdges.dispose(); smaa.renderTargetWeights.dispose();
  });
});
