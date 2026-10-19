import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { WorldUniforms } from "../engine/uniforms";
import type { HarbourMaterials } from "../world/materials";
import { createFleetMaterials, type FleetUniforms } from "./fleet-material";
import { FleetSystem } from "./fleet-system";

interface FleetHarness { uniforms: FleetUniforms }

// No renderer/GL context: exercise the injected shader and shared-uniform contracts only.
describe("fleet material atlas/season ownership", () => {
  it("uses the original combined-atlas gradients for sails and covers and inherits the seasonal shader key", () => {
    let season = "leaf";
    const kit = new THREE.MeshStandardMaterial();
    kit.customProgramCacheKey = () => `kit_${season}`;
    // Test-only access to the same private uniform seam used by the upload harness.
    const system = new FleetSystem() as unknown as FleetHarness;
    const fleet = system.uniforms;
    const world = {} as WorldUniforms;
    const { material, depth } = createFleetMaterials({ kit: () => kit } as HarbourMaterials, world, fleet);
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
    expect(depthShader.vertexShader).toContain("hbFleetPhase(idx) * 1.7");
    expect(depthShader.vertexShader).not.toContain("float(idx) * 1.7");
    season = "bare";
    expect(material.customProgramCacheKey()).not.toBe(key);
    expect(material.customProgramCacheKey()).toContain("kit_bare");
    expect(depth.customProgramCacheKey()).toBe(depthKey); // classic fleet depth has no seasonal kit hook
    material.dispose(); depth.dispose(); kit.dispose();
    for (const uniform of [fleet.uFleetData, fleet.uFleetPaint, fleet.uEmblems, fleet.uBoards]) uniform.value.dispose();
  });
});
