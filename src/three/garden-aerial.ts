import {
  Color,
  ShaderChunk,
  ShaderLib,
  Vector2,
  Vector3,
  type Material,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DayCycleBeats, DayCyclePhase } from "./garden-day-cycle";

/**
 * W2.3 (plan K5, sky-2, critic-4, art-director-3, printmaker-4, pharos-8): ONE air.
 *
 * Every fogged material in the scene — built-in lit/unlit materials through three's own
 * fog chunks, the water through an explicit call — fades toward the same view-direction
 * airlight with the same height-falloff extinction. It replaces the linear `THREE.Fog`
 * mix and the far-bank height-fog double mix. `scene.fog` stays a `Fog` only so the
 * `USE_FOG` define and its fitted near/far ladder (read by the keyline and the fleet's
 * chroma restraint) survive; its colour no longer drives a shader.
 *
 * - Extinction: optical depth integrates `density · exp(-falloff · height)` along the
 *   eye ray past a clean near field (`start`), and blue extinguishes first.
 * - Airlight: the dome's colour at elevation 0 for the ray's azimuth — the solar and
 *   anti-solar horizons blended by PrintSkyDome's own law — so the far sea, the far
 *   plate and the lower dome are one colour.
 * - Desaturation by transmittance; the printmaker's two inks (a cool air ink near, the
 *   horizon colour far).
 * - Rung 3 (O15): transmittance quantised into three soft steps on OBJECT materials
 *   only. The water and the dome call the smooth variant — steps there would band.
 * - Kasumi (K6): a dawn-only low band keyed to solar elevation, spatially uniform
 *   (camera-distance keyed, never a place), so it cannot counterfeit a stale bank.
 * - Parameters for other lanes: beacon-lit mist (pharos-8), the arrival veil (W6.1),
 *   the whole-map plate haze (W3.10).
 *
 * All of it is ONE struct uniform whose value is a plain object shared by reference:
 * three's uniform cloning copies non-math values by reference, so the single CPU write
 * in `updateGardenAerial` reaches every program, including the built-in materials whose
 * ShaderLib uniforms are cloned per program.
 */

export interface GardenAirState {
  /** Luminance extinction per world unit at sea level. */
  density: number;
  /** Clean near field: no air along the first `start` units of a ray. */
  start: number;
  /** Height falloff of the air's density, per world unit. */
  falloff: number;
  seaLevel: number;
  /** Unit vector toward the sun (the airlight's side). */
  sunDir: Vector3;
  /** Airlight at elevation 0 on the sun side / the anti-sun side. */
  airSun: Color;
  airAnti: Color;
  /** View-averaged airlight (CPU consumers: horizon ridges, fleet ink). */
  airlight: Color;
  /** printmaker-4 cool air ink and its weight. */
  airInk: Color;
  inkAmount: number;
  /** Rung-3 stepped air, 0..1 (object materials only). */
  steps: number;
  /** K6 dawn low band: added sea-level density and its height scale. */
  dawnBand: number;
  dawnHeight: number;
  /** W6.1 arrival air-veil multiplier on the air above the sea-fog height. */
  veil: number;
  /** pharos-8 beacon-lit mist. */
  beaconWorld: Vector3;
  beaconAir: number;
  beaconBeamDir: Vector2;
  beaconColor: Color;
  /** W3.10 whole-map plate haze weight and the plate's world XZ bounds. */
  plateHaze: number;
  /** Ichimonji weight, 0..1: full at the rest view, gone at the whole-map floor. */
  ichimonji: number;
  plateMin: Vector2;
  plateMax: Vector2;
}

export const GARDEN_AIR: GardenAirState = {
  density: 0,
  start: 150,
  falloff: 0.035,
  seaLevel: 0,
  sunDir: new Vector3(0, 1, 0),
  airSun: new Color(0xd6dbe2),
  airAnti: new Color(0xd6dbe2),
  airlight: new Color(0xd6dbe2),
  airInk: new Color(HARBOR_PALETTE.fog_blue),
  inkAmount: 0,
  steps: 1,
  dawnBand: 0,
  dawnHeight: 2.5,
  veil: 1,
  beaconWorld: new Vector3(),
  beaconAir: 0,
  beaconBeamDir: new Vector2(1, 0),
  beaconColor: new Color(HARBOR_PALETTE.lantern_warm),
  plateHaze: 0,
  ichimonji: 1,
  plateMin: new Vector2(-11.31, -11.31),
  plateMax: new Vector2(207.89, 207.89),
};

