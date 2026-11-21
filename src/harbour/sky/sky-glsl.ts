import { CLOUD_COLS, CLOUD_ROWS } from "./clouds";

export const MAX_BANKS = 8;

/**
 * E03a hero value lock (O1-I1 at the O10 full strength): the visible band is only ~5° tall, so the gradient reaches
 * mid-blue behind the lantern within SKY_GRADIENT_DEG (was 6.5°), and the warm lift on the horizon stays below
 * SKY_LIFT_DEG (was 1.6°, weight .35). Together with the darker day air (time-of-day DAY_AIR) the band sits a step
 * below the Pharos' lit limewash by day; at night the darker band behind the lantern only helps the fire lead.
 */
export const SKY_GRADIENT_DEG = 3.5;
export const SKY_LIFT_DEG = 1.0;
export const SKY_LIFT = 0.2;

/** E23: the Milky Way's pixels stay under this sky luminance (linear, pre-grade): a fixed cap far below the lit beam. */
export const MILKY_WAY_CAP = 0.13;

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
uniform vec4 uDeckK;         // E24: deck structure after the grey grading 0/1, its gain (the result stays within ±25 %), -, -
uniform vec4 uPrecipSky;     // rain, snow, lightning flash, flash azimuth (deg) — the weather director
uniform vec4 uPrecipSkyB;    // flash elevation (deg), curtain wind slant, snow share, -
uniform vec4 uFrontA;        // W01 front: cover from, cover to, storm from, storm to
uniform vec4 uSquall;        // W09 squall: th (deg), strength, W03 sunbreaks 0..1, -
uniform vec3 uClearZen, uClearHor;
uniform vec4 uSeasonSky;     // W10: cirrus amount multiplier, autumn mackerel band 0..1, -, -
uniform vec4 uTwilight;      // E22: wedge 0..1, anti-solar th (deg), Earth's-shadow top (deg), dawn rays 0..1
uniform vec4 uNightSky;      // W05: Milky Way 0..1, star clock (s, stills with reduced motion), band azimuth offset (deg), summer core 0..1
uniform vec4 uMeteor;        // W06: streak start th, e (deg), direction (unit, deg space)
uniform vec4 uMilkyWay;      // E23: tilted 0/1, sin(lean), foot th (deg, view-relative), cos(lean)
uniform vec4 uMeteorB;       // W06: life 0..1, length (deg), brightness, -   // W01: the hour's zenith and horizon before the storm grade (the clearing's sky)
uniform vec4 uFrontB;        // W01 front: line azimuth (deg, band space), travel sign (+1 = toward +th), rain it brings, active 0/1

// this pixel's cover and storm grade: the shown weather, or under a front the weather on its side of the line
float gCov, gStorm, gBehind;
// E24: the deck's cell/roll structure here and how much of the deck covers this pixel
float gDeckS, gDeckA;
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
// smooth sculpted Aegean coastal headland / island massif profile (zero paper-cutout sawtooth V-teeth)
float sbIsland(float x, float seed) {
  float n1 = sbNoise1(x, seed);
  float n2 = sbNoise1(x * 2.1 + 1.7, seed + 4.3);
  float n3 = sbNoise1(x * 4.4 + 5.1, seed + 11.7);
  float smoothM = n1 * 0.56 + n2 * 0.30 + n3 * 0.14;
  // sculpted Cycladic island massif: smooth volcanic dome & secondary shoulder sloping gracefully to the sea
  return smoothstep(0.16, 0.90, smoothM) * (0.42 + 0.58 * smoothM);
}
// Aegean archipelago silhouette height (deg) at azimuth th: 2-3 distinct softly separated Cycladic island groups
float sbHill(float th, float seed, float hmax, float freq) {
  float group = sbNoise1(th * 0.072 + seed * 1.3, seed + 9.0) * 0.72 + sbNoise1(th * 0.15 + seed * 2.1, seed + 19.0) * 0.28;
  float env = smoothstep(0.32, 0.72, group);
  float h = sbIsland(th * freq, seed);
  return hmax * (0.18 + 0.82 * h) * env;
}

// Henyey-Greenstein Mie forward-scattering phase (silver/gold sunlit cloud linings)
float sbHG(float cosT, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * cosT, 0.06), 1.5);
}

