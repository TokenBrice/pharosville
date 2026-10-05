import { Float32BufferAttribute, MeshStandardMaterial, type BufferGeometry, type IUniform, type Material, type WebGLProgramParametersWithUniforms } from "three";
import { chainGardenMaterialPatch } from "./garden-aerial";
import { applyGardenIrradiance } from "./garden-irradiance";

export type GardenSurfaceRole = "moss" | "stone" | "gravel" | "earth" | "timber" | "plaster" | "roofTile";
export type GardenSurfaceMapping = "worldXZ" | "triplanar" | "uv";
export type GardenSurfaceExemption = "cloth" | "mon" | "nobori" | "issuerTrim" | "dataTrace" | "practicalEmission" | "foliage";

/** Scalar float IDs; keep each triangle's role constant, splitting vertices at role boundaries. */
export const GARDEN_SURFACE_ROLE_ATTRIBUTE = "gardenSurfaceRole";
export const GARDEN_SURFACE_ROLE_CODES: Readonly<Record<GardenSurfaceRole, number>> = {
  moss: 0, stone: 1, gravel: 2, earth: 3, timber: 4, plaster: 5, roofTile: 6,
};
/** Optional scalar [0,1] detail mask; authored vertex colours still own the broad composition. */
export const GARDEN_SURFACE_WEIGHT_ATTRIBUTE = "gardenSurfaceWeight";

/** Canonical merge attributes. Authored UVs/roles/masks win over metric defaults. */
export function normalizeGardenSurfaceGeometry(geometry: BufferGeometry, role: GardenSurfaceRole): void {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  for (const [name, size] of [
    ["uv", 2], [GARDEN_SURFACE_ROLE_ATTRIBUTE, 1], [GARDEN_SURFACE_WEIGHT_ATTRIBUTE, 1],
  ] as const) {
    const source = geometry.getAttribute(name);
    if (source instanceof Float32BufferAttribute && !source.normalized && source.itemSize === size) continue;
    const values = new Float32Array(position.count * size);
    for (let index = 0; index < position.count; index += 1) {
      if (source) {
        values[index * size] = source.getX(index);
        if (size === 2) values[index * size + 1] = source.getY(index);
      } else if (name === "uv") {
        const nx = Math.abs(normal.getX(index)), ny = Math.abs(normal.getY(index)), nz = Math.abs(normal.getZ(index));
        // Longitudinal X grain on deck/side faces; Z grain on end faces.
        values[index * 2] = nx > ny && nx > nz ? position.getZ(index) : position.getX(index);
        values[index * 2 + 1] = ny >= nx && ny >= nz ? position.getZ(index) : position.getY(index);
      } else {
        values[index] = name === GARDEN_SURFACE_ROLE_ATTRIBUTE ? GARDEN_SURFACE_ROLE_CODES[role] : 1;
      }
    }
    geometry.setAttribute(name, new Float32BufferAttribute(values, size));
  }
}

export interface GardenSurfaceRecipe {
  readonly roughness: number;
  readonly roughnessRange: readonly [number, number];
  readonly metalness: 0;
}
export const GARDEN_SURFACE_RECIPES: Readonly<Record<GardenSurfaceRole, GardenSurfaceRecipe>> = {
  moss: { roughness: 0.96, roughnessRange: [0.9, 1], metalness: 0 },
  stone: { roughness: 0.9, roughnessRange: [0.8, 0.98], metalness: 0 },
  gravel: { roughness: 0.97, roughnessRange: [0.9, 1], metalness: 0 },
  earth: { roughness: 0.98, roughnessRange: [0.9, 1], metalness: 0 },
  timber: { roughness: 0.82, roughnessRange: [0.72, 0.92], metalness: 0 },
  plaster: { roughness: 0.92, roughnessRange: [0.8, 0.98], metalness: 0 },
  roofTile: { roughness: 0.75, roughnessRange: [0.65, 0.85], metalness: 0 },
};

/**
 * Sampling seam for the later leased atlas. Supply gardenSampleSurface(vec3
 * worldMetres, vec3 worldNormal, vec2 uvMetres, float role, float metresPerRepeat)
 * returning GardenSurfaceDetail. Source uniforms/maps remain owned by the source's
 * lease, never by this material. The default neutral source owns no GPU resources.
 * GARDEN_SURFACE_WORLD_XZ/TRIPLANAR/UV selects the mapping at compile time.
 */
export interface GardenSurfaceDetailSource {
  readonly key: string;
  readonly glsl: string;
  readonly uniforms: Readonly<Record<string, IUniform>>;
}
export const GARDEN_SURFACE_GLSL = /* glsl */`
#ifndef GARDEN_SURFACE_DETAIL_DEFINED
#define GARDEN_SURFACE_DETAIL_DEFINED
struct GardenSurfaceDetail {
  vec3 albedo;
  float roughnessOffset;
  // A shallow world-space normal offset; zero keeps the original authored normal.
  vec3 normalOffset;
};
#endif
`;
const NEUTRAL_SURFACE_DETAIL: GardenSurfaceDetailSource = {
  key: "neutral-v1",
  uniforms: {},
  glsl: /* glsl */`
GardenSurfaceDetail gardenSampleSurface(vec3 worldMetres, vec3 worldNormal, vec2 uvMetres, float role, float metresPerRepeat) {
  return GardenSurfaceDetail(vec3(1.0), 0.0, vec3(0.0));
}
`,
};

