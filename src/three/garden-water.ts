import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Matrix4,
  Mesh,
  NearestFilter,
  NoColorSpace,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
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
import { CAMERA_FAR } from "../systems/projection";
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
  dayCycleBeats,
  dayCyclePhase,
} from "./garden-day-cycle";
import {
  GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS,
  GARDEN_LIGHTHOUSE_BEAM_LENGTH,
  GARDEN_LIGHTHOUSE_BEAM_POOL_DISTANCE,
} from "./garden-lighthouse";
import {
  gardenHeightFogGlsl,
  gardenHeightFogUniforms,
  updateGardenHeightFog,
} from "./garden-height-fog";
import { GARDEN_AERIAL_GLSL_PARS, gardenAerialUniforms } from "./garden-aerial";
import { gardenEnvironmentIntensityForBeats } from "./garden-environment";
import { blendGardenSkyColor } from "./garden-sky";
import { gardenMoonPose, gardenSunPose } from "./garden-sun";
import { isKnockedOut } from "../lib/pharosville-debug";
import { MAX_GARDEN_LIGHT_LANES } from "./garden-lanterns";
import { GARDEN_EMPTY_INLET } from "../systems/garden-inlet";
import { rimShoreDistance } from "../systems/garden-rim";
import {
  RISK_SURFACE_SIGNATURES,
  SEA_REGION_CHARACTER,
  SEA_REGION_COUNT,
  SEA_REGION_DISTANCE_FULL_SCALE_TILES,
  SEA_REGION_FALLBACK_TINT,
  SEA_REGION_ID,
  SEA_REGION_ORDER,
  SEA_REGION_SHORE_FULL_SCALE_TILES,
  buildSeaRegionField,
} from "../systems/garden-sea-regions";
import { shoreBeachWeight, writeGardenShoreSample, type GardenShoreSample } from "./garden-rim-mesh";
import {
  GARDEN_SURFACE_GLSL,
  type GardenSurfaceAtlasLease,
  type GardenSurfaceAtlasOwner,
} from "./garden-surface-atlas";
import {
  GARDEN_WATER_BEACON_CLAMP,
  GARDEN_WATER_CREST_FOAM,
  GARDEN_WATER_FRESNEL_CAP,
  GARDEN_WATER_OPTICS,
  GARDEN_WATER_LANE_CLAMP,
  GARDEN_WATER_MAX_LIGHT_LANES,
  GARDEN_WATER_MAX_RIPPLE_RINGS,
  GARDEN_WATER_MAX_ZONE_TINTS,
  GARDEN_WATER_MOON_ROAD_GAIN,
  GARDEN_WATER_PLATE_MARGIN_TILES,
  GARDEN_WATER_SHORE_LAP,
  GARDEN_WATER_SKY_RADIANCE,
  GARDEN_WATER_SUN_GLITTER_GAIN,
  type GardenCloudShadowSource,
  type GardenHarborCalmMask,
  type GardenRippleRingEmitter,
  type GardenWaterZoneTint,
} from "./garden-water-contract";

