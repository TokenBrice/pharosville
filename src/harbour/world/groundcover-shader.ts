import * as THREE from "three";
import { patch } from "../engine/shader-patch";
import { GUST_GLSL } from "../weather/gust";
import { swayUniforms } from "./sway";
import { DRY_SEASON_GLSL, SPRING_TURF_GLSL, STRAW_GLSL } from "./ground-year";
import { GLSL_NOISE } from "./shaders/patterns";
import { GLSL_AO, GLSL_ENV, GLSL_POOL, skyIblUniforms } from "./shaders/lighting";
import { liteShadow } from "./shaders/shadow";
import { CLOUD_SHADOW_GLSL, cloudShadowUniforms } from "../sky/cloud-shadow";
import { AERIAL_GLSL, AERIAL_VERT_GLSL, aerialUniforms } from "./aerial";
import { BEAM_LIGHT_GLSL, BEAM_LIGHT_VERT_GLSL } from "../beam/beam-light-glsl";
import { lampWaveUniforms } from "../lights/lamp-wave";
import type { HarbourMaterials } from "./materials";
import type { GroundCoverArchetype } from "./groundcover-kit";

/**
 * Phase 4A — Unified WebGL2 instanced ground-cover shader (`hb_groundcover`).
 *
 * Consumes compact 24 B/inst `InstancedBufferAttribute`s (zero 64-byte `mat4`!):
 * - `aInstPos`    (vec4 float32): `x, y, z, yaw` (glTF Y-up world metres & radians)
 * - `aInstGround` (vec4 u8norm):  `groundR, groundG, groundB, scaleNorm` (`scale = 0.4 + scaleNorm * 1.2`)
 * - `aInstMeta`   (vec4 u8norm):  `normX, normZ, variantNorm, archAndPhase` (`arch = floor(w*255/32)`, `phase = fract(w*255/32)`)
 *
 * Key visual & performance features:
 * - BOTW / Ghost of Tsushima seamless root blending: shifts sampled bare-terrain RGB through the 4-season
 *   Mediterranean cycle (`uFoliage`, `uSeasonPhase`, `hbDrySeason`) and inherits 100% of terrain normal at roots.
 * - Real-time traveling wind waves via `GUST_GLSL` (`hbGust`, gated `#ifndef HB_LITE`) with arc-length-preserving
 *   circular bend + vertex-computed `vGustSheen` lifting tip brightness as wind ripples cross hillsides.
 * - Distance shrink/sink fade (`uFade`), seasonal wildflower scaling (`uFlowerScale`), `hbFoliageSSS`, `hbAO`,
 *   `hbCloudShadow`, `hbPool`, `hbBeamLight`, `hbAerial`, snow & rain wetness, and zero `discard` (100% opaque).
 * - Static `rockDepthMat` for shadow-casting `gc-rocks` cached by `ShadowCasters` at 0.00 ms on held frames.
 */

/** Per-archetype wind-bend stiffness (`uStiffness`). */
export const GROUNDCOVER_STIFFNESS: Readonly<Record<GroundCoverArchetype, number>> = {
  grass: 1.0,
  understory: 0.65,
  maquis: 0.28,
  flowers: 0.95,
  rocks: 0.0,
  coastal: 0.12,
  urban: 0.0,
};

/** Per-archetype camera-distance shrink/sink fade `[startM, endM]` (`uFade`). */
export const GROUNDCOVER_FADE: Readonly<Record<GroundCoverArchetype, readonly [number, number]>> = {
  grass: [290, 520],
  understory: [330, 580],
  maquis: [440, 790],
  flowers: [240, 440],
  rocks: [480, 880],
  coastal: [400, 720],
  urban: [420, 780],
};

export interface GroundCoverMaterialOptions {
  /** Per-archetype wind-bend stiffness (0 = rigid, 1 = grass). Default 1.0. */
  stiffness?: number;
  /** Distance shrink/sink fade `[start, end]` in metres. Default `[290, 520]`. */
  fade?: readonly [number, number];
  /** Optional shared `uFlowerScale` uniform (0..1 seasonal flower visibility). */
  flowerScale?: THREE.IUniform<number>;
  /** Material face culling side (defaults to `THREE.DoubleSide` so all 7 archetypes share 1 WebGL2 program). */
  side?: THREE.Side;
}

