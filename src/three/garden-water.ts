import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import type { PharosVilleRenderSchedulerState } from "../renderer/render-types";
import { seaQualityTier } from "../renderer/render-scheduler";
import { HARBOR_PALETTE } from "../systems/palette";
import type { SeaState } from "../systems/sea-state";
import {
  GARDEN_BREATH_PHASE,
  GARDEN_DEFAULT_WIND_X,
  GARDEN_DEFAULT_WIND_Z,
  gardenBreathAt,
  type WeatherPlan,
} from "../systems/weather";
import {
  blendDayCycleColor,
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  dayCyclePhase,
  MOON_COLOR,
} from "./garden-day-cycle";
import {
  gardenHeightFogGlsl,
  gardenHeightFogUniforms,
  updateGardenHeightFog,
} from "./garden-height-fog";
import { GARDEN_MOON_AZIMUTH, gardenBokashiBandGlsl } from "./garden-sky";
import { gardenSunPose } from "./garden-sun";
import { MAX_GARDEN_LIGHT_LANES } from "./garden-lanterns";
import {
  SEA_REGION_CHARACTER,
  SEA_REGION_COUNT,
  SEA_REGION_FALLBACK_TINT,
  SEA_REGION_ID,
  SEA_REGION_ORDER,
  buildSeaRegionField,
} from "../systems/garden-sea-regions";
import {
  GARDEN_WATER_CREST_FOAM,
  GARDEN_WATER_GLINT_NORMAL_FILTER_GAIN,
  GARDEN_WATER_MAX_RIPPLE_RINGS,
  GARDEN_WATER_MAX_ZONE_TINTS,
  GARDEN_WATER_NIGHT_EMISSIVE_BUDGET,
  GARDEN_WATER_PLATE_MARGIN_TILES,
  GARDEN_WATER_PROBE_BLEND,
  GARDEN_WATER_PROBE_ROUGHNESS,
  GARDEN_WATER_SHORE_FOAM,
  type GardenCloudShadowSource,
  type GardenHarborCalmMask,
  type GardenRippleRingEmitter,
  type GardenWaterZoneTint,
} from "./garden-water-contract";

// Tile -> world scale, mirroring TILE_SCALE in garden-util. Redeclared here to
// keep garden-water free of a util import cycle.
const TILE_SCALE_UNITS = Math.SQRT2;
/**
 * W2 / D5+W2.7: how strongly a region tints its water.
 *
 * The old per-band values were 0.04-0.20 because six ellipses STACKED — a
 * WATCH tint covering the whole map had to be almost invisible or it would
 * wash everything. A partition has no stacking, so each region can read
 * properly. Character (swell, chop, foam, reflectivity) still carries most of
 * the signal; this is the supporting colour.
 */
const REGION_TINT_STRENGTH = 0.2;

/**
 * Bakes the terrain-derived sea-region field into GPU textures.
 *
 * S5: the field carries two channels with OPPOSITE filtering needs, so it ships
 * as two textures rather than one.
 *
 * - The region **id** must be point-sampled. A bilinear blend between region 1
 *   and region 3 would produce region 2 and paint a phantom band along every
 *   boundary.
 * - The **boundary distance** is a smooth scalar, and point-sampling it is why
 *   the tide lines crawled: at whole-map framing one screen pixel covers
 *   several texels, and the seam terms read a 0.14-wide window of it, so the
 *   line stair-stepped and swam as the camera moved. Linear filtering plus
 *   mipmaps resolves it the way any other continuous field would be.
 */
function createSeaRegionTextures(): {
  distance: DataTexture;
  field: DataTexture;
  tileSpan: number;
} {
  const baked = buildSeaRegionField();
  const field = new DataTexture(baked.data, baked.size, baked.size, RGBAFormat);
  field.magFilter = NearestFilter;
  field.minFilter = NearestFilter;
  field.generateMipmaps = false;
  field.needsUpdate = true;
  field.flipY = false;

  // Distance-only copy. Same bytes, different sampler state — the two cannot
  // share a texture because filtering is a property of the texture, not the
  // fetch.
  const distanceData = new Uint8Array(baked.size * baked.size * 4);
  for (let index = 0; index < baked.size * baked.size; index += 1) {
    const boundary = baked.data[index * 4 + 1]!;
    distanceData[index * 4] = boundary;
    distanceData[index * 4 + 1] = boundary;
    distanceData[index * 4 + 2] = boundary;
    distanceData[index * 4 + 3] = 255;
  }
  const distance = new DataTexture(distanceData, baked.size, baked.size, RGBAFormat);
  distance.magFilter = LinearFilter;
  distance.minFilter = LinearMipmapLinearFilter;
  distance.generateMipmaps = true;
  distance.needsUpdate = true;
  distance.flipY = false;

  return { distance, field, tileSpan: baked.tileSpan };
}
const WATER_SEGMENTS = 96;
export const GARDEN_WATER_MAX_DISPLACEMENT = 0.036;

/**
 * Phase 3 (item 1): the Gerstner spectrum that replaces the 3-wave sine sum.
 *
 * Seven components spread ±0.6 rad around the historical primary bearing, so
 * default weather (windRot = identity at the base bearing) reproduces the
 * pre-Gerstner sea's motion character. Amplitudes sum to 1.0 — the master
 * `uWaveAmplitude` scale (swell + storm, capped at MAX_DISPLACEMENT) is
 * unchanged, so the displacement contract with the zone-root plane holds.
 * Wavelengths stay ≥ 33 world units: the 96×96 grid samples at ~9.4 units,
 * and anything shorter would alias into the vertex normals.
 *
 * `omega` is the phase rate (rad/s at tempo 0); the tempo multiplier the sine
 * field used (`0.72 + uTempo * 0.38`) applies on top, so the sea's tempo
 * contract is untouched.
 */
export interface GerstnerComponent {
  /** Radians from the historical primary bearing (0.9229, 0.3851). */
  dirOffset: number;
  /** World units; ≥ 33 so the 96×96 grid samples it honestly. */
  wavelength: number;
  /** Share of the master amplitude; the seven shares sum to 1. */
  amplitude: number;
  /** Steepness Q — horizontal displacement and crest sharpness, 0..1. */
  steepness: number;
  /** Phase rate in rad/s before the tempo multiplier. */
  omega: number;
}

export const GARDEN_WATER_GERSTNER: readonly GerstnerComponent[] = [
  { dirOffset: -0.52, wavelength: 185, amplitude: 0.26, steepness: 0.55, omega: 0.16 },
  { dirOffset: -0.3, wavelength: 132, amplitude: 0.2, steepness: 0.52, omega: 0.19 },
  { dirOffset: -0.1, wavelength: 96, amplitude: 0.16, steepness: 0.5, omega: 0.22 },
  { dirOffset: 0.04, wavelength: 74, amplitude: 0.13, steepness: 0.46, omega: 0.25 },
  { dirOffset: 0.18, wavelength: 57, amplitude: 0.11, steepness: 0.42, omega: 0.29 },
  { dirOffset: 0.38, wavelength: 44, amplitude: 0.08, steepness: 0.38, omega: 0.33 },
  { dirOffset: 0.6, wavelength: 33, amplitude: 0.06, steepness: 0.34, omega: 0.38 },
];

const GERSTNER_BASE_BEARING = Math.atan2(0.3851, 0.9229);
const GERSTNER_BASE_X = Math.cos(GERSTNER_BASE_BEARING);
const GERSTNER_BASE_Y = Math.sin(GERSTNER_BASE_BEARING);

export interface GardenGerstnerSampleInput {
  /** Master rendered displacement amplitude. */
  amplitudeScale: number;
  /** Shader phase-time (`uTime * (0.72 + uTempo * 0.38)`). */
  phaseTime: number;
  /** Regional coordinate/chop multiplier. */
  spatialScale: number;
  /** Water-local X coordinate. */
  waterX: number;
  /** Water-local Y coordinate (`-worldZ`). */
  waterY: number;
  /** World-XZ downwind direction: where the visible wave travels toward. */
  windDirX: number;
  windDirZ: number;
}

export interface GardenGerstnerSample {
  determinant: number;
  displacementX: number;
  displacementY: number;
  gradientX: number;
  gradientY: number;
  height: number;
  jxx: number;
  jxy: number;
  jyx: number;
  jyy: number;
}

/**
 * CPU reference for the rendered Gerstner field. It intentionally returns the
 * derivative of the final horizontal position (p + displacement), not an
 * unscaled steepness proxy, so tests can compare it to finite differences.
 */
export function sampleGardenGerstner(
  input: GardenGerstnerSampleInput,
  spectrum: readonly GerstnerComponent[] = GARDEN_WATER_GERSTNER,
): GardenGerstnerSample {
  const windLength = Math.hypot(input.windDirX, input.windDirZ);
  const windX = windLength > 1e-8
    ? input.windDirX / windLength
    : GARDEN_DEFAULT_WIND_X;
  const windZ = windLength > 1e-8
    ? input.windDirZ / windLength
    : GARDEN_DEFAULT_WIND_Z;
  // Weather points downwind. With phase `dot(k, p) + omega*t`, the phase
  // gradient points opposite the direction in which the crest travels.
  const phaseWindX = -windX;
  const phaseWindY = windZ;
  const rc = GERSTNER_BASE_X * phaseWindX + GERSTNER_BASE_Y * phaseWindY;
  const rs = GERSTNER_BASE_X * phaseWindY - GERSTNER_BASE_Y * phaseWindX;
  const amplitudeScale = Number.isFinite(input.amplitudeScale) ? input.amplitudeScale : 0;
  const spatialScale = Number.isFinite(input.spatialScale) ? input.spatialScale : 0;
  const pX = input.waterX * spatialScale;
  const pY = input.waterY * spatialScale;
  let height = 0;
  let displacementX = 0;
  let displacementY = 0;
  let gradientX = 0;
  let gradientY = 0;
  let jxx = 1;
  let jxy = 0;
  let jyx = 0;
  let jyy = 1;

  for (const component of spectrum) {
    const angle = GERSTNER_BASE_BEARING + component.dirOffset;
    const sourceX = Math.cos(angle);
    const sourceY = Math.sin(angle);
    const directionX = rc * sourceX - rs * sourceY;
    const directionY = rs * sourceX + rc * sourceY;
    const k = (Math.PI * 2) / component.wavelength;
    const phase = k * (directionX * pX + directionY * pY)
      + component.omega * input.phaseTime;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const heightAmplitude = component.amplitude * amplitudeScale;
    const displacementAmplitude = component.steepness * heightAmplitude;
    height += heightAmplitude * sine;
    displacementX += directionX * displacementAmplitude * cosine;
    displacementY += directionY * displacementAmplitude * cosine;
    const heightDerivative = heightAmplitude * k * spatialScale * cosine;
    gradientX += directionX * heightDerivative;
    gradientY += directionY * heightDerivative;
    const horizontalDerivative = displacementAmplitude * k * spatialScale * sine;
    jxx -= horizontalDerivative * directionX * directionX;
    jxy -= horizontalDerivative * directionX * directionY;
    jyx -= horizontalDerivative * directionY * directionX;
    jyy -= horizontalDerivative * directionY * directionY;
  }

  return {
    determinant: jxx * jyy - jxy * jyx,
    displacementX,
    displacementY,
    gradientX,
    gradientY,
    height,
    jxx,
    jxy,
    jyx,
    jyy,
  };
}

const glslFloat = (value: number): string => {
  const text = value.toFixed(7);
  return text.includes(".") ? text : `${text}.0`;
};

/**
 * Generates the Gerstner sum from the table above, so the component list is
 * the single source of truth the tests assert against. Returns height,
 * horizontal displacement, the height gradient (for analytic normals) and
 * the 2x2 displacement Jacobian (for crest foam) in one pass over seven
 * trig pairs — trivial vertex cost.
 */