export interface GardenSurfaceOptions {
  role: GardenSurfaceRole;
  mapping: GardenSurfaceMapping;
  /** World coordinates and UVs are metres; timber grain follows metric UV.x. */
  metresPerRepeat: number;
  /** Static detail weight [0,1], independent of shader cache keys. */
  detailStrength: number;
  vertexWeights?: boolean;
  vertexRoles?: boolean;
  detailSource?: GardenSurfaceDetailSource;
}
export interface GardenSurfaceMetadata {
  role: GardenSurfaceRole;
  mapping: GardenSurfaceMapping;
  metresPerRepeat: number;
  detailStrength: number;
  vertexWeights: boolean;
  vertexRoles: boolean;
  sourceKey: string;
}

/** Explicit metadata is copied by Material.clone(), unlike compiled patch state. */
export function getGardenSurfaceExemption(material: Material): GardenSurfaceExemption | undefined {
  const explicit = material.userData.gardenSurfaceExemption as GardenSurfaceExemption | undefined;
  if (explicit) return explicit;
  if (material.userData.gardenSailAtlas === true) return "cloth";
  if (/nobori/i.test(material.name)) return "nobori";
  if (/sail|canvas|cloth|pennant|flag|banner/i.test(material.name)) return "cloth";
  if (/(^|[-_ ])mon($|[-_ ])/i.test(material.name)) return "mon";
  if (/issuer[-_ ]?trim/i.test(material.name)) return "issuerTrim";
  if (/cue-marker|signal|stele|data[-_ ]?trace/i.test(material.name)) return "dataTrace";
  if (!material.toneMapped || /lantern|lamp|window|beacon|halo|glow|flame|fire/i.test(material.name)) return "practicalEmission";
  if (material instanceof MeshStandardMaterial && (material.emissiveMap || (
    material.emissiveIntensity >= 0.03
    && (material.emissive.r > 0 || material.emissive.g > 0 || material.emissive.b > 0)
  ))) return "practicalEmission";
  return undefined;
}

interface SurfaceState {
  metadata: GardenSurfaceMetadata;
  source: GardenSurfaceDetailSource;
  uniforms: { uGardenSurfaceRepeat: IUniform<number>; uGardenSurfaceStrength: IUniform<number> };
}
const surfaceStates = new WeakMap<Material, SurfaceState>();

