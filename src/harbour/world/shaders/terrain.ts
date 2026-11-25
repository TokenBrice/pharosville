import * as THREE from "three";
import { SWELL_PHASE_GLSL } from "../../ocean/waves";
import { patch } from "../../engine/shader-patch";
import type { EngineContext, PreparationService } from "../../engine/types";
import { DRY_SEASON_GLSL, SPRING_TURF_GLSL, STRAW_GLSL } from "../ground-year";
import { AERIAL_GLSL, AERIAL_VERT_GLSL, aerialUniforms } from "../aerial";
import { BEAM_LIGHT_GLSL, BEAM_LIGHT_VERT_GLSL } from "../../beam/beam-light-glsl";
import { CLOUD_SHADOW_GLSL, cloudShadowUniforms } from "../../sky/cloud-shadow";
import { LANDMARK_HOVER_GLSL } from "../landmark-hover";
import { runupUniforms } from "../runup";
import { dewUniforms } from "../../weather/dew";
import { GLSL_ENV, GLSL_POOL, GLSL_AO } from "./lighting";
import { GLSL_NOISE } from "./patterns";
import { liteShadow } from "./shadow";
import { PATTERN_CROP, SNOW_SLOPE } from "./constants";
import type { WorldUniforms } from "../../engine/uniforms";
import type { TerrainMapUniforms } from "../materials";
import { createTerrainDetailAtlas } from "../terrain-detail";
export { createTerrainDetailAtlas };

/**
 * Dedicated `hb_terrain` WebGL2 terrain fragment shader (Phase 2A).
 *
 * Replaces the generic architectural kit shader on island terrain, cliffs, paths, beaches, and arable fields:
 * - Samples `uTerrainSplat` (1024^2 RGBA8: R=path/wear, G=canopy humus, B=contact AO, A=karst outcrop)
 *   and `uTerrainTopo` (512^2 RGBA8: RG=bare-terrain glTF Y-up normal xz, B=curvature, A=coast distance/24)
 *   on every tier including `HB_LITE`.
 * - 5-layer height-blended splatting (`hbHeightBlend5`, sharpness 0.14):
 *     0: Weathered pale Alexandrian limestone (`wRock`: slope 25-45 deg, convex ridges, karst outcrops, pid 5;
 *        2-tap biplanar projection on Medium/High so vertical cliffs never stretch).
 *     1: Warm ochre stony earth & path dust (`wEarth`: `splat.r`, talus skirts, proud limestone pebbles).
 *     2: Mediterranean sage-olive turf & golden tussocks (`wGrass`: calibrated sage-olive `#677A48`, golden-straw
 *        tussocks `#A49156`, deep olive-emerald hollows `#485E35`; 4-season cycle & wildflowers inside Layer 2 only).
 *     3: Pine-needle litter, forest humus & north-facing shaded crevice moss (`wHumus`).
 *     4: Coastal limestone shingle, beach sand & wet `uRunup` splash (`wShore`: `topo.a` + pid 0 beaches).
 *   Also handles `pid == 15` (`hbTerrainCrop` seasonal arable fields) and `pid == 4` (cobble setts).
 * - Dual-scale rotated detail (`3.7 m` near + `17.2 m` 37-deg rotated macro) via `uTerrainDetail` `sampler2DArray`
 *   with `textureGrad` (zero quad mip-seam artifacts) + Toksvig/geometric-derivative roughness AA.
 * - Height-masked rain puddles in tracks/hollows (`splat.r > 0.45` or `topo.b < 0.42`), grass-tip dew/rime (`wGrass`),
 *   steep-cliff snow shedding + tree-well snow shadows (`1.0 - 0.55 * splat.g`), and high-res contact grounding (`splat.b`).
 * - Strictly complies with B07/C04 defined GLSL math (ascending `smoothstep` edges only, squares written by multiplication).
 */