export const gardenAerialUniforms = {
  uGardenAir: { value: GARDEN_AIR },
};

/** Rung-3 stepped air is authored ON (operator decision O15). */
export const GARDEN_AIR_STEPS = 1;
/** Luminance transmittance the fitted ladder reaches at the scene fog's far distance. */
export const GARDEN_AIR_FAR_TRANSMITTANCE = 0.34;
/** The clean near field ends at this fraction of the fitted near distance. */
export const GARDEN_AIR_START_FRACTION = 0.8;
/** Per-channel extinction: blue goes first, far darks go blue (sky-2, normalised to luminance). */
export const GARDEN_AIR_EXTINCTION_RGB = [0.867, 1.0, 1.311] as const;
/**
 * sky-2 `seaDim`: the air sits under the sky by day (sky-2 asked 0.90; 0.85 keeps
 * the far band off the cream wall at the rest seat), lower at golden, above the
 * glow line at night.
 */
export const GARDEN_AIR_SEA_DIM = { day: 0.85, golden: 0.81, night: 1.1 } as const;
/** Ichimonji: a 2–3 px darkening straddling the sea horizon, gain 0.06. */
export const GARDEN_ICHIMONJI = { gain: 0.06, centre: -0.0015, halfWidth: 0.0035 } as const;
/** K6 dawn band: peak added density (per unit, at sea level). */
export const GARDEN_DAWN_BAND_DENSITY = 0.0025;

const n = (value: number): string => (Number.isInteger(value) ? value.toFixed(1) : String(value));
const [EXT_R, EXT_G, EXT_B] = GARDEN_AIR_EXTINCTION_RGB;

/**
 * Uniform declaration and the air functions. Guarded, so a shader may include it
 * explicitly and still pull three's (replaced) fog chunks without duplicate symbols.
 */
