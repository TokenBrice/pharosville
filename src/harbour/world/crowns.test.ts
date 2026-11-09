import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createWorldUniforms } from "../engine/uniforms";
import { assembleShader } from "../engine/shader-recipes";
import { LOW_SUN_GLSL, SAIL_LIGHT_GLSL } from "../fleet/sail-light-glsl";
import { HarbourMaterials } from "./materials";
import { CROWN_CALL_GLSL, CROWN_GLOW_CAP, CROWN_GLSL, crownGlowOf } from "./shaders/crowns";
import { styleCDirection } from "../engine/time-of-day";

const PINE = new THREE.Vector3(0.03, 0.07, 0.035);
const DAWN = new THREE.Vector3(1, 0.45, 0.28).multiplyScalar(2.1);
/** a backlit crown face seen against a sun at `el` degrees: the camera looks toward the sun, the face turns away */
const backlit = (el: number, extra: Partial<Parameters<typeof crownGlowOf>[0]> = {}) => {
  const sunDir = styleCDirection(90, el);
  const away = sunDir.clone().negate();
  const V = new THREE.Vector3(-sunDir.x, 0.45, -sunDir.z).normalize();   // toward a camera standing down-sun, above
  return crownGlowOf({ leaf: PINE, N: away, V, sunDir, sunColor: DAWN, ...extra });
};
const luma = (c: THREE.Vector3) => c.x * 0.2126 + c.y * 0.7152 + c.z * 0.0722;

describe("E21 backlit crowns (reference)", () => {
  it("glows warm only in the sails' 4°–22° low-sun window, never below the horizon or at night", () => {
    for (const el of [6, 12, 18]) expect(luma(backlit(el))).toBeGreaterThan(5e-4);
    const glow = backlit(10);
    expect(glow.x / glow.y).toBeGreaterThan(PINE.x / PINE.y);   // the low sun's hue warms the needles
    for (const el of [-3, 25, 40, 60]) expect(luma(backlit(el))).toBe(0);
    expect(luma(backlit(10, { night: 0.85 }))).toBe(0);
    expect(luma(backlit(10, { night: 0.45 }))).toBe(luma(backlit(10)));   // dawn and dusk keep it whole
  });

  it("bare and snowed leaves and crowns shadowed toward the sun stay dark", () => {
    expect(luma(backlit(10, { bare: 1 }))).toBe(0);
    expect(luma(backlit(10, { snow: 1 }))).toBe(0);
    expect(luma(backlit(10, { lit: 0 }))).toBe(0);
    expect(luma(backlit(10, { bare: 0.5, snow: 0.5 }))).toBeCloseTo(luma(backlit(10)) * 0.25, 6);
  });

  it("is capped under the bloom threshold, and a sun-facing face takes none", () => {
    const bright = backlit(10, { leaf: new THREE.Vector3(0.9, 0.9, 0.9), sunColor: new THREE.Vector3(40, 30, 20) });
    expect(luma(bright)).toBeLessThanOrEqual(CROWN_GLOW_CAP + 1e-6);
    expect(luma(bright)).toBeGreaterThan(CROWN_GLOW_CAP - 1e-3);
    const sunDir = styleCDirection(90, 10);
    expect(luma(crownGlowOf({ leaf: PINE, N: sunDir, V: sunDir.clone().negate(), sunDir, sunColor: DAWN }))).toBe(0);
  });

  it("shares the sails' window edges, and the uniform test brackets that window", () => {
    expect(SAIL_LIGHT_GLSL).toContain("(1.0 - smoothstep(0.07, 0.375, uSunDir.y)) * smoothstep(-0.02, 0.03, uSunDir.y)");
    expect(LOW_SUN_GLSL).toContain("(1.0 - smoothstep(0.07, 0.375, y)) * smoothstep(-0.02, 0.03, y)");
    expect(CROWN_CALL_GLSL.trim().startsWith("if (uHbSunDir.y > -0.02 && uHbSunDir.y < 0.375 && hbLeafPid(hbPid) > 0.5)")).toBe(true);
    // one sun-facing PCF tap, two metres toward the sun
    expect(CROWN_GLSL.match(/texture\(/g)).toHaveLength(1);
    expect(CROWN_GLSL).toContain("vec4(uHbSunDir * 2.0, 0.0)");
  });
});

describe("E21 backlit crowns (kit program)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it("Medium/High kit programs carry it once, after three's shadow declarations; the Low program never does", () => {
    const mats = new HarbourMaterials(createWorldUniforms());
    const full = assembleShader(mats.kit()).fragmentShader;
    expect(full.split("hbCrownGlow(diffuseColor.rgb").length - 1).toBe(1);
    expect(full.indexOf("vec3 hbCrownGlow(")).toBeGreaterThan(full.indexOf("#include <shadowmap_pars_fragment>"));
    expect(full.indexOf("hbCrownGlow(diffuseColor.rgb")).toBeLessThan(full.indexOf("outgoingLight += hbLmHoverRim("));
    mats.setLite(true);
    const low = assembleShader(mats.kit()).fragmentShader;
    expect(low).not.toContain("hbCrown");
    expect(low).not.toContain("hbLowSun");
  });

  it("`?extras=-crowns` leaves it out of every tier at boot", async () => {
    vi.stubGlobal("location", { search: "?extras=-crowns", hash: "" });
    vi.resetModules();
    const { HarbourMaterials: Fresh } = await import("./materials");
    const { assembleShader: assemble } = await import("../engine/shader-recipes");
    const { createWorldUniforms: uniforms } = await import("../engine/uniforms");
    const off = assemble(new Fresh(uniforms()).kit()).fragmentShader;
    expect(off).not.toContain("hbCrown");
    expect(off).toContain("outgoingLight += hbLmHoverRim(");
  });
});
