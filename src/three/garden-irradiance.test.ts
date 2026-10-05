import { describe, expect, it } from "vitest";
import { AmbientLight, BoxGeometry, Color, HemisphereLight, Matrix4, Mesh, MeshStandardMaterial, Quaternion, ShaderLib, Vector3, type IUniform, type Material } from "three";
import { GARDEN_IRRADIANCE_BASE, GARDEN_IRRADIANCE_SHARE, GARDEN_IRRADIANCE_ZONES, applyGardenIrradiance, gardenIrradianceUniforms, updateGardenIrradiance, writeGardenIrradiance, writeGardenIrradianceCoefficients, type GardenIrradianceZone, type GardenL1Irradiance } from "./garden-irradiance";
import { applyGardenSurface } from "./garden-surfaces";
import { applyGardenPrintInks, applyGardenPrintInksToTree } from "./garden-print-inks";
import { gardenTowerWorldAnchors } from "../systems/garden-observatory-slice";

const tile = { x: 60, y: 70 };
const up = new Vector3(0, 1, 0);
function coefficients(): GardenL1Irradiance {
  return { c0: new Vector3(), cx: new Vector3(), cy: new Vector3(), cz: new Vector3() };
}
function compile(material: Material) {
  const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, IUniform> };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}
function lightRig(scale = 1) {
  const ambient = new AmbientLight(0xffffff, 0.15 * scale);
  ambient.color.setRGB(0.8, 0.9, 1);
  const hemi = new HemisphereLight(0xffffff, 0xffffff, 0.68 * scale);
  hemi.color.setRGB(0.85, 0.93, 1);
  hemi.groundColor.setRGB(0.22, 0.28, 0.18);
  updateGardenIrradiance(ambient, hemi, tile);
  return { ambient, hemi };
}
function rgbClose(a: Color, b: Color, precision = 10) {
  expect(a.r).toBeCloseTo(b.r, precision);
  expect(a.g).toBeCloseTo(b.g, precision);
  expect(a.b).toBeCloseTo(b.b, precision);
}

