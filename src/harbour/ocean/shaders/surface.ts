import { GUST_GLSL } from "../../weather/gust";
import { CLOUD_SHADOW_GLSL } from "../../sky/cloud-shadow";
import { SEA_TONE_GLSL } from "../sea-tone";
import { SUN_SHADOW_GLSL } from "../../world/sun-shadow";
import { SEA_GOLDEN_GLSL } from "../sea-golden";
import { SEA_HELIO_GLSL } from "../sea-helio";
import { SWELL_DIR, wavesGLSL } from "../waves";

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
uniform sampler2D uDynPoolTex;  // S-2 seam: dynamic boat/Titan night water pools (same bounds as uWakeLive)
uniform vec4 uDynPool;          // x = intensity (0 = off)
uniform float uWindowGlow;
uniform vec2 uSceneCenter;
uniform float uSceneRadius;
varying vec3 vWorld;
varying float vDamp;
${wavesGLSL()}
${CLOUD_SHADOW_GLSL}
${SEA_TONE_GLSL}
${SUN_SHADOW_GLSL}
${SEA_GOLDEN_GLSL}
${SEA_HELIO_GLSL}

const vec2 SWELL = vec2(${SWELL_DIR[0].toFixed(5)}, ${SWELL_DIR[1].toFixed(5)});

