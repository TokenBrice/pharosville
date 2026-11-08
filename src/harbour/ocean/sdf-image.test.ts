import { afterEach, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { deferred } from "../engine/deferred";
import { AssetStore } from "../engine/assets";
import { loadSdfImage } from "./sdf-image";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("caches each URL and null result with its asset owner, then clears the cache on disposal", async () => {
  const fetcher = vi.fn(async () => ({ ok: false }));
  vi.stubGlobal("fetch", fetcher);
  const assets = new AssetStore(), other = new AssetStore();
  const ctx = { assets } as EngineContext, next = { assets: other } as EngineContext;
  const pending = loadSdfImage(ctx, "/sdf.webp");
  expect(loadSdfImage(ctx, "/sdf.webp")).toBe(pending);
  expect(loadSdfImage({ ...ctx, services: new Map() }, "/sdf.webp")).toBe(pending);
  expect(loadSdfImage(ctx, "/other.webp")).not.toBe(pending);
  const fresh = loadSdfImage(next, "/sdf.webp");
  expect(fresh).not.toBe(pending);
  await expect(pending).resolves.toBeNull(); await fresh;
  expect(loadSdfImage(ctx, "/sdf.webp")).toBe(pending);
  expect(fetcher).toHaveBeenCalledTimes(3);
  assets.dispose(); other.dispose();
  expect(assets.sdfImages.size).toBe(0); expect(other.sdfImages.size).toBe(0);
});

it("shares the same decoded pixels between consumers", async () => {
  const assets = new AssetStore(), ctx = { assets } as EngineContext;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers({ "content-type": "image/webp" }), blob: async () => new Blob() })));
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close })));
  vi.stubGlobal("OffscreenCanvas", class {
    getContext() { return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 4]) }) }; }
  });
  const image = await loadSdfImage(ctx, "/sdf.webp");
  expect(image).toEqual({ data: new Uint8Array([1, 2, 3, 4]), coast: new Uint8Array([1]), width: 1, height: 1 });
  expect(await loadSdfImage(ctx, "/sdf.webp")).toBe(image);
  expect(createImageBitmap).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  assets.dispose();
});

it("settles an aborted SDF decode, releases a late bitmap and never publishes its pixels", async () => {
  vi.useFakeTimers();
  const decoded = deferred<ImageBitmap>(), controller = new AbortController();
  const ctx = { assets: new AssetStore(controller.signal), signal: controller.signal } as unknown as EngineContext;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: new Headers({ "content-type": "image/webp" }), blob: async () => new Blob() })));
  vi.stubGlobal("createImageBitmap", vi.fn(() => decoded.promise));
  const canvas = vi.fn(); vi.stubGlobal("OffscreenCanvas", canvas);
  const pending = loadSdfImage(ctx, "/sdf.webp");
  expect(loadSdfImage(ctx, "/sdf.webp")).toBe(pending);
  const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  expect(createImageBitmap).toHaveBeenCalledOnce();
  controller.abort(); await cancelled;
  const close = vi.fn(); decoded.resolve({ close } as unknown as ImageBitmap);
  await vi.advanceTimersByTimeAsync(0);
  expect(close).toHaveBeenCalledOnce(); expect(canvas).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
