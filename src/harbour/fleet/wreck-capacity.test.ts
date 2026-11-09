import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { describe, expect, it, vi } from "vitest";
import manifestJson from "../../../public/harbour/kit/manifest.json";
import type { AssetStore } from "../engine/assets";
import type { EngineContext, PreparationService } from "../engine/types";
import type { KitManifest } from "./hull-kit";
import { bakeGltf, loadWreckKit, validateWreckCapacity } from "./hull-kit";
import { FleetSystem } from "./fleet-system";

const manifest = manifestJson as unknown as KitManifest;

describe("reserved wreck geometry", () => {
  it("keeps generated counts current and exactly matches the installed GLTFLoader/bake layout", async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), resources: Array<THREE.BufferGeometry | THREE.Material> = [];
    const assets = { gltf: async (path: string) => {
      const data = readFileSync(`public${path}`), buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      const gltf = await loader.parseAsync(buffer, "");
      gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) resources.push(m.geometry, ...(Array.isArray(m.material) ? m.material : [m.material])); });
      return gltf;
    } } as unknown as AssetStore;
    const submit = vi.fn(async <T>(work: () => T) => work());
    const items = await loadWreckKit(assets, manifest, new Set(manifest.wreck_kit!.items.map((item) => item.id)), { submit } as unknown as PreparationService);
    expect(items.size).toBe(20); expect(submit.mock.calls.length).toBeGreaterThan(20);
    for (const item of manifest.wreck_kit!.items) {
      const loaded = items.get(item.id)!;
      expect(() => validateWreckCapacity(item, loaded.full, loaded.bare)).not.toThrow();
      expect(() => validateWreckCapacity({ ...item, capacity: { full: { vertices: 1, indices: 1 } } }, loaded.full, loaded.bare)).toThrow("capacity mismatch");
      loaded.full.dispose(); loaded.bare?.dispose();
    }
    for (const resource of new Set(resources)) resource.dispose();
  });

  it("adds deferred cove geometry without replacing any sailing-fleet attribute allocation", async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const item = manifest.wreck_kit!.items.find((it) => it.id === "wreck_great_hulk")!;
    const data = readFileSync(`public/harbour/kit/${item.file}`);
    const gltf = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
    const material = new THREE.MeshStandardMaterial(), services = new Map();
    const ctx = { scene: new THREE.Scene(), services, assets: { gltf: async () => gltf } } as unknown as EngineContext;
    const system = new FleetSystem(), f = system as unknown as {
      mesh: THREE.BatchedMesh; buildMesh(ctx: EngineContext, max: number): void; loadCove(): Promise<void>;
      uniforms: { uFleetData: THREE.IUniform<THREE.Texture>; uFleetPaint: THREE.IUniform<THREE.Texture> };
    };
    const base = bakeGltf(gltf, item.nodes, { wreck: true });
    Object.assign(system, { ctx, material, kit: { manifest: { hulls: [], props: [], wreck_kit: { items: [item] } }, hulls: new Map([["base", { id: "base", full: base, lod: null }]]), props: new Map() } });
    f.buildMesh(ctx, 10);
    const geometry = f.mesh.geometry, attributes = { ...geometry.attributes }, index = geometry.index;
    const resize = vi.spyOn(f.mesh, "setGeometrySize");
    await f.loadCove();
    expect(resize).not.toHaveBeenCalled(); expect(f.mesh.geometry).toBe(geometry); expect(geometry.index).toBe(index);
    for (const [name, attribute] of Object.entries(attributes)) expect(geometry.attributes[name]).toBe(attribute);
    f.mesh.dispose(); base.dispose(); material.dispose(); f.uniforms.uFleetData.value.dispose(); f.uniforms.uFleetPaint.value.dispose();
    gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose(); } });
  });
});
