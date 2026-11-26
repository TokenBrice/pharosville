import * as THREE from "three";
import { Pass } from "postprocessing";
import type { PreparationEntry } from "../types";

/**
 * Default RCAS sharpening intensity `[0.0, 1.0]`: crisp limestone masonry and rigging
 * edges on sub-native governor rungs without halo ringing (`PLAN.md` §6.3, H15).
 */
export const FSR_DEFAULT_SHARPNESS = 0.30;

/**
 * Maps intuitive `[0.0, 1.0]` sharpness onto AMD FidelityFX RCAS `exp2(-stops)` gain
 * (`stops = (1 - s) * 2`, with a clean zero-attenuation ramp near `0` so `s = 0` is identity).
 */
export function fsrRcasSharpnessGain(sharpness: number): number {
  const s = THREE.MathUtils.clamp(Number.isFinite(sharpness) ? sharpness : FSR_DEFAULT_SHARPNESS, 0, 1);
  if (s <= 0.001) return 0;
  const stops = (1 - s) * 2;
  return Math.pow(2, -stops) * THREE.MathUtils.smoothstep(s, 0, 0.05);
}

/** Standard fullscreen-triangle vertex shader shared by EASU and RCAS passes. */
export const FSR_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * AMD FidelityFX Super Resolution 1.0 — Edge-Adaptive Spatial Upsampling (EASU).
 *
 * Samples the 12-tap cross footprint (`b,c / e,f,g,h / i,j,k,l / n,o`), estimates local
 * edge direction and anisotropy across the four overlapping 5-tap crosses around the
 * bilinear quad `(f,g,j,k)`, evaluates an anisotropic Lanczos2 elliptical filter, and
 * clamps the result to the `[min4, max4]` neighborhood envelope to eliminate ringing.
 */
