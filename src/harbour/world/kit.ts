import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * A kit GLB flattened to one geometry per material (in the GLB root's space), ready to instance.
 * Attributes are normalised to position / normal / color(vec4 float) so every kit piece merges and
 * instances with the harbour material port.
 */
export interface KitPiece {
  name: string;
  parts: Array<{ material: string; source: THREE.Material; geometry: THREE.BufferGeometry }>;
  bounds: THREE.Box3;
}

export function flattenKit(name: string, gltf: GLTF): KitPiece {
  const byMat = new Map<string, THREE.BufferGeometry[]>();
  const srcMat = new Map<string, THREE.Material>();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const src = mesh.geometry;
    const groups = Array.isArray(mesh.material) && src.groups.length ? src.groups : [{ start: 0, count: src.index ? src.index.count : src.attributes.position.count, materialIndex: 0 }];
    for (const g of groups) {
      const mat = mats[g.materialIndex ?? 0];
      const geo = normalise(src, g.start, g.count);
      geo.applyMatrix4(mesh.matrixWorld);
      srcMat.set(mat.name, mat);
      const list = byMat.get(mat.name) ?? [];
      list.push(geo);
      byMat.set(mat.name, list);
    }
  });
  const parts: KitPiece["parts"] = [];
  const bounds = new THREE.Box3();
  for (const [material, geos] of byMat) {
    const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    bounds.union(geometry.boundingBox!);
    parts.push({ material, source: srcMat.get(material)!, geometry });
  }
  return { name, parts, bounds };
}

/** Copies a (sub)range into a fresh indexed geometry with position/normal/color(vec4 float). */
function normalise(src: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const pos = src.attributes.position;
  const nrm = src.attributes.normal;
  const col = src.attributes.color as THREE.BufferAttribute | undefined;
  const index = src.index;
  const n = pos.count;
  const out = new THREE.BufferGeometry();
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i);
    if (nrm) { N[i * 3] = nrm.getX(i); N[i * 3 + 1] = nrm.getY(i); N[i * 3 + 2] = nrm.getZ(i); }
    if (col) {
      C[i * 4] = col.getX(i); C[i * 4 + 1] = col.getY(i); C[i * 4 + 2] = col.getZ(i);
      C[i * 4 + 3] = col.itemSize > 3 ? col.getW(i) : 0;
    } else { C[i * 4] = C[i * 4 + 1] = C[i * 4 + 2] = 1; C[i * 4 + 3] = 0; }
  }
  out.setAttribute("position", new THREE.BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(N, 3));
  out.setAttribute("color", new THREE.BufferAttribute(C, 4));
  const idx: number[] = [];
  if (index) for (let i = start; i < start + count; i++) idx.push(index.getX(i));
  else for (let i = start; i < start + count; i++) idx.push(i);
  out.setIndex(idx);
  if (!nrm) out.computeVertexNormals();
  return out;
}
