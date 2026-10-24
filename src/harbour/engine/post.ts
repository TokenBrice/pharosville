import * as THREE from "three";
import {
  BloomEffect, Effect, EffectComposer, EffectPass, KernelSize, LUT3DEffect, type MipmapBlurPass, Pass, RenderPass, SMAAEffect, SMAAPreset,
  TiltShiftEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from "postprocessing";
import type { CameraRig } from "./camera-rig";
import type { Grade, TimeOfDay } from "./time-of-day";
import type { QualitySettings } from "./quality";
import type { EngineContext, PreparationEntry } from "./types";
import { preparationMaterial } from "./prepare";
import { StaticDepthPass } from "../world/depth-prepass";
import { getHarbourMaterials } from "../world/materials";

export interface PostPreparation {
  entries: PreparationEntry[];
  dispose(): void;
}

/**
 * The WebGL2 post chain (NaN scrub, one merged EffectPass + SMAA):
 *   scrub → tilt-shift (overview only) → bloom → AgX → per-hour 3D LUT grade → vignette → dither (+ paper tooth) → SMAA.
 * The LUT is generated on the CPU from style C's grade (lift/gamma/gain + saturation + AgX look contrast)
 * and regenerated only when the interpolated grade actually changes.
 */
export const LUT_SIZE = 32;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Display-space S-curve around 0.5 (AgX "Medium High Contrast"-like). */
function sCurve(v: number, c: number): number {
  if (c === 1) return v;
  return v < 0.5 ? 0.5 * Math.pow(2 * v, c) : 1 - 0.5 * Math.pow(2 * (1 - v), c);
}

const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
/** Soft hue window (degrees, may wrap): 1 inside [a, b], easing out over `soft` degrees. */
function hueBand(h: number, a: number, b: number, soft: number): number {
  const d = (x: number) => ((x % 360) + 360) % 360;
  const w = d(b - a), p = d(h - a);
  if (p <= w) return 1;
  const out = Math.min(p - w, 360 - p);
  return 1 - smooth(0, soft, out);
}

/**
 * Pure grade function on sRGB-encoded display values (what LUT3DEffect samples with).
 * Blender colour balance (LGG): x = ((v - 1)·(2 - lift) + 1)·gain; out = x^(1/gamma).
 * Then an S-curve, and a saturation that may depend on value (shadowSat) and hue (blueSat: cyan→blue,
 * warmSat: red→green), so the grade can keep the sea receding while roofs and sails carry the colour.
 */
export function gradePixel(rgb: [number, number, number], g: Grade, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  for (let c = 0; c < 3; c++) {
    let x = ((rgb[c] - 1) * (2 - g.lift[c]) + 1) * g.gain[c];
    x = Math.pow(Math.max(0, x), 1 / g.gamma[c]);
    out[c] = sCurve(clamp01(x), g.contrast);
  }
  const l = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  let sat = g.saturation;
  const shadowSat = g.shadowSat ?? 1, blueSat = g.blueSat ?? 1, warmSat = g.warmSat ?? 1;
  if (shadowSat !== 1) sat *= shadowSat + (1 - shadowSat) * smooth(0.03, 0.42, l);
  if (blueSat !== 1 || warmSat !== 1) {
    const mx = Math.max(out[0], out[1], out[2]), mn = Math.min(out[0], out[1], out[2]), ch = mx - mn;
    if (ch > 1e-4) {
      let h: number;
      if (mx === out[0]) h = 60 * (((out[1] - out[2]) / ch) % 6);
      else if (mx === out[1]) h = 60 * ((out[2] - out[0]) / ch + 2);
      else h = 60 * ((out[0] - out[1]) / ch + 4);
      const chroma = smooth(0.02, 0.12, ch);   // near-greys keep their (tiny) hue untouched
      sat *= 1 + (blueSat - 1) * hueBand(h, 180, 245, 25) * chroma;
      sat *= 1 + (warmSat - 1) * hueBand(h, 345, 115, 25) * chroma;
    }
  }
  for (let c = 0; c < 3; c++) out[c] = clamp01(l + (out[c] - l) * sat);
  return out;
}

/** Fills an RGBA half-float 3D LUT (size³) with the grade. */
export function fillGradeLUT(data: Uint16Array, size: number, g: Grade): void {
  const px: [number, number, number] = [0, 0, 0], o: [number, number, number] = [0, 0, 0];
  const toHalf = THREE.DataUtils.toHalfFloat;
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let gg = 0; gg < size; gg++) {
      for (let r = 0; r < size; r++) {
        px[0] = r / (size - 1); px[1] = gg / (size - 1); px[2] = b / (size - 1);
        gradePixel(px, g, o);
        data[i++] = toHalf(o[0]); data[i++] = toHalf(o[1]); data[i++] = toHalf(o[2]); data[i++] = toHalf(1);
      }
    }
  }
}