export interface GroundCoverUniforms {
  uStiffness: THREE.IUniform<number>;
  uFade: THREE.IUniform<THREE.Vector2>;
  uFlowerScale: THREE.IUniform<number>;
}

export interface GroundCoverMaterials {
  readonly colorMat: THREE.MeshStandardMaterial;
  readonly rockDepthMat: THREE.MeshDepthMaterial;
  readonly uniforms: GroundCoverUniforms;
}

/** Fallback beam uniforms used only when `HarbourMaterials` was constructed standalone without `getHarbourMaterials(ctx)`. */
function fallbackBeamUniforms(): Record<string, THREE.IUniform> {
  return {
    uBeamPos: { value: new THREE.Vector3(0, -1000, 0) },
    uBeamAngle: { value: 0 },
    uBeamShape: { value: new THREE.Vector4(520, 0.07, 0.03, 0) },
    uBeamFall: { value: new THREE.Vector4(100, 2.3, 0.05, 0) },
    uBeamLight: { value: new THREE.Color(0, 0, 0) },
    uBeamSun: { value: new THREE.Vector4(0, 0, 0, 120) },
    uPharosFire: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPharosAxis: { value: new THREE.Vector4(0, -1000, 0, 0) },
  };
}

const GC_VERT_HEAD = /* glsl */ `
attribute float aBladeT;
attribute float aPart;
attribute vec3 aColorHint;
attribute vec4 aInstPos;
attribute vec4 aInstGround;
attribute vec4 aInstMeta;

uniform float uStiffness;
uniform vec2 uFade;
uniform float uFlowerScale;
uniform vec2 uSwayWind;
uniform float uSwayK;
uniform float uSwayTime;
uniform vec4 uSwayGust;
uniform vec4 uFoliage;
uniform float uSeasonPhase;

varying vec3 vHbWorld;
varying vec3 vGcColor;
varying vec3 vGcTerrainN;
varying vec3 vGcGeomN;
varying vec4 vGcParams;
varying float vGustSheen;

${GUST_GLSL}
${DRY_SEASON_GLSL}
${AERIAL_VERT_GLSL}

vec3 hbGcRootSeasonColor(vec3 gCol, float instVar) {
  float sp = uFoliage.x, su = uFoliage.y, au = uFoliage.z, wi = uFoliage.w;
  float gLuma = dot(gCol, vec3(0.2126, 0.7152, 0.0722));
  float dryK = hbDrySeason();
  vec3 gSpring = mix(gCol, vec3(gLuma), 0.18) * ${SPRING_TURF_GLSL} + vec3(0.005, 0.008, 0.009);
  vec3 gSummer = mix(gCol, vec3(gLuma), 0.28) * vec3(0.84, 0.94, 1.02);
  vec3 gAutumn = gCol * mix(vec3(0.95, 0.96, 0.92), vec3(1.10, 0.94, 0.82), instVar);
  vec3 gWinter = gCol * vec3(0.84, 0.96, 1.08);
  vec3 gWet = gSpring * sp + gSummer * su + gAutumn * au + gWinter * wi;
  float vcAO = clamp(gLuma / 0.215, 0.45, 1.25);
  vec3 gStraw = ${STRAW_GLSL} * vcAO * (0.82 + 0.34 * instVar);
  return mix(gWet, gStraw, dryK * 0.72);
}

vec3 hbGcArchetypeColor(float archId, float part, float bladeT, float instVar, vec3 rootCol, vec3 hint) {
  float dryK = hbDrySeason();
  float sp = uFoliage.x, au = uFoliage.z, wi = uFoliage.w;
  vec3 rootBlend = rootCol * mix(0.72, 0.88, bladeT);

  if (archId < 0.5) {
    // 0: grass — seamless root match into sunlit golden-olive / sage tips
    vec3 sageTip = mix(vec3(0.185, 0.245, 0.088), vec3(0.295, 0.305, 0.118), instVar);
    vec3 dryTip = mix(vec3(0.385, 0.315, 0.132), vec3(0.465, 0.372, 0.155), instVar);
    vec3 tipCol = mix(sageTip, dryTip, clamp(dryK * 0.78 + au * 0.25, 0.0, 1.0));
    tipCol *= mix(vec3(1.0), vec3(0.88, 0.98, 1.06), wi);
    tipCol *= mix(vec3(1.0), vec3(0.96, 1.05, 0.96), sp * 0.6);
    return mix(rootBlend, tipCol, smoothstep(0.10, 0.96, bladeT)) * hint;
  }
  if (archId < 1.5) {
    // 1: understory — russet pine-needle mound (part 0) + arching shade fern / rosemary fronds (part 1)
    if (part < 0.5) {
      vec3 duff = mix(vec3(0.155, 0.095, 0.052), vec3(0.205, 0.125, 0.068), instVar);
      return mix(rootCol * 0.80, duff, 0.68) * hint;
    }
    vec3 fernCol = mix(vec3(0.082, 0.158, 0.054), vec3(0.155, 0.228, 0.082), instVar);
    fernCol = mix(fernCol, vec3(0.235, 0.195, 0.085), clamp(dryK * 0.30 + au * 0.35, 0.0, 0.55));
    return mix(rootBlend, fernCol, smoothstep(0.08, 0.85, bladeT)) * hint;
  }
  if (archId < 2.5) {
    // 2: maquis — Mediterranean silver-sage lavender, rosemary, thyme, muted golden broom
    vec3 cLav = vec3(0.205, 0.188, 0.258);
    vec3 cRos = vec3(0.128, 0.178, 0.104);
    vec3 cThy = vec3(0.172, 0.205, 0.132);
    vec3 cBrm = mix(vec3(0.165, 0.205, 0.088), vec3(0.355, 0.278, 0.082), smoothstep(0.45, 0.92, bladeT));
    vec3 bush = instVar < 0.30 ? cLav : instVar < 0.62 ? cRos : instVar < 0.84 ? cThy : cBrm;
    bush = mix(bush, bush * vec3(1.06, 0.98, 0.88), dryK * 0.35);
    return mix(rootCol * 0.78, bush, smoothstep(0.0, 0.35, bladeT)) * hint;
  }
  if (archId < 3.5) {
    // 3: flowers — slender green stems (part 0) + muted Mediterranean wildflower cups (part 1)
    if (part < 0.5) {
      return mix(rootCol * 0.78, vec3(0.128, 0.205, 0.066), bladeT) * hint;
    }
    vec3 cPoppy = vec3(0.56, 0.105, 0.075);
    vec3 cBroom = vec3(0.68, 0.455, 0.068);
    vec3 cRockrose = vec3(0.76, 0.72, 0.635);
    vec3 cThyme = vec3(0.335, 0.185, 0.475);
    vec3 petal = instVar < 0.28 ? cPoppy : instVar < 0.56 ? cBroom : instVar < 0.80 ? cRockrose : cThyme;
    return petal * hint;
  }
  if (archId < 4.5) {
    // 4: rocks — warm Alexandrian limestone (#C2B59A top / #8F846F side baked in aColorHint)
    vec3 rockCol = hint * (0.92 + 0.16 * instVar);
    return mix(rootCol * 0.85, rockCol, smoothstep(-0.08, 0.09, position.y));
  }
  if (archId < 5.5) {
    // 5: coastal — sculptural blue-silver sea-sage agave rosette
    vec3 agave = mix(vec3(0.165, 0.242, 0.208), vec3(0.285, 0.365, 0.305), bladeT);
    agave *= (0.93 + 0.14 * instVar);
    return mix(rootCol * 0.82, agave, smoothstep(0.0, 0.24, bladeT)) * hint;
  }
  // 6: urban — terracotta planter / curb stone (part 0) + overflowing rosemary / bougainvillea puff (part 1)
  if (part < 0.5) {
    vec3 terra = mix(vec3(0.41, 0.165, 0.088), vec3(0.49, 0.215, 0.112), instVar);
    vec3 curbStone = vec3(0.45, 0.405, 0.32);
    return mix(terra, curbStone, step(0.78, instVar)) * hint;
  }
  vec3 ros = vec3(0.118, 0.175, 0.096);
  vec3 boug = vec3(0.50, 0.115, 0.235);
  float bloomW = step(0.46, instVar) * smoothstep(0.52, 0.90, bladeT) * (0.35 + 0.65 * uFlowerScale);
  return mix(ros, boug, bloomW) * hint;
}
`;

