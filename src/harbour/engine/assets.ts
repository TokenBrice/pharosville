import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { readAssetPack, type AssetPack } from "./asset-pack";

interface ModelTransport { url: string; entry?: string }
interface AssetRegistry { urls: Record<string, string>; models: Record<string, ModelTransport> }
// Generated once by the Vite preload/asset plugin; absent in tests and unbuilt development.
declare const __PV_ASSET_REGISTRY__: AssetRegistry;
const registry: AssetRegistry = typeof __PV_ASSET_REGISTRY__ === "undefined" ? { urls: {}, models: {} } : __PV_ASSET_REGISTRY__;
export function assetUrl(url: string): string { return registry.urls[url] ?? url; }

/** Per-engine caches. Production Brotli is decoded by HTTP, never JavaScript. Dev retains gzip. */
export class AssetStore {
  private readonly gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly gltfs = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<THREE.Texture>>();
  private readonly jsons = new Map<string, Promise<unknown>>();
  private readonly prefetched = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly packs = new Map<string, Promise<AssetPack>>();
  private readonly packRemaining = new Map<string, Set<string>>();
  private disposed = false;
  private readonly resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();

  private static gz(url: string): boolean {
    return url.startsWith("/harbour/") && url.endsWith(".glb") && typeof DecompressionStream === "function";
  }

  /** One immutable JSON fetch/parse per engine, including prefetch and consumers. */
  json<T>(url: string): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("AssetStore disposed"));
    url = assetUrl(url);
    let p = this.jsons.get(url);
    if (!p) {
      p = fetch(url).then((res) => {
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        if (this.disposed) throw new Error("AssetStore disposed");
        return res.json() as Promise<unknown>;
      }).then((value) => {
        if (this.disposed) throw new Error("AssetStore disposed");
        return value;
      }).catch((error: unknown) => {
        this.jsons.delete(url);
        throw error;
      });
      this.jsons.set(url, p);
    }
    return p as Promise<T>;
  }

  gltf(url: string): Promise<GLTF> {
    if (this.disposed) return Promise.reject(new Error("AssetStore disposed"));
    let p = this.gltfs.get(url);
    if (!p) {
      const transport = registry.models[url];
      p = transport ? this.gltfTransport(url, transport)
        : AssetStore.gz(url) ? this.gltfGz(url) : this.gltfLoader.loadAsync(url);
      p = p.then((gltf) => {
        for (const scene of gltf.scenes) scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          this.resources.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            this.resources.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) this.resources.add(value);
          }
        });
        if (this.disposed) {
          for (const resource of this.resources) resource.dispose();
          this.resources.clear();
          throw new Error("AssetStore disposed");
        }
        return gltf;
      });
      this.gltfs.set(url, p);
    }
    return p;
  }

  /** Fetch bytes only, preserving the island→scoped-pack frontier and parser scheduling. */
  prefetch(url: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.gltfs.has(url)) return Promise.resolve();
    const transport = registry.models[url];
    if (transport?.entry) return this.pack(transport.url).then(() => {}, () => {});
    if ((!transport && !AssetStore.gz(url)) || this.prefetched.has(url)) return Promise.resolve();
    const p = transport ? AssetStore.fetchBytes(transport.url) : AssetStore.fetchGz(url);
    this.prefetched.set(url, p);
    return p.then(() => {}, () => {});
  }

  private static async fetchBytes(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) throw new Error(`${url}: HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  private pack(url: string): Promise<AssetPack> {
    let p = this.packs.get(url);
    if (!p) {
      p = AssetStore.fetchBytes(url).then((bytes) => {
        if (this.disposed) throw new Error("AssetStore disposed");
        const pack = readAssetPack(bytes);
        this.packRemaining.set(url, new Set(Object.keys(pack.entries)));
        return pack;
      }).catch((error: unknown) => { this.packs.delete(url); throw error; });
      this.packs.set(url, p);
    }
    return p;
  }

  private async gltfTransport(original: string, transport: ModelTransport): Promise<GLTF> {
    if (transport.entry) {
      const pack = await this.pack(transport.url), bounds = pack.entries[transport.entry];
      if (!bounds) throw new Error(`Missing packed model ${transport.entry}`);
      try {
        // GLTFLoader needs an entry-owned ArrayBuffer; it cannot accept a view into a container.
        return await this.gltfLoader.parseAsync(pack.bytes.slice(bounds[0], bounds[0] + bounds[1]), original.slice(0, original.lastIndexOf("/") + 1));
      } finally {
        const remaining = this.packRemaining.get(transport.url);
        remaining?.delete(transport.entry);
        if (!remaining?.size) { this.packRemaining.delete(transport.url); this.packs.delete(transport.url); }
      }
    }
    const early = this.prefetched.get(original);
    this.prefetched.delete(original);
    const bytes = await (early ?? AssetStore.fetchBytes(transport.url));
    if (!bytes) throw new Error(`Missing model ${original}`);
    return this.gltfLoader.parseAsync(bytes, original.slice(0, original.lastIndexOf("/") + 1));
  }

  private static async fetchGz(url: string): Promise<ArrayBuffer | null> {
    const res = await fetch(`${url}.gz`);
    return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html") ? res.arrayBuffer() : null;
  }

  private async gltfGz(url: string): Promise<GLTF> {
    let glb: ArrayBuffer | null = null;
    const early = this.prefetched.get(url);
    this.prefetched.delete(url);
    try {
      const buf = await (early ?? AssetStore.fetchGz(url));
      if (buf) {
        const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
        // Legacy gzip objects lack Content-Encoding; already HTTP-decoded GLBs bypass inflation.
        glb = b[0] === 0x1f && b[1] === 0x8b
          ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer() : buf;
      }
    } catch (e) { console.warn(`[harbour] ${url}.gz unavailable, loading the plain GLB`, e); }
    if (!glb) return this.gltfLoader.loadAsync(url);
    return this.gltfLoader.parseAsync(glb, url.slice(0, url.lastIndexOf("/") + 1));
  }

  texture(url: string, srgb = true): Promise<THREE.Texture> {
    if (this.disposed) return Promise.reject(new Error("AssetStore disposed"));
    url = assetUrl(url);
    let p = this.textures.get(url);
    if (!p) {
      p = this.textureLoader.loadAsync(url).then((t) => {
        if (this.disposed) { t.dispose(); throw new Error("AssetStore disposed"); }
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        this.resources.add(t);
        return t;
      });
      this.textures.set(url, p);
    }
    return p;
  }

  /** Called after systems release their clones/consumers. Pending resolutions cannot repopulate caches. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gltfs.clear(); this.textures.clear(); this.jsons.clear(); this.prefetched.clear();
    this.packs.clear(); this.packRemaining.clear();
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}