/** Packs the grade into `out` (15 numbers); returns true when it moved since the last pack. */
function packGrade(g: Grade, out: Float32Array): boolean {
  let moved = false;
  const put = (i: number, v: number) => { if (Math.abs(out[i] - v) > 5e-4) { out[i] = v; moved = true; } };
  for (let c = 0; c < 3; c++) { put(c, g.lift[c]); put(3 + c, g.gamma[c]); put(6 + c, g.gain[c]); }
  put(9, g.saturation); put(10, g.contrast); put(11, g.shadowSat ?? 1); put(12, g.blueSat ?? 1); put(13, g.warmSat ?? 1);
  return moved;
}

/**
 * Zeroes non-finite scene pixels before anything blurs them. One NaN/Inf pixel from any shader (pow of a
 * negative, a half-float overflow) is spread by the bloom mip chain over the whole screen: a black frame.
 * NaN fails every comparison, so the range test catches it even where a driver folds isnan() away.
 */
const SCRUB_FRAG = /* glsl */ `
uniform sampler2D inputBuffer;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(inputBuffer, vUv);
  bvec4 ok = bvec4(c.r >= 0.0 && c.r <= 65000.0, c.g >= 0.0 && c.g <= 65000.0, c.b >= 0.0 && c.b <= 65000.0, c.a >= 0.0 && c.a <= 65000.0);
  gl_FragColor = vec4(ok.r ? c.r : 0.0, ok.g ? c.g : 0.0, ok.b ? c.b : 0.0, ok.a ? c.a : 1.0);
}`;

export class NanScrubPass extends Pass {
  private readonly mat: THREE.ShaderMaterial;
  constructor() {
    super("NanScrubPass");
    this.mat = new THREE.ShaderMaterial({
      name: "hb_post_scrub", uniforms: { inputBuffer: { value: null } },
      vertexShader: "varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }",
      fragmentShader: SCRUB_FRAG, blending: THREE.NoBlending, depthWrite: false, depthTest: false, toneMapped: false,
    });
    this.fullscreenMaterial = this.mat;
  }

  render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, outputBuffer: THREE.WebGLRenderTarget): void {
    this.mat.uniforms.inputBuffer.value = inputBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void { this.mat.dispose(); super.dispose(); }
}

/**
 * Dither + paper tooth (02-L4 / 01-A11, decorative), in display space after the grade: ±0.5/255 triangular dither from
 * interleaved-gradient noise (no banding in the night sky and bloom halos), and an optional static paper tooth: a
 * screen-fixed 2-octave luminance grain (~1.5 %, strongest in mid-tones, zero toward the screen edges where the UI
 * sits). Never animated (reduced-motion safe). The tooth ships off unless PAPER_TOOTH (art review D-6); `?tooth=1|0`.
 */
