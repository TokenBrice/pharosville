import {
  Color,
  HalfFloatType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// Bloom thresholds adapt to the day cycle (blended in applyGrade). The V-plan
// knee (0.55) predates the Garden Sea: the bokashi day sky/fog sits at
// ~0.7–0.8 linear luminance frame-wide and the full-tier lantern pool ring
// overlaps to ~1.0 around the island, so a 0.55 knee lets UnrealBloom flood
// the whole frame (the P1 full-tier whiteout). The per-state knees below keep
// only true HDR sources blooming — sun glitter (~1.6), moon-road sparkles
// (~1.7), and the warm emissive cores (beacon ~3–7, lantern cores ~2) —
// while sky, fog, water bands, and reflection pools stay below the knee.
const BLOOM_THRESHOLD_NIGHT = 0.95;
const BLOOM_THRESHOLD_DUSK = 0.9;
const BLOOM_THRESHOLD_DAY = 0.95;
// Bloom strength also follows the day cycle: the beacon's ~7-luminance HDR
// core at full strength smears a warm wash across the whole island at night,
// so night runs a gentler strength that keeps the beacon/lantern bloom golden
// and local; day keeps the full strength for the sun-glitter sparkle.
const BLOOM_STRENGTH_NIGHT = 0.55;
const BLOOM_STRENGTH_DUSK = 0.78;
const BLOOM_STRENGTH_DAY = 0.92;
const BLOOM_RADIUS = 0.6;
/**
 * W6.3 (Grand Scale Revamp): bloom runs at HALF the composer's resolution.
 *
 * `UnrealBloomPass` is a five-level mip pyramid — five downsample draws plus
 * five upsample draws — which made it the most expensive pass in the chain and
 * the reason it was shed at `recovery`. On an integrated GPU at 1080p that
 * meant the warm beacon and lantern glow, the single strongest piece of the
 * night identity, was almost never on screen.
 *
 * Bloom is low-frequency by construction: it is a blur. Halving its working
 * resolution quarters its fragment cost and is visually indistinguishable at
 * this radius, which buys it back at `recovery`.
 */
const BLOOM_RESOLUTION_SCALE = 0.5;

/**
 * A grade preset expressed as multipliers/offsets around neutral so day, dusk
 * and night can be linearly blended by the day cycle. Tints are multipliers
 * near white; a value of 1.0 leaves a channel untouched.
 */
interface GradePreset {
  gain: [number, number, number];
  gamma: [number, number, number];
  highlightTint: [number, number, number];
  lift: [number, number, number];
  saturation: number;
  shadowTint: [number, number, number];
  split: number;
  vignette: number;
}

// Night is the hero: shadows lifted just off black and cooled, highlights
// warmed, gentle resaturation, strong vignette. Day is the ukiyo-e morning
// (G5, decision D-R1 — supersedes the D1 pearl overcast): near-full
// saturation, no grey lift, warm highlights over cool-teal shadows, light
// vignette. Dusk splits warm/cool.
const NIGHT_GRADE: GradePreset = {
  gain: [1.03, 1.0, 0.98],
  gamma: [1.0, 1.0, 1.02],
  highlightTint: [1.12, 1.02, 0.84],
  lift: [0.012, 0.016, 0.03],
  saturation: 1.1,
  shadowTint: [0.84, 0.93, 1.08],
  split: 0.55,
  vignette: 0.36,
};
const DUSK_GRADE: GradePreset = {
  gain: [1.05, 1.0, 0.95],
  gamma: [1.0, 1.0, 1.0],
  highlightTint: [1.14, 1.0, 0.8],
  lift: [0.006, 0.006, 0.008],
  saturation: 1.06,
  shadowTint: [0.95, 0.97, 1.05],
  split: 0.5,
  vignette: 0.36,
};
const DAY_GRADE: GradePreset = {
  gain: [1.02, 1.0, 0.97],
  gamma: [1.0, 1.0, 1.0],
  highlightTint: [1.1, 1.02, 0.85],
  lift: [0.004, 0.004, 0.006],
  saturation: 0.97,
  shadowTint: [0.84, 0.96, 1.1],
  split: 0.5,
  vignette: 0.24,
};

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as unknown },
    uGain: { value: new Color(1, 1, 1) },
    uGamma: { value: new Color(1, 1, 1) },
    uHighlightTint: { value: new Color(1, 1, 1) },
    uLift: { value: new Color(0, 0, 0) },
    uSaturation: { value: 1 },
    uShadowTint: { value: new Color(1, 1, 1) },
    uSplit: { value: 0.5 },
    uVignette: { value: 0.4 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uGain;
    uniform vec3 uGamma;
    uniform vec3 uHighlightTint;
    uniform vec3 uLift;
    uniform float uSaturation;
    uniform vec3 uShadowTint;
    uniform float uSplit;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = max(texel.rgb, vec3(0.0));

      // lift / gamma / gain
      color = color * uGain + uLift;
      color = pow(max(color, vec3(0.0)), vec3(1.0) / uGamma);

      // split-tone: cool the shadows, warm the highlights
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      vec3 tone = mix(uShadowTint, uHighlightTint, smoothstep(0.0, 0.9, luma));
      color *= mix(vec3(1.0), tone, uSplit);

      // saturation around the graded luma
      float gradedLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(gradedLuma), color, uSaturation);

      // vignette
      float d = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.35, 0.85, d);
      color *= 1.0 - uVignette * vig;

      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

