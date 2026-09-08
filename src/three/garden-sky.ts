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
import { GARDEN_BREATH_PHASE, gardenBreathAt } from "../systems/weather";
import type { GardenSeason } from "../systems/season";
import { createGardenSkyBillboards } from "./garden-sky-billboards";
import { NEUTRAL_SKY_CLARITY } from "../systems/psi-sky";
import type { EpistemicFogBank } from "../systems/epistemic-haze";
import {
  blendDayCycleColor,
  dayCycleBeats,
  type DayCycleBeats,
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  DUSK_EMBER_COLOR,
  MOON_COLOR,
  STAR_COLOR,
  type DayCyclePhase,
} from "./garden-day-cycle";
import { GARDEN_MOON_AZIMUTH, GARDEN_MOON_ELEVATION, gardenSunPose } from "./garden-sun";

// Five illumination beats: neutral noon air, not a warm full-frame grade.
export const GARDEN_SKY_BEATS = {
  dawn: { zenith: new Color(0x777d99), horizon: new Color(0xc9b6bd) },
  day: { zenith: new Color(0x4c87c4), horizon: new Color(0xe0e4e9) },
  golden: { zenith: new Color(0x74638e), horizon: new Color(0xdca76c) },
  blue: { zenith: new Color(0x202c59), horizon: new Color(0x595773) },
  night: { zenith: new Color(0x050918), horizon: new Color(0x11182c) },
};
const SKY_BEAT_NAMES = ["dawn", "day", "golden", "blue", "night"] as const;

export function blendGardenSkyColor(
  target: Color,
  beats: DayCycleBeats,
  channel: "zenith" | "horizon",
): Color {
  target.setRGB(0, 0, 0);
  for (const beat of SKY_BEAT_NAMES) {
    const color = GARDEN_SKY_BEATS[beat][channel];
    target.r += color.r * beats[beat];
    target.g += color.g * beats[beat];
    target.b += color.b * beats[beat];
  }
  return target;
}
const DOME_RADIUS = CAMERA_FAR * 0.9;
const STAR_COUNT = 720;
// The fog ladder is authored from world landmarks, then measured from the
// current perspective eye. Rest framing is solved per viewport, so neither end
// may be derived from an assumed zoom.
const FOG_ISLAND_MARGIN = 12;
const FOG_ISLAND_X = (60 + GARDEN_ISLAND_TILE_OFFSET.x - 12) * TILE_SCALE;
const FOG_ISLAND_Z = (70 + GARDEN_ISLAND_TILE_OFFSET.y - 12) * TILE_SCALE;
const FOG_FAR_EDGE = 70 * TILE_SCALE;
const FOG_NEAR = 200;
const FOG_FAR = 400;
// The far plate edge lands at ~35 % fog (the sky test's ≥30 % floor) rather
// than 100 %, so far quays and headlands keep a silhouette.
const FOG_FAR_BEYOND_EDGE = 1.35;

function fogRangeAtViewHeight(
  fog: Fog,
  eye: { x: number; y: number; z: number },
  cover: number,
): void {
  const islandDistance = Math.hypot(
    eye.x - FOG_ISLAND_X,
    eye.y - GARDEN_WATER_Y,
    eye.z - FOG_ISLAND_Z,
  );
  const farEdgeDistance = Math.max(
    Math.hypot(eye.x, eye.y - GARDEN_WATER_Y, eye.z - FOG_FAR_EDGE),
    Math.hypot(eye.x - FOG_FAR_EDGE, eye.y - GARDEN_WATER_Y, eye.z),
  );
  fog.near = (islandDistance + FOG_ISLAND_MARGIN) * (1 - cover * 0.32);
  // G2/W2.4: the far plate edge sits part-way up the ladder rather than at
  // its top, so the farthest quays and the borrowed headlands beyond them
  // still hold a silhouette against the sky instead of dissolving into one
  // wall the colour of the horizon. Aerial perspective, not a curtain.
  fog.far = farEdgeDistance * FOG_FAR_BEYOND_EDGE * (1 - cover * 0.25);
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

// The first follow-up baseline disables the detached cumulus sprites that read
// as pale pills at whole-map zoom. Keep the implementation for controlled A/B
// work; mist banks remain the active billboard atmosphere.
export const GARDEN_CUMULUS_BILLBOARDS_ENABLED = false;
// W5.7 borrowed scenery stays below the live fog value at every phase —
// palette derivation, not a new swatch. 2026-09-05 (warm-village B3): the
// binding 2–4% whisper became three deliberate planes (10/20/30% below the
// fog, far→near) so the ridges layer instead of grading into one strip; see
// GARDEN_HORIZON_VALUE_SCALES in garden-horizon.ts.
// The moon sits upper-left of the standard framing; V2's moon road aligns its
// water glitter band to this azimuth. Re-exported from garden-sun, which owns
// light geometry, so the dome and the water cannot disagree about the bearing.
export { GARDEN_MOON_AZIMUTH };

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
}

