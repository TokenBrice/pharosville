import * as THREE from "three";
import {
  BloomEffect, EffectComposer, EffectPass, KernelSize, LUT3DEffect, RenderPass, SMAAEffect, SMAAPreset,
  TiltShiftEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from "postprocessing";
import type { CameraRig } from "./camera-rig";
import type { Grade, TimeOfDay } from "./time-of-day";

/**
 * The WebGL2 post chain (one merged EffectPass + SMAA):
 *   tilt-shift (overview only) → bloom → AgX → per-hour 3D LUT grade → vignette → SMAA.
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

/**
 * Pure grade function on sRGB-encoded display values (what LUT3DEffect samples with).
 * Blender colour balance (LGG): x = ((v - 1)·(2 - lift) + 1)·gain; out = x^(1/gamma).
 */
export function gradePixel(rgb: [number, number, number], g: Grade, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  for (let c = 0; c < 3; c++) {
    let x = ((rgb[c] - 1) * (2 - g.lift[c]) + 1) * g.gain[c];
    x = Math.pow(Math.max(0, x), 1 / g.gamma[c]);
    out[c] = sCurve(clamp01(x), g.contrast);
  }
  const l = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  for (let c = 0; c < 3; c++) out[c] = clamp01(l + (out[c] - l) * g.saturation);
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

function gradeKey(g: Grade): string {
  return [...g.lift, ...g.gamma, ...g.gain, g.saturation, g.contrast].map((v) => v.toFixed(3)).join(",");
}

export class PostChain {
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  readonly tiltShift: TiltShiftEffect;
  readonly vignette: VignetteEffect;
  readonly lut: LUT3DEffect;
  private readonly lutTex: THREE.Data3DTexture;
  private lutKey = "";
  private lutAge = 1e9;
  /** Camera distances where tilt-shift starts / reaches full strength (set from the layout presets). */
  tiltNear = 260;
  tiltFar = 700;

  constructor(readonly renderer: THREE.WebGLRenderer, readonly composer: EffectComposer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    composer.addPass(new RenderPass(scene, camera));
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
    composer.addPass(new EffectPass(camera, this.tiltShift, this.bloom, this.toneMapping, this.lut, this.vignette));
    composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  }

  update(delta: number, tod: TimeOfDay, rig: CameraRig): void {
    this.renderer.toneMappingExposure = Math.pow(2, tod.exposure);
    this.bloom.intensity = tod.bloomIntensity;
    this.bloom.luminanceMaterial.threshold = tod.bloomThreshold;
    // Tilt-shift: a miniature cue at overview zoom only; fades out as you zoom in.
    const z = THREE.MathUtils.smoothstep(rig.distance, this.tiltNear, this.tiltFar);
    this.tiltShift.blendMode.opacity.value = z * 0.55;
    this.tiltShift.focusArea = THREE.MathUtils.lerp(0.75, 0.58, z);
    this.vignette.darkness = 0.36 + 0.12 * z;
    // LUT: regenerate when the grade moved (throttled to 4 Hz while the clock runs).
    this.lutAge += delta;
    if (this.lutAge > 0.25) {
      const key = gradeKey(tod.grade);
      if (key !== this.lutKey) {
        fillGradeLUT(this.lutTex.image.data as Uint16Array, LUT_SIZE, tod.grade);
        this.lutTex.needsUpdate = true;
        this.lutKey = key;
        this.lutAge = 0;
      }
    }
  }

  dispose(): void { this.lutTex.dispose(); }
}
