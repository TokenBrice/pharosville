import {
  Color,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  ShaderChunk,
  Vector3,
  Vector4,
  type Material,
  type Object3D,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DayCycleBeatName, DayCycleBeats } from "../systems/day-cycle-beats";
import { chainGardenMaterialPatch, gardenDayDrift } from "./garden-aerial";
import { gardenSunPose, type GardenLightPose } from "./garden-sun";
import { getGardenSurfaceExemption } from "./garden-surfaces";
import { applyGardenIrradiance } from "./garden-irradiance";

/**
 * The print's two lighting plates (Hour-Print W2.11, W2.12; printmaker-1 at
 * rung 3, art-director-8).
 *
 * **Ai-zuri, the shade plate.** In a shin-hanga print the key-light block and
 * the shade block are cut separately and inked with different pigments. Here
 * the shader already knows which light is which, so after three has summed
 * the indirect term (hemisphere, ambient, probe and PMREM diffuse) that term is
 * re-inked toward one cool pigment per beat. The ink is luma-normalised, so the
 * shade keeps its energy — the key:fill calibration and the environment's
 * "no extra energy" contract are untouched — and only its hue moves. The
 * direct (key) term is never inked, which is why this is not a grade: sunlit
 * faces keep the key's colour and shadows take the complement.
 *
 * **First light, last light.** Around sunrise and sunset the direct term is
 * height-gated by a warm line that descends from the crown at dawn and climbs
 * off it at dusk: below the line the key is a dim cool skylight, above it the
 * key is the sun, and above `FIRST_LIGHT_GLOW_FLOOR` (the crown and the hill
 * tops, never the station roofs) it takes an alpenglow tint, carried into part
 * of the crown's fill as well so the warm line reads whichever face is seen.
 * The key gate touches only the directional light; the beacon's PointLight and
 * every emissive are outside it, so the lantern is never shaded by its sunset.
 *
 * Exempt by construction: sail cloth, marks, pennants and flags, practicals
 * (lamps, windows, the beacon), cue markers and sea steles — identity and
 * data surfaces are never re-inked. Fleet hull strakes carry issuer trim, so
 * the strake band is masked out in the shader and the rest of the hull takes
 * half the ink (hull timber goes violet otherwise).
 *
 * Clock-owned illumination only; it encodes no data and has no motion, so the
 * reduced-motion frame is simply the same print at the same hour.
 */

const P = HARBOR_PALETTE;

/** `ink / luma(ink)`: a pigment with unit luminance, so re-inking keeps energy. */
function lumaNormalised(color: Color): Color {
  const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  return luma > 0 ? color.multiplyScalar(1 / luma) : color.setRGB(1, 1, 1);
}

export interface GardenPrintInk {
  amount: number;
  ink: Color;
}

/**
 * Rung 3 (operator decision O15): printmaker-1's inks at 100 % strength.
 * Colours are palette-derived; `ink` is luma-normalised.
 */
export const GARDEN_PRINT_AI_INKS: Readonly<Record<DayCycleBeatName, Readonly<GardenPrintInk>>> = {
  dawn: { amount: 0.35, ink: lumaNormalised(new Color(P.fog_pale)) },
  // Print-gate tune: 0.15 → 0.3, so noon shade reads cool blue-green, not grey.
  day: {
    amount: 0.3,
    ink: lumaNormalised(new Color(P.sky_day_zenith).lerp(new Color(P.shallow_teal), 0.5)),
  },
  // Violet-BLUE, not lavender: the golden shade is the lit gold's complement.
  golden: { amount: 0.6, ink: lumaNormalised(new Color(P.fog_blue).lerp(new Color(P.sky_day_zenith), 0.3)) },
  blue: { amount: 0.5, ink: lumaNormalised(new Color(P.sky_horizon)) },
  night: { amount: 0.45, ink: lumaNormalised(new Color(P.deep_sea_1)) },
};

/** Hull timber keeps half the ink; strakes (issuer trim) keep none. */
const GARDEN_PRINT_HULL_INK_SCALE = 0.5;

