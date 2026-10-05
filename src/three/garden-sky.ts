import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  Group,
  MathUtils,
  Matrix3,
  Matrix4,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  CAMERA_FAR,
  CAMERA_FOV_DEG,
} from "../systems/projection";
import {
  GARDEN_WATER_Y,
} from "../systems/garden-observatory-slice";
import type { GardenSeason } from "../systems/season";
import { createGardenSkyBillboards } from "./garden-sky-billboards";
import {
  advanceSkyClarityFade,
  createSkyClarityFade,
  NEUTRAL_SKY_CLARITY,
  psiBandClarity,
  signedSkyClarity,
  skyCloudCover,
} from "../systems/psi-sky";
import { debugSkyBand } from "../lib/pharosville-debug";
import { acquireGardenNoisePack } from "./garden-noise-pack";
import { GARDEN_AIR, GARDEN_AERIAL_GLSL_PARS, gardenAerialUniforms, updateGardenAerial } from "./garden-aerial";
import { GARDEN_ATMOSPHERE, writeGardenAtmosphereCoefficients, writeGardenAtmosphereSky } from "./garden-atmosphere";
import type { EpistemicFogBank } from "../systems/epistemic-haze";
import {
  dayCycleBeats,
  type DayCycleBeats,
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  MOON_COLOR,
  STAR_COLOR,
  type DayCyclePhase,
} from "./garden-day-cycle";
import { gardenSunPose } from "./garden-sun";
import {
  GARDEN_REST_VIEW_AZIMUTH,
  gardenMoonStateAt,
  gardenSkyToday,
  gardenSkyViewAspect,
  gardenSolarElevationAt,
  setGardenSkyViewAspect,
  type GardenMoonState,
  type GardenSkyDay,
} from "../systems/sky-almanac";

// Five illumination beats: neutral noon air, not a warm full-frame grade.
//
// W2.2 (sky-1): the horizon has a side. `solar` is the horizon under the sun's
// azimuth, `anti` the horizon opposite it; the dome blends them by the view
// ray's horizontal alignment with the sun, and the air (fog, airlight) takes
// the same pair, so the sea under each part of the sky agrees with it. One
// glance tells you where the sun is even though it is always off-frame. Night
// has no side.
export const GARDEN_SKY_BEATS = {
  dawn: { zenith: new Color(0x777d99), solar: new Color(0xe0bca6), anti: new Color(0xaaa7c2) },
  // Golden faces away from the sun at the rest seat (the key is behind the
  // viewer's right shoulder), so the frame's sky is the anti side: a cool
  // violet-BLUE (hue ≈ 235°, was a 260° lavender) that the warm lit planes
  // read against. The warmth stays on the solar horizon and the lit stone.
  golden: { zenith: new Color(0x6e70a2), solar: new Color(0xf0a45c), anti: new Color(0x8f95bf) },
  blue: { zenith: new Color(0x202c59), solar: new Color(0xb98a6e), anti: new Color(0x58648a) },
  // Readable night uses the same restrained indigo dome for the visible sky
  // and PMREM. The target is L* 7–15 after the unchanged night chain;
  // surface readability comes from cool diffuse/ground fill, not brighter air.
  night: { zenith: new Color(0x34394e), solar: new Color(0x393e50), anti: new Color(0x393e50) },
};
/**
 * Between sunset and nautical dusk (and mirrored at dawn) the anti-solar sky
 * carries the Belt of Venus, a dusty-rose band, over the Earth's shadow, a
 * blue-grey slate band on the horizon.
 */
export const GARDEN_SKY_BELT = {
  rose: new Color(0x9a7486),
  earthShadow: new Color(0x3e4666),
};
const SKY_BEAT_NAMES = ["dawn", "day", "golden", "blue", "night"] as const;
const skyColorDirection = new Vector3();
const skyColorRadiance = new Color();

