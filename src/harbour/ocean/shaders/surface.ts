import { GUST_GLSL } from "../../weather/gust";
import { CLOUD_SHADOW_GLSL } from "../../sky/cloud-shadow";
import { SEA_TONE_GLSL } from "../sea-tone";
import { SUN_SHADOW_GLSL } from "../../world/sun-shadow";
import { SEA_GOLDEN_GLSL } from "../sea-golden";
import { SEA_HELIO_GLSL } from "../sea-helio";
import { SWELL_DIR, WAVES } from "../waves";
import { OCEAN_DISP_GLSL } from "./ocean-disp";

const w0 = WAVES[0]!;
const f6 = (v: number) => v.toFixed(6);

function waveHessianGLSL(): string {
  const f = (v: number) => v.toFixed(6);
  let body = "";
  for (const wv of WAVES) {
    body += `  s -= ${f(wv.k * wv.k * wv.amp)} * sin(${f(wv.k)} * dot(vec2(${f(wv.dirX)}, ${f(wv.dirZ)}), p) - ${f(wv.w)} * t);\n`;
  }
  return `float hbWaveHessian(vec2 p, float t, float amp) { float s = 0.0;\n${body}  return s * amp; }`;
}

/**
 * Ocean surface fragment preamble & body (Phase 2 §2.2, §5.1–§5.7):
 * - Strict WebGL2 fragment sampler cap:
 *     - `HB_OCEAN_FULL` (`#ifndef HB_LITE`, shared by High & Medium — zero compile on tier switch):
 *       15/16 samplers: uSdf, uWake, uWakeLive, uZones, uNoise, uSkyBand, uPoolTex, uDynPoolTex,
 *       uSeaShadow, uCloudShadowTex, uMirrorTex, uFftAtlas (sampler2DArray), uCapColor, uCapDepth, uCausticMap.
 *     - `HB_LITE` (`#ifdef HB_LITE`, Low tier):
 *       13/16 samplers: uSdf, uWake, uWakeLive, uZones, uNoise, uSkyBand, uPoolTex, uDynPoolTex,
 *       uSeaShadow, uCloudShadowTex, uRipple, uCapColor, uCapDepth.
 * - High/Med sample 3-cascade hardware-mipped `uFftAtlas` with bathymetric shoaling + shore-normal wave wrapping
 *   (Snell approximation), LEAN/Toksvig slope variance (`fftSlopeVar`), persistent `RGBA16F` `WakeField` + target-centered
 *   `RGBA16F` curved `WakeRibbons` (`uLiveBounds`), and FFT wave-Hessian Medium caustics (`uCausticMode == 1`).
 * - Low keeps smooth 5-wave Gerstner + dual-scale `uRipple` + Voronoi caustics.
 * - Strictly B07/C04 compliant (ascending `smoothstep` edges only, squaring by multiplication).
 */
