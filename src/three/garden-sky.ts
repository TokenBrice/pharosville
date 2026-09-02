import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import type { GardenSeason } from "../systems/season";
import { GARDEN_BREATH_PHASE, gardenBreathAt } from "../systems/weather";
import { createGardenSkyBillboards } from "./garden-sky-billboards";
import {
  blendDayCycleColor,
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  DUSK_EMBER_COLOR,
  MOON_COLOR,
  STAR_COLOR,
  type DayCyclePhase,
} from "./garden-day-cycle";
import { GARDEN_MOON_AZIMUTH, gardenSunPose } from "./garden-sun";

const DOME_RADIUS = 300;
const SKY_BACKDROP_SIZE = 1_200;
const SKY_BACKDROP_Y = -2;
const STAR_COUNT = 720;
// P2 aerial perspective: the fog ladder is tuned to the default ortho
// framing (1440×960, zoom 0.78, elevation 30° — ground-plane depth spans
// ~121–255 world units bottom→top). The island (depth ~155–195, lighthouse
// crown ~165) stays below FOG_NEAR at full color; midground ships
// (~195–225) lift gently; the Z4 horizon cards (~232) and the frame-top far
// water (~244) sit at 0.4–0.65 fog so the sea dissolves into the C1 horizon
// band — the bokashi seam where far water meets sky. Zooming out only
// deepens the haze toward FOG_FAR; zooming in (explore) shrinks the span
// below FOG_NEAR so close-ups stay crisp.
// W6.8 aerial perspective: a LONGER, EARLIER ramp — not a denser one.
//
// The ladder above (192/275, span 83) put almost the whole cue in the last
// tenth of the frame: at the default framing the island sat entirely below
// FOG_NEAR at zero haze, the midground lifted barely at all (depth 195 read
// 0.036), and then the far water ran up to 0.63 in the last thirty units. That
// is not aerial perspective, it is a band across the top of the picture — which
// is exactly the W6.8 complaint that the horizon "reads as a flat band rather
// than as depth".
//
// Stretching the ramp to 178/300 (span 122) grades the whole midground instead
// of stacking the change at the end:
//
//   ground depth   155    178    195    225    232    244
//   old (192/275)  0.00   0.00   0.036  0.398  0.482  0.627
//   new (178/300)  0.00   0.00   0.139  0.385  0.443  0.541
//
// Three properties make this safe against the W6.6 white-out rather than a step
// back toward it, and all three are arithmetic, not taste:
//
// 1. The maximum haze anywhere in frame goes DOWN (0.627 -> 0.541). A longer
//    ramp to a further endpoint cannot be denser at any depth both ladders
//    reach, so this change strictly cannot white-out more than today's does.
// 2. The island is untouched. Everything at or below depth 178 still reads at
//    zero fog, so the monument's colour — the thing the grade is calibrated
//    against — cannot move at all.
// 3. The bokashi seam holds: the Z4 horizon cards at ~232 go 0.482 -> 0.443, so
//    far water still dissolves into the C1 horizon band rather than ending on an
//    edge.
//
// At wide zoom the same change also pulls fog IN (at FOG_MAX_SCALE the near
// plane goes 288 -> 267), which works against the other half of the W6.6
// finding — the whole-map framing that resolved as a hard-edged diamond slab
// floating in a void.
const FOG_NEAR = 178;
const FOG_FAR = 300;
// W6.6 (Grand Scale Revamp): the ladder above was calibrated for ONE framing
// (1440x960 at the then-current zoom). The revamp made the world worth zooming out for —
// 187 ships across the whole sea — and at wide zoom the ground plane spans far
// more depth, so most of the frame fell past FOG_FAR and the day read as a
// white-out. The range now scales with the camera's view span so aerial
// perspective stays a depth cue instead of becoming a haze wall.
//
// Reference view height at the calibration framing, used as the scale pivot.
//
// 2026-08-13: this was 34, and that number had switched the entire aerial
// perspective system OFF at the framing it was calibrated for.
//
// `gardenCameraViewHeight(viewportHeight, zoom) = viewportHeight / (TILE_HEIGHT
// * zoom)`. Wave 1's 1600x1000 landing framing is zoom 0.648, hence a measured
// 96.45-unit view height. 96.5 is the new scale-one pivot; the camera change
// therefore does not silently add fog before the explicit daylight halving
// below. The clamp keeps doing its two jobs from there — pulling
// toward 1.5 as the camera pulls out so the world's edge dissolves instead of
// ending as a diamond slab in a void, and holding at 1.0 on the way in so
// close-ups stay crisp.
const FOG_REFERENCE_VIEW_HEIGHT = 96.5;
const FOG_MIN_SCALE = 1;
// Capped at 1.5, not 2.6. W6.6 scaled fog with the view to stop noon becoming
// a white-out, but at whole-map framing a 2.6x scale pushed FOG_NEAR out to
// ~500 units — well past the far edge of a 158-unit world — so no fog reached
// the boundary at all and the map resolved as a hard-edged diamond slab
// floating in a void. The cap keeps the aerial perspective honest at close
// zoom AND keeps the world's edge dissolving at wide zoom.
const FOG_MAX_SCALE = 1.5;