vec3 sbCloudBank(int i, float th, float e, float pxDeg, vec3 c, vec3 Lc, vec3 hazeC) {
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
  float nightBank = smoothstep(0.30, 0.85, uNight);
  // softened volumetric normal + sky-dome ambient fill
  vec2 sn = textureLod(uCloudAtlas, uv, lod + 1.8).rg;
  vec3 N = vec3(mix(s.rg, sn, 0.68) * 2.0 - 1.0, 0.0);
  if (bi.w > 0.5) N.x = -N.x;
  N.z = sqrt(max(0.0, 1.0 - dot(N.xy, N.xy)));
  vec3 Ldir = normalize(Lc + vec3(0.0, 0.48, 0.0));
  float ndl = dot(N, Ldir);
  float back0 = clamp(-Ldir.z, 0.0, 1.0);
  // optical translucency baked in s.b (1 = thin wispy edge, 0 = dense interior)
  float trans = s.b;
  float opticalDepth = 1.0 - trans;
  // Beer-Lambert powder effect by day; smooth quiet velvet contrast at night (no chalky daytime cumulus)
  float powder = 1.0 - exp(-max(opticalDepth, 0.08) * 2.8);
  float wrap = mix(mix(0.14, 0.42, back0), 1.0, ndl * 0.5 + 0.5);
  wrap = clamp(wrap * mix(0.86 + 0.22 * powder, 0.72, nightBank) + trans * 0.14 * (1.0 - nightBank), 0.0, 1.0);
  // moon proximity gate (~25° around the moon disc): only nearby clouds catch silver-blue moonlight at night
  vec2 discPos = uNight > 0.55 ? uMoonDisc.xy : uSunDisc.xy;
  float discVis = uNight > 0.55 ? uMoonDisc.w : uSunDisc.w;
  float ang = radians(length(vec2(th - discPos.x, e - discPos.y)));
  float moonSpan = ang / radians(25.0);
  float moonProx = exp(-moonSpan * moonSpan) * uMoonDisc.w;
  float litWeight = mix(1.0, 0.20 + 0.80 * moonProx, nightBank);
  // warm apricot-cream crowns by day; deep velvet midnight indigo-slate at night
  vec3 col = mix(uCloudShade, uCloudMid, smoothstep(0.16, 0.54, wrap) * mix(1.0, 0.75 + 0.25 * moonProx, nightBank));
  col = mix(col, uCloudLight, smoothstep(0.50, 0.84, wrap) * litWeight);
  // vertical atmospheric illumination: sunlit tops, softly shaded bases
  float crownLift = smoothstep(0.08, 0.86, lc.y);
  col *= mix(0.88, 1.07, crownLift * mix(1.0, 0.45 + 0.55 * moonProx, nightBank));
  float baseDark = 1.0 - smoothstep(0.0, 0.44, lc.y);
  col = mix(col, uCloudShade * (1.0 + 0.08 * (1.0 - uNight)), baseDark * 0.48 * (1.0 - smoothstep(0.58, 0.92, wrap)));
  // delicate painterly brushstroke turbulence inside the vapor body
  float pn = texture2D(uSkyNoise, vec2(lc.x * b.z, lc.y * b.w) * 0.042 + float(i) * 0.173).b;
  col *= 0.94 + 0.12 * pn;
  // Henyey-Greenstein Mie forward-scattering silver/gold linings (restricted within ~25° of the moon at night)
  float cosT = cos(min(ang, 3.14159));
  float mie = clamp((sbHG(cosT, 0.64) * 0.13 + sbHG(cosT, 0.26) * 0.26) * (0.25 + 0.75 * discVis), 0.0, 1.55);
  vec2 l2 = Ldir.xy / max(length(Ldir.xy), 1e-3), n2 = N.xy / max(length(N.xy), 1e-3);
  float facing = smoothstep(-0.3, 0.62, dot(n2, l2));
  float rimE = trans * trans;
  float nightRimGate = mix(1.0, moonProx * facing * 0.55, nightBank);
  float silverLining = rimE * (0.22 + 0.58 * back0 + 0.55 * mie * (1.0 - gStorm * 0.65)) * (0.35 + 0.65 * facing) * nightRimGate * uSkyK.y;
  col = mix(col, uCloudRim * mix(1.18, 0.85, nightBank), clamp(silverLining * 0.75, 0.0, 0.84));
  // radiant Mie forward-scattered edge bloom on sunlit golden/dawn wisps; quiet silver moon-rim only near moon
  col += uCloudRim * rimE * (0.12 + 0.32 * mie) * uSkyK.y * (1.0 - gStorm * 0.7) * mix(0.28 + 0.72 * facing, moonProx * facing * facing * 0.28, nightBank);
  // overcast: flatten and cool the light; storm: brooding cold slate thunderheads with subtle silver breaks
  float cov = gCov;
  col = mix(col, mix(uCloudShade, uCloudMid, 0.52), smoothstep(0.55, 1.0, cov) * 0.46);
  float lc0 = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lc0) * vec3(0.86, 0.94, 1.06) * 0.76, gStorm * 0.62);
  // night banks stay deep velvet indigo-slate beside the Pharos (never chalky cutouts)
  col *= mix(1.0, 0.55 + 0.20 * moonProx, nightBank);
  // aerial perspective melts far banks & cloud bottoms seamlessly into the luminous horizon haze
  col = mix(col, mix(uHorizon, hazeC, 0.62), clamp(bi.z + baseDark * 0.28, 0.0, 0.92));
  // feathery underside dissolution prevents sharp flat dark bottom edges against the night sky
  float baseFeather = smoothstep(0.0, 0.18 + 0.24 * nightBank, lc.y + (pn - 0.5) * 0.14);
  return mix(c, col, s.a * bi.y * baseFeather * mix(1.0, 0.82, nightBank));
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
  gDeckS = 1.0; gDeckA = 0.0;
  // ---- Rayleigh-Mie gradient: compressed so the narrow visible band spans luminous horizon -> cerulean zenith
  float t = clamp(e / ${SKY_GRADIENT_DEG.toFixed(2)}, 0.0, 1.0);
  float lift = (1.0 - smoothstep(0.0, ${SKY_LIFT_DEG.toFixed(2)}, e)) * ${SKY_LIFT.toFixed(2)};
  float tg = pow(t, 0.62);
  vec3 c = mix(uHorizon, uZenith, tg);
  // clean Chappuis/Rayleigh mid-sky bridge during golden hour, dawn & dusk (eliminates muddy grey mid-sky band)
  float warmBridge = smoothstep(0.18, 0.75, uSkyK.x) * (1.0 - smoothstep(0.58, 0.92, uNight)) * (1.0 - gStorm * 0.85);
  float midArch = sin(3.14159 * pow(t, 0.72));
  vec3 bridgeHue = mix(uHorizon * vec3(1.04, 0.82, 0.78), uZenith * vec3(1.02, 1.08, 1.24), smoothstep(0.25, 0.85, t));
  c = mix(c, max(c, bridgeHue * 0.94), midArch * warmBridge * 0.42);
  // crisp Mediterranean azure clarity in the upper daytime band (hero value lock preserved near horizon)
  float dayAzure = (1.0 - uNight) * (1.0 - gStorm * 0.8) * smoothstep(0.35, 1.0, t);
  c *= mix(vec3(1.0), vec3(0.95, 1.01, 1.08), dayAzure * 0.45);
  c = mix(c, uHorizon * 1.08, lift);
  if (gStorm < uStorm - 0.002) {
    // W01 clearing: behind the line the sky is the hour's own again
    vec3 cc = mix(uClearHor, uClearZen, tg);
    cc = mix(cc, uClearHor * 1.08, lift);
    c = mix(cc, c, gStorm / max(uStorm, 1e-3));
  }
  // ---- E22 twilight (calendar): the Earth's shadow, blue-grey on the horizon opposite the sun, under the pink belt
  //      of Venus; it rises as the sun sinks and fades through the blue hour. Hue, not value: the belt keeps the
  //      sky's own luminance (sub-bloom, below the Pharos), the shadow sits a step darker. Mirrored by the sea.
  if (uTwilight.x > 0.002) {
    float tk = uTwilight.x * smoothstep(-0.2, 1.0, cos(radians(th - uTwilight.y))) * (1.0 - smoothstep(0.35, 0.7, gCov));
    float tl = dot(c, vec3(0.299, 0.587, 0.114));
    float bd = (e - uTwilight.z - 0.5) / 0.42;
    c = mix(c, vec3(0.80, 0.90, 1.16) * tl * 0.78, (1.0 - smoothstep(uTwilight.z - 0.3, uTwilight.z + 0.15, e)) * tk * 0.65);
    c = mix(c, vec3(1.30, 0.80, 0.86) * tl * 1.05, exp(-bd * bd) * tk * 0.35);
  }
  // ---- atmospheric Mie horizon bloom toward sun / moon (broad warm aureole + tight luminous solar scatter)
  float dg = abs(th - uSunDisc.x);
  float glowSun = (exp(-dg / 34.0) * exp(-max(e, 0.0) / 4.2) * 0.68 + exp(-dg / 12.0) * exp(-max(e, 0.0) / 2.5) * 0.52) * uSunDisc.w;
  float dm = abs(th - uMoonDisc.x);
  // focused nocturnal moon aureole (keeps night sea horizon deep velvet indigo instead of a broad milky sheet)
  #ifdef SKY_REFLECTION
  float glowMoon = exp(-dm / 6.5) * exp(-max(e, 0.0) / 2.0) * uMoonDisc.w * 0.09;
  #else
  float glowMoon = exp(-dm / 14.0) * exp(-max(e, 0.0) / 3.4) * uMoonDisc.w * 0.48;
  #endif
  // Below the strict horizon boundary the final result is always exactly hazeC; no hidden layer contributes.
  vec3 hazeC = uHaze + uGlowCol * (glowSun + glowMoon) * uSkyK.x * 0.40;
  hazeC = mix(hazeC, mix(uHorizon, uSunColor, 0.25) * 1.15, (1.0 - smoothstep(0.84, 0.97, gCov)) * smoothstep(0.2, 0.6, gStorm) * 0.3 * (1.0 - 0.6 * uNight));
  if (e < 0.0) return hazeC;
  c += uGlowCol * (glowSun + glowMoon) * uSkyK.x * 0.62;
  // overcast greys the sky
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(lum) * vec3(0.96, 0.98, 1.02), smoothstep(0.4, 1.0, gCov) * 0.5);

