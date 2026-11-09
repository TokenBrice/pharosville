import { LAMP_WAVE_GLSL } from "../../lights/lamp-wave";

export const GLSL_ENV = /* glsl */ `
uniform vec3 uNightLift;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uHorizon;
uniform float uRimK;
// cheap environment specular (stands in for EEVEE's world reflection) + soft sky rim
vec3 hbEnvSpec(vec3 n, vec3 v, float rough, float f0) {
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHemiGround * 0.6, mix(uHorizon * 0.55, uHemiSky, smoothstep(0.0, 0.6, r.y)), smoothstep(-0.2, 0.05, r.y));
  float fr = f0 + (max(1.0 - rough, f0) - f0) * pow(1.0 - ndv, 5.0);
  return sky * fr;
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
`;
