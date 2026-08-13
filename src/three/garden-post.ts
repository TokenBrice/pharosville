import { N8AOPostPass } from "n8ao";
import {
  BloomEffect,
  Effect,
  EffectAttribute,
  EffectComposer,
  EffectPass,
  BlendFunction,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";
import {
  Color,
  HalfFloatType,
  Uniform,
  Vector2,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from "three";

/**
 * Phase 1b (Breathtaking Rendering): one table owns every per-day-phase post
 * value — the grade preset, the bloom knee/strength, and the AO intensity.
 * The day cycle blends night → dusk → day over the whole record with the
 * same two scalars, so adding a phase-tuned post parameter is a table entry,
 * never a new runtime branch.
 *
 * Bloom knees: the V-plan knee (0.55) predates the Garden Sea: the bokashi
 * day sky/fog sits at ~0.7–0.8 linear luminance frame-wide and the full-tier
 * lantern pool ring overlaps to ~1.0 around the island, so a 0.55 knee lets
 * bloom flood the whole frame (the P1 full-tier whiteout). The knees below
 * keep only true HDR sources blooming — sun glitter (~1.6), moon-road
 * sparkles (~1.7), and the warm emissive cores (beacon ~3–7, lantern cores
 * ~2) — while sky, fog, water bands, and reflection pools stay below.
 *
 * Bloom strength also follows the day cycle: the beacon's ~7-luminance HDR
 * core at full strength smears a warm wash across the whole island at night,
 * so night runs a gentler strength that keeps the beacon/lantern bloom golden
 * and local; day keeps the full strength for the sun-glitter sparkle.
 *
 * AO intensity is N8AO's `pow(ao, intensity)` exponent — higher darkens
 * occluded areas more. Night is the hero (strongest grounding under the
 * emissives); day runs the softest curve because the bright diffuse already
 * shows contact shadowing.
 */
interface PostPhaseConfig {
  aoIntensity: number;
  bloomStrength: number;
  bloomThreshold: number;
  grade: GradePreset;
  /**
   * Phase 2 storm coupling: scalars applied on top of the day-phase blend,
   * scaled by the weather system's stormLevel — the same table-driven blend
   * law, never a runtime branch. The wet-glow look: the bloom knee drops and
   * the strength rises, so wet highlights (sun glitter, moon road, lantern
   * pools) flare against the darkened sky, and the lift nudges cool.
   */
  stormBloomStrength: number;
  stormBloomThreshold: number;
  stormLift: [number, number, number];
}

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
  vignette: 0.32,
};

const POST_PHASE_NIGHT: PostPhaseConfig = {
  aoIntensity: 5,
  bloomStrength: 0.55,
  bloomThreshold: 0.95,
  grade: NIGHT_GRADE,
  stormBloomStrength: 0.22,
  stormBloomThreshold: 0.05,
  stormLift: [0.004, 0.008, 0.02],
};
const POST_PHASE_DUSK: PostPhaseConfig = {
  aoIntensity: 4,
  bloomStrength: 0.78,
  bloomThreshold: 0.9,
  grade: DUSK_GRADE,
  stormBloomStrength: 0.26,
  stormBloomThreshold: 0.06,
  stormLift: [0.004, 0.008, 0.02],
};
const POST_PHASE_DAY: PostPhaseConfig = {
  aoIntensity: 3,
  bloomStrength: 0.92,
  bloomThreshold: 0.95,
  grade: DAY_GRADE,
  stormBloomStrength: 0.3,
  stormBloomThreshold: 0.07,
  stormLift: [0.005, 0.009, 0.022],
};

// UnrealBloomPass was a fixed five-level mip pyramid; keep the same depth so
// the glow spread stays the size the day-cycle grades were tuned against.
const BLOOM_MIP_LEVELS = 5;
// UnrealBloomPass's hard knee was `smoothstep(threshold, threshold + 0.01, l)`.
// The pmndrs LuminanceMaterial uses the identical expression, so the same
// 0.01 smoothing range keeps the knee bit-faithful.
const BLOOM_LUMINANCE_SMOOTHING = 0.01;
const BLOOM_RADIUS = 0.6;

/**
 * W0.3: how much bloom intensity a full lightning stroke adds.
 *
 * The grade's `flash` add cannot feed bloom — the grade pass runs AFTER the
 * bloom pass (see the chain comment on createGardenPost), so the bloom
 * luminance prefilter has already sampled the frame by the time the flash is
 * added. What the bloom pass DOES see is the strike's other half: the world
 * lights up for real, because `world-renderer.ts` multiplies the shadow-casting
 * key light by `1 + lightning * 2.2` for the ~0.3 s envelope. Every wet
 * highlight the storm rows were tuned around — sun glitter, moon road, lantern
 * pools — is genuinely brighter in the bloom input during a stroke.
 *
 * So the flare is bought by lifting bloom's intensity on the same envelope
 * rather than by re-adding the flash before bloom: no second full-screen pass,
 * no second luminance prefilter, and the grade's flash add stays exactly as it
 * was (the frame is not brightened twice — this only widens the glow around
 * highlights the strike itself lit). Deliberately modest: at a night storm
 * peak this takes bloom from ~0.77 to ~1.12 for a third of a second.
 * Preview-tunable, like the phase table above.
 */
const BLOOM_FLASH_INTENSITY = 0.35;

/**
 * W6.3 (Grand Scale Revamp) ran UnrealBloomPass at HALF the composer's
 * resolution because its pyramid made it the most expensive pass in the
 * chain — the reason it was shed at `recovery`. The pmndrs BloomEffect
 * supersedes that trade-off: its mipmapBlur pyramid downsamples the frame
 * geometrically by construction (each level half the previous), so the blur
 * work — the bulk of bloom's cost — runs at the same effective resolutions
 * the old half-res pipeline did, with only the luminance prefilter at full
 * res. The warm beacon and lantern glow stays affordable at `recovery`.
 */

/**
 * N8AO (Phase 1b): half-res AO with depth-aware upsampling at the
 * "Performance" sample counts (8 AO / 4 denoise) — the conservative end of
 * the library's presets, picked for the 700-draw-call / p90 ≤ 20 ms budget.
 * The radius is in world units: the island rock is ~14 units across and a
 * ship hull a few, so 2 units grounds hulls, docks and terraces without
 * reading as an edge detector. Preview-tunable, like the phase table above.
 *
 * Sample counts and halfRes are set ONCE here: changing them recompiles the
 * AO shaders, so the scheduler never touches them per tier — tier policy
 * rides on the pass toggle and the uniform-level radius/intensity scales
 * below instead.
 */
const AO_RADIUS = 2;
const AO_DISTANCE_FALLOFF = 1;
/** Uniform-level tier scales — cheap to change, no shader recompile. */
const AO_BALANCED_RADIUS_SCALE = 0.7;
const AO_BALANCED_INTENSITY_SCALE = 0.85;

export type GardenAOQuality = "full" | "balanced";

/**
 * The day-cycle grade, ported bit-faithful from the old ShaderPass fragment
 * to the pmndrs `mainImage` convention. Runs on the linear HDR frame BEFORE
 * tone mapping, exactly as the old chain did (grade ShaderPass ahead of
 * OutputPass). `uv` replaces `vUv` for the vignette; the math is unchanged.
 */
const GRADE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 gain;
  uniform vec3 gamma;
  uniform vec3 highlightTint;
  uniform vec3 lift;
  uniform float saturation;
  uniform vec3 shadowTint;
  uniform float split;
  uniform float vignette;
  uniform float flash;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 color = max(inputColor.rgb, vec3(0.0));

    // lift / gamma / gain
    color = color * gain + lift;
    color = pow(max(color, vec3(0.0)), vec3(1.0) / gamma);

    // split-tone: cool the shadows, warm the highlights
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 tone = mix(shadowTint, highlightTint, smoothstep(0.0, 0.9, luma));
    color *= mix(vec3(1.0), tone, split);

    // saturation around the graded luma
    float gradedLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(gradedLuma), color, saturation);

    // vignette
    float d = distance(uv, vec2(0.5));
    float vig = smoothstep(0.35, 0.85, d);
    color *= 1.0 - vignette * vig;

    // Phase 2 lightning: a full-screen cool-white flash, added AFTER the
    // vignette so the whole frame lights at once. This add does NOT feed bloom
    // — the grade pass runs after the bloom pass, so the prefilter never sees
    // it (the claim that it did was wrong from Phase 2 until W0.3 corrected
    // it). The strike's glow flare is bought on the bloom side instead, via
    // BLOOM_FLASH_INTENSITY; this term stays the direct, unbloomed lift.
    color += flash * vec3(0.75, 0.82, 1.0);

    outputColor = vec4(color, inputColor.a);
  }
