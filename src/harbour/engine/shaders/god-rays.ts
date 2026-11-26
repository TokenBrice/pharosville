import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import type { PreparationEntry } from "../types";

export type GodRaysQuality = "high" | "medium" | "off";

/** Maximum additive scene-linear gain applied by the composite pass (subtle golden shafts, never milky wash). */
export const GOD_RAYS_MAX_GAIN = 0.42;

/** Radial blur tap count per pass (2 passes -> effectively 400 taps on High, 144 on Medium). */
export function godRaysTapsFor(tier: GodRaysQuality): number {
  return tier === "high" ? 20 : tier === "medium" ? 12 : 0;
}

/**
 * Strict dawn/dusk solar elevation gate (`sunY = sin(elevation)`).
 * Peaks smoothly inside `sunY ∈ [-0.03, +0.26]` and stays strictly `0` at noon (`> 0.26`) and deep night (`< -0.03`).
 */
export function godRaysDawnDuskWeight(sunY: number): number {
  if (!Number.isFinite(sunY) || sunY <= -0.03 || sunY >= 0.26) return 0;
  return THREE.MathUtils.smoothstep(sunY, -0.03, 0.04) * (1 - THREE.MathUtils.smoothstep(sunY, 0.14, 0.26));
}

/** Standard fullscreen-triangle vertex shader for ¼-res mask and radial blur passes. */
export const GOD_RAYS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * Pass 1 (`hb_godrays_mask`, ¼-res `HalfFloatType`):
 * Masks strictly to sky / far-horizon pixels (`depth >= uSkyDepth - 0.0004`) with a luminance threshold
 * (`smoothstep(0.45, 1.10, lum)`) and soft aspect-corrected radial falloff around the painted
 * `uSunDisc` screen position (`uSunScreen.xy`) so back-lit architecture, the Pharos tower,
 * ship masts, and sails act as crisp dark occluders.
 */
export const GOD_RAYS_MASK_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec4 uSunScreen;
uniform float uAspect;
uniform float uSkyDepth;
varying vec2 vUv;

