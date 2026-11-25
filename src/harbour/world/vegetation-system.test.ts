import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetStore } from "../engine/assets";
import { assembleShader } from "../engine/shader-recipes";
import type { Services } from "../engine/services";
import type { EngineContext, FrameState } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { HarbourMaterials } from "./materials";
import {
  buildVegetationMeshes,
  buildVegetationPools,
  decodeLumaByte,
  decodeScaleByte,
  decodeSwayGainByte,
  decodeYawU16,
  dequantizePrototypeGeometry,
  HBVG_HEADER_BYTES,
  HBVG_RECORD_BYTES,
  HBVG_VERSION,
  indexPrototypeMeshes,
  parseVegetationInstances,
  VEG_CELL_SIZE,
  VEG_PROTOTYPE_NAMES,
  VEGETATION_INSTANCES_URL,
  VEGETATION_URL,
  VegetationSystem,
} from "./vegetation-system";
import type { QualityService, QualitySettings, QualityTier } from "../engine/quality";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface RawRecord {
  x: number;
  y: number;
  z: number;
  yawU16: number;
  scaleXZ: number;
  scaleY: number;
  protoId: number;
  seed: number;
  luma: number;
  swayGain: number;
}

function encodeHbvg(records: readonly RawRecord[], opts: { magic?: string; version?: number; protoCount?: number; flags?: number } = {}): ArrayBuffer {
  const magic = opts.magic ?? "HBVG";
  const version = opts.version ?? HBVG_VERSION;
  const protoCount = opts.protoCount ?? VEG_PROTOTYPE_NAMES.length;
  const flags = opts.flags ?? 0;
  const buf = new ArrayBuffer(HBVG_HEADER_BYTES + records.length * HBVG_RECORD_BYTES);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < 4; i++) bytes[i] = magic.charCodeAt(i);
  const view = new DataView(buf);
  view.setUint16(4, version, true);
  view.setUint16(6, protoCount, true);
  view.setUint32(8, records.length, true);
  view.setUint32(12, flags, true);
  records.forEach((r, idx) => {
    const off = HBVG_HEADER_BYTES + idx * HBVG_RECORD_BYTES;
    view.setFloat32(off, r.x, true);
    view.setFloat32(off + 4, r.y, true);
    view.setFloat32(off + 8, r.z, true);
    view.setUint16(off + 12, r.yawU16, true);
    view.setUint8(off + 14, r.scaleXZ);
    view.setUint8(off + 15, r.scaleY);
    view.setUint8(off + 16, r.protoId);
    view.setUint8(off + 17, r.seed);
    view.setUint8(off + 18, r.luma);
    view.setUint8(off + 19, r.swayGain);
  });
  return buf;
}

function makeQuantizedPrototype(name: string, translation: [number, number, number], scale: number): THREE.Mesh {
  const geom = new THREE.BufferGeometry();
  // Normalized Int16 triangle in [-1, 1] space mimicking KHR_mesh_quantization.
  const pos = new Int16Array([
    -16384, -32767, 0,
    16384, -32767, 0,
    0, 32767, 0,
  ]);
  const nor = new Int16Array([
    0, 0, 32767,
    0, 0, 32767,
    0, 0, 32767,
  ]);
  const col = new Uint8Array([
    40, 120, 60, Math.round((14 / 16) * 255),
    40, 120, 60, Math.round((14 / 16) * 255),
    40, 120, 60, Math.round((14 / 16) * 255),
  ]);
  const sway = new Float32Array([0, 0, 80]);
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3, true));
  geom.setAttribute("normal", new THREE.BufferAttribute(nor, 3, true));
  geom.setAttribute("color", new THREE.BufferAttribute(col, 4, true));
  geom.setAttribute("_sway", new THREE.BufferAttribute(sway, 1));
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ name: "hb_opaque" }));
  mesh.name = name;
  mesh.position.set(...translation);
  mesh.scale.set(scale, scale, scale);
  return mesh;
}

