import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { renderGround } from "./ground";
import { IslandSystem } from "./island-system";
import type { GroundService } from "./ground";
import type { EngineContext } from "../engine/types";

function bakedGround() {
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
    readRenderTargetPixels: (_rt: THREE.WebGLRenderTarget, _x: number, _y: number, _w: number, _h: number, out: Float32Array) => {
      for (let i = 0; i < 4; i++) out[i * 4] = i + 1;
    },
  };
  const root = new THREE.Group(), parent = new THREE.Group();
  parent.add(root);
  const ground = renderGround(renderer as unknown as THREE.WebGLRenderer, root, [0, 0, 2, 2], 2);
  return { ground, disposed, texture: baked[0].texture, root, parent, target };
}

describe("ground render target ownership", () => {
  it("keeps the exact baked texture alive after CPU extraction until its owner disposes", () => {
    const { ground, disposed, texture, root, parent, target } = bakedGround();
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

  it("lets IslandSystem release the target at teardown, not a consumer of its texture", () => {
    const { ground, disposed } = bakedGround();
    const island = new IslandSystem();
    Object.assign(island as unknown as { ground: GroundService }, { ground });
    const ctx = { scene: new THREE.Scene(), services: new Map([["ground", ground]]) } as unknown as EngineContext;
    expect(disposed).not.toHaveBeenCalled();
    island.dispose(ctx);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(ctx.services.has("ground")).toBe(false);
  });
});
