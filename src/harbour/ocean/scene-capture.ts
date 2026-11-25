import * as THREE from "three";

export interface SceneCaptureUniforms {
  uCapColor: THREE.IUniform<THREE.Texture>;
  uCapDepth: THREE.IUniform<THREE.Texture>;
  uCapReady: THREE.IUniform<number>;
  uCapInvVP: THREE.IUniform<THREE.Matrix4>;
  uCapNearFar: THREE.IUniform<THREE.Vector2>;
  uCapSize: THREE.IUniform<THREE.Vector2>;
}

interface RenderTargetProps {
  __webglFramebuffer?: WebGLFramebuffer | WebGLFramebuffer[];
  __webglMultisampledFramebuffer?: WebGLFramebuffer;
}

interface TextureProps {
  __webglTexture?: WebGLTexture;
}

function resolveFbo(fbo: WebGLFramebuffer | WebGLFramebuffer[] | undefined): WebGLFramebuffer | null {
  if (!fbo) return null;
  return Array.isArray(fbo) ? (fbo[0] ?? null) : fbo;
}

/**
 * Zero-lag WebGL2 opaque scene color + depth capture right before the ocean draws.
 *
 * Strictly preserves Three.js r186's internal framebuffer cache (C1):
 * - Always binds READ_FRAMEBUFFER / DRAW_FRAMEBUFFER through renderer.state.bindFramebuffer.
 * - Never calls raw gl.bindFramebuffer or renderer.state.reset().
 * - Re-reads source/destination FBO handles from renderer.properties every frame.
 * - Restores SCISSOR_TEST, unbinds READ_FRAMEBUFFER, and restores source via renderer.setRenderTarget(source).
 */
export class SceneCapture {
  private readonly fallbackColor: THREE.DataTexture;
  private readonly fallbackDepth: THREE.DataTexture;
  readonly uniforms: SceneCaptureUniforms;

  private captureRT: THREE.WebGLRenderTarget | null = null;
  private rtInitialized = false;
  private genMips = false;
  private depthType: THREE.TextureDataType = THREE.UnsignedIntType;
  private depthFormat: THREE.DepthTexturePixelFormat = THREE.DepthFormat;
  private lastSrcFbo: WebGLFramebuffer | null = null;
  private depthCompatible = true;
  private disposed = false;
  private devWarnedMismatch = false;
  private readonly tmpMat = new THREE.Matrix4();

  constructor() {
    this.fallbackColor = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.fallbackColor.needsUpdate = true;
    this.fallbackDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.fallbackDepth.needsUpdate = true;
    this.uniforms = {
      uCapColor: { value: this.fallbackColor },
      uCapDepth: { value: this.fallbackDepth },
      uCapReady: { value: 0 },
      uCapInvVP: { value: new THREE.Matrix4() },
      uCapNearFar: { value: new THREE.Vector2(1, 10000) },
      uCapSize: { value: new THREE.Vector2(1, 1) },
    };
  }

  /** Current internal capture target (null before first allocate/resize or after dispose). */
  get target(): THREE.WebGLRenderTarget | null {
    return this.captureRT;
  }

