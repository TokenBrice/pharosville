import * as THREE from "three";
import type { EngineContext, WorldSystem } from "../engine/types";
import { isAbort } from "../engine/failure";
import { consumeBinary, VEGETATION_INSTANCES_URL, VEGETATION_URL } from "../engine/prefetch";
import { decodeInto, setBounds } from "../engine/static-merge";
import { getHarbourMaterials } from "./materials";

export { VEGETATION_INSTANCES_URL, VEGETATION_URL };

/** Fixed 18 prototype names matching `protoId` 0..17 in `HBVG` v1 and GLB node names in `vegetation.glb`. */
export const VEG_PROTOTYPE_NAMES = [
  "pine_broad",
  "pine_tiered",
  "pine_sheared",
  "pine_young",
  "cypress_tall",
  "cypress_column",
  "cypress_sanctuary",
  "olive_ancient",
  "olive_terrace",
  "olive_young",
  "plane_tall",
  "plane_broad",
  "almond_spread",
  "almond_young",
  "fig_broad",
  "pomegranate_multi",
  "vine_row_short",
  "vine_row_long",
] as const;

export type VegPrototypeName = (typeof VEG_PROTOTYPE_NAMES)[number];

export const HBVG_MAGIC = "HBVG";
export const HBVG_VERSION = 1;
export const HBVG_HEADER_BYTES = 16;
export const HBVG_RECORD_BYTES = 20;

export interface VegetationInstance {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scaleXZ: number;
  readonly scaleY: number;
  readonly protoId: number;
  readonly seed: number;
  readonly luma: number;
  readonly swayGain: number;
  readonly patternOffset: number;
}

export interface ParsedVegetationInstances {
  readonly version: number;
  readonly protoCount: number;
  readonly flags: number;
  readonly count: number;
  readonly buckets: ReadonlyArray<readonly VegetationInstance[]>;
}

const IDENTITY = new THREE.Matrix4();
const UP_Y = new THREE.Vector3(0, 1, 0);

export function decodeYawU16(v: number): number {
  return (v / 65536) * Math.PI * 2;
}

export function decodeScaleByte(v: number): number {
  return 0.35 + (v / 255) * 1.45;
}

export function decodeLumaByte(v: number): number {
  return 0.86 + (v / 255) * 0.28;
}

export function decodeSwayGainByte(v: number): number {
  return 0.50 + (v / 255) * 1.00;
}

/** Deterministic per-instance pattern phase offset in [0, 1), uncorrelated with `seed`. */
export function patternOffsetOf(seedByte: number, yawU16: number, lumaByte: number): number {
  const h = Math.imul((seedByte << 16) ^ yawU16 ^ (lumaByte << 8) ^ 0x9e3779b9, 2654435761) >>> 0;
  return h / 4294967296;
}

/**
 * Decode an `HBVG` v1 binary vegetation instance table (16 B header + N × 20 B little-endian records)
 * into per-prototype buckets (`0..17`).
 */
export function parseVegetationInstances(buffer: ArrayBuffer): ParsedVegetationInstances {
  if (buffer.byteLength < HBVG_HEADER_BYTES) {
    throw new Error(`Invalid HBVG vegetation buffer: too short (${buffer.byteLength} B)`);
  }
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x48 || bytes[1] !== 0x42 || bytes[2] !== 0x56 || bytes[3] !== 0x47) {
    throw new Error("Invalid HBVG vegetation buffer: bad magic");
  }
  const view = new DataView(buffer);
  const version = view.getUint16(4, true);
  if (version !== HBVG_VERSION) {
    throw new Error(`Unsupported HBVG vegetation version: ${version}`);
  }
  const protoCount = view.getUint16(6, true);
  if (protoCount < 1 || protoCount > VEG_PROTOTYPE_NAMES.length) {
    throw new Error(`Invalid HBVG prototype count: ${protoCount}`);
  }
  const instanceCount = view.getUint32(8, true);
  const flags = view.getUint32(12, true);
  const required = HBVG_HEADER_BYTES + instanceCount * HBVG_RECORD_BYTES;
  if (buffer.byteLength < required) {
    throw new Error(`Truncated HBVG vegetation buffer: need ${required} B, got ${buffer.byteLength} B`);
  }

  const buckets: VegetationInstance[][] = Array.from({ length: VEG_PROTOTYPE_NAMES.length }, () => []);
  let accepted = 0;
  for (let i = 0; i < instanceCount; i++) {
    const off = HBVG_HEADER_BYTES + i * HBVG_RECORD_BYTES;
    const x = view.getFloat32(off, true);
    const y = view.getFloat32(off + 4, true);
    const z = view.getFloat32(off + 8, true);
    const yawU16 = view.getUint16(off + 12, true);
    const scaleXZByte = view.getUint8(off + 14);
    const scaleYByte = view.getUint8(off + 15);
    const protoId = view.getUint8(off + 16);
    const seedByte = view.getUint8(off + 17);
    const lumaByte = view.getUint8(off + 18);
    const swayGainByte = view.getUint8(off + 19);
    if (protoId >= protoCount || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    buckets[protoId]!.push({
      x,
      y,
      z,
      yaw: decodeYawU16(yawU16),
      scaleXZ: decodeScaleByte(scaleXZByte),
      scaleY: decodeScaleByte(scaleYByte),
      protoId,
      seed: seedByte / 255,
      luma: decodeLumaByte(lumaByte),
      swayGain: decodeSwayGainByte(swayGainByte),
      patternOffset: patternOffsetOf(seedByte, yawU16, lumaByte),
    });
    accepted++;
  }
  return { version, protoCount, flags, count: accepted, buckets };
}