vec3 band(float th, float e, float lod) {
  vec2 uv = vec2((th - uSkyBandRange.x) / (uSkyBandRange.y - uSkyBandRange.x), (e - uSkyBandRange.z) / (uSkyBandRange.w - uSkyBandRange.z));
  vec3 c = textureLod(uSkyBand, clamp(uv, vec2(0.002), vec2(0.998)), lod).rgb;
  // above the band: continue to the zenith
  return mix(c, uZenith, smoothstep(uSkyBandRange.w - 2.0, uSkyBandRange.w + 18.0, e));
}
float wrapPi(float a) { return atan(sin(a), cos(a)); }
// rain on the water: rings spreading from random drops on two offset lattices (slope xy, z = fresh drop)
vec3 rainRings(vec2 xz, float t, float cell) {
  vec3 acc = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    vec2 p = xz / cell + float(l) * vec2(0.37, 0.71);
    vec2 id = floor(p), f = fract(p) - 0.5;
    float h = fract(sin(dot(id + float(l) * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(h * 91.7);
    float ph = fract(t * (0.9 + 0.5 * h2) + h);
    vec2 c = (vec2(h, h2) - 0.5) * 0.5;
    vec2 d = f - c;
    float r = length(d);
    float rad = ph * 0.48;
    float dr = (r - rad) / 0.07;
    float ring = sin((r - rad) * 40.0) * exp(-dr * dr) * (1.0 - ph) * (1.0 - ph);
    acc.xy += d / max(r, 1e-3) * ring;
    acc.z += (1.0 - smoothstep(0.0, 0.05, r)) * (1.0 - smoothstep(0.0, 0.2, ph));
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

  vec4 nA = texture2D(uNoise, xz * 0.0023);
  vec4 nB = texture2D(uNoise, xz * 0.017 + t * vec2(0.0035, -0.0026));
  vec4 nC = texture2D(uNoise, xz * 0.093 + t * vec2(0.012, 0.004));

  // cat's paws (see above)
  vec2 pawUv = xz * 0.0019 - wdir * t * (0.004 + 0.012 * wind);
  float paws = smoothstep(0.38, 0.7, texture2D(uNoise, pawUv).g * 0.7 + texture2D(uNoise, pawUv * 2.7 + 0.3).b * 0.45);
  paws = max(paws, hbGust(xz, uGust.w, uGust.xy) * (0.55 + 0.45 * uGust.z));
  float rough = mix(0.35, 1.0, paws) * (0.75 + 0.5 * wind);
  // a rain-pitted sea loses its mirror
  rough *= 1.0 + 0.6 * uPrecip.x;
  float windSea = smoothstep(0.6, 1.0, wind);
  rough *= (1.0 - 0.38 * zm.b) * (1.0 + 0.3 * zm.a);
  float slick = live.a;
  rough *= 1.0 - 0.7 * slick;

  // ---------------------------------------------------------------- normals
  float far01 = smoothstep(250.0, 1300.0, camD);
  float fp = length(fwidth(xz));
  float amp = uSea.x * vDamp;
  // shading-only domain warp (displacement and CPU heightAt stay untouched): curves primary Gerstner crests
  // into natural wave groups so golden-hour grazing reflections never band into horizontal zebra stripes
  vec2 xzw = xz + ((vec2(nA.g, nA.b) - 0.5) * 28.0 + (vec2(nB.b, nB.r) - 0.5) * 6.5) * (0.35 + 0.65 * vDamp);
  float groups = 0.52 + 0.85 * smoothstep(0.18, 0.82, nA.r * 0.7 + texture2D(uNoise, xz * 0.0011 + vec2(t * 0.0009, 0.0)).b * 0.5);
  float storm = smoothstep(0.3, 0.85, uSea.x);
  // a storm's sea: the declared sea state or a gale (DEWS Warning/Danger wind), whichever is rougher
  float stormSea = max(storm, windSea);
  // restrained swell-normal exaggeration: calm/moderate seas stay silky and faceted; a storm sea gets the full heave back
  float shadeCap = mix(0.58, 0.9, stormSea);
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
  // (filtered early over distance, footprint and low grazing angles so mid-range golden sea flows like liquid silk)
  float graze = smoothstep(0.14, 0.42, max(V.y, 0.0));
  float grazeDamp = 0.35 + 0.65 * graze;
  float shoreCalm = mix(0.42, 1.0, smoothstep(1.0, 18.0, coast)) * (1.0 - 0.34 * zm.b);
  float dk = (0.17 + 0.13 * uSea.y) * rough * shoreCalm;
  // (full tier) intermediate non-collinear gravity chop + close-range micro-ripple capillary facets
  vec2 dM = vec2(0.0);
  float rMa = 0.5;
  vec2 dFine = vec2(0.0);
  #ifndef HB_LITE
  vec4 rM = texture2D(uRipple, (rot2 * rot * xz) * 0.0235 + (wdir * 0.55 + wPerp * 0.83) * t * 0.0062 * sp + 0.19);
  dM = rM.rg * 2.0 - 1.0;
  rMa = rM.a;
  float fineVis = (1.0 - smoothstep(0.05, 0.17, fp)) * (1.0 - smoothstep(95.0, 270.0, camD)) * grazeDamp;
  if (fineVis > 0.01) {
    vec4 rF = texture2D(uRipple, (rot * xz.yx) * 0.23 - (wdir * 0.72 - wPerp * 0.69) * t * 0.024 * sp + 0.53);
    dFine = (rF.rg * 2.0 - 1.0) * fineVis;
  }
  #endif
  // separate resolved medium wave trains (dnWave) from fine close-up capillary detail (dnFine)
  // (a storm keeps its wind chop out to the heart view: the damping is for calm golden water)
  #ifdef HB_LITE
  float midCap = 0.0;
  #else
  float midCap = max((1.0 - smoothstep(110.0, 380.0, camD)) * (1.0 - smoothstep(0.09, 0.26, fp)) * grazeDamp, stormSea * (1.0 - far01));
  #endif
  vec2 dnWave = (d1 * (0.76 - far01 * 0.48) * (0.65 + 0.35 * graze) + dM * (0.66 - 0.22 * far01) + d3 * (0.58 + 0.38 * far01)) * dk;
  vec2 dnFine = (d2 * mix(0.46, 0.75, stormSea) * midCap + dFine * 0.22) * dk;
  vec2 dn = dnWave + dnFine;
  // organic 3D wave height combining primary swell with non-collinear chop (for SSS & crest shading)
  float organicCrest = clamp(crestH * 0.55 + (r3.a - 0.5) * 0.85 + (rMa - 0.5) * 0.65 + (nB.g - 0.5) * 0.45, -1.0, 1.0);
  // wakes rough up the surface
  dn += (d2 - d1) * 0.25 * clamp(trail + live.r, 0.0, 1.0);
  // rain rings (and snowflakes landing): near the camera only, where a ring is a few pixels wide
  float rainK = uPrecip.x * (1.0 - smoothstep(380.0, 900.0, camD)) * step(0.0, coast);
  float snowSpeck = 0.0;
  if (rainK + uPrecip.y > 0.01) {
    vec3 rr = rainRings(xz, t * 1.6, 2.3);
    dn += rr.xy * 0.55 * rainK;
    snowSpeck = rr.z * uPrecip.y * (1.0 - smoothstep(300.0, 700.0, camD)) * step(0.0, coast);
  }
  vec3 N = normalize(vec3(gN.x + dn.x, gN.y, gN.z + dn.y));
  vec2 spSlope = (d1 * (0.85 - far01 * 0.4) + d2 * 1.1 * midCap + dFine * 0.72 + dM * 0.55) * 0.44;
  vec3 Nsp = normalize(vec3(gN.x * 0.72 + spSlope.x, 1.0, gN.z * 0.72 + spSlope.y)); // crisp capillary facets for sparkle
  float unres = smoothstep(0.12, 0.35, fp);
  #ifdef HB_LITE
  unres = 1.0;
  #endif
  float spread = 0.3 * fp * fp;

  // ---------------------------------------------------------------- body (unlit depth tint)
  // apparent depth: the bathymetry, shoaling a little toward every coast so the channel reads deepest
  float dep = min(depth, 2.5 + max(coast, 0.0) * 0.4) + (nA.r - 0.5) * 3.0;
  vec3 body = mix(uShoal, uShallow, smoothstep(0.4, 3.5, dep));
  body = mix(body, uMid, smoothstep(2.5, 9.0, dep));
  body = mix(body, uDeep, smoothstep(8.0, 22.0, dep));
  body = mix(body, uAbyss, smoothstep(20.0, 40.0, dep));
  body *= 0.93 + 0.14 * nA.g;
  // deep water: restrained slate-blue (desaturated, darker), the shallows keep their teal
  float deepK = smoothstep(7.0, 30.0, dep);
  float lumB = dot(body, vec3(0.299, 0.587, 0.114));
  body = mix(body, vec3(lumB) * vec3(0.88, 1.0, 1.18), deepK * 0.42);
  body *= mix(1.0, 0.78, deepK);
  // weather: an overcast, rough sea turns grey-green and darker (storm: defined with the swell shading above)
  float cover = smoothstep(0.4, 0.95, uWeatherSea.x);
  lumB = dot(body, vec3(0.299, 0.587, 0.114));
  body = mix(body, vec3(lumB) * vec3(0.86, 1.0, 0.98), clamp(storm * 0.5 + cover * 0.25, 0.0, 0.65));
  body *= 1.0 - 0.18 * storm - 0.22 * cover;
  float sunUp = clamp(uSunDir.y * 3.0, 0.0, 1.0) * (1.0 - uNight);
  // 02-L1: the key light's shadow on the flat sea plane (displacement would only add acne); sun-lit terms only
  float sunSh = hbSeaSunShadow(vec3(xz.x, 0.0, xz.y));   // (soft, thin casters dissolved: sun-shadow.ts)
  // A graft: sunlit teal shallows (light reaching the sand — suppressed cleanly under storm/overcast decks)
  float shoalK = (1.0 - smoothstep(0.3, 4.5, max(dep, depth))) * sunUp * (1.0 - cover * 0.85) * (1.0 - storm * 0.72);
  body = mix(body, uSunlitShoal, shoalK * (0.22 + 0.3 * smoothstep(0.3, 0.75, nA.b) + 0.1 * nC.g));
  // clear shallows: sandy/rocky seabed, submerged quay stone footings, and crisp animated sunlight caustics
  float causReef = 0.0;
  float cSun = sunUp * (1.0 - cover * 0.75) * (1.0 - storm * 0.6) * sunSh;
  {
    float bedDep = max(min(depth, 0.25 + max(coast, 0.0) * 0.3) + (nA.r - 0.5) * 1.4 + (nB.g - 0.5) * 0.55, 0.0);
    float clarity = (1.0 - 0.82 * storm) * (1.0 - 0.65 * cover) * (1.0 - 0.58 * uNight);
    // sheltered inner-harbour quays reveal clear turquoise/jade water and darkened submerged stone footings in clear weather
    float quayFooting = zm.b * (1.0 - smoothstep(0.2, 4.0, max(coast, 0.0))) * step(-0.5, coast);
    float seeNatural = (1.0 - smoothstep(0.3, 7.0, bedDep)) * smoothstep(1.2, 6.0, sdist) * (1.0 - 0.42 * zm.b * (1.0 - 0.35 * smoothstep(3.0, 9.0, sdist)));
    float seeBed = max(seeNatural, quayFooting * 0.68) * clarity;
    float rockN = texture2D(uNoise, xz * 0.031 + 0.17).r * 0.75 + nC.b * 0.35;
    vec3 sand = mix(vec3(0.62, 0.55, 0.40), vec3(0.75, 0.68, 0.51), nB.g);
    vec3 bed = mix(sand, vec3(0.24, 0.29, 0.25) * (0.8 + 0.4 * nC.r), smoothstep(0.60, 0.78, rockN));
    // submerged dressed limestone footings along sheltered stone quays
    vec3 stoneFooting = vec3(0.24, 0.25, 0.22) * (0.78 + 0.32 * nC.r);
    bed = mix(bed, stoneFooting, quayFooting * (1.0 - smoothstep(0.5, 3.2, max(coast, 0.0))) * 0.82);
    bed = hbPosidonia(bed, xz, bedDep, zm.r);
    float cosT = sqrt(max(1.0 - (1.0 - V.y * V.y) * 0.5625, 0.12));
    float optLen = bedDep / cosT;
    vec3 absorb = exp(-optLen * vec3(0.46, 0.14, 0.11));
    vec3 downLight = uAmbient * 0.85 + uSunColor * max(uSunDir.y, 0.0) * 0.45 * sunSh * hbCloudShadow(xz) * (1.0 - uNight);
    vec3 seen = bed * downLight * absorb;
    // crisp refracted sunlight caustic filaments. Explicit gradients keep the conditional reads safe; the nets run
    // after the lanes reconverge (the Shoals reef reads them too, past the bed's own depth gain)
    float cs = 1.0 - smoothstep(160.0, 620.0, camD);
    float cGain = cSun * (1.0 - smoothstep(0.2, 6.5, bedDep));
    float cA = 0.0, cB = 0.0;
    if (cGain > 0.0 && cs > 0.0) {
      vec2 cw = (vec2(nB.r, nB.g) - 0.5) * 0.085;
      vec2 cuv = xz * 0.056 + cw;
      cA = textureGrad(uNoise, cuv + t * vec2(0.013, 0.008), dx * 0.056, dy * 0.056).g;
      cB = textureGrad(uNoise, (rot2 * cuv) * 1.24 - t * vec2(0.007, -0.011) + 0.5, (rot2 * dx) * (0.056 * 1.24), (rot2 * dy) * (0.056 * 1.24)).g;
    }
    float caus = hbNet(cA, cB, 0.06) * cs * (0.55 + 0.45 * smoothstep(0.3, 0.7, nC.g));
    #ifndef HB_LITE
    caus = clamp(caus * 1.1 + hbNet(cA * 0.8 + nC.g * 0.25, 1.0 - cB * 0.9, 0.058) * 0.5 * cs, 0.0, 1.3);
    #endif
    causReef = cGain > 0.0 ? caus : 0.0;
    seen *= 0.86 + 0.14 * smoothstep(0.35, 0.65, nC.g);
    seen += vec3(0.88, 1.0, 0.94) * uSunColor * caus * 0.20 * cGain;
    body = mix(body, seen * mix(0.95, 1.0, sunUp), seeBed * 0.66);
    body += mix(uSunlitShoal, vec3(0.58, 0.98, 0.90), 0.40) * caus * 0.28 * cGain * (1.0 - seeBed * 0.32) * (1.0 - smoothstep(0.4, 6.5, dep));
  }
  body = hbSeaTone(body, zm.b, zm.r, dep, sdist, sunUp, nA.b, camD);
  body = hbBasinLift(body, zm.b, zm.r, dep, coast);
  // under a heavy storm/overcast deck, calm the pale shallow quay rim into deep moody slate-teal
  body *= 1.0 - zm.b * (1.0 - smoothstep(1.0, 9.0, max(coast, 0.0))) * max(cover * 0.34, storm * 0.30) * (1.0 - uNight);
  // the Shoals: jewel-like layered Mediterranean reef (submerged limestone ledges -> turquoise sandbars -> emerald shelf -> deep cobalt)
  {
    float reefMask = smoothstep(0.08, 0.86, zm.r);
    float shelfNoise = nA.b * 0.48 + nB.g * 0.36 + nC.g * 0.16;
    float shoalDepth = max(0.30, min(depth, 0.55 + max(coast, 0.0) * 0.26) + (0.5 - shelfNoise) * 3.4);
    // darker submerged limestone rock ledges hugging the shoal rocks & reef outcrops
    float ledgeProx = (1.0 - smoothstep(0.4, 11.5, max(coast, 0.0))) * smoothstep(0.14, 0.55, zm.r);
    float ledgeTex = smoothstep(0.42, 0.74, nB.r * 0.60 + nC.b * 0.50);
    float rockLedge = clamp(ledgeProx * (0.62 + 0.38 * ledgeTex) + ledgeTex * smoothstep(0.32, 0.82, zm.r) * 0.42, 0.0, 1.0);
    // rippled luminous aquamarine sandbars vs deeper emerald-jade reef channels
    float sandBar = smoothstep(0.36, 0.74, shelfNoise) * smoothstep(0.22, 0.78, zm.r) * (1.0 - rockLedge * 0.78);
    vec3 deepCobalt = vec3(0.035, 0.19, 0.36);
    vec3 emeraldShelf = mix(vec3(0.05, 0.42, 0.44), vec3(0.10, 0.58, 0.52), smoothstep(0.2, 0.8, nA.g));
    vec3 turqSand = mix(vec3(0.18, 0.74, 0.66), vec3(0.36, 0.88, 0.77), sandBar) * exp(-shoalDepth * vec3(0.26, 0.06, 0.05));
    vec3 limestone = vec3(0.09, 0.19, 0.18) * (0.72 + 0.48 * nC.r);
    vec3 turq = mix(deepCobalt, emeraldShelf, smoothstep(0.10, 0.50, zm.r));
    turq = mix(turq, turqSand, clamp(sandBar * 0.90 + (1.0 - smoothstep(1.0, 4.8, shoalDepth)) * 0.30, 0.0, 0.92));
    turq = mix(turq, limestone, rockLedge * 0.74);
    // crisp dancing sunlit caustics across the shallow sandbars & rock ledges
    turq += vec3(0.60, 0.98, 0.90) * causReef * cSun * (0.32 + 0.22 * sandBar) * (1.0 - smoothstep(0.8, 7.0, shoalDepth));
    // E01: under a storm deck (the DEWS cover) the reef greys with the sea, a step lighter: no cyan glow under slate
    turq = mix(turq, vec3(dot(turq, vec3(0.299, 0.587, 0.114))) * vec3(0.86, 1.0, 0.98), cover * 0.45) * (1.0 - 0.15 * cover);
    // (the reef's reach and weight are analytical: the Shoals zone, as upstream draws it; the overhaul colours it)
    float reefK = zm.r * (0.55 + 0.45 * smoothstep(0.35, 0.7, nA.b + 0.25 * nC.g));
    body = mix(body, turq * mix(1.0, 0.3, uNight), reefK * (0.62 - 0.25 * uNight));
  }
  // waterline contact occlusion: gently darkens submerged stone footings, pier pilings and cliff bases
  float quayOcc = (1.0 - smoothstep(0.0, 2.8, max(coast, 0.0))) * step(-0.5, coast) * (0.20 + 0.16 * zm.b);
  float pierOcc = (1.0 - smoothstep(0.0, 1.6, sdist)) * 0.22;
  body *= 1.0 - max(quayOcc, pierOcc);
  // churned wake water is lighter and greener
  body = mix(body, uShoal * 1.35 * mix(1.0, 0.45, uNight), clamp(trail * 0.25 + live.r * 0.38, 0.0, 0.35));
  // hull occlusion (+ the waterline meniscus), and the lee slick's satin: a touch darker, a cleaner mirror below
  body *= (1.0 - min(live.b, 1.0) * 0.46) * (1.0 - 0.12 * slick);
  // swell and ripple relief: facets tilted toward the key light read lighter (gentle, organic, never zebra-striped)
  {
    vec3 Lk = normalize(uSunDir + vec3(0.0, 0.65, 0.0));
    float relief = dot(N, Lk) - Lk.y;
    float relK = mix(0.18, 0.35, stormSea);
    body *= 1.0 + clamp(relief * mix(1.45, 2.2, stormSea), -relK, relK) * (1.0 - far01 * 0.65);
  }
  body = hbSeaGolden(body, sunSh, sunUp);
  body = hbSeaHour(body);
  // day/night exposure of the unlit tint
  float bodyGain = mix(0.95, 0.36, uNight);
  body *= bodyGain;
  body = mix(body, body * normalize(uAmbient + 1e-4) * 1.6, uNight * 0.6);

`;