// Tile -> world scale, mirroring TILE_SCALE in garden-util. Redeclared here to
// keep garden-water free of a util import cycle.
const TILE_SCALE_UNITS = Math.SQRT2;
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

  // R/G retain continuous boundary/shore distances; spare B/A carry authored
  // sand weight/exposure in exactly the field's world-coordinate sample phase.
  // The categorical field above is never altered or filtered.
  const distanceData = new Uint8Array(baked.size * baked.size * 4);
  const shore: GardenShoreSample = { segment: null, depth: 0, substrate: null, exposure: 0, state: "damp" };
  for (let index = 0; index < baked.size * baked.size; index += 1) {
    const boundary = baked.data[index * 4 + 1]!;
    distanceData[index * 4] = boundary;
    distanceData[index * 4 + 1] = baked.data[index * 4 + 2]!;
    const worldX = (index % baked.size) / baked.size * baked.tileSpan * TILE_SCALE_UNITS;
    const worldZ = Math.floor(index / baked.size) / baked.size * baked.tileSpan * TILE_SCALE_UNITS;
    writeGardenShoreSample(shore, worldX, 0, worldZ, 0);
    const shoreTiles = baked.data[index * 4 + 2]! / 255 * SEA_REGION_SHORE_FULL_SCALE_TILES;
    const rimDistance = Math.max(0, rimShoreDistance(worldX / TILE_SCALE_UNITS, worldZ / TILE_SCALE_UNITS));
    // Rim reach metadata must not leak onto the nearer island/islet substrate.
    const rimWeight = 1 - MathUtils.smoothstep(rimDistance - shoreTiles, 0.25, 1);
    distanceData[index * 4 + 2] = Math.round(shoreBeachWeight(worldX, worldZ) * rimWeight * 255);
    distanceData[index * 4 + 3] = Math.round(MathUtils.lerp(0.2, shore.exposure, rimWeight) * 255);
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
const SEA_ANNULUS_OUTER_RADIUS = CAMERA_FAR * 0.8;
/**
 * W3.6: the plate dissolves into the surrounding sea over twenty world units
 * (was eight, which left a ruled seam at the far mouth).
 */
const SEA_EDGE_CROSSFADE = 20;
const SEA_HORIZON_CALM_DISTANCE = 100;
/** World units per shore-field unit (the field's full scale, in tiles). */
const SHORE_FIELD_WORLD_UNITS = SEA_REGION_SHORE_FULL_SCALE_TILES * Math.SQRT2;
/** World units per boundary-distance unit. */
const BOUNDARY_FIELD_WORLD_UNITS = SEA_REGION_DISTANCE_FULL_SCALE_TILES * Math.SQRT2;

/**
 * Named-body boundary banks are intentionally broad enough to survive the
 * whole-map camera. The exact per-body widths live with each water character;
 * these bounds make the renderer contract inspectable without parsing GLSL.
 */
export const GARDEN_SEA_BOUNDARY_SEAM_WIDTH_TILES = {
  min: 2.6,
  max: 3.6,
} as const;

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

/** Shared with the hull swell pose (`garden-hull-swell.ts`) so hulls nod in phase with this sea. */
export const GERSTNER_BASE_BEARING = Math.atan2(0.3851, 0.9229);
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

export const GARDEN_HERO_REFLECTION_FILTER = Object.freeze({
  minimumRoughness: 0.06,
  spreadGain: 6,
  maximumSpreadTexels: 2,
  maximumDistortionTexels: 1.5,
});

/** CPU reference for the shader's bounded, contact-preserving anisotropic kernel. */
export function gardenHeroReflectionSpreadTexels(roughness: number, contact: number): number {
  const filter = GARDEN_HERO_REFLECTION_FILTER;
  const safeRoughness = Math.max(filter.minimumRoughness,
    Number.isFinite(roughness) ? roughness : filter.minimumRoughness);
  const continuity = MathUtils.clamp(Number.isFinite(contact) ? contact : 1, 0, 1);
  return Math.min(filter.maximumSpreadTexels,
    Math.sqrt(Math.max(0, safeRoughness ** 2 - filter.minimumRoughness ** 2)) * filter.spreadGain)
    * (1 - continuity);
}

/** Footprint and optical spread share a mip floor; sub-texel contact remains LOD zero. */
export function gardenHeroReflectionMipLod(footprintTexels: number, spreadTexels: number): number {
  return Math.log2(Math.max(1, Number.isFinite(footprintTexels) ? footprintTexels : 1,
    Number.isFinite(spreadTexels) ? spreadTexels : 0));
}

const SEA_EDGE_GLSL = /* glsl */ `
  uniform vec4 uPlateBounds;

  // Positive inside the finite plate, negative outside; independent of eye.
  float gardenPlateEdgeDistance(vec2 p) {
    vec2 edge = min(p - uPlateBounds.xy, uPlateBounds.zw - p);
    return min(edge.x, edge.y);
  }

  float gardenHorizonCalm(vec2 p) {
    return smoothstep(0.0, ${glslFloat(SEA_HORIZON_CALM_DISTANCE)}, -gardenPlateEdgeDistance(p));
  }
`;

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

export const GARDEN_WATER_NORMAL_MAP_URL = "/pharosville/textures/water-normals.png?v=cb715151c1a9";

// Cloud-shadow world mapping: one noise tile spans ~170 world units. The
// drift itself now comes from the weather system (Phase 2): its default wind
// bearing reproduces the historical east-southeast scud the fixed constants
// below encoded, and storm weather drives it faster.
const CLOUD_SHADOW_TEXEL_SCALE = 1 / 170;

/** Reused per frame so the water's update path allocates nothing. */
const scratchSunPose = { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2 };
const scratchMoonPose = { direction: new Vector3(0, 1, 0), elevation: 0, moonLight: 0 };

const pc = (key: keyof typeof HARBOR_PALETTE): Color => new Color(HARBOR_PALETTE[key]);
const linearLuma = (color: Color): number => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

/**
 * W3.1: the transmitted body is a low-chroma absorption ink, not the sea's
 * voice. The sky arrives through Fresnel; the body only says how deep and how
 * dark the water is under it (water-1c: L* ≈ 18 day, 12 dusk, 3 night, OKLCH
 * chroma ≤ 0.04). `keep` is the share of the palette hue that survives a
 * linear pull toward grey; the result is then scaled to the target L*.
 */
function bodyInk(hue: Color, lightness: number, keep: number): Color {
  const grey = linearLuma(hue);
  const ink = new Color(grey, grey, grey).lerp(hue, keep);
  const targetY = lightness > 8 ? ((lightness + 16) / 116) ** 3 : lightness / 903.3;
  return ink.multiplyScalar(targetY / Math.max(linearLuma(ink), 1e-6));
}

const DAY_SHALLOW = bodyInk(pc("shallow_teal"), 26, 0.34);
const DAY_MID = bodyInk(pc("shallow_teal").lerp(pc("deep_sea_1"), 0.5), 21, 0.4);
const DAY_DEEP = bodyInk(pc("deep_sea_1"), 18, 0.42);

// Blue hour's body leans violet (fog_blue) so the mirrored mauve sky does not
// sit on a royal-blue floor.
const DUSK_SHALLOW = bodyInk(pc("fog_blue").lerp(pc("shallow_teal"), 0.3), 17, 0.42);
const DUSK_MID = bodyInk(pc("fog_blue").lerp(pc("deep_sea_1"), 0.4), 14, 0.45);
const DUSK_DEEP = bodyInk(pc("deep_sea_2").lerp(pc("fog_blue"), 0.3), 12, 0.45);

const NIGHT_SHALLOW = bodyInk(pc("deep_sea_1").lerp(pc("deep_sea_2"), 0.3), 5, 0.5);
const NIGHT_MID = bodyInk(pc("deep_sea_1").lerp(pc("deep_sea_2"), 0.65), 4, 0.5);
const NIGHT_DEEP = bodyInk(pc("deep_sea_2"), 3, 0.5);
const DAY_HIGHLIGHT = pc("foam_white")
  .lerp(pc("sun_day_warm"), 0.3);
const DUSK_HIGHLIGHT = pc("foam_white")
  .lerp(pc("lantern_warm"), 0.45);
const NIGHT_HIGHLIGHT = pc("moonlight");
const BEACON_HIGHLIGHT = pc("lantern_glow");
/** Same mineral pigments as the shore; atlas detail stays world-registered. */
const BOTTOM_STONE = pc("stone_dark").lerp(pc("stone_mid"), 0.6);
const BOTTOM_SAND = pc("stone_pale").lerp(pc("fog_day"), 0.14);
/** W3.5: the road is moonlight, never white. */
const MOON_ROAD_COLOR = pc("moonlight");

/**
 * W3.4 (art-director-6): the approach water between the rest seat and the
 * tower, in water coordinates (x = world X, y = −world Z), from the same
 * capsule the fleet, sea-edge siting and the motion A* keep empty.
 */
const INLET_START = GARDEN_EMPTY_INLET.polyline[0]!;
const INLET_END = GARDEN_EMPTY_INLET.polyline[GARDEN_EMPTY_INLET.polyline.length - 1]!;
const INLET_GLSL = /* glsl */ `
  float gardenInletCalm(vec2 p) {
    vec2 a = vec2(${glslFloat(INLET_START.x * TILE_SCALE_UNITS)}, ${glslFloat(-INLET_START.y * TILE_SCALE_UNITS)});
    vec2 ab = vec2(${glslFloat((INLET_END.x - INLET_START.x) * TILE_SCALE_UNITS)}, ${glslFloat(-(INLET_END.y - INLET_START.y) * TILE_SCALE_UNITS)});
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float d = length(p - a - ab * t) / ${glslFloat(GARDEN_EMPTY_INLET.halfWidth * TILE_SCALE_UNITS)};
    return 1.0 - smoothstep(0.55, 1.0, d);
  }
`;

const glslColor = (color: Color): string =>
  `vec3(${glslFloat(color.r)}, ${glslFloat(color.g)}, ${glslFloat(color.b)})`;

// Exported for the shader-hygiene guard test (undeclared-uniform tripwire).
export const VERTEX_SHADER = /* glsl */ `
  uniform float uAnnulus;
  ${SEA_EDGE_GLSL}
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
  uniform sampler2D uRegionDistance;
  uniform vec4 uRegionFlow[${SEA_REGION_COUNT}];
  uniform vec3 uRegionSwell[${SEA_REGION_COUNT}];
  uniform vec4 uRegionTransform;
  uniform mat4 uHeroReflectionMatrix;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;
  varying vec4 vHeroReflectionClip;
  varying vec2 vRegionUv;
  varying vec3 vGerstnerNormal;
  varying float vGerstnerJ;

  ${INLET_GLSL}

  ${gerstnerSumGlsl()}

  void main() {
    vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 waterPosition = uAnnulus > 0.5 ? vec2(worldBase.x, -worldBase.z) : position.xy;
    float harborDistance = length((waterPosition - uHarborEllipse.xy) * uHarborEllipse.zw);
    float harborCalm = (1.0 - smoothstep(0.7, 1.05, harborDistance)) * uHarborCalm;
    vec2 regionUv = (waterPosition - uRegionTransform.xy) * uRegionTransform.zw;
    vec4 regionSample = texture2D(uRegionField, regionUv);
    int regionId = int(regionSample.r * 255.0 + 0.5);
    if (uAnnulus > 0.5 || any(lessThan(regionUv, vec2(0.0)))
      || any(greaterThan(regionUv, vec2(1.0)))) {
      regionId = ${SEA_REGION_ID.open};
      harborCalm = 0.0;
    }
    // IDs remain categorical; only their surface deviations fade at the seam.
    float boundaryDistance = texture2D(uRegionDistance, regionUv).r;
    float regionBlend = smoothstep(0.0, 0.56, boundaryDistance);
    if (regionId == ${SEA_REGION_ID.open}) regionBlend = 1.0;
    vec4 regionFlow = uRegionFlow[regionId];
    regionFlow.z *= regionBlend;
    float regionSwell = mix(0.5, uRegionSwell[regionId].x, regionBlend);
    float regionChop = mix(1.0, uRegionSwell[regionId].y, regionBlend)
      * (1.0 + uWindSpeed * 0.3 + uStorm * 0.25);
    // At and inside the edge both meshes use the identical open-water spectrum.
    // Only the surrounding 100 world units ease toward the quiet horizon.
    float horizonCalm = uAnnulus * gardenHorizonCalm(waterPosition);
    regionSwell *= mix(1.0, 0.55, horizonCalm);
    regionChop *= mix(1.0, 0.8, horizonCalm);

    vec2 baseDir = normalize(vec2(0.9229, 0.3851));
    vec2 phaseFlow = mix(-uWindDir, -regionFlow.xy, regionFlow.z);
    vec2 phaseWindDir = dot(phaseFlow, phaseFlow) > 1e-8
      ? phaseFlow / max(length(phaseFlow), 1e-4) : vec2(1.0, 0.0);
    float rc = clamp(dot(baseDir, phaseWindDir), -1.0, 1.0);
    float rs = baseDir.x * phaseWindDir.y - baseDir.y * phaseWindDir.x;
    mat2 windRot = mat2(rc, rs, -rs, rc);
    float speed = 0.72 + uTempo * 0.38;
    // Shelter is physical geography, never a risk-band privilege.
    float inletCalm = uAnnulus < 0.5 ? gardenInletCalm(waterPosition) : 0.0;
    float shoreCalm = 1.0 - smoothstep(0.02, 0.16, texture2D(uRegionDistance, regionUv).g);
    float shelter = max(inletCalm, shoreCalm * (1.0 - uAnnulus));
    float ampScale = uWaveAmplitude * regionSwell * (1.0 - harborCalm * 0.8) * (1.0 - shelter * 0.5);
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
    vHeroReflectionClip = uHeroReflectionMatrix * vec4(vWorldPosition, 1.0);

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Exported for shader hygiene and the reading key's actual local water exemplars.
// Static, world-anchored marks carry risk; optical motion and hue are secondary.
export const GARDEN_RISK_SURFACE_GLSL = /* glsl */ `
  uniform float uSurfacePixelRatio;
  vec3 gardenRiskSurface(vec2 worldPosition, int regionId) {
    // Derivatives must execute for every helper lane, before categorical exits.
    vec2 worldDx = dFdx(worldPosition);
    vec2 worldDy = dFdy(worldPosition);
    vec4 geometry = vec4(0.0);
    vec4 style = vec4(0.0);
    float bearing = 0.0;
    ${Object.entries(RISK_SURFACE_SIGNATURES).filter(([, signature]) => signature.kind === "strokes").map(([body, signature]) => `
    if (regionId == ${SEA_REGION_ID[body as keyof typeof RISK_SURFACE_SIGNATURES]}) {
      geometry = vec4(${[signature.pitch, ...signature.length, signature.grouping].map(glslFloat).join(", ")});
      style = vec4(${[signature.gap, signature.coverageCap, signature.value, body === "watch" ? 0.3 : 0.08].map(glslFloat).join(", ")});
      bearing = ${glslFloat(signature.bearing)};
    }`).join("")}
    if (regionId == ${SEA_REGION_ID.wreck}) {
      float silt = smoothstep(0.42, 0.72, gardenFbm(worldPosition * 0.052 + vec2(4.2, -7.8)));
      return vec3(silt * ${glslFloat(RISK_SURFACE_SIGNATURES.wreck.coverageCap)}, 0.0,
        ${glslFloat(RISK_SURFACE_SIGNATURES.wreck.value)});
    }
    if (geometry.w < 0.5) return vec3(0.0);
    vec2 p = rotate2(worldPosition, bearing);
    float period = max(geometry.z + geometry.x, 1e-4);
    float pitch = max(geometry.x, 1e-4);
    float cellArea = max(period * pitch, 1e-4);
    vec2 cell = floor(p / vec2(period, pitch));
    float seed = gardenHash(cell + float(regionId) * 13.7);
    float strokeLength = mix(geometry.y, geometry.z, seed);
    vec2 local = p - (cell + 0.5) * vec2(period, pitch);
    local.x -= (gardenHash(cell + 7.1) - 0.5) * geometry.x * 0.3;
    local.y -= (seed - 0.5) * max(0.0, geometry.x - (geometry.w - 1.0) * style.x) * 0.3;
    local.y += sin(p.x * 0.08 + seed * 6.2831853) * style.w;
    vec2 footprint = max(abs(rotate2(worldDx, bearing))
      + abs(rotate2(worldDy, bearing)), vec2(1e-4));
    // Width is bounded by coverage and ~1.5 CSS pixels, independent of DPR.
    // A strictly positive width also keeps every smoothstep edge pair ordered.
    float halfWidth = max(1e-4, min(footprint.y * max(1.0, uSurfacePixelRatio) * 0.75,
      style.y * cellArea / max(6.0 * geometry.z * geometry.w, 1e-4)));
    float core = 0.0;
    float shoulder = 0.0;
    for (int i = 0; i < 4; i++) {
      if (float(i) >= geometry.w) break;
      float offset = (float(i) - (geometry.w - 1.0) * 0.5) * style.x;
      float end = abs(local.x + sin(seed * 17.0 + float(i) * 2.3) * geometry.y * 0.08);
      float gate = 1.0 - smoothstep(strokeLength * 0.5 - footprint.x,
        strokeLength * 0.5 + footprint.x, end);
      float d = abs(local.y - offset);
      float ink = 1.0 - smoothstep(halfWidth * 0.5, halfWidth * 1.5, d);
      float edge = (1.0 - smoothstep(halfWidth * 1.5, halfWidth * 2.5, d)) - ink;
      core += ink * gate;
      shoulder += edge * gate;
    }
    // Unresolved groups retain their integrated area, never fade to blank.
    float groupSpacing = geometry.w > 1.0 ? style.x : geometry.x;
    float resolved = smoothstep(1.5, 4.0, groupSpacing / max(footprint.y, 1e-4))
      * smoothstep(1.5, 4.0, geometry.y / max(footprint.x, 1e-4));
    float meanLength = (geometry.y + geometry.z) * 0.5;
    float meanCore = 2.0 * halfWidth * meanLength * geometry.w / cellArea;
    return vec3(mix(meanCore, min(core, 1.0), resolved),
      mix(meanCore, min(shoulder, 1.0), resolved), style.z);
  }
`;
export const FRAGMENT_SHADER = /* glsl */ `
  uniform float uAnnulus;
  ${SEA_EDGE_GLSL}
  uniform sampler2D envMap;
  uniform sampler2D uHeroReflection;
  uniform mat4 uHeroReflectionMatrix;
  uniform float uHeroReflectionStrength;
  uniform vec2 uHeroReflectionSize;
  uniform vec3 uBandColor[4];
  uniform float uBeaconAngle;
  uniform vec3 uBeaconColor;
  uniform float uBeaconFlicker;
  uniform vec2 uBeaconPosition;
  uniform float uBeaconStrength;
  uniform vec2 uCemeteryCenter;
  uniform sampler2D uCloudShadow;
  uniform float uCloudShadowStrength;
  uniform vec4 uCloudShadowTransform;
  uniform float uDaylight;
  uniform float uDetail;
  uniform float uDusk;
  uniform vec3 uEnvHorizonColor;
  uniform vec3 uEnvZenithColor;
  uniform float uGlitterStrength;
  uniform float uHarborCalm;
  uniform vec4 uHarborEllipse;
  uniform vec3 uHighlightColor;
  uniform vec2 uIslandCenter;
  uniform float uLaneCount;
  uniform vec3 uLaneField;
  uniform sampler2D uLaneTexture;
  uniform vec3 uMoonDirection;
  uniform float uMoonLight;
  uniform float uPulseTime;
  uniform vec2 uSunDir;
  uniform float uSunHeight;
  #define GARDEN_TOWER_HEIGHT 34.0
  #define GARDEN_TOWER_SHADOW_MAX_REACH 150.0
  #define GARDEN_TOWER_SHADOW_STRENGTH 0.34
  uniform float uNight;
  uniform sampler2D uNormalMap;
  uniform vec2 uPigeonnierCenter;
  uniform vec4 uRipple[${GARDEN_WATER_MAX_RIPPLE_RINGS}];
  uniform float uRippleCount;
  uniform vec4 uRippleParams[${GARDEN_WATER_MAX_RIPPLE_RINGS}];
  uniform float uRippleStrength;
  uniform float uSkyRadiance;
  uniform float uStorm;
  uniform vec3 uSunGlitterColor;
  uniform float uSwell;
  uniform float uTempo;
  uniform float uTime;
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
  uniform vec4 uRegionBoundary[${SEA_REGION_COUNT}];
  uniform vec4 uRegionFlow[${SEA_REGION_COUNT}];
  uniform vec3 uRegionParams[${SEA_REGION_COUNT}];
  uniform vec3 uRegionSwell[${SEA_REGION_COUNT}];
  uniform vec4 uRegionTransform;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;
  varying vec4 vHeroReflectionClip;
  varying vec2 vRegionUv;
  varying vec3 vGerstnerNormal;
  varying float vGerstnerJ;

  #include <cube_uv_reflection_fragment>
  ${GARDEN_AERIAL_GLSL_PARS}
  ${GARDEN_SURFACE_GLSL}

  const float LANE_TEXELS = ${MAX_GARDEN_LIGHT_LANES}.0;
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  const vec3 BOTTOM_STONE = ${glslColor(BOTTOM_STONE)};
  const vec3 BOTTOM_SAND = ${glslColor(BOTTOM_SAND)};
  const vec3 MOON_ROAD_COLOR = ${glslColor(MOON_ROAD_COLOR)};
  const float GARDEN_WATER_LAP_GAIN = ${glslFloat(GARDEN_WATER_SHORE_LAP.maxMix)};

  vec3 sampleWaterNormal(vec2 uv) {
    vec3 meanNormal = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
    // Until the local image is uploaded, an empty sampler is flat water.
    return meanNormal.z > 0.0 ? meanNormal : vec3(0.0, 0.0, 1.0);
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

  float maxComponent(vec3 v) {
    return max(max(v.r, v.g), v.b);
  }

  ${INLET_GLSL}
  ${GARDEN_RISK_SURFACE_GLSL}

  // W3.1 (water-1a/d): the hour's probe at the body's roughness. No IBL
  // intensity here — the per-beat sky radiance multiplies the result.
  vec3 gardenEnvironmentReflection(
    vec3 worldNormal,
    vec3 worldViewDirection,
    vec3 scalarFallback,
    float roughness
  ) {
    #ifdef ENVMAP_TYPE_CUBE_UV
      vec3 reflectionDirection = reflect(-worldViewDirection, worldNormal);
      // A ripple can tip a grazing ray under the horizon; the lower probe
      // hemisphere is not the sky the water mirrors.
      reflectionDirection.y = max(reflectionDirection.y, 0.01);
      return textureCubeUV(envMap, normalize(reflectionDirection), roughness).rgb;
    #else
      return scalarFallback;
    #endif
  }

${gardenHeightFogGlsl()}

  void main() {
    float harborDistance = length((vWaterPosition - uHarborEllipse.xy) * uHarborEllipse.zw);
    float harborCalm = (1.0 - smoothstep(0.7, 1.05, harborDistance)) * uHarborCalm;

    vec4 surfaceRegionSample = texture2D(uRegionField, vRegionUv);
    int regionId = int(surfaceRegionSample.r * 255.0 + 0.5);
    if (uAnnulus > 0.5 || any(lessThan(vRegionUv, vec2(0.0)))
      || any(greaterThan(vRegionUv, vec2(1.0)))) {
      regionId = ${SEA_REGION_ID.open};
      harborCalm = 0.0;
    }
    vec4 regionDistanceSample = texture2D(uRegionDistance, vRegionUv);
    float boundaryDistance = regionDistanceSample.r;
    float regionBlend = smoothstep(0.0, 0.56, boundaryDistance);
    if (regionId == ${SEA_REGION_ID.open}) regionBlend = 1.0;
    vec4 regionFlow = uRegionFlow[regionId];
    regionFlow.z *= regionBlend;
    vec3 regionWave = uRegionSwell[regionId];
    vec4 boundaryCharacter = uRegionBoundary[regionId];
    float regionReflect = uRegionParams[regionId].y;
    float seaReflectivity = mix(1.0, regionReflect, regionBlend);
    // Optical roughness supports body identity; static marks carry the band.
    float probeRoughness = mix(
      ${glslFloat(SEA_REGION_CHARACTER.open.probeRoughness)},
      boundaryCharacter.w,
      regionBlend
    );
    float inletCalm = uAnnulus < 0.5 ? gardenInletCalm(vWaterPosition) : 0.0;
    vec2 bodyFlow = mix(uWindDir, regionFlow.xy, regionFlow.z);
    vec2 bodyFlowDir = dot(bodyFlow, bodyFlow) > 1e-8
      ? bodyFlow / max(length(bodyFlow), 1e-4) : vec2(1.0, 0.0);
    vec2 bodyAcrossDir = vec2(-bodyFlowDir.y, bodyFlowDir.x);
    float bodyAlong = dot(vWaterPosition, bodyFlowDir);
    float bodyAcross = dot(vWaterPosition, bodyAcrossDir);
    float camDistance = distance(cameraPosition, vWorldPosition);

    // The field owns every coast. W3.6: beyond the plate the world itself has
    // a coast — the edge's own field value plus the distance out from it, so
    // the harbour mouths (open water at the edge) grow no shore.
    float shoreField = regionDistanceSample.g;
    if (uAnnulus > 0.5) {
      shoreField += max(0.0, -gardenPlateEdgeDistance(vWaterPosition))
        * ${glslFloat(1 / SHORE_FIELD_WORLD_UNITS)};
    }
    float shoreCalm = (1.0 - smoothstep(0.02, 0.16, shoreField)) * (1.0 - uAnnulus);
    float shelter = max(max(harborCalm, inletCalm), shoreCalm);

    // Slick edges (K7): bodies meet along a noise-warped line of glass, not a
    // ruled seam. The seam is signed by id parity so the line is single.
    float seamSide = mod(float(regionId), 2.0) < 0.5 ? 1.0 : -1.0;
    float seamWarp = (gardenValueNoise(vWaterPosition * 0.11 + 5.3) - 0.5) * 6.0
      + (gardenValueNoise(vWaterPosition * 0.035 - 2.1) - 0.5) * 4.0;
    float seam = boundaryDistance * ${glslFloat(BOUNDARY_FIELD_WORLD_UNITS)} * seamSide + seamWarp;
    float slickEdge = (1.0 - smoothstep(0.4, 1.6, abs(seam)))
      * (1.0 - uAnnulus)
      * (regionId == ${SEA_REGION_ID.none} ? 0.0 : 1.0)
      // The field's boundary also rings every coast; a slick line belongs
      // only where the nearest edge is another body, not the shore.
      * smoothstep(2.0, 5.0, shoreField * ${glslFloat(SHORE_FIELD_WORLD_UNITS)}
        - boundaryDistance * ${glslFloat(BOUNDARY_FIELD_WORLD_UNITS)});

    // One broad directional band plus a weak same-axis irregular fine band.
    // Preserve the decoded mip mean length before renormalizing the samples.
    float scroll = uTime * (0.6 + uTempo * 0.9) * (0.92 + uBreath * 0.16);
    vec2 normalUv = vec2(bodyAlong, bodyAcross)
      * ${glslFloat(1 / GARDEN_WATER_OPTICS.normalTileWorldUnits)} + vec2(scroll * 0.002, 0.0);
    vec2 fineUv = vec2(bodyAlong, bodyAcross)
      * ${glslFloat(1 / GARDEN_WATER_OPTICS.fineTileWorldUnits)}
      + vec2(0.37, 0.71) - vec2(scroll * 0.003, 0.0);
    vec3 broadMean = sampleWaterNormal(normalUv);
    vec3 fineMean = sampleWaterNormal(fineUv);
    float broadMeanLength = clamp(length(broadMean), 1e-4, 1.0);
    float fineMeanLength = clamp(length(fineMean), 1e-4, 1.0);
    vec3 broadNormal = broadMean / max(length(broadMean), 1e-4);
    vec3 fineNormal = fineMean / max(length(fineMean), 1e-4);
    float broadWeight = 1.0 - smoothstep(0.35, 0.8,
      length(fwidth(normalUv)) * ${glslFloat(GARDEN_WATER_OPTICS.maximumTextureCycles)});
    float fineWeight = 1.0 - smoothstep(0.35, 0.8,
      length(fwidth(fineUv)) * ${glslFloat(GARDEN_WATER_OPTICS.maximumTextureCycles)});
    vec2 broadSlope = broadNormal.xy / max(broadNormal.z, 0.5);
    vec2 fineSlope = fineNormal.xy / max(fineNormal.z, 0.5)
      * ${glslFloat(GARDEN_WATER_OPTICS.fineSlopeGain)};
    vec2 textureSlope = bodyFlowDir * (broadSlope.x * broadWeight + fineSlope.x * fineWeight)
      + bodyAcrossDir * (broadSlope.y * broadWeight + fineSlope.y * fineWeight);
    float mipVariance = max(0.0, 1.0 - broadMeanLength * broadMeanLength)
      + max(0.0, 1.0 - fineMeanLength * fineMeanLength)
        * ${glslFloat(GARDEN_WATER_OPTICS.fineSlopeGain ** 2)}
      + dot(broadSlope, broadSlope) * (1.0 - broadWeight * broadWeight)
      + dot(fineSlope, fineSlope) * (1.0 - fineWeight * fineWeight);

    // R/G are mover history; B is the current hull bed, never a trail.
    vec4 wake = vec4(0.0);
    vec2 wakeGrad = vec2(0.0);
    vec2 wakeUv = (vWaterPosition - uWakeCenter) * uWakeInvSize + 0.5;
    // Derivatives precede window exits. Reuse the three samples to filter the
    // long pixel axis; unresolved history loses energy, not financial order.
    vec2 wakeDx = dFdx(wakeUv);
    vec2 wakeDy = dFdy(wakeUv);
    vec2 wakeAxis = dot(wakeDx, wakeDx) > dot(wakeDy, wakeDy) ? wakeDx : wakeDy;
    float wakePixel = max(length(wakeAxis), max(uWakeTexel, 1e-6));
    float wakeResolution = max(uWakeTexel, 1e-6) / wakePixel;
    vec2 wakeStep = wakeAxis * 0.5;
    bool wakeInside = uAnnulus < 0.5 && uWakeStrength > 0.01
      && all(greaterThan(wakeUv, vec2(0.001))) && all(lessThan(wakeUv, vec2(0.999)));
    if (wakeInside) {
      vec4 centerWake = texture2D(uWakeMap, wakeUv);
      vec4 beforeWake = texture2D(uWakeMap, wakeUv - wakeStep);
      vec4 afterWake = texture2D(uWakeMap, wakeUv + wakeStep);
      wake = centerWake * 0.5 + (beforeWake + afterWake) * 0.25;
      wakeGrad = wakeAxis / wakePixel * (afterWake.r - beforeWake.r) * wakeResolution;
    }
    float wakeFoam = wake.r * wakeResolution;
    // Soft slick transfer is monotonic in raw G, and exactly zero at G zero.
    float wakeSlick = wake.g * wakeResolution * uWakeStrength;
    // Any body's optical slopes can shelter or slick; ink/value never do.
    float windSlick = smoothstep(0.55, 0.75,
      gardenFbm(vWaterPosition * ${glslFloat(1 / 90)} + uWindDir * (uTime * 0.0002)));
    float slickFlatten = (1.0 - 0.85 * windSlick) * (1.0 - 0.75 * wakeSlick) * (1.0 - 0.8 * slickEdge);
    float detailScale = mix(${glslFloat(SEA_REGION_CHARACTER.open.normalDetail)}, regionFlow.w, regionBlend)
      * (1.0 - uAnnulus * gardenHorizonCalm(vWaterPosition) * 0.45)
      * (1.0 - shelter * 0.8) * slickFlatten * uDetail;
    vec2 completeSlope = textureSlope * detailScale
      + vGerstnerNormal.xy * ${glslFloat(GARDEN_WATER_OPTICS.gerstnerSlopeGain)}
      + wakeGrad * (10.0 * uWakeStrength);
    // Filter the complete field, not a separate sparkle-only normal.
    vec2 slopeDx = dFdx(completeSlope);
    vec2 slopeDy = dFdy(completeSlope);
    float derivativeVariance = (dot(slopeDx, slopeDx) + dot(slopeDy, slopeDy))
      * ${glslFloat(GARDEN_WATER_OPTICS.derivativeVarianceGain)};
    float normalVariance = mipVariance * detailScale * detailScale + derivativeVariance;
    vec3 surfaceNormal = normalize(vec3(completeSlope / sqrt(1.0 + derivativeVariance), 1.0));
    float roughness = clamp(sqrt(max(1e-4, probeRoughness * probeRoughness + normalVariance)),
      0.06, ${glslFloat(GARDEN_WATER_OPTICS.maximumRoughness)});
    float opticalLobeExponent = clamp(2.0 / max(roughness * roughness, 1e-4) - 2.0, 8.0, 400.0);
    // Static categorical codebook is independent of all optical quieting.
    vec3 riskSurface = gardenRiskSurface(vWaterPosition, regionId);

    // No decorative ellipses: the unwarped shore field owns the depth ramp.
    float fieldDepth = smoothstep(0.0, 0.42, shoreField);
    float depth = fieldDepth * 0.88;
    float bottomDepth = max(0.0, shoreField) * ${glslFloat(SHORE_FIELD_WORLD_UNITS * 0.24)};
    float shoreMask = smoothstep(0.005, 0.04, regionDistanceSample.a) * (1.0 - uAnnulus);
    float clearBottom = exp(-bottomDepth * 1.25) * shoreMask;
    // Only substrate sampling bends. IDs, masks, depth and contact never do.
    vec3 bottomPosition = vec3(vWaterPosition.x, uWaterLevel - bottomDepth, -vWaterPosition.y);
    bottomPosition.xz += vec2(surfaceNormal.x, -surfaceNormal.y) * clearBottom * 0.14;
    GardenSurfaceDetail stoneBottom = gardenSampleSurface(bottomPosition, vec3(0, 1, 0), vec2(0), 1.0, 2.6);
    GardenSurfaceDetail sandBottom = gardenSampleSurface(bottomPosition, vec3(0, 1, 0), vec2(0), 2.0, 2.6);
    vec3 substrate = mix(BOTTOM_STONE * stoneBottom.albedo, BOTTOM_SAND * sandBottom.albedo,
      clamp(regionDistanceSample.b, 0.0, 1.0));
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

    vec2 cloudUv = vec2(vWaterPosition.x, -vWaterPosition.y) * uCloudShadowTransform.xy
      + uCloudShadowTransform.zw;
    float cloudCover = 0.0;
    if (uCloudShadowStrength > 0.001) {
      cloudCover = texture2D(uCloudShadow, cloudUv).r;
    }
    float cloudLight = 1.0 - cloudCover * uCloudShadowStrength;

    // Masked substrate absorption replaces the universal pale seabed.
    waterColor = mix(waterColor, substrate, clearBottom * 0.32 * uDaylight * cloudLight);
    waterColor *= mix(1.0, cloudLight, 0.9);

    // Hue is the second voice (K7): a quiet, luminance-matched dye on the
    // transmitted body only, so it never tints the mirrored sky.
    {
      vec3 regionTint = uRegionColor[regionId];
      float bodyLuma = dot(waterColor, LUMA);
      float tintLuma = max(dot(regionTint, LUMA), 0.0001);
      waterColor = mix(
        waterColor,
        regionTint * (bodyLuma / tintLuma),
        uRegionParams[regionId].z * regionBlend
      );
    }

    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float islandDistance = length(vWaterPosition - uIslandCenter);

    // Static contact stays bedded under the hull. Only a short, connected
    // freeboard reach extends toward the eye, filtered away below a pixel.
    float contact = 0.0;
    if (wakeInside) {
      vec2 awayWorld = vWorldPosition.xz - cameraPosition.xz;
      float horizontalDistance = max(length(awayWorld), 1e-3);
      vec2 away = vec2(awayWorld.x, -awayWorld.y) / horizontalDistance;
      float eyeHeight = max(cameraPosition.y - uWaterLevel, 1.0);
      float reach = min(0.75, horizontalDistance / (eyeHeight + 1.0) * 0.12) * wakeResolution;
      vec2 tapStep = away * (reach * uWakeInvSize / 2.0);
      contact = wake.b;
      for (int tap = 1; tap <= 2; tap += 1) {
        float along = float(tap) / 2.0;
        contact = max(contact, texture2D(uWakeMap, wakeUv + tapStep * float(tap)).b * (1.0 - 0.7 * along) * wakeResolution);
      }
      contact = clamp(contact * uWakeStrength, 0.0, 1.0);
    }

    // Schlick F0 0.02, dosed by reflectivity and capped below a perfect mirror.
    // Fresnel, probe, hero distortion and both luminaries share this pair.
    vec3 worldSurfaceNormal = vec3(surfaceNormal.x, surfaceNormal.z, -surfaceNormal.y);
    vec3 reflectedRay = reflect(-viewDirection, worldSurfaceNormal);
    vec3 scalarSky = mix(uEnvHorizonColor, uEnvZenithColor, smoothstep(0.0, 0.6, reflectedRay.y));
    // K4 / §1.1 rule 3: the probe's own luminaries (sun disc, moon and their
    // halos) never reach the water — the drawn glitter and the one moon road
    // are the only speculars. The mirror is held under the hour's sky
    // gradient, which also keeps the midday mirror below the bloom knee.
    vec3 skyCeiling = max(uEnvHorizonColor, uEnvZenithColor) * 1.1;
    vec3 skySample = min(
      gardenEnvironmentReflection(worldSurfaceNormal, viewDirection, scalarSky, roughness),
      skyCeiling
    ) * uSkyRadiance;
    skySample /= max(1.0, maxComponent(skySample) / 0.85);
    float fresnel = 0.02
      + 0.98 * pow(clamp(1.0 - dot(worldSurfaceNormal, viewDirection), 0.0, 1.0), 5.0);
    float reflectWeight = clamp(
      fresnel * seaReflectivity * (1.0 + 0.15 * wakeSlick + 0.3 * slickEdge),
      0.0,
      ${glslFloat(GARDEN_WATER_FRESNEL_CAP)}
    ) * (1.0 - contact);
    waterColor = mix(waterColor, skySample, reflectWeight);

    // Footprint-aware, surface-axis reflection: no shore-distance mip recipe
    // and no fixed vertical smear. Derivatives execute before categorical exits.
    vec2 heroSize = max(uHeroReflectionSize, vec2(1.0));
    float heroInvW = 1.0 / max(abs(vHeroReflectionClip.w), 1e-4);
    vec2 heroBaseUv = vHeroReflectionClip.xy * heroInvW * 0.5 + 0.5;
    float heroFootprint = max(length(dFdx(heroBaseUv) * heroSize),
      length(dFdy(heroBaseUv) * heroSize));
    float islandFade = 1.0 - smoothstep(45.0, 70.0, islandDistance);
    if (uAnnulus < 0.5 && uHeroReflectionStrength > 0.001 && islandFade > 0.001) {
      if (vHeroReflectionClip.w > 1e-4) {
        float heroContact = 1.0 - smoothstep(0.0, 1.5, shoreField * ${glslFloat(SHORE_FIELD_WORLD_UNITS)});
        vec4 heroAxisClip = uHeroReflectionMatrix * vec4(bodyAcrossDir.x, 0.0, -bodyAcrossDir.y, 0.0);
        vec2 heroAxisTexels = (heroAxisClip.xy - vHeroReflectionClip.xy * heroInvW * heroAxisClip.w)
          * (0.5 * heroInvW) * heroSize;
        heroAxisTexels = dot(heroAxisTexels, heroAxisTexels) > 1e-8
          ? heroAxisTexels / max(length(heroAxisTexels), 1e-4) : vec2(1.0, 0.0);
        float heroSpread = min(${glslFloat(GARDEN_HERO_REFLECTION_FILTER.maximumSpreadTexels)},
          sqrt(max(0.0, roughness * roughness - ${glslFloat(GARDEN_HERO_REFLECTION_FILTER.minimumRoughness ** 2)}))
            * ${glslFloat(GARDEN_HERO_REFLECTION_FILTER.spreadGain)}) * (1.0 - heroContact);
        float heroLod = clamp(log2(max(1.0, max(heroFootprint, heroSpread))),
          0.0, log2(max(heroSize.x, heroSize.y)));
        float heroShift = clamp(dot(surfaceNormal.xy, bodyFlowDir) * 48.0,
          -${glslFloat(GARDEN_HERO_REFLECTION_FILTER.maximumDistortionTexels)},
          ${glslFloat(GARDEN_HERO_REFLECTION_FILTER.maximumDistortionTexels)}) * (1.0 - heroContact);
        vec2 heroUv = heroBaseUv + heroAxisTexels * heroShift / heroSize;
        vec2 heroTap = heroAxisTexels * heroSpread / heroSize;
        vec4 hero = textureLod(uHeroReflection, heroUv, heroLod);
        if (heroSpread > 0.0) {
          hero = hero * 0.5
            + textureLod(uHeroReflection, heroUv + heroTap, heroLod) * 0.25
            + textureLod(uHeroReflection, heroUv - heroTap, heroLod) * 0.25;
        }
        // A few held irregular strips interrupt the image, never detach its foot.
        float heroStrip = smoothstep(0.28, 0.52,
          gardenValueNoise(vec2(bodyAlong * 0.23, bodyAcross * 0.035) + vec2(6.1, 8.3)));
        float heroContinuity = mix(1.0, mix(0.25, 1.0, heroStrip), 1.0 - heroContact);
        vec2 heroEdge = min(heroUv, 1.0 - heroUv);
        float heroEdgeFade = smoothstep(0.0, 0.06, min(heroEdge.x, heroEdge.y));
        vec3 heroColor = hero.rgb / max(hero.a, 1e-3);
        heroColor = heroColor / (1.0 + maxComponent(heroColor) * 0.8) * 0.8;
        float heroWeight = clamp(
          fresnel * seaReflectivity * 1.4 * (1.0 - roughness) * (1.0 + 0.4 * inletCalm),
          0.0,
          0.7
        ) * islandFade * heroEdgeFade * heroContinuity * uHeroReflectionStrength * (1.0 - contact);
        waterColor = mix(waterColor, heroColor, clamp(heroWeight * hero.a, 0.0, 1.0));
      }
    }

    waterColor *= 1.0 - 0.35 * contact;
    // The value ladder survives the dye cut: danger stays dark and matte.
    waterColor *= mix(1.0, uRegionParams[regionId].x, regionBlend);

    // Sheltered substrate stays dark/still; only sparse exposed reaches lap.
    {
      float wetBand = (1.0 - smoothstep(0.0, 0.035, shoreField)) * shoreMask;
      waterColor *= 1.0 - wetBand * 0.45;
      float shoreNoise = gardenValueNoise(vWaterPosition * 0.31 + 9.7);
      float exposedLap = smoothstep(${glslFloat(GARDEN_WATER_SHORE_LAP.exposureStart)},
        ${glslFloat(GARDEN_WATER_SHORE_LAP.exposureEnd)}, regionDistanceSample.a);
      float shoreBreath = sin(uTime * ${glslFloat(Math.PI * 2 / GARDEN_WATER_SHORE_LAP.periodSeconds)}
        + shoreNoise * 2.4) * ${glslFloat(GARDEN_WATER_SHORE_LAP.travel)};
      float shoreLineDistance = abs(shoreField - (${glslFloat(GARDEN_WATER_SHORE_LAP.centre)} + shoreBreath));
      float shoreFeather = max(${glslFloat(GARDEN_WATER_SHORE_LAP.feather)}, fwidth(shoreField) * 1.5);
      float shoreEdge = 1.0 - smoothstep(${glslFloat(GARDEN_WATER_SHORE_LAP.core)}, shoreFeather, shoreLineDistance);
      shoreEdge *= smoothstep(${glslFloat(GARDEN_WATER_SHORE_LAP.noiseStart)}, 0.92, shoreNoise);
      float shoreLap = shoreEdge * exposedLap * shoreMask * (1.0 - contact)
        * GARDEN_WATER_LAP_GAIN * uDaylight * uDetail;
      waterColor = mix(waterColor, uHighlightColor, clamp(shoreLap, 0.0,
        ${glslFloat(GARDEN_WATER_SHORE_LAP.maxMix)}));
    }

    float crestFold = -vGerstnerJ + ${glslFloat(GARDEN_WATER_CREST_FOAM.jacobianBias)};
    float crestFoamMask = smoothstep(
      ${glslFloat(GARDEN_WATER_CREST_FOAM.jacobianStart)},
      ${glslFloat(GARDEN_WATER_CREST_FOAM.jacobianEnd)},
      crestFold
    );
    crestFoamMask *= 0.52 * (1.0 - shelter) * (1.0 - uAnnulus);
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

    {
      float boundaryEnabled = smoothstep(0.001, 0.02, boundaryCharacter.x);
      float boundaryBand = (
        1.0 - smoothstep(0.0, max(0.001, boundaryCharacter.x), boundaryDistance)
      ) * boundaryEnabled * regionBlend;
      float boundaryNoise = gardenValueNoise(
        vec2(bodyAlong * 0.035, bodyAcross * 0.025) + float(regionId) * 7.31
      );
      // A value-only bank inside each body's edge; the edge itself is the
      // glassy slick line, never a dotted foam seam.
      waterColor *= 1.0 - boundaryBand * boundaryCharacter.z
        * (0.58 + boundaryNoise * 0.42) * (0.72 + uDetail * 0.28);
      waterColor = mix(waterColor, skySample, slickEdge * 0.12 * (0.4 + 0.6 * uDaylight));

      // Passive dark-core/light-shoulder pairs: both scale existing reflected
      // light. There is no emitted radiance, even in moonless reduced frames.
      waterColor *= 1.0 - riskSurface.x * riskSurface.z * (1.0 - contact);
      waterColor = mix(waterColor, max(waterColor * 1.18, skySample),
        riskSurface.y * riskSurface.z * 0.45 * (1.0 - contact));
    }

    waterColor = mix(
      waterColor,
      uHighlightColor,
      clamp(wakeFoam * uWakeStrength * (0.2 + uDaylight * 0.08), 0.0, 0.26)
    );

    if (uAnnulus < 0.5 && uDaylight + uDusk > 0.001) {
      vec2 fromIslandSun = vWaterPosition - uIslandCenter;
      float sunAlong = dot(fromIslandSun, uSunDir);
      float sunAcross = dot(fromIslandSun, vec2(-uSunDir.y, uSunDir.x));
      float sunSine = max(uSunHeight, 0.08);
      float shadowReach = min(
        GARDEN_TOWER_HEIGHT * sqrt(max(0.0, 1.0 - sunSine * sunSine)) / sunSine,
        GARDEN_TOWER_SHADOW_MAX_REACH
      );
      float shadowT = -sunAlong / max(shadowReach, 1e-4);
      if (shadowT > 0.0 && shadowT < 1.0) {
        float shadowWidth = mix(3.2, 10.0, shadowT);
        float shadowProfile = exp(-(sunAcross * sunAcross) / (shadowWidth * shadowWidth));
        float shadowFade = (1.0 - shadowT) * (1.0 - shadowT);
        float towerShadow = shadowProfile * shadowFade
          * clamp(uDaylight + uDusk * 0.85, 0.0, 1.0) * GARDEN_TOWER_SHADOW_STRENGTH;
        waterColor *= 1.0 - clamp(towerShadow, 0.0, 0.6);
      }
    }

    // View-dependent light lobes use the same filtered complete normal and
    // variance-derived roughness as the mirror, never a separate fine octave.
    if (uAnnulus < 0.5 && uGlitterStrength > 0.001 && uSunHeight > 0.0
      && uDaylight + uDusk > 0.001) {
      float sunCos = sqrt(max(0.0, 1.0 - uSunHeight * uSunHeight));
      vec3 sunWorld = vec3(uSunDir.x * sunCos, uSunHeight, -uSunDir.y * sunCos);
      vec3 sunHalf = sunWorld + viewDirection;
      float sunSpecular = pow(
        clamp(dot(worldSurfaceNormal, sunHalf / max(length(sunHalf), 1e-4)), 0.0, 1.0),
        opticalLobeExponent
      );
      // Drawn, not simulated (§1.1 rule 3): the lobe is broken by a slow
      // world-space sparkle field so a low sun lays scattered glints, never a
      // tiled checker of the normal texture.
      float sunSparkle = smoothstep(0.6, 0.82, gardenValueNoise(
        vWaterPosition * 1.3 + uWindDir * (uTime * 0.05)
      ));
      float sunGlitter = smoothstep(0.4, 0.9, sunSpecular) * sunSparkle
        * (uDaylight + uDusk * 0.4)
        * uGlitterStrength * (1.0 - shelter * 0.65);
      sunGlitter *= clamp(1.0 - cloudCover * uCloudShadowStrength * 2.6, 0.0, 1.0);
      sunGlitter *= 1.0 - smoothstep(170.0, 265.0, camDistance);
      waterColor += uSunGlitterColor * clamp(sunGlitter, 0.0, 1.0) * ${glslFloat(GARDEN_WATER_SUN_GLITTER_GAIN)};
    }

    // K4: the moon road. One column from the eye toward the real moon's
    // azimuth, printed as broken horizontal slats (printmaker-6) — longer
    // near the viewer, shorter toward the horizon — lit by the moon's
    // half-vector lobe so it gathers under the moon and fades toward you.
    if (uMoonLight > 0.001) {
      vec2 moonAzimuth = uMoonDirection.xz / max(length(uMoonDirection.xz), 1e-4);
      vec2 fromEye = vWorldPosition.xz - cameraPosition.xz;
      float roadAlong = max(dot(fromEye, moonAzimuth), 1.0);
      float roadAcross = dot(fromEye, vec2(-moonAzimuth.y, moonAzimuth.x)) / roadAlong;
      // Slat rows in the integral of 1 / (1.6 + 0.02·along), so the pitch
      // widens with distance; a slow drift toward the viewer.
      float slatCoord = 50.0 * log(1.6 + 0.02 * roadAlong) - uTime * 0.12;
      float slatBlur = smoothstep(0.2, 0.45, fwidth(slatCoord));
      if (dot(fromEye, moonAzimuth) > 1.0) {
        float nearRoad = 1.0 - smoothstep(20.0, 220.0, roadAlong);
        float roadWidth = 0.02 + 0.05 * nearRoad;
        float slatRow = floor(slatCoord);
        float slatHalf = roadWidth * (0.35 + 0.65 * gardenHash(vec2(slatRow, 7.0)));
        float slatShift = (gardenHash(vec2(slatRow, 19.0)) - 0.5) * roadWidth * 0.6
          + surfaceNormal.x * 0.012;
        float slatAcross = 1.0 - smoothstep(slatHalf * 0.55, slatHalf, abs(roadAcross - slatShift));
        float slatPhase = fract(slatCoord);
        float slatStroke = smoothstep(0.08, 0.2, slatPhase) * (1.0 - smoothstep(0.52, 0.64, slatPhase));
        slatStroke = mix(slatStroke, 0.42, slatBlur);
        vec3 moonHalf = uMoonDirection + viewDirection;
        float moonLobe = pow(clamp(dot(worldSurfaceNormal,
          moonHalf / max(length(moonHalf), 1e-4)), 0.0, 1.0), min(160.0, opticalLobeExponent));
        float road = slatAcross * slatStroke * (0.25 + 0.75 * moonLobe)
          * smoothstep(4.0, 16.0, roadAlong) * (1.0 - contact);
        waterColor += MOON_ROAD_COLOR * road * uMoonLight * ${glslFloat(GARDEN_WATER_MOON_ROAD_GAIN)};
      }
    }

    if (uAnnulus < 0.5 && uRippleStrength > 0.001) {
      float ripple = 0.0;
      float shotRipple = 0.0;
      for (int ri = 0; ri < ${GARDEN_WATER_MAX_RIPPLE_RINGS}; ri += 1) {
        if (float(ri) >= uRippleCount) break;
        vec4 ring = uRipple[ri];
        vec4 rp = uRippleParams[ri];
        float ringDistance = distance(vWaterPosition, ring.xy);
        if (ringDistance > ring.z + 1.5) continue;
        float innerRadius = ring.z * rp.w;
        // X5: a negative band count is a one-shot pulse started at ring.w.
        float shot = step(rp.x, -0.5);
        float bandCount = abs(rp.x);
        for (int rb = 0; rb < 3; rb += 1) {
          if (float(rb) >= bandCount) break;
          float t = shot > 0.5
            ? (uTime - ring.w) / rp.y - float(rb) * 0.3
            : fract(uTime / rp.y + ring.w + float(rb) / bandCount);
          if (t < 0.0 || t > 1.0) continue;
          float r = mix(innerRadius, ring.z, t);
          float ringCrest = 1.0 - smoothstep(0.0, mix(0.5 + t * 0.9, 0.45 + t * 0.7, shot), abs(ringDistance - r));
          float crest = ringCrest * ringCrest * (1.0 - t) * rp.z;
          ripple += crest * (1.0 - shot);
          shotRipple += crest * shot * (1.0 - 0.6 * float(rb));
        }
      }
      ripple = clamp(ripple * uRippleStrength, 0.0, 1.0);
      waterColor = mix(waterColor, uHighlightColor, ripple * (0.1 + uDaylight * 0.06));
      // A rise is one clean, thin ring of sky on still water: stronger than
      // the standing karesansui trains, which are texture, not events.
      shotRipple = clamp(shotRipple * uRippleStrength, 0.0, 1.0);
      waterColor = mix(waterColor, uHighlightColor, shotRipple * (0.32 + uDaylight * 0.14));
    }
    if (uAnnulus < 0.5) {
    vec2 beamDirection = vec2(cos(uBeaconAngle), sin(uBeaconAngle));
    vec2 fromBeacon = vWaterPosition - uBeaconPosition;
    float beamAlong = dot(fromBeacon, beamDirection);
    float beamAcross = abs(dot(fromBeacon, vec2(-beamDirection.y, beamDirection.x)));
    float beamWidth = mix(0.35, ${glslFloat(GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS * 0.22)},
      clamp(beamAlong / ${glslFloat(GARDEN_LIGHTHOUSE_BEAM_LENGTH)}, 0.0, 1.0));
    float beamReach = smoothstep(2.0, 8.0, beamAlong)
      * (1.0 - smoothstep(
        ${glslFloat(GARDEN_LIGHTHOUSE_BEAM_LENGTH - 6)},
        ${glslFloat(GARDEN_LIGHTHOUSE_BEAM_LENGTH + 2)}, beamAlong));
    float ribbon = 1.0 - smoothstep(beamWidth * 0.35, beamWidth, beamAcross);
    float travellingCrest = aaStep(0.35,
      sin(beamAlong * 1.6 - uTime * 1.8 + surfaceNormal.x * 4.0));
    float terminal = 1.0 - smoothstep(3.0, 10.0,
      abs(beamAlong - ${glslFloat(GARDEN_LIGHTHOUSE_BEAM_POOL_DISTANCE)}));
    float terminalWidth = 1.0 - smoothstep(beamWidth,
      ${glslFloat(GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS)}, beamAcross);
    float brokenGlitter = aaStep(0.72,
      sin(beamAlong * 3.7 - uTime * 0.7)
      * sin(beamAcross * 5.3 + surfaceNormal.y * 8.0));
    float beaconReflection = beamReach * uBeaconStrength
      * (0.65 + uBeaconFlicker * 0.7)
      * (ribbon * (0.12 + travellingCrest * 0.62)
        + terminal * terminalWidth * brokenGlitter * 1.15);

    waterColor += uBeaconColor * clamp(beaconReflection, 0.0, ${glslFloat(GARDEN_WATER_BEACON_CLAMP)});

    vec2 fieldDelta = vWaterPosition - uLaneField.xy;
    if (dot(fieldDelta, fieldDelta) < uLaneField.z * uLaneField.z) {
      // Camera-vertical on the plate, bent downwind. Wind lengthens each
      // reflection without changing the source ordering.
      vec2 reflectionDir = normalize(mix(
        normalize(vec2(0.45, -1.0)),
        uWindDir,
        uWindSpeed * 0.28
      ));
      vec2 reflectionPerp = vec2(-reflectionDir.y, reflectionDir.x);
      float tremble = surfaceNormal.x * (0.7 + uTempo * 0.9);
      vec3 laneAccum = vec3(0.0);
      for (int i = 0; i < ${GARDEN_WATER_MAX_LIGHT_LANES}; i += 1) {
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
        // Point lights paint narrow, broken vertical strokes rather than
        // circular pools. Kind is source stature in the packed header:
        // lantern < raised buoy/window light < lighthouse beacon.
        float sourceHeight = head.w > 1.5
          ? 1.0
          : (head.w > 0.5 ? 0.48 : 0.24);
        float strokeLength = mix(5.0, 18.0, sourceHeight)
          * mix(0.9, 1.28, uWindSpeed);
        float along = dot(d, reflectionDir) + tremble;
        float across = dot(d, reflectionPerp)
          + surfaceNormal.y * mix(0.25, 0.72, uWindSpeed);
        float strokeT = clamp(along / strokeLength, 0.0, 1.0);
        float segmentCount = floor(mix(3.0, 6.0, sourceHeight) + 0.5);
        float segmentPhase = fract(
          strokeT * segmentCount
          + surfaceNormal.x * 0.38
          + surfaceNormal.y * 0.22
        );
        float broken = aaStep(0.16, segmentPhase)
          * (1.0 - aaStep(0.78, segmentPhase));
        float verticalStroke = exp(
          -(across * across) / mix(0.24, 0.72, sourceHeight)
        )
          * aaStep(-0.45, along)
          * (1.0 - aaStep(strokeLength, along))
          * (1.0 - strokeT * 0.7)
          * broken;
        laneAccum += body.rgb * intensity * verticalStroke * 0.72;
      }
      waterColor += clamp(
        laneAccum,
        0.0,
        ${glslFloat(GARDEN_WATER_LANE_CLAMP)}
      );
    }
    }

    // Opaque surrounding sea is drawn first; plate alpha supplies complementary
    // weights over twenty world units, with no uncovered or double-darkened gap.
    float plateAlpha = uAnnulus > 0.5 ? 1.0 : smoothstep(
      0.0, ${glslFloat(SEA_EDGE_CROSSFADE)}, gardenPlateEdgeDistance(vWaterPosition)
    );

    if (plateAlpha < 0.002) discard;
    float waterAlpha = uAnnulus > 0.5 ? 1.0 : mix(0.82, 1.0, fieldDepth);
    gl_FragColor = vec4(waterColor, plateAlpha * waterAlpha);

    // C1: one air for the whole garden, shared with every scene material.
    gl_FragColor.rgb = gardenAerial(gl_FragColor.rgb, vWorldPosition, cameraPosition);
    if (uAnnulus > 0.5) {
      // The far rim meets the dome's lower hemisphere exactly.
      float horizonFade = smoothstep(
        ${glslFloat(SEA_ANNULUS_OUTER_RADIUS * 0.55)},
        ${glslFloat(SEA_ANNULUS_OUTER_RADIUS * 0.94)},
        distance(cameraPosition.xz, vWorldPosition.xz)
      );
      gl_FragColor.rgb = mix(
        gl_FragColor.rgb,
        gardenAirlight(normalize(vWorldPosition - cameraPosition)),
        horizonFade
      );
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

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
      camDistance,
      -viewDirection,
      uPegSummaryEpistemicHaze * riskWater * epistemicMist * (1.0 - uAnnulus)
    );

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
  /** C4 evidence: whether cloud shadows currently shade the garden (shared strength > 0). */
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
 * The detailed Garden Sea plate over a camera-following open sea (W3, the
 * Hour-Print sea). A low-chroma transmitted body under an honest Fresnel
 * mirror of the hour's sky probe; risk carried by static grouped strokes
 * with hue/value a quiet second voice; the
 * tower's recognizable inverted reflection in irregular strips; the real moon's road; hull
 * contact and glassy slicks from the wake field; one breathing lap line at
 * every coast, including the world's own edge. The annulus and inner skirt
 * share the swell clock, sky probe, normal stack and coast, and dissolve into
 * the garden's one air. Reduced motion resets every animation to one static
 * time-zero frame; glitter ships at balanced+ and ripple rings at
 * full/balanced.
 */
export function createGardenWater(waterLevel: number, surfaceAtlas?: GardenSurfaceAtlasOwner): GardenWater {
  const surfaceLease: GardenSurfaceAtlasLease | null = surfaceAtlas?.lease() ?? null;
  const baseColor = DAY_MID.clone();
  const deepColor = DAY_DEEP.clone();
  const highlightColor = DAY_HIGHLIGHT.clone();
  const shallowColor = DAY_SHALLOW.clone();
  const bandColors = [DAY_SHALLOW.clone(), DAY_MID.clone(), DAY_MID.clone(), DAY_DEEP.clone()];
  const envHorizonColor = new Color();
  const envZenithColor = new Color();
  const sunGlitterColor = DAY_CYCLE_LIGHT_PRESETS.day.dirColor.clone();
  const cloudShadows = createGardenCloudShadowSource();
  const regionField = createSeaRegionTextures();
  const normalMap = loadNormalMap();
  // Region character is static data (D6) — colour is resolved per day phase in
  // `update`, but the authored optical envelope stays fixed.
  // Seeded from the fallback table so every slot has a real colour even
  // before (or without) a live theme write — an unset slot renders black.
  const regionColors = SEA_REGION_ORDER.map((name) => new Color(SEA_REGION_FALLBACK_TINT[name]));
  // K7: the probe roughness rides the boundary vector's fourth lane.
  const regionBoundary = SEA_REGION_ORDER.map((name) => {
    const character = SEA_REGION_CHARACTER[name];
    return new Vector4(
      character.boundaryWidthTiles / SEA_REGION_DISTANCE_FULL_SCALE_TILES,
      character.boundaryFoam,
      character.boundaryBank,
      character.probeRoughness,
    );
  });
  const regionParams = SEA_REGION_ORDER.map((name) => {
    const character = SEA_REGION_CHARACTER[name];
    return new Vector3(
      character.depth,
      character.reflectivity,
      character.tintStrength,
    );
  });
  const regionSwell = SEA_REGION_ORDER.map((name) => {
    const character = SEA_REGION_CHARACTER[name];
    return new Vector3(
      character.swell,
      character.chop,
      character.shallowShelf,
    );
  });
  const regionFlow = SEA_REGION_ORDER.map((name) => {
    const character = SEA_REGION_CHARACTER[name];
    return new Vector4(
      Math.cos(character.flowBearing),
      -Math.sin(character.flowBearing),
      character.flowHold,
      character.normalDetail,
    );
  });
  // Maps world XY on the water plane into the field's 0-1 UV space.
  //
  // A tile (tx, ty) sits at world (tx*TILE_SCALE, _, ty*TILE_SCALE), and the
  // plane's -90deg X rotation maps world +Z to local -Y — so the V scale is
  // NEGATIVE. Getting this sign wrong mirrors every region about the equator.
  const regionExtent = regionField.tileSpan * TILE_SCALE_UNITS;
  const regionTransform = new Vector4(0, 0, 1 / regionExtent, -1 / regionExtent);
  const mapSpan = (regionField.tileSpan - 1) * TILE_SCALE_UNITS;
  const plateMargin = GARDEN_WATER_PLATE_MARGIN_TILES * TILE_SCALE_UNITS;
  const plateSize = mapSpan + plateMargin * 2;
  blendGardenSkyColor(envHorizonColor, dayCycleBeats(12), "horizon");
  blendGardenSkyColor(envZenithColor, dayCycleBeats(12), "zenith");
  const uniforms = {
    ...gardenHeightFogUniforms,
    // C1: the garden's one air, shared by reference with every scene material.
    ...gardenAerialUniforms,
    uGardenSurfaceAlbedo: { value: null as Texture | null },
    uGardenSurfaceNormal: { value: null as Texture | null },
    uGardenSurfaceOrm: { value: null as Texture | null },
    uGardenSurfaceAtlasReady: { value: 0 },
    ...surfaceLease?.uniforms,
    uAnnulus: { value: 0 },
    uPlateBounds: {
      value: new Vector4(-plateMargin, -mapSpan - plateMargin, mapSpan + plateMargin, plateMargin),
    },
    uHeroReflection: { value: null as Texture | null },
    uHeroReflectionMatrix: { value: new Matrix4() },
    uHeroReflectionStrength: { value: 0 },
    uHeroReflectionSize: { value: new Vector2(1, 1) },
    uBandColor: { value: bandColors },
    uBeaconAngle: { value: -0.55 },
    uBeaconColor: { value: BEACON_HIGHLIGHT.clone() },
    uBeaconFlicker: { value: 0.5 },
    uBeaconPosition: { value: new Vector2() },
    uBeaconStrength: { value: 0 },
    uCemeteryCenter: { value: new Vector2(1e4, 1e4) },
    // C2(c): the water material shares the exact uniform objects the cloud
    // source exposes, so land/ship consumers stay in sync by construction.
    uCloudShadow: cloudShadows.uniforms.uCloudShadow,
    uCloudShadowStrength: cloudShadows.uniforms.uCloudShadowStrength,
    uCloudShadowTransform: cloudShadows.uniforms.uCloudShadowTransform,
    uDaylight: { value: 1 },
    uDetail: { value: 1 },
    uDusk: { value: 0 },
    uEnvHorizonColor: { value: envHorizonColor },
    uEnvZenithColor: { value: envZenithColor },
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
    // The sun's own bearing on the water, from the shared arc in garden-sun.
    // Before this the water's only notion of the sun was a hand-tuned constant
    // (`normalize(vec3(-0.46, 0.2, 0.86))`) that matched neither the key light
    // nor the sky dome — so the daytime sparkle sat wherever that constant
    // pointed while the shadows fell somewhere else entirely.
    uSunDir: { value: new Vector2(1, 0) },
    /** Sine of the sun's elevation, 0 below the horizon. */
    uSunHeight: { value: 0 },
    // K4: the displayed (real, in-frame) moon from garden-sun / sky-almanac.
    uMoonDirection: { value: new Vector3(0, 1, 0) },
    /** Moon presence × illumination, gated to blue hour and night. */
    uMoonLight: { value: 0 },
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
    uSunGlitterColor: { value: sunGlitterColor },
    uSwell: { value: 0 },
    uTempo: { value: 0.2 },
    uTime: { value: 0 },
    uSurfacePixelRatio: { value: 1 },
    uWaveAmplitude: { value: 0.02 },
    /** W3.1: the hour's sky radiance in the water, per light beat. */
    uSkyRadiance: { value: 1 },
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
    uRegionBoundary: { value: regionBoundary },
    uRegionFlow: { value: regionFlow },
    uRegionParams: { value: regionParams },
    uRegionSwell: { value: regionSwell },
    uRegionTransform: { value: regionTransform },
  };
  const material = new ShaderMaterial({
    // Water is continuous through the chart openings, never a rectangular air veil.
    defines: { GARDEN_AIR_CONTINUOUS_WATER: 1 },
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    uniforms,
    vertexShader: VERTEX_SHADER,
  });
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
  // A hollow eye-centred ring would expose sky beneath the eye. Its inner
  // skirt fills that hole and underlays the plate's translucent edge.
  const annulusMaterial = new ShaderMaterial({
    defines: { GARDEN_AIR_CONTINUOUS_WATER: 1 },
    fragmentShader: FRAGMENT_SHADER,
    vertexShader: VERTEX_SHADER,
    uniforms: { ...uniforms, uAnnulus: { value: 1 } },
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 16,
  });
  const annulusInnerRadius = plateSize * Math.SQRT1_2 + 4;
  const annulus = new Mesh(
    new RingGeometry(annulusInnerRadius, SEA_ANNULUS_OUTER_RADIUS, 48, 24),
    annulusMaterial,
  );
  annulus.name = "garden-sea-annulus";
  annulus.frustumCulled = false;
  annulus.renderOrder = mesh.renderOrder - 2;
  annulus.raycast = () => {};
  const innerSea = new Mesh(new RingGeometry(0, annulusInnerRadius, 48, 8), annulusMaterial);
  innerSea.name = "garden-sea-inner-skirt";
  innerSea.frustumCulled = false;
  innerSea.renderOrder = annulus.renderOrder + 1;
  innerSea.raycast = () => {};
  annulus.add(innerSea);
  mesh.add(annulus);
  // Raw ShaderMaterial does not opt into scene.environment, but Three's
  // program builder will provide its CubeUV defines/chunk when `envMap` is set
  // on the material. Bind immediately before the draw: this follows every
  // cached PMREM swap without a world-renderer wire or a second texture owner.
  type EnvironmentShaderMaterial = ShaderMaterial & { envMap: Texture | null };
  const environmentMaterial = material as EnvironmentShaderMaterial;
  environmentMaterial.envMap = null;
  // W3.1: the beat dose, not the IBL intensity, sets the sky in the sea. The
  // environment's short intensity dip on a probe swap is still honoured, as a
  // ratio to its resting strength, so a rebake never pops in the mirror.
  let beatSkyRadiance = 1;
  let restingEnvironmentIntensity = gardenEnvironmentIntensityForBeats(dayCycleBeats(12));
  const syncSkyRadiance = (environmentIntensity: number, hasProbe: boolean) => {
    const swapDip = hasProbe && restingEnvironmentIntensity > 0
      ? MathUtils.clamp(environmentIntensity / restingEnvironmentIntensity, 0, 1)
      : 1;
    uniforms.uSkyRadiance.value = beatSkyRadiance * swapDip;
  };
  mesh.onBeforeRender = (_renderer, renderScene) => {
    uniforms.uSurfacePixelRatio.value = _renderer.getPixelRatio();
    const nextEnvironment = renderScene.environment;
    if (environmentMaterial.envMap !== nextEnvironment) {
      environmentMaterial.envMap = nextEnvironment;
      uniforms.envMap.value = nextEnvironment;
      // The first probe changes the shader from scalar fallback to CubeUV.
      // Later swaps keep the same mapping/atlas shape and reuse the program.
      material.needsUpdate = true;
    }
    syncSkyRadiance(renderScene.environmentIntensity, nextEnvironment !== null);
  };
  const annulusEnvironmentMaterial = annulusMaterial as EnvironmentShaderMaterial;
  annulusEnvironmentMaterial.envMap = null;
  const annulusEye = new Vector3();
  annulus.onBeforeRender = (_renderer, renderScene, camera) => {
    camera.getWorldPosition(annulusEye);
    annulusEye.y = waterLevel;
    mesh.worldToLocal(annulusEye);
    annulus.position.copy(annulusEye);
    annulus.updateWorldMatrix(false, true);
    const nextEnvironment = renderScene.environment;
    if (annulusEnvironmentMaterial.envMap !== nextEnvironment) {
      annulusEnvironmentMaterial.envMap = nextEnvironment;
      annulusMaterial.needsUpdate = true;
    }
    annulusMaterial.uniforms.envMap!.value = nextEnvironment;
    syncSkyRadiance(renderScene.environmentIntensity, nextEnvironment !== null);
  };

  // Karesansui ripple-ring emitters (C2(d)). The island and the outlying
  // islets self-register when their centers arrive; other lanes register dock
  // pylons, moored ships, and garden islets through the same API.
  const rippleEmitters = new Map<string, {
    bands: 2 | 3;
    /** X5: a pulse rises once from its start (`phase` holds the start clock). */
    oneShot?: boolean;
    centerX: number;
    centerY: number;
    innerFraction: number;
    periodSeconds: number;
    phase: number;
    radius: number;
    strength: number;
  }>();
  const syncRippleUniforms = () => {
    // T0.7 (2026-09-07): there are more claimants (island + islets + docks +
    // pigeonnier + moored ships) than the 12 uniform slots, and this used to
    // fill them in Map INSERTION order and silently drop the rest — so which
    // rings rendered depended on registration timing and changed between runs.
    // Rank by authored contrast, id as the tie-break: the twelve that draw are
    // the twelve that read strongest, and they are the same twelve every time.
    const ranked = [...rippleEmitters.entries()]
      .sort(([idA, a], [idB, b]) => Number(b.oneShot === true) - Number(a.oneShot === true)
        || b.strength - a.strength || idA.localeCompare(idB))
      .slice(0, GARDEN_WATER_MAX_RIPPLE_RINGS);
    let index = 0;
    for (const [, emitter] of ranked) {
      uniforms.uRipple.value[index]!.set(
        emitter.centerX,
        emitter.centerY,
        emitter.radius,
        emitter.phase,
      );
      uniforms.uRippleParams.value[index]!.set(
        // Negative band count marks a one-shot pulse for the shader.
        emitter.oneShot ? -emitter.bands : emitter.bands,
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
    pulseRing(ring) {
      const now = uniforms.uTime.value;
      // Reduced motion freezes the clock at 0: no ring rises.
      if (!(now > 0)) return;
      rippleEmitters.set(ring.id, {
        bands: 2,
        centerX: ring.center.x,
        centerY: -ring.center.z,
        innerFraction: 0.02,
        oneShot: true,
        periodSeconds: Math.max(0.001, ring.periodSeconds),
        phase: now,
        radius: Math.max(0.001, ring.radius),
        strength: MathUtils.clamp(ring.strength, 0, 1),
      });
      syncRippleUniforms();
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
      annulus.geometry.dispose();
      innerSea.geometry.dispose();
      annulusMaterial.dispose();
      regionField.field.dispose();
      regionField.distance.dispose();
      cloudShadows.texture.dispose();
      normalMap?.dispose();
      surfaceLease?.release();
      // External lane/wake textures keep their own lifecycle; only release
      // this material's references to them.
      uniforms.uLaneTexture.value = null;
      uniforms.uWakeMap.value = null;
      uniforms.uNormalMap.value = null;
      uniforms.uHeroReflection.value = null;
      uniforms.envMap.value = null;
      environmentMaterial.envMap = null;
      annulusEnvironmentMaterial.envMap = null;
      rippleEmitters.clear();
    },
    cloudShadowsOn() {
      return cloudShadows.uniforms.uCloudShadowStrength.value > 0.001;
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
      // No `garden.islet.cemetery` ring: see the isletLine note above. The
      // cemetery centre still drives the shallow shelf through uCemeteryCenter.
      setDefaultRing("garden.islet.pigeonnier", pigeonnier, 10, 2, 9, 0.45, 0.5);
    },
    setLaneState(texture, activeLaneCount, fieldBounds) {
      uniforms.uLaneTexture.value = texture;
      // W0 knockout seam: `water-lanes` removes every light/ember reflection
      // so the preview can measure the sea without them (debug builds only).
      uniforms.uLaneCount.value = isKnockedOut("water-lanes") ? 0 : activeLaneCount;
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
      // live day-blended colour, retained as a quiet admixture so the authored
      // body dye and the theme bridge continue to share one slot.
      for (const zone of zones) {
        const slot = zone.regionId;
        if (slot === undefined || slot <= 0 || slot >= SEA_REGION_COUNT) continue;
        const name = SEA_REGION_ORDER[slot]!;
        const character = SEA_REGION_CHARACTER[name];
        // The character's authored dye carries the requested body identity;
        // a small live-theme admixture keeps day-cycle palette continuity.
        // K7: hue is the second voice — the strength is the character's
        // quiet dye (~0.25), never raised back by a legacy zone strength.
        regionColors[slot]!.set(character.tint).lerp(zone.color, 0.18);
        uniforms.uRegionParams.value[slot]!.z = character.tintStrength;
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
      // The scalar sky fallback follows the five-beat dome; the sun glitter
      // tint follows the light rig.
      const beats = dayCycleBeats(frame.wallClockHour);
      blendGardenSkyColor(envHorizonColor, beats, "horizon");
      blendGardenSkyColor(envZenithColor, beats, "zenith");
      blendDayCycleColor(
        sunGlitterColor,
        DAY_CYCLE_LIGHT_PRESETS.night.dirColor,
        DAY_CYCLE_LIGHT_PRESETS.golden.dirColor,
        DAY_CYCLE_LIGHT_PRESETS.day.dirColor,
        dusk,
        daylight,
      );
      // W3.1 (water-1e): the score's five beats dose the sky in the sea.
      beatSkyRadiance = beats.dawn * GARDEN_WATER_SKY_RADIANCE.dawn
        + beats.day * GARDEN_WATER_SKY_RADIANCE.day
        + beats.golden * GARDEN_WATER_SKY_RADIANCE.golden
        + beats.blue * GARDEN_WATER_SKY_RADIANCE.blue
        + beats.night * GARDEN_WATER_SKY_RADIANCE.night;
      restingEnvironmentIntensity = gardenEnvironmentIntensityForBeats(beats);
      uniforms.uSkyRadiance.value = beatSkyRadiance;
      // K4: the real moon (one answer shared with the dome and the key). Its
      // road belongs to blue hour and night; a daytime moon lays none.
      gardenMoonPose(frame.wallClockHour, scratchMoonPose);
      uniforms.uMoonDirection.value.copy(scratchMoonPose.direction);
      uniforms.uMoonLight.value = scratchMoonPose.direction.y > 0
        ? MathUtils.clamp(scratchMoonPose.moonLight ?? 0, 0, 1)
          * MathUtils.clamp(beats.night + beats.blue * 0.5, 0, 1)
        : 0;

      // S1: `interaction` is a camera-movement signal, not a load tier — the
      // sea reads it as `balanced` so moving the camera no longer strips the
      // water's character. See `seaQualityTier`.
      const tier = seaQualityTier(frame.renderScheduler);
      const balancedOrBetter = tier === "full" || tier === "balanced";
      // Guardrails: sun glitter ships at balanced+; ripple rings at
      // full/balanced. Lower tiers keep the graceful fallbacks. The cloud
      // drift keeps integrating so the shared transform stays continuous for
      // every consumer, but nothing shades with it (see the source below).
      cloudShadows.update({
        reducedMotion: frame.reducedMotion,
        tier,
        timeSeconds: frame.timeSeconds,
        ...(weather ? { wind: weather.wind, stormLevel: weather.stormLevel } : {}),
      });

      // S2: ease the tier-driven uniforms instead of stepping them.
      //
      // Even with `interaction` neutralised, a load-tier change (balanced ->
      // recovery on a weaker machine, where the ladder's downshift streak is
      // only 2 frames) still swings uDetail 1 -> 0.36 and switches glitter
      // off. Stepping that is a visible flash; the hysteresis
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
      // carry the cue below) and eases on the same S2 curve so a tier
      // crossing fades rather than pops.
      const targetWake = balancedOrBetter ? 1 : 0;
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

      uniforms.uDaylight.value = daylight;
      uniforms.uDusk.value = dusk;
      uniforms.uNight.value = night;
      uniforms.uSwell.value = MathUtils.clamp(frame.seaState.swell, 0, 1);
      uniforms.uTempo.value = MathUtils.clamp(frame.seaState.tempo, 0, 1);
      uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      // X5: a one-shot ring leaves once its second crest has run out (or the
      // clock went back past its start: reduced motion, a reset).
      let expired = false;
      for (const [id, emitter] of rippleEmitters) {
        if (!emitter.oneShot) continue;
        const age = uniforms.uTime.value - emitter.phase;
        if (age < 0 || age > emitter.periodSeconds * 1.3) {
          rippleEmitters.delete(id);
          expired = true;
        }
      }
      if (expired) syncRippleUniforms();
      // Phase 2 weather: the wind bearing rotates the swell field (world XZ →
      // water-local XY, where +Z world is -Y local), the sustained wind
      // steepens the chop, and the storm raises amplitude — capped at the
      // displacement budget that keeps the crests below the zone-root plane.
      const stormLevel = MathUtils.clamp(weather?.stormLevel ?? 0, 0, 1);
      uniforms.uWindDir.value.set(
        weather?.wind.x ?? GARDEN_DEFAULT_WIND_X,
        -(weather?.wind.y ?? GARDEN_DEFAULT_WIND_Z),
      );
      uniforms.uWindSpeed.value = MathUtils.clamp(weather?.wind.speed ?? 0, 0, 1);
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
    // Cloud shadows fall only from clouds the sky draws overhead. The sky has
    // no cloud field over the garden (only distant billboard cumulus), so the
    // shared strength stays 0 and water, island and ships all read an
    // unshadowed sky; a sky cover value is what raises it.
    uCloudShadowStrength: { value: 0 },
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
    update({ reducedMotion, tier, timeSeconds, wind, stormLevel }) {
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
      const dirX = wind?.x ?? GARDEN_DEFAULT_WIND_X;
      const dirZ = wind?.y ?? GARDEN_DEFAULT_WIND_Z;
      // World-units-per-second advection: a light breeze holds the historical
      // ~0.18 u/s; a full storm drives the scud at ~4x that.
      const speed = 0.06 + (wind?.speed ?? 0.4) * 0.3 + (stormLevel ?? 0) * 0.22;
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

function loadNormalMap(): Texture | null {
  // The renderer only mounts behind the desktop gate; unit tests run in a
  // DOM-less environment where no image can load, so skip it there.
  if (typeof document === "undefined") return null;
  const texture = new TextureLoader().load(GARDEN_WATER_NORMAL_MAP_URL);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
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
