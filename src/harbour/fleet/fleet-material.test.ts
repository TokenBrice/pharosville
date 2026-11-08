import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorldUniforms, type WorldUniforms } from "../engine/uniforms";
import { HarbourMaterials } from "../world/materials";
import type { EmblemAtlas } from "./emblems";
import { createFleetMaterials, type FleetUniforms } from "./fleet-material";
import { FleetSystem } from "./fleet-system";
import { HouseFlags } from "./house-flags";

interface FleetHarness { uniforms: FleetUniforms }

// No renderer/GL context: exercise the injected shader and shared-uniform contracts only.
describe("fleet material atlas/season ownership", () => {
  it("uses the original combined-atlas gradients for sails and covers and inherits the seasonal shader key", () => {
    let season = "leaf";
    const materials = new HarbourMaterials(createWorldUniforms());
    const kit = materials.kit();
    kit.customProgramCacheKey = () => `kit_${season}`;
    // Test-only access to the same private uniform seam used by the upload harness.
    const system = new FleetSystem() as unknown as FleetHarness;
    const fleet = system.uniforms;
    const world = {} as WorldUniforms;
    const { material, depth } = createFleetMaterials({ kit: () => kit, kitKey: () => "", track: () => undefined } as unknown as HarbourMaterials, world, fleet);
    const key = material.customProgramCacheKey(), depthKey = depth.customProgramCacheKey();
    // Three's callback type also carries renderer internals unused by this source-only hook.
    const shader = { ...THREE.ShaderLib.standard, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms).toMatchObject({
      uEmblems: fleet.uEmblems, uEmblemGrid: fleet.uEmblemGrid,
    });
    expect(shader.fragmentShader).not.toContain("uEmblemLogos");
    expect(shader.fragmentShader).toContain("textureGrad(uEmblems, uv, gx, gy)");
    // Preserve operation order as well as the intended UV formula: subpixel detail is scenery.
    expect(shader.fragmentShader).toContain("vec2(ex.x * sx * uEmblemGrid.z, -ex.y * uEmblemGrid.w)");
    expect(shader.fragmentShader).toContain("vec2(ex.x * sx * 0.97 * uEmblemGrid.z, -ex.y * 0.97 * uEmblemGrid.w)");
    expect(shader.fragmentShader).toContain("vec2((cell.x + inset.x) * uEmblemGrid.z, 1.0 - (cell.y + inset.y) * uEmblemGrid.w)");
    expect(shader.vertexShader).toContain("float phase = hbPaintTexel(idx, 2).w");
    const depthShader = { ...THREE.ShaderLib.depth, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    depth.onBeforeCompile(depthShader, {} as THREE.WebGLRenderer);
    expect(depthShader.uniforms.uFleetPaint).toBe(fleet.uFleetPaint);
    expect(depthShader.vertexShader).toContain("float phase = hbFleetPhase(idx)");
    expect(depthShader.vertexShader).toContain("phase * 1.7");
    expect(depthShader.vertexShader).not.toContain("float(idx) * 1.7");
    season = "bare";
    expect(material.customProgramCacheKey()).not.toBe(key);
    expect(material.customProgramCacheKey()).toContain("kit_bare");
    expect(depth.customProgramCacheKey()).toBe(depthKey); // classic fleet depth has no seasonal kit hook
    material.dispose(); depth.dispose(); materials.dispose();
    for (const uniform of [fleet.uFleetData, fleet.uFleetPaint, fleet.uEmblems, fleet.uBoards]) uniform.value.dispose();
  });
});

// E04 index fix (O5-F1): the emblem slot reaches the fragment shader as an interpolated varying (320 ± ε)
describe("fleet emblem slots on atlas column 0", () => {
  const glslMod = (x: number, y: number) => x - y * Math.floor(x / y);
  const cellOf = (slot: number, cols = 32) => [glslMod(slot, cols), Math.floor(slot / cols)];
  const round = (v: number) => Math.floor(v + 0.5);   // hbFleetSlot(), and the house flags' slot
  const ulp320 = 320 * 2 ** -23;                      // one float32 step at 320, as interpolation leaves it

  it("rounds the slot before mod/floor so a column-0 mark never flips to the edge of the row above", () => {
    for (const slot of [0, 31, 32, 33, 319, 320, 321, 608, 640, 736]) {
      for (const eps of [0, ulp320, -ulp320, 1e-3, -1e-3, 0.25, -0.25]) {
        expect(cellOf(round(slot + eps))).toEqual([slot % 32, Math.floor(slot / 32)]);
      }
    }
    // the defect: unrounded, USDe's 320 - ε read column 31.99996 of row 9 (the clamped right edge of the row above)
    const [cx, cy] = cellOf(320 - ulp320);
    expect(cx).toBeGreaterThan(31.99);
    expect(cy).toBe(9);
  });

  it("keeps the negative sentinels: no emblem, a v1 hulk, the wreck nameboards", () => {
    for (const eps of [0, 1e-5, -1e-5, 0.25, -0.25]) {
      expect(round(-1 + eps)).toBe(-1);                                              // no emblem (slot >= 0 fails)
      expect(round(-2 + eps)).toBe(-2);                                              // a v1 hulk
      for (const n of [0, 1, 31, 32, 33]) expect(-round(-10 - n + eps) - 10).toBe(n); // nameboard n
    }
    // the defect for nameboard 0: unrounded, -10 + ε gave board -ε and the board dropped out on those pixels
    expect(-(-10 + 1e-5) - 10).toBeLessThan(0);
  });

  it("rounds before every mod/floor in the fleet and the house-flag shaders", () => {
    const materials = new HarbourMaterials(createWorldUniforms());
    const kit = materials.kit();
    const fleet = (new FleetSystem() as unknown as FleetHarness).uniforms;
    const { material, depth } = createFleetMaterials({ kit: () => kit, kitKey: () => "", track: () => undefined } as unknown as HarbourMaterials, {} as WorldUniforms, fleet);
    const shader = { ...THREE.ShaderLib.standard, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const frag = shader.fragmentShader;
    expect(frag).toContain("float hbFleetSlot() { return floor(vFleetBrand.a + 0.5); }");
    expect(frag).toContain("float board = -hbFleetSlot() - 10.0;");
    expect(frag.match(/float slot = hbFleetSlot\(\);/g)).toHaveLength(2);   // the furled cover / bundle and the sail
    expect(frag.match(/vec2 cell = vec2\(mod\(slot, uEmblemGrid\.x\), floor\(slot \/ uEmblemGrid\.x\)\);/g)).toHaveLength(2);
    expect(frag).not.toMatch(/mod\(vFleetBrand\.a|floor\(vFleetBrand\.a \//);
    const atlas = { texture: new THREE.Texture(), grid: new THREE.Vector4(32, 25, 1 / 32, 1 / 25) } as unknown as EmblemAtlas;
    const flags = new HouseFlags({ uTime: { value: 0 } } as unknown as WorldUniforms, atlas, 4);
    const flagFrag = (flags.mesh.material as THREE.ShaderMaterial).fragmentShader;
    expect(flagFrag).toContain("float slot = floor(vSlot + 0.5);");
    expect(flagFrag).toContain("vec2 cell = vec2(mod(slot, uEmblemGrid.x), floor(slot / uEmblemGrid.x));");
    expect(flagFrag).not.toMatch(/mod\(vSlot|floor\(vSlot \//);
    material.dispose(); depth.dispose(); materials.dispose(); flags.mesh.geometry.dispose(); (flags.mesh.material as THREE.Material).dispose();
    for (const uniform of [fleet.uFleetData, fleet.uFleetPaint, fleet.uEmblems, fleet.uBoards]) uniform.value.dispose();
  });
});
