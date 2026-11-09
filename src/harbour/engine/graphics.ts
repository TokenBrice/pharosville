import * as THREE from "three";
import type { EngineContext } from "./types";
import { BootFailure } from "./failure";

/** Preparation failures reject that unpublished batch; active draw/bake failures latch the owner. */
export class GraphicsValidity {
  private failed = false;
  private preparing = false;
  private preparationFailed = false;
  readonly onShaderError = () => { if (this.preparing) this.preparationFailed = true; else this.failed = true; };
  assertValid(): void { if (this.failed) throw new BootFailure("shader"); }
  checkPreparation<T>(work: () => T): T {
    this.assertValid();
    this.preparing = true; this.preparationFailed = false;
    try {
      const value = work();
      if (this.preparationFailed) throw new BootFailure("shader");
      return value;
    } finally { this.preparing = false; }
  }
}

export function graphicsValidity(ctx: EngineContext): GraphicsValidity | undefined {
  return ctx.services.get("graphics-validity");
}

/** Probe only formats actually used by the harbour; no recurring GL queries. */
export function probeGraphics(renderer: THREE.WebGLRenderer): void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const previous = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  try {
    for (const [format, type, filter] of [
      [THREE.RGBAFormat, THREE.HalfFloatType, THREE.LinearFilter],
      [THREE.RedFormat, THREE.HalfFloatType, THREE.LinearFilter],
      [THREE.RGBAFormat, THREE.FloatType, THREE.NearestFilter],
    ] as const) {
      const target = new THREE.WebGLRenderTarget(1, 1, { format, type, minFilter: filter, magFilter: filter, depthBuffer: false });
      try {
        renderer.setRenderTarget(target);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new BootFailure("graphics-buffers");
        renderer.setClearColor(new THREE.Color(0.25, 0.5, 0.75), 1); renderer.clear();
        if (type === THREE.FloatType) {
          const sample = new Float32Array(4).fill(NaN);
          renderer.readRenderTargetPixels(target, 0, 0, 1, 1, sample);
          if (![0.25, 0.5, 0.75, 1].every((value, i) => Math.abs(value - sample[i]) < 0.001)) throw new BootFailure("graphics-buffers");
        }
      } finally { renderer.setRenderTarget(previous); target.dispose(); }
    }
  } catch (cause) { throw new BootFailure("graphics-buffers", { cause }); }
  finally { renderer.setRenderTarget(previous); renderer.setClearColor(clear, alpha); }
}
