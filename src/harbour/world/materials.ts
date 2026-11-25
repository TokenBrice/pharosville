import { GLSL_BUMP, GLSL_NOISE, GLSL_PATTERNS } from "./shaders/patterns";
import type { TerrainShaderPatcher } from "./shaders/terrain";
import type { EngineContext, PreparationService } from "../engine/types";
import { GLSL_ENV, GLSL_POOL, GLSL_AO } from "./shaders/lighting";
import { liteShadow } from "./shaders/shadow";
import { GLSL_LEAF_FALL, GLSL_SEASON } from "./shaders/season";
import { PATTERN_LEAF, PATTERN_LEAF_EVERGREEN, SNOW_SLOPE, SNOW_LEAF_KEEP, SNOW_CROWN_KEEP } from "./shaders/constants";
export { PATTERN_LEAF, PATTERN_LEAF_EVERGREEN, PATTERN_CROP, SNOW_SLOPE, SNOW_LEAF_KEEP, SNOW_CROWN_KEEP, ICICLE_WALL_PATTERNS } from "./shaders/constants";
import { prepareWindowGeometry } from "./shaders/window-geometry";
export { prepareWindowGeometry } from "./shaders/window-geometry";
import { patch } from "../engine/shader-patch";
import * as THREE from "three";
import { LANDMARK_HOVER_GLSL, landmarkHover } from "./landmark-hover";
import { decodeInto, deferPatternDecode, setBounds, takePatternTransform } from "../engine/static-merge";
import type { WorldUniforms } from "../engine/uniforms";
import { CLOUD_SHADOW_GLSL, cloudShadowUniforms } from "../sky/cloud-shadow";
import { StaticDepthRegistry } from "./depth-prepass";
import { AERIAL_GLSL, AERIAL_VERT_GLSL, aerialUniforms } from "./aerial";
import { RUNUP_GLSL, runupUniforms } from "./runup";
import { BEAM_LIGHT_GLSL, BEAM_LIGHT_VERT_GLSL, beamLightUniforms } from "../beam/beam-light-glsl";
import { getBeamUniforms } from "../beam/uniforms";
import { LAMP_WAVE_GLSL, lampWaveUniforms } from "../lights/lamp-wave";
import { dewUniforms } from "../weather/dew";
import { SWAY_VERTEX_APPLY, SWAY_VERTEX_DECL, swayUniforms } from "./sway";
import { METAL_GLSL } from "./metal";
import { CROWN_CALL_GLSL, CROWN_GLSL } from "./shaders/crowns";
import { extraEnabled } from "../engine/extras";

/**
 * THE HARBOUR MATERIAL PORT — style C "Northern Light" (p1/style-c/nl_common.py build_kit_material,
 * build_glass_material, build_glow_material) as MeshStandardMaterial + onBeforeCompile, so three's
 * physically-correct lights, shadows, fog and instancing all keep working.
 *
 * Kit contract (GLB `COLOR_0`): rgb = albedo per face (±4 % jitter baked), alpha = pattern id / 16.
 * Patterns are evaluated from OBJECT-space position + normal (Blender Z-up, converted here from glTF
 * Y-up), exactly like the Blender node tree, plus a world-space value breakup. Everything that is
 * finer than ~2 px is faded to its average (fwidth) so the overview never shimmers.
 *
 * Material names → port (Blender names on the left, P2 contract names on the right):
 *   M_kit / hb_opaque              → kit
 *   M_window / hb_window           → window  (COLOR_0.r = lit, .g = warmth, .b = window kind; emissive × uWindowGlow)
 *   lamp / beacon_red / hb_emissive → emissive (× uLamp)
 *   lens                           → lens (× uLens × lit)
 *   lantern_glass / hb_glass       → glass
 *   M_sail / hb_sail / hb_cover    → kit (plain), double-sided — the fleet owns its instanced sail shader
 *
 * Encodings shared with the Blender side (scripts/harbour/blender/island/nl_common.py):
 *   hb_window COLOR_0.b  window kind: 0 = framed (painted frame + cross mullion over glass, the original look),
 *                        1 = plain lit opening (no frame or mullion, a warm recessed glow); read as b > 0.5.
 *   hb_opaque pattern 14 leaf_evergreen: the leaf pattern, always evergreen (no blossom, no autumn colour, no
 *                        winter leaf fall) and snowed like the conifers. Pattern 8 (leaf) still infers
 *                        evergreen from its colour (hbConifer), so existing assets are unchanged.
 */

/** hb_window COLOR_0.b → window kind (see the encodings above). */
export const WINDOW_KIND = { framed: 0, plain: 1 } as const;
export function windowKindOf(b: number): 0 | 1 {
  return b > 0.5 ? WINDOW_KIND.plain : WINDOW_KIND.framed;
}
/** COLOR_0.a → pattern id (mirrors the kit shader's floor(a * 16 + 0.5)). */
export function patternIdOf(alpha: number): number {
  return Math.floor(alpha * 16 + 0.5);
}
/** 1 = keeps its leaves all year (mirrors hbEvergreen): pattern 14 always, pattern 8 by colour (hbConifer). */
export function evergreenOf(pid: number, [, g, b]: readonly [number, number, number]): number {
  if (Math.abs(pid - PATTERN_LEAF_EVERGREEN) <= 0.25) return 1;
  const ss = THREE.MathUtils.smoothstep;
  return Math.max(1 - ss(g, 0.045, 0.075), ss(b / Math.max(g, 1e-3), 0.26, 0.33));
}
/** Leaf-fall share of a fragment (mirrors hbFoliage's bare): only deciduous leaf (pattern 8) drops. */
export function bareOf(pid: number, vc: readonly [number, number, number], fall: number): number {
  return Math.abs(pid - PATTERN_LEAF) <= 0.25 ? fall * (1 - evergreenOf(pid, vc)) : 0;
}
export function snowSlopeOf(up: number, snowCover: number, leaf: boolean): number {
  const s = SNOW_SLOPE;
  const lo = (leaf ? s.leafLo : s.lo) - s.give * snowCover, hi = (leaf ? s.leafHi : s.hi) - s.give * snowCover;
  return THREE.MathUtils.smoothstep(up, lo, hi);
}
export function leafSnowKeepOf(pid: number): number {
  const leaf = Math.abs(pid - PATTERN_LEAF) <= 0.25 || Math.abs(pid - PATTERN_LEAF_EVERGREEN) <= 0.25;
  if (!leaf) return 1;
  return SNOW_LEAF_KEEP * (Math.abs(pid - PATTERN_LEAF_EVERGREEN) <= 0.25 ? SNOW_CROWN_KEEP : 1);
}

export type HarbourMaterialKind = "kit" | "terrain" | "window" | "emissive" | "lens" | "glass";