export const GLSL_TERRAIN = /* glsl */ `
uniform float uTime;
uniform vec4 uFoliage;
uniform float uSeasonPhase;
uniform float uSnowCover;
uniform float uWetness;
uniform vec3 uHbSunDir;
uniform vec3 uHbSunColor;
uniform vec2 uRunup;
uniform vec2 uHbDew;
uniform sampler2D uTerrainSplat;
uniform sampler2D uTerrainTopo;
uniform vec4 uTerrainBounds;
#ifndef HB_LITE
uniform sampler2DArray uTerrainDetail;
#endif
varying vec3 vHbLocal;
varying vec3 vHbLocalN;
varying vec3 vHbWorld;
varying vec3 vHbWorldN;

float hbTIs(float pid, float k) { return step(abs(pid - k), 0.25); }
float hbTLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hbTFine(float dc, float period) { return 1.0 - smoothstep(0.25, 0.6, dc / period); }

${SWELL_PHASE_GLSL}
${DRY_SEASON_GLSL}

void hbHeightBlend5(inout float w0, inout float w1, inout float w2, inout float w3, inout float w4,
                    float h0, float h1, float h2, float h3, float h4) {
  float s0 = w0 > 0.001 ? w0 + h0 * 0.42 : -1.0;
  float s1 = w1 > 0.001 ? w1 + h1 * 0.42 : -1.0;
  float s2 = w2 > 0.001 ? w2 + h2 * 0.42 : -1.0;
  float s3 = w3 > 0.001 ? w3 + h3 * 0.42 : -1.0;
  float s4 = w4 > 0.001 ? w4 + h4 * 0.42 : -1.0;
  float m = max(max(max(s0, s1), max(s2, s3)), s4) - 0.14;
  w0 = max(s0 - m, 0.0); w1 = max(s1 - m, 0.0); w2 = max(s2 - m, 0.0);
  w3 = max(s3 - m, 0.0); w4 = max(s4 - m, 0.0);
  float inv = 1.0 / max(w0 + w1 + w2 + w3 + w4, 1e-4);
  w0 *= inv; w1 *= inv; w2 *= inv; w3 *= inv; w4 *= inv;
}

#ifndef HB_LITE
vec4 hbSampleDetail(vec2 uvN, vec2 dxN, vec2 dyN, vec2 uvM, vec2 dxM, vec2 dyM, float layer, float nearFade) {
  vec4 dN = textureGrad(uTerrainDetail, vec3(uvN, layer), dxN, dyN);
  vec4 dM = textureGrad(uTerrainDetail, vec3(uvM, layer), dxM, dyM);
  vec2 nN = (dN.rg * 2.0 - 1.0) * nearFade;
  vec2 nM0 = dM.rg * 2.0 - 1.0;
  vec2 nM = vec2(nM0.x * 0.7986355 + nM0.y * 0.6018150, -nM0.x * 0.6018150 + nM0.y * 0.7986355);
  vec2 nC = nN * 0.72 + nM * 0.40;
  float hC = mix(dM.b, dN.b * 0.66 + dM.b * 0.34, nearFade);
  float aC = mix(0.62 + 0.38 * dM.a, dN.a * (0.70 + 0.30 * dM.a), nearFade);
  return vec4(nC, hC, aC);
}

void hbSampleBiplanarRock(vec3 W, vec3 N, vec3 dWx, vec3 dWy, float nearFade, out vec3 nOff, out float hOut, out float aoOut) {
  vec3 an = abs(N);
  vec2 uv0, uv1, dx0, dy0, dx1, dy1;
  float w0, w1;
  int ax0, ax1;
  if (an.y >= an.x && an.y >= an.z) {
    ax0 = 1; w0 = an.y; uv0 = W.xz; dx0 = dWx.xz; dy0 = dWy.xz;
    if (an.x >= an.z) { ax1 = 0; w1 = an.x; uv1 = W.zy; dx1 = dWx.zy; dy1 = dWy.zy; }
    else { ax1 = 2; w1 = an.z; uv1 = W.xy; dx1 = dWx.xy; dy1 = dWy.xy; }
  } else if (an.x >= an.z) {
    ax0 = 0; w0 = an.x; uv0 = W.zy; dx0 = dWx.zy; dy0 = dWy.zy;
    if (an.y >= an.z) { ax1 = 1; w1 = an.y; uv1 = W.xz; dx1 = dWx.xz; dy1 = dWy.xz; }
    else { ax1 = 2; w1 = an.z; uv1 = W.xy; dx1 = dWx.xy; dy1 = dWy.xy; }
  } else {
    ax0 = 2; w0 = an.z; uv0 = W.xy; dx0 = dWx.xy; dy0 = dWy.xy;
    if (an.y >= an.x) { ax1 = 1; w1 = an.y; uv1 = W.xz; dx1 = dWx.xz; dy1 = dWy.xz; }
    else { ax1 = 0; w1 = an.x; uv1 = W.zy; dx1 = dWx.zy; dy1 = dWy.zy; }
  }
  vec2 w = vec2(w0, w1);
  w *= w; w *= w;
  w /= max(w.x + w.y, 1e-4);
  vec4 s0 = textureGrad(uTerrainDetail, vec3(uv0 * 0.238, 0.0), dx0, dy0);
  vec4 s1 = textureGrad(uTerrainDetail, vec3(uv1 * 0.238, 0.0), dx1, dy1);
  vec2 g0 = (s0.rg * 2.0 - 1.0) * nearFade * w.x;
  vec2 g1 = (s1.rg * 2.0 - 1.0) * nearFade * w.y;
  vec3 o0 = ax0 == 1 ? vec3(g0.x, 0.0, g0.y) : ax0 == 0 ? vec3(0.0, g0.y, g0.x) : vec3(g0.x, g0.y, 0.0);
  vec3 o1 = ax1 == 1 ? vec3(g1.x, 0.0, g1.y) : ax1 == 0 ? vec3(0.0, g1.y, g1.x) : vec3(g1.x, g1.y, 0.0);
  nOff = o0 + o1;
  hOut = s0.b * w.x + s1.b * w.y;
  aoOut = s0.a * w.x + s1.a * w.y;
}
#endif

vec2 hbTVoronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0); float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(hbWhite(vec3(n + g, 7.0)), hbWhite(vec3(n + g, 13.0)));
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float ed = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = vec2(hbWhite(vec3(n + g, 7.0)), hbWhite(vec3(n + g, 13.0)));
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001) ed = min(ed, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec2(sqrt(md), ed);
}

vec3 hbTerrainCrop(vec3 vc, vec3 W, float dW) {
  float p = fract(uSeasonPhase + (hbNoise(W * 0.012) - 0.5) * 0.05);
  float ang = hbNoise(W * 0.006 + 5.0) * 3.1416;
  float c = dot(W.xz, vec2(cos(ang), sin(ang)));
  float row = 0.5 + 0.5 * sin(c * 6.2832 / 1.3);
  float rowK = 1.0 - smoothstep(0.25, 0.6, dW / 1.3);
  float soilTone = 0.88 + 0.24 * hbFbm(W * 0.085);
  vec3 soil = vec3(0.31, 0.20, 0.105) * soilTone;
  vec3 soilDark = vec3(0.19, 0.115, 0.058) * soilTone;
  vec3 furrow = mix(soil, soilDark, row * rowK * 0.8 + (1.0 - rowK) * 0.4);
  vec3 o = furrow;
  #if HB_CROP_SHOOTS > 0
  vec3 shoots = mix(furrow, vec3(0.16, 0.27, 0.05), 0.55 + 0.35 * (1.0 - row * rowK));
  #if HB_CROP_SHOOTS == 2
  o = shoots;
  #else
  o = mix(o, shoots, smoothstep(0.1, 0.22, p));
  #endif
  #endif
  #if HB_CROP_GREEN > 0
  vec3 green = vec3(0.2, 0.33, 0.07) * (0.92 + 0.16 * hbNoise(W * 0.3));
  #if HB_CROP_GREEN == 2
  o = green;
  #else
  o = mix(o, green, smoothstep(0.24, 0.33, p));
  #endif
  #endif
  #if HB_CROP_GOLD > 0
  vec3 gold = vec3(0.5, 0.37, 0.1) * (0.9 + 0.2 * hbNoise(W * 0.25));
  #if HB_CROP_GOLD == 2
  o = gold;
  #else
  o = mix(o, gold, smoothstep(0.38, 0.47, p));
  #endif
  #endif
  float cut = HB_CROP_CUT == 2 ? 1.0 : HB_CROP_CUT == 1 ? smoothstep(0.5, 0.53, p) : 0.0;
  #if HB_CROP_CUT > 0
  vec3 stubble = vec3(0.47, 0.4, 0.22) * (0.95 + 0.1 * row * rowK);
  o = HB_CROP_CUT == 2 ? stubble : mix(o, stubble, cut);
  #endif
  #ifdef HB_STOOKS
  vec2 cell = floor(W.xz / 3.5), cf = fract(W.xz / 3.5) - 0.5;
  vec2 jit = vec2(hbWhite(vec3(cell, 81.0)), hbWhite(vec3(cell, 83.0))) - 0.5;
  float stook = (1.0 - smoothstep(0.1, 0.15, length(cf - jit * 0.5))) * step(0.35, hbWhite(vec3(cell, 87.0)));
  float shadeSide = smoothstep(0.0, 0.1, dot(cf - jit * 0.5, vec2(0.7, 0.7)));
  float stookK = cut * (1.0 - smoothstep(0.66, 0.7, p));
  float sub = smoothstep(0.3, 0.7, dW / 0.6);
  o = mix(o, mix(vec3(0.56, 0.42, 0.13) * (1.0 - 0.45 * shadeSide), o * 0.97, sub), stook * stookK * (1.0 - sub * 0.9));
  #endif
  #if HB_CROP_PLOUGH > 0
  o = HB_CROP_PLOUGH == 2 ? furrow : mix(o, furrow, smoothstep(0.7, 0.78, p));
  #endif
  float vcShade = clamp(hbTLuma(vc) / 0.215, 0.55, 1.25);
  return o * vcShade;
}

void hbTerrainEval(
  vec3 vc, float pid, vec3 W, vec3 worldN, float dW,
  out vec3 alb, out float rough, out vec3 shadeN, out vec3 bareN,
  out float contactAO, out float wRockOut, out float wGrassOut,
  out float snowOut, out float puddleOut
) {
  vec4 splat = vec4(0.0, 0.0, 1.0, 0.0);
  vec4 topo = vec4(0.5, 0.5, 0.5, 1.0);
  vec3 topoN = worldN;
  if (uTerrainBounds.z > 0.0) {
    vec2 tUv = vec2((W.x - uTerrainBounds.x) * uTerrainBounds.z, (uTerrainBounds.y - W.z) * uTerrainBounds.w);
    splat = texture2D(uTerrainSplat, tUv);
    topo = texture2D(uTerrainTopo, tUv);
    vec2 tnxz = topo.rg * 2.0 - 1.0;
    float tny = sqrt(max(0.0, 1.0 - dot(tnxz, tnxz)));
    topoN = normalize(vec3(tnxz.x, tny, tnxz.y));
  }
  contactAO = splat.b;

  float isRockPid = hbTIs(pid, 5.0);
  float isPlainPid = hbTIs(pid, 0.0);
  float isCobblePid = hbTIs(pid, 4.0);
  float isCropPid = hbTIs(pid, ${PATTERN_CROP.toFixed(1)});

  float bareAgree = smoothstep(0.45, 0.72, abs(dot(worldN, topoN)));
  float cliffKeep = isRockPid * (1.0 - smoothstep(0.65, 0.85, worldN.y));
  bareN = normalize(mix(worldN, topoN, bareAgree * (1.0 - cliffKeep)));

  float slope = 1.0 - bareN.y;
  float curv = topo.b;
  float coastDist = topo.a;
  float nMacro = hbFbm(W * 0.026);
  float nMid = hbNoise(W * 0.085 + 13.7);
  float nPatch = hbNoise(W * 0.055 + 3.1);

  float ledgeGrass = smoothstep(0.72, 0.92, worldN.y) * (1.0 - splat.a);
  float wRock = clamp(smoothstep(0.16, 0.42, slope) * 1.15
    + smoothstep(0.55, 0.78, curv) * 0.55
    + splat.a * 0.92
    + isRockPid * (1.15 - 0.55 * ledgeGrass), 0.0, 1.25);
  float talus = smoothstep(0.12, 0.32, wRock) * (1.0 - smoothstep(0.45, 0.75, wRock)) * 0.52;
  float wEarth = clamp(splat.r * 1.15 + talus, 0.0, 1.15);
  float wGrass = 0.58;
  float northMoss = (1.0 - smoothstep(-0.35, 0.0, bareN.z)) * (1.0 - smoothstep(0.35, 0.75, splat.b));
  float wHumus = clamp(splat.g * 1.12 + northMoss * 0.72, 0.0, 1.12);
  float beachPid = isPlainPid * (1.0 - smoothstep(2.4, 4.8, W.y)) * smoothstep(0.55, 0.85, bareN.y);
  float wShore = clamp((1.0 - smoothstep(0.0, 0.30, coastDist)) * (1.0 - smoothstep(1.8, 4.2, W.y)) * 1.05
    + beachPid * 1.15, 0.0, 1.25);

  float h0 = 0.55, h1 = 0.45, h2 = 0.52, h3 = 0.44, h4 = 0.48;
  float ao0 = 1.0, ao1 = 1.0, ao2 = 1.0, ao3 = 1.0, ao4 = 1.0;
  vec3 rockNOff = vec3(0.0);
  vec2 n1 = vec2(0.0), n2 = vec2(0.0), n3 = vec2(0.0), n4 = vec2(0.0);

  #ifndef HB_LITE
  vec2 uvN = W.xz * (1.0 / 3.7);
  vec2 uvM = mat2(0.7986355, -0.6018150, 0.6018150, 0.7986355) * W.xz * (1.0 / 17.2);
  vec2 dxN = dFdx(uvN), dyN = dFdy(uvN), dxM = dFdx(uvM), dyM = dFdy(uvM);
  vec3 dWx = dFdx(W) * 0.238, dWy = dFdy(W) * 0.238;
  float nearFade = 1.0 - smoothstep(0.14, 0.52, dW * 0.27);
  if (wRock > 0.01) {
    hbSampleBiplanarRock(W, bareN, dWx, dWy, nearFade, rockNOff, h0, ao0);
  }
  if (wEarth > 0.01) {
    vec4 d1 = hbSampleDetail(uvN, dxN, dyN, uvM, dxM, dyM, 1.0, nearFade);
    n1 = d1.xy; h1 = d1.z; ao1 = d1.w;
  }
  if (wGrass > 0.01) {
    vec4 d2 = hbSampleDetail(uvN, dxN, dyN, uvM, dxM, dyM, 2.0, nearFade);
    n2 = d2.xy; h2 = d2.z; ao2 = d2.w;
  }
  if (wHumus > 0.01 || wShore > 0.01) {
    vec4 d3 = hbSampleDetail(uvN, dxN, dyN, uvM, dxM, dyM, 3.0, nearFade);
    n3 = d3.xy; h3 = d3.z; ao3 = d3.w;
    n4 = d3.xy; h4 = d3.z; ao4 = d3.w;
  }
  #endif

  hbHeightBlend5(wRock, wEarth, wGrass, wHumus, wShore, h0, h1, h2, h3, h4);
  wRockOut = wRock;
  wGrassOut = wGrass;

  float strata = sin(W.y * 1.35 + nMacro * 5.2) * 0.5 + 0.5;
  vec3 rockBase = mix(vec3(0.328, 0.292, 0.223), vec3(0.578, 0.503, 0.342), 0.35 + 0.65 * strata * (0.45 + 0.55 * h0));
  rockBase = mix(vec3(0.089, 0.078, 0.063), rockBase, smoothstep(0.12, 0.72, ao0));
  float lichen = smoothstep(0.68, 0.90, bareN.y) * smoothstep(0.56, 0.78, nMid) * smoothstep(0.35, 0.75, ao0);
  vec3 cRock = mix(rockBase, vec3(0.46, 0.37, 0.14), lichen * 0.42);
  float rRock = mix(0.90, 0.74, smoothstep(0.35, 0.85, ao0) * (0.5 + 0.5 * strata));

  vec3 soilCol = mix(vec3(0.235, 0.160, 0.092), vec3(0.335, 0.232, 0.132), 0.35 + 0.65 * nMid);
  float peb = smoothstep(0.66, 0.80, h1);
  vec3 cEarth = mix(soilCol * (0.72 + 0.32 * ao1), vec3(0.555, 0.485, 0.345), peb * 0.82);
  float rEarth = mix(0.94, 0.80, peb);

  float hollow = 1.0 - smoothstep(0.28, 0.48, curv);
  float ridgeDry = clamp(smoothstep(0.52, 0.74, curv) * 0.65 + smoothstep(0.10, 0.32, slope) * clamp(bareN.z, 0.0, 1.0) * 0.55, 0.0, 1.0);
  float tussock = clamp(smoothstep(0.34, 0.72, nMacro * 0.65 + nPatch * 0.35 + ridgeDry * 0.32 - hollow * 0.38), 0.0, 1.0);
  vec3 gSage = vec3(0.135, 0.195, 0.066);
  vec3 gStraw = vec3(0.370, 0.280, 0.095);
  vec3 gHollow = vec3(0.065, 0.112, 0.036);
  vec3 gBase = mix(gSage, gStraw, tussock * 0.52);
  gBase = mix(gBase, gHollow, hollow * 0.58);
  float vcAO = clamp(hbTLuma(vc) / 0.215, 0.45, 1.25);
  float sp = uFoliage.x, su = uFoliage.y, au = uFoliage.z, wi = uFoliage.w;
  vec3 gSpring = gBase * ${SPRING_TURF_GLSL} + vec3(0.005, 0.008, 0.009);
  vec2 fc = floor(W.xz * 0.6), ff = fract(W.xz * 0.6) - 0.5;
  float meadow = smoothstep(0.32, 0.68, nPatch);
  float fDens = 0.05 + 0.42 * meadow;
  float fOn = step(1.0 - fDens, hbWhite(vec3(fc, 53.0)));
  vec2 fJit = vec2(hbWhite(vec3(fc, 61.0)), hbWhite(vec3(fc, 67.0))) - 0.5;
  float petal = (1.0 - smoothstep(0.17, 0.25, length(ff - fJit * 0.45))) * fOn;
  float fk = hbWhite(vec3(fc, 71.0));
  vec3 fCol = fk < 0.38 ? vec3(0.95, 0.62, 0.01) : fk < 0.6 ? vec3(0.92, 0.9, 0.84) : fk < 0.85 ? vec3(0.92, 0.18, 0.4) : vec3(0.4, 0.2, 0.9);
  float fSub = smoothstep(0.3, 0.7, dW * 0.6);
  gSpring = mix(gSpring, mix(fCol, vec3(0.88, 0.62, 0.48), fSub), mix(petal, fDens * 0.14, fSub) * sp);
  vec3 gSummer = mix(gBase, gSage * vec3(0.95, 1.02, 0.98), hollow * 0.5);
  vec3 gAutumn = gBase * mix(vec3(0.94, 0.96, 0.90), vec3(1.12, 0.94, 0.80), tussock);
  vec3 gWinter = gBase * vec3(0.84, 0.96, 1.08);
  vec3 gWet = gSpring * sp + gSummer * su + gAutumn * au + gWinter * wi;
  vec3 gDry = mix(gSummer * vec3(1.05, 0.96, 0.82), ${STRAW_GLSL} * vec3(1.0, 0.94, 0.66) * (0.78 + 0.36 * tussock), 0.58 * (1.0 - hollow * 0.72));
  vec3 cGrass = mix(gWet, gDry, hbDrySeason()) * mix(0.76, 1.06, ao2) * mix(0.82, 1.08, vcAO * 0.7 + 0.3);
  float rGrass = mix(0.96, 0.90, smoothstep(0.35, 0.82, h2));

  vec3 cDuff = vec3(0.148, 0.096, 0.052) * (0.78 + 0.32 * ao3);
  vec3 cMoss = vec3(0.055, 0.108, 0.042) * (0.75 + 0.35 * ao3);
  vec3 cHumus = mix(cDuff, cMoss, clamp(northMoss * (1.0 - splat.g * 0.5), 0.0, 1.0));
  float rHumus = mix(0.96, 0.92, h3);

  float ripWarp = hbFbm(W * 0.24);
  float swash = sin(dot(W.xz, vec2(0.76, -0.65)) * 1.96 + ripWarp * 4.2) * 0.5 + 0.5;
  vec3 sandCol = vec3(0.648, 0.517, 0.305) * (0.94 + 0.10 * (swash - 0.5) * hbTFine(dW, 2.5));
  vec3 shingCol = vec3(0.370, 0.340, 0.275) * (0.82 + 0.28 * ao4);
  vec3 cShore = mix(shingCol, sandCol, clamp(beachPid * 0.92 + smoothstep(0.45, 0.75, nMacro) * 0.25, 0.0, 1.0));
  vec2 wCell = floor(W.xz / 7.0);
  float wPh = fract(-hbSwellPhase(W.xz, uRunup.y) * 0.15915494 + fract(sin(dot(wCell, vec2(12.9898, 78.233))) * 43758.5453) * 0.35);
  float reach = (0.28 + 0.62 * uRunup.x) * (0.55 + 0.45 * pow(1.0 - wPh, 1.5));
  float wetSplash = (1.0 - smoothstep(reach - 0.12, reach + 0.42, W.y + (ripWarp - 0.5) * 0.22)) * smoothstep(-0.55, 0.02, W.y);
  float rShore = mix(0.88, 0.20, wetSplash * 0.92);
  cShore *= 1.0 - 0.42 * wetSplash;

  alb = cRock * wRock + cEarth * wEarth + cGrass * wGrass + cHumus * wHumus + cShore * wShore;
  rough = rRock * wRock + rEarth * wEarth + rGrass * wGrass + rHumus * wHumus + rShore * wShore;
  float detH = h0 * wRock + h1 * wEarth + h2 * wGrass + h3 * wHumus + h4 * wShore;

  if (isCropPid > 0.5) {
    vec3 cropC = hbTerrainCrop(vc, W, dW);
    alb = mix(alb, cropC * mix(0.84, 1.06, ao1), 0.92);
    rough = mix(rough, 0.90, 0.92);
    wGrassOut *= 0.25;
  } else if (isCobblePid > 0.5) {
    float cFine = hbTFine(dW, 0.6);
    vec3 cobCol = vc * 0.86;
    float cobR = 0.80;
    if (cFine > 0.0) {
      vec2 v = hbTVoronoi(vec2(W.x, -W.z) * 1.7);
      float edge = mix(0.54, 1.0, smoothstep(0.0, 0.09, v.y));
      float crown = smoothstep(0.0, 0.16, v.y) * (1.0 - 0.24 * v.x);
      cobCol = vc * mix(0.86, (0.90 + v.x * 0.20) * edge, cFine);
      cobR = mix(0.80, mix(0.91, 0.66, crown), cFine);
    }
    alb = mix(cobCol, cEarth, clamp(splat.r * 0.25, 0.0, 0.35));
    rough = cobR;
  }

  float steepRunup = (1.0 - smoothstep(0.45, 0.80, bareN.y)) * smoothstep(0.25, 0.65, wRock)
    * (1.0 - smoothstep(reach - 0.06, reach + 0.14, W.y)) * smoothstep(-0.6, 0.0, W.y);
  alb *= 1.0 - 0.32 * steepRunup;
  rough = mix(rough, 0.28, steepRunup * 0.65);

  vec3 nPert = vec3(0.0);
  #ifndef HB_LITE
  vec2 planarN = n1 * wEarth * 0.42 + n2 * wGrass * 0.36 + n3 * wHumus * 0.34 + n4 * wShore * 0.28 * (1.0 - wetSplash * 0.7);
  nPert = rockNOff * wRock * 0.58 + vec3(planarN.x, 0.0, planarN.y);
  float nVar = clamp(dot(nPert, nPert) * 0.34 + (length(dFdx(bareN)) + length(dFdy(bareN))) * 0.48, 0.0, 0.32);
  rough = sqrt(clamp(rough * rough + nVar, 0.0, 0.96));
  #endif
  shadeN = normalize(bareN + nPert);

  snowOut = 0.0;
  puddleOut = 0.0;
  float aboveSea = smoothstep(0.2, 0.75, W.y);
  if (uSnowCover > 0.002) {
    float n1s = hbFbm(W * 0.42);
    float n2s = hbNoise(W * 2.6);
    float nLs = hbNoise(W * vec3(0.045, 0.02, 0.045));
    float lo = ${SNOW_SLOPE.lo.toFixed(2)} - ${SNOW_SLOPE.give.toFixed(2)} * uSnowCover;
    float hi = ${SNOW_SLOPE.hi.toFixed(2)} - ${SNOW_SLOPE.give.toFixed(2)} * uSnowCover;
    float upm = smoothstep(lo, hi, bareN.y + (n2s - 0.5) * 0.14 * hbTFine(dW, 0.4));
    float cliffShed = 1.0 - wRock * (1.0 - smoothstep(0.62, 0.88, bareN.y)) * 0.75;
    float treeWell = 1.0 - 0.55 * splat.g;
    float cover = uSnowCover * (1.0 - isCobblePid * 0.45) * cliffShed * treeWell;
    float field = n1s * 0.45 + nLs * 0.45 + 0.1 + (n2s - 0.5) * 0.1 * hbTFine(dW, 0.4) - slope * 0.28;
    float thr = 1.0 - cover * 0.95;
    snowOut = smoothstep(thr - 0.07, thr + 0.07, field) * upm * aboveSea;
    vec3 snowC = vec3(0.64, 0.675, 0.73) * (0.95 + 0.05 * n2s);
    alb = mix(alb, snowC, snowOut);
    rough = mix(rough, 0.6, snowOut);
    float rime = uSnowCover * smoothstep(-0.15, 0.3, W.y) * (1.0 - smoothstep(0.7, 1.6, W.y))
      * smoothstep(0.32, 0.6, hbNoise(W * vec3(1.3, 3.5, 1.3))) * (1.0 - snowOut);
    alb = mix(alb, vec3(0.66, 0.76, 0.82), rime * 0.8);
    rough = mix(rough, 0.16, rime);
  }
  if (uWetness > 0.002) {
    float w = uWetness * (1.0 - snowOut);
    float porous = mix(0.88, 0.68, wGrass);
    alb *= 1.0 - 0.42 * w * porous;
    float upw = smoothstep(0.25, 0.9, bareN.y);
    float wetR = mix(0.34, 0.14, upw);
    rough = mix(rough, wetR, w * (1.0 - 0.72 * wGrass));
    float basin = clamp(smoothstep(0.45, 0.68, splat.r) + (1.0 - smoothstep(0.32, 0.42, curv)) + isCobblePid * 0.7, 0.0, 1.0);
    float pn = hbFbm(W * 0.21) + (1.0 - detH) * 0.28;
    float lvl = 0.74 - 0.16 * w;
    puddleOut = smoothstep(lvl, lvl + 0.04, pn) * smoothstep(0.94, 0.985, bareN.y) * basin * w * aboveSea;
    alb = mix(alb, alb * 0.42, puddleOut);
    rough = mix(rough, 0.03, puddleOut);
  }
  #ifndef HB_LITE
  if (uHbDew.y > 0.002 && wGrass > 0.05) {
    float dn = hbNoise(W * 1.7) * 0.6 + hbNoise(W * 7.0) * 0.4;
    float frost = uHbDew.y * wGrass * smoothstep(0.35, 0.8, bareN.y) * smoothstep(0.42, 0.62, dn) * (1.0 - snowOut);
    alb = mix(alb, vec3(0.74, 0.79, 0.84), frost * 0.6);
    rough = mix(rough, 0.45, frost);
  }
  shadeN = normalize(mix(shadeN, bareN, clamp(puddleOut * 0.95 + snowOut * 0.65, 0.0, 1.0)));
  #endif
}
`;

