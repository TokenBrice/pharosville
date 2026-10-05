import { describe, expect, it } from "vitest";
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Uint8BufferAttribute, Color, DataTexture, MeshBasicMaterial, MeshStandardMaterial, ShaderLib, Texture, type IUniform, type Material } from "three";
import { chainGardenMaterialPatch } from "./garden-aerial";
import { applyGardenPrintInks } from "./garden-print-inks";
import { GARDEN_SURFACE_GLSL as ATLAS_GLSL } from "./garden-surface-atlas";
import {
  applyGardenSurface,
  normalizeGardenSurfaceGeometry,
  GARDEN_SURFACE_RECIPES,
  GARDEN_SURFACE_ROLE_ATTRIBUTE,
  GARDEN_SURFACE_ROLE_CODES,
  GARDEN_SURFACE_WEIGHT_ATTRIBUTE,
  getGardenSurfaceExemption,
  type GardenSurfaceDetailSource,
  type GardenSurfaceExemption,
  type GardenSurfaceMapping,
  type GardenSurfaceOptions,
  type GardenSurfaceRole,
} from "./garden-surfaces";

const options: GardenSurfaceOptions = { role: "moss", mapping: "worldXZ", metresPerRepeat: 2, detailStrength: 0.35 };
function compile(material: Material) {
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {} as Record<string, IUniform>,
  };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

const roles = Object.keys(GARDEN_SURFACE_RECIPES) as GardenSurfaceRole[];
const exemptions: GardenSurfaceExemption[] = ["cloth", "mon", "nobori", "issuerTrim", "dataTrace", "practicalEmission", "foliage"];

