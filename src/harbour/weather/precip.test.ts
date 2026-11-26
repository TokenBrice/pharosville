import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { getBeamUniforms } from "../beam/uniforms";
import { Lightning } from "./lightning";
import { FAR_FLOOR, FAR_STREAK, farDepthAlpha, farStreakShare, PRECIP_BUDGET, Precipitation, SQUALL_COUNT, SQUALL_FRAG, SQUALL_THRESHOLD, SQUALL_VERT } from "./precip";
import { WeatherSystem } from "./weather-system";
import * as oceanTextures from "../ocean/textures";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";

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

    // Realistic splash ring diameters strictly <= 0.48 m (shader caps rendered radius <= 0.24 m after seed/life multipliers)
    expect(groundMat.vertexShader).toContain("min(uSplashSize * (0.20 + 0.88 * life) * (0.76 + 0.44 * aSeed.w), 0.24)");
    for (const distance of [220, 650, 1300]) {
      p.update({ ...baseFrame, distance });
      const drizzleSize = groundMat.uniforms.uSplashSize.value as number;
      expect(drizzleSize).toBeGreaterThanOrEqual(0.14);
      expect(drizzleSize).toBeLessThanOrEqual(0.21);
      expect(2 * Math.min(drizzleSize * 1.08 * 1.2, 0.24)).toBeLessThanOrEqual(0.48);
      expect(groundMat.uniforms.uDownpour.value).toBe(0);
      p.update({ ...baseFrame, distance, rain: 1.0, spray: 0.9 });
      const stormSize = groundMat.uniforms.uSplashSize.value as number;
      expect(stormSize).toBeGreaterThanOrEqual(0.15);
      expect(stormSize).toBeLessThanOrEqual(0.24);
      expect(2 * Math.min(stormSize * 1.08 * 1.2, 0.24)).toBeLessThanOrEqual(0.48);
      expect(groundMat.uniforms.uDownpour.value).toBeCloseTo(1.0, 5);
    }

    // DANGER storm: heavy rain curtains and visible (never opaque) splash rings
    p.update({ ...baseFrame, rain: 1.0, spray: 1.0 });
    expect(fallMat.uniforms.uRainAlpha.value).toBeGreaterThan(0.45);
    expect(groundMat.uniforms.uSplashAlpha.value).toBeLessThan(0.75);
    p.dispose();
  });

  it("binds ocean shared wave uniforms lazily when WeatherSystem initializes before OceanSystem (systems.ts order)", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const fftTex = new THREE.DataArrayTexture(new Uint8Array(24), 1, 1, 6);
    vi.spyOn(oceanTextures, "acquireFxTextures").mockResolvedValue({ noise: tex, ripple: tex, release() {} });
    const services = new Map<string, unknown>();
    const ctx = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(30, 1.6, 1, 5000),
      rig: { distance: 650, target: new THREE.Vector3() },
      renderer: { domElement: { clientWidth: 1600, clientHeight: 1000 } },
      uniforms: createWorldUniforms(),
      timeOfDay: { hour: 12 },
      services,
    } as unknown as EngineContext;
    const weather = new WeatherSystem();
    try {
      await weather.init(ctx);

      const groundMesh = ctx.scene.getObjectByName("weather-ground") as THREE.Mesh;
      const groundMat = groundMesh.material as THREE.ShaderMaterial;
      // Ocean has not initialized yet -> starts at 0
      expect(groundMat.uniforms.uOceanOn.value).toBe(0);

      // Ocean initializes later (systems.ts order) and registers its shared uniforms
      const shared = {
        uTime: { value: 4.5 },
        uSea: { value: new THREE.Vector4(0.5, 0.7, 0.5, 1) },
        uSdf: { value: tex },
        uSdfBounds: { value: new THREE.Vector4(-500, -500, 500, 500) },
        uSceneCenter: { value: new THREE.Vector2(10, -20) },
        uFftAtlas: { value: fftTex },
        uFftOn: { value: 1 },
        uFftScales: { value: new THREE.Vector4(1 / 509, 1 / 97, 1 / 17.3, 0.55) },
        uFftWeights: { value: new THREE.Vector4(1, 1, 1, 1) },
      };
      services.set("ocean", { shared, coastAt: () => 200, setSeaState: () => {} });

      weather.update({ elapsed: 1, delta: 0.016, nowMs: 1000 }, ctx);
      expect(groundMat.uniforms.uOceanOn.value).toBe(1);
      expect(groundMat.uniforms.uFftAtlas).toBe(shared.uFftAtlas);
      expect(groundMat.uniforms.uSdf).toBe(shared.uSdf);
      expect(groundMat.uniforms.uSceneCenter).toBe(shared.uSceneCenter);
    } finally {
      weather.dispose(ctx);
      tex.dispose();
      fftTex.dispose();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
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
    // §6.3.3 swell-synced ballistic storm plumes preserve water alpha mask
    const groundMat = p.ground.material as THREE.ShaderMaterial;
    expect(groundMat.vertexShader).toContain("hbSwellPhase(aAnchor.xy, uPTime)");
    expect(groundMat.blending).toBe(THREE.CustomBlending);
    expect(groundMat.blendSrcAlpha).toBe(THREE.ZeroFactor);
    expect(groundMat.blendDstAlpha).toBe(THREE.OneFactor);
    p.dispose();
  });

  it("gates volumetric storm squall curtains strictly to stormSea > 0.65, disposes cleanly, and passes B07/C04", () => {
    const p = makePrecip();
    const scene = new THREE.Scene();
    scene.add(p.fall, p.ground, p.squall);

    const squallGeo = p.squall.geometry as THREE.InstancedBufferGeometry;
    const squallMat = p.squall.material as THREE.ShaderMaterial;
    expect(p.squall.name).toBe("weather-squall");
    expect(p.squall.renderOrder).toBe(78);
    expect(p.squall.frustumCulled).toBe(false);
    expect(squallMat.name).toBe("hb_weather_squall");
    expect(squallMat.transparent).toBe(true);
    expect(squallMat.depthWrite).toBe(false);
    expect(squallMat.forceSinglePass).toBe(true);
    expect(squallMat.blending).toBe(THREE.CustomBlending);
    expect(squallMat.blendSrcAlpha).toBe(THREE.ZeroFactor);
    expect(squallMat.blendDstAlpha).toBe(THREE.OneFactor);
    expect(SQUALL_COUNT).toBeGreaterThanOrEqual(18);
    expect(SQUALL_COUNT).toBeLessThanOrEqual(24);
    expect(SQUALL_THRESHOLD).toBe(0.65);

    const cam = new THREE.PerspectiveCamera(40, 1.6, 1, 5000);
    cam.position.set(0, 260, 520);
    const frame = {
      camera: cam,
      distance: 650,
      target: new THREE.Vector3(),
      rain: 0.85,
      snow: 0,
      wind: new THREE.Vector2(0.8, -0.5),
      spray: 0.6,
      flash: 0.2,
      ambient: new THREE.Color(0.35, 0.4, 0.48),
      time: 12,
      viewport: new THREE.Vector2(1600, 1000),
      budget: PRECIP_BUDGET.high,
    };

    // Calm / moderate seas (<= 0.65): strictly hidden with 0 instances
    for (const stormSea of [undefined, 0, 0.35, 0.65]) {
      p.update({ ...frame, ...(stormSea === undefined ? {} : { stormSea }) });
      expect(p.squall.visible).toBe(false);
      expect(squallGeo.instanceCount).toBe(0);
    }

    // Heavy storm sea (> 0.65): activates smoothly across 0.65..0.92
    p.update({ ...frame, stormSea: 0.72 });
    expect(p.squall.visible).toBe(true);
    expect(squallGeo.instanceCount).toBe(SQUALL_COUNT);
    expect(squallMat.uniforms.uStormSea.value).toBeCloseTo(0.72, 5);

    p.update({ ...frame, stormSea: 0.95 });
    expect(p.squall.visible).toBe(true);
    expect(squallGeo.instanceCount).toBe(SQUALL_COUNT);
    expect(squallMat.uniforms.uStormSea.value).toBeCloseTo(0.95, 5);

    // Dropping back to <= 0.65 immediately disables drawing
    p.update({ ...frame, stormSea: 0.65 });
    expect(p.squall.visible).toBe(false);
    expect(squallGeo.instanceCount).toBe(0);

    // B07 / C04 checks on SQUALL_VERT and SQUALL_FRAG: ascending smoothstep only, zero pow(..., 2.0)
    const src = `${SQUALL_VERT}\n${SQUALL_FRAG}`;
    expect(SQUALL_VERT).toContain("smoothstep(0.65, 0.92, uStormSea)");
    expect(SQUALL_FRAG).toContain("uAmbRain");
    expect(SQUALL_FRAG).toContain("uFlashK");
    const smoothRe = /(?<![\w.])smoothstep\s*\(([^,]+),([^,]+),/g;
    for (let m = smoothRe.exec(src); m; m = smoothRe.exec(src)) {
      const e0 = Number(m[1]!.trim());
      const e1 = Number(m[2]!.trim());
      if (Number.isFinite(e0) && Number.isFinite(e1)) {
        expect(e0 < e1, `smoothstep(${m[1]}, ${m[2]})`).toBe(true);
      }
    }
    expect(src).not.toMatch(/\bpow\s*\([^)]*,\s*2(?:\.0*)?\s*\)/);

    // Disposal detaches squall mesh from scene
    p.dispose();
    expect(scene.getObjectByName("weather-squall")).toBeUndefined();
  });
});
