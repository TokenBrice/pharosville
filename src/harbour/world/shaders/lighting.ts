import { LAMP_WAVE_GLSL } from "../../lights/lamp-wave";

export const GLSL_ENV = /* glsl */ `
#ifndef HB_DECL_UNIGHT
#define HB_DECL_UNIGHT
uniform float uNight;
#endif
uniform vec3 uNightLift;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uHorizon;
uniform float uRimK;
// environment specular: cerulean sky-dome Fresnel above the horizon & warm Alexandrian limestone bounce below
vec3 hbEnvSpec(vec3 n, vec3 v, float rough, float f0) {
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  vec3 r = reflect(-v, n);
  float spread = mix(0.06, 0.42, rough);
  vec3 ground = uHemiGround * vec3(1.10, 1.00, 0.86) * 0.68;
  vec3 skyDome = mix(uHorizon * 0.72, uHemiSky * 1.12, smoothstep(0.0, 0.58, r.y));
  vec3 sky = mix(ground, skyDome, smoothstep(-0.18 - spread * 0.35, 0.05 + spread * 0.45, r.y));
  float fr = f0 + (max(1.0 - rough, f0) - f0) * pow(1.0 - ndv, 4.6);
  return sky * fr / (1.0 + rough * rough * 0.3);
}
// warm Alexandrian limestone bounced fill in shaded colonnades, walls & hollows
vec3 hbBounceFill(vec3 albedo, vec3 n, vec3 sunDir, vec3 sunColor, float occ, float night) {
  #ifdef HB_LITE
  return vec3(0.0);
  #endif
  float daySun = smoothstep(-0.02, 0.14, sunDir.y) * (1.0 - night);
  if (daySun <= 1e-4) return vec3(0.0);
  float sunL = min(dot(sunColor, vec3(0.2126, 0.7152, 0.0722)), 2.8);
  float under = 1.0 - smoothstep(-0.35, 0.68, n.y);
  float shadeSide = 1.0 - smoothstep(-0.2, 0.55, dot(n, sunDir));
  vec3 sunTint = min(sunColor / max(sunL, 0.15), vec3(1.8));
  vec3 lime = mix(vec3(0.96, 0.81, 0.58), sunTint * vec3(1.06, 0.94, 0.74), 0.5);
  return albedo * lime * sunL * under * (0.32 + 0.68 * shadeSide) * mix(0.45, 1.0, occ) * daySun * 0.072;
}
// Mediterranean foliage subsurface translucency: restrained wrapped diffuse + sun-warmed olive-emerald backlit transmission
vec3 hbFoliageSSS(vec3 albedo, vec3 n, vec3 v, vec3 sunDir, vec3 sunColor, float occ, float cloudShadow, float snow, float night) {
  float day = smoothstep(-0.03, 0.08, sunDir.y) * (1.0 - night * 0.88) * (1.0 - snow * 0.85);
  if (day <= 1e-4) return vec3(0.0);
  float sunL = dot(sunColor, vec3(0.2126, 0.7152, 0.0722));
  if (sunL <= 1e-4) return vec3(0.0);
  float ndl = dot(n, sunDir);
  // restrained wrap (0.28) keeps sculptural sunlit-top vs shaded-underside 3D crown volume
  float wrapDelta = max(0.0, (ndl + 0.28) / 1.28) - max(ndl, 0.0);
  vec3 leafTint = mix(albedo, albedo * vec3(1.04, 1.12, 0.86), 0.42);
  vec3 wrapCol = leafTint * sunColor * (wrapDelta * 0.31831) * mix(0.38, 1.0, occ) * cloudShadow;
  #ifdef HB_LITE
  return wrapCol * day;
  #else
  float low = 1.0 - smoothstep(0.06, 0.48, sunDir.y);
  float veryLow = 1.0 - smoothstep(0.02, 0.22, sunDir.y);
  float back = pow(clamp(dot(v, -sunDir + n * 0.45), 0.0, 1.0), 3.0);
  float thin = 0.52 + 0.48 * (1.0 - abs(n.y));
  // preserve a chromatic blue floor (>= 0.74) and cap yellow saturation under low dawn/dusk sun so backlit
  // pines & olives glow authentic warm olive-emerald, never electric lemon-chartreuse
  vec3 rawHue = min(sunColor / max(sunL, 1e-4), vec3(1.65));
  float hueL = dot(rawHue, vec3(0.2126, 0.7152, 0.0722));
  vec3 calmHue = mix(rawHue, vec3(hueL), 0.36 + 0.36 * veryLow);
  calmHue.b = max(calmHue.b, 0.74 * hueL);
  vec3 transTint = mix(albedo, albedo * vec3(1.04, 1.16, 0.80), 0.48);
  float dawnEase = 0.52 + 0.48 * smoothstep(0.02, 0.16, sunDir.y);
  vec3 transCol = transTint * calmHue * min(sunL, 2.4) * back * thin * mix(0.22, 0.46, low) * dawnEase * mix(0.45, 1.0, occ) * cloudShadow;
  vec3 tot = (wrapCol + transCol) * day;
  float lTot = dot(tot, vec3(0.2126, 0.7152, 0.0722));
  tot = mix(vec3(lTot), tot, mix(0.88, 0.68, veryLow));
  return tot * min(1.0, 0.44 / max(lTot, 1e-4));
  #endif
}
`;

