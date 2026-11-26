import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { preparationMaterial } from "../engine/prepare";
import { TIERS, type QualitySettings } from "../engine/quality";
import { MAX_NIGHT_GLINTS, OceanSystem } from "./ocean-system";
import { SDF_COAST_RANGE, sdfMainlandFade } from "./sea-sdf";
import { shoalCoordsCpu } from "./shaders/ocean-disp";
import { SceneCapture } from "./scene-capture";
import { OCEAN_FRAG } from "./ocean-material";
import { pointSwellCache, SEA_STATES, swellPhase, waveHeight, WAVES } from "./waves";
import { FullscreenPass } from "./gpu-bake";

vi.mock("../engine/extras", async (load) => ({ ...(await load<typeof import("../engine/extras")>()), extraEnabled: (name: string) => name !== "mirror" }));
vi.mock("./textures", () => ({ acquireFxTextures: async () => ({ noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }) }));
vi.mock("./sdf-image", () => ({ loadSdfImage: async () => ({ width: 1, height: 1, data: new Uint8Array(4), coast: new Uint8Array(1) }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Evaluate top-level #ifdef/#ifndef/#else/#endif blocks for HB_LITE and count active fragment samplers. */
function countActiveSamplers(src: string, lite: boolean): number {
  const stack: boolean[] = [true];
  let activeSrc = "";
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (t.startsWith("#ifdef HB_LITE")) { stack.push(stack[stack.length - 1]! && lite); continue; }
    if (t.startsWith("#ifndef HB_LITE")) { stack.push(stack[stack.length - 1]! && !lite); continue; }
    if (t.startsWith("#ifdef ") || t.startsWith("#ifndef ")) { stack.push(stack[stack.length - 1]!); continue; }
    if (t.startsWith("#else")) {
      const parent = stack.length >= 2 ? stack[stack.length - 2]! : true;
      stack[stack.length - 1] = parent && !stack[stack.length - 1]!;
      continue;
    }
    if (t.startsWith("#endif")) { if (stack.length > 1) stack.pop(); continue; }
    if (stack[stack.length - 1]) activeSrc += `${line}\n`;
  }
  let total = 0;
  for (const m of activeSrc.matchAll(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler(?:2D|2DArray|Cube|3D)\s+([^;]+);/g)) {
    total += m[1].split(",").filter((s) => s.trim().length > 0).length;
  }
  return total;
}

describe("ocean feature preparation", () => {
  it("prepares explicit biolum/lite recipes without changing live defines, and compiles zero variants between High and Medium", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const listeners = new Set<(q: QualitySettings) => void>();
    const quality = { tier: "medium", onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const ctx = { scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-10, -10, 10, 10] } }], ["quality", quality],
    ]) as Services } as unknown as EngineContext;
    const system = new OceanSystem(); await system.init(ctx);
    const material = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
    const ocean = ctx.services.get("ocean")!, defines = { ...material.defines };
    const keys = new Set<string>(), version = material.version;
    for (const biolum of [false, true]) for (const tier of ["high", "medium", "low"] as const) {
      ctx.uniforms.uFoliage.value.y = biolum ? 1 : 0;
      const liveKey = material.customProgramCacheKey(), restore = ocean.preparationScope(tier);
      const owned = preparationMaterial(material), shader = { ...THREE.ShaderLib.basic, uniforms: {}, defines: {} } as THREE.WebGLProgramParametersWithUniforms;
      owned.onBeforeCompile(shader, {} as THREE.WebGLRenderer); keys.add(owned.customProgramCacheKey()); restore();
      expect("HB_LITE" in shader.defines!).toBe(tier === "low");
      expect("HB_BIOLUM" in shader.defines!).toBe(biolum);
      expect(material.customProgramCacheKey()).toBe(liveKey); expect(material.defines).toEqual(defines); expect(material.version).toBe(version);
      owned.dispose();
    }
    // High & Medium share one HB_OCEAN_FULL shader -> only 4 total recipes (2 tiers × 2 seasonal bits)
    expect(keys.size).toBe(4);
    expect(ocean.featureIdentity?.("high")).toBe(ocean.featureIdentity?.("medium"));
    expect(ocean.featureIdentity?.("low")).not.toBe(ocean.featureIdentity?.("high"));

    // High <-> Medium triggers ZERO material recompiles
    quality.tier = "high";
    for (const fn of listeners) fn(TIERS.high);
    expect(material.version).toBe(version);
    quality.tier = "medium";
    for (const fn of listeners) fn(TIERS.medium);
    expect(material.version).toBe(version);

    // Crossing to Low and back invalidates once per crossing
    for (const [index, tier] of ["low", "medium"].entries()) {
      quality.tier = tier;
      for (const fn of listeners) fn(TIERS[tier as "low" | "medium"]);
      for (const fn of listeners) fn(TIERS[tier as "low" | "medium"]);
      expect(material.version).toBe(version + index + 1);
    }
    system.dispose(ctx);
  });

  it.each(["low", "medium", "high"] as const)("starts %s with the right wake mode/size and rebinds textures on each tier crossing", async (tier) => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const listeners = new Set<(q: QualitySettings) => void>();
    const quality = { tier: tier as string, onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const ctx = { scene: new THREE.Scene(), renderer: {} as THREE.WebGLRenderer, uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-1000, -1000, 1000, 1000] } }], ["quality", quality],
    ]) as Services } as unknown as EngineContext;
    const system = new OceanSystem(); await system.init(ctx);
    const material = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
    const wake = ctx.services.get("wake")!, ocean = ctx.services.get("ocean")!, sizeOf = (texture: THREE.Texture) => (texture.image as { width: number }).width;
    expect(sizeOf(wake.texture)).toBe(tier === "high" ? 2048 : 1024);
    expect(material.uniforms.uWakeRgba.value).toBe(tier === "low" ? 0 : 1);
    const blit = vi.spyOn(FullscreenPass.prototype, "render").mockImplementation(() => {});
    for (const targetTier of ["low", "medium", "high", "low"] as const) {
      await ocean.prepareTier?.(targetTier);
      quality.tier = targetTier;
      for (const listener of listeners) listener(TIERS[targetTier]);
      expect(sizeOf(wake.texture)).toBe(targetTier === "high" ? 2048 : 1024);
      expect(material.uniforms.uWake.value).toBe(wake.texture);
      expect(material.uniforms.uWakeRgba.value).toBe(targetTier === "low" ? 0 : 1);
      expect(material.uniforms.uRibbonsOn.value).toBe(targetTier === "low" ? 0 : 1);
      blit.mockClear();
    }
    system.dispose(ctx);
  });
});