export function materialKindFor(name: string): HarbourMaterialKind | null {
  const n = name.toLowerCase();
  if (n.startsWith("hb_terrain")) return "terrain";
  if (n.startsWith("hb_opaque") || n.startsWith("m_kit")) return "kit";
  if (n.startsWith("m_window") || n.startsWith("hb_window")) return "window";
  if (n.startsWith("lamp") || n.startsWith("beacon") || n.startsWith("hb_emissive") || n.startsWith("riding")) return "emissive";
  if (n === "lens" || n.startsWith("hb_lens")) return "lens";
  if (n.startsWith("lantern_glass") || n.startsWith("hb_glass")) return "glass";
  if (n.startsWith("m_sail") || n.startsWith("hb_sail") || n.startsWith("hb_cover")) return "kit";
  return null;
}

/** Light-pool projection shared by every lit material (written by the lights system). */
/** Height-field AO shared by every lit material (written by the island system). */
export interface AOUniforms {
  uAOTex: THREE.IUniform<THREE.Texture>;
  uAOBounds: THREE.IUniform<THREE.Vector4>;
}

/** Baked island splat/topo maps and procedural micro-detail array texture for `hb_terrain`. */
export interface TerrainMapUniforms {
  uTerrainSplat: THREE.IUniform<THREE.Texture>;
  uTerrainTopo: THREE.IUniform<THREE.Texture>;
  uTerrainDetail: THREE.IUniform<THREE.DataArrayTexture>;
  /** (minX, maxZ, 1/sizeX, 1/sizeZ) of terrain-splat & terrain-topo in world x/z; z <= 0 disables sampling. */
  uTerrainBounds: THREE.IUniform<THREE.Vector4>;
}

export interface PoolUniforms {
  uPoolTex: THREE.IUniform<THREE.Texture>;
  /** (minX, minZ, 1/sizeX, 1/sizeZ) of the pool texture in world x/z. */
  uPoolBounds: THREE.IUniform<THREE.Vector4>;
  /** The decorative lamps' share of their light at this zoom, on their pools and their glass (lights-system.ts lampFar). */
  uLampFar: THREE.IUniform<number>;
}

/** Late-autumn / winter leaf fall at compile time (mirrors hbLeafFall): > 0 compiles the bare-crown discard in. */
export function leafFallAt(u: WorldUniforms): number {
  const f = u.uFoliage.value;
  const x = THREE.MathUtils.clamp((u.uSeasonPhase.value - 0.84) / 0.09, 0, 1);
  return Math.min(1, f.w + f.z * x * x * (3 - 2 * x) * 0.55);
}

/**
 * Whether the farm year's stooks can stand this visit (hbCrop: cut from phase 0.50, carted in by 0.70, each field
 * ± 0.025): compiles them in only then (the calendar is fixed for a visit, set before anything compiles).
 */
export function stooksAt(u: WorldUniforms): boolean {
  const p = u.uSeasonPhase.value;
  return p > 0.47 && p < 0.73;
}

/** hbCrop's stage edges (phase), in order: shoots, green, gold, cut (stubble), plough. */
const CROP_STAGES: ReadonlyArray<readonly [string, number, number]> = [
  ["SHOOTS", 0.1, 0.22], ["GREEN", 0.24, 0.33], ["GOLD", 0.38, 0.47], ["CUT", 0.5, 0.53], ["PLOUGH", 0.7, 0.78],
];
/**
 * The farm-year stages a visit can show (hbCrop): every field's phase is the calendar's ± 0.025 (+ two days' margin:
 * a visit can cross midnight); per stage 0 absent, 2 complete everywhere, 1 blending. Compile-time HB_CROP_* defines.
 */
export function cropStagesAt(phase: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, a, b] of CROP_STAGES) {
    let lo = 1, hi = 0;
    for (let i = 0; i <= 64; i++) {
      const p = phase - 0.031 + (0.062 * i) / 64, f = p - Math.floor(p);
      const v = THREE.MathUtils.smoothstep(f, a, b);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    out[`HB_CROP_${name}`] = hi <= 0 ? "0" : lo >= 1 ? "2" : "1";
  }
  return out;
}

export interface ShaderFeatures {
  readonly pattern: number;
  readonly bare: boolean;
  readonly stooks: boolean;
  readonly cropStages: Readonly<Record<string, string>>;
  readonly lite: boolean;
}

export function shaderFeatureKey(f: ShaderFeatures): string {
  return `${f.pattern.toFixed(1)}_${f.bare ? "bare" : "leaf"}${f.stooks ? "_st" : ""}_c${Object.values(f.cropStages).join("")}${f.lite ? "_lite" : ""}`;
}

export function shaderFeatureDefines(f: ShaderFeatures): Record<string, string> {
  return { ...f.cropStages, ...(f.bare ? { HB_BARE: "" } : {}), ...(f.stooks ? { HB_STOOKS: "" } : {}), ...(f.lite ? { HB_LITE: "", HB_BEAM_VERT: "" } : {}) };
}

export interface TerrainShaderFeatures {
  readonly stooks: boolean;
  readonly cropStages: Readonly<Record<string, string>>;
  readonly lite: boolean;
}

export function terrainFeatureKey(f: TerrainShaderFeatures): string {
  return `${f.stooks ? "st_" : ""}c${Object.values(f.cropStages).join("")}${f.lite ? "_lite" : ""}`;
}

export function terrainFeatureDefines(f: TerrainShaderFeatures): Record<string, string> {
  return shaderFeatureDefines({ ...f, pattern: 0, bare: false });
}

interface Shader { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }

function injectVaryings(shader: Shader): void {
  shader.vertexShader = patch(shader.vertexShader, "#include <common>", "#include <common>\nvarying vec3 vHbLocal;\nvarying vec3 vHbLocalN;\nvarying vec3 vHbWorld;", { id: "world.1.common" });
  shader.vertexShader = patch(shader.vertexShader, "#include <begin_vertex>", "#include <begin_vertex>\nvHbLocal = position;\nvHbLocalN = objectNormal;", { id: "world.2.begin_vertex" });
  shader.vertexShader = patch(shader.vertexShader, "#include <worldpos_vertex>", `#include <worldpos_vertex>
  {
    vec4 hbW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      hbW = instanceMatrix * hbW;
    #endif
    vHbWorld = (modelMatrix * hbW).xyz;
  }`, { id: "world.3.worldpos_vertex" });
}

/** Peak window radiance: bright enough to bloom softly, low enough that frames and mullions survive it. */
const WIN_MAX = 2.6;
/** Emissive gain of the plain window kind (kind 1 only): its openings are smaller and deeper than framed panes. */
const PLAIN_GAIN = 1.8;

interface TerrainRuntimeChunk {
  patchTerrainShader: TerrainShaderPatcher;
  prepareIslandTerrain: (
    ctx: EngineContext,
    target: HarbourMaterials,
    urls: readonly [string, string],
    bounds: readonly [number, number, number, number],
    p?: PreparationService,
  ) => { detail: THREE.DataArrayTexture | null; bindMaps: () => Promise<void> };
}
let tChunk: TerrainRuntimeChunk | null = null;
let tLoad: Promise<TerrainRuntimeChunk> | null = null;