export const GARDEN_AERIAL_GLSL_PARS = /* glsl */ `
#ifndef GARDEN_AERIAL_PARS
#define GARDEN_AERIAL_PARS
struct GardenAir {
  float density;
  float start;
  float falloff;
  float seaLevel;
  vec3 sunDir;
  vec3 airSun;
  vec3 airAnti;
  vec3 airInk;
  float inkAmount;
  float steps;
  float dawnBand;
  float dawnHeight;
  float veil;
  vec3 beaconWorld;
  float beaconAir;
  vec2 beaconBeamDir;
  vec3 beaconColor;
  float plateHaze;
  float ichimonji;
  vec2 plateMin;
  vec2 plateMax;
};
uniform GardenAir uGardenAir;

// PrintSkyDome's side law: the same weight the dome uses between its horizons.
float gardenAirSunSide(vec3 dir) {
  float dl = length(dir.xz);
  float sl = length(uGardenAir.sunDir.xz);
  if (dl < 1e-4 || sl < 1e-4) return 0.5;
  float a = dot(dir.xz / dl, uGardenAir.sunDir.xz / sl);
  return pow(smoothstep(-0.3, 1.0, a), 1.5);
}

vec3 gardenAirlightBase(vec3 dir) {
  return mix(uGardenAir.airAnti, uGardenAir.airSun, gardenAirSunSide(dir));
}

float gardenIchimonji(float dirY) {
  return 1.0 - ${n(GARDEN_ICHIMONJI.gain)} * uGardenAir.ichimonji
    * (1.0 - smoothstep(0.0, ${n(GARDEN_ICHIMONJI.halfWidth)}, abs(dirY - (${n(GARDEN_ICHIMONJI.centre)}))));
}

/** The air at elevation 0 for this azimuth, with the ichimonji line (sea and dome). */
vec3 gardenAirlight(vec3 dir) {
  return gardenAirlightBase(dir) * gardenIchimonji(dir.y);
}

// Mean of exp(-k h) along a straight ray between heights a and b (both >= 0).
float gardenAirMean(float a, float b, float k) {
  float dh = b - a;
  if (abs(k * dh) < 1e-3) return exp(-k * 0.5 * (a + b));
  return (exp(-k * a) - exp(-k * b)) / (k * dh);
}

/** Luminance optical depth between the eye and a world point. */
float gardenAirDepth(vec3 worldPos, vec3 cameraPos) {
  float path = max(distance(worldPos, cameraPos) - uGardenAir.start, 0.0);
  float hc = max(cameraPos.y - uGardenAir.seaLevel, 0.0);
  float hp = max(worldPos.y - uGardenAir.seaLevel, 0.0);
  float air = uGardenAir.density * uGardenAir.veil * gardenAirMean(hc, hp, uGardenAir.falloff);
  float dawn = uGardenAir.dawnBand
    * gardenAirMean(hc, hp, 1.0 / max(uGardenAir.dawnHeight, 0.1));
  return (air + dawn) * path;
}

vec3 gardenAerialTransmittance(vec3 worldPos, vec3 cameraPos) {
  return exp(-gardenAirDepth(worldPos, cameraPos) * vec3(${n(EXT_R)}, ${n(EXT_G)}, ${n(EXT_B)}));
}

float gardenAirPlateOutside(vec2 xz) {
  vec2 outside = max(uGardenAir.plateMin - xz, vec2(0.0)) + max(xz - uGardenAir.plateMax, vec2(0.0));
  return length(outside);
}

vec3 gardenAerialCore(vec3 color, vec3 worldPos, vec3 cameraPos, float stepped, float ichimonji) {
  vec3 ray = worldPos - cameraPos;
  vec3 dir = ray / max(length(ray), 1e-4);
  vec3 T = gardenAerialTransmittance(worldPos, cameraPos);
  float Tl = dot(T, vec3(0.2126, 0.7152, 0.0722));
  if (stepped > 0.0) {
    // printmaker-4 rung 3: three soft plateaus of air, risers 40 % of a step.
    float f = 1.0 - Tl;
    float s = f * 3.0;
    float fs = min((floor(s) + smoothstep(0.3, 0.7, fract(s))) / 3.0, 1.0);
    float Ts = 1.0 - mix(f, fs, stepped);
    T = clamp(T * (Ts / max(Tl, 1e-4)), 0.0, 1.0);
    Tl = Ts;
  }
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, mix(0.5, 1.0, Tl));
  vec3 air = gardenAirlightBase(dir);
  // Two inks: the cool air ink between viewer and object, the horizon colour far.
  vec3 inked = mix(air, uGardenAir.airInk, uGardenAir.inkAmount);
  air = mix(inked, air, smoothstep(0.55, 1.0, 1.0 - Tl));
  air *= mix(1.0, gardenIchimonji(dir.y), ichimonji);
  vec3 result = color * T + air * (1.0 - T);
  // pharos-8: the beacon warms its own air, inside 1.5 tower heights.
  if (uGardenAir.beaconAir > 0.0) {
    vec3 fromBeacon = worldPos - uGardenAir.beaconWorld;
    float beaconDistance = length(fromBeacon);
    float beamLen = length(fromBeacon.xz);
    float beamAlign = beamLen > 1e-3
      ? max(dot(fromBeacon.xz / beamLen, uGardenAir.beaconBeamDir), 0.0)
      : 1.0;
    float beacon = uGardenAir.beaconAir
      * exp(-beaconDistance / 18.0)
      * (1.0 - smoothstep(32.0, 48.0, beaconDistance))
      * (1.0 + 0.5 * beamAlign * beamAlign);
    result += min(uGardenAir.beaconColor * beacon * (1.0 - Tl), vec3(0.03));
  }
  // W3.10: at the chart the world beyond the plate is air, never a skirt.
  if (uGardenAir.plateHaze > 0.0) {
    result = mix(result, gardenAirlightBase(dir),
      uGardenAir.plateHaze * smoothstep(0.0, 30.0, gardenAirPlateOutside(worldPos.xz)));
  }
  return result;
}

/** Smooth air for the water and any surface that must not band. */
vec3 gardenAerial(vec3 color, vec3 worldPos, vec3 cameraPos) {
  return gardenAerialCore(color, worldPos, cameraPos, 0.0, 1.0);
}

/** Stepped air for object materials (what three's fog chunk now runs). */
vec3 gardenAerialObject(vec3 color, vec3 worldPos, vec3 cameraPos) {
  return gardenAerialCore(color, worldPos, cameraPos, uGardenAir.steps, 0.0);
}
#endif
`;