function gerstnerSumGlsl(): string {
  const body = GARDEN_WATER_GERSTNER.map((component) => {
    const angle = GERSTNER_BASE_BEARING + component.dirOffset;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const k = (Math.PI * 2) / component.wavelength;
    return `  {
    vec2 d = windRot * vec2(${glslFloat(dx)}, ${glslFloat(dy)});
    float ph = ${glslFloat(k)} * dot(d, p) + ${glslFloat(component.omega)} * t;
    float s = sin(ph);
    float c = cos(ph);
    h += ${glslFloat(component.amplitude)} * s;
    grad += d * (${glslFloat(component.amplitude * k)} * c);
    disp += d * (${glslFloat(component.steepness * component.amplitude)} * c);
    float j = ${glslFloat(component.steepness * component.amplitude * k)} * derivativeScale * s;
    jxx -= j * d.x * d.x;
    jxy -= j * d.x * d.y;
    jyx -= j * d.y * d.x;
    jyy -= j * d.y * d.y;
  }`;
  }).join("\n");
  return /* glsl */ `
  void gardenGerstner(
    vec2 p,
    float t,
    mat2 windRot,
    float derivativeScale,
    out float h,
    out vec2 disp,
    out vec2 grad,
    out float jacobian
  ) {
    h = 0.0;
    disp = vec2(0.0);
    grad = vec2(0.0);
    float jxx = 1.0;
    float jxy = 0.0;
    float jyx = 0.0;
    float jyy = 1.0;
${body}
    jacobian = jxx * jyy - jxy * jyx;
  }
`;
}
// Kept as the historical export name; the C2 contract constant is canonical.
export const MAX_GARDEN_WATER_ZONES = GARDEN_WATER_MAX_ZONE_TINTS;
// W6: approximate world-unit radius of the island rock at the waterline (the
// shore ellipse spans 18.4 x 13.8 around the island root; 14 is the calm
// circular mean used by the caustic glow and foam-ring SDF).
export const GARDEN_ISLAND_ROCK_RADIUS = 14;

const NORMAL_MAP_URL = "/pharosville/textures/water-normals.png?v=3c09a2159c4f";

// Cloud-shadow world mapping: one noise tile spans ~170 world units. The
// drift itself now comes from the weather system (Phase 2): its default wind
// bearing reproduces the historical east-southeast scud the fixed constants
// below encoded, and storm weather drives it faster.
const CLOUD_SHADOW_TEXEL_SCALE = 1 / 170;

// Moon-road azimuth carried over from the sky so the sea's glitter band lands
// under the same moon the dome draws. The water plane's -90deg X rotation maps
// world +Z to local -Y, so the horizontal moon direction negates its Z.
/** Reused per frame so the water's update path allocates nothing. */
const scratchSunPose = { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2 };

const MOON_DIR = new Vector2(
  Math.cos(GARDEN_MOON_AZIMUTH),
  -Math.sin(GARDEN_MOON_AZIMUTH),
).normalize();

// Palette-derived sea presets (C1: no hex literals — everything derives from
// HARBOR_PALETTE and the day-cycle preset objects). The Garden Sea day identity
// (D-R1 ukiyo-e morning) is a shallow→deep HSV ramp: turquoise shelf water →
// saturated blue mids → deep indigo-violet open sea, posterized into flat
// bands by the shader. Night keeps the Lantern Sea as indigo bands. Every band
// stays below the bloom knee (per-state thresholds in garden-post): large
// water areas must never bloom — only sparse glitter, foam, and emissives may.
const pc = (key: keyof typeof HARBOR_PALETTE): Color => new Color(HARBOR_PALETTE[key]);
// R4: noon has to read as noon. Every "sea" entry in HARBOR_PALETTE is an
// indigo (deep_sea_1 #0f1b33, shallow_teal #152d4c, sky_day_zenith #1f587c),
// so the old day ramp was essentially the night sky at a slightly higher
// value — a warm-lit fleet floating on a midnight sea at hour 12.
//
// The day sea now sits in a JADE/TEAL family built from sail_teal and
// aurora_green: a turquoise shelf, a jade mid-water, and a deep teal basin.
// Night and dusk keep their indigo, so the day/night contrast is a real
// journey rather than two shades of the same blue.
//
// All three stay far below the day bloom knee (0.95 luminance) — large water
// areas must never bloom, only glitter and foam may.
const DAY_SHALLOW = pc("sky_day_zenith").lerp(pc("aurora_green"), 0.46).lerp(pc("lantern_cold"), 0.12);
const DAY_MID = pc("sky_day_zenith").lerp(pc("sail_teal"), 0.45).lerp(pc("aurora_green"), 0.24);
// L3: anchored on sail_teal, not on the day zenith.
//
// The zenith (#1f587c) is a sky blue, so building the deep band out of it made
// the deepest — and largest — stretch of water 22 points bluer in green-vs-blue
// than the jade the rest of the ramp is written in, and the frame average went
// with it. Starting from the teal and tinting it with the zenith keeps the
// daylight in the colour without letting the sky decide the sea's hue.
//
// It still finishes slightly blue of neutral (G-B about -7), and it should:
// water genuinely does go blue with depth, and a deep band that did not would
// read as painted. What changed is that the blue is now the deep END of a teal
// ramp rather than the whole ramp's family.
//
// Anchoring on deep_sea_1 would drag the plate toward black; the finite water
// therefore keeps its deep band in the same teal family as its shallows.
const DAY_DEEP = pc("sail_teal").lerp(pc("sky_day_zenith"), 0.18).lerp(pc("deep_sea_1"), 0.3);
// W1.6: the dusk sea was pink-mauve, and it was these three lines that made it.
//
// The old ramp mixed a warm dye into an indigo body — shallow was indigo tinted
// 16 % with lantern gold, mid was indigo tinted 30 % with ember — which lands
// on a rose-gray shelf (#534242, hue 0) over a kachi-iro basin (#101528). There
// is no way to read that gradient except as mauve: every intermediate step
// between a warm neutral and an indigo IS violet, and the frame was full of
// intermediate steps. Measured off `outputs/w16-before-dusk.png`, the open sea
// sampled hue 270-291 at 15-18 % saturation across four widely separated
// patches. The W1.1 LUT could not fix it from the grade side without touching
// violet, which sail identity forbids, so it was handed here.
//
// The dusk story the LUT authors is teal shadows and gold-amber light. So the
// warmth moves OUT of the body colour and INTO the highlight, where the sun
// path belongs, and the body walks a dentō-shoku descent instead: nando-iro
// (納戸色) gray-teal shelf, ai body, kachi-iro deep. Hues now run OKLCH
// 226 -> 238 -> 267 — still ending on indigo-violet, as it should, but arriving
// there from the blue-green side rather than from rose.
const DUSK_SHALLOW = pc("shallow_teal")
  .lerp(pc("sail_teal"), 0.4)
  .lerp(pc("lantern_cold"), 0.12)
  .lerp(pc("lantern_warm"), 0.04);
const DUSK_MID = pc("deep_sea_1").lerp(pc("sail_teal"), 0.28).lerp(pc("shallow_teal"), 0.25);
const DUSK_DEEP = pc("deep_sea_2").lerp(pc("deep_sea_1"), 0.5);
const NIGHT_SHALLOW = pc("shallow_teal").lerp(pc("deep_sea_1"), 0.25);
const NIGHT_MID = pc("deep_sea_1").lerp(pc("shallow_teal"), 0.3);
const NIGHT_DEEP = pc("deep_sea_2");
const DAY_HIGHLIGHT = pc("foam_white");
// W1.6: the gold the body colour gave up is spent here instead — 0.22 -> 0.34,
// which is the sun path on the water rather than a dye through the whole sea.
const DUSK_HIGHLIGHT = DAY_HIGHLIGHT.clone().lerp(pc("lantern_warm"), 0.34);
const NIGHT_HIGHLIGHT = pc("moonlight");
const BEACON_HIGHLIGHT = pc("lantern_glow");
const MOON_ROAD_COLOR = pc("moonlight");

// W2 sky env tint endpoints come from the C1 sky presets; at night the sheen
// becomes moonlight (W6), so the night variants are pre-mixed with the moon.
// The day horizon is pulled toward the zenith so the sheen stays below the
// bloom knee even at full mask strength.
const DAY_ENV_HORIZON = DAY_CYCLE_SKY_PRESETS.day.horizon.clone()
  .lerp(DAY_CYCLE_SKY_PRESETS.day.zenith, 0.45);
const DAY_ENV_ZENITH = DAY_CYCLE_SKY_PRESETS.day.zenith.clone();
const DUSK_ENV_HORIZON = DAY_CYCLE_SKY_PRESETS.dusk.horizon.clone();
const DUSK_ENV_ZENITH = DAY_CYCLE_SKY_PRESETS.dusk.zenith.clone();
const NIGHT_ENV_HORIZON = DAY_CYCLE_SKY_PRESETS.night.horizon.clone().lerp(MOON_COLOR, 0.35);
const NIGHT_ENV_ZENITH = DAY_CYCLE_SKY_PRESETS.night.zenith.clone().lerp(MOON_COLOR, 0.18);