describe("HBVG v1 binary parser", () => {
  it("decodes header, all 20-byte fields, quantization ranges, and per-prototype buckets", () => {
    const buf = encodeHbvg([
      { x: 12.5, y: 4.25, z: -38.0, yawU16: 0, scaleXZ: 0, scaleY: 255, protoId: 0, seed: 0, luma: 0, swayGain: 0 },
      { x: -44.0, y: 8.5, z: 19.75, yawU16: 32768, scaleXZ: 255, scaleY: 0, protoId: 10, seed: 255, luma: 255, swayGain: 255 },
      { x: 3.0, y: 1.0, z: 5.0, yawU16: 16384, scaleXZ: 128, scaleY: 128, protoId: 17, seed: 128, luma: 128, swayGain: 128 },
    ]);
    const parsed = parseVegetationInstances(buf);
    expect(parsed.version).toBe(1);
    expect(parsed.protoCount).toBe(18);
    expect(parsed.flags).toBe(0);
    expect(parsed.count).toBe(3);
    expect(parsed.buckets).toHaveLength(18);

    const a = parsed.buckets[0]![0]!;
    expect(a.x).toBeCloseTo(12.5, 5);
    expect(a.y).toBeCloseTo(4.25, 5);
    expect(a.z).toBeCloseTo(-38.0, 5);
    expect(a.yaw).toBeCloseTo(0, 6);
    expect(a.scaleXZ).toBeCloseTo(0.35, 6);
    expect(a.scaleY).toBeCloseTo(1.80, 6);
    expect(a.seed).toBe(0);
    expect(a.luma).toBeCloseTo(0.86, 6);
    expect(a.swayGain).toBeCloseTo(0.50, 6);
    expect(a.patternOffset).toBeGreaterThanOrEqual(0);
    expect(a.patternOffset).toBeLessThan(1);

    const b = parsed.buckets[10]![0]!;
    expect(b.yaw).toBeCloseTo(Math.PI, 5);
    expect(b.scaleXZ).toBeCloseTo(1.80, 6);
    expect(b.scaleY).toBeCloseTo(0.35, 6);
    expect(b.seed).toBe(1);
    expect(b.luma).toBeCloseTo(1.14, 6);
    expect(b.swayGain).toBeCloseTo(1.50, 6);

    const c = parsed.buckets[17]![0]!;
    expect(c.yaw).toBeCloseTo(Math.PI / 2, 5);
    expect(c.scaleXZ).toBeCloseTo(decodeScaleByte(128), 6);
    expect(c.luma).toBeCloseTo(decodeLumaByte(128), 6);
    expect(c.swayGain).toBeCloseTo(decodeSwayGainByte(128), 6);
    expect(decodeYawU16(65535)).toBeLessThan(Math.PI * 2);
  });

  it("rejects bad magic, unsupported version, invalid protoCount and truncated buffers", () => {
    expect(() => parseVegetationInstances(new ArrayBuffer(8))).toThrow(/too short/i);
    expect(() => parseVegetationInstances(encodeHbvg([], { magic: "NOPE" }))).toThrow(/magic/i);
    expect(() => parseVegetationInstances(encodeHbvg([], { version: 2 }))).toThrow(/version/i);
    expect(() => parseVegetationInstances(encodeHbvg([], { protoCount: 0 }))).toThrow(/prototype count/i);
    expect(() => parseVegetationInstances(encodeHbvg([], { protoCount: 19 }))).toThrow(/prototype count/i);

    const full = encodeHbvg([{ x: 0, y: 0, z: 0, yawU16: 0, scaleXZ: 100, scaleY: 100, protoId: 0, seed: 1, luma: 1, swayGain: 1 }]);
    expect(() => parseVegetationInstances(full.slice(0, full.byteLength - 1))).toThrow(/truncated/i);
  });

  it("skips records with out-of-range protoId or non-finite coordinates", () => {
    const buf = encodeHbvg([
      { x: 1, y: 2, z: 3, yawU16: 0, scaleXZ: 100, scaleY: 100, protoId: 0, seed: 10, luma: 128, swayGain: 128 },
      { x: 1, y: 2, z: 3, yawU16: 0, scaleXZ: 100, scaleY: 100, protoId: 99, seed: 10, luma: 128, swayGain: 128 },
      { x: Number.NaN, y: 2, z: 3, yawU16: 0, scaleXZ: 100, scaleY: 100, protoId: 0, seed: 10, luma: 128, swayGain: 128 },
    ]);
    const parsed = parseVegetationInstances(buf);
    expect(parsed.count).toBe(1);
    expect(parsed.buckets[0]).toHaveLength(1);
  });
});