  resize(
    width: number,
    height: number,
    halfRes: boolean,
    genMips: boolean,
    depthType: THREE.TextureDataType = THREE.UnsignedIntType,
    depthFormat: THREE.DepthTexturePixelFormat = THREE.DepthFormat,
  ): void {
    if (this.disposed) return;
    const dstW = halfRes ? Math.max(1, width >> 1) : Math.max(1, width);
    const dstH = halfRes ? Math.max(1, height >> 1) : Math.max(1, height);
    if (
      this.captureRT &&
      this.captureRT.width === dstW &&
      this.captureRT.height === dstH &&
      this.genMips === genMips &&
      this.depthType === depthType &&
      this.depthFormat === depthFormat
    ) {
      return;
    }

    if (this.captureRT) {
      this.captureRT.depthTexture?.dispose();
      this.captureRT.dispose();
      this.captureRT = null;
    }

    const depthTexture = new THREE.DepthTexture(dstW, dstH, depthType);
    depthTexture.format = depthFormat;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;
    depthTexture.generateMipmaps = false;
    depthTexture.wrapS = THREE.ClampToEdgeWrapping;
    depthTexture.wrapT = THREE.ClampToEdgeWrapping;
    depthTexture.name = "SceneCapture.Depth";

    const rt = new THREE.WebGLRenderTarget(dstW, dstH, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: depthFormat === THREE.DepthStencilFormat,
      depthTexture,
      minFilter: genMips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: genMips,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    rt.texture.name = "SceneCapture.Color";

    this.captureRT = rt;
    this.rtInitialized = false;
    this.genMips = genMips;
    this.depthType = depthType;
    this.depthFormat = depthFormat;
    this.lastSrcFbo = null;
    this.depthCompatible = true;
    this.resetReady();
  }

  capture(
    renderer: THREE.WebGLRenderer,
    source: THREE.WebGLRenderTarget | null | undefined,
    camera: THREE.PerspectiveCamera,
    halfRes: boolean,
    genMips: boolean,
  ): void {
    if (this.disposed || !source || !source.depthBuffer || source.width <= 0 || source.height <= 0) {
      this.resetReady();
      return;
    }

    const gl = renderer.getContext() as WebGL2RenderingContext;
    // WebGL2 requires identical src/dst rects when blitting from a multisampled read framebuffer.
    const isMsaa = source.samples > 0;
    const effectiveHalfRes = halfRes && !isMsaa;
    const dstW = effectiveHalfRes ? Math.max(1, source.width >> 1) : source.width;
    const dstH = effectiveHalfRes ? Math.max(1, source.height >> 1) : source.height;
    // Mirror source depth attachment type/format (e.g. postprocessing FloatType DEPTH_COMPONENT32F) so WebGL2 blitFramebuffer matches identically.
    const srcDepthTex = source.depthTexture;
    const wantDepthFormat: THREE.DepthTexturePixelFormat =
      srcDepthTex && (srcDepthTex.format === THREE.DepthFormat || srcDepthTex.format === THREE.DepthStencilFormat)
        ? srcDepthTex.format
        : source.stencilBuffer
          ? THREE.DepthStencilFormat
          : THREE.DepthFormat;
    const wantDepthType: THREE.TextureDataType =
      srcDepthTex?.type ??
      (wantDepthFormat === THREE.DepthStencilFormat ? THREE.UnsignedInt248Type : THREE.UnsignedIntType);

    if (
      !this.captureRT ||
      this.captureRT.width !== dstW ||
      this.captureRT.height !== dstH ||
      this.genMips !== genMips ||
      this.depthType !== wantDepthType ||
      this.depthFormat !== wantDepthFormat
    ) {
      this.resize(source.width, source.height, effectiveHalfRes, genMips, wantDepthType, wantDepthFormat);
    }

    const rt = this.captureRT!;
    const props = renderer.properties;
    let dstProps = props.get(rt) as RenderTargetProps | undefined;
    let initializedNow = false;
    if (!this.rtInitialized || !resolveFbo(dstProps?.__webglFramebuffer)) {
      renderer.initRenderTarget(rt);
      this.rtInitialized = true;
      initializedNow = true;
      dstProps = props.get(rt) as RenderTargetProps | undefined;
    }

    const srcProps = props.get(source) as RenderTargetProps | undefined;
    const srcFbo = isMsaa
      ? (srcProps?.__webglMultisampledFramebuffer ?? resolveFbo(srcProps?.__webglFramebuffer))
      : resolveFbo(srcProps?.__webglFramebuffer);
    const dstFbo = resolveFbo(dstProps?.__webglFramebuffer);

    if (!srcFbo || !dstFbo) {
      if (initializedNow) renderer.setRenderTarget(source);
      this.resetReady();
      return;
    }

    const fboChanged = this.lastSrcFbo !== srcFbo;
    if (!fboChanged && !this.depthCompatible) {
      if (initializedNow) renderer.setRenderTarget(source);
      this.resetReady();
      return;
    }

    if (fboChanged) {
      this.lastSrcFbo = srcFbo;
      this.depthCompatible = wantDepthFormat === THREE.DepthStencilFormat || !source.stencilBuffer;
      if (!this.depthCompatible) {
        if (initializedNow) renderer.setRenderTarget(source);
        this.resetReady();
        return;
      }
    }

    const wasScissor = gl.isEnabled(gl.SCISSOR_TEST);
    let ok = false;
    try {
      if (wasScissor) {
        if (typeof renderer.state.setScissorTest === "function") renderer.state.setScissorTest(false);
        else gl.disable(gl.SCISSOR_TEST);
      }
      renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFbo);
      renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dstFbo);

      if (fboChanged && typeof gl.getFramebufferAttachmentParameter === "function") {
        const srcDepthType = gl.getFramebufferAttachmentParameter(
          gl.READ_FRAMEBUFFER,
          gl.DEPTH_ATTACHMENT,
          gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE,
        );
        if (srcDepthType === gl.NONE) {
          this.depthCompatible = false;
        } else {
          const srcDepthBits = gl.getFramebufferAttachmentParameter(
            gl.READ_FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE,
          );
          const dstDepthBits = gl.getFramebufferAttachmentParameter(
            gl.DRAW_FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE,
          );
          if (
            typeof srcDepthBits === "number" &&
            typeof dstDepthBits === "number" &&
            srcDepthBits > 0 &&
            dstDepthBits > 0 &&
            srcDepthBits !== dstDepthBits
          ) {
            this.depthCompatible = false;
          }
        }
      }

      if (this.depthCompatible) {
        // Drain any unrelated prior GL errors once when probing a new FBO pair so we only catch blit errors.
        if (fboChanged && typeof gl.getError === "function") {
          for (let guard = 0; guard < 4; guard++) {
            const pre = gl.getError();
            if (pre === gl.NO_ERROR || pre === 0 || pre === undefined) break;
          }
        }
        const srcW = source.width;
        const srcH = source.height;
        // Single NEAREST COLOR|DEPTH blit for both full-res, MSAA, and half-res keeps color and depth
        // texel-aligned across above-water sail/quay silhouettes (no 2x2 LINEAR foreground bleed).
        gl.blitFramebuffer(
          0, 0, srcW, srcH,
          0, 0, dstW, dstH,
          gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
          gl.NEAREST,
        );

        if (fboChanged && typeof gl.getError === "function") {
          const err = gl.getError();
          if (err !== gl.NO_ERROR && err !== 0 && err !== undefined) {
            this.depthCompatible = false;
          }
        }

        if (this.depthCompatible) {
          if (genMips) {
            const texProps = props.get(rt.texture) as TextureProps | undefined;
            if (texProps?.__webglTexture) {
              renderer.state.bindTexture(gl.TEXTURE_2D, texProps.__webglTexture);
              gl.generateMipmap(gl.TEXTURE_2D);
              renderer.state.unbindTexture();
            }
          }
          ok = true;
        }
      }
    } catch {
      this.depthCompatible = false;
      ok = false;
    } finally {
      // Restore source FIRST (Three.js r186 setRenderTarget binds gl.FRAMEBUFFER, affecting both READ and DRAW
      // while updating only FRAMEBUFFER/DRAW cache entries), THEN unbind READ and restore scissor state via Three.
      renderer.setRenderTarget(source);
      renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      if (typeof renderer.state.setScissorTest === "function") renderer.state.setScissorTest(wasScissor);
      else if (wasScissor) gl.enable(gl.SCISSOR_TEST);
      else gl.disable(gl.SCISSOR_TEST);
    }