describe("E02 the retired mainland in the CPU sea", () => {
  it("fades the SDF's coast to open water beyond the island's coasts, like the shaders, for hulls and dolphins", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const ctx = { scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-1000, -1000, 1000, 1000] } }],
    ]) as Services } as unknown as EngineContext;
    const system = new OceanSystem(); await system.init(ctx);
    const ocean = ctx.services.get("ocean")!;
    expect(ocean.coastAt(0, 100)).toBe(-64);
    expect(ocean.coastAt(0, 470)).toBe(-64);
    expect(ocean.coastAt(0, 600)).toBeCloseTo(64, 9);
    expect(ocean.coastAt(-600, 0)).toBeCloseTo(64, 9);
    const mid = ocean.coastAt(515, 0);
    expect(mid).toBeGreaterThan(-64); expect(mid).toBeLessThan(64);
    const s = THREE.MathUtils.smoothstep, damp = s(mid, 0, 34) * 0.9 + 0.1 * s(mid, -2, 2);
    expect(ocean.heightAt(515, 0)).toBe(waveHeight(515, 0, 0, SEA_STATES[1].amp) * damp);
    expect(ocean.heightAt(0, 100)).toBe(0);
    expect(ocean.heightAt(0, 600)).toBeCloseTo(waveHeight(0, 600, 0, SEA_STATES[1].amp), 12);
    system.dispose(ctx);
  });
});