export interface TerrainPatchContext {
  readonly lite: boolean;
  readonly defines: Record<string, string>;
  readonly shared: Record<string, THREE.IUniform>;
  readonly maps: TerrainMapUniforms;
  readonly u: WorldUniforms;
  readonly injectVaryings: (shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }) => void;
}

export type TerrainShaderPatcher = (
  shader: THREE.WebGLProgramParametersWithUniforms,
  ctx: TerrainPatchContext,
) => void;

/** Patch a Three.js `MeshStandardMaterial` shader program with the dedicated `hb_terrain` pipeline. */
export const patchTerrainShader: TerrainShaderPatcher = (shader, ctx) => {
  Object.assign(
    shader.uniforms,
    ctx.shared,
    ctx.maps,
    cloudShadowUniforms,
    dewUniforms,
    aerialUniforms,
    runupUniforms,
    { uAerialDensity: ctx.u.uFogDensity, uAerialHaze: ctx.u.uHaze },
  );
  ctx.injectVaryings(shader);
  shader.vertexShader = patch(shader.vertexShader, "#include <common>", `#include <common>\nvarying vec3 vHbWorldN;\n${AERIAL_VERT_GLSL}`, { id: "terrain.1.common" });
  shader.vertexShader = patch(shader.vertexShader, "    vHbWorld = (modelMatrix * hbW).xyz;\n  }", `    vHbWorld = (modelMatrix * hbW).xyz;
    vec3 hbWN = objectNormal;
    #ifdef USE_INSTANCING
      hbWN = mat3(instanceMatrix) * hbWN;
    #endif
    vHbWorldN = normalize(mat3(modelMatrix) * hbWN);
    hbAerialVert(vHbWorld);
  }`, { id: "terrain.2.worldpos" });
  if (ctx.lite) {
    shader.vertexShader = patch(shader.vertexShader, "#include <common>", `#include <common>\n${BEAM_LIGHT_VERT_GLSL}`, { id: "terrain.3.beam_common" });
    shader.vertexShader = patch(shader.vertexShader, "    hbAerialVert(vHbWorld);\n  }", "    hbAerialVert(vHbWorld);\n    hbBeamVert(vHbWorld);\n  }", { id: "terrain.4.beam_vert" });
  }
  shader.defines = { ...shader.defines, ...ctx.defines };
  if (ctx.lite) shader.fragmentShader = patch(shader.fragmentShader, "#include <shadowmap_pars_fragment>", liteShadow(), { id: "terrain.lite-shadow" });
  shader.fragmentShader = patch(
    shader.fragmentShader,
    "#include <common>",
    `#include <common>\n${GLSL_NOISE}\n${GLSL_ENV}\n${GLSL_POOL}\n${GLSL_AO}\n${CLOUD_SHADOW_GLSL}\n${AERIAL_GLSL}\n${BEAM_LIGHT_GLSL}\n${LANDMARK_HOVER_GLSL}\n${GLSL_TERRAIN}`,
    { id: "terrain.5.common" },
  );
  shader.fragmentShader = patch(shader.fragmentShader, "#include <color_fragment>", `
  vec3 hbVc = vec3(1.0);
  #if defined( USE_COLOR_ALPHA )
    float hbPid = floor(vColor.a * 16.0 + 0.5);
    hbVc = vColor.rgb;
  #elif defined( USE_COLOR )
    float hbPid = 6.0;
    hbVc = vColor.rgb;
  #else
    float hbPid = 6.0;
  #endif
  float hbSdW = fwidth(vHbWorld.x) + fwidth(vHbWorld.z);
  vec3 hbWorldN = normalize(vHbWorldN) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 hbAlb, hbShadeN, hbBareN;
  float hbRough, hbContactAO, hbWRock, hbWGrass, hbSnow, hbPuddle;
  hbTerrainEval(hbVc, hbPid, vHbWorld, hbWorldN, hbSdW, hbAlb, hbRough, hbShadeN, hbBareN, hbContactAO, hbWRock, hbWGrass, hbSnow, hbPuddle);
  diffuseColor = vec4(hbAlb, 1.0);`, { id: "terrain.6.color_fragment" });
  shader.fragmentShader = patch(shader.fragmentShader, "#include <roughnessmap_fragment>", "float roughnessFactor = hbRough;", { id: "terrain.7.roughness" });
  shader.fragmentShader = patch(shader.fragmentShader, "#include <metalnessmap_fragment>", "float metalnessFactor = 0.0;", { id: "terrain.8.metalness" });
  shader.fragmentShader = patch(shader.fragmentShader, "#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n  normal = transformDirection(hbShadeN, viewMatrix);", { id: "terrain.9.normal" });
  shader.fragmentShader = patch(shader.fragmentShader, "#include <aomap_fragment>", `#include <aomap_fragment>
  float hbOcc = hbAO(vHbWorld, hbShadeN) * hbContactAO;
  float hbCs = hbCloudShadow(vHbWorld.xz);
  reflectedLight.directDiffuse *= hbCs * mix(0.68, 1.0, hbContactAO);
  reflectedLight.directSpecular *= hbCs * mix(0.55, 1.0, hbContactAO);
  reflectedLight.indirectDiffuse *= hbOcc;
  reflectedLight.indirectSpecular *= hbOcc;
  {
    float hbWetK = smoothstep(0.0, 0.25, uWetness);
    float hbCap = 0.005 + 0.5 * hbTLuma(uHemiSky);
    float hbSl = hbTLuma(reflectedLight.directSpecular);
    reflectedLight.directSpecular *= mix(1.0, min(1.0, hbCap / max(hbSl, 1e-5)), hbWetK);
  }`, { id: "terrain.10.aomap" });
  shader.fragmentShader = patch(shader.fragmentShader, "#include <opaque_fragment>", `
  {
    vec3 hbVw = inverseTransformDirection(normalize(vViewPosition), viewMatrix);
    float hbSkyL = hbTLuma(uHemiSky);
    float hbWetSheen = smoothstep(0.0, 0.25, uWetness);
    float hbEnvF0 = mix(0.012, 0.028, hbWRock * (1.0 - max(hbWetSheen, hbSnow)));
    outgoingLight += min(hbEnvSpec(hbShadeN, hbVw, roughnessFactor, hbEnvF0), vec3(mix(4.0, 0.35 * hbSkyL + 0.01, hbWetSheen))) * uRimK * hbOcc;
    outgoingLight += hbBounceFill(diffuseColor.rgb, hbShadeN, uHbSunDir, uHbSunColor, hbOcc, uNight);
    outgoingLight += diffuseColor.rgb * hbPool(vHbWorld, hbShadeN);
    outgoingLight += diffuseColor.rgb * (hbBeamLight(vHbWorld, hbShadeN) * hbOcc + hbPharosFire(vHbWorld, hbShadeN));
    outgoingLight += max(diffuseColor.rgb, vec3(0.12)) * uNightLift * hbOcc * (0.6 + 0.4 * max(hbShadeN.y, 0.0));
    outgoingLight += min(hbEnvSpec(hbShadeN, hbVw, 0.02, 0.03), vec3(0.3 * hbSkyL + 0.003)) * hbPuddle * hbOcc;
    if (hbSnow > 0.01) {
      float g = step(0.992, hbWhite(floor(vHbWorld * 4.5) + 101.0)) * hbTFine(hbSdW, 0.22);
      float spec = pow(max(dot(reflect(-hbVw, hbShadeN), uHbSunDir), 0.0), 4.0);
      outgoingLight += uHbSunColor * g * spec * hbSnow * hbCs * 0.5;
    }
    #ifndef HB_LITE
    if (uHbDew.x > 0.002 && hbWGrass > 0.05) {
      float dg = step(0.985, hbWhite(floor(vHbWorld * 6.0) + 37.0)) * hbTFine(hbSdW, 0.17);
      outgoingLight += uHbSunColor * uHbDew.x * hbWGrass * dg * pow(max(dot(reflect(-hbVw, hbShadeN), uHbSunDir), 0.0), 6.0) * hbCs * 0.6;
    }
    #endif
    outgoingLight += hbLmHoverRim(vHbWorld, hbShadeN, hbVw, outgoingLight);
  }
  hbAerial(outgoingLight, vHbWorld, 0.0);
  #include <opaque_fragment>`, { id: "terrain.11.opaque" });
};

