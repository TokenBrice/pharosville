import { CLOUD_COLS, CLOUD_ROWS } from "./clouds";

export const MAX_BANKS = 8;

/**
 * The painted sky band, evaluated in band space: th = azimuth (deg) relative to the view's forward
 * azimuth, e = elevation (deg) above the backdrop's base line (the pretend horizon). Shared by the
 * camera-attached backdrop (full res) and the low-res band render target the sea reflects/hazes from.
 * Back to front: gradient + glow, stars, sun/moon discs, cirrus, cloud banks, shakkei hills, haze.
 */
export const SKY_BAND_GLSL = /* glsl */ `
uniform float uTime, uNight;
uniform vec3 uZenith, uHorizon, uHaze, uSunColor;
uniform vec3 uGlowCol, uCloudLight, uCloudMid, uCloudShade, uCloudRim, uMount, uMountLit;
uniform vec4 uSkyK;          // glowK, rimK, snow, stars
uniform vec2 uDiscK;         // sun, moon
uniform vec4 uSunDisc;       // th, e, radius (deg), visibility
uniform vec4 uMoonDisc;      // th, e, radius (deg), visibility
uniform vec4 uLight;         // key light for clouds/hills: th (deg, true azimuth), elevation (rad), -, -
uniform vec4 uBanks[${MAX_BANKS}];   // th centre, e base, width, height (deg)
uniform vec4 uBankB[${MAX_BANKS}];   // atlas cell, alpha, haze, mirror
uniform sampler2D uCloudAtlas;
uniform sampler2D uSkyNoise;
uniform vec4 uParallax;      // per-layer azimuth shift (deg): far hills, mid hills, near hills, clouds
uniform vec3 uWeather;       // cloud cover, wind, cirrus drift (deg)
uniform float uStorm;        // 0 fair … 1 storm deck (DEWS ALERT and above)

float sbHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sbNoise1(float x, float seed) { float i = floor(x), f = fract(x); float u = f * f * (3.0 - 2.0 * f); return mix(sbHash(vec2(i, seed)), sbHash(vec2(i + 1.0, seed)), u); }
float sbRidge(float x, float seed) {
  float h = 0.0, a = 1.0, f = 1.0, n = 0.0;
  for (int o = 0; o < 5; o++) { float r = 1.0 - abs(sbNoise1(x * f, seed + float(o) * 3.7) * 2.0 - 1.0); h += a * r * r; n += a; a *= 0.5; f *= 2.13; }
  return h / n;
}
// hill silhouette height (deg) at azimuth th
float sbHill(float th, float seed, float hmax, float freq) {
  float env = smoothstep(0.25, 0.75, sbNoise1(th * 0.035 + seed * 1.3, seed + 9.0));
  float h = sbRidge(th * freq, seed);
  return hmax * (0.18 + 0.82 * h * h) * (0.25 + 0.75 * env);
}

vec3 sbCloudBank(int i, float th, float e, float pxDeg, vec3 c, vec3 Lc) {
  vec4 b = uBanks[i], bi = uBankB[i];
  if (bi.y < 0.002) return c;
  vec2 lc = vec2((th - b.x) / b.z + 0.5, (e - b.y) / b.w);   // parallax is applied per bank on the CPU
  if (lc.x < 0.0 || lc.x > 1.0 || lc.y < 0.0 || lc.y > 1.0) return c;
  if (bi.w > 0.5) lc.x = 1.0 - lc.x;
  float cell = bi.x;
  vec2 uv = (vec2(mod(cell, ${CLOUD_COLS}.0), floor(cell / ${CLOUD_COLS}.0)) + clamp(lc, vec2(0.002), vec2(0.998))) / vec2(${CLOUD_COLS}.0, ${CLOUD_ROWS}.0);
  float lod = max(0.0, log2(max(pxDeg * 256.0 / b.w, 1e-4)));
  vec4 s = textureLod(uCloudAtlas, uv, lod);
  if (s.a < 0.003) return c;
  // light from a softened normal (bigger forms, no per-lobe columns) and a sky-dome bias from above
  vec2 sn = textureLod(uCloudAtlas, uv, lod + 1.6).rg;
  vec3 N = vec3(mix(s.rg, sn, 0.65) * 2.0 - 1.0, 0.0);
  if (bi.w > 0.5) N.x = -N.x;
  N.z = sqrt(max(0.0, 1.0 - dot(N.xy, N.xy)));
  Lc = normalize(Lc + vec3(0.0, 0.55, 0.0));
  float ndl = dot(N, Lc);
  float back0 = clamp(-Lc.z, 0.0, 1.0);
  float wrap = mix(mix(0.12, 0.36, back0), 1.0, ndl * 0.5 + 0.5);     // backlit banks keep a readable fill
  vec3 col = mix(uCloudShade, uCloudMid, smoothstep(0.18, 0.52, wrap));
  col = mix(col, uCloudLight, smoothstep(0.52, 0.84, wrap));
  // volume: lit crowns, a heavier shaded underside (lavender at golden, slate by day, indigo at night)
  col *= mix(0.84, 1.06, smoothstep(0.05, 0.85, lc.y));
  float baseDark = 1.0 - smoothstep(0.0, 0.4, lc.y);
  col = mix(col, uCloudShade, baseDark * 0.55 * (1.0 - smoothstep(0.6, 0.95, wrap)));
  // painterly breakup inside the body
  float pn = texture2D(uSkyNoise, vec2(lc.x * b.z, lc.y * b.w) * 0.045 + float(i) * 0.173).b;
  col *= 0.93 + 0.14 * pn;
  float back = back0;
  vec2 l2 = Lc.xy / max(length(Lc.xy), 1e-3), n2 = N.xy / max(length(N.xy), 1e-3);
  float facing = smoothstep(-0.25, 0.6, dot(n2, l2));
  float rimE = s.b * s.b;
  float rim = rimE * (0.25 + 0.55 * back) * facing * uSkyK.y;
  col = mix(col, uCloudRim * 1.15, clamp(rim, 0.0, 0.85));
  // thin edges glow when backlit (forward scattering); silver linings at night
  col += uCloudRim * rimE * (back * back * 0.18 + 0.1 * uNight) * uSkyK.y * (0.25 + 0.75 * facing);
  // overcast: flatten and grey the light; storm: heavy slate
  float cov = uWeather.x;
  col = mix(col, mix(uCloudShade, uCloudMid, 0.55), smoothstep(0.55, 1.0, cov) * 0.45);
  float lc0 = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lc0) * vec3(0.92, 0.96, 1.0) * 0.78, uStorm * 0.6);
  // aerial perspective (far layers sink into the haze), and the base melts into it
  col = mix(col, mix(uHorizon, uHaze, 0.5), clamp(bi.z + baseDark * 0.18, 0.0, 1.0));
  return mix(c, col, s.a * bi.y);
}

vec3 skyBand(float th, float e, float pxDeg) {
  // ---- gradient: compressed so the narrow visible band still spans horizon -> zenith
  float t = clamp(e / 6.5, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(t, 0.62));
  c = mix(c, uHorizon * 1.08, (1.0 - smoothstep(0.0, 1.6, e)) * 0.35);
  // ---- glow toward the key light's azimuth (sun/moon), strongest at the horizon
  float dg = abs(th - uSunDisc.x);
  float glowSun = exp(-dg / 24.0) * exp(-max(e, 0.0) / 4.5) * uSunDisc.w;
  float dm = abs(th - uMoonDisc.x);
  float glowMoon = exp(-dm / 16.0) * exp(-max(e, 0.0) / 3.5) * uMoonDisc.w * 0.6;
  c += uGlowCol * (glowSun + glowMoon) * uSkyK.x * 0.55;
  // overcast greys the sky
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(lum) * vec3(0.96, 0.98, 1.02), smoothstep(0.4, 1.0, uWeather.x) * 0.5);

#ifndef SKY_REFLECTION
  // ---- stars
  if (uSkyK.w > 0.01 && e > 0.25) {
    vec2 sp = vec2(th, e) / 0.42;
    vec2 cid = floor(sp), f = fract(sp) - 0.5;
    float h = sbHash(cid + 17.0);
    if (h < 0.16) {
      vec2 jit = vec2(sbHash(cid + 3.1), sbHash(cid + 8.4)) - 0.5;
      float d = length((f - jit * 0.7) * 0.42) / max(pxDeg, 1e-4);
      float bright = pow(sbHash(cid + 5.5), 3.0) * 2.5 + 0.35;
      float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * h * 6.0) + h * 40.0);
      c += vec3(0.85, 0.9, 1.0) * (1.0 - smoothstep(0.35, 1.25, d)) * bright * tw * uSkyK.w * smoothstep(0.25, 1.4, e) * (1.0 - uWeather.x * 0.7);
    }
  }
#endif
#ifndef SKY_REFLECTION
  // ---- sun disc + halo (the sea gets its own glitter path; discs are not mirrored)
  if (uSunDisc.w > 0.001) {
    float d = length(vec2(th - uSunDisc.x, e - uSunDisc.y));
    float disc = 1.0 - smoothstep(uSunDisc.z - pxDeg, uSunDisc.z + pxDeg, d);
    c += uSunColor * (exp(-d / 1.1) * 0.35 + exp(-d / 0.35) * 0.6) * uSunDisc.w * uDiscK.x;
    c = mix(c, uSunColor * 3.2 + vec3(1.2, 1.0, 0.8), disc * uSunDisc.w * uDiscK.x);
  }
  // ---- moon disc + halo (large, stylised, softly cratered)
  if (uMoonDisc.w > 0.001) {
    vec2 md = vec2(th - uMoonDisc.x, e - uMoonDisc.y);
    float d = length(md);
    float r = uMoonDisc.z;
    float disc = 1.0 - smoothstep(r - pxDeg * 1.2, r + pxDeg * 1.2, d);
    vec2 mu = md / r;
    float maria = texture2D(uSkyNoise, mu * 0.22 + 0.31).g;
    float shade = 0.82 + 0.18 * smoothstep(0.35, 0.65, maria) - 0.06 * dot(mu, vec2(0.6, -0.4));
    c += vec3(0.62, 0.7, 0.95) * (exp(-d / (r * 1.6)) * 0.4 + exp(-d / (r * 5.0)) * 0.2 + exp(-d / 2.6) * 0.1) * uMoonDisc.w * uDiscK.y * (1.0 - 0.7 * uStorm);
    c = mix(c, vec3(1.55, 1.6, 1.7) * shade, disc * uMoonDisc.w * uDiscK.y * (1.0 - 0.85 * uStorm));
  }
#endif
  // ---- cirrus wisps (high, thin, stretched along the horizon); not mirrored by the sea
  float cir = 0.0;
#ifndef SKY_REFLECTION
  {
    // sparse wisps: a low-frequency presence mask picks 2-3 streaks; a warped, stretched fbm draws them
    float thc = th + uParallax.w * 0.6 + uWeather.z * 1.6;
    float pres = smoothstep(0.55, 0.8, texture2D(uSkyNoise, vec2(thc * 0.0075 + 0.21, e * 0.02 + 0.6)).r);
    vec2 q = vec2(thc * 0.03, e * 0.16);
    float warp = texture2D(uSkyNoise, q * vec2(0.6, 1.4) + 0.17).g - 0.5;
    float n1 = texture2D(uSkyNoise, vec2(q.x * 1.0, q.y * 3.2 + warp * 0.7)).r;
    float n2 = texture2D(uSkyNoise, vec2(q.x * 3.7 + 0.31, q.y * 11.0 + warp * 1.8)).b;
    float band = smoothstep(2.0, 4.0, e) * (1.0 - smoothstep(10.0, 15.0, e));
    cir = smoothstep(0.55, 0.85, n1 * 0.7 + n2 * 0.45) * pres * band * (0.45 + 0.55 * uWeather.x) * 0.38;
    vec3 cirCol = mix(uCloudLight, uCloudRim, 0.4) * mix(1.0, 0.8, uNight);
    c = mix(c, cirCol, cir);
  }
#endif
  // ---- painted cumulus banks (array order = far to near)
  float cosL = cos(uLight.y);
#ifndef SKY_REFLECTION
  // (the band is compressed in elevation, so mirrored clouds would smear down the whole bay: not reflected)
  for (int i = 0; i < ${MAX_BANKS}; i++) {
    float bth = uBanks[i].x;
    float dl = radians(uLight.x - bth);
    vec3 Lc = normalize(vec3(sin(dl) * cosL, sin(uLight.y), -cos(dl) * cosL));
    c = sbCloudBank(i, th, e, pxDeg, c, Lc);
  }
#endif
  // ---- storm deck: a low slate overcast rolling over the band, with rain veils hanging to the horizon
  if (uStorm > 0.002) {
    float thd = th + uWeather.z * 2.0;
    float dn = texture2D(uSkyNoise, vec2(thd * 0.011, e * 0.05 + 0.13)).r * 0.7 + texture2D(uSkyNoise, vec2(thd * 0.034, e * 0.13) + 0.31).g * 0.4;
    float deckA = smoothstep(0.32, 0.7, dn + e * 0.05) * smoothstep(0.1, 1.4, e) * uStorm;
    vec3 deckC = mix(uCloudShade, uCloudMid, 0.2 + 0.45 * smoothstep(0.45, 0.95, dn));
    float ld = dot(deckC, vec3(0.299, 0.587, 0.114));
    deckC = mix(deckC, vec3(ld) * vec3(0.93, 0.97, 1.0), 0.65) * 0.82;
    c = mix(c, deckC, deckA * 0.92);
    float vx = texture2D(uSkyNoise, vec2(thd * 0.021, 0.37)).g;
    float streak = texture2D(uSkyNoise, vec2(thd * 0.5 + e * 0.35, e * 0.03)).b;
    float veil = smoothstep(0.55, 0.78, vx) * (1.0 - smoothstep(0.2, 3.0, e)) * smoothstep(0.35, 0.9, uStorm);
    c = mix(c, deckC * 0.92, veil * (0.4 + 0.35 * streak));
  }
  // ---- shakkei: three hill silhouettes with aerial perspective
  float dlh = sign(uLight.x - th + 1e-3);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float sh = k == 0 ? uParallax.x : (k == 1 ? uParallax.y : uParallax.z);
    float tth = th + sh;
    float hmax = k == 0 ? 1.75 : (k == 1 ? 1.05 : 0.6);
    float fr = k == 0 ? 0.06 : (k == 1 ? 0.09 : 0.15);
    float seed = 3.0 + fk * 11.0;
    float H = sbHill(tth, seed, hmax, fr);
    float cov = 1.0 - smoothstep(-pxDeg, pxDeg, e - H);
    if (cov <= 0.0) continue;
    float dH = (sbHill(tth + 0.12, seed, hmax, fr) - sbHill(tth - 0.12, seed, hmax, fr)) / 0.24;
    float lit = smoothstep(-0.1, 0.45, -dH * dlh) * clamp(sin(uLight.y) * 2.0 + 0.4, 0.0, 1.0);
    vec3 mc = mix(uMount, uMountLit, lit * 0.8);
    // snow caps on the far range by day
    if (k == 0) mc = mix(mc, mix(vec3(0.92, 0.94, 1.0), uMountLit, 0.25), uSkyK.z * smoothstep(0.62, 0.9, e / max(hmax, 1e-3)) * smoothstep(0.7, 1.0, H / hmax));
    float hz = k == 0 ? 0.55 : (k == 1 ? 0.36 : 0.18);
    float baseFade = 1.0 - smoothstep(0.0, H * 0.9 + 0.05, e);
    mc = mix(mc, uHaze, clamp(hz + baseFade * 0.45, 0.0, 1.0));
    c = mix(c, mc, cov);
  }
  // ---- horizon haze band (matches the sea fog) + the glow on it
  float hzb = 1.0 - smoothstep(-0.05, 0.75, e);
  vec3 hazeC = uHaze + uGlowCol * (glowSun + glowMoon) * uSkyK.x * 0.35;
  c = mix(c, hazeC, hzb * 0.85);
  if (e < 0.0) c = hazeC;
  return c;
}
`;