describe("geometry-first garden surfaces", () => {
  it("fills metric merge defaults without replacing authored UVs, roles or weights", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([2, 3, 4, 5, 6, 7, 8, 9, 10], 3));
    geometry.setAttribute("normal", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3));
    normalizeGardenSurfaceGeometry(geometry, "timber");
    expect(Array.from(geometry.getAttribute("uv").array)).toEqual([4, 3, 5, 7, 8, 9]);
    expect(Array.from(geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE).array)).toEqual([4, 4, 4]);
    expect(Array.from(geometry.getAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE).array)).toEqual([1, 1, 1]);
    const authored = new BoxGeometry();
    const uv = authored.getAttribute("uv");
    const count = authored.getAttribute("position").count;
    authored.setAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE, new Uint8BufferAttribute(new Uint8Array(count).fill(6), 1));
    authored.setAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE, new Uint8BufferAttribute(new Uint8Array(count).fill(128), 1, true));
    normalizeGardenSurfaceGeometry(authored, "stone");
    expect(authored.getAttribute("uv")).toBe(uv);
    expect(authored.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE).getX(0)).toBe(6);
    expect(authored.getAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE).getX(0)).toBeCloseTo(128 / 255);
    const canonical = authored.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
    normalizeGardenSurfaceGeometry(authored, "plaster");
    expect(authored.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE)).toBe(canonical);
    geometry.dispose(); authored.dispose();
  });
  it("exports the canonical metre-based vertex vocabulary and dielectric ranges", () => {
    expect(GARDEN_SURFACE_ROLE_ATTRIBUTE).toBe("gardenSurfaceRole");
    expect(GARDEN_SURFACE_WEIGHT_ATTRIBUTE).toBe("gardenSurfaceWeight");
    expect(GARDEN_SURFACE_ROLE_CODES).toEqual({ moss: 0, stone: 1, gravel: 2, earth: 3, timber: 4, plaster: 5, roofTile: 6 });
    expect(roles.map((role) => GARDEN_SURFACE_RECIPES[role].roughnessRange)).toEqual([
      [0.9, 1], [0.8, 0.98], [0.9, 1], [0.9, 1], [0.72, 0.92], [0.8, 0.98], [0.65, 0.85],
    ]);
    for (const role of roles) {
      const material = new MeshStandardMaterial({ roughness: 0.1, metalness: 1, vertexColors: true });
      applyGardenSurface(material, { ...options, role });
      const recipe = GARDEN_SURFACE_RECIPES[role];
      expect(material.metalness).toBe(0);
      expect(material.roughness).toBeGreaterThanOrEqual(recipe.roughnessRange[0]);
      expect(material.roughness).toBeLessThanOrEqual(recipe.roughnessRange[1]);
      expect(material.userData.gardenSurface.role).toBe(role);
      expect(material.vertexColors).toBe(true);
      expect(material.map).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.roughnessMap).toBeNull();
      const shader = compile(material);
      expect(shader.fragmentShader).toContain("#include <color_fragment>");
      expect(shader.fragmentShader).toContain("GardenSurfaceDetail(vec3(1.0), 0.0, vec3(0.0))");
      expect(shader.fragmentShader).not.toMatch(/texture\w*\s*\(|uTime|sin\s*\(/);
    }
  });

  it("keeps shaders idempotent while static scalar updates reach existing uniforms", () => {
    const material = new MeshStandardMaterial();
    applyGardenSurface(material, options);
    const shader = compile(material);
    const callback = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    const version = material.version;
    applyGardenSurface(material, { ...options, metresPerRepeat: 3, detailStrength: 0.6 });
    expect(material.onBeforeCompile).toBe(callback);
    expect(material.customProgramCacheKey()).toBe(key);
    expect(material.version).toBe(version);
    expect(shader.uniforms.uGardenSurfaceRepeat.value).toBe(3);
    expect(shader.uniforms.uGardenSurfaceStrength.value).toBe(0.6);
    expect(shader.fragmentShader.match(/float gardenSurfaceRole =/g)).toHaveLength(1);
  });

  it("encodes recipe/mapping/attributes, not uniform values, and replaces changed recipes", () => {
    const keys = new Set<string>();
    for (const role of roles) {
      for (const mapping of ["worldXZ", "triplanar", "uv"] as GardenSurfaceMapping[]) {
        const material = new MeshStandardMaterial();
        applyGardenSurface(material, { ...options, role, mapping });
        keys.add(material.customProgramCacheKey());
        const shader = compile(material);
        expect(shader.fragmentShader).toContain(`#define GARDEN_SURFACE_${mapping === "worldXZ" ? "WORLD_XZ" : mapping === "uv" ? "UV" : "TRIPLANAR"}`);
        expect(shader.vertexShader.includes("vGardenSurfaceUv = uv;")).toBe(mapping === "uv");
      }
    }
    expect(keys.size).toBe(21);
    const material = new MeshStandardMaterial();
    applyGardenSurface(material, options);
    applyGardenSurface(material, { ...options, role: "timber", mapping: "uv", vertexWeights: true, vertexRoles: true });
    const shader = compile(material);
    expect(material.customProgramCacheKey().match(/\|garden-surface-v1:/g)).toHaveLength(1);
    expect(shader.fragmentShader.match(/float gardenSurfaceRole =/g)).toHaveLength(1);
    expect(shader.vertexShader).toContain(`attribute float ${GARDEN_SURFACE_ROLE_ATTRIBUTE};`);
    expect(shader.vertexShader).toContain(`attribute float ${GARDEN_SURFACE_WEIGHT_ATTRIBUTE};`);
    expect(shader.fragmentShader).toContain("clamp(vGardenSurfaceWeight, 0.0, 1.0)");
    expect(shader.fragmentShader).toContain("clamp(floor(vGardenSurfaceRole + 0.5), 0.0, 6.0)");
  });

  it("prepares clones independently without sharing their uniform state", () => {
    const material = new MeshStandardMaterial();
    applyGardenSurface(material, options);
    const originalShader = compile(material);
    const clone = material.clone();
    expect(clone.userData.gardenSurface).toEqual(material.userData.gardenSurface);
    applyGardenSurface(clone, { ...options, detailStrength: 0.7 });
    const cloneShader = compile(clone);
    expect(cloneShader.fragmentShader.match(/float gardenSurfaceRole =/g)).toHaveLength(1);
    expect(cloneShader.uniforms.uGardenSurfaceStrength).not.toBe(originalShader.uniforms.uGardenSurfaceStrength);
    expect(originalShader.uniforms.uGardenSurfaceStrength.value).toBe(0.35);
    expect(cloneShader.uniforms.uGardenSurfaceStrength.value).toBe(0.7);
    expect(clone.customProgramCacheKey()).toBe(material.customProgramCacheKey());
  });

  it("preserves deformation, batched/instanced transforms, hull trim and later indirect ink", () => {
    const material = new MeshStandardMaterial();
    applyGardenPrintInks(material);
    chainGardenMaterialPatch(material, { key: "indirect-test", stage: "indirect", compile: (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n// indirect-test");
    } });
    chainGardenMaterialPatch(material, { key: "hull-deformation", compile: (shader) => {
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", "transformed.y += 0.1;\n#include <project_vertex>");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vHullFinish;");
    } });
    applyGardenSurface(material, { ...options, role: "timber", mapping: "uv" });
    const shader = compile(material);
    expect(shader.vertexShader.indexOf("transformed.y += 0.1;")).toBeLessThan(shader.vertexShader.indexOf("gardenSurfacePosition = vec4(transformed"));
    expect(shader.vertexShader).toContain("batchingMatrix * gardenSurfacePosition");
    expect(shader.vertexShader).toContain("instanceMatrix * gardenSurfacePosition");
    expect(shader.vertexShader).toContain("inverseTransformDirection(transformedNormal, viewMatrix)");
    expect(shader.fragmentShader).toContain("gardenSurfaceWeight *= 1.0 - clamp(vHullFinish.y, 0.0, 1.0)");
    expect(shader.fragmentShader).toContain("0.50 * (1.0 - vHullFinish.y)");
    expect(shader.fragmentShader).toContain("gardenIrradianceNormal) * (1.0 - clamp(vHullFinish.y, 0.0, 1.0))");
    expect(material.customProgramCacheKey()).toMatch(/\|hull-deformation\|garden-surface-v1:.*\|garden-irradiance-v1\|indirect-test\|garden-print-inks-v1$/);
    expect(shader.fragmentShader.indexOf("gardenIrradianceNormal =")).toBeLessThan(shader.fragmentShader.indexOf("#include <lights_fragment_end>"));
    expect(shader.fragmentShader.indexOf("#include <lights_fragment_end>")).toBeLessThan(shader.fragmentShader.indexOf("float gardenAiLuma"));
  });

  it("offers an owned sampling seam without loading, disposing or copying its resources", () => {
    const amount = { value: 0.01 };
    const source: GardenSurfaceDetailSource = {
      key: "authored-test-v1", uniforms: { uAuthoredAmount: amount },
      glsl: "uniform float uAuthoredAmount;\nGardenSurfaceDetail gardenSampleSurface(vec3 p, vec3 n, vec2 uv, float role, float repeat) { return GardenSurfaceDetail(vec3(1.0), uAuthoredAmount, vec3(0.0)); }",
    };
    const material = new MeshStandardMaterial();
    applyGardenSurface(material, { ...options, detailSource: source });
    expect(compile(material).uniforms.uAuthoredAmount).toBe(amount);
    expect(material.customProgramCacheKey()).toContain("authored-test-v1");
    const replacement = { value: 0.02 };
    applyGardenSurface(material, { ...options, detailSource: { ...source, uniforms: { uAuthoredAmount: replacement } } });
    expect(compile(material).uniforms.uAuthoredAmount).toBe(replacement);
  });

  it("composes every atlas mapping and shares sampler uniforms while keeping scalar state local", () => {
    const ready = { value: 1 };
    const maps = [new DataTexture(new Uint8Array([221, 221, 221, 255]), 1, 1),
      new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1),
      new DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1)];
    const source: GardenSurfaceDetailSource = {
      key: "garden-atlas-png-v2", glsl: ATLAS_GLSL, uniforms: { uGardenSurfaceAtlasReady: ready,
        uGardenSurfaceAlbedo: { value: maps[0] }, uGardenSurfaceNormal: { value: maps[1] }, uGardenSurfaceOrm: { value: maps[2] } },
    };
    for (const mapping of ["worldXZ", "triplanar", "uv"] as GardenSurfaceMapping[]) {
      const material = new MeshStandardMaterial();
      applyGardenPrintInks(material);
      applyGardenSurface(material, { ...options, mapping, detailSource: source });
      const shader = compile(material);
      expect(shader.uniforms.uGardenSurfaceAtlasReady).toBe(ready);
      expect(shader.fragmentShader).toContain("#ifndef GARDEN_SURFACE_DETAIL_DEFINED");
      expect(shader.fragmentShader).toContain("textureLod(uGardenSurfaceAlbedo");
      for (const match of shader.fragmentShader.matchAll(/\buniform\s+[iu]?sampler\w+\s+(uGardenSurface\w+)\s*;/g)) {
        expect(shader.uniforms[match[1]]?.value).toBeInstanceOf(Texture);
        expect(shader.uniforms[match[1]]).toBe(source.uniforms[match[1]]);
      }
      expect(shader.fragmentShader).toContain("gardenSurfaceDetail.normalOffset");
      expect(material.map).toBeNull();
      const clone = material.clone();
      // Material.clone copies metadata, not shader patches: reinstall both recipes.
      applyGardenPrintInks(clone);
      applyGardenSurface(clone, { ...options, mapping, detailSource: source });
      const cloneShader = compile(clone);
      expect(cloneShader.uniforms.uGardenSurfaceAtlasReady).toBe(ready);
      expect(cloneShader.uniforms.uGardenSurfaceStrength).not.toBe(shader.uniforms.uGardenSurfaceStrength);
      expect(clone.customProgramCacheKey()).toBe(material.customProgramCacheKey());
    }
    for (const texture of maps) texture.dispose();
  });

  it("leaves identities, practicals, foliage and unsupported materials untouched", () => {
    for (const exemption of exemptions) {
      const material = new MeshStandardMaterial({ color: new Color(0.2, 0.3, 0.4), roughness: 0.4, metalness: 0.2 });
      material.userData.gardenSurfaceExemption = exemption;
      const callback = material.onBeforeCompile;
      const color = material.color.clone();
      applyGardenSurface(material, options);
      expect(getGardenSurfaceExemption(material.clone())).toBe(exemption);
      expect(material.onBeforeCompile).toBe(callback);
      expect(material.color).toEqual(color);
      expect(material.roughness).toBe(0.4);
      expect(material.metalness).toBe(0.2);
      expect(material.userData.gardenSurface).toBeUndefined();
    }
    const unlit = new MeshBasicMaterial();
    const callback = unlit.onBeforeCompile;
    applyGardenSurface(unlit, options);
    expect(unlit.onBeforeCompile).toBe(callback);
    const backlit = new MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 0.08 });
    applyGardenSurface(backlit, options);
    expect(backlit.userData.gardenSurface).toBeUndefined();
    const stone = new MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 0.015 });
    applyGardenSurface(stone, { ...options, role: "stone" });
    expect(stone.userData.gardenSurface.role).toBe("stone");
  });
});