function mkDepth(name: string, prepass: boolean, side: THREE.Side): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side });
  m.name = name;
  if (prepass) m.colorWrite = false;
  return m;
}

export class HarbourMaterials {
  readonly pool: PoolUniforms;
  readonly ao: AOUniforms;
  readonly terrainMaps: TerrainMapUniforms;
  private tPatch: TerrainShaderPatcher | null = null;
  private readonly cache = new Map<string, THREE.Material>();
  private readonly fb0: THREE.DataTexture;
  private readonly fbD: THREE.DataArrayTexture;
  readonly staticDepth = new StaticDepthRegistry(this);
  readonly rimK: THREE.IUniform<number> = { value: 1 };
  /** The Pharos beam as a light (beam/beam-light-glsl.ts): bound by getHarbourMaterials. */
  readonly beam: Record<string, THREE.IUniform> = {};
  /** Low tier: the lighter kit program (HB_LITE, see GLSL_SEASON's note). Set by getHarbourMaterials from 'quality'. */
  private lite = false;
  /** Materials built on the kit's hook elsewhere (fleet, life and civic workers). */
  private readonly derived = new Set<THREE.Material>();
  private calendarInputs = "";
  private readonly features = new Map<string, ShaderFeatures>();
  private publishedFeatures = "";
  private pubT = "";
  private materialGeneration = 0;
  get generation(): number { return this.materialGeneration; }

  /** Program-key suffix for the kit's compile-time switches (derived materials append it to their own key). */
  kitKey(): string { return shaderFeatureKey(this.featureIdentity()); }

  /** Program-key suffix for `hb_terrain`'s compile-time switches (no bare-crown discard duplicates). */
  terrainKey(): string { return terrainFeatureKey(this.terrainFeatureIdentity()); }

  featureIdentity(pattern = 0, lite = this.lite): ShaderFeatures {
    const u = this.uniforms, f = u.uFoliage.value;
    const inputs = `${u.uSeasonPhase.value}:${f.z}:${f.w}`;
    if (inputs !== this.calendarInputs) { this.calendarInputs = inputs; this.features.clear(); }
    const key = `${pattern}:${lite}`;
    let features = this.features.get(key);
    if (!features) {
      features = Object.freeze({ pattern, bare: leafFallAt(u) > 0.001, stooks: stooksAt(u), cropStages: Object.freeze(cropStagesAt(u.uSeasonPhase.value)), lite });
      this.features.set(key, features);
    }
    return features;
  }

  terrainFeatureIdentity(lite = this.lite): TerrainShaderFeatures { return this.featureIdentity(0, lite); }

  /** Only synchronous compilation sees the target tier; no live material version is changed. */
  preparationScope(lite: boolean): () => void {
    const previous = this.lite; this.lite = lite;
    return () => { this.lite = previous; };
  }

  /** Register a material whose onBeforeCompile wraps the kit's (it must append kitKey() to its program key). */
  track(m: THREE.Material): void {
    if (this.derived.has(m)) return;
    this.derived.add(m);
    this.materialGeneration++;
    const untrack = () => { this.derived.delete(m); this.materialGeneration++; m.removeEventListener("dispose", untrack); };
    m.addEventListener("dispose", untrack);
  }

  setLite(lite: boolean): void {
    if (lite === this.lite) return;
    this.lite = lite;
    this.invalidateSeason();
  }

  setTerrainMaps(splat: THREE.Texture, topo: THREE.Texture, bounds?: readonly [number, number, number, number]): void {
    const m = this.terrainMaps;
    m.uTerrainSplat.value = splat;
    m.uTerrainTopo.value = topo;
    if (bounds) m.uTerrainBounds.value.set(bounds[0], bounds[3], 1 / (bounds[2] - bounds[0]), 1 / (bounds[3] - bounds[1]));
    else if (this.ao.uAOBounds.value.z > 0) m.uTerrainBounds.value.copy(this.ao.uAOBounds.value);
  }

  setTerrainDetail(detail: THREE.DataArrayTexture): void { this.terrainMaps.uTerrainDetail.value = detail; }
  setTerrainPatcher(patcher: TerrainShaderPatcher): void { this.tPatch = patcher; }

  async loadTerrainShader(): Promise<TerrainRuntimeChunk> {
    tLoad ??= import("./shaders/terrain").then((m) => (tChunk = m));
    const c = tChunk ?? await tLoad;
    this.tPatch = c.patchTerrainShader;
    return c;
  }

  constructor(readonly uniforms: WorldUniforms) {
    const black = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    black.needsUpdate = true;
    this.fb0 = black;
    const d = new Uint8Array(16).fill(128);
    d[3] = d[7] = d[11] = d[15] = 255;
    this.fbD = new THREE.DataArrayTexture(d, 1, 1, 4);
    this.fbD.needsUpdate = true;
    this.pool = { uPoolTex: { value: black }, uPoolBounds: { value: new THREE.Vector4() }, uLampFar: { value: 1 } };
    this.ao = { uAOTex: { value: black }, uAOBounds: { value: new THREE.Vector4() } };
    this.terrainMaps = { uTerrainSplat: { value: black }, uTerrainTopo: { value: black }, uTerrainDetail: { value: this.fbD }, uTerrainBounds: { value: new THREE.Vector4() } };
    this.publishedFeatures = this.kitKey();
    this.pubT = this.terrainKey();
  }

