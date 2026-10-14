import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Post-load static merge, opt-in: a system hands over meshes that will never move, change material or hide
 * again, and gets back one mesh per (material, attribute layout, shadow flags) in world space. One draw per
 * material instead of one per mesh, in the main pass AND in the shadow pass.
 *
 * Meshes that cannot merge safely are left alone: instanced / skinned / morphing meshes, material arrays,
 * hidden meshes, and anything with its own onBeforeRender hook. A group of one is left alone too.
 * The merged meshes are added to `into` (its world transform is honoured); the sources are removed from
 * the scene. Source geometries are disposed unless `keepSources` (they may be shared).
 */
export function mergeStaticMeshes(meshes: readonly THREE.Mesh[], into: THREE.Object3D, name: string, keepSources = false): THREE.Mesh[] {
  const groups = new Map<string, THREE.Mesh[]>();
  const matIds = new Map<THREE.Material, number>();
  for (const m of meshes) {
    if (!canMerge(m)) continue;
    const mat = m.material as THREE.Material;
    if (!matIds.has(mat)) matIds.set(mat, matIds.size);
    const g = m.geometry;
    const layout = Object.keys(g.attributes).sort().map((k) => `${k}:${g.attributes[k].itemSize}${g.attributes[k].normalized ? "n" : ""}`).join(",");
    const key = `${matIds.get(mat)}|${layout}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${m.layers.mask}`;
    let gr = groups.get(key);
    if (!gr) groups.set(key, gr = []);
    gr.push(m);
  }
  into.updateWorldMatrix(true, false);
  const toLocal = into.matrixWorld.clone().invert();
  const out: THREE.Mesh[] = [];
  for (const gr of groups.values()) {
    if (gr.length < 2) continue;
    const geos = gr.map((m) => worldCopy(m, toLocal));
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const first = gr[0];
    const merged = new THREE.Mesh(geo, first.material);
    merged.name = `${name}-merged-${(first.material as THREE.Material).name || "mat"}`;
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.renderOrder = first.renderOrder;
    merged.layers.mask = first.layers.mask;
    merged.matrixAutoUpdate = false;
    into.add(merged);
    merged.updateMatrixWorld(true);
    for (const m of gr) {
      m.removeFromParent();
      if (!keepSources) m.geometry.dispose();
    }
    out.push(merged);
  }
  return out;
}

function canMerge(m: THREE.Mesh): boolean {
  if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (Array.isArray(m.material) || !m.material || m.geometry.morphAttributes.position) return false;
  if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  for (let o: THREE.Object3D | null = m; o; o = o.parent) if (!o.visible) return false;
  return m.geometry.attributes.position !== undefined;
}

/** De-interleaved, indexed copy of a mesh's geometry carried into `into`'s frame. */
function worldCopy(m: THREE.Mesh, toLocal: THREE.Matrix4): THREE.BufferGeometry {
  m.updateWorldMatrix(true, false);
  const src = m.geometry, g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(src.attributes)) {
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize, a.normalized));
  }
  const n = src.attributes.position.count;
  if (src.index) g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(src.index.array) : new Uint16Array(src.index.array), 1));
  else g.setIndex(new THREE.BufferAttribute(n > 65535 ? Uint32Array.from({ length: n }, (_, i) => i) : Uint16Array.from({ length: n }, (_, i) => i), 1));
  const mat = new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld);
  g.applyMatrix4(mat);
  // a mirrored source was drawn flip-sided: bake the flip into the winding
  if (mat.determinant() < 0) { const ix = g.index!.array; for (let t = 0; t + 2 < ix.length; t += 3) { const a = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = a; } }
  return g;
}