#ifndef SKY_REFLECTION
  // ---- stars (W05): crisp varied-magnitude navigational starfield + micro-star dust with authentic colour temperatures
  if (uSkyK.w > 0.01 && e > 0.22) {
    float clear = 1.0 - gCov * 0.72;
    float fadeE = smoothstep(0.22, 1.35, e);
    float twA = mix(0.32, 0.08, smoothstep(0.8, 5.2, e));
    for (int L = 0; L < 3; L++) {
      float cellDeg = L == 0 ? 0.28 : (L == 1 ? 0.56 : 1.35);
      vec2 sp = vec2(th, e) / cellDeg;
      vec2 cid = floor(sp) + float(L) * 71.0, f = fract(sp) - 0.5;
      float h = sbHash(cid + 17.0);
      float thresh = L == 0 ? 0.11 : (L == 1 ? 0.17 : 0.20);
      if (h < thresh) {
        vec2 jit = vec2(sbHash(cid + 3.1), sbHash(cid + 8.4)) - 0.5;
        float d = length((f - jit * 0.72) * cellDeg) / max(pxDeg, 1e-4);
        float m = sbHash(cid + 5.5);
        // authentic power-law magnitude distribution: many faint pinpoints, rare jewel-like 1st-magnitude stars
        float bright = L == 0 ? pow(m, 3.2) * 0.85 + 0.16 : (L == 1 ? pow(m, 2.8) * 1.9 + 0.35 : pow(m, 2.2) * 3.4 + 0.95);
        float tw = 1.0 - twA + twA * sin(uNightSky.y * (1.2 + 14.0 * h) + h * 43.0);
        float temp = sbHash(cid + 9.7);
        vec3 sc = temp < 0.16 ? vec3(1.0, 0.79, 0.56)
          : temp < 0.38 ? vec3(1.0, 0.94, 0.84)
          : temp > 0.84 ? vec3(0.70, 0.84, 1.18)
          : vec3(0.89, 0.93, 1.0);
        float coreR = L == 0 ? 0.78 : (L == 1 ? 0.95 : 1.15);
        float psf = exp(-d * d / (coreR * coreR * 0.45));
        // subtle airy glow only on brightest 1st-magnitude stars
        float halo = L == 2 ? exp(-d * 0.55) * 0.22 * smoothstep(0.65, 1.0, m) : 0.0;
        c += sc * (psf + halo) * bright * tw * uSkyK.w * fadeE * clear;
      }
    }
    // W05 the Milky Way on clear nights: serene painterly celestial arch with dark obscuring dust rifts
    if (uNightSky.x > 0.01) {
      float mth = th + uNightSky.z;
      float axis = e - (4.2 + 2.1 * sin(radians(mth) * 1.25));
      float n1 = texture2D(uSkyNoise, vec2(mth * 0.019 + 0.17, e * 0.085 + 0.43)).r;
      float n2 = texture2D(uSkyNoise, vec2(mth * 0.064 + 0.61, e * 0.22 + 0.09)).g;
      float n3 = texture2D(uSkyNoise, vec2(mth * 0.14 + 0.29, e * 0.42 + 0.73)).b;
      float width = 1.05 + 0.55 * n1;
      // E23: the band leans through the visible band instead, from its foot on the horizon out of the frame top:
      //      narrower, ragged-edged and clumped into star clouds (a smooth shaft would read as a second beam)
      if (uMilkyWay.x > 0.5) {
        axis = (th - uMilkyWay.z) * uMilkyWay.y - e * uMilkyWay.w + (n2 - 0.5) * 0.7;
        width = 0.45 + 0.4 * n1;
      }
      float body = exp(-axis * axis / (width * width)) * (0.42 + 0.68 * n1 + 0.22 * n3);
      if (uMilkyWay.x > 0.5) body *= 0.2 + 1.3 * smoothstep(0.25, 0.85, texture2D(uSkyNoise, vec2((th - uMilkyWay.z) * 0.21 + 0.29, e * 0.33 + 0.71)).b);
      float dust = smoothstep(0.52, 0.80, n2) * exp(-axis * axis / 0.42) * 0.52;
      float coreK = uNightSky.w * smoothstep(0.25, 1.0, cos(radians(mth)));
      vec3 mwCol = mix(vec3(0.72, 0.79, 0.98), vec3(0.96, 0.89, 0.84), coreK * 0.45);
      vec3 mw = mwCol * body * (1.0 - dust) * (1.0 + 0.85 * coreK);
      vec3 mwAdd = mw * uNightSky.x * 0.115 * fadeE * (1.0 - gCov * 0.72);
      if (uMilkyWay.x > 0.5) {
        // E23: 2.5x the river's own light under a fixed palette cap, so the river never outranks the fire
        mwAdd = mw * uNightSky.x * 0.06 * fadeE * (1.0 - gCov * 0.7);
        mwAdd *= 2.5;
        mwAdd *= clamp((${MILKY_WAY_CAP.toFixed(3)} - dot(c, vec3(0.299, 0.587, 0.114))) / max(dot(mwAdd, vec3(0.299, 0.587, 0.114)), 1e-5), 0.0, 1.0);
      }
      c += mwAdd;
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
  // ---- high-altitude wispy cirrus mare's-tail streaks catching golden-hour peach/gold & crisp noon sun
  float cir = 0.0;
#ifndef SKY_REFLECTION
  {
    // graceful sweeping mare's-tail cirrus streaks arcing softly across the upper sky (quiet at night: no bright grey loops)
    float thc = th + uParallax.w * 0.55 + uWeather.z * 1.6;
    float pres = smoothstep(0.40, 0.74, texture2D(uSkyNoise, vec2(thc * 0.0086 + 0.21, e * 0.032 + 0.6)).r);
    float sweep = sin(thc * 0.052 + 1.1) * 0.52;
    vec2 q = vec2(thc * 0.024, (e + sweep) * 0.18);
    float warp = texture2D(uSkyNoise, q * vec2(0.55, 1.35) + 0.17).g - 0.5;
    float n1 = texture2D(uSkyNoise, vec2(q.x * 0.95, q.y * 2.8 + warp * 0.9)).r;
    float n2 = texture2D(uSkyNoise, vec2(q.x * 3.2 + 0.31, q.y * 9.8 + warp * 1.9)).b;
    float fil = smoothstep(0.45, 0.80, n1 * 0.64 + n2 * 0.48);
    float band = smoothstep(1.25, 2.75, e) * (1.0 - smoothstep(8.5, 14.0, e));
    float nightCir = 1.0 - 0.86 * smoothstep(0.25, 0.75, uNight);
    cir = fil * pres * band * (0.52 + 0.48 * gCov) * (1.0 - gStorm * 0.80) * 0.54 * nightCir * uSeasonSky.x;
    float sunNear = exp(-abs(th - uSunDisc.x) / 42.0) * (1.0 - uNight);
    float moonNear = exp(-abs(th - uMoonDisc.x) / 24.0) * uNight;
    vec3 cirCol = mix(uCloudLight, uCloudRim * 1.16, 0.42 + 0.44 * sunNear) * mix(1.0, 0.32 + 0.30 * moonNear, uNight);
    c = mix(c, cirCol, cir);
    // W10 autumn: a mackerel (altocumulus) band, small rippled cells in rows, as thin as the cirrus
    if (uSeasonSky.y > 0.01) {
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
    c = sbCloudBank(i, th, e, pxDeg, c, Lc, hazeC);
  }
#endif
  // ---- storm deck: a low brooding slate overcast rolling over the band, with rain veils hanging to the horizon.
  //      At night the deck closes (no moonlit cumulus under a starry sky while it rains): broken at WATCH, the
  //      stars and the moon showing only through a few breaks, shut from ALERT up.
  float nightDeck = skyNightDeck(th, e);
  float strip = 0.0;
  float deckSeam = 0.5, deckDn = 0.5;
  if (gStorm > 0.002 || nightDeck > 0.002) {
    float thd = th + uWeather.z * 2.0;
    float dn = texture2D(uSkyNoise, vec2(thd * 0.011, e * 0.05 + 0.13)).r * 0.7 + texture2D(uSkyNoise, vec2(thd * 0.034, e * 0.13) + 0.31).g * 0.4;
    // W02 structure: brooding thunderhead cells with darker bellies, luminous seams, and low wind-aligned rolls
    float cn = texture2D(uSkyNoise, vec2(thd * 0.055 + 0.37, e * 0.42 + 0.11)).g;
    float seam = 1.0 - abs(cn * 2.0 - 1.0);
    deckSeam = seam; deckDn = dn;
    float roll = 0.5 + 0.5 * sin(e * 2.3 + (texture2D(uSkyNoise, vec2(thd * 0.008, 0.83)).r - 0.5) * 5.0);
    // W02: a pale strip of clear sky under the deck at the far horizon, closing at DANGER
    strip = smoothstep(0.15, 0.4, e) * (1.0 - smoothstep(0.75, 1.5, e)) * (1.0 - smoothstep(0.84, 0.97, gCov)) * smoothstep(0.2, 0.6, gStorm);
    float deckA = smoothstep(0.30, 0.70, dn + e * 0.05) * smoothstep(0.1, 1.4, e) * gStorm;
    deckA = max(deckA, smoothstep(0.9, 1.9, e) * smoothstep(0.55, 0.9, gStorm) * 0.92) * (1.0 - strip * 0.9);
    vec3 deckC = mix(uCloudShade, uCloudMid, 0.18 + 0.46 * smoothstep(0.42, 0.92, dn));
    float ld = dot(deckC, vec3(0.299, 0.587, 0.114));
    // deep Prussian-slate storm cells (cold blue-grey, never warm stale-data fog #A3A09B)
    deckC = mix(deckC, vec3(ld) * vec3(0.82, 0.92, 1.08), 0.72) * 0.78;
    // suppress ridged seam/roll contour loops completely on clear/WATCH nights (uNight > 0.3 && gStorm < 0.35)
    float nightCalm = smoothstep(0.30, 0.60, uNight) * (1.0 - smoothstep(0.25, 0.55, gStorm));
    float stormMod = smoothstep(0.15, 0.50, gStorm) * (1.0 - nightCalm);
    gDeckS = mix(1.0, mix(0.76, 1.15, smoothstep(0.32, 0.94, seam)) * mix(0.92, 1.06, roll), stormMod);
    deckC *= mix(gDeckS, 1.0, uDeckK.x);
    gDeckA = max(deckA, nightDeck * smoothstep(0.3, 0.6, gStorm));
    // silver-lined atmospheric breaks between storm cells in ALERT/WARNING (sealing shut at DANGER)
    float cellBreak = smoothstep(0.76, 0.96, seam * (0.65 + 0.45 * dn)) * (1.0 - smoothstep(0.80, 0.96, gCov)) * (1.0 - uNight * 0.75);
    deckC += mix(uCloudRim, vec3(0.86, 0.93, 1.04), 0.55) * cellBreak * 0.22;
    // the closed night deck: smooth, quiet velvet indigo-slate veil at WATCH (zero oil-slick contour rings), brooding cover from ALERT+
    float nightVeil = nightDeck * mix(0.26, 0.94, smoothstep(0.34, 0.58, gCov)) * smoothstep(0.20, 1.45, e + (dn - 0.5) * 0.75);
    vec3 nightC = mix(uZenith, uCloudShade, 0.65) * (0.78 + 0.24 * smoothstep(0.25, 0.85, dn)) * mix(1.0, 0.70, smoothstep(1.0, 7.0, e));
    c = mix(c, mix(deckC, nightC, nightDeck), max(deckA * 0.93, nightVeil));
    float vx = texture2D(uSkyNoise, vec2(thd * 0.021, 0.37)).g;
    float streak = texture2D(uSkyNoise, vec2(thd * 0.5 + e * 0.35, e * 0.03)).b;
    float veil = smoothstep(0.55, 0.78, vx) * (1.0 - smoothstep(0.2, 3.0, e)) * smoothstep(0.35, 0.9, gStorm);
    c = mix(c, deckC * 0.90, veil * (0.4 + 0.35 * streak) * (1.0 - strip * 0.7));
    // the strip: the far sea-sky still in sun beyond the storm (marine-painting light)
    vec3 stripC = mix(uHorizon, uSunColor, 0.25) * 1.25 + uGlowCol * uSkyK.x * 0.15;
    c = mix(c, stripC, strip * 0.55 * (1.0 - 0.6 * uNight));
  }
  // ---- W01 shelf cloud: a dark rolled lip on the front's leading edge (rising only), its crown lit from above
  if (uFrontB.w > 0.5 && uFrontA.w > uFrontA.z + 0.05) {
    float sd = uFrontB.y * (th - uFrontB.x) - e * 0.6;
    float wob = texture2D(uSkyNoise, vec2(th * 0.03 + 0.7, 0.37)).g - 0.5;
    float lipTop = 2.3 + wob * 0.8 - 0.12 * sd, lipBot = 0.75 + wob * 0.4;
    float lip = (1.0 - smoothstep(-0.5, 2.5, sd)) * smoothstep(-14.0, -4.0, sd)
      * smoothstep(lipBot - 0.15, lipBot + 0.2, e) * (1.0 - smoothstep(lipTop - 0.25, lipTop + 0.1, e));
    float k = clamp((uFrontA.w - uFrontA.z) * 1.6, 0.0, 1.0);
    vec3 lipC = mix(uCloudShade, uCloudMid, 0.15) * vec3(0.84, 0.92, 1.06) * 0.62;
    lipC = mix(lipC, uCloudRim * 0.8 + uSunColor * 0.1, smoothstep(lipTop - 0.55, lipTop - 0.1, e) * 0.45 * (1.0 - uNight * 0.7));
    c = mix(c, lipC, lip * k * 0.9);
  }
  // ---- lightning: volumetric cloud-interior sheet illumination bursting through thunderhead seams
  if (uPrecipSky.z > 0.002) {
    vec2 fOff = vec2((th - uPrecipSky.w) / 10.5, (e - uPrecipSkyB.x) / 3.2);
    float fd = length(fOff);
    float body = smoothstep(0.08, 1.15, e) * (0.4 + 0.6 * uStorm);
    // cloud fissures blaze brightly while dense foreground thunderhead bellies stay dramatically silhouetted
    float fissure = smoothstep(0.24, 0.88, deckSeam * 0.72 + (1.0 - deckDn) * 0.42);
    float coreGlow = exp(-fd * fd * 1.35) * (0.85 + 1.55 * fissure);
    float sheetGlow = exp(-fd * 0.52) * (0.28 + 0.62 * fissure);
    float seaBounce = exp(-abs(th - uPrecipSky.w) / 18.0) * (1.0 - smoothstep(0.0, 1.6, e)) * 0.24;
    vec3 coreCol = vec3(0.92, 0.95, 1.0);
    vec3 scatterCol = vec3(0.58, 0.70, 1.0);
    c += (coreCol * coreGlow * 1.65 * body + scatterCol * (sheetGlow * 0.85 * body + seaBounce + 0.10)) * uPrecipSky.z;
  }
  // ---- W03 sunbreaks: faint crepuscular shafts fanning down from the sun through the gaps in the cloud
  //      (E22: on a clear dawn the low sun throws them up through the bank beside it instead)
  float rayK = max(uSquall.z, uTwilight.w);
  if (rayK > 0.002 && uSunDisc.w > 0.01) {
    vec2 v = vec2(th - uSunDisc.x, e - uSunDisc.y);
    float dawnRays = step(uSquall.z, uTwilight.w - 0.002);
    v.y *= 1.0 - 2.0 * dawnRays;
    if (v.y < 0.0) {
      float r = length(v);
      float rays = smoothstep(0.5, 0.9, sbNoise1(atan(v.x, -v.y) * 9.0 + 3.0, 7.0));
      float gap = max(smoothstep(0.4, 0.7, texture2D(uSkyNoise, vec2((th + uWeather.z * 2.0) * 0.02 + 0.4, e * 0.08 + 0.2)).g), dawnRays);
      c += uSunColor * rays * gap * exp(-r / mix(9.0, 4.5, dawnRays)) * smoothstep(0.3, 1.5, r) * rayK * uSunDisc.w * 0.16;
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
  // ---- distant Aegean archipelago: 3 softly recessed Cycladic ridge silhouettes reading at 12-22% atmospheric contrast
  float dlh = sign(uLight.x - th + 1e-3);
  float islandCov = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float sh = k == 0 ? uParallax.x : (k == 1 ? uParallax.y : uParallax.z);
    float tth = th + sh;
    float hmax = k == 0 ? 1.95 : (k == 1 ? 1.28 : 0.72);
    // Island profile and envelope are in [0, 1], so H <= hmax; coverage above this AA bound is exactly zero.
    float aaW = pxDeg * (k == 0 ? 1.65 : (k == 1 ? 1.30 : 1.05));
    if (e > hmax + aaW) continue;
    float fr = k == 0 ? 0.068 : (k == 1 ? 0.095 : 0.135);
    float seed = 2.0 + fk * 13.0;
    float H = sbHill(tth, seed, hmax, fr);
    if (H < 0.015) continue;
    float cov = 1.0 - smoothstep(-aaW, aaW, e - H);
    if (cov <= 0.0) continue;
    islandCov = max(islandCov, cov);
    float dH = (sbHill(tth + 0.18, seed, hmax, fr) - sbHill(tth - 0.18, seed, hmax, fr)) / 0.36;
    float lit = smoothstep(-0.12, 0.42, -dH * dlh) * clamp(sin(uLight.y) * 2.0 + 0.35, 0.0, 1.0);
    vec3 mc = mix(uMount, uMountLit, lit * 0.72);
    // subtle winter/distant high-peak mist highlight on the farthest massif
    if (k == 0) mc = mix(mc, mix(vec3(0.92, 0.94, 1.0), uMountLit, 0.3), uSkyK.z * smoothstep(0.66, 0.92, e / max(hmax, 1e-3)) * smoothstep(0.72, 1.0, H / hmax) * 0.6);
    // balanced aerial perspective: 12-22% readable Cycladic atmospheric contrast with softly misted waterline foot
    float hz = k == 0 ? 0.48 : (k == 1 ? 0.32 : 0.18);
    float baseFade = (1.0 - smoothstep(0.0, H * 0.56 + 0.06, e)) * 0.28;
    float sunMelt = glowSun * uSkyK.x * (k == 0 ? 0.16 : (k == 1 ? 0.10 : 0.05));
    // under a storm deck the far shore drowns in the murk (visibility, not fog)
    mc = mix(mc, hazeC, clamp(hz + baseFade + sunMelt + gStorm * 0.35, 0.0, 0.74 + 0.16 * gStorm));
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
  // ---- E24: the deck's cells and rolls land after the grey grading (W02 was crushed into a slab), ±25 % at most
  if (uDeckK.x > 0.5) c *= 1.0 + clamp((gDeckS - 1.0) * uDeckK.y, -0.25, 0.25) * gDeckA;
  // ---- horizon haze band (softly mists island foot into sea haze & stale sea-smoke while preserving upper Cycladic crests)
  float hzb = 1.0 - smoothstep(-0.04, 0.52, e);
  float islandPreserve = 1.0 - islandCov * 0.55 * smoothstep(0.28, 0.62, e);
  c = mix(c, hazeC, hzb * 0.84 * islandPreserve);
  return c;
}
`;
