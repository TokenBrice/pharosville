import { GUST_GLSL } from "../../weather/gust";
import { CLOUD_SHADOW_GLSL } from "../../sky/cloud-shadow";
import { SEA_TONE_GLSL } from "../sea-tone";
import { SUN_SHADOW_GLSL } from "../../world/sun-shadow";
import { SEA_GOLDEN_GLSL } from "../sea-golden";
import { SEA_HELIO_GLSL } from "../sea-helio";
import { SWELL_DIR, WAVES, wavesGLSL } from "../waves";

function waveHessianGLSL(): string {
  const f = (v: number) => v.toFixed(6);
  let body = "";
  for (const wv of WAVES) {
    body += `  s -= ${f(wv.k * wv.k * wv.amp)} * sin(${f(wv.k)} * dot(vec2(${f(wv.dirX)}, ${f(wv.dirZ)}), p) - ${f(wv.w)} * t);\n`;
  }
  return `float hbWaveHessian(vec2 p, float t, float amp) { float s = 0.0;\n${body}  return s * amp; }`;
}

/**
 * The sea surface: fields, normals and the unlit body. (Shader text ships in the first-frame bytes, so the longer notes
 * live here.) Roughness: cat's paws are drifting patches of wind-roughened water against glassy slicks, and the shared
 * gust field's paws join them (the patches that heel the hulls roughen the water they cross); a rain-pitted sea loses
 * its mirror; from Warning up the DEWS wind raises a wind sea (whitecaps and spindrift) of its own; the harbours lie in
 * the lee (calmer, glassier) while the Roads catch the open-sea wind; lee slicks behind still hulls (wake live A,
 * decorative) are glassy satin water where the ripple drops away. E12/E13: `fp` is the water a pixel covers (m, DPR-aware, unlike camD): Kelvin foam fades by it, and the
 * ripple facets finer than the pixel (`unres`) glint off the swell normal with lobes widened by `spread` (sea-tone.ts
 * hbLobe); the Low tier reads the calm normals only. E11: hbSeaHour lays the hour's light on the body (sea-tone.ts).
 * E02: past the island's coasts the SDF's coast and depth fade to open water (sea-sdf.ts SDF_ISLAND_RADII), so the
 * retired mainland leaves no pale shoal or foam line on the sea; structures, buoys and the zones are untouched.
 */
