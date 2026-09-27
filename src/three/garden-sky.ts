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
  TILE_SCALE,
} from "../systems/projection";
import {
  GARDEN_ISLAND_TILE_OFFSET,
  GARDEN_WATER_Y,
} from "../systems/garden-observatory-slice";
import type { GardenSeason } from "../systems/season";
import { createGardenSkyBillboards } from "./garden-sky-billboards";
import {
  advanceSkyClarityFade,
  createSkyClarityFade,
  NEUTRAL_SKY_CLARITY,
  signedSkyClarity,
} from "../systems/psi-sky";
import { GARDEN_AIR, updateGardenAerial } from "./garden-aerial";
import type { EpistemicFogBank } from "../systems/epistemic-haze";
import {
  blendDayCycleColor,
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
  // Print-gate tune: noon air is MIDDLE-value blue (horizon L* ≈ 71 / 54 in,
  // was 95 / 84), so the side-lit limestone stands brighter than its air; the
  // zenith is lifted (L* 55 → 65) so the top row keeps its cerulean.
  day: { zenith: new Color(0x70a3d4), solar: new Color(0x9cb1ca), anti: new Color(0x6a82a8) },
  // Golden faces away from the sun at the rest seat (the key is behind the
  // viewer's right shoulder), so the frame's sky is the anti side: a cool
  // violet-BLUE (hue ≈ 235°, was a 260° lavender) that the warm lit planes
  // read against. The warmth stays on the solar horizon and the lit stone.
  golden: { zenith: new Color(0x6e70a2), solar: new Color(0xf0b070), anti: new Color(0x8f95bf) },
  blue: { zenith: new Color(0x202c59), solar: new Color(0xb98a6e), anti: new Color(0x58648a) },
  // W1.8 (sky-6): authored to land AFTER the night chain (grade, Neutral tone
  // map at 1.12, night LUT) on frame-top zenith #0e1530 (L* ≈ 7.5, under the
  // 0.76 deep bokashi band) and horizon #1b2440 (L* ≈ 15): a luminous indigo
  // horizon the ridges, masts and tower read against as ink. The inputs look
  // grey because the tone map's toe subtracts the smallest channel; the old
  // #050918 / #11182c rendered at L* 0.9 / 3.4 — black paper.
  night: { zenith: new Color(0x35394c), solar: new Color(0x393e50), anti: new Color(0x393e50) },
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

/** "horizon" is the side-less mean of the solar and anti-solar horizons. */
export function blendGardenSkyColor(
  target: Color,
  beats: DayCycleBeats,
  channel: "zenith" | "solar" | "anti" | "horizon",
): Color {
  target.setRGB(0, 0, 0);
  for (const beat of SKY_BEAT_NAMES) {
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
// The fog ladder is authored from world landmarks, then measured from the
// current perspective eye. Rest framing is solved per viewport, so neither end
// may be derived from an assumed zoom.
const FOG_ISLAND_MARGIN = 12;
const FOG_ISLAND_X = (60 + GARDEN_ISLAND_TILE_OFFSET.x - 12) * TILE_SCALE;
const FOG_ISLAND_Z = (70 + GARDEN_ISLAND_TILE_OFFSET.y - 12) * TILE_SCALE;
const FOG_FAR_EDGE = 70 * TILE_SCALE;
const FOG_NEAR = 200;
const FOG_FAR = 400;
// The nearer far-plate edge lands at ~35 % fog (the sky test's ≥30 % floor)
// rather than 100 %, so far quays and headlands keep a silhouette. The seat-C
// rest eye stands off the south-east corner looking north-west, so the west
// edge is ~40 u nearer than the north one; fitting the nearer edge keeps both
// in haze, and the farther one reads deeper, as aerial perspective should.
const FOG_FAR_BEYOND_EDGE = 1.26;

/**
 * The air ladder, fitted to the eye: `near` is where the island's far rim reads
 * and `far` is the plate edge's place on the ladder. garden-aerial fits its
 * extinction to these two distances; the keyline and the fleet's chroma
 * restraint read them too. K39: clear air is earned — positive signed clarity
 * pushes the ladder out, negative clarity pulls it in.
 */
function fogRangeAtViewHeight(
  fog: Fog,
  eye: { x: number; y: number; z: number },
  signedClarity: number,
): void {
  const islandDistance = Math.hypot(
    eye.x - FOG_ISLAND_X,
    eye.y - GARDEN_WATER_Y,
    eye.z - FOG_ISLAND_Z,
  );
  const farEdgeDistance = Math.min(
    Math.hypot(eye.x, eye.y - GARDEN_WATER_Y, eye.z - FOG_FAR_EDGE),
    Math.hypot(eye.x - FOG_FAR_EDGE, eye.y - GARDEN_WATER_Y, eye.z),
  );
  const clear = Math.max(signedClarity, 0);
  const veiled = Math.max(-signedClarity, 0);
  fog.near = (islandDistance + FOG_ISLAND_MARGIN) * (1 + clear * 0.15 - veiled * 0.2);
  fog.far = farEdgeDistance * FOG_FAR_BEYOND_EDGE * (1 + clear * 0.15 - veiled * 0.16);
}

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

// The first follow-up baseline disables the detached cumulus sprites that read
// as pale pills at whole-map zoom. Keep the implementation for controlled A/B
// work. W2.3/W2.5: the far mist banks are gone — by day, mist means a stale
// source; the ridge-foot kasumi lives in garden-horizon.
export const GARDEN_CUMULUS_BILLBOARDS_ENABLED = false;
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


// Phase-lit cloud palette — every swatch derived from the authored day-cycle
// presets and HARBOR_PALETTE, blended per frame with the one scene blend law.
const CLOUD_BODY_DAY = new Color(HARBOR_PALETTE.foam_white)
  .lerp(DAY_CYCLE_SKY_PRESETS.day.horizon, 0.18);
const CLOUD_BODY_DUSK = DAY_CYCLE_SKY_PRESETS.dusk.horizon.clone();
const CLOUD_BODY_NIGHT = DAY_CYCLE_SKY_PRESETS.night.zenith.clone()
  .lerp(MOON_COLOR, 0.3);
const CLOUD_SHADE_DAY = DAY_CYCLE_SKY_PRESETS.day.zenith.clone()
  .lerp(new Color(HARBOR_PALETTE.foam_white), 0.3);
const CLOUD_SHADE_DUSK = DAY_CYCLE_SKY_PRESETS.night.horizon.clone();
const CLOUD_SHADE_NIGHT = DAY_CYCLE_SKY_PRESETS.night.zenith.clone();

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
  /** Target PSI clarity (0..1, psi-sky); the air eases toward it over 90 s. */
  setClarity: (clarity: number) => void;
  /** The displayed signed clarity (−1…+1) the air and the far ridges draw. */
  readonly signedClarity: number;
  /**
   * The phase-only half of `update`: the dome uniforms and the fog colour, which
   * are graded from the day-cycle blend and from nothing else.
   *
   * It is separate because `garden-environment` bakes its PMREM probe from THIS
   * material, and it has to bake EARLY in the frame — before the renderer resets
   * its per-frame `renderer.info` counters, or the bake's six-face cube render
   * would spike the frame's draw-call total against the 700 budget. `update`
   * runs much later, inside the scene pass. So the renderer grades the dome for
   * the frame's phase first, then bakes, then updates.
   *
   * Without that split the first bake of a session rendered the colours the
   * uniforms are CONSTRUCTED with — the night preset — and cached them under
   * whatever key the current hour produced. At midday the key never moves again,
   * so every metal surface in the world stayed lit by a night probe for the
   * whole flat middle of the day.
   *
   * Idempotent, and `update` calls it, so grading once or twice a frame is the
   * same picture.
   */
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
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: BackSide,
    uniforms: {
      uAirAnti: { value: DAY_CYCLE_SKY_PRESETS.night.fog.clone() },
      uAirSun: { value: DAY_CYCLE_SKY_PRESETS.night.fog.clone() },
      uAntiHorizon: { value: GARDEN_SKY_BEATS.night.anti.clone() },
      uBeltColor: { value: GARDEN_SKY_BELT.rose.clone() },
      uBeltStrength: { value: 0 },
      uBokashiAmount: { value: 1 },
      uCelestialFrame: { value: new Matrix3() },
      uEarthShadowColor: { value: GARDEN_SKY_BELT.earthShadow.clone() },
      uGlow: { value: 0 },
      uHazeColor: { value: DAY_CYCLE_SKY_PRESETS.night.fog.clone() },
      uHazeStrength: { value: 0 },
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
      uniform vec3 uAirAnti;
      uniform vec3 uAirSun;
      uniform vec3 uAntiHorizon;
      uniform vec3 uBeltColor;
      uniform float uBeltStrength;
      uniform float uBokashiAmount;
      uniform mat3 uCelestialFrame;
      uniform vec3 uEarthShadowColor;
      uniform float uGlow;
      uniform vec3 uHazeColor;
      uniform float uHazeStrength;
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
      varying vec3 vRay;
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
        // Between sunset and nautical dusk: the Earth's shadow, a slate band on
        // the anti-solar horizon, under the Belt of Venus, a dusty rose.
        float antiSide = (1.0 - smoothstep(-0.8, 0.0, sunAlign)) * uBeltStrength;
        // Heights: slate to ≈ 3° (clear of the ridge feet), rose ≈ 3–8°.
        color = mix(color, uEarthShadowColor, (1.0 - smoothstep(0.03, 0.055, dir.y)) * antiSide);
        color = mix(color, uBeltColor, smoothstep(0.045, 0.07, dir.y) * (1.0 - smoothstep(0.1, 0.16, dir.y)) * antiSide);

        float mu = dot(dir, uSunDir);
        float up = max(dir.y, 0.0);
        float visibleHemisphere = 1.0 - step(0.0, dir.y);
        float visibleSeam = 1.0 - smoothstep(0.035, 0.38, skyHeight);
        float airMass = mix(exp(-up * 3.0), visibleSeam, visibleHemisphere);
        float rayPhase = 0.75 * (1.0 + mu * mu);
        float rayleigh = mix(0.82, 1.12, (1.0 - airMass) * rayPhase * 0.5);
        color *= mix(1.0, rayleigh, uScattering);
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(luma), color, 1.0 + uScattering * 0.3 * (1.0 - airMass));
        color = mix(color, horizon, uScattering * airMass * airMass * 0.3);
        float corona = pow(max(mu, 0.0), 220.0);
        float disc = smoothstep(0.99955, 0.99985, mu);
        color += uSunColor * (corona * 0.5 + disc) * uSunIntensity;

        float hazeBand = mix(
          (1.0 - smoothstep(-0.02, 0.24, dir.y)),
          visibleSeam,
          visibleHemisphere
        );
        color = mix(color, uHazeColor, hazeBand * uHazeStrength);

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

        // The sea below the horizon and the seam draw the air the world fades
        // to (garden-aerial), by the same side law, with the ichimonji: a
        // 2–3 px darker line where sky meets sea. Only near the rest/near-rig
        // pitch: pulled out to the chart the horizon is a curve high in the
        // frame, and a line there reads as a scratch.
        float ichimonjiGain = 0.06 * smoothstep(0.11, 0.18, uSkyVisibleHeight);
        float ichimonji = 1.0 - ichimonjiGain * (1.0 - smoothstep(0.0, 0.0035, abs(dir.y + 0.0015)));
        vec3 air = mix(uAirAnti, uAirSun, sunSide) * ichimonji;
        color = mix(air, color, smoothstep(0.0, 0.12, skyHeight));
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
  // Mist and clouds stay over the world; only the celestial group follows
  // the eye. Their radial falloff replaces the old hard-edged mist plane.
  const billboards = createGardenSkyBillboards();
  let clarity = NEUTRAL_SKY_CLARITY;
  const clarityFade = createSkyClarityFade();
  let displayedClarity = signedSkyClarity(NEUTRAL_SKY_CLARITY);
  root.add(
    celestial,
    billboards.clouds.mesh,
    billboards.localMist.mesh,
  );

  // scene.fog keeps the USE_FOG define and the fitted air ladder (near/far);
  // garden-aerial owns the colour law. Its colour is the view-averaged horizon,
  // shared with the dome's haze band and the stale-bank billboards.
  const fog = new Fog(DAY_CYCLE_SKY_PRESETS.night.fog.clone(), FOG_NEAR, FOG_FAR);
  dome.material.uniforms.uHazeColor.value = fog.color;
  // The dome's lower hemisphere and seam draw the SAME air the world fades to.
  if (dome.material.uniforms.uAirSun) dome.material.uniforms.uAirSun.value = GARDEN_AIR.airSun;
  if (dome.material.uniforms.uAirAnti) dome.material.uniforms.uAirAnti.value = GARDEN_AIR.airAnti;
  const airSunPose = { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2 };

  // Scratch objects for the per-frame billboard writes — the frame path must
  // not allocate, so the uniforms hold these instances and `update` mutates
  // them in place.
  const sunColor = dome.material.uniforms.uSunColor.value as Color;
  const sunDir = dome.material.uniforms.uSunDir.value as Vector3;
  const mistColor = new Color();
  const cloudBodyColor = new Color();
  const cloudShadeColor = new Color();
  const winterFog = new Color(HARBOR_PALETTE.fog_blue);
  const sunQuadDir = new Vector2(0, 1);
  const scratchSunPose = { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2 };
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
  billboards.localMist.material.uniforms.uColor.value = mistColor;
  billboards.clouds.material.uniforms.uBodyColor.value = cloudBodyColor;
  billboards.clouds.material.uniforms.uShadeColor.value = cloudShadeColor;
  // The cumulus lit edge shares the dome's own sun colour, so the clouds, the
  // dome's Mie glow and the water's glitter all take the light rig's tint.
  billboards.clouds.material.uniforms.uLitColor.value = sunColor;
  billboards.clouds.material.uniforms.uSunQuadDir.value = sunQuadDir;
  billboards.clouds.material.uniforms.uWindDir.value = windDir;

  const applyPhase = (phase: DayCyclePhase, wallClockHour: number): void => {
    const { daylight, dusk } = phase;
    skyDay = gardenSkyToday();
    const beats = dayCycleBeats(wallClockHour, skyDay);
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
    // The broad solar glow lives from just before sunrise to just after sunset.
    dome.material.uniforms.uGlow.value = MathUtils.smoothstep(solarElevation, -0.12, 0.05)
      * (0.08 + 0.32 * (beats.golden + beats.dawn) + 0.18 * beats.blue);

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
    // The environment probe bakes from this material between here and
    // `update`. It must not hold a moon: the water's drawn road (K4) is the
    // only moon reflection, and a baked disc would smear a second one across
    // every glossy surface. `update` draws the moon and the Milky Way again
    // for the frame itself.
    dome.material.uniforms.uMoonVisible.value = 0;
    dome.material.uniforms.uMoonDay.value = 0;
    dome.material.uniforms.uMilkyWay.value = 0;

    // Phase 2 (2c): the scattering field's drivers — the sun's direction from
    // the day cycle, the scattering strength (fading to zero at night), the
    // disc's HDR intensity (just over the bloom knee), and
    // the haze band's strength. The sun tint follows the light rig, the same
    // colour the water glitter uses. All of it is phase-derived, so the PMREM
    // bake right after this call sees the same sky the frame will grade.
    // The dome's sun is THE sun (garden-sun.ts), not a separate opinion about
    // it. Previously this slid a fixed azimuth up and down three authored
    // elevation constants, so the glow could never tell morning from evening —
    // the two hours share phase weights and differ only in bearing, which is
    // exactly what the old formula threw away.
    gardenSunPose(wallClockHour, scratchSunPose);
    sunDir.copy(scratchSunPose.direction);
    sunColor.setRGB(0, 0, 0);
    for (const beat of SKY_BEAT_NAMES) {
      const color = DAY_CYCLE_LIGHT_PRESETS[beat].dirColor;
      sunColor.r += color.r * beats[beat];
      sunColor.g += color.g * beats[beat];
      sunColor.b += color.b * beats[beat];
    }
    dome.material.uniforms.uScattering.value = Math.min(1, daylight + dusk * 0.7);
    dome.material.uniforms.uSunIntensity.value = daylight * 1.55 + dusk * 1.3;
    // W1.8/W2.5 (sky-2, data-poetry-1): the clear-sky floor is 0.12, and the
    // signed clarity moves it both ways — good markets thin it, bad ones thicken it.
    dome.material.uniforms.uHazeStrength.value = Math.min(
      0.8,
      0.12 - Math.max(displayedClarity, 0) * 0.06 + Math.max(-displayedClarity, 0) * 0.3,
    );
    dome.material.uniforms.uBokashiAmount.value = gardenBokashiAmount(phase);
  };

  return {
    applyPhase,
    setClarity(value) {
      clarity = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : NEUTRAL_SKY_CLARITY;
    },
    dispose() {
      dome.mesh.geometry.dispose();
      dome.mesh.material.dispose();
      stars.points.geometry.dispose();
      stars.material.dispose();
      billboards.dispose();
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
      const pitch = Math.asin(eyeHeight / distance);
      // Spend the gradient ladder between the sea horizon and the top row,
      // never over less than 6° of sky (the whole-map step, critic D12).
      dome.material.uniforms.uSkyVisibleHeight.value = gardenSkyVisibleHeight(pitch);
      displayedClarity = advanceSkyClarityFade(
        clarityFade,
        signedSkyClarity(clarity),
        Math.max(0, frame.timeSeconds),
        frame.reducedMotion,
      );
      const cover = Math.max(0, -displayedClarity) * (1 - NEUTRAL_SKY_CLARITY);
      fogRangeAtViewHeight(fog, frame.cameraPosition, displayedClarity);
      applyPhase(phase, frame.wallClockHour);
      gardenSunPose(frame.wallClockHour, airSunPose);
      const uniforms = dome.material.uniforms;
      updateGardenAerial({
        phase,
        beats: dayCycleBeats(frame.wallClockHour),
        solarHorizon: (uniforms.uSolarHorizon?.value as Color | undefined) ?? fog.color,
        antiHorizon: (uniforms.uAntiHorizon?.value as Color | undefined) ?? fog.color,
        sunDir: airSunPose.direction,
        solarElevation: airSunPose.elevation,
        hour: frame.wallClockHour,
        eye: frame.cameraPosition,
        near: fog.near,
        far: fog.far,
        seaLevel: GARDEN_WATER_Y,
        clarity: displayedClarity,
        skyVisibleHeight: dome.material.uniforms.uSkyVisibleHeight.value as number,
      });
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
      const moonClear = moon.presence * (1 - cover * 0.8);
      dome.material.uniforms.uMoonVisible.value = moonClear * Math.min(1, night + dusk * 0.6);
      dome.material.uniforms.uMoonDay.value = moonClear * daylight * MOON_DAY_STRENGTH;
      dome.material.uniforms.uMoonIllumination.value = moon.illumination;
      const moonLight = moon.presence * moon.illumination;

      // W2.7 (sky-6): PSI cover veils the stars without recolouring them, and
      // a bright moon washes the faint ones out.
      const starOpacity = Math.min(1, dusk * 0.35 + night) * (1 - cover * 0.85) * (1 - 0.55 * moonLight);
      stars.material.uniforms.uOpacity.value = starOpacity;
      stars.material.uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      stars.material.uniforms.uScintillation.value = frame.reducedMotion ? 0 : 1;
      stars.points.visible = starOpacity > 0.01;
      // O20: the Milky Way only on moonless, clear nights.
      dome.material.uniforms.uMilkyWay.value = night * (1 - moonLight) * (1 - cover) * MILKY_WAY_PEAK;

      // Phase 2 billboard atmosphere: shared time and wind for the cumulus
      // drift, and the caller's tier gate. Reduced motion pins the drift at
      // t = 0 — the static composition is a complete one.
      const showBillboards = frame.billboards ?? true;
      const billboardTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      windDir.set(frame.wind?.x ?? -0.855, frame.wind?.y ?? 0.519);
      const windSpeed = Math.min(1, (frame.wind?.speed ?? 0.3) * (1 + cover * 0.5));
      billboards.clouds.material.uniforms.uTime.value = billboardTime;
      billboards.clouds.material.uniforms.uWindSpeed.value = windSpeed;

      // W2.5: the only low mist is a stale source's own bounded bank.
      mistColor.copy(fog.color);
      billboards.setFogBanks(frame.epistemicBanks ?? [], frame.targetX, frame.targetZ);
      billboards.localMist.mesh.visible = showBillboards && billboards.localMist.mesh.count > 0;

      // The rejected always-on cumulus baseline remains off. W6.1 reuses the
      // high anchors only in summer, at less than half the old opacity.
      blendDayCycleColor(cloudBodyColor, CLOUD_BODY_NIGHT, CLOUD_BODY_DUSK, CLOUD_BODY_DAY, dusk, daylight);
      blendDayCycleColor(cloudShadeColor, CLOUD_SHADE_NIGHT, CLOUD_SHADE_DUSK, CLOUD_SHADE_DAY, dusk, daylight);
      billboards.clouds.material.uniforms.uOpacity.value = Math.min(
        0.34,
        (0.28 - night * 0.06) * (1 + (NEUTRAL_SKY_CLARITY - clarity)),
      );
      // The sun projected into the billboards' quad space (right = the 45°
      // azimuth axis, up = world Y): at noon it sits overhead so the top rims
      // light; at dusk it drops low so the edges catch the ember.
      sunQuadDir.set(0.7071 * (sunDir.x - sunDir.z), sunDir.y);
      if (sunQuadDir.lengthSq() < 1e-6) sunQuadDir.set(0, 1);
      else sunQuadDir.normalize();
      billboards.clouds.mesh.visible = showBillboards
        && (GARDEN_CUMULUS_BILLBOARDS_ENABLED || season === "summer" || clarity < NEUTRAL_SKY_CLARITY);
    },
  };
}
