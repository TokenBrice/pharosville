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
  // shading-only domain warp (the displacement and CPU heightAt are untouched): the crossing plane waves
  // would otherwise read as a regular diamond lattice across the mid-distance and the overview
  vec2 xzw = xz + (vec2(nA.g, nA.b) - 0.5) * 18.0 + (vec2(nB.b, nB.r) - 0.5) * 3.0;
  float groups = 0.45 + 1.1 * smoothstep(0.2, 0.8, nA.r * 0.7 + texture2D(uNoise, xz * 0.0011 + vec2(t * 0.0009, 0.0)).b * 0.5);
  // shading exaggerates a calm swell (soft-capped so rough seas don't turn to mirrors), in wave groups
  float ampShade = 0.9 * (1.0 - exp(-amp * mix(2.6, 2.0, far01) / 0.9));
  vec3 gS; float crestH;
  gerstnerSums(xzw, t, gS, crestH);
  vec3 gN = gerstnerNormalOf(gS, ampShade * groups);
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  float sp = 0.6 + 1.2 * wind;
  vec4 r1 = texture2D(uRipple, xz * 0.043 + wdir * t * 0.010 * sp);
  vec4 r2 = texture2D(uRipple, (rot * xz) * 0.107 - vec2(wdir.y, -wdir.x) * t * 0.014 * sp);
  vec4 r3 = texture2D(uRipple, (rot * rot * xz) * 0.0093 + wdir * t * 0.0025);
  vec4 r4 = texture2D(uRipple, (rot * xz.yx) * 0.0061 - wdir * t * 0.0017 + 0.37);
  r3 = mix(r3, r4, 0.5 + 0.35 * (nA.r - 0.5) * 2.0);
  vec2 d1 = r1.rg * 2.0 - 1.0, d2 = r2.rg * 2.0 - 1.0, d3 = r3.rg * 2.0 - 1.0;
  float shoreCalm = mix(0.45, 1.0, smoothstep(1.0, 18.0, coast)) * (1.0 - 0.3 * zm.b);
  float dk = (0.16 + 0.12 * uSea.y) * rough * shoreCalm;
  vec2 dn = (d1 * (1.0 - far01 * 0.7) + d2 * 0.75 * (1.0 - far01) + d3 * (0.45 + 0.5 * far01)) * dk;
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
  vec3 Nsp = normalize(vec3(gN.x + (d1.x + d2.x * 1.4) * 0.5, 1.0, gN.z + (d1.y + d2.y * 1.4) * 0.5)); // sharp, for sparkle
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
  // weather: an overcast, rough sea turns grey-green and darker
  float storm = smoothstep(0.3, 0.85, uSea.x);
  float cover = smoothstep(0.4, 0.95, uWeatherSea.x);
  lumB = dot(body, vec3(0.299, 0.587, 0.114));
  body = mix(body, vec3(lumB) * vec3(0.86, 1.0, 0.98), clamp(storm * 0.5 + cover * 0.25, 0.0, 0.65));
  body *= 1.0 - 0.18 * storm - 0.22 * cover;
  float sunUp = clamp(uSunDir.y * 3.0, 0.0, 1.0) * (1.0 - uNight);
  // 02-L1: the key light's shadow on the flat sea plane (displacement would only add acne); sun-lit terms only
  float sunSh = hbSeaSunShadow(vec3(xz.x, 0.0, xz.y));   // (soft, thin casters dissolved: sun-shadow.ts)
  // A graft: sunlit teal shallows (light reaching the sand)
  float shoalK = (1.0 - smoothstep(0.3, 4.5, max(dep, depth))) * sunUp;
  body = mix(body, uSunlitShoal, shoalK * (0.22 + 0.3 * smoothstep(0.3, 0.75, nA.b) + 0.1 * nC.g));
  // clear shallows: the bed (sand with rock patches) shows through the turquoise, red absorbed first,
  // with a drifting caustic net on it in sunlight. Overcast, storms and night cloud the view.
  {
    // a gentle shelf off every natural shore (quay walls and moles drop straight to depth instead)
    float bedDep = max(min(depth, 0.25 + max(coast, 0.0) * 0.3) + (nA.r - 0.5) * 1.6 + (nB.g - 0.5) * 0.6, 0.0);
    float clarity = (1.0 - 0.75 * storm) * (1.0 - 0.45 * cover) * (1.0 - 0.6 * uNight);
    // (the harbours' lee water hides its bed, except off natural shores clear of the quay walls: sandy shallows)
    float seeBed = (1.0 - smoothstep(0.3, 7.0, bedDep)) * clarity * smoothstep(1.5, 7.0, sdist) * (1.0 - 0.65 * zm.b * (1.0 - 0.2 * smoothstep(4.0, 10.0, sdist)));
    float rockN = texture2D(uNoise, xz * 0.031 + 0.17).r * 0.75 + nC.b * 0.35;
    vec3 sand = mix(vec3(0.62, 0.55, 0.40), vec3(0.74, 0.67, 0.50), nB.g);
    vec3 bed = mix(sand, vec3(0.26, 0.30, 0.26) * (0.8 + 0.4 * nC.r), smoothstep(0.62, 0.78, rockN));
    bed = hbPosidonia(bed, xz, bedDep, zm.r);
    vec3 absorb = exp(-bedDep * vec3(0.55, 0.17, 0.13));
    vec3 seen = bed * absorb * mix(vec3(1.0), uSunlitShoal * 1.6, 0.35);
    // caustics only ever appear scaled by cGain: with no sun (uniform, so the branch is coherent and the
    // derivatives inside stay defined) they are exactly zero, so skip their taps
    float cSun = sunUp * (1.0 - cover * 0.7);
    float caus = 0.0;
    if (cSun > 0.0) {
      float cs = 1.0 - smoothstep(180.0, 650.0, camD);
      vec2 cuv = xz * 0.043;
      float cA = texture2D(uNoise, cuv + t * vec2(0.011, 0.007)).g;
      float cB = texture2D(uNoise, (rot * cuv) * 1.19 - t * vec2(0.006, -0.009) + 0.5).g;
      caus = hbNet(cA, cB, 0.06) * cs * (0.55 + 0.45 * smoothstep(0.3, 0.7, nC.g));
    }
    float cGain = cSun * (1.0 - smoothstep(0.2, 5.5, bedDep));
    seen *= 0.85 + 0.15 * smoothstep(0.35, 0.65, nC.g);
    seen += vec3(1.0, 0.97, 0.85) * uSunColor * caus * 0.05 * cGain;
    body = mix(body, seen * mix(0.95, 1.0, sunUp), seeBed * 0.62);
    body += uSunlitShoal * caus * 0.10 * cGain * (1.0 - seeBed * 0.5) * (1.0 - smoothstep(0.5, 5.0, dep));
  }
  body = hbSeaTone(body, zm.b, zm.r, dep, sdist, sunUp, nA.b, camD);
  body = hbBasinLift(body, zm.b, zm.r, dep, coast);
  // the Shoals: clear turquoise water over the reef shelf, bright by day, a pale jade glimmer at night
  {
    float reefK = zm.r * (0.55 + 0.45 * smoothstep(0.35, 0.7, nA.b + 0.25 * nC.g));
    vec3 turq = mix(vec3(0.10, 0.62, 0.56), vec3(0.20, 0.78, 0.66), nA.g);
    // E01: under a storm deck (the DEWS cover) the reef greys with the sea, a step lighter: no cyan glow under slate
    turq = mix(turq, vec3(dot(turq, vec3(0.299, 0.587, 0.114))) * vec3(0.86, 1.0, 0.98), cover * 0.45) * (1.0 - 0.15 * cover);
    body = mix(body, turq * mix(1.0, 0.3, uNight), reefK * (0.62 - 0.25 * uNight));
  }
  // churned wake water is lighter and greener
  body = mix(body, uShoal * 1.35 * mix(1.0, 0.45, uNight), clamp(trail * 0.25 + live.r * 0.38, 0.0, 0.35));
  // hull occlusion (+ the waterline meniscus), and the lee slick's satin: a touch darker, a cleaner mirror below
  body *= (1.0 - min(live.b, 1.0) * 0.4) * (1.0 - 0.12 * slick);
  // swell and ripple relief: facets tilted toward the key light read lighter (zero-mean, so the tint holds)
  {
    vec3 Lk = normalize(uSunDir + vec3(0.0, 0.6, 0.0));
    float relief = dot(N, Lk) - Lk.y;
    body *= 1.0 + clamp(relief * 2.2, -0.35, 0.35) * (1.0 - far01 * 0.6);
  }
  body = hbSeaGolden(body, sunSh, sunUp);
  body = hbSeaHour(body);
  // day/night exposure of the unlit tint
  float bodyGain = mix(0.95, 0.36, uNight);
  body *= bodyGain;
  body = mix(body, body * normalize(uAmbient + 1e-4) * 1.6, uNight * 0.6);

`;