/**
 * Bake a prototype mesh's node world matrix (including KHR_mesh_quantization scale/translation)
 * directly into a cloned Float32 BufferGeometry in true metres (`scale = 1, 1, 1`), renormalising
 * normals so procedural patterns (`hbPattern`) and instanced wind sway operate at exact 1:1 metre scale.
 * Never mutates the source GLTF geometry owned by AssetStore.
 */
export function dequantizePrototypeGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const worldMat = mesh.matrixWorld;
  const geom = mesh.geometry.clone();
  const pos = geom.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return geom;

  const isIdentity = worldMat.equals(IDENTITY);
  const needsPosDecode = !(pos.array instanceof Float32Array && !pos.normalized) || !isIdentity;
  if (needsPosDecode) {
    const out = new Float32Array(pos.count * pos.itemSize);
    decodeInto(pos, out, 0, isIdentity ? null : worldMat, "point");
    geom.setAttribute("position", new THREE.BufferAttribute(out, pos.itemSize));
  }

  const nor = geom.attributes.normal as THREE.BufferAttribute | undefined;
  if (nor && (!(nor.array instanceof Float32Array && !nor.normalized) || !isIdentity)) {
    const out = new Float32Array(nor.count * nor.itemSize);
    decodeInto(nor, out, 0, isIdentity ? null : worldMat, "normal");
    geom.setAttribute("normal", new THREE.BufferAttribute(out, nor.itemSize));
  }

  const uv = geom.attributes.uv as THREE.BufferAttribute | undefined;
  if (uv && !(uv.array instanceof Float32Array && !uv.normalized)) {
    const out = new Float32Array(uv.count * uv.itemSize);
    decodeInto(uv, out, 0, null, null);
    geom.setAttribute("uv", new THREE.BufferAttribute(out, uv.itemSize));
  }

  const tan = geom.attributes.tangent as THREE.BufferAttribute | undefined;
  if (tan && !isIdentity) {
    const out = new Float32Array(tan.count * tan.itemSize);
    decodeInto(tan, out, 0, worldMat, "tangent");
    geom.setAttribute("tangent", new THREE.BufferAttribute(out, tan.itemSize));
  }

  if (!isIdentity && worldMat.determinant() < 0 && geom.index) {
    const idx = geom.index.array;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const tmp = idx[i + 1]!;
      idx[i + 1] = idx[i + 2]!;
      idx[i + 2] = tmp;
    }
    geom.index.needsUpdate = true;
  }

  setBounds(geom);
  return geom;
}

/** Collect prototype meshes from a loaded vegetation GLB scene keyed by exact prototype name. */
export function indexPrototypeMeshes(root: THREE.Object3D): Map<string, THREE.Mesh> {
  root.updateMatrixWorld(true);
  const map = new Map<string, THREE.Mesh>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name && !map.has(mesh.name)) map.set(mesh.name, mesh);
    else if (mesh.parent?.name && !map.has(mesh.parent.name)) map.set(mesh.parent.name, mesh);
  });
  return map;
}

/**
 * Assemble one `THREE.InstancedMesh` per non-empty vegetation prototype, with metre-space dequantized
 * geometry, per-instance `aVegMeta` (`seed, luma, swayGain, patternOffset`), never setting `instanceColor`.
 */
