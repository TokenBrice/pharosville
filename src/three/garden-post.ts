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
  ClampToEdgeWrapping,
  Color,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  Texture,
  TextureLoader,
  Uniform,
  Vector2,
  Vector3,
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
 * the 72-texture census. They belong to the post chain, which means the scene
 * census in `world-renderer.ts` cannot see them — it walks the scene graph, and
 * post textures (N8AO's own blue noise, SMAA's search/area pair, the bloom
 * pyramid) all count as renderer-internal there. These two join that set.
 */
const LUT_TEXTURE_URL = "/pharosville/textures/garden-grade-lut.png?v=0316dd17dc89";
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
  // Grade, tone mapping and the LUT share one pass so they fuse into a single
  // full-screen draw (all three are attribute-free, so registration order
  // holds). The order IS the contract: parametric grade on the linear HDR
  // frame, then AgX, then the authored cube and the dither on the display
  // signal AgX produced.
  const gradePass = new EffectPass(camera, gradeEffect, toneMappingEffect, lutEffect);

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
    syncAOPass();
  }
  applyGrade(0, 0);

  /** Frame-rate independent approach, so the fade lasts the same wall time. */
  function easePostAsset(current: number, target: number, deltaSeconds: number): number {
    if (current === target) return target;
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 1 / 60;
    const next = current + (target - current) * (1 - Math.exp(-POST_ASSET_FADE_RATE * delta));
    return Math.abs(target - next) < 1e-3 ? target : next;
  }

  function easePostAssets(deltaSeconds = 0): void {
    lutUniforms.lutMix.value = easePostAsset(lutUniforms.lutMix.value, lutTarget, deltaSeconds);
    lutUniforms.ditherMix.value = easePostAsset(lutUniforms.ditherMix.value, ditherTarget, deltaSeconds);
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
    getPassList() {
      passList.length = 0;
      if (enabled) {
        passList.push("render");
        if (n8aoPass.enabled) passList.push("n8ao");
        if (bloomPass.enabled) passList.push("bloom");
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
      easePostAssets(deltaTime);
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
