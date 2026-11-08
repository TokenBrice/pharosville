import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { GraphicsValidity, probeGraphics } from "./graphics";

function harness(status = 1, read = true) {
  const old = new THREE.WebGLRenderTarget(), targets: THREE.WebGLRenderTarget[] = [];
  const disposed = vi.fn();
  let target = old;
  const renderer = {
    getContext: () => ({ FRAMEBUFFER: 0, FRAMEBUFFER_COMPLETE: 1, checkFramebufferStatus: () => status }),
    getRenderTarget: () => target,
    setRenderTarget: (next: THREE.WebGLRenderTarget) => {
      target = next;
      if (next !== old && !targets.includes(next)) { targets.push(next); next.addEventListener("dispose", disposed); }
    },
    getClearColor: (color: THREE.Color) => color.setRGB(0.1, 0.2, 0.3), getClearAlpha: () => 0.4,
    setClearColor: vi.fn(), clear: vi.fn(),
    readRenderTargetPixels: (_rt: unknown, _x: number, _y: number, _w: number, _h: number, out: Float32Array) => { if (read) out.set([0.25, 0.5, 0.75, 1]); },
  };
  return { renderer: renderer as unknown as THREE.WebGLRenderer, old, targets, disposed, target: () => target };
}

describe("required graphics validity", () => {
  it("probes exact float attachments/readback and releases every temporary target", () => {
    const h = harness(); probeGraphics(h.renderer);
    expect(h.targets.map((target) => [target.texture.format, target.texture.type, target.texture.minFilter])).toEqual([
      [THREE.RGBAFormat, THREE.HalfFloatType, THREE.LinearFilter],
      [THREE.RedFormat, THREE.HalfFloatType, THREE.LinearFilter],
      [THREE.RGBAFormat, THREE.FloatType, THREE.NearestFilter],
    ]);
    expect(h.disposed).toHaveBeenCalledTimes(3); expect(h.target()).toBe(h.old);
    expect(h.renderer.setClearColor).toHaveBeenLastCalledWith(new THREE.Color(0.1, 0.2, 0.3), 0.4);
  });
  it.each([[0, true], [1, false]])("rejects incomplete or unreadable buffers with cleanup (%s, %s)", (status, read) => {
    const h = harness(status, read);
    expect(() => probeGraphics(h.renderer)).toThrowError("graphics-buffers");
    expect(h.target()).toBe(h.old); expect(h.disposed).toHaveBeenCalledTimes(h.targets.length);
  });
  it("rejects an unpublished variant without invalidating the current world, but latches active failures", () => {
    const graphics = new GraphicsValidity();
    expect(() => graphics.checkPreparation(() => graphics.onShaderError())).toThrowError("shader");
    expect(() => graphics.assertValid()).not.toThrow();
    graphics.onShaderError();
    expect(() => graphics.assertValid()).toThrowError("shader");
    expect(() => graphics.checkPreparation(() => {})).toThrowError("shader");
  });
});
