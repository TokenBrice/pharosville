import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/** Cached GLB/texture loading. Paths are URLs served by Vite (public/ or ?url imports). */
export class AssetStore {
  private readonly gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly gltfs = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<THREE.Texture>>();

  gltf(url: string): Promise<GLTF> {
    let p = this.gltfs.get(url);
    if (!p) { p = this.gltfLoader.loadAsync(url); this.gltfs.set(url, p); }
    return p;
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