export interface GardenPost {
  dispose: () => void;
  getPassList: () => string[];
  isComposerEnabled: () => boolean;
  render: (deltaTime?: number) => void;
  setBloomEnabled: (enabled: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  setGrade: (dayMix: number, duskMix: number, nightMix: number) => void;
  setSize: (width: number, height: number, dpr: number) => void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The post pipeline: RenderPass -> UnrealBloomPass -> grade+vignette ShaderPass
 * -> OutputPass, drawn into a multisampled HDR target so MSAA survives the
 * composite. OutputPass owns the single tone-mapping + color-space step, so
 * scene materials (which only tone map on the default framebuffer) are never
 * double-processed while the composer is active.
 */
export function createGardenPost(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): GardenPost {
  const size = renderer.getSize(new Vector2());
  const dpr = renderer.getPixelRatio();
  const renderTarget = new WebGLRenderTarget(
    Math.max(1, Math.floor(size.width * dpr)),
    Math.max(1, Math.floor(size.height * dpr)),
    { samples: 4, type: HalfFloatType },
  );
  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(dpr);
  composer.setSize(size.width, size.height);

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new Vector2(
      Math.max(1, Math.round(size.width * BLOOM_RESOLUTION_SCALE)),
      Math.max(1, Math.round(size.height * BLOOM_RESOLUTION_SCALE)),
    ),
    BLOOM_STRENGTH_NIGHT,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD_NIGHT,
  );
  // `composer.setSize` fans out to every pass, so the half-resolution bloom
  // has to be re-applied after each one or it silently snaps back to full.
  const sizeBloom = (width: number, height: number): void => {
    bloomPass.setSize(
      Math.max(1, Math.round(width * BLOOM_RESOLUTION_SCALE)),
      Math.max(1, Math.round(height * BLOOM_RESOLUTION_SCALE)),
    );
  };
  sizeBloom(size.width, size.height);
  const gradePass = new ShaderPass(GRADE_SHADER);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);
  composer.addPass(outputPass);

  const grade = gradePass.uniforms;
  let enabled = true;

  function applyGrade(dayMix: number, duskMix: number): void {
    // Night is the base; lerp toward dusk then day, matching the day-cycle
    // blend used across the renderer.
    for (let i = 0; i < 3; i += 1) {
      const axis = i === 0 ? "r" : i === 1 ? "g" : "b";
      grade.uLift.value[axis] = lerp(lerp(NIGHT_GRADE.lift[i], DUSK_GRADE.lift[i], duskMix), DAY_GRADE.lift[i], dayMix);
      grade.uGamma.value[axis] = lerp(lerp(NIGHT_GRADE.gamma[i], DUSK_GRADE.gamma[i], duskMix), DAY_GRADE.gamma[i], dayMix);
      grade.uGain.value[axis] = lerp(lerp(NIGHT_GRADE.gain[i], DUSK_GRADE.gain[i], duskMix), DAY_GRADE.gain[i], dayMix);
      grade.uShadowTint.value[axis] = lerp(lerp(NIGHT_GRADE.shadowTint[i], DUSK_GRADE.shadowTint[i], duskMix), DAY_GRADE.shadowTint[i], dayMix);
      grade.uHighlightTint.value[axis] = lerp(lerp(NIGHT_GRADE.highlightTint[i], DUSK_GRADE.highlightTint[i], duskMix), DAY_GRADE.highlightTint[i], dayMix);
    }
    grade.uSaturation.value = lerp(lerp(NIGHT_GRADE.saturation, DUSK_GRADE.saturation, duskMix), DAY_GRADE.saturation, dayMix);
    grade.uSplit.value = lerp(lerp(NIGHT_GRADE.split, DUSK_GRADE.split, duskMix), DAY_GRADE.split, dayMix);
    grade.uVignette.value = lerp(lerp(NIGHT_GRADE.vignette, DUSK_GRADE.vignette, duskMix), DAY_GRADE.vignette, dayMix);
    // The bloom knee follows the same blend so the bright day sky/fog never
    // crosses it; night keeps the lowest knee for the Lantern Sea emissives.
    bloomPass.threshold = lerp(
      lerp(BLOOM_THRESHOLD_NIGHT, BLOOM_THRESHOLD_DUSK, duskMix),
      BLOOM_THRESHOLD_DAY,
      dayMix,
    );
    bloomPass.strength = lerp(
      lerp(BLOOM_STRENGTH_NIGHT, BLOOM_STRENGTH_DUSK, duskMix),
      BLOOM_STRENGTH_DAY,
      dayMix,
    );
  }
  applyGrade(0, 0);

  return {
    dispose() {
      composer.dispose();
      bloomPass.dispose();
      gradePass.dispose();
      outputPass.dispose();
    },
    getPassList() {
      if (!enabled) return [];
      return composer.passes
        .filter((pass) => pass.enabled)
        .map((pass) => {
          if (pass === renderPass) return "render";
          if (pass === bloomPass) return "bloom";
          if (pass === gradePass) return "grade";
          if (pass === outputPass) return "output";
          return "pass";
        });
    },
    isComposerEnabled() {
      return enabled;
    },
    render(deltaTime) {
      if (!enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      composer.render(deltaTime);
    },
    setBloomEnabled(bloomEnabled) {
      bloomPass.enabled = bloomEnabled;
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
    },
    setGrade(dayMix, duskMix) {
      applyGrade(dayMix, duskMix);
    },
    setSize(width, height, nextDpr) {
      composer.setPixelRatio(nextDpr);
      composer.setSize(width, height);
      sizeBloom(width, height);
    },
  };
}