describe("a fixed point's kept swell (P-PERF)", () => {
  it("gives a buoy the height heightAt gives, at every sea time; a moved point or a new SDF re-takes its damping", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const ctx = { scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-1000, -1000, 1000, 1000] } }],
    ]) as Services } as unknown as EngineContext;
    const system = new OceanSystem(); await system.init(ctx);
    const ocean = ctx.services.get("ocean")!;
    const internals = system as unknown as { coastR: Uint8Array; sdfVersion: number; time: number };
    const point = pointSwellCache();
    const steps = [[505, 12], [505, 12], [520, -8], [100, 0], "sdf", [100, 0], [505, 12]] as const;
    let worst = 0, water = 0;
    for (const step of steps) {
      if (step === "sdf") { internals.coastR[0] = 255; internals.sdfVersion++; continue; }
      for (const t of [0, 0.016, 1, 3600.5, 86400.25]) {
        internals.time = t;
        const want = ocean.heightAt(step[0], step[1]);
        worst = Math.max(worst, Math.abs(ocean.heightAt(step[0], step[1], point) - want));
        if (step[0] === 100 && want !== 0) water++;
      }
    }
    expect(worst).toBeLessThan(5e-12);
    expect(water).toBeGreaterThan(0);
    system.dispose(ctx);
  });
});

describe("Phase 0–2 ocean contracts (15/16 sampler cap, uDynPoolBounds, hero night glints, FFT & ProjectedGrid)", () => {
  it("stays strictly within the WebGL2 15/16 fragment sampler budget in both Full (High/Med) and Lite (Low) variants", () => {
    expect(countActiveSamplers(OCEAN_FRAG, false)).toBe(15);
    expect(countActiveSamplers(OCEAN_FRAG, true)).toBe(13);
  });

  it("toggles wakeCollars.enabled on High, exposes dampAt, decouples uDynPoolBounds from uWakeBounds, and binds hero night glints", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    vi.spyOn(FullscreenPass.prototype, "render").mockImplementation(() => {});
    const listeners = new Set<(q: QualitySettings) => void>();
    const quality = { tier: "medium", onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const ctx = { scene: new THREE.Scene(), renderer: {} as THREE.WebGLRenderer, uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-500, -500, 500, 500] } }], ["quality", quality],
    ]) as Services } as unknown as EngineContext;
    const system = new OceanSystem(); await system.init(ctx);
    const mat = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
    const ocean = ctx.services.get("ocean")!;
    const collars = ctx.services.get("wakeCollars")!;
    const ribbons = ctx.services.get("wakeRibbons")!;

    expect(collars.enabled).toBe(false);
    expect(ribbons.active).toBe(true);
    expect(mat.uniforms.uProjGridOn.value).toBe(1);
    quality.tier = "high";
    for (const fn of listeners) fn(TIERS.high);
    expect(collars.enabled).toBe(true);
    expect(ribbons.active).toBe(true);
    expect(mat.uniforms.uProjGridOn.value).toBe(1);
    quality.tier = "low";
    for (const fn of listeners) fn(TIERS.low);
    expect(collars.enabled).toBe(false);
    expect(ribbons.active).toBe(false);
    expect(mat.uniforms.uProjGridOn.value).toBe(0);
    expect(ocean.dampAt(0, 100)).toBe(0);
    expect(ocean.dampAt(0, 600)).toBe(1);

    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    ocean.bindDynPool?.(tex, 1, [-120, -120, 120, 120]);
    expect(mat.uniforms.uDynPoolTex.value).toBe(tex);
    expect((mat.uniforms.uDynPool.value as THREE.Vector4).x).toBe(1);
    expect((mat.uniforms.uDynPoolBounds.value as THREE.Vector4).toArray()).toEqual([-120, -120, 120, 120]);
    expect((mat.uniforms.uWakeBounds.value as THREE.Vector4).toArray()).toEqual([-500, -500, 500, 500]);

    const pos = Array.from({ length: MAX_NIGHT_GLINTS }, (_, i) => new THREE.Vector4(i * 10, 4, -i * 5, 80));
    const col = Array.from({ length: MAX_NIGHT_GLINTS }, () => new THREE.Vector4(1.2, 0.8, 0.3, 2));
    ocean.bindNightGlints?.(pos, col, 6);
    expect(mat.uniforms.uNightGlintCount.value).toBe(6);
    expect((mat.uniforms.uNightGlintPos.value as THREE.Vector4[])[2].toArray()).toEqual([20, 4, -10, 80]);
    expect((mat.uniforms.uNightGlintCol.value as THREE.Vector4[])[2].toArray()).toEqual([1.2, 0.8, 0.3, 2]);
    ocean.bindNightGlints?.(pos, col, 99);
    expect(mat.uniforms.uNightGlintCount.value).toBe(MAX_NIGHT_GLINTS);

    tex.dispose();
    system.dispose(ctx);
  });

  it("handles aborted init and partial dispose safely without throwing or leaking services", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const ac = new AbortController();
    ac.abort();
    const ctx = {
      signal: ac.signal,
      scene: new THREE.Scene(),
      uniforms: createWorldUniforms(),
      services: new Map<string, unknown>([
        ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-500, -500, 500, 500] } }],
      ]) as Services,
    } as unknown as EngineContext;
    const system = new OceanSystem();
    await expect(system.init(ctx)).rejects.toThrow();
    expect(() => system.dispose(ctx)).not.toThrow();
    expect(ctx.services.get("ocean")).toBeUndefined();
    expect(ctx.services.get("wakeRibbons")).toBeUndefined();
  });
});