// Exported for the shader-hygiene guard test (undeclared-uniform tripwire).
export const VERTEX_SHADER = /* glsl */ `
  uniform float uDetail;
  uniform float uHarborCalm;
  uniform vec4 uHarborEllipse;
  uniform float uTempo;
  uniform float uTime;
  uniform float uWaveAmplitude;
  uniform vec2 uWindDir;
  uniform float uWindSpeed;
  uniform float uBreath;
  uniform float uStorm;
  uniform sampler2D uRegionField;
  uniform vec4 uRegionSwell[${SEA_REGION_COUNT}];
  uniform vec4 uRegionTransform;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;
  varying vec2 vRegionUv;
  varying vec3 vGerstnerNormal;
  varying float vGerstnerJ;

  #include <fog_pars_vertex>

  ${gerstnerSumGlsl()}

  void main() {
    vec2 waterPosition = position.xy;
    float harborDistance = length((waterPosition - uHarborEllipse.xy) * uHarborEllipse.zw);
    float harborCalm = (1.0 - smoothstep(0.7, 1.05, harborDistance)) * uHarborCalm;
    vec2 regionUv = (waterPosition - uRegionTransform.xy) * uRegionTransform.zw;
    vec4 regionSample = texture2D(uRegionField, regionUv);
    int regionId = int(regionSample.r * 255.0 + 0.5);
    float regionSwell = uRegionSwell[regionId].x;
    float regionChop = uRegionSwell[regionId].y * (1.0 + uWindSpeed * 0.3 + uStorm * 0.25);

    vec2 baseDir = normalize(vec2(0.9229, 0.3851));
    vec2 phaseWindDir = -uWindDir;
    float rc = clamp(dot(baseDir, phaseWindDir), -1.0, 1.0);
    float rs = baseDir.x * phaseWindDir.y - baseDir.y * phaseWindDir.x;
    mat2 windRot = mat2(rc, rs, -rs, rc);
    float speed = 0.72 + uTempo * 0.38;
    float ampScale = uWaveAmplitude * regionSwell * (1.0 - harborCalm * 0.8);
    float waveH;
    vec2 waveDisp;
    vec2 waveGrad;
    float waveJ;
    gardenGerstner(
      waterPosition * regionChop,
      uTime * speed,
      windRot,
      ampScale * regionChop,
      waveH,
      waveDisp,
      waveGrad,
      waveJ
    );
    vec3 displaced = position;
    displaced.x += waveDisp.x * ampScale;
    displaced.y += waveDisp.y * ampScale;
    displaced.z += waveH * ampScale;
    vGerstnerNormal = vec3(-waveGrad * (ampScale * regionChop), 1.0);
    vGerstnerJ = waveJ;

    vRegionUv = regionUv;
    vWaterPosition = waterPosition;
    vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

// Exported for the shader-hygiene guard test (undeclared-uniform tripwire).
// W3.3 danger rain is authored inside this shader in screen space and masked
// by the point-sampled region id. It therefore cannot drift beyond Danger
// Strait, and the existing reduced-motion time freeze stops the fall.
export const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D envMap;
  uniform vec3 uBandColor[4];
  uniform vec3 uBaseColor;
  uniform float uBeaconAngle;
  uniform vec3 uBeaconColor;
  uniform float uBeaconFlicker;
  uniform vec2 uBeaconPosition;
  uniform float uBeaconStrength;
  uniform float uCausticStrength;
  uniform vec2 uCemeteryCenter;
  uniform sampler2D uCloudShadow;
  uniform float uCloudShadowStrength;
  uniform vec4 uCloudShadowTransform;
  uniform float uDaylight;
  uniform vec3 uDeepColor;
  uniform float uDetail;
  uniform float uDusk;
  uniform vec3 uEnvHorizonColor;
  uniform float uEnvStrength;
  uniform vec3 uEnvZenithColor;
  uniform float uEnvironmentIntensity;
  uniform float uGlitterStrength;
  uniform float uHarborCalm;
  uniform vec4 uHarborEllipse;
  uniform vec3 uHighlightColor;
  uniform vec2 uIslandCenter;
  uniform float uLaneCount;
  uniform vec3 uLaneField;
  uniform sampler2D uLaneTexture;
  uniform float uPulseTime;
  uniform vec2 uMoonDir;
  uniform vec2 uSunDir;
  uniform float uSunHeight;
  #define GARDEN_TOWER_HEIGHT 34.0
  #define GARDEN_TOWER_SHADOW_MAX_REACH 150.0
  #define GARDEN_TOWER_SHADOW_STRENGTH 0.34
  uniform vec3 uMoonRoadColor;
  uniform float uNight;
  uniform sampler2D uNormalMap;
  uniform vec2 uPigeonnierCenter;
  uniform vec4 uRipple[${GARDEN_WATER_MAX_RIPPLE_RINGS}];
  uniform float uRippleCount;
  uniform vec4 uRippleParams[${GARDEN_WATER_MAX_RIPPLE_RINGS}];
  uniform float uRippleStrength;
  uniform float uRockRadius;
  uniform float uStorm;
  uniform vec3 uShallowColor;
  uniform vec3 uSunGlitterColor;
  uniform float uSwell;
  uniform float uTempo;
  uniform float uTime;
  uniform float uWaveAmplitude;
  uniform float uWaterLevel;
  uniform float uWakeStrength;
  uniform sampler2D uWakeMap;
  uniform vec2 uWakeCenter;
  uniform float uWakeInvSize;
  uniform float uWakeTexel;
  uniform vec2 uWindDir;
  uniform float uWindSpeed;
  uniform float uBreath;
  uniform float uPegSummaryEpistemicHaze;
  uniform sampler2D uRegionField;
  uniform sampler2D uRegionDistance;
  uniform vec3 uRegionColor[${SEA_REGION_COUNT}];
  uniform vec4 uRegionParams[${SEA_REGION_COUNT}];
  uniform vec4 uRegionTransform;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;
  varying vec2 vRegionUv;
  varying vec3 vGerstnerNormal;
  varying float vGerstnerJ;

  #include <fog_pars_fragment>
  #include <cube_uv_reflection_fragment>

  const float LANE_TEXELS = ${MAX_GARDEN_LIGHT_LANES}.0;

  vec3 sampleWaterNormal(vec2 uv) {
    return texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
  }

  float gardenHash(vec2 p) {
    vec2 folded = mod(p, 289.0);
    return fract(sin(dot(folded, vec2(127.1, 311.7))) * 43758.5453);
  }

  float gardenValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(gardenHash(i), gardenHash(i + vec2(1.0, 0.0)), u.x),
      mix(gardenHash(i + vec2(0.0, 1.0)), gardenHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float gardenFbm(vec2 p) {
    return gardenValueNoise(p) * 0.68 + gardenValueNoise(p * 2.1 + 17.3) * 0.32;
  }

  vec2 rotate2(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  float aaStep(float edge, float value) {
    float width = max(fwidth(value), 1e-4);
    return smoothstep(edge - width, edge + width, value);
  }

  vec3 gardenEnvironmentReflection(
    vec3 worldNormal,
    vec3 worldViewDirection,
    vec3 scalarFallback
  ) {
    #ifdef ENVMAP_TYPE_CUBE_UV
      vec3 reflectionDirection = reflect(-worldViewDirection, worldNormal);
      vec3 probeColor = textureCubeUV(
        envMap,
        reflectionDirection,
        ${glslFloat(GARDEN_WATER_PROBE_ROUGHNESS)}
      ).rgb * uEnvironmentIntensity;
      return mix(scalarFallback, probeColor, ${glslFloat(GARDEN_WATER_PROBE_BLEND)});
    #else
      return scalarFallback;
    #endif
  }

${gardenBokashiBandGlsl()}
${gardenHeightFogGlsl()}

  void main() {
    float harborDistance = length((vWaterPosition - uHarborEllipse.xy) * uHarborEllipse.zw);
    float harborCalm = (1.0 - smoothstep(0.7, 1.05, harborDistance)) * uHarborCalm;

    float scroll = uTime * (0.6 + uTempo * 0.9) * (0.92 + uBreath * 0.16);
    vec2 flow = uWindDir * scroll;
    vec3 nA = sampleWaterNormal(vWaterPosition * 0.055 + flow * 0.045);
    vec3 blendedNormal;
    if (uDetail > 0.55) {
      vec3 nB = sampleWaterNormal(
        rotate2(vWaterPosition, 2.3) * 0.11 - flow * 0.03 + vec2(0.37, 0.11)
      );
      blendedNormal = normalize(vec3(nA.xy + nB.xy, nA.z * nB.z + 0.55));
    } else {
      blendedNormal = normalize(vec3(nA.xy, nA.z + 0.55));
    }
    blendedNormal = normalize(mix(blendedNormal, vec3(0.0, 0.0, 1.0), harborCalm * 0.75));
    float camDistance = distance(cameraPosition, vWorldPosition);
    float detailFalloff = max(1.0 - smoothstep(130.0, 460.0, camDistance), 0.32) * uDetail;
    vec3 surfaceNormal = normalize(mix(vec3(0.0, 0.0, 1.0), blendedNormal, detailFalloff));

    surfaceNormal = normalize(
      surfaceNormal + vec3(vGerstnerNormal.xy * (18.0 * detailFalloff), 0.0)
    );

    vec2 normalDerivative = fwidth(blendedNormal.xy);
    float glintDetailWeight = 1.0 / (
      1.0 + length(normalDerivative) * ${glslFloat(GARDEN_WATER_GLINT_NORMAL_FILTER_GAIN)}
    );
    vec3 glintNormal = normalize(mix(
      normalize(vGerstnerNormal),
      blendedNormal,
      clamp(glintDetailWeight, 0.08, 1.0)
    ));

    float wakeFoam = 0.0;
    if (uWakeStrength > 0.01) {
      vec2 wakeUv = (vWaterPosition - uWakeCenter) * uWakeInvSize + 0.5;
      if (all(greaterThan(wakeUv, vec2(0.001))) && all(lessThan(wakeUv, vec2(0.999)))) {
        float w0 = texture2D(uWakeMap, wakeUv).r;
        vec2 wakeGrad = vec2(
          texture2D(uWakeMap, wakeUv + vec2(uWakeTexel, 0.0)).r - w0,
          texture2D(uWakeMap, wakeUv + vec2(0.0, uWakeTexel)).r - w0
        );
        wakeFoam = w0;
        surfaceNormal = normalize(
          surfaceNormal + vec3(wakeGrad * (10.0 * uWakeStrength), 0.0)
        );
      }
    }

    vec2 shoreDelta = vWaterPosition - uIslandCenter - vec2(0.6, -1.2);
    shoreDelta = rotate2(shoreDelta, -0.08) / vec2(18.4, 13.8);
    float shoreAngle = atan(shoreDelta.y, shoreDelta.x);
    float shoreVariation = sin(shoreAngle * 3.0 + 0.3) * 0.04
      + sin(shoreAngle * 7.0 - 0.21) * 0.022;
    float shoreDistance = length(shoreDelta) + shoreVariation;
    float shallowShelf = 1.0 - smoothstep(0.72, 1.5, shoreDistance);

    float cemDist = length((vWaterPosition - uCemeteryCenter) / 4.6);
    float pigDist = length((vWaterPosition - uPigeonnierCenter) / 3.4);
    float isletShelf = (1.0 - smoothstep(0.5, 1.25, cemDist))
      + (1.0 - smoothstep(0.5, 1.25, pigDist));

    float depth = smoothstep(0.92, 3.8, shoreDistance) * 0.72;

    vec2 bathyP = vRegionUv - vec2(0.5);
    float bathyGrain = dot(bathyP, vec2(0.788, 0.616));
    float bathyAcross = dot(bathyP, vec2(-0.616, 0.788));
    float banks = sin(bathyGrain * 3.1 + 0.7) * 0.5
      + sin(bathyAcross * 2.3 - 1.2) * 0.32
      + sin((bathyGrain + bathyAcross) * 4.7 + 2.1) * 0.18;
    depth += banks * 0.26;

    float shelfA = 1.0 - smoothstep(0.55, 1.25, length(
      (vWaterPosition - uIslandCenter - vec2(-14.0, 10.0)) / vec2(22.0, 12.0)
    ));
    float shelfB = 1.0 - smoothstep(0.55, 1.3, length(
      (vWaterPosition - uIslandCenter - vec2(20.0, -8.0)) / vec2(16.0, 10.0)
    ));
    float basin = 1.0 - smoothstep(0.3, 1.1, length(
      (vWaterPosition - uIslandCenter - vec2(34.0, 30.0)) / vec2(34.0, 24.0)
    ));
    depth = clamp(depth + basin * 0.22, 0.0, 1.0);
    depth *= 1.0 - max(shelfA, shelfB) * 0.42;
    depth *= 1.0 - clamp(isletShelf, 0.0, 1.0) * 0.5;
    float bandPosition = clamp(depth, 0.0, 1.0) * 3.0;
    vec3 waterColor = mix(
      uBandColor[0],
      uBandColor[1],
      smoothstep(0.05, 0.95, bandPosition)
    );
    waterColor = mix(
      waterColor,
      uBandColor[2],
      smoothstep(1.05, 1.95, bandPosition)
    );
    waterColor = mix(
      waterColor,
      uBandColor[3],
      smoothstep(2.05, 2.95, bandPosition)
    );
    float tonalCurrent = 0.5 + 0.5 * sin(
      dot(vWaterPosition, vec2(0.046, -0.058)) + uTime * 0.027
    );
    waterColor *= 0.97 + tonalCurrent * 0.05;

    vec2 cloudUv = vec2(vWaterPosition.x, -vWaterPosition.y) * uCloudShadowTransform.xy
      + uCloudShadowTransform.zw;
    float cloudCover = 0.0;
    if (uCloudShadowStrength > 0.001) {
      cloudCover = texture2D(uCloudShadow, cloudUv).r;
    }
    float cloudLight = 1.0 - cloudCover * uCloudShadowStrength;

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float islandDistance = length(vWaterPosition - uIslandCenter);
    float envMask = smoothstep(30.0, 110.0, islandDistance) * (0.2 + 0.8 * depth);
    envMask = max(envMask, harborCalm * 0.75);
    vec3 scalarSkySample = mix(
      uEnvHorizonColor,
      uEnvZenithColor,
      clamp(0.18 + envMask * 0.34 + surfaceNormal.x * 0.14, 0.0, 1.0)
    );
    vec3 worldSurfaceNormal = normalize(vec3(
      surfaceNormal.x,
      surfaceNormal.z,
      -surfaceNormal.y
    ));
    vec3 skySample = gardenEnvironmentReflection(
      worldSurfaceNormal,
      viewDirection,
      scalarSkySample
    );

    vec3 keyDirection = normalize(vec3(-0.46, 0.2, 0.86));
    float facetLight = clamp(dot(surfaceNormal, keyDirection) * 0.5 + 0.55, 0.2, 1.0);
    waterColor *= (0.95 + facetLight * 0.1) * mix(1.0, cloudLight, 0.9);
    float fresnel = pow(1.0 - max(0.0, dot(worldSurfaceNormal, viewDirection)), 3.0);
    waterColor = mix(
      waterColor,
      skySample,
      fresnel * (0.08 + uDaylight * 0.08 + uNight * 0.04)
    );

    waterColor = mix(
      waterColor,
      skySample,
      clamp(envMask * uEnvStrength * (1.0 + harborCalm * 1.2), 0.0, 0.85)
    );

    waterColor = mix(waterColor, uShallowColor, shallowShelf * (0.18 - uNight * 0.05));

    float foamMotion = uTime * 0.55;
    float bandA = sin(shoreDistance * 20.0 - foamMotion);
    float bandB = sin(shoreDistance * 34.0 - foamMotion * 1.35 + shoreAngle * 2.0);
    float bandNoise = 0.6 + 0.4 * sin(shoreAngle * 17.0 + surfaceNormal.y * 3.1);
    float lapFoam = (
      smoothstep(0.55, 0.98, bandA) * 0.7
      + smoothstep(0.7, 0.99, bandB) * 0.5
    ) * bandNoise;
    lapFoam *= (1.0 - smoothstep(0.86, 1.16, shoreDistance))
      * smoothstep(0.7, 0.9, shoreDistance);
    vec2 shoreAdvect = uWindDir * (uTime * 0.035 * (0.6 + uWindSpeed * 0.4));
    float shoreNoise = gardenValueNoise((vWaterPosition - shoreAdvect) * 0.31 + 9.7);
    float shoreBreath = sin(uTime * 0.38 + shoreNoise * 2.4)
      * ${glslFloat(GARDEN_WATER_SHORE_FOAM.breathAmplitude)};
    float shoreLineDistance = abs(shoreDistance - (0.985 + shoreBreath));
    float shoreEdge = 1.0 - smoothstep(
      ${glslFloat(GARDEN_WATER_SHORE_FOAM.lineCore)},
      ${glslFloat(GARDEN_WATER_SHORE_FOAM.lineFeather)},
      shoreLineDistance
    );
    shoreEdge *= smoothstep(0.38, 0.76, shoreNoise);
    float shoreFoam = (shoreEdge + lapFoam * 0.36) * (0.1 + uDetail * 0.12) * (0.72 + uDaylight * 0.28);
    waterColor = mix(
      waterColor,
      uHighlightColor,
      clamp(shoreFoam, 0.0, ${glslFloat(GARDEN_WATER_SHORE_FOAM.maxMix)})
    );

    waterColor = mix(waterColor, uShallowColor, clamp(isletShelf, 0.0, 1.0) * (0.22 - uNight * 0.06));
    float isletLine = (1.0 - smoothstep(0.018, 0.07, abs(cemDist - (1.0 + shoreBreath))))
      + (1.0 - smoothstep(0.02, 0.085, abs(pigDist - (1.0 - shoreBreath))));
    isletLine *= smoothstep(0.4, 0.74, gardenValueNoise(
      (vWaterPosition + shoreAdvect) * 0.37 - 5.2
    ));
    waterColor = mix(
      waterColor,
      uHighlightColor,
      clamp(isletLine * (0.1 + uDetail * 0.1), 0.0, ${glslFloat(GARDEN_WATER_SHORE_FOAM.maxMix)})
    );

    float crestFold = -vGerstnerJ + ${glslFloat(GARDEN_WATER_CREST_FOAM.jacobianBias)};
    float crestFoamMask = smoothstep(
      ${glslFloat(GARDEN_WATER_CREST_FOAM.jacobianStart)},
      ${glslFloat(GARDEN_WATER_CREST_FOAM.jacobianEnd)},
      crestFold
    );
    if (crestFoamMask > 0.001) {
      vec2 crestAdvect = uWindDir * (uTime * 0.11 * (0.55 + uWindSpeed * 0.6));
      float crestNoise = gardenValueNoise((vWaterPosition - crestAdvect) * 0.24 + 31.4);
      crestFoamMask *= smoothstep(
        ${glslFloat(GARDEN_WATER_CREST_FOAM.noiseGate)},
        0.9,
        crestNoise
      );
      waterColor = mix(
        waterColor,
        uHighlightColor,
        clamp(
          crestFoamMask * (0.45 + uSwell * 0.35) * uDetail,
          0.0,
          ${glslFloat(GARDEN_WATER_CREST_FOAM.maxMix)}
        )
      );
    }

    float seaReflectivity = 1.0;

    {
      vec4 regionSample = texture2D(uRegionField, vRegionUv);
      int regionId = int(regionSample.r * 255.0 + 0.5);
      float boundaryDistance = texture2D(uRegionDistance, vRegionUv).r;

      vec3 regionTint = uRegionColor[regionId];
      float regionDepth = uRegionParams[regionId].x;
      float regionFoam = uRegionParams[regionId].y;
      float regionReflect = uRegionParams[regionId].z;
      float regionStrength = uRegionParams[regionId].w;

      seaReflectivity = regionReflect;

      float waterLuma = dot(waterColor, vec3(0.2126, 0.7152, 0.0722));
      float tintLuma = max(dot(regionTint, vec3(0.2126, 0.7152, 0.0722)), 0.03);
      vec3 regionColor = regionTint * clamp(waterLuma * 1.6 / tintLuma, 0.35, 1.15);

      float blend = smoothstep(0.0, 0.84, boundaryDistance);
      waterColor = mix(waterColor, regionColor, regionStrength * blend);
      waterColor *= mix(1.0, regionDepth, blend);

      if (regionId == ${SEA_REGION_ID.danger}) {
        vec2 rainUv = gl_FragCoord.xy * vec2(0.055, 0.018);
        rainUv.x += rainUv.y * (0.55 + uWindDir.x * 0.45);
        rainUv.y += uTime * (0.9 + uStorm * 1.4);
        vec2 rainCell = floor(rainUv);
        vec2 rainLocal = fract(rainUv);
        float rainSeed = gardenHash(rainCell + vec2(17.0, 43.0));
        float rainLine = smoothstep(0.055, 0.0, abs(rainLocal.x - rainSeed));
        float rainDash = smoothstep(0.62, 0.98, fract(rainLocal.y + rainSeed));
        float rain = rainLine * rainDash * blend;
        waterColor = mix(
          waterColor,
          uEnvHorizonColor,
          rain * (0.025 + uStorm * 0.055) * uDetail
        );
      }

      waterColor = mix(
        waterColor,
        mix(uEnvHorizonColor, uEnvZenithColor, 0.35),
        clamp((regionReflect - 1.0) * 0.22, 0.0, 0.3) * blend * uEnvStrength
      );

      float seam = 1.0 - smoothstep(0.0, 0.11, boundaryDistance);
      float seamShadow = 1.0 - smoothstep(0.05, 0.24, boundaryDistance);
      float seamWave = 0.55 + 0.45 * sin(
        dot(vWaterPosition, vec2(0.31, 0.24)) - uTime * 0.35 * (0.6 + uTempo)
      );
      waterColor *= 1.0 - seamShadow * 0.025 * uDetail;
      waterColor = mix(
        waterColor,
        mix(uHighlightColor, waterColor, 0.42),
        seam * seamWave * 0.08 * uDetail
      );

      if (regionFoam > 0.3) {
        vec2 capAdvect = uWindDir * (uTime * 0.06 * (0.5 + uTempo) * (0.6 + uWindSpeed * 0.8));
        vec2 capUv = (vWaterPosition - capAdvect) * 0.85;
        float capNoise = gardenFbm(capUv);
        float capThreshold = mix(0.82, 0.68, clamp(regionFoam, 0.0, 1.0));
        float caps = smoothstep(capThreshold, capThreshold + 0.13, capNoise);
        caps *= 0.35 + smoothstep(0.06, 0.24, (1.0 - vGerstnerJ) * 400.0) * 1.5;
        waterColor = mix(
          waterColor,
          uHighlightColor,
          clamp(caps * regionFoam * blend, 0.0, 0.1) * uDetail
        );
      }
    }

    waterColor = mix(
      waterColor,
      uHighlightColor,
      clamp(wakeFoam * uWakeStrength * (0.2 + uDaylight * 0.08), 0.0, 0.26)
    );

    float nightRoad = clamp(uNight + uDusk * 0.5, 0.0, 1.0);
    if (nightRoad > 0.001) {
      vec2 fromIsland = vWaterPosition - uIslandCenter;
      float roadAlong = dot(fromIsland, uMoonDir);
      float roadAcross = dot(fromIsland, vec2(-uMoonDir.y, uMoonDir.x));
      float roadHalfWidth = 6.0;
      float bandProfile = exp(-(roadAcross * roadAcross) / (roadHalfWidth * roadHalfWidth));
      float roadReach = 1.0 - smoothstep(26.0, 140.0, abs(roadAlong));
      float moonBand = bandProfile * roadReach;
      waterColor = mix(
        waterColor,
        uMoonRoadColor,
        moonBand * nightRoad * ${glslFloat(GARDEN_WATER_NIGHT_EMISSIVE_BUDGET.moonRoadGain)}
      );

      vec3 moonLight = normalize(vec3(uMoonDir * 1.15, 0.5));
      vec3 halfMoon = normalize(moonLight + vec3(0.0, 0.0, 1.0));
      float specular = pow(max(0.0, dot(glintNormal, halfMoon)), 90.0);
      float sparkleField =
        sin(dot(vWaterPosition, vec2(2.3, 3.1)) + blendedNormal.x * 11.0)
        * sin(dot(vWaterPosition, vec2(-3.7, 2.1)) + blendedNormal.y * 9.0);
      float sparkleMask = aaStep(0.35, sparkleField);
      float glitterGate = mix(0.8, 0.68, uSwell);
      float glitter = smoothstep(glitterGate, glitterGate + 0.12, specular)
        * sparkleMask * moonBand * nightRoad;
      waterColor += uMoonRoadColor * clamp(glitter, 0.0, 1.0)
        * ${glslFloat(GARDEN_WATER_NIGHT_EMISSIVE_BUDGET.moonGlitterGain)};
    }

    float dayRoad = clamp(uDaylight + uDusk * 0.85, 0.0, 1.0);
    if (dayRoad > 0.001) {
      float lowSun = 1.0 - smoothstep(0.08, 0.62, uSunHeight);
      vec2 fromIslandSun = vWaterPosition - uIslandCenter;
      float sunAlong = dot(fromIslandSun, uSunDir);
      float sunAcross = dot(fromIslandSun, vec2(-uSunDir.y, uSunDir.x));
      float sunHalfWidth = mix(13.0, 6.5, lowSun);
      float sunProfile = exp(-(sunAcross * sunAcross) / (sunHalfWidth * sunHalfWidth));
      float sunReach = 1.0 - smoothstep(mix(30.0, 55.0, lowSun), mix(85.0, 190.0, lowSun), sunAlong);
      float sunSide = smoothstep(-26.0, 4.0, sunAlong);
      float sunBand = sunProfile * sunReach * sunSide;
      waterColor = mix(waterColor, uSunGlitterColor, sunBand * dayRoad * mix(0.05, 0.13, lowSun));

      float sunSine = max(uSunHeight, 0.08);
      float shadowReach = min(
        GARDEN_TOWER_HEIGHT * sqrt(max(0.0, 1.0 - sunSine * sunSine)) / sunSine,
        GARDEN_TOWER_SHADOW_MAX_REACH
      );
      float shadowAlong = -sunAlong;
      float shadowT = shadowAlong / shadowReach;
      if (shadowT > 0.0 && shadowT < 1.0) {
        float shadowWidth = mix(3.2, 10.0, shadowT);
        float shadowProfile = exp(-(sunAcross * sunAcross) / (shadowWidth * shadowWidth));
        float shadowFade = (1.0 - shadowT) * (1.0 - shadowT);
        float towerShadow = shadowProfile * shadowFade * dayRoad * GARDEN_TOWER_SHADOW_STRENGTH;
        waterColor *= 1.0 - clamp(towerShadow, 0.0, 0.6);
      }
    }

    if (uGlitterStrength > 0.001 && uDaylight + uDusk > 0.001) {
      vec3 sunDirection = normalize(vec3(uSunDir * mix(1.4, 0.55, uSunHeight), 0.35 + uSunHeight));
      vec3 halfSun = normalize(sunDirection + vec3(0.0, 0.0, 1.0));
      float sunSpecular = pow(max(0.0, dot(glintNormal, halfSun)), 120.0);
      float sunSparkleField =
        sin(dot(vWaterPosition, vec2(3.1, -2.4)) + blendedNormal.y * 13.0)
        * sin(dot(vWaterPosition, vec2(-2.2, -3.6)) + blendedNormal.x * 10.0);
      float sunSparkleMask = aaStep(0.76, sunSparkleField);
      float sunGate = mix(0.86, 0.76, uSwell);
      float sunGlitter = smoothstep(sunGate, sunGate + 0.14, sunSpecular)
        * sunSparkleMask
        * (uDaylight + uDusk * 0.4)
        * uGlitterStrength;
      sunGlitter *= clamp(1.0 - cloudCover * uCloudShadowStrength * 2.6, 0.0, 1.0);
      sunGlitter *= 1.0 - smoothstep(170.0, 265.0, camDistance);
      waterColor += uSunGlitterColor * clamp(sunGlitter, 0.0, 1.0) * 1.7;
    }

    if (uRippleStrength > 0.001) {
      float ripple = 0.0;
      for (int ri = 0; ri < ${GARDEN_WATER_MAX_RIPPLE_RINGS}; ri += 1) {
        if (float(ri) >= uRippleCount) break;
        vec4 ring = uRipple[ri];
        vec4 rp = uRippleParams[ri];
        float ringDistance = distance(vWaterPosition, ring.xy);
        if (ringDistance > ring.z + 1.5) continue;
        float innerRadius = ring.z * rp.w;
        for (int rb = 0; rb < 3; rb += 1) {
          if (float(rb) >= rp.x) break;
          float t = fract(uTime / rp.y + ring.w + float(rb) / rp.x);
          float r = mix(innerRadius, ring.z, t);
          float crest = 1.0 - smoothstep(0.0, 0.5 + t * 0.9, abs(ringDistance - r));
          ripple += crest * crest * (1.0 - t) * rp.z;
        }
      }
      ripple = clamp(ripple * uRippleStrength, 0.0, 1.0);
      waterColor = mix(waterColor, uHighlightColor, ripple * (0.1 + uDaylight * 0.06));
    }

    vec2 beamDirection = vec2(cos(uBeaconAngle), sin(uBeaconAngle));
    vec2 fromBeacon = vWaterPosition - uBeaconPosition;
    float beamAlong = dot(fromBeacon, beamDirection);
    float beamAcross = abs(dot(fromBeacon, vec2(-beamDirection.y, beamDirection.x)));
    float beamWidth = 0.34 + max(0.0, beamAlong) * 0.029;
    float beamLane = smoothstep(0.0, 2.0, beamAlong)
      * (1.0 - smoothstep(30.0, 52.0, beamAlong))
      * exp(-(beamAcross * beamAcross) / max(0.04, beamWidth * beamWidth));
    float beamRipple = 0.56 + 0.44 * sin(beamAlong * 0.78 - uTime * 0.8 + tonalCurrent * 0.8);
    float beaconReflection = beamLane
      * (0.05 + smoothstep(0.48, 0.9, beamRipple) * 0.12)
      * uBeaconStrength;
    if (uBeaconStrength > 0.2) {
      float flickerGlow = 0.62 + 0.76 * uBeaconFlicker;
      vec2 streakUv = vec2(
        beamAlong * 0.021 - uTime * 0.017,
        beamAcross * 0.085 + uTime * 0.004
      );
      float streakNoise = texture2D(uCloudShadow, streakUv).r;
      float streaks = 0.55 + 0.45 * smoothstep(0.18, 0.72, streakNoise);
      beaconReflection *= streaks * flickerGlow;

      float rockDist = length(vWaterPosition - uIslandCenter - vec2(0.6, -1.2));
      float causticNoise = texture2D(uCloudShadow,
        vWaterPosition * 0.023 + vec2(uTime * 0.004, -uTime * 0.003)).r;
      float caustic = (1.0 - smoothstep(uRockRadius * 0.45, uRockRadius + 6.5, rockDist))
        * (0.45 + 0.55 * causticNoise);
      waterColor += uBeaconColor
        * caustic
        * uBeaconStrength
        * (0.35 + 0.65 * uBeaconFlicker)
        * 0.16;
    }

    if (uCausticStrength > 0.01) {
      float webDist = length(vWaterPosition - uIslandCenter - vec2(0.6, -1.2));
      float webMask = (1.0 - smoothstep(uRockRadius * 0.55, uRockRadius + 10.0, webDist))
        * smoothstep(uRockRadius * 0.2, uRockRadius * 0.6, webDist);
      if (webMask > 0.001) {
        vec2 cp = (vWaterPosition - uIslandCenter) * 0.9;
        float webA = sin(cp.x * 1.9 + surfaceNormal.x * 6.0 + uTime * 0.45);
        float webB = sin(dot(cp, vec2(-0.7, 1.4)) + surfaceNormal.y * 5.0 - uTime * 0.32);
        float web = pow(abs(webA * webB), 3.0);
        waterColor += uHighlightColor
          * web
          * webMask
          * uCausticStrength
          * (1.0 + wakeFoam * 4.0)
          * (0.05 + uDaylight * 0.06);
      }
    }
    waterColor = mix(waterColor, uBeaconColor, clamp(beaconReflection, 0.0, 0.2));

    {
      vec2 fromTower = vWaterPosition - uBeaconPosition;
      float alongColumn = fromTower.y;
      float acrossColumn = abs(fromTower.x);
      float columnWidth = 1.6 + max(0.0, alongColumn) * 0.10;
      float column = smoothstep(0.0, 1.5, alongColumn)
        * (1.0 - smoothstep(16.0, 44.0, alongColumn))
        * exp(-(acrossColumn * acrossColumn) / max(0.05, columnWidth * columnWidth));
      float bands = 0.45 + 0.55 * smoothstep(
        0.25, 0.85,
        0.5 + 0.5 * sin(alongColumn * 1.35 - uTime * 0.55 + surfaceNormal.x * 5.0)
      );
      float columnLight = clamp(uNight + uDusk * 0.85, 0.0, 1.0);
      waterColor = mix(
        waterColor,
        uBeaconColor,
        clamp(column * bands * columnLight * seaReflectivity * 0.34, 0.0, 0.42)
      );
    }

    if (uRippleStrength > 0.01) {
      float shoreWorld = length(vWaterPosition - uIslandCenter - vec2(0.6, -1.2))
        - uRockRadius;
      float foamRings = aaStep(0.86, sin(shoreWorld * 3.2 - uTime * 0.5))
        * (1.0 - smoothstep(3.0, 4.0, shoreWorld))
        * aaStep(0.0, shoreWorld);
      waterColor = mix(
        waterColor,
        uHighlightColor,
        foamRings * 0.18 * uRippleStrength * (0.6 + uDaylight * 0.4)
      );
    }

    vec2 fieldDelta = vWaterPosition - uLaneField.xy;
    if (dot(fieldDelta, fieldDelta) < uLaneField.z * uLaneField.z) {
      vec2 streakDir = normalize(vec2(0.45, -1.0));
      vec2 streakPerp = vec2(-streakDir.y, streakDir.x);
      float tremble = surfaceNormal.x * (1.2 + uTempo * 1.6);
      vec3 laneAccum = vec3(0.0);
      for (int i = 0; i < ${MAX_GARDEN_LIGHT_LANES}; i += 1) {
        if (float(i) >= uLaneCount) break;
        float u = (float(i) + 0.5) / LANE_TEXELS;
        vec4 head = texture2D(uLaneTexture, vec2(u, 1.0 / 6.0));
        vec2 lanePos = vec2(head.x, -head.y);
        vec2 d = vWaterPosition - lanePos;
        float distSq = dot(d, d);
        if (head.w > 2.5) {
          vec4 routeRow = texture2D(uLaneTexture, vec2(u, 5.0 / 6.0));
          vec2 span = vec2(routeRow.x, -routeRow.y) - lanePos;
          float spanLength = max(length(span), 0.001);
          vec2 spanDir = span / spanLength;
          float routeAlong = dot(d, spanDir) / spanLength;
          float routeAcross = abs(d.x * -spanDir.y + d.y * spanDir.x);
          if (routeAlong < -0.1 || routeAlong > 1.1 || routeAcross > 8.0) continue;
          float laneV = clamp(routeAlong, 0.0, 1.0);
          float width = 0.9 * (1.0 + uStorm * 0.9);
          float ribbon = exp(-(routeAcross * routeAcross) / (width * width))
            * smoothstep(0.0, 0.06, laneV)
            * (1.0 - smoothstep(0.94, 1.0, laneV));
          float train = sin((laneV * 4.0 - uPulseTime * routeRow.z + routeRow.w) * 6.2831853);
          float pulse = pow(max(0.0, 0.5 + 0.5 * train), 3.0);
          vec4 routeBody = texture2D(uLaneTexture, vec2(u, 0.5));
          laneAccum += routeBody.rgb * head.z * ribbon * pulse * (1.0 - uStorm * 0.45) * 0.85;
          continue;
        }
        if (distSq > 900.0) continue;
        vec4 body = texture2D(uLaneTexture, vec2(u, 0.5));
        float intensity = head.z;
        float pool = exp(-distSq / 24.0);
        float along = dot(d, streakDir) + tremble;
        float across = dot(d, streakPerp) + tremble * 0.4;
        float streak = exp(-(across * across) / 3.0)
          * exp(-max(0.0, along) * max(0.0, along) / 120.0)
          * aaStep(-2.0, along);
        laneAccum += body.rgb * intensity * (pool * 0.55 + streak * 0.4);
      }
      waterColor += clamp(
        laneAccum,
        0.0,
        ${glslFloat(GARDEN_WATER_NIGHT_EMISSIVE_BUDGET.laneClamp)}
      );
    }

    float distanceFade = smoothstep(150.0, 520.0, camDistance);
    waterColor = mix(waterColor, uBaseColor, distanceFade * (0.08 + uDusk * 0.05 + uNight * 0.04));

    gl_FragColor = vec4(waterColor, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>

    gl_FragColor.rgb = gardenApplyHeightFog(
      gl_FragColor.rgb,
      vWorldPosition,
      vFogDepth,
      normalize(vWorldPosition - cameraPosition)
    );

    vec4 epistemicRegionSample = texture2D(uRegionField, vRegionUv);
    float epistemicRegionId = floor(epistemicRegionSample.r * 255.0 + 0.5);
    float riskWater = step(${SEA_REGION_ID.calm - 0.5}, epistemicRegionId)
      * (1.0 - step(${SEA_REGION_ID.danger + 0.5}, epistemicRegionId));
    float epistemicMist = 0.72 + gardenFbm(
      vWaterPosition * 0.045 + uWindDir * uTime * 0.006
    ) * 0.28;
    gl_FragColor.rgb = gardenApplyLocalizedHeightFog(
      gl_FragColor.rgb,
      vWorldPosition,
      vFogDepth,
      normalize(vWorldPosition - cameraPosition),
      uPegSummaryEpistemicHaze * riskWater * epistemicMist
    );

    gl_FragColor.rgb *= gardenBokashiShade(vFogDepth, fogNear, uDaylight, uDusk, uNight);
  }
`;

