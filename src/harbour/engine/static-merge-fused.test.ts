import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { deferPatternDecode, mergeStaticMeshes } from "./static-merge";
import { dequantizeForPatterns } from "../world/materials";
import { mergeStatic, worldGeometry } from "../civic/assemble";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function parts() {
  const root = new THREE.Group();
  root.position.set(12.3, -2.1, 99.7); root.rotation.y = 0.713;
  const mat = new THREE.MeshStandardMaterial(); mat.name = "hb_kit";
  const meshes = [0, 1].map((i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Int16Array([-32768, 234, 911, 3112, 1821, 0, 711, 32767, -812]), 3, true));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Int8Array([-128, 41, 12, 18, 110, -32, 17, 51, 102]), 3, true));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Uint8Array([41, 62, 11, 128, 11, 51, 29, 16, 77, 29, 13, 64]), 4, true));
    geometry.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(1.31 + i, 2.71, 7.99); mesh.rotation.y = 0.31; mesh.scale.set(15.7, 9.3, 21.2);
    root.add(mesh);
    return mesh;
  });
  return { root, meshes };
}
function equal(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  expect(Object.keys(a.attributes)).toEqual(Object.keys(b.attributes));
  for (const name of Object.keys(a.attributes)) {
    expect(a.attributes[name].normalized).toBe(b.attributes[name].normalized);
    expect(a.attributes[name].array).toEqual(b.attributes[name].array);
  }
  expect(Array.from(a.index!.array)).toEqual(Array.from(b.index!.array));
  a.computeBoundingBox(); a.computeBoundingSphere(); b.computeBoundingBox(); b.computeBoundingSphere();
  expect(a.boundingBox).toEqual(b.boundingBox); expect(a.boundingSphere).toEqual(b.boundingSphere);
}

describe("fused static decoding", () => {
  it("matches island dequantize then merge, including intermediate float rounding", () => {
    const reference = parts(), fused = parts();
    reference.meshes.forEach(dequantizeForPatterns);
    fused.meshes.forEach(deferPatternDecode);
    const [a] = mergeStaticMeshes(reference.meshes, reference.root, "reference");
    const [b] = mergeStaticMeshes(fused.meshes, fused.root, "fused");
    equal(a.geometry, b.geometry);
  });
  it("matches eager tangent direction baking, including handedness and the deferred local transform", () => {
    const reference = parts(), fused = parts();
    for (const fixture of [reference, fused]) for (const mesh of fixture.meshes) {
      mesh.geometry.setAttribute("tangent", new THREE.BufferAttribute(new Float32Array([1, 0, 0, -1, 0, 1, 0, 1, 0, 0, 1, -1]), 4));
    }
    reference.meshes.forEach(dequantizeForPatterns);
    fused.meshes.forEach(deferPatternDecode);
    const [a] = mergeStaticMeshes(reference.meshes, reference.root, "reference");
    const [b] = mergeStaticMeshes(fused.meshes, fused.root, "fused");
    equal(a.geometry, b.geometry);
  });
  it("matches civic dequantize, world copies, and merge with a rotated parent", () => {
    const reference = parts(), fused = parts();
    reference.meshes.forEach(dequantizeForPatterns);
    fused.meshes.forEach(deferPatternDecode);
    reference.root.updateMatrixWorld(true);
    const expected = mergeGeometries(reference.meshes.map((mesh) => worldGeometry(mesh)))!;
    const [actual] = mergeStatic([fused.root]);
    equal(expected, actual.geometry);
  });
  it("materializes a deferred source when a civic caller excludes it from merging", () => {
    const reference = parts(), fused = parts();
    reference.meshes.forEach(dequantizeForPatterns);
    fused.meshes.forEach(deferPatternDecode);
    const output = mergeStatic([fused.root], (mesh) => mesh !== fused.meshes[0]);
    expect(output).toHaveLength(1);
    for (const name of ["position", "normal", "color"]) {
      expect(fused.meshes[0].geometry.attributes[name].array).toEqual(reference.meshes[0].geometry.attributes[name].array);
    }
    expect(fused.meshes[0].matrix).toEqual(reference.meshes[0].matrix);
  });
});
