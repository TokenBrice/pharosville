import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorldUniforms } from "../engine/uniforms";
import { RidingLights } from "./riding-lights";

describe("D11 the hulls' peg-reading lamps (riding lights)", () => {
  it("marks a stern / anchor lamp analytical (lamp and streak), keeps the default decorative, and gates the wave on it", () => {
    const rl = new RidingLights(createWorldUniforms(), 8);
    rl.begin();
    rl.add(0, 3, 0, 1, 1, 1, 0.42, 0, 0.6); // a masthead light: navigation decoration, with its streak
    rl.add(1, 2, 0, 1, 1, 1, 0.26, 0, 0.8, true); // a stern lamp with a peg reading, with its streak
    rl.add(2, 2, 0, 1, 1, 1, 0.17, 0, 0, true); // an anchor lamp, no streak
    rl.end(1, 0.3);
    const info = rl.object.geometry.getAttribute("aInfo") as THREE.BufferAttribute;
    expect(info.itemSize).toBe(4);
    expect(rl.count).toBe(5);
    expect([0, 1, 2, 3, 4].map((i) => [info.getY(i), info.getW(i)])).toEqual([[0, 0], [1, 0], [0, 1], [1, 1], [0, 1]]);
    expect([0, 1, 2, 3, 4].map((i) => info.getX(i))).toEqual([0.42, 0.42, 0.26, 0.26, 0.17].map(Math.fround));
    expect(info.updateRanges).toEqual([{ start: 0, count: 5 * 4 }]);
    const vertex = (rl.object.material as THREE.ShaderMaterial).vertexShader;
    expect(vertex).toContain("attribute vec4 aInfo;");
    // the only read of the lamp round and the arrival beat (hbLampGlow) is skipped for an analytical lamp
    expect(vertex.split("\n").filter((line) => line.includes("hbLampGlow(") && !line.trimStart().startsWith("float hbLampGlow"))).toEqual([
      "  if (wg > 1e-3 && aInfo.w < 0.5) vColor *= smoothstep(0.18, 0.5, hbLampGlow(uWindowGlow, hbLampRank(position, vSeed))) / wg;",
    ]);
    rl.dispose();
  });
});
