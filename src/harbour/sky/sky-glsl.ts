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
uniform vec4 uMoonPhase;     // W04: phase angle (rad, 0 new, pi full), lit-limb sign (+1 right), illuminated fraction, -
uniform vec4 uLight;         // key light for clouds/hills: th (deg, true azimuth), elevation (rad), -, -
uniform vec4 uBanks[${MAX_BANKS}];   // th centre, e base, width, height (deg)
uniform vec4 uBankB[${MAX_BANKS}];   // atlas cell, alpha, haze, mirror
uniform sampler2D uCloudAtlas;
uniform sampler2D uSkyNoise;
uniform vec4 uParallax;      // per-layer azimuth shift (deg): far hills, mid hills, near hills, clouds
uniform vec3 uWeather;       // cloud cover, wind, cirrus drift (deg)
uniform float uStorm;        // 0 fair … 1 storm deck (DEWS ALERT and above)
uniform vec4 uPrecipSky;     // rain, snow, lightning flash, flash azimuth (deg) — the weather director
uniform vec4 uPrecipSkyB;    // flash elevation (deg), curtain wind slant, snow share, -
uniform vec4 uFrontA;        // W01 front: cover from, cover to, storm from, storm to
uniform vec4 uSquall;        // W09 squall: th (deg), strength, W03 sunbreaks 0..1, -
uniform vec3 uClearZen, uClearHor;
uniform vec4 uSeasonSky;     // W10: cirrus amount multiplier, autumn mackerel band 0..1, -, -
uniform vec4 uNightSky;      // W05: Milky Way 0..1, star clock (s, stills with reduced motion), band azimuth offset (deg), summer core 0..1
uniform vec4 uMeteor;        // W06: streak start th, e (deg), direction (unit, deg space)
uniform vec4 uMeteorB;       // W06: life 0..1, length (deg), brightness, -   // W01: the hour's zenith and horizon before the storm grade (the clearing's sky)
uniform vec4 uFrontB;        // W01 front: line azimuth (deg, band space), travel sign (+1 = toward +th), rain it brings, active 0/1

// this pixel's cover and storm grade: the shown weather, or under a front the weather on its side of the line
float gCov, gStorm, gBehind;
// W01: 1 behind the front line (the new weather has arrived), 0 ahead of it. Ragged, and leaning: the deck aloft
// runs ahead of its base, so the line sits further on higher up.
float sbFrontSide(float th, float e) {
  float sd = uFrontB.y * (th - uFrontB.x);
  float rag = texture2D(uSkyNoise, vec2(e * 0.11 + 0.53, th * 0.004 + 0.21)).r - 0.5
    + (texture2D(uSkyNoise, vec2(e * 0.37 + 0.19, th * 0.02 + 0.61)).g - 0.5) * 0.6;
  return 1.0 - smoothstep(-4.5, 4.5, sd - e * 0.6 + rag * 7.0);
}

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
  float rim = rimE * (0.25 + 0.55 * back) * facing * mix(1.0, facing, uNight) * uSkyK.y;
  col = mix(col, uCloudRim * 1.15, clamp(rim, 0.0, 0.85));
  // thin edges glow when backlit (forward scattering); silver linings at night
  // (at night only the moon side keeps a rim: no all-round blue-white outline)
  col += uCloudRim * rimE * (back * back * 0.18 + 0.1 * uNight) * uSkyK.y * mix(0.25 + 0.75 * facing, facing * facing, uNight);
  // overcast: flatten and grey the light; storm: heavy slate
  float cov = gCov;
  col = mix(col, mix(uCloudShade, uCloudMid, 0.55), smoothstep(0.55, 1.0, cov) * 0.45);
  float lc0 = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lc0) * vec3(0.88, 0.95, 1.04) * 0.78, gStorm * 0.6);
  // night banks stay quiet beside the Pharos: about 40 % less albedo
  col *= 1.0 - 0.4 * uNight;
  // aerial perspective (far layers sink into the haze), and the base melts into it
  col = mix(col, mix(uHorizon, uHaze, 0.5), clamp(bi.z + baseDark * 0.18, 0.0, 1.0));
  return mix(c, col, s.a * bi.y);
}