/**
 * The warm line, in world units: above every caster (the sceptre tip is 38 u)
 * when the sun is on the horizon, below the waterline once it has cleared the
 * hills. It moves with the sun's elevation, so dawn descends and dusk climbs
 * by the same law.
 */
const FIRST_LIGHT_LINE_TOP = 42;
const FIRST_LIGHT_LINE_BOTTOM = -6;
/**
 * Sun elevations (radians) over which the line sweeps from top to bottom:
 * the last ~2.6° of displayed sun (≈ the last 20 minutes before sunset on the
 * pinned day). Print-gate tune, 0.17 → 0.045: the whole golden hour is lit
 * warm, and the line climbs off the crown only in its final minutes.
 */
const FIRST_LIGHT_SWEEP_START = 0;
const FIRST_LIGHT_SWEEP_END = 0.045;
/** Once the sun is this high the gate has let go of the whole world. */
const FIRST_LIGHT_RELEASE_START = 0.15;
const FIRST_LIGHT_RELEASE_END = 0.22;
/** Below the horizon the key is the blue-hour rig's; the gate fades out. */
const FIRST_LIGHT_BELOW_HORIZON = -0.04;
/**
 * Alpenglow belongs to the tower and hill tops, not the station roofs.
 * Print-gate tune, 18 → 13: the whole square tier (world y 11–29) takes the
 * last light, not only its upper half, so the Pharos reads gold at 18:30.
 */
const FIRST_LIGHT_GLOW_FLOOR = 13;
/** Below the line the key is skylight: dim and cool. */
const FIRST_LIGHT_SHADE_LEVEL = 0.4;
const FIRST_LIGHT_SHADE = lumaNormalised(
  new Color(P.fog_blue).lerp(new Color(P.sky_day_zenith), 0.4),
).multiplyScalar(FIRST_LIGHT_SHADE_LEVEL);
/** Rose-gold: the key's first minutes on the crown. */
const FIRST_LIGHT_GLOW = lumaNormalised(new Color(P.lantern_warm).lerp(new Color(P.vermillion), 0.25));
/** Share of the crown's fill that takes the alpenglow while the gate is open (0.6 → 0.75). */
const FIRST_LIGHT_GLOW_FILL = 0.75;

export const gardenPrintInkUniforms = {
  uGardenAiInk: { value: new Color(1, 1, 1) },
  uGardenAiAmount: { value: 0 },
  /**
   * x: warm line (world y), y: gate strength, z: glow floor (world y),
   * w: share of the crown's fill that takes the alpenglow.
   */
  uGardenFirstLight: {
    value: new Vector4(FIRST_LIGHT_LINE_TOP, 0, FIRST_LIGHT_GLOW_FLOOR, FIRST_LIGHT_GLOW_FILL),
  },
  uGardenFirstLightShade: { value: FIRST_LIGHT_SHADE.clone() },
  uGardenFirstLightGlow: { value: FIRST_LIGHT_GLOW.clone() },
};

const INK_BEAT_NAMES: readonly DayCycleBeatName[] = ["dawn", "day", "golden", "blue", "night"];
const scratchSunPose: GardenLightPose = { direction: new Vector3(0, 1, 0), elevation: 0 };

/** Where the warm line stands and how strongly it gates, for a sun elevation. */
export function gardenFirstLight(sunElevation: number): { gate: number; lineY: number } {
  const sweep = MathUtils.smoothstep(sunElevation, FIRST_LIGHT_SWEEP_START, FIRST_LIGHT_SWEEP_END);
  const gate = MathUtils.smoothstep(sunElevation, FIRST_LIGHT_BELOW_HORIZON, 0)
    * (1 - MathUtils.smoothstep(sunElevation, FIRST_LIGHT_RELEASE_START, FIRST_LIGHT_RELEASE_END));
  return {
    gate,
    lineY: FIRST_LIGHT_LINE_TOP + (FIRST_LIGHT_LINE_BOTTOM - FIRST_LIGHT_LINE_TOP) * sweep,
  };
}