export interface GardenSky {
  setClarity: (clarity: number) => void;
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
      uSkyVisibleHeight: { value: Math.sin(CAMERA_FOV_DEG * Math.PI / 360) },
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
      uniform float uSkyVisibleHeight;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uSunIntensity;
      uniform vec3 uZenith;
      varying vec3 vDir;
      varying float vHeight;
      ${gardenBokashiBandGlsl()}
      void main() {
        vec3 dir = normalize(vDir);
        float skyHeight = clamp(dir.y / uSkyVisibleHeight, 0.0, 1.0);
        vec3 color = mix(uHorizon, uMiddle, smoothstep(0.015, 0.28, skyHeight));
        color = mix(color, uZenith, smoothstep(0.3, 0.86, skyHeight));
        color *= gardenBokashiShade(skyHeight, uBokashiAmount);
        float glow = (1.0 - smoothstep(-0.04, 0.16, abs(vHeight))) * 0.12;
        color += uHorizon * glow;

        float mu = dot(dir, uSunDir);
        float up = max(dir.y, 0.0);
        float visibleHemisphere = 1.0 - step(0.0, vHeight);
        float visibleSeam = 1.0 - smoothstep(0.035, 0.38, skyHeight);
        float airMass = mix(exp(-up * 3.0), visibleSeam, visibleHemisphere);
        float rayPhase = 0.75 * (1.0 + mu * mu);
        float rayleigh = mix(0.82, 1.12, (1.0 - airMass) * rayPhase * 0.5);
        color *= mix(1.0, rayleigh, uScattering);
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(luma), color, 1.0 + uScattering * 0.3 * (1.0 - airMass));
        color = mix(color, uHazeColor, uScattering * airMass * airMass * 0.3);
        float mie = pow(max(mu, 0.0), 12.0) * (0.25 + airMass * 0.75);
        color += uSunColor * mie * uScattering * 0.14;
        float corona = pow(max(mu, 0.0), 220.0);
        float disc = smoothstep(0.99955, 0.99985, mu);
        color += uSunColor * (corona * 0.5 + disc) * uSunIntensity;

        float hazeBand = mix(
          (1.0 - smoothstep(-0.02, 0.24, dir.y)),
          visibleSeam,
          visibleHemisphere
        );
        color = mix(color, uHazeColor, hazeBand * uHazeStrength);

        float west = pow(max(0.0, dot(normalize(vec3(dir.x, 0.0, dir.z)), vec3(-0.7071, 0.0, -0.7071))), 2.5);
        float band = (1.0 - smoothstep(0.02, 0.42, abs(vHeight - 0.06)));
        color += uEmberColor * west * band * uEmberStrength;
        // The sea horizon and lower hemisphere share the live fog exactly.
        color = mix(uHazeColor, color, smoothstep(0.0, 0.12, skyHeight));
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
        float alpha = (1.0 - smoothstep(0.0, 0.5, d)) * vTwinkle * uOpacity;
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
    Math.cos(GARDEN_MOON_ELEVATION) * Math.cos(GARDEN_MOON_AZIMUTH) * DOME_RADIUS * 0.82,
    Math.sin(GARDEN_MOON_ELEVATION) * DOME_RADIUS * 0.82,
    Math.cos(GARDEN_MOON_ELEVATION) * Math.sin(GARDEN_MOON_AZIMUTH) * DOME_RADIUS * 0.82,
  );
  group.renderOrder = -1;
  return { group, halo: haloMaterial };
}