describe("Phase 1–2 render-order boundary, SceneCapture guard, Seabed, Caustics & Tiered Reflections", () => {
  it("configures ocean as first transparent draw (renderOrder -10, depthWrite true, NoBlending) with texelFetch refraction", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const ctx = {
      scene: new THREE.Scene(),
      uniforms: createWorldUniforms(),
      services: new Map<string, unknown>([
        ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-500, -500, 500, 500] } }],
      ]) as Services,
    } as unknown as EngineContext;
    const system = new OceanSystem();
    await system.init(ctx);
    const mesh = ctx.scene.getObjectByName("ocean") as THREE.Mesh;
    const mat = mesh.material as THREE.ShaderMaterial;

    expect(mesh.renderOrder).toBe(-10);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(true);
    expect(mat.depthTest).toBe(true);
    expect(mat.blending).toBe(THREE.NoBlending);
    expect(mat.uniforms.uCapColor).toBeDefined();
    expect(mat.uniforms.uCapDepth).toBeDefined();
    expect(mat.uniforms.uCapReady.value).toBe(0);
    expect(mat.uniforms.uCapSize).toBeDefined();
    expect(mat.uniforms.uCausticMap).toBeDefined();
    expect(mat.uniforms.uCausticBounds).toBeDefined();
    expect(mat.uniforms.uCausticMode.value).toBe(1);
    expect(mat.uniforms.uFftAtlas).toBeDefined();
    expect(mat.uniforms.uMirrorTex).toBeDefined();
    expect(ctx.scene.getObjectByName("ocean-seabed")).toBeDefined();
    expect(OCEAN_FRAG).toContain("texelFetch(uCapColor,");

    system.dispose(ctx);
    expect(ctx.scene.getObjectByName("ocean-seabed")).toBeUndefined();
  });

  it("guards ocean.onBeforeRender SceneCapture on camera, composer.inputBuffer, preparationScope, and DPR >= 0.8 across tiers", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    vi.spyOn(FullscreenPass.prototype, "render").mockImplementation(() => {});
    const captureSpy = vi.spyOn(SceneCapture.prototype, "capture").mockImplementation(function (this: SceneCapture) {
      this.uniforms.uCapReady.value = 1;
    });

    const listeners = new Set<(q: QualitySettings) => void>();
    const quality = {
      tier: "high" as "high" | "medium" | "low",
      dpr: 1.5,
      onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    };
    const mainCamera = new THREE.PerspectiveCamera();
    const otherCamera = new THREE.PerspectiveCamera();
    const inputBuffer = new THREE.WebGLRenderTarget(800, 600, { depthBuffer: true });
    const otherTarget = new THREE.WebGLRenderTarget(400, 300, { depthBuffer: true });
    let activeTarget: THREE.WebGLRenderTarget | null = inputBuffer;
    const renderer = {
      getRenderTarget: () => activeTarget,
      setRenderTarget: (rt: THREE.WebGLRenderTarget | null) => { activeTarget = rt; },
      state: { bindFramebuffer: vi.fn(), setScissorTest: vi.fn() },
    } as unknown as THREE.WebGLRenderer;
    const registeredPrep: unknown[] = [];
    const preparation = { register: (entry: unknown) => { registeredPrep.push(entry); return () => { registeredPrep.pop(); }; } };

    const ctx = {
      scene: new THREE.Scene(),
      camera: mainCamera,
      composer: { inputBuffer },
      renderer,
      uniforms: createWorldUniforms(),
      services: new Map<string, unknown>([
        ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-500, -500, 500, 500] } }],
        ["quality", quality],
        ["preparation", preparation],
      ]) as Services,
    } as unknown as EngineContext;

    const system = new OceanSystem();
    await system.init(ctx);
    expect(registeredPrep.length).toBeGreaterThan(0);

    const mesh = ctx.scene.getObjectByName("ocean") as THREE.Mesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    const ocean = ctx.services.get("ocean")!;
    const trigger = (cam: THREE.Camera) => mesh.onBeforeRender(renderer, ctx.scene, cam, mesh.geometry, mat, null as unknown as THREE.Group);

    trigger(mainCamera);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenLastCalledWith(renderer, inputBuffer, mainCamera, false, true);
    expect(mat.uniforms.uCapReady.value).toBe(1);
    expect(mat.uniforms.uCausticMode.value).toBe(2);

    trigger(otherCamera);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(mat.uniforms.uCapReady.value).toBe(0);

    activeTarget = otherTarget;
    trigger(mainCamera);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(mat.uniforms.uCapReady.value).toBe(0);
    activeTarget = inputBuffer;

    const restorePrep = ocean.preparationScope("high");
    trigger(mainCamera);
    restorePrep();
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(mat.uniforms.uCapReady.value).toBe(0);

    const releaseSpy = vi.spyOn(SceneCapture.prototype, "release");
    quality.dpr = 0.67;
    for (const fn of listeners) fn(TIERS.low);
    expect(ctx.scene.getObjectByName("ocean-seabed")?.visible).toBe(false);
    expect(releaseSpy).toHaveBeenCalled();
    trigger(mainCamera);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(mat.uniforms.uCapReady.value).toBe(0);
    quality.dpr = 1.25;

    quality.tier = "medium";
    for (const fn of listeners) fn(TIERS.medium);
    expect(ctx.scene.getObjectByName("ocean-seabed")?.visible).toBe(true);
    trigger(mainCamera);
    expect(captureSpy).toHaveBeenLastCalledWith(renderer, inputBuffer, mainCamera, true, true);
    expect(mat.uniforms.uCausticMode.value).toBe(1);

    quality.tier = "low";
    for (const fn of listeners) fn(TIERS.low);
    trigger(mainCamera);
    expect(captureSpy).toHaveBeenLastCalledWith(renderer, inputBuffer, mainCamera, true, false);
    expect(mat.uniforms.uCausticMode.value).toBe(0);

    system.dispose(ctx);
    expect(registeredPrep.length).toBe(0);
    inputBuffer.dispose();
    otherTarget.dispose();
  });

  it("skips disabled optional chunks (&extras=-refract,-fft,-planar) completely even if those chunks reject", async () => {
    vi.resetModules();
    vi.stubGlobal("location", { search: "?extras=-refract,-fft,-planar", hash: "" });
    vi.doMock("../engine/extras", () => ({ extraEnabled: (name: string) => name === "mirror" }));
    vi.doMock("./seabed", () => { throw new Error("seabed chunk failed"); });
    vi.doMock("./caustics-pass", () => { throw new Error("caustics chunk failed"); });
    vi.doMock("./fft/fft-system", () => { throw new Error("fft chunk failed"); });
    vi.doMock("./planar-mirror", () => { throw new Error("planar chunk failed"); });
    try {
      const { FullscreenPass: FP } = await import("./gpu-bake");
      vi.spyOn(FP.prototype, "render").mockImplementation(() => {});
      const { OceanSystem: FreshOceanSystem } = await import("./ocean-system");
      const listeners = new Set<(q: QualitySettings) => void>();
      const quality = { tier: "high" as const, dpr: 1.5, onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
      const ctx = {
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
        composer: { addPass: vi.fn(), removePass: vi.fn(), inputBuffer: new THREE.WebGLRenderTarget(16, 16) },
        renderer: {} as THREE.WebGLRenderer,
        uniforms: createWorldUniforms(),
        services: new Map<string, unknown>([
          ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-500, -500, 500, 500] } }],
          ["quality", quality],
        ]) as Services,
      } as unknown as EngineContext;

      const system = new FreshOceanSystem();
      await system.init(ctx);
      expect(ctx.scene.getObjectByName("ocean-seabed")).toBeUndefined();
      const mat = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
      expect(mat.uniforms.uCapReady.value).toBe(0);
      expect(mat.uniforms.uFftOn.value).toBe(0);
      // With -planar on High, falls back to same-frame Hi-Z SSR (uReflectMode = 1)
      expect(mat.uniforms.uReflectMode.value).toBe(1);

      system.dispose(ctx);
      ctx.composer.inputBuffer.dispose();
    } finally {
      vi.doUnmock("../engine/extras");
      vi.doUnmock("./seabed");
      vi.doUnmock("./caustics-pass");
      vi.doUnmock("./fft/fft-system");
      vi.doUnmock("./planar-mirror");
      vi.resetModules();
    }
  });

  it("defers importing/constructing upper-tier FFT, ProjectedGrid, WakeRibbons, PlanarMirror, and HiZSSR on Low startup", async () => {
    vi.resetModules();
    vi.stubGlobal("location", { search: "", hash: "" });
    vi.doMock("../engine/extras", () => ({ extraEnabled: () => true }));
    vi.doMock("./projected-grid", () => { throw new Error("projected-grid loaded on low"); });
    vi.doMock("./wake-ribbons", () => { throw new Error("wake-ribbons loaded on low"); });
    vi.doMock("./fft/fft-system", () => { throw new Error("fft loaded on low"); });
    vi.doMock("./planar-mirror", () => { throw new Error("planar-mirror loaded on low"); });
    vi.doMock("./hiz-ssr", () => { throw new Error("hiz-ssr loaded on low"); });
    try {
      const { OceanSystem: FreshOceanSystem } = await import("./ocean-system");
      const quality = { tier: "low" as const, dpr: 1, onChange: () => () => {} };
      const ctx = {
        scene: new THREE.Scene(),
        uniforms: createWorldUniforms(),
        services: new Map<string, unknown>([
          ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-500, -500, 500, 500] } }],
          ["quality", quality],
        ]) as Services,
      } as unknown as EngineContext;
      const system = new FreshOceanSystem();
      await system.init(ctx);
      const mat = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
      expect(mat.uniforms.uFftOn.value).toBe(0);
      expect(mat.uniforms.uProjGridOn.value).toBe(0);
      expect(mat.uniforms.uRibbonsOn.value).toBe(0);
      expect(mat.uniforms.uReflectMode.value).toBe(0);
      system.dispose(ctx);
    } finally {
      vi.doUnmock("../engine/extras");
      vi.doUnmock("./projected-grid");
      vi.doUnmock("./wake-ribbons");
      vi.doUnmock("./fft/fft-system");
      vi.doUnmock("./planar-mirror");
      vi.doUnmock("./hiz-ssr");
      vi.resetModules();
    }
  });

  it("inverts combined WAVES[0] + C0 FFT horizontal displacement in storm seas (< 0.025 m parity)", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const ctx = {
      scene: new THREE.Scene(),
      uniforms: createWorldUniforms(),
      services: new Map<string, unknown>([
        ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-1000, -1000, 1000, 1000] } }],
        ["quality", { tier: "high", dpr: 1.5, onChange: () => () => {} }],
      ]) as Services,
    } as unknown as EngineContext;
    const system = new OceanSystem();
    await system.init(ctx);
    const ocean = ctx.services.get("ocean")!;
    const priv = system as unknown as {
      fft: { setTier: (t: "high") => void; cpuMirror: { update: (t: number, ws: number, wx: number, wz: number, a: number, c: number) => void; sampleRawDisplacement: (x: number, z: number, out: [number, number, number]) => void } };
      fftUpdated: boolean;
      time: number;
      seaU: { value: THREE.Vector4 };
      coastR: Uint8Array;
      sdfData: Uint8Array;
    };
    priv.coastR.fill(255); // open sea (coast = +64 m, damp = 1, shoreDamp = 1, shoalK = 0)
    for (let i = 0; i < priv.sdfData.length; i += 4) { priv.sdfData[i] = 255; priv.sdfData[i + 1] = 255; }
    priv.time = 12.0;
    priv.seaU.value.set(0.85, 0.9, 1, 1);
    priv.fft.setTier("high");
    priv.fft.cpuMirror.update(12.0, 23, 0.8, -0.6, 0.85, 0.9);
    priv.fftUpdated = true;

    const w0 = WAVES[0]!;
    const qa0 = w0.steep / (w0.k * WAVES.length);
    const raw: [number, number, number] = [0, 0, 0];
    let maxErr = 0;
    for (let i = 0; i < 20; i++) {
      const x0 = -320 + i * 37;
      const z0 = 260 - i * 29;
      const ph = swellPhase(x0, z0, 12.0);
      priv.fft.cpuMirror.sampleRawDisplacement(x0, z0, raw);
      const dx = qa0 * w0.dirX * Math.cos(ph) * 0.85 + raw[0];
      const dy = w0.amp * Math.sin(ph) * 0.85 + raw[1];
      const dz = qa0 * w0.dirZ * Math.cos(ph) * 0.85 + raw[2];
      const hCpu = ocean.heightAt(x0 + dx, z0 + dz);
      maxErr = Math.max(maxErr, Math.abs(hCpu - dy));
    }
    expect(maxErr).toBeLessThan(0.025);
    system.dispose(ctx);
  });

  it("keeps CPU buoyancy shoaling continuous across shipped shoreline texel boundaries (bilinear + mip2 parity)", async () => {
    let sharp: typeof import("sharp").default | null = null;
    try { sharp = (await import("sharp")).default; } catch { /* sharp unavailable */ }
    if (!sharp) return;

    vi.stubGlobal("location", { search: "", hash: "" });
    const layout = (await import("../data/layout.json")).default as unknown as {
      bounds: { min: [number, number, number]; max: [number, number, number] };
      sea: { bounds: [number, number, number, number] };
    };
    const webpPath = new URL("../../../public/harbour/sea-sdf.webp", import.meta.url).pathname;
    const { data: raw, info } = await sharp(webpPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height, row = w * 4;
    const sdfData = new Uint8Array(w * h * 4);
    const coastR = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) sdfData.set(raw.subarray((h - 1 - j) * row, (h - j) * row), j * row);
    for (let i = 0; i < coastR.length; i++) coastR[i] = sdfData[i * 4];

    const ctx = {
      scene: new THREE.Scene(),
      uniforms: createWorldUniforms(),
      services: new Map<string, unknown>([
        ["layout", layout],
        ["quality", { tier: "high", dpr: 1.5, onChange: () => () => {} }],
      ]) as Services,
    } as unknown as EngineContext;
    const system = new OceanSystem();
    await system.init(ctx);
    const ocean = ctx.services.get("ocean")!;
    const priv = system as unknown as {
      sdfTex: THREE.DataTexture;
      sdfData: Uint8Array;
      coastR: Uint8Array;
      sdfSize: number;
      buildSdfMipmaps: () => void;
      evalShoalAt: (x: number, z: number, out: [number, number, number]) => number;
      fft: { setTier: (t: "high") => void; cpuMirror: { update: (t: number, ws: number, wx: number, wz: number, a: number, c: number) => void } };
      fftUpdated: boolean;
      time: number;
      seaU: { value: THREE.Vector4 };
    };
    priv.sdfData = sdfData;
    priv.coastR = coastR;
    priv.sdfSize = w;
    priv.buildSdfMipmaps();
    priv.time = 12.0;
    priv.seaU.value.set(0.85, 0.9, 1, 1);
    priv.fft.setTier("high");
    priv.fft.cpuMirror.update(12.0, 23, 0.8, -0.6, 0.85, 0.9);
    priv.fftUpdated = true;

    // GPU uSdf uses the exact CPU-built RGBA8 mipmap chain (generateMipmaps = false) so mip-2 bytes match 1:1
    const mips = priv.sdfTex.mipmaps as unknown as Array<{ data: Uint8Array; width: number; height: number }>;
    expect(priv.sdfTex.generateMipmaps).toBe(false);
    expect(mips.length).toBe(Math.log2(w) + 1);
    expect(mips[0]!.width).toBe(w);
    expect(mips[2]!.width).toBe(w >> 2);
    expect(mips[mips.length - 1]!.width).toBe(1);

    // Independent GLSL float32 reference reading the exact GPU-uploaded mip-0 and mip-2 RGBA8 buffers
    const f32 = Math.fround;
    const sampleGpuRgba8 = (mip: { data: Uint8Array; width: number; height: number }, u: number, v: number, ch: number) => {
      const m = mip.width;
      const sx = f32(Math.max(0, Math.min(m - 1, f32(Math.max(0, Math.min(1, u)) * m - 0.5))));
      const sz = f32(Math.max(0, Math.min(m - 1, f32(Math.max(0, Math.min(1, v)) * m - 0.5))));
      const x0 = Math.floor(sx), z0 = Math.floor(sz);
      const x1 = Math.min(m - 1, x0 + 1), z1 = Math.min(m - 1, z0 + 1);
      const tx = f32(sx - x0), tz = f32(sz - z0);
      const d = mip.data;
      const v00 = f32(d[((z0 * m + x0) << 2) + ch] / 255);
      const v10 = f32(d[((z0 * m + x1) << 2) + ch] / 255);
      const v01 = f32(d[((z1 * m + x0) << 2) + ch] / 255);
      const v11 = f32(d[((z1 * m + x1) << 2) + ch] / 255);
      const top = f32(v00 + (v10 - v00) * tx);
      const bot = f32(v01 + (v11 - v01) * tx);
      return f32(top + (bot - top) * tz);
    };
    const [bx0, bz0, bx1, bz1] = layout.sea.bounds;
    const bw = bx1 - bx0, bh = bz1 - bz0;
    const scx = (layout.bounds.min[0] + layout.bounds.max[0]) / 2;
    const scz = (layout.bounds.min[2] + layout.bounds.max[2]) / 2;
    const gpuShoalRef = (x: number, z: number): [number, number, number] => {
      const u = (x - bx0) / bw, v = (z - bz0) / bh;
      const mf = sdfMainlandFade(x, z, scx, scz);
      const r0 = sampleGpuRgba8(mips[0]!, u, v, 0);
      const g0 = sampleGpuRgba8(mips[0]!, u, v, 1);
      const coast = ((r0 + (1 - r0) * mf) - 0.5) * SDF_COAST_RANGE;
      const depth = (g0 + (1 - g0) * mf) * 40;
      const eS = 0.004;
      const gx = f32(sampleGpuRgba8(mips[2]!, u + eS, v, 0) - sampleGpuRgba8(mips[2]!, u - eS, v, 0));
      const gz = f32(sampleGpuRgba8(mips[2]!, u, v + eS, 0) - sampleGpuRgba8(mips[2]!, u, v - eS, 0));
      const gl = f32(Math.hypot(gx, gz));
      const gFade = THREE.MathUtils.smoothstep(gl, 0.002, 0.008);
      const snx = gl > 1e-4 ? f32((gx / gl) * gFade) : 0;
      const snz = gl > 1e-4 ? f32((gz / gl) * gFade) : 0;
      const out: [number, number, number] = [0, 0, 0];
      return shoalCoordsCpu(x, z, depth, coast, snx, snz, out);
    };

    // Exact reported near-saddle shoreline point (-331.26738, -84.06113): CPU matches GPU-uploaded RGBA8 mip-2
    const cpuPt: [number, number, number] = [0, 0, 0];
    priv.evalShoalAt(-331.26738, -84.06113, cpuPt);
    const gpuPt = gpuShoalRef(-331.26738, -84.06113);
    expect(Math.hypot(cpuPt[0] - gpuPt[0], cpuPt[1] - gpuPt[1])).toBeLessThan(1e-3);

    // Exact reported shoreline texel-boundary crossing at z = -81.570898 m
    const zCross = -81.570898;
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    priv.evalShoalAt(-318.572188, zCross, a);
    priv.evalShoalAt(-318.562188, zCross, b);
    expect(b[0]).toBeGreaterThan(a[0]);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(0.05);

    // Fine 0.01 m sweep across [-319.0, -318.0] verifying monotonic shoal X and smooth buoyancy height
    let prevH = ocean.heightAt(-319.0, zCross);
    priv.evalShoalAt(-319.0, zCross, a);
    for (let x = -318.99; x <= -318.0001; x += 0.01) {
      priv.evalShoalAt(x, zCross, b);
      expect(b[0] - a[0], `x=${x.toFixed(2)}`).toBeGreaterThan(0.002);
      const hNow = ocean.heightAt(x, zCross);
      expect(Math.abs(hNow - prevH), `h at x=${x.toFixed(2)}`).toBeLessThan(0.025);
      a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
      prevH = hNow;
    }

    system.dispose(ctx);
  }, 30_000);
});