function injectSurface(shader: WebGLProgramParametersWithUniforms, state: SurfaceState): void {
  const config = state.metadata;
  const source = state.source;
  Object.assign(shader.uniforms, state.uniforms, source.uniforms);
  const weightPars = config.vertexWeights ? `attribute float ${GARDEN_SURFACE_WEIGHT_ATTRIBUTE};\nvarying float vGardenSurfaceWeight;` : "";
  const rolePars = config.vertexRoles ? `attribute float ${GARDEN_SURFACE_ROLE_ATTRIBUTE};\nvarying float vGardenSurfaceRole;` : "";
  const uvPars = config.mapping === "uv" ? "varying vec2 vGardenSurfaceUv;" : "";
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\nvarying vec3 vGardenSurfacePosition;\nvarying vec3 vGardenSurfaceNormal;\n${uvPars}\n${weightPars}\n${rolePars}`)
    .replace("#include <project_vertex>", `#include <project_vertex>
  // Match three's final deformed, batched and instanced position, without relying
  // on worldpos_vertex (which is conditional on lights/environment/fog).
  vec4 gardenSurfacePosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    gardenSurfacePosition = batchingMatrix * gardenSurfacePosition;
  #endif
  #ifdef USE_INSTANCING
    gardenSurfacePosition = instanceMatrix * gardenSurfacePosition;
  #endif
  vGardenSurfacePosition = (modelMatrix * gardenSurfacePosition).xyz;
  vGardenSurfaceNormal = inverseTransformDirection(transformedNormal, viewMatrix);
  ${config.mapping === "uv" ? "vGardenSurfaceUv = uv;" : ""}
  ${config.vertexWeights ? `vGardenSurfaceWeight = ${GARDEN_SURFACE_WEIGHT_ATTRIBUTE};` : ""}
  ${config.vertexRoles ? `vGardenSurfaceRole = ${GARDEN_SURFACE_ROLE_ATTRIBUTE};` : ""}`);
  const role = config.vertexRoles ? "clamp(floor(vGardenSurfaceRole + 0.5), 0.0, 6.0)" : `${GARDEN_SURFACE_ROLE_CODES[config.role]}.0`;
  const rangeBranches = Object.entries(GARDEN_SURFACE_RECIPES).map(([name, recipe]) => {
    const code = GARDEN_SURFACE_ROLE_CODES[name as GardenSurfaceRole];
    return `if (role < ${(code + 0.5).toFixed(1)}) return vec3(${recipe.roughness.toFixed(2)}, ${recipe.roughnessRange[0].toFixed(2)}, ${recipe.roughnessRange[1].toFixed(2)});`;
  }).join("\n");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>
#define GARDEN_SURFACE_${config.mapping === "worldXZ" ? "WORLD_XZ" : config.mapping === "triplanar" ? "TRIPLANAR" : "UV"}
varying vec3 vGardenSurfacePosition;
varying vec3 vGardenSurfaceNormal;
${uvPars}
${config.vertexWeights ? "varying float vGardenSurfaceWeight;" : ""}
${config.vertexRoles ? "varying float vGardenSurfaceRole;" : ""}
uniform float uGardenSurfaceRepeat;
uniform float uGardenSurfaceStrength;
${GARDEN_SURFACE_GLSL}
${source.glsl}
vec3 gardenSurfaceRoughness(float role) {
  ${rangeBranches}
  return vec3(0.75, 0.65, 0.85);
}`)
    .replace("#include <color_fragment>", `#include <color_fragment>
  float gardenSurfaceRole = ${role};
  float gardenSurfaceWeight = uGardenSurfaceStrength${config.vertexWeights ? " * clamp(vGardenSurfaceWeight, 0.0, 1.0)" : ""};
  ${shader.fragmentShader.includes("varying vec2 vHullFinish;") ? "gardenSurfaceWeight *= 1.0 - clamp(vHullFinish.y, 0.0, 1.0);" : ""}
  GardenSurfaceDetail gardenSurfaceDetail = gardenSampleSurface(vGardenSurfacePosition,
    normalize(vGardenSurfaceNormal), ${config.mapping === "uv" ? "vGardenSurfaceUv" : "vec2(0.0)"}, gardenSurfaceRole, uGardenSurfaceRepeat);
  diffuseColor.rgb *= mix(vec3(1.0), gardenSurfaceDetail.albedo, gardenSurfaceWeight);`)
    .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  vec3 gardenSurfaceRange = gardenSurfaceRoughness(gardenSurfaceRole);
  roughnessFactor = clamp(${config.vertexRoles ? "gardenSurfaceRange.x" : "roughnessFactor"}
    + gardenSurfaceDetail.roughnessOffset * gardenSurfaceWeight, gardenSurfaceRange.y, gardenSurfaceRange.z);`)
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  normal = normalize(normal + (viewMatrix * vec4(gardenSurfaceDetail.normalOffset, 0.0)).xyz * gardenSurfaceWeight);`);
}

/**
 * Prepare geometry-first PBR materials after installing deformation. Idempotent,
 * clone-safe, static, and texture-free by default; does not adopt any builders.
 * Reconfiguration replaces the one surface slot rather than layering finishes.
 */
export function applyGardenSurface(material: Material, options: GardenSurfaceOptions): void {
  if (!(material instanceof MeshStandardMaterial) || getGardenSurfaceExemption(material)
    || material.userData.gardenPrintInkExempt === true) return;
  const source = options.detailSource ?? NEUTRAL_SURFACE_DETAIL;
  let state = surfaceStates.get(material);
  const metadata: GardenSurfaceMetadata = {
    role: options.role,
    mapping: options.mapping,
    metresPerRepeat: Math.max(0.001, options.metresPerRepeat),
    detailStrength: Math.min(1, Math.max(0, options.detailStrength)),
    vertexWeights: options.vertexWeights === true,
    vertexRoles: options.vertexRoles === true,
    sourceKey: source.key,
  };
  if (!state) {
    state = { metadata, source, uniforms: {
      uGardenSurfaceRepeat: { value: metadata.metresPerRepeat },
      uGardenSurfaceStrength: { value: metadata.detailStrength },
    } };
    surfaceStates.set(material, state);
  }
  state.metadata = metadata;
  state.source = source;
  state.uniforms.uGardenSurfaceRepeat.value = metadata.metresPerRepeat;
  state.uniforms.uGardenSurfaceStrength.value = metadata.detailStrength;
  material.userData.gardenSurface = metadata;
  material.metalness = 0;
  material.roughness = GARDEN_SURFACE_RECIPES[options.role].roughness;
  const ownedState = state;
  chainGardenMaterialPatch(material, {
    key: `garden-surface-v1:${options.role}:${options.mapping}:weights=${+metadata.vertexWeights}:roles=${+metadata.vertexRoles}:${source.key}`,
    slot: "garden-surface",
    stage: "surface",
    compile: (shader) => injectSurface(shader, ownedState),
  });
  applyGardenIrradiance(material);
}
