import type { Services } from "../engine/services";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { renderGround } from "./ground";
import { IslandSystem } from "./island-system";
import type { GroundService } from "./ground";
import type { EngineContext } from "../engine/types";

async function bakedGround(samples = [1, 2, 3, 4], fails = false) {
  let target: THREE.WebGLRenderTarget | null = null;
  const baked: THREE.WebGLRenderTarget[] = [];
  const disposed = vi.fn();
  const renderer = {
    getRenderTarget: () => target,
    getClearColor: (out: THREE.Color) => out.setRGB(0, 0, 0), getClearAlpha: () => 1,
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => {
      target = next;
      if (next && !baked.length) { baked.push(next); next.addEventListener("dispose", disposed); }
    },
    setClearColor: vi.fn(), clear: vi.fn(), render: vi.fn(),
    readRenderTargetPixelsAsync: async (_rt: THREE.WebGLRenderTarget, _x: number, _y: number, _w: number, _h: number, out: Float32Array) => {
      if (fails) throw new Error("readback failed");
      for (let i = 0; i < samples.length; i++) out[i * 4] = samples[i];
    },
  };
  const root = new THREE.Group(), parent = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 8, 2)));
  parent.add(root);
  let ground: GroundService;
  try { ground = await renderGround(renderer as unknown as THREE.WebGLRenderer, root, [0, 0, 2, 2], 2); }
  catch (error) {
    expect(root.parent).toBe(parent); expect(target).toBeNull(); expect(disposed).toHaveBeenCalledOnce();
    expect(renderer.setClearColor).toHaveBeenLastCalledWith(new THREE.Color(0, 0, 0), 1);
    throw error;
  }
  return { ground, disposed, texture: baked[0].texture, root, parent, target };
}

describe("ground render target ownership", () => {
  it("accepts valid flat samples without interpreting them as a failed readback", async () => {
    const { ground } = await bakedGround([0, 0, 0, 0]);
    expect(Array.from(ground.heights)).toEqual([0, 0, 0, 0]); ground.dispose();
  });

  it.each([[[], false], [[NaN, 1, 2, 3], false], [[5000, 1, 2, 3], false], [[1, 2, 3, 4], true]] as const)("rejects missing, nonfinite, out-of-bounds or failed readback (%s, %s)", async (samples, fails) => {
    await expect(bakedGround([...samples], fails)).rejects.toThrow("graphics-buffers");
  });
  it("keeps the exact baked texture alive after CPU extraction until its owner disposes", async () => {
    const { ground, disposed, texture, root, parent, target } = await bakedGround();
    expect(disposed).not.toHaveBeenCalled();
    expect(ground.texture).toBe(texture);
    expect(Array.from(ground.heights)).toEqual([1, 2, 3, 4]);
    expect(ground.heightAt(0.5, 1.5)).toBe(1);
    expect(ground.heightAt(1.5, 0.5)).toBe(4);
    expect(root.parent).toBe(parent);
    expect(target).toBeNull();
    ground.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it("lets IslandSystem release the target at teardown, not a consumer of its texture", async () => {
    const { ground, disposed } = await bakedGround();
    const island = new IslandSystem();
    Object.assign(island as unknown as { ground: GroundService }, { ground });
    const ctx = { scene: new THREE.Scene(), services: new Map([["ground", ground]]) as Services } as unknown as EngineContext;
    expect(disposed).not.toHaveBeenCalled();
    island.dispose(ctx);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(ctx.services.has("ground")).toBe(false);
  });
});

describe("asynchronous ground fence", () => {
  it.each([false, true])("restores renderer/parent before waiting and holds the target until its fence settles (abort %s)", async (abort) => {
    const controller = new AbortController(), parent = new THREE.Group(), root = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    parent.add(root);
    let target: THREE.WebGLRenderTarget | null = null, resolve!: () => void;
    const disposed = vi.fn(), clear = new THREE.Color(0.2, 0.3, 0.4);
    const renderer = {
      getRenderTarget: () => target, getClearColor: (color: THREE.Color) => color.copy(clear), getClearAlpha: () => 0.5,
      setRenderTarget: (rt: THREE.WebGLRenderTarget | null) => { if (rt) rt.addEventListener("dispose", disposed); target = rt; },
      setClearColor: vi.fn(), clear: vi.fn(), render: vi.fn(),
      readRenderTargetPixelsAsync: (_rt: unknown, _x: number, _y: number, _w: number, _h: number, out: Float32Array) => new Promise<void>((done) => { resolve = () => { out[0] = 0.25; done(); }; }),
    };
    const pending = renderGround(renderer as unknown as THREE.WebGLRenderer, root, [-1, -1, 1, 1], 1, controller.signal);
    const result = abort ? expect(pending).rejects.toMatchObject({ name: "AbortError" }) : null;
    expect(root.parent).toBe(parent); expect(target).toBeNull(); expect(disposed).not.toHaveBeenCalled();
    expect(renderer.setClearColor).toHaveBeenLastCalledWith(clear, 0.5);
    if (abort) { controller.abort(); expect(disposed).not.toHaveBeenCalled(); }
    resolve();
    if (abort) await result;
    else { const ground = await pending; expect(ground.heights[0]).toBe(0.25); expect(disposed).not.toHaveBeenCalled(); ground.dispose(); }
    expect(disposed).toHaveBeenCalledOnce(); root.geometry.dispose();
  });
});
