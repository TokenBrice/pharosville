import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { preparationMaterial } from "../engine/prepare";
import { TIERS, type QualitySettings } from "../engine/quality";
import { MAX_NIGHT_GLINTS, OceanSystem } from "./ocean-system";
import { SceneCapture } from "./scene-capture";
import { OCEAN_FRAG } from "./ocean-material";
import { OCEAN_FRAG_MIRROR } from "./mirror-pass";
import { pointSwellCache, SEA_STATES, waveHeight } from "./waves";
import { FullscreenPass } from "./gpu-bake";

// These cases predate E35 and drive a bare engine context without a composer: keep the harbour mirror off here.
vi.mock("../engine/extras", async (load) => ({ ...(await load<typeof import("../engine/extras")>()), extraEnabled: (name: string) => name !== "mirror" }));
vi.mock("./textures", () => ({ acquireFxTextures: async () => ({ noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }) }));
vi.mock("./sdf-image", () => ({ loadSdfImage: async () => ({ width: 1, height: 1, data: new Uint8Array(4), coast: new Uint8Array(1) }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("ocean feature preparation", () => {
  it("prepares explicit biolum/lite recipes without changing live defines, and invalidates once per tier change", async () => {
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
    for (const biolum of [false, true]) for (const lite of [false, true]) {
      ctx.uniforms.uFoliage.value.y = biolum ? 1 : 0;
      const liveKey = material.customProgramCacheKey(), restore = ocean.preparationScope(lite);
      const owned = preparationMaterial(material), shader = { ...THREE.ShaderLib.basic, uniforms: {}, defines: {} } as THREE.WebGLProgramParametersWithUniforms;
      owned.onBeforeCompile(shader, {} as THREE.WebGLRenderer); keys.add(owned.customProgramCacheKey()); restore();
      expect("HB_LITE" in shader.defines!).toBe(lite); expect("HB_BIOLUM" in shader.defines!).toBe(biolum);
      expect(material.customProgramCacheKey()).toBe(liveKey); expect(material.defines).toEqual(defines); expect(material.version).toBe(version);
      owned.dispose();
    }
    expect(keys.size).toBe(4);
    for (const [index, tier] of ["low", "medium"].entries()) {
      quality.tier = tier;
      for (const fn of listeners) fn(TIERS[tier as "low" | "medium"]);
      for (const fn of listeners) fn(TIERS[tier as "low" | "medium"]);
      expect(material.version).toBe(version + index + 1);
    }
    system.dispose(ctx);
  });

  it.each(["low", "medium"] as const)("starts %s with the right wake size and rebinds both layers on each tier crossing", async (tier) => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const listeners = new Set<(q: QualitySettings) => void>();
    const quality = { tier: tier as string, onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const ctx = { scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-1000, -1000, 1000, 1000] } }], ["quality", quality],
    ]) as Services } as unknown as EngineContext;
    const system = new OceanSystem(); await system.init(ctx);
    const material = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
    const wake = ctx.services.get("wake")!, sizeOf = (texture: THREE.Texture) => (texture.image as { width: number }).width;
    expect([sizeOf(wake.texture), sizeOf(wake.live)]).toEqual(tier === "low" ? [1024, 1024] : [2048, 2048]);
    const blit = vi.spyOn(FullscreenPass.prototype, "render").mockImplementation(() => {});
    for (const targetTier of ["low", "medium", "high", "low"] as const) {
      const previous = wake.texture;
      quality.tier = targetTier;
      for (const listener of listeners) listener(TIERS[targetTier]);
      const expected = targetTier === "low" ? 1024 : 2048;
      expect([sizeOf(wake.texture), sizeOf(wake.live)]).toEqual([expected, expected]);
      expect(material.uniforms.uWake.value).toBe(wake.texture);
      expect(material.uniforms.uWakeLive.value).toBe(wake.live);
      const resized = sizeOf(previous) !== expected;
      expect(blit).toHaveBeenCalledTimes(resized ? 3 : 0);
      if (resized) expect(wake.texture).not.toBe(previous);
      blit.mockClear();
    }
    system.dispose(ctx);
  });
});