// --- Three's fog chunks, replaced once for every fogged material ----------------

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vGardenAirWorld;
#endif
`;

// World position from view space works for every vertex program that runs
// fog_vertex (sprites have no "transformed"): the view matrix is rigid.
const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vGardenAirWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif
`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vGardenAirWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${GARDEN_AERIAL_GLSL_PARS}
#endif
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = gardenAerialObject(gl_FragColor.rgb, vGardenAirWorld, cameraPosition);
#endif
`;

let installed = false;

/**
 * Installs the air into three's fog chunks and hands the shared struct to every
 * built-in program (ShaderLib uniforms are cloned per program; the struct value is
 * shared by reference). Idempotent; runs at module load, before any compile.
 */
export function installGardenAerial(): void {
  if (installed) return;
  installed = true;
  ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX;
  ShaderChunk.fog_vertex = FOG_VERTEX;
  ShaderChunk.fog_pars_fragment = FOG_PARS_FRAGMENT;
  ShaderChunk.fog_fragment = FOG_FRAGMENT;
  for (const shader of Object.values(ShaderLib)) {
    if (shader.uniforms && "fogColor" in shader.uniforms) {
      shader.uniforms.uGardenAir = gardenAerialUniforms.uGardenAir;
    }
  }
}

installGardenAerial();

// --- Shared material-patch chain (K5) -------------------------------------------

export interface GardenMaterialPatch {
  /** Stable id; a second chain with the same key is a no-op. */
  key: string;
  compile: (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void;
}

const patchedKeys = new WeakMap<Material, Set<string>>();

/**
 * Composes a shader patch onto a material without clobbering earlier ones: the
 * previous `onBeforeCompile` runs first, and the program cache key gains `|key`
 * (evaluated lazily, so later patches still see earlier keys).
 */
export function chainGardenMaterialPatch(material: Material, patch: GardenMaterialPatch): void {
  // Not userData: Material.clone() copies userData but not onBeforeCompile, so a
  // clone must not inherit "already patched".
  let keys = patchedKeys.get(material);
  if (!keys) patchedKeys.set(material, keys = new Set());
  if (keys.has(patch.key)) return;
  keys.add(patch.key);
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    patch.compile(shader, renderer);
  };
  material.customProgramCacheKey = () => `${previousCacheKey.call(material)}|${patch.key}`;
  material.needsUpdate = true;
}

// --- Writers ----------------------------------------------------------------------

/** pharos-8: written each frame by the lighthouse (PrintPharos). Allocation-free. */
export function setGardenAerialBeacon(
  x: number,
  y: number,
  z: number,
  air: number,
  beamDirX: number,
  beamDirZ: number,
): void {
  GARDEN_AIR.beaconWorld.set(x, y, z);
  GARDEN_AIR.beaconAir = Number.isFinite(air) ? Math.max(0, air) : 0;
  const length = Math.hypot(beamDirX, beamDirZ);
  if (length > 1e-6) GARDEN_AIR.beaconBeamDir.set(beamDirX / length, beamDirZ / length);
}

/** W6.1 arrival air veil: a multiplier on the air above the sea-fog height. */
export function setGardenAerialVeil(multiplier: number): void {
  GARDEN_AIR.veil = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}

/** W3.10 whole-map plate haze weight (0 at rest). */
export function setGardenAerialPlateHaze(weight: number): void {
  GARDEN_AIR.plateHaze = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 0;
}

export interface GardenAerialFrame {
  phase: DayCyclePhase;
  beats: DayCycleBeats;
  /** Dome colour at elevation 0 toward / away from the sun. */
  solarHorizon: Color;
  antiHorizon: Color;
  sunDir: Vector3;
  /** Solar elevation in radians (the dawn band's key). */
  solarElevation: number;
  /** Wall-clock hour: the dawn band is a morning band only. */
  hour: number;
  eye: { x: number; y: number; z: number };
  /** The fitted air ladder (scene fog near/far), already clarity-scaled. */
  near: number;
  far: number;
  seaLevel: number;
  /** Signed PSI clarity −1…+1 (data-poetry-1). */
  clarity: number;
  /** Sine of the top row's elevation (garden-sky `gardenSkyVisibleHeight`). */
  skyVisibleHeight: number;
  /** Storm weather, 0..1: thickens the air, never recolours it. */
  storm?: number;
}

const DEG = Math.PI / 180;
const INK_GOLDEN = new Color(HARBOR_PALETTE.fog_blue);
const INK_DAWN = new Color(HARBOR_PALETTE.fog_pale);

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** CPU twin of the shader's `gardenAirMean`. */
export function gardenAirMean(a: number, b: number, k: number): number {
  const dh = b - a;
  if (Math.abs(k * dh) < 1e-3) return Math.exp(-k * 0.5 * (a + b));
  return (Math.exp(-k * a) - Math.exp(-k * b)) / (k * dh);
}

/**
 * K6 dawn band weight: only while the sun is between −6° and +10°, only before
 * noon, and spatially uniform (it keys nothing but the sun).
 */
export function gardenDawnBandWeight(solarElevation: number, hour: number): number {
  if (hour >= 12) return 0;
  return smoothstep(-6 * DEG, -1 * DEG, solarElevation) * (1 - smoothstep(4 * DEG, 10 * DEG, solarElevation));
}

/** Luminance transmittance of the air between the eye and a point (CPU twin). */
export function gardenAerialTransmittance(
  state: Pick<GardenAirState, "density" | "start" | "falloff" | "seaLevel" | "dawnBand" | "dawnHeight" | "veil">,
  eye: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number },
): number {
  const path = Math.max(Math.hypot(point.x - eye.x, point.y - eye.y, point.z - eye.z) - state.start, 0);
  const hc = Math.max(eye.y - state.seaLevel, 0);
  const hp = Math.max(point.y - state.seaLevel, 0);
  const air = state.density * state.veil * gardenAirMean(hc, hp, state.falloff);
  const dawn = state.dawnBand * gardenAirMean(hc, hp, 1 / Math.max(state.dawnHeight, 0.1));
  return Math.exp(-(air + dawn) * path);
}

/**
 * One allocation-free write per frame. The density is FITTED to the eye: the ray
 * from the eye to sea level at the ladder's far distance keeps
 * `GARDEN_AIR_FAR_TRANSMITTANCE` (scaled by clarity), whatever the eye height — so
 * the far plate dissolves at the whole-map pull-out exactly as at the seat.
 */
export function updateGardenAerial(frame: GardenAerialFrame): void {
  const { phase, beats } = frame;
  const clarity = Math.min(1, Math.max(-1, Number.isFinite(frame.clarity) ? frame.clarity : 0));
  const storm = Math.min(1, Math.max(0, frame.storm ?? 0));
  // Clear air is earned (K39): positive clarity lifts the air, negative thickens it.
  const farT = Math.min(0.5, Math.max(0.04,
    GARDEN_AIR_FAR_TRANSMITTANCE + 0.1 * Math.max(clarity, 0) - 0.13 * Math.max(-clarity, 0) - 0.08 * storm,
  ));
  const start = Math.max(20, frame.near * GARDEN_AIR_START_FRACTION);
  const span = Math.max(30, frame.far - start);
  GARDEN_AIR.falloff = 0.035;
  GARDEN_AIR.seaLevel = frame.seaLevel;
  const eyeHeight = Math.max(frame.eye.y - frame.seaLevel, 0);
  GARDEN_AIR.start = start;
  GARDEN_AIR.density = -Math.log(farT) / (span * gardenAirMean(eyeHeight, 0, GARDEN_AIR.falloff));
  GARDEN_AIR.steps = GARDEN_AIR_STEPS;
  // Same gate as the dome's line: the ichimonji belongs to the low rest view.
  GARDEN_AIR.ichimonji = smoothstep(0.11, 0.18, frame.skyVisibleHeight);
  GARDEN_AIR.sunDir.copy(frame.sunDir);

  // sky-2 seaDim: under the sky by day, a little lower at golden, above it at night.
  const seaDim = GARDEN_AIR_SEA_DIM.day * phase.daylight
    + GARDEN_AIR_SEA_DIM.golden * phase.dusk
    + GARDEN_AIR_SEA_DIM.night * phase.night;
  const weight = phase.daylight + phase.dusk + phase.night;
  const dim = weight > 1e-6 ? seaDim / weight : GARDEN_AIR_SEA_DIM.day;
  GARDEN_AIR.airSun.copy(frame.solarHorizon).multiplyScalar(dim);
  GARDEN_AIR.airAnti.copy(frame.antiHorizon).multiplyScalar(dim);
  GARDEN_AIR.airlight.copy(GARDEN_AIR.airSun).lerp(GARDEN_AIR.airAnti, 0.5);

  // printmaker-4 two inks: golden air is violet-grey under a gold sky; dawn air pale.
  const golden = beats.golden;
  const dawn = beats.dawn;
  const inkWeight = golden + dawn;
  if (inkWeight > 1e-4) {
    GARDEN_AIR.airInk.copy(INK_GOLDEN).lerp(INK_DAWN, dawn / inkWeight);
  }
  GARDEN_AIR.inkAmount = golden * 0.65 + dawn * 0.5;

  // K6: dawn-only low band keyed to solar elevation, spatially uniform.
  GARDEN_AIR.dawnBand = GARDEN_DAWN_BAND_DENSITY * gardenDawnBandWeight(frame.solarElevation, frame.hour);
}