export const OCEAN_SURFACE = /* glsl */ `
uniform float uTime, uNight;
uniform vec3 uCameraPos, uSunDir, uSunColor, uAmbient, uZenith;
uniform vec4 uSea;
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
uniform sampler2D uWake, uWakeLive;
uniform vec4 uWakeBounds, uLiveBounds;
uniform float uWakeRgba, uRibbonsOn;
uniform sampler2D uZones;
uniform sampler2D uNoise;
#ifdef HB_LITE
uniform sampler2D uRipple;
#else
uniform sampler2D uMirrorTex;
uniform mat4 uPlanarVP;
uniform vec4 uMirror;
uniform float uReflectMode;
uniform sampler2D uCausticMap;
#endif
uniform vec3 uAbyss, uDeep, uMid, uShallow, uShoal, uSunlitShoal, uFoamCol, uFoamNight;
uniform sampler2D uSkyBand;
uniform vec4 uSkyBandRange;
uniform float uFwdAz, uHorizonDist, uHorizonDepr;
uniform vec3 uGlintDir, uGlintCol;
uniform vec4 uWeatherSea;
uniform vec2 uPrecip;
uniform vec4 uGust;
${GUST_GLSL}
uniform vec3 uBeamPos, uBeamCol;
uniform float uBeamAngle;
uniform vec4 uBeamShape, uBeamSun;
uniform float uDebug;
uniform sampler2D uPoolTex;
uniform vec4 uPoolBounds;
uniform sampler2D uDynPoolTex;
uniform vec4 uDynPool, uDynPoolBounds;
uniform vec4 uNightGlintPos[16];
uniform vec4 uNightGlintCol[16];
uniform float uNightGlintCount;
uniform float uWindowGlow, uLampArrive;
uniform vec2 uSceneCenter;
uniform float uSceneRadius;
uniform sampler2D uCapColor, uCapDepth;
uniform float uCapReady, uCausticMode;
uniform vec2 uCapNearFar, uCapSize;
uniform mat4 uCapInvVP;
uniform vec4 uCausticBounds;
varying vec3 vWorld;
varying float vDamp;
${OCEAN_DISP_GLSL}
${waveHessianGLSL()}
${CLOUD_SHADOW_GLSL}
${SEA_TONE_GLSL}
${SUN_SHADOW_GLSL}
${SEA_GOLDEN_GLSL}
${SEA_HELIO_GLSL}

const vec2 SWELL = vec2(${SWELL_DIR[0].toFixed(5)}, ${SWELL_DIR[1].toFixed(5)});

float hbLinearDepth(float d, vec2 nf) {
  return (2.0 * nf.x * nf.y) / max(nf.y + nf.x - (d * 2.0 - 1.0) * (nf.y - nf.x), 1e-4);
}
vec3 band(float th, float e, float lod) {
  vec2 uv = vec2((th - uSkyBandRange.x) / (uSkyBandRange.y - uSkyBandRange.x), (e - uSkyBandRange.z) / (uSkyBandRange.w - uSkyBandRange.z));
  vec3 c = textureLod(uSkyBand, clamp(uv, vec2(0.002), vec2(0.998)), lod).rgb;
  return mix(c, uZenith, smoothstep(uSkyBandRange.w - 2.0, uSkyBandRange.w + 18.0, e));
}
float wrapPi(float a) { return atan(sin(a), cos(a)); }
vec3 rainRings(vec2 xz, float t, float fp) {
  vec3 acc = vec3(0.0);
  mat2 rRot = mat2(0.60, 0.80, -0.80, 0.60);
  for (int l = 0; l < 2; l++) {
    float cell = l == 0 ? 1.35 : 2.15;
    float aaR = 1.0 - smoothstep(0.18, 0.58, fp / cell);
    vec2 q = l == 0 ? xz : (rRot * xz);
    vec2 p = q / cell + float(l) * vec2(0.41, 0.73);
    vec2 id = floor(p), f = fract(p) - 0.5;
    float h = fract(sin(dot(id + float(l) * 23.0, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(h * 91.7);
    float ph = fract(t * (0.85 + 0.55 * h2) + h);
    vec2 c = (vec2(h, h2) - 0.5) * 0.62;
    vec2 d = f - c;
    float r = length(d);
    float rad = ph * 0.44;
    float dr = (r - rad) / 0.095;
    float ring = sin((r - rad) * 26.0) * exp(-dr * dr) * (1.0 - ph) * (1.0 - ph) * aaR;
    vec2 dir = d / max(r, 1e-3);
    if (l == 1) dir = vec2(0.60 * dir.x - 0.80 * dir.y, 0.80 * dir.x + 0.60 * dir.y);
    acc.xy += dir * ring * (l == 0 ? 0.55 : 0.65);
    acc.z += (1.0 - smoothstep(0.0, 0.055, r)) * (1.0 - smoothstep(0.0, 0.22, ph));
  }
  return acc;
}
float hbNet(float a, float b, float w) {
  float d = a - b;
  float fw = fwidth(d) + 1e-4;
  return (1.0 - smoothstep(0.0, w + fw * 1.2, abs(d))) * clamp(w / fw * 0.6, 0.0, 1.0);
}

void main() {
  vec2 xz = vWorld.xz;
  vec2 dx = dFdx(xz), dy = dFdy(xz);
  vec3 toCam = uCameraPos - vWorld;
  float camD = length(toCam.xz);
  float fwdD = dot(-toCam.xz, vec2(sin(uFwdAz), -cos(uFwdAz)));
  vec3 V = normalize(toCam);
  float t = uTime;
  float wind = uWeatherSea.y;
  vec2 wdir = normalize(uWeatherSea.zw + 1e-4);

  vec2 suv = (xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
  vec2 edge2 = min(suv, 1.0 - suv);
  float inside = smoothstep(0.0, 0.03, min(edge2.x, edge2.y));
  vec4 sdf = texture2D(uSdf, clamp(suv, 0.0, 1.0));
  sdf.rg = mix(sdf.rg, vec2(1.0), smoothstep(470.0, 560.0, length(xz - uSceneCenter)));
  float coast = mix(220.0, (sdf.r - 0.5) * 128.0, inside);
  float depth = mix(40.0, sdf.g * 40.0, inside);
  float sdist = mix(16.0, sdf.b * 16.0, inside);
  vec4 zm = texture2D(uZones, clamp(suv, 0.0, 1.0)) * inside;

  vec2 wuv = (xz - uWakeBounds.xy) / (uWakeBounds.zw - uWakeBounds.xy);
  vec2 wedge = min(wuv, 1.0 - wuv);
  float winside = step(0.0, min(wedge.x, wedge.y));
  vec4 wakeS = texture2D(uWake, clamp(wuv, 0.0, 1.0)) * winside;
  float trail = wakeS.r;
  float jacFoam = 0.0;
  float ribChurn = 0.0;
  float kelH = 0.0;
  vec4 live;
  vec2 liveUv = wuv;
  vec2 liveSpan = uWakeBounds.zw - uWakeBounds.xy;
  #ifdef HB_LITE
  live = texture2D(uWakeLive, clamp(wuv, 0.0, 1.0)) * winside;
  float slick = live.a;
  float hullOcc = min(live.b, 1.0);
  #else
  float statSlick = uWakeRgba > 0.5 ? wakeS.b : 0.0;
  float statOcc = uWakeRgba > 0.5 ? wakeS.a : 0.0;
  jacFoam = uWakeRgba > 0.5 ? wakeS.g : 0.0;
  if (uRibbonsOn > 0.5) {
    liveSpan = max(uLiveBounds.zw - uLiveBounds.xy, vec2(1.0));
    liveUv = (xz - uLiveBounds.xy) / liveSpan;
    vec2 re = min(liveUv, 1.0 - liveUv);
    float rIn = smoothstep(0.0, 0.03, min(re.x, re.y));
    vec4 rib = textureLod(uWakeLive, clamp(liveUv, 0.0, 1.0), 0.0) * rIn;
    ribChurn = rib.g;
    kelH = rib.a;
    live = vec4(rib.r, jacFoam, max(statOcc, rib.b), statSlick);
  } else {
    vec4 rawL = texture2D(uWakeLive, clamp(wuv, 0.0, 1.0)) * winside;
    live = uWakeRgba > 0.5 ? vec4(rawL.r, max(rawL.g, jacFoam), max(statOcc, rawL.b), max(statSlick, rawL.a)) : rawL;
  }
  float slick = live.a;
  float hullOcc = min(live.b, 1.0);
  #endif

  vec2 shoreN = vec2(0.0);
  float shoreExp = 0.85;
  #ifndef HB_LITE
  if (coast < 56.0 && inside > 0.5) {
    shoreN = hbShoreNormal(uSdf, suv, coast, inside);
    if (length(shoreN) > 1e-4) {
      vec2 waveIn = normalize(mix(SWELL, wdir, 0.35 * wind));
      shoreExp = mix(0.45, 1.25, smoothstep(-0.65, 0.65, dot(shoreN, -waveIn)));
    }
  }
  #endif

  vec4 nA = texture2D(uNoise, xz * 0.0023);
  vec4 nB = texture2D(uNoise, xz * 0.017 + t * vec2(0.0035, -0.0026));
  vec4 nC = texture2D(uNoise, xz * 0.093 + t * vec2(0.012, 0.004));

  vec2 pawUv = xz * 0.0019 - wdir * t * (0.004 + 0.012 * wind);
  float paws = smoothstep(0.38, 0.7, texture2D(uNoise, pawUv).g * 0.7 + texture2D(uNoise, pawUv * 2.7 + 0.3).b * 0.45);
  paws = max(paws, hbGust(xz, uGust.w, uGust.xy) * (0.55 + 0.45 * uGust.z));
  paws = mix(paws, 0.35, uNight * 0.60);
  float rough = mix(0.35, 1.0, paws) * (0.75 + 0.5 * wind);
  rough *= 1.0 + 0.6 * uPrecip.x;
  float windSea = smoothstep(0.6, 1.0, wind);
  float storm = smoothstep(0.3, 0.85, uSea.x);
  float stormSea = max(storm, windSea);
  rough *= (1.0 - mix(0.30, 0.14, stormSea) * zm.b) * (1.0 + 0.3 * zm.a);
  rough *= 1.0 - 0.7 * slick;

  float far01 = smoothstep(250.0, 1300.0, camD);
  float fp = length(fwidth(xz));
  float amp = uSea.x * vDamp;
  vec2 swellTan = vec2(-SWELL.y, SWELL.x);
  vec2 xzw = xz + (swellTan * ((nA.g - 0.5) * 4.8 + (nB.b - 0.5) * 1.4) + SWELL * ((nA.b - 0.5) * 1.3)) * (0.35 + 0.65 * vDamp);
  float groups = 0.55 + 0.82 * smoothstep(0.18, 0.82, nA.r * 0.7 + texture2D(uNoise, xz * 0.0011 + vec2(t * 0.0009, 0.0)).b * 0.5);
  float shadeCap = mix(0.76, 1.0, stormSea);
  float ampShade = shadeCap * (1.0 - exp(-amp * mix(mix(1.75, 1.25, far01), mix(2.6, 2.0, far01), stormSea) / shadeCap));
  vec3 gS; float crestH;
  gerstnerSums(xzw, t, gS, crestH);
  vec3 gN = gerstnerNormalOf(gS, ampShade * groups);
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  mat2 rot2 = mat2(0.54, 0.84, -0.84, 0.54);
  float sp = 0.6 + 1.2 * wind;
  vec2 wPerp = vec2(-wdir.y, wdir.x);
  float graze = smoothstep(0.14, 0.42, max(V.y, 0.0));
  float grazeDamp = 0.35 + 0.65 * graze;
  float shoreCalm = mix(0.55, 1.0, smoothstep(1.0, 14.0, coast)) * (1.0 - mix(0.22, 0.08, stormSea) * zm.b);
  float dk = (0.17 + 0.13 * uSea.y) * rough * shoreCalm;

  vec2 dnWave = vec2(0.0);
  vec2 dnFine = vec2(0.0);
  vec2 spSlope = vec2(0.0);
  float organicCrest = 0.0;
  float fftSlopeVar = 0.0;
  float fftDispY = 0.0;
  float fftJMin = 1.0;
  float ripTw = 0.5;
  float ripMicro = 0.5;
  float ripMoon = 0.5;
  float ripCell = 0.5;

  #ifdef HB_LITE
  vec4 r1 = texture2D(uRipple, xz * 0.043 + wdir * t * 0.010 * sp);
  vec4 r2 = texture2D(uRipple, (rot * rot * xz) * 0.0093 + wdir * t * 0.0025);
  vec2 d1 = r1.rg * 2.0 - 1.0, d2 = r2.rg * 2.0 - 1.0;
  dnWave = (d1 * (0.76 - far01 * 0.48) * (0.65 + 0.35 * graze) + d2 * (0.58 + 0.38 * far01)) * dk;
  spSlope = d1 * (0.85 - far01 * 0.4) * 0.44;
  organicCrest = clamp(crestH * 0.68 * groups + (r2.a - 0.5) * 0.32, -1.0, 1.0);
  ripTw = r2.a * 0.6 + r1.a * 0.4;
  ripMicro = r1.a * 0.65 + r2.a * 0.35;
  ripMoon = r1.a * 0.45 + r2.a * 0.35 + nB.g * 0.25;
  ripCell = r1.b * 0.65 + r2.b * 0.55;
  #else
  vec2 xzShoal;
  float shoalK;
  hbShoalCoords(xz, depth, coast, shoreN, xzShoal, shoalK);
  vec2 dxS = dFdx(xzShoal), dyS = dFdy(xzShoal);
  if (uFftOn > 0.5) {
    float c0Sc = uFftScales.x, c1Sc = uFftScales.y, c2Sc = uFftScales.z;
    float shoreDamp = vDamp * smoothstep(0.0, 2.4, max(coast, 0.0));
    float steepBoost = mix(1.0, 1.32, shoalK);
    float w0f = uFftWeights.x * mix(0.45, 1.0, shoreDamp) * steepBoost;
    float w1f = uFftWeights.y * mix(0.42, 1.0, shoreCalm) * mix(0.65, 1.0, rough) * steepBoost * (1.0 - smoothstep(420.0, 1550.0, camD));
    float w2f = uFftWeights.z * mix(0.46, 1.0, shoreCalm) * mix(0.58, 1.15, rough) * (1.0 - smoothstep(130.0, 420.0, camD));
    vec4 d0 = textureGrad(uFftAtlas, vec3(xzShoal * c0Sc, 0.0), dxS * c0Sc, dyS * c0Sc);
    vec4 d1 = textureGrad(uFftAtlas, vec3(xzShoal * c1Sc, 1.0), dxS * c1Sc, dyS * c1Sc);
    vec4 d2 = textureGrad(uFftAtlas, vec3(xz * c2Sc, 2.0), dx * c2Sc, dy * c2Sc);
    vec4 s0 = textureGrad(uFftAtlas, vec3(xzShoal * c0Sc, 3.0), dxS * c0Sc, dyS * c0Sc);
    vec4 s1 = textureGrad(uFftAtlas, vec3(xzShoal * c1Sc, 4.0), dxS * c1Sc, dyS * c1Sc);
    vec4 s2 = textureGrad(uFftAtlas, vec3(xz * c2Sc, 5.0), dx * c2Sc, dy * c2Sc);
    float sw0Ph = ${f6(w0.k)} * dot(vec2(${f6(w0.dirX)}, ${f6(w0.dirZ)}), xzShoal) - ${f6(w0.w)} * t;
    float sw0Gain = ampShade * uFftWeights.w * mix(1.0, 1.24, shoalK);
    vec2 w0Slope = vec2(${f6(w0.dirX * w0.k * w0.amp)}, ${f6(w0.dirZ * w0.k * w0.amp)}) * cos(sw0Ph) * sw0Gain;
    vec2 sMacro = s0.xy * w0f + w0Slope;
    vec2 sMid = s1.xy * w1f;
    vec2 sFine = s2.xy * w2f;
    float slopeGain = mix(0.85, 1.12, stormSea);
    gN = normalize(vec3(-sMacro.x * slopeGain, 1.0, -sMacro.y * slopeGain));
    dnWave = -sMid * slopeGain * (0.65 + 0.35 * graze);
    dnFine = -sFine * slopeGain * grazeDamp;
    spSlope = -(sMid * 0.65 + sFine * 1.15) * slopeGain;
    float v0 = max(s0.a - dot(s0.xy, s0.xy), 0.0) * w0f * w0f;
    float v1 = max(s1.a - dot(s1.xy, s1.xy), 0.0) * w1f * w1f;
    float v2 = max(s2.a - dot(s2.xy, s2.xy), 0.0) * w2f * w2f;
    fftSlopeVar = clamp(v0 + v1 + v2, 0.0, 0.65);
    fftDispY = (d0.y * w0f + d1.y * w1f + d2.y * w2f) + sin(sw0Ph) * ${f6(w0.amp)} * amp * uFftWeights.w;
    fftJMin = min(d0.a, min(mix(1.0, d1.a, clamp(w1f, 0.0, 1.0)), mix(1.0, d2.a, clamp(w2f, 0.0, 1.0))));
    float fftCurv = clamp((s1.b * w1f + s2.b * w2f) * 0.45, -1.0, 1.0);
    organicCrest = clamp(fftDispY * 0.72 + (1.0 - clamp(fftJMin, 0.0, 1.0)) * 0.55 + fftCurv * 0.25, -1.0, 1.0);
    float nFine = texture2D(uNoise, (rot2 * xz) * 0.14 - wPerp * t * 0.015 * sp).r;
    ripTw = clamp(nC.a * 0.50 + nFine * 0.35 + max(fftCurv, 0.0) * 0.30, 0.0, 1.0);
    ripMicro = clamp(nB.g * 0.45 + nFine * 0.35 + (0.5 + 0.5 * fftCurv) * 0.25, 0.0, 1.0);
    ripMoon = clamp(nB.g * 0.42 + nC.a * 0.32 + (0.5 + 0.5 * fftCurv) * 0.30, 0.0, 1.0);
    ripCell = clamp(nB.a * 0.55 + nC.g * 0.50 + max(0.0, 0.75 - fftJMin) * 0.45, 0.0, 1.0);
  } else {
    vec2 swBase = normalize(mix(SWELL, wdir, 0.30));
    vec2 swSide = vec2(-swBase.y, swBase.x);
    vec2 wd1 = swBase * 0.8572 + swSide * 0.5150;
    vec2 wd2 = swBase * 0.7431 - swSide * 0.6691;
    vec2 wd3 = swBase * 0.6018 + swSide * 0.7986;
    float k1 = 0.50265, k2 = 0.80554, k3 = 1.28228;
    float nyq1 = exp(-0.5 * (k1 * fp) * (k1 * fp));
    float nyq2 = exp(-0.5 * (k2 * fp) * (k2 * fp));
    float nyq3 = exp(-0.5 * (k3 * fp) * (k3 * fp));
    float p1 = k1 * dot(wd1, xzw) - 2.2206 * t;
    float p2 = k2 * dot(wd2, xzw) - 2.8111 * t + 1.7;
    float p3 = k3 * dot(wd3, xzw) - 3.5467 * t + 3.4;
    float dispK = (0.55 + 0.55 * uSea.y + 0.45 * stormSea) * mix(0.42, 1.0, rough) * mix(0.45, 1.0, shoreCalm);
    vec2 dDisp = (-wd1 * (cos(p1) * 0.068 * nyq1) - wd2 * (cos(p2) * 0.056 * nyq2) - wd3 * (cos(p3) * 0.044 * nyq3)) * dispK;
    float dispCrest = (sin(p1) * 0.45 * nyq1 + sin(p2) * 0.35 * nyq2 + sin(p3) * 0.25 * nyq3) * mix(0.4, 1.0, shoreCalm);
    vec2 nGrad = (texture2D(uNoise, xz * 0.043 + wdir * t * 0.010 * sp).rg * 2.0 - 1.0) * 0.48
               + (texture2D(uNoise, (rot2 * xz) * 0.118 - wPerp * t * 0.015 * sp).rg * 2.0 - 1.0) * 0.32 * grazeDamp;
    dnWave = nGrad * dk + dDisp;
    dnFine = (nC.rg * 2.0 - 1.0) * 0.18 * dk * grazeDamp;
    spSlope = nGrad * 0.55 + dDisp * 0.85;
    organicCrest = clamp(crestH * 0.58 * groups + dispCrest * 0.42 + (nB.g - 0.5) * 0.30, -1.0, 1.0);
    ripTw = nC.a * 0.6 + nB.a * 0.4;
    ripMicro = nB.g * 0.55 + nC.a * 0.45;
    ripMoon = nB.g * 0.45 + nC.a * 0.35 + nA.b * 0.20;
    ripCell = nB.a * 0.6 + nC.g * 0.5;
  }
  #endif

  vec2 dn = dnWave + dnFine;
  vec2 kelSlope = vec2(0.0);
  #ifndef HB_LITE
  if (uRibbonsOn > 0.5 && (abs(kelH) > 0.004 || live.r > 0.01)) {
    vec2 wkStep = vec2(0.85) / liveSpan;
    float hx = textureLod(uWakeLive, clamp(liveUv + vec2(wkStep.x, 0.0), 0.0, 1.0), 0.0).a;
    float hz2 = textureLod(uWakeLive, clamp(liveUv + vec2(0.0, wkStep.y), 0.0, 1.0), 0.0).a;
    kelSlope = clamp(-vec2(hx - kelH, hz2 - kelH) * 2.2, vec2(-0.62), vec2(0.62)) * (1.0 - smoothstep(1.2, 3.2, fp));
  } else if (live.r > 0.01) {
    vec2 wkStep = vec2(0.9) / liveSpan;
    float rx = textureLod(uWakeLive, clamp(liveUv + vec2(wkStep.x, 0.0), 0.0, 1.0), 0.0).r;
    float rz = textureLod(uWakeLive, clamp(liveUv + vec2(0.0, wkStep.y), 0.0, 1.0), 0.0).r;
    kelSlope = clamp(-vec2(rx - live.r, rz - live.r) * 1.45, vec2(-0.55), vec2(0.55)) * (1.0 - smoothstep(1.2, 3.0, fp));
  }
  #endif
  dn += (nC.rg - 0.5) * 0.35 * clamp(trail + live.r, 0.0, 1.0) + kelSlope;

  float rainK = uPrecip.x * (1.0 - smoothstep(260.0, 680.0, camD)) * step(0.0, coast);
  float snowSpeck = 0.0;
  if (rainK + uPrecip.y > 0.01) {
    vec3 rr = rainRings(xz, t * 1.6, fp);
    dn += rr.xy * 0.52 * rainK;
    snowSpeck = rr.z * uPrecip.y * (1.0 - smoothstep(300.0, 700.0, camD)) * step(0.0, coast);
  }
  vec3 N = normalize(vec3(gN.x + dn.x, gN.y, gN.z + dn.y));
  vec3 Nsp = normalize(vec3(gN.x * 0.72 + spSlope.x + kelSlope.x * 0.6, 1.0, gN.z * 0.72 + spSlope.y + kelSlope.y * 0.6));
  float unres = smoothstep(0.35, 1.10, fp);
  #ifdef HB_LITE
  unres = 1.0;
  float spread = 0.3 * fp * fp;
  #else
  float nVar = clamp(dot(dFdx(N), dFdx(N)) + dot(dFdy(N), dFdy(N)), 0.0, 0.35);
  float spread = nVar * 0.55 + fftSlopeVar * 0.65 + 0.04 * fp * fp;
  #endif

  float quayWall = max(1.0 - smoothstep(1.2, 4.5, sdist), zm.b * (1.0 - smoothstep(2.0, 9.0, max(coast, 0.0)))) * (1.0 - zm.r);
  float natDep = min(depth, 2.5 + max(coast, 0.0) * 0.4);
  float dep = mix(natDep, max(depth, 3.2), quayWall) + (nA.r - 0.5) * mix(3.0, 1.2, quayWall);
  vec3 body = mix(uShoal, uShallow, smoothstep(0.4, 3.5, dep));
  body = mix(body, uMid, smoothstep(2.5, 9.0, dep));
  body = mix(body, uDeep, smoothstep(8.0, 22.0, dep));
  body = mix(body, uAbyss, smoothstep(20.0, 40.0, dep));
  body *= 0.93 + 0.14 * nA.g;
  float deepK = smoothstep(7.0, 30.0, dep);
  float lumB = dot(body, vec3(0.299, 0.587, 0.114));
  body = mix(body, vec3(lumB) * vec3(0.76, 0.96, 1.24), deepK * 0.24);
  body *= mix(1.0, 0.80, deepK);
  float cover = smoothstep(0.4, 0.95, uWeatherSea.x);
  lumB = dot(body, vec3(0.299, 0.587, 0.114));
  body = mix(body, vec3(lumB) * vec3(0.78, 0.98, 0.94), clamp(storm * 0.55 + cover * 0.28, 0.0, 0.70));
  body *= 1.0 - 0.24 * storm - 0.22 * cover;
  float sunUp = clamp(uSunDir.y * 3.0, 0.0, 1.0) * (1.0 - uNight);
  float sunSh = hbSeaSunShadow(vec3(xz.x, 0.0, xz.y));
  float shoalKBody = (1.0 - smoothstep(0.3, 4.5, max(dep, depth))) * (1.0 - quayWall * 0.92) * sunUp * (1.0 - cover * 0.85) * (1.0 - storm * 0.72);
  body = mix(body, uSunlitShoal, shoalKBody * (0.22 + 0.3 * smoothstep(0.3, 0.75, nA.b) + 0.1 * nC.g));
  vec3 causReef = vec3(0.0);
  float cSun = sunUp * (1.0 - cover * 0.75) * (1.0 - storm * 0.6) * sunSh;
  if (uCapReady <= 0.5) {
    float natBed = min(depth, 0.25 + max(coast, 0.0) * 0.3);
    float bedDep = max(mix(natBed, max(depth, 3.2), quayWall) + (nA.r - 0.5) * mix(1.4, 0.6, quayWall) + (nB.g - 0.5) * 0.55, 0.0);
    float clarity = (1.0 - 0.82 * storm) * (1.0 - 0.65 * cover) * (1.0 - 0.62 * uNight);
    float quayFooting = quayWall * (1.0 - smoothstep(0.0, 3.2, min(sdist, max(coast, 0.0)))) * step(-0.5, coast);
    float seeNatural = (1.0 - smoothstep(0.3, 6.8, bedDep)) * smoothstep(1.8, 5.5, sdist) * (1.0 - quayWall * 0.88) * (1.0 - 0.42 * zm.b * (1.0 - 0.35 * smoothstep(3.0, 9.0, sdist)));
    float seeBed = max(seeNatural, quayFooting * 0.42) * clarity;
    float rockN = texture2D(uNoise, xz * 0.031 + 0.17).r * 0.75 + nC.b * 0.35;
    float sandRip = 0.5 + 0.5 * sin(dot(xz, SWELL) * 2.4 + nB.g * 4.2);
    vec3 sand = mix(vec3(0.58, 0.52, 0.37), vec3(0.76, 0.69, 0.50), nB.g * 0.72 + sandRip * 0.28);
    vec3 bed = mix(sand, vec3(0.22, 0.27, 0.23) * (0.8 + 0.4 * nC.r), smoothstep(0.60, 0.78, rockN));
    vec3 mossStone = mix(vec3(0.17, 0.19, 0.16), vec3(0.11, 0.19, 0.12), smoothstep(0.35, 0.75, nB.r)) * (0.76 + 0.36 * nC.r);
    bed = mix(bed, mossStone, quayFooting * 0.88);
    bed = hbPosidonia(bed, xz, bedDep, zm.r);
    float cosT = sqrt(max(1.0 - (1.0 - V.y * V.y) * 0.5625, 0.12));
    float optLen = bedDep / cosT;
    vec3 absorb = exp(-optLen * vec3(0.46, 0.14, 0.11));
    vec3 downIrr = uAmbient * 2.0 + uSunColor * max(uSunDir.y, 0.0) * 0.18 * sunSh * hbCloudShadow(xz) * (1.0 - uNight);
    float bedLight = clamp(dot(downIrr, vec3(0.2126, 0.7152, 0.0722)) * 0.95, 0.0, 1.0);
    vec3 seen = bed * absorb * mix(vec3(1.0), uSunlitShoal * 1.45, 0.32 * (1.0 - quayWall)) * mix(vec3(bedLight), uAmbient * 0.85, uNight);
    float cs = 1.0 - smoothstep(160.0, 620.0, camD);
    float cGain = cSun * (1.0 - smoothstep(0.2, 6.5, bedDep));
    cGain *= (1.0 - hullOcc * 0.92);
    vec3 causRgb = vec3(0.0);
    if (cGain > 0.0 && cs > 0.0) {
      vec3 refV = refract(-V, N, 0.75);
      float cDep = min(bedDep, 6.5);
      vec2 bedXZ = xz + refV.xz * (cDep / max(-refV.y, 0.25)) + dnWave * (0.35 + 0.42 * cDep);
      vec2 cUv1 = bedXZ * 0.054 + wdir * t * 0.013;
      vec2 cUv2 = (rot2 * bedXZ) * 0.082 - wPerp * t * 0.011 + 0.37;
      #ifdef HB_LITE
      float v1 = textureGrad(uRipple, cUv1, dx * 0.054, dy * 0.054).b;
      float v2 = textureGrad(uRipple, cUv2, (rot2 * dx) * 0.082, (rot2 * dy) * 0.082).b;
      #else
      float v1 = textureGrad(uNoise, cUv1, dx * 0.054, dy * 0.054).b;
      float v2 = textureGrad(uNoise, cUv2, (rot2 * dx) * 0.082, (rot2 * dy) * 0.082).b;
      #endif
      float caus = clamp(v1 * v2 * 2.1 + (v1 * v1 + v2 * v2) * 0.28, 0.0, 1.5) * cs;
      causRgb = vec3(caus);
    }
    causReef = cGain > 0.0 ? causRgb * (1.0 - hullOcc * 0.92) : vec3(0.0);
    seen *= 0.86 + 0.14 * smoothstep(0.35, 0.65, nC.g);
    seen += uSunColor * causRgb * absorb * 0.56 * cGain;
    body = mix(body, seen * mix(0.95, 1.0, sunUp), seeBed * 0.70);
  }
  body = hbSeaTone(body, zm.b, zm.r, dep, sdist, sunUp, nA.b, camD);
  vec3 preLift = body;
  body = hbBasinLift(body, zm.b, zm.r, dep, coast);
  body = mix(body, preLift, quayWall * 0.82);
  body *= 1.0 - zm.b * (1.0 - smoothstep(1.0, 9.0, max(coast, 0.0))) * max(cover * 0.34, storm * 0.30) * (1.0 - uNight);
  if (uCapReady <= 0.5) {
    float shelfNoise = nA.b * 0.48 + nB.g * 0.36 + nC.g * 0.16;
    float shoalDepth = max(0.30, min(depth, 0.55 + max(coast, 0.0) * 0.26) + (0.5 - shelfNoise) * 3.4);
    float ledgeProx = (1.0 - smoothstep(0.4, 11.5, max(coast, 0.0))) * smoothstep(0.14, 0.55, zm.r);
    float ledgeTex = smoothstep(0.42, 0.74, nB.r * 0.60 + nC.b * 0.50);
    float rockLedge = clamp(ledgeProx * (0.62 + 0.38 * ledgeTex) + ledgeTex * smoothstep(0.32, 0.82, zm.r) * 0.42, 0.0, 1.0);
    float sandBar = smoothstep(0.36, 0.74, shelfNoise) * smoothstep(0.22, 0.78, zm.r) * (1.0 - rockLedge * 0.78);
    float shoalRip = 0.5 + 0.5 * sin(dot(xz, SWELL) * 2.4 + nB.g * 4.0);
    vec3 deepCobalt = vec3(0.035, 0.19, 0.36);
    vec3 emeraldShelf = mix(vec3(0.05, 0.42, 0.44), vec3(0.10, 0.58, 0.52), smoothstep(0.2, 0.8, nA.g));
    vec3 turqSand = mix(vec3(0.18, 0.72, 0.65), vec3(0.36, 0.86, 0.76), clamp(sandBar * 0.85 + shoalRip * 0.18, 0.0, 1.0)) * exp(-shoalDepth * vec3(0.32, 0.08, 0.06));
    vec3 limestone = vec3(0.09, 0.19, 0.18) * (0.72 + 0.48 * nC.r);
    vec3 turq = mix(deepCobalt, emeraldShelf, smoothstep(0.10, 0.50, zm.r));
    turq = mix(turq, turqSand, clamp(sandBar * 0.90 + (1.0 - smoothstep(1.0, 4.8, shoalDepth)) * 0.30, 0.0, 0.92));
    turq = mix(turq, limestone, rockLedge * 0.74);
    turq += causReef * vec3(0.62, 0.96, 0.88) * exp(-shoalDepth * vec3(0.30, 0.08, 0.06)) * cSun * (0.38 + 0.28 * sandBar) * (1.0 - smoothstep(0.8, 7.0, shoalDepth));
    turq = mix(turq, vec3(dot(turq, vec3(0.299, 0.587, 0.114))) * vec3(0.86, 1.0, 0.98), cover * 0.45) * (1.0 - 0.15 * cover);
    float reefK = zm.r * (0.55 + 0.45 * smoothstep(0.35, 0.7, nA.b + 0.25 * nC.g));
    body = mix(body, turq * mix(1.0, 0.22, uNight), reefK * (0.62 - 0.25 * uNight));
  } else if (zm.r > 0.01) {
    vec3 shoalScatter = mix(vec3(0.04, 0.38, 0.42), vec3(0.12, 0.62, 0.56), smoothstep(0.2, 0.8, nA.g));
    shoalScatter = mix(shoalScatter, vec3(dot(shoalScatter, vec3(0.299, 0.587, 0.114))) * vec3(0.86, 1.0, 0.98), cover * 0.45) * (1.0 - 0.15 * cover);
    body = mix(body, shoalScatter * mix(1.0, 0.24, uNight), zm.r * (0.50 - 0.20 * uNight));
  }
  float quayOcc = (1.0 - smoothstep(0.0, 2.8, max(coast, 0.0))) * step(-0.5, coast) * (0.20 + 0.16 * zm.b);
  float pierOcc = (1.0 - smoothstep(0.0, 1.6, sdist)) * 0.22;
  body *= 1.0 - max(quayOcc, pierOcc);
  float churnTint = clamp(trail * 0.25 + live.r * 0.34 + ribChurn * 0.24 * (0.6 + 0.55 * nB.g), 0.0, 0.38);
  body = mix(body, uSunlitShoal * 1.15 * mix(1.0, 0.42, uNight), churnTint);
  body *= (1.0 - hullOcc * 0.46) * (1.0 - 0.12 * slick);
  body = hbSeaGolden(body, sunSh, sunUp);
  body = hbSeaHour(body);
  // day/night exposure of the unlit tint
  float bodyGain = mix(0.95, 0.36, uNight);
  body *= bodyGain;
  body = mix(body, body * normalize(uAmbient + 1e-4) * 1.6, uNight * 0.6);

  float dbgViewPath = 0.0;
  vec3 dbgT = vec3(1.0);
  float dbgCaus = 0.0;
  float refrMask = (1.0 - smoothstep(460.0, 550.0, length(xz - uSceneCenter))) * (1.0 - smoothstep(1350.0, 1750.0, camD));
  if (uCapReady > 0.5 && refrMask > 0.001) {
    vec3 deepScatter = body;
    vec2 screenUv = gl_FragCoord.xy / max(uCapSize, vec2(1.0));
    float zW = hbLinearDepth(gl_FragCoord.z, uCapNearFar);
    float d0 = textureLod(uCapDepth, screenUv, 0.0).r;
    float z0 = hbLinearDepth(d0, uCapNearFar);
    float rawD = d0 >= 0.9999 ? 40.0 : max(z0 - zW, 0.0);
    vec2 viewN = (mat3(viewMatrix) * vec3(N.x, N.y - 1.0, N.z)).xy;
    float refrScale = clamp(rawD * 0.032, 0.0, 0.055) * (1.0 - smoothstep(180.0, 620.0, camD));
    vec2 refrUv = clamp(screenUv + viewN * refrScale, vec2(0.002), vec2(0.998));
    float zS_ndc = textureLod(uCapDepth, refrUv, 0.0).r;
    float zS = hbLinearDepth(zS_ndc, uCapNearFar);
    vec4 bedClip = uCapInvVP * vec4(refrUv * 2.0 - 1.0, zS_ndc * 2.0 - 1.0, 1.0);
    vec3 P_bed = bedClip.xyz / max(bedClip.w, 1e-5);
    bool validBed = (zS_ndc < 0.9999) && (zS <= 1400.0) && (zS >= zW + 0.02) && (P_bed.y <= vWorld.y - 0.04) && (fwdD <= uHorizonDist * 0.95);
    if (!validBed) {
      refrUv = screenUv;
      zS_ndc = d0;
      zS = z0;
      bedClip = uCapInvVP * vec4(refrUv * 2.0 - 1.0, zS_ndc * 2.0 - 1.0, 1.0);
      P_bed = bedClip.xyz / max(bedClip.w, 1e-5);
      validBed = (zS_ndc < 0.9999) && (zS <= 1400.0) && (zS >= zW + 0.02) && (P_bed.y <= vWorld.y - 0.04) && (fwdD <= uHorizonDist * 0.95);
    }
    float viewPath = validBed ? distance(vWorld, P_bed) : 40.0;
    if (viewPath > 75.0) validBed = false;
    vec3 capRgb = deepScatter;
    if (validBed) {
      ivec2 capDim = textureSize(uCapColor, 0);
      ivec2 capPx = clamp(ivec2(floor(refrUv * vec2(capDim))), ivec2(0), capDim - ivec2(1));
      capRgb = clamp(texelFetch(uCapColor, capPx, 0).rgb, vec3(0.0), vec3(32.0));
    }
    float vertDepth = validBed ? max(vWorld.y - P_bed.y, 0.0) : max(depth, 1.5);
    if (!validBed) viewPath = max(vertDepth / max(V.y, 0.25), 1.5);
    float sunPath = vertDepth / max(uSunDir.y, 0.25);
    float optPath = viewPath + 0.65 * sunPath;
    vec3 sigma = vec3(0.42, 0.125, 0.075);
    sigma = mix(sigma, vec3(0.46, 0.155, 0.135), zm.b);
    sigma = mix(sigma, vec3(0.28, 0.075, 0.062), zm.r);
    sigma *= 1.0 + 0.95 * storm + 0.35 * cover;
    vec3 T = exp(-optPath * sigma);
    dbgViewPath = viewPath;
    dbgT = T;
    vec3 causAdd = vec3(0.0);
    float cGate = sunUp * (1.0 - cover * 0.75) * (1.0 - storm * 0.6)
      * smoothstep(0.12, 0.65, vertDepth)
      * (1.0 - smoothstep(0.5, 7.5, vertDepth))
      * (1.0 - smoothstep(160.0, 560.0, camD))
      * (1.0 - 0.22 * zm.b)
      * (1.0 - hullOcc * 0.92);
    if (validBed && cGate > 0.001) {
      #ifdef HB_LITE
      float bedLum = dot(capRgb, vec3(0.2126, 0.7152, 0.0722));
      float ambLum = max(dot(uAmbient, vec3(0.2126, 0.7152, 0.0722)), 0.05);
      float litRatio = smoothstep(ambLum * 0.38, ambLum * 1.12, bedLum);
      float quayShade = 0.0;
      if (sdist < 6.0 && inside > 0.0) {
        const float eL = 0.004;
        float gx = textureLod(uSdf, clamp(suv + vec2(eL, 0.0), 0.0, 1.0), 2.0).r - textureLod(uSdf, clamp(suv - vec2(eL, 0.0), 0.0, 1.0), 2.0).r;
        float gz = textureLod(uSdf, clamp(suv + vec2(0.0, eL), 0.0, 1.0), 2.0).r - textureLod(uSdf, clamp(suv - vec2(0.0, eL), 0.0, 1.0), 2.0).r;
        float gl = length(vec2(gx, gz));
        if (gl > 1e-4) {
          vec2 sn = vec2(gx, gz) / gl;
          quayShade = (1.0 - smoothstep(0.0, 5.5, sdist)) * (1.0 - smoothstep(-0.15, 0.35, dot(sn, normalize(uSunDir.xz + vec2(1e-4)))));
        }
      }
      float bedSunSh = litRatio * (1.0 - quayShade * 0.88) * hbCloudShadow(P_bed.xz);
      #else
      float bedSunSh = hbSeaSunShadow(P_bed);
      #endif
      float cVis = cGate * bedSunSh;
      if (cVis > 0.001) {
        vec3 R_mean = refract(-uSunDir, vec3(0.0, 1.0, 0.0), 0.75);
        vec2 cXZ = P_bed.xz + R_mean.xz * ((-3.0 - P_bed.y) / min(R_mean.y, -0.15));
        vec3 causRgb = vec3(0.0);
        #ifdef HB_LITE
        vec2 vUv1 = P_bed.xz * 0.054 + wdir * t * 0.013;
        vec2 vUv2 = (rot2 * P_bed.xz) * 0.082 - wPerp * t * 0.011 + 0.37;
        float v1 = textureGrad(uRipple, vUv1, dx * 0.054, dy * 0.054).b;
        float v2 = textureGrad(uRipple, vUv2, (rot2 * dx) * 0.082, (rot2 * dy) * 0.082).b;
        causRgb = vec3(clamp(min(v1, v2) * 2.2, 0.0, 1.4));
        #else
        float cIn = 0.0;
        if (uCausticMode > 1.5) {
          vec2 cuv = (cXZ - uCausticBounds.xy) / max(uCausticBounds.zw - uCausticBounds.xy, vec2(1.0));
          vec2 ce = min(cuv, 1.0 - cuv);
          cIn = smoothstep(0.0, 0.06, min(ce.x, ce.y));
          if (cIn > 0.001) {
            float cG = textureLod(uCausticMap, clamp(cuv, vec2(0.001), vec2(0.999)), 0.0).r;
            if (camD < 180.0) {
              vec2 disp = normalize(uSunDir.xz + vec2(1e-4)) * 0.00055 * (1.0 - smoothstep(90.0, 180.0, camD));
              float cR = textureLod(uCausticMap, clamp(cuv + disp, vec2(0.001), vec2(0.999)), 0.0).r;
              float cB = textureLod(uCausticMap, clamp(cuv - disp, vec2(0.001), vec2(0.999)), 0.0).r;
              causRgb = vec3(cR, cG, cB);
            } else {
              causRgb = vec3(cG);
            }
          }
        }
        if (cIn < 0.999) {
          float hConv = 0.0;
          if (uFftOn > 0.5) {
            float fc1 = textureLod(uFftAtlas, vec3(cXZ * uFftScales.y, 4.0), 0.0).b;
            float fc2 = textureLod(uFftAtlas, vec3(cXZ * uFftScales.z, 5.0), 0.0).b;
            float fHess = (fc1 * 0.55 + fc2 * 0.85) * clamp(vertDepth * 0.45, 0.35, 1.6);
            hConv = smoothstep(0.04, 0.52, max(fHess, 0.0));
          } else {
            float hScale = clamp(vertDepth, 0.6, 4.5) * (1.4 + 2.2 * amp);
            hConv = smoothstep(0.05, 0.55, max(-hbWaveHessian(cXZ, t, hScale), 0.0));
          }
          vec2 rUv1 = cXZ * 0.058 + wdir * t * 0.013;
          vec2 rUv2 = (rot2 * cXZ) * 0.086 - wPerp * t * 0.011 + 0.37;
          float s1 = textureGrad(uNoise, rUv1, dx * 0.058, dy * 0.058).b;
          float s2 = textureGrad(uNoise, rUv2, (rot2 * dx) * 0.086, (rot2 * dy) * 0.086).b;
          float rShim = min(s1, s2) * 1.45 + s1 * s2 * 0.95;
          vec3 hessRgb = vec3(clamp(hConv * (0.65 + 0.90 * rShim) + rShim * 0.25, 0.0, 1.5));
          causRgb = mix(hessRgb, causRgb, cIn);
        }
        #endif
        dbgCaus = causRgb.g;
        causAdd = uSunColor * causRgb * 0.52 * cVis;
      }
    }
    float shoreFeather = validBed ? smoothstep(0.0, 0.18, viewPath) : 1.0;
    vec3 refrBody = mix(capRgb, (capRgb + causAdd) * T + deepScatter * (1.0 - T), shoreFeather);
    body = mix(deepScatter, refrBody, refrMask);
  }

`;
