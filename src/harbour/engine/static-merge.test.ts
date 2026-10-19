import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { mergeStaticMeshes } from "./static-merge";
import { dequantizeForPatterns } from "../world/materials";

const box = (mat: THREE.Material, x: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.position.x = x; return m; };

describe("mergeStaticMeshes", () => {
  it("merges one mesh per material in world space and removes the sources", () => {
    const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    const parts = [box(a, 0), box(a, 10), box(b, 20), box(b, 30), box(new THREE.MeshBasicMaterial(), 40)];
    root.add(...parts);
    const out = mergeStaticMeshes(parts, root, "t");
    expect(out).toHaveLength(2);
    expect(root.children).toHaveLength(3);   // two merged + the lone mesh left alone
    const ga = out.find((m) => m.material === a)!.geometry;
    ga.computeBoundingBox();
    expect(ga.boundingBox!.min.x).toBeCloseTo(-0.5);
    expect(ga.boundingBox!.max.x).toBeCloseTo(10.5);
  });

  it("bakes a mirrored transform into the winding", () => {
    const mat = new THREE.MeshBasicMaterial(), root = new THREE.Group();
    const p = box(mat, 0), q = box(mat, 5);
    q.scale.x = -1;
    root.add(p, q);
    const plain = Array.from(p.geometry.index!.array.slice(0, 3));
    const [m] = mergeStaticMeshes([p, q], root, "t", true);
    const n = p.geometry.attributes.position.count;
    const ix = m.geometry.index!.array;
    const k = p.geometry.index!.count;
    expect(Array.from(ix.slice(0, 3))).toEqual(plain);
    expect(Array.from(ix.slice(k, k + 3))).toEqual([plain[0] + n, plain[2] + n, plain[1] + n]);
  });

  it("skips hidden, instanced and hooked meshes", () => {
    const mat = new THREE.MeshBasicMaterial(), root = new THREE.Group();
    const hidden = box(mat, 0); hidden.visible = false;
    const hooked = box(mat, 1); hooked.onBeforeRender = () => {};
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), mat, 2);
    root.add(hidden, hooked, inst, box(mat, 2));
    expect(mergeStaticMeshes(root.children as THREE.Mesh[], root, "t")).toHaveLength(0);
  });
});

/** A glTF-style quantized geometry: interleaved int16 positions (stride 4), int8 normals (stride 4), byte colours. */
function quantized(n: number, seed: number): THREE.BufferGeometry {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const P = new Int16Array(n * 4), N = new Int8Array(n * 4), C = new Uint8Array(n * 4);
  for (let i = 0; i < n * 4; i++) { P[i] = Math.round((rnd() * 2 - 1) * 32767); N[i] = Math.round((rnd() * 2 - 1) * 127); C[i] = Math.round(rnd() * 255); }
  N[0] = -128; // the clamped end of the signed range
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(P, 4), 3, 0, true));
  g.setAttribute("normal", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(N, 4), 3, 0, true));
  g.setAttribute("color", new THREE.BufferAttribute(C, 4, true));
  g.setIndex(Array.from({ length: n - 2 }, (_, i) => [i, i + 1, i + 2]).flat());
  return g;
}

/** The previous per-component path: float copies through getComponent, then BufferGeometry.applyMatrix4. */
function reference(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) {
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
    out.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  return out.applyMatrix4(m);
}

describe("dequantizeForPatterns", () => {
  it.each([
    ["scale + translation", new THREE.Matrix4().compose(new THREE.Vector3(85.2, 7.5, -323.9), new THREE.Quaternion(), new THREE.Vector3(212.16, 212.16, 212.16))],
    ["rotation", new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion(0, 0.788, 0, 0.615).normalize(), new THREE.Vector3(3, 3, 3))],
  ])("bakes the node (%s) bit for bit as the per-component path did; colours stay bytes", (_, m) => {
    const g = quantized(500, 7);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    m.decompose(mesh.position, mesh.quaternion, mesh.scale);
    const ref = reference(g, (mesh.updateMatrix(), mesh.matrix));
    dequantizeForPatterns(mesh);
    const d = mesh.geometry;
    expect(mesh.matrix.equals(new THREE.Matrix4())).toBe(true);
    for (const k of ["position", "normal"]) {
      expect(d.attributes[k].array).toBeInstanceOf(Float32Array);
      expect(d.attributes[k].normalized).toBe(false);
      expect(Array.from(d.attributes[k].array)).toEqual(Array.from(ref.attributes[k].array));
    }
    expect(d.attributes.color.array).toBeInstanceOf(Uint8Array);
    expect(d.attributes.color.normalized).toBe(true);
    expect(d.attributes.color.array).toBe(g.attributes.color.array);
    ref.computeBoundingBox(); ref.computeBoundingSphere();
    expect(d.boundingBox!.equals(ref.boundingBox!)).toBe(true);
    expect(d.boundingSphere!.equals(ref.boundingSphere!)).toBe(true);
  });
});