// --- Wave 1: bokashi bands on the visible sky seam --------------------------
//
// The ladder above is the "long quiet mid-gradient" of a woodblock sky. This is
// the rest of the wipe: the two or three DELIBERATE stops a printer lays over a
// flat field, which is what makes a Hiroshige sky read as depth without a single
// physical scattering term.
//
// The finite plate lets the dome enter frame. The bands therefore live on the
// dome's visible lower hemisphere, beginning at the same shironeri colour the
// far plate fades into. They no longer tint water or depend on camera depth.
//
// `skyHeight = abs(vHeight)` is zero at the seam and rises into the visible
// background. The stops are fractions of that hemisphere, so they stay glued
// to the sky at every camera zoom instead of sliding with scene fog depth.
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
  /** Dusk and night carry the bands; day keeps a quarter of them. */
  dayAmount: 0.125,
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

// The first follow-up baseline disables the detached cumulus sprites that read
// as pale pills at whole-map zoom. Keep the implementation for controlled A/B
// work; mist banks remain the active billboard atmosphere.
export const GARDEN_CUMULUS_BILLBOARDS_ENABLED = false;
// W5.7 borrowed scenery stays 3% below the live fog value at every phase.
// This is palette derivation, not a new swatch; keep it inside the plan's
// binding 2–4% separation window.
// The moon sits upper-left of the standard framing; V2's moon road aligns its
// water glitter band to this azimuth. Re-exported from garden-sun, which owns
// light geometry, so the dome and the water cannot disagree about the bearing.
export { GARDEN_MOON_AZIMUTH };
const MOON_ELEVATION = Math.PI * 0.34;
const SKY_MIDDLE_DAY = new Color(HARBOR_PALETTE.moonlight)
  .lerp(new Color(HARBOR_PALETTE.sky_day_zenith), 0.32);
const SKY_VISIBLE_ZENITH_DAY = new Color(HARBOR_PALETTE.deep_sea_1);
const SKY_LOWER_DUSK = new Color(HARBOR_PALETTE.sail_teal)
  .lerp(new Color(HARBOR_PALETTE.fog_blue), 0.28);

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
  /** Camera view height in world units; drives the fog-range scale (W6.6). */
  viewHeight: number;
  targetX: number;
  targetZ: number;
  timeSeconds: number;
  /** Phase 2 weather: 0..1 storm state — darkens the palette, closes the fog. */
  stormLevel?: number;
  /**
   * Phase 2 billboard gate (mist banks + cumulus layer): the caller resolves
   * the quality tier and passes false below `balanced`. Defaults to shown.
   */
  billboards?: boolean;
  /** Phase 2 weather wind; drives the billboard drift. */
  wind?: { windDirX: number; windDirZ: number; windSpeed: number };
}

export interface GardenSky {
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
   *
   * `stormLevel` (Phase 2) multiplies over the day-cycle base: the storm
   * darkens and cools the sky the day cycle painted, so the PMREM probe baked
   * right after this call lights the world with the same storm the viewer
   * sees. The day cycle remains the base; storm is a multiplier, never a hue.
   */
  applyPhase: (phase: DayCyclePhase, wallClockHour: number, stormLevel?: number) => void;
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
  moonAzimuth: number;
  root: Group;
  update: (phase: DayCyclePhase, frame: GardenSkyFrame) => void;
}