describe("E02 the retired mainland in the CPU sea", () => {
  it("fades the SDF's coast to open water beyond the island's coasts, like the shaders, for hulls and dolphins", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    // the mocked SDF is land everywhere (coast byte 0); the layout-bounds centre is the origin
    const ctx = { scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-1000, -1000, 1000, 1000] } }],
    ]) as Services } as unknown as EngineContext;
    const system = new OceanSystem(); await system.init(ctx);
    const ocean = ctx.services.get("ocean")!;
    expect(ocean.coastAt(0, 100)).toBe(-64);                 // within the island's coasts: the SDF as baked
    expect(ocean.coastAt(0, 470)).toBe(-64);
    expect(ocean.coastAt(0, 600)).toBeCloseTo(64, 9);        // past them: open water, the retired mainland gone
    expect(ocean.coastAt(-600, 0)).toBeCloseTo(64, 9);
    const mid = ocean.coastAt(515, 0);
    expect(mid).toBeGreaterThan(-64); expect(mid).toBeLessThan(64);
    // the swell's damping there is the faded coast's, to the bit (P-PERF: dampAt reuses its texel and fade)
    const s = THREE.MathUtils.smoothstep, damp = s(mid, 0, 34) * 0.9 + 0.1 * s(mid, -2, 2);
    expect(ocean.heightAt(515, 0)).toBe(waveHeight(515, 0, 0, SEA_STATES[1].amp) * damp);
    // hulls bob with the water the vertex shader moves: none on land, the full swell past the fade
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
    // the mainland fade (≈ 505–520 m) and inside the island's coasts (100 m: the SDF byte alone)
    const steps = [[505, 12], [505, 12], [520, -8], [100, 0], "sdf", [100, 0], [505, 12]] as const;
    let worst = 0, water = 0;
    for (const step of steps) {
      if (step === "sdf") { internals.coastR[0] = 255; internals.sdfVersion++; continue; } // what rebuildFromGround does
      for (const t of [0, 0.016, 1, 3600.5, 86400.25]) {
        internals.time = t;
        const want = ocean.heightAt(step[0], step[1]);
        worst = Math.max(worst, Math.abs(ocean.heightAt(step[0], step[1], point) - want));
        if (step[0] === 100 && want !== 0) water++;
      }
    }
    expect(worst).toBeLessThan(5e-12);
    expect(water).toBeGreaterThan(0); // the rebuilt coast reached the kept point
    system.dispose(ctx);
  });
});

describe("Phase 0 ocean contracts (sampler cap, uCollarsOn, uDynPoolBounds, hero night glints)", () => {
  it("stays strictly within the WebGL2 15/16 fragment sampler budget in both standard and mirror variants", () => {
    const countSamplers = (src: string) => {
      let total = 0;
      for (const m of src.matchAll(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler(?:2D|2DArray|Cube|3D)\s+([^;]+);/g)) {
        total += m[1].split(",").filter((s) => s.trim().length > 0).length;
      }
      return total;
    };
    expect(countSamplers(OCEAN_FRAG)).toBeLessThanOrEqual(15);
    expect(countSamplers(OCEAN_FRAG_MIRROR)).toBeLessThanOrEqual(15);
  });

  it("toggles wakeCollars.enabled on High, exposes dampAt, decouples uDynPoolBounds from uWakeBounds, and binds hero night glints", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    vi.spyOn(FullscreenPass.prototype, "render").mockImplementation(() => {});
    const listeners = new Set<(q: QualitySettings) => void>();
    const quality = { tier: "medium", onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const ctx = { scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-500, -500, 500, 500] } }], ["quality", quality],
    ]) as Services } as unknown as EngineContext;
    const system = new OceanSystem(); await system.init(ctx);
    const mat = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
    const ocean = ctx.services.get("ocean")!;
    const collars = ctx.services.get("wakeCollars")!;

    expect(collars.enabled).toBe(false);
    quality.tier = "high";
    for (const fn of listeners) fn(TIERS.high);
    expect(collars.enabled).toBe(true);
    quality.tier = "low";
    for (const fn of listeners) fn(TIERS.low);
    expect(collars.enabled).toBe(false);
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
  });
});