export const OCEAN_SURFACE = /* glsl */ `
uniform float uTime, uNight;
uniform vec3 uCameraPos, uSunDir, uSunColor, uAmbient, uZenith;
uniform vec4 uSea;
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
uniform sampler2D uWake, uWakeLive;
uniform vec4 uWakeBounds;
uniform sampler2D uZones;     // P6 D18 sea zones: R shoals, G far ports, B harbour waters, A the roads (zone-mask.ts)
uniform sampler2D uNoise, uRipple;
uniform vec3 uAbyss, uDeep, uMid, uShallow, uShoal, uSunlitShoal, uFoamCol, uFoamNight;
// sky (shared from the sky service)
uniform sampler2D uSkyBand;
uniform vec4 uSkyBandRange;
uniform float uFwdAz, uHorizonDist, uHorizonDepr;
uniform vec3 uGlintDir, uGlintCol;
uniform vec4 uWeatherSea;     // cover, wind, wind dir x, wind dir z
uniform vec2 uPrecip;         // rain, snow intensity (weather director)
uniform vec4 uGust;           // F-wind gust field: dir x, dir z, DEWS strength, time (weather/gust.ts)
${GUST_GLSL}
// beam (shared from the beam system)
uniform vec3 uBeamPos, uBeamCol;
uniform float uBeamAngle;
uniform vec4 uBeamShape;
uniform vec4 uBeamSun;     // 05-P2 heliograph: rgb sun × mirror × gain (0 by night / overcast), w landing distance
uniform float uDebug;
// town lights (lights system's top-down pool RT): reflected in the water at night
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
uniform sampler2D uCapColor, uCapDepth, uCausticMap;
uniform float uCapReady, uCausticMode;
uniform vec2 uCapNearFar, uCapSize;
uniform mat4 uCapInvVP;
uniform vec4 uCausticBounds;
varying vec3 vWorld;
varying float vDamp;
${wavesGLSL()}
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
  // above the band: continue to the zenith
  return mix(c, uZenith, smoothstep(uSkyBandRange.w - 2.0, uSkyBandRange.w + 18.0, e));
}
float wrapPi(float a) { return atan(sin(a), cos(a)); }
// rain on the water: dual-scale AA ripples (1.35 m & 2.15 m, rotated lattices) avoiding grid donuts
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
// anti-aliased thin network where two drifting fields cross (caustics on the bed, lace in the foam)
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
  // depth along the view: the backdrop is a flat card, so the haze line must be straight too
  float fwdD = dot(-toCam.xz, vec2(sin(uFwdAz), -cos(uFwdAz)));
  vec3 V = normalize(toCam);
  float t = uTime;
  float wind = uWeatherSea.y;
  vec2 wdir = normalize(uWeatherSea.zw + 1e-4);

  // ---------------------------------------------------------------- fields
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
  float trail = texture2D(uWake, wuv).r * winside;
  vec4 live = texture2D(uWakeLive, wuv) * winside;
  // §6.1.5 SDF mip-2 shoreline outward normal (smooths 8-bit quantization) for exposure surf & Shoals wrapping
  vec2 shoreN = vec2(0.0);
  float shoreExp = 0.85;
  #ifndef HB_LITE
  if (coast < 28.0 && inside > 0.0) {
    const float eS = 0.004;
    float sPx = textureLod(uSdf, clamp(suv + vec2(eS, 0.0), 0.0, 1.0), 2.0).r;
    float sMx = textureLod(uSdf, clamp(suv - vec2(eS, 0.0), 0.0, 1.0), 2.0).r;
    float sPz = textureLod(uSdf, clamp(suv + vec2(0.0, eS), 0.0, 1.0), 2.0).r;
    float sMz = textureLod(uSdf, clamp(suv - vec2(0.0, eS), 0.0, 1.0), 2.0).r;
    vec2 sg = vec2(sPx - sMx, sPz - sMz);
    float sgL = length(sg);
    if (sgL > 1e-4) {
      shoreN = sg / sgL;
      vec2 waveIn = normalize(mix(SWELL, wdir, 0.35 * wind));
      shoreExp = mix(0.45, 1.25, smoothstep(-0.65, 0.65, dot(shoreN, -waveIn)));
    }
  }
  #endif

  vec4 nA = texture2D(uNoise, xz * 0.0023);
  vec4 nB = texture2D(uNoise, xz * 0.017 + t * vec2(0.0035, -0.0026));
  vec4 nC = texture2D(uNoise, xz * 0.093 + t * vec2(0.012, 0.004));

  // cat's paws (see above)
  vec2 pawUv = xz * 0.0019 - wdir * t * (0.004 + 0.012 * wind);
  float paws = smoothstep(0.38, 0.7, texture2D(uNoise, pawUv).g * 0.7 + texture2D(uNoise, pawUv * 2.7 + 0.3).b * 0.45);
  paws = max(paws, hbGust(xz, uGust.w, uGust.xy) * (0.55 + 0.45 * uGust.z));
  paws = mix(paws, 0.35, uNight * 0.60);
  float rough = mix(0.35, 1.0, paws) * (0.75 + 0.5 * wind);
  // a rain-pitted sea loses its mirror
  rough *= 1.0 + 0.6 * uPrecip.x;
  float windSea = smoothstep(0.6, 1.0, wind);
  float storm = smoothstep(0.3, 0.85, uSea.x);
  // a storm's sea: the declared sea state or a gale (DEWS Warning/Danger wind), whichever is rougher
  float stormSea = max(storm, windSea);
  // relax inner-basin shelter in gales (0.30 calm -> 0.14 gale) so storm basins churn visibly
  rough *= (1.0 - mix(0.30, 0.14, stormSea) * zm.b) * (1.0 + 0.3 * zm.a);
  float slick = live.a;
  rough *= 1.0 - 0.7 * slick;

  // ---------------------------------------------------------------- normals
  float far01 = smoothstep(250.0, 1300.0, camD);
  float fp = length(fwidth(xz));
  float amp = uSea.x * vDamp;
  // §6.1.1 mild ±2.4 m crest-tangent group warp preserves coherent Gerstner wave trains (eliminates carpet static)
  vec2 swellTan = vec2(-SWELL.y, SWELL.x);
  vec2 xzw = xz + (swellTan * ((nA.g - 0.5) * 4.8 + (nB.b - 0.5) * 1.4) + SWELL * ((nA.b - 0.5) * 1.3)) * (0.35 + 0.65 * vDamp);
  float groups = 0.55 + 0.82 * smoothstep(0.18, 0.82, nA.r * 0.7 + texture2D(uNoise, xz * 0.0011 + vec2(t * 0.0009, 0.0)).b * 0.5);
  // restrained swell-normal exaggeration: calm/moderate seas stay silky and faceted; a storm sea gets the full heave back
  float shadeCap = mix(0.76, 1.0, stormSea);
  float ampShade = shadeCap * (1.0 - exp(-amp * mix(mix(1.75, 1.25, far01), mix(2.6, 2.0, far01), stormSea) / shadeCap));
  vec3 gS; float crestH;
  gerstnerSums(xzw, t, gS, crestH);
  vec3 gN = gerstnerNormalOf(gS, ampShade * groups);
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  mat2 rot2 = mat2(0.54, 0.84, -0.84, 0.54);
  float sp = 0.6 + 1.2 * wind;
  vec2 wPerp = vec2(-wdir.y, wdir.x);
  vec4 r1 = texture2D(uRipple, xz * 0.043 + wdir * t * 0.010 * sp);
  #ifdef HB_LITE
  vec4 r2 = texture2D(uRipple, (rot * rot * xz) * 0.0093 + wdir * t * 0.0025);
  vec4 r3 = r2;                    // (Lite: the coarse tap stands in for the coarse ripple downstream)
  vec2 d1 = r1.rg * 2.0 - 1.0, d2 = r2.rg * 2.0 - 1.0, d3 = d2;
  #else
  vec4 r2 = texture2D(uRipple, (rot2 * xz) * 0.118 - wPerp * t * 0.015 * sp);
  vec4 r3 = texture2D(uRipple, (rot * rot * xz) * 0.0115 + (nA.rg - 0.5) * 0.14 + wdir * t * 0.0028);
  vec4 r4 = texture2D(uRipple, (rot2 * xz.yx) * 0.0068 - wdir * t * 0.0019 + 0.37);
  r3 = mix(r3, r4, 0.5 + 0.35 * (nA.r - 0.5) * 2.0);
  vec2 d1 = r1.rg * 2.0 - 1.0, d2 = r2.rg * 2.0 - 1.0, d3 = r3.rg * 2.0 - 1.0;
  #endif
  // intermediate non-collinear gravity chop + close-range micro-ripple capillary facets
  float graze = smoothstep(0.14, 0.42, max(V.y, 0.0));
  float grazeDamp = 0.35 + 0.65 * graze;
  float shoreCalm = mix(0.55, 1.0, smoothstep(1.0, 14.0, coast)) * (1.0 - mix(0.22, 0.08, stormSea) * zm.b);
  float dk = (0.17 + 0.13 * uSea.y) * rough * shoreCalm;
  // (full tier) 3 analytical dispersive medium-swell wavelets (λ = 12.5, 7.8, 4.9 m, ω = sqrt(g·k), Nyquist-filtered)
  vec2 dM = vec2(0.0);
  vec2 dFine = vec2(0.0);
  vec2 dDisp = vec2(0.0);
  float dispCrest = 0.0;
  #ifndef HB_LITE
  vec4 rM = texture2D(uRipple, (rot2 * rot * xz) * 0.0235 + (wdir * 0.55 + wPerp * 0.83) * t * 0.0062 * sp + 0.19);
  dM = rM.rg * 2.0 - 1.0;
  {
    vec2 swBase = normalize(mix(SWELL, wdir, 0.30));
    vec2 swSide = vec2(-swBase.y, swBase.x);
    // fanned +31 deg, -42 deg, +53 deg around primary swell/wind; deep-water dispersion ω = sqrt(9.81 * k)
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
    dDisp = (-wd1 * (cos(p1) * 0.068 * nyq1) - wd2 * (cos(p2) * 0.056 * nyq2) - wd3 * (cos(p3) * 0.044 * nyq3)) * dispK;
    dispCrest = (sin(p1) * 0.45 * nyq1 + sin(p2) * 0.35 * nyq2 + sin(p3) * 0.25 * nyq3) * mix(0.4, 1.0, shoreCalm);
    // subtle shoaling refraction of wave facets wrapping around Shoals rocks
    float refK = (1.0 - smoothstep(1.0, 22.0, max(coast, 0.0))) * smoothstep(0.15, 0.6, zm.r);
    if (refK > 0.01 && dot(shoreN, shoreN) > 0.5) {
      float rPh = coast * 0.52 - hbSwellPhase(xz, t);
      dDisp += shoreN * (-cos(rPh) * 0.08 * refK * nyq1);
    }
  }
  float fineVis = (1.0 - smoothstep(0.05, 0.17, fp)) * (1.0 - smoothstep(95.0, 270.0, camD)) * grazeDamp;
  if (fineVis > 0.01) {
    vec4 rF = texture2D(uRipple, (rot * xz.yx) * 0.23 - (wdir * 0.72 - wPerp * 0.69) * t * 0.024 * sp + 0.53);
    dFine = (rF.rg * 2.0 - 1.0) * fineVis;
  }
  #endif
  // separate resolved medium wave trains (dnWave) from fine close-up capillary detail (dnFine)
  #ifdef HB_LITE
  float midCap = 0.0;
  #else
  float midCap = max((1.0 - smoothstep(110.0, 380.0, camD)) * (1.0 - smoothstep(0.09, 0.26, fp)) * grazeDamp, stormSea * (1.0 - far01));
  #endif
  vec2 dnWave = (d1 * (0.76 - far01 * 0.48) * (0.65 + 0.35 * graze) + dM * (0.66 - 0.22 * far01) + d3 * (0.58 + 0.38 * far01)) * dk + dDisp;
  vec2 dnFine = (d2 * mix(0.46, 0.75, stormSea) * midCap + dFine * 0.22) * dk;
  vec2 dn = dnWave + dnFine;
  float organicCrest = clamp(crestH * 0.54 * groups + dispCrest * 0.40 + (r3.a - 0.5) * 0.50 + (nB.g - 0.5) * 0.36, -1.0, 1.0);
  // §6.2.1 directional Kelvin wave-slope normals (2-tap finite difference of uWakeLive.r, gated inside live.r > 0.01)
  vec2 kelSlope = vec2(0.0);
  #ifndef HB_LITE
  if (live.r > 0.01) {
    vec2 wkStep = vec2(0.9) / (uWakeBounds.zw - uWakeBounds.xy);
    float rx = textureLod(uWakeLive, wuv + vec2(wkStep.x, 0.0), 0.0).r;
    float rz = textureLod(uWakeLive, wuv + vec2(0.0, wkStep.y), 0.0).r;
    kelSlope = clamp(-vec2(rx - live.r, rz - live.r) * 1.45, vec2(-0.55), vec2(0.55)) * (1.0 - smoothstep(1.2, 3.0, fp));
  }
  #endif
  // wakes rough up the surface and tilt normals along directional Kelvin V-arms
  dn += (d2 - d1) * 0.25 * clamp(trail + live.r, 0.0, 1.0) + kelSlope;
  // rain rings (and snowflakes landing): near the camera only, dual-scale AA ripples
  float rainK = uPrecip.x * (1.0 - smoothstep(260.0, 680.0, camD)) * step(0.0, coast);
  float snowSpeck = 0.0;
  if (rainK + uPrecip.y > 0.01) {
    vec3 rr = rainRings(xz, t * 1.6, fp);
    dn += rr.xy * 0.52 * rainK;
    snowSpeck = rr.z * uPrecip.y * (1.0 - smoothstep(300.0, 700.0, camD)) * step(0.0, coast);
  }
  vec3 N = normalize(vec3(gN.x + dn.x, gN.y, gN.z + dn.y));
  vec2 spSlope = (d1 * (0.85 - far01 * 0.4) + d2 * 1.1 * midCap + dFine * 0.72 + dM * 0.55) * 0.44 + dDisp * 0.85 + kelSlope * 0.6;
  vec3 Nsp = normalize(vec3(gN.x * 0.72 + spSlope.x, 1.0, gN.z * 0.72 + spSlope.y)); // crisp capillary facets for sparkle
  float unres = smoothstep(0.35, 1.10, fp);
  #ifdef HB_LITE
  unres = 1.0;
  float spread = 0.3 * fp * fp;
  #else
  float nVar = clamp(dot(dFdx(N), dFdx(N)) + dot(dFdy(N), dFdy(N)), 0.0, 0.35);
  float spread = nVar * 0.55 + 0.04 * fp * fp;
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
  float shoalK = (1.0 - smoothstep(0.3, 4.5, max(dep, depth))) * (1.0 - quayWall * 0.92) * sunUp * (1.0 - cover * 0.85) * (1.0 - storm * 0.72);
  body = mix(body, uSunlitShoal, shoalK * (0.22 + 0.3 * smoothstep(0.3, 0.75, nA.b) + 0.1 * nC.g));
  float hullOcc = min(live.b, 1.0);
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
      float v1 = textureGrad(uRipple, cUv1, dx * 0.054, dy * 0.054).b;
      float v2 = textureGrad(uRipple, cUv2, (rot2 * dx) * 0.082, (rot2 * dy) * 0.082).b;
      float caus = clamp(v1 * v2 * 2.1 + (v1 * v1 + v2 * v2) * 0.28, 0.0, 1.5) * cs;
      causRgb = vec3(caus);
      #ifndef HB_LITE
      float dispK = (1.0 - smoothstep(120.0, 220.0, camD)) * smoothstep(0.25, 2.0, cDep);
      if (dispK > 0.01) {
        vec2 disp = (normalize(uSunDir.xz + 1e-4) * 0.0085 + dnWave * 0.014) * dispK;
        float v1r = textureGrad(uRipple, cUv1 + disp, dx * 0.054, dy * 0.054).b;
        float v1b = textureGrad(uRipple, cUv1 - disp, dx * 0.054, dy * 0.054).b;
        float v2r = textureGrad(uRipple, cUv2 + rot2 * disp * 1.3, (rot2 * dx) * 0.082, (rot2 * dy) * 0.082).b;
        float v2b = textureGrad(uRipple, cUv2 - rot2 * disp * 1.3, (rot2 * dx) * 0.082, (rot2 * dy) * 0.082).b;
        float cR = clamp(v1r * v2r * 2.1 + (v1r * v1r + v2r * v2r) * 0.28, 0.0, 1.5) * cs;
        float cB = clamp(v1b * v2b * 2.1 + (v1b * v1b + v2b * v2b) * 0.28, 0.0, 1.5) * cs;
        causRgb = mix(causRgb, vec3(cR, caus, cB), 0.72);
      }
      #endif
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
    float reefMask = smoothstep(0.08, 0.86, zm.r);
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
  body = mix(body, uShoal * 1.35 * mix(1.0, 0.45, uNight), clamp(trail * 0.25 + live.r * 0.38, 0.0, 0.35));
  body *= (1.0 - hullOcc * 0.46) * (1.0 - 0.12 * slick);
  body = hbSeaGolden(body, sunSh, sunUp);
  body = hbSeaHour(body);
  // day/night exposure of the unlit tint
  float bodyGain = mix(0.95, 0.36, uNight);
  body *= bodyGain;
  body = mix(body, body * normalize(uAmbient + 1e-4) * 1.6, uNight * 0.6);

  float refrMask = (1.0 - smoothstep(460.0, 550.0, length(xz - uSceneCenter))) * (1.0 - smoothstep(1350.0, 1750.0, camD));
  if (uCapReady > 0.5 && refrMask > 0.001) {
    vec3 deepScatter = body;
    vec2 screenUv = gl_FragCoord.xy / max(uCapSize, vec2(1.0));
    float zW = hbLinearDepth(gl_FragCoord.z, uCapNearFar);
    float d0 = textureLod(uCapDepth, screenUv, 0.0).r;
    float z0 = hbLinearDepth(d0, uCapNearFar);
    float rawD = d0 >= 0.9999 ? 40.0 : max(z0 - zW, 0.0);
    // Project wave slope perturbation (N - up) into view space: zero constant bias on flat water (Neon #1)
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
    // Fetch the exact integer texel matching the validated NEAREST uCapDepth sample (zero bilinear foreground bleed, Astra #1)
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
    vec3 causAdd = vec3(0.0);
    float cGate = sunUp * (1.0 - cover * 0.75) * (1.0 - storm * 0.6)
      * smoothstep(0.12, 0.65, vertDepth)
      * (1.0 - smoothstep(0.5, 7.5, vertDepth))
      * (1.0 - smoothstep(160.0, 560.0, camD))
      * (1.0 - 0.22 * zm.b)
      * (1.0 - hullOcc * 0.92);
    if (validBed && cGate > 0.001) {
      #ifdef HB_LITE
      // Low tier skips SeaShadowMask (sun.test.ts contract): derive architectural shadow occlusion from
      // captured bed irradiance (shadow-mapped stone/terrain) + shaded quay-side SDF gradient + clouds.
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
        if (uCausticMode > 0.5 && cIn < 0.999) {
          float hScale = clamp(vertDepth, 0.6, 4.5) * (1.4 + 2.2 * amp);
          float hess = -hbWaveHessian(cXZ, t, hScale);
          float hConv = smoothstep(0.05, 0.55, max(hess, 0.0));
          vec2 rUv1 = cXZ * 0.058 + wdir * t * 0.013;
          vec2 rUv2 = (rot2 * cXZ) * 0.086 - wPerp * t * 0.011 + 0.37;
          float s1 = textureGrad(uRipple, rUv1, dx * 0.058, dy * 0.058).b;
          float s2 = textureGrad(uRipple, rUv2, (rot2 * dx) * 0.086, (rot2 * dy) * 0.086).b;
          float rShim = min(s1, s2) * 1.45 + s1 * s2 * 0.95;
          vec3 hessRgb = vec3(clamp(hConv * (0.55 + 0.85 * rShim) + rShim * 0.35, 0.0, 1.5));
          causRgb = mix(hessRgb, causRgb, cIn);
        } else if (uCausticMode <= 0.5) {
          vec2 vUv1 = P_bed.xz * 0.054 + wdir * t * 0.013;
          vec2 vUv2 = (rot2 * P_bed.xz) * 0.082 - wPerp * t * 0.011 + 0.37;
          float v1 = textureGrad(uRipple, vUv1, dx * 0.054, dy * 0.054).b;
          float v2 = textureGrad(uRipple, vUv2, (rot2 * dx) * 0.082, (rot2 * dy) * 0.082).b;
          causRgb = vec3(clamp(min(v1, v2) * 2.2, 0.0, 1.4));
        }
        // Single downwelling sun leg (T already carries 0.65 * sunPath + viewPath, Opus #4 / Neon #6)
        causAdd = uSunColor * causRgb * 0.52 * cVis;
      }
    }
    float shoreFeather = validBed ? smoothstep(0.0, 0.18, viewPath) : 1.0;
    vec3 refrBody = mix(capRgb, (capRgb + causAdd) * T + deepScatter * (1.0 - T), shoreFeather);
    body = mix(deepScatter, refrBody, refrMask);
  }

`;
