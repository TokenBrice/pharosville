import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CREST_AIR, CREST_GLOW_REACH, CrestFlags } from "./crest-flags";
import { CREST_GLOW, CREST_NIGHT_DIM, crestFarScale, FLAG_SCALE, FLAG_TOPMAST } from "./identity-system";

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

// E03b flags at the town's scale (O6-I1, O1-I8, O2-I5; ruling V6)
describe("crest flags at the town's scale, lit as cloth", () => {
  it("flies every flag on a 6 m topmast, a site's own when it flies higher (Ethereum 7 m), the scale on the cloth only", () => {
    const texture = new THREE.Texture();
    const crests = new CrestFlags(texture);
    expect(crests.topmast).toBe(6);
    crests.add({ ...site, scale: FLAG_SCALE.ethereum, topmast: FLAG_TOPMAST.ethereum });
    crests.add({ x: 40, y: site.y, z: site.z, rect: site.rect, phase: site.phase });   // no scale, no topmast of its own
    const flags = crests.group.getObjectByName("identity-crest-flags"), masts = crests.group.getObjectByName("identity-crest-topmasts");
    if (!(flags instanceof THREE.InstancedMesh) || !(masts instanceof THREE.InstancedMesh)) throw new Error("missing crest meshes");
    crests.update(0, false, [0.84, -0.54], 0.35, new THREE.Color(1, 1, 1), 0, new THREE.Vector3(100, 200, 300));
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    masts.getMatrixAt(0, m); m.decompose(p, q, s);
    expect(s.y).toBeCloseTo(7.4, 6);
    masts.getMatrixAt(1, m); m.decompose(p, q, s);
    expect(s.y).toBeCloseTo(6.4, 6);
    flags.getMatrixAt(0, m); m.decompose(p, q, s);
    expect(p.y).toBeCloseTo(site.y + 7, 6);                      // the hoist at the truck, not topmast x scale
    const eth = s.x;
    flags.getMatrixAt(1, m); m.decompose(p, q, s);
    expect(p.y).toBeCloseTo(site.y + 6, 6);
    expect(eth / s.x).toBeCloseTo(1.2, 6);
    crests.dispose(); texture.dispose();
  });

  it("keeps Ethereum's flag first but at the town's scale, growing at most 25 % from 650 m", () => {
    expect(FLAG_SCALE.ethereum).toBe(1.2);
    expect(FLAG_TOPMAST.ethereum).toBe(7);
    expect(crestFarScale(420)).toBe(1);
    expect(crestFarScale(650)).toBe(1);
    expect(crestFarScale(1000)).toBe(1.25);
    expect(crestFarScale(1150)).toBe(1.25);
    for (let d = 600; d < 1100; d += 25) expect(crestFarScale(d + 25)).toBeGreaterThanOrEqual(crestFarScale(d));
  });

  it("lights the cloth by its truck lamp at the hoist head only, takes half the air, and dims with the facades", () => {
    const texture = new THREE.Texture();
    const air = { uFogDensity: { value: 0.0008 }, uHaze: { value: new THREE.Color(0.5, 0.6, 0.7) }, uHorizon: { value: new THREE.Color(0.8, 0.85, 0.9) } };
    const crests = new CrestFlags(texture, air);
    const flags = crests.group.getObjectByName("identity-crest-flags");
    if (!(flags instanceof THREE.InstancedMesh) || !(flags.material instanceof THREE.ShaderMaterial)) throw new Error("missing crest mesh");
    const mat = flags.material;
    expect(mat.uniforms.uAerialDensity).toBe(air.uFogDensity);
    expect(mat.uniforms.uAerialHaze).toBe(air.uHaze);
    expect(mat.uniforms.uHorizon).toBe(air.uHorizon);
    expect(mat.fragmentShader).toContain(`uGlow * (1.0 - smoothstep(0.0, ${CREST_GLOW_REACH.toFixed(2)}, vHoist))`);
    expect(mat.fragmentShader).toContain(`hbAerial(c, vec3(0.0), ${(1 - CREST_AIR).toFixed(2)});`);
    expect(CREST_AIR).toBe(0.5);
    // twice O6's night dimming and its 0.035 truck lamp (was a 0.7 dim and a 0.16 glow over the whole cloth)
    expect(CREST_NIGHT_DIM).toBeGreaterThan(0.82);
    expect(CREST_GLOW).toBe(0.035);
    crests.dispose(); texture.dispose();
  });
});
