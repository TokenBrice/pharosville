import { describe, expect, it } from "vitest";
import { Color, MeshBasicMaterial, MeshStandardMaterial, ShaderChunk, ShaderLib, Vector3 } from "three";
import {
  chainGardenMaterialPatch, GARDEN_AIR, GARDEN_AERIAL_GLSL_PARS,
  gardenAerialTransmittance, updateGardenAerial,
} from "./garden-aerial";
import { dayCyclePhase } from "./garden-day-cycle";
import { gardenSkyToday } from "../systems/sky-almanac";
import { FRAGMENT_SHADER as WATER_FRAGMENT_SHADER } from "./garden-water";

const SEA = -1.45;
const NOON = gardenSkyToday().solarNoonHour;

function fit(clarity = 1) {
  updateGardenAerial({
    phase: dayCyclePhase(NOON),
    solarHorizon: new Color(0.8, 0.8, 0.8), antiHorizon: new Color(0.7, 0.7, 0.8),
    sunDir: new Vector3(0.3, 0.8, -0.5).normalize(),
    seaLevel: SEA, clarity, skyVisibleHeight: 0.23,
  });
  return { ...GARDEN_AIR, rayleigh: GARDEN_AIR.rayleigh.clone(), mie: GARDEN_AIR.mie.clone() };
}

