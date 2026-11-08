import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetStore } from "./assets";
import { deferred } from "./deferred";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("owned asset transport", () => {
  it("deduplicates JSON and bounds a stalled body by the transport deadline", async () => {
    const body = deferred();
    const fetcher = vi.fn(async () => ({ ok: true, json: () => body.promise }));
    vi.stubGlobal("fetch", fetcher);
    const assets = new AssetStore();
    const pending = assets.json("/layout.json");
    expect(assets.json("/layout.json")).toBe(pending);
    const failed = expect(pending).rejects.toMatchObject({ code: "loading" });
    await vi.advanceTimersByTimeAsync(30000); await failed;
    expect(fetcher.mock.calls).toHaveLength(1);
    assets.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels stalled gzip bodies without starting a plain fallback, then admits a fresh owner", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, headers: new Headers(), arrayBuffer: () => new Promise<ArrayBuffer>(() => {}) }));
    vi.stubGlobal("fetch", fetcher);
    const lifetime = new AbortController(), old = new AssetStore(lifetime.signal);
    const pending = old.gltf("/harbour/island.glb");
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    lifetime.abort(); await cancelled;
    await old.prefetch("/harbour/later.glb");
    expect(fetcher.mock.calls).toHaveLength(1);
    old.dispose();
    const next = new AssetStore();
    const fresh = next.json("/layout.json");
    const rejected = expect(fresh).rejects.toMatchObject({ name: "AbortError" });
    next.dispose(); await rejected;
    expect(fetcher.mock.calls).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles cancelled parsing and releases late GLTF geometry, materials and textures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(4))));
    const decoded = deferred<GLTF>();
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync").mockReturnValue(decoded.promise);
    const assets = new AssetStore();
    const pending = assets.gltf("/model.glb");
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    expect(parse).toHaveBeenCalledOnce();
    assets.dispose(); await cancelled;
    const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    const release = [geometry, material, material.map!].map((resource) => vi.spyOn(resource, "dispose"));
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(geometry, material));
    decoded.resolve({ scene, scenes: [scene] } as GLTF);
    await vi.advanceTimersByTimeAsync(0);
    for (const dispose of release) expect(dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles texture cancellation and disposes a late native decode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["image"]) })));
    const decoded = deferred<THREE.Texture<HTMLImageElement>>();
    const load = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockReturnValue(decoded.promise);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const assets = new AssetStore(), pending = assets.texture("/texture.webp");
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledOnce();
    assets.dispose(); await cancelled;
    const texture = new THREE.Texture<HTMLImageElement>(), dispose = vi.spyOn(texture, "dispose");
    decoded.resolve(texture); await vi.advanceTimersByTimeAsync(0);
    expect(dispose).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledOnce();
  });
});