describe("prototype dequantization to true metres", () => {
  it("bakes node translation & scale into Float32 metres without mutating source GLTF geometry", () => {
    const src = makeQuantizedPrototype("almond_spread", [0.056, 2.936, -0.204], 3.6095);
    const srcPosRef = src.geometry.attributes.position;

    const baked = dequantizePrototypeGeometry(src);
    expect(baked).not.toBe(src.geometry);
    expect(src.geometry.attributes.position).toBe(srcPosRef);
    expect(src.geometry.attributes.position.array).toBeInstanceOf(Int16Array);

    const pos = baked.attributes.position as THREE.BufferAttribute;
    expect(pos.array).toBeInstanceOf(Float32Array);
    expect(pos.normalized).toBe(false);
    // Vertex 2 had normalized +1 on Y -> y = 2.936 + 3.6095 = 6.5455 m; vertex 0 had -1 -> y = 2.936 - 3.6095 = -0.6735 m
    expect(pos.getY(0)).toBeCloseTo(2.936 - 3.6095, 3);
    expect(pos.getY(2)).toBeCloseTo(2.936 + 3.6095, 3);
    expect(baked.boundingBox!.max.y - baked.boundingBox!.min.y).toBeCloseTo(3.6095 * 2, 3);

    const nor = baked.attributes.normal as THREE.BufferAttribute;
    expect(nor.array).toBeInstanceOf(Float32Array);
    expect(nor.normalized).toBe(false);
    expect(Math.hypot(nor.getX(0), nor.getY(0), nor.getZ(0))).toBeCloseTo(1, 5);

    // COLOR_0 remains compact normalized Uint8 and _sway remains Float32
    expect(baked.attributes.color.array).toBeInstanceOf(Uint8Array);
    expect(baked.attributes.color.normalized).toBe(true);
    expect(baked.attributes._sway.array).toBeInstanceOf(Float32Array);
    baked.dispose();
    src.geometry.dispose();
  });

  it("loads the shipped public/harbour/flora/vegetation.glb, matches all 18 LOD0 + 18 *_lod LOD1 prototypes, and dequantizes to metre scale", async () => {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const raw = readFileSync(resolve(process.cwd(), "public/harbour/flora/vegetation.glb"));
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const gltf = await loader.parseAsync(ab, "");
    const prototypes = indexPrototypeMeshes(gltf.scene);

    let totalLod0Tris = 0;
    let totalLod1Tris = 0;
    for (const name of VEG_PROTOTYPE_NAMES) {
      const mesh = prototypes.get(name);
      const lodMesh = prototypes.get(`${name}_lod`);
      expect(mesh, `missing prototype ${name}`).toBeDefined();
      expect(lodMesh, `missing LOD1 prototype ${name}_lod`).toBeDefined();
      const baked = dequantizePrototypeGeometry(mesh!);
      const bakedLod = dequantizePrototypeGeometry(lodMesh!);
      const pos = baked.attributes.position as THREE.BufferAttribute;
      expect(pos.array).toBeInstanceOf(Float32Array);
      expect(pos.normalized).toBe(false);
      const height = baked.boundingBox!.max.y - baked.boundingBox!.min.y;
      // Vine rows are ~1.6 m tall; sanctuary cypress / tall plane reach ~12.7 m
      expect(height).toBeGreaterThan(1.4);
      expect(height).toBeLessThan(14.0);
      expect(baked.attributes._sway).toBeDefined();
      expect(baked.attributes.color).toBeDefined();
      expect(bakedLod.attributes._sway).toBeDefined();
      expect(bakedLod.attributes.color).toBeDefined();

      const t0 = baked.index!.count / 3;
      const t1 = bakedLod.index!.count / 3;
      totalLod0Tris += t0;
      totalLod1Tris += t1;
      expect(t1 / t0, `${name}_lod triangle reduction ratio`).toBeGreaterThanOrEqual(0.30);
      expect(t1 / t0, `${name}_lod triangle reduction ratio`).toBeLessThanOrEqual(0.60);

      baked.dispose();
      bakedLod.dispose();
    }
    expect(totalLod1Tris).toBeGreaterThanOrEqual(6000);
    expect(totalLod1Tris).toBeLessThanOrEqual(7800);
    expect(totalLod1Tris / totalLod0Tris).toBeLessThan(0.50);
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  });
});

