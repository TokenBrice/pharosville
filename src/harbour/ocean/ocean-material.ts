import { CLOUD_SHADOW_GLSL } from "../sky/cloud-shadow";
import { SWELL_DIR, wavesGLSL } from "./waves";

/** Style C sea ramp (sRGB hex, palette.json) + the A-graft sunlit shallows. */
export const SEA_PALETTE = {
  abyss: "#0F2F47",
  deep: "#123A52",
  mid: "#194C5E",
  shallow: "#21615F",
  shoal: "#4F8A80",
  sunlitShoal: "#55B5A6",
  foam: "#F6F7F2",
  foamNight: "#B9C8E6",
};

export const OCEAN_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec4 uSea;            // x amplitude scale, y chop, z whitecaps, w foam bands
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
varying vec3 vWorld;
varying float vDamp;
${wavesGLSL()}
void main() {
  vec3 p = position;
  vec2 suv = (p.xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float coast = mix(200.0, (textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0).r - 0.5) * 128.0, inside);
  float damp = smoothstep(0.0, 34.0, coast) * 0.9 + 0.1 * smoothstep(-2.0, 2.0, coast);
  float camD = length(p.xz - uCameraPos.xz);
  float amp = uSea.x * damp * (1.0 - smoothstep(2500.0, 5000.0, camD));
  p += gerstnerDisp(p.xz, uTime, amp);
  vWorld = p;
  vDamp = damp;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

export const OCEAN_FRAG = /* glsl */ `
uniform float uTime, uNight;
uniform vec3 uCameraPos, uSunDir, uSunColor, uAmbient, uZenith;
uniform vec4 uSea;
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
uniform sampler2D uWake, uWakeLive;
uniform vec4 uWakeBounds;
uniform sampler2D uNoise, uRipple;
uniform vec3 uAbyss, uDeep, uMid, uShallow, uShoal, uSunlitShoal, uFoamCol, uFoamNight;
// sky (shared from the sky service)
uniform sampler2D uSkyBand;
uniform vec4 uSkyBandRange;
uniform float uFwdAz, uHorizonDist, uHorizonDepr;
uniform vec3 uGlintDir, uGlintCol;
uniform vec4 uWeatherSea;     // cover, wind, wind dir x, wind dir z
// beam (shared from the beam system)
uniform vec3 uBeamPos, uBeamCol;
uniform float uBeamAngle;
uniform vec4 uBeamShape;
uniform float uDebug;
uniform vec2 uSceneCenter;
uniform float uSceneRadius;
varying vec3 vWorld;
varying float vDamp;
${wavesGLSL()}
${CLOUD_SHADOW_GLSL}

const vec2 SWELL = vec2(${SWELL_DIR[0].toFixed(5)}, ${SWELL_DIR[1].toFixed(5)});

vec3 band(float th, float e, float lod) {
  vec2 uv = vec2((th - uSkyBandRange.x) / (uSkyBandRange.y - uSkyBandRange.x), (e - uSkyBandRange.z) / (uSkyBandRange.w - uSkyBandRange.z));
  vec3 c = textureLod(uSkyBand, clamp(uv, vec2(0.002), vec2(0.998)), lod).rgb;
  // above the band: continue to the zenith
  return mix(c, uZenith, smoothstep(uSkyBandRange.w - 2.0, uSkyBandRange.w + 18.0, e));
}
float wrapPi(float a) { return atan(sin(a), cos(a)); }

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
  float coast = mix(220.0, (sdf.r - 0.5) * 128.0, inside);
  float depth = mix(40.0, sdf.g * 40.0, inside);
  float sdist = mix(16.0, sdf.b * 16.0, inside);
  vec2 wuv = (xz - uWakeBounds.xy) / (uWakeBounds.zw - uWakeBounds.xy);
  vec2 wedge = min(wuv, 1.0 - wuv);
  float winside = step(0.0, min(wedge.x, wedge.y));
  float trail = texture2D(uWake, wuv).r * winside;
  vec4 live = texture2D(uWakeLive, wuv) * winside;

  vec4 nA = texture2D(uNoise, xz * 0.0023);
  vec4 nB = texture2D(uNoise, xz * 0.017 + t * vec2(0.0035, -0.0026));
  vec4 nC = texture2D(uNoise, xz * 0.093 + t * vec2(0.012, 0.004));

  // cat's paws: drifting patches of wind-roughened water vs glassy slicks
  vec2 pawUv = xz * 0.0019 - wdir * t * (0.004 + 0.012 * wind);
  float paws = smoothstep(0.38, 0.7, texture2D(uNoise, pawUv).g * 0.7 + texture2D(uNoise, pawUv * 2.7 + 0.3).b * 0.45);
  float rough = mix(0.35, 1.0, paws) * (0.75 + 0.5 * wind);

  // ---------------------------------------------------------------- normals
  float far01 = smoothstep(250.0, 1300.0, camD);
  float amp = uSea.x * vDamp;
  float groups = 0.45 + 1.1 * smoothstep(0.2, 0.8, nA.r * 0.7 + texture2D(uNoise, xz * 0.0011 + vec2(t * 0.0009, 0.0)).b * 0.5);
  // shading exaggerates a calm swell (soft-capped so rough seas don't turn to mirrors), in wave groups
  float ampShade = 0.9 * (1.0 - exp(-amp * mix(2.6, 2.0, far01) / 0.9));
  vec3 gN = gerstnerNormal(xz, t, ampShade * groups);
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  float sp = 0.6 + 1.2 * wind;
  vec4 r1 = texture2D(uRipple, xz * 0.043 + wdir * t * 0.010 * sp);
  vec4 r2 = texture2D(uRipple, (rot * xz) * 0.107 - vec2(wdir.y, -wdir.x) * t * 0.014 * sp);
  vec4 r3 = texture2D(uRipple, (rot * rot * xz) * 0.0093 + wdir * t * 0.0025);
  vec2 d1 = r1.rg * 2.0 - 1.0, d2 = r2.rg * 2.0 - 1.0, d3 = r3.rg * 2.0 - 1.0;
  float shoreCalm = mix(0.45, 1.0, smoothstep(1.0, 18.0, coast));
  float dk = (0.16 + 0.12 * uSea.y) * rough * shoreCalm;
  vec2 dn = (d1 * (1.0 - far01 * 0.7) + d2 * 0.75 * (1.0 - far01) + d3 * (0.45 + 0.5 * far01)) * dk;
  // wakes rough up the surface
  dn += (d2 - d1) * 0.25 * clamp(trail + live.r, 0.0, 1.0);
  vec3 N = normalize(vec3(gN.x + dn.x, gN.y, gN.z + dn.y));
  vec3 Nsp = normalize(vec3(gN.x + (d1.x + d2.x * 1.4) * 0.5, 1.0, gN.z + (d1.y + d2.y * 1.4) * 0.5)); // sharp, for sparkle

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
  // A graft: sunlit teal shallows (light reaching the sand)
  float shoalK = (1.0 - smoothstep(0.3, 4.5, max(dep, depth))) * sunUp;
  body = mix(body, uSunlitShoal, shoalK * (0.22 + 0.3 * smoothstep(0.3, 0.75, nA.b) + 0.1 * nC.g));
  // sunlit caustic shimmer over the shallow shelf
  float caus = smoothstep(0.86, 0.99, 1.0 - abs(r1.a - r2.a)) * (1.0 - smoothstep(0.5, 4.0, dep)) * sunUp;
  body += uSunlitShoal * caus * 0.18;
  // churned wake water is lighter and greener
  body = mix(body, uShoal * 1.35 * mix(1.0, 0.45, uNight), clamp(trail * 0.25 + live.r * 0.2, 0.0, 0.35));
  // hull occlusion
  body *= 1.0 - live.b * 0.4;
  // swell and ripple relief: facets tilted toward the key light read lighter (zero-mean, so the tint holds)
  {
    vec3 Lk = normalize(uSunDir + vec3(0.0, 0.6, 0.0));
    float relief = dot(N, Lk) - Lk.y;
    body *= 1.0 + clamp(relief * 2.2, -0.35, 0.35) * (1.0 - far01 * 0.6);
  }
  // day/night exposure of the unlit tint
  float bodyGain = mix(0.95, 0.36, uNight);
  body *= bodyGain;
  body = mix(body, body * normalize(uAmbient + 1e-4) * 1.6, uNight * 0.6);

  // ---------------------------------------------------------------- reflection of the painted sky
  vec3 vd = -V;
  vec3 R = reflect(vd, N);
  R.y = max(R.y, 0.01);
  // the sky band is reflected through a smoothed normal (swell + a little ripple): a low-frequency,
  // view-dependent sheen; ripple-scale detail is left to the sparkle path, so no blotches tile the bay
  vec3 Nr = normalize(vec3((gN.x + dn.x * 0.3) * 0.6, gN.y, (gN.z + dn.y * 0.3) * 0.6));
  vec3 Rr = reflect(vd, Nr);
  Rr.y = max(Rr.y, 0.01);
  float thR = degrees(wrapPi(atan(Rr.x, -Rr.z) - uFwdAz));
  float eR = degrees(asin(clamp(Rr.y, -1.0, 1.0)) - uHorizonDepr);
  vec3 sky = band(thR, eR, 2.6 + 1.2 * rough + clamp(eR * 0.12, 0.0, 1.8));
  float NdV = max(dot(Nr, V), 0.0);
  float F = 0.03 + 0.97 * pow(1.0 - NdV, 5.0);
  F = min(F * (0.8 + 0.5 * rough), 0.6);
  vec3 col = body * (1.0 - F) + sky * F;

  // ---------------------------------------------------------------- sun / moon glitter path
  // a column under the painted disc (envelope from a calmer normal), twinkling facets inside it
  vec3 gT = gerstnerNormal(xz, t, amp * groups);                     // true swell for the glitter path
  vec3 Nenv = normalize(vec3(gT.x + dn.x * 0.15, gT.y, gT.z + dn.y * 0.15));
  float rsE = max(dot(reflect(vd, Nenv), uGlintDir), 0.0);
  float rs = max(dot(R, uGlintDir), 0.0);
  float rsp = max(dot(reflect(vd, Nsp), uGlintDir), 0.0);
  float tw = smoothstep(0.6, 0.9, r2.a * 0.6 + r1.a * 0.4 + 0.22 * sin(t * 2.3 + nC.a * 30.0));
  float env = pow(rsE, 70.0);
  float overcast = 1.0 - 0.9 * smoothstep(0.35, 0.8, uWeatherSea.x);
  vec3 glint = uGlintCol * (env * 0.1 + pow(rsE, 30.0) * 0.01 + (pow(rs, 260.0) * 1.6 + pow(rsp, 900.0) * 3.0) * tw * (0.08 + 0.92 * env));
  // crest glints everywhere by day (facets catching a broad virtual light)
  vec3 Hs = normalize(normalize(uGlintDir + vec3(0.0, 0.6, 0.0)) + V);
  float facet = pow(max(dot(Nsp, Hs), 0.0), 1400.0) * smoothstep(0.5, 0.8, nB.a) * (1.0 - far01 * 0.85);
  float sparkMask = smoothstep(0.45, 0.85, nC.a + 0.25 * nB.b);
  glint += uSunColor * facet * 0.7 * sunUp;

  // ---------------------------------------------------------------- low-sun sheen on the far water toward the sun (style C)
  {
    vec2 fromC = xz - uSceneCenter;
    float rc = length(fromC) + 1.0;
    vec2 sunH = normalize(uSunDir.xz + 1e-4);
    float sd = clamp(dot(fromC / rc, sunH), 0.0, 1.0);
    float lowSun = 1.0 - smoothstep(0.12, 0.6, uSunDir.y);
    float sheen = pow(sd, 3.0) * smoothstep(uSceneRadius * 0.35, uSceneRadius * 1.3, rc) * lowSun * (1.0 - uNight);
    col += normalize(uSunColor + 1e-4) * sheen * 0.5 * (0.6 + 0.4 * rough);
  }
  // ---------------------------------------------------------------- far band: swell lines + crest glints
  float swPh = dot(xz, SWELL) * 0.105 - t * 0.55 + (nA.b - 0.5) * 7.0;
  float crest = pow(0.5 + 0.5 * sin(swPh), 14.0) * smoothstep(0.5, 0.72, nA.a + 0.2 * nB.r) * smoothstep(0.3, 0.6, nC.b);
  float farBand = smoothstep(600.0, 1100.0, camD) * (1.0 - smoothstep(uHorizonDist * 0.85, uHorizonDist * 0.99, fwdD));
  col += sky * crest * farBand * 0.12 * (0.6 + uSea.y);
  float dash = smoothstep(0.55, 0.8, nC.r * 0.6 + nB.g * 0.5);
  glint += uGlintCol * crest * dash * farBand * env * 0.35 + uSunColor * crest * farBand * smoothstep(0.75, 0.95, nC.b) * 0.06 * sunUp;

  // ---------------------------------------------------------------- lighthouse beam sweeping the water
  vec3 beam = vec3(0.0);
  if (uBeamPos.y > -100.0 && dot(uBeamCol, vec3(1.0)) > 0.001) {
    vec2 rel = xz - uBeamPos.xz;
    float dist = length(rel);
    vec3 Lb = normalize(uBeamPos - vWorld);
    vec3 Hb = normalize(Lb + V);
    float bspec = pow(max(dot(Nsp, Hb), 0.0), 260.0);
    for (int k = 0; k < 2; k++) {
      float a = uBeamAngle + float(k) * 3.14159265;
      vec2 bd = vec2(cos(a), sin(a));
      float along = dot(rel, bd);
      float lat = abs(rel.x * bd.y - rel.y * bd.x);
      float w = 2.0 + along * tan(uBeamShape.y) * 1.25;
      float foot = exp(-pow(lat / w, 2.0) * 1.6) * smoothstep(0.0, 40.0, along) * exp(-along / (uBeamShape.x * 0.55));
      beam += uBeamCol * foot * (0.05 + bspec * 7.0 * sparkMask);
    }
    // the lantern's own reflection column toward the camera (flashes by day when a beam faces the camera)
    float lr = max(dot(R, Lb), 0.0);
    beam += uBeamCol * (pow(lr, 900.0) * 6.0 * sparkMask + pow(lr, 120.0) * 0.4) * (0.25 + uBeamShape.w);
  }

  // ---------------------------------------------------------------- foam
  float bands = uSea.w;
  float dnC = coast + (nB.r - 0.5) * 2.4 + (nC.g - 0.5) * 0.8;
  float fContact = 1.0 - smoothstep(0.25, 1.05, dnC);
  float lap = sin(t * 0.55 + nA.b * 6.2831) ;
  float p2 = 2.6 + 0.7 * lap;
  float band2 = (1.0 - smoothstep(0.16, 0.42, abs(dnC - p2))) * smoothstep(0.42, 0.58, nB.g);
  float p3 = 6.0 + 0.9 * sin(t * 0.42 + 1.7 + nA.g * 6.2831);
  float band3 = (1.0 - smoothstep(0.12, 0.34, abs(dnC - p3))) * smoothstep(0.52, 0.64, nC.r) * 0.55;
  float coastFoam = max(fContact, max(band2 * 0.9, band3) * bands) * step(-1.0, coast);
  float sdN = sdist + (nC.g - 0.5) * 0.6;
  float fStruct = (1.0 - smoothstep(0.0, 0.3, sdN)) * 0.3 * smoothstep(0.35, 0.6, nC.g + 0.2) + (1.0 - smoothstep(0.08, 0.22, abs(sdN - 1.1))) * smoothstep(0.62, 0.75, nC.b) * 0.25;
  // broken, translucent foam: noise eats the wake so it reads as lines of bubbles, not ribbons
  float fTrail = smoothstep(0.25, 0.85, trail * (0.2 + 1.3 * nC.g * nB.b * 1.6)) * (0.4 + 0.35 * smoothstep(0.4, 1.0, trail));
  float fKel = smoothstep(0.07, 0.38, live.r * (0.45 + 1.0 * nC.r)) * 0.85;
  float fRing = smoothstep(0.3, 0.75, live.g * (0.35 + 1.0 * nC.b)) * 0.5;
  float crestH = gerstnerCrest(xz, t);
  float caps = smoothstep(0.82 - 0.1 * storm, 0.97, crestH * 0.55 + nB.a * 0.55 + nC.r * 0.12) * uSea.z * smoothstep(25.0, 90.0, coast);
  // scattered whitecap flecks riding the crests across the whole bay once the declared sea is choppy
  // (uSea.z > 0: off-peg step 2+), so a rough sea reads at the heart view, not only in patches (readings)
  if (uSea.z > 0.01) {
    float fl = texture2D(uNoise, xz * 0.029 + wdir * t * 0.006).a * 0.55 + nC.r * 0.4 + crestH * 0.4;
    caps = max(caps, smoothstep(0.82 - 0.05 * uSea.z, 0.93, fl) * smoothstep(0.0, 0.6, uSea.z) * (1.0 - far01 * 0.5) * smoothstep(25.0, 90.0, coast));
  }
  // wind-driven foam streaks (spindrift lanes) in rough weather, aligned with the wind
  vec2 wl = vec2(dot(xz, wdir), dot(xz, vec2(-wdir.y, wdir.x)));
  float lane = texture2D(uNoise, vec2(wl.x * 0.0035 - t * 0.004, wl.y * 0.045)).g * 0.75 + texture2D(uNoise, vec2(wl.x * 0.011, wl.y * 0.13) + 0.41).b * 0.4;
  float streaks = smoothstep(0.7, 0.88, lane) * smoothstep(0.35, 1.0, storm) * smoothstep(20.0, 70.0, coast) * (0.35 + 0.65 * nC.r);
  caps = max(caps, streaks * 0.75);
  float foam = clamp(max(max(coastFoam, fStruct), max(max(fTrail, fKel), max(fRing, caps))), 0.0, 1.0);
  foam *= 1.0 - smoothstep(uHorizonDist * 0.86, uHorizonDist * 0.99, fwdD);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 foamLit = mix(uFoamCol, uFoamNight, uNight * 0.6) * (uAmbient * 1.1 + uSunColor * (0.25 + 0.75 * ndl) * 0.3183);

  // visible low swell: crests catch the sky, troughs hold the body colour
  {
    float sk = smoothstep(0.04, 0.5, amp) * (1.0 - far01 * 0.6);
    float ch = crestH * 1.6 + (nB.g - 0.5) * 0.5;
    col += mix(sky, uSunColor * 0.12, 0.3) * smoothstep(0.2, 0.95, ch) * 0.15 * sk;
    col *= 1.0 - 0.15 * smoothstep(0.1, -0.9, ch) * sk;
  }
  float cShade = hbCloudShadow(xz);
  col *= mix(1.0, cShade, 0.55);
  col += glint * overcast * (1.0 - foam) * cShade;
  col += beam * (1.0 - foam * 0.5);
  col = mix(col, foamLit, foam);

  // ---------------------------------------------------------------- horizon haze (meets the painted backdrop exactly)
  float thV = degrees(wrapPi(atan(vd.x, -vd.z) - uFwdAz));
  vec3 hazeC = band(thV, 0.15, 0.0);
  // gentle aerial perspective: the outer sea keeps its swell and colour, meeting the card exactly
  float hz = smoothstep(uHorizonDist * 0.62, uHorizonDist * 0.998, fwdD);
  hz = pow(hz, 2.8);
  col = mix(col, hazeC, clamp(hz, 0.0, 1.0));

  if (uDebug > 0.5 && uDebug < 1.5) col = vec3(trail, live.r, live.g);
  if (uDebug > 1.5 && uDebug < 2.5) col = vec3(sdf.r, sdf.g, sdf.b);
  if (uDebug > 2.5 && uDebug < 3.5) col = body;
  if (uDebug > 3.5 && uDebug < 4.5) col = sky;
  if (uDebug > 4.5 && uDebug < 5.5) col = vec3(F * 4.0, hz, foam);
  if (uDebug > 5.5 && uDebug < 6.5) col = glint + beam;
  gl_FragColor = vec4(col, 1.0);
}`;