export function buildVegetationMeshes(
  gltfRoot: THREE.Object3D,
  parsed: ParsedVegetationInstances,
  material: THREE.Material,
  depthMaterial: THREE.Material,
): THREE.InstancedMesh[] {
  const prototypes = indexPrototypeMeshes(gltfRoot);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const mat4 = new THREE.Matrix4();
  const meshes: THREE.InstancedMesh[] = [];

  for (let protoId = 0; protoId < VEG_PROTOTYPE_NAMES.length; protoId++) {
    const bucket = parsed.buckets[protoId];
    if (!bucket || bucket.length === 0) continue;
    const protoName = VEG_PROTOTYPE_NAMES[protoId]!;
    const protoMesh = prototypes.get(protoName);
    if (!protoMesh) {
      console.warn(`[harbour] vegetation prototype missing in GLB: ${protoName}`);
      continue;
    }

    const geom = dequantizePrototypeGeometry(protoMesh);
    const meta = new Float32Array(bucket.length * 4);
    const inst = new THREE.InstancedMesh(geom, material, bucket.length);
    inst.name = `veg_${protoName}`;

    for (let i = 0; i < bucket.length; i++) {
      const rec = bucket[i]!;
      pos.set(rec.x, rec.y, rec.z);
      quat.setFromAxisAngle(UP_Y, rec.yaw);
      scl.set(rec.scaleXZ, rec.scaleY, rec.scaleXZ);
      mat4.compose(pos, quat, scl);
      inst.setMatrixAt(i, mat4);
      const base = i * 4;
      meta[base] = rec.seed;
      meta[base + 1] = rec.luma;
      meta[base + 2] = rec.swayGain;
      meta[base + 3] = rec.patternOffset;
    }

    geom.setAttribute("aVegMeta", new THREE.InstancedBufferAttribute(meta, 4));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.customDepthMaterial = depthMaterial;
    inst.computeBoundingBox();
    inst.computeBoundingSphere();
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    meshes.push(inst);
  }

  return meshes;
}

/**
 * Instanced Mediterranean trees & vineyard rows loaded from `vegetation.glb` + `vegetation-instances.bin`.
 * Initializes immediately after `IslandSystem` (after `renderGround()` completes so canopy crowns never
 * pollute `ground.heightAt()`), before Frame 1 so trees are 100% present with zero pop-in.
 */
export class VegetationSystem implements WorldSystem {
  readonly name = "vegetation";
  private root: THREE.Group | null = null;
  private meshes: THREE.InstancedMesh[] = [];

  async init(ctx: EngineContext): Promise<void> {
    ctx.signal?.throwIfAborted();
    const binPromise = consumeBinary(ctx.assets, VEGETATION_INSTANCES_URL);
    const gltfPromise = ctx.assets.gltf(VEGETATION_URL).catch((err: unknown) => {
      if (isAbort(err) || ctx.signal?.aborted) throw err;
      console.warn("[harbour] vegetation.glb unavailable; skipping instanced flora", err);
      return null;
    });

    const [binBytes, gltf] = await Promise.all([binPromise, gltfPromise]);
    ctx.signal?.throwIfAborted();
    if (!binBytes || binBytes.byteLength === 0 || !gltf) return;

    let parsed: ParsedVegetationInstances;
    try {
      parsed = parseVegetationInstances(binBytes);
    } catch (err) {
      console.warn("[harbour] vegetation-instances.bin invalid; skipping instanced flora", err);
      return;
    }
    if (parsed.count === 0) return;

    const mats = getHarbourMaterials(ctx);
    const vegMat = mats.vegSolid();
    const vegDepth = mats.vegDepth();
    const meshes = buildVegetationMeshes(gltf.scene, parsed, vegMat, vegDepth);
    if (meshes.length === 0) return;

    const group = new THREE.Group();
    group.name = "harbour-vegetation";
    for (const mesh of meshes) group.add(mesh);
    ctx.scene.add(group);
    group.updateMatrixWorld(true);
    for (const mesh of meshes) mats.staticDepth.add(mesh);

    this.root = group;
    this.meshes = meshes;
  }

  update(): void {
    // Wind sway uniforms are updated once per frame by IslandSystem via updateSway(ctx).
  }

  dispose(ctx: EngineContext): void {
    const mats = ctx.services.get("materials");
    for (const mesh of this.meshes) {
      mats?.staticDepth.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.meshes = [];
    if (this.root) {
      ctx.scene.remove(this.root);
      this.root = null;
    }
  }
}