export const GLSL_POOL = /* glsl */ `
${LAMP_WAVE_GLSL}
uniform sampler2D uPoolTex;
uniform vec4 uPoolBounds;
uniform float uWindowGlow;
uniform float uLampFar;   // the decorative lamps' share of their light at this zoom (1 at the landing, lights-system.ts)
// projected light pools: rgb = additive irradiance on up-facing surfaces, a = source height
vec3 hbPool(vec3 worldPos, vec3 worldN) {
  if (uWindowGlow <= 0.02) return vec3(0.0); // the final smoothstep is exactly zero
  vec2 uv = (worldPos.xz - uPoolBounds.xy) * uPoolBounds.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec3(0.0);
  vec4 p = texture2D(uPoolTex, uv);
  p.rgb *= min(1.0, 0.5 / max(dot(p.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4));   // overlapping lamps: a sane max
  float upw = smoothstep(0.2, 0.85, worldN.y);
  float below = 1.0 - smoothstep(p.a - 0.4, p.a + 0.6, worldPos.y);  // floors: only under the source
  float dy = (worldPos.y - p.a) / 2.6;
  float band = exp(-dy * dy);                                         // walls: around the source height
  // the lamplighting wave (05-P3): a pool lies by its lamp, so the fragment's own rank stands in for the lamp's
  #ifdef HB_LITE
  return p.rgb * mix(band * 0.6, below, upw) * smoothstep(0.02, 0.55, uWindowGlow) * uLampFar;   // (Low: no lamplighting wave)
  #else
  return p.rgb * mix(band * 0.6, below, upw) * smoothstep(0.02, 0.55, hbLampGlow(uWindowGlow, hbLampRank(worldPos, 0.5))) * uLampFar;
  #endif
}
`;

export const GLSL_AO = /* glsl */ `
uniform sampler2D uAOTex;
uniform vec4 uAOBounds;   // (minX, maxZ, 1/sizeX, 1/sizeZ) of the island height field
float hbHeight(vec2 xz) { return texture2D(uAOTex, vec2((xz.x - uAOBounds.x) * uAOBounds.z, (uAOBounds.y - xz.y) * uAOBounds.w)).r; }
// height-field ambient occlusion: how much of the sky the static island hides from this point
float hbAO(vec3 P, vec3 N) {
  if (uAOBounds.z <= 0.0) return 1.0;
  float occ = 0.0, wsum = 0.0;
  #ifdef HB_LITE
  const int directions = 4;
  #else
  const int directions = 8;
  #endif
  for (int i = 0; i < directions; i++) {
    float a = float(i) * (6.2831856 / float(directions)) + 0.31;
    vec2 d = vec2(cos(a), sin(a));
    float r = (i - (i / 2) * 2 == 0) ? 2.0 : 5.5;
    float w = clamp(dot(vec3(d.x, 0.0, d.y), N) * 0.9 + N.y, 0.0, 1.0);
    float o = clamp((hbHeight(P.xz + d * r) - P.y - 0.3) / r, 0.0, 1.0);
    occ += w * o; wsum += w;
  }
  return 1.0 - 0.8 * occ / max(wsum, 1e-3);
}
#ifndef HB_LITE
// Softens low-poly grass slope facets toward the continuous height-field normal without bleeding across walls
vec3 hbSmoothGrassNormal(vec3 W, vec3 worldN) {
  if (uAOBounds.z <= 0.0 || worldN.y < 0.25) return worldN;
  float hc = hbHeight(W.xz);
  if (abs(hc - W.y) > 2.5) return worldN;
  float hE = hbHeight(W.xz + vec2(3.5, 0.0));
  float hW = hbHeight(W.xz - vec2(3.5, 0.0));
  float hS = hbHeight(W.xz + vec2(0.0, 3.5));
  float hN = hbHeight(W.xz - vec2(0.0, 3.5));
  vec3 sN = normalize(vec3(hW - hE, 7.0, hN - hS));
  float agree = smoothstep(0.42, 0.78, dot(worldN, sN));
  float slope = smoothstep(0.02, 0.28, 1.0 - worldN.y);
  return normalize(mix(worldN, sN, agree * (0.60 + 0.32 * slope)));
}
#endif
`;