  prepareSeasonDepth(root: THREE.Object3D): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.castShadow || m.customDepthMaterial || Array.isArray(m.material) || !m.material) return;
      if (m.material.name === "hb_kit") m.customDepthMaterial = this.kitDepth();
      else if (m.material.name === "hb_veg_solid") m.customDepthMaterial = this.vegDepth();
      else if (m.material.name === "hb_terrain") m.customDepthMaterial = this.terrainDepth();
    });
  }

  invalidateSeason(root?: THREE.Object3D): void {
    const sig = this.kitKey(), tSig = this.terrainKey();
    const kc = sig !== this.publishedFeatures, tc = tSig !== this.pubT;
    if (!kc && !tc) return;
    this.publishedFeatures = sig;
    this.pubT = tSig;
    const changed = new Set<THREE.Material>(kc ? this.derived : undefined);
    for (const [k, m] of this.cache) if ((kc && (k.startsWith("kit") || k.startsWith("veg"))) || (tc && k.startsWith("terrain:"))) changed.add(m);
    root?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
        const k = m.customProgramCacheKey();
        if (kc && (k.includes("hb_kit_") || k.includes("veg-instanced"))) { changed.add(m); if (mesh.customDepthMaterial) changed.add(mesh.customDepthMaterial); }
        else if (tc && k.includes("hb_terrain_")) changed.add(m);
      }
    });
    for (const m of changed) m.needsUpdate = true;
    if (kc) this.staticDepth.invalidate();
  }

  private cached<T extends THREE.Material>(key: string, make: () => T, bump = false): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) { m = make(); this.cache.set(key, m); if (bump) this.materialGeneration++; }
    return m;
  }

  private shared(): Record<string, THREE.IUniform> {
    const { uTime, uHemiSky, uHemiGround, uHorizon, uWindowGlow, uLamp, uLens, uNight, uWindowOcc, uNightLift, uSnowCover, uWetness, uFoliage, uSeasonPhase, uSunDir: uHbSunDir, uSunColor: uHbSunColor } = this.uniforms;
    return {
      uTime, uHemiSky, uHemiGround, uHorizon, uWindowGlow, uLamp, uLens, uNight, uWindowOcc, uNightLift,
      uSnowCover, uWetness, uFoliage, uSeasonPhase, uHbSunDir, uHbSunColor,
      ...this.pool, ...this.ao, uRimK: this.rimK, ...this.beam, ...lampWaveUniforms, ...landmarkHover(this.uniforms).uniforms,
    };
  }

  /** The one opaque kit material (patterns + world breakup + facets + env spec + pools). */
  kit(opts: { side?: THREE.Side; pattern?: number } = {}): THREE.MeshStandardMaterial {
    const side = opts.side ?? THREE.DoubleSide;
    return this.cached(`kit:${side}:${opts.pattern ?? -1}`, () => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true, side });
    m.name = "hb_kit";
    const fallbackPid = (opts.pattern ?? 0).toFixed(1);
    m.onBeforeCompile = (shader) => {
      const features = this.featureIdentity(opts.pattern ?? 0);
      Object.assign(shader.uniforms, this.shared(), cloudShadowUniforms, dewUniforms, aerialUniforms, runupUniforms, { uAerialDensity: this.uniforms.uFogDensity, uAerialHaze: this.uniforms.uHaze });
      injectVaryings(shader);
      shader.vertexShader = patch(shader.vertexShader, "#include <common>", `#include <common>\n${AERIAL_VERT_GLSL}`, { id: "world.4.common" });
      shader.vertexShader = patch(shader.vertexShader, "    vHbWorld = (modelMatrix * hbW).xyz;\n  }", "    vHbWorld = (modelMatrix * hbW).xyz;\n    hbAerialVert(vHbWorld);\n  }", { id: "world.5.-vHbWorld-modelMatrix-hbW-xyz-" });
      // Low tier: the beam swath's soft amount per vertex (beam-light-glsl.ts BEAM_LIGHT_VERT_GLSL)
      if (features.lite) {
        shader.defines = { ...shader.defines, HB_BEAM_VERT: "" };
        shader.vertexShader = patch(shader.vertexShader, "#include <common>", `#include <common>\n${BEAM_LIGHT_VERT_GLSL}`, { id: "world.6.common" });
        shader.vertexShader = patch(shader.vertexShader, "    hbAerialVert(vHbWorld);\n  }", "    hbAerialVert(vHbWorld);\n    hbBeamVert(vHbWorld);\n  }", { id: "world.7.-hbAerialVert-vHbWorld-" });
      }
      // 08-T3: leaf / vine / cloth sway from island.glb's _SWAY weight (world/sway.ts); 0 elsewhere
      Object.assign(shader.uniforms, { uSwayWind: this.uniforms.uWindVec, uSwayTime: this.uniforms.uTime }, swayUniforms);
      shader.vertexShader = patch(shader.vertexShader, "#include <common>", `#include <common>\n${SWAY_VERTEX_DECL}`, { id: "world.8.common" });
      shader.vertexShader = patch(shader.vertexShader, "#include <begin_vertex>", `#include <begin_vertex>\n${SWAY_VERTEX_APPLY}`, { id: "world.9.begin_vertex" });
      // winter / late-autumn bare crowns discard: compiled in only when the calendar can need it
      shader.defines = { ...shader.defines, ...shaderFeatureDefines(features) };
      if (features.lite) shader.fragmentShader = patch(shader.fragmentShader, "#include <shadowmap_pars_fragment>", liteShadow(), { id: "world.lite-shadow" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <common>", `#include <common>\n${GLSL_NOISE}\n${GLSL_PATTERNS}\n${GLSL_BUMP}\n${GLSL_ENV}\n${GLSL_POOL}\n${GLSL_AO}\n${CLOUD_SHADOW_GLSL}\n${GLSL_SEASON}\n${AERIAL_GLSL}\n${RUNUP_GLSL}\n${BEAM_LIGHT_GLSL}\n${LANDMARK_HOVER_GLSL}\n${METAL_GLSL}`, { id: "world.10.common" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <color_fragment>", `
  vec3 hbVc = vec3(1.0);
  #if defined( USE_COLOR_ALPHA )
    float hbPid = floor(vColor.a * 16.0 + 0.5);
    diffuseColor.rgb *= vColor.rgb; hbVc = vColor.rgb;
  #elif defined( USE_COLOR )
    float hbPid = ${fallbackPid};
    diffuseColor.rgb *= vColor.rgb; hbVc = vColor.rgb;
  #else
    float hbPid = ${fallbackPid};
  #endif
  float hbSdW = fwidth(vHbWorld.x) + fwidth(vHbWorld.z);
  float hbBareNoise = hbNoise(vHbWorld * 1.7);
  float hbRough;
  float hbBumpH = 0.0;
  diffuseColor.rgb *= hbPattern(hbPid, hbRough, hbBumpH);
  {
    float hbBare;
    diffuseColor.rgb = hbFoliage(diffuseColor.rgb, hbVc, hbPid, vHbWorld, hbSdW, hbBare);
    #ifdef HB_VEG_INSTANCED
      diffuseColor.rgb *= vVegMeta.y;
    #endif
    #ifdef HB_BARE
      #ifdef HB_VEG_INSTANCED
        if (hbBareNoise < hbBare * 0.97) discard;
      #else
        if (hbBareNoise < hbBare * 0.84) discard;
      #endif
    #endif
  }
  diffuseColor.a = 1.0;`, { id: "world.11.color_fragment" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <roughnessmap_fragment>", "float roughnessFactor = hbRough;", { id: "world.12.roughnessmap_fragment" });
      // gilt, silver and bronze as metals (world/metal.ts; classified on pre-pattern hbVc so tiled/AO gilt stays metallic); snow on them is snow
      shader.fragmentShader = patch(shader.fragmentShader, "#include <metalnessmap_fragment>", "float metalnessFactor = hbMetal(hbPid, diffuseColor.rgb, hbVc, roughnessFactor);", { id: "world.13.metalnessmap_fragment" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  #ifndef HB_LITE
    if (hbIs(hbPid, 6.0) > 0.5) {
      vec3 hbGn = hbSmoothGrassNormal(vHbWorld, inverseTransformDirection(normal, viewMatrix));
      normal = transformDirection(hbGn, viewMatrix);
    }
    normal = hbApplyBump(normal, hbBumpH, hbPid, vHbLocalN);
  #endif`, { id: "world.13b.normal_fragment_maps" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <lights_physical_fragment>", `metalnessFactor *= 1.0 - hbSnow;
  #ifndef HB_LITE
    normal = normalize(mix(normal, nonPerturbedNormal, clamp(hbPuddle * 0.95 + hbSnow * 0.65, 0.0, 1.0)));
  #endif
#include <lights_physical_fragment>`, { id: "world.14.lights_physical_fragment" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <emissivemap_fragment>", `
  float hbSnow, hbPuddle;
  vec3 hbMacroN = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
  hbWeather(diffuseColor.rgb, roughnessFactor, hbMacroN, hbPid, vHbWorld, hbSdW, hbSnow, hbPuddle);
  hbRunup(diffuseColor.rgb, roughnessFactor, vHbWorld, hbMacroN, hbPid);
  #include <emissivemap_fragment>`, { id: "world.15.emissivemap_fragment" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <aomap_fragment>", `#include <aomap_fragment>
  float hbOcc = hbAO(vHbWorld, inverseTransformDirection(normal, viewMatrix));
  #ifdef HB_FLEET
    float hbBoatAO = vPaintC.w;
    hbOcc *= hbBoatAO;
    reflectedLight.directDiffuse *= mix(0.82, 1.0, hbBoatAO);
  #endif
  float hbCs = hbCloudShadow(vHbWorld.xz);
  reflectedLight.directDiffuse *= hbCs;
  reflectedLight.directSpecular *= hbCs;
  reflectedLight.indirectDiffuse *= hbOcc;
  reflectedLight.indirectSpecular *= hbOcc;
  {
    float hbWetK = smoothstep(0.0, 0.25, uWetness);
    float hbCap = 0.005 + 0.5 * hbLuma(uHemiSky);
    float hbSl = hbLuma(reflectedLight.directSpecular);
    reflectedLight.directSpecular *= mix(1.0, min(1.0, hbCap / max(hbSl, 1e-5)), hbWetK);
  }
  hbMetalCap(reflectedLight.directSpecular, metalnessFactor);`, { id: "world.16.aomap_fragment" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <opaque_fragment>", `
  {
    vec3 hbV = normalize(vViewPosition);
    vec3 hbNw = inverseTransformDirection(normal, viewMatrix);
    vec3 hbVw = inverseTransformDirection(hbV, viewMatrix);
    float hbSkyL = hbLuma(uHemiSky);
    float hbWetSheen = smoothstep(0.0, 0.25, uWetness);
    float hbEnvF0 = mix(0.03, 0.012, hbIs(hbPid, 6.0) * (1.0 - max(hbWetSheen, hbSnow)));
    outgoingLight += min(hbEnvSpec(hbNw, hbVw, roughnessFactor, hbEnvF0), vec3(mix(4.0, 0.35 * hbSkyL + 0.01, hbWetSheen))) * uRimK * hbOcc;
    outgoingLight += hbBounceFill(diffuseColor.rgb, hbNw, uHbSunDir, uHbSunColor, hbOcc, uNight);
    if (hbLeafPid(hbPid) > 0.5) {
      outgoingLight += hbFoliageSSS(diffuseColor.rgb, hbNw, hbVw, uHbSunDir, uHbSunColor, hbOcc, hbCs, hbSnow, uNight);
    }
    outgoingLight += diffuseColor.rgb * hbPool(vHbWorld, hbNw);
    vec3 hbFire = hbPharosFire(vHbWorld, hbNw);
    outgoingLight += diffuseColor.rgb * (hbBeamLight(vHbWorld, hbNw) * hbOcc + hbFire);
    outgoingLight += max(diffuseColor.rgb, vec3(0.12)) * uNightLift * hbOcc * (0.6 + 0.4 * max(hbNw.y, 0.0)) * (1.0 - metalnessFactor * 0.72);
    outgoingLight += min(hbEnvSpec(hbNw, hbVw, 0.02, 0.03), vec3(0.3 * hbSkyL + 0.003)) * hbPuddle * hbOcc;
    if (hbSnow > 0.01) {
      float g = step(0.992, hbWhite(floor(vHbWorld * 4.5) + 101.0)) * hbFine(hbSdW, 0.22);
      float spec = pow(max(dot(reflect(-hbVw, hbNw), uHbSunDir), 0.0), 4.0);
      outgoingLight += uHbSunColor * g * spec * hbSnow * hbCs * 0.5;
    }
    outgoingLight += uHbSunColor * hbDewGlint(hbPid, vHbWorld, hbNw, hbVw, uHbSunDir, hbSdW) * hbCs * 0.6;
    outgoingLight += hbLmHoverRim(vHbWorld, hbNw, hbVw, outgoingLight);
    outgoingLight += hbMetalLight(metalnessFactor, diffuseColor.rgb, hbNw, hbVw, roughnessFactor, reflectedLight.directSpecular, hbFire) * hbOcc;
    #ifdef HB_FLEET
      outgoingLight += hbFleetSeaBounce(diffuseColor.rgb, hbNw, uHbSunDir, uHbSunColor, hbOcc, uNight);
    #endif
  }
  hbAerial(outgoingLight, vHbWorld, 0.0);
  #include <opaque_fragment>`, { id: "world.17.opaque_fragment" });
      // E21 backlit crowns (world/shaders/crowns.ts): Medium and High only, and only with the boot's extras switch
      if (!features.lite && extraEnabled("crowns")) {
        shader.fragmentShader = patch(shader.fragmentShader, "#include <shadowmap_pars_fragment>", `#include <shadowmap_pars_fragment>\n${CROWN_GLSL}`, { id: "world.crowns.pars" });
        shader.fragmentShader = patch(shader.fragmentShader, "\n    outgoingLight += hbLmHoverRim(", `${CROWN_CALL_GLSL}\n    outgoingLight += hbLmHoverRim(`, { id: "world.crowns.call" });
      }
    };
    m.customProgramCacheKey = () => `hb_kit_${shaderFeatureKey(this.featureIdentity(opts.pattern ?? 0))}`;
    return m;
    }, true);
  }

  /**
   * Depth twin of the kit. Both variants compile out leaf discard outside the legacy bare-crown
   * activation boundary; an always-attached shadow twin must not run noise/discard in summer.
   */
  kitDepth(prepass = false, side: THREE.Side = THREE.DoubleSide): THREE.MeshDepthMaterial {
    return this.cached(prepass ? `kit-predepth:${side}` : "kit-depth", () => {
      const m = mkDepth(prepass ? "hb_kit_predepth" : "hb_kit_depth", prepass, side);
    m.onBeforeCompile = (shader) => {
      const features = this.featureIdentity();
      Object.assign(shader.uniforms, { uFoliage: this.uniforms.uFoliage, uSeasonPhase: this.uniforms.uSeasonPhase });
      if (features.bare) shader.defines = { ...shader.defines, HB_BARE: "" };
      shader.vertexShader = patch(shader.vertexShader, "#include <common>", "#include <common>\nattribute vec4 color;\nvarying vec3 vHbWorld;\nvarying vec4 vHbCol;", { id: "world.18.common" });
      shader.vertexShader = patch(shader.vertexShader, "#include <project_vertex>", `#include <project_vertex>
  vHbCol = color;
  {
    vec4 hbW = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      hbW = batchingMatrix * hbW;
    #endif
    #ifdef USE_INSTANCING
      hbW = instanceMatrix * hbW;
    #endif
    vHbWorld = (modelMatrix * hbW).xyz;
  }`, { id: "world.19.project_vertex" });
      // the static depth prepass must bend the same crowns the colour pass bends (08-T3 sway), or a crown swaying
      // away from the camera fails LessEqual against its own rest depth; the shadow twin stays static (sway.ts)
      if (prepass) {
        Object.assign(shader.uniforms, { uSwayWind: this.uniforms.uWindVec, uSwayTime: this.uniforms.uTime }, swayUniforms);
        if (features.lite) shader.defines = { ...shader.defines, HB_LITE: "" };
        shader.vertexShader = patch(shader.vertexShader, "#include <common>", `#include <common>\n${SWAY_VERTEX_DECL}`, { id: "world.20.common" });
        shader.vertexShader = patch(shader.vertexShader, "#include <begin_vertex>", `#include <begin_vertex>\n${SWAY_VERTEX_APPLY}`, { id: "world.21.begin_vertex" });
      }
      shader.fragmentShader = patch(shader.fragmentShader, "#include <common>", `#include <common>\n${GLSL_NOISE}\n${GLSL_LEAF_FALL}\nvarying vec3 vHbWorld;\nvarying vec4 vHbCol;`, { id: "world.22.common" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  #ifdef HB_BARE
  {
    float pid = floor(vHbCol.a * 16.0 + 0.5);
    #ifdef HB_VEG_INSTANCED
      float bare = hbIs(pid, ${PATTERN_LEAF.toFixed(1)}) * hbLeafFall() * (1.0 - hbEvergreen(pid, vHbCol.rgb));
      if (hbNoise(vHbWorld * 1.7) < bare * 0.97) discard;
    #else
      float bare = hbIs(pid, ${PATTERN_LEAF.toFixed(1)}) * hbLeafFall() * (1.0 - hbConifer(vHbCol.rgb));
      if (hbNoise(vHbWorld * 1.7) < bare * 0.84) discard;
    #endif
  }
  #endif`, { id: "world.23.clipping_planes_fragment" });
    };
    m.customProgramCacheKey = () => `hb_kit_${prepass ? "predepth_v4_sw" : "depth_v3"}_${this.kitKey()}`;
    return m;
    }, true);
  }

  /** Instanced vegetation solid material: chains kit with HB_VEG_INSTANCED + per-instance aVegMeta. */
  vegSolid(opts: { side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
    const side = opts.side ?? THREE.DoubleSide;
    return this.cached(`veg:${side}`, () => {
      const base = this.kit({ side });
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true, side });
      m.name = "hb_veg_solid";
      m.onBeforeCompile = (shader, renderer) => {
        base.onBeforeCompile(shader, renderer);
        shader.defines = { ...shader.defines, HB_VEG_INSTANCED: "" };
        shader.vertexShader = patch(shader.vertexShader, "#include <common>", "#include <common>\nattribute vec4 aVegMeta;\nvarying vec4 vVegMeta;", { id: "world.veg.1.common" });
        shader.vertexShader = patch(shader.vertexShader, "#include <begin_vertex>", "#include <begin_vertex>\nvVegMeta = aVegMeta;", { id: "world.veg.2.begin_vertex" });
      };
      m.customProgramCacheKey = () => `hb_veg-instanced_${this.kitKey()}`;
      this.track(m);
      return m;
    }, true);
  }

  /** Instanced vegetation depth twin: static shadow (prepass=false) or swaying predepth (prepass=true) with HB_VEG_INSTANCED. */
  vegDepth(prepass = false, side: THREE.Side = THREE.DoubleSide): THREE.MeshDepthMaterial {
    return this.cached(prepass ? `veg-predepth:${side}` : "veg-depth", () => {
      const base = this.kitDepth(prepass, side);
      const m = mkDepth(prepass ? "hb_veg_predepth" : "hb_veg_depth", prepass, side);
      m.onBeforeCompile = (shader, renderer) => {
        base.onBeforeCompile(shader, renderer);
        shader.defines = { ...shader.defines, HB_VEG_INSTANCED: "" };
        if (prepass) {
          shader.vertexShader = patch(shader.vertexShader, "#include <common>", "#include <common>\nattribute vec4 aVegMeta;", { id: "world.veg.3.common" });
        }
      };
      m.customProgramCacheKey = () => `hb_veg-instanced_${prepass ? "predepth_v1_sw" : "depth_v1"}_${this.kitKey()}`;
      return m;
    }, true);
  }

  terrain(opts: { side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
    const side = opts.side ?? THREE.DoubleSide;
    return this.cached(`terrain:${side}`, () => {
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, vertexColors: true, side });
      m.name = "hb_terrain";
      m.onBeforeCompile = (shader) => {
        const p = this.tPatch ?? tChunk?.patchTerrainShader;
        if (!p) throw new Error("hb_terrain");
        const f = this.terrainFeatureIdentity();
        p(shader, { lite: f.lite, defines: terrainFeatureDefines(f), shared: this.shared(), maps: this.terrainMaps, u: this.uniforms, injectVaryings });
      };
      m.customProgramCacheKey = () => `hb_terrain_${this.terrainKey()}`;
      return m;
    }, true);
  }

  terrainDepth(prepass = false, side: THREE.Side = THREE.DoubleSide): THREE.MeshDepthMaterial {
    return this.cached(prepass ? `terrain-predepth:${side}` : "terrain-depth", () => {
      const m = mkDepth(prepass ? "hb_terrain_predepth" : "hb_terrain_depth", prepass, side);
      m.customProgramCacheKey = () => `hb_terrain_${prepass ? "predepth" : "depth"}_v1`;
      return m;
    }, true);
  }

  /**
   * Windows: painted frame + cross mullion around dark glass by day; by night a share of rooms
   * (uWindowOcc, deterministic per window) glows, each with its own warmth (candle → cool lamp) and level,
   * brighter low in the room, and clamped so frames and mullions stay visible under bloom.
   * Needs the per-window attributes written by prepareWindowGeometry() (apply() does it).
   * COLOR_0.r = authored lit factor (kept as a level hint), .g = warmth, .b = window kind (WINDOW_KIND): the
   * plain kind drops the frame and mullion for a dark warm reveal that glows warmer and dimmer at its edges.
   */
  window(): THREE.MeshStandardMaterial {
    return this.cached("window", () => {
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#22303C"), roughness: 0.08, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
    m.name = "hb_window";
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.shared());
      injectVaryings(shader);
      shader.vertexShader = patch(shader.vertexShader, "#include <common>", "#include <common>\nattribute vec4 hbWin;\nattribute vec3 hbWinC;\nvarying vec4 vHbWin;\nvarying vec3 vHbWinC;", { id: "world.24.common" });
      shader.vertexShader = patch(shader.vertexShader, "#include <begin_vertex>", `#include <begin_vertex>
  vHbWin = hbWin;
  {
    vec4 c = vec4(hbWinC, 1.0);
    #ifdef USE_INSTANCING
      c = instanceMatrix * c;
    #endif
    vHbWinC = (modelMatrix * c).xyz;
  }`, { id: "world.25.begin_vertex" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <common>", `#include <common>\nuniform float uWindowGlow;\nuniform float uWindowOcc;\n${GLSL_NOISE}\n${GLSL_ENV}\n${LAMP_WAVE_GLSL}\n${LANDMARK_HOVER_GLSL}\nvarying vec3 vHbLocal;\nvarying vec3 vHbLocalN;\nvarying vec3 vHbWorld;\nvarying vec4 vHbWin;\nvarying vec3 vHbWinC;`, { id: "world.26.common" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <color_fragment>", `
  float hbLit = 1.0, hbWarm = 0.0, hbPlain = 0.0;
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    hbLit = vColor.r; hbWarm = vColor.g; hbPlain = step(0.5, vColor.b);
  #endif
  vec2 hbWm = max(vHbWin.zw, vec2(0.05));
  vec2 hbP = vHbWin.xy * hbWm;
  vec2 hbAA = fwidth(hbP) + 1e-4;
  float hbEdge = min(min(hbP.x, hbWm.x - hbP.x), min(hbP.y, hbWm.y - hbP.y));
  float hbFrame = 1.0 - smoothstep(0.06 - hbAA.x, 0.06 + hbAA.x, hbEdge);
  float hbBar = 1.0 - smoothstep(0.03 - hbAA.x, 0.03 + hbAA.x, min(abs(hbP.x - hbWm.x * 0.5), abs(hbP.y - hbWm.y * 0.6)));
  float hbWood = max(hbFrame, hbBar);
  hbWood = mix(hbWood, 0.3, smoothstep(0.03, 0.09, max(hbAA.x, hbAA.y)));
  hbWood *= 1.0 - hbPlain;
  float hbGlass = 1.0 - hbWood;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.55), hbWood);
  float hbRecess = mix(0.45 + 0.55 * smoothstep(0.0, 0.28, hbEdge), 0.8, smoothstep(0.03, 0.09, max(hbAA.x, hbAA.y)));
  hbRecess = mix(1.0, hbRecess, hbPlain);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.032, 0.024), hbPlain) * hbRecess;
  float hbSheen = hbGlass * (1.0 - hbPlain);`, { id: "world.27.color_fragment" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <roughnessmap_fragment>", "float roughnessFactor = mix(0.6, 0.08, hbSheen) + 0.3 * hbPlain;", { id: "world.28.roughnessmap_fragment" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <emissivemap_fragment>", `
  {
    vec3 hbId = floor(vHbWinC * 2.0);
    float on = step(hbWhite(hbId + 11.0), uWindowOcc);
    float tint = fract(hbWhite(hbId + 29.0) + hbWarm * 0.35) * mix(1.0, 0.7, hbPlain);
    vec3 candle = vec3(1.0, 0.26, 0.04);
    vec3 lamp = vec3(1.0, 0.50, 0.17);
    vec3 cool = vec3(0.92, 0.72, 0.50);
    vec3 col = tint < 0.6 ? mix(candle, lamp, tint / 0.6) : mix(lamp, cool, (tint - 0.6) / 0.4);
    float level = 0.45 + 0.55 * max(hbWhite(hbId + 47.0), hbLit * 0.6);
    vec2 q = vHbWin.xy - vec2(0.5, 0.3);
    float room = 0.6 + 0.55 * exp(-q.x * q.x * 5.0 - q.y * q.y * 4.0);
    float hbWg = hbLampGlow(uWindowGlow, hbLampRank(vHbWinC, hbWhite(hbId + 61.0)));
    totalEmissiveRadiance = col * on * level * room * hbWg * ${WIN_MAX.toFixed(1)} * (hbGlass + 0.04) * hbRecess * mix(1.0, ${PLAIN_GAIN.toFixed(2)}, hbPlain);
    totalEmissiveRadiance *= 1.0 + 0.3 * hbLmHoverIn(vHbWorld);
  }`, { id: "world.29.emissivemap_fragment" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <opaque_fragment>", `
  {
    vec3 hbV = normalize(vViewPosition);
    outgoingLight += hbEnvSpec(inverseTransformDirection(normal, viewMatrix), inverseTransformDirection(hbV, viewMatrix), 0.08, 0.06) * 1.4 * hbSheen;
  }
  #include <opaque_fragment>`, { id: "world.30.opaque_fragment" });
    };
    m.customProgramCacheKey = () => "hb_window_v4";
    return m;
    });
  }

  /**
   * Lamp glass / beacons: base colour + emission × uLamp. `decorative` (the GLB lamps' glass) also takes the zoom's lamp
   * share (uLampFar: it eases at the overview, lights-system.ts), the lamp round and the arrival beat (lamp-wave.ts); a
   * signal's lantern (the storm cones) is analytical (D11): it keeps its light and shows its state at once, on the
   * clock's glow alone (uLampAnalytic = 1, a binding like uLampFar, not a program variant).
   */
  emissive(glowHex = "#FFAE57", baseHex = "#3B3A33", decorative = false): THREE.MeshStandardMaterial {
    return this.cached(`emissive:${glowHex}:${baseHex}${decorative ? ":lamp" : ""}`, () => {
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(baseHex), roughness: 0.15, metalness: 0, emissive: new THREE.Color(glowHex) });
    m.name = "hb_emissive";
    const far = decorative ? this.pool.uLampFar : { value: 1 };
    const analytic = { value: decorative ? 0 : 1 };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uLamp = this.uniforms.uLamp;
      shader.uniforms.uLampFar = far;
      shader.uniforms.uLampAnalytic = analytic;
      Object.assign(shader.uniforms, { uWindowGlow: this.uniforms.uWindowGlow }, lampWaveUniforms);
      // the lamplighting wave (05-P3): a lamp's glass lights with its own lamp's moment, not the global clock
      shader.vertexShader = patch(shader.vertexShader, "#include <common>", "#include <common>\nvarying vec3 vHbLw;", { id: "world.31.common" });
      shader.vertexShader = patch(shader.vertexShader, "#include <worldpos_vertex>", `#include <worldpos_vertex>
  {
    vec4 hbW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      hbW = instanceMatrix * hbW;
    #endif
    vHbLw = (modelMatrix * hbW).xyz;
  }`, { id: "world.32.worldpos_vertex" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <common>", `#include <common>\nuniform float uLamp;\nuniform float uLampFar;\nuniform float uLampAnalytic;\nuniform float uWindowGlow;\nvarying vec3 vHbLw;\n${LAMP_WAVE_GLSL}`, { id: "world.33.common" });
      shader.fragmentShader = patch(shader.fragmentShader, "#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance *= uLamp * uLampFar;
if (uWindowGlow > 1e-3 && uLampAnalytic < 0.5) totalEmissiveRadiance *= mix(1.0, hbLampGlow(uWindowGlow, hbLampRank(vHbLw, hbLampJitter(vHbLw.xz))) / uWindowGlow, smoothstep(0.0, 0.05, uWindowGlow));`, { id: "world.34.emissivemap_fragment" });
    };
    m.customProgramCacheKey = () => "hb_emissive_w1";
    return m;
    });
  }

  /** The Pharos lens: lantern-coloured emission × uLens × lit (lit = 0 for a null PSI band). */
  lens(lit: THREE.IUniform<number>): THREE.MeshStandardMaterial {
    return this.cached("lens", () => {
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#E8F3EE"), roughness: 0.15, metalness: 0, emissive: new THREE.Color("#FFE0A8") });
      m.name = "hb_lens";
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uLens = this.uniforms.uLens;
        shader.uniforms.uLensLit = lit;
        shader.fragmentShader = patch(shader.fragmentShader, "#include <common>", "#include <common>\nuniform float uLens;\nuniform float uLensLit;", { id: "world.35.common" });
        shader.fragmentShader = patch(shader.fragmentShader, "#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uLens * uLensLit;", { id: "world.36.emissivemap_fragment" });
      };
      m.customProgramCacheKey = () => "hb_lens";
      return m;
    });
  }

  /** Lantern glazing: thin, slightly warm, additive-ish glass that never occludes the lens glow. */
  glass(): THREE.MeshStandardMaterial {
    return this.cached("glass", () => {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#C9D6DC"), roughness: 0.1, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      });
      m.name = "hb_glass";
      return m;
    });
  }

  /**
   * Replace glTF materials under `root` by the port, by material name.
   * Quantized meshes (KHR_mesh_quantization) are dequantized first so the object-space patterns
   * see metres (see dequantizeForPatterns). Unknown names are left alone.
   * Sets shadows: opaque kit casts + receives; glass/emissive/lens do not cast.
   */
  apply(root: THREE.Object3D, opts: { lensLit?: THREE.IUniform<number>; deferStatic?: (mesh: THREE.Mesh) => boolean } = {}): void {
    const lensLit = opts.lensLit ?? { value: 1 };
    // Mixed eager/deferred users of one GLTF geometry must not mutate each other's source arrays.
    const uses = new Map<THREE.BufferGeometry, number>();
    if (opts.deferStatic) root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) uses.set(mesh.geometry, (uses.get(mesh.geometry) ?? 0) + 1);
    });
    const swap = (mat: THREE.Material): THREE.Material => {
      const k = materialKindFor(mat.name), src = mat as THREE.MeshStandardMaterial;
      if (k === "kit") return this.kit();
      if (k === "terrain") return this.terrain();
      if (k === "window") return this.window();
      if (k === "emissive") return this.emissive(mat.name.toLowerCase().startsWith("beacon") ? "#FF5A3C" : "#FFAE57", src.color ? `#${src.color.getHexString()}` : "#3B3A33", true);
      if (k === "lens") return this.lens(lensLit);
      return k === "glass" ? this.glass() : mat;
    };
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh && !mesh.morphTargetInfluences) {
        const k = !Array.isArray(mesh.material) ? materialKindFor(mesh.material.name) : null;
        if (opts.deferStatic?.(mesh) && uses.get(mesh.geometry) === 1 && !mesh.geometry.attributes.tangent && (k === "kit" || k === "terrain")) deferPatternDecode(mesh);
        else dequantizeForPatterns(mesh);
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((m) => m.name === "hb_window")) prepareWindowGeometry(mesh.geometry);
      mesh.castShadow = mats.every((m) => m.name === "hb_kit" || m.name === "hb_terrain");
      mesh.receiveShadow = !mats.some((m) => m.name === "hb_glass");
    });
  }

  dispose(): void {
    this.staticDepth.dispose();
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
    this.fb0.dispose();
    this.fbD.dispose();
  }
}

const baked = new WeakSet<THREE.BufferGeometry>();

/**
 * KHR_mesh_quantization stores positions as normalised ints and puts the dequantisation in the node
 * matrix, so `position` is no longer in metres and the object-space patterns would be scaled wrong.
 * Bake the node's local matrix into a float copy of the geometry and reset the node: the vertex data
 * is then in the parent's (asset root's) metres, which is Blender's object space for kit exports.
 * One pass per attribute (decoded and transformed together); colours keep their normalized bytes
 * (exact, and a quarter of the memory). Normals stay unit float32: the facet jitter floors them.
 */
export function dequantizeForPatterns(mesh: THREE.Mesh): void {
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos || (pos.array instanceof Float32Array && !pos.normalized)) return;
  let g = mesh.geometry;
  if (baked.has(g)) g = g.clone();
  mesh.updateMatrix();
  const transform = takePatternTransform(mesh) ?? mesh.matrix;
  for (const name of ["position", "normal", "uv"]) {
    const a = g.attributes[name];
    if (!a) continue;
    const kind = name === "position" ? "point" : name === "normal" ? "normal" : null;
    if (!kind && a.array instanceof Float32Array && !a.normalized) continue;
    const out = new Float32Array(a.count * a.itemSize);
    decodeInto(a, out, 0, kind ? transform : null, kind);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  (g.attributes.tangent as THREE.BufferAttribute | undefined)?.transformDirection(transform);
  setBounds(g);
  baked.add(g);
  mesh.geometry = g;
  mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
}

/** The shared HarbourMaterials ('materials' service), created on first use. */
export function getHarbourMaterials(ctx: EngineContext): HarbourMaterials {
  let m = ctx.services.get("materials");
  if (!m) {
    m = new HarbourMaterials(ctx.uniforms);
    Object.assign(m.beam, beamLightUniforms(getBeamUniforms(ctx)));
    const q = ctx.services.get("quality");
    if (q) {
      const mats = m;
      mats.setLite(q.tier === "low");
      q.onChange((s) => mats.setLite(s.tier === "low"));
    }
    ctx.services.set("materials", m);
  }
  return m;
}