const PAPER_TOOTH = 0;
const DITHER_FRAG = /* glsl */ `
uniform float uTooth;
float hbIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hbH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hbVal(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hbH(i), hbH(i + vec2(1.0, 0.0)), f.x), mix(hbH(i + vec2(0.0, 1.0)), hbH(i + 1.0), f.x), f.y);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  if (uTooth > 0.0) {
    vec2 fc = gl_FragCoord.xy;
    float g = hbVal(fc / 2.6) * 0.6 + hbVal(fc / 9.0 + 17.3) * 0.4 - 0.5;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float mid = smoothstep(0.08, 0.35, l) * (1.0 - smoothstep(0.7, 0.95, l));
    vec2 e = min(uv, 1.0 - uv);
    float edge = smoothstep(0.02, 0.1, min(e.x, e.y));
    c *= 1.0 + g * 2.0 * uTooth * mid * edge;
  }
  float d = hbIgn(gl_FragCoord.xy) + hbIgn(gl_FragCoord.xy + vec2(5.588, 7.31)) - 1.0;
  outputColor = vec4(c + d / 255.0, inputColor.a);
}`;

export class DitherEffect extends Effect {
  constructor(tooth: number) {
    super("HbDitherEffect", DITHER_FRAG, { uniforms: new Map([["uTooth", new THREE.Uniform(tooth)]]) });
    this.inputColorSpace = THREE.SRGBColorSpace;   // ±0.5/255 means display steps
  }
}

/**
 * postprocessing's levels setter calls Pass.dispose(), evicting the still-live down/up materials.
 * This narrow adapter mirrors its mip construction, but releases targets only. Keep in sync with the
 * pinned MipmapBlurPass implementation; sizes, formats, names and blur materials are unchanged.
 */
function setBloomLevels(pass: MipmapBlurPass, levels: number): void {
  if (pass.levels === levels) return;
  const mip = pass as MipmapBlurPass & {
    renderTarget: THREE.WebGLRenderTarget;
    downsamplingMipmaps: THREE.WebGLRenderTarget[];
    upsamplingMipmaps: THREE.WebGLRenderTarget[];
    resolution: THREE.Vector2;
  };
  for (const target of mip.downsamplingMipmaps) target.dispose();
  for (const target of mip.upsamplingMipmaps) target.dispose();
  mip.downsamplingMipmaps.length = 0;
  mip.upsamplingMipmaps.length = 0;
  for (let i = 0; i < levels; i++) {
    const target = mip.renderTarget.clone();
    target.texture.name = `Downsampling.Mipmap${i}`;
    mip.downsamplingMipmaps.push(target);
  }
  mip.upsamplingMipmaps.push(mip.renderTarget);
  for (let i = 1; i < levels - 1; i++) {
    const target = mip.renderTarget.clone();
    target.texture.name = `Upsampling.Mipmap${i}`;
    mip.upsamplingMipmaps.push(target);
  }
  mip.setSize(mip.resolution.x, mip.resolution.y);
}

export class PostChain {
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  readonly tiltShift: TiltShiftEffect;
  readonly vignette: VignetteEffect;
  readonly lut: LUT3DEffect;
  readonly smaa: SMAAEffect;
  readonly dither: DitherEffect;
  private readonly scrub = new NanScrubPass();
  private readonly main: EffectPass;
  private readonly lutTex: THREE.Data3DTexture;
  private readonly lutKey = new Float32Array(15).fill(-1);
  private tier: QualitySettings["tier"] | undefined;
  private lutAge = 1e9;
  private depthPrepass?: StaticDepthPass;
  /** Camera distances where tilt-shift starts / reaches full strength (set from the layout presets). */
  tiltNear = 260;
  tiltFar = 700;
  /**
   * The focal subject (01-A6): the Pharos' foot and lantern (world), set by the layout system. The tilt-shift band
   * centres on the tower's screen height, so the miniature's sharp row is the lighthouse, not the sky above it.
   */
  tiltFocus: [THREE.Vector3, THREE.Vector3] | null = null;
  private readonly cam: THREE.PerspectiveCamera;
  private readonly focusV = new THREE.Vector3();