void main() {
  float depth = texture2D(tDepth, vUv).r;
  float skyLo = uSkyDepth - 0.0004;
  if (depth < skyLo) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float skyMask = smoothstep(skyLo, uSkyDepth + 0.0004, depth);

  vec2 delta = (vUv - uSunScreen.xy) * vec2(max(uAspect, 1e-3), 1.0);
  float dist = length(delta);
  float rBroad = 1.0 - smoothstep(0.05, 0.68, dist);
  float rCore = 1.0 - smoothstep(0.0, 0.16, dist);
  float radial = rBroad * rBroad * 0.55 + rCore * rCore * 0.45;
  if (radial < 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 col = min(max(texture2D(tColor, vUv).rgb, vec3(0.0)), vec3(8.0));
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float bright = smoothstep(0.45, 1.10, lum);
  vec3 emit = (col / (1.0 + lum * 0.30)) * bright * skyMask * radial;
  gl_FragColor = vec4(emit, 1.0);
}`;

/**
 * Pass 2 (`hb_godrays_blur`, ¼-res `HalfFloatType` ping-pong, run twice):
 * Directional radial blur marching toward `uSunScreen.xy` with exponential ray decay (`0.94`),
 * rotating Interleaved Gradient Noise jitter, and two cascaded step scales (`1.0`, then `0.45`)
 * yielding smooth crepuscular shafts with zero banding (`2×20` taps High, `2×12` taps Medium).
 */
export const GOD_RAYS_BLUR_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec4 uSunScreen;
uniform float uTaps;
uniform float uStepScale;
uniform float uJitter;
varying vec2 vUv;

const int MAX_TAPS = 20;
const float DECAY = 0.94;
const float DENSITY = 0.88;

float grIgn(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  float taps = max(uTaps, 1.0);
  vec2 toSun = uSunScreen.xy - vUv;
  float rayLen = length(toSun);
  vec2 rayDir = rayLen > 1e-5 ? toSun / rayLen : vec2(0.0);
  float span = min(rayLen, 0.92) * DENSITY * uStepScale;
  vec2 deltaUv = rayDir * (span / taps);

  float jitter = fract(grIgn(gl_FragCoord.xy) + uJitter);
  vec2 sampleUv = vUv + deltaUv * jitter;

  vec3 accum = vec3(0.0);
  float wSum = 0.0;
  float illumDecay = 1.0;

  for (int i = 0; i < MAX_TAPS; i++) {
    if (float(i) >= taps) break;
    float inBounds = step(0.0, sampleUv.x) * step(sampleUv.x, 1.0)
                   * step(0.0, sampleUv.y) * step(sampleUv.y, 1.0);
    vec2 clampedUv = clamp(sampleUv, vec2(0.0), vec2(1.0));
    accum += texture2D(tInput, clampedUv).rgb * (inBounds * illumDecay);
    wSum += illumDecay;
    illumDecay *= DECAY;
    sampleUv += deltaUv;
  }

  vec3 blurred = accum / max(wSum, 1e-5);
  blurred = blurred / (vec3(1.0) + blurred * 0.45);
  gl_FragColor = vec4(blurred, 1.0);
}`;

/**
 * Merged scene-linear composite (runs inside `PostChain`'s `Main EffectPass` with zero extra full-res pass):
 * Early-outs when `uStrength <= 0.001`; otherwise reads bilinear ¼-res `uRaysTex`, tints gently toward
 * warm `uSunColor`, and adds subtle crepuscular shafts onto `inputColor.rgb` while preserving `inputColor.a`.
 */
export const GOD_RAYS_COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uRaysTex;
uniform vec3 uSunColor;
uniform float uStrength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength <= 0.001) {
    outputColor = inputColor;
    return;
  }
  vec3 rays = max(texture2D(uRaysTex, uv).rgb, vec3(0.0));
  float maxSun = max(max(uSunColor.r, uSunColor.g), max(uSunColor.b, 1e-4));
  vec3 sunTint = mix(vec3(1.0), uSunColor / maxSun, 0.55);
  outputColor = vec4(inputColor.rgb + rays * sunTint * uStrength, inputColor.a);
}`;

/**
 * ¼-Resolution Dawn & Dusk God Rays effect for `PostChain` (`PLAN.md` §6.3):
 *  - Anchored to the painted `uSunDisc` screen coordinates (`uSunScreen`).
 *  - Runs 1 mask + 2 radial blur passes at ¼ resolution inside `update()` only during dawn/dusk;
 *    strictly `0.00 ms` bypass (0 GPU draws, early-out composite) at noon, night, Low tier, or `&extras=-godrays`.
 *  - Composites for free inside `PostChain`'s merged `Main EffectPass` before Bloom & AgX.
 */
export class GodRaysEffect extends Effect {
  readonly targetA: THREE.WebGLRenderTarget;
  readonly targetB: THREE.WebGLRenderTarget;
  readonly maskScene = new THREE.Scene();
  readonly blurScene = new THREE.Scene();
  readonly passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly maskMat: THREE.ShaderMaterial;
  readonly blurMat: THREE.ShaderMaterial;
  private readonly quadGeo: THREE.BufferGeometry;
  private readonly fallbackColor: THREE.DataTexture;
  private readonly fallbackDepth: THREE.DataTexture;
  private readonly sunScreen = new THREE.Vector4(0.5, 0.8, 0, 0.5);
  private depthTexture: THREE.Texture | null = null;
  private quality: GodRaysQuality = "high";
  private enabled = true;
  private rawWeight = 0;
  private activeWeight = 0;
  private fullW = 4;
  private fullH = 4;
  private jitterPhase = 0;
  private reducedMotion = false;
  private disposed = false;

  constructor(initialQuality: GodRaysQuality = "high") {
    const targetOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    };
    const targetA = new THREE.WebGLRenderTarget(1, 1, targetOpts);
    targetA.texture.name = "GodRays.TargetA";
    const targetB = new THREE.WebGLRenderTarget(1, 1, targetOpts);
    targetB.texture.name = "GodRays.TargetB";

    super("HbGodRaysEffect", GOD_RAYS_COMPOSITE_FRAG, {
      blendFunction: BlendFunction.SET,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ["uRaysTex", new THREE.Uniform(targetA.texture)],
        ["uSunColor", new THREE.Uniform(new THREE.Color(1, 0.82, 0.58))],
        ["uStrength", new THREE.Uniform(0)],
      ]),
    });

    this.targetA = targetA;
    this.targetB = targetB;
    this.quality = initialQuality;

    this.fallbackColor = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.fallbackColor.needsUpdate = true;
    this.fallbackDepth = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.fallbackDepth.needsUpdate = true;

    this.quadGeo = new THREE.BufferGeometry();
    this.quadGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

    this.maskMat = new THREE.ShaderMaterial({
      name: "hb_godrays_mask",
      vertexShader: GOD_RAYS_VERT,
      fragmentShader: GOD_RAYS_MASK_FRAG,
      uniforms: {
        tColor: { value: this.fallbackColor },
        tDepth: { value: this.fallbackDepth },
        uSunScreen: { value: this.sunScreen },
        uAspect: { value: 1 },
        uSkyDepth: { value: 0.9962 },
      },
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      name: "hb_godrays_blur",
      vertexShader: GOD_RAYS_VERT,
      fragmentShader: GOD_RAYS_BLUR_FRAG,
      uniforms: {
        tInput: { value: targetA.texture },
        uSunScreen: { value: this.sunScreen },
        uTaps: { value: godRaysTapsFor(initialQuality) },
        uStepScale: { value: 1.0 },
        uJitter: { value: 0.0 },
      },
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    const maskMesh = new THREE.Mesh(this.quadGeo, this.maskMat);
    maskMesh.frustumCulled = false;
    this.maskScene.add(maskMesh);

    const blurMesh = new THREE.Mesh(this.quadGeo, this.blurMat);
    blurMesh.frustumCulled = false;
    this.blurScene.add(blurMesh);
  }

  get active(): boolean {
    return this.enabled && this.quality !== "off" && this.activeWeight > 0.002;
  }

  get weight(): number {
    return this.activeWeight;
  }

  setQuality(tier: GodRaysQuality): void {
    this.quality = tier;
    this.blurMat.uniforms.uTaps.value = godRaysTapsFor(tier);
    this.refreshStrength();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.refreshStrength();
  }

  /** Holds IGN jitter phase stationary when reduced motion is active. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /**
   * Synchronizes painted `uSunDisc` screen coordinates (`vec4(uvX, uvY, vis, sunY)`),
   * warm sun color, storm cloud cover `[0..1]`, and night factor `[0..1]`.
   */
  sync(sunScreen: THREE.Vector4, sunColor: THREE.Color, cloudCover: number, night: number, skyDepth?: number): void {
    this.sunScreen.copy(sunScreen);
    (this.uniforms.get("uSunColor")!.value as THREE.Color).copy(sunColor);
    if (skyDepth !== undefined && Number.isFinite(skyDepth)) {
      this.maskMat.uniforms.uSkyDepth.value = THREE.MathUtils.clamp(skyDepth, 0.9, 0.9995);
    }

    const dawnDusk = godRaysDawnDuskWeight(sunScreen.w);
    const discVis = THREE.MathUtils.clamp(Number.isFinite(sunScreen.z) ? sunScreen.z : 0, 0, 1);

    // Fade smoothly when the painted sun disc drifts past the viewport margin
    const dx = Math.max(0, -sunScreen.x, sunScreen.x - 1);
    const dy = Math.max(0, -sunScreen.y, sunScreen.y - 1);
    const uvFade = 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dy), 0.05, 0.35);

    // Fade cleanly behind heavy storm cloud deck and into night
    const cov = THREE.MathUtils.clamp(Number.isFinite(cloudCover) ? cloudCover : 0, 0, 1);
    const cloudFade = 1 - THREE.MathUtils.smoothstep(cov, 0.45, 0.88);
    const n = THREE.MathUtils.clamp(Number.isFinite(night) ? night : 0, 0, 1);
    const nightFade = 1 - THREE.MathUtils.smoothstep(n, 0.35, 0.75);

    this.rawWeight = dawnDusk * discVis * uvFade * cloudFade * nightFade;
    this.refreshStrength();
  }

  private refreshStrength(): void {
    this.activeWeight = !this.enabled || this.quality === "off" ? 0 : this.rawWeight;
    this.uniforms.get("uStrength")!.value = this.activeWeight > 0.002 ? this.activeWeight * GOD_RAYS_MAX_GAIN : 0;
  }

  private ensureSize(width: number, height: number): void {
    const fw = Math.max(1, Math.round(width));
    const fh = Math.max(1, Math.round(height));
    const qw = Math.max(1, Math.round(fw * 0.25));
    const qh = Math.max(1, Math.round(fh * 0.25));
    if (fw === this.fullW && fh === this.fullH && this.targetA.width === qw && this.targetA.height === qh) return;
    this.fullW = fw;
    this.fullH = fh;
    this.targetA.setSize(qw, qh);
    this.targetB.setSize(qw, qh);
    this.maskMat.uniforms.uAspect.value = fw / Math.max(fh, 1);
  }

  override setDepthTexture(depthTexture: THREE.Texture | null): void {
    this.depthTexture = depthTexture;
    this.maskMat.uniforms.tDepth.value = depthTexture ?? this.fallbackDepth;
  }

  override setSize(width: number, height: number): void {
    this.ensureSize(width, height);
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, _deltaTime?: number): void {
    if (!this.enabled || this.quality === "off" || this.activeWeight <= 0.002 || !this.depthTexture) {
      this.uniforms.get("uStrength")!.value = 0;
      return;
    }

    this.ensureSize(inputBuffer.width, inputBuffer.height);
    this.uniforms.get("uStrength")!.value = this.activeWeight * GOD_RAYS_MAX_GAIN;

    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      // Pass 1: ¼-res sky-depth & high-luminance sun occlusion mask -> targetA
      this.maskMat.uniforms.tColor.value = inputBuffer.texture;
      renderer.setRenderTarget(this.targetA);
      renderer.render(this.maskScene, this.passCamera);

      const phase = this.jitterPhase;
      if (!this.reducedMotion) this.jitterPhase = (phase + 0.61803398875) % 1;

      // Pass 2a: ¼-res radial blur pass 1 (coarse step scale 1.0) targetA -> targetB
      this.blurMat.uniforms.tInput.value = this.targetA.texture;
      this.blurMat.uniforms.uStepScale.value = 1.0;
      this.blurMat.uniforms.uJitter.value = phase;
      renderer.setRenderTarget(this.targetB);
      renderer.render(this.blurScene, this.passCamera);

      // Pass 2b: ¼-res radial blur pass 2 (fine step scale 0.45) targetB -> targetA
      this.blurMat.uniforms.tInput.value = this.targetB.texture;
      this.blurMat.uniforms.uStepScale.value = 0.45;
      this.blurMat.uniforms.uJitter.value = (phase + 0.5) % 1;
      renderer.setRenderTarget(this.targetA);
      renderer.render(this.blurScene, this.passCamera);
    } finally {
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
    }
  }

  /** Exposes `hb_godrays_mask` and `hb_godrays_blur` for stall-free `ProgramPreparation`. */
  preparationEntries(): PreparationEntry[] {
    return [
      { root: this.maskScene, camera: this.passCamera, target: () => this.targetA, scene: this.maskScene },
      { root: this.blurScene, camera: this.passCamera, target: () => this.targetB, scene: this.blurScene },
    ];
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.depthTexture = null;
    this.maskMat.uniforms.tColor.value = this.fallbackColor;
    this.maskMat.uniforms.tDepth.value = this.fallbackDepth;
    this.blurMat.uniforms.tInput.value = this.fallbackColor;
    this.uniforms.get("uRaysTex")!.value = this.fallbackColor;
    this.quadGeo.dispose();
    super.dispose();
  }
}