const GC_VERT_POSE_NORMAL = /* glsl */ `
  vec3 hbInstPos = aInstPos.xyz;
  float hbInstYaw = aInstPos.w;
  float hbInstScale = 0.4 + aInstGround.w * 1.2;
  vec2 hbTnXz = aInstMeta.xy * 2.0 - 1.0;
  float hbTnLen2 = dot(hbTnXz, hbTnXz);
  if (hbTnLen2 > 0.99) hbTnXz *= inversesqrt(hbTnLen2) * 0.995;
  vec3 hbTerrainN = normalize(vec3(hbTnXz.x, sqrt(max(0.0, 1.0 - dot(hbTnXz, hbTnXz))), hbTnXz.y));
  float hbInstVar = aInstMeta.z;
  float hbMetaRaw = floor(aInstMeta.w * 255.0 + 0.5);
  float hbArchId = floor(hbMetaRaw * 0.03125);
  float hbInstPhase = fract(hbMetaRaw * 0.03125);

  float hbCamDist = length(cameraPosition - hbInstPos);
  float hbDistFade = 1.0 - smoothstep(uFade.x, uFade.y, hbCamDist);
  float hbIsFlower = step(abs(hbArchId - 3.0), 0.25);
  float hbSeasonK = mix(1.0, uFlowerScale, hbIsFlower);
  float hbVisK = hbDistFade * hbSeasonK;
  float hbEffScale = hbInstScale * hbVisK;
  float hbSinkY = (1.0 - hbVisK) * 0.14;

  float hbCy = cos(hbInstYaw), hbSy = sin(hbInstYaw);
  vec3 hbLocalP = vec3(position.x * hbCy + position.z * hbSy, position.y, -position.x * hbSy + position.z * hbCy) * hbEffScale;
  vec3 hbGeomN = normalize(vec3(normal.x * hbCy + normal.z * hbSy, normal.y, -normal.x * hbSy + normal.z * hbCy));

  // Follow terrain slope gently on grounded rock clusters, pine-needle mounds, and low shrubs (urban pots stay level)
  float hbSlopeFollow = hbArchId > 5.5 ? 0.0
    : (abs(hbArchId - 4.0) < 0.25 || (abs(hbArchId - 1.0) < 0.25 && aPart < 0.5)) ? 0.85
    : (abs(hbArchId - 2.0) < 0.25 || abs(hbArchId - 5.0) < 0.25) ? 0.35 : 0.15;
  hbLocalP.y += dot(hbLocalP.xz, -hbTerrainN.xz / max(hbTerrainN.y, 0.45)) * hbSlopeFollow;

  // Real-time traveling wind waves (GUST_GLSL) with arc-length-preserving circular bend
  float hbGustAmt = 0.0;
  #ifndef HB_LITE
  hbGustAmt = uSwayGust.z * hbGust(hbInstPos.xz, uSwayGust.w, uSwayGust.xy);
  #endif
  float hbWindLen = length(uSwayWind);
  vec2 hbWDir = hbWindLen > 1e-3 ? (uSwayWind / hbWindLen) : vec2(0.84, -0.54);
  vec2 hbWPerp = vec2(-hbWDir.y, hbWDir.x);
  float hbEffWind = clamp(hbWindLen * (1.0 + 0.85 * hbGustAmt), 0.0, 1.8);
  float hbWavePh = hbInstPhase * 6.2831853 + dot(hbInstPos.xz, hbWDir) * 0.14;
  float hbWave = sin(uSwayTime * 2.1 + hbWavePh);
  float hbFlutter = sin(uSwayTime * 3.7 + hbWavePh * 1.63 + hbLocalP.y * 2.5);
  float hbTipW = aBladeT * aBladeT;
  float hbBend = clamp(uStiffness * uSwayK * hbTipW * (0.045 + 0.34 * hbEffWind + 0.24 * hbGustAmt) * (0.52 + 0.48 * hbWave), -0.82, 0.82);
  float hbSideBend = uStiffness * uSwayK * hbTipW * (0.02 + 0.11 * hbEffWind) * hbFlutter;
  float hbH = max(hbLocalP.y, 0.0);
  if (hbH > 1e-4 && uStiffness > 1e-3 && uSwayK > 0.0) {
    float hbSb = sin(hbBend), hbCb = cos(hbBend);
    hbLocalP.xz += hbWDir * (hbH * hbSb) + hbWPerp * (hbH * hbSideBend);
    hbLocalP.y = hbH * hbCb;
    hbGeomN = normalize(hbGeomN + vec3(hbWDir.x * hbSb * 0.55, -abs(hbSb) * 0.18, hbWDir.y * hbSb * 0.55));
  }
  vGustSheen = uStiffness * uSwayK * aBladeT * clamp(hbGustAmt * (0.55 + 0.45 * max(hbWave, 0.0)), 0.0, 1.0);

  // Terrain-normal inheritance weight: 0 at tuft roots (100% terrain normal) -> tilted toward geometry normal at tips
  float hbNormMix = (hbArchId < 0.5 || abs(hbArchId - 3.0) < 0.25) ? (smoothstep(0.12, 0.95, aBladeT) * 0.62)
    : abs(hbArchId - 1.0) < 0.25 ? (aPart < 0.5 ? 0.25 : smoothstep(0.08, 0.92, aBladeT) * 0.68)
    : (abs(hbArchId - 2.0) < 0.25 || abs(hbArchId - 5.0) < 0.25) ? mix(0.18, 0.85, smoothstep(0.0, 0.75, aBladeT))
    : 0.92;

  vec3 hbRootCol = hbGcRootSeasonColor(aInstGround.rgb, hbInstVar);
  vGcColor = hbGcArchetypeColor(hbArchId, aPart, aBladeT, hbInstVar, hbRootCol, aColorHint);
  vGcTerrainN = hbTerrainN;
  vGcGeomN = hbGeomN;
  vGcParams = vec4(aBladeT, aPart, hbNormMix, hbArchId);

  vec3 hbGcWorld = hbInstPos + vec3(hbLocalP.x, hbLocalP.y - hbSinkY, hbLocalP.z);
  objectNormal = normalize(mix(hbTerrainN, hbGeomN, hbNormMix));
`;