  constructor(readonly renderer: THREE.WebGLRenderer, readonly composer: EffectComposer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.cam = camera;
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(this.scrub);
    this.tiltShift = new TiltShiftEffect({ focusArea: 0.6, feather: 0.38, offset: 0.06, kernelSize: KernelSize.MEDIUM, resolutionScale: 0.5 });
    this.bloom = new BloomEffect({ intensity: 0.6, luminanceThreshold: 1.3, luminanceSmoothing: 0.35, mipmapBlur: true, radius: 0.72, levels: 8 });
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    const data = new Uint16Array(LUT_SIZE ** 3 * 4);
    this.lutTex = new THREE.Data3DTexture(data, LUT_SIZE, LUT_SIZE, LUT_SIZE);
    this.lutTex.format = THREE.RGBAFormat;
    this.lutTex.type = THREE.HalfFloatType;
    this.lutTex.minFilter = this.lutTex.magFilter = THREE.LinearFilter;
    this.lutTex.wrapS = this.lutTex.wrapT = this.lutTex.wrapR = THREE.ClampToEdgeWrapping;
    this.lutTex.unpackAlignment = 1;
    this.lutTex.needsUpdate = true;
    this.lut = new LUT3DEffect(this.lutTex, { inputColorSpace: THREE.SRGBColorSpace });
    this.vignette = new VignetteEffect({ offset: 0.28, darkness: 0.42 });
    // the tilt-shift blur pass runs even at opacity 0: skip it while the effect is faded out (heart/close)
    const tiltUpdate = this.tiltShift.update.bind(this.tiltShift);
    this.tiltShift.update = (r, input, dt) => { if (this.tiltShift.blendMode.opacity.value > 0.002) tiltUpdate(r, input, dt); };
    const toothQ = typeof location !== "undefined" ? new URLSearchParams(location.search).get("tooth") : null;
    this.dither = new DitherEffect(toothQ === null ? PAPER_TOOTH * 0.015 : toothQ === "0" ? 0 : 0.015);
    this.main = new EffectPass(camera, this.tiltShift, this.bloom, this.toneMapping, this.lut, this.vignette, this.dither);
    composer.addPass(this.main);
    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    composer.addPass(new EffectPass(camera, this.smaa));
  }

  installDepthPrepass(ctx: EngineContext): void {
    this.depthPrepass = new StaticDepthPass(ctx, getHarbourMaterials(ctx).staticDepth);
    const render = this.composer.passes[0] as RenderPass;
    render.clearPass.enabled = false;
  }

  /**
   * Called once every system has added its passes (stale fog, beam shafts), before the first render:
   * the scrub goes right ahead of the bloom pass so it cleans whatever those scene-linear passes wrote.
   */
  seal(): void {
    // Systems insert scene-linear effects after the original RenderPass at index 1.
    // Add depth only after those insertions, keeping it adjacent to the colour pass.
    if (this.depthPrepass) this.composer.addPass(this.depthPrepass, 0);
    const passes = this.composer.passes as Pass[];
    passes.splice(passes.indexOf(this.scrub), 1);
    passes.splice(passes.indexOf(this.main), 0, this.scrub);
  }

  /** Quality tier hooks (same art; cheaper effects). */
  setQuality(q: QualitySettings): void {
    if (this.tier === q.tier) return;
    this.tier = q.tier;
    setBloomLevels(this.bloom.mipmapBlurPass, q.bloomLevels);
    this.smaa.applyPreset(q.smaa === "high" ? SMAAPreset.HIGH : q.smaa === "medium" ? SMAAPreset.MEDIUM : SMAAPreset.LOW);
  }

