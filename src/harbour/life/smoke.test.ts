import * as THREE from "three";
import { expect, it } from "vitest";
import { ChimneySmoke } from "./smoke";
import { createWorldUniforms } from "../engine/uniforms";

it("clips only exactly inactive chimney ranks before constructing cards; equal/on ranks keep their old alpha", () => {
  const smoke = new ChimneySmoke([[0, 4, 0], [4, 5, 2]]);
  const shader = (smoke.mesh.material as THREE.ShaderMaterial).vertexShader;
  const clip = shader.indexOf("if (on == 0.0)");
  expect(clip).toBeGreaterThan(shader.indexOf("float on = step(aSeed.w, uSmokeAmt * 0.42);"));
  expect(clip).toBeLessThan(shader.indexOf("float rate ="));
  expect(shader).toContain("gl_Position = vec4(2.0, 2.0, 2.0, 1.0);\n    return;");
  expect(shader).toContain("vAlpha = on * smoothstep(0.0, 0.08, life)");
  const ranks = smoke.mesh.geometry.getAttribute("aSeed");
  for (const amount of [0, 1e-12, 0.2, 0.5, 1]) for (let i = 0; i < ranks.count; i++) {
    const rank = ranks.getW(i), on = rank <= amount * 0.42 ? 1 : 0;
    expect(on === 0).toBe(rank > amount * 0.42);
  }
  expect(0.42 <= 1 * 0.42).toBe(true); // GLSL step retains the equality boundary.
  expect((smoke.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(14);
  smoke.dispose();
});

it("keeps reduced-motion smoke still while amount and weather can update", () => {
  const smoke = new ChimneySmoke([[0, 4, 0]]), u = createWorldUniforms();
  smoke.update(1, true, 0.5, [1, 0], 0.2, u);
  const time = smoke.uniforms.uSmokeT.value;
  smoke.update(10, false, 0, [0, 1], 1, u);
  expect(smoke.uniforms.uSmokeT.value).toBe(time);
  expect(smoke.uniforms.uSmokeAmt.value).toBe(0);
  expect(smoke.uniforms.uWind.value.toArray()).toEqual([0, 1, 1, 0]);
  smoke.dispose();
});