const GC_FRAG_HEAD = /* glsl */ `
uniform float uSnowCover;
uniform float uWetness;
uniform vec3 uHbSunDir;
uniform vec3 uHbSunColor;

varying vec3 vHbWorld;
varying vec3 vGcColor;
varying vec3 vGcTerrainN;
varying vec3 vGcGeomN;
varying vec4 vGcParams;
varying float vGustSheen;

float hbGcLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const GC_ROCK_DEPTH_VERT_HEAD = /* glsl */ `
attribute vec4 aInstPos;
attribute vec4 aInstGround;
attribute vec4 aInstMeta;
`;

const GC_ROCK_DEPTH_VERT_APPLY = /* glsl */ `
  {
    float hbRdYaw = aInstPos.w;
    float hbRdScale = 0.4 + aInstGround.w * 1.2;
    vec2 hbRdTnXz = aInstMeta.xy * 2.0 - 1.0;
    float hbRdLen2 = dot(hbRdTnXz, hbRdTnXz);
    if (hbRdLen2 > 0.99) hbRdTnXz *= inversesqrt(hbRdLen2) * 0.995;
    float hbRdNy = sqrt(max(0.0, 1.0 - dot(hbRdTnXz, hbRdTnXz)));
    float hbRdCy = cos(hbRdYaw), hbRdSy = sin(hbRdYaw);
    vec3 hbRdP = vec3(transformed.x * hbRdCy + transformed.z * hbRdSy, transformed.y, -transformed.x * hbRdSy + transformed.z * hbRdCy) * hbRdScale;
    hbRdP.y += dot(hbRdP.xz, -hbRdTnXz / max(hbRdNy, 0.45)) * 0.85;
    transformed = aInstPos.xyz + hbRdP;
  }
