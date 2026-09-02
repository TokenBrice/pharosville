import { N8AOPostPass } from "n8ao";
import {
  BloomEffect,
  Effect,
  EffectAttribute,
  EffectComposer,
  EffectPass,
  BlendFunction,
  RenderPass,
  ShaderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";
import {
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  NearestFilter,
  NoBlending,
  NoColorSpace,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Uniform,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type OrthographicCamera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import type { TextureOwnerManifestEntry } from "../renderer/render-types";

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
 * keep only true HDR sources blooming, while sky, fog, water bands, and
 * reflection pools stay below.
 *
 * W1.3 (2026-08-13) re-derived the knees from what the frame ACTUALLY hands
 * the prefilter, because the older figures above conflated `emissiveIntensity`
 * with the relative luminance the LuminanceMaterial computes. The prefilter
 * sees the linear HDR frame BEFORE the grade and before AgX, so an emissive
 * surface reaches it at `emissiveIntensity * luminance(emissiveColorLinear)`,
 * and every warm emitter in this world is `lantern_warm` (#d49a3e), whose
 * linear relative luminance is 0.371 — not 1. Recomputed against the shipped
 * drivers, at night:
 *
 *   harbor lantern core   2.08 (garden-day-cycle) * 0.371  ≈ 0.77
 *   ship lantern core     1.95 * 0.371                     ≈ 0.72
 *   lantern pool ring     painted reflection disc          ≈ 1.0
 *   moon-road glitter     garden-water `* 2.6` on a pale road colour ≈ 1.7–2.1
 *   beacon fire core      uIntensity ~7.2, near-white       ≈ 4–6
 *   sun glitter (day)     garden-water `* 1.7`              ≈ 1.4–1.7
 *   day sky / haze band                                     ≈ 0.7–0.8
 *
 * Two things follow from that ordering, and the second one is the surprise.
 *
 * First: at the old 0.95 knee the LANTERNS WERE ALREADY BELOW IT. Every warm
 * halo visible around a lantern at night is painted geometry, not bloom. So
 * raising the night knee cannot cost lantern glow — and, symmetrically, no
 * knee that keeps the moon road (~1.7–2.1) quiet could ever have made lanterns
 * bloom. The night knee therefore moves above the lantern pool ring, to 1.55
 * with a wide 0.45 shoulder, which leaves the intended hierarchy: beacon
 * dominant, moon road a quiet secondary at ~25 % weight on its shoulder,
 * everything else ember.
 *
 * Second, and this is why W1.3 did NOT go on to add a SelectiveBloomEffect:
 * the night frame's milkiness is not bloom at all. A/B'd on the real GPU
 * (Apple M5 Pro, ANGLE Metal, tier full, `preview.mjs` at `#t=22&n=1`, one
 * commit, only this row changed), the old row against the new one moves the
 * whole frame's mean luminance by 0.17 codes of 255 — open water by 0.20, the
 * dock lantern cluster by 0.01, the beacon by -0.24, the moon road by +1.64.
 * Almost nothing in a night frame except the beacon and the tips of the moon
 * road crosses even the OLD knee. The wash the plan wanted removed is the
 * painted reflection discs and the water shader, which live in `garden-water`
 * and `garden-island`, not here. An emissive-luminance mask was therefore not
 * added: selectivity isolates emitters from a bloom that is drowning them, and
 * measurement says this bloom is not drowning anything. The escalation would
 * have bought a second luminance target and a mask pass to solve a problem in
 * a different file. What this retune does buy is structural and cheap: the
 * pool ring's marginal contribution leaves, the energy goes to the beacon
 * (strength 0.55 → 0.80), and the day knee stops sitting 19 % above a haze
 * band that other work is actively re-authoring.
 *
 * Day is the mirror case: the sky is the brightest thing in the frame by area,
 * and "crisp day" means bloom must not be able to reach it even if the bokashi
 * wipe drifts. The 0.95 knee left only a 19 % margin over the haze band; 1.20
 * leaves 50 %, and still sits under the sun glitter, which is the one thing by
 * day that is supposed to sparkle. Dusk splits the difference at 1.15 with a
 * wide shoulder, because warm pools ARE the dusk look.
 *
 * Bloom strength also follows the day cycle. Night's old 0.55 was a defensive
 * number set when the whole pool ring was blooming; with the wash gone, the
 * beacon is nearly alone above the knee and can be given back its presence
 * (0.80) without smearing the island. Day keeps its strength for the glitter.
 *
 * Smoothing and radius are per-phase for the same reason. The knee's shoulder
 * width is what turns a threshold into a hierarchy — a hard 0.01 knee makes
 * every source either fully in or fully out, which is precisely the flat look
 * W1.3 exists to fix — and the mipmap radius is what separates a tight day
 * sparkle (0.50) from a beacon that breathes at night (0.72). Both are plain
 * uniforms: `LuminanceMaterial.smoothing` writes `uniforms.smoothing` (its
 * `defines.THRESHOLD` write is a no-op here, since the threshold is never 0
 * and nothing sets `needsUpdate`), and `MipmapBlurPass.radius` is a uniform on
 * the upsample material. Neither recompiles a shader, so both are safe on the
 * per-frame day-cycle path — unlike N8AO's sample counts.
 *
 * AO intensity is N8AO's `pow(ao, intensity)` exponent — higher darkens
 * occluded areas more. Night is the hero (strongest grounding under the
 * emissives); day runs the softest curve because the bright diffuse already
 * shows contact shadowing.
 */
interface PostPhaseConfig {
  aoIntensity: number;
  /** Mipmap-blur spread: tight by day for crispness, wide at night to breathe. */
  bloomRadius: number;
  /** Width of the knee's shoulder above `bloomThreshold` (the smoothstep range). */
  bloomSmoothing: number;
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
  /**
   * W1.4 (bokashi bias): how far the radial vignette's weight is shifted from
   * the bottom of the frame to the top. 0 is the symmetric corner vignette this
   * shipped with; at 0.45 the top corners carry 1.45x the darkening and the
   * bottom corners 0.55x, so the falloff reads as Hiroshige's graded indigo
   * band across the sky rather than as a lens artifact. The TOTAL darkening is
   * roughly preserved — this redistributes the shipped vignette, it does not
   * add to it, which is why the tuned `vignette` values above are untouched.
   *
   * The full bokashi sky work is W1.4's other half and belongs to
   * `garden-sky.ts`; this is only the post-side bias.
   */
  vignetteBias: number;
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
  vignetteBias: 0.25,
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
  vignetteBias: 0.35,
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
  vignetteBias: 0.45,
};

const POST_PHASE_NIGHT: PostPhaseConfig = {
  aoIntensity: 5,
  bloomRadius: 0.72,
  bloomSmoothing: 0.45,
  bloomStrength: 0.8,
  bloomThreshold: 1.55,
  grade: NIGHT_GRADE,
  stormBloomStrength: 0.22,
  stormBloomThreshold: 0.3,
  stormLift: [0.004, 0.008, 0.02],
};
const POST_PHASE_DUSK: PostPhaseConfig = {
  aoIntensity: 4,
  bloomRadius: 0.64,
  bloomSmoothing: 0.3,
  bloomStrength: 0.85,
  bloomThreshold: 1.15,
  grade: DUSK_GRADE,
  stormBloomStrength: 0.26,
  stormBloomThreshold: 0.25,
  stormLift: [0.004, 0.008, 0.02],
};
const POST_PHASE_DAY: PostPhaseConfig = {
  aoIntensity: 3,
  bloomRadius: 0.5,
  bloomSmoothing: 0.2,
  bloomStrength: 0.92,
  bloomThreshold: 1.2,
  grade: DAY_GRADE,
  stormBloomStrength: 0.3,
  stormBloomThreshold: 0.28,
  stormLift: [0.005, 0.009, 0.022],
};

// UnrealBloomPass was a fixed five-level mip pyramid; keep the same depth so
// the glow spread stays the size the day-cycle grades were tuned against.
const BLOOM_MIP_LEVELS = 5;
/**
 * The floor a full storm may never open the knee past.
 *
 * The storm rows subtract from the phase knee to buy the wet-glow flare, and
 * their subtraction had to grow with the W1.3 knees (0.05 off a 0.95 knee was
 * 5 %; the same 0.05 off 1.55 would have been noise). This floor is what keeps
 * that growth honest: 0.85 still sits above the day haze band (~0.7–0.8), so
 * no storm, at any phase blend, can open bloom onto plain sky. With the W1.3
 * rows the worst case lands at 0.90 (dusk), so the floor is a backstop against
 * future retunes rather than a clamp anything currently reaches.
 */
const BLOOM_STORM_THRESHOLD_FLOOR = 0.85;

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
 * peak this takes bloom from ~1.02 to ~1.37 for a third of a second (it was
 * ~0.77 to ~1.12 before the W1.3 retune raised night's base strength; the
 * add itself is unchanged, and it stays a third of the base either way).
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
 * W2.5 — MEASURED AND CLOSED, 2026-08-13. The plan asked whether a sustained
 * `full` tier should swap to a second, higher-quality AO pass built at boot
 * (quality modes recompile, so they can never be switched live). It should
 * not, and the reason is that the upgrade is not visible.
 *
 * A/B on the real GPU (Apple M5 Pro, ANGLE Metal, tier full, day, default
 * framing, 1600x1000, `scripts/pharosville/preview.mjs` — never Playwright),
 * "Performance" (8 AO / 4 denoise, denoiseRadius 12) against "High" (64 AO /
 * 8 denoise, denoiseRadius 6), everything else identical. Mean absolute
 * per-pixel luminance difference, in codes of 255:
 *
 *   island rock + terraces      0.61      dock cluster        1.13
 *   lighthouse masonry          0.43      hull waterlines     3.53
 *   OPEN WATER (no AO reaches it)         2.52
 *
 * The last row is the control and the whole answer: a region AO cannot touch
 * differs between the two runs by 2.52 codes purely from waves, bobbing hulls
 * and gulls moving between captures. Every AO-bearing STATIC surface differs
 * by LESS than that noise floor, and the mean luminance of those surfaces
 * moves by 0.04–0.09 codes. Eight times the AO samples buys a difference this
 * frame cannot carry — the half-res depth-aware upsample, the denoiser, and
 * then a painterly grade with an authored LUT over the top each blur away
 * more than the extra samples add. Night runs a stronger AO exponent (5 vs 3),
 * which scales those static-surface deltas to ~1 code: still under the floor.
 *
 * So there is no second pass here, and deliberately so: it would have cost a
 * second shader compile at boot, a second set of half-res AO/denoise targets
 * resident for the session, and a tier-fade-masked swap to keep correct, all
 * to buy nothing anyone can see. Re-open this only with a frame that shows the
 * difference, not with a sample count that sounds better.
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
/** Idle and load-tier fidelity eases share this 180 ms time constant. */
const POST_TIER_FADE_SECONDS = 0.18;

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
  uniform float vignetteBias;
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

    // vignette, biased toward the top edge (W1.4 bokashi bias). The radial
    // falloff is unchanged; its weight is redistributed up the frame, so the
    // sky band above the horizon carries the darkening and the water in the
    // near foreground keeps its light. At bias 0 this is the old symmetric
    // vignette exactly.
    float d = distance(uv, vec2(0.5));
    float vig = smoothstep(0.35, 0.85, d);
    float bokashi = mix(1.0 - vignetteBias, 1.0 + vignetteBias, smoothstep(0.15, 0.95, uv.y));
    color *= 1.0 - vignette * vig * bokashi;

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
        ["vignetteBias", new Uniform(0)],
        ["flash", new Uniform(0)],
      ]),
    });
  }
}