`;

/**
 * The day-cycle grade as a pmndrs effect. BlendFunction.SRC because the
 * effect rewrites the whole texel (like the old ShaderPass) rather than
 * compositing over it.
 */
class GardenGradeEffect extends Effect {
  constructor() {
    super("GardenGrade", GRADE_FRAGMENT_SHADER, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ["gain", new Uniform(new Color(1, 1, 1))],
        ["gamma", new Uniform(new Color(1, 1, 1))],
        ["highlightTint", new Uniform(new Color(1, 1, 1))],
        ["lift", new Uniform(new Color(0, 0, 0))],
        ["saturation", new Uniform(1)],
        ["shadowTint", new Uniform(new Color(1, 1, 1))],
        ["split", new Uniform(0.5)],
        ["vignette", new Uniform(0.4)],
        ["flash", new Uniform(0)],
      ]),
    });
  }
}

export interface GardenPost {
  dispose: () => void;
  // The returned array is a reused internal buffer: read it within the frame,
  // do not retain it across frames.
  getPassList: () => string[];
  isComposerEnabled: () => boolean;
  render: (deltaTime?: number) => void;
  /** Eased scheduler fidelity weight (0 disables AO, 1 applies full tier weight). */
  setAOTierWeight: (weight: number) => void;
  /** Compatibility shorthand for an immediate 0/1 tier weight. */
  setAOEnabled: (enabled: boolean) => void;
  setAOQuality: (quality: GardenAOQuality) => void;
  /** Eased overview-LOD detail (0 at whole-map zoom, 1 at detail zoom). */
  setAOZoomDetail: (detail: number) => void;
  setBloomEnabled: (enabled: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  // No nightMix: night is the base of the blend (as in `blendScalar`), and the
  // day cycle derives it as `1 - daylight - dusk` anyway, so it carries nothing.
  // Phase 2: stormLevel applies the table's storm scalars (wet-glow bloom,
  // cool lift) on top of the phase blend; flash is the lightning envelope.
  // W0.3: flash drives BOTH the grade's direct cool-white add and a clamped
  // lift on bloom intensity, which is the only way a stroke can reach bloom
  // from here — the grade pass runs after the bloom pass.
  setGrade: (dayMix: number, duskMix: number, stormLevel?: number, flash?: number) => void;
  setSize: (width: number, height: number, dpr: number) => void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampUnit(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** applyGrade runs once per frame; the storm-lift blend reuses this scratch. */
const scratchTriple: [number, number, number] = [0, 0, 0];

function lerpTripleInto(
  out: [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): void {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

function uniform<T>(effect: Effect, name: string): Uniform<T> {
  const found = effect.uniforms.get(name) as Uniform<T> | undefined;
  if (!found) throw new Error(`Missing ${effect.name} uniform: ${name}`);
  return found;
}

interface DisposableResource {
  dispose: () => void;
}

interface N8AOFullscreenQuadRuntime {
  material?: unknown;
  _mesh?: {
    geometry?: unknown;
    material?: unknown;
  };
}

/**
 * n8ao@2.0.0 does not override postprocessing's generic Pass.dispose().
 * These are its renderer-owned fields; the composer-provided depth texture,
 * scene, and camera are intentionally absent because N8AO does not own them.
 */
const N8AO_OWNED_RESOURCE_KEYS = [
  "accumulationRenderTarget",
  "bluenoise",
  "depthDownsampleTarget",
  "neuralDenoiseMaterial",
  "outputTargetInternal",
  "readTargetInternal",
  "standardDenoiseMaterial",
  "transparencyRenderTargetDWFalse",
  "transparencyRenderTargetDWTrue",
  "writeTargetInternal",
] as const;

const N8AO_FULLSCREEN_QUAD_KEYS = [
  "accumulationQuad",
  "copyQuad",
  "depthCopyPass",
  "depthDownsampleQuad",
  "effectCompositerQuad",
  "effectShaderQuad",
  "poissonBlurQuad",
] as const;

// N8AO's FullScreenTriangle module shares one geometry across every pass
// instance. Dispose it only when the last GardenPost owner is gone.
const n8aoGeometryOwners = new Map<DisposableResource, number>();

function disposable(value: unknown): DisposableResource | null {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return null;
  const candidate = value as Partial<DisposableResource>;
  return typeof candidate.dispose === "function" ? candidate as DisposableResource : null;
}

function installN8AODisposalAdapter(pass: N8AOPostPass): void {
  const runtime = pass as unknown as Record<string, unknown>;
  const sharedGeometries = new Set<DisposableResource>();

  for (const key of N8AO_FULLSCREEN_QUAD_KEYS) {
    const quad = runtime[key] as N8AOFullscreenQuadRuntime | undefined;
    const geometry = disposable(quad?._mesh?.geometry);
    if (geometry) sharedGeometries.add(geometry);
  }
  for (const geometry of sharedGeometries) {
    n8aoGeometryOwners.set(geometry, (n8aoGeometryOwners.get(geometry) ?? 0) + 1);
  }

  let disposed = false;
  pass.dispose = () => {
    if (disposed) return;
    disposed = true;

    const resources = new Set<DisposableResource>();
    for (const key of N8AO_OWNED_RESOURCE_KEYS) {
      const resource = disposable(runtime[key]);
      if (resource) resources.add(resource);
    }
    for (const key of N8AO_FULLSCREEN_QUAD_KEYS) {
      const quad = runtime[key] as N8AOFullscreenQuadRuntime | undefined;
      const publicMaterial = disposable(quad?.material);
      const meshMaterial = disposable(quad?._mesh?.material);
      if (publicMaterial) resources.add(publicMaterial);
      if (meshMaterial) resources.add(meshMaterial);
    }
    for (const resource of resources) resource.dispose();

    for (const geometry of sharedGeometries) {
      const remainingOwners = (n8aoGeometryOwners.get(geometry) ?? 1) - 1;
      if (remainingOwners > 0) {
        n8aoGeometryOwners.set(geometry, remainingOwners);
      } else {
        n8aoGeometryOwners.delete(geometry);
        geometry.dispose();
      }
    }
  };
}

/**
 * The post pipeline, on pmndrs/postprocessing (Phase 1 of the breathtaking
 * rendering plan — supersedes the three/examples EffectComposer stack):
 *
 *   RenderPass → N8AOPostPass (AO on scene color) → EffectPass(BloomEffect) →
 *   EffectPass(GardenGrade + ToneMapping AGX, fused) → EffectPass(SMAA)
 *
 * drawn through a multisampled (4×) HalfFloat frame buffer so MSAA survives
 * the composite. Tone mapping and color-space output each happen exactly
 * once: the ToneMappingEffect reuses three's own `tonemapping_pars_fragment`
 * AgX (including `toneMappingExposure`, fed by the renderer), and the final
 * pass encodes sRGB via the EffectMaterial's `colorspace_fragment` when it
 * renders to screen — the renderer only applies either when rendering to the
 * canvas directly, so scene materials are never double-processed. SMAA runs
 * last, on the LDR result, per the pmndrs convention.
 *
 * The AO pass sets `needsDepthTexture`, which makes the composer carry depth
 * textures and blit the multisampled scene depth into a stable target once
 * per frame — the cost AO pays for reading depth; nothing else uses it.
 */
export function createGardenPost(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): GardenPost {
  const size = renderer.getDrawingBufferSize(new Vector2());
  /**
   * W0.2 anti-aliasing rationalization — DECIDED 2026-08-13, keep BOTH stages.
   *
   * The frame used to pay for AA three times: canvas MSAA (`antialias: true`),
   * this 4× multisampled HalfFloat buffer, and the final SMAA pass. The canvas
   * MSAA was pure waste — the composer never presents scene geometry to the
   * default framebuffer, so all it bought was a multisampled default
   * framebuffer to allocate and resolve on every present. `world-renderer.ts`
   * now builds the renderer with `antialias: false`; that is banked and free.
   *
   * The other two stages were A/B'd on the real GPU (Apple M5 Pro, ANGLE
   * Metal, tier full, `scripts/pharosville/preview.mjs` — never Playwright),
   * scored against a 2× supersampled capture of the same reduced-motion frame
   * downsampled to 1×, which is the closest thing to ground truth this harness
   * can produce. Lower RMSE = closer to ground truth = better AA:
   *
   *              day RMSE / MAE      night RMSE / MAE   textures
   *   (a) 4×MSAA + SMAA   7.071 / 1.608   2.536 / 0.763     61
   *   (b) 4×MSAA only     7.176 / 1.645   2.752 / 0.803     57
   *   (c) SMAA only       7.449 / 1.849   3.556 / 1.114     61
   *
   * Repeat runs of (a) landed within ±0.01 RMSE, so both deltas are real.
   * (c) is not close: dropping multisampling BREAKS the ship rigging, which is
   * sub-pixel-thin geometry SMAA cannot reconstruct because the coverage
   * information is already gone by the time it sees the frame — the stays read
   * as dotted lines, and masonry edges stair-step. (b) is subtler but still
   * loses: the lighthouse lantern-cage hoop steps visibly, and night — thin
   * bright emissives against a dark sky, the hero phase — is where it costs
   * the most (+8.5 % RMSE).
   *
   * And it buys nothing measurable. The frame is vsync-bound at 120 fps /
   * p50 8.3 ms in EVERY configuration, at 1600×1000 and at the 8 MPix surface
   * cap alike, so the harness cannot resolve the SMAA pass's cost at all. Per
   * the decision rule — keep the best-looking option that saves a pass, but
   * keep (a) if any configuration visibly degrades — (a) stays. The reclaimed
   * headroom W2.3/W2.4 were promised is therefore the canvas MSAA resolve and
   * its buffer, not a shed pass; do not budget those tasks against a saved
   * SMAA pass that was never saved.
   *
   * TAA/TRAA remain contractually rejected (ghosting on bobbing ships).
   */
  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling: 4,
  });

  const renderPass = new RenderPass(scene, camera);

  // N8AO on the orthographic camera: the library injects `#define ORTHO`
  // reconstruction paths for isOrthographicCamera (verified for the AO,
  // denoise and compositer shaders; the half-res depth downsample uses the
  // runtime `ortho` uniform). Ortho depth is linear, so position
  // reconstruction is exact. The compositer only receives the define through
  // a configuration-proxy reconfigure — setting halfRes below is what
  // supplies it, so the assignment order here is load-bearing.
  const n8aoPass = new N8AOPostPass(scene, camera, size.width, size.height);
  // Transparency double-rendering would render every transparent object twice
  // more per frame (two extra scene passes plus per-frame scene traversals) —
  // untenable inside the draw-call budget. Disabling the auto-detection keeps
  // AO depth-only; depth-writing transparent surfaces (the sea) still ground
  // correctly, per the library's own transparency notes.
  n8aoPass.autoDetectTransparency = false;
  if (n8aoPass.configuration.transparencyAware) {
    n8aoPass.configuration.transparencyAware = false;
  }
  // One-time quality setup: these recompile the AO shaders, so they happen
  // here and never again (see the AO comment block above).
  n8aoPass.setQualityMode("Performance");
  n8aoPass.configuration.halfRes = true;
  n8aoPass.configuration.aoRadius = AO_RADIUS;
  n8aoPass.configuration.distanceFalloff = AO_DISTANCE_FALLOFF;
  installN8AODisposalAdapter(n8aoPass);

  // UnrealBloom→BloomEffect mapping: threshold→luminanceThreshold (same
  // smoothstep knee, see BLOOM_LUMINANCE_SMOOTHING), strength→intensity
  // (bloom output scaled before blending), radius→radius, 5-level pyramid→
  // levels. BlendFunction.ADD reproduces UnrealBloomPass's additive composite
  // (`scene + strength · bloom`) — the default SCREEN would soften the HDR
  // add the grades were tuned against.
  const bloomEffect = new BloomEffect({
    blendFunction: BlendFunction.ADD,
    intensity: POST_PHASE_NIGHT.bloomStrength,
    levels: BLOOM_MIP_LEVELS,
    luminanceSmoothing: BLOOM_LUMINANCE_SMOOTHING,
    luminanceThreshold: POST_PHASE_NIGHT.bloomThreshold,
    mipmapBlur: true,
    radius: BLOOM_RADIUS,
  });
  const bloomPass = new EffectPass(camera, bloomEffect);

  const gradeEffect = new GardenGradeEffect();
  // ToneMappingEffect with AGX resolves `toneMapping()` to three's
  // AgXToneMapping shader chunk — the same curve, exposure uniform and all,
  // that OutputPass applied in the old chain.
  const toneMappingEffect = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  // Grade and tone mapping share one pass so they fuse into a single
  // full-screen draw (both are attribute-free, so registration order holds).
  const gradePass = new EffectPass(camera, gradeEffect, toneMappingEffect);

  const smaaEffect = new SMAAEffect();
  // SMAAEffect requests a depth texture unconditionally, but it only reads
  // depth for predicated edge detection, which is disabled here. Dropping the
  // DEPTH attribute keeps the composer's depth machinery owned by the AO pass
  // alone. (Not in the public type surface — the field is public at runtime
  // and read once when the pass builds its material.)
  (smaaEffect as unknown as { attributes: EffectAttribute }).attributes = EffectAttribute.CONVOLUTION;
  const smaaPass = new EffectPass(camera, smaaEffect);

  composer.addPass(renderPass);
  composer.addPass(n8aoPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);
  composer.addPass(smaaPass);

  const gradeUniforms = {
    gain: uniform<Color>(gradeEffect, "gain"),
    gamma: uniform<Color>(gradeEffect, "gamma"),
    highlightTint: uniform<Color>(gradeEffect, "highlightTint"),
    lift: uniform<Color>(gradeEffect, "lift"),
    saturation: uniform<number>(gradeEffect, "saturation"),
    shadowTint: uniform<Color>(gradeEffect, "shadowTint"),
    split: uniform<number>(gradeEffect, "split"),
    vignette: uniform<number>(gradeEffect, "vignette"),
    flash: uniform<number>(gradeEffect, "flash"),
  };
  const bloomLuminance = bloomEffect.luminanceMaterial;
  const aoConfiguration = n8aoPass.configuration;
  let enabled = true;
  let aoTierWeight = 1;
  let aoQuality: GardenAOQuality = "full";
  let aoZoomDetail = 1;
  let phaseAOIntensity = POST_PHASE_NIGHT.aoIntensity;
  const passList: string[] = [];

  function syncAOPass(): void {
    // The pass costs nothing at whole-map zoom: the overview-LOD detail
    // scalar fades AO out over the same zoom band that sheds the small props,
    // and at zero the pass is skipped outright. AO is a grounding FIDELITY,
    // not a colour — the painted contact discs stay rendered at every tier
    // and zoom, so the grounding intent never leaves the frame.
    n8aoPass.enabled = enabled && aoTierWeight > 0 && aoZoomDetail > 0;
    const intensityScale = aoQuality === "full" ? 1 : AO_BALANCED_INTENSITY_SCALE;
    aoConfiguration.intensity = phaseAOIntensity
      * intensityScale
      * Math.max(aoZoomDetail, 0)
      * aoTierWeight;
    const radiusScale = aoQuality === "full" ? 1 : AO_BALANCED_RADIUS_SCALE;
    aoConfiguration.aoRadius = AO_RADIUS * radiusScale;
  }

  function applyGrade(dayMix: number, duskMix: number, stormLevel = 0, flash = 0): void {
    // Night is the base; lerp toward dusk then day, matching the day-cycle
    // blend used across the renderer. Uniform values are mutated in place:
    // this runs once per frame, so nothing here may allocate.
    const storm = Math.min(1, Math.max(0, stormLevel));
    lerpTripleInto(scratchTriple, POST_PHASE_NIGHT.stormLift, POST_PHASE_DUSK.stormLift, duskMix);
    lerpTripleInto(scratchTriple, scratchTriple, POST_PHASE_DAY.stormLift, dayMix);
    for (let i = 0; i < 3; i += 1) {
      const axis = i === 0 ? "r" : i === 1 ? "g" : "b";
      gradeUniforms.lift.value[axis] = lerp(lerp(NIGHT_GRADE.lift[i], DUSK_GRADE.lift[i], duskMix), DAY_GRADE.lift[i], dayMix)
        + storm * scratchTriple[i]!;
      gradeUniforms.gamma.value[axis] = lerp(lerp(NIGHT_GRADE.gamma[i], DUSK_GRADE.gamma[i], duskMix), DAY_GRADE.gamma[i], dayMix);
      gradeUniforms.gain.value[axis] = lerp(lerp(NIGHT_GRADE.gain[i], DUSK_GRADE.gain[i], duskMix), DAY_GRADE.gain[i], dayMix);
      gradeUniforms.shadowTint.value[axis] = lerp(lerp(NIGHT_GRADE.shadowTint[i], DUSK_GRADE.shadowTint[i], duskMix), DAY_GRADE.shadowTint[i], dayMix);
      gradeUniforms.highlightTint.value[axis] = lerp(lerp(NIGHT_GRADE.highlightTint[i], DUSK_GRADE.highlightTint[i], duskMix), DAY_GRADE.highlightTint[i], dayMix);
    }
    gradeUniforms.saturation.value = lerp(lerp(NIGHT_GRADE.saturation, DUSK_GRADE.saturation, duskMix), DAY_GRADE.saturation, dayMix);
    gradeUniforms.split.value = lerp(lerp(NIGHT_GRADE.split, DUSK_GRADE.split, duskMix), DAY_GRADE.split, dayMix);
    gradeUniforms.vignette.value = lerp(lerp(NIGHT_GRADE.vignette, DUSK_GRADE.vignette, duskMix), DAY_GRADE.vignette, dayMix);
    gradeUniforms.flash.value = flash;
    // The bloom knee follows the same blend so the bright day sky/fog never
    // crosses it; night keeps the lowest knee for the Lantern Sea emissives.
    // The storm rows then drop the knee and raise the strength for the
    // wet-glow look — floored so a full storm can never open the knee onto
    // the plain sky.
    const stormThreshold = lerp(
      lerp(POST_PHASE_NIGHT.stormBloomThreshold, POST_PHASE_DUSK.stormBloomThreshold, duskMix),
      POST_PHASE_DAY.stormBloomThreshold,
      dayMix,
    );
    bloomLuminance.threshold = Math.max(
      0.55,
      lerp(
        lerp(POST_PHASE_NIGHT.bloomThreshold, POST_PHASE_DUSK.bloomThreshold, duskMix),
        POST_PHASE_DAY.bloomThreshold,
        dayMix,
      ) - storm * stormThreshold,
    );
    // W0.3: the strike's flare. The lightning envelope peaks above 1 (the
    // double stroke sums two decays), so it is clamped before it reaches the
    // bloom knee — a stroke may widen the glow, never blow the frame out.
    // See BLOOM_FLASH_INTENSITY for why this rides on intensity rather than on
    // the grade's flash add, which the bloom prefilter cannot see.
    const strike = clampUnit(flash);
    bloomEffect.intensity = lerp(
      lerp(POST_PHASE_NIGHT.bloomStrength, POST_PHASE_DUSK.bloomStrength, duskMix),
      POST_PHASE_DAY.bloomStrength,
      dayMix,
    ) + storm * lerp(
      lerp(POST_PHASE_NIGHT.stormBloomStrength, POST_PHASE_DUSK.stormBloomStrength, duskMix),
      POST_PHASE_DAY.stormBloomStrength,
      dayMix,
    ) + strike * BLOOM_FLASH_INTENSITY;
    phaseAOIntensity = lerp(
      lerp(POST_PHASE_NIGHT.aoIntensity, POST_PHASE_DUSK.aoIntensity, duskMix),
      POST_PHASE_DAY.aoIntensity,
      dayMix,
    );
    syncAOPass();
  }
  applyGrade(0, 0);

  return {
    dispose() {
      // The N8AO pass carries a local adapter because n8ao@2.0.0's inherited
      // generic disposal does not reach its fullscreen-triangle wrappers.
      // The composer owns every other pass, both frame buffers, and copy pass.
      composer.dispose();
    },
    getPassList() {
      passList.length = 0;
      if (enabled) {
        passList.push("render");
        if (n8aoPass.enabled) passList.push("n8ao");
        if (bloomPass.enabled) passList.push("bloom");
        // "output" is the tone-map/sRGB stage, now fused into the grade pass.
        passList.push("grade", "output", "smaa");
      }
      return passList;
    },
    isComposerEnabled() {
      return enabled;
    },
    render(deltaTime) {
      if (!enabled) {
        // The composer permanently disables the renderer's autoClear, so the
        // direct fallback must clear explicitly.
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(scene, camera);
        return;
      }
      composer.render(deltaTime);
    },
    setAOTierWeight(weight) {
      aoTierWeight = clampUnit(weight);
      syncAOPass();
    },
    setAOEnabled(aoEnabled) {
      aoTierWeight = aoEnabled ? 1 : 0;
      syncAOPass();
    },
    setAOQuality(quality) {
      aoQuality = quality;
      syncAOPass();
    },
    setAOZoomDetail(detail) {
      aoZoomDetail = detail;
      syncAOPass();
    },
    setBloomEnabled(bloomEnabled) {
      // Pass-level toggle: the composer skips disabled passes outright, which
      // is cheaper than rebuilding the chain — and the grade/tone-map/SMAA
      // stages stay on at every tier (tier color invariance).
      bloomPass.enabled = bloomEnabled;
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      syncAOPass();
    },
    setGrade(dayMix, duskMix, stormLevel = 0, flash = 0) {
      applyGrade(dayMix, duskMix, stormLevel, flash);
    },
    setSize(width, height, _dpr) {
      // pmndrs sizes its buffers from the renderer's drawing buffer size, so
      // DPR is already accounted for by the time world-renderer calls this;
      // the parameter stays only to keep the signature stable.
      composer.setSize(width, height);
    },
  };
}
