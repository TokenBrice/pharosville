import { afterEach, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { deferred } from "../engine/deferred";
import { loadSdfImage } from "./sdf-image";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("settles an aborted SDF decode, releases a late bitmap and never publishes its pixels", async () => {
  vi.useFakeTimers();
  const decoded = deferred<ImageBitmap>(), controller = new AbortController();
  const ctx = { services: new Map(), signal: controller.signal } as unknown as EngineContext;
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
