import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { ProgramPreparation } from "../engine/prepare";
import { createWorldUniforms } from "../engine/uniforms";
import { bakeCloudAtlas, CLOUD_CELLS } from "../sky/clouds";
import { bakeTexture } from "./gpu-bake";

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", globalThis); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function harness() {
  const previous = new THREE.WebGLRenderTarget(), controller = new AbortController();
  let target: THREE.WebGLRenderTarget | null = previous;
  const reflected = vi.fn(), draws: { target: THREE.WebGLRenderTarget; mipmaps: boolean; at: number }[] = [];
  const renderer = {
    autoClear: true, extensions: { has: () => false }, initTexture: vi.fn(),
    getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 3,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { target = next; }),
    compile: vi.fn(), properties: { get: () => ({ programs: new Map([[0, { getUniforms: reflected, getAttributes: reflected }]]) }) },
    render: vi.fn(() => {
      expect(reflected).toHaveBeenCalled();
      draws.push({ target: target!, mipmaps: target!.texture.generateMipmaps, at: Date.now() });
    }),
  };
  const ctx = { renderer, signal: controller.signal, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), uniforms: createWorldUniforms(), services: new Map() as Services } as unknown as EngineContext;
  const preparation = new ProgramPreparation(ctx); ctx.services.set("preparation", preparation);
  return { ctx, renderer, previous, controller, draws, preparation };
}

describe("prepared startup bakes", () => {
  it("prepares against the actual target, yields between cells and publishes only the complete atlas", async () => {
    const h = harness(); let published = false;
    const pending = bakeCloudAtlas(h.ctx).then((target) => { published = true; return target; });
    expect(h.renderer.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(32);
    expect(h.renderer.compile).toHaveBeenCalledOnce(); expect(h.renderer.render).not.toHaveBeenCalled();
    for (let i = 0; i < CLOUD_CELLS - 1; i++) {
      await vi.advanceTimersByTimeAsync(16);
      expect(h.draws).toHaveLength(i + 1); expect(published).toBe(false);
    }
    await vi.advanceTimersByTimeAsync(16);
    const atlas = await pending;
    expect(h.draws.map((d) => d.mipmaps)).toEqual(Array.from({ length: CLOUD_CELLS }, (_, i) => i === CLOUD_CELLS - 1));
    expect(new Set(h.draws.map((d) => d.at)).size).toBe(CLOUD_CELLS);
    expect(h.draws.every((d) => d.target === atlas)).toBe(true);
    expect(atlas.scissorTest).toBe(false); expect(atlas.viewport.toArray()).toEqual([0, 0, atlas.width, atlas.height]);
    expect(h.renderer.setRenderTarget).toHaveBeenLastCalledWith(h.previous, 2, 3); expect(h.renderer.autoClear).toBe(true);
    atlas.dispose(); h.preparation.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it("disposes an interrupted atlas and restores the renderer after a failed procedural draw", async () => {
    const h = harness(), pending = bakeCloudAtlas(h.ctx);
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(48);
    const partial = h.draws[0].target, dispose = vi.spyOn(partial, "dispose");
    h.controller.abort(); await cancelled;
    expect(dispose).toHaveBeenCalledOnce(); h.preparation.dispose();
    const other = harness(); other.renderer.render.mockImplementation(() => { throw new Error("draw failed"); });
    const failed = bakeTexture(other.ctx, "void main() { gl_FragColor = vec4(1.0); }", { width: 8, height: 8 });
    const failure = expect(failed).rejects.toThrow("draw failed");
    await vi.advanceTimersByTimeAsync(100); await failure;
    expect(other.renderer.getRenderTarget()).toBe(other.previous); expect(other.renderer.autoClear).toBe(true);
    other.preparation.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects publication when cancellation occurs inside the final draw", async () => {
    const h = harness();
    const render = h.renderer.render.getMockImplementation()!;
    h.renderer.render.mockImplementation(() => { render(); h.controller.abort(); });
    const pending = bakeTexture(h.ctx, "void main() { gl_FragColor = vec4(1.0); }", { width: 8, height: 8 });
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100); await cancelled;
    expect(h.draws).toHaveLength(1); expect(h.renderer.getRenderTarget()).toBe(h.previous);
    h.preparation.dispose();
  });
});
