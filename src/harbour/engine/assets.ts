import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * Cached GLB/texture loading. Paths are URLs served by Vite (public/ or ?url imports).
 *
 * Shipped GLBs (/harbour/...) are fetched as their pre-gzipped `.glb.gz` sibling
 * (scripts/harbour/compress-assets.mjs: Cloudflare Pages serves model/gltf-binary uncompressed) and
 * inflated with DecompressionStream; the plain .glb is the fallback (no DecompressionStream, or no .gz).
 */
export class AssetStore {
  private readonly gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly gltfs = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<THREE.Texture>>();

  gltf(url: string): Promise<GLTF> {
    let p = this.gltfs.get(url);
    if (!p) {
      const gz = url.startsWith("/harbour/") && url.endsWith(".glb") && typeof DecompressionStream === "function";
      p = gz ? this.gltfGz(url) : this.gltfLoader.loadAsync(url);
      this.gltfs.set(url, p);
    }
    return p;
  }

  private async gltfGz(url: string): Promise<GLTF> {
    let glb: ArrayBuffer | null = null;
    try {
      const res = await fetch(`${url}.gz`);
      // Vite dev answers a missing file with index.html
      if (res.ok && !(res.headers.get("content-type") ?? "").includes("text/html")) {
        const buf = await res.arrayBuffer();
        const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
        // a server that already decoded it (Content-Encoding: gzip) hands over the GLB itself
        glb = b[0] === 0x1f && b[1] === 0x8b
          ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
          : buf;
      }
    } catch (e) { console.warn(`[harbour] ${url}.gz unavailable, loading the plain GLB`, e); }
    if (!glb) return this.gltfLoader.loadAsync(url);
    return this.gltfLoader.parseAsync(glb, url.slice(0, url.lastIndexOf("/") + 1));
  }

  texture(url: string, srgb = true): Promise<THREE.Texture> {
    let p = this.textures.get(url);
    if (!p) {
      p = this.textureLoader.loadAsync(url).then((t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; });
      this.textures.set(url, p);
    }
    return p;
  }
}