/** "horizon" is the side-less mean of the solar and anti-solar horizons. */
export function blendGardenSkyColor(
  target: Color,
  beats: DayCycleBeats,
  channel: "zenith" | "solar" | "anti" | "horizon",
): Color {
  target.setRGB(0, 0, 0);
  for (const beat of SKY_BEAT_NAMES) {
    if (beat === "day") continue; // Daylight has no authored pigment authority.
    const colors = GARDEN_SKY_BEATS[beat];
    const weight = beats[beat];
    if (channel === "horizon") {
      target.r += (colors.solar.r + colors.anti.r) * 0.5 * weight;
      target.g += (colors.solar.g + colors.anti.g) * 0.5 * weight;
      target.b += (colors.solar.b + colors.anti.b) * 0.5 * weight;
    } else {
      const color = colors[channel];
      target.r += color.r * weight;
      target.g += color.g * weight;
      target.b += color.b * weight;
    }
  }
  // Water's reflection fallback is a CPU consumer of the same daytime sky.
  if (beats.day > 0) {
    if (channel === "zenith") skyColorDirection.set(0, 1, 0);
    else {
      skyColorDirection.set(GARDEN_AIR.sunDir.x, 0, GARDEN_AIR.sunDir.z);
      skyColorDirection.divideScalar(Math.max(skyColorDirection.length(), 1e-4));
      if (channel === "anti") skyColorDirection.negate();
    }
    writeGardenAtmosphereSky(skyColorRadiance, skyColorDirection, GARDEN_AIR.sunDir, GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
    target.add(skyColorRadiance.multiplyScalar(beats.day * (channel === "horizon" ? 0.5 : 1)));
    if (channel === "horizon") {
      skyColorDirection.negate();
      writeGardenAtmosphereSky(skyColorRadiance, skyColorDirection, GARDEN_AIR.sunDir, GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
      target.add(skyColorRadiance.multiplyScalar(beats.day * 0.5));
    }
  }
  return target;
}
const DOME_RADIUS = CAMERA_FAR * 0.9;
const STAR_COUNT = 1200;
const DEG = Math.PI / 180;

// --- W2.6 / W2.7: the real moon and a night sky with depth ------------------
//
// The moon is drawn IN the dome (sky-5): a 1.1° disc lit by its phase, with
// earthshine on the dark limb, three soft maria, warmth when it is low and a
// two-scale halo scaled by how much of it is lit. Its pose is the displayed
// pose from `sky-almanac.ts`, the same answer the water's road and the night
// key read. It never outshines the beacon: the disc's linear peak is set so
// it lands at or under L* 80 after the night grade.
const MOON_DISC_RADIUS = Math.sin(0.55 * DEG);
const MOON_DISC_LINEAR = 0.5;
const MOON_DISC_BASE = MOON_COLOR.clone().lerp(new Color(HARBOR_PALETTE.foam_white), 0.55);
const MOON_LOW_WARMTH = new Color(HARBOR_PALETTE.lantern_warm);
/** A daytime moon is a pale ghost on the blue, never a lamp. */
const MOON_DAY_STRENGTH = 0.12;
/**
 * The heavens turn about a pole over the seat's left hand, 35° up (the sun's
 * noon is the right hand, so the left is the pole side in either hemisphere).
 * The star field and the Milky Way are authored as they stand at 22:00 on
 * 26 September; any other hour and date rotates them by sidereal time.
 */
const CELESTIAL_POLE = new Vector3(
  Math.cos(GARDEN_REST_VIEW_AZIMUTH - Math.PI / 2) * Math.cos(35 * DEG),
  Math.sin(35 * DEG),
  Math.sin(GARDEN_REST_VIEW_AZIMUTH - Math.PI / 2) * Math.cos(35 * DEG),
);
const STAR_REFERENCE_JD = Date.UTC(2026, 8, 26) / 86_400_000 + 2440587.5;
const STAR_REFERENCE_HOUR = 22;
const SIDEREAL_HOURS_PER_DAY = 24 / 365.2422;
/**
 * Stars are scattered over the declinations that rise through the rest view
 * (the pole is on the left, so the view looks along the rising side): every
 * hour a fresh stretch of the band crosses the frame instead of 98% of the
 * field waiting behind the camera.
 */
const STAR_DECLINATION_RANGE = [-25 * DEG, 38 * DEG] as const;
/**
 * The Milky Way (O20): a great circle leaning across the right third of the
 * reference sky, ≈ 17° right of the view axis at 10° up, tilted 60°.
 */
const MILKY_WAY_NORMAL = (() => {
  const azimuth = GARDEN_REST_VIEW_AZIMUTH + 0.3;
  const elevation = 10 * DEG;
  const point = new Vector3(
    Math.cos(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.sin(azimuth) * Math.cos(elevation),
  );
  const alongHorizon = new Vector3(-Math.sin(azimuth), 0, Math.cos(azimuth));
  const upSky = new Vector3(
    -Math.cos(azimuth) * Math.sin(elevation),
    Math.cos(elevation),
    -Math.sin(azimuth) * Math.sin(elevation),
  );
  const tangent = alongHorizon.multiplyScalar(Math.cos(60 * DEG)).addScaledVector(upSky, Math.sin(60 * DEG));
  return point.cross(tangent).normalize();
})();
/** Linear peak of the band: a few L* at most, far under the beacon and the moon. */
const MILKY_WAY_PEAK = 0.0045;
const FOG_NEAR = 200;
const FOG_FAR = 400;

// --- Wave 1: bokashi bands on the visible sky seam --------------------------
//
// The ladder above is the "long quiet mid-gradient" of a woodblock sky. This is
// the rest of the wipe: the two or three DELIBERATE stops a printer lays over a
// flat field, which is what makes a Hiroshige sky read as depth without a single
// physical scattering term.
//
// The upper hemisphere begins at the live sea-fog colour. Directional height
// keeps its bands on the horizon as the perspective camera pans and dollies;
// the lower hemisphere stays sea haze rather than mirroring the sky.
//
// That is Hiroshige's order — a dark band at the top, the fog ladder's long
// quiet gradient under it, a pale strip at the seam, and the ichimonji mirroring
// it as a subtle darker strip on the water below. The first tuning had the deep
// band saturating at d = 1.44, past the top of the frame, so it was squeezed
// into the top 5% at a third of its intended weight; it now reaches full exactly
// at the top row.
//
// COLOUR. The ink is a multiplicative shade on the finished fragment, not a
// tint: bokashi is one pigment wiped to varying density, so density is the only
// thing that moves and every hue stays the day cycle's. That is why no phase
// needs its own swatch — at night and dusk the band deepens the authored indigo
// into the ai family on its own, and at day it shades an already-pale fog by a
// third as much.
export const GARDEN_BOKASHI_BAND = {
  /** Visible-sky height: [in-start, in-end, out-start, out-end]. */
  ichimonji: [0.015, 0.055, 0.1, 0.17],
  pale: [0.12, 0.2, 0.31, 0.43],
  /** The deep upper band has no outer edge. */
  deep: [0.56, 0.86],
  ichimonjiGain: 0.07,
  paleGain: 0.11,
  deepGain: 0.24,
  /** Dusk and night carry the bands; the graded day sky needs only a trace. */
  dayAmount: 0.08,
} as const;

/**
 * The bokashi ink at one depth: > 0 lightens (the pale horizon strip), < 0
 * deepens (the ichimonji strip and the top band), 0 leaves the fragment alone.
 *
 * The GLSL below is generated from the same constants, so this is the ramp the
 * water actually draws rather than a model of it.
 */
export function gardenBokashiInk(skyHeight: number): number {
  const B = GARDEN_BOKASHI_BAND;
  const step = (edge0: number, edge1: number, value: number): number => {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };
  const d = Math.min(1, Math.max(0, skyHeight));
  const ichimonji = step(B.ichimonji[0], B.ichimonji[1], d)
    * (1 - step(B.ichimonji[2], B.ichimonji[3], d));
  const pale = step(B.pale[0], B.pale[1], d) * (1 - step(B.pale[2], B.pale[3], d));
  const deep = step(B.deep[0], B.deep[1], d);
  return pale * B.paleGain - ichimonji * B.ichimonjiGain - deep * B.deepGain;
}

/** Phase weight for the bands: full through dusk and night, a third by day. */
export function gardenBokashiAmount(phase: DayCyclePhase): number {
  return phase.night + phase.dusk + phase.daylight * GARDEN_BOKASHI_BAND.dayAmount;
}

/**
 * The ramp as a GLSL shade multiplier for the visible sky material.
 */
export function gardenBokashiBandGlsl(): string {
  const B = GARDEN_BOKASHI_BAND;
  const n = (value: number): string => (Number.isInteger(value) ? value.toFixed(1) : String(value));
  return /* glsl */ `
  float gardenBokashiShade(
    float skyHeight,
    float amount
  ) {
    float d = clamp(skyHeight, 0.0, 1.0);
    float ichimonji = smoothstep(${n(B.ichimonji[0])}, ${n(B.ichimonji[1])}, d)
      * (1.0 - smoothstep(${n(B.ichimonji[2])}, ${n(B.ichimonji[3])}, d));
    float pale = smoothstep(${n(B.pale[0])}, ${n(B.pale[1])}, d)
      * (1.0 - smoothstep(${n(B.pale[2])}, ${n(B.pale[3])}, d));
    float deep = smoothstep(${n(B.deep[0])}, ${n(B.deep[1])}, d);
    float ink = pale * ${n(B.paleGain)}
      - ichimonji * ${n(B.ichimonjiGain)}
      - deep * ${n(B.deepGain)};
    return 1.0 + ink * amount;
  }
`;
}

// W0.19 (critic D12): the ladder is spent between the sea horizon and the top
// row, but at the whole-map pull-out the top row sits only ~4° above the sea,
// which squeezed every band into a few dozen rows and read as a hard step. The
// visible height is floored at 6°, so a low sky shows the lower part of the
// ladder instead of all of it compressed, and the top eases into 1 through a
// smoothstep knee instead of a hard clamp.
export const GARDEN_SKY_VISIBLE_HEIGHT_FLOOR = Math.sin(6 * Math.PI / 180);
/**
 * Soft top of the ladder: linear up to the knee start, flat at 1 from start +
 * width. The knee straddles 1 symmetrically, so the ramp lands exactly on 1.
 */
const SKY_HEIGHT_KNEE_START = 0.8;
const SKY_HEIGHT_KNEE_WIDTH = 0.4;

/** Sine of the top row's elevation for a pose pitch, floored at 6°. */
export function gardenSkyVisibleHeight(pitch: number): number {
  return Math.max(GARDEN_SKY_VISIBLE_HEIGHT_FLOOR, Math.sin(CAMERA_FOV_DEG * Math.PI / 360 - pitch));
}

/**
 * Ladder height of a view ray. Its slope is `1 - smoothstep(knee)`: 1 up to
 * the knee, easing to 0 at its end, where the value is exactly 1 — no kink
 * anywhere. The dome shader inlines the same ramp from the same constants.
 */
export function gardenSkyHeight(dirY: number, visibleHeight: number): number {
  const h = Math.max(0, dirY / visibleHeight);
  const t = Math.min(1, Math.max(0, (h - SKY_HEIGHT_KNEE_START) / SKY_HEIGHT_KNEE_WIDTH));
  return Math.min(h, SKY_HEIGHT_KNEE_START) + SKY_HEIGHT_KNEE_WIDTH * (t - t * t * t + 0.5 * t * t * t * t);
}

// W2.3/W2.5: the far mist banks are gone — by day, mist means a stale source;
// the ridge-foot kasumi lives in garden-horizon. X3 (sky-4): the billboard
// cumulus is gone too — its pale pills are replaced by the cloud field painted
// on this dome below.
// W5.7 borrowed scenery stays below the live fog value at every phase —
// palette derivation, not a new swatch. 2026-09-05 (warm-village B3): the
// binding 2–4% whisper became three deliberate planes (10/20/30% below the
// fog, far→near) so the ridges layer instead of grading into one strip; see
// GARDEN_HORIZON_VALUE_SCALES in garden-horizon.ts.

// Phase 2 (item 2c) kept the dome's glow, the water's glitter and the cast
// shadows agreeing on the sun's bearing by writing that bearing down in three
// places. They agreed because nothing moved. Now the arc in garden-sun.ts is
// the single source and all three read it, so they agree because there is only
// one answer — and the sun's elevation going below the horizon after dark is
// what fades the scattering layer out and hands the sky to the authored indigo
// and the stars.


// --- X3 / X4: painted clouds aloft, cover owned by market stability ----------
//
// One cloud field, painted on the dome — no cards, no draw of its own. Each
// view ray meets a gently curved cloud layer (1 / (y + lift), which is what the
// Earth's curvature does to a real deck), and the shared noise pack (G fbm, B
// Worley) gives the shapes. Two layers: long high brushstrokes, and low bands
// that grow from a few small shapes into a broken deck as cover rises. The
// field is lit by the real sun or the displayed moon: tops lit at noon, warm
// undersides when the sun is low, silver edges near the moon; the light term is
// posterised in three tones like a woodblock plate. Cover follows the PSI
// band (`skyCloudCover`, eased with the air over 90 s); the wall clock lights it.
//
// Cloud-space axes: A is the rest view's lateral axis (also the prevailing
// wind), B the rest view's forward axis, so the bands run across the picture.
const CLOUD_AXIS_A = new Vector2(-0.855, 0.519).normalize();
const CLOUD_AXIS_B = new Vector2(-CLOUD_AXIS_A.y, CLOUD_AXIS_A.x);
/** Curvature lift: the layer meets the horizon at a finite distance. */
const CLOUD_LIFT = 0.05;
/** Noise-pack uv per cloud-space unit, [along, across]. */
const CLOUD_LOW_SCALE = [0.064, 0.08] as const;
/** Sparse cirrus starts long/thin; fair groups and veil reauthor this sampling. */
const CLOUD_HIGH_SCALE = [0.008, 0.05] as const;
/** Shared noise UV wraps by a full tile, even while morphology is easing. */
const CLOUD_WRAP = [1, 1] as const;
/** Noise UV per second per unit of wind speed. */
const CLOUD_DRIFT = 0.0035;
/**
 * Noise-pack calibration: the fraction of the field above a threshold of
 * `0.75·G + 0.35·(1 − B)` is ≈ cover when threshold = 0.80 − 0.47·cover
 * (measured over the pack: 5 % → 0.79, 50 % → 0.57, 90 % → 0.40).
 */
const CLOUD_THRESHOLD = [0.8, 0.47] as const;
/** X4: crepuscular ladders add at most 6 % of the lit colour. */
const CLOUD_RAYS_GAIN = 0.06;
const CLOUD_WHITE = new Color(HARBOR_PALETTE.foam_white);
/** World half-height of the crown (lantern and statue) the clouds keep clear of. */
const CLOUD_CROWN_CLEAR_UNITS = 4.5;

/** Pulls a linear colour toward its own luminance by `amount` (0 = unchanged, 1 = grey). */
function desaturate(color: Color, amount: number): Color {
  const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return color.setRGB(
    color.r + (luma - color.r) * amount,
    color.g + (luma - color.g) * amount,
    color.b + (luma - color.b) * amount,
  );
}

export interface GardenSkyFrame {
  reducedMotion: boolean;
  /** Drives the sun's place on the day's arc (garden-sun.ts). */
  wallClockHour: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  /** Actual world-space eye; celestial scenery has no translation parallax. */
  cameraPosition: { x: number; y: number; z: number };
  timeSeconds: number;
  /**
   * Phase 2 billboard gate (mist banks + cumulus layer): the caller resolves
   * the quality tier and passes false below `balanced`. Defaults to shown.
   */
  billboards?: boolean;
  /** Phase 2 weather wind; drives the billboard drift. */
  wind?: { x: number; y: number; speed: number; gust: number };
  epistemicBanks?: readonly EpistemicFogBank[];
  /** Viewport aspect; the displayed moon's arc is scaled to the rest view's width (K3). */
  viewAspect?: number;
}

export interface GardenSky {
  /**
   * Target PSI clarity (0..1, psi-sky); the air and the clouds ease toward it
   * over 90 s. `reading` is false while there is no accepted PSI reading (the
   * neutral pre-data veil); the first real reading snaps instead of easing.
   */
  setClarity: (clarity: number, reading?: boolean) => void;
  /** The displayed signed clarity (−1…+1) the air and the far ridges draw. */
  readonly signedClarity: number;
  /** Idempotent illumination/transport writer used by update and CPU tests.
   * The renderer stages the complete update (including clouds) before PMREM. */
  applyPhase: (phase: DayCyclePhase, wallClockHour: number) => void;
  dispose: () => void;
  /**
   * W6.5: the dome's own shader material, shared with the environment baker.
   *
   * `garden-environment.ts` hangs a second, unit-radius sphere on THIS material
   * instance and bakes it into the PMREM probe. Sharing the instance rather than
   * copying its colours is the whole point: the uniforms `update()` writes below
   * are the same uniforms the probe renders, so the light the world is lit BY
   * cannot drift from the sky the world is seen AGAINST. A copy would have been
   * one more thing to keep in step by hand.
   *
   * The environment module owns only the geometry it makes; this material is
   * disposed here, once.
   */
  domeMaterial: ShaderMaterial;
  fog: Fog;
  root: Group;
  update: (phase: DayCyclePhase, frame: GardenSkyFrame) => void;
}

function createDome(): {
  material: ShaderMaterial;
  mesh: Mesh<SphereGeometry, ShaderMaterial>;
} {
  const glslVec3 = (v: Vector3): string => `vec3(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)})`;
  const material = new ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fog: false,
    side: BackSide,
    uniforms: {
      ...gardenAerialUniforms,
      uAtmosphereDate: { value: 0 },
      uAntiHorizon: { value: GARDEN_SKY_BEATS.night.anti.clone() },
      uBeltColor: { value: GARDEN_SKY_BELT.rose.clone() },
      uBeltStrength: { value: 0 },
      uBokashiAmount: { value: 1 },
      uCelestialFrame: { value: new Matrix3() },
      uEarthShadowColor: { value: GARDEN_SKY_BELT.earthShadow.clone() },
      uGlow: { value: 0 },
      uMilkyWay: { value: 0 },
      uMilkyWayColor: { value: STAR_COLOR.clone() },
      uMoonColor: { value: MOON_DISC_BASE.clone() },
      uMoonDay: { value: 0 },
      uMoonDir: { value: new Vector3(0, 1, 0) },
      uMoonIllumination: { value: 0 },
      uMoonPhaseLight: { value: new Vector3(0, 0, 1) },
      uMoonVisible: { value: 0 },
      uScattering: { value: 0 },
      uSkyVisibleHeight: { value: Math.sin(CAMERA_FOV_DEG * Math.PI / 360) },
      uSolarHorizon: { value: GARDEN_SKY_BEATS.night.solar.clone() },
      uSunColor: { value: DAY_CYCLE_LIGHT_PRESETS.day.dirColor.clone() },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunIntensity: { value: 0 },
      uZenith: { value: DAY_CYCLE_SKY_PRESETS.night.zenith.clone() },
      uNoisePack: { value: null },
      uCloudReady: { value: 0 },
      uCloudCover: { value: 0 },
      uCloudHighThreshold: { value: CLOUD_THRESHOLD[0] - CLOUD_THRESHOLD[1] * 0.05 },
      uCloudHighAlpha: { value: 0.65 },
      uCloudLitCool: { value: new Color() },
      uCloudCrownDir: { value: new Vector3(0, 1, 0) },
      uCloudCrownRadius: { value: 0 },
      uCloudVeil: { value: 0 },
      uCloudDeck: { value: 0 },
      uCloudOffset: { value: new Vector2() },
      uCloudLit: { value: new Color() },
      uCloudShade: { value: new Color() },
      uCloudLightDir: { value: new Vector3(0, 1, 0) },
      uCloudRim: { value: 0 },
      uCloudRays: { value: 0 },
      uCloudRaysTime: { value: 0 },
    },
    // The dome is centred on the eye, so the interpolated vertex position IS
    // the view ray; normalising per vertex would bend it across each facet,
    // which a 1° moon and the sun's disc would show.
    vertexShader: /* glsl */ `
      varying vec3 vRay;
      void main() {
        vRay = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAntiHorizon;
      uniform vec3 uBeltColor;
      uniform float uBeltStrength;
      uniform float uBokashiAmount;
      uniform mat3 uCelestialFrame;
      uniform vec3 uEarthShadowColor;
      uniform float uGlow;
      uniform float uMilkyWay;
      uniform vec3 uMilkyWayColor;
      uniform vec3 uMoonColor;
      uniform float uMoonDay;
      uniform vec3 uMoonDir;
      uniform float uMoonIllumination;
      uniform vec3 uMoonPhaseLight;
      uniform float uMoonVisible;
      uniform float uScattering;
      uniform float uSkyVisibleHeight;
      uniform vec3 uSolarHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uSunIntensity;
      uniform vec3 uZenith;
      uniform sampler2D uNoisePack;
      uniform float uCloudReady;
      uniform float uCloudCover;
      uniform float uCloudHighThreshold;
      uniform float uCloudHighAlpha;
      uniform vec3 uCloudLitCool;
      uniform vec3 uCloudCrownDir;
      uniform float uCloudCrownRadius;
      uniform float uCloudVeil;
      uniform float uCloudDeck;
      uniform vec2 uCloudOffset;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudShade;
      uniform vec3 uCloudLightDir;
      uniform float uCloudRim;
      uniform float uCloudRays;
      uniform float uCloudRaysTime;
      varying vec3 vRay;
      ${GARDEN_AERIAL_GLSL_PARS}
      ${gardenBokashiBandGlsl()}
      float gardenSkyHash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float gardenSkyNoise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(gardenSkyHash(i), gardenSkyHash(i + vec3(1.0, 0.0, 0.0)), f.x),
              mix(gardenSkyHash(i + vec3(0.0, 1.0, 0.0)), gardenSkyHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
          mix(mix(gardenSkyHash(i + vec3(0.0, 0.0, 1.0)), gardenSkyHash(i + vec3(1.0, 0.0, 1.0)), f.x),
              mix(gardenSkyHash(i + vec3(0.0, 1.0, 1.0)), gardenSkyHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
          f.z
        );
      }
      float gardenMoonMare(vec2 p, vec2 centre, float radius) {
        return 1.0 - smoothstep(radius * 0.35, radius, length(p - centre));
      }
      void main() {
        vec3 dir = normalize(vRay);
        float skyLift = max(dir.y / uSkyVisibleHeight, 0.0);
        float skyKnee = clamp((skyLift - ${SKY_HEIGHT_KNEE_START.toFixed(2)}) / ${SKY_HEIGHT_KNEE_WIDTH.toFixed(2)}, 0.0, 1.0);
        float skyHeight = min(skyLift, ${SKY_HEIGHT_KNEE_START.toFixed(2)})
          + ${SKY_HEIGHT_KNEE_WIDTH.toFixed(2)} * (skyKnee - skyKnee * skyKnee * skyKnee + 0.5 * skyKnee * skyKnee * skyKnee * skyKnee);

        // W2.2 (sky-1): the horizon has a side. The same law feeds the air
        // (garden-aerial), so the sea under each part of the sky agrees.
        vec2 viewXZ = dir.xz / max(length(dir.xz), 1e-4);
        vec2 sunXZ = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
        float sunAlign = dot(viewXZ, sunXZ);
        float sunSide = pow(smoothstep(-0.3, 1.0, sunAlign), 1.5);
        vec3 horizon = mix(uAntiHorizon, uSolarHorizon, sunSide);
        vec3 middle = mix(horizon, uZenith, 0.35);
        vec3 color = mix(horizon, middle, smoothstep(0.015, 0.28, skyHeight));
        color = mix(color, uZenith, smoothstep(0.3, 0.86, skyHeight));
        color *= gardenBokashiShade(skyHeight, uBokashiAmount);
        color += horizon * (1.0 - smoothstep(-0.04, 0.16, abs(dir.y))) * 0.12;
        // A broad glow low on the sun's side: it is what says "the sun is
        // over there" while the sun itself is always off-frame.
        color += uSolarHorizon * pow(max(sunAlign, 0.0), 3.0) * (1.0 - smoothstep(0.0, 0.25, dir.y)) * uGlow;
        // The same warmth, wide and low: at golden the sun stands behind the
        // viewer's right shoulder (~110° off the frame's right edge), where
        // the lobe above never reaches, so the sky on the sun side carries a
        // broad warm band that fades out toward the far side. It reaches to
        // ~10° so it shows above the borrowed ridge crests (≤ 4°), not only
        // behind them.
        color += uSolarHorizon * smoothstep(-0.8, 0.2, sunAlign) * (1.0 - smoothstep(0.08, 0.18, dir.y)) * uGlow * 0.5;
        // Between sunset and nautical dusk: the Earth's shadow, a slate band on
        // the anti-solar horizon, under the Belt of Venus, a dusty rose.
        float antiSide = (1.0 - smoothstep(-0.8, 0.0, sunAlign)) * uBeltStrength;
        // Heights: slate to ≈ 3° (clear of the ridge feet), rose ≈ 3–8°.
        color = mix(color, uEarthShadowColor, (1.0 - smoothstep(0.03, 0.055, dir.y)) * antiSide);
        color = mix(color, uBeltColor, smoothstep(0.045, 0.07, dir.y) * (1.0 - smoothstep(0.1, 0.16, dir.y)) * antiSide);

        float mu = dot(dir, uSunDir);
        vec3 daylightSky = gardenAtmosphereSky(dir, uSunDir,
          uGardenAir.rayleigh, uGardenAir.mie, uGardenAir.radiance);
        color = mix(color, daylightSky, uScattering);
        float corona = pow(max(mu, 0.0), 220.0);
        float disc = smoothstep(0.99955, 0.99985, mu);
        color += uSunColor * (corona * 0.5 + disc) * uSunIntensity;


        // W2.7 (O20): the Milky Way on moonless clear nights, turning with the stars.
        if (uMilkyWay > 0.0) {
          vec3 skyDir = uCelestialFrame * dir;
          float plane = dot(skyDir, ${glslVec3(MILKY_WAY_NORMAL)});
          float band = exp(-plane * plane / 0.022);
          float cloud = gardenSkyNoise(skyDir * 7.0) * 0.5
            + gardenSkyNoise(skyDir * 15.0) * 0.3
            + gardenSkyNoise(skyDir * 33.0) * 0.2;
          float rift = 1.0 - 0.6 * exp(-plane * plane / 0.0012) * smoothstep(0.4, 0.7, gardenSkyNoise(skyDir * 5.0 + 3.1));
          color += uMilkyWayColor * band * smoothstep(0.3, 0.75, cloud) * rift
            * smoothstep(0.02, 0.12, dir.y) * uMilkyWay;
        }

        // W2.6 (sky-5): the real moon, in the window.
        float moonAboveSea = smoothstep(0.0, 0.003, dir.y);
        if (uMoonVisible + uMoonDay > 0.0) {
          float cosTheta = dot(dir, uMoonDir);
          vec3 moonRight = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
          vec3 moonUp = cross(moonRight, uMoonDir);
          vec2 mp = vec2(dot(dir, moonRight), dot(dir, moonUp)) / ${MOON_DISC_RADIUS.toFixed(6)};
          float mr = length(mp);
          float discMask = (1.0 - smoothstep(0.9, 1.0, mr)) * step(0.0, cosTheta) * moonAboveSea;
          vec3 moonNormal = vec3(mp, sqrt(max(0.0, 1.0 - mr * mr)));
          float lit = smoothstep(-0.04, 0.04, dot(moonNormal, uMoonPhaseLight));
          float maria = 1.0 - 0.08 * (
            gardenMoonMare(mp, vec2(-0.28, 0.3), 0.36)
            + gardenMoonMare(mp, vec2(0.2, 0.12), 0.3)
            + gardenMoonMare(mp, vec2(-0.06, -0.34), 0.26)
          );
          vec3 face = uMoonColor * maria * mix(0.9, 1.0, moonNormal.z);
          // Earthshine keeps the dark limb at 5 %; never darker than the sky it covers.
          vec3 night = max(color, face * mix(0.05, 1.0, lit));
          color = mix(color, night, discMask * uMoonVisible);
          color += face * lit * discMask * uMoonDay;
          float theta = acos(clamp(cosTheta, -1.0, 1.0));
          float halo = exp(-theta / ${(0.6 * DEG).toFixed(6)}) * 0.25 + exp(-theta / ${(5 * DEG).toFixed(6)}) * 0.06;
          color += uMoonColor * halo * uMoonIllumination * uMoonVisible * moonAboveSea;
        }

        // X3/X4: the painted cloud field (see CLOUD_* above).
        if (uCloudReady > 0.5 && dir.y > 0.0) {
          // A broken deck takes a little light out of the whole sky under it.
          color *= 1.0 - 0.1 * uCloudDeck;
          vec2 axisA = vec2(${CLOUD_AXIS_A.x.toFixed(6)}, ${CLOUD_AXIS_A.y.toFixed(6)});
          vec2 axisB = vec2(${CLOUD_AXIS_B.x.toFixed(6)}, ${CLOUD_AXIS_B.y.toFixed(6)});
          vec2 cp = vec2(dot(dir.xz, axisA), dot(dir.xz, axisB)) / (dir.y + ${CLOUD_LIFT.toFixed(3)});
          float lowAir = 1.0 - smoothstep(0.0, 0.1, dir.y);
          // Thin the crown quietly, never cut a spotlight hole in a closed sky.
          float crownClear = uCloudCrownRadius > 0.0
            ? 1.0 - (0.35 - 0.23 * uCloudDeck)
              * (1.0 - smoothstep(uCloudCrownRadius, uCloudCrownRadius * 1.8, acos(clamp(dot(dir, uCloudCrownDir), -1.0, 1.0))))
            : 1.0;
          // The lit colour is warm only low on the sun's side; elsewhere the
          // same light arrives as a cool, value-led grey (woodblock golden).
          float warmSide = mix(0.25, 1.0, sunSide) * (1.0 - 0.7 * smoothstep(0.05, 0.25, dir.y));
          vec3 litHere = mix(uCloudLitCool, uCloudLit, warmSide);

          // Cirrus → separated stroke groups → broad translucent high veil.
          vec2 highScale = mix(vec2(${CLOUD_HIGH_SCALE[0]}, ${CLOUD_HIGH_SCALE[1]}), vec2(0.024, 0.07), smoothstep(0.05, 0.15, uCloudCover));
          highScale = mix(highScale, vec2(0.026, 0.028), uCloudVeil);
          vec4 nHigh = texture2D(uNoisePack, cp * highScale + uCloudOffset + vec2(0.37, 0.61));
          float sHigh = nHigh.g * 0.75 + (1.0 - nHigh.b) * 0.35;
          float dHigh = smoothstep(uCloudHighThreshold, uCloudHighThreshold + mix(0.028, 0.055, uCloudVeil), sHigh) * uCloudHighAlpha;
          dHigh *= smoothstep(mix(0.04, 0.012, uCloudVeil), mix(0.08, 0.045, uCloudVeil), dir.y)
            * (1.0 - smoothstep(0.3, 0.45, uCloudCover));
          color = mix(color, mix(uCloudShade, litHere, 0.7), dHigh * crownClear);

          // Low layer: printed shapes with a crisp edge.
          if (uCloudCover > 0.3) {
          vec2 lightXZ = vec2(dot(uCloudLightDir.xz, axisA), dot(uCloudLightDir.xz, axisB));
          float lightFlat = length(lightXZ);
          // Tops lit when the light is high, undersides (screen-down, +B) when it is low.
          vec2 lightStep = (lightXZ / max(lightFlat, 1e-4)) * vec2(0.012, 0.0)
            + vec2(0.0, mix(0.02, -0.02, smoothstep(0.08, 0.6, uCloudLightDir.y)));
          float ceiling = smoothstep(0.78, 0.9, uCloudCover);
          vec2 lowScale = mix(mix(vec2(${CLOUD_LOW_SCALE[0]}, ${CLOUD_LOW_SCALE[1]}), vec2(0.035, 0.09), uCloudDeck), vec2(0.1), ceiling);
          vec2 uvLow = cp * lowScale + uCloudOffset;
          vec4 nLow = texture2D(uNoisePack, uvLow);
          vec4 nLit = texture2D(uNoisePack, uvLow + lightStep);
          // Broken bodies → closed banks → fine-grained overcast ceiling.
          vec2 weights = mix(vec2(0.75, 0.35), vec2(0.9, 0.2), ceiling);
          float sLow = dot(vec2(nLow.g, 1.0 - nLow.b), weights);
          float sLit = dot(vec2(nLit.g, 1.0 - nLit.b), weights);
          float thrLow = ${CLOUD_THRESHOLD[0]} - ${CLOUD_THRESHOLD[1]} * uCloudCover + 0.035 * ceiling;
          float dLow = smoothstep(thrLow, thrLow + 0.045, sLow) * smoothstep(0.3, 0.45, uCloudCover);
          float lit = clamp((sLow - sLit) * 7.0 + 0.5, 0.0, 1.0);
          // Woodblock: three flat tones, blended 30 % with the soft ramp.
          lit = mix(lit, floor(lit * 2.999) * 0.5, 0.3);
          vec3 cloudColor = mix(uCloudShade, litHere, lit);
          // Silver edges only within ~12° of the moon; nowhere else.
          float edge = dLow * (1.0 - smoothstep(thrLow + 0.045, thrLow + 0.11, sLow));
          float nearMoon = 1.0 - smoothstep(0.06, 0.21, acos(clamp(dot(dir, uMoonDir), -1.0, 1.0)));
          cloudColor += uMoonColor * edge * nearMoon * uCloudRim;
          cloudColor = mix(cloudColor, horizon, lowAir * 0.45);
          color = mix(color, cloudColor, dLow * mix(0.84, 0.95, uCloudDeck) * smoothstep(0.008, 0.025, dir.y) * crownClear);
          float horizonFade = smoothstep(0.004, 0.035, dir.y);

          // X4: at low sun under a broken deck, ladders of light through the
          // gaps, fanning about the sun–anti-sun axis. No glow, no flash.
          if (uCloudRays > 0.0) {
            vec3 rayX = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
            vec3 rayY = cross(rayX, uSunDir);
            vec3 w = dir - uSunDir * mu;
            float fan = atan(dot(w, rayY), dot(w, rayX));
            // 3 stripes' worth of noise per turn: an integer, so the atan seam tiles.
            float stripe = texture2D(uNoisePack, vec2(fan * 0.4774648, 0.37 + uCloudRaysTime)).g;
            float ray = smoothstep(0.5, 0.7, stripe) * (1.0 - dLow)
              * (1.0 - smoothstep(0.03, 0.2, dir.y)) * (0.4 + 0.6 * max(sunAlign, 0.0));
            color += uCloudLit * ray * uCloudRays * ${CLOUD_RAYS_GAIN.toFixed(3)} * horizonFade;
          }
          }
        }

        // The sea below the horizon and the seam draw the air the world fades
        // to (garden-aerial), by the same side law, with the ichimonji: a
        // 2–3 px darker line where sky meets sea. Only near the rest/near-rig
        // pitch: pulled out to the chart the horizon is a curve high in the
        // frame, and a line there reads as a scratch.
        if (uScattering < 1.0) {
          float ichimonjiGain = 0.06 * smoothstep(0.11, 0.18, uSkyVisibleHeight) * (1.0 - uScattering);
          float ichimonji = 1.0 - ichimonjiGain * (1.0 - smoothstep(0.0, 0.0035, abs(dir.y + 0.0015)));
          vec3 air = gardenAirlightBase(dir) * ichimonji;
          vec3 composed = mix(air, color, smoothstep(0.0, 0.12, skyHeight));
          color = mix(composed, color, uScattering);
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new Mesh(new SphereGeometry(DOME_RADIUS, 32, 16), material);
  mesh.name = "garden-sky-dome";
  mesh.visible = true;
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return { material, mesh };
}

/**
 * W2.7 (sky-6): 1,200 stars with magnitudes — 80 % faint 1 px, 18 % 1.5 px,
 * 2 % bright 2.2 px — that only shimmer, ±12 % on their own 6–11 s rhythm and
 * only near the horizon where the air is thick; they never blink. The field
 * turns with sidereal time (`uCelestialFrame`'s inverse is the points'
 * rotation), so 22:00 and 02:30 show different skies. Extinction fades them
 * into the horizon.
 */
function createStars(): { material: ShaderMaterial; points: Points } {
  const positions = new Float32Array(STAR_COUNT * 3);
  const phases = new Float32Array(STAR_COUNT);
  const rates = new Float32Array(STAR_COUNT);
  const magnitudes = new Float32Array(STAR_COUNT);
  // Deterministic scatter so the field is stable across reloads.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 0xffffffff;
  };
  const pole = CELESTIAL_POLE;
  const east = new Vector3(0, 1, 0).cross(pole).normalize();
  const north = pole.clone().cross(east);
  const [minDec, maxDec] = STAR_DECLINATION_RANGE;
  const sinMin = Math.sin(minDec);
  const sinMax = Math.sin(maxDec);
  const r = DOME_RADIUS * 0.94;
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const ra = rand() * Math.PI * 2;
    const sinDec = sinMin + rand() * (sinMax - sinMin);
    const cosDec = Math.sqrt(1 - sinDec * sinDec);
    positions[i * 3] = r * (pole.x * sinDec + (east.x * Math.cos(ra) + north.x * Math.sin(ra)) * cosDec);
    positions[i * 3 + 1] = r * (pole.y * sinDec + (east.y * Math.cos(ra) + north.y * Math.sin(ra)) * cosDec);
    positions[i * 3 + 2] = r * (pole.z * sinDec + (east.z * Math.cos(ra) + north.z * Math.sin(ra)) * cosDec);
    phases[i] = rand();
    rates[i] = 6 + rand() * 5;
    const class_ = rand();
    magnitudes[i] = class_ < 0.8 ? 0 : class_ < 0.98 ? 1 : 2;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  geometry.setAttribute("aRate", new BufferAttribute(rates, 1));
  geometry.setAttribute("aMag", new BufferAttribute(magnitudes, 1));
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fog: false,
    transparent: true,
    uniforms: {
      uColor: { value: STAR_COLOR.clone() },
      uOpacity: { value: 0 },
      uScintillation: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aMag;
      attribute float aPhase;
      attribute float aRate;
      uniform float uOpacity;
      uniform float uScintillation;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        float y = normalize(mat3(modelMatrix) * position).y;
        float size = aMag > 1.5 ? 2.2 : (aMag > 0.5 ? 1.5 : 1.0);
        float alpha = aMag > 1.5 ? 1.0 : (aMag > 0.5 ? 0.6 : 0.3);
        float lowAir = 1.0 - smoothstep(0.05, 0.25, y);
        float shimmer = 1.0 + 0.12 * lowAir * uScintillation
          * sin(uTime * 6.2831853 / aRate + aPhase * 6.2831853);
        vAlpha = alpha * shimmer * smoothstep(0.005, 0.05, y) * uOpacity;
        gl_PointSize = size;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = (1.0 - smoothstep(0.3, 0.5, d)) * vAlpha;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  const points = new Points(geometry, material);
  points.name = "garden-sky-stars";
  points.renderOrder = -1;
  points.frustumCulled = false;
  return { material, points };
}


export function createGardenSky(season: GardenSeason = "spring"): GardenSky {
  const root = new Group();
  root.name = "garden-sky";
  const dome = createDome();
  const stars = createStars();
  const celestial = new Group();
  celestial.name = "garden-sky-celestial";
  celestial.add(dome.mesh, stars.points);
  // Only the celestial group follows the eye; the stale-source banks are
  // world-anchored.
  const billboards = createGardenSkyBillboards();
  let clarity = NEUTRAL_SKY_CLARITY;
  const clarityFade = createSkyClarityFade();
  let displayedClarity = signedSkyClarity(NEUTRAL_SKY_CLARITY);
  // X3: the cloud cover eases with the air; the noise pack is leased once.
  const coverFade = createSkyClarityFade();
  let cloudCover = skyCloudCover(NEUTRAL_SKY_CLARITY);
  let cloudVeil = 0;
  let lastCloudSeconds = 0;
  let hadReading = false;
  let snapToReading = false;
  const noiseLease = acquireGardenNoisePack(() => {
    dome.material.uniforms.uCloudReady.value = 1;
  });
  dome.material.uniforms.uNoisePack.value = noiseLease?.texture ?? null;
  root.add(
    celestial,
    billboards.localMist.mesh,
  );

  // Fog enables the built-in material hook and retains fleet/chroma metadata.
  // Its CPU colour is the shared transport horizon, also used by stale banks.
  const fog = new Fog(DAY_CYCLE_SKY_PRESETS.night.fog.clone(), FOG_NEAR, FOG_FAR);

  // Scratch objects for the per-frame billboard writes — the frame path must
  // not allocate, so the uniforms hold these instances and `update` mutates
  // them in place.
  const sunColor = dome.material.uniforms.uSunColor.value as Color;
  const sunDir = dome.material.uniforms.uSunDir.value as Vector3;
  const scratchSunPose = { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2 };
  const atmosphereDirection = new Vector3();
  const atmosphereColor = new Color();
  const mistColor = new Color();
  const winterFog = new Color(HARBOR_PALETTE.fog_blue);
  const scratchCloudMoon = new Color();
  const scratchCloudNight = new Color();
  const cloudDiffuse = new Color();
  const cloudDirect = new Color();
  const solarHorizon = dome.material.uniforms.uSolarHorizon.value as Color;
  const antiHorizon = dome.material.uniforms.uAntiHorizon.value as Color;
  const moonDir = dome.material.uniforms.uMoonDir.value as Vector3;
  const moonColor = dome.material.uniforms.uMoonColor.value as Color;
  const moonPhaseLight = dome.material.uniforms.uMoonPhaseLight.value as Vector3;
  const celestialFrame = dome.material.uniforms.uCelestialFrame.value as Matrix3;
  const celestialRotation = new Matrix4();
  const scratchMoon: GardenMoonState = {
    up: false,
    azimuthRad: 0,
    elevationRad: 0,
    illumination: 0,
    waxing: true,
    presence: 0,
    ageDays: 0,
  };
  let skyDay: GardenSkyDay = gardenSkyToday();
  const windDir = new Vector2(-0.855, 0.519);
  const cloudOffset = dome.material.uniforms.uCloudOffset.value as Vector2;
  const cloudLit = dome.material.uniforms.uCloudLit.value as Color;
  const cloudShade = dome.material.uniforms.uCloudShade.value as Color;
  const cloudLightDir = dome.material.uniforms.uCloudLightDir.value as Vector3;
  const cloudLitCool = dome.material.uniforms.uCloudLitCool.value as Color;
  const cloudCrownDir = dome.material.uniforms.uCloudCrownDir.value as Vector3;
  billboards.localMist.material.uniforms.uColor.value = mistColor;

  const applyPhase = (phase: DayCyclePhase, wallClockHour: number): void => {
    const { daylight, dusk } = phase;
    skyDay = gardenSkyToday();
    const beats = dayCycleBeats(wallClockHour, skyDay);
    dome.material.uniforms.uAtmosphereDate.value = Math.floor(skyDay.julianDayAtLocalMidnight);
    gardenSunPose(wallClockHour, scratchSunPose);
    sunDir.copy(scratchSunPose.direction);
    GARDEN_AIR.sunDir.copy(sunDir);
    writeGardenAtmosphereCoefficients(GARDEN_AIR.rayleigh, GARDEN_AIR.mie, displayedClarity);
    const zenith = dome.material.uniforms.uZenith.value as Color;
    blendGardenSkyColor(zenith, beats, "zenith");
    blendGardenSkyColor(solarHorizon, beats, "solar");
    blendGardenSkyColor(antiHorizon, beats, "anti");
    blendGardenSkyColor(fog.color, beats, "horizon");
    if (season === "winter") {
      // Kigo stays a small atmospheric bias: cooler air and a light value-
      // preserving desaturation, never a fourth grade or a semantic color.
      fog.color.lerp(winterFog, 0.1);
      zenith.lerp(winterFog, 0.04);
      solarHorizon.lerp(winterFog, 0.1);
      antiHorizon.lerp(winterFog, 0.1);
    }
    // W2.2 (sky-1): the anti-solar belt, only between sunset and nautical
    // dusk (and the mirrored dawn span), keyed to the true solar elevation.
    // The Earth's shadow also darkens the anti-solar horizon itself, so the
    // air and the sea under that side of the sky go slate with it.
    const solarElevation = gardenSolarElevationAt(skyDay, wallClockHour);
    const belt = (1 - MathUtils.smoothstep(solarElevation, -0.02, 0.04))
      * MathUtils.smoothstep(solarElevation, -0.16, -0.06);
    dome.material.uniforms.uBeltStrength.value = belt;
    antiHorizon.lerp(GARDEN_SKY_BELT.earthShadow, belt * 0.6);
    // The broad solar glow lives from just before sunrise to just after sunset;
    // a high veil (X4) dims it.
    dome.material.uniforms.uGlow.value = MathUtils.smoothstep(solarElevation, -0.12, 0.05)
      * (0.08 + 0.5 * beats.golden + 0.32 * beats.dawn + 0.18 * beats.blue)
      * (1 - 0.6 * cloudVeil);

    // W2.7: the heavens turn by sidereal time about the celestial pole. The
    // star points carry the rotation; the dome's Milky Way reads the inverse.
    const siderealHours = wallClockHour - STAR_REFERENCE_HOUR
      + (skyDay.julianDayAtLocalMidnight - STAR_REFERENCE_JD) * SIDEREAL_HOURS_PER_DAY;
    // Negative about the pole on the viewer's left: stars rise ahead and climb
    // to the right. South of the equator the turn runs the other way.
    const turn = -siderealHours * 15 * DEG * (skyDay.southern ? -1 : 1);
    stars.points.quaternion.setFromAxisAngle(CELESTIAL_POLE, turn);
    celestialRotation.makeRotationFromQuaternion(stars.points.quaternion);
    celestialFrame.setFromMatrix4(celestialRotation).transpose();
    // applyPhase alone has no displayed celestial frame; update restores it.
    // The baker temporarily suppresses discs only while rendering the probe.
    dome.material.uniforms.uMoonVisible.value = 0;
    dome.material.uniforms.uMoonDay.value = 0;
    dome.material.uniforms.uMilkyWay.value = 0;

    // One solar arc drives sky transport, direct light and water glitter.
    sunColor.setRGB(0, 0, 0);
    for (const beat of SKY_BEAT_NAMES) {
      const color = DAY_CYCLE_LIGHT_PRESETS[beat].dirColor;
      sunColor.r += color.r * beats[beat];
      sunColor.g += color.g * beats[beat];
      sunColor.b += color.b * beats[beat];
    }
    dome.material.uniforms.uScattering.value = Math.min(1, daylight + dusk * 0.7);
    dome.material.uniforms.uSunIntensity.value = daylight * GARDEN_ATMOSPHERE.sunDiscRadiance + dusk * 1.3;
    dome.material.uniforms.uBokashiAmount.value = gardenBokashiAmount(phase);
    updateGardenAerial({
      phase, solarHorizon, antiHorizon, sunDir,
      seaLevel: GARDEN_WATER_Y, clarity: displayedClarity,
      skyVisibleHeight: dome.material.uniforms.uSkyVisibleHeight.value as number,
    });
    // Authored twilight stays an unscattered basis: the fragment mixes the
    // analytic sky once, rather than spreading the forward solar lobe twice.
    // Noon retains its analytic CPU uniforms for the probe and other consumers.
    const analytic = beats.day;
    atmosphereDirection.set(sunDir.x, 0, sunDir.z);
    atmosphereDirection.divideScalar(Math.max(atmosphereDirection.length(), 1e-4));
    writeGardenAtmosphereSky(atmosphereColor, atmosphereDirection, sunDir, GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
    solarHorizon.lerp(atmosphereColor, analytic);
    atmosphereDirection.negate();
    writeGardenAtmosphereSky(atmosphereColor, atmosphereDirection, sunDir, GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
    antiHorizon.lerp(atmosphereColor, analytic);
    atmosphereDirection.set(0, 1, 0);
    writeGardenAtmosphereSky(atmosphereColor, atmosphereDirection, sunDir, GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
    zenith.lerp(atmosphereColor, analytic);
    fog.color.copy(solarHorizon).lerp(antiHorizon, 0.5);
  };

  return {
    applyPhase,
    setClarity(value, reading = true) {
      clarity = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : NEUTRAL_SKY_CLARITY;
      // Only the session's first reading snaps; a later outage and recovery ease.
      if (reading && !hadReading) snapToReading = true;
      hadReading ||= reading;
    },
    dispose() {
      dome.mesh.geometry.dispose();
      dome.mesh.material.dispose();
      stars.points.geometry.dispose();
      stars.material.dispose();
      billboards.dispose();
      noiseLease?.release();
    },
    domeMaterial: dome.material,
    fog,
    get signedClarity() {
      return displayedClarity;
    },
    root,
    update(phase, frame) {
      if (frame.viewAspect !== undefined) setGardenSkyViewAspect(frame.viewAspect);
      root.position.set(frame.targetX, 0, frame.targetZ);
      celestial.position.set(
        frame.cameraPosition.x - frame.targetX,
        frame.cameraPosition.y,
        frame.cameraPosition.z - frame.targetZ,
      );
      const eyeHeight = frame.cameraPosition.y - frame.targetY;
      const distance = Math.hypot(
        frame.cameraPosition.x - frame.targetX,
        eyeHeight,
        frame.cameraPosition.z - frame.targetZ,
      );
      const pitch = Math.asin(MathUtils.clamp(eyeHeight / Math.max(distance, 1e-4), -1, 1));
      // Spend the gradient ladder between the sea horizon and the top row,
      // never over less than 6° of sky (the whole-map step, critic D12).
      dome.material.uniforms.uSkyVisibleHeight.value = gardenSkyVisibleHeight(pitch);
      // X3 debug seam: `sky=BAND` draws that band's cover and air, snapped.
      const forcedClarity = psiBandClarity(debugSkyBand());
      const skyClarity = forcedClarity ?? clarity;
      // A band change eases over 90 s, but the first real reading (and a debug
      // pin) snaps: the sky must not spend its first minute and a half drifting
      // away from the neutral pre-data veil while the words already name the band.
      const snap = frame.reducedMotion || forcedClarity !== null || snapToReading;
      snapToReading = false;
      displayedClarity = advanceSkyClarityFade(
        clarityFade,
        signedSkyClarity(skyClarity),
        Math.max(0, frame.timeSeconds),
        snap,
      );
      cloudCover = advanceSkyClarityFade(coverFade, skyCloudCover(skyClarity), Math.max(0, frame.timeSeconds), snap);
      const cover = cloudCover;
      // Six continuous morphologies share the accepted/eased cover control.
      cloudVeil = MathUtils.smoothstep(cover, 0.15, 0.3)
        * (1 - MathUtils.smoothstep(cover, 0.3, 0.45));
      const deck = MathUtils.smoothstep(cover, 0.3, 0.75);
      dome.material.uniforms.uCloudCover.value = cover;
      dome.material.uniforms.uCloudHighThreshold.value = CLOUD_THRESHOLD[0]
        - CLOUD_THRESHOLD[1] * Math.min(cover, 0.3);
      dome.material.uniforms.uCloudHighAlpha.value = 0.65 - 0.27 * cloudVeil;
      dome.material.uniforms.uCloudVeil.value = cloudVeil;
      dome.material.uniforms.uCloudDeck.value = deck;
      // Metadata ladder for fleet/chroma consumers only, not an eye-fitted wash.
      fog.near = FOG_NEAR * (1 + displayedClarity * 0.15);
      fog.far = FOG_FAR * (1 + displayedClarity * 0.15);
      applyPhase(phase, frame.wallClockHour);
      const { daylight, dusk, night } = phase;

      // W2.6 (sky-5): the real moon, drawn in the dome at the displayed pose
      // every other consumer reads (garden-sun `gardenMoonPose`).
      const moon = gardenMoonStateAt(skyDay, frame.wallClockHour, gardenSkyViewAspect(), scratchMoon);
      const moonCosEl = Math.cos(moon.elevationRad);
      moonDir.set(
        Math.cos(moon.azimuthRad) * moonCosEl,
        Math.sin(moon.elevationRad),
        Math.sin(moon.azimuthRad) * moonCosEl,
      );
      // Phase angle: 0 at full (lit from behind the viewer), π at new. The lit
      // limb faces the sun's side — right while waxing, left while waning,
      // mirrored south of the equator — tipped a little toward the set sun.
      const phaseAngle = Math.PI * Math.abs(1 - (2 * moon.ageDays) / 29.530589);
      const litSide = (moon.waxing ? 1 : -1) * (skyDay.southern ? -1 : 1);
      moonPhaseLight.set(
        litSide * Math.sin(phaseAngle),
        -0.25 * Math.sin(phaseAngle),
        Math.cos(phaseAngle),
      ).normalize();
      // Low-moon warmth: it rises amber through the thick air.
      const lowMoon = 1 - MathUtils.smoothstep(moon.elevationRad, 0.5 * DEG, 6 * DEG);
      moonColor.copy(MOON_DISC_BASE).lerp(MOON_LOW_WARMTH, 0.35 * lowMoon).multiplyScalar(MOON_DISC_LINEAR);
      // The painted clouds veil the disc themselves (they are drawn over it).
      const moonClear = moon.presence;
      dome.material.uniforms.uMoonVisible.value = moonClear * Math.min(1, night + dusk * 0.6);
      dome.material.uniforms.uMoonDay.value = moonClear * daylight * MOON_DAY_STRENGTH;
      dome.material.uniforms.uMoonIllumination.value = moon.illumination;
      const moonLight = moon.presence * moon.illumination;

      // W2.7 (sky-6): cloud cover veils the stars without recolouring them,
      // and a bright moon washes the faint ones out.
      const starOpacity = Math.min(1, dusk * 0.35 + night)
        * (1 - 0.85 * MathUtils.smoothstep(cover, 0.2, 0.9)) * (1 - 0.55 * moonLight);
      stars.material.uniforms.uOpacity.value = starOpacity;
      stars.material.uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      stars.material.uniforms.uScintillation.value = frame.reducedMotion ? 0 : 1;
      stars.points.visible = starOpacity > 0.01;
      // O20: the Milky Way only on moonless, clear nights.
      dome.material.uniforms.uMilkyWay.value = night * (1 - moonLight)
        * (1 - MathUtils.smoothstep(cover, 0.1, 0.5)) * MILKY_WAY_PEAK;

      // X3: the cloud field's light, value-led and low in chroma, like a
      // woodblock plate. By day and dusk the sun: tops lit at noon, warm light
      // on the undersides low on the sun's side at golden (the shader keeps it
      // there), grading into cool violet-grey bodies. After dark the bodies
      // are indigo a step above and below the sky itself — never lit by the
      // moon's cyan, which only silvers edges within ~12° of the disc.
      cloudLightDir.copy(night > 0.5 && moonLight > 0.02 ? moonDir : sunDir);
      const trueSolarElevation = gardenSolarElevationAt(skyDay, frame.wallClockHour);
      const lowSun = MathUtils.smoothstep(trueSolarElevation, -0.05, 0.02)
        * (1 - MathUtils.smoothstep(trueSolarElevation, 0.08, 0.3));
      const zenithNow = dome.material.uniforms.uZenith.value as Color;
      cloudLit.copy(solarHorizon).lerp(CLOUD_WHITE, 0.25 * daylight).multiplyScalar(0.86);
      desaturate(cloudLit, 0.5 * lowSun);
      cloudLitCool.copy(cloudLit);
      desaturate(cloudLitCool, 1).lerp(antiHorizon, 0.35);
      cloudShade.copy(antiHorizon).lerp(zenithNow, 0.35).multiplyScalar(0.8 * (1 - 0.22 * deck));
      desaturate(cloudShade, 0.25);
      // A sight ray at the solar horizon is the forward Mie lobe, not the
      // irradiance received by every cloud. Integrate a cosine-weighted sky
      // hemisphere instead (four azimuths at its equal-area midpoint).
      // Keep the accepted high-sun and lunar paths exactly as authored.
      const cloudTransport = (1 - night) * (1 - MathUtils.smoothstep(sunDir.y, 0.08, 0.45));
      if (cloudTransport > 0) {
        cloudDiffuse.setRGB(0, 0, 0);
        for (let sample = 0; sample < 4; sample++) {
          atmosphereDirection.set(
            sample === 0 ? Math.SQRT1_2 : sample === 1 ? -Math.SQRT1_2 : 0,
            Math.SQRT1_2,
            sample === 2 ? Math.SQRT1_2 : sample === 3 ? -Math.SQRT1_2 : 0,
          );
          writeGardenAtmosphereSky(atmosphereColor, atmosphereDirection, sunDir, GARDEN_AIR.rayleigh, GARDEN_AIR.mie);
          cloudDiffuse.add(atmosphereColor.multiplyScalar(0.25));
        }
        cloudDiffuse.multiply(CLOUD_WHITE);
        cloudDirect.copy(sunColor).multiply(CLOUD_WHITE)
          .multiplyScalar(Math.max(0, sunDir.y) * (dome.material.uniforms.uSunIntensity.value as number));
        cloudLit.lerp(atmosphereColor.copy(cloudDiffuse).add(cloudDirect), cloudTransport);
        cloudLitCool.lerp(cloudDiffuse, cloudTransport);
        cloudShade.lerp(atmosphereColor.copy(cloudDiffuse).multiplyScalar(0.8 * (1 - 0.22 * deck)), cloudTransport);
      }
      scratchCloudNight.copy(solarHorizon).lerp(zenithNow, 0.5).multiplyScalar(1.12);
      cloudLit.lerp(scratchCloudNight, night);
      cloudLitCool.lerp(scratchCloudNight, night);
      cloudShade.lerp(scratchCloudMoon.copy(zenithNow).multiplyScalar(0.82 * (1 - 0.15 * deck)), night);
      dome.material.uniforms.uCloudRim.value = night * moonLight * 0.35;
      // Aim the crown clearing at the lantern (published by the lighthouse).
      const crown = GARDEN_AIR.beaconWorld;
      if (crown.lengthSq() > 0) {
        cloudCrownDir.set(
          crown.x - frame.cameraPosition.x,
          crown.y - frame.cameraPosition.y,
          crown.z - frame.cameraPosition.z,
        );
        const crownDistance = cloudCrownDir.length();
        cloudCrownDir.divideScalar(Math.max(crownDistance, 1e-3));
        dome.material.uniforms.uCloudCrownRadius.value = Math.max(1.2 * DEG, Math.atan(CLOUD_CROWN_CLEAR_UNITS / Math.max(crownDistance, 1e-3)));
      }
      dome.material.uniforms.uCloudRays.value = deck
        * MathUtils.smoothstep(trueSolarElevation, -0.03, 0.03)
        * (1 - MathUtils.smoothstep(trueSolarElevation, 0.05, 0.35));
      // The field drifts on the shared wind; reduced motion holds it still.
      const seconds = Math.max(0, frame.timeSeconds);
      const dt = frame.reducedMotion ? 0 : Math.min(0.25, Math.max(0, seconds - lastCloudSeconds));
      lastCloudSeconds = seconds;
      windDir.set(frame.wind?.x ?? -0.855, frame.wind?.y ?? 0.519);
      const drift = CLOUD_DRIFT * Math.min(1, frame.wind?.speed ?? 0.3) * dt;
      cloudOffset.x = (cloudOffset.x + (windDir.x * CLOUD_AXIS_A.x + windDir.y * CLOUD_AXIS_A.y) * drift) % CLOUD_WRAP[0];
      cloudOffset.y = (cloudOffset.y + (windDir.x * CLOUD_AXIS_B.x + windDir.y * CLOUD_AXIS_B.y) * drift) % CLOUD_WRAP[1];
      dome.material.uniforms.uCloudRaysTime.value = (seconds * 0.0004) % 1;

      // W2.5: the only low mist is a stale source's own bounded bank.
      mistColor.copy(fog.color);
      billboards.setFogBanks(frame.epistemicBanks ?? [], frame.targetX, frame.targetZ);
      billboards.localMist.mesh.visible = (frame.billboards ?? true) && billboards.localMist.mesh.count > 0;
    },
  };
}