export const FSR_EASU_FRAG = /* glsl */ `
uniform sampler2D uInput;
uniform vec2 uInputSize;
uniform vec2 uOutputSize;
varying vec2 vUv;

float fsrLuma(vec3 c) {
  return dot(c, vec3(0.25, 0.5, 0.25));
}

/** Exact IEC 61966-2-1 linear -> sRGB transfer (matches Three.js colorspace_fragment, B07/C04 safe). */
vec3 fsrLinearToSrgb(vec3 c) {
  vec3 cl = clamp(c, 0.0, 1.0);
  vec3 hi = vec3(1.055) * exp2(log2(max(cl, vec3(1e-6))) * (1.0 / 2.4)) - vec3(0.055);
  return mix(cl * 12.92, hi, step(vec3(0.0031308), cl));
}

vec3 fsrFetch(vec2 baseUv, vec2 invIn, vec2 off) {
  vec2 uv = clamp(baseUv + off * invIn, invIn * 0.5, vec2(1.0) - invIn * 0.5);
  return fsrLinearToSrgb(texture2D(uInput, uv).rgb);
}

void easuSet(
  inout vec2 dir,
  inout float len,
  float w,
  float lTop,
  float lLeft,
  float lCenter,
  float lRight,
  float lBot
) {
  float dc = lRight - lCenter;
  float cb = lCenter - lLeft;
  float maxX = max(abs(dc), abs(cb));
  float dirX = lRight - lLeft;
  dir.x += dirX * w;
  float lenX = maxX > 1e-5 ? clamp(abs(dirX) / maxX, 0.0, 1.0) : 0.0;
  lenX = lenX * lenX;
  len += lenX * w;

  float ec = lBot - lCenter;
  float ca = lCenter - lTop;
  float maxY = max(abs(ec), abs(ca));
  float dirY = lBot - lTop;
  dir.y += dirY * w;
  float lenY = maxY > 1e-5 ? clamp(abs(dirY) / maxY, 0.0, 1.0) : 0.0;
  lenY = lenY * lenY;
  len += lenY * w;
}

void easuTap(
  inout vec3 aC,
  inout float aW,
  vec2 off,
  vec2 dir,
  vec2 len2,
  float lob,
  float clp,
  vec3 c
) {
  float aX = off.x * dir.x + off.y * dir.y;
  float aY = off.x * (-dir.y) + off.y * dir.x;
  aX *= len2.x;
  aY *= len2.y;
  float d2 = min(aX * aX + aY * aY, clp);
  float wB = 0.4 * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB = wB * wB;
  wA = wA * wA;
  wB = 1.5625 * wB - 0.5625;
  float w = wB * wA;
  aC += c * w;
  aW += w;
}

void main() {
  vec2 inSz = max(uInputSize, vec2(1.0));
  vec2 outSz = max(uOutputSize, vec2(1.0));
  vec2 invIn = vec2(1.0) / inSz;
  vec2 pp = (floor(vUv * outSz) + vec2(0.5)) * (inSz / outSz) - vec2(0.5);
  vec2 fp = floor(pp);
  vec2 f = pp - fp;
  vec2 baseUv = (fp + vec2(0.5)) * invIn;

  vec3 cB = fsrFetch(baseUv, invIn, vec2( 0.0, -1.0));
  vec3 cC = fsrFetch(baseUv, invIn, vec2( 1.0, -1.0));
  vec3 cE = fsrFetch(baseUv, invIn, vec2(-1.0,  0.0));
  vec3 cF = fsrFetch(baseUv, invIn, vec2( 0.0,  0.0));
  vec3 cG = fsrFetch(baseUv, invIn, vec2( 1.0,  0.0));
  vec3 cH = fsrFetch(baseUv, invIn, vec2( 2.0,  0.0));
  vec3 cI = fsrFetch(baseUv, invIn, vec2(-1.0,  1.0));
  vec3 cJ = fsrFetch(baseUv, invIn, vec2( 0.0,  1.0));
  vec3 cK = fsrFetch(baseUv, invIn, vec2( 1.0,  1.0));
  vec3 cL = fsrFetch(baseUv, invIn, vec2( 2.0,  1.0));
  vec3 cN = fsrFetch(baseUv, invIn, vec2( 0.0,  2.0));
  vec3 cO = fsrFetch(baseUv, invIn, vec2( 1.0,  2.0));

  float lB = fsrLuma(cB);
  float lC = fsrLuma(cC);
  float lE = fsrLuma(cE);
  float lF = fsrLuma(cF);
  float lG = fsrLuma(cG);
  float lH = fsrLuma(cH);
  float lI = fsrLuma(cI);
  float lJ = fsrLuma(cJ);
  float lK = fsrLuma(cK);
  float lL = fsrLuma(cL);
  float lN = fsrLuma(cN);
  float lO = fsrLuma(cO);

  vec2 dir = vec2(0.0);
  float len = 0.0;
  easuSet(dir, len, (1.0 - f.x) * (1.0 - f.y), lB, lE, lF, lG, lJ);
  easuSet(dir, len, f.x * (1.0 - f.y),         lC, lF, lG, lH, lK);
  easuSet(dir, len, (1.0 - f.x) * f.y,         lF, lI, lJ, lK, lN);
  easuSet(dir, len, f.x * f.y,                 lG, lJ, lK, lL, lO);

  float dirR = dot(dir, dir);
  bool zro = dirR < (1.0 / 32768.0);
  dir = zro ? vec2(1.0, 0.0) : dir * inversesqrt(max(dirR, 1e-8));
  len = zro ? 0.0 : len * 0.5;
  len = len * len;

  float stretch = dot(dir, dir) / max(max(abs(dir.x), abs(dir.y)), 1e-5);
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 + (0.21 - 0.5) * len;
  float clp = 1.0 / max(lob, 1e-5);

  vec3 aC = vec3(0.0);
  float aW = 0.0;
  easuTap(aC, aW, vec2( 0.0, -1.0) - f, dir, len2, lob, clp, cB);
  easuTap(aC, aW, vec2( 1.0, -1.0) - f, dir, len2, lob, clp, cC);
  easuTap(aC, aW, vec2(-1.0,  0.0) - f, dir, len2, lob, clp, cE);
  easuTap(aC, aW, vec2( 0.0,  0.0) - f, dir, len2, lob, clp, cF);
  easuTap(aC, aW, vec2( 1.0,  0.0) - f, dir, len2, lob, clp, cG);
  easuTap(aC, aW, vec2( 2.0,  0.0) - f, dir, len2, lob, clp, cH);
  easuTap(aC, aW, vec2(-1.0,  1.0) - f, dir, len2, lob, clp, cI);
  easuTap(aC, aW, vec2( 0.0,  1.0) - f, dir, len2, lob, clp, cJ);
  easuTap(aC, aW, vec2( 1.0,  1.0) - f, dir, len2, lob, clp, cK);
  easuTap(aC, aW, vec2( 2.0,  1.0) - f, dir, len2, lob, clp, cL);
  easuTap(aC, aW, vec2( 0.0,  2.0) - f, dir, len2, lob, clp, cN);
  easuTap(aC, aW, vec2( 1.0,  2.0) - f, dir, len2, lob, clp, cO);

  vec3 min4 = min(min(cF, cG), min(cJ, cK));
  vec3 max4 = max(max(cF, cG), max(cJ, cK));
  vec3 color = clamp(aC / max(aW, 1e-5), min4, max4);
  gl_FragColor = vec4(color, 1.0);
}`;