export function createGardenSky(season: GardenSeason = "spring"): GardenSky {
  const root = new Group();
  root.name = "garden-sky";
  const dome = createDome();
  const stars = createStars();
  const moon = createMoon();
  const celestial = new Group();
  celestial.name = "garden-sky-celestial";
  celestial.add(dome.mesh, stars.points, moon.group);
  // Mist and clouds stay over the world; only the celestial group follows
  // the eye. Their radial falloff replaces the old hard-edged mist plane.
  const billboards = createGardenSkyBillboards();
  let clarity = NEUTRAL_SKY_CLARITY;
  root.add(
    celestial,
    billboards.mist.mesh,
    billboards.clouds.mesh,
    billboards.geese.mesh,
    billboards.localMist.mesh,
  );

  const fog = new Fog(DAY_CYCLE_SKY_PRESETS.night.fog.clone(), FOG_NEAR, FOG_FAR);
  // The dome's haze band shares the fog's own Color instance, so the sky half
  // and the water half of the height fog cannot drift apart — one fog
  // colour, one contract.
  dome.material.uniforms.uHazeColor.value = fog.color;

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
  billboards.localMist.material.uniforms.uColor.value = mistColor;
  billboards.mist.material.uniforms.uWindDir.value = windDir;
  billboards.clouds.material.uniforms.uBodyColor.value = cloudBodyColor;
  billboards.clouds.material.uniforms.uShadeColor.value = cloudShadeColor;
  // The cumulus lit edge shares the dome's own sun colour, so the clouds, the
  // dome's Mie glow and the water's glitter all take the light rig's tint.
  billboards.clouds.material.uniforms.uLitColor.value = sunColor;
  billboards.clouds.material.uniforms.uSunQuadDir.value = sunQuadDir;
  billboards.clouds.material.uniforms.uWindDir.value = windDir;
  billboards.geese.material.uniforms.uColor.value = geeseColor;

  const applyPhase = (phase: DayCyclePhase, wallClockHour: number): void => {
    const { daylight, dusk } = phase;
    const beats = dayCycleBeats(wallClockHour);
    const zenith = dome.material.uniforms.uZenith.value as Color;
    const horizon = dome.material.uniforms.uHorizon.value as Color;
    const middle = dome.material.uniforms.uMiddle.value as Color;
    blendGardenSkyColor(zenith, beats, "zenith");
    blendGardenSkyColor(fog.color, beats, "horizon");
    middle.copy(fog.color).lerp(zenith, 0.35);
    if (season === "winter") {
      // Kigo stays a small atmospheric bias: cooler air and a light value-
      // preserving desaturation, never a fourth grade or a semantic color.
      fog.color.lerp(winterFog, 0.1);
      zenith.lerp(winterFog, 0.04);
      middle.lerp(winterFog, 0.04);
    }
    // The finite water plate dissolves against this exact colour. Copy after
    // seasonal grading so winter cannot open a seam at the horizon.
    horizon.copy(fog.color);
    geeseColor.copy(fog.color).multiplyScalar(0.52);
    // Ember west band belongs exclusively to the wall-clock illumination.
    dome.material.uniforms.uEmberStrength.value = beats.golden * 0.3 + beats.blue * 0.22;

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
    dome.material.uniforms.uHazeStrength.value = Math.min(
      0.8,
      0.42 + (NEUTRAL_SKY_CLARITY - clarity) * 0.3,
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
      // Spend the full gradient ladder between the sea horizon and top row.
      dome.material.uniforms.uSkyVisibleHeight.value = Math.sin(CAMERA_FOV_DEG * Math.PI / 360 - pitch);
      const cover = Math.max(0, NEUTRAL_SKY_CLARITY - clarity);
      fogRangeAtViewHeight(fog, frame.cameraPosition, cover);
      applyPhase(phase, frame.wallClockHour);
      const { daylight, dusk, night } = phase;

      // PSI cover obscures celestial objects without recolouring them.
      const starOpacity = Math.min(1, dusk * 0.35 + night) * (1 - cover * 0.85);
      stars.material.uniforms.uOpacity.value = starOpacity;
      stars.material.uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      stars.points.visible = starOpacity > 0.01;

      const moonPresence = Math.min(1, dusk * 0.5 + night) * (1 - cover * 0.8);
      moon.group.visible = moonPresence > 0.02;
      moon.halo.opacity = (0.08 + night * 0.28) * (1 - cover * 0.7);

      // Phase 2 billboard atmosphere (mist banks + cumulus): shared time and
      // wind for the vertex-shader drift, phase-blended palette colours, and
      // the caller's tier gate. Reduced motion pins the drift at t = 0 — the
      // static composition is a complete one.
      const showBillboards = frame.billboards ?? true;
      const billboardTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      windDir.set(frame.wind?.x ?? -0.855, frame.wind?.y ?? 0.519);
      const windSpeed = Math.min(1, (frame.wind?.speed ?? 0.3) * (1 + (NEUTRAL_SKY_CLARITY - clarity) * 0.5));
      billboards.mist.material.uniforms.uTime.value = billboardTime;
      billboards.mist.material.uniforms.uWindSpeed.value = windSpeed;
      billboards.clouds.material.uniforms.uTime.value = billboardTime;
      billboards.clouds.material.uniforms.uWindSpeed.value = windSpeed;

      // Only authored far anchors carry mist. The billboard fragment shader
      // excludes the first 60 u from the eye, fading in through 100 u.
      const mistDensity = Math.min(
        0.85,
        (dusk * 0.55 + night * 0.48 + daylight * 0.12) * (1 + cover * 0.8),
      );
      // W3.2: mist does not carry a private opacity oscillator. It takes the
      // mist phase of the shared 9 s breath, at a deliberately tiny ±5%.
      const breathTime = frame.reducedMotion ? 0 : frame.timeSeconds;
      const mistBreath = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.mist);
      const mistOpacity = mistDensity * 0.55 * (0.95 + mistBreath * 0.1);
      mistColor.copy(fog.color);
      billboards.mist.material.uniforms.uOpacity.value = mistOpacity;
      billboards.mist.mesh.visible = showBillboards && mistOpacity > 0.008;
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
      const geeseOpacity = season === "autumn"
        ? Math.max(0.16, 0.42 - night * 0.2 - cover * 0.12)
        : 0;
      billboards.geese.material.uniforms.uOpacity.value = geeseOpacity;
      billboards.geese.mesh.visible = showBillboards && geeseOpacity > 0.01;
    },
  };
}