/**
 * The two post-chain lookup textures, both generated by
 * `scripts/pharosville/generate-garden-luts.mjs` and pinned by content hash
 * (the same cache-busting convention `garden-water.ts` uses for its normal
 * map). `npm run check:garden-luts` regenerates both and fails if either the
 * pixels or the hash below have drifted, so the checked-in PNGs can never
 * disagree with the parameters that authored them.
 *
 * Budget: 49 KB + 4 KB, against the plan's 150 KB ceiling. Two textures against
 * the 72-texture census. They belong to the post chain, so the scene walk in
 * `world-renderer.ts` cannot see them; `getTextureManifest` below exposes them
 * alongside N8AO's blue noise, SMAA's search/area pair, and the bloom pyramid.
 */
const LUT_TEXTURE_URL = "/pharosville/textures/garden-grade-lut.png?v=a99c2044ec62";
const DITHER_TEXTURE_URL = "/pharosville/textures/garden-blue-noise.png?v=fb2836c219c8";

/**
 * W1.2 (optional half): static paper grain, as a fraction of luminance.
 *
 * A/B'd on the real GPU by day on 2026-08-13 (`outputs/w11-day-a.png` without,
 * `outputs/w11-day-grain.png` with). Kept OFF: at 0.015 it does not survive the
 * measurement — mean adjacent-pixel difference over a 300x200 patch of upper
 * haze moved 1.553 to 1.512, i.e. nothing outside run-to-run variation — and a
 * grain strong enough to see would texture the emptiness the plan is trying to
 * protect. The term stays in the shader behind this dial because the print
 * register is a live design question (W1.6) and re-testing it should cost one
 * number, not a re-derivation.
 */
const PAPER_GRAIN_STRENGTH = 0;

/**
 * How fast the LUT and dither fade in once their textures decode, as an
 * exponential approach rate: 95 % of the way in half a second, settled inside
 * a second and a half. The world normally loads behind the mist veil and
 * neither texture is large, but a slow network must never snap the whole
 * frame's colour — the same no-pop rule every other transition in this
 * renderer follows.
 */
const POST_ASSET_FADE_RATE = 6;

/**
 * Post textures load here rather than through the world's upload scheduler:
 * `createGardenPost` is handed a renderer, a scene and a camera, and owning two
 * small same-origin PNGs is cheaper than widening that contract. Unit tests run
 * without a DOM, where no image can decode — the same guard `garden-water.ts`
 * uses for its normal map.
 */
function loadPostTexture(
  url: string,
  filter: typeof LinearFilter | typeof NearestFilter,
  wrapping: typeof ClampToEdgeWrapping | typeof RepeatWrapping,
  onReady: () => void,
): Texture | null {
  if (typeof document === "undefined") return null;
  const texture = new TextureLoader().load(url, onReady);
  // Raw look-up data, not colour: no transfer function may be applied on read.
  texture.colorSpace = NoColorSpace;
  // Mipmaps would average across slice and phase boundaries — the one thing a
  // strip-packed cube must never do.
  texture.generateMipmaps = false;
  texture.minFilter = filter;
  texture.magFilter = filter;
  texture.wrapS = wrapping;
  texture.wrapT = wrapping;
  // The generator writes row 0 as the first LUT band; flipping would put the
  // day cube where the shader expects night.
  texture.flipY = false;
  return texture;
}

/**
 * W1.1 — the per-phase 3D LUTs, and W1.2 — the blue-noise dither.
 *
 * WHERE IT RUNS. This is a THIRD effect registered into the SAME EffectPass as
 * the grade and the AgX tone mapper, not a new pass: pmndrs chains the effects
 * of one pass into a single fullscreen draw, feeding each `mainImage` the
 * previous effect's output. Registered after the tone mapper, it therefore sees
 * the display-referred frame — which is the only place a look-up table may run.
 * A LUT applied to the linear HDR frame would be graded on values it has no
 * entries for, and the AgX curve would then re-render the grade into something
 * nobody authored.
 *
 * WHAT SPACE IT WORKS IN. The composer's intermediate buffer is LINEAR
 * half-float (the sRGB encode happens once, in the final SMAA pass). So this
 * effect encodes to sRGB, applies the LUT and the dither there, and decodes
 * back to linear. Both operations belong in the encoded domain: the cube's 32
 * steps land where the eye has its resolution, and one dither unit is exactly
 * one output code. The round trip is the honest cost of doing it right.
 *
 * WHY THREE LOOKUPS AND NOT ONE PRE-BLENDED CUBE. The three phase LUTs are
 * sampled per fragment and mixed by the same weights the parametric table
 * blends with. Pre-blending one cube on the CPU would halve the fetches, but
 * the day-cycle scalars move every frame, so it would mean re-uploading 128 KB
 * of texture at some quantized cadence — this renderer has a whole upload
 * scheduler precisely because texture uploads hitch, and a hitch is a far worse
 * defect than six cached fetches from one 1024x96 texture that never leaves L2.
 *
 * TIER INVARIANCE. Like the grade and the tone mapper, this stage is on at
 * every tier. Colour is not a fidelity knob (`VISUAL_INVARIANTS.md`): tiers may
 * shed AO and bloom, never hue.
 */
const LUT_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D lutStrip;
  uniform sampler2D ditherNoise;
  uniform vec3 lutWeights;
  uniform float lutMix;
  uniform float ditherMix;
  uniform float grain;

  // One 32^3 cube is a 32x32 grid of blue slices laid out as a 1024-wide strip;
  // the three phase cubes are stacked into one 1024x96 texture (night, dusk,
  // day, top to bottom). See scripts/pharosville/generate-garden-luts.mjs.
  #define LUT_EDGE 32.0
  #define LUT_WIDTH 1024.0
  #define LUT_HEIGHT 96.0
  #define DITHER_TILE 64.0

  /**
   * Manual trilinear lookup: hardware bilinear inside a slice (red across x,
   * green down y), and the blue axis lerped by hand between two slices. Both
   * texel coordinates stay strictly inside their own slice and their own phase
   * band, so linear filtering can never bleed a neighbouring slice or a
   * neighbouring phase into the result.
   */
  vec3 sampleLutBand(const in vec3 color, const in float band) {
    float slice = color.b * (LUT_EDGE - 1.0);
    float low = floor(slice);
    float high = min(low + 1.0, LUT_EDGE - 1.0);
    float u = (0.5 + color.r * (LUT_EDGE - 1.0)) / LUT_WIDTH;
    float v = (band * LUT_EDGE + 0.5 + color.g * (LUT_EDGE - 1.0)) / LUT_HEIGHT;
    float sliceStep = LUT_EDGE / LUT_WIDTH;
    vec3 nearSlice = texture2D(lutStrip, vec2(u + low * sliceStep, v)).rgb;
    vec3 farSlice = texture2D(lutStrip, vec2(u + high * sliceStep, v)).rgb;
    return mix(nearSlice, farSlice, slice - low);
  }

  vec3 gardenLinearToDisplay(const in vec3 color) {
    return mix(
      color * 12.92,
      1.055 * pow(color, vec3(0.41666)) - 0.055,
      step(vec3(0.0031308), color)
    );
  }

  vec3 gardenDisplayToLinear(const in vec3 color) {
    return mix(
      color * 0.0773993808,
      pow(color * 0.9478672986 + 0.0521327014, vec3(2.4)),
      step(vec3(0.04045), color)
    );
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 display = gardenLinearToDisplay(clamp(inputColor.rgb, 0.0, 1.0));

    // Uniform-controlled and therefore wavefront-coherent: this costs nothing
    // when it is false, and it is only false before the texture has loaded.
    if (lutMix > 0.0) {
      vec3 graded = lutWeights.x * sampleLutBand(display, 0.0)
        + lutWeights.y * sampleLutBand(display, 1.0)
        + lutWeights.z * sampleLutBand(display, 2.0);
      display = mix(display, graded, lutMix);
    }

    if (ditherMix > 0.0) {
      // W1.2: one output code of blue noise, tiled 1:1 with device pixels.
      // Gradient banding is a QUANTIZATION artifact — the sky band and the
      // water's flat mid-tones cross an 8-bit step over hundreds of pixels, so
      // the step reads as a contour line. Sub-code noise turns that contour
      // into dither the eye integrates back to the gradient it wanted.
      float noise = texture2D(ditherNoise, gl_FragCoord.xy / DITHER_TILE).r;
      display += (noise - 0.5) * ditherMix / 255.0;

      // Paper grain: the same mask read at a coarser scale as a multiplicative
      // tooth, for the woodblock register. Near-imperceptible by design and off
      // unless it earns its place.
      if (grain > 0.0) {
        float tooth = texture2D(ditherNoise, gl_FragCoord.xy / (DITHER_TILE * 1.7) + vec2(0.37)).r;
        display *= 1.0 + (tooth - 0.5) * grain;
      }
    }

    // pow() of a negative is undefined and mix() evaluates both branches, so
    // the decode is only ever handed a value the transfer function accepts.
    outputColor = vec4(gardenDisplayToLinear(clamp(display, 0.0, 1.0)), inputColor.a);
  }
