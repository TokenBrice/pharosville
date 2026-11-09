import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { assembleShader } from "../../engine/shader-recipes";
import { createWorldUniforms } from "../../engine/uniforms";
import { HarbourMaterials } from "../materials";
import { GLSL_PATTERNS } from "./patterns";
import { GLSL_AO } from "./lighting";
import { liteShadow } from "./shadow";

describe("B08 Lite world", () => {
  it("fades to exactly the old means before evaluating cobbles and fine noise, after derivatives", () => {
    const cobbles = GLSL_PATTERNS.slice(GLSL_PATTERNS.indexOf("// 4 cobbles"), GLSL_PATTERNS.indexOf("// 5 rock"));
    expect(cobbles).toMatch(/float fine = hbFine\(dP.x, 0.6\);\s+f = 0.86;\s+if \(fine > 0.0\) \{\s+vec2 v = hbVoronoi/);
    expect(GLSL_PATTERNS).toContain("if (fine > 0.0) f += (hbFbm(P * 2.6) - 0.5) * 0.18 * fine;");
    expect(GLSL_PATTERNS).toContain("if (fine > 0.0) f += (hbFbm(P * 1.4) - 0.5) * 0.16 * fine;");
    expect(GLSL_PATTERNS).toContain("#ifdef HB_LITE\n  float wn = hbNoise(W * 0.035);\n  #else\n  float wn = hbFbm(W * 0.035);");
    const firstBranch = GLSL_PATTERNS.indexOf("if (pid");
    expect(GLSL_PATTERNS.lastIndexOf("fwidth(")).toBeLessThan(firstBranch);
    for (const period of [0.3, 0.4, 0.6, 0.7, 1.5]) {
      const fine = (footprint: number) => 1 - THREE.MathUtils.smoothstep(footprint / period, 0.25, 0.6);
      expect(fine(0.6 * period)).toBe(0);
      expect(fine(10 * period)).toBe(0);
      expect(fine(0.25 * period)).toBe(1);
    }
  });

  it("uses four evenly spaced AO directions with both original radii and normalized weights", () => {
    expect(GLSL_AO).toContain("#ifdef HB_LITE\n  const int directions = 4;\n  #else\n  const int directions = 8;");
    expect(GLSL_AO).toContain("(6.2831856 / float(directions)) + 0.31");
    expect(GLSL_AO).toContain("? 2.0 : 5.5;");
    expect(GLSL_AO).toContain("occ / max(wsum, 1e-3)");
    for (const directions of [4, 8]) for (const normal of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)]) {
      for (const obstruction of [0, 0.3, 1]) {
        let occ = 0, sum = 0;
        for (let i = 0; i < directions; i++) {
          const a = i * 2 * Math.PI / directions + 0.31;
          const weight = THREE.MathUtils.clamp(Math.cos(a) * normal.x * 0.9 + normal.y, 0, 1);
          occ += weight * obstruction; sum += weight;
        }
        expect(1 - 0.8 * occ / Math.max(sum, 1e-3)).toBeCloseTo(1 - 0.8 * obstruction, 12);
      }
    }
  });
});

it("scopes one hardware-PCF receiver sample to prepared Lite kit/derived programs, leaving Three intact", () => {
  const original = THREE.ShaderChunk.shadowmap_pars_fragment, shadow = liteShadow();
  const pcf = shadow.slice(shadow.indexOf("float getShadow("), shadow.indexOf("#elif defined( SHADOWMAP_TYPE_VSM )"));
  expect(pcf.match(/texture\(/g)).toHaveLength(1);
  expect(pcf).toContain("shadowCoord.z += shadowBias;");
  expect(pcf).toContain("return mix( 1.0, shadow, shadowIntensity );");
  const materials = new HarbourMaterials(createWorldUniforms()), kit = materials.kit();
  const full = assembleShader(kit), version = kit.version;
  const restore = materials.preparationScope(true);
  const low = assembleShader(kit);
  expect(low.defines).toHaveProperty("HB_LITE");
  expect(low.fragmentShader).toContain(shadow);
  expect(low.fragmentShader).not.toContain("#include <shadowmap_pars_fragment>");
  expect(kit.version).toBe(version);
  restore();
  expect(assembleShader(kit)).toEqual(full);
  materials.setLite(true);
  expect(assembleShader(kit)).toEqual(low);
  expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe(original);
  materials.dispose();
});