// the night overcast (0 clear … 1 shut): closes with the cover at night (WATCH ≈ broken, ALERT+ shut); the breaks
// drift with the clouds and fill in as the cover thickens
float skyNightDeck(float th, float e) {
  float cov = gCov;
  float closed = smoothstep(0.2, 0.36, cov) * smoothstep(0.25, 0.75, uNight);
  if (closed < 0.002) return 0.0;
  float thd = th + uWeather.z * 2.0;
  float bn = texture2D(uSkyNoise, vec2(thd * 0.016 + 0.47, e * 0.07 + 0.29)).g * 0.75 + texture2D(uSkyNoise, vec2(thd * 0.05 + 0.13, e * 0.19 + 0.71)).r * 0.35;
  float gap = smoothstep(0.7, 0.82, bn) * (1.0 - smoothstep(0.42, 0.58, cov));
  return closed * (1.0 - gap);
}

vec3 skyBand(float th, float e, float pxDeg) {
  gBehind = uFrontB.w > 0.5 ? sbFrontSide(th, e) : 0.0;
  gCov = uFrontB.w > 0.5 ? mix(uFrontA.x, uFrontA.y, gBehind) : uWeather.x;
  gStorm = uFrontB.w > 0.5 ? mix(uFrontA.z, uFrontA.w, gBehind) : uStorm;
  // ---- gradient: compressed so the narrow visible band still spans horizon -> zenith
  float t = clamp(e / 6.5, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(t, 0.62));
  c = mix(c, uHorizon * 1.08, (1.0 - smoothstep(0.0, 1.6, e)) * 0.35);
  if (gStorm < uStorm - 0.002) {
    // W01 clearing: behind the line the sky is the hour's own again
    vec3 cc = mix(uClearHor, uClearZen, pow(t, 0.62));
    cc = mix(cc, uClearHor * 1.08, (1.0 - smoothstep(0.0, 1.6, e)) * 0.35);
    c = mix(cc, c, gStorm / max(uStorm, 1e-3));
  }
  // ---- glow toward the key light's azimuth (sun/moon), strongest at the horizon
  float dg = abs(th - uSunDisc.x);
  float glowSun = exp(-dg / 24.0) * exp(-max(e, 0.0) / 4.5) * uSunDisc.w;
  float dm = abs(th - uMoonDisc.x);
  float glowMoon = exp(-dm / 16.0) * exp(-max(e, 0.0) / 3.5) * uMoonDisc.w * 0.6;
  // Below the strict horizon boundary the final result was always exactly hazeC; no hidden layer contributes.
  vec3 hazeC = uHaze + uGlowCol * (glowSun + glowMoon) * uSkyK.x * 0.35;
  hazeC = mix(hazeC, mix(uHorizon, uSunColor, 0.25) * 1.15, (1.0 - smoothstep(0.84, 0.97, gCov)) * smoothstep(0.2, 0.6, gStorm) * 0.3 * (1.0 - 0.6 * uNight));
  if (e < 0.0) return hazeC;
  c += uGlowCol * (glowSun + glowMoon) * uSkyK.x * 0.55;
  // overcast greys the sky
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(lum) * vec3(0.96, 0.98, 1.02), smoothstep(0.4, 1.0, gCov) * 0.5);