describe("VegetationSystem runtime, StaticDepthRegistry opt-in & graceful fallback", () => {
  it("handles missing / 404 vegetation-instances.bin gracefully without crashing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const assets = new AssetStore();
    vi.spyOn(assets, "gltf").mockRejectedValue(new Error("404"));
    const uniforms = createWorldUniforms();
    const mats = new HarbourMaterials(uniforms);
    const scene = new THREE.Scene();
    const services = new Map([["materials", mats]]) as unknown as Services;
    const ctx = { scene, assets, uniforms, services } as unknown as EngineContext;

    const sys = new VegetationSystem();
    await expect(sys.init(ctx)).resolves.toBeUndefined();
    expect(scene.children).toHaveLength(0);
    expect(mats.staticDepth.scene.children).toHaveLength(0);
    sys.dispose(ctx);
    mats.dispose();
    assets.dispose();
  });

  it("mounts InstancedMeshes with aVegMeta (no instanceColor), binds vegDepth & opts into StaticDepthRegistry", async () => {
    const bin = encodeHbvg([
      { x: 10, y: 2, z: -15, yawU16: 16384, scaleXZ: 100, scaleY: 160, protoId: 0, seed: 51, luma: 128, swayGain: 204 },
      { x: 24, y: 3, z: -20, yawU16: 49152, scaleXZ: 180, scaleY: 90, protoId: 0, seed: 204, luma: 255, swayGain: 0 },
      { x: -12, y: 5, z: 8, yawU16: 0, scaleXZ: 128, scaleY: 128, protoId: 10, seed: 100, luma: 0, swayGain: 128 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === VEGETATION_INSTANCES_URL) return new Response(bin, { status: 200, headers: { "content-type": "application/octet-stream" } });
      return new Response(null, { status: 404 });
    }));

    const gltfScene = new THREE.Group();
    gltfScene.add(
      makeQuantizedPrototype("pine_broad", [0.28, 4.9, -0.25], 5.736),
      makeQuantizedPrototype("plane_tall", [0.02, 5.93, 0.01], 6.77),
    );
    const assets = new AssetStore();
    vi.spyOn(assets, "gltf").mockImplementation(async (url) => {
      expect(url).toBe(VEGETATION_URL);
      return { scene: gltfScene, scenes: [gltfScene] } as unknown as GLTF;
    });

    const uniforms = createWorldUniforms();
    const mats = new HarbourMaterials(uniforms);
    const scene = new THREE.Scene();
    const services = new Map([["materials", mats]]) as unknown as Services;
    const ctx = { scene, assets, uniforms, services } as unknown as EngineContext;

    const sys = new VegetationSystem();
    await sys.init(ctx);

    const group = scene.getObjectByName("harbour-vegetation") as THREE.Group;
    expect(group).toBeDefined();
    expect(group.children).toHaveLength(2);

    const pine = group.getObjectByName("veg_pine_broad") as THREE.InstancedMesh;
    const plane = group.getObjectByName("veg_plane_tall") as THREE.InstancedMesh;
    expect(pine.isInstancedMesh).toBe(true);
    expect(pine.count).toBe(2);
    expect(plane.count).toBe(1);
    expect(pine.instanceColor).toBeNull();
    expect(plane.instanceColor).toBeNull();
    expect(pine.material).toBe(mats.vegSolid());
    expect(pine.customDepthMaterial).toBe(mats.vegDepth());
    expect(pine.castShadow).toBe(true);
    expect(pine.receiveShadow).toBe(true);

    const meta = pine.geometry.attributes.aVegMeta as THREE.InstancedBufferAttribute;
    expect(meta).toBeInstanceOf(THREE.InstancedBufferAttribute);
    expect(meta.itemSize).toBe(4);
    expect(meta.count).toBe(2);
    expect(meta.getX(0)).toBeCloseTo(51 / 255, 5);
    expect(meta.getY(0)).toBeCloseTo(decodeLumaByte(128), 5);
    expect(meta.getZ(0)).toBeCloseTo(decodeSwayGainByte(204), 5);
    expect(meta.getW(0)).toBeGreaterThanOrEqual(0);
    expect(meta.getW(0)).toBeLessThan(1);

    // Verify matrix translation & non-uniform scaleXZ / scaleY
    const m0 = new THREE.Matrix4(), p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3();
    pine.getMatrixAt(0, m0);
    m0.decompose(p0, q0, s0);
    expect(p0.x).toBeCloseTo(10, 4);
    expect(p0.y).toBeCloseTo(2, 4);
    expect(p0.z).toBeCloseTo(-15, 4);
    expect(s0.x).toBeCloseTo(decodeScaleByte(100), 4);
    expect(s0.y).toBeCloseTo(decodeScaleByte(160), 4);
    expect(s0.z).toBeCloseTo(decodeScaleByte(100), 4);

    // Opted into StaticDepthRegistry with hb_veg_predepth proxy
    mats.staticDepth.sync(scene);
    expect(mats.staticDepth.scene.children).toHaveLength(2);
    const proxy = mats.staticDepth.scene.children[0] as THREE.InstancedMesh;
    expect(proxy.isInstancedMesh).toBe(true);
    expect((proxy.material as THREE.MeshDepthMaterial).name).toBe("hb_veg_predepth");
    expect((proxy.material as THREE.MeshDepthMaterial).colorWrite).toBe(false);
    expect(proxy.count).toBe(2);

    // Clean disposal removes scene root and predepth proxies
    sys.dispose(ctx);
    expect(scene.getObjectByName("harbour-vegetation")).toBeUndefined();
    expect(mats.staticDepth.scene.children).toHaveLength(0);
    mats.dispose();
    assets.dispose();
  });

  it("buildVegetationMeshes creates nothing when buckets are empty", () => {
    const empty = parseVegetationInstances(encodeHbvg([]));
    const uniforms = createWorldUniforms(), mats = new HarbourMaterials(uniforms);
    const meshes = buildVegetationMeshes(new THREE.Group(), empty, mats.vegSolid(), mats.vegDepth());
    expect(meshes).toEqual([]);
    mats.dispose();
  });

  it("partitions wide buckets into spatial quadrants with tight frustum-culled bounds and swaps LOD1 on Low tier & distance", async () => {
    // 25 pine instances split cleanly into 2 distant quadrants: 20 near (10..22, 10..18) and 5 far (220..232, -210..-200)
    const records: RawRecord[] = [];
    for (let i = 0; i < 20; i++) {
      records.push({ x: 10 + (i % 5) * 3, y: 2, z: 10 + Math.floor(i / 5) * 2, yawU16: i * 1000, scaleXZ: 128, scaleY: 128, protoId: 0, seed: (i * 11) & 255, luma: 128, swayGain: 128 });
    }
    for (let i = 0; i < 5; i++) {
      records.push({ x: 220 + i * 3, y: 5, z: -210 + i * 2, yawU16: 32768 + i * 1000, scaleXZ: 128, scaleY: 128, protoId: 0, seed: 120 + i * 10, luma: 128, swayGain: 128 });
    }
    const bin = encodeHbvg(records);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === VEGETATION_INSTANCES_URL) return new Response(bin, { status: 200, headers: { "content-type": "application/octet-stream" } });
      return new Response(null, { status: 404 });
    }));

    const gltfScene = new THREE.Group();
    const lod0 = makeQuantizedPrototype("pine_broad", [0, 4.5, 0], 4.5);
    const lod1 = makeQuantizedPrototype("pine_broad_lod", [0, 4.5, 0], 4.5);
    // Give LOD1 distinct vertex count to assert exact LOD0 <-> LOD1 swaps
    lod1.geometry.setIndex([0, 1, 2]);
    lod0.geometry.setIndex([0, 1, 2, 0, 1, 2]);
    gltfScene.add(lod0, lod1);

    const parsed = parseVegetationInstances(bin);
    const uniforms = createWorldUniforms();
    const mats = new HarbourMaterials(uniforms);
    const built = buildVegetationPools(gltfScene, parsed, mats.vegSolid(), mats.vegDepth());
    expect(VEG_CELL_SIZE).toBe(220);
    expect(built.pools).toHaveLength(2);
    for (const pool of built.pools) {
      expect(pool.mesh.frustumCulled).toBe(true);
      expect(pool.mesh.boundingSphere!.radius).toBeLessThan(35);
      expect(pool.lod1Geometry).not.toBeNull();
      // LOD0 and LOD1 share the exact same aVegMeta attribute
      expect(pool.lod1Geometry!.attributes.aVegMeta).toBe(pool.lod0Geometry.attributes.aVegMeta);
      pool.lod0Geometry.dispose();
      pool.lod1Geometry!.dispose();
      pool.mesh.dispose();
    }
    for (const g of built.baseGeometries) g.dispose();

    // Runtime VegetationSystem: near quadrant uses LOD0, far quadrant uses LOD1 on High; all switch to LOD1 on Low
    const listeners = new Set<(s: QualitySettings, dpr: number) => void>();
    let tier: QualityTier = "high";
    const quality: QualityService = {
      get tier() { return tier; },
      get settings() { return { tier } as QualitySettings; },
      dpr: 1,
      auto: false,
      gpuMs: null,
      set(t) {
        if (t !== "auto") tier = t;
        for (const fn of listeners) fn({ tier } as QualitySettings, 1);
      },
      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    const assets = new AssetStore();
    vi.spyOn(assets, "gltf").mockResolvedValue({ scene: gltfScene, scenes: [gltfScene] } as unknown as GLTF);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 1000);
    camera.position.set(15, 12, 35); // near quadrant (0,1) ~25 m away; far quadrant (1,0) ~315 m away
    const services = new Map<string, unknown>([["materials", mats], ["quality", quality]]) as unknown as Services;
    const ctx = { scene, camera, assets, uniforms, services } as unknown as EngineContext;

    const sys = new VegetationSystem();
    await sys.init(ctx);
    const group = scene.getObjectByName("harbour-vegetation") as THREE.Group;
    expect(group.children).toHaveLength(2);
    const nearMesh = group.getObjectByName("veg_pine_broad_0_1") as THREE.InstancedMesh;
    const farMesh = group.getObjectByName("veg_pine_broad_1_0") as THREE.InstancedMesh;
    expect(nearMesh.count).toBe(20);
    expect(farMesh.count).toBe(5);
    expect(nearMesh.geometry.index!.count).toBe(6); // LOD0
    expect(farMesh.geometry.index!.count).toBe(3);  // LOD1 (distance > 185 m)

    // StaticDepthRegistry proxies match each quadrant's active LOD geometry and tight bounds
    mats.staticDepth.sync(scene);
    expect(mats.staticDepth.scene.children).toHaveLength(2);
    const nearProxy = mats.staticDepth.scene.getObjectByName("veg_pine_broad_0_1-predepth") as THREE.InstancedMesh;
    const farProxy = mats.staticDepth.scene.getObjectByName("veg_pine_broad_1_0-predepth") as THREE.InstancedMesh;
    expect(nearProxy.geometry).toBe(nearMesh.geometry);
    expect(farProxy.geometry).toBe(farMesh.geometry);
    expect(nearProxy.boundingSphere).toBe(nearMesh.boundingSphere);

    // Switching to Low tier moves ALL quadrants (including near) onto LOD1
    quality.set("low");
    expect(nearMesh.geometry.index!.count).toBe(3);
    expect(farMesh.geometry.index!.count).toBe(3);
    mats.staticDepth.sync(scene);
    expect(nearProxy.geometry).toBe(nearMesh.geometry);

    // Returning to High restores LOD0 for near quadrant while keeping far quadrant on LOD1
    quality.set("high");
    expect(nearMesh.geometry.index!.count).toBe(6);
    expect(farMesh.geometry.index!.count).toBe(3);

    // Moving camera toward far quadrant during update() promotes it to LOD0 and demotes old near quadrant to LOD1
    camera.position.set(225, 14, -190);
    sys.update({} as FrameState, ctx);
    expect(farMesh.geometry.index!.count).toBe(6);
    expect(nearMesh.geometry.index!.count).toBe(3);

    sys.dispose(ctx);
    expect(listeners.size).toBe(0);
    lod0.geometry.dispose();
    lod1.geometry.dispose();
    mats.dispose();
    assets.dispose();
  });
});

