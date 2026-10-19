import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CrestFlags } from "./crest-flags";

const site = { x: 3, y: 12, z: -7, rect: [0, 0, 1, 1] as [number, number, number, number], phase: 0.8, scale: 1.65 };

describe("crest flag placement cache", () => {
  it("keeps flutter and lighting live without uploading unchanged placements, and holds reduced-motion time", () => {
    const texture = new THREE.Texture();
    const crests = new CrestFlags(texture);
    crests.add(site);
    const flags = crests.group.getObjectByName("identity-crest-flags");
    if (!(flags instanceof THREE.InstancedMesh) || !(flags.material instanceof THREE.ShaderMaterial)) throw new Error("missing crest mesh");
    const cam = new THREE.Vector3(100, 200, 300), light = new THREE.Color(1, 1, 1);
    crests.update(0.1, true, [0.84, -0.54], 0.35, light, 0.1, cam);
    const version = flags.instanceMatrix.version;
    const matrices = flags.instanceMatrix.array.slice();
    crests.update(0.1, true, [0.84, -0.54], 0.35, light, 0.1, cam);
    expect(flags.instanceMatrix.version).toBe(version);
    expect(flags.instanceMatrix.array).toEqual(matrices);
    expect(flags.material.uniforms.uFlagT.value).toBe(0.2);
    light.setRGB(0.3, 0.4, 0.5);
    crests.update(1, false, [0.84, -0.54], 0.35, light, 0.2, cam);
    expect(flags.instanceMatrix.version).toBe(version);
    expect(flags.material.uniforms.uFlagT.value).toBe(0.2);
    expect(flags.material.uniforms.uLight.value).toEqual(light);
    expect(flags.material.uniforms.uGlow.value).toBe(0.2);
    crests.dispose(); texture.dispose();
  });

  it("invalidates placements for camera, wind, scale and newly installed sites even with motion reduced", () => {
    const texture = new THREE.Texture();
    const crests = new CrestFlags(texture);
    crests.add(site);
    const flags = crests.group.getObjectByName("identity-crest-flags");
    if (!(flags instanceof THREE.InstancedMesh)) throw new Error("missing crest mesh");
    const cam = new THREE.Vector3(100, 200, 300), light = new THREE.Color(1, 1, 1);
    crests.update(0, false, [0.84, -0.54], 0.35, light, 0, cam);
    const version = flags.instanceMatrix.version;
    cam.x += 20;
    crests.update(0, false, [0.84, -0.54], 0.35, light, 0, cam);
    expect(flags.instanceMatrix.version).toBe(version + 1);
    crests.update(0, false, [-0.54, 0.84], 0.35, light, 0, cam);
    expect(flags.instanceMatrix.version).toBe(version + 2);
    crests.update(0, false, [-0.54, 0.84], 0.65, light, 0, cam);
    expect(flags.instanceMatrix.version).toBe(version + 3);
    crests.farScale = 1.4;
    crests.update(0, false, [-0.54, 0.84], 0.65, light, 0, cam);
    expect(flags.instanceMatrix.version).toBe(version + 4);
    crests.add({ ...site, x: 20 });
    crests.update(0, false, [-0.54, 0.84], 0.65, light, 0, cam);
    expect(flags.instanceMatrix.version).toBe(version + 5);
    expect(flags.count).toBe(2);
    crests.dispose(); texture.dispose();
  });
});