/**
 * AMD FidelityFX Super Resolution 1.0 — Robust Contrast Adaptive Sharpening (RCAS).
 *
 * Uses a 5-tap cross (`b, d, e, f, h`) with local-range noise attenuation and an exact
 * anti-ringing lobe clamp (`FSR_RCAS_LIMIT = 0.25 - 1/16`). `uSharpness` in `[0.0, 1.0]`
 * maps cleanly to AMD's `exp2(-stops)` sharpness attenuation (`stops = (1 - s) * 2`).
 */
export const FSR_RCAS_FRAG = /* glsl */ `
uniform sampler2D uInput;
uniform vec2 uTexelSize;
uniform float uSharpness;
uniform float uOutputLinear;
varying vec2 vUv;

const float FSR_RCAS_LIMIT = 0.1875;

float rcasLuma(vec3 c) {
  return dot(c, vec3(0.25, 0.5, 0.25));
}

vec3 fsrSrgbToLinear(vec3 c) {
  vec3 cl = clamp(c, 0.0, 1.0);
  vec3 hi = exp2(log2(max((cl + vec3(0.055)) / 1.055, vec3(1e-6))) * 2.4);
  return mix(cl / 12.92, hi, step(vec3(0.04045), cl));
}

void main() {
  vec3 e = texture2D(uInput, vUv).rgb;
  float s = clamp(uSharpness, 0.0, 1.0);
  if (s <= 0.001) {
    vec3 outCol = uOutputLinear > 0.5 ? fsrSrgbToLinear(e) : e;
    gl_FragColor = vec4(outCol, 1.0);
    return;
  }

  vec3 b = texture2D(uInput, clamp(vUv + vec2(0.0, -uTexelSize.y), vec2(0.0), vec2(1.0))).rgb;
  vec3 d = texture2D(uInput, clamp(vUv + vec2(-uTexelSize.x, 0.0), vec2(0.0), vec2(1.0))).rgb;
  vec3 f = texture2D(uInput, clamp(vUv + vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0))).rgb;
  vec3 h = texture2D(uInput, clamp(vUv + vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0))).rgb;

  float bL = rcasLuma(b);
  float dL = rcasLuma(d);
  float eL = rcasLuma(e);
  float fL = rcasLuma(f);
  float hL = rcasLuma(h);

  float nz = 0.25 * (bL + dL + fL + hL) - eL;
  float maxL = max(max(max(bL, dL), max(fL, hL)), eL);
  float minL = min(min(min(bL, dL), min(fL, hL)), eL);
  nz = clamp(abs(nz) / max(maxL - minL, 1e-5), 0.0, 1.0);
  nz = -0.5 * nz + 1.0;

  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));

  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1e-5));
  vec3 hitMax = (vec3(1.0) - max(mx4, e)) / max(4.0 * (vec3(1.0) - mn4), vec3(1e-5));
  vec3 lobeRGB = max(-hitMin, -hitMax);
  float lobe = max(-FSR_RCAS_LIMIT, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0));

  float stops = (1.0 - s) * 2.0;
  float sharp = exp2(-stops) * smoothstep(0.0, 0.05, s);
  float w = lobe * sharp * nz;
  float rcpL = 1.0 / max(1.0 + 4.0 * w, 1e-4);
  vec3 color = clamp((e + w * (b + d + f + h)) * rcpL, 0.0, 1.0);
  if (uOutputLinear > 0.5) color = fsrSrgbToLinear(color);
  gl_FragColor = vec4(color, 1.0);
}`;