describe("HB_VEG_INSTANCED shader contracts", () => {
  it("compiles evergreen PID-14 classification, 0.97 winter bare discard, aVegMeta, and instanced sway across colour/depth/predepth", () => {
    const u = createWorldUniforms();
    u.uFoliage.value.set(0, 0, 0, 1); // winter (HB_BARE active)
    const mats = new HarbourMaterials(u);

    const solid = mats.vegSolid();
    const depth = mats.vegDepth(false);
    const predepth = mats.vegDepth(true);

    expect(solid.name).toBe("hb_veg_solid");
    expect(solid.customProgramCacheKey()).toContain("veg-instanced");
    expect(depth.customProgramCacheKey()).toContain("veg-instanced");
    expect(predepth.customProgramCacheKey()).toContain("veg-instanced");

    const solidShader = assembleShader(solid);
    expect("HB_VEG_INSTANCED" in (solidShader.defines ?? {})).toBe(true);
    expect("HB_BARE" in (solidShader.defines ?? {})).toBe(true);
    expect(solidShader.vertexShader).toContain("attribute vec4 aVegMeta;");
    expect(solidShader.vertexShader).toContain("vVegMeta = aVegMeta;");
    expect(solidShader.vertexShader).toContain("mat4 hbM = modelMatrix * instanceMatrix;");
    expect(solidShader.vertexShader).toContain("float hbSwGain = aVegMeta.z;");
    expect(solidShader.fragmentShader).toContain("varying vec4 vVegMeta;");
    expect(solidShader.fragmentShader).toContain("return hbIs(pid, 14.0);");
    expect(solidShader.fragmentShader).toContain("float tree = vVegMeta.x;");
    expect(solidShader.fragmentShader).toContain("diffuseColor.rgb *= vVegMeta.y;");
    expect(solidShader.fragmentShader).toContain("vec3 Pl = P + vVegMeta.w * 17.0;");
    expect(solidShader.fragmentShader).toContain("if (hbBareNoise < hbBare * 0.97) discard;");

    // Shadow depth twin: HB_VEG_INSTANCED + 0.97 winter discard, NO sway (still shadows)
    const depthShader = assembleShader(depth);
    expect("HB_VEG_INSTANCED" in (depthShader.defines ?? {})).toBe(true);
    expect("HB_BARE" in (depthShader.defines ?? {})).toBe(true);
    expect(depthShader.vertexShader).not.toContain("hbSway(");
    expect(depthShader.fragmentShader).toContain("hbEvergreen(pid, vHbCol.rgb)");
    expect(depthShader.fragmentShader).toContain("if (hbNoise(vHbWorld * 1.7) < bare * 0.97) discard;");

    // Predepth twin: HB_VEG_INSTANCED + instanced sway with aVegMeta.z + 0.97 winter discard
    const predepthShader = assembleShader(predepth);
    expect("HB_VEG_INSTANCED" in (predepthShader.defines ?? {})).toBe(true);
    expect("HB_BARE" in (predepthShader.defines ?? {})).toBe(true);
    expect(predepthShader.vertexShader).toContain("attribute vec4 aVegMeta;");
    expect(predepthShader.vertexShader).toContain("mat4 hbM = modelMatrix * instanceMatrix;");
    expect(predepthShader.vertexShader).toContain("float hbSwGain = aVegMeta.z;");
    expect(predepthShader.fragmentShader).toContain("if (hbNoise(vHbWorld * 1.7) < bare * 0.97) discard;");

    // Summer: HB_BARE must be compiled out (zero discard in depth/predepth!)
    u.uFoliage.value.set(0, 1, 0, 0);
    const summerPre = assembleShader(predepth);
    expect("HB_BARE" in (summerPre.defines ?? {})).toBe(false);
    expect("HB_VEG_INSTANCED" in (summerPre.defines ?? {})).toBe(true);

    mats.dispose();
  });
});