describe("Phase 1 ocean render-order boundary, SceneCapture guard, Seabed and Caustics integration", () => {
  it("configures ocean as first transparent draw (renderOrder -10, depthWrite true, NoBlending) and stays within 15/16 samplers", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const countSamplers = (src: string) => {
      let total = 0;
      for (const m of src.matchAll(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler(?:2D|2DArray|Cube|3D)\s+([^;]+);/g)) {
        total += m[1].split(",").filter((s) => s.trim().length > 0).length;
      }
      return total;
    };
    expect(countSamplers(OCEAN_FRAG)).toBe(14);
    expect(countSamplers(OCEAN_FRAG_MIRROR)).toBe(15);

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
    expect(ctx.scene.getObjectByName("ocean-seabed")).toBeDefined();
    // Depth-consistent integer texel fetch for uCapColor prevents bilinear foreground color bleed at silhouettes (Astra #1)
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
    const renderer = { getRenderTarget: () => activeTarget } as unknown as THREE.WebGLRenderer;
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

    // Main camera + composer.inputBuffer + High tier -> full-res, mipped
    trigger(mainCamera);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenLastCalledWith(renderer, inputBuffer, mainCamera, false, true);
    expect(mat.uniforms.uCapReady.value).toBe(1);
    expect(mat.uniforms.uCausticMode.value).toBe(2);

    // Non-main camera -> skipped, uCapReady reset to 0
    trigger(otherCamera);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(mat.uniforms.uCapReady.value).toBe(0);

    // Wrong render target -> skipped
    activeTarget = otherTarget;
    trigger(mainCamera);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(mat.uniforms.uCapReady.value).toBe(0);
    activeTarget = inputBuffer;

    // Inside preparationScope -> skipped
    const restorePrep = ocean.preparationScope(false);
    trigger(mainCamera);
    restorePrep();
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(mat.uniforms.uCapReady.value).toBe(0);

    // Low DPR (< 0.8) -> skipped, hides seabed, and releases capture RT until recovery (Astra #4)
    const releaseSpy = vi.spyOn(SceneCapture.prototype, "release");
    quality.dpr = 0.67;
    for (const fn of listeners) fn(TIERS.low);
    expect(ctx.scene.getObjectByName("ocean-seabed")?.visible).toBe(false);
    expect(releaseSpy).toHaveBeenCalled();
    trigger(mainCamera);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(mat.uniforms.uCapReady.value).toBe(0);
    quality.dpr = 1.25;

    // Medium tier -> half-res, mipped, Hessian caustics (mode 1), seabed visible again
    quality.tier = "medium";
    for (const fn of listeners) fn(TIERS.medium);
    expect(ctx.scene.getObjectByName("ocean-seabed")?.visible).toBe(true);
    trigger(mainCamera);
    expect(captureSpy).toHaveBeenLastCalledWith(renderer, inputBuffer, mainCamera, true, true);
    expect(mat.uniforms.uCausticMode.value).toBe(1);

    // Low tier -> half-res, no mips, Voronoi caustics (mode 0)
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

  it("skips seabed and caustics imports completely when &extras=-refract disables refraction (even if those chunks reject)", async () => {
    vi.resetModules();
    vi.stubGlobal("location", { search: "?extras=-refract", hash: "" });
    vi.doMock("../engine/extras", () => ({ extraEnabled: (name: string) => name !== "mirror" && name !== "refract" }));
    vi.doMock("./seabed", () => { throw new Error("seabed chunk failed"); });
    vi.doMock("./caustics-pass", () => { throw new Error("caustics chunk failed"); });
    try {
      const { FullscreenPass: FP } = await import("./gpu-bake");
      vi.spyOn(FP.prototype, "render").mockImplementation(() => {});
      const { OceanSystem: FreshOceanSystem } = await import("./ocean-system");
      const registeredPrep: unknown[] = [];
      const ctx = {
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
        composer: { addPass: vi.fn(), removePass: vi.fn(), inputBuffer: new THREE.WebGLRenderTarget(16, 16) },
        renderer: {} as THREE.WebGLRenderer,
        uniforms: createWorldUniforms(),
        services: new Map<string, unknown>([
          ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-500, -500, 500, 500] } }],
          ["preparation", { register: (entry: unknown) => { registeredPrep.push(entry); return () => {}; } }],
        ]) as Services,
      } as unknown as EngineContext;

      const system = new FreshOceanSystem();
      await system.init(ctx);
      expect(ctx.scene.getObjectByName("ocean-seabed")).toBeUndefined();
      expect(registeredPrep).toHaveLength(0);
      const mat = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
      expect(mat.uniforms.uCapReady.value).toBe(0);
      expect(mat.uniforms.uCausticMode.value).toBe(0);

      system.dispose(ctx);
      ctx.composer.inputBuffer.dispose();
    } finally {
      vi.doUnmock("../engine/extras");
      vi.doUnmock("./seabed");
      vi.doUnmock("./caustics-pass");
      vi.resetModules();
    }
  });
});