    if (import.meta.env.DEV && fboChanged && typeof gl.getParameter === "function") {
      const bound = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      if (bound !== srcFbo && !this.devWarnedMismatch) {
        this.devWarnedMismatch = true;
        console.error("[harbour/ocean/scene-capture] DRAW_FRAMEBUFFER_BINDING mismatch after restore", {
          expected: srcFbo,
          actual: bound,
        });
      }
    }

    if (!ok) {
      this.resetReady();
      return;
    }

    this.uniforms.uCapColor.value = rt.texture;
    this.uniforms.uCapDepth.value = rt.depthTexture!;
    this.uniforms.uCapSize.value.set(source.width, source.height);
    this.uniforms.uCapNearFar.value.set(camera.near, camera.far);
    this.tmpMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    this.uniforms.uCapInvVP.value.copy(this.tmpMat);
    this.uniforms.uCapReady.value = 1;
  }

  private resetReady(): void {
    this.uniforms.uCapReady.value = 0;
    this.uniforms.uCapColor.value = this.fallbackColor;
    this.uniforms.uCapDepth.value = this.fallbackDepth;
  }

  /** Release GPU capture buffers while keeping the instance reusable (e.g. DPR < 0.8 rescue rung, Astra #4). */
  release(): void {
    this.resetReady();
    if (this.captureRT) {
      this.captureRT.depthTexture?.dispose();
      this.captureRT.dispose();
      this.captureRT = null;
    }
    this.rtInitialized = false;
    this.lastSrcFbo = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
    this.fallbackColor.dispose();
    this.fallbackDepth.dispose();
  }
}