`;

class GardenLutEffect extends Effect {
  constructor() {
    super("GardenLut", LUT_FRAGMENT_SHADER, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ["lutStrip", new Uniform(null)],
        ["ditherNoise", new Uniform(null)],
        ["lutWeights", new Uniform(new Vector3(1, 0, 0))],
        ["lutMix", new Uniform(0)],
        ["ditherMix", new Uniform(0)],
        ["grain", new Uniform(PAPER_GRAIN_STRENGTH)],
      ]),
    });
  }
}

/**
 * The vertex half of every off-screen helper pass below.
 *
 * `postprocessing`'s `Pass` draws a single oversized triangle whose `position`
 * attribute already spans clip space, so the UV is reconstructed from it rather
 * than interpolated from an attribute — the convention every material in the
 * library follows, and the one a `ShaderPass` expects.
 */
const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

/**
 * The 9-tap Gaussian, collapsed to 5 hardware-filtered fetches.
 *
 * The two off-centre taps sit at non-integer texel offsets so the bilinear unit
 * returns the weighted average of the two texels either side of them; that is
 * what buys a sigma-2 kernel for five samples instead of nine. Weights and
 * offsets are the standard pair for that sigma and sum to exactly 1, so the
 * blur is energy-preserving — a blurred HDR highlight keeps its brightness
 * rather than dimming as it spreads.
 */
const SEPARABLE_BLUR_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D inputBuffer;
  uniform vec2 blurDirection;
  varying vec2 vUv;

  void main() {
    vec2 near = blurDirection * 1.3846153846;
    vec2 far = blurDirection * 3.2307692308;
    vec4 sum = texture2D(inputBuffer, vUv) * 0.2270270270;
    sum += texture2D(inputBuffer, vUv + near) * 0.3162162162;
    sum += texture2D(inputBuffer, vUv - near) * 0.3162162162;
    sum += texture2D(inputBuffer, vUv + far) * 0.0702702703;
    sum += texture2D(inputBuffer, vUv - far) * 0.0702702703;
    gl_FragColor = sum;
  }
`;

/**
 * W2.3 — the miniature-garden pass, in numbers.
 *
 * WHY A CUSTOM EFFECT AND NOT `DepthOfFieldEffect`. The stock effect models a
 * lens: a circle of confusion around a focus DISTANCE, scattered by a blur
 * kernel, with separate near/far fields, a CoC pass, a mask pass and four blur
 * passes — seven off-screen draws and five render targets. Under a locked
 * orthographic camera there is no lens and no perspective for a blur disc to
 * describe; what the frame wants is the tilt-shift READ: one horizontal band of
 * the world in focus, everything nearer and farther softening, which is a band
 * test on view-space distance plus a screen-vertical bias. That is one blur
 * chain (two half-res draws) and one composite fused into a pass that already
 * exists, and it reuses the depth texture N8AO already forces the composer to
 * carry (`needsDepthTexture`) rather than adding one.
 *
 * THE BAND, IN VIEW HEIGHTS RATHER THAN WORLD UNITS. The camera sits at a fixed
 * 179.6 units from the point it looks at and rakes down at 30°, so a point one
 * screen-height higher in the frame is `2 / cos(30°)` ≈ 1.73 view heights
 * farther away: the whole frame spans ±0.87 view heights of distance about its
 * centre, at every zoom. Expressing the band in view heights is therefore the
 * only way it can mean the same thing at overview and detail zoom — a band in
 * world units would put the entire overview map out of focus and the entire
 * detail framing in it. `focusRange` 0.45 keeps the middle ~52 % of the frame
 * perfectly sharp; the falloffs reach full softness a hair past each edge.
 *
 * WHY THE DEPTH BAND IS NOT REDUNDANT WITH THE GRADIENT. The tower is 34 units
 * tall, which under this rake projects ~0.47 view heights UP the frame while
 * moving it 0.31 view heights NEARER. A pure screen gradient would blur the
 * lighthouse crown and leave the water behind it sharp — precisely backwards.
 * So the gradient may only ever SCALE a softness the depth band already
 * granted (`bias` multiplies, it does not add): the crown stays exactly sharp
 * at the top of the frame while the open water at the same screen row softens.
 * That is also what keeps the fleet safe — a ship at the anchorage sits inside
 * the band and cannot be blurred by where it happens to sit on screen.
 */
const DOF_RESOLUTION_SCALE = 0.5;
/** Blur step in half-res texels; scales the shared 9-tap offsets. */
const DOF_BLUR_SPREAD = 2;
/** Half-width of the perfectly sharp band, in view heights (see above). */
const DOF_FOCUS_RANGE = 0.55;
/** How far past the band softness takes to reach full, in view heights. */
const DOF_FAR_FALLOFF = 0.5;
const DOF_NEAR_FALLOFF = 0.45;
/**
 * How much the screen-vertical gradient may lean the softness up the frame.
 * At 0.32 the top of the frame carries 1.32x the far softness the depth band
 * granted it and the bottom 0.68x, with the near field mirrored — the classic
 * diorama lean, biasing what depth already decided.
 */
const DOF_GRADIENT_BIAS = 0.32;
const DOF_GRADIENT_LOW = 0.16;
const DOF_GRADIENT_HIGH = 0.92;
/**
 * The blur-scale equivalent, and the whole "is this a garnish" question.
 *
 * Measured on the real GPU against a controlled A/B — two settled reduced-motion
 * dusk frames identical but for this dial (`outputs/w24-dusk-rays-tuned.png`
 * against `outputs/w23-dusk-dof-off.png`) — by how much local gradient energy
 * each band of the frame retains. At the 0.62 that pair was captured with:
 *
 *                        deep field (haze/water)   objects (hulls, rigging)
 *   top 9 % of frame            0.92                       0.94
 *   middle 20-60 %              0.98                       1.00
 *   bottom 8 %                  0.83                       0.95
 *
 * Two things in that table are the design working. The middle of the frame is
 * untouched to three decimal places — the fleet where a viewer dwells is not
 * softened at all. And in the bands that DO soften, the deep field gives up
 * more than the objects standing in it, because a mast twelve units above the
 * water is six units NEARER than the water behind it and the depth band knows
 * that. A screen gradient alone would have had it exactly backwards.
 *
 * The shipped 0.72, with the falloffs tightened alongside it, runs ~1.5x that
 * table: a veil over the haze band and the nearest water, the anchorage sharp.
 * The first tuning pass ran a narrower band at a similar strength and softened
 * fleet detail a third of the way up the frame, which is the line this must
 * stay under. A viewer should read "tender diorama", never "tilt-shift filter".
 */
const DOF_STRENGTH = 0.72;

const TILT_SHIFT_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D softFieldBuffer;
  uniform float focusCenter;
  uniform float focusRange;
  uniform float nearFalloff;
  uniform float farFalloff;
  uniform float gradientBias;
  uniform float gradientLow;
  uniform float gradientHigh;
  uniform float strength;

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    // Uniform-controlled, so the whole wavefront takes the same branch: at a
    // tier that has faded the pass out this costs one comparison per fragment
    // and no texture fetch.
    if (strength <= 0.0) {
      outputColor = inputColor;
      return;
    }

    // Orthographic depth is linear, so this is an exact view-space distance.
    // getViewZ resolves to the orthographic reconstruction because the pass
    // camera is not a PerspectiveCamera.
    float viewDistance = -getViewZ(depth);

    float farCoc = smoothstep(
      focusCenter + focusRange,
      focusCenter + focusRange + farFalloff,
      viewDistance
    );
    // smoothstep is undefined when edge0 > edge1, so the near side is written
    // as the complement of an increasing ramp rather than a descending one.
    float nearCoc = 1.0 - smoothstep(
      focusCenter - focusRange - nearFalloff,
      focusCenter - focusRange,
      viewDistance
    );

    // The diorama lean. This MULTIPLIES the depth verdict, so it can deepen a
    // softness the band already granted but can never invent one — see the
    // comment block above for why that distinction is the whole design.
    float bias = mix(1.0 - gradientBias, 1.0 + gradientBias, smoothstep(gradientLow, gradientHigh, uv.y));
    float coc = clamp(max(farCoc * bias, nearCoc * (2.0 - bias)), 0.0, 1.0);

    vec3 softField = texture2D(softFieldBuffer, uv).rgb;
    outputColor = vec4(mix(inputColor.rgb, softField, coc * strength), inputColor.a);
  }