describe("mergeStaticMeshes attribute types", () => {
  it("keeps byte colours, float positions and normals, the baked values untouched, and the bounds", () => {
    const mat = new THREE.MeshBasicMaterial(), root = new THREE.Group();
    const parts = [quantized(300, 1), quantized(200, 2)].map((g, i) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(i * 10, 1, 2); mesh.scale.setScalar(50);
      dequantizeForPatterns(mesh);
      root.add(mesh);
      return mesh;
    });
    const srcs = parts.map((p) => p.geometry);
    const [m] = mergeStaticMeshes(parts, root, "t", true);
    const g = m.geometry;
    expect(g.attributes.position.array).toBeInstanceOf(Float32Array);
    expect(g.attributes.normal.array).toBeInstanceOf(Float32Array);
    expect(g.attributes.color.array).toBeInstanceOf(Uint8Array);
    expect(g.attributes.color.normalized).toBe(true);
    for (const k of ["position", "normal", "color"]) {
      expect(Array.from(g.attributes[k].array)).toEqual([...srcs[0].attributes[k].array, ...srcs[1].attributes[k].array]);
    }
    expect(Array.from(g.index!.array.slice(srcs[0].index!.count, srcs[0].index!.count + 3))).toEqual([300, 301, 302]);
    const box = g.boundingBox!.clone(), sphere = g.boundingSphere!.clone();
    g.computeBoundingBox(); g.computeBoundingSphere();
    expect(box.equals(g.boundingBox!)).toBe(true);
    expect(sphere.equals(g.boundingSphere!)).toBe(true);
  });

  it("widens a group whose sources disagree on the array type, decoding the bytes", () => {
    const mat = new THREE.MeshBasicMaterial(), root = new THREE.Group();
    const a = box(mat, 0), b = box(mat, 5);
    const n = a.geometry.attributes.position.count;
    a.geometry.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(n * 4).fill(51), 4, true));
    b.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 4).fill(0.5), 4));
    root.add(a, b);
    const [m] = mergeStaticMeshes([a, b], root, "t");
    const c = m.geometry.attributes.color;
    expect(c.array).toBeInstanceOf(Float32Array);
    expect(c.getX(0)).toBeCloseTo(0.2, 6);
    expect(c.getX(n)).toBe(0.5);
  });

  it.each([false, true])("transforms window centres and tangents consistently with mixed storage = %s", (mixed) => {
    const mat = new THREE.MeshBasicMaterial(), root = new THREE.Group();
    root.position.set(11, 3, -7); root.rotation.y = 0.29;
    const parts = [0, 1].map((i) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
      geometry.setAttribute("hbWinC", new THREE.BufferAttribute(mixed && i ? new Int8Array([-127, 0, 127, 0, 127, 0, 127, 0, -127]) : new Float32Array([-1, 0, 1, 0, 1, 0, 1, 0, -1]), 3, mixed && !!i));
      geometry.setAttribute("tangent", new THREE.BufferAttribute(mixed && i ? new Int8Array([127, 0, 0, -127, 0, 127, 0, 127, 0, 0, 127, -127]) : new Float32Array([1, 0, 0, -1, 0, 1, 0, 1, 0, 0, 1, -1]), 4, mixed && !!i));
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(i + 2, 4, -3); mesh.rotation.set(0.4, 0.7, -0.2); mesh.scale.set(2, 3, 0.5);
      root.add(mesh);
      return mesh;
    });
    root.updateMatrixWorld(true);
    const toLocal = root.matrixWorld.clone().invert();
    const expected = parts.map((mesh) => {
      const transform = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
      const geometry = reference(mesh.geometry, transform);
      geometry.attributes.hbWinC.applyMatrix4(transform);
      return geometry;
    });
    const [merged] = mergeStaticMeshes(parts, root, "t");
    for (const name of ["hbWinC", "tangent"]) {
      expect(merged.geometry.attributes[name].normalized).toBe(false);
      expect(merged.geometry.attributes[name].array).toEqual(new Float32Array(expected.flatMap((g) => Array.from(g.attributes[name].array))));
    }
  });
});
