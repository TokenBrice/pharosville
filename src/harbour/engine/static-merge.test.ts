import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { mergeStaticMeshes } from "./static-merge";

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