describe("one analytic air", () => {
  it("keeps authored clear-noon near/mid distances legible, with recession in borrowed hills", () => {
    for (const height of [15.23, 180]) {
      const eye = { x: 0, y: height, z: 0 };
      const state = fit();
      expect(gardenAerialTransmittance(state, eye, { x: 140, y: SEA, z: 0 })).toBeGreaterThanOrEqual(0.9);
      expect(gardenAerialTransmittance(state, eye, { x: 300, y: SEA, z: 0 })).toBeGreaterThanOrEqual(0.8);
      const mid = gardenAerialTransmittance(state, eye, { x: 300, y: SEA, z: 0 });
      const hills = gardenAerialTransmittance(state, eye, { x: 2000, y: SEA, z: 0 });
      // Overview air is thinner at height: pin concentrated hill recession,
      // not an eye-independent far transmittance (the retired fitted law).
      expect(1 - hills).toBeGreaterThan(2 * (1 - mid));
    }
  });

  it("integrates height and distance smoothly without a near cutoff or object quantization", () => {
    const eye = { x: 0, y: 15.23, z: 0 };
    const state = fit();
    const foot = gardenAerialTransmittance(state, eye, { x: 230, y: 8, z: 0 });
    const crown = gardenAerialTransmittance(state, eye, { x: 230, y: 40, z: 0 });
    expect(crown).toBeGreaterThan(foot);
    let previous = 1;
    for (let distance = 1; distance < 1000; distance += 1) {
      const t = gardenAerialTransmittance(state, eye, { x: distance, y: SEA, z: 0 });
      expect(t).toBeLessThan(previous);
      expect(previous - t).toBeLessThan(0.01);
      previous = t;
    }
    expect(GARDEN_AERIAL_GLSL_PARS).not.toMatch(/floor\(s\)|float stepped|airInk|dawnBand/);
  });

  it("decreases visibility monotonically with worsening displayed accepted PSI", () => {
    const eye = { x: 0, y: 15.23, z: 0 };
    const point = { x: 260, y: SEA, z: 0 };
    let previous = 1;
    for (const clarity of [1, 0.75, 0.5, 0.25, 0, -0.25, -0.5, -0.75, -1]) {
      const t = gardenAerialTransmittance(fit(clarity), eye, point);
      expect(t).toBeLessThan(previous);
      previous = t;
    }
  });

  it("composites linear air exactly once before each built-in's single output transform", () => {
    for (const [name, shader] of Object.entries(ShaderLib)) {
      if (!("fogColor" in shader.uniforms)) {
        // Includes depth/distance passes: no atmosphere or output patch there.
        expect(shader.uniforms, name).not.toHaveProperty("uGardenAir");
        expect(shader.fragmentShader, name).not.toContain("gardenAerial");
        continue;
      }
      const source = shader.fragmentShader;
      for (const marker of ["fog_fragment", "tonemapping_fragment", "colorspace_fragment"]) {
        expect(source.split(`#include <${marker}>`).length - 1, `${name}: ${marker}`).toBe(1);
      }
      expect(source.indexOf("#include <fog_fragment>"), name).toBeLessThan(source.indexOf("#include <tonemapping_fragment>"));
      expect(source.indexOf("#include <tonemapping_fragment>"), name).toBeLessThan(source.indexOf("#include <colorspace_fragment>"));
    }
    // The relocation is conditional fog, not a pigment/emission/material patch.
    expect(ShaderChunk.fog_fragment).toContain("#ifdef USE_FOG");
    const identity = new MeshBasicMaterial({ color: "#3a5e5a", fog: false });
    const practical = new MeshStandardMaterial({ emissive: "#d49a3e", emissiveIntensity: 0.38, fog: false });
    expect(identity.color.getHexString()).toBe("3a5e5a");
    expect(identity.fog).toBe(false);
    expect(practical.emissive.getHexString()).toBe("d49a3e");
    expect(practical.emissiveIntensity).toBe(0.38);
    expect(practical.fog).toBe(false);
    identity.dispose();
    practical.dispose();
  });

  it("keeps the water and annulus aerial composite before the single output conversion", () => {
    const air = WATER_FRAGMENT_SHADER.indexOf("gl_FragColor.rgb = gardenAerial(");
    const annulus = WATER_FRAGMENT_SHADER.indexOf("if (uAnnulus > 0.5)", air);
    const tone = WATER_FRAGMENT_SHADER.indexOf("#include <tonemapping_fragment>");
    const output = WATER_FRAGMENT_SHADER.indexOf("#include <colorspace_fragment>");
    expect(air).toBeGreaterThan(0);
    expect(air).toBeLessThan(annulus);
    expect(annulus).toBeLessThan(tone);
    expect(tone).toBeLessThan(output);
    expect(WATER_FRAGMENT_SHADER.split("#include <tonemapping_fragment>").length - 1).toBe(1);
    expect(WATER_FRAGMENT_SHADER.split("#include <colorspace_fragment>").length - 1).toBe(1);
  });

  it("caps only the overview edge veil for explicitly flagged decorative terrain", () => {
    const block = GARDEN_AERIAL_GLSL_PARS.match(/#ifdef GARDEN_AIR_DECORATIVE_TERRAIN([\s\S]*?)#endif/)![1]!;
    expect(block).toContain("kasumi = min(kasumi, 0.08)");
    expect(block).not.toMatch(/\bT\b|rayleigh|mie|gardenAerialTransmittance/);
    expect(GARDEN_AERIAL_GLSL_PARS.indexOf(block)).toBeGreaterThan(GARDEN_AERIAL_GLSL_PARS.indexOf("if (uGardenAir.plateHaze > 0.0)"));
    expect(GARDEN_AERIAL_GLSL_PARS).toContain("color * T + air * (1.0 - T)");
  });

  it("excludes continuous water only from the rectangular overview veil", () => {
    const start = GARDEN_AERIAL_GLSL_PARS.indexOf("#ifndef GARDEN_AIR_CONTINUOUS_WATER");
    const end = GARDEN_AERIAL_GLSL_PARS.indexOf("\n  #endif", start);
    const block = GARDEN_AERIAL_GLSL_PARS.slice(start, end);
    expect(block).toContain("if (uGardenAir.plateHaze > 0.0)");
    expect(block).toContain("gardenAirPlateSigned(worldPos.xz)");
    expect(block).not.toMatch(/gardenAerialTransmittance|beaconAir|gardenIchimonji/);
    expect(start).toBeGreaterThan(GARDEN_AERIAL_GLSL_PARS.indexOf("color * T + air * (1.0 - T)"));
    expect(GARDEN_AERIAL_GLSL_PARS.indexOf("return result;", end)).toBeGreaterThan(end);
  });
});

describe("shared material-patch chain (K5)", () => {
  it("composes patches in order, once per key, and never marks a clone as already patched", () => {
    const material = new MeshStandardMaterial();
    const order: string[] = [];
    chainGardenMaterialPatch(material, { key: "a", compile: () => order.push("a") });
    chainGardenMaterialPatch(material, { key: "b", compile: () => order.push("b") });
    chainGardenMaterialPatch(material, { key: "a", compile: () => order.push("a-again") });
    material.onBeforeCompile({} as never, null as never);
    expect(order).toEqual(["a", "b"]);
    expect(material.customProgramCacheKey()).toMatch(/\|a\|b$/);

    const clone = material.clone();
    chainGardenMaterialPatch(clone, { key: "a", compile: () => order.push("clone-a") });
    clone.onBeforeCompile({} as never, null as never);
    expect(order).toContain("clone-a");
  });

  it("orders the surface and reserved indirect slots before ink and air, preserving lazy base keys", () => {
    const material = new MeshStandardMaterial();
    const order: string[] = [];
    let baseKey = "fleet-v1";
    material.customProgramCacheKey = () => baseKey;
    material.onBeforeCompile = () => order.push("existing-deformation");
    chainGardenMaterialPatch(material, { key: "air", stage: "aerial", compile: () => order.push("air") });
    chainGardenMaterialPatch(material, { key: "ink", stage: "printInk", compile: () => order.push("ink") });
    chainGardenMaterialPatch(material, { key: "surface:stone:worldXZ", slot: "surface", stage: "surface", compile: () => order.push("stone") });
    chainGardenMaterialPatch(material, { key: "indirect", stage: "indirect", compile: () => order.push("indirect") });
    chainGardenMaterialPatch(material, { key: "wind", compile: () => order.push("wind") });
    material.onBeforeCompile({} as never, null as never);
    expect(order).toEqual(["existing-deformation", "wind", "stone", "indirect", "ink", "air"]);
    expect(material.customProgramCacheKey()).toBe("fleet-v1|wind|surface:stone:worldXZ|indirect|ink|air");
    baseKey = "fleet-v2";
    expect(material.customProgramCacheKey()).toBe("fleet-v2|wind|surface:stone:worldXZ|indirect|ink|air");
    chainGardenMaterialPatch(material, { key: "surface:timber:uv", slot: "surface", stage: "surface", compile: () => order.push("timber") });
    order.length = 0;
    material.onBeforeCompile({} as never, null as never);
    expect(order).toEqual(["existing-deformation", "wind", "timber", "indirect", "ink", "air"]);
    expect(material.customProgramCacheKey()).toBe("fleet-v2|wind|surface:timber:uv|indirect|ink|air");
  });

  it("retains three's default deformation cache identity before installing the shared wrapper", () => {
    const first = new MeshStandardMaterial();
    const second = new MeshStandardMaterial();
    first.onBeforeCompile = (shader) => { shader.vertexShader += "\n// deformation-a"; };
    second.onBeforeCompile = (shader) => { shader.vertexShader += "\n// deformation-b"; };
    const firstBase = first.customProgramCacheKey();
    const secondBase = second.customProgramCacheKey();
    chainGardenMaterialPatch(first, { key: "surface", stage: "surface", compile: () => undefined });
    chainGardenMaterialPatch(second, { key: "surface", stage: "surface", compile: () => undefined });
    expect(first.customProgramCacheKey()).toBe(`${firstBase}|surface`);
    expect(second.customProgramCacheKey()).toBe(`${secondBase}|surface`);
    expect(first.customProgramCacheKey()).not.toBe(second.customProgramCacheKey());
  });
});