export interface GardenWaterFrame {
  reducedMotion: boolean;
  renderScheduler: Pick<PharosVilleRenderSchedulerState, "tier" | "loadTier">;
  seaState: Pick<SeaState, "swell" | "tempo">;
  timeSeconds: number;
  wallClockHour: number;
}

export interface GardenWater {
  material: ShaderMaterial;
  mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  /** Releases the water mesh and every texture this subsystem owns. */
  dispose: () => void;
  /** C2(c): shared cloud-shadow sampler for Lane I (island) and Lane S (ships). */
  cloudShadows: GardenCloudShadowSource;
  /**
   * The baked sea-region field textures (S5), exposed so the renderer can
   * `initTexture` them at scene build instead of paying the upload on the
   * first visible frame.
   */
  regionTextures: { distance: DataTexture; field: DataTexture };
  /** C2(d): karesansui ripple-ring emitter registry (Lanes I/S/Z). */
  rippleRings: GardenRippleRingEmitter;
  /** C4 evidence: whether cloud shadows are shading this frame's tier. */
  cloudShadowsOn: () => boolean;
  /** Current displayed wake mix, used to defer wake-target clearing until invisible. */
  wakeStrength: () => number;
  setBeaconState: (
    worldX: number,
    worldZ: number,
    angle: number,
    strength: number,
    flicker?: number,
  ) => void;
  /** C2(b): harbor mirror-basin extents (Lane I); a sensible default is active until this is called. */
  setHarborCalmMask: (mask: GardenHarborCalmMask) => void;
  setIslandCenter: (worldX: number, worldZ: number) => void;
  setIsletCenters: (
    cemetery: { x: number; z: number },
    pigeonnier: { x: number; z: number },
  ) => void;
  setLaneState: (
    texture: DataTexture,
    activeLaneCount: number,
    fieldBounds?: { centerX: number; centerZ: number; radius: number },
  ) => void;
  /** W7.4: reuses this material's height-fog term over DEWS risk regions. */
  setPegSummaryEpistemicHaze: (active: boolean) => void;
  /** C2(a): zone soft-tint path; Lane Z supplies positions/radii/colors. */
  setZoneState: (zones: readonly GardenWaterZoneTint[]) => void;
  /**
   * Phase 3 (item 2): binds the wake field's front texture and window each
   * frame. Water space (x = worldX, y = −worldZ), halfSize in world units.
   */
  setWakeState: (
    texture: Texture | null,
    centerX: number,
    centerY: number,
    halfSize: number,
  ) => void;
  update: (frame: GardenWaterFrame, weather?: WeatherPlan) => void;
}

