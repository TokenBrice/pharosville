import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { preparationMaterial } from "../engine/prepare";
import { TIERS, type QualitySettings } from "../engine/quality";
import { OceanSystem } from "./ocean-system";

vi.mock("./textures", () => ({ acquireFxTextures: async () => ({ noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }) }));
vi.mock("./sdf-image", () => ({ loadSdfImage: async () => ({ width: 1, height: 1, data: new Uint8Array(4), coast: new Uint8Array(1) }) }));
afterEach(() => vi.unstubAllGlobals());

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
});