/** X9: the day shade ink's swing, ± this amount from morning to afternoon. */
export const GARDEN_PRINT_DAY_INK_DRIFT = 0.1;

/** One allocation-free write re-inks every patched material. */
export function updateGardenPrintInks(hour: number, beats: DayCycleBeats): void {
  const ink = gardenPrintInkUniforms.uGardenAiInk.value.setRGB(0, 0, 0);
  let amount = 0;
  for (const name of INK_BEAT_NAMES) {
    const weight = beats[name];
    if (weight === 0) continue;
    const beat = GARDEN_PRINT_AI_INKS[name];
    ink.r += beat.ink.r * weight;
    ink.g += beat.ink.g * weight;
    ink.b += beat.ink.b * weight;
    amount += beat.amount * weight;
  }
  lumaNormalised(ink);
  // X9 (light-6): morning shade takes a little more of the cool ink, the
  // afternoon shade a little less, inside the day beat only.
  gardenPrintInkUniforms.uGardenAiAmount.value = Math.max(
    0,
    amount - GARDEN_PRINT_DAY_INK_DRIFT * gardenDayDrift(hour) * beats.day,
  );
  const { gate, lineY } = gardenFirstLight(gardenSunPose(hour, scratchSunPose).elevation);
  const firstLight = gardenPrintInkUniforms.uGardenFirstLight.value;
  firstLight.x = lineY;
  // The night beat's key is the moon; the sun's line has nothing to say to it.
  firstLight.y = gate * (1 - beats.night);
}

const INK_VERTEX_PARS = "varying float vGardenInkWorldY;";
const INK_VERTEX_CHUNK = /* glsl */ `
  {
    vec4 gardenInkWorld = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      gardenInkWorld = batchingMatrix * gardenInkWorld;
    #endif
    #ifdef USE_INSTANCING
      gardenInkWorld = instanceMatrix * gardenInkWorld;
    #endif
    vGardenInkWorldY = (modelMatrix * gardenInkWorld).y;
  }
`;
const INK_FRAGMENT_PARS = /* glsl */ `
varying float vGardenInkWorldY;
uniform vec3 uGardenAiInk;
uniform float uGardenAiAmount;
uniform vec4 uGardenFirstLight;
uniform vec3 uGardenFirstLightShade;
uniform vec3 uGardenFirstLightGlow;
float gardenFirstLightAbove(float level) {
  return smoothstep(level - 4.0, level + 4.0, vGardenInkWorldY);
}
vec3 gardenFirstLightTint() {
  vec3 gardenTint = mix(
    uGardenFirstLightShade,
    mix(vec3(1.0), uGardenFirstLightGlow, gardenFirstLightAbove(uGardenFirstLight.z)),
    gardenFirstLightAbove(uGardenFirstLight.x)
  );
  return mix(vec3(1.0), gardenTint, uGardenFirstLight.y);
}
`;
const DIRECTIONAL_LIGHT_INFO = "getDirectionalLightInfo( directionalLight, directLight );";
/** Fleet hull strakes: `vHullFinish.y` is 1 on the issuer-trim band. */
const HULL_FINISH_VARYING = "varying vec2 vHullFinish;";

type GardenInkShader = {
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
};