/** Back-compatible alias for the C2 zone-tint shape. */
export type GardenWaterZone = GardenWaterZoneTint;

/**
 * One finite water surface — the Garden Sea plate. Banded depth color, sky env
 * tint, sun glitter, drifting cloud shadows, and karesansui ripple rings by
 * day; the authored moon road and the shared light-lane registry keep the
 * Lantern Sea identity at night. W6 (Pharos Wonder): the beacon lane breathes
 * with the flame flicker and breaks into scrolled-noise firelight streaks, a
 * warm caustic glow laps the island rock, and hard-stepped foam rings expand
 * through the near-shore band — all on the analytic shore SDF, no depth pass.
 * Reduced motion resets every animation to one static time-zero frame;
 * cloud shadows and glitter ship at balanced+ and ripple rings at full/balanced.
 */
export function createGardenWater(waterLevel: number): GardenWater {
  const baseColor = DAY_MID.clone();
  const deepColor = DAY_DEEP.clone();
  const highlightColor = DAY_HIGHLIGHT.clone();
  const shallowColor = DAY_SHALLOW.clone();
  const bandColors = [DAY_SHALLOW.clone(), DAY_MID.clone(), DAY_MID.clone(), DAY_DEEP.clone()];
  const envHorizonColor = DAY_ENV_HORIZON.clone();
  const envZenithColor = DAY_ENV_ZENITH.clone();
  const sunGlitterColor = DAY_CYCLE_LIGHT_PRESETS.day.dirColor.clone();
  const cloudShadows = createGardenCloudShadowSource();
  const regionField = createSeaRegionTextures();
  const normalMap = loadNormalMap();
  // Region character is static data (D6) — colour is resolved per day phase in
  // `update`, but swell/chop/foam/reflectivity never change.
  // Seeded from the fallback table so every slot has a real colour even
  // before (or without) a live theme write — an unset slot renders black.
  const regionColors = SEA_REGION_ORDER.map((name) => new Color(SEA_REGION_FALLBACK_TINT[name]));
  const regionParams = SEA_REGION_ORDER.map((name) => {
    const character = SEA_REGION_CHARACTER[name];
    return new Vector4(
      character.depth,
      character.foam,
      character.reflectivity,
      name === "none" || name === "open" ? 0 : REGION_TINT_STRENGTH,
    );
  });
  const regionSwell = SEA_REGION_ORDER.map((name) => {
    const character = SEA_REGION_CHARACTER[name];
    return new Vector4(character.swell, character.chop, 0, 0);
  });
  // Maps world XY on the water plane into the field's 0-1 UV space.
  //
  // A tile (tx, ty) sits at world (tx*TILE_SCALE, _, ty*TILE_SCALE), and the
  // plane's -90deg X rotation maps world +Z to local -Y — so the V scale is
  // NEGATIVE. Getting this sign wrong mirrors every region about the equator.
  const regionExtent = regionField.tileSpan * TILE_SCALE_UNITS;
  const regionTransform = new Vector4(0, 0, 1 / regionExtent, -1 / regionExtent);
  const uniforms = {
    ...gardenHeightFogUniforms,
    fogColor: { value: new Color() },
    fogFar: { value: 1_000 },
    fogNear: { value: 1 },
    uBandColor: { value: bandColors },
    uBaseColor: { value: baseColor },
    uBeaconAngle: { value: -0.55 },
    uBeaconColor: { value: BEACON_HIGHLIGHT.clone() },
    uBeaconFlicker: { value: 0.5 },
    uBeaconPosition: { value: new Vector2() },
    uBeaconStrength: { value: 0 },
    uCausticStrength: { value: 0 },
    uCemeteryCenter: { value: new Vector2(1e4, 1e4) },
    // C2(c): the water material shares the exact uniform objects the cloud
    // source exposes, so land/ship consumers stay in sync by construction.
    uCloudShadow: cloudShadows.uniforms.uCloudShadow,
    uCloudShadowStrength: cloudShadows.uniforms.uCloudShadowStrength,
    uCloudShadowTransform: cloudShadows.uniforms.uCloudShadowTransform,
    uDaylight: { value: 1 },
    uDeepColor: { value: deepColor },
    uDetail: { value: 1 },
    uDusk: { value: 0 },
    uEnvHorizonColor: { value: envHorizonColor },
    uEnvStrength: { value: 0.3 },
    uEnvZenithColor: { value: envZenithColor },
    uEnvironmentIntensity: { value: 0 },
    envMap: { value: null as Texture | null },
    uGlitterStrength: { value: 1 },
    uHarborCalm: { value: 0.7 },
    uHarborEllipse: { value: new Vector4(0, 0, 1 / 13, 1 / 9) },
    uHighlightColor: { value: highlightColor },
    uIslandCenter: { value: new Vector2() },
    uLaneCount: { value: 0 },
    // Phase 4: the pulse-lane clock. Advances only at full/balanced with
    // motion allowed, freezes at lower tiers, and resets to canonical zero
    // under reduced motion.
    uPulseTime: { value: 0 },
    // Bounding circle (water coords: x, -z, radius) of the active light lanes;
    // a huge default keeps the loop unconditional until the registry supplies
    // real bounds.
    uLaneField: { value: new Vector3(0, 0, 1e5) },
    uLaneTexture: { value: null as DataTexture | null },
    uMoonDir: { value: MOON_DIR.clone() },
    // The sun's own bearing on the water, from the shared arc in garden-sun.
    // Before this the water's only notion of the sun was a hand-tuned constant
    // (`normalize(vec3(-0.46, 0.2, 0.86))`) that matched neither the key light
    // nor the sky dome — so the daytime sparkle sat wherever that constant
    // pointed while the shadows fell somewhere else entirely.
    uSunDir: { value: new Vector2(1, 0) },
    /** 0 at the horizon, 1 overhead — shapes the road from a pool to a path. */
    uSunHeight: { value: 0 },
    uMoonRoadColor: { value: MOON_ROAD_COLOR.clone() },
    uNight: { value: 0 },
    uNormalMap: { value: normalMap },
    uPigeonnierCenter: { value: new Vector2(1e4, 1e4) },
    uRipple: {
      value: Array.from({ length: GARDEN_WATER_MAX_RIPPLE_RINGS }, () => new Vector4()),
    },
    uRippleCount: { value: 0 },
    uRippleParams: {
      value: Array.from({ length: GARDEN_WATER_MAX_RIPPLE_RINGS }, () => new Vector4()),
    },
    uRippleStrength: { value: 1 },
    // W6: approximate rock radius of the island's waterline (world units) for
    // the analytic shore SDF behind the caustic glow and foam rings; anchored
    // by setIslandCenter from the island root position.
    uRockRadius: { value: GARDEN_ISLAND_ROCK_RADIUS },
    uShallowColor: { value: shallowColor },
    uSunGlitterColor: { value: sunGlitterColor },
    uSwell: { value: 0 },
    uTempo: { value: 0.2 },
    uTime: { value: 0 },
    uWaveAmplitude: { value: 0.02 },
    uWaterLevel: { value: waterLevel },
    // Phase 3 (item 2): the persistent wake field. Strength eases per tier
    // (S2); the window follows the camera target via setWakeState.
    uWakeStrength: { value: 0 },
    uWakeMap: { value: null as Texture | null },
    uWakeCenter: { value: new Vector2(1e5, 1e5) },
    uWakeInvSize: { value: 1 / 192 },
    uWakeTexel: { value: 1 / 512 },
    // Phase 2 weather: wind bearing in water-local coords (world +Z maps to
    // local -Y), sustained strength, and the storm state. Defaults reproduce
    // the pre-weather sea when no plan is supplied.
    uWindDir: { value: new Vector2(GARDEN_DEFAULT_WIND_X, -GARDEN_DEFAULT_WIND_Z) },
    uWindSpeed: { value: 0 },
    uBreath: { value: 0.5 },
    uStorm: { value: 0 },
    // W2 / D5: the sea-region field replaces the six tinted ellipses. One
    // texture, sampled in both stages, carrying the SAME terrain
    // classification the simulation obeys.
    uPegSummaryEpistemicHaze: { value: 0 },
    uRegionField: { value: regionField.field },
    uRegionDistance: { value: regionField.distance },
    uRegionColor: { value: regionColors },
    uRegionParams: { value: regionParams },
    uRegionSwell: { value: regionSwell },
    uRegionTransform: { value: regionTransform },
  };
  const material = new ShaderMaterial({
    fog: true,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    vertexShader: VERTEX_SHADER,
  });
  const mapSpan = (regionField.tileSpan - 1) * TILE_SCALE_UNITS;
  const plateMargin = GARDEN_WATER_PLATE_MARGIN_TILES * TILE_SCALE_UNITS;
  const plateSize = mapSpan + plateMargin * 2;
  const geometry = new PlaneGeometry(plateSize, plateSize, WATER_SEGMENTS, WATER_SEGMENTS);
  // Keep water-local XY equal to world X,-Z: every wake, calm mask, light lane
  // and region lookup already shares that coordinate contract. Translating
  // vertices (instead of the mesh) centres the finite plate without changing
  // any of those semantics.
  geometry.translate(mapSpan * 0.5, -mapSpan * 0.5, 0);
  const mesh = new Mesh(geometry, material);
  mesh.name = "garden-water";
  mesh.position.y = waterLevel;
  mesh.rotation.x = -Math.PI / 2;
  // Raw ShaderMaterial does not opt into scene.environment, but Three's
  // program builder will provide its CubeUV defines/chunk when `envMap` is set
  // on the material. Bind immediately before the draw: this follows every
  // cached PMREM swap without a world-renderer wire or a second texture owner.
  type EnvironmentShaderMaterial = ShaderMaterial & { envMap: Texture | null };
  const environmentMaterial = material as EnvironmentShaderMaterial;
  environmentMaterial.envMap = null;
  mesh.onBeforeRender = (_renderer, renderScene) => {
    const nextEnvironment = renderScene.environment;
    if (environmentMaterial.envMap !== nextEnvironment) {
      environmentMaterial.envMap = nextEnvironment;
      uniforms.envMap.value = nextEnvironment;
      // The first probe changes the shader from scalar fallback to CubeUV.
      // Later swaps keep the same mapping/atlas shape and reuse the program.
      material.needsUpdate = true;
    }
    uniforms.uEnvironmentIntensity.value = nextEnvironment
      ? renderScene.environmentIntensity
      : 0;
  };

  // Karesansui ripple-ring emitters (C2(d)). The island and the outlying
  // islets self-register when their centers arrive; other lanes register dock
  // pylons, moored ships, and garden islets through the same API.
  const rippleEmitters = new Map<string, {
    bands: 2 | 3;
    centerX: number;
    centerY: number;
    innerFraction: number;
    periodSeconds: number;
    phase: number;
    radius: number;
    strength: number;
  }>();
  const syncRippleUniforms = () => {
    let index = 0;
    for (const emitter of rippleEmitters.values()) {
      if (index >= GARDEN_WATER_MAX_RIPPLE_RINGS) break;
      uniforms.uRipple.value[index]!.set(
        emitter.centerX,
        emitter.centerY,
        emitter.radius,
        emitter.phase,
      );
      uniforms.uRippleParams.value[index]!.set(
        emitter.bands,
        emitter.periodSeconds,
        emitter.strength,
        emitter.innerFraction,
      );
      index += 1;
    }
    uniforms.uRippleCount.value = index;
  };
  const rippleRings: GardenRippleRingEmitter = {
    setRing(ring) {
      const previous = rippleEmitters.get(ring.id);
      rippleEmitters.set(ring.id, {
        bands: ring.bands,
        centerX: ring.center.x,
        centerY: -ring.center.z,
        innerFraction: previous?.innerFraction ?? 0.5,
        periodSeconds: Math.max(0.001, ring.periodSeconds),
        phase: previous?.phase ?? stablePhase(ring.id),
        radius: Math.max(0.001, ring.radius),
        strength: MathUtils.clamp(ring.strength, 0, 1),
      });
      syncRippleUniforms();
    },
    removeRing(id) {
      if (rippleEmitters.delete(id)) syncRippleUniforms();
    },
    ringCount() {
      return rippleEmitters.size;
    },
  };
  // Internal default emitters use a richer inner-radius so the ring train
  // starts outside the lapping shore foam; lanes overriding by id keep it.
  const setDefaultRing = (
    id: string,
    center: { x: number; z: number },
    radius: number,
    bands: 2 | 3,
    periodSeconds: number,
    strength: number,
    innerFraction: number,
  ) => {
    const previous = rippleEmitters.get(id);
    rippleEmitters.set(id, {
      bands,
      centerX: center.x,
      centerY: -center.z,
      innerFraction,
      periodSeconds,
      phase: previous?.phase ?? stablePhase(id),
      radius,
      strength,
    });
    syncRippleUniforms();
  };

  let harborMaskOverridden = false;
  let cloudShadowsActive = true;
  // S2: previous frame's clock, for the tier-uniform easing in `update`.
  let lastFrameSeconds: number | null = null;
  // Phase 4: the route-pulse clock. Accumulates (clamped deltas, like the
  // tier easing above) only while pulses should animate. Lower tiers hold;
  // reduced motion resets to the same time-zero state as a fresh load.
  let pulseTimeSeconds = 0;
  let disposed = false;

  return {
    material,
    mesh,
    cloudShadows,
    regionTextures: { distance: regionField.distance, field: regionField.field },
    rippleRings,
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
      regionField.field.dispose();
      regionField.distance.dispose();
      cloudShadows.texture.dispose();
      normalMap?.dispose();
      // External lane/wake textures keep their own lifecycle; only release
      // this material's references to them.
      uniforms.uLaneTexture.value = null;
      uniforms.uWakeMap.value = null;
      uniforms.uNormalMap.value = null;
      uniforms.envMap.value = null;
      environmentMaterial.envMap = null;
      rippleEmitters.clear();
    },
    cloudShadowsOn() {
      return cloudShadowsActive;
    },
    wakeStrength() {
      return uniforms.uWakeStrength.value;
    },
    setBeaconState(worldX, worldZ, angle, strength, flicker = 0.5) {
      uniforms.uBeaconPosition.value.set(worldX, -worldZ);
      uniforms.uBeaconAngle.value = angle;
      uniforms.uBeaconStrength.value = MathUtils.clamp(strength, 0, 1);
      uniforms.uBeaconFlicker.value = MathUtils.clamp(flicker, 0, 1);
    },
    setHarborCalmMask(mask) {
      harborMaskOverridden = true;
      uniforms.uHarborEllipse.value.set(
        mask.center.x,
        -mask.center.z,
        1 / Math.max(0.001, mask.radiusX),
        1 / Math.max(0.001, mask.radiusZ),
      );
      uniforms.uHarborCalm.value = MathUtils.clamp(mask.calmStrength, 0, 1);
    },
    setIslandCenter(worldX, worldZ) {
      // The plane's -90 degree X rotation maps local Y to negative world Z.
      uniforms.uIslandCenter.value.set(worldX, -worldZ);
      // W6: the rock radius rides along with the island anchor so the caustic
      // glow and foam-ring SDF stay glued to the rock if the island moves.
      uniforms.uRockRadius.value = GARDEN_ISLAND_ROCK_RADIUS;
      // I2 default mirror basin: a feathered ellipse off the island's harbor
      // side until Lane I supplies the real harbor SDF extents.
      if (!harborMaskOverridden) {
        uniforms.uHarborEllipse.value.set(worldX + 18, -worldZ - 14, 1 / 13, 1 / 9);
      }
      // Default karesansui train: inner band starts outside the V2 lapping
      // foam (~1.34 SDF units ≈ 25 world units on the long axis).
      // L6: radius 40 -> 22. At 40 with an inner fraction of 0.65 this was a
      // 28-tile-diameter disc of pale expanding rings — 40% of the map's width —
      // and at overview framing it read as a spotlight trained on the island
      // rather than as water moving around it.
      setDefaultRing("garden.island", { x: worldX, z: worldZ }, 22, 3, 16, 0.42, 0.55);
    },
    setIsletCenters(cemetery, pigeonnier) {
      uniforms.uCemeteryCenter.value.set(cemetery.x, -cemetery.z);
      uniforms.uPigeonnierCenter.value.set(pigeonnier.x, -pigeonnier.z);
      setDefaultRing("garden.islet.cemetery", cemetery, 12, 2, 11, 0.45, 0.5);
      setDefaultRing("garden.islet.pigeonnier", pigeonnier, 10, 2, 9, 0.45, 0.5);
    },
    setLaneState(texture, activeLaneCount, fieldBounds) {
      uniforms.uLaneTexture.value = texture;
      uniforms.uLaneCount.value = activeLaneCount;
      if (fieldBounds) {
        // The plane's -90 degree X rotation maps world Z to negative water Y.
        uniforms.uLaneField.value.set(
          fieldBounds.centerX,
          -fieldBounds.centerZ,
          Math.max(0, fieldBounds.radius),
        );
      }
    },
    setPegSummaryEpistemicHaze(active) {
      uniforms.uPegSummaryEpistemicHaze.value = active ? 1 : 0;
    },
    setZoneState(zones) {
      // W2 / D5: zone TINTS are no longer painted as ellipses — the region
      // field carries the geometry. What still arrives here is each band's
      // live colour, which is routed to its region slot so day/dusk/night
      // colour blending and the theme bridge keep working unchanged.
      for (const zone of zones) {
        const slot = zone.regionId;
        if (slot === undefined || slot <= 0 || slot >= SEA_REGION_COUNT) continue;
        regionColors[slot]!.copy(zone.color);
        uniforms.uRegionParams.value[slot]!.w = zone.strength;
      }
    },
    setWakeState(texture, centerX, centerY, halfSize) {
      uniforms.uWakeMap.value = texture;
      uniforms.uWakeCenter.value.set(centerX, centerY);
      uniforms.uWakeInvSize.value = 1 / (2 * Math.max(1, halfSize));
    },
    update(frame, weather) {
      // C1: the water consumes the shared day-cycle curve and blend law; no
      // local copy of the phase curve lives in this module anymore.
      const { daylight, dusk, night } = dayCyclePhase(frame.wallClockHour);
      // One arc, three consumers: the key light, the sky dome, and here.
      gardenSunPose(frame.wallClockHour, scratchSunPose);
      const sunFlat = Math.hypot(scratchSunPose.direction.x, scratchSunPose.direction.z);
      if (sunFlat > 1e-5) {
        // World XZ maps onto the water shader's 2D position the same way the
        // moon's does, so the two roads share a frame of reference.
        uniforms.uSunDir.value.set(
          scratchSunPose.direction.x / sunFlat,
          -scratchSunPose.direction.z / sunFlat,
        );
      }
      uniforms.uSunHeight.value = Math.max(0, scratchSunPose.direction.y);
      blendDayCycleColor(shallowColor, NIGHT_SHALLOW, DUSK_SHALLOW, DAY_SHALLOW, dusk, daylight);
      blendDayCycleColor(baseColor, NIGHT_MID, DUSK_MID, DAY_MID, dusk, daylight);
      blendDayCycleColor(deepColor, NIGHT_DEEP, DUSK_DEEP, DAY_DEEP, dusk, daylight);
      blendDayCycleColor(highlightColor, NIGHT_HIGHLIGHT, DUSK_HIGHLIGHT, DAY_HIGHLIGHT, dusk, daylight);
      // W1: the shallow→deep ramp is HSV-lerped into four posterized stops.
      bandColors[0]!.copy(shallowColor);
      hslLerpColor(bandColors[1]!, shallowColor, baseColor, 0.55);
      hslLerpColor(bandColors[2]!, baseColor, deepColor, 0.5);
      bandColors[3]!.copy(deepColor);
      // W2/W6: sky env tint follows the bokashi sky presets and becomes
      // moonlight at night; the sun glitter tint follows the light rig.
      blendDayCycleColor(envHorizonColor, NIGHT_ENV_HORIZON, DUSK_ENV_HORIZON, DAY_ENV_HORIZON, dusk, daylight);
      blendDayCycleColor(envZenithColor, NIGHT_ENV_ZENITH, DUSK_ENV_ZENITH, DAY_ENV_ZENITH, dusk, daylight);
      blendDayCycleColor(
        sunGlitterColor,
        DAY_CYCLE_LIGHT_PRESETS.night.dirColor,
        DAY_CYCLE_LIGHT_PRESETS.dusk.dirColor,
        DAY_CYCLE_LIGHT_PRESETS.day.dirColor,
        dusk,
        daylight,
      );
      // Day keeps the env sheen subtle (0.11): at 0.18 the pale horizon tint
      // washed the banded ramp across the whole frame, not just the far band.
      uniforms.uEnvStrength.value = blendPhaseScalar(0.08, 0.13, 0.11, dusk, daylight);

      // S1: `interaction` is a camera-movement signal, not a load tier — the
      // sea reads it as `balanced` so moving the camera no longer strips the
      // water's character. See `seaQualityTier`.
      const tier = seaQualityTier(frame.renderScheduler);
      const balancedOrBetter = tier === "full" || tier === "balanced";
      // Guardrails: sun glitter and cloud shadows ship at balanced+; ripple
      // rings at full/balanced. Lower tiers keep the graceful fallbacks.
      cloudShadows.update({
        reducedMotion: frame.reducedMotion,
        tier,
        timeSeconds: frame.timeSeconds,
        ...(weather ? { wind: weather } : {}),
      });
      cloudShadowsActive = balancedOrBetter;

      // S2: ease the tier-driven uniforms instead of stepping them.
      //
      // Even with `interaction` neutralised, a load-tier change (balanced ->
      // recovery on a weaker machine, where the ladder's downshift streak is
      // only 2 frames) still swings uDetail 1 -> 0.36 and switches glitter and
      // cloud shadows off. Stepping that is a visible flash; the hysteresis
      // ladder suppresses flapping but cannot make a single crossing invisible.
      // A ~300 ms approach can, and it costs three scalars.
      //
      // Reduced motion must NOT ease: that path renders one static frame and
      // the invariant is that it is a COMPLETE composition, so it snaps to the
      // target and any part-way value would be an accidental pause.
      const targetDetail = detailForTier(tier);
      const targetGlitter = balancedOrBetter ? 1 : 0;
      const targetRipple = balancedOrBetter ? 1 : 0;
      // Phase 3: the wake field ships at balanced+ (the painted ripple rings
      // carry the cue below); the caustic web is a full-tier accent. Both ease
      // on the same S2 curve so a tier crossing fades rather than pops.
      const targetWake = balancedOrBetter ? 1 : 0;
      const targetCaustic = tier === "full" ? 1 : 0;
      const targetCloud = cloudShadowsActive
        ? blendPhaseScalar(0.12, 0.2, 0.34, dusk, daylight)
        : 0;
      const now = Math.max(0, frame.timeSeconds);
      // Clamped so a tab returning from background does not ease across a
      // multi-second gap, and so the first frame (no previous sample) snaps.
      const deltaSeconds = lastFrameSeconds === null
        ? Number.POSITIVE_INFINITY
        : MathUtils.clamp(now - lastFrameSeconds, 0, 0.25);
      lastFrameSeconds = now;
      const ease = frame.reducedMotion ? 1 : easeFactor(deltaSeconds);

      if (frame.reducedMotion) {
        pulseTimeSeconds = 0;
      } else if (balancedOrBetter) {
        pulseTimeSeconds += Math.min(deltaSeconds, 0.25);
      }
      uniforms.uPulseTime.value = pulseTimeSeconds;

      uniforms.uDetail.value += (targetDetail - uniforms.uDetail.value) * ease;
      uniforms.uGlitterStrength.value
        += (targetGlitter - uniforms.uGlitterStrength.value) * ease;
      uniforms.uRippleStrength.value
        += (targetRipple - uniforms.uRippleStrength.value) * ease;
      uniforms.uWakeStrength.value
        += (targetWake - uniforms.uWakeStrength.value) * ease;
      uniforms.uCausticStrength.value
        += (targetCaustic - uniforms.uCausticStrength.value) * ease;
      const cloudStrength = cloudShadows.uniforms.uCloudShadowStrength;
      cloudStrength.value += (targetCloud - cloudStrength.value) * ease;

      uniforms.uDaylight.value = daylight;
      uniforms.uDusk.value = dusk;
      uniforms.uNight.value = night;
      uniforms.uSwell.value = MathUtils.clamp(frame.seaState.swell, 0, 1);
      uniforms.uTempo.value = MathUtils.clamp(frame.seaState.tempo, 0, 1);
      uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      // Phase 2 weather: the wind bearing rotates the swell field (world XZ →
      // water-local XY, where +Z world is -Y local), the sustained wind
      // steepens the chop, and the storm raises amplitude — capped at the
      // displacement budget that keeps the crests below the zone-root plane.
      const stormLevel = MathUtils.clamp(weather?.stormLevel ?? 0, 0, 1);
      uniforms.uWindDir.value.set(
        weather?.windDirX ?? GARDEN_DEFAULT_WIND_X,
        -(weather?.windDirZ ?? GARDEN_DEFAULT_WIND_Z),
      );
      uniforms.uWindSpeed.value = MathUtils.clamp(weather?.windSpeed ?? 0, 0, 1);
      uniforms.uBreath.value = gardenBreathAt(
        frame.reducedMotion ? 0 : frame.timeSeconds,
        GARDEN_BREATH_PHASE.water,
      );
      uniforms.uStorm.value = stormLevel;
      // W2.1: one allocation-free update drives the shared term on water,
      // fleet, hero hulls, island and docks. The sun direction is resolved by
      // garden-sun's contract-owned arc inside the shared updater.
      updateGardenHeightFog({
        hour: frame.wallClockHour,
        phase: { daylight, dusk, night },
        seaLevel: waterLevel,
        stormLevel,
      });
      uniforms.uWaveAmplitude.value = Math.min(
        GARDEN_WATER_MAX_DISPLACEMENT,
        0.022
          + MathUtils.clamp(frame.seaState.swell, 0, 1) * 0.014
          + stormLevel * 0.016,
      );
    },
  };
}