`;

/**
 * The tilt-shift effect: one half-res separable blur chain, composited by a
 * circle of confusion derived from the depth band and the vertical gradient.
 *
 * The blur runs in `update()`, which `EffectPass` calls with its own input
 * buffer before the fused fullscreen draw — so the softened copy is made from
 * exactly the pixels this effect's `mainImage` will be handed, and the whole
 * stage still costs the main chain no extra fullscreen pass.
 *
 * Disposal is inherited: `Effect.dispose()` walks this instance's own fields
 * and disposes every render target, material and pass it finds, which is all
 * three of the resources below.
 */
class GardenTiltShiftEffect extends Effect {
  private readonly blurTargetA: WebGLRenderTarget;
  private readonly blurTargetB: WebGLRenderTarget;
  private readonly horizontalPass: ShaderPass;
  private readonly verticalPass: ShaderPass;

  constructor() {
    super("GardenTiltShift", TILT_SHIFT_FRAGMENT_SHADER, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ["softFieldBuffer", new Uniform(null)],
        ["focusCenter", new Uniform(1)],
        ["focusRange", new Uniform(1)],
        ["nearFalloff", new Uniform(1)],
        ["farFalloff", new Uniform(1)],
        ["gradientBias", new Uniform(DOF_GRADIENT_BIAS)],
        ["gradientLow", new Uniform(DOF_GRADIENT_LOW)],
        ["gradientHigh", new Uniform(DOF_GRADIENT_HIGH)],
        ["strength", new Uniform(0)],
      ]),
    });

    // HalfFloat to match the composer's own buffer: the blurred copy is mixed
    // back into a linear HDR frame that still has to survive AgX, so clipping
    // the soft field to LDR here would darken every soft highlight.
    this.blurTargetA = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      magFilter: LinearFilter,
      minFilter: LinearFilter,
      stencilBuffer: false,
      type: HalfFloatType,
    });
    this.blurTargetA.texture.name = "GardenTiltShift.BlurX";
    this.blurTargetB = this.blurTargetA.clone();
    this.blurTargetB.texture.name = "GardenTiltShift.BlurY";
    this.uniforms.get("softFieldBuffer")!.value = this.blurTargetB.texture;

    this.horizontalPass = new ShaderPass(createSeparableBlurMaterial());
    this.verticalPass = new ShaderPass(createSeparableBlurMaterial());
  }

  /** 0 disables the stage outright — no blur draws, no texture fetch. */
  get strength(): number {
    return (this.uniforms.get("strength")!.value as number);
  }

  set strength(value: number) {
    this.uniforms.get("strength")!.value = value;
  }

  /**
   * The sharp band, in view-space distance. `focusCenter` is a plain uniform
   * on purpose: W4.6 eases it toward a selected ship, and a uniform is the one
   * thing that can be moved every frame without touching the pass list.
   */
  setFocusBand(center: number, viewHeight: number): void {
    this.uniforms.get("focusCenter")!.value = center;
    this.uniforms.get("focusRange")!.value = viewHeight * DOF_FOCUS_RANGE;
    this.uniforms.get("farFalloff")!.value = viewHeight * DOF_FAR_FALLOFF;
    this.uniforms.get("nearFalloff")!.value = viewHeight * DOF_NEAR_FALLOFF;
  }

  override setSize(width: number, height: number): void {
    const blurWidth = Math.max(1, Math.round(width * DOF_RESOLUTION_SCALE));
    const blurHeight = Math.max(1, Math.round(height * DOF_RESOLUTION_SCALE));
    this.blurTargetA.setSize(blurWidth, blurHeight);
    this.blurTargetB.setSize(blurWidth, blurHeight);
    // The horizontal pass reads the FULL-res frame at the half-res raster, so
    // one half-res texel of offset is two full-res texels: the downsample and
    // the first blur axis are the same draw.
    blurDirectionOf(this.horizontalPass).set(DOF_BLUR_SPREAD / blurWidth, 0);
    blurDirectionOf(this.verticalPass).set(0, DOF_BLUR_SPREAD / blurHeight);
  }

  override update(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget): void {
    if (this.strength <= 0) return;
    this.horizontalPass.render(renderer, inputBuffer, this.blurTargetA);
    this.verticalPass.render(renderer, this.blurTargetA, this.blurTargetB);
  }
}

function createSeparableBlurMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    fragmentShader: SEPARABLE_BLUR_FRAGMENT_SHADER,
    name: "GardenSeparableBlurMaterial",
    uniforms: {
      blurDirection: new Uniform(new Vector2()),
      inputBuffer: new Uniform(null),
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
  });
}

function blurDirectionOf(pass: ShaderPass): Vector2 {
  const material = pass.fullscreenMaterial as ShaderMaterial;
  return material.uniforms.blurDirection!.value as Vector2;
}

/**
 * W2.4 — low-sun god rays through the tower, in numbers.
 *
 * WHY HAND-ROLLED AND NOT `three-good-godrays`. The plan named it as the
 * preferred route; its published peer range is `three >= 0.125.0 <= 0.182.0`
 * (0.12.1, checked 2026-08-13) and this repository is pinned to three 0.185.1
 * because `postprocessing` 6.39.4 pins `three < 0.186`. Installing it would
 * mean either an unsatisfied peer or a three downgrade that the post stack
 * forbids. Beyond the version wall it is also built around a perspective
 * reconstruction, and every ray in this world is parallel by construction: a
 * directional light under a LOCKED ORTHOGRAPHIC camera projects parallel world
 * shafts to parallel screen lines, with no vanishing point for a radial-blur
 * god-ray to radiate from. The raymarch below is ~40 lines of GLSL, adds zero
 * bytes of dependency, and is correct for this camera by construction.
 *
 * WHAT IT MARCHES. For every half-res pixel: the camera ray from the near plane
 * to whatever the depth buffer says it hit, clipped to the slab of air the
 * medium occupies, sampled at 28 jittered steps. Each sample is transformed by
 * `light.shadow.matrix` — the SAME matrix the world's receiving materials use,
 * belonging to the same 2048² map that W2.2 fitted over the island and the
 * harbour ring — and tested against the shadow map. So a shaft breaks exactly
 * where the tower's sea shadow breaks: not approximately, but because it is
 * literally the same lookup. No second shadow render, no second matrix, and
 * nothing to drift out of agreement.
 *
 * WHY THE SHAFTS STAY LOW. Density falls off exponentially with height above
 * the sea (e-folding ~18 units), and the slab is capped just above the tower's
 * 34-unit crown. Haze lies on water; a medium of uniform density up the whole
 * frame is what turns crepuscular rays into the "fog cone" failure this task
 * was warned about.
 *
 * WHY THERE IS NO PHASE FUNCTION. Forward scattering weights a shaft by the
 * angle between the view ray and the light. Under a locked orthographic camera
 * BOTH are constant across the frame, so the whole term collapses to one scalar
 * per frame — which is already what the per-phase intensity below is. Computing
 * it per fragment would spend ALU to arrive at a number the table states.
 */
const GODRAY_RESOLUTION_SCALE = 0.5;
/**
 * The march's whole cost knob. 28 steps over a ~80-unit slab is ~2.9 units per
 * step against a 0.043-unit shadow texel — coarse per sample, but the tower's
 * shadow is a solid volume tens of units deep, and the interleaved-gradient
 * jitter below turns the residual banding into the dither the eye integrates.
 */
const GODRAY_STEPS = 28;
/** The sea plane the medium sits on; mirrors `GARDEN_WATER_Y`. */
const GODRAY_SEA_LEVEL = GARDEN_WATER_Y;
/** Slab height above the sea, in world units — just over the 34-unit crown. */
const GODRAY_VOLUME_TOP = 46;
/** Exponential density falloff with height; 0.055 e-folds in ~18 units. */
const GODRAY_HEIGHT_FALLOFF = 0.1;
/**
 * Depth-compare bias, in the shadow map's normalized depth.
 *
 * A march sample in free air grazing the water sits a hair from the recorded
 * depth of whatever the light saw there, and without a bias that hair reads as
 * shimmering speckle along the shoreline. 0.0016 over the shadow camera's
 * ~215-unit range is ~0.34 world units — under one step of the march and far
 * under anything the eye can place.
 */
const GODRAY_SHADOW_BIAS = 0.0016;
/**
 * Where the low-sun window opens and closes, as key-light elevation in radians.
 *
 * Read from the light that actually casts the shadow map, which is
 * `gardenKeyLightPose` — the sun by day, crossed to the moon after dark. That
 * choice is deliberate: rays that agree with the shadow map must be gated by
 * the same pose the map was drawn for. Against the shipped arc it lands at
 * ~1.0 at dusk (t=19, elevation floored to 0.12), ~0.55 at dawn (t=7, 0.34),
 * ~0.28 through late afternoon (t=17), and exactly 0 at noon (0.80) and at
 * night, where the pose has crossed to the high moon (0.91).
 */
const GODRAY_ELEVATION_FULL = 0.16;
const GODRAY_ELEVATION_NONE = 0.55;
/**
 * The night kill. Elevation alone cannot close the window after sunset: the
 * pose crosses to the moon through the evening and passes back down through
 * the low band on its way. Weighting by the day cycle's own night scalar shuts
 * the rays with the light that made them — ~0.32 of full at t=20 while the
 * ember horizon is still lit, ~0.03 by t=21, exactly 0 at night proper.
 */
const GODRAY_NIGHT_FADE_POWER = 1;
/**
 * The lit optical thickness of a full, unshadowed column, in world units — the
 * denominator that turns the march's integral into a 0..1 shaft term.
 *
 * Derived, not guessed: the slab is 47.45 units tall, the density is
 * exp(-0.1·height), and the locked 30° rake means the ray descends one unit of
 * height every two units of length, so the integral is
 * 2·(1 − e^(−0.1·47.45))/0.1 ≈ 19.8. Rounding to 20 leaves a full column just
 * under 1 and every partial column proportionally under that.
 */
const GODRAY_REFERENCE_THICKNESS = 20;
/**
 * Master intensity, as a linear-HDR add on the pre-grade frame.
 *
 * Sized by MEASUREMENT, not by eye, against a controlled real-GPU A/B: two
 * settled reduced-motion dusk frames (`outputs/w24-dusk-rays-{on,off}.png`,
 * identical in every other respect) differenced block by block.
 *
 * At 0.05 the shafts lifted the whole frame's mean luminance by 8.4 codes of
 * 255 and the brightest blocks by 22.6 — a real structure (the tower's shadow
 * column read as a 19-code dip against its neighbours) sitting on a DC pedestal
 * far too tall to call a garnish, and a rewrite of a grade W1.x tuned to a
 * tenth of a code. The pedestal is not a bug in the model: at low sun the air
 * IS lit nearly everywhere the map covers, so a physically honest medium has
 * one. What must be restrained is its height. At 0.02 the frame mean moves
 * ~3.4 codes, the brightest blocks ~9, and the tower's shadow still cuts ~8
 * codes across its column — legible as light, too quiet to read as fog.
 *
 * Also far under the day bloom knee (1.20) by construction, so a shaft can
 * never open bloom onto the sky the W1.3 retune spent its margin protecting.
 */
const GODRAY_INTENSITY = 0.02;
/**
 * The hour the shafts inherit. Dusk is the ember hour and reads warm; dawn is
 * pale and cooler. The day cycle's `daylight` scalar is what separates them —
 * both windows sit at dusk≈1, but the evening window has daylight 0 while the
 * dawn window is already at ~0.65 — so it is the natural mix parameter, and it
 * costs nothing extra to read.
 */
const GODRAY_DUSK_COLOR: readonly [number, number, number] = [1, 0.63, 0.3];
const GODRAY_DAWN_COLOR: readonly [number, number, number] = [0.88, 0.89, 0.95];
const GODRAY_DUSK_DENSITY = 1;
const GODRAY_DAWN_DENSITY = 0.74;
const GODRAY_MARCH_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D depthBuffer;
  uniform sampler2DShadow shadowMap;
  uniform mat4 shadowMatrix;
  uniform mat4 inverseViewProjection;
  uniform vec3 rayColor;
  uniform float seaLevel;
  uniform float volumeTop;
  uniform float heightFalloff;
  uniform float referenceThickness;
  uniform float shadowBias;
  varying vec2 vUv;

  vec3 worldFromDepth(const in vec2 uv, const in float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 world = inverseViewProjection * clip;
    return world.xyz / world.w;
  }

  void main() {
    float depth = texture2D(depthBuffer, vUv).r;
    vec3 rayStart = worldFromDepth(vUv, 0.0);
    vec3 rayEnd = worldFromDepth(vUv, depth);
    vec3 segment = rayEnd - rayStart;
    float segmentLength = length(segment);
    vec3 direction = segment / max(segmentLength, 1e-4);

    // Clip the march to the slab of air the medium occupies. Without this the
    // ray would be walked across the camera's whole 500-unit range to sample
    // 28 points, almost all of them in vacuum above the haze.
    float tMin = 0.0;
    float tMax = segmentLength;
    if (abs(direction.y) > 1e-4) {
      float tTop = (seaLevel + volumeTop - rayStart.y) / direction.y;
      float tSea = (seaLevel - rayStart.y) / direction.y;
      tMin = max(tMin, min(tTop, tSea));
      tMax = min(tMax, max(tTop, tSea));
    }
    if (tMax <= tMin) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float span = tMax - tMin;
    float stepSize = span / float(${GODRAY_STEPS});
    // Interleaved gradient noise (Jimenez): a low-discrepancy, purely
    // positional dither. Deterministic per pixel and free of any clock, so a
    // reduced-motion frame is bit-identical from one render to the next.
    float jitter = fract(52.9829189 * fract(0.06711056 * gl_FragCoord.x + 0.00583715 * gl_FragCoord.y));

    float lit = 0.0;
    for (int i = 0; i < ${GODRAY_STEPS}; i++) {
      vec3 samplePoint = rayStart + direction * (tMin + (float(i) + jitter) * stepSize);
      vec4 shadowClip = shadowMatrix * vec4(samplePoint, 1.0);
      vec3 shadowCoord = shadowClip.xyz / shadowClip.w;

      // Outside the static map's frustum there is no answer, so contribute
      // nothing rather than guess — and feather the last quarter of the way
      // out so the shafts dissolve into the haze instead of ending on the
      // rectangle the shadow camera happens to cover.
      vec2 edge = abs(shadowCoord.xy - 0.5) * 2.0;
      float inside = 1.0 - smoothstep(0.55, 1.0, max(edge.x, edge.y));
      inside *= step(0.0, shadowCoord.z) * step(shadowCoord.z, 1.0);
      if (inside <= 0.0) continue;

      float visibility = texture(shadowMap, vec3(shadowCoord.xy, shadowCoord.z - shadowBias));
      float density = exp(-max(samplePoint.y - seaLevel, 0.0) * heightFalloff);
      lit += visibility * density * inside;
    }

    // An INTEGRAL, not an average: multiplying by the step length turns the sum
    // into the lit optical thickness the ray actually crossed, in world units.
    // The distinction is not pedantry — a ray that stops on the tower's flank
    // has metres of air in front of it and a ray that reaches the sea has tens,
    // and an average would hand both the same brightness, painting the tower's
    // own face with the haze that belongs in front of it.
    float thickness = clamp(lit * stepSize / referenceThickness, 0.0, 1.0);

    // The contrast curve is what keeps this reading as LIGHT rather than fog.
    // A low sun lights nearly the whole slab, so the honest answer is a broad
    // plateau — physically right, and on screen a warm smear over half the
    // anchorage (measured: the first tuning pass did exactly that). Bending the
    // thickness before it is scaled widens the gap between a shaft and its
    // shadow without raising the level of either: a full column keeps its value
    // while a half-occluded one falls to a fifth rather than a half.
    float shaft = pow(thickness, 2.2);
    gl_FragColor = vec4(rayColor * shaft, 1.0);
  }
`;