  /** Boot covers all private passes; tier changes affect only the two SMAA preset materials. */
  preparationEntries(next?: QualitySettings): PostPreparation {
    const entries: PreparationEntry[] = [];
    const owned: THREE.Material[] = [];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const add = (pass: Pass, target: () => THREE.WebGLRenderTarget | null, material?: THREE.Material) => {
      const surface = pass as unknown as { scene: THREE.Scene; camera: THREE.Camera };
      const root = material ? new THREE.Mesh(geometry, material) : surface.scene;
      entries.push({ root, camera: surface.camera, target, scene: surface.scene });
    };
    if (!next) {
      for (const pass of this.composer.passes) {
        if (!(pass instanceof RenderPass) && !(pass instanceof StaticDepthPass)) add(pass, () => pass.renderToScreen ? null : this.composer.outputBuffer);
      }
      const bloom = this.bloom.mipmapBlurPass as MipmapBlurPass & {
        downsamplingMaterial: THREE.Material; upsamplingMaterial: THREE.Material;
        downsamplingMipmaps: THREE.WebGLRenderTarget[]; upsamplingMipmaps: THREE.WebGLRenderTarget[];
      };
      add(this.bloom.luminancePass, () => (this.bloom as BloomEffect & { renderTarget: THREE.WebGLRenderTarget }).renderTarget);
      add(bloom, () => bloom.downsamplingMipmaps[0], bloom.downsamplingMaterial);
      add(bloom, () => bloom.upsamplingMipmaps[0], bloom.upsamplingMaterial);
      const tilt = this.tiltShift.blurPass as typeof this.tiltShift.blurPass & { renderTargetA: THREE.WebGLRenderTarget };
      add(tilt, () => tilt.renderTargetA);
    }
    const smaa = this.smaa as SMAAEffect & {
      edgeDetectionPass: Pass; weightsPass: Pass;
      renderTargetEdges: THREE.WebGLRenderTarget; renderTargetWeights: THREE.WebGLRenderTarget;
    };
    let edge = smaa.edgeDetectionMaterial, weights = smaa.weightsMaterial;
    if (next) {
      edge = preparationMaterial(edge); weights = preparationMaterial(weights);
      owned.push(edge, weights);
      // Invoke the dependency's preset on owned materials, never mutate live defines while awaiting.
      SMAAEffect.prototype.applyPreset.call({ edgeDetectionMaterial: edge, weightsMaterial: weights } as SMAAEffect,
        next.smaa === "high" ? SMAAPreset.HIGH : next.smaa === "medium" ? SMAAPreset.MEDIUM : SMAAPreset.LOW);
    }
    add(smaa.edgeDetectionPass, () => smaa.renderTargetEdges, edge);
    add(smaa.weightsPass, () => smaa.renderTargetWeights, weights);
    return { entries, dispose: () => { geometry.dispose(); for (const material of owned) material.dispose(); } };
  }

  update(delta: number, tod: TimeOfDay, rig: CameraRig): void {
    this.renderer.toneMappingExposure = Math.pow(2, tod.exposure);
    this.bloom.intensity = tod.bloomIntensity;
    this.bloom.luminanceMaterial.threshold = tod.bloomThreshold;
    // Tilt-shift: a miniature cue at overview zoom only; fades out as you zoom in.
    const z = THREE.MathUtils.smoothstep(rig.distance, this.tiltNear, this.tiltFar);
    this.tiltShift.blendMode.opacity.value = z * 0.55;
    this.tiltShift.focusArea = THREE.MathUtils.lerp(0.75, 0.58, z);
    if (this.tiltFocus && z > 0) {
      // tower mid-height and lantern in NDC y (tilt-shift space is -1 bottom … 1 top); keep the lantern inside the
      // sharp row, never drop the band below its old place (the harbour below stays in the soft fall-off)
      const yb = this.focusV.copy(this.tiltFocus[0]).project(this.cam).y;
      const yt = this.focusV.copy(this.tiltFocus[1]).project(this.cam).y;
      const sharp = this.tiltShift.focusArea - this.tiltShift.feather;
      const want = Math.max((yb + yt) * 0.5, yt - sharp - 0.06);
      this.tiltShift.offset = THREE.MathUtils.clamp(Number.isFinite(want) ? want : 0.06, 0.06, 0.5);
    }
    this.vignette.darkness = 0.36 + 0.12 * z;
    // LUT: regenerate when the grade moved (throttled to 4 Hz while the clock runs).
    this.lutAge += delta;
    if (this.lutAge > 0.25) {
      if (packGrade(tod.grade, this.lutKey)) {
        fillGradeLUT(this.lutTex.image.data as Uint16Array, LUT_SIZE, tod.grade);
        this.lutTex.needsUpdate = true;
        this.lutAge = 0;
      }
    }
  }

  dispose(): void { this.depthPrepass?.dispose(); this.lutTex.dispose(); this.scrub.dispose(); }
}
