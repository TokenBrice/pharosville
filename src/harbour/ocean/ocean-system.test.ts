import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { preparationMaterial } from "../engine/prepare";
import { TIERS, type QualitySettings } from "../engine/quality";
import { OceanSystem } from "./ocean-system";
import { SEA_STATES, waveHeight } from "./waves";
import { FullscreenPass } from "./gpu-bake";

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
    // hulls bob with the water the vertex shader moves: none on land, the full swell past the fade
    expect(ocean.heightAt(0, 100)).toBe(0);
    expect(ocean.heightAt(0, 600)).toBeCloseTo(waveHeight(0, 600, 0, SEA_STATES[1].amp), 12);
    system.dispose(ctx);
  });
});
