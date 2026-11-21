import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getBeamUniforms } from "../beam/uniforms";
import { Lightning } from "./lightning";
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

function makePrecip() {
  const tex = new THREE.Texture();
  return new Precipitation({
    uAOTex: { value: tex },
    uAOBounds: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPoolTex: { value: tex },
    uPoolBounds: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWindowGlow: { value: 0 },
    beam: getBeamUniforms({ services: new Map() } as unknown as Parameters<typeof getBeamUniforms>[0]),
    noise: tex,
  });
}

describe("atmospheric rain, splashes and storm lightning", () => {
  it("keeps WATCH drizzle translucent and scales rain ripple rings realistically across zoom levels", () => {
    const p = makePrecip();
    const cam = new THREE.PerspectiveCamera(40, 1.6, 1, 5000);
    cam.position.set(0, 260, 520);
    const baseFrame = {
      camera: cam,
      distance: 650,
      target: new THREE.Vector3(),
      rain: 0.08,
      snow: 0,
      wind: new THREE.Vector2(0.3, -0.2),
      spray: 0,
      flash: 0,
      ambient: new THREE.Color(0.6, 0.65, 0.7),
      time: 10,
      viewport: new THREE.Vector2(1600, 1000),
      budget: PRECIP_BUDGET.high,
    };

    // Light WATCH drizzle: faint translucent whisper, never harsh white scratches
    p.update(baseFrame);
    const fallMat = p.fall.material as THREE.ShaderMaterial;
    const groundMat = p.ground.material as THREE.ShaderMaterial;
    expect(fallMat.uniforms.uRainAlpha.value).toBeLessThan(0.08);
    expect(groundMat.uniforms.uSplashAlpha.value).toBeLessThan(0.14);

    // Realistic drizzle ring radii (~0.25-0.46 m) at close, heart, and overview distances; a downpour's rings grow
    // so the storm still reads at the heart view
    for (const distance of [220, 650, 1300]) {
      p.update({ ...baseFrame, distance });
      expect(groundMat.uniforms.uSplashSize.value).toBeGreaterThanOrEqual(0.25);
      expect(groundMat.uniforms.uSplashSize.value).toBeLessThanOrEqual(0.46);
      p.update({ ...baseFrame, distance, rain: 1.0, spray: 0.9 });
      expect(groundMat.uniforms.uSplashSize.value).toBeGreaterThanOrEqual(0.6);
      expect(groundMat.uniforms.uSplashSize.value).toBeLessThanOrEqual(1.9);
    }

    // DANGER storm: heavy rain curtains and visible (never opaque) splash rings
    p.update({ ...baseFrame, rain: 1.0, spray: 1.0 });
    expect(fallMat.uniforms.uRainAlpha.value).toBeGreaterThan(0.45);
    expect(groundMat.uniforms.uSplashAlpha.value).toBeLessThan(0.75);
    p.dispose();
  });

  it("illuminates the cloud-emergence corona and lingers cloud-interior flash afterglow safely", () => {
    const l = new Lightning();
    const cam = new THREE.PerspectiveCamera(40, 1.6, 1, 5000);
    l.strikeNow();
    l.update({
      dt: 0.016,
      rate: 7.5,
      strikeKm: [2.5, 9],
      suppressed: false,
      camera: cam,
      horizon: 1500,
      halfFovDeg: 28,
      bandTopDeg: 5,
      fwdAz: 0,
      night: 0.5,
    });
    const mat = l.mesh.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uTopE.value).toBeGreaterThan(1.5);
    expect(l.flash).toBeGreaterThan(0.4);
    // reduced motion suppresses flashes completely
    l.update({
      dt: 0.016,
      rate: 7.5,
      strikeKm: [2.5, 9],
      suppressed: true,
      camera: cam,
      horizon: 1500,
      halfFovDeg: 28,
      bandTopDeg: 5,
      fwdAz: 0,
      night: 0.5,
    });
    expect(l.mesh.visible).toBe(false);
    l.dispose();
  });

  it("preserves outward breakwater normal (nx, nz) in aAnchor.zw and flags spray via negative aSeed.z", () => {
    const p = makePrecip();
    const anchors: ReadonlyArray<readonly [number, number, number, number]> = [
      [10, -20, -0.6, -0.8],
      [30, 40, 0.8, -0.6],
    ];
    p.setSprayAnchors(anchors);
    const geo = p.ground.geometry as THREE.InstancedBufferGeometry;
    const aArr = (geo.getAttribute("aAnchor") as THREE.InstancedBufferAttribute).array as Float32Array;
    const sArr = (geo.getAttribute("aSeed") as THREE.InstancedBufferAttribute).array as Float32Array;
    expect(aArr[0]).toBeCloseTo(10, 5);
    expect(aArr[1]).toBeCloseTo(-20, 5);
    expect(aArr[2]).toBeCloseTo(-0.6, 5);
    expect(aArr[3]).toBeCloseTo(-0.8, 5);
    expect(aArr[6]).toBeCloseTo(0.8, 5);
    expect(aArr[7]).toBeCloseTo(-0.6, 5);
    expect(sArr[2]).toBeLessThan(0);
    expect(sArr[6]).toBeLessThan(0);
    expect(sArr[10]).toBeGreaterThanOrEqual(0);
    p.dispose();
  });
});