#ifndef SKY_REFLECTION
  // ---- stars (W05): a dense faint field plus sparse bright stars with magnitudes and colour temperatures;
  //      twinkle is stronger low in the sky, and stills with reduced motion (uNightSky.y)
  if (uSkyK.w > 0.01 && e > 0.25) {
    float clear = 1.0 - gCov * 0.7;
    float fadeE = smoothstep(0.25, 1.4, e);
    float twA = mix(0.35, 0.1, smoothstep(0.8, 5.0, e));
    for (int L = 0; L < 2; L++) {
      float cellDeg = L == 0 ? 0.42 : 1.15;
      vec2 sp = vec2(th, e) / cellDeg;
      vec2 cid = floor(sp) + float(L) * 71.0, f = fract(sp) - 0.5;
      float h = sbHash(cid + 17.0);
      if (h < (L == 0 ? 0.16 : 0.22)) {
        vec2 jit = vec2(sbHash(cid + 3.1), sbHash(cid + 8.4)) - 0.5;
        float d = length((f - jit * 0.7) * cellDeg) / max(pxDeg, 1e-4);
        float m = sbHash(cid + 5.5);
        float bright = L == 0 ? pow(m, 3.0) * 1.6 + 0.3 : pow(m, 2.0) * 2.6 + 0.9;
        float tw = 1.0 - twA + twA * sin(uNightSky.y * (1.5 + 18.0 * h) + h * 40.0);
        float temp = sbHash(cid + 9.7);
        vec3 sc = temp < 0.18 ? vec3(1.0, 0.82, 0.64) : temp > 0.85 ? vec3(0.72, 0.84, 1.12) : vec3(0.88, 0.92, 1.0);
        c += sc * (1.0 - smoothstep(0.35, L == 0 ? 1.25 : 1.6, d)) * bright * tw * uSkyK.w * fadeE * clear;
      }
    }
    // W05 the Milky Way on clear, dark nights: a tilted painterly band with dust lanes (not an atlas)
    if (uNightSky.x > 0.01) {
      float mth = th + uNightSky.z;
      float axis = e - (4.6 + 2.2 * sin(radians(mth) * 1.3));
      float n1 = texture2D(uSkyNoise, vec2(mth * 0.021 + 0.17, e * 0.09 + 0.43)).r;
      float n2 = texture2D(uSkyNoise, vec2(mth * 0.07 + 0.61, e * 0.24 + 0.09)).g;
      float width = 0.9 + 0.5 * n1;
      float body = exp(-axis * axis / (width * width)) * (0.45 + 0.7 * n1);
      float dust = smoothstep(0.55, 0.8, n2) * exp(-axis * axis / 0.35) * 0.45;
      float core = 1.0 + 0.8 * uNightSky.w * smoothstep(0.3, 1.0, cos(radians(mth)));
      vec3 mw = vec3(0.78, 0.8, 0.95) * body * (1.0 - dust) * core;
      c += mw * uNightSky.x * 0.06 * fadeE * (1.0 - gCov * 0.7);
    }
    // W06 a meteor: a thin warm streak with a fading tail, under a second (never a flash, never like lightning)
    if (uMeteorB.x > 0.0 && uMeteorB.x < 1.0) {
      vec2 p = vec2(th, e) - uMeteor.xy;
      float along = dot(p, uMeteor.zw);
      float across = abs(p.x * uMeteor.w - p.y * uMeteor.z);
      float head = uMeteorB.x * uMeteorB.y;
      float tail = clamp(1.0 - (head - along) / (uMeteorB.y * 0.45), 0.0, 1.0) * step(along, head) * step(0.0, along);
      float line = 1.0 - smoothstep(pxDeg * 0.5, pxDeg * 1.4, across);
      float life = sin(uMeteorB.x * 3.14159);
      c += vec3(1.0, 0.93, 0.8) * line * tail * tail * life * uMeteorB.z * clear;
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
    // W04 tonight's phase: a soft terminator (the lit limb mirrors south of the equator) and faint earthshine
    vec3 mN = vec3(mu, sqrt(max(0.0, 1.0 - dot(mu, mu))));
    float lit = smoothstep(-0.06, 0.12, dot(mN, vec3(sin(uMoonPhase.x) * uMoonPhase.y, 0.0, -cos(uMoonPhase.x))));
    float illum = uMoonPhase.z;
    c += vec3(0.62, 0.7, 0.95) * (exp(-d / (r * 1.6)) * 0.4 + exp(-d / (r * 5.0)) * 0.2 + exp(-d / 2.6) * 0.1) * uMoonDisc.w * uDiscK.y * (1.0 - 0.7 * gStorm) * (0.12 + 0.88 * illum);
    vec3 dark = c * 0.82 + vec3(0.2, 0.23, 0.3) * 0.2 * (1.0 - illum) * shade;
    c = mix(c, mix(dark, vec3(1.55, 1.6, 1.7) * shade, lit), disc * uMoonDisc.w * uDiscK.y * (1.0 - 0.85 * gStorm));
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
    cir = smoothstep(0.55, 0.85, n1 * 0.7 + n2 * 0.45) * pres * band * (0.45 + 0.55 * gCov) * 0.38 * uSeasonSky.x;
    vec3 cirCol = mix(uCloudLight, uCloudRim, 0.4) * mix(1.0, 0.8, uNight);
    c = mix(c, cirCol, cir);
    // W10 autumn: a mackerel (altocumulus) band, small rippled cells in rows, as thin as the cirrus
    if (uSeasonSky.y > 0.01) {
      // rows slip against each other and every cell is jittered, sized and warped on its own (an unbroken lattice
      // read as a printed dot grid, worst at night against the dark sky), and some cells are missing
      vec2 mq = vec2(thc * 0.9, e * 2.6 + sin(thc * 0.35) * 0.6);
      float mrow = floor(mq.y);
      mq.x += sbHash(vec2(mrow, 4.1)) * 7.0;
      vec2 mid = floor(mq);
      vec2 mf = fract(mq) - 0.5 - (vec2(sbHash(mid + 1.3), sbHash(mid + 2.7)) - 0.5) * 0.3;
      float mwarp = texture2D(uSkyNoise, mq * 0.31 + 0.47).b - 0.5;
      float cell = 1.0 - length(mf * vec2(1.0, 1.25)) / (0.32 + 0.16 * sbHash(mid + 4.9)) + mwarp * 0.6;
      cell *= step(0.3, sbHash(mid + 6.1));
      float mpres = smoothstep(0.5, 0.75, texture2D(uSkyNoise, vec2(thc * 0.012 + 0.71, e * 0.03 + 0.2)).g) * smoothstep(3.5, 5.0, e) * (1.0 - smoothstep(7.5, 9.5, e));
      // a lit daytime texture: at night the thin sheet goes unseen against the dark (no grey dot field)
      float mk = smoothstep(0.1, 0.55, cell) * mpres * uSeasonSky.y * 0.2 * (1.0 - uNight);
      c = mix(c, cirCol, mk);
    }
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
  // ---- storm deck: a low slate overcast rolling over the band, with rain veils hanging to the horizon.
  //      At night the deck closes (no moonlit cumulus under a starry sky while it rains): broken at WATCH, the
  //      stars and the moon showing only through a few breaks, shut from ALERT up.
  float nightDeck = skyNightDeck(th, e);
  float strip = 0.0;
  if (gStorm > 0.002 || nightDeck > 0.002) {
    float thd = th + uWeather.z * 2.0;
    float dn = texture2D(uSkyNoise, vec2(thd * 0.011, e * 0.05 + 0.13)).r * 0.7 + texture2D(uSkyNoise, vec2(thd * 0.034, e * 0.13) + 0.31).g * 0.4;
    // W02 structure: cells with darker cores and paler seams, and low rolls lying along the wind (in th)
    float cn = texture2D(uSkyNoise, vec2(thd * 0.055 + 0.37, e * 0.42 + 0.11)).g;
    float seam = 1.0 - abs(cn * 2.0 - 1.0);
    float roll = 0.5 + 0.5 * sin(e * 2.3 + (texture2D(uSkyNoise, vec2(thd * 0.008, 0.83)).r - 0.5) * 5.0);
    // W02: a pale strip of clear sky under the deck at the far horizon, closing at DANGER
    strip = smoothstep(0.15, 0.4, e) * (1.0 - smoothstep(0.75, 1.5, e)) * (1.0 - smoothstep(0.84, 0.97, gCov)) * smoothstep(0.2, 0.6, gStorm);
    float deckA = smoothstep(0.32, 0.7, dn + e * 0.05) * smoothstep(0.1, 1.4, e) * gStorm;
    deckA = max(deckA, smoothstep(0.9, 1.9, e) * smoothstep(0.55, 0.9, gStorm) * 0.9) * (1.0 - strip * 0.9);
    vec3 deckC = mix(uCloudShade, uCloudMid, 0.2 + 0.45 * smoothstep(0.45, 0.95, dn));
    float ld = dot(deckC, vec3(0.299, 0.587, 0.114));
    // cold slate (blue-grey, never the warm grey-white of the stale-data fog), darker in the cell cores
    deckC = mix(deckC, vec3(ld) * vec3(0.86, 0.94, 1.07), 0.7) * 0.8;
    deckC *= mix(0.82, 1.1, smoothstep(0.35, 0.95, seam)) * mix(0.93, 1.04, roll);
    // the closed night deck: the same slate, darker toward the zenith, a faint ragged base above the horizon
    vec3 nightC = deckC * (0.78 + 0.3 * smoothstep(0.3, 0.9, dn)) * mix(1.0, 0.72, smoothstep(1.0, 7.0, e));
    c = mix(c, mix(deckC, nightC, nightDeck), max(deckA * 0.92, nightDeck * smoothstep(0.0, 0.9, e + (dn - 0.5) * 0.8)));
    float vx = texture2D(uSkyNoise, vec2(thd * 0.021, 0.37)).g;
    float streak = texture2D(uSkyNoise, vec2(thd * 0.5 + e * 0.35, e * 0.03)).b;
    float veil = smoothstep(0.55, 0.78, vx) * (1.0 - smoothstep(0.2, 3.0, e)) * smoothstep(0.35, 0.9, gStorm);
    c = mix(c, deckC * 0.92, veil * (0.4 + 0.35 * streak) * (1.0 - strip * 0.7));
    // the strip: the far sea-sky still in sun beyond the storm (marine-painting light)
    vec3 stripC = mix(uHorizon, uSunColor, 0.25) * 1.25 + uGlowCol * uSkyK.x * 0.15;
    c = mix(c, stripC, strip * 0.55 * (1.0 - 0.6 * uNight));
  }
  // ---- W01 shelf cloud: a dark rolled lip on the front's leading edge (rising only), its crown lit from above
  if (uFrontB.w > 0.5 && uFrontA.w > uFrontA.z + 0.05) {
    float sd = uFrontB.y * (th - uFrontB.x) - e * 0.6;
    float wob = texture2D(uSkyNoise, vec2(th * 0.03 + 0.7, 0.37)).g - 0.5;
    float lipTop = 2.3 + wob * 0.8 - 0.12 * sd, lipBot = 0.75 + wob * 0.4;
    float lip = smoothstep(2.5, -0.5, sd) * smoothstep(-14.0, -4.0, sd)
      * smoothstep(lipBot - 0.15, lipBot + 0.2, e) * (1.0 - smoothstep(lipTop - 0.25, lipTop + 0.1, e));
    float k = clamp((uFrontA.w - uFrontA.z) * 1.6, 0.0, 1.0);
    vec3 lipC = mix(uCloudShade, uCloudMid, 0.15) * vec3(0.84, 0.92, 1.06) * 0.62;
    lipC = mix(lipC, uCloudRim * 0.8 + uSunColor * 0.1, smoothstep(lipTop - 0.55, lipTop - 0.1, e) * 0.45 * (1.0 - uNight * 0.7));
    c = mix(c, lipC, lip * k * 0.9);
  }
  // ---- lightning: the deck lit from inside around the strike, the whole band lifted a little
  if (uPrecipSky.z > 0.002) {
    float fd = length(vec2((th - uPrecipSky.w) / 9.0, (e - uPrecipSkyB.x) / 3.0));
    float body = smoothstep(0.1, 1.2, e) * (0.35 + 0.65 * uStorm);
    vec3 fc = vec3(0.78, 0.84, 1.0);
    c += fc * uPrecipSky.z * (exp(-fd * 1.2) * 2.2 * body + exp(-fd * 0.35) * 0.35 + 0.12);
  }
  // ---- W03 sunbreaks: faint crepuscular shafts fanning down from the sun through the gaps in the cloud
  if (uSquall.z > 0.002 && uSunDisc.w > 0.01) {
    vec2 v = vec2(th - uSunDisc.x, e - uSunDisc.y);
    if (v.y < 0.0) {
      float r = length(v);
      float rays = smoothstep(0.5, 0.9, sbNoise1(atan(v.x, -v.y) * 9.0 + 3.0, 7.0));
      float gap = smoothstep(0.4, 0.7, texture2D(uSkyNoise, vec2((th + uWeather.z * 2.0) * 0.02 + 0.4, e * 0.08 + 0.2)).g);
      c += uSunColor * rays * gap * exp(-r / 9.0) * smoothstep(0.3, 1.5, r) * uSquall.z * uSunDisc.w * 0.16;
    }
  }
  // ---- W09 the passing squall: one darker bank with its own rain curtain, walking along the wind
  if (uSquall.y > 0.002) {
    float sqd = (th - uSquall.x) / 5.5;
    float sqm = uSquall.y * exp(-sqd * sqd);
    if (sqm > 0.003) {
      vec3 sqC = mix(uCloudShade, uCloudMid, 0.3) * vec3(0.88, 0.95, 1.06) * 0.85;
      float bank = smoothstep(0.7, 1.6, e) * (1.0 - smoothstep(3.5, 5.5, e + (texture2D(uSkyNoise, vec2(th * 0.06, 0.15)).r - 0.5) * 2.0));
      c = mix(c, sqC, sqm * bank * 0.75);
      float streak = texture2D(uSkyNoise, vec2(th * 0.9 + e * uPrecipSkyB.y * 1.6, e * 0.05 - uTime * 0.02)).b;
      float hang = (1.0 - smoothstep(0.5, 1.9, e)) * smoothstep(-0.2, 0.2, e);
      c = mix(c, sqC * 0.95, sqm * hang * (0.4 + 0.3 * streak));
    }
  }
  // ---- shakkei: three hill silhouettes with aerial perspective
  float dlh = sign(uLight.x - th + 1e-3);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float sh = k == 0 ? uParallax.x : (k == 1 ? uParallax.y : uParallax.z);
    float tth = th + sh;
    float hmax = k == 0 ? 1.75 : (k == 1 ? 1.05 : 0.6);
    // Ridge and envelope are in [0, 1], so H <= hmax; coverage above this AA bound is exactly zero.
    if (e > hmax + pxDeg) continue;
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
  // ---- precipitation hanging from the deck: grey rain shafts slanting with the wind, soft white snow veils
  {
    float pr = uPrecipSky.x, ps = uPrecipSky.y;
    // W01: behind the front its own rain is already falling out over the sea (before it reaches the harbour), or
    // has already stopped behind a clearing line
    if (uFrontB.w > 0.5) {
      float snowF = uPrecipSkyB.z;
      float fb = gBehind * smoothstep(0.0, 10.0, -uFrontB.y * (th - uFrontB.x) + 4.0);
      pr = mix(pr, uFrontB.z * (1.0 - snowF), fb); ps = mix(ps, uFrontB.z * snowF, fb);
    }
    if (pr + ps > 0.01) {
      float thd = th + uWeather.z * 2.0;
      float slant = uPrecipSkyB.y;
      float shaftX = thd * 0.045 + e * slant * 0.08;
      float cells = texture2D(uSkyNoise, vec2(shaftX, 0.71)).r * 0.75 + texture2D(uSkyNoise, vec2(shaftX * 2.7, 0.29)).g * 0.4;
      float shaft = smoothstep(0.62 - 0.35 * max(pr, ps), 0.9 - 0.25 * max(pr, ps), cells);
      float fine = texture2D(uSkyNoise, vec2(thd * 0.9 + e * slant * 1.6, e * 0.05 - uTime * 0.02)).b;
      float hang = (1.0 - smoothstep(0.4, 4.5, e)) * smoothstep(-0.2, 0.2, e);
      vec3 rainC = mix(c, mix(uCloudShade, uCloudMid, 0.35) * 0.85, 0.85);
      c = mix(c, rainC, shaft * hang * pr * (0.55 + 0.25 * fine) * (0.45 + 0.55 * gStorm));
      vec3 snowC = mix(uCloudLight, uHaze, 0.5) * mix(1.0, 0.45, uNight);
      c = mix(c, snowC, shaft * hang * ps * (0.45 + 0.2 * fine));
      // the heavier it falls, the more the distance greys out (visibility, not fog): cold slate, heavier on the
      // upwind side the weather comes from (W02)
      float upw = 1.0 + 0.6 * clamp(-th * sign(slant) / 30.0, -1.0, 1.0) * smoothstep(0.02, 0.2, abs(slant));
      vec3 slate = mix(uCloudShade, uCloudMid, 0.4) * vec3(0.88, 0.96, 1.08);
      c = mix(c, slate, clamp((1.0 - smoothstep(0.0, 6.0, e)) * max(pr, ps) * 0.24 * upw, 0.0, 0.5));
    }
  }
  // ---- W01: the sky's light is graded for the weather overhead (uStorm); across the front line, grade toward the
  //      other side's weather: slate and darker under the coming storm, brighter and bluer in the clearing
  float dS = gStorm - uStorm;
  if (dS > 0.002) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(l) * vec3(0.88, 0.95, 1.06), 0.65 * dS) * (1.0 - 0.34 * dS);
  } else if (dS < -0.002) {
    // (the frame's grade is still the storm's: lift the clearing a little so the opening reads)
    c = mix(c, c * vec3(0.9, 1.0, 1.12), -0.5 * dS) * (1.0 - 0.22 * dS);
  }
  // ---- horizon haze band (matches the sea fog) + the glow on it
  float hzb = 1.0 - smoothstep(-0.05, 0.75, e);
  c = mix(c, hazeC, hzb * 0.85);
  return c;
}
`;