`;

/**
 * Create the unified `hb_groundcover` PBR material (`colorMat`) plus the lightweight static
 * shadow-depth twin (`rockDepthMat`) for shadow-casting limestone rock clusters.
 */
export function createGroundCoverMaterial(
  mats: HarbourMaterials,
  opts: GroundCoverMaterialOptions = {},
): GroundCoverMaterials {
  const side = opts.side ?? THREE.DoubleSide;
  const fade = opts.fade ?? GROUNDCOVER_FADE.grass;
  const uniforms: GroundCoverUniforms = {
    uStiffness: { value: opts.stiffness ?? GROUNDCOVER_STIFFNESS.grass },
    uFade: { value: new THREE.Vector2(fade[0], fade[1]) },
    uFlowerScale: opts.flowerScale ?? { value: 1.0 },
  };

  const colorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    side,
  });
  colorMat.name = "hb_groundcover";

  const beamFallback = fallbackBeamUniforms();
  colorMat.onBeforeCompile = (shader) => {
    const features = mats.featureIdentity();
    const u = mats.uniforms;
    Object.assign(
      shader.uniforms,
      beamFallback,
      mats.beam,
      lampWaveUniforms,
      cloudShadowUniforms,
      aerialUniforms,
      skyIblUniforms,
      swayUniforms,
      uniforms,
      {
        uTime: u.uTime,
        uNight: u.uNight,
        uNightLift: u.uNightLift,
        uHemiSky: u.uHemiSky,
        uHemiGround: u.uHemiGround,
        uHorizon: u.uHorizon,
        uWindowGlow: u.uWindowGlow,
        uSnowCover: u.uSnowCover,
        uWetness: u.uWetness,
        uFoliage: u.uFoliage,
        uSeasonPhase: u.uSeasonPhase,
        uHbSunDir: u.uSunDir,
        uHbSunColor: u.uSunColor,
        uSwayWind: u.uWindVec,
        uSwayTime: u.uTime,
        uPoolTex: mats.pool.uPoolTex,
        uPoolBounds: mats.pool.uPoolBounds,
        uLampFar: mats.pool.uLampFar,
        uRimK: mats.rimK,
        uAOTex: mats.ao.uAOTex,
        uAOBounds: mats.ao.uAOBounds,
        uAerialDensity: u.uFogDensity,
        uAerialHaze: u.uHaze,
      },
    );

    if (features.lite) {
      shader.defines = { ...shader.defines, HB_LITE: "", HB_BEAM_VERT: "" };
    }

    // ---- Vertex stage
    shader.vertexShader = patch(
      shader.vertexShader,
      "#include <common>",
      `#include <common>\n${GC_VERT_HEAD}${features.lite ? `\n${BEAM_LIGHT_VERT_GLSL}` : ""}`,
      { id: "gc.1.vert_common" },
    );
    shader.vertexShader = patch(
      shader.vertexShader,
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>\n${GC_VERT_POSE_NORMAL}`,
      { id: "gc.2.vert_normal" },
    );
    shader.vertexShader = patch(
      shader.vertexShader,
      "#include <begin_vertex>",
      `#include <begin_vertex>\n  transformed = hbGcWorld;`,
      { id: "gc.3.vert_begin" },
    );
    shader.vertexShader = patch(
      shader.vertexShader,
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
  vHbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  hbAerialVert(vHbWorld);${features.lite ? "\n  hbBeamVert(vHbWorld);" : ""}`,
      { id: "gc.4.vert_worldpos" },
    );

    // ---- Fragment stage
    if (features.lite) {
      shader.fragmentShader = patch(
        shader.fragmentShader,
        "#include <shadowmap_pars_fragment>",
        liteShadow(),
        { id: "gc.lite-shadow" },
      );
    }
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <common>",
      `#include <common>\n${GLSL_NOISE}\n${GLSL_ENV}\n${GLSL_POOL}\n${GLSL_AO}\n${CLOUD_SHADOW_GLSL}\n${AERIAL_GLSL}\n${BEAM_LIGHT_GLSL}\n${GC_FRAG_HEAD}`,
      { id: "gc.5.frag_common" },
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <color_fragment>",
      `
  float hbGcBreakup = 0.94 + 0.12 * hbNoise(vHbWorld * 0.06);
  diffuseColor = vec4(vGcColor * hbGcBreakup * (1.0 + vGustSheen * 0.18), 1.0);`,
      { id: "gc.6.frag_color" },
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <roughnessmap_fragment>",
      `
  float hbGcArch = vGcParams.w;
  float hbGcPart = vGcParams.y;
  float hbGcIsRock = step(abs(hbGcArch - 4.0), 0.25);
  float hbGcIsPot = step(abs(hbGcArch - 6.0), 0.25) * (1.0 - step(0.5, hbGcPart));
  float hbGcIsDuff = step(abs(hbGcArch - 1.0), 0.25) * (1.0 - step(0.5, hbGcPart));
  float hbGcFoliage = clamp(1.0 - hbGcIsRock - hbGcIsPot - hbGcIsDuff, 0.0, 1.0);
  float roughnessFactor = mix(mix(0.84, 0.78, hbGcIsRock), 0.91 - 0.06 * vGcParams.x, hbGcFoliage);`,
      { id: "gc.7.frag_roughness" },
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <metalnessmap_fragment>",
      "float metalnessFactor = 0.0;",
      { id: "gc.8.frag_metalness" },
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
  vec3 hbGcTN = normalize(vGcTerrainN);
  vec3 hbGcGN = normalize(vGcGeomN);
  float hbGcThin = step(hbGcArch, 1.5) + step(abs(hbGcArch - 3.0), 0.25) + step(abs(hbGcArch - 5.0), 0.25);
  if (hbGcThin > 0.5 && !gl_FrontFacing) {
    hbGcGN = normalize(vec3(-hbGcGN.x, max(hbGcGN.y, 0.18), -hbGcGN.z));
  }
  vec3 hbGcNw = normalize(mix(hbGcTN, hbGcGN, vGcParams.z));
  normal = transformDirection(hbGcNw, viewMatrix);
  nonPerturbedNormal = normal;`,
      { id: "gc.9.frag_normal" },
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <emissivemap_fragment>",
      `
  float hbSnow = 0.0;
  float hbAboveSea = smoothstep(0.2, 0.75, vHbWorld.y);
  if (uSnowCover > 0.002) {
    float sn1 = hbNoise(vHbWorld * 0.42);
    float sn2 = hbNoise(vHbWorld * 2.4);
    float upSnow = smoothstep(0.35 - 0.18 * uSnowCover, 0.78 - 0.18 * uSnowCover, hbGcNw.y + (sn2 - 0.5) * 0.12);
    float keepSnow = uSnowCover * (1.0 - 0.35 * hbGcFoliage);
    float thr = 1.0 - keepSnow * 0.92;
    hbSnow = smoothstep(thr - 0.08, thr + 0.08, sn1 * 0.7 + sn2 * 0.3 + 0.12) * upSnow * hbAboveSea;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64, 0.675, 0.73) * (0.95 + 0.05 * sn2), hbSnow);
    roughnessFactor = mix(roughnessFactor, 0.60, hbSnow);
  }
  if (uWetness > 0.002) {
    float hw = uWetness * (1.0 - hbSnow);
    float porous = mix(0.90, 0.44, hbGcFoliage);
    diffuseColor.rgb *= 1.0 - 0.40 * hw * porous;
    roughnessFactor = mix(roughnessFactor, mix(0.26, 0.68, hbGcFoliage), hw * mix(0.85, 0.32, hbGcFoliage));
  }
  #include <emissivemap_fragment>`,
      { id: "gc.10.frag_weather" },
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <aomap_fragment>",
      `#include <aomap_fragment>
  float hbOcc = hbAO(vHbWorld, hbGcNw);
  float hbCs = hbCloudShadow(vHbWorld.xz);
  reflectedLight.directDiffuse *= hbCs;
  reflectedLight.directSpecular *= hbCs;
  reflectedLight.indirectDiffuse *= hbOcc;
  reflectedLight.indirectSpecular *= hbOcc;
  {
    float hbWetK = smoothstep(0.0, 0.25, uWetness);
    float hbCap = 0.005 + 0.5 * hbGcLuma(uHemiSky);
    float hbSl = hbGcLuma(reflectedLight.directSpecular);
    reflectedLight.directSpecular *= mix(1.0, min(1.0, hbCap / max(hbSl, 1e-5)), hbWetK);
  }`,
      { id: "gc.11.frag_aomap" },
    );
    shader.fragmentShader = patch(
      shader.fragmentShader,
      "#include <opaque_fragment>",
      `
  {
    vec3 hbVw = inverseTransformDirection(normalize(vViewPosition), viewMatrix);
    float hbSkyL = hbGcLuma(uHemiSky);
    float hbWetSheen = smoothstep(0.0, 0.25, uWetness);
    float hbEnvF0 = mix(0.028, 0.012, hbGcFoliage * (1.0 - max(hbWetSheen, hbSnow)));
    outgoingLight += min(hbEnvSpec(hbGcNw, hbVw, roughnessFactor, hbEnvF0), vec3(mix(4.0, 0.35 * hbSkyL + 0.01, hbWetSheen))) * uRimK * hbOcc;
    outgoingLight += hbBounceFill(diffuseColor.rgb, hbGcNw, uHbSunDir, uHbSunColor, hbOcc, uNight);
    if (hbGcFoliage > 0.5) {
      outgoingLight += hbFoliageSSS(diffuseColor.rgb, hbGcNw, hbVw, uHbSunDir, uHbSunColor, hbOcc, hbCs, hbSnow, uNight);
    }
    outgoingLight += diffuseColor.rgb * hbPool(vHbWorld, hbGcNw);
    outgoingLight += diffuseColor.rgb * (hbBeamLight(vHbWorld, hbGcNw) * hbOcc + hbPharosFire(vHbWorld, hbGcNw));
    outgoingLight += max(diffuseColor.rgb, vec3(0.048)) * uNightLift * hbOcc * (0.6 + 0.4 * max(hbGcNw.y, 0.0));
  }
  hbAerial(outgoingLight, vHbWorld, 0.0);
  #include <opaque_fragment>`,
      { id: "gc.12.frag_opaque" },
    );
  };

  colorMat.customProgramCacheKey = () =>
    `hb_groundcover_v1_${mats.featureIdentity().lite ? "HB_LITE" : "full"}_${mats.kitKey()}`;
  mats.track(colorMat);

  // Lightweight static depth material for shadow-casting gc-rocks (zero sway, zero discard, ShadowCasters-cached)
  const rockDepthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.FrontSide,
  });
  rockDepthMat.name = "hb_groundcover_rock_depth";
  rockDepthMat.onBeforeCompile = (shader) => {
    shader.vertexShader = patch(
      shader.vertexShader,
      "#include <common>",
      `#include <common>\n${GC_ROCK_DEPTH_VERT_HEAD}`,
      { id: "gc.depth.1.common" },
    );
    shader.vertexShader = patch(
      shader.vertexShader,
      "#include <begin_vertex>",
      `#include <begin_vertex>\n${GC_ROCK_DEPTH_VERT_APPLY}`,
      { id: "gc.depth.2.begin_vertex" },
    );
  };
  rockDepthMat.customProgramCacheKey = () => "hb_groundcover_rock_depth_v1";

  return { colorMat, rockDepthMat, uniforms };
}