/**
 * Two-stage AMD FSR 1.0 upscaling pass (`EASU` -> `RCAS`) for sub-native DPR rungs.
 *
 * Reads the post-SMAA render-resolution `inputBuffer`, upsamples into an internal
 * display-sized `HalfFloatType` intermediate target (`easuTarget`), and applies
 * anti-ringing RCAS directly to the display framebuffer (or `outputBuffer`).
 */
export class Fsr1Pass extends Pass {
  readonly easuTarget: THREE.WebGLRenderTarget;
  readonly easuScene = new THREE.Scene();
  readonly rcasScene = new THREE.Scene();
  readonly passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly easuMat: THREE.ShaderMaterial;
  readonly rcasMat: THREE.ShaderMaterial;
  private readonly quadGeo: THREE.BufferGeometry;
  private readonly fallbackTex: THREE.DataTexture;
  private renderW = 1;
  private renderH = 1;
  private separatedResolutions = false;
  private sized = false;
  private _sharpness = FSR_DEFAULT_SHARPNESS;
  private disposed = false;

  constructor(sharpness = FSR_DEFAULT_SHARPNESS) {
    super("Fsr1Pass");
    this.needsSwap = false;

    this.easuTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    this.easuTarget.texture.name = "FSR1.EASU";

    this.fallbackTex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    this.fallbackTex.needsUpdate = true;

    this.quadGeo = new THREE.BufferGeometry();
    this.quadGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

    this._sharpness = THREE.MathUtils.clamp(Number.isFinite(sharpness) ? sharpness : FSR_DEFAULT_SHARPNESS, 0, 1);

    this.easuMat = new THREE.ShaderMaterial({
      name: "hb_fsr_easu",
      vertexShader: FSR_VERT,
      fragmentShader: FSR_EASU_FRAG,
      uniforms: {
        uInput: { value: this.fallbackTex },
        uInputSize: { value: new THREE.Vector2(1, 1) },
        uOutputSize: { value: new THREE.Vector2(1, 1) },
      },
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.rcasMat = new THREE.ShaderMaterial({
      name: "hb_fsr_rcas",
      vertexShader: FSR_VERT,
      fragmentShader: FSR_RCAS_FRAG,
      uniforms: {
        uInput: { value: this.easuTarget.texture },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
        uSharpness: { value: this._sharpness },
        uOutputLinear: { value: 0.0 },
      },
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    const easuMesh = new THREE.Mesh(this.quadGeo, this.easuMat);
    easuMesh.frustumCulled = false;
    this.easuScene.add(easuMesh);

    const rcasMesh = new THREE.Mesh(this.quadGeo, this.rcasMat);
    rcasMesh.frustumCulled = false;
    this.rcasScene.add(rcasMesh);
  }

  get sharpness(): number {
    return this._sharpness;
  }

  setSharpness(v: number): void {
    this._sharpness = THREE.MathUtils.clamp(Number.isFinite(v) ? v : FSR_DEFAULT_SHARPNESS, 0, 1);
    this.rcasMat.uniforms.uSharpness.value = this._sharpness;
  }

  /**
   * Explicitly separates internal render resolution from target display resolution
   * (used by manual composer DPR decoupling, `PLAN.md` §2.3 H15).
   */
  setResolutions(renderW: number, renderH: number, displayW: number, displayH: number): void {
    const rw = Math.max(1, Math.round(renderW));
    const rh = Math.max(1, Math.round(renderH));
    const dw = Math.max(1, Math.round(displayW));
    const dh = Math.max(1, Math.round(displayH));
    this.renderW = rw;
    this.renderH = rh;
    this.separatedResolutions = rw !== dw || rh !== dh;
    this.sized = true;

    if (this.easuTarget.width !== dw || this.easuTarget.height !== dh) {
      this.easuTarget.setSize(dw, dh);
    }
    (this.easuMat.uniforms.uInputSize.value as THREE.Vector2).set(rw, rh);
    (this.easuMat.uniforms.uOutputSize.value as THREE.Vector2).set(dw, dh);
    (this.rcasMat.uniforms.uTexelSize.value as THREE.Vector2).set(1 / dw, 1 / dh);
  }

  /** Shrinks the internal EASU intermediate to 1×1 and clears separation when bypassed at native DPR. */
  resetResolutions(): void {
    this.separatedResolutions = false;
    this.sized = false;
    this.renderW = 1;
    this.renderH = 1;
    if (this.easuTarget.width !== 1 || this.easuTarget.height !== 1) {
      this.easuTarget.setSize(1, 1);
    }
    (this.easuMat.uniforms.uInputSize.value as THREE.Vector2).set(1, 1);
    (this.easuMat.uniforms.uOutputSize.value as THREE.Vector2).set(1, 1);
    (this.rcasMat.uniforms.uTexelSize.value as THREE.Vector2).set(1, 1);
  }

  /**
   * Preserves an active render-vs-display separation set by `setResolutions()` when
   * `EffectComposer` resizes internal passes to render resolution; updates both when unseparated.
   */
  override setSize(width: number, height: number): void {
    // Keep easuTarget shrunk at 1×1 while bypassed (e.g. composer.addPass / composer.setSize at native DPR).
    if (!this.enabled) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.separatedResolutions) {
      this.renderW = w;
      this.renderH = h;
      (this.easuMat.uniforms.uInputSize.value as THREE.Vector2).set(w, h);
      return;
    }
    this.renderW = w;
    this.renderH = h;
    this.sized = true;
    if (this.easuTarget.width !== w || this.easuTarget.height !== h) {
      this.easuTarget.setSize(w, h);
    }
    (this.easuMat.uniforms.uInputSize.value as THREE.Vector2).set(w, h);
    (this.easuMat.uniforms.uOutputSize.value as THREE.Vector2).set(w, h);
    (this.rcasMat.uniforms.uTexelSize.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget | null,
    outputBuffer: THREE.WebGLRenderTarget | null,
  ): void {
    if (!inputBuffer) return;

    const inW = Math.max(1, Math.round(inputBuffer.width));
    const inH = Math.max(1, Math.round(inputBuffer.height));
    if (!this.sized) {
      this.setResolutions(inW, inH, inW, inH);
    } else if (inW !== this.renderW || inH !== this.renderH) {
      this.renderW = inW;
      this.renderH = inH;
      (this.easuMat.uniforms.uInputSize.value as THREE.Vector2).set(inW, inH);
    }

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      // Pass 1: EASU (render res -> display-sized easuTarget)
      this.easuMat.uniforms.uInput.value = inputBuffer.texture;
      (this.easuMat.uniforms.uInputSize.value as THREE.Vector2).set(inW, inH);
      renderer.setRenderTarget(this.easuTarget);
      renderer.render(this.easuScene, this.passCamera);

      // Pass 2: RCAS (perceptual sRGB easuTarget -> sRGB screen when renderToScreen, else linear outputBuffer)
      this.rcasMat.uniforms.uInput.value = this.easuTarget.texture;
      this.rcasMat.uniforms.uOutputLinear.value = this.renderToScreen ? 0.0 : 1.0;
      renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
      renderer.render(this.rcasScene, this.passCamera);
    } finally {
      renderer.autoClear = prevAutoClear;
    }
  }

  /** Exposes both `hb_fsr_easu` and `hb_fsr_rcas` for stall-free `ProgramPreparation`. */
  preparationEntries(): PreparationEntry[] {
    return [
      { root: this.easuScene, camera: this.passCamera, target: () => this.easuTarget, scene: this.easuScene },
      { root: this.rcasScene, camera: this.passCamera, target: () => null, scene: this.rcasScene },
    ];
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.easuMat.uniforms.uInput.value = this.fallbackTex;
    this.rcasMat.uniforms.uInput.value = this.fallbackTex;
    this.quadGeo.dispose();
    super.dispose();
  }
}