/** Start fetching splat/topo WebPs, synthesize + stage the 256×256×4 detail atlas, and return the finalize handle. */
export function prepareIslandTerrain(
  ctx: EngineContext,
  target: {
    setTerrainDetail(t: THREE.DataArrayTexture): void;
    setTerrainMaps(s: THREE.Texture, t: THREE.Texture, b: readonly [number, number, number, number]): void;
  },
  urls: readonly [string, string],
  bounds: readonly [number, number, number, number],
  preparation?: PreparationService,
): { detail: THREE.DataArrayTexture | null; bindMaps: () => Promise<void> } {
  const maps = Promise.all(urls.map((u) => ctx.assets.texture(u, false).catch((e: unknown) => {
    if (ctx.signal?.aborted) throw e;
    return null;
  })));
  let detail: THREE.DataArrayTexture | null = null;
  if (!ctx.signal?.aborted) {
    detail = createTerrainDetailAtlas();
    target.setTerrainDetail(detail);
    if (preparation) void preparation.stageTexture(detail).catch(() => {});
  }
  return {
    detail,
    async bindMaps() {
      const [splat, topo] = await maps;
      if (!splat || !topo) return;
      for (const tex of [splat, topo]) {
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
      }
      if (preparation) await Promise.all([preparation.stageTexture(splat), preparation.stageTexture(topo)]);
      target.setTerrainMaps(splat, topo, bounds);
    },
  };
}
