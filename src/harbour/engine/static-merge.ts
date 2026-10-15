import * as THREE from "three";

/**
 * Post-load static merge, opt-in: a system hands over meshes that will never move, change material or hide
 * again, and gets back one mesh per (material, attribute layout, shadow flags) in world space. One draw per
 * material instead of one per mesh, in the main pass AND in the shadow pass.
 *
 * Meshes that cannot merge safely are left alone: instanced / skinned / morphing meshes, material arrays,
 * hidden meshes, and anything with its own onBeforeRender hook. A group of one is left alone too.
 * The merged meshes are added to `into` (its world transform is honoured); the sources are removed from
 * the scene. Source geometries are disposed unless `keepSources` (they may be shared).
 * Attributes keep their source array type (normalized bytes stay bytes) when every source shares it and the
 * transform does not touch them; positions and normals come out float32, through the transform only when it is
 * not the identity (a transform already baked into the vertices is not applied twice).
 */
export function mergeStaticMeshes(meshes: readonly THREE.Mesh[], into: THREE.Object3D, name: string, keepSources = false): THREE.Mesh[] {
  const groups = new Map<string, THREE.Mesh[]>();
  const matIds = new Map<THREE.Material, number>();
  for (const m of meshes) {
    if (!canMerge(m)) continue;
    const mat = m.material as THREE.Material;
    if (!matIds.has(mat)) matIds.set(mat, matIds.size);
    const g = m.geometry;
    const layout = Object.keys(g.attributes).sort().map((k) => `${k}:${g.attributes[k].itemSize}`).join(",");
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
    const geo = mergeInto(gr, toLocal);
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

type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
type Typed = Exclude<THREE.TypedArray, Float16Array>;

/** An attribute's components as (array, stride, offset) in array elements, interleaved or not. */
function strided(a: Attr): { arr: Typed; stride: number; off: number } {
  const ia = a as THREE.InterleavedBufferAttribute;
  return ia.isInterleavedBufferAttribute ? { arr: ia.data.array as Typed, stride: ia.data.stride, off: ia.offset } : { arr: a.array as Typed, stride: a.itemSize, off: 0 };
}

/** three's denormalize() for one array type: the divisor and whether it is signed (clamped at -1). */
function decoding(a: Attr): { div: number; signed: boolean } {
  if (!a.normalized) return { div: 1, signed: false };
  const arr = strided(a).arr;
  if (arr instanceof Uint8Array || arr instanceof Uint8ClampedArray) return { div: 255, signed: false };
  if (arr instanceof Int8Array) return { div: 127, signed: true };
  if (arr instanceof Uint16Array) return { div: 65535, signed: false };
  if (arr instanceof Int16Array) return { div: 32767, signed: true };
  if (arr instanceof Uint32Array) return { div: 4294967295, signed: false };
  if (arr instanceof Int32Array) return { div: 2147483647, signed: true };
  return { div: 1, signed: false };
}

/**
 * The decoded values of `a` (three's denormalize) as float32 into `out` from vertex `at`, in one pass over the
 * typed array. `point` carries them through the affine `m`, `normal` through m's normal matrix, renormalised:
 * the same arithmetic as BufferGeometry.applyMatrix4 on a float copy, so the floats match it bit for bit.
 */
export function decodeInto(a: Attr, out: Float32Array, at: number, m: THREE.Matrix4 | null = null, kind: "point" | "normal" | null = null): void {
  const { arr, stride, off } = strided(a), { div, signed } = decoding(a), n = a.itemSize, count = a.count;
  const f = Math.fround;
  const dec = div === 1 ? (v: number) => v : signed ? (v: number) => f(Math.max(v / div, -1)) : (v: number) => f(v / div);
  if (m && kind === "point" && n === 3) {
    const e = m.elements;
    for (let i = 0, s = off, o = at * 3; i < count; i++, s += stride, o += 3) {
      const x = dec(arr[s]!), y = dec(arr[s + 1]!), z = dec(arr[s + 2]!);
      out[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    return;
  }
  if (m && kind === "normal" && n === 3) {
    const e = new THREE.Matrix3().getNormalMatrix(m).elements;
    for (let i = 0, s = off, o = at * 3; i < count; i++, s += stride, o += 3) {
      const x = dec(arr[s]!), y = dec(arr[s + 1]!), z = dec(arr[s + 2]!);
      const nx = e[0] * x + e[3] * y + e[6] * z, ny = e[1] * x + e[4] * y + e[7] * z, nz = e[2] * x + e[5] * y + e[8] * z;
      const k = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      out[o] = nx * k; out[o + 1] = ny * k; out[o + 2] = nz * k;
    }
    return;
  }
  for (let i = 0, s = off, o = at * n; i < count; i++, s += stride) for (let c = 0; c < n; c++) out[o++] = dec(arr[s + c]!);
}

/** Bounding box and sphere (three's own results) with one pass for the sphere: the box is given or computed once. */
export function setBounds(g: THREE.BufferGeometry, box?: THREE.Box3): void {
  if (box) g.boundingBox = box; else g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  const { arr, stride, off } = strided(g.attributes.position);
  let r2 = 0;
  for (let s = off; s < arr.length; s += stride) {
    const dx = arr[s]! - c.x, dy = arr[s + 1]! - c.y, dz = arr[s + 2]! - c.z;
    r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
  }
  g.boundingSphere = new THREE.Sphere(c, Math.sqrt(r2));
}

/** The group's geometries as one indexed geometry in `into`'s frame (toLocal). */
function mergeInto(gr: readonly THREE.Mesh[], toLocal: THREE.Matrix4): THREE.BufferGeometry {
  const mats = gr.map((m) => {
    m.updateWorldMatrix(true, false);
    const mat = new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld);
    return mat.equals(IDENTITY) ? null : mat;
  });
  const geos = gr.map((m) => m.geometry);
  const counts = geos.map((g) => g.attributes.position.count);
  const total = counts.reduce((a, b) => a + b, 0);
  const g = new THREE.BufferGeometry();
  for (const [k, a0] of Object.entries(geos[0].attributes)) {
    const srcs = geos.map((s) => s.attributes[k]), n = a0.itemSize;
    const kind = k === "position" ? "point" : k === "normal" ? "normal" : null;
    const Ctor = strided(a0).arr.constructor as new (n: number) => Typed;
    const same = srcs.every((a) => strided(a).arr.constructor === Ctor && a.normalized === a0.normalized);
    if (same && (!kind || (Ctor === Float32Array && !a0.normalized && mats.every((m) => !m)))) {
      // copied as stored (de-interleaved): bytes stay bytes
      const dst = new Ctor(total * n);
      let o = 0;
      for (const a of srcs) {
        const { arr, stride, off } = strided(a);
        if (stride === n && off === 0) { dst.set(arr.subarray(0, a.count * n), o); o += a.count * n; }
        else for (let i = 0, s = off; i < a.count; i++, s += stride) for (let c = 0; c < n; c++) dst[o++] = arr[s + c]!;
      }
      g.setAttribute(k, new THREE.BufferAttribute(dst, n, a0.normalized));
    } else {
      const dst = new Float32Array(total * n);
      let at = 0;
      srcs.forEach((a, i) => { decodeInto(a, dst, at, mats[i], kind); at += a.count; });
      g.setAttribute(k, new THREE.BufferAttribute(dst, n));
    }
  }
  const nIdx = geos.reduce((t, s) => t + (s.index ? s.index.count : s.attributes.position.count), 0);
  const ix = total > 65535 ? new Uint32Array(nIdx) : new Uint16Array(nIdx);
  let o = 0, base = 0;
  geos.forEach((s, gi) => {
    const start = o;
    if (s.index) { const src = s.index.array; for (let i = 0; i < s.index.count; i++) ix[o++] = src[i]! + base; }
    else for (let i = 0; i < counts[gi]; i++) ix[o++] = i + base;
    // a mirrored source was drawn flip-sided: bake the flip into the winding
    if (mats[gi] && mats[gi]!.determinant() < 0) for (let t = start; t + 2 < o; t += 3) { const a = ix[t + 1]!; ix[t + 1] = ix[t + 2]!; ix[t + 2] = a; }
    base += counts[gi];
  });
  g.setIndex(new THREE.BufferAttribute(ix, 1));
  // untransformed sources keep their bounds: the merged box is their union (no pass over the vertices)
  const boxes = geos.map((s, i) => (mats[i] ? null : s.boundingBox));
  setBounds(g, boxes.every((b) => b) ? boxes.reduce<THREE.Box3>((u, b) => u.union(b!), new THREE.Box3()) : undefined);
  return g;
}

const IDENTITY = new THREE.Matrix4();
