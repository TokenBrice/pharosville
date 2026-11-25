import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneCapture } from "./scene-capture";

interface MockGlOptions {
  scissorEnabled?: boolean;
  glError?: number;
  srcDepthType?: number;
  srcDepthBits?: number;
  dstDepthBits?: number;
  throwOnBlit?: boolean;
}

function makeMockEnv(opts: MockGlOptions = {}) {
  const srcFbo = { id: "src-fbo" } as unknown as WebGLFramebuffer;
  const srcMsaaFbo = { id: "src-msaa-fbo" } as unknown as WebGLFramebuffer;
  const dstFbo = { id: "dst-fbo" } as unknown as WebGLFramebuffer;
  const dstTex = { id: "dst-tex" } as unknown as WebGLTexture;

  let scissorEnabled = opts.scissorEnabled ?? false;
  let boundRead: WebGLFramebuffer | null = null;
  let boundDraw: WebGLFramebuffer | null = srcFbo;
  const events: string[] = [];

  const GL = {
    READ_FRAMEBUFFER: 0x8ca8,
    DRAW_FRAMEBUFFER: 0x8ca9,
    FRAMEBUFFER: 0x8d40,
    DRAW_FRAMEBUFFER_BINDING: 0x8ca6,
    SCISSOR_TEST: 0x0c11,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    TEXTURE_2D: 0x0de1,
    DEPTH_ATTACHMENT: 0x8d00,
    FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: 0x8cd0,
    FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE: 0x8216,
    RENDERBUFFER: 0x8d41,
    NONE: 0,
    NO_ERROR: 0,
    INVALID_OPERATION: 0x0502,
  };

  const gl = {
    ...GL,
    isEnabled: vi.fn((cap: number) => (cap === GL.SCISSOR_TEST ? scissorEnabled : false)),
    disable: vi.fn((cap: number) => {
      if (cap === GL.SCISSOR_TEST) {
        scissorEnabled = false;
        events.push("disable:SCISSOR");
      }
    }),
    enable: vi.fn((cap: number) => {
      if (cap === GL.SCISSOR_TEST) {
        scissorEnabled = true;
        events.push("enable:SCISSOR");
      }
    }),
    bindFramebuffer: vi.fn(() => {
      events.push("raw:bindFramebuffer");
    }),
    blitFramebuffer: vi.fn((...args: unknown[]) => {
      events.push(`blit:${args[8]}:${args[9]}`);
      if (opts.throwOnBlit) throw new Error("blit boom");
    }),
    generateMipmap: vi.fn(() => {
      events.push("generateMipmap");
    }),
    getParameter: vi.fn((p: number) => (p === GL.DRAW_FRAMEBUFFER_BINDING ? boundDraw : null)),
    getFramebufferAttachmentParameter: vi.fn((target: number, _att: number, pname: number) => {
      if (pname === GL.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE) {
        return target === GL.READ_FRAMEBUFFER ? (opts.srcDepthType ?? GL.RENDERBUFFER) : GL.RENDERBUFFER;
      }
      if (pname === GL.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE) {
        return target === GL.READ_FRAMEBUFFER ? (opts.srcDepthBits ?? 24) : (opts.dstDepthBits ?? 24);
      }
      return 0;
    }),
    getError: vi.fn(() => opts.glError ?? GL.NO_ERROR),
  };

  const propMap = new WeakMap<object, Record<string, unknown>>();
  const properties = {
    get(obj: object) {
      let entry = propMap.get(obj);
      if (!entry) {
        entry = {};
        propMap.set(obj, entry);
      }
      return entry;
    },
  };

  const state = {
    bindFramebuffer: vi.fn((target: number, fbo: WebGLFramebuffer | null) => {
      if (target === GL.READ_FRAMEBUFFER) {
        boundRead = fbo;
        events.push(`state.bindFbo:READ:${fbo ? (fbo as unknown as { id: string }).id : "null"}`);
      } else {
        boundDraw = fbo;
        events.push(`state.bindFbo:DRAW:${fbo ? (fbo as unknown as { id: string }).id : "null"}`);
      }
      return true;
    }),
    bindTexture: vi.fn((_type: number, _tex: WebGLTexture | null) => {
      events.push("state.bindTexture");
    }),
    unbindTexture: vi.fn(() => {
      events.push("state.unbindTexture");
    }),
    setScissorTest: vi.fn((enabled: boolean) => {
      events.push(`state.setScissorTest:${enabled}`);
      scissorEnabled = enabled;
    }),
    reset: vi.fn(() => {
      events.push("state.reset");
    }),
  };

  const initRenderTarget = vi.fn((rt: THREE.WebGLRenderTarget) => {
    events.push(`initRenderTarget:${rt.width}x${rt.height}`);
    const p = properties.get(rt);
    p.__webglFramebuffer = dstFbo;
    const tp = properties.get(rt.texture);
    tp.__webglTexture = dstTex;
    boundDraw = dstFbo;
    boundRead = dstFbo;
  });

  const setRenderTarget = vi.fn((rt: THREE.WebGLRenderTarget | null) => {
    events.push(`setRenderTarget:${rt ? "target" : "null"}`);
    if (rt) {
      const p = properties.get(rt);
      const fbo = (rt.samples > 0 ? p.__webglMultisampledFramebuffer : p.__webglFramebuffer) as WebGLFramebuffer | null;
      // Three.js r186 binds gl.FRAMEBUFFER (which binds BOTH READ and DRAW in WebGL) and applies rt.scissorTest
      boundDraw = fbo;
      boundRead = fbo;
      scissorEnabled = rt.scissorTest;
    } else {
      boundDraw = null;
      boundRead = null;
      scissorEnabled = false;
    }
  });

  const renderer = {
    getContext: () => gl,
    properties,
    state,
    initRenderTarget,
    setRenderTarget,
  } as unknown as THREE.WebGLRenderer;

  const source = new THREE.WebGLRenderTarget(1200, 800, { depthBuffer: true, stencilBuffer: false });
  const srcProps = properties.get(source);
  srcProps.__webglFramebuffer = srcFbo;
  srcProps.__webglMultisampledFramebuffer = srcMsaaFbo;

  const camera = new THREE.PerspectiveCamera(45, 1.5, 5, 9000);
  camera.position.set(100, 80, 120);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  return {
    gl,
    renderer,
    source,
    camera,
    state,
    events,
    srcFbo,
    srcMsaaFbo,
    dstFbo,
    dstTex,
    properties,
    getBoundRead: () => boundRead,
    getBoundDraw: () => boundDraw,
    getScissor: () => scissorEnabled,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SceneCapture (C1 WebGL2 FBO-cache-safe opaque capture)", () => {
  it("full-res capture uses single COLOR|DEPTH NEAREST blit via renderer.state.bindFramebuffer, generates mips, and restores FBO + SCISSOR_TEST", () => {
    const env = makeMockEnv({ scissorEnabled: true });
    const cap = new SceneCapture();

    expect(cap.uniforms.uCapReady.value).toBe(0);
    cap.capture(env.renderer, env.source, env.camera, false, true);

    expect(cap.uniforms.uCapReady.value).toBe(1);
    expect(cap.target?.width).toBe(1200);
    expect(cap.target?.height).toBe(800);
    expect(cap.target?.texture.name).toBe("SceneCapture.Color");
    expect(cap.target?.depthTexture?.name).toBe("SceneCapture.Depth");
    expect(cap.target?.texture.generateMipmaps).toBe(true);
    expect(cap.target?.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);

    // Never calls raw gl.bindFramebuffer or renderer.state.reset()
    expect(env.gl.bindFramebuffer).not.toHaveBeenCalled();
    expect(env.state.reset).not.toHaveBeenCalled();

    // Single combined COLOR|DEPTH NEAREST blit at full-res
    expect(env.gl.blitFramebuffer).toHaveBeenCalledTimes(1);
    expect(env.gl.blitFramebuffer).toHaveBeenCalledWith(
      0, 0, 1200, 800,
      0, 0, 1200, 800,
      env.gl.COLOR_BUFFER_BIT | env.gl.DEPTH_BUFFER_BIT,
      env.gl.NEAREST,
    );

    // Mip generation went through renderer.state texture tracking
    expect(env.state.bindTexture).toHaveBeenCalledWith(env.gl.TEXTURE_2D, env.dstTex);
    expect(env.gl.generateMipmap).toHaveBeenCalledWith(env.gl.TEXTURE_2D);
    expect(env.state.unbindTexture).toHaveBeenCalledTimes(1);

    // Cleanly restored source RT FIRST, then unbound READ_FRAMEBUFFER and restored SCISSOR_TEST via Three state
    expect(env.getBoundRead()).toBeNull();
    expect(env.getBoundDraw()).toBe(env.srcFbo);
    expect(env.gl.getParameter(env.gl.DRAW_FRAMEBUFFER_BINDING)).toBe(env.srcFbo);
    expect(env.getScissor()).toBe(true);
    expect(env.renderer.setRenderTarget).toHaveBeenCalledWith(env.source);
    const rtIdx = env.events.lastIndexOf("setRenderTarget:target");
    const readNullIdx = env.events.lastIndexOf("state.bindFbo:READ:null");
    const scissorOnIdx = env.events.lastIndexOf("state.setScissorTest:true");
    expect(rtIdx).toBeGreaterThan(-1);
    expect(readNullIdx).toBeGreaterThan(rtIdx);
    expect(scissorOnIdx).toBeGreaterThan(rtIdx);

    // Uniforms reflect exact source backing dimensions, near/far, and inverse VP
    expect(cap.uniforms.uCapColor.value).toBe(cap.target!.texture);
    expect(cap.uniforms.uCapDepth.value).toBe(cap.target!.depthTexture);
    expect(cap.uniforms.uCapSize.value.toArray()).toEqual([1200, 800]);
    expect(cap.uniforms.uCapNearFar.value.toArray()).toEqual([5, 9000]);

    const expectedInvVP = new THREE.Matrix4()
      .multiplyMatrices(env.camera.projectionMatrix, env.camera.matrixWorldInverse)
      .invert();
    for (let i = 0; i < 16; i++) {
      expect(cap.uniforms.uCapInvVP.value.elements[i]).toBeCloseTo(expectedInvVP.elements[i], 6);
    }

    cap.dispose();
    env.source.dispose();
  });

  it("half-res non-MSAA capture uses single depth-consistent NEAREST COLOR|DEPTH blit and keeps uCapSize at full source pixels", () => {
    const env = makeMockEnv({ scissorEnabled: false });
    const cap = new SceneCapture();

    cap.capture(env.renderer, env.source, env.camera, true, false);

    expect(cap.uniforms.uCapReady.value).toBe(1);
    expect(cap.target?.width).toBe(600);
    expect(cap.target?.height).toBe(400);
    expect(cap.target?.texture.generateMipmaps).toBe(false);
    expect(cap.target?.texture.minFilter).toBe(THREE.LinearFilter);
    expect(env.gl.generateMipmap).not.toHaveBeenCalled();

    // SCISSOR_TEST was off -> stays off via renderer.state.setScissorTest(false)
    expect(env.getScissor()).toBe(false);

    // Single NEAREST COLOR|DEPTH blit keeps color & depth texel-aligned across above-water silhouettes
    expect(env.gl.blitFramebuffer).toHaveBeenCalledTimes(1);
    expect(env.gl.blitFramebuffer).toHaveBeenCalledWith(
      0, 0, 1200, 800, 0, 0, 600, 400, env.gl.COLOR_BUFFER_BIT | env.gl.DEPTH_BUFFER_BIT, env.gl.NEAREST,
    );

    // uCapSize stays at exact source backing pixels so gl_FragCoord.xy / uCapSize is exact
    expect(cap.uniforms.uCapSize.value.toArray()).toEqual([1200, 800]);
    expect(env.getBoundDraw()).toBe(env.srcFbo);
    expect(env.getBoundRead()).toBeNull();

    cap.dispose();
    env.source.dispose();
  });

  it("MSAA source binds __webglMultisampledFramebuffer and performs a same-size single NEAREST COLOR|DEPTH blit", () => {
    const env = makeMockEnv();
    env.source.samples = 4;
    const cap = new SceneCapture();

    cap.capture(env.renderer, env.source, env.camera, true, false);

    expect(cap.uniforms.uCapReady.value).toBe(1);
    expect(cap.target?.width).toBe(1200);
    expect(cap.target?.height).toBe(800);
    expect(env.state.bindFramebuffer).toHaveBeenCalledWith(env.gl.READ_FRAMEBUFFER, env.srcMsaaFbo);
    expect(env.gl.blitFramebuffer).toHaveBeenCalledTimes(1);
    expect(env.gl.blitFramebuffer).toHaveBeenCalledWith(
      0, 0, 1200, 800,
      0, 0, 1200, 800,
      env.gl.COLOR_BUFFER_BIT | env.gl.DEPTH_BUFFER_BIT,
      env.gl.NEAREST,
    );
    expect(env.getBoundDraw()).toBe(env.srcMsaaFbo);

    cap.dispose();
    env.source.dispose();
  });

  it("re-reads source FBO handle every frame without caching stale handles", () => {
    const env = makeMockEnv();
    const cap = new SceneCapture();

    cap.capture(env.renderer, env.source, env.camera, false, false);
    expect(env.state.bindFramebuffer).toHaveBeenCalledWith(env.gl.READ_FRAMEBUFFER, env.srcFbo);

    const recreatedFbo = { id: "src-fbo-2" } as unknown as WebGLFramebuffer;
    env.properties.get(env.source).__webglFramebuffer = recreatedFbo;

    cap.capture(env.renderer, env.source, env.camera, false, false);
    expect(env.state.bindFramebuffer).toHaveBeenCalledWith(env.gl.READ_FRAMEBUFFER, recreatedFbo);
    expect(env.getBoundDraw()).toBe(recreatedFbo);

    cap.dispose();
    env.source.dispose();
  });

  it("falls back safely to uCapReady = 0 on invalid source, depth mismatch, or WebGL error while still restoring FBO & SCISSOR_TEST", () => {
    const envErr = makeMockEnv({ scissorEnabled: true, glError: 0x0502 });
    const cap = new SceneCapture();
    cap.capture(envErr.renderer, envErr.source, envErr.camera, false, false);
    expect(cap.uniforms.uCapReady.value).toBe(0);
    expect(envErr.getScissor()).toBe(true);
    expect(envErr.getBoundRead()).toBeNull();
    expect(envErr.getBoundDraw()).toBe(envErr.srcFbo);
    expect(envErr.renderer.setRenderTarget).toHaveBeenCalledWith(envErr.source);

    const envMismatch = makeMockEnv({ scissorEnabled: true, srcDepthBits: 16, dstDepthBits: 24 });
    const cap2 = new SceneCapture();
    cap2.capture(envMismatch.renderer, envMismatch.source, envMismatch.camera, false, false);
    expect(cap2.uniforms.uCapReady.value).toBe(0);
    expect(envMismatch.gl.blitFramebuffer).not.toHaveBeenCalled();
    expect(envMismatch.getScissor()).toBe(true);
    expect(envMismatch.renderer.setRenderTarget).toHaveBeenCalledWith(envMismatch.source);

    const envNoDepth = makeMockEnv();
    const noDepthSource = new THREE.WebGLRenderTarget(100, 100, { depthBuffer: false });
    cap2.capture(envNoDepth.renderer, noDepthSource, envNoDepth.camera, false, false);
    expect(cap2.uniforms.uCapReady.value).toBe(0);

    cap.dispose();
    cap2.dispose();
    envErr.source.dispose();
    envMismatch.source.dispose();
    envNoDepth.source.dispose();
    noDepthSource.dispose();
  });

  it("disposes captureRT, depthTexture, and fallbacks cleanly and resets uCapReady to 0", () => {
    const env = makeMockEnv();
    const cap = new SceneCapture();
    cap.capture(env.renderer, env.source, env.camera, false, true);
    expect(cap.uniforms.uCapReady.value).toBe(1);

    const rtDispose = vi.spyOn(cap.target!, "dispose");
    const depthDispose = vi.spyOn(cap.target!.depthTexture!, "dispose");

    cap.dispose();
    expect(rtDispose).toHaveBeenCalledTimes(1);
    expect(depthDispose).toHaveBeenCalledTimes(1);
    expect(cap.target).toBeNull();
    expect(cap.uniforms.uCapReady.value).toBe(0);

    // Subsequent capture after dispose is a safe no-op
    cap.capture(env.renderer, env.source, env.camera, false, true);
    expect(cap.uniforms.uCapReady.value).toBe(0);
    expect(cap.target).toBeNull();

    env.source.dispose();
  });

  it("mirrors source FloatType depthTexture format/type so DEPTH_COMPONENT32F blits match postprocessing EffectComposer", () => {
    const env = makeMockEnv({ srcDepthBits: 32, dstDepthBits: 32 });
    const srcDepth = new THREE.DepthTexture(1200, 800, THREE.FloatType);
    srcDepth.format = THREE.DepthFormat;
    env.source.depthTexture = srcDepth;

    const cap = new SceneCapture();
    cap.capture(env.renderer, env.source, env.camera, false, false);

    expect(cap.uniforms.uCapReady.value).toBe(1);
    expect(cap.target?.depthTexture?.type).toBe(THREE.FloatType);
    expect(cap.target?.depthTexture?.format).toBe(THREE.DepthFormat);
    expect(env.gl.blitFramebuffer).toHaveBeenCalledTimes(1);

    cap.dispose();
    srcDepth.dispose();
    env.source.dispose();
  });

  it("releases captureRT on rescue rungs (DPR < 0.8) and reallocates cleanly when capture resumes", () => {
    const env = makeMockEnv();
    const cap = new SceneCapture();
    cap.capture(env.renderer, env.source, env.camera, false, false);
    expect(cap.uniforms.uCapReady.value).toBe(1);
    const firstRt = cap.target!;
    const rtDispose = vi.spyOn(firstRt, "dispose");
    const depthDispose = vi.spyOn(firstRt.depthTexture!, "dispose");

    cap.release();
    expect(rtDispose).toHaveBeenCalledTimes(1);
    expect(depthDispose).toHaveBeenCalledTimes(1);
    expect(cap.target).toBeNull();
    expect(cap.uniforms.uCapReady.value).toBe(0);
    expect(cap.uniforms.uCapColor.value).not.toBe(firstRt.texture);
    expect(cap.uniforms.uCapDepth.value).not.toBe(firstRt.depthTexture);

    // Resuming capture after leaving rescue rung reallocates cleanly
    cap.capture(env.renderer, env.source, env.camera, true, false);
    expect(cap.uniforms.uCapReady.value).toBe(1);
    expect(cap.target).not.toBeNull();
    expect(cap.target).not.toBe(firstRt);
    expect([cap.target!.width, cap.target!.height]).toEqual([600, 400]);

    cap.dispose();
    env.source.dispose();
  });
});