/** Patches one compiled shader with both plates. */
function injectGardenPrintInks(shader: GardenInkShader): void {
  if (!shader.fragmentShader.includes("#include <lights_fragment_end>")) return;
  Object.assign(shader.uniforms, gardenPrintInkUniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${INK_VERTEX_PARS}`)
    .replace("#include <project_vertex>", `#include <project_vertex>\n${INK_VERTEX_CHUNK}`);
  const hull = shader.fragmentShader.includes(HULL_FINISH_VARYING);
  const mask = hull ? `${GARDEN_PRINT_HULL_INK_SCALE.toFixed(2)} * (1.0 - vHullFinish.y)` : "1.0";
  // The key's gate lives inside three's directional loop, so only the sun (or
  // moon) is gated — never the beacon's PointLight. Read at compile time so a
  // chunk edited elsewhere is composed rather than overwritten.
  const lightsBegin = ShaderChunk.lights_fragment_begin;
  const gatedLightsBegin = lightsBegin.includes(DIRECTIONAL_LIGHT_INFO)
    ? `vec3 gardenKeyTint = gardenFirstLightTint();\n${lightsBegin.replace(
      DIRECTIONAL_LIGHT_INFO,
      `${DIRECTIONAL_LIGHT_INFO}\n\t\tdirectLight.color *= gardenKeyTint;`,
    )}`
    : "#include <lights_fragment_begin>";
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${INK_FRAGMENT_PARS}`)
    .replace("#include <lights_fragment_begin>", gatedLightsBegin)
    .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
  {
    float gardenAiLuma = dot(reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
    reflectedLight.indirectDiffuse = mix(
      reflectedLight.indirectDiffuse,
      gardenAiLuma * uGardenAiInk,
      clamp(uGardenAiAmount * (${mask}), 0.0, 1.0)
    );
    // The crown catches first light whichever face we see: part of its fill
    // takes the alpenglow too, so the warm line reads from every bearing.
    float gardenCrownLit = uGardenFirstLight.y * uGardenFirstLight.w
      * gardenFirstLightAbove(uGardenFirstLight.x) * gardenFirstLightAbove(uGardenFirstLight.z);
    reflectedLight.indirectDiffuse = mix(
      reflectedLight.indirectDiffuse,
      gardenAiLuma * uGardenFirstLightGlow,
      gardenCrownLit
    );
  }`);
}

/**
 * Identity, data and practical surfaces are never re-inked (printmaker-1
 * exclusions). Names catch the cloth, marks and lamps that carry no flag of
 * their own; an emissive at or above a cloth backlight marks a practical, while
 * the tower stone's faint warm bounce (0.015) stays printable.
 */
const INK_EXEMPT_NAME = /sail|canvas|cloth|pennant|flag|nobori|banner|cue-marker|signal|stele|lantern|lamp|window|beacon|halo|glow|flame|fire/i;
const PRACTICAL_EMISSIVE_INTENSITY = 0.03;

type GardenInkMaterial = MeshStandardMaterial | MeshLambertMaterial | MeshPhongMaterial;

function isInkableMaterial(material: Material): material is GardenInkMaterial {
  return material instanceof MeshStandardMaterial
    || material instanceof MeshLambertMaterial
    || material instanceof MeshPhongMaterial;
}

export function isGardenPrintInkExempt(object: Object3D, material: Material): boolean {
  if (!isInkableMaterial(material)) return true;
  const surfaceExemption = getGardenSurfaceExemption(material);
  if (surfaceExemption && surfaceExemption !== "foliage") return true;
  if (material.userData.gardenSailAtlas === true) return true;
  if (material.userData.gardenPrintInkExempt === true) return true;
  if (!material.toneMapped) return true;
  if (material.emissiveMap) return true;
  if (
    material.emissiveIntensity >= PRACTICAL_EMISSIVE_INTENSITY
    && (material.emissive.r > 0 || material.emissive.g > 0 || material.emissive.b > 0)
  ) return true;
  return INK_EXEMPT_NAME.test(object.name) || INK_EXEMPT_NAME.test(material.name);
}

/** C3: re-inks one lit material through the shared patch chain. Idempotent. */
export function applyGardenPrintInks(material: Material): void {
  const surfaceExemption = getGardenSurfaceExemption(material);
  if (surfaceExemption && surfaceExemption !== "foliage") return;
  applyGardenIrradiance(material);
  chainGardenMaterialPatch(material, {
    key: "garden-print-inks-v1",
    stage: "printInk",
    compile: (shader) => injectGardenPrintInks(shader),
  });
}

/**
 * Re-inks every lit, non-exempt material under `root`. Idempotent per
 * material, so a rebuilt part can be walked again; call once per topology
 * change, never per frame.
 */
export function applyGardenPrintInksToTree(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: readonly Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (isGardenPrintInkExempt(object, material)) continue;
      applyGardenPrintInks(material);
    }
  });
}