/**
 * C2(c) cloud-shadow source: a procedural, tileable two-octave value-noise
 * DataTexture scrolled in world-XZ. The water material samples it directly;
 * Lane I/S materials receive the same texture and uniform objects so the same
 * cloud lightens and darkens the whole garden at once.
 */
function createGardenCloudShadowSource(): GardenCloudShadowSource {
  const texture = createCloudNoiseTexture(256);
  const transform: [number, number, number, number] = [
    CLOUD_SHADOW_TEXEL_SCALE,
    CLOUD_SHADOW_TEXEL_SCALE,
    0,
    0,
  ];
  const uniforms: GardenCloudShadowSource["uniforms"] = {
    uCloudShadow: { value: texture },
    uCloudShadowTransform: { value: transform },
    uCloudShadowStrength: { value: 0.34 },
  };
  // Phase 2: the drift integrates the weather system's wind instead of walking
  // a fixed diagonal. The offsets accumulate with the same clamped-delta
  // pattern as the beam sweep (world-renderer), so a backgrounded tab cannot
  // jump the sky; reduced motion freezes them exactly where they are. At the
  // default bearing and strength this reproduces the historical drift.
  let lastSeconds: number | null = null;
  let offsetX = 0;
  let offsetZ = 0;
  return {
    texture,
    uniforms,
    update({ reducedMotion, tier, timeSeconds, wind }) {
      // Reduced motion is one canonical time-zero composition, regardless of
      // whether the preference was active at mount or entered after animation.
      if (reducedMotion) {
        lastSeconds = null;
        offsetX = 0;
        offsetZ = 0;
        transform[2] = 0;
        transform[3] = 0;
        return;
      }
      if (tier !== "full" && tier !== "balanced") return;
      const now = Math.max(0, timeSeconds);
      const deltaSeconds = lastSeconds === null
        ? Math.min(now, 0.25)
        : MathUtils.clamp(now - lastSeconds, 0, 0.25);
      lastSeconds = now;
      const dirX = wind?.windDirX ?? GARDEN_DEFAULT_WIND_X;
      const dirZ = wind?.windDirZ ?? GARDEN_DEFAULT_WIND_Z;
      // World-units-per-second advection: a light breeze holds the historical
      // ~0.18 u/s; a full storm drives the scud at ~4x that.
      const speed = 0.06 + (wind?.windSpeed ?? 0.4) * 0.3 + (wind?.stormLevel ?? 0) * 0.22;
      offsetX -= dirX * speed * CLOUD_SHADOW_TEXEL_SCALE * deltaSeconds;
      offsetZ -= dirZ * speed * CLOUD_SHADOW_TEXEL_SCALE * deltaSeconds;
      transform[2] = offsetX;
      transform[3] = offsetZ;
    },
  };
}

