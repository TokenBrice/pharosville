import {
  Color,
  ShaderChunk,
  ShaderLib,
  Vector2,
  Vector3,
  Material,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import { gardenSkyToday, gardenSolarHourAngle, type GardenSkyDay } from "../systems/sky-almanac";
import type { DayCyclePhase } from "./garden-day-cycle";
import {
  GARDEN_ATMOSPHERE, GARDEN_ATMOSPHERE_GLSL,
  writeGardenAtmosphereCoefficients, writeGardenAtmosphereSky,
  writeGardenAtmosphereTransmittance,
} from "./garden-atmosphere";

/** One shared analytic atmosphere for built-in materials, water and the dome.
 * scene.fog remains a visibility/chroma metadata ladder, not an extinction fit.
 * Local stale-source banks remain exclusively owned by garden-height-fog. */

export interface GardenAirState {
  rayleigh: Vector3;
  mie: Vector3;
  radiance: number;
  daylight: number;
  seaLevel: number;
  /** Unit vector toward the sun (the airlight's side). */
  sunDir: Vector3;
  /** Airlight at elevation 0 on the sun side / the anti-sun side. */
  airSun: Color;
  airAnti: Color;
  /** Unscattered twilight basis; the shader mixes analytic air exactly once. */
  twilightSun: Color;
  twilightAnti: Color;
  /** View-averaged airlight (CPU consumers: horizon ridges, fleet ink). */
  airlight: Color;
  /** Displayed accepted signed PSI clarity, shared with the PMREM key. */
  clarity: number;
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
  rayleigh: new Vector3(...GARDEN_ATMOSPHERE.rayleigh),
  mie: new Vector3().setScalar(GARDEN_ATMOSPHERE.mieClear),
  radiance: GARDEN_ATMOSPHERE.radiance,
  daylight: 0,
  seaLevel: 0,
  sunDir: new Vector3(0, 1, 0),
  airSun: new Color(0xd6dbe2),
  airAnti: new Color(0xd6dbe2),
  twilightSun: new Color(0xd6dbe2),
  twilightAnti: new Color(0xd6dbe2),
  airlight: new Color(0xd6dbe2),
  clarity: 0,
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

/** Ichimonji: a 2–3 px darkening straddling the sea horizon, gain 0.06. */
export const GARDEN_ICHIMONJI = { gain: 0.06, centre: -0.0015, halfWidth: 0.0035 } as const;
/**
 * Shared true-hour drift retained for the light rig and print-ink consumers.
 */
const GARDEN_DAY_DRIFT_SPAN = 0.7;

const n = (value: number): string => (Number.isInteger(value) ? value.toFixed(1) : String(value));

/**
 * Uniform declaration and the air functions. Guarded, so a shader may include it
 * explicitly and still pull three's (replaced) fog chunks without duplicate symbols.
 */
export const GARDEN_AERIAL_GLSL_PARS = /* glsl */ `
#ifndef GARDEN_AERIAL_PARS
#define GARDEN_AERIAL_PARS
${GARDEN_ATMOSPHERE_GLSL}
struct GardenAir {
  vec3 rayleigh;
  vec3 mie;
  float radiance;
  float daylight;
  float seaLevel;
  vec3 sunDir;
  vec3 twilightSun;
  vec3 twilightAnti;
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
  vec3 nightAir = mix(uGardenAir.twilightAnti, uGardenAir.twilightSun, gardenAirSunSide(dir));
  if (uGardenAir.daylight <= 0.0) return nightAir;
  vec3 horizonDir = vec3(dir.x, 0.0, dir.z);
  horizonDir /= max(length(horizonDir), 1e-4);
  return mix(nightAir, gardenAtmosphereSky(horizonDir, uGardenAir.sunDir,
    uGardenAir.rayleigh, uGardenAir.mie, uGardenAir.radiance), uGardenAir.daylight);
}

float gardenIchimonji(float dirY) {
  return 1.0 - ${n(GARDEN_ICHIMONJI.gain)} * uGardenAir.ichimonji
    * (1.0 - smoothstep(0.0, ${n(GARDEN_ICHIMONJI.halfWidth)}, abs(dirY - (${n(GARDEN_ICHIMONJI.centre)}))));
}

/** The air at elevation 0 for this azimuth, with the ichimonji line (sea and dome). */
vec3 gardenAirlight(vec3 dir) {
  return gardenAirlightBase(dir) * gardenIchimonji(dir.y);
}

vec3 gardenAerialTransmittance(vec3 worldPos, vec3 cameraPos) {
  return gardenAtmosphereTransmittance(uGardenAir.rayleigh, uGardenAir.mie,
    distance(worldPos, cameraPos),
    cameraPos.y - uGardenAir.seaLevel, worldPos.y - uGardenAir.seaLevel);
}

/** Signed distance to the plate's XZ rectangle: negative inside (to the nearest edge). */
float gardenAirPlateSigned(vec2 xz) {
  vec2 outside = max(uGardenAir.plateMin - xz, vec2(0.0)) + max(xz - uGardenAir.plateMax, vec2(0.0));
  float beyond = length(outside);
  vec2 inside = min(xz - uGardenAir.plateMin, uGardenAir.plateMax - xz);
  return beyond > 0.0 ? beyond : -min(inside.x, inside.y);
}

vec3 gardenAerialCore(vec3 color, vec3 worldPos, vec3 cameraPos, float ichimonji) {
  vec3 ray = worldPos - cameraPos;
  vec3 dir = ray / max(length(ray), 1e-4);
  vec3 T = gardenAerialTransmittance(worldPos, cameraPos);
  float Tl = dot(T, vec3(0.2126, 0.7152, 0.0722));
  vec3 air = gardenAirlightBase(dir);
  air *= mix(1.0, gardenIchimonji(dir.y), ichimonji * (1.0 - uGardenAir.daylight));
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
  // W3.10: the chart is seen through air, ezu-style. Kasumi rises from inside
  // the rim band (so the rim's outer skirt and cliff never read as a slab edge)
  // to full sky-coloured mist a few units past the plate; everything else keeps
  // a light veil, the colour the air would carry over that distance.
  #ifndef GARDEN_AIR_CONTINUOUS_WATER
  if (uGardenAir.plateHaze > 0.0) {
    float kasumi = max(smoothstep(-24.0, 12.0, gardenAirPlateSigned(worldPos.xz)), 0.22);
    #ifdef GARDEN_AIR_DECORATIVE_TERRAIN
      // Only the overview edge veil is capped; distance transport is untouched.
      kasumi = min(kasumi, 0.08);
    #endif
    float chartLuma = dot(result, vec3(0.2126, 0.7152, 0.0722));
    result = mix(result, vec3(chartLuma), 0.3 * uGardenAir.plateHaze);
    result = mix(result, gardenAirlightBase(dir), uGardenAir.plateHaze * kasumi);
  }
  #endif
  return result;
}

/** Identical smooth Beer–Lambert air for water and objects: no plateaus. */
vec3 gardenAerial(vec3 color, vec3 worldPos, vec3 cameraPos) {
  return gardenAerialCore(color, worldPos, cameraPos, 1.0);
}
vec3 gardenAerialObject(vec3 color, vec3 worldPos, vec3 cameraPos) {
  return gardenAerialCore(color, worldPos, cameraPos, 0.0);
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
      // Built-in fog normally runs after tone/color transforms. Shared
      // transport must instead composite linear surface radiance first.
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <fog_fragment>", "")
        .replace("#include <tonemapping_fragment>", "#include <fog_fragment>\n#include <tonemapping_fragment>");
    }
  }
}

installGardenAerial();

// --- Shared material-patch chain (K5) -------------------------------------------

export type GardenMaterialPatchStage = "deformation" | "surface" | "indirect" | "printInk" | "aerial";

export interface GardenMaterialPatch {
  /** Stable shader recipe id; uniform values do not belong in this key. */
  key: string;
  /** Default: deformation. Explicit stages keep preparation order independent of adoption order. */
  stage?: GardenMaterialPatchStage;
  /** A replaceable recipe slot, rather than another layer on the same surface. */
  slot?: string;
  compile: (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void;
}

const PATCH_STAGE_ORDER: Record<GardenMaterialPatchStage, number> = {
  deformation: 0, surface: 1, indirect: 2, printInk: 3, aerial: 4,
};
interface GardenMaterialPatchChain {
  patches: GardenMaterialPatch[];
  cacheSuffix: string;
}
const materialPatchChains = new WeakMap<Material, GardenMaterialPatchChain>();

/**
 * Preserves an existing deformation callback and lazy cache key. The stage
 * order is deformation → surface → indirect fill → print ink → aerial.
 * State is not userData: clones copy metadata but must install their own hooks.
 */
export function chainGardenMaterialPatch(material: Material, patch: GardenMaterialPatch): void {
  let chain = materialPatchChains.get(material);
  if (!chain) {
    chain = { patches: [], cacheSuffix: "" };
    materialPatchChains.set(material, chain);
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey;
    // Three's default key reads this.onBeforeCompile: capture the original
    // callback before replacing it, otherwise different deformations collide.
    const defaultCacheKey = previousCacheKey === Material.prototype.customProgramCacheKey
      ? previousCompile.toString() : null;
    const ownedChain = chain;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      for (const entry of ownedChain.patches) entry.compile(shader, renderer);
    };
    material.customProgramCacheKey = () =>
      `${defaultCacheKey ?? previousCacheKey.call(material)}${ownedChain.cacheSuffix}`;
  }
  const index = chain.patches.findIndex((entry) =>
    patch.slot ? entry.slot === patch.slot : entry.key === patch.key);
  if (index >= 0) {
    if (chain.patches[index].key === patch.key) return;
    chain.patches[index] = patch;
  } else {
    chain.patches.push(patch);
  }
  chain.patches.sort((a, b) =>
    PATCH_STAGE_ORDER[a.stage ?? "deformation"] - PATCH_STAGE_ORDER[b.stage ?? "deformation"]);
  chain.cacheSuffix = chain.patches.map((entry) => `|${entry.key}`).join("");
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


/** W3.10 whole-map plate haze weight (0 at rest). */
export function setGardenAerialPlateHaze(weight: number): void {
  GARDEN_AIR.plateHaze = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 0;
}

export interface GardenAerialFrame {
  phase: DayCyclePhase;
  /** Dome colour at elevation 0 toward / away from the sun. */
  solarHorizon: Color;
  antiHorizon: Color;
  sunDir: Vector3;
  seaLevel: number;
  /** Signed PSI clarity −1…+1 (data-poetry-1). */
  clarity: number;
  /** Sine of the top row's elevation (garden-sky `gardenSkyVisibleHeight`). */
  skyVisibleHeight: number;
}


function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * X9: −1 through the morning, +1 through the afternoon, 0 at solar noon — from
 * the sun's true hour angle over half the day's length, so it follows the date
 * and the zone exactly as the beats do. Consumers weight it by the day beat.
 */
export function gardenDayDrift(hour: number, day: GardenSkyDay = gardenSkyToday()): number {
  const halfDay = Math.max(1, (day.sunsetHour - day.sunriseHour) / 2);
  const x = gardenSolarHourAngle(day, hour) / halfDay;
  return 2 * smoothstep(-GARDEN_DAY_DRIFT_SPAN, GARDEN_DAY_DRIFT_SPAN, x) - 1;
}


/** Luminance transmittance of the air between the eye and a point (CPU twin). */
export function gardenAerialTransmittance(
  state: Pick<GardenAirState, "rayleigh" | "mie" | "seaLevel">,
  eye: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number },
): number {
  writeGardenAtmosphereTransmittance(scratchTransmittance, state.rayleigh, state.mie,
    Math.hypot(point.x - eye.x, point.y - eye.y, point.z - eye.z),
    eye.y - state.seaLevel, point.y - state.seaLevel);
  return scratchTransmittance.r * 0.2126 + scratchTransmittance.g * 0.7152 + scratchTransmittance.b * 0.0722;
}

const scratchTransmittance = new Color();
const scratchAirDirection = new Vector3();
/** Allocation-free coefficient write; camera/fog ranges never alter visibility. */
export function updateGardenAerial(frame: GardenAerialFrame): void {
  const { phase } = frame;
  const clarity = Math.min(1, Math.max(-1, Number.isFinite(frame.clarity) ? frame.clarity : 0));
  GARDEN_AIR.clarity = clarity;
  writeGardenAtmosphereCoefficients(GARDEN_AIR.rayleigh, GARDEN_AIR.mie, clarity);
  GARDEN_AIR.daylight = Math.min(1, phase.daylight + phase.dusk * 0.7);
  GARDEN_AIR.radiance = GARDEN_ATMOSPHERE.radiance;
  GARDEN_AIR.seaLevel = frame.seaLevel;
  // Same gate as the dome's line: the ichimonji belongs to the low rest view.
  GARDEN_AIR.ichimonji = smoothstep(0.11, 0.18, frame.skyVisibleHeight);
  GARDEN_AIR.sunDir.copy(frame.sunDir);

  // Preserve the composed night sea coefficient from S4-P1.
  GARDEN_AIR.airSun.copy(frame.solarHorizon).multiplyScalar(1.1);
  GARDEN_AIR.airAnti.copy(frame.antiHorizon).multiplyScalar(1.1);
  GARDEN_AIR.twilightSun.copy(GARDEN_AIR.airSun);
  GARDEN_AIR.twilightAnti.copy(GARDEN_AIR.airAnti);
  if (GARDEN_AIR.daylight > 0) {
    scratchAirDirection.set(frame.sunDir.x, 0, frame.sunDir.z);
    scratchAirDirection.divideScalar(Math.max(scratchAirDirection.length(), 1e-4));
    writeGardenAtmosphereSky(scratchTransmittance, scratchAirDirection, frame.sunDir,
      GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
    GARDEN_AIR.airSun.lerp(scratchTransmittance, GARDEN_AIR.daylight);
    scratchAirDirection.negate();
    writeGardenAtmosphereSky(scratchTransmittance, scratchAirDirection, frame.sunDir,
      GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
    GARDEN_AIR.airAnti.lerp(scratchTransmittance, GARDEN_AIR.daylight);
  }
  GARDEN_AIR.airlight.copy(GARDEN_AIR.airSun).lerp(GARDEN_AIR.airAnti, 0.5);
}
