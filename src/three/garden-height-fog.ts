import {
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from "three";
import {
  blendDayCycleColor,
  blendDayCycleScalar,
  DAY_CYCLE_HEIGHT_FOG_PRESETS,
  type DayCyclePhase,
} from "./garden-day-cycle";
import { gardenSunPose } from "./garden-sun";

/**
 * W2.1 shared analytic atmosphere.
 *
 * This is an extra term in the existing fog ladder, never a replacement for
 * the view-scaled linear fog owned by garden-sky. In particular it does not
 * move that ladder's `FOG_REFERENCE_VIEW_HEIGHT` pivot: the pivot must keep
 * tracking the real default view height (~62.5 wu at the 1.0 rest zoom and
 * 1000 px — it was ~77 when this comment said "~78", before the resting
 * camera was re-based in the 2026-09-05 warm-village pass), because the
 * upper-frame haze band — not the sky dome, which cannot enter the locked
 * ortho frame — is the visible sky. Bokashi bands and mist shelves remain
 * later near-field accents.
 */

export const gardenHeightFogUniforms = {
  uGardenHeightFogDensity: { value: DAY_CYCLE_HEIGHT_FOG_PRESETS.day.density },
  uGardenHeightFogFalloff: { value: DAY_CYCLE_HEIGHT_FOG_PRESETS.day.heightFalloff },
  uGardenHeightFogHorizon: { value: DAY_CYCLE_HEIGHT_FOG_PRESETS.day.horizon.clone() },
  uGardenHeightFogPhaseGain: { value: DAY_CYCLE_HEIGHT_FOG_PRESETS.day.phaseGain },
  uGardenHeightFogSeaLevel: { value: 0 },
  uGardenHeightFogSunDir: { value: new Vector3(0, 1, 0) },
  uGardenHeightFogSunTint: { value: DAY_CYCLE_HEIGHT_FOG_PRESETS.day.sunTint.clone() },
  uGardenHeightFogZenith: { value: DAY_CYCLE_HEIGHT_FOG_PRESETS.day.zenith.clone() },
};

/** Shared by every quay material; one write changes no material/program key. */
export const gardenQuayEpistemicHazeUniform = { value: 0 };

export function setGardenQuayEpistemicHaze(active: boolean): void {
  gardenQuayEpistemicHazeUniform.value = active ? 1 : 0;
}

const scratchSunPose = {
  direction: new Vector3(0, 1, 0),
  elevation: Math.PI / 2,
};

export interface GardenHeightFogFrame {
  hour: number;
  phase: DayCyclePhase;
  seaLevel: number;
  stormLevel?: number;
}

/** One allocation-free write updates every patched material in the scene. */
export function updateGardenHeightFog(frame: GardenHeightFogFrame): void {
  const { daylight, dusk } = frame.phase;
  const nightPreset = DAY_CYCLE_HEIGHT_FOG_PRESETS.night;
  const duskPreset = DAY_CYCLE_HEIGHT_FOG_PRESETS.dusk;
  const dayPreset = DAY_CYCLE_HEIGHT_FOG_PRESETS.day;
  const stormLevel = Math.max(0, Math.min(1, frame.stormLevel ?? 0));

  gardenHeightFogUniforms.uGardenHeightFogDensity.value = blendDayCycleScalar(
    nightPreset.density,
    duskPreset.density,
    dayPreset.density,
    dusk,
    daylight,
  ) * (1 + stormLevel * 1.2);
  gardenHeightFogUniforms.uGardenHeightFogFalloff.value = blendDayCycleScalar(
    nightPreset.heightFalloff,
    duskPreset.heightFalloff,
    dayPreset.heightFalloff,
    dusk,
    daylight,
  );
  gardenHeightFogUniforms.uGardenHeightFogPhaseGain.value = blendDayCycleScalar(
    nightPreset.phaseGain,
    duskPreset.phaseGain,
    dayPreset.phaseGain,
    dusk,
    daylight,
  );
  gardenHeightFogUniforms.uGardenHeightFogSeaLevel.value = frame.seaLevel;
  blendDayCycleColor(
    gardenHeightFogUniforms.uGardenHeightFogHorizon.value,
    nightPreset.horizon,
    duskPreset.horizon,
    dayPreset.horizon,
    dusk,
    daylight,
  );
  blendDayCycleColor(
    gardenHeightFogUniforms.uGardenHeightFogSunTint.value,
    nightPreset.sunTint,
    duskPreset.sunTint,
    dayPreset.sunTint,
    dusk,
    daylight,
  );
  blendDayCycleColor(
    gardenHeightFogUniforms.uGardenHeightFogZenith.value,
    nightPreset.zenith,
    duskPreset.zenith,
    dayPreset.zenith,
    dusk,
    daylight,
  );
  gardenSunPose(frame.hour, scratchSunPose);
  gardenHeightFogUniforms.uGardenHeightFogSunDir.value.copy(scratchSunPose.direction);
}

/** CPU reference for the contract-pinned exponential factor. */
export function gardenHeightFogFactor(input: {
  density: number;
  distance: number;
  heightFalloff: number;
  seaLevel: number;
  worldY: number;
}): number {
  const localDensity = input.density
    * Math.exp(-(input.worldY - input.seaLevel) * input.heightFalloff);
  return 1 - Math.exp(-localDensity * Math.max(0, input.distance));
}

/**
 * The GLSL definition is exported once and injected everywhere, following the
 * same pattern as gardenBokashiBandGlsl(). Directional in-scatter is compared
 * in the sea plane: the sun's elevation still comes from the shared arc, but
 * it cannot cancel its own azimuth against the locked camera's downward ray.
 */
export function gardenHeightFogGlsl(): string {
  return /* glsl */ `
uniform float uGardenHeightFogDensity;
uniform float uGardenHeightFogFalloff;
uniform vec3 uGardenHeightFogHorizon;
uniform float uGardenHeightFogPhaseGain;
uniform float uGardenHeightFogSeaLevel;
uniform vec3 uGardenHeightFogSunDir;
uniform vec3 uGardenHeightFogSunTint;
uniform vec3 uGardenHeightFogZenith;

vec3 gardenHeightFogHorizonRamp(vec3 viewDir) {
  float skyward = smoothstep(0.18, 0.92, abs(viewDir.y));
  return mix(uGardenHeightFogHorizon, uGardenHeightFogZenith, skyward * 0.46);
}

vec3 gardenApplyHeightFog(
  vec3 sceneColor,
  vec3 worldPosition,
  float dist,
  vec3 viewDir
) {
  float localDensity = uGardenHeightFogDensity
    * exp(-(worldPosition.y - uGardenHeightFogSeaLevel) * uGardenHeightFogFalloff);
  float factor = 1.0 - exp(-localDensity * max(dist, 0.0));

  vec2 viewAzimuth = viewDir.xz / max(length(viewDir.xz), 1e-4);
  vec2 sunAzimuth = uGardenHeightFogSunDir.xz
    / max(length(uGardenHeightFogSunDir.xz), 1e-4);
  float sunDot = max(dot(viewAzimuth, sunAzimuth), 0.0);
  vec3 fogCol = mix(
    gardenHeightFogHorizonRamp(viewDir),
    uGardenHeightFogSunTint,
    pow(sunDot, 8.0) * uGardenHeightFogPhaseGain
  );
  return mix(sceneColor, fogCol, clamp(factor, 0.0, 1.0));
}

vec3 gardenApplyLocalizedHeightFog(
  vec3 sceneColor,
  vec3 worldPosition,
  float dist,
  vec3 viewDir,
  float strength
) {
  float shelf = exp(-max(worldPosition.y - uGardenHeightFogSeaLevel, 0.0) * 0.38);
  float localDensity = uGardenHeightFogDensity * 4.0
    * exp(-(worldPosition.y - uGardenHeightFogSeaLevel) * uGardenHeightFogFalloff);
  float factor = (1.0 - exp(-localDensity * max(dist, 0.0)))
    * clamp(strength, 0.0, 1.0) * shelf;
  vec2 viewAzimuth = viewDir.xz / max(length(viewDir.xz), 1e-4);
  vec2 sunAzimuth = uGardenHeightFogSunDir.xz
    / max(length(uGardenHeightFogSunDir.xz), 1e-4);
  float sunDot = max(dot(viewAzimuth, sunAzimuth), 0.0);
  vec3 fogCol = mix(
    gardenHeightFogHorizonRamp(viewDir),
    uGardenHeightFogSunTint,
    pow(sunDot, 8.0) * uGardenHeightFogPhaseGain
  );
  return mix(sceneColor, fogCol, clamp(factor, 0.0, 0.34));
}
`;
}

type GardenCompiledShader = {
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
};

const HEIGHT_FOG_VERTEX_PARS = `
varying float vGardenHeightFogDepth;
varying vec3 vGardenHeightFogWorldPosition;
`;
const HEIGHT_FOG_VERTEX_CHUNK = /* glsl */ `
  vec4 gardenHeightFogWorldPosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    gardenHeightFogWorldPosition = batchingMatrix * gardenHeightFogWorldPosition;
  #endif
  #ifdef USE_INSTANCING
    gardenHeightFogWorldPosition = instanceMatrix * gardenHeightFogWorldPosition;
  #endif
  gardenHeightFogWorldPosition = modelMatrix * gardenHeightFogWorldPosition;
  vGardenHeightFogWorldPosition = gardenHeightFogWorldPosition.xyz;
`;
const HEIGHT_FOG_DEPTH_CHUNK = "vGardenHeightFogDepth = -mvPosition.z;";

/** Injects the shared term after Three's existing fog chunk. */
export function injectGardenHeightFog(
  shader: GardenCompiledShader,
  epistemicHazeUniform?: { value: number },
): void {
  Object.assign(shader.uniforms, gardenHeightFogUniforms);
  if (epistemicHazeUniform) shader.uniforms.uGardenEpistemicHaze = epistemicHazeUniform;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>\n${HEIGHT_FOG_VERTEX_PARS}`,
    )
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>\n${HEIGHT_FOG_VERTEX_CHUNK}`,
    )
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>\n${HEIGHT_FOG_DEPTH_CHUNK}`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
      varying float vGardenHeightFogDepth;
      varying vec3 vGardenHeightFogWorldPosition;
      ${epistemicHazeUniform ? "uniform float uGardenEpistemicHaze;" : ""}
      ${gardenHeightFogGlsl()}`,
    )
    .replace(
      "#include <fog_fragment>",
      `#include <fog_fragment>
      gl_FragColor.rgb = gardenApplyHeightFog(
        gl_FragColor.rgb,
        vGardenHeightFogWorldPosition,
        vGardenHeightFogDepth,
        normalize(vGardenHeightFogWorldPosition - cameraPosition)
      );${epistemicHazeUniform ? `
      gl_FragColor.rgb = gardenApplyLocalizedHeightFog(
        gl_FragColor.rgb,
        vGardenHeightFogWorldPosition,
        vGardenHeightFogDepth,
        normalize(vGardenHeightFogWorldPosition - cameraPosition),
        uGardenEpistemicHaze
      );` : ""}`,
    );
}

/** Composes with any existing material patch and is safe to call repeatedly. */
export function patchGardenHeightFogMaterial(
  material: MeshStandardMaterial,
  options: { epistemicHaze?: "quay" } = {},
): void {
  if (material.userData.gardenHeightFog) return;
  material.userData.gardenHeightFog = true;
  const epistemicHazeUniform = options.epistemicHaze === "quay"
    ? gardenQuayEpistemicHazeUniform
    : undefined;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    injectGardenHeightFog(shader, epistemicHazeUniform);
  };
  material.customProgramCacheKey = () => `${previousCacheKey}|garden-height-fog-v1${epistemicHazeUniform ? "|epistemic-quay" : ""}`;
  material.needsUpdate = true;
}

/** Applies W2.1 to every lit standard material below a scene root. */
export function applyGardenHeightFog(
  root: Object3D,
  options: { epistemicHaze?: "quay" } = {},
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial) patchGardenHeightFogMaterial(material, options);
    }
  });
}