function createCloudNoiseTexture(size: number): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Tileable value noise: lattice frequencies divide the texture size.
      const fbm = valueNoise(x, y, size, 4) * 0.55
        + valueNoise(x, y, size, 8) * 0.3
        + valueNoise(x, y, size, 16) * 0.15;
      // Shape into soft cloud blobs with open sky between them.
      const cover = MathUtils.clamp((fbm - 0.42) / 0.34, 0, 1);
      const value = Math.round(cover * cover * (3 - 2 * cover) * 255);
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function valueNoise(x: number, y: number, size: number, cells: number): number {
  const scale = cells / size;
  const gx = x * scale;
  const gy = y * scale;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number) => ((v % cells) + cells) % cells;
  const a = latticeHash(wrap(ix), wrap(iy), cells);
  const b = latticeHash(wrap(ix + 1), wrap(iy), cells);
  const c = latticeHash(wrap(ix), wrap(iy + 1), cells);
  const d = latticeHash(wrap(ix + 1), wrap(iy + 1), cells);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function latticeHash(ix: number, iy: number, seed: number): number {
  let hash = (ix * 374761393 + iy * 668265263 + seed * 2246822519) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function stablePhase(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

const scratchHslA = { h: 0, s: 0, l: 0 };
const scratchHslB = { h: 0, s: 0, l: 0 };

/** Shortest-path HSL lerp so the band ramp travels hue smoothly (turquoise→blue→indigo). */
function hslLerpColor(target: Color, from: Color, to: Color, t: number): void {
  from.getHSL(scratchHslA);
  to.getHSL(scratchHslB);
  let hueDelta = scratchHslB.h - scratchHslA.h;
  if (hueDelta > 0.5) hueDelta -= 1;
  if (hueDelta < -0.5) hueDelta += 1;
  target.setHSL(
    (scratchHslA.h + hueDelta * t + 1) % 1,
    scratchHslA.s + (scratchHslB.s - scratchHslA.s) * t,
    scratchHslA.l + (scratchHslB.l - scratchHslA.l) * t,
  );
}

function blendPhaseScalar(
  night: number,
  dusk: number,
  day: number,
  duskMix: number,
  daylightMix: number,
): number {
  const duskValue = night + (dusk - night) * duskMix;
  return duskValue + (day - duskValue) * daylightMix;
}

function loadNormalMap(): Texture | null {
  // The renderer only mounts behind the desktop gate; unit tests run in a
  // DOM-less environment where no image can load, so skip it there.
  if (typeof document === "undefined") return null;
  const texture = new TextureLoader().load(NORMAL_MAP_URL);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * S2: how far to travel toward a tier target this frame.
 *
 * Frame-rate independent exponential approach — `1 - e^(-rate * dt)` — so the
 * ~300 ms settle is the same at 30 fps and at 144 fps. A non-finite delta (the
 * first frame, or a resume from a backgrounded tab) returns 1, which snaps.
 */
const TIER_EASE_RATE = 12;

function easeFactor(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds)) return 1;
  return 1 - Math.exp(-TIER_EASE_RATE * deltaSeconds);
}

function detailForTier(tier: PharosVilleRenderSchedulerState["tier"]): number {
  switch (tier) {
    case "full":
    case "balanced":
      return 1;
    case "interaction":
      return 0.58;
    case "recovery":
      return 0.36;
    case "constrained":
      // The shader still evaluates its wave fields at zero detail, so retain
      // enough contrast to keep the water legible without extra GPU work.
      return 0.24;
  }
}