describe("bounded sheltered-surface irradiance", () => {
  it("meters actual fill, follows the authoritative court anchor and does not mutate lights", () => {
    const { ambient, hemi } = lightRig();
    const far = new Vector3(1e6, 1e6, 1e6);
    const expected = ambient.color.clone().multiplyScalar(ambient.intensity * GARDEN_IRRADIANCE_SHARE)
      .add(hemi.color.clone().multiplyScalar(hemi.intensity * GARDEN_IRRADIANCE_SHARE));
    rgbClose(writeGardenIrradiance(new Color(), far, up), expected);
    expect(ambient.intensity).toBe(0.15);
    expect(hemi.intensity).toBe(0.68);
    const anchors = gardenTowerWorldAnchors(tile);
    expect(GARDEN_IRRADIANCE_ZONES[1].center.toArray()).toEqual([anchors.foot.x, anchors.foot.y, anchors.foot.z]);
    const changedTile = { x: 73, y: 59 };
    updateGardenIrradiance(ambient, hemi, changedTile);
    const moved = gardenTowerWorldAnchors(changedTile);
    expect(GARDEN_IRRADIANCE_ZONES[1].center.toArray()).toEqual([moved.foot.x, moved.foot.y, moved.foot.z]);
  });

  it("preserves nonnegative bounded energy and at least three quarters of the original fill", () => {
    const { ambient, hemi } = lightRig();
    for (const zone of GARDEN_IRRADIANCE_ZONES) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
        const normal = new Vector3(Math.sin(angle), Math.cos(angle), 0);
        const originalShare = writeGardenIrradiance(new Color(), zone.center, normal, [], GARDEN_IRRADIANCE_BASE);
        const local = writeGardenIrradiance(new Color(), zone.center, normal);
        const full = originalShare.clone().multiplyScalar(1 / GARDEN_IRRADIANCE_SHARE - 1).add(local);
        for (const channel of ["r", "g", "b"] as const) {
          const maximum = ambient.color[channel] * ambient.intensity + Math.max(hemi.color[channel], hemi.groundColor[channel]) * hemi.intensity;
          expect(full[channel]).toBeGreaterThanOrEqual(originalShare[channel] * 3 - 1e-12);
          expect(full[channel]).toBeLessThanOrEqual(maximum + 1e-12);
          expect(local[channel]).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("is continuous at authored zone extents and overlaps, with no hard boundary", () => {
    lightRig();
    for (const zone of GARDEN_IRRADIANCE_ZONES) {
      for (const offset of [0, 0.5, 1, 2]) {
        const point = zone.center.clone().addScaledVector(zone.extent, offset);
        const a = writeGardenIrradiance(new Color(), point, up);
        const b = writeGardenIrradiance(new Color(), point.clone().add(new Vector3(0.001, 0.001, 0.001)), up);
        expect(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)).toBeLessThan(0.0001);
      }
    }
  });

  it("rotates world positions, normals and directional L1 coefficients together", () => {
    const a = new Vector3(0.04, 0.06, 0.07);
    const s = new Vector3(0.2, 0.23, 0.3);
    const g = new Vector3(0.07, 0.09, 0.06);
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.17);
    const base = coefficients();
    const rotatedBase = coefficients();
    writeGardenIrradianceCoefficients(base, a, s, g, up);
    writeGardenIrradianceCoefficients(rotatedBase, a, s, g, up.clone().applyQuaternion(rotation));
    const fields: GardenIrradianceZone[] = [];
    const rotatedFields: GardenIrradianceZone[] = [];
    for (let i = 0; i < 3; i++) {
      const center = new Vector3(i * 4, i, -i * 2);
      const axis = new Vector3(0.3, 1, -0.2);
      const field = { ...coefficients(), center, extent: new Vector3(12, 12, 12), axis, visibility: 0.8, reflectance: g };
      const rotated = { ...coefficients(), center: center.clone().applyQuaternion(rotation), extent: field.extent, axis: axis.clone().applyQuaternion(rotation), visibility: 0.8, reflectance: g };
      writeGardenIrradianceCoefficients(field, a, s, g, axis);
      writeGardenIrradianceCoefficients(rotated, a, s, g, rotated.axis);
      fields.push(field); rotatedFields.push(rotated);
    }
    const point = new Vector3(4, 3, 6);
    const normal = new Vector3(0.4, 0.8, -0.1).normalize();
    rgbClose(writeGardenIrradiance(new Color(), point, normal, fields, base),
      writeGardenIrradiance(new Color(), point.clone().applyQuaternion(rotation), normal.clone().applyQuaternion(rotation), rotatedFields, rotatedBase));
  });

  it("scales with final fill overrides while sharing stable coefficient/uniform storage", () => {
    const zones = gardenIrradianceUniforms.uGardenIrradianceZones.value;
    const base = gardenIrradianceUniforms.uGardenIrradianceBase.value;
    const c0 = base.c0;
    lightRig();
    const original = writeGardenIrradiance(new Color(), zones[0].center, up);
    for (const scale of [0, 0.15, 0.5, 1.5, 2]) {
      lightRig(scale);
      rgbClose(writeGardenIrradiance(new Color(), zones[0].center, up), original.clone().multiplyScalar(scale));
      expect(gardenIrradianceUniforms.uGardenIrradianceZones.value).toBe(zones);
      expect(gardenIrradianceUniforms.uGardenIrradianceBase.value).toBe(base);
      expect(base.c0).toBe(c0);
    }
  });

  it("guards zero normals, zero axes and zero extents without NaN", () => {
    const base = coefficients();
    writeGardenIrradianceCoefficients(base, new Vector3(), new Vector3(0.2, 0.3, 0.4), new Vector3(), new Vector3());
    const field: GardenIrradianceZone = { ...base, center: new Vector3(), extent: new Vector3(), axis: new Vector3(), visibility: 0, reflectance: new Vector3() };
    const value = writeGardenIrradiance(new Color(), new Vector3(), new Vector3(), [field], base);
    expect(value.toArray().every(Number.isFinite)).toBe(true);
    expect(value.toArray().every((component) => component >= 0)).toBe(true);
  });
});

describe("indirect material stage", () => {
  it("adopts non-atlas timber once and evaluates final deformed/batched/instanced world position", () => {
    const material = new MeshStandardMaterial();
    applyGardenIrradiance(material);
    const callback = material.onBeforeCompile;
    const version = material.version;
    applyGardenIrradiance(material);
    expect(material.onBeforeCompile).toBe(callback);
    expect(material.version).toBe(version);
    const shader = compile(material);
    expect(shader.vertexShader).toContain("vec4 gardenIrradiancePosition = vec4(transformed, 1.0)");
    expect(shader.vertexShader).toContain("batchingMatrix * gardenIrradiancePosition");
    expect(shader.vertexShader).toContain("instanceMatrix * gardenIrradiancePosition");
    expect(shader.vertexShader).toContain("modelMatrix * gardenIrradiancePosition");
    expect(shader.fragmentShader).toContain("transpose(mat3(viewMatrix)) * normal");
    lightRig();
    const model = new Matrix4().makeTranslation(5, 0, -3);
    const center = GARDEN_IRRADIANCE_ZONES[0].center;
    const nearInstance = new Matrix4().makeTranslation(center.x - 5, center.y, center.z + 3);
    const farInstance = new Matrix4().makeTranslation(10000, 0, 10000);
    const nearPosition = new Vector3().applyMatrix4(nearInstance).applyMatrix4(model);
    const farPosition = new Vector3().applyMatrix4(farInstance).applyMatrix4(model);
    const near = writeGardenIrradiance(new Color(), nearPosition, up);
    const far = writeGardenIrradiance(new Color(), farPosition, up);
    expect(Math.abs(near.r - far.r) + Math.abs(near.g - far.g) + Math.abs(near.b - far.b)).toBeGreaterThan(0.001);
    material.dispose();
  });

  it("reuses prepared surface position and corrects diffuse before ink, leaving PMREM/SH/specular/AO alone", () => {
    const material = new MeshStandardMaterial();
    applyGardenPrintInks(material);
    applyGardenSurface(material, { role: "stone", mapping: "triplanar", metresPerRepeat: 2, detailStrength: 0.4 });
    const shader = compile(material);
    expect(shader.vertexShader).not.toContain("varying vec3 vGardenIrradiancePosition;");
    expect(shader.fragmentShader).toContain("gardenIrradianceDelta(vGardenSurfacePosition, gardenIrradianceNormal)");
    expect(shader.fragmentShader.indexOf("gardenSurfaceDetail.normalOffset")).toBeLessThan(shader.fragmentShader.indexOf("gardenIrradianceNormal ="));
    expect(shader.fragmentShader.indexOf("gardenIrradianceNormal =")).toBeLessThan(shader.fragmentShader.indexOf("#include <lights_fragment_end>"));
    expect(shader.fragmentShader.indexOf("#include <lights_fragment_end>")).toBeLessThan(shader.fragmentShader.indexOf("float gardenAiLuma"));
    expect(shader.fragmentShader).toContain("#include <lights_fragment_maps>");
    expect(shader.fragmentShader).toContain("#include <aomap_fragment>");
    const start = shader.fragmentShader.indexOf("vec3 gardenIrradianceNormal =");
    const correction = shader.fragmentShader.slice(start, shader.fragmentShader.indexOf("#include <lights_fragment_end>", start));
    expect(correction).not.toMatch(/\bradiance\s*=|reflectedLight\.|ambientOcclusion|lightProbe/);
    expect(shader.uniforms.uGardenIrradianceZones).toBe(gardenIrradianceUniforms.uGardenIrradianceZones);
    expect(material.customProgramCacheKey().match(/\|garden-irradiance-v1/g)).toHaveLength(1);
    material.dispose();
  });

  it("retains tree identity/practical exclusions and foliage's distinct lighting model", () => {
    for (const name of ["issuer-canvas", "fleet-pennants", "garden-cue-marker", "station-lamp"]) {
      const material = new MeshStandardMaterial();
      const object = new Mesh(new BoxGeometry(), material);
      object.name = name;
      applyGardenPrintInksToTree(object);
      expect(material.customProgramCacheKey()).not.toContain("garden-irradiance");
      object.geometry.dispose(); material.dispose();
    }
    for (const exemption of ["cloth", "mon", "nobori", "issuerTrim", "dataTrace", "practicalEmission", "foliage"]) {
      const source = new MeshStandardMaterial();
      source.userData.gardenSurfaceExemption = exemption;
      const material = source.clone();
      const callback = material.onBeforeCompile;
      applyGardenIrradiance(material);
      expect(material.onBeforeCompile).toBe(callback);
      source.dispose(); material.dispose();
    }
  });
});