function createDome(): {
  material: ShaderMaterial;
  mesh: Mesh<SphereGeometry, ShaderMaterial>;
} {
  const zenith = DAY_CYCLE_SKY_PRESETS.night.zenith.clone();
  const horizon = DAY_CYCLE_SKY_PRESETS.night.horizon.clone();
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: BackSide,
    uniforms: {
      uEmberColor: { value: DUSK_EMBER_COLOR.clone() },
      uEmberStrength: { value: 0 },
      uHazeColor: { value: DAY_CYCLE_SKY_PRESETS.night.fog.clone() },
      uHazeStrength: { value: 0 },
      uHorizon: { value: horizon },
      uMiddle: { value: DAY_CYCLE_SKY_PRESETS.night.horizon.clone() },
      uBokashiAmount: { value: 1 },
      uScattering: { value: 0 },
      uSunColor: { value: DAY_CYCLE_LIGHT_PRESETS.day.dirColor.clone() },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunIntensity: { value: 0 },
      uZenith: { value: zenith },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      varying float vHeight;
      void main() {
        vDir = normalize(position);
        vHeight = vDir.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uEmberColor;
      uniform float uEmberStrength;
      uniform vec3 uHazeColor;
      uniform float uHazeStrength;
      uniform vec3 uHorizon;
      uniform vec3 uMiddle;
      uniform float uBokashiAmount;
      uniform float uScattering;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uSunIntensity;
      uniform vec3 uZenith;
      varying vec3 vDir;
      varying float vHeight;
      ${gardenBokashiBandGlsl()}
      void main() {
        vec3 dir = normalize(vDir);
        // The finite plate exposes the dome's lower hemisphere. Mirroring its
        // height gives that visible half the same seam-to-zenith ladder as the
        // PMREM half: shironeri -> mizu -> kon by day, kachi-iro at night.
        float skyHeight = clamp(abs(vHeight), 0.0, 1.0);
        vec3 color = mix(uHorizon, uMiddle, smoothstep(0.015, 0.28, skyHeight));
        color = mix(color, uZenith, smoothstep(0.3, 0.86, skyHeight));
        color *= gardenBokashiShade(skyHeight, uBokashiAmount);
        // Faint brightening right at the horizon band.
        float glow = smoothstep(0.16, -0.04, abs(vHeight)) * 0.12;
        color += uHorizon * glow;

        // --- Phase 2 (2c): analytic atmospheric scattering ------------------
        // Preetham-spirited Rayleigh/Mie field, mapped onto the authored
        // palette: the physics decides WHERE the dome brightens, saturates
        // and glows; the day-cycle colours decide every HUE. uScattering
        // fades the whole layer to zero at night, where the authored indigo
        // and the stars rule unmodified. Under the locked down-looking
        // camera this dome is never on screen directly — it IS the PMREM
        // probe (garden-environment), so this field is what lights the
        // world's metals — and it must stay palette-true for exactly that
        // reason.
        float mu = dot(dir, uSunDir);
        float up = max(dir.y, 0.0);
        float visibleHemisphere = 1.0 - step(0.0, vHeight);
        float visibleSeam = 1.0 - smoothstep(0.035, 0.38, skyHeight);
        // Optical depth: the long atmospheric path near the horizon.
        // On the exposed lower hemisphere, distance from the seam replaces
        // physical altitude; otherwise every visible pixel receives maximum
        // haze and the three-colour ladder collapses back to flat fog paper.
        float airMass = mix(exp(-up * 3.0), visibleSeam, visibleHemisphere);
        // Rayleigh phase (strongest broadside to the sun) redistributes the
        // gradient's luminance along the dome without moving its hue anchors.
        float rayPhase = 0.75 * (1.0 + mu * mu);
        float rayleigh = mix(0.82, 1.12, (1.0 - airMass) * rayPhase * 0.5);
        color *= mix(1.0, rayleigh, uScattering);
        // Short-wave scatter saturates the upper sky; the long path near the
        // horizon desaturates toward the haze. Only the MIX of the authored
        // pair moves — never the hues themselves.
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(luma), color, 1.0 + uScattering * 0.3 * (1.0 - airMass));
        color = mix(color, uHazeColor, uScattering * airMass * airMass * 0.3);
        // Mie forward scatter: the warm aureole around the sun, coloured by
        // the light rig's own sun tint — the same colour the water glitter
        // uses, so sky, sea and shadows agree.
        float mie = pow(max(mu, 0.0), 12.0) * (0.25 + airMass * 0.75);
        color += uSunColor * mie * uScattering * 0.14;
        // The sun itself: a soft disc plus a tight corona, HDR at/just over
        // the bloom knee (~0.95) so it blooms lightly, storm-smothered, and
        // gone at night (uSunIntensity -> 0).
        float corona = pow(max(mu, 0.0), 220.0);
        float disc = smoothstep(0.99955, 0.99985, mu);
        color += uSunColor * (corona * 0.5 + disc) * uSunIntensity;

        // --- Phase 2 (2d): the height fog's sky half ------------------------
        // The haze band the far water melts into; the water shader's additive
        // height fog lands on the SAME fog colour, so sea and sky fuse at the
        // horizon instead of ending on an edge.
        float hazeBand = mix(
          smoothstep(0.24, -0.02, dir.y),
          visibleSeam,
          visibleHemisphere
        );
        color = mix(color, uHazeColor, hazeBand * uHazeStrength);

        // G4 ember west band: a warm azimuthal glow where the sun sets, so the
        // dusk frame reads as its own state instead of dimmed night. The band
        // faces away from the isometric camera (frame-centre far horizon).
        float west = pow(max(0.0, dot(normalize(vec3(dir.x, 0.0, dir.z)), vec3(-0.7071, 0.0, -0.7071))), 2.5);
        float band = smoothstep(0.42, 0.02, abs(vHeight - 0.06));
        color += uEmberColor * west * band * uEmberStrength;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new Mesh(new SphereGeometry(DOME_RADIUS, 32, 16), material);
  mesh.name = "garden-sky-dome";
  // The finite plate's visible background is the edge-anchored sheet below;
  // this sphere remains a material/lifecycle owner for the PMREM probe only.
  mesh.visible = false;
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return { material, mesh };
}

/**
 * A world-backed sky sheet immediately behind the finite plate.
 *
 * The orthographic camera looks down, so a conventional upper hemisphere is
 * not a reliable visible background. This two-triangle sheet is deliberately
 * presentation-only: water/land occlude it, while the exposed upper frame
 * walks from the shironeri seam into the sky ladder. The separate dome remains
 * the PMREM source. A screen-height ramp is intentional here: unlike radial
 * distance from the plate it cannot draw a detached halo around the garden.
 */
function createBackdrop(domeMaterial: ShaderMaterial): {
  material: ShaderMaterial;
  mesh: Mesh<PlaneGeometry, ShaderMaterial>;
} {
  const material = new ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uBokashiAmount: domeMaterial.uniforms.uBokashiAmount,
      // The visible sheet has the explicit shironeri → mizu → kon ladder.
      // Keep these separate from the dome: that material is the environment
      // probe and retains the established physical day-cycle palette.
      uHorizon: { value: DAY_CYCLE_SKY_PRESETS.night.fog.clone() },
      uLower: { value: DAY_CYCLE_SKY_PRESETS.night.horizon.clone() },
      uMiddle: { value: DAY_CYCLE_SKY_PRESETS.night.horizon.clone() },
      uMoonColor: { value: MOON_COLOR.clone() },
      uNight: { value: 1 },
      uSunColor: domeMaterial.uniforms.uSunColor,
      uSunDir: domeMaterial.uniforms.uSunDir,
      uSunIntensity: domeMaterial.uniforms.uSunIntensity,
      uZenith: { value: DAY_CYCLE_SKY_PRESETS.night.zenith.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vScreenPosition;
      void main() {
        vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vScreenPosition = clipPosition.xy / clipPosition.w * 0.5 + 0.5;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon;
      uniform vec3 uLower;
      uniform vec3 uMiddle;
      uniform vec3 uMoonColor;
      uniform float uNight;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uSunIntensity;
      uniform vec3 uZenith;
      uniform float uBokashiAmount;
      varying vec2 vScreenPosition;
      ${gardenBokashiBandGlsl()}
      void main() {
        // A true full-height sky ladder. The first pass held skyHeight at zero
        // for 80% of the frame and compressed every colour into the top band,
        // producing cream paper with a navy stripe instead of atmosphere.
        float skyHeight = clamp(vScreenPosition.y, 0.0, 1.0);
        vec3 color = mix(uLower, uHorizon, smoothstep(0.02, 0.24, skyHeight));
        color = mix(color, uMiddle, smoothstep(0.18, 0.58, skyHeight));
        color = mix(color, uZenith, smoothstep(0.50, 1.0, skyHeight));
        color *= gardenBokashiShade(skyHeight, uBokashiAmount);

        // Project garden-sun.ts onto the sheet: morning and evening glows move
        // with the same arc as the key light, water road, and PMREM dome.
        vec2 sunScreen = vec2(
          clamp(0.5 + (uSunDir.x - uSunDir.z) * 0.28, 0.08, 0.92),
          clamp(0.14 + max(0.0, uSunDir.y) * 0.58, 0.12, 0.76)
        );
        vec2 sunDelta = (vScreenPosition - sunScreen) * vec2(1.0, 1.35);
        float sunGlow = exp(-dot(sunDelta, sunDelta) * 13.0);
        color += uSunColor * sunGlow * uSunIntensity * 0.065;

        // Night stays kachi-iro, with one broad low-value halo behind the moon
        // rather than a second flat colour band.
        vec2 moonDelta = (vScreenPosition - vec2(0.23, 0.73)) * vec2(1.0, 1.18);
        float moonGlow = exp(-dot(moonDelta, moonDelta) * 18.0);
        color += uMoonColor * moonGlow * uNight * 0.07;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new Mesh(new PlaneGeometry(SKY_BACKDROP_SIZE, SKY_BACKDROP_SIZE), material);
  mesh.name = "garden-sky-backdrop";
  mesh.position.set(0, SKY_BACKDROP_Y, 0);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -3;
  mesh.frustumCulled = false;
  return { material, mesh };
}

function createStars(): { material: ShaderMaterial; points: Points } {
  const positions = new Float32Array(STAR_COUNT * 3);
  const phases = new Float32Array(STAR_COUNT);
  // Deterministic scatter across the upper hemisphere so the field is stable
  // across reloads.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const u = rand();
    const v = rand() * 0.82 + 0.06; // bias above the horizon
    const theta = u * Math.PI * 2;
    const phi = Math.acos(v);
    const r = DOME_RADIUS * 0.94;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    phases[i] = rand();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fog: false,
    transparent: true,
    uniforms: {
      uColor: { value: STAR_COLOR.clone() },
      uOpacity: { value: 0 },
      uSize: { value: 2.2 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uSize;
      uniform float uTime;
      varying float vTwinkle;
      void main() {
        vTwinkle = 0.55 + 0.45 * sin(uTime * 1.4 + aPhase * 6.2831853);
        gl_PointSize = uSize * (0.7 + vTwinkle * 0.6);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.0, d) * vTwinkle * uOpacity;
        if (alpha < 0.01) discard;
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

function createMoon(): { group: Group; halo: MeshBasicMaterial } {
  const group = new Group();
  group.name = "garden-sky-moon";
  const disc = new Mesh(
    new SphereGeometry(7, 20, 14),
    new MeshBasicMaterial({ color: MOON_COLOR.clone(), fog: false, toneMapped: false }),
  );
  disc.renderOrder = -1;
  const haloMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: MOON_COLOR.clone(),
    depthWrite: false,
    fog: false,
    opacity: 0.2,
    toneMapped: false,
    transparent: true,
  });
  const halo = new Mesh(new SphereGeometry(16, 20, 14), haloMaterial);
  halo.renderOrder = -1;
  group.add(halo, disc);
  group.position.set(
    Math.cos(MOON_ELEVATION) * Math.cos(GARDEN_MOON_AZIMUTH) * DOME_RADIUS * 0.82,
    Math.sin(MOON_ELEVATION) * DOME_RADIUS * 0.82,
    Math.cos(MOON_ELEVATION) * Math.sin(GARDEN_MOON_AZIMUTH) * DOME_RADIUS * 0.82,
  );
  group.renderOrder = -1;
  return { group, halo: haloMaterial };
}

export function createGardenSky(season: GardenSeason = "spring"): GardenSky {
  const root = new Group();
  root.name = "garden-sky";
  const dome = createDome();
  const backdrop = createBackdrop(dome.material);
  const stars = createStars();
  const moon = createMoon();
  // Phase 2 (items 2d/6): the drifting billboard atmosphere — mist banks and
  // one cumulus layer. These REPLACE the retired 320x9 dawn/dusk mist plane:
  // one primary cue per concept, and the instanced banks' radial-noise
  // falloff cannot draw the hard-edged stripe the plane did at night. They
  // are the visible half of the atmosphere work — under the locked
  // down-looking camera the dome is never on screen (it feeds the PMREM
  // probe), so the haze zone over the far water is where sky reads.
  const billboards = createGardenSkyBillboards();
  root.add(
    backdrop.mesh,
    dome.mesh,
    stars.points,
    moon.group,
    billboards.mist.mesh,
    billboards.clouds.mesh,
    billboards.geese.mesh,
  );

  const fog = new Fog(DAY_CYCLE_SKY_PRESETS.night.fog.clone(), FOG_NEAR, FOG_FAR);
  // The dome's haze band shares the fog's own Color instance, so the sky half
  // and the water half of the height fog cannot drift apart — one fog
  // colour, one contract.
  dome.material.uniforms.uHazeColor.value = fog.color;

  // Phase 2 storm tone: a cool slate pull applied over the blended day-cycle
  // colour. One scratch — applyPhase runs per frame and must not allocate.
  const stormSlate = new Color();
  const applyStorm = (color: Color, storm: number): void => {
    if (storm <= 0) return;
    const luma = color.r * 0.3 + color.g * 0.5 + color.b * 0.2;
    stormSlate.setRGB(luma * 0.42, luma * 0.5, luma * 0.62);
    color.lerp(stormSlate, Math.min(0.75, storm * 0.75));
  };

  // Scratch objects for the per-frame billboard writes — the frame path must
  // not allocate, so the uniforms hold these instances and `update` mutates
  // them in place.
  const sunColor = dome.material.uniforms.uSunColor.value as Color;
  const sunDir = dome.material.uniforms.uSunDir.value as Vector3;
  const mistColor = new Color();
  const cloudBodyColor = new Color();
  const cloudShadeColor = new Color();
  const geeseColor = new Color();
  const winterFog = new Color(HARBOR_PALETTE.fog_blue);
  const sunQuadDir = new Vector2(0, 1);
  const scratchSunPose = { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2 };
  const windDir = new Vector2(-0.855, 0.519);
  billboards.mist.material.uniforms.uColor.value = mistColor;
  billboards.mist.material.uniforms.uWindDir.value = windDir;
  billboards.clouds.material.uniforms.uBodyColor.value = cloudBodyColor;
  billboards.clouds.material.uniforms.uShadeColor.value = cloudShadeColor;
  // The cumulus lit edge shares the dome's own sun colour, so the clouds, the
  // dome's Mie glow and the water's glitter all take the light rig's tint.
  billboards.clouds.material.uniforms.uLitColor.value = sunColor;
  billboards.clouds.material.uniforms.uSunQuadDir.value = sunQuadDir;
  billboards.clouds.material.uniforms.uWindDir.value = windDir;
  billboards.geese.material.uniforms.uColor.value = geeseColor;

  const applyPhase = (phase: DayCyclePhase, wallClockHour: number, stormLevel = 0): void => {
    const { daylight, dusk } = phase;
    const storm = Math.min(1, Math.max(0, stormLevel));
    const skyPresets = DAY_CYCLE_SKY_PRESETS;
    const zenith = dome.material.uniforms.uZenith.value as Color;
    const horizon = dome.material.uniforms.uHorizon.value as Color;
    const middle = dome.material.uniforms.uMiddle.value as Color;
    const backdropZenith = backdrop.material.uniforms.uZenith.value as Color;
    const backdropHorizon = backdrop.material.uniforms.uHorizon.value as Color;
    const backdropLower = backdrop.material.uniforms.uLower.value as Color;
    const backdropMiddle = backdrop.material.uniforms.uMiddle.value as Color;
    blendDayCycleColor(
      zenith,
      skyPresets.night.zenith,
      skyPresets.dusk.zenith,
      skyPresets.day.zenith,
      dusk,
      daylight,
    );
    blendDayCycleColor(fog.color, skyPresets.night.fog, skyPresets.dusk.fog, skyPresets.day.fog, dusk, daylight);
    horizon.copy(fog.color);
    blendDayCycleColor(
      middle,
      skyPresets.night.horizon,
      skyPresets.dusk.horizon,
      skyPresets.day.horizon,
      dusk,
      daylight,
    );
    blendDayCycleColor(
      backdropLower,
      skyPresets.night.horizon,
      SKY_LOWER_DUSK,
      skyPresets.day.fog,
      dusk,
      daylight,
    );
    blendDayCycleColor(
      backdropZenith,
      skyPresets.night.zenith,
      skyPresets.dusk.zenith,
      SKY_VISIBLE_ZENITH_DAY,
      dusk,
      daylight,
    );
    blendDayCycleColor(
      backdropMiddle,
      skyPresets.night.horizon,
      skyPresets.dusk.horizon,
      SKY_MIDDLE_DAY,
      dusk,
      daylight,
    );
    backdropHorizon.copy(fog.color);
    backdrop.material.uniforms.uNight.value = phase.night;
    if (season === "winter") {
      // Kigo stays a small atmospheric bias: cooler air and a light value-
      // preserving desaturation, never a fourth grade or a semantic color.
      fog.color.lerp(winterFog, 0.1);
      zenith.lerp(winterFog, 0.04);
      horizon.lerp(winterFog, 0.05);
      middle.lerp(winterFog, 0.04);
    }
    geeseColor.copy(fog.color).multiplyScalar(0.52);
    // Ember west band owns the dusk horizon; it stays out of day and night,
    // and a storm smothers it.
    dome.material.uniforms.uEmberStrength.value = dusk * (1 - daylight) * 0.55
      * (1 - storm * 0.7);

    // Phase 2 (2c): the scattering field's drivers — the sun's direction from
    // the day cycle, the scattering strength (fading to zero at night), the
    // disc's HDR intensity (just over the bloom knee, storm-smothered), and
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
    blendDayCycleColor(
      sunColor,
      DAY_CYCLE_LIGHT_PRESETS.night.dirColor,
      DAY_CYCLE_LIGHT_PRESETS.dusk.dirColor,
      DAY_CYCLE_LIGHT_PRESETS.day.dirColor,
      dusk,
      daylight,
    );
    dome.material.uniforms.uScattering.value = Math.min(1, daylight + dusk * 0.7)
      * (1 - storm * 0.6);
    dome.material.uniforms.uSunIntensity.value = (daylight * 1.55 + dusk * 1.3)
      * (1 - storm * 0.85);
    dome.material.uniforms.uHazeStrength.value = Math.min(
      0.8,
      0.42 + dusk * 0.08 + storm * 0.3,
    );
    dome.material.uniforms.uBokashiAmount.value = gardenBokashiAmount(phase);
    if (storm > 0) {
      applyStorm(zenith, storm);
      applyStorm(horizon, storm);
      applyStorm(middle, storm);
      applyStorm(backdropZenith, storm);
      applyStorm(backdropHorizon, storm);
      applyStorm(backdropLower, storm);
      applyStorm(backdropMiddle, storm);
      applyStorm(fog.color, storm);
      applyStorm(sunColor, storm);
    }
  };

  return {
    applyPhase,
    dispose() {
      backdrop.mesh.geometry.dispose();
      backdrop.material.dispose();
      dome.mesh.geometry.dispose();
      dome.mesh.material.dispose();
      stars.points.geometry.dispose();
      stars.material.dispose();
      billboards.dispose();
      moon.group.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          (object.material as MeshBasicMaterial).dispose();
        }
      });
    },
    domeMaterial: dome.material,
    fog,
    moonAzimuth: GARDEN_MOON_AZIMUTH,
    root,
    update(phase, frame) {
      root.position.set(frame.targetX, 0, frame.targetZ);
      // Push the haze back as the view widens (W6.6); a storm pulls it back in
      // — rain closes the visible distance even at the same framing.
      const storm = Math.min(1, Math.max(0, frame.stormLevel ?? 0));
      const fogScale = Math.max(
        FOG_MIN_SCALE,
        Math.min(FOG_MAX_SCALE, frame.viewHeight / FOG_REFERENCE_VIEW_HEIGHT),
      );
      fog.near = FOG_NEAR * fogScale * (1 - storm * 0.32);
      // Day doubles the linear ramp's span, exactly halving its contribution
      // at every depth inside the former range. Dusk/night retain their signed-
      // off stack; the visible sky now carries the daylight atmosphere.
      const phaseFar = FOG_FAR + phase.daylight * (FOG_FAR - FOG_NEAR);
      fog.far = phaseFar * fogScale * (1 - storm * 0.25);
      applyPhase(phase, frame.wallClockHour, storm);
      const { daylight, dusk, night } = phase;

      // Storm cloud hides the stars and the moon.
      const starOpacity = Math.min(1, dusk * 0.35 + night) * (1 - storm * 0.85);
      stars.material.uniforms.uOpacity.value = starOpacity;
      stars.material.uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      stars.points.visible = starOpacity > 0.01;

      const moonPresence = Math.min(1, dusk * 0.5 + night) * (1 - storm * 0.8);
      moon.group.visible = moonPresence > 0.02;
      moon.halo.opacity = (0.08 + night * 0.28) * (1 - storm * 0.7);

      // Phase 2 billboard atmosphere (mist banks + cumulus): shared time and
      // wind for the vertex-shader drift, phase-blended palette colours, and
      // the caller's tier gate. Reduced motion pins the drift at t = 0 — the
      // static composition is a complete one.
      const showBillboards = frame.billboards ?? true;
      const billboardTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      windDir.set(frame.wind?.windDirX ?? -0.855, frame.wind?.windDirZ ?? 0.519);
      const windSpeed = frame.wind?.windSpeed ?? 0.3;
      billboards.mist.material.uniforms.uTime.value = billboardTime;
      billboards.mist.material.uniforms.uWindSpeed.value = windSpeed;
      billboards.clouds.material.uniforms.uTime.value = billboardTime;
      billboards.clouds.material.uniforms.uWindSpeed.value = windSpeed;

      // Mist banks: a dawn/night element, near-invisible at midday; a storm
      // thickens the banks and lets a faint haze survive even the noon frame.
      const mistDensity = Math.min(
        0.85,
        (dusk * 0.55 + night * 0.48) * (1 + storm * 0.8) + storm * 0.12 * (1 - daylight),
      );
      // W3.2: mist does not carry a private opacity oscillator. It takes the
      // mist phase of the shared 9 s breath, at a deliberately tiny ±5%.
      const breathTime = frame.reducedMotion ? 0 : frame.timeSeconds;
      const mistBreath = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.mist);
      const mistOpacity = mistDensity * 0.55 * (0.95 + mistBreath * 0.1);
      blendDayCycleColor(
        mistColor,
        DAY_CYCLE_SKY_PRESETS.night.fog,
        DAY_CYCLE_SKY_PRESETS.dusk.fog,
        DAY_CYCLE_SKY_PRESETS.day.fog,
        dusk,
        daylight,
      );
      applyStorm(mistColor, storm);
      billboards.mist.material.uniforms.uOpacity.value = mistOpacity;
      billboards.mist.mesh.visible = showBillboards && mistOpacity > 0.008;

      // The rejected always-on cumulus baseline remains off. W6.1 reuses the
      // high anchors only in summer, at less than half the old opacity.
      blendDayCycleColor(cloudBodyColor, CLOUD_BODY_NIGHT, CLOUD_BODY_DUSK, CLOUD_BODY_DAY, dusk, daylight);
      blendDayCycleColor(cloudShadeColor, CLOUD_SHADE_NIGHT, CLOUD_SHADE_DUSK, CLOUD_SHADE_DAY, dusk, daylight);
      applyStorm(cloudBodyColor, storm);
      applyStorm(cloudShadeColor, storm);
      billboards.clouds.material.uniforms.uOpacity.value = Math.min(
        0.34,
        0.28 - night * 0.06 + storm * 0.04,
      );
      // The sun projected into the billboards' quad space (right = the 45°
      // azimuth axis, up = world Y): at noon it sits overhead so the top rims
      // light; at dusk it drops low so the edges catch the ember.
      sunQuadDir.set(0.7071 * (sunDir.x - sunDir.z), sunDir.y);
      if (sunQuadDir.lengthSq() < 1e-6) sunQuadDir.set(0, 1);
      else sunQuadDir.normalize();
      billboards.clouds.mesh.visible = showBillboards
        && (GARDEN_CUMULUS_BILLBOARDS_ENABLED || season === "summer");
      const geeseOpacity = season === "autumn"
        ? Math.max(0.16, 0.42 - night * 0.2 - storm * 0.12)
        : 0;
      billboards.geese.material.uniforms.uOpacity.value = geeseOpacity;
      billboards.geese.mesh.visible = showBillboards && geeseOpacity > 0.01;
    },
  };
}