const GODRAY_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D raysBuffer;
  uniform float rayWeight;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Uniform branch: outside the low-sun window this stage is one comparison.
    if (rayWeight <= 0.0) {
      outputColor = inputColor;
      return;
    }
    outputColor = vec4(inputColor.rgb + texture2D(raysBuffer, uv).rgb * rayWeight, inputColor.a);
  }
`;

/**
 * How much of the low-sun window is open at a given key-light elevation.
 *
 * Exported because it is the whole gating contract and it is pure: a test can
 * lock the curve at every hour of the shipped arc without a GPU, a scene or a
 * light. `night` is the day cycle's own night weight — see
 * GODRAY_NIGHT_FADE_POWER for why elevation alone is not enough.
 */
export function gardenGodRayLowSunGate(elevation: number, night: number): number {
  if (!Number.isFinite(elevation)) return 0;
  const span = GODRAY_ELEVATION_NONE - GODRAY_ELEVATION_FULL;
  const t = clampUnit((GODRAY_ELEVATION_NONE - elevation) / span);
  const eased = t * t * (3 - 2 * t);
  return eased * Math.pow(1 - clampUnit(night), GODRAY_NIGHT_FADE_POWER);
}

/**
 * The god-ray effect: one half-res raymarch of the world's own shadow map,
 * added to the linear HDR frame before the grade so the shafts are graded and
 * tone-mapped with everything else rather than painted over the top.
 *
 * DECORATIVE. The shafts carry no data: they are weather and hour, nothing in
 * the payload moves them, and no cue in `visual-cue-registry.ts` reads them.
 * Nothing here needs a registry entry, a detail row or a ledger clause.
 */
class GardenGodRaysEffect extends Effect {
  private readonly rayTarget: WebGLRenderTarget;
  private readonly marchPass: ShaderPass;
  private readonly marchUniforms: Record<string, Uniform>;

  constructor() {
    super("GardenGodRays", GODRAY_FRAGMENT_SHADER, {
      // The march needs depth and gets it through `setDepthTexture` below;
      // declaring the attribute is what makes the pass forward it here.
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ["raysBuffer", new Uniform(null)],
        ["rayWeight", new Uniform(0)],
      ]),
    });

    this.rayTarget = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      magFilter: LinearFilter,
      minFilter: LinearFilter,
      stencilBuffer: false,
      type: HalfFloatType,
    });
    this.rayTarget.texture.name = "GardenGodRays.Half";
    this.uniforms.get("raysBuffer")!.value = this.rayTarget.texture;

    this.marchUniforms = {
      depthBuffer: new Uniform(null),
      heightFalloff: new Uniform(GODRAY_HEIGHT_FALLOFF),
      inverseViewProjection: new Uniform(new Matrix4()),
      rayColor: new Uniform(new Vector3(1, 1, 1)),
      referenceThickness: new Uniform(GODRAY_REFERENCE_THICKNESS),
      seaLevel: new Uniform(GODRAY_SEA_LEVEL),
      shadowBias: new Uniform(GODRAY_SHADOW_BIAS),
      shadowMap: new Uniform(null),
      shadowMatrix: new Uniform(new Matrix4()),
      volumeTop: new Uniform(GODRAY_VOLUME_TOP),
    };
    this.marchPass = new ShaderPass(new ShaderMaterial({
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader: GODRAY_MARCH_FRAGMENT_SHADER,
      name: "GardenGodRayMarchMaterial",
      uniforms: this.marchUniforms,
      vertexShader: FULLSCREEN_VERTEX_SHADER,
    }));
  }

  /** 0 outside the low-sun window; also the pass-skip predicate. */
  get weight(): number {
    return (this.uniforms.get("rayWeight")!.value as number);
  }

  set weight(value: number) {
    this.uniforms.get("rayWeight")!.value = value;
  }

  /** Hue and density for the hour. Never a tier input — see tier invariance. */
  setPhaseLook(red: number, green: number, blue: number): void {
    (this.marchUniforms.rayColor!.value as Vector3).set(red, green, blue);
  }

  /**
   * The world's own shadow rig. `shadow.matrix` is the matrix the map was last
   * DRAWN with — not the light's current pose — which is exactly right: the
   * static map is re-rendered only past a 0.6° re-steer, and reading the live
   * pose instead would slide the shafts off the shadows between re-steers.
   */
  setShadowRig(shadowMap: Texture | null, shadowMatrix: Matrix4 | null): void {
    this.marchUniforms.shadowMap!.value = shadowMap;
    if (shadowMatrix) this.marchUniforms.shadowMatrix!.value = shadowMatrix;
  }

  /** World-space reconstruction for the current frame's camera. */
  setInverseViewProjection(matrix: Matrix4): void {
    (this.marchUniforms.inverseViewProjection!.value as Matrix4).copy(matrix);
  }

  override setDepthTexture(depthTexture: Texture): void {
    this.marchUniforms.depthBuffer!.value = depthTexture;
  }

  override setSize(width: number, height: number): void {
    this.rayTarget.setSize(
      Math.max(1, Math.round(width * GODRAY_RESOLUTION_SCALE)),
      Math.max(1, Math.round(height * GODRAY_RESOLUTION_SCALE)),
    );
  }

  override update(renderer: WebGLRenderer): void {
    // Outside the low-sun window, and at every tier below full, the march is
    // not merely faded — it is not drawn. This is the honest half of the
    // "dawn/dusk only" cost claim.
    if (this.weight <= 0 || this.marchUniforms.shadowMap!.value === null) return;
    this.marchPass.render(renderer, null, this.rayTarget);
  }
}

export interface GardenPost {
  dispose: () => void;
  /** Render targets and lookup textures owned by the post chain. */
  getTextureManifest: () => readonly TextureOwnerManifestEntry[];
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
  /** Set the unattended second-monitor post profile target. */
  setIdleProfile?: (idle: boolean, immediate?: boolean) => void;
  /**
   * W2.3 / W4.6 seam: where the tilt-shift's sharp band sits, as a view-space
   * distance. `null` (the default) derives it from the camera — the point the
   * locked vantage looks at on the sea. W4.6 eases a selected ship's distance
   * in here; nothing else may touch it, and it is a uniform write, never a
   * pass-list change.
   */
  setFocusBandDistance: (distance: number | null) => void;
  // No nightMix: night is the base of the blend (as in `blendScalar`), and the
  // day cycle derives it as `1 - daylight - dusk` anyway, so it carries nothing.
  // Phase 2: stormLevel applies the table's storm scalars (wet-glow bloom,
  // cool lift) on top of the phase blend; flash is the lightning envelope.
  // W0.3: flash drives BOTH the grade's direct cool-white add and a clamped
  // lift on bloom intensity, which is the only way a stroke can reach bloom
  // from here — the grade pass runs after the bloom pass.
  setGrade: (
    dayMix: number,
    duskMix: number,
    stormLevel?: number,
    flash?: number,
    winter?: number,
  ) => void;
  setSize: (width: number, height: number, dpr: number) => void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampUnit(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Frame-rate independent approach, so a fade lasts the same wall time whatever
 * the frame took. `rate` is the reciprocal of the time constant: 6 settles a
 * texture fade inside ~1.5 s, `1 / 0.18` matches the tier ease the AO weight
 * rides in `world-renderer.ts`.
 */
function easeExponential(
  current: number,
  target: number,
  deltaSeconds: number,
  rate: number,
): number {
  if (current === target) return target;
  const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 1 / 60;
  const next = current + (target - current) * (1 - Math.exp(-rate * delta));
  return Math.abs(target - next) < 1e-3 ? target : next;
}

/**
 * The scene's shadow-casting directional light, or null.
 *
 * One traversal, at construction, of a scene that has its lights but not yet
 * its world content. Null is a supported answer: without a light there is no
 * shadow map to agree with, and W2.4 stands down rather than inventing shafts.
 */
function findShadowCastingLight(scene: Scene): DirectionalLight | null {
  const found: DirectionalLight[] = [];
  scene.traverse((object) => {
    if (object instanceof DirectionalLight && object.castShadow) found.push(object);
  });
  return found[0] ?? null;
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

/**
 * Walk the small set of postprocessing resource shapes we own. Three's
 * `WebGLMultipleRenderTargets` exposes its attachments as `textures`, while
 * ordinary render targets expose one `texture`; keeping this adapter here
 * means the census does not need to know which library made an attachment.
 */
function manifestTextures(value: unknown): Texture[] {
  if (value instanceof Texture) return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => manifestTextures(entry));
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return [];
  const candidate = value as { texture?: unknown; textures?: unknown };
  if (Array.isArray(candidate.textures)) return manifestTextures(candidate.textures);
  return candidate.texture === value ? [] : manifestTextures(candidate.texture);
}

function addManifestTextures(
  entries: TextureOwnerManifestEntry[],
  seen: Set<Texture>,
  owner: string,
  value: unknown,
): void {
  for (const texture of manifestTextures(value)) {
    if (seen.has(texture)) continue;
    seen.add(texture);
    entries.push({ owner, texture });
  }
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

// These six objects account for N8AO's seven GPU textures: the half-resolution
// depth target has both a colour and a depth attachment. Disposing a Three
// render target releases its WebGL handles without invalidating the object, so
// N8AO can reuse it and Three will initialise fresh handles on the next render.
// Keep shader materials and fullscreen geometry warm; a zoom-in therefore
// pays only one lazy target allocation frame, never a shader rebuild.
const N8AO_TEXTURE_RESOURCE_KEYS = [
  "accumulationRenderTarget",
  "bluenoise",
  "depthDownsampleTarget",
  "outputTargetInternal",
  "readTargetInternal",
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

function releaseN8AOTextureResources(pass: N8AOPostPass): void {
  const runtime = pass as unknown as Record<string, unknown>;
  const resources = new Set<DisposableResource>();
  for (const key of N8AO_TEXTURE_RESOURCE_KEYS) {
    const resource = disposable(runtime[key]);
    if (resource) resources.add(resource);
  }
  for (const resource of resources) resource.dispose();
}

/**
 * The post pipeline, on pmndrs/postprocessing (Phase 1 of the breathtaking
 * rendering plan — supersedes the three/examples EffectComposer stack):
 *
 *   RenderPass → N8AOPostPass (AO on scene color) → EffectPass(BloomEffect) →
 *   EffectPass(GardenTiltShift + GardenGodRays + GardenGrade + ToneMapping AGX
 *   + GardenLut, fused) → EffectPass(SMAA)
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
 * textures and blit the multisampled scene depth into a stable target once per
 * frame. W2.3 and W2.4 now read that SAME texture — the composer hands its
 * stable depth to every pass once any pass asks for it, so the depth band and
 * the raymarch's world reconstruction are free of a second depth prepass.
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

  // UnrealBloom→BloomEffect mapping: threshold→luminanceThreshold (the same
  // `smoothstep(threshold, threshold + smoothing, l)` knee, now opened into a
  // per-phase shoulder by W1.3), strength→intensity
  // (bloom output scaled before blending), radius→radius, 5-level pyramid→
  // levels. BlendFunction.ADD reproduces UnrealBloomPass's additive composite
  // (`scene + strength · bloom`) — the default SCREEN would soften the HDR
  // add the grades were tuned against.
  const bloomEffect = new BloomEffect({
    blendFunction: BlendFunction.ADD,
    intensity: POST_PHASE_NIGHT.bloomStrength,
    levels: BLOOM_MIP_LEVELS,
    luminanceSmoothing: POST_PHASE_NIGHT.bloomSmoothing,
    luminanceThreshold: POST_PHASE_NIGHT.bloomThreshold,
    mipmapBlur: true,
    radius: POST_PHASE_NIGHT.bloomRadius,
  });
  const bloomPass = new EffectPass(camera, bloomEffect);

  const gradeEffect = new GardenGradeEffect();
  // ToneMappingEffect with AGX resolves `toneMapping()` to three's
  // AgXToneMapping shader chunk — the same curve, exposure uniform and all,
  // that OutputPass applied in the old chain.
  const toneMappingEffect = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const lutEffect = new GardenLutEffect();
  const tiltShiftEffect = new GardenTiltShiftEffect();
  const godRaysEffect = new GardenGodRaysEffect();
  // Five effects, ONE full-screen draw. pmndrs chains the effects of a pass
  // into a single fragment shader, feeding each `mainImage` the previous one's
  // output, so W2.3 and W2.4 add no pass to the main chain — only their own
  // half-res off-screen work, which runs in `update()` and is skipped outright
  // when their weights are zero.
  //
  // The order IS the contract, and both new stages are BEFORE the grade so the
  // softened pixels and the shafts are graded, tone-mapped and looked up with
  // everything else rather than painted over the finished picture:
  //
  //   tilt-shift (depth band) → god rays (add) → parametric grade → AgX →
  //   authored cube + dither
  //
  // Depth-of-field first because the shafts are light IN THE AIR between the
  // camera and the water: softening them by the same band that softens the
  // surface behind them would make the near air read as out of focus, which
  // nothing in the frame is.
  const gradePass = new EffectPass(
    camera,
    tiltShiftEffect,
    godRaysEffect,
    gradeEffect,
    toneMappingEffect,
    lutEffect,
  );

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
    vignetteBias: uniform<number>(gradeEffect, "vignetteBias"),
    flash: uniform<number>(gradeEffect, "flash"),
  };
  const lutUniforms = {
    lutStrip: uniform<Texture | null>(lutEffect, "lutStrip"),
    ditherNoise: uniform<Texture | null>(lutEffect, "ditherNoise"),
    lutWeights: uniform<Vector3>(lutEffect, "lutWeights"),
    lutMix: uniform<number>(lutEffect, "lutMix"),
    ditherMix: uniform<number>(lutEffect, "ditherMix"),
  };
  // 0 until the texture decodes, then eased to 1 — see POST_ASSET_FADE_RATE.
  let lutTarget = 0;
  let ditherTarget = 0;
  const lutTexture = loadPostTexture(LUT_TEXTURE_URL, LinearFilter, ClampToEdgeWrapping, () => {
    lutTarget = 1;
  });
  const ditherTexture = loadPostTexture(DITHER_TEXTURE_URL, NearestFilter, RepeatWrapping, () => {
    ditherTarget = 1;
  });
  lutUniforms.lutStrip.value = lutTexture;
  lutUniforms.ditherNoise.value = ditherTexture;
  const bloomLuminance = bloomEffect.luminanceMaterial;
  const aoConfiguration = n8aoPass.configuration;
  let enabled = true;
  let aoTierWeight = 1;
  let aoQuality: GardenAOQuality = "full";
  let aoZoomDetail = 1;
  // Object existence is not residency: N8AO constructs its targets eagerly,
  // but Three uploads them only when the enabled pass first renders.
  let aoTextureResourcesResident = false;
  /** 1 is the awake/full profile; 0 is the idle/Performance profile. */
  let idleProfileWeight = 1;
  let idleProfileTarget = 1;
  let idleProfileImmediate = false;
  let phaseAOIntensity = POST_PHASE_NIGHT.aoIntensity;
  const passList: string[] = [];

  /**
   * The tilt-shift is designed for the locked orthographic vantage and for
   * nothing else: its band is expressed in view heights, which a perspective
   * frustum does not have, and its depth reconstruction assumes the linear
   * depth only an orthographic projection produces. If this renderer ever gets
   * a different camera the stage stands down rather than guessing.
   */
  const orthographicCamera = (camera as OrthographicCamera).isOrthographicCamera === true
    ? camera as OrthographicCamera
    : null;
  /**
   * The world's shadow-casting key light, resolved ONCE.
   *
   * `createGardenPost` is handed the scene root, and `createGardenScene` has
   * already added the directional light by the time it is called, so the rig
   * W2.4 needs is reachable without widening this module's contract or asking
   * `world-renderer.ts` for a setter. A per-frame traversal of a 600-object
   * graph to re-find a light that is never replaced would be the expensive way
   * to learn the same answer.
   */
  const shadowLight = findShadowCastingLight(scene);
  const scratchForward = new Vector3();
  const scratchLightDelta = new Vector3();
  const scratchInverseViewProjection = new Matrix4();
  /** W4.6 seam; null means "derive the band from the camera". */
  let focusBandOverride: number | null = null;
  /** Night weight of the current phase blend — the god rays' sunset kill. */
  let phaseNightWeight = 1;
  /** Per-phase ray density; hue rides on the effect's own uniform. */
  let rayPhaseDensity = GODRAY_DUSK_DENSITY;
  /** Eased full-tier weight for the rays, on the AO fade's time constant. */
  let rayTierWeight = 1;

  function syncTierFidelity(): void {
    // The pass costs nothing at whole-map zoom: the overview-LOD detail
    // scalar fades AO out over the same zoom band that sheds the small props,
    // and at zero the pass is skipped outright. AO is a grounding FIDELITY,
    // not a colour — the painted contact discs stay rendered at every tier
    // and zoom, so the grounding intent never leaves the frame.
    n8aoPass.enabled = enabled && aoTierWeight > 0 && aoZoomDetail > 0;
    // Idle stays on the existing Performance shader quality. Only the uniform
    // scales move toward its smaller radius/softer contribution, so a full
    // load tier can enter and leave idle without a quality-mode recompile or a
    // one-frame AO pop.
    const loadIntensityScale = aoQuality === "full" ? 1 : AO_BALANCED_INTENSITY_SCALE;
    const idleIntensityScale = lerp(AO_BALANCED_INTENSITY_SCALE, 1, idleProfileWeight);
    const intensityScale = Math.min(loadIntensityScale, idleIntensityScale);
    aoConfiguration.intensity = phaseAOIntensity
      * intensityScale
      * Math.max(aoZoomDetail, 0)
      * aoTierWeight;
    const loadRadiusScale = aoQuality === "full" ? 1 : AO_BALANCED_RADIUS_SCALE;
    const idleRadiusScale = lerp(AO_BALANCED_RADIUS_SCALE, 1, idleProfileWeight);
    const radiusScale = Math.min(loadRadiusScale, idleRadiusScale);
    aoConfiguration.aoRadius = AO_RADIUS * radiusScale;

    // W2.3 rides the SAME eased tier weight the AO does, because it is the same
    // decision: `world-renderer.ts` drives that weight to 1 at full and
    // balanced, to 0 below, over a 180 ms ease, and never by mutating the pass
    // list mid-session. Depth of field is a fidelity, not a colour, so shedding
    // it below balanced is inside the tier-invariance contract; the grade, the
    // tone map and the cube stay on at every tier, exactly as before.
    //
    // Deliberately NOT scaled by `aoZoomDetail`: that scalar sheds AO with the
    // small props it grounds, while the tilt-shift band is expressed in view
    // heights and therefore says the same thing at every zoom.
    tiltShiftEffect.strength = enabled && orthographicCamera
      ? aoTierWeight * idleProfileWeight * DOF_STRENGTH
      : 0;
  }

  function applyGrade(
    dayMix: number,
    duskMix: number,
    stormLevel = 0,
    flash = 0,
    winter = 0,
  ): void {
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
    gradeUniforms.saturation.value = lerp(
      lerp(NIGHT_GRADE.saturation, DUSK_GRADE.saturation, duskMix),
      DAY_GRADE.saturation,
      dayMix,
    ) * (1 - clampUnit(winter) * 0.08);
    gradeUniforms.split.value = lerp(lerp(NIGHT_GRADE.split, DUSK_GRADE.split, duskMix), DAY_GRADE.split, dayMix);
    gradeUniforms.vignette.value = lerp(lerp(NIGHT_GRADE.vignette, DUSK_GRADE.vignette, duskMix), DAY_GRADE.vignette, dayMix);
    gradeUniforms.vignetteBias.value = lerp(lerp(NIGHT_GRADE.vignetteBias, DUSK_GRADE.vignetteBias, duskMix), DAY_GRADE.vignetteBias, dayMix);
    gradeUniforms.flash.value = flash;
    // W1.1: the LUT bands blend by exactly the law the tables above use.
    // Expanding `lerp(lerp(night, dusk, duskMix), day, dayMix)` gives these
    // three weights, so the cube and the parametric grade can never disagree
    // about what time it is. They sum to 1 by construction. The scalars are
    // clamped here (the lerps above deliberately extrapolate, but a negative
    // LUT weight would sample a phase in reverse, which is not a look).
    const dayWeight = clampUnit(dayMix);
    const duskWeight = clampUnit(duskMix) * (1 - dayWeight);
    lutUniforms.lutWeights.value.set(1 - dayWeight - duskWeight, duskWeight, dayWeight);
    // W2.4: the shafts inherit the hour from the same three weights. The night
    // band is the rays' sunset kill (see GODRAY_NIGHT_FADE_POWER), and the day
    // band is what separates the two low-sun windows — an evening at dusk=1 has
    // daylight 0 where a dawn at dusk=1 is already climbing, so `dayWeight`
    // reads dusk-gold at 0 and dawn-pale at 1 without a fourth scalar.
    phaseNightWeight = 1 - dayWeight - duskWeight;
    godRaysEffect.setPhaseLook(
      lerp(GODRAY_DUSK_COLOR[0], GODRAY_DAWN_COLOR[0], dayWeight),
      lerp(GODRAY_DUSK_COLOR[1], GODRAY_DAWN_COLOR[1], dayWeight),
      lerp(GODRAY_DUSK_COLOR[2], GODRAY_DAWN_COLOR[2], dayWeight),
    );
    rayPhaseDensity = lerp(GODRAY_DUSK_DENSITY, GODRAY_DAWN_DENSITY, dayWeight);
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
      BLOOM_STORM_THRESHOLD_FLOOR,
      lerp(
        lerp(POST_PHASE_NIGHT.bloomThreshold, POST_PHASE_DUSK.bloomThreshold, duskMix),
        POST_PHASE_DAY.bloomThreshold,
        dayMix,
      ) - storm * stormThreshold,
    );
    // W1.3: the shoulder and the spread blend on the same law as the knee.
    // Both are plain uniforms (no shader recompile), so they are safe here on
    // the once-per-frame day-cycle path — see the phase-table comment.
    bloomLuminance.smoothing = lerp(
      lerp(POST_PHASE_NIGHT.bloomSmoothing, POST_PHASE_DUSK.bloomSmoothing, duskMix),
      POST_PHASE_DAY.bloomSmoothing,
      dayMix,
    );
    bloomEffect.mipmapBlurPass.radius = lerp(
      lerp(POST_PHASE_NIGHT.bloomRadius, POST_PHASE_DUSK.bloomRadius, duskMix),
      POST_PHASE_DAY.bloomRadius,
      dayMix,
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
    syncTierFidelity();
  }
  applyGrade(0, 0);

  function easePostAssets(deltaSeconds = 0): void {
    lutUniforms.lutMix.value = easeExponential(lutUniforms.lutMix.value, lutTarget, deltaSeconds, POST_ASSET_FADE_RATE);
    lutUniforms.ditherMix.value = easeExponential(lutUniforms.ditherMix.value, ditherTarget, deltaSeconds, POST_ASSET_FADE_RATE);
  }

  function syncIdleProfile(deltaSeconds = 0): void {
    idleProfileWeight = easeExponential(
      idleProfileWeight,
      idleProfileTarget,
      deltaSeconds,
      1 / POST_TIER_FADE_SECONDS,
    );
    syncTierFidelity();
  }

  /**
   * Everything the two hero passes need from the camera, once per frame.
   *
   * The camera's world matrix is refreshed here rather than trusted: the grade
   * is pushed from `world-renderer.ts` BEFORE the composer runs, and a stale
   * matrix would put a frame of lag between the shafts and the world they are
   * cast through. `updateMatrixWorld` on a parentless camera is a matrix
   * compose — it is not a scene traversal.
   */
  function syncCameraDerivedUniforms(): void {
    camera.updateMatrixWorld();
    camera.getWorldDirection(scratchForward);
    // The centre of the sharp band is where the locked vantage looks at the
    // sea: the drop from the camera to the water plane, along the view ray.
    // Derived rather than hard-coded so a re-framed camera cannot silently
    // leave the band behind — and floored so a degenerate camera (a unit-test
    // default, a horizontal rake) cannot divide the band to infinity.
    const drop = camera.position.y - GODRAY_SEA_LEVEL;
    const focusCenter = drop / Math.max(Math.abs(scratchForward.y), 0.05);
    const viewHeight = orthographicCamera
      ? Math.abs(orthographicCamera.top - orthographicCamera.bottom)
      : 0;
    tiltShiftEffect.setFocusBand(focusBandOverride ?? focusCenter, viewHeight);
    // World reconstruction for the raymarch: clip -> view -> world in one
    // matrix, so the march shader unprojects with a single multiply.
    scratchInverseViewProjection.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    godRaysEffect.setInverseViewProjection(scratchInverseViewProjection);
  }

  /**
   * The low-sun window, the tier fade, and the rig the march reads.
   *
   * Both gates are uniform writes on a pass that is always registered — the
   * pass list is never mutated mid-session, which is the discipline the AO
   * weight already follows and the reason a tier flap cannot pop the frame.
   */
  function syncGodRays(deltaSeconds: number): void {
    // Full tier only. `aoQuality` is what `world-renderer.ts` reports the
    // resolved tier as, and it flips without an ease of its own, so the ease
    // lives here — same 180 ms constant as the AO weight it rides beside.
    // Use the target, rather than the current idle weight, so wake begins one
    // clean 180 ms ease immediately instead of making the ray ease chase a
    // second moving target behind it.
    const tierTarget = enabled && aoQuality === "full"
      ? aoTierWeight * idleProfileTarget
      : 0;
    if (idleProfileImmediate) {
      rayTierWeight = tierTarget;
      idleProfileImmediate = false;
    } else {
      rayTierWeight = easeExponential(
        rayTierWeight,
        tierTarget,
        deltaSeconds,
        1 / POST_TIER_FADE_SECONDS,
      );
    }

    if (!shadowLight) {
      godRaysEffect.weight = 0;
      return;
    }
    const shadowMap = shadowLight.shadow.map?.depthTexture ?? null;
    godRaysEffect.setShadowRig(shadowMap, shadowLight.shadow.matrix);
    if (!shadowMap) {
      // No map has been rendered yet (first frames, or shadows shed entirely
      // at `constrained`): there is nothing to agree with, so draw nothing.
      godRaysEffect.weight = 0;
      return;
    }

    scratchLightDelta.copy(shadowLight.position).sub(shadowLight.target.position);
    const distance = scratchLightDelta.length();
    const elevation = distance > 1e-4
      ? Math.asin(Math.min(1, Math.max(-1, scratchLightDelta.y / distance)))
      : Math.PI / 2;
    godRaysEffect.weight = gardenGodRayLowSunGate(elevation, phaseNightWeight)
      * rayTierWeight
      * rayPhaseDensity
      * GODRAY_INTENSITY;
  }

  function getTextureManifest(): readonly TextureOwnerManifestEntry[] {
    const entries: TextureOwnerManifestEntry[] = [];
    const seen = new Set<Texture>();
    const composerRuntime = composer as unknown as {
      depthRenderTarget?: WebGLRenderTarget | null;
    };

    // EffectComposer's input/output color attachments and its three depth
    // attachments are not reachable from the scene graph. The depth render
    // target contributes both its color attachment and its stable depth.
    addManifestTextures(entries, seen, "post.composer.input-color", composer.inputBuffer.texture);
    addManifestTextures(entries, seen, "post.composer.output-color", composer.outputBuffer.texture);
    addManifestTextures(entries, seen, "post.composer.input-depth", composer.inputBuffer.depthTexture);
    addManifestTextures(entries, seen, "post.composer.output-depth", composer.outputBuffer.depthTexture);
    addManifestTextures(entries, seen, "post.composer.depth-target-color", composerRuntime.depthRenderTarget);
    addManifestTextures(entries, seen, "post.composer.stable-depth", composerRuntime.depthRenderTarget?.depthTexture);
    addManifestTextures(
      entries,
      seen,
      "post.composer.copy-target",
      (composer as unknown as { copyPass?: { renderTarget?: unknown } }).copyPass?.renderTarget,
    );

    // n8ao does not publish a resource API. These are its owned targets and
    // lookup texture; the pass's depth texture is the composer's stable one
    // above and is deliberately not claimed a second time.
    const n8aoRuntime = n8aoPass as unknown as Record<string, unknown>;
    const n8aoOwners: Record<string, string> = {
      accumulationRenderTarget: "post.n8ao.accumulation",
      bluenoise: "post.n8ao.blue-noise",
      depthDownsampleTarget: "post.n8ao.depth-downsample",
      outputTargetInternal: "post.n8ao.output",
      readTargetInternal: "post.n8ao.read",
      transparencyRenderTargetDWFalse: "post.n8ao.transparency-dw-false",
      transparencyRenderTargetDWTrue: "post.n8ao.transparency-dw-true",
      writeTargetInternal: "post.n8ao.write",
    };
    for (const [key, owner] of Object.entries(n8aoOwners)) {
      addManifestTextures(entries, seen, owner, n8aoRuntime[key]);
    }

    // BloomEffect's ordinary target is unused while mipmap blur is enabled.
    // The luminance target plus the distinct down/upsampling mipmaps are the
    // live pyramid, with upsampling level 0 sharing its render target.
    const bloomRuntime = bloomEffect as unknown as Record<string, unknown>;
    addManifestTextures(entries, seen, "post.bloom.fallback-target", bloomRuntime.renderTarget);
    const luminancePass = bloomRuntime.luminancePass as { renderTarget?: unknown } | undefined;
    addManifestTextures(entries, seen, "post.bloom.luminance", luminancePass?.renderTarget);
    const mipmapBlurPass = bloomRuntime.mipmapBlurPass as {
      downsamplingMipmaps?: unknown;
      upsamplingMipmaps?: unknown;
    } | undefined;
    if (Array.isArray(mipmapBlurPass?.downsamplingMipmaps)) {
      mipmapBlurPass.downsamplingMipmaps.forEach((target, index) => {
        addManifestTextures(entries, seen, `post.bloom.downsampling.${index}`, target);
      });
    }
    if (Array.isArray(mipmapBlurPass?.upsamplingMipmaps)) {
      mipmapBlurPass.upsamplingMipmaps.forEach((target, index) => {
        addManifestTextures(entries, seen, `post.bloom.upsampling.${index}`, target);
      });
    }

    const tiltRuntime = tiltShiftEffect as unknown as Record<string, unknown>;
    addManifestTextures(entries, seen, "post.tilt-shift.blur-x", tiltRuntime.blurTargetA);
    addManifestTextures(entries, seen, "post.tilt-shift.blur-y", tiltRuntime.blurTargetB);
    const godRayRuntime = godRaysEffect as unknown as Record<string, unknown>;
    addManifestTextures(entries, seen, "post.god-rays.half-res", godRayRuntime.rayTarget);
    addManifestTextures(entries, seen, "post.lut.grade", lutTexture);
    addManifestTextures(entries, seen, "post.lut.dither", ditherTexture);
    addManifestTextures(entries, seen, "post.smaa.edges", smaaEffect.edgesTexture);
    addManifestTextures(entries, seen, "post.smaa.weights", smaaEffect.weightsTexture);
    const weightsMaterial = (smaaEffect as unknown as {
      weightsMaterial?: { searchTexture?: unknown; areaTexture?: unknown };
    }).weightsMaterial;
    addManifestTextures(entries, seen, "post.smaa.search", weightsMaterial?.searchTexture);
    addManifestTextures(entries, seen, "post.smaa.area", weightsMaterial?.areaTexture);

    return entries;
  }

  return {
    dispose() {
      // The N8AO pass carries a local adapter because n8ao@2.0.0's inherited
      // generic disposal does not reach its fullscreen-triangle wrappers.
      // The composer owns every other pass, both frame buffers, and copy pass.
      composer.dispose();
      // The two LUT/dither textures are loaded here, so they are freed here;
      // the composer only owns what it created.
      lutTexture?.dispose();
      ditherTexture?.dispose();
    },
    getTextureManifest,
    getPassList() {
      passList.length = 0;
      if (enabled) {
        passList.push("render");
        if (n8aoPass.enabled) passList.push("n8ao");
        if (bloomPass.enabled) passList.push("bloom");
        // "dof" (W2.3) and "godrays" (W2.4) are fused into the grade pass, like
        // "output" and "lut" below, so none of the four adds a draw to the main
        // chain. They are listed only while their weights are non-zero, which
        // is what makes the list evidence: a day frame shows "dof" and no
        // "godrays", a dusk frame at full tier shows both, and a night frame
        // shows neither ray nor any change of colour.
        if (tiltShiftEffect.strength > 0) passList.push("dof");
        if (godRaysEffect.weight > 0) passList.push("godrays");
        // "output" is the tone-map/sRGB stage and "lut" the authored cube plus
        // dither, both fused into the grade pass rather than adding a draw.
        passList.push("grade", "output", "lut", "smaa");
      }
      return passList;
    },
    isComposerEnabled() {
      return enabled;
    },
    render(deltaTime) {
      syncIdleProfile(deltaTime ?? 0);
      easePostAssets(deltaTime);
      syncCameraDerivedUniforms();
      syncGodRays(deltaTime ?? 0);
      if (!enabled) {
        // The composer permanently disables the renderer's autoClear, so the
        // direct fallback must clear explicitly.
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(scene, camera);
        return;
      }
      const renderedAO = n8aoPass.enabled;
      composer.render(deltaTime);
      if (renderedAO) aoTextureResourcesResident = true;
    },
    setAOTierWeight(weight) {
      aoTierWeight = clampUnit(weight);
      syncTierFidelity();
    },
    setAOEnabled(aoEnabled) {
      aoTierWeight = aoEnabled ? 1 : 0;
      syncTierFidelity();
    },
    setAOQuality(quality) {
      aoQuality = quality;
      syncTierFidelity();
    },
    setAOZoomDetail(detail) {
      aoZoomDetail = detail;
      syncTierFidelity();
      if (aoZoomDetail <= 0 && aoTextureResourcesResident) {
        releaseN8AOTextureResources(n8aoPass);
        aoTextureResourcesResident = false;
      }
    },
    setBloomEnabled(bloomEnabled) {
      // Pass-level toggle: the composer skips disabled passes outright, which
      // is cheaper than rebuilding the chain — and the grade/tone-map/SMAA
      // stages stay on at every tier (tier color invariance).
      bloomPass.enabled = bloomEnabled;
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      syncTierFidelity();
    },
    setIdleProfile(idle, immediate = false) {
      idleProfileTarget = idle ? 0 : 1;
      idleProfileImmediate = immediate;
      if (immediate) {
        idleProfileWeight = idleProfileTarget;
        syncTierFidelity();
      }
    },
    setFocusBandDistance(distance) {
      focusBandOverride = distance !== null && Number.isFinite(distance) ? distance : null;
    },
    setGrade(dayMix, duskMix, stormLevel = 0, flash = 0, winter = 0) {
      applyGrade(dayMix, duskMix, stormLevel, flash, winter);
    },
    setSize(width, height, _dpr) {
      // pmndrs sizes its buffers from the renderer's drawing buffer size, so
      // DPR is already accounted for by the time world-renderer calls this;
      // the parameter stays only to keep the signature stable.
      composer.setSize(width, height);
    },
  };
}
